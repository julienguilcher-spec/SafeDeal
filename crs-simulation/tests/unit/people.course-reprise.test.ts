// Course automatique (avance tenue) : la durée d'avance tenue repart de zéro quand les commandes sont coupées
// (écran ouvert, montée à bord) — on ne repart pas en pleine course sans avoir de nouveau tenu l'avance.
import { describe, expect, it } from 'vitest';
import type { UiApi } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import { ScriptedInput, createFakeActions, createScriptedInputSystem } from '@/sim/people/testkit';

const DT = 1 / 30;

describe('course automatique — reprise après interruption', () => {
  it('après un écran modal, l\'avance tenue repart de la marche', async () => {
    const input = new ScriptedInput();
    const t = createTestContext({ modules: [createSystems], systems: [createScriptedInputSystem(input)] });
    await t.start();
    const ctx = t.ctx;
    ctx.actions = createFakeActions(ctx);
    const me = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: 0 });
    ctx.player.possess(me.id, 'crs');
    let modal = false;
    const base = ctx.ui;
    ctx.ui = Object.create(base, { modal: { get: () => modal } }) as UiApi;
    input.setMove(0, 1);
    t.step(4, DT);
    expect(me.cmd.gait).toBe(2);
    // écran ouvert (carte, menu) : l'avance reste enfoncée pendant la lecture
    modal = true;
    t.step(5, DT);
    modal = false;
    t.game.step(DT);
    console.log('allure au premier pas après fermeture de l\'écran :', me.cmd.gait);
    expect(me.cmd.gait).toBe(0);
  });
});
