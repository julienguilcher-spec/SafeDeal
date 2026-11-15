// Banc d'essai des immeubles : une tuile en version détaillée, ses voisines en version lointaine,
// un sol simple, de jour et de nuit, caméra piétonne ou aérienne.
//
// Paramètres d'URL :
//   src=paris|test|<dossier de tuiles>   données (défaut : Paris si public/data/paris existe, sinon quartier d'essai)
//   tile=tx,tz                           tuile détaillée (défaut : Opéra pour Paris, 0,-1 pour le quartier d'essai)
//   quality=bas|moyen|haut|ultra         (défaut : haut)
//   view=street|facade|aerial|top|far    hour=0..24     shadows=0|1     neighbors=far|detail|none
//   atlas=1                              planche de contact de l'atlas de textures (pas de 3D)
// API de test : window.__ready, __stats, __setView(nom), __setTime(heure), __bench(n), __frames.
import * as THREE from 'three';
import type { EnvState, QualityLevel } from '../src/core/contracts';
import {
  MAP_FILES, TILE_SIZE, decodeMapData, decodeRoadGraph, decodeTerrain, decodeTile, parseManifest, pointInPolygon, sampleTerrain, tileIndexOf,
  tilePath, lonLatToWorld,
} from '../src/world/mapdata';
import type { Building, Terrain, Tile } from '../src/world/mapdata';
import { generateTestDistrict } from '../src/world/testDistrict';
import { paintAtlasPixels } from '../src/world/view/buildings/atlas';
import {
  buildTileBuildings, buildTileBuildingsFar, buildingLightingState, disposeSharedBuildingResources, prepareSharedBuildingResources,
} from '../src/world/view/buildings/index';
import type { BuildingViewOptions, TileBuildingsView } from '../src/world/view/buildings/index';
import { LAYER_COUNT } from '../src/world/view/buildings/layers';

const params = new URLSearchParams(location.search);
const quality = (params.get('quality') ?? 'haut') as QualityLevel;
const info = document.getElementById('info') as HTMLDivElement;
const W = window as unknown as Record<string, unknown>;
W.__ready = false;
W.__frames = 0;

// ─────────────────────────────────────────────────────────────────────────────────────
// Données
// ─────────────────────────────────────────────────────────────────────────────────────

interface World { name: string; tiles: Map<string, Tile>; heightAt(x: number, z: number): number; focus: { tx: number; tz: number } }

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    if (text.trimStart().startsWith('<')) return null;      // le serveur de développement renvoie index.html pour un fichier absent
    return JSON.parse(text);
  } catch { return null; }
}

function parseTileParam(): { tx: number; tz: number } | null {
  const t = params.get('tile');
  if (!t) return null;
  const [a, b] = t.split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? { tx: a, tz: b } : null;
}

async function loadTilesAround(base: string, focus: { tx: number; tz: number }, file: (tx: number, tz: number) => string): Promise<Map<string, Tile>> {
  const tiles = new Map<string, Tile>();
  const jobs: Promise<void>[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const tx = focus.tx + dx, tz = focus.tz + dz;
    jobs.push(fetchJson(base + file(tx, tz)).then((raw) => { if (raw) tiles.set(`${tx},${tz}`, decodeTile(raw as never)); }));
  }
  await Promise.all(jobs);
  return tiles;
}

async function loadWorld(): Promise<World> {
  const src = params.get('src');
  const wanted = parseTileParam();
  if (src === null || src === 'paris') {
    const base = new URL('../data/paris/', location.href).href;
    const manifestJson = await fetchJson(base + MAP_FILES.manifest);
    if (manifestJson) {
      const manifest = parseManifest(manifestJson);
      const terrainJson = await fetchJson(base + manifest.files.terrain);
      const terrain: Terrain | null = terrainJson ? decodeTerrain(terrainJson as never) : null;
      // défaut : la tuile de l'avenue de l'Opéra
      const opera = lonLatToWorld(2.3340, 48.8675);
      const focus = wanted ?? tileIndexOf(opera.x, opera.z);
      const tiles = await loadTilesAround(base, focus, tilePath);
      if (tiles.has(`${focus.tx},${focus.tz}`)) {
        return { name: 'Paris (données réelles)', tiles, heightAt: terrain ? (x, z) => sampleTerrain(terrain, x, z) : () => 0, focus };
      }
    }
    if (src === 'paris') throw new Error('public/data/paris est absent ou incomplet');
  }
  if (src && src !== 'test' && src !== 'paris') {
    // dossier de tuiles seules (essais sur des emprises réelles sans relief)
    const base = new URL(src.endsWith('/') ? src : src + '/', location.href).href;
    const focus = wanted ?? { tx: 3, tz: -1 };
    const tiles = await loadTilesAround(base, focus, (tx, tz) => `t_${tx}_${tz}.json`);
    if (!tiles.has(`${focus.tx},${focus.tz}`)) throw new Error(`tuile ${focus.tx},${focus.tz} introuvable dans ${base}`);
    return { name: `tuiles de ${src}`, tiles, heightAt: () => 0, focus };
  }
  const raw = generateTestDistrict({ seed: 1 });
  const data = decodeMapData(raw);
  const terrain = decodeTerrain(raw.terrain);
  void decodeRoadGraph;
  const tiles = new Map<string, Tile>();
  for (const t of data.tiles) tiles.set(`${t.tx},${t.tz}`, t);
  return { name: "quartier d'essai", tiles, heightAt: (x, z) => sampleTerrain(terrain, x, z), focus: wanted ?? { tx: 0, tz: -1 } };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Planche de contact de l'atlas
// ─────────────────────────────────────────────────────────────────────────────────────

function showAtlas(): void {
  const host = document.getElementById('atlas') as HTMLDivElement;
  host.style.display = 'block';
  info.style.display = 'none';
  const size = Number(params.get('cell') ?? 256);
  const shown = Number(params.get('show') ?? 150);
  const first = Number(params.get('first') ?? 0), last = Number(params.get('last') ?? LAYER_COUNT - 1);
  const withMask = params.get('mask') === '1';
  const t0 = performance.now();
  paintAtlasPixels({ cellSize: size, paintedBalconies: params.get('painted') === '1', anisotropy: 1 }, (layer, color, mask) => {
    if (layer < first || layer > last) return;
    const fig = document.createElement('figure');
    for (const src of withMask ? [color, mask] : [color]) {
      const c = document.createElement('canvas');
      c.width = shown; c.height = shown;
      c.getContext('2d')!.drawImage(src, 0, 0, shown, shown);
      fig.appendChild(c);
    }
    const cap = document.createElement('figcaption');
    cap.textContent = `couche ${layer}`;
    fig.appendChild(cap);
    host.appendChild(fig);
  });
  W.__stats = { atlasPaintMs: performance.now() - t0, layers: LAYER_COUNT, cell: size };
  W.__ready = true;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Scène
// ─────────────────────────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 4000);
const sun = new THREE.DirectionalLight(0xffffff, 3);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a655c, 1);
const sky = new THREE.Color();
const env = {
  timeOfDay: 14, clockScale: 1, weather: 'clair', rain: 0, fog: 0, clouds: 0.25, wetness: 0, windX: 0, windZ: 0,
  sunX: 0, sunY: 1, sunZ: 0, daylight: 1, isNight: false, streetLights: false,
} as EnvState;

let world: World;
let mainView: TileBuildingsView | null = null;
const farViews: TileBuildingsView[] = [];
let streetSpot = { x: 0, z: 0, dirX: 1, dirZ: 0, sideX: 0, sideZ: 1, clear: 8 };
let currentView = 'street';
const stats: Record<string, unknown> = {};

function viewOptions(): BuildingViewOptions {
  return { quality, heightAt: world.heightAt, skipLandmark: (key) => params.get('landmarks') !== 'keep' && key !== '', seed: 1 };
}

function makeGround(): THREE.Mesh {
  // sol simple : une nappe qui épouse le relief, sur la tuile et ses voisines
  const n = 144;
  const size = TILE_SIZE * 3;
  const x0 = (world.focus.tx - 1) * TILE_SIZE, z0 = (world.focus.tz - 1) * TILE_SIZE;
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * size, z = z0 + (j / n) * size;
    const k = (j * (n + 1) + i) * 3;
    pos[k] = x; pos[k + 1] = world.heightAt(x, z); pos[k + 2] = z;
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x77756f }));
  mesh.receiveShadow = true;
  return mesh;
}

// ── recherche d'un point de vue « dans une rue » : un point dégagé d'où l'on voit loin ──

interface Footprint { b: Building; minX: number; minZ: number; maxX: number; maxZ: number }
const footprints: Footprint[] = [];

function indexFootprints(): void {
  for (const tile of world.tiles.values()) for (const b of tile.buildings) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < b.outer.length; i += 2) {
      minX = Math.min(minX, b.outer[i]); maxX = Math.max(maxX, b.outer[i]);
      minZ = Math.min(minZ, b.outer[i + 1]); maxZ = Math.max(maxZ, b.outer[i + 1]);
    }
    footprints.push({ b, minX, minZ, maxX, maxZ });
  }
}

function built(x: number, z: number, margin = 0): boolean {
  for (const f of footprints) {
    if (x < f.minX - margin || x > f.maxX + margin || z < f.minZ - margin || z > f.maxZ + margin) continue;
    if (pointInPolygon(f.b.outer, f.b.holes, x, z)) return true;
    if (margin > 0) for (let a = 0; a < 8; a++) {
      if (pointInPolygon(f.b.outer, f.b.holes, x + Math.cos(a * 0.785) * margin, z + Math.sin(a * 0.785) * margin)) return true;
    }
  }
  return false;
}

function sightLength(x: number, z: number, dx: number, dz: number, max: number): number {
  for (let d = 3; d < max; d += 3) if (built(x + dx * d, z + dz * d)) return d;
  return max;
}

function findStreetSpot(): void {
  const ox = world.focus.tx * TILE_SIZE, oz = world.focus.tz * TILE_SIZE;
  const want = params.get('at');
  let best = -1;
  const candidates: { x: number; z: number }[] = [];
  if (want) { const [x, z] = want.split(',').map(Number); candidates.push({ x, z }); }
  else for (let j = 5; j < 60; j++) for (let i = 5; i < 60; i++) candidates.push({ x: ox + i * 8 + 3, z: oz + j * 8 + 3 });
  for (const c of candidates) {
    if (built(c.x, c.z, 3.5)) continue;
    // une rue : des façades proches de part et d'autre, une longue perspective dans l'axe
    for (let a = 0; a < 16; a++) {
      const dx = Math.cos((a / 16) * Math.PI * 2), dz = Math.sin((a / 16) * Math.PI * 2);
      const ahead = sightLength(c.x, c.z, dx, dz, 260);
      if (ahead < 90) continue;
      const left = sightLength(c.x, c.z, -dz, dx, 40), right = sightLength(c.x, c.z, dz, -dx, 40);
      if (left > 24 || right > 24) continue;
      const score = ahead - Math.abs(left - right) * 2 - Math.abs(left + right - 22) * 1.5;
      if (score > best) { best = score; streetSpot = { x: c.x, z: c.z, dirX: dx, dirZ: dz, sideX: -dz, sideZ: dx, clear: left }; }
    }
  }
  if (best < 0) {
    // repli : centre de la tuile, regard vers le nord
    streetSpot = { x: ox + 256, z: oz + 256, dirX: 0, dirZ: -1, sideX: 1, sideZ: 0, clear: 10 };
  }
}

function setView(name: string): void {
  currentView = name;
  const s = streetSpot;
  const ox = world.focus.tx * TILE_SIZE, oz = world.focus.tz * TILE_SIZE;
  const cx = ox + 256, cz = oz + 256;
  const ground = world.heightAt(s.x, s.z);
  camera.fov = 62;
  if (name === 'street') {
    // piéton sur le trottoir, regard dans l'axe de la rue, légèrement vers le haut
    const px = s.x + s.sideX * Math.max(0, s.clear - 4.5), pz = s.z + s.sideZ * Math.max(0, s.clear - 4.5);
    camera.position.set(px, world.heightAt(px, pz) + 1.7, pz);
    camera.lookAt(s.x + s.dirX * 60 - s.sideX * 2, ground + 9, s.z + s.dirZ * 60 - s.sideZ * 2);
  } else if (name === 'facade') {
    // face à une façade, depuis le trottoir d'en face
    const px = s.x - s.sideX * 5, pz = s.z - s.sideZ * 5;
    camera.position.set(px, ground + 1.7, pz);
    camera.lookAt(s.x + s.sideX * 30 + s.dirX * 6, ground + 12, s.z + s.sideZ * 30 + s.dirZ * 6);
  } else if (name === 'close') {
    // au pied d'un immeuble : détail du rez-de-chaussée et du premier balcon
    const px = s.x + s.sideX * Math.max(0, s.clear - 3.2), pz = s.z + s.sideZ * Math.max(0, s.clear - 3.2);
    camera.position.set(px, ground + 1.7, pz);
    camera.lookAt(px + s.dirX * 9 + s.sideX * 4, ground + 5.5, pz + s.dirZ * 9 + s.sideZ * 4);
  } else if (name === 'roofs') {
    // drone au-dessus de la rue
    camera.position.set(s.x - s.dirX * 40, ground + 55, s.z - s.dirZ * 40);
    camera.lookAt(s.x + s.dirX * 60, ground + 14, s.z + s.dirZ * 60);
  } else if (name === 'aerial') {
    camera.position.set(cx - 230, world.heightAt(cx, cz) + 170, cz + 270);
    camera.lookAt(cx, world.heightAt(cx, cz) + 10, cz);
  } else if (name === 'top') {
    camera.fov = 50;
    camera.position.set(cx - 120, world.heightAt(cx, cz) + 520, cz + 420);
    camera.lookAt(cx, 0, cz - 40);
  } else if (name === 'far') {
    // limite entre la tuile détaillée et une tuile lointaine
    camera.position.set(ox - 150, world.heightAt(ox, cz) + 110, cz + 120);
    camera.lookAt(ox + 60, 10, cz - 20);
  }
  camera.updateProjectionMatrix();
  // les ombres suivent la zone regardée
  const t = new THREE.Vector3();
  camera.getWorldDirection(t);
  const reach = name === 'street' || name === 'facade' || name === 'close' ? 70 : 260;
  const tx = camera.position.x + t.x * reach, tz = camera.position.z + t.z * reach;
  sun.target.position.set(tx, 0, tz);
  sun.target.updateMatrixWorld();
  const span = name === 'street' || name === 'facade' || name === 'close' ? 150 : name === 'top' ? 700 : 420;
  const sc = sun.shadow.camera;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = 2500;
  sc.updateProjectionMatrix();
  placeSun();
  render();
}

function placeSun(): void {
  const t = sun.target.position;
  sun.position.set(t.x + env.sunX * 1200, t.y + env.sunY * 1200, t.z + env.sunZ * 1200);
}

function setTime(hour: number): void {
  env.timeOfDay = hour;
  // course du soleil simplifiée : lever 6 h, coucher 21 h (été), culmination au sud
  const day = (hour - 6) / 15;
  const up = day > 0 && day < 1 ? Math.sin(day * Math.PI) : 0;
  const elev = up * 1.05;
  const az = (hour - 13.5) / 12 * Math.PI;             // 0 = plein sud ; l'après-midi le soleil passe à l'ouest
  // direction VERS le soleil : sud = +z, ouest = -x
  env.sunX = -Math.sin(az) * Math.cos(elev);
  env.sunZ = Math.cos(az) * Math.cos(elev);
  env.sunY = Math.max(0.08, Math.sin(elev));
  env.daylight = Math.min(1, up * 1.6);
  env.isNight = env.daylight < 0.15;
  env.streetLights = env.daylight < 0.3;
  const d = env.daylight;
  sun.intensity = 3.2 * d;
  sun.color.setRGB(1, 0.86 + 0.12 * d, 0.7 + 0.26 * d);
  hemi.intensity = 0.34 + 1.5 * d;
  hemi.color.setRGB(0.5 + 0.38 * d, 0.6 + 0.32 * d, 0.95 + 0.05 * d);
  // la nuit : lueur chaude de l'éclairage public venue d'en bas
  hemi.groundColor.setRGB(0.5 + 0.5 * (1 - d), 0.47 + 0.2 * (1 - d), 0.42 - 0.2 * (1 - d));
  sky.setRGB(0.02 + 0.5 * d, 0.03 + 0.64 * d, 0.07 + 0.83 * d);
  scene.background = sky;
  (scene.fog as THREE.Fog).color.copy(sky).lerp(new THREE.Color(0.8, 0.82, 0.84), 0.5 * d);
  placeSun();
  if (mainView) mainView.update(env, camera.position.x, camera.position.y, camera.position.z);
  for (const v of farViews) v.update(env, camera.position.x, camera.position.y, camera.position.z);
  render();
}

function render(): void {
  if (mainView) mainView.update(env, camera.position.x, camera.position.y, camera.position.z);
  renderer.render(scene, camera);
  W.__frames = (W.__frames as number) + 1;
  stats.rendererCalls = renderer.info.render.calls;
  stats.rendererTriangles = renderer.info.render.triangles;
  stats.lighting = buildingLightingState();
  info.textContent = `${world.name} — tuile ${world.focus.tx},${world.focus.tz} — qualité ${quality} — vue ${currentView} — ${env.timeOfDay} h\n`
    + `détaillé : ${stats.triangles} triangles, ${stats.drawCalls} appel(s) de dessin, ${Number(stats.buildMs).toFixed(1)} ms\n`
    + `lointain : ${stats.farTiles} tuile(s), max ${stats.farTrianglesMax} triangles, ${Number(stats.farBuildMsMax).toFixed(1)} ms max\n`
    + `scène entière : ${stats.rendererCalls} appels, ${stats.rendererTriangles} triangles`;
}

function buildAll(): void {
  const focusTile = world.tiles.get(`${world.focus.tx},${world.focus.tz}`)!;
  // référence : ce que le banc d'essai lui-même occupe (sol, ombres), avant toute tuile
  renderer.render(scene, camera);
  stats.baseline = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  const prep = prepareSharedBuildingResources(quality);
  stats.atlasPaintMs = prep.paintMs;
  stats.atlasBytes = prep.bytes;
  const opts = viewOptions();
  let t0 = performance.now();
  mainView = buildTileBuildings(focusTile, opts);
  stats.buildMs = performance.now() - t0;
  stats.buildings = focusTile.buildings.length;
  stats.triangles = mainView.triangles;
  stats.drawCalls = mainView.drawCalls;
  scene.add(mainView.object);
  const mode = params.get('neighbors') ?? 'far';
  let farMax = 0, farMs = 0, farCalls = 0;
  if (mode !== 'none') for (const [key, tile] of world.tiles) {
    if (tile === focusTile) continue;
    t0 = performance.now();
    const v = mode === 'detail' ? buildTileBuildings(tile, opts) : buildTileBuildingsFar(tile, opts);
    farMs = Math.max(farMs, performance.now() - t0);
    farMax = Math.max(farMax, v.triangles);
    farCalls = Math.max(farCalls, v.drawCalls);
    farViews.push(v);
    scene.add(v.object);
    void key;
  }
  stats.farTiles = farViews.length;
  stats.farTrianglesMax = farMax;
  stats.farBuildMsMax = farMs;
  stats.farDrawCallsMax = farCalls;
}

/** Mesure : n constructions de la tuile détaillée et de sa version lointaine (géométries libérées à chaque fois). */
function bench(n: number): Record<string, number> {
  const tile = world.tiles.get(`${world.focus.tx},${world.focus.tz}`)!;
  const opts = viewOptions();
  const detail: number[] = [], far: number[] = [];
  let tri = 0, farTri = 0;
  for (let i = 0; i < n; i++) {
    let t0 = performance.now();
    const v = buildTileBuildings(tile, opts);
    detail.push(performance.now() - t0);
    tri = v.triangles;
    v.dispose();
    t0 = performance.now();
    const f = buildTileBuildingsFar(tile, opts);
    far.push(performance.now() - t0);
    farTri = f.triangles;
    f.dispose();
  }
  detail.sort((a, b) => a - b); far.sort((a, b) => a - b);
  return {
    detailMedianMs: detail[n >> 1], detailMaxMs: detail[n - 1], detailMinMs: detail[0], detailTriangles: tri,
    farMedianMs: far[n >> 1], farMaxMs: far[n - 1], farTriangles: farTri,
  };
}

async function main(): Promise<void> {
  if (params.get('atlas') === '1') { showAtlas(); return; }
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = params.get('shadows') !== '0';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  camera.aspect = window.innerWidth / window.innerHeight;
  scene.fog = new THREE.Fog(0xbfd0e0, 250, 3200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target, hemi);

  world = await loadWorld();
  scene.add(makeGround());
  indexFootprints();
  buildAll();
  findStreetSpot();
  stats.world = world.name;
  stats.quality = quality;
  stats.tile = `${world.focus.tx},${world.focus.tz}`;
  stats.streetSpot = streetSpot;
  W.__stats = stats;
  W.__setView = (name: string) => setView(name);
  W.__setTime = (hour: number) => setTime(hour);
  W.__bench = (n: number) => bench(n);
  W.__dispose = () => {
    if (mainView) mainView.dispose();
    for (const v of farViews) v.dispose();
    mainView = null; farViews.length = 0;
    disposeSharedBuildingResources();
    renderer.render(scene, camera);
    return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  };
  W.__memory = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  // caméra libre et recherche de bâtiments, pour inspecter un détail
  W.__setCamera = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 62) => {
    currentView = 'libre';
    camera.fov = fov;
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    camera.updateProjectionMatrix();
    sun.target.position.set(tx, 0, tz);
    sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera;
    sc.left = -200; sc.right = 200; sc.top = 200; sc.bottom = -200;
    sc.updateProjectionMatrix();
    placeSun();
    render();
  };
  W.__find = (what: string) => {
    const out: unknown[] = [];
    const tile = world.tiles.get(`${world.focus.tx},${world.focus.tz}`)!;
    for (const b of tile.buildings) {
      if (b.kind !== what && b.roof !== what && b.style !== what && String(b.id) !== what) continue;
      let cx = 0, cz = 0;
      for (let i = 0; i < b.outer.length; i += 2) { cx += b.outer[i]; cz += b.outer[i + 1]; }
      const n = b.outer.length / 2;
      out.push({ id: b.id, kind: b.kind, roof: b.roof, style: b.style, x: +(cx / n).toFixed(1), z: +(cz / n).toFixed(1), h: b.height, levels: b.levels, n, holes: b.holes.length, y: +world.heightAt(cx / n, cz / n).toFixed(1) });
      if (out.length >= 12) break;
    }
    return out;
  };
  setTime(Number(params.get('hour') ?? 14));
  setView(params.get('view') ?? 'street');
  render();
  W.__ready = true;
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    render();
  });
}

main().catch((e) => {
  console.error('[buildings] ' + (e instanceof Error ? e.stack ?? e.message : String(e)));
  info.textContent = 'ERREUR : ' + String(e);
  W.__error = String(e);
});
