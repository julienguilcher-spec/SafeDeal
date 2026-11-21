/* =====================================================================================
 * LANCERS ET TIRS — grenades, pavés, bouteilles, engins incendiaires, fumigènes (à la main) ;
 * lanceur de 56 mm (en cloche), LBD et arme de service (tir tendu), mortier d'artifice, fusée rouge.
 *
 * Le projectile part immédiatement (UseResult.projectileId) dans la direction de visée de la
 * personne, relevée du « loft » de l'objet, avec une dispersion qui dépend de son état.
 * ===================================================================================== */

import type { ItemDef, ItemStack, Person, UseOptions, UseResult } from '@/core/contracts';
import type { ItemSpec } from './api';
import { computeLaunch, launchPitch, launchSpeed, makeLaunch, makeShot, predictFlight, shotFor, spreadFactor } from './aim';
import { consume } from './inventory';
import { FIREWORK_FUSE_JITTER, HAND_FUSE_JITTER, SMOKE_COLOR_SIGNAL } from './projectile-defs';
import type { ProjectileSystem } from './projectiles';
import { isPolice, useFail } from './shared';
import type { ItemsCore } from './shared';

const shot = makeShot();
const start = makeLaunch();
const landing = { x: 0, y: 0, z: 0 };

/** Personne la plus proche le long de la ligne de visée (pour déclarer la cible d'un tir tendu). */
function aimedPerson(core: ItemsCore, p: Person, yaw: number, range: number): Person | null {
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  const people = core.people;
  const n = core.ctx.people.queryRadius(p.x + ux * range * 0.5, p.z + uz * range * 0.5, range * 0.5 + 1, people);
  let best: Person | null = null;
  let bestAlong = range;
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0) continue;
    const rx = q.x - p.x;
    const rz = q.z - p.z;
    const along = rx * ux + rz * uz;
    if (along < 0.5 || along >= bestAlong) continue;
    const perp = Math.abs(rx * uz - rz * ux);
    if (perp > q.radius + 0.35) continue;
    best = q;
    bestAlong = along;
  }
  return best;
}

/** Lance ou tire le projectile de l'objet en main. */
export function useLaunch(
  core: ItemsCore, projectiles: ProjectileSystem, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec,
  opts: UseOptions | undefined,
): UseResult {
  if (!shotFor(p, stack, shot)) return useFail('forbidden');
  const ctx = core.ctx;
  const ls = shot.launch;

  // munition tirée par le lanceur de 56 mm : le lanceur doit être rechargé
  let launcherStack: ItemStack | null = null;
  if (shot.launcher && stack.id !== 'lanceur_cougar') {
    const inv = p.inventory;
    for (let i = 0; i < inv.length; i++) {
      if (inv[i]!.id === 'lanceur_cougar') {
        launcherStack = inv[i]!;
        break;
      }
    }
    if (launcherStack && launcherStack.cooldown > 0) {
      core.track(launcherStack);
      return useFail('cooldown');
    }
  }

  const power = opts && opts.power !== undefined ? opts.power : 1;
  let speed = launchSpeed(core, p, shot, power);
  let pitch = launchPitch(ls, p.aimPitch);
  let yaw = p.aimYaw;
  const f = spreadFactor(core, p, ls);
  if (f > 0) {
    yaw += core.gauss(ls.spread * f);
    pitch += core.gauss(ls.spread * f);
    const k = 1 + core.gauss(ls.speedSpread * f);
    speed *= k < 0.5 ? 0.5 : k;
  }
  computeLaunch(p, ls, yaw, pitch, speed, start);
  // bouche de l'arme engagée dans un mur : le projectile part du corps et heurte le mur aussitôt
  const hit = core.hit;
  if (ctx.world.raycast(p.x, p.z, start.x, start.z, hit) && hit.height > start.y - p.y) {
    start.x = p.x;
    start.z = p.z;
  }

  const proj = projectiles.spawn(shot.kind, p.id, start.x, start.y, start.z, start.vx, start.vy, start.vz);
  const st = projectiles.stateOf(proj);
  switch (shot.kind) {
    case 'grenade_lacrymo_main':
      proj.fuse += core.rng.range(-HAND_FUSE_JITTER, HAND_FUSE_JITTER);
      break;
    case 'mortier':
      proj.fuse += core.rng.range(-FIREWORK_FUSE_JITTER, FIREWORK_FUSE_JITTER);
      break;
    case 'gm2l':
      projectiles.armGm2l(proj, shot.launcher);
      break;
    case 'fumigene':
      // noir : signal de ralliement du bloc ; rouge : fumigène de cortège
      if (p.profile === 'radical' || p.look.outfit === 'black_bloc') st.color = SMOKE_COLOR_SIGNAL;
      break;
    default:
      break;
  }

  // ── consommation, délais, animation ──
  const targetId = opts && opts.targetId ? opts.targetId : 0;
  const itemId = stack.id;
  consume(core, p, stack);
  core.setCooldown(stack, def.cooldown);
  if (launcherStack) core.setCooldown(launcherStack, def.cooldown);
  if (ls.byHand) core.playAnim(p, 'throw', spec.useTime, 0.3);
  else core.playAnim(p, def.useAnim, spec.useTime);
  if (ls.stamina > 0) p.stamina = p.stamina > ls.stamina ? p.stamina - ls.stamina : 0;

  // ── effets ──
  core.sfx(shot.launcher ? 'lanceur_tir' : ls.sound, start.x, start.y, start.z);
  if (itemId === 'pistolet') core.fx('flash', start.x, start.y, start.z, 0.3, 0xffd9a0, 0.06);
  else if (shot.launcher) core.fx('fumee', start.x, start.y, start.z, 0.5, 0xb8b8b8, 0.8);
  else if (itemId === 'mortier') core.fx('etincelles', start.x, start.y, start.z, 0.6, st.color, 0.4);
  if (ls.aim === 'direct' && start.speed > 1) {
    // trait lumineux du tir tendu (balle de défense, cartouche, projectile d'artifice)
    core.fxDir(
      'traceur', start.x, start.y, start.z, start.vx / start.speed, start.vy / start.speed, start.vz / start.speed,
      Math.min(def.rangeMax, 40), itemId === 'mortier' ? st.color : undefined, 0.15,
    );
  }
  core.used(p, itemId, targetId);

  // ── droit ──
  if (isPolice(p)) {
    if (def.forceMeans) {
      let target = targetId !== 0 ? ctx.people.get(targetId) ?? null : null;
      let x = p.x;
      let z = p.z;
      if (ls.aim === 'direct') {
        if (!target) target = aimedPerson(core, p, p.aimYaw, def.rangeMax * 1.5);
        if (target) {
          x = target.x;
          z = target.z;
        } else {
          x = p.x + Math.sin(p.aimYaw) * def.rangeMax * 0.6;
          z = p.z + Math.cos(p.aimYaw) * def.rangeMax * 0.6;
        }
      } else {
        // point de chute prévu : c'est là que la force est employée
        predictFlight(core, start, shot.pspec, p.y, landing);
        x = landing.x;
        z = landing.z;
      }
      core.reportForce(p, def.forceMeans, target, x, z);
    }
  } else if (itemId === 'pistolet' || itemId === 'lbd40' || itemId === 'lanceur_cougar') {
    core.recordOffense(p, 'port_arme', p.x, p.z);
  } else if (itemId !== 'fumigene' && itemId !== 'fusee_sommation') {
    core.recordOffense(p, 'jet_projectile', p.x, p.z);
  }

  return { ok: true, projectileId: proj.id };
}

/** Le lanceur de 56 mm tire-t-il la munition de cette pile ? (pour canUse : délai du lanceur) */
export function launcherBusy(p: Person, stack: ItemStack): boolean {
  if (stack.id !== 'grenade_gm2l') return false;
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i]!;
    if (s.id === 'lanceur_cougar') return s.cooldown > 0;
  }
  return false;
}
