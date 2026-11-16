/* =====================================================================================
 * Grille de hachage spatiale générique sur le plan (x, z).
 *
 *   - les éléments sont indexés par leur POSITION (item.x, item.z) au moment de l'insertion
 *     (ou du dernier update/rebuild) ; les tests de distance utilisent la position COURANTE ;
 *   - insert / remove / update / requêtes : aucune allocation en régime établi (les tableaux
 *     internes ne grandissent que lorsque la capacité est dépassée) ;
 *   - rebuild(items) : reconstruction complète en O(n) ;
 *   - une requête couvrant plus de cellules qu'il n'y a d'éléments bascule sur un balayage linéaire.
 * ===================================================================================== */

import { truncate } from './arrays';

export interface SpatialItem {
  x: number;
  z: number;
}

const COLLECT = 0;
const COUNT = 1;
const NEAREST = 2;

function nextPow2(n: number): number {
  let p = 16;
  while (p < n) p <<= 1;
  return p;
}

export class SpatialHash<T extends SpatialItem> {
  readonly cellSize: number;
  private readonly inv: number;
  private mask: number;
  /** Seau → premier emplacement, ou −1. */
  private heads: Int32Array;
  /** Emplacement → emplacement suivant dans le seau (ou dans la liste libre). */
  private next: Int32Array;
  private cellX: Int32Array;
  private cellZ: Int32Array;
  private readonly items: (T | null)[] = [];
  /** Nombre d'emplacements déjà utilisés au moins une fois. */
  private hw = 0;
  /** Tête de la liste des emplacements libres, ou −1. */
  private free = -1;
  private count_ = 0;
  private best: T | null = null;

  /**
   * @param cellSize taille des cellules (m) — de l'ordre du rayon des requêtes les plus fréquentes.
   * @param expectedItems ordre de grandeur du nombre d'éléments (la grille s'agrandit seule au besoin).
   */
  constructor(cellSize = 4, expectedItems = 256) {
    this.cellSize = cellSize > 0 ? cellSize : 4;
    this.inv = 1 / this.cellSize;
    const cap = nextPow2(expectedItems);
    const buckets = nextPow2(expectedItems * 2);
    this.mask = buckets - 1;
    this.heads = new Int32Array(buckets).fill(-1);
    this.next = new Int32Array(cap);
    this.cellX = new Int32Array(cap);
    this.cellZ = new Int32Array(cap);
  }

  /** Nombre d'éléments indexés. */
  get size(): number {
    return this.count_;
  }

  /** Vide la grille. */
  clear(): void {
    const items = this.items;
    for (let s = 0; s < this.hw; s++) items[s] = null;
    this.resetLinks();
  }

  private resetLinks(): void {
    this.heads.fill(-1);
    this.hw = 0;
    this.free = -1;
    this.count_ = 0;
  }

  private hash(cx: number, cz: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask;
  }

  private growSlots(): void {
    const cap = this.next.length * 2;
    const next = new Int32Array(cap);
    next.set(this.next);
    this.next = next;
    const cellX = new Int32Array(cap);
    cellX.set(this.cellX);
    this.cellX = cellX;
    const cellZ = new Int32Array(cap);
    cellZ.set(this.cellZ);
    this.cellZ = cellZ;
  }

  private growBuckets(): void {
    const buckets = (this.mask + 1) * 4;
    this.mask = buckets - 1;
    this.heads = new Int32Array(buckets).fill(-1);
    const items = this.items;
    for (let s = 0; s < this.hw; s++) {
      if (items[s] === null) continue;
      const b = this.hash(this.cellX[s]!, this.cellZ[s]!);
      this.next[s] = this.heads[b]!;
      this.heads[b] = s;
    }
  }

  /** Indexe un élément à sa position courante. Retourne son emplacement (à conserver pour remove/update). */
  insert(item: T): number {
    return this.insertAt(item, item.x, item.z);
  }

  /** Indexe un élément à une position explicite. */
  insertAt(item: T, x: number, z: number): number {
    let s: number;
    if (this.free !== -1) {
      s = this.free;
      this.free = this.next[s]!;
    } else {
      if (this.hw === this.next.length) this.growSlots();
      s = this.hw++;
    }
    const cx = Math.floor(x * this.inv);
    const cz = Math.floor(z * this.inv);
    this.items[s] = item;
    this.cellX[s] = cx;
    this.cellZ[s] = cz;
    const b = this.hash(cx, cz);
    this.next[s] = this.heads[b]!;
    this.heads[b] = s;
    this.count_++;
    if (this.count_ > (this.mask + 1) * 2) this.growBuckets();
    return s;
  }

  private unlink(s: number): void {
    const b = this.hash(this.cellX[s]!, this.cellZ[s]!);
    let cur = this.heads[b]!;
    if (cur === s) {
      this.heads[b] = this.next[s]!;
      return;
    }
    while (cur !== -1) {
      const n = this.next[cur]!;
      if (n === s) {
        this.next[cur] = this.next[s]!;
        return;
      }
      cur = n;
    }
  }

  /** Retire l'élément d'un emplacement (retourné par insert). Sans effet si l'emplacement est libre. */
  remove(slot: number): void {
    if (slot < 0 || slot >= this.hw || this.items[slot] === null) return;
    this.unlink(slot);
    this.items[slot] = null;
    this.next[slot] = this.free;
    this.free = slot;
    this.count_--;
  }

  /** Retire un élément par identité (recherche linéaire). Retourne false s'il n'est pas indexé. */
  removeItem(item: T): boolean {
    const items = this.items;
    for (let s = 0; s < this.hw; s++) {
      if (items[s] === item) {
        this.remove(s);
        return true;
      }
    }
    return false;
  }

  /** Ré-indexe l'élément d'un emplacement après un déplacement (coût nul s'il n'a pas changé de cellule). */
  update(slot: number): void {
    if (slot < 0 || slot >= this.hw) return;
    const it = this.items[slot];
    if (!it) return;
    const cx = Math.floor(it.x * this.inv);
    const cz = Math.floor(it.z * this.inv);
    if (cx === this.cellX[slot] && cz === this.cellZ[slot]) return;
    this.unlink(slot);
    this.cellX[slot] = cx;
    this.cellZ[slot] = cz;
    const b = this.hash(cx, cz);
    this.next[slot] = this.heads[b]!;
    this.heads[b] = slot;
  }

  /** Ré-indexe tous les éléments présents (après des déplacements). */
  updateAll(): void {
    for (let s = 0; s < this.hw; s++) this.update(s);
  }

  /**
   * Reconstruit entièrement l'index à partir d'un tableau. Les emplacements deviennent 0, 1, 2…
   * dans l'ordre des éléments retenus. `skip` permet d'écarter des éléments (endormis…).
   */
  rebuild(items: readonly T[], skip?: (item: T) => boolean): void {
    const previous = this.hw;
    this.resetLinks();
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (skip && skip(it)) continue;
      this.insertAt(it, it.x, it.z);
    }
    const own = this.items;
    for (let s = this.hw; s < previous; s++) own[s] = null;
  }

  /**
   * Éléments dont la position est à moins de `r` (inclus) du point. Écrit dans `out`
   * (dont la longueur devient le nombre trouvé) et retourne ce nombre.
   */
  query(x: number, z: number, r: number, out: T[], filter?: (item: T) => boolean): number {
    const n = this.scan(x, z, r, COLLECT, out, filter);
    truncate(out, n);
    return n;
  }

  /** Nombre d'éléments à moins de `r` du point. */
  count(x: number, z: number, r: number, filter?: (item: T) => boolean): number {
    return this.scan(x, z, r, COUNT, null, filter);
  }

  /** Élément le plus proche du point, à moins de `r` ; null si aucun. */
  nearest(x: number, z: number, r: number, filter?: (item: T) => boolean): T | null {
    this.scan(x, z, r, NEAREST, null, filter);
    const b = this.best;
    this.best = null;
    return b;
  }

  /** Éléments dont la position est dans le rectangle aligné sur les axes (bornes incluses). */
  queryBox(minX: number, minZ: number, maxX: number, maxZ: number, out: T[], filter?: (item: T) => boolean): number {
    let n = 0;
    const items = this.items;
    const minCx = Math.floor(minX * this.inv);
    const maxCx = Math.floor(maxX * this.inv);
    const minCz = Math.floor(minZ * this.inv);
    const maxCz = Math.floor(maxZ * this.inv);
    const cells = (maxCx - minCx + 1) * (maxCz - minCz + 1);
    if (!(cells < this.count_)) {
      for (let s = 0; s < this.hw; s++) {
        const it = items[s];
        if (!it) continue;
        if (it.x < minX || it.x > maxX || it.z < minZ || it.z > maxZ) continue;
        if (filter && !filter(it)) continue;
        if (n < out.length) out[n] = it;
        else out.push(it);
        n++;
      }
    } else {
      for (let cz = minCz; cz <= maxCz; cz++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          let s = this.heads[this.hash(cx, cz)]!;
          while (s !== -1) {
            if (this.cellX[s] === cx && this.cellZ[s] === cz) {
              const it = items[s]!;
              if (it.x >= minX && it.x <= maxX && it.z >= minZ && it.z <= maxZ && (!filter || filter(it))) {
                if (n < out.length) out[n] = it;
                else out.push(it);
                n++;
              }
            }
            s = this.next[s]!;
          }
        }
      }
    }
    truncate(out, n);
    return n;
  }

  /** Parcours commun des requêtes circulaires. */
  private scan(
    x: number, z: number, r: number, mode: number, out: T[] | null, filter: ((item: T) => boolean) | undefined,
  ): number {
    this.best = null;
    if (this.count_ === 0 || !(r >= 0)) return 0;
    let n = 0;
    let best: T | null = null;
    let bestD2 = r * r;
    const r2 = bestD2;
    const items = this.items;
    const inv = this.inv;
    const minCx = Math.floor((x - r) * inv);
    const maxCx = Math.floor((x + r) * inv);
    const minCz = Math.floor((z - r) * inv);
    const maxCz = Math.floor((z + r) * inv);
    const cells = (maxCx - minCx + 1) * (maxCz - minCz + 1);

    if (!(cells < this.count_)) {
      // requête large (ou rayon infini) : balayage linéaire
      for (let s = 0; s < this.hw; s++) {
        const it = items[s];
        if (!it) continue;
        const dx = it.x - x;
        const dz = it.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        if (mode === NEAREST) {
          if (d2 <= bestD2 && (!filter || filter(it))) {
            bestD2 = d2;
            best = it;
          }
          continue;
        }
        if (filter && !filter(it)) continue;
        if (mode === COLLECT) {
          if (n < out!.length) out![n] = it;
          else out!.push(it);
        }
        n++;
      }
      this.best = best;
      return n;
    }

    const heads = this.heads;
    const next = this.next;
    const cellX = this.cellX;
    const cellZ = this.cellZ;
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let s = heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask]!;
        while (s !== -1) {
          if (cellX[s] === cx && cellZ[s] === cz) {
            const it = items[s]!;
            const dx = it.x - x;
            const dz = it.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= r2) {
              if (mode === NEAREST) {
                if (d2 <= bestD2 && (!filter || filter(it))) {
                  bestD2 = d2;
                  best = it;
                }
              } else if (!filter || filter(it)) {
                if (mode === COLLECT) {
                  if (n < out!.length) out![n] = it;
                  else out!.push(it);
                }
                n++;
              }
            }
          }
          s = next[s]!;
        }
      }
    }
    this.best = best;
    return n;
  }
}
