// Barrages de police (barrières Vauban) et véhicules de police : la rue fermée à la circulation s'ouvre devant une
// colonne de police — tête de colonne et chacun de ses suivants —, même hors intervention urgente (deux-tons éteints),
// puis se referme derrière elle. Plainte du joueur : « je suis en colonne, il n'y a qu'un camion qui me suit » — les
// suivants s'arrêtaient pour de bon devant les barrières que leur tête de colonne venait de franchir.
import { describe, expect, it } from 'vitest';
import type { GameContext, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import type { GateEvent } from '@/sim/traffic';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function crewed(ctx: GameContext, kind: string, x: number, z: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, EAST);
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

describe('barrage de police : les véhicules de police passent', () => {
  it('une colonne de police (sans deux-tons) franchit le barrage, tête et suivants ; il se referme derrière elle', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    b.api.tuning.barrierTime = 0;
    b.control.closeRoad(200, 120, 0);
    const gates: GateEvent[] = [];
    b.ctx.events.onAny('traffic:gate', (e) => gates.push({ ...(e as GateEvent) }));
    const head = crewed(b.ctx, 'vl_commandement', 100, 122);
    const second = crewed(b.ctx, 'fourgon_crs', 88, 122);
    const third = crewed(b.ctx, 'fourgon_crs', 76, 122);
    // ordre de déplacement ordinaire (pas d'urgence) : la colonne roule feux éteints
    expect(ap.driveTo(head, 380, 122)).toBe(true);
    expect(ap.follow(second, head.id, 6)).toBe(true);
    expect(ap.follow(third, second.id, 6)).toBe(true);
    const t = runUntil(b, () => third.x > 240, 90);
    const where = [head, second, third].map((v) => `${v.kind}#${v.id} x=${v.x.toFixed(0)} ${ap.status(v).mode}/${ap.status(v).state}/${ap.status(v).reason}`).join(' ; ');
    expect(t, where).toBeGreaterThan(0);
    expect(head.siren).toBe(0);
    expect(gates.some((g) => g.open)).toBe(true);
    // la colonne passée, les barrières sont remises en travers
    b.step(8);
    expect(gates[gates.length - 1]!.open, where).toBe(false);
    expect(b.ctx.props.list.filter((p) => p.kind === 'barriere_vauban').every((p) => p.blocksMove && Math.abs(p.x - 200) < 0.01)).toBe(true);
  }, 120000);

  it('un fourgon de police arrêté nez au barrage (barrières en travers) le fait ouvrir et passe', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    b.api.tuning.barrierTime = 0;
    b.control.closeRoad(200, 120, 0);
    // garé à l'arrêt juste devant les barrières, puis un ordre de déplacement à travers la rue fermée
    const van = crewed(b.ctx, 'fourgon_crs', 195.5, 122);
    b.step(1);
    expect(ap.driveTo(van, 380, 122)).toBe(true);
    const t = runUntil(b, () => van.x > 230, 60);
    expect(t, `${ap.status(van).state}/${ap.status(van).reason} x=${van.x.toFixed(1)}`).toBeGreaterThan(0);
  }, 120000);
});
