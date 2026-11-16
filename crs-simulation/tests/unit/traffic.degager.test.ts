// Circulation — un véhicule civil arrêté devant le véhicule de police du joueur n'est jamais une impasse : deux-tons
// allumé derrière lui (même à l'arrêt), il dégage activement la voie (il repart, recule, ou se serre sur le trottoir),
// autobus compris.
import { describe, expect, it } from 'vitest';
import type { InteractionOption, Vehicle } from '@/core/contracts';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import { EnginsSystem } from '@/gameplay/session/engins';
import type { AutopilotApi } from '@/sim/vehicles/api';
import type { TrafficBench } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

/**
 * Reste-t-il, sur la chaussée de la rue est-ouest (axe z = axisZ, demi-largeur half), un couloir d'au moins `need` m
 * libre de tout véhicule entre x = from et x = to (le véhicule `me` excepté) ?
 */
export function corridorFree(b: TrafficBench, me: Vehicle, from: number, to: number, axisZ = 120, half = 4, need = 3): boolean {
  const spans: [number, number][] = [];
  for (const o of b.ctx.vehicles.list) {
    if (o === me) continue;
    const halfX = Math.abs(Math.sin(o.heading)) * o.def.length * 0.5 + Math.abs(Math.cos(o.heading)) * o.def.width * 0.5;
    const halfZ = Math.abs(Math.cos(o.heading)) * o.def.length * 0.5 + Math.abs(Math.sin(o.heading)) * o.def.width * 0.5;
    if (o.x + halfX < from || o.x - halfX > to) continue;
    spans.push([o.z - halfZ, o.z + halfZ]);
  }
  spans.sort((a, c) => a[0] - c[0]);
  let edge = axisZ - half;
  for (const [a, c] of spans) {
    if (a - edge >= need) return true;
    edge = Math.max(edge, c);
  }
  return axisZ + half - edge >= need;
}

/** Rue est-ouest de 5 m (deux voies étroites) : une foule immobile en travers, un autobus arrêté derrière elle. */
async function scene(seed = 3, engins = false): Promise<{ b: TrafficBench; bus: Vehicle; crowd: ReturnType<TrafficBench['ctx']['people']['spawn']>[] }> {
  const town = createTown({ width: 5, sidewalk: 3 });
  const modules = engins ? [vehicles, people, () => [new EnginsSystem()]] : [vehicles, people];
  const b = await createTrafficBench({ seed, world: town, modules, session: { x: town.centerX, z: town.centerZ } });
  const ctx = b.ctx;
  const crowd = [];
  for (let i = 0; i < 9; i++) crowd.push(ctx.people.spawn({ kind: 'manifestant', x: 95 + (i % 3) * 1.2, z: 118 + Math.floor(i / 3) * 1.8 + (i % 2) * 0.4 }));
  const bus = b.api.spawnVehicle('bus', 50, 121.2, EAST, 380, 120)!;
  expect(bus).not.toBeNull();
  b.step(12);
  expect(Math.abs(bus.speed)).toBeLessThan(0.5); // arrêté derrière la foule
  return { b, bus, crowd };
}

describe('circulation : véhicule qui bloque la voie du joueur', () => {
  it('deux-tons allumé à l\'arrêt derrière un autobus arrêté (foule devant lui) : l\'autobus dégage la voie, sans toucher personne, puis repart', async () => {
    const { b, bus, crowd } = await scene();
    const ctx = b.ctx;
    // la voiture du joueur arrive derrière lui et s'arrête
    const car = ctx.vehicles.spawn('voiture_police', bus.x - 16, 120.5, EAST);
    const me = ctx.people.spawn({ kind: 'crs', x: car.x, z: car.z });
    ctx.player.possess(me.id, 'crs');
    expect(ctx.vehicles.enter(me, car, 'driver')).toBe(true);
    b.step(2);
    expect(corridorFree(b, car, car.x, car.x + 30, 120, 2.5)).toBe(false);
    expect(b.api.blockerAhead(car)).toBe(bus);
    let hits = 0;
    ctx.events.on('vehicle:collision', () => hits++);
    let hurt = 0;
    ctx.events.on('person:hurt', () => hurt++);
    car.siren = 1;
    car.beacons = true;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const t = runUntil(b, () => corridorFree(b, car, car.x, car.x + 30, 120, 2.5), 45, () => {
      minZ = Math.min(minZ, bus.z);
      maxZ = Math.max(maxZ, bus.z);
    });
    console.log(`autobus : voie libre en ${t.toFixed(1)} s ; autobus en (${bus.x.toFixed(1)}, ${bus.z.toFixed(1)}) cap ${bus.heading.toFixed(2)}`);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(30);
    expect(b.api.motorist(bus)!.mode).toBe('range');
    // il finit sa manœuvre, sans quitter la rue (façades à 5,5 m de l'axe) ni heurter la voiture du joueur
    b.step(15);
    expect(bus.z + bus.def.width / 2).toBeLessThan(125.4);
    expect(minZ).toBeGreaterThan(119.5);
    expect(hits).toBe(0);
    expect(hurt).toBe(0);
    expect(corridorFree(b, car, car.x, car.x + 30, 120, 2.5)).toBe(true);
    // le joueur passe ; la foule tient toujours la rue : l'autobus reste rangé
    car.siren = 0;
    car.x = bus.x + 12;
    b.step(20);
    expect(b.api.motorist(bus)!.mode).toBe('range');
    // la foule s'en va : il repart
    for (const p of crowd) ctx.people.remove(p.id);
    car.x = 300;
    const tGo = runUntil(b, () => b.api.motorist(bus)?.mode === 'route' && Math.abs(bus.speed) > 1, 40);
    expect(tGo).toBeGreaterThan(0);
  }, 120000);

  it('« Faire circuler ce véhicule » (touche d\'interaction, à pied) : l\'autobus libère la chaussée ; sans conducteur, l\'option dit qu\'il faut le Centaure', async () => {
    const { b, bus } = await scene(5);
    const ctx = b.ctx;
    const van = ctx.vehicles.spawn('fourgon_crs', bus.x - 18, 120.4, EAST);
    const me = ctx.people.spawn({ kind: 'crs', x: bus.x - 4, z: 119.4 });
    ctx.player.possess(me.id, 'crs');
    const opts: InteractionOption[] = [];
    ctx.interactions.options(me, opts);
    const opt = opts.find((o) => o.verb === 'faire_circuler');
    expect(opt).toBeDefined();
    expect(opt!.label).toContain('Faire circuler ce véhicule');
    expect(opt!.targetId).toBe(bus.id);
    expect(opts[0]!.verb).toBe('faire_circuler'); // c'est l'option proposée en premier
    expect(ctx.interactions.start(me, opt!)).toBe(true);
    b.step(1);
    me.x = bus.x - 10;
    me.z = 117.8;
    const t = runUntil(b, () => corridorFree(b, van, van.x, van.x + 30, 120, 2.5), 45);
    console.log(`faire circuler : voie libre en ${t.toFixed(1)} s`);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(30);
    // une voiture garée le long du trottoir ne barre rien : pas d'invite
    const curb = b.api.spawnParked('voiture', 165, 122.8, EAST);
    me.x = 165;
    me.z = 120.5;
    opts.length = 0;
    ctx.interactions.options(me, opts);
    expect(opts.find((o) => o.verb === 'faire_circuler' && o.targetId === curb.id)).toBeUndefined();
    // un véhicule sans personne au volant, en travers de la chaussée : l'option dit qu'il faut le Centaure
    const parked = b.api.spawnParked('voiture', 200, 120.3, EAST);
    me.x = 200;
    me.z = 118.2;
    opts.length = 0;
    ctx.interactions.options(me, opts);
    const o2 = opts.find((o) => o.verb === 'faire_circuler' && o.targetId === parked.id);
    expect(o2).toBeDefined();
    expect(o2!.label).toContain('Centaure');
    expect(b.api.clearOff(parked, me.id)).toBe('sans_conducteur');
  }, 120000);

  it('colonne de police au pilote automatique, joueur passager, sans deux-tons : arrêtée derrière l\'autobus, elle le fait dégager et passe', async () => {
    const { b, bus } = await scene(7, true);
    const ctx = b.ctx;
    const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
    const van = ctx.vehicles.spawn('fourgon_crs', bus.x - 30, 120.6, EAST);
    const driver = ctx.people.spawn({ kind: 'crs', faction: 'police', x: van.x, z: van.z });
    expect(ctx.vehicles.enter(driver, van, 'driver')).toBe(true);
    const me = ctx.people.spawn({ kind: 'crs', faction: 'police', x: van.x, z: van.z });
    ctx.player.possess(me.id, 'crs');
    expect(ctx.vehicles.enter(me, van, 'passenger')).toBe(true);
    b.step(0.5);
    expect(ap.driveTo(van, 300, 120)).toBe(true);
    const x0 = bus.x;
    const t = runUntil(b, () => van.x > x0 + 1, 90);
    console.log(`colonne : fourgon à la hauteur de l'autobus en ${t.toFixed(1)} s ; autobus ${b.api.motorist(bus)?.mode} en (${bus.x.toFixed(1)}, ${bus.z.toFixed(1)}) ; fourgon en (${van.x.toFixed(1)}, ${van.z.toFixed(1)})`);
    expect(t).toBeGreaterThan(0);
    expect(van.siren).toBe(0);
  }, 120000);
});
