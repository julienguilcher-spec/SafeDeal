/* =====================================================================================
 * DÉCOR DYNAMIQUE — gestionnaires d'interaction (touche « Interagir » du joueur et IA, par
 * ctx.interactions.startVerb).
 *
 *   renverser  poubelle, conteneur, barrière, vélo, table… debout               0,4 à 2 s
 *   pousser    objet mobile : une bourrade dans la direction du regard           immédiat
 *   porter     objet léger (porté) ou à roulettes (tiré) ; deposer le repose     0,6 à 0,9 s
 *   depaver    sur une pile de pavés ou des débris : prend des pavés ; sur chaussée pavée
 *              (ctx.world.surfaceAt = 'sett') : descelle une dizaine de pavés en 7 s (4 s avec une
 *              barre), en donne deux et laisse les autres en tas pour les suivants
 *   ramasser   bouteilles d'une colonne à verre ou d'une table, barre d'un échafaudage
 *   degager    barricade : un élément toutes les 6 s ; épave ou débris : enlevés ; objet renversé : redressé
 *   piller, eteindre, incendier : voir handlers-shops.ts
 * Piller, dépaver et incendier ne sont proposés qu'aux personnes qui ne sont ni des forces de
 * l'ordre ni des secours. Chaque gestionnaire réutilise son objet d'option.
 * ===================================================================================== */

import type { EntityId, InteractionHandler, Person } from '@/core/contracts';
import { REACH, createKit, option } from './handlers-kit';
import { createShopHandlers } from './handlers-shops';
import type { Mod } from './mod';
import { TENSION, tileKey } from './shared';
import type { PropObj } from './shared';

const DISMANTLE_SECONDS = 6;
/** Pavés descellés par un geste de dépavage, et réserve d'un carré de chaussée de 2 m. */
const SETT_LOOSENED = 10;
const SETT_STOCK = 30;
const PUSH_COOLDOWN = 0.7;

export function createHandlers(m: Mod): InteractionHandler[] {
  const k = m.k;
  const store = m.store;
  const kit = createKit(m);
  const { able, label, inReach, pick, fill, gesture, endGesture, room, buf } = kit;
  const pushedAt = new Map<EntityId, number>();
  /** Pavés restants par carré de chaussée pavée de 2 m. */
  const settLeft = new Map<number, number>();

  // ───────────────────────────── renverser ─────────────────────────────

  const toppleOpt = option('renverser');
  const canTopple = (p: PropObj): boolean =>
    p.movable && !p.toppled && p.def.topple !== 'none' && p.carriedBy === 0 && p.burning < 0.5 && p.parts === null;
  const renverser: InteractionHandler = {
    verb: 'renverser',
    find(a, targetId) {
      if (!able(a) || a.carrying !== 0) return null;
      const p = pick(a, REACH, canTopple, targetId);
      return p ? fill(toppleOpt, p, label('Renverser', p), 30, p.def.toppleSeconds) : null;
    },
    begin(a, o) {
      const p = store.get(o.targetId);
      if (!p || !able(a) || !canTopple(p) || !inReach(a, p, REACH + 0.3)) return false;
      gesture(a, 'push');
      return true;
    },
    complete(a, o) {
      endGesture(a, 'push');
      const p = store.get(o.targetId);
      if (!p || !canTopple(p)) return;
      let dx = p.x - a.x;
      let dz = p.z - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-3) {
        dx /= d;
        dz /= d;
      } else {
        dx = Math.sin(a.aimYaw);
        dz = Math.cos(a.aimYaw);
      }
      if (m.motion.topple(p, dx, dz, a.id)) {
        m.motion.push(p, dx, dz, 0.9 / p.def.pushFactor, a.id);
        if (k.isOffender(a)) k.tension(TENSION.degradation, p.x, p.z, 'mobilier renversé');
      }
    },
    cancel(a) {
      endGesture(a, 'push');
    },
  };

  // ───────────────────────────── pousser ─────────────────────────────

  const pushOpt = option('pousser');
  const canPush = (p: PropObj): boolean => p.movable && p.carriedBy === 0 && p.parts === null;
  const pousser: InteractionHandler = {
    verb: 'pousser',
    find(a, targetId) {
      if (!able(a) || a.carrying !== 0) return null;
      const last = pushedAt.get(a.id);
      if (last !== undefined && k.ctx.clock.now - last < PUSH_COOLDOWN) return null;
      const p = pick(a, REACH - 0.2, canPush, targetId);
      return p ? fill(pushOpt, p, label('Pousser', p), 12, 0) : null;
    },
    begin(a, o) {
      const p = store.get(o.targetId);
      return !!p && able(a) && canPush(p) && inReach(a, p, REACH + 0.2);
    },
    complete(a, o) {
      const p = store.get(o.targetId);
      if (!p || !canPush(p)) return;
      pushedAt.set(a.id, k.ctx.clock.now);
      const build = a.look.build > 0.5 ? a.look.build : 1;
      m.motion.push(p, Math.sin(a.aimYaw), Math.cos(a.aimYaw), 2.6 * build, a.id);
    },
  };

  // ───────────────────────────── porter / déposer ─────────────────────────────

  const carryOpt = option('porter');
  const canCarry = (p: PropObj): boolean =>
    p.def.carry !== 'non' && p.movable && p.carriedBy === 0 && p.burning < 0.2 && p.parts === null;
  const porter: InteractionHandler = {
    verb: 'porter',
    find(a, targetId) {
      if (!able(a) || a.carrying !== 0) return null;
      const p = pick(a, REACH, canCarry, targetId);
      if (!p) return null;
      const roll = p.def.carry === 'roule';
      return fill(carryOpt, p, label(roll ? 'Tirer' : 'Porter', p), 14, roll ? 0.9 : 0.6);
    },
    begin(a, o) {
      const p = store.get(o.targetId);
      return !!p && able(a) && a.carrying === 0 && canCarry(p) && inReach(a, p, REACH + 0.3);
    },
    complete(a, o) {
      const p = store.get(o.targetId);
      if (p && able(a) && inReach(a, p, REACH + 0.6)) m.motion.carry(p, a);
    },
  };

  const dropOpt = option('deposer');
  const deposer: InteractionHandler = {
    verb: 'deposer',
    find(a, targetId) {
      if (a.carrying === 0) return null;
      const p = store.get(a.carrying);
      if (!p || p.carriedBy !== a.id) return null;
      if (targetId !== undefined && targetId !== 0 && targetId !== p.id) return null;
      return fill(dropOpt, p, label('Poser', p), 40, 0);
    },
    begin(a, o) {
      return a.carrying === o.targetId && store.get(o.targetId) !== undefined;
    },
    complete(a) {
      m.motion.drop(a);
    },
  };

  // ───────────────────────────── dépaver / ramasser ─────────────────────────────

  /** Prend dans la réserve d'un objet ce que l'acteur peut encore porter ; retire l'objet s'il est vide. */
  function takeFrom(a: Person, p: PropObj): number {
    const item = p.def.yieldItem;
    if (item === null || p.yieldLeft <= 0) return 0;
    let take = p.def.yieldPer;
    if (take > p.yieldLeft) take = p.yieldLeft;
    const free = room(a, item);
    if (take > free) take = free;
    if (take <= 0) return 0;
    p.yieldLeft -= take;
    p.dirty = true;
    k.ctx.actions.give(a, item, take);
    if (p.yieldLeft <= 0 && (p.kind === 'pile_paves' || p.kind === 'debris')) store.remove(p);
    return take;
  }

  const paveOpt = option('depaver');
  const hasPaves = (p: PropObj): boolean => p.def.yieldItem === 'pave' && p.yieldLeft > 0 && p.carriedBy === 0;
  function settKey(x: number, z: number): number {
    return tileKey(Math.floor(x / 2), Math.floor(z / 2));
  }
  function settStock(x: number, z: number): number {
    const left = settLeft.get(settKey(x, z));
    return left === undefined ? SETT_STOCK : left;
  }
  const depaver: InteractionHandler = {
    verb: 'depaver',
    find(a, targetId) {
      if (!able(a) || !k.isOffender(a) || room(a, 'pave') <= 0) return null;
      const p = pick(a, REACH, hasPaves, targetId);
      if (p) return fill(paveOpt, p, p.kind === 'debris' ? 'Ramasser des débris' : 'Prendre des pavés', 26, p.def.yieldSeconds);
      if (targetId !== undefined && targetId !== 0) return null;
      if (k.ctx.world.surfaceAt(a.x, a.z) !== 'sett' || settStock(a.x, a.z) <= 0) return null;
      const o = paveOpt;
      o.targetKind = 'place';
      o.targetId = 0;
      o.label = 'Dépaver la chaussée';
      o.priority = 18;
      o.duration = k.ctx.actions.has(a, 'barre') > 0 ? 4 : 7;
      o.x = a.x;
      o.z = a.z;
      return o;
    },
    begin(a, o) {
      if (!able(a) || room(a, 'pave') <= 0) return false;
      if (o.targetId !== 0) {
        const p = store.get(o.targetId);
        if (!p || !hasPaves(p) || !inReach(a, p, REACH + 0.3)) return false;
      } else if (k.ctx.world.surfaceAt(a.x, a.z) !== 'sett' || settStock(a.x, a.z) <= 0) return false;
      gesture(a, 'pickup');
      return true;
    },
    complete(a, o) {
      endGesture(a, 'pickup');
      if (o.targetId !== 0) {
        const p = store.get(o.targetId);
        if (p && hasPaves(p)) takeFrom(a, p);
        return;
      }
      if (k.ctx.world.surfaceAt(a.x, a.z) !== 'sett') return;
      const key = settKey(a.x, a.z);
      const stock = settStock(a.x, a.z);
      let loosened = SETT_LOOSENED < stock ? SETT_LOOSENED : stock;
      if (loosened <= 0) return;
      settLeft.set(key, stock - loosened);
      let take = 2;
      const free = room(a, 'pave');
      if (take > free) take = free;
      if (take > loosened) take = loosened;
      k.ctx.actions.give(a, 'pave', take);
      loosened -= take;
      // les autres pavés descellés restent en tas pour les suivants
      if (loosened > 0) {
        const x = a.x + Math.sin(a.heading) * 0.8;
        const z = a.z + Math.cos(a.heading) * 0.8;
        let pile: PropObj | null = null;
        const n = store.queryRadius(x, z, 1.2, buf);
        for (let i = 0; i < n; i++) if (buf[i]!.kind === 'pile_paves') pile = buf[i]!;
        if (pile) pile.yieldLeft += loosened;
        else {
          pile = store.create('pile_paves', x, z, a.heading, false);
          // petit tas de pavés descellés : bas, on l'enjambe
          pile.halfX = pile.halfZ = 0.3;
          pile.height = 0.25;
          pile.blocksMove = false;
          pile.yieldLeft = loosened;
          store.reindex(pile);
          store.announce(pile);
        }
        pile.dirty = true;
      }
      const y = k.ctx.world.heightAt(a.x, a.z);
      k.fx('poussiere', a.x, Number.isFinite(y) ? y : 0, a.z, 0.8);
      k.sfx('impact_sol', a.x, Number.isFinite(y) ? y : 0, a.z, 0.8, 0.8);
      k.offense(a.id, 'degradation', a.x, a.z, TENSION.degradation, 'dépavage');
    },
    cancel(a) {
      endGesture(a, 'pickup');
    },
  };

  const grabOpt = option('ramasser');
  const hasYield = (p: PropObj, a: Person): boolean => {
    const item = p.def.yieldItem;
    return item !== null && item !== 'pave' && p.yieldLeft > 0 && p.carriedBy === 0 && p.burning < 0.2 && room(a, item) > 0;
  };
  const ramasser: InteractionHandler = {
    verb: 'ramasser',
    find(a, targetId) {
      if (!able(a)) return null;
      const p = pick(a, REACH, hasYield, targetId);
      if (!p) return null;
      return fill(grabOpt, p, p.def.yieldItem === 'barre' ? 'Arracher une barre' : 'Prendre des bouteilles', 16, p.def.yieldSeconds);
    },
    begin(a, o) {
      const p = store.get(o.targetId);
      if (!p || !able(a) || !hasYield(p, a) || !inReach(a, p, REACH + 0.3)) return false;
      gesture(a, 'pickup');
      return true;
    },
    complete(a, o) {
      endGesture(a, 'pickup');
      const p = store.get(o.targetId);
      if (p && hasYield(p, a)) takeFrom(a, p);
    },
    cancel(a) {
      endGesture(a, 'pickup');
    },
  };

  // ───────────────────────────── dégager ─────────────────────────────

  const clearOpt = option('degager');
  const clearable = (p: PropObj): boolean => {
    if (p.carriedBy !== 0 || p.burning > 0.3) return false;
    if (p.parts !== null) return p.parts.length > 0;
    if (!p.movable) return false;
    return p.kind === 'debris' || p.state === 'broken' || p.state === 'burnt' || p.toppled;
  };
  const degager: InteractionHandler = {
    verb: 'degager',
    find(a, targetId) {
      if (!able(a) || a.carrying !== 0) return null;
      const p = pick(a, REACH + 0.3, clearable, targetId);
      if (!p) return null;
      if (p.parts !== null) return fill(clearOpt, p, 'Dégager la barricade', 24, DISMANTLE_SECONDS);
      const wreck = p.kind === 'debris' || p.state === 'broken' || p.state === 'burnt';
      return fill(clearOpt, p, label(wreck ? 'Enlever' : 'Redresser', p), 20, wreck ? 3 : 1.5);
    },
    begin(a, o) {
      const p = store.get(o.targetId);
      if (!p || !able(a) || !clearable(p) || !inReach(a, p, REACH + 0.6)) return false;
      gesture(a, 'drag');
      return true;
    },
    tick(_a, o) {
      const p = store.get(o.targetId);
      return !!p && p.burning <= 0.3;
    },
    complete(a, o) {
      endGesture(a, 'drag');
      const p = store.get(o.targetId);
      if (!p || !clearable(p)) return;
      if (p.parts !== null) {
        m.barricades.takePart(p, a);
        return;
      }
      if (p.kind === 'debris' || p.state === 'broken' || p.state === 'burnt') store.remove(p);
      else m.motion.standUp(p);
    },
    cancel(a) {
      endGesture(a, 'drag');
    },
  };

  const shop = createShopHandlers(m, kit);
  const handlers = [renverser, pousser, porter, deposer, depaver, ramasser, degager, ...shop.handlers];
  // remise à zéro de l'état propre aux gestionnaires (début de session)
  resetters.set(handlers, () => {
    pushedAt.clear();
    settLeft.clear();
    kit.reset();
    shop.reset();
  });
  return handlers;
}

const resetters = new WeakMap<InteractionHandler[], () => void>();

/** Remet à zéro l'état interne des gestionnaires créés par createHandlers(). */
export function resetHandlers(handlers: InteractionHandler[]): void {
  resetters.get(handlers)?.();
}
