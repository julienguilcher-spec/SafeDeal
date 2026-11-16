// Banc d'essai de l'environnement et du rendu de base : une rue de ville européenne (chaussée, trottoirs,
// immeubles-boîtes de 20 m, arbres, candélabres, personnages-capsules, un fourgon, un drone) éclairée par
// les vrais modules src/env et src/render/base, branchés sur un contexte factice.
//
// Paramètres d'URL (tous facultatifs) :
//   t=14.5            heure légale (0..24)            meteo=clair|nuageux|couvert|pluie|averse|brouillard|orage
//   q=bas|moyen|haut|ultra                            cam=fps|tps|vehicle_ext|vehicle_int|turret|drone|tactical|viewfinder|free
//   yaw=…&pitch=…     regard en degrés (0 = vers le haut de la rue)       zoom=…
//   pos=x,y,z         position de la caméra libre (repère de la rue)       joueur=x,z
//   fx=gas:0.7,wet:0.5      effets d'écran            horloge=60 (vitesse de l'horloge ; 0 par défaut)
//   marche=1          le joueur marche                feu=1 / feu=0       hud=0      scale=0.7     ombres=0
// Touches : 1-9 modes de caméra, clic-glisser pour regarder, ZQSD pour déplacer (vue tactique, vol libre),
//   T/G heure ±, M météo suivante, H aide.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CameraMode, GameSystem, QualityLevel, WeatherKind } from '@/core/contracts';
import { createSystems as createEnv, WEATHER_KINDS } from '@/env';
import type { EnvExtApi } from '@/env';
import { createSystems as createRenderBase } from '@/render/base';
import type { DynamicLight, RenderBaseApi, RenderCameraApi, RenderLightsApi, RenderUniformsApi } from '@/render/base';
import { createFakeRenderContext, makeVehicleDef } from '@/render/base/dev/fakeContext';
import type { Box } from '@/render/base/dev/fakeContext';

const params = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number): number => {
  const v = params.get(key);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const DEG = Math.PI / 180;

// ───────────────────────────── contexte et modules ─────────────────────────────

const { ctx, controls } = createFakeRenderContext({ seed: num('seed', 3) });
controls.settings.quality = (params.get('q') ?? 'haut') as QualityLevel;
controls.settings.renderScale = num('scale', 1);
controls.settings.shadows = params.get('ombres') !== '0';
controls.settings.drawDistance = num('dd', controls.settings.quality === 'bas' ? 220 : 500);
controls.config = {
  mode: 'test', missionId: '', role: 'crs', rank: 'gardien', place: '', x: 0, z: 0,
  timeOfDay: num('t', 14), weather: (params.get('meteo') ?? 'clair') as WeatherKind, crowdSize: 0, tension: 0,
  volatility: 0, duration: 'temps_reel', seed: num('seed', 3), extra: { clockScale: num('horloge', 0) },
};

const systems: GameSystem[] = [...createEnv(), ...createRenderBase()].sort((a, b) => a.order - b.order);
for (const s of systems) s.provide?.(ctx);
for (const s of systems) void s.init?.(ctx);
for (const s of systems) s.reset?.();

const view = ctx.view;
if (!view) throw new Error('ctx.view est nul : le rendu de base n’a pas pu démarrer');
const lights = ctx.require<RenderLightsApi>('render.lights');
const shared = ctx.require<RenderUniformsApi>('render.uniforms');
const rig = ctx.require<RenderCameraApi>('render.camera');
const base = ctx.require<RenderBaseApi>('render.base');
const envExt = ctx.require<EnvExtApi>('env.ext');

// ───────────────────────────── repère de la rue ─────────────────────────────
// La rue est tournée pour pointer vers le couchant du 1er mai (azimut 293°) : le soleil se couche
// dans l'axe, la pleine lune se lève à l'opposé.
const STREET_YAW = 67 * DEG;
controls.frameYaw = STREET_YAW;
const cosS = Math.cos(STREET_YAW);
const sinS = Math.sin(STREET_YAW);
/** Repère de la rue (x = travers, z = long de la rue, -z = vers le haut de la rue) → monde. */
const toWorldX = (lx: number, lz: number): number => lx * cosS + lz * sinS;
const toWorldZ = (lx: number, lz: number): number => -lx * sinS + lz * cosS;
/** Cap monde d'un regard vers le haut de la rue, tourné de `deg` degrés vers la droite. */
const headingUpStreet = (deg = 0): number => Math.atan2(-sinS, -cosS) - deg * DEG;

const root = new THREE.Group();
root.name = 'banc-rue';
root.rotation.y = STREET_YAW;
view.world.add(root);

// ───────────────────────────── textures procédurales ─────────────────────────────

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Grain minéral : bitume, dalles. */
function grainTexture(base: [number, number, number], spread: number, seed: number, joints = 0): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const r = rand(seed);
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (r() - 0.5) * spread + (r() < 0.02 ? (r() - 0.3) * spread * 2.5 : 0);
      img.data[i * 4] = base[0] + n;
      img.data[i * 4 + 1] = base[1] + n;
      img.data[i * 4 + 2] = base[2] + n;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (joints > 0) {
      g.strokeStyle = 'rgba(40,38,36,0.55)';
      g.lineWidth = 1.5;
      for (let k = 0; k <= joints; k++) {
        const p = (k / joints) * 256;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
        g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
      }
    }
  });
}

/** Façade haussmannienne : une travée (fenêtre, garde-corps, bandeau). Deux versions : jour et fenêtres allumées. */
function facadeTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 256;
  const H = 256;
  const cols = 4;
  const rows = 4;
  const r = rand(77);
  const lit: boolean[] = [];
  for (let i = 0; i < cols * rows; i++) lit.push(r() < 0.42);
  const map = canvasTexture(W, H, (g) => {
    g.fillStyle = '#d6cbb4';
    g.fillRect(0, 0, W, H);
    const rr = rand(5);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${rr() < 0.5 ? '90,80,60' : '255,250,235'},${0.03 + rr() * 0.05})`;
      g.fillRect(rr() * W, rr() * H, 2 + rr() * 5, 1 + rr() * 2);
    }
    for (let y = 0; y < rows; y++) {
      const y0 = y * (H / rows);
      // bandeau d'étage
      g.fillStyle = 'rgba(120,108,86,0.5)';
      g.fillRect(0, y0, W, 3);
      g.fillStyle = 'rgba(255,250,235,0.35)';
      g.fillRect(0, y0 + 3, W, 2);
      for (let x = 0; x < cols; x++) {
        const x0 = x * (W / cols) + 17;
        const wy = y0 + 14;
        g.fillStyle = '#b9ad94';
        g.fillRect(x0 - 3, wy - 3, 36, 46);
        g.fillStyle = '#2c3540';
        g.fillRect(x0, wy, 30, 40);
        g.fillStyle = 'rgba(150,175,200,0.28)';
        g.fillRect(x0, wy, 30, 14);
        g.strokeStyle = '#e9e4d6';
        g.lineWidth = 1.5;
        g.strokeRect(x0 + 0.5, wy + 0.5, 29, 39);
        g.beginPath(); g.moveTo(x0 + 15, wy); g.lineTo(x0 + 15, wy + 40); g.stroke();
        // garde-corps en fonte
        g.fillStyle = '#23262b';
        g.fillRect(x0 - 2, wy + 30, 34, 2);
        for (let k = 0; k < 9; k++) g.fillRect(x0 - 1 + k * 4, wy + 30, 1, 10);
      }
    }
  });
  const emissive = canvasTexture(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!lit[y * cols + x]) continue;
        const x0 = x * (W / cols) + 17;
        const wy = y * (H / rows) + 14;
        const warm = rand(y * 9 + x)() < 0.8;
        g.fillStyle = warm ? '#ffcf8a' : '#cfe0ff';
        g.fillRect(x0 + 1, wy + 1, 28, 38);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x0 + 1, wy + 22, 28, 17);
      }
    }
  });
  return { map, emissive };
}

// ───────────────────────────── sol, chaussée, trottoirs ─────────────────────────────

const HALF_ROAD = 8;
const SIDEWALK = 5;
const FRONT = HALF_ROAD + SIDEWALK;       // alignement des façades
const STREET_NORTH = -260;
const STREET_SOUTH = 140;

function addGround(): void {
  const asphalt = grainTexture([104, 104, 106], 26, 1);
  asphalt.repeat.set(600, 600);
  const groundMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0 });
  shared.applyWetness(groundMat, { darken: 0.42, roughness: 0.16 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'sol';
  root.add(ground);

  // trottoirs en dalles de granit, bordures
  const slabs = grainTexture([150, 146, 138], 16, 2, 4);
  const walkMat = new THREE.MeshStandardMaterial({ map: slabs, roughness: 0.85 });
  shared.applyWetness(walkMat, { darken: 0.34, roughness: 0.22 });
  const len = STREET_SOUTH - STREET_NORTH;
  const walkGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(SIDEWALK, 0.15, len);
    scaleUv(g, len / 2.4, SIDEWALK / 2.4);
    g.translate(side * (HALF_ROAD + SIDEWALK / 2), 0.075, (STREET_NORTH + STREET_SOUTH) / 2);
    walkGeos.push(g);
  }
  const walks = new THREE.Mesh(mergeGeometries(walkGeos), walkMat);
  walks.receiveShadow = true;
  walks.castShadow = true;
  root.add(walks);

  // marquage : ligne axiale discontinue, passage piéton
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  shared.applyWetness(paint, { darken: 0.2, roughness: 0.2 });
  const marks: THREE.BufferGeometry[] = [];
  for (let z = STREET_NORTH; z < STREET_SOUTH; z += 9) {
    const g = new THREE.PlaneGeometry(0.15, 3);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.012, z);
    marks.push(g);
  }
  for (let x = -HALF_ROAD + 0.8; x < HALF_ROAD - 0.5; x += 1.0) {
    const g = new THREE.PlaneGeometry(0.5, 4);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.012, 2);
    marks.push(g);
  }
  const marking = new THREE.Mesh(mergeGeometries(marks), paint);
  marking.receiveShadow = true;
  root.add(marking);
}

function scaleUv(g: THREE.BufferGeometry, u: number, v: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
}

// ───────────────────────────── immeubles ─────────────────────────────

let facadeMaterial: THREE.MeshStandardMaterial;

function addBuildings(): void {
  const { map, emissive } = facadeTextures();
  facadeMaterial = new THREE.MeshStandardMaterial({
    map, roughness: 0.9, emissiveMap: emissive, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x69727c, roughness: 0.55, metalness: 0.35 });
  shared.applyWetness(roofMat, { darken: 0.25, roughness: 0.15 });
  const shopMat = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.6 });
  const facades: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const shops: THREE.BufferGeometry[] = [];
  const r = rand(42);
  const depth = 15;
  for (const side of [-1, 1]) {
    let z = STREET_NORTH;
    while (z < STREET_SOUTH) {
      const w = 15 + Math.floor(r() * 4) * 3;
      // rues transversales
      if ((z < -78 && z + w > -92) || (z < 62 && z + w > 50)) {
        z += 14;
        continue;
      }
      const h = 20 + (r() - 0.5) * 4;
      const x0 = side > 0 ? FRONT : -FRONT - depth;
      const box: Box = { x0, x1: x0 + depth, z0: z, z1: z + w - 0.3, h: h + 3 };
      controls.boxes.push(box);
      const bw = box.z1 - box.z0;
      const g = new THREE.BoxGeometry(depth, h - 3.6, bw);
      // 4 travées de 3,4 m et 4 étages de 3,2 m par répétition de texture
      scaleUv(g, Math.round(bw / 3.4) / 4, Math.round((h - 3.6) / 3.2) / 4);
      g.translate(x0 + depth / 2, 3.6 + (h - 3.6) / 2, z + bw / 2);
      facades.push(g);
      // rez-de-chaussée commerçant, plus sombre
      const s = new THREE.BoxGeometry(depth - 0.1, 3.6, bw - 0.1);
      s.translate(x0 + depth / 2, 1.8, z + bw / 2);
      shops.push(s);
      // comble en zinc, en retrait
      const roof = new THREE.BoxGeometry(depth - 1.6, 3, bw - 0.6);
      roof.translate(x0 + depth / 2, h + 1.5, z + bw / 2);
      roofs.push(roof);
      z += w;
    }
  }
  // quelques îlots au fond pour fermer l'horizon
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 520;
    const z = STREET_NORTH - 30 - r() * 260;
    if (Math.abs(x) < 26) continue;
    const w = 18 + r() * 22;
    const d = 14 + r() * 16;
    const h = 17 + r() * 9;
    controls.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: h + 3 });
    const g = new THREE.BoxGeometry(w, h, d);
    scaleUv(g, Math.round(w / 3.4) / 4, Math.round(h / 3.2) / 4);
    g.translate(x, h / 2, z);
    facades.push(g);
    const roof = new THREE.BoxGeometry(w - 1.6, 3, d - 1.6);
    roof.translate(x, h + 1.5, z);
    roofs.push(roof);
  }
  for (const [geos, mat] of [[facades, facadeMaterial], [roofs, roofMat], [shops, shopMat]] as const) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
}

// ───────────────────────────── arbres, candélabres ─────────────────────────────

const lampHeads: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff4dc, emissive: new THREE.Color(0xffc477), emissiveIntensity: 0, roughness: 0.4,
});
const lampLights: DynamicLight[] = [];

function addStreetFurniture(): void {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1f2a25, roughness: 0.5, metalness: 0.4 });
  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  const r = rand(8);
  for (let z = STREET_NORTH + 8; z < STREET_SOUTH; z += 12.5) {
    for (const side of [-1, 1]) {
      const x = side * (HALF_ROAD + 1.4);
      if ((z > -94 && z < -76) || (z > 48 && z < 64) || Math.abs(z - 2) < 4) continue;
      const k = Math.round((z - STREET_NORTH) / 12.5);
      if (k % 2 === 0) {
        // platane
        const h = 5.5 + r() * 1.5;
        const t = new THREE.CylinderGeometry(0.16, 0.24, h, 7);
        t.translate(x, h / 2, z);
        trunks.push(t);
        const crown = new THREE.IcosahedronGeometry(2.6 + r() * 0.7, 1);
        crown.scale(1, 0.85 + r() * 0.25, 1);
        crown.translate(x + (r() - 0.5) * 0.6, h + 1.4, z + (r() - 0.5) * 0.6);
        leaves.push(crown);
      } else {
        // candélabre
        const p = new THREE.CylinderGeometry(0.07, 0.11, 7.6, 8);
        p.translate(x, 3.8, z);
        posts.push(p);
        const arm = new THREE.BoxGeometry(1.1, 0.08, 0.08);
        arm.translate(x - side * 0.5, 7.5, z);
        posts.push(arm);
        const head = new THREE.SphereGeometry(0.24, 10, 8);
        head.scale(1.3, 0.7, 1.3);
        head.translate(x - side * 1.0, 7.4, z);
        heads.push(head);
        lampLights.push(lights.point({
          x: toWorldX(x - side * 1.0, z), y: 7.0, z: toWorldZ(x - side * 1.0, z), color: 0xffc070, intensity: 0, range: 22,
        }));
      }
    }
  }
  for (const [geos, mat, cast] of [[trunks, trunkMat, true], [leaves, leafMat, true], [posts, postMat, true], [heads, lampHeads, false]] as const) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
  }
}

// ───────────────────────────── personnages-capsules ─────────────────────────────

function addPeople(): void {
  const body = new THREE.CapsuleGeometry(0.25, 1.05, 4, 10);
  body.translate(0, 0.775, 0);
  const head = new THREE.SphereGeometry(0.115, 10, 8);
  head.translate(0, 1.66, 0);
  const specs: { x: number; z: number; color: number; head: number; s: number }[] = [];
  const r = rand(21);
  // ligne de barrage : douze CRS en travers de la chaussée, boucliers jointifs
  for (let i = 0; i < 12; i++) specs.push({ x: -6.6 + i * 1.2, z: 10, color: 0x1a2240, head: 0x16203c, s: 1.02 });
  for (let i = 0; i < 5; i++) specs.push({ x: -4.2 + i * 2.1, z: 12.2, color: 0x1a2240, head: 0x16203c, s: 1.02 });
  // cortège : une soixantaine de manifestants plus haut dans la rue
  const palette = [0x8a3b32, 0x3f5d7a, 0x6b6f58, 0x2d2d33, 0xb9a86a, 0x7a4f6a, 0x4a6b52, 0xc8c2b4, 0xd8c020, 0x30506e];
  for (let i = 0; i < 64; i++) {
    specs.push({
      x: (r() - 0.5) * 14, z: -8 - r() * 34, color: palette[Math.floor(r() * palette.length)]!, head: 0xd9a47c,
      s: 0.92 + r() * 0.14,
    });
  }
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.85 }), specs.length);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.7 }), specs.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  specs.forEach((sp, i) => {
    m.makeScale(sp.s, sp.s, sp.s).setPosition(sp.x, 0, sp.z);
    bodies.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    bodies.setColorAt(i, c.setHex(sp.color));
    heads.setColorAt(i, c.setHex(sp.head));
  });
  for (const mesh of [bodies, heads]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

// ───────────────────────────── joueur, fourgon, drone, feu ─────────────────────────────

const playerMesh = new THREE.Group();
const vanMesh = new THREE.Group();
const vanExterior = new THREE.Group();
const vanInterior = new THREE.Group();
const droneMesh = new THREE.Group();
let beacon: DynamicLight | null = null;
let fireLight: DynamicLight | null = null;
let fireMat: THREE.MeshStandardMaterial | null = null;
const beaconMat = new THREE.MeshStandardMaterial({ color: 0x1030a0, emissive: new THREE.Color(0x2a6bff), emissiveIntensity: 0 });

const player = controls.addPerson(toWorldX(2.5, 26), toWorldZ(2.5, 26), headingUpStreet());
const van = controls.addVehicle(makeVehicleDef(), toWorldX(-4.6, 22), toWorldZ(-4.6, 22), headingUpStreet());
const drone = controls.addVehicle(
  makeVehicleDef({ kind: 'drone', name: 'Drone', length: 0.5, width: 0.5, height: 0.2, seats: [], turrets: [], flying: true }),
  toWorldX(1, 14), toWorldZ(1, 14), headingUpStreet(), 42,
);

function addActors(): void {
  // joueur : une capsule aux couleurs de la tenue
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.08, 4, 12), new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.8 }));
  body.position.y = 0.8;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: 0x141c34, roughness: 0.35, metalness: 0.2 }));
  helmet.position.y = 1.7;
  playerMesh.add(body, helmet);
  playerMesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  view!.world.add(playerMesh);

  // fourgon : caisse blanche, bande bleue, rampe lumineuse
  const def = van.def;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height - 0.45, def.length), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45, metalness: 0.1 }));
  shell.position.y = 0.45 + (def.height - 0.45) / 2;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.width + 0.02, 0.35, def.length + 0.02), new THREE.MeshStandardMaterial({ color: 0x12306e, roughness: 0.5 }));
  stripe.position.y = 1.25;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.2, 0.75, 0.05), new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.15, metalness: 0.4 }));
  glass.position.set(0, 1.95, def.length / 2 + 0.01);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.32), beaconMat);
  bar.position.set(0, def.height + 0.07, 1.4);
  const wheels = new THREE.Group();
  for (const [wx, wz] of [[-1, 1.8], [1, 1.8], [-1, -1.8], [1, -1.8]] as const) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (def.width / 2 - 0.1), 0.42, wz);
    wheels.add(w);
  }
  vanExterior.add(shell, stripe, glass, bar);
  // poste de conduite, visible seulement de l'intérieur : capot, planche de bord, volant, montants, pavillon
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.8 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45, metalness: 0.1 });
  const hood = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.08, 0.9), paintMat);
  hood.position.set(0, 1.45, def.length / 2 - 0.35);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(def.width - 0.1, 0.32, 0.5), dark);
  dash.position.set(0, 1.42, def.length / 2 - 1.0);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), dark);
  wheel.position.set(0.5, 1.5, def.length / 2 - 1.2);
  wheel.rotation.x = -0.45;
  const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.1, 1.6), dark);
  roofEdge.position.set(0, 2.38, def.length / 2 - 1.3);
  vanInterior.add(hood, dash, wheel, roofEdge);
  for (const px of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.09), dark);
    pillar.position.set(px * (def.width / 2 - 0.05), 1.9, def.length / 2 - 0.72);
    pillar.rotation.x = 0.35;
    vanInterior.add(pillar);
  }
  vanInterior.visible = false;
  vanMesh.add(vanExterior, vanInterior, wheels);
  vanMesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  view!.world.add(vanMesh);
  beacon = lights.point({ color: 0x2a6bff, intensity: 0, range: 24, priority: 0.5 });

  // drone
  const dbody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.5 }));
  droneMesh.add(dbody);
  view!.world.add(droneMesh);

  // conteneur en feu
  fireMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(0xff6a1a), emissiveIntensity: 0, roughness: 0.8 });
  const bin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.8), fireMat);
  bin.position.set(5.2, 0.6, -2.5);
  bin.castShadow = true;
  root.add(bin);
  fireLight = lights.point({ x: toWorldX(5.2, -2.5), y: 1.7, z: toWorldZ(5.2, -2.5), color: 0xff7a22, intensity: 0, range: 18, flicker: 0.7, priority: 1 });
}

addGround();
addBuildings();
addStreetFurniture();
addPeople();
addActors();
controls.possess(player);

// ───────────────────────────── réglages par paramètres ─────────────────────────────

interface Setup {
  t?: number;
  meteo?: WeatherKind;
  cam?: CameraMode;
  /** Regard en degrés : 0 = vers le haut de la rue, positif = vers la droite / vers le haut. */
  yaw?: number;
  pitch?: number;
  zoom?: number;
  /** Position de la caméra libre et du joueur, dans le repère de la rue. */
  pos?: [number, number, number];
  joueur?: [number, number];
  fx?: Partial<Record<'gas' | 'flash' | 'wet' | 'pain' | 'visor', number>>;
  feu?: boolean;
  gyro?: boolean;
  marche?: boolean;
  quality?: QualityLevel;
  posture?: 'stand' | 'crouch';
  eclair?: number;
  secousse?: number;
}

let fireOn: boolean | null = params.has('feu') ? params.get('feu') !== '0' : null;
let beaconOn: boolean | null = params.has('gyro') ? params.get('gyro') !== '0' : null;
let walking = params.get('marche') === '1';
/** Éclair maintenu (captures d'écran) : 0 = aucun. */
let heldLightning = 0;
const fxLevels: Partial<Record<'gas' | 'flash' | 'wet' | 'pain' | 'visor', number>> = {};

function apply(s: Setup): void {
  if (s.quality) ctx.settings.set('quality', s.quality);
  if (s.t !== undefined) ctx.env.setTime(s.t);
  if (s.meteo) {
    ctx.env.setWeather(s.meteo, true);
    // saut de météo : le sol est déjà détrempé s'il pleut, humide dans le brouillard, sec sinon
    envExt.setWetness(ctx.env.state.rain > 0 ? 1 : ctx.env.state.fog > 0.5 ? 0.3 : 0);
  }
  if (s.t !== undefined || s.meteo) base.snap();
  if (s.joueur) {
    player.x = toWorldX(s.joueur[0], s.joueur[1]);
    player.z = toWorldZ(s.joueur[0], s.joueur[1]);
    rig.cut();
  }
  if (s.posture) player.posture = s.posture;
  if (s.cam) {
    const inVan = s.cam === 'vehicle_ext' || s.cam === 'vehicle_int' || s.cam === 'turret';
    controls.possess(player, inVan ? van : s.cam === 'drone' ? drone : null, s.cam === 'turret' ? 1 : 0);
    controls.setCamera(s.cam);
    rig.cut();
  }
  if (s.yaw !== undefined) controls.player.camYaw = headingUpStreet(s.yaw);
  if (s.pitch !== undefined) controls.player.camPitch = s.pitch * DEG;
  if (s.zoom !== undefined) controls.player.zoom = s.zoom;
  if (s.pos) {
    rig.placeFree(toWorldX(s.pos[0], s.pos[2]), s.pos[1], toWorldZ(s.pos[0], s.pos[2]));
    rig.cut();
  }
  if (s.fx) Object.assign(fxLevels, s.fx);
  if (s.feu !== undefined) fireOn = s.feu;
  if (s.gyro !== undefined) beaconOn = s.gyro;
  if (s.marche !== undefined) walking = s.marche;
  if (s.eclair !== undefined) heldLightning = s.eclair;
  if (s.secousse) view!.shake(s.secousse, 1.2);
}

function setupFromUrl(): Setup {
  const s: Setup = {};
  if (params.has('cam')) s.cam = params.get('cam') as CameraMode;
  if (params.has('yaw')) s.yaw = num('yaw', 0);
  if (params.has('pitch')) s.pitch = num('pitch', 0);
  if (params.has('zoom')) s.zoom = num('zoom', 1);
  const pos = params.get('pos')?.split(',').map(Number);
  if (pos && pos.length === 3 && pos.every(Number.isFinite)) s.pos = pos as [number, number, number];
  const pl = params.get('joueur')?.split(',').map(Number);
  if (pl && pl.length === 2 && pl.every(Number.isFinite)) s.joueur = pl as [number, number];
  const fx = params.get('fx');
  if (fx) {
    s.fx = {};
    for (const part of fx.split(',')) {
      const [k, v] = part.split(':');
      if (k) (s.fx as Record<string, number>)[k] = Number(v ?? 1);
    }
  }
  return s;
}

controls.player.camYaw = headingUpStreet();
apply(setupFromUrl());

// ───────────────────────────── commandes manuelles ─────────────────────────────

const MODES: CameraMode[] = ['fps', 'tps', 'vehicle_ext', 'vehicle_int', 'turret', 'drone', 'tactical', 'viewfinder', 'free'];
const keys = new Set<string>();
let dragging = false;
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) apply({ cam: MODES[Number(digit[1]) - 1]! });
  if (e.code === 'KeyT') ctx.env.setTime(ctx.env.state.timeOfDay + 0.25);
  if (e.code === 'KeyG') ctx.env.setTime(ctx.env.state.timeOfDay - 0.25);
  if (e.code === 'KeyM') ctx.env.setWeather(WEATHER_KINDS[(WEATHER_KINDS.indexOf(ctx.env.state.weather) + 1) % WEATHER_KINDS.length]!);
  if (e.code === 'KeyH') (document.getElementById('aide') as HTMLElement).hidden = !(document.getElementById('aide') as HTMLElement).hidden;
  if (e.code === 'KeyL') envExt.strike(1);
  if (e.code === 'KeyK') view.shake(1, 1);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  controls.player.camYaw -= e.movementX * 0.004;
  controls.player.camPitch = Math.max(-1.5, Math.min(1.5, controls.player.camPitch - e.movementY * 0.004));
});
window.addEventListener('wheel', (e) => {
  controls.player.zoom = Math.max(0.3, Math.min(12, controls.player.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
});
(document.getElementById('aide') as HTMLElement).textContent =
  '1-9 : modes de caméra\nclic-glisser : regarder   molette : zoom\nZQSD : déplacer   T/G : heure   M : météo\nL : éclair   K : secousse   H : aide';

// ───────────────────────────── boucle ─────────────────────────────

const legend = document.getElementById('legende') as HTMLElement;
if (params.get('hud') === '0') legend.hidden = true;
let frames = 0;
let last = -1;
let simTime = 0;
let legendClock = 0;
const waiters: { at: number; done: () => void }[] = [];

function loop(tms: number): void {
  requestAnimationFrame(loop);
  let dt = last < 0 ? 0 : (tms - last) / 1000;
  last = tms;
  if (dt > 0.05) dt = 0.05;
  simTime += dt;

  // entrées clavier → axes
  controls.input.moveX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  controls.input.moveY = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  if (keys.has('ShiftLeft')) controls.input.down.add('sprint'); else controls.input.down.delete('sprint');
  if (keys.has('Space')) controls.input.down.add('jump'); else controls.input.down.delete('jump');
  if (keys.has('KeyC')) controls.input.down.add('crouch'); else controls.input.down.delete('crouch');

  // le joueur marche vers le haut de la rue (balancement de la vue subjective)
  if (walking && dt > 0) {
    const h = headingUpStreet();
    player.vx = Math.sin(h) * 1.5;
    player.vz = Math.cos(h) * 1.5;
    player.x += player.vx * dt;
    player.z += player.vz * dt;
  } else {
    player.vx = 0;
    player.vz = 0;
  }
  // le fourgon suit le joueur à bord (vues véhicule) ; le drone tourne lentement au-dessus de la rue
  const a = simTime * 0.12;
  drone.x = toWorldX(1 + Math.sin(a) * 6, 14 + Math.cos(a) * 6);
  drone.z = toWorldZ(1 + Math.sin(a) * 6, 14 + Math.cos(a) * 6);

  const env = ctx.env.state;
  for (const s of systems) if (dt > 0) s.update?.(dt);
  if (heldLightning > 0) envExt.strike(heldLightning);

  // effets d'écran entretenus
  for (const k of ['gas', 'wet', 'visor', 'flash', 'pain'] as const) {
    const v = fxLevels[k];
    if (v !== undefined) view!.setScreenEffect(k, v);
  }

  // lumières : candélabres, gyrophare, feu
  const street = shared.streetLights;
  lampHeads.emissiveIntensity = street * 6;
  for (const l of lampLights) l.intensity = street * 80;
  facadeMaterial.emissiveIntensity = shared.night * 1.3;
  const beaconActive = beaconOn ?? env.isNight;
  const blink = beaconActive && Math.floor(simTime * 4) % 2 === 0 ? 1 : 0;
  beaconMat.emissiveIntensity = blink * 6;
  if (beacon) {
    const def = van.def;
    const s = Math.sin(van.heading);
    const c = Math.cos(van.heading);
    beacon.x = van.x + s * 1.4;
    beacon.y = van.y + def.height + 0.5;
    beacon.z = van.z + c * 1.4;
    beacon.intensity = blink * 16;
  }
  const fireActive = fireOn ?? env.isNight;
  if (fireLight) fireLight.intensity = fireActive ? 45 : 0;
  if (fireMat) fireMat.emissiveIntensity = fireActive ? 2.5 + Math.sin(simTime * 13) * 0.6 : 0;

  // maillages des acteurs
  const p = ctx.player.person();
  const mode = rig.mode;
  playerMesh.visible = !!p && !p.vehicleId && mode !== 'fps' && mode !== 'viewfinder';
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.heading;
  playerMesh.scale.y = player.posture === 'crouch' ? 0.66 : 1;
  vanMesh.position.set(van.x, van.y, van.z);
  vanMesh.rotation.y = van.heading;
  vanExterior.visible = mode !== 'vehicle_int';
  vanInterior.visible = mode === 'vehicle_int';
  droneMesh.position.set(drone.x, drone.y, drone.z);
  droneMesh.visible = mode !== 'drone';

  for (const s of systems) s.frame?.(dt);

  frames++;
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (frames >= waiters[i]!.at) {
      waiters[i]!.done();
      waiters.splice(i, 1);
    }
  }
  legendClock += dt;
  if (!legend.hidden && (legendClock > 0.25 || frames < 4)) {
    legendClock = 0;
    const st = base.stats;
    legend.textContent = `${envExt.timeLabel()} · ${env.weather} · caméra ${mode} · qualité ${view!.quality}\n`
      + `${st.width}×${st.height} · ${st.drawCalls} appels · ${(st.triangles / 1000).toFixed(0)} k triangles · `
      + `préparation ${st.prepareMs.toFixed(2)} ms · lumières ${st.lightsLit}/${st.lightsWanted}`;
  }
  const w = window as unknown as { __frames: number; __ready: boolean };
  w.__frames = frames;
  if (frames >= 3) w.__ready = true;
}

/** API de pilotage pour le test de bout en bout. */
(window as unknown as { __render: unknown }).__render = {
  apply,
  /** Résolue après `n` images rendues. */
  settle(n = 3): Promise<void> {
    return new Promise((resolve) => waiters.push({ at: frames + n, done: resolve }));
  },
  stats() {
    const env = ctx.env.state;
    const cam = view!.camera;
    return {
      ...base.stats, quality: view!.quality, shadows: base.shadows, visibility: base.visibility, exposure: base.exposure,
      drawDistance: view!.drawDistance, mode: rig.mode, tpsDistance: rig.tpsDistance,
      cam: [cam.position.x, cam.position.y, cam.position.z], fov: cam.fov,
      env: { ...env }, sky: { ...envExt.sky }, raycasts: controls.raycasts,
      wetness: shared.wetness, night: shared.night, streetLights: shared.streetLights,
      pointBudget: lights.pointBudget, spotBudget: lights.spotBudget, lightCount: lights.count,
      fog: view!.scene.fog ? { color: (view!.scene.fog as THREE.FogExp2).color.getHex(), density: (view!.scene.fog as THREE.FogExp2).density } : null,
      programs: view!.renderer.info.programs?.length ?? 0,
    };
  },
  ctx, controls, view, rig,
};

requestAnimationFrame(loop);
