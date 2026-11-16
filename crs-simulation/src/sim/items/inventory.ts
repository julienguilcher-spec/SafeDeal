/* =====================================================================================
 * INVENTAIRE — donner, retirer, compter, prendre en main. Mêmes règles pour le joueur et les IA.
 *
 *   - une seule pile par type d'objet ; give() complète la pile existante, bornée à ItemDef.maxCount ;
 *   - give() sans quantité donne la dotation normale de l'objet (réservoir plein, chargeur garni) ;
 *   - une pile d'objets « à l'unité » (grenades, pavés…) disparaît quand elle est vide ; un objet à
 *     réservoir reste dans l'inventaire, vide, jusqu'à son réapprovisionnement ;
 *   - prendre un objet en main impose son temps de mise en main et annule le mode secondaire.
 * ===================================================================================== */

import type { ItemId, ItemStack, Person } from '@/core/contracts';
import { itemDef } from './defs';
import type { ItemsCore } from './shared';
import { itemSpec } from './specs';

/** Objet en main (ou null). */
export function activeItem(p: Person): ItemStack | null {
  return p.active >= 0 ? p.inventory[p.active] ?? null : null;
}

/** Ce qui doit s'arrêter quand la personne change d'objet ou le perd : jet en cours, coup armé, pose. */
function interrupt(core: ItemsCore, p: Person): void {
  const id = p.id;
  const sprays = core.sprays;
  for (let i = sprays.length - 1; i >= 0; i--) {
    if (sprays[i]!.personId === id) {
      sprays[i] = sprays[sprays.length - 1]!;
      sprays.pop();
    }
  }
  const strikes = core.strikes;
  for (let i = strikes.length - 1; i >= 0; i--) {
    if (strikes[i]!.personId === id) {
      strikes[i] = strikes[strikes.length - 1]!;
      strikes.pop();
    }
  }
  core.dropAnim(id);
}

/** Prend en main l'objet de l'emplacement `slot` (−1 : mains nues). false si l'emplacement n'existe pas. */
export function select(core: ItemsCore, p: Person, slot: number): boolean {
  if (slot === -1) {
    if (p.active !== -1) interrupt(core, p);
    p.active = -1;
    p.alt = false;
    p.upper = 'none';
    p.upperT = 0;
    return true;
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.inventory.length) return false;
  if (p.active === slot) return true;
  interrupt(core, p);
  p.active = slot;
  p.alt = false;
  const stack = p.inventory[slot]!;
  const def = itemDef(stack.id);
  const spec = itemSpec(stack.id);
  p.upper = def ? def.idleAnim : 'none';
  p.upperT = 0;
  if (spec && spec.drawTime > 0) core.setCooldown(stack, spec.drawTime);
  return true;
}

/** Prend en main le premier objet de ce type (de préférence une pile non vide). */
export function selectById(core: ItemsCore, p: Person, id: ItemId): boolean {
  const inv = p.inventory;
  let fallback = -1;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i]!;
    if (s.id !== id) continue;
    if (s.count > 0) return select(core, p, i);
    if (fallback < 0) fallback = i;
  }
  return fallback >= 0 ? select(core, p, fallback) : false;
}

/**
 * Donne `count` exemplaires (ou charges) de l'objet ; sans quantité : la dotation normale.
 * La pile est bornée à ItemDef.maxCount. Retourne la pile.
 */
export function give(p: Person, id: ItemId, count?: number): ItemStack {
  const def = itemDef(id);
  const spec = itemSpec(id);
  let n = count === undefined ? (spec ? spec.dotation : 1) : count;
  if (!(n > 0)) n = 0;
  const max = def ? def.maxCount : Infinity;
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i]!;
    if (s.id === id) {
      s.count = Math.min(max, s.count + n);
      return s;
    }
  }
  const stack: ItemStack = { id, count: Math.min(max, n), state: 1, cooldown: 0 };
  inv.push(stack);
  return stack;
}

/** Retire la pile d'index `index` de l'inventaire en tenant l'objet en main à jour. */
export function removeStackAt(core: ItemsCore, p: Person, index: number): void {
  const inv = p.inventory;
  if (index < 0 || index >= inv.length) return;
  inv.splice(index, 1);
  if (p.active === index) {
    interrupt(core, p);
    p.active = -1;
    p.alt = false;
    p.upper = 'none';
    p.upperT = 0;
  } else if (p.active > index) {
    p.active--;
  }
}

/**
 * Retire jusqu'à `count` exemplaires (tous par défaut). Une pile vidée quitte l'inventaire.
 * Retourne le nombre réellement retiré.
 */
export function remove(core: ItemsCore, p: Person, id: ItemId, count = Infinity): number {
  let removed = 0;
  const inv = p.inventory;
  for (let i = inv.length - 1; i >= 0 && removed < count; i--) {
    const s = inv[i]!;
    if (s.id !== id) continue;
    const take = Math.min(s.count, count - removed);
    s.count -= take;
    removed += take;
    if (s.count <= 0) removeStackAt(core, p, i);
  }
  return removed;
}

/** Nombre total d'exemplaires (ou de charges) de cet objet. */
export function has(p: Person, id: ItemId): number {
  let total = 0;
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i]!.id === id) total += inv[i]!.count;
  return total;
}

/**
 * Consomme une unité ou une charge de la pile après un usage. Les objets à l'unité quittent
 * l'inventaire quand la pile est vide.
 */
export function consume(core: ItemsCore, p: Person, stack: ItemStack): void {
  const spec = itemSpec(stack.id);
  if (!spec || spec.consume === 'none') return;
  stack.count -= 1;
  if (stack.count < 0) stack.count = 0;
  if (spec.consume === 'unit' && stack.count <= 0) {
    const index = p.inventory.indexOf(stack);
    if (index >= 0) removeStackAt(core, p, index);
  }
}
