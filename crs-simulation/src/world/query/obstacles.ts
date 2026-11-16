/* =====================================================================================
 * Construction des lots d'obstacles (au chargement d'une tuile, ou une fois pour les monuments).
 *
 * Entrées : polygones pleins (bâtiments, monuments, plans d'eau) et barrières linéaires.
 * Règle de cohérence avec le réseau de rues : LE GRAPHE FAIT FOI POUR LE PASSAGE. Là où une voie
 * (hors souterrain) traverse un polygone plein ou une barrière, une ouverture est pratiquée :
 *   - bâtiment : porche de la largeur de la chaussée ;
 *   - plan d'eau : tablier du pont (chaussée + trottoirs) ;
 *   - barrière : brèche de la largeur de la voie (chaussée + trottoirs).
 * Une ouverture est une « capsule » (segment épaissi) soustraite au polygone. Son pourtour est
 * muré partout où il longe la matière du polygone : murs latéraux du porche, parapets du pont,
 * fond arrondi d'une voie qui s'arrête dans un bâtiment (entrée de parking). Un côté du polygone
 * pris dans une capsule est ouvert, sauf s'il est mitoyen d'un autre obstacle plein.
 * Les côtés d'un plan d'eau posés sur une limite de tuile (artefact du découpage) ne sont pas
 * des berges : ils sont ignorés.
 * Quand la carte fournit l'emprise réelle d'un pont (une chaussée ou un trottoir qui recouvre
 * l'eau), ce « tablier » fait foi : l'eau n'est plus un obstacle dessous, ses bords au-dessus de
 * l'eau reçoivent un parapet, la berge et le mur de quai s'ouvrent à son passage.
 *
 * Tout ce fichier s'exécute au chargement : les allocations y sont permises.
 * ===================================================================================== */

import { ringSignedArea } from '../mapdata';
import type { BarrierKind, Bounds } from '../mapdata';
import { indexPolygons, indexSegments, insideRings } from './bucket-index';
import type { PolyDraft } from './bucket-index';
import {
  CAP_STRIDE, COLLISION_CELL, CollisionBucket, FLAG_ONE_SIDED, FLAG_SIGHT, KIND_BANK, KIND_BARRIER, KIND_BUILDING,
  KIND_LANDMARK, SOLID_DECK, SOLID_LANDMARK, SOLID_WATER,
} from './collision';
import type { RoadNetwork } from './roads';
import { SEG_BRIDGE, SEG_TUNNEL } from './roads';

/** Demi-largeur minimale d'une ouverture pratiquée pour une voie (m). */
const MIN_PASSAGE_HALF = 1.25;
/** Demi-largeur maximale d'un tablier de pont prise en compte autour d'un plan d'eau (m). */
const MAX_HALF_DECK = 40;
/** Prolongement d'une capsule de passage au-delà du mur traversé (m). */
const PASSAGE_EXTENSION = 0.3;
/** Pas d'échantillonnage des découpes (m) ; les limites sont ensuite affinées par dichotomie. */
const SAMPLE_STEP = 0.5;
/** Nombre de segments d'un demi-cercle de fond de passage. */
const CAP_ARC_STEPS = 8;
/** Distance (m) à laquelle on sonde, derrière un côté pris dans une capsule, s'il est mitoyen. */
const PARTY_PROBE = 0.3;
/** Distance (m) à laquelle on sonde l'eau derrière une berge, ou ce qu'il y a au-delà d'un bord de tablier. */
const BANK_PROBE = 0.4;
/** Marge (m) de la boîte d'un lot autour de son contenu (épaisseur des barrières, arrondis). */
const BUCKET_MARGIN = 0.6;
/** Hauteur (m) retenue pour les parapets générés le long des ponts. */
const RAIL_HEIGHT = 1;
/** Tolérance (m) pour reconnaître un côté posé sur une limite de tuile. */
const BORDER_EPS = 0.06;

interface BarrierDraft { kind: BarrierKind; height: number; points: ArrayLike<number> }

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

/** Un côté de la surface passe-t-il au-dessus d'un plan d'eau du lot ? (trois sondes par côté) */
function overlapsWater(poly: PolyDraft, out: CollisionBucket): boolean {
  for (const ring of poly.rings) {
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j], az = ring[2 * j + 1], bx = ring[2 * i], bz = ring[2 * i + 1];
      for (let k = 1; k <= 3; k++) {
        if (out.waterAt(ax + ((bx - ax) * k) / 4, az + ((bz - az) * k) / 4)) return true;
      }
    }
  }
  return false;
}

/** Une capsule passe-t-elle près du segment (comparaison des boîtes englobantes) ? */
function capsNear(caps: readonly number[], ax: number, az: number, bx: number, bz: number): boolean {
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
  for (let o = 0; o < caps.length; o += CAP_STRIDE) {
    const r = caps[o + 4];
    if (Math.max(caps[o], caps[o + 2]) + r < minX || Math.min(caps[o], caps[o + 2]) - r > maxX) continue;
    if (Math.max(caps[o + 1], caps[o + 3]) + r < minZ || Math.min(caps[o + 1], caps[o + 3]) - r > maxZ) continue;
    return true;
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
  private readonly deckCandidates: PolyDraft[] = [];
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

  /**
   * Surface dure de la carte (chaussée, trottoir, terre-plein, zone piétonne, place) d'une tuile qui
   * contient de l'eau : si elle recouvre un plan d'eau, c'est un tablier de pont (l'emprise réelle du
   * pont, plus juste que la largeur estimée de son arête). Le tri est fait à la construction.
   */
  addDeckCandidate(rings: readonly ArrayLike<number>[]): void {
    const before = this.polys.length;
    this.addPoly(rings, SOLID_DECK, 0);
    if (this.polys.length > before) this.deckCandidates.push(this.polys.pop() as PolyDraft);
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
    if (roads === null || poly.kind === SOLID_DECK) return;
    const list = this.roadScratch;
    const water = poly.kind === SOLID_WATER;
    // Pour l'eau, la recherche est élargie de la demi-largeur des plus grands tabliers.
    const reach = water ? MAX_HALF_DECK : 1;
    const count = roads.querySegments(poly.minX - reach, poly.minZ - reach, poly.maxX + reach, poly.maxZ + reach, list);
    const ts: number[] = [];
    for (let q = 0; q < count; q++) {
      const s = list[q];
      if ((roads.segFlags[s] & SEG_TUNNEL) !== 0) continue;
      const ax = roads.segXZ[4 * s], az = roads.segXZ[4 * s + 1], bx = roads.segXZ[4 * s + 2], bz = roads.segXZ[4 * s + 3];
      const m = water && (roads.segFlags[s] & SEG_BRIDGE) !== 0 ? roads.halfDeck[roads.segEdge[s]] : 0;
      if (Math.max(ax, bx) + m < poly.minX || Math.min(ax, bx) - m > poly.maxX || Math.max(az, bz) + m < poly.minZ || Math.min(az, bz) - m > poly.maxZ) continue;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      if (water && (roads.segFlags[s] & SEG_BRIDGE) !== 0) {
        // Pont au-dessus de l'eau : tout le tablier est praticable, pas seulement son axe (le plan
        // d'eau est découpé par tuile : l'axe peut passer dans la tuile voisine, à un mètre du bord).
        poly.caps.push(ax, az, bx, bz, roads.halfDeck[roads.segEdge[s]]);
        poly.capEdges.push(roads.segEdge[s]);
        continue;
      }
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

  /**
   * Murs d'un polygone : ses côtés (ouverts au droit des capsules), puis le pourtour des capsules
   * là où il longe la matière du polygone.
   * @param q indice du polygone dans le lot `out` (dont les polygones sont déjà indexés)
   */
  private emitPolyWalls(poly: PolyDraft, q: number, out: CollisionBucket): void {
    if (poly.kind === SOLID_DECK) {
      this.emitDeckRails(poly, out);
      return;
    }
    const water = poly.kind === SOLID_WATER;
    const flags = water ? KIND_BANK | FLAG_ONE_SIDED : (poly.kind === SOLID_LANDMARK ? KIND_LANDMARK : KIND_BUILDING) | FLAG_ONE_SIDED | FLAG_SIGHT;
    const height = water ? 0 : poly.height;
    const caps = poly.caps;
    const hasCaps = caps.length > 0;
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
        if (water) {
          if (!out.hasDecks && (!hasCaps || !capsNear(caps, ax, az, bx, bz))) {
            this.pushSeg(ax, az, bx, bz, nx, nz, 0, height, flags);
            continue;
          }
          // La berge s'ouvre là où l'eau, juste derrière elle, est sous un pont (capsule ou tablier) :
          // le pont enjambe la berge à cet endroit.
          const keepBank = (x: number, z: number): boolean => {
            const px = x - nx * BANK_PROBE, pz = z - nz * BANK_PROBE;
            return !inCaps(caps, px, pz, -1, 0) && !out.deckAt(px, pz);
          };
          splitByPredicate(ax, az, bx, bz, keepBank, (pax, paz, pbx, pbz) => this.pushSeg(pax, paz, pbx, pbz, nx, nz, 0, height, flags));
          continue;
        }
        if (!hasCaps || !capsNear(caps, ax, az, bx, bz)) {
          this.pushSeg(ax, az, bx, bz, nx, nz, 0, height, flags);
          continue;
        }
        // Dans une capsule, le côté s'ouvre — sauf s'il est mitoyen d'un autre obstacle plein
        // (le passage longe alors ce voisin : le mur reste).
        const keep = (x: number, z: number): boolean =>
          !inCaps(caps, x, z, -1, 0) || out.solidAt(x + nx * PARTY_PROBE, z + nz * PARTY_PROBE, q);
        splitByPredicate(ax, az, bx, bz, keep, (pax, paz, pbx, pbz) => this.pushSeg(pax, paz, pbx, pbz, nx, nz, 0, height, flags));
      }
    }
    if (!hasCaps) return;
    // Pourtour des capsules : deux côtés et deux demi-cercles, là où ils sont dans la matière du
    // polygone et hors de ses autres capsules. La normale regarde l'intérieur de la capsule.
    const sideHeight = water ? RAIL_HEIGHT : poly.height;
    for (let c = 0; c * CAP_STRIDE < caps.length; c++) {
      const o = c * CAP_STRIDE;
      const ax = caps[o], az = caps[o + 1], bx = caps[o + 2], bz = caps[o + 3], half = caps[o + 4];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const nx = -uz, nz = ux;
      // (Pour l'eau : pas de parapet de capsule au milieu d'un tablier réel plus large qu'elle.)
      const keepSide = (x: number, z: number): boolean =>
        out.insidePolygon(q, x, z) && !inCaps(caps, x, z, c, 0.02) && !(water && out.deckAt(x, z));
      for (let side = -1; side <= 1; side += 2) {
        const ox = nx * half * side, oz = nz * half * side;
        splitByPredicate(ax + ox, az + oz, bx + ox, bz + oz, keepSide, (pax, paz, pbx, pbz) =>
          this.pushSeg(pax, paz, pbx, pbz, -nx * side, -nz * side, 0, sideHeight, flags),
        );
      }
      for (let end = 0; end < 2; end++) {
        // Demi-cercle autour de l'extrémité, du côté opposé au corps de la capsule.
        const ex = end === 0 ? ax : bx, ez = end === 0 ? az : bz;
        const fx = end === 0 ? -ux : ux, fz = end === 0 ? -uz : uz;
        let px = ex + nx * half, pz = ez + nz * half;
        for (let k = 1; k <= CAP_ARC_STEPS; k++) {
          const a = (k / CAP_ARC_STEPS) * Math.PI;
          const qx = ex + (nx * Math.cos(a) + fx * Math.sin(a)) * half, qz = ez + (nz * Math.cos(a) + fz * Math.sin(a)) * half;
          // Normale du morceau : du milieu de la corde vers le centre du demi-cercle.
          const mx = ex - (px + qx) / 2, mz = ez - (pz + qz) / 2;
          const ml = Math.hypot(mx, mz) || 1;
          const wx = mx / ml, wz = mz / ml;
          splitByPredicate(px, pz, qx, qz, keepSide, (pax, paz, pbx, pbz) => this.pushSeg(pax, paz, pbx, pbz, wx, wz, 0, sideHeight, flags));
          px = qx;
          pz = qz;
        }
      }
    }
  }

  /**
   * Parapets d'un tablier : ses côtés, là où il n'y a que de l'eau (ou un autre obstacle plein) de
   * l'autre côté. La normale regarde le tablier.
   */
  private emitDeckRails(poly: PolyDraft, out: CollisionBucket): void {
    const flags = KIND_BANK | FLAG_ONE_SIDED;
    for (let r = 0; r < poly.rings.length; r++) {
      const ring = poly.rings[r];
      const n = ring.length >> 1;
      const area = ringSignedArea(ring);
      const orient = (r === 0 ? area >= 0 : area < 0) ? 1 : -1;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[2 * j], az = ring[2 * j + 1], bx = ring[2 * i], bz = ring[2 * i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4 || this.isBorderEdge(ax, az, bx, bz)) continue;
        const nx = (-dz / len) * orient, nz = (dx / len) * orient; // vers l'extérieur du tablier
        const overWater = (x: number, z: number): boolean => out.solidAt(x + nx * BANK_PROBE, z + nz * BANK_PROBE);
        splitByPredicate(ax, az, bx, bz, overWater, (pax, paz, pbx, pbz) => this.pushSeg(pax, paz, pbx, pbz, -nx, -nz, 0, RAIL_HEIGHT, flags));
      }
    }
  }

  private emitBarrier(b: BarrierDraft, out: CollisionBucket): void {
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
    // Un mur de quai court le long de la berge, y compris sous les ponts : sous un tablier, il ne
    // barre pas le pont (la berge, elle, reste fermée de part et d'autre).
    const underDeck = b.kind === 'quay_wall' && out.hasDecks;
    const notUnderDeck = (x: number, z: number): boolean => !out.deckAt(x, z);
    const push = (pax: number, paz: number, pbx: number, pbz: number, nx: number, nz: number): void => {
      if (!underDeck) this.pushSeg(pax, paz, pbx, pbz, nx, nz, thick, height, flags);
      else splitByPredicate(pax, paz, pbx, pbz, notUnderDeck, (qax, qaz, qbx, qbz) => this.pushSeg(qax, qaz, qbx, qbz, nx, nz, thick, height, flags));
    };
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
        push(ax, az, bx, bz, nx, nz);
        continue;
      }
      // Complément des brèches le long du segment.
      const order: number[] = [];
      for (let g = 0; g < gaps.length; g += 2) order.push(g);
      order.sort((p, r) => gaps[p] - gaps[r]);
      let from = 0;
      for (const g of order) {
        const lo = gaps[g], hi = gaps[g + 1];
        if (lo - from > 0.05) push(ax + (dx * from) / len, az + (dz * from) / len, ax + (dx * lo) / len, az + (dz * lo) / len, nx, nz);
        if (hi > from) from = hi;
      }
      if (len - from > 0.05) push(ax + (dx * from) / len, az + (dz * from) / len, bx, bz, nx, nz);
    }
  }

  // ─────────────────────────────── assemblage ───────────────────────────────

  build(): CollisionBucket {
    for (const poly of this.polys) this.findPassages(poly);

    // Boîte englobante de tout le contenu (les murs sont sur ou dans les polygones).
    const out = new CollisionBucket();
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of this.polys) {
      if (p.minX < minX) minX = p.minX;
      if (p.maxX > maxX) maxX = p.maxX;
      if (p.minZ < minZ) minZ = p.minZ;
      if (p.maxZ > maxZ) maxZ = p.maxZ;
    }
    for (const p of this.deckCandidates) {
      if (p.minX < minX) minX = p.minX;
      if (p.maxX > maxX) maxX = p.maxX;
      if (p.minZ < minZ) minZ = p.minZ;
      if (p.maxZ > maxZ) maxZ = p.maxZ;
    }
    for (const b of this.barriers) {
      for (let i = 0; i + 1 < b.points.length; i += 2) {
        if (b.points[i] < minX) minX = b.points[i];
        if (b.points[i] > maxX) maxX = b.points[i];
        if (b.points[i + 1] < minZ) minZ = b.points[i + 1];
        if (b.points[i + 1] > maxZ) maxZ = b.points[i + 1];
      }
    }
    if (minX === Infinity) return out; // lot vide
    out.minX = minX - BUCKET_MARGIN;
    out.minZ = minZ - BUCKET_MARGIN;
    out.maxX = maxX + BUCKET_MARGIN;
    out.maxZ = maxZ + BUCKET_MARGIN;
    out.gx0 = Math.floor(out.minX / COLLISION_CELL) * COLLISION_CELL;
    out.gz0 = Math.floor(out.minZ / COLLISION_CELL) * COLLISION_CELL;
    out.nx = Math.floor((out.maxX - out.gx0) / COLLISION_CELL) + 1;
    out.nz = Math.floor((out.maxZ - out.gz0) / COLLISION_CELL) + 1;

    // Les polygones d'abord : l'émission des murs interroge « y a-t-il un autre obstacle plein ici ? ».
    indexPolygons(out, this.polys);
    // Tabliers : parmi les surfaces dures proposées, celles dont un côté passe au-dessus de l'eau.
    let decks = 0;
    for (const cand of this.deckCandidates) {
      if (!overlapsWater(cand, out)) continue;
      this.polys.push(cand);
      decks++;
    }
    if (decks > 0) {
      indexPolygons(out, this.polys);
      out.hasDecks = true;
    }
    for (let q = 0; q < this.polys.length; q++) this.emitPolyWalls(this.polys[q], q, out);
    for (const b of this.barriers) this.emitBarrier(b, out);
    indexSegments(out, this.segs, this.segHeights, this.segFlags);
    return out;
  }
}
