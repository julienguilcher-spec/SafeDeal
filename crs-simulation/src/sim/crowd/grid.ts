/* =====================================================================================
 * FOULE — grille creuse à canaux : cellules carrées repérées par hachage ouvert, valeurs dans des
 * tableaux typés. Sert à la carte de tension (25 m), à la légitimité (50 m), à la contagion (5 m), à
 * la densité (2,5 m) et à l'index des forces de l'ordre (12 m). Aucune allocation hors agrandissement.
 * ===================================================================================== */

const EMPTY = 0x7fffffff;

export class SparseGrid {
  readonly cell: number;
  readonly channels: number;
  private readonly inv: number;
  private cap: number;
  private mask: number;
  private keysX: Int32Array;
  private keysZ: Int32Array;
  /** Valeurs : channels flottants par emplacement. */
  data: Float32Array;
  /** Emplacements occupés, dans l'ordre d'insertion (pour parcourir les cellules actives). */
  private used: Int32Array;
  count = 0;

  constructor(cell: number, channels: number, capacity = 256) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.channels = channels;
    let cap = 64;
    while (cap < capacity * 2) cap <<= 1;
    this.cap = cap;
    this.mask = cap - 1;
    this.keysX = new Int32Array(cap).fill(EMPTY);
    this.keysZ = new Int32Array(cap);
    this.data = new Float32Array(cap * channels);
    this.used = new Int32Array(cap);
  }

  clear(): void {
    const used = this.used;
    const ch = this.channels;
    for (let i = 0; i < this.count; i++) {
      const s = used[i]!;
      this.keysX[s] = EMPTY;
      const o = s * ch;
      for (let c = 0; c < ch; c++) this.data[o + c] = 0;
    }
    this.count = 0;
  }

  cx(x: number): number {
    return Math.floor(x * this.inv);
  }

  /** Emplacement de la cellule (cx, cz), ou −1 si elle n'existe pas. */
  find(cx: number, cz: number): number {
    let h = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask;
    const kx = this.keysX;
    const kz = this.keysZ;
    for (;;) {
      const k = kx[h]!;
      if (k === EMPTY) return -1;
      if (k === cx && kz[h] === cz) return h;
      h = (h + 1) & this.mask;
    }
  }

  /** Emplacement de la cellule contenant (x, z), ou −1. */
  at(x: number, z: number): number {
    return this.find(Math.floor(x * this.inv), Math.floor(z * this.inv));
  }

  /** Emplacement de la cellule (cx, cz), créée au besoin. */
  ensure(cx: number, cz: number): number {
    if (this.count * 2 >= this.cap) this.grow();
    let h = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask;
    const kx = this.keysX;
    const kz = this.keysZ;
    for (;;) {
      const k = kx[h]!;
      if (k === EMPTY) {
        kx[h] = cx;
        kz[h] = cz;
        this.used[this.count++] = h;
        return h;
      }
      if (k === cx && kz[h] === cz) return h;
      h = (h + 1) & this.mask;
    }
  }

  ensureAt(x: number, z: number): number {
    return this.ensure(Math.floor(x * this.inv), Math.floor(z * this.inv));
  }

  /** Valeur d'un canal en (x, z) ; `fallback` si la cellule n'existe pas. */
  get(x: number, z: number, channel: number, fallback = 0): number {
    const s = this.find(Math.floor(x * this.inv), Math.floor(z * this.inv));
    return s < 0 ? fallback : this.data[s * this.channels + channel]!;
  }

  add(x: number, z: number, channel: number, value: number): number {
    const s = this.ensure(Math.floor(x * this.inv), Math.floor(z * this.inv));
    const o = s * this.channels + channel;
    this.data[o] = this.data[o]! + value;
    return s;
  }

  /** i-ème cellule active (0 ≤ i < count) : son emplacement. */
  slot(i: number): number {
    return this.used[i]!;
  }

  /** Centre de la cellule d'un emplacement. */
  centerX(slot: number): number {
    return (this.keysX[slot]! + 0.5) * this.cell;
  }

  centerZ(slot: number): number {
    return (this.keysZ[slot]! + 0.5) * this.cell;
  }

  keyX(slot: number): number {
    return this.keysX[slot]!;
  }

  keyZ(slot: number): number {
    return this.keysZ[slot]!;
  }

  private grow(): void {
    const oldX = this.keysX;
    const oldZ = this.keysZ;
    const oldData = this.data;
    const oldUsed = this.used;
    const n = this.count;
    const ch = this.channels;
    this.cap <<= 1;
    this.mask = this.cap - 1;
    this.keysX = new Int32Array(this.cap).fill(EMPTY);
    this.keysZ = new Int32Array(this.cap);
    this.data = new Float32Array(this.cap * ch);
    this.used = new Int32Array(this.cap);
    this.count = 0;
    for (let i = 0; i < n; i++) {
      const s = oldUsed[i]!;
      const t = this.ensure(oldX[s]!, oldZ[s]!);
      for (let c = 0; c < ch; c++) this.data[t * ch + c] = oldData[s * ch + c]!;
    }
  }
}
