/* =====================================================================================
 * DÉCOR DYNAMIQUE — gestionnaires d'interaction liés aux boutiques et au feu.
 *
 *   piller     vitrine brisée, rideau levé ou forcé : 20 s et plus dans la boutique, une charge de
 *              butin ; le compteur `occupants` de la vitrine est tenu ici (entrée, sortie, abandon)
 *   eteindre   extincteur en main, feu d'objet ou de boutique à moins de 4 m : jet continu d'une
 *              unité d'agent par seconde (18 s de charge), par ctx.hazards.douse et sur nos feux
 *   incendier  met le feu à un objet combustible (durée d'allumage du matériau) ou à une boutique
 *              ouverte (8 s) — réservé, comme piller, à qui n'est ni des forces ni des secours
 * ===================================================================================== */

import type { EntityId, InteractionHandler, Person } from '@/core/contracts';
import { REACH, option } from './handlers-kit';
import type { HandlerKit } from './handlers-kit';
import type { Mod } from './mod';
import { ACT_BURNING } from './shared';
import type { PropObj, ShopObj } from './shared';

const LOOT_SECONDS = 20;
const EXTINGUISH_REACH = 4;
/** Durée de décharge d'un extincteur portatif (s). */
const EXTINGUISHER_SECONDS = 18;

export function createShopHandlers(m: Mod, kit: HandlerKit): { handlers: InteractionHandler[]; reset(): void } {
  const k = m.k;
  const store = m.store;
  const { able, label, inReach, pick, pickShop, fill, fillShop, gesture, endGesture } = kit;
  /** Boutique où chaque pilleur est entré (pour tenir `occupants`). */
  const inside = new Map<EntityId, EntityId>();

  // ───────────────────────────── piller ─────────────────────────────

  function leave(a: Person): void {
    const id = inside.get(a.id);
    if (id === undefined) return;
    inside.delete(a.id);
    const s = store.shop(id);
    if (s && s.occupants > 0) s.occupants--;
  }

  const lootOpt = option('piller');
  const canLoot = (s: ShopObj): boolean => m.shops.lootable(s) && s.occupants < s.maxOccupants;
  const piller: InteractionHandler = {
    verb: 'piller',
    find(a, targetId) {
      if (!able(a) || !k.isOffender(a) || inside.has(a.id)) return null;
      const s = pickShop(a, 2.2, canLoot, targetId);
      if (!s) return null;
      // une boutique déjà vidée demande de chercher plus longtemps (20 à 35 s)
      return fillShop(lootOpt, s, `Piller « ${s.name} »`, 28, LOOT_SECONDS + 15 * (1 - s.stock));
    },
    begin(a, o) {
      const s = store.shop(o.targetId);
      if (!s || !able(a) || !canLoot(s)) return false;
      leave(a);
      s.occupants++;
      s.dormant = false;
      inside.set(a.id, s.id);
      gesture(a, 'pickup');
      return true;
    },
    tick(_a, o) {
      const s = store.shop(o.targetId);
      return !!s && m.shops.lootable(s);
    },
    complete(a, o) {
      endGesture(a, 'pickup');
      leave(a);
      const s = store.shop(o.targetId);
      if (!s) return;
      if (m.shops.loot(s, a.id) > 0) {
        k.ctx.actions.give(a, 'butin', 1);
        if (a.upper === 'none') gesture(a, 'carry_loot');
      }
    },
    cancel(a) {
      endGesture(a, 'pickup');
      leave(a);
    },
  };

  // ───────────────────────────── éteindre ─────────────────────────────

  const fireOpt = option('eteindre');
  const isBurning = (p: PropObj): boolean => (p.act & ACT_BURNING) !== 0;
  const shopBurning = (s: ShopObj): boolean => s.inFire;
  function extinguisher(a: Person): { state: number; count: number } | null {
    const stack = k.ctx.actions.activeItem(a);
    return stack && stack.id === 'extincteur' && stack.count > 0 && stack.state > 0 ? stack : null;
  }
  const sprayAt = new Map<EntityId, number>();
  const eteindre: InteractionHandler = {
    verb: 'eteindre',
    find(a, targetId) {
      if (!able(a) || !extinguisher(a)) return null;
      const p = pick(a, EXTINGUISH_REACH, isBurning, targetId);
      if (p) return fill(fireOpt, p, 'Éteindre le feu', 35, 12);
      const s = pickShop(a, EXTINGUISH_REACH + 0.5, shopBurning, targetId);
      if (!s) return null;
      const o = fillShop(fireOpt, s, 'Éteindre le feu', 35, 18);
      // le jet vise le pied de la devanture, côté rue
      o.x = s.x + Math.sin(s.heading) * 0.8;
      o.z = s.z + Math.cos(s.heading) * 0.8;
      return o;
    },
    begin(a) {
      if (!able(a) || !extinguisher(a)) return false;
      gesture(a, 'extinguish');
      return true;
    },
    tick(a, o, elapsed, dt) {
      const stack = extinguisher(a);
      if (!stack) return false;
      let x = o.x;
      let z = o.z;
      let y = a.y + 0.5;
      if (o.targetKind === 'prop') {
        const p = store.get(o.targetId);
        if (!p || !isBurning(p)) return false;
        x = p.x;
        z = p.z;
        y = p.y + 0.4;
      } else {
        const s = store.shop(o.targetId);
        if (!s || !s.inFire) return false;
      }
      stack.state -= dt / EXTINGUISHER_SECONDS;
      if (stack.state < 0) stack.state = 0;
      m.fire.douse(x, z, 1.2, dt, a.id);
      const last = sprayAt.get(a.id);
      if (last === undefined || elapsed - last >= 0.5 || elapsed < last) {
        sprayAt.set(a.id, elapsed);
        k.fx('poudre', x, y, z, 1.2);
        k.sfx('extincteur', a.x, a.y + 1.2, a.z, 0.8, 1);
      }
      return true;
    },
    complete(a) {
      endGesture(a, 'extinguish');
      sprayAt.delete(a.id);
    },
    cancel(a) {
      endGesture(a, 'extinguish');
      sprayAt.delete(a.id);
    },
  };

  // ───────────────────────────── incendier ─────────────────────────────

  const burnOpt = option('incendier');
  const flammable = (p: PropObj): boolean => m.fire.canBurn(p) && p.carriedBy === 0 && k.ctx.clock.now >= p.wetUntil;
  const shopFlammable = (s: ShopObj): boolean =>
    !s.inFire && !s.burnt && s.fuel > 0 && s.window === 'broken' && (s.shutter < 0.5 || s.forced);
  const incendier: InteractionHandler = {
    verb: 'incendier',
    find(a, targetId) {
      if (!able(a) || !k.isOffender(a) || a.carrying !== 0) return null;
      const p = pick(a, REACH, flammable, targetId);
      if (p) {
        const t = p.def.igniteSeconds * 0.8;
        return fill(burnOpt, p, label('Incendier', p), 8, t < 4 ? 4 : t > 12 ? 12 : t);
      }
      const s = pickShop(a, 2.2, shopFlammable, targetId);
      if (!s) return null;
      return fillShop(burnOpt, s, `Incendier « ${s.name} »`, 6, 8);
    },
    begin(a, o) {
      if (!able(a)) return false;
      if (o.targetKind === 'shop') {
        const s = store.shop(o.targetId);
        if (!s || !shopFlammable(s)) return false;
      } else {
        const p = store.get(o.targetId);
        if (!p || !flammable(p) || !inReach(a, p, REACH + 0.3)) return false;
      }
      gesture(a, 'pickup');
      return true;
    },
    complete(a, o) {
      endGesture(a, 'pickup');
      if (o.targetKind === 'shop') {
        const s = store.shop(o.targetId);
        if (s && shopFlammable(s)) m.shops.ignite(s, a.id, false);
        return;
      }
      const p = store.get(o.targetId);
      if (p && flammable(p)) m.fire.ignite(p, a.id);
    },
    cancel(a) {
      endGesture(a, 'pickup');
    },
  };

  return {
    handlers: [piller, eteindre, incendier],
    reset(): void {
      inside.clear();
      sprayAt.clear();
    },
  };
}
