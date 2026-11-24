// Dégâts et feu : embrasement, propagation, fumée, explosion, carcasse calcinée, extinction, évacuation, retournement.
import { describe, expect, it } from 'vitest';
import type { GameEvents, Vec2 } from '@/core/contracts';
import { DOUSE_EVENT, FLIPPED_EVENT } from '@/sim/vehicles';
import { createFakeHazards, createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

function record<K extends keyof GameEvents>(b: VehicleBench, name: K): GameEvents[K][] {
  const list: GameEvents[K][] = [];
  b.ctx.events.on(name, (e) => list.push({ ...e }));
  return list;
}

describe('dégâts', () => {
  it('passe de « ok » à « endommagé » puis « épave », avec un événement à chaque changement', async () => {
    const b = await createVehicleBench();
    const states = record(b, 'vehicle:state');
    const v = b.spawn('voiture');
    b.driver(v);
    const hit = (amount: number): void => b.ctx.vehicles.damage(v, { amount, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    hit(30);
    expect(v.health).toBe(70);
    expect(v.state).toBe('ok');
    hit(30);
    expect(v.state).toBe('damaged');
    hit(60);
    expect(v.health).toBe(0);
    expect(v.state).toBe('wrecked');
    expect(v.engineOn).toBe(false);
    expect(states.map((s) => s.state)).toEqual(['damaged', 'wrecked']);
    // une épave ne roule plus
    v.cmd.throttle = 1;
    b.step(3);
    expect(v.z).toBe(0);
  });

  it('le blindage divise les dégâts ; gaz et eau n\'abîment pas un véhicule', async () => {
    const b = await createVehicleBench();
    const car = b.spawn('voiture', 0, 0);
    const tank = b.spawn('centaure', 20, 0);
    for (const v of [car, tank]) b.ctx.vehicles.damage(v, { amount: 40, kind: 'blunt', sourceId: 0, x: 0, z: 0 });
    expect(car.health).toBe(60);
    expect(tank.health).toBeGreaterThan(94);
    b.ctx.vehicles.damage(tank, { amount: 500, kind: 'bullet', sourceId: 0, x: 0, z: 0 });
    expect(tank.health).toBeGreaterThan(94); // à l'épreuve des balles
    b.ctx.vehicles.damage(car, { amount: 50, kind: 'gas', sourceId: 0, x: 0, z: 0 });
    b.ctx.vehicles.damage(car, { amount: 50, kind: 'water', sourceId: 0, x: 0, z: 0 });
    expect(car.health).toBe(60);
  });

  it('un véhicule endommagé perd de la puissance', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const ok = b.spawn('voiture', 0, 0);
    const hurt = b.spawn('voiture', 20, 0);
    b.driver(ok);
    b.driver(hurt);
    b.ctx.vehicles.damage(hurt, { amount: 85, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    ok.cmd.throttle = 1;
    hurt.cmd.throttle = 1;
    b.step(5);
    expect(hurt.speed).toBeGreaterThan(1);
    expect(hurt.speed).toBeLessThan(ok.speed * 0.6);
  });
});

describe('incendie', () => {
  it('un cocktail Molotov embrase une voiture : état « burning », fire:started, moteur coupé', async () => {
    const hz = createFakeHazards();
    const b = await createVehicleBench({ hazards: hz });
    const started = record(b, 'fire:started');
    const states = record(b, 'vehicle:state');
    const v = b.spawn('voiture', 5, 8);
    b.driver(v);
    const thrower = b.person('manifestant', 12, 8);
    expect(v.engineOn).toBe(true);
    b.ctx.vehicles.damage(v, { amount: 30, kind: 'burn', sourceId: thrower.id, x: 5, z: 8 });
    expect(v.state).toBe('burning');
    expect(v.burning).toBeGreaterThan(0);
    expect(v.burning).toBeLessThan(0.2);
    expect(v.engineOn).toBe(false);
    expect(started).toEqual([{ x: 5, z: 8, targetKind: 'vehicle', targetId: v.id, sourceId: thrower.id }]);
    expect(states.map((s) => s.state)).toEqual(['burning']);
    // un blindé ne s'embrase pas pour si peu
    const tank = b.spawn('centaure', 40, 0);
    b.ctx.vehicles.damage(tank, { amount: 30, kind: 'burn', sourceId: thrower.id, x: 40, z: 0 });
    expect(tank.state).toBe('ok');
  });

  it('s\'embrase au-dessus d\'un feu au sol (ctx.hazards.fireAt), après un délai, pas instantanément', async () => {
    const hz = createFakeHazards();
    const b = await createVehicleBench({ hazards: hz });
    const v = b.spawn('voiture', 0, 0);
    const far = b.spawn('voiture', 30, 0);
    hz.fires.push({ x: 0, z: 0.5, radius: 1.5, intensity: 1, sourceId: 77 });
    b.step(5);
    expect(v.state).toBe('ok');
    b.step(12);
    expect(v.state).toBe('burning');
    expect(far.state).toBe('ok');
    // un feu qui s'éteint avant : la voiture refroidit et ne prend pas
    const w = b.spawn('voiture', 60, 0);
    hz.fires.push({ x: 60, z: 0, radius: 1.5, intensity: 1, sourceId: 0 });
    b.step(6);
    hz.fires.length = 0;
    b.step(60);
    expect(w.state).toBe('ok');
  });

  it('brûle progressivement, fume, chauffe le sol, et finit en carcasse calcinée qui reste un obstacle', async () => {
    const hz = createFakeHazards();
    const b = await createVehicleBench({ hazards: hz });
    b.ext.tuning.explosionChance = 0;
    const out = record(b, 'fire:out');
    const v = b.spawn('voiture', 0, 0);
    expect(b.ext.ignite(v, 0)).toBe(true);
    const color = v.color;
    // durées réelles : embrasement complet en 2 à 4 min
    b.step(30);
    expect(v.burning).toBeGreaterThan(0.1);
    expect(v.burning).toBeLessThan(0.4);
    const early = v.burning;
    b.step(30);
    expect(v.burning).toBeGreaterThan(early);
    expect(hz.smokeCalls).toBeGreaterThan(50);
    expect(hz.igniteCalls).toBeGreaterThan(50);
    b.step(200);
    expect(v.burning).toBe(1);
    expect(v.health).toBe(0);
    expect(v.state).toBe('burning');
    // le feu dure 15 à 25 min ; on accélère pour voir la fin
    b.ext.tuning.fireTimeScale = 60;
    b.step(40);
    expect(v.state).toBe('burnt');
    expect(v.burning).toBe(0);
    expect(v.color).not.toBe(color);
    expect(out.length).toBe(1);
    expect(out[0]!.targetId).toBe(v.id);
    expect(out[0]!.byId).toBe(0);
    // la carcasse reste là et barre le passage
    expect(b.ctx.vehicles.get(v.id)).toBe(v);
    const pos: Vec2 = { x: 0.2, z: 0.5 };
    expect(b.ctx.vehicles.resolveCircle(pos, 0.3)).toBe(true);
    expect(Math.abs(pos.x)).toBeGreaterThan(v.def.width / 2);
    // elle ne brûle plus jamais
    expect(b.ext.ignite(v, 0)).toBe(false);
    b.ctx.vehicles.damage(v, { amount: 100, kind: 'burn', sourceId: 0, x: 0, z: 0 });
    expect(v.state).toBe('burnt');
  });

  it('peut exploser : événement « explosion », personnes soufflées, véhicules voisins touchés', async () => {
    const hz = createFakeHazards();
    const b = await createVehicleBench({ hazards: hz });
    b.ext.tuning.explosionChance = 100; // le réservoir explosera à coup sûr
    b.ext.tuning.fireTimeScale = 20;
    const explosions = record(b, 'explosion');
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const sfx = record(b, 'sfx');
    const v = b.spawn('voiture', 0, 0);
    const near = b.person('manifestant', 3, 0);
    const mid = b.person('passant', 6.5, 0);
    const far = b.person('passant', 30, 0);
    const neighbour = b.spawn('citadine', 0, 6.5);
    const culprit = b.person('manifestant', 20, 20);
    b.ext.ignite(v, culprit.id);
    b.step(14);
    expect(explosions.length).toBe(1);
    expect(explosions[0]!.kind).toBe('vehicule');
    expect(explosions[0]!.sourceId).toBe(culprit.id);
    expect(explosions[0]!.radius).toBeGreaterThan(4);
    expect(explosions[0]!.x).toBeCloseTo(0, 5);
    expect(sfx.some((s) => s.id === 'explosion_vehicule')).toBe(true);
    expect(v.burning).toBe(1);
    expect(v.health).toBe(0);
    const blastNear = hurts.find((h) => h.id === near.id && h.info.kind === 'blast');
    const blastMid = hurts.find((h) => h.id === mid.id && h.info.kind === 'blast');
    expect(blastNear).toBeDefined();
    expect(blastMid).toBeDefined();
    expect(blastNear!.info.amount).toBeGreaterThan(blastMid!.info.amount);
    expect(blastNear!.info.knockback).toBeGreaterThan(2);
    expect(blastNear!.info.dirX!).toBeGreaterThan(0.9); // soufflé à l'opposé du véhicule
    expect(hurts.some((h) => h.id === far.id)).toBe(false);
    expect(neighbour.health).toBeLessThan(100);
    // une seule explosion par véhicule
    b.step(20);
    expect(explosions.length).toBe(1);
  });

  it('n\'explose jamais quand la probabilité est nulle', async () => {
    const b = await createVehicleBench({ hazards: createFakeHazards() });
    b.ext.tuning.explosionChance = 0;
    b.ext.tuning.fireTimeScale = 30;
    const explosions = record(b, 'explosion');
    for (let i = 0; i < 8; i++) b.ext.ignite(b.spawn('voiture', i * 30, 0), 0);
    b.step(60);
    expect(explosions.length).toBe(0);
  });

  it('gagne un véhicule garé à moins de 2 m, pas celui garé à 10 m', async () => {
    const b = await createVehicleBench({ hazards: createFakeHazards() });
    b.ext.tuning.explosionChance = 0;
    b.ext.tuning.fireTimeScale = 10;
    const a = b.spawn('voiture', 0, 0);
    const close = b.spawn('voiture', 3.2, 0); // 1,4 m entre les flancs
    const far = b.spawn('voiture', 12, 0);
    b.ext.ignite(a, 0);
    b.step(40);
    expect(a.burning).toBe(1);
    expect(close.state).toBe('burning');
    expect(far.state).toBe('ok');
  });

  it('l\'eau éteint : un début d\'incendie cède à un extincteur, un véhicule embrasé demande un canon à eau', async () => {
    const b = await createVehicleBench({ hazards: createFakeHazards() });
    b.ext.tuning.explosionChance = 0;
    const out = record(b, 'fire:out');
    const douse = (x: number, amount: number): void => b.ctx.events.emitAny(DOUSE_EVENT, { x, z: 0, radius: 1.5, amount });
    // début d'incendie : 15 s d'extincteur (15 unités) suffisent
    const small = b.spawn('voiture', 0, 0);
    b.ext.ignite(small, 0);
    b.step(10);
    expect(small.burning).toBeLessThan(0.15);
    for (let i = 0; i < 15; i++) douse(0, 1);
    expect(small.state).not.toBe('burning');
    expect(small.state).not.toBe('burnt'); // sauvée : abîmée seulement
    expect(out.length).toBe(1);
    expect(out[0]!.targetId).toBe(small.id);
    // véhicule entièrement embrasé : l'extincteur ne suffit plus
    const big = b.spawn('voiture', 40, 0);
    b.ext.ignite(big, 0, 1);
    b.step(1);
    for (let i = 0; i < 15; i++) douse(40, 1);
    expect(big.state).toBe('burning');
    expect(big.burning).toBeGreaterThan(0.7);
    // canon à eau : 3 unités par seconde, de l'ordre de 25 s
    let seconds = 0;
    while (big.state === 'burning' && seconds < 60) {
      douse(40, 3);
      b.step(1);
      seconds++;
    }
    expect(seconds).toBeGreaterThan(15);
    expect(seconds).toBeLessThan(35);
    expect(big.state).toBe('burnt'); // éteinte, mais calcinée
    // l'eau qui tombe ailleurs n'éteint rien
    const other = b.spawn('voiture', 80, 0);
    b.ext.ignite(other, 0, 0.5);
    for (let i = 0; i < 40; i++) douse(120, 3);
    expect(other.state).toBe('burning');
  });

  it('les occupants évacuent un véhicule en feu ; un blessé inconscient y reste et brûle', async () => {
    const b = await createVehicleBench({ hazards: createFakeHazards() });
    b.ext.tuning.explosionChance = 0;
    const exited = record(b, 'vehicle:exited');
    const v = b.spawn('fourgon_crs', 0, 0);
    const driver = b.driver(v);
    const crew = [1, 2, 3].map(() => {
      const p = b.person('crs', 0, 0);
      expect(b.ctx.vehicles.enter(p, v, 'passenger')).toBe(true);
      return p;
    });
    const victim = b.person('crs', 0, 0);
    b.ctx.vehicles.enter(victim, v, 'passenger');
    b.ctx.health.setDown(victim, true);
    b.ext.ignite(v, 0, 0.5);
    b.step(0.3);
    expect(driver.vehicleId).toBe(v.id); // pas instantané
    b.step(4);
    for (const p of [driver, ...crew]) {
      expect(p.vehicleId).toBe(0);
      expect(p.posture).toBe('stand');
      // dehors, hors de l'emprise
      expect(Math.abs(p.x) > v.def.width / 2 || Math.abs(p.z) > v.def.length / 2).toBe(true);
    }
    expect(exited.length).toBe(4);
    expect(victim.vehicleId).toBe(v.id);
    const h = victim.health;
    b.step(10);
    expect(victim.health).toBeLessThan(h);
  });
});

describe('retournement par un groupe', () => {
  it('six personnes couchent une citadine sur le flanc en une dizaine de secondes', async () => {
    const b = await createVehicleBench();
    const flipped: unknown[] = [];
    b.ctx.events.onAny(FLIPPED_EVENT, (e) => flipped.push(e));
    const states = record(b, 'vehicle:state');
    const v = b.spawn('citadine', 0, 0);
    const group = [];
    for (let i = 0; i < 6; i++) group.push(b.person('manifestant', -1.3, -1.5 + i * 0.6));
    for (const p of group) expect(b.ctx.interactions.startVerb(p, 'renverser', v.id)).toBe(true);
    b.step(4);
    expect(b.ext.isFlipped(v)).toBe(false);
    expect(b.ext.flipProgress(v)).toBeGreaterThan(0.3);
    expect(v.roll).toBeGreaterThan(0.1); // la caisse se soulève
    expect(group[0]!.upper).toBe('push');
    let t = 4;
    while (!b.ext.isFlipped(v) && t < 30) {
      b.step(0.5);
      t += 0.5;
    }
    console.log(`citadine retournée par 6 personnes en ${t.toFixed(1)} s`);
    expect(t).toBeGreaterThan(5);
    expect(t).toBeLessThan(14);
    b.step(2);
    expect(v.state).toBe('wrecked');
    expect(v.roll).toBeGreaterThan(1.4); // sur le flanc
    expect(states.some((s) => s.state === 'wrecked')).toBe(true);
    expect(flipped.length).toBe(1);
    // chaque participant répond d'une dégradation
    for (const p of group) expect(p.offenses.some((o) => o.type === 'degradation')).toBe(true);
    expect(group[0]!.upper).not.toBe('push');
    // retournée : ni conduite, ni montée possible
    const someone = b.person('manifestant', 1.5, 0);
    expect(b.ext.canBoard(someone, v)).toBe(false);
  });

  it('deux personnes n\'y arrivent pas ; un fourgon, un blindé ou une voiture occupée ne se retournent pas', async () => {
    const b = await createVehicleBench();
    const v = b.spawn('citadine', 0, 0);
    const two = [b.person('manifestant', -1.3, 0), b.person('manifestant', -1.3, 0.7)];
    for (const p of two) expect(b.ctx.interactions.startVerb(p, 'renverser', v.id)).toBe(true);
    b.step(25);
    expect(b.ext.isFlipped(v)).toBe(false);
    expect(v.state).toBe('ok');
    expect(v.roll).toBeCloseTo(0, 3);

    const van = b.spawn('fourgon_crs', 30, 0);
    const tank = b.spawn('centaure', 60, 0);
    const occupied = b.spawn('citadine', 90, 0);
    b.driver(occupied, 'conducteur');
    for (const target of [van, tank, occupied]) {
      const p = b.person('manifestant', target.x - target.def.width / 2 - 0.5, 0);
      expect(b.ctx.interactions.startVerb(p, 'renverser', target.id)).toBe(false);
    }
    // script de mission : retournement immédiat possible par le service
    expect(b.ext.flip(v)).toBe(true);
    expect(b.ext.isFlipped(v)).toBe(true);
  });
});
