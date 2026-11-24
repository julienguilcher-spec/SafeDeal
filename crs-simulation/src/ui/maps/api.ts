/* =====================================================================================
 * CARTES — types publics du module src/ui/maps.
 *
 * Les autres modules n'importent que des TYPES depuis ce fichier :
 *   import type { MapsApi } from '@/ui/maps/api';
 *   const maps = ctx.service<MapsApi>('ui.maps');      // repère GPS, cible suivie, itinéraire
 *
 * Écrans enregistrés auprès de UiKit : 'carte' (plan de Paris). Données d'ouverture facultatives :
 *   ctx.ui.open('carte', { x, z, mpp?, search? } satisfies PlanOpenData)
 * Élément de HUD : 'maps.minimap' (zone 'top-left').
 * ===================================================================================== */

import type { RadioChannel } from '@/core/contracts';

/** Clé du service de dessin de fond de carte attendu du module du monde (facultatif). */
export const MAP2D_SERVICE = 'world.map2d';
/** Clé du service publié par ce module. */
export const MAPS_SERVICE = 'ui.maps';

/** Options de dessin d'un fond de carte. Tout est facultatif. */
export interface Map2dOptions {
  /** Taille de la zone à couvrir, en pixels du canevas (défaut : tout le canevas). */
  width?: number;
  height?: number;
  /** Pixels du canevas par pixel CSS : épaisseurs minimales et tailles de texte (défaut 1). */
  pixelRatio?: number;
  /** Noms de rues et de lieux (défaut true). */
  labels?: boolean;
  /** Niveau de détail : 'mini' allège le dessin pour la mini-carte (défaut 'plan'). */
  detail?: 'plan' | 'mini';
}

/**
 * Fond de carte 2D. Contrat attendu du service 'world.map2d' s'il existe ; le repli interne
 * (dessin à partir de ctx.world) implémente la même interface.
 *   - le point (centerX, centerZ) du monde est dessiné au CENTRE de la zone (width × height) ;
 *   - metersPerPixel : mètres du monde par pixel du canevas ;
 *   - rotation : radians, 0 = nord en haut (ce module n'appelle le service qu'avec 0 et fait
 *     tourner lui-même la mini-carte) ;
 *   - le dessin couvre toute la zone (fond compris) sans modifier durablement l'état du contexte.
 */
export interface Map2dService {
  draw(
    g: CanvasRenderingContext2D, centerX: number, centerZ: number, metersPerPixel: number, rotation: number,
    options?: Map2dOptions,
  ): void;
  /** Incrémenté quand le contenu dessiné change (tuile chargée…) : le cache est alors refait. */
  readonly revision?: number;
}

/** Cible suivie par le GPS. */
export interface GpsTarget {
  x: number;
  z: number;
  label: string;
  /** Origine : repère posé par le joueur, objectif suivi, incident confié. */
  source: 'repere' | 'objectif' | 'incident';
}

/** Service 'ui.maps'. */
export interface MapsApi {
  /** Repère GPS posé par le joueur (null si aucun). */
  readonly waypoint: GpsTarget | null;
  setWaypoint(x: number, z: number, label?: string): void;
  clearWaypoint(): void;
  /** Cible actuellement suivie : repère du joueur, sinon objectif suivi, sinon incident confié. */
  readonly target: GpsTarget | null;
  /** Itinéraire courant vers la cible [x0, z0, x1, z1, …] (vide si aucun). */
  readonly route: readonly number[];
  /** Distance restante le long de l'itinéraire (m), ou distance à vol d'oiseau faute d'itinéraire ; −1 sans cible. */
  readonly distance: number;
}

/** Données d'ouverture de l'écran 'carte'. */
export interface PlanOpenData {
  x?: number;
  z?: number;
  /** Mètres par pixel souhaités. */
  mpp?: number;
  /** Texte de recherche initial. */
  search?: string;
}

/** Ce qu'un rôle peut légitimement voir sur une carte. */
export interface MapVisibility {
  /** Positions des forces de l'ordre (unités, véhicules) et tracés d'ordres. */
  police: boolean;
  /** Secours officiels (pompiers, SAMU) et appels en cours. */
  rescue: boolean;
  /** Foule : partout (commandement, drone) ou seulement ce que l'on voit autour de soi. */
  crowd: 'full' | 'near';
  /** Gaz et feux : partout ou seulement autour de soi. */
  hazards: 'full' | 'near';
  /** Incidents : tous, ceux qui concernent les secours, ceux que l'on voit, aucun. */
  incidents: 'all' | 'secours' | 'near' | 'none';
  closures: boolean;
  metro: boolean;
  /** Parcours déclaré et tête de cortège. */
  route: boolean;
  objectives: boolean;
  /** Rayon de perception pour les couches « near » (m). */
  nearRadius: number;
  /** Canaux radio audibles. */
  radio: readonly RadioChannel[];
}
