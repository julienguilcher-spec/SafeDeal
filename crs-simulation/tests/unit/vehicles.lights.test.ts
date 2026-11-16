// Sirènes, gyrophares, phares, clignotants, klaxon : états cohérents, événements et demandes de son.
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/contracts';
import { LIGHTS_EVENT } from '@/sim/vehicles';
import { createVehicleBench } from '@/sim/vehicles/testkit';

describe('sirènes et gyrophares', () => {
  it('signale chaque changement de sirène (vehicle:siren) et allume les gyrophares avec elle', async () => {
    const b = await createVehicleBench();
    const sirens: GameEvents['vehicle:siren'][] = [];
    b.ctx.events.on('vehicle:siren', (e) => sirens.push({ ...e }));
    const van = b.spawn('fourgon_crs');
    expect(van.siren).toBe(0);
    expect(van.beacons).toBe(false);
    b.ext.setSiren(van, 1);
    expect(van.siren).toBe(1);
    expect(van.beacons).toBe(true); // jamais de sirène sans feux
    expect(sirens).toEqual([{ id: van.id, siren: 1 }]);
    b.ext.cycleSiren(van);
    expect(van.siren).toBe(2); // variante (« hurleur »)
    b.ext.cycleSiren(van);
    expect(van.siren).toBe(0);
    expect(van.beacons).toBe(true); // les feux restent tant qu'on ne les coupe pas
    expect(sirens.map((s) => s.siren)).toEqual([1, 2, 0]);
    // gyrophares coupés : la sirène l'est aussi
    b.ext.setSiren(van, 1);
    b.ext.setBeacons(van, false);
    expect(van.siren).toBe(0);
    expect(van.beacons).toBe(false);
    expect(sirens[sirens.length - 1]).toEqual({ id: van.id, siren: 0 });
  });

  it('prend en compte une écriture directe par un contrôleur, au pas suivant', async () => {
    const b = await createVehicleBench();
    const sirens: GameEvents['vehicle:siren'][] = [];
    b.ctx.events.on('vehicle:siren', (e) => sirens.push({ ...e }));
    const car = b.spawn('voiture_police');
    car.siren = 1; // touche « sirène » du joueur
    expect(sirens.length).toBe(0);
    b.step(0.05);
    expect(sirens).toEqual([{ id: car.id, siren: 1 }]);
    expect(car.beacons).toBe(true);
    b.step(1);
    expect(sirens.length).toBe(1); // pas de répétition
  });

  it('refuse sirène et gyrophares aux véhicules qui n\'en ont pas, et les éteint sur une épave', async () => {
    const b = await createVehicleBench();
    const sirens: GameEvents['vehicle:siren'][] = [];
    b.ctx.events.on('vehicle:siren', (e) => sirens.push({ ...e }));
    const taxi = b.spawn('taxi', 0, 0);
    b.ext.setSiren(taxi, 1);
    b.ext.setBeacons(taxi, true);
    taxi.siren = 2;
    b.step(0.1);
    expect(taxi.siren).toBe(0);
    expect(taxi.beacons).toBe(false);
    expect(sirens.length).toBe(0);
    const samu = b.spawn('ambulance', 20, 0);
    b.ext.setSiren(samu, 1);
    b.ctx.vehicles.damage(samu, { amount: 1000, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    b.step(0.1);
    expect(samu.state).toBe('wrecked');
    expect(samu.siren).toBe(0);
    expect(samu.beacons).toBe(false);
    expect(sirens.map((s) => s.siren)).toEqual([1, 0]);
    // tous les véhicules de police et de secours ont sirène et feux ; l'hélicoptère n'a que des feux
    for (const kind of ['fourgon_crs', 'car_crs', 'vl_commandement', 'voiture_police', 'fourgon_cellulaire', 'centaure', 'canon_eau', 'moto_bravm', 'camion_pompiers', 'ambulance'] as const) {
      const def = b.ctx.vehicles.def(kind)!;
      expect(def.hasSiren && def.hasBeacons, kind).toBe(true);
    }
    expect(b.ctx.vehicles.def('helicoptere')!.hasSiren).toBe(false);
    expect(b.ctx.vehicles.def('helicoptere')!.hasBeacons).toBe(true);
  });
});

describe('phares, clignotants, klaxon', () => {
  it('allume les phares la nuit quand le moteur tourne ; le réglage manuel prime', async () => {
    const b = await createVehicleBench();
    const lights: { id: number; headlights: boolean; indicator: number }[] = [];
    b.ctx.events.onAny(LIGHTS_EVENT, (e) => lights.push({ ...(e as { id: number; headlights: boolean; indicator: number }) }));
    const car = b.spawn('voiture', 0, 0);
    const parked = b.spawn('voiture', 10, 0);
    b.driver(car);
    b.step(0.1);
    expect(car.headlights).toBe(false); // 14 h, temps clair
    b.ctx.env.setTime(23);
    expect(b.ctx.env.state.isNight).toBe(true);
    b.step(0.1);
    expect(car.headlights).toBe(true);
    expect(parked.headlights).toBe(false); // moteur coupé
    expect(lights.some((l) => l.id === car.id && l.headlights)).toBe(true);
    b.ext.setHeadlights(car, false);
    b.step(1);
    expect(car.headlights).toBe(false);
    b.ext.setHeadlights(car, 'auto');
    b.step(0.1);
    expect(car.headlights).toBe(true);
    // de jour sous l'averse : phares aussi
    b.ctx.env.setTime(14);
    b.step(0.1);
    expect(car.headlights).toBe(false);
    b.ctx.env.setWeather('averse', true);
    b.step(0.1);
    expect(car.headlights).toBe(true);
  });

  it('signale les clignotants et demande un son à chaque coup de klaxon', async () => {
    const b = await createVehicleBench();
    const lights: { indicator: number }[] = [];
    b.ctx.events.onAny(LIGHTS_EVENT, (e) => lights.push({ ...(e as { indicator: number }) }));
    const sfx: GameEvents['sfx'][] = [];
    b.ctx.events.on('sfx', (e) => sfx.push({ ...e }));
    const car = b.spawn('voiture', 5, 7);
    b.driver(car);
    b.ext.setIndicator(car, -1);
    expect(car.indicator).toBe(-1);
    expect(lights[lights.length - 1]!.indicator).toBe(-1);
    // klaxon tenu par la commande : une seule demande par appui
    car.cmd.horn = true;
    b.step(1);
    expect(sfx.filter((s) => s.id === 'klaxon').length).toBe(1);
    expect(sfx[0]!.x).toBeCloseTo(5, 3);
    car.cmd.horn = false;
    b.step(0.2);
    car.cmd.horn = true;
    b.step(0.2);
    expect(sfx.filter((s) => s.id === 'klaxon').length).toBe(2);
    car.cmd.horn = false;
    b.step(0.2);
    // coup de klaxon minuté par le service
    b.ext.horn(car, 0.5);
    b.step(0.2);
    expect(car.cmd.horn).toBe(true);
    b.step(0.6);
    expect(car.cmd.horn).toBe(false);
    expect(sfx.filter((s) => s.id === 'klaxon').length).toBe(3);
  });
});
