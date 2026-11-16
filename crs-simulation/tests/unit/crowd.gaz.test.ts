// Foule — un nuage de gaz lacrymogène (vraies grenades du module du matériel, vrai champ de gaz) est évacué :
// les gens se couvrent le visage, sortent du nuage sans se jeter sous le vent, puis se tiennent à distance.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

describe('foule — gaz lacrymogène', () => {
  it('évacue le nuage en moins d\'une minute et se tient ensuite à distance', async () => {
    const t = createCrowdTest({ seed: 3, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 300, extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0 } }));
    t.run(3);
    // vent d'ouest faible : le nuage dérive vers l'est (+x)
    ctx.env.setWind(1.2, 0);
    const f = core.formation;
    core.corridor.at((f.headS + f.tailS) * 0.5, core.rp);
    const gx = core.rp.x - core.rp.tz * core.rp.center;
    const gz = core.rp.z + core.rp.tx * core.rp.center;
    const before = t.protesters();
    const near0 = before.filter((p) => Math.hypot(p.x - gx, p.z - gz) < 12);
    expect(near0.length).toBeGreaterThan(25);
    const start = new Map(near0.map((p) => [p.id, { x: p.x, z: p.z }]));
    // deux grenades à main au milieu du rassemblement : 12 palets émetteurs
    ctx.projectiles.spawn('grenade_lacrymo_main', 0, gx - 2, 0.3, gz, 0, 0, 0);
    ctx.projectiles.spawn('grenade_lacrymo_main', 0, gx + 2, 0.3, gz + 1, 0, 0, 0);
    let peakExposed = 0;
    let covered = 0;
    for (let k = 0; k < 8; k++) {
      t.run(1);
      const exposed = t.protesters().filter((p) => ctx.hazards.gasAt(p.x, p.z) > 0.08).length;
      if (exposed > peakExposed) peakExposed = exposed;
      covered = Math.max(covered, t.protesters().filter((p) => p.upper === 'cover_face').length);
    }
    // le gaz a bien atteint la foule, et elle a réagi
    expect(peakExposed).toBeGreaterThan(8);
    expect(covered).toBeGreaterThan(5);
    t.run(40);
    const now = t.protesters();
    const inCloud = now.filter((p) => ctx.hazards.gasAt(p.x, p.z) > 0.08);
    const cloudCells = [-12, -6, 0, 6, 12].flatMap((dx) => [-12, -6, 0, 6, 12].map((dz) => ctx.hazards.gasAt(gx + dx, gz + dz)));
    console.log('[foule] gaz : exposés au pic', peakExposed, '| visages couverts', covered, '| encore dans le nuage après 48 s', inCloud.length, '/', now.length,
      '| gaz au centre', Math.max(...cloudCells).toFixed(2));
    // le nuage existe encore (émission de 30 s) mais il est vide
    expect(Math.max(...cloudCells)).toBeGreaterThan(0.1);
    expect(inCloud.length).toBeLessThanOrEqual(Math.ceil(now.length * 0.03));
    // plus personne au contact d'un palet qui fume encore
    const palets = ctx.projectiles.list.filter((q) => q.emitting);
    expect(palets.length).toBeGreaterThan(4);
    expect(now.filter((p) => palets.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 4)).length).toBeLessThanOrEqual(2);
    // ceux qui étaient au cœur du nuage sont sortis sans se jeter sous le vent (vers l'est)
    let downwind = 0;
    let moved = 0;
    for (const p of now) {
      const s0 = start.get(p.id);
      if (!s0) continue;
      const dx = p.x - s0.x;
      const dz = p.z - s0.z;
      if (Math.hypot(dx, dz) < 6) continue;
      moved++;
      if (dx > 0.8 * Math.hypot(dx, dz)) downwind++;
    }
    expect(moved).toBeGreaterThan(near0.length * 0.6);
    expect(downwind).toBeLessThan(moved * 0.3);
    // personne dans un mur, personne à terre asphyxié
    for (const p of now) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    expect(now.filter((p) => p.gas > 0.6).length).toBe(0);
    // la peur est montée chez ceux qui ont été gazés ; les familles s'en vont
    const fear = near0.map((p) => p.fear).reduce((a, b) => a + b, 0) / near0.length;
    expect(fear).toBeGreaterThan(0.05);
    expect(now.filter((p) => (brainOf(p)!.flags & 64) !== 0).length + ctx.director.stats.dispersed).toBeGreaterThan(0);
  }, 300_000);
});
