// Monter, descendre, conduire : sièges, position des occupants, portes, règles d'accès, gestionnaires d'interaction.
import { describe, expect, it } from 'vitest';
import type { GameEvents, InteractionOption, Person, Vehicle } from '@/core/contracts';
import { vehicleToWorldX, vehicleToWorldZ } from '@/core/math';
import { SEAT_FEET_DROP } from '@/sim/vehicles';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

function seatWorld(v: Vehicle, seat: number): { x: number; z: number } {
  const s = v.def.seats[seat]!;
  return { x: v.x + vehicleToWorldX(s.x, s.z, v.heading), z: v.z + vehicleToWorldZ(s.x, s.z, v.heading) };
}

function exitWorld(v: Vehicle, seat: number): { x: number; z: number } {
  const s = v.def.seats[seat]!;
  return { x: v.x + vehicleToWorldX(s.exitX, s.exitZ, v.heading), z: v.z + vehicleToWorldZ(s.exitX, s.exitZ, v.heading) };
}

function options(b: VehicleBench, p: Person): InteractionOption[] {
  const out: InteractionOption[] = [];
  b.ctx.interactions.options(p, out);
  return out.map((o) => ({ ...o }));
}

describe('monter et descendre (API)', () => {
  it('assoit la personne au siège demandé, met le contact, émet les événements', async () => {
    const b = await createVehicleBench();
    const entered: GameEvents['vehicle:entered'][] = [];
    b.ctx.events.on('vehicle:entered', (e) => entered.push({ ...e }));
    const v = b.spawn('fourgon_crs', 10, 5, 0.7);
    const driver = b.person('crs', 0, 0);
    const mate = b.person('crs', 0, 0);
    expect(v.engineOn).toBe(false);
    expect(b.ctx.vehicles.enter(driver, v, 'driver')).toBe(true);
    expect(driver.vehicleId).toBe(v.id);
    expect(driver.seat).toBe(0);
    expect(v.seats[0]).toBe(driver.id);
    expect(driver.posture).toBe('seated');
    expect(driver.upper).toBe('drive');
    expect(v.engineOn).toBe(true);
    expect(b.ext.driverOf(v)).toBe(driver);
    expect(b.ctx.vehicles.enter(mate, v, 3)).toBe(true);
    expect(mate.seat).toBe(3);
    expect(mate.upper).toBe('ride');
    expect(entered).toEqual([
      { vehicleId: v.id, personId: driver.id, seat: 0 },
      { vehicleId: v.id, personId: mate.id, seat: 3 },
    ]);
    // siège pris, second conducteur, autre véhicule : refus
    expect(b.ctx.vehicles.enter(b.person('crs', 0, 0), v, 3)).toBe(false);
    expect(b.ctx.vehicles.enter(b.person('crs', 0, 0), v, 'driver')).toBe(false);
    const other = b.spawn('voiture', 40, 0);
    expect(b.ctx.vehicles.enter(driver, other)).toBe(false);
    // changement de place à bord
    expect(b.ctx.vehicles.enter(mate, v, 1)).toBe(true);
    expect(v.seats[3]).toBe(0);
    expect(v.seats[1]).toBe(mate.id);
  });

  it('recale les occupants sur leur siège à chaque pas, en ligne droite comme en virage', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('fourgon_crs', 0, 0, 0.4);
    const driver = b.driver(v);
    const riders: Person[] = [];
    for (let i = 1; i < 6; i++) {
      const p = b.person('crs', 50, 50);
      expect(b.ctx.vehicles.enter(p, v, i)).toBe(true);
      riders.push(p);
    }
    expect(b.ctx.vehicles.enter(b.person('crs', 0, 0), v)).toBe(false); // complet : 6 places
    for (let i = 0; i < 30 * 8; i++) {
      v.cmd.throttle = 0.7;
      v.cmd.steer = Math.sin(i / 40) * 0.6;
      b.step(1 / 30);
      if (i % 30 !== 0) continue;
      [driver, ...riders].forEach((p, seat) => {
        const w = seatWorld(v, seat);
        expect(p.x).toBeCloseTo(w.x, 6);
        expect(p.z).toBeCloseTo(w.z, 6);
        expect(p.y).toBeCloseTo(v.y + v.def.seats[seat]!.y - SEAT_FEET_DROP, 6);
        expect(p.heading).toBe(v.heading);
        expect(p.posture).toBe('seated');
        expect(p.vx).toBe(v.vx);
      });
    }
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(30);
    // conducteur à GAUCHE du véhicule : produit avec le vecteur « droite » négatif
    const rightX = -Math.cos(v.heading);
    const rightZ = Math.sin(v.heading);
    expect((driver.x - v.x) * rightX + (driver.z - v.z) * rightZ).toBeLessThan(-0.3);
    // un passager dont l'animation du haut du corps est prise (radio) la retrouve ensuite
    riders[0]!.upper = 'radio';
    b.step(0.1);
    expect(riders[0]!.upper).toBe('radio');
    riders[0]!.upper = 'none';
    b.step(0.1);
    expect(riders[0]!.upper).toBe('ride');
  });

  it('fait sortir du côté de la porte, debout, hors de l\'emprise ; le moteur s\'arrête avec le conducteur', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const exited: GameEvents['vehicle:exited'][] = [];
    b.ctx.events.on('vehicle:exited', (e) => exited.push({ ...e }));
    const v = b.spawn('voiture', 20, 10, 1.1);
    const driver = b.driver(v);
    const passenger = b.person('passant', 0, 0);
    b.ctx.vehicles.enter(passenger, v, 1);
    expect(b.ctx.vehicles.exit(passenger)).toBe(true);
    const pw = exitWorld(v, 1);
    expect(passenger.x).toBeCloseTo(pw.x, 6);
    expect(passenger.z).toBeCloseTo(pw.z, 6);
    expect(passenger.vehicleId).toBe(0);
    expect(passenger.seat).toBe(-1);
    expect(passenger.posture).toBe('stand');
    expect(passenger.upper).toBe('none');
    expect(v.seats[1]).toBe(0);
    expect(v.engineOn).toBe(true); // le conducteur est toujours là
    expect(b.ctx.vehicles.exit(driver)).toBe(true);
    const dw = exitWorld(v, 0);
    expect(driver.x).toBeCloseTo(dw.x, 6);
    expect(driver.z).toBeCloseTo(dw.z, 6);
    expect(v.engineOn).toBe(false);
    expect(exited.map((e) => e.personId)).toEqual([passenger.id, driver.id]);
    expect(b.ctx.vehicles.exit(driver)).toBe(false); // déjà dehors
    // gyrophares allumés (intervention) : le moteur reste en marche quand le conducteur descend
    const van = b.spawn('fourgon_crs', 60, 0);
    const crs = b.driver(van);
    b.ext.setBeacons(van, true);
    b.ctx.vehicles.exit(crs);
    expect(van.engineOn).toBe(true);
  });

  it('choisit un point de sortie libre quand la porte donne sur un mur, un véhicule ou un objet', async () => {
    // mur le long du flanc gauche de la voiture (cap 0 : gauche = +x)
    const world = createFakeWorld({ boxes: [{ minX: 1.1, maxX: 3, minZ: -10, maxZ: 10, height: 6 }] });
    const b = await createVehicleBench({ world });
    const v = b.spawn('voiture', 0, 0, 0);
    const driver = b.driver(v);
    const nominal = exitWorld(v, 0);
    expect(world.isFree(nominal.x, nominal.z, driver.radius)).toBe(false);
    b.ctx.vehicles.exit(driver);
    expect(world.isFree(driver.x, driver.z, driver.radius)).toBe(true);
    expect(driver.x).toBeLessThan(-v.def.width / 2); // sorti par l'autre côté
    expect(Math.abs(driver.z)).toBeLessThan(v.def.length / 2 + 1.5);

    // porte du passager bloquée par un véhicule garé contre : on sort ailleurs, jamais dans une caisse
    const car = b.spawn('voiture', 0, 40, 0);
    const blocker = b.spawn('fourgon_crs', -2.1, 40, 0); // collé au flanc droit (droite = −x)
    const p = b.person('passant', 0, 0);
    b.ctx.vehicles.enter(p, car, 1);
    b.ctx.vehicles.exit(p);
    for (const o of [car, blocker]) {
      const inside = Math.abs(p.x - o.x) < o.def.width / 2 && Math.abs(p.z - o.z) < o.def.length / 2;
      expect(inside).toBe(false);
    }
    // objet posé devant la portière
    const car2 = b.spawn('voiture', 0, 80, 0);
    const q = b.person('passant', 0, 0);
    b.ctx.vehicles.enter(q, car2, 0);
    const door = exitWorld(car2, 0);
    const bin = b.ctx.props.spawn('conteneur', door.x, door.z, 0);
    b.ctx.vehicles.exit(q);
    expect(Math.hypot(q.x - bin.x, q.z - bin.z)).toBeGreaterThan(0.6);
  });

  it('libère le siège d\'une personne retirée du monde, et fait descendre tout le monde quand le véhicule disparaît', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('voiture', 0, 0);
    const driver = b.driver(v);
    const p = b.person('passant', 0, 0);
    b.ctx.vehicles.enter(p, v, 1);
    b.ctx.people.remove(p.id);
    b.step(0.1);
    expect(v.seats[1]).toBe(0);
    b.ctx.vehicles.remove(v.id);
    expect(driver.vehicleId).toBe(0);
    expect(driver.posture).toBe('stand');
    b.step(0.1); // aucun reliquat dans le module
    expect(b.ctx.vehicles.list.length).toBe(0);
  });
});

describe('gestionnaires d\'interaction', () => {
  it('« monter » propose le siège de la porte la plus proche au joueur, puis l\'assoit après la durée', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('voiture', 0, 0, 0);
    const player = b.person('crs', 0, 0);
    player.isPlayer = true;
    // devant la portière arrière droite (siège 3)
    const door = exitWorld(v, 3);
    player.x = door.x - 0.2;
    player.z = door.z;
    b.step(0.05);
    const opts = options(b, player);
    const monter = opts.find((o) => o.verb === 'monter')!;
    expect(monter).toBeDefined();
    expect(monter.targetKind).toBe('vehicle');
    expect(monter.targetId).toBe(v.id);
    expect(monter.label).toContain('Monter');
    expect(monter.label).toContain('passager');
    expect(monter.duration).toBeGreaterThan(0.5);
    expect(b.ext.chooseSeat(player, v)).toBe(3);
    expect(b.ctx.interactions.startVerb(player, 'monter', v.id)).toBe(true);
    b.step(0.3);
    expect(player.vehicleId).toBe(0); // pas encore assis
    expect(b.ext.doorOpen(v, 3)).toBeGreaterThan(0.5); // la portière s'ouvre
    b.step(monter.duration);
    expect(player.vehicleId).toBe(v.id);
    expect(player.seat).toBe(3);
    b.step(3);
    expect(b.ext.doorOpen(v, 3)).toBe(0);
  });

  it('devant la portière du conducteur, « conduire » passe en tête et donne le volant', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('voiture', 0, 0, 0);
    const player = b.person('passant', 0, 0);
    player.isPlayer = true;
    const door = exitWorld(v, 0);
    player.x = door.x;
    player.z = door.z;
    b.step(0.05);
    const opts = options(b, player);
    expect(opts[0]!.verb).toBe('conduire');
    expect(opts[0]!.label).toContain('Conduire');
    expect(opts.some((o) => o.verb === 'monter')).toBe(true);
    expect(b.ctx.interactions.start(player, opts[0]!)).toBe(true);
    b.step(2);
    expect(player.seat).toBe(0);
    expect(v.engineOn).toBe(true);
    // à bord, la seule option du module est de descendre
    const inside = options(b, player);
    expect(inside.map((o) => o.verb)).toEqual(['descendre']);
  });

  it('respecte les postes : le conducteur prend le volant, l\'opérateur la tourelle, les autres les places passagers', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('centaure', 0, 0, 0);
    const pilot = b.person('gendarme', -3, 2);
    pilot.poste = 'conducteur';
    const gunner = b.person('gendarme', 3, 1);
    gunner.poste = 'operateur';
    const trooper = b.person('gendarme', -2.2, 1.9); // tout près de la portière du pilote, mais sans poste
    expect(b.ext.chooseSeat(pilot, v)).toBe(0);
    expect(v.def.seats[b.ext.chooseSeat(gunner, v)]!.role).toBe('gunner');
    expect(v.def.seats[b.ext.chooseSeat(trooper, v)]!.role).toBe('passenger');
    b.ctx.vehicles.enter(gunner, v, b.ext.chooseSeat(gunner, v));
    expect(b.ext.turretOfSeat(v, gunner.seat)).toBe(0); // lance-grenades
    expect(b.ext.seatOfTurret(v, 0)).toBe(gunner.seat);
    expect(b.ext.turretOfSeat(v, 1)).toBe(1); // chef d'engin : caméra du mât
    // moto : le passager désigné monte derrière
    const moto = b.spawn('moto_bravm', 30, 0);
    const rider = b.person('bravm', 29, 0);
    rider.poste = 'passager_moto';
    expect(b.ext.chooseSeat(rider, moto)).toBe(1);
    // tous les sièges passagers pris : un PNJ accepte alors une autre place
    const car = b.spawn('citadine', 60, 0);
    for (let i = 1; i < 4; i++) b.ctx.vehicles.enter(b.person('passant', 0, 0), car, i);
    const last = b.person('passant', 61.5, 0);
    expect(b.ext.chooseSeat(last, car)).toBe(0);
  });

  it('« descendre » fait sortir à l\'arrêt, pas en roulant', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture', 0, 0, 0);
    const driver = b.driver(v);
    b.step(0.1);
    expect(options(b, driver).some((o) => o.verb === 'descendre')).toBe(true);
    v.cmd.throttle = 1;
    b.step(3);
    expect(v.speed).toBeGreaterThan(3);
    expect(options(b, driver).some((o) => o.verb === 'descendre')).toBe(false);
    expect(b.ctx.interactions.startVerb(driver, 'descendre', v.id)).toBe(false);
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    b.step(4);
    expect(b.ctx.interactions.startVerb(driver, 'descendre', v.id)).toBe(true);
    b.step(2);
    expect(driver.vehicleId).toBe(0);
    expect(driver.posture).toBe('stand');
  });

  it('un passager prend le volant libre sans descendre (« conduire » à bord, à l\'arrêt)', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('fourgon_crs', 0, 0);
    const p = b.person('crs', 0, 0);
    b.ctx.vehicles.enter(p, v, 1);
    b.step(0.1);
    const opt = options(b, p).find((o) => o.verb === 'conduire')!;
    expect(opt).toBeDefined();
    expect(opt.label).toContain('volant');
    b.ctx.interactions.start(p, opt);
    b.step(2);
    expect(p.seat).toBe(0);
    expect(v.seats[1]).toBe(0);
    expect(p.upper).toBe('drive');
  });

  it('un manifestant ne peut ni monter ni conduire un véhicule de police, sauf dans une épave ouverte', async () => {
    const b = await createVehicleBench();
    const van = b.spawn('fourgon_crs', 0, 0, 0);
    const protester = b.person('manifestant', 0, 0);
    const door = exitWorld(van, 0);
    protester.x = door.x;
    protester.z = door.z;
    const crs = b.person('crs', door.x, door.z + 0.3);
    b.step(0.05);
    expect(b.ext.canBoard(protester, van)).toBe(false);
    expect(b.ext.canDrive(protester, van)).toBe(false);
    expect(b.ext.chooseSeat(protester, van)).toBe(-1);
    expect(options(b, protester).filter((o) => o.verb === 'monter' || o.verb === 'conduire')).toEqual([]);
    expect(b.ctx.interactions.startVerb(protester, 'monter', van.id)).toBe(false);
    expect(b.ext.canBoard(crs, van)).toBe(true);
    expect(options(b, crs).some((o) => o.verb === 'conduire')).toBe(true);
    // épave : portes ouvertes, on peut y entrer mais plus la conduire
    b.ctx.vehicles.damage(van, { amount: 500, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    expect(van.state).toBe('wrecked');
    expect(b.ext.canBoard(protester, van)).toBe(true);
    expect(b.ext.canDrive(protester, van)).toBe(false);
    expect(options(b, protester).some((o) => o.verb === 'monter')).toBe(true);
    expect(options(b, protester).some((o) => o.verb === 'conduire')).toBe(false);
    // les véhicules civils restent ouverts à tous ; le camion de pompiers est réservé aux secours et à la police
    const car = b.spawn('voiture', 30, 0);
    expect(b.ext.canDrive(protester, car)).toBe(true);
    const engine = b.spawn('camion_pompiers', 60, 0);
    expect(b.ext.canBoard(protester, engine)).toBe(false);
    expect(b.ext.canBoard(b.person('pompier', 0, 0), engine)).toBe(true);
  });

  it('verrouillage : fermé à clé, un véhicule civil n\'accepte personne, un véhicule de police seulement les policiers', async () => {
    const b = await createVehicleBench();
    const car = b.spawn('voiture', 0, 0);
    const van = b.spawn('fourgon_crs', 30, 0);
    const civil = b.person('passant', 1.5, 0);
    const crs = b.person('crs', 31.8, 0);
    b.ext.setLocked(car, true);
    b.ext.setLocked(van, true);
    expect(car.locked).toBe(true);
    expect(b.ext.canBoard(civil, car)).toBe(false);
    expect(b.ext.canBoard(crs, van)).toBe(true);
    b.step(0.05);
    expect(options(b, civil).length).toBe(0);
    b.ext.setLocked(car, false);
    expect(b.ext.canBoard(civil, car)).toBe(true);
    // l'API reste permissive : un script de mission ou une interpellation assoit qui il veut
    const arrested = b.person('manifestant', 0, 0);
    arrested.custody = 'cuffed';
    expect(b.ctx.vehicles.enter(arrested, van, 'passenger')).toBe(true);
    // menotté, il ne descend pas de lui-même
    b.step(0.05);
    expect(options(b, arrested).length).toBe(0);
  });

  it('on ne monte pas dans un véhicule en feu, ni trop loin, ni à terre', async () => {
    const b = await createVehicleBench();
    const car = b.spawn('voiture', 0, 0);
    const p = b.person('passant', 1.6, 0);
    b.step(0.05);
    expect(options(b, p).length).toBeGreaterThan(0);
    b.ctx.health.setDown(p, true);
    expect(options(b, p).length).toBe(0);
    b.ctx.health.setDown(p, false);
    p.posture = 'stand';
    p.x = 6;
    b.step(0.05);
    expect(options(b, p).length).toBe(0);
    p.x = 1.6;
    b.ext.ignite(car, 0);
    b.step(0.05);
    expect(options(b, p).length).toBe(0);
    expect(b.ext.canBoard(p, car)).toBe(false);
  });
});
