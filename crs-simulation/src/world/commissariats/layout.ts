/* =====================================================================================
 * COMMISSARIATS — calcul et contrôle de la disposition d'un site sur la vraie carte.
 *
 * layoutYard(world, seed) : trouve la porte (façade réelle touchée par un rayon depuis la rue), la rue des places
 * réservées (celle du commissariat si elle admet du stationnement selon la règle de la circulation, sinon la rue
 * éligible la plus proche à moins de 150 m à pied), puis pose les places contre le trottoir côté porte, une file par
 * unité, tête vers la sortie. N'est utilisé que pour PRODUIRE les données figées de data.ts (essai sur la vraie
 * carte avec CRS_COMMISSARIATS_PRINT=1) : le jeu ne l'appelle jamais.
 *
 * validateSite(world, def) : revérifie les données figées (porte, places, largeur des itinéraires de sortie,
 * cheminement à pied de la porte aux places). Exécuté à chaque passage des essais sur la vraie carte.
 *
 * Seul le contrat WorldQuery est utilisé ; les règles de stationnement viennent du module de circulation
 * (constantes pures de src/sim/traffic/tuning.ts) pour que les engins des autres modules passent à côté des
 * véhicules garés.
 * ===================================================================================== */

import type { RayHit, RoadEdgeInfo, RoadSample, SurfaceKind, WorldQuery } from '@/core/contracts';
import { PARK_CLEAR_CROSSING, PARK_CLEAR_JUNCTION, PARK_MIN_ONEWAY, PARK_MIN_TWOWAY } from '@/sim/traffic/tuning';
import type { CommissariatDef, CommissariatSeed, FrozenLayout, YardSlot } from './data';
import { SPARE_LEN, SPARE_WIDTH, assembleCommissariat, vehicleLen, vehicleWidth } from './data';

/** Règles de placement et de contrôle. */
export const SLOT_RULES = {
  /** Largeur minimale d'une chaussée à sens unique pour y stationner (règle de la circulation). */
  parkMinOneway: PARK_MIN_ONEWAY,
  /** Largeur minimale d'une chaussée à double sens pour y stationner. */
  parkMinTwoway: PARK_MIN_TWOWAY,
  /** Dégagement des carrefours (en plus du rayon du carrefour). */
  clearJunction: PARK_CLEAR_JUNCTION,
  /** Dégagement des passages piétons et des feux. */
  clearCrossing: PARK_CLEAR_CROSSING,
  /** La porte est à moins de 18 m d'une voie. */
  doorRoadMax: 18,
  /** Ouverture minimale devant la porte (degrés, rayons de 25 m). */
  openArcDeg: 90,
  rayLen: 25,
  /** Rue de repli : à moins de 150 m de la porte. */
  altStreetMax: 150,
  /** Aucune place à plus de 200 m de la porte (rue de repli à 150 m, plus la longueur de la rangée). */
  slotMaxFromDoor: 200,
  /** Largeur minimale de chaussée sur l'itinéraire de sortie : fourgons et voitures, engins. */
  pathWidthVan: 5,
  pathWidthEngine: 6,
  /** Longueur de la sortie propre au site, où la règle des engins s'applique (m). */
  engineExit: 400,
  /** Pas d'échantillonnage de la largeur le long de l'itinéraire (m). */
  sampleStep: 10,
  /** Détour à pied maximal (facteur de la distance à vol d'oiseau, + 10 m). */
  footDetour: 1.6,
  /** Détour maximal de l'itinéraire de sortie (facteur de la distance à vol d'oiseau, + 300 m). */
  vehicleDetour: 3,
  /** Recherche de la rue du commissariat autour du point d'adresse (m). */
  roadSearch: 60,
  /** Écart au trottoir (formule de stationnement de la circulation). */
  curbMargin: 0.15,
  /** Intervalle entre deux véhicules garés (m) ; entre deux motos. */
  gap: 1.2,
  motoGap: 0.5,
  /** Places de réserve : 30 % du nombre de véhicules, au moins 2. */
  spareRatio: 0.3,
  spareMin: 2,
  /** La sortie est 25 m en aval de la tête de la première file. */
  exitAhead: 25,
  /** Distance minimale au bord de la carte (m). */
  boundsMargin: 150,
} as const;

/** Destinations de contrôle des itinéraires de sortie : Concorde et République. */
export const CHECK_DESTINATIONS: readonly { name: string; x: number; z: number }[] = [
  { name: 'Concorde', x: 0, z: 0 },
  { name: 'République', x: 3123, z: -208 },
];

const ENGINE_KINDS: ReadonlySet<string> = new Set(['canon_eau', 'centaure', 'car_crs']);
const BAD_SLOT_SURFACES: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>(['water', 'building', 'interior', 'park', 'void']);
const DOOR_SURFACES: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>(['sidewalk', 'plaza', 'sett']);

// ───────────────────────────── géométrie ─────────────────────────────

/** Rectangle d'une place (4 coins [x0, z0, …, x3, z3]), agrandi de `margin` de chaque côté. */
export function slotRing(s: Pick<YardSlot, 'x' | 'z' | 'heading' | 'len' | 'width'>, margin = 0): number[] {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  // droite du véhicule : (−fz, fx) (repère du jeu : x est, z sud)
  const rx = -fz;
  const rz = fx;
  const hl = s.len * 0.5 + margin;
  const hw = s.width * 0.5 + margin;
  return [
    s.x + fx * hl + rx * hw, s.z + fz * hl + rz * hw,
    s.x + fx * hl - rx * hw, s.z + fz * hl - rz * hw,
    s.x - fx * hl - rx * hw, s.z - fz * hl - rz * hw,
    s.x - fx * hl + rx * hw, s.z - fz * hl + rz * hw,
  ];
}

function projectRing(r: readonly number[], ax: number, az: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    const p = r[i]! * ax + r[i + 1]! * az;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return [lo, hi];
}

/** Deux places se recouvrent-elles (chacune agrandie de margin / 2) ? Séparation des axes, rectangles orientés. */
export function slotsOverlap(
  a: Pick<YardSlot, 'x' | 'z' | 'heading' | 'len' | 'width'>, b: Pick<YardSlot, 'x' | 'z' | 'heading' | 'len' | 'width'>,
  margin = 0,
): boolean {
  const ra = slotRing(a, margin * 0.5);
  const rb = slotRing(b, margin * 0.5);
  const axes = [Math.sin(a.heading), Math.cos(a.heading), Math.cos(a.heading), -Math.sin(a.heading),
    Math.sin(b.heading), Math.cos(b.heading), Math.cos(b.heading), -Math.sin(b.heading)];
  for (let i = 0; i < axes.length; i += 2) {
    const [a0, a1] = projectRing(ra, axes[i]!, axes[i + 1]!);
    const [b0, b1] = projectRing(rb, axes[i]!, axes[i + 1]!);
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(ax + ex * t - px, az + ez * t - pz);
}

function polylineLength(p: ArrayLike<number>): number {
  let len = 0;
  for (let i = 2; i + 1 < p.length; i += 2) len += Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
  return len;
}

function distToPolyline(px: number, pz: number, p: ArrayLike<number>): number {
  let best = Infinity;
  for (let i = 2; i + 1 < p.length; i += 2) {
    const d = distToSegment(px, pz, p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function normAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

// ───────────────────────────── réseau ─────────────────────────────

/** Voie praticable par les véhicules. */
function isVehicleEdge(e: RoadEdgeInfo): boolean {
  return !e.pedestrianOnly && e.roadClass !== 'footway' && e.roadClass !== 'pedestrian';
}

/** La chaussée admet-elle du stationnement (règle de la circulation, parking.ts eligible()) ? */
export function parkEligible(e: RoadEdgeInfo): boolean {
  if (!isVehicleEdge(e) || e.bridge || e.roadClass === 'service') return false;
  return e.width >= (e.oneway ? SLOT_RULES.parkMinOneway : SLOT_RULES.parkMinTwoway);
}

/** Rue acceptable comme rue du commissariat (ni piétonne, ni voie rapide, ni voie de service, ni pont). */
function isStationStreet(e: RoadEdgeInfo): boolean {
  return isVehicleEdge(e) && e.roadClass !== 'motorway' && e.roadClass !== 'service' && !e.bridge;
}

/** Rue piétonne nommée (porte d'un commissariat donnant sur une voie piétonne, graine `pedestrianStreet`). */
function isPedestrianStreet(e: RoadEdgeInfo): boolean {
  return e.name !== '' && e.roadClass === 'pedestrian' && !e.bridge;
}

/** Rue (carrossable ou piétonne nommée, hors simple sentier) devant la porte. */
function isStreet(e: RoadEdgeInfo): boolean {
  return isStationStreet(e) || isPedestrianStreet(e);
}

interface NodeFacts {
  /** Degré en voies praticables. */
  deg: number;
  /** Rayon du carrefour (demi-largeur de la plus large voie, plafonnée à 14 m, comme la circulation). */
  radius: number;
  signal: boolean;
  crossing: boolean;
}

function nodeFacts(world: WorldQuery, n: number): NodeFacts {
  const info = world.node(n);
  let deg = 0;
  let radius = 0;
  for (const e of info.edges) {
    const ed = world.edge(e);
    if (!isVehicleEdge(ed)) continue;
    deg++;
    const hw = ed.width * 0.5;
    if (hw > radius) radius = hw;
  }
  return { deg, radius: radius > 14 ? 14 : radius, signal: info.signal, crossing: info.crossing };
}

/** Dégagement à respecter autour d'un nœud (0 : aucun). */
function nodeClearance(f: NodeFacts): number {
  if (f.deg >= 3) return f.radius + SLOT_RULES.clearJunction;
  if (f.signal || f.crossing) return SLOT_RULES.clearCrossing;
  return 0;
}

/** Nœuds à dégager autour d'un point (carrefours et passages piétons dans un rayon). */
function clearanceNodes(world: WorldQuery, x: number, z: number, r: number): { x: number; z: number; clear: number }[] {
  const out: { x: number; z: number; clear: number }[] = [];
  for (let n = 0; n < world.nodeCount; n++) {
    const info = world.node(n);
    if (Math.abs(info.x - x) > r || Math.abs(info.z - z) > r) continue;
    const c = nodeClearance(nodeFacts(world, n));
    if (c > 0) out.push({ x: info.x, z: info.z, clear: c });
  }
  return out;
}

/** Tronçon continu d'une même rue entre deux carrefours, orienté (sens de circulation s'il est à sens unique). */
interface Chain {
  name: string;
  oneway: boolean;
  edges: number[];
  /** Polyligne [x0, z0, …] dans le sens du tronçon. */
  pts: number[];
  /** Abscisse de chaque point et largeur de la portion qui suit. */
  s: number[];
  width: number[];
  length: number;
  /** Dégagements aux extrémités. */
  clear0: number;
  clear1: number;
}

function appendEdge(pts: number[], e: RoadEdgeInfo, forward: boolean): void {
  const p = e.points;
  const n = p.length >> 1;
  for (let k = 0; k < n; k++) {
    const i = forward ? k : n - 1 - k;
    const x = p[i * 2]!;
    const z = p[i * 2 + 1]!;
    const m = pts.length;
    if (m >= 2 && Math.hypot(pts[m - 2]! - x, pts[m - 1]! - z) < 0.05) continue;
    pts.push(x, z);
  }
}

/**
 * Tronçon contenant l'arête `e0` : prolongé tant que le nœud n'est ni un carrefour ni une impasse et que la suite
 * porte le même nom, le même régime de sens et admet du stationnement.
 */
function chainOf(world: WorldQuery, e0: number): Chain {
  const first = world.edge(e0);
  // suite d'arêtes orientées : [arête, sens a→b]
  const seq: [number, boolean][] = [[e0, true]];
  const used = new Set<number>([e0]);
  const extend = (atEnd: boolean): void => {
    for (let guard = 0; guard < 400; guard++) {
      const [e, fwd] = atEnd ? seq[seq.length - 1]! : seq[0]!;
      const ed = world.edge(e);
      const node = atEnd ? (fwd ? ed.b : ed.a) : (fwd ? ed.a : ed.b);
      const f = nodeFacts(world, node);
      if (f.deg !== 2) return;
      let next = -1;
      for (const k of world.node(node).edges) {
        if (k === e || used.has(k)) continue;
        const nk = world.edge(k);
        if (!isVehicleEdge(nk)) continue;
        next = k;
      }
      if (next < 0) return;
      const ne = world.edge(next);
      if (!parkEligible(ne) || ne.oneway !== first.oneway || ne.name !== first.name) return;
      // sens de l'arête suivante dans le tronçon
      const nfwd = atEnd ? ne.a === node : ne.b === node;
      if (first.oneway && !nfwd) return; // sens unique opposé : ce n'est plus la même chaussée
      used.add(next);
      if (atEnd) seq.push([next, nfwd]);
      else seq.unshift([next, nfwd]);
    }
  };
  extend(true);
  extend(false);
  const pts: number[] = [];
  const widthAt: number[] = [];
  for (const [e, fwd] of seq) {
    const before = pts.length >> 1;
    appendEdge(pts, world.edge(e), fwd);
    const after = pts.length >> 1;
    for (let i = Math.max(0, before - 1); i < after; i++) widthAt[i] = world.edge(e).width;
  }
  const s: number[] = [0];
  for (let i = 1; i < pts.length >> 1; i++) s.push(s[i - 1]! + Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!));
  const [eA, fA] = seq[0]!;
  const [eB, fB] = seq[seq.length - 1]!;
  const startNode = fA ? world.edge(eA).a : world.edge(eA).b;
  const endNode = fB ? world.edge(eB).b : world.edge(eB).a;
  const endClear = (n: number): number => {
    const f = nodeFacts(world, n);
    if (f.deg >= 3) return f.radius + SLOT_RULES.clearJunction;
    if (f.signal || f.crossing) return SLOT_RULES.clearCrossing;
    return f.deg <= 1 ? 3 : 0.3;
  };
  return {
    name: first.name, oneway: first.oneway, edges: seq.map((q) => q[0]), pts, s, width: widthAt,
    length: s[s.length - 1]!, clear0: endClear(startNode), clear1: endClear(endNode),
  };
}

interface ChainPoint { x: number; z: number; dx: number; dz: number; width: number }

/** Point du tronçon à l'abscisse `s` (bornée), décalé de `lat` m à DROITE du sens du tronçon (formule de graph.ts). */
function chainPoint(c: Chain, s: number, lat: number, out: ChainPoint): void {
  const n = c.pts.length >> 1;
  let i = 1;
  while (i < n - 1 && c.s[i]! < s) i++;
  const ax = c.pts[i * 2 - 2]!;
  const az = c.pts[i * 2 - 1]!;
  const bx = c.pts[i * 2]!;
  const bz = c.pts[i * 2 + 1]!;
  const l = Math.hypot(bx - ax, bz - az) || 1e-6;
  const dx = (bx - ax) / l;
  const dz = (bz - az) / l;
  let t = s - c.s[i - 1]!;
  if (t < 0) t = 0;
  if (t > l) t = l;
  out.x = ax + dx * t - dz * lat;
  out.z = az + dz * t + dx * lat;
  out.dx = dx;
  out.dz = dz;
  out.width = c.width[i - 1] ?? c.width[0]!;
}

/** Projection d'un point sur le tronçon : abscisse et décalage latéral signé (> 0 : à droite). */
function chainProject(c: Chain, x: number, z: number): { s: number; lat: number; dist: number } {
  const n = c.pts.length >> 1;
  let best = { s: 0, lat: 0, dist: Infinity };
  for (let i = 1; i < n; i++) {
    const ax = c.pts[i * 2 - 2]!;
    const az = c.pts[i * 2 - 1]!;
    const ex = c.pts[i * 2]! - ax;
    const ez = c.pts[i * 2 + 1]! - az;
    const l2 = ex * ex + ez * ez;
    if (l2 < 1e-9) continue;
    let t = ((x - ax) * ex + (z - az) * ez) / l2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + ex * t;
    const pz = az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) {
      const l = Math.sqrt(l2);
      // droite du sens (dx, dz) : (−dz, dx)
      const lat = ((x - px) * (-ez / l) + (z - pz) * (ex / l));
      best = { s: c.s[i - 1]! + t * l, lat, dist: d };
    }
  }
  return best;
}

// ───────────────────────────── contrôles d'une place ─────────────────────────────

/** Contexte de contrôle des places d'un site (nœuds à dégager, limites de la carte). */
interface SlotContext {
  world: WorldQuery;
  nodes: { x: number; z: number; clear: number }[];
}

function slotContext(world: WorldQuery, x: number, z: number, r: number): SlotContext {
  return { world, nodes: clearanceNodes(world, x, z, r) };
}

const SAMPLE: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

/** Raison pour laquelle une place est mauvaise (null : bonne). Mêmes règles au calcul et au contrôle. */
function slotProblem(sc: SlotContext, s: Pick<YardSlot, 'x' | 'z' | 'heading' | 'len' | 'width'>): string | null {
  const w = sc.world;
  const b = w.bounds;
  const m = SLOT_RULES.boundsMargin;
  if (s.x < b.minX + m || s.x > b.maxX - m || s.z < b.minZ + m || s.z > b.maxZ - m) return 'trop près du bord de la carte';
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const hw = s.width * 0.5;
  const reach = Math.max(0, s.len * 0.5 - hw);
  const ends: [number, number][] = [[s.x, s.z], [s.x + fx * reach, s.z + fz * reach], [s.x - fx * reach, s.z - fz * reach]];
  for (const [x, z] of ends) {
    if (!w.isFree(x, z, hw)) return `obstacle en (${x.toFixed(1)}, ${z.toFixed(1)})`;
    const surf = w.surfaceAt(x, z);
    if (BAD_SLOT_SURFACES.has(surf)) return `sol « ${surf} » en (${x.toFixed(1)}, ${z.toFixed(1)})`;
  }
  // coins : jamais dans un bâtiment ni dans l'eau
  const ring = slotRing(s);
  for (let i = 0; i < ring.length; i += 2) {
    const surf = w.surfaceAt(ring[i]!, ring[i + 1]!);
    if (surf === 'building' || surf === 'water' || surf === 'interior') return `coin sur « ${surf} »`;
  }
  const ax = s.x + fx * s.len * 0.5;
  const az = s.z + fz * s.len * 0.5;
  const bx = s.x - fx * s.len * 0.5;
  const bz = s.z - fz * s.len * 0.5;
  for (const n of sc.nodes) {
    const d = distToSegment(n.x, n.z, ax, az, bx, bz);
    if (d < n.clear - 1e-3) return `à ${d.toFixed(1)} m d'un carrefour ou d'un passage (dégagement ${n.clear.toFixed(1)} m)`;
  }
  if (!w.nearestRoad(s.x, s.z, SAMPLE, 12)) return 'aucune chaussée';
  const e = w.edge(SAMPLE.edgeId);
  if (!parkEligible(e)) return `chaussée « ${e.name || '?'} » trop étroite pour stationner (${e.width} m)`;
  return null;
}

// ───────────────────────────── itinéraires ─────────────────────────────

/**
 * Largeur de chaussée le long d'un itinéraire de véhicule : échantillon tous les SLOT_RULES.sampleStep m (et au
 * milieu de chaque portion), loin des sommets pour ne pas lire la rue transversale d'un carrefour ; les points
 * d'accroche hors voie (départ, arrivée) sont ignorés. findPath ne fait que PÉNALISER les voies étroites (minWidth
 * est un coût) : c'est ce contrôle qui garantit la largeur.
 */
export function pathWidthOk(
  world: WorldQuery, path: ArrayLike<number>, min: number, minOneway: number = min, upTo: number = Infinity,
): { ok: boolean; worst: number; at: { x: number; z: number } | null } {
  let worst = Infinity;
  let worstMin = min;
  let at: { x: number; z: number } | null = null;
  let ok = true;
  const sample = { ...SAMPLE };
  const step = SLOT_RULES.sampleStep;
  const probe = (x: number, z: number): void => {
    if (!world.nearestRoad(x, z, sample, 8)) return;
    if (sample.dist > 1.5) return; // point d'accroche ou raccord, hors de l'axe d'une voie
    const need = sample.oneway ? minOneway : min;
    // on retient la portion la plus en défaut (écart à son minimum), sinon la plus étroite
    if (sample.width < need) {
      if (ok || sample.width - need < worst - worstMin) {
        worst = sample.width;
        worstMin = need;
        at = { x, z };
      }
      ok = false;
    } else if (ok && sample.width < worst) {
      worst = sample.width;
      worstMin = need;
      at = { x, z };
    }
  };
  let travelled = 0;
  for (let i = 2; i + 1 < path.length && travelled < upTo; i += 2) {
    const ax = path[i - 2]!;
    const az = path[i - 1]!;
    const bx = path[i]!;
    const bz = path[i + 1]!;
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-3) continue;
    const margin = Math.min(3, l * 0.25);
    const usable = l - 2 * margin;
    const n = Math.max(1, Math.ceil(usable / step));
    for (let k = 0; k < n; k++) {
      const t = (margin + (usable * (k + 0.5)) / n) / l;
      if (travelled + t * l > upTo) break;
      probe(ax + (bx - ax) * t, az + (bz - az) * t);
    }
    travelled += l;
  }
  return { ok, worst, at };
}

/**
 * Règles de largeur d'un itinéraire de sortie : tout véhicule, au moins SLOT_RULES.pathWidthVan m sur tout le trajet ;
 * un engin (canon à eau, Centaure, car), en plus, au moins SLOT_RULES.pathWidthEngine m de chaussée à double sens (ou
 * pathWidthVan m de chaussée à sens unique, sans circulation en face) sur les SLOT_RULES.engineExit premiers mètres,
 * la sortie propre au site. Au-delà, le réseau est celui qu'empruntent déjà tous les engins du jeu.
 */
export function exitWidthRules(engine: boolean): { min: number; minOneway: number; upTo: number }[] {
  const all = { min: SLOT_RULES.pathWidthVan, minOneway: SLOT_RULES.pathWidthVan, upTo: Infinity };
  if (!engine) return [all];
  return [all, { min: SLOT_RULES.pathWidthEngine, minOneway: SLOT_RULES.pathWidthVan, upTo: SLOT_RULES.engineExit }];
}

/** Itinéraire de sortie d'un véhicule garé (mêmes options que le pilote automatique, en intervention urgente). */
function exitPath(world: WorldQuery, s: YardSlot, kind: string, tx: number, tz: number, out: number[]): boolean {
  return world.findPath(s.x, s.z, tx, tz, 'vehicle', out, {
    heading: s.heading, uturn: 200, contraflow: 3, minWidth: vehicleWidth(kind) + 1.2,
  });
}

// ───────────────────────────── porte ─────────────────────────────

const HIT: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

/**
 * Portée des rayons d'ouverture devant une porte : SLOT_RULES.rayLen m, ou au moins jusqu'au trottoir d'en face
 * (deux fois la distance de la porte à l'axe de la rue, + 2 m) quand la rue est plus étroite. Une rue de Paris de
 * 5 m entre deux façades ne laisse jamais 25 m de vue sur 90° ; une cour ou un renfoncement ferme les rayons dès
 * les premiers mètres.
 */
export function doorRayLen(world: WorldQuery, x: number, z: number): number {
  const near = nearestEdge(world, x, z, SLOT_RULES.doorRoadMax, isStreet);
  if (!near) return SLOT_RULES.rayLen;
  return Math.min(SLOT_RULES.rayLen, Math.max(8, 2 * near.dist + 2));
}

/** Plus grande ouverture (degrés) devant la porte : rayons de doorRayLen() m tous les 5°, sans obstacle. */
export function openArc(world: WorldQuery, x: number, z: number): number {
  const step = 5;
  const n = 360 / step;
  const len = doorRayLen(world, x, z);
  const open: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * step * Math.PI) / 180;
    const ok = !world.raycast(x, z, x + Math.sin(a) * len, z + Math.cos(a) * len, HIT);
    open.push(ok);
  }
  let best = 0;
  let run = 0;
  for (let i = 0; i < n * 2; i++) {
    if (open[i % n]) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return Math.min(360, best * step);
}

/** Voie la plus proche d'un point parmi celles qui satisfont `accept` (null : aucune dans le rayon). */
function nearestEdge(world: WorldQuery, x: number, z: number, maxDist: number, accept: (e: RoadEdgeInfo) => boolean): { edge: number; dist: number } | null {
  let best: { edge: number; dist: number } | null = null;
  for (let e = 0; e < world.edgeCount; e++) {
    const ed = world.edge(e);
    if (!accept(ed)) continue;
    const d = distToPolyline(x, z, ed.points);
    if (d <= maxDist && (best === null || d < best.dist)) best = { edge: e, dist: d };
  }
  return best;
}

/** Façade touchée depuis la rue : rayons du point de rue le plus proche vers le point d'adresse (0°, ±15°). */
function findFacade(world: WorldQuery, rx: number, rz: number, ax: number, az: number): { x: number; z: number; nx: number; nz: number } | null {
  let ux = ax - rx;
  let uz = az - rz;
  const d = Math.hypot(ux, uz);
  if (d < 0.5) return null;
  ux /= d;
  uz /= d;
  const len = d + 30;
  const hits: { x: number; z: number; nx: number; nz: number; t: number }[] = [];
  for (const deg of [0, 15, -15]) {
    const a = (deg * Math.PI) / 180;
    const vx = ux * Math.cos(a) + uz * Math.sin(a);
    const vz = -ux * Math.sin(a) + uz * Math.cos(a);
    if (!world.raycast(rx, rz, rx + vx * len, rz + vz * len, HIT) || HIT.kind !== 'building') {
      hits.push({ x: NaN, z: NaN, nx: 0, nz: 0, t: Infinity });
      continue;
    }
    let nx = HIT.nx;
    let nz = HIT.nz;
    if (nx * vx + nz * vz > 0) { nx = -nx; nz = -nz; } // normale tournée vers la rue
    hits.push({ x: HIT.x, z: HIT.z, nx, nz, t: HIT.t * len });
  }
  const central = hits[0]!;
  const ref = Number.isFinite(central.t) ? central : hits.filter((h) => Number.isFinite(h.t)).sort((a, b) => a.t - b.t)[0];
  if (!ref) return null;
  // normale moyenne des impacts sur la même façade (à moins de 4 m de l'impact de référence)
  let nx = 0;
  let nz = 0;
  for (const h of hits) {
    if (!Number.isFinite(h.t) || Math.hypot(h.x - ref.x, h.z - ref.z) > 4) continue;
    nx += h.nx;
    nz += h.nz;
  }
  const nl = Math.hypot(nx, nz) || 1;
  return { x: ref.x, z: ref.z, nx: nx / nl, nz: nz / nl };
}

// ───────────────────────────── calcul de la disposition ─────────────────────────────

interface FileSpec { kind: string; len: number; width: number; file: number; spare: boolean }

/** Places à poser, dans l'ordre (tête de la première file d'abord) : unités, puis la file de réserve. */
function fileSpecs(seed: CommissariatSeed): { specs: FileSpec[]; perFile: number[] } {
  const specs: FileSpec[] = [];
  const perFile: number[] = [];
  let vehicles = 0;
  seed.stock.forEach((t, f) => {
    perFile.push(t.vehicles);
    vehicles += t.vehicles;
    for (let i = 0; i < t.vehicles; i++) {
      specs.push({ kind: t.vehicle, len: vehicleLen(t.vehicle), width: vehicleWidth(t.vehicle), file: f, spare: false });
    }
  });
  const spares = Math.max(SLOT_RULES.spareMin, Math.ceil(vehicles * SLOT_RULES.spareRatio));
  perFile.push(spares);
  for (let i = 0; i < spares; i++) {
    specs.push({ kind: 'fourgon_crs', len: SPARE_LEN, width: SPARE_WIDTH, file: seed.stock.length, spare: true });
  }
  return { specs, perFile };
}

/** Intervalle entre deux places successives. */
function gapBetween(a: FileSpec, b: FileSpec): number {
  return a.kind === 'moto_bravm' && b.kind === 'moto_bravm' ? SLOT_RULES.motoGap : SLOT_RULES.gap;
}

/** Longueur totale de la rangée. */
function runLength(specs: readonly FileSpec[]): number {
  let t = 0;
  for (let i = 0; i < specs.length; i++) t += specs[i]!.len + (i > 0 ? gapBetween(specs[i - 1]!, specs[i]!) : 0);
  return t;
}

/**
 * Pose la rangée sur un côté d'un tronçon, la tête (aval) à l'abscisse sHead. `side` : +1 à droite du sens du
 * tronçon, −1 à gauche ; `down` : +1 si la circulation de ce côté va dans le sens du tronçon.
 */
function placeRun(c: Chain, specs: readonly FileSpec[], sHead: number, side: number, down: number, shift = 0): YardSlot[] {
  const out: YardSlot[] = [];
  const pt: ChainPoint = { x: 0, z: 0, dx: 0, dz: 1, width: 0 };
  let offset = 0;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i]!;
    if (i > 0) offset += gapBetween(specs[i - 1]!, sp);
    const sc = sHead - down * (offset + sp.len * 0.5);
    chainPoint(c, sc, 0, pt);
    const lat = side * (pt.width * 0.5 - SLOT_RULES.curbMargin - sp.width * 0.5 - shift);
    chainPoint(c, sc, lat, pt);
    out.push({
      x: pt.x, z: pt.z, heading: Math.atan2(down * pt.dx, down * pt.dz), len: sp.len, width: sp.width, file: sp.file,
      spare: sp.spare,
    });
    offset += sp.len;
  }
  return out;
}

const chainPointTmp: ChainPoint = { x: 0, z: 0, dx: 0, dz: 1, width: 0 };

/**
 * Un côté de chaussée où poser des places : tronçon, côté (+1 droite / −1 gauche), sens de la circulation ; `shift` :
 * écart supplémentaire au bord de la voie (m), quand le trottoir réel déborde la largeur de voie de la carte.
 */
interface Curb { chain: Chain; side: number; down: number; shift: number }

interface Placement { curb: Curb; sHead: number; slots: YardSlot[]; score: number }

/**
 * Contrôle d'une place au calcul : mêmes règles que validateSite (slotProblem, puis cheminement à pied depuis la
 * porte, mis en cache au demi-mètre).
 */
interface Checker {
  problem(s: YardSlot): string | null;
  /** Itinéraires de sortie d'une tête de file (mêmes règles que validateSite). */
  route(s: YardSlot, kind: string): string | null;
}

function makeChecker(world: WorldQuery, sc: SlotContext, door: { x: number; z: number }): Checker {
  const foot = new Map<string, string | null>();
  const routes = new Map<string, string | null>();
  const buf: number[] = [];
  return {
    problem(s: YardSlot): string | null {
      const p = slotProblem(sc, s) ?? doorDistanceProblem(door, s);
      if (p !== null) return p;
      const key = `${Math.round(s.x * 2)},${Math.round(s.z * 2)}`;
      let f = foot.get(key);
      if (f === undefined) {
        f = footProblem(world, door, s, buf);
        foot.set(key, f);
      }
      return f;
    },
    route(s: YardSlot, kind: string): string | null {
      const key = `${Math.round(s.x * 2)},${Math.round(s.z * 2)},${kind}`;
      let r = routes.get(key);
      if (r === undefined) {
        r = routeProblem(world, s, kind, buf)[0] ?? null;
        routes.set(key, r);
      }
      return r;
    },
  };
}

/** Problèmes des itinéraires de sortie d'une tête de file vers Concorde et République (vide : corrects). */
function routeProblem(world: WorldQuery, head: YardSlot, kind: string, path: number[]): string[] {
  const out: string[] = [];
  const engine = ENGINE_KINDS.has(kind);
  for (const dst of CHECK_DESTINATIONS) {
    if (!exitPath(world, head, kind, dst.x, dst.z, path) || path.length < 4) {
      out.push(`aucun itinéraire vers ${dst.name}`);
      continue;
    }
    const straight = Math.hypot(dst.x - head.x, dst.z - head.z);
    const len = polylineLength(path);
    if (len > SLOT_RULES.vehicleDetour * straight + 300) out.push(`itinéraire vers ${dst.name} de ${len.toFixed(0)} m pour ${straight.toFixed(0)} m`);
    for (const r of exitWidthRules(engine)) {
      const w = pathWidthOk(world, path, r.min, r.minOneway, r.upTo);
      if (!w.ok) out.push(`chaussée de ${w.worst.toFixed(1)} m < ${r.min} m vers ${dst.name} en (${w.at!.x.toFixed(0)}, ${w.at!.z.toFixed(0)})`);
    }
  }
  return out;
}

/** Place trop loin de la porte (null : correct). */
function doorDistanceProblem(door: { x: number; z: number }, s: { x: number; z: number }): string | null {
  const d = Math.hypot(s.x - door.x, s.z - door.z);
  return d > SLOT_RULES.slotMaxFromDoor ? `à ${d.toFixed(0)} m de la porte` : null;
}

/** Cheminement à pied de la porte à une place (null : correct). */
function footProblem(world: WorldQuery, door: { x: number; z: number }, s: { x: number; z: number }, buf: number[]): string | null {
  if (!world.findPath(door.x, door.z, s.x, s.z, 'foot', buf) || buf.length < 4) return 'aucun cheminement à pied depuis la porte';
  const straight = Math.hypot(s.x - door.x, s.z - door.z);
  const len = polylineLength(buf);
  if (len > SLOT_RULES.footDetour * straight + 10) return `détour à pied ${len.toFixed(0)} m pour ${straight.toFixed(0)} m`;
  return null;
}

/**
 * Meilleure position d'une suite de places sur un côté de chaussée : positions essayées de la plus proche de la porte
 * à la plus lointaine, la première valide gagne. `extra` : contrôle supplémentaire (recouvrement des places déjà
 * posées).
 */
function bestOnCurb(
  ck: Checker, curb: Curb, specs: readonly FileSpec[], door: { x: number; z: number }, why: string[],
  extra?: (s: YardSlot) => string | null,
): Placement | null {
  const heads: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    if (!specs[i]!.spare && (i === 0 || specs[i - 1]!.file !== specs[i]!.file)) heads.push(i);
  }
  const c = curb.chain;
  const down = curb.down;
  const total = runLength(specs);
  const lo = c.clear0;
  const hi = c.length - c.clear1;
  const label = `${c.name || '?'} côté ${curb.side > 0 ? 'droit' : 'gauche'}`;
  if (hi - lo < total) {
    why.push(`${label} : ${Math.max(0, hi - lo).toFixed(0)} m utiles pour ${total.toFixed(0)} m`);
    return null;
  }
  // tête en aval : sHead ∈ [lo + total, hi] si down = +1, [lo, hi − total] sinon
  const h0 = down > 0 ? lo + total : lo;
  const h1 = down > 0 ? hi : hi - total;
  const cands: { sHead: number; score: number }[] = [];
  const pt: ChainPoint = { x: 0, z: 0, dx: 0, dz: 1, width: 0 };
  for (let sHead = h0; sHead <= h1 + 1e-6; sHead += 0.5) {
    chainPoint(c, sHead - down * total * 0.5, 0, pt);
    cands.push({ sHead, score: Math.hypot(pt.x - door.x, pt.z - door.z) });
  }
  cands.sort((a, b) => a.score - b.score || a.sHead - b.sHead);
  let first = '';
  for (const cand of cands) {
    const slots = placeRun(c, specs, cand.sHead, curb.side, down, curb.shift);
    let ok = true;
    for (const s of slots) {
      const p = ck.problem(s) ?? (extra ? extra(s) : null);
      if (p !== null) {
        ok = false;
        if (!first) first = p;
        break;
      }
    }
    for (let h = 0; ok && h < heads.length; h++) {
      const p = ck.route(slots[heads[h]!]!, specs[heads[h]!]!.kind);
      if (p !== null) {
        ok = false;
        if (!first) first = p;
      }
    }
    if (ok) return { curb, sHead: cand.sHead, slots, score: cand.score };
  }
  why.push(`${label} : ${first}`);
  return null;
}

/** Résultat brut du calcul (avant arrondi). */
export interface YardLayout {
  def: CommissariatDef;
  frozen: FrozenLayout;
  /** Notes de calcul (rue de repli, côté opposé, porte déplacée…). */
  notes: string[];
}

/** Échec du calcul : message explicite (graine à déplacer). */
export class LayoutError extends Error {}

/** Porte candidate : façade touchée, porte à 0,8 m devant, ouverture. */
interface DoorCandidate { facade: { x: number; z: number; nx: number; nz: number }; door: { x: number; z: number }; arc: number }

/** Problème d'une porte (null : correcte). */
function doorProblem(world: WorldQuery, door: { x: number; z: number }): string | null {
  const surf = world.surfaceAt(door.x, door.z);
  if (!DOOR_SURFACES.has(surf)) return `porte sur « ${surf} »`;
  if (!world.isFree(door.x, door.z, 0.4)) return 'porte encombrée';
  if (!nearestEdge(world, door.x, door.z, SLOT_RULES.doorRoadMax, isStreet)) return 'porte loin de la rue';
  return null;
}

/**
 * (a)–(b) Porte : la façade touchée depuis la rue vers le point d'adresse ; si l'ouverture y est insuffisante, la
 * porte glisse le long de la même rue (même nom, ±60 m) jusqu'au premier point de façade qui convient.
 */
function findDoor(
  world: WorldQuery, seed: CommissariatSeed, R: RoadEdgeInfo, rx: number, rz: number, notes: string[],
  streetOk: (e: RoadEdgeInfo) => boolean,
): DoorCandidate {
  const first = findFacade(world, rx, rz, seed.x, seed.z);
  const tried: string[] = [];
  if (first) {
    const door = { x: first.x + first.nx * 0.8, z: first.z + first.nz * 0.8 };
    const p = doorProblem(world, door);
    const arc = openArc(world, door.x, door.z);
    if (!p && arc >= SLOT_RULES.openArcDeg) return { facade: first, door, arc };
    tried.push(p ?? `ouverture ${arc}°`);
  }
  // côté de la rue où se trouve l'adresse
  const pr = { x: seed.x - rx, z: seed.z - rz };
  const pts: { x: number; z: number; dx: number; dz: number; d: number }[] = [];
  for (let e = 0; e < world.edgeCount; e++) {
    const ed = world.edge(e);
    if (ed.name !== R.name || !streetOk(ed)) continue;
    const p = ed.points;
    for (let i = 2; i + 1 < p.length; i += 2) {
      const ax = p[i - 2]!;
      const az = p[i - 1]!;
      const l = Math.hypot(p[i]! - ax, p[i + 1]! - az);
      if (l < 1e-3) continue;
      const dx = (p[i]! - ax) / l;
      const dz = (p[i + 1]! - az) / l;
      for (let t = 0; t <= l; t += 2) {
        const x = ax + dx * t;
        const z = az + dz * t;
        const d = Math.hypot(x - rx, z - rz);
        if (d <= 60) pts.push({ x, z, dx, dz, d });
      }
    }
  }
  pts.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  for (const q of pts) {
    // perpendiculaire à la rue, du côté de l'adresse
    let nx = -q.dz;
    let nz = q.dx;
    if (nx * pr.x + nz * pr.z < 0) { nx = -nx; nz = -nz; }
    const f = findFacade(world, q.x, q.z, q.x + nx * 20, q.z + nz * 20);
    if (!f) continue;
    const door = { x: f.x + f.nx * 0.8, z: f.z + f.nz * 0.8 };
    if (doorProblem(world, door)) continue;
    const arc = openArc(world, door.x, door.z);
    if (arc < SLOT_RULES.openArcDeg) continue;
    notes.push(`porte déplacée de ${q.d.toFixed(0)} m le long de ${R.name} (${tried.join(', ') || 'façade introuvable'} à l'adresse)`);
    return { facade: f, door, arc };
  }
  throw new LayoutError(`${seed.id} : aucune porte acceptable le long de ${R.name || 'la rue'} (${tried.join(', ')})`);
}

/**
 * Calcule la disposition d'un site sur la vraie carte (données chargées autour du point d'adresse). Déterministe :
 * aucune part de hasard, parcours dans l'ordre des données.
 */
export function layoutYard(world: WorldQuery, seed: CommissariatSeed): YardLayout {
  const notes: string[] = [];
  // (a) rue du commissariat
  const streetOk = seed.pedestrianStreet === true ? isPedestrianStreet : isStationStreet;
  const road = nearestEdge(world, seed.x, seed.z, SLOT_RULES.roadSearch, streetOk);
  if (!road) throw new LayoutError(`${seed.id} : aucune rue à moins de ${SLOT_RULES.roadSearch} m du point d'adresse`);
  const R = world.edge(road.edge);
  // point de la rue le plus proche de l'adresse
  let rx = R.points[0]!;
  let rz = R.points[1]!;
  {
    let bd = Infinity;
    for (let i = 2; i + 1 < R.points.length; i += 2) {
      const ax = R.points[i - 2]!;
      const az = R.points[i - 1]!;
      const ex = R.points[i]! - ax;
      const ez = R.points[i + 1]! - az;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 1e-9 ? ((seed.x - ax) * ex + (seed.z - az) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + ex * t - seed.x, az + ez * t - seed.z);
      if (d < bd) { bd = d; rx = ax + ex * t; rz = az + ez * t; }
    }
  }
  // (b) façade et porte
  const { facade, door } = findDoor(world, seed, R, rx, rz, notes, streetOk);
  // (c) côtés de chaussée candidats : la rue du commissariat si elle admet du stationnement, puis les rues éligibles
  // à moins de 150 m de la porte sans grand détour à pied, des plus proches aux plus lointaines
  const { specs, perFile } = fileSpecs(seed);
  const total = runLength(specs);
  const sc = slotContext(world, door.x, door.z, SLOT_RULES.altStreetMax + total + 60);
  const ck = makeChecker(world, sc, door);
  const candidates: { edge: number; dist: number }[] = [];
  for (let e = 0; e < world.edgeCount; e++) {
    const ed = world.edge(e);
    if (!parkEligible(ed)) continue;
    const d = distToPolyline(door.x, door.z, ed.points);
    if (d <= SLOT_RULES.altStreetMax) candidates.push({ edge: e, dist: d });
  }
  const own = (e: number): boolean => world.edge(e).name === R.name;
  candidates.sort((a, b) => (own(a.edge) !== own(b.edge) ? (own(a.edge) ? -1 : 1) : a.dist - b.dist || a.edge - b.edge));
  const footBuf: number[] = [];
  const tried = new Set<number>();
  const curbs: Curb[] = [];
  const why: string[] = [];
  for (const cand of candidates) {
    if (tried.has(cand.edge)) continue;
    const chain = chainOf(world, cand.edge);
    for (const e of chain.edges) tried.add(e);
    const pr = chainProject(chain, door.x, door.z);
    if (!own(cand.edge)) {
      // à pied, pas de grand détour depuis la porte
      chainPoint(chain, pr.s, 0, chainPointTmp);
      const p = footProblem(world, door, chainPointTmp, footBuf);
      if (p) {
        why.push(`${chain.name || '?'} : ${p}`);
        continue;
      }
    }
    const doorSide = pr.lat >= 0 ? 1 : -1;
    for (const side of [doorSide, -doorSide]) {
      curbs.push({ chain, side, down: chain.oneway || side > 0 ? 1 : -1, shift: own(cand.edge) ? seed.curbShift ?? 0 : 0 });
    }
  }
  // (d) toute la rangée sur un même côté de chaussée, sinon file par file (chaque file reste d'un seul tenant)
  let placements: Placement[] = [];
  for (const curb of curbs) {
    const p = bestOnCurb(ck, curb, specs, door, why);
    if (p) {
      placements = [p];
      break;
    }
  }
  if (placements.length === 0) {
    notes.push('files réparties sur plusieurs tronçons');
    const groups: FileSpec[][] = [];
    for (const s of specs) {
      const last = groups[groups.length - 1];
      // les places de réserve se posent deux par deux
      const split = last !== undefined && last[0]!.file === s.file && s.spare && last.length >= 2;
      if (last !== undefined && last[0]!.file === s.file && !split) last.push(s);
      else groups.push([s]);
    }
    const placed: YardSlot[] = [];
    const clearOf = (s: YardSlot): string | null => {
      for (const o of placed) if (slotsOverlap(s, o, SLOT_RULES.gap - 0.2)) return 'recouvre une place déjà posée';
      return null;
    };
    for (const g of groups) {
      let best: Placement | null = null;
      for (const curb of curbs) {
        const p = bestOnCurb(ck, curb, g, door, why, clearOf);
        if (p && (best === null || p.score < best.score)) best = p;
      }
      if (!best) {
        throw new LayoutError(`${seed.id} : impossible de poser la file ${g[0]!.file} (${g.length} véhicule(s)) à moins de ${SLOT_RULES.altStreetMax} m (porte ${door.x.toFixed(0)}, ${door.z.toFixed(0)}) :\n  ${why.join('\n  ')}`);
      }
      placements.push(best);
      placed.push(...best.slots);
    }
  }
  const head = placements[0]!;
  // rue(s) des places, dans l'ordre de pose (« Rue des Petits Champs et Avenue de l'Opéra »)
  const bayNames: string[] = [];
  for (const p of placements) {
    const n = p.curb.chain.name || 'rue sans nom';
    if (!bayNames.includes(n)) bayNames.push(n);
  }
  const bayStreet = bayNames.join(' et ');
  const street = R.name || bayStreet;
  for (const p of placements) {
    if (p.curb.chain.name !== R.name) {
      notes.push(`rue de repli : ${p.curb.chain.name} (${R.name} trop étroite pour stationner)`);
      break;
    }
  }
  // (e) sortie : sur la chaussée, 25 m en aval de la tête de la première file
  const ex: ChainPoint = { x: 0, z: 0, dx: 0, dz: 1, width: 0 };
  const sExit = head.sHead + head.curb.down * SLOT_RULES.exitAhead;
  chainPoint(head.curb.chain, sExit, 0, ex);
  const exitLat = head.curb.chain.oneway ? 0 : head.curb.side * ex.width * 0.25;
  chainPoint(head.curb.chain, sExit, exitLat, ex);
  const exitH = Math.atan2(head.curb.down * ex.dx, head.curb.down * ex.dz);
  // files : indices consécutifs, tête d'abord (ordre de pose)
  const all: YardSlot[] = [];
  for (const p of placements) all.push(...p.slots);
  const files: number[][] = [];
  let k = 0;
  for (let f = 0; f < perFile.length - 1; f++) {
    const idx: number[] = [];
    for (let i = 0; i < perFile[f]!; i++) idx.push(k++);
    files.push(idx);
  }
  const frozen: FrozenLayout = {
    street, bayStreet: bayStreet === street ? null : bayStreet,
    door: [round(door.x, 0.1), round(door.z, 0.1)],
    facade: [round(facade.x, 0.1), round(facade.z, 0.1), round(Math.atan2(facade.nx, facade.nz), 0.001)],
    exit: [round(ex.x, 0.1), round(ex.z, 0.1), round(normAngle(exitH), 0.001)],
    slots: all.map((s) => [
      round(s.x, 0.1), round(s.z, 0.1), round(normAngle(s.heading), 0.001), s.len, s.width, s.file, s.spare ? 1 : 0,
    ] as const),
    files,
  };
  return { def: assembleCommissariat(seed, frozen), frozen, notes };
}

/** Texte TypeScript d'une disposition figée (à coller dans FROZEN_LAYOUTS). */
export function printFrozen(id: string, l: FrozenLayout): string {
  const n = (v: number, d: number): string => {
    const s = v.toFixed(d);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  };
  const q = (s: string): string => JSON.stringify(s).replace(/^"(.*)"$/, (all, body: string) => (body.includes("'") ? all : `'${body}'`));
  const lines: string[] = [];
  lines.push(`  ${/^[a-z_][a-z0-9_]*$/i.test(id) ? id : q(id)}: {`);
  lines.push(`    street: ${q(l.street)}, bayStreet: ${l.bayStreet === null ? 'null' : q(l.bayStreet)},`);
  lines.push(`    door: [${n(l.door[0], 1)}, ${n(l.door[1], 1)}], facade: [${l.facade.map((v, i) => n(v, i < 2 ? 1 : 3)).join(', ')}],`);
  lines.push(`    exit: [${l.exit.map((v, i) => n(v, i < 2 ? 1 : 3)).join(', ')}],`);
  lines.push('    slots: [');
  for (const s of l.slots) {
    lines.push(`      [${n(s[0], 1)}, ${n(s[1], 1)}, ${n(s[2], 3)}, ${n(s[3], 2)}, ${n(s[4], 2)}, ${s[5]}, ${s[6]}],`);
  }
  lines.push('    ],');
  lines.push(`    files: [${l.files.map((f) => `[${f.join(', ')}]`).join(', ')}],`);
  lines.push('  },');
  return lines.join('\n');
}

// ───────────────────────────── contrôle d'un site figé ─────────────────────────────

/** Bilan du contrôle d'un site. */
export interface SiteReport {
  id: string;
  ok: boolean;
  problems: string[];
  /** Ouverture devant la porte (degrés). */
  openArcDeg: number;
  slots: { index: number; ok: boolean; why: string }[];
}

/**
 * Contrôle complet d'un site figé (à appeler après whenLoaded autour de la porte) : porte, façade, places,
 * dégagements, règle de stationnement, recouvrements, itinéraires de sortie vers Concorde et République avec la
 * largeur échantillonnée, cheminement à pied de la porte à chaque place.
 */
export function validateSite(world: WorldQuery, def: CommissariatDef): SiteReport {
  const problems: string[] = [];
  const b = world.bounds;
  const m = SLOT_RULES.boundsMargin;
  const { door, facade } = def;
  if (door.x < b.minX + m || door.x > b.maxX - m || door.z < b.minZ + m || door.z > b.maxZ - m) {
    problems.push('porte trop près du bord de la carte');
  }
  // façade : un rayon de la porte vers l'intérieur touche un bâtiment tout près
  const fx = Math.sin(facade.heading);
  const fz = Math.cos(facade.heading);
  if (!world.raycast(door.x, door.z, door.x - fx * 3, door.z - fz * 3, HIT) || HIT.kind !== 'building') {
    problems.push('façade introuvable derrière la porte');
  }
  const doorSurf = world.surfaceAt(door.x, door.z);
  if (!DOOR_SURFACES.has(doorSurf)) problems.push(`porte sur « ${doorSurf} » (trottoir, place ou pavés attendus)`);
  if (!world.isFree(door.x, door.z, 0.4)) problems.push('porte encombrée');
  const arc = openArc(world, door.x, door.z);
  if (arc < SLOT_RULES.openArcDeg) problems.push(`ouverture devant la porte ${arc}° < ${SLOT_RULES.openArcDeg}°`);
  if (!nearestEdge(world, door.x, door.z, SLOT_RULES.doorRoadMax, isStreet)) {
    problems.push(`aucune rue à moins de ${SLOT_RULES.doorRoadMax} m de la porte`);
  }
  // places
  let reach = 0;
  for (const s of def.slots) reach = Math.max(reach, Math.hypot(s.x - door.x, s.z - door.z));
  const sc = slotContext(world, door.x, door.z, reach + 40);
  const slots: SiteReport['slots'] = [];
  const footBuf: number[] = [];
  const kindOf = (i: number): string => {
    for (const t of def.stock) if (t.slots.includes(i)) return t.vehicle;
    return 'fourgon_crs';
  };
  def.slots.forEach((s, i) => {
    let why = slotProblem(sc, s) ?? doorDistanceProblem(door, s) ?? '';
    if (!why && s.len < vehicleLen(kindOf(i)) - 1e-6) why = `place trop courte (${s.len} m)`;
    if (!why) {
      for (let j = 0; j < i; j++) {
        if (slotsOverlap(s, def.slots[j]!, 0.4)) { why = `recouvre la place ${j}`; break; }
      }
    }
    if (!why) why = footProblem(world, door, s, footBuf) ?? '';
    slots.push({ index: i, ok: why === '', why });
    if (why) problems.push(`place ${i} : ${why}`);
  });
  // itinéraires de sortie depuis chaque tête de file
  const path: number[] = [];
  for (const t of def.stock) {
    if (t.slots.length === 0) { problems.push(`${t.callsign} : aucune place`); continue; }
    const head = def.slots[t.slots[0]!]!;
    for (const p of routeProblem(world, head, t.vehicle, path)) problems.push(`${t.callsign} : ${p}`);
  }
  return { id: def.id, ok: problems.length === 0, problems, openArcDeg: arc, slots };
}

/** Rayon à charger autour de la porte avant validateSite (porte et toutes les places, avec marge). */
export function siteLoadRadius(def: CommissariatDef): number {
  let r = 250;
  for (const s of def.slots) r = Math.max(r, Math.hypot(s.x - def.door.x, s.z - def.door.z) + 60);
  return r;
}
