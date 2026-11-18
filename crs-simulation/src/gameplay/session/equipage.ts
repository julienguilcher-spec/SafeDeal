/* =====================================================================================
 * MISE EN PLACE DE SESSION — équipage de patrouille du joueur (rôle 'patrouille').
 *
 * Le joueur part à bord de sa voiture, garée au bord de la chaussée, dans le sens de la circulation, ses deux
 * collègues à bord : BAC (en civil, voiture banalisée 'voiture_bac') ou Police secours (en tenue, voiture
 * sérigraphiée). Il tient le volant (poste 'conducteur') ou la place du chef de bord (poste 'interpellation', passager
 * avant) ; dans les deux cas il commande l'équipage (chef de l'unité). Aucun ordre « suivre » n'est donné à bord.
 *
 * Point de départ :
 *   - vacation (extra.vacation, src/gameplay/patrols/model.ts) : le secteur BAC ou le commissariat choisi ;
 *   - Mode libre avec une manifestation : à l'écart du rassemblement et du couloir du parcours ;
 *   - sinon : près du lieu de la session.
 * La compagnie habituelle du Mode libre (moyens engagés) est construite à part, par la mise en place (setup.ts),
 * AVANT l'équipage : la voiture se gare là où ses fourgons ne sont pas.
 *
 * Service publié par la mise en place : ctx.service<EquipageApi>('session.equipage') — l'équipage du joueur (unité,
 * voiture, indicatif), null hors rôle de patrouille ou avant la mise en place.
 * ===================================================================================== */

import type {
  EntityId, GameContext, Person, Prop, RoadSample, SessionConfig, SurfaceKind, Vehicle, VehicleKind,
} from '@/core/contracts';
import { getCore } from '@/core/context';
import type { SpawnHelperApi } from '@/sim/roles/archetypes/api';
import { readVacation } from '@/gameplay/patrols/model';
import type { SessionSetupSummary } from './api';
import { chooseStand, chooseStandOffCrowd, distanceToRoute, hasWayOut } from './placement';
import type { Stand } from './placement';
import type { Cast, CastSlot } from './roster';

/** Service : équipage de patrouille du joueur. */
export const EQUIPAGE_SERVICE = 'session.equipage';

export interface EquipageInfo {
  /** Unité 'equipage' du joueur. */
  squadId: number;
  /** Voiture de l'équipage. */
  vehicleId: EntityId;
  /** Indicatif radio (« BAC 75N », « TV 75-09 »). */
  callsign: string;
}

export interface EquipageApi {
  /** Équipage du joueur ; null hors rôle de patrouille ou avant la mise en place. */
  readonly current: EquipageInfo | null;
}

/** Indicatif de l'équipage : celui du départ de la vacation, sinon celui de la variante. */
export function patrolCallsign(config: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): string {
  const v = readVacation(config);
  if (v) return v.depart.callsign;
  const variante = config && config.extra ? config.extra['variante'] : undefined;
  return variante === 'police_secours' ? 'TV 75' : 'BAC 75';
}

/** Distance minimale (m) entre la voiture et le parcours d'une manifestation, et rayon sans manifestant autour d'elle. */
const ROUTE_CLEAR = 35;
const PROTEST_CLEAR = 25;
/** Rayon de recherche d'une place au bord de la chaussée (m). */
const CURB_REACH = 240;
/** Sols où l'on gare une voiture (tuile non chargée : la voie du réseau suffit). */
const CURB_SURFACES: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>(['road', 'sett', 'quay', 'void']);
/** Voies où l'on ne se gare pas. */
const NO_PARKING: ReadonlySet<string> = new Set(['pedestrian', 'footway', 'service', 'motorway']);
/** Écart au trottoir : le long de la bordure d'abord, puis vers l'axe dans une rue étroite. */
const CURB_OFFSETS: readonly number[] = [1, 0.6, 0.25];

const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
const nearV: Vehicle[] = [];
const nearP: Prop[] = [];

/**
 * Place de stationnement au bord de la chaussée la plus proche de (x, z) : contre le trottoir de DROITE dans le sens
 * de circulation (rue à double sens : l'un ou l'autre sens ; sens unique : le sens de la voie), sur un sol carrossable,
 * libre de tout obstacle, véhicule, mobilier et passant, avec une sortie. `accept` écarte des points (couloir d'une
 * manifestation). Couronnes de plus en plus larges, jusqu'à CURB_REACH m. Écrit dans `out` ; false si rien.
 */
export function curbSpot(
  ctx: GameContext, x: number, z: number, length: number, width: number, out: { x: number; z: number; heading: number },
  accept?: (px: number, pz: number) => boolean,
): boolean {
  const world = ctx.world;
  const half = Math.max(length, width) * 0.5 + 0.4;
  for (let r = 0; r <= CURB_REACH; r += 10) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 14));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (!world.nearestRoad(x + Math.cos(a) * r, z + Math.sin(a) * r, road, 12)) continue;
      if (NO_PARKING.has(road.roadClass) || road.width < Math.max(5, width + 1.5)) continue;
      const edge = Math.max(0, road.width * 0.5 - width * 0.5 - 0.5);
      const senses = road.oneway ? 1 : 2;
      for (const f of CURB_OFFSETS) {
        for (let s = 0; s < senses; s++) {
          const h = s === 0 ? road.heading : road.heading + Math.PI;
          // droite = (−cos h, sin h)
          const px = road.x - Math.cos(h) * edge * f;
          const pz = road.z + Math.sin(h) * edge * f;
          if (!CURB_SURFACES.has(world.surfaceAt(px, pz)) || !world.isFree(px, pz, width * 0.5 + 0.2)) continue;
          const fx = Math.sin(h) * length * 0.45, fz = Math.cos(h) * length * 0.45;
          if (!world.isFree(px + fx, pz + fz, width * 0.5) || !world.isFree(px - fx, pz - fz, width * 0.5)) continue;
          if (ctx.vehicles.queryRadius(px, pz, half + 0.6, nearV) > 0) continue;
          if (ctx.props.queryRadius(px, pz, half, nearP, (p) => p.blocksMove) > 0) continue;
          if (ctx.people.countIn(px, pz, Math.max(1, width * 0.5 + 0.3)) > 0) continue;
          if (accept && !accept(px, pz)) continue;
          if (!hasWayOut(ctx, px, pz, Math.min(1.2, width * 0.5))) continue;
          out.x = px;
          out.z = pz;
          out.heading = wrap(h);
          return true;
        }
      }
    }
  }
  return false;
}

function wrap(a: number): number {
  let h = a % (Math.PI * 2);
  if (h > Math.PI) h -= Math.PI * 2;
  else if (h <= -Math.PI) h += Math.PI * 2;
  return h;
}

export interface PatrolCrewOptions {
  /** Une manifestation se tient au lieu de la session (Mode libre). */
  crowd: boolean;
  /** Personnes créées par la mise en place (l'équipage y est ajouté). */
  people: EntityId[];
}

export interface PatrolCrew {
  player: Person;
  vehicle: Vehicle;
  stand: Stand;
  info: EquipageInfo;
}

/**
 * Crée l'équipage de patrouille du joueur, à bord de sa voiture garée au bord de la chaussée, et remplit `summary`.
 * Retourne null si aucune place ni aucune voiture n'a pu être trouvée (la mise en place retombe alors sur la
 * création générique : équipage à pied à côté de sa voiture).
 */
export function buildPatrolCrew(
  ctx: GameContext, config: SessionConfig, cast: Cast, summary: SessionSetupSummary, helper: SpawnHelperApi | undefined,
  rand: () => number, opts: PatrolCrewOptions,
): PatrolCrew | null {
  const vacation = readVacation(config);
  const callsign = patrolCallsign(config);
  // voiture : celle de l'équipage ; repli sur une berline aux couleurs de la police si sa définition manque
  const wanted: VehicleKind = cast.vehicles[0] ?? 'voiture_police';
  const kind: VehicleKind | null = ctx.vehicles.def(wanted) ? wanted : ctx.vehicles.def('voiture') ? 'voiture' : null;
  if (!kind) return null;
  const def = ctx.vehicles.def(kind)!;

  // point de départ
  const x = typeof config.x === 'number' ? config.x : 0;
  const z = typeof config.z === 'number' ? config.z : 0;
  const route = ctx.director.route;
  const isProtester = (p: { faction: string }): boolean => p.faction === 'protest';
  let px = x, pz = z;
  if (vacation) {
    px = vacation.depart.x;
    pz = vacation.depart.z;
  } else if (opts.crowd) {
    const apart = chooseStandOffCrowd(ctx, x, z, route, isProtester) ?? chooseStand(ctx, x, z, rand);
    px = apart.x;
    pz = apart.z;
  }
  // hors du couloir du cortège et loin des manifestants (Mode libre avec une manifestation)
  const accept = opts.crowd
    ? (qx: number, qz: number): boolean => distanceToRoute(route, qx, qz) >= ROUTE_CLEAR
      && ctx.people.countIn(qx, qz, PROTEST_CLEAR, isProtester) === 0
    : undefined;
  const spot = { x: 0, z: 0, heading: 0 };
  if (!curbSpot(ctx, px, pz, def.length, def.width, spot, accept) && !(accept && curbSpot(ctx, px, pz, def.length, def.width, spot))) {
    console.warn(`[session] aucune place au bord de la chaussée pour l'équipage ${callsign}`);
    return null;
  }

  const v = ctx.vehicles.spawn(kind, spot.x, spot.z, spot.heading, { faction: 'police' });
  v.y = ctx.world.heightAt(spot.x, spot.z);
  v.cmd.handbrake = true;
  const squad = ctx.squads.create('equipage', 'police', callsign);
  squad.vehicleId = v.id;

  // équipage dans l'ordre de la distribution : conducteur au volant, chef de bord à sa droite, équipier derrière lui
  let player: Person | null = null;
  const seed = (config.seed ?? 1) * 131;
  for (let i = 0; i < cast.slots.length; i++) {
    const slot = cast.slots[i]!;
    const p = spawnSlot(ctx, slot, spot.x, spot.z, spot.heading, helper, seed + i * 17 + 7);
    if (!p) continue;
    p.faction = 'police';
    opts.people.push(p.id);
    ctx.squads.addMember(squad.id, p.id);
    const seat = slot.poste === 'conducteur' ? 0 : slot.leads !== '' ? 1 : 3;
    if (!ctx.vehicles.enter(p, v, seat) && !ctx.vehicles.enter(p, v, 'passenger')) {
      // voiture pleine (définition de repli) : il attend à la portière
      p.x = spot.x + Math.cos(spot.heading) * (def.width * 0.5 + 0.8);
      p.z = spot.z - Math.sin(spot.heading) * (def.width * 0.5 + 0.8);
    }
    if (i === cast.player) player = p;
  }
  if (!player) {
    // personne n'a pu être créé : on retire la voiture et l'unité vides
    for (const id of squad.members.slice()) {
      const p = ctx.people.get(id);
      if (p) { ctx.vehicles.exit(p); ctx.squads.removeMember(id); ctx.people.remove(id); }
    }
    ctx.squads.remove(squad.id);
    ctx.vehicles.remove(v.id);
    return null;
  }
  // le joueur commande l'équipage, qu'il conduise ou non
  ctx.squads.setLeader(squad.id, player.id);

  const info: EquipageInfo = { squadId: squad.id, vehicleId: v.id, callsign };
  summary.x = spot.x;
  summary.z = spot.z;
  summary.heading = spot.heading;
  summary.squadId = squad.id;
  summary.rootSquadId = squad.id;
  summary.teammates = squad.members.length - 1;
  summary.vehicleIds.push(v.id);

  if (vacation) {
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `${callsign}, prise de service, ${vacation.depart.name}.` });
    ctx.ui.notify(`${callsign} : prise de service, ${vacation.depart.name}. Écoutez CENTRAL.`, 'info', 6);
  }
  return { player, vehicle: v, stand: { x: spot.x, z: spot.z, heading: spot.heading, facing: '' }, info };
}

function spawnSlot(
  ctx: GameContext, slot: CastSlot, x: number, z: number, heading: number, helper: SpawnHelperApi | undefined, seed: number,
): Person | null {
  try {
    const p = helper && slot.profile === undefined
      ? helper.spawnUnitSlot(slot, x, z, { heading, seed })
      : ctx.archetypes.spawn(slot.kind, x, z, { heading, seed, poste: slot.poste, rank: slot.rank, profile: slot.profile ?? null });
    p.aimYaw = heading;
    p.cmd.aimYaw = heading;
    p.y = ctx.world.heightAt(x, z);
    return p;
  } catch (err) {
    console.error(`[session] création de « ${slot.label} » impossible`, err);
    if (getCore(ctx).strict) throw err;
    return null;
  }
}
