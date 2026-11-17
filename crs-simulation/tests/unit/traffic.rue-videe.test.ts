// Circulation — rue fermée vidée de ses voitures : « quand je coupe la circulation, s'il reste des voitures dans la rue
// devant, elles disparaissent ; c'est seulement à partir de la barrière bloquée ».
// Quartier : quadrillage de 3 × 3 carrefours tous les 120 m, immeubles au cœur des îlots (on ne voit une rue que
// depuis son axe). Rue fermée : Rue Est-Ouest 1 (z = 120), barrage à x = 160, face à l'est (vers x = 240).
import { describe, expect, it } from 'vitest';
import type { GameContext, Vehicle } from '@/core/contracts';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { TrafficBench } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const BX = 160;

/** Service des barrages de police réduit à ce que la circulation en lit : l'unité qui tient le barrage, son cap. */
function barrages(ctx: GameContext, list: { squadId: number; x: number; z: number; heading: number }[]): void {
  ctx.provide('police.barrages', { list, kettles: [], exitsAround: () => [] });
}

interface Watch {
  removed: { id: number; x: number; z: number; visible: boolean }[];
}

function watch(b: TrafficBench): Watch {
  const w: Watch = { removed: [] };
  const pos = new Map<number, Vehicle>();
  b.ctx.events.on('vehicle:spawned', (e) => {
    const v = b.ctx.vehicles.get(e.id);
    if (v) pos.set(v.id, v);
  });
  b.ctx.events.on('vehicle:removed', (e) => {
    const v = pos.get(e.id);
    if (v) w.removed.push({ id: v.id, x: v.x, z: v.z, visible: b.sys.kernel.visible(v.x, v.z) });
  });
  return w;
}

/** Automobiliste d'ambiance (libre de changer de destination, comme la circulation ordinaire). */
function car(b: TrafficBench, x: number, z: number, heading: number, dx: number, dz: number, kind = 'voiture'): Vehicle {
  const v = b.api.spawnVehicle(kind, x, z, heading, dx, dz)!;
  expect(v).not.toBeNull();
  const br = b.sys.cars.byVehicle.get(v.id)!;
  br.ambient = true;
  br.bornAt = Infinity; // (l'effectif d'ambiance visé est nul pendant l'essai : pas d'effacement « en surnombre »)
  return v;
}

async function street(session: { x: number; z: number }): Promise<{ b: TrafficBench; w: Watch; squad: number }> {
  const town = createTown({ buildings: true });
  const list: { squadId: number; x: number; z: number; heading: number }[] = [];
  const b = await createTrafficBench({ world: town, modules: [vehicles, people], session, setup: (ctx) => barrages(ctx, list) });
  const squad = b.ctx.squads.create('groupe', 'police', 'MISTRAL 1').id;
  list.push({ squadId: squad, x: BX, z: 120, heading: EAST });
  b.api.tuning.barrierTime = 0;
  b.api.tuning.despawn = 400; // (la circulation d'ambiance ne s'efface pas d'elle-même au loin pendant l'essai)
  return { b, w: watch(b), squad };
}

describe('circulation : rue fermée vidée de ses voitures', () => {
  it('hors de la vue du joueur : les voitures au-delà du barrage disparaissent aussitôt, avec leur conducteur ; le reste demeure', async () => {
    // le joueur (point de la session) est dans la Rue Nord-Sud 0, les immeubles lui cachent la rue fermée
    const { b, w, squad } = await street({ x: 0, z: 60 });
    const beyond = [car(b, 185, 121.75, EAST, 240, 330), car(b, 205, 118.25, WEST, -140, 120), car(b, 225, 121.75, EAST, 380, 120)];
    const open = car(b, 40, 121.75, EAST, 380, 120); // côté ouvert, en amont du carrefour
    const parked = b.api.spawnParked('voiture', 200, 124.5, EAST);
    const van = b.ctx.vehicles.spawn('fourgon_crs', 214, 116.8, WEST);
    const ambulance = b.ctx.vehicles.spawn('ambulance', 186, 116.8, WEST);
    b.step(1);
    const drivers = beyond.map((v) => v.seats[0]!);
    expect(drivers.every((id) => id > 0)).toBe(true);
    const c = b.control.closeRoad(BX, 120, 0, squad, true)!;
    expect(c).not.toBeNull();
    b.step(1.5);
    for (const v of beyond) expect(b.ctx.vehicles.get(v.id)).toBeUndefined();
    // leurs conducteurs ont disparu avec eux : personne n'est resté planté sur la chaussée
    for (const id of drivers) expect(b.ctx.people.get(id)).toBeUndefined();
    expect(w.removed.length).toBe(3);
    expect(w.removed.every((r) => !r.visible)).toBe(true);
    // ni la voiture garée sans conducteur, ni le fourgon de police, ni l'ambulance, ni la voiture du côté ouvert
    b.step(12);
    expect(b.ctx.vehicles.get(parked.id)).toBe(parked);
    expect(b.ctx.vehicles.get(van.id)).toBe(van);
    expect(b.ctx.vehicles.get(ambulance.id)).toBe(ambulance);
    expect(b.ctx.vehicles.get(open.id)).toBe(open);
    expect(open.x < 128 || Math.abs(open.z - 120) > 6).toBe(true); // elle n'est pas entrée dans le tronçon fermé
    // la rue rouverte, la circulation y revient : une voiture la traverse sans disparaître
    b.control.open(c.id);
    const back = car(b, 40, 121.75, EAST, 380, 120);
    const t = runUntil(b, () => back.x > 250, 60);
    expect(t).toBeGreaterThan(0);
    expect(b.ctx.vehicles.get(back.id)).toBe(back);
  }, 120000);

  it('sous les yeux du joueur : elles s’en vont (jamais au travers du barrage), disparaissent hors de sa vue, au plus tard en 15 s', async () => {
    const { b, w, squad } = await street({ x: 150, z: 120 });
    // le joueur, derrière le barrage, regarde la rue fermée
    const me = b.ctx.people.spawn({ kind: 'crs', x: 150, z: 121 });
    b.ctx.player.possess(me.id, 'crs');
    (b.ctx.player.state as { camYaw: number }).camYaw = EAST;
    const away = car(b, 205, 121.75, EAST, 240, 330); // s'éloigne du barrage : il tournera au carrefour
    const toward = car(b, 228, 118.25, WEST, -140, 120); // roule vers le barrage : demi-tour
    b.step(1);
    const cars = [away, toward];
    const c = b.control.closeRoad(BX, 120, 0, squad, true)!;
    expect(c).not.toBeNull();
    let crossed = 0;
    const t = runUntil(b, () => cars.every((v) => !b.ctx.vehicles.get(v.id)), 20, () => {
      for (const v of cars) if (b.ctx.vehicles.get(v.id) && v.x < BX + 2) crossed++;
    });
    console.log(`rue vidée sous les yeux du joueur en ${t.toFixed(1)} s ; retirés : ${w.removed.map((r) => `(${r.x.toFixed(0)}, ${r.z.toFixed(0)}${r.visible ? ' VU' : ''})`).join(' ')}`);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(PURGE_LIMIT);
    expect(crossed).toBe(0); // personne n'a franchi la ligne du barrage
    expect(w.removed.length).toBe(2);
    expect(w.removed.filter((r) => r.visible).length).toBe(0); // aucune disparition sous ses yeux
  }, 120000);

  it('côté ouvert : l’automobiliste engagé dans le tronçon fait demi-tour et reste ; un véhicule où se trouve le joueur reste', async () => {
    const { b, squad } = await street({ x: 0, z: 60 });
    const inside = car(b, 135, 121.75, EAST, 380, 120); // dans le tronçon, en deçà du barrage
    const mine = car(b, 220, 121.75, EAST, 380, 120);
    const me = b.ctx.people.spawn({ kind: 'crs', x: 220, z: 114 });
    b.ctx.player.possess(me.id, 'crs');
    expect(b.ctx.vehicles.enter(me, mine, 'passenger')).toBe(true); // le joueur est monté à bord
    b.step(1);
    b.control.closeRoad(BX, 120, 0, squad, true);
    let crossed = 0;
    runUntil(b, () => false, 16, () => {
      if (inside.x > BX - 2 && Math.abs(inside.z - 120) < 6) crossed++;
    });
    expect(b.ctx.vehicles.get(inside.id)).toBe(inside);
    expect(crossed).toBe(0);
    // le joueur est à bord de cette voiture : elle ne disparaît pas avec lui
    expect(b.ctx.vehicles.get(mine.id)).toBe(mine);
  }, 120000);

  it('périmètre fermé : toutes les voitures à l’intérieur s’en vont, aucune n’y apparaît ; rien ne bouge au-dehors', async () => {
    const town = createTown({ buildings: true });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: 0, z: -100 } });
    b.api.tuning.barrierTime = 0;
    const w = watch(b);
    const inside = [car(b, 60, 121.75, EAST, 240, 330), car(b, 118.25, 60, 0, 120, 330), car(b, 180, 238, WEST, -140, 240)];
    const outside = car(b, -100, 118, WEST, -140, 0);
    b.step(1);
    b.control.closeArea(120, 120, 180, 0);
    b.step(2);
    for (const v of inside) expect(b.ctx.vehicles.get(v.id)).toBeUndefined();
    expect(b.ctx.vehicles.get(outside.id)).toBe(outside);
    expect(w.removed.every((r) => !r.visible)).toBe(true);
    // la rue rouverte, rien ne disparaît plus
    b.control.openAll();
    const back = car(b, 60, 121.75, EAST, 240, 330);
    b.step(5);
    expect(b.ctx.vehicles.get(back.id)).toBe(back);
  }, 120000);

  it('périmètre fermé : la circulation d’ambiance n’apparaît plus à l’intérieur (ses rues intérieures restent ouvertes)', async () => {
    // 5 × 5 carrefours ; périmètre de 170 m autour du carrefour central : les neuf carrefours du milieu sont dedans
    const town = createTown({ cols: 5, rows: 5, buildings: true });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    t.barrierTime = 0;
    t.spawnMin = 40;
    t.spawnMax = 300;
    t.despawn = 330;
    t.vehicleDensity = 3;
    t.pedestrianDensity = 0;
    t.parkedDensity = 0;
    b.control.closeArea(town.centerX, town.centerZ, 170, 0);
    let spawned = 0;
    let inside = 0;
    b.ctx.events.on('vehicle:spawned', (e) => {
      const v = b.ctx.vehicles.get(e.id);
      if (!v) return;
      spawned++;
      if (Math.hypot(v.x - town.centerX, v.z - town.centerZ) < 168) inside++;
    });
    b.step(40);
    console.log(`périmètre : ${spawned} apparitions, ${inside} à l'intérieur`);
    expect(spawned).toBeGreaterThan(3);
    expect(inside).toBe(0);
  }, 120000);
});

const PURGE_LIMIT = 16;
