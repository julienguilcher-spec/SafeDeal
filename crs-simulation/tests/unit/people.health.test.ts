// Santé : zones et protections, bouclier, recul et étourdissement, niveaux de blessure, mise à terre et
// relevé, soins, aggravation sans soins, décès (causes graves et violence « réaliste » seulement), effets.
import { describe, expect, it } from 'vitest';
import type { DamageInfo, GameContext, GameEvents, Person } from '@/core/contracts';
import { createNullActions } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleHealthApi } from '@/sim/people';

async function setup(violence: 'sobre' | 'realiste' = 'realiste'): Promise<TestContext> {
  const t = createTestContext({ modules: [createSystems] });
  t.ctx.settings.set('violence', violence);
  await t.start();
  return t;
}

const actions = createNullActions();

/** CRS face au sud (cap 0), bouclier en main. */
function shieldBearer(ctx: GameContext, x = 0, raised = true): Person {
  const p = ctx.people.spawn({ kind: 'crs', x, z: 0, heading: 0 });
  actions.give(p, 'bouclier', 1);
  actions.select(p, 0);
  p.alt = raised;
  return p;
}

/** Pavé : 25 points, direction de vol (dirX, dirZ), à hauteur de torse par défaut. */
function pave(x: number, z: number, dirX: number, dirZ: number, zone?: number): DamageInfo {
  return { amount: 25, kind: 'impact', sourceId: 0, item: 'pave', x, z, dirX, dirZ, zone };
}

function record<K extends keyof GameEvents>(ctx: GameContext, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  ctx.events.on(name, (e) => out.push({ ...e }));
  return out;
}

describe('bouclier', () => {
  it('bloque un pavé venant de face, pas un pavé venant de dos', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const hurt = record(ctx, 'person:hurt');
    const sfx = record(ctx, 'sfx');
    const blocked: unknown[] = [];
    ctx.events.onAny('people:blocked', (e) => blocked.push(e));

    const front = shieldBearer(ctx, 0);
    // le CRS regarde vers le sud (+z) ; le pavé arrive du sud, donc vole vers le nord (dirZ = −1)
    ctx.health.hurt(front, pave(0, 0.3, 0, -1));
    expect(front.health).toBe(100);
    expect(front.injury).toBe('none');
    expect(hurt.length).toBe(0);
    expect(blocked.length).toBe(1);
    expect(sfx.filter((s) => s.id === 'impact_bouclier').length).toBe(1);
    expect(front.stamina).toBeLessThan(100); // encaisser fatigue le bras
    expect(Math.hypot(front.vx, front.vz)).toBeLessThan(0.3); // presque aucun recul

    const back = shieldBearer(ctx, 10);
    ctx.health.hurt(back, pave(10, -0.3, 0, 1)); // arrive du nord, dans le dos
    expect(back.health).toBeLessThan(96);
    expect(hurt.length).toBe(1);
    expect(hurt[0]!.id).toBe(back.id);
    expect(sfx.filter((s) => s.id === 'impact_bouclier').length).toBe(1);
  });

  it('ne protège que sur ± 70° et seulement levé', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const a = shieldBearer(ctx, 0);
    const deg = (d: number): [number, number] => [-Math.sin((d * Math.PI) / 180), -Math.cos((d * Math.PI) / 180)];
    // 60° sur le côté : encore couvert
    let [dx, dz] = deg(60);
    ctx.health.hurt(a, pave(0, 0, dx, dz));
    expect(a.health).toBe(100);
    // 80° : le pavé passe à côté du bouclier
    [dx, dz] = deg(80);
    ctx.health.hurt(a, pave(0, 0, dx, dz));
    expect(a.health).toBeLessThan(100);

    const lowered = shieldBearer(ctx, 10, false);
    ctx.health.hurt(lowered, pave(10, 0.3, 0, -1));
    expect(lowered.health).toBeLessThan(100);
  });

  it('la direction du coup se déduit de la position de son auteur', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const crs = shieldBearer(ctx, 0);
    const thrower = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 15 }); // au sud, face au bouclier
    ctx.health.hurt(crs, { amount: 25, kind: 'impact', sourceId: thrower.id, x: 0, z: 0 });
    expect(crs.health).toBe(100);
    const behind = ctx.people.spawn({ kind: 'manifestant', x: 0, z: -15 }); // au nord, dans son dos
    ctx.health.hurt(crs, { amount: 25, kind: 'impact', sourceId: behind.id, x: 0, z: 0 });
    expect(crs.health).toBeLessThan(100);
  });

  it('bouclier bas ou parade haute : la tête et les pieds ne sont couverts que dans la bonne posture', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const standing = shieldBearer(ctx, 0);
    ctx.health.hurt(standing, pave(0, 0.3, 0, -1, 0.97)); // en pleine tête : au-dessus du bouclier
    expect(standing.health).toBeLessThan(100);

    const parry = shieldBearer(ctx, 10);
    parry.aimPitch = 0.4; // visée levée : parade haute
    ctx.health.hurt(parry, pave(10, 0.3, 0, -1, 0.97));
    expect(parry.health).toBe(100);
    ctx.health.hurt(parry, pave(10, 0.3, 0, -1, 0.05)); // …mais les jambes sont découvertes
    expect(parry.health).toBeLessThan(100);

    const crouched = shieldBearer(ctx, 20);
    crouched.posture = 'crouch';
    ctx.health.hurt(crouched, pave(20, 0.3, 0, -1, 0.97));
    ctx.health.hurt(crouched, pave(20, 0.3, 0, -1, 0.05));
    expect(crouched.health).toBe(100);
  });

  it('un coup de bâton passe très réduit ; une voiture ne s\'arrête pas avec un bouclier', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const a = shieldBearer(ctx, 0);
    const b = shieldBearer(ctx, 10, false);
    const blow: DamageInfo = { amount: 30, kind: 'blunt', sourceId: 0, x: 0, z: 1, dirX: 0, dirZ: -1 };
    ctx.health.hurt(a, blow);
    ctx.health.hurt(b, { ...blow, x: 10 });
    expect(100 - a.health).toBeCloseTo((100 - b.health) * 0.1, 3);
    const c = shieldBearer(ctx, 20);
    ctx.health.hurt(c, { amount: 40, kind: 'vehicle', sourceId: 0, x: 20, z: 2, dirX: 0, dirZ: -1 });
    expect(c.health).toBeLessThan(75);
  });
});

describe('zones et protections', () => {
  it('le casque protège la tête, le gilet le tronc, les jambières en partie les jambes', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const dmg = (kind: Person['kind'], zone: number, x: number): number => {
      const p = ctx.people.spawn({ kind, x, z: 0 });
      ctx.health.hurt(p, { amount: 20, kind: 'impact', sourceId: 0, x, z: -1, dirX: 0, dirZ: 1, zone });
      return 100 - p.health;
    };
    // sans protection : tête × 1,6, tronc × 1, jambes × 0,7
    expect(dmg('manifestant', 0.95, 0)).toBeCloseTo(32, 5);
    expect(dmg('manifestant', 0.6, 10)).toBeCloseTo(20, 5);
    expect(dmg('manifestant', 0.2, 20)).toBeCloseTo(14, 5);
    // CRS : casque 0,85, gilet 0,7 ; la protection joue à 85 % contre un impact
    expect(dmg('crs', 0.95, 30)).toBeCloseTo(32 * (1 - 0.85 * 0.85), 5);
    expect(dmg('crs', 0.6, 40)).toBeCloseTo(20 * (1 - 0.7 * 0.85), 5);
    expect(dmg('crs', 0.2, 50)).toBeCloseTo(14 * (1 - 0.7 * 0.6 * 0.85), 5);
  });

  it('un coup à la tête étourdit, davantage sans casque ; le recul suit la direction du coup', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const bare = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const helmet = ctx.people.spawn({ kind: 'crs', x: 10, z: 0 });
    for (const p of [bare, helmet]) {
      ctx.health.hurt(p, { amount: 12, kind: 'impact', sourceId: 0, x: p.x - 1, z: 0, dirX: 1, dirZ: 0, zone: 0.95 });
    }
    expect(bare.stun).toBeGreaterThan(0.8);
    expect(helmet.stun).toBeLessThan(bare.stun * 0.4);
    expect(bare.vx).toBeGreaterThan(0.3);
    expect(bare.vz).toBe(0);
    // l'étourdissement s'écoule avec le temps
    const s0 = bare.stun;
    t.step(0.5);
    expect(bare.stun).toBeCloseTo(s0 - 0.5, 2);
    // étourdissement et recul fournis par l'appelant (grenade assourdissante)
    const q = ctx.people.spawn({ kind: 'manifestant', x: 20, z: 0 });
    ctx.health.hurt(q, { amount: 5, kind: 'blast', sourceId: 0, x: 20, z: -2, stun: 4, knockback: 2 });
    expect(q.stun).toBe(4);
    expect(q.vz).toBeCloseTo(2 / q.look.build, 5);
  });
});

describe('blessures, mise à terre, soins', () => {
  it('les niveaux de blessure suivent les points de vie, avec les événements person:hurt', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const hurt = record(ctx, 'person:hurt');
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const hit = (amount: number): void => ctx.health.hurt(p, { amount, kind: 'blunt', sourceId: 0, x: 0, z: 0 });
    hit(10);
    expect([p.health, p.injury]).toEqual([90, 'none']);
    hit(20);
    expect([p.health, p.injury]).toEqual([70, 'light']);
    hit(22);
    expect([p.health, p.injury]).toEqual([48, 'serious']);
    expect(hurt.map((h) => h.healthAfter)).toEqual([90, 70, 48]);
    expect(ctx.health.isIncapacitated(p)).toBe(false);
  });

  it('un coup violent jette à terre ; on se relève seul quelques secondes plus tard', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const down = record(ctx, 'person:down');
    const up = record(ctx, 'person:recovered');
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    p.cmd.moveZ = 1;
    ctx.health.hurt(p, { amount: 28, kind: 'impact', sourceId: 77, x: 0, z: -1, dirX: 0, dirZ: 1 });
    expect(p.posture).toBe('down');
    expect(down).toEqual([{ id: p.id, injury: 'light', sourceId: 77 }]);
    expect(ctx.health.isIncapacitated(p)).toBe(true);
    expect(p.cmd.moveZ).toBe(0);
    t.step(2);
    expect(p.posture).toBe('down');
    t.step(4);
    expect(p.posture).toBe('stand');
    expect(up).toEqual([{ id: p.id }]);
  });

  it("en dessous de 25 points de vie on reste à terre jusqu'aux soins, et la blessure s'aggrave", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const treated = record(ctx, 'person:treated');
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    ctx.health.hurt(p, { amount: 80, kind: 'blunt', sourceId: 0, x: 0, z: 0 });
    expect([p.health, p.injury, p.posture]).toEqual([20, 'critical', 'down']);
    t.step(20);
    expect(p.posture).toBe('down');
    // état critique sans soins : ≈ 0,15 point par seconde
    expect(p.health).toBeGreaterThan(16);
    expect(p.health).toBeLessThan(17.6);
    ctx.health.heal(p, 30, 5);
    expect(treated).toEqual([{ id: p.id, byId: 5 }]);
    expect(p.injury).toBe('serious');
    const h = p.health;
    t.step(10);
    expect(p.health).toBe(h); // stabilisée : ne s'aggrave plus
    expect(p.posture).toBe('stand'); // remise sur pied
  });

  it('un blessé grave non soigné se dégrade lentement ; stabilisé, non', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const ext = ctx.require<PeopleHealthApi>('people.health');
    const a = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'manifestant', x: 10, z: 0 });
    for (const p of [a, b]) ctx.health.hurt(p, { amount: 60, kind: 'blunt', sourceId: 0, x: p.x, z: 0 });
    ext.stabilise(b, 9);
    t.step(60);
    expect(a.health).toBeGreaterThan(36);
    expect(a.health).toBeLessThan(37.5); // 0,05 point par seconde
    expect(b.health).toBe(40);
  });

  it('setDown : chute puis relevé ; une personne à terre lâche celui qu\'elle porte', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const carrier = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const detainee = ctx.people.spawn({ kind: 'manifestant', x: 0.5, z: 0 });
    carrier.carrying = detainee.id;
    detainee.heldBy = carrier.id;
    ctx.health.setDown(carrier, true, 3);
    expect(carrier.posture).toBe('down');
    expect(carrier.carrying).toBe(0);
    expect(detainee.heldBy).toBe(0);
    ctx.health.setDown(carrier, false);
    expect(carrier.posture).toBe('stand');
  });
});

describe('décès et effets selon le réglage de violence', () => {
  it('« sobre » : personne ne meurt, même d\'une balle ; pas de sang', async () => {
    const t = await setup('sobre');
    const ctx = t.ctx;
    const fx = record(ctx, 'fx');
    for (let i = 0; i < 30; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: i * 2, z: 0 });
      ctx.health.hurt(p, { amount: 150, kind: 'bullet', sourceId: 0, means: 'arme_feu', x: p.x, z: -5, dirX: 0, dirZ: 1 });
      expect(p.injury).toBe('critical');
      expect(p.health).toBe(1);
      expect(p.posture).toBe('down');
    }
    expect(fx.filter((f) => f.id === 'sang').length).toBe(0);
  });

  it('« réaliste » : une balle peut tuer, un pavé ou un tir de LBD jamais ; le sang est demandé', async () => {
    const t = await setup('realiste');
    const ctx = t.ctx;
    const fx = record(ctx, 'fx');
    const down = record(ctx, 'person:down');
    const died: unknown[] = [];
    ctx.events.onAny('people:died', (e) => died.push(e));
    let dead = 0;
    for (let i = 0; i < 60; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: i * 2, z: 0 });
      ctx.health.hurt(p, { amount: 150, kind: 'bullet', sourceId: 0, means: 'arme_feu', x: p.x, z: -5, dirX: 0, dirZ: 1 });
      expect(p.posture).toBe('down');
      if (p.injury === 'dead') {
        dead++;
        expect(p.health).toBe(0);
      } else {
        expect(p.injury).toBe('critical');
      }
    }
    // probabilité 0,6 par coup mortel
    expect(dead).toBeGreaterThan(22);
    expect(dead).toBeLessThan(50);
    expect(died.length).toBe(dead);
    expect(down.filter((d) => d.injury === 'dead').length).toBe(dead);
    expect(fx.filter((f) => f.id === 'sang').length).toBe(60);
    for (let i = 0; i < 30; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', x: i * 2, z: 20 });
      ctx.health.hurt(p, { amount: 150, kind: 'impact', sourceId: 0, item: 'pave', x: p.x, z: 15, dirX: 0, dirZ: 1 });
      const q = ctx.people.spawn({ kind: 'manifestant', x: i * 2, z: 40 });
      ctx.health.hurt(q, { amount: 150, kind: 'bullet', sourceId: 0, means: 'lbd', x: q.x, z: 35, dirX: 0, dirZ: 1 });
      expect(p.injury).toBe('critical');
      expect(q.injury).toBe('critical');
    }
    // un mort ne reçoit plus rien et ne se soigne pas
    const corpse = ctx.people.list.find((p) => p.injury === 'dead')!;
    ctx.health.heal(corpse, 50, 1);
    ctx.health.hurt(corpse, { amount: 10, kind: 'blunt', sourceId: 0, x: 0, z: 0 });
    expect(corpse.health).toBe(0);
    expect(corpse.injury).toBe('dead');
  });

  it('« réaliste » : un blessé par balle dans un état critique meurt faute de soins ; un blessé par pavé non', async () => {
    const t = await setup('realiste');
    const ctx = t.ctx;
    const shot = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const hit = ctx.people.spawn({ kind: 'manifestant', x: 10, z: 0 });
    // 90 points : critique sans tomber à zéro
    ctx.health.hurt(shot, { amount: 90, kind: 'bullet', sourceId: 0, means: 'arme_feu', x: 0, z: -5, dirX: 0, dirZ: 1 });
    ctx.health.hurt(hit, { amount: 90, kind: 'impact', sourceId: 0, x: 10, z: -5, dirX: 0, dirZ: 1 });
    expect(shot.injury).toBe('critical');
    t.step(90); // 10 points à 0,15 point/s : ≈ 67 s
    expect(shot.injury).toBe('dead');
    expect(hit.injury).toBe('critical');
    expect(hit.health).toBe(1);
  });
});

describe('peur et colère', () => {
  it('la douleur fait peur et met en colère, puis le calme revient', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const civil = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0, profile: 'pacifique' });
    const crs = ctx.people.spawn({ kind: 'crs', x: 10, z: 0 });
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 5 });
    ctx.health.hurt(civil, { amount: 20, kind: 'blunt', sourceId: cop.id, x: 0, z: 0 });
    ctx.health.hurt(crs, { amount: 20, kind: 'blunt', sourceId: 0, x: 10, z: 0, zone: 0.2 });
    expect(civil.fear).toBeCloseTo(0.24, 2);
    expect(civil.anger).toBeCloseTo(20 * 0.009 * 1.5, 3); // coup porté par un autre camp
    expect(crs.fear).toBeLessThan(civil.fear * 0.4); // un policier encaisse mieux
    t.step(45);
    expect(civil.fear).toBeCloseTo(0.12, 1); // demi-vie 45 s
    expect(civil.anger).toBeGreaterThan(0.2); // demi-vie 180 s
  });
});
