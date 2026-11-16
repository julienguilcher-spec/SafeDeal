/* =====================================================================================
 * GROUPES RADICAUX — noyau partagé : contexte, services facultatifs, chaleur (intensité), registre des
 * membres, groupes d'affinité (5 à 15 personnes, un meneur, une cohésion, un moral), compteurs.
 * ===================================================================================== */

import type {
  AimSolution, EntityId, GameContext, ItemId, Person, Projectile, Prop, RayHit, Rng, RoadSample, Shop, Vec2, Vehicle,
} from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { ItemsApi } from '@/sim/items/api';
import type { PropsExtApi } from '@/sim/props/api';
import type { ArchetypeExtApi } from '@/sim/roles/archetypes/api';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { F } from '../brain';
import type { CrowdBrain } from '../brain';
import type { CrowdCore } from '../core';
import { RADICAL_EVENT } from './api';
import type { RadicalEvent, RadicalFact, RadicalStats } from './api';
import { KIND, PLAN, TASK, TOOL, createGroup, createMember, isAble } from './model';
import type { RadGroup, RadMember } from './model';
import { Signals } from './signals';
import * as R from './tuning';

function smooth(edge: number, x: number): number {
  const t = x <= 0 ? 0 : x >= edge ? 1 : x / edge;
  return t * t * (3 - 2 * t);
}

export function isPolice(p: Person): boolean {
  return p.faction === 'police' && !p.dormant;
}

export function isPoliceUp(p: Person): boolean {
  return p.faction === 'police' && !p.dormant && p.vehicleId === 0 && p.posture !== 'down';
}

export function isProtester(p: Person): boolean {
  return p.faction === 'protest' && p.posture !== 'down' && !p.dormant;
}

const THROWN: readonly string[] = ['pave', 'bouteille', 'molotov', 'mortier', 'debris'];

export class RadKernel {
  ctx!: GameContext;
  active = false;
  now = 0;
  /** Instant de début de la manifestation. */
  t0 = 0;
  /** Échelle des durées (mission courte : signes plus brefs, mais jamais sous TIME_K_MIN). */
  timeK = 1;
  rng!: Rng;
  rngAct!: Rng;

  /** Intensité 0..1 : tension × propension à dégénérer. Nulle à volatilité nulle. */
  heat = 0;
  /** Volatilité effective (majorée la nuit). */
  volatility = 0;
  night = false;
  /** Point où l'on relève la tension locale (le bloc). */
  focusX = 0;
  focusZ = 0;

  // ── services facultatifs ──
  items: ItemsApi | undefined;
  propsExt: PropsExtApi | undefined;
  vehExt: VehiclesExtApi | undefined;
  attire: ArchetypeExtApi | undefined;

  // ── membres et groupes ──
  readonly all: RadMember[] = [];
  readonly byId = new Map<EntityId, RadMember>();
  readonly groups: RadGroup[] = [];
  /** Radicaux sans groupe. */
  readonly pool: RadMember[] = [];
  /** Membres dont un geste élémentaire est en cours. */
  readonly acting: RadMember[] = [];
  /** Interpellations récentes de membres : identifiants. */
  readonly arrests: EntityId[] = [];
  readonly signals = new Signals();
  readonly stats: RadicalStats = {
    volleys: 0, thrown: 0, mortars: 0, molotovs: 0, returned: 0, windowsAttacked: 0, looted: 0, barricades: 0, barricadesLit: 0,
    vehiclesLit: 0, vehiclesFlipped: 0, rescuesTried: 0, rescuesDone: 0, retreats: 0, scatters: 0, melts: 0, collected: 0,
    firstSignAt: -1, firstViolenceAt: -1,
  };
  /** Cibles réservées par un groupe (identifiant d'entité → identifiant de groupe). */
  readonly claims = new Map<EntityId, number>();
  /** Ce qu'il reste dans les poubelles déjà fouillées (identifiant → bouteilles restantes). */
  readonly binLeft = new Map<EntityId, number>();
  /** Petites sources de projectiles déjà prises par quelqu'un (identifiant → instant de libération). */
  readonly busyUntil = new Map<EntityId, number>();

  // ── objets de travail (jamais conservés d'un appel à l'autre) ──
  readonly people: Person[] = [];
  readonly people2: Person[] = [];
  readonly props: Prop[] = [];
  readonly shops: Shop[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly hit: RayHit = makeRayHit();
  readonly aim: AimSolution = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };
  readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  readonly v2: Vec2 = { x: 0, z: 0 };
  readonly path: number[] = [];
  private readonly event: RadicalEvent = { fact: 'salve', groupId: 0, x: 0, z: 0, count: 0, targetId: 0 };
  private nextGroupId = 1;
  private nextPool = 0;
  /** Interrompt le geste en cours d'un membre (fourni par la machine d'actions). */
  cancelAct: (m: RadMember) => void = () => {};

  constructor(readonly core: CrowdCore) {}

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.rng = this.rngAct = ctx.rng;
    this.signals.bind(ctx);
  }

  reset(): void {
    this.active = false;
    this.now = 0;
    this.heat = 0;
    this.volatility = 0;
    this.lastViolenceAt = -1;
    for (const m of this.all) {
      m.actIndex = -1;
      m.group = null;
    }
    this.all.length = 0;
    this.byId.clear();
    this.groups.length = 0;
    this.pool.length = 0;
    this.acting.length = 0;
    this.arrests.length = 0;
    this.claims.clear();
    this.binLeft.clear();
    this.busyUntil.clear();
    this.signals.reset();
    this.nextGroupId = 1;
    this.nextPool = 0;
    const s = this.stats;
    s.volleys = s.thrown = s.mortars = s.molotovs = s.returned = s.windowsAttacked = s.looted = s.barricades = 0;
    s.barricadesLit = s.vehiclesLit = s.vehiclesFlipped = s.rescuesTried = s.rescuesDone = s.retreats = s.scatters = 0;
    s.melts = s.collected = 0;
    s.firstSignAt = s.firstViolenceAt = -1;
  }

  /** Début de session : générateurs dérivés, services facultatifs. */
  start(): void {
    const ctx = this.ctx;
    const core = this.core;
    this.rng = ctx.rng.fork('radicaux:decisions');
    this.rngAct = ctx.rng.fork('radicaux:gestes');
    this.items = ctx.service<ItemsApi>('items');
    this.propsExt = ctx.service<PropsExtApi>('props.ext');
    this.vehExt = ctx.service<VehiclesExtApi>('vehicles.ext');
    this.attire = ctx.service<ArchetypeExtApi>('roles.archetypes');
    this.now = this.t0 = ctx.clock.now;
    this.timeK = Math.min(R.TIME_K_MAX, Math.max(R.TIME_K_MIN, core.timeScale));
    this.focusX = core.rallyX;
    this.focusZ = core.rallyZ;
    const extra = core.extra;
    this.active = core.active && extra['radical.none'] !== true;
    this.updateHeat(0);
  }

  // ───────────────────────────── chaleur ─────────────────────────────

  updateHeat(dt: number): void {
    const core = this.core;
    const env = this.ctx.env.state;
    this.night = env.isNight === true;
    let v = core.volatility * (this.night ? R.NIGHT_VOLATILITY : 1);
    if (v > 1) v = 1;
    this.volatility = v;
    if (!(v > 0)) {
      this.heat = 0;
      return;
    }
    const d = core.director;
    let t = d.tension;
    const local = d.tensionAt(this.focusX, this.focusZ);
    if (local > t) t = local;
    let raw = t * (R.HEAT_T0 + R.HEAT_TV * v) + R.HEAT_V * v - R.HEAT_BIAS;
    raw = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    raw *= smooth(R.HEAT_GATE, v);
    if (dt <= 0) this.heat = raw;
    else this.heat += (raw - this.heat) * (1 - Math.exp(-dt / R.HEAT_SMOOTH));
  }

  // ───────────────────────────── membres ─────────────────────────────

  /** Membre correspondant à une personne pilotée par la foule (créé à la première rencontre). */
  member(p: Person, b: CrowdBrain): RadMember {
    const d = b.data as RadMember | null;
    if (d !== null && typeof d === 'object' && d.p === p) return d;
    const kind = p.profile === 'pilleur' ? KIND.LOOTER : p.profile === 'opportuniste' ? KIND.FOLLOWER : KIND.RADICAL;
    const m = createMember(p, b, kind, this.now);
    b.data = m;
    this.all.push(m);
    this.byId.set(p.id, m);
    this.refreshTools(m);
    if (kind === KIND.RADICAL) this.pool.push(m);
    return m;
  }

  /** Relit l'inventaire : outils détenus, projectiles à lancer. */
  refreshTools(m: RadMember): void {
    const inv = m.p.inventory;
    let tools = 0;
    let ammo = 0;
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i]!;
      if (s.count <= 0) continue;
      switch (s.id) {
        case 'banderole': tools |= TOOL.BANNER; break;
        case 'parapluie': if (s.state > 0) tools |= TOOL.UMBRELLA; break;
        case 'marteau': tools |= TOOL.HAMMER; break;
        case 'barre': tools |= TOOL.BAR; break;
        case 'mortier': tools |= TOOL.MORTAR; break;
        case 'molotov': tools |= TOOL.MOLOTOV; break;
        case 'bombe_peinture': tools |= TOOL.PAINT; break;
        case 'raquette': tools |= TOOL.RACKET; break;
        case 'fumigene': tools |= TOOL.SMOKE; break;
        case 'pave': tools |= TOOL.PAVE; ammo += s.count; break;
        case 'bouteille': tools |= TOOL.BOTTLE; ammo += s.count; break;
        case 'butin': tools |= TOOL.LOOT; break;
        default: break;
      }
    }
    if (ammo > m.ammo && m.toolsAt >= 0) {
      const gained = ammo - m.ammo;
      m.collected += gained;
      this.stats.collected += gained;
      if (m.group) m.group.lastSupplyAt = this.now;
    }
    m.tools = tools;
    m.ammo = ammo;
    m.toolsAt = this.now;
  }

  /** Objet à lancer détenu, pavé d'abord. */
  throwable(m: RadMember): ItemId | '' {
    return (m.tools & TOOL.PAVE) !== 0 ? 'pave' : (m.tools & TOOL.BOTTLE) !== 0 ? 'bouteille' : '';
  }

  /** Retire un membre de son groupe (changement de profil, départ). */
  detach(m: RadMember): void {
    const g = m.group;
    if (g) {
      let i = g.members.indexOf(m);
      if (i >= 0) g.members.splice(i, 1);
      i = g.followers.indexOf(m);
      if (i >= 0) g.followers.splice(i, 1);
      if (g.leader === m) g.leader = null;
    }
    m.group = null;
    const i = this.pool.indexOf(m);
    if (i >= 0) this.pool.splice(i, 1);
  }

  // ───────────────────────────── groupes ─────────────────────────────

  /** Radicaux valides, tous groupes confondus. */
  strength(): number {
    let n = 0;
    for (let i = 0; i < this.groups.length; i++) {
      const ms = this.groups[i]!.members;
      for (let j = 0; j < ms.length; j++) if (isAble(ms[j]!)) n++;
    }
    return n;
  }

  /**
   * Range les radicaux sans groupe : dans un groupe proche qui a de la place, sinon en nouveaux groupes de
   * 5 à 15 dès qu'ils sont assez nombreux. Appelé deux fois par seconde au plus.
   */
  organise(): void {
    if (this.now < this.nextPool) return;
    this.nextPool = this.now + 0.5;
    const pool = this.pool;
    // retire ceux qui ne sont plus radicaux ou ont quitté le jeu
    for (let i = pool.length - 1; i >= 0; i--) {
      const m = pool[i]!;
      if (m.b.index < 0 || m.p.profile !== 'radical' || m.group !== null || (m.b.flags & F.LEAVING) !== 0) pool.splice(i, 1);
    }
    if (pool.length === 0) return;
    // 1. place dans un groupe existant, le plus proche
    for (let i = pool.length - 1; i >= 0; i--) {
      const m = pool[i]!;
      let best: RadGroup | null = null;
      let bestD = 90 * 90;
      for (let g = 0; g < this.groups.length; g++) {
        const grp = this.groups[g]!;
        if (grp.members.length >= R.GROUP_MAX || grp.members.length === 0) continue;
        const dx = grp.ax - m.p.x;
        const dz = grp.az - m.p.z;
        const d = dx * dx + dz * dz + grp.members.length * 40;
        if (d < bestD) {
          bestD = d;
          best = grp;
        }
      }
      if (best) {
        pool.splice(i, 1);
        this.join(best, m);
      }
    }
    // 2. nouveaux groupes
    const floor = this.groups.length === 0 ? R.GROUP_FLOOR : R.GROUP_MIN;
    if (pool.length < floor) return;
    // on ne fonde pas un groupe réduit tant que d'autres radicaux arrivent encore
    if (pool.length < R.GROUP_MIN && this.now - this.t0 < 20 * this.timeK) return;
    const count = Math.max(1, Math.round(pool.length / R.GROUP_IDEAL));
    const size = Math.min(R.GROUP_MAX, Math.ceil(pool.length / count));
    // voisins ensemble : tri le long de la plus grande étendue
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const m of pool) {
      if (m.p.x < minX) minX = m.p.x;
      if (m.p.x > maxX) maxX = m.p.x;
      if (m.p.z < minZ) minZ = m.p.z;
      if (m.p.z > maxZ) maxZ = m.p.z;
    }
    const alongX = maxX - minX >= maxZ - minZ;
    pool.sort((a, b) => (alongX ? a.p.x - b.p.x : a.p.z - b.p.z) || a.p.id - b.p.id);
    while (pool.length > 0) {
      const g = this.newGroup();
      const take = pool.length <= size + 2 ? pool.length : size;
      for (let i = 0; i < take; i++) this.join(g, pool.shift()!);
      g.size0 = g.members.length;
      this.electLeader(g);
    }
  }

  private newGroup(): RadGroup {
    const g = createGroup(this.nextGroupId++, this.now);
    g.name = 'Groupe affinitaire R' + g.id;
    g.squadId = this.ctx.squads.create('affinite', 'protest', g.name).id;
    g.morale = R.MORALE_START;
    g.nextThink = this.now + this.rng.next() * R.GROUP_THINK;
    this.groups.push(g);
    return g;
  }

  private join(g: RadGroup, m: RadMember): void {
    m.group = g;
    g.members.push(m);
    if (g.members.length > g.size0) g.size0 = g.members.length;
    this.ctx.squads.addMember(g.squadId, m.p.id);
    if (g.members.length === 1) {
      g.ax = m.p.x;
      g.az = m.p.z;
      g.destX = g.ax;
      g.destZ = g.az;
    }
    if (g.leader === null || m.b.courage > g.leader.b.courage) this.electLeader(g);
  }

  /** Le meneur : le plus déterminé des membres valides. */
  electLeader(g: RadGroup): void {
    let best: RadMember | null = null;
    for (let i = 0; i < g.members.length; i++) {
      const m = g.members[i]!;
      if (!isAble(m)) continue;
      if (best === null || m.b.courage > best.b.courage) best = m;
    }
    if (best !== g.leader) {
      g.leader = best;
      if (best) this.ctx.squads.setLeader(g.squadId, best.p.id);
    }
  }

  /**
   * Un groupe réduit à presque rien se dissout : ses derniers membres rejoignent le groupe le plus proche
   * (ou attendent, sans groupe, que d'autres les rejoignent).
   */
  dissolve(g: RadGroup): void {
    this.setPlan(g, PLAN.FOLLOW);
    for (const m of g.members) {
      m.group = null;
      if (isAble(m) && m.p.profile === 'radical' && this.pool.indexOf(m) < 0) this.pool.push(m);
    }
    g.members.length = 0;
    for (const m of g.followers) m.group = null;
    g.followers.length = 0;
    g.leader = null;
    g.site.active = false;
  }

  /** Attache un suiveur à un groupe (s'il reste de la place). */
  attach(g: RadGroup, m: RadMember): boolean {
    if (m.group === g) return true;
    if (g.followers.length >= Math.ceil(g.members.length * R.FOLLOWERS_PER_MEMBER)) return false;
    this.detach(m);
    m.group = g;
    g.followers.push(m);
    return true;
  }

  /** Change le plan d'un groupe. */
  setPlan(g: RadGroup, plan: number, seconds = Infinity): void {
    if (g.plan === plan) {
      g.planUntil = this.now + seconds;
      return;
    }
    g.plan = plan;
    g.planSince = this.now;
    g.planUntil = this.now + seconds;
    g.stage = 0;
    g.stageSince = this.now;
    g.entered = -1;
    g.planOk = true;
    g.reviewAt = this.now + R.PLAN_DWELL;
    g.volleyAt = -1;
    if (g.tId !== 0 && this.claims.get(g.tId) === g.id) this.claims.delete(g.tId);
    if (plan === PLAN.FOLLOW) {
      g.tKind = 0;
      g.tId = 0;
    }
    // chacun lâche ce qu'il faisait et reprendra sa tâche à sa prochaine réflexion, très vite
    const soon = this.now + 0.05;
    for (let i = 0; i < g.members.length; i++) {
      const m = g.members[i]!;
      this.drop(m);
      m.step = 0;
      m.tries = 0;
      if (m.b.nextThink > soon + 0.35 * ((m.b.phase * 0.159) % 1)) m.b.nextThink = soon + 0.35 * ((m.b.phase * 0.159) % 1);
    }
    for (let i = 0; i < g.followers.length; i++) this.drop(g.followers[i]!);
  }

  /** Le membre abandonne sa tâche : geste interrompu, objet porté posé là où il est. */
  drop(m: RadMember): void {
    if (m.act !== 0) this.cancelAct(m);
    m.task = TASK.NONE;
    const p = m.p;
    if (p.carrying !== 0 && this.ctx.props.get(p.carrying) !== undefined) this.ctx.interactions.startVerb(p, 'deposer', p.carrying);
    if (m.tId !== 0 && this.claims.get(m.tId) === (m.group ? m.group.id : -1)) this.claims.delete(m.tId);
    m.tId = 0;
  }

  setStage(g: RadGroup, stage: number): void {
    g.stage = stage;
    g.stageSince = this.now;
    g.entered = -1;
  }

  claim(g: RadGroup, id: EntityId): void {
    if (id !== 0) this.claims.set(id, g.id);
  }

  claimedByOther(g: RadGroup, id: EntityId): boolean {
    const c = this.claims.get(id);
    return c !== undefined && c !== g.id;
  }

  // ───────────────────────────── faits, tension, compteurs ─────────────────────────────

  emit(fact: RadicalFact, g: RadGroup | null, x: number, z: number, count: number, targetId: EntityId = 0): void {
    const e = this.event;
    e.fact = fact;
    e.groupId = g ? g.id : 0;
    e.x = x;
    e.z = z;
    e.count = count;
    e.targetId = targetId;
    this.ctx.events.emitAny(RADICAL_EVENT, e);
  }

  /** Dernier acte violent (instant). */
  lastViolenceAt = -1;

  /** Acte violent : le premier de la session sert à mesurer l'avance des signes avant-coureurs. */
  violence(): void {
    if (this.stats.firstViolenceAt < 0) this.stats.firstViolenceAt = this.now;
    this.lastViolenceAt = this.now;
  }

  isThrown(kind: string): boolean {
    return THROWN.indexOf(kind) >= 0;
  }

  /** Projectile ramassable (palet, grenade) le plus proche d'un point. */
  nearestGrenade(x: number, z: number, r: number): Projectile | null {
    const pr = this.ctx.projectiles.nearestPickable(x, z, r);
    if (!pr) return null;
    return pr.kind === 'palet_lacrymo' || pr.kind === 'grenade_lacrymo_main' || pr.kind === 'grenade_lacrymo_56' ? pr : null;
  }
}
