// Touche L / pastille tactile « Lampe » (bouton 'flashlight') : à pied, elle allume et éteint la lampe torche de la
// dotation sans changer l'objet en main ; sans lampe, un message le dit ; en véhicule, L reste les phares.
import { describe, expect, it } from 'vitest';
import type { UiApi } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { ScriptedInput, createScriptedInputSystem } from '@/sim/people/testkit';

const DT = 1 / 30;

async function setup() {
  const input = new ScriptedInput();
  const t = createTestContext({ modules: [people, items], systems: [createScriptedInputSystem(input)] });
  await t.start();
  const ctx = t.ctx;
  const notes: string[] = [];
  const ui = ctx.ui as UiApi;
  const notify = ui.notify.bind(ui);
  ui.notify = (text: string, ...rest: unknown[]) => {
    notes.push(text);
    return (notify as (...a: unknown[]) => void)(text, ...rest);
  };
  const me = ctx.people.spawn({ kind: 'pompier', x: 0, z: 0, heading: 0 });
  ctx.player.possess(me.id, 'secouriste');
  const tap = (): void => {
    input.press('flashlight');
    t.game.step(DT);
    input.release('flashlight');
    t.game.step(DT);
    t.game.step(0.5);
  };
  return { t, ctx, me, tap, notes, api: ctx.require<ItemsApi>('items') };
}

describe('touche « Lampe » (L à pied)', () => {
  it('allume puis éteint la lampe de la dotation, sans changer l\'objet en main', async () => {
    const { ctx, me, tap, api } = await setup();
    ctx.actions.give(me, 'extincteur', 1);
    ctx.actions.give(me, 'lampe', 1);
    const active = me.active;
    expect(api.lampOn(me)).toBe(false);
    tap();
    expect(api.lampOn(me)).toBe(true);
    expect(me.active).toBe(active);
    tap();
    expect(api.lampOn(me)).toBe(false);
  });

  it('sans lampe : message clair au lieu d\'une touche muette', async () => {
    const { tap, notes } = await setup();
    tap();
    expect(notes.some((n) => /lampe/i.test(n))).toBe(true);
  });
});
