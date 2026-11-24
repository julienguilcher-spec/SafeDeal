/* =====================================================================================
 * MÊLÉE — bâton, tonfa, marteau, barre, coup de bouclier ; raquette (renvoi d'un projectile).
 *
 * Un coup se déroule en deux temps : use() arme le geste (animation « strike » : impact vers 0,28 s),
 * puis l'impact est résolu à cet instant dans l'arc de frappe devant la personne. Cibles, par ordre :
 * une personne (jamais un collègue de la même faction, sauf cible explicite), une vitrine, un objet
 * du décor. Un bouclier levé de face pare le coup ; un bâton en parade l'atténue.
 * ===================================================================================== */

import type { DamageInfo, ItemDef, ItemStack, Person, Projectile, Prop, Shop, UseOptions, UseResult } from '@/core/contracts';
import { clamp, segmentParam } from '@/core/math';
import type { ItemSpec, MeleeSpec } from './api';
import { throwStrength } from './aim';
import { itemDef } from './defs';
import { RETURN_SPEED_RACKET } from './projectile-defs';
import type { ProjectileSystem } from './projectiles';
import {
  COVER_NONE, COVER_PARRY, COVER_SHIELD, STUN_BLOCK, USE_OK, activeStack, coverOf, isPolice, useFail, wearCover,
} from './shared';
import type { ItemsCore, Strike } from './shared';
import { itemSpec } from './specs';

/** Arme un coup : l'impact est résolu `delay` secondes plus tard. */
export function useMelee(
  core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec, opts: UseOptions | undefined,
): UseResult {
  const m = spec.melee;
  if (!m) return useFail('forbidden');
  const targetId = opts && opts.targetId ? opts.targetId : 0;
  core.strikes.push({ personId: p.id, item: stack.id, left: m.delay, targetId });
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  p.stamina = p.stamina > m.stamina ? p.stamina - m.stamina : 0;
  core.used(p, stack.id, targetId);
  return USE_OK;
}

/** Fait avancer les coups armés et résout ceux qui arrivent à l'impact. */
export function updateStrikes(core: ItemsCore, dt: number): void {
  const list = core.strikes;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.left -= dt;
    if (s.left > 0) continue;
    list[i] = list[list.length - 1]!;
    list.pop();
    resolveStrike(core, s);
  }
}

/** Personne atteinte par le coup : la cible explicite si elle est à portée, sinon l'adversaire le plus proche dans l'arc. */
function pickPerson(core: ItemsCore, p: Person, m: MeleeSpec, targetId: number): Person | null {
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const cosArc = Math.cos(m.arc);
  const people = core.people;
  const n = core.ctx.people.queryRadius(p.x, p.z, m.reach + 0.8, people);
  let best: Person | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0) continue;
    const explicit = q.id === targetId;
    if (!explicit && q.faction === p.faction) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - q.radius > m.reach) continue;
    if (d > 0.3 && (dx * ux + dz * uz) / d < cosArc) continue;
    if (explicit) return q;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Vitrine à portée devant la personne. */
function pickShop(core: ItemsCore, p: Person, reach: number): Shop | null {
  const ctx = core.ctx;
  if (ctx.props.shops.length === 0) return null;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const shops = core.shops;
  const n = ctx.props.shopsNear(p.x, p.z, reach + 0.3, shops);
  let best: Shop | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const s = shops[i]!;
    const tx = Math.cos(s.heading) * s.width * 0.5;
    const tz = -Math.sin(s.heading) * s.width * 0.5;
    const t = segmentParam(p.x, p.z, s.x - tx, s.z - tz, s.x + tx, s.z + tz);
    const dx = s.x - tx + 2 * tx * t - p.x;
    const dz = s.z - tz + 2 * tz * t - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    // la vitrine doit être devant (± 70°) pour être frappée
    if (d > 0.2 && (dx * ux + dz * uz) / d < 0.34) continue;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Objet du décor à portée devant la personne. */
function pickProp(core: ItemsCore, p: Person, reach: number): Prop | null {
  const ctx = core.ctx;
  if (ctx.props.list.length === 0) return null;
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const props = core.props;
  const n = ctx.props.queryRadius(p.x + ux * reach * 0.6, p.z + uz * reach * 0.6, reach * 0.55, props);
  let best: Prop | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = props[i]!;
    if (q.carriedBy !== 0) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function resolveStrike(core: ItemsCore, s: Strike): void {
  const ctx = core.ctx;
  const p = ctx.people.get(s.personId);
  if (!p) return;
  // geste interrompu : mis à terre, étourdi, maîtrisé, ou l'objet a quitté la main
  if (p.custody !== 'free' || p.stun > STUN_BLOCK || ctx.health.isIncapacitated(p)) return;
  const stack = activeStack(p);
  if (!stack || stack.id !== s.item) return;
  const def = itemDef(stack.id);
  const spec = itemSpec(stack.id);
  if (!def || !spec || !spec.melee) return;
  const m = spec.melee;
  const shieldBash = spec.use === 'shield';
  const scale = core.tuning.damageScale;

  const target = pickPerson(core, p, m, s.targetId);
  if (target) {
    let dx = target.x - p.x;
    let dz = target.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-6) {
      dx /= d;
      dz /= d;
    } else {
      dx = Math.sin(p.aimYaw);
      dz = Math.cos(p.aimYaw);
    }
    const lying = target.posture === 'down' || target.posture === 'prone';
    const zone = lying ? 0.5 : shieldBash ? 0.6 : clamp(0.62 + p.aimPitch * 0.9, 0.15, 0.95);
    const cover = coverOf(target, -dx, -dz, zone, 'melee');
    const hx = target.x - dx * target.radius;
    const hz = target.z - dz * target.radius;
    const hy = target.y + zone * target.look.height;
    if (def.forceMeans) core.reportForce(p, def.forceMeans, target, target.x, target.z);
    if (!isPolice(p)) core.recordOffense(p, isPolice(target) ? 'violence_agent' : 'violence', target.x, target.z);
    if (cover === COVER_SHIELD) {
      // paré par le bouclier
      wearCover(target, cover, 80);
      core.sfx('impact_bouclier', hx, hy, hz, 0.9);
      core.fx('impact', hx, hy, hz, 0.3);
      return;
    }
    const factor = cover === COVER_PARRY ? 0.4 : 1;
    const info: DamageInfo = {
      amount: m.damage * factor * scale * (0.8 + 0.2 * throwStrength(p)),
      kind: m.kind,
      sourceId: p.id,
      item: stack.id,
      x: hx,
      z: hz,
      dirX: dx,
      dirZ: dz,
      zone,
      stun: m.stun * factor,
      knockback: m.knockback,
    };
    if (def.forceMeans && isPolice(p)) info.means = def.forceMeans;
    ctx.health.hurt(target, info);
    core.sfx(shieldBash || cover !== COVER_NONE ? 'impact_bouclier' : 'coup_baton', hx, hy, hz, 0.9);
    core.fx('impact', hx, hy, hz, 0.35);
    return;
  }

  const shop = pickShop(core, p, m.reach);
  if (shop) {
    const before = shop.window;
    ctx.props.damageShop(shop, m.shopDamage * scale, m.kind, p.id);
    const y = shop.y + 1.2;
    if (shop.window !== before) {
      if (shop.window === 'broken') core.fx('eclats_verre', shop.x, y, shop.z, Math.min(3, shop.width * 0.5));
      core.recordOffense(p, 'degradation', shop.x, shop.z);
    } else {
      core.sfx('impact_sol', shop.x, y, shop.z, 0.6, 1.4);
    }
    return;
  }

  const prop = pickProp(core, p, m.reach);
  if (prop) {
    ctx.props.damage(prop, m.propDamage * scale, m.kind, p.id);
    if (shieldBash && prop.movable) ctx.props.push(prop, Math.sin(p.aimYaw), Math.cos(p.aimYaw), 2.5, p.id);
    core.fx('impact', prop.x, prop.y + prop.height * 0.6, prop.z, 0.3);
    if (!shieldBash) core.recordOffense(p, 'degradation', prop.x, prop.z);
  }
}

// ───────────────────────────── raquette ─────────────────────────────

/** Projectile qu'un revers peut renvoyer : au sol à portée de bras, ou en vol à hauteur d'homme. */
function racketTarget(projectiles: ProjectileSystem, p: Person, reach: number): Projectile | null {
  const ground = projectiles.nearestPickable(p.x, p.z, reach);
  if (ground) return ground;
  const list = projectiles.list;
  let best: Projectile | null = null;
  let bestD = reach * reach;
  for (let i = 0; i < list.length; i++) {
    const q = list[i]!;
    if (q.resting || q.ownerId === p.id) continue;
    if (!projectiles.stateOf(q).spec.pickable) continue;
    const dy = q.y - p.y;
    if (dy < 0 || dy > 2.6) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Coup de raquette : renvoie un palet ou une grenade dans la direction de visée. */
export function useRacket(
  core: ItemsCore, projectiles: ProjectileSystem, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec,
): UseResult {
  const proj = racketTarget(projectiles, p, def.rangeMax);
  if (!proj) return useFail('blocked');
  const yaw = p.aimYaw + core.gauss(0.06 * core.tuning.dispersion);
  const pitch = clamp(p.aimPitch + 0.44, 0.17, 1.05);
  const speed = RETURN_SPEED_RACKET * (0.85 + 0.15 * throwStrength(p));
  const cp = Math.cos(pitch);
  const y = proj.y > p.y + 0.9 ? proj.y : p.y + 0.9;
  projectiles.relaunch(
    proj, p, p.x + Math.sin(yaw) * 0.5, y, p.z + Math.cos(yaw) * 0.5,
    Math.sin(yaw) * cp * speed, Math.sin(pitch) * speed, Math.cos(yaw) * cp * speed,
  );
  core.ctx.events.emit('projectile:returned', { id: proj.id, byId: p.id });
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  core.sfx('coup_baton', proj.x, proj.y, proj.z, 0.7, 1.6);
  core.used(p, stack.id, 0);
  core.recordOffense(p, 'jet_projectile', p.x, p.z);
  return { ok: true, projectileId: proj.id };
}
