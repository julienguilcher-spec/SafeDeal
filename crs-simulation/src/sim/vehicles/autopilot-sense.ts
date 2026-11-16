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
import type { ApState, PathPoint } from './autopilot-state';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Vitesse au-delà de laquelle on surveille aussi la trace d'un virage (m/s). */
const WALKING_PACE = 2.2;

export class ApSensor {
  private readonly people: Person[] = [];
  private readonly props: Prop[] = [];
  private readonly hit: RayHit = makeRayHit();
  private readonly mid: PathPoint = { x: 0, z: 0, dx: 0, dz: 1 };

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
    let blocker: VehicleRt | null = null;
    let blockerLat = 0;
    let propId = 0;
    // obstacle contourné, déjà dégagé latéralement : il n'arrête plus le véhicule (voir ApDriver.avoid)
    const skipVeh = ap.avoidVeh !== 0 && dir > 0 && this.committed(ap) ? ap.avoidVeh : 0;
    const skipProp = ap.avoidProp !== 0 && dir > 0 && this.committed(ap) ? ap.avoidProp : 0;

    // ── personnes ──
    const mid = horizon * 0.5;
    const np = ctx.people.queryRadius(bx + sn * mid, bz + cs * mid, mid + hw + 3.5, this.people);
    let pedNear = Infinity;
    let pedCross = Infinity;
    for (let i = 0; i < np; i++) {
      const p = this.people[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const rx = p.x - bx;
      const rz = p.z - bz;
      const fwd = rx * sn + rz * cs;
      if (fwd < -0.4 || fwd > horizon) continue;
      const lat = rx * lx + rz * lz - k2 * fwd * fwd;
      const margin = hw + p.radius + 0.15;
      // quelqu'un au bord du couloir (trottoir, entre les voitures) : prudence, il peut traverser
      if (lat > -(margin + 3) && lat < margin + 3 && fwd < pedNear) {
        // (tout près du couloir, ou qui s'en approche : pas les passants qui longent le trottoir)
        const toward = (p.vx * lx + p.vz * lz) * (lat > 0 ? -1 : 1);
        if ((lat > -(margin + 1.2) && lat < margin + 1.2) || toward > 0.3) pedNear = fwd;
        // qui s'engage franchement vers la chaussée devant nous : tout conducteur lève le pied
        if (toward > 0.6 && fwd < pedCross) pedCross = fwd;
      }
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
        blocker = null;
      }
    }

    // ── personnes sur la trajectoire d'un virage (passage piéton de la rue où l'on tourne) ──
    // Le couloir ci-dessus suit le braquage du moment : à l'entrée d'un virage, il regarde encore tout droit. On
    // suit donc aussi l'itinéraire lui-même, décalé sur la voie, jusqu'à l'horizon.
    // (au pas — camion sono dans le cortège, engin dans la foule — le couloir ordinaire suffit : la trace entière
    // serait toujours occupée et l'arrêterait sans cesse)
    if (dir > 0 && u > WALKING_PACE && ap.mode !== 'park' && ap.n >= 3 && (this.turnsAhead(ap, horizon) || v.steerAngle > 0.08 || v.steerAngle < -0.08)) {
      const pathBest = this.pathPeople(rt, ap, horizon, hw, u);
      if (pathBest < best) {
        best = pathBest;
        bestSpeed = 0;
        reason = 'personne';
        isStatic = false;
        blocker = null;
      }
    }

    // ── véhicules ──
    const rts = this.k.rts;
    const blade = ap.pushThrough && v.def.canPush;
    for (let i = 0; i < rts.length; i++) {
      const o = rts[i]!;
      if (o === rt || o.v.id === skipVeh) continue;
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
        blocker = o;
        blockerLat = rx * lx + rz * lz;
      }
    }

    // ── objets qui barrent le passage ──
    const nq = ctx.props.queryRadius(bx + sn * mid, bz + cs * mid, mid + hw + 1, this.props);
    for (let i = 0; i < nq; i++) {
      const p = this.props[i]!;
      if (!p.blocksMove || p.dormant || p.state === 'broken' || p.carriedBy !== 0 || p.id === skipProp) continue;
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
        blocker = null;
        propId = p.id;
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
        blocker = null;
      }
    }

    // ── mobilier fixe de la carte (réverbère, arbre, borne, fût) : cercles de collision que le rayon ne voit pas ;
    // sondés à courte portée, au centre et aux deux bords du couloir ──
    const reachFix = Math.min(horizon, 1.6 + u * 0.8 + (u * u) / 8);
    if (reachFix < best) {
      const edge = rt.halfW - 0.1;
      for (let d = 0.25; d <= reachFix && d < best; d += 0.6) {
        const c = k2 * d * d;
        const px = bx + sn * d;
        const pz = bz + cs * d;
        let hitFix = false;
        for (let e = -1; e <= 1 && !hitFix; e++) {
          const l = c + e * edge;
          if (!ctx.world.isFree(px + lx * l, pz + lz * l, 0.12)) hitFix = true;
        }
        // (un objet déjà repéré à cette distance — barricade, borne — garde son motif : c'est lui qui barre)
        if (hitFix && d - 0.3 < best - 0.6) {
          best = Math.max(0, d - 0.3);
          bestSpeed = 0;
          reason = 'mur';
          isStatic = true;
          blocker = null;
          break;
        }
      }
    }

    ap.obsDist = best;
    ap.pedNear = dir > 0 ? pedNear : Infinity;
    ap.pedCross = dir > 0 ? pedCross : Infinity;

    ap.obsSpeed = bestSpeed;
    ap.obsReason = reason;
    ap.obsStatic = isStatic;
    ap.obsId = blocker ? blocker.v.id : 0;
    ap.obsPropId = reason === 'obstacle' ? propId : 0;
    ap.obsLat = blockerLat;
    ap.obsWaiting = blocker !== null && blocker.apActive && Math.abs(blocker.v.speed) < 0.3;
  }

  /** Le décalage de contournement est pris (aux trois quarts) : l'obstacle contourné n'est plus dans le couloir. */
  private committed(ap: ApState): boolean {
    const w = ap.avoidWant;
    return w !== 0 && (w > 0 ? ap.avoidShift >= w * 0.75 : ap.avoidShift <= w * 0.75);
  }

  /** L'itinéraire tourne-t-il (plus de 0,4 rad) d'ici l'horizon ? */
  private turnsAhead(ap: ApState, horizon: number): boolean {
    let sum = 0;
    for (let j = ap.seg > 0 ? ap.seg : 1; j < ap.n - 1 && ap.cum[j]! < ap.s + horizon; j++) {
      sum += ap.turnAt(j);
      if (sum > 0.4 || sum < -0.4) return true;
    }
    return false;
  }

  /**
   * Personnes (ou qui vont y entrer) sur la trace de l'itinéraire, décalée de ap.laneOffset, dans l'horizon :
   * distance libre devant le pare-chocs (Infinity si personne).
   */
  private pathPeople(rt: VehicleRt, ap: ApState, horizon: number, hw: number, u: number): number {
    const ctx = this.k.ctx;
    const path = ap.path;
    const mid = this.mid;
    ap.sample(Math.min(ap.total, ap.s + horizon * 0.5), mid);
    const n = ctx.people.queryRadius(mid.x, mid.z, horizon * 0.5 + hw + 3, this.people);
    let best = Infinity;
    const off = ap.laneOffset;
    for (let i = 0; i < n; i++) {
      const p = this.people[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const margin = hw + p.radius + 0.15;
      for (let j = ap.seg > 0 ? ap.seg - 1 : 0; j < ap.n - 1 && ap.cum[j]! < ap.s + horizon + rt.halfL; j++) {
        const ax = path[j * 2]!;
        const az = path[j * 2 + 1]!;
        const dx = path[j * 2 + 2]! - ax;
        const dz = path[j * 2 + 3]! - az;
        const l = Math.sqrt(dx * dx + dz * dz);
        if (l < 0.01) continue;
        const ux = dx / l;
        const uz = dz / l;
        const rx = p.x - ax;
        const rz = p.z - az;
        const t = rx * ux + rz * uz;
        if (t < -1 || t > l + 1) continue;
        // écart à droite de la trace, moins le décalage de voie
        const lat = rx * -uz + rz * ux - off;
        let inside = lat > -margin && lat < margin;
        const sAt = ap.cum[j]! + (t < 0 ? 0 : t > l ? l : t);
        const d = sAt - ap.s - rt.halfL - p.radius;
        if (d < -0.4 || d > horizon) continue;
        if (!inside) {
          const tt = Math.min(1.5, d / (u > 1 ? u : 1));
          const lat2 = lat + (p.vx * -uz + p.vz * ux) * tt;
          inside = (lat2 > -margin && lat2 < margin) || (lat < 0) !== (lat2 < 0);
        }
        if (inside && d < best) best = d;
      }
    }
    this.people.length = 0;
    return best;
  }
}
