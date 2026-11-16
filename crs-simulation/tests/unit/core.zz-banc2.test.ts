// Banc comparatif : coût d'un pas du module des personnes (1 500 en marche) — meilleure de 80 séries de 8 pas.
import { describe, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';

describe('banc personnes', () => {
  it('pas de simulation', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const ctx = t.ctx;
    for (let i = 0; i < 1500; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: -12 + (i % 27) * 0.9, z: -Math.floor(i / 27) * 0.9 });
      p.cmd.moveZ = 1;
      p.cmd.moveX = (((i * 7) % 11) - 5) * 0.02;
    }
    t.step(3);
    let best = Infinity;
    for (let run = 0; run < 80; run++) {
      const t0 = performance.now();
      for (let i = 0; i < 8; i++) t.game.step(1 / 30);
      const ms = (performance.now() - t0) / 8;
      if (ms < best) best = ms;
    }
    console.log(`[banc-personnes] meilleur pas : ${best.toFixed(3)} ms`);
  });
});
