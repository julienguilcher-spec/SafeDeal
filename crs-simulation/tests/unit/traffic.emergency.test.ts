// Circulation — véhicules en intervention : la sirène obtient le feu et le carrefour, les automobilistes se rangent.
import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { TrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;
const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const SOUTH = 0;

function waitForRed(b: TrafficBench, node: number, heading: number): void {
  let guard = 0;
  while (b.api.signal(node, heading) === 'rouge' && guard++ < 6000) b.step(DT, DT);
  while (b.api.signal(node, heading) !== 'rouge' && guard++ < 12000) b.step(DT, DT);
}

function policeVan(b: TrafficBench, x: number, z: number, heading: number): Vehicle {
  const van = b.ctx.vehicles.spawn('fourgon_crs', x, z, heading);
  const crs = b.ctx.people.spawn({ kind: 'crs', x, z });
  expect(b.ctx.vehicles.enter(crs, van, 'driver')).toBe(true);
  return van;
}

describe('circulation : véhicule en intervention', () => {
  it('une sirène arrive sur un feu rouge : le feu passe au vert pour elle, la file dégage, elle passe sans s\'arrêter', async () => {
    const town = createTown({ signals: [4] });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const node = town.junction(1, 1);
    waitForRed(b, node, EAST);
    // deux automobilistes arrêtés au rouge, un troisième en face, un quatrième sur la rue transversale
    const queue = [0, 1].map((i) => b.api.spawnVehicle('voiture', 82 - i * 12, 122, EAST, 380, 120)!);
    const cross = b.api.spawnVehicle('suv', 118, 20, SOUTH, 120, 380)!;
    const van = policeVan(b, -70, 122, EAST);
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    b.step(8);
    expect(queue.every((v) => Math.abs(v.speed) < 0.2)).toBe(true);
    expect(b.api.signal(node, EAST)).toBe('rouge');
    // sans sirène, le fourgon attendrait le vert ; avec, le carrefour lui est réservé
    expect(ap.driveTo(van, 380, 122, { urgence: true })).toBe(true);
    // un automobiliste arrive en face, de l'autre côté du carrefour : ils se croiseront en pleine rue
    const oncoming = b.api.spawnVehicle('citadine', 370, 118, WEST, -140, 120)!;
    let preemptedAt = -1;
    let crossRedWhilePreempted = true;
    let vanMinNearJunction = Infinity;
    let oncomingPulled = false;
    let oncomingRight = 0;
    let crossEntered = 0;
    let waitRed = 0;
    const t0 = b.ctx.clock.now;
    const t = runUntil(b, () => van.x > 270, 60, () => {
      const ew = b.api.signal(node, EAST);
      // vert pour elle seule (même le sens opposé de sa rue est au rouge) : c'est la priorité, pas le cycle ordinaire
      if (ew === 'vert' && b.api.signal(node, WEST) === 'rouge' && preemptedAt < 0 && van.x < 60) preemptedAt = b.ctx.clock.now - t0;
      if (preemptedAt >= 0 && van.x < 110) {
        if (b.api.signal(node, SOUTH) !== 'rouge' || b.api.signal(node, WEST) !== 'rouge') crossRedWhilePreempted = false;
        // la rue transversale n'entre pas dans le carrefour pendant que la sirène approche
        if (Math.hypot(cross.x - 120, cross.z - 120) < 8 && van.x > 20) crossEntered++;
      }
      if (van.x > 80 && van.x < 160) vanMinNearJunction = Math.min(vanMinNearJunction, van.speed);
      if (b.api.motorist(oncoming)?.mode === 'range') {
        oncomingPulled = true;
        oncomingRight = Math.max(oncomingRight, 120 - oncoming.z);
      }
      if (van.x > 85 && van.speed < 0.5) waitRed += DT;
    });
    expect(t).toBeGreaterThan(0);
    expect(van.siren).not.toBe(0); // le pilote automatique a mis la sirène
    expect(preemptedAt).toBeGreaterThan(0); // le feu est passé au vert pour elle avant qu'elle n'arrive
    expect(crossRedWhilePreempted).toBe(true); // tous les autres sens au rouge
    expect(crossEntered).toBe(0);
    expect(vanMinNearJunction).toBeGreaterThan(3); // elle a traversé le carrefour sans s'arrêter
    expect(waitRed).toBe(0);
    expect(queue.every((v) => v.x > 130)).toBe(true); // la file a dégagé devant elle
    expect(oncomingPulled).toBe(true); // le véhicule d'en face s'est rangé
    expect(oncomingRight).toBeGreaterThan(2.3); // serré à droite de sa voie (à 2 m de l'axe en temps normal)
    expect(collisions).toBe(0);
    // une fois la sirène passée, celui qui s'était rangé repart et le feu reprend son cycle
    const tResume = runUntil(b, () => b.api.motorist(oncoming)?.mode === 'route' && oncoming.speed > 3, 45);
    expect(tResume).toBeGreaterThan(0);
    const colors = new Set<string>();
    runUntil(b, () => false, 60, () => colors.add(b.api.signal(node, EAST)));
    expect(colors).toEqual(new Set(['vert', 'orange', 'rouge']));
    console.log(`sirène : feu passé au vert ${preemptedAt.toFixed(1)} s après le départ du fourgon, carrefour franchi à ${vanMinNearJunction.toFixed(1)} m/s au plus lent, ${t.toFixed(0)} s pour 340 m, véhicule d'en face rangé à ${oncomingRight.toFixed(1)} m de l'axe`);
  }, 180000);

  it('sur une large avenue, l\'automobiliste rattrapé par une sirène se range à droite et la laisse passer', async () => {
    const town = createTown({ width: 16, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const car = b.api.spawnVehicle('voiture', -60, 123.2, EAST, 110, 120)!;
    const van = policeVan(b, -145, 123.2, EAST);
    b.step(1);
    expect(ap.driveTo(van, 380, 123, { urgence: true })).toBe(true);
    let pulled = false;
    let maxRight = 0;
    let passed = false;
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    const t = runUntil(b, () => van.x > car.x + 15, 40, () => {
      if (b.api.motorist(car)?.mode === 'range') {
        pulled = true;
        expect(b.api.motorist(car)?.cause).toBe('sirene');
      }
      maxRight = Math.max(maxRight, car.z - 120);
      if (van.x > car.x) passed = true;
    });
    expect(t).toBeGreaterThan(0);
    expect(pulled).toBe(true);
    expect(passed).toBe(true);
    expect(maxRight).toBeGreaterThan(5.5); // serré contre le trottoir (voie normale à 3,2 m de l'axe)
    expect(maxRight).toBeLessThan(7.2); // sans monter dessus (chaussée de 16 m)
    expect(collisions).toBe(0);
    console.log(`sirène en rattrapage : l'automobiliste s'est rangé à ${maxRight.toFixed(1)} m de l'axe, le fourgon l'a doublé en ${t.toFixed(0)} s`);
  }, 120000);
});
