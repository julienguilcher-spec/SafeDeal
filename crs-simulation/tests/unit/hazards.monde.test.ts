// Intégration avec le vrai module du monde (quartier d'essai) : le gaz respecte le bâti réel,
// stagne dans une rue de 12 m battue de travers et file dans la même rue prise en enfilade.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createWorldQuerySystems } from '@/world/query';
import { HAZARD_FIELD_SERVICE, HazardsSystem } from '@/sim/hazards';
import type { HazardFieldView, HazardTuning } from '@/sim/hazards';
import { STEADY, fieldStats } from '@/sim/hazards/testkit';

const DT = 1 / 30;
/** Rue du Moulin (quartier d'essai) : rue est-ouest d'une douzaine de mètres entre façades, autour de z = −291. */
const STREET = { x: 100, z: -291 };

async function district(wind: [number, number], tuning: Partial<HazardTuning> = {}) {
  const t = createTestContext({ seed: 3, modules: [() => createWorldQuerySystems({ source: 'test' }), () => [new HazardsSystem(tuning)]] });
  await t.start({ mode: 'test', x: STREET.x, z: STREET.z });
  t.ctx.env.setWind(wind[0], wind[1]);
  return { t, ctx: t.ctx, hazards: t.ctx.hazards, view: t.ctx.require<HazardFieldView>(HAZARD_FIELD_SERVICE) };
}

describe('dangers diffus dans le quartier d\'essai (vrai module du monde)', () => {
  it('le plan est bien celui attendu par ce test', async () => {
    const { ctx } = await district([0, 0]);
    const w = ctx.world;
    expect(w.buildingHeightAt(STREET.x, STREET.z)).toBe(0); // chaussée
    expect(w.buildingHeightAt(STREET.x, STREET.z - 12)).toBeGreaterThan(0); // façade nord
    expect(w.buildingHeightAt(STREET.x, STREET.z + 12)).toBeGreaterThan(0); // façade sud
    expect(w.buildingHeightAt(STREET.x, -240)).toBe(0); // cour de l'îlot sud
    expect(w.buildingHeightAt(STREET.x + 60, STREET.z)).toBe(0); // la rue se prolonge à l'est
  });

  it('vent de travers : le nuage reste dans la rue, hors des immeubles et des cours', async () => {
    const { t, ctx, hazards, view } = await district([0, 5]); // vent du nord, perpendiculaire à la rue
    const t0 = performance.now();
    hazards.emitGas(STREET.x, STREET.z, 0.5 * DT, 2.5);
    t.step(0.5, DT); // premier dépôt : lecture du bâti, analyse des rues
    const firstMs = performance.now() - t0;
    for (let s = 0; s < 30 / DT; s++) {
      hazards.emitGas(STREET.x, STREET.z, 0.5 * DT, 2.5);
      t.step(DT, DT);
    }
    const s30 = fieldStats(view);
    expect(Math.hypot(s30.cx - STREET.x, s30.cz - STREET.z)).toBeLessThan(4); // stagnation
    expect(s30.maxGas).toBeGreaterThan(0.5);
    let inBuilding = 0;
    let cells = 0;
    view.forEachActiveCell((x, z) => {
      cells++;
      if (ctx.world.buildingHeightAt(x, z) > 0) inBuilding++;
    }, 1e-4);
    expect(cells).toBeGreaterThan(100);
    expect(inBuilding).toBe(0);
    expect(hazards.gasAt(STREET.x, STREET.z - 12)).toBe(0); // dans l'immeuble nord
    expect(hazards.gasAt(STREET.x, -240)).toBe(0); // cour de l'îlot, derrière l'immeuble sous le vent
    expect(hazards.gasAt(STREET.x, -350)).toBe(0); // cour de l'îlot au vent
    expect(hazards.gasAt(STREET.x + 8, STREET.z)).toBeGreaterThan(0.08); // il s'étale le long de la rue
    t.step(30);
    const s60 = fieldStats(view);
    expect(s60.maxGas).toBeGreaterThan(0.08); // trente secondes après, la rue est encore chargée
    console.log(
      `[monde] rue de 12 m, vent de travers 18 km/h : max ${s30.maxGas.toFixed(2)} à la fin de l'émission, ${s60.maxGas.toFixed(3)} trente secondes après ; `
      + `${view.stats.blocks} blocs, ${view.stats.staticBlocks} blocs de bâti en cache ; première demi-seconde (lecture du bâti comprise) : ${firstMs.toFixed(1)} ms`,
    );
  });

  it('vent d\'enfilade : le même nuage file le long de la rue', async () => {
    const { t, hazards, view } = await district([5, 0], STEADY); // vent d'ouest, dans l'axe de la rue
    hazards.emitGas(STREET.x, STREET.z, 1.5, 4);
    t.step(15);
    const s = fieldStats(view);
    // rue de 12 m : dérive ≈ 5 × 0,8 × 0,75 = 3 m/s → 45 m en 15 s (les carrefours laissent passer un peu plus de vent)
    expect(s.cx - STREET.x).toBeGreaterThan(30);
    expect(s.cx - STREET.x).toBeLessThan(62);
    expect(Math.abs(s.cz - STREET.z)).toBeLessThan(4);
    expect(hazards.gasAt(STREET.x, -240)).toBe(0);
  });

  it('sur l\'avenue de 40 m, le vent de travers pousse le nuage vers la façade sous le vent sans la franchir', async () => {
    const { t, ctx, hazards, view } = await district([0, 5]);
    for (let s = 0; s < 20 / DT; s++) {
      hazards.emitGas(150, -8, 0.5 * DT, 2.5); // chaussée nord de l'avenue
      t.step(DT, DT);
    }
    const s = fieldStats(view);
    expect(s.cz).toBeGreaterThan(-8 + 2); // déporté vers le sud…
    expect(s.cz).toBeLessThan(22); // …mais contenu par la façade sud (z ≈ 22)
    let inBuilding = 0;
    view.forEachActiveCell((x, z) => {
      if (ctx.world.buildingHeightAt(x, z) > 0) inBuilding++;
    }, 1e-4);
    expect(inBuilding).toBe(0);
    expect(hazards.gasAt(150, 60)).toBe(0); // cour de l'îlot au sud de l'avenue
  });
});
