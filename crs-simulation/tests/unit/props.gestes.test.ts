// Décor dynamique — gestes d'interaction : renverser, pousser, porter, dépaver, ramasser, piller, dégager, éteindre, incendier.
import { describe, expect, it } from 'vitest';
import type { InteractionOption, Person } from '@/core/contracts';
import { startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

function verbs(rig: PropsRig, actor: Person): string[] {
  const out: InteractionOption[] = [];
  rig.ctx.interactions.options(actor, out);
  return out.map((o) => o.verb);
}

function optionFor(rig: PropsRig, actor: Person, verb: string): InteractionOption | undefined {
  const out: InteractionOption[] = [];
  rig.ctx.interactions.options(actor, out);
  return out.find((o) => o.verb === verb);
}

describe('dépavage', () => {
  it('sur chaussée pavée : 7 s pour desceller, deux pavés en main, le reste en tas pour les suivants', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.world.surface = (x) => (x < 10 ? 'sett' : 'road');
    const radical = rig.person(0, 0, { profile: 'radical' });
    const crs = rig.person(1, 0, { kind: 'crs' });
    const ailleurs = rig.person(20, 0);
    expect(verbs(rig, crs)).not.toContain('depaver'); // pas proposé aux forces de l'ordre
    expect(verbs(rig, ailleurs)).not.toContain('depaver'); // bitume : rien à desceller
    const opt = optionFor(rig, radical, 'depaver')!;
    expect(opt.label).toBe('Dépaver la chaussée');
    expect(opt.duration).toBe(7);
    expect(opt.targetKind).toBe('place');
    expect(ctx.interactions.startVerb(radical, 'depaver', 0)).toBe(true);
    expect(radical.upper).toBe('pickup');
    rig.step(6.5);
    expect(ctx.actions.has(radical, 'pave')).toBe(0);
    rig.step(0.7);
    expect(ctx.actions.has(radical, 'pave')).toBe(2);
    expect(radical.upper).toBe('none');
    expect(radical.offenses.map((o) => o.type)).toEqual(['degradation']);
    expect(rig.director.added.map((a) => a.reason)).toEqual(['dépavage']);
    expect(rig.events('fx').some((e) => e.id === 'poussiere')).toBe(true);
    // les huit autres pavés descellés forment un petit tas qu'on enjambe
    const piles = ctx.props.list.filter((p) => p.kind === 'pile_paves');
    expect(piles.length).toBe(1);
    const pile = piles[0]!;
    expect(rig.ext.propView(pile)!.yieldLeft).toBe(8);
    expect(pile.blocksMove).toBe(false);
    expect(Math.hypot(pile.x, pile.z)).toBeLessThan(1.2);

    // un autre se sert dans le tas : 1,5 s pour deux pavés
    const second = rig.person(pile.x, pile.z - 0.8);
    const take = optionFor(rig, second, 'depaver')!;
    expect(take.label).toBe('Prendre des pavés');
    expect(take.targetId).toBe(pile.id);
    expect(take.duration).toBe(1.5);
    for (let i = 0; i < 3; i++) {
      expect(ctx.interactions.startVerb(second, 'depaver', pile.id)).toBe(true);
      rig.step(1.6);
    }
    expect(ctx.actions.has(second, 'pave')).toBe(6);
    expect(rig.ext.propView(pile)!.yieldLeft).toBe(2);
    expect(verbs(rig, second)).not.toContain('depaver'); // mains pleines (6 pavés)
    // le premier vide le tas : il disparaît
    radical.x = pile.x;
    radical.z = pile.z + 0.8;
    radical.aimYaw = Math.PI;
    expect(ctx.interactions.startVerb(radical, 'depaver', pile.id)).toBe(true);
    rig.step(1.6);
    expect(ctx.actions.has(radical, 'pave')).toBe(4);
    expect(ctx.props.get(pile.id)).toBeUndefined();
  });

  it('avec une barre : 4 s ; un carré de chaussée s\'épuise après trois dépavages ; un tas de chantier en donne beaucoup', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.world.surface = () => 'sett';
    const p = rig.person(0.5, 0.5);
    ctx.actions.give(p, 'barre', 1);
    expect(optionFor(rig, p, 'depaver')!.duration).toBe(4);
    let digs = 0;
    for (let i = 0; i < 6; i++) {
      ctx.actions.remove(p, 'pave'); // il lance ses pavés entre deux
      for (const pile of ctx.props.list.filter((q) => q.kind === 'pile_paves')) ctx.props.remove(pile.id);
      if (!ctx.interactions.startVerb(p, 'depaver', 0)) break;
      rig.step(4.1);
      digs++;
    }
    expect(digs).toBe(3); // 30 pavés par carré de 2 m
    // deux mètres plus loin, la chaussée est intacte
    p.x = 3.5;
    expect(verbs(rig, p)).toContain('depaver');

    // tas de pavés d'un chantier (60 pavés) : il ne disparaît pas de sitôt
    const calm = await startProps();
    const q = calm.person(0, -0.9);
    const stock = calm.ctx.props.spawn('pile_paves', 0, 0, 0);
    expect(calm.ext.propView(stock)!.yieldLeft).toBe(60);
    expect(calm.ctx.interactions.startVerb(q, 'depaver', stock.id)).toBe(true);
    calm.step(1.6);
    expect(calm.ctx.actions.has(q, 'pave')).toBe(2);
    expect(calm.ext.propView(stock)!.yieldLeft).toBe(58);
    expect(q.offenses.length).toBe(0); // prendre des pavés n'est pas encore une infraction ; les lancer, si
  });

  it('ramasser : bouteilles d\'une colonne à verre, barre d\'un échafaudage', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const p = rig.person(0, -1.2);
    const colonne = ctx.props.spawn('colonne_verre', 0, 0, 0);
    const opt = optionFor(rig, p, 'ramasser')!;
    expect(opt.label).toBe('Prendre des bouteilles');
    expect(opt.targetId).toBe(colonne.id);
    expect(ctx.interactions.startVerb(p, 'ramasser', colonne.id)).toBe(true);
    rig.step(2.6);
    expect(ctx.actions.has(p, 'bouteille')).toBe(2);
    expect(rig.ext.propView(colonne)!.yieldLeft).toBe(38);
    ctx.interactions.startVerb(p, 'ramasser', colonne.id);
    rig.step(2.6);
    expect(ctx.actions.has(p, 'bouteille')).toBe(4);
    expect(verbs(rig, p)).not.toContain('ramasser'); // quatre bouteilles : il n'en porte pas plus
    const q = rig.person(30, -0.9);
    ctx.props.spawn('echafaudage', 30, 0, 0);
    expect(optionFor(rig, q, 'ramasser')!.label).toBe('Arracher une barre');
    ctx.interactions.startVerb(q, 'ramasser', optionFor(rig, q, 'ramasser')!.targetId);
    rig.step(5.1);
    expect(ctx.actions.has(q, 'barre')).toBe(1);
  });
});

describe('renverser, pousser, porter', () => {
  it('renverser une poubelle : 0,8 s, elle tombe du côté opposé ; pousser : immédiat ; porter puis poser', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const p = rig.person(0, -0.7);
    p.aimYaw = 0;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const list = verbs(rig, p);
    expect(list).toContain('renverser');
    expect(list).toContain('pousser');
    expect(list).toContain('porter');
    expect(list.indexOf('renverser')).toBeLessThan(list.indexOf('pousser')); // priorité à « renverser »
    const opt = optionFor(rig, p, 'renverser')!;
    expect(opt.label).toBe('Renverser la poubelle');
    expect(opt.duration).toBeCloseTo(0.8);
    expect(ctx.interactions.startVerb(p, 'renverser', bin.id)).toBe(true);
    rig.step(0.9);
    expect(bin.toppled).toBe(true);
    rig.step(1);
    expect(bin.z).toBeGreaterThan(0.25); // tombée vers le nord, à l'opposé de celui qui pousse
    expect(Math.abs(bin.x)).toBeLessThan(0.05);
    expect(rig.events('prop:moved').some((e) => e.id === bin.id && e.byId === p.id)).toBe(true);
    expect(rig.events('sfx').some((e) => e.id === 'tole')).toBe(true);
    expect(rig.director.added.map((a) => a.reason)).toEqual(['mobilier renversé']);
    expect(verbs(rig, p)).not.toContain('renverser'); // déjà à terre
    // dégager : la redresser
    p.z = bin.z - 1.0;
    const up = optionFor(rig, p, 'degager')!;
    expect(up.label).toBe('Redresser la poubelle');
    ctx.interactions.startVerb(p, 'degager', bin.id);
    rig.step(1.6);
    expect(bin.toppled).toBe(false);
    expect(bin.height).toBeCloseTo(1.0, 6);

    // pousser : une bourrade, puis un temps mort
    const bac = ctx.props.spawn('conteneur', 10, 0, 0);
    const q = rig.person(10, -0.8);
    q.aimYaw = 0;
    expect(ctx.interactions.startVerb(q, 'pousser', bac.id)).toBe(true);
    expect(bac.vz).toBeGreaterThan(1.5);
    expect(verbs(rig, q)).not.toContain('pousser');
    rig.step(2);
    expect(bac.z).toBeGreaterThan(0.5);
    expect(verbs(rig, q)).toContain('pousser');

    // porter une chaise, la poser plus loin
    const chair = ctx.props.spawn('chaise', 20, 0, 0);
    const r = rig.person(20, -0.6);
    expect(optionFor(rig, r, 'porter')!.label).toBe('Porter la chaise');
    ctx.interactions.startVerb(r, 'porter', chair.id);
    rig.step(0.7);
    expect(chair.carriedBy).toBe(r.id);
    expect(verbs(rig, r)).toEqual(['deposer']); // les mains prises : plus rien d'autre
    r.x = 25;
    r.z = 3;
    rig.step(0.1);
    expect(ctx.interactions.startVerb(r, 'deposer', chair.id)).toBe(true);
    expect(chair.carriedBy).toBe(0);
    expect(Math.hypot(chair.x - 25, chair.z - 3)).toBeLessThan(1);
    // un bac roulant se tire
    r.x = bac.x;
    r.z = bac.z - 0.8;
    expect(optionFor(rig, r, 'porter')!.label).toBe('Tirer le conteneur');
  });

  it('une personne à terre, interpellée ou en véhicule ne peut rien faire', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    ctx.props.spawn('poubelle', 0, 0, 0);
    const p = rig.person(0, -0.7);
    expect(verbs(rig, p).length).toBeGreaterThan(0);
    p.custody = 'cuffed';
    expect(verbs(rig, p)).toEqual([]);
    p.custody = 'free';
    ctx.health.setDown(p, true);
    expect(verbs(rig, p)).toEqual([]);
  });
});

describe('pillage', () => {
  it('piller : 20 s dans la boutique, compteur d\'occupants, une charge de butin, infraction', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    const shop = ctx.props.addShop({ category: 'telephonie', x: 0, z: 0, heading: 0, width: 3.2, stock: 1, name: 'Allô Essai Mobiles' });
    const a = rig.person(-0.8, 1.2, { profile: 'pilleur' });
    const b = rig.person(0, 1.2, { profile: 'pilleur' });
    const c = rig.person(0.8, 1.2, { profile: 'pilleur' });
    const crs = rig.person(0, 1.8, { kind: 'crs' });
    expect(verbs(rig, a)).not.toContain('piller'); // vitrine intacte
    ctx.props.damageShop(shop, 500, 'blunt', 0);
    const opt = optionFor(rig, a, 'piller')!;
    expect(opt.label).toBe('Piller « Allô Essai Mobiles »');
    expect(opt.targetKind).toBe('shop');
    expect(opt.duration).toBeCloseTo(20, 6);
    expect(verbs(rig, crs)).not.toContain('piller');
    expect(ctx.interactions.startVerb(a, 'piller', shop.id)).toBe(true);
    expect(shop.occupants).toBe(1);
    expect(ctx.interactions.startVerb(b, 'piller', shop.id)).toBe(true);
    expect(shop.occupants).toBe(2);
    // 3,2 m de vitrine : deux personnes à la fois
    expect(rig.ext.shopView(shop)!.maxOccupants).toBe(2);
    expect(ctx.interactions.startVerb(c, 'piller', shop.id)).toBe(false);
    rig.step(10);
    expect(ctx.actions.has(a, 'butin')).toBe(0);
    // l'un renonce : il ressort les mains vides
    ctx.interactions.cancel(b);
    expect(shop.occupants).toBe(1);
    expect(ctx.interactions.startVerb(c, 'piller', shop.id)).toBe(true);
    rig.step(10.2);
    expect(ctx.actions.has(a, 'butin')).toBe(1);
    expect(ctx.actions.has(b, 'butin')).toBe(0);
    expect(shop.occupants).toBe(1);
    expect(a.offenses.map((o) => o.type)).toEqual(['pillage']);
    expect(rig.events('shop:looted').map((e) => e.byId)).toEqual([a.id]);
    expect(shop.stock).toBeLessThan(1);
    rig.step(10.2);
    expect(ctx.actions.has(c, 'butin')).toBe(1);
    expect(shop.occupants).toBe(0);
    // le rideau tombe pendant qu'on est dedans : le pillage est interrompu
    expect(ctx.interactions.startVerb(a, 'piller', shop.id)).toBe(true);
    rig.ext.setShutter(shop, true, true);
    rig.step(0.2);
    expect(ctx.interactions.current(a)).toBeNull();
    expect(shop.occupants).toBe(0);
    expect(ctx.actions.has(a, 'butin')).toBe(1);
  });

  it('vitrine brisée sous ses yeux : le commerçant ferme en urgence, sauf si des pilleurs sont déjà entrés', async () => {
    // les deux issues existent (une fois sur deux il est déjà parti) : on cherche une graine de chaque sorte
    let closed = 0;
    let stayedOpen = 0;
    let interrupted = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rig = await startProps({ seed });
      const { ctx } = rig;
      const shop = ctx.props.addShop({ category: 'luxe', x: 0, z: 0, heading: 0, width: 8 });
      ctx.props.damageShop(shop, 1000, 'blunt', 0);
      if (seed % 2 === 0) {
        // des pilleurs entrent aussitôt
        const p = rig.person(0, 1.2);
        expect(ctx.interactions.startVerb(p, 'piller', shop.id)).toBe(true);
        rig.step(19);
        expect(shop.shutter).toBeLessThan(0.5);
        interrupted++;
        continue;
      }
      rig.step(25);
      if (shop.shutter === 1) closed++;
      else {
        expect(shop.shutter).toBe(0);
        stayedOpen++;
      }
    }
    expect(interrupted).toBe(6);
    expect(closed).toBeGreaterThan(0);
    expect(stayedOpen).toBeGreaterThan(0);
  });
});

describe('feu : éteindre et incendier', () => {
  it('éteindre : extincteur en main, jet continu, feu de poubelle éteint en quelques secondes, charge entamée', async () => {
    const rig = await startProps();
    const { ctx, hazards } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    rig.ext.ignite(bin, 0);
    rig.step(30, 0.05);
    const crs = rig.person(0, -2.5, { kind: 'crs', poste: 'extincteur' });
    crs.aimYaw = 0;
    expect(verbs(rig, crs)).not.toContain('eteindre'); // sans extincteur en main
    const stack = ctx.actions.give(crs, 'extincteur', 1);
    expect(ctx.actions.selectById(crs, 'extincteur')).toBe(true);
    const opt = optionFor(rig, crs, 'eteindre')!;
    expect(opt.label).toBe('Éteindre le feu');
    expect(opt.targetId).toBe(bin.id);
    rig.clearLog();
    expect(ctx.interactions.startVerb(crs, 'eteindre', bin.id)).toBe(true);
    expect(crs.upper).toBe('extinguish');
    let seconds = 0;
    while (bin.state === 'burning' && seconds < 20) {
      rig.step(0.1, 0.05);
      seconds += 0.1;
    }
    console.log(`[gestes] feu de poubelle éteint à l'extincteur en ${seconds.toFixed(1)} s`);
    expect(bin.state).toBe('damaged');
    expect(seconds).toBeGreaterThan(2);
    expect(seconds).toBeLessThan(8);
    expect(rig.events('fire:out')).toEqual([{ name: 'fire:out', x: 0, z: 0, targetKind: 'prop', targetId: bin.id, byId: crs.id }]);
    expect(stack.state).toBeLessThan(1);
    expect(stack.state).toBeCloseTo(1 - seconds / 18, 1);
    expect(hazards.douses.length).toBeGreaterThan(30); // ctx.hazards.douse à chaque pas : nappe, fumée, gaz rabattus aussi
    expect(rig.events('fx').some((e) => e.id === 'poudre')).toBe(true);
    expect(rig.events('sfx').some((e) => e.id === 'extincteur')).toBe(true);
    rig.step(0.2);
    expect(ctx.interactions.current(crs)).toBeNull(); // plus de feu : le geste s'arrête
    expect(crs.upper).toBe('none');
    // extincteur vide : plus de geste possible
    stack.state = 0;
    const other = ctx.props.spawn('poubelle', 0, -4.5, 0);
    rig.ext.ignite(other, 0);
    expect(verbs(rig, crs)).not.toContain('eteindre');
  });

  it('éteindre fonctionne aussi avec les dangers neutres du cœur (aucun événement hazards:douse)', async () => {
    const rig = await startProps({ hazards: false });
    const { ctx } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    rig.ext.ignite(bin, 0);
    rig.step(30, 0.05);
    const crs = rig.person(0, -2, { kind: 'crs' });
    ctx.actions.give(crs, 'extincteur', 1);
    ctx.actions.selectById(crs, 'extincteur');
    expect(ctx.interactions.startVerb(crs, 'eteindre', bin.id)).toBe(true);
    rig.step(8, 0.05);
    expect(bin.state).toBe('damaged');
  });

  it('incendier : un manifestant met le feu à une poubelle en quelques secondes ; pas un agent', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const radical = rig.person(0, -0.8, { profile: 'radical' });
    const crs = rig.person(0.8, 0, { kind: 'crs' });
    expect(verbs(rig, crs)).not.toContain('incendier');
    const opt = optionFor(rig, radical, 'incendier')!;
    expect(opt.label).toBe('Incendier la poubelle');
    expect(opt.duration).toBeCloseTo(4.8, 6); // « allumage 5 à 10 s » pour le plastique
    ctx.interactions.startVerb(radical, 'incendier', bin.id);
    rig.step(4);
    expect(bin.state).toBe('intact');
    rig.step(1);
    expect(bin.state).toBe('burning');
    expect(radical.offenses.map((o) => o.type)).toEqual(['incendie']);
    expect(rig.events('fire:started')[0]!.sourceId).toBe(radical.id);
    // boutique ouverte : huit secondes
    rig.ext.tuning.shopkeepers = false;
    const shop = ctx.props.addShop({ category: 'mode', x: 30, z: 0, heading: 0, width: 6, name: 'Le Vestiaire d\'Essai' });
    const other = rig.person(30, 1.2, { profile: 'radical' });
    expect(verbs(rig, other)).not.toContain('incendier');
    ctx.props.damageShop(shop, 500, 'blunt', 0);
    expect(optionFor(rig, other, 'incendier')!.label).toBe('Incendier « Le Vestiaire d\'Essai »');
    ctx.interactions.startVerb(other, 'incendier', shop.id);
    rig.step(8.1);
    expect(shop.burning).toBeGreaterThan(0);
  });
});
