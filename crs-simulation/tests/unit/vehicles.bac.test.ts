// Voiture banalisée de la BAC ('voiture_bac') : définition, spécifications, rendu, sirène et gyrophare aimanté.
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/contracts';
import { VEHICLE_KINDS, createVehicleDefs } from '@/sim/vehicles';
import { specFor } from '@/sim/vehicles/specs';
import { createVehicleBench } from '@/sim/vehicles/testkit';
import { LIGHT_BEACON_A, LIGHT_BEACON_B, PART_DOME } from '@/render/vehicles/geo';
import { beaconPatternFor } from '@/render/vehicles/beacons';
import { buildModel, hasModel, triBudget } from '@/render/vehicles/models/index';
import { CAR_STYLES } from '@/render/vehicles/models/cars';
import { referenceDef } from '@/render/vehicles/refdefs';
import { tile } from '@/render/vehicles/atlas-layout';

const sim = createVehicleDefs().find((d) => d.kind === 'voiture_bac')!;

describe('voiture banalisée de la BAC', () => {
  it('existe : faction police, sirène et gyrophares, 5 places, conducteur à gauche', () => {
    expect(VEHICLE_KINDS).toContain('voiture_bac');
    expect(sim).toBeDefined();
    expect(sim.name).toBe('Voiture banalisée (BAC)');
    expect(sim.faction).toBe('police');
    expect(sim.hasSiren).toBe(true);
    expect(sim.hasBeacons).toBe(true);
    expect(sim.color).toBe(0x2e3238);
    expect([sim.length, sim.width, sim.height]).toEqual([4.7, 1.83, 1.47]);
    expect(sim.mass).toBe(1450);
    expect(sim.seats.length).toBe(5);
    expect(sim.seats[0]!.role).toBe('driver');
    expect(sim.seats[0]!.x).toBeLessThan(0);
    expect(sim.seats.filter((s) => s.role === 'driver').length).toBe(1);
    expect(sim.turrets.length).toBe(0);
    expect(sim.armored).toBe(false);
  });

  it('a ses propres caractéristiques (berline puissante), pas celles d’un type inconnu', () => {
    const spec = specFor(sim);
    const berline = specFor(createVehicleDefs().find((d) => d.kind === 'voiture')!);
    expect(spec.kind).toBe('voiture_bac');
    expect(spec.engine.power).toBeGreaterThan(berline.engine.power);
    expect(spec.flippable).toBe(true);
    expect(spec.seatTurret.length).toBe(5);
  });

  it('les définitions de référence du rendu et de la simulation concordent', () => {
    const ref = referenceDef('voiture_bac')!;
    expect(ref).toBeDefined();
    for (const k of ['kind', 'name', 'faction', 'color', 'length', 'width', 'height', 'mass', 'wheelbase', 'maxSpeed', 'hasSiren', 'hasBeacons'] as const) {
      expect(ref[k], k).toEqual(sim[k]);
    }
    expect(ref.seats.length).toBe(sim.seats.length);
    ref.seats.forEach((s, i) => {
      const t = sim.seats[i]!;
      expect(s.role).toBe(t.role);
      for (const k of ['x', 'y', 'z', 'exitX', 'exitZ'] as const) expect(s[k], `siège ${i} ${k}`).toBeCloseTo(t[k], 6);
    });
  });

  it('s’instancie, se conduit et commande sa sirène', async () => {
    const b = await createVehicleBench();
    const sirens: GameEvents['vehicle:siren'][] = [];
    b.ctx.events.on('vehicle:siren', (e) => sirens.push({ ...e }));
    const car = b.spawn('voiture_bac', 0, 0, 0);
    expect(car.def).toBe(b.ctx.vehicles.def('voiture_bac'));
    expect(car.seats.length).toBe(5);
    const driver = b.driver(car, 'policier_civil');
    expect(driver.vehicleId).toBe(car.id);
    expect(driver.seat).toBe(0);
    const mate = b.person('policier_civil', 3, 0);
    expect(b.ctx.vehicles.enter(mate, car, 'passenger')).toBe(true);
    expect(mate.vehicleId).toBe(car.id);
    // deux-tons : les gyrophares (dôme aimanté, calandre) s'allument avec la sirène
    b.ext.setSiren(car, 1);
    expect(car.siren).toBe(1);
    expect(car.beacons).toBe(true);
    expect(sirens).toEqual([{ id: car.id, siren: 1 }]);
    b.ext.setBeacons(car, false);
    expect(car.siren).toBe(0);
    expect(car.beacons).toBe(false);
    // et elle roule
    car.cmd.throttle = 1;
    b.step(4);
    car.cmd.throttle = 0;
    expect(Math.hypot(car.x, car.z)).toBeGreaterThan(5);
  });

  it('se rend sous Node dans le budget d’une voiture : sans livrée, gyrophare aimanté escamotable et feux de calandre', () => {
    expect(hasModel('voiture_bac')).toBe(true);
    expect(CAR_STYLES.voiture_bac!.police).toBeFalsy();
    expect(CAR_STYLES.voiture_bac!.unmarked).toBe(true);
    expect(beaconPatternFor('voiture_bac')).toBe('strobe');
    const def = referenceDef('voiture_bac')!;
    for (const far of [false, true]) {
      const m = buildModel('voiture_bac', def, far);
      expect(m.data.triangleCount).toBeLessThanOrEqual(triBudget('voiture_bac', far));
      expect(m.data.triangleCount).toBeGreaterThan(20);
      const part = m.data.part;
      let dome = 0, beaconA = 0, beaconB = 0;
      for (let i = 0; i < m.data.vertexCount; i++) {
        if (part[i * 3] === PART_DOME) {
          dome++;
          // le dôme est posé sur le pavillon, côté conducteur (+x dans le repère du modèle), et pivote sur le toit
          expect(m.data.position[i * 3 + 1]!).toBeGreaterThan(def.height - 0.01);
          expect(m.data.pivot[i * 3]!).toBeGreaterThan(0);
          expect(m.data.pivot[i * 3 + 1]!).toBeCloseTo(def.height, 3);
        }
        if (part[i * 3 + 2] === LIGHT_BEACON_A) beaconA++;
        if (part[i * 3 + 2] === LIGHT_BEACON_B) beaconB++;
      }
      expect(dome, far ? 'loin' : 'proche').toBeGreaterThan(0);
      expect(beaconA).toBeGreaterThan(0);
      if (!far) expect(beaconB).toBeGreaterThan(0); // feu de calandre droit
      expect(m.meta.beaconA.length).toBe(3);
      expect(m.meta.beaconB.length).toBe(3);
      // aucune rampe de toit : hors du dôme, les seuls feux bleus sont ceux de la calandre, à hauteur de capot
      let top = 0;
      for (let i = 0; i < m.data.vertexCount; i++) {
        const code = part[i * 3 + 2];
        if (part[i * 3] !== PART_DOME && (code === LIGHT_BEACON_A || code === LIGHT_BEACON_B)) top = Math.max(top, m.data.position[i * 3 + 1]!);
      }
      expect(top).toBeLessThan(def.height * 0.7);
    }
    // aucune inscription « POLICE » ni bande tricolore (sa voisine sérigraphiée en porte)
    const inscribed = (kind: string): number => {
      const d = buildModel(kind, referenceDef(kind)!, false).data;
      let n = 0;
      for (const name of ['police', 'bande_police'] as const) {
        const r = tile(name);
        // centre de chaque triangle (ses sommets sont sur les bords du rectangle de l'atlas)
        for (let t = 0; t < d.index.length; t += 3) {
          const ia = d.index[t]!, ib = d.index[t + 1]!, ic = d.index[t + 2]!;
          const u = (d.uv[ia * 2]! + d.uv[ib * 2]! + d.uv[ic * 2]!) / 3, v = (d.uv[ia * 2 + 1]! + d.uv[ib * 2 + 1]! + d.uv[ic * 2 + 1]!) / 3;
          if (u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1) n++;
        }
      }
      return n;
    };
    expect(inscribed('voiture_police')).toBeGreaterThan(0);
    expect(inscribed('voiture_bac')).toBe(0);
  });
});
