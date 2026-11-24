import { describe, expect, it } from 'vitest';
import type { GameContext, Prop, RayHit, Shop, Vehicle, VehicleDef } from '@/core/contracts';
import { createContext, getCore } from '@/core/context';
import { makeRayHit } from '@/core/null-services';
import { DESKTOP_HINTS } from '@/core/settings';
import { genericVehicleDef, plateFor, propDefaults } from '@/core/stores';

function makeCtx(): GameContext {
  return createContext({ headless: true, storage: null, device: DESKTOP_HINTS, seed: 3 });
}

/** Fourgon fictif : 6 m × 2 m, conducteur à gauche, une tourelle. */
function vanDef(): VehicleDef {
  return {
    ...genericVehicleDef('fourgon_crs'),
    name: 'Fourgon',
    faction: 'police',
    length: 6,
    width: 2,
    height: 2.6,
    seats: [
      { role: 'driver', x: -0.5, y: 1, z: 1.5, exitX: -1.8, exitZ: 1.5 },
      { role: 'passenger', x: 0.5, y: 1, z: 1.5, exitX: 1.8, exitZ: 1.5 },
      { role: 'gunner', x: 0, y: 1.6, z: 0, exitX: 1.8, exitZ: 0 },
      { role: 'passenger', x: 0, y: 1, z: -2, exitX: 0, exitZ: -3.8 },
    ],
    turrets: [{ kind: 'lance_grenades', x: 0, y: 2.6, z: 0, yawMin: -3, yawMax: 3, pitchMin: 0, pitchMax: 1, capacity: 3, interval: 1 }],
    color: 0xffffff,
    hasSiren: true,
    hasBeacons: true,
  };
}

describe('magasin des véhicules — définitions et création', () => {
  it('table de définitions vide et extensible', () => {
    const ctx = makeCtx();
    const store = getCore(ctx).stores.vehicles;
    expect(ctx.vehicles.defs).toEqual([]);
    expect(ctx.vehicles.def('fourgon_crs')).toBeUndefined();
    const def = vanDef();
    store.registerDef(def);
    expect(ctx.vehicles.def('fourgon_crs')).toBe(def);
    expect(ctx.vehicles.defs).toEqual([def]);
    // même type : remplacement, pas de doublon
    const def2 = { ...vanDef(), name: 'Fourgon v2' };
    store.registerDefs([def2, { ...genericVehicleDef('moto_bravm'), name: 'Moto' }]);
    expect(ctx.vehicles.defs.length).toBe(2);
    expect(ctx.vehicles.def('fourgon_crs')).toBe(def2);
    expect(ctx.vehicles.def('moto_bravm')!.name).toBe('Moto');
  });

  it('spawn : toutes les valeurs par défaut, définition enregistrée ou gabarit générique', () => {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const events: number[] = [];
    ctx.events.on('vehicle:spawned', (e) => events.push(e.id));
    const v = ctx.vehicles.spawn('fourgon_crs', 10, 20, 0.5);
    expect(events).toEqual([v.id]);
    expect(v.def.name).toBe('Fourgon');
    expect([v.x, v.y, v.z, v.heading]).toEqual([10, 0, 20, 0.5]);
    expect([v.faction, v.color]).toEqual(['police', 0xffffff]);
    expect([v.health, v.state, v.speed, v.burning, v.siren]).toEqual([100, 'ok', 0, 0, 0]);
    expect(v.seats).toEqual([0, 0, 0, 0]);
    expect(v.turretAmmo).toEqual([3]);
    expect(v.turretYaw).toEqual([0]);
    expect(v.turretPitch).toEqual([0]);
    expect(v.cmd).toEqual({ throttle: 0, steer: 0, brake: 0, handbrake: false, horn: false, lift: 0, strafe: 0 });
    expect(v.plate).toMatch(/^[A-Z]{2}-\d{3}-[A-Z]{2}$/);
    expect([v.locked, v.engineOn, v.dormant, v.beacons, v.headlights, v.braking]).toEqual([false, false, false, false, false, false]);
    for (const [k, val] of Object.entries(v)) expect(val, k).not.toBeUndefined();

    const custom = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0, { color: 0x123456, faction: 'civil' });
    expect([custom.color, custom.faction]).toEqual([0x123456, 'civil']);

    // type sans définition : gabarit générique, non ajouté à la table
    const car = ctx.vehicles.spawn('taxi', 0, 0, 0);
    expect(car.kind).toBe('taxi');
    expect(car.def.kind).toBe('taxi');
    expect(car.def.seats.length).toBe(5);
    expect(car.seats.length).toBe(5);
    expect(ctx.vehicles.def('taxi')).toBeUndefined();
    expect(car.def.length).toBeGreaterThan(3);

    expect(plateFor(1)).toBe(plateFor(1));
    expect(plateFor(1)).not.toBe(plateFor(2));
    expect(ctx.vehicles.get(v.id)).toBe(v);
    expect(ctx.vehicles.list.length).toBe(3);
  });
});

describe('magasin des véhicules — sièges', () => {
  function setup(): { ctx: GameContext; v: Vehicle; log: string[] } {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const v = ctx.vehicles.spawn('fourgon_crs', 100, 50, 0);
    const log: string[] = [];
    ctx.events.on('vehicle:entered', (e) => log.push(`in:${e.personId}:${e.seat}`));
    ctx.events.on('vehicle:exited', (e) => log.push(`out:${e.personId}`));
    return { ctx, v, log };
  }

  it('enter : premier siège libre, par rôle ou par index', () => {
    const { ctx, v, log } = setup();
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const c = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const d = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const e = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });

    expect(ctx.vehicles.enter(a, v)).toBe(true); // premier siège libre = conducteur
    expect([a.vehicleId, a.seat, a.posture]).toEqual([v.id, 0, 'seated']);
    expect([a.x, a.z]).toEqual([100, 50]);
    expect(ctx.vehicles.enter(b, v, 'driver')).toBe(false); // place du conducteur prise
    expect(b.vehicleId).toBe(0);
    expect(ctx.vehicles.enter(b, v, 'gunner')).toBe(true);
    expect(b.seat).toBe(2);
    expect(ctx.vehicles.enter(c, v, 2)).toBe(false); // siège occupé
    expect(ctx.vehicles.enter(c, v, 9)).toBe(false); // siège inexistant
    expect(ctx.vehicles.enter(c, v, 3)).toBe(true);
    expect(ctx.vehicles.enter(d, v, 'passenger')).toBe(true);
    expect(d.seat).toBe(1);
    expect(ctx.vehicles.enter(e, v)).toBe(false); // complet
    expect(v.seats).toEqual([a.id, d.id, b.id, c.id]);
    expect(log).toEqual([`in:${a.id}:0`, `in:${b.id}:2`, `in:${c.id}:3`, `in:${d.id}:1`]);
  });

  it('changement de place, et refus de monter dans un second véhicule', () => {
    const { ctx, v } = setup();
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(ctx.vehicles.enter(a, v, 'driver')).toBe(true);
    expect(ctx.vehicles.enter(a, v, 'gunner')).toBe(true); // change de place
    expect(v.seats).toEqual([0, 0, a.id, 0]);
    expect(a.seat).toBe(2);
    expect(ctx.vehicles.enter(a, v, 2)).toBe(true); // déjà à cette place
    expect(ctx.vehicles.enter(a, v, 'gunner')).toBe(true); // déjà à ce poste
    expect(ctx.vehicles.enter(a, v)).toBe(true); // déjà à bord
    expect([a.seat, v.seats.filter((s) => s === a.id).length]).toEqual([2, 1]);
    const other = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0);
    expect(ctx.vehicles.enter(a, other)).toBe(false);
    expect(a.vehicleId).toBe(v.id);
  });

  it('exit : la personne est déposée au point de sortie du siège (x à droite, z vers l\'avant)', () => {
    const { ctx, v, log } = setup();
    const driver = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const mate = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    ctx.vehicles.enter(driver, v, 0);
    ctx.vehicles.enter(mate, v, 1);
    // cap 0 = le fourgon regarde vers +z (sud) ; sa droite est à l'ouest (−x), sa gauche à l'est (+x)
    expect(ctx.vehicles.exit(driver)).toBe(true);
    expect([driver.vehicleId, driver.seat, driver.posture]).toEqual([0, -1, 'stand']);
    expect(driver.x).toBeCloseTo(100 + 1.8, 9); // conducteur à gauche → sort côté est
    expect(driver.z).toBeCloseTo(50 + 1.5, 9);
    expect(ctx.vehicles.exit(mate)).toBe(true);
    expect(mate.x).toBeCloseTo(100 - 1.8, 9);
    expect(v.seats).toEqual([0, 0, 0, 0]);
    expect(ctx.vehicles.exit(mate)).toBe(false); // déjà à pied
    expect(log.slice(-2)).toEqual([`out:${driver.id}`, `out:${mate.id}`]);

    // véhicule tourné vers l'est : l'avant est +x, la gauche est le nord (−z)
    v.heading = Math.PI / 2;
    ctx.vehicles.enter(driver, v, 0);
    ctx.vehicles.exit(driver);
    expect(driver.x).toBeCloseTo(100 + 1.5, 9);
    expect(driver.z).toBeCloseTo(50 - 1.8, 9);
  });

  it('retirer un véhicule fait descendre ses occupants', () => {
    const { ctx, v } = setup();
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    ctx.vehicles.enter(a, v, 'driver');
    const removed: number[] = [];
    ctx.events.on('vehicle:removed', (e) => removed.push(e.id));
    ctx.vehicles.remove(v.id);
    expect(removed).toEqual([v.id]);
    expect([a.vehicleId, a.seat, a.posture]).toEqual([0, -1, 'stand']);
    expect(ctx.vehicles.get(v.id)).toBeUndefined();
    expect(ctx.vehicles.enter(a, v)).toBe(false); // véhicule disparu
    const w = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0);
    ctx.vehicles.enter(a, w);
    ctx.vehicles.clear();
    expect(a.vehicleId).toBe(0);
    expect(ctx.vehicles.list.length).toBe(0);
    expect(removed.length).toBe(2);
  });
});

describe('magasin des véhicules — dégâts, tourelle, géométrie', () => {
  it('damage fait évoluer l\'état et émet vehicle:state', () => {
    const ctx = makeCtx();
    const v = ctx.vehicles.spawn('voiture', 0, 0, 0);
    const states: string[] = [];
    ctx.events.on('vehicle:state', (e) => states.push(e.state));
    const hit = (amount: number) => ctx.vehicles.damage(v, { amount, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    hit(30);
    expect([v.health, v.state]).toEqual([70, 'ok']);
    hit(30);
    expect([v.health, v.state]).toEqual([40, 'damaged']);
    hit(0);
    hit(-5);
    expect(v.health).toBe(40);
    hit(500);
    expect([v.health, v.state]).toEqual([0, 'wrecked']);
    expect(states).toEqual(['damaged', 'wrecked']);
  });

  it('fireTurret décompte les munitions', () => {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const v = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0);
    let fired = 0;
    ctx.events.on('vehicle:turret_fired', () => fired++);
    expect(ctx.vehicles.fireTurret(v, 1, 7)).toBe(false); // tourelle inexistante
    expect(ctx.vehicles.fireTurret(v, 0, 7)).toBe(true);
    expect(ctx.vehicles.fireTurret(v, 0, 7)).toBe(true);
    expect(ctx.vehicles.fireTurret(v, 0, 7)).toBe(true);
    expect(ctx.vehicles.fireTurret(v, 0, 7)).toBe(false); // vide
    expect(v.turretAmmo).toEqual([0]);
    expect(fired).toBe(3);
  });

  it('queryRadius retient les véhicules dont l\'emprise touche le disque', () => {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const v = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0); // 2 m de large (x), 6 m de long (z)
    const far = ctx.vehicles.spawn('fourgon_crs', 100, 0, 0);
    const out: Vehicle[] = [];
    expect(ctx.vehicles.queryRadius(0, 5, 2.1, out)).toBe(1); // pare-chocs à 3 m du centre
    expect(out[0]).toBe(v);
    expect(ctx.vehicles.queryRadius(0, 5, 1.9, out)).toBe(0);
    expect(out.length).toBe(0);
    expect(ctx.vehicles.queryRadius(3, 0, 1.9, out)).toBe(0); // flanc à 1 m du centre
    expect(ctx.vehicles.queryRadius(3, 0, 2.1, out)).toBe(1);
    expect(ctx.vehicles.queryRadius(50, 0, 60, out)).toBe(2);
    far.dormant = true;
    expect(ctx.vehicles.queryRadius(50, 0, 60, out)).toBe(1);
  });

  it('resolveCircle repousse un disque hors de la carrosserie, selon le cap', () => {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const v = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0);
    const pos = { x: 1.2, z: 0 };
    expect(ctx.vehicles.resolveCircle(pos, 0.3)).toBe(true);
    expect(pos.x).toBeCloseTo(1.3, 9); // flanc à x = 1, rayon 0,3
    expect(pos.z).toBeCloseTo(0, 9);
    expect(ctx.vehicles.resolveCircle(pos, 0.3)).toBe(false); // désormais tangent
    const clear = { x: 1.2, z: 5 };
    expect(ctx.vehicles.resolveCircle(clear, 0.3)).toBe(false);
    expect(clear).toEqual({ x: 1.2, z: 5 });

    // tourné d'un quart de tour, le fourgon s'étend le long de x
    v.heading = Math.PI / 2;
    const p2 = { x: 2.5, z: 1.1 };
    expect(ctx.vehicles.resolveCircle(p2, 0.3)).toBe(true);
    expect(p2.x).toBeCloseTo(2.5, 9);
    expect(p2.z).toBeCloseTo(1.3, 9);
    // ignoreId et engins volants
    const p3 = { x: 0, z: 0.5 };
    expect(ctx.vehicles.resolveCircle(p3, 0.3, v.id)).toBe(false);
    const drone = ctx.vehicles.spawn('drone', 40, 40, 0);
    drone.def = { ...drone.def, flying: true };
    expect(ctx.vehicles.resolveCircle({ x: 40, z: 40 }, 0.3)).toBe(false);
  });

  it('raycast touche la carrosserie la plus proche', () => {
    const ctx = makeCtx();
    getCore(ctx).stores.vehicles.registerDef(vanDef());
    const near = ctx.vehicles.spawn('fourgon_crs', 10, 0, 0);
    const behind = ctx.vehicles.spawn('fourgon_crs', 20, 0, 0);
    const hit: RayHit = makeRayHit();
    expect(ctx.vehicles.raycast(0, 0, 30, 0, hit)).toBe(true);
    expect(hit.hit).toBe(true);
    expect(hit.kind).toBe('vehicle');
    expect(hit.id).toBe(near.id);
    expect(hit.x).toBeCloseTo(9, 9);
    expect(hit.z).toBeCloseTo(0, 9);
    expect(hit.t).toBeCloseTo(0.3, 9);
    expect([hit.nx, hit.nz].map((n) => Math.round(n))).toEqual([-1, 0]);
    expect(hit.height).toBe(2.6);
    near.dormant = true;
    expect(ctx.vehicles.raycast(0, 0, 30, 0, hit)).toBe(true);
    expect(hit.id).toBe(behind.id);
    expect(ctx.vehicles.raycast(0, 10, 30, 10, hit)).toBe(false);
    expect([hit.hit, hit.kind, hit.id, hit.t, hit.x, hit.z]).toEqual([false, 'none', 0, 1, 30, 10]);
  });
});

describe('magasin du décor — objets', () => {
  it('spawn : gabarit par type, toutes les valeurs définies', () => {
    const ctx = makeCtx();
    const bin = ctx.props.spawn('poubelle', 5, 6, 0.4);
    for (const [k, val] of Object.entries(bin)) expect(val, k).not.toBeUndefined();
    expect([bin.x, bin.y, bin.z, bin.heading]).toEqual([5, 0, 6, 0.4]);
    expect([bin.state, bin.burning, bin.toppled, bin.tags, bin.carriedBy, bin.vx, bin.vz, bin.dormant]).toEqual(['intact', 0, false, 0, 0, 0, 0, false]);
    expect(bin.movable).toBe(true);
    expect(bin.hp).toBe(propDefaults('poubelle').hp);
    const vauban = ctx.props.spawn('barriere_vauban', 0, 0, 0);
    expect(vauban.halfX).toBeCloseTo(1.25, 9); // 2,5 m de long
    expect(vauban.height).toBeCloseTo(1.1, 9);
    const lamp = ctx.props.spawn('candelabre', 0, 0, 0);
    expect([lamp.movable, lamp.blocksMove]).toEqual([false, true]);
    const unknown = ctx.props.spawn('objet_inconnu', 0, 0, 0);
    expect(unknown.halfX).toBeGreaterThan(0);
    expect(ctx.props.get(bin.id)).toBe(bin);
    expect(ctx.props.list.length).toBe(4);
    ctx.props.remove(bin.id);
    ctx.props.remove(bin.id);
    expect(ctx.props.get(bin.id)).toBeUndefined();
    expect(ctx.props.list.length).toBe(3);
  });

  it('queryRadius : emprise orientée, filtre, objets endormis', () => {
    const ctx = makeCtx();
    const a = ctx.props.spawn('barriere_vauban', 0, 0, 0); // s'étend de x = −1,25 à +1,25
    const b = ctx.props.spawn('poubelle', 10, 0, 0);
    for (let i = 0; i < 60; i++) ctx.props.spawn('potelet', 200 + i * 3, 200, 0); // remplissage éloigné
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(2, 0, 0.8, out)).toBe(1); // l'extrémité de la barrière est à 0,75 m
    expect(out[0]).toBe(a);
    expect(ctx.props.queryRadius(2, 0, 0.7, out)).toBe(0);
    expect(ctx.props.queryRadius(0, 1, 0.7, out)).toBe(0); // 0,8 m du bord (demi-profondeur 0,2)
    expect(ctx.props.queryRadius(0, 1, 0.9, out)).toBe(1);
    expect(ctx.props.queryRadius(5, 0, 6, out)).toBe(2);
    expect(ctx.props.queryRadius(5, 0, 6, out, (p) => p.kind === 'poubelle')).toBe(1);
    expect(out[0]).toBe(b);
    a.dormant = true;
    expect(ctx.props.queryRadius(5, 0, 6, out)).toBe(1);
    // tournée d'un quart de tour, la barrière s'étend le long de z
    a.dormant = false;
    a.heading = Math.PI / 2;
    expect(ctx.props.queryRadius(0, 2, 0.8, out)).toBe(1);
    expect(ctx.props.queryRadius(2, 0, 0.8, out)).toBe(0);
  });

  it('l\'index suit les objets déplacés (rebuildIndex, ou au pas de simulation suivant)', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    for (let i = 0; i < 80; i++) ctx.props.spawn('potelet', -500 - i * 3, 0, 0);
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(0, 0, 1, out)).toBe(1);
    bin.x = 300;
    bin.z = 300;
    core.stores.props.rebuildIndex();
    expect(ctx.props.queryRadius(300, 300, 1, out)).toBe(1);
    expect(ctx.props.queryRadius(0, 0, 1, out)).toBe(0);
    bin.x = -40;
    core.clock.advance(1 / 30); // nouveau pas : ré-indexation automatique à la première requête
    expect(ctx.props.queryRadius(-40, 300, 1, out)).toBe(1);
  });

  it('resolveCircle : objets bloquants seulement', () => {
    const ctx = makeCtx();
    const barrier = ctx.props.spawn('barriere_vauban', 0, 0, 0);
    const pos = { x: 0.5, z: 0.35 };
    expect(ctx.props.resolveCircle(pos, 0.28)).toBe(true);
    expect(pos.x).toBeCloseTo(0.5, 9);
    expect(pos.z).toBeCloseTo(0.48, 9); // demi-profondeur 0,2 + rayon 0,28
    expect(ctx.props.resolveCircle(pos, 0.28)).toBe(false);
    barrier.carriedBy = 12; // portée : ne bloque plus
    expect(ctx.props.resolveCircle({ x: 0.5, z: 0.1 }, 0.28)).toBe(false);
    barrier.carriedBy = 0;
    barrier.blocksMove = false;
    expect(ctx.props.resolveCircle({ x: 0.5, z: 0.1 }, 0.28)).toBe(false);
    const cone = ctx.props.spawn('cone', 20, 20, 0); // non bloquant par défaut
    expect(cone.blocksMove).toBe(false);
    expect(ctx.props.resolveCircle({ x: 20, z: 20 }, 0.28)).toBe(false);
  });

  it('raycast : obstacle le plus proche, normale, hauteur', () => {
    const ctx = makeCtx();
    const kiosk = ctx.props.spawn('kiosque', 10, 0, 0); // halfX 1,5 ; halfZ 1,1 ; hauteur 3,5
    const bin = ctx.props.spawn('poubelle', 5, 0, 0); // halfX 0,22
    const hit = makeRayHit();
    expect(ctx.props.raycast(0, 0, 20, 0, hit)).toBe(true);
    expect([hit.kind, hit.id]).toEqual(['prop', bin.id]);
    expect(hit.x).toBeCloseTo(5 - 0.22, 9);
    expect(hit.height).toBe(1.0);
    expect(Math.round(hit.nx)).toBe(-1);
    ctx.props.remove(bin.id);
    expect(ctx.props.raycast(0, 0, 20, 0, hit)).toBe(true);
    expect(hit.id).toBe(kiosk.id);
    expect(hit.x).toBeCloseTo(8.5, 9);
    expect(hit.t).toBeCloseTo(0.425, 9);
    expect(hit.height).toBe(3.5);
    expect(ctx.props.raycast(0, 5, 20, 5, hit)).toBe(false);
    expect([hit.hit, hit.kind, hit.t]).toEqual([false, 'none', 1]);
    // un objet ni bloquant ni opaque est ignoré
    kiosk.blocksMove = false;
    kiosk.blocksSight = false;
    expect(ctx.props.raycast(0, 0, 20, 0, hit)).toBe(false);
  });

  it('damage, push (intégré par update), tag', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const bin = ctx.props.spawn('poubelle', 0, 0, 0); // 20 PV
    const states: string[] = [];
    ctx.events.on('prop:damaged', (e) => states.push(e.state));
    ctx.props.damage(bin, 5, 'blunt', 1);
    expect([bin.hp, bin.state]).toEqual([15, 'intact']);
    ctx.props.damage(bin, 6, 'blunt', 1);
    expect([bin.hp, bin.state]).toEqual([9, 'damaged']);
    ctx.props.damage(bin, 100, 'blunt', 1);
    expect([bin.hp, bin.state]).toEqual([0, 'broken']);
    expect(states).toEqual(['damaged', 'broken']);

    let moved = 0;
    ctx.events.on('prop:moved', () => moved++);
    ctx.props.push(bin, 3, 0, 3, 1); // 3 m/s vers l'est
    expect(moved).toBe(1);
    expect(bin.vx).toBeCloseTo(3, 9);
    for (let i = 0; i < 60; i++) core.stores.props.update(1 / 30);
    expect([bin.vx, bin.vz]).toEqual([0, 0]);
    expect(bin.x).toBeCloseTo((3 * 3) / (2 * 6), 6); // v² / (2·frottement)
    expect(bin.z).toBeCloseTo(0, 9);
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(bin.x, 0, 0.1, out)).toBe(1);

    // un objet qui glisse s'arrête contre le décor statique
    const wallX = 2;
    ctx.world = {
      ...ctx.world,
      resolveCircle: (pos, radius) => {
        if (pos.x + radius <= wallX) return false;
        pos.x = wallX - radius;
        return true;
      },
    };
    const cart = ctx.props.spawn('conteneur', 0, 5, 0);
    ctx.props.push(cart, 1, 0, 8, 1); // de quoi glisser sur plus de 5 m sans obstacle
    for (let i = 0; i < 90; i++) core.stores.props.update(1 / 30);
    expect(cart.x).toBeLessThanOrEqual(wallX);
    expect(cart.x).toBeGreaterThan(1);
    expect([cart.vx, cart.vz]).toEqual([0, 0]);

    const lamp = ctx.props.spawn('candelabre', 9, 9, 0);
    ctx.props.push(lamp, 1, 0, 5, 1); // fixe : sans effet
    expect([lamp.vx, moved]).toEqual([0, 2]);

    ctx.props.tag(bin, 1);
    ctx.props.tag(bin, 1);
    expect(bin.tags).toBe(2);
  });
});

describe('magasin du décor — vitrines', () => {
  function setup(): { ctx: GameContext; shop: Shop; events: string[] } {
    const ctx = makeCtx();
    const store = getCore(ctx).stores.props;
    // vitrine de 6 m sur une façade dont la normale regarde le sud (cap 0) : elle s'étend le long de x
    const shop = store.addShop({ category: 'bijouterie', x: 0, z: 0, heading: 0, width: 6 });
    const events: string[] = [];
    ctx.events.on('shop:window', (e) => events.push('vitre:' + e.state));
    ctx.events.on('shop:looted', (e) => events.push('pillage:' + e.amount.toFixed(2)));
    return { ctx, shop, events };
  }

  it('addShop, shop(id), shopsNear, removeShop', () => {
    const { ctx, shop } = setup();
    const store = getCore(ctx).stores.props;
    expect(shop.name).toBe('Bijouterie'); // libellé générique, aucune marque
    expect([shop.window, shop.shutter, shop.stock, shop.burning, shop.occupants]).toEqual(['intact', 0, 1, 0, 0]);
    expect(shop.appeal).toBeGreaterThan(0.5);
    expect(ctx.props.shop(shop.id)).toBe(shop);
    expect(ctx.props.shops).toEqual([shop]);
    const out: Shop[] = [];
    expect(ctx.props.shopsNear(4, 0, 1.1, out)).toBe(1); // le bord de la vitrine est à x = 3
    expect(ctx.props.shopsNear(4, 0, 0.9, out)).toBe(0);
    expect(ctx.props.shopsNear(0, 2, 1.9, out)).toBe(0);
    expect(ctx.props.shopsNear(0, 2, 2.1, out)).toBe(1);
    const named = store.addShop({ category: 'cafe_restaurant', x: 50, z: 0, heading: Math.PI / 2, width: 8, name: 'Le Zinc bleu' });
    expect(named.name).toBe('Le Zinc bleu');
    // normale vers l'est : la vitrine s'étend le long de z
    expect(ctx.props.shopsNear(50, 5, 1.1, out)).toBe(1);
    expect(ctx.props.shopsNear(55, 0, 1.1, out)).toBe(0);
    store.removeShop(shop.id);
    expect(ctx.props.shop(shop.id)).toBeUndefined();
    expect(ctx.props.shops).toEqual([named]);
  });

  it('damageShop, tag et loot', () => {
    const { ctx, shop, events } = setup();
    expect(ctx.props.loot(shop, 5)).toBe(0); // vitrine intacte : rien à prendre
    ctx.props.tag(shop, 5);
    expect(shop.window).toBe('tagged');
    ctx.props.damageShop(shop, 4, 'impact', 5); // trop faible
    expect(shop.window).toBe('tagged');
    ctx.props.damageShop(shop, 12, 'impact', 5);
    expect(shop.window).toBe('cracked');
    ctx.props.damageShop(shop, 12, 'impact', 5);
    expect(shop.window).toBe('broken');
    const got = ctx.props.loot(shop, 5);
    expect(got).toBeCloseTo(0.05, 9);
    expect(shop.stock).toBeCloseTo(0.95, 9);
    shop.shutter = 1; // rideau baissé
    expect(ctx.props.loot(shop, 5)).toBe(0);
    shop.shutter = 0;
    let total = got;
    for (let i = 0; i < 100; i++) total += ctx.props.loot(shop, 5);
    expect(total).toBeCloseTo(1, 9);
    expect(shop.stock).toBe(0);
    expect(ctx.props.loot(shop, 5)).toBe(0);
    expect(events.slice(0, 4)).toEqual(['vitre:tagged', 'vitre:cracked', 'vitre:broken', 'pillage:0.05']);

    const { ctx: c2, shop: s2 } = setup();
    c2.props.damageShop(s2, 40, 'impact', 1); // choc violent : brisée d'un coup
    expect(s2.window).toBe('broken');
    const { ctx: c3, shop: s3 } = setup();
    s3.shutter = 1;
    c3.props.damageShop(s3, 40, 'impact', 1); // protégée par le rideau de fer
    expect(s3.window).toBe('intact');
  });

  it('clear vide objets et vitrines', () => {
    const { ctx } = setup();
    ctx.props.spawn('banc', 0, 0, 0);
    ctx.props.clear();
    expect(ctx.props.list.length).toBe(0);
    expect(ctx.props.shops.length).toBe(0);
    const out: Prop[] = [];
    const shops: Shop[] = [];
    expect(ctx.props.queryRadius(0, 0, 100, out)).toBe(0);
    expect(ctx.props.shopsNear(0, 0, 100, shops)).toBe(0);
    expect(ctx.props.raycast(-5, 0, 5, 0, makeRayHit())).toBe(false);
  });
});
