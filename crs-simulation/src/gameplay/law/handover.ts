/* =====================================================================================
 * Droit — où remettre un interpellé : véhicule de police ayant une place de passager libre
 * (fourgon cellulaire de préférence), ou point de regroupement défini par un module de mission
 * dans le service 'law.handover' ({ points: [{ x, z, radius?, name? }] }).
 * ===================================================================================== */

import type { Person, Vehicle } from '@/core/contracts';
import type { HandoverPoint, LawHandover } from './api';
import { LAW_HANDOVER_SERVICE } from './api';
import type { Kernel } from './kernel';

/** Destination d'une remise. */
export interface HandoverDest {
  kind: 'vehicle' | 'point';
  vehicle: Vehicle | null;
  seat: number;
  point: HandoverPoint | null;
  x: number;
  z: number;
  label: string;
}

export class Handover {
  private readonly vehicles: Vehicle[] = [];
  private readonly dest: HandoverDest = { kind: 'point', vehicle: null, seat: -1, point: null, x: 0, z: 0, label: '' };

  constructor(private readonly k: Kernel) {}

  /** Destination de remise à portée de l'agent (objet réutilisé d'un appel à l'autre), ou null. */
  find(actor: Person): HandoverDest | null {
    const k = this.k;
    const ctx = k.ctx;
    const cfg = k.cfg;
    const dest = this.dest;
    let best = Infinity;
    dest.vehicle = null;
    dest.point = null;
    dest.seat = -1;

    const vs = this.vehicles;
    const n = ctx.vehicles.queryRadius(actor.x, actor.z, cfg.handoverVehicleRange, vs);
    for (let i = 0; i < n; i++) {
      const v = vs[i]!;
      if (v.faction !== 'police' || v.def.flying || v.kind === 'moto_bravm') continue;
      if (v.state !== 'ok' && v.state !== 'damaged') continue;
      let seat = -1;
      for (let s = 0; s < v.seats.length; s++) {
        const def = v.def.seats[s];
        if (v.seats[s] === 0 && def !== undefined && def.role === 'passenger') {
          seat = s;
          break;
        }
      }
      if (seat < 0) continue;
      const dx = v.x - actor.x;
      const dz = v.z - actor.z;
      // un fourgon cellulaire est préféré à distance égale
      const d = dx * dx + dz * dz - (v.kind === 'fourgon_cellulaire' ? 4 : 0);
      if (d < best) {
        best = d;
        dest.kind = 'vehicle';
        dest.vehicle = v;
        dest.seat = seat;
        dest.point = null;
        dest.x = v.x;
        dest.z = v.z;
        dest.label = v.def.name;
      }
    }

    const service = ctx.service<LawHandover>(LAW_HANDOVER_SERVICE);
    const points = service && Array.isArray(service.points) ? service.points : null;
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
    return best < Infinity ? dest : null;
  }
}
