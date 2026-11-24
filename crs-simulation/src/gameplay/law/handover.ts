/* =====================================================================================
 * Droit — où remettre un interpellé : véhicule de police ayant une place de passager libre, ou point
 * de regroupement défini par un module de mission dans le service 'law.handover'
 * ({ points: [{ x, z, radius?, name? }] }).
 *
 * Portée par nature de véhicule (plan ordres-directs §5.3) : un fourgon cellulaire à 12 m
 * (handoverCellularRange : on y fait monter l'interpellé par la porte arrière, le fourgon garé en
 * retrait), tout autre véhicule de police à 5 m (handoverVehicleRange). Tout fourgon cellulaire à
 * portée passe avant tout autre véhicule, même plus proche ; puis le véhicule ou le point le plus proche.
 *
 * nearestDrop() : le lieu de dépôt le plus proche sans limite de distance (fourgons cellulaires
 * d'abord, pleins ou non ; sinon un véhicule de police ayant une place) — l'objectif « Emmenez
 * l'interpellé au CELLULAIRE 1 — 140 m » et la ligne d'aide.
 * ===================================================================================== */

import type { EntityId, Person, Vehicle } from '@/core/contracts';
import type { CustodyDrop, HandoverPoint, LawHandover } from './api';
import { LAW_HANDOVER_SERVICE } from './api';
import type { Kernel } from './kernel';
import { isHeldVehicle } from '@/world/commissariats';

/** Destination d'une remise. */
export interface HandoverDest {
  kind: 'vehicle' | 'point';
  vehicle: Vehicle | null;
  seat: number;
  point: HandoverPoint | null;
  x: number;
  z: number;
  /** Indicatif du fourgon (« CELLULAIRE 1 »), nom du véhicule (« Fourgon de CRS ») ou du point. */
  label: string;
  /** Distance de l'agent à la destination (m). */
  distance: number;
}

/** Véhicule de police qui peut recevoir un interpellé (en état, ni moto ni aéronef). */
function receives(v: Vehicle): boolean {
  return v.faction === 'police' && !v.def.flying && v.kind !== 'moto_bravm' && (v.state === 'ok' || v.state === 'damaged');
}

/** Première place de passager libre (−1 : aucune). */
export function passengerSeat(v: Vehicle): number {
  for (let s = 0; s < v.seats.length; s++) {
    const def = v.def.seats[s];
    if (v.seats[s] === 0 && def !== undefined && def.role === 'passenger') return s;
  }
  return -1;
}

export class Handover {
  private readonly vehicles: Vehicle[] = [];
  private readonly dest: HandoverDest = { kind: 'point', vehicle: null, seat: -1, point: null, x: 0, z: 0, label: '', distance: 0 };
  private readonly drop: CustodyDrop = {
    vehicleId: 0, squadId: 0, name: '', cellular: false, x: 0, z: 0, distance: 0, detainees: 0, freeSeats: 0,
  };

  constructor(private readonly k: Kernel) {}

  /** Équipage d'un véhicule de police (unité dont c'est le véhicule), ou 0. */
  crewOf(v: Vehicle): number {
    const list = this.k.ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.vehicleId === v.id && s.faction === 'police') return s.id;
    }
    return 0;
  }

  /** Nom donné au véhicule à l'écran et à la radio : l'indicatif de l'équipage d'un fourgon cellulaire, sinon son nom. */
  nameOf(v: Vehicle): string {
    if (v.kind === 'fourgon_cellulaire') {
      const crew = this.crewOf(v);
      const s = crew !== 0 ? this.k.ctx.squads.get(crew) : undefined;
      if (s && s.name !== '') return s.name;
    }
    return v.def.name;
  }

  /** Nom du véhicule à la radio : « CELLULAIRE 1 », « véhicule de MISTRAL 1 ALFA », « véhicule (Fourgon de CRS) ». */
  radioName(v: Vehicle): string {
    if (v.kind === 'fourgon_cellulaire') return this.nameOf(v);
    const crew = this.crewOf(v);
    const s = crew !== 0 ? this.k.ctx.squads.get(crew) : undefined;
    return s && s.name !== '' ? 'véhicule de ' + s.name : 'véhicule (' + v.def.name + ')';
  }

  /**
   * Destination de remise à portée de l'agent (objet réutilisé d'un appel à l'autre), ou null. `cellularOnly` : un
   * fourgon cellulaire seulement.
   */
  find(actor: Person, cellularOnly = false): HandoverDest | null {
    const k = this.k;
    const ctx = k.ctx;
    const cfg = k.cfg;
    const dest = this.dest;
    let best = Infinity;
    let bestVan = false;
    dest.vehicle = null;
    dest.point = null;
    dest.seat = -1;

    const vehicleRange = cfg.handoverVehicleRange;
    const vanRange = Math.max(cfg.handoverCellularRange, vehicleRange);
    const vs = this.vehicles;
    const n = ctx.vehicles.queryRadius(actor.x, actor.z, vanRange, vs);
    for (let i = 0; i < n; i++) {
      const v = vs[i]!;
      if (!receives(v)) continue;
      // véhicule garé en réserve d'un commissariat (verrouillé, sans équipage) : pas une destination de remise
      if (isHeldVehicle(ctx, v.id)) continue;
      const van = v.kind === 'fourgon_cellulaire';
      if (cellularOnly && !van) continue;
      const dx = v.x - actor.x;
      const dz = v.z - actor.z;
      const d = dx * dx + dz * dz;
      if (!van && d > vehicleRange * vehicleRange) continue;
      // tout fourgon cellulaire à portée passe avant tout autre véhicule ; à nature égale, le plus proche
      if (bestVan && !van) continue;
      if (van === bestVan && d >= best) continue;
      const seat = passengerSeat(v);
      if (seat < 0) continue;
      best = d;
      bestVan = van;
      dest.kind = 'vehicle';
      dest.vehicle = v;
      dest.seat = seat;
      dest.point = null;
      dest.x = v.x;
      dest.z = v.z;
      dest.label = this.nameOf(v);
    }
    vs.length = 0;

    const service = ctx.service<LawHandover>(LAW_HANDOVER_SERVICE);
    const points = !cellularOnly && !bestVan && service && Array.isArray(service.points) ? service.points : null;
    if (points) {
      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        const r = pt.radius !== undefined && pt.radius > 0 ? pt.radius : cfg.handoverPointRadius;
        const dx = pt.x - actor.x;
        const dz = pt.z - actor.z;
        const d = dx * dx + dz * dz;
        if (d > r * r || d >= best) continue;
        best = d;
        dest.kind = 'point';
        dest.vehicle = null;
        dest.seat = -1;
        dest.point = pt;
        dest.x = pt.x;
        dest.z = pt.z;
        dest.label = pt.name !== undefined && pt.name !== '' ? pt.name : 'point de regroupement';
      }
    }
    if (best === Infinity) return null;
    dest.distance = Math.sqrt(best);
    return dest;
  }

  /** Interpellés à bord d'un véhicule. */
  detaineesIn(v: Vehicle): number {
    let n = 0;
    for (let s = 0; s < v.seats.length; s++) {
      const id = v.seats[s]!;
      if (id === 0) continue;
      const p = this.k.ctx.people.get(id);
      if (p && p.custody === 'in_vehicle') n++;
    }
    return n;
  }

  /**
   * Lieu de dépôt le plus proche de (x, z), sans limite de distance (objet réutilisé) : le fourgon cellulaire le plus
   * proche (de préférence avec une place), sinon le véhicule de police le plus proche ayant une place ; null : aucun.
   */
  nearestDrop(x: number, z: number, skip: EntityId = 0): CustodyDrop | null {
    const list = this.k.ctx.vehicles.list;
    let van: Vehicle | null = null;
    let vanD = Infinity;
    let vanFree = false;
    let other: Vehicle | null = null;
    let otherD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.id === skip || !receives(v)) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      const free = passengerSeat(v) >= 0;
      if (v.kind === 'fourgon_cellulaire') {
        // un fourgon qui a une place passe avant un fourgon plein, sauf s'il est bien plus loin (le plein part bientôt)
        if (van === null || (free && !vanFree && d < vanD + 300) || (free === vanFree && d < vanD)) {
          van = v;
          vanD = d;
          vanFree = free;
        }
      } else if (free && d < otherD) {
        other = v;
        otherD = d;
      }
    }
    const v = van ?? other;
    if (!v) return null;
    const out = this.drop;
    out.vehicleId = v.id;
    out.squadId = this.crewOf(v);
    out.name = this.nameOf(v);
    out.cellular = v.kind === 'fourgon_cellulaire';
    out.x = v.x;
    out.z = v.z;
    out.distance = v === van ? vanD : otherD;
    out.detainees = this.detaineesIn(v);
    let freeSeats = 0;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s]!.role === 'passenger') freeSeats++;
    out.freeSeats = freeSeats;
    return out;
  }
}
