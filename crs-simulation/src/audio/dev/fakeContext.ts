/* =====================================================================================
 * Contexte de jeu factice pour le banc d'essai et les tests du module audio (hors jeu livré).
 * N'implémente que ce que le module audio consomme : bus d'événements, réglages, personnes,
 * véhicules, vitrines, monde (surface, vue directe), météo, directeur de foule, joueur, caméra.
 * Volontairement autonome : ne dépend que de src/core/contracts.ts.
 * ===================================================================================== */

import type {
  CrowdPhase, EntityId, EnvState, EventBus, GameContext, Person, PersonKind, Faction, Settings, Shop,
  SurfaceKind, Vehicle, VehicleDef, VehicleKind, Prop, SessionPhase,
} from '@/core/contracts';

type Handler = (payload: unknown) => void;

function createBus(): EventBus {
  const map = new Map<string, Handler[]>();
  const on = (name: string, h: Handler): (() => void) => {
    let list = map.get(name);
    if (!list) map.set(name, (list = []));
    list.push(h);
    return () => {
      const l = map.get(name);
      if (!l) return;
      const i = l.indexOf(h);
      if (i >= 0) l.splice(i, 1);
    };
  };
  const emit = (name: string, payload: unknown): void => {
    const l = map.get(name);
    if (!l) return;
    for (const h of l.slice()) h(payload);
  };
  return {
    on: (name, handler) => on(name, handler as Handler),
    once: (name, handler) => {
      const off = on(name, (p) => {
        off();
        (handler as Handler)(p);
      });
      return off;
    },
    emit: (name, payload) => emit(name, payload),
    onAny: (name, handler) => on(name, handler),
    emitAny: (name, payload) => emit(name, payload),
  };
}

export function defaultSettings(): Settings {
  return {
    quality: 'moyen', renderScale: 1, shadows: true, crowdScale: 1, drawDistance: 400, fov: 70,
    mouseSensitivity: 1, gamepadSensitivity: 1, touchSensitivity: 1, invertY: false,
    volumeMaster: 0.8, volumeEffects: 1, volumeVoices: 1, volumeAmbience: 0.8,
    voiceSynthesis: true, subtitles: true, violence: 'realiste', hudMarkers: true, aimAssist: true,
    vibration: true, showFps: false,
  };
}

export function makePerson(id: EntityId, kind: PersonKind, faction: Faction, x: number, z: number): Person {
  return {
    id, kind, faction, name: 'Personne ' + id,
    x, z, y: 0, vx: 0, vz: 0, heading: 0, aimYaw: 0, aimPitch: 0, radius: 0.28,
    speedWalk: 1.4, speedRun: 3.6, speedSprint: 6,
    health: 100, injury: 'none', stamina: 100, gas: 0, stun: 0, burning: 0, wet: 0,
    posture: 'stand', upper: 'none', upperT: 0, armorHead: 0, armorBody: 0, gasProtection: 0,
    fear: 0, anger: 0, profile: faction === 'protest' ? 'pacifique' : null,
    rank: null, poste: null, rio: '',
    inventory: [], active: -1, alt: false,
    look: {
      height: 1.75, build: 1, skin: 0xd8b094, hair: 0x222222, hairStyle: 1, top: 0x334455, bottom: 0x222222,
      shoes: 0x111111, outfit: 'civil', headgear: 'none', visorDown: false, gasMask: false, faceCover: false,
      backText: '', sash: false, armband: 0, vest: 0, rankBars: 0, backpack: false,
    },
    squadId: 0, vehicleId: 0, seat: -1, carrying: 0, heldBy: 0,
    offenses: [], custody: 'free', isPlayer: false,
    cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: 0, aimPitch: 0, faceMove: true, crouch: false, jump: false },
    brain: null, dormant: false,
  };
}

export function makeVehicleDef(kind: VehicleKind, faction: Faction): VehicleDef {
  return {
    kind, name: String(kind), faction, length: 5, width: 2, height: 2, mass: 2000, wheelbase: 3,
    maxSpeed: 35, maxReverse: 8, accel: 3, brake: 8, maxSteer: 0.6, seats: [],
    turrets: kind === 'canon_eau'
      ? [{ kind: 'canon_eau', x: 0, y: 3, z: 1, yawMin: -3, yawMax: 3, pitchMin: -0.2, pitchMax: 0.6, capacity: 8000, interval: 0.1 }]
      : kind === 'centaure'
        ? [{ kind: 'lance_grenades', x: 0, y: 3, z: 0, yawMin: -3, yawMax: 3, pitchMin: 0, pitchMax: 1, capacity: 30, interval: 0.3 }]
        : [],
    armored: false, canPush: false, hasSiren: true, hasBeacons: true, color: 0xffffff, flying: kind === 'drone',
  };
}

export function makeVehicle(id: EntityId, kind: VehicleKind, faction: Faction, x: number, z: number): Vehicle {
  return {
    id, kind, def: makeVehicleDef(kind, faction), faction,
    x, y: 0, z, heading: 0, pitch: 0, roll: 0, vx: 0, vz: 0, vy: 0, speed: 0, yawRate: 0, steerAngle: 0,
    rpm: 0, gear: 1, health: 100, state: 'ok', burning: 0, siren: 0, beacons: false, headlights: false,
    indicator: 0, braking: false, seats: [], turretYaw: [], turretPitch: [], turretAmmo: [],
    color: 0xffffff, plate: 'AA-000-AA', locked: false, engineOn: false,
    cmd: { throttle: 0, steer: 0, brake: 0, handbrake: false, horn: false, lift: 0, strafe: 0 },
    brain: null, dormant: false,
  };
}

export interface FakeWorldState {
  people: Person[];
  vehicles: Vehicle[];
  shops: Shop[];
  props: Prop[];
  env: EnvState;
  settings: Settings;
  director: { phase: CrowdPhase; tension: number };
  player: { personId: EntityId; camYaw: number; cameraMode: GameContext['player']['state']['cameraMode'] };
  camera: { camX: number; camY: number; camZ: number } | null;
  session: { phase: SessionPhase };
  /** Surface sous un point (défaut : chaussée). */
  surface: (x: number, z: number) => SurfaceKind;
  /** Murs (segments ax, az, bx, bz) qui coupent la vue directe. */
  walls: [number, number, number, number][];
  fire: (x: number, z: number) => number;
  nextId: number;
}

export interface FakeContext {
  ctx: GameContext;
  state: FakeWorldState;
  addPerson(kind: PersonKind, faction: Faction, x: number, z: number): Person;
  addVehicle(kind: VehicleKind, faction: Faction, x: number, z: number): Vehicle;
  addShop(x: number, z: number): Shop;
}

function segmentsCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number =>
    (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(ax, az, bx, bz, cx, cz);
  const d2 = o(ax, az, bx, bz, dx, dz);
  const d3 = o(cx, cz, dx, dz, ax, az);
  const d4 = o(cx, cz, dx, dz, bx, bz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function createFakeContext(headless = false): FakeContext {
  const state: FakeWorldState = {
    people: [], vehicles: [], shops: [], props: [],
    env: {
      timeOfDay: 15, clockScale: 1, weather: 'clair', rain: 0, fog: 0, clouds: 0.2, wetness: 0,
      windX: 0, windZ: 0, sunX: 0.3, sunY: 0.8, sunZ: 0.5, daylight: 1, isNight: false, streetLights: false,
    },
    settings: defaultSettings(),
    director: { phase: 'aucune', tension: 0 },
    player: { personId: 0, camYaw: 0, cameraMode: 'fps' },
    camera: headless ? null : { camX: 0, camY: 1.7, camZ: 0 },
    session: { phase: 'playing' },
    surface: () => 'road',
    walls: [],
    fire: () => 0,
    nextId: 1,
  };
  const events = createBus();
  const services = new Map<string, unknown>();
  const findPerson = (id: EntityId): Person | undefined => state.people.find((p) => p.id === id);
  const findVehicle = (id: EntityId): Vehicle | undefined => state.vehicles.find((v) => v.id === id);

  const partial = {
    events,
    clock: { now: 0, dt: 1 / 60, tick: 0, timeScale: 1 },
    settings: {
      get values() { return state.settings; },
      set<K extends keyof Settings>(key: K, value: Settings[K]): void {
        state.settings[key] = value;
        events.emit('settings:changed', { key });
      },
      reset(): void { state.settings = defaultSettings(); },
    },
    session: {
      get phase() { return state.session.phase; },
      config: null,
      start: async () => undefined,
      end: () => undefined,
      pause: (paused: boolean) => {
        state.session.phase = paused ? 'paused' : 'playing';
        events.emit('session:paused', { paused });
      },
    },
    headless,
    people: {
      get list() { return state.people; },
      get: findPerson,
      queryRadius(x: number, z: number, r: number, out: Person[], filter?: (p: Person) => boolean): number {
        out.length = 0;
        const r2 = r * r;
        for (const p of state.people) {
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz <= r2 && (!filter || filter(p))) out.push(p);
        }
        return out.length;
      },
    },
    vehicles: { get list() { return state.vehicles; }, get: findVehicle },
    props: {
      get list() { return state.props; },
      get shops() { return state.shops; },
      get: (id: EntityId) => state.props.find((p) => p.id === id),
      shop: (id: EntityId) => state.shops.find((s) => s.id === id),
    },
    world: {
      heightAt: () => 0,
      surfaceAt: (x: number, z: number) => state.surface(x, z),
      lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
        for (const w of state.walls) if (segmentsCross(ax, az, bx, bz, w[0], w[1], w[2], w[3])) return false;
        return true;
      },
    },
    env: { get state() { return state.env; } },
    hazards: { fireAt: (x: number, z: number) => state.fire(x, z), gasAt: () => 0 },
    director: {
      get phase() { return state.director.phase; },
      get tension() { return state.director.tension; },
      tensionAt: () => state.director.tension,
    },
    player: {
      state: {
        get personId() { return state.player.personId; },
        get camYaw() { return state.player.camYaw; },
        get cameraMode() { return state.player.cameraMode; },
      },
      person: () => (state.player.personId ? findPerson(state.player.personId) ?? null : null),
      vehicle: () => {
        const p = state.player.personId ? findPerson(state.player.personId) : undefined;
        return p && p.vehicleId ? findVehicle(p.vehicleId) ?? null : null;
      },
    },
    get view() { return state.camera; },
    audio: { play: () => 0, stop: () => undefined, speak: () => undefined, setListener: () => undefined },
    provide<T>(key: string, service: T): void { services.set(key, service); },
    service<T>(key: string): T | undefined { return services.get(key) as T | undefined; },
    require<T>(key: string): T {
      const s = services.get(key);
      if (s === undefined) throw new Error(`service absent : ${key}`);
      return s as T;
    },
    newId: () => state.nextId++,
  };
  const ctx = partial as unknown as GameContext;

  return {
    ctx,
    state,
    addPerson(kind, faction, x, z) {
      const p = makePerson(state.nextId++, kind, faction, x, z);
      state.people.push(p);
      return p;
    },
    addVehicle(kind, faction, x, z) {
      const v = makeVehicle(state.nextId++, kind, faction, x, z);
      state.vehicles.push(v);
      return v;
    },
    addShop(x, z) {
      const s: Shop = {
        id: state.nextId++, name: 'Boutique fictive', category: 'mode', x, y: 0, z, heading: 0, width: 6,
        window: 'intact', shutter: 0, stock: 1, appeal: 0.5, burning: 0, occupants: 0, dormant: false,
      };
      state.shops.push(s);
      return s;
    },
  };
}
