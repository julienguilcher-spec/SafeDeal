/* =====================================================================================
 * MISE EN PLACE DE SESSION — système de simulation (ordre RULES − 100), sans DOM ni rendu.
 *
 * Sur 'session:started', d'après ctx.session.config :
 *   1. choisit l'emplacement de départ autour du lieu (placement.ts) ;
 *   2. crée les véhicules stationnés de l'unité, puis le joueur et ses collègues (roster.ts), immobiles
 *      en ligne — ou confie la construction au service 'police.units' quand il est branché ;
 *   3. incarne le joueur (ctx.player.possess) et règle la caméra ;
 *   4. pose quelques passants alentour ;
 *   5. applique les réglages de scénario qui passent par des services (vent, circulation, métro).
 * L'avancement est annoncé par l'événement libre 'ui:loading' { progress, label }.
 *
 * Ce module tient lieu de cadre de mission en attendant le vrai : il ne crée AUCUNE foule et ne
 * pilote personne. Quand le module de police est branché (service 'police.units'), c'est lui qui
 * construit les unités — compagnie, sections, moyens d'appui de la rubrique « Moyens engagés » — et
 * son IA qui les fait manœuvrer ; sinon les collègues sont créés directement et restent en place.
 *
 * Quand une manifestation se tient au lieu choisi, les forces de l'ordre sont placées À L'ÉCART :
 * hors du rassemblement et du couloir du parcours, à une centaine de mètres, face au lieu.
 *
 * Rôle 'patrouille' (équipage d'une voiture de BAC ou de Police secours) : le joueur part À BORD de sa voiture, garée
 * au bord de la chaussée, ses deux collègues avec lui (equipage.ts) ; service 'session.equipage'.
 *
 * « Tout le monde me suit, c'est obligatoire » : au départ, chaque unité que le joueur commande le suit — commandant et
 * commissaire compris (toute la compagnie, BRAV-M, engins et fourgons cellulaires compris), chef de section (toute sa
 * section), chef de groupe, chef de bord d'engin. La BRAV-M est rattachée à la compagnie (pas en journée de service : elle
 * part de son propre commissariat, en colonne de motos). Les fourgons cellulaires sont engagés avec leur équipage
 * au point de remise des interpellés (remise.ts, service 'session.remise').
 * ===================================================================================== */

import type {
  CameraMode, EntityId, GameContext, GameSystem, Person, PersonKind, PoliceRank, RayHit, SessionConfig, Squad, Unsubscribe, Vec2, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { getCore } from '@/core/context';
import { pointOnPolyline, wrapAngle } from '@/core/math';
import { EXT } from '@/core/extensions';
import type { MetroApi, TrafficControlApi } from '@/core/extensions';
import type { RenderCameraApi } from '@/render/base/api';
import type { SpawnHelperApi } from '@/sim/roles/archetypes/api';
import {
  SCENARIO_AREA_RADIUS, SESSION_SETUP_EVENT, SESSION_SETUP_SERVICE, SESSION_SETUP_SYSTEM_ID, UI_LOADING_EVENT,
} from './api';
import type {
  EngagedMeans, LoadingProgress, PoliceCommandLike, PoliceUnitHandleLike, PoliceUnitsLike, SessionSetupApi, SessionSetupSummary,
} from './api';
import { FILE_SPACING, RANK_DEPTH, chooseStand, chooseStandOffCrowd, hasWayOut, parkingSpot, roadSpot, settle, supportSpot } from './placement';
import type { Stand } from './placement';
import { castFor, isPoliceRole, meansOf, rankOf } from './roster';
import { EQUIPAGE_SERVICE, buildPatrolCrew } from './equipage';
import type { EquipageApi, EquipageInfo } from './equipage';
import { readVacation } from '@/gameplay/patrols/model';
import type { Cast, CastSlot, RequestedMeans } from './roster';
import { baseOf, bravmBaseOf, isJournee } from './journee-data';
import { REMISE_SERVICE, REMISE_WIDE, RemiseTracker, cellularCount, remiseNearest, remiseSpot } from './remise';
import type { RemiseApi } from './remise';

/** Sections par compagnie (au-delà, les sections suivantes lui sont rattachées en renfort). */
const COMPANY_SECTIONS = 4;
const COMPANY_LAYOUT: 'colonne' | 'ligne' = 'ligne';
/** Rôles où le joueur commande sa petite unité : elle le suit à pied et en véhicule (voir follow.ts). */
const LEADER_ROLES: ReadonlySet<string> = new Set(['chef_groupe', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote']);
/** BRAV-M du joueur devant la compagnie (aheadOfForces) : distance le long de la route du départ (m), et écart libre exigé (m). */
const AHEAD_MIN = 30;
const AHEAD_MAX = 180;
const AHEAD_CLEAR = 22;
/** Véhicules de l'unité que l'on gare nez vers la sortie (les engins à équipage restent face au front). */
const PARKED_KINDS: readonly string[] = ['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'voiture_police', 'moto_bravm'];
/** Longueur (m) du début d'itinéraire où une sortie ne doit croiser aucun véhicule arrêté hors du bloc (voir crossesParked). */
const CROSS_CHECK = 45;
/** Voiture d'une petite équipe garée à côté du bloc d'une compagnie : écart minimal à ses véhicules (m, voir nearBlock). */
const BLOCK_CLEAR = 6;
/**
 * Fourgon cellulaire rangé derrière le bloc (voir cellToRear) : places essayées autour de chaque véhicule (recul, écart
 * latéral, m) — juste derrière lui, en biais derrière, à côté de lui (file voisine), deux rangs derrière.
 */
const CELL_SPOTS: readonly number[] = [7.6, 0, 7.6, 3.6, 7.6, -3.6, 0, 3.6, 0, -3.6, 15.2, 0];
const isProtester = (p: { faction: string }): boolean => p.faction === 'protest';

/**
 * Graine d'apparence de l'équipage du fourgon cellulaire n° `i` : tirée de la graine de la session, sans puiser dans le
 * générateur du module de police (les unités créées ensuite, et toute l'IA, gardent les mêmes tirages qu'avant).
 */
function cellSeed(ctx: GameContext, i: number): number {
  return (((ctx.session.config?.seed ?? 1) * 7919 + i * 104729 + 31) | 0) >>> 1;
}
const propsScratch: unknown[] = [];

const DEFAULT_BYSTANDERS = 10;
const BYSTANDER_REACH = 120;
/** Les passants ne se tiennent pas dans les jambes de l'unité. */
const BYSTANDER_CLEAR = 16;

export class SessionSetupSystem implements GameSystem {
  readonly id = SESSION_SETUP_SYSTEM_ID;
  readonly order = SystemOrder.RULES - 100;

  private ctx!: GameContext;
  private summary_: SessionSetupSummary | null = null;
  private equipage_: EquipageInfo | null = null;
  private readonly people: EntityId[] = [];
  private readonly offs: Unsubscribe[] = [];
  private readonly progressEvent: LoadingProgress = { progress: 0, label: '' };
  private readonly pos: Vec2 = { x: 0, z: 0 };
  private readonly hit: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  private readonly spot = { x: 0, z: 0, heading: 0 };
  private readonly routeScratch: number[] = [];
  /** Fourgons cellulaires engagés et point de remise des interpellés. */
  private readonly remise = new RemiseTracker();

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    const api: SessionSetupApi = {
      get summary(): SessionSetupSummary | null {
        return self.summary_;
      },
      people: this.people,
    };
    ctx.provide<SessionSetupApi>(SESSION_SETUP_SERVICE, api);
    const equipage: EquipageApi = {
      get current(): EquipageInfo | null {
        return self.equipage_;
      },
    };
    ctx.provide<EquipageApi>(EQUIPAGE_SERVICE, equipage);
    const remise = this.remise;
    const remiseApi: RemiseApi = {
      point: () => remise.point(),
      vans: () => remise.vans(),
      track: (companyId, vans, awayHeading, line, spots) => remise.track(companyId, vans, awayHeading, line, spots),
    };
    ctx.provide<RemiseApi>(REMISE_SERVICE, remiseApi);
  }

  init(ctx: GameContext): void {
    this.remise.bind(ctx);
    this.offs.push(ctx.events.on('session:started', ({ config }) => this.onStarted(config)));
  }

  update(): void {
    if (this.ctx) this.remise.update(this.ctx.clock.now);
  }

  reset(): void {
    this.summary_ = null;
    this.equipage_ = null;
    this.people.length = 0;
    this.remise.clear(false);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  // ───────────────────────────── déroulement ─────────────────────────────

  private progress(progress: number, label: string): void {
    const ev = this.progressEvent;
    ev.progress = progress;
    ev.label = label;
    this.ctx.events.emitAny(UI_LOADING_EVENT, ev);
  }

  private onStarted(config: SessionConfig): void {
    const ctx = this.ctx;
    try {
      this.reset();
      this.progress(0.45, 'Mise en place du dispositif');
      const rng = ctx.rng.fork('session.setup');
      const rand = (): number => rng.next();
      const x = typeof config.x === 'number' ? config.x : 0;
      const z = typeof config.z === 'number' ? config.z : 0;
      const helper = ctx.service<SpawnHelperApi>('roles.spawn');
      const cast = castFor(config, helper);
      // Une manifestation se tient ici (le module de foule s'est mis en place juste avant, sur le même événement) :
      // les forces de l'ordre et les secours se placent à l'écart, pas au milieu du rassemblement.
      ctx.people.rebuildIndex();
      const crowd = this.crowdHere();
      // journée de service : les forces prennent leur service à la caserne (île de la Cité) et rejoignent la
      // manifestation en colonne (session/journee.ts) — elles ne sont pas posées à côté du rassemblement
      const journee = isJournee(config);
      this.remise.clear(journee);
      const apart = crowd && !journee ? chooseStandOffCrowd(ctx, x, z, ctx.director.route, isProtester) : null;
      const base = baseOf(config);
      const forces = journee ? chooseStand(ctx, base.x, base.z, rand) : apart ?? chooseStand(ctx, x, z, rand);
      const withForces = isPoliceRole(config.role) || config.role === 'secouriste';
      // le joueur manifestant, journaliste ou secouriste de rue est, lui, sur le lieu même
      let stand = withForces || !apart ? forces : chooseStand(ctx, x, z, rand);
      const summary: SessionSetupSummary = {
        playerId: 0, role: config.role, x: stand.x, z: stand.z, heading: stand.heading, squadId: 0, rootSquadId: 0,
        teammates: 0, vehicleIds: [], bystanders: 0, usedPoliceUnits: false, offCrowd: apart !== null,
        means: { agents: 0, sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, cellulaires: 0 },
      };

      // équipage de patrouille : la compagnie du Mode libre (moyens engagés, manifestation en cours) est construite
      // d'abord, sans le joueur ; puis la voiture de l'équipage se gare à l'écart, ses collègues à bord. En vacation,
      // aucune compagnie : une voiture seule.
      const patrol = config.role === 'patrouille';
      let player: Person | null = null;
      if (patrol) {
        if (!readVacation(config)) this.buildWithPoliceUnits(config, cast, forces, meansOf(config), crowd, summary);
        const crew = buildPatrolCrew(ctx, config, cast, summary, helper, rand, { crowd, people: this.people });
        if (crew) {
          player = crew.player;
          stand = crew.stand;
          this.equipage_ = crew.info;
        }
      } else {
        player = this.buildWithPoliceUnits(config, cast, forces, meansOf(config), crowd, summary);
      }
      if (!player) {
        // l'équipe du joueur est créée directement ; si une compagnie tient déjà l'emplacement, elle se range à côté
        if (summary.usedPoliceUnits && withForces) {
          // (journée de service, BRAV-M du joueur à la base de la compagnie : devant elle sur la route du départ)
          stand = (journee && config.role === 'bravm' ? this.aheadOfForces(forces, x, z) : null) ?? this.besideForces(forces);
        }
        summary.x = stand.x;
        summary.z = stand.z;
        summary.heading = stand.heading;
        player = this.buildCast(cast, stand, helper, rand, summary);
      }
      // forces de l'ordre sans compagnie (BRAV-M seule, engin, équipe drone, groupe en patrouille libre) : un fourgon
      // cellulaire avec son équipage pour leurs interpellés (jamais pour une vacation de patrouille : la voiture suffit)
      if (!(patrol && readVacation(config))) this.loneCellular(forces, summary);
      this.countMeans(summary);
      // personne posée au ras d'une façade, sur une case « bâti » de la grille des sols (au mètre, plus large que les
      // collisions) : ramenée sur le sol libre le plus proche, pour que tout le jeu la voie dehors
      this.ontoGround(rand);

      if (player) {
        // unité tenue par l'IA : le joueur ne commence pas enfermé dans les rangs (voir stepOutOfRanks)
        if (summary.usedPoliceUnits && isPoliceRole(config.role)) this.stepOutOfRanks(player, stand, rand);
        // le joueur regarde ce que regarde son unité
        if (player.vehicleId === 0) player.heading = stand.heading;
        player.aimYaw = stand.heading;
        player.aimPitch = 0;
        ctx.player.possess(player.id, config.role);
        const st = ctx.player.state;
        st.camYaw = stand.heading;
        st.camPitch = 0;
        st.controlEnabled = true;
        ctx.player.setCameraMode(this.cameraOf(config, player, stand.heading));
        ctx.service<RenderCameraApi>('render.camera')?.cut();
        summary.playerId = player.id;
        // commandant en salle de commandement : il s'installe dans le véhicule de commandement, vue tactique
        if (config.role === 'commandant' && config.extra && config.extra['variante'] === 'salle') this.seatInCommandRoom(player);
        // BRAV-M, poste passager : opérateur d'un binôme, en selle derrière son pilote ; le chef de groupe de l'IA
        // commande (voir mountBravm) — le joueur ne prend pas la tête de l'unité, son pilote ne le « suit » pas à pied
        // (chef de la BRAV-M de la distribution, sans BRAV-M engagée : il se met en selle de même, derrière son pilote, et
        // prend la tête du groupe — voir mountBravm)
        const bravmMounted = config.role === 'bravm' && (player.poste === 'passager_moto' || (player.poste === 'chef_groupe' && player.vehicleId === 0))
          && this.mountBravm(player);
        const bravmPassenger = bravmMounted && player.poste === 'passager_moto';
        // rôles à responsabilité : le joueur prend la tête de son unité (BRAV-M, équipage d'engin, équipe du drone)
        if (LEADER_ROLES.has(config.role) && player.squadId !== 0 && !bravmPassenger) {
          const own = ctx.squads.get(player.squadId);
          if (own && own.faction === 'police' && own.leaderId !== player.id) ctx.squads.setLeader(own.id, player.id);
          // canon à eau, Centaure : un groupe de CRS de la compagnie l'escorte et le suit
          if (own && (config.role === 'operateur_canon_eau' || config.role === 'gendarme_centaure')) this.attachEscort(player, own, config.role === 'gendarme_centaure');
        }
        // « Tout le monde me suit » : chaque unité que le joueur commande le suit tant qu'il ne lui donne pas d'autre
        // ordre — commandant et commissaire compris (toute la compagnie), chef de section (toute sa section : elle n'a pas
        // de membre direct, ses groupes suivent avec elle). Pas l'équipage de patrouille (il est à bord avec lui, et
        // descend sur son ordre), ni le commandant en salle de commandement (il n'est pas sur le terrain).
        const salle = config.extra !== undefined && config.extra['variante'] === 'salle';
        if (!bravmPassenger && !patrol && !salle) this.everyoneFollows(player);
      } else {
        console.error('[session] aucun personnage n’a pu être créé pour le joueur');
      }

      this.progress(0.5, 'Passants et riverains');
      // le module de circulation fait vivre de vrais piétons civils : pas de passants figés en double
      if (ctx.service('traffic') === undefined) summary.bystanders = this.spawnBystanders(config, stand, x, z, rand);
      this.applyScenario(config, x, z, summary.playerId);

      ctx.people.rebuildIndex();
      this.summary_ = summary;
      ctx.events.emitAny(SESSION_SETUP_EVENT, summary);
      this.progress(0.55, 'Dispositif en place');
    } catch (err) {
      console.error('[session] mise en place de la session impossible', err);
      if (getCore(ctx).strict) throw err;
    }
  }

  /**
   * Le joueur qui tient un rang intérieur d'une formation de l'IA (boucliers jointifs devant lui, collègues tout
   * autour) ne pouvait ni voir ni avancer : il est posé au bout du premier rang, dans le prolongement de la ligne —
   * devant lui le terrain est libre, son unité est à son côté. Son emplacement dans la formation lui reste réservé
   * (service 'police.slot') : il le rejoint quand son groupe manœuvre.
   */
  private stepOutOfRanks(player: Person, stand: Stand, rand: () => number): void {
    if (player.vehicleId !== 0) return;
    const ctx = this.ctx;
    const fx = Math.sin(stand.heading);
    const fz = Math.cos(stand.heading);
    const rx = -fz;
    const rz = fx;
    const list = ctx.people.list;
    // quelqu'un devant lui, à moins de 3,2 m, dans l'axe du regard ?
    let blocked = false;
    for (let i = 0; i < list.length && !blocked; i++) {
      const p = list[i]!;
      if (p === player || p.dormant || p.vehicleId !== 0) continue;
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      const ahead = dx * fx + dz * fz;
      blocked = ahead > 0.4 && ahead < 3.2 && Math.abs(dx * rx + dz * rz) < ahead * 0.7 + 0.3;
    }
    if (!blocked) return;
    // premier rang de la formation qui l'entoure, et ses deux bouts
    let front = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p === player || p.faction !== 'police' || p.vehicleId !== 0) continue;
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      const ahead = (p.x - stand.x) * fx + (p.z - stand.z) * fz;
      if (ahead > front && Math.abs(dx * fx + dz * fz) < 12) front = ahead;
    }
    if (front === -Infinity) return;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p === player || p.faction !== 'police' || p.vehicleId !== 0) continue;
      const ahead = (p.x - stand.x) * fx + (p.z - stand.z) * fz;
      if (ahead < front - 1.2) continue;
      const lateral = (p.x - stand.x) * rx + (p.z - stand.z) * rz;
      if (Math.abs(lateral - ((player.x - stand.x) * rx + (player.z - stand.z) * rz)) > 40) continue;
      if (lateral < left) left = lateral;
      if (lateral > right) right = lateral;
    }
    if (left === Infinity) return;
    const mine = (player.x - stand.x) * rx + (player.z - stand.z) * rz;
    // le bout le plus proche d'abord, l'autre ensuite
    const ends = mine - left <= right - mine ? [left - 1.4, right + 1.4] : [right + 1.4, left - 1.4];
    const pos = this.pos;
    // deux passes : d'abord un bout d'où l'on peut marcher 8 m droit devant (ni mur, ni mât, ni arbre), sinon le premier libre
    for (let pass = 0; pass < 2; pass++) {
      for (const lateral of ends) {
        pos.x = stand.x + rx * lateral + fx * front;
        pos.z = stand.z + rz * lateral + fz * front;
        if (!ctx.world.isFree(pos.x, pos.z, 0.5) || !settle(ctx, pos, 0.35, rand)) continue;
        if (ctx.people.countIn(pos.x, pos.z, 0.7, (p) => p !== player) > 0) continue;
        if (pass === 0 && !this.clearAhead(pos.x, pos.z, fx, fz, 8)) continue;
        player.x = pos.x;
        player.z = pos.z;
        player.y = ctx.world.heightAt(pos.x, pos.z);
        player.vx = 0;
        player.vz = 0;
        ctx.people.rebuildIndex();
        return;
      }
    }
  }

  /** Les personnes à pied de la mise en place qui se tiennent sur le bâti, l'intérieur ou l'eau sont reposées dehors. */
  private ontoGround(rand: () => number): void {
    const ctx = this.ctx;
    const pos = this.pos;
    let moved = false;
    for (const id of this.people) {
      const p = ctx.people.get(id);
      if (!p || p.vehicleId !== 0) continue;
      const s = ctx.world.surfaceAt(p.x, p.z);
      if (s !== 'building' && s !== 'interior' && s !== 'water') continue;
      pos.x = p.x;
      pos.z = p.z;
      if (!settle(ctx, pos, 0.35, rand)) continue;
      p.x = pos.x;
      p.z = pos.z;
      p.y = ctx.world.heightAt(p.x, p.z);
      moved = true;
    }
    if (moved) ctx.people.rebuildIndex();
  }

  /** Couloir large comme un homme, libre de tout obstacle du décor sur `length` mètres dans la direction (fx, fz). */
  private clearAhead(x: number, z: number, fx: number, fz: number, length: number): boolean {
    const world = this.ctx.world;
    const hit = this.hit;
    for (let side = -1; side <= 1; side++) {
      const ox = x - fz * side * 0.35;
      const oz = z + fx * side * 0.35;
      if (world.raycast(ox, oz, ox + fx * length, oz + fz * length, hit)) return false;
    }
    return true;
  }

  /**
   * Vue de départ : celle que demande le scénario (extra.camera) ; sinon à hauteur d'homme, SAUF si le joueur tient
   * un second rang — trois dos casqués à deux mètres bouchaient alors toute l'image de départ : il commence en vue à
   * la troisième personne, d'où il lit le dispositif (la touche de caméra bascule à tout moment).
   * À bord d'un véhicule : la caméra du véhicule (poursuite ; intérieur si le scénario demande la vue à la première
   * personne).
   */
  private cameraOf(config: SessionConfig, player: Person, heading: number): CameraMode {
    const v = config.extra ? config.extra['camera'] : undefined;
    if (player.vehicleId !== 0) return v === 'fps' ? 'vehicle_int' : 'vehicle_ext';
    if (v === 'tps' || v === 'fps') return v;
    const ctx = this.ctx;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p === player || p.dormant || p.vehicleId !== 0) continue;
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.4 || ahead > 3.2) continue;
      // dans un cône d'environ 35° de part et d'autre du regard
      if (Math.abs(-dx * fz + dz * fx) < ahead * 0.7 + 0.3) return 'tps';
    }
    return 'fps';
  }

  // ───────────────────────────── unités par le module d'IA de police ─────────────────────────────

  /** Des manifestants sont là, ou un parcours est déclaré : une manifestation se tient au lieu de la session. */
  private crowdHere(): boolean {
    const ctx = this.ctx;
    if (ctx.director.route.length >= 2 || ctx.director.phase !== 'aucune') return true;
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) if (list[i]!.faction === 'protest') return true;
    return false;
  }

  /**
   * Quand le service 'police.units' est branché, c'est lui qui construit les unités (ses agents sont alors pilotés
   * par l'IA) :
   *   - manifestation en cours (ou joueur commandant) : une COMPAGNIE (sections, fourgons, moyens d'appui selon les
   *     « moyens engagés » de la page d'accueil) où le joueur CRS, chef de groupe, chef de section ou commandant
   *     tient son poste ;
   *   - sinon (patrouille libre) : le seul groupe — ou la section — du joueur.
   * Retourne la personne du joueur, ou null quand il reste à créer directement (rôle hors compagnie, ou échec).
   */
  private buildWithPoliceUnits(
    config: SessionConfig, cast: Cast, stand: Stand, means: RequestedMeans | null, crowd: boolean, summary: SessionSetupSummary,
  ): Person | null {
    const ctx = this.ctx;
    const units = ctx.service<PoliceUnitsLike>('police.units');
    if (!units) return null;
    const role = config.role;
    const commander = role === 'commandant' || role === 'commissaire';
    const foot = commander || role === 'crs' || role === 'chef_groupe';
    const mine = cast.slots[cast.player];
    try {
      // Patrouille libre (aucune manifestation, joueur non commandant) : une compagnie n'aurait rien à y faire,
      // même si la page d'accueil a transmis ses « moyens engagés » — le joueur part avec son seul groupe.
      // chef de la BRAV-M : il prend la tête de la BRAV-M du dispositif (la BravmUnit du commandement, rattachée à la
      // compagnie), pas celle d'un petit groupe à côté
      const chefBravm = role === 'bravm' && !!mine && mine.poste === 'chef_groupe';
      const wantCompany = commander || (crowd && (means !== null || foot || chefBravm));
      if (wantCompany && typeof units.createCompany === 'function') {
        // sans réglage (session lancée par l'URL) : une section et ses trois fourgons
        const asked: RequestedMeans = means ?? { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, cellulaires: 0 };
        const handles = this.buildCompany(units, stand, chefBravm ? { ...asked, bravm: Math.max(1, asked.bravm) } : asked, summary);
        if (handles.length === 0) return null;
        summary.usedPoliceUnits = true;
        summary.rootSquadId = handles[0]!.squad.id;
        if (chefBravm && mine) return this.takeBravm(handles, mine.rank, summary);
        if (!foot || !mine) return null;
        const person = this.pickPlayer(handles, role, mine.poste);
        if (!person) return null;
        if (mine.rank) person.rank = mine.rank;
        // (commandant, commissaire : le VL est le premier véhicule garé, déjà en tête du bloc — on ne le déplace pas)
        if (!commander) this.ownVehicleOut(person);
        summary.squadId = person.squadId;
        summary.teammates = this.people.length - 1;
        return person;
      }
      if (!foot || commander || !mine) return null;
      const place = { x: stand.x, z: stand.z, heading: stand.heading, layout: 'ligne' as const, vehicles: true, drivers: mine.poste === 'conducteur', section: 1 };
      const handle = mine.poste === 'chef_section'
        ? units.createSection(place)
        : units.createGroup({ ...place, type: mine.poste === 'lbd' || mine.poste === 'interpellation' ? 'intervention' : 'appui' });
      let chosen: { id: EntityId } | null = null;
      for (const p of handle.people) {
        if (p.poste === mine.poste) {
          chosen = p;
          break;
        }
      }
      if (!chosen) chosen = handle.leader ?? handle.people[0] ?? null;
      const person = chosen ? ctx.people.get(chosen.id) : undefined;
      if (!person) return null;
      if (mine.rank) person.rank = mine.rank;
      for (const p of handle.people) this.people.push(p.id);
      for (const v of handle.vehicles) summary.vehicleIds.push(v.id);
      this.faceExit(handle);
      summary.squadId = person.squadId;
      summary.rootSquadId = handle.squad.id;
      summary.teammates = handle.people.length - 1;
      summary.usedPoliceUnits = true;
      return person;
    } catch (err) {
      console.error('[session] construction de l’unité par « police.units » impossible : création directe', err);
      if (getCore(ctx).strict) throw err;
      return null;
    }
  }

  /**
   * Compagnie et moyens d'appui de la rubrique « Moyens engagés ». Retourne les unités créées, la compagnie en
   * premier (tableau vide si rien n'a pu l'être).
   */
  private buildCompany(units: PoliceUnitsLike, stand: Stand, means: RequestedMeans, summary: SessionSetupSummary): PoliceUnitHandleLike[] {
    const ctx = this.ctx;
    const out: PoliceUnitHandleLike[] = [];
    const sections = Math.max(1, means.sections);
    const vans = means.fourgons > 0;
    const fx = Math.sin(stand.heading);
    const fz = Math.cos(stand.heading);
    const rx = -fz;
    const rz = fx;
    const company = units.createCompany!({
      x: stand.x, z: stand.z, heading: stand.heading, sections: Math.min(COMPANY_SECTIONS, sections), vehicles: vans, drivers: vans, layout: COMPANY_LAYOUT,
      // (fourgons cellulaires engagés plus bas, avec leur équipage)
      cellular: false,
    });
    out.push(company);
    this.progress(0.47, 'Mise en place de la compagnie');
    // sections de renfort (5 à 8) : rattachées à la même compagnie, en colonne sur ses flancs
    for (let s = COMPANY_SECTIONS + 1; s <= sections; s++) {
      const n = s - COMPANY_SECTIONS - 1;
      const side = (n % 2 === 0 ? 1 : -1) * (9 + Math.floor(n / 2) * 9);
      const px = stand.x + rx * side;
      const pz = stand.z + rz * side;
      // la file de la section et ses fourgons doivent tenir sur ce flanc ; sinon elle se range derrière la compagnie, à pied
      const lane = ctx.world.isFree(px, pz, 1.6) && ctx.world.isFree(px - fx * 8, pz - fz * 8, 1.6) && ctx.world.isFree(px - fx * 26, pz - fz * 26, 2.4);
      try {
        out.push(units.createSection({
          x: lane ? px : stand.x - fx * (6 + n * 5), z: lane ? pz : stand.z - fz * (6 + n * 5), heading: stand.heading,
          parentId: company.squad.id, section: ((s - 1) % COMPANY_SECTIONS) + 1, callsign: `${company.squad.name ?? 'COMPAGNIE'} ${s}`,
          vehicles: vans && lane, drivers: vans && lane, layout: 'colonne',
        }));
      } catch (err) {
        console.error(`[session] section de renfort n° ${s} impossible`, err);
        if (getCore(ctx).strict) throw err;
      }
    }
    this.trimVans(out, means.fourgons);

    // moyens d'appui : sur les flancs, en retrait
    this.progress(0.49, 'Moyens d’appui');
    const taken: number[] = [];
    const spot = this.spot;
    let index = 0;
    const special = (make: (x: number, z: number, heading: number) => PoliceUnitHandleLike | undefined, radius: number, what: string, rearLane = 0, at: Stand = stand): void => {
      // (pour des machines à ranger en file : d'abord avec toute la bande libre derrière, sinon avec la moitié)
      if (!supportSpot(ctx, at, index, radius, taken, spot, rearLane) && !(rearLane > 0 && supportSpot(ctx, at, index, radius, taken, spot, rearLane * 0.6))
        && !(rearLane > 0 && supportSpot(ctx, at, index, radius, taken, spot, rearLane * 0.3))
        && !roadSpot(ctx, at.x, at.z, radius * 2, radius, spot)) {
        index++;
        console.warn(`[session] pas de place pour ${what} près de l'unité : moyen non engagé`);
        return;
      }
      index++;
      try {
        const h = make(spot.x, spot.z, spot.heading);
        if (h) out.push(h);
      } catch (err) {
        console.error(`[session] création de ${what} impossible`, err);
        if (getCore(ctx).strict) throw err;
      }
    };
    const parentId = company.squad.id;
    // les BRAV-M d'abord : leurs motos se garent en file et demandent une longue bande libre, que les engins
    // (jusqu'à dix Centaures et dix canons à eau) occuperaient sinon
    // journée de service : la BRAV-M part de son propre commissariat, on se rejoint sur place (et les motos ne se
    // mêlent pas à la sortie des fourgons)
    const journee = isJournee(this.ctx.session.config);
    const bb = journee ? bravmBaseOf(this.ctx.session.config) : null;
    let bstand: Stand = stand;
    if (bb) {
      const sp = { x: 0, z: 0, heading: 0 };
      // une longue bande de chaussée de préférence (les motos s'y rangent en file) ; à défaut — rue étroite, voitures
      // garées — la chaussée devant le commissariat : sans elle, la BRAV-M partait de la caserne de la compagnie
      if (roadSpot(ctx, bb.x, bb.z, 60, 4, sp) || roadSpot(ctx, bb.x, bb.z, 12, 3, sp)) bstand = { ...stand, x: sp.x, z: sp.z, heading: sp.heading };
    }
    if (typeof units.createBravm === 'function') {
      for (let i = 0; i < means.bravm; i++) {
        // rattachée à la compagnie : sous les ordres du commandant, dans « Toute la compagnie » et « Avec moi », journée de
        // service comprise. Journée de service : elle attend l'ordre de mouvement en selle, à son commissariat, et fait
        // sa propre colonne de motos (journee.ts, engageOthers) — les ordres de colonne de la compagnie (embarquer,
        // débarquer) et un ordre de ligne à toute la compagnie ne la concernent pas (police/command/bravm.ts, relayFrom)
        special((x, z, heading) => units.createBravm!(6, {
          x, z, heading, vehicles: true, mounted: journee, callsign: means.bravm > 1 ? `FAUCON ${i + 1}` : undefined, parentId,
        }), 3, 'la BRAV-M', 44, bstand);
      }
    }
    if (typeof units.createEquipage === 'function') {
      for (let i = 0; i < means.canon_eau; i++) special((x, z, heading) => units.createEquipage!('canon_eau', { x, z, heading, parentId }), 5.5, 'l’engin lanceur d’eau');
      for (let i = 0; i < means.centaure; i++) special((x, z, heading) => units.createEquipage!('centaure', { x, z, heading, parentId }), 4.5, 'le Centaure');
    }
    const command = ctx.service<PoliceCommandLike>('police.command');
    if (command && typeof command.createDroneTeam === 'function') {
      for (let i = 0; i < means.drone; i++) special((x, z, heading) => command.createDroneTeam!({ x, z, heading, parentId }), 2, 'l’équipe du drone');
    }
    // fourgons cellulaires, chacun avec son équipage, rattachés à la compagnie (ses interpellations s'en servent) :
    // déjà sur place, au point de remise des interpellés, derrière la ligne et dos à la foule ; en journée de
    // service, garés au plus près de la caserne (ils partent avec la colonne, le point de remise est fixé à l’arrivée)
    if (typeof units.createEquipage === 'function') {
      const n = cellularCount(ctx.session.config?.crowdSize ?? 0, true, means.cellulaires);
      const vansMade: number[] = [];
      const spots: { x: number; z: number; heading: number }[] = [];
      const taken: number[] = [];
      const def = ctx.vehicles.def('fourgon_cellulaire');
      const len = def ? def.length : 6;
      const wid = def ? def.width : 2.05;
      const away = wrapAngle(stand.heading + Math.PI);
      for (let i = 0; i < n; i++) {
        const make = (x: number, z: number, heading: number): PoliceUnitHandleLike | undefined => {
          const h = units.createEquipage!('fourgon_cellulaire', { x, z, heading, parentId, seed: cellSeed(ctx, i) });
          if (h) vansMade.push(h.squad.id);
          return h;
        };
        const at = (band?: readonly [number, number]): boolean =>
          remiseSpot(ctx, stand.x, stand.z, Math.sin(away), Math.cos(away), { taken, van: null, len, wid, people: true, band }, spot);
        // (journée de service : sur la chaussée la plus proche de la base, hors du bloc des unités — garés sur les flancs
        // du bloc, dans une cour de caserne ou de commissariat, ils s'y trouvaient enfermés par le stationnement réservé
        // du commissariat et bloquaient la sortie de la colonne)
        if ((!journee && (at() || at(REMISE_WIDE)))
          || remiseNearest(ctx, stand.x, stand.z, Math.sin(away), Math.cos(away), { taken, van: null, len, wid, people: true }, spot)) {
          taken.push(spot.x, spot.z);
          spots.push({ x: spot.x, z: spot.z, heading: spot.heading });
          try {
            const h = make(spot.x, spot.z, spot.heading);
            if (h) out.push(h);
          } catch (err) {
            console.error('[session] création d’un fourgon cellulaire impossible', err);
            if (getCore(ctx).strict) throw err;
          }
          continue;
        }
        // (aucune chaussée libre à la bonne distance, ou journée de service) : sur les flancs, en retrait — déjà sur place,
        // à partir de 40 m derrière la ligne, pas au ras du premier rang
        special(make, 3.5, 'un fourgon cellulaire', 0, journee ? stand : { ...stand, x: stand.x - fx * 40, z: stand.z - fz * 40 });
      }
      this.remise.track(parentId, vansMade, away, journee ? null : { x: stand.x, z: stand.z }, journee || spots.length < vansMade.length ? [] : spots);
    }

    for (const h of out) {
      for (const p of h.people) if (ctx.people.get(p.id)) this.people.push(p.id);
      for (const v of h.vehicles) if (ctx.vehicles.get(v.id)) summary.vehicleIds.push(v.id);
      this.faceExit(h);
    }
    return out;
  }

  /**
   * « Fourgons » de la page d'accueil : la dotation normale est d'un fourgon par groupe ; si le joueur en a demandé
   * moins, les derniers groupes n'en ont pas (fourgon et conducteur retirés). On n'en crée pas au-delà de la dotation.
   */
  private trimVans(handles: PoliceUnitHandleLike[], wanted: number): void {
    const ctx = this.ctx;
    const vans: Vehicle[] = [];
    for (const h of handles) {
      for (const ref of h.vehicles) {
        const v = ctx.vehicles.get(ref.id);
        if (v && v.kind === 'fourgon_crs') vans.push(v);
      }
    }
    for (let i = vans.length - 1; i >= Math.max(0, wanted); i--) {
      const v = vans[i]!;
      for (let seat = 0; seat < v.seats.length; seat++) {
        const p = v.seats[seat] ? ctx.people.get(v.seats[seat]!) : undefined;
        if (!p) continue;
        ctx.vehicles.exit(p);
        ctx.squads.removeMember(p.id);
        ctx.people.remove(p.id);
      }
      for (const sq of ctx.squads.list) if (sq.vehicleId === v.id) sq.vehicleId = 0;
      ctx.vehicles.remove(v.id);
    }
  }

  /**
   * Véhicules de l'unité garés nez vers la sortie réelle de leur bloc (côté unité ou à l'opposé, voir plus bas) : prêts
   * à repartir, et celui qui prend le volant et roule tout droit sort du bloc au lieu de passer sur ses collègues.
   * Demi-tour sur place (même emprise).
   */
  private faceExit(handle: Pick<PoliceUnitHandleLike, 'vehicles'>): void {
    const ctx = this.ctx;
    const list: Vehicle[] = [];
    for (const ref of handle.vehicles) {
      const v = ctx.vehicles.get(ref.id);
      if (!v || PARKED_KINDS.indexOf(v.kind) < 0 || Math.abs(v.speed) > 0.1) continue;
      list.push(v);
    }
    // Sortie RÉELLE de chaque bloc (véhicules rangés dans le même axe) : les têtes de file — aucun véhicule du bloc
    // devant elles dans leur voie — doivent avoir devant le pare-chocs une fois et demie leur longueur de place libre.
    // Le bloc est garé derrière l'unité, nez vers elle : le premier rang (VL, fourgon du 1er groupe) est alors en tête.
    // Tourné systématiquement « dos à l'unité », c'était le DERNIER rang qui menait — souvent contre un mur, là où la
    // place avait manqué — et le véhicule du joueur, au premier rang, avait tout le bloc devant son capot (Bastille,
    // République : il passait plus d'une minute à manœuvrer, et les fourgons restaient pris dans le bloc). Demi-tour
    // seulement si la sortie côté unité est barrée et l'autre libre (ou moins barrée). Motos : file sur la chaussée,
    // dos à l'unité comme avant.
    const done = new Set<Vehicle>();
    for (const v of list) {
      if (done.has(v)) continue;
      const group = list.filter((o) => !done.has(o) && Math.abs(Math.sin(o.heading - v.heading)) < 0.35);
      for (const o of group) done.add(o);
      let flip = true;
      if (v.kind !== 'moto_bravm') {
        const keep = this.exitCount(group, 0);
        const turn = this.exitCount(group, Math.PI);
        // à égalité (les deux bouts du bloc dégagés) : le sens d'où partent les rues — sens unique, impasse, place ;
        // égalité parfaite : le cap du bloc, premier rang en tête (dos à l'unité, des membres de
        // l'état-major restaient à pied au départ du commandant, et la section décrochait du VL)
        flip = turn > keep || (turn === keep && this.forwardRoutes(group, Math.PI) > this.forwardRoutes(group, 0));
      }
      if (flip) {
        for (const o of group) {
          let h = (o.heading + Math.PI) % (Math.PI * 2);
          if (h > Math.PI) h -= Math.PI * 2;
          o.heading = h;
        }
      }
      this.cellToRear(group);
    }
  }

  /**
   * Itinéraires qui partent droit devant la tête du bloc `group`, tourné de `turn` (rad) : vers huit points à 300 m
   * alentour, en partant du cap du bloc (un demi-tour sur place coûte), combien s'éloignent d'abord vers l'avant ? Sur
   * une voie à sens unique prise à contresens, ou nez vers une impasse, tous commencent par revenir en arrière — à
   * travers le bloc.
   */
  private forwardRoutes(group: readonly Vehicle[], turn: number): number {
    const h = group[0]!.heading + turn;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    let head = group[0]!;
    for (const o of group) if ((o.x - head.x) * fx + (o.z - head.z) * fz > 0) head = o;
    return this.routesFrom(head, h, group);
  }

  /**
   * Un véhicule de police garé (bloc d'une compagnie) est-il à moins de BLOCK_CLEAR m (entre caisses, à peu près) de la
   * place (x, z) ? (Pas les véhicules de l'unité du joueur déjà garés, `own` : ils se rangent côte à côte.)
   */
  private nearBlock(x: number, z: number, length: number, own: readonly Vehicle[]): boolean {
    for (const o of this.ctx.vehicles.list) {
      if (own.indexOf(o) >= 0 || o.faction !== 'police' || o.def.flying || Math.abs(o.speed) > 0.5 || PARKED_KINDS.indexOf(o.kind) < 0) continue;
      // (un fourgon cellulaire garé au point de remise, à l'écart, n'est pas le bloc de la compagnie)
      if (o.kind === 'fourgon_cellulaire') continue;
      if (Math.hypot(o.x - x, o.z - z) < (o.def.length + length) * 0.5 + BLOCK_CLEAR) return true;
    }
    return false;
  }

  /** Itinéraires qui partent droit devant `head`, au cap `h`, sans traverser de véhicule arrêté hors de `ignore`. */
  private routesFrom(head: Vehicle, h: number, ignore: readonly Vehicle[]): number {
    const ctx = this.ctx;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const sx = head.x + fx * (head.def.length * 0.5 + 3);
    const sz = head.z + fz * (head.def.length * 0.5 + 3);
    const path = this.routeScratch;
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      path.length = 0;
      if (!ctx.world.findPath(sx, sz, sx + Math.sin(a) * 300, sz + Math.cos(a) * 300, 'vehicle', path, { heading: h, uturn: 60 })) continue;
      let i = 2;
      while (i < path.length - 2 && Math.hypot(path[i]! - sx, path[i + 1]! - sz) < 15) i += 2;
      if (i < path.length && (path[i]! - sx) * fx + (path[i + 1]! - sz) * fz > 0 && !this.crossesParked(path, ignore)) n++;
    }
    return n;
  }

  /**
   * Les premiers mètres de l'itinéraire `path` passent-ils sur un véhicule arrêté hors de `group` (le reste du bloc de la
   * compagnie, pour une machine d'appui garée à côté) ? Ce n'est pas une sortie : il faudrait traverser le bloc.
   */
  private crossesParked(path: readonly number[], group: readonly Vehicle[]): boolean {
    const ctx = this.ctx;
    let run = 0;
    for (let i = 2; i < path.length && run < CROSS_CHECK; i += 2) {
      const ax = path[i - 2]!, az = path[i - 1]!;
      const l = Math.hypot(path[i]! - ax, path[i + 1]! - az);
      for (let d = 0; d < l && run + d < CROSS_CHECK; d += 1.5) {
        const x = ax + (path[i]! - ax) * (d / l);
        const z = az + (path[i + 1]! - az) * (d / l);
        for (const o of ctx.vehicles.list) {
          if (group.indexOf(o) >= 0 || Math.abs(o.speed) > 0.5 || o.def.flying) continue;
          const dx = x - o.x, dz = z - o.z;
          if (dx * dx + dz * dz > 64) continue;
          const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
          if (Math.abs(dx * ofx + dz * ofz) < o.def.length * 0.5 + 1 && Math.abs(-dx * ofz + dz * ofx) < o.def.width * 0.5 + 1.2) return true;
        }
      }
      run += l;
    }
    return false;
  }

  /**
   * Fourgon cellulaire (sans équipage : il reste au stationnement quand la compagnie part), une fois le sens de sortie
   * choisi : au dernier rang du bloc, où il ne barre la sortie à personne. police/units.ts le range à côté du premier
   * rang, en prévision d'un demi-tour du bloc ; quand le bloc garde son cap, il se retrouvait en tête, devant les
   * fourgons (et il gênait le passage de celui qui sortait de la file voisine). Pas de place libre derrière : il reste.
   */
  private cellToRear(group: readonly Vehicle[]): void {
    const cell = group.find((o) => o.kind === 'fourgon_cellulaire');
    if (!cell) return;
    const others = group.filter((o) => o !== cell);
    if (others.length === 0) return;
    const fx = Math.sin(cell.heading);
    const fz = Math.cos(cell.heading);
    const atRear = (x: number, z: number): boolean => others.every((o) => Math.hypot(o.x - x, o.z - z) >= 30 || (o.x - x) * fx + (o.z - z) * fz > -0.5);
    if (atRear(cell.x, cell.z)) return;
    let cx = 0;
    let cz = 0;
    for (const o of others) { cx += o.x; cz += o.z; }
    cx /= others.length;
    cz /= others.length;
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (const o of others) {
      for (let c = 0; c < CELL_SPOTS.length; c += 2) {
        const back = CELL_SPOTS[c]!;
        const lat = CELL_SPOTS[c + 1]!;
        const x = o.x - fx * back - fz * lat;
        const z = o.z - fz * back + fx * lat;
        const d = Math.hypot(x - cx, z - cz);
        if (d >= best || !atRear(x, z) || !this.cellFits(cell, x, z)) continue;
        best = d;
        bx = x;
        bz = z;
      }
    }
    if (best === Infinity) return;
    cell.x = bx;
    cell.z = bz;
  }

  /** Le cellulaire tient-il en (x, z), à son cap : décor libre sur toute sa longueur, aucun autre véhicule à moins d'une portière ? */
  private cellFits(cell: Vehicle, x: number, z: number): boolean {
    const ctx = this.ctx;
    const fx = Math.sin(cell.heading);
    const fz = Math.cos(cell.heading);
    const half = cell.def.length * 0.5;
    const r = cell.def.width * 0.5;
    for (let d = -half - 0.5; d <= half + 0.5; d += 0.5) if (!ctx.world.isFree(x + fx * d, z + fz * d, r)) return false;
    const surf = ctx.world.surfaceAt(x, z);
    if (surf === 'water' || surf === 'building' || surf === 'interior' || surf === 'park') return false;
    for (const o of ctx.vehicles.list) {
      if (o === cell) continue;
      const dx = o.x - x, dz = o.z - z;
      if (Math.abs(dx * fx + dz * fz) < (cell.def.length + o.def.length) * 0.5 + 0.6 && Math.abs(-dx * fz + dz * fx) < (cell.def.width + o.def.width) * 0.5 + 0.8) return false;
    }
    return true;
  }

  /**
   * Véhicules du bloc `group`, tourné de `turn` (rad), qui en sortent l'un après l'autre en marche avant : à chaque
   * tour, ceux qui n'ont plus aucun véhicule du bloc juste devant eux dans leur voie et devant le pare-chocs une fois et
   * demie leur longueur de place libre (décor, autres véhicules arrêtés) s'en vont. Le cellulaire, rangé ensuite au
   * dernier rang (voir cellToRear), ne compte pas.
   */
  private exitCount(group: readonly Vehicle[], turn: number): number {
    const ctx = this.ctx;
    const rest = group.filter((v) => v.kind !== 'fourgon_cellulaire');
    const total = rest.length;
    for (let gone = true; gone && rest.length > 0;) {
      gone = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        const v = rest[i]!;
        const fx = Math.sin(v.heading + turn);
        const fz = Math.cos(v.heading + turn);
        const half = v.def.length * 0.5;
        let head = true;
        for (const o of rest) {
          if (o === v) continue;
          const dx = o.x - v.x, dz = o.z - v.z;
          const ahead = dx * fx + dz * fz - half - o.def.length * 0.5;
          if (ahead > -0.5 && ahead < 12 && Math.abs(-dx * fz + dz * fx) < (v.def.width + o.def.width) * 0.5 + 0.3) { head = false; break; }
        }
        if (!head) continue;
        const need = v.def.length * 1.5;
        const r = v.def.width * 0.5;
        let ok = true;
        for (let d = 0.5; d <= need && ok; d += 0.5) {
          const x = v.x + fx * (half + d), z = v.z + fz * (half + d);
          if (!ctx.world.isFree(x, z, r)) ok = false;
          for (let k = 0; k < ctx.vehicles.list.length && ok; k++) {
            const o = ctx.vehicles.list[k]!;
            if (o === v || group.indexOf(o) >= 0 || Math.abs(o.speed) > 0.5) continue;
            const ox = x - o.x, oz = z - o.z;
            const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
            if (Math.abs(ox * ofx + oz * ofz) < o.def.length * 0.5 + 0.3 && Math.abs(-ox * ofz + oz * ofx) < (o.def.width + v.def.width) * 0.5 + 0.3) ok = false;
          }
        }
        if (!ok) continue;
        rest.splice(i, 1);
        gone = true;
      }
    }
    return total - rest.length;
  }

  /**
   * Véhicule de l'unité du joueur garé derrière un autre dans sa file (fourgon du 2e groupe, de la 2e section…) : il
   * prend la place de la tête de file, qui prend la sienne (même cap, mêmes équipages). Sans cela le joueur qui prenait
   * le volant avait le fourgon de tête contre son capot — et celui-ci, qui le suit, attendait qu'il parte : il
   * n'avançait que de quelques mètres, et toute la colonne restait au stationnement.
   */
  private ownVehicleOut(me: Person): void {
    const ctx = this.ctx;
    let q = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    for (let g = 0; q && q.vehicleId === 0 && g < 8; g++) q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    const v = q && q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
    // (déjà au volant, poste de conducteur : son groupe s'est rangé près de lui, à sa place ; on ne le déplace pas)
    if (!v || me.vehicleId === v.id || PARKED_KINDS.indexOf(v.kind) < 0 || v.kind === 'moto_bravm' || Math.abs(v.speed) > 0.1) return;
    const parked = (o: Vehicle): boolean => o.faction === 'police' && PARKED_KINDS.indexOf(o.kind) >= 0 && o.kind !== 'moto_bravm'
      && Math.abs(o.speed) <= 0.1 && Math.cos(o.heading - v.heading) >= 0.94;
    /** Véhicule garé juste devant `h`, dans sa voie (null : `h` est en tête de sa file). */
    const before = (h: Vehicle): Vehicle | null => {
      const fx = Math.sin(h.heading);
      const fz = Math.cos(h.heading);
      let next: Vehicle | null = null;
      let best = Infinity;
      for (const o of ctx.vehicles.list) {
        if (o === h || o === v || !parked(o)) continue;
        const dx = o.x - h.x, dz = o.z - h.z;
        const along = dx * fx + dz * fz;
        const gap = along - (h.def.length + o.def.length) * 0.5;
        if (gap < -0.5 || gap > 4 || Math.abs(-dx * fz + dz * fx) > (h.def.width + o.def.width) * 0.5 + 0.3) continue;
        if (along < best) { best = along; next = o; }
      }
      return next;
    };
    let head = v;
    for (let guard = 0; guard < 12; guard++) {
      const next = before(head);
      if (!next) break;
      head = next;
    }
    // La tête de sa file n'est pas forcément la bonne sortie : bloc garé en travers (une rangée de véhicules côte à côte,
    // République), file nez à contresens sur une chaussée à sens unique (rue du Temple) — ses itinéraires commencent par
    // traverser les voisins ou par un demi-tour au milieu de la colonne. Il prend la tête de file du bloc d'où partent le
    // plus d'itinéraires dégagés, droit devant (à égalité, celle de sa file).
    let best = this.routesFrom(head, head.heading, [head, v]);
    const own = head;
    for (const o of ctx.vehicles.list) {
      if (best >= 8) break;
      if (o === own || o === v || !parked(o) || o.kind === 'fourgon_cellulaire' || Math.hypot(o.x - v.x, o.z - v.z) > 40 || before(o)) continue;
      const n = this.routesFrom(o, o.heading, [o, v]);
      if (n > best) { best = n; head = o; }
    }
    if (head !== v) {
      const x = v.x, z = v.z;
      v.x = head.x;
      v.z = head.z;
      head.x = x;
      head.z = z;
    }
  }

  /** Poste du joueur dans la compagnie : son commandant, le chef de la 1re section ou de son 1er groupe, ou un équipier. */
  private pickPlayer(handles: PoliceUnitHandleLike[], role: SessionConfig['role'], poste: string | null): Person | null {
    const ctx = this.ctx;
    const company = handles[0]!;
    if (role === 'commandant' || role === 'commissaire') return company.leader ? ctx.people.get(company.leader.id) ?? null : null;
    const section = company.sections && company.sections[0];
    const sectionId = section ? section.id : company.squad.id;
    const inFirstSection = (squadId: number | undefined): boolean => {
      const sq = squadId ? ctx.squads.get(squadId) : undefined;
      return !!sq && (sq.id === sectionId || sq.parentId === sectionId);
    };
    if (role === 'chef_groupe') {
      if (poste === 'chef_section' && section && section.leaderId) return ctx.people.get(section.leaderId) ?? null;
      // chef du premier groupe (appui) de la première section
      for (const g of company.groups ?? []) {
        if (g.parentId === sectionId && g.leaderId) {
          const p = ctx.people.get(g.leaderId);
          if (p && p.poste === 'chef_groupe') return p;
        }
      }
    }
    const want = poste ?? (role === 'chef_groupe' ? 'chef_groupe' : 'bouclier');
    let anywhere: Person | null = null;
    for (const ref of company.people) {
      if (ref.poste !== want) continue;
      const p = ctx.people.get(ref.id);
      if (!p) continue;
      if (inFirstSection(p.squadId)) return p;
      if (!anywhere) anywhere = p;
    }
    if (anywhere) return anywhere;
    // poste introuvable dans la composition : un équipier du premier groupe
    for (const ref of company.people) {
      const p = ctx.people.get(ref.id);
      if (p && inFirstSection(p.squadId) && p.poste !== 'conducteur') return p;
    }
    return null;
  }

  /**
   * Chef de la BRAV-M (rôle BRAV-M, poste « chef de groupe ») : le joueur est l'opérateur qui commande la BRAV-M du
   * dispositif (premier binôme, à pied près de sa moto ; en journée de service, en selle derrière son pilote, à son
   * commissariat). null : pas de BRAV-M engagée — il prend alors la tête de celle de la distribution (buildCast).
   */
  private takeBravm(handles: PoliceUnitHandleLike[], rank: PoliceRank | null, summary: SessionSetupSummary): Person | null {
    const ctx = this.ctx;
    for (const h of handles) {
      if (!h.vehicles.some((v) => ctx.vehicles.get(v.id)?.kind === 'moto_bravm')) continue;
      const leader = h.leader ? ctx.people.get(h.leader.id) : undefined;
      if (!leader || leader.faction !== 'police') continue;
      if (rank) leader.rank = rank;
      let root = leader.squadId !== 0 ? ctx.squads.get(leader.squadId) : undefined;
      for (let guard = 0; root && root.parentId !== 0 && guard < 8; guard++) root = ctx.squads.get(root.parentId);
      summary.squadId = leader.squadId;
      summary.rootSquadId = root ? root.id : summary.rootSquadId;
      summary.teammates = Math.max(0, h.people.length - 1);
      return leader;
    }
    return null;
  }

  /** Emplacement de l'équipe du joueur quand une compagnie tient déjà l'emplacement des forces : sur son flanc. */
  private besideForces(forces: Stand): Stand {
    const spot = this.spot;
    if (supportSpot(this.ctx, forces, 0, 5, [], spot)) return { x: spot.x, z: spot.z, heading: forces.heading, facing: forces.facing };
    const fx = Math.sin(forces.heading);
    const fz = Math.cos(forces.heading);
    return { x: forces.x + fz * 14 - fx * 4, z: forces.z - fx * 14 - fz * 4, heading: forces.heading, facing: forces.facing };
  }

  /**
   * Journée de service, BRAV-M du joueur qui prend son service à la même base que la compagnie : elle se range SUR LA
   * CHAUSSÉE, DEVANT la compagnie, le long des premiers mètres de la route du départ, à l'écart de ses rangs et de ses
   * véhicules — elle part la première, sans rien devant elle. Rangée sur le flanc des forces (besideForces), dans une
   * rue étroite (commissariat du 9e, rue Chauchat : 5,20 m de chaussée), ses motos se trouvaient au milieu des rangs de
   * la compagnie, qui ne pouvaient pas s'écarter : une moto restait à sa place jusqu'au départ des fourgons. null : pas
   * d'itinéraire ou pas de place libre (elle se range alors sur le flanc, comme sans journée).
   */
  private aheadOfForces(forces: Stand, tx: number, tz: number): Stand | null {
    const ctx = this.ctx;
    const path: number[] = [];
    let ok = false;
    try {
      ok = ctx.world.findPath(forces.x, forces.z, tx, tz, 'vehicle', path) && path.length >= 4;
    } catch { ok = false; }
    if (!ok) return null;
    ctx.people.rebuildIndex();
    const p = { x: 0, z: 0 };
    const spot = this.spot;
    const near: Vehicle[] = [];
    for (let s = AHEAD_MIN; s <= AHEAD_MAX; s += 6) {
      const h = pointOnPolyline(path, s, p);
      // à l'écart des véhicules et des rangs de la compagnie (sa file de départ se range derrière, journee.ts lineUp)
      if (ctx.vehicles.queryRadius(p.x, p.z, AHEAD_CLEAR, near) > 0 || ctx.people.countIn(p.x, p.z, AHEAD_CLEAR) > 0) continue;
      if (!roadSpot(ctx, p.x, p.z, 12, 3, spot) || Math.hypot(spot.x - p.x, spot.z - p.z) > 12) continue;
      return { x: spot.x, z: spot.z, heading: h, facing: forces.facing };
    }
    return null;
  }

  /**
   * Mode « salle de commandement » : le commandant n'est pas au contact ; il est installé dans le véhicule de commandement
   * de sa compagnie (le poste de commandement mobile tient lieu de salle), caméra tactique. Les sommations sont alors
   * prononcées sur son ordre par un officier (carte tactique : service 'police.command', requestSommation).
   */
  private seatInCommandRoom(player: Person): void {
    const ctx = this.ctx;
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (const v of ctx.vehicles.list) {
      if (v.kind !== 'vl_commandement') continue;
      const d = Math.hypot(v.x - player.x, v.z - player.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) ctx.vehicles.enter(player, best, 'passenger');
    ctx.player.setCameraMode('tactical');
    // l'adjoint (officier IA le plus gradé de la compagnie) porte l'insigne tricolore et somme sur ordre
    const rank: Record<string, number> = { capitaine: 5, major: 4, brigadier_chef: 3, brigadier: 2, gardien: 1 };
    let deputy: Person | null = null;
    for (const p of ctx.people.list) {
      if (p.isPlayer || p.faction !== 'police' || p.kind !== 'crs' || p.vehicleId !== 0) continue;
      if (!deputy || (rank[p.rank ?? ''] ?? 0) > (rank[deputy.rank ?? ''] ?? 0)) deputy = p;
    }
    if (deputy) {
      deputy.look.sash = true;
      if (ctx.actions.has(deputy, 'megaphone') === 0) ctx.actions.give(deputy, 'megaphone');
      if (ctx.actions.has(deputy, 'fusee_sommation') === 0) ctx.actions.give(deputy, 'fusee_sommation');
    }
  }

  /**
   * BRAV-M, poste passager (roster : trois binômes sous « BRAV-M 1 ») : chaque binôme se met en selle, pilote au guidon
   * et opérateur derrière — le joueur derrière le pilote de son binôme — et le chef de groupe de l'IA (opérateur du
   * premier binôme) commande le groupe. Le joueur commençait à pied, à côté de motos sans pilote, chef d'une unité
   * qu'il ne pouvait pas conduire : la BRAV-M partait sans lui, ou ne partait pas. false : joueur non monté.
   */
  private mountBravm(player: Person): boolean {
    const ctx = this.ctx;
    const own = player.squadId !== 0 ? ctx.squads.get(player.squadId) : undefined;
    const group = own && own.kind === 'binome' && own.parentId !== 0 ? ctx.squads.get(own.parentId) : undefined;
    if (!group) return false;
    let seated = false;
    for (const b of ctx.squads.childrenOf(group.id)) {
      const v = b.kind === 'binome' && b.vehicleId !== 0 ? ctx.vehicles.get(b.vehicleId) : undefined;
      if (!v || v.kind !== 'moto_bravm' || v.seats.some((id) => id !== 0)) continue;
      const crew = b.members.map((id) => ctx.people.get(id)).filter((p): p is Person => !!p && p.vehicleId === 0);
      const pilot = crew.find((p) => p.poste === 'pilote_moto');
      const op = crew.find((p) => p.poste !== 'pilote_moto');
      if (!pilot || !op || !ctx.vehicles.enter(pilot, v, 'driver')) continue;
      if (!ctx.vehicles.enter(op, v, 'passenger')) continue;
      // le binôme est commandé par son opérateur ; le groupe, par l'opérateur du premier binôme (chef de groupe)
      b.leaderId = op.id;
      if (group.leaderId === 0 && !op.isPlayer) group.leaderId = op.id;
      // (chef de la BRAV-M : c'est lui qui commande le groupe)
      if (op === player && player.poste === 'chef_groupe') group.leaderId = player.id;
      if (op === player) seated = true;
    }
    return seated;
  }

  /**
   * Escorte d'un engin conduit par le joueur : le groupe de CRS le plus proche quitte sa section (le commandant IA
   * ne lui donne plus de poste) et passe sous l'équipage du joueur ; il suit l'engin à pied.
   */
  private attachEscort(player: Person, crew: Squad, alone = false): void {
    const ctx = this.ctx;
    let best: Squad | null = null;
    let bestD = Infinity;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.kind !== 'groupe' || s.id === crew.id || s.members.length < 3 || s.leaderId === player.id) continue;
      const lead = ctx.people.get(s.leaderId) ?? ctx.people.get(s.members[0]!);
      if (!lead) continue;
      const d = Math.hypot(lead.x - player.x, lead.z - player.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && bestD < 400) {
      best.parentId = crew.id;
      // équipage du Centaure : seul le groupe d'escorte suit l'engin, la compagnie reste à sa mission (session/follow.ts,
      // wholeCompanies) — son fourgon, enfermé dans le bloc, quitte le bloc et se gare derrière l'engin, dans son axe.
      // (Canon à eau : toute la compagnie suit le joueur en colonne, le fourgon sort du bloc avec les autres.)
      const van = alone && best.vehicleId !== 0 ? ctx.vehicles.get(best.vehicleId) : undefined;
      const engine = crew.vehicleId !== 0 ? ctx.vehicles.get(crew.vehicleId) : undefined;
      if (van && engine && van !== engine) this.escortVanOut(van, engine);
      ctx.radio.say({ channel: 'unite', from: crew.name, text: `${best.name}, vous escortez l’engin : suivez-nous.`, priority: 1, personId: player.id });
    }
  }

  /**
   * Fourgon du groupe d'escorte du Centaure : garé au milieu du bloc de la compagnie, il n'en
   * sortait pas — les fourgons devant lui, partis à leurs propres ordres (ligne, tenir), s'y attendaient les uns les
   * autres (Bastille, gendarme du Centaure : fourgon d'escorte resté à sa place, l'engin parti seul). Il prend une place
   * libre derrière l'engin, dans son axe (ou sur une file voisine), avec une sortie. Aucune place : il reste où il est.
   */
  private escortVanOut(van: Vehicle, engine: Vehicle): void {
    const ctx = this.ctx;
    if (Math.abs(van.speed) > 0.1 || PARKED_KINDS.indexOf(van.kind) < 0) return;
    // (seulement s'il est enfermé : un véhicule garé juste devant lui dans sa file — sinon il sort du bloc avec les autres)
    const hx = Math.sin(van.heading), hz = Math.cos(van.heading);
    const shut = ctx.vehicles.list.some((o) => {
      if (o === van || o.faction !== 'police' || o.def.flying || Math.abs(o.speed) > 0.1) return false;
      const dx = o.x - van.x, dz = o.z - van.z;
      const gap = dx * hx + dz * hz - (van.def.length + o.def.length) * 0.5;
      return gap > -0.5 && gap < 4 && Math.abs(-dx * hz + dz * hx) < (van.def.width + o.def.width) * 0.5 + 0.3;
    });
    if (!shut) return;
    const fx = Math.sin(engine.heading);
    const fz = Math.cos(engine.heading);
    const hl = van.def.length * 0.5;
    const hw = van.def.width * 0.5;
    const fits = (x: number, z: number): boolean => {
      for (const k of [-1, 0, 1]) {
        const px = x + fx * k * (hl - hw), pz = z + fz * k * (hl - hw);
        if (!ctx.world.isFree(px, pz, hw + 0.2)) return false;
        const sf = ctx.world.surfaceAt(px, pz);
        if (sf === 'park' || sf === 'water' || sf === 'building' || sf === 'interior') return false;
      }
      for (const o of ctx.vehicles.list) {
        if (o === van || o.def.flying) continue;
        if (Math.hypot(o.x - x, o.z - z) < hl + Math.max(o.def.length, o.def.width) * 0.5 + 1.2) return false;
      }
      if (ctx.props.queryRadius(x, z, hl + 0.3, propsScratch as never[], (q) => q.blocksMove) > 0) return false;
      if (ctx.people.countIn(x, z, hl + 0.6, (q) => q.vehicleId === 0) > 0) return false;
      return hasWayOut(ctx, x, z, Math.min(1.2, hw));
    };
    for (let back = engine.def.length * 0.5 + hl + 3; back <= 40; back += 3) {
      for (const lat of [0, 3.5, -3.5]) {
        const x = engine.x - fx * back - fz * lat;
        const z = engine.z - fz * back + fx * lat;
        if (!fits(x, z)) continue;
        van.x = x;
        van.z = z;
        van.heading = engine.heading;
        van.vx = 0;
        van.vz = 0;
        return;
      }
    }
  }

  /**
   * « Tout le monde me suit » : les unités les plus hautes que le joueur commande (celle dont l'échelon supérieur n'est
   * pas aussi le sien) reçoivent « suivre » sur lui ; leurs subordonnées suivent avec elles (module de police : un ordre
   * de formation vaut pour toute la descendance). Commandant : la compagnie, sa BRAV-M, ses engins et ses fourgons
   * cellulaires ; chef de section : la section et ses trois groupes ; chef de groupe, chef d'engin : son unité.
   */
  private everyoneFollows(player: Person): void {
    const ctx = this.ctx;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.leaderId !== player.id) continue;
      const parent = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
      if (parent && parent.leaderId === player.id) continue;
      // (une unité vide — groupe sans personne, section sans groupe — n'a rien à faire suivre)
      if (s.members.length === 0 && ctx.squads.childrenOf(s.id).length === 0) continue;
      ctx.squads.issue(s.id, { type: 'suivre', targetId: player.id, issuedBy: player.id });
    }
  }

  /**
   * Forces de l'ordre sans compagnie (aucun fourgon cellulaire engagé) : un fourgon avec son équipage, au point de
   * remise derrière les forces (dos au lieu), à défaut sur leurs flancs ou sur la chaussée la plus proche. Unité de tête,
   * hors de toute unité : la BRAV-M qui interpelle le trouve parmi les fourgons du dispositif.
   */
  private loneCellular(forces: Stand, summary: SessionSetupSummary): void {
    const ctx = this.ctx;
    if (this.remise.vans().length > 0) return;
    const units = ctx.service<PoliceUnitsLike>('police.units');
    if (!units || typeof units.createEquipage !== 'function') return;
    let police = false;
    for (const p of ctx.people.list) if (p.faction === 'police') { police = true; break; }
    if (!police) return;
    const def = ctx.vehicles.def('fourgon_cellulaire');
    const len = def ? def.length : 6;
    const wid = def ? def.width : 2.05;
    const away = wrapAngle(forces.heading + Math.PI);
    const spot = this.spot;
    const at = (band?: readonly [number, number]): boolean =>
      remiseSpot(ctx, forces.x, forces.z, Math.sin(away), Math.cos(away), { taken: [], van: null, len, wid, people: true, band }, spot);
    const placed = at() || at(REMISE_WIDE)
      || remiseNearest(ctx, forces.x, forces.z, Math.sin(away), Math.cos(away), { taken: [], van: null, len, wid, people: true }, spot);
    if (!placed && !supportSpot(ctx, forces, 0, 3.5, [], spot) && !roadSpot(ctx, forces.x, forces.z, len, wid, spot)) {
      console.warn('[session] pas de place pour un fourgon cellulaire près des forces : aucun engagé');
      return;
    }
    try {
      const h = units.createEquipage('fourgon_cellulaire', { x: spot.x, z: spot.z, heading: spot.heading, seed: cellSeed(ctx, 0) });
      for (const p of h.people) if (ctx.people.get(p.id)) this.people.push(p.id);
      for (const v of h.vehicles) if (ctx.vehicles.get(v.id)) summary.vehicleIds.push(v.id);
      this.remise.track(0, [h.squad.id], away, placed ? { x: forces.x, z: forces.z } : null, placed ? [{ x: spot.x, z: spot.z, heading: spot.heading }] : []);
    } catch (err) {
      console.error('[session] création du fourgon cellulaire impossible', err);
      if (getCore(ctx).strict) throw err;
    }
  }

  /** Recense les moyens réellement présents (ce que la page d'accueil a demandé et qui a pu être placé). */
  private countMeans(summary: SessionSetupSummary): void {
    const ctx = this.ctx;
    const m: EngagedMeans = summary.means;
    m.agents = 0;
    for (const p of ctx.people.list) if (p.faction === 'police') m.agents++;
    m.sections = 0;
    m.bravm = 0;
    for (const sq of ctx.squads.list) {
      if (sq.faction !== 'police') continue;
      if (sq.kind === 'section' && sq.name.indexOf('FAUCON') < 0) m.sections++;
    }
    m.fourgons = m.centaure = m.canon_eau = m.drone = 0;
    let motos = 0;
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police') continue;
      if (v.kind === 'fourgon_crs') m.fourgons++;
      else if (v.kind === 'centaure') m.centaure++;
      else if (v.kind === 'canon_eau') m.canon_eau++;
      else if (v.kind === 'moto_bravm') motos++;
      else if (v.kind === 'drone') m.drone++;
    }
    m.bravm = Math.ceil(motos / 6);
    m.cellulaires = 0;
    for (const id of this.remise.vans()) {
      const sq = ctx.squads.get(id);
      const v = sq && sq.vehicleId !== 0 ? ctx.vehicles.get(sq.vehicleId) : undefined;
      if (v && v.kind === 'fourgon_cellulaire') m.cellulaires++;
    }
    // le drone est un engin déployé par son télépilote : on compte les équipes
    if (m.drone === 0) for (const p of ctx.people.list) if (p.faction === 'police' && p.poste === 'telepilote' && !p.isPlayer) m.drone++;
  }

  // ───────────────────────────── création directe ─────────────────────────────

  private buildCast(cast: Cast, stand: Stand, helper: SpawnHelperApi | undefined, rand: () => number, summary: SessionSetupSummary): Person | null {
    const ctx = this.ctx;
    const pos = this.pos;
    const fx = Math.sin(stand.heading);
    const fz = Math.cos(stand.heading);
    const rx = -fz;
    const rz = fx;

    // unités
    const squads: Squad[] = [];
    for (const def of cast.squads) {
      const parent = def.parent >= 0 ? squads[def.parent] : undefined;
      squads.push(ctx.squads.create(def.kind, def.faction, def.name, parent ? parent.id : 0));
    }

    // véhicules stationnés derrière le front (créés d'abord : les conducteurs se tiennent à leur portière)
    const vehicles: Vehicle[] = [];
    const hit = this.hit;
    const faction = cast.squads[0]?.faction ?? 'police';
    for (let i = 0; i < cast.vehicles.length; i++) {
      const kind = cast.vehicles[i]!;
      const def = ctx.vehicles.def(kind);
      const length = def ? def.length : 5;
      const width = def ? def.width : 2;
      // (et, à côté du bloc d'une compagnie, une place à l'écart de ses véhicules : République, la voiture de l'équipe
      // drone, garée en queue du bloc, à 7 m du cellulaire, n'en sortait qu'en se faufilant entre les fourgons — plus
      // d'une minute de manœuvres)
      const reachable = (px: number, pz: number): boolean =>
        (!ctx.world.raycast(stand.x, stand.z, px, pz, hit) || (hit.kind !== 'building' && hit.kind !== 'barrier'))
        && (!summary.usedPoliceUnits || PARKED_KINDS.indexOf(kind) < 0 || kind === 'moto_bravm' || !this.nearBlock(px, pz, length, vehicles));
      // derrière l'unité ; à défaut (place prise par une compagnie, parvis piéton), sur la chaussée la plus proche
      // jamais derrière une grille ou un mur qui le sépare de l'unité (Concorde : motos de la BRAV-M garées dans
      // l'entrée des Tuileries, de l'autre côté de la grille, pilotes coupés de leur chef)
      if (!parkingSpot(ctx, stand, i, length, width, this.spot, reachable)
        && !roadSpot(ctx, stand.x, stand.z, length, width, this.spot)) continue;
      const v = ctx.vehicles.spawn(kind, this.spot.x, this.spot.z, this.spot.heading, { faction });
      v.cmd.handbrake = true;
      vehicles.push(v);
      summary.vehicleIds.push(v.id);
    }
    // garé nez vers la sortie par parkingSpot (dos à l'unité) — mais le bloc de la compagnie, garé plus loin derrière
    // l'unité, est alors droit devant lui (République : la voiture de l'équipe drone n'en sortait qu'en le traversant,
    // et la colonne, qui l'attendait garée, ne partait jamais) : même choix du sens de sortie que pour les véhicules
    // de la compagnie (faceExit)
    for (const v of vehicles) if (PARKED_KINDS.indexOf(v.kind) >= 0 && v.kind !== 'moto_bravm') this.faceExit({ vehicles: [v] });
    if (vehicles.length > 0 && squads.length > 0) {
      // un véhicule par unité, dans l'ordre : groupes d'abord quand il y en a, sinon l'unité de tête
      const leaf = squads.filter((s) => ctx.squads.childrenOf(s.id).length === 0);
      for (let i = 0; i < leaf.length && i < vehicles.length; i++) leaf[i]!.vehicleId = vehicles[i]!.id;
      if (squads[0]!.vehicleId === 0) squads[0]!.vehicleId = vehicles[0]!.id;
    }

    // rangs : boucliers devant, appui derrière, commandement au troisième rang ; les rangs vides sont resserrés
    const rows: number[][] = [[], [], []];
    const atVehicles: number[] = [];
    for (let i = 0; i < cast.slots.length; i++) {
      const r = rankOf(cast.slots[i]!);
      if (r < 0 && vehicles.length > 0) atVehicles.push(i);
      else rows[r < 0 ? 2 : r]!.push(i);
    }
    const filled = rows.filter((row) => row.length > 0);

    let player: Person | null = null;
    const spawnAt = (index: number, px: number, pz: number): void => {
      const slot = cast.slots[index]!;
      pos.x = px;
      pos.z = pz;
      settle(ctx, pos, 0.35, rand);
      const p = this.spawn(slot, pos.x, pos.z, stand.heading, helper, index);
      if (!p) return;
      this.people.push(p.id);
      const squad = slot.squad >= 0 ? squads[slot.squad] : undefined;
      if (squad) {
        ctx.squads.addMember(squad.id, p.id);
        if (slot.leads !== '') ctx.squads.setLeader(squad.id, p.id);
      }
      if (index === cast.player) player = p;
    };

    for (let r = 0; r < filled.length; r++) {
      const row = filled[r]!;
      for (let j = 0; j < row.length; j++) {
        const lateral = (j - (row.length - 1) / 2) * FILE_SPACING;
        spawnAt(row[j]!, stand.x + rx * lateral - fx * RANK_DEPTH * r, stand.z + rz * lateral - fz * RANK_DEPTH * r);
      }
    }
    // conducteurs et pilotes : à la portière de leur véhicule (côté gauche), tournés comme lui
    for (let k = 0; k < atVehicles.length; k++) {
      const v = vehicles[k % vehicles.length]!;
      const vfx = Math.sin(v.heading);
      const vfz = Math.cos(v.heading);
      const side = v.def.width * 0.5 + 0.75 + Math.floor(k / vehicles.length) * 0.9;
      // gauche du véhicule = −droite = (cos h, −sin h)
      spawnAt(atVehicles[k]!, v.x + vfz * side + vfx * v.def.length * 0.22, v.z - vfx * side + vfz * v.def.length * 0.22);
    }

    // l'unité de tête a toujours un chef : à défaut de poste désigné, le plus gradé (règle du magasin)
    const found = player as Person | null;
    if (found) {
      summary.squadId = found.squadId;
      let root = found.squadId !== 0 ? ctx.squads.get(found.squadId) : undefined;
      for (let guard = 0; root && root.parentId !== 0 && guard < 8; guard++) root = ctx.squads.get(root.parentId);
      summary.rootSquadId = root ? root.id : 0;
    }
    summary.teammates = Math.max(0, this.people.length - (found ? 1 : 0));
    return found;
  }

  private spawn(slot: CastSlot, x: number, z: number, heading: number, helper: SpawnHelperApi | undefined, index: number): Person | null {
    const ctx = this.ctx;
    const seed = (ctx.session.config?.seed ?? 1) * 131 + index * 17 + 7;
    try {
      let p: Person;
      if (helper && slot.profile === undefined) {
        p = helper.spawnUnitSlot(slot, x, z, { heading, seed });
      } else {
        p = ctx.archetypes.spawn(slot.kind, x, z, {
          heading, seed, poste: slot.poste, rank: slot.rank, profile: slot.profile ?? null,
        });
      }
      p.aimYaw = heading;
      p.cmd.aimYaw = heading;
      p.cmd.faceMove = false;
      p.y = ctx.world.heightAt(p.x, p.z);
      return p;
    } catch (err) {
      console.error(`[session] création de « ${slot.label} » impossible`, err);
      if (getCore(ctx).strict) throw err;
      return null;
    }
  }

  // ───────────────────────────── passants ─────────────────────────────

  private spawnBystanders(config: SessionConfig, stand: Stand, x: number, z: number, rand: () => number): number {
    const ctx = this.ctx;
    const wanted = config.extra ? config.extra['passants'] : undefined;
    const count = typeof wanted === 'number' && Number.isFinite(wanted) ? Math.max(0, Math.min(40, Math.round(wanted))) : DEFAULT_BYSTANDERS;
    const pos = this.pos;
    let made = 0;
    for (let tries = 0; made < count && tries < count * 8; tries++) {
      if (!ctx.world.randomFreePoint(x, z, BYSTANDER_REACH, 'sidewalk', rand, pos)) continue;
      if (Math.hypot(pos.x - stand.x, pos.z - stand.z) < BYSTANDER_CLEAR) continue;
      if (ctx.people.countIn(pos.x, pos.z, 1.5) > 0 || !ctx.world.isFree(pos.x, pos.z, 0.5)) continue;
      ctx.props.resolveCircle(pos, 0.4);
      const kind: PersonKind = rand() < 0.3 ? 'touriste' : 'passant';
      // un touriste regarde le lieu ; un passant va son chemin (cap quelconque)
      const heading = kind === 'touriste' ? Math.atan2(x - pos.x, z - pos.z) : rand() * Math.PI * 2 - Math.PI;
      try {
        const p = ctx.archetypes.spawn(kind, pos.x, pos.z, { heading, seed: 9000 + made * 31 + (config.seed | 0) });
        p.aimYaw = heading;
        p.cmd.aimYaw = heading;
        p.y = ctx.world.heightAt(p.x, p.z);
        this.people.push(p.id);
        made++;
      } catch (err) {
        console.error('[session] création d’un passant impossible', err);
        if (getCore(ctx).strict) throw err;
        break;
      }
      // l'index spatial sert à espacer les suivants
      ctx.people.rebuildIndex();
    }
    return made;
  }

  // ───────────────────────────── réglages de scénario ─────────────────────────────

  /**
   * Réglages de la page d'accueil qui passent par des services : vent, circulation coupée, stations de métro
   * fermées (rayon SCENARIO_AREA_RADIUS autour du lieu). Fait ici, une seule fois, pour toute session — la page
   * d'accueil ne les applique plus elle-même quand ce module est branché.
   */
  private applyScenario(config: SessionConfig, x: number, z: number, byId: EntityId): void {
    const ctx = this.ctx;
    const extra = config.extra;
    if (!extra) return;
    const vent = extra['vent'] as { direction?: unknown; vitesse?: unknown } | undefined;
    if (vent && typeof vent.direction === 'number' && typeof vent.vitesse === 'number' && Number.isFinite(vent.direction) && Number.isFinite(vent.vitesse)) {
      // le vent VIENT de `direction` (0 = nord, 90 = est) : il souffle vers l'azimut opposé (x = est, z = sud)
      const to = ((vent.direction + 180) * Math.PI) / 180;
      const speed = Math.max(0, vent.vitesse) / 3.6;
      ctx.env.setWind(Math.sin(to) * speed, -Math.cos(to) * speed);
    }
    const options = extra['options'] as { circulation?: unknown; metro?: unknown } | undefined;
    if (!options) return;
    try {
      if (options.circulation === 'coupee') ctx.service<TrafficControlApi>(EXT.traffic)?.closeArea(x, z, SCENARIO_AREA_RADIUS, byId);
      if (options.metro === 'ferme') {
        const metro = ctx.service<MetroApi>(EXT.metro);
        if (metro) {
          for (const station of metro.stations) {
            if (station.open && Math.hypot(station.x - x, station.z - z) <= SCENARIO_AREA_RADIUS) metro.setOpen(station.id, false, byId);
          }
        }
      }
    } catch (err) {
      console.error('[session] application des réglages du scénario impossible', err);
    }
  }
}
