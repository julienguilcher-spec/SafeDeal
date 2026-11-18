/* =====================================================================================
 * PATROUILLES — système de simulation (ordre SystemOrder.CONTROL + 6 : juste après l'IA des unités de police et le
 * commandement, dont il reprend la conduite des voitures qu'il gère). Sans DOM.
 *
 * Demande du commanditaire : « des voitures de police, logiques autour des commissariats ou en patrouille dans la ville,
 * qui me donnent des informations ; toutes les unités de Paris sur ma carte tactique, pas toutes au même endroit :
 * je les déplace selon les points chauds de la manifestation. »
 *
 *   mise en place   au début d'une session d'un rôle de police (hors mission, sauf extra.patrouilles), 3 à 6 voitures
 *                   « Police secours » (TV 75-xx, 3 gardiens) et « BAC » (BAC 75x, 3 policiers en civil), chacune son
 *                   unité ('equipage', faction police, racine propre : le joueur commandant les commande), garées sur la
 *                   chaussée près de leur commissariat, réparties dans la ville loin les unes des autres et de la
 *                   manifestation (sites.ts) ;
 *   patrouille      chaque voiture roule d'elle-même dans son secteur (≈ 700 m autour du commissariat) : point de rue
 *                   tiré au hasard, pilote automatique à l'allure de la circulation, sans deux-tons ;
 *   comptes rendus  canal commandement, avec un débit borné (par voiture et pour toutes) : foyers secondaires proches
 *                   (« rassemblement d'une cinquantaine de personnes place de l'Opéra, ça se tend »), incidents (feux,
 *                   barricades, pillage, automobiliste bloqué), départs de feu, véhicules incendiés ou accidentés,
 *                   manifestants croisés ; R.A.S. de temps à autre ; à l'annonce d'un foyer par CENTRAL, la voiture
 *                   libre la plus proche se signale ;
 *   ordres          (ctx.squads.issue, carte tactique) — mouvement vers un point : elle s'y rend en urgence (deux-tons,
 *                   gyrophares), s'arrête, rend compte (« sur place, … ») et y reste ; « libre » : reprise de la
 *                   patrouille ; tenir / cesser : arrêt sur place ; autres ordres : exécutés par le module de police.
 *                   Sur place ou en mission, elle reprend d'elle-même la patrouille au bout de 10 min.
 *   commissariats   deploy() : voiture engagée depuis un commissariat (src/gameplay/commissariats), posée à sa place
 *                   réservée, équipage à bord, « Au poste » (immobile, silencieuse) jusqu'au premier ordre — dans tous
 *                   les modes, missions comprises ; sendHome() : retour sans urgence à sa place, puis « Au poste ».
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, OrderType, PolicePoste, PoliceRank, RoadSample, SquadOrder, Unsubscribe, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentKind, IncidentsApi } from '@/core/extensions';
import { isPoliceRole } from '@/gameplay/session/roster';
import type { SessionSetupApi } from '@/gameplay/session/api';
import { readVacation } from './model';
import { PATROLS_SERVICE, PATROLS_SYSTEM_ID, PATROL_REPORT_EVENT } from './api';
import type { PatrolKind, PatrolPose, PatrolReport, PatrolState, PatrolView, PatrolsApi } from './api';
import { BAC_SITES, TV_SITES, approx, chooseSites, distanceWords, mood, moodLevel, people, radioFrame } from './sites';
import type { Avoid, PatrolSite } from './sites';

// ───────────────────────────── formes attendues des services (facultatifs) ─────────────────────────────

interface AutopilotLike {
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean; speed?: number; stopBefore?: number }): boolean;
  stop(v: Vehicle): void;
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  convoy?(list: readonly Vehicle[], x: number, z: number, options?: { urgence?: boolean; stopBefore?: number }): boolean;
  status(v: Vehicle): Readonly<{ mode: string; state: string; reason: string; remaining: number; blockedFor: number; urgence: boolean }>;
}
interface VehiclesExtLike {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons?(v: Vehicle, on: boolean): void;
}
interface FoyerLike {
  readonly id: number;
  kind: string;
  name: string;
  x: number;
  z: number;
  people: number;
  tension: number;
  kettled: boolean;
}
interface FoyersLike {
  readonly list: readonly FoyerLike[];
}
interface FoyerEventLike {
  id: number;
  kind: string;
  x: number;
  z: number;
  people: number;
  name: string;
  state: 'debut' | 'fin';
}
interface HazardFieldLike {
  readonly fires: readonly { x: number; z: number; radius: number; intensity: number }[];
}

// ───────────────────────────── réglages ─────────────────────────────

const AUTO_COUNT = 5;
const MAX_COUNT = 8;
/** Rayon du secteur de patrouille autour du commissariat (m) ; distance d'un point de patrouille au suivant. */
const SECTOR_RADIUS = 700;
const HOP_MIN = 220;
const HOP_MAX = 1100;
/** Distances souhaitées : manifestation, emplacement des forces (m). */
const AVOID_DEMO = 700;
const AVOID_FORCES = 450;
/** Réflexion d'une voiture (s), observation (s). */
const THINK = 1;
const OBSERVE = 3;
/** Sur place ou en mission : reprise d'office de la patrouille (s). */
const ON_SCENE_TIMEOUT = 600;
/** Vacation du joueur : aucune voiture de l'IA à moins de cette distance de son point de départ (m). */
const OWN_SITE_CLEAR = 300;
/** Débit radio : écart minimal entre deux comptes rendus d'une voiture, de toutes les voitures, R.A.S. (s). */
const REPORT_GAP = 40;
const GLOBAL_GAP = 9;
const RAS_GAP = 420;
/** Un même sujet n'est redit qu'après ce délai, et s'il a changé (s). */
const SUBJECT_GAP = 150;
/** Portées d'observation (m). */
const SEE_FOYER = 350;
const SEE_INCIDENT = 220;
const SEE_FIRE = 160;
const SEE_VEHICLE = 120;
const SEE_CROWD = 140;
/** Arrêt avant le point désigné (m) : on ne fonce pas dans un rassemblement. */
const STOP_BEFORE = 12;
/** Une voiture proche d'un foyer qui se déclare se signale après l'annonce de CENTRAL (s). */
const FOYER_REPLY_DELAY = 14;
/** Retour au commissariat : arrivée à moins de cette distance de sa place (m) ; relance de la conduite perdue (s). */
const HOME_ARRIVE = 15;
const HOME_RELAUNCH = 1.5;

/** Ordres qui envoient la voiture sur un point (conduite en urgence). */
const MOVE_ORDERS: ReadonlySet<string> = new Set([
  'avancer', 'colonne', 'faire_mouvement', 'repli', 'bond_offensif', 'charge', 'refoulement', 'ligne', 'couper_circulation', 'filtrer',
]);
const HOLD_ORDERS: ReadonlySet<string> = new Set(['tenir', 'cesser', 'tortue']);

const INCIDENT_TEXT: Readonly<Partial<Record<IncidentKind, string>>> = {
  feu_poubelle: 'feu de poubelles',
  feu_barricade: 'barricade en feu',
  feu_vehicule: 'véhicule en feu',
  feu_boutique: 'commerce en feu',
  barricade: 'barricade en travers de la chaussée',
  pillage: 'pillage en cours',
  automobiliste_bloque: 'automobiliste bloqué par des manifestants',
  secours_bloques: 'secours bloqués',
  blesse: 'une personne blessée au sol',
};

interface Subject {
  t: number;
  level: number;
}

interface Patrol {
  view: PatrolView;
  squadId: number;
  vehicleId: EntityId;
  kind: PatrolKind;
  homeX: number;
  homeZ: number;
  home: string;
  /** Points de rue du secteur (x, z à la suite). */
  points: number[];
  state: PatrolState;
  since: number;
  /** Ordre pris en compte (instant d'émission) et type. */
  orderAt: number;
  orderType: OrderType | '';
  tx: number;
  tz: number;
  target: string;
  /** Conduite en urgence demandée vers (tx, tz). */
  urgent: boolean;
  driveAt: number;
  thinkAt: number;
  observeAt: number;
  reportAt: number;
  rasAt: number;
  boardAt: number;
  arrivedReported: boolean;
  subjects: Map<string, Subject>;
  /** Retour au commissariat en cours (sendHome) vers `homeSlot`, sans urgence. */
  homing: boolean;
  /** Place réservée au commissariat (deploy, sendHome), null pour une patrouille ordinaire. */
  homeSlot: PatrolPose | null;
  /** État quitté en passant hors service (pour y revenir : une voiture au poste y reste). */
  beforeOut: PatrolState;
}

/** Lieu d'attache avec sa préposition : « au commissariat du 9e », « à la préfecture de police ». */
function homeAt(home: string): string {
  if (/^(préfecture|caserne)/.test(home)) return 'à la ' + home;
  if (/^commissariat/.test(home)) return 'au ' + home;
  return 'à ' + home;
}

export class PatrolsSystem implements GameSystem {
  readonly id = PATROLS_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 6;

  private ctx: GameContext | null = null;
  private readonly patrols: Patrol[] = [];
  private readonly views: PatrolView[] = [];
  private readonly offs: Unsubscribe[] = [];
  private readonly orders: { squadId: number; order: SquadOrder }[] = [];
  private pending = false;
  private readonly replies: { patrol: Patrol; at: number; text: string }[] = [];
  private globalAt = -1e9;
  private rand: () => number = Math.random;
  /** Générateur de la session en place (sinon Math.random, avant toute mise en place). */
  private seeded = false;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  /** Ordre donné par ce système lui-même (embarquer) : ignoré par l'écoute des ordres. */
  private selfIssue = false;
  private readonly near: Vehicle[] = [];

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    const api: PatrolsApi = {
      get list(): readonly PatrolView[] {
        return self.views;
      },
      isPatrol: (id) => self.of(id) !== null,
      statusOf: (id) => self.of(id)?.view ?? null,
      send: (id, x, z, by) => {
        const p = self.of(id);
        if (!p) return false;
        ctx.squads.issue(id, { type: 'avancer', x, z, heading: Math.atan2(x - p.view.tx, z - p.view.tz), width: 0, issuedBy: by ?? 0 });
        return true;
      },
      resume: (id, by) => {
        if (!self.of(id)) return false;
        ctx.squads.issue(id, { type: 'libre', issuedBy: by ?? 0 });
        return true;
      },
      deploy: (kind, callsign, home, at, homeAt) => self.deploy(kind, callsign, home, at, homeAt),
      sendHome: (id, at, by) => self.sendHome(id, at, by),
    };
    ctx.provide<PatrolsApi>(PATROLS_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.offs.push(ctx.events.on('session:started', () => {
      this.reset();
      this.pending = true;
    }));
    this.offs.push(ctx.events.on('order:issued', ({ squadId, order }) => {
      if (!this.selfIssue && this.of(squadId)) this.orders.push({ squadId, order });
    }));
    this.offs.push(ctx.events.onAny('crowd:foyer', (e) => this.onFoyer(e as FoyerEventLike)));
  }

  reset(): void {
    this.patrols.length = 0;
    this.views.length = 0;
    this.orders.length = 0;
    this.replies.length = 0;
    this.pending = false;
    this.globalAt = -1e9;
    this.rand = Math.random;
    this.seeded = false;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  private of(squadId: number): Patrol | null {
    for (let i = 0; i < this.patrols.length; i++) if (this.patrols[i]!.squadId === squadId) return this.patrols[i]!;
    return null;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.session.config) return;
    if (this.pending) {
      this.pending = false;
      try {
        this.spawnAll();
      } catch (err) {
        console.error('[patrouilles] mise en place impossible', err);
      }
    }
    if (this.patrols.length === 0) return;
    // ordres reçus (après le module de police, qui a déjà pris l'ordre : la conduite est reprise ici)
    if (this.orders.length > 0) {
      for (const o of this.orders) {
        const p = this.of(o.squadId);
        if (p) this.onOrder(p, o.order);
      }
      this.orders.length = 0;
    }
    const now = ctx.clock.now;
    if (this.replies.length > 0) this.flushReplies(now);
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i]!;
      if (now >= p.thinkAt) {
        p.thinkAt = now + THINK;
        this.think(p, now);
      }
      if (now >= p.observeAt) {
        p.observeAt = now + OBSERVE;
        this.observe(p, now);
      }
    }
  }

  // ───────────────────────────── mise en place ─────────────────────────────

  /** Nombre de voitures demandé pour cette session. */
  static count(config: { role: string; missionId?: string; extra?: Record<string, unknown> }): number {
    const v = config.extra ? config.extra['patrouilles'] : undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(MAX_COUNT, Math.round(v)));
    if (!isPoliceRole(config.role as never)) return 0;
    if (config.missionId && config.missionId !== '') return 0;
    return AUTO_COUNT;
  }

  private spawnAll(): void {
    const ctx = this.ctx!;
    const cfg = ctx.session.config!;
    const count = PatrolsSystem.count(cfg);
    if (count === 0 || ctx.world.edgeCount === 0) return;
    this.seed();
    const avoid: Avoid[] = [];
    if (typeof cfg.x === 'number' && typeof cfg.z === 'number') avoid.push({ x: cfg.x, z: cfg.z, radius: AVOID_DEMO });
    const setup = ctx.service<SessionSetupApi>('session.setup');
    const sum = setup ? setup.summary : null;
    if (sum) avoid.push({ x: sum.x, z: sum.z, radius: AVOID_FORCES });
    const me = ctx.player.person();
    if (me) avoid.push({ x: me.x, z: me.z, radius: AVOID_FORCES });
    const b = ctx.world.bounds;
    // vacation du joueur (mode Patrouille) : son propre site n'a pas de voiture de l'IA (même indicatif, ou trop près)
    const vacation = readVacation(cfg);
    const own: { x: number; z: number }[] = vacation
      ? [{ x: vacation.depart.x, z: vacation.depart.z }, ...[...TV_SITES, ...BAC_SITES].filter((s) => s.callsign === vacation.depart.callsign)]
      : [];
    const mine = (x: number, z: number): boolean => own.some((s) => Math.hypot(s.x - x, s.z - z) < OWN_SITE_CLEAR);
    const sites = chooseSites(count, avoid, this.rand, (x, z) => x > b.minX + 150 && x < b.maxX - 150 && z > b.minZ + 150 && z < b.maxZ - 150 && !mine(x, z));
    for (const s of sites) {
      try {
        this.spawn(s);
      } catch (err) {
        console.error(`[patrouilles] voiture ${s.callsign} impossible`, err);
      }
    }
    ctx.people.rebuildIndex();
  }

  /** Générateur de la session (tirages des points de patrouille), une fois par session. */
  private seed(): void {
    if (this.seeded) return;
    const rng = this.ctx!.rng.fork('patrouilles');
    this.rand = () => rng.next();
    this.seeded = true;
  }

  /**
   * Points de rue carrossables du secteur (x, z à la suite, dans `points`) autour de (sx, sz) ; renvoie le milieu de
   * tronçon le plus proche où garer une voiture (null si aucun).
   */
  private sector(sx: number, sz: number, points: number[]): { x: number; z: number; heading: number; width: number; oneway: boolean } | null {
    const world = this.ctx!.world;
    let bestD = Infinity, bx = 0, bz = 0, bh = 0, bw = 0, oneway = false;
    const r2 = SECTOR_RADIUS * SECTOR_RADIUS;
    for (let id = 0; id < world.edgeCount; id++) {
      const e = world.edge(id);
      if (e.pedestrianOnly || e.roadClass === 'pedestrian' || e.roadClass === 'footway' || e.roadClass === 'motorway' || e.bridge) continue;
      const pts = e.points;
      const n = pts.length >> 1;
      if (n < 2 || e.length < 25) continue;
      const k = Math.max(0, Math.min(n - 2, (n >> 1) - 1));
      const ax = pts[k * 2]!, az = pts[k * 2 + 1]!, cx = pts[k * 2 + 2]!, cz = pts[k * 2 + 3]!;
      const mx = (ax + cx) * 0.5, mz = (az + cz) * 0.5;
      const d2 = (mx - sx) * (mx - sx) + (mz - sz) * (mz - sz);
      if (d2 > r2) continue;
      if (e.roadClass !== 'service') points.push(mx, mz);
      if (d2 < bestD && e.width >= 5 && e.roadClass !== 'service') {
        bestD = d2;
        bx = mx;
        bz = mz;
        bh = Math.atan2(cx - ax, cz - az);
        bw = e.width;
        oneway = e.oneway;
      }
    }
    return bestD === Infinity ? null : { x: bx, z: bz, heading: bh, width: bw, oneway };
  }

  private spawn(site: PatrolSite): void {
    const ctx = this.ctx!;
    // points de rue carrossables du secteur, et le plus proche du commissariat pour la garer
    const points: number[] = [];
    const best = this.sector(site.x, site.z, points);
    if (!best || points.length < 8) {
      console.warn(`[patrouilles] pas de rue pour ${site.callsign} (${site.home})`);
      return;
    }
    const bh = best.heading;
    // sur la voie de droite (droite = (−cos h, sin h) dans le repère du jeu ; voir contracts SeatDef)
    const lateral = best.oneway ? 0 : Math.min(2.5, best.width * 0.22);
    let x = best.x - Math.cos(bh) * lateral;
    let z = best.z + Math.sin(bh) * lateral;
    // une place libre de tout autre véhicule
    for (let tries = 0; tries < 6 && ctx.vehicles.queryRadius(x, z, 6, this.near) > 0; tries++) {
      x += Math.sin(bh) * 9;
      z += Math.cos(bh) * 9;
    }
    this.spawnCar(site.kind, site.callsign, site.home, site.x, site.z, { x, z, heading: bh }, points);
  }

  /**
   * Crée une voiture et son équipage de trois à bord, posée exactement à `at`, et la suit (état 'patrouille').
   * Police secours : voiture sérigraphiée ; BAC : voiture banalisée quand le module des véhicules la définit.
   */
  private spawnCar(kind: PatrolKind, callsign: string, home: string, homeX: number, homeZ: number, at: PatrolPose, points: number[]): Patrol {
    const ctx = this.ctx!;
    const { x, z, heading: bh } = at;
    const vehicleKind = kind === 'bac' && ctx.vehicles.def('voiture_bac') ? 'voiture_bac' : 'voiture_police';
    const v = ctx.vehicles.spawn(vehicleKind, x, z, bh, { faction: 'police' });
    v.y = ctx.world.heightAt(x, z);
    const squad = ctx.squads.create('equipage', 'police', callsign);
    squad.vehicleId = v.id;
    const person = kind === 'bac' ? 'policier_civil' : 'crs';
    const roster: [PolicePoste, PoliceRank, 'driver' | 'passenger'][] = kind === 'bac'
      ? [['interpellation', 'brigadier_chef', 'passenger'], ['conducteur', 'gardien', 'driver'], ['interpellation', 'gardien', 'passenger']]
      : [['operateur', 'brigadier_chef', 'passenger'], ['conducteur', 'gardien', 'driver'], ['operateur', 'gardien', 'passenger']];
    const seed = (ctx.session.config?.seed ?? 1) * 977 + squad.id * 31;
    for (let i = 0; i < roster.length; i++) {
      const [poste, rank, seat] = roster[i]!;
      const p = ctx.archetypes.spawn(person, x + 3, z + i, { heading: bh, seed: seed + i * 7, poste, rank, profile: null });
      p.faction = 'police';
      ctx.squads.addMember(squad.id, p.id);
      if (i === 0) ctx.squads.setLeader(squad.id, p.id);
      if (!ctx.vehicles.enter(p, v, seat)) ctx.vehicles.enter(p, v, 'passenger');
    }
    const view: PatrolView = {
      squadId: squad.id, vehicleId: v.id, name: callsign, kind, state: 'patrouille', label: 'Patrouille',
      home, homeX, homeZ, tx: x, tz: z, target: '',
    };
    const now = ctx.clock.now;
    const p: Patrol = {
      view, squadId: squad.id, vehicleId: v.id, kind, homeX, homeZ, home, points,
      state: 'patrouille', since: now, orderAt: -1, orderType: '', tx: x, tz: z, target: '', urgent: false, driveAt: -1e9,
      thinkAt: now + 0.5 + this.patrols.length * 0.37, observeAt: now + 8 + this.patrols.length * 1.3,
      reportAt: -1e9, rasAt: now + 120 + this.patrols.length * 45, boardAt: -1e9, arrivedReported: true, subjects: new Map(),
      homing: false, homeSlot: null, beforeOut: 'patrouille',
    };
    this.patrols.push(p);
    this.views.push(view);
    return p;
  }

  // ───────────────────────────── commissariats ─────────────────────────────

  /** Voiture engagée depuis un commissariat : posée à sa place, équipage à bord, « Au poste ». */
  private deploy(kind: PatrolKind, callsign: string, home: string, at: PatrolPose, homeAt?: { x: number; z: number }): number {
    const ctx = this.ctx;
    if (!ctx || ctx.world.edgeCount === 0) return 0;
    this.seed();
    const hx = homeAt ? homeAt.x : at.x;
    const hz = homeAt ? homeAt.z : at.z;
    const points: number[] = [];
    this.sector(hx, hz, points);
    const p = this.spawnCar(kind, callsign, home, hx, hz, { x: at.x, z: at.z, heading: at.heading }, points);
    p.homeSlot = { x: at.x, z: at.z, heading: at.heading };
    this.setState(p, 'au_poste', ctx.clock.now);
    const v = ctx.vehicles.get(p.vehicleId);
    if (v) {
      // garée : moteur au ralenti, frein serré (le pilote automatique reprend la main au premier ordre)
      v.cmd.throttle = 0;
      v.cmd.brake = 1;
      v.cmd.handbrake = true;
    }
    this.syncView(p);
    ctx.people.rebuildIndex();
    return p.squadId;
  }

  /** Retour sans urgence à sa place du commissariat. */
  private sendHome(squadId: number, at: PatrolPose, by?: EntityId): boolean {
    const ctx = this.ctx;
    const p = ctx ? this.of(squadId) : null;
    if (!ctx || !p) return false;
    const v = ctx.vehicles.get(p.vehicleId);
    if (!v || p.state === 'hors_service') return false;
    const now = ctx.clock.now;
    p.homeSlot = { x: at.x, z: at.z, heading: at.heading };
    p.tx = at.x;
    p.tz = at.z;
    p.target = p.home;
    p.urgent = false;
    p.arrivedReported = false;
    p.homing = true;
    p.driveAt = -1e9;
    this.lightsOff(v);
    // l'ordre en cours est levé (la carte ne trace plus de flèche vers l'ancien point) ; la conduite est reprise ici
    this.issueSelf(squadId, { type: 'libre', issuedBy: by ?? 0 });
    this.setState(p, 'en_route', now);
    this.say(p, 'retour', radioFrame(this.superiorOf(by ?? 0), p.view.name, `Je rentre ${homeAt(p.home)}, sans urgence`), 1, true);
    this.syncView(p);
    // première relance à la réflexion suivante (le module de police prend d'abord l'ordre « libre »)
    p.thinkAt = Math.min(p.thinkAt, now + 0.2);
    return true;
  }

  private driveHome(p: Patrol, v: Vehicle, now: number): void {
    const ap = this.autopilot();
    const slot = p.homeSlot;
    if (!ap || !slot) return;
    p.driveAt = now;
    // « colonne d'un seul véhicule » (comme le retour des fourgons, police/command/convoy.ts) : sans deux-tons, mais elle
    // contourne une voiture arrêtée sur sa voie — en simple conduite, elle l'attendait sans fin (place de la Concorde)
    const go = (x: number, z: number): boolean => (typeof ap.convoy === 'function'
      ? ap.convoy([v], x, z, { urgence: false, stopBefore: 2 })
      : ap.driveTo(v, x, z, { urgence: false, stopBefore: 2 }));
    if (!go(slot.x, slot.z)) {
      // place injoignable par les rues : au point de rue le plus proche
      const world = this.ctx!.world;
      if (world.nearestRoad(slot.x, slot.z, this.road, 60)) go(this.road.x, this.road.z);
    }
    this.lightsOff(v);
  }

  /** Retour en cours : arrivée (garée à sa place, « Au poste »), ou conduite relancée. */
  private thinkHome(p: Patrol, v: Vehicle, now: number): void {
    const ap = this.autopilot()!;
    const slot = p.homeSlot!;
    const st = ap.status(v);
    const d = Math.hypot(slot.x - v.x, slot.z - v.z);
    // (« arrivé » : seulement au bout de la conduite de retour, pas l'état laissé par un trajet précédent)
    const driven = p.driveAt >= p.since && now - p.driveAt > 0.5;
    if (d < HOME_ARRIVE || (st.state === 'arrive' && driven)) {
      // les derniers mètres : manœuvre jusqu'à sa place, dans son cap (nez vers la sortie)
      if (d < 30 && (d > 0.6 || Math.abs(Math.atan2(Math.sin(v.heading - slot.heading), Math.cos(v.heading - slot.heading))) > 0.1)) {
        ap.park(v, slot.x, slot.z, slot.heading);
      } else if (st.mode === 'drive') ap.stop(v);
      p.homing = false;
      p.tx = slot.x;
      p.tz = slot.z;
      p.arrivedReported = true;
      this.setState(p, 'au_poste', now);
      this.lightsOff(v);
      // (pas « équipage disponible » : le commissariat met l'équipage au repos et l'annonce juste après)
      this.say(p, 'arrivee', radioFrame('CENTRAL', p.view.name, `Au poste, ${p.home}`), 1, true);
      return;
    }
    if (!this.crewAboard(p, v, now)) return;
    // conduite perdue (ordre « libre » pris par le module de police, blocage durable) ou reprise en urgence : relance
    const lost = st.mode !== 'drive' || st.urgence || (st.state === 'bloque' && st.blockedFor > 30) || st.state === 'echec';
    if (lost && now - p.driveAt > (st.state === 'echec' ? 10 : HOME_RELAUNCH)) this.driveHome(p, v, now);
    if (!st.urgence && (v.siren !== 0 || v.beacons)) this.lightsOff(v);
  }

  // ───────────────────────────── ordres ─────────────────────────────

  private onOrder(p: Patrol, o: SquadOrder): void {
    const ctx = this.ctx!;
    const now = ctx.clock.now;
    p.orderAt = o.issuedAt;
    p.orderType = o.type;
    // tout ordre du joueur interrompt un retour au commissariat ; depuis « au poste », mêmes suites qu'en patrouille
    p.homing = false;
    const v = ctx.vehicles.get(p.vehicleId);
    if (o.type === 'libre') {
      if (p.state !== 'patrouille') {
        this.setState(p, 'patrouille', now);
        this.say(p, 'reprise', radioFrame(this.superior(o), p.view.name, `Reçu, nous reprenons la patrouille, secteur ${p.home}`), 1, true);
      }
      if (v) this.lightsOff(v);
      p.driveAt = -1e9;
      this.nextPatrolPoint(p, now);
      return;
    }
    if (MOVE_ORDERS.has(o.type)) {
      p.tx = o.x;
      p.tz = o.z;
      p.target = this.placeName(o.x, o.z);
      p.urgent = true;
      p.arrivedReported = false;
      this.setState(p, 'en_route', now);
      const d = v ? Math.hypot(o.x - v.x, o.z - v.z) : 0;
      if (v) this.driveUrgent(p, v, now);
      this.say(p, 'depart', radioFrame(this.superior(o), p.view.name, `Reçu, nous faisons mouvement sur ${p.target}, deux tons, ${distanceWords(d)}`), 1, true);
      return;
    }
    if (HOLD_ORDERS.has(o.type)) {
      if (v) {
        this.autopilot()?.stop(v);
        p.tx = v.x;
        p.tz = v.z;
      }
      p.target = v ? this.placeName(v.x, v.z) : '';
      p.urgent = false;
      p.arrivedReported = true;
      this.setState(p, 'sur_place', now);
      return;
    }
    // protéger, escorter, interpeller, embarquer… : le module de police s'en charge
    p.urgent = false;
    p.target = o.x !== 0 || o.z !== 0 ? this.placeName(o.x, o.z) : '';
    this.setState(p, 'mission', now);
  }

  private superior(o: SquadOrder): string {
    return this.superiorOf(o.issuedBy);
  }

  private superiorOf(issuedBy: EntityId): string {
    const ctx = this.ctx!;
    if (issuedBy !== 0) {
      const by = ctx.people.get(issuedBy);
      const s = by && by.squadId !== 0 ? ctx.squads.get(by.squadId) : undefined;
      if (s && s.name !== '') return s.name.toUpperCase();
    }
    return 'CENTRAL';
  }

  // ───────────────────────────── conduite ─────────────────────────────

  private autopilot(): AutopilotLike | undefined {
    return this.ctx!.service<AutopilotLike>('vehicles.autopilot');
  }

  private setState(p: Patrol, state: PatrolState, now: number): void {
    p.state = state;
    p.since = now;
    const v = p.view;
    v.state = state;
    v.label = state === 'patrouille' ? 'Patrouille' : state === 'en_route' ? (p.homing ? 'Retour au poste' : 'En route (urgence)')
      : state === 'sur_place' ? 'Sur place' : state === 'mission' ? 'En mission' : state === 'au_poste' ? 'Au poste' : 'Hors service';
  }

  private syncView(p: Patrol): void {
    const v = p.view;
    v.tx = p.tx;
    v.tz = p.tz;
    v.target = p.state === 'patrouille' || p.state === 'au_poste' ? '' : p.target;
  }

  private lightsOff(v: Vehicle): void {
    const ext = this.ctx!.service<VehiclesExtLike>('vehicles.ext');
    if (v.siren !== 0) {
      if (ext && ext.setSiren) ext.setSiren(v, 0);
      else v.siren = 0;
    }
    if (v.beacons) {
      if (ext && ext.setBeacons) ext.setBeacons(v, false);
      else v.beacons = false;
    }
  }

  private driveUrgent(p: Patrol, v: Vehicle, now: number): void {
    const ap = this.autopilot();
    if (!ap) return;
    p.driveAt = now;
    const d = Math.hypot(p.tx - v.x, p.tz - v.z);
    // au point de la chaussée le plus proche du point désigné (une place, un parvis, un square ne se traversent pas)
    const world = this.ctx!.world;
    let x = p.tx, z = p.tz;
    if (world.nearestRoad(p.tx, p.tz, this.road, 60) && !world.edge(this.road.edgeId).pedestrianOnly) {
      x = this.road.x;
      z = this.road.z;
    }
    if (!ap.driveTo(v, x, z, { urgence: true, stopBefore: Math.min(STOP_BEFORE, d * 0.5) })) {
      // pas d'itinéraire jusque-là : au point de rue le plus proche du point désigné
      if (world.nearestRoad(p.tx, p.tz, this.road, 150)) ap.driveTo(v, this.road.x, this.road.z, { urgence: true, stopBefore: 4 });
    }
  }

  /** Au moins un équipier valide et libre (ni hors de combat, ni menotté, ni interpellé) ? */
  private crewFit(members: readonly EntityId[]): boolean {
    const ctx = this.ctx!;
    for (const id of members) {
      const m = ctx.people.get(id);
      if (m && m.custody === 'free' && !ctx.health.isIncapacitated(m)) return true;
    }
    return false;
  }

  /** Équipage au complet à bord et au volant ? Sinon, ordre d'embarquer (au plus toutes les 30 s). */
  private crewAboard(p: Patrol, v: Vehicle, now: number): boolean {
    const ctx = this.ctx!;
    const squad = ctx.squads.get(p.squadId);
    if (!squad) return false;
    let out = 0;
    for (const id of squad.members) {
      const m = ctx.people.get(id);
      if (m && m.vehicleId !== v.id && !ctx.health.isIncapacitated(m) && m.custody === 'free') out++;
    }
    if (out === 0 && v.seats[0] !== 0) return true;
    if (now - p.boardAt > 30) {
      p.boardAt = now;
      // (l'ordre d'embarquer ne doit pas faire sortir la voiture de sa patrouille : il n'est pas écouté ici)
      this.issueSelf(p.squadId, { type: 'embarquer', targetId: v.id });
    }
    return false;
  }

  /** Ordre donné par ce système à une voiture : pris par le module de police, pas écouté ici. */
  private issueSelf(squadId: number, order: Partial<SquadOrder> & { type: OrderType }): void {
    this.selfIssue = true;
    try {
      this.ctx!.squads.issue(squadId, order);
    } finally {
      this.selfIssue = false;
    }
  }

  private nextPatrolPoint(p: Patrol, now: number): void {
    const ctx = this.ctx!;
    const v = ctx.vehicles.get(p.vehicleId);
    const ap = this.autopilot();
    if (!v || !ap) return;
    const pts = p.points;
    const n = pts.length >> 1;
    for (let tries = 0; tries < 8 && n > 0; tries++) {
      const k = Math.floor(this.rand() * n) % n;
      const x = pts[k * 2]!, z = pts[k * 2 + 1]!;
      const d = Math.hypot(x - v.x, z - v.z);
      if ((d < HOP_MIN || d > HOP_MAX) && tries < 6) continue;
      if (ap.driveTo(v, x, z, { stopBefore: 2 })) {
        p.tx = x;
        p.tz = z;
        p.driveAt = now;
        this.syncView(p);
        return;
      }
    }
    // secteur sans itinéraire depuis ici : retour vers le commissariat
    ap.driveTo(v, p.homeX, p.homeZ, { stopBefore: 10 });
    p.tx = p.homeX;
    p.tz = p.homeZ;
    p.driveAt = now;
    this.syncView(p);
  }

  private think(p: Patrol, now: number): void {
    const ctx = this.ctx!;
    const v = ctx.vehicles.get(p.vehicleId);
    const squad = ctx.squads.get(p.squadId);
    if (!v || !squad || v.state === 'wrecked' || v.state === 'burnt' || !this.crewFit(squad.members)) {
      if (p.state !== 'hors_service') {
        p.beforeOut = p.state;
        p.homing = false;
        this.setState(p, 'hors_service', now);
        // équipage hors de combat (blessé, menotté, interpellé) : la voiture ne roule plus d'elle-même
        if (v) {
          this.autopilot()?.stop(v);
          this.lightsOff(v);
        }
      }
      this.syncView(p);
      return;
    }
    // de nouveau en état : une voiture au poste y reste, les autres reprennent la patrouille
    if (p.state === 'hors_service') this.setState(p, p.beforeOut === 'au_poste' ? 'au_poste' : 'patrouille', now);
    const ap = this.autopilot();
    if (!ap) return;
    if (p.homing) {
      this.thinkHome(p, v, now);
      this.syncView(p);
      return;
    }
    const st = ap.status(v);
    switch (p.state) {
      case 'au_poste':
        // garée à sa place, équipage à bord : en attente d'ordre
        break;
      case 'patrouille': {
        if (!this.crewAboard(p, v, now)) break;
        // une patrouille roule sans deux-tons : après un dégagement (deux-tons pour passer une foule, session/engins.ts),
        // la conduite normale reprend dès que la voie est libre
        if (st.urgence && st.state === 'en_route' && Math.abs(v.speed) > 3) {
          ap.driveTo(v, p.tx, p.tz, { stopBefore: 2 });
          this.lightsOff(v);
        } else if (!st.urgence && (v.siren !== 0 || v.beacons)) this.lightsOff(v);
        const done = st.mode === 'idle' || st.mode === 'stop' || st.state === 'arrive' || st.state === 'echec';
        const stuck = st.state === 'bloque' && st.blockedFor > 20;
        if (done || stuck || now - p.driveAt > 300) this.nextPatrolPoint(p, now);
        break;
      }
      case 'en_route': {
        const d = Math.hypot(p.tx - v.x, p.tz - v.z);
        // arrivée : au bout de l'itinéraire, ou arrêtée tout près du point (le point lui-même peut être dans un bâtiment,
        // un square, au pied d'un mur : on ne s'acharne pas à quelques mètres)
        const arrived = st.state === 'arrive' || ((st.mode === 'idle' || st.mode === 'stop') && d < 60)
          || (st.state === 'bloque' && st.blockedFor > 3 && (st.remaining < 30 || d < 50));
        if (arrived || d < STOP_BEFORE + 3) {
          if (st.mode === 'drive') ap.stop(v);
          this.setState(p, 'sur_place', now);
          this.reportArrival(p, v);
          break;
        }
        if (st.state === 'echec') {
          // itinéraire impossible : compte rendu, la voiture reste là où elle est
          this.setState(p, 'sur_place', now);
          this.say(p, 'arrivee', radioFrame('CENTRAL', p.view.name, `Itinéraire impossible jusqu’à ${p.target}, nous sommes arrêtés ${this.placeName(v.x, v.z)}`), 1, true);
          break;
        }
        // le module de police (ou une autre consigne) a repris le volant au pas, ou la voiture s'est arrêtée en chemin :
        // on relance la conduite en urgence (au plus toutes les 3 s)
        const lost = st.mode !== 'drive' || !st.urgence || (st.state === 'bloque' && st.blockedFor > 30);
        if (lost && now - p.driveAt > 3) this.driveUrgent(p, v, now);
        break;
      }
      case 'sur_place':
      case 'mission': {
        if (now - p.since > ON_SCENE_TIMEOUT) {
          if (p.state === 'mission' && !this.crewAboard(p, v, now)) break;
          this.setState(p, 'patrouille', now);
          this.say(p, 'reprise', radioFrame('CENTRAL', p.view.name, `Rien de plus pour nous ${p.target !== '' ? p.target : 'ici'}, nous reprenons la patrouille`), 0, true);
          this.lightsOff(v);
          // l'ordre échu est levé (la carte ne trace plus de flèche vers l'ancien point) ; le module de police arrête la
          // voiture en le prenant : la patrouille repart à la réflexion suivante
          this.issueSelf(p.squadId, { type: 'libre' });
          p.driveAt = -1e9;
        }
        break;
      }
      default:
        break;
    }
    this.syncView(p);
  }

  // ───────────────────────────── comptes rendus ─────────────────────────────

  private placeName(x: number, z: number): string {
    const world = this.ctx!.world;
    let name = '';
    try { name = world.sectorName(x, z); } catch { name = ''; }
    if (name === '' && world.nearestRoad(x, z, this.road, 60) && this.road.name) name = this.road.name;
    return name !== '' ? name : 'le point indiqué';
  }

  /** Diffuse un compte rendu. `force` : hors débit (accusé de réception, arrivée). */
  private say(p: Patrol, key: string, text: string, priority: 0 | 1 | 2, force: boolean): boolean {
    const ctx = this.ctx!;
    const now = ctx.clock.now;
    if (!force && (now - this.globalAt < GLOBAL_GAP || now - p.reportAt < (priority === 2 ? 15 : REPORT_GAP))) return false;
    this.globalAt = now;
    p.reportAt = now;
    p.rasAt = now + RAS_GAP;
    const squad = ctx.squads.get(p.squadId);
    ctx.radio.say({ channel: 'commandement', from: p.view.name, text, priority, personId: squad ? squad.leaderId : undefined });
    const v = ctx.vehicles.get(p.vehicleId);
    const e: PatrolReport = { squadId: p.squadId, name: p.view.name, key, text, x: v ? v.x : p.tx, z: v ? v.z : p.tz, t: now };
    ctx.events.emitAny(PATROL_REPORT_EVENT, e);
    return true;
  }

  /** Sujet nouveau, ou passé d'un palier depuis assez longtemps ? */
  private fresh(p: Patrol, key: string, level: number, now: number): boolean {
    const s = p.subjects.get(key);
    return !s || (level > s.level && now - s.t > SUBJECT_GAP * 0.4) || (level !== s.level && now - s.t > SUBJECT_GAP);
  }

  private mark(p: Patrol, key: string, level: number, now: number): void {
    const s = p.subjects.get(key);
    if (s) {
      s.t = now;
      s.level = level;
    } else p.subjects.set(key, { t: now, level });
  }

  private protesters(x: number, z: number, r: number): number {
    return this.ctx!.people.countIn(x, z, r, (q) => q.faction === 'protest' && q.custody === 'free' && !q.dormant);
  }

  private reportArrival(p: Patrol, v: Vehicle): void {
    const ctx = this.ctx!;
    const n = this.protesters(v.x, v.z, 90);
    let body = `Sur place, ${p.target}`;
    if (n >= 5) body += `, ${people(n, 'personnes')}, ${mood(ctx.director.tensionAt(v.x, v.z))}`;
    else body += ', calme, rien à signaler pour l’instant';
    p.arrivedReported = true;
    this.say(p, 'arrivee', radioFrame('CENTRAL', p.view.name, body + '. Nous restons sur place', true), 1, true);
  }

  private observe(p: Patrol, now: number): void {
    const ctx = this.ctx!;
    const v = ctx.vehicles.get(p.vehicleId);
    if (!v || p.state === 'hors_service' || p.state === 'au_poste') return;
    if (now - p.reportAt < REPORT_GAP || now - this.globalAt < GLOBAL_GAP) return;
    const name = p.view.name;
    // 1. foyers secondaires à portée de vue
    const foyers = ctx.service<FoyersLike>('crowd.foyers');
    if (foyers) {
      for (const f of foyers.list) {
        const reach = f.kind === 'casseurs' ? SEE_FOYER * 0.75 : SEE_FOYER;
        if (Math.hypot(f.x - v.x, f.z - v.z) > reach || f.people <= 0) continue;
        const key = 'f' + f.id;
        const level = moodLevel(f.tension) * 10 + Math.min(9, Math.floor(Math.log2(Math.max(1, f.people))));
        if (!this.fresh(p, key, level, now)) continue;
        const where = f.name !== '' ? f.name : this.placeName(f.x, f.z);
        let body: string;
        if (f.kind === 'casseurs') {
          body = `Groupe ${people(f.people, 'individus')} vêtus de noir, ${where}, ${f.tension > 0.5 ? 'dégradations en cours' : 'ils se déplacent de vitrine en vitrine'}. Nous restons à distance`;
        } else if (f.kind === 'blocage') {
          body = `${capital(people(f.people, 'personnes'))} assises en travers de la chaussée, ${where}, circulation bloquée, ${mood(f.tension)}`;
        } else {
          body = `Rassemblement ${ofPeople(f.people)}, ${where}, ${mood(f.tension)}`;
        }
        if (f.kettled) body += ', encerclé par nos effectifs';
        if (this.say(p, 'foyer', radioFrame('CENTRAL', name, body), f.tension >= 0.65 || f.kind === 'casseurs' ? 2 : 1, false)) this.mark(p, key, level, now);
        return;
      }
    }
    // 2. incidents à portée
    const inc = ctx.service<IncidentsApi>(EXT.incidents);
    if (inc) {
      for (const i of inc.list) {
        if (i.state === 'resolu' || i.state === 'echoue') continue;
        const what = INCIDENT_TEXT[i.kind];
        if (!what || Math.hypot(i.x - v.x, i.z - v.z) > SEE_INCIDENT) continue;
        const key = 'i' + i.id;
        if (!this.fresh(p, key, 0, now)) continue;
        const fire = i.kind.startsWith('feu');
        const body = `${capital(what)}, ${this.placeName(i.x, i.z)}${fire ? ', demandons les pompiers' : i.kind === 'blesse' ? ', demandons le SAMU' : ''}`;
        if (this.say(p, 'incident', radioFrame('CENTRAL', name, body), i.urgency >= 2 ? 2 : 1, false)) {
          this.mark(p, key, 0, now);
          // le feu correspondant n'est pas redit comme départ de feu
          this.mark(p, fireKey(i.x, i.z), 0, now);
        }
        return;
      }
    }
    // 3. départs de feu
    const field = ctx.service<HazardFieldLike>('hazards.field');
    if (field) {
      for (const f of field.fires) {
        if (f.intensity < 0.25 || Math.hypot(f.x - v.x, f.z - v.z) > SEE_FIRE) continue;
        const key = fireKey(f.x, f.z);
        if (!this.fresh(p, key, 0, now)) continue;
        if (this.say(p, 'feu', radioFrame('CENTRAL', name, `Départ de feu, ${this.placeName(f.x, f.z)}, demandons les pompiers`), 2, false)) this.mark(p, key, 0, now);
        return;
      }
    }
    // 4. véhicules incendiés ou accidentés
    const n = ctx.vehicles.queryRadius(v.x, v.z, SEE_VEHICLE, this.near);
    for (let k = 0; k < n; k++) {
      const o = this.near[k]!;
      if (o === v || o.def.flying) continue;
      const burning = o.state === 'burning' || o.burning > 0.2;
      const wrecked = o.state === 'wrecked' || o.state === 'burnt';
      if (!burning && !wrecked) continue;
      const key = 'v' + o.id;
      const level = burning ? 1 : 0;
      if (!this.fresh(p, key, level, now)) continue;
      const what = o.faction === 'police' ? 'véhicule de police' : 'véhicule';
      const body = burning ? `${capital(what)} en feu, ${this.placeName(o.x, o.z)}, demandons les pompiers` : `${capital(what)} accidenté, ${this.placeName(o.x, o.z)}, nous sécurisons`;
      if (this.say(p, 'vehicule', radioFrame('CENTRAL', name, body), burning ? 2 : 1, false)) this.mark(p, key, level, now);
      return;
    }
    // 5. manifestants croisés hors foyer (ceux d'un foyer en vue sont déjà comptés avec lui)
    let nearFoyer = false;
    if (foyers) for (const f of foyers.list) if (Math.hypot(f.x - v.x, f.z - v.z) < SEE_FOYER + SEE_CROWD) nearFoyer = true;
    const crowd = nearFoyer ? 0 : this.protesters(v.x, v.z, SEE_CROWD);
    if (crowd >= 25) {
      const key = 'c' + Math.round(v.x / 300) + ':' + Math.round(v.z / 300);
      const tension = ctx.director.tensionAt(v.x, v.z);
      const level = moodLevel(tension) * 10 + Math.min(9, Math.floor(Math.log2(crowd)));
      if (this.fresh(p, key, level, now)) {
        if (this.say(p, 'foule', radioFrame('CENTRAL', name, `Manifestants, ${approx(crowd)} personnes, ${this.placeName(v.x, v.z)}, ${mood(tension)}`), tension > 0.65 ? 2 : 1, false)) {
          this.mark(p, key, level, now);
        }
        return;
      }
    }
    // 6. rien : R.A.S. de temps à autre
    if (p.state === 'patrouille' && now >= p.rasAt) {
      this.say(p, 'ras', radioFrame('CENTRAL', name, `R.A.S., patrouille ${this.placeName(v.x, v.z)}`), 0, false);
    }
  }

  /** Un foyer se déclare : la voiture libre la plus proche se signale à CENTRAL, après son annonce (une fois par foyer). */
  private onFoyer(e: FoyerEventLike): void {
    const ctx = this.ctx;
    if (!ctx || e.state !== 'debut' || this.patrols.length === 0) return;
    let best: Patrol | null = null;
    let bestD = 1600;
    for (const p of this.patrols) {
      if (p.state !== 'patrouille') continue;
      const v = ctx.vehicles.get(p.vehicleId);
      if (!v) continue;
      const d = Math.hypot(e.x - v.x, e.z - v.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // (déjà en vue du foyer : elle en rendra compte d'elle-même)
    if (!best || bestD <= SEE_FOYER) return;
    const where = e.name !== '' ? e.name : this.placeName(e.x, e.z);
    this.replies.push({
      patrol: best, at: ctx.clock.now + FOYER_REPLY_DELAY,
      text: radioFrame('CENTRAL', best.view.name, `Pour ${where} : nous sommes à ${distanceWords(bestD)}, en mesure de nous y porter`, true),
    });
  }

  /** Réponses différées (après l'annonce de CENTRAL, que la radio diffuse en premier). */
  private flushReplies(now: number): void {
    const list = this.replies;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]!;
      if (now < r.at) continue;
      list.splice(i, 1);
      if (r.patrol.state === 'patrouille') this.say(r.patrol, 'foyer', r.text, 1, true);
    }
  }
}

/** « d’une cinquantaine de personnes », « de quelques personnes », « d’environ deux cents personnes ». */
function ofPeople(n: number): string {
  const s = people(n, 'personnes');
  return /^[aeéèêiïoôuh]/i.test(s) || s.startsWith('une ') ? 'd’' + s : 'de ' + s;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fireKey(x: number, z: number): string {
  return 'feu' + Math.round(x / 40) + ':' + Math.round(z / 40);
}
