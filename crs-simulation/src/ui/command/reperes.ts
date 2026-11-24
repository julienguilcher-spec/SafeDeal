/* =====================================================================================
 * Carte de commandement — les REPÈRES : ce que le commandant peut désigner (rues d'issue des foules, foules, nasses,
 * incidents, ses unités, les autres unités, lui-même, stations de métro, rues fermées, proposition de l'adjoint,
 * véhicule qui bloque sa colonne, commissariats).
 *
 *   collectReperes(env)          tous les repères de la scène ;
 *   pickAt(list, sx, sy, r, …)   repères sous le pointeur, par priorité (unité > incident > commissariat > métro / rue
 *                                fermée > foule > vous > rue > point), puis par distance ;
 *   nextInDirection(from, dir…)  saut de la visée aux flèches : repère le plus proche dans un cône de 100°,
 *                                score = distance × (1 + 2 × angle en radians) ;
 *   cardEnvFromCore(core)        environnement des fiches (CardEnv) lu dans la partie en cours.
 *
 * Extension (module des commissariats, ou tout autre module) :
 *   registerRepereProvider('commissariat', (env) => [...])   ajoute des repères à collectReperes ;
 *   registerCardEnvHook((env, core) => { … })                  complète l'environnement (env.stations, homeStation…).
 * Les deux renvoient une fonction de retrait. Logique pure sauf cardEnvFromCore (lecture seule de la partie).
 * ===================================================================================== */

import type { ForceLevel, PoliceRank } from '@/core/contracts';
import type { IncidentKind, IncidentState } from '@/core/extensions';
import { exitName, exitOpen, roughCount } from '../maps/barrages';
import type { SceneCrowdExits } from '../maps/barrages';
import { rankLabel } from '../screens/catalog';
import type {
  CardCrowd, CardEnv, CardExit, CardIncident, CardRoad, CardUnit, Repere, RepereKind,
} from './cardTypes';
import type { CommandCore } from './core';
import { INCIDENT_KIND_LABELS } from './incidents';
import { withArticle } from './orders';

export type { Repere, RepereKind } from './cardTypes';

// ───────────────────────────── noms ─────────────────────────────

/** Première lettre en capitale (« rue de Rivoli » → « Rue de Rivoli »). */
export function capFirst(s: string): string {
  const t = s.trim();
  return t === '' ? t : t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);
}

/** Nature d'une unité en clair, devant son indicatif (« Section MISTRAL 1 »). */
export function unitKindWord(symbol: string): string {
  switch (symbol) {
    case 'compagnie': return 'Compagnie';
    case 'section': return 'Section';
    case 'groupe': return 'Groupe';
    case 'binome': return 'Binôme';
    case 'bravm': return 'BRAV-M';
    case 'centaure': return 'Blindé';
    case 'canon_eau': return 'Canon à eau';
    case 'drone': return 'Drone';
    case 'pompiers': return 'Pompiers';
    case 'samu': return 'SAMU';
    case 'patrouille': return 'Patrouille';
    case 'vehicule': return 'Engin';
    default: return 'Unité';
  }
}

/** Nom complet d'une unité (« Section MISTRAL 1 ») ; l'indicatif seul s'il dit déjà la nature (« CENTAURE 2 »). */
export function unitTitle(u: { symbol: string; name: string }): string {
  const word = unitKindWord(u.symbol);
  if (u.name.toLocaleUpperCase('fr-FR').startsWith(word.toLocaleUpperCase('fr-FR'))) return u.name;
  if (u.symbol === 'centaure' && /CENTAURE/i.test(u.name)) return `Blindé ${u.name}`;
  return `${word} ${u.name}`;
}

/** Nombre approximatif de personnes (« ~300 personnes », « 12 personnes »). */
export function peopleText(n: number): string {
  const v = roughCount(n);
  if (v <= 0) return 'aucune personne';
  const num = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${v >= 30 ? '~' : ''}${num} personne${v > 1 ? 's' : ''}`;
}

/** Rayon (m) du corps d'une foule pour la désignation : croît avec l'effectif. */
export function crowdBodyRadius(people: number): number {
  return Math.max(10, Math.min(45, Math.sqrt(Math.max(0, people)) * 1.2));
}

// ───────────────────────────── constructeurs ─────────────────────────────

export function crowdRepere(c: CardCrowd): Repere {
  const kind: RepereKind = c.closed ? 'nasse' : 'foule';
  return {
    kind, key: `${kind}:${c.key}`, x: c.x, z: c.z, crowdKey: c.key, radius: crowdBodyRadius(c.people),
    name: `${capFirst(c.name)} — ${peopleText(c.people)}`,
  };
}

/** Clé d'une rue d'issue : l'arête du graphe (une seule fois par rue), sinon la position. */
export function streetKey(edgeId: number, x: number, z: number): string {
  return edgeId >= 0 ? `rue:e${edgeId}` : `rue:p${Math.round(x)}_${Math.round(z)}`;
}

/**
 * Repère d'une issue de foule. Une trouée piétonne hors voie (« passage piéton ») porte en plus le nom de la voie la
 * plus proche, sinon dix passages de la même place s'appelleraient pareil : « Passage piéton (rue Royale) ».
 * Une issue posée sur l'anneau d'une place (son arête s'appelle « Place de la Concorde ») prend le nom de la rue qui
 * en part, cherché en s'éloignant de la foule (`from` : centre de la foule) : « Rue Royale » ; un passage, « Passage
 * piéton (vers la rue Royale) » — sinon les vingt-sept issues de la Concorde s'appelleraient presque toutes pareil.
 */
export function exitRepere(e: CardExit, crowdKey: string, env?: Pick<CardEnv, 'roadAt'>, from?: { x: number; z: number }): Repere {
  let name = capFirst(exitName(e));
  const outward = env && from ? streetLeaving(e, from, env) : '';
  if (e.edgeId < 0 && (e.street.trim() === '' || /^passage piéton$/i.test(e.street.trim())) && env) {
    const road = outward === '' ? env.roadAt(e.x, e.z, 40) : null;
    const near = outward !== '' ? outward : road ? road.name.trim() : '';
    if (near !== '') name = outward !== '' ? `${name} (vers ${withArticle(near)})` : `${name} (${near.charAt(0).toLocaleLowerCase('fr-FR')}${near.slice(1)})`;
  } else if (outward !== '') name = capFirst(outward);
  return { kind: 'rue', key: streetKey(e.edgeId, e.x, e.z), x: e.x, z: e.z, roadEdge: e.edgeId, crowdKey, name };
}

/** Nom d'une place, d'un passage ou d'une voie sans nom : pas assez pour distinguer deux issues. */
const VAGUE_NAME = /^(place|passage piéton|voie sans nom|parvis|carrefour|rond-point)\b/i;

/**
 * Nom de la rue qui part de l'issue `e` d'une foule centrée en `from`, quand l'issue elle-même porte un nom vague
 * (place, passage) : premier nom de voie différent trouvé en s’éloignant de la foule (jusqu’à 60 m : au-delà, ce serait une autre rue). '' sinon.
 */
function streetLeaving(e: CardExit, from: { x: number; z: number }, env: Pick<CardEnv, 'roadAt'>): string {
  const own = exitName(e).trim();
  if (!VAGUE_NAME.test(own)) return '';
  let dx = e.x - from.x, dz = e.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1) return '';
  dx /= len;
  dz /= len;
  for (let d = 15; d <= 60; d += 15) {
    const road = env.roadAt(e.x + dx * d, e.z + dz * d, 12);
    const n = road ? road.name.trim() : '';
    if (n !== '' && !VAGUE_NAME.test(n) && n.toLocaleLowerCase('fr-FR') !== own.toLocaleLowerCase('fr-FR')) return n;
  }
  return '';
}

export function roadRepere(r: CardRoad): Repere {
  return { kind: 'rue', key: streetKey(r.edgeId, r.x, r.z), x: r.x, z: r.z, roadEdge: r.edgeId, name: capFirst(r.name) };
}

export function incidentRepere(i: CardIncident): Repere {
  return {
    kind: 'incident', key: `incident:${i.id}`, x: i.x, z: i.z, incidentId: i.id,
    name: INCIDENT_KIND_LABELS[i.kind] + (i.place !== '' ? ` — ${i.place}` : ''),
  };
}

export function unitRepere(u: CardUnit): Repere {
  return {
    kind: u.mine ? 'unite' : 'cible', key: `${u.mine ? 'unite' : 'cible'}:${u.key}`, x: u.x, z: u.z,
    squadId: u.squadId, name: unitTitle(u),
  };
}

/** Repère d'un endroit quelconque : la rue nommée sous le point (à 8 m au plus), sinon le point lui-même. */
export function placeRepere(x: number, z: number, env: Pick<CardEnv, 'roadAt' | 'placeName'>): Repere {
  const road = env.roadAt(x, z, 8);
  if (road && road.name.trim() !== '') return roadRepere(road);
  return pointRepere(x, z, env);
}

export function pointRepere(x: number, z: number, env: Pick<CardEnv, 'roadAt' | 'placeName'>): Repere {
  const road = env.roadAt(x, z, 40);
  const where = road && road.name.trim() !== '' ? `près de ${road.name}` : env.placeName(x, z);
  return { kind: 'point', key: `point:${Math.round(x)}:${Math.round(z)}`, x, z, name: `Ici${where !== '' ? '\u00a0: ' + where : ''}` };
}

// ───────────────────────────── registre (extensions) ─────────────────────────────

type RepereProvider = (env: CardEnv) => readonly Repere[];
type EnvHook = (env: CardEnv, core: CommandCore) => void;

const providers: { kind: RepereKind; fn: RepereProvider }[] = [];
const envHooks: EnvHook[] = [];

/**
 * Ajoute des repères d'un genre à collectReperes (ex. : 'commissariat' par le module des commissariats). Retourne la
 * fonction de retrait.
 */
export function registerRepereProvider(kind: RepereKind, fn: RepereProvider): () => void {
  const entry = { kind, fn };
  providers.push(entry);
  return () => {
    const i = providers.indexOf(entry);
    if (i >= 0) providers.splice(i, 1);
  };
}

/** Complète l'environnement des fiches lu par cardEnvFromCore (stations, commissariat d'attache des unités…). */
export function registerCardEnvHook(fn: EnvHook): () => void {
  envHooks.push(fn);
  return () => {
    const i = envHooks.indexOf(fn);
    if (i >= 0) envHooks.splice(i, 1);
  };
}

// ───────────────────────────── collecte ─────────────────────────────

/** Incident encore ouvert (ni résolu ni échoué). */
export function incidentOpen(state: IncidentState): boolean {
  return state !== 'resolu' && state !== 'echoue';
}

/** Tous les repères de la scène (sans les points libres). Une rue n'apparaît qu'une fois même si deux foules la partagent. */
export function collectReperes(env: CardEnv): Repere[] {
  const out: Repere[] = [];
  const seen = new Set<string>();
  const push = (r: Repere): void => {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.z) || seen.has(r.key)) return;
    seen.add(r.key);
    out.push(r);
  };
  for (const u of env.units) push(unitRepere(u));
  for (const i of env.incidents) if (incidentOpen(i.state)) push(incidentRepere(i));
  if (env.blocked) {
    push({ kind: 'bloqueur', key: 'bloqueur', x: env.blocked.x, z: env.blocked.z, name: `Véhicule qui vous bloque${env.blocked.street ? ' — ' + env.blocked.street : ''}` });
  }
  for (const p of env.proposals) {
    if (p.x === 0 && p.z === 0) continue;
    push({ kind: 'proposition', key: `proposition:${p.id}`, x: p.x, z: p.z, proposalId: p.id, name: 'Proposition de l’adjoint' });
  }
  for (const s of env.stations) {
    push({ kind: 'commissariat', key: `commissariat:${s.id}`, x: s.x, z: s.z, stationId: s.id, name: capFirst(s.name) });
  }
  for (const m of env.metro) push({ kind: 'metro', key: `metro:${m.id}`, x: m.x, z: m.z, metroId: m.id, name: `Station ${m.name}` });
  for (const c of env.closures) {
    push({ kind: 'fermeture', key: `fermeture:${c.id}`, x: c.x, z: c.z, closureId: c.id, name: `${capFirst(c.name || 'rue')} — fermée aux voitures` });
  }
  const crowds = orderedCrowds(env);
  for (const c of crowds) push(crowdRepere(c));
  if (env.player) push({ kind: 'vous', key: 'vous', x: env.player.x, z: env.player.z, name: 'Vous' });
  for (const c of crowds) for (const e of c.exits) push(exitRepere(e, c.key, env, c));
  for (const p of providers) {
    let list: readonly Repere[] = [];
    try { list = p.fn(env); } catch { list = []; }
    for (const r of list) push(r);
  }
  return out;
}

/** Foule principale (le cortège), sinon la plus grosse ; null sans foule. */
export function mainCrowd(env: Pick<CardEnv, 'crowds'>): CardCrowd | null {
  let best: CardCrowd | null = null;
  for (const c of env.crowds) {
    if (c.main) return c;
    if (!best || c.people > best.people) best = c;
  }
  return best;
}

/** Poids d'une foule pour les intentions « Encercler » et « Disperser » : effectif × tension. */
export function crowdWeight(c: CardCrowd): number {
  return Math.max(1, c.people) * (0.25 + Math.max(0, Math.min(1, c.tension)));
}

/** Foules : la principale d'abord, puis par effectif × tension décroissant. */
export function orderedCrowds(env: Pick<CardEnv, 'crowds'>): CardCrowd[] {
  const main = mainCrowd(env);
  return env.crowds.slice().sort((a, b) => (a === main ? -1 : b === main ? 1 : crowdWeight(b) - crowdWeight(a) || (a.key < b.key ? -1 : 1)));
}

// ───────────────────────────── désignation ─────────────────────────────

/** Priorité de désignation (plus petit = d'abord). */
export const PICK_PRIORITY: Readonly<Record<RepereKind, number>> = {
  unite: 0, cible: 1, incident: 2, bloqueur: 2, proposition: 3, commissariat: 4, metro: 5, fermeture: 5, foule: 6, nasse: 6,
  vous: 7, rue: 8, point: 9,
};

type ToScreen = (x: number, z: number, out: { x: number; y: number }) => void;

/**
 * Repères sous le pointeur (à `radiusPx` pixels au plus ; une foule compte aussi son corps), triés par priorité puis
 * par distance à l'écran. Vide : rien d'accroché (l'appelant fait un repère de point).
 */
export function pickAt(list: readonly Repere[], sx: number, sy: number, radiusPx: number, toScreen: ToScreen): Repere[] {
  const p = { x: 0, y: 0 };
  const q = { x: 0, y: 0 };
  const hits: { r: Repere; d: number }[] = [];
  for (const r of list) {
    toScreen(r.x, r.z, p);
    const d = Math.hypot(p.x - sx, p.y - sy);
    let reach = radiusPx;
    if ((r.kind === 'foule' || r.kind === 'nasse') && r.radius && r.radius > 0) {
      toScreen(r.x + r.radius, r.z, q);
      reach += Math.min(80, Math.hypot(q.x - p.x, q.y - p.y));
    }
    if (d <= reach) hits.push({ r, d });
  }
  hits.sort((a, b) => PICK_PRIORITY[a.r.kind] - PICK_PRIORITY[b.r.kind] || a.d - b.d);
  return hits.map((h) => h.r);
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const DIRS: Readonly<Record<Direction, { x: number; y: number }>> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};
/** Demi-angle du cône de recherche (100° en tout). */
const HALF_CONE = (50 * Math.PI) / 180;

/**
 * Repère suivant dans une direction de l'écran (flèches) : dans un cône de 100° autour de la direction, celui de plus
 * petit score distance × (1 + 2 × angle). null si le cône est vide. Les repères au même endroit que la visée (< 4 px)
 * sont ignorés.
 */
export function nextInDirection(from: { sx: number; sy: number }, dir: Direction, list: readonly Repere[], toScreen: ToScreen): Repere | null {
  const v = DIRS[dir];
  const p = { x: 0, y: 0 };
  let best: Repere | null = null;
  let bestScore = Infinity;
  for (const r of list) {
    toScreen(r.x, r.z, p);
    const dx = p.x - from.sx;
    const dy = p.y - from.sy;
    const d = Math.hypot(dx, dy);
    if (d < 4) continue;
    const cos = (dx * v.x + dy * v.y) / d;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (angle > HALF_CONE) continue;
    const score = d * (1 + 2 * angle);
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// ───────────────────────────── lecture de la partie ─────────────────────────────

interface ProposalLike { id: number; key: string; text: string; x: number; z: number; executable: boolean }
interface ObstacleLike { blocked(): { x: number; z: number; street: string } | null }
interface AdvisorLike { riposteAt(x: number, z: number): boolean }
interface ManifLike { id: number; label: string; tension: number; headHeading: number }
/** Vue minimale du service 'crowd.core' (src/sim/crowd/api.ts) : l'équipe de liaison au contact des organisateurs. */
interface LiaisonLike { setLiaison(active: boolean): void }

/**
 * État de l'équipe de liaison pour les fiches : null si personne ne peut l'engager (service absent, ou joueur qui ne
 * commande pas tout le dispositif), sinon true quand elle est déjà au contact. Le directeur de la foule (ctx.director)
 * porte le drapeau `liaison`, remis à faux à chaque partie.
 */
export function liaisonState(core: CommandCore): boolean | null {
  const ctx = core.ctx;
  if (core.scope().level !== 'tout') return null;
  const api = ctx.service<Partial<LiaisonLike>>('crowd.core');
  if (!api || typeof api.setLiaison !== 'function') return null;
  const d = ctx.director as unknown as { liaison?: unknown } | undefined;
  return d ? d.liaison === true : null;
}

const MOTOR_DISTANCE = 250;

/** Nom en clair d'une foule de la scène. */
function crowdName(c: SceneCrowdExits, manifs: readonly { id: number; label: string }[], foyers: readonly { id: number; label: string }[]): string {
  const id = Number(c.key.slice(1));
  switch (c.key.charAt(0)) {
    case 'c': return 'Tête de cortège';
    case 'm': return manifs.find((m) => m.id === id)?.label || 'Manifestation';
    case 'f': return foyers.find((f) => f.id === id)?.label || 'Rassemblement';
    case 'k': return c.closed ? `Nasse${c.place ? ' — ' + c.place : ''}` : `Foule encerclée${c.place ? ' — ' + c.place : ''}`;
    default: return c.place || 'Foule';
  }
}

/**
 * Environnement des fiches lu dans la partie en cours (scène de la carte, étendue du commandement, droit, services
 * facultatifs). `selection` : unités déjà choisies par le joueur. Lecture seule.
 */
export function cardEnvFromCore(core: CommandCore, selection: readonly number[] = []): CardEnv {
  const ctx = core.ctx;
  const scene = core.maps.scene;
  scene.ensureFresh();
  const sc = core.scope();
  const roe = ctx.law.roe;
  const advisor = ctx.service<AdvisorLike>('law.advisor');
  const world = ctx.world;
  const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
  const roadAt = (x: number, z: number, maxDist: number): CardRoad | null => {
    if (world.edgeCount <= 0 || !world.nearestRoad(x, z, road, maxDist) || road.name.trim() === '') return null;
    return { edgeId: road.edgeId, x: road.x, z: road.z, heading: road.heading, width: road.width, name: road.name };
  };
  const placeName = (x: number, z: number): string => {
    const s = world.sectorName(x, z);
    return s && s !== 'secteur inconnu' ? s : '';
  };
  const now = ctx.clock.now;

  // foules : celles de la scène (avec leurs issues), puis cortège, manifestations et foyers sans issues connues
  const manifsApi = ctx.service<{ list: readonly ManifLike[] }>('crowd.manifs');
  const crowds: CardCrowd[] = [];
  const keys = new Set<string>();
  const copyExits = (list: readonly CardExit[]): CardExit[] => list.map((e) => ({
    x: e.x, z: e.z, heading: e.heading, width: e.width, street: e.street, edgeId: e.edgeId, held: !exitOpen(e), squadId: e.squadId, mode: e.mode,
  }));
  const tensionOf = (key: string): number => {
    const id = Number(key.slice(1));
    if (key.charAt(0) === 'm') return scene.manifs.find((m) => m.id === id)?.tension ?? ctx.director.tension;
    if (key.charAt(0) === 'f') return scene.foyers.find((f) => f.id === id)?.tension ?? ctx.director.tension;
    return ctx.director.tension;
  };
  const headingOf = (key: string): number => {
    if (key === 'c') return scene.hasHead ? scene.headHeading : NaN;
    if (key.charAt(0) === 'm') {
      const id = Number(key.slice(1));
      const m = scene.manifs.find((q) => q.id === id) ?? manifsApi?.list.find((q) => q.id === id);
      return m ? m.headHeading : NaN;
    }
    return NaN;
  };
  for (const c of scene.crowdExits) {
    keys.add(c.key);
    crowds.push({
      key: c.key, name: crowdName(c, scene.manifs, scene.foyers), place: c.place, x: c.x, z: c.z, radius: c.radius, people: c.people,
      tension: Math.max(0, Math.min(1, tensionOf(c.key))), heading: headingOf(c.key), main: c.key === 'c', exits: copyExits(c.exits),
      kettleId: c.kettleId, closed: c.closed,
    });
  }
  if (scene.hasHead && scene.crowdCount > 0 && !keys.has('c') && !scene.crowdExits.some((c) => c.kettleId !== 0 && Math.hypot(c.x - scene.headX, c.z - scene.headZ) < c.radius + 20)) {
    crowds.push({
      key: 'c', name: 'Tête de cortège', place: placeName(scene.headX, scene.headZ), x: scene.headX, z: scene.headZ, radius: 90,
      people: scene.crowdCount, tension: Math.max(0, Math.min(1, ctx.director.tension)), heading: scene.headHeading, main: true, exits: [],
      kettleId: 0, closed: false,
    });
  }
  for (const m of scene.manifs) {
    if (keys.has('m' + m.id)) continue;
    crowds.push({
      key: 'm' + m.id, name: m.label || 'Manifestation', place: placeName(m.x, m.z), x: m.x, z: m.z, radius: 90, people: m.people,
      tension: Math.max(0, Math.min(1, m.tension)), heading: m.headHeading, main: false, exits: [], kettleId: 0, closed: false,
    });
  }
  for (const f of scene.foyers) {
    if (keys.has('f' + f.id)) continue;
    crowds.push({
      key: 'f' + f.id, name: f.label || 'Rassemblement', place: f.name, x: f.x, z: f.z, radius: 40, people: f.people,
      tension: Math.max(0, Math.min(1, f.tension)), heading: NaN, main: false, exits: [], kettleId: 0, closed: false,
    });
  }

  // incidents
  const incidents: CardIncident[] = [];
  for (const inc of scene.incidents) {
    const call = scene.calls.find((c) => c.incidentId === inc.id && c.state !== 'reparti' && c.state !== 'annule');
    const sq = inc.squadId !== 0 ? ctx.squads.get(inc.squadId) : undefined;
    incidents.push({
      id: inc.id, kind: inc.kind as IncidentKind, x: inc.x, z: inc.z, urgency: inc.urgency, state: inc.state, means: inc.means,
      squadId: inc.squadId, assignee: sq ? sq.name : '', place: placeName(inc.x, inc.z), age: Math.max(0, now - inc.createdAt),
      targetId: inc.targetKind === 'person' || inc.targetKind === 'prop' ? inc.targetId : 0,
      callId: call ? call.id : 0, callVehicleId: call ? call.vehicleId : 0,
    });
  }

  // unités : véhicules de transport par unité (elle-même ou une subordonnée)
  const withVehicles = new Set<number>();
  for (const q of ctx.squads.list) {
    if (q.vehicleId === 0) continue;
    const v = ctx.vehicles.get(q.vehicleId);
    if (!v || v.def.flying || v.kind === 'moto_bravm' || v.state === 'wrecked' || v.state === 'burnt') continue;
    let id = q.id;
    for (let guard = 0; id !== 0 && guard < 10; guard++) {
      withVehicles.add(id);
      id = ctx.squads.get(id)?.parentId ?? 0;
    }
  }
  const units: CardUnit[] = [];
  for (const u of scene.units) {
    if (u.faction !== 'police' && u.faction !== 'rescue') continue;
    const o = u.order;
    let orderPlace = '';
    if (o && o.place) orderPlace = o.place; // le nom dit quand l'ordre a été donné (fiche, radio)
    else if (o && Number.isFinite(o.x) && Number.isFinite(o.z) && (o.x !== 0 || o.z !== 0)) {
      const street = o.type === 'couper_circulation' || o.type === 'filtrer' ? roadAt(o.x, o.z, 30) : null;
      orderPlace = street ? street.name : placeName(o.x, o.z);
    }
    const sq = u.squadId > 0 ? ctx.squads.get(u.squadId) : undefined;
    units.push({
      squadId: u.squadId, key: u.key, name: u.name, symbol: u.symbol, x: u.x, z: u.z, total: u.total, valid: u.valid, morale: u.morale,
      ammo: u.ammo, order: o && o.type !== 'libre' ? { type: o.type, x: o.x, z: o.z, targetId: o.targetId, issuedAt: o.issuedAt } : null,
      orderPlace, status: u.status, embarked: u.embarked, hasVehicles: u.squadId > 0 && withVehicles.has(u.squadId),
      mine: u.squadId > 0 && core.canCommand(u.squadId), patrol: u.patrol, homeStation: '',
      targetEntity: u.vehicleId !== 0 ? u.vehicleId : u.leaderId, parentId: sq ? sq.parentId : 0, hasPlayer: u.hasPlayer,
      cellular: u.cellular,
    });
  }

  // fermetures de rues, métro, propositions, obstacle
  const closures = scene.closures.map((c) => {
    const r = roadAt(c.x, c.z, 30);
    const sq = c.squadId !== 0 ? ctx.squads.get(c.squadId) : undefined;
    return { id: c.id, x: c.x, z: c.z, name: r ? r.name : placeName(c.x, c.z), heldBy: sq ? sq.name : '' };
  });
  const metro = scene.stations.map((s) => ({ id: s.id, name: s.name, x: s.x, z: s.z, open: s.open, filtered: s.filtered, inflow: s.inflow }));
  const cmd = ctx.service<{ proposals: readonly ProposalLike[] }>('police.command');
  const proposals = cmd && Array.isArray(cmd.proposals) && sc.level === 'tout'
    ? cmd.proposals.map((p) => ({ id: p.id, key: p.key, text: p.text, x: p.x, z: p.z, executable: p.executable }))
    : [];
  const obstacle = ctx.service<ObstacleLike>('police.obstacle');
  const block = obstacle && typeof obstacle.blocked === 'function' ? obstacle.blocked() : null;

  const me = core.player();
  const role = ctx.player.state.role;
  const rank = me ? rankLabel((me.rank ?? null) as PoliceRank | null, role) : '';
  const surname = me ? me.name.trim().split(/\s+/).pop() ?? '' : '';
  const ownSquad = sc.ownSquadId !== 0 ? ctx.squads.get(sc.ownSquadId) : undefined;
  const command: CardEnv['command'] = !ownSquad || ownSquad.kind === 'compagnie' || sc.level === 'tout' ? 'compagnie'
    : ownSquad.kind === 'section' || ownSquad.kind === 'peloton' ? 'section' : 'groupe';

  const env: CardEnv = {
    level: sc.level, canTraffic: sc.canTraffic, canSommation: sc.canSommation, canAuthorize: sc.canAuthorize, canMetro: sc.canMetro,
    canDelegate: sc.canDelegate, salle: ctx.session.config?.extra?.['variante'] === 'salle',
    sommations: roe.sommation, lawful: roe.lawfulForce, authorised: roe.authorizedForce as ForceLevel, underAttack: roe.underAttack,
    riposteAt: (x, z) => (advisor && typeof advisor.riposteAt === 'function' ? advisor.riposteAt(x, z) : roe.underAttack),
    command, crowds, incidents, units, closures, metro, proposals, stations: [],
    player: me && scene.hasPlayer ? { x: me.x, z: me.z, title: `${rank}${rank && surname ? ' ' : ''}${surname}` || 'Vous', inVehicle: me.vehicleId !== 0, personId: me.id } : null,
    blocked: block ? { x: block.x, z: block.z, street: block.street } : null,
    hasRescue: !!core.rescue, selection, now,
    farFor: (x, z, squadId) => {
      const s = ctx.squads.get(squadId);
      if (!s) return false;
      const lead = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : s.members.length ? ctx.people.get(s.members[0]!) : undefined;
      return !!lead && Math.hypot(lead.x - x, lead.z - z) > MOTOR_DISTANCE;
    },
    roadAt, placeName, wind: { x: scene.windX, z: scene.windZ }, liaison: liaisonState(core),
    // même règle que l'envoi (sendLine) et que l'unité (droit : fait constaté) : quelqu'un d'interpellable près du point ?
    offenderAt: (x, z, radius) => !!ctx.people.nearest(x, z, radius, (q) => q.faction === 'protest' && q.custody === 'free' && ctx.law.canArrest(q)),
  };
  for (const h of envHooks) {
    try { h(env, core); } catch { /* une extension défaillante ne prive pas la carte de ses fiches */ }
  }
  return env;
}
