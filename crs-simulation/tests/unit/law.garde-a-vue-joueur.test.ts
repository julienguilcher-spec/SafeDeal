// Joueur non policier (journaliste, manifestant, street medic) interpellé puis remis à l'OPJ : la garde à vue
// commence et la partie doit s'arrêter là (compte rendu) — sans cela, le joueur reste assis menotté dans le
// fourgon, sans commande, jusqu'à ce qu'il quitte par le menu pause (aucune mission de mode libre ne le prévoit).
import { describe, expect, it } from 'vitest';
import type { InteractVerb, Person } from '@/core/contracts';
import type { LawTest } from '@/gameplay/law/testkit';
import { attackOfficer, crs, protester, startLaw } from '@/gameplay/law/testkit';

function act(law: LawTest, actor: Person, verb: InteractVerb, targetId: number): boolean {
  if (!law.ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = law.ctx.interactions.current(actor);
  if (cur) law.t.step(cur.opt.duration + 0.1);
  return true;
}

async function arrestPlayer(remis: boolean): Promise<{ law: LawTest; me: Person }> {
  const law = await startLaw({ seed: 5, config: { mode: 'libre', role: 'manifestant' } });
  const { ctx } = law;
  const agent = crs(ctx, 0, 0, { poste: 'interpellation' });
  const collegue = crs(ctx, 1.5, 1.5, { poste: 'interpellation' });
  const me = protester(ctx, 0, 1.2, 'radical');
  ctx.player.possess(me.id, 'manifestant');
  attackOfficer(ctx, me, collegue);
  for (let i = 0; i < 10 && me.custody !== 'held'; i++) {
    agent.x = me.x;
    agent.z = me.z - 1;
    ctx.people.rebuildIndex();
    act(law, agent, 'maitriser', me.id);
    if ((me.custody as string) !== 'held') law.t.step(2.1);
  }
  expect(me.custody).toBe('held');
  expect(act(law, agent, 'menotter', me.id)).toBe(true);
  expect(act(law, agent, 'escorter', me.id)).toBe(true);
  if (remis) {
    ctx.vehicles.spawn('fourgon_cellulaire', agent.x + 3, agent.z, 0, { faction: 'police' });
    expect(act(law, agent, 'remettre', me.id)).toBe(true);
    expect(me.custody).toBe('in_vehicle');
  }
  return { law, me };
}

describe('droit — garde à vue du joueur non policier', () => {
  it('remis à l’OPJ : la session passe au compte rendu au bout de quelques secondes', async () => {
    const { law } = await arrestPlayer(true);
    expect(law.ctx.session.phase).toBe('playing');
    law.t.step(20);
    expect(law.ctx.session.phase).toBe('debrief');
    expect(law.notices.some((n) => n.text.includes('garde à vue'))).toBe(true);
  });

  it('simplement escorté (procédure en cours) : la session continue', async () => {
    const { law, me } = await arrestPlayer(false);
    law.t.step(1);
    expect(me.custody === 'escorted' || me.custody === 'cuffed').toBe(true);
    expect(law.ctx.session.phase).toBe('playing');
  });
});
