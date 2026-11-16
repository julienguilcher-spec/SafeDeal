// Tests du branchement du module : en mode headless (tests Node) le système publie son service et ne
// touche ni au DOM ni au GPU.
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { createSystems, registerHeldModel } from '@/render/people/index';
import type { PeopleRenderApi } from '@/render/people/api';

describe('rendu des personnages — système', () => {
  it('se branche en mode headless sans rien dessiner', () => {
    const services = new Map<string, unknown>();
    const ctx = {
      headless: true,
      view: null,
      provide: (k: string, s: unknown) => { services.set(k, s); },
      service: (k: string) => services.get(k),
    } as unknown as GameContext;
    const systems = createSystems();
    expect(systems.length).toBe(1);
    const sys = systems[0];
    expect(sys.id).toBe('render.people');
    expect(sys.order).toBe(SystemOrder.VIEW);
    sys.provide?.(ctx);
    void sys.init?.(ctx);
    sys.frame?.(0.016);
    sys.reset?.();
    const api = ctx.service<PeopleRenderApi>('peopleRender');
    expect(api).toBeDefined();
    expect(api!.heldModelKeys()).toContain('bouclier');
    expect(api!.stats.near).toBe(0);
    expect(api!.bonePosition(1, 'head', { x: 0, y: 0, z: 0 })).toBe(false);
    api!.registerHeldModel('objet_de_mission', (g) => { g.fixed(0x00ff00).box(0.012, -0.085, 0, 0.05, 0.05, 0.2); }, { hold: 'stick' });
    api!.aliasHeldModel('objet_de_mission_bis', 'objet_de_mission');
    expect(api!.heldModelKeys()).toContain('objet_de_mission_bis');
    registerHeldModel('objet_global', (g) => { g.fixed(0x0000ff).box(0.012, -0.085, 0, 0.05, 0.05, 0.05); });
    expect(api!.heldModelKeys()).toContain('objet_global');
    api!.invalidate();
    sys.dispose?.();
  });
});
