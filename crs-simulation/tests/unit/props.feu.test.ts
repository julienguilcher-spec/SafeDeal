// Décor dynamique — feu des objets : prise de feu, combustion, fumée, chaleur, propagation, extinction, batteries.
import { describe, expect, it } from 'vitest';
import type { Prop } from '@/core/contracts';
import { startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

const DT = 0.05;

/** Avance jusqu'à ce que la condition soit vraie ; retourne le temps écoulé (s), ou Infinity. */
function until(rig: PropsRig, cond: () => boolean, limit: number, chunk = 1): number {
  const t0 = rig.ctx.clock.now;
  while (!cond()) {
    if (rig.ctx.clock.now - t0 >= limit) return Infinity;
    rig.step(chunk, DT);
  }
  return rig.ctx.clock.now - t0;
}

describe('feu des objets', () => {
  it('une poubelle incendiée brûle, propage le feu au conteneur voisin, puis les deux s\'éteignent calcinés', async () => {
    const rig = await startProps({ seed: 2 });
    const { ctx, hazards } = rig;
    const auteur = rig.person(-1.2, 0);
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const bac = ctx.props.spawn('conteneur', 1.65, 0, 0); // 0,8 m d'écart bord à bord
    const loin = ctx.props.spawn('conteneur', 8, 0, 0); // hors d'atteinte
    const banc = ctx.props.spawn('barriere_vauban', 0, 0.8, 0); // acier : ne brûle pas
    expect(rig.ext.ignite(bin, auteur.id)).toBe(true);
    expect(rig.ext.ignite(bin, auteur.id)).toBe(false); // déjà en feu
    expect(rig.ext.ignite(banc, auteur.id)).toBe(false); // incombustible
    expect(bin.state).toBe('burning');
    expect(bin.burning).toBeGreaterThan(0);
    expect(rig.events('fire:started')).toEqual([{ name: 'fire:started', x: 0, z: 0, targetKind: 'prop', targetId: bin.id, sourceId: auteur.id }]);
    expect(rig.events('fx').some((e) => e.id === 'feu')).toBe(true);
    expect(auteur.offenses.map((o) => o.type)).toEqual(['incendie']);
    expect(rig.director.added).toEqual([{ amount: 0.04, x: 0, z: 0, reason: 'feu de mobilier' }]);

    // montée en puissance en une demi-minute
    rig.step(10, DT);
    const early = bin.burning;
    expect(early).toBeGreaterThan(0.3);
    expect(early).toBeLessThan(0.8);
    rig.step(20, DT);
    expect(bin.burning).toBeGreaterThan(0.95);
    // fumée noire et épaisse, chaleur entretenue par une nappe (ctx.hazards.ignite) au pied de l'objet
    expect(hazards.smoke.length).toBeGreaterThan(20);
    expect(hazards.smoke.every((s) => s.color === 0x141414 && Math.hypot(s.x, s.z) < 0.01)).toBe(true);
    expect(hazards.ignites.length).toBeGreaterThanOrEqual(8);
    expect(hazards.ignites[hazards.ignites.length - 1]!.intensity).toBeGreaterThan(0.6);
    expect(hazards.ignites.every((f) => f.sourceId === auteur.id)).toBe(true);
    expect(hazards.fireAt(0, 0)).toBeGreaterThan(0.6);
    expect(bac.state).toBe('intact');
    expect(rig.ext.propView(bac)!.heat).toBeGreaterThan(0.1);

    // propagation : « gagne un objet à moins de 1,5 m après 60 s »
    const spread = 30 + until(rig, () => bac.state === 'burning', 120);
    console.log(`[feu] le conteneur à 0,8 m prend ${spread.toFixed(0)} s après l'allumage de la poubelle`);
    expect(spread).toBeGreaterThan(35);
    expect(spread).toBeLessThan(100);
    const started = rig.events('fire:started');
    expect(started.length).toBe(2);
    expect(started[1]).toMatchObject({ targetKind: 'prop', targetId: bac.id, sourceId: auteur.id });
    // le feu qui se propage n'est pas une infraction nouvelle, mais il pèse sur la tension
    expect(auteur.offenses.length).toBe(1);
    expect(rig.director.added.map((a) => a.amount)).toEqual([0.04, 0.02]);

    // la poubelle brûle 4 à 6 minutes, le conteneur 7 à 12
    const binOut = spread + until(rig, () => bin.state === 'burnt', 600, 5);
    expect(binOut).toBeGreaterThan(200);
    expect(binOut).toBeLessThan(380);
    expect(bin.burning).toBe(0);
    expect(bin.fuel).toBe(0);
    expect(bin.height).toBeCloseTo(0.25, 6); // le plastique a fondu en flaque
    expect(bin.blocksMove).toBe(false);
    expect(bac.state).toBe('burning');
    const bacOut = binOut + until(rig, () => bac.state === 'burnt', 900, 5);
    console.log(`[feu] poubelle calcinée à ${binOut.toFixed(0)} s, conteneur à ${bacOut.toFixed(0)} s`);
    expect(bacOut - spread).toBeGreaterThan(400);
    expect(bacOut - spread).toBeLessThan(800);
    const out = rig.events('fire:out');
    expect(out.map((e) => e.targetId)).toEqual([bin.id, bac.id]);
    expect(out.every((e) => e.targetKind === 'prop' && e.byId === 0)).toBe(true);
    expect(rig.events('prop:damaged').filter((e) => e.state === 'burnt').map((e) => e.id)).toEqual([bin.id, bac.id]);
    expect(rig.events('fx').some((e) => e.id === 'trace_brulure')).toBe(true);
    // le conteneur éloigné et la barrière n'ont rien
    expect(loin.state).toBe('intact');
    expect(banc.state).toBe('intact');
    expect(rig.ext.stats.burning).toBe(0);
    expect(rig.ext.stats.firesStarted).toBe(2);
    // une carcasse ne reprend pas
    expect(rig.ext.ignite(bin, 0)).toBe(false);
  });

  it('au contact d\'une nappe de feu (ctx.hazards.fireAt), une corbeille prend en 5 à 10 s ; une palette en 10 à 20 s', async () => {
    const rig = await startProps({ seed: 3 });
    const { ctx, hazards } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const palette = ctx.props.spawn('palette', 20, 0, 0);
    const safe = ctx.props.spawn('poubelle', 40, 0, 0);
    hazards.keepFires = false; // seules nos nappes d'essai comptent
    hazards.fires.push({ x: 0, z: 0.2, radius: 1.25, intensity: 1, sourceId: 0 }, { x: 20, z: 0, radius: 1.25, intensity: 1, sourceId: 0 });
    const tBin = until(rig, () => bin.state === 'burning', 30, 0.5);
    const tPal = tBin + until(rig, () => palette.state === 'burning', 40, 0.5);
    console.log(`[feu] au contact d'une nappe : corbeille ${tBin.toFixed(1)} s, palette ${tPal.toFixed(1)} s`);
    expect(tBin).toBeGreaterThanOrEqual(5);
    expect(tBin).toBeLessThanOrEqual(10);
    expect(tPal).toBeGreaterThanOrEqual(10);
    expect(tPal).toBeLessThanOrEqual(20);
    expect(safe.state).toBe('intact');
    // feu de cause inconnue : pas d'infraction, mais de la tension
    expect(rig.events('law:offense').length).toBe(0);
    expect(rig.director.added.length).toBe(2);
    // une nappe brève (3 s) ne suffit pas, et la chaleur retombe
    const other = ctx.props.spawn('conteneur', 60, 0, 0);
    hazards.fires.push({ x: 60, z: 0, radius: 1.25, intensity: 1, sourceId: 0 });
    rig.step(3, DT);
    hazards.fires.pop();
    const heat = rig.ext.propView(other)!.heat;
    expect(heat).toBeGreaterThan(0.2);
    rig.step(60, DT);
    expect(other.state).toBe('intact');
    expect(rig.ext.propView(other)!.heat).toBe(0);
  });

  it('un engin incendiaire (dégât « burn ») chauffe l\'objet : deux nappes l\'embrasent, et l\'auteur est poursuivi', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const auteur = rig.person(0, 6);
    const bac = ctx.props.spawn('conteneur', 0, 0, 0);
    ctx.props.damage(bac, 15, 'burn', auteur.id); // nappe d'un cocktail (src/sim/items)
    expect(bac.state).toBe('intact');
    expect(rig.ext.propView(bac)!.heat).toBeCloseTo(15 / 34, 6);
    ctx.props.damage(bac, 15, 'burn', auteur.id);
    ctx.props.damage(bac, 15, 'burn', auteur.id);
    expect(bac.state).toBe('burning');
    expect(auteur.offenses.map((o) => o.type)).toEqual(['incendie']);
    // les étincelles d'un mortier qui éclate au sol peuvent allumer une corbeille
    const bin = ctx.props.spawn('poubelle', 30, 0, 0);
    for (let i = 0; i < 6 && bin.state !== 'burning'; i++) {
      ctx.events.emit('explosion', { kind: 'mortier', x: 30.3, y: 0.3, z: 0, radius: 6, sourceId: auteur.id });
    }
    expect(bin.state === 'burning' || bin.state === 'broken').toBe(true);
  });

  it('extinction à l\'extincteur (événement hazards:douse) : quelques secondes, objet endommagé, mouillé un moment', async () => {
    const rig = await startProps({ seed: 4 });
    const { ctx, hazards } = rig;
    const crs = rig.person(2, 0, { kind: 'crs' });
    const bac = ctx.props.spawn('conteneur', 0, 0, 0);
    expect(rig.ext.ignite(bac, 0)).toBe(true);
    rig.step(45, DT);
    expect(bac.burning).toBeGreaterThan(0.9);
    const fuelBefore = bac.fuel;
    const tensionBefore = rig.director.totalAdded();
    let seconds = 0;
    while (bac.state === 'burning' && seconds < 30) {
      hazards.douse(0, 0, 1.2, DT); // 1 unité par seconde : un extincteur portatif
      rig.step(DT, DT);
      seconds += DT;
    }
    console.log(`[feu] conteneur en pleine combustion éteint à l'extincteur en ${seconds.toFixed(1)} s`);
    expect(seconds).toBeGreaterThan(3); // « extincteur 8 s » dans la bible ; le jet rabat vite les flammes
    expect(seconds).toBeLessThan(10);
    expect(bac.state).toBe('damaged');
    expect(bac.burning).toBe(0);
    expect(bac.fuel).toBeLessThan(fuelBefore);
    expect(bac.fuel).toBeGreaterThan(0);
    const out = rig.events('fire:out');
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ targetKind: 'prop', targetId: bac.id, byId: crs.id });
    expect(rig.director.totalAdded() - tensionBefore).toBeCloseTo(-0.04, 9); // « feu éteint par les forces »
    // mouillé : il ne reprend pas tout de suite, plus tard si
    expect(rig.ext.ignite(bac, 0)).toBe(false);
    rig.step(50, DT);
    expect(rig.ext.ignite(bac, 0)).toBe(true);
    // extinction directe par le service étendu
    rig.ext.extinguish(bac, crs.id);
    expect(bac.state).toBe('damaged');
  });

  it('si la nappe entretenue disparaît (fireAt retombe à zéro, sans événement), l\'objet est tenu pour éteint', async () => {
    const rig = await startProps({ seed: 5 });
    const { ctx, hazards } = rig;
    hazards.emitDouse = false; // un module de dangers qui n'émet pas 'hazards:douse'
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    rig.ext.ignite(bin, 0);
    rig.step(30, DT);
    expect(hazards.fireAt(0, 0)).toBeGreaterThan(0.5);
    expect(bin.state).toBe('burning');
    let seconds = 0;
    while (bin.state === 'burning' && seconds < 30) {
      hazards.douse(0, 0, 2, DT);
      rig.step(DT, DT);
      seconds += DT;
    }
    console.log(`[feu] nappe supprimée en continu : la corbeille est tenue pour éteinte après ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThan(10);
    expect(bin.state).toBe('damaged');
    expect(rig.events('fire:out').length).toBe(1);
  });

  it('avec les dangers neutres du cœur (fireAt toujours nul), le feu brûle normalement jusqu\'au bout', async () => {
    const rig = await startProps({ seed: 6, hazards: false });
    const { ctx } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    const chair = ctx.props.spawn('chaise', 0.6, 0, 0);
    rig.ext.ignite(bin, 0);
    rig.step(150, DT);
    expect(bin.state).toBe('burning');
    expect(chair.state).toBe('burning'); // la propagation ne dépend pas de ctx.hazards
    const t = 150 + until(rig, () => bin.state === 'burnt', 400, 5);
    expect(t).toBeGreaterThan(200);
    expect(t).toBeLessThan(380);
  });

  it('batteries : un extincteur ne suffit pas, le canon à eau si ; reprise de feu dans 30 % des cas environ', async () => {
    const rig = await startProps({ seed: 7 });
    const { ctx, hazards } = rig;
    const scoot = ctx.props.spawn('trottinette', 0, 0, 0);
    expect(rig.ext.propView(scoot)!.battery).toBe(true);
    rig.ext.ignite(scoot, 0);
    rig.step(20, DT);
    expect(scoot.burning).toBeGreaterThan(0.9); // embrasement violent en quelques secondes
    for (let t = 0; t < 18; t += DT) {
      hazards.douse(0, 0, 1.2, DT); // toute la charge d'un extincteur
      rig.step(DT, DT);
    }
    expect(scoot.state).toBe('burning');
    let seconds = 0;
    while (scoot.state === 'burning' && seconds < 60) {
      hazards.douse(0, 0, 3, 3 * DT); // canon à eau : 3 unités par seconde
      rig.step(DT, DT);
      seconds += DT;
    }
    console.log(`[feu] trottinette éteinte au canon à eau en ${seconds.toFixed(1)} s`);
    expect(scoot.state).not.toBe('burning');
    expect(seconds).toBeGreaterThan(5);
    expect(seconds).toBeLessThan(25);
    expect(rig.events('fx').some((e) => e.id === 'etincelles')).toBe(true); // gerbes d'étincelles

    // quarante trottinettes éteintes : une partie se rallume dans les deux minutes
    const many: Prop[] = [];
    for (let i = 0; i < 40; i++) {
      const p = ctx.props.spawn('trottinette', 100 + i * 12, 100, 0);
      rig.ext.ignite(p, 0);
      many.push(p);
    }
    rig.step(15, DT);
    for (const p of many) rig.ext.extinguish(p, 0);
    expect(many.every((p) => p.state !== 'burning')).toBe(true);
    rig.clearLog();
    rig.step(125, DT);
    const again = new Set(rig.events('fire:started').map((e) => e.targetId)).size;
    console.log(`[feu] reprises de feu de batterie : ${again} sur 40`);
    expect(again).toBeGreaterThanOrEqual(5);
    expect(again).toBeLessThanOrEqual(20);
  });

  it('un kiosque en feu demande les grands moyens et reste debout, calciné ; un objet retiré en flammes clôt son feu', async () => {
    const rig = await startProps({ seed: 8 });
    const { ctx, hazards } = rig;
    const kiosk = ctx.props.spawn('kiosque', 0, 0, 0);
    rig.ext.ignite(kiosk, 0);
    rig.step(90, DT);
    expect(kiosk.burning).toBeGreaterThan(0.9);
    for (let t = 0; t < 18; t += DT) {
      hazards.douse(0, 0, 1.2, DT);
      rig.step(DT, DT);
    }
    expect(kiosk.state).toBe('burning'); // un extincteur n'y change rien
    const t = until(rig, () => kiosk.state === 'burnt', 1500, 10);
    expect(t).toBeGreaterThan(500);
    expect(kiosk.blocksMove).toBe(true);
    expect(kiosk.blocksSight).toBe(true);
    expect(kiosk.height).toBeCloseTo(3.5 * 0.8, 6);

    const bin = ctx.props.spawn('poubelle', 50, 0, 0);
    rig.ext.ignite(bin, 0);
    rig.clearLog();
    ctx.props.remove(bin.id);
    expect(rig.events('fire:out')).toEqual([{ name: 'fire:out', x: 50, z: 0, targetKind: 'prop', targetId: bin.id, byId: 0 }]);
    expect(rig.events('prop:removed')).toEqual([{ name: 'prop:removed', id: bin.id }]);
    expect(rig.ext.stats.burning).toBe(0);
  });
});
