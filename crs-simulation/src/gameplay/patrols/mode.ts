/* =====================================================================================
 * PATROUILLE — répartiteur d'appels de la vacation (PatrolModeSystem, service 'patrol.mode'). Sans DOM.
 *
 * Actif seulement pendant une vacation (session portant extra.vacation : voir model.ts readVacation). Ordre :
 * juste après les patrouilles de l'IA (PatrolsSystem), dont il emprunte les voitures pour les appels confiés.
 *
 *   appels        au rythme de la vacation (calls.ts), un événement RÉEL se déclare quelque part dans Paris, à 500–
 *                 2 000 m de l'équipage : rassemblement, groupe de casseurs ou blocage (FoyersApi.declare), cortège
 *                 sauvage (ManifsApi.declare), feu de poubelles, de conteneur ou de voiture (ctx.hazards.ignite, comme
 *                 la journée de service ; la détection des incidents ouvre l'incident, rattaché par proximité). Si la
 *                 simulation refuse (aucun lieu, foule au plafond), deux autres tirages au plus.
 *   annonce       CENTRAL appelle l'équipage (canal commandement) et l'événement 'patrol:call' (état 'annonce') fait
 *                 apparaître la carte d'appel. Un équipage déjà sur un appel n'en reçoit pas d'autre : CENTRAL le
 *                 donne directement à une patrouille de l'IA.
 *   prise         accept() : objectif GPS (EXT.objectives) ; en chef de bord, le conducteur de l'IA part en urgence
 *                 (deux-tons, gyrophares) ; à moins de 60 m, « sur place ». decline(), ou 90 s sans réponse : CENTRAL
 *                 confie l'appel à la patrouille de l'IA libre la plus proche (PatrolsApi.send).
 *   fin d'appel   le foyer se disperse ('crowd:foyer' fin), le cortège se termine, le feu est éteint ; close() : fin
 *                 d'intervention prononcée par l'équipage.
 *   renforts      requestBackup : patrouille de l'IA la plus proche ; compagnie de CRS (rassemblement ou cortège
 *                 sauvage, une seule à la fois) engagée 120 à 240 s plus tard depuis une base de service ; pompiers et
 *                 SAMU par le service des secours.
 *   conduite      en chef de bord, le collègue de l'IA conduit (pilote automatique) : au pas dans le secteur entre deux
 *                 appels (points de rue à 300–900 m du départ), en urgence vers l'appel pris, au retour en fin de
 *                 vacation. Il lâche le volant dès que le joueur prend le siège conducteur ou descend. La voiture du
 *                 joueur n'entre jamais dans les patrouilles de l'IA (PatrolsApi). En Mode libre (rôle 'patrouille'
 *                 sans vacation), aucun appel : seule cette conduite au pas existe, loin du parcours du cortège.
 *   fin           à la durée de la vacation (sauf temps réel) : « <indicatif>, fin de vacation, regagnez le service »,
 *                 objectif vers le point de départ ; la session se termine (compte rendu) à moins de 40 m du départ
 *                 ou au bout de 180 s.
 * Tous les tirages passent par des dérivés de ctx.rng : 'patrouille:appels' (appels), 'patrouille:conduite' (points de
 * patrouille), 'patrouille:renforts' (délais et emplacements des renforts).
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, Prop, RoadSample, Rng, Unsubscribe, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, ObjectivesApi, RescueApi } from '@/core/extensions';
import { sessionDurationSeconds } from '@/core/session';
import { CROWD_FOYERS, CROWD_MANIFS, FOYER_EVENT, MANIF_EVENT } from '@/sim/crowd/api';
import type { FoyerEvent, FoyerKind, FoyersApi, ManifEvent, ManifView, ManifsApi } from '@/sim/crowd/api';
import type { AutopilotApi } from '@/sim/vehicles/api';
import { EQUIPAGE_SERVICE } from '@/gameplay/session/equipage';
import type { EquipageApi, EquipageInfo } from '@/gameplay/session/equipage';
import { dispatchCompany } from '@/gameplay/session/manifestations';
import { PATROLS_SERVICE } from './api';
import type { PatrolsApi, PatrolView } from './api';
import {
  CALL_PLACES, RYTHMES, SPOT_MAX, SPOT_MIN, callLabel, callPriority, callSize, callText, nextCallAt, pickKind, pickSpot, placeWords,
} from './calls';
import type { FireTarget, Spot, SpotCandidate } from './calls';
import { PATROL_CALL_EVENT, PATROL_MODE_SERVICE, PATROL_MODE_SYSTEM_ID, readVacation } from './model';
import type {
  BackupKind, CallKind, CallState, DispatchCall, PatrolCallEvent, PatrolModeApi, VacationConfig, VacationSummary,
} from './model';

// ───────────────────────────── réglages ─────────────────────────────

/** Réflexion du répartiteur (s). */
const THINK = 1;
/** Sans réponse au bout de ce délai, l'appel est confié à une patrouille de l'IA (s). */
const ANSWER_TIMEOUT = 90;
/** Arrivée sur les lieux (m). */
const ON_SCENE = 60;
/** Appel resté en attente faute de patrouille libre : nouvel essai de le confier à l'IA (s). */
const RETRY = 30;
/** Tirages en tout pour un appel (le premier, puis deux autres en cas de refus de la simulation). */
const TRIES = 3;
/** Points de rue proposés au planificateur à chaque appel. */
const STREET_POINTS = 28;
/** Compagnie en renfort : délai d'engagement (s). */
const COMPANY_MIN = 120;
const COMPANY_MAX = 240;
/** Fin de vacation : arrivée au point de départ (m), délai au-delà duquel la vacation se clôt d'office (s). */
const HOME_RADIUS = 40;
const HOME_TIMEOUT = 180;
/** Conduite de l'IA (chef de bord) : points de patrouille autour du départ (m), allure au pas (m/s). */
const WANDER_MIN = 300;
const WANDER_MAX = 900;
const WANDER_SPEED = 8;
/** Feu : un incident de feu à moins de ce rayon est celui de l'appel (m) ; fin d'office au bout de (s). */
const FIRE_LINK = 30;
const FIRE_MAX = 900;
/** Blessés comptés autour d'un appel tenu par l'équipage (m). */
const INJURY_RADIUS = 150;
/** Identifiants des objectifs du répartiteur. */
const OBJECTIVE_CALL = 'patrouille.appel';
const OBJECTIVE_HOME = 'patrouille.service';

interface VehiclesExtLike {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons?(v: Vehicle, on: boolean): void;
}
interface CommandLike {
  assignCortege?(id: number, source: ManifView | null): boolean;
  endMission?(id: number): void;
}

/** Données d'exécution d'un appel (en plus de sa vue publique). */
interface CallRt {
  call: DispatchCall;
  /** Position actuelle de l'événement (un groupe de casseurs, un cortège se déplacent). */
  x: number;
  z: number;
  /** L'équipage du joueur a pris l'appel. */
  mine: boolean;
  /** Patrouille de l'IA envoyée (0 : aucune). */
  patrolId: number;
  /** Ce qui brûle, pour un feu ; l'objet ou le véhicule ; le feu a été vu allumé. */
  fire: FireTarget | '';
  propId: EntityId;
  vehicleId: EntityId;
  fireSeen: boolean;
  /** Compagnie promise (instant d'engagement, −1 : non) et compagnie engagée (0 : aucune). */
  companyAt: number;
  companyId: number;
  /** Fin de l'événement (dispersion, fin de cortège, feu éteint) relevée par un événement. */
  over: boolean;
  /** Feu encore actif au bout de FIRE_MAX : l'appel est clos, les sapeurs-pompiers prennent le relais. */
  relay: boolean;
  /** Appel resté sans équipage (« l'appel reste en attente ») : dernier essai de le confier à l'IA (s). */
  retryAt: number;
}

const EMPTY_SUMMARY: VacationSummary = {
  duration: 0, calls: 0, accepted: 0, resolved: 0, delegated: 0, declined: 0, arrests: 0, injured: 0, backups: 0,
};

export class PatrolModeSystem implements GameSystem {
  readonly id = PATROL_MODE_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 7;

  private ctx: GameContext | null = null;
  private readonly offs: Unsubscribe[] = [];
  private vacation: VacationConfig | null = null;
  /**
   * Équipage de patrouille du Mode libre (rôle 'patrouille' sans vacation) : pas d'appels de CENTRAL, mais en chef de
   * bord le collègue conduit quand même, au pas autour du point de départ, à l'écart du parcours du cortège.
   */
  private freeCrew = false;
  /** Point de départ de la conduite au pas (vacation : le départ ; Mode libre : la voiture garée au départ). */
  private homeX = 0;
  private homeZ = 0;
  private homeSet = false;
  private crew: EquipageInfo | null = null;
  private pending = false;
  private startedAt = 0;
  private endAt = Infinity;
  private ending_ = false;
  private endingAt = 0;
  private ended = false;
  private nextAt = Infinity;
  private firstCall = true;
  private thinkAt = 0;
  private readonly rts: CallRt[] = [];
  private readonly calls: DispatchCall[] = [];
  private nextId = 1;
  private readonly stats: VacationSummary = { ...EMPTY_SUMMARY };
  private readonly injuredIds = new Set<EntityId>();
  private callRng: Rng | null = null;
  private driveRng: Rng | null = null;
  private backupRng: Rng | null = null;
  /** Appel qui tient la compagnie de renfort (une seule à la fois ; 0 : aucune). */
  private companyCall = 0;
  /** Conduite de l'IA : ce qu'elle fait, vers où, depuis quand. */
  private apMode: 'aucune' | 'patrouille' | 'urgence' | 'arret' | 'retour' = 'aucune';
  private apX = 0;
  private apZ = 0;
  private apAt = -1e9;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly nearV: Vehicle[] = [];
  private readonly nearP: Prop[] = [];
  private readonly api: PatrolModeApi;

  constructor() {
    const self = this;
    this.api = {
      get active(): boolean { return self.vacation !== null; },
      get callsign(): string { return self.callsign(); },
      get calls(): readonly DispatchCall[] { return self.calls; },
      get current(): DispatchCall | null { return self.current(); },
      get ending(): boolean { return self.ending_; },
      accept: (id) => self.accept(id),
      decline: (id) => self.decline(id),
      close: (id) => self.close(id),
      requestBackup: (id, kind) => self.requestBackup(id, kind),
      summary: () => self.summary(),
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<PatrolModeApi>(PATROL_MODE_SERVICE, this.api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.offs.push(ctx.events.on('session:started', ({ config }) => {
      this.reset();
      this.vacation = readVacation(config);
      if (this.vacation) this.pending = true;
      else if (config.role === 'patrouille') {
        this.freeCrew = true;
        this.driveRng = ctx.rng.fork('patrouille:conduite');
      }
    }));
    this.offs.push(ctx.events.onAny(FOYER_EVENT, (e) => this.onFoyer(e as FoyerEvent)));
    this.offs.push(ctx.events.onAny(MANIF_EVENT, (e) => this.onManif(e as ManifEvent)));
    this.offs.push(ctx.events.on('person:arrested', ({ byId }) => {
      if (this.vacation && this.isCrew(byId)) this.stats.arrests++;
    }));
    this.offs.push(ctx.events.on('person:down', ({ id }) => this.onDown(id)));
  }

  reset(): void {
    this.vacation = null;
    this.freeCrew = false;
    this.homeSet = false;
    this.crew = null;
    this.pending = false;
    this.startedAt = 0;
    this.endAt = Infinity;
    this.ending_ = false;
    this.endingAt = 0;
    this.ended = false;
    this.nextAt = Infinity;
    this.firstCall = true;
    this.thinkAt = 0;
    this.rts.length = 0;
    this.calls.length = 0;
    this.nextId = 1;
    Object.assign(this.stats, EMPTY_SUMMARY);
    this.injuredIds.clear();
    this.callRng = null;
    this.driveRng = null;
    this.backupRng = null;
    this.companyCall = 0;
    this.apMode = 'aucune';
    this.apAt = -1e9;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(_dt: number): void {
    const ctx = this.ctx;
    const v = this.vacation;
    if (ctx && !v && this.freeCrew && ctx.session.config && ctx.session.phase === 'playing') {
      // Mode libre : seulement la conduite du collègue (chef de bord), une fois par seconde
      const t = ctx.clock.now;
      if (t < this.thinkAt) return;
      this.thinkAt = t + THINK;
      try {
        if (!this.crew) this.crew = ctx.service<EquipageApi>(EQUIPAGE_SERVICE)?.current ?? null;
        this.drive(t);
      } catch (err) {
        console.error('[patrouille] conduite', err);
      }
      return;
    }
    if (!ctx || !v || this.ended || !ctx.session.config) return;
    const now = ctx.clock.now;
    if (this.pending) {
      this.pending = false;
      this.begin(now);
    }
    // fin de vacation sans retour au service : clôture d'office, à la seconde près
    if (this.ending_ && now - this.endingAt >= HOME_TIMEOUT) {
      this.finish();
      return;
    }
    if (now < this.thinkAt) return;
    this.thinkAt = now + THINK;
    try {
      this.think(now);
    } catch (err) {
      console.error('[patrouille] répartiteur', err);
    }
  }

  private begin(now: number): void {
    const ctx = this.ctx!;
    const v = this.vacation!;
    const cfg = ctx.session.config!;
    this.startedAt = now;
    this.endAt = now + sessionDurationSeconds(cfg.duration);
    this.callRng = ctx.rng.fork('patrouille:appels');
    this.driveRng = ctx.rng.fork('patrouille:conduite');
    this.backupRng = ctx.rng.fork('patrouille:renforts');
    this.nextAt = nextCallAt(v.rythme, now, this.callRng, true, { premier: v.premier, ecart: v.ecart });
    this.firstCall = false;
  }

  private think(now: number): void {
    const ctx = this.ctx!;
    if (!this.crew) this.crew = ctx.service<EquipageApi>(EQUIPAGE_SERVICE)?.current ?? null;
    // fin de vacation
    if (!this.ending_ && now >= this.endAt) this.beginEnding(now);
    if (this.ending_) {
      const me = ctx.player.person();
      const d = me ? Math.hypot(me.x - this.vacation!.depart.x, me.z - this.vacation!.depart.z) : 0;
      if (d <= HOME_RADIUS) {
        this.finish();
        return;
      }
    }
    // appels en cours
    for (const rt of this.rts) this.follow(rt, now);
    // nouvel appel
    if (!this.ending_ && now >= this.nextAt) {
      this.spawnCall(now);
      this.nextAt = nextCallAt(this.vacation!.rythme, now, this.callRng!, this.firstCall, { premier: this.vacation!.premier, ecart: this.vacation!.ecart });
    }
    this.drive(now);
  }

  // ───────────────────────────── équipage ─────────────────────────────

  private callsign(): string {
    if (this.crew) return this.crew.callsign;
    return this.vacation ? this.vacation.depart.callsign : '';
  }

  private isCrew(id: EntityId): boolean {
    const ctx = this.ctx!;
    if (id === 0) return false;
    const me = ctx.player.person();
    if (me && me.id === id) return true;
    const squad = this.crew ? ctx.squads.get(this.crew.squadId) : undefined;
    return !!squad && squad.members.indexOf(id) >= 0;
  }

  private car(): Vehicle | undefined {
    return this.crew ? this.ctx!.vehicles.get(this.crew.vehicleId) : undefined;
  }

  private onDown(id: EntityId): void {
    const ctx = this.ctx;
    if (!ctx || !this.vacation || this.injuredIds.has(id)) return;
    let count = this.isCrew(id);
    if (!count) {
      const p = ctx.people.get(id);
      if (p) {
        for (const rt of this.rts) {
          if (rt.mine && (rt.call.state === 'acceptee' || rt.call.state === 'sur_place') && Math.hypot(p.x - rt.x, p.z - rt.z) <= INJURY_RADIUS) count = true;
        }
      }
    }
    if (count) {
      this.injuredIds.add(id);
      this.stats.injured++;
    }
  }

  // ───────────────────────────── appels : création ─────────────────────────────

  /** Événements en cours (appels non terminés). */
  private running(): number {
    let n = 0;
    for (const rt of this.rts) if (rt.call.state !== 'terminee') n++;
    return n;
  }

  /** Points de rue de l'anneau autour du joueur, pour le planificateur. */
  private streetPoints(ox: number, oz: number, rng: Rng): SpotCandidate[] {
    const world = this.ctx!.world;
    const b = world.bounds;
    const out: SpotCandidate[] = [];
    if (world.edgeCount === 0) return out;
    for (let i = 0; i < STREET_POINTS; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = SPOT_MIN + 40 + rng.next() * (SPOT_MAX - SPOT_MIN - 80);
      const x = ox + Math.sin(a) * d;
      const z = oz + Math.cos(a) * d;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      if (!world.nearestRoad(x, z, this.road, 60)) continue;
      const e = world.edge(this.road.edgeId);
      if (e.pedestrianOnly || e.bridge || this.road.roadClass === 'motorway' || this.road.roadClass === 'footway' || this.road.roadClass === 'service' || this.road.width < 5) continue;
      out.push({ x: this.road.x, z: this.road.z, name: this.road.name || '', named: false });
    }
    return out;
  }

  /** Places réelles, à leur position sur la carte quand elle les connaît. */
  private places(): SpotCandidate[] {
    const world = this.ctx!.world;
    return CALL_PLACES.map((p) => {
      const info = world.placeByName(p.name);
      return info ? { x: info.x, z: info.z, name: p.name, named: true } : p;
    });
  }

  private spawnCall(now: number): void {
    const ctx = this.ctx!;
    const v = this.vacation!;
    const rng = this.callRng!;
    if (this.running() >= (RYTHMES[v.rythme] ?? RYTHMES.normal).max) return;
    const me = ctx.player.person();
    const car = this.car();
    const ox = me ? me.x : car ? car.x : v.depart.x;
    const oz = me ? me.z : car ? car.z : v.depart.z;
    const busy: { x: number; z: number }[] = [];
    let sauvage = false;
    for (const rt of this.rts) {
      if (rt.call.state === 'terminee') continue;
      busy.push({ x: rt.x, z: rt.z });
      if (rt.call.kind === 'manif_sauvage') sauvage = true;
    }
    const places = this.places();
    const failed: CallKind[] = [];
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const kind = pickKind(v.rythme, v.types, rng, { elapsed: now - this.startedAt, sauvageActive: sauvage, exclude: failed });
      if (!kind) return;
      const spot = pickSpot(kind, { x: ox, z: oz }, busy, places, this.streetPoints(ox, oz, rng), rng);
      const size = callSize(kind, rng);
      const rt = spot ? this.trigger(kind, spot, size, rng) : null;
      if (rt) {
        this.announce(rt, Math.hypot(rt.x - ox, rt.z - oz));
        return;
      }
      failed.push(kind);
    }
  }

  /** Déclare l'événement réel de l'appel ; null si la simulation le refuse. */
  private trigger(kind: CallKind, spot: Spot, size: number, rng: Rng): CallRt | null {
    const ctx = this.ctx!;
    const now = ctx.clock.now;
    const scale = ctx.settings.values.crowdScale > 0 ? ctx.settings.values.crowdScale : 1;
    if (kind === 'feu') return this.ignite(spot, rng);
    if (kind === 'manif_sauvage') {
      const manifs = ctx.service<ManifsApi>(CROWD_MANIFS);
      if (!manifs) return null;
      // (l'échelle de foule est appliquée par le module de foule lui-même)
      const view = manifs.declare({ sauvage: true, crowdSize: size, near: { x: spot.x, z: spot.z, min: 0, max: 160 } });
      if (!view) return null;
      const rt = this.make(kind, '', view.from || spot.name, view.x, view.z, view.declared, now);
      rt.call.manifId = view.id;
      return rt;
    }
    const foyers = ctx.service<FoyersApi>(CROWD_FOYERS);
    if (!foyers) return null;
    const people = Math.max(3, Math.min(300, Math.round(size * scale)));
    const spec: Parameters<FoyersApi['declare']>[0] = { kind: kind as FoyerKind, x: spot.x, z: spot.z, size: people };
    // (nom tel qu'on le dit dans une phrase : « place de l'Opéra », « rue de Rivoli »)
    if (spot.name !== '') spec.name = spot.name.charAt(0).toLowerCase() + spot.name.slice(1);
    const view = foyers.declare(spec);
    if (!view) return null;
    const rt = this.make(kind, '', view.name, view.x, view.z, people, now);
    rt.call.foyerId = view.id;
    return rt;
  }

  /** Feu : poubelles ou conteneur sur le trottoir, ou voiture garée le long de la chaussée. */
  private ignite(spot: Spot, rng: Rng): CallRt | null {
    const ctx = this.ctx!;
    const world = ctx.world;
    if (!world.nearestRoad(spot.x, spot.z, this.road, 40) || this.road.width < 5) return null;
    const r = rng.next();
    const fire: FireTarget = r < 0.35 ? 'poubelle' : r < 0.7 ? 'conteneur' : 'vehicule';
    const h = this.road.heading;
    const rx = Math.cos(h), rz = -Math.sin(h);
    const rdx = this.road.x, rdz = this.road.z, width = this.road.width;
    const street = this.road.name || world.sectorName(rdx, rdz) || 'en ville';
    for (let k = 0; k < 6; k++) {
      const along = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 7;
      const ax = rdx + Math.sin(h) * along, az = rdz + Math.cos(h) * along;
      if (fire === 'vehicule') {
        const curb = Math.max(1.2, width * 0.5 - 1.1);
        const vx = ax + rx * curb, vz = az + rz * curb;
        if (!world.isFree(vx, vz, 1.1) || ctx.vehicles.queryRadius(vx, vz, 4, this.nearV) > 0) continue;
        if (ctx.people.countIn(vx, vz, 2.5) > 0) continue;
        const kindV = rng.next() < 0.5 ? 'citadine' : 'voiture';
        if (!ctx.vehicles.def(kindV)) return null;
        const car = ctx.vehicles.spawn(kindV, vx, vz, h);
        car.y = world.heightAt(vx, vz);
        ctx.vehicles.damage(car, { amount: 30, kind: 'burn', sourceId: 0, x: vx, z: vz });
        const rt = this.make('feu', fire, street, vx, vz, 0, ctx.clock.now);
        rt.vehicleId = car.id;
        rt.call.fireId = car.id;
        this.firemen(rt);
        return rt;
      }
      const side = width * 0.5 + 1.2;
      const px = ax + rx * side, pz = az + rz * side;
      if (!world.isFree(px, pz, 0.8) || ctx.props.queryRadius(px, pz, 1.2, this.nearP) > 0) continue;
      if (ctx.people.countIn(px, pz, 1.5) > 0) continue;
      const prop = ctx.props.spawn(fire, px, pz, h);
      ctx.props.damage(prop, 1000, 'burn', 0);
      ctx.hazards.ignite(px, pz, fire === 'conteneur' ? 1.6 : 1.0, 0.85, 0);
      const rt = this.make('feu', fire, street, px, pz, 0, ctx.clock.now);
      rt.propId = prop.id;
      rt.call.fireId = prop.id;
      this.firemen(rt);
      return rt;
    }
    return null;
  }

  /** La salle engage les sapeurs-pompiers sur un feu (l'annonce le dit : « pompiers prévenus »). */
  private firemen(rt: CallRt): void {
    const rescue = this.ctx!.service<RescueApi>(EXT.rescue);
    if (!rescue) return;
    try {
      rescue.request('pompiers', rt.x, rt.z, 0);
    } catch (err) {
      console.error('[patrouille] pompiers non engagés', err);
    }
  }

  private make(kind: CallKind, fire: FireTarget | '', place: string, x: number, z: number, people: number, now: number): CallRt {
    const call: DispatchCall = {
      id: this.nextId++, kind, label: callLabel(kind, fire), place: placeWords(place), x, z, people,
      priority: callPriority(kind, fire), t: now, state: 'annonce', assignedTo: '', backup: [],
      foyerId: 0, manifId: 0, fireId: 0, incidentId: 0,
    };
    return {
      call, x, z, mine: false, patrolId: 0, fire, propId: 0, vehicleId: 0, fireSeen: false, companyAt: -1, companyId: 0, over: false, relay: false, retryAt: now,
    };
  }

  /** CENTRAL appelle l'équipage (ou, s'il est déjà pris, une patrouille de l'IA). */
  private announce(rt: CallRt, distance: number): void {
    const ctx = this.ctx!;
    this.rts.push(rt);
    this.calls.push(rt.call);
    this.stats.calls++;
    const busy = this.rts.some((o) => o !== rt && (o.call.state === 'annonce' || o.call.state === 'acceptee' || o.call.state === 'sur_place'));
    if (busy) {
      // l'équipage est déjà sur un appel (ou en a un en attente) : la salle le donne à une patrouille de l'IA
      this.delegate(rt, true);
      return;
    }
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: rt.call.priority >= 3 ? 2 : 1, text: callText.annonce(this.callsign(), rt.call, distance) });
    this.emit(rt);
  }

  private emit(rt: CallRt): void {
    const e: PatrolCallEvent = { call: rt.call, state: rt.call.state };
    this.ctx!.events.emitAny(PATROL_CALL_EVENT, e);
  }

  private setState(rt: CallRt, state: CallState): void {
    if (rt.call.state === state) return;
    rt.call.state = state;
    this.emit(rt);
  }

  // ───────────────────────────── appels : réponses ─────────────────────────────

  private find(id: number): CallRt | null {
    for (const rt of this.rts) if (rt.call.id === id) return rt;
    return null;
  }

  private current(): DispatchCall | null {
    let pendingCall: DispatchCall | null = null;
    for (const rt of this.rts) {
      const s = rt.call.state;
      if (s === 'acceptee' || s === 'sur_place') return rt.call;
      if (s === 'annonce' && !pendingCall) pendingCall = rt.call;
    }
    return pendingCall;
  }

  private accept(id: number): boolean {
    const ctx = this.ctx;
    const rt = this.find(id);
    if (!ctx || !this.vacation || !rt || rt.call.state !== 'annonce' || this.ending_) return false;
    // un seul appel à la fois pour l'équipage
    if (this.rts.some((o) => o.mine && (o.call.state === 'acceptee' || o.call.state === 'sur_place'))) return false;
    rt.mine = true;
    rt.call.assignedTo = this.callsign();
    this.stats.accepted++;
    this.setState(rt, 'acceptee');
    const me = ctx.player.person();
    ctx.radio.say({ channel: 'commandement', from: this.callsign(), priority: 1, text: callText.acceptee(this.callsign(), rt.call), personId: me ? me.id : undefined });
    this.objective(OBJECTIVE_CALL, `${rt.call.label} : ${rt.call.place}`, rt.x, rt.z);
    // en chef de bord, le collègue de l'IA part tout de suite en urgence
    this.apAt = -1e9;
    this.drive(ctx.clock.now);
    if (me && Math.hypot(me.x - rt.x, me.z - rt.z) < ON_SCENE) this.onScene(rt);
    return true;
  }

  private decline(id: number): boolean {
    const rt = this.find(id);
    if (!this.ctx || !this.vacation || !rt || rt.call.state !== 'annonce') return false;
    this.stats.declined++;
    this.delegate(rt, false);
    return true;
  }

  /**
   * Confie l'appel à la patrouille de l'IA libre la plus proche (« Reçu, TV 75-09 prend. »). Sans patrouille libre,
   * l'appel reste en attente ('declinee') : il est reproposé à l'IA toutes les RETRY s (follow), en silence.
   */
  private delegate(rt: CallRt, direct: boolean, quiet = false): void {
    const ctx = this.ctx!;
    const p = this.nearestPatrol(rt.x, rt.z);
    const patrols = ctx.service<PatrolsApi>(PATROLS_SERVICE);
    if (p && patrols && patrols.send(p.squadId, rt.x, rt.z)) {
      rt.patrolId = p.squadId;
      rt.call.assignedTo = p.name;
      this.stats.delegated++;
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: direct ? callText.direct(p.name, rt.call) : callText.confiee(p.name) });
      // (un appel donné directement à l'IA n'a jamais été proposé au joueur : son premier état est 'confiee')
      this.setState(rt, 'confiee');
      return;
    }
    rt.retryAt = ctx.clock.now;
    if (quiet) return;
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: callText.declinee(rt.call) });
    this.setState(rt, 'declinee');
  }

  private nearestPatrol(x: number, z: number): PatrolView | null {
    const ctx = this.ctx!;
    const patrols = ctx.service<PatrolsApi>(PATROLS_SERVICE);
    if (!patrols) return null;
    let best: PatrolView | null = null;
    let bestD = Infinity;
    for (const p of patrols.list) {
      if (p.state !== 'patrouille') continue;
      const v = ctx.vehicles.get(p.vehicleId);
      if (!v) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private close(id: number): boolean {
    const ctx = this.ctx;
    const rt = this.find(id);
    if (!ctx || !rt || !rt.mine || (rt.call.state !== 'acceptee' && rt.call.state !== 'sur_place')) return false;
    const me = ctx.player.person();
    if (rt.call.state === 'sur_place') {
      // fin d'intervention prononcée sur place : appel réglé
      this.stats.resolved++;
      ctx.radio.say({ channel: 'commandement', from: this.callsign(), priority: 1, text: callText.finIntervention(this.callsign(), rt.call), personId: me ? me.id : undefined });
      this.terminate(rt);
      return true;
    }
    // abandonné en route : la salle le confie à une patrouille de l'IA
    rt.mine = false;
    this.clearObjective(OBJECTIVE_CALL);
    this.delegate(rt, false);
    this.lightsOff();
    return true;
  }

  private requestBackup(id: number, kind: BackupKind): boolean {
    const ctx = this.ctx;
    const rt = this.find(id);
    if (!ctx || !rt || !rt.mine || (rt.call.state !== 'acceptee' && rt.call.state !== 'sur_place')) return false;
    if (rt.call.backup.indexOf(kind) >= 0) return false;
    const cs = this.callsign();
    const me = ctx.player.person();
    let reply = '';
    if (kind === 'patrouille') {
      const p = this.nearestPatrol(rt.x, rt.z);
      const patrols = ctx.service<PatrolsApi>(PATROLS_SERVICE);
      if (!p || !patrols || !patrols.send(p.squadId, rt.x, rt.z)) return false;
      rt.patrolId = p.squadId;
      reply = callText.renfortReponse('patrouille', p.name);
    } else if (kind === 'compagnie') {
      if (rt.call.kind !== 'rassemblement' && rt.call.kind !== 'manif_sauvage') return false;
      if (this.companyCall !== 0 || !ctx.service('police.units')) return false;
      this.companyCall = rt.call.id;
      rt.companyAt = ctx.clock.now + COMPANY_MIN + (COMPANY_MAX - COMPANY_MIN) * this.backupRng!.next();
      reply = callText.renfortReponse('compagnie');
    } else {
      const rescue = ctx.service<RescueApi>(EXT.rescue);
      if (!rescue) return false;
      rescue.request(kind, rt.x, rt.z, me ? me.id : 0, rt.call.incidentId !== 0 ? rt.call.incidentId : undefined);
      reply = callText.renfortReponse(kind);
    }
    rt.call.backup.push(kind);
    this.stats.backups++;
    ctx.radio.say({ channel: 'commandement', from: cs, priority: 1, text: callText.renfort(cs, rt.call, kind), personId: me ? me.id : undefined });
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: reply });
    this.emit(rt);
    return true;
  }

  // ───────────────────────────── appels : suivi ─────────────────────────────

  private onFoyer(e: FoyerEvent): void {
    if (!this.vacation || !e || e.state !== 'fin') return;
    for (const rt of this.rts) if (rt.call.foyerId === e.id && rt.call.foyerId !== 0) rt.over = true;
  }

  private onManif(e: ManifEvent): void {
    if (!this.vacation || !e || e.state !== 'fin') return;
    for (const rt of this.rts) if (rt.call.manifId === e.id && rt.call.manifId !== 0) rt.over = true;
  }

  private follow(rt: CallRt, now: number): void {
    const ctx = this.ctx!;
    const s = rt.call.state;
    if (s === 'terminee') return;
    this.track(rt, now);
    if (rt.over) {
      this.endOfEvent(rt);
      return;
    }
    if (s === 'annonce' && now - rt.call.t >= ANSWER_TIMEOUT) {
      this.delegate(rt, false);
      return;
    }
    // appel en attente faute d'équipage libre : CENTRAL le confie dès qu'une patrouille de l'IA se libère
    if (s === 'declinee') {
      if (now - rt.retryAt >= RETRY) this.delegate(rt, false, true);
      return;
    }
    if (rt.mine && s === 'acceptee') {
      const me = ctx.player.person();
      if (me && Math.hypot(me.x - rt.x, me.z - rt.z) < ON_SCENE) this.onScene(rt);
      else this.objective(OBJECTIVE_CALL, `${rt.call.label} : ${rt.call.place}`, rt.x, rt.z);
    }
    if (rt.companyAt >= 0 && now >= rt.companyAt) {
      rt.companyAt = -1;
      this.engageCompany(rt);
    }
  }

  /** Position et fin de l'événement réel. */
  private track(rt: CallRt, now: number): void {
    const ctx = this.ctx!;
    const c = rt.call;
    if (c.foyerId !== 0) {
      const f = ctx.service<FoyersApi>(CROWD_FOYERS)?.list.find((q) => q.id === c.foyerId);
      if (f) {
        rt.x = f.x;
        rt.z = f.z;
      } else rt.over = true;
    } else if (c.manifId !== 0) {
      const m = ctx.service<ManifsApi>(CROWD_MANIFS)?.list.find((q) => q.id === c.manifId);
      if (!m || m.phase === 'terminee') rt.over = true;
      else if (m.people > 0) {
        rt.x = m.x;
        rt.z = m.z;
      }
    } else if (c.kind === 'feu') {
      const v = rt.vehicleId !== 0 ? ctx.vehicles.get(rt.vehicleId) : undefined;
      const burning = (v !== undefined && (v.state === 'burning' || v.burning > 0.2)) || ctx.hazards.fireAt(rt.x, rt.z) > 0.05;
      if (burning) rt.fireSeen = true;
      else if (rt.fireSeen || now - c.t > 60) rt.over = true;
      if (!rt.over && now - c.t > FIRE_MAX) {
        rt.over = true;
        rt.relay = true;
      }
      if (c.incidentId === 0) {
        const inc = ctx.service<IncidentsApi>(EXT.incidents);
        if (inc) {
          for (const i of inc.list) {
            if (!i.kind.startsWith('feu') || i.state === 'resolu' || i.state === 'echoue') continue;
            if (Math.hypot(i.x - rt.x, i.z - rt.z) <= FIRE_LINK) {
              c.incidentId = i.id;
              break;
            }
          }
        }
      }
    }
  }

  private onScene(rt: CallRt): void {
    const ctx = this.ctx!;
    this.setState(rt, 'sur_place');
    const me = ctx.player.person();
    ctx.radio.say({ channel: 'commandement', from: this.callsign(), priority: 1, text: callText.surPlace(this.callsign(), rt.call), personId: me ? me.id : undefined });
    ctx.ui.notify('Sur place. Évaluez et rendez compte.', 'info', 6);
    this.objective(OBJECTIVE_CALL, `Sur place : ${rt.call.label.toLowerCase()}, ${rt.call.place}`, rt.x, rt.z);
    // deux-tons coupés à l'arrivée, gyrophares laissés allumés (quand l'IA conduit : au volant, le joueur les gère)
    const car = this.car();
    if (car && car.siren !== 0 && me && car.seats[0] !== me.id) {
      const ext = ctx.service<VehiclesExtLike>('vehicles.ext');
      if (ext && ext.setSiren) ext.setSiren(car, 0);
      else car.siren = 0;
    }
  }

  /** L'événement a pris fin de lui-même : l'appel se clôt (réglé s'il était tenu par l'équipage). */
  private endOfEvent(rt: CallRt): void {
    const ctx = this.ctx!;
    if (rt.mine && (rt.call.state === 'acceptee' || rt.call.state === 'sur_place')) {
      this.stats.resolved++;
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: rt.relay ? callText.relais(this.callsign(), rt.call) : callText.terminee(this.callsign(), rt.call) });
    }
    this.terminate(rt);
  }

  private terminate(rt: CallRt): void {
    const ctx = this.ctx!;
    const wasMine = rt.mine && (rt.call.state === 'acceptee' || rt.call.state === 'sur_place');
    this.setState(rt, 'terminee');
    rt.companyAt = -1;
    // la patrouille de l'IA envoyée reprend son secteur ; la compagnie rentre
    if (rt.patrolId !== 0) {
      const patrols = ctx.service<PatrolsApi>(PATROLS_SERVICE);
      const p = patrols?.statusOf(rt.patrolId);
      if (patrols && p && (p.state === 'en_route' || p.state === 'sur_place') && Math.hypot(p.tx - rt.x, p.tz - rt.z) < 400) patrols.resume(rt.patrolId);
    }
    if (rt.companyId !== 0) {
      const command = ctx.service<CommandLike>('police.command');
      if (command && typeof command.endMission === 'function') command.endMission(rt.companyId);
    }
    if (this.companyCall === rt.call.id) this.companyCall = 0;
    if (wasMine) {
      this.clearObjective(OBJECTIVE_CALL);
      this.lightsOff();
      this.apAt = -1e9;
    }
  }

  private engageCompany(rt: CallRt): void {
    const ctx = this.ctx!;
    if (rt.call.state === 'terminee') return;
    const rand = (): number => this.backupRng!.next();
    let route: ArrayLike<number> = [];
    let view: ManifView | undefined;
    if (rt.call.manifId !== 0) {
      view = ctx.service<ManifsApi>(CROWD_MANIFS)?.list.find((q) => q.id === rt.call.manifId);
      if (view) route = view.route;
    }
    const sections = rt.call.people > 300 ? 2 : 1;
    let sent: ReturnType<typeof dispatchCompany> = null;
    try {
      sent = dispatchCompany(ctx, rt.x, rt.z, route, sections, rand);
    } catch (err) {
      console.error('[patrouille] compagnie de renfort impossible', err);
    }
    if (!sent) {
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `${this.callsign()} de CENTRAL : pas de compagnie disponible, faites au mieux.` });
      if (this.companyCall === rt.call.id) this.companyCall = 0;
      return;
    }
    rt.companyId = sent.companyId;
    if (view) {
      ctx.service<ManifsApi>(CROWD_MANIFS)?.assign(view.id, sent.companyId);
      const command = ctx.service<CommandLike>('police.command');
      if (command && typeof command.assignCortege === 'function') command.assignCortege(sent.companyId, view);
    }
    const base = /^commissariat/.test(sent.base) ? 'du ' + sent.base : 'de la ' + sent.base;
    ctx.radio.say({
      channel: 'commandement', from: 'CENTRAL', priority: 1,
      text: `${this.callsign()} de CENTRAL : ${sent.name} fait mouvement ${sent.convoy ? base : 'sur place'} vers ${rt.call.place}, en renfort.`,
    });
    this.emit(rt);
  }

  // ───────────────────────────── conduite par l'IA (chef de bord) ─────────────────────────────

  private drive(now: number): void {
    const ctx = this.ctx!;
    const ap = ctx.service<AutopilotApi>('vehicles.autopilot');
    const car = this.car();
    const me = ctx.player.person();
    if (!ap || !car) return;
    if (!this.homeSet) {
      // vacation : le départ choisi ; Mode libre : là où la voiture était garée au début de la partie
      this.homeX = this.vacation ? this.vacation.depart.x : car.x;
      this.homeZ = this.vacation ? this.vacation.depart.z : car.z;
      this.homeSet = true;
    }
    const aiAtWheel = !!me && me.vehicleId === car.id && car.seats[0] !== 0 && car.seats[0] !== me.id
      && (car.state === 'ok' || car.state === 'damaged');
    if (!aiAtWheel) {
      // le joueur a pris le volant, ou est descendu : l'IA lâche la conduite
      if (this.apMode !== 'aucune') {
        if (ap.isActive(car)) ap.stop(car);
        this.apMode = 'aucune';
      }
      return;
    }
    const st = ap.status(car);
    const done = st.mode === 'idle' || st.mode === 'stop' || st.state === 'arrive' || st.state === 'echec';
    const stuck = st.state === 'bloque' && st.blockedFor > 20;
    // fin de vacation : retour au point de départ
    if (this.ending_) {
      const d = this.vacation!.depart;
      if (this.apMode !== 'retour' || (done && Math.hypot(car.x - d.x, car.z - d.z) > HOME_RADIUS) || stuck) {
        this.lightsOff();
        this.goTo(ap, car, d.x, d.z, false, 'retour', now);
      }
      return;
    }
    const mine = this.rts.find((rt) => rt.mine && (rt.call.state === 'acceptee' || rt.call.state === 'sur_place'));
    if (mine && mine.call.state === 'acceptee') {
      const moved = Math.hypot(mine.x - this.apX, mine.z - this.apZ) > 40;
      if (this.apMode !== 'urgence' || moved || (done && now - this.apAt > 3) || stuck) {
        this.lightsOn(car);
        this.goTo(ap, car, mine.x, mine.z, true, 'urgence', now);
      }
      return;
    }
    if (mine && mine.call.state === 'sur_place') {
      if (this.apMode !== 'arret') {
        if (ap.isActive(car)) ap.stop(car);
        this.apMode = 'arret';
      }
      return;
    }
    // entre deux appels : au pas dans le secteur
    if (this.apMode !== 'patrouille' || done || stuck || now - this.apAt > 300) {
      if (this.apMode === 'urgence' || this.apMode === 'arret') this.lightsOff();
      this.wander(ap, car, now);
    }
  }

  private goTo(ap: AutopilotApi, car: Vehicle, x: number, z: number, urgent: boolean, mode: 'urgence' | 'retour', now: number): void {
    const world = this.ctx!.world;
    let tx = x, tz = z;
    // au point de la chaussée le plus proche (une place, un square ne se traversent pas)
    if (world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 80) && !world.edge(this.road.edgeId).pedestrianOnly) {
      tx = this.road.x;
      tz = this.road.z;
    }
    const opts = urgent ? { urgence: true, stopBefore: 10 } : { speed: WANDER_SPEED + 3, stopBefore: 6 };
    if (!ap.driveTo(car, tx, tz, opts) && world.nearestRoad(x, z, this.road, 200)) ap.driveTo(car, this.road.x, this.road.z, opts);
    this.apMode = mode;
    this.apX = x;
    this.apZ = z;
    this.apAt = now;
  }

  private wander(ap: AutopilotApi, car: Vehicle, now: number): void {
    const ctx = this.ctx!;
    const world = ctx.world;
    const d0 = { x: this.homeX, z: this.homeZ };
    const rng = this.driveRng!;
    // Mode libre : jamais vers le parcours du cortège principal (ni à moins de 150 m)
    const route = this.vacation ? [] : ctx.director.route;
    const nearRoute = (x: number, z: number): boolean => {
      for (let i = 0; i + 3 < route.length; i += 2) {
        const ax = route[i]!, az = route[i + 1]!, dx = route[i + 2]! - ax, dz = route[i + 3]! - az;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 150) return true;
      }
      return route.length === 2 && Math.hypot(route[0]! - x, route[1]! - z) < 150;
    };
    const b = world.bounds;
    this.apMode = 'patrouille';
    this.apAt = now;
    if (world.edgeCount === 0) return;
    for (let tries = 0; tries < 10; tries++) {
      const a = rng.next() * Math.PI * 2;
      const d = WANDER_MIN + rng.next() * (WANDER_MAX - WANDER_MIN);
      const x = d0.x + Math.sin(a) * d;
      const z = d0.z + Math.cos(a) * d;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      if (!world.nearestRoad(x, z, this.road, 60) || this.road.width < 5) continue;
      const e = world.edge(this.road.edgeId);
      if (e.pedestrianOnly || this.road.roadClass === 'footway' || this.road.roadClass === 'motorway') continue;
      if (Math.hypot(this.road.x - car.x, this.road.z - car.z) < 150) continue;
      if (nearRoute(this.road.x, this.road.z)) continue;
      if (ap.driveTo(car, this.road.x, this.road.z, { speed: WANDER_SPEED, stopBefore: 2 })) {
        this.apX = this.road.x;
        this.apZ = this.road.z;
        return;
      }
    }
  }

  private lightsOn(car: Vehicle): void {
    const ext = this.ctx!.service<VehiclesExtLike>('vehicles.ext');
    if (car.def.hasSiren && car.siren === 0) {
      if (ext && ext.setSiren) ext.setSiren(car, 1);
      else car.siren = 1;
    }
    if (car.def.hasBeacons && !car.beacons) {
      if (ext && ext.setBeacons) ext.setBeacons(car, true);
      else car.beacons = true;
    }
  }

  /** Deux-tons et gyrophares coupés — seulement quand l'IA conduit (au volant, le joueur les gère lui-même). */
  private lightsOff(): void {
    const ctx = this.ctx!;
    const car = this.car();
    const me = ctx.player.person();
    if (!car || (me && car.seats[0] === me.id)) return;
    const ext = ctx.service<VehiclesExtLike>('vehicles.ext');
    if (car.siren !== 0) {
      if (ext && ext.setSiren) ext.setSiren(car, 0);
      else car.siren = 0;
    }
    if (car.beacons) {
      if (ext && ext.setBeacons) ext.setBeacons(car, false);
      else car.beacons = false;
    }
  }

  // ───────────────────────────── objectifs ─────────────────────────────

  private objective(id: string, text: string, x: number, z: number): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const cur = api.list.find((q) => q.id === id);
    if (!cur || cur.text !== text || Math.abs((cur.x ?? 0) - x) > 5 || Math.abs((cur.z ?? 0) - z) > 5) {
      api.upsert({ id, text, state: 'actif', secondary: false, x, z });
    }
    if (api.tracked !== id) api.tracked = id;
  }

  private clearObjective(id: string): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    if (api.list.some((q) => q.id === id)) api.remove(id);
    if (api.tracked === id) api.tracked = '';
  }

  // ───────────────────────────── fin de vacation ─────────────────────────────

  private beginEnding(now: number): void {
    const ctx = this.ctx!;
    const v = this.vacation!;
    this.ending_ = true;
    // (le délai de retour court depuis l'heure prévue de la fin, pas depuis la réflexion qui l'a relevée)
    this.endingAt = Math.min(now, this.endAt);
    // appels encore en attente de réponse : confiés à l'IA ; l'appel tenu par l'équipage est relevé par une patrouille
    // de l'IA (le GPS mène désormais au service, plus à l'appel)
    for (const rt of this.rts) {
      if (rt.call.state === 'annonce') this.delegate(rt, false);
      else if (rt.mine && (rt.call.state === 'acceptee' || rt.call.state === 'sur_place')) {
        rt.mine = false;
        this.clearObjective(OBJECTIVE_CALL);
        this.delegate(rt, false);
      }
    }
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2, text: callText.finVacation(this.callsign()) });
    // (« secteur gare Saint-Lazare », « commissariat du 9e arrondissement » : sans article, d'où « le service : … »)
    ctx.ui.notify(`Fin de vacation : regagnez le service, ${v.depart.name}.`, 'info', 8);
    this.objective(OBJECTIVE_HOME, `Fin de vacation : regagnez le service, ${v.depart.name}`, v.depart.x, v.depart.z);
    this.apAt = -1e9;
  }

  private finish(): void {
    const ctx = this.ctx!;
    this.ended = true;
    this.clearObjective(OBJECTIVE_CALL);
    this.clearObjective(OBJECTIVE_HOME);
    // le compte rendu lit summary() : la durée est figée ici
    this.stats.duration = ctx.clock.now - this.startedAt;
    ctx.session.end(true);
  }

  private summary(): VacationSummary {
    const out = { ...this.stats };
    if (this.vacation && !this.ended && this.ctx) out.duration = Math.max(0, this.ctx.clock.now - this.startedAt);
    return out;
  }
}
