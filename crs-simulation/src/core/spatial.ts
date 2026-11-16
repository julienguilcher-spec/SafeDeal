/* =====================================================================================
 * Grille de hachage spatiale générique sur le plan (x, z).
 *
 *   - les éléments sont indexés par leur POSITION (item.x, item.z) au moment de l'insertion
 *     (ou du dernier update/rebuild) ; les tests de distance utilisent la position COURANTE ;
 *   - insert / remove / update / requêtes : aucune allocation en régime établi (les tableaux
 *     internes ne grandissent que lorsque la capacité est dépassée) ;
 *   - rebuild(items) : reconstruction complète en O(n) ;
 *   - une requête couvrant plus de cellules qu'il n'y a d'éléments bascule sur un balayage linéaire ;
 *   - nearest() explore les cellules par anneaux autour du point et s'arrête dès que le meilleur
 *     candidat est plus proche que tout ce qui reste à explorer ;
 *   - valeurs invalides : un élément dont la position n'est pas un nombre fini n'est jamais renvoyé,
 *     une requête dont le centre ou le rayon est NaN ne renvoie rien ;
 *   - modifier l'index depuis le FILTRE d'une requête en cours est permis, et la requête se termine
 *     toujours : un élément retiré n'est plus présenté ; un élément inséré ou déplacé (update) n'est
 *     pris en compte qu'à la fin de la requête (son chaînage est différé, pour ne jamais recâbler une
 *     liste en cours de parcours) ; après un rebuild() ou un clear(), la requête en cours s'arrête là
 *     (résultat partiel).
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
   * Requêtes en cours (imbriquées). Tant qu'il y en a, les chaînes ne sont jamais recâblées : les
   * retraits délient sans libérer, les insertions et les déplacements attendent la fin de la requête.
   * Une requête peut donc parcourir ses chaînes avec les tableaux relevés à son début.
   */
  private scanDepth = 0;
  /** Emplacements libérés pendant une requête, rendus à la liste libre quand elle se termine. */
  private readonly pendingFree: number[] = [];
  /** Emplacements insérés pendant une requête, chaînés dans leur seau quand elle se termine. */
  private readonly pendingLink: number[] = [];
  /** update() a été appelé pendant une requête : ré-indexation complète à la fin. */
  private reindexPending = false;
  /** Un agrandissement de la table des seaux a été demandé pendant une requête. */
  private growPending = false;
  /** Change à chaque clear() / rebuild() : une requête en cours doit alors s'arrêter. */
  private epoch = 0;

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
    this.pendingFree.length = 0;
    this.pendingLink.length = 0;
    this.reindexPending = false;
    this.epoch++;
  }

  /** Fin de la dernière requête en cours : applique ce qui avait été différé. */
  private endScan(): void {
    if (--this.scanDepth > 0) return;
    const items = this.items;
    const links = this.pendingLink;
    if (links.length > 0) {
      for (let i = 0; i < links.length; i++) {
        const s = links[i]!;
        if (s >= this.hw || items[s] === null) continue; // retiré entre-temps
        const b = this.hash(this.cellX[s]!, this.cellZ[s]!);
        this.next[s] = this.heads[b]!;
        this.heads[b] = s;
      }
      links.length = 0;
    }
    const frees = this.pendingFree;
    if (frees.length > 0) {
      for (let i = 0; i < frees.length; i++) {
        const s = frees[i]!;
        if (s < this.hw && items[s] === null) {
          this.next[s] = this.free;
          this.free = s;
        }
      }
      frees.length = 0;
    }
    if (this.reindexPending) {
      this.reindexPending = false;
      this.updateAll();
    }
    if (this.growPending) {
      this.growPending = false;
      if (this.count_ > (this.mask + 1) * 2) this.growBuckets();
    }
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
    this.count_++;
    if (this.scanDepth > 0) {
      // une requête est en cours (insertion depuis un filtre) : chaînage et agrandissement différés
      this.next[s] = -1;
      this.pendingLink.push(s);
      if (this.count_ > (this.mask + 1) * 2) this.growPending = true;
      return s;
    }
    const b = this.hash(cx, cz);
    this.next[s] = this.heads[b]!;
    this.heads[b] = s;
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
    this.count_--;
    if (this.scanDepth > 0) {
      // une requête parcourt peut-être cet emplacement : son chaînage reste intact jusqu'à la fin
      this.pendingFree.push(slot);
    } else {
      this.next[slot] = this.free;
      this.free = slot;
    }
  }

  /**
   * Retire un élément par identité. Cherche d'abord dans la cellule de sa position courante et ses
   * voisines (cas général : il a peu bougé depuis l'indexation), puis, à défaut, partout.
   * Retourne false s'il n'est pas indexé.
   */
  removeItem(item: T): boolean {
    const items = this.items;
    const cx = Math.floor(item.x * this.inv);
    const cz = Math.floor(item.z * this.inv);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        let s = this.heads[this.hash(cx + dx, cz + dz)]!;
        while (s !== -1) {
          if (items[s] === item) {
            this.remove(s);
            return true;
          }
          s = this.next[s]!;
        }
      }
    }
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
    if (this.scanDepth > 0) {
      // déplacer un chaînon sous une requête en cours la ferait dérailler : tout sera ré-indexé à la fin
      this.reindexPending = true;
      return;
    }
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
    if (this.count_ === 0 || !(minX <= maxX) || !(minZ <= maxZ)) {
      truncate(out, 0);
      return 0;
    }
    const items = this.items;
    const minCx = Math.floor(minX * this.inv);
    const maxCx = Math.floor(maxX * this.inv);
    const minCz = Math.floor(minZ * this.inv);
    const maxCz = Math.floor(maxZ * this.inv);
    const cells = (maxCx - minCx + 1) * (maxCz - minCz + 1);
    const epoch = this.epoch;
    this.scanDepth++;
    try {
      if (!(cells < this.count_)) {
        for (let s = 0; s < this.hw; s++) {
          const it = items[s];
          if (!it) continue;
          if (!(it.x >= minX && it.x <= maxX && it.z >= minZ && it.z <= maxZ)) continue;
          if (filter) {
            const keep = filter(it);
            if (this.epoch !== epoch) break;
            if (!keep) continue;
          }
          if (n < out.length) out[n] = it;
          else out.push(it);
          n++;
        }
      } else {
        const heads = this.heads; // stables pendant la requête (voir scanDepth)
        const mask = this.mask;
        const next = this.next;
        const cellX = this.cellX;
        const cellZ = this.cellZ;
        scan: for (let cz = minCz; cz <= maxCz; cz++) {
          for (let cx = minCx; cx <= maxCx; cx++) {
            let s = heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask]!;
            while (s !== -1) {
              if (cellX[s] === cx && cellZ[s] === cz) {
                const it = items[s];
                if (it && it.x >= minX && it.x <= maxX && it.z >= minZ && it.z <= maxZ) {
                  let keep = true;
                  if (filter) {
                    keep = filter(it);
                    if (this.epoch !== epoch) break scan;
                  }
                  if (keep) {
                    if (n < out.length) out[n] = it;
                    else out.push(it);
                    n++;
                  }
                }
              }
              s = next[s]!;
            }
          }
        }
      }
    } finally {
      this.endScan();
    }
    truncate(out, n);
    return n;
  }

  /** Parcours commun des requêtes circulaires. */
  private scan(
    x: number, z: number, r: number, mode: number, out: T[] | null, filter: ((item: T) => boolean) | undefined,
  ): number {
    this.best = null;
    // centre ou rayon NaN : aucun résultat (x !== x n'est vrai que pour NaN)
    if (this.count_ === 0 || !(r >= 0) || x !== x || z !== z) return 0;
    // rayon infini (ou immense) : toutes les positions FINIES, jamais les positions infinies
    let r2 = r * r;
    if (r2 > Number.MAX_VALUE) r2 = Number.MAX_VALUE;
    const inv = this.inv;
    const minCx = Math.floor((x - r) * inv);
    const maxCx = Math.floor((x + r) * inv);
    const minCz = Math.floor((z - r) * inv);
    const maxCz = Math.floor((z + r) * inv);
    const cells = (maxCx - minCx + 1) * (maxCz - minCz + 1);
    this.scanDepth++;
    try {
      // requête large (ou rayon infini) : balayage linéaire
      if (!(cells < this.count_)) return this.scanLinear(x, z, r2, mode, out, filter);
      if (mode === NEAREST) return this.scanNearest(x, z, r2, minCx, maxCx, minCz, maxCz, filter);
      return this.scanCells(x, z, r2, mode, out, minCx, maxCx, minCz, maxCz, filter);
    } finally {
      this.endScan();
    }
  }

  private scanLinear(
    x: number, z: number, r2: number, mode: number, out: T[] | null, filter: ((item: T) => boolean) | undefined,
  ): number {
    const items = this.items;
    const epoch = this.epoch;
    let n = 0;
    let best: T | null = null;
    let bestD2 = r2;
    // this.hw est relu à chaque tour : un filtre peut insérer ou retirer des éléments
    for (let s = 0; s < this.hw; s++) {
      const it = items[s];
      if (!it) continue;
      const dx = it.x - x;
      const dz = it.z - z;
      const d2 = dx * dx + dz * dz;
      if (!(d2 <= r2)) continue; // écarte aussi les positions NaN
      if (mode === NEAREST) {
        if (d2 > bestD2) continue;
        if (filter) {
          const keep = filter(it);
          if (this.epoch !== epoch) break;
          if (!keep) continue;
        }
        bestD2 = d2;
        best = it;
        continue;
      }
      if (filter) {
        const keep = filter(it);
        if (this.epoch !== epoch) break;
        if (!keep) continue;
      }
      if (mode === COLLECT) {
        if (n < out!.length) out![n] = it;
        else out!.push(it);
      }
      n++;
    }
    this.best = best;
    return n;
  }

  private scanCells(
    x: number, z: number, r2: number, mode: number, out: T[] | null,
    minCx: number, maxCx: number, minCz: number, maxCz: number, filter: ((item: T) => boolean) | undefined,
  ): number {
    // Tableaux relevés une fois : pendant une requête, les chaînes ne sont jamais recâblées (voir scanDepth).
    const items = this.items;
    const heads = this.heads;
    const mask = this.mask;
    const next = this.next;
    const cellX = this.cellX;
    const cellZ = this.cellZ;
    const epoch = this.epoch;
    let n = 0;
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let s = heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask]!;
        while (s !== -1) {
          if (cellX[s] === cx && cellZ[s] === cz) {
            const it = items[s];
            if (it) {
              const dx = it.x - x;
              const dz = it.z - z;
              if (dx * dx + dz * dz <= r2) {
                if (!filter) {
                  if (mode === COLLECT) {
                    if (n < out!.length) out![n] = it;
                    else out!.push(it);
                  }
                  n++;
                } else {
                  const keep = filter(it);
                  if (this.epoch !== epoch) return n; // index vidé ou reconstruit depuis le filtre : arrêt
                  if (keep) {
                    if (mode === COLLECT) {
                      if (n < out!.length) out![n] = it;
                      else out!.push(it);
                    }
                    n++;
                  }
                }
              }
            }
          }
          s = next[s]!;
        }
      }
    }
    return n;
  }

  /**
   * Plus proche voisin : cellules visitées par anneaux carrés autour de celle du point. Un élément
   * indexé dans l'anneau k est à au moins (k − 1) cellules du point : dès que le meilleur candidat
   * est plus proche que cela, les anneaux restants ne peuvent plus faire mieux. Une demi-cellule de
   * marge couvre les éléments qui ont bougé depuis leur indexation.
   */
  private scanNearest(
    x: number, z: number, r2: number,
    minCx: number, maxCx: number, minCz: number, maxCz: number, filter: ((item: T) => boolean) | undefined,
  ): number {
    const items = this.items;
    const heads = this.heads;
    const mask = this.mask;
    const next = this.next;
    const cellX = this.cellX;
    const cellZ = this.cellZ;
    const epoch = this.epoch;
    const c0x = Math.floor(x * this.inv);
    const c0z = Math.floor(z * this.inv);
    let rings = c0x - minCx;
    if (maxCx - c0x > rings) rings = maxCx - c0x;
    if (c0z - minCz > rings) rings = c0z - minCz;
    if (maxCz - c0z > rings) rings = maxCz - c0z;
    let best: T | null = null;
    let bestD2 = r2;
    for (let k = 0; k <= rings; k++) {
      if (best !== null && k > 1) {
        const reach = (k - 1.5) * this.cellSize;
        if (bestD2 <= reach * reach) break;
      }
      // anneau k : 1 cellule (k = 0) ou les 8k cellules du pourtour du carré de côté 2k + 1
      const count = k === 0 ? 1 : 8 * k;
      for (let i = 0; i < count; i++) {
        let cx: number;
        let cz: number;
        if (i <= 2 * k) {
          cx = c0x - k + i;
          cz = c0z - k;
        } else if (i <= 4 * k + 1) {
          cx = c0x - k + (i - 2 * k - 1);
          cz = c0z + k;
        } else if (i <= 6 * k) {
          cx = c0x - k;
          cz = c0z - k + 1 + (i - 4 * k - 2);
        } else {
          cx = c0x + k;
          cz = c0z - k + 1 + (i - 6 * k - 1);
        }
        if (cx < minCx || cx > maxCx || cz < minCz || cz > maxCz) continue;
        let s = heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask]!;
        while (s !== -1) {
          if (cellX[s] === cx && cellZ[s] === cz) {
            const it = items[s];
            if (it) {
              const dx = it.x - x;
              const dz = it.z - z;
              const d2 = dx * dx + dz * dz;
              if (d2 <= bestD2) {
                let keep = true;
                if (filter) {
                  keep = filter(it);
                  if (this.epoch !== epoch) {
                    // index vidé ou reconstruit depuis le filtre : arrêt sur le meilleur candidat connu
                    this.best = keep ? it : best;
                    return 0;
                  }
                }
                if (keep) {
                  bestD2 = d2;
                  best = it;
                }
              }
            }
          }
          s = next[s]!;
        }
      }
    }
    this.best = best;
    return 0;
  }
}
