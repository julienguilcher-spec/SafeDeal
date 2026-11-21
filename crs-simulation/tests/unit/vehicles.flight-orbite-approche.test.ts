// Engins volants : un drone mis en orbite serrée loin de son cercle y va droit (transit), au lieu de s'en approcher en
// spirale à 3,6 m/s de vitesse radiale (constaté : 150 m de transit en plus de 40 s, la caméra loin de la foule).
import { describe, expect, it } from 'vitest';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';

describe('orbite : approche', () => {
  it('rejoint en ligne droite une orbite de 8 m dont le centre est à 150 m', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const drone = b.spawn('drone', 0, 0, 0);
    expect(b.ext.takeOff(drone, 60)).toBe(true);
    b.step(15);
    expect(b.ext.orbit(drone, 150, 0, 8, 60, 6)).toBe(true);
    let reached = -1;
    for (let i = 1; i <= 40 && reached < 0; i++) {
      b.step(0.5);
      if (Math.hypot(drone.x - 150, drone.z) < 8 + 5) reached = i * 0.5;
    }
    console.log('orbite rejointe en', reached, 's');
    expect(reached).toBeGreaterThan(0);
    // 150 m à 15 m/s au plus : une douzaine de secondes, pas une spirale de 40 s
    expect(reached).toBeLessThan(16);
    // puis il tient son cercle
    b.step(30);
    const r = Math.hypot(drone.x - 150, drone.z);
    expect(r).toBeGreaterThan(4);
    expect(r).toBeLessThan(12);
  });
});
