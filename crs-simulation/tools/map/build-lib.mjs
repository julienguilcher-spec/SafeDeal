/* =====================================================================================
 * CARTE DE PARIS — outils communs de la CONSTRUCTION (build*.mjs)
 * -------------------------------------------------------------------------------------
 * Lit les couches normalisées (tools/map/raw/normalized/), fournit la projection, la
 * géométrie plane (simplification, mesures) et les index spatiaux. Le découpage par tuile est
 * dans build-clip.mjs, la règle « aucune enseigne » dans build-names.mjs.
 * Aucune dépendance npm. Le format de sortie vient de src/world/mapdata.ts, importé tel
 * quel (Node 22 efface les types).
 *
 * Conventions : un anneau ou une polyligne est un tableau PLAT [x0, z0, x1, z1, …] en mètres
 * monde (x = est, z = sud). Un anneau n'est pas refermé. « Antihoraire » s'entend vu de
 * dessus, nord en haut : ringSignedArea > 0.
 * ===================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/world/mapdata.ts';

export { M };

export const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Couches normalisées (lots A et B). */
export const NORM = process.env.CRS_MAP_NORM ?? path.join(HERE, 'raw', 'normalized');
/** Dossier de sortie du jeu. */
export const OUT = process.env.CRS_MAP_OUT ?? path.resolve(HERE, '..', '..', 'public', 'data', 'paris');
/** Rapports de construction (ignorés par git). */
export const REPORT_DIR = path.join(HERE, 'raw', 'build');

/** Marge (m) conservée par les lots A et B autour de l'emprise. */
export const SOURCE_MARGIN = 60;
export const BOUNDS = M.boundsOfBbox(M.PARIS_BBOX);
/** Les 98 tuiles qui recouvrent l'emprise. */
export const TILES = M.tilesCoveringBounds(BOUNDS);
const TILE_SET = new Set(TILES.map((t) => M.tileKey(t.tx, t.tz)));
export const hasTile = (tx, tz) => TILE_SET.has(M.tileKey(tx, tz));
export const T = M.TILE_SIZE;

// ─────────────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────────────

/** Lit une couche GeoJSON normalisée. Lève une erreur claire si elle manque. */
export function readLayer(name) {
  const file = path.join(NORM, `${name}.geojson`);
  if (!fs.existsSync(file)) throw new Error(`couche normalisée absente : ${file} (lancer fetch-a-all.mjs et fetch-b-all.mjs)`);
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(fc.features)) throw new Error(`${file} : FeatureCollection attendue`);
  return fc;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export const px = (lon) => (lon - M.ORIGIN_LON) * M.M_PER_DEG_LON;
export const pz = (lat) => -(lat - M.ORIGIN_LAT) * M.M_PER_DEG_LAT;

/** Anneau GeoJSON [[lon, lat], …] (refermé) -> anneau plat en mètres, non refermé. */
export function projectRing(coords) {
  const out = [];
  let n = coords.length;
  if (n >= 2 && coords[0][0] === coords[n - 1][0] && coords[0][1] === coords[n - 1][1]) n--;
  for (let i = 0; i < n; i++) out.push(px(coords[i][0]), pz(coords[i][1]));
  return out;
}

/** Ligne GeoJSON -> polyligne plate en mètres. */
export function projectLine(coords) {
  const out = [];
  for (let i = 0; i < coords.length; i++) out.push(px(coords[i][0]), pz(coords[i][1]));
  return out;
}

/** Polygones d'une géométrie GeoJSON : [{ outer, holes }] en mètres, bien orientés. */
export function projectPolygons(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const out = [];
  for (const poly of polys) {
    if (poly.length === 0) continue;
    const outer = orient(projectRing(poly[0]), true);
    if (outer.length < 6) continue;
    const holes = [];
    for (let h = 1; h < poly.length; h++) {
      const ring = orient(projectRing(poly[h]), false);
      if (ring.length >= 6) holes.push(ring);
    }
    out.push({ outer, holes });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Géométrie
// ─────────────────────────────────────────────────────────────────────────────────────

export const signedArea = M.ringSignedArea;
export const round1 = (v) => Math.round(v * 10) / 10;
export const round2 = (v) => Math.round(v * 100) / 100;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Impose le sens : antihoraire (ccw = true) ou horaire. */
export function orient(ring, ccw) {
  return signedArea(ring) > 0 === ccw ? ring : M.reverseRing(ring);
}

export function polygonArea(poly) {
  let a = Math.abs(signedArea(poly.outer));
  for (const h of poly.holes) a -= Math.abs(signedArea(h));
  return a;
}

export function bboxOf(points, out = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }) {
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], z = points[i + 1];
    if (x < out.minX) out.minX = x;
    if (x > out.maxX) out.maxX = x;
    if (z < out.minZ) out.minZ = z;
    if (z > out.maxZ) out.maxZ = z;
  }
  return out;
}

/** Barycentre surfacique d'un anneau (repli : moyenne des sommets). */
export function ringCentroid(ring) {
  const n = ring.length >> 1;
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const f = ring[2 * j] * ring[2 * i + 1] - ring[2 * i] * ring[2 * j + 1];
    a += f;
    cx += (ring[2 * j] + ring[2 * i]) * f;
    cz += (ring[2 * j + 1] + ring[2 * i + 1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i++) { sx += ring[2 * i]; sz += ring[2 * i + 1]; }
    return [sx / n, sz / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function polylineLength(points) {
  return M.polylineLength(points);
}

/** Point à l'abscisse curviligne `s` d'une polyligne : [x, z, dx, dz] (tangente unitaire). */
export function pointAlong(points, s) {
  const n = points.length >> 1;
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const ax = points[2 * i - 2], az = points[2 * i - 1], bx = points[2 * i], bz = points[2 * i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > 0 && (acc + l >= s || i === n - 1)) {
      const t = clamp((s - acc) / l, 0, 1);
      return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / l, (bz - az) / l];
    }
    acc += l;
  }
  return [points[0], points[1], 1, 0];
}

/** Distance d'un point à un segment ; écrit le paramètre dans segT. */
export let segT = 0;
export function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  segT = t;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Douglas–Peucker sur les indices `idx` (chaîne ouverte) : marque keep[idx[k]] = 1. */
function dpMark(pts, idx, tol, keep) {
  const stack = [0, idx.length - 1];
  keep[idx[0]] = 1;
  keep[idx[idx.length - 1]] = 1;
  while (stack.length > 0) {
    const last = stack.pop(), first = stack.pop();
    if (last - first < 2) continue;
    const ax = pts[2 * idx[first]], az = pts[2 * idx[first] + 1];
    const bx = pts[2 * idx[last]], bz = pts[2 * idx[last] + 1];
    let worst = -1, worstD = tol;
    for (let k = first + 1; k < last; k++) {
      const d = distToSegment(pts[2 * idx[k]], pts[2 * idx[k] + 1], ax, az, bx, bz);
      if (d > worstD) { worstD = d; worst = k; }
    }
    if (worst >= 0) {
      keep[idx[worst]] = 1;
      stack.push(first, worst, worst, last);
    }
  }
}

/** Simplifie une polyligne (extrémités conservées). */
export function simplifyLine(points, tol) {
  const n = points.length >> 1;
  if (n <= 2) return Array.from(points);
  const keep = new Uint8Array(n);
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  dpMark(points, idx, tol, keep);
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  return out;
}

/**
 * Simplifie un anneau. `must` (facultatif) marque des sommets à conserver absolument : les
 * chaînes entre deux sommets imposés sont simplifiées indépendamment, de sorte que deux
 * anneaux qui partagent une chaîne la simplifient de la même façon.
 */
export function simplifyRing(ring, tol, must) {
  const n = ring.length >> 1;
  if (n <= 3) return Array.from(ring);
  const anchors = [];
  if (must) for (let i = 0; i < n; i++) if (must[i]) anchors.push(i);
  if (anchors.length < 2) {
    // Deux ancres géométriques : le sommet le plus à l'ouest (puis au nord), et le plus éloigné de lui.
    let a = anchors.length === 1 ? anchors[0] : 0;
    if (anchors.length === 0) {
      for (let i = 1; i < n; i++) {
        if (ring[2 * i] < ring[2 * a] || (ring[2 * i] === ring[2 * a] && ring[2 * i + 1] < ring[2 * a + 1])) a = i;
      }
    }
    let b = a, far = -1;
    for (let i = 0; i < n; i++) {
      const d = (ring[2 * i] - ring[2 * a]) ** 2 + (ring[2 * i + 1] - ring[2 * a + 1]) ** 2;
      if (d > far) { far = d; b = i; }
    }
    anchors.length = 0;
    anchors.push(Math.min(a, b), Math.max(a, b));
    if (a === b) return Array.from(ring);
  }
  const keep = new Uint8Array(n);
  for (let k = 0; k < anchors.length; k++) {
    const from = anchors[k], to = anchors[(k + 1) % anchors.length];
    const idx = [from];
    for (let i = (from + 1) % n; i !== to; i = (i + 1) % n) idx.push(i);
    idx.push(to);
    dpMark(ring, idx, tol, keep);
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[2 * i], ring[2 * i + 1]);
  return out;
}

/** Retire les sommets confondus (à `eps` près) d'un anneau. */
export function dedupeRing(ring, eps = 0.01) {
  const out = [];
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = ring[2 * i], z = ring[2 * i + 1];
    const k = out.length;
    if (k >= 2 && Math.abs(out[k - 2] - x) < eps && Math.abs(out[k - 1] - z) < eps) continue;
    out.push(x, z);
  }
  while (out.length >= 4 && Math.abs(out[0] - out[out.length - 2]) < eps && Math.abs(out[1] - out[out.length - 1]) < eps) out.length -= 2;
  return out;
}

/** Rectangle englobant d'aire minimale : { cx, cz, ux, uz (grand axe unitaire), length, width }. */
export function orientedBox(ring) {
  const n = ring.length >> 1;
  let best = null;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    let ux = ring[2 * i] - ring[2 * j], uz = ring[2 * i + 1] - ring[2 * j + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    ux /= l; uz /= l;
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = ring[2 * k] * ux + ring[2 * k + 1] * uz;
      const b = -ring[2 * k] * uz + ring[2 * k + 1] * ux;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
      if (b < lo2) lo2 = b;
      if (b > hi2) hi2 = b;
    }
    const area = (hi - lo) * (hi2 - lo2);
    if (best === null || area < best.area) {
      const ca = (lo + hi) / 2, cb = (lo2 + hi2) / 2;
      const along = hi - lo >= hi2 - lo2;
      best = {
        area,
        cx: ca * ux - cb * uz,
        cz: ca * uz + cb * ux,
        ux: along ? ux : -uz,
        uz: along ? uz : ux,
        length: Math.max(hi - lo, hi2 - lo2),
        width: Math.min(hi - lo, hi2 - lo2),
      };
    }
  }
  if (best === null) {
    const b = bboxOf(ring);
    return { area: 0, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, ux: 1, uz: 0, length: b.maxX - b.minX, width: b.maxZ - b.minZ };
  }
  return best;
}

export function pointInPoly(poly, x, z) {
  return M.pointInPolygon(poly.outer, poly.holes, x, z);
}

/** Hachage FNV-1a 32 bits d'une chaîne. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Nombre pseudo-aléatoire stable dans [0, 1[ à partir d'un entier. */
export function hash01(n) {
  let h = Math.imul(n | 0, 0x9e3779b1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function median(values) {
  if (values.length === 0) return NaN;
  const s = Array.from(values).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Nom normalisé pour comparer des libellés (sans accents, minuscules, alphanumérique). */
export function normName(s) {
  return String(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Index spatiaux
// ─────────────────────────────────────────────────────────────────────────────────────

const KEY_OFF = 8192;
const cellKey = (cx, cz) => (cx + KEY_OFF) * 16384 + (cz + KEY_OFF);

/** Index de segments en grille régulière : plus proche segment, lancer de rayon. */
export class SegGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.cells = new Map();
    this.ax = []; this.az = []; this.bx = []; this.bz = [];
    /** Étiquette libre par segment (ex. indice du bâtiment). */
    this.tag = [];
    /** Seconde étiquette libre (ex. indice du côté dans l'anneau). */
    this.tag2 = [];
    this.stamp = [];
    this.tick = 0;
  }

  add(ax, az, bx, bz, tag = 0, tag2 = 0) {
    const i = this.ax.length;
    this.ax.push(ax); this.az.push(az); this.bx.push(bx); this.bz.push(bz);
    this.tag.push(tag); this.tag2.push(tag2); this.stamp.push(0);
    const c = this.cell;
    const x0 = Math.floor(Math.min(ax, bx) / c), x1 = Math.floor(Math.max(ax, bx) / c);
    const z0 = Math.floor(Math.min(az, bz) / c), z1 = Math.floor(Math.max(az, bz) / c);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = cellKey(cx, cz);
        const list = this.cells.get(k);
        if (list === undefined) this.cells.set(k, [i]);
        else list.push(i);
      }
    }
    return i;
  }

  /** Ajoute tous les côtés d'un anneau ; tag2 = indice du premier sommet du côté. */
  addRing(ring, tag) {
    const n = ring.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.add(ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1], tag, i);
    }
  }

  /** Appelle fn(i) une fois pour chaque segment dont une cellule touche le rectangle. */
  forEachInRect(minX, minZ, maxX, maxZ, fn) {
    const c = this.cell;
    const tick = ++this.tick;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (list === undefined) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this.stamp[i] === tick) continue;
          this.stamp[i] = tick;
          fn(i);
        }
      }
    }
  }

  /** Segment le plus proche à moins de maxDist : { i, d, t } ou null. `accept(i)` filtre. */
  nearest(x, z, maxDist, accept) {
    let best = -1, bestD = maxDist, bestT = 0;
    this.forEachInRect(x - maxDist, z - maxDist, x + maxDist, z + maxDist, (i) => {
      if (accept !== undefined && !accept(i)) return;
      const d = distToSegment(x, z, this.ax[i], this.az[i], this.bx[i], this.bz[i]);
      if (d < bestD) { bestD = d; best = i; bestT = segT; }
    });
    return best < 0 ? null : { i: best, d: bestD, t: bestT };
  }

  /** Distance du premier segment touché par le rayon (ox, oz) + s·(dx, dz), 0 < s ≤ maxDist ; Infinity sinon. */
  raycast(ox, oz, dx, dz, maxDist, accept) {
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    let best = Infinity;
    this.hit = -1;
    this.forEachInRect(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (i) => {
      if (accept !== undefined && !accept(i)) return;
      const sx = this.bx[i] - this.ax[i], sz = this.bz[i] - this.az[i];
      const den = dx * sz - dz * sx;
      if (Math.abs(den) < 1e-12) return;
      const qx = this.ax[i] - ox, qz = this.az[i] - oz;
      const s = (qx * sz - qz * sx) / den;
      const u = (qx * dz - qz * dx) / den;
      if (s > 1e-6 && s <= maxDist && u >= 0 && u <= 1 && s < best) { best = s; this.hit = i; }
    });
    return best;
  }
}

/** Index de points ou de boîtes en grille : requêtes par rectangle. */
export class BoxGrid {
  constructor(cell = 64) {
    this.cell = cell;
    this.cells = new Map();
    this.stamp = [];
    this.tick = 0;
    this.count = 0;
  }

  add(minX, minZ, maxX, maxZ) {
    const id = this.count++;
    this.stamp.push(0);
    const c = this.cell;
    for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
      for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
        const k = cellKey(cx, cz);
        const list = this.cells.get(k);
        if (list === undefined) this.cells.set(k, [id]);
        else list.push(id);
      }
    }
    return id;
  }

  forEachInRect(minX, minZ, maxX, maxZ, fn) {
    const c = this.cell;
    const tick = ++this.tick;
    for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
      for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (list === undefined) continue;
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if (this.stamp[id] === tick) continue;
          this.stamp[id] = tick;
          fn(id);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Tuiles en construction
// ─────────────────────────────────────────────────────────────────────────────────────

/** Crée les 98 tuiles vides ; retourne { list, get(tx, tz), at(x, z) }. */
export function createTiles() {
  const map = new Map();
  const list = [];
  for (const t of TILES) {
    const tile = M.createEmptyTile(t.tx, t.tz);
    // Arbres : liste d'objets pendant la construction, convertie en colonnes à la fin.
    tile.treeList = [];
    map.set(M.tileKey(t.tx, t.tz), tile);
    list.push(tile);
  }
  return {
    list,
    get: (tx, tz) => map.get(M.tileKey(tx, tz)),
    at: (x, z) => map.get(M.tileKey(Math.floor(x / T), Math.floor(z / T))),
  };
}

export function log(...args) {
  console.log(...args);
}
