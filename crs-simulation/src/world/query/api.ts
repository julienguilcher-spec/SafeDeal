/* =====================================================================================
 * MONDE (simulation) — types publics du module src/world/query.
 *
 * Les autres modules n'importent que des TYPES depuis ce fichier :
 *   import type { WorldData, WorldQueryExt } from '@/world/query/api';
 *   const data = ctx.service<WorldData>('world.data');      // données de carte décodées (rendu)
 *   const ext = ctx.service<WorldQueryExt>('world.query');  // WorldQuery + méthodes hors contrat
 *
 * Événements libres émis sur ctx.events (emitAny) :
 *   'world:source'  { name, fallback }  — le jeu de données a changé (Paris ↔ quartier d'essai).
 *                                         Toutes les tuiles ont été déchargées juste avant.
 * ===================================================================================== */

import type { SurfaceKind, Vec2, WorldQuery } from '@/core/contracts';
import type {
  Landmark, Manifest, ManifestTile, Place, RawLandmarks, RawPlaces, RawRoadGraph, RawTerrain, RawTile, RoadGraph,
  Terrain, Tile,
} from '../mapdata';

/** Clé du service de données de carte publié pour le rendu. */
export const WORLD_DATA_SERVICE = 'world.data';
/** Clé du service « WorldQuery étendu » (le même objet que ctx.world, avec ses méthodes hors contrat). */
export const WORLD_QUERY_SERVICE = 'world.query';
/** Nom de l'événement libre émis quand le jeu de données change. */
export const WORLD_SOURCE_EVENT = 'world:source';

/** Charge utile de l'événement libre « world:source ». */
export interface WorldSourceEvent {
  /** Nom du manifeste installé : 'paris' ou 'test-district'. */
  name: string;
  /** true si le quartier d'essai remplace des données de Paris introuvables. */
  fallback: boolean;
}

/**
 * Source de données de carte : rend les fichiers BRUTS (ceux de public/data/paris/). Le décodage
 * est fait par le magasin. Toutes les méthodes peuvent échouer (promesse rejetée).
 */
export interface MapSource {
  /** Libellé pour les journaux (« fetch ./data/paris/ », « mémoire », « fichiers … »). */
  readonly label: string;
  /** manifest.json (non contrôlé : le magasin appelle parseManifest). */
  manifest(): Promise<unknown>;
  /** Une tuile annoncée par le manifeste. */
  tile(entry: ManifestTile): Promise<RawTile>;
  /**
   * Lecture SYNCHRONE d'une tuile (facultative : source sur disque, sous Node). Sans rendu (headless), le magasin de
   * tuiles s'en sert pour charger chaque tuile au moment même où elle est demandée : ce qui est chargé à un pas de
   * simulation donné ne dépend plus de la vitesse du disque ni de la charge de la machine (même graine → même
   * déroulement). Le navigateur garde la lecture asynchrone, étalée entre les images.
   */
  tileSync?(entry: ManifestTile): RawTile;
  roadGraph(manifest: Manifest): Promise<RawRoadGraph>;
  places(manifest: Manifest): Promise<RawPlaces>;
  landmarks(manifest: Manifest): Promise<RawLandmarks>;
  terrain(manifest: Manifest): Promise<RawTerrain>;
}

/**
 * Service 'world.data' : données de carte DÉCODÉES, pour le rendu de la ville. L'objet est stable
 * (on peut le garder), mais ses champs changent quand le jeu de données change (événement
 * 'world:source') : toujours les relire, ne pas les copier une fois pour toutes.
 */
export interface WorldData {
  readonly manifest: Manifest;
  readonly roadGraph: RoadGraph;
  readonly places: readonly Place[];
  readonly landmarks: readonly Landmark[];
  readonly terrain: Terrain;
  /** Tuile décodée si elle est chargée, sinon null. Lecture seule : ne pas modifier ses tableaux. */
  tile(tx: number, tz: number): Tile | null;
  /** Clés (tileKey : « tx_tz ») des tuiles chargées. Tableau interne : ne pas le modifier ni le conserver. */
  loadedKeys(): readonly string[];
}

/** Obstacle au sol d'un monument (même forme que MonumentCollider de src/world/monuments/types.ts). */
export interface ColliderLike {
  /** Polygone LOCAL [x0, z0, …] (origine = ancrage du monument, façade vers +z). */
  ring: ArrayLike<number>;
  /** Épaisseur verticale au-dessus de baseY (m). */
  height: number;
  /** Altitude du dessous ; au-delà de 2,5 m on passe dessous. */
  baseY: number;
}

/** Site d'un monument dans son repère local (même forme que MonumentSite). */
export interface ColliderSite {
  footprint: ArrayLike<number>;
  height: number;
  seed?: number;
}

/** Signature attendue de getColliders (src/world/monuments/colliders.ts). */
export type GetColliders = (key: string, site: ColliderSite) => readonly ColliderLike[] | null | undefined;

/** Options du module (voir createWorldQuerySystems). */
export interface WorldQueryOptions {
  /**
   * 'auto' (défaut) : quartier d'essai si la session est en mode 'test' (ou ?map=test, ou
   * ?autostart=test), sinon Paris ; 'test' : toujours le quartier d'essai ; 'paris' : toujours Paris.
   */
  source?: 'auto' | 'test' | 'paris';
  /** Source à utiliser pour « Paris » (défaut : fetch dans le navigateur, fichiers sous Node). */
  parisSource?: MapSource;
  /** URL de base des données de Paris pour la source fetch (défaut './data/paris/'). */
  baseUrl?: string;
  /** Dossier des données de Paris sous Node (défaut '<dossier courant>/public/data/paris'). */
  fsDir?: string;
  /** Graine du quartier d'essai (défaut 1). */
  testSeed?: number;
  /** Rayon de chargement des tuiles autour du centre d'intérêt (m, défaut 700). */
  loadRadius?: number;
  /** Rayon au-delà duquel une tuile est déchargée (m, défaut 1100). */
  unloadRadius?: number;
  /**
   * Obstacles des monuments : fonction fournie (tests), null = aucun, undefined (défaut) = chargement
   * facultatif de src/world/monuments/colliders.ts s'il existe.
   */
  colliders?: GetColliders | null;
}

/** Compteurs de diagnostic. */
export interface WorldQueryStats {
  source: string;
  fallback: boolean;
  tilesLoaded: number;
  tilesLoading: number;
  tilesFailed: number;
  /** Segments d'obstacles en mémoire (tuiles chargées + monuments). */
  segments: number;
  /** Polygones pleins (bâtiments, plans d'eau, monuments). */
  solids: number;
  /** Grilles de surfaces rasterisées (≈ 0,8 Mo chacune). */
  grids: number;
  /** Temps cumulés (ms) depuis l'installation du jeu de données. */
  decodeMs: number;
  collisionBuildMs: number;
  rasterMs: number;
}

/** Vue en lecture seule d'un segment d'obstacle (banc d'essai, diagnostic). */
export interface ObstacleSegmentView {
  ax: number; az: number; bx: number; bz: number;
  /** 'building' | 'barrier' | 'bank' | 'landmark' */
  kind: string;
  height: number;
  /** Bloque la vue (lineOfSight). */
  sight: boolean;
}

/** WorldQuery + méthodes hors contrat, publié sous la clé 'world.query'. */
export interface WorldQueryExt extends WorldQuery {
  /**
   * Déplacement sûr : amène le disque de (fromX, fromZ) à `pos` par sous-pas d'au plus un rayon,
   * en résolvant les collisions à chaque sous-pas (aucune traversée, quelle que soit la vitesse).
   */
  sweepCircle(fromX: number, fromZ: number, pos: Vec2, radius: number): boolean;
  /** Le point est-il dans un obstacle plein (bâtiment, monument, eau hors pont) ? */
  isSolidAt(x: number, z: number): boolean;
  /** Nature du sol sans passer par les chaînes : code de SURFACE_CODES. */
  surfaceCodeAt(x: number, z: number): number;
  /** Fin du chargement en cours du jeu de données (résolue tout de suite s'il n'y en a pas). */
  whenReady(): Promise<void>;
  /** Parcourt les segments d'obstacles chargés qui touchent le rectangle (diagnostic : alloue). */
  forEachObstacle(minX: number, minZ: number, maxX: number, maxZ: number, visit: (s: ObstacleSegmentView) => void): void;
  stats(): WorldQueryStats;
}

/** Codes de surface de la grille (indice = code). */
export const SURFACE_CODES: readonly SurfaceKind[] = [
  'void', 'road', 'sidewalk', 'plaza', 'sett', 'park', 'gravel', 'water', 'building', 'bridge', 'quay', 'interior',
];
