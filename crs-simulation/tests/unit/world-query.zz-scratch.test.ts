import { describe, it, expect } from 'vitest';
import { createWorldQuery } from '@/world/query';
import { FsMapSource } from '@/world/query/source-fs';
import { sampleTerrain } from '@/world/mapdata';

describe('exploration', () => {
  it('pont de la Concorde', async () => {
    const w = createWorldQuery({ source: 'paris', parisSource: new FsMapSource() });
    await w.boot();
    w.setFocus(-130, 350);
    await w.whenLoaded(-130, 350, 400);
    // arêtes de pont proches
    const sample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    const seen = new Set<number>();
    for (let z = 200; z <= 480; z += 5) for (let x = -220; x <= -40; x += 5) if (w.nearestRoad(x, z, sample, 10) && w.edge(sample.edgeId).bridge) seen.add(sample.edgeId);
    for (const e of seen) { const ed = w.edge(e); console.log(`arête ${e} « ${ed.name} » largeur ${ed.width} trottoir ${ed.sidewalk} longueur ${ed.length.toFixed(0)} de (${ed.points[0].toFixed(0)}, ${ed.points[1].toFixed(0)}) à (${ed.points[ed.points.length - 2].toFixed(0)}, ${ed.points[ed.points.length - 1].toFixed(0)}) sens unique ${ed.oneway} piéton ${ed.pedestrianOnly}`); }
    const data = w.data;
    const first = [...seen][0];
    const ed = w.edge(first);
    const ax = ed.points[0], az = ed.points[1], bx = ed.points[ed.points.length - 2], bz = ed.points[ed.points.length - 1];
    const lines: string[] = [];
    for (let i = -3; i <= 13; i++) {
      const t = i / 10;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      lines.push(`t=${t.toFixed(1)} (${x.toFixed(0)}, ${z.toFixed(0)}) sol ${w.heightAt(x, z).toFixed(2)} relief ${sampleTerrain(data.terrain, x, z).toFixed(2)} surface ${w.surfaceAt(x, z)} plein ${w.isSolidAt(x, z)}`);
    }
    console.log(lines.join('\n'));
    console.log('niveau eau', w.waterLevel);
    expect(true).toBe(true);
  }, 300000);
});
