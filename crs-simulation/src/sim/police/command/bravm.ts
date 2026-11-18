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
 * ===================================================================================== */

import type { OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { recentOffender } from './picture';
import { SpecialUnit, locate } from './special';
import { received, refused, report, spell } from './texts';

/** Au-delà, un ordre à pied commence par un trajet à moto (m) ; arrêt avant le point (m). */
const RIDE_BEYOND = 60;
const RIDE_STANDOFF = 15;
/** À pied, au-delà de cette distance (plus de trois minutes de marche), on remonte en selle (m). */
const WALK_LIMIT = 250;
/** Distance à laquelle les opérateurs s'arrêtent avant l'objectif pour constater (m). */
const WATCH_DISTANCE = 12;
/** Rayon de recherche de l'auteur d'un fait autour du point désigné (m). */
const SEARCH_RADIUS = 32;
/** Durée maximale du constat sur place avant de renoncer (s). */
const WATCH_TIME = 25;
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
 * Tête de colonne arrêtée au milieu de la foule (au moins CROWD_AROUND manifestants à moins de CROWD_RADIUS m) depuis
 * CROWD_STUCK s sans avoir gagné 5 m vers son point d’arrêt : les motos ne fendent pas une foule — pied à terre, la suite à pied
 * (m, nombre, s).
 */
const CROWD_RADIUS = 15;
const CROWD_AROUND = 6;
const CROWD_STUCK = 8;

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
  private slow = false;
  private convoyAt = -100;
  /** Nouveaux départs de la colonne arrêtée loin du point (voir RIDE_FAR). */
  private relaunches = 0;
  private relaunchX = 0;
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

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'bravm');
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
        if (p && p.poste === 'pilote_moto' && p.posture !== 'down' && p.custody === 'free') n++;
      }
    }
    return n;
  }

  /** Opérateurs à pied valides (dans this.people). */
  private footOperators(): number {
    const n = this.core.members(this.squad.id, this.people);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.vehicleId === 0 && p.poste !== 'pilote_moto' && p.posture !== 'down' && p.custody === 'free') this.people[m++] = p;
    }
    this.people.length = m;
    return m;
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    this.refresh();
    // un nouvel ordre remplace l'action différée du précédent
    this.pending = null;
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
    // « suivre » (« Suivez-moi à pied » du commandant) : le point est la personne suivie, là où elle est — l'ordre ne
    // porte que sa cible ; à des centaines de mètres, la BRAV-M partait à pied, ou restait sur place
    if (type === 'suivre' && o.targetId > 0 && locate(this.core, o.targetId)) o = { ...o, x: this.core.v2.x, z: this.core.v2.z };
    const far = this.farPoint(o);
    if (mounted && this.motos.length > 0 && far > RIDE_BEYOND && this.pilots() > 0) {
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
    if (!mounted && !busyOnFoot && this.motos.length > 0 && this.pilotsAvailable() > 0 && this.footOperators() > 0 && far > WALK_LIMIT) {
      // trop loin pour y aller à pied (plus de trois minutes de marche) : retour aux machines d'abord
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      this.tx = o.x;
      this.tz = o.z;
      this.say(received(this.squad.name, 'trop loin à pied, on remonte en selle'));
      this.defer(() => this.backToMotos());
      return true;
    }
    if (mounted && this.motos.length > 0) {
      // toute manœuvre à pied commence par le pied à terre ; l'ordre est ensuite rendu au module de police
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      this.dismount();
      return true;
    }
    // à pied : c'est une unité comme une autre
    this.order = null;
    this.status.order = '';
    this.setStage('a_pied');
    return false;
  }

  private begin(o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.after = null;
    this.status.order = o.type;
    this.status.targetId = o.type === 'interpeller' && o.targetId > 0 ? o.targetId : 0;
    this.arrestOk = false;
    this.arrestReason = '';
    this.rideAfterRemount = false;
    this.tx = o.x;
    this.tz = o.z;
    if (o.type === 'interpeller' && locate(core, o.targetId)) {
      this.tx = core.v2.x;
      this.tz = core.v2.z;
    }
    const mounted = this.mountedOperators() > 0;
    switch (o.type) {
      case 'interpeller':
        this.say(received(this.squad.name, 'interception de l’objectif' + (core.sector(this.tx, this.tz) !== '' ? ', ' + core.sector(this.tx, this.tz) : '') + ', pied à terre à distance'));
        if (mounted) this.ride(this.tx, this.tz, core.tuning.bravmStandoff);
        else if (this.motos.length > 0 && this.pilotsAvailable() > 0 && this.footOperators() > 0
          && Math.hypot(this.tx - this.people[0].x, this.tz - this.people[0].z) > WALK_LIMIT) {
          // objectif à plus de trois minutes de marche : retour aux machines, puis la colonne y roule (la BRAV-M
          // partait à pied, à des centaines de mètres, alors que la carte annonçait « en véhicules »)
          this.rideAfterRemount = true;
          this.defer(() => this.backToMotos());
        } else this.defer(() => this.approach());
        break;
      case 'avancer':
      case 'colonne':
      case 'repli': {
        // à pied, point à moins de trois minutes de marche : on y va à pied, directement (le retour aux machines,
        // garées au milieu de la foule, puis la remontée en selle, laissaient la BRAV-M sur place une minute et plus)
        const walk = !mounted && this.footOperators() > 0 && Math.hypot(this.tx - this.people[0].x, this.tz - this.people[0].z) <= WALK_LIMIT;
        this.say(received(this.squad.name, o.type === 'repli' ? 'je me replie en colonne' : walk ? 'à pied vers le point' : 'en colonne vers le point'));
        if (mounted) this.ride(this.tx, this.tz, 0);
        else if (walk) this.defer(() => this.walkTo(this.tx, this.tz));
        else this.defer(() => this.backToMotos());
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

  // ───────────────────────────── à moto ─────────────────────────────

  /** Départ en colonne vers (x, z), arrêt `standoff` mètres avant (jamais dans une foule). */
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
    const path = core.path;
    const routed = core.ctx.world.findPath(lead.x, lead.z, x, z, 'vehicle', path) && path.length >= 4;
    this.departure(routed ? path : null, x, z);
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
        // la colonne ne s'arrête pas au milieu de la foule
        if (core.ctx.people.countIn(sx, sz, 22, isProtester) < 8) break;
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
    this.rejoinAt = -1;
    // trajet à travers la ville : en urgence, les fermetures de rue de la police sont franchies (arrêtée devant un
    // barrage à 600 m du point, la colonne s'y déclarait « en position » et n'arrivait jamais) ; manœuvre courte : au pas
    // de la colonne, en file serrée. Décidé au départ, gardé pour tout le trajet (relances, changements d'allure)
    this.urgent = Math.hypot(sx - lead.x, sz - lead.z) > URGENT_BEYOND;
    this.regroupAt = -1;
    this.regroups = 0;
    this.relaunchX = lead.x;
    this.relaunchZ = lead.z;
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
    return ap.convoy(this.motos, this.standX, this.standZ, { gap: 3.5, speed, urgence: this.urgent });
  }

  private stopMotos(): void {
    const ap = this.core.autopilot;
    if (!ap) return;
    for (let i = 0; i < this.motos.length; i++) ap.stop(this.motos[i]);
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
    // retenue : 20 km/h à moins de 30 m de piétons
    const ahead = 12;
    const px = lead.x + Math.sin(lead.heading) * ahead;
    const pz = lead.z + Math.cos(lead.heading) * ahead;
    const near = core.ctx.people.countIn(px, pz, 30, notPolice) > 0;
    if (near) {
      this.clearSince = now;
      if (!this.slow && now - this.convoyAt > 1) {
        this.slow = true;
        this.convoy(core.tuning.bravmSlow);
      }
    } else if (this.slow && now - this.clearSince > 3 && now - this.convoyAt > 2) {
      this.slow = false;
      this.convoy(core.tuning.bravmSpeed);
    }
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
        ap.driveTo(m, this.standX, this.standZ, { speed: core.tuning.bravmSpeed, stopBefore: 4 + i * 3.5, urgence: true });
        s.t = now;
      }
    }
    const st = ap.status(lead);
    const d = Math.hypot(this.standX - lead.x, this.standZ - lead.z);
    const stopped = Math.abs(lead.speed) < 0.4;
    // tête arrêtée au milieu de la foule (le pilote automatique attend que les manifestants s'écartent, indéfiniment) :
    // pied à terre, la suite à pied (voir CROWD_STUCK) — sur un ordre du joueur ; l'arrivée de la journée de service, elle,
    // s'arrête avant la foule (session/journee.ts)
    // (« avancé » : cinq mètres de gagnés vers le point d'arrêt — une tête qui piétine sur place dans la foule n'avance pas)
    if (this.crowdAt < 0 || d < this.crowdD - 5) {
      this.crowdD = d;
      this.crowdAt = now;
    } else if (this.byPlayer() && now - this.crowdAt > CROWD_STUCK && d > RIDE_STANDOFF && core.ctx.people.countIn(lead.x, lead.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND) {
      this.crowdDismount();
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
      // (loin du point, une attente de 20 s derrière un véhicule suffit : sortie de caserne encombrée, bouchon)
      const stuck = blocked || (st.state === 'attente' && st.blockedFor > RELAUNCH_GAP);
      if (!stuck || now - this.convoyAt < RELAUNCH_GAP) return;
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
    // retardataires (encore loin de la tête) : ils rejoignent la tête seuls, en file derrière elle
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
    // déplacement arrêté par la foule loin du point (BRAV-M arrivée avec la colonne au milieu du rassemblement : point
    // d'arrêt retombé sur la tête, pilote automatique qui attend que les manifestants s'écartent) : la colonne se disait
    // « en position » sans avoir bougé, à cent cinquante mètres du point — « la BRAV-M, ils bougeaient pas ». Pied à
    // terre, la suite à pied. Aussi quand le point demandé est dans la foule : ride() a ramené le point d'arrêt au bord du
    // rassemblement (les motos ne s'arrêtent pas dedans), parfois sur la tête elle-même — « En position » à cent mètres du
    // point où le commandant l'appelait (sur son ordre : l'arrivée de la journée de service s'arrête avant la foule)
    const left = lead ? Math.hypot(this.tx - lead.x, this.tz - lead.z) : 0;
    if (o && lead && this.byPlayer() && (o.type === 'avancer' || o.type === 'colonne') && this.mountedOperators() > 0 && left > RIDE_STANDOFF + 8
      && (this.core.ctx.people.countIn(lead.x, lead.z, CROWD_RADIUS, isProtester) >= CROWD_AROUND || (left <= WALK_LIMIT && this.crowdBack))) {
      this.crowdDismount();
      return;
    }
    if (!o || o.type === 'avancer' || o.type === 'colonne' || o.type === 'repli') {
      // arrêtée loin de son point d'arrêt (route coupée, mur du bord de la carte, foule en travers) : elle le dit, avec la
      // distance qui reste — « En position » à 130 m du point trompait celui qui l'y avait envoyée
      const short = lead ? Math.hypot(this.standX - lead.x, this.standZ - lead.z) : 0;
      const motos = spell(this.motos.length) + (this.motos.length > 1 ? ' motos' : ' moto');
      this.say(report(this.superior(), this.squad.name, short > SHORT_OF_POINT
        ? 'Arrêtés à ' + Math.round(short / 10) * 10 + ' mètres du point, accès bloqué, ' + motos
        : 'En position, ' + motos));
      this.complete(true, '');
      return;
    }
    this.setStage('arret');
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

  /** L'ordre en cours vient-il du joueur (carte, roue, bloc « ORDRES ») ? */
  private byPlayer(): boolean {
    const o = this.order;
    return !!o && o.issuedBy !== 0 && o.issuedBy === this.core.ctx.player.state.personId;
  }

  // ───────────────────────────── pied à terre ─────────────────────────────

  /**
   * Colonne prise dans la foule : les motos s'arrêtent, les opérateurs mettent pied à terre et l'ordre continue à pied
   * (déplacement : colonne à pied jusqu'au point ; interception : approche à pied), annoncé à la radio.
   */
  private crowdDismount(): void {
    this.stopMotos();
    this.crowdAt = -1;
    this.say(report(this.superior(), this.squad.name, 'Foule sur l’itinéraire, les motos ne passent pas. Pied à terre, je continue à pied'));
    this.dismount();
  }

  /** Tous les opérateurs descendent dans le même pas (les pilotes gardent les machines). */
  private dismount(): void {
    const core = this.core;
    const ctx = core.ctx;
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) {
      const v = this.motos[i];
      const op = this.seated(v, 'passenger');
      if (op && !op.isPlayer && ctx.vehicles.exit(op)) n++;
    }
    const lead = this.motos[0];
    if (lead) {
      this.standX = lead.x;
      this.standZ = lead.z;
    }
    this.emitStage('pied_a_terre', true, String(n));
    this.setStage('pied_a_terre');
  }

  private afterDismount(): void {
    const o = this.order;
    if (this.after) {
      // manœuvre à pied : rendue au module de police
      const a = this.after;
      this.after = null;
      this.order = null;
      this.status.order = '';
      this.setStage('a_pied');
      this.internal({ type: a.type, x: a.x, z: a.z, heading: a.heading, width: a.width, targetId: a.targetId, maxForce: a.maxForce, issuedBy: a.issuedBy });
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
    // déplacement demandé sans machines disponibles : colonne à pied
    this.walkTo(this.tx, this.tz);
  }

  /** Déplacement à pied jusqu'au point (colonne du module de police) : l'unité redevient une unité à pied. */
  private walkTo(x: number, z: number): void {
    const o = this.order;
    this.internal({ type: 'colonne', x, z, issuedBy: o ? o.issuedBy : 0 });
    this.order = null;
    this.status.order = '';
    this.setStage('a_pied');
  }

  // ───────────────────────────── interception à pied ─────────────────────────────

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
    this.internal({ type: 'colonne', x: ax, z: az, width: 0, issuedBy: o ? o.issuedBy : 0 });
    this.setStage('approche');
  }

  private ensureHandover(): void {
    if (this.handoverSet) return;
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
        this.status.targetId = target.id;
        this.internal({ type: 'interpeller', targetId: target.id, x: target.x, z: target.z, maxForce: 2, issuedBy: this.order ? this.order.issuedBy : 0 });
        this.setStage('interpellation');
        return;
      }
    }
    if (this.sinceStage() > WATCH_TIME) {
      this.arrestOk = false;
      this.arrestReason = target ? 'Objectif au milieu d’un groupe compact : interpellation non tentée.' : 'Aucun fait constaté : aucune interpellation.';
      this.say(refused(this.squad.name, this.arrestReason.replace(/\.$/, '') + ', je regagne les machines'));
      this.backToMotos();
    }
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
   * moto du groupe) ? L'embarquement les y mène lui-même.
   */
  private atMotos(): boolean {
    const n = this.footOperators();
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      let near = Math.hypot(p.x - this.standX, p.z - this.standZ) < MOUNT_REACH;
      for (let j = 0; j < this.motos.length && !near; j++) near = Math.hypot(p.x - this.motos[j].x, p.z - this.motos[j].z) < MOUNT_REACH;
      if (!near) return false;
    }
    return true;
  }

  private remount(): void {
    this.internal({ type: 'embarquer', issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('remontee');
  }

  private remountDone(): void {
    const o = this.order;
    this.emitStage('en_selle', true, '');
    if (!o) {
      this.setStage('repos');
      return;
    }
    if (o.type === 'interpeller' && this.rideAfterRemount) {
      // remontés en selle pour une interception lointaine : en route (personne en selle : à pied quand même)
      this.rideAfterRemount = false;
      if (this.mountedOperators() > 0) this.ride(this.tx, this.tz, this.core.tuning.bravmStandoff);
      else this.approach();
      return;
    }
    if (o.type === 'interpeller') {
      const body = this.arrestOk
        ? spell(1) + ' interpellé sur fait constaté, remis au point de regroupement. En selle, disponible'
        : 'Interception sans interpellation. En selle, disponible';
      this.say(report(this.superior(), this.squad.name, body));
      this.complete(this.arrestOk, this.arrestReason);
      return;
    }
    if ((o.type === 'avancer' || o.type === 'colonne' || o.type === 'repli') && this.mountedOperators() > 0) {
      this.ride(o.x, o.z, 0);
      return;
    }
    if (this.after && this.mountedOperators() > 0) {
      // en selle pour un point éloigné : on y va à moto
      this.ride(this.after.x, this.after.z, RIDE_STANDOFF);
      return;
    }
    if (this.after) {
      // personne n'a pu remonter : la manœuvre se fait à pied
      const a = this.after;
      this.after = null;
      this.order = null;
      this.status.order = '';
      this.setStage('a_pied');
      this.internal({ type: a.type, x: a.x, z: a.z, heading: a.heading, width: a.width, targetId: a.targetId, maxForce: a.maxForce, issuedBy: a.issuedBy });
      return;
    }
    this.complete(true, '');
  }

  /** Distance de l'unité au point de l'ordre (0 si l'ordre n'a pas de point). */
  private farPoint(o: SquadOrder): number {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || (o.x === 0 && o.z === 0)) return 0;
    const ref = this.motos[0] ?? this.people[0];
    if (!ref) return 0;
    let fx = ref.x;
    let fz = ref.z;
    const p = this.people[0];
    if (p && this.mountedOperators() === 0) {
      fx = p.x;
      fz = p.z;
    }
    return Math.hypot(o.x - fx, o.z - fz);
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
      else {
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
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  think(): void {
    this.refresh();
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      pending();
      return;
    }
    const stage = this.status.stage;
    if (stage === 'repos' || stage === 'a_pied') this.rejoin();
    switch (stage) {
      case 'route':
        this.thinkRide();
        break;
      case 'arret':
        // machines à l'arrêt : pied à terre simultané
        if (this.sinceStage() >= 0.5) this.dismount();
        break;
      case 'pied_a_terre':
        if (this.sinceStage() >= 1) this.afterDismount();
        break;
      case 'approche':
        if (this.sinceStage() > 120) {
          this.watchAt = 0;
          this.setStage('constat');
        }
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
