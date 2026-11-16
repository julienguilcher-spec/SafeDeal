// Foule — réaction aux sommations : à chaque étape une part croissante s'en va, les familles d'abord,
// dans les proportions prévues par profil (table PROFILE de tuning.ts). Vraies sommations du module de droit.
import { describe, expect, it } from 'vitest';
import type { ProtestProfile } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { PROFILE } from '@/sim/crowd/tuning';

describe('foule — sommations', () => {
  it('fait partir les bonnes proportions par profil, étape après étape', async () => {
    const t = createCrowdTest({ seed: 5, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({
      crowdSize: 500, tension: 0.05, volatility: 0.3,
      extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.scenario': 'journee_tendue', 'law.delayScale': 0.25 },
    }));
    t.run(4);
    // l'autorité habilitée (écharpe tricolore), sur le côté du rassemblement, à mi-longueur : tout le monde l'entend
    const f = core.formation;
    core.corridor.at((f.headS + f.tailS) * 0.5, core.rp);
    const side = core.rp.center + core.rp.half + 4.5;
    const chief = ctx.people.spawn({
      kind: 'commissaire', faction: 'police', x: core.rp.x - core.rp.tz * side, z: core.rp.z + core.rp.tx * side, rank: 'commissaire', poste: 'autorite_civile', look: { sash: true },
    });
    expect(ctx.world.isFree(chief.x, chief.z, 0.3)).toBe(true);
    ctx.actions.give(chief, 'megaphone');
    t.run(1);
    // cohorte : ceux qui entendent distinctement (moins de 60 m), suivis par leur profil d'origine
    const cohort = t.protesters().filter((p) => Math.hypot(p.x - chief.x, p.z - chief.z) < 58);
    const profileOf = new Map<number, ProtestProfile>();
    for (const p of cohort) profileOf.set(p.id, brainOf(p)!.origin ?? 'pacifique');
    const sizes = new Map<ProtestProfile, number>();
    for (const pr of profileOf.values()) sizes.set(pr, (sizes.get(pr) ?? 0) + 1);
    expect(cohort.length).toBeGreaterThan(400);
    const leftShare = (): Map<ProtestProfile, number> => {
      const gone = new Map<ProtestProfile, number>();
      for (const [id, pr] of profileOf) {
        const p = ctx.people.get(id);
        const b = p ? brainOf(p) : null;
        // parti (retiré du jeu) ou en train de partir
        if (!p || !b || b.index < 0 || (b.flags & 64) !== 0) gone.set(pr, (gone.get(pr) ?? 0) + 1);
      }
      const out = new Map<ProtestProfile, number>();
      for (const [pr, n] of sizes) out.set(pr, (gone.get(pr) ?? 0) / n);
      return out;
    };
    expect(leftShare().get('pacifique')).toBeLessThan(0.02);

    const stages: Map<ProtestProfile, number>[] = [];
    for (let stage = 1; stage <= 3; stage++) {
      const reached = ctx.law.sommation(chief);
      expect(reached).toBe(stage);
      t.run(13);
      stages.push(leftShare());
    }
    const table = (pr: ProtestProfile): string => pr + ' (' + sizes.get(pr) + ') ' + stages.map((s) => (s.get(pr)! * 100).toFixed(0) + ' %').join(' → ');
    console.log('[foule] départs après annonce → première → dernière sommation :', [...sizes.keys()].map(table).join(' | '));

    // proportions attendues : part de base du profil, un peu relevée par la peur que cause la sommation
    const tolerance: Partial<Record<ProtestProfile, number>> = { pacifique: 0.13, militant: 0.22, famille: 0.27, opportuniste: 0.2, service_ordre: 0.25, radical: 0.2 };
    for (const [pr, n] of sizes) {
      if (n < 25) continue;
      const tol = tolerance[pr] ?? 0.25;
      for (let k = 0; k < 3; k++) {
        const base = PROFILE[pr].leave[k]!;
        const expected = Math.min(1, base * 1.08);
        expect(Math.abs(stages[k]!.get(pr)! - expected), `${pr}, étape ${k + 1} : ${stages[k]!.get(pr)} pour ${expected}`).toBeLessThanOrEqual(tol);
      }
      // de plus en plus de départs à chaque étape
      expect(stages[1]!.get(pr)!).toBeGreaterThanOrEqual(stages[0]!.get(pr)!);
      expect(stages[2]!.get(pr)!).toBeGreaterThanOrEqual(stages[1]!.get(pr)!);
    }
    // les familles d'abord, les radicaux en dernier
    const s1 = stages[0]!;
    const s3 = stages[2]!;
    expect(s1.get('famille')!).toBeGreaterThan(s1.get('pacifique')! + 0.2);
    expect(s1.get('pacifique')!).toBeGreaterThan(s1.get('militant')!);
    expect(s3.get('pacifique')!).toBeGreaterThan(0.75);
    expect(s3.get('famille')!).toBeGreaterThan(0.95);
    if ((sizes.get('opportuniste') ?? 0) >= 15) expect(s3.get('opportuniste')!).toBeLessThan(s3.get('militant')!);
    if ((sizes.get('radical') ?? 0) >= 8) expect(s3.get('radical')!).toBeLessThan(0.35);

    // ceux qui partent quittent vraiment les lieux : après deux minutes, le rassemblement s'est vidé d'autant
    const before = ctx.director.stats.present;
    t.run(150);
    const stats = ctx.director.stats;
    expect(stats.dispersed).toBeGreaterThan(cohort.length * 0.5);
    expect(stats.present).toBeLessThan(before);
    expect(stats.present + stats.dispersed).toBe(stats.total);
  }, 600_000);
});
