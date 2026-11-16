// Matériel — comportement des projectiles à l'impact : pavé et bouclier, LBD, engin incendiaire,
// désencerclement, grenade assourdissante, mortier, bouteille, fumigène, fusée, véhicules, vitrines, murs.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems, ITEMS_SERVICE } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { aimAt, createHazardRecorder, createPropRecorder, face, record, spawn, withWalls } from '@/sim/items/testkit';
import type { HazardRecorder } from '@/sim/items/testkit';

async function setup(seed = 5): Promise<{ t: TestContext; ctx: GameContext; hz: HazardRecorder; items: ItemsApi }> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start();
  const ctx = t.ctx;
  const hz = createHazardRecorder(ctx);
  ctx.hazards = hz.api;
  const items = ctx.require<ItemsApi>(ITEMS_SERVICE);
  items.tuning.dispersion = 0;
  return { t, ctx, hz, items };
}

/** Donne l'objet, le prend en main et laisse passer le temps de mise en main. */
function arm(t: TestContext, p: Person, id: string, count?: number): void {
  t.ctx.actions.give(p, id, count);
  t.ctx.actions.selectById(p, id);
  t.step(1.5);
}

/** Vise un point, lance, et retourne l'identifiant du projectile. */
function throwAt(ctx: GameContext, p: Person, x: number, y: number, z: number): number {
  const sol = aimAt(ctx, p, x, y, z);
  expect(sol, 'cible à portée').not.toBeNull();
  const r = ctx.actions.use(p, { power: sol!.power });
  expect(r.ok).toBe(true);
  return r.projectileId!;
}

describe('pavé', () => {
  it('est arrêté par un bouclier levé de face, pas de dos, ni au-dessus du bouclier, ni bouclier baissé', async () => {
    const { t, ctx } = await setup();
    const thrower = spawn(ctx, 'manifestant', 0, 0);
    arm(t, thrower, 'pave', 3);
    const impacts = record(ctx, 'projectile:impact');
    const hurts = record(ctx, 'person:hurt');

    // ── de face, bouclier levé : arrêté ──
    const front = spawn(ctx, 'crs', 0, 12, Math.PI, ['bouclier']); // regarde vers le lanceur (−z)
    ctx.actions.selectById(front, 'bouclier');
    ctx.actions.setAlt(front, true);
    ctx.people.rebuildIndex();
    const shield = ctx.actions.activeItem(front)!;
    const id1 = throwAt(ctx, thrower, front.x, front.y + 1.35, front.z); // en pleine poitrine
    t.step(2);
    const hit1 = impacts.find((e) => e.id === id1 && e.hitKind === 'person');
    expect(hit1, 'le pavé a heurté le bouclier').toBeDefined();
    expect(hit1!.hitId).toBe(front.id);
    expect(front.health).toBe(100);
    expect(front.stun).toBe(0);
    expect(hurts.length).toBe(0);
    expect(shield.state).toBeLessThan(1); // le bouclier s'use
    expect(shield.state).toBeGreaterThan(0.9);
    expect(front.stamina).toBeLessThan(100); // le bras encaisse
    // le pavé retombe au pied du bouclier et reste au sol, ramassable
    const stone = ctx.projectiles.get(id1)!;
    expect(stone.resting).toBe(true);
    expect(stone.pickable).toBe(true);
    expect(Math.hypot(stone.x - front.x, stone.z - front.z)).toBeLessThan(3);
    // jeter un pavé sur un agent : jet de projectile + violence sur agent
    expect(thrower.offenses.map((o) => o.type)).toEqual(['jet_projectile', 'violence_agent']);

    // ── à la tête : elle dépasse du bouclier, sauf en parade haute (visée relevée) ──
    const top = front.y + front.look.height - 0.06;
    front.aimPitch = 0.3;
    t.step(1);
    throwAt(ctx, thrower, front.x, top, front.z);
    t.step(2);
    expect(hurts.length).toBe(0);
    front.aimPitch = 0;
    throwAt(ctx, thrower, front.x, top, front.z);
    t.step(2);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.info.zone).toBeGreaterThan(0.92);
    const headDamage = hurts[0]!.info.amount;
    expect(headDamage).toBeGreaterThan(25);
    expect(front.health).toBeCloseTo(100 - headDamage, 5);

    // ── bouclier baissé : la poitrine n'est plus couverte au-dessus du bord ──
    ctx.actions.setAlt(front, false);
    t.step(1);
    front.stun = 0;
    hurts.length = 0;
    arm(t, thrower, 'pave', 3);
    throwAt(ctx, thrower, front.x, front.y + 1.45, front.z);
    t.step(2);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.info.amount).toBeLessThan(headDamage);
    hurts.length = 0;

    // ── de dos, bouclier levé : il ne protège pas ──
    const back = spawn(ctx, 'crs', 12, 0, Math.PI / 2, ['bouclier']); // regarde vers +x, dos au lanceur
    ctx.actions.selectById(back, 'bouclier');
    ctx.actions.setAlt(back, true);
    ctx.people.rebuildIndex();
    t.step(1);
    throwAt(ctx, thrower, back.x, back.y + 1.1, back.z);
    t.step(2);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.id).toBe(back.id);
    expect(hurts[0]!.info.kind).toBe('impact');
    expect(hurts[0]!.info.item).toBe('pave');
    expect(hurts[0]!.info.sourceId).toBe(thrower.id);
    expect(hurts[0]!.info.means).toBeUndefined();
    expect(hurts[0]!.info.amount).toBeGreaterThan(10);
    expect(hurts[0]!.info.amount).toBeLessThan(headDamage); // au corps, moins grave qu'à la tête
    expect(back.health).toBeLessThan(90);
    expect(back.stun).toBeGreaterThan(0.5);
    // recul dans le sens du jet (vers +x)
    expect(hurts[0]!.info.dirX).toBeGreaterThan(0.9);
  });

  it('blesse selon sa vitesse', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const damageAt = (power: number, row: number): number => {
      const thrower = spawn(ctx, 'manifestant', row * 30, 0);
      const victim = spawn(ctx, 'passant', row * 30, 3);
      arm(t, thrower, 'pave');
      face(thrower, 0, -0.1);
      ctx.people.rebuildIndex();
      hurts.length = 0;
      ctx.actions.use(thrower, { power });
      t.step(1);
      expect(hurts.length).toBe(1);
      expect(hurts[0]!.id).toBe(victim.id);
      return hurts[0]!.info.amount;
    };
    const soft = damageAt(0, 0);
    const hard = damageAt(1, 1);
    expect(soft).toBeGreaterThan(3);
    expect(hard).toBeGreaterThan(soft * 2.5);
  });

  it('brise une vitrine et cabosse un véhicule', async () => {
    const { t, ctx } = await setup();
    const props = createPropRecorder(ctx);
    ctx.props = props.api;
    const windows = record(ctx, 'shop:window');
    const impacts = record(ctx, 'projectile:impact');
    const shop = props.addShop({ category: 'banque', x: 0, z: 10, heading: Math.PI, width: 4 }); // façade tournée vers −z
    const thrower = spawn(ctx, 'manifestant', 0.5, 0);
    arm(t, thrower, 'pave', 3);
    // premier pavé, lancé en cloche : la vitre s'étoile
    const id = throwAt(ctx, thrower, 0.5, 1.3, 10);
    t.step(2);
    expect(props.shopDamage.length).toBe(1);
    expect(props.shopDamage[0]).toMatchObject({ shopId: shop.id, kind: 'impact', byId: thrower.id });
    expect(props.shopDamage[0]!.amount).toBeGreaterThan(10);
    expect(shop.window).toBe('cracked');
    expect(impacts.some((e) => e.id === id && e.hitKind === 'building' && e.hitId === shop.id)).toBe(true);
    expect(ctx.projectiles.get(id)!.z).toBeLessThan(10); // il a rebondi sur la vitre et repose sur le trottoir
    // deuxième pavé, à pleine force et à tir tendu : elle s'effondre et le pavé tombe dans la boutique
    face(thrower, 0, 0);
    const id2 = ctx.actions.use(thrower, { power: 1 }).projectileId!;
    t.step(2);
    expect(props.shopDamage[1]!.amount).toBeGreaterThan(30);
    expect(shop.window).toBe('broken');
    expect(windows).toEqual([
      { id: shop.id, state: 'cracked', byId: thrower.id },
      { id: shop.id, state: 'broken', byId: thrower.id },
    ]);
    expect(ctx.projectiles.get(id2)).toBeUndefined();
    expect(thrower.offenses.map((o) => o.type)).toEqual(['jet_projectile', 'degradation', 'jet_projectile', 'degradation']);

    // véhicule (magasin de base du cœur)
    const car = ctx.vehicles.spawn('voiture', 20, 0, 0);
    t.step(1);
    const id3 = throwAt(ctx, thrower, car.x, 1.0, car.z);
    t.step(4);
    expect(impacts.some((e) => e.id === id3 && e.hitKind === 'vehicle' && e.hitId === car.id)).toBe(true);
    expect(car.health).toBeLessThan(100);
    expect(car.health).toBeGreaterThan(80);
    // il rebondit sur la carrosserie et retombe à côté
    const stone = ctx.projectiles.get(id3)!;
    expect(stone.resting).toBe(true);
    expect(stone.x).toBeLessThan(car.x);
  });
});

describe('LBD 40', () => {
  it('à 10, 30 et 50 m : touche le torse visé, de moins en moins fort', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const results: { d: number; amount: number; zone: number; stun: number }[] = [];
    for (const d of [10, 30, 50]) {
      const crs = spawn(ctx, 'crs', d * 10, 0);
      const target = spawn(ctx, 'manifestant', d * 10, d);
      arm(t, crs, 'lbd40');
      ctx.actions.setAlt(crs, true); // épaulé
      ctx.people.rebuildIndex();
      const sol = aimAt(ctx, crs, target.x, target.y + 1.2, target.z)!;
      expect(sol).not.toBeNull();
      hurts.length = 0;
      const before = ctx.law.forceLog.length;
      const r = ctx.actions.use(crs);
      expect(ctx.projectiles.get(r.projectileId!)!.kind).toBe('lbd');
      t.step(1.5);
      expect(hurts.length, `${d} m`).toBe(1);
      const info = hurts[0]!.info;
      expect(hurts[0]!.id).toBe(target.id);
      expect(info.kind).toBe('impact');
      expect(info.means).toBe('lbd');
      expect(info.item).toBe('lbd40');
      expect(info.sourceId).toBe(crs.id);
      // torse : entre la taille et les épaules
      expect(info.zone! * target.look.height).toBeGreaterThan(1.05);
      expect(info.zone! * target.look.height).toBeLessThan(1.35);
      results.push({ d, amount: info.amount, zone: info.zone!, stun: info.stun! });
      // emploi de la force déclaré, avec la personne visée
      expect(ctx.law.forceLog.length).toBe(before + 1);
      expect(ctx.law.forceLog[before]).toMatchObject({ byId: crs.id, means: 'lbd', targetId: target.id });
      // durée de vol : ≈ 0,12 s à 10 m, ≈ 0,7 s à 50 m
      expect(sol.flightTime).toBeGreaterThan((d - 0.6) / 92);
      expect(sol.flightTime).toBeLessThan((d / 92) * 1.4);
    }
    console.log('[LBD] dégâts au torse : ' + results.map((r) => `${r.d} m → ${r.amount.toFixed(1)} (étourdi ${r.stun.toFixed(1)} s)`).join(' ; '));
    expect(results[0]!.amount).toBeGreaterThan(results[1]!.amount * 1.3);
    expect(results[1]!.amount).toBeGreaterThan(results[2]!.amount * 1.3);
    // ≈ 84 J à 40 m ; blessure légère à distance réglementaire, sérieuse à bout portant
    expect(results[0]!.amount).toBeGreaterThan(28);
    expect(results[0]!.amount).toBeLessThan(40);
    expect(results[2]!.amount).toBeGreaterThan(10);
    expect(results[2]!.amount).toBeLessThan(20);
    expect(results[1]!.stun).toBeGreaterThan(1);
  });

  it('un tir à la tête est bien plus grave ; le viseur est réglé pour 25 m', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const crs = spawn(ctx, 'crs', 0, 0);
    const target = spawn(ctx, 'manifestant', 0, 25);
    arm(t, crs, 'lbd40', 6);
    ctx.people.rebuildIndex();
    const out = { yaw: 0, pitch: 0, power: 0, flightTime: 0 };
    // à 25 m, la visée calculée est la ligne de visée géométrique (± 2 cm)
    const eye = crs.y + crs.look.height * 0.88;
    expect(ctx.actions.solveAim(crs, 0, 1.2, 25, out)).toBe(true);
    const los25 = Math.atan2(1.2 - eye, 25 - 0.5);
    expect(Math.abs(out.pitch - los25) * 25).toBeLessThan(0.02);
    // à 50 m, il faut viser nettement au-dessus (la balle tombe de plus d'un mètre sous la ligne de visée)
    expect(ctx.actions.solveAim(crs, 0, 1.2, 50, out)).toBe(true);
    const los50 = Math.atan2(1.2 - eye, 50 - 0.5);
    expect((out.pitch - los50) * 50).toBeGreaterThan(1);
    // à 10 m, légèrement en dessous
    expect(ctx.actions.solveAim(crs, 0, 1.2, 10, out)).toBe(true);
    expect(out.pitch).toBeLessThan(Math.atan2(1.2 - eye, 10 - 0.5));

    aimAt(ctx, crs, 0, target.y + 1.2, 25);
    ctx.actions.use(crs);
    t.step(5.5);
    aimAt(ctx, crs, 0, target.y + target.look.height - 0.08, 25);
    ctx.actions.use(crs);
    t.step(1);
    expect(hurts.length).toBe(2);
    expect(hurts[1]!.info.zone).toBeGreaterThan(0.86);
    expect(hurts[1]!.info.amount).toBeGreaterThan(hurts[0]!.info.amount * 2.3);
    // la balle, arrêtée, tombe au pied de la personne
    const balls = ctx.projectiles.list.filter((p) => p.kind === 'lbd');
    expect(balls.length).toBe(2);
    for (const b of balls) expect(Math.hypot(b.x, b.z - 25)).toBeLessThan(2);
  });

  it('avec la dispersion réelle, un tir épaulé à 30 m touche presque toujours', async () => {
    const { t, ctx, items } = await setup(11);
    items.tuning.dispersion = 1;
    const hurts = record(ctx, 'person:hurt');
    let shots = 0;
    for (let i = 0; i < 20; i++) {
      const crs = spawn(ctx, 'crs', i * 20, 0);
      spawn(ctx, 'manifestant', i * 20, 30);
      arm(t, crs, 'lbd40');
      ctx.actions.setAlt(crs, true);
      ctx.people.rebuildIndex();
      aimAt(ctx, crs, crs.x, 1.1, 30);
      if (ctx.actions.use(crs).ok) shots++;
      t.step(1);
    }
    expect(shots).toBe(20);
    console.log(`[LBD] dispersion réelle, 30 m, épaulé : ${hurts.length}/20 au but`);
    expect(hurts.length).toBeGreaterThanOrEqual(17);
  });
});

describe('engin incendiaire', () => {
  it('allume une nappe de feu, enflamme les personnes éclaboussées et les véhicules', async () => {
    const { t, ctx, hz } = await setup();
    const booms = record(ctx, 'explosion');
    const hurts = record(ctx, 'person:hurt');
    const thrower = spawn(ctx, 'manifestant', 0, 0);
    arm(t, thrower, 'molotov', 2);
    const near = spawn(ctx, 'crs', 0.8, 15.5, Math.PI);
    const edge = spawn(ctx, 'crs', -1.4, 15, Math.PI);
    const far = spawn(ctx, 'crs', 4, 15, Math.PI);
    ctx.people.rebuildIndex();
    const id = throwAt(ctx, thrower, 0, 0, 15);
    t.step(3);
    // nappe de Ø 2 à 3 m au point de chute
    expect(hz.fires.length).toBe(1);
    expect(hz.fires[0]!.radius).toBeGreaterThanOrEqual(1);
    expect(hz.fires[0]!.radius).toBeLessThanOrEqual(1.5);
    expect(hz.fires[0]!.amount).toBe(1);
    expect(hz.fires[0]!.sourceId).toBe(thrower.id);
    expect(Math.hypot(hz.fires[0]!.x, hz.fires[0]!.z - 15)).toBeLessThan(0.5);
    expect(booms.map((b) => b.kind)).toEqual(['molotov']);
    expect(ctx.projectiles.get(id)).toBeUndefined();
    // personnes : plus on est près, plus on brûle ; hors de portée, rien
    expect(near.burning).toBeGreaterThan(0.4);
    expect(edge.burning).toBeGreaterThan(0.25);
    expect(near.burning).toBeGreaterThan(edge.burning);
    expect(far.burning).toBe(0);
    expect(far.health).toBe(100);
    const burns = hurts.filter((h) => h.info.kind === 'burn');
    expect(burns.map((h) => h.id).sort()).toEqual([near.id, edge.id].sort());
    expect(near.health).toBeLessThan(96);
    expect(thrower.offenses.map((o) => o.type)).toEqual(['jet_projectile', 'incendie', 'violence_agent']);

    // sur un véhicule : il prend feu
    const car = ctx.vehicles.spawn('voiture', -14, 0, 0);
    t.step(1);
    throwAt(ctx, thrower, car.x, 1.0, car.z);
    t.step(3);
    expect(hz.fires.length).toBe(2);
    expect(car.burning).toBeGreaterThan(0.2);
    expect(car.health).toBeLessThan(100);
  });

  it('un bouclier levé protège en partie son porteur', async () => {
    const { t, ctx } = await setup();
    const thrower = spawn(ctx, 'manifestant', 0, 0);
    arm(t, thrower, 'molotov', 2);
    const bare = spawn(ctx, 'crs', 0, 12, Math.PI);
    const covered = spawn(ctx, 'crs', 40, 12, Math.PI, ['bouclier']);
    ctx.actions.selectById(covered, 'bouclier');
    ctx.actions.setAlt(covered, true);
    ctx.people.rebuildIndex();
    throwAt(ctx, thrower, bare.x, bare.y + 1.1, bare.z);
    t.step(3);
    thrower.x = 40;
    ctx.people.rebuildIndex();
    throwAt(ctx, thrower, covered.x, covered.y + 1.1, covered.z);
    t.step(3);
    expect(bare.burning).toBeGreaterThan(0.8);
    expect(covered.burning).toBeGreaterThan(0);
    expect(covered.burning).toBeLessThan(bare.burning * 0.6);
    expect(100 - covered.health).toBeLessThan((100 - bare.health) * 0.5);
  });
});

describe('grenade de désencerclement', () => {
  it('étourdit tout le monde dans son rayon et projette dix-huit plots à l\'horizontale', async () => {
    const { t, ctx } = await setup();
    const booms = record(ctx, 'explosion');
    const hurts = record(ctx, 'person:hurt');
    const spawned = record(ctx, 'projectile:spawned');
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'grenade_desencerclement', 1);
    // groupe hostile autour du point visé (0, 15) : couronne serrée à 3 m, puis à 5 m, 6,5 m, 9 m et 13 m
    const cx = 0;
    const cz = 15;
    const ring: Person[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push(spawn(ctx, 'manifestant', cx + Math.sin(a) * 3, cz + Math.cos(a) * 3));
    }
    const at5 = spawn(ctx, 'manifestant', cx + 5, cz);
    const at65 = spawn(ctx, 'manifestant', cx - 6.5, cz);
    const at9 = spawn(ctx, 'manifestant', cx + 9, cz + 0.3);
    const at13 = spawn(ctx, 'manifestant', cx - 13, cz - 0.4);
    ctx.people.rebuildIndex();
    const before = ctx.law.forceLog.length;
    throwAt(ctx, crs, cx, 0, cz);
    expect(ctx.law.forceLog[before]).toMatchObject({ means: 'desencerclement', byId: crs.id });
    t.step(1.4);
    expect(booms.length).toBe(0); // retard de 1,5 s
    t.step(0.2);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('desencerclement');
    expect(booms[0]!.radius).toBe(7);
    expect(Math.hypot(booms[0]!.x - cx, booms[0]!.z - cz)).toBeLessThan(1);
    expect(spawned.filter((e) => e.kind === 'plot_caoutchouc').length).toBe(18);
    // détonation : étourdissement décroissant avec la distance, nul au-delà de 7 m
    for (const p of ring) expect(p.stun).toBeGreaterThan(0.5);
    expect(at5.stun).toBeGreaterThan(0.1);
    expect(at5.stun).toBeLessThan(ring[0]!.stun);
    expect(at65.stun).toBeGreaterThan(0);
    expect(at65.stun).toBeLessThan(at5.stun);
    expect(at9.stun).toBe(0);
    expect(at13.stun).toBe(0);
    const blasts = hurts.filter((h) => h.info.kind === 'blast');
    expect(blasts.length).toBe(14);
    expect(blasts.every((h) => h.info.means === 'desencerclement' && h.info.item === 'grenade_desencerclement')).toBe(true);

    // plots : partis à l'horizontale, ils touchent des personnes de la couronne aux jambes ou au buste
    t.step(1);
    const plotHits = hurts.filter((h) => h.info.kind === 'impact');
    console.log(`[désencerclement] ${plotHits.length} plots au but sur 18 ; zones ${plotHits.map((h) => h.info.zone!.toFixed(2)).join(' ')}`);
    expect(plotHits.length).toBeGreaterThanOrEqual(3);
    expect(plotHits.length).toBeLessThanOrEqual(18);
    for (const h of plotHits) {
      expect(h.info.amount).toBeGreaterThan(1);
      expect(h.info.amount).toBeLessThan(20);
      expect(h.info.zone).toBeLessThan(0.86); // rasants : pas la tête d'une personne debout
    }
    expect(at13.health).toBe(100);
    // les plots sont retirés une fois leur course finie
    expect(ctx.projectiles.list.length).toBe(0);
  });
});

describe('grenade assourdissante-lacrymogène', () => {
  it('détone au point de chute : sidération jusqu\'à 10 m et nuage instantané', async () => {
    const { t, ctx, hz } = await setup();
    const booms = record(ctx, 'explosion');
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
    arm(t, crs, 'grenade_gm2l', 1);
    const at2 = spawn(ctx, 'manifestant', 2, 60);
    const at6 = spawn(ctx, 'manifestant', -6, 60);
    const at9 = spawn(ctx, 'manifestant', 0, 69);
    const at14 = spawn(ctx, 'manifestant', 0, 74);
    const masked = spawn(ctx, 'manifestant', 0, 58);
    masked.gasProtection = 1;
    ctx.people.rebuildIndex();
    const sol = aimAt(ctx, crs, 0, 0, 60)!;
    expect(ctx.actions.use(crs).ok).toBe(true);
    expect(ctx.law.forceLog[0]).toMatchObject({ means: 'gm2l' });
    expect(Math.hypot(ctx.law.forceLog[0]!.x, ctx.law.forceLog[0]!.z - 60)).toBeLessThan(1); // déclarée au point de chute
    t.step(sol.flightTime + 1);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('gm2l');
    expect(booms[0]!.radius).toBe(10);
    expect(Math.hypot(booms[0]!.x, booms[0]!.z - 60)).toBeLessThan(2);
    expect(at2.stun).toBeGreaterThan(3);
    expect(at6.stun).toBeGreaterThan(0.3);
    expect(at6.stun).toBeLessThan(at2.stun);
    expect(at9.stun).toBeGreaterThan(0);
    expect(at9.stun).toBeLessThan(at6.stun);
    expect(at14.stun).toBe(0);
    expect(at2.health).toBeLessThan(100); // souffle à très courte distance
    expect(at6.health).toBe(100);
    // nuage instantané de 5 m de rayon ; le gaz saisit ceux qui n'ont pas de protection
    expect(hz.gas.length).toBe(1);
    expect(hz.gas[0]!.radius).toBe(5);
    expect(at2.gas).toBeGreaterThan(0.3);
    expect(masked.gas).toBe(0);
    expect(masked.stun).toBeGreaterThan(1);
    expect(ctx.projectiles.list.length).toBe(0);
  });
});

describe('mortier d\'artifice, bouteille, fumigène, fusée', () => {
  it('mortier : tir tendu rapide, explosion lumineuse, brûlure légère et étourdissement', async () => {
    const { t, ctx, items } = await setup();
    const booms = record(ctx, 'explosion');
    const hurts = record(ctx, 'person:hurt');
    const fx = record(ctx, 'fx');
    const shooter = spawn(ctx, 'manifestant', 0, 0);
    arm(t, shooter, 'mortier');
    const crs = spawn(ctx, 'crs', 0, 30, Math.PI);
    const beside = spawn(ctx, 'crs', 1.5, 30.5, Math.PI);
    const away = spawn(ctx, 'crs', 8, 30, Math.PI);
    ctx.people.rebuildIndex();
    const sol = aimAt(ctx, shooter, crs.x, crs.y + 1.1, crs.z)!;
    expect(sol.flightTime).toBeLessThan(0.7); // ≈ 60 m/s
    const r = ctx.actions.use(shooter);
    expect(ctx.projectiles.get(r.projectileId!)!.kind).toBe('mortier');
    expect(ctx.actions.activeItem(shooter)!.count).toBe(5);
    t.step(1);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('mortier');
    expect(Math.hypot(booms[0]!.x - crs.x, booms[0]!.z - crs.z)).toBeLessThan(0.6); // explose au contact
    expect(fx.some((f) => f.id === 'feu_artifice' && typeof f.color === 'number')).toBe(true);
    const burns = hurts.filter((h) => h.info.kind === 'burn');
    expect(burns.map((h) => h.id)).toContain(crs.id);
    expect(burns.map((h) => h.id)).toContain(beside.id);
    expect(crs.stun).toBeGreaterThan(0.8);
    expect(beside.stun).toBeGreaterThan(0);
    expect(away.stun).toBe(0);
    expect(100 - crs.health).toBeGreaterThan(5);
    expect(100 - crs.health).toBeLessThan(25); // brûlure légère, pas une arme létale
    expect(shooter.offenses.map((o) => o.type)).toContain('violence_agent');

    // sans obstacle : il éclate en l'air après ≈ 0,9 s, entre 30 et 60 m
    const lone = spawn(ctx, 'manifestant', 200, 0);
    arm(t, lone, 'mortier');
    face(lone, 0, 0.12);
    booms.length = 0;
    ctx.actions.use(lone);
    t.step(1.5);
    expect(booms.length).toBe(1);
    expect(booms[0]!.z).toBeGreaterThan(30);
    expect(booms[0]!.z).toBeLessThan(60);
    expect(booms[0]!.y).toBeGreaterThan(1);

    // imprécis : avec la dispersion réelle, les tirs s'écartent de plusieurs mètres à 45 m
    items.tuning.dispersion = 1;
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      booms.length = 0;
      t.step(1.6);
      ctx.actions.use(lone);
      t.step(1.5);
      xs.push(booms[0]!.x - 200);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
  });

  it('bouteille : elle éclate et ses éclats touchent les jambes des voisins', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const fx = record(ctx, 'fx');
    const thrower = spawn(ctx, 'manifestant', 0, 0);
    arm(t, thrower, 'bouteille');
    const close = spawn(ctx, 'crs', 0.8, 14, Math.PI);
    const far = spawn(ctx, 'crs', 4, 14, Math.PI);
    ctx.people.rebuildIndex();
    const id = throwAt(ctx, thrower, 0, 0, 14);
    t.step(2.5);
    expect(ctx.projectiles.get(id)).toBeUndefined();
    expect(fx.some((f) => f.id === 'eclats_verre')).toBe(true);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.id).toBe(close.id);
    expect(hurts[0]!.info.zone).toBeLessThan(0.45);
    expect(hurts[0]!.info.amount).toBeGreaterThan(0.5);
    expect(hurts[0]!.info.amount).toBeLessThan(4);
    expect(far.health).toBe(100);
  });

  it('fumigène : une minute de fumée colorée, noire pour le bloc', async () => {
    const { t, ctx, hz } = await setup();
    const m = spawn(ctx, 'manifestant', 0, 0);
    arm(t, m, 'fumigene');
    const id = throwAt(ctx, m, 0, 0, 12);
    const torch = ctx.projectiles.get(id)!;
    expect(torch.emitting).toBe(true); // allumé dès le lancer
    t.step(10);
    expect(hz.smoke.length).toBeGreaterThan(40);
    expect(hz.smoke[0]!.color).toBe(0xd62828);
    expect(hz.gas.length).toBe(0);
    expect(torch.resting && torch.pickable).toBe(true);
    t.step(52);
    expect(torch.emitting).toBe(false);
    const total = hz.smoke.reduce((s, c) => s + c.amount, 0);
    expect(total).toBeCloseTo(60 * 0.5, 0);
    t.step(10);
    expect(ctx.projectiles.list.length).toBe(0);
    expect(m.offenses.length).toBe(0); // un fumigène de cortège n'est pas un jet de projectile

    const radical = spawn(ctx, 'manifestant', 50, 0);
    radical.profile = 'radical';
    arm(t, radical, 'fumigene');
    hz.smoke.length = 0;
    throwAt(ctx, radical, 50, 0, 10);
    t.step(3);
    expect(hz.smoke[0]!.color).toBe(0x1a1a1a);
  });

  it('fusée de sommation : étoile rouge à 60–80 m de haut', async () => {
    const { t, ctx } = await setup();
    const booms = record(ctx, 'explosion');
    const fx = record(ctx, 'fx');
    const used = record(ctx, 'item:used');
    const commissaire = spawn(ctx, 'commissaire', 0, 0);
    arm(t, commissaire, 'fusee_sommation', 2);
    face(commissaire, 0, 0); // même en regardant devant soi, elle part vers le ciel
    expect(ctx.actions.use(commissaire).ok).toBe(true);
    expect(used.map((u) => u.item)).toEqual(['fusee_sommation']);
    t.step(3);
    expect(booms.length).toBe(0);
    t.step(1);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('fusee_rouge');
    expect(booms[0]!.y).toBeGreaterThan(60);
    expect(booms[0]!.y).toBeLessThan(90);
    const star = fx.find((f) => f.id === 'feu_artifice')!;
    expect(star.color).toBe(0xff2a1a);
    expect(star.seconds).toBe(6);
    expect(ctx.projectiles.list.length).toBe(0);
    expect(ctx.law.forceLog.length).toBe(0); // un signal, pas un moyen de force
    expect(ctx.actions.has(commissaire, 'fusee_sommation')).toBe(1);
  });

  it('œuf de peinture et débris lancés par un autre module', async () => {
    const { t, ctx } = await setup();
    const fx = record(ctx, 'fx');
    const egg = ctx.projectiles.spawn('oeuf_peinture', 0, 0, 1.6, 0, 0, 3, 10);
    const junk = ctx.projectiles.spawn('debris', 0, 5, 1.6, 0, 6, 3, 0);
    const odd = ctx.projectiles.spawn('type_inconnu', 0, 9, 1, 0, 0, 2, 4);
    t.step(3);
    expect(ctx.projectiles.get(egg.id)).toBeUndefined();
    expect(fx.some((f) => f.id === 'peinture')).toBe(true);
    expect(junk.resting).toBe(true);
    expect(junk.x).toBeGreaterThan(8);
    expect(odd.resting).toBe(true); // un type inconnu se comporte comme un débris
    t.step(31);
    expect(ctx.projectiles.list.length).toBe(0); // les débris ne restent pas indéfiniment
  });
});

describe('garde-fous', () => {
  it('le nombre de projectiles est borné : les plus anciens objets immobiles cèdent la place', async () => {
    const { t, ctx } = await setup();
    const first = ctx.projectiles.spawn('pave', 0, 0, 0.06, 0, 0, 0, 0);
    t.step(0.5);
    expect(first.resting).toBe(true);
    for (let i = 0; i < 1000; i++) ctx.projectiles.spawn('debris', 0, 5 + (i % 50), 0.04, Math.floor(i / 50), 0, 0, 0);
    expect(ctx.projectiles.list.length).toBeLessThanOrEqual(900);
    expect(ctx.projectiles.get(first.id)).toBeUndefined();
    t.step(1);
    expect(ctx.projectiles.list.length).toBeLessThanOrEqual(900);
  });

  it('une erreur d\'un service extérieur ne condamne que le projectile fautif', async () => {
    const { t, ctx, hz } = await setup();
    const quiet = ctx.projectiles.spawn('pave', 0, 0, 2, 0, 3, 2, 0);
    const palet = ctx.projectiles.spawn('palet_lacrymo', 0, 10, 0.03, 0, 0, 0, 0);
    hz.api.emitGas = () => {
      throw new Error('panne du service de dangers');
    };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      // en mode strict (tests) l'erreur est propagée, après retrait du projectile fautif
      expect(() => t.step(1)).toThrow('panne du service de dangers');
    } finally {
      console.error = original;
    }
    expect(errors.length).toBeGreaterThan(0);
    expect(ctx.projectiles.get(palet.id)).toBeUndefined();
    expect(ctx.projectiles.get(quiet.id)).toBe(quiet);
    t.step(2);
    expect(quiet.resting).toBe(true);
  });
});

describe('décor : murs et toits', () => {
  it('un pavé rebondit contre un mur, une grenade en cloche passe par-dessus', async () => {
    const { t, ctx } = await setup();
    ctx.world = withWalls(ctx.world, [{ ax: -6, az: 10, bx: 6, bz: 10, height: 3 }]);
    const impacts = record(ctx, 'projectile:impact');
    const thrower = spawn(ctx, 'manifestant', 0, 0);
    arm(t, thrower, 'pave', 2);
    // tir tendu vers un point derrière le mur
    face(thrower, 0, 0.05);
    const id = ctx.actions.use(thrower, { power: 1 }).projectileId!;
    t.step(3);
    const wallHit = impacts.find((e) => e.id === id && e.hitKind === 'building');
    expect(wallHit).toBeDefined();
    expect(wallHit!.z).toBeCloseTo(10, 0);
    const stone = ctx.projectiles.get(id)!;
    expect(stone.resting).toBe(true);
    expect(stone.z).toBeLessThan(10);

    // grenade lobée haut : elle franchit les 3 m du mur et retombe derrière
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'grenade_lacrymo');
    face(crs, 0, 0.75);
    const booms = record(ctx, 'explosion');
    ctx.actions.use(crs, { power: 1 });
    t.step(3);
    expect(booms.length).toBe(1);
    expect(booms[0]!.z).toBeGreaterThan(10.5);
  });

  it('une grenade tombée sur un toit y reste', async () => {
    const { t, ctx } = await setup();
    ctx.world = withWalls(
      ctx.world,
      [
        { ax: -10, az: 40, bx: 10, bz: 40, height: 8 }, { ax: -10, az: 80, bx: 10, bz: 80, height: 8 },
        { ax: -10, az: 40, bx: -10, bz: 80, height: 8 }, { ax: 10, az: 40, bx: 10, bz: 80, height: 8 },
      ],
      [{ minX: -10, minZ: 40, maxX: 10, maxZ: 80, height: 8 }],
    );
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
    arm(t, crs, 'grenade_gm2l', 2);
    const booms = record(ctx, 'explosion');
    const impacts = record(ctx, 'projectile:impact');
    const sol = aimAt(ctx, crs, 0, 8, 60)!; // on vise le toit, à 8 m de haut
    const id = ctx.actions.use(crs).projectileId!;
    t.step(sol.flightTime + 1.5);
    const landing = impacts.find((e) => e.id === id && e.hitKind === 'ground')!;
    expect(landing.y).toBeGreaterThan(7.9);
    expect(Math.hypot(landing.x, landing.z - 60)).toBeLessThan(1.5);
    expect(booms.length).toBe(1);
    expect(booms[0]!.y).toBeGreaterThan(7.9);

    // tir trop court : la grenade heurte la façade et retombe dans la rue
    t.step(8);
    ctx.actions.give(crs, 'grenade_gm2l', 1);
    ctx.actions.selectById(crs, 'grenade_gm2l');
    t.step(1);
    aimAt(ctx, crs, 0, 0, 41.5); // point au pied du mur, côté intérieur : trajectoire coupée par la façade
    const id2 = ctx.actions.use(crs).projectileId!;
    t.step(12);
    const facade = impacts.find((e) => e.id === id2 && e.hitKind === 'building');
    expect(facade).toBeDefined();
    expect(booms.length).toBe(2);
    expect(booms[1]!.z).toBeLessThan(40);
    expect(booms[1]!.y).toBeLessThan(3);
  });
});
