// Pilote automatique sur un petit graphe routier factice : itinéraire, voie, virages, piétons, convoi, stationnement.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameEvents, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { AUTOPILOT_EVENT } from '@/sim/vehicles';
import { createFakeTraffic, createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { FakeTraffic, FakeWorld, VehicleBench } from '@/sim/vehicles/testkit';

const DT = 1 / 30;
const KMH = 1 / 3.6;

/**
 * Petit quartier : un U de trois rues à double sens de 7 m de large, limitées à 30 km/h.
 *   A (0, 0) ── rue 0 ──► B (0, 200) ── rue 1 ──► C (150, 200) ── rue 2 ──► D (150, 0)
 */
function town(): FakeWorld {
  return createFakeWorld({
    nodes: [{ x: 0, z: 0 }, { x: 0, z: 200 }, { x: 150, z: 200 }, { x: 150, z: 0 }],
    edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }],
  });
}

/** Avance jusqu'à ce que la condition soit vraie ; retourne le temps écoulé (s), ou −1 si le délai est dépassé. */
function runUntil(b: VehicleBench, done: () => boolean, limit: number, each?: () => void): number {
  let t = 0;
  while (t < limit) {
    b.step(DT);
    t += DT;
    each?.();
    if (done()) return t;
  }
  return -1;
}

function noHurt(b: VehicleBench): GameEvents['person:hurt'][] {
  const hurts: GameEvents['person:hurt'][] = [];
  b.ctx.events.on('person:hurt', (e) => hurts.push(e));
  return hurts;
}

describe('pilote automatique : conduite jusqu\'à un point', () => {
  it('suit l\'itinéraire par les rues, tient sa voie, ralentit dans les virages et s\'arrête à destination', async () => {
    const world = town();
    const b = await createVehicleBench({ world });
    const states: string[] = [];
    b.ctx.events.onAny(AUTOPILOT_EVENT, (e) => states.push((e as { state: string }).state));
    const v = b.spawn('fourgon_crs', -1.5, 8, 0);
    expect(b.autopilot.status(v).mode).toBe('idle');
    expect(b.autopilot.driveTo(v, 151.5, 40)).toBe(true);
    expect(b.autopilot.isActive(v)).toBe(true);
    expect(v.engineOn).toBe(true); // contact mis par le pilote
    let maxSpeed = 0;
    let laneSum = 0;
    let laneN = 0;
    let cornerSpeed = Infinity;
    let leftBlink = false;
    let maxOff = 0;
    const t = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 240, () => {
      maxSpeed = Math.max(maxSpeed, v.speed);
      // en pleine rue 0 (cap +z) : la droite du sens de marche est du côté des x négatifs
      if (v.z > 60 && v.z < 150 && Math.abs(v.x) < 10) {
        laneSum += v.x;
        laneN++;
      }
      if (Math.hypot(v.x, v.z - 200) < 6) cornerSpeed = Math.min(cornerSpeed, v.speed);
      if (v.z > 170 && v.x < 5 && v.indicator === -1) leftBlink = true;
      // écart à l'axe des rues : jamais sur le trottoir (chaussée de 7 m)
      const off = Math.min(Math.abs(v.x), Math.abs(v.z - 200), Math.abs(v.x - 150));
      maxOff = Math.max(maxOff, off);
    });
    console.log(`fourgon : 510 m en ${t.toFixed(0)} s, pointe ${(maxSpeed / KMH).toFixed(0)} km/h, virage à ${(cornerSpeed / KMH).toFixed(0)} km/h, écart max à l'axe ${maxOff.toFixed(2)} m`);
    expect(t).toBeGreaterThan(60); // 510 m à 30 km/h
    expect(t).toBeLessThan(130);
    expect(Math.hypot(v.x - 151.5, v.z - 40)).toBeLessThan(1.5);
    expect(Math.abs(v.speed)).toBeLessThan(0.2);
    expect(b.autopilot.isActive(v)).toBe(false);
    expect(states[0]).toBe('en_route');
    expect(states[states.length - 1]).toBe('arrive');
    expect(maxSpeed).toBeLessThan(30 * KMH * 1.08); // limite de la voie respectée
    expect(maxSpeed).toBeGreaterThan(30 * KMH * 0.85);
    const lane = laneSum / laneN;
    expect(lane).toBeLessThan(-1.0); // sur sa voie de droite (axe de voie à −1,75 m)
    expect(lane).toBeGreaterThan(-2.6);
    expect(cornerSpeed).toBeLessThan(20 * KMH); // virage à angle droit pris lentement
    expect(cornerSpeed).toBeGreaterThan(5 * KMH);
    expect(leftBlink).toBe(true); // clignotant à gauche avant de tourner vers +x
    expect(maxOff).toBeLessThan(3.4);
    expect(world.pathCalls).toBe(1); // un seul calcul d'itinéraire
    expect(v.health).toBe(100);
    // à l'arrivée : frein serré, plus de clignotant
    expect(v.cmd.brake).toBe(1);
    expect(v.indicator).toBe(0);
    b.step(5);
    expect(Math.hypot(v.x - 151.5, v.z - 40)).toBeLessThan(1.5);
  });

  it('s\'arrête la distance demandée avant la destination ; stop() l\'immobilise et rend la main', async () => {
    const b = await createVehicleBench({ world: town() });
    const v = b.spawn('voiture', -1.5, 5, 0);
    b.autopilot.driveTo(v, 0, 150, { stopBefore: 20 });
    const t = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 90);
    expect(t).toBeGreaterThan(0);
    expect(v.z).toBeGreaterThan(127);
    expect(v.z).toBeLessThan(131.5);
    // nouvel ordre puis arrêt en cours de route
    b.autopilot.driveTo(v, 150, 100);
    b.step(8);
    expect(v.speed).toBeGreaterThan(3);
    b.autopilot.stop(v);
    b.step(6);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    expect(b.autopilot.status(v).state).toBe('repos');
    expect(b.autopilot.isActive(v)).toBe(false);
    const z = v.z;
    b.step(3);
    expect(v.z).toBeCloseTo(z, 3);
  });

  it('refuse un point sans itinéraire et un véhicule hors d\'usage ; s\'interrompt si le véhicule devient une épave', async () => {
    // deux rues sans liaison
    const world = createFakeWorld({
      nodes: [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 500, z: 0 }, { x: 500, z: 100 }],
      edges: [{ a: 0, b: 1 }, { a: 2, b: 3 }],
    });
    const b = await createVehicleBench({ world });
    const v = b.spawn('voiture', 0, 10, 0);
    expect(b.autopilot.driveTo(v, 500, 50)).toBe(false);
    expect(b.autopilot.status(v).state).toBe('echec');
    expect(b.autopilot.status(v).reason).toBe('sans_itineraire');
    expect(b.autopilot.driveTo(b.spawn('drone', 0, 0), 0, 50)).toBe(false);
    expect(b.autopilot.driveTo(v, 0, 90)).toBe(true);
    b.step(4);
    b.ctx.vehicles.damage(v, { amount: 500, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    b.step(1);
    expect(b.autopilot.status(v).state).toBe('echec');
    expect(b.autopilot.status(v).reason).toBe('hors_service');
    expect(b.autopilot.isActive(v)).toBe(false);
    expect(b.autopilot.driveTo(v, 0, 90)).toBe(false);
  });
});

describe('pilote automatique : personnes, véhicules, obstacles', () => {
  it('s\'arrête devant un piéton immobile sur sa voie, klaxonne, puis repart quand la voie est libre', async () => {
    const b = await createVehicleBench({ world: town() });
    const hurts = noHurt(b);
    const sfx: string[] = [];
    b.ctx.events.on('sfx', (e) => sfx.push(e.id));
    const v = b.spawn('voiture', -1.75, 5, 0);
    const walker = b.person('passant', -1.75, 100);
    b.autopilot.driveTo(v, 0, 190);
    let minGap = Infinity;
    const t = runUntil(b, () => b.autopilot.status(v).state === 'attente' && Math.abs(v.speed) < 0.05, 60, () => {
      minGap = Math.min(minGap, walker.z - (v.z + v.def.length / 2));
    });
    expect(t).toBeGreaterThan(5);
    expect(b.autopilot.status(v).reason).toBe('personne');
    const gap = walker.z - (v.z + v.def.length / 2);
    console.log(`arrêt devant le piéton : ${gap.toFixed(2)} m entre le pare-chocs et lui`);
    expect(gap).toBeGreaterThan(1.2);
    expect(gap).toBeLessThan(5);
    expect(minGap).toBeGreaterThan(1.2);
    b.step(8);
    expect(walker.z - (v.z + v.def.length / 2)).toBeCloseTo(gap, 1); // il attend sans avancer
    expect(b.autopilot.status(v).blockedFor).toBeGreaterThan(5);
    expect(sfx).toContain('klaxon');
    expect(hurts.length).toBe(0);
    // le piéton s'écarte : le véhicule repart et arrive
    walker.x = -8;
    const t2 = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 60);
    expect(t2).toBeGreaterThan(0);
    expect(v.z).toBeGreaterThan(185);
    expect(hurts.length).toBe(0);
  });

  it('freine pour un piéton qui traverse devant lui, sans le toucher, et passe', async () => {
    const b = await createVehicleBench({ world: town() });
    const hurts = noHurt(b);
    const v = b.spawn('voiture', -1.75, 5, 0);
    const walker = b.person('passant', -9, 70);
    b.autopilot.driveTo(v, 0, 190);
    let minSpeedNear = Infinity;
    const t = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 90, () => {
      // le piéton se met à traverser quand la voiture approche
      if (v.z > 40 && walker.x < 8) {
        walker.vx = 1.4;
        walker.x += 1.4 * DT;
      } else {
        walker.vx = 0;
      }
      if (v.z > 50 && v.z < 70) minSpeedNear = Math.min(minSpeedNear, v.speed);
    });
    expect(t).toBeGreaterThan(0);
    expect(hurts.length).toBe(0);
    expect(minSpeedNear).toBeLessThan(4); // il a levé le pied, voire s'est arrêté
    expect(walker.x).toBeGreaterThan(7);
  });

  it('s\'arrête derrière un véhicule à l\'arrêt sur sa voie, et devant une barricade (état « bloqué »)', async () => {
    const b = await createVehicleBench({ world: town() });
    const v = b.spawn('voiture', -1.75, 5, 0);
    const stopped = b.spawn('utilitaire', -1.75, 90, 0);
    b.autopilot.driveTo(v, 0, 190);
    const t = runUntil(b, () => b.autopilot.status(v).state === 'bloque', 60);
    expect(t).toBeGreaterThan(0);
    expect(b.autopilot.status(v).reason).toBe('vehicule');
    const gap = stopped.z - stopped.def.length / 2 - (v.z + v.def.length / 2);
    expect(gap).toBeGreaterThan(1);
    expect(gap).toBeLessThan(5);
    expect(v.health).toBe(100);
    expect(stopped.health).toBe(100);

    const w = b.spawn('voiture', 148.25, 195, Math.PI); // rue 2, vers D (cap −z)
    const barricade = b.ctx.props.spawn('barricade', 150, 120, 0);
    b.autopilot.driveTo(w, 150, 20);
    const t2 = runUntil(b, () => b.autopilot.status(w).state === 'bloque', 60);
    expect(t2).toBeGreaterThan(0);
    expect(b.autopilot.status(w).reason).toBe('obstacle');
    expect(w.z - w.def.length / 2).toBeGreaterThan(barricade.z + barricade.halfZ + 0.8);
    expect(w.health).toBe(100);
  });

  it('un Centaure autorisé à pousser ouvre la barricade à la lame et poursuit sa route', async () => {
    const b = await createVehicleBench({ world: town() });
    const v = b.spawn('centaure', -1.75, 8, 0);
    const barricade = b.ctx.props.spawn('barricade', -1.5, 70, 0);
    b.autopilot.driveTo(v, 0, 150, { pushThrough: true, speed: 2 }); // au pas : 7 km/h
    const t = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 120);
    expect(t).toBeGreaterThan(0);
    expect(barricade.blocksMove).toBe(false);
    expect(barricade.state).toBe('broken');
    expect(v.z).toBeGreaterThan(145);
    expect(v.health).toBe(100);
  });

  it('respecte une rue fermée (service de circulation) ; en urgence il la franchit, sirène et feux allumés', async () => {
    let traffic!: FakeTraffic;
    const b = await createVehicleBench({
      world: town(),
      setup: (ctx: GameContext) => {
        traffic = createFakeTraffic();
        ctx.provide(EXT.traffic, traffic);
      },
    });
    const sirens: GameEvents['vehicle:siren'][] = [];
    b.ctx.events.on('vehicle:siren', (e) => sirens.push({ ...e }));
    traffic.closeAt(0, 120);
    const civil = b.spawn('voiture', -1.75, 5, 0);
    b.autopilot.driveTo(civil, 0, 190);
    const t = runUntil(b, () => b.autopilot.status(civil).state === 'bloque', 60);
    expect(t).toBeGreaterThan(0);
    expect(b.autopilot.status(civil).reason).toBe('fermeture');
    expect(civil.z + civil.def.length / 2).toBeLessThan(118);
    expect(civil.z).toBeGreaterThan(105);
    b.ctx.vehicles.remove(civil.id);

    const van = b.spawn('fourgon_crs', -1.75, 5, 0);
    b.autopilot.driveTo(van, 0, 190, { urgence: true });
    b.step(6);
    expect(van.siren).toBe(1);
    expect(van.beacons).toBe(true);
    expect(sirens).toEqual([{ id: van.id, siren: 1 }]);
    let maxSpeed = 0;
    let speedAtClosure = Infinity;
    const t2 = runUntil(b, () => b.autopilot.status(van).state === 'arrive', 60, () => {
      maxSpeed = Math.max(maxSpeed, van.speed);
      if (Math.abs(van.z - 120) < 3) speedAtClosure = Math.min(speedAtClosure, van.speed);
    });
    expect(t2).toBeGreaterThan(0);
    expect(van.z).toBeGreaterThan(185);
    expect(maxSpeed).toBeGreaterThan(40 * KMH); // plus vite que la limite de la voie
    expect(speedAtClosure).toBeLessThan(22 * KMH); // au pas devant le barrage
    b.step(0.1);
    expect(van.siren).toBe(0); // coupée à l'arrivée, les feux restent
    expect(van.beacons).toBe(true);
    expect(sirens[sirens.length - 1]).toEqual({ id: van.id, siren: 0 });
    // la fermeture levée, un véhicule ordinaire passe
    traffic.openAll();
    const car = b.spawn('voiture', -1.75, 5, 0);
    b.autopilot.driveTo(car, 0, 150);
    expect(runUntil(b, () => b.autopilot.status(car).state === 'arrive', 60)).toBeGreaterThan(0);
  });
});

describe('pilote automatique : suivre, convoi, stationnement', () => {
  it('suit à 6 m une personne qui marche, s\'arrête quand elle s\'arrête, sans jamais la toucher', async () => {
    const b = await createVehicleBench({ world: town() });
    const hurts = noHurt(b);
    const leader = b.person('crs', -1.75, 20);
    const v = b.spawn('fourgon_crs', -1.75, 5, 0);
    expect(b.autopilot.follow(v, leader.id, 6)).toBe(true);
    expect(b.autopilot.status(v).leaderId).toBe(leader.id);
    let minGap = Infinity;
    let maxGap = 0;
    for (let i = 0; i < 30 * 60; i++) {
      // la troupe avance au pas pendant 45 s, puis s'arrête
      const walking = i < 30 * 45;
      leader.vz = walking ? 1.4 : 0;
      if (walking) leader.z += 1.4 * DT;
      b.step(DT);
      const gap = leader.z - (v.z + v.def.length / 2);
      if (i > 30 * 15) {
        minGap = Math.min(minGap, gap);
        maxGap = Math.max(maxGap, gap);
      }
    }
    console.log(`suivi d'un piéton : écart entre ${minGap.toFixed(2)} et ${maxGap.toFixed(2)} m pour 6 m demandés`);
    expect(leader.z).toBeGreaterThan(80);
    // l'écart est compté entre le pare-chocs et le corps du meneur (rayon 0,28 m)
    expect(minGap).toBeGreaterThan(5.5);
    expect(maxGap).toBeLessThan(7);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
    expect(b.autopilot.status(v).state).toBe('attente');
    expect(hurts.length).toBe(0);
    // le meneur disparaît : le suivi s'arrête proprement
    b.ctx.people.remove(leader.id);
    b.step(1);
    expect(b.autopilot.status(v).state).toBe('echec');
    expect(b.autopilot.status(v).reason).toBe('meneur_perdu');
  });

  it('convoi : quatre fourgons en colonne arrivent alignés, à intervalles réguliers, sans s\'accrocher', async () => {
    const b = await createVehicleBench({ world: town() });
    const collisions: GameEvents['vehicle:collision'][] = [];
    b.ctx.events.on('vehicle:collision', (e) => collisions.push(e));
    // colonne au départ, sur la voie de droite de la rue 0
    const list: Vehicle[] = [];
    for (let i = 0; i < 4; i++) list.push(b.spawn('fourgon_crs', -1.75, 40 - i * 10, 0));
    expect(b.autopilot.convoy(list, 150, 110, { gap: 6 })).toBe(true);
    let maxGap = 0;
    let minGap = Infinity;
    const t = runUntil(b, () => list.every((v) => b.autopilot.status(v).state === 'arrive'), 240, () => {
      for (let i = 1; i < list.length; i++) {
        const d = Math.hypot(list[i]!.x - list[i - 1]!.x, list[i]!.z - list[i - 1]!.z) - list[i]!.def.length;
        maxGap = Math.max(maxGap, d);
        minGap = Math.min(minGap, d);
      }
    });
    expect(t).toBeGreaterThan(0);
    // tête à destination, sur sa voie ; les autres derrière elle, dans l'ordre, sur la rue 2 (cap −z)
    const head = list[0]!;
    expect(Math.abs(head.z - 110)).toBeLessThan(1);
    expect(head.x - 150).toBeGreaterThan(1.2); // voie de droite en roulant vers −z : côté +x
    expect(head.x - 150).toBeLessThan(2.3);
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      expect(cur.z).toBeGreaterThan(prev.z); // derrière le précédent
      gaps.push(cur.z - prev.z - cur.def.length);
    }
    const xs = list.map((v) => v.x);
    const headings = list.map((v) => Math.abs(Math.atan2(Math.sin(v.heading - Math.PI), Math.cos(v.heading - Math.PI))));
    console.log(`convoi arrivé en ${t.toFixed(0)} s : intervalles ${gaps.map((g) => g.toFixed(2)).join(' / ')} m, écart latéral ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)} m, écart de cap max ${(Math.max(...headings) * 57.3).toFixed(1)}°`);
    for (const g of gaps) {
      expect(g).toBeGreaterThan(5.5); // 6 m demandés
      expect(g).toBeLessThan(6.5);
    }
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.4); // intervalles réguliers
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.4); // alignés sur la même file
    for (const h of headings) expect(h).toBeLessThan(0.05); // tous dans l'axe de la rue
    for (const v of list) {
      expect(Math.abs(v.speed)).toBeLessThan(0.1);
      expect(v.health).toBe(100);
    }
    expect(collisions.length).toBe(0);
    expect(minGap).toBeGreaterThan(1.5); // jamais pare-chocs contre pare-chocs
    expect(maxGap).toBeLessThan(25); // la colonne ne se disloque pas
  });

  it('se gare en bataille : aligné sur l\'axe de la place, à quelques décimètres près, moteur coupé', async () => {
    const b = await createVehicleBench({ world: town() });
    const v = b.spawn('fourgon_crs', -1.75, 5, 0);
    // place perpendiculaire à la rue 0, sur son côté droit (x négatif), l'avant vers l'ouest
    const slot = { x: -9, z: 80, heading: -Math.PI / 2 };
    expect(b.autopilot.park(v, slot.x, slot.z, slot.heading)).toBe(true);
    expect(b.autopilot.status(v).mode).toBe('park');
    const t = runUntil(b, () => b.autopilot.status(v).state === 'arrive', 180);
    const dh = Math.atan2(Math.sin(v.heading - slot.heading), Math.cos(v.heading - slot.heading));
    console.log(`stationnement en bataille en ${t.toFixed(0)} s : écart ${Math.hypot(v.x - slot.x, v.z - slot.z).toFixed(2)} m, cap ${(dh * 57.3).toFixed(1)}°`);
    expect(t).toBeGreaterThan(0);
    expect(Math.hypot(v.x - slot.x, v.z - slot.z)).toBeLessThan(0.5);
    expect(Math.abs(dh)).toBeLessThan(0.08);
    expect(v.engineOn).toBe(false);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    expect(v.health).toBe(100);
  });

  it('stationnement aligné de trois fourgons : même cap, intervalles égaux, sur une même ligne', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() }); // place dégagée, sans rues
    const list: Vehicle[] = [];
    for (let i = 0; i < 3; i++) list.push(b.spawn('fourgon_crs', -30, i * 12, Math.PI / 2));
    // rang face au nord (cap π), centré en (40, 20)
    expect(b.autopilot.parkRow(list, 40, 20, Math.PI, 'bataille')).toBe(true);
    const t = runUntil(b, () => list.every((v) => b.autopilot.status(v).state === 'arrive'), 240);
    expect(t).toBeGreaterThan(0);
    const xs = list.map((v) => v.x).sort((a, c) => a - c);
    const zs = list.map((v) => v.z);
    const hs = list.map((v) => Math.abs(Math.atan2(Math.sin(v.heading - Math.PI), Math.cos(v.heading - Math.PI))));
    console.log(`rang de 3 fourgons garé en ${t.toFixed(0)} s : x = ${xs.map((x) => x.toFixed(2)).join(' / ')}, z = ${zs.map((z) => z.toFixed(2)).join(' / ')}, cap ±${(Math.max(...hs) * 57.3).toFixed(1)}°`);
    const pitch = list[0]!.def.width + 0.9;
    expect(xs[1]! - xs[0]!).toBeGreaterThan(pitch - 0.5);
    expect(xs[1]! - xs[0]!).toBeLessThan(pitch + 0.5);
    expect(xs[2]! - xs[1]!).toBeGreaterThan(pitch - 0.5);
    expect(xs[2]! - xs[1]!).toBeLessThan(pitch + 0.5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.6); // nez sur la même ligne
    for (const h of hs) expect(h).toBeLessThan(0.08);
    for (const v of list) expect(v.health).toBe(100);
  });
});
