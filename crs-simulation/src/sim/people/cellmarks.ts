/* =====================================================================================
 * Marquage des cellules proches d'un véhicule (table de hachage à adressage ouvert, sans
 * allocation en régime établi). La locomotion ne demande vehicles.resolveCircle que pour les
 * personnes situées dans une cellule marquée : le coût ne dépend plus du produit
 * « nombre de personnes × nombre de véhicules ».
 * ===================================================================================== */

import type { Vehicle } from '@/core/contracts';

/** Marge ajoutée à l'emprise du véhicule : rayon d'une personne et son déplacement pendant un pas. */
const MARGIN = 1;

export class CellMarks {
  private kx: Int32Array;
  private kz: Int32Array;
  private stamp: Int32Array;
  private mask: number;
  private gen = 1;
  private count = 0;
  private readonly inv: number;

  constructor(readonly cell: number, capacity = 256) {
    this.inv = 1 / cell;
    let cap = 16;
    while (cap < capacity) cap <<= 1;
    this.kx = new Int32Array(cap);
    this.kz = new Int32Array(cap);
    this.stamp = new Int32Array(cap);
    this.mask = cap - 1;
  }

  /** Nombre de cellules marquées. */
  get size(): number {
    return this.count;
  }

  rebuild(vehicles: readonly Vehicle[]): void {
    this.gen++;
    if (this.gen > 0x3fffffff) {
      this.stamp.fill(0);
      this.gen = 1;
    }
    this.count = 0;
    const inv = this.inv;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (v.dormant || v.def.flying) continue;
      const hx = v.def.width * 0.5;
      const hz = v.def.length * 0.5;
      const reach = Math.sqrt(hx * hx + hz * hz) + MARGIN;
      const x0 = Math.floor((v.x - reach) * inv);
      const x1 = Math.floor((v.x + reach) * inv);
      const z0 = Math.floor((v.z - reach) * inv);
      const z1 = Math.floor((v.z + reach) * inv);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) this.mark(cx, cz);
      }
    }
  }

  /** Le point est-il dans une cellule marquée ? */
  has(x: number, z: number): boolean {
    if (this.count === 0) return false;
    const cx = Math.floor(x * this.inv);
    const cz = Math.floor(z * this.inv);
    const mask = this.mask;
    const gen = this.gen;
    let i = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask;
    while (this.stamp[i] === gen) {
      if (this.kx[i] === cx && this.kz[i] === cz) return true;
      i = (i + 1) & mask;
    }
    return false;
  }

  private mark(cx: number, cz: number): void {
    if ((this.count + 1) * 2 > this.mask + 1) this.grow();
    const mask = this.mask;
    const gen = this.gen;
    let i = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask;
    while (this.stamp[i] === gen) {
      if (this.kx[i] === cx && this.kz[i] === cz) return;
      i = (i + 1) & mask;
    }
    this.stamp[i] = gen;
    this.kx[i] = cx;
    this.kz[i] = cz;
    this.count++;
  }

  private grow(): void {
    const oldX = this.kx;
    const oldZ = this.kz;
    const oldStamp = this.stamp;
    const gen = this.gen;
    const cap = (this.mask + 1) * 2;
    this.kx = new Int32Array(cap);
    this.kz = new Int32Array(cap);
    this.stamp = new Int32Array(cap);
    this.mask = cap - 1;
    this.count = 0;
    for (let i = 0; i < oldStamp.length; i++) {
      if (oldStamp[i] === gen) this.mark(oldX[i]!, oldZ[i]!);
    }
  }
}
