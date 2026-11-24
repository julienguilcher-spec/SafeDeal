/* =====================================================================================
 * COMMANDEMENT — convoi : arrivée et départ d'une unité en colonne de véhicules (bible §E.8 :
 * « fourgons alignés, cap vers la sortie, à 50 m au moins de la foule ; les groupes sortent, se
 * forment en colonne puis en ligne »).
 *
 *   arrive()  la colonne roule jusqu'au point (pilote automatique, convoi : le premier conduit, les
 *             autres suivent à intervalle régulier), les véhicules se garent ALIGNÉS (en file le long
 *             de la voie par défaut, en bataille ou en épi sur une place), puis l'unité débarque et
 *             se met en ligne devant ses véhicules ;
 *   depart()  rembarquement, puis départ en colonne vers le point de sortie.
 * Sans pilote automatique (module des véhicules absent), l'unité débarque là où elle se trouve.
 * ===================================================================================== */

import type { OrderType, Person, RayHit, RoadSample, SquadOrder, Vehicle } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { angleDiff, pointOnPolyline, projectOnPolyline } from '@/core/math';
import { agentOf, unitOf } from '../brain';
import { isProtester } from './core';
import { COMMAND_CONVOY_EVENT } from './api';
import type { ConvoyDestination, ConvoyEvent, ConvoyStage, ConvoyStatus } from './api';
import type { CommandCore } from './core';
import { frame, spell } from './texts';

interface Convoy {
  status: ConvoyStatus;
  vehicles: Vehicle[];
  dest: ConvoyDestination;
  hasDest: boolean;
  exitX: number;
  exitZ: number;
  hasExit: boolean;
  stageT: number;
  /** Point de départ de la colonne (base par défaut du retour). */
  fromX: number;
  fromZ: number;
  /** L'ordre de débarquement ou d'embarquement donné par le convoi est terminé. */
  orderDone: boolean;
  /** Instant où les retardataires ont commencé à rejoindre un véhicule (0 : pas encore). */
  stragglersAt: number;
  /** Embarquement préalable en cours (arrive avec boardFirst) : la colonne n'est pas encore partie. */
  boarding: boolean;
  /** Attente du joueur (instant du début, 0 sinon) et du dernier rappel radio. */
  waitSince: number;
  remindAt: number;
  /** Véhicules sortis de la colonne parce que bloqués (ils rejoignent seuls) et prochain contrôle. */
  solo: Vehicle[];
  unstuckAt: number;
  /** Départ échelonné : prochain véhicule à lancer, instant du dernier départ, positions de départ. */
  staggerIdx: number;
  staggerAt: number;
  startX: number[];
  startZ: number[];
  /** Foule à contourner (voir crowdZones) et instant du dernier relevé. */
  zones: { x: number; z: number; r: number }[];
  zonesAt: number;
  /** Longueur de l'itinéraire au départ (m ; −1 : pas encore relevée). */
  routeLen: number;
  /**
   * Point qu'aucun itinéraire carrossable ne dessert (dit à la radio, voir reportNoRoute) ; et l'unité, débarquée, s'y
   * rend alors à pied (false : aucun chemin à pied non plus, elle reste en attente d'ordres).
   */
  noRoute?: boolean;
  footTo?: boolean;
  /** Prochain nouvel itinéraire possible de la tête arrêtée par la foule (s). */
  rerouteAt: number;
  /** Tête de colonne : dernière position où elle bougeait et depuis quand elle n'en a pas bougé ; redémarrages. */
  stallX: number;
  stallZ: number;
  stallAt: number;
  restarts: number;
  /**
   * Véhicule de la colonne dont le joueur tient le volant (0 : aucun), sa position quand la colonne est partie, et
   * prochain rappel radio « on attend votre départ ».
   */
  drvId: number;
  drvX: number;
  drvZ: number;
  drvRemindAt: number;
  /**
   * Unités de la colonne que le joueur a commandées pendant qu'elle roule, pour un point éloigné de leurs véhicules :
   * la colonne les emporte jusqu'à l'arrêt (leurs agents restent à bord tant que le pilote automatique roule), puis le
   * débarquement de fin de trajet ne leur est pas donné — elles exécutent l'ordre du joueur.
   */
  taken: Set<number>;
  /**
   * Unités LIBÉRÉES de la colonne par un ordre du joueur (voir takeOver) : leurs véhicules l'ont quittée et se sont
   * arrêtés, elles exécutent son ordre ; la colonne ne les embarque plus, ne les attend plus, ne les débarque plus.
   */
  freed: Set<number>;
  /** Le joueur, s'il fait partie de l'unité, est attendu au départ (journée de service, « avec moi » en véhicules). */
  waitPlayer: boolean;
  /** Embarquement : instant où le joueur, attendu, est monté à bord (0 : pas encore, ou redescendu). */
  boardedAt: number;
  /**
   * « Débarquez » donnés par la colonne (unité → objet d'ordre posé dans le magasin) : dès qu'elle s'arrête, chacun
   * descend de son véhicule quand celui-ci est garé (special.ts, progressBoarding), sans attendre les autres.
   */
  debark: Map<number, SquadOrder>;
  /**
   * Véhicules qui finissaient encore le trajet seuls quand la colonne a débarqué : leurs passagers descendent à leur
   * arrivée (unloadParked), même après la fin du débarquement des autres.
   */
  joining: Set<number>;
  /** Rang de stationnement prévu (parkRow) : nombre de véhicules et longueur du plus long (m) ; 0 : aucun. */
  rowN: number;
  rowLen: number;
  /** Instant au-delà duquel un véhicule qui manœuvre encore pour se garer reste où il est (0 : pas de limite). */
  parkBy: number;
  /** Nombre de fois où la file emmêlée a été rompue en route (voir TANGLE_WAIT). */
  untangles: number;
  /** Plus court itinéraire restant relevé pour la tête pendant ce trajet (m ; −1 : pas encore) — voir shortPark. */
  remMin: number;
}

/**
 * Embarquement : attente de l'ordre « embarquer » (s), puis des retardataires (s) — au-delà, les retardataires sont
 * installés d'office (un agent bloqué derrière une grille ne retient pas la colonne cinq minutes). Tout le monde à bord,
 * la colonne part aussitôt ; le joueur à bord, elle part au plus tard BOARD_PLAYER s après lui (on ne le fait pas
 * attendre deux minutes dans un fourgon plein).
 */
const BOARD_MAX = 120;
const STRAGGLERS_MAX = 45;
const BOARD_PLAYER = 25;
/** Attente maximale du joueur avant que la colonne parte sans lui (s) — seulement là où il doit monter (waitPlayer). */
const PLAYER_WAIT = 300;
/**
 * Distance (m) des véhicules en deçà de laquelle le joueur, membre de l'unité, est attendu au départ de la colonne ; et
 * distance au point en deçà de laquelle il ne l'est pas (la colonne vient à lui).
 */
const PLAYER_NEAR = 300;
const PLAYER_HERE = 100;
/**
 * Ordre du joueur pendant que la colonne roule : un point à moins de tant de mètres du véhicule de tête de l'unité la
 * libère (ses véhicules s'arrêtent, elle descend et y va) ; au-delà, la colonne l'emporte jusqu'à l'arrêt (m).
 */
const RELEASE_NEAR = 150;
/** Un véhicule de la colonne bloqué plus longtemps que cela (s) la quitte et rejoint seul. */
const STUCK_LEAVE = 25;
/**
 * File emmêlée en route : tête immobile depuis tant de secondes loin du point, arrêtée par un véhicule ou un obstacle
 * (jamais par des personnes : la foule, on l'attend), sans qu'un nouvel ordre de la file y change rien — la file est
 * rompue, chaque véhicule finit le trajet seul (s) ; TANGLE_MAX fois au plus par trajet.
 */
const TANGLE_WAIT = 45;
const TANGLE_MAX = 4;
/** Distance au point en deçà de laquelle un véhicule arrivé prend sa place dans le rang garé (m) ; au-delà, il finit le trajet seul. */
const ROW_REACH = 160;
/**
 * Attente maximale du stationnement (s), qu'un véhicule décroché finisse ou non le trajet seul : au-delà, chacun
 * débarque là où il est (l'arrivée était sinon une attente de cinq à douze minutes, tout le monde assis).
 */
const PARK_WAIT = 30;
/**
 * Colonne arrivée au point : un véhicule resté à plus de ROW_REACH m derrière elle qui n'y sera pas avant tant de
 * secondes (à son allure du moment) n'est pas attendu pour se garer.
 */
const FAR_ETA = 60;
/**
 * Stationnement borné : un véhicule arrêté à sa manœuvre par un obstacle depuis PARK_STILL s reste où il est (ses
 * passagers descendent) ; passé PARK_WAIT, celui qui manœuvre encore a PARK_FINISH s pour finir, et celui qui est
 * arrêté (il attendait son tour, un passage) depuis PARK_STUCK s reste là. Sans ces bornes, un fourgon qui n'arrivait
 * pas à prendre sa place manœuvrait sans fin, ses passagers assis, et le point de remise n'était jamais fixé.
 */
const PARK_STILL = 10;
const PARK_FINISH = 10;
const PARK_STUCK = 3;
/** Un véhicule ne débarque à plus de tant de mètres du point que si aucune route n'y mène (m). */
const UNLOAD_FAR = 150;
/**
 * Arrêt court (shortPark) : à moins de SHORT_REACH m du point à vol d'oiseau, la colonne de la compagnie du joueur ne
 * repart pas pour un détour — itinéraire de la tête rallongé d'un coup de plus de DETOUR_MORE m (rue signalée fermée) et
 * plus de DETOUR_RATIO fois la distance au point — : elle s'arrête en file là où elle est, débarque ensemble et finit à
 * pied, s'il y a moins de SHORT_WALK m de marche. Seul un véhicule resté à plus de SHORT_FILE m de la tête (décroché)
 * vient se ranger derrière elle : la file, elle, ne bouge plus — ses agents descendent sur la chaussée, aucun fourgon
 * ne doit plus y rouler (relevé : un fourgon qui remontait la file au pas a renversé un agent descendu devant lui).
 */
const SHORT_REACH = 300;
const DETOUR_MORE = 500;
const DETOUR_RATIO = 4;
const SHORT_WALK = 600;
const SHORT_FILE = 450;
/** Débarquement : il est fini quand plus personne n'est assis ; au plus tant de secondes (s). */
const DISEMBARK_MAX = 120;
/** Voiture civile arrêtée devant un véhicule de la colonne en urgence : au-delà de tant de secondes, elle est dégagée. */
const CIVIL_CLEAR = 20;
/** Même attente au départ échelonné (s) ; relevé d'une voiture civile qui retient un véhicule : rayon (m), oubli (s). */
const CIVIL_STAGGER = 8;
const CIVIL_SPAN = 8;
const CIVIL_LAPSE = 12;
const PLAYER_REMIND = 30;
/**
 * Véhicule conduit par le joueur : il est sur le point à moins de tant de mètres (comme une tête rendue au repos près du
 * point), et il a « démarré » au-delà de tant de mètres de sa place de départ (m).
 */
const DRIVER_ARRIVE = 90;
const DRIVER_MOVED = 30;
/** Longueur du début d'itinéraire où lineUp range une file (douze véhicules au plus, ~17 m chacun) (m). */
const LINE_SPAN = 220;
/** Place laissée devant la tête de la file avant un mur (de quoi braquer, même un canon à eau) (m). */
const WALL_ROOM = 30;

/**
 * Allure de croisière demandée pour une colonne en urgence (deux tons) ; le pilote automatique la porte à une fois et
 * demie en intervention urgente.
 */
function urgentSpeed(core: CommandCore): number {
  return core.tuning.convoySpeed;
}

/** « DEUX véhicules en colonne », « UN véhicule » : un véhicule seul ne fait pas une colonne (annonces radio du trajet). */
function fleetWords(n: number, column: boolean): string {
  return n === 1 ? spell(1) + ' véhicule' : spell(n) + ' véhicules' + (column ? ' en colonne' : '');
}

/** Rang d'un véhicule dans la colonne : commandement en tête, fourgons, puis le cellulaire en serre-file. */
function columnRank(v: Vehicle): number {
  return v.kind === 'vl_commandement' ? 0 : v.kind === 'fourgon_cellulaire' ? 2 : 1;
}

export class ConvoyControl {
  readonly list: Convoy[] = [];
  private thinkAt = 0;
  private readonly pathBuf: number[] = [];
  private readonly headBuf: number[] = [];
  private readonly lineBuf: number[] = [];
  private readonly rayHit: RayHit = makeRayHit();
  private readonly roadBuf: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly fleetBuf: Vehicle[] = [];
  private readonly busy: number[] = [];
  /** Véhicules de colonne retenus par une voiture civile à l'arrêt : depuis quand, dernier relevé, où (voir civilWait). */
  private readonly civilHeld = new Map<number, { since: number; seen: number; x: number; z: number }>();

  constructor(private readonly core: CommandCore) {}

  reset(): void {
    this.list.length = 0;
    this.thinkAt = 0;
    this.civilHeld.clear();
  }

  /**
   * Le joueur donne un ordre à cette unité — LA règle unique entre un ordre du joueur et une colonne en cours (appelée
   * par l'interface avant l'envoi, sans l'ordre, puis par le commandement pour chaque ordre `byPlayer`, avec lui) :
   *   - embarquement (caserne, rembarquement) : l'unité quitte la colonne, sauf pour « avec moi » (elle monte avec le
   *     joueur et part avec la colonne) ; sans l'ordre, rien n'est décidé ;
   *   - colonne qui roule : un point à moins de RELEASE_NEAR m du véhicule de tête de l'unité la libère ; plus loin (ou
   *     sans l'ordre), la colonne l'emporte jusqu'à l'arrêt et ne lui donnera pas le débarquement de fin de trajet ;
   *     « avec moi » quand le joueur roule dans la colonne : elle y est déjà, rien ne change ;
   *   - stationnement, débarquement : l'unité est libérée (ses agents descendent et y vont tout de suite).
   * Libérée : ses véhicules (et ceux de sa descendance) quittent la colonne et s'arrêtent, ses agents ne rejoignent plus
   * de place à bord ; la colonne vidée, ou dont l'unité de tête est libérée, est annulée (étape « annule »).
   * Un ordre donné à une unité dont dépend la colonne vaut pour toute la colonne. true si une unité a été libérée.
   */
  takeOver(squadId: number, order?: Partial<SquadOrder>): boolean {
    const core = this.core;
    let freed = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]!;
      const root = c.status.squadId;
      const stage = c.status.stage;
      const boarding = (stage === 'route' && c.boarding) || stage === 'rembarquement';
      const driving = stage === 'route' && !c.boarding;
      if (!boarding && !driving && stage !== 'stationnement' && stage !== 'debarquement') continue;
      const inside = core.isUnder(squadId, root);
      if (!inside && !core.isUnder(root, squadId)) continue;
      const id = inside ? squadId : root;
      // (embarquement, « avec moi » : l'unité monte avec le joueur et part avec la colonne — y compris celle qu'un ordre
      // donné plus tôt à la caserne en avait libérée : elle y reprend sa place, voir rejoin)
      if (boarding && order && this.withMe(order)) {
        this.rejoin(c, id);
        continue;
      }
      if (this.isFreed(c, id)) continue;
      if (boarding) {
        if (!order) continue;
      } else if (driving) {
        if (order && this.withMe(order) && this.playerAboard(c)) continue;
        // (retour sans débarquement — « Rentrer au commissariat » — : l'ordre du joueur l'interrompt, quel que soit son
        // point ; emportée, l'unité serait ramenée à ses places avant d'y aller)
        if (!order || (this.farFrom(c, id, order) && c.dest.disembark !== false)) {
          c.taken.add(id);
          continue;
        }
        // (toute la colonne libérée en route par un ordre sans point — l'unité finit à pied, ticket bloqué de la ligne
        // d'état : elle dit où elle s'est arrêtée, comme une colonne qui ne passe plus)
        if (id === root && (order.x === undefined || order.z === undefined)) {
          this.reportShort(c);
          // (ses véhicules qui roulent encore loin du point finissent le trajet : voir carryOn)
          if (this.carryOn(c)) {
            freed = true;
            continue;
          }
        }
      }
      if (this.release(c, id)) freed = true;
    }
    return freed;
  }

  /** Le véhicule roule-t-il dans une colonne en route (trajet, départ de fin de mission) ? Voir CommandApi.carrying. */
  carrying(vehicleId: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i]!;
      const st = c.status.stage;
      if (!((st === 'route' && !c.boarding) || st === 'depart')) continue;
      for (const v of c.vehicles) if (v.id === vehicleId) return true;
      for (const v of c.solo) if (v.id === vehicleId) return true;
    }
    return false;
  }

  /**
   * La colonne garde-t-elle encore les passagers de ce véhicule à bord ? En route (voir carrying), et au stationnement
   * tant qu'il roule encore vers sa place ou s'y gare : ils descendent quand il est garé (special.ts, débarquement).
   */
  holding(vehicleId: number): boolean {
    if (this.carrying(vehicleId)) return true;
    const ap = this.core.autopilot;
    if (!ap) return false;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i]!;
      const st = c.status.stage;
      if (st !== 'stationnement' && st !== 'debarquement' && st !== 'en_place') continue;
      for (const v of c.vehicles) {
        if (v.id !== vehicleId) continue;
        const a = ap.status(v);
        if (a.state === 'arrive') return false;
        // (débarquement fini : seulement celui qui finit de se garer ou le trajet seul — le véhicule peut ensuite
        // servir à autre chose, une colonne « avec moi » par exemple)
        if (st === 'en_place') return a.mode === 'park' || (a.mode === 'drive' && c.joining.has(v.id));
        return a.mode === 'park' || a.mode === 'drive' || a.mode === 'follow';
      }
    }
    return false;
  }

  /** Ordre « avec moi » : suivre le joueur (à pied ou en véhicules), ou monter pour le suivre. */
  private withMe(o: Partial<SquadOrder>): boolean {
    const pid = this.core.ctx.player.state.personId;
    if (o.type === 'avec_moi' || o.type === 'embarquer') return true;
    return o.type === 'suivre' && pid !== 0 && (o.targetId === pid || ((o.targetId ?? 0) === 0 && o.issuedBy === pid));
  }

  /** Le point de l'ordre est-il à plus de RELEASE_NEAR m du véhicule de tête de l'unité dans la colonne ? */
  private farFrom(c: Convoy, squadId: number, o: Partial<SquadOrder>): boolean {
    if (o.x === undefined || o.z === undefined) return false;
    this.core.fleet(squadId, this.fleetBuf);
    let best = Infinity;
    for (const v of this.fleetBuf) {
      if (c.vehicles.indexOf(v) < 0 && c.solo.indexOf(v) < 0) continue;
      const d = Math.hypot(v.x - o.x, v.z - o.z);
      if (d < best) best = d;
    }
    return best !== Infinity && best > RELEASE_NEAR;
  }

  /** Le joueur est-il assis dans un véhicule de cette colonne ? */
  private playerAboard(c: Convoy): boolean {
    const me = this.core.ctx.player.person();
    if (!me || me.vehicleId === 0) return false;
    for (const v of c.vehicles) if (v.id === me.vehicleId) return true;
    for (const v of c.solo) if (v.id === me.vehicleId) return true;
    return false;
  }

  /** L'unité (ou une unité dont elle dépend) a-t-elle été libérée de cette colonne ? */
  private isFreed(c: Convoy, squadId: number): boolean {
    for (const id of c.freed) if (this.core.isUnder(squadId, id)) return true;
    return false;
  }

  /** Personne qui fait encore partie de la colonne (ni d'une unité libérée, ni, avec `carried`, d'une unité emportée). */
  private kept(c: Convoy, p: Person, carried = false): boolean {
    if (p.squadId === 0 || (c.freed.size === 0 && (!carried || c.taken.size === 0))) return true;
    if (this.isFreed(c, p.squadId)) return false;
    if (carried) for (const id of c.taken) if (this.core.isUnder(p.squadId, id)) return false;
    return true;
  }

  /**
   * Libère l'unité de la colonne (voir takeOver) : ses véhicules la quittent et s'arrêtent (jamais celui que conduit
   * le joueur), la file restante est reformée ; la colonne dont l'unité de tête est libérée, ou qui n'a plus de
   * véhicule, est annulée. true si l'unité faisait partie de la colonne.
   */
  private release(c: Convoy, squadId: number): boolean {
    const core = this.core;
    const ap = core.autopilot;
    core.fleet(squadId, this.fleetBuf);
    let moved = 0;
    for (const v of this.fleetBuf) {
      const k = c.vehicles.indexOf(v);
      const j = c.solo.indexOf(v);
      if (k < 0 && j < 0) continue;
      if (k >= 0) {
        c.vehicles.splice(k, 1);
        c.startX.splice(k, 1);
        c.startZ.splice(k, 1);
        if (k < c.staggerIdx) c.staggerIdx--;
      }
      if (j >= 0) c.solo.splice(j, 1);
      moved++;
      if (ap && !this.isPlayerWheel(v)) ap.stop(v);
    }
    // agents que la colonne envoyait vers une place libre à bord (boardStragglers) : ils y renoncent
    const n = core.members(squadId, core.people2);
    for (let i = 0; i < n; i++) {
      const p = core.people2[i]!;
      const a = p.vehicleId === 0 ? agentOf(p) : null;
      if (a && a.boardId !== 0) a.boardId = 0;
    }
    for (const id of [...c.taken]) if (core.isUnder(id, squadId)) c.taken.delete(id);
    c.freed.add(squadId);
    // (les véhicules qui finissent le trajet seuls font toujours partie de la colonne)
    c.status.vehicles = c.vehicles.length + c.solo.length;
    if (squadId === c.status.squadId || c.vehicles.length + c.solo.length === 0) {
      this.drop(c);
      return true;
    }
    // la file qui roule encore se reforme sans eux (un suiveur suivait peut-être un véhicule arrêté)
    if (moved > 0 && ap && c.status.stage === 'route' && !c.boarding && !c.dest.stagger && c.vehicles.length > 0) {
      ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
    }
    return true;
  }

  /**
   * Embarquement : l'unité (et celles qui en dépendent) libérée de la colonne par un ordre du joueur, puis rappelée
   * « avec moi », y reprend sa place — ses véhicules repartent avec la colonne, ses agents sont de nouveau attendus à
   * bord (thinkBoard, boardStragglers). Relevé de la journée de service (République) : la section envoyée barrer une rue
   * à la caserne, rappelée par A, restait hors de la colonne ; la compagnie partait sans elle, et le commandant la
   * retrouvait à plus d'un kilomètre à l'arrivée.
   */
  private rejoin(c: Convoy, squadId: number): void {
    const core = this.core;
    let back = false;
    for (const f of [...c.freed]) {
      if (!core.isUnder(f, squadId)) continue;
      c.freed.delete(f);
      back = true;
      core.fleet(f, this.fleetBuf);
      for (const v of this.fleetBuf) {
        if (v.def.flying || v.kind === 'moto_bravm' || !core.usable(v) || c.vehicles.indexOf(v) >= 0 || c.solo.indexOf(v) >= 0) continue;
        c.vehicles.push(v);
      }
    }
    if (!back) return;
    c.vehicles.sort((a, b) => columnRank(a) - columnRank(b) || a.id - b.id);
    c.status.vehicles = c.vehicles.length + c.solo.length;
    // (l'embarquement n'est plus « fait » : ses agents sont à pied)
    c.orderDone = false;
    c.stragglersAt = 0;
  }

  /**
   * « Finissez à pied » donné à toute une colonne en route (ordre du joueur sans point : surveillance des ordres directs,
   * ui/command/direct) alors que certains de ses véhicules roulent encore à plus de UNLOAD_FAR m du point : ceux-là
   * finissent le trajet — la colonne les emporte jusqu'à l'arrêt, leurs agents descendent là et exécutent l'ordre du
   * joueur ; les véhicules arrivés, à portée de marche ou arrêtés pour de bon quittent la colonne et s'arrêtent, leurs
   * agents descendent tout de suite. La colonne ne donnera pas de « débarquez » (unité libérée). Sans cela, toute la
   * colonne s'arrêtait net : dix véhicules sur le point, quatre laissés entre 230 et 590 m, qui roulaient vers lui
   * (« Toute la compagnie » à 600 m, Concorde ; colonne garantie, plan « ordres directs » P17). false : aucun véhicule
   * ne roule plus loin du point — la colonne est libérée en entier (release).
   */
  private carryOn(c: Convoy): boolean {
    const core = this.core;
    const ap = core.autopilot;
    if (!ap) return false;
    const d = c.dest;
    const rolls = (v: Vehicle): boolean => {
      if (this.isPlayerWheel(v) || !core.usable(v) || Math.hypot(v.x - d.x, v.z - d.z) <= UNLOAD_FAR) return false;
      const st = ap.status(v);
      if (st.mode !== 'drive' && st.mode !== 'follow') return false;
      return st.state !== 'echec' && !((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > STUCK_LEAVE);
    };
    if (!c.vehicles.some(rolls) && !c.solo.some(rolls)) return false;
    let stopped = 0;
    for (let k = c.vehicles.length - 1; k >= 0; k--) {
      const v = c.vehicles[k]!;
      if (rolls(v)) continue;
      c.vehicles.splice(k, 1);
      if (k < c.startX.length) {
        c.startX.splice(k, 1);
        c.startZ.splice(k, 1);
      }
      if (k < c.staggerIdx) c.staggerIdx--;
      stopped++;
      if (!this.isPlayerWheel(v)) ap.stop(v);
    }
    for (let j = c.solo.length - 1; j >= 0; j--) {
      const v = c.solo[j]!;
      if (rolls(v)) continue;
      c.solo.splice(j, 1);
      stopped++;
      if (!this.isPlayerWheel(v)) ap.stop(v);
    }
    // agents que la colonne envoyait vers une place libre à bord (boardStragglers) : ils y renoncent
    const n = core.members(c.status.squadId, core.people2);
    for (let i = 0; i < n; i++) {
      const p = core.people2[i]!;
      const a = p.vehicleId === 0 ? agentOf(p) : null;
      if (a && a.boardId !== 0) a.boardId = 0;
    }
    c.taken.clear();
    c.freed.add(c.status.squadId);
    c.status.vehicles = c.vehicles.length + c.solo.length;
    // la file qui roule encore se reforme sans eux (un suiveur suivait peut-être un véhicule arrêté)
    if (stopped > 0 && c.status.stage === 'route' && !c.boarding && !c.dest.stagger && c.vehicles.length > 0) {
      ap.convoy(c.vehicles, d.x, d.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
    }
    return true;
  }

  /** Les véhicules de l'unité (et de sa descendance) ne font plus partie de la colonne `c`, sans être arrêtés. */
  private forget(c: Convoy, squadId: number): void {
    this.core.fleet(squadId, this.fleetBuf);
    for (const v of this.fleetBuf) {
      const k = c.vehicles.indexOf(v);
      if (k >= 0) {
        c.vehicles.splice(k, 1);
        if (k < c.startX.length) {
          c.startX.splice(k, 1);
          c.startZ.splice(k, 1);
        }
        if (k < c.staggerIdx) c.staggerIdx--;
      }
      const j = c.solo.indexOf(v);
      if (j >= 0) c.solo.splice(j, 1);
    }
    c.status.vehicles = c.vehicles.length + c.solo.length;
  }

  /** Colonne annulée (ordre du joueur à toute l'unité, plus de véhicule) : annoncée, puis oubliée. */
  private drop(c: Convoy): void {
    this.setStage(c, 'annule');
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  /**
   * Débarquement de fin de trajet donné aux seules branches de la colonne qui ne sont ni libérées ni emportées pour un
   * ordre du joueur (l'ordre donné plus haut reprendrait sinon toute la descendance) : elles exécutent ses ordres.
   */
  private disembarkRest(c: Convoy, squadId: number, skip: ReadonlySet<number>, order: Parameters<CommandCore['issue']>[1]): void {
    if (skip.has(squadId)) return;
    // (branches écartées qui exécutent déjà un ordre du joueur, en unités autonomes : l'ordre donné ici ne les remplace
    // pas — sim/police/system.ts handleOrder — il est donc donné à l'unité elle-même, ses propres agents compris)
    let mixed = false;
    for (const id of skip) {
      if (!this.core.isUnder(id, squadId)) continue;
      const q = this.core.ctx.squads.get(id);
      const u = q ? unitOf(q) : null;
      if (!q || !u || q.order.byPlayer !== true || !u.isRoot || u.joinedTo) { mixed = true; break; }
    }
    if (!mixed) {
      const o = this.core.issue(squadId, { ...order });
      if (o) c.debark.set(squadId, o);
      return;
    }
    const kids = this.core.ctx.squads.childrenOf(squadId);
    for (let i = 0; i < kids.length; i++) this.disembarkRest(c, kids[i].id, skip, order);
  }

  /**
   * Conduite demandée au pilote automatique : en urgence (défaut), deux tons et allure de colonne ; sans urgence
   * (retour au commissariat), allure de la circulation, sans sirène.
   */
  private pace(c: Convoy): { urgence: boolean; speed: number | undefined } {
    const urgent = c.dest.urgence !== false;
    return { urgence: urgent, speed: urgent ? urgentSpeed(this.core) : undefined };
  }

  /**
   * Un véhicule de la colonne roule seul jusqu'au point. En urgence : conduite d'intervention (il double ce qui l'arrête).
   * Sans urgence : « colonne d'un seul véhicule » — sans deux tons, mais il contourne comme une colonne une voiture
   * garée, accidentée ou arrêtée sur sa voie ; en simple conduite, il l'attendait indéfiniment (le pilote automatique
   * ne double un véhicule arrêté qu'en urgence ou en colonne).
   */
  private driveOne(c: Convoy, v: Vehicle, x: number, z: number, stopBefore: number): boolean {
    const ap = this.core.autopilot;
    if (!ap) return false;
    if (c.dest.urgence !== false) return ap.driveTo(v, x, z, { ...this.pace(c), stopBefore, avoid: this.crowdZones(c) });
    return ap.convoy([v], x, z, { gap: this.core.tuning.convoyGap, ...this.pace(c), stopBefore, avoid: this.crowdZones(c) });
  }

  /** Trajet sans urgence : sirène et gyrophares éteints (restés allumés d'une intervention précédente). */
  private quiet(c: Convoy): void {
    if (c.dest.urgence !== false) return;
    const ext = this.core.ctx.service<{ setSiren?(v: Vehicle, mode: 0 | 1 | 2): void; setBeacons?(v: Vehicle, on: boolean): void }>('vehicles.ext');
    for (const v of c.vehicles) {
      if (v.siren !== 0) {
        if (ext && ext.setSiren) ext.setSiren(v, 0);
        else v.siren = 0;
      }
      if (v.beacons) {
        if (ext && ext.setBeacons) ext.setBeacons(v, false);
        else v.beacons = false;
      }
    }
  }

  of(squadId: number): Convoy | null {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].status.squadId === squadId) return this.list[i];
    return null;
  }

  statusOf(squadId: number): ConvoyStatus | null {
    const c = this.of(squadId);
    return c ? c.status : null;
  }

  /** Le véhicule roule-t-il dans une colonne sans urgence encore en route ? */
  quietRun(vehicleId: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.dest.urgence !== false || c.status.stage !== 'route') continue;
      for (const v of c.vehicles) if (v.id === vehicleId) return true;
      for (const v of c.solo) if (v.id === vehicleId) return true;
    }
    return false;
  }

  /** Un convoi de cette unité est-il encore en route, en stationnement ou en débarquement ? */
  arriving(squadId: number): boolean {
    const c = this.of(squadId);
    return !!c && (c.status.stage === 'route' || c.status.stage === 'stationnement' || c.status.stage === 'debarquement');
  }

  private setStage(c: Convoy, stage: ConvoyStage): void {
    if (c.status.stage === stage) return;
    c.status.stage = stage;
    c.stageT = this.core.now;
    const e: ConvoyEvent = { squadId: c.status.squadId, stage };
    this.core.ctx.events.emitAny(COMMAND_CONVOY_EVENT, e);
  }

  private obtain(squadId: number): Convoy {
    let c = this.of(squadId);
    if (!c) {
      c = {
        status: { squadId, stage: 'route', vehicles: 0, parked: 0, alignError: -1, headingError: -1, t0: this.core.now, aboard: 0, total: 0, departIn: 0, awaitingPlayer: false, remaining: 0, route: [] },
        vehicles: [], dest: { x: 0, z: 0, heading: 0 }, hasDest: false, exitX: 0, exitZ: 0, hasExit: false, stageT: this.core.now,
        fromX: 0, fromZ: 0, orderDone: false, stragglersAt: 0, boarding: false, waitSince: 0, remindAt: 0, solo: [], unstuckAt: 0, staggerIdx: 0, staggerAt: 0, startX: [], startZ: [], zones: [], zonesAt: 0, routeLen: -1, rerouteAt: 0,
        stallX: 0, stallZ: 0, stallAt: 0, restarts: 0, drvId: 0, drvX: 0, drvZ: 0, drvRemindAt: 0,
        taken: new Set<number>(), freed: new Set<number>(), waitPlayer: false, boardedAt: 0, debark: new Map<number, SquadOrder>(), joining: new Set<number>(), rowN: 0, rowLen: 0,
        parkBy: 0, untangles: 0, remMin: -1,
      };
      this.list.push(c);
    }
    return c;
  }

  private gather(c: Convoy): void {
    const core = this.core;
    core.fleet(c.status.squadId, c.vehicles);
    for (let i = c.vehicles.length - 1; i >= 0; i--) {
      const v = c.vehicles[i];
      if (v.def.flying || v.kind === 'moto_bravm' || !core.usable(v)) c.vehicles.splice(i, 1);
    }
    c.vehicles.sort((a, b) => columnRank(a) - columnRank(b) || a.id - b.id);
    c.status.vehicles = c.vehicles.length;
  }

  /**
   * Départ d'un stationnement : la colonne part dans l'ordre PHYSIQUE — d'abord le véhicule le plus proche de la
   * sortie (le début de l'itinéraire vers la destination), sans quoi un fourgon attend celui qui le bloque et qui
   * l'attend lui-même. Le véhicule de commandement reste en tête s'il n'est pas enfermé derrière les autres.
   */
  private orderForDeparture(c: Convoy, tx: number, tz: number, commandFirst = true, urgent = true): void {
    const list = c.vehicles;
    if (list.length < 2) return;
    const ctx = this.core.ctx;
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    // direction de la sortie : point de l'itinéraire à ~40 m du stationnement (sinon, droit vers la destination)
    let ex = tx - cx, ez = tz - cz;
    const path = this.pathBuf;
    path.length = 0;
    try {
      if (this.departRoute(c, cx, cz, tx, tz, path, urgent) && path.length >= 4) {
        for (let i = 2; i < path.length; i += 2) {
          const d = Math.hypot(path[i]! - cx, path[i + 1]! - cz);
          ex = path[i]! - cx;
          ez = path[i + 1]! - cz;
          if (d > 40) break;
        }
      }
    } catch {
      // itinéraire indisponible : direction de la destination
    }
    const l = Math.hypot(ex, ez);
    if (l < 1) return;
    const fx = ex / l, fz = ez / l;
    // abscisse le long de l'itinéraire quand il est connu (véhicules en file le long de la voie), sinon projection
    const onPath = path.length >= 4;
    const tmp = { x: 0, z: 0 };
    const ahead = (v: Vehicle): number => (onPath ? projectOnPolyline(v.x, v.z, path, tmp) : (v.x - cx) * fx + (v.z - cz) * fz);
    let front = -Infinity;
    for (const v of list) if (ahead(v) > front) front = ahead(v);
    // tête : le plus avancé vers la sortie (le véhicule de commandement s'il n'est pas enfermé)
    let head = 0;
    let best = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      const k = commandFirst && v.kind === 'vl_commandement' && ahead(v) > front - 1.5 ? 1e9 : ahead(v);
      if (k > best) { best = k; head = i; }
    }
    // la tête dont l'itinéraire part tout droit devant elle, quand un véhicule de la colonne est garé juste devant son
    // nez : celui-ci prend la tête à sa place (et ainsi de suite) — sinon la tête attendait, nez contre lui, celui qui
    // devait la suivre, et la relance « tête bloquée » redésignait la même (commissariat du 1er : colonne figée un quart
    // d'heure)
    const seen = new Set<number>([head]);
    for (let guard = 0; guard < list.length; guard++) {
      const k = this.blockerAhead(c, list[head]!, tx, tz, urgent);
      if (k < 0 || seen.has(k)) break;
      seen.add(k);
      head = k;
    }
    // puis chacun suit son voisin immédiat : la file se défait dans l'ordre où elle est garée
    const out: Vehicle[] = [list[head]!];
    const rest = list.filter((_, i) => i !== head);
    while (rest.length > 0) {
      const last = out[out.length - 1]!;
      let k = 0;
      let kd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const d = Math.hypot(rest[i]!.x - last.x, rest[i]!.z - last.z) - ahead(rest[i]!) * 0.05;
        if (d < kd) { kd = d; k = i; }
      }
      out.push(rest.splice(k, 1)[0]!);
    }
    for (let i = 0; i < out.length; i++) list[i] = out[i]!;
  }

  /**
   * Véhicule de la colonne (indice dans c.vehicles, −1 si aucun) garé juste devant le nez de `v` (moins de 6 m entre
   * les pare-chocs, dans son couloir) quand l'itinéraire que le pilote automatique calculera pour `v` s'il prend la
   * tête part en marche avant (depuis sa place, dans le sens où il est tourné, demi-tour coûté comme le pilote le
   * coûte) : tête désignée, il resterait nez contre lui. Un itinéraire qui commence par un demi-tour n'est pas gêné.
   */
  private blockerAhead(c: Convoy, v: Vehicle, tx: number, tz: number, urgent: boolean): number {
    const list = c.vehicles;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let best = -1;
    let bestGap = Infinity;
    for (let k = 0; k < list.length; k++) {
      const o = list[k]!;
      if (o === v) continue;
      const along = (o.x - v.x) * fx + (o.z - v.z) * fz;
      const lat = Math.abs((o.x - v.x) * fz - (o.z - v.z) * fx);
      // (emprise de l'autre selon son cap : de travers, il barre plus large et moins long)
      const oc = Math.abs(Math.sin(o.heading) * fx + Math.cos(o.heading) * fz);
      const oLen = o.def.length * 0.5 * oc + o.def.width * 0.5 * (1 - oc);
      const oWid = o.def.width * 0.5 * oc + o.def.length * 0.5 * (1 - oc);
      const gap = along - v.def.length * 0.5 - oLen;
      if (along <= 0 || gap > 6 || gap >= bestGap || lat > v.def.width * 0.5 + oWid + 0.3) continue;
      best = k;
      bestGap = gap;
    }
    if (best < 0) return -1;
    // l'itinéraire de v part-il devant lui ? (premier point à plus de 4 m de son centre)
    const ctx = this.core.ctx;
    const path = this.headBuf;
    path.length = 0;
    try {
      if (!ctx.world.findPath(v.x, v.z, tx, tz, 'vehicle', path, {
        heading: v.heading, uturn: this.uturnCost(v), avoid: this.crowdZones(c), contraflow: urgent ? 3 : 0, minWidth: v.def.width + 1.2,
      }) || path.length < 4) return -1;
    } catch {
      return -1;
    }
    for (let i = 2; i + 1 < path.length; i += 2) {
      const dx = path[i]! - v.x, dz = path[i + 1]! - v.z;
      if (Math.hypot(dx, dz) < 4) continue;
      return dx * fx + dz * fz > 0 ? best : -1;
    }
    return -1;
  }

  /** Coût d'un demi-tour sur place pour ce véhicule dans cette rue (s), comme le pilote automatique le calcule. */
  private uturnCost(v: Vehicle): number {
    const world = this.core.ctx.world;
    const road = this.roadBuf;
    if (world.edgeCount === 0 || !world.nearestRoad(v.x, v.z, road, 25)) return 30;
    const r = v.def.wheelbase / Math.tan(v.def.maxSteer);
    if (road.width >= 2 * r + v.def.width + 1) return 8;
    if (road.width >= v.def.length + 3) return 35;
    return 200;
  }

  /**
   * Itinéraire de sortie du stationnement, calculé comme le pilote automatique calculera celui de la tête (autopilot.ts,
   * plan) : départ dans le sens où les véhicules sont tournés, foule contournée (crowdZones), contresens au pas permis
   * en urgence, chaussée assez large. Le plus court chemin brut partait parfois de l'autre côté : la tête désignée était
   * alors le véhicule de queue, qui butait contre ceux qui devaient le suivre — colonne figée au départ.
   */
  private departRoute(c: Convoy, cx: number, cz: number, tx: number, tz: number, out: number[], urgent = true): boolean {
    const list = c.vehicles;
    let hx = 0, hz = 0;
    for (const v of list) { hx += Math.sin(v.heading); hz += Math.cos(v.heading); }
    // (cap commun seulement si les véhicules sont rangés dans le même sens)
    const aligned = list.length > 0 && Math.hypot(hx, hz) > list.length * 0.7;
    const width = list.reduce((w, v) => Math.max(w, v.def.width), 0);
    return this.core.ctx.world.findPath(cx, cz, tx, tz, 'vehicle', out, {
      heading: aligned ? Math.atan2(hx, hz) : NaN,
      uturn: aligned ? 35 : 0,
      avoid: this.crowdZones(c),
      contraflow: urgent ? 3 : 0,
      minWidth: width + 1.2,
    });
  }

  /**
   * Avant le départ : chaque véhicule a un conducteur (un passager de l'IA prend le volant si le siège est vide) ;
   * un véhicule resté vide est laissé sur place (il casserait la colonne : ceux qui le suivent l'attendraient).
   */
  private manVehicles(c: Convoy): void {
    const ctx = this.core.ctx;
    for (let i = c.vehicles.length - 1; i >= 0; i--) {
      const v = c.vehicles[i]!;
      if (v.seats[0] !== 0) continue;
      if (!this.takeWheel(v)) c.vehicles.splice(i, 1);
    }
    c.status.vehicles = c.vehicles.length;
  }

  /** Volant libre : un passager de l'IA (policier libre) passe au volant. true s'il a pu le prendre. */
  private takeWheel(v: Vehicle): boolean {
    const ctx = this.core.ctx;
    for (let s = 1; s < v.seats.length; s++) {
      const p = v.seats[s] !== 0 ? ctx.people.get(v.seats[s]!) : undefined;
      if (!p || p.isPlayer || p.custody !== 'free' || p.faction !== 'police') continue;
      ctx.vehicles.exit(p);
      if (ctx.vehicles.enter(p, v, 0)) return true;
      ctx.vehicles.enter(p, v, s);
    }
    return false;
  }

  /**
   * Le joueur a quitté le volant d'un véhicule déjà parti de la colonne échelonnée (il l'avait pris, la colonne
   * l'attendait) : un équipier reprend le volant et le véhicule repart vers le point. Sans cela, le véhicule restait
   * sans conducteur là où le joueur l'avait laissé, et l'unité n'arrivait jamais (« Rentrer au commissariat »).
   */
  private remanLaunched(c: Convoy): void {
    for (let i = 0; i < c.staggerIdx && i < c.vehicles.length; i++) {
      const v = c.vehicles[i]!;
      if (v.seats[0] !== 0 || Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < 6) continue;
      if (this.takeWheel(v)) this.driveOne(c, v, c.dest.x, c.dest.z, 2 + i * 11);
    }
  }

  /**
   * Même reprise pour une colonne qui roule derrière sa tête (thinkRoute) : chaque véhicule laissé sans conducteur loin du
   * point en retrouve un (un équipier passe au volant) ; celui qu'aucun équipier ne peut conduire quitte la colonne, qui se
   * reforme sans lui et repart. true si la colonne a été relancée.
   */
  private remanRoute(c: Convoy): boolean {
    const ap = this.core.autopilot;
    if (!ap || !c.hasDest) return false;
    let changed = false;
    for (let i = c.vehicles.length - 1; i >= 0; i--) {
      const v = c.vehicles[i]!;
      if (v.seats[0] !== 0 || Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < 90) continue;
      changed = true;
      if (!this.takeWheel(v)) c.vehicles.splice(i, 1);
    }
    for (const v of c.solo) {
      if (v.seats[0] !== 0 || Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < 90) continue;
      if (this.takeWheel(v)) this.driveOne(c, v, c.dest.x, c.dest.z, 4 + (c.vehicles.length + c.solo.indexOf(v)) * 9);
    }
    if (!changed || c.vehicles.length === 0) return false;
    c.status.vehicles = c.vehicles.length;
    return ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: this.core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
  }


  /**
   * Avant le départ de la colonne : les agents restés à pied près des véhicules (places de leur groupe déjà
   * prises) montent là où il reste de la place, fourgon cellulaire compris. Personne ne reste devant les roues.
   */
  private seatStragglers(c: Convoy, unseen = false): void {
    const core = this.core;
    const ctx = core.ctx;
    const n = core.members(c.status.squadId, core.people);
    const reserved = this.reservedFor(c);
    const me = ctx.player.person();
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.vehicleId !== 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free' || !this.kept(c, p)) continue;
      // (départ sans attendre les derniers, BOARD_PLAYER : celui qui marchait encore vers un fourgon, hors de la vue du
      // joueur, l'a rejoint — il ne reste pas seul à la caserne)
      const far = unseen && (!me || Math.hypot(me.x - p.x, me.z - p.z) > 40);
      for (let k = c.vehicles.length - 1; k >= 0; k--) {
        const v = c.vehicles[k];
        if (!far && Math.hypot(v.x - p.x, v.z - p.z) > 60) continue;
        if (v.id === reserved && this.freeSeats(v) <= 1) continue;
        if (ctx.vehicles.enter(p, v, 'passenger')) break;
      }
    }
  }

  // ───────────────────────────── arrivée ─────────────────────────────

  arrive(squadId: number, dest: ConvoyDestination): boolean {
    const core = this.core;
    const squad = core.ctx.squads.get(squadId);
    if (!squad) return false;
    // l'unité (ou une de ses subordonnées) roulait dans une autre colonne : elle la quitte pour ce trajet-ci
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]!;
      const st = o.status.stage;
      if (o.status.squadId === squadId) continue;
      if (st !== 'route' && st !== 'stationnement' && st !== 'debarquement' && st !== 'rembarquement') {
        // (colonne arrivée ou repartie : ses véhicules qui partent dans celle-ci n'en sont plus — chaque véhicule ne suit
        // que la dernière colonne ordonnée, voir carrying / holding)
        if (core.isUnder(squadId, o.status.squadId)) this.forget(o, squadId);
        continue;
      }
      if (core.isUnder(squadId, o.status.squadId) && !this.isFreed(o, squadId)) this.release(o, squadId);
      else if (core.isUnder(o.status.squadId, squadId)) this.drop(o);
    }
    const c = this.obtain(squadId);
    // même retour sans débarquement relancé vers le même point (commissariat qui relance une unité arrêtée en route) :
    // « point inaccessible » n'est pas redit à chaque relance
    const again = c.hasDest && dest.disembark === false && c.dest.disembark === false && Math.hypot(dest.x - c.dest.x, dest.z - c.dest.z) < 5;
    c.taken.clear();
    c.freed.clear();
    c.debark.clear();
    c.joining.clear();
    c.boardedAt = 0;
    c.rowN = 0;
    c.parkBy = 0;
    c.untangles = 0;
    c.remMin = -1;
    c.dest = { ...dest };
    c.hasDest = true;
    c.routeLen = -1;
    c.orderDone = false;
    c.stallAt = 0;
    c.restarts = 0;
    c.noRoute = again && c.noRoute;
    c.footTo = false;
    c.drvId = 0;
    c.status.awaitingDriver = false;
    c.status.t0 = core.now;
    c.status.parked = 0;
    c.status.alignError = -1;
    c.status.headingError = -1;
    this.gather(c);
    this.quiet(c);
    const lead = c.vehicles[0];
    if (lead) {
      c.fromX = lead.x;
      c.fromZ = lead.z;
    }
    const ap = core.autopilot;
    // retour sans urgence donné en plein trajet d'urgence : le véhicule s'arrête au lieu de finir l'ancien trajet deux
    // tons pendant l'embarquement
    if (ap && dest.urgence === false) {
      for (const v of c.vehicles) {
        const st = ap.status(v);
        if (st.mode === 'drive' && st.urgence) ap.stop(v);
      }
    }
    c.boarding = false;
    c.waitSince = 0;
    // le joueur, s'il fait partie de l'unité, n'est attendu que là où il doit monter : près des véhicules (journée de
    // service, « avec moi » en véhicules) — une colonne qui vient le chercher, ou qu'il a envoyée ailleurs, ne
    // l'attend pas cinq minutes à la caserne
    c.waitPlayer = dest.waitPlayer ?? this.playerNear(c);
    if (dest.boardFirst && lead && ap) {
      // stationnement en bloc serré (rangs côte à côte) : personne ne pourrait manœuvrer pour sortir ; les véhicules
      // se rangent d'abord en file le long du début de l'itinéraire, nez vers la sortie (les équipages y montent)
      if (dest.stagger && this.packed(c)) this.lineUp(c, dest.x, dest.z);
      // embarquement d'abord : la colonne est « en route » pour le commandement (il attend), mais ne roule pas encore
      c.boarding = true;
      c.stragglersAt = 0;
      c.status.stage = 'echec';
      this.setStage(c, 'route');
      // (ordre de la colonne, pas du joueur : issuedBy 0, jamais byPlayer)
      core.issue(squadId, { type: 'embarquer', issuedBy: 0 });
      core.say(squad.name, frame('À TOUS', squad.name, 'Embarquez, départ en colonne', false), 1, 'commandement', squad.leaderId);
      return true;
    }
    c.status.stage = 'echec';
    if (lead && ap) this.seatStragglers(c);
    if (lead && ap && ap.convoy(c.vehicles, dest.x, dest.z, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed, avoid: this.crowdZones(c) })) {
      this.setStage(c, 'route');
      core.say(squad.name, frame('CENTRAL', squad.name, 'En route vers la zone de stationnement, ' + fleetWords(c.vehicles.length, true), false), 1, 'commandement', squad.leaderId);
      return true;
    }
    // pas de véhicule ou pas de pilote : on débarque sur place (aucun itinéraire jusqu'au point : l'unité le dit)
    if (lead && ap) this.reportNoRoute(c);
    this.beginDisembark(c);
    return lead !== undefined;
  }

  /** Embarquement préalable : ordre exécuté, retardataires à bord, joueur à bord (ou attente épuisée) → départ. */
  private thinkBoard(c: Convoy): void {
    const core = this.core;
    // le joueur est attendu (rappels radio) pendant tout l'embarquement, pas seulement à la fin
    const waiting = this.awaitPlayer(c);
    // tout le monde à bord : départ ; le joueur à bord : départ au plus tard BOARD_PLAYER s après lui
    const late = this.boardedLate(c);
    if (!this.allAboard(c) && !late) {
      if (!c.orderDone && core.now - c.stageT < BOARD_MAX) return;
      if (c.stragglersAt === 0) c.stragglersAt = core.now;
      if (this.boardStragglers(c) > 0 && core.now - c.stragglersAt < STRAGGLERS_MAX) return;
    }
    if (waiting) return;
    const ap = core.autopilot;
    this.seatStragglers(c, late);
    this.manVehicles(c);
    this.orderForDeparture(c, c.dest.x, c.dest.z, true, c.dest.urgence !== false);
    // retour sans urgence donné pendant un trajet en urgence : les gyrophares que la conduite d'urgence tenait
    // allumés pendant l'embarquement sont éteints au départ
    this.quiet(c);
    c.boarding = false;
    c.stageT = core.now;
    c.routeLen = -1;
    c.remMin = -1;
    c.stallAt = 0;
    const squad = core.ctx.squads.get(c.status.squadId);
    if (ap && c.vehicles.length > 0 && c.dest.stagger) {
      c.staggerIdx = 0;
      // (tête sans itinéraire : pas de « départ » annoncé — voir thinkStagger, point inaccessible)
      if (this.launchNext(c) && squad) core.say(squad.name, frame('CENTRAL', squad.name, (c.vehicles.length === 1 ? 'Départ, ' : 'Départ en colonne, ') + fleetWords(c.vehicles.length, false) + (c.dest.urgence === false ? ', sans urgence' : ', deux tons'), false), 1, 'commandement', squad.leaderId);
      return;
    }
    if (ap && c.vehicles.length > 0 && ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) })) {
      if (squad) core.say(squad.name, frame('CENTRAL', squad.name, 'En route vers la zone de stationnement, ' + fleetWords(c.vehicles.length, true), false), 1, 'commandement', squad.leaderId);
      return;
    }
    if (ap && c.vehicles.length > 0) this.reportNoRoute(c);
    this.beginDisembark(c);
  }

  /** Tous les agents valides et libres de l'unité (hors joueur, hors unités libérées) sont-ils assis ? */
  private allAboard(c: Convoy): boolean {
    const core = this.core;
    const n = core.members(c.status.squadId, core.people2);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const p = core.people2[i]!;
      if (p.isPlayer || p.posture === 'down' || p.custody !== 'free' || p.health <= 0 || !this.kept(c, p)) continue;
      total++;
      if (p.vehicleId === 0) return false;
    }
    return total > 0;
  }

  /**
   * Le joueur attendu est monté dans un véhicule de la colonne depuis BOARD_PLAYER s au moins (l'instant de sa montée
   * est relevé ici : redescendu, le compte repart). Les retardataires ne retiennent plus la colonne.
   */
  private boardedLate(c: Convoy): boolean {
    if (!c.waitPlayer || !this.playerMember(c)) {
      c.boardedAt = 0;
      return false;
    }
    if (!this.playerAboard(c)) {
      c.boardedAt = 0;
      return false;
    }
    if (c.boardedAt === 0) c.boardedAt = this.core.now;
    return this.core.now - c.boardedAt >= BOARD_PLAYER;
  }

  /** Le joueur fait-il partie de l'unité de la colonne (et pas d'une unité libérée) ? */
  private playerMember(c: Convoy): boolean {
    const me = this.core.ctx.player.person();
    return !!me && me.squadId !== 0 && this.core.isUnder(me.squadId, c.status.squadId) && !this.isFreed(c, me.squadId);
  }

  /**
   * Le joueur, membre de l'unité, doit-il monter avec elle : à bord d'un de ses véhicules ou à moins de PLAYER_NEAR m de
   * l'un d'eux, et loin du point (une colonne qui vient le chercher, là où il est, ne l'attend pas) ?
   */
  private playerNear(c: Convoy): boolean {
    const me = this.core.ctx.player.person();
    if (!me || !this.playerMember(c) || Math.hypot(me.x - c.dest.x, me.z - c.dest.z) < PLAYER_HERE) return false;
    for (const v of c.vehicles) if (me.vehicleId === v.id || Math.hypot(v.x - me.x, v.z - me.z) < PLAYER_NEAR) return true;
    return false;
  }

  private freeSeats(v: Vehicle): number {
    let free = 0;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') free++;
    return free;
  }

  /**
   * Véhicule où une place reste réservée au joueur (celui de son groupe, à défaut le premier de la colonne) tant qu'il
   * est à pied et fait partie de l'unité : les retardataires de l'IA ne la lui prennent pas. 0 si aucun.
   */
  private reservedFor(c: Convoy): number {
    const core = this.core;
    const ctx = core.ctx;
    const pid = ctx.player.state.personId;
    const p = pid !== 0 ? ctx.people.get(pid) : undefined;
    if (!p || p.vehicleId !== 0 || c.vehicles.length === 0 || !this.playerMember(c)) return 0;
    const own = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    if (own && own.vehicleId !== 0) for (const v of c.vehicles) if (v.id === own.vehicleId) return v.id;
    return c.vehicles[0].id;
  }

  /** Le joueur tient-il le volant de ce véhicule ? */
  private isPlayerWheel(v: Vehicle): boolean {
    const pid = this.core.ctx.player.state.personId;
    return pid !== 0 && v.seats[0] === pid;
  }

  /** Véhicule de la colonne (ou parti seul) dont le joueur tient le volant, null sinon. */
  private playerWheel(c: Convoy): Vehicle | null {
    for (const v of c.vehicles) if (this.isPlayerWheel(v)) return v;
    for (const v of c.solo) if (this.isPlayerWheel(v)) return v;
    return null;
  }

  /**
   * Le joueur conduit un véhicule de la colonne (le pilote automatique lui a rendu la main) : tant que ce véhicule
   * n'est pas arrêté sur le point, la colonne n'est ni arrivée ni bloquée — elle l'attend (en tête, ses suiveurs le
   * suivent ; suiveur, les autres l'attendent au point) et, tant qu'il n'a pas démarré, le lui rappelle à la radio.
   * true : on l'attend.
   */
  private awaitDriver(c: Convoy, v: Vehicle): boolean {
    const core = this.core;
    const now = core.now;
    if (c.drvId !== v.id) {
      c.drvId = v.id;
      c.drvX = v.x;
      c.drvZ = v.z;
      c.drvRemindAt = now + 15;
    }
    if (Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < DRIVER_ARRIVE && Math.abs(v.speed) < 0.5) {
      c.status.awaitingDriver = false;
      return false;
    }
    const idle = Math.hypot(v.x - c.drvX, v.z - c.drvZ) < DRIVER_MOVED;
    c.status.awaitingDriver = idle;
    if (idle && now >= c.drvRemindAt) {
      c.drvRemindAt = now + PLAYER_REMIND;
      const pid = core.ctx.player.state.personId;
      const p = pid !== 0 ? core.ctx.people.get(pid) : undefined;
      const own = p && p.squadId !== 0 ? core.ctx.squads.get(p.squadId) : undefined;
      const squad = core.ctx.squads.get(c.status.squadId);
      core.say(squad ? squad.name : 'PC', `${own ? own.name : 'Unité'}, vous êtes au volant : on attend votre départ !`, 2, 'unite');
    }
    return true;
  }

  /**
   * Le joueur fait partie de l'unité, il est attendu (waitPlayer) et il est encore à pied : la colonne l'attend (rappels
   * radio), cinq minutes au plus. Un joueur qui conduit son propre véhicule n'est pas attendu (il suit la colonne).
   */
  private awaitPlayer(c: Convoy): boolean {
    const core = this.core;
    const ctx = core.ctx;
    const pid = ctx.player.state.personId;
    const p = pid !== 0 ? ctx.people.get(pid) : undefined;
    if (!c.waitPlayer || !p || p.vehicleId !== 0 || p.custody !== 'free' || p.posture === 'down' || ctx.health.isIncapacitated(p)
      || !this.playerMember(c)) {
      c.waitSince = 0;
      return false;
    }
    if (c.waitSince === 0) { c.waitSince = core.now; c.remindAt = core.now + 20; }
    if (core.now - c.waitSince > PLAYER_WAIT) return false;
    if (core.now >= c.remindAt) {
      c.remindAt = core.now + PLAYER_REMIND;
      const own = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      const squad = ctx.squads.get(c.status.squadId);
      core.say(squad ? squad.name : 'PC', `${own ? own.name : 'Unité'}, on n'attend plus que vous : embarquez !`, 2, 'unite');
    }
    return true;
  }

  /** Véhicules garés trop près les uns des autres pour sortir chacun de son côté (moins de 7 m entre deux). */
  private packed(c: Convoy): boolean {
    const list = c.vehicles;
    for (let i = 0; i < list.length; i++) {
      if (Math.abs(list[i]!.speed) > 0.3) return false;
      for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i]!.x - list[j]!.x, list[i]!.z - list[j]!.z) < 7) return true;
    }
    return false;
  }

  /**
   * Met la colonne en file le long du début de l'itinéraire vers (tx, tz) : la tête au plus loin, chacun à 4 m du
   * précédent, à droite de l'axe si la place est libre. Les véhicules qu'aucune place ne reçoit restent où ils sont.
   */
  private lineUp(c: Convoy, tx: number, tz: number): void {
    const ctx = this.core.ctx;
    const list = c.vehicles;
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    // (itinéraire de la conduite demandée : sans contresens sur un retour sans urgence au commissariat)
    const urgent = c.dest.urgence !== false;
    let ok = false;
    try { ok = this.departRoute(c, cx, cz, tx, tz, this.pathBuf, urgent) && this.pathBuf.length >= 4; } catch { ok = false; }
    if (!ok) return;
    // (copie : orderForDeparture et blockerAhead réécrivent pathBuf et headBuf)
    const path = this.lineBuf;
    path.length = 0;
    for (const x of this.pathBuf) path.push(x);
    // un mur en travers du début de l'itinéraire (voir wallAt) : la file se range le long de l'itinéraire que le pilote
    // automatique roulera vraiment (il ne prend pas ce tronçon droit barré : il sort de la place par les allées ou de
    // l'autre côté), et s'arrête au besoin WALL_ROOM m avant le mur
    let limit = this.wallAt(path, 8);
    const ap = this.core.autopilot;
    const probe = list.find((v) => v.seats[0] !== 0);
    if (limit !== Infinity && ap && ap.plannedPath && probe) {
      const alt = this.headBuf;
      if (ap.driveTo(probe, tx, tz, { urgence: urgent, avoid: this.crowdZones(c) }) && ap.plannedPath(probe, alt) && alt.length >= 4 && this.wallAt(alt, 8) > limit) {
        path.length = 0;
        for (const x of alt) path.push(x);
        limit = this.wallAt(path, 8);
      }
      ap.stop(probe);
    }
    limit -= WALL_ROOM;
    this.orderForDeparture(c, tx, tz, false, urgent);
    const p = { x: 0, z: 0 };
    const near: Vehicle[] = [];
    let s = 8;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      // un véhicule sans conducteur ne partira pas : il reste à sa place, hors de la file
      if (v.seats[0] === 0) continue;
      // première place libre le long de l'itinéraire (ni mur, ni voiture garée, ni autre véhicule)
      let placed = false;
      for (let tries = 0; tries < 8 && !placed && s + v.def.length < limit; tries++) {
        s += v.def.length * 0.5;
        const h = pointOnPolyline(path, s, p);
        const rx = Math.cos(h), rz = -Math.sin(h);
        for (const off of [1.4, 0, -1.4]) {
          const x = p.x + rx * off, z = p.z + rz * off;
          if (!ctx.world.isFree(x, z, v.def.width * 0.5)) continue;
          let busy = false;
          ctx.vehicles.queryRadius(x, z, v.def.length * 0.5 + 2, near as never[]);
          for (const o of near) if (o !== v) { busy = true; break; }
          if (busy) continue;
          v.x = x;
          v.z = z;
          v.heading = h;
          v.vx = 0;
          v.vz = 0;
          v.speed = 0;
          placed = true;
          break;
        }
        s += v.def.length * 0.5 + (placed ? 6 : 2);
      }
    }
  }

  /**
   * Abscisse (m) où le début de l'itinéraire (les LINE_SPAN premiers mètres, où lineUp range la file) traverse un mur,
   * Infinity sinon. Hors des rues, le premier tronçon va tout droit à la chaussée carrossable la plus proche, parfois
   * au-delà d'un mur de quai (place de la Concorde, piétonne : voie Georges-Pompidou en contrebas, derrière le parapet) :
   * la file rangée le long de ce tronçon jusqu'au bout mettait sa tête — le canon à eau — nez au parapet, sans place
   * pour braquer ni sortie possible, et la colonne restait figée derrière elle. Elle s'arrête désormais avant le mur ;
   * la tête sort de la place par les allées (pilote automatique : départ loin de toute chaussée).
   */
  private wallAt(path: number[], from: number): number {
    const world = this.core.ctx.world;
    const hit = this.rayHit;
    let run = 0;
    for (let i = 2; i + 1 < path.length && run < LINE_SPAN; i += 2) {
      const ax = path[i - 2]!, az = path[i - 1]!, bx = path[i]!, bz = path[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      // (seulement au-delà du début de la file : un mur en deçà est derrière elle)
      const t0 = len > 0 && from > run ? Math.min(1, (from - run) / len) : 0;
      if (t0 < 1 && world.raycast(ax + (bx - ax) * t0, az + (bz - az) * t0, bx, bz, hit) && hit.hit) return run + len * (t0 + (1 - t0) * hit.t);
      run += len;
    }
    return Infinity;
  }

  /** Départ échelonné : le véhicule suivant part vers le point et s'arrêtera derrière ceux qui le précèdent. */
  private launchNext(c: Convoy): boolean {
    const core = this.core;
    const ap = core.autopilot;
    const v = c.vehicles[c.staggerIdx];
    if (!ap || !v) return false;
    const order = c.staggerIdx;
    c.startX[order] = v.x;
    c.startZ[order] = v.z;
    // (en urgence ou sans urgence selon la colonne — retour au commissariat sans deux-tons, voir driveOne)
    const ok = this.driveOne(c, v, c.dest.x, c.dest.z, 2 + order * 11);
    c.staggerIdx++;
    c.staggerAt = core.now;
    return ok;
  }

  /**
   * Aucun véhicule de la colonne n'a d'itinéraire jusqu'au point (hors des voies carrossables, au bord de la carte) :
   * l'unité le dit en clair à celui qui a donné l'ordre, et ce qu'elle fait à la place — elle débarque et s'y rend à pied
   * s'il existe un chemin, sinon elle reste en attente d'ordres. Elle débarquait sinon en silence devant ses véhicules
   * et restait « en alerte », ou annonçait une « colonne arrêtée à des kilomètres du point » qui n'était jamais partie.
   */
  private reportNoRoute(c: Convoy): void {
    const core = this.core;
    const squad = core.ctx.squads.get(c.status.squadId);
    const lead = c.vehicles[0];
    if (!squad || !lead || !c.hasDest || c.noRoute) return;
    c.noRoute = true;
    let foot = false;
    try { foot = core.ctx.world.findPath(lead.x, lead.z, c.dest.x, c.dest.z, 'foot', this.headBuf) && this.headBuf.length >= 4; } catch { foot = false; }
    // retour au commissariat (pas de débarquement à l'arrivée) : l'unité reste à ses véhicules
    if (c.dest.disembark === false) foot = false;
    c.footTo = foot;
    const parent = squad.parentId !== 0 ? core.ctx.squads.get(squad.parentId) : undefined;
    const to = parent ? parent.name : 'CENTRAL';
    core.say(squad.name, frame(to, squad.name, 'Point inaccessible en véhicule, aucun itinéraire par la route. '
      + (foot ? 'On débarque et on s\'y rend à pied'
        : c.dest.disembark === false ? 'On reste ici avec les véhicules, en attente d\'ordres'
          : 'Inaccessible à pied aussi : on débarque et on reste ici, en attente d\'ordres'), true), 1, 'commandement', squad.leaderId);
  }

  /** Colonne échelonnée en route : départs successifs, puis débarquement quand tous sont arrivés (ou arrêtés). */
  private thinkStagger(c: Convoy): void {
    const core = this.core;
    const ap = core.autopilot!;
    const now = core.now;
    const n = c.vehicles.length;
    if (c.staggerIdx < n) {
      const i = c.staggerIdx - 1;
      const prev = c.vehicles[i];
      const moved = prev ? Math.hypot(prev.x - c.startX[i]!, prev.z - c.startZ[i]!) : 99;
      if (moved > 12 || now - c.staggerAt > 8) this.launchNext(c);
      return;
    }
    // aucun véhicule n'a d'itinéraire jusqu'au point : l'unité le dit et débarque (voir reportNoRoute)
    if (n > 0 && c.vehicles.every((v) => { const st = ap.status(v); return st.state === 'echec' && st.reason === 'sans_itineraire'; })) {
      for (const v of c.vehicles) ap.stop(v);
      this.reportNoRoute(c);
      this.beginDisembark(c);
      return;
    }
    // colonne coincée au départ : un véhicule arrêté derrière un autre de la colonne pas encore lancé le fait partir ;
    // une voiture civile qui barre la route à une colonne en urgence se range (retirée de la chaussée)
    if (now >= c.unstuckAt) {
      c.unstuckAt = now + 2;
      for (let i = 0; i < c.staggerIdx; i++) {
        const v = c.vehicles[i]!;
        const st = ap.status(v);
        // reparti sans urgence (il a reculé pour laisser manœuvrer un automobiliste — session/engins.ts, giveRoom — et sa
        // conduite a repris deux-tons coupé, à l'allure de la circulation) : la colonne en urgence le relance en urgence
        if (c.dest.urgence !== false && st.mode === 'drive' && st.urgence === false && !this.isPlayerWheel(v)
          && Math.hypot(v.x - c.dest.x, v.z - c.dest.z) > 30) {
          this.driveOne(c, v, c.dest.x, c.dest.z, 2 + i * 11);
          continue;
        }
        // (voiture civile qui le retient depuis CIVIL_STAGGER s, reprises du pilote comprises — voir civilWait ; sans
        // urgence, la colonne attend dans la circulation comme tout le monde)
        if (c.dest.urgence !== false && this.clearCivilian(v, true, CIVIL_STAGGER)) continue;
        if ((st.state !== 'attente' && st.state !== 'bloque') || st.blockedFor < 6 || Math.abs(v.speed) > 0.3) continue;
        const o = obstacleOf(ap, v);
        const ov = o !== 0 ? core.ctx.vehicles.get(o) : undefined;
        if (!ov) continue;
        const k = c.vehicles.indexOf(ov);
        if (k >= c.staggerIdx) {
          // le gêneur est de la colonne et attend son tour : il part maintenant
          c.vehicles.splice(k, 1);
          c.vehicles.splice(c.staggerIdx, 0, ov);
          this.launchNext(c);
        } else if (k < 0 && c.dest.urgence !== false && ov.faction !== 'police' && st.blockedFor > 8 && Math.abs(ov.speed) < 0.3) {
          // (sans urgence, la colonne attend dans la circulation comme tout le monde)
          const driver = ov.seats[0] !== 0 ? core.ctx.people.get(ov.seats[0]!) : undefined;
          if (!driver || !driver.isPlayer) core.ctx.vehicles.remove(ov.id);
        }
      }
    }
    let done = 0;
    for (const v of c.vehicles) {
      const st = ap.status(v);
      const near = Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < 70 + n * 11;
      // arrivé, ou arrêté près du point derrière les autres (ils se gênent à l'arrivée : c'est le débarquement)
      if (st.state === 'arrive' || st.state === 'echec' || (st.mode === 'idle' && near) || (near && Math.abs(v.speed) < 0.5 && st.blockedFor > 4)
        || (st.state === 'bloque' && st.blockedFor > 60)) done++;
    }
    // (le véhicule que conduit le joueur, au repos tant qu'il n'a pas démarré : la colonne l'attend — voir awaitDriver)
    const pv = this.playerWheel(c);
    if (!pv) {
      c.status.awaitingDriver = false;
      if (c.drvId !== 0) {
        // il vient de rendre le volant : un équipier le reprend
        c.drvId = 0;
        this.remanLaunched(c);
      }
    } else if (this.awaitDriver(c, pv)) return;
    const max = this.routeMax(c, 600);
    if (done < n && now - c.stageT < max) return;
    for (let i = 0; i < n; i++) if (Math.abs(c.vehicles[i]!.speed) > 0.4 && now - c.stageT < max + 20) return;
    // les véhicules arrêtés : plus de pilote automatique (ils ne cherchent plus à se faufiler pendant le débarquement) —
    // sauf celui resté loin du point, qui repart par un nouvel itinéraire et débarque à sa place (il ne débarque là où il
    // est que s'il n'existe aucune route ; plan « ordres directs » P17)
    c.joining.clear();
    for (let i = 0; i < n; i++) {
      const v = c.vehicles[i]!;
      if (Math.hypot(v.x - c.dest.x, v.z - c.dest.z) > UNLOAD_FAR && core.usable(v) && this.driveOne(c, v, c.dest.x, c.dest.z, 2 + i * 11)) c.joining.add(v.id);
      else ap.stop(v);
    }
    if (c.joining.size === 0) this.reportShort(c);
    this.beginDisembark(c);
  }

  private thinkRoute(c: Convoy): void {
    const core = this.core;
    if (c.boarding) {
      this.thinkBoard(c);
      return;
    }
    if (c.dest.stagger && core.autopilot) {
      this.thinkStagger(c);
      return;
    }
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    if (!ap || !lead) {
      this.beginDisembark(c);
      return;
    }
    const now = core.now;
    for (const v of c.vehicles) this.clearCivilian(v);
    for (const v of c.solo) this.clearCivilian(v);
    // un véhicule bloqué (garé en travers, embouteillage) ne doit pas immobiliser toute la colonne : il la quitte et
    // rejoint le point seul, en urgence ; les autres reforment la colonne et repartent
    if (now >= c.unstuckAt) {
      for (let i = 1; i < c.vehicles.length; i++) {
        const vi = c.vehicles[i]!;
        // (le véhicule du joueur au volant : le pilote automatique lui rend la main, il n'est ni bloqué ni décroché)
        if (this.isPlayerWheel(vi)) continue;
        const vs = ap.status(vi);
        // arrêté pour de bon derrière autre chose que son meneur, ou sorti de la colonne (pilote au repos loin du point)
        // (pas pour des personnes devant lui — la foule près du point : la colonne entière l'attend — ni près du point)
        const blocked = vs.mode === 'follow' && (vs.state === 'bloque' || vs.state === 'attente') && vs.blockedFor > STUCK_LEAVE
          && vs.reason !== 'personne' && vs.reason !== '' && Math.abs(vi.speed) < 0.3 && obstacleOf(ap, vi) !== vs.leaderId
          && Math.hypot(vi.x - c.dest.x, vi.z - c.dest.z) > 200;
        const dropped = vs.mode === 'idle' && Math.hypot(vi.x - c.dest.x, vi.z - c.dest.z) > 90;
        if (blocked || dropped) {
          const v = c.vehicles.splice(i, 1)[0]!;
          // (il s'arrêtera à sa place derrière la tête, pas sur le point même : pas d'embouteillage à l'arrivée)
          this.driveOne(c, v, c.dest.x, c.dest.z, 4 + (c.vehicles.length + c.solo.length) * 9);
          c.solo.push(v);
          if (c.vehicles.length > 0) ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
          c.unstuckAt = now + 10;
          break;
        }
      }
      // un véhicule parti seul dont le pilote s'est arrêté loin du point repart
      for (const v of c.solo) {
        const vs = ap.status(v);
        if (!this.isPlayerWheel(v) && vs.mode === 'idle' && Math.abs(v.speed) < 0.3 && Math.hypot(v.x - c.dest.x, v.z - c.dest.z) > 90) {
          this.driveOne(c, v, c.dest.x, c.dest.z, 4 + (c.vehicles.length + c.solo.indexOf(v)) * 9);
        }
      }
    }
    // tête bloquée au départ par un véhicule de sa propre colonne (garés en bloc) : nouvel ordre, strictement physique
    const ls = ap.status(lead);
    if ((ls.state === 'attente' || ls.state === 'bloque') && ls.blockedFor > 15 && Math.abs(lead.speed) < 0.3 && now >= c.unstuckAt) {
      this.orderForDeparture(c, c.dest.x, c.dest.z, false, c.dest.urgence !== false);
      if (c.vehicles[0] !== lead) {
        ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
        c.unstuckAt = now + 15;
        return;
      }
      c.unstuckAt = now + 15;
    }
    // file emmêlée loin du point : la tête, repartie par un autre itinéraire après un obstacle, s'est retrouvée nez à nez
    // avec ses propres fourgons, chacun attendant l'autre (colonne de la journée immobile sept minutes à 2,6 km du lieu,
    // le joueur à bord, puis débarquée sur place). La file est rompue : chaque véhicule finit le trajet seul, par son
    // propre itinéraire, et reprend sa place dans le rang à l'arrivée (solo). Le véhicule que conduit le joueur reste
    // derrière la tête : le pilote automatique lui rend la main.
    if (c.vehicles.length > 1 && c.untangles < TANGLE_MAX && c.stallAt !== 0 && now - c.stallAt > TANGLE_WAIT && now >= c.unstuckAt
      && (ls.state === 'attente' || ls.state === 'bloque') && ls.reason !== 'personne' && Math.abs(lead.speed) < 0.3
      && !this.isPlayerWheel(lead) && Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z) > 200) {
      c.untangles++;
      c.unstuckAt = now + 15;
      c.stallAt = now;
      for (let i = c.vehicles.length - 1; i >= 1; i--) {
        const v = c.vehicles[i]!;
        if (this.isPlayerWheel(v)) continue;
        c.vehicles.splice(i, 1);
        if (c.solo.indexOf(v) < 0) c.solo.push(v);
        this.driveOne(c, v, c.dest.x, c.dest.z, 4 + i * 9);
      }
      ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) });
      return;
    }
    // tête arrêtée par la foule loin du point : la foule a bougé (cortège) — nouvel itinéraire qui la contourne
    if (ls.state !== 'en_route' && ls.reason === 'personne' && ls.blockedFor > 15 && now >= c.rerouteAt && ap.reroute
      && Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z) > 90) {
      c.rerouteAt = now + 30;
      c.zonesAt = 0;
      ap.reroute(lead, undefined, this.crowdZones(c));
    }
    const st = ap.status(lead);
    const leadToDest = Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z);
    // tête immobile (à 4 m près) depuis combien de temps : manœuvres sur place comprises
    if (c.stallAt === 0 || Math.hypot(lead.x - c.stallX, lead.z - c.stallZ) > 4) {
      c.stallX = lead.x;
      c.stallZ = lead.z;
      c.stallAt = now;
    }
    // itinéraire de la tête rallongé d'un coup à portée de marche du point (rue signalée fermée devant elle : le tour du
    // quartier, voire de l'île) : arrêt court — on débarque ensemble et on finit à pied (voir shortPark)
    if (st.mode === 'drive' && st.remaining > 0 && !this.isPlayerWheel(lead)) {
      if (c.remMin < 0 || st.remaining < c.remMin) c.remMin = st.remaining;
      if (leadToDest < SHORT_REACH && st.remaining > c.remMin + DETOUR_MORE && st.remaining > leadToDest * DETOUR_RATIO && this.shortPark(c, st.remaining)) return;
    }
    // pilote de tête au repos loin du point (rendu la main, itinéraire abandonné) alors qu'il reste de la route : ce n'est
    // pas une arrivée — la colonne repart vers le point (comme un véhicule sorti de la colonne), trois fois au plus
    if (st.mode === 'idle' && st.state !== 'arrive' && leadToDest > 90 && c.restarts < 3 && now >= c.unstuckAt && !this.isPlayerWheel(lead)) {
      c.restarts++;
      c.unstuckAt = now + 10;
      for (const v of c.solo) if (c.vehicles.indexOf(v) < 0) c.vehicles.push(v);
      c.solo.length = 0;
      if (ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, ...this.pace(c), avoid: this.crowdZones(c) })) return;
    }
    // tête arrivée à quelques dizaines de mètres du point mais arrêtée là (mobilier, véhicule, manœuvre sans fin sur
    // ses derniers mètres) : la colonne est arrivée, elle se gare — sans attendre qu'un demi-tour sur la place la
    // retourne nez à nez avec ses propres fourgons (elle ne pourrait plus repartir)
    const parkedNear = leadToDest < 60 && Math.abs(lead.speed) < 0.5 && st.state !== 'en_route'
      && (now - c.stallAt > 15 || ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > 6));
    const arrived = st.state === 'arrive' || parkedNear || (st.mode === 'idle' && (leadToDest <= 90 || c.restarts >= 3));
    const max = this.routeMax(c, 420);
    const stuck = st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 40) || now - c.stageT > max;
    // le joueur au volant d'un véhicule de la colonne, pas encore sur le point : ni arrivée ni blocage — son pilote au
    // repos n'est que le joueur qui n'a pas démarré (la colonne se disait « bloquée » au bout de vingt secondes,
    // débarquait à la caserne et la mission commençait à trois kilomètres de son lieu)
    const pv = this.playerWheel(c);
    if (!pv) {
      c.status.awaitingDriver = false;
      // il vient de rendre le volant en route, loin du point : un équipier le reprend et la colonne repart (comme au
      // départ échelonné, remanLaunched) — sans quoi le véhicule restait sans conducteur et ceux qui le suivaient avec lui
      if (c.drvId !== 0) {
        c.drvId = 0;
        if (this.remanRoute(c)) return;
      }
    } else if (this.awaitDriver(c, pv)) return;
    if (!arrived && !stuck) return;
    // les véhicules partis seuls reprennent leur place pour le stationnement
    for (const v of c.solo) if (c.vehicles.indexOf(v) < 0) c.vehicles.push(v);
    c.solo.length = 0;
    const d = c.dest;
    const near = Math.hypot(lead.x - d.x, lead.z - d.z) < 60;
    // colonne défaite loin du point (délai du trajet dépassé, tête arrêtée pour de bon) : chaque véhicule qui peut
    // encore avancer finit le trajet seul et s'arrête à sa place derrière les autres — on ne débarquait pas où l'on
    // était, à des centaines de mètres du point, pendant qu'un fourgon roulait encore vers lui, le joueur à bord
    // (tête arrêtée pour de bon à portée de marche du point, le joueur à bord de la colonne : arrêt court — chacun
    // finissait sinon le trajet seul par son propre itinéraire, et la compagnie arrivait sans lui, ou étirée)
    if (!near && leadToDest < SHORT_REACH && Math.abs(lead.speed) < 0.5 && (st.state === 'bloque' || st.state === 'echec')
      && this.playerAboard(c) && this.shortPark(c, 0)) return;
    if (!near && this.finishAlone(c)) {
      this.setStage(c, 'stationnement');
      return;
    }
    // toute la colonne à l'arrêt avant de se garer — sauf, la tête au point, un véhicule resté loin derrière qui n'y sera
    // pas avant FAR_ETA s (canon à eau pris dans la circulation, au pas à des centaines de mètres) : il finit le trajet
    // seul et se range derrière la file (ci-dessous) ; l'attendre, c'était laisser la colonne arrivée, ses agents assis,
    // jusqu'à la fin du délai de route. Jamais celui où le joueur est à bord : la colonne l'attend.
    const meIn = core.ctx.player.person()?.vehicleId ?? 0;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i]!;
      const far = Math.hypot(v.x - d.x, v.z - d.z);
      if (near && v.id !== meIn && far >= ROW_REACH && far / Math.max(Math.abs(v.speed), 0.5) > FAR_ETA) continue;
      if (Math.abs(v.speed) > 0.4 && now - c.stageT < max + 20) return;
    }
    // véhicules encore loin (partis seuls par un autre chemin) : ils finissent le trajet et s'arrêtent derrière la file
    // (les garer d'ici, à des centaines de mètres, les ferait manœuvrer à travers la ville)
    const rowList = near ? c.vehicles.filter((v) => Math.hypot(v.x - d.x, v.z - d.z) < ROW_REACH) : c.vehicles;
    if (near) {
      let k = rowList.length;
      for (const v of c.vehicles) {
        if (rowList.indexOf(v) >= 0) continue;
        const st = ap.status(v);
        if (st.mode !== 'drive') this.driveOne(c, v, d.x, d.z, 4 + k * 9);
        k++;
      }
    }
    if (near && rowList.length > 0 && ap.parkRow(rowList, d.x, d.z, d.heading, d.layout ?? 'file', d.layout === 'file' || d.layout === undefined ? 1.6 : undefined)) {
      // (le rang prévu : la ligne du débarquement se forme devant sa tête, là où elle sera garée — pas devant la
      // position où la tête commence sa manœuvre)
      let len = 0;
      for (const v of rowList) if (v.def.length > len) len = v.def.length;
      c.rowN = rowList.length;
      c.rowLen = len;
      this.setStage(c, 'stationnement');
    } else {
      // colonne arrêtée en route (rue coupée, obstacle) : on débarque où l'on est
      this.reportShort(c);
      this.beginDisembark(c);
    }
  }

  /**
   * Arrêt court de la colonne de la compagnie du joueur, à portée de marche du point (SHORT_REACH) : la tête n'a plus
   * devant elle qu'un détour (`detour` m d'itinéraire ; 0 : elle est arrêtée pour de bon). Les véhicules s'arrêtent en
   * file là où ils sont, tout le monde débarque ensemble, et l'unité finit à pied en colonne (footTo) — le joueur à pied
   * avec elle. Relevé du commandant (« Minuit sur le parvis ») : à 285 m du parvis, la tête, arrêtée par un candélabre
   * sur le pont, repartait pour 3,8 km ; la file se défaisait, et la mission commençait au filet des quinze minutes, la
   * compagnie étirée sur un kilomètre. false : pas d'arrêt court (aucun chemin à pied, trop de marche, colonne d'une
   * autre unité).
   */
  private shortPark(c: Convoy, detour: number): boolean {
    const core = this.core;
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    const squad = core.ctx.squads.get(c.status.squadId);
    if (!ap || !lead || !squad || !c.hasDest || c.dest.disembark === false || !this.playerMember(c)) return false;
    const path = this.headBuf;
    let foot = false;
    try { foot = core.ctx.world.findPath(lead.x, lead.z, c.dest.x, c.dest.z, 'foot', path) && path.length >= 4; } catch { foot = false; }
    if (!foot) return false;
    let walk = 0;
    for (let i = 2; i + 1 < path.length; i += 2) walk += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
    if (walk > SHORT_WALK) return false;
    // la ligne du débarquement : au départ du chemin à pied, une douzaine de mètres devant la tête, face au point (pas
    // « devant le rang » dans le cap de la zone de stationnement : la file n'y est pas — relevé : ligne formée à deux
    // cents mètres de la tête, de l'autre côté du quai)
    let gx = lead.x, gz = lead.z, gh = Math.atan2(c.dest.x - lead.x, c.dest.z - lead.z);
    for (let i = 2, left = lead.def.length * 0.5 + 12; i + 1 < path.length && left > 0; i += 2) {
      const dx = path[i]! - path[i - 2]!, dz = path[i + 1]! - path[i - 1]!;
      const l = Math.hypot(dx, dz);
      if (l < 0.01) continue;
      const t = Math.min(1, left / l);
      gx = path[i - 2]! + dx * t;
      gz = path[i - 1]! + dz * t;
      gh = Math.atan2(dx, dz);
      left -= l;
    }
    c.dest.lineX = gx;
    c.dest.lineZ = gz;
    c.dest.lineHeading = gh;
    for (const v of c.solo) if (c.vehicles.indexOf(v) < 0) c.vehicles.push(v);
    c.solo.length = 0;
    c.joining.clear();
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i]!;
      // (le véhicule que conduit le joueur : il le gare lui-même)
      if (this.isPlayerWheel(v)) continue;
      // (resté loin derrière — décroché, parti seul — : il vient se ranger derrière la tête, ses passagers descendent là)
      if (i > 0 && Math.hypot(v.x - lead.x, v.z - lead.z) > SHORT_FILE && core.usable(v) && this.driveOne(c, v, lead.x, lead.z, 6 + i * 9)) c.joining.add(v.id);
      else ap.stop(v);
    }
    c.rowN = 0;
    c.footTo = true;
    const far = Math.round(Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z) / 10) * 10;
    const why = detour > 0 ? 'la rue est fermée, détour de ' + (detour >= 950 ? String(Math.round(detour / 100) / 10).replace('.', ',') + ' kilomètres' : Math.round(detour / 50) * 50 + ' mètres')
      : 'la tête ne passe plus';
    core.say(squad.name, frame('CENTRAL', squad.name, 'Colonne arrêtée à ' + far + ' mètres du point : ' + why + '. On débarque ici et on finit à pied', false), 1, 'commandement', squad.leaderId);
    this.beginDisembark(c);
    return true;
  }

  /**
   * Colonne arrêtée en route loin du point : les véhicules loin du point (à plus de 90 m) qui ne sont ni hors d'usage ni
   * arrêtés pour de bon (plus de 40 s devant un obstacle) repartent seuls (en urgence, sauf retour sans urgence), le plus proche du point en tête de
   * la file d'arrivée. La colonne est rangée du plus proche au plus éloigné du point : le débarquement se fait devant
   * celui qui en est le plus près. false si aucun véhicule ne repart.
   */
  private finishAlone(c: Convoy): boolean {
    const core = this.core;
    const ap = core.autopilot;
    if (!ap || c.vehicles.length === 0) return false;
    const d = c.dest;
    const dist = (v: Vehicle): number => Math.hypot(v.x - d.x, v.z - d.z);
    c.vehicles.sort((a, b) => dist(a) - dist(b));
    let k = 0;
    let moved = 0;
    for (const v of c.vehicles) {
      const st = ap.status(v);
      const there = dist(v) < 90;
      // (arrêté pour de bon, ou sans itinéraire : un nouvel itinéraire depuis là où il est — il ne débarque pas à des
      // centaines de mètres du point tant qu'une route existe ; colonne garantie, plan « ordres directs » P17)
      if (!there && core.usable(v) && this.driveOne(c, v, d.x, d.z, 4 + k * 9)) moved++;
      k++;
    }
    return moved > 0;
  }

  /**
   * Voiture civile arrêtée qui barre la route à un véhicule de la colonne en urgence (deux-tons) depuis plus de
   * CIVIL_CLEAR s, conducteur au volant ou non : elle se range — retirée de la chaussée, comme au départ échelonné. Une
   * voiture « qui se range » pour la sirène restait sinon à l'arrêt, à deux mètres du VL de tête, et la colonne derrière
   * elle, dix minutes durant, à plus d'un kilomètre du point. Jamais le véhicule du joueur. true si la voie est dégagée.
   */
  private clearCivilian(v: Vehicle, urgent = false, after = CIVIL_CLEAR): boolean {
    const core = this.core;
    const ap = core.autopilot;
    if (!ap) return false;
    // (colonne échelonnée en urgence — `urgent` — : le temps d'arrêt court pendant les reprises du pilote, deux-tons
    // coupé compris, voir civilWait ; la colonne en file garde sa règle : deux-tons, arrêt continu)
    const wait = urgent ? this.civilWait(v) : 0;
    if ((v.siren === 0 && !urgent) || Math.abs(v.speed) > 0.3) return false;
    const st = ap.status(v);
    const blocked = (st.state === 'attente' || st.state === 'bloque') && st.blockedFor >= after && st.mode !== 'idle';
    if (!blocked && wait < after) return false;
    const o = obstacleOf(ap, v);
    const ov = o !== 0 ? core.ctx.vehicles.get(o) : undefined;
    if (!ov || ov.faction !== 'civil' || Math.abs(ov.speed) >= 0.3) return false;
    const driver = ov.seats[0] !== 0 ? core.ctx.people.get(ov.seats[0]!) : undefined;
    if (driver && driver.isPlayer) return false;
    // (ni la voiture où le joueur est assis en passager : il serait éjecté sur la chaussée)
    const me = core.ctx.player.person();
    if (me && me.vehicleId === ov.id) return false;
    core.ctx.vehicles.remove(ov.id);
    this.civilHeld.delete(v.id);
    return true;
  }

  /**
   * Temps (s) depuis lequel une voiture civile à l'arrêt retient ce véhicule de la colonne au même endroit (à CIVIL_SPAN m
   * près) — reprises du pilote automatique comprises. Le véhicule qui recule pour laisser manœuvrer l'automobiliste
   * (session/engins.ts, giveRoom) puis repart remettait à zéro son temps d'arrêt toutes les dix secondes : les
   * CIVIL_CLEAR s au bout desquelles la voiture se range n'étaient jamais atteintes (trois automobilistes « rangés » en
   * travers du pont de la Concorde retenaient sept minutes deux fourgons appelés par le commandant, à 150 m de lui).
   * 0 quand rien ne le retient à cet instant.
   */
  private civilWait(v: Vehicle): number {
    const core = this.core;
    const ap = core.autopilot;
    if (!ap) return 0;
    const now = core.now;
    let rec = this.civilHeld.get(v.id);
    if (rec && (Math.hypot(v.x - rec.x, v.z - rec.z) > CIVIL_SPAN || now - rec.seen > CIVIL_LAPSE)) {
      this.civilHeld.delete(v.id);
      rec = undefined;
    }
    const o = obstacleOf(ap, v);
    const ov = o !== 0 ? core.ctx.vehicles.get(o) : undefined;
    if (!ov || ov.faction !== 'civil' || Math.abs(ov.speed) >= 0.3 || Math.abs(v.speed) > 0.5) return 0;
    if (!rec) {
      rec = { since: now, seen: now, x: v.x, z: v.z };
      this.civilHeld.set(v.id, rec);
    }
    rec.seen = now;
    return now - rec.since;
  }

  private measure(c: Convoy): void {
    const d = c.dest;
    const rx = -Math.cos(d.heading);
    const rz = Math.sin(d.heading);
    const fx = Math.sin(d.heading);
    const fz = Math.cos(d.heading);
    const file = d.layout === undefined || d.layout === 'file';
    let align = 0;
    let head = 0;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i];
      // en file : écart latéral à l'axe du rang ; côte à côte : écart longitudinal à la ligne des avants
      const e = file ? Math.abs((v.x - d.x) * rx + (v.z - d.z) * rz) : Math.abs((v.x - d.x) * fx + (v.z - d.z) * fz);
      if (e > align) align = e;
      const want = d.layout === 'epi' ? d.heading - 0.5236 : d.heading;
      const h = Math.abs(angleDiff(v.heading, want));
      if (h > head) head = h;
    }
    c.status.alignError = align;
    c.status.headingError = head;
  }

  private thinkPark(c: Convoy): void {
    const ap = this.core.autopilot;
    if (!ap) {
      this.beginDisembark(c);
      return;
    }
    let parked = 0;
    let failed = 0;
    const now = this.core.now;
    if (c.stallAt < c.stageT) c.stallAt = c.stageT;
    const d = c.dest;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i];
      const st = ap.status(v);
      // (véhicule qui finit le trajet seul, arrêté tout près du point derrière les autres : il est arrivé — il
      // attendait sinon, à trente mètres du point, qu'un fourgon déjà garé lui laisse sa place, dix minutes durant)
      if (st.mode === 'drive' && Math.abs(v.speed) < 0.5 && st.blockedFor > 6 && (st.state === 'attente' || st.state === 'bloque')
        && Math.hypot(v.x - d.x, v.z - d.z) < 60 + c.vehicles.length * 10) ap.stop(v);
      else if (st.mode === 'drive') this.clearCivilian(v);
      // (arrêté à sa manœuvre par un obstacle — sa place est prise, un véhicule immobile devant lui — depuis PARK_STILL s :
      // il reste là, en file le long de la voie, et ses passagers descendent ; attendre son tour n'est pas être bloqué)
      else if (st.mode === 'park' && (st.state === 'attente' || st.state === 'bloque') && st.blockedFor > PARK_STILL && Math.abs(v.speed) < 0.3) ap.stop(v);
      if (st.state === 'arrive' || st.mode === 'idle') parked++;
      else if (st.state === 'echec') failed++;
      // (un véhicule qui roule ou manœuvre réellement : le stationnement avance)
      if (Math.abs(v.speed) > 0.3) c.stallAt = now;
      // (un véhicule décroché, trop loin pour prendre place dans le rang, qui finit le trajet seul — voir thinkRoute — :
      // il manœuvre, attend un passage, prend un autre itinéraire ; on l'attend, au plus PARK_WAIT s comme les autres —
      // il retenait sinon tout le débarquement douze minutes, tout le monde assis)
      if (st.mode === 'drive' && !((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > 60)) c.stallAt = now;
    }
    c.status.parked = parked;
    // la colonne est arrêtée : « débarquez » tout de suite — chacun descend dès que SON véhicule est garé (special.ts,
    // progressBoarding), sans attendre les autres ni la fin du stationnement
    if (c.dest.disembark !== false && c.debark.size === 0) this.issueDisembark(c);
    // plus rien ne bouge depuis 20 s (chacun attend un voisin qui l'attend lui-même, mobilier sur une place) : les
    // véhicules restent où ils sont, en file le long de la voie, et l'on débarque — pas cinq minutes d'attente
    const deadlock = now - c.stallAt > 20;
    if (parked + failed < c.vehicles.length && now - c.stageT < PARK_WAIT && !deadlock) return;
    // (au bout de PARK_WAIT, la colonne débarque sans attendre les derniers : celui qui manœuvre encore pour se garer
    // dans le rang finit, PARK_FINISH s au plus (refreshRow) ; celui qui attendait son tour ou un passage reste où il
    // est, en file ; celui qui finit encore le trajet seul continue jusqu'à sa place — leurs passagers descendent quand
    // ils sont arrêtés (unloadParked), jamais à des centaines de mètres du point ; celui qui ne peut plus avancer — sans
    // itinéraire, arrêté depuis plus d'une minute, plus rien ne bouge — s'arrête là, et l'on y débarque)
    c.joining.clear();
    c.parkBy = now + PARK_FINISH;
    if (parked + failed < c.vehicles.length) {
      for (const v of c.vehicles) {
        const st = ap.status(v);
        const stuck = st.state === 'echec' || ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > 60);
        if (!deadlock && !stuck && st.mode === 'drive') {
          c.joining.add(v.id);
          continue;
        }
        if (!deadlock && !stuck && st.mode === 'park' && Math.abs(v.speed) > 0.3) continue;
        // (arrêté loin de sa place : il repart par un autre itinéraire et ses passagers descendent à sa place ; il ne
        // débarque là où il est que s'il n'existe aucune route — plan « ordres directs » P17)
        if (Math.hypot(v.x - d.x, v.z - d.z) > UNLOAD_FAR && this.core.usable(v) && this.driveOne(c, v, d.x, d.z, 4 + c.vehicles.length * 9)) {
          c.joining.add(v.id);
          continue;
        }
        if (st.mode !== 'idle') ap.stop(v);
      }
    }
    this.measure(c);
    // (tête restée en route, d'autres véhicules arrivés au point — partis seuls, voir finishAlone — : la ligne se forme
    // devant celui qui en est le plus près, pas devant la tête, à des centaines de mètres de là)
    const dist = (v: Vehicle): number => Math.hypot(v.x - c.dest.x, v.z - c.dest.z);
    let best = 0;
    for (let i = 1; i < c.vehicles.length; i++) if (dist(c.vehicles[i]) < dist(c.vehicles[best])) best = i;
    if (best > 0 && dist(c.vehicles[0]) - dist(c.vehicles[best]) > 60) c.vehicles.unshift(c.vehicles.splice(best, 1)[0]);
    this.reportShort(c);
    this.beginDisembark(c);
  }

  /** Véhicules garés et alignement du rang, relevés pendant que les derniers finissent leur manœuvre. */
  private refreshRow(c: Convoy): void {
    const ap = this.core.autopilot!;
    let parked = 0;
    let moving = false;
    for (const v of c.vehicles) {
      const st = ap.status(v);
      // (le débarquement a commencé : une manœuvre qui n'avance plus — sa place est prise, un obstacle — ou qui dure
      // au-delà de PARK_FINISH : il reste là, ses passagers descendent)
      if (st.mode === 'park' && ((c.parkBy > 0 && this.core.now > c.parkBy)
        || ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > PARK_STUCK && Math.abs(v.speed) < 0.3))) ap.stop(v);
      if (st.state === 'arrive' || st.mode === 'idle' || st.mode === 'stop') parked++;
      else if (st.mode === 'park') moving = true;
    }
    c.status.parked = parked;
    if (moving || parked === c.vehicles.length) this.measure(c);
  }

  /**
   * Débarquement : un passager par véhicule garé (à l'arrêt, pilote automatique au repos ou arrivé) descend à chaque
   * passage — ceux dont le véhicule s'est garé après que l'unité s'est mise en ligne (special.ts ne fait plus descendre
   * personne une fois la ligne formée) ; ils la rejoignent (la formation se refait avec eux). Ni conducteur, ni équipage,
   * ni le joueur, ni un interpellé, ni une unité qui embarque.
   */
  private unloadParked(c: Convoy, joiningOnly = false): void {
    const core = this.core;
    const ap = core.autopilot;
    const ctx = core.ctx;
    const each = (v: Vehicle): void => {
      if (joiningOnly && !c.joining.has(v.id)) return;
      if (Math.abs(v.speed) > 0.3) return;
      if (ap) {
        const st = ap.status(v);
        if (!(st.mode === 'idle' || st.mode === 'stop' || st.state === 'arrive')) return;
      }
      for (let s = 1; s < v.seats.length; s++) {
        const p = v.seats[s] !== 0 ? ctx.people.get(v.seats[s]!) : undefined;
        if (!p || !this.alighting(c, p)) continue;
        // (unité qui embarque, ou — après le débarquement des autres — qui a reçu un autre ordre : il s'en charge)
        const q = ctx.squads.get(p.squadId);
        if (q && (q.order.type === 'embarquer' || (joiningOnly && q.order.type !== 'debarquer'))) continue;
        const a = agentOf(p)!;
        if (ctx.vehicles.exit(p)) {
          a.lastX = p.x;
          a.lastZ = p.z;
          a.pathN = 0;
          a.boardId = 0;
        }
        return;
      }
    };
    for (const v of c.vehicles) each(v);
    for (const v of c.solo) each(v);
  }

  /** Passager qui doit descendre au débarquement de la colonne (voir seated). */
  private alighting(c: Convoy, p: Person): boolean {
    if (p.isPlayer || p.custody !== 'free' || p.faction !== 'police' || p.health <= 0
      || p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead') return false;
    const a = agentOf(p);
    return !!a && !a.crew && this.kept(c, p, true) && this.core.isUnder(p.squadId, c.status.squadId);
  }

  /** Agents de la colonne encore assis dans ses véhicules (ni conducteurs, ni équipages, ni le joueur, ni blessés graves). */
  private seated(c: Convoy): number {
    const ctx = this.core.ctx;
    let n = 0;
    const ap = this.core.autopilot;
    const scan = (v: Vehicle): void => {
      // (celui qui finit encore le trajet seul ne retient pas le débarquement des autres)
      if (ap && c.joining.has(v.id) && ap.status(v).mode === 'drive') return;
      for (let s = 1; s < v.seats.length; s++) {
        const p = v.seats[s] !== 0 ? ctx.people.get(v.seats[s]!) : undefined;
        if (p && this.alighting(c, p)) n++;
      }
    };
    for (const v of c.vehicles) scan(v);
    for (const v of c.solo) scan(v);
    return n;
  }

  /**
   * Fin du trajet : colonne arrêtée loin du point (rue coupée, place inaccessible) — elle le dit, avec la distance qui
   * reste ; elle débarquait sinon en silence à des centaines de mètres du point, le chef la croyant sur place.
   */
  private reportShort(c: Convoy): void {
    const core = this.core;
    const lead = c.vehicles[0];
    const squad = core.ctx.squads.get(c.status.squadId);
    if (!squad || !lead || !c.hasDest) return;
    const far = Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z);
    if (far > 120) core.say(squad.name, frame('CENTRAL', squad.name, 'Colonne arrêtée à ' + Math.round(far / 10) * 10 + ' mètres du point, accès bloqué. On débarque ici', false), 1, 'commandement', squad.leaderId);
  }

  private beginDisembark(c: Convoy): void {
    const d = c.dest;
    if (d.disembark === false) {
      // (pas de « débarquez » : les ordres que le joueur a donnés en route tiennent d'eux-mêmes)
      c.taken.clear();
      this.setStage(c, 'en_place');
      return;
    }
    c.orderDone = false;
    // le « débarquez » donné à l'arrêt tient encore (personne ne l'a remplacé) et tout le monde est descendu : la mise
    // en ligne se poursuit ; sinon il est redonné (il s'était peut-être mis en ligne sans ceux qui étaient encore à bord)
    let intact = c.debark.size > 0 && this.seated(c) === 0;
    for (const [id, o] of c.debark) if (this.core.ctx.squads.get(id)?.order !== o) { intact = false; break; }
    if (!intact) this.issueDisembark(c);
    this.setStage(c, 'debarquement');
  }

  /**
   * « Débarquez » de la colonne, ligne devant le véhicule de tête (ou au point fixé par la destination), donné à chaque
   * branche qui n'est ni libérée ni emportée pour un ordre du joueur (disembarkRest). Ordre de la colonne : issuedBy 0,
   * jamais byPlayer — un ordre du joueur à une section n'est donc jamais remplacé (sim/police/system.ts handleOrder).
   */
  private issueDisembark(c: Convoy): void {
    const core = this.core;
    const d = c.dest;
    // la ligne se forme devant le véhicule de tête
    let lx = d.lineX;
    let lz = d.lineZ;
    let lh = d.lineHeading ?? d.heading;
    const lead = c.vehicles[0];
    if ((lx === undefined || lz === undefined) && c.rowN > 0 && lead && Math.hypot(lead.x - d.x, lead.z - d.z) < ROW_REACH) {
      // rang garé (ou qui se gare) autour du point : 15 m devant sa tête (parkRow : en file, la tête est en avant du
      // point d'une demi-longueur de file ; côte à côte, d'une demi-longueur de véhicule)
      const file = d.layout === undefined || d.layout === 'file';
      const front = (file ? (c.rowLen + 1.6) * (c.rowN - 1) * 0.5 : 0) + c.rowLen * 0.5;
      lx = d.x + Math.sin(d.heading) * (front + 15);
      lz = d.z + Math.cos(d.heading) * (front + 15);
    }
    if (lx === undefined || lz === undefined) {
      if (lead) {
        const h = c.hasDest ? d.heading : lead.heading;
        let front = -Infinity;
        for (let i = 0; i < c.vehicles.length; i++) {
          const v = c.vehicles[i];
          const along = (v.x - lead.x) * Math.sin(h) + (v.z - lead.z) * Math.cos(h) + v.def.length * 0.5;
          if (along > front) front = along;
        }
        lx = lead.x + Math.sin(h) * (front + 15);
        lz = lead.z + Math.cos(h) * (front + 15);
        if (d.lineHeading === undefined) lh = h;
      } else if (core.centerOf(c.status.squadId)) {
        lx = core.v2.x;
        lz = core.v2.z;
      } else {
        lx = d.x;
        lz = d.z;
      }
    }
    const order = { type: 'debarquer' as const, x: lx, z: lz, heading: lh, width: 0, issuedBy: 0 };
    const skip = new Set<number>([...c.taken, ...c.freed]);
    c.debark.clear();
    this.disembarkRest(c, c.status.squadId, skip, order);
  }

  // ───────────────────────────── départ ─────────────────────────────

  depart(squadId: number, exit?: { x: number; z: number }): boolean {
    const core = this.core;
    const squad = core.ctx.squads.get(squadId);
    if (!squad) return false;
    const c = this.obtain(squadId);
    this.gather(c);
    c.hasExit = exit !== undefined;
    if (exit) {
      c.exitX = exit.x;
      c.exitZ = exit.z;
    }
    c.orderDone = false;
    c.stragglersAt = 0;
    c.status.t0 = core.now;
    if (c.vehicles.length === 0) {
      this.setStage(c, 'parti');
      return false;
    }
    c.taken.clear();
    c.freed.clear();
    c.debark.clear();
    c.boardedAt = 0;
    // rembarquement de fin de mission : le joueur de l'unité est attendu (il rentre avec elle)
    c.waitPlayer = this.playerMember(c);
    core.issue(squadId, { type: 'embarquer', issuedBy: 0 });
    this.setStage(c, 'rembarquement');
    return true;
  }

  /**
   * Agents restés à pied après l'embarquement (plus de place dans le fourgon de leur groupe) : ils rejoignent
   * à pied un véhicule où il reste une place, fourgon cellulaire compris. Retourne le nombre d'agents en chemin.
   */
  private boardStragglers(c: Convoy): number {
    const core = this.core;
    const n = core.members(c.status.squadId, core.people);
    const reserved = this.reservedFor(c);
    let walking = 0;
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.vehicleId !== 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free' || !this.kept(c, p)) continue;
      const a = agentOf(p);
      if (!a) continue;
      if (a.boardId !== 0) {
        walking++;
        continue;
      }
      for (let k = c.vehicles.length - 1; k >= 0; k--) {
        const v = c.vehicles[k];
        let free = 0;
        for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') free++;
        // places déjà promises à d'autres retardataires
        for (let j = 0; j < n; j++) {
          const b = agentOf(core.people[j]);
          if (b && b.boardId === v.id && core.people[j].vehicleId === 0) free--;
        }
        if (v.id === reserved) free--;
        if (free <= 0) continue;
        a.boardId = v.id;
        a.hasSlot = false;
        a.pathN = 0;
        walking++;
        break;
      }
    }
    return walking;
  }

  private thinkEmbark(c: Convoy): void {
    const core = this.core;
    const waiting = this.awaitPlayer(c);
    const late = this.boardedLate(c);
    if (!this.allAboard(c) && !late) {
      if (!c.orderDone && core.now - c.stageT < BOARD_MAX) return;
      // les retardataires montent où il reste de la place (une minute et demie au plus)
      if (c.stragglersAt === 0) c.stragglersAt = core.now;
      if (this.boardStragglers(c) > 0 && core.now - c.stragglersAt < STRAGGLERS_MAX) return;
    }
    if (waiting) return;
    const ap = core.autopilot;
    if (c.hasExit && ap && c.vehicles.length > 0) {
      this.seatStragglers(c, late);
      this.manVehicles(c);
      this.orderForDeparture(c, c.exitX, c.exitZ, true, false);
    }
    if (c.hasExit && ap && c.vehicles.length > 0 && ap.convoy(c.vehicles, c.exitX, c.exitZ, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed, avoid: this.crowdZones(c) })) {
      this.setStage(c, 'depart');
    } else {
      this.setStage(c, 'parti');
    }
  }

  private thinkLeave(c: Convoy): void {
    const ap = this.core.autopilot;
    const lead = c.vehicles[0];
    if (!ap || !lead) {
      this.setStage(c, 'parti');
      return;
    }
    const st = ap.status(lead);
    if (st.state === 'arrive' || st.mode === 'idle' || st.state === 'echec' || this.core.now - c.stageT > 300) this.setStage(c, 'parti');
  }

  // ───────────────────────────── suivi ─────────────────────────────

  onPoliceDone(squadId: number, type: OrderType): void {
    const c = this.of(squadId);
    if (!c) return;
    if ((c.status.stage === 'debarquement' && type === 'debarquer') || (c.status.stage === 'rembarquement' && type === 'embarquer')
      || (c.boarding && type === 'embarquer')) c.orderDone = true;
  }

  update(): void {
    const core = this.core;
    if (this.list.length === 0 || core.now < this.thinkAt) return;
    this.thinkAt = core.now + 0.5;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c) continue;
      switch (c.status.stage) {
        case 'route': this.thinkRoute(c); break;
        case 'stationnement': this.thinkPark(c); break;
        case 'debarquement':
          // (véhicules qui finissent de se garer pendant le débarquement : le rang est relevé, et leurs passagers
          // descendent dès qu'ils sont garés, même si la ligne s'est déjà formée sans eux)
          if (c.rowN > 0 && core.autopilot) this.refreshRow(c);
          this.unloadParked(c);
          // fini quand plus personne n'est assis (l'ordre « débarquer » peut avoir été remplacé par un ordre du joueur
          // et ne jamais rendre compte : la fin attendait alors deux minutes, et l'adjoint se taisait)
          if (this.seated(c) === 0 || core.now - c.stageT > DISEMBARK_MAX) {
            // (point inaccessible en véhicule : à pied, comme annoncé — l'ordre repris au débarquement, s'il y en a un,
            // prend la suite à l'annonce de 'en_place')
            if (c.footTo) {
              c.footTo = false;
              const squad = core.ctx.squads.get(c.status.squadId);
              if (squad) core.issue(c.status.squadId, { type: 'colonne', x: c.dest.x, z: c.dest.z, heading: c.dest.heading, width: 0, issuedBy: 0 });
            }
            this.setStage(c, 'en_place');
          }
          break;
        case 'en_place':
          // (le dernier fourgon finit de se garer après la descente de tous : le rang est relevé jusqu'au bout ; celui qui
          // finissait le trajet seul arrive : ses passagers descendent)
          if (c.rowN > 0 && core.autopilot && c.status.parked < c.vehicles.length) this.refreshRow(c);
          if (c.joining.size > 0) this.unloadParked(c, true);
          break;
        case 'rembarquement': this.thinkEmbark(c); break;
        case 'depart': this.thinkLeave(c); break;
        default: break;
      }
      this.publish(c);
    }
  }

  /**
   * État lisible du départ et du trajet (carte de mission du joueur, GPS) : agents à bord sur agents attendus, délai
   * maximal avant le départ, distance et itinéraire restants de la tête. Relu deux fois par seconde.
   */
  private publish(c: Convoy): void {
    const core = this.core;
    const st = c.status;
    const now = core.now;
    const waiting = (st.stage === 'route' && c.boarding) || st.stage === 'rembarquement';
    const moving = (st.stage === 'route' && !c.boarding) || st.stage === 'depart';
    if (waiting || moving) {
      const n = core.members(st.squadId, core.people);
      let aboard = 0;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const p = core.people[i];
        if (p.posture === 'down' || p.custody !== 'free' || !this.kept(c, p)) continue;
        total++;
        if (p.vehicleId !== 0) aboard++;
      }
      st.aboard = aboard;
      st.total = total;
    }
    st.awaitingPlayer = waiting && c.waitSince > 0;
    if (!moving) st.awaitingDriver = false;
    if (waiting) {
      // l'ordre d'embarquer, puis les retardataires, puis le joueur : la colonne part au plus tard au bout du plus long
      let left = !c.orderDone && now - c.stageT < BOARD_MAX ? BOARD_MAX - (now - c.stageT) : 0;
      if (c.stragglersAt > 0 && now - c.stragglersAt < STRAGGLERS_MAX) left = Math.max(left, STRAGGLERS_MAX - (now - c.stragglersAt));
      // (le joueur à bord : départ au plus tard BOARD_PLAYER s après lui ; tout le monde à bord : départ imminent)
      if (c.boardedAt > 0) left = Math.min(left, Math.max(0, BOARD_PLAYER - (now - c.boardedAt)));
      if (c.waitSince > 0) left = Math.max(left, PLAYER_WAIT - (now - c.waitSince));
      st.departIn = Math.max(0, Math.ceil(left));
    } else {
      st.departIn = 0;
    }
    const route = st.route ?? (st.route = []);
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    if (moving && ap && lead) {
      st.remaining = ap.status(lead).remaining;
      if (!ap.plannedPath || !ap.plannedPath(lead, route)) route.length = 0;
    } else {
      st.remaining = 0;
      route.length = 0;
    }
  }

  /**
   * Durée maximale du trajet avant de débarquer là où l'on est (s) : au moins `min`, davantage pour traverser Paris
   * (itinéraire de la tête au départ, à 5 m/s de moyenne, plus deux minutes).
   */
  private routeMax(c: Convoy, min: number): number {
    if (c.routeLen < 0) {
      const ap = this.core.autopilot;
      const lead = c.vehicles[0];
      const rem = ap && lead ? ap.status(lead).remaining : 0;
      if (rem > 0) c.routeLen = rem;
    }
    return c.routeLen > 0 ? Math.max(min, c.routeLen / 5 + 120) : min;
  }

  /**
   * Foule à contourner sur le trajet (manifestants regroupés) : une zone par carré de 40 m où ils sont au moins six.
   * La colonne passe à l'écart quand un autre chemin existe (elle ne fend pas une manifestation pour gagner sa zone de
   * stationnement). Recalculé au plus toutes les 5 s.
   */
  private crowdZones(c: Convoy): { x: number; z: number; r: number }[] {
    const core = this.core;
    if (c.zonesAt > 0 && core.now - c.zonesAt < 5) return c.zones;
    c.zonesAt = core.now;
    const cells = new Map<number, { n: number; x: number; z: number }>();
    const list = core.ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.dormant || !isProtester(p)) continue;
      const key = Math.floor(p.x / 40) * 65536 + Math.floor(p.z / 40);
      const cell = cells.get(key);
      if (cell) {
        cell.n++;
        cell.x += p.x;
        cell.z += p.z;
      } else {
        cells.set(key, { n: 1, x: p.x, z: p.z });
      }
    }
    const out: { x: number; z: number; r: number }[] = [];
    for (const cell of cells.values()) {
      if (cell.n < 6) continue;
      out.push({ x: cell.x / cell.n, z: cell.z / cell.n, r: 30 });
      if (out.length >= 40) break;
    }
    c.zones = out;
    return out;
  }

  /** Point d'où la colonne est venue (retour à la base par défaut). */
  originOf(squadId: number): { x: number; z: number } | null {
    const c = this.of(squadId);
    return c && c.hasDest ? { x: c.fromX, z: c.fromZ } : null;
  }
}

/**
 * Véhicule qui arrête celui-ci (0 si aucun). Lu dans l'état interne du pilote automatique, faute d'un champ public
 * (à exposer dans AutopilotStatus quand le module des véhicules sera revu).
 */
function obstacleOf(ap: unknown, v: Vehicle): number {
  try {
    const rt = (ap as { k?: { rt?(v: Vehicle): { ap?: { obsId?: number; obsReason?: string } | null } } }).k?.rt?.(v);
    const st = rt && rt.ap;
    return st && st.obsReason === 'vehicule' && typeof st.obsId === 'number' ? st.obsId : 0;
  } catch {
    return 0;
  }
}

