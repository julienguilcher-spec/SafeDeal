import { describe, expect, it } from 'vitest';
import type { InteractVerb, Person } from '@/core/contracts';
import type { LawTest } from '@/gameplay/law/testkit';
import { attackOfficer, commissaire, crs, person, protester, startLaw } from '@/gameplay/law/testkit';

function act(law: LawTest, actor: Person, verb: InteractVerb, targetId: number): boolean {
  if (!law.ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = law.ctx.interactions.current(actor);
  if (cur) law.t.step(cur.opt.duration + 0.05);
  return true;
}

/** Temps cumulé passé dans les deux systèmes du droit pendant `steps` pas de 1/30 s (ms). */
function measure(law: LawTest, steps: number): { law: number; custody: number } {
  const perf = law.t.game.perf;
  const pLaw = perf.find((p) => p.id === 'law')!;
  const pCustody = perf.find((p) => p.id === 'law.custody')!;
  let a = 0;
  let b = 0;
  for (let i = 0; i < steps; i++) {
    law.t.game.step(1 / 30);
    a += pLaw.updateMs;
    b += pCustody.updateMs;
  }
  return { law: a, custody: b };
}

describe('droit — coût par pas de simulation', () => {
  it('1 500 personnes, dispersion en cours, 20 interpellés escortés : une fraction de milliseconde par pas', async () => {
    const law = await startLaw({ seed: 31, config: { duration: 'courte' } });
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    // 250 agents en ligne, 1 200 manifestants en bloc serré devant eux, 50 tiers
    const agents: Person[] = [];
    for (let i = 0; i < 250; i++) agents.push(crs(ctx, (i % 50) * 1.2 - 30, -2 - Math.floor(i / 50) * 1.5, { poste: i % 10 === 0 ? 'chef_groupe' : 'bouclier' }));
    const foule: Person[] = [];
    for (let i = 0; i < 1200; i++) foule.push(protester(ctx, (i % 40) * 1.1 - 22, 8 + Math.floor(i / 40) * 1.1, i % 15 === 0 ? 'radical' : 'pacifique'));
    for (let i = 0; i < 50; i++) person(ctx, i % 2 ? 'journaliste' : 'passant', -40 + i * 1.5, 50);
    expect(ctx.people.list.length).toBe(1501);

    // au repos (cortège) : le droit ne coûte presque rien
    measure(law, 30);
    const idle = measure(law, 300);

    // 20 interpellations menées jusqu'à l'escorte
    let escorted = 0;
    for (let i = 0; i < 60 && escorted < 20; i++) {
      const actor = agents[i]!;
      const target = protester(ctx, actor.x, actor.z - 1.2, 'pacifique');
      ctx.law.recordOffense(target, 'degradation', target.x, target.z);
      ctx.people.rebuildIndex();
      if (!act(law, actor, 'maitriser', target.id) || target.custody !== 'held') continue;
      act(law, actor, 'menotter', target.id);
      act(law, actor, 'escorter', target.id);
      if ((target.custody as string) === 'escorted') escorted++;
    }
    expect(escorted).toBe(20);

    // sommations, violences contre les forces
    ctx.law.sommation(com);
    law.t.step(cfg.delayAnnonce + 0.1);
    ctx.law.sommation(com);
    law.t.step(cfg.delaySommation + 0.1);
    ctx.law.sommation(com);
    expect(ctx.law.roe.sommation).toBe(3);
    attackOfficer(ctx, foule[0]!, agents[5]!);

    // régime chargé : délai, puis examen de toute la foule restée sur place (un délit par personne,
    // avec recherche de témoins et de caméras), suivi des escortes, riposte ouverte
    const offensesBefore = foule.reduce((n, p) => n + p.offenses.length, 0);
    const busy = measure(law, 600);
    const offensesAfter = foule.reduce((n, p) => n + p.offenses.length, 0);
    expect(offensesAfter - offensesBefore).toBeGreaterThan(500);
    // régime établi ensuite : plus personne à examiner
    const steady = measure(law, 300);

    // coût des appels ponctuels dans cette scène
    const calls = 2000;
    let t0 = performance.now();
    for (let i = 0; i < calls; i++) ctx.law.recordOffense(foule[(i * 7) % foule.length]!, 'degradation', foule[(i * 7) % foule.length]!.x, foule[(i * 7) % foule.length]!.z);
    const offenseUs = ((performance.now() - t0) / calls) * 1000;
    t0 = performance.now();
    for (let i = 0; i < calls; i++) {
      const target = foule[(i * 13) % foule.length]!;
      ctx.law.reportForce(agents[i % agents.length]!, i % 3 === 0 ? 'lacrymo' : i % 3 === 1 ? 'baton' : 'lbd', i % 3 === 0 ? null : target, target.x, target.z);
    }
    const forceUs = ((performance.now() - t0) / calls) * 1000;
    t0 = performance.now();
    const out: import('@/core/contracts').InteractionOption[] = [];
    for (let i = 0; i < calls; i++) ctx.interactions.options(agents[i % agents.length]!, out);
    const optionsUs = ((performance.now() - t0) / calls) * 1000;

    const idleMs = (idle.law + idle.custody) / 300;
    const busyMs = (busy.law + busy.custody) / 600;
    console.info(
      `[law] coût par pas (1 521 personnes) — repos : ${(idleMs * 1000).toFixed(1)} µs ; dispersion (${offensesAfter - offensesBefore} délits constatés en 20 s) + 20 escortes : ${(busyMs * 1000).toFixed(1)} µs ` +
      `(dont law.custody ${((busy.custody / 600) * 1000).toFixed(1)} µs) ; ensuite : ${(((steady.law + steady.custody) / 300) * 1000).toFixed(1)} µs ; ` +
      `recordOffense : ${offenseUs.toFixed(1)} µs ; reportForce : ${forceUs.toFixed(1)} µs ; ` +
      `options d'interaction (7 verbes) : ${optionsUs.toFixed(1)} µs`,
    );
    // Mesures sur machine au repos : ≈ 2 µs par pas au repos, ≈ 130 µs pendant la rafale de constats,
    // ≈ 40 µs par infraction, ≈ 55 µs par emploi de la force. Les bornes ci-dessous sont volontairement
    // larges (tests lancés en parallèle sur une machine chargée) : seul l'ordre de grandeur est vérifié.
    expect(idleMs).toBeLessThan(0.5);
    expect(busyMs).toBeLessThan(3);
    expect(offenseUs).toBeLessThan(2000);
    expect(forceUs).toBeLessThan(2000);
  });
});
