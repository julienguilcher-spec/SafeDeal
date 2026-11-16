/* =====================================================================================
 * INCIDENTS — aides de test (réservées aux tests : aucun autre module n'est importé ici, les tests
 * passent eux-mêmes les fabriques des modules qu'ils composent).
 * ===================================================================================== */

import type { GameContext, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Incident, IncidentsApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { INCIDENTS_RECORDS_SERVICE, INCIDENTS_TUNING_SERVICE } from './api';
import type { IncidentsRecords, IncidentsTuning } from './api';

export interface IncidentsRig {
  t: TestContext;
  ctx: GameContext;
  incidents: IncidentsApi;
  records: IncidentsRecords;
  tuning: IncidentsTuning;
  step(seconds: number): void;
  /** Avance par tranches jusqu'à ce que `until` soit vrai ; retourne le temps écoulé, ou −1 si la limite est atteinte. */
  run(limit: number, slice: number, until: () => boolean): number;
  /** Point libre sur la chaussée près de (x, z). */
  roadPoint(x: number, z: number, radius?: number): { x: number; z: number };
  /** Incident actif d'une nature donnée (le premier). */
  find(kind: Incident['kind']): Incident | undefined;
}

export async function startIncidents(modules: readonly ModuleFactory[], config: Partial<SessionConfig> = {}, seed = 11): Promise<IncidentsRig> {
  const t = createTestContext({ seed, modules });
  await t.start(config);
  const ctx = t.ctx;
  const incidents = ctx.require<IncidentsApi>(EXT.incidents);
  return {
    t,
    ctx,
    incidents,
    records: ctx.require<IncidentsRecords>(INCIDENTS_RECORDS_SERVICE),
    tuning: ctx.require<IncidentsTuning>(INCIDENTS_TUNING_SERVICE),
    step: (seconds) => t.step(seconds),
    run: (limit, slice, until) => {
      let elapsed = 0;
      while (elapsed < limit - 1e-9) {
        if (until()) return elapsed;
        t.step(slice);
        elapsed += slice;
      }
      return until() ? elapsed : -1;
    },
    roadPoint: (x, z, radius = 5) => {
      const out = { x, z };
      if (!ctx.world.randomFreePoint(x, z, radius, 'road', () => ctx.rng.next(), out)) throw new Error(`aucun point libre près de (${x} ; ${z})`);
      return out;
    },
    find: (kind) => incidents.list.find((i) => i.kind === kind && i.state !== 'resolu' && i.state !== 'echoue'),
  };
}

/** Blesse une personne jusqu'au niveau voulu, puis la laisse à terre. */
export function wound(ctx: GameContext, p: Person, level: 'light' | 'serious' | 'critical', sourceId = 0): void {
  const floor = level === 'critical' ? 20 : level === 'serious' ? 40 : 65;
  for (let i = 0; i < 40 && p.health > floor; i++) {
    const amount = Math.min(18, p.health - floor + 2);
    ctx.health.hurt(p, { amount, kind: 'impact', sourceId, x: p.x, z: p.z + 1, zone: 0.6, dirX: 0, dirZ: -1 });
  }
  if (level !== 'light' && p.posture !== 'down') ctx.health.setDown(p, true, sourceId);
}

/** Arrose un point comme le ferait un extincteur (1 unité par seconde) pendant `seconds`. */
export function douse(rig: IncidentsRig, x: number, z: number, seconds: number, rate = 1): void {
  for (let i = 0; i < seconds * 10; i++) {
    rig.ctx.hazards.douse(x, z, 1.5, rate * 0.1);
    rig.t.step(0.1);
  }
}
