/* =====================================================================================
 * RENVOI ET RAMASSAGE DES PROJECTILES — interactions « renvoyer » (palet, grenade ou fumigène
 * au sol, relancé dans la direction de visée) et « ramasser » (pavé retombé, repris en main).
 *
 * Renvoi : fenêtre = tant que le projectile est ramassable (un palet fume 30 s) ; un PNJ réussit
 * 6 fois sur 10 (docs/research/03 §3.3), le joueur toujours ; celui qui saisit un palet fumant
 * respire son gaz. Le nuage suit le palet : il continue d'émettre en vol.
 * ===================================================================================== */

import type {
  EntityId, InteractionHandler, InteractionOption, Person, Projectile,
} from '@/core/contracts';
import { clamp } from '@/core/math';
import { throwStrength } from './aim';
import { give } from './inventory';
import { RETURN_SPEED_HAND } from './projectile-defs';
import type { ProjectileSystem } from './projectiles';
import type { ItemsCore } from './shared';

/** Distance à laquelle on peut saisir un projectile au sol (m). */
export const PICK_REACH = 1.6;
/** Durée du geste : se baisser, saisir, relancer (s). */
export const RETURN_SECONDS = 0.7;
export const PICKUP_SECONDS = 0.8;

function canAct(core: ItemsCore, actor: Person): boolean {
  return actor.custody === 'free' && actor.vehicleId === 0 && !core.ctx.health.isIncapacitated(actor);
}

/**
 * Renvoie le projectile dans la direction de visée de `actor`. Retourne true si le renvoi réussit
 * (événement projectile:returned) ; false s'il est impossible ou raté (le projectile est alors
 * seulement repoussé de quelques mètres).
 */
export function returnByHand(core: ItemsCore, projectiles: ProjectileSystem, actor: Person, proj: Projectile, power = 1): boolean {
  if (!proj.pickable || !canAct(core, actor)) return false;
  const dx = proj.x - actor.x;
  const dz = proj.z - actor.z;
  if (dx * dx + dz * dz > (PICK_REACH + 0.6) * (PICK_REACH + 0.6)) return false;
  const yaw = actor.aimYaw + core.gauss(0.08 * core.tuning.dispersion);
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  // la main prend le gaz d'un palet qui fume
  if (proj.emitting && proj.kind !== 'fumigene') {
    const prot = clamp(actor.gasProtection, 0, 1);
    actor.gas = Math.min(1, actor.gas + 0.15 * (1 - prot));
  }
  const skilled = actor.isPlayer || core.rng.next() < core.tuning.returnSuccess;
  if (!skilled) {
    // raté : le palet échappe, il roule à quelques mètres
    projectiles.relaunch(proj, actor, proj.x, proj.y + 0.2, proj.z, ux * 3.5 + actor.vx, 1.5, uz * 3.5 + actor.vz);
    return false;
  }
  const pitch = clamp(actor.aimPitch + 0.35, 0.26, 0.87);
  const speed = RETURN_SPEED_HAND * throwStrength(actor) * (0.5 + 0.5 * clamp(power, 0, 1));
  const cp = Math.cos(pitch);
  projectiles.relaunch(
    proj, actor, actor.x + ux * 0.35, actor.y + actor.look.height * 0.95, actor.z + uz * 0.35,
    ux * cp * speed + actor.vx, Math.sin(pitch) * speed, uz * cp * speed + actor.vz,
  );
  core.ctx.events.emit('projectile:returned', { id: proj.id, byId: actor.id });
  core.playAnim(actor, 'throw', 0.5, 0.3);
  core.sfx('grenade_lancer', actor.x, actor.y + 1.6, actor.z, 0.8);
  core.recordOffense(actor, 'jet_projectile', actor.x, actor.z);
  return true;
}

function nearest(projectiles: ProjectileSystem, actor: Person, targetId: EntityId | undefined, wantItem: boolean): Projectile | null {
  if (targetId !== undefined && targetId !== 0) {
    const p = projectiles.get(targetId);
    if (!p || !p.pickable) return null;
    const dx = p.x - actor.x;
    const dz = p.z - actor.z;
    if (dx * dx + dz * dz > PICK_REACH * PICK_REACH) return null;
    return (p.kind === 'pave') === wantItem ? p : null;
  }
  const list = projectiles.list;
  let best: Projectile | null = null;
  let bestD = PICK_REACH * PICK_REACH;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (!p.pickable || (p.kind === 'pave') !== wantItem) continue;
    const dx = p.x - actor.x;
    const dz = p.z - actor.z;
    const d = dx * dx + dz * dz;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Enregistre les interactions « renvoyer » et « ramasser » auprès de ctx.interactions. */
export function registerInteractions(core: ItemsCore, projectiles: ProjectileSystem): void {
  const ctx = core.ctx;

  const returnOpt: InteractionOption = {
    verb: 'renvoyer', targetKind: 'projectile', targetId: 0, label: 'Renvoyer', priority: 70, duration: RETURN_SECONDS, x: 0, z: 0,
  };
  const returnHandler: InteractionHandler = {
    verb: 'renvoyer',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!canAct(core, actor)) return null;
      const p = nearest(projectiles, actor, targetId, false);
      if (!p) return null;
      returnOpt.targetId = p.id;
      returnOpt.label = p.kind === 'fumigene' ? 'Renvoyer le fumigène' : p.kind === 'palet_lacrymo' ? 'Renvoyer le palet' : 'Renvoyer la grenade';
      returnOpt.x = p.x;
      returnOpt.z = p.z;
      return returnOpt;
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const p = projectiles.get(opt.targetId);
      if (!p || !p.pickable || !canAct(core, actor)) return false;
      core.playAnim(actor, 'pickup', RETURN_SECONDS);
      return true;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const p = projectiles.get(opt.targetId);
      return !!p && p.pickable && canAct(core, actor);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const p = projectiles.get(opt.targetId);
      if (p) returnByHand(core, projectiles, actor, p, 1);
    },
  };

  const pickOpt: InteractionOption = {
    verb: 'ramasser', targetKind: 'projectile', targetId: 0, label: 'Ramasser le pavé', priority: 40, duration: PICKUP_SECONDS, x: 0, z: 0,
  };
  const pickHandler: InteractionHandler = {
    verb: 'ramasser',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!canAct(core, actor)) return null;
      const p = nearest(projectiles, actor, targetId, true);
      if (!p) return null;
      pickOpt.targetId = p.id;
      pickOpt.x = p.x;
      pickOpt.z = p.z;
      return pickOpt;
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const p = projectiles.get(opt.targetId);
      if (!p || !p.pickable || !canAct(core, actor)) return false;
      core.playAnim(actor, 'pickup', PICKUP_SECONDS);
      return true;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const p = projectiles.get(opt.targetId);
      return !!p && p.pickable && canAct(core, actor);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const p = projectiles.get(opt.targetId);
      if (!p || !p.pickable) return;
      projectiles.remove(p.id);
      give(actor, 'pave', 1);
    },
  };

  ctx.interactions.register(returnHandler);
  ctx.interactions.register(pickHandler);
}
