/* =====================================================================================
 * DANGERS DIFFUS — cache du bâti et ouverture des rues.
 *
 * Pour chaque bloc de 16 × 16 cellules, deux niveaux d'information, calculés une fois puis gardés
 * en cache tant que les tuiles du monde ne changent pas :
 *
 *   niveau 1  masque des cellules bâties (ctx.world.buildingHeightAt > 0 au centre de la cellule) :
 *             infranchissables pour le gaz et la fumée. Calculé dès l'allocation du bloc.
 *
 *   niveau 2  « ouverture » de chaque cellule libre, calculée en différé (file d'attente, budget par
 *             pas) à partir des masques du bloc et de ses 8 voisins. Depuis la cellule, on mesure la
 *             longueur libre le long de 8 axes (tous les 22,5°), dans les deux sens, jusqu'à 32 m :
 *               - l'axe le plus dégagé donne la direction de la rue ;
 *               - la longueur libre en travers (axe perpendiculaire) donne la largeur de la rue.
 *             Le vent d'enfilade passe ; le vent de travers est arrêté par les façades quand la rue
 *             est étroite (abri complet sous 12 m, nul à partir de 56 m). C'est ce qui canalise les
 *             nuages le long des rues et les fait stagner dans une rue étroite battue de travers.
 *
 * Un bloc sans aucun bâti à moins de 32 m n'a aucun tableau : il est « ouvert » (plein vent).
 * ===================================================================================== */

import type { WorldQuery } from '@/core/contracts';
import { smoothstep } from '@/core/math';
import { BLOCK_AREA, BLOCK_CELLS, BLOCK_RANGE, BLOCK_SIZE, CELL, STATIC_CACHE_MAX } from './config';
import type { HazardTuning } from './config';

/** Nombre d'axes d'analyse (un tous les 22,5°) et de directions (deux sens par axe). */
export const AXES = 8;
const DIRS = AXES * 2;
/** Portée de l'analyse (cellules) : 16 cellules = 32 m, soit exactement un bloc voisin. */
const REACH = BLOCK_CELLS;
/** Côté du masque de travail : le bloc et ses 8 voisins. */
const PAD = BLOCK_CELLS * 3;

/** Composantes (x, z) du vecteur unitaire de chaque axe : angle k × 22,5°. */
export const AXIS_X = new Float64Array(AXES);
export const AXIS_Z = new Float64Array(AXES);
/** Décalage linéaire (dans le masque de travail) du pas s de la direction d. */
const RAY = new Int16Array(DIRS * REACH);
for (let d = 0; d < DIRS; d++) {
  const a = (d * Math.PI) / AXES;
  const cx = Math.cos(a);
  const cz = Math.sin(a);
  if (d < AXES) {
    AXIS_X[d] = cx;
    AXIS_Z[d] = cz;
  }
  for (let s = 1; s <= REACH; s++) RAY[d * REACH + s - 1] = Math.round(s * cz) * PAD + Math.round(s * cx);
}

/** Clé entière d'un bloc (30 bits) ; −1 hors des indices admis. */
export function blockKey(bx: number, bz: number): number {
  if (bx < -BLOCK_RANGE || bx >= BLOCK_RANGE || bz < -BLOCK_RANGE || bz >= BLOCK_RANGE) return -1;
  return ((bx + BLOCK_RANGE) << 15) | (bz + BLOCK_RANGE);
}

export class StaticBlock {
  bx = 0;
  bz = 0;
  key = 0;
  /** 1 = cellule bâtie. null = aucune cellule bâtie dans le bloc. */
  solid: Uint8Array | null = null;
  /** 1 = masque seul ; 2 = ouverture calculée. */
  level: 1 | 2 = 1;
  /** Indice de l'axe de la rue par cellule (niveau 2 ; null si le bloc est ouvert ou pas encore analysé). */
  axis: Uint8Array | null = null;
  /** Part du vent d'enfilade (0..255) et du vent de travers (0..255) conservée par cellule. */
  along: Uint8Array | null = null;
  across: Uint8Array | null = null;
  /** Nombre de blocs du champ qui utilisent cette entrée (0 = évinçable). */
  refs = 0;
  queued = false;
  /** Entrée retirée du cache (tuile rechargée) : ses utilisateurs doivent la redemander. */
  stale = false;

  /** Plein vent partout : ni bâti, ni abri (ou analyse pas encore faite). */
  get uniform(): boolean {
    return this.solid === null && this.axis === null;
  }
}

export class StaticCache {
  private readonly map = new Map<number, StaticBlock>();
  private readonly queue: StaticBlock[] = [];
  private queueHead = 0;
  /** Masque de travail 48 × 48 (bloc + voisins) et longueurs libres par direction. */
  private readonly mask = new Uint8Array(PAD * PAD);
  private readonly free = new Uint8Array(DIRS);
  private readonly span = new Float64Array(AXES);

  constructor(
    private readonly world: () => WorldQuery,
    private readonly tuning: HazardTuning,
  ) {}

  get size(): number {
    return this.map.size;
  }

  /** Entrée de niveau 1 au moins (créée au besoin), sans la retenir. null hors des indices admis. */
  peek(bx: number, bz: number): StaticBlock | null {
    const key = blockKey(bx, bz);
    if (key < 0) return null;
    const found = this.map.get(key);
    if (found !== undefined) return found;
    return this.sample(bx, bz, key);
  }

  /** Entrée retenue par un bloc du champ ; son analyse d'ouverture est mise en file d'attente. */
  acquire(bx: number, bz: number): StaticBlock | null {
    const st = this.peek(bx, bz);
    if (st === null) return null;
    st.refs++;
    if (st.level === 1 && !st.queued) {
      st.queued = true;
      this.queue.push(st);
    }
    return st;
  }

  release(st: StaticBlock): void {
    if (st.refs > 0) st.refs--;
  }

  /**
   * Analyse d'ouverture d'au plus `budget` blocs en attente. `done` est appelé pour chaque bloc
   * analysé (ses coefficients de transport doivent être recalculés). Retourne le nombre traité.
   */
  runJobs(budget: number, done: (st: StaticBlock) => void): number {
    let n = 0;
    const q = this.queue;
    while (n < budget && this.queueHead < q.length) {
      const st = q[this.queueHead++]!;
      st.queued = false;
      if (st.stale || st.level === 2 || st.refs === 0) continue;
      this.analyse(st);
      done(st);
      n++;
    }
    if (this.queueHead >= q.length) {
      q.length = 0;
      this.queueHead = 0;
    }
    return n;
  }

  /** Nombre d'analyses en attente. */
  get pending(): number {
    return this.queue.length - this.queueHead;
  }

  /**
   * Oublie le bâti des blocs touchant le rectangle (tuile chargée ou déchargée), marge d'un bloc
   * comprise puisque l'ouverture d'un bloc dépend de ses voisins. Les entrées retirées sont marquées
   * `stale` : le champ redemande alors celles qu'il utilise.
   */
  invalidateRect(minX: number, minZ: number, maxX: number, maxZ: number): number {
    const b0 = Math.floor(minX / BLOCK_SIZE) - 1;
    const b1 = Math.floor(maxX / BLOCK_SIZE) + 1;
    const c0 = Math.floor(minZ / BLOCK_SIZE) - 1;
    const c1 = Math.floor(maxZ / BLOCK_SIZE) + 1;
    let n = 0;
    for (const st of this.map.values()) {
      if (st.bx < b0 || st.bx > b1 || st.bz < c0 || st.bz > c1) continue;
      st.stale = true;
      this.map.delete(st.key);
      n++;
    }
    return n;
  }

  clear(): void {
    for (const st of this.map.values()) st.stale = true;
    this.map.clear();
    this.queue.length = 0;
    this.queueHead = 0;
  }

  // ───────────────────────────── niveau 1 : masque du bâti ─────────────────────────────

  private sample(bx: number, bz: number, key: number): StaticBlock {
    if (this.map.size >= STATIC_CACHE_MAX) this.evict();
    const st = new StaticBlock();
    st.bx = bx;
    st.bz = bz;
    st.key = key;
    const world = this.world();
    const ox = bx * BLOCK_SIZE + CELL * 0.5;
    const oz = bz * BLOCK_SIZE + CELL * 0.5;
    let solid: Uint8Array | null = null;
    for (let j = 0; j < BLOCK_CELLS; j++) {
      const z = oz + j * CELL;
      for (let i = 0; i < BLOCK_CELLS; i++) {
        if (world.buildingHeightAt(ox + i * CELL, z) > 0) {
          if (solid === null) solid = new Uint8Array(BLOCK_AREA);
          solid[j * BLOCK_CELLS + i] = 1;
        }
      }
    }
    st.solid = solid;
    this.map.set(key, st);
    return st;
  }

  /** Retire du cache les plus anciennes entrées que personne n'utilise (un quart de la capacité). */
  private evict(): void {
    let toDrop = STATIC_CACHE_MAX >> 2;
    for (const st of this.map.values()) {
      if (st.refs > 0) continue;
      st.stale = true;
      this.map.delete(st.key);
      if (--toDrop <= 0) break;
    }
  }

  // ───────────────────────────── niveau 2 : ouverture ─────────────────────────────

  private analyse(st: StaticBlock): void {
    st.level = 2;
    const mask = this.mask;
    // 1. masque du bloc et de ses 8 voisins
    let any = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nb = dx === 0 && dz === 0 ? st : this.peek(st.bx + dx, st.bz + dz);
        const solid = nb !== null ? nb.solid : null;
        const base = (dz + 1) * BLOCK_CELLS * PAD + (dx + 1) * BLOCK_CELLS;
        if (solid === null) {
          for (let j = 0; j < BLOCK_CELLS; j++) mask.fill(0, base + j * PAD, base + j * PAD + BLOCK_CELLS);
        } else {
          any = true;
          for (let j = 0; j < BLOCK_CELLS; j++) {
            const row = j * BLOCK_CELLS;
            mask.set(solid.subarray(row, row + BLOCK_CELLS), base + j * PAD);
          }
        }
      }
    }
    if (!any) return; // aucun bâti à moins de 32 m : plein vent, aucun tableau

    // 2. longueurs libres et ouverture par cellule
    const axis = new Uint8Array(BLOCK_AREA);
    const along = new Uint8Array(BLOCK_AREA);
    const across = new Uint8Array(BLOCK_AREA);
    const free = this.free;
    const span = this.span;
    const t = this.tuning;
    let sheltered = false;
    for (let j = 0; j < BLOCK_CELLS; j++) {
      for (let i = 0; i < BLOCK_CELLS; i++) {
        const k = j * BLOCK_CELLS + i;
        const origin = (j + BLOCK_CELLS) * PAD + i + BLOCK_CELLS;
        if (mask[origin] !== 0) continue; // cellule bâtie : rien à transporter
        for (let d = 0; d < DIRS; d++) {
          const ray = d * REACH;
          let s = 0;
          while (s < REACH && mask[origin + RAY[ray + s]!] === 0) s++;
          free[d] = s;
        }
        for (let a = 0; a < AXES; a++) span[a] = (free[a]! + free[a + AXES]! + 1) * CELL;
        // axe de la rue : le plus dégagé, en départageant les ex æquo par leurs voisins (milieu de l'éventail)
        let best = 0;
        let bestScore = -1;
        for (let a = 0; a < AXES; a++) {
          const score = span[a]! + 0.25 * (span[(a + AXES - 1) % AXES]! + span[(a + 1) % AXES]!);
          if (score > bestScore + 1e-9) {
            bestScore = score;
            best = a;
          }
        }
        const openAlong = smoothstep(t.openMin, t.openMax, span[best]!);
        const openAcross = smoothstep(t.openMin, t.openMax, span[(best + AXES / 2) % AXES]!);
        // frottement des façades : dans une rue étroite, même le vent d'enfilade est freiné
        const al = Math.round(255 * openAlong * (t.canyonAlong + (1 - t.canyonAlong) * openAcross));
        const ac = Math.round(255 * openAcross);
        axis[k] = best;
        along[k] = al;
        across[k] = ac;
        if (al < 255 || ac < 255) sheltered = true;
      }
    }
    if (!sheltered && st.solid === null) return; // voisinage bâti mais trop loin pour abriter ce bloc
    st.axis = axis;
    st.along = along;
    st.across = across;
  }
}
