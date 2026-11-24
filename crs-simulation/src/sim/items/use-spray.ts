/* =====================================================================================
 * JETS CONTINUS — gazeuse (cône lacrymogène), extincteur (poudre), lance à incendie (eau),
 * bombe de peinture (inscription).
 *
 * Un usage déclenche un jet de durée fixe (une seconde pour la gazeuse et l'extincteur) qui consomme
 * une charge ; maintenir l'action enchaîne les jets. Pendant le jet, l'effet est appliqué cinq fois
 * par seconde dans la direction de visée COURANTE de la personne : elle peut balayer.
 * ===================================================================================== */

import type { DamageInfo, ItemDef, ItemStack, Person, Prop, Shop, UseOptions, UseResult } from '@/core/contracts';
import { segmentParam } from '@/core/math';
import type { ItemSpec, SpraySpec } from './api';
import { consume } from './inventory';
import { EMIT_PERIOD, PALET_LINGER_SECONDS } from './projectile-defs';
import type { ProjectileSystem } from './projectiles';
import { COVER_NONE, COVER_SHIELD, STUN_BLOCK, USE_OK, activeId, coverOf, isPolice, useFail } from './shared';
import type { ItemsCore, Spray } from './shared';
import { itemSpec } from './specs';

/** Exposition directe au jet de gazeuse (par seconde, visage découvert) et petit nuage résiduel. */
const GAS_EXPOSURE_RATE = 1.8;
const GAS_CLOUD_AMOUNT = 0.06;
const GAS_CLOUD_RADIUS = 2;
/** Vitesse d'extinction d'une personne en feu sous la poudre et sous l'eau (par seconde). */
const POWDER_QUENCH_RATE = 0.9;
const WATER_QUENCH_RATE = 2;
/** Agent extincteur par seconde de jet (1 = extincteur portatif ; la lance débite davantage). */
const POWDER_RATE = 1;
const WATER_RATE = 1.6;
/** Demi-largeur du jet d'eau (m). */
const WATER_WIDTH = 0.5;

/** Première personne dans le cône (pour déclarer la cible d'un jet de gazeuse). */
function firstInCone(core: ItemsCore, p: Person, s: SpraySpec): Person | null {
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const cosA = Math.cos(s.halfAngle);
  const people = core.people;
  const n = core.ctx.people.queryRadius(p.x + ux * s.range * 0.5, p.z + uz * s.range * 0.5, s.range * 0.5 + 0.6, people);
  let best: Person | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - q.radius > s.range || d < 1e-6) continue;
    const along = dx * ux + dz * uz;
    if (along / d < cosA && Math.abs(dx * uz - dz * ux) > q.radius + 0.15) continue;
    if (along <= 0) continue;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Surface à taguer devant la personne : vitrine d'abord, sinon objet du décor. */
function paintTarget(core: ItemsCore, p: Person, range: number): Shop | Prop | null {
  const ctx = core.ctx;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  if (ctx.props.shops.length > 0) {
    const shops = core.shops;
    const n = ctx.props.shopsNear(p.x, p.z, range, shops);
    for (let i = 0; i < n; i++) {
      const s = shops[i]!;
      const tx = Math.cos(s.heading) * s.width * 0.5;
      const tz = -Math.sin(s.heading) * s.width * 0.5;
      const t = segmentParam(p.x, p.z, s.x - tx, s.z - tz, s.x + tx, s.z + tz);
      const dx = s.x - tx + 2 * tx * t - p.x;
      const dz = s.z - tz + 2 * tz * t - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.2 || (dx * ux + dz * uz) / d >= 0.34) return s;
    }
  }
  if (ctx.props.list.length > 0) {
    const props = core.props;
    const n = ctx.props.queryRadius(p.x + ux * range * 0.6, p.z + uz * range * 0.6, range * 0.6, props);
    let best: Prop | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const q = props[i]!;
      const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }
  return null;
}

/** Déclenche un jet (ou, pour la bombe de peinture, commence une inscription). */
export function useSpray(
  core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec, opts: UseOptions | undefined,
): UseResult {
  const s = spec.spray;
  if (!s) return useFail('forbidden');
  let targetId = opts && opts.targetId ? opts.targetId : 0;
  let targetIsShop = false;
  if (spec.use === 'spray_paint') {
    const surface = paintTarget(core, p, s.range);
    if (!surface) return useFail('blocked');
    targetId = surface.id;
    targetIsShop = 'window' in surface;
  }
  const id = stack.id;
  // la première bouffée part au pas de simulation suivant
  core.sprays.push({ personId: p.id, item: id, left: s.burst, acc: EMIT_PERIOD, total: s.burst, targetId, targetIsShop, reported: false });
  consume(core, p, stack);
  if (spec.consume === 'charge' && def.maxCount > 0) stack.state = stack.count / def.maxCount;
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, s.burst);
  const y = p.y + p.look.height * 0.8;
  switch (spec.use) {
    case 'spray_gas': {
      core.sfx('spray', p.x, y, p.z);
      const target = targetId !== 0 ? core.ctx.people.get(targetId) ?? null : firstInCone(core, p, s);
      core.used(p, id, target ? target.id : 0);
      core.reportForce(p, 'gazeuse', target, p.x + Math.sin(p.aimYaw) * s.range * 0.6, p.z + Math.cos(p.aimYaw) * s.range * 0.6);
      if (!isPolice(p) && target) core.recordOffense(p, isPolice(target) ? 'violence_agent' : 'violence', target.x, target.z);
      break;
    }
    case 'spray_powder':
      core.sfx('extincteur', p.x, y, p.z);
      core.used(p, id, targetId);
      break;
    case 'spray_water':
      core.sfx('canon_eau', p.x, y, p.z, 0.6, 1.2);
      core.used(p, id, targetId);
      break;
    default:
      core.sfx('spray', p.x, y, p.z, 0.6, 1.3);
      core.used(p, id, targetId);
      break;
  }
  return USE_OK;
}

/** Fait avancer les jets en cours. */
export function updateSprays(core: ItemsCore, projectiles: ProjectileSystem, dt: number): void {
  const list = core.sprays;
  const ctx = core.ctx;
  for (let i = list.length - 1; i >= 0; i--) {
    const sp = list[i]!;
    const p = ctx.people.get(sp.personId);
    const spec = itemSpec(sp.item);
    // jet interrompu : l'objet a quitté la main, la personne est à terre, étourdie ou maîtrisée
    if (!p || !spec || !spec.spray || activeId(p) !== sp.item || p.custody !== 'free' || p.stun > STUN_BLOCK
      || ctx.health.isIncapacitated(p)) {
      list[i] = list[list.length - 1]!;
      list.pop();
      continue;
    }
    sp.left -= dt;
    sp.acc += dt;
    // cinq bouffées par seconde, la première dès le déclenchement ; aucune une fois le jet terminé
    if (sp.acc >= EMIT_PERIOD - 1e-9 && sp.left > 1e-6) {
      sp.acc -= EMIT_PERIOD;
      switch (spec.use) {
        case 'spray_gas': tickGas(core, p, spec.spray, EMIT_PERIOD); break;
        case 'spray_powder': tickPowder(core, p, spec.spray, EMIT_PERIOD); break;
        case 'spray_water': tickWater(core, projectiles, p, spec.spray, sp, EMIT_PERIOD); break;
        default: tickPaint(core, p, sp); break;
      }
    }
    if (sp.left <= 1e-6) {
      if (spec.use === 'spray_paint') finishPaint(core, p, spec.spray, sp);
      list[i] = list[list.length - 1]!;
      list.pop();
    }
  }
}

function tickGas(core: ItemsCore, p: Person, s: SpraySpec, tick: number): void {
  const ctx = core.ctx;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const cosA = Math.cos(s.halfAngle);
  const y = p.y + p.look.height * 0.8;
  const police = isPolice(p);
  const people = core.people;
  const n = ctx.people.queryRadius(p.x + ux * s.range * 0.5, p.z + uz * s.range * 0.5, s.range * 0.5 + 0.6, people);
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - q.radius > s.range || d < 1e-6) continue;
    const along = dx * ux + dz * uz;
    if (along <= 0) continue;
    if (along / d < cosA && Math.abs(dx * uz - dz * ux) > q.radius + 0.15) continue;
    if (!ctx.world.lineOfSight(p.x, p.z, q.x, q.z)) continue;
    const fx = -dx / d;
    const fz = -dz / d;
    let k = 1 - 0.5 * (d / s.range);
    const cover = coverOf(q, fx, fz, 0.8, 'spray');
    if (cover === COVER_SHIELD) k *= 0.2;
    else if (cover !== COVER_NONE) k *= 0.35;
    // de dos, le jet n'atteint pas le visage
    if (Math.sin(q.heading) * fx + Math.cos(q.heading) * fz < 0) k *= 0.5;
    const prot = q.gasProtection > 1 ? 1 : q.gasProtection < 0 ? 0 : q.gasProtection;
    const g = q.gas + GAS_EXPOSURE_RATE * tick * k * (1 - prot);
    q.gas = g > 1 ? 1 : g;
    const info: DamageInfo = {
      amount: 0.6 * tick * k * (1 - prot) * core.tuning.damageScale, kind: 'gas', sourceId: p.id, item: 'gazeuse',
      x: q.x, z: q.z, dirX: -fx, dirZ: -fz, zone: 0.9, stun: 0, knockback: 0,
    };
    if (police) info.means = 'gazeuse';
    ctx.health.hurt(q, info);
  }
  ctx.hazards.emitGas(p.x + ux * s.range * 0.6, p.z + uz * s.range * 0.6, GAS_CLOUD_AMOUNT, GAS_CLOUD_RADIUS);
  core.fxDir('gaz', p.x + ux * 0.4, y, p.z + uz * 0.4, ux, Math.sin(p.aimPitch), uz, s.range, undefined, 0.5);
}

function tickPowder(core: ItemsCore, p: Person, s: SpraySpec, tick: number): void {
  const ctx = core.ctx;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const cosA = Math.cos(s.halfAngle);
  // deux dépôts le long du cône : le pied du feu, puis le fond
  ctx.hazards.douse(p.x + ux * s.range * 0.4, p.z + uz * s.range * 0.4, 0.9, POWDER_RATE * tick * 0.5);
  ctx.hazards.douse(p.x + ux * s.range * 0.8, p.z + uz * s.range * 0.8, 1.2, POWDER_RATE * tick * 0.5);
  const people = core.people;
  const n = ctx.people.queryRadius(p.x + ux * s.range * 0.5, p.z + uz * s.range * 0.5, s.range * 0.5 + 0.6, people);
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || !(q.burning > 0)) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - q.radius > s.range) continue;
    if (d > 0.4 && (dx * ux + dz * uz) / d < cosA && Math.abs(dx * uz - dz * ux) > q.radius + 0.3) continue;
    quench(core, q, POWDER_QUENCH_RATE * tick, p);
  }
  core.fxDir('poudre', p.x + ux * 0.5, p.y + 1.1, p.z + uz * 0.5, ux, Math.sin(p.aimPitch), uz, s.range, 0xf2f2ee, 0.6);
}

/** Réduit le feu sur une personne ; signale l'extinction complète. */
function quench(core: ItemsCore, q: Person, amount: number, by: Person): void {
  const before = q.burning;
  const after = before - amount;
  q.burning = after > 0 ? after : 0;
  if (before > 0 && q.burning === 0) {
    core.ctx.events.emit('fire:out', { x: q.x, z: q.z, targetKind: 'person', targetId: q.id, byId: by.id });
  }
}

function tickWater(core: ItemsCore, projectiles: ProjectileSystem, p: Person, s: SpraySpec, sp: Spray, tick: number): void {
  const ctx = core.ctx;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  // portée réelle : premier mur rencontré
  let reach = s.range;
  const hit = core.hit;
  if (ctx.world.raycast(p.x, p.z, p.x + ux * s.range, p.z + uz * s.range, hit) && hit.height > 1) reach = s.range * hit.t;
  // personnes prises dans le jet : la première l'arrête
  const people = core.people;
  const n = ctx.people.queryRadius(p.x + ux * reach * 0.5, p.z + uz * reach * 0.5, reach * 0.5 + 0.6, people);
  let first: Person | null = null;
  let firstAlong = reach;
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const along = dx * ux + dz * uz;
    if (along < 0.6 || along >= firstAlong) continue;
    if (Math.abs(dx * uz - dz * ux) > q.radius + WATER_WIDTH) continue;
    first = q;
    firstAlong = along;
  }
  if (first) {
    reach = firstAlong;
    const k = 1 - 0.6 * (firstAlong / s.range);
    const w = first.wet + 2 * tick;
    first.wet = w > 1 ? 1 : w;
    if (first.burning > 0) quench(core, first, WATER_QUENCH_RATE * tick, p);
    const info: DamageInfo = {
      amount: 0.5 * tick * k * core.tuning.damageScale, kind: 'water', sourceId: p.id, item: 'lance_incendie',
      x: first.x, z: first.z, dirX: ux, dirZ: uz, zone: 0.6, stun: 0, knockback: 1.5 * k,
    };
    if (isPolice(p)) info.means = 'canon_eau';
    ctx.health.hurt(first, info);
    if (!sp.reported) {
      sp.reported = true;
      core.reportForce(p, 'canon_eau', first, first.x, first.z);
    }
  }
  const ex = p.x + ux * reach;
  const ez = p.z + uz * reach;
  ctx.hazards.douse(ex, ez, 1.5, WATER_RATE * tick);
  // palets et fumigènes noyés au point d'impact du jet
  const list = projectiles.list;
  for (let i = 0; i < list.length; i++) {
    const q = list[i]!;
    if (!q.emitting) continue;
    const dx = q.x - ex;
    const dz = q.z - ez;
    if (dx * dx + dz * dz > 1.2 * 1.2 || q.y - ctx.world.heightAt(q.x, q.z) > 1) continue;
    q.emitting = false;
    q.pickable = false;
    projectiles.stateOf(q).spent = true;
    q.fuse = PALET_LINGER_SECONDS;
  }
  core.fxDir('jet_eau', p.x + ux * 0.6, p.y + 1.1, p.z + uz * 0.6, ux, Math.sin(p.aimPitch), uz, reach, undefined, 0.3);
  core.fx('eclaboussure', ex, ctx.world.heightAt(ex, ez) + 0.2, ez, 1);
}

/** Cible de l'inscription en cours, si elle existe encore. */
function paintSurface(core: ItemsCore, sp: Spray): Shop | Prop | undefined {
  return sp.targetIsShop ? core.ctx.props.shop(sp.targetId) : core.ctx.props.get(sp.targetId);
}

function tickPaint(core: ItemsCore, p: Person, sp: Spray): void {
  const surface = paintSurface(core, sp);
  if (!surface) return;
  // une bouffée de peinture par seconde pendant l'inscription
  if (Math.floor(sp.left) !== Math.floor(sp.left + EMIT_PERIOD)) {
    core.fx('peinture', surface.x, surface.y + 1.3, surface.z, 0.3, isPolice(p) ? 0x2a61b8 : 0x101010);
  }
}

function finishPaint(core: ItemsCore, p: Person, s: SpraySpec, sp: Spray): void {
  const surface = paintSurface(core, sp);
  if (!surface) return;
  // la personne doit être restée devant la surface
  const reach = s.range + ('window' in surface ? surface.width * 0.5 : Math.max(surface.halfX, surface.halfZ)) + 0.5;
  const dx = surface.x - p.x;
  const dz = surface.z - p.z;
  if (dx * dx + dz * dz > reach * reach) return;
  core.ctx.props.tag(surface, p.id);
  core.fx('tag', surface.x, surface.y + 1.3, surface.z, 1, 0x101010);
  core.recordOffense(p, 'tag', surface.x, surface.z);
}
