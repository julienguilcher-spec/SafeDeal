/* =====================================================================================
 * VILLE EN 3D — vues d'une tuile (Three.js) : version détaillée et version lointaine.
 * -------------------------------------------------------------------------------------
 * Version détaillée, hors immeubles, au plus 7 appels de dessin :
 *   sol (nappe, trottoirs, bordures, tabliers, quais, marquages) · volumes (murs, haies,
 *   parapets, piles et arches : ils portent une ombre) · eau · panneaux découpés (grilles,
 *   garde-corps, symboles) · troncs · houppiers · halos des candélabres (la nuit).
 * Version lointaine : sol (une texture de couleurs sur un maillage grossier), houppiers simplifiés.
 * La construction est un générateur : la valeur rendue vaut 1 quand il faut attendre l'image suivante
 * (étape lourde indivisible, ou mise en scène progressive pour étaler l'envoi à la carte graphique).
 * ===================================================================================== */

import * as THREE from 'three';
import type { EnvState, QualityLevel } from '../../core/contracts';
import { TILE_SIZE, sampleTerrain } from '../mapdata';
import type { RoadEdge, RoadGraph, Terrain, Tile } from '../mapdata';
import { buildBarriers } from './barriers';
import { buildBridges } from './bridges';
import { buildTileBuildings, buildTileBuildingsFar } from './buildings/index';
import type { TileBuildingsView } from './buildings/index';
import { CODE_WATER } from './classes';
import type { BridgeProfile } from './decks';
import type { EdgeIndex } from './edgeindex';
import { GroundBuilder } from './ground';
import { createFarGroundMaterial, createGroundMaterial } from './materials';
import { MeshBuf } from './meshbuf';
import { bakeMacro, codeAt, createRaster, flushOverRaised, liftOfCode, rasterSteps, rasterizeTile } from './raster';
import type { TileRaster } from './raster';
import type { SharedResources } from './shared';
import { surfaceY } from './site';
import type { TileSite } from './site';
import { TIN_CELL, TIN_N, TileTin } from './tin';
import { buildTreeMeshes } from './trees';

/** Ce dont une tuile a besoin pour se construire (fourni par le système). */
export interface CityContext {
  shared: SharedResources;
  quality: QualityLevel;
  renderer: THREE.WebGLRenderer | null;
  graph: RoadGraph;
  terrain: Terrain;
  waterLevel: number;
  profile: BridgeProfile;
  edgeIndex: EdgeIndex;
  seed: number;
  /** Le monument de cette clé a-t-il son propre modèle (ses bâtiments ne sont alors pas extrudés) ? */
  skipLandmark(key: string): boolean;
  /** L'ouvrage de ce pont est-il dessiné par un monument modélisé ? */
  skipBridge(edge: RoadEdge): boolean;
  /** Dessiner les immeubles (faux : banc d'essai du sol seul). */
  buildings: boolean;
  /** Groupe en coordonnées monde qui reçoit les immeubles (leurs objets portent déjà l'origine de leur tuile). */
  root: THREE.Object3D;
}

export interface TileViewStats {
  triangles: number;
  drawCalls: number;
  /** Octets de géométrie et de textures propres à la tuile sur la carte graphique. */
  gpuBytes: number;
  buildingTriangles: number;
  buildingDrawCalls: number;
  /** Temps de construction cumulé (ms) et plus longue étape (ms), hors immeubles ; temps des immeubles. */
  buildMs: number;
  maxStepMs: number;
  buildingMs: number;
}

const EMPTY = new Float32Array(0);
function freeArray(this: THREE.BufferAttribute): void {
  // une fois sur la carte graphique, la copie en mémoire vive ne sert plus
  (this as unknown as { array: unknown }).array = EMPTY;
}

function attribute(array: THREE.TypedArray, itemSize: number, normalized = false): THREE.BufferAttribute {
  const a = new THREE.BufferAttribute(array, itemSize, normalized);
  a.onUpload(freeArray);
  return a;
}

const boundsOut = new Float64Array(6);

/** Convertit un tampon de maillage en géométrie (copie aux dimensions exactes). */
export function toGeometry(m: MeshBuf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const nv = m.nv;
  g.setAttribute('position', attribute(m.pos.slice(0, nv * 3), 3));
  g.setAttribute('normal', attribute(m.nor.slice(0, nv * 3), 3, true));
  g.setAttribute('aData', attribute(m.dat.slice(0, nv * 4), 4, true));
  if (m.uv !== null) g.setAttribute('uv', attribute(m.uv.slice(0, nv * 2), 2));
  const index = nv <= 65535 ? new Uint16Array(m.ni) : new Uint32Array(m.ni);
  index.set(m.idx.subarray(0, m.ni));
  g.setIndex(attribute(index, 1));
  m.bounds(boundsOut);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(boundsOut[0], boundsOut[1], boundsOut[2]), new THREE.Vector3(boundsOut[3], boundsOut[4], boundsOut[5]));
  g.boundingSphere = new THREE.Sphere();
  g.boundingBox.getBoundingSphere(g.boundingSphere);
  return g;
}

function noRaycast(): void { /* visées et collisions passent par WorldQuery, pas par ces maillages */ }

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = noRaycast;
  return mesh;
}

function tileGroup(tx: number, tz: number, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}-${tx}_${tz}`;
  group.position.set(tx * TILE_SIZE, 0, tz * TILE_SIZE);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function dataTexture(data: Uint8Array, size: number, format: THREE.PixelFormat, name: string): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, format, THREE.UnsignedByteType);
  t.name = name;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.flipY = false;
  return t;
}

function macroTexture(pixels: Uint8Array, size: number, name: string): THREE.DataTexture {
  const t = dataTexture(pixels, size, THREE.RGBAFormat, name);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Niveau du plus grand plan d'eau de la tuile (à défaut, celui du fleuve). */
function tileWaterLevel(tile: Tile, fallback: number): number {
  let best = -1, level = fallback;
  for (const s of tile.surfaces) {
    if (s.kind !== 'water' || s.level === null) continue;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i + 1 < s.outer.length; i += 2) {
      minX = Math.min(minX, s.outer[i]);
      maxX = Math.max(maxX, s.outer[i]);
      minZ = Math.min(minZ, s.outer[i + 1]);
      maxZ = Math.max(maxZ, s.outer[i + 1]);
    }
    const area = (maxX - minX) * (maxZ - minZ);
    if (area > best) {
      best = area;
      level = s.level;
    }
  }
  return level;
}

function countTriangles(obj: THREE.Mesh): number {
  const g = obj.geometry;
  const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
  return obj instanceof THREE.InstancedMesh ? n * obj.count : n;
}

// Tampons de construction partagés : une seule tuile se construit à la fois.
let scratch: { ground: MeshBuf; volumes: MeshBuf; cutout: MeshBuf; water: MeshBuf } | null = null;
function scratchBuffers(): { ground: MeshBuf; volumes: MeshBuf; cutout: MeshBuf; water: MeshBuf } {
  if (scratch === null) scratch = { ground: new MeshBuf(131072), volumes: new MeshBuf(16384), cutout: new MeshBuf(8192, true), water: new MeshBuf(2048) };
  return scratch;
}

/** Libère les tampons de construction (fin de partie, changement de qualité). */
export function releaseTileScratch(): void {
  scratch = null;
}

function makeSite(ctx: CityContext, tile: Tile, raster: TileRaster, tin: TileTin, edgeIds: number[]): TileSite {
  return {
    tile, graph: ctx.graph, edgeIds, raster, tin, profile: ctx.profile, waterLevel: ctx.waterLevel, ox: tile.tx * TILE_SIZE, oz: tile.tz * TILE_SIZE,
  };
}

// ─────────────────────────────── version détaillée ───────────────────────────────

export class DetailTile {
  readonly tx: number;
  readonly tz: number;
  readonly group: THREE.Group;
  readonly stats: TileViewStats = { triangles: 0, drawCalls: 0, gpuBytes: 0, buildingTriangles: 0, buildingDrawCalls: 0, buildMs: 0, maxStepMs: 0, buildingMs: 0 };
  /** Surélévation du sol dessiné, en centimètres, par cellule de 1 m (512 × 512). */
  lift: Uint8Array | null = null;
  ready = false;
  /** Étape en cours de la construction (diagnostic). */
  phase = '';
  private readonly ctx: CityContext;
  private readonly tile: Tile;
  private geometries: THREE.BufferGeometry[] = [];
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];
  private buildings: TileBuildingsView | null = null;
  private halos: THREE.InstancedMesh | null = null;
  private pending: THREE.Object3D[] = [];
  private disposed = false;
  /** Appelé quand le sol détaillé entre en scène, puis quand les immeubles détaillés y entrent (la vue lointaine cède la place). */
  onGroundShown: (() => void) | null = null;
  onBuildingsShown: (() => void) | null = null;

  constructor(ctx: CityContext, tile: Tile) {
    this.ctx = ctx;
    this.tile = tile;
    this.tx = tile.tx;
    this.tz = tile.tz;
    this.group = tileGroup(tile.tx, tile.tz, 'ville');
  }

  /** Construit la tuile par étapes ; rend 1 quand le reste doit attendre l'image suivante. */
  *build(): Generator<number, void, void> {
    const ctx = this.ctx, tile = this.tile, q = ctx.shared.quality;
    const ox = tile.tx * TILE_SIZE, oz = tile.tz * TILE_SIZE;
    const edgeIds = ctx.edgeIndex.query(ox - 48, oz - 48, ox + TILE_SIZE + 48, oz + TILE_SIZE + 48);
    // 1. Grille de surfaces.
    const raster = createRaster(tile.tx, tile.tz, q.rasterSize);
    this.phase = 'grille';
    for (const _ of rasterSteps(raster, tile, ctx.graph, edgeIds)) {
      void _;
      yield 0;
      if (this.disposed) return;
    }
    // 2. Sol en facettes, tabliers.
    const terrain = ctx.terrain;
    const tin = new TileTin(tile.tx, tile.tz, (x, z) => sampleTerrain(terrain, x, z));
    ctx.profile.focus(ox, oz, ox + TILE_SIZE, oz + TILE_SIZE);
    const site = makeSite(ctx, tile, raster, tin, edgeIds);
    yield 0;
    this.phase = 'sol';
    // 3. Maillages du sol.
    const bufs = scratchBuffers();
    bufs.ground.reset();
    bufs.volumes.reset();
    bufs.cutout.reset();
    bufs.water.reset();
    const builder = new GroundBuilder(site, bufs, { curbs: q.curbs, gutters: q.gutters, markings: q.markings, grates: q.grates, copingLand: q.copingLand });
    for (const _ of builder.steps()) {
      void _;
      yield 0;
      if (this.disposed) return;
      // Une autre tuile a pu se construire entre-temps sur les mêmes ponts : on se recale.
      ctx.profile.focus(ox, oz, ox + TILE_SIZE, oz + TILE_SIZE);
    }
    this.phase = 'barrières';
    buildBarriers(site, bufs.volumes, bufs.cutout);
    yield 0;
    this.phase = 'ponts';
    buildBridges(site, bufs.volumes, tileWaterLevel(tile, ctx.waterLevel), ctx.skipBridge);
    yield 0;
    if (this.disposed) return;
    // 4. Textures de la tuile : grille des classes, couleurs lointaines ; surélévations pour les autres modules.
    const macroSize = 256;
    this.phase = 'textures';
    const macroPixels = new Uint8Array(macroSize * macroSize * 4);
    for (let row = 0; row < macroSize; row += 64) {
      bakeMacro(raster, macroSize, macroPixels, ctx.shared.palette, row, row + 64);
      yield 0;
    }
    const lift = new Uint8Array(512 * 512);
    for (let j = 0; j < 512; j++) {
      for (let i = 0; i < 512; i++) lift[j * 512 + i] = Math.round(liftOfCode(codeAt(raster, ox + i + 0.5, oz + j + 0.5)) * 100);
      if ((j & 127) === 127) yield 0;
    }
    this.lift = lift;
    const ids = dataTexture(raster.codes, raster.n, THREE.RedFormat, `ville-grille-${tile.tx}_${tile.tz}`);
    ids.magFilter = THREE.NearestFilter;
    ids.minFilter = THREE.NearestFilter;
    ids.generateMipmaps = false;
    ids.needsUpdate = true;
    const macro = macroTexture(macroPixels, macroSize, `ville-couleurs-${tile.tx}_${tile.tz}`);
    this.textures.push(ids, macro);
    let bytes = raster.n * raster.n + macroSize * macroSize * 4 * 1.33;
    if (ctx.renderer !== null) {
      // Envoi immédiat à la carte graphique, hors de l'image où la tuile apparaît.
      ctx.renderer.initTexture(ids);
      yield 1;
      ctx.renderer.initTexture(macro);
      yield 0;
    }
    if (this.disposed) return;
    // 5. Géométries et maillages.
    this.phase = 'géométries';
    const groundMaterial = createGroundMaterial(ctx.shared.atlas, { ids, macro, gridSize: raster.n, cutRaised: flushOverRaised(tile) }, { lambert: q.lambert, blend: q.blend, detail: q.detail });
    this.materials.push(groundMaterial);
    const add = (buf: MeshBuf, material: THREE.Material, name: string, cast: boolean, receive: boolean): THREE.Mesh | null => {
      if (buf.ni === 0) return null;
      const g = toGeometry(buf);
      this.geometries.push(g);
      bytes += buf.gpuBytes;
      const mesh = makeMesh(g, material, name);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      return mesh;
    };
    const ground = add(bufs.ground, groundMaterial, 'sol', false, true);
    yield 0;
    const volumes = add(bufs.volumes, groundMaterial, 'volumes', true, true);
    const water = add(bufs.water, ctx.shared.water, 'eau', false, true);
    const cutout = add(bufs.cutout, ctx.shared.cutout, 'decoupes', false, true);
    yield 0;
    // 6. Arbres et halos.
    this.phase = 'arbres';
    const groundAt = (x: number, z: number): number => surfaceY(site, x, z);
    const crownGeometry = tile.trees.count > q.denseTrees ? ctx.shared.crownLightGeometry : ctx.shared.crownGeometry;
    const trees = buildTreeMeshes(tile.trees, ox, oz, groundAt, crownGeometry, ctx.shared.crown, ctx.shared.trunkGeometry, ctx.shared.trunk, ctx.seed + tile.tx * 131 + tile.tz * 17);
    if (trees.crowns) {
      trees.crowns.castShadow = q.treeShadows;
      trees.crowns.receiveShadow = false;
      trees.crowns.raycast = noRaycast;
    }
    if (trees.trunks) {
      trees.trunks.castShadow = q.treeShadows;
      trees.trunks.receiveShadow = true;
      trees.trunks.raycast = noRaycast;
    }
    if (q.halos) this.halos = this.buildHalos(site);
    yield 0;
    if (this.disposed) {
      trees.crowns?.dispose();
      trees.trunks?.dispose();
      return;
    }
    // 7. Mise en scène progressive : chaque maillage est envoyé à la carte graphique à sa première image.
    this.stats.gpuBytes = bytes;
    this.phase = 'mise en scène';
    yield 1;
    for (const obj of [ground, volumes, water, cutout]) if (obj) this.show(obj);
    if (this.onGroundShown) this.onGroundShown();
    yield 1;
    if (trees.trunks) this.show(trees.trunks);
    if (trees.crowns) this.show(trees.crowns);
    if (this.halos) this.show(this.halos);
    yield 1;
    // 8. Immeubles : étape indivisible du module voisin, seule dans son image.
    if (ctx.buildings) {
      this.phase = 'immeubles';
      const t0 = performance.now();
      this.buildings = buildTileBuildings(tile, { quality: ctx.quality, heightAt: (x, z) => sampleTerrain(terrain, x, z), skipLandmark: ctx.skipLandmark, seed: ctx.seed });
      this.stats.buildingMs = performance.now() - t0;
      this.stats.buildingTriangles = this.buildings.triangles;
      this.stats.buildingDrawCalls = this.buildings.drawCalls;
      yield 1;
      if (this.disposed) return;
      ctx.root.add(this.buildings.object);
      this.buildings.object.updateMatrixWorld(true);
    }
    if (this.onBuildingsShown) this.onBuildingsShown();
    this.ready = true;
  }

  private show(obj: THREE.Object3D): void {
    this.group.add(obj);
    obj.updateMatrixWorld(true);
    if (obj instanceof THREE.Mesh) {
      this.stats.triangles += countTriangles(obj);
      this.stats.drawCalls++;
    }
  }

  private buildHalos(site: TileSite): THREE.InstancedMesh | null {
    const furniture = this.tile.furniture;
    let n = 0;
    for (let i = 0; i < furniture.length; i++) if (furniture[i].kind === 'candelabre') n++;
    if (n === 0) return null;
    const mesh = new THREE.InstancedMesh(this.ctx.shared.haloGeometry, this.ctx.shared.halo, n);
    mesh.name = 'halos';
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < furniture.length; i++) {
      const f = furniture[i];
      if (f.kind !== 'candelabre') continue;
      const r = 6 + ((i * 37) % 10) * 0.18;
      // La tache est décalée vers la chaussée (le candélabre penche sa lanterne vers elle).
      const x = f.x + Math.sin(f.heading) * 1.2, z = f.z + Math.cos(f.heading) * 1.2;
      m.makeScale(r, 1, r);
      m.setPosition(x - site.ox, surfaceY(site, x, z) + 0.05, z - site.oz);
      mesh.setMatrixAt(k++, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 2;
    mesh.visible = false;
    return mesh;
  }

  /** À chaque image : éclairage des immeubles, halos allumés ou non. */
  update(env: EnvState, camX: number, camY: number, camZ: number): void {
    if (this.buildings) this.buildings.update(env, camX, camY, camZ);
    if (this.halos) this.halos.visible = env.streetLights;
  }

  /** Surélévation (m) du sol dessiné au point (0 hors de la tuile ou avant la fin de la construction). */
  liftAt(x: number, z: number): number {
    if (this.lift === null) return 0;
    const i = Math.floor(x - this.tx * TILE_SIZE), j = Math.floor(z - this.tz * TILE_SIZE);
    if (i < 0 || j < 0 || i >= 512 || j >= 512) return 0;
    return this.lift[j * 512 + i] / 100;
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    if (this.buildings) this.buildings.dispose();
    this.buildings = null;
    for (const child of this.group.children.slice()) if (child instanceof THREE.InstancedMesh) child.dispose();
    if (this.halos && this.halos.parent === null) this.halos.dispose();
    this.halos = null;
    for (const g of this.geometries) g.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.textures.length = 0;
    this.materials.length = 0;
    this.pending.length = 0;
    this.lift = null;
    this.group.removeFromParent();
    this.group.clear();
  }
}

// ─────────────────────────────── version lointaine ───────────────────────────────

/** Cellules par côté du maillage lointain (16 m) et de sa grille de surfaces (2 m). */
const FAR_GRID = 32;
const FAR_RASTER = 256;

export class FarTile {
  readonly tx: number;
  readonly tz: number;
  readonly group: THREE.Group;
  readonly stats: TileViewStats = { triangles: 0, drawCalls: 0, gpuBytes: 0, buildingTriangles: 0, buildingDrawCalls: 0, buildMs: 0, maxStepMs: 0, buildingMs: 0 };
  ready = false;
  phase = '';
  private readonly ctx: CityContext;
  private tile: Tile | null;
  private geometry: THREE.BufferGeometry | null = null;
  private texture: THREE.Texture | null = null;
  private material: THREE.Material | null = null;
  private ground: THREE.Mesh | null = null;
  private trees: THREE.InstancedMesh | null = null;
  private buildings: TileBuildingsView | null = null;
  private disposed = false;

  constructor(ctx: CityContext, tile: Tile) {
    this.ctx = ctx;
    this.tile = tile;
    this.tx = tile.tx;
    this.tz = tile.tz;
    this.group = tileGroup(tile.tx, tile.tz, 'ville-loin');
  }

  *build(): Generator<number, void, void> {
    const ctx = this.ctx, tile = this.tile;
    if (tile === null) return;
    const ox = tile.tx * TILE_SIZE, oz = tile.tz * TILE_SIZE;
    const edgeIds = ctx.edgeIndex.query(ox - 16, oz - 16, ox + TILE_SIZE + 16, oz + TILE_SIZE + 16);
    this.phase = 'grille';
    const raster = rasterizeTile(createRaster(tile.tx, tile.tz, FAR_RASTER), tile, ctx.graph, edgeIds);
    yield 0;
    this.phase = 'sol';
    const pixels = bakeMacro(raster, FAR_RASTER, undefined, ctx.shared.palette);
    const texture = macroTexture(pixels, FAR_RASTER, `ville-couleurs-loin-${tile.tx}_${tile.tz}`);
    this.texture = texture;
    const terrain = ctx.terrain;
    // Maillage grossier : chaque nœud au niveau du sol, ou au niveau de l'eau s'il est entouré d'eau.
    const w = FAR_GRID + 1, step = TILE_SIZE / FAR_GRID;
    const level = tileWaterLevel(tile, ctx.waterLevel);
    const pos = new Float32Array(w * w * 3), uv = new Float32Array(w * w * 2);
    const cells = FAR_RASTER / FAR_GRID;
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const x = ox + i * step, z = oz + j * step;
        let y = sampleTerrain(terrain, x, z);
        if (raster.hasWater && this.wet(raster, i * cells, j * cells)) y = Math.min(y, level);
        pos[3 * k] = i * step;
        pos[3 * k + 1] = y;
        pos[3 * k + 2] = j * step;
        uv[2 * k] = i / FAR_GRID;
        uv[2 * k + 1] = j / FAR_GRID;
      }
    }
    const idx = new Uint16Array(FAR_GRID * FAR_GRID * 6);
    let n = 0;
    for (let j = 0; j < FAR_GRID; j++) {
      for (let i = 0; i < FAR_GRID; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx[n++] = a; idx[n++] = d; idx[n++] = b;
        idx[n++] = a; idx[n++] = c; idx[n++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', attribute(pos, 3));
    g.setAttribute('uv', attribute(uv, 2));
    g.setIndex(attribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    (g.getAttribute('normal') as THREE.BufferAttribute).onUpload(freeArray);
    this.geometry = g;
    this.material = createFarGroundMaterial(texture);
    this.ground = makeMesh(g, this.material, 'sol-loin');
    this.ground.receiveShadow = false;
    this.group.add(this.ground);
    this.stats.triangles += FAR_GRID * FAR_GRID * 2;
    this.stats.drawCalls++;
    this.stats.gpuBytes = w * w * 32 + idx.byteLength + FAR_RASTER * FAR_RASTER * 4 * 1.33;
    yield 0;
    if (this.disposed) return;
    if (ctx.shared.quality.farTrees && tile.trees.count > 0) {
      this.phase = 'arbres';
      const trees = buildTreeMeshes(tile.trees, ox, oz, (x, z) => sampleTerrain(terrain, x, z), ctx.shared.crownFarGeometry, ctx.shared.crownFar, null, null, ctx.seed + tile.tx * 131 + tile.tz * 17);
      if (trees.crowns) {
        trees.crowns.raycast = noRaycast;
        this.trees = trees.crowns;
        this.group.add(trees.crowns);
        this.stats.triangles += countTriangles(trees.crowns);
        this.stats.drawCalls++;
      }
      yield 0;
    }
    if (ctx.buildings) {
      this.phase = 'immeubles';
      const t0 = performance.now();
      this.buildings = buildTileBuildingsFar(tile, { quality: ctx.quality, heightAt: (x, z) => sampleTerrain(terrain, x, z), skipLandmark: ctx.skipLandmark, seed: ctx.seed });
      this.stats.buildingMs = performance.now() - t0;
      this.stats.buildingTriangles = this.buildings.triangles;
      this.stats.buildingDrawCalls = this.buildings.drawCalls;
      ctx.root.add(this.buildings.object);
      this.buildings.object.updateMatrixWorld(true);
    }
    this.group.updateMatrixWorld(true);
    // Les données de la tuile ne servent plus : la vue lointaine ne garde que ses maillages.
    this.tile = null;
    this.ready = true;
  }

  /** Le nœud de maillage est-il entouré d'eau ? (cellules de la grille autour de lui) */
  private wet(r: TileRaster, ci: number, cj: number): boolean {
    const n = r.n;
    for (let dj = -2; dj <= 1; dj++) {
      for (let di = -2; di <= 1; di++) {
        const i = Math.min(n - 1, Math.max(0, ci + di)), j = Math.min(n - 1, Math.max(0, cj + dj));
        if (r.codes[j * n + i] !== CODE_WATER) return false;
      }
    }
    return true;
  }

  /** Cache le sol (le sol détaillé vient d'entrer en scène) puis les immeubles et les arbres. */
  hideGround(): void {
    if (this.ground) this.ground.visible = false;
    if (this.trees) this.trees.visible = false;
  }

  /** Le détail a été abandonné en cours de construction : la version lointaine redevient entièrement visible. */
  showAll(): void {
    if (this.ground) this.ground.visible = true;
    if (this.trees) this.trees.visible = true;
  }

  update(env: EnvState, camX: number, camY: number, camZ: number): void {
    if (this.buildings) this.buildings.update(env, camX, camY, camZ);
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    if (this.buildings) this.buildings.dispose();
    this.buildings = null;
    if (this.trees) this.trees.dispose();
    this.trees = null;
    if (this.geometry) this.geometry.dispose();
    if (this.texture) this.texture.dispose();
    if (this.material) this.material.dispose();
    this.geometry = null;
    this.texture = null;
    this.material = null;
    this.ground = null;
    this.tile = null;
    this.group.removeFromParent();
    this.group.clear();
  }
}

/** Pas du sol en facettes et nombre de facettes : rappel pour les mesures. */
export const DETAIL_GRID = { cell: TIN_CELL, count: TIN_N } as const;
