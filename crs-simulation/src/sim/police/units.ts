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

import type { EntityId, Person, Prop, RayHit, RoadSample, Squad, SquadKind, Vehicle, VehicleKind } from '@/core/contracts';
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
  /** Premier véhicule de l'unité rangé sur la chaussée (filet de parkSpot) : tête de la file des suivants. */
  road: { x: number; z: number; heading: number } | null;
  /** Places réservées données par l'appelant (commissariat), dans l'ordre de création des véhicules ; null sinon. */
  parking: readonly { x: number; z: number; heading: number }[] | null;
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
    x: at.x, z: at.z, heading: at.heading, road: null,
    parking: o && o.parking && o.parking.length > 0 ? o.parking : null,
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

/**
 * Place un véhicule derrière le point de mise en place : deux files, le long du cap, à 22 m et au-delà. `len` : longueur
 * du véhicule (m) — il lui faut de la place libre au-delà de chaque pare-chocs (voir parkBody). `firm` : jamais sur une
 * pelouse (motos de la BRAV-M : garées sur le gazon de l'esplanade des Invalides, elles n'en sortaient qu'au pas, et la
 * BRAV-M, désormais rattachée à la compagnie, en est un véhicule comme les autres).
 */
function parkSpot(k: Kernel, b: Build, n: number, out: { x: number; z: number; heading: number }, len: number = PARK_LEN, firm = false): boolean {
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  const rx = -fz;
  const rz = fx;
  const world = k.ctx.world;
  out.heading = b.heading;
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = attempt === 2 ? 0 : (n & 1 ? 1 : -1) * (attempt === 1 ? -1 : 1);
    const row = n >> 1;
    const back = 24 + row * 7.6;
    const x = b.x - fx * back + rx * file * 1.8;
    const z = b.z - fz * back + rz * file * 1.8;
    if (firm && SOFT_GROUND.has(world.surfaceAt(x, z))) continue;
    if (parkBody(k, x, z, fx, fz, len) && !parkTaken(b, x, z) && !acrossRoad(k, x, z, b.heading) && parkReach(k, b, x, z)) {
      out.x = x;
      out.z = z;
      return true;
    }
  }
  // Emplacement habituel pris (façade, grille, arbre juste derrière l'unité) : sans filet, l'unité commençait SANS son
  // véhicule — donc à pied pour toute la partie. On cherche plus loin derrière et sur les côtés, puis sur la chaussée
  // la plus proche, dans l'axe de la voie. Seulement là où les équipages le rejoignent à pied par un chemin sensé : à la
  // caserne de la Cité, les rangs de 24 à 84 m tombaient dans les cours fermées du Palais, de l'autre côté du mur — les
  // équipages, arrêtés contre ce mur, n'embarquaient jamais (et le fourgon n'en serait pas sorti). En tout dernier
  // recours seulement (aucune place accessible), l'ancienne recherche, sans cette condition.
  return parkAround(k, b, out, true, undefined, len) || parkAround(k, b, out, false, undefined, len);
}

/**
 * Recherche de repli de parkSpot : rangs derrière l'unité puis chaussées alentour ; `reach` : accès à pied exigé ;
 * `accept` : condition supplémentaire sur la place (x, z, cap).
 */
function parkAround(k: Kernel, b: Build, out: { x: number; z: number; heading: number }, reach: boolean,
  accept?: (x: number, z: number, h: number) => boolean, len: number = PARK_LEN): boolean {
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  const rx = -fz;
  const rz = fx;
  const world = k.ctx.world;
  out.heading = b.heading;
  for (let back = 24; back <= 84; back += 7.6) {
    for (const file of PARK_FILES) {
      const x = b.x - fx * back + rx * file * 1.8;
      const z = b.z - fz * back + rz * file * 1.8;
      if (!parkClear(k, x, z, b.heading, len) || acrossRoad(k, x, z, b.heading) || (reach && !parkReach(k, b, x, z))
        || (accept && !accept(x, z, b.heading))) continue;
      out.x = x;
      out.z = z;
      return true;
    }
  }
  // un véhicule de l'unité est déjà rangé sur la chaussée : les suivants se garent en file derrière lui (le long du
  // trottoir, 7,6 m par rang), pas épars sur la voie. Garés au hasard des anneaux, certains se retrouvaient sur
  // l'itinéraire de sortie des autres, au milieu du boulevard : le VL de tête, une fois tourné vers la sortie, butait
  // contre un fourgon garé devant lui.
  const head = b.road;
  if (head) {
    const h = head.heading;
    const hx = Math.sin(h), hz = Math.cos(h);
    for (let j = 1; j < 2 * PARK_ROAD_RANKS; j++) {
      // une seule file le long du trottoir d'abord (chacun peut en sortir, demi-tour compris, par la voie restée
      // libre) ; une deuxième, vers l'axe, si la première est barrée
      const lane = j < PARK_ROAD_RANKS ? 0 : 1;
      const along = (lane === 0 ? j : j - PARK_ROAD_RANKS) * 7.6;
      const x = head.x + hx * along - Math.cos(h) * lane * 3.6;
      const z = head.z + hz * along + Math.sin(h) * lane * 3.6;
      if (!parkClear(k, x, z, h, len) || (reach && !parkReach(k, b, x, z)) || (accept && !accept(x, z, h))) continue;
      out.x = x;
      out.z = z;
      out.heading = h;
      return true;
    }
  }
  for (let r = 0; r <= 180; r += 10) {
    const count = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 14));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      if (!world.nearestRoad(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, parkRoad, 12) || parkRoad.width < 4) continue;
      const h = parkRoad.heading;
      const edge = Math.max(0, parkRoad.width * 0.5 - 1.7);
      // le long du trottoir de droite d'abord, puis vers l'axe
      for (const f of PARK_OFFSETS) {
        const x = parkRoad.x + Math.cos(h) * edge * f;
        const z = parkRoad.z - Math.sin(h) * edge * f;
        if (!parkClear(k, x, z, h, len) || (reach && (Math.hypot(x - b.x, z - b.z) < PARK_ROAD_MIN || !parkReach(k, b, x, z)))
          || (accept && !accept(x, z, h))) continue;
        out.x = x;
        out.z = z;
        out.heading = h;
        return true;
      }
    }
  }
  return false;
}

const PARK_FILES: readonly number[] = [-1, 1, 0, -3, 3, -5, 5];
/** Sols où un véhicule `firm` ne se gare pas (voir parkSpot ; parkClear les écarte de toute façon). */
const SOFT_GROUND: ReadonlySet<string> = new Set(['park', 'water', 'building', 'interior']);
const parkHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 } as RayHit;
const parkPath: number[] = [];
/** Détour à pied admis jusqu'au véhicule : au plus deux fois la distance à vol d'oiseau, plus une marge (m). */
const PARK_DETOUR = 2;
const PARK_DETOUR_SLACK = 10;

/**
 * Les équipages, rangés au point de mise en place, rejoignent-ils à pied ce véhicule par un chemin sensé ? Ligne droite
 * libre de tout mur, ou itinéraire piéton dont chaque tronçon est dégagé (les tronçons d'extrémité d'un itinéraire
 * partent en ligne droite vers le point demandé, à travers un mur s'il le faut : on les vérifie) et pas plus de deux
 * fois plus long que la ligne droite (pas un tour de pâté de maisons de 370 m pour un fourgon garé à 60 m).
 */
function parkReach(k: Kernel, b: Build, x: number, z: number): boolean {
  const world = k.ctx.world;
  if (!world.raycast(b.x, b.z, x, z, parkHit)) return true;
  const path = parkPath;
  path.length = 0;
  if (!world.findPath(b.x, b.z, x, z, 'foot', path) || path.length < 4) return false;
  let len = 0;
  for (let i = 2; i + 1 < path.length; i += 2) {
    if (world.raycast(path[i - 2]!, path[i - 1]!, path[i]!, path[i + 1]!, parkHit)) return false;
    len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  }
  return len <= Math.hypot(x - b.x, z - b.z) * PARK_DETOUR + PARK_DETOUR_SLACK;
}
const PARK_OFFSETS: readonly number[] = [1, 0.5, 0];
/** Largeur de chaussée (m) en deçà de laquelle un véhicule garé en travers barre la rue (voir acrossRoad). */
const ACROSS_WIDTH = 12;

/**
 * Place en travers d'une rue étroite (sur sa chaussée, cap à plus de 30° de son axe) ? Les rangs du bloc, deux de front
 * (parkSpot) et jusqu'à sept de front (parkAround), la barraient alors toute : à République, une rangée de quatre en
 * travers de la rue Béranger — l'itinéraire du VL, garé au bout, passait à travers ses voisins, qui ne pouvaient
 * reculer que d'un mètre et demi, et la colonne ne sortait pas. Ces véhicules se garent ailleurs, ou le long de la
 * chaussée (suite de parkAround). Une large chaussée (pourtour de la place) n'est pas barrée pour autant.
 */
function acrossRoad(k: Kernel, x: number, z: number, h: number): boolean {
  if (k.ctx.world.surfaceAt(x, z) !== 'road' || !k.ctx.world.nearestRoad(x, z, parkRoad, 12)) return false;
  if (parkRoad.width >= ACROSS_WIDTH || parkRoad.dist > parkRoad.width * 0.5 + 2.5) return false;
  return Math.abs(Math.sin(h - parkRoad.heading)) > 0.5;
}
/** Longueur d'un fourgon (m) : véhicule garé par défaut. Place libre exigée au-delà de chaque pare-chocs (m). */
const PARK_LEN = 5.8;
const PARK_BUMPER = 1.5;
/** Écart latéral minimal entre l'axe d'un véhicule garé et le flanc de son voisin : sa demi-largeur et une portière (m). */
const PARK_SIDE = 1.1 + 1.3;
/** Sur la chaussée, distance minimale au point de mise en place : les véhicules ne se garent pas dans les rangs (m). */
const PARK_ROAD_MIN = 10;
/** Rangs d'une file garée sur la chaussée. */
const PARK_ROAD_RANKS = 10;
const parkRoad = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
const parkProps: Prop[] = [];

/**
 * Caisse de longueur `len` (m) garée en (x, z), axe (fx, fz) : décor libre sur toute sa longueur ET au-delà de chaque
 * pare-chocs (PARK_BUMPER) — de quoi sortir en marche avant ou arrière. On ne vérifiait que ±2,4 m autour du centre,
 * quelle que soit la longueur : un VL de 6,5 m (demi-longueur 3,25) pouvait avoir le pare-chocs contre une façade, et
 * un fourgon garé à République avait un obstacle à moins d'un mètre derrière lui.
 */
function parkBody(k: Kernel, x: number, z: number, fx: number, fz: number, len: number): boolean {
  const world = k.ctx.world;
  if (!(world.isFree(x, z, 1.3) && world.isFree(x + fx * 2.4, z + fz * 2.4, 1.2) && world.isFree(x - fx * 2.4, z - fz * 2.4, 1.2))) return false;
  const end = len * 0.5 + PARK_BUMPER;
  return world.isFree(x + fx * end, z + fz * end, 1.0) && world.isFree(x - fx * end, z - fz * end, 1.0);
}

/** Une caisse de longueur `len` tient-elle ici, au cap `h` : ni mur, ni bâti, ni eau, ni pelouse, ni mobilier, ni autre véhicule ? */
function parkClear(k: Kernel, x: number, z: number, h: number, len: number = PARK_LEN): boolean {
  const ctx = k.ctx;
  const world = ctx.world;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  if (!parkBody(k, x, z, fx, fz, len)) return false;
  const surf = world.surfaceAt(x, z);
  if (surf === 'water' || surf === 'building' || surf === 'interior' || surf === 'park') return false;
  // (liste complète : l'index spatial ne connaît pas encore les véhicules créés à l'instant)
  const list = ctx.vehicles.list;
  for (let i = 0; i < list.length; i++) {
    const o = list[i]!;
    const dx = o.x - x, dz = o.z - z;
    const reach = 3.4 + o.def.length * 0.5;
    if (dx * dx + dz * dz >= reach * reach) continue;
    // rangé dans le même axe : côte à côte ou l'un derrière l'autre, à une portière près ; sinon, hors de son cercle.
    // (côte à côte : demi-largeur de l'autre, plus la sienne, plus une portière ouverte — sans la sienne, deux fourgons
    // rangés sur la chaussée se touchaient presque, et l'équipage du fourgon du milieu, pris entre deux caisses à 0,3 m,
    // n'atteignait jamais sa portière)
    const parallel = Math.abs(Math.sin(o.heading - h)) < 0.35;
    if (!parallel) return false;
    const along = Math.abs(dx * fx + dz * fz);
    const lat = Math.abs(dx * fz - dz * fx);
    if (along < len * 0.5 + o.def.length * 0.5 && lat < PARK_SIDE + o.def.width * 0.5) return false;
  }
  return ctx.props.queryRadius(x, z, 3.2, parkProps, (q) => q.blocksMove) === 0;
}

/** Un véhicule de l'unité occupe-t-il déjà cet emplacement (rangé là par le filet ci-dessus) ? */
function parkTaken(b: Build, x: number, z: number): boolean {
  const list = b.handle.vehicles;
  for (let i = 0; i < list.length; i++) if (Math.hypot(list[i]!.x - x, list[i]!.z - z) < 3) return true;
  return false;
}

const spot = { x: 0, z: 0, heading: 0 };

/**
 * Fourgon cellulaire (sans équipage : il reste au stationnement quand la compagnie part), garé dans le bloc en tête de
 * file : il est rangé à côté du premier rang (celui du VL), sur une troisième file — une fois les véhicules tournés nez
 * vers la sortie côté opposé à l'unité (session/setup.ts, faceExit), c'est le dernier rang du bloc, où il ne barre la
 * sortie à personne (si faceExit garde le cap du bloc, setup.ts — cellToRear — le ramène au dernier rang). En
 * tête de file, il enfermait le fourgon garé derrière lui (aucune place pour reculer) : celui-ci le poussait en sortant,
 * ou restait bloqué, et la colonne avec lui. Pas de place libre là : il reste où il est.
 */
function parkCellAtRear(k: Kernel, b: Build, cell: Vehicle): void {
  // places réservées : le cellulaire reste sur la sienne (ou là où la recherche de repli l'a rangé)
  if (b.parking) return;
  const lead = b.handle.vehicles[0];
  if (!lead || lead === cell || Math.hypot(cell.x - lead.x, cell.z - lead.z) > 40) return;
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  const x = b.x - fx * 24 - fz * 3 * 1.8;
  const z = b.z - fz * 24 + fx * 3 * 1.8;
  // (le cellulaire lui-même n'est pas un obstacle à sa nouvelle place)
  const ox = cell.x, oz = cell.z;
  cell.x = 1e6;
  cell.z = 1e6;
  const free = parkClear(k, x, z, b.heading, cell.def.length) && Math.hypot(x - lead.x, z - lead.z) < 8;
  cell.x = free ? x : ox;
  cell.z = free ? z : oz;
  if (free) {
    cell.heading = b.heading;
    return;
  }
  // bloc rangé sur la chaussée (mur derrière l'unité, à la caserne de la Cité) : il y a été garé au plus près, devant
  // les fourgons une fois tournés vers la sortie. On lui cherche une place d'où il n'est devant aucun d'eux.
  if (cellAtRear(b, cell, ox, oz, cell.heading)) return;
  cell.x = 1e6;
  cell.z = 1e6;
  const moved = parkAround(k, b, spot, true, (px, pz, h) => cellAtRear(b, cell, px, pz, h), cell.def.length);
  cell.x = moved ? spot.x : ox;
  cell.z = moved ? spot.z : oz;
  if (moved) cell.heading = spot.heading;
}

/**
 * Le cellulaire garé en (x, z) au cap `h` (cap avant le demi-tour de faceExit) est-il au dernier rang : aucun véhicule
 * de l'unité, à moins de 30 m, garé de l'autre côté de lui par rapport à la sortie ?
 */
function cellAtRear(b: Build, cell: Vehicle, x: number, z: number, h: number): boolean {
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const list = b.handle.vehicles;
  for (let i = 0; i < list.length; i++) {
    const v = list[i]!;
    if (v === cell) continue;
    const dx = v.x - x, dz = v.z - z;
    if (dx * dx + dz * dz < 30 * 30 && dx * fx + dz * fz > 0.5) return false;
  }
  return true;
}

/**
 * Place du n-ième véhicule de l'unité : la place réservée correspondante quand l'appelant en a donné (posée telle
 * quelle : elle a été validée sur le plan réel), sinon la recherche habituelle. Véhicule en surnombre des places
 * réservées : recherche qui contrôle TOUS les véhicules alentour (parkClear) — le premier essai de parkSpot ne vérifie
 * que l'écart aux véhicules de l'unité rangés sur ses deux files, pas aux places réservées, posées en file le long
 * d'un trottoir. `len` : longueur du véhicule (m), voir parkSpot ; `firm` : jamais sur un sol meuble au premier essai
 * (moto de BRAV-M).
 */
function placeVehicle(k: Kernel, b: Build, n: number, out: { x: number; z: number; heading: number }, len: number = PARK_LEN, firm = false): boolean {
  const reserved = b.parking ? b.parking[n] : undefined;
  if (reserved) {
    out.x = reserved.x;
    out.z = reserved.z;
    out.heading = reserved.heading;
    return true;
  }
  if (b.parking) return parkAround(k, b, out, true, undefined, len) || parkAround(k, b, out, false, undefined, len);
  return parkSpot(k, b, n, out, len, firm);
}

function spawnVehicle(k: Kernel, b: Build, kind: VehicleKind, squad: Squad | null, color?: number): Vehicle | null {
  const def = k.ctx.vehicles.def(kind);
  // (places réservées d'un commissariat d'abord ; une moto de BRAV-M jamais sur une pelouse au premier essai)
  if (!placeVehicle(k, b, b.handle.vehicles.length, spot, def ? def.length : PARK_LEN, kind === 'moto_bravm')) return null;
  if (!b.road && spot.heading !== b.heading) b.road = { x: spot.x, z: spot.z, heading: spot.heading };
  const v = k.ctx.vehicles.spawn(kind, spot.x, spot.z, spot.heading, { faction: 'police', color });
  if (b.parking) v.y = k.ctx.world.heightAt(spot.x, spot.z);
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
    : formColumn(k, u, b.x, b.z, b.x + fx * 4, b.z + fz * 4, 3, true);
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
  if (vehicles && options.cellular !== false) {
    const cell = spawnVehicle(k, b, 'fourgon_cellulaire', null);
    if (cell) parkCellAtRear(k, b, cell);
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
  // rattachée à la compagnie engagée quand on la donne (sinon unité de tête, comme avant)
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const parentId = parent && parent.faction === 'police' ? parent.id : 0;
  const top = groupsN > 1 ? ctx.squads.create('section', 'police', base, parentId) : null;
  const b = begin(k, top as unknown as Squad, options, options.seed, undefined);
  const vehicles = options.vehicles !== false;
  let made = 0;
  for (let gi = 0; gi < groupsN; gi++) {
    const group = ctx.squads.create('groupe', 'police', base + ' ' + (gi + 1), top ? top.id : parentId);
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
  voiture_police: 'PATROUILLE', fourgon_cellulaire: 'CELLULAIRE', voiture_bac: 'BAC',
};

/**
 * Engin réellement créé pour un équipage : la voiture banalisée de la BAC n'existe que si le module des véhicules la
 * définit ; à défaut, l'équipage prend une voiture de police sérigraphiée.
 */
function crewVehicleKind(k: Kernel, kind: CrewKind): VehicleKind {
  if (kind === 'voiture_bac') return k.ctx.vehicles.def('voiture_bac') ? 'voiture_bac' : 'voiture_police';
  return kind;
}

/** Équipage d'un engin, créé à bord : conducteur au volant, opérateur à la tourelle, chef d'engin à côté. */
export function createEquipage(k: Kernel, kind: CrewKind, options: CrewOptions = {}): UnitHandle {
  const ctx = k.ctx;
  let rank = 1;
  for (let i = 0; i < ctx.squads.list.length; i++) if (ctx.squads.list[i].name.indexOf(CREW_CALLSIGN[kind]) === 0) rank++;
  const callsign = options.callsign ?? CREW_CALLSIGN[kind] + ' ' + rank;
  const parent = options.parentId ? ctx.squads.get(options.parentId) : undefined;
  const squad = ctx.squads.create('equipage', 'police', callsign, parent ? parent.id : 0);
  const b = begin(k, squad, options, options.seed, undefined);
  // place réservée donnée par l'appelant (commissariat) : l'engin y est posé exactement ; sinon au point de mise en place
  const slot = b.parking ? b.parking[0] : undefined;
  if (slot) {
    // l'équipage est créé près de son engin (il y monte aussitôt)
    b.x = slot.x;
    b.z = slot.z;
    b.heading = slot.heading;
  }
  const v = ctx.vehicles.spawn(crewVehicleKind(k, kind), b.x, b.z, b.heading, { faction: 'police' });
  if (slot) v.y = ctx.world.heightAt(b.x, b.z);
  b.handle.vehicles.push(v);
  squad.vehicleId = v.id;
  k.reserveOf(v);
  const type = kind === 'centaure' ? 'equipage_centaure' : kind === 'canon_eau' ? 'equipage_canon_eau' : '';
  const slots = type !== '' ? composition(k, type, {}, () => crewRoster([], kind)) : crewRoster([], kind);
  let gunner = false;
  const standing: Person[] = [];
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
    if (!seated && !ctx.vehicles.enter(p, v, 'passenger')) standing.push(p);
  }
  // engin d'un commissariat sans place passager (engin lanceur d'eau : le chef d'engin tient le second canon) : la place
  // qui reste — l'équipage part au complet de ses places, sans personne à pied dans la cour. (Les engins de la compagnie
  // gardent leur mise en place : le chef d'engin à pied, près de son engin.)
  if (b.parking) for (const p of standing) ctx.vehicles.enter(p, v);
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
