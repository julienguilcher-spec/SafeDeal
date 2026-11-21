/* =====================================================================================
 * AUTRES USAGES — mégaphone, radio, objets d'interaction (menottes, soins, brancard, micro),
 * prise de vue, lampe, masque à gaz, pancartes et drapeaux, parapluie, télécommande de drone, butin.
 * ===================================================================================== */

import type { EntityId, InteractVerb, ItemDef, ItemStack, Person, UseOptions, UseResult } from '@/core/contracts';
import { isAuthority } from '@/core/null-services';
import type { ItemSpec } from './api';
import { DRONE_TOGGLE_EVENT, ITEM_TOGGLE_EVENT } from './api';
import { consume } from './inventory';
import { MASK_PROTECTION, STUN_BLOCK, USE_OK, useFail } from './shared';
import type { ItemsCore } from './shared';

/** Durée de mise en place et de retrait du masque à gaz (s). */
export const MASK_DON_SECONDS = 8;
export const MASK_DOFF_SECONDS = 2;
/** Autonomie de la lampe (s). */
export const LAMP_SECONDS = 7200;

/** Slogans génériques scandés au mégaphone par un meneur (aucune personne ni organisation réelle). */
const SLOGANS: readonly string[] = Object.freeze([
  'Tous ensemble, tous ensemble, ouais !',
  'On lâche rien, on lâche rien !',
  'La rue est à nous !',
  'Et un, et deux, et trois, on ne se taira pas !',
  'Qu\'est-ce qu\'on veut ? Être entendus !',
  'On est là, on reste là !',
]);

/** Annonce au mégaphone selon celui qui parle (hors sommations et slogans). */
function publicAddress(p: Person): string {
  if (p.faction === 'police') {
    return isAuthority(p)
      ? 'Mesdames et messieurs, veuillez vous disperser dans le calme.'
      : 'Ici la police. Pour votre sécurité, dégagez la chaussée.';
  }
  if (p.faction === 'medic' || p.faction === 'rescue') return 'Secours ! Laissez le passage, s\'il vous plaît !';
  if (p.profile === 'service_ordre' || p.profile === 'militant') return 'Restez groupés, on avance dans le calme.';
  return 'Votre attention, s\'il vous plaît !';
}

/**
 * Mégaphone : l'autorité habilitée prononce l'annonce ou la sommation suivante (ctx.law.sommation) ;
 * un meneur de manifestation lance un slogan (crowd:chant) ; tout autre porteur fait un appel au
 * public (ctx.radio.say, canal « public »).
 */
export function useMegaphone(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec): UseResult {
  const ctx = core.ctx;
  let spoken = false;
  if (isAuthority(p)) {
    const before = ctx.law.roe.sommation;
    const beforeAt = ctx.law.roe.sommationAt;
    const stage = ctx.law.sommation(p);
    // la sommation a été prononcée si l'étape a avancé ou si la dernière a été réitérée
    spoken = stage !== before || ctx.law.roe.sommationAt !== beforeAt;
  }
  if (!spoken) {
    if (p.faction === 'protest' && p.profile === 'meneur') {
      ctx.events.emit('crowd:chant', { x: p.x, z: p.z, text: core.rng.pick(SLOGANS), intensity: 0.8 });
    } else {
      ctx.radio.say({ channel: 'public', from: p.name, text: publicAddress(p), priority: 1, personId: p.id });
    }
  }
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  core.sfx('megaphone', p.x, p.y + p.look.height * 0.9, p.z);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Radio : prise de parole (le contenu des messages relève du module radio). */
export function useRadio(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec): UseResult {
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  core.sfx('radio_bip', p.x, p.y + p.look.height * 0.85, p.z, 0.7);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** La personne `q` peut-elle recevoir ce geste ? */
function suits(verb: InteractVerb, q: Person): boolean {
  switch (verb) {
    case 'menotter': return q.custody !== 'cuffed' && q.custody !== 'in_vehicle' && q.custody !== 'handed_over';
    case 'soigner': return q.health < 100 || q.posture === 'down' || q.burning > 0;
    case 'rincer_yeux': return q.gas > 0.05;
    case 'porter': return q.posture === 'down';
    default: return true;
  }
}

/** Personne visée par un geste de contact : cible explicite, personne sous le réticule du joueur, sinon la plus proche devant. */
function contactTarget(core: ItemsCore, p: Person, verb: InteractVerb, reach: number, explicit: EntityId): EntityId {
  const ctx = core.ctx;
  if (explicit !== 0) return explicit;
  if (p.isPlayer) {
    const aimed = ctx.player.state.aimedPersonId;
    if (aimed !== 0 && aimed !== p.id) return aimed;
  }
  const ux = Math.sin(p.aimYaw);
  const uz = Math.cos(p.aimYaw);
  const people = core.people;
  const n = ctx.people.queryRadius(p.x, p.z, reach + 0.5, people);
  let best: EntityId = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = people[i]!;
    if (q === p || q.vehicleId !== 0 || !suits(verb, q)) continue;
    if (verb === 'menotter' && q.faction === p.faction) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - q.radius > reach) continue;
    if (d > 0.4 && (dx * ux + dz * uz) / d < 0.3) continue;
    if (d < bestD) {
      bestD = d;
      best = q.id;
    }
  }
  return best;
}

/**
 * Menottes, trousse de secours, sérum physiologique, brancard, micro : lance l'interaction
 * correspondante sur la personne visée (ctx.interactions.startVerb). Le brancard dépose le blessé
 * s'il en porte déjà un.
 */
export function useInteract(
  core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec, opts: UseOptions | undefined,
): UseResult {
  const ctx = core.ctx;
  let verb = spec.verb;
  if (!verb) return useFail('forbidden');
  let targetId: EntityId;
  if (verb === 'porter' && p.carrying !== 0) {
    verb = 'deposer';
    targetId = p.carrying;
  } else {
    targetId = contactTarget(core, p, verb, def.rangeMax, opts && opts.targetId ? opts.targetId : 0);
  }
  if (targetId === 0) return useFail('blocked');
  if (!ctx.interactions.startVerb(p, verb, targetId)) return useFail('blocked');
  const id = stack.id;
  consume(core, p, stack);
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  if (id === 'menottes') core.sfx('menottes', p.x, p.y + 1, p.z);
  core.used(p, id, targetId);
  return USE_OK;
}

/** Appareil photo, caméra, téléphone : une prise de vue (item:used ; le module des médias la note). */
export function useMedia(
  core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec, opts: UseOptions | undefined,
): UseResult {
  const ctx = core.ctx;
  let targetId = opts && opts.targetId ? opts.targetId : 0;
  let x = p.x + Math.sin(p.aimYaw) * 8;
  let z = p.z + Math.cos(p.aimYaw) * 8;
  if (p.isPlayer) {
    const ps = ctx.player.state;
    if (targetId === 0) targetId = ps.aimedPersonId;
    if (ps.personId === p.id && (ps.aimX !== 0 || ps.aimZ !== 0)) {
      x = ps.aimX;
      z = ps.aimZ;
    }
  }
  const subject = targetId !== 0 ? ctx.people.get(targetId) : undefined;
  if (subject) {
    x = subject.x;
    z = subject.z;
  }
  const id = stack.id;
  consume(core, p, stack);
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  const y = p.y + p.look.height * 0.9;
  if (id === 'appareil_photo') core.sfx('declencheur_photo', p.x, y, p.z, 0.8);
  else if (id === 'telephone') core.sfx('declencheur_photo', p.x, y, p.z, 0.3, 1.4);
  else core.sfx('ui_clic', p.x, y, p.z, 0.3);
  core.used(p, id, subject ? subject.id : 0, x, z);
  return USE_OK;
}

// ───────────────────────────── lampe ─────────────────────────────

export function lampOn(p: Person): boolean {
  const e = p.look.extras;
  return !!e && e.lampe === 1;
}

function setLamp(core: ItemsCore, p: Person, on: boolean): void {
  if (!p.look.extras) p.look.extras = {};
  p.look.extras.lampe = on ? 1 : 0;
  const lamps = core.lamps;
  const i = lamps.indexOf(p.id);
  if (on && i < 0) lamps.push(p.id);
  else if (!on && i >= 0) {
    lamps[i] = lamps[lamps.length - 1]!;
    lamps.pop();
  }
  core.ctx.events.emitAny(ITEM_TOGGLE_EVENT, { personId: p.id, item: 'lampe', on });
}

/** Lampe : une pression allume, une pression éteint (Person.look.extras.lampe = 1 quand elle éclaire). */
export function useLamp(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef): UseResult {
  const on = !lampOn(p);
  if (on && stack.state <= 0) return useFail('empty');
  setLamp(core, p, on);
  core.setCooldown(stack, def.cooldown);
  core.sfx('ui_clic', p.x, p.y + 1.2, p.z, 0.4);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Décharge les lampes allumées ; une lampe vide s'éteint. */
export function updateLamps(core: ItemsCore, dt: number): void {
  const lamps = core.lamps;
  for (let i = lamps.length - 1; i >= 0; i--) {
    const p = core.ctx.people.get(lamps[i]!);
    let stack: ItemStack | null = null;
    if (p) {
      const inv = p.inventory;
      for (let k = 0; k < inv.length; k++) {
        if (inv[k]!.id === 'lampe') {
          stack = inv[k]!;
          break;
        }
      }
    }
    if (!p || !stack) {
      // personne disparue ou lampe retirée de l'inventaire
      if (p && p.look.extras) p.look.extras.lampe = 0;
      lamps[i] = lamps[lamps.length - 1]!;
      lamps.pop();
      continue;
    }
    stack.state -= dt / LAMP_SECONDS;
    if (stack.state <= 0) {
      stack.state = 0;
      setLamp(core, p, false);
    }
  }
}

// ───────────────────────────── masque à gaz ─────────────────────────────

function setMask(core: ItemsCore, p: Person, on: boolean): void {
  if (on) {
    if (!core.maskBase.has(p.id)) core.maskBase.set(p.id, p.gasProtection);
    if (p.gasProtection < MASK_PROTECTION) p.gasProtection = MASK_PROTECTION;
  } else {
    const base = core.maskBase.get(p.id);
    if (base !== undefined) p.gasProtection = base;
    core.maskBase.delete(p.id);
  }
  p.look.gasMask = on;
  core.ctx.events.emitAny(ITEM_TOGGLE_EVENT, { personId: p.id, item: 'masque_gaz', on });
}

/**
 * Masque à gaz : le mettre prend huit secondes (il ne protège qu'une fois en place), le retirer deux.
 * Un second usage pendant la mise en place l'annule.
 */
export function useMask(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef): UseResult {
  const jobs = core.masks;
  for (let i = 0; i < jobs.length; i++) {
    if (jobs[i]!.personId === p.id) {
      jobs[i] = jobs[jobs.length - 1]!;
      jobs.pop();
      core.dropAnim(p.id);
      core.setCooldown(stack, def.cooldown);
      return USE_OK;
    }
  }
  if (p.look.gasMask) {
    setMask(core, p, false);
    core.setCooldown(stack, MASK_DOFF_SECONDS);
    core.playAnim(p, def.useAnim, MASK_DOFF_SECONDS);
  } else {
    jobs.push({ personId: p.id, left: MASK_DON_SECONDS });
    core.setCooldown(stack, def.cooldown);
    core.playAnim(p, def.useAnim, MASK_DON_SECONDS);
  }
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Fait avancer les mises en place de masque. */
export function updateMasks(core: ItemsCore, dt: number): void {
  const jobs = core.masks;
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i]!;
    const p = core.ctx.people.get(job.personId);
    // interrompu si la personne est à terre, étourdie ou maîtrisée
    if (!p || p.custody !== 'free' || p.stun > STUN_BLOCK || core.ctx.health.isIncapacitated(p)) {
      jobs[i] = jobs[jobs.length - 1]!;
      jobs.pop();
      continue;
    }
    job.left -= dt;
    if (job.left <= 0) {
      jobs[i] = jobs[jobs.length - 1]!;
      jobs.pop();
      setMask(core, p, true);
    }
  }
}

// ───────────────────────────── divers ─────────────────────────────

/** Pancarte, banderole, drapeau : geste de brandissement (la foule y réagit par l'événement item:used). */
export function useSign(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec): UseResult {
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Parapluie : l'action principale l'ouvre ou le referme (comme le mode secondaire). */
export function useUmbrella(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef): UseResult {
  if (!p.alt && stack.state <= 0) return useFail('empty');
  p.alt = !p.alt;
  p.upper = p.alt ? 'umbrella' : def.idleAnim;
  p.upperT = 0;
  core.setCooldown(stack, def.cooldown);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Télécommande : prend ou rend la main sur le drone (événement libre « drone:toggle »). */
export function useDrone(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec): UseResult {
  core.ctx.events.emitAny(DRONE_TOGGLE_EVENT, { personId: p.id });
  core.setCooldown(stack, def.cooldown);
  core.playAnim(p, def.useAnim, spec.useTime);
  core.sfx('ui_clic', p.x, p.y + 1.1, p.z, 0.4);
  core.used(p, stack.id, 0);
  return USE_OK;
}

/** Butin : en lâche une unité (fuite, contrôle imminent). */
export function useDrop(core: ItemsCore, p: Person, stack: ItemStack, def: ItemDef, spec: ItemSpec): UseResult {
  const id = stack.id;
  core.playAnim(p, def.useAnim, spec.useTime);
  consume(core, p, stack);
  core.setCooldown(stack, def.cooldown);
  core.sfx('impact_sol', p.x, p.y + 0.1, p.z, 0.4);
  core.used(p, id, 0);
  return USE_OK;
}
