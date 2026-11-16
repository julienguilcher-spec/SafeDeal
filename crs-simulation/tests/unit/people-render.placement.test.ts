// Tests du placement des occupants de véhicules et des personnes portées ou traînées.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { Placement } from '@/render/people/placement';
import { POSTURE_DOWN, POSTURE_SEATED, U_CARRIED, U_DRAGGED, U_DRIVE, U_RIDE } from '@/render/people/poseparams';

function fakePerson(id: number, over: Partial<Person> = {}): Person {
  return {
    id, x: 5, y: 0, z: 7, heading: 0.3, vehicleId: 0, seat: -1, heldBy: 0, carrying: 0, upper: 'none',
    look: { height: 1.75 },
    ...over,
  } as unknown as Person;
}

function fakeCtx(vehicles: Vehicle[], people: Person[]): GameContext {
  return {
    vehicles: { get: (id: number) => vehicles.find((v) => v.id === id) },
    people: { get: (id: number) => people.find((p) => p.id === id) },
  } as unknown as GameContext;
}

const seats = [
  { role: 'driver', x: -0.45, y: 0.9, z: 1.2, exitX: 0, exitZ: 0 },
  { role: 'passenger', x: 0.45, y: 0.9, z: 1.2, exitX: 0, exitZ: 0 },
];

describe('rendu des personnages — placement', () => {
  it('conducteur à gauche, passager à droite, quel que soit le cap du véhicule', () => {
    const pl = new Placement();
    for (const h of [0, Math.PI / 2, Math.PI, -1.1]) {
      const v = { id: 50, kind: 'fourgon_crs', x: 10, y: 0.2, z: -4, heading: h, pitch: 0.05, roll: -0.02, steerAngle: 0.3, def: { seats, maxSteer: 0.6 } } as unknown as Vehicle;
      const driver = fakePerson(1, { vehicleId: 50, seat: 0 }), pass = fakePerson(2, { vehicleId: 50, seat: 1 });
      const ctx = fakeCtx([v], [driver, pass]);
      // repère du véhicule : avant = (sin h, cos h), gauche = (cos h, -sin h)
      const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
      pl.resolve(ctx, driver);
      expect(pl.x).toBeCloseTo(10 + fx * 1.2 + lx * 0.45, 6);
      expect(pl.z).toBeCloseTo(-4 + fz * 1.2 + lz * 0.45, 6);
      expect(pl.y).toBeCloseTo(0.2 + 0.9 - 0.45, 6);
      expect(pl.heading).toBe(h);
      expect(pl.posture).toBe(POSTURE_SEATED);
      expect(pl.upper).toBe(U_DRIVE);
      expect(pl.steer).toBeCloseTo(0.5, 6);
      expect(pl.attached).toBe(true);
      expect(pl.pitch).toBeCloseTo(-0.05, 6);
      pl.resolve(ctx, pass);
      expect(pl.x).toBeCloseTo(10 + fx * 1.2 - lx * 0.45, 6);
      expect(pl.z).toBeCloseTo(-4 + fz * 1.2 - lz * 0.45, 6);
      expect(pl.upper).toBe(-1);
      expect(pl.steer).toBe(0);
    }
  });

  it('moto : pilote et passager à califourchon', () => {
    const pl = new Placement();
    const v = { id: 60, kind: 'moto_bravm', x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0.2, steerAngle: 0, def: { seats: [{ role: 'driver', x: 0, y: 0.8, z: 0 }, { role: 'passenger', x: 0, y: 0.85, z: -0.5 }], maxSteer: 0.5 } } as unknown as Vehicle;
    const a = fakePerson(1, { vehicleId: 60, seat: 0 }), b = fakePerson(2, { vehicleId: 60, seat: 1 });
    const ctx = fakeCtx([v], [a, b]);
    pl.resolve(ctx, a);
    expect(pl.upper).toBe(U_RIDE);
    expect(pl.roll).toBeCloseTo(0.2, 6);
    pl.resolve(ctx, b);
    expect(pl.upper).toBe(U_RIDE);
    expect(pl.z).toBeCloseTo(-0.5, 6);
  });

  it('véhicule inconnu ou personne libre : position propre', () => {
    const pl = new Placement();
    const p = fakePerson(1, { vehicleId: 99, seat: 0 });
    pl.resolve(fakeCtx([], [p]), p);
    expect(pl.x).toBe(5);
    expect(pl.z).toBe(7);
    expect(pl.attached).toBe(false);
    expect(pl.posture).toBe(-1);
  });

  it('personne portée : sur le porteur ; personne traînée : tête vers celui qui tire', () => {
    const pl = new Placement();
    const carrier = fakePerson(1, { x: 3, z: 4, heading: 1.2, upper: 'carry_person', carrying: 2 });
    const victim = fakePerson(2, { x: 3.4, z: 4.4, heldBy: 1 });
    let ctx = fakeCtx([], [carrier, victim]);
    pl.resolve(ctx, victim);
    expect(pl.x).toBe(3);
    expect(pl.z).toBe(4);
    expect(pl.heading).toBe(1.2);
    expect(pl.upper).toBe(U_CARRIED);
    expect(pl.noBlob).toBe(true);
    const dragger = fakePerson(1, { x: 0, z: 0, upper: 'drag', carrying: 2 });
    const dragged = fakePerson(2, { x: 0, z: 1, heldBy: 1 });
    ctx = fakeCtx([], [dragger, dragged]);
    pl.resolve(ctx, dragged);
    expect(pl.upper).toBe(U_DRAGGED);
    expect(pl.posture).toBe(POSTURE_DOWN);
    // sur le dos, la tête est à l'opposé du cap : cap = direction (tireur → victime)
    expect(pl.heading).toBeCloseTo(0, 6);
    expect(pl.x).toBe(0);
    expect(pl.z).toBe(1);
    // lien incohérent (le « porteur » ne porte pas cette personne) : ignoré
    const other = fakePerson(1, { carrying: 77, upper: 'carry_person' });
    pl.resolve(fakeCtx([], [other, victim]), victim);
    expect(pl.upper).toBe(-1);
  });
});
