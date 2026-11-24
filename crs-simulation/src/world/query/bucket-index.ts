/* =====================================================================================
 * Index spatial d'un lot d'obstacles : rangement des segments et des polygones dans la grille
 * à cellules de 16 m (index compacts, en deux passes : comptage puis remplissage), et bandes
 * d'accélération des grands polygones. Exécuté au chargement d'une tuile.
 * ===================================================================================== */

import { segmentIntersectsRect } from '../mapdata';
import type { Bounds } from '../mapdata';
import { CAP_STRIDE, COLLISION_CELL, POLY_FULL_CELL, SEG_STRIDE } from './collision';
import type { CollisionBucket, PolyBands } from './collision';

/** À partir de ce nombre de sommets, un polygone reçoit des bandes d'accélération (PolyBands). */
const BAND_MIN_POINTS = 40;
/** Au-delà de ce nombre de cellules, un polygone est indexé cellule par cellule (pleine / bord). */
const CLASSIFY_CELLS = 6;

const scratchRect: Bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };

/** Polygone plein en cours de construction. */
export interface PolyDraft {
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


/** Le point est-il dans le polygone (règle de parité sur tous ses anneaux) ? */
export function insideRings(rings: readonly ArrayLike<number>[], x: number, z: number): boolean {
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


/** Range les côtés d'un polygone par bandes de 16 m, en lignes et en colonnes (voir PolyBands). */
function buildBands(rings: readonly ArrayLike<number>[], gx0: number, gz0: number, minX: number, minZ: number, maxX: number, maxZ: number): PolyBands {
  const i0 = Math.floor((minX - gx0) / COLLISION_CELL), j0 = Math.floor((minZ - gz0) / COLLISION_CELL);
  const colCount = Math.floor((maxX - gx0) / COLLISION_CELL) - i0 + 1, rowCount = Math.floor((maxZ - gz0) / COLLISION_CELL) - j0 + 1;
  const colStart = new Uint32Array(colCount + 1), rowStart = new Uint32Array(rowCount + 1);
  let colXZ = new Float32Array(0), rowXZ = new Float32Array(0);
  for (let pass = 0; pass < 2; pass++) {
    for (const ring of rings) {
      const n = ring.length >> 1;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ax = ring[2 * b], az = ring[2 * b + 1], bx = ring[2 * a], bz = ring[2 * a + 1];
        const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - gx0) / COLLISION_CELL) - i0), c1 = Math.min(colCount - 1, Math.floor((Math.max(ax, bx) - gx0) / COLLISION_CELL) - i0);
        const r0 = Math.max(0, Math.floor((Math.min(az, bz) - gz0) / COLLISION_CELL) - j0), r1 = Math.min(rowCount - 1, Math.floor((Math.max(az, bz) - gz0) / COLLISION_CELL) - j0);
        for (let c = c0; c <= c1; c++) {
          if (pass === 0) colStart[c + 1]++;
          else {
            const k = 4 * colStart[c]++;
            colXZ[k] = ax; colXZ[k + 1] = az; colXZ[k + 2] = bx; colXZ[k + 3] = bz;
          }
        }
        for (let r = r0; r <= r1; r++) {
          if (pass === 0) rowStart[r + 1]++;
          else {
            const k = 4 * rowStart[r]++;
            rowXZ[k] = ax; rowXZ[k + 1] = az; rowXZ[k + 2] = bx; rowXZ[k + 3] = bz;
          }
        }
      }
    }
    if (pass === 0) {
      for (let c = 0; c < colCount; c++) colStart[c + 1] += colStart[c];
      for (let r = 0; r < rowCount; r++) rowStart[r + 1] += rowStart[r];
      colXZ = new Float32Array(colStart[colCount] * 4);
      rowXZ = new Float32Array(rowStart[rowCount] * 4);
    } else {
      // Le remplissage a avancé les débuts d'une bande : on les remet en place.
      for (let c = colCount; c > 0; c--) colStart[c] = colStart[c - 1];
      colStart[0] = 0;
      for (let r = rowCount; r > 0; r--) rowStart[r] = rowStart[r - 1];
      rowStart[0] = 0;
    }
  }
  return { i0, j0, colCount, rowCount, colStart, colXZ, rowStart, rowXZ };
}


/** Index des segments : seules les cellules réellement touchées (épaisseur comprise). */
export function indexSegments(out: CollisionBucket, segs: readonly number[], heights: readonly number[], flags: readonly number[]): void {
  const segCount = flags.length;
  out.segCount = segCount;
  out.seg = Float32Array.from(segs);
  out.segHeight = Float32Array.from(heights);
  out.segFlags = Uint8Array.from(flags);
  const cells = out.nx * out.nz;
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

/** Polygones : anneaux recopiés dans un tampon commun, capsules, index par cellule. */
export function indexPolygons(out: CollisionBucket, polys: readonly PolyDraft[]): void {
  const cells = out.nx * out.nz;
  const polyCount = polys.length;
  out.polyCount = polyCount;
  out.polyBox = new Float32Array(polyCount * 4);
  out.polyKind = new Uint8Array(polyCount);
  out.polyHeight = new Float32Array(polyCount);
  out.polyRing0 = new Uint32Array(polyCount + 1);
  out.polyCap0 = new Uint32Array(polyCount + 1);
  let ringTotal = 0, pointTotal = 0, capTotal = 0;
  for (const p of polys) {
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
    const p = polys[q];
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

  // Bandes des grands polygones (elles servent dès la classification des cellules, ci-dessous).
  out.polyBands = new Array<PolyBands | null>(polyCount).fill(null);
  for (let q = 0; q < polyCount; q++) {
    const p = polys[q];
    let points = 0;
    for (const ring of p.rings) points += ring.length >> 1;
    if (points >= BAND_MIN_POINTS) out.polyBands[q] = buildBands(p.rings, out.gx0, out.gz0, p.minX, p.minZ, p.maxX, p.maxZ);
  }

  // Marques de cellules de bord pour les grands polygones (réutilisées d'un polygone à l'autre).
  const edgeMark = new Uint32Array(cells);
  let markNow = 0;
  const counts = new Uint32Array(cells + 1);
  const fill = (pass: number): void => {
    for (let q = 0; q < polyCount; q++) {
      const p = polys[q];
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
            if (!out.insidePolygon(q, out.gx0 + (i + 0.5) * COLLISION_CELL, out.gz0 + (j + 0.5) * COLLISION_CELL)) continue;
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
