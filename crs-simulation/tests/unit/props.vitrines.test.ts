// Décor dynamique — cycle de vie d'une vitrine : tag, coups de marteau, rideau de fer, pillage, stock, incendie.
import { describe, expect, it } from 'vitest';
import type { Shop } from '@/core/contracts';
import { shopDef, shopName, shopOpenAt } from '@/sim/props';
import { startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

/** Dégâts des objets du jeu (src/sim/items/specs.ts) : marteau et barre sur une vitrine ; pavé lancé (énergie × 0,2). */
const MARTEAU = 12;
const PAVE = 34;

/** Frappe la vitrine au marteau jusqu'à l'état voulu ; retourne le nombre de coups. */
function hammerUntil(rig: PropsRig, shop: Shop, byId: number, done: () => boolean, max = 200): number {
  let hits = 0;
  while (!done() && hits < max) {
    rig.ctx.props.damageShop(shop, MARTEAU, 'blunt', byId);
    hits++;
    rig.step(1.1); // un coup toutes les 1,1 s
  }
  return hits;
}

describe('vitrine', () => {
  it('intacte → taguée → fissurée → brisée en trois coups de marteau ; événements, éclats, infractions, tension', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false; // le commerçant est étudié plus bas
    const casseur = rig.person(0, 1.5);
    const shop = ctx.props.addShop({ category: 'telephonie', x: 0, z: 0, heading: 0, width: 6 });
    expect(shop.window).toBe('intact');
    expect(shop.shutter).toBe(0);
    expect(shop.stock).toBeGreaterThan(0.8);
    expect(shop.name.length).toBeGreaterThan(4);

    ctx.props.tag(shop, casseur.id);
    expect(shop.window).toBe('tagged');
    rig.step(3);
    ctx.props.damageShop(shop, MARTEAU, 'blunt', casseur.id);
    expect(shop.window).toBe('cracked');
    expect(rig.ext.shopView(shop)!.glass).toBeLessThan(0.65);
    rig.step(3);
    const more = hammerUntil(rig, shop, casseur.id, () => shop.window === 'broken');
    expect(more).toBe(2); // trois coups en tout : « vitrine brisée en 2 à 6 coups »
    expect(rig.events('shop:window').map((e) => e.state)).toEqual(['tagged', 'cracked', 'broken']);
    expect(rig.events('shop:window').every((e) => e.id === shop.id && e.byId === casseur.id)).toBe(true);
    expect(rig.events('fx').filter((e) => e.id === 'eclats_verre').length).toBe(1);
    expect(rig.events('sfx').filter((e) => e.id === 'verre_brise').length).toBe(1);
    expect(casseur.offenses.map((o) => o.type)).toEqual(['tag', 'degradation', 'degradation']);
    // tension : tag +0,01, fissure +0,01, vitrine brisée +0,03 (table F.4 de la bible de réalisme)
    expect(rig.director.added.map((a) => a.amount)).toEqual([0.01, 0.01, 0.03]);
    expect(rig.ext.stats.windowsBroken).toBe(1);
    // plus rien à casser
    ctx.props.damageShop(shop, 500, 'blunt', casseur.id);
    expect(rig.events('shop:window').length).toBe(3);
  });

  it('un pavé bien lancé suffit pour du verre courant ; le verre feuilleté d\'une banque tient le double', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    const tabac = ctx.props.addShop({ category: 'tabac_presse', x: 0, z: 0, heading: 0, width: 5 });
    ctx.props.damageShop(tabac, PAVE, 'impact', 0);
    expect(tabac.window).toBe('broken');

    const banque = ctx.props.addShop({ category: 'banque', x: 30, z: 0, heading: 0, width: 8 });
    expect(rig.ext.shopView(banque)!.reinforced).toBe(true);
    ctx.props.damageShop(banque, PAVE, 'impact', 0);
    expect(banque.window).toBe('cracked');
    ctx.props.damageShop(banque, PAVE, 'impact', 0);
    expect(banque.window).toBe('broken');
    const bijou = ctx.props.addShop({ category: 'bijouterie', x: 60, z: 0, heading: 0, width: 4 });
    const hits = hammerUntil(rig, bijou, 0, () => bijou.window === 'broken');
    expect(hits).toBeGreaterThanOrEqual(5);
    expect(hits).toBeLessThanOrEqual(7);
    // un coup de bouclier (2 points) ne marque pas le verre ; ni le gaz, ni l'eau
    const mode = ctx.props.addShop({ category: 'mode', x: 90, z: 0, heading: 0, width: 6 });
    for (let i = 0; i < 50; i++) ctx.props.damageShop(mode, 1, 'blunt', 0);
    ctx.props.damageShop(mode, 500, 'gas', 0);
    ctx.props.damageShop(mode, 500, 'water', 0);
    expect(mode.window).toBe('intact');
    expect(rig.ext.shopView(mode)!.glass).toBe(1);
  });

  it('pillage : impossible vitrine intacte, puis chaque passage emporte une charge jusqu\'à vider le stock', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    const pilleur = rig.person(0, 1.5, { profile: 'pilleur' });
    const shop = ctx.props.addShop({ category: 'telephonie', x: 0, z: 0, heading: 0, width: 6, stock: 1 });
    expect(rig.ext.lootable(shop)).toBe(false);
    expect(ctx.props.loot(shop, pilleur.id)).toBe(0);
    ctx.props.damageShop(shop, 200, 'blunt', pilleur.id);
    expect(shop.window).toBe('broken');
    expect(rig.ext.lootable(shop)).toBe(true);
    const loads = rig.ext.shopView(shop)!.lootLeft;
    expect(loads).toBe(30); // 30 charges pour 6 m de vitrine de téléphonie
    const first = ctx.props.loot(shop, pilleur.id);
    expect(first).toBeCloseTo(1 / 30, 9);
    expect(shop.stock).toBeCloseTo(1 - 1 / 30, 9);
    expect(rig.events('shop:looted')).toEqual([{ name: 'shop:looted', id: shop.id, byId: pilleur.id, amount: first }]);
    expect(pilleur.offenses.some((o) => o.type === 'pillage')).toBe(true);
    let total = first;
    let calls = 1;
    while (shop.stock > 0 && calls < 100) {
      rig.step(2);
      total += ctx.props.loot(shop, pilleur.id);
      calls++;
    }
    expect(calls).toBe(30);
    expect(total).toBeCloseTo(1, 6);
    expect(shop.stock).toBe(0);
    expect(ctx.props.loot(shop, pilleur.id)).toBe(0);
    expect(rig.ext.lootable(shop)).toBe(false);
    expect(rig.ext.stats.looted).toBe(30);
    // tension : +0,06 au plus une fois toutes les 20 s pour une même boutique (60 s de pillage → 3 ou 4 hausses)
    const lootTension = rig.director.added.filter((a) => a.reason === 'pillage');
    expect(lootTension.length).toBeGreaterThanOrEqual(3);
    expect(lootTension.length).toBeLessThanOrEqual(4);
    expect(lootTension[0]!.amount).toBeCloseTo(0.06, 9);
  });
});

describe('rideau de fer', () => {
  it('le commerçant baisse son rideau quand la tension monte, d\'autant plus vite qu\'elle est forte', async () => {
    const times: number[] = [];
    for (const tension of [0.4, 0.95]) {
      const rig = await startProps({ seed: 3 });
      const { ctx } = rig;
      const shop = ctx.props.addShop({ category: 'luxe', x: 0, z: 0, heading: 0, width: 8 });
      expect(rig.ext.shopView(shop)!.hasShutter).toBe(true);
      // calme : rien ne bouge
      rig.step(20);
      expect(shop.shutter).toBe(0);
      rig.director.local = () => tension;
      const t0 = ctx.clock.now;
      let moving = -1;
      for (let i = 0; i < 600 && shop.shutter < 1; i++) {
        rig.step(0.1);
        if (moving < 0 && shop.shutter > 0) moving = ctx.clock.now - t0;
      }
      expect(shop.shutter).toBe(1);
      expect(moving).toBeGreaterThan(0.9); // un temps d'hésitation
      times.push(ctx.clock.now - t0);
      // progressif : pas d'un coup
      expect(ctx.clock.now - t0 - moving).toBeGreaterThan(5);
      expect(rig.events('shop:shutter')).toEqual([{ name: 'shop:shutter', id: shop.id, closed: true }]);
    }
    console.log(`[rideau] fermeture complète : ${times[0]!.toFixed(1)} s à tension 0,40 ; ${times[1]!.toFixed(1)} s à tension 0,95`);
    expect(times[1]!).toBeLessThan(12);
    expect(times[0]!).toBeGreaterThan(times[1]! + 6);
    expect(times[0]!).toBeLessThan(40);
  });

  it('chaque catégorie a son sang-froid : la bijouterie ferme, le café reste ouvert à tension moyenne', async () => {
    const rig = await startProps({ seed: 4 });
    const { ctx } = rig;
    const bijou = ctx.props.addShop({ category: 'bijouterie', x: 0, z: 0, heading: 0, width: 4 });
    const cafe = ctx.props.addShop({ category: 'cafe_restaurant', x: 40, z: 0, heading: 0, width: 8, shutter: 0 });
    rig.director.local = () => 0.3;
    rig.step(45);
    expect(bijou.shutter).toBe(1);
    expect(cafe.shutter).toBe(0);
    // la tension locale compte, pas la tension ailleurs
    rig.director.local = (x) => (x > 20 ? 0.9 : 0);
    const banque = ctx.props.addShop({ category: 'luxe', x: 0, z: 30, heading: 0, width: 4 });
    rig.step(20);
    expect(banque.shutter).toBe(0);
  });

  it('baissé, le rideau protège la vitrine et empêche le pillage ; forcé à la longue, il ne protège plus', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const casseur = rig.person(0, 1.5);
    const shop = ctx.props.addShop({ category: 'telephonie', x: 0, z: 0, heading: 0, width: 6, shutter: 1 });
    expect(shop.shutter).toBe(1);
    const forced: unknown[] = [];
    ctx.events.onAny('props:shutter_forced', (e) => forced.push(e));
    for (let i = 0; i < 10; i++) ctx.props.damageShop(shop, MARTEAU, 'blunt', casseur.id);
    expect(shop.window).toBe('intact');
    expect(shop.shutter).toBe(1);
    expect(ctx.props.loot(shop, casseur.id)).toBe(0);
    expect(rig.ext.shopView(shop)!.shutterHealth).toBeCloseTo(1 - 120 / 420, 6);
    const hits = 10 + hammerUntil(rig, shop, casseur.id, () => rig.ext.shopView(shop)!.forced);
    expect(hits).toBe(35); // 420 points de rideau, 12 par coup de marteau : « forcé à la longue »
    expect(shop.shutter).toBeCloseTo(0.3, 6);
    expect(forced).toEqual([{ id: shop.id, byId: casseur.id }]);
    expect(rig.events('shop:shutter')).toEqual([{ name: 'shop:shutter', id: shop.id, closed: false }]);
    expect(shop.window).toBe('intact');
    // la vitrine est maintenant à découvert
    expect(ctx.props.loot(shop, casseur.id)).toBe(0); // encore faut-il la briser
    hammerUntil(rig, shop, casseur.id, () => shop.window === 'broken');
    expect(ctx.props.loot(shop, casseur.id)).toBeGreaterThan(0);
    // un rideau forcé ne se manœuvre plus
    expect(rig.ext.setShutter(shop, true)).toBe(false);
  });

  it('vitrine brisée, rideau qu\'on baisse : le pillage s\'arrête quand il est en bas ; setShutter le relève', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    const shop = ctx.props.addShop({ category: 'luxe', x: 0, z: 0, heading: 0, width: 8 });
    ctx.props.damageShop(shop, 1000, 'blunt', 0);
    expect(ctx.props.loot(shop, 0)).toBeGreaterThan(0);
    expect(rig.ext.setShutter(shop, true)).toBe(true);
    rig.step(3);
    expect(shop.shutter).toBeGreaterThan(0.3);
    expect(shop.shutter).toBeLessThan(0.45);
    expect(ctx.props.loot(shop, 0)).toBeGreaterThan(0); // encore entrouvert
    rig.step(6);
    expect(shop.shutter).toBe(1);
    expect(ctx.props.loot(shop, 0)).toBe(0);
    expect(rig.ext.setShutter(shop, false, true)).toBe(true);
    expect(shop.shutter).toBe(0);
    expect(rig.events('shop:shutter').map((e) => e.closed)).toEqual([true, false]);
  });

  it('la nuit, les boutiques fermées ont le rideau baissé ; le café est encore ouvert', async () => {
    const rig = await startProps({ session: { timeOfDay: 23 } });
    const { ctx } = rig;
    const mode = ctx.props.addShop({ category: 'luxe', x: 0, z: 0, heading: 0, width: 6 });
    const cafe = ctx.props.addShop({ category: 'cafe_restaurant', x: 30, z: 0, heading: 0, width: 6 });
    expect(mode.shutter).toBe(1);
    expect(cafe.shutter).toBe(0);
    expect(shopOpenAt(shopDef('cafe_restaurant'), 0.5)).toBe(true);
    expect(shopOpenAt(shopDef('cafe_restaurant'), 3)).toBe(false);
    expect(shopOpenAt(shopDef('banque'), 12)).toBe(true);
  });

  it('manifestation annoncée tendue : des enseignes exposées ont posé des panneaux de bois qu\'il faut d\'abord arracher', async () => {
    const rig = await startProps({ seed: 9, session: { tension: 0.9 } });
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    const shops: Shop[] = [];
    for (let i = 0; i < 40; i++) shops.push(ctx.props.addShop({ category: 'banque', x: i * 12, z: 0, heading: 0, width: 8 }));
    const boarded = shops.filter((s) => s.window === 'boarded');
    expect(boarded.length).toBeGreaterThan(12);
    expect(boarded.length).toBeLessThan(34);
    const s = boarded[0]!;
    expect(rig.ext.shopView(s)!.boards).toBe(1);
    const hits = hammerUntil(rig, s, 0, () => s.window !== 'boarded');
    expect(hits).toBe(8); // 90 points de bois
    expect(s.window).toBe('intact');
    expect(ctx.props.loot(s, 0)).toBe(0);
    // sans tension annoncée : aucun panneau
    const calm = await startProps({ seed: 9 });
    for (let i = 0; i < 40; i++) expect(calm.ctx.props.addShop({ category: 'banque', x: i * 12, z: 0, heading: 0, width: 8 }).window).toBe('intact');
  });
});

describe('incendie de boutique', () => {
  it('un engin incendiaire lancé dans une vitrine ouverte embrase la boutique : fumée, flammes en façade, stock détruit', async () => {
    const rig = await startProps();
    const { ctx, hazards } = rig;
    rig.ext.tuning.shopkeepers = false;
    const auteur = rig.person(0, 4);
    const shop = ctx.props.addShop({ category: 'mode', x: 0, z: 0, heading: 0, width: 6, stock: 1 });
    // vitrine intacte : l'engin n'entre pas, la chaleur fissure seulement le verre
    ctx.props.damageShop(shop, 40, 'burn', auteur.id);
    expect(shop.burning).toBe(0);
    expect(shop.window).toBe('cracked');
    ctx.props.damageShop(shop, 500, 'blunt', 0);
    ctx.props.damageShop(shop, 40, 'burn', auteur.id);
    expect(shop.burning).toBeGreaterThan(0);
    expect(rig.events('fire:started')).toEqual([{ name: 'fire:started', x: 0, z: 0, targetKind: 'shop', targetId: shop.id, sourceId: auteur.id }]);
    expect(auteur.offenses.map((o) => o.type)).toContain('incendie');
    expect(rig.director.added.some((a) => a.amount === 0.1)).toBe(true);
    rig.step(60, 0.05);
    expect(shop.burning).toBeGreaterThan(0.6);
    expect(ctx.props.loot(shop, 0)).toBe(0); // on n'entre plus
    expect(hazards.totalSmoke()).toBeGreaterThan(20);
    // les flammes sortent côté rue (normale +z)
    expect(hazards.ignites.length).toBeGreaterThan(10);
    expect(hazards.ignites.every((f) => f.z > 0.5 && f.sourceId === auteur.id)).toBe(true);
    const stockAt60 = shop.stock;
    expect(stockAt60).toBeLessThan(0.9);
    rig.step(240, 0.05);
    expect(shop.stock).toBe(0);
    // jusqu'au bout du combustible : boutique calcinée
    let guard = 0;
    while (shop.burning > 0 && guard++ < 200) rig.step(10, 0.05);
    expect(shop.burning).toBe(0);
    expect(rig.ext.shopView(shop)!.burnt).toBe(true);
    expect(rig.events('fire:out')).toEqual([{ name: 'fire:out', x: 0, z: 0, targetKind: 'shop', targetId: shop.id, byId: 0 }]);
    expect(rig.ext.igniteShop(shop, 0)).toBe(false);
    console.log(`[boutique] feu de boutique de 6 m : ${ctx.clock.now.toFixed(0)} s jusqu'à extinction naturelle ; stock restant à 60 s : ${(stockAt60 * 100).toFixed(0)} %`);
  });

  it('un extincteur vient à bout d\'un début de feu, pas d\'un feu développé ; le canon à eau, si', async () => {
    const rig = await startProps();
    const { ctx, hazards } = rig;
    rig.ext.tuning.shopkeepers = false;
    const pompier = rig.person(0, 3, { kind: 'pompier' });
    const mk = (x: number): Shop => {
      const s = ctx.props.addShop({ category: 'mode', x, z: 0, heading: 0, width: 6 });
      ctx.props.damageShop(s, 500, 'blunt', 0);
      expect(rig.ext.igniteShop(s, 0)).toBe(true);
      return s;
    };
    // début de feu : extincteur (1 unité/s) pendant 20 s
    const young = mk(0);
    rig.step(5, 0.05);
    for (let i = 0; i < 400 && young.burning > 0; i++) {
      hazards.douse(0, 0.8, 1.2, 0.05);
      rig.step(0.05, 0.05);
    }
    expect(young.burning).toBe(0);
    expect(rig.events('fire:out').length).toBe(1);
    expect(rig.events('fire:out')[0]!.byId).toBe(pompier.id); // crédité au secouriste le plus proche
    expect(rig.director.added.some((a) => a.amount === -0.04)).toBe(true);

    // feu développé : l'extincteur n'y suffit pas (18 s de charge)
    const old = mk(100);
    rig.step(120, 0.05);
    expect(old.burning).toBeGreaterThan(0.9);
    for (let i = 0; i < 360; i++) {
      hazards.douse(100, 0.8, 1.2, 0.05);
      rig.step(0.05, 0.05);
    }
    expect(old.burning).toBeGreaterThan(0);
    // canon à eau : 3 unités/s, jet large
    let seconds = 0;
    for (let i = 0; i < 1200 && old.burning > 0; i++) {
      hazards.douse(100, 0.8, 3, 0.15);
      rig.step(0.05, 0.05);
      seconds += 0.05;
    }
    expect(old.burning).toBe(0);
    console.log(`[boutique] feu développé éteint au canon à eau en ${seconds.toFixed(1)} s`);
    expect(seconds).toBeGreaterThan(8);
    expect(seconds).toBeLessThan(45);
  });

  it('un feu de rue contre la devanture finit par faire céder la vitre, puis gagne l\'intérieur ; rideau baissé, rien', async () => {
    const rig = await startProps();
    const { ctx, hazards } = rig;
    rig.ext.tuning.shopkeepers = false;
    const open = ctx.props.addShop({ category: 'mode', x: 0, z: 0, heading: 0, width: 6 });
    const closed = ctx.props.addShop({ category: 'luxe', x: 40, z: 0, heading: 0, width: 6, shutter: 1 });
    hazards.fires.push({ x: 0, z: 0.8, radius: 1.5, intensity: 1, sourceId: 0 }, { x: 40, z: 0.8, radius: 1.5, intensity: 1, sourceId: 0 });
    rig.step(40);
    expect(open.window).toBe('cracked');
    expect(open.burning).toBe(0);
    rig.step(60);
    expect(open.window).toBe('broken'); // « une façade après 90 s »
    rig.step(25);
    expect(open.burning).toBeGreaterThan(0);
    expect(closed.window).toBe('intact');
    expect(closed.burning).toBe(0);
  });
});

describe('enseignes', () => {
  it('les noms sont fictifs, variés et déterministes pour une graine', async () => {
    const rig = await startProps({ seed: 21 });
    const rng = rig.ctx.rng.fork('noms');
    const categories = [
      'banque', 'luxe', 'mode', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant', 'restauration_rapide',
      'pharmacie', 'tabac_presse', 'telephonie', 'agence', 'hotel', 'autre', 'categorie_inconnue',
    ];
    const names = new Set<string>();
    for (const c of categories) {
      for (let i = 0; i < 20; i++) {
        const name = shopName(c, rng);
        expect(name.length, c).toBeGreaterThan(5);
        names.add(name);
      }
    }
    expect(names.size).toBeGreaterThan(150);
    expect(rig.ext.shopName('banque', 7)).toBe(rig.ext.shopName('banque', 7));
    expect(/^(Banque|Crédit|Comptoir Financier|Caisse Lutétienne) /.test(rig.ext.shopName('banque', 7))).toBe(true);
    // l'attrait suit la bible de réalisme : luxe, bijouterie, téléphonie, banque en tête
    const appeal = (c: string): number => shopDef(c).appeal;
    for (const top of ['luxe', 'bijouterie', 'telephonie', 'banque']) {
      for (const low of ['mode', 'supermarche', 'alimentation', 'pharmacie', 'cafe_restaurant', 'hotel', 'autre']) {
        expect(appeal(top), `${top} > ${low}`).toBeGreaterThan(appeal(low));
      }
    }
    const a = rig.ctx.props.addShop({ category: 'luxe', x: 0, z: 0, heading: 0, width: 5 });
    const b = rig.ctx.props.addShop({ category: 'pharmacie', x: 20, z: 0, heading: 0, width: 5 });
    expect(a.appeal).toBeGreaterThan(0.85);
    expect(b.appeal).toBeLessThan(0.3);
    // un nom imposé est respecté
    expect(rig.ctx.props.addShop({ category: 'autre', x: 40, z: 0, heading: 0, width: 5, name: 'Chez Zélie' }).name).toBe('Chez Zélie');
  });
});
