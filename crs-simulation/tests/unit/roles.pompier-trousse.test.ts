// Le sapeur-pompier joué (rôle « secouriste », service pompier) porte une trousse de secours hors mission : le HUD
// l'appelle auprès des blessés et le geste « soigner » demande la trousse (relevé de la recette : en mode libre ou en
// patrouille, le joueur pompier n'avait que lance, extincteurs, radio et lampe).
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as items } from '@/sim/items';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';

describe('rôle secouriste, service pompier : dotation du joueur', () => {
  it('le joueur pompier a sa lance ET une trousse de secours (mode libre, sans mission)', async () => {
    const t = createTestContext({ seed: 5, strict: true, modules: [world, roles, people, vehicles, items, radio, incidents, rescue, session] });
    await t.start({
      mode: 'libre', missionId: '', role: 'secouriste', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0,
      duration: 'standard', extra: { variante: 'pompier', 'crowd.none': true },
    });
    t.step(3);
    const me = t.ctx.player.person()!;
    expect(me.kind).toBe('pompier');
    expect(t.ctx.actions.has(me, 'lance_incendie')).toBeGreaterThan(0);
    expect(t.ctx.actions.has(me, 'trousse_secours')).toBeGreaterThan(0);
  }, 120000);
});
