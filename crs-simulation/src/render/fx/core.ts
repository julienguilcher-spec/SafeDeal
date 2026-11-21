/* =====================================================================================
 * Effets visuels — état partagé par tous les émetteurs d'une image : couches de rendu,
 * réserve de particules, file des décalques, lumières, caméra, vent, et les « gestes »
 * élémentaires (bouffée, étincelle, éclat, décalque au sol ou sur une façade).
 * ===================================================================================== */

import type { GameContext, RayHit, Shop, ViewApi } from '@/core/contracts';
import { TILE_DOT, TILE_PUFF, TILE_STREAK } from './atlas';
import type { FxBudget } from './budget';
import { DECAL_ALPHA } from './decalQueue';
import { DecalQueue } from './decalQueue';
import type { DecalLayer } from './decalLayer';
import type { LightRig } from './lights';
import { FxRandom, TAU } from './mathx';
import {
  F_BOUNCE, F_FADE_IN, F_FLOORFADE, F_HOLD, F_STREAK, F_TURB, KIND_ALPHA, KIND_GLOW, KIND_LIT, ParticlePool,
} from './pool';
import type { SpriteLayer } from './spriteLayer';

export interface WallHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
}

const DIRS8: readonly number[] = [1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071, -0.7071];

export class FxCore {
  readonly rng = new FxRandom(0xc0ffee);
  readonly pool: ParticlePool;
  readonly queue: DecalQueue;
  /** Horloge des effets (s) : avance avec le temps simulé, figée en pause. */
  time = 0;
  dt = 0;
  /** Dérive de l'air (m/s). */
  windX = 0;
  windZ = 0;
  /** Niveau de nuit 0..1 (0 = plein jour). */
  night = 0;
  /** Pluie 0..1 et sol mouillé 0..1. */
  rain = 0;
  camX = 0;
  camY = 0;
  camZ = 0;
  /** La caméra regarde presque à la verticale (vue tactique, drone) : les volumes se couchent au sol. */
  topDown = false;
  /** Le sang est affiché (réglage « réaliste »). */
  blood = false;

  private readonly hit: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  private readonly shops: Shop[] = [];

  constructor(
    readonly ctx: GameContext,
    readonly view: ViewApi,
    readonly budget: FxBudget,
    readonly sprites: SpriteLayer,
    readonly decals: DecalLayer,
    readonly lights: LightRig,
  ) {
    this.pool = new ParticlePool(budget.maxParticles);
    this.queue = new DecalQueue(budget.maxDecals);
  }

  /** Altitude du sol (0 si le monde ne répond pas). */
  ground(x: number, z: number): number {
    const h = this.ctx.world.heightAt(x, z);
    return h === h ? h : 0;
  }

  /** Distance horizontale à la caméra. */
  camDist(x: number, z: number): number {
    const dx = x - this.camX;
    const dz = z - this.camZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // ───────────────────────────── gestes élémentaires ─────────────────────────────

  /** Bouffée volumique (gaz, fumée, poussière) : retourne l'indice de la particule ou -1. */
  puff(
    prio: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number,
    life: number, r: number, g: number, b: number, a: number, tile: number = TILE_PUFF + this.rng.int(4),
  ): number {
    const p = this.pool;
    const i = p.spawn(prio);
    if (i < 0) return -1;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.s0[i] = s0; p.s1[i] = s1;
    p.life[i] = life;
    p.r[i] = r; p.g[i] = g; p.b[i] = b; p.a[i] = a;
    p.rot[i] = this.rng.next() * TAU;
    p.spin[i] = this.rng.signed() * 0.35;
    p.drag[i] = 0.9;
    p.wind[i] = 0.8;
    p.grav[i] = -0.012;
    p.tile[i] = tile;
    p.kind[i] = KIND_LIT;
    p.flags[i] = F_TURB | F_FADE_IN | F_FLOORFADE;
    p.floorY[i] = this.ground(x, z);
    return i;
  }

  /** Étincelle filante : trait lumineux soumis à la pesanteur, qui rebondit une fois. */
  spark(
    prio: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number,
    r: number, g: number, b: number, intensity: number,
  ): number {
    const p = this.pool;
    const i = p.spawn(prio);
    if (i < 0) return -1;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.s0[i] = size; p.s1[i] = size * 0.4;
    p.life[i] = life;
    p.r[i] = r; p.g[i] = g; p.b[i] = b; p.a[i] = intensity;
    p.drag[i] = 0.7;
    p.grav[i] = 0.85;
    p.stretch[i] = 0.05;
    p.tile[i] = TILE_STREAK;
    p.kind[i] = KIND_GLOW;
    p.flags[i] = F_STREAK | F_BOUNCE;
    p.floorY[i] = this.ground(x, z);
    return i;
  }

  /** Lumière additive libre (éclair, braise, étoile). */
  glow(
    prio: number, x: number, y: number, z: number, s0: number, s1: number, life: number,
    r: number, g: number, b: number, intensity: number, tile: number = TILE_DOT, flags = 0,
  ): number {
    const p = this.pool;
    const i = p.spawn(prio);
    if (i < 0) return -1;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.s0[i] = s0; p.s1[i] = s1;
    p.life[i] = life;
    p.r[i] = r; p.g[i] = g; p.b[i] = b; p.a[i] = intensity;
    p.tile[i] = tile;
    p.kind[i] = KIND_GLOW;
    p.flags[i] = flags;
    return i;
  }

  /** Éclat de matière (débris, verre, goutte) : balistique, rebondit et reste un instant au sol. */
  chunk(
    prio: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number,
    r: number, g: number, b: number, a: number, tile: number, bounce = true,
  ): number {
    const p = this.pool;
    const i = p.spawn(prio);
    if (i < 0) return -1;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.s0[i] = size; p.s1[i] = size;
    p.life[i] = life;
    p.r[i] = r; p.g[i] = g; p.b[i] = b; p.a[i] = a;
    p.rot[i] = this.rng.next() * TAU;
    p.spin[i] = this.rng.signed() * 9;
    p.drag[i] = 0.25;
    p.grav[i] = 1;
    p.tile[i] = tile;
    p.kind[i] = KIND_ALPHA;
    p.flags[i] = bounce ? F_BOUNCE | F_HOLD : F_HOLD;
    p.floorY[i] = this.ground(x, z);
    return i;
  }

  // ───────────────────────────── décalques ─────────────────────────────

  /**
   * Décalque au sol. Un décalque voisin du même type (dans `merge` mètres) est agrandi au lieu d'être
   * doublé. La normale suit la pente du terrain. Retourne l'indice dans la file.
   */
  groundDecal(
    tile: number, x: number, z: number, size: number, r: number, g: number, b: number, a: number,
    life = Infinity, merge = 0, maxSize = size, mode: number = DECAL_ALPHA,
  ): number {
    const q = this.queue;
    const y = this.ground(x, z);
    if (merge > 0) {
      const near = q.findNear(tile, x, y, z, merge, this.time);
      if (near >= 0) {
        q.refresh(near, size, maxSize, a, this.time);
        return near;
      }
    }
    // pente : deux différences finies sur un mètre
    const hx = this.ground(x + 0.5, z) - this.ground(x - 0.5, z);
    const hz = this.ground(x, z + 0.5) - this.ground(x, z - 0.5);
    let nx = -hx;
    let ny = 1;
    let nz = -hz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= l; ny /= l; nz /= l;
    return q.add(tile, mode, x, y, z, nx, ny, nz, size, this.rng.next() * TAU, r, g, b, a, this.time, life);
  }

  /** Décalque sur une façade (normale horizontale). */
  wallDecal(
    tile: number, w: WallHit, size: number, r: number, g: number, b: number, a: number, rot = 0, life = Infinity,
  ): number {
    return this.queue.add(tile, DECAL_ALPHA, w.x, w.y, w.z, w.nx, 0, w.nz, size, rot, r, g, b, a, this.time, life);
  }

  /**
   * Cherche une façade au contact du point (vitrine proche d'abord, puis mur du décor). Écrit le
   * point projeté et la normale sortante dans `out`. Retourne false s'il n'y a pas de mur.
   */
  findWall(x: number, y: number, z: number, out: WallHit): boolean {
    const ctx = this.ctx;
    const gy = this.ground(x, z);
    // 1. vitrine : la façade est connue exactement (milieu, cap de la normale, largeur)
    const n = ctx.props.shopsNear(x, z, 2.5, this.shops);
    let bestD = 0.9;
    let found = false;
    for (let i = 0; i < n; i++) {
      const s = this.shops[i]!;
      const nx = Math.sin(s.heading);
      const nz = Math.cos(s.heading);
      const dx = x - s.x;
      const dz = z - s.z;
      const off = dx * nx + dz * nz;          // distance au plan de la façade
      const along = dx * nz - dz * nx;        // position le long de la vitrine
      const d = Math.abs(off);
      if (d < bestD && Math.abs(along) < s.width * 0.5 + 0.6) {
        bestD = d;
        out.x = x - nx * off;
        out.z = z - nz * off;
        out.y = y;
        out.nx = nx;
        out.nz = nz;
        found = true;
      }
    }
    if (found) return true;
    // 2. mur du décor : huit rayons courts tirés VERS le point depuis l'extérieur
    const hit = this.hit;
    let best = 1.3;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS8[k * 2]!;
      const dz = DIRS8[k * 2 + 1]!;
      const ax = x + dx * 1.1;
      const az = z + dz * 1.1;
      if (ctx.world.buildingHeightAt(ax, az) > 0) continue;
      hit.hit = false;
      if (!ctx.world.raycast(ax, az, x - dx * 0.5, z - dz * 0.5, hit) || !hit.hit) continue;
      const ddx = hit.x - x;
      const ddz = hit.z - z;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d >= best) continue;
      if (hit.height > 0 && y - gy > hit.height) continue;
      const nl = Math.sqrt(hit.nx * hit.nx + hit.nz * hit.nz);
      if (nl < 1e-6) continue;
      best = d;
      out.x = hit.x;
      out.z = hit.z;
      out.y = y;
      out.nx = hit.nx / nl;
      out.nz = hit.nz / nl;
      found = true;
    }
    return found;
  }

  /** Remise à zéro complète. */
  clear(): void {
    this.pool.clear();
    this.queue.clear();
    this.lights.reset();
  }
}
