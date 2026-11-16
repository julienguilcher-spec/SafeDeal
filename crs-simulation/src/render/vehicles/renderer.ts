/* Moteur de rendu des véhicules : lit ctx.vehicles.list à chaque image et remplit les lots d'instances
 * (un appel de dessin par modèle et par niveau de détail), la couche d'effets lumineux et l'habitacle.
 * Aucune allocation dans frame() en régime établi (les états par véhicule sont créés à la première apparition). */

import * as THREE from 'three';
import type { GameContext, QualityLevel, Unsubscribe, Vec3, Vehicle, VehicleDef, ViewApi } from '@/core/contracts';
import type { DynamicLight, RenderAuxApi, RenderLightsApi } from '@/render/base/api';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import type { VehiclesRenderStats } from './api';
import { RENDER_LIGHTS_KEY, VEHICLES_EXT_KEY } from './api';
import { PlateAtlas, createAtlasTexture } from './atlas';
import { beaconLevel, beaconPatternFor, beaconPhaseFor, indicatorOn } from './beacons';
import type { BeaconPattern } from './beacons';
import { Cockpit } from './cockpit';
import { FX_BEAM, FX_FLAME, FX_POOL, FX_SMOKE, FxLayer } from './fx';
import {
  SRGB_TO_LINEAR, advanceWheelAngle, composeVehicleMatrix, pack2, pack4, steerToThree, transformPoint,
  turretPitchToThree, turretYawToThree, vehiclePointToWorld,
} from './frame';
import { LOD_FAR, LOD_HIDDEN, LOD_NEAR, VEHICLE_QUALITY, adaptNearScale, chooseLod } from './lod';
import type { VehicleLod, VehicleQuality } from './lod';
import { createVehicleMaterial, createVehicleUniforms } from './material';
import type { VehicleUniforms } from './material';
import { buildModel, modelKey } from './models/index';
import type { ModelMeta } from './models/index';
import { InstancePool } from './pool';
import { TurretView } from './turretview';

interface ModelEntry {
  key: string;
  kind: string;
  def: VehicleDef;
  meta: ModelMeta;
  near: InstancePool | null;
  far: InstancePool | null;
}

interface VState {
  entry: ModelEntry;
  def: VehicleDef;
  lod: VehicleLod;
  wheel: number;
  rotor: number;
  door: Float32Array;      // ouverture courante 0..1
  doorTimer: Float32Array; // secondes restantes d'ouverture temporaire
  doorHold: Uint8Array;    // porte tenue ouverte par l'API
  doorsActive: boolean;
  phase: number;
  pattern: BeaconPattern;
  char: number;
  seed: number;
  colorHex: number;
  r: number; g: number; b: number;
  stamp: number;
  /** Porte (0..3, ou −1) associée à chaque siège, d'après son point de sortie. */
  seatDoor: Int8Array | null;
}

const BLUE_R = SRGB_TO_LINEAR[0x1e]!, BLUE_G = SRGB_TO_LINEAR[0x5b]!, BLUE_B = SRGB_TO_LINEAR[0xff]!;

export class VehiclesRenderer {
  readonly stats: VehiclesRenderStats = { near: 0, far: 0, hidden: 0, drawCalls: 0, triangles: 0, fx: 0, cpuMs: 0, cpuMsAvg: 0, models: 0 };
  ownFire = true;

  private readonly group = new THREE.Group();
  private readonly uniforms: VehicleUniforms;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly atlas: THREE.CanvasTexture;
  private readonly plates: PlateAtlas;
  private readonly fx: FxLayer;
  private readonly cockpit: Cockpit;
  private readonly turretView: TurretView;
  private readonly entries = new Map<string, ModelEntry>();
  private readonly entryList: ModelEntry[] = [];
  private readonly states = new Map<number, VState>();
  private readonly unsubs: Unsubscribe[] = [];
  private readonly frustum = new THREE.Frustum();
  /** Champ de la vue annexe (retour vidéo du drone) : ce qui y est visible est dessiné aussi. */
  private readonly auxFrustum = new THREE.Frustum();
  private readonly auxMatrix = new THREE.Matrix4();
  private readonly projScreen = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmp2: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly extDoor = new Float32Array(4);
  /** Projecteur des phares du véhicule du joueur (lumière dynamique du rendu de base). */
  private headSpot: DynamicLight | null = null;
  private ext: VehiclesExtApi | null = null;
  private quality: QualityLevel;
  private q: VehicleQuality;
  private nearScale = 1;
  private blinkT = 0;
  private lastNow = 0;
  private stamp = 0;
  private lightsApi: RenderLightsApi | null = null;
  private pulses = 0;
  private sweep = 0;

  constructor(private readonly ctx: GameContext, private readonly view: ViewApi) {
    this.quality = view.quality;
    this.q = VEHICLE_QUALITY[this.quality];
    const maxAniso = view.renderer.capabilities.getMaxAnisotropy();
    this.atlas = createAtlasTexture(this.q.atlasSize, Math.min(8, maxAniso));
    this.plates = new PlateAtlas();
    this.uniforms = createVehicleUniforms();
    this.uniforms.uPlates.value = this.plates.texture;
    this.material = createVehicleMaterial(this.atlas, this.uniforms);
    this.fx = new FxLayer(this.q.maxFx);
    this.group.name = 'vehicles';
    this.group.add(this.fx.mesh);
    view.world.add(this.group);
    this.cockpit = new Cockpit(this.material, this.group);
    this.turretView = new TurretView(view.scene);
    this.lastNow = ctx.clock.now;
    this.unsubs.push(ctx.events.on('vehicle:removed', (e) => this.forget(e.id)));
    this.unsubs.push(ctx.events.on('vehicle:entered', (e) => this.onSeat(e.vehicleId, e.personId, e.seat)));
    this.unsubs.push(ctx.events.on('vehicle:exited', (e) => this.onSeat(e.vehicleId, e.personId, -1)));
    // les définitions déjà connues sont construites tout de suite (pas d'à-coup à la première apparition)
    const defs = ctx.vehicles.defs;
    for (let i = 0; i < defs.length; i++) this.entryFor(defs[i]!.kind, defs[i]!, true);
  }

  // ── modèles ────────────────────────────────────────────────────────────────────────
  private entryFor(kind: string, def: VehicleDef, prebuild = false): ModelEntry {
    const key = modelKey(kind, def);
    let e = this.entries.get(key);
    if (!e) {
      // seul le modèle lointain (léger) est bâti d'emblée ; le détaillé l'est à la demande ou au préchargement
      const far = buildModel(kind, def, true);
      e = { key, kind, def, meta: far.meta, near: null, far: null };
      e.far = new InstancePool(far.data, this.material, 16, false);
      this.group.add(e.far.mesh);
      this.entries.set(key, e);
      this.entryList.push(e);
      this.stats.models++;
    }
    if (prebuild && !e.near) this.buildNear(e);
    return e;
  }

  private buildNear(e: ModelEntry): InstancePool {
    const near = buildModel(e.kind, e.def, false);
    e.meta = near.meta;
    e.near = new InstancePool(near.data, this.material, 8, this.q.shadows && this.ctx.settings.values.shadows);
    this.group.add(e.near.mesh);
    this.stats.models++;
    return e.near;
  }

  private stateOf(v: Vehicle): VState {
    let st = this.states.get(v.id);
    if (!st) {
      st = {
        entry: this.entryFor(v.kind, v.def), def: v.def, lod: LOD_HIDDEN, wheel: 0, rotor: 0,
        door: new Float32Array(4), doorTimer: new Float32Array(4), doorHold: new Uint8Array(4), doorsActive: false,
        phase: beaconPhaseFor(v.id), pattern: beaconPatternFor(v.kind), char: v.state === 'burnt' ? 1 : 0,
        seed: beaconPhaseFor(v.id * 7 + 3) * 0.98 + 0.01, colorHex: -1, r: 1, g: 1, b: 1, stamp: 0, seatDoor: null,
      };
      this.states.set(v.id, st);
    } else if (st.def !== v.def) {
      st.def = v.def;
      st.entry = this.entryFor(v.kind, v.def);
      st.seatDoor = null;
    }
    if (st.colorHex !== v.color) {
      st.colorHex = v.color;
      st.r = SRGB_TO_LINEAR[(v.color >> 16) & 255]!;
      st.g = SRGB_TO_LINEAR[(v.color >> 8) & 255]!;
      st.b = SRGB_TO_LINEAR[v.color & 255]!;
    }
    return st;
  }

  private forget(id: number): void {
    this.states.delete(id);
    this.plates.release(id);
  }

  /** Rend le projecteur des phares au rendu de base (fin de session, reconstruction). */
  private releaseLights(): void {
    if (this.headSpot) { this.headSpot.release(); this.headSpot = null; }
  }

  /** Porte associée à chaque siège : la plus proche de son point de sortie. */
  private seatDoors(st: VState, v: Vehicle): Int8Array {
    const seats = v.def.seats;
    const map = new Int8Array(seats.length);
    for (let i = 0; i < seats.length; i++) map[i] = this.nearestDoor(st.entry.meta, -seats[i]!.exitX, seats[i]!.exitZ);
    st.seatDoor = map;
    return map;
  }

  // ── portes ─────────────────────────────────────────────────────────────────────────
  /** Porte la plus proche d'un point du repère Three local du véhicule (−1 si le modèle n'a pas de porte). */
  private nearestDoor(meta: ModelMeta, lx: number, lz: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < meta.doors.length; i++) {
      const d = meta.doors[i]!;
      // le côté compte double : on ne sort pas par la porte d'en face
      const dx = (d.x - lx) * 2, dz = d.z - lz;
      const dist = dx * dx + dz * dz;
      if (dist < bestD) { bestD = dist; best = d.index; }
    }
    return best;
  }

  private onSeat(vehicleId: number, personId: number, seat: number): void {
    // la simulation des véhicules publie l'ouverture réelle des portes : dans ce cas on la suit, sans doublon
    if (this.ext) return;
    const v = this.ctx.vehicles.get(vehicleId);
    if (!v) return;
    const st = this.stateOf(v);
    let lx = 0, lz = 0;
    const sd = seat >= 0 ? v.def.seats[seat] : undefined;
    if (sd) { lx = -sd.x; lz = sd.z; } else {
      const p = this.ctx.people.get(personId);
      if (!p) return;
      const dx = p.x - v.x, dz = p.z - v.z;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      lx = dx * c - dz * s;
      lz = dx * s + dz * c;
    }
    const door = this.nearestDoor(st.entry.meta, lx, lz);
    if (door >= 0) { st.doorTimer[door] = 1.7; st.doorsActive = true; }
  }

  setDoor(vehicleId: number, door: number, open: boolean): void {
    const v = this.ctx.vehicles.get(vehicleId);
    if (!v || door < 0 || door > 3) return;
    const st = this.stateOf(v);
    st.doorHold[door] = open ? 1 : 0;
    st.doorsActive = true;
  }

  pulseDoor(vehicleId: number, door: number, seconds = 1.7): void {
    const v = this.ctx.vehicles.get(vehicleId);
    if (!v || door < 0 || door > 3) return;
    const st = this.stateOf(v);
    st.doorTimer[door] = seconds;
    st.doorsActive = true;
  }

  private animateDoors(st: VState, dt: number): void {
    let active = false;
    for (let i = 0; i < 4; i++) {
      if (st.doorTimer[i]! > 0) st.doorTimer[i] = Math.max(0, st.doorTimer[i]! - dt);
      const target = st.doorHold[i] === 1 || st.doorTimer[i]! > 0.35 ? 1 : 0;
      const cur = st.door[i]!;
      const next = target > cur ? Math.min(target, cur + dt * 3.2) : Math.max(target, cur - dt * 2.8);
      st.door[i] = next;
      if (next > 0 || st.doorTimer[i]! > 0 || st.doorHold[i] === 1) active = true;
    }
    st.doorsActive = active;
  }

  invalidate(): void {
    this.releaseLights();
    for (const e of this.entryList) { e.near?.dispose(); e.far?.dispose(); }
    this.entries.clear();
    this.entryList.length = 0;
    this.states.clear();
    this.plates.clear();
    this.stats.models = 0;
    this.cockpit.invalidate();
  }

  reset(): void {
    this.releaseLights();
    this.states.clear();
    this.plates.clear();
    this.nearScale = 1;
    this.lastNow = this.ctx.clock.now;
  }

  // ── image ──────────────────────────────────────────────────────────────────────────
  frame(dtReal: number): void {
    const t0 = performance.now();
    const ctx = this.ctx, view = this.view;
    if (view.quality !== this.quality) {
      this.quality = view.quality;
      this.q = VEHICLE_QUALITY[this.quality];
    }
    const q = this.q;
    const now = ctx.clock.now;
    let simDt = now - this.lastNow;
    this.lastNow = now;
    if (!(simDt > 0)) simDt = 0; else if (simDt > 0.25) simDt = 0.25;
    if (ctx.session.phase !== 'paused') this.blinkT += dtReal > 0.1 ? 0.1 : dtReal;
    const blink = this.blinkT;
    this.stamp++;

    // ambiance : nuit, reflet du ciel sur les vitres
    const env = ctx.env.state;
    const day = env.daylight;
    const night = 1 - day;
    this.uniforms.uSky.value.setRGB(0.1 + 0.5 * day, 0.14 + 0.58 * day, 0.2 + 0.68 * day);
    this.uniforms.uLampGain.value = 2.2 + 2.4 * night;
    const shadows = q.shadows && ctx.settings.values.shadows;

    const cam = view.camera;
    const cx = view.camX, cy = view.camY, cz = view.camZ;
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    // vue annexe active (service facultatif du rendu de base)
    const aux = ctx.service<RenderAuxApi>('render.aux');
    const auxOn = !!aux && aux.active && !!aux.target && !!aux.camera;
    let auxX = 0, auxY = 0, auxZ = 0, auxR2 = 0;
    if (auxOn) {
      const ac = aux!.camera;
      ac.updateMatrixWorld();
      this.auxMatrix.copy(ac.matrixWorld).invert().premultiply(ac.projectionMatrix);
      this.auxFrustum.setFromProjectionMatrix(this.auxMatrix);
      const ae = ac.matrixWorld.elements;
      auxX = ae[12]!; auxY = ae[13]!; auxZ = ae[14]!;
      auxR2 = aux!.range * aux!.range;
    }
    const entries = this.entryList;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      e.far!.begin();
      if (e.near) { e.near.begin(); e.near.mesh.castShadow = shadows; }
    }
    const fx = this.fx;
    fx.begin(cam);
    // services facultatifs : lumières dynamiques du rendu de base, ouverture des portes de la simulation
    const lights = ctx.service<RenderLightsApi>(RENDER_LIGHTS_KEY);
    this.lightsApi = lights && typeof lights.pulse === 'function' && typeof lights.spot === 'function' ? lights : null;
    this.pulses = 0;
    const ext = ctx.service<VehiclesExtApi>(VEHICLES_EXT_KEY);
    this.ext = ext && typeof ext.doorOpen === 'function' ? ext : null;

    const player = ctx.player;
    const mode = player.state.cameraMode;
    const pv = mode === 'vehicle_int' || mode === 'turret' ? player.vehicle() : null;
    let cockpitFor: Vehicle | null = null;
    let cockpitState: VState | null = null;

    let nNear = 0, nFar = 0, nHidden = 0;
    const list = ctx.vehicles.list;
    const drawDistance = view.drawDistance;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.dormant) continue;
      const st = this.stateOf(v);
      st.stamp = this.stamp;
      const meta = st.entry.meta;
      const def = v.def;
      const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lod = chooseLod(st.lod, dist, def.length, q, drawDistance, this.nearScale);
      st.lod = lod;

      // animation (toujours suivie : un véhicule qui revient dans le champ garde des roues cohérentes)
      if (meta.wheelRadius > 0) st.wheel = advanceWheelAngle(st.wheel, v.speed, simDt, meta.wheelRadius);
      if (meta.rotor && v.engineOn) {
        st.rotor += simDt * (v.kind === 'drone' ? 310 : 41);
        if (st.rotor > 6283.185) st.rotor -= 6283.185;
      }
      if (st.doorsActive) this.animateDoors(st, simDt > 0 ? simDt : dtReal > 0.05 ? 0.05 : dtReal);
      if (this.ext && lod === LOD_NEAR && dist < 60 && meta.doors.length > 0) this.readDoors(st, v);
      const state = v.state;
      if (state === 'burnt') st.char = st.char + (1 - st.char) * Math.min(1, simDt * 1.5 + (st.char > 0.999 ? 1 : 0));
      else if (state === 'burning') st.char = Math.min(0.82, st.char + simDt * (0.006 + 0.02 * v.burning));
      else if (state === 'ok') st.char = 0;

      const hideExterior = pv === v && mode === 'vehicle_int' && meta.cockpit !== 'none' && meta.cockpit !== 'bike';
      if (pv === v) { cockpitFor = v; cockpitState = st; }

      // feux
      const dead = state === 'wrecked' || state === 'burnt' || state === 'burning';
      let bA = 0, bB = 0;
      if (v.beacons && !dead) {
        bA = beaconLevel(st.pattern, blink, 0, st.phase);
        bB = beaconLevel(st.pattern, blink, 1, st.phase);
      }
      const head = v.headlights && !dead ? 1 : 0;
      const brake = v.braking && !dead ? 1 : 0;
      const indOn = v.indicator !== 0 && !dead && indicatorOn(blink);
      const fire = state === 'burning' ? v.burning * (0.75 + 0.25 * Math.sin(blink * 17 + st.seed * 40) * Math.sin(blink * 7.3)) : 0;

      // hors du champ principal (ou trop loin) : dessiné quand même, en lointain, s'il est dans celui de la vue annexe
      this.sphere.center.set(v.x, v.y + def.height * 0.5, v.z);
      this.sphere.radius = def.length * 0.62 + (meta.rotor ? 5.5 : 2.5);
      let drawLod = lod;
      let shown = lod !== LOD_HIDDEN && this.frustum.intersectsSphere(this.sphere);
      if (!shown && auxOn) {
        const ex = v.x - auxX, ey = v.y - auxY, ez = v.z - auxZ;
        if (ex * ex + ey * ey + ez * ez <= auxR2 && this.auxFrustum.intersectsSphere(this.sphere)) {
          shown = true;
          drawLod = LOD_FAR;
        }
      }
      if (!hideExterior) {
        if (!shown) {
          nHidden++;
        } else {
          let pool: InstancePool;
          if (drawLod === LOD_NEAR) { pool = st.entry.near ?? this.buildNear(st.entry); nNear++; } else { pool = st.entry.far!; nFar++; }
          const k = pool.next();
          composeVehicleMatrix(pool.matrix, k * 16, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
          const o = k * 4;
          const dmg = state === 'ok' ? (v.health < 75 ? (75 - v.health) * 0.008 : 0)
            : state === 'damaged' ? 0.45 + (50 - Math.min(50, v.health)) * 0.007 : 1;
          pool.color[o] = st.r; pool.color[o + 1] = st.g; pool.color[o + 2] = st.b;
          pool.color[o + 3] = st.doorsActive ? pack4(st.door[0]!, st.door[1]!, st.door[2]!, st.door[3]!) : 0;
          pool.anim[o] = st.wheel;
          pool.anim[o + 1] = steerToThree(v.steerAngle);
          pool.anim[o + 2] = st.rotor;
          pool.anim[o + 3] = (drawLod === LOD_NEAR ? this.plates.slot(v.id, v.plate) : 0) + st.seed;
          const ty = v.turretYaw, tp = v.turretPitch;
          pool.turret[o] = ty.length > 0 ? turretYawToThree(ty[0]!) : 0;
          pool.turret[o + 1] = tp.length > 0 ? turretPitchToThree(tp[0]!) : 0;
          pool.turret[o + 2] = ty.length > 1 ? turretYawToThree(ty[1]!) : 0;
          pool.turret[o + 3] = tp.length > 1 ? turretPitchToThree(tp[1]!) : 0;
          const sagK = state === 'burnt' ? 1 : state === 'wrecked' ? 0.3 : st.char > 0.5 ? (st.char - 0.5) * 0.6 : 0;
          pool.state[o] = dmg > 1 ? 1 : dmg;
          pool.state[o + 1] = st.char;
          pool.state[o + 2] = fire;
          pool.state[o + 3] = meta.sag * sagK;
          pool.light[o] = pack2(head, head);
          pool.light[o + 1] = pack2(brake, v.speed < -0.25 && !dead ? 1 : 0);
          pool.light[o + 2] = pack2(indOn && v.indicator < 0 ? 1 : 0, indOn && v.indicator > 0 ? 1 : 0);
          pool.light[o + 3] = pack2(bA, bB);
        }
      }

      // effets lumineux
      const inside = pv === v && mode === 'vehicle_int';
      if (dist < q.glow && (bA > 0 || bB > 0 || head > 0 || brake > 0 || indOn || state === 'burning')) {
        this.emitFx(v, st, meta, dist, night, bA, bB, head, brake, fire, inside);
      }
      // éclairs bleus sur les façades proches, lueur d'incendie : lumières « à l'image » du rendu de base, qui
      // attribue ses quelques vraies lumières aux plus importantes pour la caméra
      const burning = state === 'burning' && v.burning > 0.02;
      const beacon = bA > bB ? bA : bB;
      if (this.lightsApi && this.pulses < MAX_PULSES && dist < 130 && (burning || (beacon > 0 && meta.beaconA.length > 0))) {
        this.pulseLight(v, meta, burning, beacon, fire, inside);
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      e.far!.end();
      if (e.near) e.near.end();
    }
    this.plates.flush();
    this.nearScale = adaptNearScale(this.nearScale, nNear, q.maxNear);

    // habitacle, écran de tourelle, projecteur des phares du joueur
    const cs = cockpitState as VState | null;
    if (cockpitFor && cs && mode === 'vehicle_int') this.cockpit.update(cockpitFor, cs.entry.meta, cs.r, cs.g, cs.b, blink, night);
    else this.cockpit.update(null, null, 1, 1, 1, blink, night);
    this.turretView.update(mode === 'turret' ? cockpitFor : null, ctx, view, blink);
    this.updateHeadlamp(pv ?? player.vehicle());
    fx.end();

    // ménage périodique des états orphelins (véhicules retirés sans événement)
    if (++this.sweep >= 600) {
      this.sweep = 0;
      for (const [id] of this.states) if (!ctx.vehicles.get(id)) this.forget(id);
    }

    // mesures
    let calls = fx.count > 0 ? 1 : 0, tris = fx.count * 2;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.far!.count > 0) { calls++; tris += e.far!.count * e.far!.triangles; }
      if (e.near && e.near.count > 0) { calls++; tris += e.near.count * e.near.triangles; }
    }
    calls += this.cockpit.drawCalls + this.turretView.drawCalls;
    tris += this.cockpit.triangles;
    const s = this.stats;
    s.near = nNear; s.far = nFar; s.hidden = nHidden; s.drawCalls = calls; s.triangles = tris; s.fx = fx.count;
    s.cpuMs = performance.now() - t0;
    s.cpuMsAvg = s.cpuMsAvg === 0 ? s.cpuMs : s.cpuMsAvg * 0.95 + s.cpuMs * 0.05;
  }

  /** Éclats, halos au sol, faisceaux, flammes et fumée d'un véhicule. */
  private emitFx(v: Vehicle, st: VState, meta: ModelMeta, dist: number, night: number, bA: number, bB: number, head: number, brake: number, fire: number, inside: boolean): void {
    const fx = this.fx;
    const tmp = this.tmp;
    // la matrice du véhicule est recomposée dans un tampon local (le lot d'instances peut ne pas contenir ce véhicule)
    const m = MAT;
    composeVehicleMatrix(m, 0, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
    const fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading);
    const k = 0.55 + 0.45 * night;                 // les éclats sont plus discrets en plein jour
    const size = (0.4 + 0.5 * night) * (1 + dist * 0.014);
    if (!inside) {
      if (bA > 0) for (let i = 0; i + 2 < meta.beaconA.length; i += 3) {
        transformPoint(m, 0, meta.beaconA[i]!, meta.beaconA[i + 1]!, meta.beaconA[i + 2]!, tmp);
        fx.sprite(tmp.x, tmp.y, tmp.z, size, BLUE_R, BLUE_G, BLUE_B, bA * k * 1.5);
      }
      if (bB > 0) for (let i = 0; i + 2 < meta.beaconB.length; i += 3) {
        transformPoint(m, 0, meta.beaconB[i]!, meta.beaconB[i + 1]!, meta.beaconB[i + 2]!, tmp);
        fx.sprite(tmp.x, tmp.y, tmp.z, size, BLUE_R, BLUE_G, BLUE_B, bB * k * 1.5);
      }
      if (head > 0) for (let i = 0; i + 2 < meta.head.length; i += 3) {
        transformPoint(m, 0, meta.head[i]!, meta.head[i + 1]!, meta.head[i + 2]!, tmp);
        fx.sprite(tmp.x, tmp.y, tmp.z, size * 0.9, 1.0, 0.93, 0.78, k * 0.8);
      }
      if (head > 0 || brake > 0) for (let i = 0; i + 2 < meta.tail.length; i += 3) {
        transformPoint(m, 0, meta.tail[i]!, meta.tail[i + 1]!, meta.tail[i + 2]!, tmp);
        fx.sprite(tmp.x, tmp.y, tmp.z, size * (brake > 0 ? 0.6 : 0.4), 1.0, 0.04, 0.02, k * (brake > 0 ? 1.0 : 0.4));
      }
    }
    const beacon = bA > bB ? bA : bB;
    const hl = v.def.length * 0.5;
    if (night > 0.25) {
      const gy = v.y + 0.04;
      if (beacon > 0 && meta.beaconA.length > 0) {
        const bz = meta.beaconA[2]!;
        fx.ground(FX_POOL, v.x + fwdX * bz, gy, v.z + fwdZ * bz, fwdX, fwdZ, 15, 15, BLUE_R, BLUE_G, BLUE_B, beacon * night * 0.34);
      }
      if (head > 0 && meta.head.length > 0 && dist < 110) {
        // faisceau discret : dans un embouteillage, des dizaines de faisceaux se superposent
        fx.ground(FX_BEAM, v.x + fwdX * (hl + 9.5), gy, v.z + fwdZ * (hl + 9.5), fwdX, fwdZ, 13, 20, 1.0, 0.92, 0.76, night * 0.13);
      }
      if (brake > 0 && meta.tail.length > 0) {
        fx.ground(FX_POOL, v.x - fwdX * (hl + 1.2), gy, v.z - fwdZ * (hl + 1.2), fwdX, fwdZ, 3.5, 3.5, 1.0, 0.05, 0.03, night * 0.3);
      }
    }
    if (v.state === 'burning') {
      const b = v.burning;
      if (this.ownFire && b > 0.02) {
        const t = this.blinkT;
        const scale = Math.max(0.5, Math.min(2.4, v.def.length * 0.28)) * (0.55 + 0.6 * b);
        for (let i = 0; i + 2 < meta.fire.length; i += 3) {
          transformPoint(m, 0, meta.fire[i]!, meta.fire[i + 1]! * 0.55, meta.fire[i + 2]!, tmp);
          const sd = st.seed + i * 0.37;
          fx.upright(FX_FLAME, tmp.x, tmp.y, tmp.z, scale * 1.25, scale * 1.7, 1, 1, 1, 0.5 + 0.3 * b, sd, t);
          fx.upright(FX_FLAME, tmp.x + fwdX * 0.35, tmp.y + scale * 0.25, tmp.z + fwdZ * 0.35, scale * 0.8, scale * 1.25, 1, 1, 1, 0.42 + 0.25 * b, sd + 0.5, t * 1.13);
          // colonne de fumée noire
          for (let j = 0; j < 3; j++) {
            const ph = (t * 0.22 + j / 3 + sd) % 1;
            fx.upright(FX_SMOKE, tmp.x + Math.sin(sd * 9 + j) * 0.3 * ph, tmp.y + scale * (1.0 + ph * 4.5), tmp.z + Math.cos(sd * 7 + j) * 0.3 * ph, scale * (1.4 + ph * 2.4), scale * (1.4 + ph * 2.4), 0.012, 0.011, 0.01, (1 - ph) * 0.6 * b, sd + j, t);
          }
        }
        if (night > 0.2) fx.ground(FX_POOL, v.x, v.y + 0.05, v.z, fwdX, fwdZ, 9, 9, 1.0, 0.42, 0.1, night * 0.5 * (0.6 + 0.4 * fire));
      }
    }
  }

  /** Gyrophare ou incendie : lumière ponctuelle valable pour l'image (intensités accordées à l'exposition du rendu de base). */
  private pulseLight(v: Vehicle, meta: ModelMeta, burning: boolean, beacon: number, fire: number, inside: boolean): void {
    composeVehicleMatrix(MAT, 0, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
    const tmp = this.tmp;
    this.pulses++;
    if (burning) {
      transformPoint(MAT, 0, 0, v.def.height * 0.7 + 0.6, 0, tmp);
      this.lightsApi!.pulse(tmp.x, tmp.y, tmp.z, 0xff7a1c, 150 * v.burning * (0.7 + 0.3 * fire), 24);
      return;
    }
    // au-dessus de la rampe ; pour le véhicule du joueur en vue intérieure, plus haut et atténuée (une lumière
    // ponctuelle n'est pas arrêtée par le pavillon : elle inonderait l'habitacle)
    transformPoint(MAT, 0, 0, meta.beaconA[1]! + (inside ? 2.2 : 0.7), meta.beaconA[2]!, tmp);
    this.lightsApi!.pulse(tmp.x, tmp.y, tmp.z, 0x1e5bff, (inside ? 6 : 18) * beacon, 20);
  }

  /** Ouverture des portes publiée par la simulation ('vehicles.ext') : la plus ouverte des portes de chaque siège. */
  private readDoors(st: VState, v: Vehicle): void {
    const map = st.seatDoor ?? this.seatDoors(st, v);
    const o = this.extDoor;
    o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 0;
    const n = map.length < 16 ? map.length : 16;
    let any = false;
    for (let i = 0; i < n; i++) {
      const d = map[i]!;
      if (d < 0) continue;
      const open = this.ext!.doorOpen(v, i);
      if (open > o[d]!) { o[d] = open; any = true; }
    }
    if (!any && !st.doorsActive) return;
    for (let d = 0; d < 4; d++) {
      // une porte tenue ouverte par l'API du rendu le reste
      const held = st.doorHold[d] === 1 || st.doorTimer[d]! > 0.35 ? 1 : 0;
      st.door[d] = o[d]! > held ? o[d]! : held > 0 ? Math.max(st.door[d]!, o[d]!) : o[d]!;
    }
    st.doorsActive = any || st.doorHold[0] === 1 || st.doorHold[1] === 1 || st.doorHold[2] === 1 || st.doorHold[3] === 1
      || st.doorTimer[0]! > 0 || st.doorTimer[1]! > 0 || st.doorTimer[2]! > 0 || st.doorTimer[3]! > 0;
  }

  /** Phares du véhicule du joueur : un vrai projecteur, demandé au rendu de base (sinon simples optiques émissives). */
  private updateHeadlamp(v: Vehicle | null): void {
    const api = this.lightsApi;
    if (!api || !this.q.playerHeadlamp) {
      if (this.headSpot) this.headSpot.enabled = false;
      return;
    }
    if (!v || !v.headlights || v.state === 'burnt' || v.state === 'wrecked' || v.state === 'burning') {
      if (this.headSpot) this.headSpot.enabled = false;
      return;
    }
    let l = this.headSpot;
    if (!l) { l = api.spot({ color: 0xfff1d6, intensity: 150, range: 60, angle: 0.52, penumbra: 0.6, priority: 1 }); this.headSpot = l; }
    const hl = v.def.length * 0.5;
    vehiclePointToWorld(v, 0, Math.min(1.1, v.def.height * 0.45), hl + 0.1, this.tmp);
    vehiclePointToWorld(v, 0, 0, hl + 24, this.tmp2);
    l.enabled = true;
    l.x = this.tmp.x; l.y = this.tmp.y; l.z = this.tmp.z;
    l.dirX = this.tmp2.x - this.tmp.x; l.dirY = this.tmp2.y - this.tmp.y; l.dirZ = this.tmp2.z - this.tmp.z;
  }

  dispose(): void {
    this.releaseLights();
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    for (const e of this.entryList) { e.near?.dispose(); e.far?.dispose(); }
    this.fx.dispose();
    this.cockpit.dispose();
    this.turretView.dispose();
    this.material.dispose();
    this.atlas.dispose();
    this.plates.dispose();
    this.group.removeFromParent();
  }
}

/** Tampon de matrice réutilisé par emitFx() et pulseLight(). */
const MAT = new Float32Array(16);
/** Nombre maximal de lumières « à l'image » demandées par image (les plus proches d'abord dans l'ordre de la liste). */
const MAX_PULSES = 24;
