/* =====================================================================================
 * FOULE — cœur partagé : état de la manifestation, personnes pilotées, groupes d'affinité, registre des
 * contrôleurs de comportement, service 'crowd.core'.
 * ===================================================================================== */

import type {
  CrowdPhase, EntityId, GameContext, Person, ProtestProfile, Rng, SessionConfig, Vec2,
} from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { CROWD_CORE, FAMILIES } from './api';
import type {
  AleaInfo, BehaviorController, CrowdCause, CrowdCoreApi, CrowdExit, CrowdFamily, CrowdGroup, GroupKind,
  PoliceSight, RoutePoint, SpawnOptions,
} from './api';
import { Voices } from './acts';
import { Aleas } from './aleas';
import { Behavior } from './behavior';
import { F, S, brainOf, createBrain } from './brain';
import type { CrowdBrain } from './brain';
import { DensityWatch } from './density';
import { Director } from './director';
import { Emotions } from './emotions';
import { Formation } from './formation';
import type { SlotSample } from './formation';
import { Metro } from './metro';
import { Nav } from './nav';
import { buildPlan, resolveCause, spawnEntry } from './population';
import type { Plan, PlanEntry } from './population';
import { Corridor, chooseRoute } from './route';
import type { ChosenRoute } from './route';
import { Sense } from './sense';
import { Sono } from './sono';
import { Steering } from './steer';
import * as T from './tuning';

export interface Schedule { gather: number; depart: number; march: number; disperse: number; after: number; total: number }

const NO_CAUSE: CrowdCause = { id: '', label: '', summary: '', index: -1, chants: [], orgs: [], color: 0 };
const NO_ROUTE: ChosenRoute = { points: [], id: '', label: '', length: 0 };

export class CrowdCore {
  ctx!: GameContext;
  active = false;
  now = 0;

  // ── configuration de la session ──
  size = 0;
  tension0 = 0;
  volatility = 0;
  timeScale = 1;
  rallyX = 0;
  rallyZ = 0;
  extra: Record<string, unknown> = {};
  schedule: Schedule = { gather: 0, depart: 0, march: 0, disperse: 0, after: 0, total: 0 };
  isStatic = false;

  // ── générateurs dérivés (créés au début de chaque session) ──
  rngSetup!: Rng;
  rngArrive!: Rng;
  rngThink!: Rng;
  rngEmo!: Rng;
  rngAlea!: Rng;

  cause: CrowdCause = NO_CAUSE;
  plan: Plan | null = null;
  route: ChosenRoute = NO_ROUTE;
  readonly corridor = new Corridor();
  readonly formation = new Formation();
  readonly metro = new Metro(this);
  readonly nav = new Nav(this);
  readonly sense = new Sense(this);
  readonly emotions = new Emotions(this);
  readonly behavior = new Behavior(this);
  readonly steering = new Steering(this);
  readonly density = new DensityWatch(this);
  readonly director = new Director(this);
  readonly aleas = new Aleas(this);
  readonly sono = new Sono(this);
  readonly voices = new Voices(this);

  // ── personnes pilotées ──
  readonly members: Person[] = [];
  readonly brains: CrowdBrain[] = [];
  readonly groups: CrowdGroup[] = [];
  /** Par entrée du plan : emplacement dans la formation, identifiant de la personne créée (0 sinon). */
  entrySlot: Int32Array = new Int32Array(0);
  entryPerson: Int32Array = new Int32Array(0);
  private spawning = false;
  private readonly adoptQueue: EntityId[] = [];
  private seedCursor = 1;

  // ── registre de contrôleurs ──
  private readonly registry = new Map<string, BehaviorController[]>();
  private readonly merged = new Map<string, BehaviorController[]>();

  /** Mesure par sous-système (ms cumulées) : perception, cortège, itinéraires, comportement, voix, émotions, densité, directeur. */
  profiling = false;
  readonly prof = new Float64Array(8);

  // ── objets de travail ──
  readonly rp: RoutePoint = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };
  readonly slot: SlotSample = { x: 0, z: 0, tx: 0, tz: 1, v: 0 };
  readonly v2: Vec2 = { x: 0, z: 0 };
  readonly buf: Person[] = [];
  readonly rand = (): number => this.rngArrive.next();
  readonly api: CrowdCoreApi = this.makeApi();

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.rngSetup = this.rngArrive = this.rngThink = this.rngEmo = this.rngAlea = ctx.rng;
    ctx.director = this.director;
    ctx.provide(EXT.metro, this.metro);
    ctx.provide(CROWD_CORE, this.api);
  }

  reset(): void {
    this.active = false;
    this.now = 0;
    this.size = 0;
    this.plan = null;
    this.cause = NO_CAUSE;
    this.route = NO_ROUTE;
    this.isStatic = false;
    for (let i = 0; i < this.brains.length; i++) this.brains[i]!.index = -1;
    this.members.length = 0;
    this.brains.length = 0;
    this.groups.length = 0;
    this.adoptQueue.length = 0;
    this.entrySlot = new Int32Array(0);
    this.entryPerson = new Int32Array(0);
    this.seedCursor = 1;
    this.formation.reset();
    this.metro.reset();
    this.nav.reset();
    this.sense.reset();
    this.emotions.reset();
    this.behavior.reset();
    this.density.reset();
    this.director.reset();
    this.aleas.reset();
    this.sono.reset();
    this.voices.reset();
  }

  // ───────────────────────────── mise en place ─────────────────────────────

  start(config: SessionConfig): void {
    const ctx = this.ctx;
    const rng = ctx.rng;
    this.rngSetup = rng.fork('foule:mise-en-place');
    this.rngArrive = rng.fork('foule:arrivees');
    this.rngThink = rng.fork('foule:reflexion');
    this.rngEmo = rng.fork('foule:emotions');
    this.rngAlea = rng.fork('foule:aleas');
    this.now = ctx.clock.now;
    const extra = (config.extra ?? {}) as Record<string, unknown>;
    this.extra = extra;
    this.rallyX = config.x ?? 0;
    this.rallyZ = config.z ?? 0;
    this.metro.discover();
    this.closeStationsAtStart(extra);
    const scale = ctx.settings.values.crowdScale;
    const size = Math.max(0, Math.min(4000, Math.round(config.crowdSize * (scale > 0 ? scale : 1))));
    if (size <= 0 || extra['crowd.none'] === true) return;
    this.size = size;
    this.tension0 = Math.min(1, Math.max(0, config.tension));
    this.volatility = Math.min(1, Math.max(0, config.volatility));
    const total = T.totalDuration(config.duration);
    this.timeScale = Math.min(2.5, Math.max(0.4, total / T.STANDARD_DURATION));
    const sh = config.duration === 'temps_reel' ? T.REAL_PHASES : T.PHASE_SHARE.map((s) => s * total);
    this.schedule = { gather: sh[0]!, depart: sh[1]!, march: sh[2]!, disperse: sh[3]!, after: sh[4]!, total };
    this.isStatic = extra['crowd.static'] === true;

    this.cause = resolveCause(ctx, extra, this.rngSetup);
    this.route = chooseRoute(ctx, config, this.rngSetup.fork('parcours'));
    this.corridor.build(ctx, this.route.points);
    const plan = buildPlan(ctx, this.cause, size, extra, this.tension0, this.volatility, this.rngSetup);
    this.plan = plan;
    this.size = plan.entries.length;
    const organised = plan.entries.some((e) => e.profile === 'service_ordre') || plan.entries.some((e) => e.family === 'syndical');
    const sonoWish = extra['crowd.sono'];
    const wantSono = sonoWish === true || (sonoWish !== false && organised && this.size >= T.SONO_MIN_CROWD && !this.isStatic);
    this.entrySlot = this.formation.build(plan, this.corridor, this.cause, wantSono, this.rngSetup.fork('formation'));
    this.entryPerson = new Int32Array(plan.entries.length);
    this.active = true;
    this.makeGroups(plan);
    this.director.begin();
    this.planArrivals(plan);
    this.sono.setup();
    this.spawnBystanders();
    this.aleas.draw();
    this.nav.exitsDirty = true;
  }

  private closeStationsAtStart(extra: Record<string, unknown>): void {
    const list = extra['crowd.closedStations'];
    if (Array.isArray(list)) {
      for (const item of list) {
        for (const s of this.metro.stations) {
          if ((typeof item === 'number' && s.id === item) || (typeof item === 'string' && s.name.toLowerCase() === item.toLowerCase())) s.open = false;
        }
      }
    }
    const options = extra['options'];
    if (typeof options === 'object' && options !== null && (options as { metro?: unknown }).metro === 'ferme') {
      for (const s of this.metro.stations) if (Math.hypot(s.x - this.rallyX, s.z - this.rallyZ) <= 350) s.open = false;
    }
  }

  private makeGroups(plan: Plan): void {
    const ctx = this.ctx;
    const f = this.formation;
    for (const s of f.sections) s.squadId = ctx.squads.create('cortege', 'protest', s.label).id;
    for (let g = 0; g < plan.groups.length; g++) {
      const pg = plan.groups[g]!;
      const section = f.entrySection[pg.members[0]!] ?? -1;
      this.groups.push({
        id: g, kind: pg.kind, squadId: 0, members: [], profile: pg.profile, family: pg.family, section,
        docility: this.rngSetup.next(), leaveAt: Infinity, exit: -1, path: null,
      });
    }
  }

  /** Qui est déjà là, qui sort du métro ou vient à pied pendant le rassemblement, qui arrive en renfort. */
  private planArrivals(plan: Plan): void {
    const rng = this.rngSetup.fork('arrivees');
    const entries = plan.entries;
    const n = entries.length;
    const f = this.formation;
    // groupes de voyage : un groupe d'affinité, ou une personne seule
    const parties: number[][] = [];
    const special: number[] = [];
    const last: number[][] = [];
    for (const g of plan.groups) {
      if (g.profile === 'pilleur') last.push(g.members.slice());
      else parties.push(g.members.slice());
    }
    for (let i = 0; i < n; i++) {
      const e = entries[i]!;
      if (e.group >= 0) continue;
      if (e.profile === 'pilleur') last.push([i]);
      else if (e.banner || e.profile === 'service_ordre' || e.profile === 'meneur' || i === f.guideEntry || i === f.driverEntry) special.push(i);
      else parties.push([i]);
    }
    // mélange déterministe
    for (let i = parties.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = parties[i]!;
      parties[i] = parties[j]!;
      parties[j] = tmp;
    }
    const wish = Number(this.extra['crowd.present']);
    // mission courte : le rassemblement dure peu, davantage de monde est déjà là
    const share = Number.isFinite(wish) && this.extra['crowd.present'] !== undefined ? Math.min(1, Math.max(0, wish))
      : T.PRESENT_AT_START + 0.3 * Math.max(0, 1 - this.timeScale);
    let presentLeft = Math.round(n * share) - special.length;
    let lateLeft = this.isStatic ? 0 : Math.round(n * T.REINFORCE_SHARE * (share >= 1 ? 0 : 1));
    const present: number[] = special.slice();
    const gather: number[][] = [];
    const late: number[][] = [];
    for (const party of parties) {
      if (presentLeft > 0) {
        presentLeft -= party.length;
        for (const m of party) present.push(m);
        continue;
      }
      // renforts : de préférence le cortège de tête et la queue, qui grossissent en route
      const sec = f.sections[f.entrySection[party[0]!] ?? -1];
      const loose = sec !== undefined && sec.kind !== 'carre' && sec.kind !== 'bloc';
      if (lateLeft > 0 && (loose || rng.chance(0.25))) {
        lateLeft -= party.length;
        late.push(party);
      } else gather.push(party);
    }
    if (share >= 1) {
      for (const party of gather) for (const m of party) present.push(m);
      gather.length = 0;
    }
    this.metro.schedule(gather, late, last);
    // ceux qui sont déjà là : à leur place dans le cortège en formation
    for (const i of present) this.spawnAtSlot(i);
  }

  private spawnBystanders(): void {
    const wish = Number(this.extra['crowd.bystanders']);
    const count = Number.isFinite(wish) ? Math.max(0, Math.round(wish)) : Math.min(T.BYSTANDER_MAX, Math.max(T.BYSTANDER_MIN, Math.round(this.size * T.BYSTANDER_SHARE)));
    const rng = this.rngSetup.fork('badauds');
    const f = this.formation;
    for (let i = 0; i < count; i++) {
      // en lisière : contre les façades, le long du tronçon où le cortège se forme et s'engage
      const s = f.tailS + rng.next() * (f.headS - f.tailS + 120);
      this.corridor.at(s, this.rp);
      const side = rng.chance(0.5) ? -1 : 1;
      const lateral = this.rp.center + side * (this.rp.half + 0.5);
      let x = this.rp.x - this.rp.tz * lateral;
      let z = this.rp.z + this.rp.tx * lateral;
      if (!this.ctx.world.isFree(x, z, 0.35)) {
        if (!this.ctx.world.randomFreePoint(x, z, 6, 'sidewalk', this.rand, this.v2)) continue;
        x = this.v2.x;
        z = this.v2.z;
      }
      this.spawning = true;
      const p = this.ctx.archetypes.spawn(rng.chance(0.25) ? 'touriste' : 'passant', x, z, { heading: Math.atan2(this.rp.x - x, this.rp.z - z), seed: this.nextSeed() });
      this.spawning = false;
      if (p.inventory.length === 0 && this.ctx.actions.defs.length > 0) this.ctx.actions.give(p, 'telephone');
      const b = this.addMember(p, F.BYSTANDER | F.UNCOUNTED);
      b.state = S.BYSTAND;
      b.tx = x;
      b.tz = z;
    }
  }

  // ───────────────────────────── personnes ─────────────────────────────

  private nextSeed(): number {
    return (Math.imul(this.seedCursor++, 0x9e3779b1) ^ Math.floor(this.rngSetup.next() * 0x7fffffff)) >>> 0;
  }

  addMember(p: Person, flags: number): CrowdBrain {
    const r = this.rngThink;
    const b = createBrain(p, this.members.length, this.now, r.next(), r.next(), r.next(), r.next());
    b.flags = flags;
    p.brain = b;
    this.members.push(p);
    this.brains.push(b);
    return b;
  }

  /** Crée la personne d'une entrée du plan. */
  private spawnPlanned(entry: number, x: number, z: number, heading: number): { p: Person; b: CrowdBrain; e: PlanEntry } {
    const e = this.plan!.entries[entry]!;
    this.spawning = true;
    let p: Person;
    try {
      p = spawnEntry(this.ctx, this.cause, e, x, z, heading, this.nextSeed());
    } finally {
      this.spawning = false;
    }
    const b = this.addMember(p, (e.banner ? F.BANNER : 0) | (e.child ? F.CHILD : 0) | (entry === this.formation.guideEntry ? F.GUIDE : 0));
    const section = this.formation.entrySection[entry] ?? -1;
    // une fois le cortège parti, on ne remonte plus jusqu'à son bloc : on prend place en queue
    const late = this.director.base !== 'rassemblement' && this.director.base !== 'aucune';
    b.slot = this.entrySlot[entry]! >= 0 ? this.entrySlot[entry]!
      : section < 0 ? -1 : late ? this.formation.allocTail(this.rngArrive) : this.formation.takeSlot(section, this.rngArrive);
    if (late) b.flags |= F.LATE;
    this.entryPerson[entry] = p.id;
    p.fear = 0;
    p.anger = Math.min(0.6, this.tension0 * 0.35 * (0.6 + this.rngThink.next() * 0.8));
    const sec = this.formation.sections[section];
    if (e.group >= 0) {
      const g = this.groups[e.group]!;
      if (g.squadId === 0) g.squadId = this.ctx.squads.create('affinite', 'protest', this.groupName(g), sec ? sec.squadId : 0).id;
      g.members.push(p.id);
      b.group = e.group;
      b.docility = g.docility;
      this.ctx.squads.addMember(g.squadId, p.id);
    } else if (sec) {
      this.ctx.squads.addMember(sec.squadId, p.id);
      if (e.profile === 'meneur' || e.profile === 'service_ordre') {
        const sq = this.ctx.squads.get(sec.squadId);
        const leader = sq ? this.ctx.people.get(sq.leaderId) : undefined;
        if (sq && (!leader || (leader.profile !== 'meneur' && e.profile === 'meneur'))) this.ctx.squads.setLeader(sec.squadId, p.id);
      }
    }
    this.director.onArrived();
    return { p, b, e };
  }

  private groupName(g: CrowdGroup): string {
    switch (g.kind) {
      case 'famille': return 'Famille ' + (g.id + 1);
      case 'section': return 'Section ' + (g.id + 1);
      case 'noyau': return 'Groupe affinitaire ' + (g.id + 1);
      case 'delegation': return 'Délégation ' + (g.id + 1);
      default: return 'Groupe d’amis ' + (g.id + 1);
    }
  }

  /** Personne déjà sur place au début : à sa place dans le cortège en formation. */
  private spawnAtSlot(entry: number): void {
    // l'emplacement est réservé avant de créer la personne : elle apparaît à sa place
    const section = this.formation.entrySection[entry] ?? -1;
    if (this.entrySlot[entry]! < 0 && section >= 0) this.entrySlot[entry] = this.formation.takeSlot(section, this.rngArrive);
    const slot = this.entrySlot[entry]!;
    let x = this.rallyX;
    let z = this.rallyZ;
    let h = 0;
    if (entry === this.formation.driverEntry && this.formation.sonoPose(this.slot)) {
      // le conducteur attend à la portière de son camion
      x = this.slot.x - this.slot.tz * 1.9 + this.slot.tx * 2;
      z = this.slot.z + this.slot.tx * 1.9 + this.slot.tz * 2;
    } else if (slot >= 0) {
      this.formation.sample(slot, this.slot);
      x = this.slot.x;
      z = this.slot.z;
      h = Math.atan2(this.slot.tx, this.slot.tz);
    }
    const world = this.ctx.world;
    if (!world.isFree(x, z, 0.3) && world.randomFreePoint(x, z, 5, 'any', this.rand, this.v2)) {
      x = this.v2.x;
      z = this.v2.z;
    }
    const { p, b } = this.spawnPlanned(entry, x, z, h);
    b.state = S.GATHER;
    if (entry === this.formation.driverEntry) this.sono.driver = p.id;
  }

  /** Personne qui arrive (bouche de métro ou rue) : elle rejoint sa place. */
  spawnArrival(entry: number, x: number, z: number, heading: number, stationId: number): Person | null {
    if (!this.active || !this.plan || entry < 0 || entry >= this.entryPerson.length || this.entryPerson[entry] !== 0) return null;
    const world = this.ctx.world;
    if (!world.isFree(x, z, 0.3) && world.randomFreePoint(x, z, 4, 'any', this.rand, this.v2)) {
      x = this.v2.x;
      z = this.v2.z;
    }
    const { p, b, e } = this.spawnPlanned(entry, x, z, heading);
    const phase = this.director.base;
    if (b.slot < 0 && (phase === 'rassemblement' || phase === 'depart' || phase === 'cortege') && e.profile !== 'pilleur') {
      b.slot = this.formation.allocTail(this.rngArrive);
      b.flags |= F.LATE;
    }
    b.state = S.ARRIVE;
    b.speed = T.WALK_MAX * b.pace;
    if (b.slot >= 0) {
      // on vise l'arrière de son rang, par le passage du flanc (voir Behavior.approach)
      const f = this.formation;
      f.flankPoint(f.slotS(b.slot) - 1.25, b.sway >= 0 ? 1 : -1, this.v2);
      b.tx = this.v2.x;
      b.tz = this.v2.z;
      // itinéraire partagé par ceux qui sortent de la même bouche vers le même bloc
      const key = (stationId > 0 ? stationId * 4096 : 2048 + (Math.round(x / 8) & 255) * 4096) + this.formation.slotBlock[b.slot]!;
      b.path = this.nav.shared(key, x, z, b.tx, b.tz);
      b.pathI = 0;
    } else {
      // pas de place dans le cortège (arrivée tardive) : vers la tête, là où cela se passe
      this.corridor.at(this.formation.headS, this.rp);
      b.tx = this.rp.x;
      b.tz = this.rp.z;
      this.nav.request(b);
      b.state = S.ARRIVE;
      b.flags |= F.LATE;
    }
    return p;
  }

  /** Retire une personne de la liste des personnes pilotées (elle reste dans le jeu). */
  detach(p: Person): void {
    const b = brainOf(p);
    if (!b || b.index < 0 || this.brains[b.index] !== b) return;
    if (b.controller && b.controller.release) b.controller.release(p, b);
    const i = b.index;
    const lastIndex = this.members.length - 1;
    if (i !== lastIndex) {
      const moved = this.brains[lastIndex]!;
      this.members[i] = this.members[lastIndex]!;
      this.brains[i] = moved;
      moved.index = i;
    }
    this.members.pop();
    this.brains.pop();
    b.index = -1;
    if (b.group >= 0) {
      const g = this.groups[b.group];
      if (g) {
        const k = g.members.indexOf(p.id);
        if (k >= 0) g.members.splice(k, 1);
      }
    }
    this.director.onGone(p, b);
  }

  /** La personne a quitté la manifestation : événement person:fled puis retrait du jeu. */
  depart(p: Person): void {
    const b = brainOf(p);
    const counted = b !== null && (b.flags & F.UNCOUNTED) === 0;
    this.detach(p);
    if (counted) this.director.onDispersed();
    this.ctx.events.emit('person:fled', { id: p.id });
    this.ctx.people.remove(p.id);
  }

  onSpawned(id: EntityId): void {
    if (this.active && !this.spawning) this.adoptQueue.push(id);
  }

  /** Prend en charge les manifestants créés par d'autres modules et laissés sans pilote. */
  adoptPending(): void {
    const q = this.adoptQueue;
    if (q.length === 0) return;
    for (let i = 0; i < q.length; i++) {
      const p = this.ctx.people.get(q[i]!);
      if (!p || p.brain !== null || p.faction !== 'protest' || p.kind !== 'manifestant') continue;
      if (p.profile === null) p.profile = 'pacifique';
      const b = this.addMember(p, F.ADOPTED | F.LATE);
      const phase = this.director.base;
      if (phase === 'rassemblement' || phase === 'depart' || phase === 'cortege') b.slot = this.formation.allocTail(this.rngArrive);
      b.state = b.slot >= 0 ? S.ARRIVE : S.LINGER;
      b.speed = T.WALK_MAX;
      this.director.onArrived();
      this.director.stats.total++;
    }
    q.length = 0;
  }

  // ───────────────────────────── registre ─────────────────────────────

  controllersFor(profile: ProtestProfile | null, bystander: boolean): readonly BehaviorController[] {
    const key = bystander ? 'badaud' : profile ?? 'badaud';
    return this.merged.get(key) ?? NO_CONTROLLERS;
  }

  private rebuildMerged(): void {
    this.merged.clear();
    const all = this.registry.get('*') ?? [];
    const keys = new Set<string>(this.registry.keys());
    for (const k of ['pacifique', 'famille', 'militant', 'service_ordre', 'meneur', 'opportuniste', 'radical', 'pilleur', 'badaud']) keys.add(k);
    for (const key of keys) {
      if (key === '*') continue;
      const list = (this.registry.get(key) ?? []).concat(all);
      list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      if (list.length > 0) this.merged.set(key, list);
    }
  }

  // ───────────────────────────── service ─────────────────────────────

  private makeApi(): CrowdCoreApi {
    const core = this;
    return {
      get active(): boolean { return core.active; },
      get members(): readonly Person[] { return core.members; },
      get groups(): readonly CrowdGroup[] { return core.groups; },
      get basePhase(): CrowdPhase { return core.director.base; },
      get cause(): Readonly<CrowdCause> { return core.cause; },
      get volatility(): number { return core.volatility; },
      get timeScale(): number { return core.timeScale; },
      get formation() { return core.formation; },
      get metro() { return core.metro; },
      get exits(): readonly CrowdExit[] { return core.nav.exits; },
      get aleas(): readonly AleaInfo[] { return core.aleas.infos; },
      brain: (p) => brainOf(p),
      group: (id) => core.groups[id],
      registerController(profile, controller) {
        let list = core.registry.get(profile);
        if (!list) {
          list = [];
          core.registry.set(profile, list);
        }
        if (list.indexOf(controller) < 0) list.push(controller);
        core.rebuildMerged();
        return () => {
          const l = core.registry.get(profile);
          const i = l ? l.indexOf(controller) : -1;
          if (l && i >= 0) l.splice(i, 1);
          core.rebuildMerged();
        };
      },
      tensionAt: (x, z) => core.director.tensionAt(x, z),
      legitimacyAt: (x, z) => core.emotions.legitAt(x, z),
      cohesionAt: (x, z) => core.emotions.cohesionAt(x, z),
      addLegitimacy: (x, z, d) => core.emotions.addLegit(x, z, d),
      addCohesion: (x, z, d) => core.emotions.addCohesion(x, z, d),
      stir: (x, z, r, fear, anger) => core.emotions.stir(x, z, r, fear, anger),
      markViolence: (x, z) => core.sense.markViolence(x, z),
      recentViolence: (x, z, r) => core.sense.recentViolence(x, z, r ?? T.JUSTIFY_RADIUS),
      nearestPolice: (x: number, z: number, r: number, out: PoliceSight) => core.sense.nearestPolice(x, z, r, out),
      coverAt: (x, z, r) => core.sense.coverAt(x, z, r),
      densityAt: (x, z) => core.density.at(x, z),
      routePoint: (s, out) => core.corridor.at(s, out),
      goTo(p, x, z, speed, run) {
        const b = brainOf(p);
        if (!b || b.index < 0) return;
        core.steering.goTo(p, b, x, z, speed ?? T.WALK_MAX, run === true);
      },
      leave(p, exit) {
        const b = brainOf(p);
        if (b && b.index >= 0) core.behavior.startLeaving(p, b, exit ?? -1);
      },
      release(p) {
        const b = brainOf(p);
        if (!b) return;
        if (b.controller && b.controller.release) b.controller.release(p, b);
        b.controller = null;
        if (b.state === S.CUSTOM) b.state = S.REGROUP;
        b.nextThink = 0;
      },
      spawn(profile, x, z, opts) {
        return core.spawnExtra(profile, x, z, opts);
      },
      setProfile: (p, to) => core.emotions.setProfile(p, to),
      createGroup: (kind, members) => core.createGroup(kind, members),
      triggerAlea: (id) => core.aleas.trigger(id),
      setLiaison: (active) => { core.director.liaison = active; },
      announceDispersal: () => core.director.announceDispersal('organisateurs'),
    };
  }

  /** Manifestant supplémentaire (aléa, module voisin). */
  spawnExtra(profile: ProtestProfile, x: number, z: number, opts?: SpawnOptions): Person | null {
    if (!this.active) return null;
    const family: CrowdFamily = opts?.family ?? 'divers';
    const entry: PlanEntry = { profile, family, banner: false, child: false, ref: null, group: -1 };
    this.spawning = true;
    let p: Person;
    try {
      p = spawnEntry(this.ctx, this.cause, entry, x, z, opts?.heading ?? 0, opts?.seed ?? this.nextSeed());
    } finally {
      this.spawning = false;
    }
    const counted = opts?.counted !== false;
    const b = this.addMember(p, F.LATE | (counted ? 0 : F.UNCOUNTED));
    b.state = S.LINGER;
    b.tx = x;
    b.tz = z;
    if (opts?.group !== undefined && this.groups[opts.group]) {
      const g = this.groups[opts.group]!;
      g.members.push(p.id);
      b.group = g.id;
      b.docility = g.docility;
      if (g.squadId !== 0) this.ctx.squads.addMember(g.squadId, p.id);
    }
    if (counted) {
      this.director.stats.total++;
      this.director.onArrived();
    }
    void FAMILIES;
    return p;
  }

  createGroup(kind: GroupKind, members: readonly Person[]): CrowdGroup {
    const first = members[0];
    const g: CrowdGroup = {
      id: this.groups.length, kind, squadId: 0, members: [], profile: first?.profile ?? 'pacifique', family: 'divers',
      section: -1, docility: this.rngThink.next(), leaveAt: Infinity, exit: -1, path: null,
    };
    g.squadId = this.ctx.squads.create('affinite', 'protest', this.groupName(g)).id;
    this.groups.push(g);
    for (const p of members) {
      const b = brainOf(p);
      if (!b) continue;
      g.members.push(p.id);
      b.group = g.id;
      b.docility = g.docility;
      this.ctx.squads.addMember(g.squadId, p.id);
    }
    return g;
  }
}

const NO_CONTROLLERS: readonly BehaviorController[] = [];
