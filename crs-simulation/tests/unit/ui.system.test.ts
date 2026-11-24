// Interface — système en mode headless (Node) : aucun DOM, service des objectifs publié, cycle de session sans erreur.
import { describe, expect, it } from 'vitest';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { HOTKEY_SCREENS } from '@/ui/core/api';
import { UiSystem } from '@/ui/core/system';

describe('ui/système (headless)', () => {
  it('publie EXT.objectives, laisse l’interface neutre en place et ne touche à aucun DOM', async () => {
    const t = createTestContext({ systems: [new UiSystem()] });
    await t.ready;
    const objectives = t.ctx.service<ObjectivesApi>(EXT.objectives);
    expect(objectives).toBeDefined();
    expect(t.ctx.service(EXT.uiKit)).toBeUndefined();
    expect(t.ctx.ui.modal).toBe(false);
    expect(() => t.ctx.ui.notify('Essai', 'info')).not.toThrow();
    expect(() => t.ctx.ui.open('menu_principal')).not.toThrow();
  });

  it('les objectifs sont remis à zéro à chaque nouvelle session', async () => {
    const t = createTestContext({ systems: [new UiSystem()] });
    await t.start();
    const objectives = t.ctx.require<ObjectivesApi>(EXT.objectives);
    objectives.set([{ id: 'a', text: 'Tenir le barrage', state: 'actif', secondary: false, x: 1, z: 2 }]);
    expect(objectives.tracked).toBe('a');
    t.step(1);
    expect(objectives.list.length).toBe(1);
    await t.start();
    expect(objectives.list.length).toBe(0);
    expect(objectives.tracked).toBe('');
    t.ctx.session.end(false);
  });

  it('index du module : le système principal vient en premier, les sous-modules présents sont agrégés', async () => {
    const { createSystems } = await import('@/ui');
    const systems = createSystems();
    expect(systems.length).toBeGreaterThanOrEqual(1);
    expect(systems[0]!.id).toBe('ui');
    expect(new Set(systems.map((s) => s.id)).size).toBe(systems.length);
    // l'ensemble démarre sans DOM (mode headless) et publie le service des objectifs
    const t = createTestContext({ modules: [createSystems], strict: false });
    await t.ready;
    expect(t.ctx.service<ObjectivesApi>(EXT.objectives)).toBeDefined();
    await t.start();
    t.step(0.5);
    t.ctx.session.end(false);
  });

  it('table des touches d’interface : un écran par touche, identifiants stables', () => {
    expect(HOTKEY_SCREENS.pause).toEqual(['pause']);
    expect(HOTKEY_SCREENS.map).toEqual(['carte']);
    expect(HOTKEY_SCREENS.tactical).toEqual(['carte_tactique']);
    expect(HOTKEY_SCREENS.orders).toContain('roue_ordres');
    expect(HOTKEY_SCREENS.radio).toEqual(['radio']);
  });
});
