// Carte réelle : aucun objet de la carte (lampadaire, potelet, banc, station de vélos…) sur la chaussée, et les murs
// de quai au bord des voies, pas dessus (relevé du commanditaire : « des lampadaires sur la route, les bords de la
// Seine sur la route »).
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { WORLD_DATA_SERVICE } from '@/world/query';
import type { WorldData } from '@/world/query/api';
import type { RoadSample } from '@/core/contracts';
import { parseTileKey } from '@/world/mapdata';

const POINTS: [string, number, number][] = [['île de la Cité', 1760, 1225], ['place de la Concorde', -10, 15]];
/** Objets d'ambiance posés par le jeu lui-même (vélos accrochés aux stations, chaises…) : hors du contrôle. */
const AMBIENT = new Set(['velo', 'chaise', 'trottinette']);

describe('chaussées dégagées sur la carte réelle', () => {
  it('ni mobilier de la carte ni mur de quai sur la chaussée', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: [world, people, items, hazards, props] });
    for (const [name, x, z] of POINTS) {
      await t.start({ mode: 'libre', role: 'crs', place: name, x, z, crowdSize: 0 });
      const { ctx } = t;
      await ctx.world.whenLoaded(x, z, 300);
      t.step(3);
      const data = ctx.service<WorldData>(WORLD_DATA_SERVICE)!;
      const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as unknown as RoadSample;
      // « sur la chaussée » : dans l'emprise roulable d'une voie du réseau (axe et largeur)
      const onRoad = (px: number, pz: number): boolean => {
        const s = ctx.world.surfaceAt(px, pz);
        if (s !== 'road' && s !== 'sett' && s !== 'bridge') return false;
        return ctx.world.nearestRoad(px, pz, road, 40) && road.dist < road.width * 0.5;
      };
      let placed = 0;
      const bad: string[] = [];
      for (const p of ctx.props.list) {
        if (AMBIENT.has(p.kind)) continue;
        placed++;
        if (onRoad(p.x, p.z)) bad.push(`${p.kind}@${p.x.toFixed(0)},${p.z.toFixed(0)}`);
      }
      let wall = 0, wallOnRoad = 0, trees = 0, treesOnRoad = 0;
      for (const key of data.loadedKeys()) {
        const { tx, tz } = parseTileKey(key);
        const tile = data.tile(tx, tz);
        if (!tile) continue;
        const tr = tile.trees;
        for (let i = 0; i < tr.count; i++) {
          trees++;
          if (ctx.world.nearestRoad(tr.x[i]!, tr.z[i]!, road, 14) && road.roadClass !== 'footway' && road.roadClass !== 'pedestrian'
            && road.dist < road.width * 0.5) treesOnRoad++;
        }
        for (const b of tile.barriers) {
          if (b.kind !== 'quay_wall') continue;
          const p = b.points;
          for (let i = 2; i < p.length; i += 2) {
            const ax = p[i - 2]!, az = p[i - 1]!, bx = p[i]!, bz = p[i + 1]!;
            const len = Math.hypot(bx - ax, bz - az);
            const steps = Math.max(1, Math.ceil(len / 2));
            for (let k = 0; k < steps; k++) {
              const u = (k + 0.5) / steps;
              wall += len / steps;
              if (onRoad(ax + (bx - ax) * u, az + (bz - az) * u)) wallOnRoad += len / steps;
            }
          }
        }
      }
      console.log(`${name} : ${placed} objets de la carte posés, ${bad.length} sur chaussée ; murs de quai ${wall.toFixed(0)} m dont ${wallOnRoad.toFixed(0)} m sur chaussée ; ${trees} arbres dont ${treesOnRoad} dans une rue`);
      expect(placed).toBeGreaterThan(500);
      expect(bad).toEqual([]);
      expect(wall).toBeGreaterThan(1000);
      // (reste : des murs posés exactement au bord, que la grille du sol de 1 m arrondit du côté de la voie)
      expect(wallOnRoad / wall).toBeLessThan(0.02);
      // arbres : au bord des rues, pas dedans (quelques-uns restent aux carrefours, sans collision)
      expect(trees).toBeGreaterThan(500);
      expect(treesOnRoad / trees).toBeLessThan(0.004);
    }
  }, 900000);
});
