// Pilote automatique : un demi-tour impossible (véhicule enfermé nez et cul contre deux véhicules arrêtés, l'itinéraire
// repartant dans son dos) ne dure pas indéfiniment. Il recommençait sans fin — huit reprises, nouvel itinéraire, encore
// derrière lui, huit reprises… — à l'état « manœuvre » : ni la conduite de la colonne ni la session (engins.ts), qui ne
// reprennent qu'un véhicule « bloqué » ou « en attente », ne venaient le dégager (partie jouée Cité → République, graine
// 3 : VL de tête en « manœuvre » sur place de t = 137 s à t = 837 s, ses trois fourgons derrière lui). Au bout d'une
// trentaine de secondes sans quitter l'endroit ni gagner de cap, il se déclare « bloqué » (il continue d'essayer) : les
// filets de sécurité de la colonne et de la session peuvent le reprendre.
import { describe, expect, it } from 'vitest';
import type { GameContext, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function crewed(ctx: GameContext, kind: string, x: number, z: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, EAST);
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

describe('pilote automatique : manœuvre sans fin', () => {
  it('demi-tour impossible (enfermé devant et derrière) : « bloqué » au bout d’une trentaine de secondes, pas « manœuvre » pour toujours', async () => {
    const town = createTown({ width: 12 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ctx = b.ctx;
    const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
    const v = crewed(ctx, 'vl_commandement', 180, 121);
    // garés pare-chocs contre pare-chocs devant et derrière lui, sans conducteur
    const half = v.def.length * 0.5;
    const front = ctx.vehicles.spawn('fourgon_crs', 180 + half + 0.6 + 2.8, 121, EAST);
    const back = ctx.vehicles.spawn('fourgon_crs', 180 - half - 0.6 - 2.8, 121, EAST);
    // destination dans son dos
    expect(ap.driveTo(v, 20, 121)).toBe(true);
    // (manœuvre la plus longue d'un seul tenant, temps passé « bloqué », plus long temps d'arrêt déclaré)
    let manoeuvre = 0, longest = 0, blocked = 0, maxBlocked = 0;
    const states = new Set<string>();
    runUntil(b, () => false, 150, () => {
      const st = ap.status(v);
      states.add(st.state);
      manoeuvre = st.state === 'manoeuvre' ? manoeuvre + 1 / 30 : 0;
      if (manoeuvre > longest) longest = manoeuvre;
      if (st.state === 'bloque') {
        blocked += 1 / 30;
        if (st.blockedFor > maxBlocked) maxBlocked = st.blockedFor;
      }
    });
    expect(Math.hypot(v.x - 180, v.z - 121), 'il ne se dégage pas').toBeLessThan(4);
    expect(front.x - v.x).toBeGreaterThan(0);
    expect(back.x - v.x).toBeLessThan(0);
    expect(blocked, `états vus : ${[...states].join(', ')}`).toBeGreaterThan(30);
    expect(longest).toBeLessThan(45);
    expect(maxBlocked).toBeGreaterThan(40);
  }, 120000);
});
