/* =====================================================================================
 * VILLE EN 3D — index spatial des arêtes du graphe routier (logique pure).
 * Les tuiles n'annoncent que les arêtes dont l'emprise les touche ; le rendu a besoin d'une marge
 * (pavés reportés à 4 m, ponts à cheval sur deux tuiles). Cellules de 128 m.
 * ===================================================================================== */

import type { RoadGraph } from '../mapdata';

const CELL = 128;

export class EdgeIndex {
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly start: Uint32Array;
  private readonly items: Uint32Array;
  private readonly stamp: Uint32Array;
  private now = 0;

  constructor(graph: RoadGraph) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const ne = graph.edges.length;
    const boxes = new Float32Array(ne * 4);
    for (let e = 0; e < ne; e++) {
      const ed = graph.edges[e];
      const pts = ed.points;
      let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
      for (let i = 0; i + 1 < pts.length; i += 2) {
        if (pts[i] < ax) ax = pts[i];
        if (pts[i] > bx) bx = pts[i];
        if (pts[i + 1] < az) az = pts[i + 1];
        if (pts[i + 1] > bz) bz = pts[i + 1];
      }
      const m = ed.width / 2 + ed.sidewalk;
      boxes[4 * e] = ax - m;
      boxes[4 * e + 1] = az - m;
      boxes[4 * e + 2] = bx + m;
      boxes[4 * e + 3] = bz + m;
      if (ax - m < minX) minX = ax - m;
      if (az - m < minZ) minZ = az - m;
      if (bx + m > maxX) maxX = bx + m;
      if (bz + m > maxZ) maxZ = bz + m;
    }
    if (ne === 0) minX = minZ = maxX = maxZ = 0;
    this.x0 = Math.floor(minX / CELL) * CELL;
    this.z0 = Math.floor(minZ / CELL) * CELL;
    this.nx = Math.max(1, Math.floor((maxX - this.x0) / CELL) + 1);
    this.nz = Math.max(1, Math.floor((maxZ - this.z0) / CELL) + 1);
    const counts = new Uint32Array(this.nx * this.nz + 1);
    let items = new Uint32Array(0);
    let start = counts;
    for (let pass = 0; pass < 2; pass++) {
      for (let e = 0; e < ne; e++) {
        const i0 = Math.floor((boxes[4 * e] - this.x0) / CELL), i1 = Math.floor((boxes[4 * e + 2] - this.x0) / CELL);
        const j0 = Math.floor((boxes[4 * e + 1] - this.z0) / CELL), j1 = Math.floor((boxes[4 * e + 3] - this.z0) / CELL);
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const c = j * this.nx + i;
            if (pass === 0) counts[c + 1]++;
            else items[counts[c]++] = e;
          }
        }
      }
      if (pass === 0) {
        for (let c = 0; c < this.nx * this.nz; c++) counts[c + 1] += counts[c];
        start = counts.slice();
        items = new Uint32Array(counts[this.nx * this.nz]);
      }
    }
    this.start = start;
    this.items = items;
    this.stamp = new Uint32Array(ne);
  }

  /** Arêtes dont la boîte touche le rectangle, par indices croissants, sans doublon. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[] = []): number[] {
    out.length = 0;
    const i0 = Math.max(0, Math.floor((minX - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((maxX - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((maxZ - this.z0) / CELL));
    const stamp = ++this.now;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * this.nx + i;
        for (let p = this.start[c], end = this.start[c + 1]; p < end; p++) {
          const e = this.items[p];
          if (this.stamp[e] === stamp) continue;
          this.stamp[e] = stamp;
          out.push(e);
        }
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }
}
