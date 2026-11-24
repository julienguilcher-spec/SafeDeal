/* =====================================================================================
 * COMMISSARIATS (jeu) — engagement d'une unité du stock : les véhicules garés sont remplacés par l'unité réelle,
 * construite par les services habituels (équipage à bord, posée exactement sur les mêmes places) :
 *
 *   Police secours, BAC     → patrouilles.deploy() (voiture « Au poste », gérée ensuite comme une patrouille) ;
 *   section CRS             → police.units.createSection (fourgons en file, embarquée) ;
 *   peloton de gendarmerie  → police.units.createPeloton (fourgons bleus) ;
 *   BRAV-M                  → police.units.createBravm (en selle) ;
 *   engin, cellulaire       → police.units.createEquipage.
 *
 * Les véhicules sont posés sur les places des véhicules garés retirés (`parking`) ; ceux qui n'en avaient pas
 * (« virtuels ») prennent une place libre de leur file ou de la réserve, à défaut le rangement de repli des unités.
 * ===================================================================================== */

import type { EntityId, GameContext, Person, Squad, Vehicle } from '@/core/contracts';
import type { PatrolsApi } from '@/gameplay/patrols/api';
import type { CrewKind, PoliceUnitsApi, UnitHandle } from '@/sim/police/api';
import { unitOf } from '@/sim/police/brain';
import type { CommissariatDef, Pose, StockTemplate } from '@/world/commissariats';
import { homeName } from './texts';

/** Ce qu'un engagement a construit. */
export interface BuiltUnit {
  squadId: number;
  /** Unité gérée par le module des patrouilles. */
  patrol: boolean;
  vehicles: Vehicle[];
  /** Effectif créé. */
  crew: number;
}

const CREW_OF: Readonly<Partial<Record<StockTemplate['kind'], CrewKind>>> = {
  canon_eau: 'canon_eau',
  centaure: 'centaure',
  cellulaire: 'fourgon_cellulaire',
};

/**
 * Véhicules en surnombre (pris par un joueur ou détruits pendant qu'ils étaient garés) : la section ou le peloton est
 * construit au complet, puis ses véhicules en trop sont retirés ; leurs occupants montent dans les autres véhicules de
 * l'unité (à défaut, ils restent à pied à côté).
 */
function trimVehicles(ctx: GameContext, h: UnitHandle, keep: number): void {
  if (keep <= 0 || h.vehicles.length <= keep) return;
  const kept = h.vehicles.slice(0, keep);
  const extra = h.vehicles.slice(keep);
  for (const v of extra) {
    const seated: Person[] = [];
    for (const id of v.seats) {
      const p = id !== 0 ? ctx.people.get(id) : undefined;
      if (p) seated.push(p);
    }
    for (const p of seated) {
      ctx.vehicles.exit(p);
      for (const k of kept) if (ctx.vehicles.enter(p, k, 'passenger')) break;
    }
    // les groupes rattachés à ce véhicule prennent le premier véhicule gardé
    const visit = (s: Squad | undefined, depth: number): void => {
      if (!s || depth > 8) return;
      if (s.vehicleId === v.id) s.vehicleId = kept[0]!.id;
      for (const c of ctx.squads.childrenOf(s.id)) visit(c, depth + 1);
    };
    visit(h.squad, 0);
    ctx.vehicles.remove(v.id);
  }
  h.vehicles.length = 0;
  h.vehicles.push(...kept);
}

/** BRAV-M engagée : le groupe prend l'indicatif du stock (« FAUCON 9 »), ses binômes « FAUCON 9-1 »… */
function renameBravm(ctx: GameContext, h: UnitHandle, callsign: string): void {
  const group = h.squad;
  group.name = callsign;
  const kids = ctx.squads.childrenOf(group.id);
  for (let i = 0; i < kids.length; i++) kids[i]!.name = `${callsign}-${i + 1}`;
}

/**
 * Véhicule resté immobile hors de sa place (rangement de repli des unités alors qu'une place était donnée) : posé sur
 * sa place.
 */
function settle(ctx: GameContext, vehicles: readonly Vehicle[], parking: readonly Pose[]): void {
  for (let i = 0; i < vehicles.length && i < parking.length; i++) {
    const v = vehicles[i]!, s = parking[i]!;
    if (Math.abs(v.speed) > 0.2 || Math.hypot(v.x - s.x, v.z - s.z) < 0.5) continue;
    v.x = s.x;
    v.z = s.z;
    v.y = ctx.world.heightAt(s.x, s.z);
    v.heading = s.heading;
    v.vx = 0;
    v.vz = 0;
  }
}

/** Membres de l'unité et de sa descendance. */
export function crewCount(ctx: GameContext, squadId: number): number {
  let n = 0;
  const visit = (s: Squad | undefined, depth: number): void => {
    if (!s || depth > 8) return;
    n += s.members.length;
    for (const c of ctx.squads.childrenOf(s.id)) visit(c, depth + 1);
  };
  visit(ctx.squads.get(squadId), 0);
  return n;
}

/**
 * Construit l'unité réelle d'un modèle de stock. `parking` : places des véhicules (tête de file d'abord) ;
 * `vehicles` : véhicules encore au stock. null si rien n'a pu être construit.
 */
export function buildUnit(
  ctx: GameContext, def: CommissariatDef, template: StockTemplate, parking: readonly Pose[], vehicles: number,
): BuiltUnit | null {
  if (vehicles <= 0) return null;
  const units = ctx.service<PoliceUnitsApi>('police.units');
  const exit = def.exit;
  const at = { x: exit.x, z: exit.z, heading: exit.heading };
  const first = parking[0] ?? { x: exit.x, z: exit.z, heading: exit.heading };
  switch (template.kind) {
    case 'police_secours':
    case 'bac': {
      const patrols = ctx.service<PatrolsApi>('police.patrols');
      if (patrols && typeof patrols.deploy === 'function') {
        const id = patrols.deploy(template.kind === 'bac' ? 'bac' : 'tv', template.callsign, homeName(def), first, def.door);
        if (id === 0) return null;
        const view = patrols.statusOf(id);
        const v = view ? ctx.vehicles.get(view.vehicleId) : undefined;
        return { squadId: id, patrol: true, vehicles: v ? [v] : [], crew: crewCount(ctx, id) };
      }
      // sans le module des patrouilles : un simple équipage, commandé par les ordres habituels
      if (!units) return null;
      const h = units.createEquipage(template.kind === 'bac' ? 'voiture_bac' : 'voiture_police', { ...at, callsign: template.callsign, parking });
      settle(ctx, h.vehicles, parking);
      return { squadId: h.squad.id, patrol: false, vehicles: h.vehicles, crew: h.people.length };
    }
    case 'section_crs':
    case 'peloton_gm': {
      if (!units) return null;
      const o = { ...at, vehicles: true, drivers: true, layout: 'embarque' as const, callsign: template.callsign, parking };
      const h = template.kind === 'section_crs' ? units.createSection({ ...o, section: 1 }) : units.createPeloton({ ...o, peloton: 1 });
      trimVehicles(ctx, h, vehicles);
      settle(ctx, h.vehicles, parking);
      return { squadId: h.squad.id, patrol: false, vehicles: h.vehicles, crew: h.people.length };
    }
    case 'bravm': {
      if (!units) return null;
      const h = units.createBravm(vehicles, { ...at, vehicles: true, mounted: true, callsign: template.callsign, parking });
      renameBravm(ctx, h, template.callsign);
      settle(ctx, h.vehicles, parking);
      return { squadId: h.squad.id, patrol: false, vehicles: h.vehicles, crew: h.people.length };
    }
    case 'canon_eau':
    case 'centaure':
    case 'cellulaire': {
      const kind = CREW_OF[template.kind];
      if (!units || !kind) return null;
      const h = units.createEquipage(kind, { ...at, callsign: template.callsign, parking });
      settle(ctx, h.vehicles, parking);
      return { squadId: h.squad.id, patrol: false, vehicles: h.vehicles, crew: h.people.length };
    }
    default:
      return null;
  }
}

/**
 * Véhicules de l'unité et de sa descendance (sans doublon, dans l'ordre de l'arbre), véhicules sans équipage propre
 * compris (fourgon cellulaire rattaché à une compagnie, `extraVehicles` de son unité de simulation) : sans eux, les
 * interpellés de ce fourgon n'étaient jamais remis au retour (diag-interpelles P12).
 */
export function unitVehicles(ctx: GameContext, squadId: number, out: Vehicle[]): Vehicle[] {
  out.length = 0;
  const seen = new Set<EntityId>();
  const add = (id: EntityId): void => {
    if (id === 0 || seen.has(id)) return;
    const v = ctx.vehicles.get(id);
    if (v) {
      seen.add(v.id);
      out.push(v);
    }
  };
  const visit = (s: Squad | undefined, depth: number): void => {
    if (!s || depth > 8) return;
    add(s.vehicleId);
    const u = unitOf(s);
    if (u) for (let i = 0; i < u.extraVehicles.length; i++) add(u.extraVehicles[i]!);
    for (const c of ctx.squads.childrenOf(s.id)) visit(c, depth + 1);
  };
  visit(ctx.squads.get(squadId), 0);
  return out;
}
