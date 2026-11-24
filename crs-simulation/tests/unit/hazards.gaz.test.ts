// Gaz lacrymogène à l'air libre : émission, conservation, dilution, dérive sous le vent, pluie, déterminisme.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { HAZARD_FIELD_SERVICE, createSystems } from '@/sim/hazards';
import type { HazardFieldView } from '@/sim/hazards';
import { STEADY, fieldChecksum, fieldStats, startHazards } from '@/sim/hazards/testkit';
import type { HazardRig } from '@/sim/hazards/testkit';

const DT = 1 / 30;
/** Les six palets d'une grenade, tombés entre 5 et 15 m du point d'impact (docs/research/00 §G.1). */
const SIX: readonly (readonly [number, number])[] = [[8, 2], [-6, 7], [3, -10], [-11, -4], [12, -8], [-2, 13]];

/**
 * Fait fumer des palets pendant `seconds`, comme le fait le module des objets : 0,25 de concentration
 * par seconde et par palet, rayon de dépôt 2,5 m.
 */
function smoke(rig: HazardRig, palets: readonly (readonly [number, number])[], seconds: number, rate = 0.25): void {
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) {
    for (const [x, z] of palets) rig.hazards.emitGas(x, z, rate * DT, 2.5);
    rig.t.step(DT, DT);
  }
}

/** Secondes écoulées (par pas de 0,5 s) avant que le maximum du champ passe sous `threshold`. */
function timeToFade(rig: HazardRig, threshold: number, limit = 400): number {
  for (let t = 0.5; t <= limit; t += 0.5) {
    rig.t.step(0.5);
    if (fieldStats(rig.view).maxGas < threshold) return t;
  }
  return Infinity;
}

describe('gaz : émission', () => {
  it('remplace le service neutre et publie le service de lecture', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.ready;
    const view = t.ctx.service<HazardFieldView>(HAZARD_FIELD_SERVICE);
    expect(view).toBeDefined();
    expect(view!.cellSize).toBe(2);
    // utilisable avant toute session : le service neutre renverrait 0
    t.ctx.hazards.emitGas(0, 0, 0.5, 4);
    expect(t.ctx.hazards.gasAt(0, 0)).toBeGreaterThan(0.3);
    await t.start();
    expect(t.ctx.hazards.gasAt(0, 0)).toBe(0); // nouvelle session : champ vide
  });

  it('dépose amount × π r² / 3 quelle que soit la position du point dans la grille', async () => {
    const rig = await startHazards();
    const expected = (0.5 * Math.PI * 6 * 6) / 3;
    for (const [x, z] of [[0, 0], [1, 1], [0.3, 1.7], [-13.2, 7.9], [31.99, 31.99], [-64, 128.5]] as const) {
      rig.hazards.clear();
      rig.hazards.emitGas(x, z, 0.5, 6);
      expect(rig.view.totalGas()).toBeCloseTo(expected, 3);
    }
    // un petit rayon est porté à 2 m : la masse reste indépendante de la position
    for (const [x, z] of [[1, 1], [2, 2], [0.2, 1.1]] as const) {
      rig.hazards.clear();
      rig.hazards.emitGas(x, z, 0.5, 0.3);
      expect(rig.view.totalGas()).toBeCloseTo((0.5 * Math.PI * 4) / 3, 3);
      expect(rig.hazards.gasAt(x, z)).toBeGreaterThan(0.1);
    }
  });

  it('gasAt : concentration au point, nulle au loin, bornée à 1', async () => {
    const rig = await startHazards();
    rig.hazards.emitGas(11, 11, 0.6, 6);
    expect(rig.hazards.gasAt(11, 11)).toBeGreaterThan(0.5);
    expect(rig.hazards.gasAt(11, 11)).toBeLessThan(0.7);
    expect(rig.hazards.gasAt(14, 11)).toBeGreaterThan(0.2);
    expect(rig.hazards.gasAt(14, 11)).toBeLessThan(rig.hazards.gasAt(11, 11));
    expect(rig.hazards.gasAt(19, 11)).toBe(0);
    expect(rig.hazards.gasAt(500, -300)).toBe(0);
    expect(rig.hazards.smokeAt(11, 11)).toBe(0);
    // source insistante : la lecture reste bornée, le stockage sature en douceur
    for (let i = 0; i < 200; i++) rig.hazards.emitGas(11, 11, 0.5, 4);
    expect(rig.hazards.gasAt(11, 11)).toBe(1);
    const st = fieldStats(rig.view);
    expect(st.maxGas).toBeGreaterThan(1);
    expect(st.maxGas).toBeLessThanOrEqual(2.5);
  });

  it('ignore les appels invalides', async () => {
    const rig = await startHazards();
    rig.hazards.emitGas(Number.NaN, 0, 1, 3);
    rig.hazards.emitGas(0, Number.POSITIVE_INFINITY, 1, 3);
    rig.hazards.emitGas(0, 0, -1, 3);
    rig.hazards.emitGas(0, 0, 0, 3);
    rig.hazards.emitGas(0, 0, Number.NaN, 3);
    rig.hazards.emitGas(1e9, 1e9, 1, 3); // hors de la grille admise
    rig.hazards.emitSmoke(0, 0, Number.NaN, 3);
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.totalGas()).toBe(0);
    rig.t.step(1);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
  });
});

describe('gaz : transport à l\'air libre', () => {
  it('air calme, dilution coupée : la masse se conserve et le nuage s\'étale', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, gasDecay: 0 } });
    rig.hazards.emitGas(3, -5, 0.9, 6);
    const m0 = rig.view.totalGas();
    const s0 = fieldStats(rig.view);
    rig.t.step(30);
    const s1 = fieldStats(rig.view);
    expect(rig.view.totalGas() / m0).toBeGreaterThan(0.995);
    expect(rig.view.totalGas() / m0).toBeLessThan(1.0001);
    expect(s1.maxGas).toBeLessThan(s0.maxGas * 0.5); // il s'étale…
    expect(s1.area05).toBeGreaterThan(s0.area05 * 1.5);
    expect(Math.hypot(s1.cx - 3, s1.cz + 5)).toBeLessThan(0.05); // …sans se déplacer
  });

  it('sous le vent, dilution coupée : la masse se conserve à 3 % près pendant le trajet', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, gasDecay: 0 }, wind: [3, 1] });
    rig.hazards.emitGas(0, 0, 0.9, 6);
    const m0 = rig.view.totalGas();
    let previous = m0;
    for (let k = 0; k < 15; k++) {
      rig.t.step(1);
      const m = rig.view.totalGas();
      expect(m).toBeLessThanOrEqual(previous * 1.00001); // jamais de création de masse
      previous = m;
    }
    expect(previous / m0).toBeGreaterThan(0.97);
    // le nuage a bien voyagé (45 m, soit plus d'un bloc) : la conservation vaut aussi d'un bloc à l'autre
    const s = fieldStats(rig.view);
    expect(s.cx).toBeGreaterThan(33);
    expect(s.cz).toBeGreaterThan(10);
    expect(rig.hazards.gasAt(0, 0)).toBeLessThan(0.01);
    console.log(`[gaz] masse conservée après 15 s de dérive à 2,5 m/s, dilution coupée : ${((previous / m0) * 100).toFixed(1)} %`);
  });

  it('grenade à six palets : ≈ 800 m² au bout de 30 s, puis le nuage s\'estompe en une à deux minutes', async () => {
    const rig = await startHazards();
    smoke(rig, SIX, 30);
    const s = fieldStats(rig.view);
    // docs/research/02 §3.6 : « ≈ 800 m² (disque de rayon ≈ 16 m) »
    expect(s.area10).toBeGreaterThan(600);
    expect(s.area10).toBeLessThan(1000);
    expect(s.maxGas).toBeGreaterThan(0.5);
    expect(rig.hazards.gasAt(8, 2)).toBeGreaterThan(0.35); // au contact d'un palet
    expect(rig.hazards.gasAt(0, 0)).toBeGreaterThan(0.1); // centre du nuage, à 8 m au moins de chaque palet
    expect(rig.hazards.gasAt(40, 0)).toBe(0);

    // après l'émission : la masse ne fait que décroître
    let previous = rig.view.totalGas();
    let fade05 = Infinity;
    let fade02 = Infinity;
    for (let t = 1; t <= 240; t++) {
      rig.t.step(1);
      const m = rig.view.totalGas();
      expect(m).toBeLessThanOrEqual(previous * 1.00001);
      previous = m;
      const max = fieldStats(rig.view).maxGas;
      if (fade05 === Infinity && max < 0.05) fade05 = t;
      if (fade02 === Infinity && max < 0.02) fade02 = t;
    }
    // « 60 à 180 s sans vent » (00 §G.1) ; « une à deux minutes à l'air libre »
    expect(fade05).toBeGreaterThanOrEqual(60);
    expect(fade05).toBeLessThanOrEqual(120);
    expect(fade02).toBeLessThanOrEqual(180);
    console.log(`[gaz] six palets, air calme : ${s.area10} m² à 0,1 après 30 s ; sous 0,05 à +${fade05} s, sous 0,02 à +${fade02} s`);
    // et tout finit par disparaître : blocs libérés
    rig.t.step(120);
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.totalGas()).toBe(0);
  });

  it('le nuage dérive à vent × 0,8, dans la direction du vent', async () => {
    for (const [wx, wz] of [[3, 0], [0, -5], [-2, 2]] as const) {
      const rig = await startHazards({ tuning: STEADY, wind: [wx, wz] });
      rig.hazards.emitGas(0, 0, 1.5, 8);
      rig.t.step(20);
      const s = fieldStats(rig.view);
      expect(s.cx).toBeCloseTo(0.8 * wx * 20, 0);
      expect(s.cz).toBeCloseTo(0.8 * wz * 20, 0);
      expect(rig.view.driftX).toBeCloseTo(0.8 * wx, 6);
      expect(rig.view.driftZ).toBeCloseTo(0.8 * wz, 6);
    }
  });

  it('avec rafales et sautes de vent : même trajet à 20 % près, écart latéral limité', async () => {
    const rig = await startHazards({ seed: 4, wind: [3, 0] });
    rig.hazards.emitGas(0, 0, 1.5, 8);
    rig.t.step(20);
    const s = fieldStats(rig.view);
    expect(s.cx).toBeGreaterThan(48 * 0.8);
    expect(s.cx).toBeLessThan(48 * 1.2);
    expect(Math.abs(s.cz)).toBeLessThan(10);
    expect(Math.abs(s.cz)).toBeGreaterThan(0.01); // la turbulence existe
  });

  it('retour de gaz : le nuage atteint la ligne en distance ÷ dérive', async () => {
    // vent du nord (souffle vers +z) à 4 m/s ; une bouffée à 40 m au nord de la ligne tenue en z = 0
    const rig = await startHazards({ tuning: STEADY, wind: [0, 4] });
    rig.hazards.emitGas(0, -40, 1.5, 6);
    let peak = 0;
    let peakAt = 0;
    for (let s = 1; s <= 30 / DT; s++) {
      rig.t.step(DT, DT);
      const g = rig.hazards.gasAt(0, 0);
      if (g > peak) {
        peak = g;
        peakAt = s * DT;
      }
      if (s * DT <= 5) expect(g).toBeLessThan(0.01); // rien n'arrive avant l'heure
    }
    // dérive 3,2 m/s → le cœur du nuage passe sur la ligne à 40 ÷ 3,2 = 12,5 s
    expect(peakAt).toBeGreaterThan(10.5);
    expect(peakAt).toBeLessThan(13.5);
    expect(peak).toBeGreaterThan(0.08);
    expect(rig.hazards.gasAt(0, 0)).toBeLessThan(peak * 0.2); // puis il s'éloigne

    // grenade entière tombée 40 m au vent : la ligne est dans le panache tant que les palets fument
    const line = await startHazards({ tuning: STEADY, wind: [0, 4] });
    for (let s = 0; s < 25 / DT; s++) {
      for (const [x, z] of SIX) line.hazards.emitGas(x, z - 40, 0.5 * DT, 2.5);
      line.t.step(DT, DT);
    }
    expect(line.hazards.gasAt(0, 0)).toBeGreaterThan(0.1);
    expect(line.hazards.gasAt(0, 20)).toBeGreaterThan(0.05); // et déborde derrière elle
    expect(line.hazards.gasAt(0, -75)).toBe(0); // rien au vent des palets
    expect(line.hazards.gasAt(60, -20)).toBe(0); // rien loin de l'axe
  });

  it('le vent et la pluie abrègent le nuage', async () => {
    const calm = await startHazards();
    smoke(calm, SIX, 30);
    const tCalm = timeToFade(calm, 0.05);

    // 18 km/h : le nuage est emporté et dilué ; on suit sa trace jusqu'au seuil de perception (0,02)
    const windy = await startHazards({ wind: [5, 0] });
    smoke(windy, SIX, 30);
    const peakWindy = fieldStats(windy.view).maxGas;
    const tWindy05 = timeToFade(windy, 0.05);
    const tWindy02 = tWindy05 + timeToFade(windy, 0.02);

    const rainy = await startHazards({ session: { weather: 'pluie' } });
    expect(rainy.ctx.env.state.rain).toBeGreaterThan(0.3);
    smoke(rainy, SIX, 30);
    const tRainy = timeToFade(rainy, 0.05);

    console.log(
      `[gaz] persistance après 30 s d'émission : air calme ${tCalm} s (sous 0,05) ; vent de 18 km/h ${tWindy05} s (sous 0,05) et ${tWindy02} s (sous 0,02), `
      + `pic ${peakWindy.toFixed(2)} ; pluie ${tRainy} s (sous 0,05)`,
    );
    // 00 §G.1 : 20 à 40 s au-delà de 15 km/h ; divisée par 2 sous la pluie
    expect(peakWindy).toBeLessThan(0.3); // le vent dilue : c'est ce qui rend le gaz peu efficace par grand vent
    expect(tWindy02).toBeGreaterThanOrEqual(12);
    expect(tWindy02).toBeLessThanOrEqual(40);
    expect(tWindy05).toBeLessThan(tCalm * 0.3);
    expect(tRainy / tCalm).toBeGreaterThan(0.35);
    expect(tRainy / tCalm).toBeLessThan(0.65);
  });

  it('grand vent : sous-pas d\'advection, valeurs finies et positives, vitesse respectée', async () => {
    const rig = await startHazards({ tuning: STEADY, wind: [14, 0] }); // 50 km/h
    rig.hazards.emitGas(0, 0, 1.5, 8);
    rig.t.step(10);
    expect(rig.view.stats.substeps).toBe(3);
    const s = fieldStats(rig.view);
    expect(s.cx).toBeGreaterThan(0.8 * 14 * 10 * 0.97);
    expect(s.cx).toBeLessThan(0.8 * 14 * 10 * 1.03);
    let bad = 0;
    rig.view.forEachActiveCell((_x, _z, gas) => {
      if (!Number.isFinite(gas) || gas < 0) bad++;
    }, 1e-4);
    expect(bad).toBe(0);
    // tempête : la dérive est plafonnée, rien ne diverge
    rig.ctx.env.setWind(60, 0);
    rig.hazards.emitGas(0, 0, 1.5, 8);
    rig.t.step(5);
    expect(rig.view.stats.substeps).toBe(4);
    expect(Math.hypot(rig.view.driftX, rig.view.driftZ)).toBeLessThanOrEqual(16.0001);
    expect(Number.isFinite(rig.view.totalGas())).toBe(true);
  });

  it('déterminisme : même graine → même champ ; autre graine → turbulence différente', async () => {
    const run = async (seed: number): Promise<number> => {
      const rig = await startHazards({ seed, wind: [2.5, -1] });
      for (let s = 0; s < 600; s++) {
        if (s < 300) for (const [x, z] of SIX) rig.hazards.emitGas(x, z, 0.5 * DT, 2.5);
        if (s === 100) rig.hazards.ignite(20, 5, 1.5, 0.8, 0);
        if (s % 7 === 0) rig.hazards.emitSmoke(-15, 4, 0.02, 3, 0xd62828);
        if (s === 400) rig.hazards.douse(20, 5, 2, 1);
        rig.t.step(DT, DT);
      }
      expect(rig.view.stats.blocks).toBeGreaterThan(3);
      return fieldChecksum(rig.view);
    };
    const a = await run(21);
    const b = await run(21);
    const c = await run(22);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});
