/* =====================================================================================
 * MONUMENTS — types publics du module.
 * Repère LOCAL d'un monument : origine au centre du monument au niveau du sol, y vers le
 * haut, façade principale vers +z. Le système appelant pose le groupe (position, rotation.y
 * = cap du monument). Unités : mètres.
 * ===================================================================================== */
import type * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';

/** Emplacement d'un monument, exprimé dans son repère local. */
export interface MonumentSite {
  /** Emprise réelle au sol [x0, z0, x1, z1, …] en coordonnées LOCALES, antihoraire vue de dessus, non refermée. Peut être vide. */
  footprint: ArrayLike<number>;
  /** Hauteur indicative (m) fournie par la carte ; 0 si inconnue. */
  height: number;
  /** Graine de variation déterministe (facultative). */
  seed?: number;
}

/**
 * Obstacle au sol d'un monument (donnée pure, utilisable par la simulation sous Node).
 * `ring` : polygone local [x0, z0, …], antihoraire vu de dessus, non refermé.
 * `baseY` : altitude du dessous de l'obstacle ; si baseY > 2,5 m on passe dessous (voûte, tablier).
 * `height` : épaisseur verticale de l'obstacle au-dessus de baseY.
 */
export interface MonumentCollider {
  ring: number[];
  height: number;
  baseY: number;
}

/** Hauteur libre au-delà de laquelle un piéton ou un véhicule passe sous un obstacle. */
export const PASS_UNDER_Y = 2.5;

/** Informations d'animation transmises chaque image aux monuments qui en ont besoin. */
export interface MonumentFrame {
  /** Temps réel écoulé (s). */
  time: number;
  dt: number;
  /** 0 (nuit noire) … 1 (plein jour). */
  daylight: number;
  /** Niveau d'illumination nocturne 0 (jour) … 1 (nuit). */
  night: number;
  /** Heure locale 0..24. */
  hour: number;
  /** Scintillement de début d'heure 0..1 (la nuit, cinq premières minutes de chaque heure). */
  sparkle: number;
}

export interface MonumentDef {
  /** Clé du monument (minuscules ASCII, chiffres, « _ ») : identique à LandmarkInfo.key. */
  key: string;
  /** Nom français affichable. */
  name: string;
  /** Rayon englobant horizontal (m) autour de l'origine locale. */
  radius: number;
  /** Hauteur nominale réelle (m). */
  height: number;
  /** Modèle détaillé (≤ 60 000 triangles, ≤ 12 appels de dessin ; Tour Eiffel ≤ 150 000). */
  build(site: MonumentSite, quality: QualityLevel): THREE.Object3D;
  /** Silhouette très légère (≤ 400 triangles) visible de loin. */
  buildFar(site: MonumentSite): THREE.Object3D;
  /** Animation propre au monument (jets d'eau, scintillement…). `far` = silhouette lointaine. */
  animate?(object: THREE.Object3D, frame: MonumentFrame, far: boolean): void;
}

/** Site vide : aucun contour connu. */
export const EMPTY_SITE: MonumentSite = { footprint: [], height: 0 };
