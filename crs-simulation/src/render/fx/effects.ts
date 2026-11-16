/* =====================================================================================
 * Effets visuels — recettes des effets ponctuels : une par FxId du contrat, plus les
 * réactions aux événements 'explosion' et 'projectile:impact'.
 *
 * Chaque recette pose quelques particules (nombre réglé par le budget de qualité), parfois
 * un décalque et un éclair. Aucune ne garde d'état : tout vit dans la réserve de particules.
 * ===================================================================================== */

import {
  TILE_CHUNK, TILE_DOT, TILE_DROP, TILE_DUST, TILE_FLASH, TILE_MIST, TILE_PUFF, TILE_RING, TILE_SHARD, TILE_SPLASH,
  TILE_STAR, TILE_STREAK,
} from './atlas';
import { scaledCount } from './budget';
import type { FxCore, WallHit } from './core';
import {
  DTILE_ASPHALT, DTILE_CHIP, DTILE_DEBRIS, DTILE_GLASS, DTILE_PUDDLE, DTILE_SCORCH, DTILE_SPLAT, DTILE_TAG,
} from './decalAtlas';
import { DECAL_PUDDLE } from './decalQueue';
import { shakeFor, shakeSeconds } from './density';
import { TAU, linB, linG, linR } from './mathx';
import {
  F_FADE_IN, F_FLASH, F_HOLD, F_STREAK, F_TURB, KIND_ALPHA, KIND_FLAME, KIND_GLOW, NO_FLOOR, PRIO_HIGH, PRIO_LOW, PRIO_MID,
} from './pool';

const GAS_R = 0.8, GAS_G = 0.81, GAS_B = 0.78;
const DUST_R = 0.4, DUST_G = 0.36, DUST_B = 0.31;

export class Effects {
  private readonly wall: WallHit = { x: 0, y: 0, z: 0, nx: 0, nz: 1 };
  /** Effets d'impact déjà joués dans l'image (plafonnés : une salve ne doit pas saturer). */
  impactsThisFrame = 0;

  constructor(private readonly core: FxCore) {}

  // ───────────────────────────── gaz, fumée, poudre ─────────────────────────────

  /** Bouffée de gaz lacrymogène : gerbe ronde, ou cône si une direction est donnée (aérosol). */
  gas(x: number, y: number, z: number, size: number, seconds: number, dx: number, dy: number, dz: number): void {
    this.cloud(x, y, z, size, seconds, dx, dy, dz, GAS_R, GAS_G, GAS_B, 0.5, TILE_PUFF);
  }

  smoke(x: number, y: number, z: number, size: number, color: number, seconds: number, dx: number, dy: number, dz: number): void {
    let r = 0.2, g = 0.2, b = 0.21;
    if (color >= 0) {
      r = Math.max(0.02, linR(color)); g = Math.max(0.02, linG(color)); b = Math.max(0.02, linB(color));
    }
    this.cloud(x, y, z, size, seconds, dx, dy, dz, r, g, b, 0.55, TILE_PUFF);
  }

  /** Poudre d'extincteur : nuage blanc très clair, projeté dans l'axe. */
  powder(x: number, y: number, z: number, size: number, color: number, seconds: number, dx: number, dy: number, dz: number): void {
    let r = 0.86, g = 0.86, b = 0.84;
    if (color >= 0) { r = linR(color); g = linG(color); b = linB(color); }
    this.cloud(x, y, z, size, seconds, dx, dy, dz, r, g, b, 0.6, TILE_MIST);
  }

  private cloud(
    x: number, y: number, z: number, size: number, seconds: number, dx: number, dy: number, dz: number,
    r: number, g: number, b: number, alpha: number, tile: number,
  ): void {
    const core = this.core;
    const rng = core.rng;
    const e = core.budget.emission;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl > 1e-3) {
      // cône : `size` est la portée du jet
      const n = scaledCount(7, e, 3);
      const sp = size / Math.max(0.25, seconds);
      for (let i = 0; i < n; i++) {
        const k = (i + rng.next()) / n;
        const v = sp * (0.45 + 0.75 * k);
        const j = 0.16;
        const idx = core.puff(
          PRIO_MID, x + (dx / dl) * 0.2, y + (dy / dl) * 0.2, z + (dz / dl) * 0.2,
          (dx / dl + rng.signed() * j) * v, (dy / dl + rng.signed() * j) * v, (dz / dl + rng.signed() * j) * v,
          0.25, size * (0.28 + 0.3 * rng.next()), seconds + 0.6 + rng.next() * 0.8, r, g, b, alpha * 0.8,
          tile === TILE_PUFF ? TILE_PUFF + rng.int(4) : tile,
        );
        if (idx >= 0) {
          core.pool.drag[idx] = 2.2;
          core.pool.wind[idx] = 0.5;
        }
      }
      return;
    }
    // gerbe ronde : `size` est le rayon atteint
    const n = scaledCount(7, e, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = (size / Math.max(0.6, seconds)) * (0.5 + 0.7 * rng.next());
      const idx = core.puff(
        PRIO_MID, x + Math.cos(a) * 0.2, y + 0.2 + rng.next() * 0.5, z + Math.sin(a) * 0.2,
        Math.cos(a) * v, 0.4 + rng.next() * 0.9, Math.sin(a) * v,
        size * 0.3, size * (0.9 + 0.7 * rng.next()), seconds + 1.2 + rng.next() * 1.4, r, g, b, alpha,
        tile === TILE_PUFF ? TILE_PUFF + rng.int(4) : tile,
      );
      if (idx >= 0) core.pool.drag[idx] = 1.5;
    }
  }

  /** Poussière soulevée. */
  dust(x: number, y: number, z: number, size: number): void {
    const core = this.core;
    const rng = core.rng;
    const n = scaledCount(4, core.budget.emission, 2);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = 0.6 + rng.next() * 1.4;
      const idx = core.puff(
        PRIO_LOW, x, y + 0.1, z, Math.cos(a) * v * size, 0.3 + rng.next() * 0.6, Math.sin(a) * v * size,
        size * 0.4, size * (1.4 + rng.next()), 1.1 + rng.next() * 1.1, DUST_R, DUST_G, DUST_B, 0.42, TILE_DUST,
      );
      if (idx >= 0) core.pool.drag[idx] = 1.8;
    }
  }

  // ───────────────────────────── feu, étincelles, éclairs ─────────────────────────────

  /** Embrasement bref : boule de flammes qui monte et s'éteint (départ de feu, sursaut d'un brasier). */
  fireBurst(x: number, y: number, z: number, size: number, seconds: number): void {
    const core = this.core;
    const rng = core.rng;
    const p = core.pool;
    const n = scaledCount(4 + size * 2.5, core.budget.emission, 2);
    const life = Math.min(1.3, Math.max(0.35, seconds * 0.6));
    for (let i = 0; i < n; i++) {
      const idx = p.spawn(PRIO_MID);
      if (idx < 0) break;
      const a = rng.next() * TAU;
      const rr = Math.sqrt(rng.next()) * size * 0.45;
      p.x[idx] = x + Math.cos(a) * rr; p.y[idx] = y + rng.next() * 0.2; p.z[idx] = z + Math.sin(a) * rr;
      p.vx[idx] = Math.cos(a) * 0.6; p.vy[idx] = 1.2 + rng.next() * 1.6; p.vz[idx] = Math.sin(a) * 0.6;
      p.s0[idx] = 0.5 + size * 0.35; p.s1[idx] = 0.9 + size * 0.55;
      p.life[idx] = life * (0.7 + 0.6 * rng.next());
      p.a[idx] = 1.25;
      p.drag[idx] = 1.2;
      p.kind[idx] = KIND_FLAME;
      p.flags[idx] = F_FADE_IN;
    }
    core.lights.flash(x, y + 0.6, z, 0xff7a1c, 60 + size * 40, 6 + size * 3, Math.min(1, seconds * 0.5 + 0.2));
    this.sparks(x, y + 0.2, z, size * 0.5, -1, 0);
  }

  /** Gerbe d'étincelles. `color` < 0 : incandescence orangée. */
  sparks(x: number, y: number, z: number, size: number, color: number, seconds: number): void {
    const core = this.core;
    const rng = core.rng;
    let r = 1.0, g = 0.62, b = 0.2;
    if (color >= 0) { r = linR(color); g = linG(color); b = linB(color); }
    const n = scaledCount(6 + size * 7, core.budget.emission, 3);
    const speed = 2.5 + 3.5 * Math.sqrt(size);
    const life = seconds > 0 ? seconds : 0.7;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const up = rng.next();
      const v = speed * (0.4 + 0.8 * rng.next());
      const ch = Math.sqrt(1 - up * up * 0.7);
      core.spark(PRIO_MID, x, y, z, Math.cos(a) * ch * v, up * v * 0.9 + 0.6, Math.sin(a) * ch * v, 0.045, life * (0.5 + 0.8 * rng.next()), r, g, b, 4.2);
    }
    core.glow(PRIO_MID, x, y, z, 0.3 + size * 0.5, 0.2, 0.1, r, g, b, 2.6, TILE_DOT, F_FLASH);
  }

  /** Éclair bref (détonation, tir). */
  flash(x: number, y: number, z: number, size: number, color: number, seconds: number): void {
    const core = this.core;
    const hex = color >= 0 ? color : 0xfff2d8;
    const r = linR(hex), g = linG(hex), b = linB(hex);
    const life = Math.max(0.06, seconds > 0 ? seconds * 1.3 : 0.12);
    core.glow(PRIO_HIGH, x, y, z, size * 1.4, size * 2.4, life, r, g, b, 7, TILE_FLASH, F_FLASH);
    core.glow(PRIO_HIGH, x, y, z, size * 0.9, size * 0.5, life * 1.3, r, g, b, 5, TILE_DOT, F_FLASH);
    core.lights.flash(x, y, z, hex, 180 * size * size, 8 + size * 9, Math.max(0.1, life));
  }

  /** Explosion : éclair, boule de feu, boule de poussière, fumée, éclats, onde au sol, bitume noirci. */
  explosion(x: number, y: number, z: number, size: number): void {
    const core = this.core;
    const rng = core.rng;
    const p = core.pool;
    const e = core.budget.emission;
    const gy = core.ground(x, z);
    const s = size > 0.3 ? size : 0.3;
    // éclair et lumière
    core.glow(PRIO_HIGH, x, y + 0.3, z, s * 2.2, s * 4.2, 0.13, 1, 0.9, 0.7, 9, TILE_FLASH, F_FLASH);
    core.glow(PRIO_HIGH, x, y + 0.3, z, s * 1.6, s * 1.0, 0.22, 1, 0.75, 0.4, 6, TILE_DOT, F_FLASH);
    core.lights.flash(x, y + 0.6, z, 0xffc070, 320 * s, 10 + s * 8, 0.28);
    // boule de feu : volutes incandescentes qui gonflent et s'éteignent
    const nf = scaledCount(4 + s * 1.5, e, 2);
    for (let i = 0; i < nf; i++) {
      const a = rng.next() * TAU;
      const idx = core.glow(
        PRIO_HIGH, x + Math.cos(a) * s * 0.3, y + 0.2 + rng.next() * s * 0.5, z + Math.sin(a) * s * 0.3,
        s * 0.8, s * (1.5 + rng.next() * 0.6), 0.3 + rng.next() * 0.25, 1, 0.42 + rng.next() * 0.2, 0.08, 2.6, TILE_PUFF + rng.int(4), F_FLASH,
      );
      if (idx >= 0) {
        p.vx[idx] = Math.cos(a) * s * 1.2; p.vy[idx] = 1.5 + rng.next() * s * 1.5; p.vz[idx] = Math.sin(a) * s * 1.2;
        p.drag[idx] = 2.5;
        p.rot[idx] = rng.next() * TAU;
      }
    }
    // boule de poussière qui s'étale au sol
    const nd = scaledCount(7 + s * 2, e, 3);
    for (let i = 0; i < nd; i++) {
      const a = (i / nd) * TAU + rng.next() * 0.5;
      const v = s * (2.2 + rng.next() * 2.2);
      const idx = core.puff(
        PRIO_HIGH, x + Math.cos(a) * s * 0.3, gy + 0.3 + rng.next() * 0.5, z + Math.sin(a) * s * 0.3,
        Math.cos(a) * v, 0.5 + rng.next() * 1.5, Math.sin(a) * v,
        s * 0.7, s * (1.8 + rng.next() * 1.2), 1.6 + rng.next() * 1.6, DUST_R, DUST_G, DUST_B, 0.55, TILE_DUST,
      );
      if (idx >= 0) p.drag[idx] = 2.2;
    }
    // champignon de fumée sombre
    const ns = scaledCount(3 + s, e, 2);
    for (let i = 0; i < ns; i++) {
      const idx = core.puff(
        PRIO_HIGH, x + rng.signed() * s * 0.3, y + 0.4 + rng.next() * s * 0.5, z + rng.signed() * s * 0.3,
        rng.signed() * 0.6, 1.8 + rng.next() * 1.8, rng.signed() * 0.6,
        s * 0.8, s * (2 + rng.next()), 2.4 + rng.next() * 2, 0.07, 0.065, 0.06, 0.7,
      );
      if (idx >= 0) { p.drag[idx] = 0.7; p.grav[idx] = -0.05; p.floorY[idx] = NO_FLOOR; p.flags[idx] = F_TURB | F_FADE_IN; }
    }
    // éclats et étincelles
    const nc = scaledCount(5 + s * 3, e, 2);
    for (let i = 0; i < nc; i++) {
      const a = rng.next() * TAU;
      const v = 3 + rng.next() * 5 * Math.sqrt(s);
      core.chunk(
        PRIO_MID, x, gy + 0.2, z, Math.cos(a) * v, 2 + rng.next() * 5, Math.sin(a) * v,
        0.06 + rng.next() * 0.1, 1.6 + rng.next() * 1.4, 0.13, 0.12, 0.11, 1, TILE_CHUNK,
      );
    }
    this.sparks(x, y + 0.2, z, s, -1, 0.6);
    this.ring(x, gy + 0.08, z, s * 3.2, 0.28, 0.9, 0.85, 0.75, 0.9);
    core.groundDecal(DTILE_SCORCH + rng.int(2), x, z, s * 1.9, 1, 1, 1, 0.9, Infinity, s * 0.5, s * 2.6);
  }

  /** Onde au sol : anneau qui s'élargit vite et s'éteint. */
  ring(x: number, y: number, z: number, size: number, life: number, r: number, g: number, b: number, intensity: number): void {
    const core = this.core;
    const p = core.pool;
    const idx = p.spawn(PRIO_HIGH);
    if (idx < 0) return;
    p.x[idx] = x; p.y[idx] = y; p.z[idx] = z;
    p.s0[idx] = size * 0.25; p.s1[idx] = size * 2;
    p.life[idx] = life;
    p.r[idx] = r; p.g[idx] = g; p.b[idx] = b; p.a[idx] = intensity;
    p.tile[idx] = TILE_RING;
    p.kind[idx] = KIND_GLOW;
    // drapeau interne : stretch < 0 signale un quad à plat (voir la conversion en quads)
    p.stretch[idx] = -1;
    p.flags[idx] = F_FLASH;
  }

  /** Trait lumineux d'un tir tendu. */
  tracer(x: number, y: number, z: number, dx: number, dy: number, dz: number, size: number, color: number, seconds: number): void {
    const core = this.core;
    const p = core.pool;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl < 1e-4) return;
    const life = seconds > 0 ? seconds : 0.15;
    const v = size / life;
    const idx = p.spawn(PRIO_MID);
    if (idx < 0) return;
    let r = 1.0, g = 0.85, b = 0.6;
    if (color >= 0) { r = linR(color); g = linG(color); b = linB(color); }
    p.x[idx] = x; p.y[idx] = y; p.z[idx] = z;
    p.vx[idx] = (dx / dl) * v; p.vy[idx] = (dy / dl) * v; p.vz[idx] = (dz / dl) * v;
    p.s0[idx] = 0.07; p.s1[idx] = 0.05;
    p.life[idx] = life;
    p.r[idx] = r; p.g[idx] = g; p.b[idx] = b; p.a[idx] = 3;
    p.stretch[idx] = 0.035;
    p.tile[idx] = TILE_STREAK;
    p.kind[idx] = KIND_GLOW;
    p.flags[idx] = F_STREAK | F_HOLD;
  }

  /**
   * Artifice. Durée courte : bouquet d'étoiles colorées (mortier). Durée ≥ 3 s : étoile qui
   * reste suspendue et éclaire (fusée rouge de sommation).
   */
  firework(x: number, y: number, z: number, size: number, color: number, seconds: number): void {
    const core = this.core;
    const rng = core.rng;
    const p = core.pool;
    const hex = color > 0 ? color : 0xffffff;
    const r = linR(hex), g = linG(hex), b = linB(hex);
    if (seconds >= 3) {
      // étoile suspendue : cœur blanc, halo coloré, lente descente, fumée qui traîne
      for (let k = 0; k < 3; k++) {
        const idx = core.glow(
          PRIO_HIGH, x, y, z, k === 0 ? size * 0.5 : k === 1 ? size * 1.6 : size * 4.5, k === 0 ? size * 0.35 : k === 1 ? size * 1.2 : size * 3.5,
          seconds, k === 0 ? 1 : r, k === 0 ? 0.9 : g, k === 0 ? 0.85 : b, k === 0 ? 9 : k === 1 ? 4.5 : 1.3, k === 1 ? TILE_FLASH : TILE_DOT, F_HOLD,
        );
        if (idx >= 0) { p.vy[idx] = -1.6; p.wind[idx] = 0.25; p.spin[idx] = k === 1 ? 0.8 : 0; }
      }
      this.flare.active = true;
      this.flare.x = x; this.flare.y = y; this.flare.z = z;
      this.flare.hex = hex;
      this.flare.life = seconds;
      this.flare.total = seconds;
      return;
    }
    // bouquet
    const n = scaledCount(46 + size * 6, core.budget.emission, 14);
    const life = seconds > 0 ? seconds : 1.2;
    const speed = size * 3.6;
    for (let i = 0; i < n; i++) {
      // direction uniforme sur la sphère
      const u = rng.signed();
      const a = rng.next() * TAU;
      const h = Math.sqrt(1 - u * u);
      const v = speed * (0.55 + 0.6 * rng.next());
      const idx = p.spawn(PRIO_HIGH);
      if (idx < 0) break;
      p.x[idx] = x; p.y[idx] = y; p.z[idx] = z;
      p.vx[idx] = Math.cos(a) * h * v; p.vy[idx] = u * v + 1; p.vz[idx] = Math.sin(a) * h * v;
      p.s0[idx] = 0.3; p.s1[idx] = 0.12;
      p.life[idx] = life * (0.7 + 0.6 * rng.next());
      p.r[idx] = r; p.g[idx] = g; p.b[idx] = b; p.a[idx] = 4.5;
      p.drag[idx] = 2.4;
      p.grav[idx] = 0.22;
      p.stretch[idx] = 0.07;
      p.tile[idx] = i % 3 === 0 ? TILE_STAR : TILE_STREAK;
      p.kind[idx] = KIND_GLOW;
      p.flags[idx] = i % 3 === 0 ? F_HOLD : F_STREAK | F_HOLD;
    }
    core.glow(PRIO_HIGH, x, y, z, size * 1.3, size * 2.6, 0.16, 1, 0.95, 0.85, 8, TILE_FLASH, F_FLASH);
    core.glow(PRIO_HIGH, x, y, z, size * 2.5, size * 4, life * 0.7, r, g, b, 1.6, TILE_DOT, F_FLASH);
    core.lights.flash(x, y, z, hex, 260 * size, 14 + size * 6, Math.max(0.3, life * 0.7));
    // fumée de la détonation
    const ns = scaledCount(3, core.budget.emission, 1);
    for (let i = 0; i < ns; i++) {
      const idx = core.puff(PRIO_MID, x + rng.signed() * 0.4, y + rng.signed() * 0.4, z + rng.signed() * 0.4, rng.signed(), 0.4, rng.signed(), 0.6, size * 0.9, 1.8 + rng.next(), 0.5, 0.5, 0.5, 0.35);
      if (idx >= 0) p.floorY[idx] = NO_FLOOR;
    }
  }

  /** Fusée de sommation suspendue : son éclairage est entretenu par le système (voir updateFlare). */
  readonly flare = { active: false, x: 0, y: 0, z: 0, hex: 0xff2a1a, life: 0, total: 0 };

  // ───────────────────────────── matière : verre, débris, peinture, sang ─────────────────────────────

  glass(x: number, y: number, z: number, size: number): void {
    const core = this.core;
    const rng = core.rng;
    const n = scaledCount(9 + size * 9, core.budget.emission, 4);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = 1 + rng.next() * 2.6 * Math.sqrt(size);
      const lum = 0.9 + rng.next() * 0.9;
      core.chunk(
        PRIO_MID, x + rng.signed() * size * 0.3, y + rng.signed() * 0.3, z + rng.signed() * size * 0.3,
        Math.cos(a) * v, 0.5 + rng.next() * 2.2, Math.sin(a) * v, 0.05 + rng.next() * 0.09, 1.4 + rng.next() * 1.2,
        0.62 * lum, 0.78 * lum, 0.85 * lum, 0.85, TILE_SHARD,
      );
    }
    // scintillement
    core.glow(PRIO_MID, x, y, z, 0.25 + size * 0.3, 0.1, 0.12, 0.8, 0.92, 1, 1.6, TILE_STAR, F_FLASH);
    core.groundDecal(DTILE_GLASS + rng.int(2), x, z, 0.9 + size * 1.5, 1, 1, 1, 0.9, Infinity, 0.5, 1.2 + size * 2);
  }

  debris(x: number, y: number, z: number, size: number): void {
    const core = this.core;
    const rng = core.rng;
    const n = scaledCount(6 + size * 5, core.budget.emission, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = 1.5 + rng.next() * 3 * Math.sqrt(size);
      const sh = 0.1 + rng.next() * 0.12;
      core.chunk(
        PRIO_MID, x, y, z, Math.cos(a) * v, 1.5 + rng.next() * 3, Math.sin(a) * v, 0.07 + rng.next() * 0.12 * Math.sqrt(size),
        1.8 + rng.next() * 1.6, sh, sh * 0.92, sh * 0.82, 1, TILE_CHUNK,
      );
    }
    this.dust(x, y, z, size * 0.8);
    core.groundDecal(DTILE_DEBRIS, x, z, 1 + size * 1.3, 1, 1, 1, 0.85, Infinity, 0.6, 1.5 + size * 2);
  }

  /** Peinture : gouttes projetées et tache sur le mur voisin, à défaut au sol. */
  paint(x: number, y: number, z: number, size: number, color: number): void {
    const core = this.core;
    const rng = core.rng;
    const hex = color >= 0 ? color : 0xd9382e;
    const r = linR(hex), g = linG(hex), b = linB(hex);
    const n = scaledCount(7, core.budget.emission, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = 0.8 + rng.next() * 2;
      core.chunk(PRIO_LOW, x, y, z, Math.cos(a) * v, rng.next() * 2, Math.sin(a) * v, 0.04 + rng.next() * 0.05, 0.6 + rng.next() * 0.5, r, g, b, 0.95, TILE_DROP, false);
    }
    const s = 0.5 + size * 1.6;
    if (y - core.ground(x, z) > 0.35 && core.findWall(x, y, z, this.wall)) {
      core.wallDecal(DTILE_SPLAT + rng.int(2), this.wall, s, r, g, b, 0.95, rng.signed() * 0.6);
    } else {
      core.groundDecal(DTILE_SPLAT + rng.int(2), x, z, s, r, g, b, 0.95);
    }
  }

  /** Tag : inscription à la bombe sur la façade. */
  tag(x: number, y: number, z: number, size: number, color: number): void {
    const core = this.core;
    const rng = core.rng;
    const hex = color >= 0 ? color : 0x101010;
    const r = linR(hex), g = linG(hex), b = linB(hex);
    const s = 1.1 + size * 0.7;
    if (core.findWall(x, y, z, this.wall)) core.wallDecal(DTILE_TAG + rng.int(2), this.wall, s, r, g, b, 0.92, rng.signed() * 0.12);
    else core.groundDecal(DTILE_TAG + rng.int(2), x, z, s, r, g, b, 0.9);
    // brume de peinture
    const idx = core.puff(PRIO_LOW, x, y, z, 0, 0.1, 0, 0.2, 0.6, 0.6, Math.max(0.05, r), Math.max(0.05, g), Math.max(0.05, b), 0.3, TILE_MIST);
    if (idx >= 0) core.pool.floorY[idx] = NO_FLOOR;
  }

  /** Sang : seulement si le réglage de violence est « réaliste » (vérifié ici, pas par l'appelant). */
  blood(x: number, y: number, z: number, size: number, dx: number, dy: number, dz: number): void {
    const core = this.core;
    if (!core.blood) return;
    const rng = core.rng;
    const n = scaledCount(5, core.budget.emission, 2);
    for (let i = 0; i < n; i++) {
      const v = 1 + rng.next() * 2;
      core.chunk(
        PRIO_LOW, x, y, z, (dx + rng.signed() * 0.5) * v, (dy + rng.next() * 0.6) * v, (dz + rng.signed() * 0.5) * v,
        0.03 + rng.next() * 0.04, 0.5 + rng.next() * 0.4, 0.2, 0.01, 0.012, 0.9, TILE_DROP, false,
      );
    }
    core.groundDecal(DTILE_SPLAT + rng.int(2), x + dx * 0.4 + rng.signed() * 0.2, z + dz * 0.4 + rng.signed() * 0.2, 0.25 + size * 0.5, 0.16, 0.008, 0.01, 0.85, Infinity, 0.25, 0.9);
  }

  scorch(x: number, z: number, size: number): void {
    const core = this.core;
    const s = Math.max(0.6, size);
    if (s > 2.4) core.groundDecal(DTILE_ASPHALT, x, z, s * 1.25, 1, 1, 1, 0.85, Infinity, s * 0.5, s * 1.6);
    else core.groundDecal(DTILE_SCORCH + core.rng.int(2), x, z, s * 1.2, 1, 1, 1, 0.88, Infinity, s * 0.45, s * 1.6);
  }

  /** Choc : petite bouffée, quelques éclats ; étincelles sur le métal. */
  impact(x: number, y: number, z: number, size: number, metal: boolean): void {
    const core = this.core;
    if (this.impactsThisFrame++ > 10) return;
    const rng = core.rng;
    const idx = core.puff(PRIO_LOW, x, y, z, rng.signed() * 0.5, 0.4 + rng.next() * 0.5, rng.signed() * 0.5, size * 0.5, size * 2.2, 0.5 + rng.next() * 0.4, DUST_R, DUST_G, DUST_B, 0.4, TILE_DUST);
    if (idx >= 0) core.pool.floorY[idx] = NO_FLOOR;
    const n = scaledCount(3, core.budget.emission, 1);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = 1 + rng.next() * 2.5;
      if (metal) core.spark(PRIO_LOW, x, y, z, Math.cos(a) * v * 2, rng.next() * 3, Math.sin(a) * v * 2, 0.035, 0.25 + rng.next() * 0.3, 1, 0.75, 0.35, 3.2);
      else core.chunk(PRIO_LOW, x, y, z, Math.cos(a) * v, 0.5 + rng.next() * 2, Math.sin(a) * v, 0.03 + rng.next() * 0.04, 0.6 + rng.next() * 0.5, 0.3, 0.28, 0.25, 1, TILE_CHUNK);
    }
  }

  // ───────────────────────────── eau ─────────────────────────────

  /** Éclaboussure : gerbe de gouttes, voile d'embruns, flaque qui grandit. */
  splash(x: number, y: number, z: number, size: number): void {
    const core = this.core;
    const rng = core.rng;
    const p = core.pool;
    const gy = core.ground(x, z);
    const onGround = y - gy < 0.6;
    const n = scaledCount(9 + size * 6, core.budget.emission, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU;
      const v = (1.5 + rng.next() * 3.5) * Math.sqrt(size);
      const idx = p.spawn(PRIO_LOW);
      if (idx < 0) break;
      p.x[idx] = x + Math.cos(a) * size * 0.3; p.y[idx] = y + 0.1; p.z[idx] = z + Math.sin(a) * size * 0.3;
      p.vx[idx] = Math.cos(a) * v; p.vy[idx] = 2 + rng.next() * 4.5; p.vz[idx] = Math.sin(a) * v;
      p.s0[idx] = 0.09 + rng.next() * 0.08; p.s1[idx] = 0.06;
      p.life[idx] = 0.5 + rng.next() * 0.6;
      p.r[idx] = 1.05; p.g[idx] = 1.12; p.b[idx] = 1.2; p.a[idx] = 0.8;
      p.grav[idx] = 1;
      p.stretch[idx] = 0.05;
      p.tile[idx] = TILE_STREAK;
      p.kind[idx] = KIND_ALPHA;
      p.flags[idx] = F_STREAK | F_HOLD;
    }
    // couronne et embruns
    const idx = p.spawn(PRIO_LOW);
    if (idx >= 0) {
      p.x[idx] = x; p.y[idx] = y + 0.45 * size; p.z[idx] = z;
      p.vy[idx] = 1.2;
      p.s0[idx] = size * 1.0; p.s1[idx] = size * 3;
      p.life[idx] = 0.5;
      p.r[idx] = 1.1; p.g[idx] = 1.15; p.b[idx] = 1.22; p.a[idx] = 0.7;
      p.rot[idx] = rng.next() * TAU;
      p.tile[idx] = TILE_SPLASH;
      p.kind[idx] = KIND_ALPHA;
    }
    for (let k = 0; k < 2; k++) {
      const m = core.puff(PRIO_LOW, x + rng.signed() * size * 0.4, y + 0.4, z + rng.signed() * size * 0.4, rng.signed() * 1.2, 0.8 + rng.next() * 1.4, rng.signed() * 1.2, size * 0.9, size * 3, 1 + rng.next() * 0.9, 0.95, 0.97, 1.0, 0.34, TILE_MIST);
      if (m >= 0) p.drag[m] = 1.4;
    }
    if (onGround) {
      const wet = 60 + core.rain * 240;
      core.groundDecal(DTILE_PUDDLE, x, z, 1.2 + size * 1.2, 1, 1, 1, 0.8, wet, 1.2 + size * 0.6, 2.5 + size * 2.4, DECAL_PUDDLE);
    }
  }

  // ───────────────────────────── événements du contrat ─────────────────────────────

  /** Événement 'explosion' : secousse de caméra selon la distance, onde, bitume noirci. */
  onExplosion(kind: string, x: number, y: number, z: number, radius: number): void {
    const core = this.core;
    const dx = x - core.camX;
    const dy = y - core.camY;
    const dz = z - core.camZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const amount = shakeFor(kind, radius, dist);
    if (amount > 0.004) {
      try {
        core.view.shake(amount, shakeSeconds(amount));
      } catch { /* la vue ne doit pas faire échouer un effet */ }
    }
    const gy = core.ground(x, z);
    switch (kind) {
      case 'vehicule':
        // le module des véhicules demande déjà 'explosion' : on ajoute la colonne de fumée et les projections
        this.ring(x, gy + 0.08, z, radius * 2.2, 0.4, 1, 0.8, 0.5, 1.1);
        this.debris(x, gy + 0.6, z, 2.5);
        core.lights.flash(x, y + 1, z, 0xff8a30, 900, 40, 0.5);
        core.groundDecal(DTILE_ASPHALT, x, z, Math.max(4, radius * 1.2), 1, 1, 1, 0.9, Infinity, 2, 9);
        break;
      case 'gm2l':
        this.ring(x, gy + 0.08, z, radius * 1.4, 0.3, 1, 1, 1, 0.9);
        core.lights.flash(x, y + 0.5, z, 0xffffff, 700, 30, 0.2);
        break;
      case 'desencerclement':
        this.ring(x, gy + 0.08, z, radius * 1.6, 0.26, 1, 0.95, 0.85, 1);
        this.dust(x, gy, z, 1.6);
        core.lights.flash(x, y + 0.4, z, 0xfff0d0, 520, 24, 0.16);
        break;
      case 'grenade_lacrymo_main':
      case 'grenade_lacrymo_56':
        // ouverture de la grenade : petit éclat, les palets partent en fumant
        core.glow(PRIO_MID, x, y, z, 0.5, 1, 0.1, 1, 0.95, 0.85, 3, TILE_FLASH, F_FLASH);
        break;
      case 'molotov':
        core.groundDecal(DTILE_SCORCH + core.rng.int(2), x, z, Math.max(1.5, radius * 1.8), 1, 1, 1, 0.8, Infinity, 1, 3.5);
        break;
      default:
        break;
    }
  }

  /** Événement 'projectile:impact' : marque légère selon ce qui frappe et ce qui est frappé. */
  onImpact(kind: string, x: number, y: number, z: number, hitKind: string): void {
    const core = this.core;
    switch (kind) {
      case 'pave': case 'debris': case 'bouteille': case 'plot_caoutchouc': case 'lbd':
      case 'grenade_lacrymo_main': case 'grenade_lacrymo_56': case 'gm2l': case 'desencerclement': case 'palet_lacrymo':
      case 'fumigene': {
        const heavy = kind === 'pave' || kind === 'debris';
        this.impact(x, y, z, heavy ? 0.4 : 0.22, hitKind === 'vehicle');
        if (heavy && hitKind === 'ground' && core.rng.next() < 0.35) core.groundDecal(DTILE_CHIP, x, z, 0.35 + core.rng.next() * 0.2, 1, 1, 1, 0.8, Infinity, 0.3, 0.6);
        else if (heavy && hitKind === 'building' && core.rng.next() < 0.5 && core.findWall(x, y, z, this.wall)) {
          core.wallDecal(DTILE_CHIP, this.wall, 0.3 + core.rng.next() * 0.2, 1, 1, 1, 0.8, core.rng.next() * TAU);
        }
        break;
      }
      case 'balle':
        this.impact(x, y, z, 0.2, hitKind === 'vehicle' || hitKind === 'building');
        break;
      default:
        break;
    }
  }
}
