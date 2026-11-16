/* =====================================================================================
 * IMMEUBLES DE PARIS — vue 3D des bâtiments d'une tuile
 * -------------------------------------------------------------------------------------
 * Interface publique du dossier :
 *   buildTileBuildings(tile, opts)     version détaillée (façades texturées, balcons, toits)
 *   buildTileBuildingsFar(tile, opts)  version lointaine (prismes teintés, 1 appel de dessin)
 *   disposeSharedBuildingResources()   libère l'atlas, les matériaux et les tampons communs
 *
 * Les objets retournés sont en coordonnées MONDE : le groupe est placé à l'origine de la tuile
 * (tx·512, 0, tz·512) et ses sommets lui sont relatifs (meilleure précision), il suffit de
 * l'ajouter tel quel au groupe du monde. Les maillages ne répondent pas au lancer de rayon de
 * Three.js (les collisions passent par WorldQuery) et leurs tableaux sont libérés après l'envoi
 * à la carte graphique.
 *
 * Organisation : rings.ts, triangulate.ts, layout.ts (géométrie et trame, logique pure) ;
 * prepare.ts, walls.ts, roofs.ts, generate.ts (maillages, logique pure) ; paint*.ts, atlas.ts
 * (textures sur canvas) ; materials.ts (shaders).
 * ===================================================================================== */

import * as THREE from 'three';
import type { EnvState, QualityLevel } from '../../../core/contracts';
import { TILE_SIZE } from '../../mapdata';
import type { Tile } from '../../mapdata';
import { createFacadeAtlas, createRailTexture } from './atlas';
import type { FacadeAtlas } from './atlas';
import { generateTileFarMesh, generateTileMeshes } from './generate';
import { buildingUniforms, createFacadeMaterial, createFarMaterial, createRailMaterial, updateBuildingUniforms } from './materials';
import { MeshData } from './meshdata';
import { releasePrepareScratch } from './prepare';
import { releaseRoofScratch } from './roofs';

export interface BuildingViewOptions {
  quality: QualityLevel;
  /** Altitude du sol (m) en un point du monde : la même fonction que celle du maillage du sol. */
  heightAt(x: number, z: number): number;
  /** Vrai si le monument de cette clé a son propre modèle : les bâtiments qui la portent sont ignorés. */
  skipLandmark(key: string): boolean;
  seed: number;
}

export interface TileBuildingsView {
  object: THREE.Object3D;
  /** À appeler quand l'heure ou le ciel changent (ou à chaque image : coût négligeable). */
  update(env: EnvState, camX: number, camY: number, camZ: number): void;
  /** Libère les géométries de la tuile et détache l'objet de son parent. */
  dispose(): void;
  triangles: number;
  drawCalls: number;
}

/** Réglages par qualité. */
interface QualityPreset { cellSize: number; anisotropy: number; lambert: boolean; detail: boolean; paintedBalconies: boolean }

const PRESETS: Record<QualityLevel, QualityPreset> = {
  bas: { cellSize: 128, anisotropy: 2, lambert: true, detail: false, paintedBalconies: true },
  moyen: { cellSize: 256, anisotropy: 4, lambert: false, detail: false, paintedBalconies: false },
  haut: { cellSize: 256, anisotropy: 8, lambert: false, detail: true, paintedBalconies: false },
  ultra: { cellSize: 512, anisotropy: 16, lambert: false, detail: true, paintedBalconies: false },
};

interface SharedSet {
  atlas: FacadeAtlas;
  facade: THREE.Material;
  railTexture: THREE.Texture | null;
  rail: THREE.Material | null;
}

const sharedSets = new Map<QualityLevel, SharedSet>();
let farMaterial: THREE.Material | null = null;
let scratchMain: MeshData | null = null;
let scratchRail: MeshData | null = null;
const boundsOut = new Float64Array(6);

/** Mesures de la dernière tuile construite (profilage). */
export interface BuildingBuildStats {
  /** Bâtiments dessinés, sommets, triangles, octets envoyés à la carte graphique (sommets + indices). */
  buildings: number;
  vertices: number;
  triangles: number;
  gpuBytes: number;
  /** Palier de détail retenu : 0 = le plus riche … 3 = le plus pauvre (version détaillée) ; palier de simplification (version lointaine). */
  step: number;
}
const lastStats: BuildingBuildStats = { buildings: 0, vertices: 0, triangles: 0, gpuBytes: 0, step: 0 };

/** Mesures de la dernière tuile construite par buildTileBuildings ou buildTileBuildingsFar. */
export function lastBuildingBuildStats(): BuildingBuildStats {
  return { ...lastStats };
}

/** Octets d'un maillage une fois sur la carte graphique. */
function meshBytes(m: MeshData, facade: boolean): number {
  return m.nv * (12 + 3 + 8 + (facade ? 3 + 4 : 0)) + m.ni * (m.nv <= 65535 ? 2 : 4);
}

/** Au-delà de cette distance (m) entre la caméra et la tuile, les garde-corps ne sont plus dessinés. */
const RAIL_DISTANCE = 260;

function sharedFor(quality: QualityLevel): SharedSet {
  let set = sharedSets.get(quality);
  if (!set) {
    const preset = PRESETS[quality] ?? PRESETS.moyen;
    const atlas = createFacadeAtlas({ cellSize: preset.cellSize, paintedBalconies: preset.paintedBalconies, anisotropy: preset.anisotropy });
    set = { atlas, facade: createFacadeMaterial(atlas.texture, { lambert: preset.lambert, detail: preset.detail }), railTexture: null, rail: null };
    sharedSets.set(quality, set);
  }
  return set;
}

function railMaterialFor(set: SharedSet, quality: QualityLevel): THREE.Material {
  if (!set.rail) {
    const preset = PRESETS[quality] ?? PRESETS.moyen;
    set.railTexture = createRailTexture(preset.cellSize, preset.anisotropy);
    set.rail = createRailMaterial(set.railTexture);
  }
  return set.rail;
}

/**
 * Prépare à l'avance les ressources partagées d'une qualité (peinture de l'atlas : quelques
 * dizaines à quelques centaines de millisecondes), pour ne pas les payer à la première tuile.
 * Retourne le temps de peinture de l'atlas (ms) et sa taille (octets, hors mipmaps).
 */
export function prepareSharedBuildingResources(quality: QualityLevel): { paintMs: number; bytes: number } {
  const set = sharedFor(quality);
  if (quality !== 'bas') railMaterialFor(set, quality);
  return { paintMs: set.atlas.paintMs, bytes: set.atlas.bytes };
}

function freeArray(this: THREE.BufferAttribute): void {
  // une fois sur la carte graphique, la copie en mémoire vive ne sert plus
  (this as unknown as { array: unknown }).array = EMPTY;
}
const EMPTY = new Float32Array(0);

function attribute(array: THREE.TypedArray, itemSize: number, normalized = false): THREE.BufferAttribute {
  const a = new THREE.BufferAttribute(array, itemSize, normalized);
  a.onUpload(freeArray);
  return a;
}

/** Convertit un tampon de maillage en géométrie (copie aux dimensions exactes). */
function toGeometry(m: MeshData, facade: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const nv = m.nv;
  g.setAttribute('position', attribute(m.pos.slice(0, nv * 3), 3));
  g.setAttribute('normal', attribute(m.nor.slice(0, nv * 3), 3, true));
  g.setAttribute('uv', attribute(m.uv.slice(0, nv * 2), 2));
  if (facade) {
    g.setAttribute('color', attribute(m.col.slice(0, nv * 3), 3, true));
    g.setAttribute('aFacade', attribute(m.fac.slice(0, nv * 4), 4));
  }
  const index = nv <= 65535 ? new Uint16Array(m.ni) : new Uint32Array(m.ni);
  index.set(m.idx.subarray(0, m.ni));
  g.setIndex(attribute(index, 1));
  m.bounds(boundsOut);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(boundsOut[0], boundsOut[1], boundsOut[2]), new THREE.Vector3(boundsOut[3], boundsOut[4], boundsOut[5]));
  g.boundingSphere = new THREE.Sphere();
  g.boundingBox.getBoundingSphere(g.boundingSphere);
  return g;
}

function noRaycast(): void { /* collisions et visées passent par WorldQuery, pas par ces maillages */ }

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = noRaycast;
  return mesh;
}

function tileGroup(tile: Tile, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}-${tile.tx}_${tile.tz}`;
  group.position.set(tile.tx * TILE_SIZE, 0, tile.tz * TILE_SIZE);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

/** Version détaillée des immeubles d'une tuile : 1 appel de dessin (qualité basse) ou 2 (avec les garde-corps). */
export function buildTileBuildings(tile: Tile, opts: BuildingViewOptions): TileBuildingsView {
  const set = sharedFor(opts.quality);
  const main = scratchMain ?? (scratchMain = new MeshData(65536));
  const rail = scratchRail ?? (scratchRail = new MeshData(8192));
  const stats = generateTileMeshes(tile, opts, main, rail);
  lastStats.buildings = stats.buildings; lastStats.step = stats.step; lastStats.triangles = stats.triangles;
  lastStats.vertices = main.nv + rail.nv;
  lastStats.gpuBytes = meshBytes(main, true) + meshBytes(rail, false);
  const group = tileGroup(tile, 'immeubles');
  const geometries: THREE.BufferGeometry[] = [];
  let drawCalls = 0;
  if (main.nv > 0) {
    const g = toGeometry(main, true);
    geometries.push(g);
    const mesh = makeMesh(g, set.facade, 'facades');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    drawCalls++;
  }
  let railMesh: THREE.Mesh | null = null;
  if (rail.nv > 0) {
    const g = toGeometry(rail, false);
    geometries.push(g);
    railMesh = makeMesh(g, railMaterialFor(set, opts.quality), 'garde-corps');
    railMesh.receiveShadow = true;
    group.add(railMesh);
    drawCalls++;
  }
  // centre de la tuile bâtie, pour le masquage des garde-corps au loin
  const cx = tile.tx * TILE_SIZE + TILE_SIZE / 2, cz = tile.tz * TILE_SIZE + TILE_SIZE / 2;
  const reach = RAIL_DISTANCE + TILE_SIZE * 0.71;
  return {
    object: group,
    triangles: stats.triangles,
    drawCalls,
    update(env: EnvState, camX: number, _camY: number, camZ: number): void {
      updateBuildingUniforms(env);
      if (railMesh) {
        const dx = camX - cx, dz = camZ - cz;
        railMesh.visible = dx * dx + dz * dz < reach * reach;
      }
    },
    dispose(): void {
      for (let i = 0; i < geometries.length; i++) geometries[i].dispose();
      geometries.length = 0;
      group.removeFromParent();
      group.clear();
    },
  };
}

/** Version lointaine : prismes simplifiés teintés, un seul appel de dessin, sans ombre portée. */
export function buildTileBuildingsFar(tile: Tile, opts: BuildingViewOptions): TileBuildingsView {
  const main = scratchMain ?? (scratchMain = new MeshData(65536));
  const stats = generateTileFarMesh(tile, opts, main);
  lastStats.buildings = stats.buildings; lastStats.step = stats.step; lastStats.triangles = stats.triangles;
  lastStats.vertices = main.nv;
  lastStats.gpuBytes = meshBytes(main, true);
  const group = tileGroup(tile, 'immeubles-loin');
  let geometry: THREE.BufferGeometry | null = null;
  if (main.nv > 0) {
    geometry = toGeometry(main, true);
    group.add(makeMesh(geometry, farMaterial ?? (farMaterial = createFarMaterial()), 'volumes'));
  }
  return {
    object: group,
    triangles: stats.triangles,
    drawCalls: geometry ? 1 : 0,
    update(env: EnvState): void {
      updateBuildingUniforms(env);
    },
    dispose(): void {
      if (geometry) geometry.dispose();
      geometry = null;
      group.removeFromParent();
      group.clear();
    },
  };
}

/**
 * Libère tout ce qui est partagé entre les tuiles : atlas de textures, matériaux, tampons de
 * génération. À appeler après avoir libéré les tuiles (changement de qualité, fin de partie) ;
 * tout est recréé à la demande.
 */
export function disposeSharedBuildingResources(): void {
  for (const set of sharedSets.values()) {
    set.atlas.texture.dispose();
    set.facade.dispose();
    if (set.railTexture) set.railTexture.dispose();
    if (set.rail) set.rail.dispose();
  }
  sharedSets.clear();
  if (farMaterial) { farMaterial.dispose(); farMaterial = null; }
  scratchMain = null;
  scratchRail = null;
  releasePrepareScratch();
  releaseRoofScratch();
}

/** Uniformes partagés (lecture seule) : proportion de fenêtres allumées, reflet du ciel — utile au débogage. */
export function buildingLightingState(): { litFraction: number; intensity: number; night: number } {
  const v = buildingUniforms.uLit.value;
  return { litFraction: v.x, intensity: v.y, night: v.z };
}
