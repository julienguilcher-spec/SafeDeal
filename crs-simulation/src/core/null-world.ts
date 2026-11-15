/* =====================================================================================
 * Monde neutre (WorldQuery) : plan infini à y = 0, sans bâti, sans obstacle, sans rues.
 * Remplacé par le module du monde (src/world/query) dès qu'il est branché.
 *
 *   - bounds : emprise nominale du jeu (docs/BRIEF.md §3) — indicative, rien n'arrête les
 *     déplacements au-delà ;
 *   - findPath : ligne droite ; randomFreePoint : point uniforme dans le disque demandé ;
 *   - graphe routier vide : node()/edge() renvoient une sentinelle d'identifiant −1
 *     (toujours tester nodeCount / edgeCount ou le retour de nearestRoad) ;
 *   - tout est « chargé » : isLoaded = true, whenLoaded résolue immédiatement.
 * ===================================================================================== */

import type {
  LandmarkInfo, MapFurnitureInfo, MapShopInfo, PlaceInfo, RayHit, RoadEdgeInfo, RoadNodeInfo, RoadSample,
  SurfaceKind, Vec2, WorldBounds, WorldQuery,
} from './contracts';
import { put, truncate } from './arrays';

/** Emprise nominale du cœur de Paris dans le repère du jeu (m), d'après la projection du BRIEF. */
export const NOMINAL_BOUNDS: Readonly<WorldBounds> = Object.freeze({
  minX: -2656, minZ: -1375, maxX: 3758, maxZ: 1739,
});

const NO_NODE: RoadNodeInfo = Object.freeze({
  id: -1, x: 0, z: 0, signal: false, crossing: false, edges: Object.freeze([]) as readonly number[],
});

const NO_EDGE: RoadEdgeInfo = Object.freeze({
  id: -1, a: -1, b: -1, points: Object.freeze([]) as readonly number[], length: 0, width: 0,
  lanesForward: 0, lanesBackward: 0, oneway: false, roadClass: 'footway', name: '', bridge: false,
  sett: false, speedLimit: 0, sidewalk: 0, pedestrianOnly: true,
} as RoadEdgeInfo);

const NO_PLACES: readonly PlaceInfo[] = Object.freeze([]);
const NO_LANDMARKS: readonly LandmarkInfo[] = Object.freeze([]);
const NO_SHOPS: readonly MapShopInfo[] = Object.freeze([]);
const NO_FURNITURE: readonly MapFurnitureInfo[] = Object.freeze([]);

/** Remplit un RayHit avec « rien touché » (le point final est l'extrémité du segment). */
export function clearRayHit(out: RayHit, bx: number, bz: number): void {
  out.hit = false;
  out.t = 1;
  out.x = bx;
  out.z = bz;
  out.nx = 0;
  out.nz = 0;
  out.kind = 'none';
  out.id = 0;
  out.height = 0;
}

/** Crée un RayHit réutilisable. */
export function makeRayHit(): RayHit {
  return { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
}

export interface NullWorld extends WorldQuery {
  /** Dernier centre d'intérêt reçu par setFocus (diagnostic et tests). */
  readonly focusX: number;
  readonly focusZ: number;
}

export function createNullWorld(): NullWorld {
  let focusX = 0;
  let focusZ = 0;
  const loaded = Promise.resolve();
  return {
    ready: true,
    bounds: { ...NOMINAL_BOUNDS },
    tileSize: 512,
    attribution: '',
    waterLevel: -4,

    heightAt(): number {
      return 0;
    },
    surfaceAt(): SurfaceKind {
      return 'plaza';
    },
    buildingHeightAt(): number {
      return 0;
    },

    resolveCircle(_pos: Vec2, _radius: number): boolean {
      return false;
    },
    isFree(): boolean {
      return true;
    },
    raycast(_ax: number, _az: number, bx: number, bz: number, out: RayHit): boolean {
      clearRayHit(out, bx, bz);
      return false;
    },
    lineOfSight(): boolean {
      return true;
    },

    nodeCount: 0,
    edgeCount: 0,
    node(): RoadNodeInfo {
      return NO_NODE;
    },
    edge(): RoadEdgeInfo {
      return NO_EDGE;
    },
    nearestRoad(_x: number, _z: number, _out: RoadSample): boolean {
      return false;
    },
    findPath(ax: number, az: number, bx: number, bz: number, _mode: 'foot' | 'vehicle', out: number[]): boolean {
      put(out, 0, ax);
      put(out, 1, az);
      put(out, 2, bx);
      put(out, 3, bz);
      truncate(out, 4);
      return true;
    },
    randomFreePoint(
      x: number, z: number, radius: number, _surface: 'sidewalk' | 'road' | 'any', rand: () => number, out: Vec2,
    ): boolean {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      out.x = x + Math.cos(a) * r;
      out.z = z + Math.sin(a) * r;
      return true;
    },

    places: NO_PLACES,
    landmarks: NO_LANDMARKS,
    placeByName(): PlaceInfo | null {
      return null;
    },
    sectorName(): string {
      return 'secteur inconnu';
    },

    setFocus(x: number, z: number): void {
      focusX = x;
      focusZ = z;
    },
    isLoaded(): boolean {
      return true;
    },
    whenLoaded(): Promise<void> {
      return loaded;
    },
    shopsInTile(): readonly MapShopInfo[] {
      return NO_SHOPS;
    },
    furnitureInTile(): readonly MapFurnitureInfo[] {
      return NO_FURNITURE;
    },

    get focusX(): number {
      return focusX;
    },
    get focusZ(): number {
      return focusZ;
    },
  };
}
