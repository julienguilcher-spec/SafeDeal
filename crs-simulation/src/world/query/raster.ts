/* =====================================================================================
 * Grille de surfaces d'une tuile : 512 × 512 cellules de 1 m, rasterisées à la demande.
 *
 *   kinds[j · 512 + i]   : code de surface (indice dans SURFACE_CODES) de la cellule dont le
 *                          centre est (ox + i + 0,5 ; oz + j + 0,5) ;
 *   heights[j · 512 + i] : hauteur du bâti en décimètres (0 hors bâtiment).
 *
 * Ordre de peinture, du dessous vers le dessus :
 *   1. fond : « rien » (deviendra du trottoir : en ville, ce qui n'est rien d'autre est de l'espace
 *      public piéton) ;
 *   2. les surfaces de la tuile, dans leur ordre (celui de la carte) ;
 *   3. les voies piétonnes du graphe (sans recouvrir ni l'eau ni une chaussée) ;
 *   4. les chaussées : arêtes carrossables épaissies de leur largeur. Si la carte fournit les
 *      emprises de chaussée, elles font foi et l'arête ne comble que les zones sans information ;
 *      les pavés (connus du seul graphe) sont reportés sur ces emprises ;
 *   5. les tabliers des ponts : surfaces dures de la carte qui recouvrent l'eau, et arêtes « pont »
 *      épaissies (chaussée + trottoirs) ;
 *   6. les bâtiments, puis les obstacles des monuments ;
 *   7. les passages de voies sous un bâtiment (porches).
 * Remplissage de polygones maison : balayage par lignes, règle de parité, centres de cellules.
 * ===================================================================================== */

import type { SurfaceKind } from '@/core/contracts';
import type { MapSurfaceKind, RoadEdge } from '../mapdata';
import { SURFACE_CODES } from './api';

/** Nombre de cellules par côté de tuile (512 m à 1 m par cellule). */
export const GRID_SIZE = 512;

export const CODE_VOID = 0;
export const CODE_ROAD = 1;
export const CODE_SIDEWALK = 2;
export const CODE_PLAZA = 3;
export const CODE_SETT = 4;
export const CODE_PARK = 5;
export const CODE_GRAVEL = 6;
export const CODE_WATER = 7;
export const CODE_BUILDING = 8;
export const CODE_BRIDGE = 9;
export const CODE_QUAY = 10;
export const CODE_INTERIOR = 11;
/** Code interne de travail : cellule pas encore peinte (jamais visible : remplacé par le trottoir). */
export const CODE_UNSET = 12;

/** Conversion du type de polygone de la carte vers la nature du sol des contrats. */
const SURFACE_OF_MAP_KIND: Readonly<Record<MapSurfaceKind, number>> = {
  plaza: CODE_PLAZA,
  road: CODE_ROAD,
  sidewalk: CODE_SIDEWALK,
  pedestrian: CODE_PLAZA,
  median: CODE_SIDEWALK,
  parking: CODE_PLAZA,
  construction: CODE_GRAVEL,
  courtyard: CODE_PLAZA,
  park: CODE_PARK,
  garden: CODE_PARK,
  grass: CODE_PARK,
  gravel: CODE_GRAVEL,
  quay: CODE_QUAY,
  sports: CODE_GRAVEL,
  cemetery: CODE_PARK,
  rail: CODE_GRAVEL,
  water: CODE_WATER,
};

export function codeOfMapSurface(kind: MapSurfaceKind): number {
  return SURFACE_OF_MAP_KIND[kind] ?? CODE_PLAZA;
}

/** Code de la chaussée d'une arête carrossable. */
export function codeOfCarriageway(edge: RoadEdge): number {
  return edge.surface === 'sett' ? CODE_SETT : CODE_ROAD;
}

/** Code du sol d'une voie piétonne (rue piétonne, allée, sentier). */
export function codeOfPedestrianWay(edge: RoadEdge): number {
  if (edge.surface === 'sett') return CODE_SETT;
  if (edge.surface === 'gravel') return CODE_GRAVEL;
  return edge.roadClass === 'pedestrian' ? CODE_PLAZA : CODE_SIDEWALK;
}

export function surfaceOfCode(code: number): SurfaceKind {
  return SURFACE_CODES[code] ?? 'void';
}

export class TileGrid {
  readonly ox: number;
  readonly oz: number;
  readonly kinds: Uint8Array;
  readonly heights: Uint16Array;

  constructor(ox: number, oz: number) {
    this.ox = ox;
    this.oz = oz;
    this.kinds = new Uint8Array(GRID_SIZE * GRID_SIZE);
    this.heights = new Uint16Array(GRID_SIZE * GRID_SIZE);
  }
}

// Abscisses des croisements d'une ligne de balayage (réutilisé, agrandi au besoin).
let crossings = new Float64Array(64);

/**
 * Remplit un polygone (anneau extérieur + trous, règle de parité).
 * @param code code de surface à écrire
 * @param heightDm hauteur de bâti à écrire (dm), ou -1 pour ne pas toucher aux hauteurs
 * @param protect masque de bits (1 << code) des cellules à ne pas recouvrir
 * @param only masque (1 << code) des seules cellules à recouvrir (0 = toutes)
 */
export function fillPolygon(grid: TileGrid, rings: readonly ArrayLike<number>[], code: number, heightDm: number, protect: number, only = 0): void {
  let minZ = Infinity, maxZ = -Infinity, edgeCount = 0;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    edgeCount += ring.length >> 1;
    for (let i = 1; i < ring.length; i += 2) {
      if (ring[i] < minZ) minZ = ring[i];
      if (ring[i] > maxZ) maxZ = ring[i];
    }
  }
  if (edgeCount < 3) return;
  if (crossings.length < edgeCount) crossings = new Float64Array(edgeCount * 2);
  const xs = crossings;
  const kinds = grid.kinds, heights = grid.heights;
  const j0 = Math.max(0, Math.ceil(minZ - grid.oz - 0.5)), j1 = Math.min(GRID_SIZE - 1, Math.floor(maxZ - grid.oz - 0.5));
  for (let j = j0; j <= j1; j++) {
    const z = grid.oz + j + 0.5;
    let n = 0;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const count = ring.length >> 1;
      for (let a = 0, b = count - 1; a < count; b = a++) {
        const za = ring[2 * a + 1], zb = ring[2 * b + 1];
        if (za > z === zb > z) continue;
        const xa = ring[2 * a], xb = ring[2 * b];
        const x = xa + ((z - za) * (xb - xa)) / (zb - za);
        // Insertion triée (peu de croisements par ligne).
        let k = n++;
        while (k > 0 && xs[k - 1] > x) {
          xs[k] = xs[k - 1];
          k--;
        }
        xs[k] = x;
      }
    }
    const row = j * GRID_SIZE;
    for (let k = 0; k + 1 < n; k += 2) {
      // Cellules dont le centre est dans [xs[k], xs[k + 1][.
      const i0 = Math.max(0, Math.ceil(xs[k] - grid.ox - 0.5)), i1 = Math.min(GRID_SIZE - 1, Math.ceil(xs[k + 1] - grid.ox - 0.5) - 1);
      for (let i = i0; i <= i1; i++) {
        if (protect !== 0 && (protect & (1 << kinds[row + i])) !== 0) continue;
        if (only !== 0 && (only & (1 << kinds[row + i])) === 0) continue;
        kinds[row + i] = code;
        if (heightDm >= 0) heights[row + i] = heightDm;
      }
    }
  }
}

/**
 * Peint un segment épaissi (capsule de rayon r).
 * @param capA, capB extrémités arrondies (true) ou coupées droit (false)
 * @param protect masque (1 << code) des cellules à ne pas recouvrir
 * @param only masque (1 << code) des seules cellules à recouvrir (0 = toutes)
 * @param heightDm hauteur à écrire (dm), ou -1 pour ne pas toucher aux hauteurs
 */
export function paintCapsule(
  grid: TileGrid, ax: number, az: number, bx: number, bz: number, r: number, code: number,
  capA: boolean, capB: boolean, protect: number, only: number, heightDm: number,
): void {
  const i0 = Math.max(0, Math.ceil(Math.min(ax, bx) - r - grid.ox - 0.5)), i1 = Math.min(GRID_SIZE - 1, Math.floor(Math.max(ax, bx) + r - grid.ox - 0.5));
  const j0 = Math.max(0, Math.ceil(Math.min(az, bz) - r - grid.oz - 0.5)), j1 = Math.min(GRID_SIZE - 1, Math.floor(Math.max(az, bz) + r - grid.oz - 0.5));
  if (i0 > i1 || j0 > j1) return;
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const inv = len2 > 0 ? 1 / len2 : 0;
  const r2 = r * r;
  const kinds = grid.kinds, heights = grid.heights;
  for (let j = j0; j <= j1; j++) {
    const pz = grid.oz + j + 0.5 - az;
    const row = j * GRID_SIZE;
    for (let i = i0; i <= i1; i++) {
      const px = grid.ox + i + 0.5 - ax;
      let t = (px * dx + pz * dz) * inv;
      if (t < 0) {
        if (!capA) continue;
        t = 0;
      } else if (t > 1) {
        if (!capB) continue;
        t = 1;
      }
      const ex = px - dx * t, ez = pz - dz * t;
      if (ex * ex + ez * ez > r2) continue;
      const bit = 1 << kinds[row + i];
      if ((protect & bit) !== 0 || (only !== 0 && (only & bit) === 0)) continue;
      kinds[row + i] = code;
      if (heightDm >= 0) heights[row + i] = heightDm;
    }
  }
}

/** Peint une polyligne épaissie ; les jonctions intérieures sont arrondies, les deux bouts selon `caps`. */
export function paintPolyline(
  grid: TileGrid, pts: ArrayLike<number>, r: number, code: number, caps: boolean, protect: number, only: number, heightDm: number,
): void {
  const last = pts.length - 2;
  for (let i = 2; i <= last; i += 2) {
    paintCapsule(grid, pts[i - 2], pts[i - 1], pts[i], pts[i + 1], r, code, caps || i > 2, caps || i < last, protect, only, heightDm);
  }
}

/** Hauteur (m) → décimètres bornés au domaine d'un Uint16. */
export function heightToDm(height: number): number {
  const dm = Math.round(height * 10);
  return dm < 0 ? 0 : dm > 65535 ? 65535 : dm;
}
