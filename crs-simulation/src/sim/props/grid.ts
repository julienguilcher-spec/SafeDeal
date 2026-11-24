/* =====================================================================================
 * DÉCOR DYNAMIQUE — index spatial des boîtes : grille de hachage où chaque objet est inscrit dans
 * TOUTES les cellules que recouvre son emprise (rectangle englobant de sa boîte orientée).
 *
 * Pourquoi pas la grille par points du cœur : un objet long (barricade de 10 m, échafaudage) y
 * oblige à gonfler le rayon de chaque requête du plus grand rayon englobant ; ici une requête ne
 * visite que les cellules qu'elle touche réellement — une personne de 0,28 m de rayon : une à
 * quatre cellules, quel que soit le mobilier présent.
 *
 *   - insert / remove / update / requêtes : aucune allocation en régime établi ;
 *   - un objet présent dans plusieurs cellules n'est rendu qu'une fois par requête (tampon) ;
 *   - walkSegment : parcours des cellules traversées par un segment, dans l'ordre (lancer de rayon).
 * ===================================================================================== */

/** Champs que l'index tient à jour sur chaque objet inscrit. */
export interface GridItem {
  /** Plage de cellules occupée (valide si gIn). */
  gx0: number;
  gx1: number;
  gz0: number;
  gz1: number;
  gIn: boolean;
  /** Tampon de dédoublonnage de la dernière requête qui a vu l'objet. */
  gStamp: number;
}

function nextPow2(n: number): number {
  let p = 16;
  while (p < n) p <<= 1;
  return p;
}

export class BoxGrid<T extends GridItem> {
  readonly cellSize: number;
  private readonly inv: number;
  private mask: number;
  private heads: Int32Array;
  private next: Int32Array;
  private cellX: Int32Array;
  private cellZ: Int32Array;
  private readonly items: (T | null)[] = [];
  private hw = 0;
  private free = -1;
  private nodes = 0;
  private stamp = 1;

  constructor(cellSize = 4, expectedNodes = 4096) {
    this.cellSize = cellSize > 0 ? cellSize : 4;
    this.inv = 1 / this.cellSize;
    const cap = nextPow2(expectedNodes);
    this.mask = cap * 2 - 1;
    this.heads = new Int32Array(cap * 2).fill(-1);
    this.next = new Int32Array(cap);
    this.cellX = new Int32Array(cap);
    this.cellZ = new Int32Array(cap);
  }

  /** Nombre d'inscriptions (objet × cellule). */
  get nodeCount(): number {
    return this.nodes;
  }

  clear(): void {
    for (let s = 0; s < this.hw; s++) {
      const it = this.items[s];
      if (it) it.gIn = false;
      this.items[s] = null;
    }
    this.heads.fill(-1);
    this.hw = 0;
    this.free = -1;
    this.nodes = 0;
  }

  private hash(cx: number, cz: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask;
  }

  private grow(): void {
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
    // les seaux suivent : on garde deux seaux par inscription possible
    this.mask = cap * 2 - 1;
    this.heads = new Int32Array(cap * 2).fill(-1);
    for (let s = 0; s < this.hw; s++) {
      if (this.items[s] === null) continue;
      const b = this.hash(this.cellX[s]!, this.cellZ[s]!);
      this.next[s] = this.heads[b]!;
      this.heads[b] = s;
    }
  }

  private link(item: T, cx: number, cz: number): void {
    let s: number;
    if (this.free !== -1) {
      s = this.free;
      this.free = this.next[s]!;
    } else {
      if (this.hw === this.next.length) this.grow();
      s = this.hw++;
    }
    this.items[s] = item;
    this.cellX[s] = cx;
    this.cellZ[s] = cz;
    const b = this.hash(cx, cz);
    this.next[s] = this.heads[b]!;
    this.heads[b] = s;
    this.nodes++;
  }

  private unlink(item: T, cx: number, cz: number): void {
    const b = this.hash(cx, cz);
    let prev = -1;
    let s = this.heads[b]!;
    while (s !== -1) {
      if (this.items[s] === item && this.cellX[s] === cx && this.cellZ[s] === cz) {
        if (prev === -1) this.heads[b] = this.next[s]!;
        else this.next[prev] = this.next[s]!;
        this.items[s] = null;
        this.next[s] = this.free;
        this.free = s;
        this.nodes--;
        return;
      }
      prev = s;
      s = this.next[s]!;
    }
  }

  /** Inscrit un objet pour le rectangle englobant donné. */
  insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
    if (item.gIn) this.remove(item);
    const inv = this.inv;
    const x0 = Math.floor(minX * inv);
    const x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv);
    const z1 = Math.floor(maxZ * inv);
    item.gx0 = x0;
    item.gx1 = x1;
    item.gz0 = z0;
    item.gz1 = z1;
    item.gIn = true;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) this.link(item, cx, cz);
  }

  remove(item: T): void {
    if (!item.gIn) return;
    for (let cz = item.gz0; cz <= item.gz1; cz++) for (let cx = item.gx0; cx <= item.gx1; cx++) this.unlink(item, cx, cz);
    item.gIn = false;
  }

  /** Ré-inscrit l'objet si son rectangle a changé de cellules. Retourne true dans ce cas. */
  update(item: T, minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    const inv = this.inv;
    if (
      item.gIn && Math.floor(minX * inv) === item.gx0 && Math.floor(maxX * inv) === item.gx1 &&
      Math.floor(minZ * inv) === item.gz0 && Math.floor(maxZ * inv) === item.gz1
    ) return false;
    this.insert(item, minX, minZ, maxX, maxZ);
    return true;
  }

  /**
   * Objets inscrits dans une cellule recouverte par le rectangle (chacun une seule fois). Écrit à
   * partir de l'index `n` de `out` et retourne le nouvel index ; ne tronque pas `out`.
   */
  collectBox(minX: number, minZ: number, maxX: number, maxZ: number, out: T[], n = 0): number {
    if (this.nodes === 0) return n;
    const inv = this.inv;
    const x0 = Math.floor(minX * inv);
    const x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv);
    const z1 = Math.floor(maxZ * inv);
    const stamp = ++this.stamp;
    const heads = this.heads;
    const next = this.next;
    const cellX = this.cellX;
    const cellZ = this.cellZ;
    const items = this.items;
    const mask = this.mask;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        let s = heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask]!;
        while (s !== -1) {
          if (cellX[s] === cx && cellZ[s] === cz) {
            const it = items[s]!;
            if (it.gStamp !== stamp) {
              it.gStamp = stamp;
              if (n < out.length) out[n] = it;
              else out.push(it);
              n++;
            }
          }
          s = next[s]!;
        }
      }
    }
    return n;
  }

  /** Ouvre un parcours par cellules (collectCell) : les objets déjà vus depuis ne sont pas rendus deux fois. */
  beginWalk(): void {
    this.stamp++;
  }

  /** Objets d'une cellule non encore vus depuis beginWalk(). Même convention d'écriture que collectBox. */
  collectCell(cx: number, cz: number, out: T[], n = 0): number {
    const stamp = this.stamp;
    let s = this.heads[(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask]!;
    while (s !== -1) {
      if (this.cellX[s] === cx && this.cellZ[s] === cz) {
        const it = this.items[s]!;
        if (it.gStamp !== stamp) {
          it.gStamp = stamp;
          if (n < out.length) out[n] = it;
          else out.push(it);
          n++;
        }
      }
      s = this.next[s]!;
    }
    return n;
  }

  /** La grille est vide de toute inscription. */
  get empty(): boolean {
    return this.nodes === 0;
  }
}
