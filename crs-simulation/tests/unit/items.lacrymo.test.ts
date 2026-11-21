// Matériel — cycle complet d'une grenade lacrymogène : lancer, éclatement en palets, émission de gaz
// vers un service de dangers factice, renvoi d'un palet, extinction.
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems, ITEMS_SERVICE } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { aimAt, createHazardRecorder, face, record, spawn } from '@/sim/items/testkit';
import type { HazardRecorder } from '@/sim/items/testkit';

async function setup(seed = 3): Promise<{ t: TestContext; ctx: GameContext; hz: HazardRecorder; items: ItemsApi }> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start();
  const ctx = t.ctx;
  const hz = createHazardRecorder(ctx);
  ctx.hazards = hz.api;
  return { t, ctx, hz, items: ctx.require<ItemsApi>(ITEMS_SERVICE) };
}

describe('grenade lacrymogène à main', () => {
  it('cycle complet : retard, six palets dispersés, trente secondes de gaz, puis plus rien', async () => {
    const { t, ctx, hz, items } = await setup();
    items.tuning.dispersion = 0;
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['grenade_lacrymo']);
    ctx.actions.selectById(crs, 'grenade_lacrymo');
    t.step(1);
    const spawned = record(ctx, 'projectile:spawned');
    const booms = record(ctx, 'explosion');
    const removed = record(ctx, 'projectile:removed');
    const used = record(ctx, 'item:used');
    const sfx = record(ctx, 'sfx');
    const sol = aimAt(ctx, crs, 0, 0, 20)!;
    const r = ctx.actions.use(crs, { power: sol.power });
    expect(r.ok).toBe(true);
    const grenade = ctx.projectiles.get(r.projectileId!)!;
    expect(grenade.kind).toBe('grenade_lacrymo_main');
    expect(grenade.ownerId).toBe(crs.id);
    // retard d'allumage ≈ 2,2 s ; en vol elle n'est ni ramassable ni émettrice
    expect(grenade.fuse).toBeGreaterThan(2);
    expect(grenade.fuse).toBeLessThan(2.4);
    expect(grenade.pickable).toBe(false);
    expect(grenade.emitting).toBe(false);
    expect(used).toEqual([{ personId: crs.id, item: 'grenade_lacrymo', x: 0, z: 0, targetId: 0 }]);
    expect(sfx.some((s) => s.id === 'grenade_lancer')).toBe(true);
    expect(crs.upper).toBe('throw');

    // avant la fin du retard : aucun gaz
    t.step(1.9);
    expect(booms.length).toBe(0);
    expect(hz.gas.length).toBe(0);
    expect(ctx.projectiles.list.length).toBe(1);

    // éclatement : le corps disparaît, six palets partent
    t.step(0.6);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('grenade_lacrymo_main');
    expect(Math.hypot(booms[0]!.x, booms[0]!.z - 20)).toBeLessThan(5);
    expect(removed.map((e) => e.id)).toContain(grenade.id);
    const palets = ctx.projectiles.list.filter((p) => p.kind === 'palet_lacrymo');
    expect(palets.length).toBe(6);
    expect(spawned.filter((e) => e.kind === 'palet_lacrymo').length).toBe(6);
    for (const p of palets) {
      expect(p.emitting).toBe(true);
      expect(p.ownerId).toBe(crs.id);
    }

    // les palets retombent, roulent et s'immobilisent, dispersés sur quelques mètres
    t.step(5);
    for (const p of palets) {
      expect(p.resting).toBe(true);
      expect(p.pickable).toBe(true);
      expect(p.y).toBeCloseTo(0.025, 3);
    }
    const dists = palets.map((p) => Math.hypot(p.x - booms[0]!.x, p.z - booms[0]!.z));
    expect(Math.min(...dists)).toBeGreaterThan(2);
    expect(Math.max(...dists)).toBeLessThan(16);
    // dispersés tout autour, pas en tas : au moins 6 m entre les deux plus éloignés
    let widest = 0;
    for (const a of palets) for (const b of palets) widest = Math.max(widest, Math.hypot(a.x - b.x, a.z - b.z));
    expect(widest).toBeGreaterThan(6);

    // gaz : chaque palet dépose à sa position, cinq fois par seconde
    expect(hz.gas.length).toBeGreaterThan(100);
    const last = hz.gas[hz.gas.length - 1]!;
    expect(last.radius).toBe(items.tuning.paletGasRadius);
    expect(palets.some((p) => Math.hypot(p.x - last.x, p.z - last.z) < 1e-9)).toBe(true);

    // 30 s d'émission par palet (docs/research/02 §3.1)
    t.step(20);
    expect(palets.every((p) => p.emitting)).toBe(true);
    t.step(6);
    expect(palets.every((p) => !p.emitting && !p.pickable)).toBe(true);
    const total = hz.gas.reduce((s, c) => s + c.amount, 0);
    expect(total).toBeCloseTo(6 * 30 * items.tuning.paletGasRate, 0);
    const emitWindow = hz.gas[hz.gas.length - 1]!.t - hz.gas[0]!.t;
    expect(emitWindow).toBeGreaterThan(29);
    expect(emitWindow).toBeLessThan(30.5);
    const calls = hz.gas.length;

    // palets éteints : ils restent un instant au sol puis disparaissent ; plus aucun gaz
    t.step(10);
    expect(hz.gas.length).toBe(calls);
    expect(ctx.projectiles.list.length).toBe(0);
    expect(removed.length).toBe(7);
    // la pose de lancer a laissé place à la pose de repos
    expect(crs.upper).toBe('none');
  });

  it('un palet se renvoie : interaction « renvoyer », événement projectile:returned, le nuage suit', async () => {
    const { t, ctx, hz, items } = await setup();
    items.tuning.dispersion = 0;
    items.tuning.returnSuccess = 1;
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['grenade_lacrymo']);
    ctx.actions.selectById(crs, 'grenade_lacrymo');
    t.step(1);
    const sol = aimAt(ctx, crs, 0, 0, 20)!;
    ctx.actions.use(crs, { power: sol.power });
    t.step(8);
    const palets = ctx.projectiles.list.filter((p) => p.kind === 'palet_lacrymo');
    expect(palets.length).toBe(6);
    const palet = palets[0]!;
    expect(ctx.projectiles.nearestPickable(palet.x, palet.z, 0.5)).toBe(palet);

    // un manifestant s'approche du palet, face à la ligne de police
    const m = spawn(ctx, 'manifestant', palet.x + 0.6, palet.z + 0.4);
    face(m, Math.atan2(crs.x - m.x, crs.z - m.z), 0.2);
    ctx.people.rebuildIndex();
    const options: import('@/core/contracts').InteractionOption[] = [];
    expect(ctx.interactions.options(m, options)).toBe(1);
    expect(options[0]!.verb).toBe('renvoyer');
    expect(options[0]!.targetId).toBe(palet.id);
    expect(options[0]!.label).toBe('Renvoyer le palet');

    const returned = record(ctx, 'projectile:returned');
    const before = { x: palet.x, z: palet.z };
    expect(ctx.interactions.startVerb(m, 'renvoyer', palet.id)).toBe(true);
    t.step(0.5);
    expect(returned.length).toBe(0); // le geste dure 0,7 s
    t.step(0.3);
    expect(returned).toEqual([{ id: palet.id, byId: m.id }]);
    // reparti en vol vers les CRS, sous un nouveau propriétaire, toujours fumant
    expect(palet.resting).toBe(false);
    expect(palet.pickable).toBe(false);
    expect(palet.ownerId).toBe(m.id);
    expect(palet.emitting).toBe(true);
    expect(m.gas).toBeGreaterThan(0.1); // il a respiré le palet
    expect(m.offenses.map((o) => o.type)).toContain('jet_projectile');

    t.step(4);
    expect(palet.resting).toBe(true);
    const travelled = Math.hypot(palet.x - before.x, palet.z - before.z);
    const closer = Math.hypot(before.x - crs.x, before.z - crs.z) - Math.hypot(palet.x - crs.x, palet.z - crs.z);
    expect(travelled).toBeGreaterThan(6);
    expect(closer).toBeGreaterThan(5);
    // le gaz est maintenant déposé là où le palet a été renvoyé
    const recent = hz.gas.slice(-12);
    expect(recent.some((c) => Math.hypot(c.x - palet.x, c.z - palet.z) < 1e-9)).toBe(true);
    // les cinq autres palets n'ont pas bougé
    expect(palets.filter((p) => p !== palet).every((p) => p.resting && p.ownerId === crs.id)).toBe(true);
  });

  it('un PNJ rate parfois son renvoi ; le service étendu et la raquette renvoient aussi', async () => {
    const { t, ctx, items } = await setup();
    items.tuning.dispersion = 0;
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['grenade_lacrymo']);
    ctx.actions.selectById(crs, 'grenade_lacrymo');
    t.step(1);
    const sol = aimAt(ctx, crs, 0, 0, 20)!;
    ctx.actions.use(crs, { power: sol.power });
    t.step(8);
    const palets = ctx.projectiles.list.filter((p) => p.kind === 'palet_lacrymo');
    const returned = record(ctx, 'projectile:returned');

    // raté garanti : le palet échappe et roule à quelques mètres
    items.tuning.returnSuccess = 0;
    const a = palets[0]!;
    const clumsy = spawn(ctx, 'manifestant', a.x, a.z + 0.5);
    face(clumsy, Math.PI, 0);
    const ax = a.x;
    const az = a.z;
    expect(items.returnProjectile(clumsy, a.id)).toBe(false);
    expect(returned.length).toBe(0);
    t.step(3);
    const slip = Math.hypot(a.x - ax, a.z - az);
    expect(slip).toBeGreaterThan(0.5);
    expect(slip).toBeLessThan(6);
    // trop loin : impossible
    const far = spawn(ctx, 'manifestant', a.x + 10, a.z);
    expect(items.returnProjectile(far, a.id)).toBe(false);
    // le joueur, lui, réussit toujours
    const b = palets[1]!;
    const player = spawn(ctx, 'manifestant', b.x, b.z - 0.5);
    player.isPlayer = true;
    face(player, Math.PI, 0.3);
    expect(items.returnProjectile(player, b.id, 1)).toBe(true);
    expect(returned.length).toBe(1);

    // raquette : revers sur le palet le plus proche
    const c = palets[2]!;
    const tennis = spawn(ctx, 'manifestant', c.x + 0.4, c.z, 0, ['raquette']);
    ctx.actions.selectById(tennis, 'raquette');
    t.step(1);
    face(tennis, Math.PI, 0.2);
    const cz = c.z;
    const r = ctx.actions.use(tennis);
    expect(r.ok).toBe(true);
    expect(r.projectileId).toBe(c.id);
    expect(returned.length).toBe(2);
    expect(returned[1]).toEqual({ id: c.id, byId: tennis.id });
    t.step(5);
    expect(cz - c.z).toBeGreaterThan(12); // renvoyé vers −z, plus loin qu'à la main
    // sans rien à portée, la raquette ne frappe pas dans le vide
    const alone = spawn(ctx, 'manifestant', 300, 300, 0, ['raquette']);
    ctx.actions.selectById(alone, 'raquette');
    t.step(1);
    expect(ctx.actions.use(alone)).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('grenade lacrymogène tirée au lanceur de 56 mm', () => {
  it('s\'ouvre en l\'air au-dessus de la cible et ses palets retombent autour d\'elle', async () => {
    for (const d of [50, 100]) {
      const { t, ctx, hz, items } = await setup();
      items.tuning.dispersion = 0;
      const crs = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
      ctx.actions.selectById(crs, 'lanceur_cougar');
      t.step(1.5);
      const booms = record(ctx, 'explosion');
      const sol = aimAt(ctx, crs, 0, 0, d)!;
      const r = ctx.actions.use(crs);
      expect(ctx.projectiles.get(r.projectileId!)!.kind).toBe('grenade_lacrymo_56');
      t.step(sol.flightTime + 6);
      expect(booms.length).toBe(1);
      // ouverture en l'air, quelques mètres avant le point de chute
      expect(booms[0]!.y).toBeGreaterThan(1.5);
      expect(booms[0]!.y).toBeLessThan(12);
      expect(Math.hypot(booms[0]!.x, booms[0]!.z - d)).toBeLessThan(9);
      const palets = ctx.projectiles.list.filter((p) => p.kind === 'palet_lacrymo');
      expect(palets.length).toBe(6);
      const cx = palets.reduce((s, p) => s + p.x, 0) / 6;
      const cz = palets.reduce((s, p) => s + p.z, 0) / 6;
      const radii = palets.map((p) => Math.hypot(p.x - cx, p.z - cz));
      console.log(`[lacrymo 56] ${d} m : ouverture à ${booms[0]!.y.toFixed(1)} m de haut, centre des palets à ${Math.hypot(cx, cz - d).toFixed(1)} m de la cible, palets à ${Math.min(...radii).toFixed(1)}–${Math.max(...radii).toFixed(1)} m du centre`);
      // la gerbe est centrée sur la cible et couvre un disque de 5 à 15 m de rayon
      expect(Math.hypot(cx, cz - d)).toBeLessThan(3);
      expect(Math.max(...radii)).toBeGreaterThan(5);
      expect(Math.max(...radii)).toBeLessThan(15);
      expect(hz.gas.length).toBeGreaterThan(50);
      // rechargement : 8 s (6 à 8 coups par minute)
      expect(ctx.actions.activeItem(crs)!.count).toBe(7);
    }
  });

  it('une grenade tirée par un autre module (tourelle) reçoit le même comportement', async () => {
    const { t, ctx, hz } = await setup();
    const booms = record(ctx, 'explosion');
    // tir en cloche depuis un toit de véhicule, sans passer par ctx.actions
    const g = ctx.projectiles.spawn('grenade_lacrymo_56', 0, 0, 3, 0, 0, 20, 20);
    expect(Number.isFinite(g.fuse)).toBe(true);
    expect(g.fuse).toBeGreaterThan(3);
    t.step(g.fuse + 6);
    expect(booms.length).toBe(1);
    expect(booms[0]!.y).toBeGreaterThan(1);
    expect(ctx.projectiles.list.filter((p) => p.kind === 'palet_lacrymo').length).toBe(6);
    expect(hz.gas.length).toBeGreaterThan(50);
  });
});
