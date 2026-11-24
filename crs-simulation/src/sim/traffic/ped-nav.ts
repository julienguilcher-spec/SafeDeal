/* =====================================================================================
 * CIRCULATION — piétons : choix de la rue suivante au bout d'une arête, et de la manœuvre pour y aller
 * (contourner l'angle des deux trottoirs, traverser la rue transversale, traverser sa propre rue,
 * rebrousser chemin). En promenade le choix est tiré au sort (tout droit de préférence) ; en fuite on
 * prend la rue qui éloigne le plus du danger ou rapproche d'un abri.
 * ===================================================================================== */

import type { EdgePoint } from './graph';
import { E_TUNNEL, N_CROSSING, N_JUNCTION, N_SIGNAL } from './graph';
import type { PedBrain } from './ped-brain';
import { S_CORNER, S_CROSS, S_WAIT } from './ped-brain';
import type { Peds } from './peds';
import type { TrafficKernel } from './shared';

export class PedNav {
  private readonly ep: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly ep2: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };

  constructor(private readonly k: TrafficKernel, private readonly peds: Peds) {}

  /**
   * Au bout de l'arête : choix de la suite et de la manœuvre (angle, traversée de la rue transversale,
   * traversée de sa propre rue, demi-tour).
   */
  atNode(b: PedBrain, node: number, mode: number): void {
    const k = this.k;
    const c = k.cache;
    const rng = k.rng;
    const e = b.edge;
    const ep = this.ep;
    const ep2 = this.ep2;
    c.dirFrom(e, node, ep);
    const nx = ep.x;
    const nz = ep.z;
    // sens de marche en arrivant au nœud, et vecteur vers mon trottoir (droite = (−dz, dx))
    const tx = -ep.dx;
    const tz = -ep.dz;
    const sx = -tz * b.side;
    const sz = tx * b.side;
    // direction qui éloigne du danger (fuite, départ)
    let awayX = 0;
    let awayZ = 0;
    if (mode !== 0) {
      awayX = nx - b.dangerX;
      awayZ = nz - b.dangerZ;
      const l = Math.sqrt(awayX * awayX + awayZ * awayZ);
      if (l > 0.01) {
        awayX /= l;
        awayZ /= l;
      }
      if (b.hasRefuge) {
        // l'abri (bouche de métro) attire autant que le danger repousse
        const rx = b.refugeX - nx;
        const rz = b.refugeZ - nz;
        const rl = Math.sqrt(rx * rx + rz * rz);
        if (rl > 1) {
          awayX = awayX * 0.5 + (rx / rl) * 0.9;
          awayZ = awayZ * 0.5 + (rz / rl) * 0.9;
        }
      }
    }
    const own = (c.nodeFlags[node]! & (N_CROSSING | N_SIGNAL | N_JUNCTION)) !== 0 && c.isVehicle(e);
    let best = -1;
    let bestKind = 0; // 0 angle ou suite, 1 traversée de ma rue d'abord
    let total = 0;
    let bestScore = mode !== 0 ? -(tx * awayX + tz * awayZ) - 0.35 : 0; // rebrousser chemin : dernier recours
    for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
      const e2 = c.adjEdge[j]!;
      if (e2 === e || (c.edgeFlags[e2]! & E_TUNNEL) !== 0) continue;
      c.dirFrom(e2, node, ep2);
      const dot = ep2.dx * tx + ep2.dz * tz;
      const toward = ep2.dx * sx + ep2.dz * sz;
      const vehicle = c.isVehicle(e2);
      const away = toward < -0.35 && dot <= 0.7;
      if (mode !== 0) {
        const score = ep2.dx * awayX + ep2.dz * awayZ + 0.3 * (1 - Math.abs(dot)) + rng.next() * 0.1;
        if (score > bestScore) {
          bestScore = score;
          best = e2;
          bestKind = away && own ? 1 : 0;
        }
        continue;
      }
      let w = dot > 0.7 ? 3 : toward > 0.35 ? 2 : away ? (own && b.waited >= 0 ? 0.5 : 0) : 0.1;
      if (vehicle && c.edgeSidewalk[e2]! < 1) w *= 0.12;
      else if (!vehicle) w *= 0.7;
      if (w <= 0) continue;
      total += w;
      if (rng.next() * total < w) {
        best = e2;
        bestKind = away ? 1 : 0;
      }
    }
    // de temps en temps, à un passage piéton, il change de trottoir
    if (mode === 0 && own && best >= 0 && bestKind === 0 && b.waited >= 0 && rng.chance(0.07)) bestKind = 1;
    if (best < 0) {
      // impasse, ou le danger est partout ailleurs : demi-tour sur le même trottoir
      b.dir = -b.dir;
      b.side = -b.side;
      return;
    }
    const lat1 = this.peds.lat(e, b.jitter);
    if (bestKind === 1) {
      // traversée de ma propre rue : même abscisse, trottoir d'en face ; la suite se décidera de l'autre côté
      const px = b.p.x - nx;
      const pz = b.p.z - nz;
      const along = px * tx + pz * tz;
      b.tx = nx + tx * along - sx * lat1;
      b.tz = nz + tz * along - sz * lat1;
      if (!this.peds.walkable(b.tx, b.tz)) {
        b.waited = -1; // pas de trottoir en face : on n'essaiera plus ici
        return;
      }
      b.nextEdge = e;
      b.nextDir = b.dir;
      b.nextSide = -b.side;
      b.crossNode = node;
      b.crossDx = tx;
      b.crossDz = tz;
      b.waited = 0;
      b.state = mode === 1 ? S_CROSS : S_WAIT;
      b.timer = 30;
      return;
    }
    // suite sur l'arête choisie, du même côté par rapport au sens de marche
    c.dirFrom(best, node, ep2);
    const ux = ep2.dx;
    const uz = ep2.dz;
    const n2x = -uz * b.side;
    const n2z = ux * b.side;
    const lat2 = this.peds.lat(best, b.jitter);
    b.nextEdge = best;
    b.nextDir = c.edgeA[best] === node ? 1 : -1;
    b.nextSide = b.side;
    b.waited = 0;
    // une rue débouche-t-elle de mon côté entre les deux ? alors il faut la traverser
    let arm = false;
    if (ux * sx + uz * sz <= 0.35) {
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e3 = c.adjEdge[j]!;
        if (e3 === e || e3 === best || !c.isVehicle(e3)) continue;
        c.dirFrom(e3, node, ep);
        if (ep.dx * sx + ep.dz * sz > 0.35) {
          arm = true;
          b.crossDx = ep.dx;
          b.crossDz = ep.dz;
        }
      }
    }
    if (arm) {
      const reach = c.nodeRadius[node]! + 1;
      b.tx = nx + ux * reach + n2x * lat2;
      b.tz = nz + uz * reach + n2z * lat2;
      b.crossNode = node;
      b.state = mode === 1 ? S_CROSS : S_WAIT;
      b.timer = 30;
      return;
    }
    // angle des deux trottoirs : intersection des deux lignes de marche
    const cos = sx * n2x + sz * n2z;
    const den = 1 - cos * cos;
    let cx: number;
    let cz: number;
    if (den < 0.03) {
      const m = (lat1 + lat2) * 0.5;
      cx = sx * m;
      cz = sz * m;
    } else {
      const a = (lat1 - cos * lat2) / den;
      const bb = (lat2 - cos * lat1) / den;
      cx = sx * a + n2x * bb;
      cz = sz * a + n2z * bb;
      const l = Math.sqrt(cx * cx + cz * cz);
      const max = Math.max(lat1, lat2) * 2.2 + 1;
      if (l > max) {
        cx *= max / l;
        cz *= max / l;
      }
    }
    b.tx = nx + cx;
    b.tz = nz + cz;
    if (!this.peds.walkable(b.tx, b.tz)) {
      // l'angle des deux trottoirs tombe sur la chaussée (carrefour évasé, place) : c'est une traversée, vers le
      // trottoir de la rue suivante un peu plus loin
      const reach = c.nodeRadius[node]! + 4;
      b.tx = nx + ux * reach + n2x * lat2;
      b.tz = nz + uz * reach + n2z * lat2;
      b.crossNode = node;
      b.crossDx = tx;
      b.crossDz = tz;
      b.state = mode === 1 ? S_CROSS : S_WAIT;
      b.timer = 30;
      return;
    }
    b.state = S_CORNER;
    b.timer = 12;
  }
}
