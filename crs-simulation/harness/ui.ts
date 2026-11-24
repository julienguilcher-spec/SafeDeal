// Banc d'essai de l'interface : moteur réel du cœur (Game → createContext, services neutres), module des
// entrées réel, module d'interface à l'essai, et un petit « monde factice » : personnes, véhicules, foule,
// objectifs, incidents, directeur de tension pilotable, scène peinte en 2D par une vraie caméra en perspective
// (ctx.view factice : mêmes matrices que le rendu, pour vérifier les marqueurs projetés).
//
// Paramètres d'URL :
//   ?screen=menu_principal|hud|pause|parametres|chargement|debrief|credits   &section=…  &tab=…
//   &accueil=hub|patrouille|missions|libre (vue de la page d'accueil ; &section=… ouvre l'éditeur du Mode libre)
//   &role=…  &situation=calme|tension|affrontement  &vehicle=centaure|canon_eau|fourgon_crs|moto_bravm
//   &camera=tps|fps|drone|viewfinder  &gas=0..1  &hour=0..24  &touch=1 (surcouche tactile forcée)
//   &view=0 (pas de ctx.view : effets d'écran de repli, pas de marqueurs)  &missions=1  &records=1  &extras=1
//   &world=paris (vraies données de carte)  &hold=1 (chargement retenu)  &bench=1 (panneau ouvert)
//   &subs=1 (sous-modules src/ui/maps et src/ui/command agrégés, s'ils existent)  &noinput=1 (sans module d'entrées)
// API de test : window.__uiTest (voir en bas du fichier) ; window.__ready quand tout est en place.
import * as THREE from 'three';
import type {
  CameraMode, CrowdPhase, GameContext, GameSystem, ItemStack, Person, PersonKind, PlaceInfo, PlayableRole, PoliceRank, PolicePoste,
  SessionConfig, VehicleDef, VehicleKind, ViewApi, WeatherKind,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { getCore } from '@/core/context';
import { EXT } from '@/core/extensions';
import type { Incident, IncidentsApi, ObjectivesApi, UiKit } from '@/core/extensions';
import { Game } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';
import { createSystems as inputModule } from '@/input';
import type { InputScriptApi, InputTouchApi } from '@/input';
import { UiSystem, createSystems as uiModule } from '@/ui';
import type { UiDebugApi } from '@/ui';
import { projectPoint } from '@/ui/hud/markers';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';
import { createWorldQuerySystems } from '@/world/query';

const params = new URLSearchParams(location.search);
const flag = (name: string): boolean => params.get(name) === '1';

// ───────────────────────────── état pilotable ─────────────────────────────

interface BenchState {
  role: PlayableRole;
  situation: 'calme' | 'tension' | 'affrontement';
  vehicle: '' | VehicleKind;
  camera: CameraMode;
  gas: number;
  hour: number;
  weather: WeatherKind;
}
const state: BenchState = {
  role: (params.get('role') as PlayableRole) || 'crs',
  situation: (params.get('situation') as BenchState['situation']) || 'calme',
  vehicle: (params.get('vehicle') as VehicleKind) || '',
  camera: (params.get('camera') as CameraMode) || 'tps',
  gas: Number(params.get('gas') ?? 0) || 0,
  hour: params.get('hour') !== null ? Number(params.get('hour')) : 14.5,
  weather: (params.get('weather') as WeatherKind) || 'nuageux',
};

const director = {
  phase: 'cortege' as CrowdPhase,
  tension: 0.2,
  tensionAt(): number {
    return director.tension;
  },
  addTension(amount: number): void {
    director.tension = Math.max(0, Math.min(1, director.tension + amount));
  },
  stats: { total: 600, present: 540, dispersed: 60, radicals: 14, injured: 3, arrested: 2 },
  route: [] as number[],
  headProgress: 0,
};

const KIND_OF: Record<PlayableRole, PersonKind> = {
  crs: 'crs', chef_groupe: 'crs', commandant: 'crs', commissaire: 'commissaire', bravm: 'bravm', gendarme_centaure: 'gendarme',
  operateur_canon_eau: 'crs', telepilote: 'telepilote', street_medic: 'street_medic', secouriste: 'pompier', journaliste: 'journaliste',
  manifestant: 'manifestant',
};
const stack = (id: string, count = 1, s = 1): ItemStack => ({ id, count, state: s, cooldown: 0 });
const INVENTORY: Record<PlayableRole, () => ItemStack[]> = {
  crs: () => [stack('bouclier'), stack('tonfa'), stack('gazeuse', 5), stack('grenade_lacrymo', 4), stack('lanceur_cougar', 8), stack('menottes', 3), stack('radio'), stack('extincteur', 12)],
  chef_groupe: () => [stack('tonfa'), stack('gazeuse', 5), stack('grenade_desencerclement', 2), stack('menottes', 3), stack('radio'), stack('megaphone')],
  commandant: () => [stack('radio'), stack('megaphone'), stack('tonfa'), stack('menottes', 2)],
  commissaire: () => [stack('megaphone'), stack('fusee_sommation', 4), stack('radio'), stack('pistolet', 15)],
  bravm: () => [stack('tonfa'), stack('gazeuse', 5), stack('lbd40', 6), stack('grenade_desencerclement', 2), stack('menottes', 4), stack('radio')],
  gendarme_centaure: () => [stack('radio'), stack('extincteur', 10), stack('pistolet', 15)],
  operateur_canon_eau: () => [stack('radio'), stack('extincteur', 10)],
  telepilote: () => [stack('telecommande_drone', 1, 0.78), stack('radio')],
  street_medic: () => [stack('trousse_secours', 8), stack('serum_physiologique', 14), stack('masque_gaz'), stack('telephone')],
  secouriste: () => [stack('lance_incendie'), stack('extincteur', 15), stack('trousse_secours', 10), stack('brancard'), stack('radio')],
  journaliste: () => [stack('appareil_photo', 24), stack('camera_tv'), stack('micro'), stack('telephone')],
  manifestant: () => [stack('pancarte'), stack('telephone'), stack('parapluie'), stack('fumigene', 1)],
};
const RANK_OF: Partial<Record<PlayableRole, PoliceRank>> = {
  crs: 'gardien', chef_groupe: 'brigadier_chef', commandant: 'commandant', commissaire: 'commissaire', bravm: 'gardien',
  gendarme_centaure: 'gardien', operateur_canon_eau: 'brigadier', telepilote: 'brigadier',
};
const POSTE_OF: Partial<Record<PlayableRole, PolicePoste>> = {
  crs: 'bouclier', chef_groupe: 'chef_groupe', commandant: 'commandant_unite', commissaire: 'autorite_civile', bravm: 'passager_moto',
  gendarme_centaure: 'operateur', operateur_canon_eau: 'operateur', telepilote: 'telepilote',
};

function vehicleDef(kind: VehicleKind, name: string, l: number, w: number, hgt: number, color: number, extra: Partial<VehicleDef> = {}): VehicleDef {
  return {
    kind, name, faction: 'police', length: l, width: w, height: hgt, mass: 3000, wheelbase: l * 0.6, maxSpeed: 25, maxReverse: 6, accel: 3, brake: 7,
    maxSteer: 0.6, seats: [{ role: 'driver', x: -0.5, y: 1, z: 1, exitX: -1.6, exitZ: 1 }, { role: 'gunner', x: 0.5, y: 1.2, z: 0, exitX: 1.6, exitZ: 0 }],
    turrets: [], armored: false, canPush: false, hasSiren: true, hasBeacons: true, color, flying: false, ...extra,
  };
}
const VEHICLE_DEFS: VehicleDef[] = [
  vehicleDef('centaure', 'Centaure', 7.4, 2.5, 2.9, 0x24324a, { armored: true, canPush: true, turrets: [{ kind: 'lance_grenades', x: 0, y: 2.8, z: 0, yawMin: -3.1, yawMax: 3.1, pitchMin: 0.5, pitchMax: 1.3, capacity: 30, interval: 1 }] }),
  vehicleDef('canon_eau', 'Engin lanceur d’eau', 8.6, 2.5, 3.4, 0xf2f4f7, { turrets: [{ kind: 'canon_eau', x: 0, y: 3.3, z: 1, yawMin: -2, yawMax: 2, pitchMin: -0.3, pitchMax: 0.8, capacity: 10000, interval: 0.1 }] }),
  vehicleDef('fourgon_crs', 'Fourgon', 5.9, 2.1, 2.6, 0xf2f4f7),
  vehicleDef('moto_bravm', 'Moto', 2.2, 0.8, 1.4, 0x1b2233, { hasSiren: true }),
  vehicleDef('drone', 'Drone', 0.6, 0.6, 0.3, 0x222222, { flying: true, hasSiren: false, hasBeacons: false, turrets: [{ kind: 'camera', x: 0, y: 0, z: 0, yawMin: -3, yawMax: 3, pitchMin: -1.5, pitchMax: 0.2, capacity: 0, interval: 0 }] }),
];

// ───────────────────────────── monde factice ─────────────────────────────

function fakeWorld(ctx: GameContext, gate: { promise: Promise<void> | null }): void {
  const base = ctx.world;
  const places: PlaceInfo[] = DEFAULT_PLACES.map((p, i) => ({ id: i + 1, name: p.name === 'Champs-Élysées – Étoile' ? 'Place Charles de Gaulle' : p.name, kind: 'square', x: p.x + 4, z: p.z - 3, radius: 80 }));
  places.push({ id: 90, name: 'Place Vendôme', kind: 'square', x: 601, z: -204, radius: 70 }, { id: 91, name: 'Place des Vosges', kind: 'square', x: 3150, z: 900, radius: 70 },
    { id: 92, name: 'Boulevard du Temple', kind: 'street', x: 3200, z: 0, radius: 200 });
  const world = Object.create(base) as typeof base;
  Object.defineProperties(world, {
    places: { value: places },
    attribution: { value: '© les contributeurs d’OpenStreetMap (ODbL 1.0) — IGN, RGE ALTI® et BD TOPO® (Licence Ouverte 2.0) — Ville de Paris, Paris Data (ODbL) [données factices du banc d’essai]' },
    placeByName: { value: (name: string) => places.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null },
    sectorName: {
      value: (x: number, z: number) => {
        let best = places[0]!;
        for (const p of places) if (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z)) best = p;
        return Math.hypot(best.x - x, best.z - z) < 260 ? best.name.charAt(0).toLowerCase() + best.name.slice(1) : 'boulevard du Temple';
      },
    },
    whenLoaded: { value: () => gate.promise ?? Promise.resolve() },
  });
  ctx.world = world;
}

// ───────────────────────────── systèmes du banc ─────────────────────────────

const game = new Game({ storage: params.get('store') === 'memoire' ? null : undefined });
const ctx = game.ctx;
const loadGate: { promise: Promise<void> | null; release: (() => void) | null } = { promise: null, release: null };
let hitDemo = 0;
const incidents: Incident[] = [];
let playerIncident = 0;
const forced: { prompt: string | null; charge: number | null } = { prompt: null, charge: null };

/** Scène de la partie : joueur du rôle demandé, foule, ligne de CRS, objectifs, incident. */
function populate(config: SessionConfig): void {
  const x0 = config.x ?? 0;
  const z0 = config.z ?? 0;
  const role = config.role;
  state.role = role;
  const p = ctx.people.spawn({ kind: KIND_OF[role], x: x0, z: z0, heading: 0, rank: RANK_OF[role] ?? null, poste: POSTE_OF[role] ?? null, inventory: INVENTORY[role](), name: 'Vous' });
  p.active = 0;
  ctx.player.possess(p.id, role);
  ctx.player.state.camYaw = 0;
  // ligne de CRS devant, cortège au-delà
  for (let i = -6; i <= 6; i++) {
    if (i === 0 && KIND_OF[role] === 'crs') continue;
    ctx.people.spawn({ kind: 'crs', x: x0 + i * 0.9, z: z0 + 1.2, heading: 0, seed: 100 + i });
  }
  const rng = ctx.rng.fork('banc');
  const tops = [0xc9463d, 0xffd60a, 0x3c8d4b, 0x5dade2, 0xe8e2d0, 0x7d3c98, 0x2c2c34, 0xe67e22];
  for (let i = 0; i < 110; i++) {
    const row = Math.floor(i / 11);
    const bloc = row < 2;
    ctx.people.spawn({
      kind: 'manifestant', x: x0 + ((i % 11) - 5) * 1.5 + rng.range(-0.5, 0.5), z: z0 + 24 + row * 2.1 + rng.range(-0.6, 0.6), heading: Math.PI,
      profile: bloc ? 'radical' : 'pacifique', look: { top: bloc ? 0x15161a : rng.pick(tops) }, seed: 500 + i,
    });
  }
  ctx.people.spawn({ kind: 'journaliste', x: x0 - 9, z: z0 + 14, heading: 1, seed: 7 });
  ctx.people.spawn({ kind: 'street_medic', x: x0 + 10, z: z0 + 18, heading: 2, seed: 8 });
  const suspect = ctx.people.spawn({ kind: 'manifestant', x: x0 + 6, z: z0 + 21, heading: Math.PI, profile: 'radical', look: { top: 0x15161a }, seed: 9, name: 'Suspect' });
  const fourgon = ctx.vehicles.spawn('fourgon_crs', x0 - 13, z0 - 6, 0.2);
  fourgon.beacons = true;

  const objectives = ctx.service<ObjectivesApi>(EXT.objectives);
  objectives?.set([
    { id: 'o1', text: 'Tenir le barrage du boulevard du Temple', state: 'actif', secondary: false, x: x0 + 2, z: z0 + 8, progress: 0.4 },
    { id: 'o2', text: 'Protéger l’accès des secours', state: 'actif', secondary: false, x: x0 - 60, z: z0 + 35 },
    { id: 'o3', text: 'Aucun tir hors cadre légal', state: 'actif', secondary: true },
    { id: 'o4', text: 'Rejoindre la section au point de rendez-vous', state: 'reussi', secondary: false },
  ]);
  incidents.length = 0;
  incidents.push(
    { id: 1, kind: 'feu_poubelle', label: 'Feu de poubelles', x: x0 + 22, z: z0 + 16, targetKind: 'place', targetId: 0, urgency: 2, severity: 0.4, state: 'assigne', createdAt: 0, means: 'joueur', squadId: 0, progress: 0 },
    { id: 2, kind: 'suspect', label: 'Lanceur de pavés', x: suspect.x, z: suspect.z, targetKind: 'person', targetId: suspect.id, urgency: 2, severity: 0.5, state: 'ouvert', createdAt: 0, means: '', squadId: 0, progress: 0 },
  );
  playerIncident = role === 'secouriste' || role === 'crs' ? 1 : 0;
  applyState();
}

/** Applique l'état demandé (situation, véhicule, caméra, gaz, heure) à la partie en cours. */
function applyState(): void {
  const p = ctx.player.person();
  ctx.env.setTime(state.hour);
  ctx.env.setWeather(state.weather, true);
  ctx.env.setWind(2.2, -1.6);
  const roe = ctx.law.roe;
  if (state.situation === 'calme') {
    director.phase = 'cortege';
    director.tension = 0.18;
    Object.assign(roe, { sommation: 0, underAttack: false, lawfulForce: 1, authorizedForce: 1, dispersionOrdered: false });
  } else if (state.situation === 'tension') {
    director.phase = 'tension';
    director.tension = 0.58;
    Object.assign(roe, { sommation: 2, underAttack: false, lawfulForce: 1, authorizedForce: 1, dispersionOrdered: true });
  } else {
    director.phase = 'affrontement';
    director.tension = 0.92;
    Object.assign(roe, { sommation: 3, underAttack: true, lawfulForce: 4, authorizedForce: 3, dispersionOrdered: true });
  }
  if (!p) return;
  p.gas = state.gas;
  p.health = state.situation === 'affrontement' ? 46 : state.situation === 'tension' ? 88 : 100;
  p.stamina = state.situation === 'affrontement' ? 38 : 82;
  p.injury = state.situation === 'affrontement' ? 'light' : 'none';
  p.look.gasMask = state.gas > 0.3 && KIND_OF[state.role] === 'crs';
  p.look.visorDown = state.situation !== 'calme' && KIND_OF[state.role] === 'crs';
  // véhicule
  const current = ctx.player.vehicle();
  if (current && current.kind !== state.vehicle) ctx.vehicles.exit(p);
  if (state.vehicle && !ctx.player.vehicle()) {
    const v = ctx.vehicles.spawn(state.vehicle, p.x, p.z, 0);
    v.speed = state.vehicle === 'moto_bravm' ? 11.5 : 6.2;
    v.gear = 2;
    v.engineOn = true;
    v.siren = state.situation === 'affrontement' ? 1 : 0;
    v.beacons = true;
    v.headlights = ctx.env.state.isNight;
    if (v.turretAmmo.length > 0) v.turretAmmo[0] = state.vehicle === 'canon_eau' ? 6200 : 24;
    ctx.vehicles.enter(p, v, state.vehicle === 'centaure' || state.vehicle === 'canon_eau' ? 'gunner' : 'driver');
  }
  const inVehicle = ctx.player.vehicle() !== null;
  let camera: CameraMode = state.camera;
  if (state.role === 'telepilote' && camera === 'tps' && params.get('camera') === null) camera = 'tps';
  if (inVehicle && (camera === 'tps' || camera === 'fps')) camera = 'vehicle_ext';
  ctx.player.setCameraMode(camera);
  ctx.player.state.zoom = camera === 'drone' ? 2 : camera === 'viewfinder' ? 2.9 : 1;
}

const benchSim: GameSystem = {
  id: 'banc:sim',
  order: SystemOrder.RULES,
  provide(c: GameContext): void {
    c.director = director;
    getCore(c).stores.vehicles.registerDefs(VEHICLE_DEFS);
    if (params.get('world') !== 'paris') fakeWorld(c, loadGate);
    const api: IncidentsApi = {
      list: incidents,
      get: (id: number) => incidents.find((i) => i.id === id),
      open: () => incidents[0]!,
      assign: () => true,
      unassign: () => {},
      close: () => {},
      nearest: () => null,
      get playerIncidentId(): number {
        return playerIncident;
      },
    };
    c.provide(EXT.incidents, api);
    if (flag('missions')) {
      c.provide('missions', {
        catalog: [
          { id: 'M01', title: 'Premier samedi', roles: ['crs'], type: 'Manifestation déclarée', difficulty: 1, summary: 'Tenir sa place dans la ligne pendant un cortège calme.', place: 'Place de la République', config: { crowdSize: 400, tension: 0.1, volatility: 0.2, timeOfDay: 14 } },
          { id: 'M04', title: 'Le pont ne passe pas', roles: ['crs', 'chef_groupe'], type: 'Maintien d’un barrage', difficulty: 3, summary: 'Barrer le pont de la Concorde face à un cortège non déclaré.', place: 'Place de la Concorde', config: { crowdSize: 900, tension: 0.5, volatility: 0.6, timeOfDay: 17.5, weather: 'couvert' } },
          { id: 'M29', title: 'L’écharpe', roles: ['commissaire'], type: 'Sommations', difficulty: 2, summary: 'Prononcer les trois sommations dans les formes.', place: 'Place de la Bastille', config: { crowdSize: 600, tension: 0.45 } },
        ],
        result: flag('records') ? { title: 'Le pont ne passe pas', success: true, score: 78, grade: 'Satisfaisant', summary: 'Le barrage a tenu sans débordement ; un tir de grenade a été effectué avant la fin du délai.', lines: [{ label: 'Barrage tenu', value: '25 min', delta: 20 }, { label: 'Tir avant le délai légal', value: '−12', delta: -12, note: 'Grenade lancée 8 s après la dernière sommation.' }] } : null,
      });
    }
    if (flag('records')) {
      const stats = { sommations: 3, forces: 14, faults: 2, filmedFaults: 1, worstSeverity: 3, byVerdict: {}, byMeans: {}, arrests: 5, founded: 4, unfounded: 1, handedOver: 4, released: 1, escaped: 0, controls: 2, unjustifiedControls: 0, complaints: 1, score: 72, sanction: 'avertissement', inquiry: false };
      c.provide('law.records', { sommations: [], autorisations: [], forces: [], interpellations: [], controles: [], plaintes: [], score: 72, lastRefusal: '', stats: () => stats, summary: () => 'Sommations régulières, portées par mégaphone à 82 % de la foule.\nDeux emplois de la force hors cadre, dont un filmé par un tiers : un avertissement est encouru.', arrestOf: () => null });
    }
  },
  init(c: GameContext): void {
    c.events.on('session:started', ({ config }) => populate(config));
    if (flag('extras')) {
      const kit = c.require<UiKit>(EXT.uiKit);
      for (const id of ['carriere', 'missions']) {
        kit.registerScreen(id, (host) => {
          const box = kit.h('div', 'ui-window-wrap');
          const win = kit.h('div', 'ui-panel ui-window ui-window--narrow');
          win.style.padding = '24px';
          win.append(kit.h('h2', 'ui-title', id === 'carriere' ? 'Carrière (écran d’un autre module)' : 'Missions (écran d’un autre module)'), kit.button('Retour', () => c.ui.close(id)));
          box.append(win);
          host.append(box);
          return { dispose: () => box.remove() };
        }, { modal: true, pauses: false });
      }
    }
  },
  update(dt: number): void {
    // contrôleur de démonstration : le HUD réagit aux vraies entrées (regard, objets, charge du lancer)
    const input = ctx.input;
    const ps = ctx.player.state;
    const p = ctx.player.person();
    if (!p) return;
    ps.camYaw -= input.lookX;
    ps.camPitch = Math.max(-1.2, Math.min(1.2, ps.camPitch + input.lookY));
    if (!ctx.player.vehicle()) {
      const fx = Math.sin(ps.camYaw);
      const fz = Math.cos(ps.camYaw);
      p.x += (fx * input.moveY - fz * input.moveX) * 3.2 * dt;
      p.z += (fz * input.moveY + fx * input.moveX) * 3.2 * dt;
    }
    for (let i = 0; i < 9; i++) if (input.pressed(('slot' + (i + 1)) as 'slot1') && i < p.inventory.length) ctx.actions.select(p, i);
    if (input.pressed('item_next')) ctx.actions.select(p, (p.active + 1) % p.inventory.length);
    if (input.pressed('item_prev')) ctx.actions.select(p, (p.active + p.inventory.length - 1) % p.inventory.length);
    if (input.pressed('camera')) ctx.player.toggleCamera();
    if (forced.charge !== null) ps.charge = forced.charge;
    else if (input.down('primary')) ps.charge = Math.min(1, ps.charge + dt / 1.2);
    else ps.charge = 0;
    if (input.pressed('interact') && ps.prompt) ctx.interactions.start(p, ps.prompt);
    if (hitDemo > 0) hitDemo -= dt;
  },
};

// ───────────────────────────── vue factice : caméra réelle, scène peinte en 2D ─────────────────────────────

const gameEl = document.getElementById('game') as HTMLDivElement;
const canvas = document.createElement('canvas');
gameEl.appendChild(canvas);
const g = canvas.getContext('2d')!;
let W = 1;
let H = 1;
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3000);
const fx: Record<string, number> = { gas: 0, flash: 0, wet: 0, pain: 0, visor: 0 };
const fakeView = {
  renderer: null, scene: null, world: null, camera, quality: 'haut', drawDistance: 500, camX: 0, camY: 2, camZ: 0,
  shake(): void {},
  setScreenEffect(name: string, amount: number): void {
    fx[name] = amount;
  },
};
function resize(): void {
  W = gameEl.clientWidth || window.innerWidth;
  H = gameEl.clientHeight || window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const pt = { x: 0, y: 0, front: true };
const proj = (x: number, y: number, z: number): { x: number; y: number; front: boolean } =>
  projectPoint(camera.matrixWorldInverse.elements, camera.projectionMatrix.elements, x, y, z, W, H, pt);

function quad(points: number[], fill: string): void {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const q = proj(points[i]!, points[i + 1]!, points[i + 2]!);
    if (!q.front) return;
    out.push(q.x, q.y);
  }
  g.beginPath();
  g.moveTo(out[0]!, out[1]!);
  for (let i = 2; i < out.length; i += 2) g.lineTo(out[i]!, out[i + 1]!);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

const PERSON_COLORS: Partial<Record<PersonKind, string>> = { crs: '#1a2742', gendarme: '#1d2d55', bravm: '#14181f', commissaire: '#2a3350', journaliste: '#e9e9e9', street_medic: '#f4f4f4', pompier: '#1b2a4a', telepilote: '#1a2742' };

function paintScene(): void {
  const ps = ctx.player.state;
  const p = ctx.player.person();
  const x0 = p ? p.x : 0;
  const z0 = p ? p.z : 0;
  const yaw = ps.camYaw;
  const mode = ps.cameraMode;
  const fxw = Math.sin(yaw);
  const fzw = Math.cos(yaw);
  if (mode === 'drone') {
    camera.position.set(x0 - fxw * 26, 58, z0 - fzw * 26);
    camera.lookAt(x0 + fxw * 22, 0, z0 + fzw * 22);
  } else if (mode === 'fps' || mode === 'viewfinder' || mode === 'turret') {
    camera.position.set(x0, mode === 'turret' ? 3 : 1.68, z0);
    camera.lookAt(x0 + fxw * 10, 1.68 + Math.tan(ps.camPitch) * 10, z0 + fzw * 10);
  } else {
    const back = mode === 'vehicle_ext' ? 9 : 3.4;
    camera.position.set(x0 - fxw * back + fzw * 0.6, mode === 'vehicle_ext' ? 3.6 : 2.15, z0 - fzw * back - fxw * 0.6);
    camera.lookAt(x0 + fxw * 12, 1.3 + Math.tan(ps.camPitch) * 12, z0 + fzw * 12);
  }
  camera.fov = mode === 'viewfinder' ? 26 : mode === 'drone' ? 44 : 68;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  fakeView.camX = camera.position.x;
  fakeView.camY = camera.position.y;
  fakeView.camZ = camera.position.z;

  const env = ctx.env.state;
  const day = env.daylight;
  const mix = (a: number[], b: number[]): string => `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * day)).join(',')})`;
  // horizon : projection d'un point lointain
  const far = proj(x0 + fxw * 4000, 0, z0 + fzw * 4000);
  const horizon = Math.max(0, Math.min(H, far.front ? far.y : 0));
  const sky = g.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  sky.addColorStop(0, mix([6, 10, 22], env.weather === 'clair' ? [86, 142, 204] : [128, 142, 158]));
  sky.addColorStop(1, mix([20, 28, 48], env.weather === 'clair' ? [196, 216, 232] : [188, 194, 198]));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = mix([22, 24, 30], [96, 98, 102]);
  g.fillRect(0, horizon, W, H - horizon);

  // boulevard : immeubles des deux côtés, marquage axial
  const cz = Math.round(z0 / 16) * 16;
  for (let k = 9; k >= -3; k--) {
    const z = cz + k * 16;
    for (const side of [-1, 1]) {
      const x = x0 - (x0 % 1) * 0 + side * 19;
      const hgt = 19 + ((Math.abs(k * 7 + side * 3)) % 4) * 1.6;
      const shade = 0.82 + ((Math.abs(k) % 3) * 0.06);
      const c = [Math.round(204 * shade), Math.round(190 * shade), Math.round(160 * shade)];
      quad([x, 0, z, x, 0, z + 15.4, x, hgt, z + 15.4, x, hgt, z], mix([30, 32, 44], c));
      quad([x, hgt, z, x, hgt, z + 15.4, x + side * 3, hgt + 3, z + 15.4, x + side * 3, hgt + 3, z], mix([18, 20, 28], [92, 98, 110]));
      // fenêtres éclairées la nuit
      if (day < 0.4) for (let f = 0; f < 4; f++) quad([x - side * 0.05, 4 + f * 3.6, z + 3 + ((k + f) % 3) * 3.5, x - side * 0.05, 4 + f * 3.6, z + 4.4 + ((k + f) % 3) * 3.5, x - side * 0.05, 6 + f * 3.6, z + 4.4 + ((k + f) % 3) * 3.5, x - side * 0.05, 6 + f * 3.6, z + 3 + ((k + f) % 3) * 3.5], 'rgba(255, 214, 140, .8)');
    }
    quad([x0 - 0.12, 0.01, z, x0 + 0.12, 0.01, z, x0 + 0.12, 0.01, z + 6, x0 - 0.12, 0.01, z + 6], mix([70, 72, 80], [214, 214, 208]));
  }

  // véhicules puis personnes, du plus loin au plus proche
  const drawables: { d: number; draw: () => void }[] = [];
  for (const v of ctx.vehicles.list) {
    const d = (v.x - camera.position.x) * fxw + (v.z - camera.position.z) * fzw;
    if (d < 1) continue;
    drawables.push({ d, draw: () => {
      const hl = v.def.length / 2;
      const hw = v.def.width / 2;
      const s = Math.sin(v.heading);
      const c = Math.cos(v.heading);
      const corner = (l: number, w: number, y: number): number[] => [v.x + s * l - c * w, y, v.z + c * l + s * w];
      const col = '#' + v.color.toString(16).padStart(6, '0');
      quad([...corner(-hl, -hw, 0.3), ...corner(hl, -hw, 0.3), ...corner(hl, -hw, v.def.height), ...corner(-hl, -hw, v.def.height)], col);
      quad([...corner(-hl, hw, 0.3), ...corner(hl, hw, 0.3), ...corner(hl, hw, v.def.height), ...corner(-hl, hw, v.def.height)], col);
      quad([...corner(-hl, -hw, 0.3), ...corner(-hl, hw, 0.3), ...corner(-hl, hw, v.def.height), ...corner(-hl, -hw, v.def.height)], col);
      quad([...corner(-hl, -hw, v.def.height), ...corner(hl, -hw, v.def.height), ...corner(hl, hw, v.def.height), ...corner(-hl, hw, v.def.height)], 'rgba(255,255,255,.14)');
      if (v.beacons) {
        const b = proj(v.x, v.def.height + 0.25, v.z);
        if (b.front) {
          g.fillStyle = Math.floor(performance.now() / 260) % 2 ? '#57a6ff' : '#bcd9ff';
          g.beginPath();
          g.arc(b.x, b.y, Math.max(2, 220 / d), 0, Math.PI * 2);
          g.fill();
        }
      }
    } });
  }
  for (const q of ctx.people.list) {
    if (q.isPlayer && (mode === 'fps' || mode === 'viewfinder' || mode === 'turret' || q.vehicleId !== 0)) continue;
    if (q.vehicleId !== 0) continue;
    const d = (q.x - camera.position.x) * fxw + (q.z - camera.position.z) * fzw;
    if (d < (mode === 'tps' ? 0.6 : 2.5) || d > 220) continue;
    drawables.push({ d, draw: () => {
      const feet = proj(q.x, 0, q.z);
      if (!feet.front) return;
      const fx0 = feet.x;
      const fy0 = feet.y;
      const head = proj(q.x, q.look.height, q.z);
      const hgt = fy0 - head.y;
      if (hgt < 1.5) return;
      const w = hgt * 0.3;
      const body = PERSON_COLORS[q.kind] ?? '#' + q.look.top.toString(16).padStart(6, '0');
      g.fillStyle = day < 0.4 ? 'rgba(12,14,20,.92)' : '#2b2f3a';
      g.fillRect(fx0 - w * 0.36, fy0 - hgt * 0.47, w * 0.72, hgt * 0.47);
      g.fillStyle = body;
      g.fillRect(fx0 - w / 2, fy0 - hgt * 0.84, w, hgt * 0.42);
      g.fillStyle = q.kind === 'crs' || q.kind === 'gendarme' ? '#10151f' : q.profile === 'radical' ? '#0e0f12' : '#d9b99b';
      g.beginPath();
      g.arc(fx0, fy0 - hgt * 0.92, hgt * 0.085, 0, Math.PI * 2);
      g.fill();
      if (q.kind === 'crs' && q.inventory.length === 0) {
        g.fillStyle = 'rgba(190, 210, 230, .55)';
        g.fillRect(fx0 - w * 0.62, fy0 - hgt * 0.8, w * 0.5, hgt * 0.5);
      }
    } });
  }
  drawables.sort((a, b) => b.d - a.d);
  for (const d of drawables) d.draw();

  // feu et gaz de la situation « affrontement »
  if (director.phase === 'affrontement') {
    const fire = proj(x0 + 22, 0.8, z0 + 16);
    if (fire.front) {
      const r = Math.max(8, 2400 / Math.hypot(22, 16));
      const gr = g.createRadialGradient(fire.x, fire.y, 0, fire.x, fire.y, r);
      gr.addColorStop(0, 'rgba(255, 230, 150, .95)');
      gr.addColorStop(0.5, 'rgba(255, 120, 30, .7)');
      gr.addColorStop(1, 'rgba(60, 30, 20, 0)');
      g.fillStyle = gr;
      g.fillRect(fire.x - r, fire.y - r * 1.4, r * 2, r * 2.4);
    }
    const cloud = proj(x0 - 4, 1.4, z0 + 15);
    if (cloud.front) {
      const gr = g.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, 190);
      gr.addColorStop(0, 'rgba(232, 234, 214, .6)');
      gr.addColorStop(1, 'rgba(232, 234, 214, 0)');
      g.fillStyle = gr;
      g.fillRect(cloud.x - 190, cloud.y - 150, 380, 300);
    }
  }
  if (env.rain > 0.05) {
    g.strokeStyle = 'rgba(200, 215, 235, .35)';
    g.beginPath();
    for (let i = 0; i < 140; i++) {
      const rx = (i * 97.3 + performance.now() * 0.4) % W;
      const ry = (i * 53.9 + performance.now() * 1.3) % H;
      g.moveTo(rx, ry);
      g.lineTo(rx - 4, ry + 16);
    }
    g.stroke();
  }
  // effets d'écran demandés par l'interface (ctx.view.setScreenEffect)
  if (fx.gas! > 0.01) {
    g.fillStyle = `rgba(222, 226, 196, ${(fx.gas! * 0.72).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }
  if (fx.visor! > 0.01) {
    const vg = g.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, `rgba(8, 12, 22, ${0.62 * fx.visor!})`);
    vg.addColorStop(0.16, `rgba(8, 12, 22, ${0.1 * fx.visor!})`);
    vg.addColorStop(1, `rgba(8, 12, 22, ${0.3 * fx.visor!})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }
  if (fx.pain! > 0.01) {
    const pg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    pg.addColorStop(0, 'rgba(160, 10, 0, 0)');
    pg.addColorStop(1, `rgba(160, 10, 0, ${(fx.pain! * 0.75).toFixed(3)})`);
    g.fillStyle = pg;
    g.fillRect(0, 0, W, H);
  }
  if (fx.flash! > 0.01) {
    g.fillStyle = `rgba(255, 255, 255, ${fx.flash!.toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }
}

const benchView: GameSystem = {
  id: 'banc:vue',
  order: SystemOrder.VIEW,
  provide(c: GameContext): void {
    if (params.get('view') !== '0') c.view = fakeView as unknown as ViewApi;
  },
  frame(): void {
    const phase = ctx.session.phase;
    if (phase === 'playing' || phase === 'paused' || phase === 'debrief') paintScene();
    else g.clearRect(0, 0, W, H);
  },
};

// ───────────────────────────── démarrage ─────────────────────────────

// &noinput=1 : sans module d'entrées (services neutres) — l'interface lit alors le clavier elle-même
if (!flag('noinput')) game.addModule(inputModule);
if (params.get('world') === 'paris') game.addModule(() => createWorldQuerySystems({ source: 'paris', baseUrl: '../data/paris/' }));
game.addSystem(benchSim);
game.addSystem(benchView);
// par défaut, seul le socle de l'interface est à l'essai ; &subs=1 ajoute les sous-modules cartes et commandement
if (flag('subs')) game.addModule(uiModule);
else game.addSystem(new UiSystem());

function sessionConfig(): SessionConfig {
  const place = DEFAULT_PLACES[0]!;
  return defaultSessionConfig({
    mode: 'libre', role: state.role, rank: RANK_OF[state.role] ?? null, place: place.name, x: place.x, z: place.z,
    timeOfDay: state.hour, weather: state.weather, crowdSize: 600, tension: 0.3, volatility: 0.4, seed: 7,
  });
}

async function startSession(): Promise<void> {
  if (flag('hold')) {
    loadGate.promise = new Promise<void>((resolve) => {
      loadGate.release = resolve;
    });
  }
  await ctx.session.start(sessionConfig());
}

async function openScreen(screen: string): Promise<void> {
  const phase = ctx.session.phase;
  if (screen === 'menu_principal') {
    if (phase !== 'menu') ctx.session.end(false);
    const accueil = params.get('accueil');
    if (params.get('section') || accueil) ctx.ui.open('menu_principal', { view: accueil ?? undefined, section: params.get('section') ?? undefined });
    return;
  }
  if (screen === 'credits' && phase === 'menu') {
    ctx.ui.open('credits');
    return;
  }
  if (screen === 'parametres' && phase === 'menu') {
    ctx.ui.open('parametres', { tab: params.get('tab') ?? undefined });
    return;
  }
  if (screen === 'chargement') {
    params.set('hold', '1');
    void startSession();
    return;
  }
  if (phase !== 'playing' && phase !== 'paused') await startSession();
  if (screen === 'hud') {
    if (ctx.ui.current) ctx.ui.close();
  } else if (screen === 'debrief') {
    ctx.clock.timeScale = 1;
    game.step(312);
    ctx.session.end(true);
  } else if (screen === 'parametres') {
    ctx.ui.open('parametres', { tab: params.get('tab') ?? undefined });
  } else {
    ctx.ui.open(screen);
  }
}

// ───────────────────────────── panneau ─────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const bench = $('bench');
const benchToggle = $('bench-toggle');
if (flag('clean')) benchToggle.classList.add('hidden');
if (flag('bench')) bench.classList.remove('hidden');
benchToggle.addEventListener('click', () => bench.classList.toggle('hidden'));
const roleSelect = $<HTMLSelectElement>('b-role');
for (const role of Object.keys(KIND_OF)) {
  const o = document.createElement('option');
  o.value = role;
  o.textContent = role;
  roleSelect.append(o);
}
roleSelect.value = state.role;
$<HTMLSelectElement>('b-situation').value = state.situation;
$<HTMLSelectElement>('b-vehicle').value = state.vehicle;
$<HTMLSelectElement>('b-camera').value = state.camera;
$<HTMLSelectElement>('b-screen').addEventListener('change', (e) => void openScreen((e.currentTarget as HTMLSelectElement).value));
roleSelect.addEventListener('change', () => {
  state.role = roleSelect.value as PlayableRole;
  void startSession();
});
$<HTMLSelectElement>('b-situation').addEventListener('change', (e) => {
  state.situation = (e.currentTarget as HTMLSelectElement).value as BenchState['situation'];
  applyState();
});
$<HTMLSelectElement>('b-vehicle').addEventListener('change', (e) => {
  state.vehicle = (e.currentTarget as HTMLSelectElement).value as VehicleKind;
  applyState();
});
$<HTMLSelectElement>('b-camera').addEventListener('change', (e) => {
  state.camera = (e.currentTarget as HTMLSelectElement).value as CameraMode;
  applyState();
});
$<HTMLInputElement>('b-gas').addEventListener('input', (e) => {
  state.gas = Number((e.currentTarget as HTMLInputElement).value) / 100;
  applyState();
});
$<HTMLInputElement>('b-hour').addEventListener('input', (e) => {
  state.hour = Number((e.currentTarget as HTMLInputElement).value);
  applyState();
});

const demo = {
  hit(angleDeg = 70): void {
    const p = ctx.player.person();
    if (!p) return;
    const a = ctx.player.state.camYaw - (angleDeg * Math.PI) / 180;
    ctx.events.emit('person:hurt', { id: p.id, info: { amount: 12, kind: 'impact', sourceId: 0, x: p.x + Math.sin(a) * 8, z: p.z + Math.cos(a) * 8 }, healthAfter: p.health });
  },
  notify(): void {
    ctx.ui.notify('Renfort demandé : la section Bravo arrive par la rue du Temple.', 'info', 6);
    ctx.ui.notify('Feu de poubelles signalé boulevard du Temple.', 'warn', 6);
    ctx.ui.notify('Interpellation régulière : fait constaté et filmé.', 'ok', 6);
  },
  radio(): void {
    ctx.events.emit('radio:message', { msg: { channel: 'commandement', from: 'Alpha 1', text: 'Autorité, de Alpha 1 : le cortège arrive à hauteur du barrage, je demande des instructions.', priority: 1 }, t: ctx.clock.now });
  },
  banner(): void {
    ctx.ui.banner('Le cortège s’ébranle', 'Boulevard du Temple — 600 manifestants', 6);
  },
  prompt(label: string | null = 'Menotter', busy = false): void {
    const p = ctx.player.person();
    if (!p) return;
    if (!label) {
      ctx.player.state.prompt = null;
      ctx.interactions.cancel(p);
      return;
    }
    const opt = { verb: 'menotter' as const, targetKind: 'person' as const, targetId: 0, label, priority: 1, duration: 4, x: p.x, z: p.z + 1 };
    ctx.player.state.prompt = opt;
    if (busy) {
      ctx.interactions.register({ verb: 'menotter', find: () => opt, begin: () => true, tick: () => true, complete: () => {} });
      ctx.interactions.start(p, opt);
    }
  },
};
$('b-hit').addEventListener('click', () => demo.hit(70));
$('b-notify').addEventListener('click', () => demo.notify());
$('b-radio').addEventListener('click', () => demo.radio());
$('b-banner').addEventListener('click', () => demo.banner());
$('b-prompt').addEventListener('click', () => demo.prompt(ctx.player.state.prompt ? null : 'Menotter'));
$('b-touch').addEventListener('click', () => {
  const touch = ctx.service<InputTouchApi>('input.touch');
  touch?.setForced(touch.visible ? null : true);
});

// ───────────────────────────── API de test ─────────────────────────────

const api = {
  game,
  ctx,
  state,
  director,
  demo,
  forced,
  fx,
  open: openScreen,
  start: startSession,
  apply(patch: Partial<BenchState>): void {
    Object.assign(state, patch);
    applyState();
  },
  releaseLoading(): void {
    loadGate.release?.();
    loadGate.promise = null;
  },
  loading(progress: number, label?: string): void {
    ctx.events.emitAny('ui:loading', { progress, label });
  },
  script(): InputScriptApi | undefined {
    return ctx.service<InputScriptApi>('input.script');
  },
  debug(): UiDebugApi {
    return ctx.require<UiDebugApi>('ui.debug');
  },
  /** Avance la simulation sans attendre l'horloge (les minuteries de l'interface suivent les images réelles). */
  step(seconds: number): void {
    game.step(seconds);
  },
};
declare global {
  interface Window {
    __uiTest: typeof api;
    __ready: boolean;
  }
}
window.__uiTest = api;

async function main(): Promise<void> {
  await game.boot();
  game.run();
  if (flag('touch')) ctx.service<InputTouchApi>('input.touch')?.setForced(true);
  const screen = params.get('screen') ?? 'menu_principal';
  if (screen !== 'menu_principal' || params.get('section') || params.get('accueil')) await openScreen(screen);
  window.__ready = true;
}
main().catch((err: unknown) => {
  console.error('[banc] démarrage impossible', err);
});
