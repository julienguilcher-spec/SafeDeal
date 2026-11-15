// Banc d'essai du rendu des personnages. Vues (paramètre d'URL `view`) :
//   tenues : alignement de toutes les tenues (face ou dos : &dos=1 ; &jeu=1|2 ; &pres=1 pour un plan serré)
//   poses  : grille des postures et animations du haut du corps (&page=1..4 ; &t=temps figé)
//   marche : marche, course, sprint, pas de côté, marche arrière, accroupi, boiterie
//   foule  : 1 500 personnes qui marchent, avec mesures (&n=1500 ; &qualite=bas|moyen|haut|ultra)
//   fps    : vue à la première personne (&objet=… ; &anim=… ; &t=…)
// Le module est branché comme dans le jeu : createSystems() → provide() → init() → frame().
import * as THREE from 'three';
import type {
  GameContext, GameSystem, ItemStack, Person, PersonLook, PlayerState, QualityLevel, Vehicle,
} from '@/core/contracts';
import { createSystems } from '@/render/people/index';
import type { PeopleRenderApi } from '@/render/people/api';
import { POSTURE_NAMES, UPPER_NAMES } from '@/render/people/poseparams';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'tenues';
const quality = (params.get('qualite') ?? 'haut') as QualityLevel;

// ── scène ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = quality !== 'bas';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb4c6d8);
scene.fog = new THREE.Fog(0xb4c6d8, 60, 420);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 800);
const world = new THREE.Group();
scene.add(world);
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
sun.position.set(9, 16, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe0ff, 0x5a5448, 1.1));

function setShadowArea(cx: number, cz: number, half: number): void {
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 80;
  c.updateProjectionMatrix();
  sun.position.set(cx + 9, 16, cz + 7);
  sun.target.position.set(cx, 0, cz);
}

// sol : asphalte avec un quadrillage discret d'un mètre
function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#77776f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 100 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(40,40,40,0.35)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(400, 400);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);

// ── faux contexte de jeu ──────────────────────────────────────────────────────────────
const people: Person[] = [];
const byId = new Map<number, Person>();
const handlers = new Map<string, ((p: unknown) => void)[]>();
const services = new Map<string, unknown>();
const clock = { now: 0, dt: 0, tick: 0, timeScale: 1 };
const playerState: PlayerState = {
  personId: 0, role: 'crs', cameraMode: 'free', camYaw: 0, camPitch: 0, zoom: 1, controlEnabled: true,
  charge: 0, prompt: null, aimedPersonId: 0, aimX: 0, aimZ: 0,
};
const vehicles = new Map<number, Vehicle>();
let nextId = 1;
const ctx = {
  events: {
    on(name: string, h: (p: unknown) => void) { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(h); return () => {}; },
    once() { return () => {}; },
    emit(name: string, payload: unknown) { for (const h of handlers.get(name) ?? []) h(payload); },
    onAny() { return () => {}; },
    emitAny() {},
  },
  clock,
  settings: { values: { shadows: true, quality } },
  session: { phase: 'playing', config: null },
  headless: false,
  people: { list: people, get: (id: number) => byId.get(id) },
  vehicles: { list: [], get: (id: number) => vehicles.get(id) },
  actions: { def: () => undefined },
  player: { state: playerState },
  world: { heightAt: () => 0 },
  view: {
    renderer, scene, camera, world, quality, drawDistance: 600,
    get camX() { return camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return camera.position.z; },
    shake() {}, setScreenEffect() {},
  },
  provide(key: string, s: unknown) { services.set(key, s); },
  service(key: string) { return services.get(key); },
  require(key: string) { return services.get(key); },
  newId() { return nextId++; },
} as unknown as GameContext;

const DEFAULT_LOOK: PersonLook = {
  height: 1.75, build: 1, skin: 0xd9a47c, hair: 0x2a1c12, hairStyle: 1, top: 0x4a5a6a, bottom: 0x2b3340, shoes: 0x1a1a1c,
  outfit: 'civil', headgear: 'none', visorDown: false, gasMask: false, faceCover: false, backText: '', sash: false,
  armband: 0, vest: 0, rankBars: 0, backpack: false,
};

function makePerson(x: number, z: number, heading: number, look: Partial<PersonLook> = {}, item = ''): Person {
  const id = nextId++;
  const inventory: ItemStack[] = item ? [{ id: item, count: 1, state: 1, cooldown: 0 }] : [];
  const p: Person = {
    id, kind: 'passant', faction: 'civil', name: '', x, z, y: 0, vx: 0, vz: 0, heading, aimYaw: heading, aimPitch: 0,
    radius: 0.28, speedWalk: 1.4, speedRun: 3.5, speedSprint: 6, health: 100, injury: 'none', stamina: 100, gas: 0, stun: 0,
    burning: 0, wet: 0, posture: 'stand', upper: 'none', upperT: 0, armorHead: 0, armorBody: 0, gasProtection: 0, fear: 0,
    anger: 0, profile: null, rank: null, poste: null, rio: '', inventory, active: item ? 0 : -1, alt: false,
    look: { ...DEFAULT_LOOK, ...look }, squadId: 0, vehicleId: 0, seat: -1, carrying: 0, heldBy: 0, offenses: [],
    custody: 'free', isPlayer: false,
    cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: heading, aimPitch: 0, faceMove: true, crouch: false, jump: false },
    brain: null, dormant: false,
  };
  people.push(p);
  byId.set(id, p);
  return p;
}

// ── étiquettes ────────────────────────────────────────────────────────────────────────
const labelRoot = document.getElementById('labels')!;
const labels: { el: HTMLElement; x: number; y: number; z: number }[] = [];
function label(text: string, x: number, z: number, y = -0.05): void {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  labelRoot.appendChild(el);
  labels.push({ el, x, y, z });
}
const v3 = new THREE.Vector3();
function placeLabels(): void {
  for (const l of labels) {
    v3.set(l.x, l.y, l.z).project(camera);
    const vis = v3.z < 1 && v3.z > -1;
    l.el.style.display = vis ? 'block' : 'none';
    l.el.style.left = ((v3.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
    l.el.style.top = ((-v3.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
  }
}

// ── aléa déterministe ─────────────────────────────────────────────────────────────────
let seed = 12345;
function rnd(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return ((seed >>> 8) & 0xffffff) / 0x1000000;
}
function pick<T>(a: readonly T[]): T { return a[Math.floor(rnd() * a.length)]; }
const SKINS = [0xf1c9a5, 0xe0ac86, 0xc98e66, 0xa8714a, 0x7d5234, 0x5a3a26, 0xeab896, 0xd9a47c];
const HAIRS = [0x1c1410, 0x2a1c12, 0x4a3020, 0x6b4a2a, 0x8a6a3c, 0xb89a5a, 0x3a3a3c, 0x9a9a98, 0x6a2a18];
const TOPS = [0x3b4a5c, 0x6a2c2c, 0x2f4a3a, 0x8a8478, 0x24303e, 0x5a4a6a, 0xa0522d, 0x2c2c30, 0x7a8a9a, 0xb8a078, 0x345a7a, 0x8a3a4a, 0x4a4a48, 0xc2c0b8];
const BOTTOMS = [0x1e2a3c, 0x2b3340, 0x3a3a3c, 0x4a4032, 0x20242c, 0x5a5648, 0x26303a, 0x1a1a1e];
function civilLook(): Partial<PersonLook> {
  return {
    height: 1.56 + rnd() * 0.36, build: 0.86 + rnd() * 0.36, skin: pick(SKINS), hair: pick(HAIRS), hairStyle: Math.floor(rnd() * 7),
    top: pick(TOPS), bottom: pick(BOTTOMS), shoes: pick([0x1a1a1c, 0x3a2a20, 0xe8e8e4, 0x2a2a30, 0x5a3a28]),
    headgear: rnd() < 0.12 ? 'casquette' : rnd() < 0.08 ? 'bonnet' : rnd() < 0.08 ? 'capuche' : 'none',
    backpack: rnd() < 0.18,
  };
}

// ── vues ──────────────────────────────────────────────────────────────────────────────
type Tick = (t: number, dt: number) => void;
let tick: Tick = () => {};
const fixedT = params.has('t') ? parseFloat(params.get('t')!) : -1;

const CRS: Partial<PersonLook> = { outfit: 'crs_mo', headgear: 'casque_crs', backText: 'POLICE', rankBars: 2, height: 1.82, build: 1.08, hairStyle: 1 };
const OUTFITS: { name: string; look: Partial<PersonLook>; item?: string }[] = [
  { name: 'CRS — maintien de l’ordre', look: { ...CRS } },
  { name: 'CRS — visière baissée, masque', look: { ...CRS, visorDown: true, gasMask: true, backText: 'CRS', rankBars: 0, skin: 0xc98e66 } },
  { name: 'Gendarme mobile', look: { outfit: 'gendarme_mo', headgear: 'casque_gendarme', backText: 'GENDARMERIE', height: 1.8, build: 1.05, visorDown: true } },
  { name: 'BRAV-M', look: { outfit: 'bravm', headgear: 'casque_moto', backText: 'POLICE', height: 1.78, armband: 0xff5a1f } },
  { name: 'Policier en civil', look: { outfit: 'police_civil', armband: 0xff5a1f, top: 0x3a3f4a, bottom: 0x2a3550, hairStyle: 1, height: 1.79, extras: { jacket: 1 } } },
  { name: 'Autorité civile (écharpe)', look: { outfit: 'commissaire', sash: true, top: 0x1b2030, bottom: 0x1b2030, shoes: 0x0e0e10, hairStyle: 1, hair: 0x5a5a58, height: 1.76, extras: { jacket: 1 } } },
  { name: 'CRS — tenue de service', look: { outfit: 'crs_service', headgear: 'calot', backText: 'POLICE', rankBars: 3, height: 1.77 } },
  { name: 'Sapeur-pompier', look: { outfit: 'pompier', headgear: 'casque_pompier', backText: 'SAPEURS-POMPIERS', height: 1.8, build: 1.06 } },
  { name: 'SAMU', look: { outfit: 'samu', backText: 'SAMU', hairStyle: 4, hair: 0x6b4a2a, height: 1.68, build: 0.92 } },
  { name: 'Télépilote / casquette', look: { outfit: 'crs_service', headgear: 'casquette_police', backText: 'POLICE', height: 1.74 }, item: 'telecommande_drone' },
  { name: 'Black bloc', look: { outfit: 'black_bloc', headgear: 'capuche', faceCover: true, backpack: true, height: 1.76 } },
  { name: 'Black bloc — cagoule', look: { outfit: 'black_bloc', headgear: 'cagoule', height: 1.7, build: 0.94, extras: { goggles: 1 } } },
  { name: 'Gilet fluo', look: { outfit: 'gilet_fluo', top: 0x4a4a48, bottom: 0x2b3340, hairStyle: 2, hair: 0x8a6a3c, height: 1.72, build: 1.12 } },
  { name: 'Cortège syndical', look: { outfit: 'syndical', vest: 0xc8161d, top: 0x3b4a5c, hairStyle: 5, hair: 0x4a3020, height: 1.66, build: 0.95, backText: 'UNION' } },
  { name: 'Street medic', look: { outfit: 'street_medic', headgear: 'casque_medic', backpack: true, top: 0x2c2c30, height: 1.7, extras: { goggles: 1 } } },
  { name: 'Presse', look: { outfit: 'presse', headgear: 'casque_presse', backText: 'PRESSE', top: 0x24262c, bottom: 0x2a3040, armband: 0xf0f0ec, height: 1.74 }, item: 'appareil_photo' },
  { name: 'Observateur', look: { outfit: 'observateur', headgear: 'casque_presse', backText: 'OBSERVATEUR', top: 0x5a5a58, height: 1.69, hairStyle: 3, extras: { helmetColor: 0xf0f0ec } } },
  { name: 'Civil', look: { top: 0x8a3a4a, bottom: 0x1e2a3c, hairStyle: 3, hair: 0x6a2a18, height: 1.65, build: 0.9, extras: { jacket: 0 } } },
  { name: 'Civil — manteau, bonnet', look: { top: 0x4a4032, bottom: 0x2b3340, headgear: 'bonnet', height: 1.84, build: 1.15, skin: 0x7d5234, extras: { jacket: 2, beard: 1 } } },
  { name: 'Costume', look: { outfit: 'costume', top: 0x2a2c34, bottom: 0x2a2c34, shoes: 0x1a1210, hairStyle: 0, skin: 0x5a3a26, height: 1.8 } },
  { name: 'Sport — afro', look: { outfit: 'sport', top: 0x2a61b8, bottom: 0x16181c, shoes: 0xe8e8e4, hairStyle: 6, hair: 0x1c1410, skin: 0xa8714a, height: 1.71, extras: { sleeves: 0 } } },
  { name: 'Civil — jupe', look: { top: 0xb8a078, bottom: 0x3a3a3c, hairStyle: 2, hair: 0xb89a5a, height: 1.63, build: 0.88, skin: 0xf1c9a5, extras: { skirt: 1, jacket: 0 } } },
];

function viewOutfits(): void {
  const back = params.get('dos') === '1';
  const set = parseInt(params.get('jeu') ?? '0', 10);
  const close = params.get('pres') === '1';
  let list = OUTFITS;
  if (set === 1) list = OUTFITS.slice(0, 11);
  else if (set === 2) list = OUTFITS.slice(11);
  if (close) {
    const from = parseInt(params.get('de') ?? '0', 10);
    list = OUTFITS.slice(from, from + 4);
  }
  const sp = close ? 0.95 : 1.0;
  const w = (list.length - 1) * sp;
  list.forEach((o, i) => {
    const x = -w / 2 + i * sp;
    makePerson(x, 0, back ? Math.PI : 0, o.look, o.item ?? '');
    label(o.name, x, back ? -0.35 : 0.35);
  });
  camera.fov = close ? 30 : 30;
  camera.updateProjectionMatrix();
  const th = Math.tan((camera.fov * Math.PI) / 360);
  const dist = Math.max((w / 2 + 0.75) / (th * camera.aspect), 1.25 / th);
  camera.position.set(0.0, 1.5, dist);
  camera.lookAt(0, 0.95, 0);
  setShadowArea(0, 0, Math.max(6, w / 2 + 2));
}

const POSE_ITEMS: Record<string, string> = {
  throw: 'pave', strike: 'baton', block: 'bouclier', shield_carry: 'bouclier', aim_long: 'lbd40', aim_pistol: 'pistolet',
  spray: 'gazeuse', megaphone: 'megaphone', radio: 'radio', carry_sign: 'pancarte', carry_banner: 'banderole',
  film: 'telephone', photo: 'appareil_photo', umbrella: 'parapluie', hammer: 'marteau', spraypaint: 'bombe_peinture',
  carry_loot: 'butin', extinguish: 'extincteur', remote: 'telecommande_drone', treat: 'trousse_secours',
};
const POLICE_ANIMS = new Set(['strike', 'block', 'shield_carry', 'aim_long', 'aim_pistol', 'spray', 'megaphone', 'radio', 'restrain', 'remote', 'point', 'push', 'extinguish', 'drive', 'ride']);

function viewPoses(): void {
  const page = parseInt(params.get('page') ?? '1', 10);
  const cells: { name: string; make: (x: number, z: number) => Person[] }[] = [];
  for (const po of POSTURE_NAMES) {
    cells.push({ name: 'posture : ' + po, make: (x, z) => {
      const p = makePerson(x, z, 0, { ...civilLook(), headgear: 'none', backpack: false });
      p.posture = po as Person['posture'];
      if (po === 'down') p.injury = 'serious';
      return [p];
    } });
  }
  cells.push({ name: 'à terre (variantes)', make: (x, z) => {
    const out: Person[] = [];
    for (let i = 0; i < 2; i++) { const p = makePerson(x - 0.3 + i * 0.6, z - 0.4 + i * 0.9, 1.2 + i * 2, civilLook()); p.posture = 'down'; p.injury = i ? 'critical' : 'light'; out.push(p); }
    return out;
  } });
  for (const u of UPPER_NAMES.slice(1, 37)) {
    cells.push({ name: u, make: (x, z) => {
      const police = POLICE_ANIMS.has(u);
      const look = police ? { ...CRS, visorDown: u === 'block' || u === 'strike', rankBars: 0 } : { ...civilLook(), headgear: 'none' as const, backpack: false };
      const p = makePerson(x, z, 0, look, POSE_ITEMS[u] ?? '');
      p.upper = u;
      if (u === 'treat') p.posture = 'kneel';
      if (u === 'drive' || u === 'ride') p.posture = 'seated';
      if (u === 'cuffed') p.custody = 'cuffed';
      if (u === 'block') p.alt = true;
      const out = [p];
      if (u === 'carry_person') {
        const c = makePerson(x, z, 0, civilLook());
        c.posture = 'down'; c.injury = 'serious'; c.heldBy = p.id; p.carrying = c.id;
        out.push(c);
      }
      if (u === 'drag') {
        p.heading = Math.PI;
        const c = makePerson(x, z + 0.95, 0, civilLook());
        c.posture = 'down'; c.injury = 'serious'; c.heldBy = p.id; p.carrying = c.id;
        out.push(c);
      }
      return out;
    } });
  }
  // états déduits : gaz, étourdissement, feu
  cells.push({ name: 'gaz > 0,5 (toux)', make: (x, z) => { const p = makePerson(x, z, 0, civilLook()); p.gas = 0.9; return [p]; } });
  cells.push({ name: 'étourdi', make: (x, z) => { const p = makePerson(x, z, 0, civilLook()); p.stun = 2; return [p]; } });
  cells.push({ name: 'en feu', make: (x, z) => { const p = makePerson(x, z, 0, civilLook()); p.burning = 0.8; return [p]; } });
  cells.push({ name: 'CRS bouclier + bâton', make: (x, z) => { const p = makePerson(x, z, 0, { ...CRS, visorDown: true }, 'bouclier'); p.upper = 'shield_carry'; return [p]; } });

  const perPage = 12, cols = 6, sx = 2.0, sz = 4.2;
  const start = (page - 1) * perPage;
  const shown = cells.slice(start, start + perPage);
  const anim: Person[] = [];
  shown.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * sx * (row === 0 ? 1.12 : 1), z = (row - 0.5) * sz;
    for (const p of c.make(x, z)) anim.push(p);
    label(c.name, x, z + 1.0);
  });
  camera.fov = 30;
  camera.updateProjectionMatrix();
  camera.position.set(0, 7.2, 12.6);
  camera.lookAt(0, 0.55, -0.4);
  setShadowArea(0, 0, 9);
  tick = (t) => {
    for (const p of anim) p.upperT = fixedT >= 0 ? fixedT : t % 1.3;
  };
}

/** Vue de détail : chaque animation demandée (&anims=a,b,c ; « p:kneel » pour une posture) sous quatre angles. */
function viewDetail(): void {
  const names = (params.get('anims') ?? 'none').split(',');
  const angles = [0.4, -Math.PI / 2, Math.PI - 0.6];
  const anim: Person[] = [];
  const sx = 1.25;
  const total = names.length * angles.length;
  names.forEach((name, r) => {
    angles.forEach((a, c) => {
      const x = (r * angles.length + c - (total - 1) / 2) * sx + (r - (names.length - 1) / 2) * 0.5, z = 0;
      const isPosture = name.startsWith('p:');
      const u = isPosture ? 'none' : name;
      const police = POLICE_ANIMS.has(u);
      const itemName = params.get('objet') ?? POSE_ITEMS[u] ?? '';
      seed = 777 + r * 31;
      const look = police ? { ...CRS, visorDown: u === 'block', rankBars: 0 } : { ...civilLook(), headgear: 'none' as const, backpack: false, height: 1.75, build: 1 };
      const p = makePerson(x, z, a, look, itemName);
      p.upper = u;
      if (isPosture) p.posture = name.slice(2) as Person['posture'];
      if (params.has('posture')) p.posture = params.get('posture') as Person['posture'];
      if (p.posture === 'down') p.injury = 'serious';
      if (u === 'treat') p.posture = 'kneel';
      if (u === 'drive' || u === 'ride') p.posture = 'seated';
      if (u === 'cuffed') p.custody = 'cuffed';
      if (params.get('alt') === '1' || u === 'block') p.alt = true;
      if (params.has('site')) p.aimPitch = parseFloat(params.get('site')!);
      if (params.has('gaz')) p.gas = parseFloat(params.get('gaz')!);
      if (name === 'stagger') { p.upper = 'none'; p.stun = 2; }
      if (name === 'burn') { p.upper = 'none'; p.burning = 0.8; }
      anim.push(p);
      if (u === 'carry_person' || u === 'drag') {
        const cl = civilLook();
        const cp = makePerson(x + (u === 'drag' ? Math.sin(a) * 0.95 : 0), z + (u === 'drag' ? Math.cos(a) * 0.95 : 0), a, cl);
        cp.posture = 'down'; cp.injury = 'serious'; cp.heldBy = p.id; p.carrying = cp.id;
        if (u === 'drag') p.heading = a + Math.PI;
      }
    });
    label(name, (r * angles.length + 1 - (total - 1) / 2) * sx + (r - (names.length - 1) / 2) * 0.5, 0.9);
  });
  camera.fov = 26;
  camera.updateProjectionMatrix();
  const th = Math.tan((camera.fov * Math.PI) / 360);
  const dist = Math.max((total * sx / 2 + names.length * 0.25 + 0.5) / (th * camera.aspect), 1.5 / th);
  const el = parseFloat(params.get('el') ?? '0.22');
  camera.position.set(0, 1.0 + dist * Math.sin(el), dist * Math.cos(el));
  camera.lookAt(0, 1.0, 0);
  setShadowArea(0, 0, 7);
  tick = (t) => {
    for (const p of anim) p.upperT = fixedT >= 0 ? fixedT : t % 1.3;
  };
}

function viewWalk(): void {
  const lanes: { name: string; speed: number; fwd: number; side: number; setup?: (p: Person) => void; look?: Partial<PersonLook> }[] = [
    { name: 'marche lente 0,8 m/s', speed: 0.8, fwd: 1, side: 0 },
    { name: 'marche 1,4 m/s', speed: 1.4, fwd: 1, side: 0 },
    { name: 'course 3,5 m/s', speed: 3.5, fwd: 1, side: 0 },
    { name: 'sprint 6,5 m/s', speed: 6.5, fwd: 1, side: 0 },
    { name: 'marche arrière', speed: 1.0, fwd: -1, side: 0, look: { ...CRS, visorDown: true } },
    { name: 'pas de côté', speed: 1.0, fwd: 0, side: 1, look: { ...CRS, visorDown: true } },
    { name: 'accroupi', speed: 1.0, fwd: 1, side: 0, setup: (p) => { p.posture = 'crouch'; } },
    { name: 'boiterie', speed: 0.9, fwd: 1, side: 0, setup: (p) => { p.injury = 'serious'; } },
    { name: 'menotté, escorté', speed: 1.1, fwd: 1, side: 0, setup: (p) => { p.custody = 'escorted'; } },
  ];
  const sp = 1.5;
  const walkers: { p: Person; lane: typeof lanes[number]; x0: number }[] = [];
  lanes.forEach((lane, i) => {
    const z = (i - (lanes.length - 1) / 2) * sp;
    // profil : les personnages se déplacent vers +X (cap π/2), la caméra regarde depuis +Z
    const p = makePerson(-2, z, Math.PI / 2, lane.look ?? { ...civilLook(), headgear: 'none', backpack: false });
    lane.setup?.(p);
    walkers.push({ p, lane, x0: -2 });
    label(lane.name, -3.4, z + 0.3);
  });
  camera.fov = 26;
  camera.updateProjectionMatrix();
  camera.position.set(0.0, 6.5, 15);
  camera.lookAt(0.0, 0.6, 0.4);
  setShadowArea(0, 0, 9);
  tick = (_t, dt) => {
    for (const w of walkers) {
      const p = w.p;
      // direction du mouvement dans le monde : +X ; le cap dépend du sens voulu (avant, arrière, côté)
      const h = w.lane.side !== 0 ? 0 : w.lane.fwd > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.heading = h;
      p.aimYaw = h;
      p.vx = w.lane.speed; p.vz = 0;
      p.x += w.lane.speed * dt;
      if (p.x > 2.6) p.x -= 5.2;       // retour au départ (téléportation : ignorée par l'animation)
    }
  };
}

function viewCrowd(): void {
  const n = parseInt(params.get('n') ?? '1500', 10);
  const walkers: Person[] = [];
  const halfW = 13, len = 150;
  const nPolice = Math.round(n * 0.1), nPress = Math.round(n * 0.02), nMedic = Math.round(n * 0.015);
  const nProt = n - nPolice - nPress - nMedic;
  for (let i = 0; i < nProt; i++) {
    const r = rnd();
    const look = civilLook();
    let item = '';
    let upper = 'none';
    if (r < 0.10) { look.outfit = 'black_bloc'; look.headgear = 'capuche'; look.faceCover = true; }
    else if (r < 0.24) { look.outfit = 'gilet_fluo'; }
    else if (r < 0.40) { look.outfit = 'syndical'; look.vest = pick([0xc8161d, 0xe07a1f, 0x2a61b8, 0x2f7d3e]); }
    const q = rnd();
    if (q < 0.10) { item = 'pancarte'; upper = 'carry_sign'; }
    else if (q < 0.15) { item = 'drapeau'; upper = 'carry_sign'; }
    else if (q < 0.19) { item = 'telephone'; upper = 'film'; }
    else if (q < 0.27) { upper = 'fist'; }
    else if (q < 0.31) { upper = 'clap'; }
    else if (q < 0.33) { item = 'megaphone'; upper = 'megaphone'; }
    else if (q < 0.35) { item = 'parapluie'; upper = 'umbrella'; }
    const p = makePerson((rnd() * 2 - 1) * halfW, -rnd() * len, 0, look, item);
    p.upper = upper;
    p.speedWalk = 1.0 + rnd() * 0.5;
    walkers.push(p);
  }
  // rang de banderoles en tête de cortège
  for (let i = 0; i < 12; i++) {
    const p = walkers[i];
    p.x = -halfW + 1.2 + i * 2.1; p.z = 1.5; p.speedWalk = 1.15;
    p.inventory = [{ id: 'banderole', count: 1, state: 1, cooldown: 0 }]; p.active = 0; p.upper = 'carry_banner';
  }
  for (let i = 0; i < nPress; i++) {
    const p = makePerson((rnd() * 2 - 1) * halfW, 4 - rnd() * 30, 0, { ...civilLook(), outfit: 'presse', headgear: 'casque_presse', backText: 'PRESSE' }, rnd() < 0.5 ? 'appareil_photo' : 'camera_tv');
    p.upper = rnd() < 0.5 ? 'photo' : 'film';
    p.speedWalk = 1.2;
    walkers.push(p);
  }
  for (let i = 0; i < nMedic; i++) {
    const p = makePerson((rnd() * 2 - 1) * halfW, -rnd() * len, 0, { ...civilLook(), outfit: 'street_medic', headgear: 'casque_medic', backpack: true });
    p.speedWalk = 1.2;
    walkers.push(p);
  }
  // unités de CRS : colonnes de part et d'autre du cortège, qui marchent avec lui
  for (let i = 0; i < nPolice; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const shield = row % 3 !== 2;
    const gend = side > 0 && row % 9 > 5;
    const look: Partial<PersonLook> = gend
      ? { outfit: 'gendarme_mo', headgear: 'casque_gendarme', backText: 'GENDARMERIE', visorDown: true, height: 1.74 + rnd() * 0.16, build: 1 + rnd() * 0.15, skin: pick(SKINS) }
      : { ...CRS, visorDown: rnd() < 0.7, gasMask: rnd() < 0.2, height: 1.74 + rnd() * 0.16, build: 1 + rnd() * 0.15, skin: pick(SKINS) };
    const p = makePerson(side * (halfW + 2.2 + (row % 2) * 0.9), 6 - row * 1.6, 0, look, shield ? 'bouclier' : pick(['lbd40', 'lanceur_cougar', 'baton', 'gazeuse']));
    p.upper = shield ? 'shield_carry' : 'none';
    p.speedWalk = 1.25;
    walkers.push(p);
  }
  scene.fog = new THREE.Fog(0xb4c6d8, 80, 380);
  const cam = params.get('cam') ?? 'haut';
  camera.fov = 50;
  camera.updateProjectionMatrix();
  if (cam === 'sol') { camera.position.set(-3.5, 1.7, 13); camera.lookAt(1, 1.2, -20); }
  else if (cam === 'cote') { camera.position.set(-22, 5, -6); camera.lookAt(0, 1, -22); }
  else { camera.position.set(2, 13, 22); camera.lookAt(0, 0, -42); }
  setShadowArea(0, 0, 26);
  const camZ0 = camera.position.z;
  let travelled = 0;
  tick = (_t, dt) => {
    // le cortège avance vers +Z ; la caméra l'accompagne ; ceux qui sortent du champ repartent en queue
    travelled += 1.2 * dt;
    camera.position.z = camZ0 + travelled;
    sun.position.z = 7 + travelled; sun.target.position.z = travelled;
    for (let i = 0; i < walkers.length; i++) {
      const p = walkers[i];
      const v = p.speedWalk;
      p.vz = v; p.vx = 0;
      p.z += v * dt;
      if (p.z > travelled + 14) p.z -= len;
      else if (p.z < travelled - len) p.z += len;
    }
  };
}

function viewFps(): void {
  const item = params.get('objet') ?? 'baton';
  const me = makePerson(0, 0, 0, { ...CRS, visorDown: false }, item === 'aucun' ? '' : item);
  me.isPlayer = true;
  me.upper = params.get('anim') ?? 'none';
  me.alt = params.get('alt') === '1';
  playerState.personId = me.id;
  playerState.cameraMode = 'fps';
  // une ligne de manifestants en face, quelques collègues sur les côtés
  for (let i = 0; i < 14; i++) {
    const look = civilLook();
    if (i % 4 === 0) { look.outfit = 'black_bloc'; look.headgear = 'capuche'; look.faceCover = true; }
    const p = makePerson(-6 + i * 0.95 + rnd() * 0.3, 7 + rnd() * 2.5, Math.PI, look, i % 5 === 1 ? 'pancarte' : i % 5 === 3 ? 'pave' : '');
    p.upper = i % 5 === 1 ? 'carry_sign' : i % 3 === 0 ? 'fist' : 'none';
  }
  for (const sx of [-1.1, 1.1, -2.2, 2.2]) {
    const p = makePerson(sx, 0.2, 0, { ...CRS, visorDown: true }, 'bouclier');
    p.upper = 'shield_carry';
  }
  camera.fov = 70;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  const eye = 1.75 * (me.look.height / 1.75) * 0.94;
  const pitch = parseFloat(params.get('site') ?? '-0.06');
  camera.position.set(0, eye, 0.08);
  camera.rotation.set(pitch, Math.PI, 0, 'YXZ');
  setShadowArea(0, 4, 12);
  const walk = params.get('marche') === '1';
  tick = (t, dt) => {
    me.upperT = fixedT >= 0 ? fixedT : t % 1.4;
    if (walk) { me.z += 1.4 * dt; me.vz = 1.4; camera.position.z = me.z + 0.08; }
  };
  (window as unknown as Record<string, unknown>).__fp = (o: { objet?: string; anim?: string; alt?: boolean; t?: number }) => {
    if (o.objet !== undefined) { me.inventory = o.objet ? [{ id: o.objet, count: 1, state: 1, cooldown: 0 }] : []; me.active = o.objet ? 0 : -1; }
    if (o.anim !== undefined) me.upper = o.anim;
    if (o.alt !== undefined) me.alt = o.alt;
    if (o.t !== undefined) { fpT = o.t; }
  };
  let fpT = -1;
  const base = tick;
  tick = (t, dt) => { base(t, dt); if (fpT >= 0) me.upperT = fpT; };
}

// ── boucle ────────────────────────────────────────────────────────────────────────────
const systems: GameSystem[] = createSystems();
for (const s of systems) s.provide?.(ctx);
for (const s of systems) void s.init?.(ctx);
const api = ctx.service<PeopleRenderApi>('peopleRender')!;

switch (view) {
  case 'poses': viewPoses(); break;
  case 'detail': viewDetail(); break;
  case 'marche': viewWalk(); break;
  case 'foule': viewCrowd(); break;
  case 'fps': viewFps(); break;
  default: viewOutfits(); break;
}

const hud = document.getElementById('hud')!;
const win = window as unknown as Record<string, unknown>;
let frames = 0;
let last = performance.now();
let simT = 0;
let frameMsAvg = 0;
const step = params.has('pas') ? parseFloat(params.get('pas')!) : 0;
function loop(): void {
  const nowMs = performance.now();
  let dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  if (step > 0) dt = step;             // pas fixe : animation déterministe malgré la lenteur du WebGL logiciel
  simT += dt;
  clock.now = simT; clock.dt = dt; clock.tick++;
  tick(simT, dt);
  const t0 = performance.now();
  for (const s of systems) s.frame?.(dt);
  const cpu = performance.now() - t0;
  renderer.info.reset();
  renderer.render(scene, camera);
  placeLabels();
  frames++;
  const frameMs = performance.now() - nowMs;
  frameMsAvg = frameMsAvg === 0 ? frameMs : frameMsAvg * 0.9 + frameMs * 0.1;
  const st = api.stats;
  const info = { frames, people: people.length, near: st.near, mid: st.mid, far: st.far, items: st.items, posed: st.posed,
    cpuMs: cpu, cpuMsAvg: st.cpuMsAvg, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: frameMsAvg };
  win.__info = info;
  win.__frames = frames;
  if (frames > 3) win.__ready = true;
  if (view === 'foule' || params.has('hud')) {
    hud.textContent = `Personnes : ${people.length}  (proches ${st.near} · moyennes ${st.mid} · lointaines ${st.far})\n`
      + `Objets tenus : ${st.items} · poses recalculées : ${st.posed}\n`
      + `CPU personnages : ${st.cpuMsAvg.toFixed(2)} ms/image\n`
      + `Appels de dessin (scène entière) : ${info.calls} · triangles : ${info.triangles}\n`
      + `Image complète : ${frameMsAvg.toFixed(0)} ms (WebGL ${String(renderer.getContext().getParameter(renderer.getContext().VERSION)).slice(0, 12)})`;
  } else {
    hud.style.display = 'none';
  }
}
renderer.info.autoReset = false;
renderer.setAnimationLoop(loop);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
win.__ctx = ctx;
win.__people = people;
win.__camera = camera;
win.__api = api;
