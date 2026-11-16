/* =====================================================================================
 * Jeu de données installé : fichiers de base décodés (manifeste, graphe, lieux, monuments,
 * relief) et tout ce qui en dérive une fois pour toutes (réseau de rues, itinéraires, index
 * des lieux, obstacles des monuments, magasin de tuiles).
 * ===================================================================================== */

import {
  attributionText, createManifest, decodeLandmarks, decodePlaces, decodeRoadGraph, decodeTerrain, parseManifest,
  terrainFromFunction,
} from '../mapdata';
import type { Landmark, Manifest, Place, RoadGraph, Terrain } from '../mapdata';
import type { GetColliders, MapSource } from './api';
import type { CollisionBucket } from './collision';
import { SOLID_LANDMARK } from './collision';
import { buildLandmarkObstacles } from './monuments';
import type { LandmarkObstacleSet } from './monuments';
import { BucketBuilder } from './obstacles';
import { PathFinder } from './pathfind';
import { PlaceIndex } from './places';
import { RoadNetwork } from './roads';
import { MemoryMapSource } from './sources';
import { TileStore } from './tiles';
import type { TileHost } from './tiles';

/** Fichiers de base décodés. */
export interface DecodedBase {
  source: MapSource;
  manifest: Manifest;
  roadGraph: RoadGraph;
  places: Place[];
  landmarks: Landmark[];
  terrain: Terrain;
}

/** Lit et décode les fichiers de base d'une source. Rejette si le manifeste est absent ou invalide. */
export async function loadBase(source: MapSource): Promise<DecodedBase> {
  const manifest = parseManifest(await source.manifest());
  const [graph, places, landmarks, terrain] = await Promise.all([
    source.roadGraph(manifest), source.places(manifest), source.landmarks(manifest), source.terrain(manifest),
  ]);
  return {
    source,
    manifest,
    roadGraph: decodeRoadGraph(graph),
    places: decodePlaces(places),
    landmarks: decodeLandmarks(landmarks),
    terrain: decodeTerrain(terrain),
  };
}

/** Jeu de données vide (avant tout chargement) : aucune tuile, aucune voie, terrain plat. */
export function emptyBase(): DecodedBase {
  const manifest = createManifest({
    name: 'vide',
    tiles: [],
    bounds: { minX: -1, minZ: -1, maxX: 1, maxZ: 1 },
    attribution: [{ source: '', license: '', text: '' }],
  });
  const raw = {
    manifest,
    tiles: [],
    roadGraph: { v: 1, str: [''], nodes: { n: 0, xz: [] }, edges: { n: 0, a: [], b: [], w: [] } },
    places: { v: 1, n: 0, name: [], xz: [] },
    landmarks: { v: 1, n: 0, key: [], name: [], xz: [], h: [], len: [], fxz: [] },
    terrain: { v: 1, x0: -1, z0: -1, step: 2, nx: 2, nz: 2, scale: 0.1, h: [0, 0, 0, 0] },
  };
  return {
    source: new MemoryMapSource(raw, 'vide'),
    manifest,
    roadGraph: { version: 1, nodes: [], edges: [] },
    places: [],
    landmarks: [],
    terrain: terrainFromFunction(-1, -1, 2, 2, 2, () => 0),
  };
}

export class WorldBase {
  readonly decoded: DecodedBase;
  readonly manifest: Manifest;
  readonly terrain: Terrain;
  readonly attribution: string;
  readonly roads: RoadNetwork;
  readonly paths: PathFinder;
  readonly placeIndex: PlaceIndex;
  readonly store: TileStore;
  /** Obstacles des monuments (lot permanent) et clés des monuments qui remplacent leurs bâtiments. */
  landmarkSet: LandmarkObstacleSet;
  landmarkBucket: CollisionBucket;
  /** Temps de construction des structures dérivées (ms). */
  readonly buildMs: number;

  constructor(decoded: DecodedBase, host: TileHost, loadRadius: number, unloadRadius: number, colliders: GetColliders | null) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.decoded = decoded;
    this.manifest = decoded.manifest;
    this.terrain = decoded.terrain;
    this.attribution = attributionText(decoded.manifest);
    this.roads = new RoadNetwork(decoded.roadGraph, decoded.terrain);
    this.paths = new PathFinder(this.roads, decoded.manifest.bounds);
    this.placeIndex = new PlaceIndex(decoded.places, decoded.landmarks);
    this.store = new TileStore(decoded.source, decoded.manifest, host, loadRadius, unloadRadius);
    this.landmarkSet = { replaced: new Set<string>(), obstacles: [], fallback: [] };
    this.landmarkBucket = new BucketBuilder(null, null).build();
    this.setColliders(colliders);
    this.buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  }

  /** (Re)construit les obstacles des monuments à partir de getColliders. */
  setColliders(colliders: GetColliders | null): void {
    // Un ouvrage porté par une arête du graphe (pont modélisé à la main) n'est jamais un obstacle plein.
    const bridgeKeys = new Set<string>();
    for (const ed of this.decoded.roadGraph.edges) if (ed.landmarkKey !== '') bridgeKeys.add(ed.landmarkKey);
    this.landmarkSet = buildLandmarkObstacles(this.decoded.landmarks, colliders, bridgeKeys);
    const builder = new BucketBuilder(this.roads, null);
    for (const o of this.landmarkSet.obstacles) builder.addSolid([o.ring], SOLID_LANDMARK, o.top);
    this.landmarkBucket = builder.build();
  }
}
