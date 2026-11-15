/* =====================================================================================
 * Construction des lots d'obstacles (au chargement d'une tuile, ou une fois pour les monuments).
 *
 * Entrées : polygones pleins (bâtiments, monuments, plans d'eau) et barrières linéaires.
 * Règle de cohérence avec le réseau de rues : LE GRAPHE FAIT FOI POUR LE PASSAGE. Là où une voie
 * (hors souterrain) traverse un polygone plein ou une barrière, une ouverture est pratiquée :
 *   - bâtiment : porche de la largeur de la chaussée, avec ses deux murs latéraux ;
 *   - plan d'eau : tablier du pont (chaussée + trottoirs), avec ses deux parapets ;
 *   - barrière : brèche de la largeur de la voie (chaussée + trottoirs).
 * Les côtés d'un plan d'eau posés sur une limite de tuile (artefact du découpage) ne sont pas
 * des berges : ils sont ignorés.
 *
 * Tout ce fichier s'exécute au chargement : les allocations y sont permises.
 * ===================================================================================== */

import { ringSignedArea, segmentIntersectsRect } from '../mapdata';
import type { BarrierKind, Bounds } from '../mapdata';
import {
  CAP_STRIDE, COLLISION_CELL, CollisionBucket, FLAG_ONE_SIDED, FLAG_SIGHT, KIND_BANK, KIND_BARRIER, KIND_BUILDING,
  KIND_LANDMARK, POLY_FULL_CELL, SEG_STRIDE, SOLID_LANDMARK, SOLID_WATER,
} from './collision';
import type { RoadNetwork } from './roads';
import { SEG_BRIDGE, SEG_TUNNEL } from './roads';

/** Demi-largeur minimale d'une ouverture pratiquée pour une voie (m). */
const MIN_PASSAGE_HALF = 1.25;
/** Prolongement d'une capsule de passage au-delà du mur traversé (m). */
const PASSAGE_EXTENSION = 0.3;
/** Pas d'échantillonnage des découpes (m) ; les limites sont ensuite affinées par dichotomie. */
const SAMPLE_STEP = 0.25;
/** Hauteur (m) retenue pour les parapets générés le long des ponts. */
const RAIL_HEIGHT = 1;
/** Tolérance (m) pour reconnaître un côté posé sur une limite de tuile. */
const BORDER_EPS = 0.06;
/** Au-delà de ce nombre de cellules, un polygone est indexé cellule par cellule (pleine / bord). */
const CLASSIFY_CELLS = 6;

interface PolyDraft {
  kind: number;
  height: number;
  rings: ArrayLike<number>[];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Capsules d'exemption (CAP_STRIDE valeurs chacune) et arête d'origine. */
  caps: number[];
  capEdges: number[];
}

interface BarrierDraft { kind: BarrierKind; height: number; points: ArrayLike<number> }

const scratchRect: Bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };

function insideRings(rings: readonly ArrayLike<number>[], x: number, z: number): boolean {
  let inside = false;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const zi = ring[2 * i + 1], zj = ring[2 * j + 1];
      if (zi > z !== zj > z) {
        const xi = ring[2 * i], xj = ring[2 * j];
        if (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

function distSqToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const ex = px - ax - dx * t, ez = pz - az - dz * t;
  return ex * ex + ez * ez;
}

/** Le point est-il dans une des capsules (hors `skip`), rétrécies de `shrink` ? */
function inCaps(caps: readonly number[], x: number, z: number, skip: number, shrink: number): boolean {
  for (let c = 0; c * CAP_STRIDE < caps.length; c++) {
    if (c === skip) continue;
    const o = c * CAP_STRIDE;
    const r = caps[o + 4] - shrink;
    if (r > 0 && distSqToSegment(x, z, caps[o], caps[o + 1], caps[o + 2], caps[o + 3]) < r * r) return true;
  }
  return false;
}

/**
 * Découpe le segment a → b selon un prédicat « à garder » évalué le long du segment : appelle
 * `emit` pour chaque morceau gardé. Les transitions sont affinées par dichotomie (≈ 1 mm).
 */
function splitByPredicate(
  ax: number, az: number, bx: number, bz: number, keep: (x: number, z: number) => boolean,
  emit: (ax: number, az: number, bx: number, bz: number) => void,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-6) return;
  const n = Math.max(1, Math.ceil(len / SAMPLE_STEP));
  const at = (t: number): boolean => keep(ax + (bx - ax) * t, az + (bz - az) * t);
  const refine = (t0: number, t1: number, state0: boolean): number => {
    let lo = t0, hi = t1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid) === state0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let prev = at(0);
  let start = prev ? 0 : -1;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const state = at(t);
    if (state !== prev) {
      const tb = refine((k - 1) / n, t, prev);
      if (prev) {
        if ((tb - start) * len > 0.02) emit(ax + (bx - ax) * start, az + (bz - az) * start, ax + (bx - ax) * tb, az + (bz - az) * tb);
      } else {
        start = tb;
      }
      prev = state;
    }
  }
  if (prev && (1 - start) * len > 0.02) emit(ax + (bx - ax) * start, az + (bz - az) * start, bx, bz);
}

export class BucketBuilder {
  private readonly roads: RoadNetwork | null;
  private readonly tileRect: Bounds | null;
  private readonly polys: PolyDraft[] = [];
  private readonly barriers: BarrierDraft[] = [];
  private readonly segs: number[] = [];
  private readonly segHeights: number[] = [];
  private readonly segFlags: number[] = [];
  private readonly roadScratch: number[] = [];

  /**
   * @param roads réseau de rues (pour les ouvertures) ; null = aucune ouverture.
   * @param tileRect rectangle de la tuile (pour ignorer les côtés d'eau posés sur ses limites).
   */
  constructor(roads: RoadNetwork | null, tileRect: Bounds | null) {
    this.roads = roads;
    this.tileRect = tileRect;
  }

  /** Bâtiment (SOLID_BUILDING) ou obstacle de monument (SOLID_LANDMARK) : anneau extérieur puis trous. */
  addSolid(rings: readonly ArrayLike<number>[], kind: number, height: number): void {
    this.addPoly(rings, kind, height);
  }

  /** Plan d'eau : anneau extérieur puis îles. */
  addWater(rings: readonly ArrayLike<number>[]): void {
    this.addPoly(rings, SOLID_WATER, 0);
  }

  addBarrier(kind: BarrierKind, height: number, points: ArrayLike<number>): void {
    if (kind === 'gate' || points.length < 4) return; // un portail est franchissable
    this.barriers.push({ kind, height, points });
  }

  private addPoly(rings: readonly ArrayLike<number>[], kind: number, height: number): void {
    const kept: ArrayLike<number>[] = [];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const ring of rings) {
      if (ring.length < 6) continue;
      kept.push(ring);
      for (let i = 0; i + 1 < ring.length; i += 2) {
        if (ring[i] < minX) minX = ring[i];
        if (ring[i] > maxX) maxX = ring[i];
        if (ring[i + 1] < minZ) minZ = ring[i + 1];
        if (ring[i + 1] > maxZ) maxZ = ring[i + 1];
      }
    }
    if (kept.length === 0 || kept[0] !== rings[0]) return; // anneau extérieur dégénéré
    this.polys.push({ kind, height, rings: kept, minX, minZ, maxX, maxZ, caps: [], capEdges: [] });
  }

  private pushSeg(ax: number, az: number, bx: number, bz: number, nx: number, nz: number, thick: number, height: number, flags: number): void {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) return;
    this.segs.push(ax, az, bx, bz, nx, nz, 1 / len2, thick);
    this.segHeights.push(height);
    this.segFlags.push(flags);
  }

  // ─────────────────────────────── ouvertures ───────────────────────────────

  /** Cherche les voies qui traversent le polygone et crée les capsules d'exemption correspondantes. */
  private findPassages(poly: PolyDraft): void {
    const roads = this.roads;
    if (roads === null) return;
    const list = this.roadScratch;
    const count = roads.querySegments(poly.minX - 1, poly.minZ - 1, poly.maxX + 1, poly.maxZ + 1, list);
    const ts: number[] = [];
    for (let q = 0; q < count; q++) {
      const s = list[q];
      if ((roads.segFlags[s] & SEG_TUNNEL) !== 0) continue;
      const ax = roads.segXZ[4 * s], az = roads.segXZ[4 * s + 1], bx = roads.segXZ[4 * s + 2], bz = roads.segXZ[4 * s + 3];
      if (Math.max(ax, bx) < poly.minX || Math.min(ax, bx) > poly.maxX || Math.max(az, bz) < poly.minZ || Math.min(az, bz) > poly.maxZ) continue;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      // Paramètres des intersections de la voie avec les côtés du polygone.
      ts.length = 0;
      for (const ring of poly.rings) {
        const n = ring.length >> 1;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const px = ring[2 * j], pz = ring[2 * j + 1];
          const ex = ring[2 * i] - px, ez = ring[2 * i + 1] - pz;
          const denom = dx * ez - dz * ex;
          if (Math.abs(denom) < 1e-12) continue;
          const wx = px - ax, wz = pz - az;
          const t = (wx * ez - wz * ex) / denom;
          const u = (wx * dz - wz * dx) / denom;
          if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
        }
      }
      ts.sort((p, r) => p - r);
      ts.push(1);
      // Intervalles de la voie situés dans le polygone (fusion des intervalles contigus).
      let lo = 0, runStart = -1;
      for (let k = 0; k < ts.length; k++) {
        const hi = ts[k];
        const inside = hi - lo > 1e-7 && insideRings(poly.rings, ax + dx * (lo + hi) / 2, az + dz * (lo + hi) / 2);
        if (inside && runStart < 0) runStart = lo;
        if ((!inside && hi - lo > 1e-7) || k === ts.length - 1) {
          const runEnd = inside ? hi : lo;
          if (runStart >= 0) this.addPassage(poly, s, ax, az, dx / len, dz / len, len, runStart, runEnd);
          runStart = -1;
        }
        lo = hi;
      }
    }
  }

  private addPassage(poly: PolyDraft, seg: number, ax: number, az: number, ux: number, uz: number, len: number, t0: number, t1: number): void {
    const roads = this.roads;
    if (roads === null) return;
    const inside = (t1 - t0) * len;
    const touchesEnd = t0 <= 0 || t1 >= 1;
    // Un coin de bâtiment à peine écorné par l'axe d'une voie n'est pas un passage.
    if (inside < (touchesEnd ? 0.05 : 0.4)) return;
    const e = roads.segEdge[seg];
    const ed = roads.edges[e];
    const half = (roads.segFlags[seg] & SEG_BRIDGE) !== 0 ? roads.halfDeck[e] : Math.max(MIN_PASSAGE_HALF, ed.width / 2);
    const s0 = t0 * len - (t0 > 0 ? PASSAGE_EXTENSION : 0);
    const s1 = t1 * len + (t1 < 1 ? PASSAGE_EXTENSION : 0);
    poly.caps.push(ax + ux * s0, az + uz * s0, ax + ux * s1, az + uz * s1, half);
    poly.capEdges.push(e);
  }

  // ─────────────────────────────── murs ───────────────────────────────

  private isBorderEdge(ax: number, az: number, bx: number, bz: number): boolean {
    const r = this.tileRect;
    if (r === null) return false;
    return (
      (Math.abs(ax - r.minX) < BORDER_EPS && Math.abs(bx - r.minX) < BORDER_EPS) ||
      (Math.abs(ax - r.maxX) < BORDER_EPS && Math.abs(bx - r.maxX) < BORDER_EPS) ||
      (Math.abs(az - r.minZ) < BORDER_EPS && Math.abs(bz - r.minZ) < BORDER_EPS) ||
      (Math.abs(az - r.maxZ) < BORDER_EPS && Math.abs(bz - r.maxZ) < BORDER_EPS)
    );
  }

  private emitPolyWalls(poly: PolyDraft): void {
    const water = poly.kind === SOLID_WATER;
    const flags = water ? KIND_BANK | FLAG_ONE_SIDED : (poly.kind === SOLID_LANDMARK ? KIND_LANDMARK : KIND_BUILDING) | FLAG_ONE_SIDED | FLAG_SIGHT;
    const height = water ? 0 : poly.height;
    const caps = poly.caps;
    const hasCaps = caps.length > 0;
    const keep = (x: number, z: number): boolean => !inCaps(caps, x, z, -1, 0);
    for (let r = 0; r < poly.rings.length; r++) {
      const ring = poly.rings[r];
      const n = ring.length >> 1;
      // Normale sortante (−dz, dx) pour un extérieur antihoraire ou un trou horaire ; inversée sinon.
      const area = ringSignedArea(ring);
      const orient = (r === 0 ? area >= 0 : area < 0) ? 1 : -1;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[2 * j], az = ring[2 * j + 1], bx = ring[2 * i], bz = ring[2 * i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;
        if (water && this.isBorderEdge(ax, az, bx, bz)) continue;
        const nx = (-dz / len) * orient, nz = (dx / len) * orient;
        if (!hasCaps) {
          this.pushSeg(ax, az, bx, bz, nx, nz, 0, height, flags);
        } else {
          splitByPredicate(ax, az, bx, bz, keep, (pax, paz, pbx, pbz) => this.pushSeg(pax, paz, pbx, pbz, nx, nz, 0, height, flags));
        }
      }
    }
    // Murs latéraux des passages (ou parapets des ponts) : là où ils longent la matière du polygone.
    const sideHeight = water ? RAIL_HEIGHT : poly.height;
    for (let c = 0; c * CAP_STRIDE < caps.length; c++) {
      const o = c * CAP_STRIDE;
      const ax = caps[o], az = caps[o + 1], bx = caps[o + 2], bz = caps[o + 3], half = caps[o + 4];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const keepSide = (x: number, z: number): boolean => insideRings(poly.rings, x, z) && !inCaps(caps, x, z, c, 0.02);
      for (let side = -1; side <= 1; side += 2) {
        const ox = nx * half * side, oz = nz * half * side;
        // La normale du mur latéral regarde l'axe du passage.
        splitByPredicate(ax + ox, az + oz, bx + ox, bz + oz, keepSide, (pax, paz, pbx, pbz) =>
          this.pushSeg(pax, paz, pbx, pbz, -nx * side, -nz * side, 0, sideHeight, flags),
        );
      }
    }
  }

  private emitBarrier(b: BarrierDraft): void {
    let thick = 0.2, sight = false, height = b.height;
    if (b.kind === 'wall') sight = b.height >= 1.7;
    else if (b.kind === 'hedge') { thick = 0.4; sight = b.height >= 1.7; }
    else if (b.kind === 'fence') thick = 0.15;
    else if (b.kind === 'railing') thick = 0.12;
    else if (b.kind === 'quay_wall') height = Math.min(b.height, 1); // vu du quai : un parapet
    const flags = KIND_BARRIER | (sight ? FLAG_SIGHT : 0);
    const pts = b.points;
    const roads = this.roads;
    const gaps: number[] = [];
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const nx = -dz / len, nz = dx / len;
      gaps.length = 0;
      if (roads !== null) {
        const count = roads.querySegments(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5, this.roadScratch);
        for (let q = 0; q < count; q++) {
          const s = this.roadScratch[q];
          if ((roads.segFlags[s] & SEG_TUNNEL) !== 0) continue;
          const rx = roads.segXZ[4 * s], rz = roads.segXZ[4 * s + 1];
          const ex = roads.segXZ[4 * s + 2] - rx, ez = roads.segXZ[4 * s + 3] - rz;
          const elen = Math.hypot(ex, ez);
          const denom = dx * ez - dz * ex;
          if (elen < 1e-6 || Math.abs(denom) < 1e-12) continue;
          const wx = rx - ax, wz = rz - az;
          const t = (wx * ez - wz * ex) / denom;
          const u = (wx * dz - wz * dx) / denom;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const ed = roads.edges[roads.segEdge[s]];
          const half = Math.max(MIN_PASSAGE_HALF, ed.width / 2 + ed.sidewalk);
          const sin = Math.abs(denom) / (len * elen);
          const gap = half / Math.max(0.5, sin);
          gaps.push(t * len - gap, t * len + gap);
        }
      }
      if (gaps.length === 0) {
        this.pushSeg(ax, az, bx, bz, nx, nz, thick, height, flags);
        continue;
      }
      // Complément des brèches le long du segment.
      const order: number[] = [];
      for (let g = 0; g < gaps.length; g += 2) order.push(g);
      order.sort((p, r) => gaps[p] - gaps[r]);
      let from = 0;
      for (const g of order) {
        const lo = gaps[g], hi = gaps[g + 1];
        if (lo - from > 0.05) this.pushSeg(ax + (dx * from) / len, az + (dz * from) / len, ax + (dx * lo) / len, az + (dz * lo) / len, nx, nz, thick, height, flags);
        if (hi > from) from = hi;
      }
      if (len - from > 0.05) this.pushSeg(ax + (dx * from) / len, az + (dz * from) / len, bx, bz, nx, nz, thick, height, flags);
    }
  }

  // ─────────────────────────────── assemblage ───────────────────────────────

  build(): CollisionBucket {
    for (const poly of this.polys) this.findPassages(poly);
    for (const poly of this.polys) this.emitPolyWalls(poly);
    for (const b of this.barriers) this.emitBarrier(b);

    const out = new CollisionBucket();
    const segCount = this.segFlags.length;
    out.segCount = segCount;
    out.seg = Float32Array.from(this.segs);
    out.segHeight = Float32Array.from(this.segHeights);
    out.segFlags = Uint8Array.from(this.segFlags);

    // Boîte englobante.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let s = 0; s < segCount; s++) {
      const o = s * SEG_STRIDE, m = out.seg[o + 7] + 0.01;
      minX = Math.min(minX, out.seg[o] - m, out.seg[o + 2] - m);
      maxX = Math.max(maxX, out.seg[o] + m, out.seg[o + 2] + m);
      minZ = Math.min(minZ, out.seg[o + 1] - m, out.seg[o + 3] - m);
      maxZ = Math.max(maxZ, out.seg[o + 1] + m, out.seg[o + 3] + m);
    }
    for (const p of this.polys) {
      if (p.minX < minX) minX = p.minX;
      if (p.maxX > maxX) maxX = p.maxX;
      if (p.minZ < minZ) minZ = p.minZ;
      if (p.maxZ > maxZ) maxZ = p.maxZ;
    }
    if (minX === Infinity) return out; // lot vide
    out.minX = minX;
    out.minZ = minZ;
    out.maxX = maxX;
    out.maxZ = maxZ;
    out.gx0 = Math.floor(minX / COLLISION_CELL) * COLLISION_CELL;
    out.gz0 = Math.floor(minZ / COLLISION_CELL) * COLLISION_CELL;
    out.nx = Math.floor((maxX - out.gx0) / COLLISION_CELL) + 1;
    out.nz = Math.floor((maxZ - out.gz0) / COLLISION_CELL) + 1;
    const cells = out.nx * out.nz;

    // Index des segments : seules les cellules réellement touchées (épaisseur comprise).
    {
      const counts = new Uint32Array(cells + 1);
      for (let pass = 0; pass < 2; pass++) {
        for (let s = 0; s < segCount; s++) {
          const o = s * SEG_STRIDE, m = out.seg[o + 7] + 0.01;
          const ax = out.seg[o], az = out.seg[o + 1], bx = out.seg[o + 2], bz = out.seg[o + 3];
          const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - out.gx0) / COLLISION_CELL)), i1 = Math.min(out.nx - 1, Math.floor((Math.max(ax, bx) + m - out.gx0) / COLLISION_CELL));
          const j0 = Math.max(0, Math.floor((Math.min(az, bz) - m - out.gz0) / COLLISION_CELL)), j1 = Math.min(out.nz - 1, Math.floor((Math.max(az, bz) + m - out.gz0) / COLLISION_CELL));
          const diagonal = i1 > i0 && j1 > j0;
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              if (diagonal) {
                scratchRect.minX = out.gx0 + i * COLLISION_CELL - m;
                scratchRect.minZ = out.gz0 + j * COLLISION_CELL - m;
                scratchRect.maxX = scratchRect.minX + COLLISION_CELL + 2 * m;
                scratchRect.maxZ = scratchRect.minZ + COLLISION_CELL + 2 * m;
                if (!segmentIntersectsRect(ax, az, bx, bz, scratchRect)) continue;
              }
              const c = j * out.nx + i;
              if (pass === 0) counts[c + 1]++;
              else out.cellItems[counts[c]++] = s;
            }
          }
        }
        if (pass === 0) {
          for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
          out.cellStart = counts.slice();
          out.cellItems = new Uint32Array(counts[cells]);
        }
      }
    }

    // Polygones : anneaux recopiés dans un tampon commun, capsules, index par cellule.
    const polyCount = this.polys.length;
    out.polyCount = polyCount;
    out.polyBox = new Float32Array(polyCount * 4);
    out.polyKind = new Uint8Array(polyCount);
    out.polyHeight = new Float32Array(polyCount);
    out.polyRing0 = new Uint32Array(polyCount + 1);
    out.polyCap0 = new Uint32Array(polyCount + 1);
    let ringTotal = 0, pointTotal = 0, capTotal = 0;
    for (const p of this.polys) {
      ringTotal += p.rings.length;
      for (const ring of p.rings) pointTotal += ring.length >> 1;
      capTotal += p.capEdges.length;
    }
    out.ringPt0 = new Uint32Array(ringTotal + 1);
    out.xz = new Float32Array(pointTotal * 2);
    out.caps = new Float32Array(capTotal * CAP_STRIDE);
    out.capEdge = new Int32Array(capTotal);
    let ri = 0, pi = 0, ci = 0;
    for (let q = 0; q < polyCount; q++) {
      const p = this.polys[q];
      // La boîte est élargie d'un cheveu : les anneaux sont en simple précision.
      out.polyBox[4 * q] = p.minX - 0.001;
      out.polyBox[4 * q + 1] = p.minZ - 0.001;
      out.polyBox[4 * q + 2] = p.maxX + 0.001;
      out.polyBox[4 * q + 3] = p.maxZ + 0.001;
      out.polyKind[q] = p.kind;
      out.polyHeight[q] = p.height;
      out.polyRing0[q] = ri;
      out.polyCap0[q] = ci;
      for (const ring of p.rings) {
        out.ringPt0[ri++] = pi;
        for (let i = 0; i < ring.length; i++) out.xz[2 * pi + i] = ring[i];
        pi += ring.length >> 1;
      }
      for (let c = 0; c < p.capEdges.length; c++) {
        for (let v = 0; v < CAP_STRIDE; v++) out.caps[ci * CAP_STRIDE + v] = p.caps[c * CAP_STRIDE + v];
        out.capEdge[ci++] = p.capEdges[c];
      }
    }
    out.ringPt0[ri] = pi;
    out.polyRing0[polyCount] = ri;
    out.polyCap0[polyCount] = ci;

    {
      // Marques de cellules de bord pour les grands polygones (réutilisées d'un polygone à l'autre).
      const edgeMark = new Uint32Array(cells);
      let markNow = 0;
      const counts = new Uint32Array(cells + 1);
      const fill = (pass: number): void => {
        for (let q = 0; q < polyCount; q++) {
          const p = this.polys[q];
          const i0 = Math.max(0, Math.floor((p.minX - out.gx0) / COLLISION_CELL)), i1 = Math.min(out.nx - 1, Math.floor((p.maxX - out.gx0) / COLLISION_CELL));
          const j0 = Math.max(0, Math.floor((p.minZ - out.gz0) / COLLISION_CELL)), j1 = Math.min(out.nz - 1, Math.floor((p.maxZ - out.gz0) / COLLISION_CELL));
          const classify = (i1 - i0 + 1) * (j1 - j0 + 1) > CLASSIFY_CELLS;
          if (classify) {
            // Cellules traversées par un côté : test de parité nécessaire.
            markNow++;
            for (const ring of p.rings) {
              const n = ring.length >> 1;
              for (let a = 0, b = n - 1; a < n; b = a++) {
                const ax = ring[2 * b], az = ring[2 * b + 1], bx = ring[2 * a], bz = ring[2 * a + 1];
                const ei0 = Math.max(i0, Math.floor((Math.min(ax, bx) - 0.01 - out.gx0) / COLLISION_CELL)), ei1 = Math.min(i1, Math.floor((Math.max(ax, bx) + 0.01 - out.gx0) / COLLISION_CELL));
                const ej0 = Math.max(j0, Math.floor((Math.min(az, bz) - 0.01 - out.gz0) / COLLISION_CELL)), ej1 = Math.min(j1, Math.floor((Math.max(az, bz) + 0.01 - out.gz0) / COLLISION_CELL));
                for (let j = ej0; j <= ej1; j++) {
                  for (let i = ei0; i <= ei1; i++) {
                    scratchRect.minX = out.gx0 + i * COLLISION_CELL - 0.01;
                    scratchRect.minZ = out.gz0 + j * COLLISION_CELL - 0.01;
                    scratchRect.maxX = scratchRect.minX + COLLISION_CELL + 0.02;
                    scratchRect.maxZ = scratchRect.minZ + COLLISION_CELL + 0.02;
                    if (segmentIntersectsRect(ax, az, bx, bz, scratchRect)) edgeMark[j * out.nx + i] = markNow;
                  }
                }
              }
            }
          }
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const c = j * out.nx + i;
              let item = q;
              if (classify && edgeMark[c] !== markNow) {
                // Cellule sans côté : entièrement dedans ou entièrement dehors.
                if (!insideRings(p.rings, out.gx0 + (i + 0.5) * COLLISION_CELL, out.gz0 + (j + 0.5) * COLLISION_CELL)) continue;
                item = q | POLY_FULL_CELL;
              }
              if (pass === 0) counts[c + 1]++;
              else out.polyCellItems[counts[c]++] = item;
            }
          }
        }
      };
      fill(0);
      for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
      out.polyCellStart = counts.slice();
      out.polyCellItems = new Uint32Array(counts[cells]);
      fill(1);
    }
    return out;
  }
}
