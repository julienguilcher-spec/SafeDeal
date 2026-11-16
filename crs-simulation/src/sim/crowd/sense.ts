/* =====================================================================================
 * FOULE — perception commune : où sont les forces de l'ordre, quels dangers et quels faits récents
 * (violences, blessés, interpellations, charges, nasses, tirs de canon à eau).
 *
 * Les forces sont rangées dans une grille de 12 m reconstruite deux à trois fois par seconde : la
 * plupart des manifestants n'ont personne en uniforme à proximité et le savent en neuf lectures de
 * cellules ; seuls ceux qui en ont font une vraie requête spatiale.
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import type { PoliceSight } from './api';
import type { CrowdCore } from './core';
import { SparseGrid } from './grid';
import * as T from './tuning';

export interface Spot { x: number; z: number; t: number; id: EntityId; a: number; b: number }

function isPoliceOnFoot(p: Person): boolean {
  return p.faction === 'police' && p.vehicleId === 0 && p.posture !== 'down';
}

function isProtester(p: Person): boolean {
  return p.faction === 'protest' && p.posture !== 'down';
}

const POLICE_CELL = 12;

/** Liste bornée de faits récents (tampon circulaire). */
export class Spots {
  readonly items: Spot[] = [];
  private cursor = 0;

  constructor(private readonly cap: number) {}

  add(x: number, z: number, t: number, id: EntityId = 0, a = 0, b = 0): Spot {
    let s: Spot;
    if (this.items.length < this.cap) {
      s = { x, z, t, id, a, b };
      this.items.push(s);
    } else {
      s = this.items[this.cursor]!;
      this.cursor = (this.cursor + 1) % this.cap;
      s.x = x; s.z = z; s.t = t; s.id = id; s.a = a; s.b = b;
    }
    return s;
  }

  /** Fait le plus récent à moins de `r` et plus jeune que `since`. */
  near(x: number, z: number, r: number, since: number): Spot | null {
    let best: Spot | null = null;
    const r2 = r * r;
    for (let i = 0; i < this.items.length; i++) {
      const s = this.items[i]!;
      if (s.t < since) continue;
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d <= r2 && (!best || s.t > best.t)) best = s;
    }
    return best;
  }

  clear(): void {
    this.items.length = 0;
    this.cursor = 0;
  }
}

export class Sense {
  /** Canaux : effectif, somme x, somme z, somme vx, somme vz. */
  private readonly police = new SparseGrid(POLICE_CELL, 5, 128);
  policeTotal = 0;
  private nextPolice = 0;
  private readonly buf: Person[] = [];
  /** Actes violents visibles (justifient une riposte proche pendant 60 s). */
  readonly violence = new Spots(48);
  /** Personnes à terre : id, instant. a = 1 si les secours ont été appelés. */
  readonly casualties = new Spots(24);
  /** Interpellations : a = 1 si fondée. */
  readonly arrests = new Spots(16);
  /** Charges et bonds offensifs : (x, z) origine, a/b direction unitaire ; t = fin. */
  readonly charges = new Spots(12);
  /** Nasses : a = rayon ; t = fin (Infinity tant qu'elle dure). */
  readonly kettles = new Spots(6);
  /** Tirs de canon à eau : (x, z) point d'impact, a/b position de l'engin. */
  readonly water = new Spots(8);
  /** Chutes de grenades lacrymogènes et nuages (pour reculer). */
  readonly gas = new Spots(16);
  /** Coarse : résultat de policeNear. */
  nearX = 0;
  nearZ = 0;
  nearCount = 0;
  nearVx = 0;
  nearVz = 0;

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.police.clear();
    this.policeTotal = 0;
    this.nextPolice = 0;
    this.violence.clear();
    this.casualties.clear();
    this.arrests.clear();
    this.charges.clear();
    this.kettles.clear();
    this.water.clear();
    this.gas.clear();
  }

  update(): void {
    const core = this.core;
    if (core.now < this.nextPolice) return;
    this.nextPolice = core.now + 0.4;
    const grid = this.police;
    grid.clear();
    const list = core.ctx.people.list;
    let total = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.faction !== 'police' || p.dormant || p.vehicleId !== 0 || p.posture === 'down') continue;
      const o = grid.ensureAt(p.x, p.z) * 5;
      const d = grid.data;
      d[o] = d[o]! + 1;
      d[o + 1] = d[o + 1]! + p.x;
      d[o + 2] = d[o + 2]! + p.z;
      d[o + 3] = d[o + 3]! + p.vx;
      d[o + 4] = d[o + 4]! + p.vz;
      total++;
    }
    this.policeTotal = total;
  }

  /**
   * Lecture rapide : distance au groupe d'agents le plus proche dans les cellules voisines (± `reach`
   * cellules de 12 m). Renseigne nearX/nearZ (barycentre), nearCount et nearVx/nearVz (vitesse moyenne).
   * Retourne Infinity s'il n'y a personne.
   */
  policeNear(x: number, z: number, reach = 2): number {
    if (this.policeTotal === 0) return Infinity;
    const grid = this.police;
    const cx = grid.cx(x);
    const cz = grid.cx(z);
    let best = Infinity;
    const d = grid.data;
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        const s = grid.find(cx + i, cz + j);
        if (s < 0) continue;
        const o = s * 5;
        const n = d[o]!;
        if (n <= 0) continue;
        const px = d[o + 1]! / n;
        const pz = d[o + 2]! / n;
        const dist = Math.hypot(px - x, pz - z);
        if (dist < best) {
          best = dist;
          this.nearX = px;
          this.nearZ = pz;
          this.nearCount = n;
          this.nearVx = d[o + 3]! / n;
          this.nearVz = d[o + 4]! / n;
        }
      }
    }
    return best;
  }

  /** Requête précise : agent à pied le plus proche dans le rayon. */
  nearestPolice(x: number, z: number, r: number, out: PoliceSight): boolean {
    out.id = 0;
    out.count = 0;
    out.dist = Infinity;
    out.closing = 0;
    if (this.policeTotal === 0) return false;
    const n = this.core.ctx.people.queryRadius(x, z, r, this.buf, isPoliceOnFoot);
    if (n === 0) return false;
    let best = this.buf[0]!;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const q = this.buf[i]!;
      const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    const dist = Math.sqrt(bestD);
    out.id = best.id;
    out.x = best.x;
    out.z = best.z;
    out.dist = dist;
    out.count = n;
    out.closing = dist > 0.01 ? -(best.vx * (best.x - x) + best.vz * (best.z - z)) / dist : 0;
    return true;
  }

  coverAt(x: number, z: number, r: number): number {
    return this.core.ctx.people.countIn(x, z, r, isProtester);
  }

  markViolence(x: number, z: number): void {
    this.violence.add(x, z, this.core.now);
  }

  recentViolence(x: number, z: number, r: number): boolean {
    return this.violence.near(x, z, r, this.core.now - T.JUSTIFY_WINDOW * Math.min(1.5, Math.max(0.6, this.core.timeScale))) !== null;
  }

  /** La personne est-elle dans une nasse active ? */
  kettleAt(x: number, z: number): Spot | null {
    const items = this.kettles.items;
    for (let i = 0; i < items.length; i++) {
      const k = items[i]!;
      if (k.t < this.core.now) continue;
      if ((k.x - x) * (k.x - x) + (k.z - z) * (k.z - z) <= k.a * k.a) return k;
    }
    return null;
  }
}
