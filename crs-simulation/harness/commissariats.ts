// Banc d'essai de l'habillage des commissariats. Le moteur du module (CommissariatsRenderer) est branché sur une
// scène d'essai : sol plat, un bloc d'immeuble derrière la façade du site, les sept sites aux coordonnées du jeu
// (les autres se voient de loin). Un site de chaque sorte d'enseigne :
//   ?site=9e         commissariat central (« COMMISSARIAT DE POLICE — 9ᵉ ARRONDISSEMENT »)
//   ?site=celestins  caserne de gendarmerie (« GENDARMERIE NATIONALE »)
//   ?site=cite       préfecture (pas d'enseigne : lanterne, drapeau et places seulement)
// Options : &cam=porte|places|loin, &nuit=1, &qualite=bas|moyen|haut|ultra, &shot=1 (sans légende), &view=atlas.
// &view=jeu : contrôle d'intégration sur la VRAIE carte — rendu de base, ville, monuments et module branchés comme
// dans le jeu, le joueur posté devant la porte du site (&cam=porte) ou de ses places (&cam=places).
// Clavier : N jour / nuit, 1 2 3 site, P porte, B places, L loin. Au toucher : les boutons en bas de l'écran.
// Pour les essais de bout en bout : window.__ready, __frames, __info, __measure(), __sample(point, demi-côté).
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import { COMMISSARIATS } from '@/world/commissariats';
import { CommissariatsRenderer } from '@/render/commissariats';
import type { RenderHost, ViewLike } from '@/render/commissariats';
import { createSystems as commissariatsRender, COMMISSARIATS_RENDER_KEY } from '@/render/commissariats';
import type { CommissariatsRenderApi } from '@/render/commissariats';
import { ATLAS_H, ATLAS_W, createCommissariatAtlas } from '@/render/commissariats/atlas';
import { Game } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';

const params = new URLSearchParams(location.search);
const siteId = params.get('site') ?? '9e';
const cam = params.get('cam') ?? 'porte';
const night = params.get('nuit') === '1';
const quality = (params.get('qualite') ?? 'haut') as QualityLevel;
const W = window as unknown as Record<string, unknown>;
const hud = document.getElementById('hud')!;
const bar = document.getElementById('bar')!;
if (params.get('shot') === '1') document.body.classList.add('shot');

const def = COMMISSARIATS.find((c) => c.id === siteId) ?? COMMISSARIATS[0]!;

// ── barre de navigation (clavier et toucher) ──
function link(label: string, change: Record<string, string>, key: string): void {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(change)) p.set(k, v);
  const a = document.createElement('a');
  a.href = '?' + p.toString();
  a.textContent = `${label} (${key})`;
  bar.appendChild(a);
}
link('9e', { site: '9e' }, '1');
link('Célestins', { site: 'celestins' }, '2');
link('Préfecture', { site: 'cite' }, '3');
link('Porte', { cam: 'porte' }, 'P');
link('Places', { cam: 'places' }, 'B');
link('Loin', { cam: 'loin' }, 'L');
link(night ? 'Jour' : 'Nuit', { nuit: night ? '0' : '1' }, 'N');
link('Atlas', { view: 'atlas' }, 'A');
const keys: Record<string, Record<string, string>> = {
  Digit1: { site: '9e' }, Digit2: { site: 'celestins' }, Digit3: { site: 'cite' },
  KeyP: { cam: 'porte' }, KeyB: { cam: 'places' }, KeyL: { cam: 'loin' }, KeyN: { nuit: night ? '0' : '1' }, KeyA: { view: 'atlas' },
};
window.addEventListener('keydown', (e) => {
  const change = keys[e.code];
  if (!change) return;
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(change)) p.set(k, v);
  if (e.code !== 'KeyA') p.delete('view');
  location.search = p.toString();
});

if (params.get('view') === 'atlas') {
  const atlas = createCommissariatAtlas();
  const img = atlas ? (atlas.texture.image as HTMLCanvasElement) : null;
  if (img) {
    img.style.cssText = `display:block;margin:10px auto;max-width:96vw;background:repeating-conic-gradient(#555 0 25%,#333 0 50%) 0 0/16px 16px`;
    document.body.appendChild(img);
    document.body.style.overflow = 'auto';
  }
  hud.textContent = `atlas ${ATLAS_W} × ${ATLAS_H}`;
  W.__frames = 99;
  W.__ready = true;
} else if (params.get('view') === 'jeu') {
  await runIntegrated();
} else {
  run();
}

/** Contrôle d'intégration : la vraie carte de Paris, la ville dessinée, le module branché comme dans le jeu. */
async function runIntegrated(): Promise<void> {
  const [base, worldQuery, worldView, monuments] = await Promise.all([
    import('@/render/base/index'), import('@/world/query/index'), import('@/world/view/index'), import('@/world/monuments/index'),
  ]);
  const host = document.createElement('div');
  host.id = 'game';
  host.style.cssText = 'position:fixed;inset:0';
  document.body.insertBefore(host, document.body.firstChild);
  const game = new Game({ headless: false, storage: null });
  const ctx = game.ctx;
  ctx.settings.set('quality', quality);
  game.addModule(base.createSystems);
  // données servies depuis public/ : vues de harness/, elles sont un dossier plus haut
  const baseUrl = '../data/paris/';
  game.addModule(() => worldQuery.createWorldQuerySystems({ source: 'paris', baseUrl }));
  game.addModule(() => worldView.createWorldViewSystems({ baseUrl }));
  game.addModule(monuments.createSystems);
  game.addModule(commissariatsRender);
  await game.boot();
  const h = def.facade.heading;
  let tx = def.door.x, tz = def.door.z, back = 12;
  if (cam === 'places' && def.slots.length) {
    tx = 0; tz = 0;
    for (const s of def.slots) { tx += s.x; tz += s.z; }
    tx /= def.slots.length; tz /= def.slots.length;
    back = 22;
  }
  const px = tx + Math.sin(h) * back + Math.cos(h) * 3, pz = tz + Math.cos(h) * back - Math.sin(h) * 3;
  await ctx.session.start(defaultSessionConfig({ mode: 'monde_ouvert', timeOfDay: night ? 23 : 14, x: px, z: pz }));
  ctx.env.setTime(night ? 23 : 14);
  const v3d = ctx.view;
  if (!v3d) throw new Error('[banc] le rendu de base n\'a pas fourni ctx.view');
  const p = ctx.people.spawn({ kind: 'crs', x: px, z: pz, heading: Math.atan2(tx - px, tz - pz) });
  ctx.player.possess(p.id);
  ctx.player.state.camYaw = p.heading;
  ctx.player.state.camPitch = cam === 'places' ? -0.35 : 0.12;
  ctx.world.setFocus(px, pz);
  await ctx.world.whenLoaded(px, pz, 500);
  const api = ctx.require<CommissariatsRenderApi>(COMMISSARIATS_RENDER_KEY);
  const info: Record<string, unknown> = {};
  W.__info = info;
  let frames = 0;
  let last = performance.now();
  const loop = (): void => {
    if (W.__pause) { requestAnimationFrame(loop); return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    frames++;
    const st = api.stats;
    const b = ctx.world.bounds;
    Object.assign(info, {
      frames, site: def.id, ...st, calls: v3d.renderer.info.render.calls, worldReady: ctx.world.ready,
      bounds: b ? [Math.round(b.minX), Math.round(b.minZ), Math.round(b.maxX), Math.round(b.maxZ)] : null,
      cam: [Math.round(v3d.camX), Math.round(v3d.camZ)], mode: ctx.session.config?.mode ?? null, phase: ctx.session.phase,
    });
    if (frames % 10 === 1) {
      hud.textContent = `${def.name} — vraie carte${night ? ' — nuit' : ''}\n`
        + `sites construits ${st.built}/${st.sites}, proches ${st.visible}, lointains ${st.farVisible} — module : ${st.drawCalls} appels, ${st.triangles} triangles`;
    }
    W.__frames = frames;
    requestAnimationFrame(loop);
  };
  W.__ready = true;
  requestAnimationFrame(loop);
}

function run(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'bas', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.4 : 1.0;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  const scene = new THREE.Scene();
  const sky = night ? 0x060912 : 0xb4c6d8;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 300, 1400);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, 3000);
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.HemisphereLight(night ? 0x34405c : 0xcfe0ff, night ? 0x1a1610 : 0x5a5448, night ? 0.35 : 1.1));
  const sun = new THREE.DirectionalLight(night ? 0x8fa6d8 : 0xfff2e0, night ? 0.12 : 2.4);
  sun.position.set(def.door.x + 60, 120, def.door.z + 40);
  sun.target.position.set(def.door.x, 0, def.door.z);
  scene.add(sun, sun.target);

  // sol d'essai et bloc d'immeuble derrière chaque façade (les sites réels habillent un bâtiment de la carte)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(def.door.x, -0.01, def.door.z);
  world.add(ground);
  const stone = new THREE.MeshStandardMaterial({ color: 0xcdc2a4, roughness: 0.9 });
  for (const c of COMMISSARIATS) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 24), stone);
    const h = c.facade.heading;
    b.position.set(c.facade.x - Math.sin(h) * 12, 10, c.facade.z - Math.cos(h) * 12);
    b.rotation.y = h;
    world.add(b);
  }

  const view: ViewLike & { camX: number; camZ: number } = { world, quality, drawDistance: 1500, camX: 0, camZ: 0 };
  const host: RenderHost = { groundAt: () => 0, night: () => (night ? 1 : 0), active: () => true };
  const eng = new CommissariatsRenderer(view, host, createCommissariatAtlas(renderer.capabilities.getMaxAnisotropy()));

  // ── caméra ──
  const h = def.facade.heading;
  const N = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  const U = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
  const door = new THREE.Vector3(def.door.x, 0, def.door.z);
  let bayCentre = door.clone();
  if (def.slots.length) {
    bayCentre = new THREE.Vector3(0, 0, 0);
    for (const s of def.slots) bayCentre.add(new THREE.Vector3(s.x, 0, s.z));
    bayCentre.multiplyScalar(1 / def.slots.length);
  }
  if (cam === 'places') {
    const s0 = def.slots[0]!;
    const side = new THREE.Vector3(Math.cos(s0.heading), 0, -Math.sin(s0.heading));
    camera.position.copy(bayCentre).addScaledVector(side, -16).addScaledVector(new THREE.Vector3(Math.sin(s0.heading), 0, Math.cos(s0.heading)), -14).setY(9);
    camera.lookAt(bayCentre.x, 0, bayCentre.z);
  } else if (cam === 'loin') {
    camera.position.copy(door).addScaledVector(N, 480).addScaledVector(U, 60).setY(25);
    camera.lookAt(door.x, 4, door.z);
  } else {
    camera.position.copy(door).addScaledVector(N, 11).addScaledVector(U, 3.5).setY(1.7);
    camera.lookAt(door.x, 2.6, door.z);
  }
  view.camX = camera.position.x;
  view.camZ = camera.position.z;

  // ── mesures pour les essais de bout en bout ──
  const info: Record<string, unknown> = {};
  W.__info = info;
  W.__measure = (): { base: number; total: number; near: number; far: number } => {
    eng.root.visible = false;
    renderer.render(scene, camera);
    const base = renderer.info.render.calls;
    eng.root.visible = true;
    renderer.render(scene, camera);
    return { base, total: renderer.info.render.calls, near: eng.stats.visible, far: eng.stats.farVisible };
  };
  const probe = document.createElement('canvas');
  W.__sample = (what: 'lantern' | 'sign' | 'door', half = 6): Record<string, number> | null => {
    const a = eng.anchors(def.id);
    const p = a ? (what === 'lantern' ? a.lantern : what === 'sign' ? a.sign : a.door) : null;
    if (!p) return null;
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
    const x = Math.round((v.x * 0.5 + 0.5) * renderer.domElement.width);
    const y = Math.round((-v.y * 0.5 + 0.5) * renderer.domElement.height);
    probe.width = renderer.domElement.width;
    probe.height = renderer.domElement.height;
    const g = probe.getContext('2d')!;
    g.drawImage(renderer.domElement, 0, 0);
    const x0 = Math.max(0, x - half), y0 = Math.max(0, y - half);
    const w = Math.min(probe.width - x0, half * 2 + 1), hh = Math.min(probe.height - y0, half * 2 + 1);
    if (w <= 0 || hh <= 0) return null;
    const data = g.getImageData(x0, y0, w, hh).data;
    let r = 0, gr = 0, b = 0, l = 0, l2 = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      r += data[i]!; gr += data[i + 1]!; b += data[i + 2]!; l += lum; l2 += lum * lum;
    }
    const mean = l / n;
    return { x, y, r: r / n, g: gr / n, b: b / n, lum: mean, std: Math.sqrt(Math.max(0, l2 / n - mean * mean)) };
  };

  let frames = 0;
  let last = performance.now();
  const loop = (): void => {
    if (W.__pause) { requestAnimationFrame(loop); return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    eng.frame(dt);
    renderer.render(scene, camera);
    frames++;
    const st = eng.stats;
    Object.assign(info, { frames, site: def.id, cam, night, quality, ...st, calls: renderer.info.render.calls });
    if (frames % 10 === 1) {
      hud.textContent = `${def.name}${night ? ' — nuit' : ' — jour'} — vue « ${cam} »\n`
        + `sites construits ${st.built}/${st.sites}, proches ${st.visible}, lointains ${st.farVisible}\n`
        + `module : ${st.drawCalls} appels, ${st.triangles} triangles — scène : ${renderer.info.render.calls} appels`;
    }
    W.__frames = frames;
    requestAnimationFrame(loop);
  };
  W.__ready = true;
  requestAnimationFrame(loop);
}
