// Banc d'essai du lot « ponts » : les monuments SUR LEUR SITE RÉEL, par le vrai système d'affichage.
// Charge la carte de Paris (repères, relief, graphe, tuiles voisines), fabrique un monde minimal (relief, tabliers de
// pont à la bonne altitude, niveau de l'eau, emprise) et fait tourner createSystems() dessus : repères
// supplémentaires, alias, site.groundAt / waterY et silhouettes d'horizon passent par le même chemin que dans le jeu.
// Le décor est sommaire mais à l'échelle : relief maillé à 4 m (creusé sous les plans d'eau), plans d'eau à leur
// niveau, tabliers des ponts (chaussée, trottoirs, bandeau de 0,9 m, parapet de pierre générique) comme les dessine
// le module de la ville, et une silhouette humaine de 1,8 m.
//   /harness/monuments-ponts.html?key=pont_neuf         &quality=bas|moyen|haut|ultra  &night=1  &far=1  &view=0..3  &shot=1
//   ?horizon=1   les silhouettes d'horizon vues de la Concorde
// API des tests : __ready, __frames, __setView(i), __look(cx, cy, cz, tx, ty, tz) en repère LOCAL du monument,
// __lookWorld(…), __setNight(b), __setFar(b), __stats(), __sys.
import * as THREE from 'three';
import type { GameContext, LandmarkInfo, QualityLevel } from '../src/core/contracts';
import { createSystems, getMonument } from '../src/world/monuments';
import type { MonumentsApi, WorldMonumentsApi } from '../src/world/monuments/api';
import { HORIZON } from '../src/world/monuments/horizon';
import { setNightLevel } from '../src/world/monuments/kit';
import { decodeLandmarks, decodeRoadGraph, decodeTerrain, decodeTile, sampleTerrain, type RoadGraph, type Terrain, type Tile } from '../src/world/mapdata';
import { BridgeProfile } from '../src/world/view/decks';
import { pointInRing } from '../src/world/monuments/shape2d';

const params = new URLSearchParams(location.search);
const quality = (params.get('quality') ?? 'haut') as QualityLevel;
const horizonDemo = params.get('horizon') === '1';
const key = params.get('key') ?? 'pont_alexandre_iii';
if (params.get('shot')) document.body.classList.add('shot');
const hud = document.getElementById('hud')!;
const bar = document.getElementById('bar')!;
const w = window as unknown as Record<string, unknown>;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.3, 8000);
const world = new THREE.Group();
const decor = new THREE.Group();
scene.add(world, decor);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4f86c6) }, horizon: { value: new THREE.Color(0xc9dcec) } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 24, 12), skyMat);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a6458, 0.95);
scene.add(hemi);

let night = false;
const env = { timeOfDay: 14, daylight: 1, isNight: false, fog: 0, rain: 0 };
function setNight(n: boolean): void {
  night = n;
  env.timeOfDay = n ? 22.5 : 14; env.daylight = n ? 0 : 1; env.isNight = n;
  setNightLevel(n ? 1 : 0);
  if (n) {
    (skyMat.uniforms.top.value as THREE.Color).setHex(0x05070f); (skyMat.uniforms.horizon.value as THREE.Color).setHex(0x1a2030);
    sun.color.setHex(0x9fb4ff); sun.intensity = 0.22; hemi.intensity = 0.16; hemi.color.setHex(0x6f7fae); hemi.groundColor.setHex(0x2a241c);
  } else {
    (skyMat.uniforms.top.value as THREE.Color).setHex(0x4f86c6); (skyMat.uniforms.horizon.value as THREE.Color).setHex(0xc9dcec);
    sun.color.setHex(0xfff2dd); sun.intensity = 3.0; hemi.intensity = 0.95; hemi.color.setHex(0xcfe0ff); hemi.groundColor.setHex(0x6a6458);
  }
}

function human(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xd8421c, roughness: 0.8 });
  const add = (geo: THREE.BufferGeometry, x: number, y: number): void => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, 0); k.castShadow = true; g.add(k); };
  add(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), 0, 1.15); add(new THREE.SphereGeometry(0.115, 12, 8), 0, 1.685);
  add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), -0.1, 0.42); add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), 0.1, 0.42);
  return g;
}

interface Site { lm: LandmarkInfo; radius: number; height: number }
let site: Site | null = null;
let sysApi: MonumentsApi | null = null;
let systems: ReturnType<typeof createSystems> = [];
let far = false;
let frames = 0, time = 0;
/** Position utilisée par le système pour ses niveaux de détail : la caméra, ou très loin pour forcer la silhouette. */
const lodCam = { x: 0, y: 0, z: 0 };

function toWorld(lm: LandmarkInfo, x: number, z: number): [number, number] {
  const c = Math.cos(lm.heading), s = Math.sin(lm.heading);
  return [lm.x + x * c + z * s, lm.z - x * s + z * c];
}

async function json(path: string): Promise<unknown> {
  const r = await fetch(`../data/paris/${path}`);
  if (!r.ok) throw new Error(`chargement impossible : ${path}`);
  return r.json();
}

/** Décor sommaire autour d'un point : relief creusé sous l'eau, plans d'eau, tabliers génériques des ponts. */
function buildDecor(cx: number, cz: number, R: number, terrain: Terrain, tiles: Tile[], graph: RoadGraph, profile: BridgeProfile, heightAt: (x: number, z: number) => number, waterLevel: number): void {
  const water: { ring: Float32Array; level: number }[] = [];
  for (const t of tiles) for (const s of t.surfaces) if (s.kind === 'water') water.push({ ring: s.outer, level: s.level ?? waterLevel });
  const levelAt = (x: number, z: number): number | null => { for (const wp of water) if (pointInRing(x, z, wp.ring)) return wp.level; return null; };
  // relief : grille de 4 m
  const step = 4, n = Math.ceil((2 * R) / step);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = cx - R + i * step, z = cz - R + j * step;
    const lv = levelAt(x, z);
    pos.push(x, lv !== null ? lv - 1.6 : sampleTerrain(terrain, x, z), z);
    if (lv !== null) col.push(0.2, 0.24, 0.24); else { const k = 0.52 + 0.06 * Math.sin(x * 0.7) * Math.sin(z * 0.9); col.push(k, k * 0.98, k * 0.9); }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  decor.add(ground);
  // plans d'eau
  const wm = new THREE.MeshStandardMaterial({ color: 0x4c7480, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 });
  for (const wp of water) {
    let near = false;
    for (let i = 0; i < wp.ring.length && !near; i += 2) near = Math.abs(wp.ring[i] - cx) < R + 40 && Math.abs(wp.ring[i + 1] - cz) < R + 40;
    if (!near) continue;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < wp.ring.length; i += 2) pts.push(new THREE.Vector2(wp.ring[i], wp.ring[i + 1]));
    const tri = THREE.ShapeUtils.triangulateShape(pts, []);
    const p: number[] = [], ix: number[] = [];
    for (const v of pts) p.push(v.x, wp.level, v.y);
    for (const t of tri) ix.push(t[0], t[2], t[1]);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); wg.setIndex(ix); wg.computeVertexNormals();
    const mesh = new THREE.Mesh(wg, wm); mesh.material.side = THREE.DoubleSide;
    decor.add(mesh);
  }
  // tabliers génériques : chaussée, trottoirs relevés de 8 cm, bandeau de 0,9 m, parapet de pierre de 0,95 × 0,36 m
  const road = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 }), walk = new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: 0.9 }), stone = new THREE.MeshStandardMaterial({ color: 0xb9b09a, roughness: 0.9 });
  const boxAt = (m: THREE.Material, ax: number, az: number, bx: number, bz: number, d0: number, d1: number, y0a: number, y0b: number, h: number): void => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
    const P = (t: number, d: number, y: number): number[] => [ax + (bx - ax) * t + nx * d, y, az + (bz - az) * t + nz * d];
    const v = [P(0, d0, y0a), P(0, d1, y0a), P(1, d1, y0b), P(1, d0, y0b), P(0, d0, y0a + h), P(0, d1, y0a + h), P(1, d1, y0b + h), P(1, d0, y0b + h)];
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
    bg.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    bg.computeVertexNormals();
    const mesh = new THREE.Mesh(bg.toNonIndexed(), m); mesh.geometry.computeVertexNormals(); mesh.material.side = THREE.DoubleSide;
    mesh.castShadow = true; mesh.receiveShadow = true;
    decor.add(mesh);
  };
  profile.focus(cx - R, cz - R, cx + R, cz + R);
  graph.edges.forEach((ed, e) => {
    if (!ed.bridge || ed.tunnel) return;
    const p = ed.points;
    if (Math.abs(p[0] - cx) > R + 60 || Math.abs(p[1] - cz) > R + 60) return;
    const half = Math.max(1.5, ed.width / 2 + ed.sidewalk), hr = ed.width / 2;
    let s = 0;
    for (let i = 2; i + 1 < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1], len = Math.hypot(bx - ax, bz - az);
      const ya = profile.axisY(e, s), yb = profile.axisY(e, s + len);
      boxAt(road, ax, az, bx, bz, -hr, hr, ya - 0.9, yb - 0.9, 0.9);
      for (const sd of [-1, 1]) {
        boxAt(walk, ax, az, bx, bz, sd * hr, sd * half, ya - 0.9, yb - 0.9, 0.98);
        // parapet générique seulement au-dessus de l'eau, comme dans le module de la ville
        const parts = Math.max(1, Math.round(len / 4));
        for (let k = 0; k < parts; k++) {
          const t0 = k / parts, t1 = (k + 1) / parts, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
          const nx = -(bz - az) / len, nz = (bx - ax) / len;
          if (levelAt(mx + nx * sd * (half + 0.8), mz + nz * sd * (half + 0.8)) === null) continue;
          boxAt(stone, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, sd * (half - 0.36), sd * half, ya + (yb - ya) * t0 + 0.08, ya + (yb - ya) * t1 + 0.08, 0.95);
        }
      }
      s += len;
    }
  });
  void heightAt;
}

function fitSun(x: number, y: number, z: number, r: number): void {
  sun.position.set(x + r * 0.55, y + r * 1.0, z + r * 0.8);
  sun.target.position.set(x, y, z);
  const cam = sun.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = r * 4;
  cam.updateProjectionMatrix();
}

/** Caméra en repère LOCAL du monument (origine au point d'ancrage posé sur le sol, +z = façade). */
function look(cx: number, cy: number, cz: number, tx: number, ty: number, tz: number): void {
  if (!site) return;
  const y0 = worldHeight(site.lm.x, site.lm.z);
  const c = toWorld(site.lm, cx, cz), t = toWorld(site.lm, tx, tz);
  camera.position.set(c[0], y0 + cy, c[1]);
  camera.lookAt(t[0], y0 + ty, t[1]);
}

let worldHeight: (x: number, z: number) => number = () => 0;

/** Vues : 0 = trois quarts, 1 = élévation latérale basse, 2 = piéton (œil à 1,7 m), 3 = trois quarts arrière en plongée. */
function setView(i: number): void {
  if (!site) return;
  const r = site.radius, h = site.height;
  const d = r * 1.35 + h * 1.2;
  if (i === 0) look(d * 0.62, d * 0.3 + 4, d * 0.75, 0, h * 0.25, 0);
  else if (i === 1) look(d * 1.02, Math.max(2.5, h * 0.16), 0, 0, h * 0.3, 0);
  else if (i === 2) { const z = Math.min(r * 0.7, 40); const y = worldHeight(...toWorld(site.lm, 2.5, z)) - worldHeight(site.lm.x, site.lm.z); look(2.5, y + 1.7, z, 6, y + 1.7 + h * 0.18, z - 30); }
  else look(-d * 0.66, d * 0.62, -d * 0.52, 0, h * 0.2, 0);
}

function stats(): Record<string, number | string> {
  const prev = { d: decor.visible, s: sun.castShadow, k: sky.visible };
  decor.visible = false; sun.castShadow = false; sky.visible = false;
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  decor.visible = prev.d; sun.castShadow = prev.s; sky.visible = prev.k;
  const st = sysApi ? sysApi.stats() : null;
  // bilan du seul monument demandé (les voisins affichés par le système sont comptés à part)
  let own = { triangles: 0, drawCalls: 0 }, size = [0, 0, 0], top = 0;
  const root = world.children.find((c) => c.name === 'monuments');
  const def = site ? getMonument(site.lm.key) : undefined;
  if (root && def && site) {
    for (const g of root.children) {
      if (g.name !== `monument:${def.key}` || Math.abs(g.position.x - site.lm.x) > 0.01 || Math.abs(g.position.z - site.lm.z) > 0.01) continue;
      for (const c of g.children) {
        if (!c.visible) continue;
        const s = c.userData.stats as { triangles: number; drawCalls: number } | undefined;
        if (s) own = s;
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
        const box = new THREE.Box3();
        c.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.geometry) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld))); } });
        size = [+(box.max.x - box.min.x).toFixed(2), +(box.max.y - box.min.y).toFixed(2), +(box.max.z - box.min.z).toFixed(2)]; top = +box.max.y.toFixed(2);
      }
    }
  }
  return {
    key: site?.lm.key ?? '', quality, far: far ? 1 : 0, triangles: own.triangles, drawCalls: own.drawCalls, width: size[0], depth: size[2], top,
    sceneCalls: calls, sceneTriangles: tris, known: st?.known ?? 0, detailed: st?.detailed ?? 0, distant: st?.distant ?? 0, horizon: st?.horizon ?? 0,
    horizonTriangles: st?.horizonTriangles ?? 0,
  };
}

async function start(): Promise<void> {
  const manifest = (await json('manifest.json')) as { bounds: { minX: number; minZ: number; maxX: number; maxZ: number }; waterLevel: number };
  const [rawLm, rawTerrain, rawGraph] = await Promise.all([json('landmarks.json'), json('terrain.json'), json('roadgraph.json')]);
  const landmarks = decodeLandmarks(rawLm as Parameters<typeof decodeLandmarks>[0]) as unknown as LandmarkInfo[];
  const terrain = decodeTerrain(rawTerrain as Parameters<typeof decodeTerrain>[0]);
  const graph = decodeRoadGraph(rawGraph as Parameters<typeof decodeRoadGraph>[0]);
  const profile = new BridgeProfile(graph, (x, z) => sampleTerrain(terrain, x, z));
  // altitude du monde : relief, ou tablier à moins d'une demi-largeur de l'axe d'un pont (comme world/query)
  const allBridges = new BridgeProfile(graph, (x, z) => sampleTerrain(terrain, x, z));
  allBridges.focus(manifest.bounds.minX, manifest.bounds.minZ, manifest.bounds.maxX, manifest.bounds.maxZ);
  worldHeight = (x, z) => {
    const ground = sampleTerrain(terrain, x, z);
    if (!allBridges.nearest(x, z)) return ground;
    const ed = graph.edges[allBridges.lastEdge];
    return allBridges.lastDist <= Math.max(1.5, ed.width / 2 + ed.sidewalk) ? allBridges.axisY(allBridges.lastEdge, allBridges.lastAlong) : ground;
  };
  const services = new Map<string, unknown>();
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const viewApi = {
    renderer, scene, camera, world, quality, drawDistance: 900,
    get camX() { return far ? lodCam.x : camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return far ? lodCam.z : camera.position.z; },
    shake() { /* sans objet */ }, setScreenEffect() { /* sans objet */ },
  };
  const ctx = {
    headless: false, view: viewApi,
    world: { ready: true, landmarks, bounds: manifest.bounds, waterLevel: manifest.waterLevel, heightAt: worldHeight },
    env: { state: env },
    events: { on: (name: string, h: (p: unknown) => void) => { const l = handlers.get(name) ?? []; l.push(h); handlers.set(name, l); return () => { l.splice(l.indexOf(h), 1); }; } },
    provide: (k: string, s: unknown) => { services.set(k, s); },
    service: (k: string) => services.get(k),
  } as unknown as GameContext;
  systems = createSystems();
  for (const s of systems) s.provide?.(ctx);
  for (const s of systems) void s.init?.(ctx);
  sysApi = (ctx.service<MonumentsApi>('monuments') ?? null) as MonumentsApi | null;
  const worldApi = ctx.service<WorldMonumentsApi>('world.monuments');
  w.__sys = { api: sysApi, worldApi, landmarks: () => sysApi?.landmarks().map((l) => l.key) };

  let cx = 0, cz = 0, R = 260;
  if (!horizonDemo) {
    const lm = sysApi!.landmarks().find((l) => l.key === key);
    const def = getMonument(key);
    if (!lm || !def) throw new Error(`repère ou monument inconnu : ${key}`);
    site = { lm, radius: def.radius, height: def.height };
    cx = lm.x; cz = lm.z; R = Math.min(420, def.radius + Number(params.get('r') ?? 170));
  }
  const tiles: Tile[] = [];
  for (let tx = Math.floor((cx - R - 40) / 512); tx <= Math.floor((cx + R + 40) / 512); tx++) {
    for (let tz = Math.floor((cz - R - 40) / 512); tz <= Math.floor((cz + R + 40) / 512); tz++) {
      try { tiles.push(decodeTile((await json(`tiles/t_${tx}_${tz}.json`)) as Parameters<typeof decodeTile>[0])); } catch { /* hors carte */ }
    }
  }
  buildDecor(cx, cz, R, terrain, tiles, graph, profile, worldHeight, manifest.waterLevel);
  const person = human();
  decor.add(person);
  if (site) {
    const p = toWorld(site.lm, 2.5, Math.min(site.radius * 0.7, 40) - 6);
    person.position.set(p[0], worldHeight(p[0], p[1]), p[1]);
    fitSun(cx, worldHeight(cx, cz), cz, Math.min(260, site.radius * 1.5 + 60));
    lodCam.x = cx + 700 + site.radius; lodCam.z = cz;
  } else fitSun(0, 0, 0, 200);

  setNight(params.get('night') === '1');
  far = params.get('far') === '1';
  if (horizonDemo) { camera.position.set(0, 12, 0); camera.lookAt(HORIZON[0].x, 80, HORIZON[0].z); }
  else setView(Number(params.get('view') ?? 0));

  ['Trois quarts', 'Élévation', 'Piéton', 'Arrière'].forEach((l, i) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => setView(i); bar.appendChild(b); });
  const bn = document.createElement('button'); bn.textContent = 'Jour / nuit'; bn.onclick = () => setNight(!night); bar.appendChild(bn);
  const bf = document.createElement('button'); bf.textContent = 'Détail / silhouette'; bf.onclick = () => { far = !far; }; bar.appendChild(bf);

  w.__setView = setView; w.__look = look; w.__setNight = setNight; w.__stats = stats;
  w.__setFar = (f: boolean) => { far = f; };
  w.__setFog = (v: number) => { env.fog = v; };
  w.__lookWorld = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, fov?: number) => { camera.position.set(ax, ay, az); camera.lookAt(bx, by, bz); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  w.__horizon = HORIZON.map((h) => ({ key: h.key, x: h.x, z: h.z, baseY: h.baseY, height: h.height }));

  let last = performance.now(), ready = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; time += dt;
    for (const s of systems) s.frame?.(Math.max(dt, 0.21));       // une passe de niveau de détail par image
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    frames++;
    w.__frames = frames;
    const st = sysApi!.stats();
    if (frames % 15 === 1 && !document.body.classList.contains('shot')) hud.textContent = `${site ? site.lm.name : 'Silhouettes d\'horizon'}\n${JSON.stringify(st)}`;
    // prêt quand le système a posé tout ce qu'il devait (plus rien ne change pendant 6 images)
    const sig = st.detailed * 1000 + st.distant;
    if (sig === (w.__sig as number | undefined)) ready++; else { ready = 0; w.__sig = sig; }
    if (ready >= 6 && frames > 8) w.__ready = true;
  });
  void time;
}

window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });
start().catch((err) => { console.error('[banc ponts] ' + (err instanceof Error ? err.stack : String(err))); w.__ready = true; w.__failed = String(err); });
