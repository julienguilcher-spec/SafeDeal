// Séparation entre personnes : foule dense dans une rue de 12 m (pas d'interpénétration, pas
// d'explosion numérique), croisements, résistance d'un bouclier levé, personnes à terre enjambées,
// et coût d'un pas de simulation pour 1 500 personnes en marche.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createNullActions } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleLocomotionApi } from '@/sim/people';
import { createWallWorld } from '@/sim/people/testkit';

interface PairStats { min: number; worst: number; over3cm: number }

/** Distance minimale entre deux personnes, pire chevauchement, nombre de paires se chevauchant de plus de 3 cm. */
function pairStats(list: readonly Person[]): PairStats {
  let min = Infinity;
  let worst = 0;
  let over3cm = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < min) min = d;
      const o = a.radius + b.radius - d;
      if (o > worst) worst = o;
      if (o > 0.03) over3cm++;
    }
  }
  return { min, worst, over3cm };
}

function maxSpeed(list: readonly Person[]): number {
  let m = 0;
  for (const p of list) m = Math.max(m, Math.hypot(p.vx, p.vz));
  return m;
}

/** Rue nord-sud large de 12 m (façades à x = ±6), fermée au sud par un mur à z = 40. */
const STREET = [
  { x0: -8, z0: -80, x1: -6, z1: 80 },
  { x0: 6, z0: -80, x1: 8, z1: 80 },
];
const DEAD_END = [...STREET, { x0: -8, z0: 40, x1: 8, z1: 42 }];

async function setup(walls: typeof STREET | null = null): Promise<TestContext> {
  const t = createTestContext({ modules: [createSystems] });
  await t.start();
  if (walls) t.ctx.world = createWallWorld(t.ctx.world, walls);
  return t;
}

/** 500 personnes en rangs serrés (0,74 m) dans la rue, à partir de z = z0, en remontant vers le nord. */
function spawnBlock(ctx: GameContext, count: number, z0: number, dir: number): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ctx.people.spawn({ kind: 'manifestant', x: -5.6 + (i % 16) * 0.74, z: z0 + Math.floor(i / 16) * 0.74 * dir }));
  }
  return out;
}

function expectInsideStreet(list: readonly Person[], zMax: number): void {
  for (const p of list) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.vx) && Number.isFinite(p.vz)).toBe(true);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(6 - p.radius + 1e-6);
    expect(p.z).toBeLessThanOrEqual(zMax - p.radius + 1e-6);
  }
}

describe('foule dense : 500 personnes dans une rue de 12 m', () => {
  it('en marche contre un mur : la foule se tasse sans interpénétration ni explosion', async () => {
    const t = await setup(DEAD_END);
    const ctx = t.ctx;
    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    for (const p of spawnBlock(ctx, 500, 0, 1)) p.cmd.moveZ = 1;
    let worstEver = 0;
    for (let k = 0; k < 8; k++) {
      t.step(5);
      const s = pairStats(ctx.people.list);
      worstEver = Math.max(worstEver, s.worst);
      // personne ne dépasse jamais sa vitesse de marche : les poussées ne s'accumulent pas en vitesse
      expect(maxSpeed(ctx.people.list)).toBeLessThanOrEqual(1.4 + 1e-6);
    }
    const s = pairStats(ctx.people.list);
    console.log(`[foule] marche contre un mur : distance mini ${s.min.toFixed(3)} m, pire chevauchement ${(s.worst * 100).toFixed(1)} cm (max. observé ${(worstEver * 100).toFixed(1)} cm), paires > 3 cm : ${s.over3cm}`);
    // deux rayons de 0,28 m : aucun chevauchement de plus de 3 cm (5 % d'une largeur d'épaules), à aucun moment
    expect(s.min).toBeGreaterThan(0.56 - 0.03);
    expect(worstEver).toBeLessThan(0.03);
    expect(s.over3cm).toBe(0);
    expectInsideStreet(ctx.people.list, 40);
    // la foule s'est bien tassée contre le mur, et la densité reste physiquement plausible
    let maxZ = -Infinity;
    let dens = 0;
    for (const p of ctx.people.list) {
      maxZ = Math.max(maxZ, p.z);
      dens = Math.max(dens, loco.densityAt(p));
    }
    expect(maxZ).toBeGreaterThan(39.5);
    expect(dens).toBeGreaterThan(1.8);
    expect(dens).toBeLessThan(5.4);
  });

  it('au sprint contre un mur : chocs amortis, état final sans interpénétration', async () => {
    const t = await setup(DEAD_END);
    const ctx = t.ctx;
    for (const p of spawnBlock(ctx, 500, 0, 1)) {
      p.cmd.moveZ = 1;
      p.cmd.gait = 2;
    }
    let worstEver = 0;
    for (let k = 0; k < 24; k++) {
      t.step(1);
      for (const p of ctx.people.list) p.stamina = 100; // souffle illimité : le pire cas
      worstEver = Math.max(worstEver, pairStats(ctx.people.list).worst);
      expect(maxSpeed(ctx.people.list)).toBeLessThanOrEqual(5.5 + 1e-6);
    }
    t.step(10);
    const s = pairStats(ctx.people.list);
    console.log(`[foule] sprint contre un mur : pire chevauchement transitoire ${(worstEver * 100).toFixed(1)} cm, final ${(s.worst * 100).toFixed(1)} cm, paires > 3 cm : ${s.over3cm}`);
    expect(worstEver).toBeLessThan(0.12); // un sprinteur parcourt 18 cm par pas : le choc est résorbé en quelques pas
    expect(s.worst).toBeLessThan(0.035);
    expect(s.over3cm).toBeLessThanOrEqual(1);
    expectInsideStreet(ctx.people.list, 40);
  });

  it('500 personnes empilées au même endroit : la foule se détend sans exploser', async () => {
    const t = await setup(STREET);
    const ctx = t.ctx;
    for (let i = 0; i < 500; i++) ctx.people.spawn({ kind: 'manifestant', x: (i % 5) * 0.01, z: 10 + Math.floor(i / 5) * 0.01 });
    const before = ctx.people.list.map((p) => ({ x: p.x, z: p.z }));
    const dt = 1 / 30;
    let maxStepMove = 0;
    for (let k = 0; k < 360; k++) {
      t.game.step(dt);
      const list = ctx.people.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        const b = before[i]!;
        maxStepMove = Math.max(maxStepMove, Math.hypot(p.x - b.x, p.z - b.z));
        b.x = p.x;
        b.z = p.z;
      }
    }
    // écartement borné à 3,5 m/s : jamais de bond, jamais de vitesse acquise
    expect(maxStepMove).toBeLessThanOrEqual(3.5 * dt + 1e-9);
    expect(maxSpeed(ctx.people.list)).toBe(0);
    const s = pairStats(ctx.people.list);
    console.log(`[foule] empilement : après 12 s, distance mini ${s.min.toFixed(3)} m, paires > 3 cm : ${s.over3cm}`);
    expect(s.min).toBeGreaterThan(0.5);
    expectInsideStreet(ctx.people.list, Infinity);
  });

  it('deux cortèges face à face : ils se rejoignent et se bloquent sans se traverser', async () => {
    const t = await setup(STREET);
    const ctx = t.ctx;
    const south = spawnBlock(ctx, 250, -20, -1);
    const north = spawnBlock(ctx, 250, 20, 1);
    for (const p of south) p.cmd.moveZ = 1;
    for (const p of north) p.cmd.moveZ = -1;
    let worstEver = 0;
    for (let k = 0; k < 8; k++) {
      t.step(5);
      worstEver = Math.max(worstEver, pairStats(ctx.people.list).worst);
    }
    const s = pairStats(ctx.people.list);
    console.log(`[foule] contre-flux : pire chevauchement ${(worstEver * 100).toFixed(1)} cm, final ${(s.worst * 100).toFixed(1)} cm`);
    expect(worstEver).toBeLessThan(0.06);
    expect(s.worst).toBeLessThan(0.04);
    expectInsideStreet(ctx.people.list, Infinity);
  });
});

describe('croisements et résistance', () => {
  it('deux personnes qui marchent exactement face à face se contournent et se croisent', async () => {
    const t = await setup();
    const a = t.ctx.people.spawn({ kind: 'passant', x: 0, z: -5 });
    const b = t.ctx.people.spawn({ kind: 'passant', x: 0, z: 5 });
    a.cmd.moveZ = 1;
    b.cmd.moveZ = -1;
    let minDist = Infinity;
    for (let k = 0; k < 300; k++) {
      t.game.step(1 / 30);
      minDist = Math.min(minDist, Math.hypot(a.x - b.x, a.z - b.z));
    }
    expect(a.z).toBeGreaterThan(4);
    expect(b.z).toBeLessThan(-4);
    expect(minDist).toBeGreaterThan(0.5); // sans se traverser
  });

  it('un marcheur contourne une personne immobile au lieu de la pousser devant lui', async () => {
    const t = await setup();
    const walker = t.ctx.people.spawn({ kind: 'passant', x: 0.05, z: -4 });
    const still = t.ctx.people.spawn({ kind: 'passant', x: 0, z: 0 });
    walker.cmd.moveZ = 1;
    t.step(8);
    expect(walker.z).toBeGreaterThan(4);
    expect(Math.hypot(still.x, still.z)).toBeLessThan(0.6);
  });

  it('un bouclier levé résiste à la poussée bien mieux que des mains nues', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const actions = createNullActions();
    // deux duels identiques, à 30 m l'un de l'autre : un pousseur marche sur une personne immobile
    const pusher1 = ctx.people.spawn({ kind: 'manifestant', x: 0, z: -1 });
    const bare = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const pusher2 = ctx.people.spawn({ kind: 'manifestant', x: 30, z: -1 });
    const shield = ctx.people.spawn({ kind: 'crs', x: 30, z: 0 });
    actions.give(shield, 'bouclier', 1);
    actions.select(shield, 0);
    shield.alt = true;
    shield.heading = Math.PI; // face au pousseur
    bare.heading = Math.PI;
    t.step(1); // la résistance est réévaluée environ deux fois par seconde
    pusher1.cmd.moveZ = 1;
    pusher1.cmd.gait = 1;
    pusher2.cmd.moveZ = 1;
    pusher2.cmd.gait = 1;
    // les pousseurs insistent : ils visent le centre de leur vis-à-vis
    for (let k = 0; k < 150; k++) {
      t.game.step(1 / 30);
      for (const [pu, tg] of [[pusher1, bare], [pusher2, shield]] as const) {
        const dx = tg.x - pu.x;
        const dz = tg.z - pu.z;
        const d = Math.hypot(dx, dz) || 1;
        pu.cmd.moveX = dx / d;
        pu.cmd.moveZ = dz / d;
      }
    }
    const movedBare = Math.hypot(bare.x, bare.z);
    const movedShield = Math.hypot(shield.x - 30, shield.z);
    expect(movedBare).toBeGreaterThan(0.1);
    expect(movedShield).toBeLessThan(movedBare * 0.5);
  });

  it("un policier dont l'unité tient une ligne résiste davantage qu'un policier en déplacement libre", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const squad = ctx.squads.create('groupe', 'police', 'Alpha 1');
    const inLine = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: Math.PI, seed: 5 });
    const free = ctx.people.spawn({ kind: 'crs', x: 30, z: 0, heading: Math.PI, seed: 5 });
    ctx.squads.addMember(squad.id, inLine.id);
    ctx.squads.issue(squad.id, { type: 'ligne' });
    const pushers = [ctx.people.spawn({ kind: 'manifestant', x: 0, z: -1, seed: 9 }), ctx.people.spawn({ kind: 'manifestant', x: 30, z: -1, seed: 9 })];
    t.step(1);
    for (let k = 0; k < 150; k++) {
      t.game.step(1 / 30);
      for (const [pu, tg] of [[pushers[0]!, inLine], [pushers[1]!, free]] as const) {
        const dx = tg.x - pu.x;
        const dz = tg.z - pu.z;
        const d = Math.hypot(dx, dz) || 1;
        pu.cmd.moveX = dx / d;
        pu.cmd.moveZ = dz / d;
        pu.cmd.gait = 1;
      }
    }
    const movedLine = Math.hypot(inLine.x, inLine.z);
    const movedFree = Math.hypot(free.x - 30, free.z);
    expect(movedFree).toBeGreaterThan(0.1);
    expect(movedLine).toBeLessThan(movedFree * 0.75);
  });

  it("on enjambe une personne à terre : elle ne dévie ni n'arrête le passage", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const body = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 2 });
    ctx.health.setDown(body, true);
    body.health = 10; // ne se relèvera pas
    body.injury = 'critical';
    const walker = ctx.people.spawn({ kind: 'passant', x: 0, z: 0 });
    walker.cmd.moveZ = 1;
    t.step(4);
    expect(walker.z).toBeGreaterThan(5);
    expect(Math.abs(walker.x)).toBeLessThan(1e-6);
    expect(body.x).toBe(0);
    expect(body.z).toBe(2);
  });
});

describe('performances', () => {
  it("coût d'un pas pour 1 500 personnes en marche (objectif < 3 ms)", async () => {
    const results: string[] = [];
    let worst = 0;
    for (const withPlayer of [false, true]) {
      const t = await setup();
      const ctx = t.ctx;
      // cortège dense sur une avenue de 25 m : 1 500 personnes espacées de 0,9 m, marchant vers le sud
      for (let i = 0; i < 1500; i++) {
        const p = ctx.people.spawn({ kind: 'manifestant', x: -12 + (i % 27) * 0.9, z: -Math.floor(i / 27) * 0.9 });
        p.cmd.moveZ = 1;
        p.cmd.moveX = (((i * 7) % 11) - 5) * 0.02;
      }
      if (withPlayer) {
        const me = ctx.people.spawn({ kind: 'crs', x: 0, z: 5 });
        ctx.player.possess(me.id, 'crs');
      }
      t.step(3); // échauffement
      // meilleure de 12 séries de 30 pas : insensible aux à-coups d'une machine de test chargée
      let best = Infinity;
      let bestLoco = Infinity;
      for (let run = 0; run < 12; run++) {
        let loco = 0;
        const t0 = performance.now();
        for (let i = 0; i < 30; i++) {
          t.game.step(1 / 30);
          for (const s of t.game.perf) if (s.id === 'people.locomotion') loco += s.updateMs;
        }
        best = Math.min(best, (performance.now() - t0) / 30);
        bestLoco = Math.min(bestLoco, loco / 30);
      }
      worst = Math.max(worst, best);
      results.push(`${withPlayer ? 'avec joueur au milieu' : 'sans joueur (tout à pleine fréquence)'} : ${best.toFixed(2)} ms/pas (locomotion ${bestLoco.toFixed(2)} ms)`);
      // tout le monde avance bien
      let moving = 0;
      for (const p of ctx.people.list) if (Math.hypot(p.vx, p.vz) > 1) moving++;
      expect(moving).toBeGreaterThan(1400);
    }
    console.log(`[perf] 1 500 personnes en marche, moteur complet du module — ${results.join(' ; ')}`);
    expect(worst).toBeLessThan(3);
  });

  it('aucune allocation explicite dans le pas : passages du ramasse-miettes pendant 30 s simulées', async () => {
    interface GcObserver { observe(o: { entryTypes: string[] }): void; disconnect(): void }
    type GcCtor = new (cb: (list: { getEntries(): unknown[] }) => void) => GcObserver;
    const Ctor = (globalThis as { PerformanceObserver?: GcCtor }).PerformanceObserver;
    if (!Ctor) return;
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const t = await setup();
    const ctx = t.ctx;
    for (let i = 0; i < 1500; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: -12 + (i % 27) * 0.9, z: -Math.floor(i / 27) * 0.9 });
      p.cmd.moveZ = 1;
      p.cmd.moveX = (((i * 7) % 11) - 5) * 0.02;
    }
    const me = ctx.people.spawn({ kind: 'crs', x: 0, z: 5 });
    ctx.player.possess(me.id, 'crs');
    t.step(5);
    let runs = 0;
    let obs: GcObserver;
    try {
      obs = new Ctor((list) => void (runs += list.getEntries().length));
      obs.observe({ entryTypes: ['gc'] });
    } catch {
      return; // non mesurable sur cette plate-forme
    }
    await sleep(40);
    runs = 0;
    for (let i = 0; i < 900; i++) t.game.step(1 / 30);
    await sleep(80);
    obs.disconnect();
    // Le code du module n'alloue ni objet ni tableau par pas ; restent des flottants emballés par le moteur
    // JavaScript au passage d'arguments vers les services (grille spatiale, collisions) : collectes mineures.
    console.log(`[perf] 900 pas, 1 500 personnes en marche : ${runs} passage(s) du ramasse-miettes`);
    expect(runs).toBeLessThan(40);
  });

  it('1 500 personnes dispersées, joueur à un bout : la fréquence réduite allège le pas', async () => {
    const t = await setup();
    const ctx = t.ctx;
    for (let i = 0; i < 1500; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: (i % 50) * 6, z: Math.floor(i / 50) * 6 });
      p.cmd.moveZ = 1;
    }
    const me = ctx.people.spawn({ kind: 'crs', x: -5, z: -5 });
    ctx.player.possess(me.id, 'crs');
    t.step(2);
    let best = Infinity;
    for (let run = 0; run < 6; run++) {
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) t.game.step(1 / 30);
      best = Math.min(best, (performance.now() - t0) / 60);
    }
    console.log(`[perf] 1 500 personnes dispersées sur 300 m, joueur à un bout : ${best.toFixed(2)} ms/pas`);
    expect(best).toBeLessThan(3);
  });
});
