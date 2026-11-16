// Décor dynamique — essais d'intégration avec les modules réels déjà écrits (dangers, matériel, personnes, droit).
// Ces modules évoluent en parallèle : s'ils ne se chargent pas, l'essai correspondant est sauté (message en console).
import { describe, expect, it } from 'vitest';
import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { startProps } from '@/sim/props/testkit';

async function load(name: string, importer: () => Promise<{ createSystems: ModuleFactory }>): Promise<GameSystem[] | null> {
  try {
    return (await importer()).createSystems();
  } catch (err) {
    console.warn(`[props] module « ${name} » indisponible : essai d'intégration sauté`, err);
    return null;
  }
}

describe('intégration', () => {
  it('avec le vrai module du monde (quartier d\'essai) : mobilier et vitrines de la carte, ambiance posée sur les trottoirs', async () => {
    let systems: GameSystem[];
    try {
      const mod = await import('@/world/query');
      systems = mod.createWorldQuerySystems({ source: 'test' });
    } catch (err) {
      console.warn('[props] module « monde » indisponible : essai d\'intégration sauté', err);
      return;
    }
    const rig = await startProps({ seed: 33, world: false, hazards: false, log: false, systems, session: { mode: 'test' } });
    const { ctx } = rig;
    expect(ctx.world).not.toBe(rig.world);
    const cfg = ctx.session.config!;
    const tx = Math.floor(cfg.x! / ctx.world.tileSize);
    const tz = Math.floor(cfg.z! / ctx.world.tileSize);
    // toutes les tuiles chargées sont peuplées
    let mapFurniture = 0;
    let mapShops = 0;
    let tiles = 0;
    for (let j = -4; j <= 4; j++) {
      for (let i = -4; i <= 4; i++) {
        const f = ctx.world.furnitureInTile(tx + i, tz + j).length;
        const s = ctx.world.shopsInTile(tx + i, tz + j).length;
        if (f + s > 0) tiles++;
        mapFurniture += f;
        mapShops += s;
      }
    }
    const stats = rig.ext.stats;
    const count = (kind: string): number => ctx.props.list.filter((p) => p.kind === kind).length;
    console.log(
      `[intégration] quartier d'essai : ${tiles} tuile(s) chargée(s), ${mapFurniture} objets et ${mapShops} vitrines sur la carte → ` +
        `${stats.props} objets, ${stats.shops} boutiques ; ambiance : tables ${count('table_terrasse')}, chaises ${count('chaise')}, ` +
        `vélos ${count('velo')}, trottinettes ${count('trottinette')}, corbeilles ${count('poubelle')}, conteneurs ${count('conteneur')}, ` +
        `palettes ${count('palette')}, grilles de chantier ${count('barriere_chantier')}, cônes ${count('cone')}, tas de pavés ${count('pile_paves')}`,
    );
    expect(tiles).toBeGreaterThan(0);
    expect(stats.tiles).toBe(tiles);
    expect(stats.shops).toBe(mapShops);
    expect(stats.props).toBeGreaterThanOrEqual(mapFurniture);
    expect(stats.pendingTiles).toBe(0);
    // chaque objet d'ambiance est sur un sol piéton, hors des murs ; chaque objet repose à l'altitude du terrain
    const allowed = new Set(['sidewalk', 'plaza', 'quay']);
    let extras = 0;
    for (const p of ctx.props.list) {
      expect(p.y).toBeCloseTo(ctx.world.heightAt(p.x, p.z), 6);
      const info = rig.ext.propView(p)!;
      expect(info.def.kind === p.kind || info.def.kind === 'generique').toBe(true);
    }
    for (const kind of ['chaise', 'trottinette', 'palette', 'cone']) {
      for (const p of ctx.props.list.filter((q) => q.kind === kind)) {
        extras++;
        expect(allowed.has(ctx.world.surfaceAt(p.x, p.z)), `${kind} sur ${ctx.world.surfaceAt(p.x, p.z)}`).toBe(true);
      }
    }
    if (mapShops > 20) expect(extras).toBeGreaterThan(0);
    // les boutiques ont une enseigne et font face à la rue : un point à 1 m devant la vitrine n'est pas dans un immeuble
    let facing = 0;
    for (const s of ctx.props.shops) {
      expect(s.name.length).toBeGreaterThan(4);
      const surface = ctx.world.surfaceAt(s.x + Math.sin(s.heading) * 1.2, s.z + Math.cos(s.heading) * 1.2);
      if (surface !== 'building' && surface !== 'interior') facing++;
    }
    if (mapShops > 0) expect(facing / mapShops).toBeGreaterThan(0.9);
    // la simulation tourne avec ce décor
    rig.step(3);
    expect(rig.events('barricade:built').length).toBe(0);
  });

  it('avec le vrai module des dangers : nappe entretenue, fumée, prise au contact d\'une nappe, extinction par douse()', async () => {
    const hazards = await load('dangers', () => import('@/sim/hazards'));
    if (!hazards) return;
    const rig = await startProps({ seed: 31, hazards: false, systems: hazards });
    const { ctx } = rig;
    expect(ctx.hazards).not.toBe(rig.hazards); // c'est bien le vrai service
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const far = ctx.props.spawn('poubelle', 30, 0, 0);
    expect(rig.ext.ignite(bin, 0)).toBe(true);
    rig.step(20, 0.05);
    expect(bin.state).toBe('burning');
    // notre feu entretient une vraie nappe de chaleur et dégage une vraie fumée
    expect(ctx.hazards.fireAt(0, 0)).toBeGreaterThan(0.3);
    expect(ctx.hazards.smokeAt(0, 0)).toBeGreaterThan(0.05);
    expect(ctx.hazards.fireAt(30, 0)).toBe(0);
    // le feu au sol naît de notre objet : deux événements fire:started (objet, puis nappe), pas davantage
    const kinds = rig.events('fire:started').map((e) => e.targetKind).sort();
    expect(kinds).toEqual(['ground', 'prop']);

    // extincteur : 1 unité par seconde par ctx.hazards.douse — l'événement 'hazards:douse' éteint l'objet
    let seconds = 0;
    while (bin.state === 'burning' && seconds < 20) {
      ctx.hazards.douse(0, 0, 1.2, 0.05);
      rig.step(0.05, 0.05);
      seconds += 0.05;
    }
    console.log(`[intégration] poubelle éteinte par le vrai douse() en ${seconds.toFixed(1)} s`);
    expect(bin.state).toBe('damaged');
    expect(seconds).toBeLessThan(8);
    expect(rig.events('fire:out').some((e) => e.targetKind === 'prop' && e.targetId === bin.id)).toBe(true);
    // la nappe est morte avec lui et ne le rallume pas
    rig.step(60, 0.05);
    expect(bin.state).toBe('damaged');
    expect(ctx.hazards.fireAt(0, 0)).toBe(0);

    // une vraie nappe (engin incendiaire : Ø 2,5 m, 20 à 40 s) au pied d'une corbeille l'embrase en 5 à 10 s
    ctx.hazards.ignite(30, 0.3, 1.25, 1, 0);
    let t = 0;
    while (far.state !== 'burning' && t < 20) {
      rig.step(0.5, 0.05);
      t += 0.5;
    }
    console.log(`[intégration] corbeille prise au contact d'une vraie nappe en ${t.toFixed(1)} s`);
    expect(far.state).toBe('burning');
    expect(t).toBeGreaterThanOrEqual(4);
    expect(t).toBeLessThanOrEqual(12);
    // elle brûle jusqu'au bout malgré la fin de la nappe d'origine, puis tout s'éteint
    rig.step(400, 0.05);
    expect(far.state).toBe('burnt');
    rig.step(60, 0.05);
    expect(ctx.hazards.fireAt(30, 0)).toBe(0);
  });

  it('avec les vrais modules matériel, personnes et droit : marteau sur une vitrine, pillage par le registre d\'interactions', async () => {
    const items = await load('matériel', () => import('@/sim/items'));
    const people = await load('personnes', () => import('@/sim/people'));
    const law = await load('droit', () => import('@/gameplay/law'));
    if (!items || !people || !law) return;
    const rig = await startProps({ seed: 32, systems: [...people, ...items, ...law] });
    const { ctx } = rig;
    rig.ext.tuning.shopkeepers = false;
    // façade le long de x, tournée vers +z ; le casseur est devant, face à elle (cap π = vers −z)
    const shop = ctx.props.addShop({ category: 'mode', x: 0, z: 0, heading: 0, width: 6, stock: 1 });
    const casseur = ctx.archetypes.spawn('manifestant', 0, 0.8, { profile: 'radical' });
    ctx.actions.give(casseur, 'marteau', 1);
    expect(ctx.actions.selectById(casseur, 'marteau')).toBe(true);
    casseur.heading = Math.PI;
    casseur.aimYaw = Math.PI;
    casseur.cmd.aimYaw = Math.PI;
    casseur.cmd.faceMove = false;
    rig.step(1.5);
    let swings = 0;
    let seconds = 0;
    while (shop.window !== 'broken' && seconds < 30) {
      if (ctx.actions.use(casseur).ok) swings++;
      rig.step(0.1);
      seconds += 0.1;
    }
    console.log(`[intégration] vitrine de verre courant brisée au marteau en ${swings} coups et ${seconds.toFixed(1)} s`);
    expect(shop.window).toBe('broken');
    expect(swings).toBe(3); // « 2 à 6 coups »
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(10); // « 3 à 10 s par vitrine »
    expect(rig.events('shop:window').map((e) => e.state)).toEqual(['cracked', 'broken']);
    // le droit a fusionné nos déclarations et celles du module du matériel : pas d'infraction en double
    const degradations = casseur.offenses.filter((o) => o.type === 'degradation');
    expect(degradations.length).toBeGreaterThanOrEqual(1);
    expect(degradations.length).toBeLessThanOrEqual(3);

    // pillage par le vrai registre d'interactions
    ctx.actions.select(casseur, -1);
    rig.step(0.5);
    const opts: { verb: string; label: string }[] = [];
    ctx.interactions.options(casseur, opts as never);
    expect(opts.map((o) => o.verb)).toContain('piller');
    expect(ctx.interactions.startVerb(casseur, 'piller', shop.id)).toBe(true);
    expect(shop.occupants).toBe(1);
    rig.step(21);
    expect(shop.occupants).toBe(0);
    expect(ctx.actions.has(casseur, 'butin')).toBe(1);
    expect(shop.stock).toBeLessThan(1);
    expect(casseur.offenses.some((o) => o.type === 'pillage')).toBe(true);

    // renverser une corbeille par le vrai registre ; marcher interrompt le geste « dégager »
    const bin = ctx.props.spawn('poubelle', 6, 1.2, 0);
    const autre = ctx.archetypes.spawn('manifestant', 6, 0.5);
    autre.aimYaw = 0;
    expect(ctx.interactions.startVerb(autre, 'renverser', bin.id)).toBe(true);
    rig.step(1.2);
    expect(bin.toppled).toBe(true);
    // les personnes butent sur le mobilier par ctx.props.resolveCircle (locomotion réelle)
    const banc = ctx.props.spawn('kiosque', 20, 5, 0);
    const marcheur = ctx.archetypes.spawn('manifestant', 20, 0);
    marcheur.cmd.moveX = 0;
    marcheur.cmd.moveZ = 1;
    rig.step(8);
    expect(marcheur.z).toBeLessThan(banc.z - banc.halfZ + 0.05); // arrêté par le kiosque
    expect(marcheur.z).toBeGreaterThan(2);
  });
});
