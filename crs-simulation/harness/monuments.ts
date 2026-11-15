// Banc d'essai des monuments.
//   /harness/monuments.html?key=arc_triomphe            un monument, silhouette humaine de 1,8 m pour l'échelle
//   &quality=bas|moyen|haut|ultra   &night=1   &far=1   &angle=0..3   &shot=1 (masque l'interface)
//   ?demo=kit      vitrine des pièces du kit        ?demo=palais   buildPalaceFromFootprint sur des emprises d'essai
//   ?demo=systeme  le système complet (détail près de la caméra, silhouettes au loin, nuit, scintillement)
// API pour les tests : window.__ready, __setView(i), __setNight(b), __setFar(b), __stats(), __frames, __sys…
import * as THREE from 'three';
import type { GameContext, LandmarkInfo, QualityLevel } from '../src/core/contracts';
import { createSystems, getMonument, listMonuments, getColliders } from '../src/world/monuments';
import type { MonumentsApi } from '../src/world/monuments/api';
import type { MonumentDef, MonumentFrame } from '../src/world/monuments/types';
import { disposeObject, setNightLevel, statsOf, tickMaterials } from '../src/world/monuments/kit';
import { buildKitDemo, buildPalaceDemo } from '../src/world/monuments/demos';

const params = new URLSearchParams(location.search);
const quality = (params.get('quality') ?? 'haut') as QualityLevel;
const demo = params.get('demo');
if (params.get('shot')) document.body.classList.add('shot');
const hud = document.getElementById('hud')!;
const bar = document.getElementById('bar')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.3, 20000);
const world = new THREE.Group();
scene.add(world);

// ciel en dégradé (dôme), soleil, lumière ambiante
const skyGeo = new THREE.SphereGeometry(15000, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4f86c6) }, horizon: { value: new THREE.Color(0xc9dcec) } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }',
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a6458, 0.95);
scene.add(hemi);

// sol : dallage à quadrillage de 10 m pour juger l'échelle
function groundTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f8a80'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 10, 3 + Math.random() * 10); }
  g.strokeStyle = 'rgba(40,38,34,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(40,38,34,0.16)'; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(i * 51.2, 0); g.lineTo(i * 51.2, 512); g.moveTo(0, i * 51.2); g.lineTo(512, i * 51.2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const groundTex = groundTexture();
groundTex.repeat.set(400, 400);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/** Silhouette humaine de 1,8 m (repère d'échelle). */
function human(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xd8421c, roughness: 0.8 });
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number): void => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = true; g.add(k); };
  add(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), 0, 1.15, 0);
  add(new THREE.SphereGeometry(0.115, 12, 8), 0, 1.685, 0);
  add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), -0.1, 0.42, 0);
  add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), 0.1, 0.42, 0);
  add(new THREE.CapsuleGeometry(0.055, 0.55, 3, 8), -0.26, 1.12, 0);
  add(new THREE.CapsuleGeometry(0.055, 0.55, 3, 8), 0.26, 1.12, 0);
  return g;
}
const person = human();
scene.add(person);

// ───────────────────────────── état ─────────────────────────────
let subject: THREE.Object3D | null = null;
let subjectDef: MonumentDef | null = null;
let night = false, far = false, view = 0;
let box = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 20, 10));
let buildMs = 0;
let time = 0, frames = 0;
let sparkle = 0;
const orbit = { yaw: 0.6, pitch: 0.28, dist: 100, target: new THREE.Vector3(), manual: false };

function setNight(n: boolean): void {
  night = n;
  setNightLevel(n ? 1 : 0);
  if (n) {
    (skyMat.uniforms.top.value as THREE.Color).setHex(0x05070f); (skyMat.uniforms.horizon.value as THREE.Color).setHex(0x1a2030);
    sun.color.setHex(0x9fb4ff); sun.intensity = 0.22; hemi.intensity = 0.16; hemi.color.setHex(0x6f7fae); hemi.groundColor.setHex(0x2a241c);
  } else {
    (skyMat.uniforms.top.value as THREE.Color).setHex(0x4f86c6); (skyMat.uniforms.horizon.value as THREE.Color).setHex(0xc9dcec);
    sun.color.setHex(0xfff2dd); sun.intensity = 3.0; hemi.intensity = 0.95; hemi.color.setHex(0xcfe0ff); hemi.groundColor.setHex(0x6a6458);
  }
}

function fitShadow(): void {
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z) * 0.75 + 10;
  sun.position.set(c.x + r * 0.55, c.y + r * 1.0, c.z + r * 0.8);
  sun.target.position.copy(c);
  const cam = sun.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = r * 4;
  cam.updateProjectionMatrix();
}

/** Vues : 0 = trois quarts, 1 = élévation de face, 2 = piéton (hauteur d'œil 1,7 m), 3 = trois quarts arrière en plongée. */
function setView(i: number): void {
  view = i;
  orbit.manual = false;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const fov = (camera.fov * Math.PI) / 180;
  const fitH = (s.y * 0.5) / Math.tan(fov / 2), fitW = (Math.max(s.x, s.z) * 0.5) / (Math.tan(fov / 2) * camera.aspect);
  const dist = Math.max(fitH, fitW) * 1.12 + Math.max(s.x, s.z) * 0.4;
  if (i === 2) {
    const d = Math.max(9, Math.min(s.y * 0.75, 90) + Math.max(s.x, s.z) * 0.2);
    camera.position.set(c.x + d * 0.28, 1.7, c.z + Math.max(s.z * 0.5 + d, 6));
    camera.lookAt(c.x, Math.min(s.y * 0.55, 1.7 + d * 0.75), c.z);
  } else {
    const dir = i === 0 ? new THREE.Vector3(0.62, 0.22, 0.75) : i === 1 ? new THREE.Vector3(0.0, 0.06, 1) : new THREE.Vector3(-0.66, 0.62, -0.52);
    dir.normalize();
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.position.y = Math.max(1.6, camera.position.y);
    camera.lookAt(c);
  }
  orbit.target.copy(c); orbit.dist = camera.position.distanceTo(c);
}

function placeSubject(obj: THREE.Object3D, def: MonumentDef | null): void {
  if (subject) { world.remove(subject); disposeObject(subject); }
  subject = obj; subjectDef = def;
  (window as unknown as Record<string, unknown>).__subject = obj;
  world.add(obj);
  obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 10, 5));
  const s = box.getSize(new THREE.Vector3());
  person.position.set(Math.min(s.x * 0.28, 9) + 1.5, 0, box.max.z + Math.min(1.5 + s.z * 0.1, 7));
  fitShadow();
}

function buildSubject(): void {
  const t0 = performance.now();
  if (demo === 'kit') placeSubject(buildKitDemo(quality), null);
  else if (demo === 'palais') placeSubject(buildPalaceDemo(), null);
  else {
    const key = params.get('key') ?? 'arc_triomphe';
    const def = getMonument(key);
    if (!def) throw new Error(`monument inconnu : ${key}`);
    const site = { footprint: [], height: def.height };
    placeSubject(far ? def.buildFar(site) : def.build(site, quality), def);
  }
  buildMs = performance.now() - t0;
}

function setFar(f: boolean): void {
  far = f;
  buildSubject();
  setView(view);
}

/** Bilan : triangles et appels de dessin du SEUL monument (sol, repère et ombres exclus), lus dans renderer.info. */
function stats(): Record<string, number | string> {
  const prev = { g: ground.visible, p: person.visible, s: sun.castShadow, k: sky.visible };
  ground.visible = false; person.visible = false; sun.castShadow = false; sky.visible = false;
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  ground.visible = prev.g; person.visible = prev.p; sun.castShadow = prev.s; sky.visible = prev.k;
  const st = subject ? statsOf(subject) : { triangles: 0, drawCalls: 0, vertices: 0 };
  const s = box.getSize(new THREE.Vector3());
  return {
    key: subjectDef?.key ?? demo ?? '', far: far ? 1 : 0, quality,
    rendererCalls: calls, rendererTriangles: tris, triangles: st.triangles, drawCalls: st.drawCalls, vertices: st.vertices,
    buildMs: Math.round(buildMs), width: +s.x.toFixed(2), height: +box.max.y.toFixed(2), depth: +s.z.toFixed(2),
    textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
  };
}

// ───────────────────────────── démonstration du système complet ─────────────────────────────
let sysApi: MonumentsApi | null = null;
const sysEnv = { timeOfDay: 14, daylight: 1, isNight: false };
const sysCam = { x: 0, y: 1.7, z: 60 };
let sysFrame: ((dt: number) => void) | null = null;

function startSystemDemo(): void {
  const defs = listMonuments();
  const landmarks: LandmarkInfo[] = [];
  // les monuments alignés tous les 450 m ; les fontaines posées deux fois, comme place de la Concorde
  let x = 0;
  for (const d of defs) {
    landmarks.push({ key: d.key, name: d.name, x, z: 0, y: 0, heading: 0, height: d.height, footprint: [] });
    if (d.key === 'fontaines_concorde') landmarks.push({ key: d.key, name: d.name, x, z: -110, y: 0, heading: Math.PI, height: d.height, footprint: [] });
    x += 450;
  }
  const services = new Map<string, unknown>();
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const viewApi = {
    renderer, scene, camera, world, quality, drawDistance: 600,
    get camX() { return camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return camera.position.z; },
    shake() { /* sans objet dans le banc d'essai */ }, setScreenEffect() { /* sans objet dans le banc d'essai */ },
  };
  const ctx = {
    headless: false,
    view: viewApi,
    world: { ready: true, landmarks, heightAt: (px: number) => Math.sin(px * 0.004) * 1.5 + 1.5 },
    env: { state: sysEnv },
    events: {
      on: (name: string, h: (p: unknown) => void) => { const l = handlers.get(name) ?? []; l.push(h); handlers.set(name, l); return () => { l.splice(l.indexOf(h), 1); }; },
      emit: (name: string, p: unknown) => { for (const h of handlers.get(name) ?? []) h(p); },
    },
    provide: (k: string, s: unknown) => { services.set(k, s); },
    service: (k: string) => services.get(k),
  } as unknown as GameContext;
  const systems = createSystems();
  for (const s of systems) s.provide?.(ctx);
  for (const s of systems) void s.init?.(ctx);
  sysApi = ctx.service<MonumentsApi>('monuments') ?? null;
  sysFrame = (dt) => { for (const s of systems) s.frame?.(dt); };
  ground.position.y = 0;
  person.position.set(3, 3, 30);
  box = new THREE.Box3(new THREE.Vector3(-60, 0, -60), new THREE.Vector3(60, 60, 60));
  fitShadow();
  const w = window as unknown as Record<string, unknown>;
  w.__sys = {
    landmarks,
    stats: () => sysApi?.stats(),
    setCam: (cx: number, cy: number, cz: number, tx: number, ty: number, tz: number) => {
      sysCam.x = cx; sysCam.y = cy; sysCam.z = cz;
      camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz);
      box = new THREE.Box3(new THREE.Vector3(tx - 80, 0, tz - 80), new THREE.Vector3(tx + 80, 120, tz + 80));
      fitShadow();
    },
    setHour: (h: number) => { sysEnv.timeOfDay = h; const day = h > 7.5 && h < 19.5; sysEnv.daylight = day ? 1 : 0; sysEnv.isNight = !day; setNight(!day); },
    reset: () => { for (const s of systems) s.reset?.(); },
    quality: (q: string) => { (viewApi as { quality: string }).quality = q; (ctx.events as unknown as { emit: (n: string, p: unknown) => void }).emit('settings:changed', { key: 'quality' }); },
  };
  camera.position.set(60, 30, 140); camera.lookAt(0, 20, 0);
}

// ───────────────────────────── interface manuelle ─────────────────────────────
function button(label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label; b.onclick = fn;
  bar.appendChild(b);
}
if (!demo) {
  const sel = document.createElement('select');
  for (const d of listMonuments()) { const o = document.createElement('option'); o.value = d.key; o.textContent = d.name; sel.appendChild(o); }
  sel.value = params.get('key') ?? 'arc_triomphe';
  sel.onchange = () => { params.set('key', sel.value); location.search = params.toString(); };
  bar.appendChild(sel);
}
['Trois quarts', 'Face', 'Piéton', 'Arrière'].forEach((l, i) => button(l, () => setView(i)));
button('Jour / nuit', () => setNight(!night));
if (!demo) button('Détail / silhouette', () => setFar(!far));
button('Scintillement', () => { sparkle = sparkle > 0 ? 0 : 1; });

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons === 0) return;
  orbit.manual = true;
  orbit.yaw -= e.movementX * 0.005; orbit.pitch = Math.max(-0.05, Math.min(1.45, orbit.pitch + e.movementY * 0.005));
});
renderer.domElement.addEventListener('wheel', (e) => { orbit.manual = true; orbit.dist *= Math.exp(e.deltaY * 0.001); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

// ───────────────────────────── démarrage ─────────────────────────────
const w = window as unknown as Record<string, unknown>;
try {
  setNight(params.get('night') === '1');
  far = params.get('far') === '1';
  if (demo === 'systeme') startSystemDemo();
  else { buildSubject(); setView(Number(params.get('angle') ?? 0)); }
} catch (err) {
  console.error('[banc monuments] ' + (err instanceof Error ? err.stack : String(err)));
}
w.__setView = setView; w.__setNight = setNight; w.__setFar = setFar; w.__stats = stats;
w.__setSparkle = (v: number) => { sparkle = v; };
w.__look = (cx: number, cy: number, cz: number, tx: number, ty: number, tz: number) => { orbit.manual = false; camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz); };
w.__colliders = (key: string) => getColliders(key, { footprint: [], height: 0 });

const info: MonumentFrame = { time: 0, dt: 0, daylight: 1, night: 0, hour: 12, sparkle: 0 };
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; time += dt;
  if (sysFrame) sysFrame(dt);
  else {
    tickMaterials(time);
    info.time = time; info.dt = dt; info.night = night ? 1 : 0; info.daylight = night ? 0 : 1; info.hour = night ? 22 : 14; info.sparkle = sparkle;
    if (subject && subjectDef?.animate) subjectDef.animate(subject, info, far);
    if (orbit.manual) {
      const cp = Math.cos(orbit.pitch);
      camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, Math.max(0.5, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist), orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
      camera.lookAt(orbit.target);
    }
  }
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  frames++;
  w.__frames = frames;
  if (frames % 20 === 1 && !document.body.classList.contains('shot')) {
    const st = sysApi ? sysApi.stats() : subject ? statsOf(subject) : null;
    hud.textContent = `${subjectDef?.name ?? demo ?? ''}\n${st ? JSON.stringify(st) : ''}\nconstruction : ${Math.round(buildMs)} ms — qualité ${quality}`;
  }
  if (frames === 2) w.__ready = true;
});
