/* =====================================================================================
 * État partagé de la carte de commandement : visée, intention, fiche ouverte, Qui, feuille ouverte, dernier ordre
 * donné ; plus l'état historique de la carte (sélection, mode d'un geste expert, éléments mis en avant) que la carte
 * et les panneaux lisent encore. Toute modification passe par touch() : l'écran se rafraîchit à l'image suivante.
 *
 * Fonctions pures de l'écran (testées sans DOM) : pastille légale, fiche « ordre d'abord » (Plus… › Tous les ordres),
 * Qui imposé, « À traiter » par défaut, bandeau et cadrage de la carte en lecture seule.
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import type { MissionBrief } from '@/gameplay/session/mission-api';
import type { CommandLevel, TacticalTab } from './api';
import type { Card, CardEnv, CardLine, IntentId, LegalStatus, Repere, VerbGeom, WhoCandidate } from './cardTypes';
import { compareCardIncidents, etaFor, verbLine } from './intents';
import type { OrderVerb } from './orders';
import { verbOf } from './orders';
import { crowdRepere, incidentOpen, incidentRepere } from './reperes';
import type { Sheet } from './tacticalKeys';

export type TacticalMode =
  | { kind: 'idle' }
  | { kind: 'order'; verb: OrderVerb }
  | { kind: 'close_road' }
  | { kind: 'close_area' }
  | { kind: 'rescue'; rescue: RescueKind; incidentId: number };

export const IDLE: TacticalMode = { kind: 'idle' };

/** Vue minimale lue et réglée par tacticalFrame (MapTransform de src/ui/maps/transform.ts). */
export interface FrameView {
  mpp: number;
  fitBounds(minX: number, minZ: number, maxX: number, maxZ: number, paddingPx?: number): void;
  setMpp(mpp: number): void;
  setCenter(x: number, z: number): void;
}

/**
 * Cadrage à l'ouverture de la carte tactique : le rectangle des unités (et du joueur), à une échelle bornée.
 * Quand les unités sont éparpillées dans tout Paris (patrouilles, foyers secondaires : cas d'un équipier en
 * lecture seule, qui voit tout le monde), l'échelle plafonnée ne montre qu'une partie du rectangle : on centre
 * alors sur le joueur au lieu du milieu du rectangle, qui tombait loin de lui (il ne se trouvait plus sur la carte).
 */
export function tacticalFrame(
  v: FrameView, minX: number, minZ: number, maxX: number, maxZ: number, player: { x: number; z: number } | null,
  minMpp: number, maxMpp: number, paddingPx = 90,
): void {
  v.fitBounds(minX, minZ, maxX, maxZ, paddingPx);
  const fitted = v.mpp;
  v.setMpp(Math.min(maxMpp, Math.max(minMpp, fitted)));
  if (player && fitted > maxMpp * 1.001) v.setCenter(player.x, player.z);
}

/**
 * Carte en lecture seule (CRS, gardien…) : cadrée sur le joueur et sa destination (le point de l'ordre reçu), sinon
 * sur le joueur seul. Le joueur reste toujours sur la carte.
 */
export function readOnlyFrame(v: FrameView, me: { x: number; z: number }, dest: { x: number; z: number } | null, minMpp = 0.45, maxMpp = 2.2): void {
  if (!dest) {
    v.setCenter(me.x, me.z);
    v.setMpp(Math.min(maxMpp, Math.max(minMpp, 0.9)));
    return;
  }
  tacticalFrame(v, Math.min(me.x, dest.x), Math.min(me.z, dest.z), Math.max(me.x, dest.x), Math.max(me.z, dest.z), me, minMpp, maxMpp, 70);
}

/**
 * Repères empilés sous un clic, tels que la fiche les montre en onglets : un seul par nom (sur une place, une dizaine
 * de rues d'issue portent le même), au plus 3 — le plus prioritaire d'abord (pickAt).
 */
export function stackOf(list: readonly Repere[], max = 3): Repere[] {
  const out: Repere[] = [];
  const names = new Set<string>();
  for (const r of list) {
    const name = r.name.split(' — ')[0]!.trim().toLocaleLowerCase('fr-FR');
    if (names.has(name)) continue;
    names.add(name);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

// ───────────────────────────── état de l'écran ─────────────────────────────

export type TacticalSheet = Sheet;
export type TacticalInput = 'keys' | 'pointer' | 'touch';

/** Fiche ouverte : le repère, la ligne surlignée, « Autres ordres ici… » déplié, les repères empilés sous le clic. */
export interface CardState {
  repere: Repere;
  /** Ligne surlignée (dans `lines`, ou dans `others` quand `othersOpen`). */
  line: number;
  othersOpen: boolean;
  /** Repères empilés sous le clic (onglets « Rue Royale | Foule »), `[repere]` par défaut. */
  stack: Repere[];
  /** « Plus… › Tous les ordres » : la fiche s'ouvre sur cet ordre seul, surligné (null : fiche ordinaire). */
  verb: OrderType | null;
  /** La ligne a été choisie par le joueur (↑↓, chiffre, survol) : un rafraîchissement ne la change plus. */
  chosen: boolean;
}

/**
 * « OÙ L'ENVOYER ? » : Qui est déjà fixé (« L'envoyer ailleurs… », unité d'un commissariat, « Protéger une autre
 * unité… ») et le joueur choisit le lieu (ou l'unité à couvrir) ; `verb` : l'ordre mis en avant sur la fiche du lieu.
 */
export interface PendingWhere {
  who: WhoCandidate;
  verb: OrderType | null;
  /** Désigner une unité (protéger, escorter, suivre) plutôt qu'un lieu. */
  target: boolean;
  /** En-tête de la fiche (« OÙ L'ENVOYER ? », « QUI PROTÉGER ? »). */
  title: string;
}

/** Ordre qui vient de partir (S4) : texte, unités (pour « Annuler l'ordre »), échéances. */
export interface SentState {
  squads: number[];
  text: string;
  /** Instant de l'envoi (horloge de l'écran, s). */
  at: number;
  /** « Annuler l'ordre » possible (ordre donné à des unités). */
  undo: boolean;
}

/** Vue en lecture de l'état (types exportés pour les modules qui se branchent sur l'écran). */
export interface TacticalStateView {
  readonly visee: Repere | null;
  readonly intent: IntentId | null;
  readonly card: CardState | null;
  readonly who: WhoCandidate | null;
  readonly sheet: Sheet;
  readonly lastInput: TacticalInput;
}

export class TacticalState implements TacticalStateView {
  /** Clés des unités sélectionnées (MapUnit.key = identifiant d'unité) : Qui choisi à la main (Maj + clic, liste). */
  readonly selection = new Set<number>();
  /** Mode d'un geste expert de la carte (ligne tracée, cadre) ; 'idle' le reste du temps. */
  mode: TacticalMode = IDLE;
  /** Outil de la carte : main (déplacer) ou cadre de sélection (Maj + glisser). */
  tool: 'main' | 'box' = 'main';
  multi = false;
  /** Section de « Plus… » ouverte (ancien onglet). */
  tab: TacticalTab = 'ordres';
  leftOpen = true;
  rightOpen = true;
  focusIncident = 0;
  focusStation = 0;
  focusClosure = 0;
  /** Foule mise en avant sur la carte (clé de SceneCrowdExits) : ses issues sont dessinées ; '' : aucune. */
  focusCrowd = '';
  hoverKey = 0;
  dropKey = 0;
  /**
   * Ancienne option « Passants : laissés passer » de « Barrer la rue » : toujours faux (la fiche d'une rue propose
   * « Barrer la rue, passants admis » en ligne explicite). Lue par TacticalMap.issuePoint.
   */
  passersby = false;

  // ── carte de commandement ──
  /** Repère sous la visée (réticule jaune) ; null : aucun. */
  visee: Repere | null = null;
  /** Repère accroché par le pointeur (survol) : son nom suit le pointeur. */
  hover: Repere | null = null;
  intent: IntentId | null = null;
  /** Repères que ←/→ parcourent (intention active, choix d'un lieu) et rang de la visée parmi eux. */
  candidates: Repere[] = [];
  candIndex = 0;
  card: CardState | null = null;
  /** Qui affiché pour la ligne surlignée (proposé par le jeu ou choisi). */
  who: WhoCandidate | null = null;
  /** Qui est celui du jeu (faux : U, T, la liste ou un Maj + clic l'ont changé). */
  whoAuto = true;
  /** Rang du Qui proposé parmi les candidats du jeu (U / Maj + U). */
  whoIndex = 0;
  /** T : toute la compagnie (la section, le groupe) du joueur. */
  whole = false;
  /** Liste Qui : rangée surlignée et rangées cochées (Espace). */
  whoListIndex = 0;
  readonly whoTicks = new Set<number>();
  where: PendingWhere | null = null;
  sheet: Sheet = 'none';
  /** Rangée surlignée d'une liste (Plus…, Cadre légal, Suivi). */
  listIndex = 0;
  lastSent: SentState | null = null;
  /** Instant du dernier envoi (garde de 0,6 s sur Entrée). */
  sentAt = -Infinity;
  lastInput: TacticalInput = 'keys';
  dirty = true;
  revision = 0;

  touch(): void {
    this.dirty = true;
    this.revision++;
  }

  select(key: number, additive: boolean): void {
    if (!additive) {
      if (this.selection.size === 1 && this.selection.has(key)) return;
      this.selection.clear();
      this.selection.add(key);
    } else if (this.selection.has(key)) this.selection.delete(key);
    else this.selection.add(key);
    this.whoAuto = this.selection.size === 0;
    this.touch();
  }

  setSelection(keys: Iterable<number>): void {
    this.selection.clear();
    for (const k of keys) this.selection.add(k);
    this.touch();
  }

  clearSelection(): void {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.touch();
  }

  /** Ancienne bascule des passants : sans effet (toujours « bloqués ») ; conservée pour l'API. */
  togglePassersby(): boolean {
    this.passersby = false;
    this.touch();
    return false;
  }

  setMode(mode: TacticalMode): void {
    this.mode = mode;
    this.touch();
  }

  setTab(tab: TacticalTab, open = true): void {
    this.tab = tab;
    if (open) this.rightOpen = true;
    this.touch();
  }

  /** Ouvre la fiche d'un repère (la visée s'y pose). `line` < 0 : la ligne par défaut de la fiche. */
  openCard(r: Repere, stack: readonly Repere[] = [r], verb: OrderType | null = null, line = -1): void {
    this.visee = r;
    this.card = { repere: r, line: Math.max(0, line), othersOpen: false, stack: stack.length > 0 ? stack.slice() : [r], verb, chosen: line >= 0 };
    this.resetWho();
    if (this.sheet !== 'qui' && this.sheet !== 'confirm') this.sheet = 'card';
    this.touch();
  }

  /** Referme la fiche (et la liste Qui, la confirmation) ; l'intention et la visée restent. */
  closeCard(): void {
    this.card = null;
    if (this.sheet === 'card' || this.sheet === 'qui' || this.sheet === 'confirm') this.sheet = 'none';
    this.resetWho();
    this.clearSelection();
    this.touch();
  }

  /** Qui revient à la proposition du jeu. */
  resetWho(): void {
    this.whoAuto = true;
    this.whoIndex = 0;
    this.whole = false;
    this.whoTicks.clear();
    this.whoListIndex = 0;
  }

  /** Retour au repos : ni fiche, ni intention, ni choix de lieu en attente. */
  rest(): void {
    this.intent = null;
    this.where = null;
    this.candidates = [];
    this.candIndex = 0;
    this.closeCard();
  }
}

// ───────────────────────────── pastille légale ─────────────────────────────

/** Force en un ou deux mots pour la pastille (le détail est dans « Cadre légal »). */
const CHIP_FORCE: readonly string[] = ['aucune force', 'mains nues', 'bâton et gazeuse', 'gaz', 'grenades', 'arme à feu'];

export function chipForce(level: number): string {
  const l = Number.isFinite(level) ? Math.max(0, Math.min(CHIP_FORCE.length - 1, Math.round(level))) : 0;
  return CHIP_FORCE[l]!;
}

export interface LegalChip {
  text: string;
  /** Couleur : gris (rien en attente), orange (force autorisée au-delà de ce que la loi permet), vert (sommations
   * faites), bleu (chaîne légale en cours). */
  tone: 'neutral' | 'warn' | 'ok' | 'chain';
}

/**
 * Texte de la pastille légale du bandeau (§7.1) : « ⚖ Sommations 0/3 · Force : mains nues ». Téléphone : « ⚖
 * Sommations 0/3 ». Chef de groupe (sans pouvoir d'autoriser) : « ⚖ Force : mains nues (fixée par le commandant) ».
 * Pendant la chaîne légale : « ⚖ Sommation 2/3 dans 8 s ». Jamais un niveau de force en chiffre.
 */
export function legalChip(s: {
  sommations: number; lawful: ForceLevel; authorised: ForceLevel; canAuthorize: boolean; level: CommandLevel; compact: boolean;
  chain: LegalStatus | null;
}): LegalChip {
  const c = s.chain;
  if (c && (c.stage === 'sommation' || c.stage === 'autorisation' || c.stage === 'attente' || c.stage === 'ordre')) {
    if (c.stage === 'sommation') {
      const n = Math.min(3, Math.max(1, c.sommation + 1));
      const wait = Math.max(0, Math.ceil(c.nextIn));
      return { text: wait > 0 ? `⚖ Sommation ${n}/3 dans ${wait} s` : `⚖ Sommation ${n}/3`, tone: 'chain' };
    }
    if (c.stage === 'autorisation') return { text: '⚖ Autorisation de la force…', tone: 'chain' };
    return { text: '⚖ Ordre légal en préparation', tone: 'chain' };
  }
  const force = chipForce(s.authorised);
  if (s.level !== 'lecture' && !s.canAuthorize) {
    return { text: `⚖ Force : ${force} (fixée par le commandant)`, tone: s.authorised > s.lawful ? 'warn' : 'neutral' };
  }
  const n = Math.max(0, Math.min(3, Math.round(s.sommations)));
  const som = n >= 3 ? 'Sommations faites' : `Sommations ${n}/3`;
  const over = s.authorised > s.lawful;
  if (s.compact) return { text: `⚖ ${som}`, tone: over ? 'warn' : n >= 3 ? 'ok' : 'neutral' };
  return { text: `⚖ ${som} · Force : ${force}${over ? ' ⚠' : ''}`, tone: over ? 'warn' : n >= 3 ? 'ok' : 'neutral' };
}

// ───────────────────────────── fiches : ordre d'abord, Qui imposé ─────────────────────────────

/** Géométrie d'un ordre choisi dans « Tous les ordres » (d'après son geste). */
export function geomOfVerb(type: OrderType): VerbGeom {
  const v = verbOf(type);
  if (!v) return 'point';
  switch (v.gesture) {
    case 'immediate': return 'immediate';
    case 'line': return 'autoLine';
    case 'area': return 'circle';
    case 'target': return 'target';
    default: return 'point';
  }
}

function lineHasVerb(l: CardLine, type: OrderType): boolean {
  return l.action.kind === 'verb' && l.action.type === type;
}

/**
 * Fiche « ordre d'abord » (« Plus… › Tous les ordres », « Se replier… », « Protéger une autre unité… ») : la ligne de
 * cet ordre est parmi les six et surlignée ; si la fiche du repère ne la propose pas, elle est construite au repère
 * (`targetId` : entité à couvrir pour protéger / escorter / suivre). La fiche n'est pas modifiée (copie).
 */
export function withVerbFirst(card: Card, type: OrderType, env: CardEnv, targetId?: number): Card {
  const lines = card.lines.slice();
  const others = card.others.slice();
  let i = lines.findIndex((l) => lineHasVerb(l, type));
  if (i < 0) {
    const j = others.findIndex((l) => lineHasVerb(l, type));
    let line: CardLine | null = j >= 0 ? others.splice(j, 1)[0]! : null;
    if (!line) {
      const r = card.repere;
      line = verbLine(env, type, geomOfVerb(type), r.x, r.z, targetId !== undefined ? { targetId } : {});
    }
    if (!line) return card;
    lines.unshift(line);
    if (lines.length > 6) others.unshift(lines.pop()!);
    i = 0;
  }
  return { ...card, lines, others, defaultLine: i };
}

/** Qui imposé (fiche d'une unité, « L'envoyer ailleurs… », unité choisie dans la liste) : délai jusqu'au lieu `to`. */
export function fixedCandidate(env: Pick<CardEnv, 'units'> & Partial<Pick<CardEnv, 'player'>>, squadIds: readonly number[], to: { x: number; z: number }, label = ''): WhoCandidate {
  let eta = 0;
  let withPlayer = false;
  let distance = 0;
  let vehicles = false;
  const names: string[] = [];
  let busy = '';
  for (const id of squadIds) {
    const u = env.units.find((q) => q.squadId === id);
    if (!u) continue;
    names.push(u.name);
    // (le joueur à bord : l'unité qui le contient part en véhicules, comme l'envoi le fera — ui/command/core.ts drivesTo)
    const e = etaFor(u, to.x, to.z, u.hasPlayer === true && !!env.player && env.player.inVehicle);
    if (e.eta > eta) eta = e.eta;
    if (e.distance > distance) distance = e.distance;
    vehicles = vehicles || e.vehicles;
    withPlayer = withPlayer || (u.hasPlayer === true && e.vehicles);
    if (squadIds.length === 1) busy = u.order ? 'a déjà un ordre (le quittera)' : 'sans ordre';
  }
  const out: WhoCandidate = {
    squadIds: squadIds.slice(), label: label !== '' ? label : names.length > 0 ? names.join(', ') : 'Unité',
    mode: vehicles ? 'vehicules' : 'pied', eta, distance, busy,
  };
  // T (toute la compagnie) : le commandant à pied fait partie de la colonne, elle l'attend pour partir
  if (withPlayer && env.player && !env.player.inVehicle) out.waitsForYou = true;
  return out;
}

// ───────────────────────────── « À traiter » ─────────────────────────────

/**
 * « À traiter » (Espace) : au plus `max` repères, les incidents dont personne ne s'occupe d'abord (urgence, âge),
 * puis la proposition de l'adjoint, puis les nasses fermées.
 */
export function todoReperes(env: Pick<CardEnv, 'incidents' | 'proposals' | 'crowds'>, max = 3): Repere[] {
  const out: Repere[] = [];
  const inc = env.incidents.filter((i) => incidentOpen(i.state) && i.state === 'ouvert').slice().sort(compareCardIncidents);
  for (const i of inc) out.push(incidentRepere(i));
  for (const p of env.proposals) {
    if (p.x === 0 && p.z === 0) continue;
    out.push({ kind: 'proposition', key: `proposition:${p.id}`, x: p.x, z: p.z, proposalId: p.id, name: 'Proposition de l’adjoint' });
  }
  for (const c of env.crowds) if (c.closed) out.push(crowdRepere(c));
  return out.slice(0, max);
}

// ───────────────────────────── lecture seule ─────────────────────────────

/** Rue raccourcie pour le téléphone : « Avenue » → « Av. », « Boulevard » → « Bd ». */
export function shortStreet(place: string): string {
  return place
    .replace(/\bAvenue\b/g, 'Av.').replace(/\bavenue\b/g, 'av.')
    .replace(/\bBoulevard\b/g, 'Bd').replace(/\bboulevard\b/g, 'bd')
    .replace(/\bPlace\b/g, 'Pl.').replace(/\bplace\b/g, 'pl.');
}

/** Flèche (8 directions) d'un déplacement à l'écran (dx vers la droite, dy vers le bas). */
export function arrowChar(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 1e-6) return '';
  const a = Math.atan2(dx, -dy); // 0 = haut, sens horaire
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][i]!;
}

/** Distance en clair (« 235 m », « 1,2 km »). */
export function distanceText(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('fr-FR')} km`;
}

/** « ORDRE DU COMMANDANT » d'après qui a donné l'ordre (« Commandant Carlier ») ; à défaut l'indicatif. */
export function issuerTitle(by: string, from: string): string {
  const word = by.trim().split(/\s+/)[0] ?? '';
  if (word !== '' && /^[A-ZÉÈ]/.test(word)) {
    const w = word.toLocaleUpperCase('fr-FR');
    return /^[AEIOUYÉÈ]/.test(w) ? `ORDRE DE L’${w}` : `ORDRE DU ${w}`;
  }
  return from.trim() !== '' ? `ORDRE DE ${from.trim().toLocaleUpperCase('fr-FR')}` : 'ORDRE REÇU';
}

/** Durée écoulée en clair (« il y a 1 min », « à l'instant »). */
export function agoText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 45) return 'à l’instant';
  return `il y a ${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Bandeau de la carte en lecture seule (§2.9) : « ORDRE DU COMMANDANT : Tenir la ligne — Avenue de la République ·
 * 235 m ↗ » / « Donné il y a 1 min à votre groupe MISTRAL 1 ALFA. Suivez : Brigadier-chef Camara (5 m). ». Téléphone :
 * deux lignes courtes (« Ordre : Tenir la ligne · Av. de la République · 235 m ↗ » / « Suivez Camara · 5 m »), l'ordre
 * jamais coupé (la rue est raccourcie d'abord). `arrow` : flèche vers la destination à l'écran.
 */
/** Appel de CENTRAL pris par l'équipage du joueur (mode Patrouille), montré par la carte en lecture seule. */
export interface ReadOnlyCall {
  label: string;
  place: string;
  x: number;
  z: number;
  /** L'équipage est sur place. */
  onSite: boolean;
  /** Distance du joueur à l'appel (m), si connue. */
  distance?: number;
}

export function readOnlyBanner(
  b: Pick<MissionBrief, 'command' | 'chief' | 'regroup' | 'instruction'> | null, now: number, compact: boolean, arrow: string,
  call: ReadOnlyCall | null = null,
): { line1: string; line2: string } {
  const c = b?.command ?? null;
  const chief = b?.chief ?? null;
  if (!c && call) {
    // équipage de patrouille : l'appel de CENTRAL qu'il a pris tient lieu d'ordre
    const dist = call.distance !== undefined && call.distance > 0 ? distanceText(call.distance) : '';
    const tail = [dist, arrow].filter((t) => t !== '').join(' ');
    const where = [compact ? shortStreet(call.place) : call.place, tail].filter((t) => t !== '').join(' · ');
    const title = call.label.trim() !== '' ? call.label.trim() : 'Appel';
    return {
      line1: `${compact ? 'Appel' : 'Appel de CENTRAL'}\u00a0: ${title}${where !== '' ? (compact ? ' · ' : ' — ') + where : ''}`,
      // (au doigt, pas de touche Y : le bouton « Radio »)
      line2: call.onSite ? `Sur place\u00a0: renforts et fin d’intervention ${compact ? 'par la radio' : 'avec Y ou l’écran radio'}.` : 'En route\u00a0: le GPS vous y conduit.',
    };
  }
  if (!c) {
    const text = b?.instruction ? b.instruction.title : '';
    const follow = chief ? `${b?.regroup ? 'Rejoignez' : 'Suivez'} : ${chief.label} (${distanceText(chief.distance)})` : '';
    return { line1: text !== '' ? text : 'Aucun ordre reçu pour l’instant.', line2: follow };
  }
  const dist = c.distance > 0 ? distanceText(c.distance) : '';
  const tail = [dist, arrow].filter((t) => t !== '').join(' ');
  if (compact) {
    const where = c.place ? shortStreet(c.place) : '';
    const line1 = ['Ordre : ' + c.text, where, tail].filter((t) => t !== '').join(' · ');
    const name = chief ? chief.label.trim().split(/\s+/).pop() ?? chief.label : '';
    const line2 = chief ? `${b?.regroup ? 'Rejoignez' : 'Suivez'} ${name} · ${distanceText(chief.distance)}` : '';
    return { line1, line2 };
  }
  const where = [c.place, tail].filter((t) => t !== '').join(' · ');
  const line1 = `${issuerTitle(c.by, c.from)} : ${c.text}${where !== '' ? ' — ' + where : ''}`;
  const to = c.to ? ` à ${c.to.replace(/^(Groupe|Section|Cie|Compagnie)\b/, (m) => 'votre ' + m.toLocaleLowerCase('fr-FR'))}` : '';
  const follow = chief ? ` ${b?.regroup ? 'Rejoignez' : 'Suivez'} : ${chief.label} (${distanceText(chief.distance)}).` : '';
  return { line1, line2: `Donné ${agoText(now - c.at)}${to}.${follow}` };
}
