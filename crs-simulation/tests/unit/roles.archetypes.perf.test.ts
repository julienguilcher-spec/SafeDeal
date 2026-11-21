// Archétypes — coûts. Le module n'a aucune mise à jour par pas de simulation : son coût par pas est
// nul. Ce qui se mesure, c'est la création (1 500 personnes au début d'une mission, puis les arrivées
// par vagues) et le ré-équipement. Seuils volontairement larges (machines de test hétérogènes) ; les
// chiffres utiles sont dans la sortie console.
import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { startRoles } from '@/sim/roles/archetypes/testkit';

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1]!;
}

describe('coûts', () => {
  it('aucun coût par pas de simulation', async () => {
    const { t, ctx, helper } = await startRoles(111, { extra: { cause: 'retraites' } });
    const slots = helper.crowd('retraites', 1500);
    slots.forEach((s, i) => helper.spawnSlot(s, (i % 50) * 1.2, Math.floor(i / 50) * 1.2));
    expect(ctx.people.list.length).toBe(1500);
    const entry = t.game.perf.find((p) => p.id === 'roles.archetypes');
    expect(entry).toBeDefined();
    let total = 0;
    for (let i = 0; i < 120; i++) {
      t.game.step(1 / 30);
      total += entry!.updateMs;
    }
    console.info(`[roles] coût par pas de simulation avec 1 500 personnes : ${(total / 120).toFixed(4)} ms (pas de mise à jour)`);
    expect(total).toBe(0);
  });

  it('création de 1 500 manifestants et d’une compagnie : quelques dizaines de microsecondes par personne', async () => {
    const perPerson: number[] = [];
    const crowdMs: number[] = [];
    const bareUs: number[] = [];
    let cold = 0;
    for (let run = 0; run < 3; run++) {
      const { ctx, helper } = await startRoles(112 + run, { extra: { cause: 'pouvoir_achat' } });
      let t0 = performance.now();
      const slots = helper.crowd('pouvoir_achat', 1500, null, createRng(run));
      crowdMs.push(performance.now() - t0);
      const unit = helper.policeUnit('compagnie');
      for (let pass = 0; pass < 4; pass++) {
        ctx.people.clear();
        t0 = performance.now();
        for (let i = 0; i < slots.length; i++) helper.spawnSlot(slots[i]!, i % 60, (i / 60) | 0);
        for (let i = 0; i < unit.length; i++) helper.spawnUnitSlot(unit[i]!, i, -10);
        const us = ((performance.now() - t0) * 1000) / (slots.length + unit.length);
        // la toute première passe paie la compilation à la volée : c'est le coût d'un premier chargement de mission
        if (run === 0 && pass === 0) cold = us;
        else perPerson.push(us);
        expect(ctx.people.list.length).toBe(1570);
      }
      // référence : la même population créée « nue » par le magasin des personnes
      for (let pass = 0; pass < 3; pass++) {
        ctx.people.clear();
        t0 = performance.now();
        for (let i = 0; i < 1570; i++) ctx.people.spawn({ kind: i < 1500 ? 'manifestant' : 'crs', x: i % 60, z: (i / 60) | 0 });
        bareUs.push(((performance.now() - t0) * 1000) / 1570);
      }
    }
    // machine de test partagée : le minimum est la meilleure estimation du coût propre, la médiane dit le bruit
    const best = Math.min(...perPerson);
    console.info(
      `[roles] création de 1 570 personnes : ${best.toFixed(1)} µs par personne au mieux (médiane ${median(perPerson).toFixed(1)} µs sur `
      + `${perPerson.length} passes), soit ${((best * 1570) / 1000).toFixed(1)} ms pour toute la scène ; première passe à froid : `
      + `${cold.toFixed(1)} µs par personne (${((cold * 1570) / 1000).toFixed(0)} ms) ; magasin seul : ${Math.min(...bareUs).toFixed(1)} µs au mieux ; `
      + `composition d'une foule de 1 500 : ${Math.min(...crowdMs).toFixed(2)} ms`,
    );
    expect(best).toBeLessThan(250);
    expect(Math.min(...crowdMs)).toBeLessThan(50);
  });

  it('ré-équipement : changement de poste et changement de tenue', async () => {
    const { ctx, ext } = await startRoles(120);
    const agents = [];
    const bloc = [];
    for (let i = 0; i < 300; i++) agents.push(ctx.archetypes.spawn('crs', i, 0, { poste: 'bouclier' }));
    for (let i = 0; i < 300; i++) bloc.push(ext.spawnEx('manifestant', i, 5, { family: 'black_bloc', profile: 'radical', bloc: false }));
    const postes = ['lanceur', 'bouclier', 'lbd', 'extincteur'] as const;
    let t0 = performance.now();
    for (let k = 0; k < 4; k++) for (let i = 0; i < agents.length; i++) ctx.archetypes.equip(agents[i]!, postes[k]!);
    const equipUs = ((performance.now() - t0) * 1000) / (4 * agents.length);
    t0 = performance.now();
    for (let k = 0; k < 4; k++) for (let i = 0; i < bloc.length; i++) ext.setBlocAttire(bloc[i]!, k % 2 === 0);
    const dressUs = ((performance.now() - t0) * 1000) / (4 * bloc.length);
    console.info(`[roles] ré-équipement : ${equipUs.toFixed(1)} µs par changement de poste, ${dressUs.toFixed(1)} µs par changement de tenue`);
    expect(equipUs).toBeLessThan(1000);
    expect(dressUs).toBeLessThan(1000);
    expect(agents.every((a) => a.poste === 'extincteur')).toBe(true);
    expect(bloc.every((b) => !ext.inBlocAttire(b))).toBe(true);
  });
});
