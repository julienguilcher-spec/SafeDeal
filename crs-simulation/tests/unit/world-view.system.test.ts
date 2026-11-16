// Le module de la ville en 3D dans le moteur : branchement sans rendu (mode headless), services publiés.
import { describe, expect, it } from 'vitest';
import { SystemOrder } from '../../src/core/contracts';
import { createTestContext } from '../../src/core/testing';
import { createSystems as createWorldQuery } from '../../src/world/query';
import { CURB_HEIGHT, MAP_NORTH_UP, WORLD_MAP2D_SERVICE, WORLD_VIEW_SERVICE, createSystems, createWorldViewSystems } from '../../src/world/view';
import type { Map2dApi, WorldViewApi } from '../../src/world/view/api';

describe('ville 3D — système', () => {
  it('un seul système, à l\'ordre WORLD_VIEW', () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0].id).toBe('world:view');
    expect(systems[0].order).toBe(SystemOrder.WORLD_VIEW);
    expect(createWorldViewSystems({ buildings: false, horizon: false, farTiles: null }).length).toBe(1);
  });

  it('sans rendu (ctx.view nul) : rien ne plante, les services existent et répondent', async () => {
    const t = createTestContext({ modules: [createWorldQuery, createSystems] });
    await t.ready;
    const view = t.ctx.service<WorldViewApi>(WORLD_VIEW_SERVICE);
    const map = t.ctx.service<Map2dApi>(WORLD_MAP2D_SERVICE);
    expect(view).toBeDefined();
    expect(map).toBeDefined();
    if (!view || !map) return;
    await t.start({ x: 0, z: 0 });
    t.step(1);
    expect(view.pending()).toBeGreaterThanOrEqual(0);
    expect(view.flush(5)).toBe(true);
    expect(view.liftAt(10, 10)).toBe(0);
    expect(view.benchTile(0, 0, 1)).toBeNull();
    const st = view.stats();
    expect(st.detailTiles).toBe(0);
    expect(st.farTiles).toBe(0);
    expect(st.drawCalls).toBe(0);
    const out = { x: 0, y: 0 };
    map.worldToScreen(0, 0, 0, 0, 1, MAP_NORTH_UP, 100, 100, out);
    expect(out).toEqual({ x: 50, y: 50 });
    // les événements du monde n'y changent rien
    t.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    t.ctx.events.emit('world:tile_unloaded', { tx: 0, tz: 0 });
    t.ctx.events.emitAny('world:source', { name: 'test-district', fallback: false });
    t.step(0.5);
    t.game.dispose();
  });

  it('la hauteur de bordure publiée est celle des trottoirs dessinés', () => {
    expect(CURB_HEIGHT).toBeGreaterThan(0.05);
    expect(CURB_HEIGHT).toBeLessThan(0.15);
  });
});
