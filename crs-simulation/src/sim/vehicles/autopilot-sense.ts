/* =====================================================================================
 * Pilote automatique — perception : ce qui se trouve dans le couloir devant le véhicule.
 *
 * Le couloir part du pare-chocs (avant, ou arrière en marche arrière), large comme le véhicule plus
 * une marge, long comme la distance d'arrêt plus une réserve, et courbé selon le braquage courant.
 * On y cherche : personnes (y compris celles qui s'apprêtent à traverser), véhicules, objets qui
 * barrent le passage, murs. Le plus proche fixe la vitesse permise.
 * ===================================================================================== */

import type { Person, Prop, RayHit } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { ApState } from './autopilot-state';
import type { VehicleKernel, VehicleRt } from './runtime';

export class ApSensor {
  private readonly people: Person[] = [];
  private readonly props: Prop[] = [];
  private readonly hit: RayHit = makeRayHit();

  constructor(private readonly k: VehicleKernel) {}

  /**
   * Explore le couloir de longueur `horizon` (m). `dir` = 1 en marche avant, −1 en marche arrière ;
   * `kappa` = courbure de la trajectoire (1/m, positive vers la gauche) ; `margin` = marge de chaque côté (m).
   * Renseigne ap.obs*.
   */
  scan(rt: VehicleRt, ap: ApState, horizon: number, dir: number, kappa: number, margin = 0.35): void {
    const ctx = this.k.ctx;
    const v = rt.v;
    const sn = Math.sin(v.heading) * dir;
    const cs = Math.cos(v.heading) * dir;
    // gauche du sens de marche
    const lx = cs;
    const lz = -sn;
    const bx = v.x + sn * rt.halfL;
    const bz = v.z + cs * rt.halfL;
    const hw = rt.halfW + margin;
    const u = Math.abs(v.speed);
    const k2 = kappa * dir * 0.5;
    let best = Infinity;
    let bestSpeed = 0;
    let reason: ApState['obsReason'] = '';
    let isStatic = false;

    // ── personnes ──
    const mid = horizon * 0.5;
    const np = ctx.people.queryRadius(bx + sn * mid, bz + cs * mid, mid + hw + 1.5, this.people);
    for (let i = 0; i < np; i++) {
      const p = this.people[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const rx = p.x - bx;
      const rz = p.z - bz;
      const fwd = rx * sn + rz * cs;
      if (fwd < -0.4 || fwd > horizon) continue;
      const lat = rx * lx + rz * lz - k2 * fwd * fwd;
      const margin = hw + p.radius + 0.15;
      let inside = lat > -margin && lat < margin;
      if (!inside) {
        // va-t-elle entrer dans le couloir avant que j'arrive à sa hauteur ?
        const t = Math.min(1.5, fwd / (u > 1 ? u : 1));
        const lat2 = lat + (p.vx * lx + p.vz * lz) * t;
        inside = (lat2 > -margin && lat2 < margin) || (lat < 0) !== (lat2 < 0);
      }
      if (!inside) continue;
      const d = fwd - p.radius;
      if (d < best) {
        best = d;
        bestSpeed = p.vx * sn + p.vz * cs;
        reason = 'personne';
        isStatic = false;
      }
    }

    // ── véhicules ──
    const rts = this.k.rts;
    const blade = ap.pushThrough && v.def.canPush;
    for (let i = 0; i < rts.length; i++) {
      const o = rts[i]!;
      if (o === rt) continue;
      const ov = o.v;
      const rx = ov.x - bx;
      const rz = ov.z - bz;
      const reach = horizon + o.radius;
      if (rx * rx + rz * rz > reach * reach || ov.dormant || ov.def.flying) continue;
      const wreck = ov.state === 'wrecked' || ov.state === 'burnt';
      if (blade && wreck) continue; // la lame s'en charge
      // emprise de l'autre véhicule dans mon repère : ses quatre côtés, découpés par les bords du couloir
      const osn = Math.sin(ov.heading);
      const ocs = Math.cos(ov.heading);
      let d = Infinity;
      for (let e = 0; e < 4; e++) {
        // coins e et e + 1 (repère de l'autre : gauche·sx + avant·sz)
        const s0x = e === 0 || e === 3 ? o.halfW : -o.halfW;
        const s0z = e < 2 ? o.halfL : -o.halfL;
        const n = (e + 1) & 3;
        const s1x = n === 0 || n === 3 ? o.halfW : -o.halfW;
        const s1z = n < 2 ? o.halfL : -o.halfL;
        const ax = rx + ocs * s0x + osn * s0z;
        const az = rz - osn * s0x + ocs * s0z;
        const cx = rx + ocs * s1x + osn * s1z;
        const cz = rz - osn * s1x + ocs * s1z;
        const f0 = ax * sn + az * cs;
        const f1 = cx * sn + cz * cs;
        const l0 = ax * lx + az * lz - k2 * f0 * f0;
        const l1 = cx * lx + cz * lz - k2 * f1 * f1;
        // portion du côté comprise dans la bande |latéral| ≤ hw
        let t0 = 0;
        let t1 = 1;
        const dl = l1 - l0;
        if (dl > 1e-9 || dl < -1e-9) {
          const ta = (-hw - l0) / dl;
          const tb = (hw - l0) / dl;
          const lo = ta < tb ? ta : tb;
          const hi = ta < tb ? tb : ta;
          if (lo > t0) t0 = lo;
          if (hi < t1) t1 = hi;
          if (t0 > t1) continue;
        } else if (l0 > hw || l0 < -hw) {
          continue;
        }
        const fa = f0 + (f1 - f0) * t0;
        const fb = f0 + (f1 - f0) * t1;
        const near = fa < fb ? fa : fb;
        const far = fa < fb ? fb : fa;
        if (far < 0) continue; // derrière le pare-chocs
        if (near < d) d = near;
      }
      if (d === Infinity || d > horizon) continue;
      if (d < 0) d = 0;
      if (d < best) {
        best = d;
        bestSpeed = ov.vx * sn + ov.vz * cs;
        reason = 'vehicule';
        isStatic = wreck || o.dyn.asleep;
      }
    }

    // ── objets qui barrent le passage ──
    const nq = ctx.props.queryRadius(bx + sn * mid, bz + cs * mid, mid + hw + 1, this.props);
    for (let i = 0; i < nq; i++) {
      const p = this.props[i]!;
      if (!p.blocksMove || p.dormant || p.state === 'broken' || p.carriedBy !== 0) continue;
      if (blade) continue;
      if (ap.urgence && p.movable && p.hp <= 60) continue; // une poubelle n'arrête pas une intervention
      const rx = p.x - bx;
      const rz = p.z - bz;
      const fwd = rx * sn + rz * cs;
      const r = p.halfX > p.halfZ ? p.halfX : p.halfZ;
      if (fwd + r < 0 || fwd - r > horizon) continue;
      const lat = rx * lx + rz * lz - k2 * fwd * fwd;
      if (lat > hw + r || lat < -(hw + r)) continue;
      const d = fwd - r;
      if (d < best) {
        best = d;
        bestSpeed = 0;
        reason = 'obstacle';
        isStatic = true;
      }
    }

    // ── mur droit devant (filet de sécurité : l'itinéraire suit les rues) ──
    const ray = Math.min(horizon, 3 + u);
    if (ctx.world.raycast(bx, bz, bx + sn * ray, bz + cs * ray, this.hit) && this.hit.hit) {
      const d = this.hit.t * ray;
      if (d < best && d < 1.2 + (u * u) / 8) {
        best = d;
        bestSpeed = 0;
        reason = 'mur';
        isStatic = true;
      }
    }

    ap.obsDist = best;
    ap.obsSpeed = bestSpeed;
    ap.obsReason = reason;
    ap.obsStatic = isStatic;
  }
}
