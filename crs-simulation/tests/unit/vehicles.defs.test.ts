// Définitions des véhicules : tous les types du contrat, gabarits du dossier de réalisme, sièges et tourelles cohérents.
import { describe, expect, it } from 'vitest';
import { VEHICLE_KINDS, createVehicleDefs } from '@/sim/vehicles';
import { specFor } from '@/sim/vehicles/specs';
import { createVehicleBench } from '@/sim/vehicles/testkit';

const defs = createVehicleDefs();
const byKind = new Map(defs.map((d) => [d.kind, d]));

describe('définitions des véhicules', () => {
  it('couvre les 21 types du contrat, une seule fois chacun', () => {
    expect(defs.length).toBe(21);
    expect(new Set(defs.map((d) => d.kind)).size).toBe(21);
    for (const kind of VEHICLE_KINDS) expect(byKind.has(kind), kind).toBe(true);
  });

  it('enregistre les définitions dans le magasin du cœur et les expose par ctx.vehicles', async () => {
    const b = await createVehicleBench();
    expect(b.ctx.vehicles.defs.length).toBe(21);
    for (const kind of VEHICLE_KINDS) {
      const def = b.ctx.vehicles.def(kind);
      expect(def, kind).toBeDefined();
      const v = b.spawn(kind, 0, 0, 0);
      expect(v.def).toBe(def);
      expect(v.seats.length).toBe(def!.seats.length);
      expect(v.turretAmmo.length).toBe(def!.turrets.length);
    }
  });

  it('a des grandeurs physiques plausibles pour chaque type', () => {
    for (const d of defs) {
      expect(d.name.length, d.kind).toBeGreaterThan(2);
      expect(d.length, d.kind).toBeGreaterThan(d.width);
      expect(d.mass, d.kind).toBeGreaterThan(0);
      expect(d.maxSpeed, d.kind).toBeGreaterThan(10);
      expect(d.maxSpeed, d.kind).toBeLessThan(80);
      expect(d.accel, d.kind).toBeGreaterThan(0.5);
      expect(d.brake, d.kind).toBeGreaterThan(2);
      if (!d.flying) {
        expect(d.wheelbase, d.kind).toBeGreaterThan(d.length * 0.4);
        expect(d.wheelbase, d.kind).toBeLessThan(d.length * 0.75);
        expect(d.maxSteer, d.kind).toBeGreaterThan(0.4);
        expect(d.maxSteer, d.kind).toBeLessThan(0.75);
        expect(d.maxReverse, d.kind).toBeLessThan(d.maxSpeed * 0.3);
      }
    }
  });

  it('reprend les gabarits du dossier de réalisme (tableau C)', () => {
    const centaure = byKind.get('centaure')!;
    expect([centaure.length, centaure.width, centaure.height]).toEqual([7.5, 2.94, 3.82]);
    expect(centaure.mass).toBe(14500);
    expect(centaure.maxSpeed * 3.6).toBeCloseTo(100, 5);
    expect(centaure.armored && centaure.canPush).toBe(true);
    expect(centaure.seats.length).toBe(10); // 3 opérateurs + 7 passagers
    const ele = byKind.get('canon_eau')!;
    expect([ele.length, ele.width, ele.height]).toEqual([9.67, 2.6, 3.72]);
    expect(ele.mass).toBe(29000);
    expect(ele.seats.length).toBe(3);
    const fourgon = byKind.get('fourgon_crs')!;
    expect(fourgon.seats.length).toBe(9); // un groupe de sept et son chauffeur (fourgon 9 places)
    expect(fourgon.mass).toBe(3500);
    expect(byKind.get('car_crs')!.seats.length).toBe(50); // 1 + 49
    expect(byKind.get('moto_bravm')!.seats.map((s) => s.role)).toEqual(['driver', 'passenger']);
    expect(byKind.get('moto_bravm')!.wheelbase).toBe(1.54);
    expect(byKind.get('camion_pompiers')!.seats.length).toBe(6);
    expect(byKind.get('drone')!.mass).toBeLessThan(2);
    expect(byKind.get('drone')!.maxSpeed).toBeCloseTo(15, 5);
    expect(byKind.get('helicoptere')!.flying).toBe(true);
  });

  it('équipe le Centaure de 30 tubes et d\'une caméra sur mât, le canon à eau de deux canons, les pompiers d\'une lance', () => {
    const centaure = byKind.get('centaure')!;
    expect(centaure.turrets.map((t) => t.kind)).toEqual(['lance_grenades', 'camera']);
    expect(centaure.turrets[0]!.capacity).toBe(30);
    expect(centaure.turrets[0]!.interval).toBeCloseTo(0.3, 5);
    expect(centaure.turrets[0]!.pitchMin).toBeGreaterThan(0.3); // tir en cloche seulement
    const spec = specFor(centaure);
    expect(spec.launchers[0]!.ranges).toEqual([50, 100, 200]);
    expect(spec.launchers[0]!.reloadTime).toBe(120);
    expect(spec.mast).toBeGreaterThan(0);
    expect(spec.pushMass).toBe(12000);
    const ele = byKind.get('canon_eau')!;
    expect(ele.turrets.map((t) => t.kind)).toEqual(['canon_eau', 'canon_eau']);
    expect(ele.turrets[0]!.capacity).toBe(10000);
    const jet = specFor(ele).jets[0]!;
    expect(jet.flow).toBe(15);
    expect(jet.range).toBe(60);
    expect(jet.refill).toBe(90);
    const pompiers = byKind.get('camion_pompiers')!;
    expect(pompiers.turrets[0]!.kind).toBe('canon_eau');
    expect(specFor(pompiers).jets[0]!.rescue).toBe(true);
    expect(specFor(pompiers).jets[0]!.range).toBe(25);
  });

  it('place les sièges dans la caisse, le conducteur à gauche, et les sorties à l\'extérieur', () => {
    for (const d of defs) {
      if (d.kind === 'drone') {
        expect(d.seats.length).toBe(0);
        continue;
      }
      const drivers = d.seats.filter((s) => s.role === 'driver');
      expect(drivers.length, d.kind).toBe(1);
      expect(d.seats[0]!.role, d.kind).toBe('driver');
      // conduite à gauche (x = vers la droite), sauf deux-roues (dans l'axe) et hélicoptère (commandant à droite)
      if (d.kind !== 'helicoptere') expect(d.seats[0]!.x, d.kind).toBeLessThanOrEqual(0);
      for (const s of d.seats) {
        expect(Math.abs(s.x), d.kind).toBeLessThan(d.width / 2);
        expect(Math.abs(s.z), d.kind).toBeLessThan(d.length / 2);
        expect(s.y, d.kind).toBeGreaterThan(0.3);
        expect(s.y, d.kind).toBeLessThan(d.height);
        const outside = Math.abs(s.exitX) > d.width / 2 + 0.3 || Math.abs(s.exitZ) > d.length / 2 + 0.3;
        expect(outside, `${d.kind} : sortie (${s.exitX}, ${s.exitZ}) dans la caisse`).toBe(true);
      }
      const spec = specFor(d);
      expect(spec.seatTurret.length).toBe(d.seats.length);
      expect(spec.jets.length).toBe(d.turrets.length);
      expect(spec.launchers.length).toBe(d.turrets.length);
      // chaque tourelle armée est servie depuis un siège
      d.turrets.forEach((t, i) => {
        if (t.kind !== 'camera') expect(spec.seatTurret.indexOf(i), `${d.kind} tourelle ${i}`).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('n\'utilise aucun nom de constructeur : libellés génériques en français', () => {
    const names = defs.map((d) => d.name);
    expect(names).toContain('Fourgon de CRS');
    expect(names).toContain("Engin lanceur d'eau");
    expect(names).toContain('Centaure');
    expect(new Set(names).size).toBe(names.length);
  });
});
