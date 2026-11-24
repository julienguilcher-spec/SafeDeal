/* =====================================================================================
 * SECOURS — aides de test (réservées aux tests : aucun autre module n'est importé ici, les tests
 * passent eux-mêmes les fabriques des modules qu'ils composent).
 * ===================================================================================== */

import type { GameContext, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi, RescueCall } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { CARE_SERVICE, RESCUE_EXT_SERVICE, RESCUE_RECORDS_SERVICE } from './api';
import type { CareApi, RescueExtApi, RescueRecords } from './api';

export interface RescueRig {
  t: TestContext;
  ctx: GameContext;
  rescue: RescueApi;
  ext: RescueExtApi;
  records: RescueRecords;
  care: CareApi;
  step(seconds: number): void;
  /** Avance par tranches de `slice` secondes jusqu'à ce que `until` soit vrai ; retourne le temps écoulé, ou −1 si la limite est atteinte. */
  run(limit: number, slice: number, until: () => boolean): number;
  /** États successifs d'un appel depuis la création du banc. */
  states(call: RescueCall): string[];
}

export async function startRescue(modules: readonly ModuleFactory[], config: Partial<SessionConfig> = {}, seed = 5): Promise<RescueRig> {
  const t = createTestContext({ seed, modules });
  await t.start(config);
  const ctx = t.ctx;
  const history = new Map<number, string[]>();
  ctx.events.onAny('rescue:call', (payload) => {
    const e = payload as { callId: number; state: string };
    let h = history.get(e.callId);
    if (!h) {
      h = [];
      history.set(e.callId, h);
    }
    h.push(e.state);
  });
  return {
    t,
    ctx,
    rescue: ctx.require<RescueApi>(EXT.rescue),
    ext: ctx.require<RescueExtApi>(RESCUE_EXT_SERVICE),
    records: ctx.require<RescueRecords>(RESCUE_RECORDS_SERVICE),
    care: ctx.require<CareApi>(CARE_SERVICE),
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
    states: (call) => history.get(call.id) ?? [],
  };
}

/** Blesse une personne jusqu'au niveau voulu (coups portés par `sourceId`), puis la laisse à terre. */
export function wound(ctx: GameContext, p: Person, level: 'light' | 'serious' | 'critical', sourceId = 0): void {
  const floor = level === 'critical' ? 20 : level === 'serious' ? 40 : 65;
  for (let i = 0; i < 40 && p.health > floor; i++) {
    const amount = Math.min(18, p.health - floor + 2);
    ctx.health.hurt(p, { amount, kind: 'impact', sourceId, x: p.x, z: p.z + 1, zone: 0.6, dirX: 0, dirZ: -1 });
  }
  if (level !== 'light' && p.posture !== 'down') ctx.health.setDown(p, true, sourceId);
}
