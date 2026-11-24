/* =====================================================================================
 * COMMANDEMENT — noyau partagé par les fichiers du dossier : contexte, réglages, aléa, services
 * facultatifs des autres modules (résolus par ctx.service, jamais importés), objets de travail
 * réutilisés, outils communs (ordres, radio, véhicules d'une unité, filtres de personnes).
 *
 * Tout service peut manquer : chaque appelant teste sa présence et se rabat sur ce qui existe.
 * ===================================================================================== */

import type {
  EntityId, GameContext, OrderType, Person, Prop, RadioChannel, RayHit, Rng, RoadSample, Squad, SquadOrder, Vec2, Vec3, Vehicle,
} from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, MetroApi, RescueApi, TrafficControlApi } from '@/core/extensions';
import { makeRayHit } from '@/core/null-services';
import type { LawAdvisor, LawConfig, LawHandover } from '@/gameplay/law/api';
import type { CrowdCoreApi } from '@/sim/crowd/api';
import type { AutopilotApi, VehiclesExtApi } from '@/sim/vehicles/api';
import type { PoliceFormationApi, PoliceStatusApi, PoliceUnitsApi } from '../api';
import { POLICE_FORMATION_SERVICE, POLICE_KERNEL_SERVICE, POLICE_STATUS_SERVICE, POLICE_UNITS_SERVICE } from '../api';
import { unitOf } from '../brain';
import type { Kernel } from '../kernel';
import { isAckText, replyFlag } from '../radio';
import { COMMAND_DECISION_EVENT, CROWD_SIGNALS_SERVICE } from './api';
import type { CommandDecision, CommandTuning, CrowdSignalsLike } from './api';

/**
 * Réglages par défaut. Sources : docs/research/00-bible-realisme.md §E.8 (BRAV-M : arrêt à 40–80 m, 30 à
 * 50 km/h ; progression derrière le Centaure à 6 km/h), docs/research/06-roles-jouables.md §6.3 (20 km/h
 * à moins de 30 m de piétons), §7.3 (poussée à 5–8 km/h), §8.2 (engin 10–15 m derrière la ligne, jet droit
 * interdit à moins de 15 m), §9.3 (drone entre 30 et 120 m, bourdonnement sous 80 m).
 */
export function defaultCommandTuning(): CommandTuning {
  return {
    autoAssume: true,
    aptitude: 0.75,
    adjointInterval: 20,
    thinkInterval: 1,
    horizon: 320,
    liftBehind: 60,
    reactHeat: 0.9,
    megaphoneRange: 45,
    bravmStandoff: 60,
    bravmSpeed: 11,
    bravmSlow: 5.5,
    centaurePace: 1.67,
    centaurePush: 1.8,
    canonBehind: 12,
    canonLow: 0.12,
    canonMinStraight: 15,
    droneAltitude: 60,
    droneOrbit: 25,
    convoyGap: 6,
    convoySpeed: 8.3,
  };
}

export const isProtester = (p: Person): boolean => p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down' && p.vehicleId === 0;
export const isPoliceOnFoot = (p: Person): boolean => p.faction === 'police' && p.vehicleId === 0 && p.posture !== 'down';
export const notPolice = (p: Person): boolean => p.faction !== 'police' && p.vehicleId === 0;

export class CommandCore {
  ctx!: GameContext;
  rng!: Rng;
  now = 0;
  dt = 0;
  readonly tuning: CommandTuning = defaultCommandTuning();

  /** Noyau du module de police (null s'il n'est pas branché : aucune unité à commander). */
  pk: Kernel | null = null;
  status: PoliceStatusApi | undefined;
  formation: PoliceFormationApi | undefined;
  units: PoliceUnitsApi | undefined;
  autopilot: AutopilotApi | undefined;
  vext: VehiclesExtApi | undefined;
  advisor: LawAdvisor | undefined;
  lawConfig: LawConfig | undefined;
  incidents: IncidentsApi | undefined;
  traffic: TrafficControlApi | undefined;
  metro: MetroApi | undefined;
  rescue: RescueApi | undefined;
  crowd: CrowdCoreApi | undefined;
  signals: CrowdSignalsLike | undefined;

  // ── objets de travail ──
  readonly hit: RayHit = makeRayHit();
  readonly v2: Vec2 = { x: 0, z: 0 };
  readonly v3: Vec3 = { x: 0, y: 0, z: 0 };
  readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  readonly people: Person[] = [];
  readonly people2: Person[] = [];
  readonly props: Prop[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly path: number[] = [];

  /** Journal des décisions du commandant IA (borné). */
  readonly decisions: CommandDecision[] = [];
  /**
   * Unités retenues par le script de mission pour l'objectif du joueur exécutant (CommandApi.pin) : le commandant IA
   * ne les emploie plus (ni emplacement, ni tâche, ni réserve).
   */
  readonly pinned = new Set<number>();

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng.fork('police.command');
  }

  /** Résout les services facultatifs (initialisation, début de session). */
  resolve(): void {
    const ctx = this.ctx;
    this.pk = ctx.service<Kernel>(POLICE_KERNEL_SERVICE) ?? null;
    this.status = ctx.service<PoliceStatusApi>(POLICE_STATUS_SERVICE);
    this.formation = ctx.service<PoliceFormationApi>(POLICE_FORMATION_SERVICE);
    this.units = ctx.service<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    this.autopilot = ctx.service<AutopilotApi>('vehicles.autopilot');
    this.vext = ctx.service<VehiclesExtApi>('vehicles.ext');
    this.advisor = ctx.service<LawAdvisor>('law.advisor');
    this.lawConfig = ctx.service<LawConfig>('law.config');
    this.incidents = ctx.service<IncidentsApi>(EXT.incidents);
    this.traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    this.metro = ctx.service<MetroApi>(EXT.metro);
    this.rescue = ctx.service<RescueApi>(EXT.rescue);
    this.crowd = ctx.service<CrowdCoreApi>('crowd.core');
    this.signals = ctx.service<CrowdSignalsLike>(CROWD_SIGNALS_SERVICE);
  }

  reset(): void {
    Object.assign(this.tuning, defaultCommandTuning());
    this.rng = this.ctx.rng.fork('police.command');
    this.now = 0;
    this.decisions.length = 0;
    this.pinned.clear();
    this.resolve();
  }

  handover(): LawHandover | undefined {
    return this.ctx.service<LawHandover>('law.handover');
  }

  // ───────────────────────────── radio, journal ─────────────────────────────

  say(from: string, text: string, priority: 0 | 1 | 2 = 1, channel: RadioChannel = 'commandement', personId: EntityId = 0): void {
    // accusé ou refus d'un ordre que le joueur vient de donner (BRAV-M, engins, drone) : en priorité sur le réseau du
    // commandement, la même règle que kernel.say (sim/police/radio.ts replyFlag)
    let reply = false;
    if (isAckText(text)) {
      const list = this.ctx.squads.list;
      for (let i = 0; i < list.length && !reply; i++) if (list[i]!.name === from) reply = replyFlag(list[i]!.order, this.ctx.clock.now, text);
    }
    this.ctx.radio.say({
      channel: reply ? 'commandement' : channel, from, text, priority, personId: personId !== 0 ? personId : undefined,
      ...(reply ? { reply: true } : {}),
    });
  }

  /** Nom de secteur pour la radio ('' si inconnu). */
  sector(x: number, z: number): string {
    const s = this.ctx.world.sectorName(x, z);
    return s && s !== 'secteur inconnu' ? s : '';
  }

  /** Inscrit une décision du commandant IA au journal et l'annonce par événement. */
  decide(squadId: number, key: string, text: string, unitId: number, order: OrderType | '', x: number, z: number): void {
    const d: CommandDecision = { t: this.now, squadId, key, text, unitId, order, x, z };
    const list = this.decisions;
    if (list.length >= 400) list.splice(0, 100);
    list.push(d);
    this.ctx.events.emitAny(COMMAND_DECISION_EVENT, d);
  }

  // ───────────────────────────── unités ─────────────────────────────

  /**
   * Proposition de l'adjoint acceptée par le joueur (adjoint.ts accept) : les ordres donnés pendant son exécution sont
   * les siens (SquadOrder.byPlayer), comme ceux de sa carte.
   */
  asPlayer = false;

  /** Donne un ordre ; retourne l'objet d'ordre posé dans le magasin (pour le reconnaître ensuite), ou null. */
  issue(squadId: number, order: Partial<SquadOrder> & { type: OrderType }): SquadOrder | null {
    const squad = this.ctx.squads.get(squadId);
    if (!squad) return null;
    this.ctx.squads.issue(squadId, this.asPlayer ? { ...order, byPlayer: true } : order);
    return squad.order;
  }

  leader(squad: Squad | undefined): Person | null {
    if (!squad || squad.leaderId === 0) return null;
    return this.ctx.people.get(squad.leaderId) ?? null;
  }

  /** Centre de l'unité (état publié par la police, sinon son chef, sinon son premier membre) dans v2 ; false si inconnu. */
  centerOf(squadId: number): boolean {
    const st = this.status ? this.status.of(squadId) : null;
    if (st && st.total > 0 && (st.x !== 0 || st.z !== 0)) {
      this.v2.x = st.x;
      this.v2.z = st.z;
      return true;
    }
    const squad = this.ctx.squads.get(squadId);
    const lead = this.leader(squad);
    if (lead) {
      this.v2.x = lead.x;
      this.v2.z = lead.z;
      return true;
    }
    const n = this.members(squadId, this.people2);
    if (n > 0) {
      this.v2.x = this.people2[0].x;
      this.v2.z = this.people2[0].z;
      return true;
    }
    return false;
  }

  /** Membres de l'unité et de sa descendance. */
  members(squadId: number, out: Person[]): number {
    out.length = 0;
    this.collectMembers(this.ctx.squads.get(squadId), out, 0);
    return out.length;
  }

  private collectMembers(s: Squad | undefined, out: Person[], depth: number): void {
    if (!s || depth > 8) return;
    const ctx = this.ctx;
    for (let i = 0; i < s.members.length; i++) {
      const p = ctx.people.get(s.members[i]);
      if (p) out.push(p);
    }
    const kids = ctx.squads.childrenOf(s.id);
    for (let i = 0; i < kids.length; i++) this.collectMembers(kids[i], out, depth + 1);
  }

  /** Véhicules de l'unité et de sa descendance (Squad.vehicleId et véhicules supplémentaires connus de la police). */
  fleet(squadId: number, out: Vehicle[]): number {
    out.length = 0;
    this.collectFleet(this.ctx.squads.get(squadId), out, 0);
    return out.length;
  }

  private collectFleet(s: Squad | undefined, out: Vehicle[], depth: number): void {
    if (!s || depth > 8) return;
    const ctx = this.ctx;
    const add = (id: EntityId): void => {
      const v = id !== 0 ? ctx.vehicles.get(id) : undefined;
      if (v && out.indexOf(v) < 0) out.push(v);
    };
    add(s.vehicleId);
    const u = unitOf(s);
    if (u) for (let i = 0; i < u.extraVehicles.length; i++) add(u.extraVehicles[i]);
    const kids = ctx.squads.childrenOf(s.id);
    for (let i = 0; i < kids.length; i++) this.collectFleet(kids[i], out, depth + 1);
  }

  /** L'unité `id` est-elle `ancestor` ou l'une de ses descendantes ? */
  isUnder(id: number, ancestor: number): boolean {
    const squads = this.ctx.squads;
    let s = squads.get(id);
    for (let guard = 0; s && guard < 12; guard++) {
      if (s.id === ancestor) return true;
      s = s.parentId !== 0 ? squads.get(s.parentId) : undefined;
    }
    return false;
  }

  /** Véhicule utilisable (ni épave, ni en feu). */
  usable(v: Vehicle | undefined): v is Vehicle {
    return !!v && (v.state === 'ok' || v.state === 'damaged');
  }

  /** Portée intelligible d'un mégaphone d'après le droit (60 m par défaut). */
  megaphoneReach(): number {
    return this.lawConfig ? this.lawConfig.megaphoneRange : 60;
  }
}
