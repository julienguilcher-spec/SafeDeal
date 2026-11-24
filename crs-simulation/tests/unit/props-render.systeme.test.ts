// Rendu du décor — le système se branche sans rendu (mode headless) : service publié, aucun effet, aucune exception.
import { describe, expect, it } from 'vitest';
import { SystemOrder } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { PROPS_RENDER_KEY, createSystems } from '@/render/props/index';
import type { PropsRenderApi } from '@/render/props/index';

describe('rendu du décor — système', () => {
  it('un seul système de présentation, à l\'ordre VIEW', () => {
    const systems = createSystems();
    expect(systems).toHaveLength(1);
    expect(systems[0]!.order).toBe(SystemOrder.VIEW);
    expect(systems[0]!.id).toBe('render.props');
    // présentation pure : pas de pas de simulation
    expect(systems[0]!.update).toBeUndefined();
  });

  it('sans ctx.view (tests Node) : service publié, statistiques vides, rien ne plante', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const api = t.ctx.service<PropsRenderApi>(PROPS_RENDER_KEY);
    expect(api).toBeDefined();
    expect(api!.dormantMode).toBe('lointain');
    const p = t.ctx.props.spawn('conteneur', 3, 4, 0.5);
    const s = t.ctx.props.addShop({ category: 'cafe_restaurant', x: 10, z: 0, heading: 0, width: 5, name: 'Café des Tilleuls' });
    p.state = 'burning';
    s.window = 'broken';
    t.ctx.events.emit('prop:damaged', { id: p.id, state: 'burning', byId: 0 });
    t.ctx.events.emit('shop:window', { id: s.id, state: 'broken', byId: 0 });
    t.step(1);
    t.ctx.props.remove(p.id);
    t.step(0.5);
    api!.dormantMode = 'masque';
    api!.invalidate();
    api!.resetPeak();
    expect(api!.stats.props).toBe(0);
    expect(api!.stats.drawCalls).toBe(0);
    // le rendu ne touche pas à la simulation
    expect(t.ctx.props.shops).toHaveLength(1);
    expect(s.window).toBe('broken');
    // nouvelle session : remise à zéro sans erreur
    await t.start();
    t.step(0.2);
  });
});
