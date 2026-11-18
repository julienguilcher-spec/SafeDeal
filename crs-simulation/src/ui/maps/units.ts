/* =====================================================================================
 * Modèle des unités affichées sur les cartes : une entrée par unité (ctx.squads) et par véhicule
 * de service hors unité, avec position, symbole normalisé, effectif et ordre en cours.
 * Logique sans DOM : utilisée par la mini-carte, la carte tactique, l'arborescence et les tests.
 * ===================================================================================== */

import type { Faction, GameContext, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { isHeldVehicle } from '@/world/commissariats';
import type { MapVisibility } from './api';

export type UnitSymbol =
  | 'compagnie' | 'section' | 'groupe' | 'binome' | 'vehicule' | 'centaure' | 'canon_eau' | 'bravm' | 'drone'
  | 'pompiers' | 'samu' | 'patrouille';

/** Lecture du service des patrouilles (module gameplay/patrols), sans en dépendre. */
interface PatrolsLike {
  statusOf(squadId: number): { label: string; state: string } | null;
}

export interface MapUnit {
  /** Clé stable : identifiant d'unité (> 0), ou −identifiant du véhicule pour un véhicule hors unité. */
  key: number;
  squadId: number;
  vehicleId: number;
  symbol: UnitSymbol;
  faction: Faction;
  /** Indicatif complet (« MISTRAL 2 ALFA ») et code court du pion (« 2A »). */
  name: string;
  code: string;
  x: number;
  z: number;
  heading: number;
  /** Clé de l'unité supérieure visible (0 = aucune) et profondeur dans l'arborescence. */
  parentKey: number;
  depth: number;
  childCount: number;
  /** Effectif total, valide (apte à manœuvrer) et blessé, subordonnés compris. */
  total: number;
  valid: number;
  injured: number;
  /** Moral / cohésion 0..1 (moyenne des subordonnés pour une unité sans membres propres). */
  morale: number;
  /** Munitions collectives restantes (grenades, cartouches de lanceur), −1 si inconnu. */
  ammo: number;
  order: SquadOrder | null;
  /** Distance du centre de l'unité au point de l'ordre (m). */
  orderDist: number;
  /** L'unité est à bord de son véhicule. */
  embarked: boolean;
  /** Le joueur en fait partie (directement ou par une unité subordonnée). */
  hasPlayer: boolean;
  leaderId: number;
  /** Membres rattachés directement à l'unité (hors subordonnées). */
  own: number;
  /**
   * État en clair pour la carte et la liste : voiture de patrouille (« Patrouille », « En route (urgence) », « Sur
   * place »…), sinon d'après l'ordre en cours (« en route », « en place ») ; '' sans ordre.
   */
  status: string;
  /** Voiture de patrouille (Police secours, BAC) gérée par le service 'police.patrols'. */
  patrol: boolean;
  /** Horodatage interne de rafraîchissement. */
  stamp: number;
}

const AMMO_ITEMS: ReadonlySet<string> = new Set([
  'grenade_lacrymo', 'grenade_gm2l', 'grenade_desencerclement', 'lanceur_cougar', 'lbd40',
]);
const ALPHABET: ReadonlySet<string> = new Set(['ALFA', 'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT']);

/** Code court d'un indicatif : « MISTRAL 2 ALFA » → « 2A », « MISTRAL 2 » → « M2 », « MISTRAL » → « MIS ». */
export function unitCode(name: string): string {
  const tokens = name.trim().toUpperCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  const last = tokens[tokens.length - 1]!;
  // indicatifs de patrouille : « TV 75-09 » → « T09 », « BAC 75N » → « BN »
  const dash = /^\d+-(\d+)$/.exec(last);
  if (tokens.length >= 2 && dash) return tokens[0]!.charAt(0) + dash[1]!;
  const suffix = /^\d+([A-Z])$/.exec(last);
  if (tokens.length >= 2 && suffix) return tokens[0]!.charAt(0) + suffix[1]!;
  if (tokens.length >= 3 && ALPHABET.has(last) && /^\d+$/.test(tokens[tokens.length - 2]!)) {
    return tokens[tokens.length - 2]! + last.charAt(0);
  }
  if (tokens.length >= 2 && /^\d+$/.test(last)) return tokens[0]!.charAt(0) + last;
  if (tokens.length >= 2 && ALPHABET.has(last)) return tokens[0]!.charAt(0) + last.charAt(0);
  if (tokens.length === 1) return last.slice(0, 3);
  return tokens.map((t) => t.charAt(0)).join('').slice(0, 3);
}

/** Symbole d'un véhicule selon son type (voiture de police ou banalisée de la BAC : « patrouille »). */
export function symbolOfVehicle(kind: string): UnitSymbol {
  switch (kind) {
    case 'centaure': return 'centaure';
    case 'canon_eau': return 'canon_eau';
    case 'drone': case 'helicoptere': return 'drone';
    case 'camion_pompiers': return 'pompiers';
    case 'ambulance': return 'samu';
    case 'moto_bravm': return 'bravm';
    case 'voiture_police': case 'voiture_bac': return 'patrouille';
    default: return 'vehicule';
  }
}

function symbolOfSquad(squad: Squad, vehicle: Vehicle | undefined, first: Person | undefined): UnitSymbol {
  if (vehicle) {
    const s = symbolOfVehicle(vehicle.kind);
    if (s !== 'vehicule' || squad.kind === 'equipage') return s;
  }
  if (first) {
    if (first.kind === 'bravm') return 'bravm';
    if (first.kind === 'telepilote') return 'drone';
    if (first.kind === 'samu') return 'samu';
    if (first.kind === 'pompier') return 'pompiers';
  }
  switch (squad.kind) {
    case 'compagnie': return 'compagnie';
    case 'section': case 'peloton': return 'section';
    case 'binome': return 'binome';
    case 'equipage': return 'vehicule';
    case 'secours': return 'pompiers';
    default: return 'groupe';
  }
}

/** Ordres sans point à rejoindre (pas d'état « en route / en place »). */
const NO_POINT: ReadonlySet<string> = new Set(['libre', 'suivre', 'escorter', 'cesser', 'embarquer', 'debarquer', 'tortue']);

/** État d'une unité d'après son ordre : « en route » tant qu'elle n'a pas rejoint le point, puis « en place ». */
export function statusOfOrder(o: SquadOrder, dist: number): string {
  if (NO_POINT.has(o.type)) return '';
  return dist > 6 + o.width * 0.25 + 4 ? 'en route' : 'en place';
}

interface Acc {
  total: number; valid: number; injured: number; sx: number; sz: number; n: number; ammo: number; ammoKnown: boolean;
  morale: number; moraleN: number; hasPlayer: boolean; first: Person | undefined;
}

/** Faction affichable comme « unité » pour cette visibilité. */
function factionShown(f: Faction, vis: MapVisibility): boolean {
  return (f === 'police' && vis.police) || (f === 'rescue' && vis.rescue);
}

/**
 * Constructeur réutilisable de la liste des unités : les objets MapUnit sont conservés d'un
 * rafraîchissement à l'autre (clé stable), les tableaux de travail aussi.
 */
export class UnitModel {
  readonly list: MapUnit[] = [];
  private readonly byKey = new Map<number, MapUnit>();
  private readonly children = new Map<number, Squad[]>();
  private readonly accs = new Map<number, Acc>();
  private stamp = 0;
  private patrols: PatrolsLike | undefined = undefined;

  get(key: number): MapUnit | undefined {
    const u = this.byKey.get(key);
    return u && u.stamp === this.stamp ? u : undefined;
  }

  /** Reconstruit la liste (ordre : arborescence, parents avant enfants). */
  refresh(ctx: GameContext, vis: MapVisibility): MapUnit[] {
    const stamp = ++this.stamp;
    const list = this.list;
    list.length = 0;
    const squads = ctx.squads.list;
    const children = this.children;
    children.forEach((arr) => { arr.length = 0; });
    this.accs.clear();
    const playerId = ctx.player.state.personId;
    const squadVehicles = new Set<number>();
    this.patrols = ctx.service<PatrolsLike>('police.patrols');

    for (let i = 0; i < squads.length; i++) {
      const s = squads[i]!;
      if (s.vehicleId !== 0) squadVehicles.add(s.vehicleId);
      if (!factionShown(s.faction, vis)) continue;
      const parent = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
      const pk = parent && factionShown(parent.faction, vis) ? parent.id : 0;
      let arr = children.get(pk);
      if (!arr) {
        arr = [];
        children.set(pk, arr);
      }
      arr.push(s);
    }

    const roots = children.get(0);
    if (roots) for (let i = 0; i < roots.length; i++) this.visit(ctx, roots[i]!, 0, 0, playerId, stamp);

    // véhicules de service qui ne sont le véhicule d'aucune unité (sauf ceux garés en réserve d'un commissariat : le
    // symbole du commissariat les compte déjà)
    const vehicles = ctx.vehicles.list;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (v.dormant || squadVehicles.has(v.id) || !factionShown(v.faction, vis) || isHeldVehicle(ctx, v.id)) continue;
      const u = this.slot(-v.id, stamp);
      let occupants = 0;
      for (let k = 0; k < v.seats.length; k++) if (v.seats[k] !== 0) occupants++;
      u.squadId = 0;
      u.vehicleId = v.id;
      const sym = symbolOfVehicle(v.kind);
      // voiture garée sans équipage : simple véhicule
      u.symbol = sym === 'patrouille' ? 'vehicule' : sym;
      u.faction = v.faction;
      u.name = v.def.name;
      u.code = '';
      u.x = v.x;
      u.z = v.z;
      u.heading = v.heading;
      u.parentKey = 0;
      u.depth = 0;
      u.childCount = 0;
      u.total = occupants;
      u.valid = occupants;
      u.injured = 0;
      u.morale = 1;
      u.ammo = -1;
      u.order = null;
      u.orderDist = 0;
      u.embarked = false;
      u.hasPlayer = false;
      u.leaderId = v.seats.length > 0 ? v.seats[0]! : 0;
      u.own = occupants;
      u.status = '';
      u.patrol = false;
      list.push(u);
    }
    return list;
  }

  private slot(key: number, stamp: number): MapUnit {
    let u = this.byKey.get(key);
    if (!u) {
      u = {
        key, squadId: 0, vehicleId: 0, symbol: 'groupe', faction: 'police', name: '', code: '', x: 0, z: 0, heading: 0,
        parentKey: 0, depth: 0, childCount: 0, total: 0, valid: 0, injured: 0, morale: 1, ammo: -1, order: null,
        orderDist: 0, embarked: false, hasPlayer: false, leaderId: 0, own: 0, status: '', patrol: false, stamp: 0,
      };
      this.byKey.set(key, u);
    }
    u.stamp = stamp;
    return u;
  }

  private visit(ctx: GameContext, s: Squad, parentKey: number, depth: number, playerId: number, stamp: number): Acc {
    const u = this.slot(s.id, stamp);
    this.list.push(u);
    const acc: Acc = {
      total: 0, valid: 0, injured: 0, sx: 0, sz: 0, n: 0, ammo: 0, ammoKnown: false, morale: 0, moraleN: 0,
      hasPlayer: false, first: undefined,
    };
    this.accs.set(s.id, acc);
    let embarked = 0;
    for (let i = 0; i < s.members.length; i++) {
      const p = ctx.people.get(s.members[i]!);
      if (!p) continue;
      if (!acc.first) acc.first = p;
      acc.total++;
      const hurt = p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead' || ctx.health.isIncapacitated(p);
      if (hurt) acc.injured++;
      else {
        acc.valid++;
        acc.sx += p.x;
        acc.sz += p.z;
        acc.n++;
      }
      if (p.vehicleId !== 0) embarked++;
      if (p.id === playerId) acc.hasPlayer = true;
      for (let k = 0; k < p.inventory.length; k++) {
        const it = p.inventory[k]!;
        if (AMMO_ITEMS.has(it.id)) {
          acc.ammo += it.count;
          acc.ammoKnown = true;
        }
      }
    }
    if (s.members.length > 0) {
      acc.morale += s.morale;
      acc.moraleN++;
    }
    const own = acc.total;
    const kids = this.children.get(s.id);
    const childCount = kids ? kids.length : 0;
    u.own = own;
    if (kids) {
      for (let i = 0; i < kids.length; i++) {
        const c = this.visit(ctx, kids[i]!, s.id, depth + 1, playerId, stamp);
        acc.total += c.total;
        acc.valid += c.valid;
        acc.injured += c.injured;
        acc.sx += c.sx;
        acc.sz += c.sz;
        acc.n += c.n;
        acc.ammo += c.ammo;
        acc.ammoKnown = acc.ammoKnown || c.ammoKnown;
        acc.morale += c.morale;
        acc.moraleN += c.moraleN;
        acc.hasPlayer = acc.hasPlayer || c.hasPlayer;
        if (!acc.first) acc.first = c.first;
      }
    }
    const leader = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : undefined;
    const vehicle = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    u.squadId = s.id;
    u.vehicleId = s.vehicleId;
    u.symbol = symbolOfSquad(s, vehicle, acc.first);
    u.faction = s.faction;
    u.name = s.name;
    u.code = unitCode(s.name);
    u.embarked = own > 0 && embarked === own && vehicle !== undefined;
    if ((u.embarked || u.symbol === 'drone') && vehicle) {
      // unité à bord, ou drone : c'est l'engin que l'on situe, pas son télépilote
      u.x = vehicle.x;
      u.z = vehicle.z;
      u.heading = vehicle.heading;
    } else if (s.kind === 'compagnie' && childCount > 0 && leader && own > 0) {
      // poste de commandement : situé là où se tient le chef, pas au barycentre de toute la compagnie
      u.x = leader.x;
      u.z = leader.z;
      u.heading = leader.heading;
    } else if (acc.n > 0) {
      u.x = acc.sx / acc.n;
      u.z = acc.sz / acc.n;
      u.heading = leader ? leader.heading : s.order.heading;
    } else if (leader) {
      u.x = leader.x;
      u.z = leader.z;
      u.heading = leader.heading;
    } else if (vehicle) {
      u.x = vehicle.x;
      u.z = vehicle.z;
      u.heading = vehicle.heading;
    } else {
      u.x = s.order.x;
      u.z = s.order.z;
      u.heading = s.order.heading;
    }
    u.parentKey = parentKey;
    u.depth = depth;
    u.childCount = childCount;
    u.total = acc.total;
    u.valid = acc.valid;
    u.injured = acc.injured;
    u.morale = acc.moraleN > 0 ? acc.morale / acc.moraleN : s.morale;
    u.ammo = acc.ammoKnown ? acc.ammo : -1;
    u.order = s.order;
    u.orderDist = Math.hypot(s.order.x - u.x, s.order.z - u.z);
    u.hasPlayer = acc.hasPlayer;
    u.leaderId = s.leaderId;
    const patrol = s.faction === 'police' && this.patrols ? this.patrols.statusOf(s.id) : null;
    u.patrol = patrol !== null;
    u.status = patrol ? patrol.label : statusOfOrder(s.order, u.orderDist);
    return acc;
  }
}
