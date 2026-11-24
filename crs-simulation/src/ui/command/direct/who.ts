/* =====================================================================================
 * Ordres directs — « À QUI » : l'unité qui reçoit l'ordre (logique pure).
 *
 *   isFree(unit)                        libre : « avec vous », « Laisser agir seuls », ou un Envoyer / Interpeller /
 *                                       Secours terminé ; sans ordre du joueur, libre sauf si elle tient quelque chose
 *                                       (barrage, ligne, interpellation…). Une unité qui tient n'est jamais le choix
 *                                       automatique tant qu'une autre est libre ;
 *   defaultAddressee(verb, x, z, env)   le choix automatique par poste (§1.4) : jamais la racine de la compagnie ;
 *                                       pas une unité qui a reçu un ordre du joueur il y a moins de 20 s (sauf
 *                                       « Avec moi ») ; sans unité libre, celle dont l'ordre est le plus ancien, et la
 *                                       ligne dit ce qu'elle quitte ;
 *   whoCycle(env) / cycleWho(...)       l'ordre fixe de U : automatique → BRAV-M → sections (groupes pour un chef de
 *                                       section) par distance → Centaure, canon à eau, drone → fourgons cellulaires →
 *                                       « Toute la compagnie » → retour. Même fonction pour le terrain et la carte ;
 *   WhoState / nextWho / consumeWho      un choix manuel vaut pour le prochain ordre seulement ; le premier U après cet
 *                                       ordre y revient directement (« la BRAV-M encore » = U, Entrée) ;
 *   resolveWho(env, key, verb, x, z)    l'unité (ou les unités) d'un choix.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import { REFUS, accepts } from './caps';
import type { Addressee, DirectEnv, DirectUnit, DirectVerb, Poste, WhoKey } from './types';
import { placeWithArticle } from './words';

/** Un ordre du joueur plus récent que cela (s) écarte l'unité du choix automatique. */
export const RECENT_ORDER = 20;
/** La BRAV-M interpelle d'office jusqu'à cette distance (m) du point. */
export const BRAVM_ARREST_RANGE = 500;
/** Part minimale d'agents valides pour être choisie d'office (même seuil que la carte, bestUnit.ts). */
export const MIN_VALID_SHARE = 0.6;

/** Ordres qui retiennent une unité (elle tient quelque chose) quand ils ne viennent pas du joueur. */
const HOLDING_ORDERS: ReadonlySet<string> = new Set([
  'couper_circulation', 'filtrer', 'ligne', 'encercler', 'interpeller', 'proteger', 'escorter', 'degager_barricade',
  'degager_obstacle', 'refoulement', 'charge', 'disperser_gaz', 'secourir', 'eteindre', 'tortue',
]);

/** Ordres du joueur qui laissent l'unité libre une fois terminés (Envoyer, Interpeller, Secours). */
const FINISHABLE_VERBS: ReadonlySet<DirectVerb> = new Set<DirectVerb>(['envoyer', 'interpeller', 'constater', 'secours', 'venir', 'faire_venir']);
const FINISHABLE_TYPES: ReadonlySet<string> = new Set(['colonne', 'avancer', 'faire_mouvement', 'interpeller', 'secourir', 'eteindre']);

/** L'unité est-elle libre (§1.4) ? */
export function isFree(u: DirectUnit): boolean {
  if (u.avecVous) return true;
  const po = u.playerOrder;
  if (po) {
    if (po.type === 'libre') return true;
    if (!po.done) return false;
    return po.verb !== null ? FINISHABLE_VERBS.has(po.verb) : FINISHABLE_TYPES.has(String(po.type));
  }
  const o = u.order;
  return !o || !HOLDING_ORDERS.has(String(o.type));
}

/** Ce que l'unité quitte si elle reçoit un nouvel ordre (« quitte la rue Saint-Gilles »), '' si elle est libre. */
export function leavesText(u: DirectUnit): string {
  if (isFree(u)) return '';
  const place = u.playerOrder ? u.playerOrder.place : '';
  return place !== '' ? `quitte ${placeWithArticle(place)}` : 'quitte son ordre en cours';
}

/** Libellé d'une unité dans les lignes d'ordre : l'indicatif ; la BRAV-M par son nom de métier. */
export function whoLabel(u: Pick<DirectUnit, 'kind' | 'name'>): string {
  return u.kind === 'bravm' ? 'BRAV-M' : u.name;
}

/** « Toute la compagnie », « Toute la section », « Tout le groupe », « Toute la BRAV-M », « Votre équipage ». */
export function wholeLabelOf(poste: Poste): string {
  switch (poste) {
    case 'commandant': return 'Toute la compagnie';
    case 'section': return 'Toute la section';
    case 'bravm': return 'Toute la BRAV-M';
    case 'equipage': return 'Votre équipage';
    default: return 'Tout le groupe';
  }
}

function unitById(env: DirectEnv, id: number): DirectUnit | undefined {
  return env.units.find((u) => u.squadId === id);
}

function dist(u: { x: number; z: number }, x: number, z: number): number {
  return Math.hypot(u.x - x, u.z - z);
}

/** Unités au premier niveau sous la racine du joueur (les sections d'un commandant, les groupes d'un chef de section). */
export function topUnits(env: DirectEnv): DirectUnit[] {
  const ids = new Set(env.units.map((u) => u.squadId));
  return env.units.filter((u) => u.squadId !== env.ownSquadId && u.symbol !== 'compagnie'
    && (u.parentId === env.ownSquadId || !ids.has(u.parentId) || unitById(env, u.parentId)?.symbol === 'compagnie')
    && u.kind !== 'autre');
}

/** Verbes d'un chef de bord de patrouille (ses deux collègues). */
const EQUIPAGE_VERBS: ReadonlySet<DirectVerb> = new Set<DirectVerb>([
  'avec_moi', 'interpeller', 'constater', 'secours', 'confier', 'remettre', 'emmener', 'faire_venir',
]);

/** Genres d'unité voulus par un verbe, dans l'ordre de préférence (commandant). */
function wantedFor(verb: DirectVerb): readonly (readonly string[])[] {
  switch (verb) {
    case 'interpeller':
    case 'constater':
      return [['groupe'], ['binome'], ['section'], ['patrouille']];
    case 'secours':
      return [['groupe'], ['section'], ['binome']];
    case 'pousser':
      return [['centaure']];
    case 'partir':
    case 'venir':
    case 'faire_venir':
      return [['cellulaire']];
    default:
      // barrer, se placer, aller : une section ; à défaut un groupe ; la BRAV-M ou une patrouille en dernier recours
      return [['section'], ['groupe'], ['bravm', 'patrouille']];
  }
}

function symbolOf(u: DirectUnit): string {
  return u.kind === 'cellulaire' ? 'cellulaire' : u.symbol;
}

/**
 * Candidats classés : libres (les plus proches d'abord), puis occupés (l'ordre le plus ancien d'abord) ; les renforts
 * d'un commissariat après les unités du dispositif, à rang égal.
 */
function rank(list: DirectUnit[], x: number, z: number, now: number): DirectUnit[] {
  const recent = (u: DirectUnit): boolean => !u.avecVous && u.playerOrder !== null && now - u.playerOrder.issuedAt < RECENT_ORDER;
  const weak = (u: DirectUnit): boolean => u.total > 0 && u.valid / u.total < MIN_VALID_SHARE;
  const tier = (u: DirectUnit): number => (weak(u) ? 4 : recent(u) ? 3 : isFree(u) ? 0 : 1);
  const age = (u: DirectUnit): number => (u.playerOrder ? u.playerOrder.issuedAt : u.order ? u.order.issuedAt : -1e9);
  return list.slice().sort((a, b) => tier(a) - tier(b) || (a.station ? 1 : 0) - (b.station ? 1 : 0)
    || (tier(a) === 0 ? dist(a, x, z) - dist(b, x, z) : age(a) - age(b))
    || dist(a, x, z) - dist(b, x, z) || a.squadId - b.squadId);
}

function single(u: DirectUnit, x: number, z: number, manual: boolean): Addressee {
  return { squadIds: [u.squadId], label: whoLabel(u), distance: dist(u, x, z), leaves: leavesText(u), manual };
}

/** Toutes les unités sous ses ordres au premier niveau (« Avec moi » à tout le monde). */
export function everyone(env: DirectEnv): Addressee | null {
  const p = env.player;
  if (env.poste === 'lecture') return null;
  if (env.poste === 'groupe' || env.poste === 'equipage' || env.poste === 'section' || env.poste === 'bravm') {
    const own = unitById(env, env.ownSquadId);
    if (!own) return null;
    return { squadIds: [own.squadId], label: wholeLabelOf(env.poste), distance: p ? dist(own, p.x, p.z) : 0, leaves: '', manual: false };
  }
  const tops = topUnits(env).filter((u) => u.kind !== 'cellulaire');
  if (tops.length === 0) return null;
  let far = 0;
  if (p) for (const u of tops) far = Math.max(far, dist(u, p.x, p.z));
  return { squadIds: tops.map((u) => u.squadId), label: wholeLabelOf(env.poste), distance: far, leaves: '', manual: false };
}

/** Choix automatique (§1.4) pour un verbe au point (x, z) ; null : personne (whyNobody dit pourquoi). */
export function defaultAddressee(verb: DirectVerb, x: number, z: number, env: DirectEnv): Addressee | null {
  if (verb === 'avec_moi') return everyone(env);
  // le joueur agit lui-même (son interpellé) : pas d'unité
  if (verb === 'confier' || verb === 'remettre' || verb === 'emmener' || verb === 'rien') return null;
  const own = unitById(env, env.ownSquadId);
  switch (env.poste) {
    case 'lecture':
      return null;
    case 'equipage':
      return own && EQUIPAGE_VERBS.has(verb) ? single(own, x, z, false) : null;
    case 'groupe':
    case 'bravm':
      return own && accepts(own.kind, verb) ? single(own, x, z, false) : null;
    case 'section': {
      if (!own) return null;
      if (verb === 'interpeller' || verb === 'constater') {
        const groups = env.units.filter((u) => u.parentId === own.squadId && (u.symbol === 'groupe' || u.symbol === 'binome') && u.valid > 0);
        const best = rank(groups, x, z, env.now)[0];
        if (best) return single(best, x, z, false);
      }
      return accepts(own.kind, verb) ? single(own, x, z, false) : null;
    }
    default:
      break;
  }
  // commandant / commissaire : jamais la racine de la compagnie
  const pool = env.units.filter((u) => u.squadId !== env.ownSquadId && u.symbol !== 'compagnie' && u.valid > 0 && accepts(u.kind, verb));
  if (verb === 'interpeller' || verb === 'constater') {
    // la BRAV-M si elle est libre et à moins de 500 m (le groupe BRAV-M, pas un binôme isolé)
    const bravm = pool.filter((u) => u.kind === 'bravm' && !(u.parentId !== 0 && unitById(env, u.parentId)?.kind === 'bravm'));
    const free = rank(bravm, x, z, env.now).find((u) => isFree(u) && dist(u, x, z) <= BRAVM_ARREST_RANGE && !(u.playerOrder && !u.avecVous && env.now - u.playerOrder.issuedAt < RECENT_ORDER));
    if (free) return single(free, x, z, false);
  }
  for (const kinds of wantedFor(verb)) {
    const list = pool.filter((u) => kinds.includes(symbolOf(u)));
    const best = rank(list, x, z, env.now)[0];
    if (best) return single(best, x, z, false);
  }
  return null;
}

/** Pourquoi personne ne reçoit ce verbe : la phrase du §4.3. */
export function whyNobody(verb: DirectVerb, env: DirectEnv): string {
  if (env.poste === 'lecture') return REFUS.lecture;
  if (env.poste === 'equipage' && !EQUIPAGE_VERBS.has(verb)) return REFUS.equipage;
  if (verb === 'pousser' && !env.units.some((u) => u.kind === 'centaure')) return REFUS.noCentaure;
  return REFUS.personne;
}

// ───────────────────────────── U : le cycle ─────────────────────────────

/** Clés du cycle de U, dans l'ordre fixe (§1.4). Chef de groupe, équipage, lecture : l'automatique seul. */
export function whoCycle(env: DirectEnv): WhoKey[] {
  if (env.poste === 'groupe' || env.poste === 'equipage' || env.poste === 'lecture') return ['auto'];
  const p = env.player ?? { x: 0, z: 0 };
  const keys: WhoKey[] = ['auto'];
  const byDist = (list: DirectUnit[]): DirectUnit[] => list.slice().sort((a, b) => dist(a, p.x, p.z) - dist(b, p.x, p.z) || a.squadId - b.squadId);
  const usable = env.units.filter((u) => u.squadId !== env.ownSquadId && u.symbol !== 'compagnie' && u.valid > 0);
  const tops = new Set(topUnits(env).map((u) => u.squadId));
  if (env.poste === 'commandant') {
    // la BRAV-M (le groupe, pas ses binômes)
    for (const u of byDist(usable.filter((q) => q.kind === 'bravm' && !(q.parentId !== 0 && unitById(env, q.parentId)?.kind === 'bravm')))) keys.push(`u${u.squadId}`);
    for (const u of byDist(usable.filter((q) => q.symbol === 'section'))) keys.push(`u${u.squadId}`);
    // sans section (compagnie réduite) : les groupes du premier niveau
    if (!usable.some((q) => q.symbol === 'section')) for (const u of byDist(usable.filter((q) => q.symbol === 'groupe' && tops.has(q.squadId)))) keys.push(`u${u.squadId}`);
  } else {
    // chef de section, chef de la BRAV-M : ses groupes
    for (const u of byDist(usable.filter((q) => q.parentId === env.ownSquadId && q.kind !== 'cellulaire'))) keys.push(`u${u.squadId}`);
  }
  for (const k of ['centaure', 'canon_eau', 'drone'] as const) for (const u of byDist(usable.filter((q) => q.kind === k))) keys.push(`u${u.squadId}`);
  for (const u of byDist(usable.filter((q) => q.kind === 'cellulaire'))) keys.push(`u${u.squadId}`);
  // les renforts des commissariats engagés en dernier, avant « Toute la compagnie » (une même unité une seule fois :
  // ils sortent des rangs ci-dessus)
  const station = new Set(usable.filter((q) => q.station).map((q) => `u${q.squadId}`));
  const own = keys.filter((k) => !station.has(k));
  keys.length = 0;
  keys.push(...own);
  for (const u of byDist(usable.filter((q) => q.station))) keys.push(`u${u.squadId}`);
  keys.push('tous');
  // une même unité une seule fois
  return keys.filter((k, i) => keys.indexOf(k) === i);
}

/** Clé suivante (`step` +1) ou précédente (−1) du cycle ; une clé disparue repart de l'automatique. */
export function cycleWho(env: DirectEnv, current: WhoKey, step: 1 | -1): WhoKey {
  const keys = whoCycle(env);
  const i = keys.indexOf(current);
  if (i < 0) return keys[step > 0 ? Math.min(1, keys.length - 1) : keys.length - 1]!;
  return keys[(i + step + keys.length) % keys.length]!;
}

/** Choix « À qui » en cours, choix manuel retenu pour le U suivant, ordre donné depuis. */
export interface WhoState {
  key: WhoKey;
  lastManual: WhoKey | null;
  justOrdered: boolean;
}

export const WHO_AUTO: WhoState = { key: 'auto', lastManual: null, justOrdered: false };

/** U / Maj+U : le premier U après un ordre revient au dernier choix manuel ; sinon le cycle. */
export function nextWho(env: DirectEnv, st: WhoState, step: 1 | -1): WhoState {
  const keys = whoCycle(env);
  if (st.justOrdered && step > 0 && st.key === 'auto' && st.lastManual !== null && keys.includes(st.lastManual)) {
    return { key: st.lastManual, lastManual: st.lastManual, justOrdered: false };
  }
  return { key: cycleWho(env, st.key, step), lastManual: st.lastManual, justOrdered: false };
}

/** Un ordre vient de partir : le choix manuel ne vaut que pour lui, on revient à l'automatique. */
export function consumeWho(st: WhoState): WhoState {
  return { key: 'auto', lastManual: st.key !== 'auto' ? st.key : st.lastManual, justOrdered: true };
}

/** Unité(s) d'un choix pour ce verbe au point ; null : personne (whyNobody). */
export function resolveWho(env: DirectEnv, key: WhoKey, verb: DirectVerb, x: number, z: number): Addressee | null {
  if (key === 'auto') return defaultAddressee(verb, x, z, env);
  if (key === 'tous') {
    const all = everyone(env);
    return all ? { ...all, manual: true } : null;
  }
  const id = Number(key.slice(1));
  const u = key.charAt(0) === 'u' && Number.isFinite(id) ? unitById(env, id) : undefined;
  if (!u) return defaultAddressee(verb, x, z, env);
  return single(u, x, z, true);
}

/** Unité visée par un choix (null : automatique, toute la compagnie, ou disparue). */
export function unitOfKey(env: DirectEnv, key: WhoKey): DirectUnit | null {
  if (key.charAt(0) !== 'u') return null;
  return unitById(env, Number(key.slice(1))) ?? null;
}

/** Unité qui commande l'agent `squadId` au niveau des ordres : on remonte jusque sous la racine du joueur. */
export function addressableUnitOf(env: DirectEnv, squadId: number): DirectUnit | null {
  let u = unitById(env, squadId);
  for (let guard = 0; u && guard < 8; guard++) {
    const parent = u.parentId !== 0 ? unitById(env, u.parentId) : undefined;
    if (!parent || parent.squadId === env.ownSquadId || parent.symbol === 'compagnie') break;
    u = parent;
  }
  if (!u || (u.squadId === env.ownSquadId && env.poste === 'commandant')) return null;
  return u;
}

/** Type d'ordre de la simulation qu'un verbe direct donne quand il n'a pas de ligne de fiche. */
export const VERB_ORDER: Readonly<Partial<Record<DirectVerb, OrderType>>> = {
  avec_moi: 'suivre', tenir: 'tenir', cesser: 'cesser', repli: 'repli', bond: 'bond_offensif', charge: 'charge', gaz: 'disperser_gaz',
  libre: 'libre', tortue: 'tortue', pousser: 'degager_obstacle', interpeller: 'interpeller', constater: 'interpeller', venir: 'colonne',
  face_foule: 'ligne', bloquer: 'couper_circulation', disperser: 'refoulement', secours: 'secourir',
};
