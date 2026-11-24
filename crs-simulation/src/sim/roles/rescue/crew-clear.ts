/* =====================================================================================
 * SECOURS — déblai : dégager la voie devant l'engin avant de repartir.
 *
 * Le bac que l'on vient d'éteindre, une poubelle renversée, une barrière tombée : ce qui est MOBILE et
 * se trouve sur la chaussée devant l'engin est poussé sur le côté par un équipier (geste « pousser »,
 * comme le ferait le joueur). Une barricade ou une carcasse ne se déplace pas à la main : l'engin
 * manœuvre autrement (crew-drive.ts).
 * ===================================================================================== */

import type { Prop } from '@/core/contracts';
import { ROLE_DRIVER, T_STANDBY, ableBody } from './crew';
import type { Crew, RescueKernel, Rescuer } from './crew';
import type { CrewTasks } from './crew-tasks';
import { holdFacing } from './nav';

/** Longueur de voie à dégager devant l'engin (m). */
const AHEAD = 30;
/** Force d'une poussée à deux mains (celle du geste « pousser » du mobilier). */
const PUSH_FORCE = 2.6;

export class CrewClear {
  private readonly near: Prop[] = [];
  private readonly isBlocker = (p: Prop): boolean => p.movable && p.blocksMove && !p.dormant && p.kind !== 'barricade'
    && p.state !== 'burning' && p.carriedBy === 0;
  /** Écart latéral de l'objet retenu par blocker() (m, positif à droite de l'engin). */
  private lateral = 0;

  constructor(private readonly k: RescueKernel, private readonly tasks: CrewTasks) {}

  /** Objet mobile sur la voie devant l'engin, le plus proche ; null si la voie est libre. */
  blocker(crew: Crew): Prop | null {
    const v = crew.vehicle;
    if (!v) return null;
    const ctx = this.k.ctx;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const half = v.def.length * 0.5;
    const n = ctx.props.queryRadius(v.x + fx * (half + AHEAD * 0.5), v.z + fz * (half + AHEAD * 0.5), AHEAD * 0.5 + 2, this.near, this.isBlocker);
    let best: Prop | null = null;
    let bestAhead = Infinity;
    for (let i = 0; i < n; i++) {
      const p = this.near[i];
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const ahead = dx * fx + dz * fz;
      // droite du véhicule = (−cos h, sin h)
      const lat = dx * -fz + dz * fx;
      const size = p.halfX > p.halfZ ? p.halfX : p.halfZ;
      if (ahead < half - 0.5 || ahead > half + AHEAD || Math.abs(lat) > v.def.width * 0.5 + 0.9 + size) continue;
      if (ahead < bestAhead) {
        bestAhead = ahead;
        best = p;
        this.lateral = lat;
      }
    }
    return best;
  }

  private worker(crew: Crew): Rescuer | null {
    const ctx = this.k.ctx;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (r.role === ROLE_DRIVER || r.p.isPlayer || !ableBody(ctx, r.p) || r.p.carrying !== 0) continue;
      return r;
    }
    return null;
  }

  /** Un pas du déblai : un équipier va pousser l'objet sur le côté. Retourne true tant qu'il reste quelque chose à dégager. */
  step(crew: Crew): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const v = crew.vehicle;
    const prop = this.blocker(crew);
    if (!v || !prop) return false;
    const r = this.worker(crew);
    if (!r) return false;
    const p = r.p;
    if (p.vehicleId !== 0) {
      ctx.vehicles.exit(p);
      if (p.vehicleId !== 0) return false;
    }
    if (this.tasks.busy(p)) return true;
    // on pousse vers le côté où l'objet se trouve déjà (à droite s'il est au milieu)
    const side = this.lateral >= -0.2 ? 1 : -1;
    const dirX = -Math.cos(v.heading) * side;
    const dirZ = Math.sin(v.heading) * side;
    const size = prop.halfX > prop.halfZ ? prop.halfX : prop.halfZ;
    const sx = prop.x - dirX * (size + 0.7);
    const sz = prop.z - dirZ * (size + 0.7);
    r.task = T_STANDBY;
    if (Math.hypot(sx - p.x, sz - p.z) > 0.9) {
      r.walker.goTo(ctx, p, sx, sz, 0.5);
      return true;
    }
    r.walker.stop(p);
    holdFacing(p, prop.x + dirX * 3, prop.z + dirZ * 3);
    // on ne pousse qu'une fois tourné dans le bon sens (le geste part dans la direction du regard)
    let turn = Math.atan2(dirX, dirZ) - p.aimYaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) > 0.3) return true;
    if (k.now >= r.nextAt) {
      r.nextAt = k.now + 0.9;
      // le geste « pousser » du mobilier s'il est branché ; à défaut, la poussée directe du service du décor
      if (!ctx.interactions.startVerb(p, 'pousser', prop.id)) ctx.props.push(prop, dirX, dirZ, PUSH_FORCE, p.id);
    }
    return true;
  }
}
