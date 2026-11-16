// Banc d'essai des effets visuels (src/render/fx). Le module est branché comme dans le jeu
// (Game → provide → init → update → frame) ; tout le reste est factice et tient dans ce fichier :
// renderer et décor, champ de dangers (gaz et fumée advectés par le vent, feux), projectiles
// balistiques, réserve de lumières. Les effets sont demandés par les VRAIS événements du contrat
// ('fx', 'explosion', 'projectile:impact') et par l'état des magasins du cœur (burning, projectiles).
//
// Paramètres d'URL : scene=gaz|feu|salve|mortier|jet|barricade|divers|dessus ; nuit=1 ;
// qualite=bas|moyen|haut|ultra ; t=secondes simulées avant la première image ; vent=x,z ; pas=0.0333 ;
// cam=x,y,z,ciblex,cibley,ciblez ; aide=0.
import * as THREE from 'three';
import { SystemOrder } from '@/core/contracts';
import type { GameContext, GameSystem, Projectile, QualityLevel, RayHit, ViewApi, WorldQuery } from '@/core/contracts';
import { Game } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';
import { createSystems } from '@/render/fx/index';
import type { FxDynamicLight, FxFireView, FxHazardField, FxLightsApi, FxRenderApi } from '@/render/fx/index';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number): number => { const v = params.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v); };
const sceneName = params.get('scene') ?? 'gaz';
const quality = (params.get('qualite') ?? 'haut') as QualityLevel;
const night = params.get('nuit') === '1';
const STEP = num('pas', 1 / 30);
if (params.get('aide') === '0') document.getElementById('aide')!.hidden = true;
const W = window as unknown as Record<string, unknown>;

// ───────────────────────────── rendu et décor ─────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'bas', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(num('fov', 58), window.innerWidth / window.innerHeight, 0.1, 1500);
const world = new THREE.Group();
scene.add(world);
const sun = new THREE.DirectionalLight(0xffffff, 3);
const hemi = new THREE.HemisphereLight(0xbcd2f0, 0x4a4640, 1);
scene.add(sun, sun.target, hemi);

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}
let seedState = 12345;
const rnd = (): number => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };

// sol : chaussée le long de x (z de −7 à 7), trottoirs jusqu'à ±11, placette côté caméra
const groundTex = canvasTexture(2048, 1024, (c) => {
  const sx = 2048 / 240, sz = 1024 / 120; // 240 m × 120 m, centre (0, 0)
  c.fillStyle = '#8f8b84'; c.fillRect(0, 0, 2048, 1024);                               // dalles de la placette
  c.fillStyle = '#9a968f'; c.fillRect(0, (60 - 11) * sz, 2048, 22 * sz);              // trottoirs
  c.fillStyle = '#3d3e41'; c.fillRect(0, (60 - 7) * sz, 2048, 14 * sz);               // bitume
  for (let i = 0; i < 9000; i++) {                                                     // grain
    const g = 40 + Math.floor(rnd() * 40);
    c.fillStyle = `rgba(${g},${g},${g + 2},0.35)`;
    c.fillRect(rnd() * 2048, (60 - 7) * sz + rnd() * 14 * sz, 2, 2);
  }
  c.fillStyle = '#d9d6cc';
  for (let x = -118; x < 120; x += 6) c.fillRect((x + 120) * sx, 60 * sz - 1, 3 * sx, 2);  // axe
  for (let k = 0; k < 7; k++) c.fillRect((-3 + 120) * sx, (60 - 6.2 + k * 1.9) * sz, 4 * sx, 0.9 * sz); // passage piéton
  c.strokeStyle = 'rgba(60,58,54,0.5)'; c.lineWidth = 1;
  for (let x = 0; x < 240; x += 1.5) { c.beginPath(); c.moveTo(x * sx, 0); c.lineTo(x * sx, (60 - 7) * sz); c.moveTo(x * sx, (60 + 7) * sz); c.lineTo(x * sx, 1024); c.stroke(); }
  c.fillStyle = '#6f6c66'; c.fillRect(0, (60 - 7.15) * sz, 2048, 0.3 * sz); c.fillRect(0, (60 + 6.85) * sz, 2048, 0.3 * sz); // bordures
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94 }));
ground.rotation.x = -Math.PI / 2;
world.add(ground);

// façades : pierre de Paris, fenêtres, rez-de-chaussée commerçant, toit de zinc
function facadeTexture(tone: string, shop: string): THREE.CanvasTexture {
  return canvasTexture(512, 512, (c) => {
    c.fillStyle = tone; c.fillRect(0, 0, 512, 512);
    c.fillStyle = shop; c.fillRect(0, 512 - 92, 512, 92);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let f = 0; f < 5; f++) c.fillRect(0, 512 - 92 - f * 84 - 6, 512, 6);
    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < 6; i++) {
        const x = 26 + i * 82, y = 512 - 92 - (f + 1) * 84 + 14;
        c.fillStyle = '#2a3038'; c.fillRect(x, y, 34, 56);
        c.fillStyle = 'rgba(190,205,220,0.35)'; c.fillRect(x + 2, y + 2, 14, 52);
        c.fillStyle = '#1c1c1e'; c.fillRect(x - 4, y + 54, 42, 4);
      }
    }
    c.fillStyle = '#10161c';
    for (let i = 0; i < 3; i++) c.fillRect(20 + i * 170, 512 - 80, 130, 68);
    c.fillStyle = 'rgba(160,190,205,0.25)';
    for (let i = 0; i < 3; i++) c.fillRect(24 + i * 170, 512 - 76, 60, 60);
  });
}
const facades = [facadeTexture('#d9cfb8', '#3a2f2a'), facadeTexture('#cfc4aa', '#22313a'), facadeTexture('#e2d8c2', '#402a2a')];
const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c6670, roughness: 0.6 });
interface Block { x0: number; x1: number; z0: number; z1: number; h: number }
const blocks: Block[] = [];
function building(x0: number, x1: number, zFront: number, depth: number, h: number, k: number): void {
  const z0 = depth > 0 ? zFront : zFront + depth;
  const z1 = depth > 0 ? zFront + depth : zFront;
  const tex = facades[k % facades.length]!.clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round((x1 - x0) / 16)), 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const side = new THREE.MeshStandardMaterial({ map: facades[k % facades.length]!, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, Math.abs(depth)), [side, side, roofMat, roofMat, mat, mat]);
  m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  world.add(m);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 1.2, 2.2, Math.abs(depth) - 1.2), roofMat);
  roof.position.set((x0 + x1) / 2, h + 1.1, (z0 + z1) / 2);
  world.add(roof);
  blocks.push({ x0, x1, z0, z1, h });
}
{
  let x = -96;
  let k = 0;
  while (x < 96) { const w = 14 + (k % 3) * 4; building(x, x + w, -11, -14, 19 + (k * 7) % 5, k); x += w; k++; }
  x = -96;
  while (x < -24) { const w = 16 + (k % 2) * 6; building(x, Math.min(-24, x + w), 11, 14, 20 + (k * 5) % 4, k); x += w; k++; }
  x = 36;
  while (x < 96) { const w = 16 + (k % 2) * 6; building(x, x + w, 11, 14, 20 + (k * 5) % 4, k); x += w; k++; }
}
const inBlock = (x: number, z: number): Block | null => {
  for (const b of blocks) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
};

// silhouettes : ligne de CRS et manifestants (cylindre + tête), pour l'échelle
function crowd(count: number, color: number, place: (i: number, out: THREE.Vector3) => void): void {
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 1.5, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), count);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    place(i, v);
    m.makeTranslation(v.x, 0.75, v.z); body.setMatrixAt(i, m);
    m.makeTranslation(v.x, 1.64, v.z); head.setMatrixAt(i, m);
    if (color === 0) c.setHSL(rnd(), 0.25 + rnd() * 0.3, 0.2 + rnd() * 0.3); else c.setHex(color);
    body.setColorAt(i, c);
    head.setColorAt(i, color === 0 ? c.setHex(0x202022) : c.setHex(0x0f1420));
  }
  world.add(body, head);
}
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rough = 0.8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
  m.position.set(x, y, z); m.rotation.y = ry;
  world.add(m);
  return m;
}
function cyl(r: number, h: number, color: number, x: number, z: number): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  m.position.set(x, h / 2, z);
  world.add(m);
}
/** Voiture schématique dont le grand axe suit le cap (repère du contrat : avant = (sin h, cos h)). */
function car(x: number, z: number, heading: number, color: number, len = 4.4, wid = 1.8, hgt = 1.45): void {
  box(wid, hgt * 0.55, len, color, x, hgt * 0.36, z, heading, 0.5);
  box(wid * 0.9, hgt * 0.45, len * 0.52, color, x - Math.sin(heading) * 0.2, hgt * 0.8, z - Math.cos(heading) * 0.2, heading, 0.4);
}

// ───────────────────────────── champ de dangers factice ─────────────────────────────
/** Grille de 2 m : gaz et fumée advectés par le vent (semi-lagrangien), diffusion, dilution, bâti étanche. */
class FakeField implements FxHazardField {
  readonly cellSize = 2;
  revision = 0;
  readonly fires: FxFireView[] = [];
  driftX = 0;
  driftZ = 0;
  windX = 0;
  windZ = 0;
  private readonly x0 = -96;
  private readonly z0 = -30;
  private readonly nx = 96;
  private readonly nz = 40;
  private gas = new Float32Array(96 * 40);
  private smoke = new Float32Array(96 * 40);
  private tmp = new Float32Array(96 * 40);
  private tmp2 = new Float32Array(96 * 40);
  private readonly color = new Int32Array(96 * 40);
  private readonly solid = new Uint8Array(96 * 40);
  private acc = 0;

  constructor() {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      if (inBlock(this.x0 + (i + 0.5) * 2, this.z0 + (j + 0.5) * 2)) this.solid[j * this.nx + i] = 1;
    }
  }
  private deposit(f: Float32Array, x: number, z: number, amount: number, radius: number, color: number): void {
    const r = Math.max(2, radius);
    const i0 = Math.floor((x - r - this.x0) / 2), i1 = Math.ceil((x + r - this.x0) / 2);
    const j0 = Math.floor((z - r - this.z0) / 2), j1 = Math.ceil((z + r - this.z0) / 2);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      const k = j * this.nx + i;
      if (this.solid[k]) continue;
      const dx = this.x0 + (i + 0.5) * 2 - x, dz = this.z0 + (j + 0.5) * 2 - z;
      const q = 1 - (dx * dx + dz * dz) / (r * r);
      if (q <= 0) continue;
      f[k] = Math.min(2.5, f[k]! + amount * q * q);
      if (f === this.smoke) this.color[k] = color;
    }
  }
  emitGas(x: number, z: number, amount: number, radius: number): void { this.deposit(this.gas, x, z, amount, radius, 0); this.revision++; }
  emitSmoke(x: number, z: number, amount: number, radius: number, color: number): void { this.deposit(this.smoke, x, z, amount, radius, color); this.revision++; }
  private sample(f: Float32Array, fx: number, fz: number): number {
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return 0;
    const tx = fx - i, tz = fz - j, k = j * this.nx + i;
    return (f[k]! * (1 - tx) + f[k + 1]! * tx) * (1 - tz) + (f[k + this.nx]! * (1 - tx) + f[k + this.nx + 1]! * tx) * tz;
  }
  private transport(src: Float32Array, dst: Float32Array, dt: number, decay: number): void {
    const ox = (this.driftX * dt) / 2, oz = (this.driftZ * dt) / 2;
    const nx = this.nx;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (this.solid[k]) { dst[k] = 0; continue; }
      let v = this.sample(src, i - ox, j - oz);
      // diffusion : moyenne avec les quatre voisines libres
      let s = 0, n = 0;
      if (i > 0 && !this.solid[k - 1]) { s += src[k - 1]!; n++; }
      if (i < nx - 1 && !this.solid[k + 1]) { s += src[k + 1]!; n++; }
      if (j > 0 && !this.solid[k - nx]) { s += src[k - nx]!; n++; }
      if (j < this.nz - 1 && !this.solid[k + nx]) { s += src[k + nx]!; n++; }
      if (n > 0) v += (s / n - v) * 0.09;
      dst[k] = v * (1 - decay * dt);
      if (dst[k]! < 0.002) dst[k] = 0;
    }
  }
  step(dt: number): void {
    this.driftX = this.windX * 0.8; this.driftZ = this.windZ * 0.8;
    this.acc += dt;
    while (this.acc >= 0.1) {
      this.acc -= 0.1;
      this.transport(this.gas, this.tmp, 0.1, 1 / 60 + 0.01 * Math.hypot(this.windX, this.windZ));
      [this.gas, this.tmp] = [this.tmp, this.gas];
      this.transport(this.smoke, this.tmp2, 0.1, 1 / 40);
      [this.smoke, this.tmp2] = [this.tmp2, this.smoke];
      // la couleur de la fumée suit le vent (cellule amont)
      this.revision++;
    }
  }
  forEachActiveCell(cb: (x: number, z: number, gas: number, smoke: number, color: number) => void, min = 0.01): number {
    let n = 0;
    for (let k = 0; k < this.gas.length; k++) {
      const g = this.gas[k]!, s = this.smoke[k]!;
      if (g < min && s < min) continue;
      cb(this.x0 + ((k % this.nx) + 0.5) * 2, this.z0 + (Math.floor(k / this.nx) + 0.5) * 2, g, s, s > 0 ? this.color[k] || 0x141414 : 0);
      n++;
    }
    return n;
  }
  collectActiveCells(out: Float32Array, min = 0.01, cx?: number, cz?: number, radius?: number): number {
    let n = 0;
    const max = Math.floor(out.length / 5);
    const r2 = radius && radius > 0 ? (radius + 16) * (radius + 16) : Infinity;
    for (let k = 0; k < this.gas.length && n < max; k++) {
      const g = this.gas[k]!, s = this.smoke[k]!;
      if (g < min && s < min) continue;
      const x = this.x0 + ((k % this.nx) + 0.5) * 2, z = this.z0 + (Math.floor(k / this.nx) + 0.5) * 2;
      if (cx !== undefined && cz !== undefined && (x - cx) * (x - cx) + (z - cz) * (z - cz) > r2) continue;
      const o = n * 5;
      out[o] = x; out[o + 1] = z; out[o + 2] = g; out[o + 3] = s; out[o + 4] = s > 0 ? this.color[k] || 0x141414 : 0;
      n++;
    }
    return n;
  }
  ignite(x: number, z: number, radius: number, intensity: number): { id: number; x: number; z: number; radius: number; intensity: number; age: number } {
    const f = { id: this.fires.length + 1, x, z, radius, intensity, age: 0 };
    this.fires.push(f);
    this.revision++;
    return f;
  }
}

// ───────────────────────────── réserve de lumières factice ─────────────────────────────
class FakeLights implements FxLightsApi {
  private readonly real: THREE.PointLight[] = [];
  private readonly virtuals: (FxDynamicLight & { life: number; total: number; base: number; alive: boolean })[] = [];
  constructor(count: number) {
    for (let i = 0; i < count; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.position.set(0, -100, 0); scene.add(l); this.real.push(l); }
  }
  point(init?: Partial<FxDynamicLight>): FxDynamicLight {
    const v = { x: 0, y: 0, z: 0, color: 0xffffff, intensity: 0, range: 10, priority: 0, enabled: true, flicker: 0, life: 0, total: 0, base: 0, alive: true,
      release: (): void => { v.alive = false; } };
    if (init) Object.assign(v, init);
    this.virtuals.push(v);
    return v;
  }
  flash(x: number, y: number, z: number, color: number, intensity: number, range: number, seconds: number): void {
    const v = this.point({ x, y, z, color, intensity, range, priority: 1 }) as FxDynamicLight & { life: number; total: number; base: number };
    v.life = seconds; v.total = seconds; v.base = intensity;
  }
  get count(): number { return this.virtuals.length; }
  update(dt: number, cam: THREE.Vector3): void {
    for (let i = this.virtuals.length - 1; i >= 0; i--) {
      const v = this.virtuals[i]!;
      if (v.total > 0) { v.life -= dt; if (v.life <= 0) v.alive = false; else v.intensity = v.base * (v.life / v.total) ** 2; }
      if (!v.alive) this.virtuals.splice(i, 1);
    }
    // sélection directe des plus importantes (sans allocation : les mesures du module ne doivent pas subir le ramasse-miettes du banc)
    for (const v of this.virtuals) (v as { taken?: boolean }).taken = false;
    for (let i = 0; i < this.real.length; i++) {
      const l = this.real[i]!;
      let best: (typeof this.virtuals)[number] | null = null;
      let bestS = 0;
      for (const v of this.virtuals) {
        if (!v.enabled || !(v.intensity > 0) || (v as { taken?: boolean }).taken) continue;
        const sc = (v.intensity * v.range) / ((v.x - cam.x) ** 2 + (v.y - cam.y) ** 2 + (v.z - cam.z) ** 2 + 20);
        if (sc > bestS) { bestS = sc; best = v; }
      }
      if (!best) { l.intensity = 0; continue; }
      (best as { taken?: boolean }).taken = true;
      l.position.set(best.x, best.y, best.z); l.color.setHex(best.color); l.intensity = best.intensity; l.distance = best.range;
    }
  }
}

// ───────────────────────────── jeu, vue factice, système du banc ─────────────────────────────
const game = new Game({ headless: false, storage: null });
const ctx: GameContext = game.ctx;
ctx.settings.set('quality', quality);
ctx.settings.set('violence', 'realiste');
const field = new FakeField();
const fakeLights = new FakeLights(quality === 'bas' ? 2 : 6);
const shake = { amount: 0, seconds: 0, total: 0 };
const view: ViewApi = {
  renderer, scene, camera, world, quality, drawDistance: 500,
  get camX() { return camera.position.x; }, get camY() { return camera.position.y; }, get camZ() { return camera.position.z; },
  shake(amount: number, seconds: number): void { if (amount > shake.amount) { shake.amount = amount; shake.seconds = seconds; shake.total = seconds; } W.__shakes = ((W.__shakes as number) ?? 0) + 1; },
  setScreenEffect(): void { /* sans objet ici */ },
};
// monde factice : sol plat, façades des blocs pour les décalques muraux
const baseWorld = ctx.world;
const fakeWorld: WorldQuery = Object.create(baseWorld) as WorldQuery;
fakeWorld.buildingHeightAt = (x: number, z: number): number => inBlock(x, z)?.h ?? 0;
fakeWorld.raycast = (ax: number, az: number, bx: number, bz: number, out: RayHit): boolean => {
  let best = 2;
  for (const b of blocks) {
    // entrée du segment dans la boîte (méthode des dalles)
    let t0 = 0, t1 = 1, nx = 0, nz = 0;
    const dx = bx - ax, dz = bz - az;
    let ok = true;
    for (let axis = 0; axis < 2 && ok; axis++) {
      const o = axis === 0 ? ax : az, d = axis === 0 ? dx : dz, lo = axis === 0 ? b.x0 : b.z0, hi = axis === 0 ? b.x1 : b.z1;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d, sign = -1;
      if (ta > tb) { const s = ta; ta = tb; tb = s; sign = 1; }
      if (ta > t0) { t0 = ta; nx = axis === 0 ? sign : 0; nz = axis === 1 ? sign : 0; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok && t0 > 0 && t0 < best) { best = t0; out.hit = true; out.t = t0; out.x = ax + dx * t0; out.z = az + dz * t0; out.nx = nx; out.nz = nz; out.kind = 'building'; out.height = b.h; }
  }
  return best <= 1;
};

let simTime = 0;
type Script = (t: number, dt: number) => void;
let script: Script = () => {};
const palets = new Map<number, number>(); // id → instant d'extinction

function emitFx(id: string, x: number, y: number, z: number, o: { size?: number; dirX?: number; dirY?: number; dirZ?: number; color?: number; seconds?: number } = {}): void {
  ctx.events.emit('fx', { id, x, y, z, ...o });
}
function spawn(kind: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, fuse = Infinity, color = 0): Projectile {
  const p = ctx.projectiles.spawn(kind, 0, x, y, z, vx, vy, vz);
  p.fuse = fuse;
  if (color) p.data = { color };
  return p;
}
/** Vitesse de lancer pour atteindre (tx, tz) en `flight` secondes depuis (x, y, z). */
function lob(kind: string, x: number, y: number, z: number, tx: number, tz: number, flight: number, fuse = Infinity, color = 0): Projectile {
  return spawn(kind, x, y, z, (tx - x) / flight, (0 - y) / flight + 0.5 * 9.81 * flight, (tz - z) / flight, fuse, color);
}
function simProjectiles(dt: number): void {
  const list = ctx.projectiles.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.age += dt;
    if (!p.resting) {
      p.vy -= 9.81 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.spin += dt * 11;
      if (p.y <= 0.03 && p.vy < 0) {
        p.y = 0.03;
        ctx.events.emit('projectile:impact', { id: p.id, kind: p.kind, ownerId: 0, x: p.x, y: p.y, z: p.z, hitKind: 'ground', hitId: 0 });
        if (p.kind === 'molotov') {
          emitFx('eclats_verre', p.x, 0.1, p.z, { size: 0.5 });
          emitFx('feu', p.x, 0.1, p.z, { size: 2.5, seconds: 2 });
          emitFx('trace_brulure', p.x, 0, p.z, { size: 1.9 });
          ctx.events.emit('explosion', { kind: 'molotov', x: p.x, y: 0.1, z: p.z, radius: 1.25, sourceId: 0 });
          field.ignite(p.x, p.z, 1.25, 1);
          ctx.projectiles.remove(p.id);
          continue;
        }
        if (p.kind === 'bouteille') { emitFx('eclats_verre', p.x, 0.1, p.z, { size: 0.6 }); ctx.projectiles.remove(p.id); continue; }
        if (p.kind === 'mortier') { p.fuse = 0; }
        else if (Math.abs(p.vy) > 2.2) { p.vy = -p.vy * 0.35; p.vx *= 0.55; p.vz *= 0.55; }
        else { p.resting = true; p.vx = 0; p.vy = 0; p.vz = 0; }
      }
    }
    if (p.kind === 'palet_lacrymo' && p.emitting) {
      field.emitGas(p.x, p.z, 0.25 * dt, 2.5);
      if (simTime > (palets.get(p.id) ?? 0)) { p.emitting = false; p.fuse = 6; }
    }
    if (p.kind === 'fumigene' && p.emitting) field.emitSmoke(p.x, p.z, 0.5 * dt, 2.5, (p.data as { color: number }).color);
    p.fuse -= dt;
    if (p.fuse > 0) continue;
    switch (p.kind) {
      case 'grenade_lacrymo_56': case 'grenade_lacrymo_main': {
        ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: 1, sourceId: 0 });
        emitFx('gaz', p.x, p.y, p.z, { size: 2, seconds: 2 });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rnd();
          const v = 2.5 + rnd() * 3.5;
          const q = spawn('palet_lacrymo', p.x, p.y, p.z, p.vx * 0.4 + Math.cos(a) * v, p.vy * 0.3 + 1 + rnd() * 2, p.vz * 0.4 + Math.sin(a) * v);
          q.emitting = true;
          palets.set(q.id, simTime + 30);
        }
        ctx.projectiles.remove(p.id);
        break;
      }
      case 'mortier': {
        const color = (p.data as { color: number } | null)?.color ?? 0xffd60a;
        ctx.events.emit('explosion', { kind: 'mortier', x: p.x, y: p.y, z: p.z, radius: 3, sourceId: 0 });
        emitFx('feu_artifice', p.x, p.y, p.z, { size: 3, color, seconds: 1.2 });
        emitFx('etincelles', p.x, p.y, p.z, { size: 2, color, seconds: 0.8 });
        ctx.projectiles.remove(p.id);
        break;
      }
      case 'fusee_rouge':
        ctx.events.emit('explosion', { kind: 'fusee_rouge', x: p.x, y: p.y, z: p.z, radius: 0, sourceId: 0 });
        emitFx('feu_artifice', p.x, p.y, p.z, { size: 6, color: 0xff2a1a, seconds: 6 });
        ctx.projectiles.remove(p.id);
        break;
      case 'gm2l':
        ctx.events.emit('explosion', { kind: 'gm2l', x: p.x, y: p.y, z: p.z, radius: 10, sourceId: 0 });
        emitFx('explosion', p.x, p.y, p.z, { size: 2 });
        emitFx('flash', p.x, p.y + 0.3, p.z, { size: 3, color: 0xffffff, seconds: 0.15 });
        emitFx('gaz', p.x, p.y, p.z, { size: 5, seconds: 4 });
        field.emitGas(p.x, p.z, 1.2, 5);
        ctx.projectiles.remove(p.id);
        break;
      case 'desencerclement':
        ctx.events.emit('explosion', { kind: 'desencerclement', x: p.x, y: p.y, z: p.z, radius: 7, sourceId: 0 });
        emitFx('explosion', p.x, p.y, p.z, { size: 1.5 });
        emitFx('flash', p.x, p.y + 0.3, p.z, { size: 2.5, color: 0xffffff, seconds: 0.12 });
        for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; spawn('plot_caoutchouc', p.x, 0.3, p.z, Math.cos(a) * 14, 1.5, Math.sin(a) * 14, 1.2); }
        ctx.projectiles.remove(p.id);
        break;
      default:
        ctx.projectiles.remove(p.id);
        break;
    }
  }
}

const bench: GameSystem = {
  id: 'banc.fx',
  order: SystemOrder.HAZARDS,
  provide(c: GameContext): void {
    c.view = view;
    c.world = fakeWorld;
    c.provide<FxHazardField>('hazards.field', field);
    c.provide<FxLightsApi>('render.lights', fakeLights);
  },
  update(dt: number): void {
    simTime += dt;
    script(simTime, dt);
    simProjectiles(dt);
    for (const f of field.fires) (f as { age: number }).age += dt;
    field.step(dt);
  },
};
game.addSystem(bench);
game.addModule(createSystems);
await game.boot();
await ctx.session.start(defaultSessionConfig({ timeOfDay: night ? 22.5 : 15.5, x: 0, z: 0 }));
ctx.env.setTime(night ? 22.5 : 15.5);
const fx = ctx.require<FxRenderApi>('render.fx');

// lumière de la scène d'après l'environnement
{
  const e = ctx.env.state;
  const d = e.daylight;
  sun.position.set(e.sunX * 100, e.sunY * 100, e.sunZ * 100);
  sun.color.setRGB(1, 0.95 - 0.1 * (1 - d), 0.86 - 0.2 * (1 - d));
  if (night) sun.color.setRGB(0.55, 0.65, 0.9);
  sun.intensity = night ? 0.12 : 3.1 * d;
  hemi.color.setRGB(0.62, 0.74, 0.95);
  hemi.groundColor.setRGB(0.3, 0.28, 0.25);
  hemi.intensity = night ? 0.1 : 0.95;
  scene.background = new THREE.Color(night ? 0x070a12 : 0x9db9da);
  scene.fog = new THREE.FogExp2(night ? 0x070a12 : 0xa9bfd6, night ? 0.0035 : 0.0022);
  if (night) {
    // candélabres : quelques points chauds le long de la rue
    for (let x = -75; x <= 75; x += 30) {
      const l = new THREE.PointLight(0xffc98a, 60, 26, 2);
      l.position.set(x, 7.5, -7.6);
      scene.add(l);
      box(0.14, 7.5, 0.14, 0x23262a, x, 3.75, -7.6);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
      lamp.position.set(x, 7.6, -7.6);
      world.add(lamp);
    }
  }
}

// ───────────────────────────── scènes ─────────────────────────────
let camPos = new THREE.Vector3(-8, 2.6, 21);
let camTarget = new THREE.Vector3(10, 2.2, -2);
const wind = (params.get('vent') ?? '').split(',').map(Number);
function setWind(x: number, z: number): void {
  const wx = wind.length === 2 && !Number.isNaN(wind[0]!) ? wind[0]! : x;
  const wz = wind.length === 2 && !Number.isNaN(wind[1]!) ? wind[1]! : z;
  ctx.env.setWind(wx, wz);
  field.windX = wx; field.windZ = wz;
}
function burnProp(kind: string, x: number, z: number, heading: number, hx: number, hz: number, h: number): void {
  const p = ctx.props.spawn(kind, x, z, heading);
  p.halfX = hx; p.halfZ = hz; p.height = h;
  p.burning = 1; p.state = 'burning';
}
function policeLine(x: number): void {
  crowd(16, 0x1a2238, (i, v) => v.set(x + (i % 2) * 0.9, 0, -6.5 + Math.floor(i / 2) * 1.75 + (i % 2) * 0.4));
}
function protesters(x: number, n: number): void {
  crowd(n, 0, (_i, v) => v.set(x + rnd() * 16, 0, -6 + rnd() * 12));
}
function smokeFrom(x: number, z: number, rate: number, color = 0x141414): (dt: number) => void {
  return (dt) => field.emitSmoke(x, z, rate * dt, 2.5, color);
}

const scenes: Record<string, () => void> = {
  // rue remplie de gaz sous un vent latéral (de gauche à droite)
  gaz() {
    setWind(1.7, 0.12);
    policeLine(-9);
    protesters(34, 26);
    car(30, -8.4, Math.PI / 2, 0x8a2b2b);
    car(-18, -8.6, Math.PI / 2, 0x2b4a6a);
    // cinq grenades : trente palets tombés sur toute la largeur de la rue
    for (let k = 0; k < 30; k++) {
      const x = 1 + (k * 7.3) % 30 + rnd() * 2;
      const z = -9 + ((k * 5.1) % 18) + rnd();
      const p = spawn('palet_lacrymo', x, 0.03, z, 0, 0, 0);
      p.resting = true; p.emitting = true;
      palets.set(p.id, 1e9);
    }
    if (night) {
      const v = ctx.vehicles.spawn('fourgon_crs', 4, -4.5, Math.PI / 2);
      v.beacons = true;
      box(2.1, 2.5, 5.6, 0xf2f3f5, 4, 1.3, -4.5, Math.PI / 2, 0.4);
    }
    camPos.set(-17, 2.3, 9.2); camTarget.set(8, 2.4, -2.5);
  },
  // poubelles, conteneur et véhicule en feu
  feu() {
    setWind(1.1, 0.35);
    cyl(0.3, 1.0, 0x3d4a3e, 3, -8.2); cyl(0.3, 1.0, 0x3d4a3e, 4.1, -8.4);
    box(1.3, 1.15, 0.8, 0x2f5a3a, 7.2, 0.58, -8.3);
    burnProp('poubelle', 3, -8.2, 0, 0.3, 0.3, 1.0);
    burnProp('poubelle', 4.1, -8.4, 0, 0.3, 0.3, 1.0);
    burnProp('conteneur', 7.2, -8.3, 0, 0.65, 0.4, 1.15);
    car(15, 2.2, Math.PI / 2 + 0.15, 0x1c1b1a);
    const v = ctx.vehicles.spawn('voiture', 15, 2.2, Math.PI / 2 + 0.15);
    v.burning = 1; v.state = 'burning';
    car(-6, -8.5, Math.PI / 2, 0x6f7b86);
    policeLine(-26);
    const s1 = smokeFrom(4, -8.3, 0.25), s2 = smokeFrom(7.2, -8.3, 0.3), s3 = smokeFrom(15, 2.2, 0.5);
    script = (_t, dt) => { s1(dt); s2(dt); s3(dt); };
    camPos.set(-3.5, 2.1, 12.5); camTarget.set(9, 2.6, -3);
  },
  // salve de trente grenades de 56 mm tirées en cloche par la ligne
  salve() {
    setWind(1.6, 0.3);
    policeLine(-44);
    protesters(8, 30);
    let fired = 0;
    script = (t) => {
      while (fired < 30 && t > 0.3 + fired * 0.1) {
        const z0 = -6 + (fired % 8) * 1.7;
        const tx = -8 + ((fired * 37) % 30) * 1.25, tz = -5.5 + ((fired * 53) % 12) * 1.0;
        const flight = 2.6 + (fired % 5) * 0.12;
        const g = lob('grenade_lacrymo_56', -43, 1.6, z0, tx, tz, flight, flight - 0.3);
        emitFx('fumee', g.x, g.y, g.z, { size: 0.5, color: 0xb8b8b8, seconds: 0.8 });
        fired++;
      }
    };
    camPos.set(-22, 5.5, 26); camTarget.set(6, 3.5, -3);
  },
  // tirs de mortier d'artifice à tir tendu, fusée rouge de sommation
  mortier() {
    setWind(0.8, 0.2);
    policeLine(-30);
    protesters(26, 24);
    const colors = [0xff3b30, 0x34c759, 0xffd60a, 0xffffff];
    let fired = 0;
    let flare = false;
    script = (t) => {
      while (fired < 6 && t > 0.2 + fired * 0.62) {
        const c = colors[fired % 4]!;
        const z0 = -4 + fired * 1.6;
        emitFx('etincelles', 26, 1.5, z0, { size: 0.6, color: c, seconds: 0.4 });
        spawn('mortier', 26, 1.5, z0, -34 - fired * 2, 5.5 + (fired % 3) * 2.2, -1 + fired * 0.5, 0.95 + (fired % 3) * 0.12, c);
        fired++;
      }
      if (!flare && t > 0.4) { flare = true; spawn('fusee_rouge', -12, 1.8, 2, 1.2, 30, -0.6, 2.4); }
    };
    camPos.set(2, 1.9, 30); camTarget.set(2, 12, -6);
  },
  // jet du canon à eau sur un feu
  jet() {
    setWind(0.9, 0.2);
    box(2.6, 3.2, 9.6, 0xe9ecef, -24, 1.75, 0.5, Math.PI / 2, 0.45);
    box(2.5, 1.2, 2.4, 0x1d4e89, -27.2, 3.0, 0.5, Math.PI / 2, 0.45);
    box(0.5, 0.4, 0.5, 0x23262a, -21.5, 3.6, 0.5);
    const v = ctx.vehicles.spawn('canon_eau', -24, 0.5, Math.PI / 2);
    v.beacons = true;
    box(1.3, 1.15, 0.8, 0x2f5a3a, 9, 0.58, -1.5); box(1.2, 0.15, 1.0, 0x8a6a3a, 10.6, 0.1, -0.6); box(1.2, 0.15, 1.0, 0x8a6a3a, 10.4, 0.28, -0.9, 0.3);
    burnProp('conteneur', 9, -1.5, 0, 0.65, 0.4, 1.15);
    burnProp('palette', 10.5, -0.75, 0.2, 0.7, 0.6, 0.4);
    const fire = field.ignite(9.6, -1.1, 1.6, 1);
    policeLine(-34);
    const s1 = smokeFrom(9.6, -1.2, 0.35);
    let acc = 0, acc2 = 0;
    const nozzle = { x: -21.2, y: 3.7, z: 0.5 };
    script = (t, dt) => {
      s1(dt);
      if (t < 0.6) return;
      // visée : le pied du feu, en tir tendu
      const tx = 9.4, tz = -1.1;
      const dx = tx - nozzle.x, dz = tz - nozzle.z;
      const reach = Math.hypot(dx, dz);
      const pitch = 0.11;
      acc += dt; acc2 += dt;
      while (acc >= 0.1) {
        acc -= 0.1;
        emitFx('jet_eau', nozzle.x, nozzle.y, nozzle.z, { dirX: (dx / reach) * Math.cos(pitch), dirY: Math.sin(pitch), dirZ: (dz / reach) * Math.cos(pitch), size: reach, seconds: 0.15 });
      }
      while (acc2 >= 0.2 && t > 1.9) {
        acc2 -= 0.2;
        emitFx('eclaboussure', tx + (rnd() - 0.5) * 1.5, 0.05, tz + (rnd() - 0.5) * 1.5, { size: 1.4 });
        // le feu faiblit sous l'eau, de la vapeur claire s'élève
        (fire as { intensity: number }).intensity = Math.max(0.12, fire.intensity - 0.012);
        field.emitSmoke(tx, tz, 0.05, 2.5, 0xd8d8d8);
      }
    };
    camPos.set(-12, 3.4, 27); camTarget.set(-9, 2.4, 0);
  },
  // barricade embrasée, de nuit comme de jour : conteneurs, palettes, trottinette (batterie)
  barricade() {
    setWind(0.7, 0.3);
    const bx = 12;
    for (let k = 0; k < 4; k++) box(1.3, 1.15, 0.8, [0x2f5a3a, 0x3a3f45, 0x2f5a3a, 0x5a4a2a][k]!, bx + (k % 2) * 0.5, 0.58, -4.6 + k * 2.3, Math.PI / 2 + (k - 1.5) * 0.25);
    for (let k = 0; k < 5; k++) box(1.2, 0.14, 1.0, 0x8a6a3a, bx - 0.9 + (k % 2) * 0.3, 0.2 + k * 0.17, -5.2 + k * 2.4, k * 0.5);
    box(2.4, 1.1, 0.08, 0xc2c6ca, bx + 1.1, 0.55, 1.5, Math.PI / 2 + 0.2); box(2.4, 1.1, 0.08, 0xc2c6ca, bx + 1.2, 0.55, -2.8, Math.PI / 2 - 0.15);
    box(0.12, 1.0, 1.0, 0x30e0a0, bx - 2.4, 0.5, 2.8, 0.6); box(0.5, 0.08, 1.1, 0x202020, bx - 2.4, 0.08, 2.8, 0.6);
    burnProp('barricade', bx, -0.4, Math.PI / 2, 4.6, 1.1, 1.2);
    burnProp('trottinette', bx - 2.4, 2.8, 0.6, 0.25, 0.55, 1.0);
    cyl(0.3, 1.0, 0x3d4a3e, bx + 3.5, -7.8);
    burnProp('poubelle', bx + 3.5, -7.8, 0, 0.3, 0.3, 1.0);
    policeLine(-6);
    protesters(22, 18);
    const v = ctx.vehicles.spawn('fourgon_crs', -14, -3, Math.PI / 2);
    v.beacons = true;
    box(2.1, 2.5, 5.6, 0xf2f3f5, -14, 1.3, -3, Math.PI / 2, 0.4);
    const s1 = smokeFrom(bx, -3, 0.3), s2 = smokeFrom(bx, 1.5, 0.3), s3 = smokeFrom(bx + 3.5, -7.8, 0.18);
    let thrown = 0;
    script = (t, dt) => {
      s1(dt); s2(dt); s3(dt);
      // un engin incendiaire et quelques pavés partent de derrière la barricade
      if (thrown === 0 && t > 17.2) { thrown = 1; lob('molotov', 20, 1.8, 1, 2.5, 3.2, 1.5); }
      if (thrown === 1 && t > 17.6) { thrown = 2; lob('pave', 21, 1.8, -2, 1, -1.5, 1.6); lob('bouteille', 19, 1.8, 3, 3, 4.5, 1.3); }
    };
    camPos.set(-1.5, 2.0, 11.5); camTarget.set(11, 2.4, -2.5);
  },
  // catalogue : tous les FxId du contrat, décalques au sol et sur les façades
  divers() {
    setWind(0.6, 0.1);
    ctx.props.addShop({ category: 'mode', x: 2, z: -11, heading: 0, width: 6 });
    policeLine(-30);
    const person = ctx.people.spawn({ kind: 'manifestant', x: 10.5, z: 1 });
    person.burning = 0.9;
    crowd(1, 0x303030, (_i, v) => v.set(10.5, 0, 1));
    let step = 0;
    script = (t) => {
      const at = (k: number, when: number, fn: () => void): void => { if (step === k && t > when) { step++; fn(); } };
      at(0, 0.15, () => {
        emitFx('trace_brulure', -9, 0, 3.5, { size: 2 }); emitFx('trace_brulure', -4, 0, 5, { size: 3.4 });
        emitFx('tag', 0, 1.6, -10.8, { size: 1, color: 0x101010 }); emitFx('tag', 4.2, 1.5, -10.8, { size: 1.3, color: 0xc0182a });
        emitFx('peinture', -3.4, 1.9, -10.8, { size: 0.6, color: 0xd9382e }); emitFx('peinture', 6, 0.1, -3, { size: 0.5, color: 0x2a61b8 });
        emitFx('eclaboussure', -6.5, 0.05, -1, { size: 1.6 }); emitFx('eclaboussure', -5.7, 0.05, -0.4, { size: 1.2 });
        emitFx('debris', 8, 0.5, 4, { size: 2 });
        emitFx('eclats_verre', 2, 1.2, -9.6, { size: 2.2 });
      });
      at(1, 0.55, () => {
        emitFx('explosion', 0, 0.2, 0, { size: 2 }); ctx.events.emit('explosion', { kind: 'gm2l', x: 0, y: 0.2, z: 0, radius: 10, sourceId: 0 });
        emitFx('flash', 0, 0.5, 0, { size: 3, color: 0xffffff, seconds: 0.15 });
        emitFx('etincelles', -6, 0.5, -3, { size: 2 }); emitFx('etincelles', 10, 1, -4, { size: 1.2, color: 0x34c759, seconds: 0.8 });
        emitFx('poussiere', 5, 0, 2, { size: 1.2 }); emitFx('impact', 6.5, 1.1, 0, { size: 0.4 });
        emitFx('gaz', -9, 1.4, 2.5, { dirX: 0.9, dirY: 0.1, dirZ: -0.3, size: 4, seconds: 0.5 });
        emitFx('poudre', -9, 1.1, 5, { dirX: 0.95, dirY: 0, dirZ: 0.2, size: 4, color: 0xf2f2ee, seconds: 0.6 });
        emitFx('fumee', -7, 1.2, -5, { size: 2, color: 0xd62828, seconds: 1.2 });
        emitFx('feu', 9, 0.2, -6, { size: 2.5, seconds: 2 });
        emitFx('sang', 7.5, 1.2, 1.5, { size: 0.8, dirX: 0.6, dirY: 0.2, dirZ: 0.3 });
        emitFx('traceur', -20, 1.5, -2, { dirX: 0.98, dirY: 0.03, dirZ: 0.05, size: 30, seconds: 0.15 });
        emitFx('feu_artifice', 4, 7, -6, { size: 3, color: 0xff3b30, seconds: 1.2 });
        ctx.events.emit('projectile:impact', { id: 0, kind: 'pave', ownerId: 0, x: 1, y: 2.4, z: -10.9, hitKind: 'building', hitId: 0 });
        ctx.events.emit('projectile:impact', { id: 0, kind: 'pave', ownerId: 0, x: 3, y: 0.03, z: 2, hitKind: 'ground', hitId: 0 });
      });
    };
    camPos.set(0.5, 3.6, 14.5); camTarget.set(1.5, 1.2, -4);
  },
  // nuage vu de dessus (carte tactique, drone)
  dessus() {
    scenes.gaz!();
    burnProp('conteneur', 14, 4, 0, 0.65, 0.4, 1.15);
    const s1 = smokeFrom(14, 4, 0.3);
    script = (_t, dt) => s1(dt);
    camPos.set(4, 70, 6); camTarget.set(4, 0, 0);
  },
};
(scenes[sceneName] ?? scenes.gaz!)();
{
  const c = (params.get('cam') ?? '').split(',').map(Number);
  if (c.length === 6 && c.every((v) => !Number.isNaN(v))) { camPos.set(c[0]!, c[1]!, c[2]!); camTarget.set(c[3]!, c[4]!, c[5]!); }
}

// ───────────────────────────── boucle, mesures, API de test ─────────────────────────────
const hud = document.getElementById('hud')!;
const cpu: number[] = [];
const slow: { image: number; ms: number }[] = [];
let frames = 0;
const up = new THREE.Vector3(0, 1, 0);
function placeCamera(dt: number): void {
  camera.position.copy(camPos);
  if (shake.seconds > 0) {
    shake.seconds -= dt;
    const k = shake.amount * Math.max(0, shake.seconds / shake.total);
    camera.position.x += (rnd() - 0.5) * k * 0.4; camera.position.y += (rnd() - 0.5) * k * 0.4;
    if (shake.seconds <= 0) shake.amount = 0;
  }
  // vue plongeante : « haut » de l'image vers −z
  if (Math.abs(camTarget.x - camPos.x) + Math.abs(camTarget.z - camPos.z) < 0.5) up.set(0, 0, -1); else up.set(0, 1, 0);
  camera.up.copy(up);
  camera.lookAt(camTarget);
  camera.updateMatrixWorld();
}
/** Une image de jeu (simulation + préparation des effets), sans dessin. */
function tick(dt: number): void {
  placeCamera(dt);
  game.frame(dt);
  fakeLights.update(dt, camera.position);
  cpu.push(fx.stats.cpuMs);
  if (cpu.length > 4000) cpu.shift();
  if (fx.stats.cpuMs > 3) { slow.push({ image: frames, ms: Math.round(fx.stats.cpuMs * 10) / 10 }); if (slow.length > 12) slow.shift(); }
  frames++;
}
function draw(): void {
  renderer.render(scene, camera);
}
function info(): Record<string, unknown> {
  const s = fx.stats;
  const sorted = [...cpu].sort((a, b) => a - b);
  const avg = cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length);
  return {
    scene: sceneName, qualite: quality, nuit: night, t: Math.round(simTime * 100) / 100, images: frames,
    appelsModule: s.drawCalls, trianglesModule: s.triangles, quads: s.sprites, particules: s.particles, bouffees: s.puffs, cellules: s.cells,
    surcharge: s.lodBias, flammes: s.flames, foyers: s.fires, decalques: s.decals, projectiles: s.projectiles, jets: s.jets, lumieres: s.lights,
    cpuMoy: Math.round(avg * 1000) / 1000, cpuP95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 1000) / 1000,
    cpuMax: Math.round((sorted[sorted.length - 1] ?? 0) * 1000) / 1000,
    evenementsPerdus: s.eventsDropped, particulesRefusees: s.particlesDropped, quadsRefuses: s.spritesDropped,
    appelsScene: renderer.info.render.calls, trianglesScene: renderer.info.render.triangles, secousses: W.__shakes ?? 0,
    imagesLentes: slow.map((e) => `${e.image}:${e.ms}`).join(' '),
  };
}
function showHud(): void {
  const i = info();
  hud.textContent = `scène « ${sceneName} » — qualité ${quality}${night ? ' — nuit' : ''} — t = ${i.t} s\n`
    + `module : ${i.appelsModule} appels de dessin, ${Number(i.trianglesModule).toLocaleString('fr-FR')} triangles, ${i.quads} quads `
    + `(${i.particules} particules, ${i.bouffees} bouffées, ${i.flammes} flammes), ${i.decalques} décalques, ${i.projectiles} projectiles\n`
    + `CPU du module : moy. ${i.cpuMoy} ms, p95 ${i.cpuP95} ms, max ${i.cpuMax} ms — scène entière : ${i.appelsScene} appels`;
}
/** Mesure les appels de dessin et les triangles du module seul (différence avec et sans le groupe « fx »). */
function measure(): Record<string, number> {
  const g = scene.getObjectByName('fx');
  draw();
  const withCalls = renderer.info.render.calls, withTris = renderer.info.render.triangles;
  if (g) g.visible = false;
  draw();
  const without = renderer.info.render.calls, withoutTris = renderer.info.render.triangles;
  if (g) g.visible = true;
  draw();
  return { appelsAvec: withCalls, appelsSans: without, appelsModule: withCalls - without, trianglesModule: withTris - withoutTris };
}
const api = {
  /** Avance de `seconds` secondes simulées par pas fixes, sans dessiner ; retourne les mesures. */
  advance(seconds: number): Record<string, unknown> {
    const n = Math.max(1, Math.round(seconds / STEP));
    for (let i = 0; i < n; i++) tick(STEP);
    return info();
  },
  draw(): void { draw(); showHud(); },
  info, measure,
  resetCpu(): void { cpu.length = 0; slow.length = 0; fx.stats.cpuMsMax = 0; },
  camera(x: number, y: number, z: number, tx: number, ty: number, tz: number): void { camPos.set(x, y, z); camTarget.set(tx, ty, tz); },
  emit: emitFx,
  ctx, fx,
};
W.__fx = api;

const t0 = num('t', 0);
if (t0 > 0) api.advance(t0);
tick(STEP);
draw();
draw();
showHud();
W.__info = info();
W.__ready = true;
// animation en direct (désactivée par &fige=1 pour les captures : le WebGL logiciel est lent)
if (params.get('fige') !== '1') {
  let last = performance.now();
  const loop = (): void => {
    if (!W.__pause) {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      tick(dt);
      draw();
      if (frames % 10 === 0) showHud();
    } else {
      last = performance.now();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
