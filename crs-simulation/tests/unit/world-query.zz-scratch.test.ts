import { describe, it, expect } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/world/query';

describe('exploration', () => {
  it('contexte', async () => {
    const t = createTestContext({ modules: [createSystems] });
    console.log('après création : ready', t.ctx.world.ready, 'nodes', t.ctx.world.nodeCount, t.ctx.world.attribution);
    const events: string[] = [];
    t.ctx.events.on('world:tile_loaded', (e) => events.push(`+${e.tx}_${e.tz}`));
    await t.start();
    console.log('events', events.join(' '), 'loaded(0,0)', t.ctx.world.isLoaded(0, 0), t.ctx.world.surfaceAt(100, -7));
    const pos = { x: 100, z: -18 };
    for (let i = 0; i < 100; i++) { pos.z -= 0.2; t.ctx.world.resolveCircle(pos, 0.3); }
    console.log('pos', pos);
    const out: number[] = [];
    console.log('path', t.ctx.world.findPath(100, -16, -234.5, 82, 'foot', out), out.map((v) => v.toFixed(1)).join(' '));
    console.log('place', t.ctx.world.placeByName('essai')?.name, '|', t.ctx.world.sectorName(0, 30), '|', t.ctx.world.sectorName(300, -7), '|', t.ctx.world.sectorName(0, 360), '|', t.ctx.world.sectorName(-234.5, 60), '|', t.ctx.world.sectorName(480, 480));
    t.step(1);
    expect(t.ctx.world.ready).toBe(true);
  });
});
