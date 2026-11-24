/* =====================================================================================
 * MISE EN PLACE — FORCES DES MANIFESTATIONS SIMULTANÉES (système 'session.manifestations').
 *
 * Quand plusieurs manifestations déclarées se tiennent en même temps (module de foule, service 'crowd.manifs'), une
 * COMPAGNIE supplémentaire est engagée sur chacune des manifestations supplémentaires : construite par le service
 * 'police.units' (comme celle du joueur), placée à l'écart du rassemblement et de son parcours, et confiée à un
 * commandant IA (service 'police.command' : assume + assignCortege) qui conçoit son propre dispositif autour de CE
 * cortège. Toutes les compagnies figurent sur la carte tactique ; le commandant joueur (« tout le dispositif ») peut
 * leur donner des ordres.
 *
 * Manifestations prévues : fait sur l'événement 'session:setup' (la compagnie du joueur est en place), sans toucher à
 * setup.ts. Manifestations nées EN COURS DE PARTIE (manifestations sauvages du curseur « Imprévu » du Mode libre,
 * ManifsApi.declare) : à leur annonce ('crowd:manif' annonce), une compagnie est engagée 180 à 300 s plus tard ; elle
 * part de la base de service la plus proche (journee-data SERVICE_BASES), à bord de ses fourgons, et rejoint en
 * colonne une chaussée à l'écart du cortège (command.arrive), puis son commandant IA suit ce cortège. Pas pendant une vacation de patrouille
 * (extra.vacation) : c'est l'équipage du joueur qui demande, ou non, une compagnie en renfort (mode patrouille).
 *
 * Chaque compagnie engagée a son fourgon cellulaire, avec son équipage, au point de remise de ses interpellés (derrière
 * sa ligne, dos au cortège — remise.ts ; compagnie arrivée en colonne : il roule avec elle, le point est fixé à l'arrivée).
 *
 * Clés de SessionConfig.extra : 'manifestations.compagnies' false → aucune compagnie supplémentaire ;
 * 'manifestations.sections' (1 à 4) → sections par compagnie (défaut : selon l'effectif annoncé).
 * ===================================================================================== */

import type { GameContext, GameSystem, RoadSample, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { readVacation } from '@/gameplay/patrols/model';
import { SESSION_SETUP_EVENT } from './api';
import type { PoliceUnitHandleLike, SessionSetupSummary } from './api';
import { SERVICE_BASES } from './journee-data';
import type { ServiceBase } from './journee-data';
import { chooseStand, chooseStandOffCrowd, distanceToRoute, roadSpot } from './placement';
import type { Stand } from './placement';
import { REMISE_SERVICE, parkBehind, remiseSpot } from './remise';
import type { RemiseApi } from './remise';

export const SESSION_MANIFS_SYSTEM_ID = 'session.manifestations';

/** Délai d'engagement d'une compagnie sur une manifestation née en cours de partie (s). */
export const DEFERRED_MIN = 180;
export const DEFERRED_MAX = 300;

/** Forme consommée du service 'crowd.manifs' (sans dépendre du module de foule). */
interface ManifLike {
  readonly id: number;
  label: string;
  causeLabel: string;
  from: string;
  phase: 'rassemblement' | 'depart' | 'cortege' | 'dispersion' | 'terminee';
  declared: number;
  planned: number;
  people: number;
  x: number;
  z: number;
  route: readonly number[];
  headS: number;
  tailS: number;
  tension: number;
  companyId: number;
  sauvage?: boolean;
}
interface ManifsLike {
  readonly list: readonly ManifLike[];
  assign(manifId: number, companyId: number): void;
}
interface UnitsLike {
  createCompany?(options: {
    x: number; z: number; heading: number; sections?: number; layout?: 'colonne' | 'ligne' | 'embarque'; vehicles?: boolean; drivers?: boolean;
    cellular?: boolean;
  }): PoliceUnitHandleLike;
  createEquipage?(kind: 'fourgon_cellulaire', options: { x: number; z: number; heading: number; parentId?: number }): PoliceUnitHandleLike;
}
interface CommandLike {
  assume(id: number, options?: { base?: { x: number; z: number } }): boolean;
  assignCortege?(id: number, source: ManifLike | null): boolean;
  arrive?(id: number, dest: {
    x: number; z: number; heading: number; layout?: 'bataille' | 'epi' | 'file'; lineX?: number; lineZ?: number; lineHeading?: number;
  }): boolean;
}
interface ManifEventLike {
  id: number;
  state: string;
}

/**
 * Fourgon cellulaire de la compagnie `companyId`, avec son équipage, rattaché à elle : au point de remise derrière sa
 * ligne (x, z, cap `heading` face au cortège) ; `onRoad` (compagnie créée à bord sur la chaussée, avant sa colonne) :
 * garé derrière ses fourgons, il part avec elle. Rien quand aucune place n'est libre ou que le service manque.
 */
function engageCellular(ctx: GameContext, units: UnitsLike, companyId: number, x: number, z: number, heading: number, onRoad: boolean): void {
  if (typeof units.createEquipage !== 'function') return;
  const def = ctx.vehicles.def('fourgon_cellulaire');
  const len = def ? def.length : 6;
  const wid = def ? def.width : 2.05;
  let away = heading + Math.PI;
  if (away > Math.PI) away -= Math.PI * 2;
  const spot = { x: 0, z: 0, heading: 0 };
  const placed = onRoad
    ? parkBehind(ctx, x, z, heading, len, wid, spot)
    : remiseSpot(ctx, x, z, Math.sin(away), Math.cos(away), { taken: [], van: null, len, wid, people: true }, spot)
      || roadSpot(ctx, x - Math.sin(heading) * 70, z - Math.cos(heading) * 70, len, wid, spot);
  if (!placed) {
    console.warn('[session] pas de place pour le fourgon cellulaire de la compagnie ' + companyId);
    return;
  }
  try {
    const h = units.createEquipage('fourgon_cellulaire', { x: spot.x, z: spot.z, heading: spot.heading, parentId: companyId });
    const remise = ctx.service<RemiseApi>(REMISE_SERVICE);
    if (remise) remise.track(companyId, [h.squad.id], away, onRoad ? null : { x, z }, onRoad ? [] : [{ ...spot }]);
  } catch (err) {
    console.error('[session] fourgon cellulaire de la compagnie ' + companyId + ' impossible', err);
  }
}

/** Sections d'une compagnie engagée sur une manifestation d'effectif annoncé `declared` (1 à 4). */
export function sectionsFor(declared: number): number {
  return Math.max(1, Math.min(4, Math.ceil(declared / 600)));
}

const isProtester = (p: { faction: string }): boolean => p.faction === 'protest';

export interface DispatchedCompany {
  /** Unité de tête de la compagnie. */
  companyId: number;
  /** Indicatif radio (« TRAMONTANE »). */
  name: string;
  /** Point où elle se met en place, à l'écart de la foule. */
  stand: Stand;
  /** Lieu de départ (base de service). */
  base: string;
  /** La colonne roule (false : pas de convoi possible, la compagnie a été posée directement sur place). */
  convoy: boolean;
}

/** Base de départ d'une compagnie engagée en cours de partie : la base de service la plus proche, à 400 m au moins. */
export function nearestServiceBase(x: number, z: number): ServiceBase {
  let best: ServiceBase = SERVICE_BASES[0]!;
  let bestD = Infinity;
  for (const b of SERVICE_BASES) {
    const d = Math.hypot(b.x - x, b.z - z);
    if (d >= BASE_MIN && d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Distance du rassemblement à laquelle la colonne se gare (m), et écarts : parcours, manifestants (m). */
const APPROACH: readonly number[] = [115, 135, 100, 160, 190, 225];
const APPROACH_TURN: readonly number[] = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
const APPROACH_NEAREST = 85;
const APPROACH_ROUTE_CLEAR = 40;
const APPROACH_CROWD_CLEAR = 40;
const BASE_MIN = 400;
const approachRoad: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

/**
 * Point de stationnement d'une colonne qui vient de (fromX, fromZ) vers un rassemblement en (x, z) : sur une chaussée
 * de 6 m au moins, du côté d'où elle arrive (elle ne traverse pas la foule), à 100–225 m du rassemblement, hors du
 * parcours et sans manifestant à 40 m ; cap des véhicules vers le rassemblement. null si rien ne convient.
 */
export function approachSpot(
  ctx: GameContext, x: number, z: number, fromX: number, fromZ: number, route: ArrayLike<number>,
): { x: number; z: number; heading: number } | null {
  const world = ctx.world;
  if (world.edgeCount === 0) return null;
  const base = Math.atan2(fromX - x, fromZ - z);
  for (const d of APPROACH) {
    for (const turn of APPROACH_TURN) {
      const a = base + turn;
      const cx = x + Math.sin(a) * d;
      const cz = z + Math.cos(a) * d;
      if (!world.nearestRoad(cx, cz, approachRoad, 30) || approachRoad.width < 6) continue;
      const e = world.edge(approachRoad.edgeId);
      if (e.pedestrianOnly || e.bridge || approachRoad.roadClass === 'footway' || approachRoad.roadClass === 'pedestrian') continue;
      const px = approachRoad.x, pz = approachRoad.z;
      if (Math.hypot(px - x, pz - z) < APPROACH_NEAREST) continue;
      if (distanceToRoute(route, px, pz) < APPROACH_ROUTE_CLEAR) continue;
      if (ctx.people.countIn(px, pz, APPROACH_CROWD_CLEAR, isProtester as never) > 0) continue;
      if (!world.isFree(px, pz, 1.4)) continue;
      // le long de la voie, nez vers le rassemblement
      let h = approachRoad.heading;
      if (Math.sin(h) * (x - px) + Math.cos(h) * (z - pz) < 0) h += Math.PI;
      return { x: px, z: pz, heading: Math.atan2(Math.sin(h), Math.cos(h)) };
    }
  }
  return null;
}

/**
 * Engage une compagnie de CRS en cours de partie sur un point (rassemblement, cortège) : créée à bord de ses
 * fourgons sur la chaussée devant la base de service la plus proche, confiée à un commandant IA, puis en colonne
 * jusqu'à une chaussée du côté d'où elle arrive, à l'écart de la foule et de son parcours (`route`) ; elle y débarque
 * et se met en ligne face au rassemblement. Sans chaussée libre à la base, ou sans convoi possible, elle est mise en
 * place directement à l'écart du rassemblement. null si le service des unités manque.
 */
export function dispatchCompany(
  ctx: GameContext, x: number, z: number, route: ArrayLike<number>, sections: number, rand: () => number,
): DispatchedCompany | null {
  const units = ctx.service<UnitsLike>('police.units');
  if (!units || typeof units.createCompany !== 'function') return null;
  const command = ctx.service<CommandLike>('police.command');
  ctx.people.rebuildIndex();
  const base = nearestServiceBase(x, z);
  const spot = { x: 0, z: 0, heading: 0 };
  const park = approachSpot(ctx, x, z, base.x, base.z, route);
  const atBase = typeof command?.arrive === 'function' && park !== null
    && (roadSpot(ctx, base.x, base.z, 60, 4, spot) || roadSpot(ctx, base.x, base.z, 20, 3, spot));
  const n = Math.max(1, Math.min(4, Math.round(sections)));
  if (atBase && park) {
    const company = units.createCompany({ x: spot.x, z: spot.z, heading: spot.heading, sections: n, layout: 'embarque', vehicles: true, drivers: true, cellular: false });
    const id = company.squad.id;
    engageCellular(ctx, units, id, spot.x, spot.z, spot.heading, true);
    // la ligne se forme 15 m devant les véhicules, face au rassemblement
    const lx = park.x + Math.sin(park.heading) * 15;
    const lz = park.z + Math.cos(park.heading) * 15;
    const lh = Math.atan2(x - lx, z - lz);
    command!.assume(id, { base: { x: spot.x, z: spot.z } });
    const convoy = command!.arrive!(id, { x: park.x, z: park.z, heading: park.heading, layout: 'file', lineX: lx, lineZ: lz, lineHeading: lh });
    ctx.people.rebuildIndex();
    return { companyId: id, name: company.squad.name ?? 'Compagnie', stand: { x: lx, z: lz, heading: lh, facing: '' }, base: base.name, convoy };
  }
  const stand = chooseStandOffCrowd(ctx, x, z, route, isProtester) ?? chooseStand(ctx, x, z, rand);
  const company = units.createCompany({ x: stand.x, z: stand.z, heading: stand.heading, sections: n, layout: 'ligne', vehicles: true, drivers: true, cellular: false });
  const id = company.squad.id;
  engageCellular(ctx, units, id, stand.x, stand.z, stand.heading, false);
  if (command) command.assume(id, { base: { x: stand.x, z: stand.z } });
  ctx.people.rebuildIndex();
  return { companyId: id, name: company.squad.name ?? 'Compagnie', stand, base: base.name, convoy: false };
}

export class ManifestationsForcesSystem implements GameSystem {
  readonly id = SESSION_MANIFS_SYSTEM_ID;
  readonly order = SystemOrder.RULES - 99;
  private ctx!: GameContext;
  private readonly offs: Unsubscribe[] = [];
  /** Compagnies engagées sur les manifestations supplémentaires (identifiant de manifestation → compagnie). */
  readonly companies = new Map<number, number>();
  /** Résumé de la mise en place reçu, en attente des manifestations (mises en place sur le même événement). */
  private pending: SessionSetupSummary | null = null;
  private pendingUntil = 0;
  /** Résumé de la mise en place de la session ; null tant qu'elle n'est pas faite. */
  private setup: SessionSetupSummary | null = null;
  /** Engagements différés : manifestations nées en cours de partie (identifiant → instant d'engagement). */
  private readonly deferred = new Map<number, number>();
  private deferRng: { next(): number } | null = null;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
  }

  init(ctx: GameContext): void {
    this.offs.push(ctx.events.onAny(SESSION_SETUP_EVENT, (payload) => {
      this.pending = payload as SessionSetupSummary;
      this.setup = this.pending;
      this.pendingUntil = ctx.clock.now + 5;
      this.onSetup(this.pending);
    }));
    this.offs.push(ctx.events.onAny('crowd:manif', (payload) => this.onManif(payload as ManifEventLike)));
  }

  reset(): void {
    this.companies.clear();
    this.pending = null;
    this.setup = null;
    this.deferred.clear();
    this.deferRng = null;
  }

  /** Les manifestations peuvent être mises en place après la compagnie du joueur (ordre des abonnements) : on réessaie. */
  update(): void {
    if (this.deferred.size > 0) this.engageDeferred();
    const s = this.pending;
    if (!s) return;
    if (this.ctx.clock.now > this.pendingUntil) {
      this.pending = null;
      return;
    }
    this.onSetup(s);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** Les forces de la session sont-elles engageables sur une manifestation supplémentaire ? */
  private allowed(summary: SessionSetupSummary | null): boolean {
    const ctx = this.ctx;
    const config = ctx.session.config;
    if (!config || !summary || !summary.usedPoliceUnits) return false;
    if ((config.extra ?? {})['manifestations.compagnies'] === false) return false;
    const units = ctx.service<UnitsLike>('police.units');
    return !!units && typeof units.createCompany === 'function';
  }

  private sections(m: ManifLike): number {
    const wanted = Number((this.ctx.session.config?.extra ?? {})['manifestations.sections']);
    return Number.isFinite(wanted) && wanted > 0 ? Math.max(1, Math.min(4, Math.round(wanted))) : sectionsFor(m.declared);
  }

  private onSetup(summary: SessionSetupSummary): void {
    const ctx = this.ctx;
    const manifs = ctx.service<ManifsLike>('crowd.manifs');
    if (!manifs || manifs.list.length === 0) return;
    this.pending = null;
    if (!this.allowed(summary)) return;
    const units = ctx.service<UnitsLike>('police.units')!;
    const command = ctx.service<CommandLike>('police.command');
    const rng = ctx.rng.fork('session.manifestations');
    for (const m of manifs.list) {
      if (m.phase === 'terminee' || this.companies.has(m.id) || this.deferred.has(m.id)) continue;
      try {
        ctx.people.rebuildIndex();
        const stand = chooseStandOffCrowd(ctx, m.x, m.z, m.route, isProtester) ?? chooseStand(ctx, m.x, m.z, () => rng.next());
        const sections = this.sections(m);
        const company = units.createCompany!({ x: stand.x, z: stand.z, heading: stand.heading, sections, layout: 'ligne', vehicles: true, drivers: true, cellular: false });
        const id = company.squad.id;
        engageCellular(ctx, units, id, stand.x, stand.z, stand.heading, false);
        this.companies.set(m.id, id);
        manifs.assign(m.id, id);
        if (command) {
          command.assume(id, { base: { x: stand.x, z: stand.z } });
          if (typeof command.assignCortege === 'function') command.assignCortege(id, m);
        }
        const name = company.squad.name ?? 'Compagnie';
        ctx.radio.say({
          channel: 'commandement', from: 'CENTRAL', priority: 1,
          text: `CENTRAL : ${name} est engagée sur la manifestation « ${m.causeLabel.toLowerCase()} », ${m.from.charAt(0).toLowerCase() + m.from.slice(1)}. ${sections} section${sections > 1 ? 's' : ''}.`,
        });
      } catch (err) {
        console.error('[session] compagnie pour la manifestation ' + m.id + ' impossible', err);
      }
    }
    ctx.people.rebuildIndex();
  }

  // ───────────────────────────── manifestations nées en cours de partie ─────────────────────────────

  /**
   * Annonce d'une manifestation : après la mise en place de la session (et une fois les manifestations prévues prises
   * en charge par onSetup), c'est une manifestation née en cours de partie — une compagnie lui est promise.
   */
  private onManif(e: ManifEventLike): void {
    const ctx = this.ctx;
    // (mise en place pas encore faite, ou en attente des manifestations prévues : c'est onSetup qui les prend)
    if (!ctx || !e || e.state !== 'annonce' || this.setup === null || this.pending !== null) return;
    if (this.companies.has(e.id) || this.deferred.has(e.id)) return;
    // vacation de patrouille : c'est l'équipage du joueur qui demande une compagnie en renfort
    if (readVacation(ctx.session.config)) return;
    if (!this.allowed(this.setup)) return;
    if (this.deferRng === null) this.deferRng = ctx.rng.fork('session.manifestations:differe');
    const delay = DEFERRED_MIN + (DEFERRED_MAX - DEFERRED_MIN) * this.deferRng.next();
    this.deferred.set(e.id, ctx.clock.now + delay);
  }

  private engageDeferred(): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    const manifs = ctx.service<ManifsLike>('crowd.manifs');
    for (const [id, at] of this.deferred) {
      if (now < at) continue;
      this.deferred.delete(id);
      const m = manifs ? manifs.list.find((q) => q.id === id) : undefined;
      // déjà finie, ou une compagnie l'a prise entre-temps (rattachée par le joueur ou un autre module)
      if (!m || !manifs || m.phase === 'terminee' || m.phase === 'dispersion' || this.companies.has(id) || m.companyId !== 0) continue;
      if (!this.allowed(this.setup)) continue;
      try {
        const rng = this.deferRng;
        const sections = this.sections(m);
        const sent = dispatchCompany(ctx, m.x, m.z, m.route, sections, () => (rng ? rng.next() : 0.5));
        if (!sent) continue;
        this.companies.set(id, sent.companyId);
        manifs.assign(id, sent.companyId);
        const command = ctx.service<CommandLike>('police.command');
        if (command && typeof command.assignCortege === 'function') command.assignCortege(sent.companyId, m);
        const what = m.sauvage === true ? 'le cortège sauvage' : `la manifestation « ${m.causeLabel.toLowerCase()} »`;
        const from = m.from.charAt(0).toLowerCase() + m.from.slice(1);
        ctx.radio.say({
          channel: 'commandement', from: 'CENTRAL', priority: 1,
          text: `CENTRAL : ${sent.name} est engagée sur ${what}, ${from}. ${sections} section${sections > 1 ? 's' : ''}, ${sent.convoy ? 'départ ' + baseWords(sent.base) : 'en place'}.`,
        });
      } catch (err) {
        console.error('[session] compagnie pour la manifestation ' + id + ' impossible', err);
      }
    }
  }
}

/** « de la caserne de la Cité », « du commissariat du 9e arrondissement ». */
function baseWords(name: string): string {
  return /^commissariat/.test(name) ? 'du ' + name : /^caserne/.test(name) ? 'de la ' + name : 'de ' + name;
}
