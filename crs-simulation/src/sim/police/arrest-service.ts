/* =====================================================================================
 * FORCES DE L'ORDRE — interpellés pris en charge par les unités (service 'police.arrests', plan §5.4).
 *
 *   takeOver(targetId, byPlayer)  « Confier » : le joueur confie l'interpellé qu'il tient au binôme libre le plus proche
 *                                 d'une unité de son dispositif (60 m) ; menotté, il est laissé assis, entravé, et le
 *                                 joueur a les mains libres tout de suite ; le binôme le rejoint (5 à 15 s), le prend en
 *                                 escorte et le conduit au fourgon cellulaire (ops-arrest.ts startEscort) ;
 *   pairFor(byPlayer)             le binôme que « Confier » prendrait (son unité, sa distance) : la ligne d'ordre et
 *                                 l'invite disent le même nom ;
 *   waiting()                     interpellés qui attendent avec leur binôme le fourgon appelé (repère à l'écran) ;
 *   fetch(byPlayer, targetId)     « Faire venir le fourgon » (le joueur garde son interpellé, sans binôme libre) : le
 *                                 fourgon cellulaire le plus proche qui peut venir roule jusqu'à la chaussée près de lui ;
 *                                 une place lui est retenue et le fourgon l'attend tant qu'il tient l'interpellé (5 min
 *                                 au plus) ; fetchable() dit lequel viendrait, fetching() s'il est en route ;
 *   handling(targetId)            un binôme s'occupe de cet interpellé (« Confier » fait, ramassage en cours).
 *
 * Fourgons cellulaires : tout fourgon cellulaire de police du dispositif qui a une place sert à la remise ; appelé
 * (call), il roule au pilote automatique, sans sirène, jusqu'au rendez-vous fixé par l'interpellation (20 m derrière la
 * ligne), puis, quand plus personne ne l'attend depuis RETURN_AFTER s, il retourne à la place qu'il a quittée (le point de
 * remise). Un fourgon conduit par le joueur, pris dans une colonne (transfert au commissariat, ordre du joueur) ou dans
 * la colonne derrière le joueur n'est jamais appelé.
 *
 * Ramassage (personne n'est laissé seul, diag-interpelles P6/P10) : chaque seconde, un interpellé menotté laissé assis
 * sans personne (binôme appelé ailleurs, joueur monté en voiture), gardé en escorte par un agent sans opération faute de
 * fourgon, ou remis à un point de regroupement, est pris en charge dès qu'un fourgon peut le recevoir : le binôme libre le
 * plus proche (150 m) le conduit au fourgon, ou le fourgon vient à lui.
 *
 * Simulation pure, déterministe (aucun tirage), aucune allocation dans les boucles par personne.
 * ===================================================================================== */

import type { EntityId, GameContext, PathStartOptions, Person, Squad, Vehicle } from '@/core/contracts';
import { isAtPost, isHeldVehicle } from '@/world/commissariats';
import type { Agent } from './brain';
import { agentOf } from './brain';
import type { Kernel } from './kernel';
import { STAGE_PICKUP, VAN_NEAR, WALK_MAX, reservedVehicle, startEscort, startPickup, waitingVan } from './ops-arrest';
import { free, holdsLine, isCatcher, isHelper } from './ops-core';

export const POLICE_ARRESTS_SERVICE = 'police.arrests';

/** Résultat de « Confier ». */
export interface ArrestTakeOver {
  ok: boolean;
  /** Pourquoi c'est impossible (phrase pour le joueur), '' si c'est fait. */
  reason: string;
  /** Unité du binôme qui le prend en charge. */
  squadName: string;
}

/** Binôme que « Confier » prendrait. */
export interface ArrestPair {
  squadId: number;
  name: string;
  /** Distance du binôme au joueur (m). */
  distance: number;
}

/** Interpellé qui attend avec son binôme le fourgon cellulaire appelé. */
export interface DetaineeWaiting {
  personId: EntityId;
  x: number;
  z: number;
  /** Équipage du fourgon attendu (0 si inconnu) et son indicatif (« CELLULAIRE 1 »). */
  vanSquadId: number;
  vanName: string;
  /** Début de l'attente (s de session). */
  since: number;
}

/** Fourgon que « Faire venir » appellerait, ou qui est en route. */
export interface ArrestVan {
  vehicleId: EntityId;
  /** Équipage (0 si inconnu) et son indicatif (« CELLULAIRE 1 »). */
  squadId: number;
  name: string;
  /** Distance du fourgon au joueur (m). */
  distance: number;
}

/** Résultat de « Faire venir le fourgon ». */
export interface ArrestFetch {
  ok: boolean;
  /** Pourquoi c'est impossible (phrase pour le joueur), '' si le fourgon vient. */
  reason: string;
  vehicleId: EntityId;
  squadId: number;
  name: string;
  /** Arrivée estimée (s). */
  eta: number;
}

export interface PoliceArrestsApi {
  takeOver(targetId: EntityId, byPlayer: EntityId): ArrestTakeOver;
  /** Fourgon que « Faire venir » appellerait pour le joueur (`vanSquadId` : ce fourgon-là), null : aucun ne peut venir. */
  fetchable(byPlayer: EntityId, vanSquadId?: number): ArrestVan | null;
  fetch(byPlayer: EntityId, targetId: EntityId, vanSquadId?: number): ArrestFetch;
  /** Fourgon en route vers le joueur pour cet interpellé (null : aucun). */
  fetching(targetId: EntityId): ArrestVan | null;
  /** Un binôme s'occupe-t-il de cet interpellé (le rejoint, l'escorte, le remet) ? */
  handling(targetId: EntityId): boolean;
  pairFor(byPlayer: EntityId): ArrestPair | null;
  waiting(): readonly DetaineeWaiting[];
  /** Fourgon appelé pour une interpellation, ou attendu par un binôme (le point de remise ne le déplace pas). */
  busy(vehicleId: EntityId): boolean;
}

/** Rayon où « Confier » cherche un binôme libre (m) — le même que la ligne d'ordre (ui/command/direct/env.ts). */
export const PAIR_RADIUS = 60;
/** Rayon où le ramassage cherche un binôme libre (m). */
const COLLECT_RADIUS = 150;
/** Interpellé laissé seul depuis tant de secondes : ramassé (menotté assis ; gardé en escorte ; remis à un point). */
const COLLECT_CUFFED = 8;
const COLLECT_GUARDED = 4;
const COLLECT_PARKED = 4;
/** Le joueur à pied à moins de tant de mètres d'un interpellé assis s'en occupe lui-même (m). */
const PLAYER_NEAR = 5;
/** Fourgon cellulaire au-delà duquel on ne l'appelle pas (m) : au commissariat, en transfert. */
const VAN_CALL_MAX = 2000;
/** Rendez-vous d'un fourgon déjà appelé, réutilisé pour un autre interpellé à moins de tant de mètres (m). */
const RUN_SHARE = 40;
/** Fourgon appelé arrêté à moins de tant de mètres de son rendez-vous : il y est (m). */
const RUN_ARRIVED = 25;
/** Fourgon appelé qui roule encore au bout de tant de secondes : il s'arrête où il est (manœuvre sans fin). */
const RUN_MAX = 180;
/** Fourgon que plus personne n'attend depuis tant de secondes : il retourne à sa place (s). */
const RETURN_AFTER = 20;
/** Place de départ plus loin que tant de mètres du point de remise : le fourgon n'y retourne pas (m). */
const RETURN_NEAR_REMISE = 200;
/**
 * Appel du fourgon : vitesse moyenne retenue en ville (m/s), allure d'un binôme qui conduit un interpellé (m/s), marge
 * (s) — le fourgon n'est pas appelé quand l'interpellé serait plus tôt au fourgon à pied. Sans marche possible
 * (ramassage), itinéraire plus long que DETOUR_FACTOR × la distance + DETOUR_SLACK m : pas d'appel.
 */
const VAN_SPEED = 6;
const ESCORT_SPEED = 1.3;
const CALL_SLACK = 20;
const DETOUR_FACTOR = 2.5;
const DETOUR_SLACK = 150;
/** « Faire venir » : le fourgon attend le joueur tant de secondes au plus (s) ; marge d'arrivée ajoutée au trajet (s). */
const FETCH_MAX = 300;
const FETCH_SLACK = 10;
/**
 * « Faire venir » : un fourgon qui ne s'est pas rapproché de FETCH_PROGRESS m depuis FETCH_STALL s (foule, rue
 * barrée) et qui est encore à plus de FETCH_NEAR m du joueur s'arrête ; le joueur est prévenu et emmène l'interpellé.
 */
const FETCH_STALL = 40;
const FETCH_PROGRESS = 5;
const FETCH_NEAR = 25;
/**
 * Sortie de file d'un fourgon appelé (pullingOut) : rayon autour de sa place où il « sort » encore (m) ; retenu depuis
 * tant de secondes devant le même obstacle, il est arrêté pour de bon (s).
 */
const PULL_OUT_ZONE = 30;
const HALT_AFTER = 6;
/** Pénalité (m) d'un fourgon garé sans champ libre devant lui, au choix du fourgon à appeler. */
const BOXED_PENALTY = 40;
/** Étapes d'une colonne en cours : le fourgon n'est pas libre (remise.ts CONVOY_BUSY). */
const CONVOY_BUSY: ReadonlySet<string> = new Set(['route', 'stationnement', 'debarquement', 'rembarquement', 'depart']);

interface VanRun {
  /** Rendez-vous. */
  x: number;
  z: number;
  /** Place quittée (retour), et retour prévu. */
  fromX: number;
  fromZ: number;
  fromH: number;
  back: boolean;
  at: number;
  idleSince: number;
  /** Garé dans une file serrée à l'appel (un véhicule juste devant lui) : il doit d'abord en sortir — voir pullingOut. */
  boxed: boolean;
}

/** Binôme choisi : le premier, son équipier (null : seul), distance du premier au point (m). */
interface PairPick {
  lead: Agent | null;
  second: Agent | null;
  distance: number;
}

interface CommandLike {
  convoyOf?(squadId: number): { stage: string } | null;
}
interface FollowLike {
  inColumn(squadId: number): boolean;
}
interface RemiseLike {
  point(): { x: number; z: number; heading: number } | null;
}

/** « Faire venir » en cours : le joueur, son interpellé, l'appel. */
interface VanFetch {
  playerId: EntityId;
  targetId: EntityId;
  at: number;
  /** Point où le fourgon s'arrête, meilleure distance restante (m) et instant où elle a été atteinte. */
  x: number;
  z: number;
  best: number;
  bestAt: number;
}

export class ArrestService implements PoliceArrestsApi {
  private readonly runs = new Map<EntityId, VanRun>();
  /** « Faire venir » en cours, par fourgon. */
  private readonly fetches = new Map<EntityId, VanFetch>();
  /** Interpellés laissés seuls : depuis quand (s). */
  private readonly alone = new Map<EntityId, number>();
  private readonly seen = new Set<EntityId>();
  private readonly targeted = new Set<EntityId>();
  private readonly list: DetaineeWaiting[] = [];
  private readonly crews = new Map<EntityId, number>();
  private readonly buf: Person[] = [];
  private readonly near: Vehicle[] = [];
  private nextAt = 0;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.runs.clear();
    this.fetches.clear();
    this.alone.clear();
    this.seen.clear();
    this.targeted.clear();
    this.list.length = 0;
    this.crews.clear();
    this.nextAt = 0;
  }

  // ───────────────────────────── fourgons cellulaires ─────────────────────────────

  /** Équipage (unité) d'un fourgon cellulaire, ou undefined (fourgon sans équipage). */
  crewOf(v: Vehicle): Squad | undefined {
    const squads = this.k.ctx.squads;
    const known = this.crews.get(v.id);
    if (known !== undefined) {
      const s = squads.get(known);
      if (s && s.vehicleId === v.id) return s;
    }
    for (const s of squads.list) {
      if (s.vehicleId === v.id && s.faction === 'police') {
        this.crews.set(v.id, s.id);
        return s;
      }
    }
    return undefined;
  }

  /** Fourgon pris par un autre mouvement : colonne en cours (transfert, ordre du joueur), colonne derrière le joueur. */
  private taken(v: Vehicle): boolean {
    const crew = this.crewOf(v);
    if (!crew) return false;
    const ctx = this.k.ctx;
    const command = ctx.service<CommandLike>('police.command');
    const convoy = command && command.convoyOf ? command.convoyOf(crew.id) : null;
    if (convoy && CONVOY_BUSY.has(convoy.stage)) return true;
    const follow = ctx.service<FollowLike>('session.follow');
    return !!follow && typeof follow.inColumn === 'function' && follow.inColumn(crew.id);
  }

  /** Places déjà retenues dans `v` par d'autres interpellations en cours (hors `skip`). */
  private reserved(v: Vehicle, skip: unknown): number {
    // (« Faire venir » : une place est retenue pour l'interpellé du joueur)
    let n = this.fetches.has(v.id) ? 1 : 0;
    const roots = this.k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) if (ops[j] !== skip && reservedVehicle(ops[j]) === v.id) n++;
    }
    return n;
  }

  /** Places de passager libres. */
  private seats(v: Vehicle): number {
    let n = 0;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') n++;
    return n;
  }

  /**
   * Le fourgon peut-il recevoir un interpellé de plus (`op` : l'interpellation qui y va, sa place comptée) ? En état,
   * une place libre non retenue, ni emmené par une colonne, ni conduit par le joueur qui roule.
   */
  receives(v: Vehicle, op: unknown): boolean {
    if (v.kind !== 'fourgon_cellulaire' || v.faction !== 'police' || (v.state !== 'ok' && v.state !== 'damaged')) return false;
    // (fourgon garé en réserve d'un commissariat, ou d'une unité de commissariat au poste : pas un fourgon du dispositif)
    if (this.station(v)) return false;
    if (this.seats(v) - this.reserved(v, op) <= 0 || this.taken(v)) return false;
    const driver = v.seats[0] !== 0 ? this.k.ctx.people.get(v.seats[0]) : undefined;
    return !(driver && driver.isPlayer && Math.abs(v.speed) > 1);
  }

  /** Fourgon d'un commissariat qui n'est pas engagé : garé en réserve, ou son équipage au poste (au repos, en alerte). */
  private station(v: Vehicle): boolean {
    const ctx = this.k.ctx;
    if (isHeldVehicle(ctx, v.id)) return true;
    const crew = this.crewOf(v);
    return !!crew && isAtPost(ctx, crew.id);
  }

  /** Le fourgon peut-il venir : conducteur de police à son volant (pas le joueur), personne d'autre ne le conduit. */
  callable(v: Vehicle): boolean {
    const ctx = this.k.ctx;
    const driver = v.seats[0] !== 0 ? ctx.people.get(v.seats[0]) : undefined;
    if (!driver || driver.isPlayer || driver.faction !== 'police') return false;
    for (let s = 1; s < v.seats.length; s++) {
      const q = v.seats[s] !== 0 ? ctx.people.get(v.seats[s]) : undefined;
      if (q && q.isPlayer) return false;
    }
    const ap = this.k.autopilot;
    if (!ap) return false;
    return this.runs.has(v.id) || !ap.isActive(v);
  }

  /**
   * Fourgon cellulaire le plus proche de (x, z) qui peut recevoir l'interpellé de `op` : qui peut venir (VAN_CALL_MAX m),
   * ou à moins de WALK_MAX m pour y aller à pied. Un fourgon déjà appelé ailleurs (plus de RUN_SHARE m de son
   * rendez-vous) ne compte que pour y aller à pied.
   */
  nearestVan(x: number, z: number, op: unknown): Vehicle | null {
    const list = this.k.ctx.vehicles.list;
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.kind !== 'fourgon_cellulaire') continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > VAN_CALL_MAX) continue;
      const run = this.runs.get(v.id);
      // (un fourgon coincé dans sa file passe après un fourgon qui a le champ libre, s'il est à peine plus loin)
      const score = d + (d > VAN_NEAR && !run && this.boxedIn(v) ? BOXED_PENALTY : 0);
      if (score >= bestD || !this.receives(v, op)) continue;
      const comes = this.callable(v) && (!run || Math.hypot(run.x - x, run.z - z) < RUN_SHARE);
      if (!comes && d > WALK_MAX) continue;
      bestD = score;
      best = v;
    }
    return best;
  }

  /**
   * Fait venir le fourgon au point (x, z), deux-tons (il traverse le secteur de la manifestation). true s'il y va (ou y
   * est déjà, ou y est déjà appelé) ; false s'il ne peut pas (sans conducteur, conduit par un autre, appelé ailleurs,
   * aucun itinéraire, ou un itinéraire si long qu'à pied — `walk` m — l'interpellé y serait plus tôt).
   */
  call(v: Vehicle, x: number, z: number, walk = Infinity): boolean {
    const ap = this.k.autopilot;
    if (!ap || !this.callable(v)) return false;
    const run = this.runs.get(v.id);
    if (run) {
      if (Math.hypot(run.x - x, run.z - z) >= RUN_SHARE) return false;
      // déjà appelé à ce rendez-vous : il y roule, ou il y est. Arrêté avant d'y être (il ne passait pas : file de
      // voitures, rue barrée — hold), il ne vient plus : on y conduit l'interpellé à pied sans l'attendre de nouveau
      return ap.isActive(v) || Math.hypot(v.x - run.x, v.z - run.z) < RUN_ARRIVED;
    }
    const now = this.k.now;
    const remise = this.k.ctx.service<RemiseLike>('session.remise');
    const spot = remise && typeof remise.point === 'function' ? remise.point() : null;
    const back = !spot || Math.hypot(v.x - spot.x, v.z - spot.z) < RETURN_NEAR_REMISE;
    const straight = Math.hypot(v.x - x, v.z - z);
    if (straight > 12) {
      // un itinéraire qui fait le tour du quartier (sens uniques, quais) : pas d'appel s'il serait plus long que d'y
      // conduire l'interpellé à pied (`walk` : distance du binôme au fourgon), ou démesuré pour un point tout proche
      const route = this.routeLength(v, x, z);
      if (route / VAN_SPEED > walk / ESCORT_SPEED + CALL_SLACK) return false;
      if (walk === Infinity && route > straight * DETOUR_FACTOR + DETOUR_SLACK) return false;
      if (!ap.driveTo(v, x, z, { urgence: true })) return false;
    }
    this.runs.set(v.id, { x, z, fromX: v.x, fromZ: v.z, fromH: v.heading, back, at: now, idleSince: -1, boxed: straight > 12 && this.boxedIn(v) });
    return true;
  }

  /**
   * Chemin qui reste au fourgon jusqu'au point (x, z) : l'itinéraire restant du pilote automatique quand il y roule
   * (un détour par les sens uniques l'éloigne d'abord), sinon la distance à vol d'oiseau (m).
   */
  remaining(v: Vehicle, x: number, z: number): number {
    const ap = this.k.autopilot;
    const run = this.runs.get(v.id);
    const straight = Math.hypot(v.x - x, v.z - z);
    if (ap && run && ap.isActive(v) && Math.hypot(run.x - x, run.z - z) < RUN_SHARE) {
      // (0 tant que le pilote n'a pas fait son premier pas : la distance à vol d'oiseau en attendant)
      const left = ap.status(v).remaining;
      if (left > 0 || straight < RUN_ARRIVED) return left;
    }
    return straight;
  }

  /**
   * Le fourgon appelé sort-il encore de sa file : garé derrière un autre véhicule à l'appel (les fourgons de la
   * compagnie rangés pare-chocs contre pare-chocs), encore à moins de PULL_OUT_ZONE m de sa place, et son pilote
   * manœuvre — il déboîte, recule, repart : une vingtaine de secondes, sans avancer de cinq mètres d'affilée ? Retenu
   * depuis HALT_AFTER s devant le même obstacle, ou pilote rendu : non, il est arrêté pour de bon.
   */
  pullingOut(v: Vehicle): boolean {
    const ap = this.k.autopilot;
    const run = this.runs.get(v.id);
    if (!ap || !run || !run.boxed || !ap.isActive(v) || Math.hypot(v.x - run.fromX, v.z - run.fromZ) > PULL_OUT_ZONE) return false;
    const st = ap.status(v);
    return st.state !== 'echec' && !((st.state === 'bloque' || st.state === 'attente') && st.blockedFor >= HALT_AFTER);
  }

  /** Le fourgon appelé ne passe pas (le binôme vient à pied) : il s'arrête où il est (il rentrera ensuite à sa place). */
  hold(v: Vehicle): void {
    const ap = this.k.autopilot;
    if (ap && this.runs.has(v.id) && ap.isActive(v)) ap.stop(v);
  }

  /**
   * Un véhicule (ou un obstacle) juste devant le fourgon garé : rangé en file, il ne peut pas sortir tant que l'autre
   * ne bouge pas — on appelle de préférence un fourgon qui a le champ libre.
   */
  private boxedIn(v: Vehicle): boolean {
    const ctx = this.k.ctx;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const reach = v.def.length * 0.5 + 3;
    const x = v.x + fx * reach;
    const z = v.z + fz * reach;
    const n = ctx.vehicles.queryRadius(x, z, 3, this.near);
    let boxed = false;
    for (let i = 0; i < n; i++) if (this.near[i] !== v) boxed = true;
    this.near.length = 0;
    return boxed || !ctx.world.isFree(x, z, 1);
  }

  private readonly path: number[] = [];
  private readonly start: PathStartOptions = { heading: 0, uturn: 30, contraflow: 3 };

  /** Longueur de l'itinéraire routier du fourgon jusqu'au point, départ dans le sens où il est tourné (m ; ∞ sans chemin). */
  private routeLength(v: Vehicle, x: number, z: number): number {
    const path = this.path;
    this.start.heading = v.heading;
    this.start.minWidth = v.def.width + 1.2;
    if (!this.k.ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path, this.start) || path.length < 4) {
      path.length = 0;
      return Infinity;
    }
    let len = 0;
    for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
    path.length = 0;
    return len;
  }

  /** Fourgons appelés : arrêt d'une manœuvre sans fin, retour à leur place quand plus personne ne les attend. */
  private reviewRuns(now: number): void {
    const ctx = this.k.ctx;
    const ap = this.k.autopilot;
    for (const [id, run] of this.runs) {
      const v = ctx.vehicles.get(id);
      if (!v || !ap || (v.state !== 'ok' && v.state !== 'damaged') || this.taken(v) || !this.callableDriver(v)) {
        this.runs.delete(id);
        continue;
      }
      let used = this.fetches.has(id);
      const roots = this.k.roots;
      for (let i = 0; i < roots.length && !used; i++) {
        const ops = roots[i].ops;
        for (let j = 0; j < ops.length; j++) {
          if (reservedVehicle(ops[j]) === id) {
            used = true;
            break;
          }
        }
      }
      if (ap.isActive(v)) {
        if (now - run.at > RUN_MAX) ap.stop(v);
        else {
          // reparti sans deux-tons (il a reculé pour laisser manœuvrer un automobiliste — session/engins.ts, giveRoom — et
          // sa conduite a repris sans urgence, à l'allure de la circulation) : le fourgon appelé repart en urgence, comme
          // à l'appel — sinon il n'arrivait pas avant RUN_MAX et l'interpellé n'était jamais embarqué
          const st = ap.status(v);
          if (st.mode === 'drive' && st.urgence === false && Math.hypot(v.x - run.x, v.z - run.z) > 12) ap.driveTo(v, run.x, run.z, { urgence: true });
        }
        run.idleSince = -1;
        continue;
      }
      if (used) {
        run.idleSince = -1;
        continue;
      }
      if (run.idleSince < 0) {
        run.idleSince = now;
        continue;
      }
      if (now - run.idleSince < RETURN_AFTER) continue;
      this.runs.delete(id);
      if (run.back && Math.hypot(v.x - run.fromX, v.z - run.fromZ) > 15) {
        if (!ap.park(v, run.fromX, run.fromZ, run.fromH)) ap.driveTo(v, run.fromX, run.fromZ, { urgence: false });
      }
    }
  }

  /** Conducteur de police (pas le joueur) au volant. */
  private callableDriver(v: Vehicle): boolean {
    const driver = v.seats[0] !== 0 ? this.k.ctx.people.get(v.seats[0]) : undefined;
    return !!driver && !driver.isPlayer && driver.faction === 'police';
  }

  // ───────────────────────────── binômes ─────────────────────────────

  private readonly pickOut: PairPick = { lead: null, second: null, distance: 0 };

  /**
   * Binôme libre le plus proche de (x, z) dans `radius` m : à pied, sans opération, hors équipage d'un véhicule et hors
   * du premier rang d'une rue barrée ; le binôme d'interpellation et le second rang d'abord. `accept` restreint les unités.
   */
  private pick(x: number, z: number, radius: number, accept: ((a: Agent) => boolean) | null): PairPick | null {
    const ctx = this.k.ctx;
    const buf = this.buf;
    const n = ctx.people.queryRadius(x, z, radius, buf);
    let lead: Agent | null = null;
    let bestScore = Infinity;
    let bestD = 0;
    for (let i = 0; i < n; i++) {
      const q = buf[i];
      if (q.faction !== 'police' || q.isPlayer || q.vehicleId !== 0) continue;
      const a = agentOf(q);
      if (!a || !a.root || !a.home || a.crew || !free(a) || holdsLine(a.root, a) || (accept && !accept(a))) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      const score = d + (isCatcher(a) || isHelper(a) ? 0 : 12);
      if (score < bestScore) {
        bestScore = score;
        bestD = d;
        lead = a;
      }
    }
    buf.length = 0;
    if (!lead) return null;
    // son équipier : un agent libre de la même unité, près de lui
    let second: Agent | null = null;
    let sd = 30;
    const own = lead.home!.own;
    for (let i = 0; i < own.length; i++) {
      const a = own[i];
      if (a === lead || a.crew || !free(a) || a.p.vehicleId !== 0 || !a.root || holdsLine(a.root, a)) continue;
      const d = Math.hypot(a.p.x - lead.p.x, a.p.z - lead.p.z);
      if (d < sd) {
        sd = d;
        second = a;
      }
    }
    const out = this.pickOut;
    out.lead = lead;
    out.second = second;
    out.distance = bestD;
    return out;
  }

  /** Unité de tête (sans parent) d'une unité. */
  private topOf(squadId: number): number {
    const squads = this.k.ctx.squads;
    let s = squads.get(squadId);
    for (let guard = 0; s && s.parentId !== 0 && guard < 16; guard++) {
      const up = squads.get(s.parentId);
      if (!up) break;
      s = up;
    }
    return s ? s.id : 0;
  }

  /** Agents du dispositif du joueur : même unité de tête que lui (ses unités, son groupe et ses voisins). */
  private sameTree(me: Person): ((a: Agent) => boolean) | null {
    if (me.squadId === 0) return null;
    const top = this.topOf(me.squadId);
    return (a: Agent): boolean => a.p.squadId !== 0 && this.topOf(a.p.squadId) === top;
  }

  pairFor(byPlayer: EntityId): ArrestPair | null {
    const me = this.k.ctx.people.get(byPlayer);
    if (!me) return null;
    const accept = this.sameTree(me);
    if (!accept) return null;
    const pair = this.pick(me.x, me.z, PAIR_RADIUS, accept);
    if (!pair || !pair.lead || !pair.lead.home) return null;
    const home = pair.lead.home;
    return { squadId: home.id, name: home.squad.name, distance: pair.distance };
  }

  takeOver(targetId: EntityId, byPlayer: EntityId): ArrestTakeOver {
    const ctx = this.k.ctx;
    const me = ctx.people.get(byPlayer);
    const target = ctx.people.get(targetId);
    const fail = (reason: string): ArrestTakeOver => ({ ok: false, reason, squadName: '' });
    if (!me || !target || me.faction !== 'police') return fail('Personne à confier.');
    const c = target.custody;
    if (c !== 'escorted' && c !== 'cuffed' && c !== 'held') return fail('Personne à confier.');
    if (c !== 'cuffed' && target.heldBy !== me.id) return fail('Un collègue le tient déjà.');
    // déjà pris en charge par un binôme
    const roots = this.k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) {
        const op = ops[j];
        if (!op.done && op.targetId === targetId && op.lead) return { ok: true, reason: '', squadName: op.owner.squad.name };
      }
    }
    const accept = this.sameTree(me);
    // (choisi autour du joueur, comme pairFor : l'invite et la ligne d'ordre nomment le binôme qui viendra)
    const pair = accept ? this.pick(me.x, me.z, PAIR_RADIUS, accept) : null;
    if (!pair || !pair.lead) return fail('Aucun collègue libre à moins de 60 m : emmenez-le vous-même au fourgon cellulaire.');
    const lead = pair.lead;
    const op = startEscort(this.k, lead, pair.second, target, me.id);
    if (!op) return fail('Aucun collègue libre à moins de 60 m : emmenez-le vous-même au fourgon cellulaire.');
    // menotté : le joueur a les mains libres tout de suite, l'interpellé reste assis, entravé, jusqu'à l'arrivée du
    // binôme (le module de droit le fait asseoir dès que son escorte l'a lâché, custody-step.ts) ; sans menottes, le
    // joueur le garde jusqu'au binôme, qui le menotte
    if (c === 'escorted' && target.upper === 'cuffed' && me.carrying === target.id) me.carrying = 0;
    return { ok: true, reason: '', squadName: op.owner.squad.name };
  }

  waiting(): readonly DetaineeWaiting[] {
    return this.list;
  }

  /** Le fourgon est-il appelé pour une interpellation, ou attendu par un binôme ? (Le point de remise ne le déplace pas.) */
  busy(vehicleId: EntityId): boolean {
    if (this.runs.has(vehicleId) || this.fetches.has(vehicleId)) return true;
    const roots = this.k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) if (reservedVehicle(ops[j]) === vehicleId) return true;
    }
    return false;
  }

  // ───────────────────────────── « Faire venir » ─────────────────────────────

  private vanOut: ArrestVan = { vehicleId: 0, squadId: 0, name: '', distance: 0 };

  private describe(v: Vehicle, from: Person): ArrestVan {
    const crew = this.crewOf(v);
    const out = this.vanOut;
    out.vehicleId = v.id;
    out.squadId = crew ? crew.id : 0;
    out.name = crew ? crew.name : 'CELLULAIRE';
    out.distance = Math.hypot(v.x - from.x, v.z - from.z);
    return out;
  }

  fetchable(byPlayer: EntityId, vanSquadId = 0): ArrestVan | null {
    const me = this.k.ctx.people.get(byPlayer);
    if (!me || me.vehicleId !== 0) return null;
    const list = this.k.ctx.vehicles.list;
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.kind !== 'fourgon_cellulaire') continue;
      if (vanSquadId !== 0) {
        const crew = this.crewOf(v);
        if (!crew || crew.id !== vanSquadId) continue;
      }
      const d = Math.hypot(v.x - me.x, v.z - me.z);
      if (d >= bestD || d > VAN_CALL_MAX || this.fetches.has(v.id) || !this.receives(v, null) || !this.callable(v)) continue;
      // (un fourgon déjà appelé par une interpellation ne vient pas)
      if (this.runs.has(v.id)) continue;
      bestD = d;
      best = v;
    }
    return best ? this.describe(best, me) : null;
  }

  fetch(byPlayer: EntityId, targetId: EntityId, vanSquadId = 0): ArrestFetch {
    const ctx = this.k.ctx;
    const fail = (reason: string): ArrestFetch => ({ ok: false, reason, vehicleId: 0, squadId: 0, name: '', eta: 0 });
    const me = ctx.people.get(byPlayer);
    const target = ctx.people.get(targetId);
    if (!me || !target || me.faction !== 'police') return fail('Personne à emmener.');
    const c = target.custody;
    if (c !== 'escorted' && c !== 'cuffed' && c !== 'held') return fail('Personne à emmener.');
    const going = this.fetching(targetId);
    if (going) {
      const v = ctx.vehicles.get(going.vehicleId)!;
      return { ok: true, reason: '', vehicleId: going.vehicleId, squadId: going.squadId, name: going.name, eta: this.eta(v, me.x, me.z) };
    }
    const pick = this.fetchable(byPlayer, vanSquadId);
    if (!pick) return fail('Aucun fourgon cellulaire ne peut venir : emmenez-le vous-même.');
    const v = ctx.vehicles.get(pick.vehicleId)!;
    const name = pick.name;
    const squadId = pick.squadId;
    // le fourgon s'arrête au bord de la chaussée la plus proche du joueur
    const road = this.k.road;
    const near = ctx.world.nearestRoad(me.x, me.z, road, 40);
    const x = near ? road.x : me.x;
    const z = near ? road.z : me.z;
    const eta = this.eta(v, x, z);
    if (!this.call(v, x, z, pick.distance)) return fail('Le ' + name + ' ne peut pas venir jusqu’ici : emmenez l’interpellé à pied.');
    this.fetches.set(v.id, { playerId: byPlayer, targetId, at: this.k.now, x, z, best: Infinity, bestAt: this.k.now });
    return { ok: true, reason: '', vehicleId: v.id, squadId, name, eta };
  }

  /** Arrivée estimée du fourgon au point (s) : itinéraire à VAN_SPEED, plus une marge. */
  private eta(v: Vehicle, x: number, z: number): number {
    const route = this.routeLength(v, x, z);
    const len = Number.isFinite(route) ? route : Math.hypot(v.x - x, v.z - z) * 1.4;
    return len / VAN_SPEED + FETCH_SLACK;
  }

  fetching(targetId: EntityId): ArrestVan | null {
    for (const [id, f] of this.fetches) {
      if (f.targetId !== targetId) continue;
      const v = this.k.ctx.vehicles.get(id);
      const me = this.k.ctx.people.get(f.playerId);
      if (v && me) return this.describe(v, me);
    }
    return null;
  }

  handling(targetId: EntityId): boolean {
    const roots = this.k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) if (!ops[j].done && ops[j].targetId === targetId && ops[j].lead) return true;
    }
    return false;
  }

  /** « Faire venir » terminés : interpellé remis (ou libéré), joueur parti, fourgon hors d'usage, attente trop longue. */
  private reviewFetches(now: number): void {
    const ctx = this.k.ctx;
    for (const [id, f] of this.fetches) {
      const v = ctx.vehicles.get(id);
      const target = ctx.people.get(f.targetId);
      const c = target ? target.custody : 'free';
      const held = c === 'escorted' || c === 'cuffed' || c === 'held';
      const me = ctx.people.get(f.playerId);
      if (!v || (v.state !== 'ok' && v.state !== 'damaged') || !held || !me || now - f.at > FETCH_MAX) {
        this.fetches.delete(id);
        continue;
      }
      const near = Math.hypot(v.x - me.x, v.z - me.z);
      const left = this.remaining(v, f.x, f.z);
      if (near <= FETCH_NEAR || left < f.best - FETCH_PROGRESS) {
        f.best = Math.min(f.best, left);
        f.bestAt = now;
      } else if (now - f.bestAt > FETCH_STALL) {
        // bloqué en route : il s'arrête là, le joueur l'y emmène à pied
        this.hold(v);
        this.fetches.delete(id);
        const crew = this.crewOf(v);
        const name = crew ? crew.name.replace(/^CELLULAIRE\b/, 'fourgon cellulaire') : 'fourgon cellulaire';
        if (me.isPlayer) ctx.ui.notify('Le ' + name + ' est bloqué en route : emmenez l’interpellé à pied (' + Math.round(near / 10) * 10 + '\u00a0m).', 'warn', 6);
      }
    }
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(): void {
    const now = this.k.now;
    if (now < this.nextAt) return;
    this.nextAt = now + 1;
    this.reviewFetches(now);
    this.reviewRuns(now);
    this.collect(now);
    this.listWaiting();
  }

  /** Ramassage des interpellés laissés seuls (voir l'en-tête). */
  private collect(now: number): void {
    const k = this.k;
    const ctx = k.ctx;
    const targeted = this.targeted;
    targeted.clear();
    const roots = k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) if (!ops[j].done && ops[j].targetId !== 0) targeted.add(ops[j].targetId);
    }
    const seen = this.seen;
    seen.clear();
    const me = ctx.player.person();
    const people = ctx.people.list;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const c = p.custody;
      if (c !== 'cuffed' && c !== 'escorted' && c !== 'handed_over') continue;
      if (p.dormant || p.vehicleId !== 0 || targeted.has(p.id)) continue;
      let holder: Agent | null = null;
      if (c === 'escorted') {
        // gardé en escorte par un agent qui n'a plus d'opération (faute de fourgon) : il l'y conduit dès qu'il y en a un
        const h = p.heldBy !== 0 ? ctx.people.get(p.heldBy) : undefined;
        if (!h || h.isPlayer || h.faction !== 'police') continue;
        holder = agentOf(h);
        if (!holder || holder.op !== null || !holder.root) continue;
      } else if (c === 'cuffed') {
        if (p.heldBy !== 0) continue;
        // le joueur à côté de lui s'en occupe
        if (me && me.vehicleId === 0 && Math.hypot(me.x - p.x, me.z - p.z) < PLAYER_NEAR) continue;
      }
      seen.add(p.id);
      const t0 = this.alone.get(p.id);
      if (t0 === undefined) {
        this.alone.set(p.id, now);
        continue;
      }
      if (now - t0 < (c === 'cuffed' ? COLLECT_CUFFED : c === 'escorted' ? COLLECT_GUARDED : COLLECT_PARKED)) continue;
      // il faut un fourgon qui puisse le recevoir (sinon il reste gardé : rien de mieux à faire)
      const van = this.nearestVan(p.x, p.z, null);
      if (!van) continue;
      if (holder) {
        startEscort(k, holder, null, p, 0);
      } else if (c === 'cuffed') {
        const pair = this.pick(p.x, p.z, COLLECT_RADIUS, null);
        if (!pair || !pair.lead) continue;
        startEscort(k, pair.lead, pair.second, p, 0);
      } else {
        // remis à un point de regroupement (procédure close) : le fourgon vient à lui, un binôme l'y fait monter
        const pair = this.pick(p.x, p.z, COLLECT_RADIUS, null);
        if (!pair || !pair.lead) continue;
        const road = k.road;
        const near = ctx.world.nearestRoad(p.x, p.z, road, 30);
        if (Math.hypot(van.x - p.x, van.z - p.z) > 10 && !this.call(van, near ? road.x : p.x, near ? road.z : p.z)) continue;
        startPickup(k, pair.lead, pair.second, p, van);
      }
      this.alone.delete(p.id);
      seen.delete(p.id);
    }
    for (const id of this.alone.keys()) if (!seen.has(id)) this.alone.delete(id);
  }

  /** Liste des interpellés qui attendent le fourgon appelé (waiting). */
  private listWaiting(): void {
    const list = this.list;
    list.length = 0;
    const ctx = this.k.ctx;
    const roots = this.k.roots;
    for (let i = 0; i < roots.length; i++) {
      const ops = roots[i].ops;
      for (let j = 0; j < ops.length; j++) {
        const op = ops[j];
        const vanId = op.stage === STAGE_PICKUP && !op.done ? op.destId : waitingVan(op);
        if (vanId === 0) continue;
        const p = ctx.people.get(op.targetId);
        if (!p) continue;
        const v = ctx.vehicles.get(vanId);
        const crew = v ? this.crewOf(v) : undefined;
        list.push({ personId: p.id, x: p.x, z: p.z, vanSquadId: crew ? crew.id : 0, vanName: crew ? crew.name : '', since: op.stageT });
      }
    }
  }
}

/**
 * Un fourgon cellulaire de police en état, conducteur à bord, est-il engagé dans la partie ? (La BRAV-M n'ouvre plus
 * alors de point de regroupement à ses machines : le fourgon vient chercher l'interpellé.)
 */
export function cellularOnSite(ctx: GameContext): boolean {
  const list = ctx.vehicles.list;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v.kind !== 'fourgon_cellulaire' || v.faction !== 'police' || (v.state !== 'ok' && v.state !== 'damaged') || v.seats[0] === 0) continue;
    // (fourgon d'une unité de commissariat au poste : pas engagé dans la partie)
    const crew = ctx.squads.list.find((s) => s.vehicleId === v.id && s.faction === 'police');
    if (!isHeldVehicle(ctx, v.id) && !(crew && isAtPost(ctx, crew.id))) return true;
  }
  return false;
}
