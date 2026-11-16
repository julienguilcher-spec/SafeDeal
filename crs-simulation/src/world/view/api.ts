/* =====================================================================================
 * VILLE EN 3D — types publics du module src/world/view.
 *   import type { WorldViewApi } from '@/world/view/api';
 *   const view = ctx.service<WorldViewApi>('world.view');
 *   import type { Map2dApi } from '@/world/view/api';
 *   const map = ctx.service<Map2dApi>('world.map2d');
 * ===================================================================================== */

import type { Tile } from '../mapdata';

export type { Map2dApi, Map2dOptions } from './map2d';

/** Clés des services publiés. */
export const WORLD_VIEW_SERVICE = 'world.view';
export const WORLD_MAP2D_SERVICE = 'world.map2d';

export interface WorldViewStats {
  quality: string;
  /** Tuiles affichées en version détaillée et en version lointaine. */
  detailTiles: number;
  farTiles: number;
  /** Travaux en attente (tuiles à construire) et lectures de tuiles lointaines en cours. */
  queued: number;
  fetching: number;
  /** Hors immeubles : triangles et appels de dessin des tuiles (tous niveaux) et du lointain. */
  triangles: number;
  drawCalls: number;
  /** Immeubles (module voisin) : triangles et appels de dessin. */
  buildingTriangles: number;
  buildingDrawCalls: number;
  /** Maximum d'appels de dessin d'une tuile détaillée, hors immeubles. */
  maxDetailDrawCalls: number;
  /** Mémoire de la carte graphique (octets) : propre aux tuiles (géométries, textures de tuile), puis partagée (atlas…). */
  tileGpuBytes: number;
  sharedGpuBytes: number;
  /** Construction : temps de la dernière tuile détaillée et lointaine (ms, hors immeubles), plus longue étape (ms) depuis le démarrage. */
  lastDetailMs: number;
  lastFarMs: number;
  maxStepMs: number;
  /** Tuile et étape de cette plus longue étape (diagnostic). */
  maxStepLabel: string;
  /** Plus long temps passé par les immeubles d'une tuile (étape indivisible du module voisin). */
  maxBuildingMs: number;
  /** Temps de construction dépensé pendant la dernière image (ms). */
  lastFrameBuildMs: number;
  /** Peinture des textures partagées (ms). */
  paintMs: number;
}

/** Fournit les données d'une tuile hors du rayon de chargement de la simulation (vue lointaine). null si indisponible. */
export type FarTileProvider = (tx: number, tz: number, file: string) => Promise<Tile | null>;

export interface WorldViewOptions {
  /**
   * Données des tuiles lointaines : fonction fournie, null = aucune (seules les tuiles chargées par la
   * simulation sont dessinées), undefined (défaut) = lecture par fetch des fichiers de la carte de Paris.
   */
  farTiles?: FarTileProvider | null;
  /** URL de base des fichiers de la carte pour la lecture par défaut (défaut './data/paris/'). */
  baseUrl?: string;
  /** Dessiner les immeubles (défaut : oui). */
  buildings?: boolean;
  /** Dessiner le lointain : socle, silhouette, repères (défaut : oui). */
  horizon?: boolean;
  /** Graine des variations d'aspect (défaut 1). */
  seed?: number;
}

export interface WorldViewApi {
  stats(): WorldViewStats;
  /**
   * Surélévation (m) du sol DESSINÉ par rapport à ctx.world.heightAt en ce point : hauteur de bordure
   * sur un trottoir, 0 sur la chaussée. Pour poser pieds, roues et décalcomanies exactement sur le sol visible.
   */
  liftAt(x: number, z: number): number;
  /** Nombre de tuiles encore à construire ou à lire. */
  pending(): number;
  /**
   * Construit sans attendre tout ce qui est en file (écran de chargement, captures) : au plus
   * `maxMs` millisecondes. Retourne true si la file est vide.
   */
  flush(maxMs?: number): boolean;
  /** Promesse résolue quand tout ce qui entoure la caméra est construit (lectures lointaines comprises). */
  whenIdle(): Promise<void>;
  /**
   * Mesure (diagnostic) : construit `runs` fois la version détaillée d'une tuile chargée, hors scène et
   * sans les immeubles, et rend les durées. Pour écarter le bruit d'une machine chargée, chaque étape
   * est créditée de sa durée la plus courte sur l'ensemble des essais. null si la tuile n'est pas chargée.
   */
  benchTile(tx: number, tz: number, runs?: number): TileBench | null;
}

export interface TileBench {
  /** Nombre d'étapes de la construction. */
  steps: number;
  /** Durée totale (ms) : somme des durées minimales des étapes. */
  totalMs: number;
  /** Plus longue étape (ms), et son nom. */
  maxStepMs: number;
  maxStepLabel: string;
  /** Nombre d'étapes de plus de 4 ms et de plus de 8 ms. */
  over4: number;
  over8: number;
  triangles: number;
  drawCalls: number;
  gpuBytes: number;
}
