/* =====================================================================================
 * IMMEUBLES — préparation d'une tuile (logique pure)
 * -------------------------------------------------------------------------------------
 * Avant de produire le moindre triangle :
 *   1. on écarte les bâtiments remplacés par un monument et les emprises dégénérées ;
 *   2. on nettoie les anneaux (sommets répétés ou alignés, sens de parcours) ;
 *   3. on pose chaque bâtiment sur le relief (altitude MINIMALE de son emprise) ;
 *   4. on calcule sa trame verticale (rez-de-chaussée, étages, hauteur du toit) ;
 *   5. on classe chaque pan de mur : façade libre, mur mitoyen (aveugle), mur entièrement
 *      caché par le voisin (non dessiné).
 * Le résultat vit dans des tableaux réutilisés d'une tuile à l'autre.
 * ===================================================================================== */

import { TILE_SIZE } from '../../mapdata';
import type { Building, BuildingStyle, Tile } from '../../mapdata';
import { STYLE_PARAMS, hash01, layoutFloors, roofHeightFor } from './layout';
import type { FloorLayout } from './layout';
import { cleanRing, pointInRing, ringArea } from './rings';

/** Pan de mur libre : façade avec fenêtres. */
export const WALL_FREE = 0;
/** Mur mitoyen : accolé à un autre bâtiment, donc aveugle. */
export const WALL_PARTY = 1;
/** Mur mitoyen entièrement masqué par un voisin au moins aussi haut : non dessiné. */
export const WALL_HIDDEN = 2;

/** Distance (m) à laquelle on cherche un voisin derrière un mur pour le dire mitoyen. */
const PARTY_PROBE = 0.4;
/** Distance (m) pour dire qu'un mur est réellement collé au voisin (donc invisible). */
const HIDDEN_PROBE = 0.08;
const GRID_CELL = 32;

export interface PreparedTile {
  /** Origine de la tuile (m, monde) : les coordonnées ci-dessous lui sont relatives. */
  ox: number;
  oz: number;
  /** Nombre de bâtiments retenus. */
  count: number;
  /** Pour chaque bâtiment retenu : son objet d'origine. */
  building: Building[];
  /** Tous les anneaux nettoyés, à la suite : [x, z] locaux. */
  coords: Float64Array;
  /** Par anneau : premier sommet et nombre de sommets. */
  ringStart: Int32Array;
  ringLen: Int32Array;
  /** Par bâtiment : premier anneau (l'extérieur) et nombre d'anneaux. */
  firstRing: Int32Array;
  ringCount: Int32Array;
  /** Par bâtiment : boîte englobante locale. */
  minX: Float32Array;
  minZ: Float32Array;
  maxX: Float32Array;
  maxZ: Float32Array;
  /** Par bâtiment : altitude du pied, hauteur du mur, hauteur du toit, trame verticale. */
  baseY: Float32Array;
  wallH: Float32Array;
  roofH: Float32Array;
  rdcH: Float32Array;
  floorH: Float32Array;
  nUpper: Uint8Array;
  /** Par bâtiment : aire (m²), nombre pseudo-aléatoire stable 0..1. */
  area: Float32Array;
  rand: Float32Array;
  /** Par bâtiment : axe principal (unitaire) et demi-largeur perpendiculaire, centre de la bande. */
  axisX: Float32Array;
  axisZ: Float32Array;
  halfSpan: Float32Array;
  midSpan: Float32Array;
  /** Par sommet (côté sommet i → i+1 de son anneau) : WALL_FREE, WALL_PARTY ou WALL_HIDDEN. */
  wall: Uint8Array;
  /** Nombre total de sommets et d'anneaux. */
  nVerts: number;
  nRings: number;
}

function createPrepared(): PreparedTile {
  return {
    ox: 0, oz: 0, count: 0, building: [],
    coords: new Float64Array(4096), ringStart: new Int32Array(512), ringLen: new Int32Array(512),
    firstRing: new Int32Array(512), ringCount: new Int32Array(512),
    minX: new Float32Array(512), minZ: new Float32Array(512), maxX: new Float32Array(512), maxZ: new Float32Array(512),
    baseY: new Float32Array(512), wallH: new Float32Array(512), roofH: new Float32Array(512), rdcH: new Float32Array(512),
    floorH: new Float32Array(512), nUpper: new Uint8Array(512), area: new Float32Array(512), rand: new Float32Array(512),
    axisX: new Float32Array(512), axisZ: new Float32Array(512), halfSpan: new Float32Array(512), midSpan: new Float32Array(512),
    wall: new Uint8Array(2048), nVerts: 0, nRings: 0,
  };
}

let shared: PreparedTile | null = null;
let scratchRing = new Float64Array(1024);
let scratchLocal = new Float64Array(1024);
const floorOut: FloorLayout = { wallH: 0, roofH: 0, rdcH: 0, nUpper: 0, floorH: 0 };

// Grille de voisinage (tri par comptage).
let cellStart = new Int32Array(1);
let cellItems = new Int32Array(1);
let gridW = 0, gridH = 0, gridX0 = 0, gridZ0 = 0;

function growF32(a: Float32Array, n: number): Float32Array {
  if (a.length >= n) return a;
  const g = new Float32Array(Math.max(n, a.length * 2));
  g.set(a);
  return g;
}
function growI32(a: Int32Array, n: number): Int32Array {
  if (a.length >= n) return a;
  const g = new Int32Array(Math.max(n, a.length * 2));
  g.set(a);
  return g;
}

function ensureBuildings(p: PreparedTile, n: number): void {
  if (p.firstRing.length >= n) return;
  p.firstRing = growI32(p.firstRing, n); p.ringCount = growI32(p.ringCount, n);
  p.minX = growF32(p.minX, n); p.minZ = growF32(p.minZ, n); p.maxX = growF32(p.maxX, n); p.maxZ = growF32(p.maxZ, n);
  p.baseY = growF32(p.baseY, n); p.wallH = growF32(p.wallH, n); p.roofH = growF32(p.roofH, n); p.rdcH = growF32(p.rdcH, n);
  p.floorH = growF32(p.floorH, n); p.area = growF32(p.area, n); p.rand = growF32(p.rand, n);
  p.axisX = growF32(p.axisX, n); p.axisZ = growF32(p.axisZ, n); p.halfSpan = growF32(p.halfSpan, n); p.midSpan = growF32(p.midSpan, n);
  if (p.nUpper.length < n) { const g = new Uint8Array(Math.max(n, p.nUpper.length * 2)); g.set(p.nUpper); p.nUpper = g; }
}

function ensureVerts(p: PreparedTile, n: number): void {
  if (p.coords.length < n * 2) {
    const g = new Float64Array(Math.max(n * 2, p.coords.length * 2));
    g.set(p.coords.subarray(0, p.nVerts * 2));
    p.coords = g;
  }
  if (p.wall.length < n) {
    const g = new Uint8Array(Math.max(n, p.wall.length * 2));
    g.set(p.wall.subarray(0, p.nVerts));
    p.wall = g;
  }
}

function ensureRings(p: PreparedTile, n: number): void {
  p.ringStart = growI32(p.ringStart, n);
  p.ringLen = growI32(p.ringLen, n);
}

/** Style effectif d'un bâtiment : certains types imposent leur trame. */
export function effectiveStyle(b: Building): BuildingStyle {
  return b.style;
}

/** Libère les tampons de préparation (ils seront recréés à la demande). */
export function releasePrepareScratch(): void {
  shared = null;
  scratchRing = new Float64Array(1024);
  scratchLocal = new Float64Array(1024);
  cellStart = new Int32Array(1);
  cellItems = new Int32Array(1);
}

/**
 * Prépare les bâtiments d'une tuile. Le résultat est un tampon PARTAGÉ : il n'est valable que
 * jusqu'au prochain appel.
 * @param classify  calculer le classement des murs (mitoyen / caché)
 */
export function prepareTile(
  tile: Tile, heightAt: (x: number, z: number) => number, skipLandmark: (key: string) => boolean, seed: number, classify = true,
): PreparedTile {
  const p = shared ?? (shared = createPrepared());
  const ox = tile.tx * TILE_SIZE, oz = tile.tz * TILE_SIZE;
  p.ox = ox; p.oz = oz;
  p.count = 0; p.nVerts = 0; p.nRings = 0;
  p.building.length = 0;
  const list = tile.buildings;
  ensureBuildings(p, list.length);

  for (let bi = 0; bi < list.length; bi++) {
    const b = list[bi];
    if (b.landmarkKey !== '' && skipLandmark(b.landmarkKey)) continue;
    if (!(b.height > 0.3) || !Number.isFinite(b.height)) continue;
    const src = b.outer;
    const nSrc = src.length >> 1;
    if (nSrc < 3) continue;
    let need = nSrc;
    for (let h = 0; h < b.holes.length; h++) need = Math.max(need, b.holes[h].length >> 1);
    if (scratchRing.length < need * 2) { scratchRing = new Float64Array(need * 4); scratchLocal = new Float64Array(need * 4); }
    // coordonnées locales (meilleure précision en float32 côté carte graphique)
    for (let i = 0; i < nSrc; i++) { scratchLocal[2 * i] = src[2 * i] - ox; scratchLocal[2 * i + 1] = src[2 * i + 1] - oz; }
    const n = cleanRing(scratchLocal, scratchRing, true, 0.05, 0.04, 0.5, nSrc);
    if (n < 3) continue;

    const k = p.count;
    ensureVerts(p, p.nVerts + n);
    ensureRings(p, p.nRings + 1 + b.holes.length);
    p.firstRing[k] = p.nRings;
    let rc = 0;
    const coords = p.coords;
    let v0 = p.nVerts;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = scratchRing[2 * i], z = scratchRing[2 * i + 1];
      coords[2 * (v0 + i)] = x; coords[2 * (v0 + i) + 1] = z;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    p.ringStart[p.nRings] = v0; p.ringLen[p.nRings] = n;
    p.nRings++; rc++;
    p.nVerts += n;
    const outerStart = v0;
    const outerArea = ringArea(scratchRing, n);
    let area = outerArea;
    // cours intérieures
    for (let h = 0; h < b.holes.length; h++) {
      const hs = b.holes[h];
      const nh = hs.length >> 1;
      if (nh < 3) continue;
      for (let i = 0; i < nh; i++) { scratchLocal[2 * i] = hs[2 * i] - ox; scratchLocal[2 * i + 1] = hs[2 * i + 1] - oz; }
      const m = cleanRing(scratchLocal, scratchRing, false, 0.05, 0.04, 1.0, nh);
      if (m < 3) continue;
      // un trou doit être DANS l'anneau extérieur (premier sommet) : sinon on l'ignore
      if (!pointInRing(p.coords.subarray(2 * outerStart, 2 * (outerStart + n)), n, scratchRing[0], scratchRing[1])) continue;
      ensureVerts(p, p.nVerts + m);
      v0 = p.nVerts;
      const c2 = p.coords;
      for (let i = 0; i < m; i++) { c2[2 * (v0 + i)] = scratchRing[2 * i]; c2[2 * (v0 + i) + 1] = scratchRing[2 * i + 1]; }
      p.ringStart[p.nRings] = v0; p.ringLen[p.nRings] = m;
      p.nRings++; rc++;
      p.nVerts += m;
      area += ringArea(scratchRing, m);     // négative : horaire
    }
    p.ringCount[k] = rc;
    p.minX[k] = minX; p.minZ[k] = minZ; p.maxX[k] = maxX; p.maxZ[k] = maxZ;
    p.area[k] = area;
    p.rand[k] = hash01(b.id, seed);

    // axe principal (plus long côté), périmètre et étendue perpendiculaire
    const cs = p.coords;
    let best = -1, ax = 1, az = 0, perimeter = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ex = cs[2 * (outerStart + i)] - cs[2 * (outerStart + j)], ez = cs[2 * (outerStart + i) + 1] - cs[2 * (outerStart + j) + 1];
      const l2 = ex * ex + ez * ez;
      perimeter += Math.sqrt(l2);
      if (l2 > best) { best = l2; ax = ex; az = ez; }
    }
    const al = Math.sqrt(best) || 1;
    ax /= al; az /= al;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const d = cs[2 * (outerStart + i)] * -az + cs[2 * (outerStart + i) + 1] * ax;   // distance signée à l'axe passant par l'origine
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    p.axisX[k] = ax; p.axisZ[k] = az;
    p.halfSpan[k] = (hi - lo) / 2;
    p.midSpan[k] = (hi + lo) / 2;

    // pied : altitude minimale de l'emprise
    let base = Infinity;
    const stride = n > 48 ? Math.ceil(n / 48) : 1;
    for (let i = 0; i < n; i += stride) {
      const y = heightAt(cs[2 * (outerStart + i)] + ox, cs[2 * (outerStart + i) + 1] + oz);
      if (y < base) base = y;
    }
    if (!Number.isFinite(base)) base = Number.isFinite(b.baseY) ? b.baseY : 0;
    p.baseY[k] = base;

    // trame verticale
    const sp = STYLE_PARAMS[effectiveStyle(b)] ?? STYLE_PARAMS.haussmann;
    const span = Math.min(hi - lo, (4 * outerArea) / Math.max(perimeter, 1));
    const roofH = roofHeightFor(b.roof, b.height, span, b.kind);
    layoutFloors(b.height, roofH, b.levels, sp, floorOut);
    p.wallH[k] = floorOut.wallH;
    p.roofH[k] = floorOut.roofH;
    p.rdcH[k] = floorOut.rdcH;
    p.floorH[k] = floorOut.floorH;
    p.nUpper[k] = floorOut.nUpper > 255 ? 255 : floorOut.nUpper;

    p.building.push(b);
    p.count++;
  }

  if (classify) classifyWalls(p);
  else p.wall.fill(WALL_FREE, 0, p.nVerts);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Voisinage : murs mitoyens
// ─────────────────────────────────────────────────────────────────────────────────────

function buildGrid(p: PreparedTile): void {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let k = 0; k < p.count; k++) {
    if (p.minX[k] < minX) minX = p.minX[k];
    if (p.minZ[k] < minZ) minZ = p.minZ[k];
    if (p.maxX[k] > maxX) maxX = p.maxX[k];
    if (p.maxZ[k] > maxZ) maxZ = p.maxZ[k];
  }
  if (p.count === 0) { minX = minZ = 0; maxX = maxZ = 1; }
  gridX0 = minX - 1; gridZ0 = minZ - 1;
  gridW = Math.min(96, Math.max(1, Math.ceil((maxX - minX + 2) / GRID_CELL)));
  gridH = Math.min(96, Math.max(1, Math.ceil((maxZ - minZ + 2) / GRID_CELL)));
  const nCells = gridW * gridH;
  if (cellStart.length < nCells + 1) cellStart = new Int32Array(nCells + 1);
  cellStart.fill(0, 0, nCells + 1);
  // 1re passe : comptage
  for (let k = 0; k < p.count; k++) {
    const x0 = cellX(p.minX[k]), x1 = cellX(p.maxX[k]), z0 = cellZ(p.minZ[k]), z1 = cellZ(p.maxZ[k]);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) cellStart[cz * gridW + cx + 1]++;
  }
  for (let c = 0; c < nCells; c++) cellStart[c + 1] += cellStart[c];
  const total = cellStart[nCells];
  if (cellItems.length < total) cellItems = new Int32Array(Math.max(total, cellItems.length * 2));
  // 2e passe : remplissage (cellStart sert de curseur, puis est rétabli)
  for (let k = 0; k < p.count; k++) {
    const x0 = cellX(p.minX[k]), x1 = cellX(p.maxX[k]), z0 = cellZ(p.minZ[k]), z1 = cellZ(p.maxZ[k]);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) cellItems[cellStart[cz * gridW + cx]++] = k;
  }
  for (let c = nCells; c > 0; c--) cellStart[c] = cellStart[c - 1];
  cellStart[0] = 0;
}

function cellX(x: number): number {
  const c = Math.floor((x - gridX0) / GRID_CELL);
  return c < 0 ? 0 : c >= gridW ? gridW - 1 : c;
}
function cellZ(z: number): number {
  const c = Math.floor((z - gridZ0) / GRID_CELL);
  return c < 0 ? 0 : c >= gridH ? gridH - 1 : c;
}

/** Le point local (x, z) est-il dans la masse du bâtiment k (anneau extérieur moins les cours) ? */
export function insideBuilding(p: PreparedTile, k: number, x: number, z: number): boolean {
  if (x < p.minX[k] || x > p.maxX[k] || z < p.minZ[k] || z > p.maxZ[k]) return false;
  const r0 = p.firstRing[k];
  const s0 = p.ringStart[r0], n0 = p.ringLen[r0];
  const cs = p.coords;
  // test de parité direct sur le tampon commun (pas de sous-tableau alloué)
  let inside = false;
  for (let i = 0, j = n0 - 1; i < n0; j = i++) {
    const zi = cs[2 * (s0 + i) + 1], zj = cs[2 * (s0 + j) + 1];
    if ((zi > z) !== (zj > z)) {
      const xi = cs[2 * (s0 + i)], xj = cs[2 * (s0 + j)];
      if (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
  }
  if (!inside) return false;
  for (let r = 1; r < p.ringCount[k]; r++) {
    const s = p.ringStart[r0 + r], n = p.ringLen[r0 + r];
    let inHole = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const zi = cs[2 * (s + i) + 1], zj = cs[2 * (s + j) + 1];
      if ((zi > z) !== (zj > z)) {
        const xi = cs[2 * (s + i)], xj = cs[2 * (s + j)];
        if (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inHole = !inHole;
      }
    }
    if (inHole) return false;
  }
  return true;
}

/** Indice d'un bâtiment (autre que `self`) qui contient le point, ou -1. */
export function neighborAt(p: PreparedTile, x: number, z: number, self: number): number {
  const c = cellZ(z) * gridW + cellX(x);
  for (let i = cellStart[c], e = cellStart[c + 1]; i < e; i++) {
    const k = cellItems[i];
    if (k !== self && insideBuilding(p, k, x, z)) return k;
  }
  return -1;
}

const PROBE_T = [0.5, 0.18, 0.82];

function classifyWalls(p: PreparedTile): void {
  buildGrid(p);
  const cs = p.coords;
  for (let k = 0; k < p.count; k++) {
    const myTop = p.baseY[k] + p.wallH[k];
    const r0 = p.firstRing[k];
    for (let r = 0; r < p.ringCount[k]; r++) {
      const s = p.ringStart[r0 + r], n = p.ringLen[r0 + r];
      for (let i = 0; i < n; i++) {
        const j = i + 1 < n ? i + 1 : 0;
        const ax = cs[2 * (s + i)], az = cs[2 * (s + i) + 1];
        const dx = cs[2 * (s + j)] - ax, dz = cs[2 * (s + j) + 1] - az;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) { p.wall[s + i] = WALL_HIDDEN; continue; }
        const nx = -dz / len, nz = dx / len;       // normale sortante
        const samples = len < 1.2 ? 1 : 3;
        let hits = 0, hidden = 0;
        for (let q = 0; q < samples; q++) {
          const t = PROBE_T[q];
          const px = ax + dx * t, pz = az + dz * t;
          const nb = neighborAt(p, px + nx * PARTY_PROBE, pz + nz * PARTY_PROBE, k);
          if (nb < 0) continue;
          hits++;
          if (p.baseY[nb] + p.wallH[nb] >= myTop - 0.25 && insideBuilding(p, nb, px + nx * HIDDEN_PROBE, pz + nz * HIDDEN_PROBE)) hidden++;
        }
        if (hits * 2 > samples || (samples === 1 && hits === 1)) {
          p.wall[s + i] = hidden === samples ? WALL_HIDDEN : WALL_PARTY;
        } else {
          p.wall[s + i] = WALL_FREE;
        }
      }
    }
  }
}
