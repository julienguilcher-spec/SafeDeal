/* =====================================================================================
 * Effets visuels — jets d'eau (canon à eau, lance des pompiers, extincteur à eau).
 *
 * La simulation annonce un jet par l'événement fx 'jet_eau' : buse (x, y, z), direction,
 * portée horizontale (size), durée de validité (seconds), répété tant que la détente est tenue.
 * Chaque jet devient un émetteur : un flot continu de gouttes balistiques étirées par leur
 * vitesse, lancées à la vitesse qui fait retomber l'arc exactement à la portée annoncée. La
 * colonne d'eau en arc, sa courbure et sa retombée viennent donc de la physique des gouttes.
 * Embruns le long du jet ; éclaboussures et flaques à l'impact (événement 'eclaboussure').
 * ===================================================================================== */

import { TILE_MIST, TILE_STREAK } from './atlas';
import type { FxCore } from './core';
import { F_FADE_IN, F_HOLD, F_SHRINK, F_STREAK, KIND_ALPHA, MODE_AXIS, NO_FLOOR, PRIO_LOW } from './pool';

const MAX_JETS = 8;
const GRAVITY = 9.81;

/**
 * Vitesse de sortie (m/s) qui fait retomber un jet à la distance horizontale `reach` quand il part
 * avec le site `pitch` (rad) d'une hauteur `drop` au-dessus du point de chute. Bornée à [6, 60].
 * Si le jet est arrêté en montée (mur proche), la vitesse nominale `fallback` est retournée.
 */
export function jetSpeedFor(reach: number, pitch: number, drop: number, fallback = 26): number {
  const c = Math.cos(pitch);
  const denom = 2 * c * c * (drop + reach * Math.tan(pitch));
  if (!(denom > 1e-3) || !(reach > 0.2)) return fallback;
  const v = Math.sqrt((GRAVITY * reach * reach) / denom);
  return v < 6 ? 6 : v > 60 ? 60 : v;
}

class Jet {
  ttl = 0;
  x = 0; y = 0; z = 0;
  dx = 0; dy = 0; dz = 1;
  reach = 10;
  speed = 26;
  /** Temps de vol jusqu'à la portée (s). */
  flight = 1;
  acc = 0;
  mistAcc = 0;
  /** Demi-ouverture du jet (rad). */
  spread = 0.02;
}

export class WaterRenderer {
  /** Jets actifs à la dernière image. */
  active = 0;
  private readonly jets: Jet[] = [];

  constructor(private readonly core: FxCore) {
    for (let i = 0; i < MAX_JETS; i++) this.jets.push(new Jet());
  }

  clear(): void {
    for (const j of this.jets) j.ttl = 0;
    this.active = 0;
  }

  /** Événement 'jet_eau' : crée ou prolonge un jet. */
  onJet(x: number, y: number, z: number, dx: number, dy: number, dz: number, reach: number, seconds: number): void {
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl < 1e-4 || !(reach > 0)) return;
    // même buse (à moins de 2 m) : le jet est prolongé ; sinon on prend l'émetteur le plus proche de sa fin
    let jet: Jet | null = null;
    let weakest = this.jets[0]!;
    for (let i = 0; i < MAX_JETS; i++) {
      const j = this.jets[i]!;
      if (j.ttl > 0) {
        const ex = j.x - x, ey = j.y - y, ez = j.z - z;
        if (ex * ex + ey * ey + ez * ez < 4) {
          jet = j;
          break;
        }
      }
      if (j.ttl < weakest.ttl) weakest = j;
    }
    if (!jet) {
      jet = weakest;
      jet.acc = 0;
      jet.mistAcc = 0;
    }
    const core = this.core;
    jet.x = x; jet.y = y; jet.z = z;
    jet.dx = dx / dl; jet.dy = dy / dl; jet.dz = dz / dl;
    jet.reach = reach;
    const pitch = Math.asin(jet.dy < -1 ? -1 : jet.dy > 1 ? 1 : jet.dy);
    const hx = Math.sqrt(jet.dx * jet.dx + jet.dz * jet.dz);
    const ix = x + (hx > 1e-4 ? jet.dx / hx : 0) * reach;
    const iz = z + (hx > 1e-4 ? jet.dz / hx : 0) * reach;
    const drop = y - core.ground(ix, iz);
    // petit jet (extincteur, lance tenue à la main) : plus lent, plus ouvert
    const small = reach < 9;
    jet.speed = jetSpeedFor(reach, pitch, drop, small ? 12 : 26);
    const vh = jet.speed * Math.cos(pitch);
    jet.flight = vh > 0.5 ? reach / vh : 1;
    if (jet.flight > 4) jet.flight = 4;
    jet.spread = small ? 0.06 : 0.022;
    // la validité annoncée est courte (0,15 s) : on garde une marge pour ne pas hacher le jet
    jet.ttl = Math.max(jet.ttl, seconds + 0.12);
  }

  update(): void {
    const core = this.core;
    const dt = core.dt;
    const rng = core.rng;
    const p = core.pool;
    const e = core.budget.emission;
    // débit de gouttes : assez pour que les traits se recouvrent sur tout l'arc
    const rate = 18 + 30 * e;
    const stretchT = e < 0.5 ? 0.12 : 0.075;
    let active = 0;
    for (let k = 0; k < MAX_JETS; k++) {
      const j = this.jets[k]!;
      if (j.ttl <= 0) continue;
      j.ttl -= dt;
      active++;
      const dist = core.camDist(j.x, j.z);
      if (dist > core.view.drawDistance) continue;
      const far = dist > 90 ? 0.5 : 1;
      const big = j.reach >= 9;
      // âme du jet : chaîne de tronçons le long de la parabole, serrée à la buse, évasée à l'arrivée
      {
        const sp = core.sprites;
        const segs = e < 0.5 ? 9 : 16;
        const fade = j.ttl < 0.1 ? j.ttl / 0.1 : 1;
        const v = j.speed;
        let px = j.x, py = j.y, pz = j.z;
        for (let s = 1; s <= segs; s++) {
          const k = s / segs;
          const t = k * j.flight;
          const wob = Math.sin(core.time * 13 + s * 1.7 + k * 5) * 0.05 * k;
          const qx = j.x + j.dx * v * t;
          const qy = j.y + j.dy * v * t - 0.5 * GRAVITY * t * t + wob;
          const qz = j.z + j.dz * v * t;
          const w = big ? 0.3 + 1.05 * k * Math.sqrt(k) : 0.1 + 0.3 * k;
          const mx = (px + qx) * 0.5, my = (py + qy) * 0.5, mz = (pz + qz) * 0.5;
          const ax = (qx - px) * 1.3, ay = (qy - py) * 1.3, az = (qz - pz) * 1.3;
          // cœur dense et blanc, gaine d'écume plus large et plus légère
          sp.push(mx, my, mz, w, ax, ay, az, 0, 1.15, 1.2, 1.26, (0.95 - 0.45 * k) * fade, TILE_STREAK, KIND_ALPHA + 4 * MODE_AXIS, NO_FLOOR, 0);
          sp.push(mx, my - 0.05 * k, mz, w * 2.1, ax, ay, az, 0, 1.05, 1.1, 1.16, (0.5 - 0.1 * k) * fade, TILE_STREAK, KIND_ALPHA + 4 * MODE_AXIS, NO_FLOOR, 0);
          px = qx; py = qy; pz = qz;
        }
      }
      j.acc += rate * far * dt;
      while (j.acc >= 1) {
        j.acc -= 1;
        const idx = p.spawn(PRIO_LOW);
        if (idx < 0) { j.acc = 0; break; }
        // gouttes réparties sur l'intervalle de l'image : pas de paquets
        const pre = rng.next() * dt;
        const v = j.speed * (0.96 + 0.08 * rng.next());
        const sx = j.dx + rng.signed() * j.spread;
        const sy = j.dy + rng.signed() * j.spread;
        const sz = j.dz + rng.signed() * j.spread;
        const vx = sx * v, vy = sy * v, vz = sz * v;
        p.x[idx] = j.x + vx * pre; p.y[idx] = j.y + vy * pre; p.z[idx] = j.z + vz * pre;
        p.vx[idx] = vx; p.vy[idx] = vy; p.vz[idx] = vz;
        // le trait s'élargit avec la distance : colonne serrée à la buse, gerbe à l'arrivée
        p.s0[idx] = big ? 0.2 : 0.09; p.s1[idx] = big ? 0.75 : 0.3;
        p.life[idx] = j.flight * (0.97 + 0.08 * rng.next());
        const w = 0.82 + 0.18 * rng.next();
        p.r[idx] = 1.05 * w; p.g[idx] = 1.12 * w; p.b[idx] = 1.2 * w; p.a[idx] = big ? 0.6 : 0.5;
        p.grav[idx] = 1;
        p.stretch[idx] = stretchT;
        p.tile[idx] = TILE_STREAK;
        p.kind[idx] = KIND_ALPHA;
        p.flags[idx] = F_STREAK | F_HOLD | F_SHRINK;
      }
      // embruns : voile blanc qui se détache du jet et dérive
      j.mistAcc += (big ? 15 : 5) * e * far * dt;
      while (j.mistAcc >= 1) {
        j.mistAcc -= 1;
        const t = rng.next() * j.flight;
        const v = j.speed;
        const mx = j.x + j.dx * v * t;
        const my = j.y + j.dy * v * t - 0.5 * GRAVITY * t * t;
        const mz = j.z + j.dz * v * t;
        const idx = core.puff(
          PRIO_LOW, mx, my, mz, j.dx * v * 0.25, (j.dy * v - GRAVITY * t) * 0.2, j.dz * v * 0.25,
          0.5 + t * 0.6, 1.8 + t * 1.8, 0.8 + rng.next() * 0.7, 0.95, 0.97, 1.0, 0.26, TILE_MIST,
        );
        if (idx >= 0) {
          p.drag[idx] = 2;
          p.grav[idx] = 0.05;
          p.floorY[idx] = NO_FLOOR;
          p.flags[idx] = F_FADE_IN;
        }
      }
    }
    this.active = active;
  }
}
