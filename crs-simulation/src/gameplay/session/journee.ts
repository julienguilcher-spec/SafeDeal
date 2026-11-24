/* =====================================================================================
 * JOURNÉE DE SERVICE — prise de service à la caserne, trajet en colonne, manifestation, retour.
 *
 * Demande du commanditaire : « je veux avoir un début et après me déplacer dans la ville pour gérer les
 * manifestations, en colonne » ; « quand je suis un simple CRS, c'est pas moi qui conduis, je suis dans le van et on
 * va jusqu'à la mission ; il faut que l'IA soit totalement autonome ».
 *
 * Déroulé (extra.journee, rôles de police ; la mise en place pose la compagnie à la caserne de la Cité) :
 *   1. prise de service  : la salle (CENTRAL) annonce la manifestation du jour ;
 *   2. embarquement      : ordre de mouvement ; la compagnie embarque (police.command.arrive, boardFirst) ; la colonne
 *                          attend le joueur s'il fait partie de la compagnie (objectif « Embarquez », GPS sur son
 *                          fourgon) ; un joueur qui conduit son propre engin la suit ;
 *   3. route             : colonne en urgence, sirènes et gyrophares ; les chauffeurs de l'IA conduisent ;
 *   4. sur place         : débarquement (le joueur passager descend avec son groupe), le commandement prend la main ;
 *   5. retour            : fin de mission → rembarquement (la colonne attend le joueur) → retour à la caserne ;
 *   6. seconde intervention (journée normale ou longue) : de retour à la caserne, la salle engage la compagnie sur
 *                          des feux de véhicules et de conteneurs dans un autre quartier (pompiers engagés) :
 *                          colonne, cordon autour des feux, retour quand ils sont éteints ;
 *   7. fin de service    : compte rendu.
 * Pendant toute la journée, la ville vit : feux de poubelles et de conteneurs dans d'autres quartiers, signalés à la
 * radio et sur la carte (module des incidents), traités par les pompiers ou confiés au joueur selon son rôle.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, Prop, RoadSample, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Objective, ObjectivesApi } from '@/core/extensions';
import { SESSION_SETUP_EVENT } from './api';
import type { SessionSetupSummary } from './api';
import { SERVICE_BASE, baseOf, isJournee } from './journee-data';
import type { ServiceBase } from './journee-data';
import { chooseStandOffCrowd } from './placement';
import { isPoliceRole } from './roster';
import { pointOnPolyline } from '@/core/math';

export type JourneeStage =
  | 'inactif' | 'prise_de_service' | 'embarquement' | 'route' | 'sur_place' | 'rembarquement' | 'retour'
  | 'intervention_route' | 'intervention' | 'fin';

export const JOURNEE_SERVICE = 'session.journee';
export const JOURNEE_OBJECTIVE_ID = 'journee';

export interface JourneeApi {
  readonly stage: JourneeStage;
  /** Le joueur est en déplacement commandé (embarquement, route, retour) : pas d'autre ordre de poste. */
  readonly travelling: boolean;
  /** Destination de la colonne (zone de stationnement), null avant l'ordre de mouvement. */
  readonly destination: { x: number; z: number; name: string } | null;
  /**
   * Secondes avant la fin de l'attente en cours, pour la ligne d'état (« prêt dans 5 s ») : départ de la colonne à
   * l'embarquement, reste du trajet en route, stationnement, débarquement ; 0 quand rien n'est attendu ; −1 quand la
   * colonne n'attend plus que le joueur (il doit monter : pas de compte à rebours).
   */
  readyIn(): number;
}

/** Vue minimale du commandement IA (police.command). */
interface CommandLike {
  arrive(companyId: number, dest: { x: number; z: number; heading: number; layout?: 'file' | 'bataille' | 'epi'; boardFirst?: boolean }): boolean;
  depart(companyId: number, exit?: { x: number; z: number }): boolean;
  convoyOf(companyId: number): { stage: string; departIn?: number; awaitingPlayer?: boolean; remaining?: number } | null;
  stateOf(companyId: number): { phase: string; missionEnded: boolean } | null;
  special?(squadId: number): { kind: string; stage?: string; x?: number; z?: number } | null;
  /** La colonne garde-t-elle encore les passagers de ce véhicule à bord (il roule ou se gare encore) ? */
  holding?(vehicleId: number): boolean;
}
/** Vue minimale du service des commissariats (police.commissariats, src/gameplay/commissariats). */
interface StationsLike {
  isStationUnit(squadId: number): boolean;
}
interface VehiclesExt {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons?(v: Vehicle, on: boolean): void;
}

/** Instants du déroulé (s depuis la mise en place). */
const BRIEF_AT = 2;
const DISPATCH_AT = 9;
/** Fin de service : délai avant le compte rendu (s). */
const DEBRIEF_DELAY = 20;
/** Feux en ville : premier, puis intervalle aléatoire (s), distance au joueur (m), nombre maximal. */
const CITY_FIRST = 150;
const CITY_EVERY_MIN = 200;
const CITY_EVERY_MAX = 380;
const CITY_MIN_DIST = 400;
const CITY_MAX_DIST = 1800;
const CITY_MAX = 6;
/** Rayon d'arrivée à la caserne (m) ; durée maximale du retour avant de clore la journée (s). */
const BASE_RADIUS = 160;
const RETURN_MAX = 900;
/** Durée maximale de la seconde intervention avant de lever le périmètre (s). */
const INTERVENTION_MAX = 420;
/**
 * Colonne arrivée, le véhicule qui emporte le joueur encore en chemin : la journée n'est « sur place » que lorsqu'il est
 * à moins de RIDE_NEAR m de la zone de stationnement, ou arrêté pour de bon — attendu RIDE_WAIT s au plus (m, s)…
 */
const RIDE_NEAR = 150;
const RIDE_WAIT = 180;
/** … sauf arrêté depuis RIDE_STILL s (file des fourgons qui se rangent) à moins de RIDE_WALK m : il descend et finit à pied. */
const RIDE_WALK = 300;
const RIDE_STILL = 10;
/** Arrivée sans colonne : distance du joueur (ou du chef de son unité) à la zone de stationnement (m). */
const SOLO_ARRIVE = 70;
/** BRAV-M arrêtée « en position » à moins de tant de mètres du point (retenue devant la foule) : arrivée (m). */
const BRAVM_PARKED = 250;
/** Chef de la BRAV-M à pied au départ : la BRAV-M l'attend tant de secondes, puis part en lui laissant sa moto (s). */
const CHIEF_WAIT = 20;
/** Chef de la BRAV-M descendu de sa moto à moins de tant de mètres d'elle : elle l'attend (m). */
const CHIEF_NEAR = 15;
/** Moto du chef qui rejoint la BRAV-M : rendue à la BRAV-M à moins de tant de mètres de sa tête (m). */
const REJOIN_BRAVM = 80;
/** Chef de la BRAV-M en selle sur la moto qui l'attendait : la journée attend son arrivée au plus ce temps (s). */
const REJOIN_RIDE_MAX = 600;
/** Joueur passager d'une moto retardataire, la tête de sa BRAV-M arrivée : attendu jusqu'à tant de mètres du point, au plus ce temps (m, s). */
const LAG_NEAR = 200;
const LAG_WAIT = 420;
/** Base partagée : la compagnie se met en file quand les motos de la BRAV-M du joueur sont à plus de tant de mètres de ses véhicules (m). */
const OTHERS_CLEAR = 110;
/** … et au plus tard après ce délai (s) : un joueur resté sur place ne retient pas la compagnie. */
const OTHERS_WAIT = 45;
/** Moto du chef dont le pilote automatique s'est arrêté en chemin : relancée au plus toutes les tant de secondes (s). */
const REDRIVE = 20;
/**
 * Arrivée : les unités que le joueur commande reprennent « suivre » une fois la colonne débarquée — au plus tard tant
 * de secondes après l'arrivée (s), et la surveillance s'arrête tant de secondes après (s).
 */
const REJOIN_LATE = 40;
const REJOIN_WATCH = 150;
/** … seulement s'il est arrivé avec elles : à moins de tant de mètres de la zone de stationnement (m). */
const REJOIN_NEAR = 300;
/** Vitesse de calcul du reste du trajet en colonne (m/s), délai annoncé au stationnement (s). */
const ROUTE_SPEED = 9;
const PARK_ETA = 10;
/** Événement de police.command : étape d'une colonne (sim/police/command/api.ts, COMMAND_CONVOY_EVENT). */
const CONVOY_EVENT = 'command:convoy';

const CONVOY_KINDS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'canon_eau', 'centaure']);
/** Engins à équipage : on n'y monte que si l'on en fait partie. */
const ENGINE_KINDS: ReadonlySet<string> = new Set(['canon_eau', 'centaure']);

/** Organisateurs de la manifestation (extra['manif.organisateurs']) tels que CENTRAL les annonce. */
const ORGANISATEURS: Readonly<Record<string, string>> = {
  intersyndicale: 'à l’appel de l’intersyndicale',
  collectif: 'à l’appel d’un collectif',
  coordination_etudiante: 'à l’appel de la coordination étudiante',
};

/**
 * Manifestation du jour telle que CENTRAL l'annonce à la prise de service : son nom (extra['manif.nom'], 60 caractères au
 * plus), sa cause (extra.causeLabel) et ses organisateurs (extra['manif.organisateurs']) quand ils sont connus.
 * « Manifestation déclarée « Retraites : on lâche rien » (retraites), à l'appel de l'intersyndicale » ; sans organisateur
 * (« aucun »), la manifestation n'est pas déclarée.
 */
export function manifestationBrief(extra: Readonly<Record<string, unknown>> | undefined): string {
  const raw = extra ? extra['manif.nom'] : undefined;
  const nom = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const causeRaw = extra ? extra['causeLabel'] : undefined;
  const cause = typeof causeRaw === 'string' && causeRaw.trim() ? ` (${causeRaw.trim().toLowerCase()})` : '';
  const org = extra ? extra['manif.organisateurs'] : undefined;
  const aucun = org === 'aucun';
  let text = aucun ? 'Manifestation non déclarée' : 'Manifestation déclarée';
  if (nom) text += ` « ${nom} »`;
  text += cause;
  if (aucun) text += ', sans organisateur ni service d’ordre';
  else if (typeof org === 'string' && ORGANISATEURS[org]) text += `, ${ORGANISATEURS[org]}`;
  return text;
}

/**
 * Foule que la colonne contournera (mêmes zones que police/command/convoy.ts, crowdZones) : une zone de 30 m par carré
 * de 40 m où au moins six manifestants libres, debout et à pied sont regroupés.
 */
function crowdZones(ctx: GameContext): { x: number; z: number; r: number }[] {
  const cells = new Map<number, { n: number; x: number; z: number }>();
  const list = ctx.people.list;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (p.dormant || p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down' || p.vehicleId !== 0) continue;
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
  return out;
}

export class JourneeSystem implements GameSystem {
  readonly id = 'session.journee';
  readonly order = SystemOrder.CONTROL + 47;

  private ctx: GameContext | null = null;
  /** Lieu de prise de service (caserne ou commissariat, choisi au démarrage selon le lieu du rassemblement). */
  private base: ServiceBase = SERVICE_BASE;
  /** Session de mission : la mission a son propre déroulé (pas de feux en ville ni de seconde intervention). */
  private mission = false;
  /** Le joueur ne voyage pas dans une colonne de la compagnie (BRAV-M, unité sans véhicules) : arrivée à la distance. */
  private solo = false;
  private stage_: JourneeStage = 'inactif';
  private companyId = 0;
  private startAt = 0;
  private briefed = false;
  private moveSaid = false;
  private dest: { x: number; z: number; heading: number; name: string } | null = null;
  private endAt = 0;
  private returnAt = 0;
  private secondDone = false;
  private interventionAt = 0;
  private onSiteAt = 0;
  private site: { x: number; z: number; name: string } | null = null;
  private readonly fires: { x: number; z: number; vehicleId: number }[] = [];
  private nextCity = 0;
  private cityCount = 0;
  private sirensOn = false;
  /** Instant de l'arrivée sur place (s) ; les unités du joueur suivent de nouveau (voir thinkRejoin). */
  private arrivedAt = -1;
  /** Instant où la colonne s'est dite arrivée alors que le véhicule du joueur roulait encore (−1 : sans objet). */
  private rideWaitAt = -1;
  /** Instant depuis lequel ce véhicule est à l'arrêt (−1 : il roule). */
  private rideStillAt = -1;
  private rejoinDone = false;
  /** Un ordre du joueur a repris toute la compagnie à sa colonne (étape « annule » de police.command). */
  private takenOver = false;
  /** Chef de la BRAV-M à pied à l'ordre de mouvement : depuis quand on l'attend (s), −1 : on ne l'attend pas. */
  private chiefWaitAt = -1;
  /** Tête de la BRAV-M arrivée, le joueur encore en selle loin derrière : depuis quand on l'attend (s), −1 : sans objet. */
  private lagAt = -1;
  /**
   * Compagnies dont le départ (mise en file, embarquement) attend que les motos de la BRAV-M du joueur soient sorties de
   * la base qu'elles partagent (voir holdsOwnColumn) : { compagnie, zone de stationnement, instant de la demande }.
   */
  private lateOthers: { id: number; x: number; z: number; heading: number; since: number }[] = [];
  /**
   * Moto du chef laissée avec son pilote quand la BRAV-M est partie sans lui (binôme, moto) ; `riding` : il est monté,
   * son pilote l'emmène rejoindre la BRAV-M (la moto lui est rendue quand ils l'ont rejointe).
   */
  private waitingMoto: { binomeId: number; motoId: number; riding: boolean; driveAt: number; rideAt: number } | null = null;
  private nextThink = 0;
  private rng: (() => number) | null = null;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(JOURNEE_SERVICE, {
      get stage() { return self.stage_; },
      get travelling() { return self.stage_ === 'embarquement' || self.stage_ === 'route' || self.stage_ === 'rembarquement' || self.stage_ === 'retour' || self.stage_ === 'intervention_route'; },
      get destination() { return self.dest ? { x: self.dest.x, z: self.dest.z, name: self.dest.name } : null; },
      readyIn: () => self.readyIn(),
    } satisfies JourneeApi);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.events.onAny(SESSION_SETUP_EVENT, (e) => this.onSetup(e as SessionSetupSummary));
    // colonne de la compagnie annulée par un ordre du joueur (il la reprend : « Avec moi », un ordre à toute l'unité)
    ctx.events.onAny(CONVOY_EVENT, (e) => {
      const c = e as { squadId: number; stage: string };
      if (c && c.stage === 'annule' && this.companyId !== 0 && c.squadId === this.companyId) this.takenOver = true;
    });
  }

  reset(): void {
    this.stage_ = 'inactif';
    this.companyId = 0;
    this.briefed = false;
    this.moveSaid = false;
    this.dest = null;
    this.endAt = 0;
    this.returnAt = 0;
    this.secondDone = false;
    this.solo = false;
    this.interventionAt = 0;
    this.site = null;
    this.fires.length = 0;
    this.cityCount = 0;
    this.sirensOn = false;
    this.arrivedAt = -1;
    this.rideWaitAt = -1;
    this.rideStillAt = -1;
    this.rejoinDone = false;
    this.takenOver = false;
    this.chiefWaitAt = -1;
    this.lagAt = -1;
    this.waitingMoto = null;
    this.lateOthers.length = 0;
    this.nextThink = 0;
  }

  private onSetup(summary: SessionSetupSummary): void {
    const ctx = this.ctx!;
    this.reset();
    if (!isJournee(ctx.session.config) || !summary.usedPoliceUnits || summary.rootSquadId === 0) {
      this.announceManifestation();
      return;
    }
    this.base = baseOf(ctx.session.config);
    this.mission = (ctx.session.config?.missionId ?? '') !== '';
    // (le joueur de la BRAV-M — chef, opérateur, pilote — fait mouvement avec elle, même rattachée à la compagnie)
    this.companyId = this.bravmOfPlayer() || this.companyOf(summary.rootSquadId);
    this.startAt = ctx.clock.now;
    this.nextCity = this.startAt + CITY_FIRST;
    const r = ctx.rng.fork('session.journee');
    this.rng = () => r.next();
    this.stage_ = 'prise_de_service';
    // l'ordre de mouvement part tout de suite (avant la première décision du commandement IA, qui sinon déploierait
    // ses groupes à pied depuis la caserne) ; la radio l'annonce au fil des premières secondes
    this.dispatch();
  }

  /**
   * Sans journée de service (forces déjà sur place, rôle civil) : la manifestation nommée du Mode libre (extra['manif.nom'],
   * extra['manif.organisateurs']) est annoncée au début de la partie — à la radio pour les forces de l'ordre, à l'écran
   * pour tous —, comme le briefing de prise de service l'aurait fait.
   */
  private announceManifestation(): void {
    const ctx = this.ctx!;
    const cfg = ctx.session.config;
    const extra = cfg?.extra;
    if (!cfg || !extra || cfg.crowdSize <= 0 || extra['vacation'] !== undefined) return;
    if (extra['manif.nom'] === undefined && extra['manif.organisateurs'] === undefined) return;
    const text = `${manifestationBrief(extra)}, rassemblement ${cfg.place || 'en ville'}.`;
    if (isPoliceRole(cfg.role)) ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `CENTRAL : ${text}` });
    ctx.ui.notify(text, 'info', 8);
  }

  /**
   * BRAV-M dont fait partie le joueur (l'unité la plus haute de BRAV-M au-dessus de son binôme), même rattachée à la
   * compagnie : elle fait sa propre colonne de motos, avec lui. 0 : il n'est pas de la BRAV-M.
   */
  private bravmOfPlayer(): number {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    let s = me && me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    let top = 0;
    for (let guard = 0; s && guard < 8; guard++) {
      if (!this.isBravmUnit(s.id)) break;
      top = s.id;
      s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
    }
    return top;
  }

  /** BRAV-M entière (pas l'un de ses binômes) : partie de BRAV-M dont l'unité mère n'en est pas une. */
  private isBravmTop(s: { id: number; parentId: number }): boolean {
    return this.isBravmUnit(s.id) && !(s.parentId !== 0 && this.isBravmUnit(s.parentId));
  }

  /** BRAV-M ou l'une de ses parties : binôme à moto, ou groupe dont un binôme a sa moto. */
  private isBravmUnit(squadId: number): boolean {
    const ctx = this.ctx!;
    if (this.isBravm(squadId)) return true;
    return ctx.squads.childrenOf(squadId).some((c) => c.kind === 'binome' && c.vehicleId !== 0 && ctx.vehicles.get(c.vehicleId)?.kind === 'moto_bravm');
  }

  /** Compagnie (racine) de l'unité. */
  private companyOf(id: number): number {
    const ctx = this.ctx!;
    let s = ctx.squads.get(id);
    for (let guard = 0; s && s.parentId !== 0 && guard < 8; guard++) s = ctx.squads.get(s.parentId) ?? undefined;
    return s ? s.id : id;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.stage_ === 'inactif') return;
    const now = ctx.clock.now;
    if (now < this.nextThink) return;
    this.nextThink = now + 0.5;
    const t = now - this.startAt;
    if (!this.mission) this.cityLife(now);
    // moto du chef de la BRAV-M laissée à l'attendre : à toutes les étapes, jusqu'à ce qu'elle ait rejoint la BRAV-M
    if (this.waitingMoto) this.thinkWaitingMoto();
    if (this.lateOthers.length > 0) this.thinkLateOthers(now);
    // briefing et ordre de mouvement : aussi quand le joueur part sans colonne (BRAV-M en tête de ses motards)
    if (!this.briefed && t >= BRIEF_AT) this.brief();
    if (t >= DISPATCH_AT && !this.moveSaid && this.dest) this.sayMove();
    switch (this.stage_) {
      case 'prise_de_service':
      case 'embarquement':
        if (this.stage_ === 'embarquement') this.thinkEmbark();
        break;
      case 'route':
        this.thinkRoute();
        break;
      case 'sur_place':
        this.thinkOnSite();
        break;
      case 'rembarquement':
      case 'retour':
        this.thinkReturn(now);
        break;
      case 'intervention_route':
        this.thinkInterventionRoute();
        break;
      case 'intervention':
        this.thinkIntervention(now);
        break;
      case 'fin':
        if (this.endAt > 0 && now >= this.endAt) {
          this.endAt = 0;
          ctx.session.end(true);
        }
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── étapes ─────────────────────────────

  /** Unité spéciale BRAV-M ? */
  private isBravm(squadId: number): boolean {
    const ctx = this.ctx!;
    // à la mise en place, le registre des unités spéciales n'est pas encore à jour : on regarde aussi les machines
    const s = ctx.squads.get(squadId);
    if (s && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'moto_bravm') return true;
    const command = ctx.service<CommandLike>('police.command');
    const sp = command && command.special ? command.special(squadId) : null;
    return !!sp && sp.kind === 'bravm';
  }

  /**
   * Les autres unités de la session (compagnies, BRAV-M) font mouvement vers (x, z) — à l'aller vers la zone de
   * stationnement, au retour vers la base : colonne motorisée du commandement pour une compagnie, colonne de motos
   * pour une BRAV-M. Chacune roule de son côté ; tout le monde se retrouve au même endroit.
   */
  private engageOthers(x: number, z: number, heading: number, back: boolean): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const stations = ctx.service<StationsLike>('police.commissariats');
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.id === this.companyId) continue;
      // unité d'un commissariat (engagée par le commandant ou rentrée à ses places) : elle n'est pas de la journée
      if (stations?.isStationUnit(s.id)) continue;
      if (s.parentId !== 0) {
        // BRAV-M rattachée à la compagnie (sous les ordres du commandant, dans « Avec moi ») : elle part de son
        // commissariat et rentre à moto, en sa propre colonne — les ordres de colonne de la compagnie (embarquer,
        // débarquer) ne la concernent pas (police/command/bravm.ts, relayFrom)
        if (this.isBravmTop(s)) {
          // (à l'aller, pas sur la zone de stationnement de la colonne : voir motoStand)
          const at = back ? { x, z } : this.motoStand(x, z, heading);
          ctx.squads.issue(s.id, { type: 'colonne', x: at.x, z: at.z, heading, width: 0, issuedBy: s.leaderId });
        }
        continue;
      }
      // (une BRAV-M n'a pas de membres propres : ses binômes sont des sous-unités)
      if (this.isBravm(s.id)) {
        ctx.squads.issue(s.id, { type: 'colonne', x, z, heading, width: 0, issuedBy: s.leaderId });
        continue;
      }
      if (s.kind !== 'compagnie' || !command) continue;
      if (back) command.depart(s.id, { x, z });
      else if (this.holdsOwnColumn(s.id)) {
        // la BRAV-M du joueur part de la même base : ses motos sortent d'abord (thinkLateOthers)
        if (!this.lateOthers.some((o) => o.id === s.id)) this.lateOthers.push({ id: s.id, x, z, heading, since: ctx.clock.now });
      } else {
        // véhicules mis en file, nez vers la sortie : garés en bloc, la tête manœuvrait sans fin pour sortir
        this.lineUp(x, z, s.id);
        command.arrive(s.id, { x, z, heading, layout: 'file', boardFirst: true });
      }
    }
  }

  /**
   * La mise en file de la compagnie `companyId` enfermerait-elle la colonne du joueur ? Vrai quand il fait mouvement avec
   * SA BRAV-M (une unité à part, pas celle de cette compagnie) et qu'une de ses motos, pilote en selle, est encore dans
   * l'emprise de cette file (OTHERS_CLEAR m au moins autour du bloc de la compagnie). La file se range le long des premiers mètres de l'itinéraire,
   * celui des motos aussi : commissariat du 9e (rue Chauchat, 5,20 m de chaussée, sens unique), le fourgon cellulaire de
   * queue posé cinq mètres devant les motos du joueur, qui attendaient derrière lui que la compagnie ait embarqué — une
   * minute et demie, sans la place de le doubler.
   */
  private holdsOwnColumn(companyId: number): boolean {
    const ctx = this.ctx!;
    if (!this.solo || !this.isBravmUnit(this.companyId) || this.companyOf(this.companyId) === companyId) return false;
    let cx = 0, cz = 0, n = 0;
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind) || v.def.flying) continue;
      cx += v.x; cz += v.z; n++;
    }
    if (n === 0) return false;
    cx /= n;
    cz /= n;
    // (la file : une dizaine de mètres par véhicule depuis le centre du bloc, le long de l'itinéraire)
    const clear = Math.max(OTHERS_CLEAR, n * 10 + 30);
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || !this.under(s.id, this.companyId)) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && !v.def.flying && v.seats[0] !== 0 && Math.hypot(v.x - cx, v.z - cz) < clear) return true;
    }
    return false;
  }

  /** Départ des compagnies qui attendaient la sortie des motos du joueur : dès qu'elles sont sorties, OTHERS_WAIT s au plus. */
  private thinkLateOthers(now: number): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    for (let i = this.lateOthers.length - 1; i >= 0; i--) {
      const o = this.lateOthers[i]!;
      const s = ctx.squads.get(o.id);
      if (s && command && now - o.since < OTHERS_WAIT && this.stage_ === 'route' && this.holdsOwnColumn(o.id)) continue;
      this.lateOthers.splice(i, 1);
      if (!s || !command) continue;
      this.lineUp(o.x, o.z, o.id);
      command.arrive(o.id, { x: o.x, z: o.z, heading: o.heading, layout: 'file', boardFirst: true });
    }
  }

  /**
   * Point d'arrêt des motos d'une BRAV-M rattachée à la compagnie, à l'aller : jamais la zone de stationnement même.
   * Parties de leur commissariat, elles y arrivaient avant la colonne et s'arrêtaient là où son véhicule de tête doit se
   * garer : il attendait, nez contre elles, toute la file derrière lui, et la compagnie restait assise (République :
   * tous à pied quarante-neuf secondes après l'arrêt). Elles s'arrêtent sur la chaussée à une quarantaine de mètres sur
   * le côté du rang (une rue voisine) ; à défaut derrière sa queue, à une trentaine de mètres du dernier fourgon — à
   * moins de 150 m du commandant dans tous les cas (elle le rejoint quand il descend : « avec moi »).
   */
  private motoStand(x: number, z: number, heading: number): { x: number; z: number } {
    const ctx = this.ctx!;
    const world = ctx.world;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    // (droite du rang : même repère que le stationnement en file)
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const path: number[] = [];
    const reachable = (px: number, pz: number): boolean => {
      path.length = 0;
      try { return world.findPath(px, pz, x, z, 'vehicle', path) && path.length >= 4; } catch { return false; }
    };
    for (const d of [40, 55]) {
      for (const side of [1, -1]) {
        if (!world.nearestRoad(x + rx * d * side, z + rz * d * side, this.road, 20)) continue;
        const px = this.road.x, pz = this.road.z;
        // (ni dans le couloir du rang, ni devant sa tête où la compagnie se met en ligne)
        const lat = Math.abs((px - x) * rx + (pz - z) * rz);
        const along = (px - x) * fx + (pz - z) * fz;
        if (lat < 22 || along > 25 || !world.isFree(px, pz, 1.2) || !reachable(px, pz)) continue;
        return { x: px, z: pz };
      }
    }
    // derrière la queue du rang (un véhicule tous les 9 m environ, la moitié de la file derrière le point)
    let n = 0;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.vehicleId === 0 || !this.under(s.id, this.companyId)) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && !v.def.flying && v.kind !== 'moto_bravm') n++;
    }
    for (const d of [n * 4.5 + 30, n * 4.5 + 45, n * 4.5 + 20]) {
      if (!world.nearestRoad(x - fx * d, z - fz * d, this.road, 20)) continue;
      const px = this.road.x, pz = this.road.z;
      if ((px - x) * fx + (pz - z) * fz > -(n * 4.5 + 10) || !world.isFree(px, pz, 1.2) || !reachable(px, pz)) continue;
      return { x: px, z: pz };
    }
    return { x, z };
  }

  /** L'unité `id` est-elle `rootId` ou placée sous elle ? */
  private under(id: number, rootId: number): boolean {
    const ctx = this.ctx!;
    let q = ctx.squads.get(id);
    for (let guard = 0; q && guard < 8; guard++) {
      if (q.id === rootId) return true;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    }
    return false;
  }

  /** « à la caserne de la Cité », « au commissariat du 9e arrondissement… ». */
  private atBase(): string {
    const n = this.base.name;
    return (/^commissariat/.test(n) ? 'au ' : 'à la ') + n;
  }

  private companyName(): string {
    return this.ctx!.squads.get(this.companyId)?.name ?? 'COMPAGNIE';
  }

  private brief(): void {
    const ctx = this.ctx!;
    this.briefed = true;
    const cfg = ctx.session.config!;
    const hour = this.hourIn(15 * 60);
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
      text: `${this.companyName()} de CENTRAL. Prise de service ${this.atBase()}. ${manifestationBrief(cfg.extra)}, rassemblement ${cfg.place || 'en ville'} vers ${hour}. Préparez-vous au départ.` });
    ctx.ui.notify(`Prise de service ${this.atBase()} : écoutez la radio.`, 'info', 6);
  }

  /** Heure de jeu dans `seconds` secondes (« 14 h 25 »). */
  private hourIn(seconds: number): string {
    const ctx = this.ctx!;
    const h0 = ctx.env?.state?.timeOfDay ?? ctx.session.config?.timeOfDay ?? 14;
    const h = (h0 + seconds / 3600) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60 / 5) * 5;
    return `${hh} h ${mm < 10 ? '0' : ''}${mm}`;
  }

  /** Ordre de mouvement : zone de stationnement à l'écart du rassemblement, colonne par le commandement. */
  private dispatch(): void {
    const ctx = this.ctx!;
    const cfg = ctx.session.config!;
    const x = typeof cfg.x === 'number' ? cfg.x : 0;
    const z = typeof cfg.z === 'number' ? cfg.z : 0;
    const stand = chooseStandOffCrowd(ctx, x, z, ctx.director.route, (p) => p.faction === 'protest');
    const at = stand ?? { x, z, heading: 0 };
    const name = this.place(at.x, at.z);
    this.dest = { x: at.x, z: at.z, heading: at.heading, name };
    this.lineUp(at.x, at.z);
    const command = ctx.service<CommandLike>('police.command');
    const me = ctx.player.person();
    const own = ctx.squads.get(this.companyId);
    if (own && this.isBravmUnit(own.id)) {
      // BRAV-M : le joueur pilote à sa tête mène (ses motards le suivent) ; équipier, l'unité part sans lui attendre ; chef
      // de la BRAV-M en selle derrière son pilote, elle part avec lui (ordre de la journée : la colonne s'arrête avant la
      // foule, comme pour toute la journée de service)
      const atBar = !!me && me.vehicleId !== 0 && ctx.vehicles.get(me.vehicleId)?.seats[0] === me.id;
      this.solo = true;
      if (me && this.chiefOf(own.id) && me.vehicleId === 0 && this.chiefMoto()) {
        // chef de la BRAV-M à pied : elle l'attend (CHIEF_WAIT s au plus) et part avec lui dès qu'il est en selle
        this.chiefWaitAt = ctx.clock.now;
        this.stage_ = 'embarquement';
        this.thinkChief();
        return;
      }
      if (!me || own.leaderId !== me.id) ctx.squads.issue(own.id, { type: 'colonne', x: at.x, z: at.z, heading: at.heading, width: 0, issuedBy: own.leaderId });
      else if (!atBar) ctx.squads.issue(own.id, { type: 'colonne', x: at.x, z: at.z, heading: at.heading, width: 0, issuedBy: 0 });
      this.objective(me && own.leaderId === me.id ? `En selle, en tête de la BRAV-M : ${name}` : `En selle avec la BRAV-M : ${name}`, at.x, at.z, true);
      this.stage_ = 'route';
      this.setSirens(true);
      return;
    }
    const ok = !!command && command.arrive(this.companyId, { x: at.x, z: at.z, heading: at.heading, layout: 'file', boardFirst: true });
    this.stage_ = 'embarquement';
    if (!ok) {
      // pas de colonne (module absent, unité sans véhicules) : le joueur s'y rend lui-même
      this.solo = true;
      this.objective(`Rejoindre ${name}`, at.x, at.z, true);
      this.stage_ = 'route';
      return;
    }
    this.embarkObjective();
  }

  /** Ordre de mouvement à la radio (après le briefing). */
  private sayMove(): void {
    const ctx = this.ctx!;
    this.moveSaid = true;
    const cfg = ctx.session.config!;
    const name = this.dest ? this.dest.name : 'la zone indiquée';
    // toutes les unités de la session font mouvement vers le même point, chacune avec ses véhicules (à l'annonce :
    // à la mise en place, les unités spéciales ne sont pas encore toutes constituées)
    if (this.dest) this.engageOthers(this.dest.x, this.dest.z, this.dest.heading, false);
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
      text: `${this.companyName()}, faites mouvement sur ${cfg.place || name}. Zone de stationnement : ${name}. Départ en colonne, deux tons.` });
  }

  /** Le joueur à pied : objectif « Embarquez » sur le véhicule de son groupe ; au volant de son engin : « Suivez ». */
  private embarkObjective(): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    if (!me) return;
    if (me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      if (v && v.seats[0] === me.id && this.dest) this.objective(`Suivez la colonne : ${this.dest.name}`, this.dest.x, this.dest.z, true);
      else this.objective('À bord : la colonne va partir', me.x, me.z, false);
      return;
    }
    const v = this.seatFor(me);
    if (v) this.objective(`Embarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
    else if (this.dest) this.objective(`Rejoignez ${this.dest.name}`, this.dest.x, this.dest.z, true);
  }

  private thinkEmbark(): void {
    const ctx = this.ctx!;
    if (this.chiefWaitAt >= 0) {
      this.thinkChief();
      return;
    }
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    // le joueur a repris toute la compagnie à sa colonne avant le départ (un ordre à toute l'unité, police.command
    // takeOver : colonne annulée) — il la mène lui-même : arrivée quand il est sur place
    if (this.takenOver || !st) {
      this.goSolo();
      return;
    }
    // la colonne roule dès que l'un de ses véhicules part : au départ échelonné, le véhicule de commandement ne part
    // qu'en dernier, une demi-minute après le premier fourgon (attendre la tête laissait « En route bientôt » affiché)
    if (this.convoyMoving()) {
      this.stage_ = 'route';
      this.setSirens(true);
      const d = this.dest!;
      this.objective(`En route en colonne : ${d.name}`, d.x, d.z, true);
      return;
    }
    if (st && (st.stage === 'debarquement' || st.stage === 'en_place')) {
      this.arrived();
      return;
    }
    this.embarkObjective();
  }

  private thinkRoute(): void {
    const ctx = this.ctx!;
    if (this.solo) {
      if (!this.waitingMoto && this.chiefWaitAt < 0 && this.chiefOf(this.companyId)) {
        // le chef de la BRAV-M descend de sa moto avant l'arrivée : elle s'arrête et l'attend (thinkChief), puis repart
        // avec lui — ou sans lui au bout de CHIEF_WAIT s, en lui laissant sa moto et son pilote
        const me0 = ctx.player.person();
        const moto = this.chiefMoto();
        const away = !!me0 && !!this.dest && Math.hypot(me0.x - this.dest.x, me0.z - this.dest.z) > BRAVM_PARKED;
        if (me0 && away && me0.vehicleId === 0 && moto && Math.hypot(moto.x - me0.x, moto.z - me0.z) < CHIEF_NEAR) {
          ctx.squads.issue(this.companyId, { type: 'cesser', issuedBy: 0 });
          this.chiefWaitAt = ctx.clock.now;
          this.stage_ = 'embarquement';
          this.thinkChief();
          return;
        }
      }
      // sans colonne de la compagnie : arrivé quand le joueur (ou le chef de son unité) est sur le point
      const d = this.dest;
      const me = ctx.player.person();
      const own = ctx.squads.get(this.companyId);
      const lead = own ? ctx.people.get(own.leaderId) : undefined;
      const near = (p: { x: number; z: number } | undefined | null): boolean => !!p && !!d && Math.hypot(p.x - d.x, p.z - d.z) < SOLO_ARRIVE;
      // BRAV-M : sa colonne s'arrête avant la foule, jamais dedans (police/command/bravm.ts) — à plus de SOLO_ARRIVE m du
      // point quand le rassemblement déborde : arrivée quand elle a rendu compte « en position » à proximité
      const command = ctx.service<CommandLike>('police.command');
      const sp = own && command && command.special ? command.special(own.id) : null;
      const parked = !!sp && !!d && sp.kind === 'bravm' && sp.stage === 'repos' && typeof sp.x === 'number' && typeof sp.z === 'number'
        && Math.hypot(sp.x - d.x, sp.z - d.z) < BRAVM_PARKED;
      // chef de la BRAV-M en selle sur la moto restée l'attendre, en chemin pour la rejoindre : la journée n'est pas
      // « sur place » tant qu'il roule encore — la BRAV-M arrivée sans lui l'y mettait, lui à plusieurs centaines de
      // mètres, sa moto jamais rendue à son binôme (thinkWaitingMoto la rend à l'arrivée : même pas de réflexion). Au
      // plus REJOIN_RIDE_MAX s après qu'il est monté : une moto arrêtée pour de bon ne retient pas la journée.
      const w = this.waitingMoto;
      const rejoining = !!w && w.riding && ctx.clock.now - w.rideAt < REJOIN_RIDE_MAX;
      // joueur en selle derrière son pilote sur une moto restée loin derrière la tête (retenue dans la circulation) : la
      // journée n'est pas « sur place » sans lui — la tête arrivée, elle l'y mettait à plus d'un kilomètre du point, encore
      // en chemin. Attendu LAG_WAIT s au plus après l'arrivée de la tête, jusqu'à ce qu'il soit à moins de LAG_NEAR m.
      if (!near(me) && (near(lead) || (parked && !rejoining))) {
        const ride = me && me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
        const pilot = ride && ride.seats[0] !== 0 && ride.seats[0] !== me!.id ? ctx.people.get(ride.seats[0]) : undefined;
        if (ride && d && pilot && pilot.faction === 'police' && ride.kind === 'moto_bravm' && Math.hypot(ride.x - d.x, ride.z - d.z) > LAG_NEAR) {
          if (this.lagAt < 0) this.lagAt = ctx.clock.now;
          if (ctx.clock.now - this.lagAt < LAG_WAIT) return;
        }
      }
      if (near(me) || near(lead) || (parked && !rejoining)) this.arrived();
      return;
    }
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    // colonne annulée en route par un ordre du joueur à toute la compagnie : il la mène, arrivée quand il est sur place
    // (elle n'est pas « sur place » là où elle s'est arrêtée)
    if (this.takenOver || !st) {
      this.goSolo();
      return;
    }
    if (st.stage !== 'debarquement' && st.stage !== 'en_place') return;
    // (colonne défaite en route — tête arrêtée pour de bon, chacun finit le trajet seul — : elle débarque dès que les
    // premiers sont garés, et le joueur passager était mis à pied là où roulait encore son fourgon, à deux cents mètres
    // comme à deux kilomètres du lieu, la journée « sur place ». Il reste à bord jusqu'à ce que son véhicule y soit.)
    const me = ctx.player.person();
    const ride = me && me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const d = this.dest;
    if (ride && d && ride.seats[0] !== me!.id && CONVOY_KINDS.has(ride.kind) && Math.hypot(ride.x - d.x, ride.z - d.z) > RIDE_NEAR
      && command && typeof command.holding === 'function' && command.holding(ride.id)) {
      const now = ctx.clock.now;
      if (this.rideWaitAt < 0) this.rideWaitAt = now;
      if (Math.abs(ride.speed) > 0.5) this.rideStillAt = -1;
      else if (this.rideStillAt < 0) this.rideStillAt = now;
      const walkable = Math.hypot(ride.x - d.x, ride.z - d.z) < RIDE_WALK && this.rideStillAt >= 0 && now - this.rideStillAt > RIDE_STILL;
      if (!walkable && now - this.rideWaitAt < RIDE_WAIT) return;
    }
    this.rideWaitAt = -1;
    this.rideStillAt = -1;
    this.arrived();
  }

  /** Plus de colonne de la compagnie (le joueur l'a reprise) : il s'y rend lui-même, arrivée à la distance. */
  private goSolo(): void {
    this.solo = true;
    this.stage_ = 'route';
    const d = this.dest;
    if (d) this.objective(`Rejoindre ${d.name}`, d.x, d.z, true);
  }

  /** Le joueur est-il le chef de cette BRAV-M (poste « Chef de la BRAV-M », en selle derrière son pilote) ? */
  private chiefOf(squadId: number): boolean {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const s = ctx.squads.get(squadId);
    return !!me && !!s && s.leaderId === me.id && me.poste === 'chef_groupe' && ctx.session.config?.role === 'bravm';
  }

  /** Moto du binôme du joueur (chef de la BRAV-M), ou celle laissée à l'attendre. */
  private chiefMoto(): Vehicle | null {
    const ctx = this.ctx!;
    if (this.waitingMoto) return ctx.vehicles.get(this.waitingMoto.motoId) ?? null;
    const me = ctx.player.person();
    const b = me && me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const v = b && b.vehicleId !== 0 ? ctx.vehicles.get(b.vehicleId) : undefined;
    return v && v.kind === 'moto_bravm' ? v : null;
  }

  /**
   * Chef de la BRAV-M à pied à l'ordre de mouvement (spécification §4.1.6) : la BRAV-M part avec lui dès qu'il est en
   * selle ; au bout de CHIEF_WAIT s, elle part sans lui, mais sa moto et son pilote restent et l'attendent (il n'est
   * jamais laissé seul au commissariat, sans personne à commander ni moyen de la rejoindre).
   */
  private thinkChief(): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const own = ctx.squads.get(this.companyId);
    const d = this.dest;
    if (!me || !own || !d) {
      this.chiefWaitAt = -1;
      return;
    }
    const moto = this.chiefMoto();
    const aboard = me.vehicleId !== 0 && ctx.vehicles.get(me.vehicleId)?.kind === 'moto_bravm';
    if (aboard || !moto) {
      this.chiefWaitAt = -1;
      ctx.squads.issue(own.id, { type: 'colonne', x: d.x, z: d.z, heading: d.heading, width: 0, issuedBy: 0 });
      this.stage_ = 'route';
      this.setSirens(true);
      this.objective(`En selle, en tête de la BRAV-M : ${d.name}`, d.x, d.z, true);
      return;
    }
    if (ctx.clock.now - this.chiefWaitAt < CHIEF_WAIT) {
      this.objective('Montez sur votre moto (E) — la BRAV-M part avec vous', moto.x, moto.z, true);
      return;
    }
    // elle part : sa moto et son pilote restent (la moto sort de la BRAV-M le temps qu'il monte, voir thinkWaitingMoto)
    this.chiefWaitAt = -1;
    const b = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    if (b && b.vehicleId === moto.id) {
      this.waitingMoto = { binomeId: b.id, motoId: moto.id, riding: false, driveAt: 0, rideAt: 0 };
      b.vehicleId = 0;
    }
    ctx.squads.issue(own.id, { type: 'colonne', x: d.x, z: d.z, heading: d.heading, width: 0, issuedBy: 0 });
    ctx.radio.say({ channel: 'commandement', from: own.name, priority: 1,
      text: `${own.name} : on fait mouvement sur ${d.name}. Votre moto et son pilote vous attendent. TERMINÉ.` });
    this.stage_ = 'route';
    this.waitObjective(me, moto);
  }

  /** « Votre moto vous attend — 12 m », repère sur la moto. */
  private waitObjective(me: Person, moto: Vehicle): void {
    this.objective(`Votre moto vous attend — ${Math.round(Math.hypot(moto.x - me.x, moto.z - me.z))} m`, moto.x, moto.z, true);
  }

  /**
   * Le chef de la BRAV-M monte sur la moto qui l'attendait : son pilote l'emmène rejoindre la BRAV-M, deux tons, à la
   * zone de stationnement ; la moto reprend sa place dans la BRAV-M quand ils l'ont rejointe (avant, la colonne de motos,
   * deux kilomètres devant, l'aurait mise en file derrière sa dernière moto, et elle ne roulait pas).
   */
  private thinkWaitingMoto(): void {
    const ctx = this.ctx!;
    const w = this.waitingMoto;
    const me = ctx.player.person();
    const d = this.dest;
    if (!w || !me || !d) return;
    const moto = ctx.vehicles.get(w.motoId);
    const b = ctx.squads.get(w.binomeId);
    if (!moto || !b) {
      this.waitingMoto = null;
      return;
    }
    if (!w.riding) {
      if (me.vehicleId !== moto.id) {
        this.waitObjective(me, moto);
        return;
      }
      w.riding = true;
      w.driveAt = ctx.clock.now;
      w.rideAt = ctx.clock.now;
      const ap = ctx.service<{ driveTo(v: Vehicle, x: number, z: number, o?: { urgence?: boolean }): boolean }>('vehicles.autopilot');
      if (ap && moto.seats[0] !== 0 && moto.seats[0] !== me.id) ap.driveTo(moto, d.x, d.z, { urgence: true });
      const ext = ctx.service<VehiclesExt>('vehicles.ext');
      if (moto.def.hasSiren && ext && ext.setSiren) ext.setSiren(moto, 1);
      this.objective(`En selle avec la BRAV-M : ${d.name}`, d.x, d.z, true);
      return;
    }
    // la zone de stationnement atteinte, ou la BRAV-M arrêtée sur place et rejointe (sa tête à moins de REJOIN_BRAVM m) :
    // la moto lui est rendue
    const command = ctx.service<CommandLike>('police.command');
    const sp = command && command.special ? command.special(this.companyId) : null;
    const rejoined = !!sp && sp.stage === 'repos' && typeof sp.x === 'number' && typeof sp.z === 'number'
      && Math.hypot(sp.x - moto.x, sp.z - moto.z) < REJOIN_BRAVM;
    if (rejoined || Math.hypot(moto.x - d.x, moto.z - d.z) < SOLO_ARRIVE) {
      this.giveMotoBack();
      return;
    }
    // (pilote automatique arrêté en chemin : il repart, au plus toutes les REDRIVE s)
    const ap = ctx.service<{ isActive?(v: Vehicle): boolean; driveTo(v: Vehicle, x: number, z: number, o?: { urgence?: boolean }): boolean }>('vehicles.autopilot');
    if (ap && ap.isActive && !ap.isActive(moto) && ctx.clock.now - w.driveAt > REDRIVE && moto.seats[0] !== 0 && moto.seats[0] !== me.id) {
      w.driveAt = ctx.clock.now;
      ap.driveTo(moto, d.x, d.z, { urgence: true });
    }
  }

  /** La moto laissée au chef reprend sa place dans son binôme (la BRAV-M la commande de nouveau). */
  private giveMotoBack(): void {
    const ctx = this.ctx!;
    const w = this.waitingMoto;
    this.waitingMoto = null;
    if (!w) return;
    const b = ctx.squads.get(w.binomeId);
    if (b && ctx.vehicles.get(w.motoId)) b.vehicleId = w.motoId;
  }

  /** Arrivée : sirènes coupées, le joueur passager descend avec son groupe, le commandement prend la main. */
  private arrived(): void {
    const ctx = this.ctx!;
    this.lagAt = -1;
    this.setSirens(false);
    const me = ctx.player.person();
    if (me && me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      // passager d'un véhicule de la colonne : il descend avec les autres
      if (v && v.seats[0] !== me.id && CONVOY_KINDS.has(v.kind)) ctx.vehicles.exit(me);
    }
    this.stage_ = 'sur_place';
    this.arrivedAt = ctx.clock.now;
    this.rejoinDone = false;
    this.clearObjective();
    // (colonne arrêtée avant le point — arrêt court, rue fermée : police/command/convoy.ts shortPark — : on ne se dit pas
    // « sur place » à trois cents mètres du lieu)
    let short = 0;
    if (this.dest && !this.solo) {
      // (distance au lieu du véhicule de la compagnie qui en est le plus près — pas celle du joueur, resté à la base
      // quand la colonne est partie sans lui)
      short = Infinity;
      for (const s of ctx.squads.list) {
        if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
        const v = ctx.vehicles.get(s.vehicleId);
        if (v && CONVOY_KINDS.has(v.kind)) short = Math.min(short, Math.hypot(v.x - this.dest.x, v.z - this.dest.z));
      }
      if (short === Infinity) short = 0;
    }
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: short > RIDE_NEAR
        ? `CENTRAL de ${this.companyName()}. Colonne arrêtée à ${Math.round(short / 10) * 10} mètres de ${this.dest!.name}. On débarque ici et on finit à pied.`
        : `CENTRAL de ${this.companyName()}. Sur place, ${this.dest ? this.dest.name : 'zone de stationnement'}. On débarque et on se met en place.` });
  }

  private thinkOnSite(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    this.thinkRejoin(st);
    if (st && (st.stage === 'rembarquement' || st.stage === 'depart')) {
      this.engageOthers(this.base.x, this.base.z, 0, true);
      this.stage_ = 'rembarquement';
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `${this.companyName()}, fin de mission reçue. Rembarquez, retour ${this.atBase()}.` });
    }
  }

  private thinkReturn(now: number): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    const me = ctx.player.person();
    if (this.stage_ === 'rembarquement') {
      if (me && me.vehicleId === 0) {
        const v = this.seatFor(me);
        if (v) this.objective(`Rembarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
      } else this.clearObjective();
      if (st && st.stage === 'depart') {
        this.stage_ = 'retour';
        this.setSirens(false);
        this.objective(`Retour : ${this.base.name}`, this.base.x, this.base.z, true);
      }
      return;
    }
    // retour : la colonne (ou le joueur) arrive à la caserne ; filet de sécurité : la journée ne reste pas bloquée
    if (this.returnAt === 0) this.returnAt = now;
    const lead = this.convoyLead();
    const atBase = (lead && Math.hypot(lead.x - this.base.x, lead.z - this.base.z) < BASE_RADIUS && Math.abs(lead.speed) < 0.5)
      || (st && st.stage === 'parti' && me && Math.hypot(me.x - this.base.x, me.z - this.base.z) < BASE_RADIUS * 2)
      || now - this.returnAt > RETURN_MAX;
    if (atBase && !this.mission && !this.secondDone && this.wantSecond()) {
      // la journée continue : la salle engage la compagnie sur une seconde intervention, ailleurs dans Paris
      this.secondDone = true;
      if (this.startIntervention(now)) return;
    }
    if (atBase) {
      this.stage_ = 'fin';
      this.endAt = now + DEBRIEF_DELAY;
      this.clearObjective();
      ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 2, text: `CENTRAL de ${this.companyName()}. Retour ${this.atBase()}, fin de service. Rien à signaler de plus.` });
      ctx.ui.notify('Fin de service : compte rendu dans quelques secondes.', 'ok', 6);
    }
  }

  /**
   * Arrivée de la colonne (spécification §3.3) : les unités que le joueur commande ne restent jamais à « débarquer » —
   * une fois descendues, elles le suivent de nouveau (« AVEC VOUS », posture « en garde » quand il s'arrête : P2), comme
   * à la mise en place. Seules celles qui tiennent l'ordre de la colonne (« débarquez », embarquement, mise en colonne
   * de l'IA) le reçoivent : un ordre donné par le joueur pendant l'arrivée n'est jamais remplacé, et l'ordre part de la
   * plus haute qui le tient (la compagnie entière quand c'est elle, son état-major compris). Il ne part qu'une fois le
   * débarquement commencé : pendant le stationnement, la colonne redonnerait son « débarquez » (convoy.ts,
   * beginDisembark) ; au plus tard REJOIN_LATE s après l'arrivée (les agents encore assis descendent d'abord, P2).
   */
  private thinkRejoin(st: { stage: string } | null): void {
    const ctx = this.ctx!;
    if (this.rejoinDone || this.arrivedAt < 0) return;
    const now = ctx.clock.now;
    if (now - this.arrivedAt > REJOIN_WATCH) {
      this.rejoinDone = true;
      return;
    }
    const me = ctx.player.person();
    // (le joueur encore au volant : ses unités le suivront quand il descendra, session/follow.ts)
    if (!me || me.faction !== 'police' || me.vehicleId !== 0) return;
    // (resté ailleurs — la colonne est partie sans lui : elle se met en place là-bas, il la rejoint)
    if (!this.dest || Math.hypot(me.x - this.dest.x, me.z - this.dest.z) > REJOIN_NEAR) {
      this.rejoinDone = true;
      return;
    }
    const parking = !!st && (st.stage === 'route' || st.stage === 'stationnement');
    if (parking && now - this.arrivedAt < REJOIN_LATE) return;
    const led = new Set<number>();
    for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === me.id) led.add(s.id);
    if (led.size === 0) {
      this.rejoinDone = true;
      return;
    }
    const under = (s: { id: number; parentId: number }): boolean => {
      for (let q: { id: number; parentId: number } | undefined = s, g = 0; q && g < 9; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, g++) {
        if (led.has(q.id)) return true;
      }
      return false;
    };
    // ordre de la colonne ou de l'IA, jamais celui du joueur
    const internal = (o: { type: string; byPlayer?: boolean }): boolean => !o.byPlayer && (o.type === 'debarquer' || o.type === 'embarquer' || o.type === 'colonne');
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || !under(s) || !internal(s.order)) continue;
      const parent = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
      // (l'unité mère le tient aussi et est sous ses ordres : c'est elle qui le reçoit)
      if (parent && under(parent) && internal(parent.order)) continue;
      // (équipages : le fourgon cellulaire reste au point de remise des interpellés, l'engin à son poste)
      if (s.kind === 'equipage') continue;
      ctx.squads.issue(s.id, { type: 'suivre', targetId: me.id, issuedBy: me.id });
    }
    // la colonne a fini de débarquer : la surveillance continue un moment (un fourgon qui finissait de se garer), puis
    // s'arrête
    if (!st || (st.stage !== 'route' && st.stage !== 'stationnement' && st.stage !== 'debarquement')) {
      if (now - this.arrivedAt > REJOIN_LATE) this.rejoinDone = true;
    }
  }

  /** Secondes avant la fin de l'attente en cours (voir JourneeApi.readyIn). */
  private readyIn(): number {
    const ctx = this.ctx;
    if (!ctx || this.stage_ === 'inactif') return 0;
    const command = ctx.service<CommandLike>('police.command');
    const st = command && this.companyId !== 0 ? command.convoyOf(this.companyId) : null;
    if (this.chiefWaitAt >= 0) return Math.max(0, Math.ceil(CHIEF_WAIT - (ctx.clock.now - this.chiefWaitAt)));
    if (!st) return 0;
    switch (st.stage) {
      case 'route':
      case 'depart':
        if (this.stage_ === 'embarquement' || this.stage_ === 'rembarquement') {
          if (st.awaitingPlayer) return -1;
          return Math.max(0, Math.ceil(st.departIn ?? 0));
        }
        return Math.max(0, Math.ceil((st.remaining ?? 0) / ROUTE_SPEED));
      case 'rembarquement':
        return st.awaitingPlayer ? -1 : Math.max(0, Math.ceil(st.departIn ?? 0));
      case 'stationnement':
        return PARK_ETA;
      case 'debarquement': {
        // une sortie par véhicule tous les 0,35 s, tous les véhicules à la fois (P2) : le plus chargé décide
        let most = 0;
        for (const s of ctx.squads.list) {
          if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
          const v = ctx.vehicles.get(s.vehicleId);
          if (!v || !CONVOY_KINDS.has(v.kind)) continue;
          let n = 0;
          for (let i = 1; i < v.seats.length; i++) if (v.seats[i] !== 0 && !ctx.people.get(v.seats[i]!)?.isPlayer) n++;
          if (n > most) most = n;
        }
        return most > 0 ? Math.min(PARK_ETA, Math.ceil(most * 0.35 + 1)) : 0;
      }
      default:
        return 0;
    }
  }

  // ───────────────────────────── seconde intervention ─────────────────────────────

  /** Seconde intervention pour une journée normale ou longue (une journée courte s'arrête après la manifestation). */
  private wantSecond(): boolean {
    const d = this.ctx!.session.config?.duration;
    return d !== 'courte';
  }

  /**
   * Feux de véhicules et de conteneurs dans un autre quartier : la salle engage les pompiers et la compagnie, qui s'y
   * porte en colonne et tient un cordon autour des feux le temps de l'extinction.
   */
  private startIntervention(now: number): boolean {
    const ctx = this.ctx!;
    const rand = this.rng!;
    const command = ctx.service<CommandLike>('police.command');
    if (!command) return false;
    const b = ctx.world.bounds;
    for (let attempt = 0; attempt < 80; attempt++) {
      const a = rand() * Math.PI * 2;
      const d = 600 + rand() * 1000;
      const x = this.base.x + Math.cos(a) * d;
      const z = this.base.z + Math.sin(a) * d;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      // une rue où l'on peut garer des voitures le long du trottoir et faire passer la colonne (6 m au moins)
      if (!ctx.world.nearestRoad(x, z, this.road, 80) || this.road.width < 6) continue;
      const h = this.road.heading;
      const rx = Math.cos(h), rz = -Math.sin(h);
      const curb = Math.max(1.2, this.road.width * 0.5 - 1.1);
      const fx = this.road.x, fz = this.road.z;
      const street = this.road.name || ctx.world.sectorName(fx, fz) || 'en ville';
      // zone de stationnement : 45 m en amont, côté caserne
      const ux = fx - this.base.x, uz = fz - this.base.z;
      const ul = Math.hypot(ux, uz) || 1;
      const sx = fx - (ux / ul) * 45, sz = fz - (uz / ul) * 45;
      if (!ctx.world.nearestRoad(sx, sz, this.road, 40)) continue;
      const stand = { x: this.road.x, z: this.road.z, heading: Math.atan2(fx - this.road.x, fz - this.road.z) };
      // deux voitures en feu le long du trottoir, deux conteneurs
      this.fires.length = 0;
      const kinds = ['citadine', 'voiture'] as const;
      for (let i = 0; i < 2; i++) {
        const along = (i === 0 ? -4 : 4);
        const vx = fx + rx * curb + Math.sin(h) * along, vz = fz + rz * curb + Math.cos(h) * along;
        if (!ctx.world.isFree(vx, vz, 1.0)) continue;
        const v = ctx.vehicles.spawn(kinds[i]!, vx, vz, h);
        ctx.vehicles.damage(v, { amount: 30, kind: 'burn', sourceId: 0, x: vx, z: vz });
        this.fires.push({ x: vx, z: vz, vehicleId: v.id });
      }
      for (let i = 0; i < 2; i++) {
        const px = fx - rx * curb + Math.sin(h) * (i === 0 ? -2 : 6), pz = fz - rz * curb + Math.cos(h) * (i === 0 ? -2 : 6);
        if (!ctx.world.isFree(px, pz, 0.8)) continue;
        const prop = ctx.props.spawn('conteneur', px, pz, h);
        ctx.props.damage(prop, 1000, 'burn', 0);
        ctx.hazards.ignite(px, pz, 1.6, 0.9, 0);
        this.fires.push({ x: px, z: pz, vehicleId: 0 });
      }
      if (this.fires.length === 0) continue;
      this.site = { x: fx, z: fz, name: street };
      this.dest = { x: stand.x, z: stand.z, heading: stand.heading, name: street };
      this.returnAt = 0;
      this.interventionAt = now;
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
        text: `${this.companyName()} de CENTRAL. Changement de mission : véhicules et conteneurs en feu, ${street}. Portez-vous sur place et sécurisez le périmètre pour les sapeurs-pompiers. Deux tons.` });
      // la salle engage les pompiers
      const rescue = ctx.service<{ request(kind: 'pompiers' | 'samu', x: number, z: number, byId: number): unknown }>(EXT.rescue);
      if (rescue) rescue.request('pompiers', fx, fz, 0);
      command.arrive(this.companyId, { x: stand.x, z: stand.z, heading: stand.heading, layout: 'file', boardFirst: true });
      this.stage_ = 'intervention_route';
      this.objective(`Intervention : feux, ${street}`, fx, fz, true);
      return true;
    }
    return false;
  }

  private thinkInterventionRoute(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    const lead = this.convoyLead();
    if (lead && Math.abs(lead.speed) > 1.2) this.setSirens(true);
    const me = ctx.player.person();
    if (me && me.vehicleId === 0 && st && st.stage === 'route' && !(lead && Math.abs(lead.speed) > 1.2)) {
      const v = this.seatFor(me);
      if (v) this.objective(`Embarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
    } else if (this.site) {
      this.objective(`Intervention : feux, ${this.site.name}`, this.site.x, this.site.z, true);
    }
    // sur place : la colonne débarque PRÈS du site (et non un ancien état du convoi), ou délai de garde dépassé
    const site = this.site!;
    const close = lead ? Math.hypot(lead.x - site.x, lead.z - site.z) < 160 : true;
    const late = ctx.clock.now - this.interventionAt > 900;
    if (!st || ((st.stage === 'debarquement' || st.stage === 'en_place') && close) || late) this.onIntervention();
  }

  /** Sur place : le joueur passager descend, la compagnie forme un cordon autour des feux. */
  private onIntervention(): void {
    const ctx = this.ctx!;
    this.setSirens(false);
    const me = ctx.player.person();
    if (me && me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      if (v && v.seats[0] !== me.id && CONVOY_KINDS.has(v.kind)) ctx.vehicles.exit(me);
    }
    const site = this.site!;
    const company = ctx.squads.get(this.companyId);
    if (company) {
      ctx.squads.issue(company.id, { type: 'proteger', x: site.x, z: site.z, heading: this.dest ? this.dest.heading : 0, width: 36, issuedBy: company.leaderId });
    }
    this.stage_ = 'intervention';
    this.onSiteAt = ctx.clock.now;
    this.objective(`Sécurisez le périmètre pour les pompiers : ${site.name}`, site.x, site.z, true);
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: `CENTRAL de ${this.companyName()}. Sur place, ${site.name}. Périmètre en cours, j'attends les sapeurs-pompiers.` });
  }

  /** Feux éteints (ou sept minutes écoulées) : fin d'intervention, rembarquement, retour à la caserne. */
  private thinkIntervention(now: number): void {
    const ctx = this.ctx!;
    let burning = 0;
    for (const f of this.fires) {
      const v = f.vehicleId !== 0 ? ctx.vehicles.get(f.vehicleId) : undefined;
      if (v && v.state === 'burning') burning++;
      else if (!v && ctx.hazards.fireAt(f.x, f.z) > 0.05) burning++;
    }
    // le périmètre est tenu au moins une minute et demie, et jusqu'à l'extinction (sept minutes au plus)
    if (now - this.onSiteAt < 90) return;
    if (burning > 0 && now - this.onSiteAt < INTERVENTION_MAX) return;
    const command = ctx.service<CommandLike>('police.command');
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: burning > 0 ? `CENTRAL de ${this.companyName()}. Les sapeurs-pompiers tiennent le feu, on lève le périmètre. Retour ${this.atBase()}.`
        : `CENTRAL de ${this.companyName()}. Feux éteints, fin d'intervention. Retour ${this.atBase()}.` });
    this.stage_ = 'rembarquement';
    if (!command || !command.depart(this.companyId, { x: this.base.x, z: this.base.z })) {
      this.stage_ = 'retour';
      this.objective(`Retour : ${this.base.name}`, this.base.x, this.base.z, true);
    }
  }

  // ───────────────────────────── la ville vit ─────────────────────────────

  /** Feux de poubelles et de conteneurs dans d'autres quartiers : la radio les signale, les incidents les suivent. */
  private cityLife(now: number): void {
    if (now < this.nextCity || this.cityCount >= CITY_MAX || this.stage_ === 'fin') return;
    const ctx = this.ctx!;
    const rand = this.rng!;
    this.nextCity = now + CITY_EVERY_MIN + rand() * (CITY_EVERY_MAX - CITY_EVERY_MIN);
    const me = ctx.player.person();
    const ox = me ? me.x : this.base.x;
    const oz = me ? me.z : this.base.z;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rand() * Math.PI * 2;
      const d = CITY_MIN_DIST + rand() * (CITY_MAX_DIST - CITY_MIN_DIST);
      const x = ox + Math.cos(a) * d;
      const z = oz + Math.sin(a) * d;
      const b = ctx.world.bounds;
      if (x < b.minX + 50 || x > b.maxX - 50 || z < b.minZ + 50 || z > b.maxZ - 50) continue;
      if (!ctx.world.nearestRoad(x, z, this.road, 60) || this.road.width < 5) continue;
      // au bord de la chaussée (côté trottoir)
      const h = this.road.heading;
      const side = this.road.width * 0.5 + 1.2;
      const px = this.road.x + Math.cos(h) * side;
      const pz = this.road.z - Math.sin(h) * side;
      if (!ctx.world.isFree(px, pz, 0.8)) continue;
      const kind = rand() < 0.6 ? 'poubelle' : 'conteneur';
      const prop = ctx.props.spawn(kind, px, pz, h);
      ctx.props.damage(prop, 1000, 'burn', 0);
      ctx.hazards.ignite(px, pz, kind === 'conteneur' ? 1.6 : 1.0, 0.8, 0);
      this.cityCount++;
      const street = this.road.name || ctx.world.sectorName(px, pz) || 'en ville';
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1,
        text: `À tous de CENTRAL : feu de ${kind === 'poubelle' ? 'poubelles' : 'conteneur'}, ${street}. Pompiers engagés.` });
      return;
    }
  }

  // ───────────────────────────── aides ─────────────────────────────

  /**
   * À la caserne, les véhicules de la compagnie sont rangés en FILE le long du début de l'itinéraire, nez vers la
   * sortie, le véhicule de commandement en tête et le cellulaire en serre-file : la colonne part sans manœuvre.
   * (Garés en bloc sur le parvis, ils s'enfermaient les uns les autres.)
   */
  private lineUp(tx: number, tz: number, companyId = this.companyId): void {
    const ctx = this.ctx!;
    const list: Vehicle[] = [];
    const idle: Vehicle[] = [];
    // l'engin du joueur (Centaure, canon à eau) reste à côté de lui, où la mise en place l'a garé : rangé dans la file
    // de son escorte, il partait à près de 80 m
    const me = ctx.player.person();
    const own = me && me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const ownEngine = own && own.leaderId === me!.id ? own.vehicleId : 0;
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind) || v.def.flying || list.indexOf(v) >= 0 || idle.indexOf(v) >= 0 || Math.abs(v.speed) >= 0.2) continue;
      if (v.id === ownEngine && (v.kind === 'centaure' || v.kind === 'canon_eau')) continue;
      // (un véhicule sans conducteur — fourgon cellulaire sans équipage — ne part pas : il est rangé hors de la file)
      if (v.seats[0] !== 0) list.push(v);
      else idle.push(v);
    }
    if (list.length === 0) return;
    const rank = (v: Vehicle): number => (v.kind === 'vl_commandement' ? 0 : v.kind === 'fourgon_cellulaire' ? 3 : v.kind === 'fourgon_crs' || v.kind === 'car_crs' ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    // itinéraire calculé comme celui que la colonne roulera (police/command/convoy.ts, departRoute ; pilote automatique) :
    // foule contournée, contresens au pas permis en urgence, chaussée assez large — le plus court chemin brut partait
    // parfois à l'opposé (commissariat du 8e : file rangée le long d'une rue que la colonne ne prend pas, VL tourné dos à
    // l'itinéraire réel)
    const width = list.reduce((w, v) => Math.max(w, v.def.width), 0);
    const path: number[] = [];
    let ok = false;
    try {
      ok = ctx.world.findPath(cx, cz, tx, tz, 'vehicle', path, { heading: NaN, uturn: 0, avoid: crowdZones(ctx), contraflow: 3, minWidth: width + 1.2 })
        && path.length >= 4;
    } catch { ok = false; }
    if (!ok) return;
    const p = { x: 0, z: 0 };
    const moving = new Set<Vehicle>([...list, ...idle]);
    const near: Vehicle[] = [];
    const props: Prop[] = [];
    const road = this.road;
    // place libre pour un véhicule : sans mur ni objet, sur la chaussée, à l'écart des autres véhicules (sauf ceux qu'on
    // range, pas encore placés)
    const placed = new Set<Vehicle>();
    const free = (v: Vehicle, x: number, z: number, h: number): boolean => {
      const hw = v.def.width * 0.5, hl = v.def.length * 0.5;
      const fx = Math.sin(h), fz = Math.cos(h);
      for (const k of [-1, 0, 1]) {
        if (!ctx.world.isFree(x + fx * k * (hl - hw), z + fz * k * (hl - hw), hw + 0.15)) return false;
        const sf = ctx.world.surfaceAt(x + fx * k * hl, z + fz * k * hl);
        if (sf !== 'road' && sf !== 'bridge' && sf !== 'sett' && sf !== 'plaza' && sf !== 'quay' && sf !== 'void') return false;
      }
      // personne dans l'emprise de la caisse (la file longe l'itinéraire, qui passe souvent par l'emplacement de la
      // compagnie : un fourgon était posé SUR le joueur)
      if (ctx.people.countIn(x, z, hl + 0.6, (q) => q.vehicleId === 0
        && Math.abs((q.x - x) * fx + (q.z - z) * fz) < hl + 0.4 && Math.abs((q.x - x) * fz - (q.z - z) * fx) < hw + 0.4) > 0) return false;
      const n = ctx.vehicles.queryRadius(x, z, hl + 6, near);
      for (let i = 0; i < n; i++) {
        const o = near[i]!;
        if (o === v || (moving.has(o) && !placed.has(o))) continue;
        if (Math.hypot(o.x - x, o.z - z) < hl + o.def.length * 0.5 + 1.2) return false;
      }
      const np = ctx.props.queryRadius(x, z, hl + 2, props);
      for (let i = 0; i < np; i++) {
        const q = props[i]!;
        if (!q.blocksMove || q.state === 'broken' || q.carriedBy !== 0) continue;
        const r = Math.max(q.halfX, q.halfZ);
        const along = (q.x - x) * fx + (q.z - z) * fz;
        const lat = (q.x - x) * fz - (q.z - z) * fx;
        if (Math.abs(along) < hl + r + 0.3 && Math.abs(lat) < hw + r + 0.3) return false;
      }
      return true;
    };
    const put = (v: Vehicle, x: number, z: number, h: number): void => {
      v.x = x;
      v.z = z;
      v.heading = h;
      v.vx = 0;
      v.vz = 0;
      v.speed = 0;
      placed.add(v);
    };
    // du serre-file (le plus près du départ) à la tête (la plus avancée sur l'itinéraire), à droite de l'axe si possible
    let s = 6;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      let done = false;
      for (let tries = 0; tries < 10 && !done; tries++) {
        s += v.def.length * 0.5;
        const h = pointOnPolyline(path, s, p);
        const rx = Math.cos(h), rz = -Math.sin(h);
        const half = ctx.world.nearestRoad(p.x, p.z, road, 20) ? road.width * 0.5 : 4;
        const side = Math.max(0, Math.min(2.2, half - v.def.width * 0.5 - 0.6));
        for (const off of [side, side * 0.5, 0, -side * 0.5]) {
          const x = p.x + rx * off, z = p.z + rz * off;
          if (!free(v, x, z, h)) continue;
          put(v, x, z, h);
          done = true;
          break;
        }
        s += v.def.length * 0.5 + (done ? 4 : 2);
      }
    }
    // véhicules sans conducteur : hors de la file, derrière le serre-file (ils ne barrent pas la sortie)
    if (idle.length > 0) {
      const h0 = Math.atan2(path[2]! - path[0]!, path[3]! - path[1]!);
      const bx = -Math.sin(h0), bz = -Math.cos(h0);
      const rx = Math.cos(h0), rz = -Math.sin(h0);
      let back = 8;
      for (const v of idle) {
        let done = false;
        for (let tries = 0; tries < 12 && !done; tries++) {
          back += v.def.length * 0.5;
          for (const off of [2, 0, -2]) {
            const x = path[0]! + bx * back + rx * off, z = path[1]! + bz * back + rz * off;
            if (!free(v, x, z, h0)) continue;
            put(v, x, z, h0);
            done = true;
            break;
          }
          back += v.def.length * 0.5 + 2;
        }
      }
    }
  }

  /** Véhicule de tête de la colonne de la compagnie (véhicule de commandement, sinon un fourgon de la compagnie). */
  private convoyLead(): Vehicle | null {
    const ctx = this.ctx!;
    const company = ctx.squads.get(this.companyId);
    if (company && company.vehicleId !== 0) {
      const v = ctx.vehicles.get(company.vehicleId);
      if (v) return v;
    }
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && CONVOY_KINDS.has(v.kind)) return v;
    }
    return null;
  }

  /** Un véhicule de la colonne de la compagnie, conduit par l'IA, roule-t-il ? */
  private convoyMoving(): boolean {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const lead = this.convoyLead();
    if (lead && Math.abs(lead.speed) > 1.2) return true;
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind) || v.def.flying || v.seats[0] === 0 || (me && v.seats[0] === me.id)) continue;
      if (Math.abs(v.speed) > 1.2) return true;
    }
    return false;
  }

  /** Véhicule où le joueur doit monter : celui de son groupe s'il y reste une place, sinon un véhicule de la compagnie. */
  private seatFor(me: Person): Vehicle | null {
    const ctx = this.ctx!;
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    // une place libre dans un véhicule qui a son conducteur (sans conducteur, il ne partira pas avec la colonne)
    const free = (v: Vehicle): boolean => {
      if (v.seats[0] === 0) return false;
      for (let i = 1; i < v.seats.length; i++) if (v.seats[i] === 0) return true;
      return false;
    };
    if (own && own.vehicleId !== 0) {
      const v = ctx.vehicles.get(own.vehicleId);
      // le véhicule de sa propre unité, même volant vide : l'engin du canon à eau dont il est le conducteur, la voiture
      // de l'équipe du drone (il prend le volant, ou le commandement y assoit un équipier). Exiger un conducteur envoyait
      // l'opérateur du canon dans un fourgon de CRS et le télépilote à pied jusqu'à la manifestation.
      if (v && (free(v) || (v.seats[0] === 0 && !v.def.flying))) return v;
    }
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      // (un Centaure, un canon à eau n'emportent que leur équipage : jamais un CRS à pied)
      if (!v || !CONVOY_KINDS.has(v.kind) || ENGINE_KINDS.has(v.kind) || !free(v)) continue;
      const d = Math.hypot(v.x - me.x, v.z - me.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  /** « fourgon de CRS MISTRAL 1 BRAVO » (seule l'initiale passe en minuscule : les sigles restent). */
  private vehicleLabel(v: Vehicle): string {
    const ctx = this.ctx!;
    const name = v.def.name.charAt(0).toLowerCase() + v.def.name.slice(1);
    for (const s of ctx.squads.list) if (s.vehicleId === v.id) return `${name} ${s.name}`;
    return name;
  }

  /** Sirènes et gyrophares de toute la colonne. */
  private setSirens(on: boolean): void {
    const ctx = this.ctx!;
    if (this.sirensOn === on) return;
    this.sirensOn = on;
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind)) continue;
      if (v.def.hasSiren) {
        if (ext && ext.setSiren) ext.setSiren(v, on ? 1 : 0);
        else v.siren = on ? 1 : 0;
      }
      if (v.def.hasBeacons) {
        if (ext && ext.setBeacons) ext.setBeacons(v, on);
        else v.beacons = on;
      }
    }
  }

  private place(x: number, z: number): string {
    const world = this.ctx!.world;
    if (world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 40) && this.road.name) return this.road.name;
    return world.sectorName(x, z) || 'le point indiqué';
  }

  private objective(text: string, x: number, z: number, track: boolean): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const o: Objective = { id: JOURNEE_OBJECTIVE_ID, text, state: 'actif', secondary: false, x, z };
    const cur = api.list.find((q) => q.id === JOURNEE_OBJECTIVE_ID);
    if (!cur || cur.text !== text || cur.x !== x || cur.z !== z) api.upsert(o);
    if (track && api.tracked !== JOURNEE_OBJECTIVE_ID) api.tracked = JOURNEE_OBJECTIVE_ID;
  }

  private clearObjective(): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    if (api.list.some((q) => q.id === JOURNEE_OBJECTIVE_ID)) api.remove(JOURNEE_OBJECTIVE_ID);
    if (api.tracked === JOURNEE_OBJECTIVE_ID) api.tracked = '';
  }
}
