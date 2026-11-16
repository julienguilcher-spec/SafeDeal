/* =====================================================================================
 * VILLE EN 3D — ouvrage des ponts (logique pure) : piles à avant-becs, arches et tympans sous
 * les tabliers. Le tablier lui-même (chaussée, trottoirs, parapets) vient du sol (ground.ts).
 *
 * Un pont est découpé en travées d'environ 30 m calées sur l'abscisse curviligne de son arête :
 * deux tuiles voisines trouvent les mêmes travées, et chacune construit celles dont le milieu est
 * chez elle. Une travée n'est bâtie que si la grille y voit de l'eau sous le tablier.
 * ===================================================================================== */

import type { RoadEdge } from '../mapdata';
import { CL_STONE, CODE_DECK, CODE_OVER_WATER } from './classes';
import { pointAlong } from './markings';
import { MODE_VERTICAL } from './meshbuf';
import type { MeshBuf } from './meshbuf';
import { codeAt, halfDeckOf } from './raster';
import { DECK_THICKNESS, inTile, quad3, tri3, wallQuad } from './site';
import type { TileSite } from './site';

/** Portée visée d'une travée (m) et nombre de facettes d'une arche. */
const SPAN = 30;
const ARCH_STEPS = 10;
/** Tirant d'air minimal (m) pour dessiner une arche. */
const MIN_CLEARANCE = 2.2;

export interface BridgeStats { spans: number; piers: number }

/** Nombre de travées d'un pont de longueur donnée. */
export function spanCount(length: number): number {
  return Math.max(1, Math.round(length / SPAN));
}

/** Hauteur de l'intrados d'une arche en anse de panier, à la fraction t de la portée (0..1), pour une flèche `rise`. */
export function archRise(t: number, rise: number): number {
  const u = 2 * t - 1;
  return rise * Math.sqrt(Math.max(0, 1 - u * u));
}

/** Demi-largeur réelle du tablier d'un côté : on avance depuis l'axe tant que la grille voit un tablier. */
function deckExtent(site: TileSite, x: number, z: number, rx: number, rz: number, fallback: number): number {
  const r = site.raster;
  const stepLen = Math.max(0.5, r.cell);
  let d = 0;
  for (let s = stepLen; s <= 40; s += stepLen) {
    const px = x + rx * s, pz = z + rz * s;
    // hors de la tuile, la grille ne dit plus rien : on s'en tient à ce qui a été mesuré
    if (!inTile(site, px, pz)) break;
    if ((codeAt(r, px, pz) & CODE_DECK) === 0) break;
    d = s;
  }
  return Math.max(fallback, d);
}

/** Construit les piles et les arches de tous les ponts qui passent dans la tuile. `level` : niveau de l'eau. */
export function buildBridges(site: TileSite, volumes: MeshBuf, level: number, skip: (edge: RoadEdge) => boolean): BridgeStats {
  const stats: BridgeStats = { spans: 0, piers: 0 };
  const ox = site.ox, oz = site.oz;
  for (let q = 0; q < site.edgeIds.length; q++) {
    const e = site.edgeIds[q];
    const ed = site.graph.edges[e];
    if (ed === undefined || !ed.bridge || ed.tunnel || ed.length < 18 || skip(ed)) continue;
    const n = spanCount(ed.length);
    const span = ed.length / n;
    const half = halfDeckOf(ed);
    for (let k = 0; k < n; k++) {
      const s0 = k * span, s1 = s0 + span;
      const pm = pointAlong(ed.points, (s0 + s1) / 2);
      const mx = pm.x, mz = pm.z;
      if (!inTile(site, mx, mz)) continue;
      if ((codeAt(site.raster, mx, mz) & CODE_OVER_WATER) === 0) continue;
      const p0 = pointAlong(ed.points, s0);
      const ax = p0.x, az = p0.z;
      const p1 = pointAlong(ed.points, s1);
      const bx = p1.x, bz = p1.z;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const rx = -uz, rz = ux;
      // Tympans un rien en retrait du bandeau du tablier.
      const hr = deckExtent(site, mx, mz, rx, rz, half) - 0.08, hl = deckExtent(site, mx, mz, -rx, -rz, half) - 0.08;
      const under0 = site.profile.axisY(e, s0) - DECK_THICKNESS, under1 = site.profile.axisY(e, s1) - DECK_THICKNESS;
      const clearance = Math.min(under0, under1) - level;
      if (clearance < MIN_CLEARANCE) continue;
      const rise = Math.min(span * 0.3, clearance - 0.6);
      stats.spans++;
      let pax = ax, paz = az, pyi = under0 - 0.12 - rise, pyd = under0 + 0.06;
      for (let i = 1; i <= ARCH_STEPS; i++) {
        const t = i / ARCH_STEPS;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        const under = under0 + (under1 - under0) * t;
        const yi = under - 0.12 - rise + archRise(t, rise), yd = under + 0.06;
        // Tympans des deux côtés.
        wallQuad(volumes, pax + rx * hr - ox, paz + rz * hr - oz, cx + rx * hr - ox, cz + rz * hr - oz, pyd, yd, pyi, yi, rx, rz, CL_STONE, MODE_VERTICAL, 126, 235, 170);
        wallQuad(volumes, pax - rx * hl - ox, paz - rz * hl - oz, cx - rx * hl - ox, cz - rz * hl - oz, pyd, yd, pyi, yi, -rx, -rz, CL_STONE, MODE_VERTICAL, 126, 235, 170);
        // Voûte, vue d'en dessous.
        const slope = (yi - pyi) / (len / ARCH_STEPS);
        const inv = 1 / Math.hypot(1, slope);
        quad3(
          volumes, pax - rx * hl - ox, pyi, paz - rz * hl - oz, pax + rx * hr - ox, pyi, paz + rz * hr - oz,
          cx + rx * hr - ox, yi, cz + rz * hr - oz, cx - rx * hl - ox, yi, cz - rz * hl - oz,
          ux * slope * inv, -inv, uz * slope * inv, CL_STONE, MODE_VERTICAL, 116, 130,
        );
        pax = cx;
        paz = cz;
        pyi = yi;
        pyd = yd;
      }
      // Piles : au début de la travée (sauf la première, qui s'appuie sur la culée) et à la fin de la dernière travée interne.
      const spring0 = under0 - 0.12 - rise, spring1 = under1 - 0.12 - rise;
      if (k > 0) {
        pier(site, volumes, ax, az, ux, uz, hl, hr, span, level, spring0 + rise * 0.55);
        stats.piers++;
      }
      // Si la travée suivante n'est pas bâtie par cette tuile, sa pile de départ manquerait de ce côté-ci.
      if (k < n - 1) {
        const nm = pointAlong(ed.points, s1 + span / 2);
        const nextMine = inTile(site, nm.x, nm.z) && (codeAt(site.raster, nm.x, nm.z) & CODE_OVER_WATER) !== 0;
        if (!nextMine) {
          pier(site, volumes, bx, bz, ux, uz, hl, hr, span, level, spring1 + rise * 0.55);
          stats.piers++;
        }
      }
    }
  }
  return stats;
}

/** Pile de pont : fût rectangulaire et avant-becs triangulaires de part et d'autre. */
function pier(
  site: TileSite, v: MeshBuf, x: number, z: number, ux: number, uz: number, hl: number, hr: number, span: number, level: number, top: number,
): void {
  const ox = site.ox, oz = site.oz;
  const t = Math.min(2.2, Math.max(1.3, span * 0.06));
  const rx = -uz, rz = ux;
  const bottom = level - 1.6;
  const lx = x - ox, lz = z - oz;
  const r1 = hr + 0.3, l1 = hl + 0.3;
  // Quatre coins du fût : (avant/arrière le long du pont) × (droite/gauche).
  const fRx = lx + ux * t + rx * r1, fRz = lz + uz * t + rz * r1, bRx = lx - ux * t + rx * r1, bRz = lz - uz * t + rz * r1;
  const fLx = lx + ux * t - rx * l1, fLz = lz + uz * t - rz * l1, bLx = lx - ux * t - rx * l1, bLz = lz - uz * t - rz * l1;
  wallQuad(v, fLx, fLz, fRx, fRz, top, top, bottom, bottom, ux, uz, CL_STONE, MODE_VERTICAL, 122, 225, 120);
  wallQuad(v, bLx, bLz, bRx, bRz, top, top, bottom, bottom, -ux, -uz, CL_STONE, MODE_VERTICAL, 122, 225, 120);
  // Avant-becs : pointe à 1,8 fois l'épaisseur, un peu plus bas que le fût.
  const beak = t * 1.8, beakTop = Math.min(top, level + Math.max(1.2, (top - level) * 0.7));
  const tipRx = lx + rx * (r1 + beak), tipRz = lz + rz * (r1 + beak), tipLx = lx - rx * (l1 + beak), tipLz = lz - rz * (l1 + beak);
  const k = 1 / Math.hypot(beak, t);
  wallQuad(v, fRx, fRz, tipRx, tipRz, beakTop, beakTop, bottom, bottom, (ux * beak + rx * t) * k, (uz * beak + rz * t) * k, CL_STONE, MODE_VERTICAL, 128, 235, 120);
  wallQuad(v, bRx, bRz, tipRx, tipRz, beakTop, beakTop, bottom, bottom, (-ux * beak + rx * t) * k, (-uz * beak + rz * t) * k, CL_STONE, MODE_VERTICAL, 128, 235, 120);
  wallQuad(v, fLx, fLz, tipLx, tipLz, beakTop, beakTop, bottom, bottom, (ux * beak - rx * t) * k, (uz * beak - rz * t) * k, CL_STONE, MODE_VERTICAL, 128, 235, 120);
  wallQuad(v, bLx, bLz, tipLx, tipLz, beakTop, beakTop, bottom, bottom, (-ux * beak - rx * t) * k, (-uz * beak - rz * t) * k, CL_STONE, MODE_VERTICAL, 128, 235, 120);
  // Chaperons des avant-becs et flancs du fût au-dessus d'eux.
  tri3(v, fRx, beakTop, fRz, bRx, beakTop, bRz, tipRx, beakTop, tipRz, 0, 1, 0, CL_STONE, MODE_VERTICAL, 136, 255);
  tri3(v, fLx, beakTop, fLz, bLx, beakTop, bLz, tipLx, beakTop, tipLz, 0, 1, 0, CL_STONE, MODE_VERTICAL, 136, 255);
  if (top > beakTop + 0.05) {
    wallQuad(v, bRx, bRz, fRx, fRz, top, top, beakTop, beakTop, rx, rz, CL_STONE, MODE_VERTICAL, 124, 235, 200);
    wallQuad(v, bLx, bLz, fLx, fLz, top, top, beakTop, beakTop, -rx, -rz, CL_STONE, MODE_VERTICAL, 124, 235, 200);
  }
}
