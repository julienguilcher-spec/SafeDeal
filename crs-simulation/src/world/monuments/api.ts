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
}

export interface MonumentsApi {
  /** Ce monument (clé de LandmarkInfo) possède-t-il un modèle ? */
  has(key: string): boolean;
  /** Clés de tous les monuments modélisés. */
  keys(): string[];
  /** Obstacles au sol d'un monument de la carte, en coordonnées monde. */
  collidersOf(lm: LandmarkInfo): MonumentCollider[];
  stats(): MonumentsStats;
  /**
   * Prépare à l'avance les matériaux et textures des monuments donnés (toutes les définitions si omis) : à appeler
   * pendant un écran de chargement pour éviter un à-coup à la première apparition. Sans effet en mode headless.
   */
  prewarm(keys?: readonly string[]): void;
}
