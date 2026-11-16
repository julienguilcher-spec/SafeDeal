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
 *   piller     vitrine brisée, rideau levé ou forcé : 20 s et plus, une charge de butin
 *   degager    barricade : un élément toutes les 6 s ; épave ou débris : enlevés ; objet renversé : redressé
 *   eteindre   extincteur en main, feu d'objet ou de boutique à moins de 4 m : jet continu
 *   incendier  met le feu à un objet combustible ou à une boutique ouverte (durée d'allumage du matériau)
 * Piller, dépaver et incendier ne sont proposés qu'aux personnes qui ne sont ni des forces de
 * l'ordre ni des secours. Chaque gestionnaire réutilise son objet d'option.
 * ===================================================================================== */

import type {
  EntityId, InteractionHandler, InteractionOption, InteractVerb, ItemId, Person, UpperAnim,
} from '@/core/contracts';
import { distSqPointObb, distSqPointSegment } from '@/core/math';
import type { Mod } from './mod';
import { ACT_BURNING, TENSION, tileKey } from './shared';
import type { PropObj, ShopObj } from './shared';

const REACH = 1.3;
const DISMANTLE_SECONDS = 6;
const LOOT_SECONDS = 20;
const EXTINGUISH_REACH = 4;
/** Durée de décharge d'un extincteur portatif (s). */
const EXTINGUISHER_SECONDS = 18;
/** Pavés descellés par un geste de dépavage, et réserve d'un carré de chaussée de 2 m. */
const SETT_LOOSENED = 10;
const SETT_STOCK = 30;
const PUSH_COOLDOWN = 0.7;

function option(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'prop', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

export function createHandlers(m: Mod): InteractionHandler[] {
  const k = m.k;
  const store = m.store;
  const buf: PropObj[] = [];
  const shopBuf: ShopObj[] = [];
  const labels = new Map<string, string>();
  /** Boutique où chaque pilleur est entré (pour tenir `occupants`). */
  const inside = new Map<EntityId, EntityId>();
  const pushedAt = new Map<EntityId, number>();
  /** Pavés restants par carré de chaussée pavée de 2 m. */
  const settLeft = new Map<number, number>();

  function able(a: Person): boolean {
    return a.vehicleId === 0 && a.custody === 'free' && a.heldBy === 0 && a.posture !== 'down' && !k.ctx.health.isIncapacitated(a);
  }

  function label(verbWord: string, p: PropObj): string {
    const key = verbWord + p.kind;
    let l = labels.get(key);
    if (l === undefined) {
      l = `${verbWord} ${p.def.label}`;
      labels.set(key, l);
    }
    return l;
  }

  function inReach(a: Person, p: PropObj, reach: number): boolean {
    const r = a.radius + reach;
    return distSqPointObb(a.x, a.z, p.x, p.z, p.halfX, p.halfZ, p.heading) <= r * r;
  }

  /** Meilleur objet à portée qui passe le test : celui désigné, sinon le plus proche devant soi. */
  function pick(a: Person, reach: number, test: (p: PropObj, a: Person) => boolean, targetId: EntityId | undefined): PropObj | null {
    if (targetId !== undefined && targetId !== 0) {
      const p = store.get(targetId);
      return p && p.slot >= 0 && test(p, a) && inReach(a, p, reach) ? p : null;
    }
    const n = store.queryRadius(a.x, a.z, a.radius + reach, buf);
    const fx = Math.sin(a.aimYaw);
    const fz = Math.cos(a.aimYaw);
    let best: PropObj | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      const p = buf[i]!;
      if (!test(p, a)) continue;
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (facing < -0.3 && d > 0.6) continue; // dans le dos
      const score = d - facing * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  function fill(o: InteractionOption, p: PropObj, text: string, priority: number, duration: number): InteractionOption {
    o.targetKind = 'prop';
    o.targetId = p.id;
    o.label = text;
    o.priority = priority;
    o.duration = duration;
    o.x = p.x;
    o.z = p.z;
    return o;
  }

  function gesture(a: Person, anim: UpperAnim): void {
    a.upper = anim;
    a.upperT = 0;
  }

  function endGesture(a: Person, anim: UpperAnim): void {
    if (a.upper === anim) {
      a.upper = 'none';
      a.upperT = 0;
    }
  }

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

  function room(a: Person, item: ItemId): number {
    const def = k.ctx.actions.def(item);
    const max = def ? def.maxCount : item === 'pave' ? 6 : item === 'bouteille' ? 4 : 1;
    return max - k.ctx.actions.has(a, item);
  }

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
          pile = store.create('pile_paves', x, z, a.heading);
          // petit tas de pavés descellés : bas, on l'enjambe
          pile.halfX = pile.halfZ = 0.3;
          pile.height = 0.25;
          pile.blocksMove = false;
          pile.yieldLeft = loosened;
          store.reindex(pile);
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

  // ───────────────────────────── piller ─────────────────────────────

  /** Vitrine à portée (2,2 m de la façade, côté rue) qui passe le test. */
  function pickShop(a: Person, reach: number, test: (s: ShopObj) => boolean, targetId: EntityId | undefined): ShopObj | null {
    if (targetId !== undefined && targetId !== 0) {
      const s = store.shop(targetId);
      if (!s || s.slot < 0 || !test(s)) return null;
      const tx = Math.cos(s.heading) * s.width * 0.5;
      const tz = -Math.sin(s.heading) * s.width * 0.5;
      return distSqPointSegment(a.x, a.z, s.x - tx, s.z - tz, s.x + tx, s.z + tz) <= reach * reach ? s : null;
    }
    const n = store.shopsNear(a.x, a.z, reach, shopBuf);
    let best: ShopObj | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const s = shopBuf[i]!;
      if (!test(s)) continue;
      const dx = a.x - s.x;
      const dz = a.z - s.z;
      if (dx * Math.sin(s.heading) + dz * Math.cos(s.heading) < -0.6) continue; // derrière la façade
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

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
      const o = lootOpt;
      o.targetKind = 'shop';
      o.targetId = s.id;
      o.label = `Piller « ${s.name} »`;
      o.priority = 28;
      // une boutique déjà vidée demande de chercher plus longtemps (20 à 35 s)
      o.duration = LOOT_SECONDS + 15 * (1 - s.stock);
      o.x = s.x;
      o.z = s.z;
      return o;
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
      const o = fireOpt;
      o.targetKind = 'shop';
      o.targetId = s.id;
      o.label = 'Éteindre le feu';
      o.priority = 35;
      o.duration = 18;
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
      const o = burnOpt;
      o.targetKind = 'shop';
      o.targetId = s.id;
      o.label = `Incendier « ${s.name} »`;
      o.priority = 6;
      o.duration = 8;
      o.x = s.x;
      o.z = s.z;
      return o;
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

  const handlers = [renverser, pousser, porter, deposer, depaver, ramasser, piller, degager, eteindre, incendier];
  // remise à zéro de l'état propre aux gestionnaires (début de session)
  resetters.set(handlers, () => {
    inside.clear();
    pushedAt.clear();
    settLeft.clear();
    sprayAt.clear();
    labels.clear();
  });
  return handlers;
}

const resetters = new WeakMap<InteractionHandler[], () => void>();

/** Remet à zéro l'état interne des gestionnaires créés par createHandlers(). */
export function resetHandlers(handlers: InteractionHandler[]): void {
  resetters.get(handlers)?.();
}
