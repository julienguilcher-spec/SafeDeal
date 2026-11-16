// Foule — déterminisme : même graine, même déroulé (événements, statistiques, positions) ; autre graine,
// autre déroulé. Modules réels, aléas compris.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ALEA_EVENT, METRO_EVENT } from '@/sim/crowd';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

async function play(seed: number): Promise<{ log: string; hash: number; aleas: string }> {
  const t = createCrowdTest({ seed, modules: [world, people, items, hazards, law] });
  const { ctx, core } = t;
  const log: string[] = [];
  const stamp = (): string => ctx.clock.now.toFixed(2);
  ctx.events.on('crowd:phase', (e) => log.push(stamp() + ' phase ' + e.phase));
  ctx.events.on('crowd:tension', (e) => log.push(stamp() + ' tension ' + e.reason + ' ' + e.delta.toFixed(4) + ' ' + e.x.toFixed(2)));
  ctx.events.on('crowd:chant', (e) => log.push(stamp() + ' chant ' + e.text));
  ctx.events.on('person:fled', (e) => log.push(stamp() + ' parti ' + e.id));
  ctx.events.on('person:radicalized', (e) => log.push(stamp() + ' radicalise ' + e.id + ' ' + e.to));
  ctx.events.onAny(ALEA_EVENT, (e) => log.push(stamp() + ' alea ' + (e as { id: string; stage: string }).id + ' ' + (e as { stage: string }).stage));
  ctx.events.onAny(METRO_EVENT, (e) => log.push(stamp() + ' metro ' + (e as { type: string; count: number }).type + ' ' + (e as { count: number }).count));
  await t.start(demoConfig({ crowdSize: 200, duration: 'courte', tension: 0.2, volatility: 0.6, seed }));
  t.run(330);
  // empreinte des positions, émotions et états
  let hash = 0;
  const list = [...core.members].sort((a, b) => a.id - b.id);
  for (const p of list) {
    hash = (Math.imul(hash, 31) + Math.round(p.x * 100)) | 0;
    hash = (Math.imul(hash, 31) + Math.round(p.z * 100)) | 0;
    hash = (Math.imul(hash, 31) + Math.round(p.anger * 1000) + Math.round(p.fear * 1000)) | 0;
  }
  const s = ctx.director.stats;
  log.push('stats ' + JSON.stringify(s) + ' tete ' + ctx.director.headProgress.toFixed(3) + ' tension ' + ctx.director.tension.toFixed(5));
  return { log: log.join('\n'), hash, aleas: core.aleas.infos.filter((a) => a.status !== '').map((a) => a.id).join(',') };
}

describe('foule — déterminisme', () => {
  it('même graine, même déroulé ; autre graine, autre déroulé', async () => {
    const a = await play(1234);
    const b = await play(1234);
    const c = await play(4321);
    expect(a.log.split('\n').length).toBeGreaterThan(60);
    expect(b.log).toBe(a.log);
    expect(b.hash).toBe(a.hash);
    expect(b.aleas).toBe(a.aleas);
    expect(c.log).not.toBe(a.log);
    expect(c.hash).not.toBe(a.hash);
    console.log('[foule] déterminisme :', a.log.split('\n').length, 'événements identiques ; aléas graine 1234 :', a.aleas, '; graine 4321 :', c.aleas);
  }, 600_000);
});
