/* =====================================================================================
 * Carte de commandement — QUI : l'unité que le jeu propose pour une ligne de fiche (logique pure).
 *
 *   proposeWho(ligne, lieu, env)   candidats classés, le meilleur d'abord :
 *     1. les unités déjà choisies par le joueur (liste Qui, U, T, Maj+clic, fiche d'unité), prises telles quelles ;
 *     2. sinon les unités sous ses ordres, ≥ 60 % d'agents valides, ni au poste ni en alerte (env.exclude), classées :
 *        libres d'abord (sans ordre, « libre », « cesser », ou « tenir » loin de toute foule), puis occupées, puis
 *        celles qui tiennent un barrage, enfin les unités affaiblies ; à rang égal, la plus adaptée puis la plus rapide :
 *          barrer, filtrer, ligne, se déplacer…  une section (jamais la compagnie, sauf T ; un groupe si aucune section
 *                                                n'est libre) ; une rue plus large que le front d'une section en reçoit
 *                                                deux (« Sections MISTRAL 1 et MISTRAL 2 ») ;
 *          interpeller                           la BRAV-M, sinon le groupe le plus proche ;
 *          pousser un véhicule                   le blindé Centaure libre le plus proche ;
 *          dégager une barricade                 le Centaure, sinon un groupe ;
 *          gaz                                   la section la plus proche qui a des grenades ;
 *          nasse                                 les unités choisies par l'aide « Encercler » (nasse.ts) ;
 *          incident                              le moyen de la ligne (MEANS_FOR), puis les unités du même genre ;
 *          fermer aux voitures                   « Personne : barrières seules » d'abord (U ajoute une unité) ;
 *     3. les renforts des commissariats (env.stationCandidates) viennent après : jamais proposés d'office
 *        (defaultWho les écarte, noUnitText le dit).
 *   wholeCandidate(lieu, env)      ce que T sélectionne : la compagnie, la section ou le groupe du joueur.
 *   whoEnvFromCore(core, …)        environnement lu dans la partie (barrages tenus, nasse, commandement).
 * ===================================================================================== */

import type { CardEnv, CardLine, CardUnit, Repere, WhoCandidate, WhoEnv } from './cardTypes';
import type { MapUnit } from '../maps/units';
import type { CommandCore } from './core';
import { travelOf } from './direct/travel';
import { minutesText } from './intents';
import { buildNasseProposal, holdingSquads, nasseCandidates } from './nasse';
import { FRONT_PER_AGENT, doingAt } from './orders';
import { unitTitle } from './reperes';
import { keyboardSections } from './tacticalKeys';

export type { WhoCandidate, WhoEnv } from './cardTypes';

/** Part minimale d'agents valides pour être proposée d'office. */
export const MIN_VALID_SHARE = 0.6;
/** Une unité qui « tient » à plus de cette distance (m) d'une foule est libre. */
const FREE_HOLD_DISTANCE = 120;
/** Au plus deux sections pour une rue large. */
const MAX_SECTIONS = 2;

/** Libellé du Qui de « Fermer aux voitures » sans unité. */
export const NOBODY_LABEL = 'Personne\u00a0: barrières seules';

// ───────────────────────────── outils ─────────────────────────────

/** Genre de candidat qu'attend une ligne. */
type WhoKind = 'none' | 'troupe' | 'interpeller' | 'obstacle' | 'barricade' | 'gaz' | 'nasse' | 'means' | 'any' | 'holder' | 'station';

/** Ordres sans unité désignée (ils s'adressent à l'unité du joueur). */
const SELF_ORDERS: ReadonlySet<string> = new Set(['suivre_pied', 'avec_moi']);

function whoKind(line: CardLine): WhoKind {
  const a = line.action;
  switch (a.kind) {
    case 'verb':
      if (SELF_ORDERS.has(String(a.type))) return 'none';
      if (a.type === 'interpeller') return 'interpeller';
      if (a.type === 'degager_obstacle') return 'obstacle';
      if (a.type === 'degager_barricade') return 'barricade';
      if (a.type === 'disperser_gaz') return 'gaz';
      return 'troupe';
    case 'nasse': return 'nasse';
    case 'means': return 'means';
    case 'assignOther': return 'any';
    case 'closeRoad': return 'holder';
    case 'metro': return a.op === 'filter' ? 'troupe' : 'none';
    case 'engage': return 'station';
    case 'sendElsewhere':
    case 'pickTarget':
      return 'troupe';
    default:
      return 'none';
  }
}

/** Ordres « libres » : l'unité attend un ordre. */
const IDLE_ORDERS: ReadonlySet<string> = new Set(['libre', 'cesser']);

function nearAnyCrowd(env: CardEnv, x: number, z: number, d: number): boolean {
  for (const c of env.crowds) if (c.people > 0 && Math.hypot(c.x - x, c.z - z) - Math.max(0, c.radius) < d) return true;
  return false;
}

/**
 * L'unité suit-elle le joueur (« avec vous » : « Avec moi », ou « tout le monde me suit » de la mise en place) ? Elle
 * attend ses ordres à ses côtés : libre (même définition que les ordres directs, direct/who.ts).
 */
function withPlayer(u: CardUnit, env: CardEnv): boolean {
  const o = u.order;
  if (!o) return false;
  if (o.type === 'avec_moi' || o.type === 'suivre_pied') return true;
  const pid = env.player?.personId ?? 0;
  return o.type === 'suivre' && pid !== 0 && o.targetId === pid;
}

/** Unité libre : sans ordre, « libre », « cesser », « avec vous », ou « tenir » loin de toute foule. */
export function isFree(u: CardUnit, env: CardEnv): boolean {
  const o = u.order;
  if (!o) return true;
  if (IDLE_ORDERS.has(String(o.type)) || withPlayer(u, env)) return true;
  return o.type === 'tenir' && !nearAnyCrowd(env, u.x, u.z, FREE_HOLD_DISTANCE);
}

/**
 * Délai (s), distance (m) et mode d'une unité jusqu'au point : la règle unique de direct/travel.ts (motorizes).
 * Patrouilles et engins roulent toujours ; la BRAV-M en selle roule au-delà de 60 m, à pied au-delà de 150 m ; une
 * unité à bord roule au-delà de 150 m, à pied au-delà de 450 m ; l'unité du joueur à pied n'embarque jamais.
 * `playerAboard` : le joueur est à bord (son unité peut alors rouler avec lui).
 */
export function travel(
  u: Pick<CardUnit, 'x' | 'z' | 'hasVehicles' | 'patrol' | 'symbol'> & { embarked?: boolean; hasPlayer?: boolean }, x: number, z: number,
  playerAboard = false,
): { eta: number; distance: number; mode: 'pied' | 'vehicules' } {
  return travelOf(u, x, z, playerAboard);
}

/** Le joueur est-il à bord d'un véhicule (son unité roule alors avec lui) ? */
function aboard(env: CardEnv): boolean {
  return env.player !== null && env.player.inVehicle;
}

/** « à pied · 180 m · ~2 min », « en véhicules · 2,3 km · ~6 min ». */
export function travelText(c: Pick<WhoCandidate, 'mode' | 'distance' | 'eta'>): string {
  const d = c.distance >= 1000 ? `${(c.distance / 1000).toFixed(1).replace('.', ',')}\u00a0km` : `${Math.round(c.distance / 10) * 10}\u00a0m`;
  return `${c.mode === 'vehicules' ? 'en véhicules' : 'à pied'} · ${d} · ~${minutesText(c.eta)}`;
}

function lowerFirst(s: string): string {
  return s === '' ? s : s.charAt(0).toLocaleLowerCase('fr-FR') + s.slice(1);
}

/**
 * L'unité (ou une de ses subordonnées) tient-elle une issue d'une nasse fermée ? L'envoyer ailleurs rouvre la nasse :
 * Qui le dit (« la quittera : la nasse s'ouvre »), au lieu d'un simple « la quittera ».
 */
function holdsClosedNasse(u: CardUnit, env: CardEnv): boolean {
  for (const c of env.crowds) {
    if (!c.closed) continue;
    for (const e of c.exits) {
      let id = e.squadId;
      for (let guard = 0; id > 0 && guard < 8; guard++) {
        if (id === u.squadId) return true;
        id = env.units.find((q) => q.squadId === id)?.parentId ?? 0;
      }
    }
  }
  return false;
}

/** Ce que fait déjà l'unité, en clair (« sans ordre », « barre la rue Royale (la quittera) »). */
export function busyText(u: CardUnit, env: CardEnv, holding: boolean): string {
  if (isFree(u, env)) return u.order && u.order.type === 'tenir' ? 'tient sa position' : withPlayer(u, env) ? 'avec vous' : 'sans ordre';
  const o = u.order!;
  const doing = lowerFirst(doingAt(o.type, u.orderPlace, o.targetId)) || 'ordre en cours';
  if (holdsClosedNasse(u, env)) return `${doing} (la quittera\u00a0: la nasse s’ouvre)`;
  return `${doing}${holding || !IDLE_ORDERS.has(String(o.type)) ? ' (la quittera)' : ''}`;
}

function candidateOf(u: CardUnit, x: number, z: number, env: CardEnv, holding: boolean): WhoCandidate {
  const t = travel(u, x, z, aboard(env));
  return { squadIds: [u.squadId], label: unitTitle(u), mode: t.mode, eta: t.eta, distance: t.distance, busy: busyText(u, env, holding) };
}

/** Rang d'adéquation (0 : le mieux) d'une unité pour un genre de ligne ; −1 : exclue. */
function fitness(kind: WhoKind, u: CardUnit, line: CardLine): { major: number; minor: number } | null {
  const s = u.symbol;
  switch (kind) {
    case 'troupe': {
      // barrer, tenir une ligne, se placer : des sections et des groupes ; une voiture de patrouille ou la BRAV-M
      // seulement s'il n'y a aucune section ni aucun groupe, même occupés (trois policiers ne barrent pas une rue)
      if (s === 'section') return { major: 0, minor: 0 };
      if (s === 'groupe') return { major: 0, minor: 1 };
      if (s === 'binome') return { major: 0, minor: 2 };
      if (s === 'bravm' || s === 'patrouille') return { major: 1, minor: 0 };
      return null;
    }
    case 'holder': {
      if (s === 'section') return { major: 0, minor: 0 };
      if (s === 'groupe') return { major: 0, minor: 1 };
      if (s === 'binome') return { major: 0, minor: 2 };
      if (s === 'bravm' || s === 'patrouille') return { major: 0, minor: 3 };
      return null;
    }
    case 'interpeller': {
      if (s === 'bravm') return { major: 0, minor: 0 };
      if (s === 'groupe' || s === 'binome') return { major: 1, minor: 0 };
      if (s === 'section') return { major: 1, minor: 1 };
      // trois policiers d'une voiture de patrouille n'entrent pas dans une foule pour interpeller : en dernier recours
      if (s === 'patrouille') return { major: 2, minor: 0 };
      return null;
    }
    case 'obstacle':
      return s === 'centaure' ? { major: 0, minor: 0 } : null;
    case 'barricade': {
      if (s === 'centaure') return { major: 0, minor: 0 };
      if (s === 'groupe') return { major: 1, minor: 0 };
      if (s === 'section') return { major: 1, minor: 1 };
      return null;
    }
    case 'gaz': {
      if (s !== 'section' && s !== 'groupe') return null;
      return { major: u.ammo > 0 ? 0 : 1, minor: s === 'section' ? 0 : 1 };
    }
    case 'means': {
      const a = line.action;
      if (a.kind !== 'means') return null;
      if (a.squadId !== undefined && a.squadId === u.squadId) return { major: -1, minor: 0 };
      const want = a.means === 'unite' ? ['section', 'groupe', 'binome'] : a.means === 'canon_eau' ? ['canon_eau'] : a.means === 'centaure' ? ['centaure'] : a.means === 'bravm' ? ['bravm'] : [];
      const i = want.indexOf(s);
      return i >= 0 ? { major: 0, minor: i } : null;
    }
    case 'any': {
      if (s === 'compagnie' || s === 'drone' || s === 'pompiers' || s === 'samu') return null;
      const order = ['groupe', 'section', 'binome', 'bravm', 'centaure', 'canon_eau', 'patrouille', 'vehicule'];
      const i = order.indexOf(s);
      return { major: 0, minor: i >= 0 ? i : order.length };
    }
    default:
      return null;
  }
}

/** Largeur de la voie au lieu (issue de foule, sinon voie nommée), 0 si inconnue. */
function streetWidth(where: Repere, env: CardEnv): number {
  if (where.kind === 'rue' && where.crowdKey !== undefined) {
    const c = env.crowds.find((q) => q.key === where.crowdKey);
    const e = c?.exits.find((q) => (where.roadEdge !== undefined && where.roadEdge >= 0 ? q.edgeId === where.roadEdge : Math.hypot(q.x - where.x, q.z - where.z) < 5));
    if (e && e.width > 0) return e.width;
  }
  const r = env.roadAt(where.x, where.z, 40);
  return r ? r.width : 0;
}

/** Ordres qui tiennent une rue d'une façade à l'autre (une rue large reçoit deux sections). */
const STREET_WIDE: ReadonlySet<string> = new Set(['couper_circulation', 'filtrer', 'ligne']);

function wideStreetLine(line: CardLine, where: Repere): boolean {
  const a = line.action;
  return a.kind === 'verb' && STREET_WIDE.has(String(a.type)) && (a.geom === 'street' || (a.geom === 'autoLine' && where.kind === 'rue'));
}

interface Ranked {
  u: CardUnit;
  tier: number;
  major: number;
  minor: number;
  eta: number;
  holding: boolean;
}

/** Unités classées pour une ligne (sans la sélection du joueur ni les renforts). */
function rankUnits(kind: WhoKind, line: CardLine, where: Repere, env: WhoEnv): Ranked[] {
  const card = env.card;
  const out: Ranked[] = [];
  for (const u of card.units) {
    if (!u.mine || u.squadId <= 0 || u.valid <= 0 || !env.canCommand(u.squadId)) continue;
    if (env.exclude && env.exclude(u.squadId)) continue;
    // binôme d'un groupe BRAV-M que je commande : c'est le groupe qui roule à moto, constate et interpelle (le binôme
    // seul n'irait qu'à pied, et refuserait faute de fait constaté sous ses yeux) — on propose le groupe
    if (u.symbol === 'bravm' && u.parentId > 0) {
      const parent = card.units.find((q) => q.squadId === u.parentId);
      if (parent && parent.symbol === 'bravm' && parent.mine && env.canCommand(parent.squadId)) continue;
    }
    const fit = fitness(kind, u, line);
    if (!fit) continue;
    const holding = env.holding.has(u.squadId);
    const weak = u.total > 0 && u.valid / u.total < MIN_VALID_SHARE;
    const tier = weak ? 3 : holding ? 2 : isFree(u, card) ? 0 : 1;
    out.push({ u, tier, major: fit.major, minor: fit.minor, eta: travel(u, where.x, where.z, aboard(card)).eta, holding });
  }
  out.sort((a, b) => a.major - b.major || a.tier - b.tier || a.minor - b.minor || a.eta - b.eta || a.u.squadId - b.u.squadId);
  return out;
}

/** Candidat des unités choisies par le joueur (prises telles quelles). */
function selectionCandidate(where: Repere, env: WhoEnv): WhoCandidate {
  const ids = env.selection.slice();
  const units = ids.map((id) => env.card.units.find((u) => u.squadId === id)).filter((u): u is CardUnit => u !== undefined);
  let eta = 0, distance = 0;
  let vehicles = false;
  for (const u of units) {
    const t = travel(u, where.x, where.z, aboard(env.card));
    if (t.eta > eta) eta = t.eta;
    if (t.distance > distance) distance = t.distance;
    if (t.mode === 'vehicules') vehicles = true;
  }
  const label = units.length === 1 ? unitTitle(units[0]!) : `${ids.length} unités choisies`;
  const busy = units.length === 1 ? busyText(units[0]!, env.card, env.holding.has(units[0]!.squadId)) : 'votre choix';
  return { squadIds: ids, label, mode: vehicles ? 'vehicules' : 'pied', eta, distance, busy };
}

// ───────────────────────────── API ─────────────────────────────

/**
 * Candidats pour une ligne de fiche au lieu `where`, le meilleur d'abord. Vide quand la ligne ne s'adresse à aucune
 * unité (secours, métro, proposition, « Suivez-moi »…). La sélection du joueur passe toujours en tête.
 */
export function proposeWho(line: CardLine, where: { x: number; z: number } | Repere, env: WhoEnv): WhoCandidate[] {
  const r: Repere = 'kind' in where ? where : { kind: 'point', key: '', x: where.x, z: where.z, name: '' };
  const kind = whoKind(line);
  if (kind === 'none') return [];
  const out: WhoCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: WhoCandidate): void => {
    const k = c.squadIds.slice().sort((a, b) => a - b).join(',') + (c.fromStation !== undefined ? `@${c.fromStation}` : '');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  if (kind === 'station') {
    const a = line.action;
    const entry = a.kind === 'engage' ? a.entryId : -1;
    for (const c of env.stationCandidates?.(r) ?? []) if (c.fromStation === entry) add(c);
    return out;
  }
  if (env.selection.length > 0 && kind !== 'nasse') add(selectionCandidate(r, env));
  if (kind === 'holder') add({ squadIds: [], label: NOBODY_LABEL, mode: 'pied', eta: 0, distance: 0, busy: '' });
  if (kind === 'nasse') {
    if (env.selection.length > 0) add(selectionCandidate(r, env));
    const key = r.crowdKey ?? '';
    const n = key !== '' && env.nasse ? env.nasse(key) : null;
    if (n && n.squadIds.length > 0) {
      let eta = 0, distance = 0;
      for (const id of n.squadIds) {
        const u = env.card.units.find((q) => q.squadId === id);
        if (!u) continue;
        const t = travel(u, r.x, r.z, aboard(env.card));
        eta = Math.max(eta, t.eta);
        distance = Math.max(distance, t.distance);
      }
      add({ squadIds: n.squadIds.slice(), label: n.label, mode: 'pied', eta, distance, busy: 'une unité par rue' });
    }
    return out;
  }
  const ranked = rankUnits(kind, line, r, env);
  // rue plus large que le front de la première section libre : deux sections
  if (ranked.length > 0 && wideStreetLine(line, r)) {
    const first = ranked[0]!;
    const width = streetWidth(r, env.card);
    if (first.u.symbol === 'section' && first.tier === 0 && width > first.u.valid * FRONT_PER_AGENT) {
      const second = ranked.find((q) => q !== first && q.u.symbol === 'section' && q.tier === 0);
      if (second) {
        const a = candidateOf(first.u, r.x, r.z, env.card, false);
        const b = candidateOf(second.u, r.x, r.z, env.card, false);
        add({
          squadIds: [first.u.squadId, second.u.squadId].slice(0, MAX_SECTIONS), label: `Sections ${first.u.name} et ${second.u.name}`,
          mode: a.mode === 'vehicules' || b.mode === 'vehicules' ? 'vehicules' : 'pied', eta: Math.max(a.eta, b.eta),
          distance: Math.max(a.distance, b.distance), busy: `rue de ${Math.round(width)}\u00a0m\u00a0: 2 sections`,
        });
      }
    }
  }
  for (const q of ranked) {
    // le gaz : une unité entraînée dans la formation d'une autre (sections de la compagnie au départ) n'emploie que
    // la force permise par l'ordre de cette formation — la simulation refuserait (« cadre légal non réuni ») ; on
    // propose alors la formation elle-même, qui reçoit l'ordre et fait lancer ses grenadiers
    if (kind === 'gaz' && env.forceRoot) {
      const a = line.action;
      const force = a.kind === 'verb' ? (a.type === 'disperser_gaz' ? 3 : 0) : 0;
      const rootId = env.forceRoot(q.u.squadId, force);
      if (rootId !== q.u.squadId) {
        const root = env.card.units.find((u) => u.squadId === rootId);
        if (root && root.mine && env.canCommand(rootId)) add(candidateOf(root, r.x, r.z, env.card, env.holding.has(rootId)));
        continue;
      }
    }
    add(candidateOf(q.u, r.x, r.z, env.card, q.holding));
  }
  // renforts des commissariats : après mes unités, jamais d'office
  if (kind === 'troupe' || kind === 'interpeller' || kind === 'any') {
    for (const c of env.stationCandidates?.(r) ?? []) add(c);
  }
  return out;
}

/** Candidat retenu d'office : le premier qui n'est pas un renfort de commissariat (null s'il n'y en a pas). */
export function defaultWho(list: readonly WhoCandidate[]): WhoCandidate | null {
  for (const c of list) if (c.fromStation === undefined) return c;
  return null;
}

/**
 * Qui après `index` appuis sur U (négatif : Maj+U). 0 : le candidat d'office. Sans unité à moi (que des renforts de
 * commissariat), le premier U donne le renfort que nomme noUnitText (« renfort possible : TV 75-19 : U »), pas le suivant.
 */
export function whoAt(list: readonly WhoCandidate[], index: number): WhoCandidate | null {
  const n = list.length;
  if (n === 0) return null;
  const first = defaultWho(list);
  if (index === 0) return first;
  const k = first ? index : index > 0 ? index - 1 : index;
  return list[((k % n) + n) % n]!;
}

/**
 * Ligne Qui quand aucune de mes unités ne convient : « Aucune unité libre — renfort possible : TV 75-19 (…) : U »,
 * ou « Aucune unité libre » sans renfort ; '' s'il y a une unité à proposer.
 */
export function noUnitText(list: readonly WhoCandidate[]): string {
  if (defaultWho(list)) return '';
  const st = list.find((c) => c.fromStation !== undefined);
  if (!st) return 'Aucune unité libre';
  return `Aucune unité libre — renfort possible\u00a0: ${st.label} (~${minutesText(st.eta)})\u00a0: U`;
}

/** Ce que T sélectionne : le commandement entier du joueur (compagnie, section ou groupe), null s'il n'en a pas. */
export function wholeCandidate(where: { x: number; z: number }, env: WhoEnv): WhoCandidate | null {
  const w = env.whole;
  if (!w || w.squadIds.length === 0) return null;
  let eta = 0, distance = 0, agents = 0;
  let vehicles = false;
  let withPlayer = false;
  for (const id of w.squadIds) {
    const u = env.card.units.find((q) => q.squadId === id);
    if (!u) continue;
    const t = travel(u, where.x, where.z, aboard(env.card));
    eta = Math.max(eta, t.eta);
    distance = Math.max(distance, t.distance);
    if (t.mode === 'vehicules') vehicles = true;
    withPlayer = withPlayer || (u.hasPlayer === true && t.mode === 'vehicules');
    agents += u.valid;
  }
  const out: WhoCandidate = { squadIds: w.squadIds.slice(), label: w.label, mode: vehicles ? 'vehicules' : 'pied', eta, distance, busy: `${agents} agents` };
  // le commandant à pied fait partie de la colonne : elle l'attend pour partir (convoy.ts awaitPlayer)
  if (withPlayer && env.card.player && !env.card.player.inVehicle) out.waitsForYou = true;
  return out;
}

/** Libellé du bouton T selon ce qu'il sélectionne (« Toute la compagnie », « Toute la section », « Tout le groupe »). */
export function wholeLabel(command: CardEnv['command']): string {
  return command === 'compagnie' ? 'Toute la compagnie' : command === 'section' ? 'Toute la section' : 'Tout le groupe';
}

// ───────────────────────────── lecture de la partie ─────────────────────────────

/**
 * Unités de base de l'aide « Encercler » : mes sections (une rue chacune ; jamais la compagnie entière sur une seule
 * rue), à défaut le niveau des touches de sections ; nasseCandidates y ajoute les autres unités libres (BRAV-M…).
 */
export function nasseSections(core: CommandCore, canCommand: (squadId: number) => boolean): MapUnit[] {
  const units = core.maps.scene.units;
  const sections = units.filter((u) => u.symbol === 'section' && u.squadId > 0 && canCommand(u.squadId));
  return sections.length > 0 ? sections : keyboardSections(units, canCommand);
}

/**
 * Environnement de Qui lu dans la partie : barrages tenus, unités de la nasse (nasse.ts), commandement entier du
 * joueur pour T. `exclude` et `stationCandidates` : module des commissariats (facultatifs).
 */
export function whoEnvFromCore(
  core: CommandCore, card: CardEnv, selection: readonly number[],
  ext: { exclude?: (squadId: number) => boolean; stationCandidates?: (where?: { x: number; z: number }) => WhoCandidate[] } = {},
): WhoEnv {
  const scene = core.maps.scene;
  const canCommand = (id: number): boolean => core.canCommand(id) && !(ext.exclude && ext.exclude(id));
  const holding = holdingSquads(scene.barrages);
  const sc = core.scope();
  let whole: WhoEnv['whole'] = null;
  if (sc.level !== 'lecture') {
    const label = wholeLabel(card.command);
    if (sc.ownSquadId !== 0 && core.canCommand(sc.ownSquadId)) whole = { squadIds: [sc.ownSquadId], label };
    else {
      const tops = keyboardSections(scene.units, canCommand);
      if (tops.length > 0) whole = { squadIds: tops.map((u) => u.squadId), label };
    }
  }
  const env: WhoEnv = {
    card, selection, whole, holding, canCommand,
    nasse: (key) => {
      const crowd = scene.crowdExits.find((c) => c.key === key);
      if (!crowd) return null;
      const p = buildNasseProposal(crowd, nasseCandidates(core, [], nasseSections(core, canCommand)).filter((u) => canCommand(u.squadId)), holding);
      if (p.lines.length === 0) return null;
      const n = p.lines.length;
      const left = p.openLeft > 0 ? ` — ${p.openLeft} rue${p.openLeft > 1 ? 's resteront ouvertes' : ' restera ouverte'}` : '';
      return { squadIds: p.lines.map((l) => l.squadId), label: `${n} unité${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''} par le jeu${left}` };
    },
  };
  if (ext.exclude) env.exclude = ext.exclude;
  if (ext.stationCandidates) env.stationCandidates = ext.stationCandidates;
  const units = core.ctx.service<{ rootOf(squadId: number): number }>('police.units');
  if (units && typeof units.rootOf === 'function') {
    env.forceRoot = (id, force) => {
      const rootId = units.rootOf(id);
      if (rootId === 0 || rootId === id) return id;
      const root = core.ctx.squads.get(rootId);
      return !root || root.order.maxForce >= force ? id : rootId;
    };
  }
  return env;
}
