/* =====================================================================================
 * DANGERS DIFFUS — aides de test (non importées par le jeu : seulement par tests/unit/hazards.*).
 * ===================================================================================== */

import type { GameContext, GameSystem, HazardApi, SessionConfig, WorldQuery } from '@/core/contracts';
import { createNullWorld } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { HAZARD_FIELD_SERVICE } from './api';
import type { HazardFieldView } from './api';
import type { HazardTuning } from './config';
import { HazardsSystem } from './system';

/** Vent parfaitement régulier : ni rafale, ni saute, ni brassage (mesures exactes). */
export const STEADY: Partial<HazardTuning> = { gust: 0, veer: 0, meander: 0 };

/** Monde factice : plan infini du monde neutre, avec du bâti là où `built` répond vrai. */
export function fakeWorld(built: (x: number, z: number) => boolean, height = 18): WorldQuery {
  return { ...createNullWorld(), buildingHeightAt: (x: number, z: number): number => (built(x, z) ? height : 0) };
}

/** Système minimal qui branche un monde dans le contexte (avant les autres modules). */
export function worldSystem(world: WorldQuery): GameSystem {
  return {
    id: 'test:monde',
    order: 0,
    provide(ctx: GameContext): void {
      ctx.world = world;
    },
  };
}

export interface HazardRig {
  t: TestContext;
  ctx: GameContext;
  hazards: HazardApi;
  view: HazardFieldView;
  system: HazardsSystem;
}

export interface RigOptions {
  seed?: number;
  tuning?: Partial<HazardTuning>;
  /** Bâti du monde factice (absent = plan infini sans obstacle). */
  built?: (x: number, z: number) => boolean;
  world?: WorldQuery;
  wind?: [number, number];
  session?: Partial<SessionConfig>;
}

/** Moteur de test avec le module des dangers, session démarrée. */
export async function startHazards(options: RigOptions = {}): Promise<HazardRig> {
  const system = new HazardsSystem(options.tuning);
  const world = options.world ?? (options.built ? fakeWorld(options.built) : null);
  const t = createTestContext({
    seed: options.seed ?? 1,
    modules: [() => [system]],
    systems: world ? [worldSystem(world)] : [],
  });
  await t.start(options.session);
  if (options.wind) t.ctx.env.setWind(options.wind[0], options.wind[1]);
  const view = t.ctx.require<HazardFieldView>(HAZARD_FIELD_SERVICE);
  return { t, ctx: t.ctx, hazards: t.ctx.hazards, view, system };
}

export interface FieldStats {
  /** Masse de gaz (concentration × m²) et de fumée. */
  gas: number;
  smoke: number;
  maxGas: number;
  maxSmoke: number;
  /** Barycentre du gaz. */
  cx: number;
  cz: number;
  /** Surface (m²) où le gaz atteint 0,05 / 0,1. */
  area05: number;
  area10: number;
  cells: number;
}

const acc = { gas: 0, smoke: 0, maxGas: 0, maxSmoke: 0, sx: 0, sz: 0, n05: 0, n10: 0, cells: 0 };
function collect(x: number, z: number, gas: number, smoke: number): void {
  acc.gas += gas;
  acc.smoke += smoke;
  if (gas > acc.maxGas) acc.maxGas = gas;
  if (smoke > acc.maxSmoke) acc.maxSmoke = smoke;
  acc.sx += x * gas;
  acc.sz += z * gas;
  if (gas >= 0.05) acc.n05++;
  if (gas >= 0.1) acc.n10++;
  acc.cells++;
}

/** Mesures globales du champ, par le service de lecture (comme le ferait le rendu). */
export function fieldStats(view: HazardFieldView): FieldStats {
  acc.gas = acc.smoke = acc.maxGas = acc.maxSmoke = acc.sx = acc.sz = acc.n05 = acc.n10 = acc.cells = 0;
  view.forEachActiveCell(collect, 1e-4);
  const area = view.cellSize * view.cellSize;
  return {
    gas: acc.gas * area,
    smoke: acc.smoke * area,
    maxGas: acc.maxGas,
    maxSmoke: acc.maxSmoke,
    cx: acc.gas > 0 ? acc.sx / acc.gas : 0,
    cz: acc.gas > 0 ? acc.sz / acc.gas : 0,
    area05: acc.n05 * area,
    area10: acc.n10 * area,
    cells: acc.cells,
  };
}

/** Empreinte du champ (FNV-1a sur positions et valeurs) : deux simulations identiques → même nombre. */
export function fieldChecksum(view: HazardFieldView): number {
  let h = 0x811c9dc5;
  const buf = new Float32Array(5);
  const bytes = new Uint8Array(buf.buffer);
  view.forEachActiveCell((x, z, gas, smoke, color) => {
    buf[0] = x;
    buf[1] = z;
    buf[2] = gas;
    buf[3] = smoke;
    buf[4] = color;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]!;
      h = Math.imul(h, 0x01000193);
    }
  }, 1e-4);
  for (const f of view.fires) {
    buf[0] = f.x;
    buf[1] = f.z;
    buf[2] = f.radius;
    buf[3] = f.intensity;
    buf[4] = f.age;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]!;
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
