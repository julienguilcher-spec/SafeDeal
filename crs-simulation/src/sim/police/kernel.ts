/* =====================================================================================
 * FORCES DE L'ORDRE — noyau partagé par les fichiers du module : contexte, réglages, aléa,
 * services facultatifs des autres modules (résolus par ctx.service, jamais importés), objets
 * de travail réutilisés, zones dangereuses, réserves des véhicules.
 * ===================================================================================== */

import type {
  AimSolution, EntityId, GameContext, ItemId, Person, Prop, RadioChannel, RayHit, Rng, RoadSample, SquadOrder, Vec2, Vehicle,
} from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { LawAdvisor, LawHandover } from '@/gameplay/law/api';
import type { PeopleGearApi, PeopleHealthApi, PeopleLocomotionApi } from '@/sim/people/api';
import type { AutopilotApi } from '@/sim/vehicles/api';
import type { PoliceTuning, VehicleReserve } from './api';
import type { Agent, Unit } from './brain';
import { RESERVE_FOURGON, RESERVE_NONE, defaultTuning } from './tuning';

/** Zone à éviter (nappe de feu, engin incendiaire qui arrive). */
export interface Danger {
  x: number;
  z: number;
  r: number;
  /** Instant avant lequel la zone est gardée quoi qu'il arrive, puis tant que le feu dure. */
  until: number;
  fire: boolean;
}

export class Kernel {
  ctx!: GameContext;
  tuning: PoliceTuning = defaultTuning();
  rng!: Rng;
  now = 0;
  dt = 0;

  /** Toutes les unités de police connues, et celles qui dirigent une formation. */
  readonly units: Unit[] = [];
  readonly roots: Unit[] = [];
  /** Empreinte de l'arborescence des unités (détection des changements). */
  treeSig = -1;
  treeAt = -1;

  // ── services facultatifs ──
  loco: PeopleLocomotionApi | undefined;
  gear: PeopleGearApi | undefined;
  healthExt: PeopleHealthApi | undefined;
  advisor: LawAdvisor | undefined;
  autopilot: AutopilotApi | undefined;

  // ── objets de travail ──
  readonly hit: RayHit = makeRayHit();
  readonly v2: Vec2 = { x: 0, z: 0 };
  readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  readonly aim: AimSolution = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };
  readonly people: Person[] = [];
  readonly people2: Person[] = [];
  readonly props: Prop[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly pathTmp: number[] = [];
  readonly agentsTmp: Agent[] = [];
  readonly agentsTmp2: Agent[] = [];

  readonly dangers: Danger[] = [];
  readonly reserves = new Map<EntityId, VehicleReserve>();
  /** Indicatifs de compagnie déjà attribués pendant la session. */
  callsigns = 0;
  /** Le commandant (autorité habilitée, écharpe), s'il est connu : sa présence à pied soutient le moral des unités proches. */
  commander: Person | null = null;
  /**
   * Point d'extension du commandement (src/sim/police/command) : une unité spéciale (BRAV-M en selle, Centaure,
   * engin lanceur d'eau, drone) exécute elle-même certains ordres. Appelé à la réception de chaque ordre, avant
   * tout traitement ; retourner true pour le prendre en charge (le module ne fait alors rien de cet ordre).
   */
  orderHook: ((u: Unit, o: SquadOrder) => boolean) | null = null;

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng.fork('police');
  }

  /** Résout les services facultatifs (appelé à l'initialisation et au début de chaque session). */
  resolve(): void {
    const ctx = this.ctx;
    this.loco = ctx.service<PeopleLocomotionApi>('people.locomotion');
    this.gear = ctx.service<PeopleGearApi>('people.gear');
    this.healthExt = ctx.service<PeopleHealthApi>('people.health');
    this.advisor = ctx.service<LawAdvisor>('law.advisor');
    this.autopilot = ctx.service<AutopilotApi>('vehicles.autopilot');
  }

  reset(): void {
    this.units.length = 0;
    this.roots.length = 0;
    this.treeSig = -1;
    this.treeAt = -1;
    this.dangers.length = 0;
    this.reserves.clear();
    this.callsigns = 0;
    this.commander = null;
    this.now = 0;
    Object.assign(this.tuning, defaultTuning());
    this.rng = this.ctx.rng.fork('police');
    this.resolve();
  }

  handover(): LawHandover | undefined {
    return this.ctx.service<LawHandover>('law.handover');
  }

  /** Message radio d'une unité (personne qui parle : son chef). */
  say(from: Unit, text: string, priority: 0 | 1 | 2 = 1, channel: RadioChannel = 'unite'): void {
    const leader = from.squad.leaderId;
    this.ctx.radio.say({ channel, from: from.squad.name, text, priority, personId: leader !== 0 ? leader : undefined, voice: from.id % 7 });
  }

  emit(name: string, payload: unknown): void {
    this.ctx.events.emitAny(name, payload);
  }

  /** Nombre d'unités d'un objet dans l'inventaire (sans passer par le service : boucle chaude). */
  count(p: Person, id: ItemId): number {
    const inv = p.inventory;
    for (let i = 0; i < inv.length; i++) if (inv[i].id === id) return inv[i].count;
    return 0;
  }

  /** Objet en main (identifiant) ou ''. */
  held(p: Person): ItemId | '' {
    const s = p.active >= 0 ? p.inventory[p.active] : undefined;
    return s ? s.id : '';
  }

  /** Vue dégagée entre deux points (bâti seulement). */
  sight(ax: number, az: number, bx: number, bz: number): boolean {
    return this.ctx.world.lineOfSight(ax, az, bx, bz);
  }

  /** Réserve de munitions d'un véhicule (créée d'après son type). */
  reserveOf(v: Vehicle | undefined): VehicleReserve | null {
    if (!v || v.faction !== 'police') return null;
    let r = this.reserves.get(v.id);
    if (!r) {
      const base = v.kind === 'fourgon_crs' || v.kind === 'vl_commandement' || v.kind === 'car_crs' ? RESERVE_FOURGON : RESERVE_NONE;
      r = { vehicleId: v.id, ...base };
      this.reserves.set(v.id, r);
    }
    return r;
  }

  /** Ajoute une zone à éviter (fusionnée avec une zone voisine). */
  addDanger(x: number, z: number, r: number, seconds: number, fire: boolean): void {
    const list = this.dangers;
    const until = this.now + seconds;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const dx = d.x - x;
      const dz = d.z - z;
      if (dx * dx + dz * dz < 2.25) {
        if (until > d.until) d.until = until;
        if (r > d.r) d.r = r;
        d.fire = d.fire || fire;
        return;
      }
    }
    if (list.length < 48) list.push({ x, z, r, until, fire });
  }

  /** Retire les zones éteintes. */
  pruneDangers(): void {
    const list = this.dangers;
    const hz = this.ctx.hazards;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (this.now < d.until) continue;
      if (d.fire && hz.fireAt(d.x, d.z) > 0.05 && this.now < d.until + 90) continue;
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

/** Personne valide et libre de ses mouvements, à pied. */
export function isAble(ctx: GameContext, p: Person): boolean {
  return !p.dormant && p.health > 0 && p.posture !== 'down' && p.custody === 'free' && p.heldBy === 0
    && p.injury !== 'dead' && p.injury !== 'critical' && p.injury !== 'serious' && !ctx.health.isIncapacitated(p);
}
