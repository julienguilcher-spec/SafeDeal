// Locomotion : vitesses, accélérations, rotation, collisions contre un monde factice avec murs,
// saut et enjambement, postures, sol mouillé, fréquence réduite loin du joueur.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleLocomotionApi } from '@/sim/people';
import { createWallWorld } from '@/sim/people/testkit';

async function setup(): Promise<TestContext> {
  const t = createTestContext({ modules: [createSystems] });
  await t.start();
  return t;
}

function spawn(ctx: GameContext, x: number, z: number, kind: Person['kind'] = 'manifestant'): Person {
  return ctx.people.spawn({ kind, x, z, seed: 7 });
}

function speedOf(p: Person): number {
  return Math.hypot(p.vx, p.vz);
}

describe('locomotion : allures et accélérations', () => {
  it('marche, course et sprint plafonnent aux vitesses de la personne', async () => {
    const t = await setup();
    const walker = spawn(t.ctx, 0, 0);
    const runner = spawn(t.ctx, 10, 0);
    const sprinter = spawn(t.ctx, 20, 0);
    walker.cmd.moveZ = 1;
    runner.cmd.moveZ = 1;
    runner.cmd.gait = 1;
    sprinter.cmd.moveZ = 1;
    sprinter.cmd.gait = 2;
    t.step(3);
    expect(speedOf(walker)).toBeCloseTo(walker.speedWalk, 2);
    expect(speedOf(runner)).toBeCloseTo(runner.speedRun, 2);
    expect(speedOf(sprinter)).toBeCloseTo(sprinter.speedSprint, 2);
    // cap h = 0 : on avance vers +z (sud)
    expect(walker.z).toBeGreaterThan(3.5);
    expect(Math.abs(walker.x)).toBeLessThan(1e-6);
  });

  it("l'accélération est progressive : ≈ 4,2 m/s² au départ, arrêt en moins d'une seconde", async () => {
    const t = await setup();
    const p = spawn(t.ctx, 0, 0);
    p.cmd.moveX = 1;
    p.cmd.gait = 2;
    t.step(0.2);
    expect(speedOf(p)).toBeGreaterThan(0.6);
    expect(speedOf(p)).toBeLessThan(1.1); // 0,2 s × 4,2 m/s²
    t.step(0.5);
    expect(speedOf(p)).toBeLessThan(3.2);
    t.step(1.2);
    expect(speedOf(p)).toBeCloseTo(p.speedSprint, 1);
    // freinage : plus vif que l'accélération, mais pas instantané
    const x0 = p.x;
    p.cmd.moveX = 0;
    t.step(0.2);
    expect(speedOf(p)).toBeGreaterThan(3);
    t.step(0.7);
    expect(speedOf(p)).toBe(0);
    const stopping = p.x - x0;
    expect(stopping).toBeGreaterThan(1.2);
    expect(stopping).toBeLessThan(3);
  });

  it('la norme de cmd.move module la vitesse et est bornée à 1', async () => {
    const t = await setup();
    const half = spawn(t.ctx, 0, 0);
    const over = spawn(t.ctx, 10, 0);
    half.cmd.moveZ = 0.5;
    over.cmd.moveX = 3;
    over.cmd.moveZ = 4;
    t.step(2);
    expect(speedOf(half)).toBeCloseTo(half.speedWalk * 0.5, 2);
    expect(speedOf(over)).toBeCloseTo(over.speedWalk, 2);
  });

  it('la rotation du corps est bornée et suit le déplacement ou la visée', async () => {
    const t = await setup();
    const p = spawn(t.ctx, 0, 0);
    // demi-tour demandé : le corps ne se retourne pas en un pas
    p.cmd.moveZ = -1;
    t.step(1 / 30);
    expect(Math.abs(p.heading)).toBeLessThan(0.5);
    t.step(1);
    expect(Math.abs(Math.abs(p.heading) - Math.PI)).toBeLessThan(0.02);
    // faceMove = false : le corps suit la visée, et reculer est plus lent
    const q = spawn(t.ctx, 20, 0);
    q.cmd.faceMove = false;
    q.cmd.aimYaw = Math.PI / 2; // regarde vers l'est
    q.cmd.moveX = -1; // recule vers l'ouest
    q.cmd.gait = 1;
    t.step(2.5);
    expect(q.heading).toBeCloseTo(Math.PI / 2, 2);
    expect(q.aimYaw).toBeCloseTo(Math.PI / 2, 2);
    expect(speedOf(q)).toBeCloseTo(q.speedRun * 0.6, 1);
    expect(q.x).toBeLessThan(18);
  });

  it('accroupi on avance lentement, et on se relève pour bouger depuis la position assise', async () => {
    const t = await setup();
    const p = spawn(t.ctx, 0, 0);
    p.cmd.moveZ = 1;
    p.cmd.crouch = true;
    t.step(1.5);
    expect(p.posture).toBe('crouch');
    expect(speedOf(p)).toBeCloseTo(p.speedWalk * 0.55, 2);
    p.cmd.crouch = false;
    t.step(0.1);
    expect(p.posture).toBe('stand');

    const s = spawn(t.ctx, 20, 0);
    s.posture = 'sit';
    t.step(0.5);
    expect(s.posture).toBe('sit');
    expect(speedOf(s)).toBe(0);
    s.cmd.moveX = 1;
    t.step(0.3);
    expect(s.posture).toBe('stand');
    expect(speedOf(s)).toBe(0); // le temps de se relever (0,6 s)
    t.step(1.5);
    expect(speedOf(s)).toBeGreaterThan(1);
  });

  it('blessures, étourdissement et sol mouillé réduisent la vitesse', async () => {
    const t = await setup();
    const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const p = spawn(t.ctx, 0, 0);
    t.step(0.1);
    const free = loco.speedLimit(p, 2);
    expect(free).toBeCloseTo(p.speedSprint, 3);
    p.injury = 'light';
    expect(loco.speedLimit(p, 2)).toBeCloseTo(free * 0.9, 3);
    p.injury = 'serious';
    // blessé grave : plus de sprint, course très ralentie
    expect(loco.speedLimit(p, 2)).toBeCloseTo(p.speedRun * 0.55, 3);
    p.injury = 'critical';
    expect(loco.speedLimit(p, 2)).toBeCloseTo(p.speedWalk * 0.25, 3);
    p.injury = 'none';
    p.stun = 1;
    expect(loco.speedLimit(p, 2)).toBeCloseTo(p.speedRun * 0.4, 3);
    p.stun = 0;
    p.gas = 1;
    expect(loco.speedLimit(p, 1)).toBeCloseTo(p.speedRun * 0.6, 3);
    p.gas = 0;
    t.ctx.env.setWeather('averse', true);
    expect(t.ctx.env.state.wetness).toBeGreaterThan(0.9);
    expect(loco.speedLimit(p, 2)).toBeCloseTo(p.speedSprint * 0.9, 2);
    // sol détrempé : on accélère moins fort
    const q = spawn(t.ctx, 30, 0);
    q.cmd.moveX = 1;
    q.cmd.gait = 2;
    t.step(0.5);
    expect(speedOf(q)).toBeLessThan(0.5 * 4.2 * 0.72);
  });

  it('une commande invalide (NaN) ne contamine ni la position ni la vitesse', async () => {
    const t = await setup();
    const p = spawn(t.ctx, 3, 4);
    p.cmd.moveX = Number.NaN;
    p.cmd.moveZ = 1;
    p.cmd.aimYaw = Number.NaN;
    t.step(1);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(Number.isFinite(p.vx) && Number.isFinite(p.vz)).toBe(true);
    expect(Number.isFinite(p.heading) && Number.isFinite(p.aimYaw)).toBe(true);
  });
});

describe('locomotion : collisions contre un monde avec murs', () => {
  it("un mur arrête la marche, et l'on glisse le long quand on l'aborde en biais", async () => {
    const t = await setup();
    // mur nord-sud épais de 1 m, à l'est : face ouest à x = 5
    t.ctx.world = createWallWorld(t.ctx.world, [{ x0: 5, z0: -50, x1: 6, z1: 50 }]);
    const p = spawn(t.ctx, 0, 0);
    p.cmd.moveX = 1;
    p.cmd.gait = 1;
    t.step(4);
    expect(p.x).toBeCloseTo(5 - p.radius, 3);
    expect(Math.abs(p.vx)).toBeLessThan(0.2); // la composante vers le mur est annulée
    // en biais : la composante le long du mur subsiste
    const q = spawn(t.ctx, 0, -20);
    q.cmd.moveX = Math.SQRT1_2;
    q.cmd.moveZ = Math.SQRT1_2;
    q.cmd.gait = 1;
    t.step(5);
    expect(q.x).toBeCloseTo(5 - q.radius, 3);
    expect(q.z).toBeGreaterThan(-20 + 6);
    expect(q.vz).toBeGreaterThan(1.5);
  });

  it('une rue en impasse : la personne reste dans la chaussée, sans traverser les angles', async () => {
    const t = await setup();
    t.ctx.world = createWallWorld(t.ctx.world, [
      { x0: -7, z0: -40, x1: -6, z1: 40 }, // façade ouest
      { x0: 6, z0: -40, x1: 7, z1: 40 }, // façade est
      { x0: -7, z0: 20, x1: 7, z1: 21 }, // fond de l'impasse
    ]);
    const p = spawn(t.ctx, 0, 0);
    p.cmd.moveX = 0.8;
    p.cmd.moveZ = 0.6;
    p.cmd.gait = 2;
    t.step(12);
    expect(p.x).toBeLessThanOrEqual(6 - p.radius + 1e-6);
    expect(p.z).toBeLessThanOrEqual(20 - p.radius + 1e-6);
    expect(p.x).toBeGreaterThan(5.5);
    expect(p.z).toBeGreaterThan(19.5);
  });

  it('le mobilier et les véhicules bloquent aussi', async () => {
    const t = await setup();
    const ctx = t.ctx;
    ctx.props.spawn('kiosque', 5, 0, 0); // demi-largeur 1,5 m
    const p = spawn(ctx, 0, 0);
    p.cmd.moveX = 1;
    t.step(5);
    expect(p.x).toBeCloseTo(5 - 1.5 - p.radius, 2);

    const car = ctx.vehicles.spawn('voiture', 0, 30, 0); // largeur 1,8 m, cap sud
    const q = spawn(ctx, -6, 30);
    q.cmd.moveX = 1;
    t.step(6);
    expect(q.x).toBeCloseTo(car.x - 0.9 - q.radius, 2);
  });
});

describe('locomotion : saut et enjambement', () => {
  it('un saut simple décolle les pieds puis retombe, et coûte du souffle', async () => {
    const t = await setup();
    const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const p = spawn(t.ctx, 0, 0);
    p.stamina = 80;
    p.cmd.jump = true;
    t.step(1 / 30);
    expect(p.cmd.jump).toBe(false); // la commande est consommée
    expect(loco.isAirborne(p)).toBe(true);
    t.step(0.2);
    expect(p.y).toBeGreaterThan(0.25);
    t.step(0.4);
    expect(loco.isAirborne(p)).toBe(false);
    expect(p.y).toBe(0);
    expect(p.stamina).toBeLessThan(80);
  });

  it('une barrière Vauban arrête la marche mais se franchit en sautant', async () => {
    const t = await setup();
    const ctx = t.ctx;
    // barrière en travers du chemin (longue de 2,5 m selon x, épaisse de 0,4 m selon z)
    ctx.props.spawn('barriere_vauban', 0, 3, 0);
    const p = spawn(ctx, 0, 0);
    p.cmd.moveZ = 1;
    t.step(4);
    expect(p.z).toBeCloseTo(3 - 0.2 - p.radius, 2); // bloqué devant
    p.cmd.jump = true;
    t.step(1.5);
    expect(p.z).toBeGreaterThan(3 + 0.2 + p.radius - 0.01); // de l'autre côté
    expect(p.y).toBe(0);
  });

  it("pas d'enjambement si la réception est encombrée, ni accroupi, ni en portant quelqu'un", async () => {
    const t = await setup();
    const ctx = t.ctx;
    ctx.props.spawn('barriere_vauban', 0, 3, 0);
    ctx.props.spawn('kiosque', 0, 4.6, 0); // juste derrière la barrière
    const p = spawn(ctx, 0, 0);
    p.cmd.moveZ = 1;
    t.step(4);
    p.cmd.jump = true;
    t.step(1.5);
    expect(p.z).toBeLessThan(3);

    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    const q = spawn(ctx, 20, 0);
    q.cmd.crouch = true;
    t.step(0.2);
    q.cmd.jump = true;
    t.step(1 / 30);
    expect(loco.isAirborne(q)).toBe(false);
    const cuffed = spawn(ctx, 30, 0);
    cuffed.custody = 'cuffed';
    cuffed.cmd.jump = true;
    t.step(1 / 30);
    expect(loco.isAirborne(cuffed)).toBe(false);
  });

  it("un obstacle trop haut ne s'enjambe pas", async () => {
    const t = await setup();
    const ctx = t.ctx;
    ctx.props.spawn('barriere_chantier', 0, 3, 0); // 2 m de haut
    const p = spawn(ctx, 0, 0);
    p.cmd.moveZ = 1;
    t.step(4);
    p.cmd.jump = true;
    t.step(1.5);
    expect(p.z).toBeLessThan(3);
  });
});

describe('locomotion : personnes tenues et occupants de véhicules', () => {
  it('une personne menottée et escortée marche juste devant son gardien, qui ne peut plus courir vite', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    const cop = spawn(ctx, 0, 0, 'crs');
    const detainee = spawn(ctx, 0.5, 0.2);
    // lien posé par un autre module (interpellation)
    cop.carrying = detainee.id;
    detainee.heldBy = cop.id;
    detainee.custody = 'escorted';
    detainee.cmd.moveX = -1; // la personne tenue ne décide plus de ses déplacements
    cop.cmd.moveZ = 1;
    cop.cmd.gait = 2;
    t.step(4);
    expect(loco.speedLimit(cop, 2)).toBeLessThanOrEqual(cop.speedWalk * 1.15 + 1e-9);
    expect(cop.z).toBeGreaterThan(4);
    // devant lui (cap sud), à une cinquantaine de centimètres
    expect(detainee.z - cop.z).toBeGreaterThan(0.4);
    expect(detainee.z - cop.z).toBeLessThan(0.7);
    expect(Math.abs(detainee.x - cop.x)).toBeLessThan(0.3);
    expect(detainee.heading).toBeCloseTo(cop.heading, 1);
    // le gardien lâche prise (ou disparaît) : la personne est rendue à elle-même
    cop.carrying = 0;
    t.step(0.1);
    expect(detainee.heldBy).toBe(0);
  });

  it("un mur retient la personne escortée : elle n'est jamais poussée à travers", async () => {
    const t = await setup();
    const ctx = t.ctx;
    ctx.world = createWallWorld(ctx.world, [{ x0: -10, z0: 3, x1: 10, z1: 4 }]);
    const cop = spawn(ctx, 0, 0, 'crs');
    const detainee = spawn(ctx, 0, 0.6);
    cop.carrying = detainee.id;
    detainee.heldBy = cop.id;
    cop.cmd.moveZ = 1;
    t.step(5);
    expect(cop.z).toBeLessThanOrEqual(3 - cop.radius + 1e-6);
    expect(detainee.z).toBeLessThanOrEqual(3 - detainee.radius + 1e-6);
  });

  it("l'occupant d'un véhicule suit son siège ; il n'est ni déplacé ni repoussé comme un piéton", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const car = ctx.vehicles.spawn('voiture', 0, 0, 0);
    const driver = spawn(ctx, 3, 0);
    expect(ctx.vehicles.enter(driver, car, 'driver')).toBe(true);
    driver.cmd.moveX = 1; // sans effet à bord
    const seat = car.def.seats[0]!;
    car.x = 40;
    car.z = -10;
    car.heading = Math.PI / 2; // cap est : avant = +x, droite = +z
    car.vx = 5;
    t.step(0.1);
    expect(driver.x).toBeCloseTo(40 + seat.z, 6);
    expect(driver.z).toBeCloseTo(-10 + seat.x, 6);
    expect(driver.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(driver.vx).toBe(5);
    // véhicule retiré : le magasin fait descendre l'occupant, qui redevient piéton
    ctx.vehicles.remove(car.id);
    t.step(0.5);
    expect(driver.vehicleId).toBe(0);
    expect(driver.posture).toBe('stand');
    expect(Math.hypot(driver.vx, driver.vz)).toBeGreaterThan(0.5);
  });
});

describe('locomotion : fréquence réduite loin du joueur', () => {
  it('une personne lointaine parcourt la même distance, en étant mise à jour moins souvent', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const me = spawn(ctx, 0, 0, 'crs');
    ctx.player.possess(me.id, 'crs');
    const near = spawn(ctx, 10, 0);
    const far = spawn(ctx, 300, 0);
    near.cmd.moveZ = 1;
    far.cmd.moveZ = 1;
    t.step(10);
    expect(near.z).toBeGreaterThan(13);
    expect(Math.abs(far.z - near.z)).toBeLessThan(0.25);
    expect(speedOf(far)).toBeCloseTo(far.speedWalk, 2);
  });
});
