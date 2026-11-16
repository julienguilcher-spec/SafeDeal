// Banc d'essai de la ville en 3D (src/world/view) : sol, chaussées, trottoirs, Seine, ponts, arbres,
// barrières, lointain, et le système qui construit et libère les tuiles au fil du déplacement.
//
// Le vrai moteur est utilisé (Game), avec le monde de la simulation (src/world/query), les monuments
// et la ville ; le banc d'essai ne fournit que ce que les modules de rendu de base feront : un
// renderer, un ciel, un soleil, une caméra (ctx.view) et l'heure et la météo (ctx.env).
//
// Paramètres d'URL :
//   place=champs|concorde|rivoli|marais|quai|etoile|…  point de vue de départ (ou x=, z=, cap= en degrés)
//   heure=0..24      meteo=clair|nuageux|couvert|pluie|averse|brouillard|orage
//   quality=bas|moyen|haut|ultra (défaut haut)    dist=distance d'affichage en m (défaut 1500)
//   map=test         quartier d'essai (sinon Paris si public/data/paris existe, sinon repli automatique)
//   shot=1           pas d'interface, rendu à la demande (captures)    carte=1  mini-carte affichée
//   immeubles=0      sol seul        monuments=0
// Souris : glisser pour regarder ; ZQSD / flèches pour se déplacer, A/E monter et descendre, Maj pour aller vite.
// API de test : window.__ready, __goto(vue, { heure, meteo }), __stats(), __memory(), __roundTrip(), __map(…).
import * as THREE from 'three';
import type { EnvApi, EnvState, QualityLevel, RoadSample, ViewApi, WeatherKind } from '../src/core/contracts';
import { Game } from '../src/core/game';
import { createSystems as createMonuments } from '../src/world/monuments';
import { createWorldQuerySystems } from '../src/world/query';
import type { WorldData } from '../src/world/query/api';
import { MAP_NORTH_UP, createWorldViewSystems } from '../src/world/view';
import type { Map2dApi, WorldViewApi } from '../src/world/view/api';

const params = new URLSearchParams(location.search);
const quality = (['bas', 'moyen', 'haut', 'ultra'].includes(params.get('quality') ?? '') ? params.get('quality') : 'haut') as QualityLevel;
const shotMode = params.get('shot') === '1';
if (shotMode) document.body.classList.add('shot');
if (params.get('carte') === '1') document.body.classList.remove('nomap');
const hud = document.getElementById('hud') as HTMLDivElement;
const bar = document.getElementById('bar') as HTMLDivElement;
const W = window as unknown as Record<string, unknown>;
W.__ready = false;
W.__frames = 0;

// ─────────────────────────────── rendu de base du banc d'essai ───────────────────────────────

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = quality !== 'bas' && params.get('ombres') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 24000);
const worldGroup = new THREE.Group();
worldGroup.name = 'world';
scene.add(worldGroup);
const drawDistance = Math.max(300, Number(params.get('dist') ?? 1500));

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() }, haze: { value: 0.3 },
  },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float haze; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir); float t = pow(clamp(d.y, 0.0, 1.0), 0.45 + haze);
      vec3 c = mix(horizon, top, t); float s = max(dot(d, sunDir), 0.0);
      c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.22 * (1.0 - haze));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(18000, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a655c, 1);
scene.add(hemi);
const fog = new THREE.Fog(0xb8c6d6, 200, 3000);
scene.fog = fog;

// ── heure et météo (ce que fera src/env) ──
const env: EnvState = {
  timeOfDay: 15, clockScale: 0, weather: 'clair', rain: 0, fog: 0, clouds: 0.2, wetness: 0, windX: 2.2, windZ: 1.1, sunX: 0, sunY: 1, sunZ: 0,
  daylight: 1, isNight: false, streetLights: false,
};
const WEATHER: Record<WeatherKind, { clouds: number; rain: number; fog: number; wet: number; wind: number }> = {
  clair: { clouds: 0.12, rain: 0, fog: 0.02, wet: 0, wind: 2 },
  nuageux: { clouds: 0.5, rain: 0, fog: 0.05, wet: 0, wind: 3 },
  couvert: { clouds: 0.92, rain: 0, fog: 0.12, wet: 0.15, wind: 3 },
  pluie: { clouds: 1, rain: 0.55, fog: 0.22, wet: 1, wind: 5 },
  averse: { clouds: 1, rain: 1, fog: 0.35, wet: 1, wind: 8 },
  brouillard: { clouds: 0.8, rain: 0, fog: 0.85, wet: 0.35, wind: 0.5 },
  orage: { clouds: 1, rain: 0.9, fog: 0.3, wet: 1, wind: 11 },
};
const tmpColor = new THREE.Color(), tmpColor2 = new THREE.Color();

function applyEnv(): void {
  const w = WEATHER[env.weather] ?? WEATHER.clair;
  env.clouds = w.clouds; env.rain = w.rain; env.fog = w.fog; env.wetness = w.wet;
  env.windX = w.wind * 0.9; env.windZ = w.wind * 0.45;
  // Course du soleil : lever vers 6 h 30 à l'est, culmination au sud à 13 h, coucher vers 19 h 30 ; la lune prend le relais.
  const h = ((env.timeOfDay % 24) + 24) % 24;
  const a = ((h - 13) / 24) * Math.PI * 2;
  const elev = Math.cos(a) * 0.72 + 0.05;
  let sx = -Math.sin(a), sy = elev, sz = Math.cos(a) * 0.62 + 0.25;
  const night = sy < -0.02;
  if (night) { sx = -sx * 0.6; sy = 0.55; sz = -0.4; }
  const len = Math.hypot(sx, sy, sz);
  env.sunX = sx / len; env.sunY = sy / len; env.sunZ = sz / len;
  const up = elev;
  env.daylight = THREE.MathUtils.smoothstep(up, -0.12, 0.3) * (1 - 0.35 * w.clouds);
  env.isNight = env.daylight < 0.12;
  env.streetLights = env.daylight < 0.35;
  const d = env.daylight;
  const low = 1 - THREE.MathUtils.smoothstep(up, 0.0, 0.45);
  // ciel
  const top = (skyMat.uniforms.top.value as THREE.Color).setRGB(0.07, 0.2, 0.52).lerp(tmpColor.setRGB(0.3, 0.33, 0.38), w.clouds).multiplyScalar(0.03 + 0.97 * d);
  const hor = (skyMat.uniforms.horizon.value as THREE.Color).setRGB(0.5, 0.67, 0.86).lerp(tmpColor.setRGB(0.56, 0.58, 0.6), w.clouds)
    .lerp(tmpColor2.setRGB(0.95, 0.55, 0.3), low * (1 - w.clouds) * 0.55).multiplyScalar(0.04 + 0.96 * d);
  if (night) { top.add(tmpColor.setRGB(0.004, 0.006, 0.014)); hor.add(tmpColor.setRGB(0.03, 0.026, 0.03)); }
  (skyMat.uniforms.sunDir.value as THREE.Vector3).set(env.sunX, env.sunY, env.sunZ);
  (skyMat.uniforms.sunColor.value as THREE.Color).setRGB(1, 0.92 - 0.3 * low, 0.8 - 0.5 * low).multiplyScalar(night ? 0.12 : (1 - w.clouds) * d);
  skyMat.uniforms.haze.value = 0.15 + 0.5 * w.fog + 0.25 * w.clouds;
  // lumières
  if (night) { sun.color.setRGB(0.6, 0.7, 1); sun.intensity = 0.1 * (1 - 0.7 * w.clouds); }
  else { sun.color.setRGB(1, 0.95 - 0.28 * low, 0.86 - 0.5 * low); sun.intensity = 3.4 * THREE.MathUtils.smoothstep(up, -0.02, 0.25) * (1 - 0.86 * w.clouds); }
  hemi.color.copy(top).lerp(hor, 0.5).multiplyScalar(1.6);
  hemi.groundColor.setRGB(0.42, 0.4, 0.36).multiplyScalar(0.25 + 0.75 * d);
  hemi.intensity = night ? 0.5 : 0.75 + 0.75 * w.clouds;
  // brume : couleur de l'horizon, portée selon la météo
  fog.color.copy(hor).lerp(top, 0.15);
  fog.near = THREE.MathUtils.lerp(260, 8, w.fog);
  fog.far = THREE.MathUtils.lerp(drawDistance * 2.6, 190, Math.pow(w.fog, 0.6));
  renderer.toneMappingExposure = night ? 1.5 : 1.0;
  nightLights.visible = env.streetLights;
  lampGlow.visible = env.streetLights;
}

const envApi: EnvApi = {
  state: env,
  setTime(hour: number) { env.timeOfDay = hour; applyEnv(); },
  setWeather(kind: WeatherKind) { env.weather = kind; applyEnv(); },
  setClockScale(scale: number) { env.clockScale = scale; },
  setWind(x: number, z: number) { env.windX = x; env.windZ = z; },
};

// ── candélabres de démonstration (le vrai mobilier est rendu par un autre module) : quelques points lumineux
//    près de la caméra, pour montrer que le sol réagit aux lumières de la scène ──
const nightLights = new THREE.Group();
const LAMP_COUNT = 6;
for (let i = 0; i < LAMP_COUNT; i++) {
  const l = new THREE.PointLight(0xffb469, 0, 26, 1.6);
  nightLights.add(l);
}
scene.add(nightLights);
const lampGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true }), 400);
lampGlow.count = 0;
lampGlow.frustumCulled = false;
scene.add(lampGlow);

// ─────────────────────────────── moteur et modules ───────────────────────────────

const viewState = { camX: 0, camY: 0, camZ: 0 };
const viewApi: ViewApi = {
  renderer, scene, camera, world: worldGroup, quality, drawDistance,
  get camX() { return viewState.camX; },
  get camY() { return viewState.camY; },
  get camZ() { return viewState.camZ; },
  shake() { /* sans objet ici */ },
  setScreenEffect() { /* sans objet ici */ },
};

const game = new Game({ storage: null, headless: false });
const ctx = game.ctx;
(ctx as { view: ViewApi | null }).view = viewApi;
ctx.env = envApi;
const base = params.get('base') ?? '../data/paris/';
game.addModule(() => createWorldQuerySystems({ source: params.get('map') === 'test' ? 'test' : 'paris', baseUrl: base }));
if (params.get('monuments') !== '0') game.addModule(createMonuments);
game.addModule(() => createWorldViewSystems({ baseUrl: base, buildings: params.get('immeubles') !== '0' }));

let view!: WorldViewApi;
let map2d!: Map2dApi;
let data!: WorldData;

// ─────────────────────────────── caméra ───────────────────────────────

const cam = { x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, eye: 1.7, walk: true };
const keys = new Set<string>();
let dragging = false;

function placeCamera(): void {
  if (cam.walk) cam.y = ctx.world.heightAt(cam.x, cam.z) + view.liftAt(cam.x, cam.z) + cam.eye;
  camera.position.set(cam.x, cam.y, cam.z);
  const cp = Math.cos(cam.pitch);
  camera.lookAt(cam.x + Math.sin(cam.yaw) * cp, cam.y + Math.sin(cam.pitch), cam.z + Math.cos(cam.yaw) * cp);
  viewState.camX = cam.x; viewState.camY = cam.y; viewState.camZ = cam.z;
  sky.position.copy(camera.position);
  // les ombres suivent la zone regardée
  const reach = cam.walk ? 55 : Math.min(420, 80 + (cam.y - ctx.world.heightAt(cam.x, cam.z)) * 1.1);
  const tx = cam.x + Math.sin(cam.yaw) * reach * 0.8, tz = cam.z + Math.cos(cam.yaw) * reach * 0.8;
  sun.target.position.set(tx, ctx.world.heightAt(tx, tz), tz);
  sun.position.set(tx + env.sunX * 900, sun.target.position.y + env.sunY * 900, tz + env.sunZ * 900);
  sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera;
  const span = reach * 1.5 + 30;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 100; sc.far = 2200;
  sc.updateProjectionMatrix();
}

function lookAt(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
  cam.walk = false;
  cam.x = x; cam.y = y; cam.z = z;
  cam.yaw = Math.atan2(tx - x, tz - z);
  cam.pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
}

/** Piéton : au point (x, z), regard vers (tx, tz), yeux à 1,7 m ; `up` incline le regard (m au-dessus de l'horizon à 100 m). */
function standAt(x: number, z: number, tx: number, tz: number, up = 4): void {
  cam.walk = true;
  cam.eye = 1.7;
  cam.x = x; cam.z = z;
  cam.yaw = Math.atan2(tx - x, tz - z);
  cam.pitch = Math.atan2(up, 100);
}

// ── points de vue prédéfinis ──
const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

/** Sur le trottoir de la voie la plus proche du point, regard dans l'axe ; `flip` : regarder dans l'autre sens. */
function streetView(x: number, z: number, side: number, flip: boolean, up = 5, towardX?: number, towardZ?: number): boolean {
  if (!ctx.world.nearestRoad(x, z, road, 200)) return false;
  let h = road.heading;
  if (towardX !== undefined && towardZ !== undefined) {
    // regarder du côté du point visé
    const d = Math.sin(h) * (towardX - road.x) + Math.cos(h) * (towardZ - road.z);
    if (d < 0) h += Math.PI;
  } else if (flip) h += Math.PI;
  const off = (road.width / 2 + 2.2) * side;
  const px = road.x - Math.cos(h) * off, pz = road.z + Math.sin(h) * off;
  standAt(px, pz, px + Math.sin(h) * 100, pz + Math.cos(h) * 100, up);
  return true;
}

function placeXZ(name: string, fx: number, fz: number): { x: number; z: number } {
  const p = ctx.world.placeByName(name);
  return p ? { x: p.x, z: p.z } : { x: fx, z: fz };
}

function landmarkXZ(key: string, fx: number, fz: number): { x: number; z: number } {
  for (const lm of ctx.world.landmarks) if (lm.key === key) return { x: lm.x, z: lm.z };
  return { x: fx, z: fz };
}

/** Point le plus proche du repère sur une voie de ce nom (toutes les arêtes du graphe sont parcourues : banc d'essai). */
function streetByName(name: string, nearX: number, nearZ: number): { x: number; z: number; heading: number; width: number } | null {
  const wanted = name.toLowerCase();
  let best = Infinity;
  let out: { x: number; z: number; heading: number; width: number } | null = null;
  for (const ed of data.roadGraph.edges) {
    if (ed.name.toLowerCase() !== wanted) continue;
    const pts = ed.points;
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((nearX - ax) * dx + (nearZ - az) * dz) / len2));
      const x = ax + dx * t, z = az + dz * t;
      const d = Math.hypot(x - nearX, z - nearZ);
      if (d < best) { best = d; out = { x, z, heading: Math.atan2(dx, dz), width: ed.width }; }
    }
  }
  return out;
}

/** Piéton sur le trottoir d'une voie nommée, regard dans l'axe, du côté du point visé. `side` : +1 à droite du regard, -1 à gauche. */
function namedStreetView(name: string, nearX: number, nearZ: number, towardX: number, towardZ: number, side: number, margin: number, up: number): boolean {
  const st = streetByName(name, nearX, nearZ);
  if (st === null) return false;
  let h = st.heading;
  if (Math.sin(h) * (towardX - st.x) + Math.cos(h) * (towardZ - st.z) < 0) h += Math.PI;
  const off = (st.width / 2 + margin) * side;
  // droite du regard = (−cos h, sin h)
  const px = st.x - Math.cos(h) * off, pz = st.z + Math.sin(h) * off;
  standAt(px, pz, px + Math.sin(h) * 100, pz + Math.cos(h) * 100, up);
  return true;
}

/** Un point du quai d'où l'on voit le fleuve et le pont : sol praticable à moins de 6 m de l'eau, à 90–170 m du pont. */
function quaySpot(bx: number, bz: number): { x: number; z: number } | null {
  let best = -Infinity;
  let out: { x: number; z: number } | null = null;
  for (let dz = -220; dz <= 60; dz += 4) {
    for (let dx = 40; dx <= 260; dx += 4) {
      const x = bx + dx, z = bz + dz;
      const d = Math.hypot(dx, dz);
      if (d < 90 || d > 190) continue;
      const k = ctx.world.surfaceAt(x, z);
      if (k !== 'sidewalk' && k !== 'plaza' && k !== 'quay') continue;
      if (!ctx.world.isFree(x, z, 0.6)) continue;
      // de l'eau tout près, vers le sud
      let water = 0;
      for (let q = 2; q <= 7; q++) if (ctx.world.surfaceAt(x - 1.5, z + q) === 'water' || ctx.world.surfaceAt(x - q * 0.6, z + q * 0.8) === 'water') water++;
      if (water < 2) continue;
      const score = -Math.abs(d - 135) + ctx.world.heightAt(x, z) * 4;
      if (score > best) { best = score; out = { x, z }; }
    }
  }
  return out;
}

interface Vue { label: string; anchor?(): { x: number; z: number }; go(): void }
const paris = (): boolean => data.manifest.name === 'paris';

const VUES: Record<string, Vue> = {
  champs: {
    label: 'Champs-Élysées vers l\'Arc',
    go() {
      if (!paris()) { streetView(-200, 2, 1, false, 6, 0, 0); return; }
      const arc = landmarkXZ('arc_triomphe', -1920, -906);
      // sur l'avenue, à 430 m de l'Arc, côté Concorde ; sur le trottoir, à deux pas de la bordure
      const ux = -arc.x, uz = -arc.z, n = Math.hypot(ux, uz);
      const px = arc.x + (ux / n) * 430, pz = arc.z + (uz / n) * 430;
      if (!namedStreetView('Avenue des Champs-Élysées', px, pz, arc.x, arc.z, 1, 2.4, 7)) standAt(px, pz, arc.x, arc.z, 7);
      cam.yaw = Math.atan2(arc.x - cam.x, arc.z - cam.z) - 0.05;
    },
  },
  chaussee: {
    label: 'Champs-Élysées, au milieu de la chaussée',
    go() {
      if (!paris()) { standAt(-150, 0, 0, 0, 3); return; }
      const arc = landmarkXZ('arc_triomphe', -1920, -906);
      const ux = -arc.x, uz = -arc.z, n = Math.hypot(ux, uz);
      const px = arc.x + (ux / n) * 520, pz = arc.z + (uz / n) * 520;
      ctx.world.nearestRoad(px, pz, road, 120);
      standAt(road.x, road.z, arc.x, arc.z, 5);
    },
  },
  concorde: {
    label: 'Place de la Concorde',
    go() {
      if (!paris()) { standAt(60, 40, 0, 0, 5); return; }
      const ob = landmarkXZ('obelisque_concorde', -8, 17);
      standAt(ob.x + 78, ob.z + 62, ob.x - 6, ob.z - 10, 9);
    },
  },
  rivoli: {
    label: 'Rue de Rivoli',
    go() {
      if (!paris()) { streetView(120, -150, 1, false); return; }
      // trottoir des arcades, le jardin des Tuileries à droite : la rue file vers le Louvre
      if (!namedStreetView('Rue de Rivoli', 470, -30, 1035, 519, -1, 1.8, 7)) standAt(470, -30, 1035, 519);
    },
  },
  marais: {
    label: 'Rue étroite du Marais',
    go() {
      if (!paris()) { streetView(250, 250, 1, false); return; }
      if (!namedStreetView('Rue des Rosiers', 2768, 938, 2900, 950, 0.2, 0, 9)) standAt(2768, 938, 2868, 938, 9);
    },
  },
  quai: {
    label: 'Quai de Seine et pont',
    go() {
      if (!paris()) { standAt(60, 330, -20, 420, -6); return; }
      // rive droite, en amont du pont de la Concorde : le parapet, le fleuve, le pont, le Palais Bourbon
      const p = placeXZ('pont de la Concorde', -127, 250);
      const q = quaySpot(p.x, p.z) ?? { x: p.x + 150, z: p.z - 118 };
      standAt(q.x, q.z, p.x + 10, p.z + 40, -9);
    },
    anchor() { return placeXZ('pont de la Concorde', -127, 250); },
  },
  pont: {
    label: 'Sur le pont de la Concorde',
    go() {
      if (!paris()) { standAt(0, 400, 0, 500, 0); return; }
      const p = placeXZ('pont de la Concorde', -127, 250);
      ctx.world.nearestRoad(p.x, p.z, road, 80);
      const h = road.heading;
      standAt(road.x - Math.cos(h) * (road.width / 2 + 1.5), road.z + Math.sin(h) * (road.width / 2 + 1.5), road.x + Math.sin(h) * 100, road.z + Math.cos(h) * 100, 2);
    },
  },
  berge: {
    label: 'La Seine vue du pont',
    go() {
      if (!paris()) { lookAt(-40, 6, 420, 200, -4, 430); return; }
      const p = placeXZ('pont de la Concorde', -127, 250);
      lookAt(p.x + 30, ctx.world.heightAt(p.x, p.z) + 3.2, p.z + 6, p.x + 420, ctx.world.heightAt(p.x, p.z) - 6, p.z + 190);
    },
  },
  etoile: {
    label: 'L\'Étoile vue du ciel',
    go() {
      if (!paris()) { lookAt(-260, 240, 330, 0, 0, 0); return; }
      const arc = landmarkXZ('arc_triomphe', -1920, -906);
      const y = ctx.world.heightAt(arc.x, arc.z);
      lookAt(arc.x + 330, y + 300, arc.z + 400, arc.x, y + 10, arc.z);
    },
  },
  ciel: {
    label: 'Concorde et Seine vues du ciel',
    go() {
      if (!paris()) { lookAt(200, 300, 520, 0, 0, 100); return; }
      lookAt(260, 330, 560, -30, 0, 120);
    },
  },
  tuileries: {
    label: 'Jardin des Tuileries',
    go() {
      if (!paris()) { standAt(-300, -300, -250, -250); return; }
      standAt(330, 150, 620, 300, 4);
    },
  },
};

// ─────────────────────────────── boucle ───────────────────────────────

let lastTime = performance.now();
let frames = 0;
const m4 = new THREE.Matrix4();

function updateLamps(): void {
  if (!env.streetLights) { lampGlow.count = 0; return; }
  // candélabres des tuiles chargées autour de la caméra : lanternes visibles, les plus proches éclairent
  const near: { x: number; z: number; d: number }[] = [];
  let n = 0;
  const tcx = Math.floor(cam.x / 512), tcz = Math.floor(cam.z / 512);
  for (let tz = tcz - 1; tz <= tcz + 1; tz++) for (let tx = tcx - 1; tx <= tcx + 1; tx++) {
    for (const f of ctx.world.furnitureInTile(tx, tz)) {
      if (f.kind !== 'candelabre') continue;
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      if (d > 320) continue;
      if (n < 400) {
        m4.makeTranslation(f.x + Math.sin(f.heading) * 1.2, ctx.world.heightAt(f.x, f.z) + 8.2, f.z + Math.cos(f.heading) * 1.2);
        lampGlow.setMatrixAt(n++, m4);
      }
      near.push({ x: f.x + Math.sin(f.heading) * 1.2, z: f.z + Math.cos(f.heading) * 1.2, d });
    }
  }
  lampGlow.count = n;
  lampGlow.instanceMatrix.needsUpdate = true;
  near.sort((a, b) => a.d - b.d);
  for (let i = 0; i < LAMP_COUNT; i++) {
    const l = nightLights.children[i] as THREE.PointLight;
    const p = near[i];
    if (!p) { l.intensity = 0; continue; }
    l.position.set(p.x, ctx.world.heightAt(p.x, p.z) + 7.6, p.z);
    l.intensity = 420;
  }
}

function tick(dt: number): void {
  // déplacement libre
  const speed = (keys.has('ShiftLeft') ? 60 : 9) * (cam.walk ? 1 : 2.5);
  let f = 0, s = 0, v = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('KeyE')) v += 1;
  if (keys.has('KeyQ')) v -= 1;
  if (f !== 0 || s !== 0 || v !== 0) {
    cam.x += (Math.sin(cam.yaw) * f - Math.cos(cam.yaw) * s) * speed * dt;
    cam.z += (Math.cos(cam.yaw) * f + Math.sin(cam.yaw) * s) * speed * dt;
    if (v !== 0) { cam.walk = false; cam.y += v * speed * dt; }
  }
  placeCamera();
  ctx.world.setFocus(cam.x, cam.z);
  game.frame(dt);
  updateLamps();
}

function renderOnce(): void {
  renderer.render(scene, camera);
  frames++;
  W.__frames = frames;
  if (!document.body.classList.contains('nomap')) drawMini();
}

function drawMini(): void {
  const c = document.getElementById('mini') as HTMLCanvasElement;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  map2d.draw(g, cam.x, cam.z, 1.6, cam.yaw, { width: c.width, height: c.height, names: true });
  // repère du joueur
  g.fillStyle = '#1b62d6';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(c.width / 2, c.height / 2 - 9);
  g.lineTo(c.width / 2 + 6, c.height / 2 + 7);
  g.lineTo(c.width / 2 - 6, c.height / 2 + 7);
  g.closePath();
  g.stroke();
  g.fill();
}

function loop(): void {
  const t = performance.now();
  const dt = Math.min(0.1, (t - lastTime) / 1000);
  lastTime = t;
  tick(dt);
  renderOnce();
  if (frames % 15 === 1 && !shotMode) {
    const st = view.stats();
    const info = renderer.info;
    hud.textContent = `${data.manifest.name} — qualité ${quality} — ${ctx.world.sectorName(cam.x, cam.z)}\n`
      + `caméra ${cam.x.toFixed(0)} ; ${cam.y.toFixed(1)} ; ${cam.z.toFixed(0)}  cap ${((cam.yaw * 180) / Math.PI).toFixed(0)}°  ${env.timeOfDay.toFixed(1)} h  ${env.weather}\n`
      + `tuiles : ${st.detailTiles} détaillées, ${st.farTiles} lointaines, ${st.queued} en file, ${st.fetching} en lecture\n`
      + `ville (hors immeubles) : ${st.drawCalls} appels, ${Math.round(st.triangles / 1000)} k triangles — immeubles : ${st.buildingDrawCalls} appels, ${Math.round(st.buildingTriangles / 1000)} k\n`
      + `image : ${info.render.calls} appels, ${Math.round(info.render.triangles / 1000)} k triangles ; mémoire : ${info.memory.geometries} géométries, ${info.memory.textures} textures\n`
      + `construction : ${st.lastFrameBuildMs.toFixed(1)} ms cette image, étape max ${st.maxStepMs.toFixed(1)} ms, immeubles max ${st.maxBuildingMs.toFixed(0)} ms`;
  }
  if (!shotMode) requestAnimationFrame(loop);
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Attend que tout ce qui entoure la caméra soit chargé et construit, puis rend l'image. */
async function settle(maxSeconds = 240): Promise<void> {
  const t0 = performance.now();
  placeCamera();
  ctx.world.setFocus(cam.x, cam.z);
  await ctx.world.whenLoaded(cam.x, cam.z, 700);
  for (let guard = 0; guard < 4000; guard++) {
    tick(0.016);
    const idle = view.flush(250);
    if (idle && view.pending() === 0) break;
    if ((performance.now() - t0) / 1000 > maxSeconds) break;
    await nextFrame();
  }
  // deux images : la première envoie géométries et textures à la carte graphique
  for (let i = 0; i < 3; i++) { tick(0.016); renderOnce(); await nextFrame(); }
}

async function goto(name: string, opts: { heure?: number; meteo?: WeatherKind } = {}): Promise<Record<string, unknown>> {
  if (opts.heure !== undefined) env.timeOfDay = opts.heure;
  if (opts.meteo !== undefined) env.weather = opts.meteo;
  applyEnv();
  const vue = VUES[name] ?? VUES.concorde;
  if (vue.anchor) {
    // certains points de vue se cherchent sur le terrain : il faut d'abord les tuiles du secteur
    const a = vue.anchor();
    ctx.world.setFocus(a.x, a.z);
    await ctx.world.whenLoaded(a.x, a.z, 400);
  }
  vue.go();
  await settle();
  // le point de vue dépend du sol une fois construit (surélévation du trottoir)
  placeCamera();
  tick(0.016);
  renderOnce();
  return stats();
}

function stats(): Record<string, unknown> {
  const st = view.stats();
  return {
    ...st, camera: [cam.x, cam.y, cam.z, cam.yaw], secteur: ctx.world.sectorName(cam.x, cam.z), source: data.manifest.name,
    rendu: { appels: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    memoire: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
  };
}

function memory(): { geometries: number; textures: number } {
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}

/** Aller-retour : part loin (toutes les tuiles du départ sont libérées), revient, et compare la mémoire de la carte graphique. */
async function roundTrip(): Promise<Record<string, unknown>> {
  const home = { ...cam };
  await settle();
  const before = memory();
  const tilesBefore = view.stats();
  // à l'autre bout de la carte
  const b = ctx.world.bounds;
  const far = Math.hypot(b.maxX - home.x, b.maxZ - home.z) > Math.hypot(b.minX - home.x, b.minZ - home.z) ? { x: b.maxX - 300, z: b.maxZ - 300 } : { x: b.minX + 300, z: b.minZ + 300 };
  cam.x = far.x; cam.z = far.z;
  await settle();
  const away = memory();
  const tilesAway = view.stats();
  Object.assign(cam, home);
  await settle();
  const after = memory();
  const tilesAfter = view.stats();
  return {
    avant: before, ailleurs: away, apres: after,
    tuilesAvant: [tilesBefore.detailTiles, tilesBefore.farTiles], tuilesAilleurs: [tilesAway.detailTiles, tilesAway.farTiles], tuilesApres: [tilesAfter.detailTiles, tilesAfter.farTiles],
    deplacement: Math.round(Math.hypot(far.x - home.x, far.z - home.z)),
  };
}

/** Carte 2D plein écran (capture) : centre, échelle (m par pixel), cap en haut, thème. */
function showMap(opts: { x?: number; z?: number; mpp?: number; rotation?: number; theme?: 'jour' | 'nuit' } | null): number {
  if (opts === null) { document.body.classList.remove('carte'); return 0; }
  document.body.classList.add('carte');
  const c = document.getElementById('carte') as HTMLCanvasElement;
  c.width = window.innerWidth; c.height = window.innerHeight;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const t0 = performance.now();
  map2d.draw(g, opts.x ?? cam.x, opts.z ?? cam.z, opts.mpp ?? 2, opts.rotation ?? MAP_NORTH_UP, { width: c.width, height: c.height, theme: opts.theme, complete: true });
  return performance.now() - t0;
}

function buildBar(): void {
  const add = (el: HTMLElement): void => { bar.appendChild(el); };
  for (const [key, vue] of Object.entries(VUES)) {
    const b = document.createElement('button');
    b.textContent = vue.label;
    b.onclick = () => { vue.go(); placeCamera(); };
    b.dataset.vue = key;
    add(b);
  }
  const hour = document.createElement('label');
  hour.innerHTML = 'heure <input type="range" min="0" max="24" step="0.25" style="vertical-align:middle;width:120px">';
  const range = hour.querySelector('input') as HTMLInputElement;
  range.value = String(env.timeOfDay);
  range.oninput = () => { env.timeOfDay = Number(range.value); applyEnv(); };
  add(hour);
  const sel = document.createElement('select');
  for (const k of Object.keys(WEATHER)) { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); }
  sel.value = env.weather;
  sel.onchange = () => { env.weather = sel.value as WeatherKind; applyEnv(); };
  add(sel);
  const mini = document.createElement('button');
  mini.textContent = 'mini-carte';
  mini.onclick = () => document.body.classList.toggle('nomap');
  add(mini);
}

async function main(): Promise<void> {
  await game.boot();
  view = ctx.require<WorldViewApi>('world.view');
  map2d = ctx.require<Map2dApi>('world.map2d');
  data = ctx.require<WorldData>('world.data');
  const h = Number(params.get('heure'));
  if (params.get('heure') !== null && Number.isFinite(h)) env.timeOfDay = h;
  const meteo = params.get('meteo') as WeatherKind | null;
  if (meteo && WEATHER[meteo]) env.weather = meteo;
  applyEnv();
  const px = Number(params.get('x')), pz = Number(params.get('z'));
  if (params.get('x') !== null && Number.isFinite(px) && Number.isFinite(pz)) {
    const capDeg = Number(params.get('cap') ?? 0);
    standAt(px, pz, px + Math.sin((capDeg * Math.PI) / 180) * 100, pz + Math.cos((capDeg * Math.PI) / 180) * 100);
  } else {
    (VUES[params.get('place') ?? ''] ?? VUES.concorde).go();
  }
  buildBar();
  W.__goto = goto;
  W.__stats = stats;
  W.__memory = memory;
  W.__roundTrip = roundTrip;
  W.__map = showMap;
  W.__setEnv = (heure: number, meteo2: WeatherKind) => { env.timeOfDay = heure; env.weather = meteo2; applyEnv(); tick(0.016); renderOnce(); };
  W.__look = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => { lookAt(x, y, z, tx, ty, tz); return settle(); };
  W.__stand = (x: number, z: number, tx: number, tz: number, up?: number) => { standAt(x, z, tx, tz, up); return settle(); };
  W.__render = () => { tick(0.016); renderOnce(); };
  W.__ctx = ctx;
  W.__renderer = renderer;
  await settle();
  W.__ready = true;
  if (!shotMode) requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.yaw -= e.movementX * 0.004;
  cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch - e.movementY * 0.004));
});
canvas.addEventListener('wheel', (e) => { cam.walk = false; cam.y = Math.max(1, cam.y * (1 + Math.sign(e.deltaY) * 0.12)); });

main().catch((err: unknown) => {
  console.error('[banc ville] ' + (err instanceof Error ? err.stack : String(err)));
  W.__error = err instanceof Error ? err.message : String(err);
  hud.textContent = 'Erreur : ' + W.__error;
});
