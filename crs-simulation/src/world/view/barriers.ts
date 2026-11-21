/* =====================================================================================
 * VILLE EN 3D — barrières d'une tuile (logique pure) : murs, haies, murs de quai en volume ;
 * grilles, garde-corps et portails en panneaux à texture découpée.
 * ===================================================================================== */

import type { Barrier } from '../mapdata';
import { CL_CONCRETE, CL_HEDGE, CL_PLASTER, CL_STONE, hash01 } from './classes';
import { MODE_VERTICAL } from './meshbuf';
import type { MeshBuf } from './meshbuf';
import { surfaceY, wallBox } from './site';
import type { TileSite } from './site';

/** Bandes (v0, v1) de la texture découpée et longueur (m) couverte par une répétition en u. */
export const CUTOUT_ROWS = {
  fence: { v0: 0.004, v1: 0.246, period: 1.6 },
  railing: { v0: 0.254, v1: 0.496, period: 2.0 },
  gate: { v0: 0.504, v1: 0.746, period: 3.2 },
} as const;

/** Demi-épaisseurs (m) : celles des collisions de la simulation. */
const HALF_WALL = 0.2;
const HALF_HEDGE = 0.4;
const HALF_QUAY = 0.22;
/** Soubassement de pierre sous une grille haute (m). */
const FENCE_BASE = 0.4;
/** Pas de découpe d'une barrière pour suivre le sol (m). */
const STEP = 8;

export interface BarrierStats { walls: number; hedges: number; quays: number; fences: number; railings: number; gates: number; panels: number }

/** Panneau vertical double face, texturé (u le long de la barrière, v sur la hauteur). */
function panel(
  buf: MeshBuf, ax: number, az: number, bx: number, bz: number, botA: number, botB: number, topA: number, topB: number,
  u0: number, u1: number, v0: number, v1: number, tint: number,
): void {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const nx = -dz / len, nz = dx / len;
  const i0 = buf.vertex(ax, botA, az, nx, 0, nz, 0, MODE_VERTICAL, tint, 255);
  const i1 = buf.vertex(bx, botB, bz, nx, 0, nz, 0, MODE_VERTICAL, tint, 255);
  const i2 = buf.vertex(bx, topB, bz, nx, 0, nz, 0, MODE_VERTICAL, tint, 255);
  const i3 = buf.vertex(ax, topA, az, nx, 0, nz, 0, MODE_VERTICAL, tint, 255);
  buf.setUv(i0, u0, v0);
  buf.setUv(i1, u1, v0);
  buf.setUv(i2, u1, v1);
  buf.setUv(i3, u0, v1);
  buf.quad(i0, i1, i2, i3);
}

/** Construit toutes les barrières de la tuile. `volumes` : maillage opaque ; `cutout` : panneaux découpés (avec uv). */
export function buildBarriers(site: TileSite, volumes: MeshBuf, cutout: MeshBuf): BarrierStats {
  const stats: BarrierStats = { walls: 0, hedges: 0, quays: 0, fences: 0, railings: 0, gates: 0, panels: 0 };
  const barriers = site.tile.barriers;
  for (let q = 0; q < barriers.length; q++) buildBarrier(site, barriers[q], q, volumes, cutout, stats);
  return stats;
}

function buildBarrier(site: TileSite, b: Barrier, index: number, volumes: MeshBuf, cutout: MeshBuf, stats: BarrierStats): void {
  const pts = b.points;
  const n = pts.length >> 1;
  if (n < 2) return;
  const ox = site.ox, oz = site.oz;
  const h = Math.max(0.3, b.height);
  const tint = 120 + Math.floor(hash01(index * 53 + site.tile.tx * 7 + site.tile.tz * 13) * 16);
  if (b.kind === 'wall') stats.walls++;
  else if (b.kind === 'hedge') stats.hedges++;
  else if (b.kind === 'quay_wall') stats.quays++;
  else if (b.kind === 'fence') stats.fences++;
  else if (b.kind === 'railing') stats.railings++;
  else stats.gates++;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  // Un portail : un nombre entier de vantaux sur sa longueur.
  const gatePeriod = b.kind === 'gate' ? total / Math.max(1, Math.round(total / CUTOUT_ROWS.gate.period)) : 1;
  let dist = 0;
  for (let i = 1; i < n; i++) {
    const ax = pts[2 * i - 2], az = pts[2 * i - 1], bx = pts[2 * i], bz = pts[2 * i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.02) continue;
    const parts = Math.max(1, Math.ceil(len / STEP));
    for (let k = 0; k < parts; k++) {
      const t0 = k / parts, t1 = (k + 1) / parts;
      const px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
      const ya = surfaceY(site, px, pz), yb = surfaceY(site, qx, qz);
      const d0 = dist + len * t0, d1 = dist + len * t1;
      const first = i === 1 && k === 0, last = i === n - 1 && k === parts - 1;
      const lax = px - ox, laz = pz - oz, lbx = qx - ox, lbz = qz - oz;
      switch (b.kind) {
        case 'wall': {
          const cls = h >= 4.5 ? CL_STONE : h <= 1 ? CL_CONCRETE : CL_PLASTER;
          wallBox(volumes, lax, laz, lbx, lbz, HALF_WALL, ya + h, yb + h, ya - 0.3, yb - 0.3, cls, CL_STONE, tint, first, last, MODE_VERTICAL);
          break;
        }
        case 'hedge':
          wallBox(volumes, lax, laz, lbx, lbz, HALF_HEDGE, ya + h, yb + h, ya - 0.2, yb - 0.2, CL_HEDGE, CL_HEDGE, tint, first, last, MODE_VERTICAL);
          break;
        case 'quay_wall':
          // Parapet au niveau de la rue ; le parement descend de la hauteur du mur (caché là où le sol le recouvre).
          wallBox(volumes, lax, laz, lbx, lbz, HALF_QUAY, ya + 0.95, yb + 0.95, ya - h, yb - h, CL_STONE, CL_STONE, tint, first, last, MODE_VERTICAL);
          break;
        case 'fence': {
          const base = h >= 1.5 ? FENCE_BASE : 0;
          if (base > 0) wallBox(volumes, lax, laz, lbx, lbz, 0.15, ya + base, yb + base, ya - 0.2, yb - 0.2, CL_STONE, CL_STONE, tint, first, last, MODE_VERTICAL);
          const row = CUTOUT_ROWS.fence;
          panel(cutout, lax, laz, lbx, lbz, ya + base, yb + base, ya + h, yb + h, d0 / row.period, d1 / row.period, row.v0, row.v1, tint);
          stats.panels++;
          break;
        }
        case 'railing': {
          const row = CUTOUT_ROWS.railing;
          panel(cutout, lax, laz, lbx, lbz, ya, yb, ya + h, yb + h, d0 / row.period, d1 / row.period, row.v0, row.v1, tint);
          stats.panels++;
          break;
        }
        default: {
          const row = CUTOUT_ROWS.gate;
          panel(cutout, lax, laz, lbx, lbz, ya, yb, ya + h, yb + h, d0 / gatePeriod, d1 / gatePeriod, row.v0, row.v1, tint);
          stats.panels++;
        }
      }
    }
    dist += len;
  }
}
