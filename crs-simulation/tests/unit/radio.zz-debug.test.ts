import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { DirectorApi } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
it('debug', async () => {
  const t = createTestContext({ seed: 4, modules: [createSystems] });
  const director: DirectorApi = { phase: 'affrontement', tension: 0.9, tensionAt: () => 0.9, addTension: () => {}, stats: { total: 0, present: 0, dispersed: 0, radicals: 0, injured: 0, arrested: 0 }, route: [], headProgress: 0 };
  t.ctx.director = director;
  await t.start({ seed: 4 });
  t.ctx.env.setWeather('pluie', true);
  t.ctx.env.setWind(4, 0);
  t.step(400);
  writeFileSync('/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/debug.txt', t.ctx.radio.log.map((m) => m.text).join('\n') + '\n' + JSON.stringify(t.ctx.env.state));
});
