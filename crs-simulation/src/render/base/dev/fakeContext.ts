/* Contexte de jeu factice pour le banc d'essai et les tests du rendu de base (hors jeu livré).
 * Autonome : ne dépend que de src/core/contracts.ts. Monde = plan horizontal semé d'immeubles-boîtes
 * (collisions et lancers de rayon réels), joueur, véhicules, entrées pilotables. */

import type {
  Button, CameraMode, EnvApi, EnvState, EventBus, GameContext, Person, PersonLook, PlayerState, Posture, RayHit, Rng,
  SessionConfig, Settings, Vehicle, VehicleDef, WeatherKind,
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

function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hashLabel = (label: string | number): number => {
    const str = String(label);
    let h = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    fork: (label) => createRng(hashLabel(label)),
  };
}

export function defaultSettings(): Settings {
  return {
    quality: 'haut', renderScale: 1, shadows: true, crowdScale: 1, drawDistance: 500, fov: 70,
    mouseSensitivity: 1, gamepadSensitivity: 1, touchSensitivity: 1, invertY: false,
    volumeMaster: 0.8, volumeEffects: 1, volumeVoices: 1, volumeAmbience: 0.8,
    voiceSynthesis: true, subtitles: true, violence: 'realiste', hudMarkers: true, aimAssist: true,
    vibration: true, showFps: false,
  };
}

/** Immeuble-boîte aligné sur les axes : emprise [x0, x1] × [z0, z1], hauteur h. */
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number }

/** Lancer de rayon 2D contre une boîte ; retourne la fraction d'entrée (ou -1) et écrit la normale. */
function rayBox(ax: number, az: number, bx: number, bz: number, b: Box, n: { x: number; z: number }): number {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  let nx = 0;
  let nz = 0;
  if (Math.abs(dx) < 1e-12) {
    if (ax < b.x0 || ax > b.x1) return -1;
  } else {
    let ta = (b.x0 - ax) / dx;
    let tb = (b.x1 - ax) / dx;
    let sn = -1;
    if (ta > tb) {
      const tmp = ta; ta = tb; tb = tmp;
      sn = 1;
    }
    if (ta > t0) {
      t0 = ta;
      nx = sn;
      nz = 0;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-12) {
    if (az < b.z0 || az > b.z1) return -1;
  } else {
    let ta = (b.z0 - az) / dz;
    let tb = (b.z1 - az) / dz;
    let sn = -1;
    if (ta > tb) {
      const tmp = ta; ta = tb; tb = tmp;
      sn = 1;
    }
    if (ta > t0) {
      t0 = ta;
      nx = 0;
      nz = sn;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  n.x = nx;
  n.z = nz;
  return t0;
}

export const DEFAULT_LOOK: PersonLook = {
  height: 1.78, build: 1, skin: 0xd9a47c, hair: 0x2a1c12, hairStyle: 1, top: 0x1b2440, bottom: 0x161c30, shoes: 0x111114,
  outfit: 'crs_mo', headgear: 'casque_crs', visorDown: false, gasMask: false, faceCover: false, backText: 'CRS', sash: false,
  armband: 0, vest: 0, rankBars: 0, backpack: false,
};

export function makePerson(id: number, x: number, z: number, heading: number, look: Partial<PersonLook> = {}): Person {
  return {
    id, kind: 'crs', faction: 'police', name: '', x, z, y: 0, vx: 0, vz: 0, heading, aimYaw: heading, aimPitch: 0,
    radius: 0.28, speedWalk: 1.4, speedRun: 3.5, speedSprint: 6, health: 100, injury: 'none', stamina: 100, gas: 0, stun: 0,
    burning: 0, wet: 0, posture: 'stand' as Posture, upper: 'none', upperT: 0, armorHead: 0, armorBody: 0, gasProtection: 0,
    fear: 0, anger: 0, profile: null, rank: null, poste: null, rio: '', inventory: [], active: -1, alt: false,
    look: { ...DEFAULT_LOOK, ...look }, squadId: 0, vehicleId: 0, seat: -1, carrying: 0, heldBy: 0, offenses: [],
    custody: 'free', isPlayer: false,
    cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: heading, aimPitch: 0, faceMove: true, crouch: false, jump: false },
    brain: null, dormant: false,
  };
}

export function makeVehicleDef(partial: Partial<VehicleDef> = {}): VehicleDef {
  return {
    kind: 'fourgon_crs', name: 'Fourgon', faction: 'police', length: 5.9, width: 2.05, height: 2.6, mass: 3500, wheelbase: 3.6,
    maxSpeed: 30, maxReverse: 6, accel: 2.4, brake: 7, maxSteer: 0.55,
    seats: [
      { role: 'driver', x: -0.5, y: 1.05, z: 1.55, exitX: -1.6, exitZ: 1.5 },
      { role: 'gunner', x: 0.5, y: 1.05, z: 1.55, exitX: 1.6, exitZ: 1.5 },
    ],
    turrets: [{ kind: 'lance_grenades', x: 0, y: 2.75, z: 0.2, yawMin: -3.14, yawMax: 3.14, pitchMin: -0.3, pitchMax: 1.1, capacity: 30, interval: 0.3 }],
    armored: false, canPush: false, hasSiren: true, hasBeacons: true, color: 0xf2f2f0, flying: false,
    ...partial,
  };
}

export function makeVehicle(id: number, def: VehicleDef, x: number, z: number, heading: number, y = 0): Vehicle {
  return {
    id, kind: def.kind, def, faction: def.faction, x, y, z, heading, pitch: 0, roll: 0, vx: 0, vz: 0, vy: 0, speed: 0,
    yawRate: 0, steerAngle: 0, rpm: 0, gear: 1, health: 100, state: 'ok', burning: 0, siren: 0, beacons: false,
    headlights: false, indicator: 0, braking: false, seats: def.seats.map(() => 0), turretYaw: def.turrets.map(() => 0),
    turretPitch: def.turrets.map(() => 0), turretAmmo: def.turrets.map((t) => t.capacity), color: def.color,
    plate: 'AB-123-CD', locked: false, engineOn: true,
    cmd: { throttle: 0, steer: 0, brake: 0, handbrake: false, horn: false, lift: 0, strafe: 0 }, brain: null, dormant: false,
  };
}

/** Leviers du contexte factice. */
export interface FakeRenderControls {
  readonly settings: Settings;
  readonly player: PlayerState;
  readonly people: Person[];
  readonly vehicles: Vehicle[];
  readonly boxes: Box[];
  /** Entrées simulées. */
  input: { moveX: number; moveY: number; lookX: number; lookY: number; down: Set<Button> };
  config: SessionConfig | null;
  modal: boolean;
  /** Hauteur du sol (par défaut : plan y = 0). */
  heightAt: (x: number, z: number) => number;
  /** Nombre de lancers de rayon demandés au monde (mesures). */
  raycasts: number;
  /** Rotation du repère des boîtes autour de la verticale (rad, comme Object3D.rotation.y). */
  frameYaw: number;
  addPerson(x: number, z: number, heading: number, look?: Partial<PersonLook>): Person;
  addVehicle(def: VehicleDef, x: number, z: number, heading: number, y?: number): Vehicle;
  /** Fait du personnage (et éventuellement du véhicule) celui du joueur. */
  possess(p: Person | null, v?: Vehicle | null, seat?: number): void;
  setCamera(mode: CameraMode): void;
}

export interface FakeRenderContext {
  ctx: GameContext;
  controls: FakeRenderControls;
}

/** Environnement neutre minimal (quand le module env n'est pas branché). */
function neutralEnv(): EnvApi {
  const state: EnvState = {
    timeOfDay: 12, clockScale: 1, weather: 'clair', rain: 0, fog: 0, clouds: 0.1, wetness: 0, windX: 0, windZ: 0,
    sunX: 0.3, sunY: 0.8, sunZ: 0.52, daylight: 1, isNight: false, streetLights: false,
  };
  return {
    state,
    setTime(hour: number): void {
      state.timeOfDay = hour;
    },
    setWeather(kind: WeatherKind): void {
      state.weather = kind;
    },
    setClockScale(scale: number): void {
      state.clockScale = scale;
    },
    setWind(x: number, z: number): void {
      state.windX = x;
      state.windZ = z;
    },
  };
}

export function createFakeRenderContext(options: { headless?: boolean; seed?: number } = {}): FakeRenderContext {
  const events = createBus();
  const services = new Map<string, unknown>();
  const settings = defaultSettings();
  let nextId = 1;
  const people: Person[] = [];
  const vehicles: Vehicle[] = [];
  const boxes: Box[] = [];
  const player: PlayerState = {
    personId: 0, role: 'crs', cameraMode: 'tps', camYaw: 0, camPitch: 0, zoom: 1, controlEnabled: true, charge: 0,
    prompt: null, aimedPersonId: 0, aimX: 0, aimZ: 0,
  };
  let playerVehicle: Vehicle | null = null;
  const normal = { x: 0, z: 0 };

  const controls: FakeRenderControls = {
    settings, player, people, vehicles, boxes,
    input: { moveX: 0, moveY: 0, lookX: 0, lookY: 0, down: new Set<Button>() },
    config: null,
    modal: false,
    heightAt: () => 0,
    raycasts: 0,
    frameYaw: 0,
    addPerson(x, z, heading, look): Person {
      const p = makePerson(nextId++, x, z, heading, look);
      p.y = controls.heightAt(x, z);
      people.push(p);
      return p;
    },
    addVehicle(def, x, z, heading, y = 0): Vehicle {
      const v = makeVehicle(nextId++, def, x, z, heading, y);
      vehicles.push(v);
      return v;
    },
    possess(p, v = null, seat = 0): void {
      for (const q of people) q.isPlayer = false;
      player.personId = p ? p.id : 0;
      playerVehicle = v;
      if (p) {
        p.isPlayer = true;
        p.vehicleId = v && !v.def.flying ? v.id : 0;
        p.seat = v && !v.def.flying ? seat : -1;
        if (v && !v.def.flying) v.seats[seat] = p.id;
      }
    },
    setCamera(mode): void {
      player.cameraMode = mode;
      events.emit('player:camera', { mode });
    },
  };

  const raycast = (wax: number, waz: number, wbx: number, wbz: number, out: RayHit): boolean => {
    controls.raycasts++;
    // passage dans le repère des boîtes
    const c = Math.cos(controls.frameYaw);
    const s = Math.sin(controls.frameYaw);
    const ax = wax * c - waz * s;
    const az = wax * s + waz * c;
    const bx = wbx * c - wbz * s;
    const bz = wbx * s + wbz * c;
    let best = 2;
    let bestBox: Box | null = null;
    let bnx = 0;
    let bnz = 0;
    for (let i = 0; i < boxes.length; i++) {
      const t = rayBox(ax, az, bx, bz, boxes[i]!, normal);
      if (t >= 0 && t < best) {
        best = t;
        bestBox = boxes[i]!;
        bnx = normal.x;
        bnz = normal.z;
      }
    }
    if (!bestBox) {
      out.hit = false;
      out.t = 1;
      out.kind = 'none';
      return false;
    }
    out.hit = true;
    out.t = best;
    out.x = wax + (wbx - wax) * best;
    out.z = waz + (wbz - waz) * best;
    out.nx = bnx * c + bnz * s;
    out.nz = -bnx * s + bnz * c;
    out.kind = 'building';
    out.id = 0;
    out.height = bestBox.h;
    return true;
  };

  const inBox = (wx: number, wz: number, r: number): Box | null => {
    const c = Math.cos(controls.frameYaw);
    const s = Math.sin(controls.frameYaw);
    const x = wx * c - wz * s;
    const z = wx * s + wz * c;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return b;
    }
    return null;
  };

  const ctx = {
    events,
    headless: options.headless ?? false,
    view: null,
    rng: createRng(options.seed ?? 1),
    clock: { now: 0, dt: 0, tick: 0, timeScale: 1 },
    settings: {
      values: settings,
      set(key: keyof Settings, value: never): void {
        (settings as unknown as Record<string, unknown>)[key] = value;
        events.emit('settings:changed', { key });
      },
      reset(): void {
        Object.assign(settings, defaultSettings());
      },
    },
    session: {
      phase: 'playing',
      get config(): SessionConfig | null {
        return controls.config;
      },
    },
    env: neutralEnv(),
    world: {
      ready: true,
      bounds: { minX: -2000, minZ: -2000, maxX: 2000, maxZ: 2000 },
      tileSize: 512,
      attribution: '',
      waterLevel: -10,
      heightAt: (x: number, z: number) => controls.heightAt(x, z),
      surfaceAt: () => 'road',
      buildingHeightAt: (x: number, z: number) => inBox(x, z, 0)?.h ?? 0,
      isFree: (x: number, z: number, r: number) => inBox(x, z, r) === null,
      resolveCircle: () => false,
      raycast,
      lineOfSight: (ax: number, az: number, bx: number, bz: number) => {
        const h: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
        return !raycast(ax, az, bx, bz, h);
      },
    },
    people: {
      list: people,
      get: (id: number) => people.find((p) => p.id === id),
    },
    vehicles: {
      list: vehicles,
      get: (id: number) => vehicles.find((v) => v.id === id),
      raycast: () => false,
    },
    props: { list: [], shops: [], raycast: () => false },
    player: {
      state: player,
      person: () => (player.personId ? people.find((p) => p.id === player.personId) ?? null : null),
      vehicle: () => playerVehicle,
      possess(): void {},
      setCameraMode(mode: CameraMode): void {
        controls.setCamera(mode);
      },
      toggleCamera(): void {},
    },
    input: {
      device: 'kbm',
      get moveX(): number {
        return controls.input.moveX;
      },
      get moveY(): number {
        return controls.input.moveY;
      },
      get lookX(): number {
        return controls.input.lookX;
      },
      get lookY(): number {
        return controls.input.lookY;
      },
      throttle: 0, brake: 0, wheel: 0, pointerLocked: false,
      down: (b: Button) => controls.input.down.has(b),
      pressed: () => false,
      released: () => false,
      rumble(): void {},
    },
    ui: {
      notify(): void {}, subtitle(): void {}, banner(): void {}, open(): void {}, close(): void {},
      get modal(): boolean {
        return controls.modal;
      },
      current: null,
    },
    provide<T>(key: string, service: T): void {
      services.set(key, service);
    },
    service<T>(key: string): T | undefined {
      return services.get(key) as T | undefined;
    },
    require<T>(key: string): T {
      if (!services.has(key)) throw new Error(`service « ${key} » absent`);
      return services.get(key) as T;
    },
    newId: () => nextId++,
  } as unknown as GameContext;

  return { ctx, controls };
}
