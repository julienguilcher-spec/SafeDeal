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
 * ===================================================================================== */

import type {
  CameraMode, EntityId, GameContext, GameSystem, Person, PersonKind, RayHit, SessionConfig, Squad, Unsubscribe, Vec2, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { getCore } from '@/core/context';
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
import { FILE_SPACING, RANK_DEPTH, chooseStand, chooseStandOffCrowd, parkingSpot, settle, supportSpot } from './placement';
import type { Stand } from './placement';
import { castFor, isPoliceRole, meansOf, rankOf } from './roster';
import type { Cast, CastSlot, RequestedMeans } from './roster';
import { SERVICE_BASE, isJournee } from './journee-data';

/** Sections par compagnie (au-delà, les sections suivantes lui sont rattachées en renfort). */
const COMPANY_SECTIONS = 4;
const COMPANY_LAYOUT: 'colonne' | 'ligne' = 'ligne';
/** Rôles où le joueur commande sa petite unité : elle le suit à pied et en véhicule (voir follow.ts). */
const LEADER_ROLES: ReadonlySet<string> = new Set(['chef_groupe', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote']);
/** Véhicules de l'unité que l'on gare nez vers la sortie (les engins à équipage restent face au front). */
const PARKED_KINDS: readonly string[] = ['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'voiture_police', 'moto_bravm'];
const isProtester = (p: { faction: string }): boolean => p.faction === 'protest';

const DEFAULT_BYSTANDERS = 10;
const BYSTANDER_REACH = 120;
/** Les passants ne se tiennent pas dans les jambes de l'unité. */
const BYSTANDER_CLEAR = 16;

export class SessionSetupSystem implements GameSystem {
  readonly id = SESSION_SETUP_SYSTEM_ID;
  readonly order = SystemOrder.RULES - 100;

  private ctx!: GameContext;
  private summary_: SessionSetupSummary | null = null;
  private readonly people: EntityId[] = [];
  private readonly offs: Unsubscribe[] = [];
  private readonly progressEvent: LoadingProgress = { progress: 0, label: '' };
  private readonly pos: Vec2 = { x: 0, z: 0 };
  private readonly hit: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  private readonly spot = { x: 0, z: 0, heading: 0 };

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
  }

  init(ctx: GameContext): void {
    this.offs.push(ctx.events.on('session:started', ({ config }) => this.onStarted(config)));
  }

  reset(): void {
    this.summary_ = null;
    this.people.length = 0;
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
      const apart = crowd && !journee ? chooseStandOffCrowd(ctx, x, z, ctx.director.route, isProtester) : null;
      const forces = journee ? chooseStand(ctx, SERVICE_BASE.x, SERVICE_BASE.z, rand) : apart ?? chooseStand(ctx, x, z, rand);
      const withForces = isPoliceRole(config.role) || config.role === 'secouriste';
      // le joueur manifestant, journaliste ou secouriste de rue est, lui, sur le lieu même
      let stand = withForces || !apart ? forces : chooseStand(ctx, x, z, rand);
      const summary: SessionSetupSummary = {
        playerId: 0, role: config.role, x: stand.x, z: stand.z, heading: stand.heading, squadId: 0, rootSquadId: 0,
        teammates: 0, vehicleIds: [], bystanders: 0, usedPoliceUnits: false, offCrowd: apart !== null,
        means: { agents: 0, sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0 },
      };

      let player = this.buildWithPoliceUnits(config, cast, forces, meansOf(config), crowd, summary);
      if (!player) {
        // l'équipe du joueur est créée directement ; si une compagnie tient déjà l'emplacement, elle se range à côté
        if (summary.usedPoliceUnits && withForces) stand = this.besideForces(forces);
        summary.x = stand.x;
        summary.z = stand.z;
        summary.heading = stand.heading;
        player = this.buildCast(cast, stand, helper, rand, summary);
      }
      this.countMeans(summary);

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
        // rôles à responsabilité : le joueur prend la tête de son unité (BRAV-M, équipage d'engin, équipe du drone)
        if (LEADER_ROLES.has(config.role) && player.squadId !== 0) {
          const own = ctx.squads.get(player.squadId);
          if (own && own.faction === 'police' && own.leaderId !== player.id) ctx.squads.setLeader(own.id, player.id);
          // canon à eau, Centaure : un groupe de CRS de la compagnie l'escorte et le suit
          if (own && (config.role === 'operateur_canon_eau' || config.role === 'gendarme_centaure')) this.attachEscort(player, own);
        }
        // le joueur chef d'une unité (groupe, section) : son unité le suit tant qu'il ne lui donne pas d'autre ordre
        if (config.role !== 'commandant' && config.role !== 'commissaire') {
          for (const s of ctx.squads.list) {
            if (s.faction === 'police' && s.leaderId === player.id && s.members.length > 1) {
              ctx.squads.issue(s.id, { type: 'suivre', targetId: player.id, issuedBy: player.id });
            }
          }
        }
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
   */
  private cameraOf(config: SessionConfig, player: Person, heading: number): CameraMode {
    const v = config.extra ? config.extra['camera'] : undefined;
    if (v === 'tps' || v === 'fps') return v;
    if (player.vehicleId !== 0) return 'fps';
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
      const wantCompany = commander || (crowd && (means !== null || foot));
      if (wantCompany && typeof units.createCompany === 'function') {
        // sans réglage (session lancée par l'URL) : une section et ses trois fourgons
        const asked: RequestedMeans = means ?? { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0 };
        const handles = this.buildCompany(units, stand, asked, summary);
        if (handles.length === 0) return null;
        summary.usedPoliceUnits = true;
        summary.rootSquadId = handles[0]!.squad.id;
        if (!foot || !mine) return null;
        const person = this.pickPlayer(handles, role, mine.poste);
        if (!person) return null;
        if (mine.rank) person.rank = mine.rank;
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
    const special = (make: (x: number, z: number, heading: number) => PoliceUnitHandleLike | undefined, radius: number, what: string, rearLane = 0): void => {
      // (pour des machines à ranger en file : d'abord avec toute la bande libre derrière, sinon avec la moitié)
      if (!supportSpot(ctx, stand, index, radius, taken, spot, rearLane) && !(rearLane > 0 && supportSpot(ctx, stand, index, radius, taken, spot, rearLane * 0.6))) {
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
    if (typeof units.createEquipage === 'function') {
      for (let i = 0; i < means.canon_eau; i++) special((x, z, heading) => units.createEquipage!('canon_eau', { x, z, heading, parentId }), 5.5, 'l’engin lanceur d’eau');
      for (let i = 0; i < means.centaure; i++) special((x, z, heading) => units.createEquipage!('centaure', { x, z, heading, parentId }), 4.5, 'le Centaure');
    }
    if (typeof units.createBravm === 'function') {
      for (let i = 0; i < means.bravm; i++) {
        special((x, z, heading) => units.createBravm!(6, { x, z, heading, vehicles: true, mounted: false, callsign: means.bravm > 1 ? `FAUCON ${i + 1}` : undefined }), 3, 'la BRAV-M', 44);
      }
    }
    const command = ctx.service<PoliceCommandLike>('police.command');
    if (command && typeof command.createDroneTeam === 'function') {
      for (let i = 0; i < means.drone; i++) special((x, z, heading) => command.createDroneTeam!({ x, z, heading, parentId }), 2, 'l’équipe du drone');
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
   * Véhicules de l'unité garés nez vers la sortie (dos à l'unité) : prêts à repartir, et celui qui prend le volant
   * et roule tout droit s'éloigne de ses collègues au lieu de leur passer dessus. Demi-tour sur place (même emprise).
   */
  private faceExit(handle: PoliceUnitHandleLike): void {
    const ctx = this.ctx;
    for (const ref of handle.vehicles) {
      const v = ctx.vehicles.get(ref.id);
      if (!v || PARKED_KINDS.indexOf(v.kind) < 0 || Math.abs(v.speed) > 0.1) continue;
      let h = (v.heading + Math.PI) % (Math.PI * 2);
      if (h > Math.PI) h -= Math.PI * 2;
      v.heading = h;
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

  /** Emplacement de l'équipe du joueur quand une compagnie tient déjà l'emplacement des forces : sur son flanc. */
  private besideForces(forces: Stand): Stand {
    const spot = this.spot;
    if (supportSpot(this.ctx, forces, 0, 5, [], spot)) return { x: spot.x, z: spot.z, heading: forces.heading, facing: forces.facing };
    const fx = Math.sin(forces.heading);
    const fz = Math.cos(forces.heading);
    return { x: forces.x + fz * 14 - fx * 4, z: forces.z - fx * 14 - fz * 4, heading: forces.heading, facing: forces.facing };
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
   * Escorte d'un engin conduit par le joueur : le groupe de CRS le plus proche quitte sa section (le commandant IA
   * ne lui donne plus de poste) et passe sous l'équipage du joueur ; il suit l'engin à pied.
   */
  private attachEscort(player: Person, crew: Squad): void {
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
      ctx.radio.say({ channel: 'unite', from: crew.name, text: `${best.name}, vous escortez l’engin : suivez-nous.`, priority: 1, personId: player.id });
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
    const faction = cast.squads[0]?.faction ?? 'police';
    for (let i = 0; i < cast.vehicles.length; i++) {
      const kind = cast.vehicles[i]!;
      const def = ctx.vehicles.def(kind);
      const length = def ? def.length : 5;
      const width = def ? def.width : 2;
      if (!parkingSpot(ctx, stand, i, length, width, this.spot)) continue;
      const v = ctx.vehicles.spawn(kind, this.spot.x, this.spot.z, this.spot.heading, { faction });
      v.cmd.handbrake = true;
      vehicles.push(v);
      summary.vehicleIds.push(v.id);
    }
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
