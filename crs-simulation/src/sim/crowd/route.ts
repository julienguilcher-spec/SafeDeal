/* =====================================================================================
 * FOULE — parcours déclaré et couloir de marche.
 *
 *   chooseRoute()   parcours imposé (config.extra), sinon parcours réel de la table quand le lieu de départ
 *                   correspond, sinon itinéraire ctx.world.findPath vers une place à 1 – 1,5 km ;
 *   Corridor        le parcours rééchantillonné tous les 4 m, avec pour chaque point la tangente lissée
 *                   et la largeur réellement utilisable : largeur de la rue d'après ctx.world.nearestRoad
 *                   (chaussée + trottoirs), bornée par les murs (ctx.world.raycast) là où la carte
 *                   détaillée est chargée. Les emplacements du cortège sont exprimés dans ce couloir :
 *                   personne n'est jamais placé dans un immeuble.
 * ===================================================================================== */

import type { GameContext, PlaceInfo, RayHit, Rng, RoadSample, SessionConfig } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { RoutePoint } from './api';
import { ROUTES, ROUTE_MATCH_RADIUS } from './routes-data';
import type { RouteDef } from './routes-data';
import * as T from './tuning';

export interface ChosenRoute {
  /** Polyligne [x0, z0, …] du parcours déclaré. */
  points: number[];
  /** Identifiant de la table, 'impose', 'libre' (itinéraire calculé) ou 'statique'. */
  id: string;
  label: string;
  length: number;
}

const scratch: number[] = [];
const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

function pathLength(points: readonly number[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i += 2) total += Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!);
  return total;
}

/** Ajoute à `out` l'itinéraire à pied de A à B (sans répéter le point de jonction). false si aucun chemin. */
function appendPath(ctx: GameContext, ax: number, az: number, bx: number, bz: number, out: number[]): boolean {
  if (!ctx.world.findPath(ax, az, bx, bz, 'foot', scratch) || scratch.length < 4) return false;
  for (let i = 0; i < scratch.length; i += 2) {
    const x = scratch[i]!;
    const z = scratch[i + 1]!;
    const n = out.length;
    if (n >= 2 && Math.hypot(x - out[n - 2]!, z - out[n - 1]!) < 0.5) continue;
    out.push(x, z);
  }
  return true;
}

/**
 * Retire le premier (et le dernier) point quand ce n'est pas un point de rue : le centre d'une place peut
 * porter un monument ; le cortège, lui, suit les voies.
 */
function trimEnds(ctx: GameContext, pts: number[]): void {
  if (pts.length >= 6 && Math.hypot(pts[2]! - pts[0]!, pts[3]! - pts[1]!) > 3 && ctx.world.nearestRoad(pts[0]!, pts[1]!, sample, 60) && sample.dist > 3) {
    pts.splice(0, 2);
  }
  const n = pts.length;
  if (n >= 6 && Math.hypot(pts[n - 2]! - pts[n - 4]!, pts[n - 1]! - pts[n - 3]!) > 3 && ctx.world.nearestRoad(pts[n - 2]!, pts[n - 1]!, sample, 60) && sample.dist > 3) {
    pts.length = n - 2;
  }
}

function fromStops(ctx: GameContext, def: RouteDef, sx: number, sz: number): number[] | null {
  const out: number[] = [];
  let px = sx;
  let pz = sz;
  for (let i = 0; i < def.stops.length; i++) {
    const stop = def.stops[i]!;
    const place = ctx.world.placeByName(stop.name);
    // un lieu homonyme loin de l'endroit attendu n'est pas le bon : coordonnées de secours
    const ok = place !== null && Math.hypot(place.x - stop.x, place.z - stop.z) < 400;
    const x = ok ? place.x : stop.x;
    const z = ok ? place.z : stop.z;
    if (i === 0) {
      if (Math.hypot(x - sx, z - sz) > 30 && !appendPath(ctx, sx, sz, x, z, out)) return null;
    } else if (!appendPath(ctx, px, pz, x, z, out)) return null;
    px = x;
    pz = z;
  }
  return out.length >= 4 ? out : null;
}

function matchesStart(ctx: GameContext, def: RouteDef, config: SessionConfig, sx: number, sz: number): boolean {
  const first = def.stops[0]!;
  const place = ctx.world.placeByName(first.name);
  if (!place || Math.hypot(place.x - first.x, place.z - first.z) > 400) return false; // autre carte
  return Math.hypot(place.x - sx, place.z - sz) <= ROUTE_MATCH_RADIUS
    || (config.place !== '' && ctx.world.placeByName(config.place) === place);
}

function isDestination(p: PlaceInfo): boolean {
  return p.kind === 'square' || p.kind === 'monument' || p.kind === 'institution' || p.kind === 'garden' || p.kind === 'bridge';
}

/** Itinéraire libre : une place à 1 – 1,5 km par les rues ; à défaut, le lieu le plus lointain atteignable. */
function freeRoute(ctx: GameContext, sx: number, sz: number, rng: Rng): number[] | null {
  const world = ctx.world;
  const candidates: { x: number; z: number; w: number }[] = [];
  const places = world.places;
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    if (p.kind === 'station' || p.kind === 'district') continue;
    const d = Math.hypot(p.x - sx, p.z - sz);
    if (d < 180 || d > T.ROUTE_MAX) continue;
    candidates.push({ x: p.x, z: p.z, w: isDestination(p) ? 1 : 0.6 });
  }
  // points de la couronne, pour les cartes sans place à bonne distance
  const b = world.bounds;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + rng.next() * 0.3;
    const r = 0.5 * (T.ROUTE_MIN + T.ROUTE_MAX) * (0.75 + rng.next() * 0.2);
    const x = Math.min(b.maxX - 40, Math.max(b.minX + 40, sx + Math.sin(a) * r));
    const z = Math.min(b.maxZ - 40, Math.max(b.minZ + 40, sz + Math.cos(a) * r));
    if (world.nearestRoad(x, z, sample, 150)) candidates.push({ x: sample.x, z: sample.z, w: 0.5 });
  }
  if (candidates.length === 0) return null;
  // on n'évalue que les plus prometteurs (distance à vol d'oiseau proche de la cible)
  const want = 0.5 * (T.ROUTE_MIN + T.ROUTE_MAX);
  candidates.sort((p, q) => Math.abs(Math.hypot(p.x - sx, p.z - sz) * 1.25 - want) - Math.abs(Math.hypot(q.x - sx, q.z - sz) * 1.25 - want));
  let best: number[] | null = null;
  let bestScore = -Infinity;
  const tries = Math.min(candidates.length, 14);
  for (let i = 0; i < tries; i++) {
    const c = candidates[i]!;
    const pts: number[] = [];
    if (!appendPath(ctx, sx, sz, c.x, c.z, pts)) continue;
    const len = pathLength(pts);
    if (len < 120) continue;
    const inRange = len >= T.ROUTE_MIN && len <= T.ROUTE_MAX;
    // dans la fourchette : le lieu le plus « place » ; sinon le plus proche de la fourchette
    const score = (inRange ? 1000 : -Math.abs(len - want)) + c.w * 120 + rng.next() * 40;
    if (score > bestScore) {
      bestScore = score;
      best = pts;
    }
  }
  return best;
}

/** Choisit le parcours déclaré de la manifestation. */
export function chooseRoute(ctx: GameContext, config: SessionConfig, rng: Rng): ChosenRoute {
  const sx = config.x ?? 0;
  const sz = config.z ?? 0;
  const extra = config.extra ?? {};
  const finish = (points: number[], id: string, label: string): ChosenRoute => {
    trimEnds(ctx, points);
    return { points, id, label, length: pathLength(points) };
  };
  // 1. parcours imposé
  const imposed = extra['crowd.route'];
  if (Array.isArray(imposed) && imposed.length >= 2) {
    if (typeof imposed[0] === 'number' && imposed.length >= 4) {
      const pts: number[] = [];
      for (let i = 0; i + 1 < imposed.length; i += 2) {
        const x = Number(imposed[i]);
        const z = Number(imposed[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(z)) pts.push(x, z);
      }
      if (pts.length >= 4) return { points: pts, id: 'impose', label: 'Parcours imposé', length: pathLength(pts) };
    } else if (typeof imposed[0] === 'string') {
      const pts: number[] = [];
      let px = sx;
      let pz = sz;
      let ok = true;
      for (let i = 0; i < imposed.length && ok; i++) {
        const place = ctx.world.placeByName(String(imposed[i]));
        if (!place) continue;
        if (Math.hypot(place.x - px, place.z - pz) > 20) ok = appendPath(ctx, px, pz, place.x, place.z, pts);
        px = place.x;
        pz = place.z;
      }
      if (ok && pts.length >= 4) return finish(pts, 'impose', 'Parcours imposé');
    }
  }
  const dest = extra['crowd.destination'];
  if (dest !== undefined && dest !== null) {
    let dx = NaN;
    let dz = NaN;
    if (typeof dest === 'string') {
      const place = ctx.world.placeByName(dest);
      if (place) {
        dx = place.x;
        dz = place.z;
      }
    } else if (typeof dest === 'object') {
      dx = Number((dest as { x?: unknown }).x);
      dz = Number((dest as { z?: unknown }).z);
    }
    if (Number.isFinite(dx) && Number.isFinite(dz)) {
      const pts: number[] = [];
      if (appendPath(ctx, sx, sz, dx, dz, pts) && pts.length >= 4) return finish(pts, 'impose', 'Parcours imposé');
    }
  }
  // 2. parcours réel de la table
  const wantId = typeof extra['crowd.routeId'] === 'string' ? (extra['crowd.routeId'] as string) : '';
  const matches: RouteDef[] = [];
  for (let i = 0; i < ROUTES.length; i++) {
    const def = ROUTES[i]!;
    if (wantId !== '' ? def.id === wantId && ctx.world.placeByName(def.stops[0]!.name) !== null : matchesStart(ctx, def, config, sx, sz)) matches.push(def);
  }
  if (matches.length > 0) {
    // les très longs parcours ne sont proposés que pour les longues durées
    const long = config.duration === 'longue' || config.duration === 'temps_reel';
    const pool = matches.filter((d) => wantId !== '' || long || d.length <= 2800);
    const def = (pool.length > 0 ? pool : matches)[rng.int(0, (pool.length > 0 ? pool : matches).length)]!;
    const pts = fromStops(ctx, def, sx, sz);
    if (pts) return finish(pts, def.id, def.label);
  }
  // 3. itinéraire libre vers une place à 1 – 1,5 km
  const free = freeRoute(ctx, sx, sz, rng);
  if (free) return finish(free, 'libre', 'Parcours déclaré');
  // 4. monde sans rues : tout droit
  const a = rng.next() * Math.PI * 2;
  return { points: [sx, sz, sx + Math.sin(a) * 600, sz + Math.cos(a) * 600], id: 'libre', label: 'Parcours déclaré', length: 600 };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Couloir
// ─────────────────────────────────────────────────────────────────────────────────────

export class Corridor {
  /** Nombre d'échantillons et longueur du parcours (m). */
  n = 0;
  length = 0;
  px = new Float32Array(0);
  pz = new Float32Array(0);
  tx = new Float32Array(0);
  tz = new Float32Array(0);
  /** Espace libre mesuré à gauche et à droite de l'axe (m), brut. */
  private rawL = new Float32Array(0);
  private rawR = new Float32Array(0);
  /** Couloir utilisable : décalage du milieu (positif à droite) et demi-largeur. */
  center = new Float32Array(0);
  half = new Float32Array(0);
  /** 1 : mesuré sur la carte détaillée ; 0 : estimé d'après la rue seulement. */
  private measured = new Uint8Array(0);
  /** Largeur de référence du cortège (m) : celle du lieu de rassemblement. */
  refWidth = 14;
  private dirty = true;
  private readonly hit: RayHit = makeRayHit();

  build(ctx: GameContext, points: readonly number[]): void {
    const count = points.length >> 1;
    let length = 0;
    for (let i = 1; i < count; i++) length += Math.hypot(points[i * 2]! - points[i * 2 - 2]!, points[i * 2 + 1]! - points[i * 2 - 1]!);
    const n = Math.max(2, Math.floor(length / T.ROUTE_STEP) + 2);
    this.n = n;
    this.length = length;
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.rawL = new Float32Array(n);
    this.rawR = new Float32Array(n);
    this.center = new Float32Array(n);
    this.half = new Float32Array(n);
    this.measured = new Uint8Array(n);
    // rééchantillonnage régulier
    let seg = 1;
    let acc = 0;
    let segLen = count > 1 ? Math.hypot(points[2]! - points[0]!, points[3]! - points[1]!) : 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(length, i * T.ROUTE_STEP);
      while (seg < count - 1 && s > acc + segLen) {
        acc += segLen;
        seg++;
        segLen = Math.hypot(points[seg * 2]! - points[seg * 2 - 2]!, points[seg * 2 + 1]! - points[seg * 2 - 1]!);
      }
      const t = segLen > 1e-6 ? Math.min(1, Math.max(0, (s - acc) / segLen)) : 0;
      const ax = points[seg * 2 - 2] ?? points[0]!;
      const az = points[seg * 2 - 1] ?? points[1]!;
      const bx = points[seg * 2] ?? ax;
      const bz = points[seg * 2 + 1] ?? az;
      this.px[i] = ax + (bx - ax) * t;
      this.pz[i] = az + (bz - az) * t;
    }
    // tangente lissée (différence centrée sur ± 2 échantillons)
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2);
      const c = Math.min(n - 1, i + 2);
      let dx = this.px[c]! - this.px[a]!;
      let dz = this.pz[c]! - this.pz[a]!;
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) {
        dx /= l;
        dz /= l;
      } else {
        dx = i > 0 ? this.tx[i - 1]! : 0;
        dz = i > 0 ? this.tz[i - 1]! : 1;
      }
      this.tx[i] = dx;
      this.tz[i] = dz;
    }
    this.measure(ctx, 0, n);
    // largeur de référence : médiane du couloir sur les 160 premiers mètres
    const m = Math.min(n, Math.floor(160 / T.ROUTE_STEP) + 1);
    const widths: number[] = [];
    for (let i = 0; i < m; i++) widths.push(this.half[i]! * 2);
    widths.sort((p, q) => p - q);
    this.refWidth = Math.min(20, Math.max(7, widths[widths.length >> 1] ?? 14));
  }

  /** Marque le couloir à remesurer (une tuile vient d'être chargée ou déchargée). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Remesure, autour de [from, to] (abscisses), les échantillons estimés dont la carte est maintenant chargée. */
  refresh(ctx: GameContext, from: number, to: number): void {
    if (!this.dirty || this.n === 0) return;
    const a = Math.max(0, Math.floor(from / T.ROUTE_STEP) - 8);
    const b = Math.min(this.n, Math.ceil(to / T.ROUTE_STEP) + 8);
    let pending = false;
    for (let i = a; i < b; i++) {
      if (this.measured[i] === 0) {
        pending = true;
        break;
      }
    }
    if (pending) this.measure(ctx, a, b);
    this.dirty = false;
  }

  private measure(ctx: GameContext, a: number, b: number): void {
    const world = ctx.world;
    const hit = this.hit;
    const reach = T.CORRIDOR_REACH;
    const lo = Math.max(0, a - 6);
    const hi = Math.min(this.n, b + 6);
    for (let i = lo; i < hi; i++) {
      const x = this.px[i]!;
      const z = this.pz[i]!;
      // droite du sens de marche : (−tz, tx)
      const rx = -this.tz[i]!;
      const rz = this.tx[i]!;
      // largeur de la rue d'après le graphe : chaussée + trottoirs
      let nominal = T.CORRIDOR_HALF_DEFAULT;
      if (world.nearestRoad(x, z, sample, 25)) {
        const edge = sample.edgeId >= 0 && sample.edgeId < world.edgeCount ? world.edge(sample.edgeId) : null;
        nominal = sample.width * 0.5 + (edge ? edge.sidewalk : 2) + sample.dist;
      }
      let left = nominal;
      let right = nominal;
      let measured = 0;
      if (world.ready && world.isLoaded(x, z) && world.isFree(x, z, 0.3)) {
        measured = 1;
        left = world.raycast(x, z, x - rx * reach, z - rz * reach, hit) ? hit.t * reach : reach;
        right = world.raycast(x, z, x + rx * reach, z + rz * reach, hit) ? hit.t * reach : reach;
      }
      this.rawL[i] = left;
      this.rawR[i] = right;
      this.measured[i] = measured;
    }
    // minimum glissant (± 12 m) : le couloir ne s'évase pas dans les rues transversales ; puis lissage
    const w = 3;
    for (let i = a; i < b; i++) {
      let left = Infinity;
      let right = Infinity;
      for (let k = Math.max(0, i - w); k <= Math.min(this.n - 1, i + w); k++) {
        if (this.rawL[k]! < left) left = this.rawL[k]!;
        if (this.rawR[k]! < right) right = this.rawR[k]!;
      }
      left -= T.CORRIDOR_MARGIN;
      right -= T.CORRIDOR_MARGIN;
      if (left < 0.3) left = 0.3;
      if (right < 0.3) right = 0.3;
      let half = (left + right) * 0.5;
      let center = (right - left) * 0.5;
      if (half > T.CORRIDOR_HALF_MAX) {
        // rue plus large que le cortège : il reste au plus près de l'axe du parcours, sans sortir de l'espace libre
        const lo = T.CORRIDOR_HALF_MAX - left;
        const hi = right - T.CORRIDOR_HALF_MAX;
        center = lo > 0 ? lo : hi < 0 ? hi : 0;
        half = T.CORRIDOR_HALF_MAX;
      }
      if (half < T.CORRIDOR_HALF_MIN) half = T.CORRIDOR_HALF_MIN;
      this.center[i] = center;
      this.half[i] = half;
    }
    // lissage léger du milieu et de la demi-largeur (sans jamais élargir au-delà du minimum local)
    for (let pass = 0; pass < 2; pass++) {
      let prevC = this.center[a]!;
      let prevH = this.half[a]!;
      for (let i = a + 1; i < b - 1; i++) {
        const c = (prevC + this.center[i]! * 2 + this.center[i + 1]!) * 0.25;
        const h = Math.min(this.half[i]!, (prevH + this.half[i]! * 2 + this.half[i + 1]!) * 0.25);
        prevC = this.center[i]!;
        prevH = this.half[i]!;
        // le couloir lissé doit rester dans l'espace libre mesuré
        const maxR = this.rawR[i]! - T.CORRIDOR_MARGIN;
        const maxL = this.rawL[i]! - T.CORRIDOR_MARGIN;
        let hh = h;
        if (c + hh > maxR) hh = Math.max(T.CORRIDOR_HALF_MIN * 0.5, maxR - c);
        if (hh - c > maxL) hh = Math.max(T.CORRIDOR_HALF_MIN * 0.5, maxL + c);
        this.center[i] = c;
        this.half[i] = hh;
      }
    }
  }

  /** Point du parcours à l'abscisse s (prolongé en ligne droite avant le début et après la fin). */
  at(s: number, out: RoutePoint): void {
    const n = this.n;
    if (n === 0) {
      out.x = 0; out.z = 0; out.tx = 0; out.tz = 1; out.center = 0; out.half = T.CORRIDOR_HALF_DEFAULT; out.stretch = 1;
      return;
    }
    const f = s / T.ROUTE_STEP;
    let i = Math.floor(f);
    let t = f - i;
    let over = 0;
    if (i < 0) {
      over = s;
      i = 0;
      t = 0;
    } else if (i >= n - 1) {
      over = s - (n - 1) * T.ROUTE_STEP;
      if (over < 0) over = 0;
      i = n - 2;
      t = 1;
    }
    const j = i + 1;
    const txi = this.tx[i]! + (this.tx[j]! - this.tx[i]!) * t;
    const tzi = this.tz[i]! + (this.tz[j]! - this.tz[i]!) * t;
    const l = Math.hypot(txi, tzi) || 1;
    out.tx = txi / l;
    out.tz = tzi / l;
    out.x = this.px[i]! + (this.px[j]! - this.px[i]!) * t + out.tx * over;
    out.z = this.pz[i]! + (this.pz[j]! - this.pz[i]!) * t + out.tz * over;
    out.center = this.center[i]! + (this.center[j]! - this.center[i]!) * t;
    const half = this.half[i]! + (this.half[j]! - this.half[i]!) * t;
    out.half = half;
    const st = this.refWidth / (half * 2);
    out.stretch = st < 1 ? 1 : st > T.STRETCH_MAX ? T.STRETCH_MAX : st;
  }

  /** Abscisse du point du parcours le plus proche de (x, z), cherchée autour de `near` (m). */
  project(x: number, z: number, near: number, window = 80): number {
    const n = this.n;
    if (n === 0) return 0;
    const c = Math.round(near / T.ROUTE_STEP);
    const w = Math.ceil(window / T.ROUTE_STEP);
    const lo = Math.max(0, c - w);
    const hi = Math.min(n - 1, c + w);
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = this.px[i]! - x;
      const dz = this.pz[i]! - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const dx = x - this.px[best]!;
    const dz = z - this.pz[best]!;
    return best * T.ROUTE_STEP + dx * this.tx[best]! + dz * this.tz[best]!;
  }
}
