/* =====================================================================================
 * GROUPES RADICAUX — munitions : TOUT PROJECTILE VIENT D'UN OBJET PRÉSENT DANS LA RUE.
 *
 * Les violents arrivent les mains vides (bible F) : ils prennent des pavés par l'interaction « dépaver »
 * (chaussée pavée, tas de chantier, débris de mobilier cassé), des bouteilles par « ramasser » (colonnes à
 * verre, tables de terrasse, corbeilles et bacs roulants), reprennent un pavé retombé. Ce fichier cherche la source la plus proche ; le geste lui-même
 * est l'interaction du module du décor ou du matériel, qui débite sa réserve. Quand il n'y a plus rien à
 * portée, la recherche s'élargit (jusqu'à 200 m) : le groupe part se réapprovisionner ailleurs.
 * Les engins incendiaires, mortiers et fumigènes ne se trouvent pas dans la rue : seuls en ont ceux qui
 * en portaient dans leur sac (dotation des archétypes), et quand ils sont épuisés, il n'y en a plus.
 * ===================================================================================== */

import type { EntityId, InteractionHandler, InteractionOption, Person, Prop } from '@/core/contracts';
import type { PropView } from '@/sim/props/api';
import type { RadKernel } from './kernel';
import type { RadGroup } from './model';

/** Nature d'une source. */
export const SOURCE = { NONE: 0, PILE: 1, BOTTLES: 2, SETT: 3, DROPPED: 4, BIN: 5 } as const;

/** Bouteilles que l'on trouve en fouillant une corbeille de rue, un bac roulant. */
const BIN_STOCK: Readonly<Record<string, number>> = { poubelle: 2, conteneur: 6 };
const BIN_SECONDS = 2.5;
function binStock(k: RadKernel, pr: Prop): number {
  const max = BIN_STOCK[pr.kind];
  if (max === undefined || pr.carriedBy !== 0 || pr.burning > 0.05 || pr.state === 'burnt' || pr.dormant) return 0;
  const left = k.binLeft.get(pr.id);
  return left === undefined ? max : left;
}

/**
 * Interaction « ramasser » sur une corbeille ou un bac roulant : on y prend des bouteilles vides (deux dans
 * une corbeille, six dans un bac), jusqu'à épuisement. Proposée aux seuls manifestants ; le module du
 * décor fournit le même verbe pour les colonnes à verre et les tables de terrasse.
 */
export function binHandler(k: RadKernel): InteractionHandler {
  const opt: InteractionOption = { verb: 'ramasser', targetKind: 'prop', targetId: 0, label: 'Prendre des bouteilles', priority: 10, duration: BIN_SECONDS, x: 0, z: 0 };
  const able = (a: Person): boolean => a.faction === 'protest' && a.custody === 'free' && a.heldBy === 0 && a.vehicleId === 0 && a.posture !== 'down' && a.carrying === 0;
  const room = (a: Person): number => {
    const def = k.ctx.actions.def('bouteille');
    return (def ? def.maxCount : 3) - k.ctx.actions.has(a, 'bouteille');
  };
  const near = (a: Person, pr: Prop): boolean => Math.hypot(pr.x - a.x, pr.z - a.z) <= Math.max(pr.halfX, pr.halfZ) + a.radius + 1.3;
  return {
    verb: 'ramasser',
    find(a: Person, targetId?: EntityId): InteractionOption | null {
      // sur désignation seulement : sans cible, les autres gestes « ramasser » passent d'abord
      if (targetId === undefined || targetId === 0 || !able(a) || room(a) <= 0) return null;
      const pr = k.ctx.props.get(targetId);
      if (!pr || binStock(k, pr) <= 0 || !near(a, pr)) return null;
      opt.targetId = pr.id;
      opt.x = pr.x;
      opt.z = pr.z;
      return opt;
    },
    begin(a: Person, o: InteractionOption): boolean {
      const pr = k.ctx.props.get(o.targetId);
      if (!pr || !able(a) || binStock(k, pr) <= 0 || !near(a, pr)) return false;
      a.upper = 'pickup';
      a.upperT = 0;
      return true;
    },
    tick(a: Person, o: InteractionOption): boolean {
      const pr = k.ctx.props.get(o.targetId);
      return !!pr && binStock(k, pr) > 0 && able(a);
    },
    complete(a: Person, o: InteractionOption): void {
      if (a.upper === 'pickup') a.upper = 'none';
      const pr = k.ctx.props.get(o.targetId);
      if (!pr) return;
      const stock = binStock(k, pr);
      const take = Math.min(2, stock, room(a));
      if (take <= 0) return;
      k.binLeft.set(pr.id, stock - take);
      k.ctx.actions.give(a, 'bouteille', take);
    },
    cancel(a: Person): void {
      if (a.upper === 'pickup') a.upper = 'none';
    },
  };
}

const RINGS: readonly number[] = [0, 5, 10, 16, 24, 34, 46, 60, 80, 105, 135, 170, 200];
let view: PropView | undefined;

function yields(kind: string): number {
  switch (kind) {
    case 'pile_paves':
    case 'debris':
      return SOURCE.PILE;
    case 'colonne_verre':
    case 'table_terrasse':
      return SOURCE.BOTTLES;
    case 'poubelle':
    case 'conteneur':
      return SOURCE.BIN;
    default:
      return SOURCE.NONE;
  }
}

/** Réserve restante d'un objet-source (1 si le module du décor ne sait pas la dire). */
export function stockOf(k: RadKernel, prop: Prop): number {
  if (prop.carriedBy !== 0 || prop.burning > 0.2 || prop.dormant) return 0;
  if (BIN_STOCK[prop.kind] !== undefined) return k.claims.has(prop.id) ? 0 : binStock(k, prop);
  if (!k.propsExt) return 1;
  const v = k.propsExt.propView(prop, view);
  if (!v) return 0;
  view = v;
  return v.yieldLeft;
}

/**
 * Cherche une source de projectiles autour de (x, z) dans le rayon donné et l'inscrit dans le groupe
 * (supplyKind, supplyId, supplyX, supplyZ). Ordre de préférence à distance comparable : tas de pavés et
 * débris, chaussée pavée, bouteilles. Retourne false s'il n'y a rien.
 */
export function findSource(k: RadKernel, g: RadGroup, x: number, z: number, radius: number): boolean {
  const ctx = k.ctx;
  let bestScore = Infinity;
  g.supplyKind = SOURCE.NONE;
  g.supplyId = 0;
  // 1. mobilier qui en contient
  const props = k.props;
  const n = ctx.props.queryRadius(x, z, radius, props);
  for (let i = 0; i < n; i++) {
    const pr = props[i]!;
    const kind = yields(pr.kind);
    if (kind === SOURCE.NONE) continue;
    const stock = stockOf(k, pr);
    if (stock <= 0) continue;
    const d = Math.hypot(pr.x - x, pr.z - z);
    // un tas bien garni vaut le détour ; les bouteilles sont un second choix, les poubelles un troisième
    const score = d + (kind === SOURCE.BOTTLES ? 12 : kind === SOURCE.BIN ? 18 : 0) - Math.min(10, stock);
    if (score < bestScore) {
      bestScore = score;
      g.supplyKind = kind;
      g.supplyId = pr.id;
      g.supplyX = pr.x;
      g.supplyZ = pr.z;
    }
  }
  // 2. chaussée pavée : anneaux de plus en plus larges, on s'arrête au premier anneau qui en a
  const world = ctx.world;
  const a0 = (g.id * 0.7) % 6.283;
  for (let r = 0; r < RINGS.length; r++) {
    const rad = RINGS[r]!;
    if (rad > radius || rad + 6 >= bestScore) break;
    const steps = rad === 0 ? 1 : rad < 20 ? 8 : 12;
    let hit = false;
    for (let s = 0; s < steps; s++) {
      const ang = a0 + (s / steps) * 6.283;
      const px = x + Math.sin(ang) * rad;
      const pz = z + Math.cos(ang) * rad;
      if (world.surfaceAt(px, pz) !== 'sett' || !world.isFree(px, pz, 0.4)) continue;
      const score = rad + 6;
      if (score < bestScore) {
        bestScore = score;
        g.supplyKind = SOURCE.SETT;
        g.supplyId = 0;
        g.supplyX = px;
        g.supplyZ = pz;
        hit = true;
      }
    }
    if (hit) break;
  }
  // 3. pavés retombés (ceux qu'on a lancés, ou ceux des autres)
  if (bestScore > 14) {
    const list = ctx.projectiles.list;
    const r2 = Math.min(radius, 40) * Math.min(radius, 40);
    let count = 0;
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < list.length; i++) {
      const pr = list[i]!;
      if (pr.kind !== 'pave' || !pr.resting || !pr.pickable) continue;
      const dx = pr.x - x;
      const dz = pr.z - z;
      if (dx * dx + dz * dz > r2) continue;
      count++;
      sx += pr.x;
      sz += pr.z;
    }
    if (count >= 3) {
      const cx = sx / count;
      const cz = sz / count;
      const score = Math.hypot(cx - x, cz - z) + 8 - Math.min(8, count);
      if (score < bestScore) {
        bestScore = score;
        g.supplyKind = SOURCE.DROPPED;
        g.supplyId = 0;
        g.supplyX = cx;
        g.supplyZ = cz;
      }
    }
  }
  return g.supplyKind !== SOURCE.NONE;
}

/** La source retenue par le groupe donne-t-elle encore quelque chose ? */
export function sourceAlive(k: RadKernel, g: RadGroup): boolean {
  switch (g.supplyKind) {
    case SOURCE.PILE:
    case SOURCE.BOTTLES:
    case SOURCE.BIN: {
      const pr = k.ctx.props.get(g.supplyId);
      return pr !== undefined && stockOf(k, pr) > 0;
    }
    case SOURCE.SETT:
      return k.ctx.world.surfaceAt(g.supplyX, g.supplyZ) === 'sett';
    case SOURCE.DROPPED:
      return k.ctx.projectiles.nearestPickable(g.supplyX, g.supplyZ, 12) !== null;
    default:
      return false;
  }
}

/** Source retenue par un membre (objet de travail de memberSource). */
export interface MemberSource { kind: number; id: EntityId; x: number; z: number; reach: number }
export const memberSrc: MemberSource = { kind: 0, id: 0, x: 0, z: 0, reach: 1 };

/**
 * Source où CE membre va se servir : chacun la sienne quand elles sont petites (une corbeille donne deux
 * bouteilles : on n'y va pas à dix), tous au même tas quand il est gros. Cherche autour du membre, dans
 * le rayon donné ; à défaut, la chaussée pavée ou les pavés retombés retenus par le groupe. Résultat
 * dans memberSrc ; false s'il n'y a rien.
 */
export function memberSource(k: RadKernel, g: RadGroup, x: number, z: number, radius: number): boolean {
  const ctx = k.ctx;
  const out = memberSrc;
  out.kind = SOURCE.NONE;
  let bestScore = Infinity;
  const now = k.now;
  const props = k.props;
  const n = ctx.props.queryRadius(x, z, radius, props);
  for (let i = 0; i < n; i++) {
    const pr = props[i]!;
    const kind = yields(pr.kind);
    if (kind === SOURCE.NONE) continue;
    const stock = stockOf(k, pr);
    if (stock <= 0) continue;
    // petite source déjà prise par un autre
    if (stock <= 4 && (k.busyUntil.get(pr.id) ?? 0) > now) continue;
    const d = Math.hypot(pr.x - x, pr.z - z);
    const score = d + (kind === SOURCE.BOTTLES ? 6 : kind === SOURCE.BIN ? 9 : 0) - Math.min(10, stock);
    if (score < bestScore) {
      bestScore = score;
      out.kind = kind;
      out.id = pr.id;
      out.x = pr.x;
      out.z = pr.z;
      out.reach = Math.max(pr.halfX, pr.halfZ) + 0.95;
    }
  }
  if (g.supplyKind === SOURCE.SETT) {
    const d = Math.hypot(g.supplyX - x, g.supplyZ - z);
    if (d <= radius + 10 && d + 4 < bestScore) {
      out.kind = SOURCE.SETT;
      out.id = 0;
      out.x = g.supplyX;
      out.z = g.supplyZ;
      out.reach = 0.7;
      return true;
    }
  }
  if (out.kind !== SOURCE.NONE) {
    k.busyUntil.set(out.id, now + 12);
    return true;
  }
  // pavés retombés
  const list = ctx.projectiles.list;
  let bestD = Math.min(radius, 30) * Math.min(radius, 30);
  for (let i = 0; i < list.length; i++) {
    const pr = list[i]!;
    if (pr.kind !== 'pave' || !pr.resting || !pr.pickable) continue;
    if ((k.busyUntil.get(pr.id) ?? 0) > now) continue;
    // pas sous le nez des forces
    if (k.core.sense.policeNear(pr.x, pr.z, 2) < 18) continue;
    const d = (pr.x - x) * (pr.x - x) + (pr.z - z) * (pr.z - z);
    if (d < bestD) {
      bestD = d;
      out.kind = SOURCE.DROPPED;
      out.id = pr.id;
      out.x = pr.x;
      out.z = pr.z;
      out.reach = 1.1;
    }
  }
  if (out.kind === SOURCE.NONE) return false;
  k.busyUntil.set(out.id, now + 8);
  return true;
}
