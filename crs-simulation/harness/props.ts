// Banc d'essai du rendu du mobilier urbain, des vitrines et des barricades. Le module est branché comme dans le
// jeu (Game → provide → init → frame) ; les objets et vitrines sont créés dans le magasin du cœur, et un service
// 'props.ext' minimal (vitrages restants, rideau forcé, boutique calcinée, composition des barricades) remplace
// la simulation du décor.
// Vues (paramètre d'URL `view`) :
//   planche    : tous les objets dans tous leurs états, avec une silhouette de 1,80 m (&page=1..6)
//   devantures : une façade de commerces dans tous les états (&page=1..3, ou &cam=large)
//   rue        : rue commerçante d'essai (&cam=trottoir|haut|carrefour)
//   barricade  : une barricade avant, pendant et après le feu
//   masse      : 3 000 objets et 400 devantures pour les mesures (&n=3000 ; &mesure=300 ; &cam=sol)
//   atlas      : l'atlas de textures
//   jeu        : contrôle d'intégration — vrai rendu de base, vraie simulation du décor, quartier d'essai
// Options communes : &nuit=1, &qualite=bas|moyen|haut|ultra, &pas=0.033 (pas fixe), &lumieres=0 (sans 'render.lights').
import * as THREE from 'three';
import type { Prop, QualityLevel, Shop, ViewApi } from '@/core/contracts';
import { Game } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';
import { createSystems, kindInfo } from '@/render/props/index';
import type { PropsRenderApi } from '@/render/props/index';
import type { LightLike, LightsLike, PropsExtLike } from '@/render/props/api';
import { synthParts } from '@/render/props/placement';
import type { PartLike } from '@/render/props/placement';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'planche';
const quality = (params.get('qualite') ?? 'haut') as QualityLevel;
const night = params.get('nuit') === '1';
const num = (k: string, d: number): number => { const v = params.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v); };
const W = window as unknown as Record<string, unknown>;
const hudEl = document.getElementById('hud')!;

if (view === 'jeu') await runIntegrated();
else await runStandalone();

/** Contrôle d'intégration : rendu de base, monde d'essai et simulation du décor réels, chargés à la demande. */
async function runIntegrated(): Promise<void> {
  const [base, world, sim] = await Promise.all([import('@/render/base/index'), import('@/world/query/index'), import('@/sim/props/index')]);
  const host = document.createElement('div');
  host.id = 'game';
  host.style.cssText = 'position:fixed;inset:0';
  document.body.insertBefore(host, document.body.firstChild);
  const game = new Game({ headless: false, storage: null });
  const ctx = game.ctx;
  ctx.settings.set('quality', quality);
  game.addModule(base.createSystems);
  game.addModule(world.createSystems);
  game.addModule(sim.createSystems);
  game.addModule(createSystems);
  await game.boot();
  await ctx.session.start(defaultSessionConfig({ mode: 'test', timeOfDay: night ? 23 : 15, x: num('x', 0), z: num('z', 0) }));
  ctx.env.setTime(night ? 23 : 15);
  const v3d = ctx.view;
  if (!v3d) throw new Error('[banc] le rendu de base n\'a pas fourni ctx.view');
  const api = ctx.require<PropsRenderApi>('propsRender');
  const ext = ctx.service<{ flushTiles(): void; stats: { props: number; shops: number } }>('props.ext');
  ext?.flushTiles();
  // &boutique=n : se placer devant la n-ième vitrine du quartier d'essai (à 9 m, face à elle, de biais)
  let px = num('x', 0), pz = num('z', 0), ph = num('cap', 0) * Math.PI / 180;
  const target = ctx.props.shops[num('boutique', -1)];
  if (target) {
    const a = target.heading + num('biais', 25) * Math.PI / 180;
    px = target.x + Math.sin(a) * num('recul', 9);
    pz = target.z + Math.cos(a) * num('recul', 9);
    ph = Math.atan2(target.x - px, target.z - pz);
  }
  const p = ctx.people.spawn({ kind: 'crs', x: px, z: pz, heading: ph });
  ctx.player.possess(p.id);
  ctx.player.state.camYaw = p.heading;
  ctx.world.setFocus(px, pz);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x4a4b4d, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.02;
  v3d.world.add(road);
  const info: Record<string, unknown> = {};
  W.__info = info;
  let frames = 0;
  const fixed = num('pas', 0);
  let last = performance.now();
  const loop = (): void => {
    if (W.__pause) { requestAnimationFrame(loop); return; }
    const now = performance.now();
    const dt = fixed > 0 ? fixed : Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    frames++;
    const st = api.stats;
    Object.assign(info, { frames, ...st, calls: v3d.renderer.info.render.calls, simProps: ctx.props.list.length, simShops: ctx.props.shops.length });
    if (frames % 5 === 0) {
      hudEl.textContent = `vue : jeu intégré${night ? ' — nuit' : ''}\nobjets ${st.props}, vitrines ${st.shops}, morceaux ${st.builtChunks}/${st.chunks}\n`
        + `module : ${st.drawCalls} appels (+${st.shadowCalls} ombre), ${st.triangles.toLocaleString('fr-FR')} triangles — scène : ${v3d.renderer.info.render.calls} appels\n`
        + `CPU : ${st.cpuMsAvg.toFixed(2)} ms/image (max ${st.cpuMsMax.toFixed(1)})`;
    }
    W.__frames = frames;
    requestAnimationFrame(loop);
  };
  W.__ready = true;
  requestAnimationFrame(loop);
}

async function runStandalone(): Promise<void> {
// ── scène ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'bas', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = quality !== 'bas';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 1.55 : 1.0;
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const scene = new THREE.Scene();
const skyColor = night ? 0x070a12 : 0xb4c6d8;
scene.background = new THREE.Color(skyColor);
scene.fog = new THREE.FogExp2(skyColor, night ? 0.0022 : 0.0012);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.15, 1500);
const world = new THREE.Group();
scene.add(world);
const sun = new THREE.DirectionalLight(night ? 0x8fa6d8 : 0xfff2e0, night ? 0.16 : 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target, new THREE.HemisphereLight(night ? 0x2c3852 : 0xcfe0ff, night ? 0x15130f : 0x5a5448, night ? 0.5 : 1.05));

function setShadowArea(cx: number, cz: number, half: number): void {
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 200;
  c.updateProjectionMatrix();
  sun.position.set(cx + 22, 44, cz + 30);
  sun.target.position.set(cx, 0, cz);
}

function canvasTexture(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void, repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  paint(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let seedState = 12345;
const rnd = (): number => { seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0; return seedState / 4294967296; };

// sol : asphalte quadrillé au mètre (échelle lisible)
const asphalt = canvasTexture(256, (g, s) => {
  g.fillStyle = '#5c5c58'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1600; i++) { const v = 78 + Math.floor(rnd() * 36); g.fillStyle = `rgb(${v},${v},${v - 3})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
  g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
}, 1200);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);

const pavement = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.9 });
function addSidewalk(x: number, z: number, w: number, d: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), pavement);
  m.position.set(x, -0.068, z);   // affleure le sol : le mobilier est posé à y = 0
  m.receiveShadow = true;
  world.add(m);
}
const facadeTex = canvasTexture(512, (g, s) => {
  g.fillStyle = '#d9cfb6'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = c * 128 + 38, y = r * 128 + 22;
    g.fillStyle = '#efe9da'; g.fillRect(x - 6, y - 6, 64, 96);
    g.fillStyle = night ? (rnd() < 0.3 ? '#f0c878' : '#1c2230') : '#3a4658'; g.fillRect(x, y, 52, 84);
    g.fillStyle = '#16181b'; g.fillRect(x - 4, y + 60, 60, 4);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let r = 0; r < 4; r++) g.fillRect(0, r * 128 + 122, s, 4);
}, 1);
function addBuilding(x: number, z: number, w: number, d: number, h: number): void {
  const t = facadeTex.clone();
  t.repeat.set(Math.max(1, Math.round(Math.max(w, d) / 12)), Math.max(1, Math.round(h / 12)));
  t.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: night ? 0x000000 : 0x000000 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  b.position.set(x, h / 2, z);
  b.castShadow = true; b.receiveShadow = true;
  world.add(b);
}

// silhouette humaine de 1,80 m
const manMat = new THREE.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.8 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a47c, roughness: 0.8 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 });
function addHuman(x: number, z: number, heading = 0): void {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.86, 0.22), legMat);
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
  g.rotation.y = heading;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(g);
}

// ── moteur ────────────────────────────────────────────────────────────────────────────
const game = new Game({ headless: false, storage: null });
const ctx = game.ctx;
const viewApi: ViewApi = {
  renderer, scene, camera, world, quality, drawDistance: num('distance', 900),
  get camX() { return camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return camera.position.z; },
  shake() { /* sans objet dans le banc d'essai */ }, setScreenEffect() { /* idem */ },
};
ctx.view = viewApi;

// Service 'props.ext' minimal : ce que la simulation du décor sait de plus que le contrat.
const panesLeft = new Map<number, number>();
const shopExtra = new Map<number, { forced: boolean; burnt: boolean; tags: number; hasShutter: boolean }>();
const barricades = new Map<number, PartLike[]>();
const ext: PropsExtLike = {
  propView(p, out) {
    const o = out ?? { panesLeft: 0 };
    o.panesLeft = panesLeft.get(p.id) ?? kindInfo(String(p.kind)).panes;
    return o;
  },
  shopView(s, out) {
    const o = out ?? { hasShutter: true, forced: false, boards: 0, tags: 0, burnt: false };
    const e = shopExtra.get(s.id);
    o.hasShutter = e ? e.hasShutter : true;
    o.forced = e ? e.forced : false;
    o.burnt = e ? e.burnt : false;
    o.tags = e ? e.tags : 0;
    o.boards = s.window === 'boarded' ? 1 : 0;
    return o;
  },
  barricadeParts: (id) => barricades.get(id) ?? [],
};
if (params.get('ext') !== '0') ctx.provide('props.ext', ext);

// Service facultatif 'render.lights' : lumières virtuelles, dont les plus proches reçoivent une vraie lumière.
const virtualLights: (LightLike & { alive: boolean })[] = [];
const realLights: THREE.PointLight[] = [];
if (params.get('lumieres') !== '0') {
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 26, 1.8); realLights.push(l); scene.add(l); }
  const lights: LightsLike = {
    point(init) {
      const l = { x: 0, y: 0, z: 0, color: 0xffffff, intensity: 0, range: 20, priority: 0, enabled: true, flicker: 0, alive: true,
        release() { l.alive = false; const i = virtualLights.indexOf(l); if (i >= 0) virtualLights.splice(i, 1); }, ...init };
      virtualLights.push(l);
      return l;
    },
  };
  ctx.provide('render.lights', lights);
}
let lightsLit = 0;
let clock = 0;
function applyLights(): void {
  const on = virtualLights.filter((l) => l.enabled && l.intensity > 0);
  const d2 = (l: LightLike): number => (l.x - camera.position.x) ** 2 + (l.z - camera.position.z) ** 2 - l.priority * 400;
  on.sort((a, b) => d2(a) - d2(b));
  lightsLit = Math.min(on.length, realLights.length);
  for (let i = 0; i < realLights.length; i++) {
    const r = realLights[i]!, l = on[i];
    if (!l) { r.intensity = 0; continue; }
    r.position.set(l.x, l.y, l.z);
    r.color.setHex(l.color);
    r.distance = l.range;
    r.intensity = l.intensity * (l.flicker > 0 ? 1 - l.flicker * 0.35 * (0.5 + 0.5 * Math.sin(clock * 13 + i * 2.1)) : 1);
  }
}

game.addModule(createSystems);
await game.boot();
await ctx.session.start(defaultSessionConfig({ timeOfDay: night ? 22.5 : 14, x: 0, z: 0 }));
ctx.env.setTime(night ? 22.5 : 14);
const api = ctx.require<PropsRenderApi>('propsRender');

// ── aides de mise en scène ───────────────────────────────────────────────────────────────
const labels: { el: HTMLDivElement; x: number; y: number; z: number }[] = [];
const labelHost = document.getElementById('labels')!;
function addLabel(text: string, x: number, y: number, z: number, cls = ''): void {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.textContent = text;
  labelHost.appendChild(el);
  labels.push({ el, x, y, z });
}
const projV = new THREE.Vector3();
function placeLabels(): void {
  for (const l of labels) {
    projV.set(l.x, l.y, l.z).project(camera);
    const vis = projV.z < 1 && projV.z > -1;
    l.el.style.display = vis ? '' : 'none';
    l.el.style.left = `${(projV.x * 0.5 + 0.5) * window.innerWidth}px`;
    l.el.style.top = `${(-projV.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

/** Crée un objet du décor avec le gabarit de la simulation (le magasin du cœur ne connaît pas tous les types). */
function spawn(kind: string, x: number, z: number, heading = 0): Prop {
  const p = ctx.props.spawn(kind, x, z, heading);
  const info = kindInfo(kind);
  if (kind !== 'barricade') { p.halfX = info.hx; p.halfZ = info.hz; p.height = info.h; }
  p.y = 0;
  return p;
}
/** Renverse un objet comme le fait la simulation : la hauteur du gabarit passe sur un côté de l'emprise. */
function topple(p: Prop): boolean {
  const info = kindInfo(String(p.kind));
  if (info.topple === 'none') return false;
  p.toppled = true;
  if (info.hx >= info.hz) { p.halfZ = info.h / 2; p.height = Math.max(0.15, 2 * info.hz); }
  else { p.halfX = info.h / 2; p.height = Math.max(0.15, 2 * info.hx); }
  return true;
}
function burnt(p: Prop): void {
  const info = kindInfo(String(p.kind));
  p.state = 'burnt';
  p.height = Math.max(0.1, p.height * info.burntHeight);
}
function shop(category: string, name: string, x: number, z: number, heading: number, width: number): Shop {
  const s = ctx.props.addShop({ category, x, z, heading, width, name });
  s.y = 0;
  return s;
}
function setCam(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 40): void {
  camera.fov = fov;
  camera.position.set(px, py, pz);
  camera.lookAt(tx, ty, tz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

const STATES = ['intact', 'endommagé', 'cassé', 'renversé', 'en feu', 'calciné', 'tagué', 'porté'];
const PAGES: { kinds: string[]; pitch: number; row: number }[] = [
  { kinds: ['poubelle', 'conteneur', 'barriere_vauban', 'palette', 'velo', 'trottinette'], pitch: 3.0, row: 3.0 },
  { kinds: ['table_terrasse', 'chaise', 'cone', 'debris', 'pile_paves', 'potelet', 'bouche_incendie', 'arceau_velo'], pitch: 2.0, row: 2.0 },
  { kinds: ['banc', 'barriere_chantier', 'distributeur', 'boite_aux_lettres', 'horodateur', 'armoire_technique', 'jardiniere'], pitch: 4.2, row: 3.0 },
  { kinds: ['abribus', 'panneau_pub', 'kiosque', 'colonne_morris', 'sanisette', 'colonne_verre'], pitch: 5.6, row: 5.0 },
  { kinds: ['candelabre', 'feu_tricolore', 'fontaine_wallace', 'horloge', 'camera', 'mat_drapeau', 'statue', 'panneau'], pitch: 3.4, row: 4.6 },
  { kinds: ['echafaudage', 'station_velo', 'autre', 'objet_inconnu'], pitch: 10, row: 5.5 },
];

function buildBoard(page: number): void {
  const def = PAGES[Math.max(0, Math.min(PAGES.length - 1, page - 1))]!;
  const cols = def.kinds[0] === 'echafaudage' ? 4 : STATES.length;
  const wTot = (cols - 1) * def.pitch, dTot = (def.kinds.length - 1) * def.row;
  for (let r = 0; r < def.kinds.length; r++) {
    const kind = def.kinds[r]!;
    const info = kindInfo(kind);
    const z = r * def.row - dTot / 2;
    addHuman(-wTot / 2 - def.pitch * 0.75, z);
    addLabel(kind, -wTot / 2 - def.pitch * 0.75, 2.3, z);
    for (let c = 0; c < cols; c++) {
      const x = c * def.pitch - wTot / 2;
      const state = STATES[c]!;
      if (state === 'renversé' && info.topple === 'none') continue;
      if (state === 'porté' && info.carry === 'non') continue;
      if (state === 'calciné' && info.burn === 'aucune' && kind !== 'barriere_vauban') continue;
      if (state === 'en feu' && info.burn === 'aucune') continue;
      const p = spawn(kind, x, z, kind === 'velo' || kind === 'trottinette' ? Math.PI / 2 : 0);
      if (state === 'endommagé') { p.state = 'damaged'; if (info.panes > 0) panesLeft.set(p.id, Math.max(0, info.panes - (info.panes > 2 ? 2 : 1))); }
      else if (state === 'cassé') { p.state = 'broken'; panesLeft.set(p.id, 0); if (info.topple !== 'none') topple(p); else p.toppled = true; }
      else if (state === 'renversé') topple(p);
      else if (state === 'en feu') { p.state = 'burning'; p.burning = 1; }
      else if (state === 'calciné') burnt(p);
      else if (state === 'tagué') p.tags = 2;
      else if (state === 'porté') { p.carriedBy = 1; addHuman(x, z - Math.min(info.hx, info.hz) - 0.55, 0); }
    }
  }
  for (let c = 0; c < cols; c++) addLabel(STATES[c]!, c * def.pitch - wTot / 2, 0, dTot / 2 + def.row * 0.6, 'col');
  const tall = def.kinds[0] === 'candelabre' || def.kinds[0] === 'echafaudage';
  const span = wTot + def.pitch * 2.4;
  setShadowArea(0, 0, Math.max(span, dTot + 8) * 0.62);
  const moitie = num('moitie', 0);
  const rang = num('rang', 0);
  if (rang > 0) {
    // gros plan : trois ou quatre états d'un seul type, à hauteur d'homme
    const r = Math.min(def.kinds.length, rang) - 1;
    const z = r * def.row - dTot / 2;
    const h = kindInfo(def.kinds[r]!).h;
    const xc = (num('col', 2) - 1) * def.pitch - wTot / 2;
    // caméra au-dessus du rang suivant, pour qu'il ne masque rien
    setCam(xc + def.pitch * 0.2, h + 2.0 + def.row * 0.35, z + def.row * 0.95 + h * 0.5, xc, h * 0.4, z, 50);
  } else if (moitie > 0 && cols > 4) {
    // demi-planche : quatre états à la fois, deux fois plus gros
    const cx = (moitie === 1 ? 1.5 : 5.5) * def.pitch - wTot / 2 - (moitie === 1 ? def.pitch * 0.35 : 0);
    frame(cx, def.pitch * (moitie === 1 ? 4.9 : 4.2), dTot + def.row, tall ? 30 : 40, tall ? 3 : 0.4);
  } else {
    frame(-def.pitch * 0.35, span, dTot + def.row, tall ? 30 : 40, tall ? 3 : 0.4);
  }
}

/** Cadre un rectangle au sol (largeur × profondeur, centré en x = cx, z = 0) vu sous l'angle donné. */
function frame(cx: number, width: number, depth: number, elevationDeg: number, targetY: number): void {
  const th = elevationDeg * Math.PI / 180, fov = 44;
  const tv = Math.tan(fov * Math.PI / 360), thz = tv * (window.innerWidth / window.innerHeight);
  const d = Math.max(width / 2 / thz + (depth / 2) * Math.cos(th), (depth * Math.sin(th) + 3) / (2 * tv * 0.8));
  // visée un peu en avant du centre : les rangs proches, plus gros à l'écran, restent dans le cadre
  setCam(cx, targetY + d * Math.sin(th), d * Math.cos(th) + depth * 0.06, cx, targetY, depth * 0.06, fov);
}

const SHOP_DEMO: { cat: string; name: string; label: string; set?: (s: Shop) => void; tags?: number; forced?: boolean; burnt?: boolean }[] = [
  { cat: 'cafe_restaurant', name: 'Café des Tilleuls', label: 'intacte' },
  { cat: 'mode', name: 'Le Vestiaire du Passage', label: 'taguée', set: (s) => { s.window = 'tagged'; }, tags: 2 },
  { cat: 'banque', name: 'Banque du Méridien', label: 'fissurée', set: (s) => { s.window = 'cracked'; } },
  { cat: 'telephonie', name: 'Allô Garance Mobiles', label: 'brisée', set: (s) => { s.window = 'broken'; s.stock = 0.8; } },
  { cat: 'luxe', name: 'Maison Valcourt', label: 'panneaux de bois', set: (s) => { s.window = 'boarded'; }, tags: 1 },
  { cat: 'alimentation', name: 'Primeurs du Parvis', label: 'rideau à mi-course', set: (s) => { s.shutter = 0.5; } },
  { cat: 'bijouterie', name: 'Joaillerie Belrive', label: 'rideau baissé, tagué', set: (s) => { s.shutter = 1; s.window = 'tagged'; }, tags: 1 },
  { cat: 'tabac_presse', name: 'Tabac des Arcades', label: 'rideau forcé', set: (s) => { s.shutter = 0.3; s.window = 'broken'; s.stock = 0.5; }, forced: true },
  { cat: 'supermarche', name: 'Supermarché des Quais', label: 'pillée', set: (s) => { s.window = 'broken'; s.stock = 0; } },
  { cat: 'restauration_rapide', name: 'Le Comptoir Gourmand de la Halle', label: 'en feu', set: (s) => { s.window = 'broken'; s.burning = 0.9; s.stock = 0.4; } },
  { cat: 'agence', name: 'Agence du Belvédère', label: 'calcinée', set: (s) => { s.window = 'broken'; s.stock = 0; }, burnt: true },
  { cat: 'pharmacie', name: 'Pharmacie de la Fontaine', label: 'intacte (pharmacie)' },
  { cat: 'hotel', name: 'Hôtel de la Rotonde', label: 'intacte (hôtel)' },
  { cat: 'autre', name: 'Librairie des Deux Rives', label: 'intacte' },
  { cat: 'bijouterie', name: "L'Écrin du Vieux Pont", label: 'intacte (bijouterie)' },
];

function demoShop(i: number, x: number, z: number, heading: number, width: number): Shop {
  const d = SHOP_DEMO[i % SHOP_DEMO.length]!;
  const s = shop(d.cat, d.name, x, z, heading, width);
  if (d.set) d.set(s);
  shopExtra.set(s.id, { forced: !!d.forced, burnt: !!d.burnt, tags: d.tags ?? 0, hasShutter: true });
  return s;
}

function buildFronts(page: number): void {
  const n = SHOP_DEMO.length, wShop = 5.2, len = n * wShop;
  addBuilding(0, -5, len + 4, 10, 16);
  addSidewalk(0, 2.5, len + 10, 5);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + wShop * (i + 0.5);
    demoShop(i, x, 0.001, 0, wShop - 0.5);
    addLabel(SHOP_DEMO[i]!.label, x, 4.3, 0.3, 'col');
  }
  addHuman(-len / 2 + 1.2, 1.4);
  for (let i = 0; i < 5; i++) spawn('candelabre', -len / 2 + 6 + i * 16, 4.6, 0);
  setShadowArea(0, 2, 44);
  if (params.get('cam') === 'large') setCam(8, 9, 46, 0, 2.2, 0, 50);
  else {
    const per = 5, cx = -len / 2 + wShop * per * (page - 0.5);
    setCam(cx + 2, 2.6, 15.5, cx, 1.9, 0, 52);
  }
}

function buildStreet(): void {
  const L = 150, half = 7;   // chaussée de 14 m, trottoirs de 5 m
  addBuilding(-half - 5 - 6, -L / 2 + 8, 12, L, 19);
  addBuilding(half + 5 + 6, -L / 2 + 8, 12, L, 19);
  addBuilding(0, -L - 4, 60, 12, 19);
  addSidewalk(-half - 2.5, -L / 2 + 8, 5, L);
  addSidewalk(half + 2.5, -L / 2 + 8, 5, L);
  // devantures des deux côtés
  let k = 0;
  for (let z = 4; z > -L + 12; z -= 6.2) {
    demoShop(k, -half - 5 + 0.001, z, Math.PI / 2, 5.4);
    demoShop(k + 6, half + 5 - 0.001, z, -Math.PI / 2, 5.4);
    k++;
  }
  // mobilier : candélabres en quinconce, potelets, corbeilles, bancs, vélos, terrasse, abribus, kiosque…
  for (let z = 0; z > -L + 10; z -= 24) {
    spawn('candelabre', -half - 0.7, z, Math.PI / 2);
    spawn('candelabre', half + 0.7, z - 12, -Math.PI / 2);
    spawn('poubelle', -half - 0.9, z - 2.2, Math.PI / 2);
    spawn('banc', half + 1.6, z - 5, -Math.PI / 2);
  }
  for (let z = 6; z > -L + 10; z -= 3) { spawn('potelet', -half - 0.35, z, 0); spawn('potelet', half + 0.35, z, 0); }
  // terrasse du café (première devanture à gauche)
  for (let i = 0; i < 3; i++) {
    const tz = 5.5 - i * 1.6;
    spawn('table_terrasse', -half - 3.6, tz, 0);
    spawn('chaise', -half - 3.6, tz + 0.6, Math.PI);
    spawn('chaise', -half - 3.6, tz - 0.6, 0);
    spawn('chaise', -half - 2.95, tz, -Math.PI / 2);
  }
  spawn('abribus', half + 1.9, -9, -Math.PI / 2);
  spawn('panneau_pub', -half - 1.1, -14, Math.PI / 2);
  spawn('kiosque', half + 2.6, -30, -Math.PI / 2);
  spawn('colonne_morris', -half - 2.2, -27, 0);
  spawn('fontaine_wallace', -half - 2.4, -40, 0);
  spawn('station_velo', half + 1.3, -47, -Math.PI / 2);
  for (let i = 0; i < 5; i++) spawn('velo', half + 0.75, -49.6 + i * 0.75, -Math.PI / 2 + 0.05);
  spawn('trottinette', -half - 1.0, -6.5, 0.4);
  spawn('trottinette', -half - 1.3, -7.3, 2.1).tags = 0;
  spawn('conteneur', -half - 1.2, -19, Math.PI / 2);
  spawn('conteneur', -half - 1.2, -20.6, Math.PI / 2);
  spawn('boite_aux_lettres', half + 0.9, -18, -Math.PI / 2);
  spawn('horodateur', -half - 0.8, -33, Math.PI / 2);
  spawn('armoire_technique', half + 4.4, -21.5, -Math.PI / 2).tags = 2;
  spawn('distributeur', -half - 4.55, -10.2, Math.PI / 2);
  spawn('jardiniere', half + 1.2, -24, 0);
  spawn('sanisette', half + 2.4, -62, -Math.PI / 2);
  spawn('echafaudage', -half - 4.35, -52, Math.PI / 2);
  spawn('colonne_verre', -half - 1.6, -66, 0);
  spawn('horloge', half + 0.9, -38, 0);
  // carrefour au fond : feux, panneaux, barrières
  spawn('feu_tricolore', -half - 0.5, -74, 0);
  spawn('feu_tricolore', half + 0.5, -74, 0);
  spawn('feu_tricolore', -half - 0.5, -78, Math.PI / 2);
  spawn('panneau', half + 0.6, -70, 0);
  for (let i = 0; i < 4; i++) spawn('barriere_vauban', -3.9 + i * 2.6, -80, 0);
  // traces d'émeute au milieu : poubelle en feu, conteneur renversé, vélo calciné, débris, barrière couchée
  const fire = spawn('conteneur', -1.2, -34, 0.6); fire.state = 'burning'; fire.burning = 1;
  const over = spawn('conteneur', 1.6, -32.5, 1.9); topple(over);
  const b1 = spawn('velo', 2.6, -36, 0.8); topple(b1); burnt(b1);
  spawn('debris', 0.4, -30.6, 0.3);
  const vb = spawn('barriere_vauban', -3.2, -31, 0.4); topple(vb);
  const pb = spawn('poubelle', 3.4, -29.4, 0); topple(pb);
  spawn('pile_paves', -5.6, -37, 0.2);
  spawn('cone', -5.9, -35.2, 0);
  addHuman(-half - 1.9, 1.6, Math.PI);
  addHuman(3.2, -26, 0.4);
  setShadowArea(0, -40, 70);
  const cam = params.get('cam') ?? 'trottoir';
  if (cam === 'haut') setCam(1.5, 15, 16, -0.5, 1.5, -34, 46);
  else if (cam === 'carrefour') setCam(1.2, 2.2, -52, -1.2, 2.0, -78, 46);
  else if (cam === 'emeute') setCam(5.4, 2.1, -22.5, -0.6, 0.9, -33.5, 46);
  else if (cam === 'droite') setCam(half + 0.2, 1.7, 9, half + 4.0, 1.6, -30, 52);
  else setCam(-half - 0.6, 1.7, 10.5, -half - 4.2, 1.7, -30, 52);
}

function buildBarricades(): void {
  const names = ['avant le feu', 'en feu', 'calcinée'];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 9.5;
    const b = ctx.props.spawn('barricade', x, 0, 0);
    b.y = 0;
    b.halfX = 3.2; b.halfZ = 0.9; b.height = 1.35;
    barricades.set(b.id, synthParts(77, b.halfX, b.halfZ));
    if (i === 1) { b.state = 'burning'; b.burning = 1; }
    if (i === 2) { b.state = 'burnt'; b.height = 0.7; }
    addLabel(names[i]!, x, 2.6, 0);
    addHuman(x - 3.6, 1.7, Math.PI * 0.9);
  }
  // sans composition fournie par la simulation : barricade synthétique, au fond
  const far = ctx.props.spawn('barricade', 0, -12, 0.15);
  far.y = 0; far.halfX = 5; far.halfZ = 1.0; far.height = 1.4;
  addLabel('sans détail de la simulation (composition synthétique)', 0, 2.8, -12, 'col');
  setShadowArea(0, -3, 26);
  const cam = params.get('cam') ?? '';
  const k = cam === 'avant' ? -1 : cam === 'feu' ? 0 : cam === 'apres' ? 1 : 9;
  if (k !== 9) setCam(k * 9.5 + 3.2, 2.3, 6.4, k * 9.5, 0.6, 0, 46);
  else setCam(2.5, 6.5, 17.5, 0, 0.2, -2.5, 46);
}

const MASS_KINDS: [string, number][] = [
  ['potelet', 15], ['candelabre', 11], ['poubelle', 8], ['velo', 8], ['chaise', 8], ['banc', 6], ['barriere_vauban', 6],
  ['conteneur', 5], ['table_terrasse', 4], ['trottinette', 4], ['arceau_velo', 4], ['panneau', 4], ['feu_tricolore', 3],
  ['jardiniere', 2], ['abribus', 1.5], ['panneau_pub', 1.5], ['horodateur', 1.5], ['armoire_technique', 1.5], ['cone', 1.5],
  ['boite_aux_lettres', 1], ['kiosque', 0.6], ['colonne_morris', 0.6], ['palette', 1], ['barriere_chantier', 1], ['debris', 1],
  ['fontaine_wallace', 0.3], ['sanisette', 0.3], ['station_velo', 0.4], ['echafaudage', 0.3], ['colonne_verre', 0.4],
  ['statue', 0.2], ['horloge', 0.2], ['camera', 0.5], ['mat_drapeau', 0.3], ['bouche_incendie', 0.6], ['pile_paves', 0.4],
  ['distributeur', 0.5], ['barricade', 0.1],
];

const massProps: Prop[] = [];
const massShops: Shop[] = [];
function buildMass(n: number): void {
  let total = 0;
  for (const [, w] of MASS_KINDS) total += w;
  const size = 640, step = 80;   // quadrillage de rues tous les 80 m
  for (let i = 0; i < n; i++) {
    let r = rnd() * total, kind = 'potelet';
    for (const [k, w] of MASS_KINDS) { r -= w; if (r <= 0) { kind = k; break; } }
    const along = (rnd() - 0.5) * size;
    const street = Math.round(((rnd() - 0.5) * size) / step) * step + (rnd() < 0.5 ? -6.5 : 6.5) + (rnd() - 0.5) * 2;
    const ns = rnd() < 0.5;
    const p = spawn(kind, ns ? street : along, ns ? along : street, Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3);
    if (kind === 'barricade') { p.halfX = 3; p.halfZ = 0.9; p.height = 1.3; }
    const s = rnd();
    if (s < 0.02) { p.state = 'burning'; p.burning = 1; } else if (s < 0.05) burnt(p); else if (s < 0.09) topple(p); else if (s < 0.14) p.tags = 1;
    massProps.push(p);
  }
  const shops = Math.round(n * 0.14);
  for (let i = 0; i < shops; i++) {
    const ns = rnd() < 0.5;
    const side = rnd() < 0.5 ? -1 : 1;
    const street = Math.round(((rnd() - 0.5) * size) / step) * step + side * 9.5;
    const along = Math.round(((rnd() - 0.5) * size) / 6) * 6;
    const d = SHOP_DEMO[Math.floor(rnd() * SHOP_DEMO.length)]!;
    const s = shop(d.cat, d.name + ' ' + (i % 37), ns ? street : along, ns ? along : street, ns ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0), 4 + rnd() * 3);
    if (rnd() < 0.3 && d.set) { d.set(s); shopExtra.set(s.id, { forced: !!d.forced, burnt: !!d.burnt, tags: d.tags ?? 0, hasShutter: true }); }
    massShops.push(s);
  }
  setShadowArea(0, 0, 120);
  if (params.get('cam') === 'sol') setCam(6.5, 1.7, 30, 6.5, 1.6, -200, 55);
  else setCam(40, 70, 190, 0, 0, -20, 50);
}

// ── construction de la vue ─────────────────────────────────────────────────────────────
if (view === 'planche') buildBoard(num('page', 1));
else if (view === 'devantures') buildFronts(num('page', 1));
else if (view === 'rue') buildStreet();
else if (view === 'barricade') buildBarricades();
else if (view === 'masse') buildMass(num('n', 3000));
else if (view === 'atlas') setCam(0, 30, 0.01, 0, 0, 0, 40);

const info: Record<string, unknown> = {};
W.__info = info;
let frames = 0;
let last = performance.now();
const fixed = num('pas', 0);
const cpuLog: number[] = [];

function oneFrame(dt: number, render: boolean): void {
  clock += dt;
  game.frame(dt);
  if (render) {
    applyLights();
    renderer.render(scene, camera);
  }
  frames++;
}

if (view === 'atlas') {
  // l'atlas tel que peint, affiché en 2D par-dessus la scène
  game.frame(0.016);
  const eng = (api as unknown as { engine: { atlasCanvas: HTMLCanvasElement } | null }).engine;
  if (eng) {
    const c = eng.atlasCanvas;
    c.style.cssText = 'position:fixed;left:50%;top:50%;height:96vh;transform:translate(-50%,-50%);background:repeating-conic-gradient(#666 0 25%,#888 0 50%) 0 0/24px 24px';
    document.body.appendChild(c);
  }
  renderer.domElement.style.display = 'none';
  W.__frames = 99;
  W.__ready = true;
  return;
}

// mesure du coût CPU du module seul : N images sans rendu, puis une rafale de changements
const mesure = num('mesure', 0);
if (mesure > 0) {
  // mise en route : trois images rendues, puis deux secondes simulées (objets posés, modèles construits d'avance)
  for (let i = 0; i < 3; i++) oneFrame(1 / 60, true);
  for (let i = 0; i < 120; i++) oneFrame(1 / 60, false);
  oneFrame(1 / 60, true);
  oneFrame(1 / 60, true);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  oneFrame(1 / 60, false);
  const st0 = { ...api.stats };
  api.resetPeak();
  // l'horloge du navigateur est arrondie à 0,1 ms : on mesure des lots de 20 images
  const lot = 20, lots: number[] = [];
  const tAll = performance.now();
  for (let i = 0; i < mesure; i += lot) {
    const t = performance.now();
    for (let k = 0; k < lot; k++) oneFrame(1 / 60, false);
    lots.push((performance.now() - t) / lot);
  }
  const moyenne = (performance.now() - tAll) / (lots.length * lot);
  lots.sort((a, b) => a - b);
  // rafale : à chaque image 3 objets changent d'état, 2 se déplacent, un rideau descend
  const burst: number[] = [];
  const tBurst = performance.now();
  for (let k = 0; k < 40; k++) {
    const t = performance.now();
    for (let j = 0; j < 3; j++) { const p = massProps[Math.floor(rnd() * massProps.length)]; if (p) { p.state = j === 0 ? 'damaged' : j === 1 ? 'burning' : 'broken'; ctx.events.emit('prop:damaged', { id: p.id, state: p.state, byId: 0 }); } }
    for (let j = 0; j < 2; j++) { const p = massProps[Math.floor(rnd() * massProps.length)]; if (p && p.movable) { p.x += 0.4; p.heading += 0.2; ctx.events.emit('prop:moved', { id: p.id, byId: 0 }); } }
    const s = massShops[Math.floor(rnd() * massShops.length)];
    if (s) { s.shutter = Math.min(1, s.shutter + 0.25); ctx.events.emit('shop:shutter', { id: s.id, closed: s.shutter >= 1 }); }
    oneFrame(1 / 60, false);
    burst.push(performance.now() - t);
  }
  const rafaleMoyenne = (performance.now() - tBurst) / 40;
  burst.sort((a, b) => a - b);
  // caméra en mouvement à 18 km/h puis 108 km/h : reconstruction des morceaux qui changent de niveau
  const move: number[] = [];
  const tMove = performance.now();
  for (let k = 0; k < 240; k++) {
    const v = k < 120 ? 5 : 30;
    camera.position.x += v / 60 * 0.6; camera.position.z -= v / 60 * 0.8; camera.updateMatrixWorld();
    const t = performance.now();
    oneFrame(1 / 60, false);
    move.push(performance.now() - t);
  }
  const deplacementMoyenne = (performance.now() - tMove) / 240;
  move.sort((a, b) => a - b);
  oneFrame(1 / 60, true);
  const st = api.stats;
  W.__mesure = {
    objets: st.props, vitrines: st.shops, morceaux: st0.builtChunks, appelsScene: calls, trianglesScene: tris,
    appelsModule: st0.drawCalls, appelsOmbre: st0.shadowCalls, trianglesModule: st0.triangles, halos: st0.halos, modeles: st.models,
    moyenne, mediane: lots[lots.length >> 1], max: lots[lots.length - 1],
    rafaleMoyenne, rafaleMax: burst[burst.length - 1],
    deplacementMoyenne, deplacementP95: move[Math.floor(move.length * 0.95)], deplacementMax: move[move.length - 1],
    reconstructions: st.rebuilds, reecritures: st.rewrites, derniereReconstructionMs: st.rebuildMs, images: lots.length * lot,
  };
}

const loop = (): void => {
  if (W.__pause) { requestAnimationFrame(loop); return; }
  const now = performance.now();
  const dt = fixed > 0 ? fixed : Math.min(0.1, (now - last) / 1000);
  last = now;
  oneFrame(dt, true);
  placeLabels();
  const st = api.stats;
  cpuLog.push(st.cpuMs);
  if (cpuLog.length > 40) cpuLog.shift();
  const sorted = cpuLog.slice().sort((a, b) => a - b);
  Object.assign(info, {
    frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, moduleCalls: st.drawCalls, shadowCalls: st.shadowCalls,
    moduleTriangles: st.triangles, props: st.props, shops: st.shops, chunks: st.builtChunks, halos: st.halos, lights: st.lights, lightsLit,
    cpuMedian: sorted[sorted.length >> 1], cpuMax: st.cpuMsMax, rebuilds: st.rebuilds, rewrites: st.rewrites, models: st.models, signs: st.signs, dynamic: st.dynamic,
  });
  if (frames % 4 === 0) {
    hudEl.textContent = `vue : ${view}${night ? ' — nuit' : ''} — qualité ${quality}\n`
      + `objets ${st.props}, vitrines ${st.shops}, morceaux construits ${st.builtChunks}/${st.chunks}, halos ${st.halos}, vraies lumières ${st.lights}\n`
      + `module : ${st.drawCalls} appels de dessin (+${st.shadowCalls} en passe d'ombre), ${st.triangles.toLocaleString('fr-FR')} triangles — scène entière : ${renderer.info.render.calls} appels\n`
      + `CPU du module : médiane ${(sorted[sorted.length >> 1] ?? 0).toFixed(2)} ms/image (max ${st.cpuMsMax.toFixed(1)}) — ${st.rebuilds} reconstructions, ${st.rewrites} réécritures, ${st.models} modèles, ${st.signs} enseignes`;
  }
  W.__frames = frames;
  requestAnimationFrame(loop);
};
W.__api = api;
W.__ctx = ctx;
W.__ready = true;
requestAnimationFrame(loop);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
}
