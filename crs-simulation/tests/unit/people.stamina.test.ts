// Endurance : le sprint et la course consomment, la marche et l'arrêt rendent du souffle ; effets de la
// charge, du masque à gaz, du gaz respiré, des blessures ; essoufflement.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleLocomotionApi } from '@/sim/people';
import { createFakeActions } from '@/sim/people/testkit';

async function setup(): Promise<TestContext> {
  const t = createTestContext({ modules: [createSystems] });
  await t.start();
  return t;
}

function runner(ctx: GameContext, x: number, gait: 0 | 1 | 2): Person {
  const p = ctx.people.spawn({ kind: 'manifestant', x, z: 0, seed: 3 });
  p.look.backpack = false;
  p.cmd.moveZ = 1;
  p.cmd.gait = gait;
  return p;
}

/** Secondes de sprint avant d'être à bout de souffle. */
function sprintDuration(t: TestContext, p: Person): number {
  const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
  let s = 0;
  while (!loco.isWinded(p) && s < 120) {
    t.step(0.5);
    s += 0.5;
  }
  return s;
}

describe('endurance', () => {
  it('un sprint sans charge tient environ 25 s, puis on est essoufflé et le sprint est refusé', async () => {
    const t = await setup();
    const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const p = runner(t.ctx, 0, 2);
    const winded: number[] = [];
    t.ctx.events.onAny('people:winded', (e) => winded.push((e as { id: number }).id));
    const d = sprintDuration(t, p);
    expect(d).toBeGreaterThan(22);
    expect(d).toBeLessThan(29);
    expect(winded).toEqual([p.id]);
    expect(p.stamina).toBeLessThan(4);
    // essoufflé : on ne dépasse plus la course, et encore, ralentie
    t.step(1.5);
    expect(Math.hypot(p.vx, p.vz)).toBeLessThan(p.speedRun);
    expect(loco.speedLimit(p, 2)).toBeCloseTo(p.speedRun * 0.85, 2);
  });

  it('la récupération dépend de l\'allure : arrêt > marche, et la course ne rend rien', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const still = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0, seed: 3 });
    const walking = runner(ctx, 10, 0);
    const jogging = runner(ctx, 20, 1);
    for (const p of [still, walking, jogging]) {
      p.look.backpack = false;
      p.stamina = 20;
    }
    t.step(5);
    // arrêt : 8 points/s (2 s de course rendues par seconde) ; marche : 4 points/s ; course : −0,8 point/s
    expect(still.stamina).toBeCloseTo(60, 0);
    expect(walking.stamina).toBeGreaterThan(36);
    expect(walking.stamina).toBeLessThan(42);
    expect(jogging.stamina).toBeLessThan(20);
    expect(jogging.stamina).toBeGreaterThan(14);
  });

  it("l'essoufflement dure jusqu'à ce que le souffle soit revenu à 35 %", async () => {
    const t = await setup();
    const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const p = runner(t.ctx, 0, 2);
    sprintDuration(t, p);
    p.cmd.moveZ = 0;
    t.step(2);
    expect(loco.isWinded(p)).toBe(true);
    t.step(4);
    expect(p.stamina).toBeGreaterThan(35);
    expect(loco.isWinded(p)).toBe(false);
  });

  it("le poids de l'équipement raccourcit le sprint et ralentit la récupération", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const actions = createFakeActions(ctx);
    actions.addDef('bouclier', 'defense', 4.5);
    actions.addDef('grenade_lacrymo', 'throwable', 0.35);
    ctx.actions = actions;
    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    const light = runner(ctx, 0, 2);
    const heavy = ctx.people.spawn({ kind: 'crs', x: 10, z: 0, seed: 3 }); // casque et gilet : ≈ 11,5 kg
    actions.give(heavy, 'bouclier', 1);
    actions.give(heavy, 'grenade_lacrymo', 8); // 8 × 0,35 kg
    heavy.cmd.moveZ = 1;
    heavy.cmd.gait = 2;
    t.step(0.1);
    expect(loco.loadOf(light)).toBe(0);
    expect(loco.loadOf(heavy)).toBeCloseTo(0.85 * 2 + 0.7 * 14 + 4.5 + 8 * 0.35, 2);
    // ≈ 19 kg : sprint à ≈ 4,5 m/s au lieu de 5,5
    expect(loco.speedLimit(heavy, 2)).toBeCloseTo(5.5 * (1 - 0.01 * loco.loadOf(heavy)), 2);
    const dLight = sprintDuration(t, light);
    const t2 = await setup();
    const actions2 = createFakeActions(t2.ctx);
    actions2.addDef('bouclier', 'defense', 4.5);
    actions2.addDef('grenade_lacrymo', 'throwable', 0.35);
    t2.ctx.actions = actions2;
    const heavy2 = t2.ctx.people.spawn({ kind: 'crs', x: 0, z: 0, seed: 3 });
    actions2.give(heavy2, 'bouclier', 1);
    actions2.give(heavy2, 'grenade_lacrymo', 8);
    heavy2.cmd.moveZ = 1;
    heavy2.cmd.gait = 2;
    const dHeavy = sprintDuration(t2, heavy2);
    // agent équipé de ≈ 20 kg : ≈ 15 s de course pleine (docs/research/03 §5.5)
    expect(dHeavy).toBeGreaterThan(12);
    expect(dHeavy).toBeLessThan(18.5);
    expect(dHeavy).toBeLessThan(dLight * 0.75);
    // récupération plus lente avec la charge
    heavy2.cmd.moveZ = 0;
    heavy2.stamina = 20;
    t2.step(3);
    expect(heavy2.stamina).toBeLessThan(20 + 3 * 8 * 0.85);
    expect(heavy2.stamina).toBeGreaterThan(20 + 3 * 8 * 0.6);
  });

  it('masque à gaz, gaz respiré et blessures dégradent le souffle', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const mk = (x: number): Person => {
      const p = ctx.people.spawn({ kind: 'manifestant', x, z: 0, seed: 3 });
      p.look.backpack = false;
      p.stamina = 10;
      return p;
    };
    const ref = mk(0);
    const masked = mk(10);
    masked.look.gasMask = true;
    const gassed = mk(20);
    const hurt = mk(30);
    hurt.injury = 'serious';
    hurt.health = 40;
    for (let k = 0; k < 30; k++) {
      t.step(0.1);
      gassed.gas = 1; // maintenu dans le nuage
    }
    const gain = (p: Person): number => p.stamina - 10;
    expect(gain(ref)).toBeCloseTo(24, 0);
    expect(gain(masked)).toBeCloseTo(24 * 0.7, 0);
    expect(gain(gassed)).toBeCloseTo(24 * 0.7, 0);
    expect(gain(hurt)).toBeLessThan(24 * 0.55);
    // et le masque fait consommer plus en courant
    const a = runner(ctx, 40, 2);
    const b = runner(ctx, 50, 2);
    b.look.gasMask = true;
    t.step(8);
    expect(100 - b.stamina).toBeGreaterThan((100 - a.stamina) * 1.1);
  });

  it('le saut coûte du souffle et est refusé quand on est à bout', async () => {
    const t = await setup();
    const loco = t.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const p = t.ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    p.stamina = 3;
    p.cmd.jump = true;
    t.step(1 / 30);
    expect(loco.isAirborne(p)).toBe(false);
    p.stamina = 50;
    p.cmd.jump = true;
    t.step(1 / 30);
    expect(loco.isAirborne(p)).toBe(true);
    expect(p.stamina).toBeLessThan(45);
  });
});
