/* =====================================================================================
 * SECOURS — d'où ils viennent, et création d'un équipage.
 *
 * Point de départ : sur une voie carrossable au bord de la carte quand elle est petite, sinon à
 * environ 500 m par les rues (les secours stationnent derrière le dispositif — bible §G.3), du côté
 * le plus calme, hors de la vue immédiate du joueur, avec un itinéraire réel jusqu'au lieu de l'appel.
 * Sans réseau de rues ou sans pilote automatique, l'équipe arrive à pied d'un point plus proche.
 *
 * Équipage : sapeurs-pompiers (conducteur, chef d'agrès, binôme d'attaque à la lance, binôme de
 * secours à victime) dans un engin-pompe ; SAMU (ambulancier, médecin, infirmier) dans une ambulance.
 * Les personnes sont créées par ctx.archetypes ; la dotation de chaque poste est complétée au besoin.
 * ===================================================================================== */

import type { ItemId, Person, RoadSample, Vehicle } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import { Crew, ROLE_AID, ROLE_CHIEF, ROLE_DOCTOR, ROLE_DRIVER, ROLE_HOSE, ROLE_NURSE, Rescuer } from './crew';
import type { RescueKernel } from './crew';
import { RESCUE_EVACUATED_EVENT } from './api';

export interface Origin {
  x: number;
  z: number;
  heading: number;
  /** Longueur du trajet jusqu'au lieu de l'appel (m). */
  length: number;
  /** Sur une voie carrossable, avec un itinéraire : un engin peut en partir. */
  road: boolean;
}

/** Codes de variante du module des archétypes (look.extras.variant) : porte-lance, secours à victime, chef d'agrès, médecin, infirmier, ambulancier. */
const VARIANT_HOSE = 11;
const VARIANT_AID = 12;
const VARIANT_CHIEF = 13;
const VARIANT_DOCTOR = 14;
const VARIANT_NURSE = 15;
const VARIANT_DRIVER = 16;

const POMPIERS_ROLES: readonly (readonly number[])[] = [
  [ROLE_HOSE],
  [ROLE_HOSE, ROLE_AID],
  [ROLE_DRIVER, ROLE_HOSE, ROLE_AID],
  [ROLE_DRIVER, ROLE_CHIEF, ROLE_HOSE, ROLE_AID],
  [ROLE_DRIVER, ROLE_CHIEF, ROLE_HOSE, ROLE_HOSE, ROLE_AID],
  [ROLE_DRIVER, ROLE_CHIEF, ROLE_HOSE, ROLE_HOSE, ROLE_AID, ROLE_AID],
];
const SAMU_ROLES: readonly (readonly number[])[] = [
  [ROLE_DOCTOR],
  [ROLE_DOCTOR, ROLE_NURSE],
  [ROLE_DRIVER, ROLE_DOCTOR, ROLE_NURSE],
];

const TAU = Math.PI * 2;
const CANDIDATES = 10;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Spawner {
  private readonly path: number[] = [];
  private readonly sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly nearVehicles: Vehicle[] = [];
  private counts: Record<RescueKind, number> = { pompiers: 0, samu: 0 };
  private readonly evacEvent = { personId: 0, callId: 0 };

  constructor(private readonly k: RescueKernel) {}

  reset(): void {
    this.counts.pompiers = 0;
    this.counts.samu = 0;
  }

  /**
   * Choisit le point de départ pour un appel en (x, z). `distance` : éloignement voulu (par défaut celui des
   * réglages ; plus court pour un stationnement derrière le dispositif). false si aucun point n'est utilisable.
   */
  pickOrigin(x: number, z: number, out: Origin, distance = 0): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const w = ctx.world;
    const b = w.bounds;
    const useRoads = w.nodeCount > 0 && !!k.autopilot();
    const player = ctx.player.person();
    for (let pass = useRoads ? 0 : 1; pass < 2; pass++) {
      const roads = pass === 0;
      const wanted = distance > 0 ? distance : k.tuning.originDistance;
      const reach = roads ? wanted : Math.min(wanted, 220);
      const a0 = k.rng.next() * TAU;
      let best = -Infinity;
      for (let i = 0; i < CANDIDATES; i++) {
        const a = a0 + (i * TAU) / CANDIDATES;
        let cx = clamp(x + Math.sin(a) * reach, b.minX + 12, b.maxX - 12);
        let cz = clamp(z + Math.cos(a) * reach, b.minZ + 12, b.maxZ - 12);
        let heading = Math.atan2(x - cx, z - cz);
        let length = Math.hypot(x - cx, z - cz);
        if (roads) {
          const s = this.sample;
          if (!w.nearestRoad(cx, cz, s, 160)) continue;
          if (s.roadClass === 'pedestrian' || s.roadClass === 'footway' || w.edge(s.edgeId).pedestrianOnly) continue;
          cx = s.x;
          cz = s.z;
          const path = this.path;
          if (!w.findPath(cx, cz, x, z, 'vehicle', path) || path.length < 4) continue;
          length = 0;
          let headed = false;
          for (let j = 2; j < path.length; j += 2) {
            const dx = path[j] - path[j - 2];
            const dz = path[j + 1] - path[j - 1];
            const seg = Math.sqrt(dx * dx + dz * dz);
            length += seg;
            if (!headed && seg > 1.5) {
              heading = Math.atan2(dx, dz);
              headed = true;
            }
          }
          if (length < Math.min(110, reach * 0.6)) continue; // trop près du lieu de l'appel
        } else {
          if (length < 40) continue;
          // à pied : il faut un chemin réel jusqu'au lieu de l'appel
          const path = this.path;
          if (!w.findPath(cx, cz, x, z, 'foot', path) || path.length < 4) continue;
          length = 0;
          for (let j = 2; j < path.length; j += 2) length += Math.hypot(path[j] - path[j - 2], path[j + 1] - path[j - 1]);
          if (length > reach * 2.5) continue; // détour démesuré (fleuve, îlot fermé)
        }
        if (!w.isFree(cx, cz, roads ? 1.6 : 0.5)) continue;
        // le côté le plus calme, hors de la vue immédiate du joueur, sur une voie dégagée
        let score = -Math.abs(length - reach) * 0.01 - ctx.director.tensionAt(cx, cz) * 4 - ctx.people.countIn(cx, cz, 25) * 0.05;
        if (player) {
          const d = Math.hypot(player.x - cx, player.z - cz);
          if (d < 90) score -= (90 - d) * 0.05;
        }
        if (roads && ctx.vehicles.queryRadius(cx, cz, 7, this.nearVehicles) > 0) score -= 3;
        if (score > best) {
          best = score;
          out.x = cx;
          out.z = cz;
          out.heading = heading;
          out.length = length;
          out.road = roads;
        }
      }
      if (best > -Infinity) return true;
    }
    return false;
  }

  /**
   * Point de sortie pour un engin qui repart : de préférence DEVANT lui, pour ne pas avoir à faire demi-tour
   * dans une rue étroite. false si aucune sortie n'est dans son axe (l'appelant retourne alors d'où il vient).
   */
  pickExit(v: Vehicle, out: Origin): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const w = ctx.world;
    if (w.nodeCount === 0) return false;
    const b = w.bounds;
    const reach = k.tuning.originDistance;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const path = this.path;
    const s = this.sample;
    let best = 0.6; // il faut au moins un départ franchement vers l'avant
    let found = false;
    for (let i = 0; i < CANDIDATES; i++) {
      // éventail de 200° devant l'engin
      const a = v.heading + ((i / (CANDIDATES - 1)) - 0.5) * 3.5;
      const cx = clamp(v.x + Math.sin(a) * reach, b.minX + 12, b.maxX - 12);
      const cz = clamp(v.z + Math.cos(a) * reach, b.minZ + 12, b.maxZ - 12);
      if (!w.nearestRoad(cx, cz, s, 160)) continue;
      if (s.roadClass === 'pedestrian' || s.roadClass === 'footway' || w.edge(s.edgeId).pedestrianOnly) continue;
      if (!w.findPath(v.x, v.z, s.x, s.z, 'vehicle', path) || path.length < 4) continue;
      // sens du départ : le point de l'itinéraire à une vingtaine de mètres
      let length = 0;
      let ax = 0;
      let az = 0;
      let aimed = false;
      for (let j = 2; j < path.length; j += 2) {
        length += Math.hypot(path[j] - path[j - 2], path[j + 1] - path[j - 1]);
        if (!aimed && length >= 20) {
          ax = path[j] - v.x;
          az = path[j + 1] - v.z;
          aimed = true;
        }
      }
      if (!aimed || length < 150) continue;
      const al = Math.hypot(ax, az) || 1;
      const align = (ax * fx + az * fz) / al;
      const score = align * 4 - Math.abs(length - reach) * 0.004 - ctx.director.tensionAt(s.x, s.z) * 2;
      if (align > 0.3 && score > best) {
        best = score;
        found = true;
        out.x = s.x;
        out.z = s.z;
        out.heading = v.heading;
        out.length = length;
        out.road = true;
      }
    }
    return found;
  }

  /** Longueur de l'itinéraire dans this.path ; écrit dans `dir` le sens du départ (à ~18 m) et dans `end` celui de l'arrivée. */
  private pathInfo(dir: { x: number; z: number }, end: { x: number; z: number }): number {
    const path = this.path;
    let length = 0;
    let aimed = false;
    dir.x = 0;
    dir.z = 0;
    for (let j = 2; j < path.length; j += 2) {
      const dx = path[j] - path[j - 2];
      const dz = path[j + 1] - path[j - 1];
      const seg = Math.sqrt(dx * dx + dz * dz);
      length += seg;
      if (!aimed && length >= 18) {
        dir.x = path[j] - path[0];
        dir.z = path[j + 1] - path[1];
        aimed = true;
      }
      if (seg > 1) {
        end.x = dx / seg;
        end.z = dz / seg;
      }
    }
    if (!aimed && path.length >= 4) {
      dir.x = path[path.length - 2] - path[0];
      dir.z = path[path.length - 1] - path[1];
    }
    const dl = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= dl;
    dir.z /= dl;
    return length;
  }

  private readonly dirA = { x: 0, z: 0 };
  private readonly endA = { x: 0, z: 0 };
  private readonly dirB = { x: 0, z: 0 };
  private readonly endB = { x: 0, z: 0 };

  /**
   * L'itinéraire vers (x, z) repart-il dans le dos de l'engin ? Si oui, cherche un point de passage DEVANT lui
   * (au prochain carrefour, dans une rue de côté) d'où l'on rejoint le but sans demi-tour : un engin de 6,5 m ne
   * fait pas demi-tour dans une rue de 12 m, il fait le tour du pâté de maisons. false si la route directe convient
   * (ou si aucun détour n'existe).
   */
  pickVia(v: Vehicle, x: number, z: number, out: Origin): boolean {
    const k = this.k;
    const w = k.ctx.world;
    if (w.nodeCount === 0) return false;
    const path = this.path;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    if (!w.findPath(v.x, v.z, x, z, 'vehicle', path) || path.length < 4) return false;
    this.pathInfo(this.dirA, this.endA);
    if (this.dirA.x * fx + this.dirA.z * fz > -0.2) return false; // le départ n'est pas dans son dos
    const s = this.sample;
    let best = Infinity;
    let found = false;
    for (let ring = 0; ring < 2; ring++) {
      const reach = ring === 0 ? 90 : 170;
      for (let i = 0; i < 9; i++) {
        const a = v.heading + ((i / 8) - 0.5) * 3.6;
        if (!w.nearestRoad(v.x + Math.sin(a) * reach, v.z + Math.cos(a) * reach, s, 70)) continue;
        if (s.roadClass === 'pedestrian' || s.roadClass === 'footway' || w.edge(s.edgeId).pedestrianOnly) continue;
        const cx = s.x;
        const cz = s.z;
        if (Math.hypot(cx - v.x, cz - v.z) < 35) continue;
        if (!w.findPath(v.x, v.z, cx, cz, 'vehicle', path) || path.length < 4) continue;
        const len1 = this.pathInfo(this.dirA, this.endA);
        if (this.dirA.x * fx + this.dirA.z * fz < 0.3) continue; // ce détour aussi commence par un demi-tour
        if (!w.findPath(cx, cz, x, z, 'vehicle', path) || path.length < 4) continue;
        const len2 = this.pathInfo(this.dirB, this.endB);
        // au point de passage, on ne doit pas repartir d'où l'on vient
        if (this.endA.x * this.dirB.x + this.endA.z * this.dirB.z < -0.3) continue;
        const total = len1 + len2;
        if (total < best) {
          best = total;
          found = true;
          out.x = cx;
          out.z = cz;
          out.heading = Math.atan2(this.endA.x, this.endA.z);
          out.length = total;
          out.road = true;
        }
      }
    }
    return found;
  }

  private callsign(kind: RescueKind): string {
    const n = ++this.counts[kind];
    return kind === 'pompiers' ? `SAPEUR ${n}` : `SANTÉ ${n}`;
  }

  private ensureKit(p: Person, id: ItemId, count: number): void {
    const a = this.k.ctx.actions;
    if (a.has(p, id) <= 0) a.give(p, id, count);
  }

  /** Crée un équipage (unité « secours », personnes, engin s'il y a lieu) au point donné. */
  createCrew(kind: RescueKind, id: number, x: number, z: number, heading: number, withVehicle: boolean): Crew {
    const k = this.k;
    const ctx = k.ctx;
    const crew = new Crew(id, kind);
    const squad = ctx.squads.create('secours', 'rescue', this.callsign(kind));
    crew.squadId = squad.id;
    crew.originX = x;
    crew.originZ = z;
    const table = kind === 'pompiers' ? POMPIERS_ROLES : SAMU_ROLES;
    const want = kind === 'pompiers' ? k.tuning.pompiersCrew : k.tuning.samuCrew;
    const roles = table[clamp(Math.round(want), 1, table.length) - 1];
    let v: Vehicle | null = null;
    if (withVehicle) {
      v = ctx.vehicles.spawn(kind === 'pompiers' ? 'camion_pompiers' : 'ambulance', x, z, heading, { faction: 'rescue' });
      crew.vehicle = v;
      squad.vehicleId = v.id;
    }
    crew.onFoot = !v;
    const sh = Math.sin(heading);
    const ch = Math.cos(heading);
    let leader: Person | null = null;
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      const variant = role === ROLE_HOSE ? VARIANT_HOSE : role === ROLE_AID ? VARIANT_AID : role === ROLE_CHIEF ? VARIANT_CHIEF
        : role === ROLE_DOCTOR ? VARIANT_DOCTOR : role === ROLE_NURSE ? VARIANT_NURSE : kind === 'samu' ? VARIANT_DRIVER : VARIANT_HOSE;
      // à pied : en colonne par deux derrière le point ; avec un engin : la place importe peu, ils montent aussitôt
      const row = i >> 1;
      const col = (i & 1) === 0 ? -0.5 : 0.5;
      const px = x - sh * (1.2 * row) - ch * col;
      const pz = z - ch * (1.2 * row) + sh * col;
      const p = ctx.archetypes.spawn(kind === 'pompiers' ? 'pompier' : 'samu', px, pz, {
        faction: 'rescue', heading, squadId: squad.id, seed: k.rng.int(1, 0x7fffffff), look: { extras: { variant } },
      });
      if (p.squadId !== squad.id) ctx.squads.addMember(squad.id, p.id);
      switch (role) {
        case ROLE_HOSE:
          this.ensureKit(p, 'lance_incendie', 1);
          this.ensureKit(p, 'extincteur', 15);
          break;
        case ROLE_AID:
        case ROLE_DOCTOR:
        case ROLE_NURSE:
          this.ensureKit(p, 'trousse_secours', 10);
          this.ensureKit(p, 'serum_physiologique', 20);
          break;
        case ROLE_CHIEF:
          this.ensureKit(p, 'trousse_secours', 10);
          break;
        default:
          if (kind === 'samu') this.ensureKit(p, 'trousse_secours', 10);
          break;
      }
      const r = new Rescuer(p, role);
      crew.members.push(r);
      if (role === ROLE_CHIEF || role === ROLE_DOCTOR || !leader) leader = p;
      if (v) this.seat(p, v, role, i);
    }
    if (leader) ctx.squads.setLeader(squad.id, leader.id);
    return crew;
  }

  /** Installe un membre à bord : le conducteur au volant, les autres aux places assises (le brancard reste libre). */
  seat(p: Person, v: Vehicle, role: number, index: number): boolean {
    const vehicles = this.k.ctx.vehicles;
    if (role === ROLE_DRIVER || index === 0) {
      if (vehicles.enter(p, v, 'driver')) return true;
    }
    if (v.kind === 'ambulance') {
      // places 1 et 2 : passager avant et soignant ; la dernière est celle du brancard
      for (let s = 1; s < v.seats.length - 1; s++) if (v.seats[s] === 0 && vehicles.enter(p, v, s)) return true;
      return false;
    }
    if (role === ROLE_CHIEF && vehicles.enter(p, v, 'gunner')) return true;
    return vehicles.enter(p, v, 'passenger') || vehicles.enter(p, v);
  }

  /** Retire l'équipage du monde (il a quitté la zone). La victime transportée est évacuée avec lui. */
  removeCrew(crew: Crew): void {
    const k = this.k;
    const ctx = k.ctx;
    if (crew.patientId !== 0) this.evacuate(crew);
    // à rebours : le retrait d'une personne la sort aussi de la liste (événement person:removed)
    for (let i = crew.members.length - 1; i >= 0; i--) {
      const m = crew.members[i];
      if (!m) continue;
      const p = m.p;
      if (ctx.people.get(p.id) !== p) continue;
      if (p.vehicleId !== 0) ctx.vehicles.exit(p);
      ctx.people.remove(p.id);
    }
    crew.members.length = 0;
    const v = crew.vehicle;
    if (v && ctx.vehicles.get(v.id) === v) ctx.vehicles.remove(v.id);
    crew.vehicle = null;
    if (crew.squadId !== 0) ctx.squads.remove(crew.squadId);
    crew.squadId = 0;
    const i = k.crews.indexOf(crew);
    if (i >= 0) k.crews.splice(i, 1);
  }

  /** La victime transportée quitte le jeu : elle est remise à l'hôpital (ou au point de rassemblement des victimes). */
  evacuate(crew: Crew): void {
    const k = this.k;
    const ctx = k.ctx;
    const id = crew.patientId;
    crew.patientId = 0;
    if (id === 0) return;
    const victim = ctx.people.get(id);
    if (!victim) return;
    const ev = this.evacEvent;
    ev.personId = id;
    ev.callId = crew.call ? crew.call.id : 0;
    ctx.events.emitAny(RESCUE_EVACUATED_EVENT, ev);
    // porté par un équipier à pied : le lien est défait avant le retrait
    if (victim.heldBy !== 0) {
      const holder = ctx.people.get(victim.heldBy);
      if (holder && holder.carrying === id) holder.carrying = 0;
      victim.heldBy = 0;
    }
    if (victim.vehicleId !== 0) ctx.vehicles.exit(victim);
    ctx.people.remove(id);
  }
}
