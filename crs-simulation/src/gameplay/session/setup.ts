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
 * pilote personne (les collègues restent en place tant qu'aucune IA ne leur écrit de commande).
 * ===================================================================================== */

import type {
  CameraMode, EntityId, GameContext, GameSystem, Person, PersonKind, SessionConfig, Squad, Unsubscribe, Vec2, Vehicle,
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
import type { LoadingProgress, PoliceUnitsLike, SessionSetupApi, SessionSetupSummary } from './api';
import { FILE_SPACING, RANK_DEPTH, chooseStand, parkingSpot, settle } from './placement';
import type { Stand } from './placement';
import { castFor, rankOf } from './roster';
import type { Cast, CastSlot } from './roster';

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
      const stand = chooseStand(ctx, x, z, rand);
      const helper = ctx.service<SpawnHelperApi>('roles.spawn');
      const cast = castFor(config, helper);
      const summary: SessionSetupSummary = {
        playerId: 0, role: config.role, x: stand.x, z: stand.z, heading: stand.heading, squadId: 0, rootSquadId: 0,
        teammates: 0, vehicleIds: [], bystanders: 0, usedPoliceUnits: false,
      };

      let player = this.buildWithPoliceUnits(config, cast, stand, summary);
      if (!player) player = this.buildCast(cast, stand, helper, rand, summary);

      if (player) {
        // le joueur regarde ce que regarde son unité
        player.heading = stand.heading;
        player.aimYaw = stand.heading;
        player.aimPitch = 0;
        ctx.player.possess(player.id, config.role);
        const st = ctx.player.state;
        st.camYaw = stand.heading;
        st.camPitch = 0;
        st.controlEnabled = true;
        ctx.player.setCameraMode(this.cameraOf(config));
        ctx.service<RenderCameraApi>('render.camera')?.cut();
        summary.playerId = player.id;
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

  private cameraOf(config: SessionConfig): CameraMode {
    const v = config.extra ? config.extra['camera'] : undefined;
    return v === 'tps' ? 'tps' : 'fps';
  }

  // ───────────────────────────── unités par le module d'IA de police ─────────────────────────────

  /**
   * Quand le service 'police.units' est branché, c'est lui qui construit le groupe ou la section (ses agents
   * sont alors pilotés par l'IA). Retourne la personne du joueur, ou null pour passer à la création directe.
   */
  private buildWithPoliceUnits(config: SessionConfig, cast: Cast, stand: Stand, summary: SessionSetupSummary): Person | null {
    const ctx = this.ctx;
    const units = ctx.service<PoliceUnitsLike>('police.units');
    if (!units || (config.role !== 'crs' && config.role !== 'chef_groupe')) return null;
    const mine = cast.slots[cast.player];
    if (!mine) return null;
    try {
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
      summary.squadId = person.squadId;
      summary.rootSquadId = handle.squad.id;
      summary.teammates = handle.people.length - 1;
      summary.usedPoliceUnits = true;
      return person;
    } catch (err) {
      console.error('[session] construction de l’unité par « police.units » impossible : création directe', err);
      return null;
    }
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
