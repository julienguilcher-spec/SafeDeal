/* =====================================================================================
 * Ordres directs — LA DÉSIGNATION : ce que le joueur montre du regard, pour l'ordre prêt (Entrée) et la roue (F).
 *
 * Le joueur du Mac sans souris tourne la vue aux flèches et garde la caméra droite : le point visé au sol est alors
 * toujours à 80 m (la portée du réticule), jamais la rue juste devant lui. La désignation ne s'appuie donc pas sur ce
 * point mais sur des CANDIDATS le long du regard, du plus proche au plus loin :
 *   - le front de la foule (premier point du rayon avec un manifestant à 6 m et au moins 8 à 15 m) ;
 *   - chaque débouché de rue et carrefour (le nom de la rue la plus proche change le long du rayon, ou le rayon passe un
 *     nœud du réseau où part une rue d'un autre nom ; le point est pris 6 m dans cette rue, pour que « Bloquer » la
 *     nomme) ;
 *   - le bout du rayon (2D, jusqu'à 400 m, 5 m avant le mur touché, recalé sur la rue la plus proche à 25 m).
 * Caméra droite (tangage au-dessus de −3°) : le plus proche à 15 m au moins. Lever la vue passe au candidat suivant :
 * un candidat par 2° de tangage au pavé tactile ; au clavier, un appui sur Page préc. / Page suiv. (fn + ↑ / ↓ sur un
 * Mac) = exactement un candidat, quelle que soit la durée de l'appui. Tangage sous −3° : le point du réticule au sol.
 * Le rayon lointain n'est relancé que 4 fois par seconde.
 *
 * Personnes (ordres seulement) : un cône de 4° autour du regard, jusqu'à 120 m, en vue directe, pour les AUTEURS d'un
 * fait constaté puis les BLESSÉS (le plus près du rayon d'abord) — jamais pour un policier (un barrage entre le joueur et
 * la rue visée ne doit pas être rappelé à sa place : un policier n'est désigné que sous le réticule même, et seulement
 * si son unité est sous ses ordres et n'est pas déjà avec lui). Une personne désignée par le cône le reste tant que le
 * regard ne s'en écarte pas de plus de 8° pendant 0,3 s.
 *
 * Lecture seule : aucune écriture dans la partie. Temps : celui de la simulation (aucun hasard).
 * ===================================================================================== */

import type { GameContext, Person, RayHit, RoadSample } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { CommandCore } from '../core';
import { designationAt } from './env';
import type { Designation } from './types';
import { placeBare } from './words';

const DEG = Math.PI / 180;
/** Demi-angle du cône des personnes (rad) et écart qui fait lâcher une personne désignée (rad), après 0,3 s. */
export const CONE = 4 * DEG;
export const STICKY_ANGLE = 8 * DEG;
export const STICKY_TIME = 0.3;
/** Portée du cône des personnes (m) : celle d'Interpeller (natural.ts RANGE.arrest). */
export const PERSON_RANGE = 120;
/** Rayon lointain : portée (m), recul avant le mur (m), recalage sur la rue (m). */
export const FAR_RANGE = 400;
export const WALL_BACKOFF = 5;
export const ROAD_SNAP = 25;
/** Point du réticule au sol au-delà duquel la désignation est « lointaine » (sim/people/tuning.ts AIM_GROUND_RANGE). */
export const AIM_GROUND_RANGE = 80;
/** Candidats : distance minimale (m), pas d'échantillonnage du rayon (m), fusion de deux candidats proches (m). */
export const CANDIDATE_MIN = 15;
export const SAMPLE_STEP = 3;
export const MERGE_DISTANCE = 12;
/** Débouché de rue : le point est pris si loin dans la rue qui part du nœud (m). */
export const MOUTH_INTO = 6;
/** Front de foule : manifestant à moins de 6 m du rayon, et au moins 8 à 15 m de ce point. */
export const CROWD_PROBE = 6;
export const CROWD_RADIUS = 15;
export const CROWD_MIN = 8;
/** Point le plus proche désignable (m) : en deçà (mur), rien. */
export const MIN_POINT = 6;
/** Tangage (degrés) : en dessous, le point du réticule ; un candidat par STEP_DEG au-dessus ; au-delà de SKY_DEG, le ciel. */
export const LEVEL_MIN_DEG = -3;
export const STEP_DEG = 2;
export const SKY_DEG = 35;
/** Relance du rayon lointain et du cône (s). */
export const SCAN_PERIOD = 0.25;

/** Un candidat le long du regard. */
export interface RayCandidate {
  kind: 'rue' | 'foule' | 'bout';
  x: number;
  z: number;
  /** Distance au joueur (m). */
  distance: number;
  /** Nom du lieu sans article (« rue Saint-Gilles »), '' s'il n'en a pas. */
  place: string;
}

/** D'où et vers où le joueur regarde. */
export interface DesignateView {
  /** Origine du regard (le joueur). */
  x: number;
  z: number;
  /** Cap et tangage de la caméra (rad ; tangage positif vers le haut). */
  yaw: number;
  pitch: number;
  /** Point du réticule au sol et personne sous le réticule (PlayerState.aimX / aimZ / aimedPersonId). */
  aimX: number;
  aimZ: number;
  aimedPersonId: number;
  /** Le joueur lui-même (jamais désigné). */
  selfId: number;
}

/** Ce que le regard du joueur donne maintenant (null : pas de joueur sur le terrain). */
export function viewOfPlayer(ctx: GameContext): DesignateView | null {
  const st = ctx.player.state;
  const me = st.personId !== 0 ? ctx.people.get(st.personId) : undefined;
  if (!me) return null;
  return { x: me.x, z: me.z, yaw: st.camYaw, pitch: st.camPitch, aimX: st.aimX, aimZ: st.aimZ, aimedPersonId: st.aimedPersonId, selfId: me.id };
}

/** Bande de tangage : 0 de −3° à +1°, puis +1 tous les 2° (−1 sous −3° : le réticule). */
export function pitchBand(pitch: number): number {
  const deg = pitch / DEG;
  if (deg < LEVEL_MIN_DEG) return -1;
  return Math.max(0, Math.floor((deg - LEVEL_MIN_DEG) / STEP_DEG) - 1);
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function newRoad(): RoadSample {
  return { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
}

/** Point à `into` m dans l'arête `edgeId` en partant du nœud `node` (l'arête entière si elle est plus courte). */
function intoEdge(ctx: GameContext, edgeId: number, node: number, into: number): { x: number; z: number } | null {
  const e = ctx.world.edge(edgeId);
  if (!e || e.points.length < 4) return null;
  const n = e.points.length / 2;
  const fromStart = e.a === node;
  let left = into;
  for (let k = 0; k < n - 1; k++) {
    const i0 = fromStart ? k : n - 1 - k;
    const i1 = fromStart ? k + 1 : n - 2 - k;
    const ax = e.points[i0 * 2]!, az = e.points[i0 * 2 + 1]!;
    const bx = e.points[i1 * 2]!, bz = e.points[i1 * 2 + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len >= left || k === n - 2) {
      const f = len > 1e-6 ? Math.min(1, left / len) : 0;
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f };
    }
    left -= len;
  }
  return null;
}

/**
 * Candidats le long du regard (cap `yaw` depuis (ox, oz)), du plus proche au plus loin, à 15 m au moins ; liste vide :
 * un mur à moins de 6 m. `selfId` : le joueur (jamais compté dans la foule).
 */
export function scanRay(ctx: GameContext, ox: number, oz: number, yaw: number, selfId = 0): RayCandidate[] {
  const world = ctx.world;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const hit: RayHit = makeRayHit();
  let reach = FAR_RANGE;
  if (world.raycast(ox, oz, ox + fx * FAR_RANGE, oz + fz * FAR_RANGE, hit) && hit.hit) reach = hit.t * FAR_RANGE;
  const end = reach >= FAR_RANGE - 1e-6 ? FAR_RANGE : reach - WALL_BACKOFF;
  if (end < MIN_POINT) return [];
  const out: RayCandidate[] = [];
  const hasRoads = world.edgeCount > 0;
  const road = newRoad();
  const roadAt = (x: number, z: number): RoadSample | null => (hasRoads && world.nearestRoad(x, z, road, ROAD_SNAP) ? road : null);
  const start = roadAt(ox, oz);
  const startName = start ? start.name.trim() : '';
  let prevEdge = start ? start.edgeId : -1;
  let prevName = startName;
  let prevT = 0;
  let crowdFound = false;
  const near: Person[] = [];
  const isDemo = (p: Person): boolean => p.id !== selfId && p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0 && !ctx.health.isIncapacitated(p);
  const add = (c: RayCandidate): void => {
    if (c.distance < CANDIDATE_MIN || c.distance > end + 1) return;
    out.push(c);
  };
  for (let t = SAMPLE_STEP; t <= end + 1e-6; t += SAMPLE_STEP) {
    const x = ox + fx * t, z = oz + fz * t;
    const r = roadAt(x, z);
    if (r) {
      const name = r.name.trim();
      const edgeId = r.edgeId;
      if (edgeId !== prevEdge && prevEdge >= 0) {
        // le rayon passe d'une arête à l'autre : les nœuds de ces arêtes près du rayon sont des carrefours ; une rue d'un
        // autre nom qui en part est un débouché (point pris 6 m dans cette rue)
        const nodes = new Set<number>();
        const ea = world.edge(prevEdge), eb = world.edge(edgeId);
        if (ea) nodes.add(ea.a).add(ea.b);
        if (eb) nodes.add(eb.a).add(eb.b);
        for (const nid of nodes) {
          const n = world.node(nid);
          if (!n) continue;
          const along = (n.x - ox) * fx + (n.z - oz) * fz;
          const perp = Math.abs((n.x - ox) * fz - (n.z - oz) * fx);
          if (along < prevT - SAMPLE_STEP - 1 || along > t + SAMPLE_STEP + 1 || perp > 12) continue;
          for (const eid of n.edges) {
            const e = world.edge(eid);
            const en = e ? e.name.trim() : '';
            if (en === '' || en === name || en === prevName || en === startName) continue;
            const p = intoEdge(ctx, eid, nid, MOUTH_INTO);
            if (!p) continue;
            add({ kind: 'rue', x: p.x, z: p.z, distance: Math.hypot(p.x - ox, p.z - oz), place: placeBare(en) });
          }
        }
      }
      if (name !== '' && name !== prevName && name !== startName) add({ kind: 'rue', x, z, distance: t, place: placeBare(name) });
      prevEdge = edgeId;
      if (name !== '') prevName = name;
    }
    if (!crowdFound && t >= CANDIDATE_MIN) {
      near.length = 0;
      if (ctx.people.queryRadius(x, z, CROWD_PROBE, near, isDemo) > 0) {
        near.length = 0;
        if (ctx.people.queryRadius(x, z, CROWD_RADIUS, near, isDemo) >= CROWD_MIN) {
          crowdFound = true;
          const rr = roadAt(x, z);
          add({ kind: 'foule', x, z, distance: t, place: rr ? placeBare(rr.name) : '' });
        }
      }
    }
    prevT = t;
  }
  // le bout du rayon, recalé sur la rue la plus proche (25 m)
  let bx = ox + fx * end, bz = oz + fz * end;
  let bplace = '';
  const rb = roadAt(bx, bz);
  if (rb) {
    bx = rb.x;
    bz = rb.z;
    bplace = placeBare(rb.name);
  }
  const bd = Math.hypot(bx - ox, bz - oz);
  // (un mur entre 6 et 15 m : le bout est le seul candidat)
  if (bd >= MIN_POINT) out.push({ kind: 'bout', x: bx, z: bz, distance: bd, place: bplace });
  out.sort((a, b) => a.distance - b.distance || (a.kind === 'foule' ? -1 : b.kind === 'foule' ? 1 : 0));
  // deux candidats du même nom à moins de 12 m, ou deux candidats à moins de 4 m : le premier seul
  const kept: RayCandidate[] = [];
  for (const c of out) {
    if (kept.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 4 || (k.place === c.place && c.kind !== 'foule' && k.kind !== 'foule' && Math.abs(k.distance - c.distance) < MERGE_DISTANCE))) continue;
    kept.push(c);
  }
  // le bout ne double pas le dernier candidat
  if (kept.length >= 2) {
    const last = kept[kept.length - 1]!;
    const prev = kept[kept.length - 2]!;
    if (last.kind === 'bout' && last.distance - prev.distance < MERGE_DISTANCE) kept.pop();
  }
  return kept;
}

/** Genre d'une personne pour le cône : auteur d'un fait constaté, blessé, ou rien (le cône les ignore). */
function coneKind(ctx: GameContext, p: Person): 'offender' | 'wounded' | null {
  if (p.faction === 'police') return null;
  if (p.custody === 'free' && p.vehicleId === 0 && ctx.law.canArrest(p)) return 'offender';
  if (p.vehicleId === 0 && p.injury !== 'dead' && (p.injury === 'serious' || p.injury === 'critical' || ctx.health.isIncapacitated(p))) return 'wounded';
  return null;
}

/**
 * Policier sous le réticule même que la règle e peut rappeler : l'unité qui reçoit les ordres pour lui (on remonte
 * jusque sous la racine du joueur, comme who.ts addressableUnitOf) est sous ses ordres et ne le suit pas déjà.
 */
export function recallable(core: CommandCore, p: Person, meId: number): boolean {
  const ctx = core.ctx;
  const own = core.scope().ownSquadId;
  let s = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
  for (let guard = 0; s && guard < 8; guard++) {
    const parent = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
    if (!parent || parent.id === own || parent.kind === 'compagnie' || !core.canCommand(parent.id)) break;
    s = parent;
  }
  if (!s || s.id === own || !core.canCommand(s.id)) return false;
  const o = s.order;
  return !((o.type === 'suivre' && o.targetId === meId) || o.type === 'avec_moi' || o.type === 'suivre_pied');
}

export class Designator {
  private cands: RayCandidate[] = [];
  private scanAt = -1e9;
  private scanFrom = { x: NaN, z: NaN, yaw: NaN };
  /** Décalage du clavier ajouté à la bande de tangage, et candidat tenu pendant un appui de Page préc. / suiv. */
  private offset = 0;
  private held: number | null = null;
  private lastPitch = 0;
  private lastIndex = -1;
  /** Personne du cône (offender / wounded) et instant où le regard s'en est écarté de plus de 8°. */
  private sticky: { id: number; awaySince: number } | null = null;
  private cone: number[] = [];
  private last: Designation | null = null;

  constructor(private readonly core: CommandCore) {}

  /** Candidats du dernier rayon (HUD, tests). */
  candidates(): readonly RayCandidate[] {
    return this.cands;
  }

  /** Candidat choisi (−1 : le point du réticule). */
  index(): number {
    return this.lastIndex;
  }

  /** Dernière désignation calculée. */
  current(): Designation | null {
    return this.last;
  }

  /** Page préc. (+1) / Page suiv. (−1) enfoncée : un candidat de plus ou de moins, tenu jusqu'au relâchement. */
  keyStep(dir: 1 | -1): void {
    const n = this.cands.length;
    const base = this.held ?? this.lastIndex;
    this.held = Math.max(-1, Math.min(Math.max(0, n - 1), base + dir));
  }

  /** Touche relâchée : le candidat atteint reste choisi (le tangage qu'a pris la caméra entre-temps ne compte pas). */
  keyRelease(): void {
    if (this.held === null) return;
    const band = pitchBand(this.lastPitch);
    this.offset = band < 0 ? 0 : Math.max(0, this.held) - band;
    this.held = null;
  }

  reset(): void {
    this.cands = [];
    this.scanAt = -1e9;
    this.scanFrom = { x: NaN, z: NaN, yaw: NaN };
    this.offset = 0;
    this.held = null;
    this.lastPitch = 0;
    this.lastIndex = -1;
    this.sticky = null;
    this.cone = [];
    this.last = null;
  }

  /**
   * Désignation pour ce regard à l'instant `now` (temps de la simulation). Le rayon lointain et le cône sont relancés
   * 4 fois par seconde, ou tout de suite quand le regard a sauté (plus de 10° ou 20 m).
   */
  update(view: DesignateView | null, now: number): Designation | null {
    if (!view) {
      this.last = null;
      return null;
    }
    const ctx = this.core.ctx;
    this.lastPitch = view.pitch;
    const jumped = !(Math.hypot(view.x - this.scanFrom.x, view.z - this.scanFrom.z) <= 20) || !(angleDiff(view.yaw, this.scanFrom.yaw) <= 10 * DEG);
    if (jumped || now - this.scanAt >= SCAN_PERIOD) {
      this.scanAt = now;
      this.scanFrom = { x: view.x, z: view.z, yaw: view.yaw };
      this.cands = scanRay(ctx, view.x, view.z, view.yaw, view.selfId);
      this.cone = this.coneScan(view);
    }
    // ── une personne : auteur ou blessé dans le cône (collant), sinon un policier rappelable sous le réticule ──
    const person = this.pickPerson(view, now);
    if (person) {
      const d = designationAt(this.core, person.x, person.z, person.id, person.id === view.aimedPersonId);
      d.distance = Math.hypot(person.x - view.x, person.z - view.z);
      d.far = d.distance > AIM_GROUND_RANGE;
      this.last = d;
      return d;
    }
    // ── le ciel ──
    const deg = view.pitch / DEG;
    if (this.held === null && deg > SKY_DEG) {
      this.lastIndex = -1;
      return (this.last = { kind: 'none', x: view.x, z: view.z, distance: 0, person: null, place: '', far: false });
    }
    // ── le point du réticule (regard vers le sol), ou un candidat (caméra droite ou levée) ──
    const band = pitchBand(view.pitch);
    if (band < 0 && this.held === null) this.offset = 0;
    let idx = this.held !== null ? this.held : band < 0 ? -1 : band + this.offset;
    const n = this.cands.length;
    if (idx >= 0) {
      if (n === 0) {
        this.lastIndex = -1;
        return (this.last = { kind: 'none', x: view.x, z: view.z, distance: 0, person: null, place: '', far: false });
      }
      idx = Math.max(0, Math.min(n - 1, idx));
      this.lastIndex = idx;
      const c = this.cands[idx]!;
      return (this.last = { kind: 'ground', x: c.x, z: c.z, distance: Math.hypot(c.x - view.x, c.z - view.z), person: null, place: c.place, far: c.distance > AIM_GROUND_RANGE });
    }
    this.lastIndex = -1;
    const exact = view.aimedPersonId !== 0 && view.aimedPersonId !== view.selfId ? ctx.people.get(view.aimedPersonId) : undefined;
    if (exact && exact.faction !== 'police') {
      // un manifestant, un passant sous le réticule : l'ordre vaut pour l'endroit où il est
      const d = designationAt(this.core, exact.x, exact.z, exact.id, true);
      d.distance = Math.hypot(exact.x - view.x, exact.z - view.z);
      return (this.last = d);
    }
    const dist = Math.hypot(view.aimX - view.x, view.aimZ - view.z);
    if (!Number.isFinite(dist) || dist < MIN_POINT) return (this.last = { kind: 'none', x: view.x, z: view.z, distance: 0, person: null, place: '', far: false });
    return (this.last = { kind: 'ground', x: view.aimX, z: view.aimZ, distance: dist, person: null, place: '', far: false });
  }

  /** Auteurs et blessés dans le cône de 4°, en vue directe, classés : auteurs d'abord, puis le plus près du rayon. */
  private coneScan(view: DesignateView): number[] {
    const ctx = this.core.ctx;
    const list: { id: number; rank: number }[] = [];
    const near: Person[] = [];
    const n = ctx.people.queryRadius(view.x, view.z, PERSON_RANGE, near, (p) => p.id !== view.selfId && p.faction !== 'police');
    for (let i = 0; i < n; i++) {
      const p = near[i]!;
      const kind = coneKind(ctx, p);
      if (!kind) continue;
      const dx = p.x - view.x, dz = p.z - view.z;
      if (Math.hypot(dx, dz) < 1) continue;
      const a = angleDiff(Math.atan2(dx, dz), view.yaw);
      if (a > CONE) continue;
      if (!ctx.world.lineOfSight(view.x, view.z, p.x, p.z)) continue;
      list.push({ id: p.id, rank: (kind === 'offender' ? 0 : 10) + a / CONE });
    }
    list.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return list.map((q) => q.id);
  }

  private pickPerson(view: DesignateView, now: number): Person | null {
    const ctx = this.core.ctx;
    // le meilleur du cône (relancé 4 fois par seconde) : encore valable ?
    let best: Person | null = null;
    let bestRank = Infinity;
    for (const id of this.cone) {
      const p = ctx.people.get(id);
      if (!p) continue;
      const kind = coneKind(ctx, p);
      if (!kind) continue;
      const a = angleDiff(Math.atan2(p.x - view.x, p.z - view.z), view.yaw);
      if (a > CONE) continue;
      const rank = (kind === 'offender' ? 0 : 10) + a / CONE;
      if (rank < bestRank) {
        bestRank = rank;
        best = p;
      }
    }
    // la personne déjà désignée reste désignée tant que le regard ne s'en écarte pas de plus de 8° pendant 0,3 s ; un
    // auteur l'emporte sur un blessé
    const st = this.sticky;
    if (st) {
      const p = ctx.people.get(st.id);
      const kind = p ? coneKind(ctx, p) : null;
      if (!p || !kind || Math.hypot(p.x - view.x, p.z - view.z) > PERSON_RANGE) this.sticky = null;
      else {
        const a = angleDiff(Math.atan2(p.x - view.x, p.z - view.z), view.yaw);
        if (a > STICKY_ANGLE) {
          if (st.awaySince < 0) st.awaySince = now;
          if (now - st.awaySince >= STICKY_TIME) this.sticky = null;
        } else st.awaySince = -1;
        if (this.sticky) {
          const better = best && best.id !== p.id && coneKind(ctx, best) === 'offender' && kind !== 'offender';
          if (!better) return p;
        }
      }
    }
    if (best) {
      this.sticky = { id: best.id, awaySince: -1 };
      return best;
    }
    // un policier sous le réticule même (jamais par le cône), si la règle e peut rappeler son unité
    const exact = view.aimedPersonId !== 0 && view.aimedPersonId !== view.selfId ? ctx.people.get(view.aimedPersonId) : undefined;
    if (exact && exact.faction === 'police' && recallable(this.core, exact, view.selfId)) return exact;
    return null;
  }
}
