// Pilote automatique : rejoindre en mode « follow » un meneur parti loin, et faire demi-tour quand on est sorti sur le trottoir
// (angle d'une place).
import { describe, expect, it } from 'vitest';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

const DT = 1 / 30;

function run(b: VehicleBench, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    b.step(DT);
    each?.();
  }
}

describe('pilote automatique : colonne', () => {
  it('suivi demandé alors que le meneur est déjà à 120 m : il le rejoint par les rues et se range derrière lui', async () => {
    // une rue droite de 300 m
    const world = createFakeWorld({ nodes: [{ x: 0, z: 0 }, { x: 0, z: 300 }], edges: [{ a: 0, b: 1 }] });
    const b = await createVehicleBench({ world });
    const lead = b.spawn('vl_commandement', -1.75, 140, 0);
    const v = b.spawn('fourgon_crs', -1.75, 20, 0);
    expect(b.autopilot.follow(v, lead.id, 9)).toBe(true);
    run(b, 40);
    const gap = Math.hypot(lead.x - v.x, lead.z - v.z);
    const st = b.autopilot.status(v);
    console.log(`meneur à 120 m : suivant à ${gap.toFixed(1)} m, ${st.mode}/${st.state}`);
    expect(gap).toBeLessThan(25);
    expect(st.mode).toBe('follow');
  });

  it('sorti de la chaussée (trottoir d\'un angle de place), il fait quand même demi-tour au lieu de « manœuvrer » sur place indéfiniment', async () => {
    // une rue nord-sud ; autour du véhicule, le trottoir d'une place (sur 14 m)
    const world = createFakeWorld({
      nodes: [{ x: 0, z: -100 }, { x: 0, z: 100 }],
      edges: [{ a: 0, b: 1 }],
      surface: (x, z) => (Math.hypot(x - 6, z - 30) < 14 ? 'sidewalk' : 'road'),
    });
    const b = await createVehicleBench({ world });
    const v = b.spawn('fourgon_crs', 6, 30, 0);
    expect(world.surfaceAt(v.x, v.z)).toBe('sidewalk');
    // l'itinéraire repart dans son dos
    expect(b.autopilot.driveTo(v, 0, -60)).toBe(true);
    let state = '';
    run(b, 60, () => { state = b.autopilot.status(v).state; });
    console.log(`trottoir : z ${v.z.toFixed(1)}, cap ${(v.heading * 57).toFixed(0)}°, ${state}`);
    expect(v.z).toBeLessThan(0);
  });
});
