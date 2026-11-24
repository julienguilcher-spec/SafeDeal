/* =====================================================================================
 * COMMANDEMENT — BRAV-M : binômes à moto (docs/research/06-roles-jouables.md §6, bible §E.8).
 *
 *   en route        les motos roulent en colonne (pilote automatique, convoi) ; à moins de 30 m de
 *                   piétons l'allure tombe à 20 km/h ; la colonne ne s'engage jamais dans une foule :
 *                   elle s'arrête 40 à 80 m avant l'objectif, plus loin si la foule déborde ;
 *   pied à terre    tous les opérateurs descendent dans le même pas ; les pilotes restent aux machines ;
 *   interception    progression à pied en colonne, constat du fait, interpellation par le binôme
 *                   (chaîne du module de police : maîtriser, menotter, escorter, remettre), retour aux
 *                   motos, remontée en selle, compte rendu ;
 *   retenue         aucun geste de force en selle, aucune interpellation sans fait constaté.
 * Sans pilote automatique (module des véhicules absent), le groupe met pied à terre et agit à pied.
 *
 * Ordre du joueur (ordres directs, §4.1 de la spécification) — la BRAV-M obéit comme les autres :
 *   distance        à pied et à moins de 150 m : à pied (au trot), sans retour aux machines ; en selle et à moins de
 *                   60 m : pied à terre sur place, la suite à pied ; en selle au-delà : à moto ; à pied au-delà de
 *                   150 m : en selle — sur place si les machines sont à portée, sinon les pilotes les amènent pendant
 *                   que les opérateurs partent déjà à pied vers le point (ils finissent à pied si c'est plus court) ;
 *   foule           à pied, machines (ou opérateurs) au milieu de la foule, point à 400 m au plus : à pied tout de
 *                   suite, sans remonter en selle ; remontée en selle pas finie au bout de 30 s dans la foule :
 *                   abandonnée, la suite à pied ;
 *   arrivée         tête à moins de 30 m du point, ou bloquée 5 s / en attente 8 s près du point : pied à terre, la
 *                   suite à pied — jamais « accès bloqué » sur un ordre du joueur ; de même en selle « avec vous »
 *                   quand la personne suivie est à pied : le suivi continue à pied ;
 *   interpellation  cible à moins de 120 m : le binôme le plus proche y court ; au-delà et en selle, la colonne roule
 *                   jusqu'à 30 m ; constat de 8 s au plus sur un auteur de fait constaté ; cible revue chaque seconde ;
 *   ordre affiché   les manœuvres internes (retour aux machines, approche, remontée) ne remplacent jamais l'ordre
 *                   reçu dans Squad.order (special.ts keepShown) ;
 *   avec vous       « suivre » en selle : la BRAV-M se tient 30 m derrière la personne suivie, en selle, et met pied à
 *                   terre si une foule est à moins de 120 m.
 * Les seuils de distance sont ceux de la fiche d'ordre (ui/command/direct/travel.ts BRAVM_RIDE_MIN, BRAVM_REMOUNT_MIN) :
 * la fiche dit « en véhicules » quand elle roule, « à pied » quand elle marche.
 * ===================================================================================== */

import type { OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { cellularOnSite } from '../arrest-service';
import { agentOf, unitOf } from '../brain';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { recentOffender } from './picture';
import { ORDER_DONE_EVENT } from '../api';
import { SpecialUnit, locate } from './special';
import { received, refused, report, spell } from './texts';
import { isReturningHome } from '@/world/commissariats';

/** Au-delà, un ordre à pied commence par un trajet à moto ; en deçà, en selle : pied à terre sur place (m). Arrêt avant le point (m). */
const RIDE_BEYOND = 60;
const RIDE_STANDOFF = 15;
/** À pied, en deçà : on y va à pied, au trot, sans retour aux machines ; au-delà : en selle (m). */
const WALK_BELOW = 150;
/** Bloquée près du point (moins de tant de mètres) : la suite à pied (m). */
const WALK_LIMIT = 250;
/** Distance à laquelle les opérateurs s'arrêtent avant l'objectif pour constater (m). */
const WATCH_DISTANCE = 12;
/** Rayon de recherche de l'auteur d'un fait autour du point désigné (m). */
const SEARCH_RADIUS = 32;
/** Durée maximale du constat sur place avant de renoncer (s) ; sur un auteur de fait constaté (au milieu d'un groupe compact). */
const WATCH_TIME = 25;
const WATCH_OFFENDER = 8;
/** Motif de l'interpellation non tentée sur un auteur au milieu d'un groupe compact (ui/command/direct/caps.ts le dit en clair). */
const COMPACT_REASON = 'Objectif au milieu d’un groupe compact : interpellation non tentée.';
/**
 * Interpellation : auteur d'un fait constaté à moins de ARREST_RUN m des opérateurs, le binôme le plus proche y court ;
 * plus loin, l'approche (au trot) est revue chaque seconde et relancée quand la cible s'est déplacée de plus de
 * APPROACH_RETARGET m (m).
 */
const ARREST_RUN = 120;
const APPROACH_RETARGET = 8;
/** Ordre du joueur : nouvelles tentatives sur un auteur qui a distancé le binôme, s'il reste à portée de course. */
const ARREST_RETRIES = 1;
/** Interpellation sur ordre du joueur, cible éloignée : la colonne s'arrête à tant de mètres d'elle (m). */
const ARREST_STANDOFF = 30;
/** Ordre du joueur : tête de colonne à moins de tant de mètres du point, la BRAV-M y est (m). */
const PLAYER_ARRIVE = 30;
/** Ordre du joueur, près du point : tête bloquée depuis plus de tant (s), ou en attente depuis plus de tant (s) : la suite à pied. */
const PLAYER_BLOCKED = 5;
const PLAYER_WAITING = 8;
/** Ordre du joueur, loin du point : tête arrêtée depuis tant de secondes — nouvel itinéraire (au lieu de RELAUNCH_GAP). */
const PLAYER_RELAUNCH = 8;
/** Ordre du joueur, près du point : tête qui n'a pas gagné cinq mètres vers son point d'arrêt depuis tant (s) : la suite à pied. */
const PLAYER_STALL = 15;
/**
 * Tête de colonne arrêtée (circulation, rue encombrée) à plus de tant de mètres du point (m) : la colonne repart par un
 * nouvel itinéraire, au plus RELAUNCH_MAX fois, au lieu de se déclarer « en position » en pleine ville, à des
 * kilomètres de l'objectif (elle n'y arrivait jamais) ; le délai de route ne s'applique que plus près.
 */
const RIDE_FAR = 200;
/** Trajet de plus de tant de mètres : la colonne roule en urgence (fermetures de rue franchies) (m). */
const URGENT_BEYOND = 300;
const RELAUNCH_MAX = 12;
/** Délai minimal entre deux nouveaux départs (s). */
const RELAUNCH_GAP = 20;
/**
 * Départ : la tête attend (ou bloque) derrière un véhicule depuis plus de START_SWAP s après le départ de la colonne, sans
 * avoir fait cinq mètres, alors qu'une moto de sa propre colonne est à moins de START_NEAR m
 * (motos garées côte à côte, demi-tour serré : la tête attend celle qui la suit, qui l'attend) — une autre moto mène.
 */
const START_SWAP = 4;
const START_NEAR = 8;
/** La règle START_SWAP vaut tant que la tête est à moins de tant de mètres de son point de départ (m). */
const START_AREA = 50;
/**
 * Suiveur garé qui attend son meneur (la moto devant lui dans la colonne) à moins de START_HOLD m : laissé au pilote
 * automatique, qui le lâche sur la trace du meneur, pendant START_HOLD_MAX s au plus (m, s ; voir thinkRide).
 */
const START_HOLD = 90;
const START_HOLD_MAX = 45;
/** Moto à plus de tant de mètres de la tête : la tête l'attend (m) ; regroupée à moins de REGROUP_DONE m ; attente maximale (s). */
const REGROUP_SPREAD = 120;
const REGROUP_DONE = 45;
const REGROUP_MAX = 40;
/** Regroupements par trajet : au-delà, une moto coincée pour de bon ne retient plus l'unité (elle la rejoint seule). */
const REGROUP_TRIES = 2;
/** Tête arrêtée à plus de tant de mètres de son point d'arrêt : le compte rendu le dit (m). */
const SHORT_OF_POINT = 40;
/**
 * Après l'arrivée, une moto à plus de REJOIN_SPREAD m de la tête dont le pilote automatique ne roule plus est relancée
 * vers elle, toutes les REJOIN_GAP s, au plus REJOIN_MAX fois (m, s).
 */
const REJOIN_SPREAD = 60;
const REJOIN_GAP = 10;
const REJOIN_MAX = 12;
/** Opérateurs à moins de tant de mètres de leurs machines : ils y montent directement (embarquement), sans colonne à pied (m). */
const MOUNT_REACH = 40;
/**
 * Intervalle entre deux motos de la colonne (m, entre pare-chocs) : celui du pilote automatique pour un deux-roues
 * (sim/vehicles/autopilot.ts MOTO_GAP) — serrées à 3,5 m, elles se touchaient à chaque freinage de la file.
 */
const MOTO_GAP = 6;
/**
 * Ordre de la file à chaque départ de la colonne (voir fileOrder) : une moto plus proche de la tête que celle qui la
 * précède dans la file, de plus de … m, passe devant elle (m).
 */
const FILE_SLACK = 15;
/**
 * Nœud dans la file (voir untieFile) : suiveur arrêté derrière un véhicule depuis KNOT_WAIT s, une moto placée après lui
 * dans la file à moins de KNOT_AHEAD m devant lui, sur sa voie (à KNOT_SIDE m près de son axe) (s, m, m).
 */
const KNOT_WAIT = 4;
const KNOT_AHEAD = 12;
const KNOT_SIDE = 1.6;
/**
 * Tête de colonne arrêtée au milieu de la foule (au moins CROWD_AROUND manifestants à moins de CROWD_RADIUS m) depuis
 * CROWD_STUCK s sans avoir gagné 5 m vers son point d’arrêt : les motos ne fendent pas une foule — pied à terre, la suite à pied
 * (m, nombre, s).
 */
const CROWD_RADIUS = 15;
const CROWD_AROUND = 6;
const CROWD_STUCK = 8;
/**
 * « Suivre » en selle : la BRAV-M se tient à GARDE_BEHIND m derrière la personne suivie, repart quand elle est à plus
 * de GARDE_FAR m, met pied à terre quand une foule (au moins GARDE_CROWD_N manifestants) est à moins de GARDE_CROWD m
 * d'elle (m, nombre).
 */
const GARDE_BEHIND = 30;
const GARDE_FAR = 60;
const GARDE_CROWD = 120;
const GARDE_CROWD_N = 8;
/**
 * « Avec vous » derrière quelqu'un qui roule (voir thinkEscort) : la BRAV-M ferme la colonne de son véhicule. La moto de
 * tête suit sa trace, à GARDE_BEHIND m derrière lui plus ESCORT_SLOT m par véhicule de sa colonne ; elle part quand il
 * a pris GARDE_FAR − GARDE_BEHIND m de plus. Au-delà de ESCORT_REACH m de lui, elle le rejoint d'abord par les rues
 * (trajet ordinaire). Trace gardée : un point tous les TRAIL_STEP m, TRAIL_MAX points au plus.
 */
const ESCORT_SLOT = 16;
const ESCORT_REACH = 250;
const TRAIL_STEP = 3;
const TRAIL_MAX = 600;
/** Allures d'estimation (m/s) : opérateurs à pied au trot, à pied dans une foule dense, colonne de motos ; remontée en selle (s). */
const FOOT_SPEED = 2.2;
const CROWD_FOOT_SPEED = 0.5;
const RIDE_SPEED = 7;
const REMOUNT_TIME = 8;
/** Motos amenées aux opérateurs : nouvelle destination toutes les FETCH_GAP s ; sans progrès pendant FETCH_STALL s, la suite à pied. */
const FETCH_GAP = 3;
const FETCH_STALL = 25;
/** Rendez-vous des motos : tant de mètres devant les opérateurs, vers le point ; relancé s'il s'est déplacé de plus de FETCH_MOVE m. */
const FETCH_AHEAD = 20;
const FETCH_MOVE = 25;

/**
 * Ordre du joueur, opérateurs à pied, machines (ou opérateurs) au milieu de la foule : jusqu'à CROWD_WALK_MAX m du point,
 * ils y vont à pied tout de suite, sans remonter en selle — la remontée au milieu des manifestants prenait une minute
 * et demie, puis la colonne ne sortait pas de la foule (m). Remontée en selle commencée et pas finie au bout de
 * PLAYER_REMOUNT_MAX s, la foule autour : elle est abandonnée, la suite à pied (s).
 */
const CROWD_WALK_MAX = 400;
const PLAYER_REMOUNT_MAX = 30;

const MOVE_ORDERS: ReadonlySet<string> = new Set(['avancer', 'colonne', 'repli']);

/** L'unité est-elle un groupe de BRAV-M (au moins un binôme subordonné doté d'une moto, ou binôme isolé) ? */
export function isBravmGroup(core: CommandCore, s: Squad): boolean {
  const ctx = core.ctx;
  const isMoto = (id: number): boolean => {
    const v = id !== 0 ? ctx.vehicles.get(id) : undefined;
    return !!v && v.kind === 'moto_bravm';
  };
  if (s.kind === 'binome') {
    // un binôme isolé, sans groupe au-dessus de lui
    return s.parentId === 0 && isMoto(s.vehicleId);
  }
  const kids = ctx.squads.childrenOf(s.id);
  for (let i = 0; i < kids.length; i++) if (kids[i].kind === 'binome' && isMoto(kids[i].vehicleId)) return true;
  return false;
}

export class BravmUnit extends SpecialUnit {
  private readonly motos: Vehicle[] = [];
  /** Durée maximale du trajet en cours avant de finir à pied (s). */
  private rideMax = 240;
  /** Prochaine revue des motos qui ne suivent plus (s). */
  private stragglerAt = 0;
  private readonly people: Person[] = [];
  private tx = 0;
  private tz = 0;
  private standX = 0;
  private standZ = 0;
  /** Distance d'arrêt avant le point du trajet en cours (m). */
  private standoff = 0;
  private slow = false;
  private convoyAt = -100;
  /** Nouveaux départs de la colonne arrêtée loin du point (voir RIDE_FAR). */
  private relaunches = 0;
  private relaunchX = 0;
  /** Changements de tête au départ (voir START_SWAP), et point de départ de la colonne. */
  private startSwaps = 0;
  private departX = 0;
  private departZ = 0;
  /** Début du regroupement en cours (s), −1 sans regroupement (voir REGROUP_SPREAD). */
  private regroupAt = -1;
  private regroups = 0;
  /** Trajet en urgence (voir URGENT_BEYOND). */
  private urgent = false;
  private relaunchZ = 0;
  /** Retardataires de l'arrivée relancés vers la tête (voir rejoin) : nombre de relances, prochaine revue (s ; −1 : aucune). */
  private rejoinTries = 0;
  private rejoinAt = -1;
  /** Motos dans l'ordre de départ du trajet en cours (identifiants), vide : ordre des binômes. */
  private readonly departOrder: number[] = [];
  /** Dernière position et instant où chaque moto a bougé (voir les retardataires dans thinkRide). */
  private readonly still = new Map<number, { x: number; z: number; t: number }>();
  private clearSince = 0;
  private watchAt = 0;
  private arrestOk = false;
  private arrestReason = '';
  private arrested = 0;
  /** Tête de colonne au milieu de la foule : distance au point d'arrêt quand elle avançait encore, et depuis quand (voir CROWD_STUCK). */
  private crowdD = 0;
  private crowdAt = -1;
  /** Point d'arrêt du déplacement en cours ramené en arrière par la foule (ride : jamais d'arrêt dans un rassemblement). */
  private crowdBack = false;
  /** Interception loin d'opérateurs à pied : ils remontent d'abord en selle, puis la colonne roule vers l'objectif. */
  private rideAfterRemount = false;
  /** Ordre à exécuter une fois le pied à terre fait (manœuvre à pied laissée au module de police). */
  private after: SquadOrder | null = null;
  private handoverSet = false;
  /** Action différée à la prochaine réflexion (voir defer). */
  private pending: (() => void) | null = null;
  private policeReported = false;
  /**
   * Interpellation ordonnée à pied, auteur à portée de course : l'accusé est celui du module de police quand le binôme
   * part tout de suite ; si l'approche commence autrement (auteur au milieu d'un groupe compact), la BRAV-M le doit.
   */
  private ackOwed = false;
  /** Ordre du joueur : depuis quand l'auteur désigné est au milieu d'un groupe compact (−1 : il n'y est pas). */
  private compactSince = -1;
  /** Motos amenées aux opérateurs (voir fetchMotos) : prochaine relance, meilleure distance, depuis quand (s, m, s). */
  private fetchAt = 0;
  private fetchBest = Infinity;
  private fetchSince = 0;
  /** Position de l'objectif quand l'approche en cours a été lancée (revue chaque seconde, voir thinkApproach). */
  private approachX = 0;
  private approachZ = 0;
  /** Nouvelles tentatives d'interpellation de l'ordre en cours (voir retryArrest). */
  private arrestRetries = 0;
  /** « Avec vous » derrière un véhicule : véhicule que suit la moto de tête (0 : aucun), prochaine revue (s). */
  private escortLead = 0;
  private escortAt = 0;
  /** Distance tenue derrière ce véhicule, le long de sa trace (m). */
  private escortGap = GARDE_BEHIND;
  /** Trace du véhicule de la personne suivie (x, z, x, z… la plus récente en dernier), et ce véhicule. */
  private readonly trail: number[] = [];
  private trailOf = 0;
  private readonly chain: Vehicle[] = [];

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'bravm');
    this.keepShown = true;
    this.standsApart = true;
    this.refresh();
    const m = this.motos[0];
    if (m) this.rememberHome(m.x, m.z);
  }

  alive(): boolean {
    return this.core.members(this.squad.id, this.people) > 0;
  }

  /** Relit les motos du groupe (dans l'ordre des binômes) et l'état général. */
  private refresh(): void {
    const core = this.core;
    core.fleet(this.squad.id, this.motos);
    for (let i = this.motos.length - 1; i >= 0; i--) if (this.motos[i].kind !== 'moto_bravm' || !core.usable(this.motos[i])) this.motos.splice(i, 1);
    // ordre de départ du trajet en cours (voir departure) : la tête est la moto qui mène réellement la colonne
    const order = this.departOrder;
    if (order.length > 0) {
      const rank = (v: Vehicle): number => {
        const r = order.indexOf(v.id);
        return r < 0 ? order.length : r;
      };
      this.motos.sort((a, b) => rank(a) - rank(b));
    }
    const lead = this.motos[0];
    const st = this.status;
    st.vehicleId = lead ? lead.id : 0;
    if (lead) {
      st.x = lead.x;
      st.z = lead.z;
    }
  }

  /** Opérateurs (passagers) en selle. */
  private mountedOperators(): number {
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) if (this.seated(this.motos[i], 'passenger')) n++;
    return n;
  }

  private pilots(): number {
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) if (this.seated(this.motos[i], 'driver')) n++;
    return n;
  }

  /**
   * Pilotes qui peuvent prendre leur machine : en selle, ou à pied à côté (groupe descendu de ses motos, au départ en
   * mode libre par exemple) — l'embarquement les remet au guidon. Sans ce décompte, une BRAV-M toute à pied ne
   * remontait jamais en selle et faisait à pied des trajets de plusieurs centaines de mètres.
   */
  private pilotsAvailable(): number {
    let n = this.pilots();
    if (n > 0) return n;
    const ctx = this.core.ctx;
    const ids = [this.squad.id, ...ctx.squads.childrenOf(this.squad.id).map((q) => q.id)];
    for (const id of ids) {
      for (const m of ctx.squads.get(id)?.members ?? []) {
        const p = ctx.people.get(m);
        if (p && !p.isPlayer && p.poste === 'pilote_moto' && p.posture !== 'down' && p.custody === 'free') n++;
      }
    }
    return n;
  }

  /** Opérateurs à pied valides (dans this.people), le joueur excepté (chef de la BRAV-M : il va où il veut). */
  private footOperators(): number {
    const n = this.core.members(this.squad.id, this.people);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.vehicleId === 0 && !p.isPlayer && p.poste !== 'pilote_moto' && p.posture !== 'down' && p.custody === 'free') this.people[m++] = p;
    }
    this.people.length = m;
    return m;
  }

  /** Centre des opérateurs à pied dans core.v2 ; false s'il n'y en a aucun. */
  private footCenter(): boolean {
    const n = this.footOperators();
    if (n === 0) return false;
    let x = 0;
    let z = 0;
    for (let i = 0; i < n; i++) {
      x += this.people[i].x;
      z += this.people[i].z;
    }
    this.core.v2.x = x / n;
    this.core.v2.z = z / n;
    return true;
  }

  /** Opérateurs à pied, ou machines, au milieu de la foule (au moins CROWD_AROUND manifestants à moins de CROWD_RADIUS m) ? */
  private amidCrowd(): boolean {
    const core = this.core;
    if (this.footCenter() && core.ctx.people.countIn(core.v2.x, core.v2.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND) return true;
    const lead = this.motos[0];
    return !!lead && core.ctx.people.countIn(lead.x, lead.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND;
  }

  /**
   * Ordre du joueur, opérateurs à pied, point à `d` m : y vont-ils à pied plutôt que de remonter en selle (machines ou
   * opérateurs au milieu de la foule, point à CROWD_WALK_MAX m au plus) ?
   */
  private walksInstead(d: number): boolean {
    return d <= CROWD_WALK_MAX && this.byPlayer() && this.amidCrowd();
  }

  /** Une foule (au moins GARDE_CROWD_N manifestants) est-elle à moins de `r` mètres de (x, z) ? */
  private crowdNear(x: number, z: number, r: number): boolean {
    return this.core.ctx.people.countIn(x, z, r, isProtester) >= GARDE_CROWD_N;
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    this.refresh();
    // un nouvel ordre remplace l'action différée du précédent, et les motos qu'on amenait
    this.pending = null;
    this.fetchAt = 0;
    this.endEscort();
    const type = o.type;
    const mounted = this.mountedOperators() > 0;
    const stage = this.status.stage;
    const busyOnFoot = stage === 'approche' || stage === 'constat' || stage === 'interpellation' || stage === 'retour' || stage === 'remontee';
    if (type === 'interpeller' || type === 'avancer' || type === 'colonne' || type === 'repli' || type === 'embarquer' || type === 'debarquer') {
      this.begin(o);
      return true;
    }
    if (type === 'cesser') {
      if (busyOnFoot || !mounted) {
        // l'action est abandonnée : retour aux machines
        this.begin(o);
        return true;
      }
      this.stopMotos();
      this.order = null;
      this.status.order = '';
      this.setStage('repos');
      return true;
    }
    // « suivre » (« Avec moi », « Suivez-moi à pied » du commandant) : le point est la personne suivie, là où elle est
    // — l'ordre ne porte que sa cible ; à des centaines de mètres, la BRAV-M partait à pied, ou restait sur place
    if (type === 'suivre' && o.targetId > 0 && locate(this.core, o.targetId)) {
      o = { ...o, x: this.core.v2.x, z: this.core.v2.z };
      if (this.follow(o, mounted)) return true;
    }
    const far = this.farPoint(o);
    if (mounted && this.motos.length > 0 && far >= RIDE_BEYOND && this.pilots() > 0) {
      // point éloigné : la colonne s'y rend à moto, pied à terre sur place, puis la manœuvre est exécutée
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      this.tx = o.x;
      this.tz = o.z;
      this.say(received(this.squad.name, 'en colonne à moto vers le point, pied à terre sur place'));
      this.ride(o.x, o.z, RIDE_STANDOFF);
      return true;
    }
    if (!mounted && !busyOnFoot && this.motos.length > 0 && this.pilotsAvailable() > 0 && this.footOperators() > 0 && far >= WALK_BELOW) {
      // trop loin pour y aller à pied : en selle (motos à portée, ou amenées par les pilotes), puis la manœuvre
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      this.tx = o.x;
      this.tz = o.z;
      this.say(received(this.squad.name, this.walksInstead(far) ? 'machines dans la foule, on vient à pied'
        : this.atMotos(true) ? 'trop loin à pied, on remonte en selle' : 'trop loin à pied, les motos nous rejoignent'));
      this.defer(() => this.farOnFoot());
      return true;
    }
    if (mounted && this.motos.length > 0) {
      // toute manœuvre à pied commence par le pied à terre ; l'ordre est ensuite rendu au module de police
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      // (« Avec moi » : l'accusé tout de suite — celui du module de police ne vient qu'après le pied à terre)
      if (type === 'suivre') this.say(received(this.squad.name, 'pied à terre, je vous suis'));
      this.dismount();
      return true;
    }
    // à pied : c'est une unité comme une autre
    this.order = null;
    this.after = null;
    this.status.order = '';
    this.setStage('a_pied');
    return false;
  }

  /**
   * « Suivre » la personne `o.targetId` (position dans o.x, o.z) : en selle et sans foule à moins de GARDE_CROWD m
   * d'elle, la BRAV-M reste en selle à GARDE_BEHIND m derrière (étape « garde ») ; quand la personne suivie est en
   * véhicule, elle la suit toujours en selle (elle y remonte si elle est à pied), foule ou non. Sinon (personne à pied
   * près d'une foule, BRAV-M à pied) : false — le module de police la fait suivre à pied (posture « en garde » quand
   * le chef s'arrête).
   */
  private follow(o: SquadOrder, mounted: boolean): boolean {
    const target = this.core.ctx.people.get(o.targetId);
    if (!target || this.motos.length === 0) return false;
    if (mounted && this.pilots() > 0) {
      // (pied à terre par la règle générale ci-dessous — derrière quelqu'un qui est à pied seulement : des opérateurs à
      // pied ne suivent pas un véhicule qui roule)
      if (target.vehicleId === 0 && this.crowdNear(target.x, target.z, GARDE_CROWD)) return false;
      this.order = this.copy(o);
      this.after = null;
      this.status.order = 'suivre';
      this.tx = o.x;
      this.tz = o.z;
      this.say(received(this.squad.name, 'en selle avec vous'));
      this.guard(target);
      return true;
    }
    // (machines hors de portée : retour aux machines d'abord — la personne suivie est en véhicule, la suivre à pied la
    // laissait filer ; backToMotos y ramène les opérateurs)
    if (!mounted && target.vehicleId !== 0 && this.pilotsAvailable() > 0 && this.footOperators() > 0) {
      this.order = this.copy(o);
      this.after = null;
      this.status.order = 'suivre';
      this.say(received(this.squad.name, 'en selle, on vous suit'));
      this.defer(() => this.backToMotos());
      return true;
    }
    return false;
  }

  /** En selle derrière la personne suivie : on roule jusqu'à GARDE_BEHIND m d'elle si elle est loin, sinon on attend là. */
  private guard(target: Person): void {
    const lead = this.motos[0];
    this.tx = target.x;
    this.tz = target.z;
    // (la personne suivie roule, à portée : la BRAV-M ferme la colonne de son véhicule — thinkEscort, à la prochaine réflexion)
    const tv = this.rideOf(target);
    if (lead && tv && Math.hypot(tv.x - lead.x, tv.z - lead.z) <= ESCORT_REACH) {
      this.escortAt = 0;
      this.setStage('garde');
      return;
    }
    if (lead && Math.hypot(target.x - lead.x, target.z - lead.z) > GARDE_FAR) {
      this.ride(target.x, target.z, GARDE_BEHIND);
      return;
    }
    this.setStage('garde');
  }

  private begin(o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.after = null;
    this.status.order = o.type;
    this.status.targetId = o.type === 'interpeller' && o.targetId > 0 ? o.targetId : 0;
    this.arrestOk = false;
    this.arrestReason = '';
    this.arrestRetries = 0;
    this.rideAfterRemount = false;
    this.ackOwed = false;
    this.compactSince = -1;
    this.tx = o.x;
    this.tz = o.z;
    if (o.type === 'interpeller' && locate(core, o.targetId)) {
      this.tx = core.v2.x;
      this.tz = core.v2.z;
    }
    const mounted = this.mountedOperators() > 0;
    const lead = this.motos[0];
    // distance au point : de la tête de colonne en selle, des opérateurs à pied sinon
    const from = mounted && lead ? { x: lead.x, z: lead.z } : this.footCenter() ? { x: core.v2.x, z: core.v2.z } : lead ? { x: lead.x, z: lead.z } : null;
    const d = from ? Math.hypot(this.tx - from.x, this.tz - from.z) : 0;
    switch (o.type) {
      case 'interpeller': {
        const where = core.sector(this.tx, this.tz) !== '' ? ', ' + core.sector(this.tx, this.tz) : '';
        if (mounted && d > ARREST_RUN && this.pilots() > 0) {
          // loin : la colonne roule jusqu'à la distance de retenue, pied à terre, puis l'approche à pied
          this.say(received(this.squad.name, 'interception de l’objectif' + where + ', pied à terre à distance'));
          this.ride(this.tx, this.tz, this.byPlayer() ? ARREST_STANDOFF : core.tuning.bravmStandoff);
        } else if (mounted) {
          // près : pied à terre sur place, le binôme le plus proche y court
          this.say(received(this.squad.name, 'interception de l’objectif' + where + ', pied à terre'));
          this.dismount();
        } else if (d >= WALK_BELOW && this.motos.length > 0 && this.pilotsAvailable() > 0 && this.footOperators() > 0 && this.atMotos(true) && !this.walksInstead(d)) {
          // objectif éloigné (150 m et plus), machines à portée : en selle d'abord, puis la colonne roule jusqu'à la
          // distance de retenue (la BRAV-M partait à pied, à des centaines de mètres, alors que la carte annonçait « en
          // véhicules »)
          this.say(received(this.squad.name, 'interception de l’objectif' + where + ', en selle'));
          this.rideAfterRemount = true;
          this.defer(() => this.backToMotos());
        } else {
          // à pied : approche (ou course directe sur un auteur de fait constaté, voir approach). Ordre du joueur : la
          // BRAV-M accuse réception tout de suite — l'accusé du module de police ne vient qu'au départ du binôme, quatre à
          // dix secondes plus tard quand les opérateurs viennent de mettre pied à terre ou que l'auteur est au milieu
          // d'un groupe compact (l'approche d'abord). Ordre de l'IA : l'accusé du module de police quand le binôme part
          // tout de suite, sinon celui de la BRAV-M (ackOwed couvre une situation qui change avant approach).
          if (this.byPlayer() || !this.arrestable() || d > ARREST_RUN) this.say(received(this.squad.name, 'interception de l’objectif' + where + ', à pied'));
          else if (!this.runsAtOnce()) this.ackOwed = true;
          this.defer(() => this.approach());
        }
        break;
      }
      case 'avancer':
      case 'colonne':
      case 'repli': {
        const repli = o.type === 'repli';
        // retour au commissariat (« Rentrer au commissariat ») : elle y rentre à moto, ses machines avec elle, même toute
        // proche de ses places — à pied, elle laissait ses motos là où elle les avait quittées et restait « Retour »
        const home = isReturningHome(this.core.ctx, this.squad.id);
        if (mounted && (d >= RIDE_BEYOND || home) && this.pilots() > 0) {
          this.say(received(this.squad.name, repli ? 'je me replie en colonne' : 'en colonne vers le point'));
          this.ride(this.tx, this.tz, 0);
        } else if (home && this.footOperators() > 0 && this.motos.length > 0 && this.pilotsAvailable() > 0) {
          this.say(received(this.squad.name, 'en colonne vers le point'));
          this.defer(() => this.backToMotos());
        } else if (mounted) {
          // en selle, point à moins de 60 m : pied à terre sur place, la suite à pied (afterDismount)
          this.say(received(this.squad.name, repli ? 'pied à terre, je me replie à pied' : 'pied à terre, à pied vers le point'));
          this.dismount();
        } else if (this.footOperators() > 0 && (d < WALK_BELOW || this.motos.length === 0 || this.pilotsAvailable() === 0)) {
          // à pied, point à moins de 150 m : on y va à pied, directement (le retour aux machines, garées au milieu de
          // la foule, puis la remontée en selle, laissaient la BRAV-M sur place une minute et plus)
          this.say(received(this.squad.name, repli ? 'je me replie à pied' : 'à pied vers le point'));
          this.defer(() => this.walkTo(this.tx, this.tz));
        } else if (this.footOperators() > 0) {
          this.say(received(this.squad.name, this.walksInstead(d) ? 'machines dans la foule, à pied vers le point'
            : this.atMotos(true) ? 'en selle vers le point' : 'les motos nous rejoignent, en selle vers le point'));
          this.defer(() => this.farOnFoot());
        } else {
          // personne à pied ni en selle (opérateurs hors d'état) : les pilotes y vont
          this.say(received(this.squad.name, 'en colonne vers le point'));
          this.ride(this.tx, this.tz, 0);
        }
        break;
      }
      case 'embarquer':
        if (mounted) this.complete(true, '');
        else this.defer(() => this.backToMotos());
        break;
      case 'debarquer':
        if (mounted) this.dismount();
        else this.complete(true, '');
        break;
      default: // cesser
        this.defer(() => this.backToMotos());
        break;
    }
  }

  /**
   * Ordre interne différé à la prochaine réflexion : donné pendant la prise en charge (claim), il arrivait au module de
   * police pendant que celui-ci traitait encore l'ordre reçu par la même unité — et il était perdu (l'unité était
   * déjà dans sa liste d'ordres à traiter, vidée ensuite) : la BRAV-M à pied restait plantée sur place.
   */
  private defer(action: () => void): void {
    this.pending = action;
    this.setStage('retour');
  }

  /** Ce qu'elle fait d'un ordre donné à une unité supérieure (toute la compagnie) : voir SpecialUnit.relayFrom. */
  override relayFrom(o: SquadOrder): SquadOrder | null {
    switch (o.type) {
      case 'suivre':
      case 'avancer':
      case 'colonne':
      case 'repli':
      case 'cesser':
      case 'libre':
        return this.copy(o);
      case 'tenir': {
        // elle tient là où elle est, pas au point de la compagnie
        const c = this.copy(o);
        const lead = this.motos[0];
        const at = this.footCenter() ? this.core.v2 : lead ? { x: lead.x, z: lead.z } : null;
        if (at) {
          c.x = at.x;
          c.z = at.z;
        }
        return c;
      }
      case 'embarquer':
      case 'debarquer': {
        // (les ordres de colonne de la compagnie — fourgons — ne la font ni monter ni descendre ; ceux du joueur, si)
        if (o.byPlayer) return this.copy(o);
        // « tout le monde me suit » : la compagnie embarque derrière le véhicule du joueur (session/follow.ts,
        // startConvoy — ordre émis en son nom). La BRAV-M de la compagnie part avec elle : en selle, à sa place derrière
        // lui, hors de la colonne des fourgons (« suivre ») ; elle restait à pied sur la place, sans ordre. Quand il
        // descend et que la compagnie débarque, elle met pied à terre comme elle — sauf sous ses ordres (commandant) :
        // « Avec moi » ne le quitte pas, elle garde « suivre ».
        const me = this.core.ctx.player.person();
        if (!me || o.issuedBy !== me.id) return null;
        if (o.type === 'embarquer') {
          if (me.vehicleId === 0) return null;
          const c = this.copy(o);
          c.type = 'suivre';
          c.targetId = me.id;
          c.x = me.x;
          c.z = me.z;
          return c;
        }
        const own = this.squad.order;
        return own.type === 'suivre' && own.targetId === me.id && !own.byPlayer && !this.ledBy(me.id) ? this.copy(o) : null;
      }
      default:
        // ligne, barrage, charge… : la BRAV-M ne tient pas de barrage, elle garde son ordre
        return null;
    }
  }

  /** La personne commande-t-elle cette unité (elle-même ou une unité supérieure) ? */
  private ledBy(personId: number): boolean {
    const squads = this.core.ctx.squads;
    let q: Squad | undefined = this.squad;
    for (let guard = 0; q && guard < 8; guard++) {
      if (q.leaderId === personId) return true;
      q = q.parentId !== 0 ? squads.get(q.parentId) : undefined;
    }
    return false;
  }

  // ───────────────────────────── à moto ─────────────────────────────

  /** Départ en colonne vers (x, z), arrêt `standoff` mètres avant (jamais dans une foule, sur un ordre de l'IA). */
  private ride(x: number, z: number, standoff: number): void {
    const core = this.core;
    const lead = this.motos[0];
    const ap = core.autopilot;
    if (!lead || !ap || this.pilots() === 0) {
      // pas de machine ou pas de pilote automatique : à pied
      this.dismount();
      return;
    }
    // point d'arrêt le long de l'itinéraire
    let sx = x;
    let sz = z;
    this.crowdBack = false;
    this.standoff = standoff;
    const path = core.path;
    const routed = core.ctx.world.findPath(lead.x, lead.z, x, z, 'vehicle', path) && path.length >= 4;
    this.departure(routed ? path : null, x, z);
    const player = this.byPlayer();
    if (routed) {
      let total = 0;
      for (let i = 2; i + 1 < path.length; i += 2) total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
      let back = standoff;
      for (let attempt = 0; attempt < 6; attempt++) {
        const at = total - back;
        if (at <= 4) {
          sx = lead.x;
          sz = lead.z;
          break;
        }
        this.pointOnPath(path, at);
        sx = core.v2.x;
        sz = core.v2.z;
        // la colonne ne s'arrête pas au milieu de la foule (ordre de l'IA : sur un ordre du joueur, elle va au point et
        // met pied à terre si la foule l'arrête — thinkRide)
        if (player || core.ctx.people.countIn(sx, sz, 22, isProtester) < 8) break;
        back += 20;
      }
      this.crowdBack = back > standoff;
    } else if (standoff > 0) {
      const d = Math.hypot(x - lead.x, z - lead.z);
      if (d > standoff + 4) {
        sx = x - ((x - lead.x) / d) * standoff;
        sz = z - ((z - lead.z) / d) * standoff;
      } else {
        sx = lead.x;
        sz = lead.z;
      }
    }
    this.standX = sx;
    this.standZ = sz;
    this.slow = false;
    if (Math.hypot(sx - lead.x, sz - lead.z) < 8) {
      this.arrived();
      return;
    }
    this.crowdAt = -1;
    this.relaunches = 0;
    this.startSwaps = 0;
    this.rejoinAt = -1;
    // trajet à travers la ville : en urgence, les fermetures de rue de la police sont franchies (arrêtée devant un
    // barrage à 600 m du point, la colonne s'y déclarait « en position » et n'arrivait jamais) ; manœuvre courte : au pas
    // de la colonne, en file serrée. Décidé au départ, gardé pour tout le trajet (relances, changements d'allure)
    this.urgent = Math.hypot(sx - lead.x, sz - lead.z) > URGENT_BEYOND;
    this.regroupAt = -1;
    this.regroups = 0;
    this.relaunchX = lead.x;
    this.relaunchZ = lead.z;
    this.departX = lead.x;
    this.departZ = lead.z;
    this.still.clear();
    if (!this.convoy(core.tuning.bravmSpeed)) {
      this.dismount();
      return;
    }
    // délai de route : quatre minutes, davantage pour traverser Paris (8 m/s de moyenne, marge comprise)
    this.rideMax = Math.max(240, Math.hypot(sx - lead.x, sz - lead.z) * 1.6 / 8 + 60);
    this.setStage('route');
  }

  /**
   * Ordre de départ : la moto la plus avancée vers la sortie mène, les autres suivent dans l'ordre où elles sont garées
   * (une tête garée derrière les autres attendait qu'elles passent, et elles l'attendaient : personne ne partait). À
   * égalité, la moto où le joueur est en selle derrière son pilote mène : toutes les motos de l'unité suivent la sienne.
   */
  private departure(path: readonly number[] | null, x: number, z: number): void {
    const motos = this.motos;
    this.departOrder.length = 0;
    if (motos.length < 2) return;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < motos.length; i++) {
      cx += motos[i].x / motos.length;
      cz += motos[i].z / motos.length;
    }
    // direction de sortie : 30 m le long de l'itinéraire (à défaut, vers le point)
    let tx = x;
    let tz = z;
    if (path) {
      this.pointOnPath(path, 30);
      tx = this.core.v2.x;
      tz = this.core.v2.z;
    }
    const len = Math.hypot(tx - cx, tz - cz);
    if (len < 1e-3) return;
    const dx = (tx - cx) / len;
    const dz = (tz - cz) / len;
    const me = this.core.ctx.player.person();
    const mine = me && me.vehicleId !== 0 ? me.vehicleId : 0;
    const ahead = (v: Vehicle): number => (v.x - cx) * dx + (v.z - cz) * dz + (v.id === mine && v.seats[0] !== me!.id ? 0.5 : 0);
    const sorted = motos.slice().sort((a, b) => ahead(b) - ahead(a));
    for (let i = 0; i < sorted.length; i++) this.departOrder.push(sorted[i].id);
    motos.length = 0;
    for (let i = 0; i < sorted.length; i++) motos.push(sorted[i]);
  }

  private pointOnPath(path: readonly number[], s: number): void {
    const v = this.core.v2;
    let acc = 0;
    for (let i = 2; i + 1 < path.length; i += 2) {
      const len = Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
      if (s <= acc + len) {
        const t = len > 1e-6 ? (s - acc) / len : 0;
        v.x = path[i - 2] + (path[i] - path[i - 2]) * t;
        v.z = path[i - 1] + (path[i + 1] - path[i - 1]) * t;
        return;
      }
      acc += len;
    }
    v.x = path[path.length - 2];
    v.z = path[path.length - 1];
  }

  private convoy(speed: number): boolean {
    const ap = this.core.autopilot;
    if (!ap) return false;
    this.convoyAt = this.core.now;
    this.fileOrder();
    return ap.convoy(this.motos, this.standX, this.standZ, { gap: MOTO_GAP, speed, urgence: this.urgent });
  }

  /**
   * File de la colonne dans l'ordre où les motos sont sur la route : une moto relancée seule (retardataire, regroupement)
   * dépasse parfois celles qui la précédaient dans l'ordre de départ ; reprise derrière elles, elle attendait son meneur
   * resté derrière elle, qui attendait qu'elle dégage — trois motos immobiles à 300 m de la tête, la colonne arrivée sans
   * elles. Les suiveurs sont rangés par distance à la tête (écart de FILE_SLACK m au moins : motos garées côte à côte,
   * l'ordre de départ est gardé) ; la tête ne change pas.
   */
  private fileOrder(): void {
    const motos = this.motos;
    const lead = motos[0];
    if (!lead || motos.length < 3) return;
    const far = (v: Vehicle): number => Math.hypot(v.x - lead.x, v.z - lead.z);
    let moved = false;
    for (let i = 2; i < motos.length; i++) {
      const m = motos[i];
      const dm = far(m);
      let j = i;
      while (j > 1 && far(motos[j - 1]) > dm + FILE_SLACK) {
        motos[j] = motos[j - 1];
        j--;
      }
      if (j !== i) {
        motos[j] = m;
        moved = true;
      }
    }
    if (!moved) return;
    this.departOrder.length = 0;
    for (let i = 0; i < motos.length; i++) this.departOrder.push(motos[i].id);
  }

  /**
   * Nœud dans la file : un suiveur arrêté derrière une moto de sa propre colonne placée APRÈS lui dans la file — elle
   * attend qu'il passe (c'est son meneur, direct ou non), il attend qu'elle dégage : ni l'un ni l'autre ne repart (sortie
   * de commissariat encombrée, motos relancées une à une). La moto de devant passe avant lui dans la file. true : la
   * file a changé (la colonne est à relancer).
   */
  private untieFile(): boolean {
    const ap = this.core.autopilot;
    const motos = this.motos;
    if (!ap) return false;
    for (let i = 1; i < motos.length - 1; i++) {
      const a = motos[i];
      const st = ap.status(a);
      if ((st.state !== 'attente' && st.state !== 'bloque') || st.reason !== 'vehicule' || st.blockedFor < KNOT_WAIT || Math.abs(a.speed) > 0.3) continue;
      const fx = Math.sin(a.heading);
      const fz = Math.cos(a.heading);
      for (let j = i + 1; j < motos.length; j++) {
        const b = motos[j];
        const ahead = (b.x - a.x) * fx + (b.z - a.z) * fz;
        const side = (b.x - a.x) * fz - (b.z - a.z) * fx;
        if (ahead <= 0.5 || ahead > KNOT_AHEAD || side > KNOT_SIDE || side < -KNOT_SIDE) continue;
        motos.splice(j, 1);
        motos.splice(i, 0, b);
        this.departOrder.length = 0;
        for (let k = 0; k < motos.length; k++) this.departOrder.push(motos[k].id);
        return true;
      }
    }
    return false;
  }

  private stopMotos(): void {
    const ap = this.core.autopilot;
    if (!ap) return;
    for (let i = 0; i < this.motos.length; i++) ap.stop(this.motos[i]);
  }

  /** Une moto de la colonne (autre que la tête) est-elle à moins de START_NEAR m de la tête ? */
  private siblingNear(lead: Vehicle): boolean {
    for (let i = 1; i < this.motos.length; i++) if (Math.hypot(this.motos[i].x - lead.x, this.motos[i].z - lead.z) < START_NEAR) return true;
    return false;
  }

  /**
   * Départ : la tête attend une moto de sa propre colonne garée à côté d'elle (demi-tour serré, motos côte à côte : la
   * tête attend celle qui doit la suivre, qui l'attend) — une autre moto mène, chacune à son tour au plus. true : la
   * colonne repart avec une autre tête.
   */
  private startSwap(lead: Vehicle): boolean {
    const ap = this.core.autopilot;
    // (au départ seulement — la tête encore près de son point de départ : en route, une tête arrêtée est relancée par un
    // nouvel itinéraire, RIDE_FAR)
    if (!ap || this.startSwaps >= this.motos.length - 1 || Math.hypot(lead.x - this.departX, lead.z - this.departZ) > START_AREA) return false;
    const st = ap.status(lead);
    // (attente ou blocage derrière un véhicule, depuis le départ de la colonne : le temps bloqué de l'autopilote repart à
    // zéro à chaque changement d'état)
    if ((st.state !== 'attente' && st.state !== 'bloque') || st.reason !== 'vehicule' || this.core.now - this.convoyAt <= START_SWAP) return false;
    if (Math.hypot(lead.x - this.relaunchX, lead.z - this.relaunchZ) >= 5 || !this.siblingNear(lead)) return false;
    this.startSwaps++;
    this.rotateLead();
    return true;
  }

  /** La tête passe en queue, la suivante mène ; la colonne repart (même point d'arrêt). */
  private rotateLead(): void {
    const lead = this.motos[0];
    this.departOrder.length = 0;
    for (let i = 1; i < this.motos.length; i++) this.departOrder.push(this.motos[i].id);
    this.departOrder.push(lead.id);
    this.refresh();
    this.relaunchX = this.motos[0].x;
    this.relaunchZ = this.motos[0].z;
    this.convoy(this.slow ? this.core.tuning.bravmSlow : this.core.tuning.bravmSpeed);
  }

  private thinkRide(): void {
    const core = this.core;
    const ap = core.autopilot;
    const lead = this.motos[0];
    if (!ap || !lead) {
      this.dismount();
      return;
    }
    const now = core.now;
    const player = this.byPlayer();
    const o = this.order;
    // retenue : 20 km/h à moins de 30 m de piétons
    const ahead = 12;
    const px = lead.x + Math.sin(lead.heading) * ahead;
    const pz = lead.z + Math.cos(lead.heading) * ahead;
    const near = core.ctx.people.countIn(px, pz, 30, notPolice) > 0;
    // (pendant un regroupement, l'allure est seulement notée : relancer la colonne remettait en route la tête arrêtée pour
    // attendre les retardataires — elle repartait dix secondes après s'être arrêtée, deux motos encore à 150 m derrière
    // elle, qui ne la rattrapaient plus : 300 m d'écart jusqu'à l'arrivée)
    const regrouping = this.regroupAt >= 0;
    if (near) {
      this.clearSince = now;
      if (!this.slow && now - this.convoyAt > 1) {
        this.slow = true;
        if (!regrouping) this.convoy(core.tuning.bravmSlow);
      }
    } else if (this.slow && now - this.clearSince > 3 && now - this.convoyAt > 2) {
      this.slow = false;
      if (!regrouping) this.convoy(core.tuning.bravmSpeed);
    }
    const st = ap.status(lead);
    if (this.startSwap(lead)) return;
    // regroupement : la tête s'arrête tant que des motos sont loin derrière (encore loin du point) ; elles la rejoignent
    // — la tête ne file plus seule en laissant le reste de l'unité, et le joueur en selle, à des centaines de mètres
    const d0 = Math.hypot(this.standX - lead.x, this.standZ - lead.z);
    let spread = 0;
    for (let i = 1; i < this.motos.length; i++) {
      const m = this.motos[i];
      if (m.seats[0] !== 0) spread = Math.max(spread, Math.hypot(m.x - lead.x, m.z - lead.z));
    }
    if (this.regroupAt >= 0) {
      if (spread < REGROUP_DONE || now - this.regroupAt > REGROUP_MAX) {
        this.regroupAt = -1;
        this.still.clear();
        this.convoy(this.slow ? core.tuning.bravmSlow : core.tuning.bravmSpeed);
      }
      return;
    }
    if (spread > REGROUP_SPREAD && d0 > RIDE_FAR && now - this.convoyAt > 5 && this.regroups < REGROUP_TRIES) {
      this.regroupAt = now;
      this.regroups++;
      ap.stop(lead);
      for (let i = 1; i < this.motos.length; i++) {
        const m = this.motos[i];
        if (m.seats[0] !== 0 && Math.hypot(m.x - lead.x, m.z - lead.z) > REGROUP_DONE) ap.driveTo(m, lead.x, lead.z, { speed: core.tuning.bravmSpeed, stopBefore: 4 + i * 3.5, urgence: true });
      }
      return;
    }
    // une moto qui ne suit plus (coincée au départ, perdue dans la circulation) rejoint le point seule
    if (now >= this.stragglerAt) {
      this.stragglerAt = now + 5;
      // (nœud dans la file : un suiveur arrêté derrière une moto qui le suit — la file repart dans l'ordre de la route)
      if (this.untieFile()) {
        this.still.clear();
        this.convoy(this.slow ? core.tuning.bravmSlow : core.tuning.bravmSpeed);
        return;
      }
      for (let i = 1; i < this.motos.length; i++) {
        const m = this.motos[i];
        // immobile depuis plus de 15 s, quel que soit l'état que donne le pilote automatique (un suiveur qui attend son
        // meneur annonce « attente » sans compter le temps bloqué ; une moto en manœuvre ou laissée à l'arrêt n'était
        // jamais relancée : elle restait à sa place, le joueur parfois en selle derrière son pilote)
        let s = this.still.get(m.id);
        if (!s || Math.hypot(m.x - s.x, m.z - s.z) > 3) {
          if (!s) this.still.set(m.id, s = { x: m.x, z: m.z, t: now });
          s.x = m.x;
          s.z = m.z;
          s.t = now;
          continue;
        }
        if (m.seats[0] === 0 || now - s.t <= 15 || Math.hypot(m.x - lead.x, m.z - lead.z) <= 40) continue;
        const ms = ap.status(m);
        if (ms.mode === 'drive' && ms.state !== 'bloque' && ms.state !== 'attente' && ms.state !== 'echec' && ms.state !== 'arrive') continue;
        // (suiveur encore garé qui attend que la tête, partie dans l'autre sens après un demi-tour, soit passée : le
        // pilote automatique le lâche sur sa trace dès qu'elle s'éloigne — le relancer seul vers le point le faisait
        // manœuvrer au milieu des motos garées, contre les murs et les piétons)
        const lv = ms.mode === 'follow' && ms.state === 'attente' && ms.leaderId !== 0 ? core.ctx.vehicles.get(ms.leaderId) : undefined;
        if (lv && now - s.t <= START_HOLD_MAX && Math.hypot(m.x - lv.x, m.z - lv.z) <= START_HOLD) continue;
        ap.driveTo(m, this.standX, this.standZ, { speed: core.tuning.bravmSpeed, stopBefore: 4 + i * 3.5, urgence: true });
        s.t = now;
      }
    }
    const d = Math.hypot(this.standX - lead.x, this.standZ - lead.z);
    const stopped = Math.abs(lead.speed) < 0.4;
    // « avec vous » : le point de l'ordre est la personne suivie, là où elle est maintenant ; à pied, elle est rejointe à
    // pied quand les motos ne passent plus près d'elle (règles « près du point » ci-dessous) — en véhicule, la colonne
    // qui la suit dans la circulation ne met pas pied à terre au premier ralentissement
    let nearRules = !!o && o.type !== 'suivre';
    if (o && o.type === 'suivre') {
      const target = core.ctx.people.get(o.targetId);
      if (target) {
        this.tx = target.x;
        this.tz = target.z;
        nearRules = target.vehicleId === 0;
      }
    }
    // distance de la tête au point de l'ordre (pas au point d'arrêt)
    const left = Math.hypot(this.tx - lead.x, this.tz - lead.z);
    // ordre du joueur : la tête est au point (à la distance d'arrêt près) — arrivée, sans attendre l'arrêt exact
    if (player && o && o.type !== 'suivre' && left <= Math.max(PLAYER_ARRIVE, this.standoff + 6)) {
      this.stopMotos();
      this.arrived();
      return;
    }
    // ordre du joueur, près du point : bloquée 5 s, en attente 8 s, ou pilote automatique en échec — pied à terre, la
    // suite à pied (le joueur voit ses hommes repartir, jamais une colonne figée à cinquante mètres de son point)
    if (player && o && nearRules && left <= WALK_LIMIT && this.mountedOperators() > 0
      && (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > PLAYER_BLOCKED) || (st.state === 'attente' && st.blockedFor > PLAYER_WAITING))) {
      this.blockedDismount(st.reason === 'personne' ? 'Foule sur l’itinéraire, les motos ne passent pas' : 'Les motos ne passent plus');
      return;
    }
    // tête arrêtée au milieu de la foule (le pilote automatique attend que les manifestants s'écartent, indéfiniment) :
    // pied à terre, la suite à pied (voir CROWD_STUCK) — sur un ordre du joueur ; l'arrivée de la journée de service, elle,
    // s'arrête avant la foule (session/journee.ts)
    // (« avancé » : cinq mètres de gagnés vers le point d'arrêt — une tête qui piétine sur place dans la foule n'avance pas)
    if (this.crowdAt < 0 || d < this.crowdD - 5) {
      this.crowdD = d;
      this.crowdAt = now;
    } else if (player && now - this.crowdAt > CROWD_STUCK && d > RIDE_STANDOFF && core.ctx.people.countIn(lead.x, lead.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND) {
      this.crowdDismount();
      return;
    } else if (player && o && nearRules && left <= WALK_LIMIT && now - this.crowdAt > PLAYER_STALL && this.mountedOperators() > 0) {
      // ordre du joueur, près du point : la tête n'a pas gagné cinq mètres depuis PLAYER_STALL s (sortie de stationnement
      // sans fin, colonne qui piétine) — pied à terre, la suite à pied, plutôt qu'une colonne figée sous ses yeux
      this.blockedDismount('Les motos n’avancent plus');
      return;
    }
    // tête arrêtée loin du point (circulation, rue encombrée, pilote automatique arrêté) : la colonne n'est pas
    // « arrivée » — elle repart par un nouvel itinéraire (voir RIDE_FAR) ; le délai de route ne joue que près du point
    const far = d > RIDE_FAR && this.relaunches < RELAUNCH_MAX;
    const blocked = st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 12) || (st.state === 'attente' && st.blockedFor > 40)
      || (st.mode === 'idle' && stopped);
    if (far) {
      if (st.state === 'arrive' && stopped) {
        // point d'arrêt atteint (calculé au départ) : rien de plus à faire
        this.arrived();
        return;
      }
      // (loin du point, une attente de 20 s derrière un véhicule suffit — 8 s sur un ordre du joueur : sortie de caserne
      // encombrée, bouchon)
      const gap = player ? PLAYER_RELAUNCH : RELAUNCH_GAP;
      const stuck = blocked || (st.state === 'attente' && st.blockedFor > gap) || (player && st.state === 'bloque' && st.blockedFor > gap);
      if (!stuck || now - this.convoyAt < gap) return;
      // une tête qui n'a pas bougé depuis le dernier départ (coincée derrière un véhicule) passe en queue : une autre mène
      this.relaunches++;
      if (Math.hypot(lead.x - this.relaunchX, lead.z - this.relaunchZ) < 5 && this.motos.length > 1) {
        this.departOrder.length = 0;
        for (let i = 1; i < this.motos.length; i++) this.departOrder.push(this.motos[i].id);
        this.departOrder.push(lead.id);
        this.refresh();
      }
      this.relaunchX = this.motos[0].x;
      this.relaunchZ = this.motos[0].z;
      if (this.convoy(this.slow ? core.tuning.bravmSlow : core.tuning.bravmSpeed)) return;
    }
    if ((st.state === 'arrive' || st.mode === 'idle' || d < 6) && stopped) {
      this.arrived();
    } else if (blocked
      // délai de route dépassé : pied à terre si la tête n'avance plus, mais pas en plein mouvement (motos ralenties
      // derrière la colonne de la compagnie partie de la même caserne : elles arrivent en retard, mais elles arrivent ;
      // arrêtées net à 200 m du point, elles n'y étaient jamais) — au double du délai, dans tous les cas
      || (this.sinceStage() > this.rideMax && (stopped || this.sinceStage() > this.rideMax * 2))) {
      // route coupée ou foule en travers près du point : on termine à pied, sans forcer le passage
      this.stopMotos();
      this.arrived();
    }
  }

  /** La colonne est arrivée : fin d'un déplacement, ou pied à terre pour l'interception. */
  private arrived(): void {
    const o = this.order;
    this.stopMotos();
    this.sendStragglers();
    const lead = this.motos[0];
    // « avec vous » en selle : à sa place derrière la personne suivie (à pied, foule près d'elle : pied à terre, suivi à pied)
    if (o && o.type === 'suivre') {
      const target = this.core.ctx.people.get(o.targetId);
      if (target && target.vehicleId === 0 && this.crowdNear(target.x, target.z, GARDE_CROWD)) {
        this.after = this.copy(o);
        this.setStage('arret');
      } else {
        this.after = null;
        this.setStage('garde');
      }
      return;
    }
    const left = lead ? Math.hypot(this.tx - lead.x, this.tz - lead.z) : 0;
    const player = this.byPlayer();
    // ordre du joueur, déplacement arrêté loin du point (foule, route coupée, point dans le rassemblement) : pied à
    // terre, la suite à pied — jamais « accès bloqué » à cent mètres du point où il l'envoyait
    if (o && lead && player && MOVE_ORDERS.has(o.type) && this.mountedOperators() > 0 && left > PLAYER_ARRIVE) {
      this.blockedDismount('Arrêtés à ' + Math.round(left / 10) * 10 + ' mètres du point');
      return;
    }
    // déplacement arrêté par la foule loin du point (BRAV-M arrivée avec la colonne au milieu du rassemblement : point
    // d'arrêt retombé sur la tête, pilote automatique qui attend que les manifestants s'écartent) : la colonne se disait
    // « en position » sans avoir bougé, à cent cinquante mètres du point — « la BRAV-M, ils bougeaient pas ». Pied à
    // terre, la suite à pied (ordre du joueur).
    if (o && lead && player && (o.type === 'avancer' || o.type === 'colonne') && this.mountedOperators() > 0 && left > RIDE_STANDOFF + 8
      && (this.core.ctx.people.countIn(lead.x, lead.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND || (left <= WALK_LIMIT && this.crowdBack))) {
      this.crowdDismount();
      return;
    }
    if (!o || MOVE_ORDERS.has(o.type)) {
      // arrêtée loin de son point d'arrêt (route coupée, mur du bord de la carte, foule en travers) : elle le dit, avec la
      // distance qui reste — « En position » à 130 m du point trompait celui qui l'y avait envoyée
      const short = lead ? Math.hypot(this.standX - lead.x, this.standZ - lead.z) : 0;
      const motos = spell(this.motos.length) + (this.motos.length > 1 ? ' motos' : ' moto');
      this.say(report(this.superior(), this.squad.name, short > SHORT_OF_POINT && !player
        ? 'Arrêtés à ' + Math.round(short / 10) * 10 + ' mètres du point, accès bloqué, ' + motos
        : 'En position, ' + motos));
      this.complete(true, '');
      return;
    }
    this.setStage('arret');
  }

  /**
   * Retardataires (motos encore à plus de 40 m de la tête, arrêtée) : ils la rejoignent seuls, en file derrière elle, et
   * sont relancés tant qu'ils n'y sont pas (rejoin).
   */
  private sendStragglers(): void {
    const lead = this.motos[0];
    const ap = this.core.autopilot;
    if (lead && ap) {
      for (let i = 1; i < this.motos.length; i++) {
        const m = this.motos[i];
        if (Math.hypot(m.x - lead.x, m.z - lead.z) > 40 && m.seats[0] !== 0) ap.driveTo(m, lead.x, lead.z, { speed: this.core.tuning.bravmSpeed, stopBefore: 4 + i * 3.5 });
      }
    }
    this.rejoinTries = 0;
    this.rejoinAt = this.core.now + REJOIN_GAP;
  }

  /**
   * Après l'arrivée : les motos restées loin de la tête (relancées une fois vers elle par arrived) dont le pilote
   * automatique s'est arrêté — itinéraire impossible, bloquées, rendues au repos — repartent vers la tête, tant
   * qu'elles ne l'ont pas rejointe (REJOIN_MAX relances au plus). Sans cela, une moto arrêtée en chemin y restait.
   */
  private rejoin(): void {
    const core = this.core;
    const ap = core.autopilot;
    const lead = this.motos[0];
    if (!ap || !lead || this.rejoinAt < 0 || core.now < this.rejoinAt || this.rejoinTries >= REJOIN_MAX) return;
    this.rejoinAt = core.now + REJOIN_GAP;
    for (let i = 1; i < this.motos.length; i++) {
      const m = this.motos[i];
      const pilot = m.seats[0] !== 0 ? core.ctx.people.get(m.seats[0]) : undefined;
      if (!pilot || pilot.isPlayer) continue;
      const d = Math.hypot(m.x - lead.x, m.z - lead.z);
      if (d <= REJOIN_SPREAD) continue;
      const st = ap.status(m);
      // (une moto qui roule vers la tête n'est pas relancée)
      if (st.mode !== 'idle' && st.state !== 'bloque' && st.state !== 'echec' && !(st.state === 'attente' && st.blockedFor > 20)) continue;
      ap.driveTo(m, lead.x, lead.z, { speed: core.tuning.bravmSpeed, stopBefore: 4 + i * 3.5, urgence: d > URGENT_BEYOND });
      this.rejoinTries++;
    }
  }

  /** L'ordre en cours vient-il du joueur (ordres directs, carte, roue, bloc « ORDRES ») ? */
  private byPlayer(): boolean {
    const o = this.order;
    // (« Rentrer au commissariat » : le retour est mené par le module des commissariats — à moto jusqu'aux places, sans
    // le pied à terre d'un ordre du joueur qui n'avance plus)
    if (isReturningHome(this.core.ctx, this.squad.id)) return false;
    return !!o && (o.byPlayer === true || (o.issuedBy !== 0 && o.issuedBy === this.core.ctx.player.state.personId));
  }

  /** « Avec vous » en selle (étape « garde ») : rester à sa place derrière la personne suivie. */
  private thinkGuard(): void {
    const o = this.order;
    const target = o && o.type === 'suivre' ? this.core.ctx.people.get(o.targetId) : undefined;
    const lead = this.motos[0];
    if (!o || !target || !lead) {
      this.endEscort();
      this.complete(true, '');
      return;
    }
    if (this.mountedOperators() === 0) {
      // (opérateurs descendus d'eux-mêmes, motos sans passagers) : le suivi continue à pied
      this.endEscort();
      this.handOver(o);
      return;
    }
    const tv = this.rideOf(target);
    if (tv && this.pilots() > 0 && this.core.autopilot && (this.escortLead !== 0 || Math.hypot(tv.x - lead.x, tv.z - lead.z) <= ESCORT_REACH)) {
      this.thinkEscort(target, tv);
      return;
    }
    // (elle est descendue de son véhicule : les motos s'arrêtent, puis les règles à pied)
    this.endEscort();
    if (target.vehicleId === 0 && this.crowdNear(target.x, target.z, GARDE_CROWD)) {
      // une foule près de la personne suivie, à pied : pied à terre, suivi à pied (posture « en garde » du module de
      // police) — tant qu'elle roule, la BRAV-M reste en selle derrière elle (le commandant parti au volant en longeant
      // le rassemblement laissait ses opérateurs à pied sur la place, les pilotes seuls sur les machines)
      this.after = this.copy(o);
      this.dismount();
      return;
    }
    if (Math.hypot(target.x - lead.x, target.z - lead.z) > GARDE_FAR && this.pilots() > 0) this.guard(target);
  }

  /**
   * Véhicule terrestre où se trouve la personne suivie, quand ce n'est pas une moto de l'unité (le chef de la BRAV-M en
   * selle sur l'une d'elles ne se suit pas lui-même) ; null à pied, en vol ou sur une machine de l'unité.
   */
  private rideOf(target: Person): Vehicle | null {
    if (target.vehicleId === 0) return null;
    const v = this.core.ctx.vehicles.get(target.vehicleId);
    return v && !v.def.flying && this.motos.indexOf(v) < 0 ? v : null;
  }

  /**
   * Nombre de véhicules de la colonne qui part derrière le véhicule `head` de la personne suivie : ceux que le pilote
   * automatique fait déjà suivre en file derrière lui, ou — la colonne se forme encore — ceux des unités qui embarquent
   * sur son ordre (session/follow.ts : « embarquer » émis en son nom), à moins de ESCORT_REACH m de lui.
   */
  private columnSize(target: Person, head: Vehicle): number {
    const core = this.core;
    const ap = core.autopilot!;
    const ctx = core.ctx;
    const list = ctx.vehicles.list;
    const seen = this.chain;
    seen.length = 0;
    let prev = head;
    for (let guard = 0; guard < 40; guard++) {
      let next: Vehicle | null = null;
      for (let i = 0; i < list.length && !next; i++) {
        const v = list[i];
        if (v === head || v.kind === 'moto_bravm' || seen.indexOf(v) >= 0) continue;
        const st = ap.status(v);
        if (st.mode === 'follow' && st.leaderId === prev.id) next = v;
      }
      if (!next) break;
      seen.push(next);
      prev = next;
    }
    const chained = seen.length;
    seen.length = 0;
    const squads = ctx.squads.list;
    for (let i = 0; i < squads.length; i++) {
      const q = squads[i];
      if (q.faction !== 'police' || q.vehicleId === 0 || q.vehicleId === head.id || q.order.type !== 'embarquer' || q.order.issuedBy !== target.id) continue;
      const v = ctx.vehicles.get(q.vehicleId);
      if (!v || v.kind === 'moto_bravm' || v.def.flying || v.seats[0] === 0 || seen.indexOf(v) >= 0 || !core.usable(v)) continue;
      if (Math.hypot(v.x - head.x, v.z - head.z) <= ESCORT_REACH) seen.push(v);
    }
    const boarding = seen.length;
    seen.length = 0;
    return Math.max(chained, boarding);
  }

  /**
   * « Avec vous » en selle derrière quelqu'un qui roule (étape « garde ») : la BRAV-M ferme la colonne de son véhicule.
   * La moto de tête suit la TRACE de ce véhicule (pilote automatique, « follow »), assez loin derrière lui pour laisser
   * la place des véhicules de sa colonne ; les autres motos la suivent en file. Elle passe ainsi où il est passé, derrière
   * les fourgons qui y roulent : un trajet par les rues vers le point où il était la menait à travers le rassemblement,
   * où elle mettait pied à terre pendant qu'il s'éloignait.
   */
  private thinkEscort(target: Person, tv: Vehicle): void {
    const core = this.core;
    const ap = core.autopilot!;
    const now = core.now;
    if (now < this.escortAt) return;
    this.escortAt = now + 1;
    this.tx = target.x;
    this.tz = target.z;
    const lead = this.motos[0];
    if (this.escortLead !== tv.id) {
      // (premier départ, ou elle a changé de véhicule) : on attend à sa place que le véhicule ait pris son avance
      if (this.escortLead !== 0) this.endEscort();
      const gap = GARDE_BEHIND + this.columnSize(target, tv) * ESCORT_SLOT;
      if (Math.hypot(tv.x - lead.x, tv.z - lead.z) <= gap + GARDE_FAR - GARDE_BEHIND) return;
      // file des motos : la plus proche du véhicule suivi mène, les motos sans pilote restent où elles sont
      const riders = this.motos.filter((m) => m.seats[0] !== 0).sort((a, b) => Math.hypot(a.x - tv.x, a.z - tv.z) - Math.hypot(b.x - tv.x, b.z - tv.z) || a.id - b.id);
      this.departOrder.length = 0;
      for (let i = 0; i < riders.length; i++) this.departOrder.push(riders[i].id);
      this.refresh();
      this.escortLead = tv.id;
      this.escortGap = gap;
      this.rejoinAt = -1;
    }
    // chaque moto suit la précédente ; la tête suit la personne elle-même, sur la trace de son véhicule (et non ce
    // véhicule : la colonne de ses fourgons, où chacun suit le précédent, reste une seule file — session/follow.ts) ; une
    // moto que le pilote automatique a lâchée est reprise
    let prev: Vehicle | null = null;
    for (let i = 0; i < this.motos.length; i++) {
      const m = this.motos[i];
      const pilot = m.seats[0] !== 0 ? core.ctx.people.get(m.seats[0]) : undefined;
      if (!pilot) continue;
      if (!pilot.isPlayer) {
        const st = ap.status(m);
        const leaderId = prev ? prev.id : target.id;
        if (st.mode !== 'follow' || st.leaderId !== leaderId) {
          if (prev) ap.follow(m, prev.id, MOTO_GAP);
          else ap.follow(m, target.id, this.escortGap, this.trailOf === tv.id ? this.trail : undefined);
        }
      }
      prev = m;
    }
  }

  /** Fin du suivi derrière un véhicule : les motos s'arrêtent (nouvel ordre, personne suivie descendue). */
  private endEscort(): void {
    if (this.escortLead === 0) return;
    this.escortLead = 0;
    this.departOrder.length = 0;
    this.stopMotos();
  }

  /** Tient la trace du véhicule de la personne suivie (« suivre », elle roule) : voir thinkEscort. */
  private recordTrail(): void {
    const o = this.order;
    const target = o && o.type === 'suivre' ? this.core.ctx.people.get(o.targetId) : undefined;
    const tv = target ? this.rideOf(target) : null;
    const trail = this.trail;
    if (!tv) {
      trail.length = 0;
      this.trailOf = 0;
      return;
    }
    if (this.trailOf !== tv.id) {
      trail.length = 0;
      this.trailOf = tv.id;
    }
    const n = trail.length;
    if (n >= 2 && Math.hypot(tv.x - trail[n - 2], tv.z - trail[n - 1]) < TRAIL_STEP) return;
    trail.push(tv.x, tv.z);
    if (trail.length > TRAIL_MAX * 2) trail.splice(0, trail.length - TRAIL_MAX * 2);
  }

  // ───────────────────────────── pied à terre ─────────────────────────────

  /**
   * Colonne prise dans la foule : les motos s'arrêtent, les opérateurs mettent pied à terre et l'ordre continue à pied
   * (déplacement : colonne à pied jusqu'au point ; interception : approche à pied), annoncé à la radio.
   */
  private crowdDismount(): void {
    this.blockedDismount('Foule sur l’itinéraire, les motos ne passent pas');
  }

  /** Les motos ne passent pas : arrêt, pied à terre, l'ordre continue à pied (« … Pied à terre, je continue à pied »). */
  private blockedDismount(why: string): void {
    const o = this.order;
    // (« avec vous » en selle : le suivi continue à pied, rendu au module de police après le pied à terre)
    if (o && o.type === 'suivre' && !this.after) this.after = this.copy(o);
    this.stopMotos();
    // (les motos restées en arrière rejoignent la tête : sans cela elles restaient où la colonne les avait laissées)
    this.sendStragglers();
    this.crowdAt = -1;
    this.say(report(this.superior(), this.squad.name, why + '. Pied à terre, je continue à pied'));
    this.dismount();
  }

  /** Tous les opérateurs descendent dans le même pas (les pilotes gardent les machines). */
  private dismount(): void {
    const core = this.core;
    const ctx = core.ctx;
    // la remontée en selle précédente est finie : l'embarquement du module de police, qui remet chaque seconde en selle
    // un agent resté à pied, prend fin (les opérateurs remontaient aussitôt descendus)
    const pu = unitOf(this.squad);
    if (pu && pu.order !== null && pu.order.type === 'embarquer') pu.order = null;
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) {
      const v = this.motos[i];
      const op = this.seated(v, 'passenger');
      if (op && !op.isPlayer && ctx.vehicles.exit(op)) {
        n++;
        // (la remontée en selle précédente est finie : l'embarquement du module de police ne les y remet pas)
        const a = agentOf(op);
        if (a) a.boardId = 0;
      }
    }
    const lead = this.motos[0];
    if (lead) {
      this.standX = lead.x;
      this.standZ = lead.z;
    }
    this.emitStage('pied_a_terre', true, String(n));
    this.setStage('pied_a_terre');
  }

  /** Manœuvre à pied rendue au module de police (l'ordre reçu, exécuté par l'unité à pied). */
  private handOver(a: SquadOrder): void {
    this.after = null;
    this.order = null;
    this.status.order = '';
    this.setStage('a_pied');
    const c: Partial<SquadOrder> & { type: OrderType } = {
      type: a.type, x: a.x, z: a.z, heading: a.heading, width: a.width, targetId: a.targetId, maxForce: a.maxForce, issuedBy: a.issuedBy,
    };
    if (a.place) c.place = a.place;
    if (a.byPlayer) c.byPlayer = true;
    this.internal(c);
  }

  private afterDismount(): void {
    const o = this.order;
    if (this.after) {
      // manœuvre à pied : rendue au module de police
      this.handOver(this.after);
      return;
    }
    if (!o || o.type === 'debarquer') {
      this.say(report(this.superior(), this.squad.name, 'Pied à terre, ' + spell(this.footOperators()) + ' à pied'));
      this.complete(true, '');
      this.setStage('a_pied');
      return;
    }
    if (o.type === 'interpeller') {
      this.approach();
      return;
    }
    // déplacement : la suite à pied
    this.walkTo(this.tx, this.tz);
  }

  /**
   * Déplacement à pied jusqu'au point (colonne du module de police, au trot sur un ordre du joueur). L'ordre reste
   * celui de la BRAV-M (étape « marche ») : elle rend compte de sa fin (voir onPoliceDone) — son type est celui que le
   * joueur a donné.
   */
  private walkTo(x: number, z: number): void {
    const o = this.order;
    if (!o || this.footOperators() === 0) {
      this.complete(true, '');
      return;
    }
    this.internal({ type: 'colonne', x, z, issuedBy: o.issuedBy, ...(o.place ? { place: o.place } : {}) });
    this.setStage('marche');
  }

  // ───────────────────────────── à pied, loin : en selle ─────────────────────────────

  /**
   * À pied, point à plus de 150 m : en selle — sauf, sur un ordre du joueur, quand les machines sont au milieu de la
   * foule (à pied tout de suite, voir CROWD_WALK_MAX). Machines à portée : on y monte. Pilotes en selle : ils amènent les motos
   * aux opérateurs, qui partent déjà à pied vers le point (fetchMotos). Pilotes à pied avec les opérateurs : retour aux
   * machines si c'est plus court que d'y aller à pied, sinon à pied.
   */
  private farOnFoot(): void {
    if (this.motos.length === 0 || this.footOperators() === 0) {
      this.onFoot();
      return;
    }
    const core = this.core;
    if (!this.footCenter()) {
      this.onFoot();
      return;
    }
    const fx = core.v2.x;
    const fz = core.v2.z;
    const d = Math.hypot(this.tx - fx, this.tz - fz);
    // machines (ou opérateurs) au milieu de la foule, sur un ordre du joueur : à pied tout de suite (voir CROWD_WALK_MAX)
    if (this.walksInstead(d)) {
      this.onFoot();
      return;
    }
    if (this.atMotos(true)) {
      this.backToMotos();
      return;
    }
    const lead = this.motos[0];
    const gap = Math.hypot(lead.x - fx, lead.z - fz);
    const dense = core.ctx.people.countIn(fx, fz, CROWD_RADIUS, isProtester) >= CROWD_AROUND;
    const walkT = d / (dense ? CROWD_FOOT_SPEED : FOOT_SPEED);
    if (this.pilots() > 0 && core.autopilot) {
      // les pilotes amènent les motos pendant que les opérateurs marchent vers le point : jamais plus long qu'à pied
      this.fetchMotos(true);
      return;
    }
    // pilotes à pied avec les opérateurs : retour aux machines, ou à pied jusqu'au point si c'est plus court
    const backT = gap / (dense ? CROWD_FOOT_SPEED : FOOT_SPEED) + REMOUNT_TIME + Math.hypot(this.tx - lead.x, this.tz - lead.z) / RIDE_SPEED;
    if (backT < walkT) this.backToMotos();
    else this.onFoot();
  }

  /** La suite à pied : déplacement jusqu'au point, ou manœuvre rendue au module de police. */
  private onFoot(): void {
    const o = this.order;
    if (this.after) {
      this.handOver(this.after);
      return;
    }
    if (o && o.type === 'interpeller') {
      this.approach();
      return;
    }
    this.walkTo(this.tx, this.tz);
  }

  /**
   * Les pilotes amènent les motos aux opérateurs à pied (étape « rapprochement ») ; ceux-ci marchent vers le point
   * pendant ce temps (`start` : la marche commence). Relancé toutes les FETCH_GAP s vers leur position.
   */
  private fetchMotos(start: boolean): void {
    const core = this.core;
    const ap = core.autopilot;
    if (!ap || !this.footCenter()) {
      this.onFoot();
      return;
    }
    const fx = core.v2.x;
    const fz = core.v2.z;
    if (start) {
      const o = this.order;
      this.internal({ type: 'colonne', x: this.tx, z: this.tz, issuedBy: o ? o.issuedBy : 0, ...(o && o.place ? { place: o.place } : {}) });
      this.fetchBest = Infinity;
      this.fetchSince = core.now;
      this.setStage('rapprochement');
    }
    this.fetchAt = core.now + FETCH_GAP;
    // rendez-vous un peu devant les opérateurs, sur leur chemin vers le point ; les motos y vont en colonne (chacune pour
    // soi, garées côte à côte, elles s'attendaient l'une l'autre sans jamais partir) — nouvelle colonne seulement quand
    // le rendez-vous s'est déplacé de plus de FETCH_MOVE m
    const left = Math.hypot(this.tx - fx, this.tz - fz);
    const ahead = left > 1 ? Math.min(FETCH_AHEAD, left) / left : 0;
    const mx = fx + (this.tx - fx) * ahead;
    const mz = fz + (this.tz - fz) * ahead;
    if (!start && Math.hypot(mx - this.standX, mz - this.standZ) < FETCH_MOVE) return;
    const lead = this.motos[0];
    this.standX = mx;
    this.standZ = mz;
    this.urgent = !!lead && Math.hypot(lead.x - mx, lead.z - mz) > URGENT_BEYOND;
    if (start && lead) {
      this.startSwaps = 0;
      this.relaunchX = lead.x;
      this.relaunchZ = lead.z;
      this.departX = lead.x;
      this.departZ = lead.z;
    }
    this.convoy(core.tuning.bravmSpeed);
  }

  private thinkFetch(): void {
    const core = this.core;
    if (!this.footCenter()) {
      this.onFoot();
      return;
    }
    const fx = core.v2.x;
    const fz = core.v2.z;
    const left = Math.hypot(this.tx - fx, this.tz - fz);
    const lead = this.motos[0];
    const gap = lead ? Math.hypot(lead.x - fx, lead.z - fz) : Infinity;
    if (gap < this.fetchBest - 5) {
      this.fetchBest = gap;
      this.fetchSince = core.now;
    }
    if (left < WALK_BELOW || !lead || core.now - this.fetchSince > FETCH_STALL) {
      // le point est proche (ou les motos ne passent pas) : la suite à pied ; les motos s'en rapprochent derrière eux
      const ap = core.autopilot;
      if (ap) for (let i = 0; i < this.motos.length; i++) {
        const m = this.motos[i];
        const pilot = m.seats[0] !== 0 ? core.ctx.people.get(m.seats[0]) : undefined;
        if (pilot && !pilot.isPlayer) ap.driveTo(m, fx, fz, { speed: core.tuning.bravmSlow, stopBefore: 10 + i * 3.5 });
      }
      if (this.after) this.handOver(this.after);
      else if (this.order && this.order.type === 'interpeller') this.approach();
      else this.setStage('marche');
      return;
    }
    if (this.atMotos(true)) {
      // les motos sont là : en selle, puis la colonne roule jusqu'au point
      this.stopMotos();
      this.standX = lead.x;
      this.standZ = lead.z;
      this.remount();
      return;
    }
    if (lead && this.startSwap(lead)) return;
    if (core.now >= this.fetchAt) this.fetchMotos(false);
  }

  // ───────────────────────────── interception à pied ─────────────────────────────

  /** La cible de l'interpellation en cours a-t-elle commis un fait constaté (interpellation possible tout de suite) ? */
  private arrestable(): boolean {
    const o = this.order;
    const named = o && o.targetId > 0 ? this.core.ctx.people.get(o.targetId) : undefined;
    return !!named && named.faction !== 'police' && named.custody === 'free' && this.core.ctx.law.canArrest(named);
  }

  /**
   * À pied, le binôme le plus proche part-il tout de suite sur l'auteur (la règle d'approach) : auteur d'un fait
   * constaté à portée de course, hors d'un groupe compact ?
   */
  private runsAtOnce(): boolean {
    if (this.footOperators() === 0) return false;
    const target = this.findOffender();
    return !!target && Math.hypot(target.x - this.people[0].x, target.z - this.people[0].z) <= ARREST_RUN
      && this.core.ctx.people.countIn(target.x, target.z, 6, isProtester) <= 14;
  }

  private approach(): void {
    const o = this.order;
    if (this.footOperators() === 0) {
      this.complete(false, 'Aucun opérateur disponible.');
      return;
    }
    // point de regroupement pour la remise, aux machines, si rien n'existe à proximité
    this.ensureHandover();
    const fx = this.people[0].x;
    const fz = this.people[0].z;
    // auteur d'un fait constaté à portée de course : le binôme le plus proche y court tout de suite
    if (this.runsAtOnce()) {
      this.arrest(this.findOffender()!);
      return;
    }
    const d = Math.hypot(this.tx - fx, this.tz - fz);
    let ax = this.tx;
    let az = this.tz;
    if (d > WATCH_DISTANCE + 2) {
      ax = this.tx - ((this.tx - fx) / d) * WATCH_DISTANCE;
      az = this.tz - ((this.tz - fz) / d) * WATCH_DISTANCE;
    } else {
      ax = fx;
      az = fz;
    }
    this.approachX = this.tx;
    this.approachZ = this.tz;
    this.watchAt = this.core.now + 1;
    if (this.ackOwed) {
      this.ackOwed = false;
      const where = this.core.sector(this.tx, this.tz) !== '' ? ', ' + this.core.sector(this.tx, this.tz) : '';
      this.say(received(this.squad.name, 'interception de l’objectif' + where + ', à pied'));
    }
    this.internal({ type: 'colonne', x: ax, z: az, width: 0, issuedBy: o ? o.issuedBy : 0 });
    this.setStage('approche');
  }

  /** Interpellation par le module de police (le binôme le plus proche, chaîne complète). */
  private arrest(target: Person): void {
    this.ackOwed = false;
    this.compactSince = -1;
    this.status.targetId = target.id;
    this.internal({ type: 'interpeller', targetId: target.id, x: target.x, z: target.z, maxForce: 2, issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('interpellation');
  }

  /**
   * Ordre du joueur, auteur en fuite (il a distancé le binôme) mais encore à portée de course, toujours libre : le
   * binôme repart sur lui une fois (au bout de sa fuite, il s'arrête et se fond dans le groupe) — la BRAV-M ne regagne
   * pas ses machines à vingt mètres de l'homme qu'on lui a désigné. true : nouvelle tentative lancée.
   */
  private retryArrest(reason: string): boolean {
    if (!this.byPlayer() || this.arrestRetries >= ARREST_RETRIES || !/atteinte|fuite|échappé|trop loin/i.test(reason)) return false;
    const target = this.findOffender();
    if (!target || this.footOperators() === 0) return false;
    const d = Math.hypot(target.x - this.people[0].x, target.z - this.people[0].z);
    if (d > ARREST_RUN || this.core.ctx.people.countIn(target.x, target.z, 6, isProtester) > 14) return false;
    this.arrestRetries++;
    this.policeReported = false;
    this.arrestOk = false;
    this.arrestReason = '';
    this.say(report(this.superior(), this.squad.name, 'Auteur en fuite, je reste sur lui'));
    this.arrest(target);
    return true;
  }

  /** Approche à pied : chaque seconde, la cible est revue — à portée, on y court ; partie, l'approche la suit. */
  private thinkApproach(): void {
    const core = this.core;
    if (this.sinceStage() > 120) {
      this.watchAt = 0;
      this.setStage('constat');
      return;
    }
    if (core.now < this.watchAt) return;
    this.watchAt = core.now + 1;
    if (this.footOperators() === 0) return;
    const target = this.findOffender();
    const fx = this.people[0].x;
    const fz = this.people[0].z;
    if (target && Math.hypot(target.x - fx, target.z - fz) <= ARREST_RUN) {
      if (core.ctx.people.countIn(target.x, target.z, 6, isProtester) <= 14) {
        this.arrest(target);
        return;
      }
      // ordre du joueur, auteur à portée mais au milieu d'un groupe compact depuis WATCH_OFFENDER s : on le dit tout de
      // suite — l'approche jusqu'à la distance d'observation, puis le constat, le laissaient sans réponse une à trois
      // minutes (« objectif au milieu d'un groupe compact » au bout de 196 s)
      if (this.compactSince < 0) this.compactSince = core.now;
      else if (this.byPlayer() && core.now - this.compactSince > WATCH_OFFENDER) {
        this.giveUp(COMPACT_REASON);
        return;
      }
    } else {
      this.compactSince = -1;
    }
    // l'objectif s'est déplacé : l'approche le suit (jamais vers l'endroit où il était)
    if (Math.hypot(this.tx - this.approachX, this.tz - this.approachZ) > APPROACH_RETARGET) this.approach();
  }

  private ensureHandover(): void {
    if (this.handoverSet) return;
    // un fourgon cellulaire du dispositif vient chercher l'interpellé (police.arrests) : pas de point de regroupement
    // invisible, où il restait assis sur le trottoir après le départ de la BRAV-M
    if (cellularOnSite(this.core.ctx)) return;
    const h = this.core.handover();
    if (!h || !Array.isArray(h.points)) return;
    for (let i = 0; i < h.points.length; i++) if (Math.hypot(h.points[i].x - this.standX, h.points[i].z - this.standZ) < 300) return;
    const fleet = this.core.vehicles;
    // un fourgon de l'échelon supérieur à portée fait l'affaire : sinon, point de regroupement aux machines
    const top = this.squad.parentId !== 0 ? this.squad.parentId : this.squad.id;
    this.core.fleet(top, fleet);
    for (let i = 0; i < fleet.length; i++) if (fleet[i].kind !== 'moto_bravm' && !fleet[i].def.flying && Math.hypot(fleet[i].x - this.standX, fleet[i].z - this.standZ) < 300) return;
    const lead = this.motos[0];
    // deux mètres à côté de la colonne, hors de la chaussée des machines
    const hx = lead ? Math.cos(lead.heading) : 1;
    const hz = lead ? -Math.sin(lead.heading) : 0;
    const v = this.core.v2;
    v.x = this.standX + hx * 3;
    v.z = this.standZ + hz * 3;
    this.core.ctx.world.resolveCircle(v, 0.6);
    h.points.push({ x: v.x, z: v.z, name: 'point de regroupement ' + this.squad.name });
    this.handoverSet = true;
  }

  /** Auteur d'un fait constaté près de l'objectif (la cible désignée d'abord). */
  private findOffender(): Person | null {
    const core = this.core;
    const ctx = core.ctx;
    const o = this.order;
    const named = o && o.targetId > 0 ? ctx.people.get(o.targetId) : undefined;
    if (named && named.faction !== 'police' && named.custody === 'free') {
      this.tx = named.x;
      this.tz = named.z;
      if (ctx.law.canArrest(named)) return named;
    }
    const n = ctx.people.queryRadius(this.tx, this.tz, SEARCH_RADIUS, core.people, notPolice);
    let best: Person | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.custody !== 'free' || !recentOffender(p, core.now, 180) || !ctx.law.canArrest(p)) continue;
      const d = (p.x - this.tx) * (p.x - this.tx) + (p.z - this.tz) * (p.z - this.tz);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private thinkWatch(): void {
    const core = this.core;
    if (core.now < this.watchAt) return;
    this.watchAt = core.now + 1;
    const target = this.findOffender();
    if (target) {
      // pas au milieu d'un groupe compact : le binôme serait isolé
      const around = core.ctx.people.countIn(target.x, target.z, 6, isProtester);
      if (around <= 14) {
        this.arrest(target);
        return;
      }
    }
    // (auteur d'un fait constaté au milieu d'un groupe compact : on n'attend pas vingt-cinq secondes qu'il en sorte)
    if (this.sinceStage() > (target ? WATCH_OFFENDER : WATCH_TIME)) this.giveUp(target ? COMPACT_REASON : 'Aucun fait constaté : aucune interpellation.');
  }

  /**
   * Interpellation non tentée (auteur au milieu d'un groupe compact, aucun fait constaté) : dit à la radio, retour aux
   * machines. Sur un ordre du joueur, la fin de l'ordre est signalée tout de suite ('police:order_done', son motif) :
   * le compte rendu de fin ne venait qu'une fois en selle, après le retour aux machines — l'écran disait « Interpeller »
   * pendant deux ou trois minutes alors que la BRAV-M avait renoncé.
   */
  private giveUp(reason: string): void {
    this.arrestOk = false;
    this.arrestReason = reason;
    this.compactSince = -1;
    this.say(refused(this.squad.name, reason.replace(/\.$/, '') + ', je regagne les machines'));
    if (this.byPlayer() && !this.policeReported) {
      this.policeReported = true;
      this.core.ctx.events.emitAny(ORDER_DONE_EVENT, { squadId: this.squad.id, type: 'interpeller', ok: false, reason });
    }
    this.backToMotos();
  }

  private backToMotos(): void {
    if (this.motos.length === 0 || this.footOperators() === 0) {
      this.remountDone();
      return;
    }
    // point de regroupement : là où sont les machines (garées par les pilotes). Le point d'arrêt de la colonne valait
    // (0, 0) tant qu'elle n'avait jamais roulé : les opérateurs partaient à pied vers l'origine de la carte
    const lead = this.motos[0];
    if (lead.seats[0] !== 0 || (this.standX === 0 && this.standZ === 0)) {
      this.standX = lead.x;
      this.standZ = lead.z;
    }
    // déjà aux machines : en selle tout de suite (la marche vers un point déjà atteint ne se terminait pas)
    if (this.atMotos()) {
      this.remount();
      return;
    }
    this.internal({ type: 'colonne', x: this.standX, z: this.standZ, width: 0, issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('retour');
  }

  /**
   * Tous les opérateurs à pied sont-ils à portée des machines (moins de MOUNT_REACH m du point de regroupement ou d'une
   * moto du groupe ; `motosOnly` : d'une moto) ? L'embarquement les y mène lui-même.
   */
  private atMotos(motosOnly = false): boolean {
    const n = this.footOperators();
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      // (motosOnly : les motos elles-mêmes, pas le point de rendez-vous des motos amenées — voir fetchMotos)
      let near = !motosOnly && Math.hypot(p.x - this.standX, p.z - this.standZ) < MOUNT_REACH;
      for (let j = 0; j < this.motos.length && !near; j++) near = Math.hypot(p.x - this.motos[j].x, p.z - this.motos[j].z) < MOUNT_REACH;
      if (!near) return false;
    }
    return true;
  }

  private remount(): void {
    this.internal({ type: 'embarquer', issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('remontee');
  }

  /**
   * La remontée en selle en cours sert-elle un déplacement ordonné par le joueur (point éloigné, « avec vous »,
   * interception lointaine) — et non un ordre de remonter (« embarquer », « cesser », retour d'une interpellation) ?
   */
  private remountsForTrip(): boolean {
    const o = this.order;
    if (!o || !this.byPlayer()) return false;
    return this.after !== null || MOVE_ORDERS.has(o.type) || o.type === 'suivre' || (o.type === 'interpeller' && this.rideAfterRemount);
  }

  /**
   * Remontée en selle qui n'en finit pas au milieu de la foule (ordre du joueur) : ceux qui étaient montés redescendent,
   * la suite à pied — le joueur voyait sa BRAV-M piétiner une minute et demie autour de ses machines, puis caler.
   */
  private remountAbandon(): void {
    const o = this.order;
    if (o && o.type === 'suivre' && !this.after) this.after = this.copy(o);
    this.rideAfterRemount = false;
    this.say(report(this.superior(), this.squad.name, 'Machines dans la foule, je continue à pied'));
    this.dismount();
  }

  private remountDone(): void {
    const o = this.order;
    this.emitStage('en_selle', true, '');
    if (!o) {
      this.setStage('repos');
      return;
    }
    if (o.type === 'suivre') {
      // en selle pour suivre : à sa place derrière la personne suivie
      const target = this.core.ctx.people.get(o.targetId);
      if (target && this.mountedOperators() > 0) this.guard(target);
      else this.handOver(o);
      return;
    }
    if (o.type === 'interpeller' && this.rideAfterRemount) {
      // remontés en selle pour une interception lointaine : en route (personne en selle : à pied quand même)
      this.rideAfterRemount = false;
      if (this.mountedOperators() > 0) this.ride(this.tx, this.tz, this.byPlayer() ? ARREST_STANDOFF : this.core.tuning.bravmStandoff);
      else this.approach();
      return;
    }
    if (o.type === 'interpeller') {
      const body = this.arrestOk
        ? spell(1) + ' interpellé sur fait constaté, remis ' + (cellularOnSite(this.core.ctx) ? 'au fourgon cellulaire' : 'au point de regroupement') + '. En selle, disponible'
        : 'Interception sans interpellation. En selle, disponible';
      this.say(report(this.superior(), this.squad.name, body));
      this.complete(this.arrestOk, this.arrestReason);
      return;
    }
    if (MOVE_ORDERS.has(o.type) && this.mountedOperators() > 0) {
      this.ride(this.tx, this.tz, 0);
      return;
    }
    if (this.after && this.mountedOperators() > 0) {
      // en selle pour un point éloigné : on y va à moto
      this.ride(this.after.x, this.after.z, RIDE_STANDOFF);
      return;
    }
    if (this.after) {
      // personne n'a pu remonter : la manœuvre se fait à pied
      this.handOver(this.after);
      return;
    }
    if (MOVE_ORDERS.has(o.type)) {
      // personne n'a pu remonter : à pied
      this.walkTo(this.tx, this.tz);
      return;
    }
    this.complete(true, '');
  }

  /** Distance de l'unité au point de l'ordre (0 si l'ordre n'a pas de point) : de la tête en selle, des opérateurs à pied. */
  private farPoint(o: SquadOrder): number {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || (o.x === 0 && o.z === 0)) return 0;
    const lead = this.motos[0];
    if (this.mountedOperators() === 0 && this.footCenter()) return Math.hypot(o.x - this.core.v2.x, o.z - this.core.v2.z);
    if (lead) return Math.hypot(o.x - lead.x, o.z - lead.z);
    return this.footCenter() ? Math.hypot(o.x - this.core.v2.x, o.z - this.core.v2.z) : 0;
  }

  private complete(ok: boolean, reason: string): void {
    const o = this.order;
    if (o && o.type === 'interpeller' && this.policeReported) {
      // le module de police a déjà rendu compte de l'interpellation ('police:order_done') : seule la fin de
      // l'intervention de l'unité (retour en selle) reste à signaler
      this.order = null;
      this.status.order = '';
      this.emitStage('termine', ok, reason);
    } else {
      this.finish(ok, reason);
    }
    this.after = null;
    this.policeReported = false;
    this.setStage(this.mountedOperators() > 0 || this.motos.length === 0 ? 'repos' : 'a_pied');
  }

  override onPoliceDone(type: OrderType, ok: boolean, reason: string): void {
    const stage = this.status.stage;
    if (stage === 'approche' && type === 'colonne') {
      this.watchAt = 0;
      this.setStage('constat');
    } else if (stage === 'interpellation' && type === 'interpeller') {
      this.policeReported = true;
      this.arrestOk = ok;
      this.arrestReason = ok ? '' : reason;
      if (ok) this.arrested++;
      else if (this.retryArrest(reason)) {
        return;
      } else {
        // l'auteur a fui (un fuyard sans équipement court plus vite qu'un opérateur casqué) ou s'est dégagé : compte
        // rendu tout de suite, sur le réseau de l'unité. Celui du module de police part sur le réseau de commandement,
        // souvent saturé (il y était écarté) ; et le compte rendu de fin, en selle, venait plusieurs minutes après,
        // sans motif : le commandant ne savait jamais que l'interpellation avait été abandonnée.
        const fled = /atteinte|fuite|échappé|trop loin|perdu de vue/i.test(reason);
        this.say(report(this.superior(), this.squad.name,
          (fled ? 'Auteur en fuite, interpellation abandonnée' : 'Interpellation abandonnée' + (reason !== '' ? ' : ' + reason.replace(/\.$/, '').toLocaleLowerCase('fr-FR') : ''))
          + '. Je regagne les machines'));
      }
      this.backToMotos();
    } else if (stage === 'retour' && type === 'colonne') {
      this.remount();
    } else if (stage === 'remontee' && type === 'embarquer') {
      this.remountDone();
    } else if ((stage === 'marche' || stage === 'rapprochement') && type === 'colonne') {
      // arrivée à pied au point (le module de police a rendu compte de la colonne) : l'ordre du joueur est fait
      this.complete(ok, ok ? '' : reason);
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  think(): void {
    this.refresh();
    this.recordTrail();
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      pending();
      return;
    }
    const stage = this.status.stage;
    if (stage === 'repos' || stage === 'a_pied' || stage === 'garde' || stage === 'marche') this.rejoin();
    switch (stage) {
      case 'route':
        this.thinkRide();
        break;
      case 'garde':
        this.thinkGuard();
        break;
      case 'arret':
        // machines à l'arrêt : pied à terre simultané
        if (this.sinceStage() >= 0.5) this.dismount();
        break;
      case 'pied_a_terre':
        if (this.sinceStage() >= 1) this.afterDismount();
        break;
      case 'rapprochement':
        this.thinkFetch();
        break;
      case 'marche':
        // (marche de plus de dix minutes : l'ordre est clos, l'unité reste à pied)
        if (this.sinceStage() > 600) this.complete(false, 'Point non atteint.');
        break;
      case 'approche':
        this.thinkApproach();
        break;
      case 'constat':
        this.thinkWatch();
        break;
      case 'interpellation':
        if (this.sinceStage() > 200) {
          this.arrestOk = false;
          this.arrestReason = 'Interpellation non aboutie.';
          this.backToMotos();
        }
        break;
      case 'retour':
        if (this.sinceStage() > 150 || (this.sinceStage() > 2 && this.atMotos())) this.remount();
        break;
      case 'remontee':
        if (this.sinceStage() > 100) this.remountDone();
        else if (this.sinceStage() > PLAYER_REMOUNT_MAX && this.remountsForTrip() && this.footOperators() > 0 && this.amidCrowd()) this.remountAbandon();
        break;
      default:
        break;
    }
  }

  /** Nombre d'interpellations abouties depuis le début. */
  get arrests(): number {
    return this.arrested;
  }
}
