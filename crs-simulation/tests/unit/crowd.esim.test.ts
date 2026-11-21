// Foule — identité sociale (ESIM) : la même foule calme, les mêmes forces à 20 m. Dans un cas elles restent
// à distance ; dans l'autre elles emploient la force sans sommation contre des pacifiques (verdict défavorable
// du vrai module de droit, vraies grenades, vrais coups). La colère, la tension et les radicalisations doivent
// être nettement supérieures dans le second cas, et la légitimité perçue s'effondrer.
import { describe, expect, it } from 'vitest';
import type { Person, ProtestProfile } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { CROWD_CORE } from '@/sim/crowd';
import type { CrowdCoreApi } from '@/sim/crowd';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const CHAIN: ProtestProfile[] = ['pacifique', 'militant', 'opportuniste', 'radical'];

interface Outcome {
  anger: number; angerNear: number; fear: number; radicalized: number; deradicalized: number; tension: number; legitimacy: number;
  verdicts: string[]; reasons: string[]; present: number; equipped: number;
}

async function scenario(force: boolean): Promise<Outcome> {
  const t = createCrowdTest({ seed: 21, modules: [world, people, items, hazards, law] });
  const { ctx, core } = t;
  let radicalized = 0;
  let deradicalized = 0;
  ctx.events.on('person:radicalized', (e) => {
    if (CHAIN.indexOf(e.to) > CHAIN.indexOf(e.from)) radicalized++;
    else deradicalized++;
  });
  const reasons: string[] = [];
  ctx.events.on('crowd:tension', (e) => reasons.push(e.reason));
  await t.start(demoConfig({
    crowdSize: 300, tension: 0.05, volatility: 0.5,
    extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.scenario': 'marche_calme' },
  }));
  const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
  t.run(4);
  const f = core.formation;
  // une ligne de six agents, 20 m devant la tête du rassemblement
  core.corridor.at(f.headS + 20, core.rp);
  const lx = core.rp.x;
  const lz = core.rp.z;
  const line: Person[] = [];
  for (let i = 0; i < 6; i++) {
    line.push(ctx.people.spawn({
      kind: 'crs', faction: 'police', rank: 'gardien', poste: 'bouclier',
      x: lx - core.rp.tz * (i - 2.5) * 0.9, z: lz + core.rp.tx * (i - 2.5) * 0.9, heading: Math.atan2(-core.rp.tx, -core.rp.tz),
    }));
  }
  const verdicts: string[] = [];
  const isCalm = (p: Person): boolean => p.faction === 'protest' && (p.profile === 'pacifique' || p.profile === 'famille') && p.posture !== 'down';
  for (let round = 0; round < 12; round++) {
    if (force) {
      const by = line[round % line.length]!;
      // grenade lacrymogène dans la foule calme, sans sommation
      core.corridor.at(f.headS - 6 - (round % 4) * 9, core.rp);
      const v1 = ctx.law.reportForce(by, 'lacrymo', null, core.rp.x, core.rp.z);
      verdicts.push(v1.kind);
      ctx.projectiles.spawn('grenade_lacrymo_main', by.id, core.rp.x, 0.3, core.rp.z, 0, 0, 0);
      // coup de bâton sur un manifestant pacifique
      const victim = ctx.people.nearest(by.x, by.z, 60, isCalm);
      if (victim) {
        const v2 = ctx.law.reportForce(by, 'baton', victim, victim.x, victim.z);
        verdicts.push(v2.kind);
        ctx.health.hurt(victim, { amount: 14, kind: 'blunt', sourceId: by.id, means: 'baton', item: 'baton', x: victim.x, z: victim.z, zone: 0.6 });
      }
    }
    t.run(7);
  }
  const crowd = t.protesters();
  const mean = (list: Person[], get: (p: Person) => number): number => (list.length > 0 ? list.reduce((a, p) => a + get(p), 0) / list.length : 0);
  core.corridor.at(f.headS - 15, core.rp);
  const near = crowd.filter((p) => Math.hypot(p.x - core.rp.x, p.z - core.rp.z) < 60);
  return {
    anger: mean(crowd, (p) => p.anger), angerNear: mean(near, (p) => p.anger), fear: mean(crowd, (p) => p.fear), radicalized, deradicalized,
    tension: ctx.director.tension, legitimacy: api.legitimacyAt(core.rp.x, core.rp.z), verdicts, reasons: [...new Set(reasons)],
    present: ctx.director.stats.present, equipped: crowd.filter((p) => p.profile === 'opportuniste' || p.profile === 'radical').length,
  };
}

describe('foule — légitimité et radicalisation (ESIM)', () => {
  it('une force illégitime contre une foule calme la soude et la radicalise ; la retenue la laisse calme', async () => {
    const control = await scenario(false);
    const abuse = await scenario(true);
    const brief = (o: Outcome): string => `colère ${o.anger.toFixed(2)} (près : ${o.angerNear.toFixed(2)}) peur ${o.fear.toFixed(2)} tension ${o.tension.toFixed(2)} légitimité ${o.legitimacy.toFixed(2)} radicalisations ${o.radicalized} présents ${o.present}`;
    console.log('[foule] ESIM — témoin :', brief(control), '\n[foule] ESIM — force illégitime :', brief(abuse), '| verdicts', [...new Set(abuse.verdicts)].join(','), '| motifs', abuse.reasons.join(','));

    // le module de droit a bien jugé ces emplois de la force défavorablement
    expect(abuse.verdicts.length).toBeGreaterThanOrEqual(12);
    for (const v of abuse.verdicts) expect(v).not.toBe('licite');
    expect(abuse.reasons).toContain('gaz_non_justifie');
    expect(abuse.reasons).toContain('pacifique_frappe');

    // témoin : la foule reste calme, personne ne se radicalise, la légitimité tient
    expect(control.radicalized).toBe(0);
    expect(control.anger).toBeLessThan(0.15);
    expect(control.tension).toBeLessThan(0.25);
    expect(control.legitimacy).toBeGreaterThan(0.6);

    // force illégitime : colère, tension et radicalisations nettement supérieures
    expect(abuse.anger).toBeGreaterThan(control.anger + 0.2);
    expect(abuse.angerNear).toBeGreaterThan(control.angerNear + 0.15);
    expect(abuse.tension).toBeGreaterThan(control.tension + 0.25);
    expect(abuse.legitimacy).toBeLessThan(0.35);
    expect(abuse.radicalized).toBeGreaterThanOrEqual(control.radicalized + 8);
    // la peur est là aussi : la foule ne fait pas que s'indigner, une partie s'en va
    expect(abuse.fear).toBeGreaterThan(control.fear);
    expect(abuse.present).toBeLessThan(control.present);
  }, 600_000);
});
