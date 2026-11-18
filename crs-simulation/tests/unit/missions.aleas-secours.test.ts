// Aléa de phase joué pour un pompier ou un soignant du SAMU : l'annonce passe sur le réseau des secours qu'il écoute
// (PARIS, SAMU 75), pas seulement par la salle de police sur 'commandement', que son filtre d'écoute écarte.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as people } from '@/sim/people';
import { createSystems as radio } from '@/gameplay/radio';
import { ExecutantRadioFilter, listenForRole } from '@/gameplay/radio/relevance';
import { PhaseAleas } from '@/gameplay/missions/aleas';

describe('aléas des phases : annonce entendue par le joueur secouriste', () => {
  for (const [kind, from] of [['pompier', 'PARIS'], ['samu', 'SAMU 75']] as const) {
    it(`${kind} : l'aléa est annoncé par ${from} sur le réseau des secours`, async () => {
      const t = createTestContext({ seed: 2, strict: false, modules: [people, radio] });
      await t.start({ role: 'secouriste' });
      const ctx = t.ctx;
      const me = ctx.people.spawn({ kind, x: 0, z: 0, faction: 'rescue' });
      ctx.player.possess(me.id, 'secouriste');
      t.step(1);
      new PhaseAleas().play(ctx, 'Averse de deux minutes');
      t.step(10);
      const listen = listenForRole('secouriste')!;
      const filter = new ExecutantRadioFilter();
      const heard = ctx.radio.log.filter((m) => /averse/i.test(m.text) && filter.acceptChannel(m, listen, me.id, m.t));
      expect(heard.map((m) => `${m.channel}|${m.from}`)).toEqual([`secours|${from}`]);
    });
  }

  it('policier : annonce de la salle sur commandement, inchangée', async () => {
    const t = createTestContext({ seed: 2, strict: false, modules: [people, radio] });
    await t.start({ role: 'crs' });
    const ctx = t.ctx;
    const me = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, faction: 'police' });
    ctx.player.possess(me.id, 'crs');
    t.step(1);
    new PhaseAleas().play(ctx, 'Averse de deux minutes');
    t.step(10);
    expect(ctx.radio.log.filter((m) => /averse/i.test(m.text)).map((m) => `${m.channel}|${m.from}`)).toEqual(['commandement|SALLE']);
  });
});
