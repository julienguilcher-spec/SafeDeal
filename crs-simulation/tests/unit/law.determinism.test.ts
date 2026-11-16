import { describe, expect, it } from 'vitest';
import type { InteractVerb, Person } from '@/core/contracts';
import type { LawTest } from '@/gameplay/law/testkit';
import { attackOfficer, commissaire, crowd, crs, person, protester, startLaw } from '@/gameplay/law/testkit';

function act(law: LawTest, actor: Person, verb: InteractVerb, targetId: number): boolean {
  if (!law.ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = law.ctx.interactions.current(actor);
  if (cur) law.t.step(cur.opt.duration + 0.05);
  return true;
}

/** Scénario complet : sommations, violences, emplois de la force, série d'interpellations. Retourne une empreinte. */
async function scenario(seed: number): Promise<string> {
  const law = await startLaw({ seed, config: { duration: 'courte' } });
  const { ctx, cfg } = law;
  const com = commissaire(ctx, 0, 0);
  const agents = [crs(ctx, -2, 2), crs(ctx, 0, 2), crs(ctx, 2, 2, { poste: 'chef_groupe', rank: 'brigadier_chef' })];
  const foule = crowd(ctx, 0, 25, 60);
  const jri = person(ctx, 'journaliste', 8, 10);
  jri.upper = 'film';
  jri.aimYaw = Math.PI * 0.75;
  const offenses: string[] = [];
  const failures: string[] = [];
  ctx.events.on('law:offense', (e) => offenses.push(e.personId + ':' + e.offense.type + ':' + (e.offense.witnessed ? 'v' : '-') + (e.offense.filmed ? 'f' : '-')));
  ctx.events.onAny('law:arrest_failed', (e) => failures.push((e as { outcome: string }).outcome));

  ctx.law.reportForce(agents[0]!, 'lacrymo', null, 0, 25);
  ctx.law.sommation(com);
  law.t.step(cfg.delayAnnonce + 0.1);
  attackOfficer(ctx, foule[7]!, agents[1]!);
  ctx.law.reportForce(agents[1]!, 'lbd', foule[7]!, foule[7]!.x, foule[7]!.z);
  ctx.law.sommation(com);
  law.t.step(cfg.delaySommation + 0.1);
  ctx.law.sommation(com);
  law.t.step(cfg.delayForce + cfg.attroupementStay + 3);
  ctx.law.reportForce(agents[2]!, 'lacrymo', null, 0, 25);

  // série d'interpellations de radicaux en colère : l'issue de chacune dépend d'un tirage
  const outcomes: string[] = [];
  for (let i = 0; i < 24; i++) {
    const dur = protester(ctx, -2, 3.2, 'radical');
    dur.anger = 0.5 + (i % 5) * 0.1;
    ctx.law.recordOffense(dur, 'jet_projectile', dur.x, dur.z);
    ctx.people.rebuildIndex();
    const actor = agents[0]!;
    actor.health = 100;
    actor.posture = 'stand';
    act(law, actor, 'maitriser', dur.id);
    outcomes.push(dur.custody);
    if (dur.custody === 'held') {
      act(law, actor, 'menotter', dur.id);
      act(law, actor, 'palper', dur.id);
      act(law, actor, 'relacher', dur.id);
    }
    ctx.people.remove(dur.id);
    law.t.step(2.1);
  }

  return JSON.stringify({
    roe: ctx.law.roe,
    forces: ctx.law.forceLog.map((r) => [r.t.toFixed(4), r.byId, r.means, r.targetId, r.verdict.kind, r.verdict.severity, r.filmed]),
    offenses,
    outcomes,
    failures,
    arrests: law.records.interpellations.map((a) => [a.targetId, a.founded, a.status, a.strength, a.t.toFixed(4)]),
    score: law.records.score,
    radio: law.radio.map((m) => m.text),
    summary: law.records.summary(),
    health: agents.map((a) => a.health.toFixed(6)),
  });
}

describe('droit — déterminisme', () => {
  it('même graine, même déroulé au bit près', async () => {
    const a = await scenario(7);
    const b = await scenario(7);
    expect(b).toBe(a);
    const parsed = JSON.parse(a) as { outcomes: string[]; forces: unknown[]; offenses: string[] };
    // le scénario a bien produit de la matière
    expect(parsed.forces.length).toBeGreaterThan(8);
    expect(parsed.offenses.length).toBeGreaterThan(60);
    expect(parsed.outcomes).toContain('held');
    expect(parsed.outcomes).toContain('free');
  });

  it('une autre graine change l\'issue des interpellations, pas les verdicts de droit', async () => {
    const a = JSON.parse(await scenario(7)) as { outcomes: string[]; forces: unknown[][] };
    const b = JSON.parse(await scenario(8)) as { outcomes: string[]; forces: unknown[][] };
    expect(b.outcomes.join()).not.toBe(a.outcomes.join());
    // les quatre premiers emplois de la force (avant les interpellations) reçoivent les mêmes verdicts
    expect(b.forces.slice(0, 3).map((f) => f[4])).toEqual(a.forces.slice(0, 3).map((f) => f[4]));
    expect(a.forces.slice(0, 3).map((f) => f[4])).toEqual(['sans_sommation', 'licite', 'licite']);
  });

  it('le module ne consomme pas le générateur du contexte', async () => {
    const law = await startLaw({ seed: 5 });
    const ref = await startLaw({ seed: 5 });
    const agent = crs(law.ctx, 0, 0);
    crs(ref.ctx, 0, 0);
    for (let i = 0; i < 10; i++) {
      const p = protester(law.ctx, 0, 1.2, 'radical');
      protester(ref.ctx, 0, 1.2, 'radical');
      law.ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z);
      law.ctx.people.rebuildIndex();
      act(law, agent, 'maitriser', p.id);
      law.ctx.people.remove(p.id);
      law.t.step(2.1);
    }
    expect(law.ctx.rng.next()).toBe(ref.ctx.rng.next());
  });
});
