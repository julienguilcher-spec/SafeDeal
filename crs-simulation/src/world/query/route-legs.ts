/* =====================================================================================
 * Itinéraires : tronçons d'accès dégagés.
 *
 * L'itinéraire du graphe des rues commence par un tronçon tout droit du point de départ jusqu'à la voie la plus proche,
 * et finit de même de la voie jusqu'au point d'arrivée. Hors des rues (au milieu d'une grande place, dans une cour), ce
 * tronçon peut couper une grille, un mur ou le socle d'un monument : à pied, on marchait droit dans l'Arc de triomphe
 * ou le socle de la statue de la République. Un tronçon d'accès barré est remplacé par un contournement trouvé sur une
 * grille locale (cases libres pour la largeur du mobile), lissé en lignes droites. Arrivée dans un obstacle (centre d'un
 * monument) : on s'arrête au plus près, sur un sol libre. (Branché sur les itinéraires à pied : world.ts, findPath.)
 * ===================================================================================== */

import type { CollisionWorld } from './collision';

/** Marge autour du tronçon pour chercher le contournement (m). */
const MARGIN = 36;
/** Nombre de cases au plus de la grille locale. */
const MAX_CELLS = 40000;
/** Cases examinées au plus (garde-fou). */
const MAX_EXPAND = 30000;
/** Recherche abandonnée quand elle ne s'approche plus de l'arrivée depuis tant de cases (arrivée dans un bâtiment). */
const MAX_STALL = 1500;

const DIRS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];

export class AccessLegs {
  private g = new Float32Array(0);
  private from = new Int32Array(0);
  private state = new Uint8Array(0);
  private heap: number[] = [];
  private readonly cells: number[] = [];
  private readonly pts: number[] = [];

  constructor(private readonly col: CollisionWorld) {}

  /**
   * Revoit le premier et le dernier tronçon de l'itinéraire `out` (polyligne x, z…) pour un véhicule ou un piéton :
   * contournement s'il traverse un obstacle. Le point de départ ne change jamais.
   */
  fix(out: number[], vehicle: boolean): void {
    if (out.length < 4) return;
    const half = vehicle ? 1.3 : 0.3;
    const cell = vehicle ? 2 : 1.5;
    // dernier tronçon d'abord (il mène au point d'arrivée) : les indices du premier ne bougent pas
    let n = out.length >> 1;
    const i = n - 2;
    if (this.blockedLeg(out[i * 2]!, out[i * 2 + 1]!, out[i * 2 + 2]!, out[i * 2 + 3]!, half)) this.splice(out, i, half, cell, false);
    // premier tronçon : du départ au point d'accroche sur la rue
    n = out.length >> 1;
    if (n >= 3 && this.blockedLeg(out[0]!, out[1]!, out[2]!, out[3]!, half)) this.splice(out, 0, half, cell, true);
  }

  /** Le tronçon est-il barré pour un mobile de demi-largeur `half` ? (bords ignorés aux deux bouts : on s'y gare près d'un mur) */
  blockedLeg(ax: number, az: number, bx: number, bz: number, half: number): boolean {
    const col = this.col;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.05) return false;
    if (col.blocked(ax, az, bx, bz)) return true;
    if (len < 4) return false;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz * half;
    const nz = ux * half;
    const sx = ax + ux * 1.5;
    const sz = az + uz * 1.5;
    const ex = bx - ux * 1.5;
    const ez = bz - uz * 1.5;
    return col.blocked(sx + nx, sz + nz, ex + nx, ez + nz) || col.blocked(sx - nx, sz - nz, ex - nx, ez - nz);
  }

  /**
   * Remplace le tronçon i → i + 1 par un contournement. `endFixed` : l'extrémité i + 1 est un point de la rue (on doit
   * l'atteindre) ; sinon c'est le point d'arrivée, remplacé au besoin par le sol libre le plus proche.
   */
  private splice(out: number[], i: number, half: number, cell0: number, endFixed: boolean): void {
    const ax = out[i * 2]!;
    const az = out[i * 2 + 1]!;
    const bx = out[i * 2 + 2]!;
    const bz = out[i * 2 + 3]!;
    const minX0 = Math.min(ax, bx) - MARGIN;
    const minZ0 = Math.min(az, bz) - MARGIN;
    const w0 = Math.abs(bx - ax) + 2 * MARGIN;
    const h0 = Math.abs(bz - az) + 2 * MARGIN;
    let cell = cell0;
    while ((w0 / cell) * (h0 / cell) > MAX_CELLS) cell *= 1.5;
    const nx = Math.ceil(w0 / cell) + 1;
    const nz = Math.ceil(h0 / cell) + 1;
    const total = nx * nz;
    if (this.g.length < total) {
      this.g = new Float32Array(total);
      this.from = new Int32Array(total);
      this.state = new Uint8Array(total);
    }
    const g = this.g;
    const from = this.from;
    const st = this.state; // 0 inconnue, 1 libre ouverte, 2 fermée, 3 occupée
    st.fill(0, 0, total);
    const col = this.col;
    const cx = (k: number): number => minX0 + (k % nx) * cell;
    const cz = (k: number): number => minZ0 + Math.floor(k / nx) * cell;
    const si = Math.round((ax - minX0) / cell);
    const sj = Math.round((az - minZ0) / cell);
    const start = sj * nx + si;
    const heap = this.heap;
    heap.length = 0;
    const h = (k: number): number => Math.hypot(cx(k) - bx, cz(k) - bz);
    g[start] = 0;
    from[start] = -1;
    st[start] = 1;
    heap.push(start);
    let goal = -1;
    let closest = -1;
    let closestD = Infinity;
    let expanded = 0;
    let improved = 0;
    while (heap.length > 0 && expanded < MAX_EXPAND && expanded - improved < MAX_STALL) {
      // tas binaire minimal sur f = g + h
      const k = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        this.down(0, h);
      }
      if (st[k] === 2) continue;
      st[k] = 2;
      expanded++;
      const x = cx(k);
      const z = cz(k);
      const d = Math.hypot(x - bx, z - bz);
      // (le sol libre le plus proche de l'arrivée, d'où on la voit… ou pas : pour une arrivée dans un obstacle)
      if (d < closestD) {
        closestD = d;
        closest = k;
        improved = expanded;
      }
      if (d < cell * 2.5 && !this.blockedLeg(x, z, bx, bz, half)) {
        goal = k;
        break;
      }
      const ki = k % nx;
      const kj = (k - ki) / nx;
      for (let q = 0; q < 16; q += 2) {
        const ii = ki + DIRS[q]!;
        const jj = kj + DIRS[q + 1]!;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const m = jj * nx + ii;
        if (st[m] === 2 || st[m] === 3) continue;
        const mx = minX0 + ii * cell;
        const mz = minZ0 + jj * cell;
        if (st[m] === 0 && !col.isFree(mx, mz, half)) {
          st[m] = 3;
          continue;
        }
        if (col.blocked(x, z, mx, mz)) continue;
        const cost = g[k]! + (q >= 8 ? cell * Math.SQRT2 : cell);
        if (st[m] === 1 && cost >= g[m]!) continue;
        g[m] = cost;
        from[m] = k;
        st[m] = 1;
        heap.push(m);
        this.up(heap.length - 1, h);
      }
    }
    let endX = bx;
    let endZ = bz;
    if (goal < 0) {
      // arrivée hors d'atteinte : si le point d'arrivée est DANS un obstacle (centre d'un monument), on s'arrête au plus
      // près sur un sol libre ; sinon (point de la rue, ou arrivée libre mais enclavée : un meneur que l'on suit, garé
      // contre une grille) on garde le tronçon tel quel — l'appelant compte sur un itinéraire qui finit à son but
      if (endFixed || closest < 0 || closest === start || this.col.isFree(bx, bz, 0.2)) return;
      goal = closest;
      endX = cx(goal);
      endZ = cz(goal);
    }
    // cases du contournement, du départ à l'arrivée
    const cells = this.cells;
    cells.length = 0;
    for (let k = goal; k >= 0; k = from[k]!) cells.push(k);
    cells.reverse();
    // lissage : du point courant, on file droit vers la case la plus lointaine que l'on atteint sans obstacle
    const pts = this.pts;
    pts.length = 0;
    let px = ax;
    let pz = az;
    let at = -1;
    while (this.blockedLeg(px, pz, endX, endZ, half)) {
      let pick = -1;
      for (let m = cells.length - 1; m > at; m--) {
        if (!this.blockedLeg(px, pz, cx(cells[m]!), cz(cells[m]!), half)) {
          pick = m;
          break;
        }
      }
      // (cases voisines : reliées par construction)
      if (pick < 0) pick = at + 1;
      if (pick >= cells.length) break;
      px = cx(cells[pick]!);
      pz = cz(cells[pick]!);
      pts.push(px, pz);
      at = pick;
    }
    if (endX !== bx || endZ !== bz) out.splice(i * 2 + 2, 2, ...pts, endX, endZ);
    else if (pts.length > 0) out.splice(i * 2 + 2, 0, ...pts);
  }

  private up(i: number, h: (k: number) => number): void {
    const heap = this.heap;
    const g = this.g;
    const k = heap[i]!;
    const f = g[k]! + h(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      const kp = heap[p]!;
      if (g[kp]! + h(kp) <= f) break;
      heap[i] = kp;
      i = p;
    }
    heap[i] = k;
  }

  private down(i: number, h: (k: number) => number): void {
    const heap = this.heap;
    const g = this.g;
    const n = heap.length;
    const k = heap[i]!;
    const f = g[k]! + h(k);
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      let fc = g[heap[c]!]! + h(heap[c]!);
      if (c + 1 < n) {
        const f2 = g[heap[c + 1]!]! + h(heap[c + 1]!);
        if (f2 < fc) {
          c++;
          fc = f2;
        }
      }
      if (fc >= f) break;
      heap[i] = heap[c]!;
      i = c;
    }
    heap[i] = k;
  }
}
