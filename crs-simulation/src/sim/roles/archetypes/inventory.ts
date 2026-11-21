/* =====================================================================================
 * ARCHÉTYPES — mise en place de la dotation dans l'inventaire d'une personne.
 *
 * Tout passe par ctx.actions (give / remove / has / select) : le résultat est le même avec le
 * service neutre et avec le module du matériel. Les quantités sont bornées à ItemDef.maxCount quand
 * la définition de l'objet est connue.
 * ===================================================================================== */

import type { GameContext, ItemId, ItemStack, Person } from '@/core/contracts';
import type { Draft } from './model';
import { KIT_MAX, kitHas } from './model';

/** Objets ramassés dans la rue : conservés par un changement de profil vers un profil violent. */
const LOOSE: ReadonlySet<string> = new Set(['pave', 'bouteille', 'butin']);

export function isLoose(id: ItemId): boolean {
  return LOOSE.has(id);
}

/** Quantité bornée à la capacité de l'objet (si le module du matériel la connaît). */
export function clampCount(ctx: GameContext, id: ItemId, count: number): number {
  const def = ctx.actions.def(id);
  const n = count > 0 ? count : 0;
  return def && def.maxCount > 0 && n > def.maxCount ? def.maxCount : n;
}

/** Réserve de piles réutilisées pour PersonInit.inventory (le magasin des personnes les recopie). */
export class StackPool {
  private readonly pool: ItemStack[] = [];
  readonly list: ItemStack[] = [];

  constructor() {
    for (let i = 0; i < KIT_MAX; i++) this.pool.push({ id: '', count: 0, state: 1, cooldown: 0 });
  }

  /** Remplit `list` avec la dotation du brouillon. */
  fill(ctx: GameContext, d: Draft): ItemStack[] {
    const list = this.list;
    list.length = 0;
    for (let i = 0; i < d.kitN; i++) {
      const s = this.pool[i]!;
      s.id = d.kitIds[i]!;
      s.count = clampCount(ctx, s.id, d.kitCounts[i]!);
      s.state = 1;
      s.cooldown = 0;
      list.push(s);
    }
    return list;
  }
}

function dropAt(p: Person, index: number): void {
  p.inventory.splice(index, 1);
  if (p.active === index) {
    p.active = -1;
    p.alt = false;
  } else if (p.active > index) {
    p.active--;
  }
}

/**
 * Met l'inventaire d'une personne en accord avec la dotation du brouillon :
 *   1. retire ce qui n'en fait plus partie (les objets ramassés sont gardés si `keepLoose`) ;
 *   2. complète ce qui manque, recomplète les munitions (réapprovisionnement) et rend le surplus ;
 *   3. range les emplacements dans l'ordre de la dotation, objets ramassés à la suite ;
 *   4. garde en main l'objet tenu s'il existe encore, sinon prend l'objet du poste.
 */
export function syncInventory(ctx: GameContext, p: Person, d: Draft, keepLoose: boolean): void {
  const inv = p.inventory;
  for (let i = inv.length - 1; i >= 0; i--) {
    if (i >= inv.length) continue;
    const sid = inv[i]!.id;
    if (kitHas(d, sid) || (keepLoose && isLoose(sid))) continue;
    const before = inv.length;
    ctx.actions.remove(p, sid);
    if (inv.length === before) dropAt(p, i);
  }
  for (let k = 0; k < d.kitN; k++) {
    const id = d.kitIds[k]!;
    const want = clampCount(ctx, id, d.kitCounts[k]!);
    const have = ctx.actions.has(p, id);
    if (have < want) ctx.actions.give(p, id, want - have);
    else if (have > want && want > 0) ctx.actions.remove(p, id, have - want);
  }
  // ordre des emplacements
  const held = p.active >= 0 ? inv[p.active] : undefined;
  let at = 0;
  for (let k = 0; k < d.kitN; k++) {
    const id = d.kitIds[k]!;
    for (let j = at; j < inv.length; j++) {
      if (inv[j]!.id !== id) continue;
      if (j !== at) {
        const moved = inv[j]!;
        for (let m = j; m > at; m--) inv[m] = inv[m - 1]!;
        inv[at] = moved;
      }
      at++;
      break;
    }
  }
  if (held) p.active = inv.indexOf(held);
  if (p.active < 0) {
    p.alt = false;
    if (d.hand) ctx.actions.selectById(p, d.hand);
  }
}
