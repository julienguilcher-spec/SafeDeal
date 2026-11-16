/* =====================================================================================
 * FORCES DE L'ORDRE — construction des unités (service 'police.units').
 *
 *   createCompany()  compagnie de CRS (docs/research/01 §4.1, bible §E.1-E.2) : commandement de 6
 *                    autour du commandant unique (écharpe, mégaphone, sommations), 4 sections de 16
 *                    en groupes A (appui), B (intervention), C (commandement), conducteurs, un
 *                    fourgon par groupe, véhicule de commandement, fourgon cellulaire ;
 *   createSection(), createGroup(), createPeloton() (gendarmes mobiles), createBravm() (binômes
 *   pilote + opérateur, une moto chacun), createEquipage() (équipage créé à bord de son engin).
 *
 * Postes et tenues viennent du module des archétypes quand il est branché (service 'roles.spawn') ;
 * à défaut, ctx.archetypes.spawn() et la dotation de repli de roster.ts. Indicatifs fictifs (bible
 * §E.5) : compagnie « MISTRAL », section « MISTRAL 2 », groupe « MISTRAL 2 BRAVO ». Chaque unité est
 * une Squad du magasin ctx.squads, rattachée à son échelon supérieur (parentId).
 * ===================================================================================== */

import type { EntityId, Person, Squad, SquadKind, Vehicle, VehicleKind } from '@/core/contracts';
import type { SpawnHelperApi, UnitSlot } from '@/sim/roles/archetypes/api';
import type {
  BravmOptions, CompanyOptions, CrewKind, CrewOptions, GroupOptions, GroupType, PelotonOptions, RosterSlot, SectionOptions,
  UnitHandle, UnitPlacement,
} from './api';
import { agentOf, unitOf } from './brain';
import type { Kernel } from './kernel';
import { formColumn, formLine } from './mcore';
import { COMPANY_CALLSIGNS, RADIO_LETTERS, applyFallbackKit, companyRoster, crewRoster, groupRoster, pelotonRoster, sectionRoster } from './roster';
import { syncTree } from './tree';

interface Build {
  handle: UnitHandle;
  /** Rang de création dans l'unité (graine d'apparence). */
  index: number;
  seed: number;
  company: number;
  x: number;
  z: number;
  heading: number;
}

function origin(k: Kernel, o: UnitPlacement | undefined): { x: number; z: number; heading: number } {
  const cfg = k.ctx.session.config;
  return {
    x: o && o.x !== undefined ? o.x : cfg && cfg.x !== undefined ? cfg.x : 0,
    z: o && o.z !== undefined ? o.z : cfg && cfg.z !== undefined ? cfg.z : 0,
    heading: o && o.heading !== undefined ? o.heading : 0,
  };
}

function begin(k: Kernel, squad: Squad, o: UnitPlacement | undefined, seed: number | undefined, company: number | undefined): Build {
  const at = origin(k, o);
  return {
    handle: { squad, sections: [], groups: [], people: [], vehicles: [], leader: null },
    index: 0,
    seed: seed !== undefined ? seed : k.rng.int(1, 1 << 30),
    company: company !== undefined ? company : 70 + (k.callsigns % 10),
    x: at.x, z: at.z, heading: at.heading,
  };
}

/** Crée la personne d'un poste et la rattache à son unité. */
function spawnSlot(k: Kernel, b: Build, slot: RosterSlot | UnitSlot, squad: Squad): Person {
  const ctx = k.ctx;
  const helper = ctx.service<SpawnHelperApi>('roles.spawn');
  const seed = (b.seed + b.index * 7919) | 0;
  b.index++;
  // tous au point de mise en place : la formation de départ les répartit ensuite
  const jitter = (b.index % 7) * 0.31;
  const x = b.x + Math.cos(b.index * 2.4) * (0.4 + jitter);
  const z = b.z + Math.sin(b.index * 2.4) * (0.4 + jitter);
  let p: Person;
  if (helper && typeof helper.spawnUnitSlot === 'function') {
    p = helper.spawnUnitSlot(slot as UnitSlot, x, z, { squadId: squad.id, seed, heading: b.heading, company: b.company });
  } else {
    const authority = slot.poste === 'commandant_unite' || slot.poste === 'autorite_civile';
    p = ctx.archetypes.spawn(slot.kind, x, z, {
      poste: slot.poste, rank: slot.rank, squadId: squad.id, seed, heading: b.heading, faction: 'police',
      look: authority ? { sash: true } : undefined,
    });
    applyFallbackKit(ctx, p);
  }
  if (p.squadId !== squad.id) ctx.squads.addMember(squad.id, p.id);
  if (slot.leads !== '' && (squad.leaderId === 0 || squad.leaderId === p.id || slot.leads !== 'groupe' || squad.kind === 'groupe')) {
    ctx.squads.setLeader(squad.id, p.id);
  }
  b.handle.people.push(p);
  return p;
}

function composition(k: Kernel, type: string, opts: { section?: number; drivers?: boolean; authority?: boolean }, fallback: () => RosterSlot[]): (RosterSlot | UnitSlot)[] {
  const helper = k.ctx.service<SpawnHelperApi>('roles.spawn');
  if (helper && typeof helper.policeUnit === 'function') {
    const list = helper.policeUnit(type as Parameters<SpawnHelperApi['policeUnit']>[0], opts);
    if (list.length > 0) return list;
  }
  return fallback();
}

function letter(group: string): string {
  return RADIO_LETTERS[group] ?? group;
}

/** Place un véhicule derrière le point de mise en place : deux files, le long du cap, à 22 m et au-delà. */
function parkSpot(k: Kernel, b: Build, n: number, out: { x: number; z: number }): boolean {
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  const rx = -fz;
  const rz = fx;
  const world = k.ctx.world;
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = attempt === 2 ? 0 : (n & 1 ? 1 : -1) * (attempt === 1 ? -1 : 1);
    const row = n >> 1;
    const back = 24 + row * 7.6;
    const x = b.x - fx * back + rx * file * 1.8;
    const z = b.z - fz * back + rz * file * 1.8;
    if (world.isFree(x, z, 1.3) && world.isFree(x + fx * 2.4, z + fz * 2.4, 1.2) && world.isFree(x - fx * 2.4, z - fz * 2.4, 1.2)) {
      out.x = x;
      out.z = z;
      return true;
    }
  }
  return false;
}

const spot = { x: 0, z: 0 };

function spawnVehicle(k: Kernel, b: Build, kind: VehicleKind, squad: Squad | null, color?: number): Vehicle | null {
  if (!parkSpot(k, b, b.handle.vehicles.length, spot)) return null;
  const v = k.ctx.vehicles.spawn(kind, spot.x, spot.z, b.heading, { faction: 'police', color });
  b.handle.vehicles.push(v);
  if (squad) squad.vehicleId = v.id;
  k.reserveOf(v);
  return v;
}

function seatDrivers(k: Kernel, b: Build): void {
  const ctx = k.ctx;
  for (let i = 0; i < b.handle.people.length; i++) {
    const p = b.handle.people[i];
    if (p.poste !== 'conducteur' || p.vehicleId !== 0) continue;
    let v: Vehicle | undefined;
    for (let s = ctx.squads.get(p.squadId); s && !v; s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined) {
      if (s.vehicleId !== 0) v = ctx.vehicles.get(s.vehicleId);
    }
    if (v) ctx.vehicles.enter(p, v, 'driver');
  }
}

/** Place l'unité créée dans sa disposition de départ (les agents sont posés à leur emplacement). */
function deploy(k: Kernel, b: Build, layout: 'colonne' | 'ligne' | 'embarque'): void {
  const ctx = k.ctx;
  syncTree(k, true);
  const u = unitOf(b.handle.squad);
  if (!u) return;
  u.isRoot = true;
  if (layout === 'embarque' && b.handle.vehicles.length > 0) {
    // chacun à bord du véhicule de son groupe, les autres là où il reste de la place
    for (let i = 0; i < b.handle.people.length; i++) {
      const p = b.handle.people[i];
      if (p.vehicleId !== 0) continue;
      let done = false;
      for (let s = ctx.squads.get(p.squadId); s && !done; s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined) {
        const v = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
        if (v) done = ctx.vehicles.enter(p, v, 'passenger');
      }
      for (let j = 0; j < b.handle.vehicles.length && !done; j++) {
        if (b.handle.vehicles[j].kind !== 'fourgon_cellulaire') done = ctx.vehicles.enter(p, b.handle.vehicles[j], 'passenger');
      }
    }
    u.phase = 'embarque';
    return;
  }
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  const g = layout === 'ligne'
    ? formLine(k, u, b.x, b.z, b.heading, 0)
    : formColumn(k, u, b.x, b.z, b.x + fx * 4, b.z + fz * 4, 3);
  // à la création seulement : chacun est posé directement à sa place
  for (let i = 0; i < g.agents.length; i++) {
    const a = g.agents[i];
    if (!a.hasSlot) continue;
    const p = a.p;
    p.x = a.sx;
    p.z = a.sz;
    p.y = ctx.world.heightAt(p.x, p.z);
    p.heading = a.sh;
    p.aimYaw = a.sh;
    p.cmd.aimYaw = a.sh;
    a.lastX = p.x;
    a.lastZ = p.z;
    a.face = a.sh;
  }
  ctx.people.rebuildIndex();
  u.phase = 'repos';
  u.reported = true;
}

function nextCompanyCallsign(k: Kernel): string {
  const base = COMPANY_CALLSIGNS[k.callsigns % COMPANY_CALLSIGNS.length];
  const round = Math.floor(k.callsigns / COMPANY_CALLSIGNS.length);
  k.callsigns++;
  return round === 0 ? base : base + ' ' + (round + 1);
}

function buildSection(k: Kernel, b: Build, callsign: string, s: number, parent: Squad | null, slots: (RosterSlot | UnitSlot)[], vehicles: boolean, unitKind: SquadKind, vehicleColor?: number): Squad {
  const ctx = k.ctx;
  const section = ctx.squads.create(unitKind, 'police', callsign, parent ? parent.id : 0);
  b.handle.sections.push(section);
  const groups = new Map<string, Squad>();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.section !== s) continue;
    let g = groups.get(slot.group);
    if (!g) {
      g = ctx.squads.create('groupe', 'police', callsign + ' ' + letter(slot.group || 'A'), section.id);
      groups.set(slot.group, g);
      b.handle.groups.push(g);
      if (vehicles) spawnVehicle(k, b, 'fourgon_crs', g, vehicleColor);
    }
    const p = spawnSlot(k, b, slot, g);
    // le chef de section commande la section depuis son groupe de commandement
    if (slot.leads === 'section' || (slot.poste === 'chef_section' && section.leaderId === 0)) {
      section.leaderId = p.id;
    }
  }
  // sans chef de section désigné : le chef du premier groupe
  if (section.leaderId === 0) {
    const first = groups.values().next().value as Squad | undefined;
    if (first) section.leaderId = first.leaderId;
  }
  return section;
}

export function createCompany(k: Kernel, options: CompanyOptions = {}): UnitHandle {
  const ctx = k.ctx;
  const callsign = options.callsign ?? nextCompanyCallsign(k);
  const vehicles = options.vehicles !== false;
  const drivers = options.drivers !== undefined ? options.drivers : vehicles;
  const sections = Math.max(1, Math.min(4, Math.round(options.sections ?? 4)));
  const company = ctx.squads.create('compagnie', 'police', callsign);
  const b = begin(k, company, options, options.seed, options.company);
  const slots = composition(k, 'compagnie', { drivers, authority: options.authority !== false },
    () => companyRoster([], 4, drivers, options.authority !== false));
  // commandement de la compagnie : membres directs
  if (vehicles) spawnVehicle(k, b, 'vl_commandement', company);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.section !== 0) continue;
    const p = spawnSlot(k, b, slot, company);
    if (slot.leads === 'unite') {
      ctx.squads.setLeader(company.id, p.id);
      b.handle.leader = p;
    }
  }
  for (let s = 1; s <= sections; s++) buildSection(k, b, callsign + ' ' + s, s, company, slots, vehicles, 'section');
  if (vehicles) {
    const cell = spawnVehicle(k, b, 'fourgon_cellulaire', null);
    syncTree(k, true);
    const u = unitOf(company);
    if (cell && u) u.extraVehicles.push(cell.id);
  }
  if (drivers) seatDrivers(k, b);
  deploy(k, b, options.layout ?? 'colonne');
  return b.handle;
}

export function createSection(k: Kernel, options: SectionOptions = {}): UnitHandle {
  const ctx = k.ctx;
  const s = Math.max(1, Math.min(4, Math.round(options.section ?? 1)));
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const callsign = options.callsign ?? (parent ? parent.name + ' ' + s : nextCompanyCallsign(k) + ' ' + s);
  const vehicles = options.vehicles === true;
  const drivers = options.drivers !== undefined ? options.drivers : vehicles;
  const slots = composition(k, 'section', { section: s, drivers }, () => sectionRoster([], s, drivers));
  // l'unité de tête est créée par buildSection ; le Build est amorcé sur une unité provisoire puis réaffecté
  const b = begin(k, null as unknown as Squad, options, options.seed, options.company);
  const section = buildSection(k, b, callsign, s, parent ?? null, slots, vehicles, 'section');
  b.handle.squad = section;
  b.handle.leader = ctx.people.get(section.leaderId) ?? null;
  if (drivers) seatDrivers(k, b);
  deploy(k, b, options.layout ?? 'colonne');
  return b.handle;
}

export function createGroup(k: Kernel, options: GroupOptions = {}): UnitHandle {
  const ctx = k.ctx;
  const type: GroupType = options.type ?? 'appui';
  const s = Math.max(1, Math.min(4, Math.round(options.section ?? 1)));
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const lettre = type === 'appui' ? 'ALFA' : type === 'intervention' ? 'BRAVO' : 'CHARLIE';
  const callsign = options.callsign ?? (parent ? parent.name + ' ' + lettre : nextCompanyCallsign(k) + ' ' + s + ' ' + lettre);
  const vehicles = options.vehicles === true;
  const drivers = options.drivers !== undefined ? options.drivers : vehicles;
  const unitType = type === 'appui' ? 'groupe_appui' : type === 'intervention' ? 'groupe_intervention' : 'groupe_commandement';
  const slots = composition(k, unitType, { section: s, drivers }, () => groupRoster([], type, s, drivers));
  const squad = ctx.squads.create('groupe', 'police', callsign, parent ? parent.id : 0);
  const b = begin(k, squad, options, options.seed, options.company);
  b.handle.groups.push(squad);
  if (vehicles) spawnVehicle(k, b, 'fourgon_crs', squad);
  for (let i = 0; i < slots.length; i++) {
    const p = spawnSlot(k, b, slots[i], squad);
    if (slots[i].leads !== '') {
      ctx.squads.setLeader(squad.id, p.id);
      b.handle.leader = p;
    }
  }
  if (drivers) seatDrivers(k, b);
  deploy(k, b, options.layout ?? 'colonne');
  return b.handle;
}

export function createPeloton(k: Kernel, options: PelotonOptions = {}): UnitHandle {
  const ctx = k.ctx;
  const n = Math.max(1, Math.min(4, Math.round(options.peloton ?? 1)));
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const callsign = options.callsign ?? (parent ? parent.name + ' ' + n : 'ÉPERVIER ' + n);
  const vehicles = options.vehicles === true;
  const drivers = options.drivers !== undefined ? options.drivers : vehicles;
  const slots = composition(k, 'peloton_gm', { section: n, drivers }, () => pelotonRoster([], n, drivers));
  const b = begin(k, null as unknown as Squad, options, options.seed, undefined);
  // véhicules de groupe de la gendarmerie : même gabarit que le fourgon, livrée bleue
  const peloton = buildSection(k, b, callsign, n, parent ?? null, slots, vehicles, 'peloton', 0x23407a);
  b.handle.squad = peloton;
  b.handle.leader = ctx.people.get(peloton.leaderId) ?? null;
  if (drivers) seatDrivers(k, b);
  deploy(k, b, options.layout ?? 'colonne');
  return b.handle;
}

/**
 * BRAV-M : `binomes` motos, chacune avec son pilote et son opérateur, par groupes de six motos.
 * Chaque binôme est une unité (« FAUCON 1-3 ») rattachée à son groupe (« FAUCON 1 »).
 */
export function createBravm(k: Kernel, binomes: number, options: BravmOptions = {}): UnitHandle {
  const ctx = k.ctx;
  const count = Math.max(1, Math.min(18, Math.round(binomes)));
  const base = options.callsign ?? 'FAUCON';
  const groupsN = Math.ceil(count / 6);
  const top = groupsN > 1 ? ctx.squads.create('section', 'police', base) : null;
  const b = begin(k, top as unknown as Squad, options, options.seed, undefined);
  const vehicles = options.vehicles !== false;
  let made = 0;
  for (let gi = 0; gi < groupsN; gi++) {
    const group = ctx.squads.create('groupe', 'police', base + ' ' + (gi + 1), top ? top.id : 0);
    b.handle.sections.push(group);
    if (!top && gi === 0) b.handle.squad = group;
    const inGroup = Math.min(6, count - made);
    for (let i = 0; i < inGroup; i++, made++) {
      const bin = ctx.squads.create('binome', 'police', base + ' ' + (gi + 1) + '-' + (i + 1), group.id);
      b.handle.groups.push(bin);
      // opérateur : le premier du groupe le commande, le deuxième porte le LBD
      const op = spawnSlot(k, b, {
        kind: 'bravm', poste: i === 0 ? 'chef_groupe' : i === 1 ? 'lbd' : 'passager_moto', rank: i === 0 ? 'brigadier_chef' : 'gardien',
        section: gi + 1, group: '', label: i === 0 ? 'Chef de groupe (opérateur)' : 'Opérateur', leads: i === 0 ? 'groupe' : '',
      }, bin);
      const pilot = spawnSlot(k, b, { kind: 'bravm', poste: 'pilote_moto', rank: 'gardien', section: gi + 1, group: '', label: 'Pilote', leads: '' }, bin);
      ctx.squads.setLeader(bin.id, op.id);
      if (i === 0) {
        group.leaderId = op.id;
        if (!b.handle.leader) b.handle.leader = op;
      }
      if (vehicles) {
        const moto = spawnVehicle(k, b, 'moto_bravm', bin);
        if (moto && options.mounted) {
          ctx.vehicles.enter(pilot, moto, 'driver');
          ctx.vehicles.enter(op, moto, 'passenger');
        }
      }
    }
  }
  if (top) top.leaderId = b.handle.leader ? b.handle.leader.id : 0;
  syncTree(k, true);
  // un pilote sur trois garde les machines (bible §E.1) : il reste hors des formations
  if (vehicles && !options.mounted) {
    let n = 0;
    for (let i = 0; i < b.handle.people.length; i++) {
      const p = b.handle.people[i];
      if (p.poste !== 'pilote_moto') continue;
      if (n++ % 3 === 0) {
        const a = agentOf(p);
        if (a) a.crew = true;
      }
    }
  }
  deploy(k, b, options.mounted ? 'embarque' : 'colonne');
  return b.handle;
}

const CREW_CALLSIGN: Readonly<Record<CrewKind, string>> = {
  centaure: 'CENTAURE', canon_eau: 'NEPTUNE', fourgon_crs: 'FOURGON', vl_commandement: 'COMMANDEMENT',
  voiture_police: 'PATROUILLE', fourgon_cellulaire: 'CELLULAIRE',
};

/** Équipage d'un engin, créé à bord : conducteur au volant, opérateur à la tourelle, chef d'engin à côté. */
export function createEquipage(k: Kernel, kind: CrewKind, options: CrewOptions = {}): UnitHandle {
  const ctx = k.ctx;
  let rank = 1;
  for (let i = 0; i < ctx.squads.list.length; i++) if (ctx.squads.list[i].name.indexOf(CREW_CALLSIGN[kind]) === 0) rank++;
  const callsign = options.callsign ?? CREW_CALLSIGN[kind] + ' ' + rank;
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const squad = ctx.squads.create('equipage', 'police', callsign, parent ? parent.id : 0);
  const b = begin(k, squad, options, options.seed, undefined);
  const v = ctx.vehicles.spawn(kind, b.x, b.z, b.heading, { faction: 'police' });
  b.handle.vehicles.push(v);
  squad.vehicleId = v.id;
  k.reserveOf(v);
  const type = kind === 'centaure' ? 'equipage_centaure' : kind === 'canon_eau' ? 'equipage_canon_eau' : '';
  const slots = type !== '' ? composition(k, type, {}, () => crewRoster([], kind)) : crewRoster([], kind);
  let gunner = false;
  for (let i = 0; i < slots.length; i++) {
    const p = spawnSlot(k, b, slots[i], squad);
    if (slots[i].leads !== '') {
      ctx.squads.setLeader(squad.id, p.id);
      b.handle.leader = p;
    }
    let seated = false;
    if (p.poste === 'conducteur') seated = ctx.vehicles.enter(p, v, 'driver');
    else if (slots[i].leads === '' && !gunner) {
      // l'opérateur de tourelle prend la place de tireur quand l'engin en a une
      seated = ctx.vehicles.enter(p, v, 'gunner');
      gunner = seated;
    }
    if (!seated) ctx.vehicles.enter(p, v, 'passenger');
  }
  syncTree(k, true);
  const u = unitOf(squad);
  if (u) u.phase = 'embarque';
  return b.handle;
}

/** Tous les agents de l'unité et de sa descendance. */
export function membersOf(k: Kernel, squadId: number, out: Person[]): number {
  const ctx = k.ctx;
  out.length = 0;
  const visit = (s: Squad | undefined, depth: number): void => {
    if (!s || depth > 8) return;
    for (let i = 0; i < s.members.length; i++) {
      const p = ctx.people.get(s.members[i]);
      if (p) out.push(p);
    }
    const kids = ctx.squads.childrenOf(s.id);
    for (let i = 0; i < kids.length; i++) visit(kids[i], depth + 1);
  };
  visit(ctx.squads.get(squadId), 0);
  return out.length;
}

export type { EntityId };
