// Nappes de feu au sol : durée, extinction progressive, fumée, eau, pluie, événements.
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/contracts';
import { HAZARD_DOUSE_EVENT } from '@/sim/hazards';
import type { HazardDouseEvent } from '@/sim/hazards';
import { STEADY, startHazards } from '@/sim/hazards/testkit';
import type { HazardRig } from '@/sim/hazards/testkit';

const DT = 1 / 30;

/** Fait brûler jusqu'à extinction ; retourne la durée (s) et l'historique d'intensité (une valeur par 0,5 s). */
function burnOut(rig: HazardRig, limit = 300): { seconds: number; history: number[] } {
  const history: number[] = [];
  for (let t = 0.5; t <= limit; t += 0.5) {
    rig.t.step(0.5);
    if (rig.view.fires.length === 0) return { seconds: t, history };
    history.push(rig.view.fires[0]!.intensity);
  }
  return { seconds: Infinity, history };
}

describe('feu', () => {
  it('une nappe s\'embrase, brûle 20 à 40 s puis s\'éteint progressivement', async () => {
    const durations: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rig = await startHazards({ seed });
      const started: GameEvents['fire:started'][] = [];
      const out: GameEvents['fire:out'][] = [];
      const fx: string[] = [];
      rig.ctx.events.on('fire:started', (e) => started.push(e));
      rig.ctx.events.on('fire:out', (e) => out.push(e));
      rig.ctx.events.on('fx', (e) => fx.push(e.id));
      rig.hazards.ignite(4, -3, 1.25, 1, 77); // flaque d'engin incendiaire, Ø 2,5 m
      expect(started).toEqual([{ x: 4, z: -3, targetKind: 'ground', targetId: 0, sourceId: 77 }]);
      expect(fx).toEqual(['trace_brulure']); // l'éclair d'embrasement est demandé par l'objet qui allume
      expect(rig.view.fires.length).toBe(1);
      expect(rig.view.fires[0]!.sourceId).toBe(77);

      // embrasement en moins d'une seconde
      rig.t.step(0.3);
      const early = rig.hazards.fireAt(4, -3);
      expect(early).toBeGreaterThan(0.1);
      expect(early).toBeLessThan(0.7);
      rig.t.step(1.2);
      expect(rig.hazards.fireAt(4, -3)).toBeGreaterThan(0.95);
      expect(rig.view.fires[0]!.radius).toBeCloseTo(1.25, 2);

      const { seconds, history } = burnOut(rig);
      durations.push(seconds + 1.5);
      // extinction progressive : l'intensité baisse régulièrement sur les dernières secondes
      const tail = history.slice(-10);
      for (let i = 1; i < tail.length; i++) expect(tail[i]!).toBeLessThan(tail[i - 1]!);
      expect(tail[tail.length - 1]!).toBeLessThan(0.2);
      expect(Math.max(...history.slice(0, 20))).toBeGreaterThan(0.95);
      expect(out).toEqual([{ x: 4, z: -3, targetKind: 'ground', targetId: 0, byId: 0 }]);
      expect(rig.hazards.fireAt(4, -3)).toBe(0);
      expect(fx).toContain('etincelles');
    }
    console.log(`[feu] durées d'une flaque à pleine intensité sur six graines : ${durations.map((d) => d.toFixed(1)).join(', ')} s`);
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(30); // 36 s ± 12 %
      expect(d).toBeLessThanOrEqual(41);
    }
    expect(new Set(durations).size).toBeGreaterThan(1); // aléa de durée

    // intensité faible : plus court
    const weak = await startHazards({ seed: 1 });
    weak.hazards.ignite(0, 0, 1, 0.2, 0);
    const w = burnOut(weak);
    expect(w.seconds).toBeGreaterThanOrEqual(18);
    expect(w.seconds).toBeLessThanOrEqual(25);
    expect(Math.max(...w.history)).toBeLessThanOrEqual(0.2001);
  });

  it('fireAt : plein au cœur, décroissant au bord, nul au-delà ; plusieurs feux', async () => {
    const rig = await startHazards();
    rig.hazards.ignite(0, 0, 2, 1, 0);
    rig.hazards.ignite(40, 0, 1, 0.5, 0);
    rig.t.step(3);
    expect(rig.view.fires.length).toBe(2);
    expect(rig.hazards.fireAt(0, 0)).toBeCloseTo(1, 2);
    expect(rig.hazards.fireAt(1, 0)).toBeCloseTo(1, 2);
    const edge = rig.hazards.fireAt(1.9, 0);
    expect(edge).toBeGreaterThan(0.05);
    expect(edge).toBeLessThan(0.6);
    expect(rig.hazards.fireAt(2.3, 0)).toBe(0);
    expect(rig.hazards.fireAt(0, 15)).toBe(0);
    expect(rig.hazards.fireAt(40, 0)).toBeCloseTo(0.5, 2);
    expect(rig.hazards.fireAt(20, 0)).toBe(0);
    expect(rig.hazards.fireAt(-500, 900)).toBe(0);
  });

  it('ignite au même endroit ré-alimente la nappe au lieu d\'en empiler une autre', async () => {
    const rig = await startHazards({ seed: 3 });
    rig.hazards.ignite(0, 0, 1.25, 0.6, 5);
    rig.t.step(20);
    const before = rig.view.fires[0]!;
    const id = before.id;
    rig.hazards.ignite(0.4, 0.2, 1.5, 1, 9); // même flaque
    expect(rig.view.fires.length).toBe(1);
    expect(rig.view.fires[0]!.id).toBe(id);
    rig.t.step(1);
    expect(rig.view.fires[0]!.intensity).toBeGreaterThan(0.9);
    expect(rig.view.fires[0]!.radius).toBeCloseTo(1.5, 1);
    expect(rig.view.fires[0]!.sourceId).toBe(5); // l'auteur initial reste l'auteur
    rig.t.step(25);
    expect(rig.view.fires.length).toBe(1); // brûlerait déjà plus sans ré-alimentation
    // un entretien régulier maintient le feu indéfiniment
    for (let k = 0; k < 20; k++) {
      rig.hazards.ignite(0, 0, 1.5, 1, 0);
      rig.t.step(5);
    }
    expect(rig.view.fires.length).toBe(1);
    expect(rig.view.fires[0]!.age).toBeGreaterThan(140);
    // plus loin : une autre nappe
    rig.hazards.ignite(5, 0, 1.25, 1, 0);
    expect(rig.view.fires.length).toBe(2);
  });

  it('le feu émet une fumée noire qui dérive sous le vent', async () => {
    const rig = await startHazards({ tuning: STEADY, wind: [3, 0] });
    rig.hazards.ignite(0, 0, 3, 1, 0);
    rig.t.step(20);
    expect(rig.hazards.smokeAt(0, 0)).toBeGreaterThan(0.15);
    expect(rig.hazards.smokeAt(15, 0)).toBeGreaterThan(0.08); // panache sous le vent
    expect(rig.hazards.smokeAt(-15, 0)).toBeLessThan(0.005); // rien au vent
    expect(rig.hazards.smokeAt(15, 0)).toBeGreaterThan(rig.hazards.smokeAt(15, 14) * 3);
    expect(rig.hazards.gasAt(15, 0)).toBe(0); // fumée et gaz sont deux champs distincts
    let dark = 0;
    let other = 0;
    rig.view.forEachActiveCell((_x, _z, _gas, smoke, color) => {
      if (smoke < 0.02) return;
      if (color === 0x141414) dark++;
      else other++;
    }, 0.02);
    expect(dark).toBeGreaterThan(20);
    expect(other).toBe(0);
    expect(rig.view.stats.smokeBlocks).toBeGreaterThan(0);
    // le feu éteint, la fumée se dissipe et les blocs sont rendus
    rig.t.step(240);
    expect(rig.view.fires.length).toBe(0);
    expect(rig.view.totalSmoke()).toBe(0);
    expect(rig.view.stats.blocks).toBe(0);
  });

  it('l\'eau éteint : trois secondes d\'extincteur sur une flaque, et le feu ne reprend pas', async () => {
    const rig = await startHazards({ seed: 2 });
    const out: GameEvents['fire:out'][] = [];
    rig.ctx.events.on('fire:out', (e) => out.push(e));
    rig.hazards.ignite(0, 0, 1.25, 1, 0);
    rig.t.step(5);
    expect(rig.hazards.fireAt(0, 0)).toBeGreaterThan(0.95);
    let seconds = 0;
    while (rig.view.fires.length > 0 && seconds < 20) {
      rig.hazards.douse(0.3, 0.2, 1.5, 1 * DT); // jet d'extincteur : 1 unité par seconde
      rig.t.step(DT, DT);
      seconds += DT;
    }
    console.log(`[feu] flaque de 1,25 m éteinte en ${seconds.toFixed(1)} s d'extincteur`);
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(3.1); // 2,5 unités : moins de 3 s d'un jet bien dirigé
    expect(out.length).toBe(1);
    expect(rig.hazards.fireAt(0, 0)).toBe(0);
    // l'eau sur le feu dégage une vapeur claire qui se mêle à la fumée noire
    let steam = 0;
    rig.view.forEachActiveCell((_x, _z, _g, smoke, color) => {
      if (smoke > 0.05 && ((color >> 16) & 255) > 0x50) steam++;
    }, 0.05);
    expect(steam).toBeGreaterThan(3);
    rig.t.step(30);
    expect(rig.view.fires.length).toBe(0); // pas de reprise
  });

  it('un arrosage insuffisant abat les flammes, qui reprennent', async () => {
    const rig = await startHazards({ seed: 2 });
    rig.hazards.ignite(0, 0, 3, 1, 0); // grande nappe : 2,5 × (3 / 1,25)² ≈ 14 unités pour l'éteindre
    rig.t.step(5);
    const full = rig.hazards.fireAt(0, 0);
    rig.hazards.douse(0, 0, 3, 7);
    expect(rig.view.fires.length).toBe(1);
    const knocked = rig.hazards.fireAt(0, 0);
    expect(knocked).toBeLessThan(full * 0.65);
    expect(knocked).toBeGreaterThan(0.2);
    rig.t.step(6);
    const back = rig.hazards.fireAt(0, 0);
    expect(back).toBeGreaterThan(knocked + 0.2); // reprise
    // l'engin lanceur d'eau (3 unités par seconde) en vient à bout en moins de 6 s
    let seconds = 0;
    while (rig.view.fires.length > 0 && seconds < 20) {
      rig.hazards.douse(0, 0, 3, 3 * DT);
      rig.t.step(DT, DT);
      seconds += DT;
    }
    expect(seconds).toBeLessThan(6);
    // un jet à côté ne fait rien
    rig.hazards.ignite(50, 0, 1.25, 1, 0);
    rig.t.step(3);
    rig.hazards.douse(60, 0, 2, 50);
    expect(rig.hazards.fireAt(50, 0)).toBeGreaterThan(0.9);
  });

  it('la pluie abrège le feu et rabat les flammes', async () => {
    const dry = await startHazards({ seed: 8 });
    const wet = await startHazards({ seed: 8, session: { weather: 'averse' } });
    expect(wet.ctx.env.state.rain).toBe(1);
    dry.hazards.ignite(0, 0, 1.25, 1, 0);
    wet.hazards.ignite(0, 0, 1.25, 1, 0);
    dry.t.step(3);
    wet.t.step(3);
    expect(wet.hazards.fireAt(0, 0)).toBeLessThan(dry.hazards.fireAt(0, 0) * 0.75);
    const d = burnOut(dry).seconds;
    const w = burnOut(wet).seconds;
    expect(w).toBeLessThan(d * 0.5);
    expect(w).toBeGreaterThan(5);
  });

  it('douse rabat le gaz et la fumée, mouille les personnes et prévient les autres modules', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, gasDecay: 0, smokeDecay: 0 } });
    rig.hazards.emitGas(0, 0, 0.8, 8);
    rig.hazards.emitSmoke(0, 0, 0.8, 8, 0xd62828);
    const gas0 = rig.hazards.gasAt(0, 0);
    const smoke0 = rig.hazards.smokeAt(0, 0);
    const far0 = rig.hazards.gasAt(6, 0);
    const total0 = rig.view.totalGas();
    const inside = rig.ctx.people.spawn({ kind: 'manifestant', x: 0.5, z: 0 });
    const burning = rig.ctx.people.spawn({ kind: 'crs', x: -1, z: 0.5 });
    const outside = rig.ctx.people.spawn({ kind: 'passant', x: 9, z: 0 });
    burning.burning = 0.8;
    rig.t.step(DT, DT); // index spatial des personnes à jour
    const events: HazardDouseEvent[] = [];
    rig.ctx.events.onAny(HAZARD_DOUSE_EVENT, (e) => events.push({ ...(e as HazardDouseEvent) }));

    rig.hazards.douse(0, 0, 4, 2); // deux secondes de jet
    expect(rig.hazards.gasAt(0, 0)).toBeLessThan(gas0 * 0.5);
    expect(rig.hazards.gasAt(0, 0)).toBeGreaterThan(gas0 * 0.2);
    expect(rig.hazards.smokeAt(0, 0)).toBeLessThan(smoke0 * 0.5);
    expect(rig.hazards.gasAt(6, 0)).toBeCloseTo(far0, 2); // hors du jet : intact
    expect(rig.view.totalGas()).toBeLessThan(total0);
    expect(inside.wet).toBeGreaterThan(0.6);
    expect(burning.wet).toBeGreaterThan(0.4);
    expect(burning.wet).toBeLessThan(inside.wet); // plus loin du centre du jet
    expect(burning.burning).toBe(0.8); // éteindre une personne revient à l'objet employé et au module des personnes
    expect(outside.wet).toBe(0);
    expect(events).toEqual([{ x: 0, z: 0, radius: 4, amount: 2 }]);
    // la couleur de la fumée restante n'est pas altérée par le rabattement
    let red = 0;
    let others = 0;
    rig.view.forEachActiveCell((_x, _z, _g, smoke, color) => {
      if (smoke < 0.01) return;
      if (color === 0xd62828) red++;
      else others++;
    }, 0.01);
    expect(red).toBeGreaterThan(10);
    expect(others).toBe(0);
    // appels invalides : sans effet, sans événement
    rig.hazards.douse(Number.NaN, 0, 4, 2);
    rig.hazards.douse(0, 0, 4, -1);
    expect(events.length).toBe(1);
  });

  it('le nombre de nappes est plafonné : la plus proche de sa fin cède la place', async () => {
    const rig = await startHazards({ tuning: { maxFires: 8 } });
    const out: GameEvents['fire:out'][] = [];
    rig.ctx.events.on('fire:out', (e) => out.push(e));
    for (let i = 0; i < 8; i++) {
      rig.hazards.ignite(i * 10, 0, 1.25, 1, 0);
      rig.t.step(1);
    }
    expect(rig.view.fires.length).toBe(8);
    rig.hazards.ignite(200, 0, 1.25, 1, 0);
    expect(rig.view.fires.length).toBe(8);
    expect(out.length).toBe(1);
    const dropped = out[0]!.x; // celle à qui il restait le moins de combustible
    expect(dropped % 10).toBe(0);
    expect(dropped).toBeLessThan(80);
    expect(rig.hazards.fireAt(dropped, 0)).toBe(0);
    expect(rig.hazards.fireAt(200, 0)).toBe(0); // pas encore embrasée
    rig.t.step(2);
    expect(rig.hazards.fireAt(200, 0)).toBeGreaterThan(0.9);
    let alive = 0;
    for (let i = 0; i < 8; i++) if (rig.hazards.fireAt(i * 10, 0) > 0.5) alive++;
    expect(alive).toBe(7);
  });
});
