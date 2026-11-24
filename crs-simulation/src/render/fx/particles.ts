/* =====================================================================================
 * Effets visuels — conversion des particules libres en quads (boucle chaude : écriture
 * directe dans la zone de préparation de la couche de particules).
 * ===================================================================================== */

import {
  F_FLOORFADE, F_STREAK, MODE_AXIS, MODE_BILLBOARD, MODE_FLAT, NO_FLOOR, alphaCurve, sizeCurve,
} from './pool';
import type { ParticlePool } from './pool';
import { SPRITE_STRIDE } from './spriteLayer';
import type { SpriteLayer } from './spriteLayer';

/** Écrit toutes les particules vivantes ; retourne le nombre de quads ajoutés. */
export function writeParticles(pool: ParticlePool, sp: SpriteLayer): number {
  const n = pool.count;
  const stage = sp.stage;
  const depth = sp.depth;
  const cap = sp.capacity;
  let cnt = sp.count;
  const start = cnt;
  const camX = sp.camX, camY = sp.camY, camZ = sp.camZ;
  const fx = sp.fwdX, fy = sp.fwdY, fz = sp.fwdZ;
  const { x, y, z, vx, vy, vz, age, life, s0, s1, rot, r, g, b, a, floorY, stretch, seed, tile, kind, flags } = pool;
  for (let i = 0; i < n; i++) {
    if (cnt >= cap) {
      sp.overflow += n - i;
      break;
    }
    const f = flags[i]!;
    const t = age[i]! / life[i]!;
    const alpha = a[i]! * alphaCurve(t, f);
    if (alpha <= 0.003) continue;
    const size = sizeCurve(s0[i]!, s1[i]!, t, f);
    let px = x[i]!;
    let py = y[i]!;
    let pz = z[i]!;
    let ax = 0;
    let ay = 0;
    let az = 0;
    let mode = MODE_BILLBOARD;
    const st = stretch[i]!;
    if (f & F_STREAK) {
      // trait étiré par la vitesse, la tête à la position de la particule
      const ux = vx[i]!;
      const uy = vy[i]!;
      const uz = vz[i]!;
      const sp2 = Math.sqrt(ux * ux + uy * uy + uz * uz);
      let len = sp2 * st;
      const minLen = size * 1.6;
      if (sp2 > 1e-3) {
        if (len < minLen) len = minLen;
        const k = len / sp2;
        ax = ux * k; ay = uy * k; az = uz * k;
        px -= ax * 0.5; py -= ay * 0.5; pz -= az * 0.5;
        mode = MODE_AXIS;
      }
    } else if (st < 0) {
      mode = MODE_FLAT;
    }
    const d = (px - camX) * fx + (py - camY) * fy + (pz - camZ) * fz;
    if (d < -(size + Math.abs(ax) + Math.abs(ay) + Math.abs(az))) continue;
    const o = cnt * SPRITE_STRIDE;
    stage[o] = px; stage[o + 1] = py; stage[o + 2] = pz; stage[o + 3] = size;
    stage[o + 4] = ax; stage[o + 5] = ay; stage[o + 6] = az; stage[o + 7] = rot[i]!;
    stage[o + 8] = r[i]!; stage[o + 9] = g[i]!; stage[o + 10] = b[i]!; stage[o + 11] = alpha;
    stage[o + 12] = tile[i]!;
    stage[o + 13] = kind[i]! + 4 * mode;
    stage[o + 14] = f & F_FLOORFADE ? floorY[i]! - 0.05 : NO_FLOOR;
    stage[o + 15] = seed[i]!;
    depth[cnt] = d;
    cnt++;
  }
  sp.count = cnt;
  return cnt - start;
}
