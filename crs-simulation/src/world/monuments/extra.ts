/* Repères SUPPLÉMENTAIRES du système — DONNÉES PURES (aucun import de Three.js : chargé aussi par la simulation).
 * Monuments modélisés qui ne figurent pas dans landmarks.json : ils sont fusionnés avec ctx.world.landmarks par le
 * système (system.ts) quand ils tombent dans l'emprise de la carte et que la carte ne les fournit pas déjà.
 * Coordonnées : projection du BRIEF, x = (lon − 2,321236) × 73 305, z = −(lat − 48,865633) × 111 214.
 * `footprint` : emprise au sol en coordonnées MONDE (comme LandmarkInfo), antihoraire vue de dessus.
 * `y` n'est qu'indicatif : le système pose toujours le modèle à heightAt(x, z). */
import type { LandmarkInfo } from '@/core/contracts';
import { rectRing } from './shape2d';

/** Origine de la projection (obélisque de la Concorde) et mètres par degré. */
export const ORIGIN_LAT = 48.865633, ORIGIN_LON = 2.321236, M_PER_DEG_LON = 73305, M_PER_DEG_LAT = 111214;

/** WGS84 → mètres du monde (x = est, z = sud). */
export function lonLatToXZ(lon: number, lat: number): { x: number; z: number } {
  return { x: (lon - ORIGIN_LON) * M_PER_DEG_LON, z: -(lat - ORIGIN_LAT) * M_PER_DEG_LAT };
}

function rad(deg: number): number { return (deg * Math.PI) / 180; }

function extra(key: string, name: string, lon: number, lat: number, headingDeg: number, height: number, w: number, d: number): LandmarkInfo {
  const { x, z } = lonLatToXZ(lon, lat);
  const heading = rad(headingDeg);
  return { key, name, x, z, y: 0, heading, height, footprint: rectRing(x, z, w, d, heading) };
}

/**
 * Repères absents de landmarks.json.
 *  - Portes des Grands Boulevards : arcs de triomphe de Louis XIV, au débouché des rues Saint-Denis et Saint-Martin.
 *    Position et axe relevés sur les bâtiments « Porte Saint-Denis » / « Porte Saint-Martin » de la carte (OSM) ;
 *    façade principale tournée vers le sud (la ville).
 *  - Fontaine de Varsovie : bassins et canons à eau des jardins du Trocadéro, dans l'axe du palais de Chaillot
 *    (cap 46° comme les deux ailes : +z local vers la Seine et la tour Eiffel).
 */
export const EXTRA_LANDMARKS: readonly LandmarkInfo[] = [
  extra('porte_saint_denis', 'Porte Saint-Denis', 2.352687, 48.869793, 341.5, 24.65, 25.0, 5.0),
  extra('porte_saint_martin', 'Porte Saint-Martin', 2.355651, 48.869146, 341.2, 18.0, 18.0, 4.5),
  extra('fontaine_varsovie', 'Fontaine de Varsovie (jardins du Trocadéro)', 2.289973, 48.861160, 46, 12, 62, 138),
];

export interface BoundsLike { minX: number; minZ: number; maxX: number; maxZ: number }

/**
 * Repères de la carte complétés par les repères supplémentaires. Un repère supplémentaire n'est ajouté que
 * s'il tombe dans l'emprise `bounds` (sans emprise connue, ou infinie : aucun ajout) et si la carte ne fournit pas déjà sa clé.
 * Rend `list` lui-même quand rien n'est ajouté.
 */
export function mergeLandmarks(list: readonly LandmarkInfo[], bounds: BoundsLike | null | undefined, extras: readonly LandmarkInfo[] = EXTRA_LANDMARKS): readonly LandmarkInfo[] {
  // emprise inconnue, vide ou infinie (monde neutre des tests) : rien à ajouter
  if (!bounds || !(bounds.maxX > bounds.minX) || !(bounds.maxZ > bounds.minZ) || !Number.isFinite(bounds.maxX - bounds.minX + bounds.maxZ - bounds.minZ)) return list;
  let out: LandmarkInfo[] | null = null;
  for (const e of extras) {
    if (e.x < bounds.minX || e.x > bounds.maxX || e.z < bounds.minZ || e.z > bounds.maxZ) continue;
    let known = false;
    for (let i = 0; i < list.length && !known; i++) known = list[i].key === e.key;
    if (known) continue;
    if (!out) out = list.slice();
    out.push(e);
  }
  return out ?? list;
}

/** Repères supplémentaires qui tombent dans l'emprise (pour la simulation : obstacles, lieux). */
export function extraLandmarksIn(bounds: BoundsLike | null | undefined): LandmarkInfo[] {
  const merged = mergeLandmarks([], bounds);
  return merged.slice();
}
