// Le compte rendu radio du joueur ne doit pas attendre derrière le trafic de l'IA sur le même canal : relevé de la
// recette (crs-10) : un message de priorité 1 du joueur, soumis à t = 10 s, n'était diffusé qu'à t = 48 s, derrière les
// messages de fermeture de rues de l'IA ; l'objectif ne le compte qu'une fois diffusé (événement radio:message).
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as people } from '@/sim/people';

describe('radio — le message du joueur passe en tête de la file de son canal', () => {
  it('compte rendu du joueur diffusé dès la fin du message en cours, pas après tout le trafic de l’IA', async () => {
    const t = createTestContext({ seed: 3, modules: [people, radio] });
    await t.start({});
    const ctx = t.ctx;
    const me = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, faction: 'police' });
    ctx.player.possess(me.id, 'crs');
    t.step(1);
    const aired: { from: string; t: number }[] = [];
    ctx.events.on('radio:message', (e) => aired.push({ from: e.msg.from, t: e.t }));
    // six messages urgents de l'IA en file sur 'commandement' (fermetures de rues, longues phrases)
    for (let i = 0; i < 6; i++) {
      ctx.radio.say({ channel: 'commandement', from: `CENTRAL ${i}`, priority: 2,
        text: `Ici CENTRAL, fermeture de la rue numéro ${i} au carrefour suivant, barrières en place, déviation par le boulevard, confirmez la réception.` });
    }
    const t0 = ctx.clock.now;
    ctx.radio.say({ channel: 'commandement', from: 'MISTRAL 1 ALFA', priority: 1, personId: me.id, text: 'MISTRAL, ALFA en place au carrefour, rien à signaler.' });
    t.step(120, 0.1);
    const mine = aired.find((a) => a.from === 'MISTRAL 1 ALFA');
    expect(mine).toBeDefined();
    // au plus la fin du premier message de l'IA (déjà sur les ondes), pas les six
    const firstEnd = aired.find((a) => a.from === 'CENTRAL 1');
    expect(mine!.t - t0).toBeLessThan(15);
    expect(firstEnd === undefined || firstEnd.t >= mine!.t).toBe(true);
  });
});
