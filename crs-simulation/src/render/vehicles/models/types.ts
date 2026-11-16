/* Types communs aux constructeurs de modèles. */

import type { VehicleDef } from '@/core/contracts';
import type { Geo } from '../geo';

/** Classe d'habitacle pour la vue intérieure. */
export type CockpitKind = 'car' | 'van' | 'truck' | 'armored' | 'bike' | 'none';

/** Ce que le rendu doit savoir d'un modèle en plus de sa géométrie. Positions dans le repère Three local. */
export interface ModelMeta {
  /** Rayon des roues de référence (vitesse de rotation). */
  wheelRadius: number;
  /** Portes ouvrantes : indice (0..3) et milieu de la porte. */
  doors: { index: number; x: number; z: number }[];
  /** Positions des feux [x, y, z, …] pour les halos lumineux. */
  head: number[];
  tail: number[];
  beaconA: number[];
  beaconB: number[];
  /** Points d'ancrage des flammes quand le véhicule brûle. */
  fire: number[];
  /** Le modèle a des rotors (hélicoptère, drone). */
  rotor: boolean;
  cockpit: CockpitKind;
  /** Repères de carrosserie pour bâtir l'habitacle : ceinture, capot, toit, pied de pare-brise. */
  beltY: number;
  hoodY: number;
  roofY: number;
  cowlZ: number;
  halfWidth: number;
  /** Grille de protection devant le pare-brise (véhicules de maintien de l'ordre). */
  grille: boolean;
  /** Affaissement quand les pneus ont brûlé (m). */
  sag: number;
}

export function emptyMeta(def: VehicleDef): ModelMeta {
  return {
    wheelRadius: 0.32, doors: [], head: [], tail: [], beaconA: [], beaconB: [], fire: [0, def.height * 0.5, 0],
    rotor: false, cockpit: 'none', beltY: def.height * 0.6, hoodY: def.height * 0.55, roofY: def.height,
    cowlZ: def.length * 0.25, halfWidth: def.width / 2, grille: false, sag: 0.08,
  };
}

/** Constructeur de modèle : remplit `g` (détaillé ou lointain) aux dimensions de `def` et retourne ses repères. */
export type ModelBuilder = (g: Geo, far: boolean, def: VehicleDef) => ModelMeta;
