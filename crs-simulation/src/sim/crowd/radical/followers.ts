/* =====================================================================================
 * GROUPES RADICAUX — suiveurs (opportunistes) et pilleurs.
 *
 * SUIVEUR (bible F.3) : il imite. Si trois radicaux agissent à moins de vingt mètres et qu'aucune ligne
 * n'est à moins de vingt-cinq, il se colle au groupe : lance s'il a trouvé de quoi (un tas de pavés
 * descellés par d'autres, des bouteilles), aide à porter le mobilier de la barricade, pousse la voiture
 * avec les autres. Il décroche dès que la peur le prend ou qu'une unité approche à dix mètres.
 *
 * PILLAGE : une vitrine brisée, rideau levé ou forcé, devient un point chaud. Les pilleurs — arrivés à la
 * dispersion — et les suiveurs à portée y entrent (interaction « piller », 20 à 35 s), ressortent avec un
 * butin (objet 'butin') et s'enfuient. Chaque pillage constaté élargit le rayon d'attraction du point
 * chaud et la tentation des suiveurs alentour (contagion) ; la nuit, les deux sont majorés. Un pilleur
 * recule dès qu'une unité est visible à soixante mètres et renonce à quarante.
 * ===================================================================================== */

import type { EntityId, Shop } from '@/core/contracts';
import type { Acts } from './acts';
import type { RadKernel } from './kernel';
import { ACT, KIND, PLAN, TASK, TOOL, isAble } from './model';
import type { BlocState, RadGroup, RadMember } from './model';
import { BLOC } from './model';
import { SOURCE, stockOf } from './supply';
import { isMaterial, nearestMaterial } from './targets';
import * as R from './tuning';

interface Hotspot {
  shopId: EntityId;
  x: number;
  z: number;
  /** Normale sortante de la façade. */
  nx: number;
  nz: number;
  /** Pillages constatés, instant du dernier. */
  count: number;
  last: number;
  /** Poids d'attrait de l'enseigne 0..1. */
  appeal: number;
  alive: boolean;
}

export class Looting {
  readonly spots: Hotspot[] = [];
  private nextSweep = 0;

  constructor(private readonly k: RadKernel) {}

  reset(): void {
    this.spots.length = 0;
    this.nextSweep = 0;
  }

  /** Une vitrine vient d'être brisée : elle attire si l'on peut y entrer et si elle a de quoi tenter. */
  opened(shop: Shop): void {
    const k = this.k;
    const w = R.LOOT_WEIGHT[shop.category] ?? 2;
    if (w <= 0) return;
    for (const s of this.spots) if (s.shopId === shop.id) return;
    if (this.spots.length >= 24) this.spots.shift();
    this.spots.push({
      shopId: shop.id, x: shop.x, z: shop.z, nx: Math.sin(shop.heading), nz: Math.cos(shop.heading), count: 0, last: k.now,
      appeal: Math.max(w / 9, shop.appeal * 0.8), alive: true,
    });
  }

  looted(shopId: EntityId): void {
    for (const s of this.spots) {
      if (s.shopId !== shopId) continue;
      s.count++;
      s.last = this.k.now;
    }
  }

  /** Une fois par seconde : oublie les boutiques vides, fermées ou en feu. */
  update(): void {
    const k = this.k;
    if (k.now < this.nextSweep) return;
    this.nextSweep = k.now + 1;
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i]!;
      const shop = k.ctx.props.shop(s.shopId);
      const open = shop !== undefined && shop.window === 'broken' && shop.stock > 0.02 && shop.burning <= 0
        && (k.propsExt ? k.propsExt.lootable(shop) : shop.shutter < 0.5);
      s.alive = open;
      if (!open && k.now - s.last > 20) this.spots.splice(i, 1);
    }
  }

  /** Point chaud qui tente cette personne maintenant (null : aucun). */
  private tempting(m: RadMember): Hotspot | null {
    const k = this.k;
    const p = m.p;
    let best: Hotspot | null = null;
    let bestD = Infinity;
    const night = k.night ? R.LOOT_NIGHT : 1;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i]!;
      if (!s.alive) continue;
      const fresh = k.now - s.last < R.LOOT_MEMORY * k.timeK ? s.count : 0;
      let radius = (R.LOOT_RADIUS + R.LOOT_RADIUS_PER * fresh) * (k.night ? 1.3 : 1);
      if (radius > R.LOOT_RADIUS_MAX) radius = R.LOOT_RADIUS_MAX;
      if (m.kind === KIND.LOOTER) radius *= 1.6;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > radius || d >= bestD) continue;
      if (m.kind !== KIND.LOOTER) {
        // la tentation : plus forte quand d'autres se servent déjà, la nuit, et pour une enseigne qui en vaut la peine
        const pull = R.LOOT_PULL * k.heat * night * s.appeal * (1 + 0.35 * Math.min(6, fresh));
        if (k.rngAct.next() >= pull) continue;
      }
      best = s;
      bestD = d;
    }
    return best;
  }

  /**
   * Pillage : va à la vitrine, entre, ressort avec son butin et s'enfuit. Retourne true si la personne
   * est occupée à cela (le contrôleur garde la main).
   */
  think(acts: Acts, m: RadMember): boolean {
    const k = this.k;
    const p = m.p;
    const ctx = k.ctx;
    if (m.task === TASK.LOOT) {
      if (m.act !== ACT.NONE) return true;
      k.refreshTools(m);
      if ((m.tools & TOOL.LOOT) !== 0) {
        // butin en main : on file
        ctx.actions.selectById(p, 'butin');
        m.task = TASK.NONE;
        k.core.behavior.startLeaving(p, m.b, -1);
        return false;
      }
      if (m.step >= 2) {
        // rien obtenu (boutique vidée, rideau retombé, bousculade) : on renonce
        m.task = TASK.NONE;
        m.nextScan = k.now + 12;
        return false;
      }
    }
    if (k.now < m.nextScan || (m.tools & TOOL.LOOT) !== 0) return false;
    m.nextScan = k.now + 1.5 + k.rngAct.next();
    // une unité en vue : le pilleur ne s'y risque pas, le suiveur non plus si elle est près
    const pd = k.core.sense.policeNear(p.x, p.z, m.kind === KIND.LOOTER ? 5 : 3);
    if (pd < (m.kind === KIND.LOOTER ? R.LOOTER_BACK : R.FOLLOW_POLICE_KEEP)) return false;
    const s = this.tempting(m);
    if (!s) return false;
    if (m.task !== TASK.LOOT) {
      m.task = TASK.LOOT;
      m.taskSince = k.now;
      m.step = 0;
    }
    m.step++;
    // devant la vitrine, côté rue, chacun à sa place sur la largeur
    const shop = ctx.props.shop(s.shopId);
    const half = shop ? Math.max(0, shop.width * 0.5 - 0.5) : 0;
    const off = half * (((p.id * 53) % 100) / 50 - 1);
    acts.verb(m, 'piller', s.shopId, s.x + s.nx * 0.9 + s.nz * off, s.z + s.nz * 0.9 - s.nx * off, 0.7, s.x, s.z, 70);
    return true;
  }
}

/** Groupe actif que ce suiveur peut imiter : trois radicaux qui agissent à moins de vingt mètres. */
function groupToFollow(k: RadKernel, m: RadMember): RadGroup | null {
  const p = m.p;
  let best: RadGroup | null = null;
  let bestD = (R.FOLLOW_RADIUS + 12) * (R.FOLLOW_RADIUS + 12);
  for (let i = 0; i < k.groups.length; i++) {
    const g = k.groups[i]!;
    if (g.plan < PLAN.VOLLEY || g.plan > PLAN.RESUPPLY || g.broken) continue;
    const dx = g.ax - p.x;
    const dz = g.az - p.z;
    const d = dx * dx + dz * dz;
    if (d >= bestD) continue;
    let acting = 0;
    for (let j = 0; j < g.members.length && acting < R.FOLLOW_MIN_ACTING; j++) {
      const o = g.members[j]!;
      if (o.held && isAble(o) && Math.hypot(o.p.x - p.x, o.p.z - p.z) <= R.FOLLOW_RADIUS + 6) acting++;
    }
    if (acting < R.FOLLOW_MIN_ACTING) continue;
    bestD = d;
    best = g;
  }
  return best;
}

/**
 * Réflexion d'un suiveur. Retourne true si le contrôleur garde la main (il imite un groupe ou pille),
 * false pour le laisser au comportement par défaut de la foule.
 */
export function followerThink(k: RadKernel, acts: Acts, bloc: BlocState, looting: Looting, m: RadMember): boolean {
  const p = m.p;
  if (k.heat < R.TIER_BLOC) {
    if (m.group) k.detach(m);
    return false;
  }
  if (m.act !== ACT.NONE) return true;
  // la peur, ou une unité à dix mètres : il décroche
  const pd = k.core.sense.policeNear(p.x, p.z, 2);
  if (p.fear > 0.45 || pd < 10) {
    if (m.group) k.detach(m);
    m.task = TASK.NONE;
    return false;
  }
  if (looting.think(acts, m)) return true;
  if (bloc.phase !== BLOC.ACTION && bloc.phase !== BLOC.WILD) {
    if (m.group) k.detach(m);
    return false;
  }
  let g = m.group;
  if (g && (g.plan < PLAN.VOLLEY || g.plan > PLAN.FALLBACK || g.broken)) {
    k.detach(m);
    g = null;
  }
  if (!g) {
    if (pd < R.FOLLOW_POLICE_KEEP) return false;
    const found = groupToFollow(k, m);
    if (!found || !k.attach(found, m)) return false;
    g = found;
    m.lx = (((p.id * 29) % 9) - 4) * 1.2;
    m.lz = 2.6 + ((p.id * 17) % 4) * 1.1;
    m.task = TASK.NONE;
  }
  k.refreshTools(m);
  const now = k.now;
  switch (g.plan) {
    case PLAN.VOLLEY: {
      if (g.stage === 1 && m.ammo > 0 && m.nextThrowAt <= g.volleyAt && now <= g.volleyAt + R.VOLLEY_SPREAD) {
        // il lance de plus loin, après les autres, sur l'agent le plus proche de la ligne
        const a = g.a;
        const d = Math.hypot(a.nx - p.x, a.nz - p.z);
        if (d <= R.THROW_RANGE + 2 && d >= 6 && a.nearId !== 0) {
          m.nextThrowAt = g.volleyAt + 0.001;
          m.task = TASK.THROW;
          acts.throwAt(m, k.throwable(m) as 'pave', a.nx, p.y + 1.2, a.nz, a.nearId, g.volleyAt + 0.4 + k.rngAct.next() * R.VOLLEY_SPREAD);
          return true;
        }
      }
      // les mains vides : il se sert sur un tas de pavés descellés par d'autres, s'il y en a un tout près
      if (m.ammo === 0 && g.stage !== 1 && now >= m.nextReflex) {
        m.nextReflex = now + 4;
        const n = k.ctx.props.queryRadius(p.x, p.z, 14, k.props);
        for (let i = 0; i < n; i++) {
          const pr = k.props[i]!;
          if (pr.kind !== 'pile_paves' && pr.kind !== 'debris') continue;
          // il ne prend pas les derniers : ceux-là sont pour ceux qui savent s'en servir
          if (stockOf(k, pr) < 6) continue;
          m.task = TASK.SUPPLY;
          acts.verb(m, 'depaver', pr.id, pr.x, pr.z, Math.max(pr.halfX, pr.halfZ) + 0.95, NaN, NaN, 20);
          return true;
        }
      }
      break;
    }
    case PLAN.RESUPPLY: {
      if (m.ammo < 2 && g.stage >= 1 && g.supplyKind === SOURCE.PILE && now >= m.nextReflex) {
        m.nextReflex = now + 3;
        const pr = k.ctx.props.get(g.supplyId);
        if (pr) {
          m.task = TASK.SUPPLY;
          acts.verb(m, 'depaver', pr.id, pr.x, pr.z, Math.max(pr.halfX, pr.halfZ) + 0.95, NaN, NaN, 20);
          return true;
        }
      }
      break;
    }
    case PLAN.BARRICADE: {
      // il aide à porter ce qui est léger
      const s = g.site;
      if (s.active && g.stage === 0) {
        if (p.carrying !== 0) {
          if (m.step === 2) {
            m.step = 0;
            m.task = TASK.SLOT;
            acts.verb(m, 'deposer', p.carrying, p.x, p.z, 1.5, s.x, s.z, 6);
            return true;
          }
          m.step = 2;
          const side = (g.ax - s.x) * s.rx + (g.az - s.z) * s.rz >= 0 ? 1 : -1;
          const lateral = (((p.id * 31) % 100) / 50 - 1) * s.half;
          acts.goto(m, s.x + s.ax * lateral + s.rx * side * 1.1, s.z + s.az * lateral + s.rz * side * 1.1, 0.6, 1.6, false, 40);
          return true;
        }
        if (now >= m.nextReflex) {
          m.nextReflex = now + 5;
          const pr = nearestMaterial(k, g, p.x, p.z, true);
          if (pr && isMaterial(pr)) {
            m.task = TASK.CARRY;
            m.step = 1;
            acts.verb(m, 'porter', pr.id, pr.x, pr.z, Math.max(pr.halfX, pr.halfZ) + 0.9, NaN, NaN, 30);
            return true;
          }
        }
      }
      break;
    }
    case PLAN.FLIP: {
      const v = k.ctx.vehicles.get(g.tId);
      if (v && g.stage >= 1 && now >= m.nextReflex) {
        m.nextReflex = now + 8;
        const fx = Math.sin(v.heading);
        const fz = Math.cos(v.heading);
        const side = (g.ax - v.x) * -fz + (g.az - v.z) * fx >= 0 ? 1 : -1;
        const along = (((p.id * 13) % 7) / 6 - 0.5) * (v.def.length - 1);
        m.task = TASK.FLIP;
        acts.verb(m, 'renverser', v.id, v.x - fz * side * (v.def.width * 0.5 + 0.55) + fx * along, v.z + fx * side * (v.def.width * 0.5 + 0.55) + fz * along, 0.55, v.x, v.z, 40);
        return true;
      }
      break;
    }
    default:
      break;
  }
  // sinon il se tient derrière le groupe
  if (m.task !== TASK.SLOT) {
    m.task = TASK.SLOT;
    m.taskSince = now;
  }
  const wx = g.ax - g.hz * m.lx - g.hx * m.lz;
  const wz = g.az + g.hx * m.lx - g.hz * m.lz;
  if ((wx - p.x) * (wx - p.x) + (wz - p.z) * (wz - p.z) > 400) k.core.steering.goTo(p, m.b, wx, wz, R.SPEED_RUN, true);
  return true;
}

/** Réflexion d'un pilleur : il n'agit que sur une vitrine déjà brisée, loin des forces. */
export function looterThink(k: RadKernel, acts: Acts, looting: Looting, m: RadMember): boolean {
  if (k.heat < R.TIER_BLOC && looting.spots.length === 0) return false;
  if (m.act !== ACT.NONE) {
    // une unité approche : il lâche tout
    if (k.core.sense.policeNear(m.p.x, m.p.z, 4) < R.LOOTER_QUIT) {
      acts.cancel(m);
      m.task = TASK.NONE;
      return false;
    }
    return true;
  }
  return looting.think(acts, m);
}
