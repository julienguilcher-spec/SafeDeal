// Banc d'essai du rendu des véhicules. Le module est branché comme dans le jeu (Game → provide → init → frame) ;
// les véhicules sont créés dans le magasin du cœur avec les définitions de référence (bible de réalisme, tableau C).
// Vues (paramètre d'URL `view`) :
//   alignement : tous les modèles côte à côte avec une silhouette de 1,80 m (&page=1..6 ; &cam=face|profil|trois-quarts|dessus ;
//                &nuit=1 ; &etat=damaged|wrecked|burning|burnt ; &loin=1 pour voir les modèles lointains au téléobjectif)
//   fiche      : un modèle sous quatre angles (&kind=… ; &nuit=1 ; &loin=1 ; &portes=1 ; &gis=°, &site=° ; &braq=°)
//   etats      : un modèle dans ses cinq états (&kind=…)
//   interieur  : vue du conducteur (&kind=… ; &regard=° ; &vitesse=km/h ; &braq=° ; &nuit=1)
//   tourelle   : écran de visée (&kind=centaure|canon_eau ; &gis=° ; &site=°)
//   parc       : 150 véhicules civils instanciés, dont une partie roule (&n=150 ; &qualite=bas|moyen|haut|ultra)
import * as THREE from 'three';
import type { QualityLevel, Vec3, Vehicle, VehicleState, ViewApi } from '@/core/contracts';
import { Game } from '@/core/game';
import { getCore } from '@/core/context';
import { defaultSessionConfig } from '@/core/session';
import { CIVIL_COLORS, REFERENCE_DEFS, createSystems } from '@/render/vehicles/index';
import type { RenderLightsApi, VehiclesRenderApi } from '@/render/vehicles/index';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'alignement';
const quality = (params.get('qualite') ?? 'haut') as QualityLevel;
const night = params.get('nuit') === '1';
const far = params.get('loin') === '1';
const num = (k: string, d: number): number => { const v = params.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v); };
const DEG = Math.PI / 180;

// ── scène ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = quality !== 'bas';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const skyDay = new THREE.Color(0xb4c6d8), skyNight = new THREE.Color(0x070a12);
scene.background = night ? skyNight : skyDay;
scene.fog = new THREE.Fog(night ? 0x070a12 : 0xb4c6d8, 120, 700);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.15, 1200);
const world = new THREE.Group();
scene.add(world);
const sun = new THREE.DirectionalLight(night ? 0x8fa6d8 : 0xfff2e0, night ? 0.22 : 2.7);
sun.position.set(-14, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target, new THREE.HemisphereLight(night ? 0x35425f : 0xcfe0ff, night ? 0x1a1712 : 0x5a5448, night ? 1.0 : 1.05));
if (night) {
  // lueur chaude d'un candélabre : la nuit parisienne n'est jamais noire
  const lampPost = new THREE.PointLight(0xffc27a, 260, 60, 1.7);
  lampPost.position.set(9, 9, 9);
  scene.add(lampPost);
}

function setShadowArea(cx: number, cz: number, half: number): void {
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 160;
  c.updateProjectionMatrix();
  sun.position.set(cx - 22, 36, cz + 20);
  sun.target.position.set(cx, 0, cz);
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#74746d';
  g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 1500; i++) {
    const v = 98 + Math.floor(rnd() * 40);
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(40,40,40,0.4)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(600, 600);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// sol : asphalte quadrillé au mètre (échelle lisible)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);

// silhouette humaine de 1,80 m
const manMat = new THREE.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.8 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a47c, roughness: 0.8 });
function addHuman(x: number, z: number): void {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.86, 0.22), new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 }));
  legs.position.y = 0.43;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), manMat);
  torso.position.y = 1.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), skinMat);
  head.position.y = 1.685;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.13), manMat);
  armL.position.set(0.29, 1.14, 0);
  const armR = armL.clone();
  armR.position.x = -0.29;
  g.add(legs, torso, head, armL, armR);
  g.position.set(x, 0, z);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(g);
}

// ── moteur ────────────────────────────────────────────────────────────────────────────
const game = new Game({ headless: false, storage: null });
const ctx = game.ctx;
const viewApi: ViewApi = {
  renderer, scene, camera, world, quality, drawDistance: 900,
  get camX() { return camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return camera.position.z; },
  shake() { /* sans objet dans le banc d'essai */ }, setScreenEffect() { /* idem */ },
};
ctx.view = viewApi;
getCore(ctx).stores.vehicles.registerDefs(REFERENCE_DEFS);
ctx.settings.set('shadows', quality !== 'bas');

// service facultatif d'éclairage dynamique : quatre lumières ponctuelles réutilisées (éclairs sur les façades)
const pulseLights: THREE.PointLight[] = [];
let pulseUsed = 0;
if (params.get('eclairs') !== '0') {
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0x1e5bff, 0, 30, 1.6); pulseLights.push(l); scene.add(l); }
  const lights: RenderLightsApi = {
    pulse(x, y, z, color, intensity, radius) {
      if (pulseUsed >= pulseLights.length) return;
      const l = pulseLights[pulseUsed++]!;
      l.position.set(x, y, z); l.color.setHex(color); l.intensity = intensity; l.distance = radius;
    },
  };
  ctx.provide('render.lights', lights);
}

game.addModule(createSystems);
await game.boot();
await ctx.session.start(defaultSessionConfig({ timeOfDay: night ? 23 : 14, x: 0, z: 0 }));
ctx.env.setTime(night ? 23 : 14);
const api = ctx.require<VehiclesRenderApi>('vehiclesRender');

const KINDS = REFERENCE_DEFS.map((d) => d.kind as string);
const labels: { el: HTMLDivElement; x: number; y: number; z: number }[] = [];
const labelHost = document.getElementById('labels')!;
function addLabel(text: string, x: number, y: number, z: number): void {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  labelHost.appendChild(el);
  labels.push({ el, x, y, z });
}

function applyState(v: Vehicle, state: string): void {
  if (state === 'damaged') { v.state = 'damaged'; v.health = 28; }
  else if (state === 'wrecked') { v.state = 'wrecked'; v.health = 0; }
  else if (state === 'burning') { v.state = 'burning'; v.health = 10; v.burning = 1; }
  else if (state === 'burnt') { v.state = 'burnt'; v.health = 0; v.burning = 0; }
}

function spawn(kind: string, x: number, z: number, heading: number, color?: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, heading, color === undefined ? undefined : { color });
  v.engineOn = true;
  if (night) { v.headlights = true; v.beacons = v.def.hasBeacons; }
  if (params.get('gyro') === '1') v.beacons = v.def.hasBeacons;
  if (params.get('phares') === '1') v.headlights = true;
  const etat = params.get('etat');
  if (etat) applyState(v, etat);
  if (v.def.flying && params.get('vol') !== '0' && view !== 'fiche') v.y = v.kind === 'drone' ? 1.2 : 0;
  return v;
}

let frameHook: ((dt: number, t: number) => void) | null = null;
let target = new THREE.Vector3(0, 1, 0);
let multiView: { v: Vehicle } | null = null;

// ── vues ──────────────────────────────────────────────────────────────────────────────
function camPreset(name: string, cx: number, cz: number, span: number, height: number, halfX = 0, halfZ = 0): void {
  const k = far ? 9 : 1;
  camera.fov = (multiView ? 34 : 40) / k;
  camera.updateProjectionMatrix();
  const t = Math.tan(((multiView ? 34 : 40) * DEG) / 2);
  // cadrage : l'étendue horizontale `span` et la hauteur doivent tenir dans le champ ; la distance est comptée
  // depuis la face la plus proche de l'objet (halfX, halfZ = demi-encombrement vers la caméra)
  const d = Math.max(span / 2 / (t * camera.aspect), (height * 1.2) / 2 / t) * 1.1 + 0.6;
  target = new THREE.Vector3(cx, height * 0.5, cz);
  if (name === 'face') camera.position.set(cx, height * 0.5, cz + (halfZ + d) * k);
  else if (name === 'profil') camera.position.set(cx + (halfX + d) * k, height * 0.5, cz);
  else if (name === 'dessus') { camera.position.set(cx, (height + d) * k, cz + 0.01); target.y = 0; }
  else {
    const dd = d + Math.max(halfX, halfZ) * 0.9;
    target.y = height * 0.42;
    if (name === 'arriere') camera.position.set(cx - dd * 0.6 * k, height * 0.7 + dd * 0.32 * k, cz - dd * 0.8 * k);
    else camera.position.set(cx + dd * 0.66 * k, height * 0.7 + dd * 0.32 * k, cz + dd * 0.76 * k);
  }
  camera.lookAt(target);
}

if (view === 'alignement') {
  // pages de véhicules de gabarits proches, pour que chacun reste lisible
  const PAGES: string[][] = [
    ['fourgon_crs', 'vl_commandement', 'fourgon_cellulaire', 'voiture_police'],
    ['centaure', 'canon_eau', 'car_crs'],
    ['camion_pompiers', 'ambulance', 'camion_sono', 'moto_bravm'],
    ['voiture', 'citadine', 'suv', 'taxi', 'utilitaire', 'scooter'],
    ['camion', 'bus', 'helicoptere', 'drone'],
  ];
  const page = Math.max(1, Math.min(PAGES.length, num('page', 1)));
  const kinds = params.get('kinds') ? params.get('kinds')!.split(',') : PAGES[page - 1]!;
  const cam = params.get('cam') ?? 'trois-quarts';
  // rangés côte à côte le long de x, tous tournés vers +z (la caméra « face » les voit de face)
  let x = 0;
  const xs: number[] = [];
  let maxLen = 0, maxH = 0;
  for (const k of kinds) {
    const def = ctx.vehicles.def(k)!;
    const w = def.kind === 'helicoptere' ? 10.6 : Math.max(def.width, 1.0);
    x += w / 2;
    xs.push(x);
    x += w / 2 + 1.9;
    maxLen = Math.max(maxLen, def.length);
    maxH = Math.max(maxH, def.height);
  }
  const total = x - 1.9;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]!;
    const def = ctx.vehicles.def(k)!;
    const v = spawn(k, xs[i]! - total / 2, 0, 0);
    v.steerAngle = num('braq', 0) * DEG;
    addHuman(xs[i]! - total / 2 + Math.max(def.width, 1) / 2 + 0.7, -def.length / 2 + 0.9);
    addLabel(`${def.name} — ${def.length} × ${def.width} × ${def.height} m`, v.x, -0.05, def.length / 2 + 1.2);
  }
  if (night) {
    // façade claire derrière l'alignement : les éclairs bleus doivent s'y voir
    const wall = new THREE.Mesh(new THREE.BoxGeometry(total + 30, 14, 1), new THREE.MeshStandardMaterial({ color: 0xcfc3a5, roughness: 0.9 }));
    wall.position.set(0, 7, -maxLen / 2 - 5);
    wall.receiveShadow = true;
    world.add(wall);
  }
  setShadowArea(0, 0, Math.max(total, maxLen) / 2 + 4);
  const span = cam === 'profil' ? maxLen + 2 : cam === 'dessus' ? Math.max(total, maxLen * 1.8) : total + 2;
  camPreset(cam, 0, 0, span, maxH, cam === 'profil' ? total / 2 : 0, maxLen / 2);
} else if (view === 'fiche' || view === 'etats') {
  const kind = params.get('kind') ?? 'fourgon_crs';
  const def = ctx.vehicles.def(kind)!;
  if (view === 'fiche') {
    const v = spawn(kind, 0, 0, 0);
    v.steerAngle = num('braq', 0) * DEG;
    for (let i = 0; i < v.turretYaw.length; i++) { v.turretYaw[i] = num('gis', 0) * DEG * (i === 1 ? -1 : 1); v.turretPitch[i] = num('site', 0) * DEG; }
    if (params.get('portes') === '1') for (let d = 0; d < 4; d++) api.setDoor(v.id, d, true);
    if (params.get('clig')) v.indicator = params.get('clig') === 'g' ? -1 : 1;
    if (params.get('frein') === '1') v.braking = true;
    v.speed = num('vitesse', 0) / 3.6;
    addHuman(-def.width / 2 - 0.75, -def.length / 2 + 0.6);
    setShadowArea(0, 0, Math.max(def.length, 8) / 2 + 3);
    multiView = { v };
    if (night) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1), new THREE.MeshStandardMaterial({ color: 0xcfc3a5, roughness: 0.9 }));
      wall.position.set(0, 7, -def.length / 2 - 5);
      world.add(wall);
    }
  } else {
    const states: [string, string][] = [['ok', 'Intact'], ['damaged', 'Endommagé'], ['wrecked', 'Épave'], ['burning', 'En feu'], ['burnt', 'Calciné']];
    const step = Math.max(def.width, 1) + 2.2;
    for (let i = 0; i < states.length; i++) {
      const x = (i - (states.length - 1) / 2) * step;
      const v = spawn(kind, x, 0, 0.5);
      applyState(v, states[i]![0]);
      addLabel(states[i]![1], x, -0.05, def.length / 2 + 1.2);
    }
    setShadowArea(0, 0, step * 3);
    camPreset(params.get('cam') ?? 'trois-quarts', 0, 0, step * states.length, def.height);
  }
} else if (view === 'interieur' || view === 'tourelle') {
  const kind = params.get('kind') ?? (view === 'tourelle' ? 'centaure' : 'fourgon_crs');
  const v = spawn(kind, 0, 0, Math.PI);       // tourné vers −z, le long d'une « rue »
  const def = v.def;
  v.steerAngle = num('braq', 0) * DEG;
  v.speed = num('vitesse', 0) / 3.6;
  v.rpm = num('regime', 0);
  if (params.get('sirene') === '1') v.siren = 1;
  if (params.get('gyro') === '1') v.beacons = true;
  if (params.get('clig')) v.indicator = params.get('clig') === 'g' ? -1 : 1;
  if (params.get('frein') === '1') v.cmd.handbrake = true;
  // décor : chaussée, immeubles, véhicules et passants devant
  for (let i = 0; i < 12; i++) {
    for (const side of [-1, 1]) {
      const h = 16 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe2d7be : 0xcfc3a5, roughness: 0.9 }));
      b.position.set(side * 17, h / 2, -10 - i * 17);
      b.receiveShadow = true;
      world.add(b);
    }
  }
  spawn('voiture', -3.4, -16, Math.PI, 0x6f1d22);
  spawn('fourgon_crs', 3.6, -24, 0);
  spawn('bus', -3.6, -42, Math.PI);
  for (let i = 0; i < 6; i++) addHuman(-7 + i * 0.9, -12 - i * 2.5);
  setShadowArea(0, -20, 40);
  const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
  const eye: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
  if (view === 'interieur') {
    ctx.vehicles.enter(p, v, 'driver');
    ctx.player.possess(p.id);
    ctx.player.setCameraMode('vehicle_int');
    camera.fov = num('fov', 72);
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    frameHook = () => {
      api.seatEye(v, p.seat, eye);
      camera.position.set(eye.x, eye.y, eye.z);
      const yaw = v.heading + num('regard', 0) * -DEG, pitch = num('hausse', -6) * DEG;
      camera.lookAt(eye.x + Math.sin(yaw) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z + Math.cos(yaw) * Math.cos(pitch));
    };
  } else {
    const ok = ctx.vehicles.enter(p, v, 'gunner') || ctx.vehicles.enter(p, v);
    if (!ok) console.error('[banc] impossible de monter dans ' + kind);
    ctx.player.possess(p.id);
    ctx.player.setCameraMode('turret');
    for (let i = 0; i < v.turretYaw.length; i++) { v.turretYaw[i] = num('gis', 20) * DEG; v.turretPitch[i] = num('site', 12) * DEG; }
    camera.fov = 38;
    camera.updateProjectionMatrix();
    frameHook = () => {
      if (!api.turretMuzzle(v, 0, eye, dir)) return;
      camera.position.set(eye.x - dir.x * 0.2, eye.y + 0.45, eye.z - dir.z * 0.2);
      camera.lookAt(eye.x + dir.x * 30, eye.y + 0.45 + dir.y * 30, eye.z + dir.z * 30);
    };
  }
  addLabel(def.name, 0, -100, 0);
} else if (view === 'parc') {
  // 150 véhicules civils : files de circulation (une partie roule) et stationnement
  const n = num('n', 150);
  const mix: [string, number][] = [['voiture', 0.33], ['citadine', 0.23], ['suv', 0.17], ['taxi', 0.07], ['utilitaire', 0.1], ['camion', 0.033], ['bus', 0.033], ['scooter', 0.034]];
  const picks: string[] = [];
  for (const [k, share] of mix) for (let i = 0; i < Math.round(n * share); i++) picks.push(k);
  while (picks.length < n) picks.push('voiture');
  picks.length = n;
  // mélange déterministe
  let s = 4242;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = picks[i]!; picks[i] = picks[j]!; picks[j] = t; }
  const lanes = 6, laneW = 3.6;
  const cursor = new Array<number>(lanes).fill(-140);
  const moving: Vehicle[] = [];
  for (let i = 0; i < n; i++) {
    const lane = i % lanes;
    const k = picks[i]!;
    const def = ctx.vehicles.def(k)!;
    const dirSign = lane < lanes / 2 ? 1 : -1;
    const z = cursor[lane]! + def.length / 2;
    cursor[lane] = z + def.length / 2 + 2 + rnd() * 5;
    const color = k === 'bus' ? 0x3fa78a : k === 'taxi' ? (rnd() < 0.5 ? 0x1c1d20 : 0x4a4f57) : CIVIL_COLORS[Math.floor(rnd() * CIVIL_COLORS.length)]!;
    const v = spawn(k, (lane - (lanes - 1) / 2) * laneW, z, dirSign > 0 ? 0 : Math.PI, color);
    const edge = lane === 0 || lane === lanes - 1;
    if (!edge) { v.speed = 5 + rnd() * 4; moving.push(v); }
    if (rnd() < 0.2) v.braking = true;
    if (rnd() < 0.15) v.indicator = rnd() < 0.5 ? -1 : 1;
    if (rnd() < 0.3 || night) v.headlights = true;
  }
  const lenTotal = 300;
  frameHook = (dt) => {
    for (const v of moving) {
      const f = Math.cos(v.heading);
      v.z += f * v.speed * dt;
      if (v.z > lenTotal / 2) v.z -= lenTotal; else if (v.z < -lenTotal / 2) v.z += lenTotal;
      v.steerAngle = Math.sin(clockT * 0.7 + v.id) * 0.06;
    }
  };
  setShadowArea(0, 0, 60);
  const cam = params.get('cam') ?? 'haut';
  if (cam === 'sol') { camera.position.set(1.8, 1.7, -8); target = new THREE.Vector3(0, 1.2, 40); }
  else { camera.position.set(34, 30, -52); target = new THREE.Vector3(0, 0, 8); }
  camera.lookAt(target);
}

// ── boucle ────────────────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')!;
const info: Record<string, unknown> = {};
(window as unknown as { __info: unknown }).__info = info;
let last = performance.now();
let frames = 0;
let clockT = 0;
const fixedDt = num('pas', 0);
const cpu: number[] = [];
const proj = new THREE.Vector3();
const VIEWS: [string, number, number][] = [['face', 0, 0.5], ['profil', 0.5, 0.5], ['trois-quarts', 0, 0], ['dessus', 0.5, 0]];

function renderMulti(v: Vehicle): void {
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const def = v.def;
  renderer.setScissorTest(true);
  renderer.autoClear = true;
  const rotor = def.kind === 'helicoptere';
  for (const [name, fx, fy] of VIEWS) {
    const vx = Math.floor(fx * W), vy = Math.floor(fy * H), vw = Math.floor(W / 2), vh = Math.floor(H / 2);
    renderer.setViewport(vx, vy, vw, vh);
    renderer.setScissor(vx, vy, vw, vh);
    camera.aspect = vw / vh;
    const side = def.width + 2.4;
    const span = name === 'face' ? side : name === 'profil' ? def.length + 0.6 : name === 'dessus' ? Math.max(side, def.length * camera.aspect * 1.05) : Math.max(def.length * 0.8, side) * 1.0;
    camPreset(name === 'trois-quarts' && params.get('arriere') === '1' ? 'arriere' : name, 0, 0, span * (rotor && name !== 'profil' ? 2.2 : 1), def.height + (rotor ? 0.4 : 0.25), def.width / 2, def.length / 2);
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
}

function loop(): void {
  // les tests figent la page avant la capture (le WebGL logiciel est lent : on ne rend pas pendant la capture)
  if ((window as unknown as { __pause?: boolean }).__pause) { requestAnimationFrame(loop); return; }
  const nowMs = performance.now();
  const dt = fixedDt > 0 ? fixedDt : Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  clockT += dt;
  if (frameHook) frameHook(dt, clockT);
  pulseUsed = 0;
  for (const l of pulseLights) l.intensity = 0;
  camera.updateMatrixWorld();
  game.frame(dt);
  cpu.push(api.stats.cpuMs);
  if (cpu.length > 240) cpu.shift();
  renderer.info.reset();
  renderer.info.autoReset = false;
  // la carte d'ombres n'est calculée qu'une fois par image, même quand la scène est rendue sous quatre angles
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  if (multiView) renderMulti(multiView.v);
  else renderer.render(scene, camera);
  frames++;
  // étiquettes
  if (!multiView) {
    for (const l of labels) {
      proj.set(l.x, l.y, l.z).project(camera);
      const vis = proj.z < 1 && proj.z > -1;
      l.el.style.display = vis ? 'block' : 'none';
      l.el.style.left = `${(proj.x * 0.5 + 0.5) * window.innerWidth}px`;
      l.el.style.top = `${(-proj.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  } else {
    for (const l of labels) l.el.style.display = 'none';
  }
  const s = api.stats;
  const sorted = cpu.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  info.frames = frames; info.calls = renderer.info.render.calls; info.triangles = renderer.info.render.triangles;
  info.moduleCalls = s.drawCalls; info.moduleTriangles = s.triangles; info.near = s.near; info.far = s.far; info.hidden = s.hidden;
  info.fx = s.fx; info.models = s.models; info.cpuMedian = med; info.cpuMax = sorted[sorted.length - 1] ?? 0; info.cpuMin = sorted[0] ?? 0;
  info.vehicles = ctx.vehicles.list.length; info.pulses = pulseUsed;
  if (frames % 5 === 0) {
    hud.textContent = `vue : ${view}${night ? ' (nuit)' : ''}${far ? ' (modèles lointains)' : ''} — qualité ${quality}\n`
      + `véhicules : ${ctx.vehicles.list.length} (${s.near} détaillés, ${s.far} lointains, ${s.hidden} masqués)\n`
      + `module : ${s.drawCalls} appels de dessin, ${s.triangles.toLocaleString('fr-FR')} triangles, ${s.fx} quads lumineux\n`
      + `scène entière : ${renderer.info.render.calls} appels, ${renderer.info.render.triangles.toLocaleString('fr-FR')} triangles\n`
      + `CPU du module : ${med.toFixed(2)} ms/image (médiane)`;
  }
  (window as unknown as { __frames: number }).__frames = frames;
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
(window as unknown as { __ready: boolean }).__ready = true;
(window as unknown as { __kinds: string[] }).__kinds = KINDS;
requestAnimationFrame(loop);
