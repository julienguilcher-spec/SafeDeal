/* =====================================================================================
 * VILLE EN 3D — « chantier » d'une tuile (logique pure) : tout ce qu'il faut pour poser de la
 * géométrie au sol, et les petites aides d'émission communes aux constructeurs.
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';
import type { RoadGraph, Tile } from '../mapdata';
import { CODE_DECK } from './classes';
import type { BridgeProfile } from './decks';
import type { MeshBuf } from './meshbuf';
import { codeAt, liftOfCode } from './raster';
import type { TileRaster } from './raster';
import type { TileTin } from './tin';

export interface TileSite {
  readonly tile: Tile;
  readonly graph: RoadGraph;
  /** Arêtes du graphe proches de la tuile (marge comprise). */
  readonly edgeIds: readonly number[];
  readonly raster: TileRaster;
  readonly tin: TileTin;
  readonly profile: BridgeProfile;
  /** Niveau de l'eau du fleuve (m). */
  readonly waterLevel: number;
  /** Origine de la tuile (m monde). */
  readonly ox: number;
  readonly oz: number;
}

/** Épaisseur apparente d'un tablier de pont (m). */
export const DECK_THICKNESS = 0.9;

/** Altitude du niveau « chaussée » au point : sol en facettes, ou tablier sur un pont. */
export function roadY(site: TileSite, x: number, z: number): number {
  const ground = site.tin.y(x, z);
  return (codeAt(site.raster, x, z) & CODE_DECK) !== 0 ? site.profile.deckY(x, z, ground) : ground;
}

/** Altitude du sol DESSINÉ au point : niveau chaussée plus la surélévation du trottoir, de la pelouse… */
export function surfaceY(site: TileSite, x: number, z: number): number {
  const code = codeAt(site.raster, x, z);
  const ground = site.tin.y(x, z);
  return ((code & CODE_DECK) !== 0 ? site.profile.deckY(x, z, ground) : ground) + liftOfCode(code);
}

/** Le point est-il dans la tuile ? */
export function inTile(site: TileSite, x: number, z: number): boolean {
  return x >= site.ox && x < site.ox + TILE_SIZE && z >= site.oz && z < site.oz + TILE_SIZE;
}

/**
 * Face verticale entre a et b (coordonnées LOCALES à la tuile), visible du côté de la normale
 * (nx, nz). Altitudes hautes et basses aux deux bouts ; ombrage haut et bas (0..255).
 */
export function wallQuad(
  buf: MeshBuf, ax: number, az: number, bx: number, bz: number, topA: number, topB: number, botA: number, botB: number,
  nx: number, nz: number, cls: number, mode: number, tint: number, shadeTop: number, shadeBot: number,
): void {
  const i0 = buf.vertex(ax, topA, az, nx, 0, nz, cls, mode, tint, shadeTop);
  const i1 = buf.vertex(bx, topB, bz, nx, 0, nz, cls, mode, tint, shadeTop);
  const i2 = buf.vertex(bx, botB, bz, nx, 0, nz, cls, mode, tint, shadeBot);
  const i3 = buf.vertex(ax, botA, az, nx, 0, nz, cls, mode, tint, shadeBot);
  // Sens des triangles : face avant du côté de la normale.
  if ((bz - az) * nx - (bx - ax) * nz > 0) buf.quad(i0, i1, i2, i3);
  else buf.quad(i3, i2, i1, i0);
}

/** Quadrilatère horizontal (ou presque) tourné vers le haut ; sommets dans l'ordre du contour, coordonnées locales. */
export function flatQuad(
  buf: MeshBuf, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number, cls: number, mode: number, tint: number, shade: number,
): void {
  const i0 = buf.vertex(x0, y0, z0, 0, 1, 0, cls, mode, tint, shade);
  const i1 = buf.vertex(x1, y1, z1, 0, 1, 0, cls, mode, tint, shade);
  const i2 = buf.vertex(x2, y2, z2, 0, 1, 0, cls, mode, tint, shade);
  const i3 = buf.vertex(x3, y3, z3, 0, 1, 0, cls, mode, tint, shade);
  if ((z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0) > 0) buf.quad(i0, i1, i2, i3);
  else buf.quad(i3, i2, i1, i0);
}

/** Comme flatQuad, avec des coordonnées de texture (tampon créé avec `withUv`) : u0,v0 … u3,v3 dans l'ordre des sommets. */
export function flatQuadUv(
  buf: MeshBuf, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number, u0: number, v0: number, u1: number, v1: number, u2: number, v2: number, u3: number, v3: number,
  cls: number, mode: number, tint: number,
): void {
  const i0 = buf.vertex(x0, y0, z0, 0, 1, 0, cls, mode, tint, 255);
  const i1 = buf.vertex(x1, y1, z1, 0, 1, 0, cls, mode, tint, 255);
  const i2 = buf.vertex(x2, y2, z2, 0, 1, 0, cls, mode, tint, 255);
  const i3 = buf.vertex(x3, y3, z3, 0, 1, 0, cls, mode, tint, 255);
  buf.setUv(i0, u0, v0);
  buf.setUv(i1, u1, v1);
  buf.setUv(i2, u2, v2);
  buf.setUv(i3, u3, v3);
  if ((z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0) > 0) buf.quad(i0, i1, i2, i3);
  else buf.quad(i3, i2, i1, i0);
}

/**
 * Boîte allongée entre a et b (locaux) : deux faces latérales et un dessus, d'épaisseur 2 × half,
 * du sol (botA, botB) au sommet (topA, topB). Sert aux murs, aux haies, aux parapets.
 * `capA` / `capB` : ferme les bouts.
 */
export function wallBox(
  buf: MeshBuf, ax: number, az: number, bx: number, bz: number, half: number, topA: number, topB: number, botA: number, botB: number,
  cls: number, topCls: number, tint: number, capA: boolean, capB: boolean, mode: number,
): void {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const nx = -dz / len, nz = dx / len;
  const ox = nx * half, oz = nz * half;
  wallQuad(buf, ax + ox, az + oz, bx + ox, bz + oz, topA, topB, botA, botB, nx, nz, cls, mode, tint, 255, 150);
  wallQuad(buf, ax - ox, az - oz, bx - ox, bz - oz, topA, topB, botA, botB, -nx, -nz, cls, mode, tint, 255, 150);
  flatQuad(buf, ax + ox, topA, az + oz, bx + ox, topB, bz + oz, bx - ox, topB, bz - oz, ax - ox, topA, az - oz, topCls, mode, tint, 255);
  if (capA) wallQuad(buf, ax - ox, az - oz, ax + ox, az + oz, topA, topA, botA, botA, -dx / len, -dz / len, cls, mode, tint, 255, 150);
  if (capB) wallQuad(buf, bx + ox, bz + oz, bx - ox, bz - oz, topB, topB, botB, botB, dx / len, dz / len, cls, mode, tint, 255, 150);
}

/**
 * Quadrilatère quelconque (coordonnées locales, sommets dans l'ordre du contour) dont la face avant
 * regarde du côté de la normale donnée.
 */
export function quad3(
  buf: MeshBuf, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number, nx: number, ny: number, nz: number, cls: number, mode: number, tint: number, shade: number,
): void {
  const i0 = buf.vertex(x0, y0, z0, nx, ny, nz, cls, mode, tint, shade);
  const i1 = buf.vertex(x1, y1, z1, nx, ny, nz, cls, mode, tint, shade);
  const i2 = buf.vertex(x2, y2, z2, nx, ny, nz, cls, mode, tint, shade);
  const i3 = buf.vertex(x3, y3, z3, nx, ny, nz, cls, mode, tint, shade);
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
  const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  if (d > 0) buf.quad(i0, i1, i2, i3);
  else buf.quad(i3, i2, i1, i0);
}

/** Triangle dont la face avant regarde du côté de la normale donnée (coordonnées locales). */
export function tri3(
  buf: MeshBuf, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  nx: number, ny: number, nz: number, cls: number, mode: number, tint: number, shade: number,
): void {
  const i0 = buf.vertex(x0, y0, z0, nx, ny, nz, cls, mode, tint, shade);
  const i1 = buf.vertex(x1, y1, z1, nx, ny, nz, cls, mode, tint, shade);
  const i2 = buf.vertex(x2, y2, z2, nx, ny, nz, cls, mode, tint, shade);
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
  const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  if (d > 0) buf.tri(i0, i1, i2);
  else buf.tri(i0, i2, i1);
}
