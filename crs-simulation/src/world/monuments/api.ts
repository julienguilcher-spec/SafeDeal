/* Service étendu du module « monuments » : ctx.service<MonumentsApi>('monuments'). */
import type { LandmarkInfo } from '@/core/contracts';
import type { MonumentCollider } from './types';

export interface MonumentsStats {
  /** Monuments de la carte disposant d'un modèle. */
  known: number;
  /** Modèles détaillés et silhouettes actuellement affichés. */
  detailed: number;
  distant: number;
  /** Triangles et appels de dessin des modèles affichés. */
  triangles: number;
  drawCalls: number;
  /** Niveau d'illumination nocturne 0..1 et scintillement 0..1. */
  night: number;
  sparkle: number;
  /** Silhouettes d'horizon (repères hors carte) affichées ; elles ne comptent ni dans `known` ni dans `distant`. */
  horizon: number;
  /** Triangles et appels de dessin des silhouettes d'horizon affichées. */
  horizonTriangles: number;
  horizonDrawCalls: number;
}

/**
 * Service facultatif attendu par le module des immeubles (et utile au mobilier) : ctx.service<WorldMonumentsApi>('world.monuments').
 * `has(clé)` : un monument modélisé remplace-t-il le bâti générique marqué de cette clé (Building.landmarkKey,
 * RoadEdge.landmarkKey) ? `covers(x, z)` : ce point est-il dans l'emprise d'un repère SUPPLÉMENTAIRE (monument modélisé
 * absent de landmarks.json, donc sans clé sur les bâtiments de la carte : portes Saint-Denis et Saint-Martin…) ou dans un
 * obstacle plein d'un monument affiché ? Un bâtiment ou un mobilier générique dont le centre est « couvert » fait
 * double emploi avec le modèle.
 */
export interface WorldMonumentsApi {
  has(key: string): boolean;
  covers(x: number, z: number): boolean;
  /** Clés des silhouettes d'horizon dessinées par ce module (pour ne pas les dessiner deux fois). */
  horizonKeys(): string[];
}

export interface MonumentsApi {
  /** Ce monument (clé de LandmarkInfo) possède-t-il un modèle ? */
  has(key: string): boolean;
  /** Clés de tous les monuments modélisés. */
  keys(): string[];
  /** Obstacles au sol d'un monument de la carte, en coordonnées monde. */
  collidersOf(lm: LandmarkInfo): MonumentCollider[];
  /** Repères de la carte complétés par les repères supplémentaires du module (portes des Grands Boulevards…). */
  landmarks(): readonly LandmarkInfo[];
  stats(): MonumentsStats;
  /**
   * Prépare à l'avance les matériaux et textures des monuments donnés (toutes les définitions si omis) : à appeler
   * pendant un écran de chargement pour éviter un à-coup à la première apparition. Sans effet en mode headless.
   */
  prewarm(keys?: readonly string[]): void;
}
