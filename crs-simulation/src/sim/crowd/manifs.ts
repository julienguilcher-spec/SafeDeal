/* =====================================================================================
 * FOULE — MANIFESTATIONS SIMULTANÉES : d'autres manifestations DÉCLARÉES se tiennent le même jour ailleurs dans
 * Paris, en même temps que la manifestation principale (celle du directeur).
 *
 * Chacune est un vrai cortège : rassemblement sur une place réelle, départ, marche le long de SON parcours déclaré
 * jusqu'à sa destination (autre place réelle), dispersion annoncée par ses organisateurs ; sa cause (slogans, tenues,
 * pancartes), sa composition (plan de population.ts : familles, profils, service d'ordre, meneurs, banderoles), son
 * effectif. Ses membres sont de VRAIES personnes de la foule (CrowdCore.spawnForeign) : sommations, charges, nasses
 * (« encercler »), interpellations, droit, cartes de densité, tableau de situation fonctionnent comme pour le cortège
 * principal. Hors statistiques du cortège principal (drapeau UNCOUNTED), sans place dans sa formation, rattachés à
 * leur manifestation (drapeau FOYER : le comportement par défaut les ramène vers le point qu'on leur donne).
 *
 * Marche : une tête avance le long du couloir du parcours (route.ts, Corridor) ; chaque membre a sa place dans la
 * colonne (rang, position en travers) ; la tête ralentit quand la colonne s'étire ou quand cela chauffe, s'arrête
 * devant un barrage (agents, véhicules, rue fermée) ; après l'hésitation des organisateurs, elle se détourne
 * (detour.ts) — vers sa destination si un chemin existe, sinon vers la place atteignable la plus proche.
 *
 * Configuration : extra['manifestations'] (voir api.ts). Budget de foule : l'ensemble des manifestations
 * supplémentaires tient dans ce que laisse le cortège principal sous le plafond du module (4 000 personnes simulées),
 * chacune à 1 500 au plus, réduites au prorata.
 *
 * Annonces : CENTRAL sur le canal commandement (déclaration, départ, détour, arrivée, dispersion, fin), événement
 * libre 'crowd:manif' ; service 'crowd.manifs' (ManifsApi) pour l'interface, la mise en place et le commandement.
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, Person, Rng, RoadSample, SessionConfig, Vec2,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_MANIFS, CROWD_MANIFS_SYSTEM, MANIF_EVENT } from './api';
import type {
  BehaviorController, CrowdCause, CrowdGroup, GroupKind, ManifEvent, ManifPhase, ManifView, ManifsApi, RoutePoint,
} from './api';
import { A, F, S, brainOf } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import { Rerouter, closureAhead, detourText, enclosedAt, spliceDetour } from './detour';
import { buildPlan, resolveCause } from './population';
import type { PlanEntry } from './population';
import type { RadicalSystem } from './radical';
import { ACT } from './radical/model';
import type { RadMember } from './radical/model';
import { Corridor, chooseRoute } from './route';
import * as T from './tuning';

// ───────────────────────────── réglages ─────────────────────────────

/** Plafond de foule simulée du module (même valeur que CrowdCore.start). */
const CROWD_CAP = 4000;
const PER_MANIF_MAX = 1500;
const PER_MANIF_MIN = 30;
const MAX_MANIFS = 3;
/** Écart minimal entre deux lieux de rassemblement (m). */
const MIN_APART = 1200;
const ROW = 1.3;
const COL = 1.2;
const TICK = 0.5;
const REVIEW = 1;
const DETAIL_RADIUS = 160;
const DETAIL_EVERY = 30;

/** Places de Paris (nom tel que la carte le connaît, coordonnées de secours). */
export const MANIF_PLACES: readonly { name: string; x: number; z: number }[] = [
  { name: 'Place de la République', x: 3123, z: -208 },
  { name: 'Place de la Bastille', x: 3542, z: 1395 },
  { name: 'Place de la Concorde', x: -10, z: 15 },
  { name: 'Place Charles de Gaulle', x: -1920, z: -906 },
  { name: "Place de l'Opéra", x: 811, z: -564 },
  { name: 'Place du Trocadéro', x: -2411, z: 387 },
  { name: 'Esplanade des Invalides', x: -596, z: 626 },
  { name: "Place de l'Hôtel de Ville", x: 2211, z: 993 },
  { name: 'Place du Châtelet', x: 1903, z: 916 },
  { name: 'Place de la Madeleine', x: 239, z: -497 },
  { name: 'Boulevard Saint-Denis', x: 2416, z: -413 },
  { name: 'Boulevard Montmartre', x: 1478, z: -680 },
];

const CAUSES: readonly string[] = ['climat', 'logement', 'hopital', 'education', 'retraites', 'pouvoir_achat', 'libertes', 'agricole'];

const DEPART_TEXT = 'On y va ! On reste groupés derrière la banderole !';
const DISPERSAL_TEXT = 'La manifestation est terminée. Merci à toutes et à tous, dispersez-vous dans le calme.';

/** Réglage d'une manifestation supplémentaire (lu dans extra['manifestations']). */
export interface ManifSpec {
  place: string;
  x: number | null;
  z: number | null;
  crowdSize: number;
  cause: string;
  causeLabel: string;
  destination: string | { x: number; z: number } | null;
  tension: number;
  volatility: number;
}

interface Manif {
  readonly id: number;
  view: ManifView;
  spec: ManifSpec;
  cause: CrowdCause;
  rng: Rng;
  phase: ManifPhase;
  departAt: number;
  marchEnd: number;
  disperseEnd: number;
  endAt: number;
  phaseAt: number;
  corridor: Corridor;
  points: number[];
  headS: number;
  speed: number;
  stopS: number;
  blocked: boolean;
  /** Longueur de la colonne (m) et places par rang. */
  colLen: number;
  perRow: number;
  queue: PlanEntry[];
  planned: number;
  spawned: number;
  early: number;
  ids: EntityId[];
  groups: CrowdGroup[];
  forming: Person[];
  formSize: number;
  exits: number[];
  exitsX: number;
  exitsZ: number;
  exitsAt: number;
  reroute: Rerouter;
  destX: number;
  destZ: number;
  destName: string;
  peak: number;
  present: number;
  lagging: number;
  tension0: number;
  volatility: number;
  nextChant: number;
  response: string;
  responseAt: number;
  chantUntil: number;
  nextTension: number;
  nextScan: number;
  detailAt: number;
}

interface Tie {
  readonly m: Manif;
  /** Distance derrière la tête (m) et position en travers (−1..1). */
  back: number;
  lat: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function approx(n: number): string {
  if (n < 150) return 'une centaine de';
  if (n < 1000) return 'environ ' + Math.round(n / 50) * 50;
  return 'environ ' + (Math.round(n / 100) * 100).toLocaleString('fr-FR');
}

/** Nom de lieu en minuscule dans une phrase (« place de la Bastille »). */
function lower(name: string): string {
  return name === '' ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

/** Lit extra['manifestations'] : liste de réglages, ou nombre de manifestations à tirer. */
export function readManifSpecs(config: SessionConfig): { specs: ManifSpec[]; auto: number } {
  const extra = (config.extra ?? {}) as Record<string, unknown>;
  const raw = extra['manifestations'];
  const out: ManifSpec[] = [];
  if (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) {
    // nombre TOTAL de manifestations (la principale comprise) : 1 = aucune supplémentaire
    const n = clamp(Math.round(num(raw, 1)) - 1, 0, MAX_MANIFS);
    return { specs: out, auto: n };
  }
  if (!Array.isArray(raw)) return { specs: out, auto: 0 };
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const hasXz = typeof o['x'] === 'number' && typeof o['z'] === 'number' && Number.isFinite(o['x']) && Number.isFinite(o['z']);
    let destination: ManifSpec['destination'] = null;
    const d = o['destination'];
    if (typeof d === 'string' && d !== '') destination = d;
    else if (typeof d === 'object' && d !== null && Number.isFinite(Number((d as { x?: unknown }).x)) && Number.isFinite(Number((d as { z?: unknown }).z))) {
      destination = { x: Number((d as { x: unknown }).x), z: Number((d as { z: unknown }).z) };
    }
    out.push({
      place: typeof o['place'] === 'string' ? (o['place'] as string) : '',
      x: hasXz ? (o['x'] as number) : null,
      z: hasXz ? (o['z'] as number) : null,
      crowdSize: clamp(Math.round(num(o['crowdSize'], 600)), 20, 20000),
      cause: typeof o['cause'] === 'string' ? (o['cause'] as string) : '',
      causeLabel: typeof o['causeLabel'] === 'string' ? (o['causeLabel'] as string) : '',
      destination,
      tension: clamp(num(o['tension'], NaN), 0, 1),
      volatility: clamp(num(o['volatility'], NaN), 0, 1),
    });
    if (out.length >= MAX_MANIFS) break;
  }
  return { specs: out, auto: 0 };
}

export class ManifsSystem implements GameSystem {
  readonly id = CROWD_MANIFS_SYSTEM;
  readonly order = SystemOrder.RULES + 2;
  private ctx!: GameContext;
  private readonly manifs: Manif[] = [];
  private readonly views: ManifView[] = [];
  private readonly ties = new Map<EntityId, Tie>();
  private nextTick = 0;
  private nextReview = 0;
  /** Allure de marche (extra['manifs.vitesse'], 0,5 à 2,2 ; essais). */
  private pace = 1;
  private readonly api: ManifsApi;
  private readonly controller: BehaviorController;
  private readonly rp: RoutePoint = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };
  private readonly v2: Vec2 = { x: 0, z: 0 };
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly police = (p: Person): boolean => p.faction === 'police' && p.vehicleId === 0 && p.posture !== 'down';

  constructor(readonly core: CrowdCore, readonly radical: RadicalSystem | null) {
    const self = this;
    this.api = {
      get list(): readonly ManifView[] { return self.views; },
      manifOf(id: EntityId): ManifView | null {
        const t = self.ties.get(id);
        return t ? t.m.view : null;
      },
      assign(manifId: number, companyId: number): void {
        for (const m of self.manifs) if (m.id === manifId) m.view.companyId = companyId;
      },
    };
    this.controller = {
      id: 'foule:manifestations',
      priority: 20,
      think: (p, b) => this.think(p, b),
      release: (p, b) => this.release(p, b),
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide(CROWD_MANIFS, this.api);
  }

  init(ctx: GameContext): void {
    this.core.register('*', this.controller);
    // la manifestation principale est mise en place juste avant, sur le même événement (abonnement antérieur) : les
    // autres le sont aussitôt, pour que la mise en place des forces (session.setup) les trouve
    ctx.events.on('session:started', ({ config }) => {
      try {
        if (this.core.active) this.plan(config);
      } catch (err) {
        console.error('[crowd] manifestations supplémentaires impossibles', err);
      }
    });
  }

  reset(): void {
    this.manifs.length = 0;
    this.views.length = 0;
    this.ties.clear();
    this.nextTick = 0;
    this.nextReview = 0;
  }

  // ───────────────────────────── mise en place ─────────────────────────────

  private plan(config: SessionConfig): void {
    const ctx = this.ctx;
    const core = this.core;
    const { specs, auto } = readManifSpecs(config);
    if (specs.length === 0 && auto === 0) return;
    this.pace = clamp(num(core.extra['manifs.vitesse'], 1), 0.5, 2.2);
    const rng = ctx.rng.fork('foule:manifestations');
    const scale = ctx.settings.values.crowdScale > 0 ? ctx.settings.values.crowdScale : 1;
    // lieux déjà pris : la manifestation principale (rassemblement et destination)
    const taken: { x: number; z: number }[] = [{ x: core.rallyX, z: core.rallyZ }];
    const list = specs.slice();
    for (let i = 0; i < auto; i++) {
      list.push({
        place: '', x: null, z: null, crowdSize: Math.round(200 + rng.next() * Math.max(200, config.crowdSize)), cause: CAUSES[rng.int(0, CAUSES.length)]!,
        causeLabel: '', destination: null, tension: NaN, volatility: NaN,
      });
    }
    // budget : ce que laisse le cortège principal
    const room = Math.max(0, CROWD_CAP - core.size);
    const want = list.map((s) => clamp(Math.round(s.crowdSize * scale), PER_MANIF_MIN, PER_MANIF_MAX));
    const sum = want.reduce((a, b) => a + b, 0);
    const k = sum > room && sum > 0 ? room / sum : 1;
    for (let i = 0; i < list.length; i++) {
      const spec = list[i]!;
      const size = Math.max(Math.min(PER_MANIF_MIN, want[i]!), Math.floor(want[i]! * k));
      if (size <= 0) continue;
      const where = this.pickStart(spec, taken, rng);
      if (!where) {
        console.warn('[crowd] pas de lieu pour une manifestation supplémentaire');
        continue;
      }
      taken.push(where);
      this.create(config, spec, where, size, rng.fork('manif:' + i));
    }
  }

  /** Lieu de rassemblement : celui du réglage, sinon une place réelle à plus de 1,2 km des autres. */
  private pickStart(spec: ManifSpec, taken: readonly { x: number; z: number }[], rng: Rng): { x: number; z: number; name: string } | null {
    const world = this.ctx.world;
    if (spec.x !== null && spec.z !== null) return { x: spec.x, z: spec.z, name: spec.place || world.sectorName(spec.x, spec.z) };
    if (spec.place !== '') {
      const info = world.placeByName(spec.place);
      const known = MANIF_PLACES.find((p) => p.name.toLowerCase() === spec.place.toLowerCase());
      if (info) return { x: info.x, z: info.z, name: spec.place };
      if (known) return { ...known };
    }
    const b = world.bounds;
    const cands: { x: number; z: number; name: string }[] = [];
    for (const pl of MANIF_PLACES) {
      const info = world.placeByName(pl.name);
      const x = info && Math.hypot(info.x - pl.x, info.z - pl.z) < 400 ? info.x : pl.x;
      const z = info && Math.hypot(info.x - pl.x, info.z - pl.z) < 400 ? info.z : pl.z;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      if (!world.nearestRoad(x, z, this.road, 120)) continue;
      cands.push({ x, z, name: pl.name });
    }
    for (const apart of [MIN_APART, MIN_APART * 0.75, MIN_APART * 0.5]) {
      const ok = cands.filter((c) => taken.every((t) => Math.hypot(t.x - c.x, t.z - c.z) >= apart));
      if (ok.length > 0) return ok[rng.int(0, ok.length)]!;
    }
    return null;
  }

  /** Destination : celle du réglage, sinon une autre place à 0,9 – 2,6 km, loin des autres manifestations. */
  private pickDestination(spec: ManifSpec, sx: number, sz: number, rng: Rng): { x: number; z: number; name: string } | null {
    const world = this.ctx.world;
    const d = spec.destination;
    if (d !== null && typeof d === 'object') return { x: d.x, z: d.z, name: world.sectorName(d.x, d.z) };
    if (typeof d === 'string') {
      const info = world.placeByName(d);
      const known = MANIF_PLACES.find((p) => p.name.toLowerCase() === d.toLowerCase());
      if (info) return { x: info.x, z: info.z, name: d };
      if (known) return { ...known };
    }
    const others: { x: number; z: number }[] = [{ x: this.core.rallyX, z: this.core.rallyZ }];
    for (const m of this.manifs) others.push({ x: m.view.x, z: m.view.z }, { x: m.destX, z: m.destZ });
    const b = world.bounds;
    let best: { x: number; z: number; name: string } | null = null;
    let bestScore = -Infinity;
    for (const pl of MANIF_PLACES) {
      const info = world.placeByName(pl.name);
      const x = info && Math.hypot(info.x - pl.x, info.z - pl.z) < 400 ? info.x : pl.x;
      const z = info && Math.hypot(info.x - pl.x, info.z - pl.z) < 400 ? info.z : pl.z;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      const dist = Math.hypot(x - sx, z - sz);
      if (dist < 900 || dist > 2600) continue;
      let near = Infinity;
      for (const o of others) near = Math.min(near, Math.hypot(o.x - x, o.z - z));
      const score = Math.min(near, 1500) - Math.abs(dist - 1500) * 0.3 + rng.next() * 300;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, name: pl.name };
      }
    }
    return best;
  }

  private create(config: SessionConfig, spec: ManifSpec, where: { x: number; z: number; name: string }, size: number, rng: Rng): void {
    const ctx = this.ctx;
    const core = this.core;
    const id = this.manifs.length + 2;
    const extra: Record<string, unknown> = { cause: spec.cause };
    const cause = resolveCause(ctx, extra, rng.fork('cause'));
    const tension0 = Number.isFinite(spec.tension) ? spec.tension : clamp(config.tension * (0.6 + 0.6 * rng.next()), 0, 1);
    const volatility = Number.isFinite(spec.volatility) ? spec.volatility : clamp(config.volatility * (0.5 + 0.7 * rng.next()), 0, 1);
    // parcours déclaré : vers la destination, par les rues
    const dest = this.pickDestination(spec, where.x, where.z, rng);
    const routeExtra: Record<string, unknown> = dest ? { 'crowd.destination': { x: dest.x, z: dest.z } } : {};
    const route = chooseRoute(ctx, { ...config, x: where.x, z: where.z, extra: routeExtra } as SessionConfig, rng.fork('parcours'));
    const points = route.points.slice();
    if (points.length < 4) return;
    const corridor = new Corridor();
    corridor.build(ctx, points);
    const destX = points[points.length - 2]!;
    const destZ = points[points.length - 1]!;
    const destName = dest ? dest.name : ctx.world.sectorName(destX, destZ);
    // composition : celle de la cause (plan de population.ts), organisateurs et banderoles en tête
    const plan = buildPlan(ctx, cause, size, {}, tension0, volatility, rng.fork('plan'));
    const entries = plan.entries.slice();
    const rank = (e: PlanEntry): number => (e.banner ? 0 : e.profile === 'service_ordre' || e.profile === 'meneur' ? 1 : e.profile === 'radical' || e.profile === 'pilleur' ? 2 : 3);
    entries.sort((a, b) => rank(a) - rank(b));
    const perRow = clamp(Math.floor((corridor.refWidth * 0.85) / COL), 3, 14);
    const colLen = Math.ceil(entries.length / perRow) * ROW + 2;
    const sch = core.schedule;
    const now = ctx.clock.now;
    const gather = num(core.extra['manifs.rassemblement'], sch.gather * (0.8 + 0.5 * rng.next()));
    const march = num(core.extra['manifs.cortege'], sch.march * (0.9 + 0.2 * rng.next()));
    const label = `Manifestation ${lower(cause.label)} — ${where.name} → ${destName}`;
    const squadId = ctx.squads.create('cortege', 'protest', `Manifestation ${lower(cause.label)} (${where.name})`).id;
    // la queue (entrée par la fin) : dépilée par la fin, les premiers arrivés en dernier
    const queue = entries.slice().reverse();
    const view: ManifView = {
      id, label, cause: cause.id, causeLabel: spec.causeLabel || cause.label, from: where.name, to: destName, phase: 'rassemblement',
      declared: spec.crowdSize, planned: entries.length, people: 0, x: where.x, z: where.z, headX: where.x, headZ: where.z, headHeading: 0,
      route: points, headS: 0, tailS: 0, detours: 0, enclosed: false, tension: tension0, kettled: false, startedAt: now, squadId, companyId: 0,
    };
    const m: Manif = {
      id, view, spec, cause, rng, phase: 'rassemblement', departAt: now + gather, marchEnd: now + gather + sch.depart + march,
      disperseEnd: Infinity, endAt: Infinity, phaseAt: now, corridor, points, headS: Math.min(colLen + 4, Math.max(6, corridor.length * 0.35)),
      speed: 0, stopS: Infinity, blocked: false, colLen, perRow, queue, planned: entries.length, spawned: 0,
      early: clamp(num(core.extra['crowd.present'], 0.45), 0, 1), ids: [], groups: [], forming: [], formSize: 3, exits: [], exitsX: where.x,
      exitsZ: where.z, exitsAt: now, reroute: new Rerouter(), destX, destZ, destName, peak: 0, present: 0, lagging: 0, tension0, volatility,
      nextChant: now + 8 + 10 * rng.next(), response: '', responseAt: -1, chantUntil: -1, nextTension: now + 10, nextScan: 0, detailAt: -1e9,
    };
    this.manifs.push(m);
    this.views.push(view);
    // issues propres : on repart par les rues voisines (et le métro), pas vers le cortège principal
    const first = core.nav.addExitsAround(where.x, where.z, () => rng.next());
    for (let i = first; i < core.nav.exits.length; i++) m.exits.push(i);
    this.keepDetail(m, now);
    // les premiers sont déjà là
    const early = Math.round(m.planned * m.early);
    for (let i = 0; i < early && m.queue.length > 0; i++) this.spawnOne(m, true);
    this.flushGroup(m);
    this.refreshView(m);
    this.announce(m, 'annonce');
  }

  // ───────────────────────────── personnes ─────────────────────────────

  /** Place dans la colonne de la k-ième personne (organisateurs et banderoles devant). */
  private slotOf(m: Manif, k: number): { back: number; lat: number } {
    const row = Math.floor(k / m.perRow);
    const col = k % m.perRow;
    const back = 1.5 + row * ROW + (m.rng.next() - 0.5) * 0.5;
    const lat = (-1 + (2 * (col + 0.5)) / m.perRow) * 0.9 + (m.rng.next() - 0.5) * 0.12;
    return { back, lat };
  }

  /** Position d'une place de la colonne (dans this.v2) ; `lead` : avance de la cible sur la tête (m). */
  private slotPoint(m: Manif, back: number, lat: number, lead: number): void {
    const s = Math.max(0.5, m.headS - back) + lead;
    m.corridor.at(s, this.rp);
    const rp = this.rp;
    const half = Math.min(rp.half, 8);
    // derrière le point de départ : la queue se tasse sur la place, plus large
    const extraLat = m.headS - back < 0.5 ? Math.min(14, (0.5 - (m.headS - back)) * 0.25) : 0;
    const lateral = rp.center + lat * (half + extraLat);
    const along = m.headS - back < 0.5 ? -Math.min(20, (0.5 - (m.headS - back)) * 0.3) : 0;
    this.v2.x = rp.x - rp.tz * lateral + rp.tx * along;
    this.v2.z = rp.z + rp.tx * lateral + rp.tz * along;
  }

  private spawnOne(m: Manif, there: boolean): void {
    const ctx = this.ctx;
    const core = this.core;
    const world = ctx.world;
    const e = m.queue.pop()!;
    const k = m.spawned++;
    const slot = this.slotOf(m, k);
    this.slotPoint(m, slot.back, slot.lat, 0);
    let x = this.v2.x;
    let z = this.v2.z;
    const rand = (): number => m.rng.next();
    if (!there) {
      // arrivée : d'une rue voisine, à 50 – 130 m du rassemblement
      const a = m.rng.next() * Math.PI * 2;
      const d = 50 + 80 * m.rng.next();
      if (world.randomFreePoint(m.view.x + Math.sin(a) * d, m.view.z + Math.cos(a) * d, 25, 'sidewalk', rand, this.v2)
        || world.randomFreePoint(m.view.x + Math.sin(a) * d, m.view.z + Math.cos(a) * d, 40, 'any', rand, this.v2)) {
        x = this.v2.x;
        z = this.v2.z;
      }
    } else if (!world.isFree(x, z, 0.3) && world.randomFreePoint(x, z, 6, 'any', rand, this.v2)) {
      x = this.v2.x;
      z = this.v2.z;
    }
    const p = core.spawnForeign(e, m.cause, x, z, Math.atan2(this.rp.tx, this.rp.tz));
    if (!p) return;
    const b = brainOf(p);
    if (!b) return;
    p.anger = Math.min(0.6, m.tension0 * 0.35 * (0.6 + 0.8 * m.rng.next()));
    b.leaveAt = Infinity;
    b.nextThink = core.now + m.rng.next() * 0.6;
    b.anchorX = x;
    b.anchorZ = z;
    this.ties.set(p.id, { m, back: slot.back, lat: slot.lat });
    m.ids.push(p.id);
    if (e.profile === 'meneur' || e.profile === 'service_ordre') {
      const sq = ctx.squads.get(m.view.squadId);
      if (sq && (sq.leaderId === 0 || e.profile === 'meneur')) ctx.squads.setLeader(sq.id, p.id);
    }
    m.forming.push(p);
    if (m.forming.length >= m.formSize) this.flushGroup(m);
  }

  private flushGroup(m: Manif): void {
    if (m.forming.length === 0) return;
    const core = this.core;
    const first = m.forming[0]!;
    const kind: GroupKind = first.profile === 'radical' ? 'noyau' : first.profile === 'famille' ? 'famille' : first.profile === 'militant' ? 'section' : 'amis';
    const g = core.createGroup(kind, m.forming);
    m.forming.length = 0;
    m.formSize = 2 + m.rng.int(0, 5);
    if (m.exits.length > 0) g.exit = m.exits[m.rng.int(0, m.exits.length)]!;
    const sq = this.ctx.squads.get(g.squadId);
    if (sq) sq.parentId = m.view.squadId;
    m.groups.push(g);
  }

  private spawnSome(m: Manif, now: number): void {
    if (m.queue.length === 0) return;
    if (m.phase === 'dispersion') {
      m.queue.length = 0;
      this.flushGroup(m);
      return;
    }
    // les autres arrivent pendant le rassemblement (et les retardataires au début de la marche)
    const span = Math.max(30, m.departAt - m.view.startedAt + 60);
    const early = Math.round(m.planned * m.early);
    const due = Math.min(m.planned, early + Math.ceil((m.planned - early) * Math.min(1, (now - m.view.startedAt) / span)));
    let n = 0;
    while (m.spawned < due && m.queue.length > 0 && n < 8) {
      this.spawnOne(m, false);
      n++;
    }
    if (m.queue.length === 0) this.flushGroup(m);
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(dt: number): void {
    if (this.manifs.length === 0 || !this.core.active) return;
    const now = this.ctx.clock.now;
    for (const m of this.manifs) if (m.phase !== 'terminee') this.advance(m, dt, now);
    if (now >= this.nextTick) {
      this.nextTick = now + TICK;
      for (const m of this.manifs) {
        if (m.phase === 'terminee') continue;
        this.spawnSome(m, now);
        this.scanAhead(m, now);
        if (m.responseAt >= 0 && now >= m.responseAt) {
          m.responseAt = -1;
          this.ctx.events.emit('crowd:chant', { x: m.view.headX, z: m.view.headZ, text: m.response, intensity: Math.min(1, 0.4 + m.present / 400) });
        }
      }
    }
    if (now < this.nextReview) return;
    this.nextReview = now + REVIEW;
    for (const m of this.manifs) if (m.phase !== 'terminee') this.review(m, now);
  }

  /** La tête avance (départ, cortège), bornée par un barrage et la fin du parcours. */
  private advance(m: Manif, dt: number, now: number): void {
    const marching = m.phase === 'depart' || m.phase === 'cortege';
    let target = 0;
    if (marching && !(m.reroute.enclosed) && now >= m.departAt) {
      target = T.MARCH_SPEED * this.pace;
      const hot = this.core.director.tensionAt(m.view.headX, m.view.headZ);
      if (hot > 0.7) target = 0;
      else if (hot > 0.5) target *= 0.55;
      // la colonne s'étire : la tête attend les siens
      if (m.lagging > 0.45) target *= 0.25;
      else if (m.lagging > 0.3) target *= 0.6;
    }
    const end = Math.min(m.corridor.length - 2, m.stopS);
    const room = end - m.headS;
    if (room < 6) target = Math.min(target, room > 0 ? room * 0.35 : 0);
    m.speed += (target - m.speed) * Math.min(1, dt / 1.1);
    if (m.speed < 0.01 && target === 0) m.speed = 0;
    const next = m.headS + m.speed * dt;
    m.headS = next > end ? Math.max(m.headS, end) : next;
    m.blocked = m.stopS !== Infinity && m.stopS - m.headS < 1.5;
  }

  /** Barrage devant la tête : agents à pied, véhicules de police à l'arrêt, rue fermée sur l'axe. */
  private scanAhead(m: Manif, now: number): void {
    if (now < m.nextScan) return;
    m.nextScan = now + 0.5;
    if (m.phase !== 'depart' && m.phase !== 'cortege') {
      m.stopS = Infinity;
      return;
    }
    const ctx = this.ctx;
    const rp = this.rp;
    const s0 = m.headS;
    let stop = Infinity;
    for (let d = 5; d <= 40; d += 5) {
      m.corridor.at(s0 + d, rp);
      const cx = rp.x - rp.tz * rp.center;
      const cz = rp.z + rp.tx * rp.center;
      const r = Math.max(4, Math.min(rp.half, 9));
      if (ctx.people.countIn(cx, cz, r, this.police) >= 3) {
        stop = s0 + d - 7;
        break;
      }
    }
    const closed = closureAhead(ctx, m.corridor, s0, 40);
    if (closed - 4 < stop) stop = closed - 4;
    m.stopS = stop === Infinity ? Infinity : Math.max(stop, s0 - 0.5);
  }

  private review(m: Manif, now: number): void {
    const ctx = this.ctx;
    const core = this.core;
    let present = 0;
    let sx = 0;
    let sz = 0;
    let far = 0;
    const ids = m.ids;
    for (let i = ids.length - 1; i >= 0; i--) {
      const p = ctx.people.get(ids[i]!);
      const b = p ? brainOf(p) : null;
      if (!p || !b || b.index < 0) {
        this.ties.delete(ids[i]!);
        ids[i] = ids[ids.length - 1]!;
        ids.pop();
        continue;
      }
      if (p.custody !== 'free' || p.posture === 'down' || (b.flags & F.LEAVING) !== 0) continue;
      present++;
      sx += p.x;
      sz += p.z;
      const tie = this.ties.get(p.id);
      if (tie && (m.phase === 'depart' || m.phase === 'cortege')) {
        this.slotPoint(m, tie.back, tie.lat, 0);
        if (Math.hypot(this.v2.x - p.x, this.v2.z - p.z) > 14) far++;
      }
    }
    m.present = present;
    m.lagging = present > 0 ? far / present : 0;
    if (present > m.peak) m.peak = present;
    if (present > 0) {
      m.view.x = sx / present;
      m.view.z = sz / present;
    }
    if (now - m.detailAt >= DETAIL_EVERY) this.keepDetail(m, now);
    this.phases(m, now);
    if (m.phase === 'terminee') return;
    this.detours(m, now);
    this.mood(m, now);
    this.refreshExits(m, now);
    this.refreshView(m);
  }

  private phases(m: Manif, now: number): void {
    const few = m.peak > 0 && m.present <= Math.max(3, m.peak * T.END_SHARE) && m.queue.length === 0;
    const sch = this.core.schedule;
    switch (m.phase) {
      case 'rassemblement':
        if (now >= m.departAt) {
          this.setPhase(m, 'depart', now);
          this.voice(m, 'depart', DEPART_TEXT);
          this.announce(m, 'depart');
        }
        break;
      case 'depart':
        if (now >= m.departAt + sch.depart) this.setPhase(m, 'cortege', now);
        break;
      case 'cortege': {
        const arrived = m.headS >= m.corridor.length - 3;
        if (few) this.finish(m, now);
        else if (now >= m.marchEnd) this.disperse(m, now, 'horaire');
        else if (arrived && m.reroute.toDestination && now - m.departAt > (m.marchEnd - m.departAt) * 0.3 && now - m.phaseAt > 20) {
          this.announce(m, 'arrivee');
          this.disperse(m, now, 'arrivee');
        } else if (arrived && !m.reroute.toDestination && !m.view.enclosed) {
          // arrivé sur une place de repli : rassemblement statique jusqu'à la fin de l'horaire
          const blocks = m.reroute.avoided(this.ctx, now);
          m.view.enclosed = m.reroute.enclosed = enclosedAt(this.ctx, m.view.headX, m.view.headZ, blocks);
        }
        break;
      }
      case 'dispersion':
        if (few || now >= m.disperseEnd) this.finish(m, now);
        break;
      default:
        break;
    }
  }

  private setPhase(m: Manif, phase: ManifPhase, now: number): void {
    m.phase = phase;
    m.view.phase = phase;
    m.phaseAt = now;
  }

  /** Détours : la tête arrêtée par un barrage, après hésitation, un nouveau tracé (detour.ts). */
  private detours(m: Manif, now: number): void {
    if (m.phase !== 'depart' && m.phase !== 'cortege') return;
    if (this.core.extra['crowd.noDetour'] === true) return;
    const r = m.reroute;
    if (r.enclosed) return;
    m.corridor.at(m.headS, this.rp);
    const res = r.update(this.ctx, now, m.blocked, this.rp.x, this.rp.z, Math.atan2(this.rp.tx, this.rp.tz), m.destX, m.destZ, m.destName, m.rng, this.core.timeScale);
    if (res === 'detour' && r.lastDetour) {
      const d = r.lastDetour;
      const sp = spliceDetour(m.points, m.headS, d, m.corridor);
      const pts = sp.points;
      m.points = pts;
      m.corridor.build(this.ctx, pts);
      m.headS = sp.headS;
      m.speed = 0;
      m.stopS = Infinity;
      m.blocked = false;
      m.view.route = pts;
      m.view.detours = r.count;
      if (!d.toDestination) m.view.to = d.name + ' (détour)';
      this.voice(m, 'consigne', d.via !== '' ? `On ne nous laisse pas passer : on prend ${d.via} !` : 'On ne nous laisse pas passer : on change de parcours !');
      this.ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2, text: detourText(`le cortège « ${lower(m.cause.label)} »`, d) });
      this.emit(m, 'detour');
      this.ctx.events.emitAny('crowd:detour', { id: m.id, x: this.rp.x, z: this.rp.z, toDestination: d.toDestination, name: d.name, via: d.via });
    } else if (res === 'stuck') {
      m.view.enclosed = r.enclosed;
      if (r.enclosed) {
        this.ctx.radio.say({
          channel: 'commandement', from: 'CENTRAL', priority: 2,
          text: `CENTRAL : le cortège « ${lower(m.cause.label)} » est bloqué, toutes les issues sont fermées. Rassemblement statique, tension en hausse.`,
        });
      }
    }
  }

  /** Tension, slogans. */
  private mood(m: Manif, now: number): void {
    const core = this.core;
    const ctx = this.ctx;
    const hx = m.view.headX;
    const hz = m.view.headZ;
    if (now >= m.nextTension && m.present >= 5) {
      m.nextTension = now + 10;
      const police = core.sense.policeNear(hx, hz, 4);
      const t = core.director.tensionAt(hx, hz);
      const marching = m.phase === 'cortege' || m.phase === 'depart';
      // propension à dégénérer : la tête s'échauffe peu à peu pendant la marche ; plus vite au contact des forces ou
      // enfermée sur une place close
      const ramp = marching ? Math.min(1, (now - m.departAt) / (600 * core.timeScale)) : 0;
      const target = m.tension0 + 0.5 * m.volatility * ramp + (m.view.enclosed ? 0.3 : 0);
      let add = t < target ? 0.01 * (0.5 + m.volatility) : 0;
      if (police < 50) add += 0.01;
      if (m.view.enclosed) add += 0.03;
      if (add > 0 && t < 0.9) core.director.addTension(add, hx, hz, m.view.enclosed ? 'place_close' : 'manifestation');
    }
    if (now >= m.nextChant && m.present >= 6 && m.phase !== 'dispersion') {
      const t = core.director.tensionAt(hx, hz);
      m.nextChant = now + (12 + 14 * m.rng.next()) * (1.2 - 0.5 * Math.min(1, t));
      const chants = m.cause.chants;
      if (chants.length === 0) return;
      const c = chants[m.rng.int(0, chants.length)]!;
      ctx.events.emit('crowd:chant', { x: hx, z: hz, text: c.call, intensity: Math.min(1, 0.4 + m.present / 400) });
      m.response = c.response;
      m.responseAt = c.response !== '' ? now + 2.2 : -1;
      m.chantUntil = now + 6.5;
    }
  }

  /** Issues de la manifestation autour de l'endroit où elle se trouve (quand elle s'est déplacée de 300 m). */
  private refreshExits(m: Manif, now: number): void {
    if (Math.hypot(m.view.x - m.exitsX, m.view.z - m.exitsZ) < 300 || now - m.exitsAt < 45) return;
    const core = this.core;
    m.exitsX = m.view.x;
    m.exitsZ = m.view.z;
    m.exitsAt = now;
    const first = core.nav.addExitsAround(m.view.x, m.view.z, () => m.rng.next());
    m.exits.length = 0;
    for (let i = first; i < core.nav.exits.length; i++) m.exits.push(i);
    if (m.exits.length === 0) return;
    for (const g of m.groups) g.exit = m.exits[m.rng.int(0, m.exits.length)]!;
  }

  private disperse(m: Manif, now: number, _reason: string): void {
    if (m.phase === 'dispersion' || m.phase === 'terminee') return;
    const core = this.core;
    const ctx = this.ctx;
    const span = core.schedule.disperse;
    this.setPhase(m, 'dispersion', now);
    m.disperseEnd = now + span + core.schedule.after * 0.6;
    m.exitsAt = -1e9;
    m.exitsX = m.exitsZ = 1e9;
    this.refreshExits(m, now);
    this.voice(m, 'dispersion', DISPERSAL_TEXT);
    for (const id of m.ids) {
      const p = ctx.people.get(id);
      const b = p ? brainOf(p) : null;
      if (!p || !b || b.index < 0) continue;
      const tune = T.PROFILE[p.profile ?? 'pacifique'];
      const u = Math.min(1, Math.max(0, b.docility * (1 - 0.35 * b.fatigue) + 0.25 * Math.max(0, p.anger - 0.4)));
      const at = now + (tune.goFrom + u * (tune.goTo - tune.goFrom)) * span + 2 * m.rng.next();
      if (at < b.leaveAt) b.leaveAt = at;
    }
    this.announce(m, 'dispersion');
  }

  private finish(m: Manif, now: number): void {
    const ctx = this.ctx;
    this.setPhase(m, 'terminee', now);
    m.queue.length = 0;
    this.flushGroup(m);
    for (const id of m.ids) {
      const p = ctx.people.get(id);
      const b = p ? brainOf(p) : null;
      if (!p || !b || b.index < 0) continue;
      b.flags &= ~F.PINNED;
      const at = now + (2 + 30 * b.docility) * m.rng.next();
      if (at < b.leaveAt) b.leaveAt = at;
      b.nextThink = Math.min(b.nextThink, now + 0.5);
    }
    this.refreshView(m);
    m.view.people = m.present;
    this.announce(m, 'fin');
  }

  private keepDetail(m: Manif, now: number): void {
    m.detailAt = now;
    try {
      void this.ctx.world.whenLoaded(m.view.headX, m.view.headZ, DETAIL_RADIUS).catch(() => undefined);
      if (Math.hypot(m.view.x - m.view.headX, m.view.z - m.view.headZ) > DETAIL_RADIUS * 0.6) {
        void this.ctx.world.whenLoaded(m.view.x, m.view.z, DETAIL_RADIUS).catch(() => undefined);
      }
    } catch {
      // monde neutre ou sans tuiles
    }
  }

  private refreshView(m: Manif): void {
    const v = m.view;
    m.corridor.at(m.headS, this.rp);
    v.headX = this.rp.x;
    v.headZ = this.rp.z;
    v.headHeading = Math.atan2(this.rp.tx, this.rp.tz);
    v.headS = m.headS;
    v.tailS = m.headS - m.colLen;
    v.people = m.present;
    v.detours = m.reroute.count;
    v.enclosed = m.reroute.enclosed;
    v.tension = this.core.director.tensionAt(v.headX, v.headZ);
    v.kettled = this.core.sense.kettleAt(v.x, v.z) !== null || this.core.sense.kettleAt(v.headX, v.headZ) !== null;
  }

  private emit(m: Manif, state: ManifEvent['state']): void {
    const ev: ManifEvent = { id: m.id, state, x: m.view.headX, z: m.view.headZ, label: m.view.label, people: state === 'annonce' ? m.view.declared : m.present };
    this.ctx.events.emitAny(MANIF_EVENT, ev);
  }

  private voice(m: Manif, kind: 'depart' | 'dispersion' | 'consigne', text: string): void {
    this.core.voices.announce(kind, text, m.view.headX, m.view.headZ);
  }

  private announce(m: Manif, state: ManifEvent['state']): void {
    const v = m.view;
    const cause = lower(m.cause.label);
    let text: string;
    switch (state) {
      case 'annonce':
        text = `À toutes les unités de CENTRAL : manifestation déclarée « ${cause} », ${approx(v.declared)} personnes attendues, rassemblement ${lower(v.from)}, parcours vers ${lower(v.to)}.`;
        break;
      case 'depart':
        text = `CENTRAL : le cortège « ${cause} » s’élance de ${lower(v.from)} en direction de ${lower(v.to)}, ${approx(Math.max(m.present, 1) * (v.declared / Math.max(1, v.planned)))} personnes.`;
        break;
      case 'arrivee':
        text = `CENTRAL : la tête du cortège « ${cause} » arrive ${lower(m.destName)}.`;
        break;
      case 'dispersion':
        text = `CENTRAL : les organisateurs de la manifestation « ${cause} » annoncent la dispersion, ${this.ctx.world.sectorName(v.headX, v.headZ)}.`;
        break;
      default:
        text = `CENTRAL : fin de la manifestation « ${cause} » : les derniers manifestants se sont dispersés.`;
        break;
    }
    this.ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: state === 'annonce' || state === 'depart' ? 2 : 1, text });
    this.emit(m, state);
  }

  // ───────────────────────────── contrôleur de comportement ─────────────────────────────

  private think(p: Person, b: CrowdBrain): boolean {
    if ((b.flags & F.FOYER) === 0) return false;
    const tie = this.ties.get(p.id);
    if (!tie) return false;
    const m = tie.m;
    if (m.phase === 'terminee' || (b.flags & (F.LEAVING | F.PINNED)) !== 0 || b.state === S.LEAVE) return false;
    const core = this.core;
    const now = core.now;
    const marching = (m.phase === 'depart' || m.phase === 'cortege') && m.speed > 0.05;
    // place dans la colonne, un peu en avant quand on marche (anticipation)
    this.slotPoint(m, tie.back, tie.lat, marching ? m.speed * 1.2 : 0);
    const x = this.v2.x;
    const z = this.v2.z;
    b.anchorX = x;
    b.anchorZ = z;
    const r = this.radMember(p, b);
    let hold = false;
    if (this.calm(p, b, now)) {
      hold = true;
      if (r !== null && r.act !== ACT.NONE) {
        // un geste du sous-module radical en cours : on le laisse finir
      } else {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d > 1.2) {
          const far = d > 60;
          const speed = marching ? clamp(m.speed + 0.5 * (d - 1), 0.5, far ? T.RUN_CATCHUP : 2.1) : clamp(0.7 + 0.08 * d, 0.7, T.WALK_MAX * b.pace * 1.15);
          core.steering.goTo(p, b, x, z, speed, d > 30 && marching);
          if (far && b.path === null && !b.pathPending) core.nav.request(b);
        } else {
          b.path = null;
          b.tx = x;
          b.tz = z;
        }
        b.lookX = m.view.headX + Math.sin(m.view.headHeading) * 20;
        b.lookZ = m.view.headZ + Math.cos(m.view.headHeading) * 20;
        if (!marching && m.chantUntil > now && b.act === A.NONE) {
          const zeal = p.profile === 'militant' || p.profile === 'meneur' ? 0.7 : 0.45;
          if (core.rngThink.next() < zeal) core.behavior.gesture(p, b, A.CHANT, m.chantUntil - now);
        }
      }
    }
    if (r !== null) {
      if (!hold && r.act !== ACT.NONE) this.radical!.acts.cancel(r);
      r.held = hold;
    }
    return hold;
  }

  private release(_p: Person, b: CrowdBrain): void {
    const r = b.data as RadMember | null;
    if (this.radical && r !== null && typeof r === 'object' && r.p === b.person && r.act !== ACT.NONE) this.radical.acts.cancel(r);
  }

  /** Rien qui demande un réflexe (gaz, charge, forces au contact, peur, nasse, départ décidé). */
  private calm(p: Person, b: CrowdBrain, now: number): boolean {
    const core = this.core;
    if (p.gas > T.GAS_FEEL || p.burning > 0.05) return false;
    const hazards = core.ctx.hazards;
    if (hazards.gasAt(p.x, p.z) > T.GAS_AIR || hazards.fireAt(p.x, p.z) > 0.04) return false;
    if ((b.state === S.FLEE && now < b.fleeUntil) || b.state === S.AVOID || b.panic > now) return false;
    if (b.density >= T.DENSITY_ALERT) return false;
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    if (p.fear > tune.backOff || now >= b.leaveAt) return false;
    if (b.threatUntil > now && p.fear > 0.2) return false;
    const sense = core.sense;
    if (sense.kettleAt(p.x, p.z) !== null) return false;
    if (sense.policeTotal > 0) {
      if (sense.policeNear(p.x, p.z, 2) < 14 && sense.nearestPolice(p.x, p.z, 10, SIGHT)) return false;
      const charges = sense.charges.items;
      for (let i = 0; i < charges.length; i++) {
        const c = charges[i]!;
        if (c.t >= now && Math.hypot(c.x - p.x, c.z - p.z) < 70) return false;
      }
      if (sense.water.near(p.x, p.z, 20, now - 3) !== null) return false;
    }
    return true;
  }

  /** Membre du sous-module radical, tenu hors de la réserve où le bloc du cortège principal recrute. */
  private radMember(p: Person, b: CrowdBrain): RadMember | null {
    const radical = this.radical;
    const prof = p.profile;
    if (!radical || (prof !== 'radical' && prof !== 'pilleur' && prof !== 'opportuniste')) return null;
    const k = radical.k;
    const m = k.member(p, b);
    if (m.group === null) {
      const i = k.pool.indexOf(m);
      if (i >= 0) k.pool.splice(i, 1);
    }
    return m;
  }
}

const SIGHT = { id: 0, x: 0, z: 0, dist: 0, count: 0, closing: 0 };
