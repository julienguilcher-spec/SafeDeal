/* =====================================================================================
 * ENGINS — un véhicule en mission ne reste pas planté devant la foule ; les blindés sont toujours escortés.
 *
 * Demandes du commanditaire : « je donne un ordre de déplacement au Centaure et il me dit qu'il est bloqué par la
 * foule : il faut qu'il soit intelligent, qu'il contourne ou qu'il rentre dans le barrage » ; « déploie des unités
 * autour des véhicules blindés, Centaure ou canon à eau, pour toujours les protéger si les black blocs attaquent ».
 *
 *   dégagement   un véhicule de police qui roule sous pilote automatique (ordre, colonne) et que des personnes
 *                arrêtent : avertisseur et deux tons, la foule devant lui s'écarte (module de foule : stir) ; s'il
 *                reste arrêté, nouvel itinéraire ; un engin à lame (Centaure) pousse barricades et objets ;
 *   escorte      chaque Centaure et chaque canon à eau a un groupe à pied qui le protège (ordre « protéger » sur le
 *                véhicule : écran autour de lui, qui le suit) — pris parmi les groupes libres les plus proches,
 *                jamais retiré d'une manœuvre en cours ; un escorteur parti ailleurs est remplacé.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';

interface Autopilot {
  status(v: Vehicle): Readonly<{ mode: string; state: string; reason: string; blockedFor: number; remaining: number; leaderId?: number }>;
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean; speed?: number; stopBefore?: number; pushThrough?: boolean }): boolean;
  reroute?(v: Vehicle, pushThrough?: boolean): boolean;
  follow?(v: Vehicle, leaderId: EntityId, distance?: number): boolean;
  stop?(v: Vehicle): void;
  isActive?(v: Vehicle): boolean;
}
interface CrowdCore {
  stir(x: number, z: number, radius: number, fear: number, anger: number): number;
}
interface VehiclesExt {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  horn?(v: Vehicle, seconds: number): void;
}
/** Vue minimale du service 'traffic' (src/sim/traffic) : faire dégager un automobiliste. */
interface TrafficLike {
  motorist(v: Vehicle): { mode: string } | null;
  clearOff(v: Vehicle, byId: EntityId): string;
}

const ARMORED: ReadonlySet<string> = new Set(['centaure', 'canon_eau']);
/** Ordres d'un groupe qu'on peut prendre pour escorter (il n'est engagé dans rien). */
const FREE_ORDERS: ReadonlySet<string> = new Set(['libre', 'tenir', 'cesser', 'suivre']);
const ESCORT_RANGE = 400;
const THINK = 1;
const ESCORT_THINK = 8;
/** Arrêté par des personnes depuis : on dégage (s), on cherche un autre itinéraire (s). */
const CLEAR_AFTER = 2.5;
const REROUTE_AFTER = 12;
/** Arrêté par un véhicule depuis : on le fait se ranger (s). */
const VEHICLE_AFTER = 5;
/**
 * Arrêté par une voiture civile immobile depuis : elle est dégagée, hors de la vue du joueur (s). Dernier recours : un
 * engin en intervention la contourne (pilote automatique) bien avant.
 */
const CIVIL_AFTER = 40;
/** Bloqué contre un mur ou un obstacle fixe depuis : nouvel itinéraire, puis marche arrière (s). */
const WALL_AFTER = 12;
/** Coincé depuis (s), hors de vue du joueur (m) : replacé plus loin sur l'itinéraire (m). */
const STUCK_SKIP = 50;
const UNSEEN_DIST = 300;
const SKIP_DIST = 30;
/** Progression minimale attendue (m) sur la fenêtre (s). */
const PROGRESS_MIN = 15;
const PROGRESS_WINDOW = 60;

/** Service de lecture des interventions du filet de sécurité (tests, débogage). */
export const ENGINS_SERVICE = 'session.engins';

/**
 * Compteurs des interventions de dernier recours (véhicule replacé hors de la vue du joueur, reculé d'office, voiture
 * civile retirée). La conduite normale ne doit pas en avoir besoin : un banc d'essai exige qu'ils restent à zéro.
 */
export interface EnginsStats {
  /** Véhicule coincé replacé derrière son chef de file. */
  unstickFollow: number;
  /** Véhicule replacé plus loin sur son itinéraire (coincé, sans progrès, ou contre un mur). */
  skipAhead: number;
  /** Véhicule reculé d'office de quelques mètres contre un mur. */
  wallNudge: number;
  /** Voiture civile immobile retirée de la chaussée. */
  civilRemoved: number;
  /** Détail des replacements (identifiant, motif, position, instant). */
  readonly log: { id: number; kind: string; why: string; x: number; z: number; t: number }[];
}

export interface EnginsApi {
  readonly stats: EnginsStats;
}

interface Blocked {
  since: number;
  rerouted: boolean;
  hornAt: number;
  /** Premier blocage de la série (s). */
  firstAt: number;
}

export class EnginsSystem implements GameSystem {
  readonly id = 'session.engins';
  readonly order = SystemOrder.CONTROL + 48;

  private ctx: GameContext | null = null;
  private readonly near: Vehicle[] = [];
  private nextThink = 0;
  private nextEscort = 0;
  private readonly blocked = new Map<EntityId, Blocked>();
  /** Véhicule blindé → groupe qui l'escorte. */
  private readonly escorts = new Map<EntityId, number>();
  private readonly target = new Map<EntityId, { x: number; z: number }>();
  /** Engin escorté à l'arrêt depuis (s). */
  private readonly stillSince = new Map<EntityId, number>();
  /** Suivi de la progression des véhicules sous pilote automatique. */
  private readonly progress = new Map<EntityId, { remaining: number; at: number }>();
  /**
   * Engins qui reculent de quelques mètres pour laisser manœuvrer l'automobiliste qu'ils font dégager (collés à son
   * pare-chocs, ils l'enfermaient) : fin du recul, position de départ, conduite à reprendre (destination ou meneur).
   */
  private readonly backoff = new Map<EntityId, { until: number; x: number; z: number; mode: string; leaderId: number; tx: number; tz: number }>();

  readonly stats: EnginsStats = { unstickFollow: 0, skipAhead: 0, wallNudge: 0, civilRemoved: 0, log: [] };

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(ENGINS_SERVICE, { get stats() { return self.stats; } } satisfies EnginsApi);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  /** Consigne une intervention de dernier recours. */
  private note(v: Vehicle, field: 'unstickFollow' | 'skipAhead' | 'wallNudge' | 'civilRemoved', why: string): void {
    this.stats[field]++;
    const log = this.stats.log;
    if (log.length < 200) log.push({ id: v.id, kind: v.kind, why: `${field}:${why}`, x: Math.round(v.x), z: Math.round(v.z), t: Math.round(this.ctx ? this.ctx.clock.now : 0) });
  }

  reset(): void {
    this.stats.unstickFollow = 0;
    this.stats.skipAhead = 0;
    this.stats.wallNudge = 0;
    this.stats.civilRemoved = 0;
    this.stats.log.length = 0;
    this.nextThink = 0;
    this.nextEscort = 0;
    this.blocked.clear();
    this.escorts.clear();
    this.target.clear();
    this.stillSince.clear();
    this.progress.clear();
    this.backoff.clear();
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.session.phase !== 'playing') return;
    const now = ctx.clock.now;
    if (this.backoff.size > 0) this.backoffStep(now);
    if (now >= this.nextThink) {
      this.nextThink = now + THINK;
      this.clearWay(now);
      this.escortsMove(now);
    }
    if (now >= this.nextEscort) {
      this.nextEscort = now + ESCORT_THINK;
      this.keepEscorts();
    }
  }

  // ───────────────────────────── dégagement ─────────────────────────────

  private clearWay(now: number): void {
    const ctx = this.ctx!;
    const ap = ctx.service<Autopilot>('vehicles.autopilot');
    if (!ap) return;
    const crowd = ctx.service<CrowdCore>('crowd.core');
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || v.def.flying || v.seats[0] === 0) continue;
      const st = ap.status(v);
      // filet de sécurité, hors de la vue du joueur : un véhicule coincé depuis longtemps (cour étroite, interblocage
      // entre colonnes au départ de la caserne) est retrouvé derrière son chef de file ou plus loin sur son itinéraire
      if (Math.abs(v.speed) < 0.4 && (st.state === 'attente' || st.state === 'bloque') && st.blockedFor > STUCK_SKIP && this.unseen(v)) {
        if (this.unstick(v, ap, st)) continue;
      }
      // pas de progrès vers le but depuis une minute (va-et-vient devant une station de vélos, un plot…) : même filet
      if (st.mode === 'drive' && this.noProgress(v, st.remaining, now) && this.unseen(v)) {
        const t = this.destinationOf(v, ap);
        if (t && this.skipAhead(v, ap, t, 'sans_progres')) { this.progress.delete(v.id); continue; }
      }
      // (les motos de la BRAV-M ont leur propre conduite de colonne : bravm.ts)
      if (v.kind === 'moto_bravm') continue;
      if (st.mode !== 'drive' && st.mode !== 'follow') { this.blocked.delete(v.id); continue; }
      const stopped = Math.abs(v.speed) < 0.4;
      if ((st.state === 'attente' || st.state === 'bloque') && st.reason === 'vehicule' && stopped && st.blockedFor > VEHICLE_AFTER) {
        this.clearVehicle(v, ap, st.blockedFor);
        continue;
      }
      if ((st.state === 'bloque' || st.state === 'attente') && (st.reason === 'mur' || st.reason === 'obstacle') && stopped && st.blockedFor > WALL_AFTER && st.mode === 'drive') {
        this.clearWall(v, ap, now);
        continue;
      }
      const byPeople = (st.state === 'attente' || st.state === 'bloque') && (st.reason === 'personne' || st.reason === '');
      if (!byPeople || !stopped || st.blockedFor < CLEAR_AFTER) {
        if (Math.abs(v.speed) > 1.5) this.blocked.delete(v.id);
        continue;
      }
      let b = this.blocked.get(v.id);
      if (!b) { b = { since: now, rerouted: false, hornAt: now, firstAt: now }; this.blocked.set(v.id, b); }
      // avertisseur, deux tons : la foule devant l'engin s'écarte
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const ax = v.x + fx * (v.def.length * 0.5 + 4), az = v.z + fz * (v.def.length * 0.5 + 4);
      if (crowd) crowd.stir(ax, az, 6, 0.55, 0.04);
      if (v.def.hasSiren && v.siren === 0) {
        if (ext && ext.setSiren) ext.setSiren(v, 1);
        else v.siren = 1;
      }
      if (now >= b.hornAt) {
        b.hornAt = now + 3;
        ctx.events.emit('sfx', { id: 'klaxon', x: v.x, y: v.y + 1, z: v.z, volume: 1 });
      }
      // toujours arrêté : un autre itinéraire (le Centaure pousse barricades et objets à la lame)
      if (!b.rerouted && now - b.since > REROUTE_AFTER && st.mode === 'drive') {
        const t = this.destinationOf(v, ap);
        if (t) {
          this.reroute(v, ap, t);
          b.rerouted = true;
        }
      }
    }
  }

  /**
   * Arrêté par un autre véhicule (parking de la compagnie, voiture garée) : un engin de police à l'arrêt avec son
   * chauffeur se range (avance de quelques mètres et dégage le passage) ; sinon, nouvel itinéraire (le Centaure pousse).
   */
  private clearVehicle(v: Vehicle, ap: Autopilot, blockedFor: number): void {
    const ctx = this.ctx!;
    const o = obstacleOf(ap, v);
    const ov = o !== 0 ? ctx.vehicles.get(o) : undefined;
    if (ov && ov.faction === 'police' && Math.abs(ov.speed) < 0.3 && ov.seats[0] !== 0) {
      const driver = ctx.people.get(ov.seats[0]!);
      const ost = ap.status(ov);
      if (driver && !driver.isPlayer && ost.mode !== 'drive' && ost.mode !== 'follow' && ost.mode !== 'convoy') {
        // se ranger : quelques mètres de côté et en avant, hors de la trajectoire de l'engin
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const side = (ov.x - v.x) * fz - (ov.z - v.z) * fx >= 0 ? 1 : -1;
        const tx = ov.x + fz * side * 9 + fx * 14, tz = ov.z - fx * side * 9 + fz * 14;
        if (ap.driveTo(ov, tx, tz, { speed: 3, stopBefore: 1 })) return;
      }
    }
    // automobiliste arrêté devant l'engin (autobus trop long pour se ranger, véhicule retenu par la foule) : coup
    // d'avertisseur, et on le fait dégager — il se serre sur le côté, au besoin à cheval sur le trottoir (le contourner
    // ou le retirer hors de la vue du joueur ne suffit pas : le joueur, dans la colonne, restait bloqué derrière lui)
    if (ov && ov.faction !== 'police' && Math.abs(ov.speed) < 0.3) {
      const traffic = ctx.service<TrafficLike>('traffic');
      const m = traffic && typeof traffic.clearOff === 'function' ? traffic.motorist(ov) : null;
      if (traffic && m && m.mode !== 'range') {
        const ext = ctx.service<VehiclesExt>('vehicles.ext');
        if (ext && ext.horn) ext.horn(v, 0.8);
        if (traffic.clearOff(ov, v.id) === 'ok') {
          this.giveRoom(v, ov, ap);
          return;
        }
      } else if (traffic && m && m.mode === 'range') {
        // il manœuvre déjà : on lui laisse la place de reculer
        this.giveRoom(v, ov, ap);
        return;
      }
    }
    if (ov && ov.faction !== 'police' && Math.abs(ov.speed) < 0.3 && blockedFor > CIVIL_AFTER && this.unseen(v) && this.unseen(ov)) {
      // voiture garée en travers (ou abandonnée) : le Centaure la pousse à la lame, sinon elle est dégagée
      const driver = ov.seats[0] !== 0 ? ctx.people.get(ov.seats[0]!) : undefined;
      if (!driver || !driver.isPlayer) {
        if (v.def.canPush) ctx.events.emit('sfx', { id: 'tole', x: ov.x, y: ov.y + 0.5, z: ov.z, volume: 1 });
        this.note(ov, 'civilRemoved', `gene_${v.kind}`);
        ctx.vehicles.remove(ov.id);
        return;
      }
    }
    const b = this.blocked.get(v.id);
    if (blockedFor > REROUTE_AFTER && (!b || !b.rerouted)) {
      const t = this.destinationOf(v, ap);
      if (t && ap.status(v).mode === 'drive') {
        this.reroute(v, ap, t);
        this.blocked.set(v.id, { since: this.ctx!.clock.now, rerouted: true, hornAt: 0, firstAt: this.ctx!.clock.now });
      }
    }
  }

  /**
   * Collé au pare-chocs de l'automobiliste qu'il fait dégager (moins de 4 m) : l'engin recule de quelques mètres, le
   * temps que l'autre manœuvre, puis reprend sa conduite (même destination, ou même meneur dans la colonne).
   */
  private giveRoom(v: Vehicle, ov: Vehicle, ap: Autopilot): void {
    if (this.backoff.has(v.id) || !ap.stop) return;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    const along = (ov.x - v.x) * hx + (ov.z - v.z) * hz;
    const gap = along - v.def.length * 0.5 - ov.def.length * 0.5 * Math.abs(Math.sin(ov.heading) * hx + Math.cos(ov.heading) * hz);
    if (gap > 4) return;
    const st = ap.status(v);
    const t = this.destinationOf(v, ap);
    if (st.mode !== 'follow' && !t) return;
    this.backoff.set(v.id, {
      until: this.ctx!.clock.now + 4, x: v.x, z: v.z, mode: st.mode, leaderId: st.leaderId ?? 0, tx: t ? t.x : v.x, tz: t ? t.z : v.z,
    });
    ap.stop(v);
  }

  /** À chaque pas : marche arrière des engins qui laissent la place, puis reprise de leur conduite. */
  private backoffStep(now: number): void {
    const ctx = this.ctx!;
    const ap = ctx.service<Autopilot>('vehicles.autopilot');
    for (const [id, b] of this.backoff) {
      const v = ctx.vehicles.get(id);
      if (!v || !ap || v.seats[0] === 0) {
        this.backoff.delete(id);
        continue;
      }
      if (ap.isActive && ap.isActive(v)) continue; // le pilote automatique finit de freiner
      const c = v.cmd;
      const back = Math.hypot(v.x - b.x, v.z - b.z);
      if (now < b.until && back < 6 && this.freeBehind(v)) {
        c.throttle = v.speed > -1.2 ? -0.5 : 0;
        c.brake = 0;
        c.steer = 0;
        c.handbrake = false;
        continue;
      }
      c.throttle = 0;
      c.brake = 1;
      if (now < b.until + 6) continue; // il attend, à distance, que l'autre ait manœuvré
      this.backoff.delete(id);
      // reprise : même meneur dans la colonne, ou même destination
      const lead = b.leaderId !== 0 ? ctx.vehicles.get(b.leaderId) : undefined;
      if (b.mode === 'follow' && lead && ap.follow && ap.follow(v, lead.id, 6)) continue;
      ap.driveTo(v, b.tx, b.tz, { urgence: v.siren !== 0, pushThrough: v.def.canPush === true });
    }
  }

  /** Rien derrière l'engin sur 2,5 m (personne, véhicule, façade). */
  private freeBehind(v: Vehicle): boolean {
    const ctx = this.ctx!;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    const bx = v.x - hx * (v.def.length * 0.5 + 1.5);
    const bz = v.z - hz * (v.def.length * 0.5 + 1.5);
    if (!ctx.world.isFree(bx, bz, v.def.width * 0.4)) return false;
    if (ctx.people.countIn(bx, bz, v.def.width * 0.5 + 0.8) > 0) return false;
    const list = this.near;
    const n = ctx.vehicles.queryRadius(bx, bz, v.def.width * 0.5 + 2.5, list);
    let free = true;
    for (let i = 0; i < n && free; i++) if (list[i] !== v) free = false;
    list.length = 0;
    return free;
  }

  /**
   * Nez contre un mur ou un obstacle fixe (sortie de cour, place trop étroite) : nouvel itinéraire ; s'il bute encore,
   * le conducteur recule de quelques mètres dans l'axe avant de repartir.
   */
  private clearWall(v: Vehicle, ap: Autopilot, now: number): void {
    const t = this.destinationOf(v, ap);
    if (!t) return;
    let b = this.blocked.get(v.id);
    if (!b) { b = { since: now, rerouted: false, hornAt: 0, firstAt: now }; this.blocked.set(v.id, b); }
    if (!b.rerouted) {
      b.rerouted = true;
      b.since = now;
      this.reroute(v, ap, t);
      return;
    }
    if (now - b.since < WALL_AFTER) return;
    // toujours coincé depuis longtemps, loin des yeux du joueur : il finit par se dégager (on le retrouve plus loin
    // sur son itinéraire) — une colonne ne reste pas figée dans une cour pendant que le reste du dispositif est parti
    if (now - b.firstAt > STUCK_SKIP && this.unseen(v) && this.skipAhead(v, ap, t, 'mur')) {
      b.since = now;
      b.firstAt = now;
      return;
    }
    // le pilote automatique se dégage lui-même (marche arrière, contournement, nouvel itinéraire) : le recul d'office
    // n'est qu'un dernier recours, hors de la vue du joueur
    if (now - b.firstAt < STUCK_SKIP || !this.unseen(v)) {
      b.since = now;
      return;
    }
    const world = this.ctx!.world;
    const back = 4;
    const bx = v.x - Math.sin(v.heading) * back, bz = v.z - Math.cos(v.heading) * back;
    if (world.isFree(bx, bz, v.def.width * 0.5)) {
      this.note(v, 'wallNudge', 'recul');
      v.x = bx;
      v.z = bz;
      v.vx = 0;
      v.vz = 0;
      v.speed = 0;
    }
    b.since = now;
    this.reroute(v, ap, t);
  }

  private unstick(v: Vehicle, ap: Autopilot, st: { mode: string; leaderId?: number }): boolean {
    const ctx = this.ctx!;
    if (st.mode === 'follow' && st.leaderId) {
      const lead = ctx.vehicles.get(st.leaderId);
      if (!lead || Math.hypot(lead.x - v.x, lead.z - v.z) < 20 || !this.unseen(lead)) return false;
      const gap = lead.def.length * 0.5 + v.def.length * 0.5 + 4;
      const x = lead.x - Math.sin(lead.heading) * gap, z = lead.z - Math.cos(lead.heading) * gap;
      if (!ctx.world.isFree(x, z, v.def.width * 0.5)) return false;
      this.note(v, 'unstickFollow', 'coince');
      v.x = x;
      v.z = z;
      v.heading = lead.heading;
      v.vx = 0;
      v.vz = 0;
      v.speed = 0;
      return true;
    }
    if (st.mode !== 'drive') return false;
    const t = this.destinationOf(v, ap);
    return !!t && this.skipAhead(v, ap, t, 'coince');
  }

  /** La distance restante n'a pas baissé de PROGRESS_MIN mètres en PROGRESS_WINDOW secondes. */
  private noProgress(v: Vehicle, remaining: number, now: number): boolean {
    const p = this.progress.get(v.id);
    if (!p || remaining < p.remaining - PROGRESS_MIN || remaining > p.remaining + 50) {
      this.progress.set(v.id, { remaining, at: now });
      return false;
    }
    return now - p.at > PROGRESS_WINDOW && remaining > 30;
  }

  /** Le joueur ne voit pas ce véhicule (loin de lui). */
  private unseen(v: Vehicle): boolean {
    const me = this.ctx!.player.person();
    return !me || Math.hypot(me.x - v.x, me.z - v.z) > UNSEEN_DIST;
  }

  /** Replace le véhicule une trentaine de mètres plus loin sur son itinéraire, dans l'axe, et le relance. */
  private skipAhead(v: Vehicle, ap: Autopilot, t: { x: number; z: number }, why: string): boolean {
    let path: number[] | null = null;
    let n = 0;
    try {
      const rt = (this.ctx!.service('vehicles.autopilot') as { k?: { rt?(v: Vehicle): { ap?: { path?: number[]; n?: number } | null } } }).k?.rt?.(v);
      if (rt && rt.ap && rt.ap.path && rt.ap.n) { path = rt.ap.path; n = rt.ap.n; }
    } catch {
      path = null;
    }
    if (!path || n < 2) return false;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(path[i * 2]! - v.x, path[i * 2 + 1]! - v.z);
      if (d < bd) { bd = d; best = i; }
    }
    let acc = 0;
    const world = this.ctx!.world;
    for (let i = best + 1; i < n; i++) {
      const x0 = path[i * 2 - 2]!, z0 = path[i * 2 - 1]!, x1 = path[i * 2]!, z1 = path[i * 2 + 1]!;
      acc += Math.hypot(x1 - x0, z1 - z0);
      if (acc < SKIP_DIST) continue;
      if (!world.isFree(x1, z1, v.def.width * 0.5)) continue;
      this.note(v, 'skipAhead', why);
      v.x = x1;
      v.z = z1;
      v.heading = Math.atan2(x1 - x0, z1 - z0);
      v.vx = 0;
      v.vz = 0;
      v.speed = 0;
      this.reroute(v, ap, t);
      return true;
    }
    return false;
  }

  /**
   * Nouvel itinéraire vers la destination, depuis là où il est (le Centaure pousse à la lame) : la conduite garde son
   * allure, son urgence et sa place dans la colonne.
   */
  private reroute(v: Vehicle, ap: Autopilot, t: { x: number; z: number }): void {
    if (ap.reroute && ap.reroute(v, v.def.canPush === true)) return;
    ap.driveTo(v, t.x, t.z, { urgence: v.siren !== 0, pushThrough: v.def.canPush === true });
  }

  /** Destination courante d'un véhicule : dernier point demandé (mémorisé au premier blocage), sinon inconnue. */
  private destinationOf(v: Vehicle, _ap: Autopilot): { x: number; z: number } | null {
    try {
      const rt = (this.ctx!.service('vehicles.autopilot') as { k?: { rt?(v: Vehicle): { ap?: { path?: Float64Array | number[]; n?: number } | null } } }).k?.rt?.(v);
      const st = rt && rt.ap;
      if (st && st.path && st.n && st.n >= 2) {
        const i = (st.n - 1) * 2;
        const p = { x: Number(st.path[i]), z: Number(st.path[i + 1]) };
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
          this.target.set(v.id, p);
          return p;
        }
      }
    } catch {
      // état interne indisponible
    }
    return this.target.get(v.id) ?? null;
  }

  // ───────────────────────────── escorte des blindés ─────────────────────────────

  private keepEscorts(): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const used = new Set<number>(this.escorts.values());
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || !ARMORED.has(v.kind) || v.state === 'wrecked' || v.state === 'burnt') continue;
      // l'escorte en place tient-elle toujours ?
      const cur = this.escorts.get(v.id);
      if (cur !== undefined) {
        const s = ctx.squads.get(cur);
        if (s && s.members.length > 0 && (s.order.type === 'proteger' || s.order.type === 'suivre') && s.order.targetId === v.id) continue;
        this.escorts.delete(v.id);
        used.delete(cur);
      }
      // un groupe déjà placé sous l'équipage du joueur l'escorte (voir setup.attachEscort) : rien à faire
      if (this.playerEscort(v)) continue;
      const g = this.pickGroup(v, used, me ? me.id : 0);
      if (!g) continue;
      ctx.squads.issue(g.id, { type: 'proteger', targetId: v.id, x: v.x, z: v.z, heading: v.heading, width: 0, issuedBy: g.leaderId });
      this.escorts.set(v.id, g.id);
      used.add(g.id);
      ctx.radio.say({ channel: 'unite', from: g.name, priority: 0, text: `ICI ${g.name.toUpperCase()}. Je me place en protection de l’engin. TERMINÉ.` });
    }
  }

  /**
   * Escorte d'un engin qui roule : elle le suit (derrière, en colonne) au lieu de rester en écran autour de lui —
   * sinon les hommes postés devant le capot l'arrêtent. À l'arrêt depuis quelques secondes : écran de protection.
   */
  private escortsMove(now: number): void {
    const ctx = this.ctx!;
    const ap = ctx.service<Autopilot>('vehicles.autopilot');
    for (const [vid, gid] of this.escorts) {
      const v = ctx.vehicles.get(vid);
      const g = ctx.squads.get(gid);
      if (!v || !g || g.order.targetId !== vid) continue;
      const st = ap ? ap.status(v) : null;
      const driving = Math.abs(v.speed) > 0.8 || (!!st && (st.mode === 'drive' || st.mode === 'follow' || st.mode === 'convoy') && st.state !== 'arrive');
      if (driving) {
        this.stillSince.delete(vid);
        if (g.order.type !== 'suivre') ctx.squads.issue(g.id, { type: 'suivre', targetId: vid, x: v.x, z: v.z, heading: v.heading, width: 0, issuedBy: g.leaderId });
      } else if (g.order.type === 'suivre') {
        const since = this.stillSince.get(vid) ?? now;
        this.stillSince.set(vid, since);
        if (now - since > 4) {
          this.stillSince.delete(vid);
          ctx.squads.issue(g.id, { type: 'proteger', targetId: vid, x: v.x, z: v.z, heading: v.heading, width: 0, issuedBy: g.leaderId });
        }
      }
    }
  }

  private playerEscort(v: Vehicle): boolean {
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) {
      if (s.vehicleId !== v.id) continue;
      for (const q of ctx.squads.list) if (q.parentId === s.id && q.kind === 'groupe' && q.members.length > 0) return true;
    }
    return false;
  }

  /** Groupe à pied libre le plus proche (ni celui du joueur, ni déjà escorteur, ni engagé dans une manœuvre). */
  private pickGroup(v: Vehicle, used: ReadonlySet<number>, playerId: EntityId): Squad | null {
    const ctx = this.ctx!;
    let best: Squad | null = null;
    let bd = ESCORT_RANGE;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.kind !== 'groupe' || used.has(s.id) || s.members.length < 3) continue;
      if (s.leaderId === playerId || s.members.indexOf(playerId) >= 0) continue;
      if (!FREE_ORDERS.has(s.order.type)) continue;
      if (s.order.type === 'suivre' && s.order.targetId === playerId) continue;
      const lead = ctx.people.get(s.leaderId) ?? ctx.people.get(s.members[0]!);
      if (!lead || lead.vehicleId !== 0) continue;
      const d = Math.hypot(lead.x - v.x, lead.z - v.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}

/** Véhicule qui arrête `v` (état interne du pilote automatique), 0 si inconnu. */
function obstacleOf(ap: unknown, v: Vehicle): number {
  try {
    const rt = (ap as { k?: { rt?(v: Vehicle): { ap?: { obsId?: number; obsReason?: string } | null } } }).k?.rt?.(v);
    const st = rt && rt.ap;
    return st && st.obsReason === 'vehicule' && typeof st.obsId === 'number' ? st.obsId : 0;
  } catch {
    return 0;
  }
}
