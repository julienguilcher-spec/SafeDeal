// Une rue barrée par une troupe se contourne : l'itinéraire à pied de chacun (manifestant, passant) passe par les
// autres rues ; quand plus aucune rue ne mène au but (nasse), il n'y a pas d'itinéraire.
// Quartier d'essai : rue du Pont (14 m entre façades, axe x = 0), carrefour de la rue de la Fontaine (z = −160).
import { describe, expect, it } from 'vitest';
import { EXT } from '@/core/extensions';
import type { CordonsApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as traffic } from '@/sim/traffic';
import { POLICE_BARRAGES_SERVICE } from '@/sim/police/api';
import type { BarragesApi } from '@/sim/police/api';
import { footAround, pathCrossesCordon } from '@/sim/crowd/detour';
import { startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, traffic];
const CONFIG = { mode: 'test' as const, x: 0, z: 0, extra: { 'traffic.vehicles': 0, 'traffic.pedestrians': 0 } };

describe('police — rue barrée : itinéraires à pied', () => {
  it('un itinéraire qui passait par la rue barrée la contourne ; nassé, il n’y en a plus', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: Math.PI, vehicles: false });
    ctx.squads.issue(sec.squad.id, { type: 'tenir', x: 0, z: -100, heading: Math.PI, width: 0 });
    const api = ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE);
    pt.run(120, 1, () => api.list.some((b) => b.squadId === sec.squad.id && b.state === 'en_place'));
    expect(api.list.find((b) => b.squadId === sec.squad.id)?.state).toBe('en_place');
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    expect(cordons.count).toBeGreaterThan(5);
    // d'un côté à l'autre de la rue barrée
    const direct: number[] = [];
    expect(ctx.world.findPath(0, -60, 0, -140, 'foot', direct)).toBe(true);
    expect(pathCrossesCordon(cordons, direct)).toBe(true);
    const around: number[] = [];
    const ok = footAround(ctx, 0, -60, 0, -140, cordons, around);
    let len = 0;
    for (let i = 2; i < around.length; i += 2) len += Math.hypot(around[i]! - around[i - 2]!, around[i + 1]! - around[i - 1]!);
    console.log('détour :', ok, Math.round(len), 'm,', around.length / 2, 'points');
    expect(ok).toBe(true);
    expect(pathCrossesCordon(cordons, around)).toBe(false);
    expect(Math.hypot(around[around.length - 2]! - 0, around[around.length - 1]! + 140)).toBeLessThan(1);
    expect(len).toBeGreaterThan(90);
  }, 300000);
  it('carrefour dont les quatre rues sont barrées : aucun itinéraire n’en sort', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const C = { x: 0, z: -160 };
    const posts = [
      { x: 0, z: C.z - 40, h: 0 }, { x: 0, z: C.z + 40, h: Math.PI }, { x: 40, z: C.z, h: -Math.PI / 2 }, { x: -40, z: C.z, h: Math.PI / 2 },
    ];
    const ids: number[] = [];
    for (const p of posts) {
      const s = pt.units.createSection({ x: p.x - Math.sin(p.h) * 15, z: p.z - Math.cos(p.h) * 15, heading: p.h, vehicles: false });
      ctx.squads.issue(s.squad.id, { type: 'tenir', x: p.x, z: p.z, heading: p.h, width: 0 });
      ids.push(s.squad.id);
    }
    const api = ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE);
    pt.run(120, 1, () => api.list.filter((b) => ids.includes(b.squadId) && b.state === 'en_place').length === 4);
    pt.step(2);
    expect(api.list.filter((b) => ids.includes(b.squadId) && b.state === 'en_place').length).toBe(4);
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    const out: number[] = [];
    for (const goal of [{ x: 0, z: -300 }, { x: 0, z: -40 }, { x: 150, z: -160 }, { x: -150, z: -160 }]) {
      expect(footAround(ctx, C.x + 2, C.z + 3, goal.x, goal.z, cordons, out)).toBe(false);
    }
  }, 300000);
});
