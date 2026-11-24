import { describe, expect, it } from 'vitest';
import { AuxView } from '@/render/base/auxView';
import { DroneFeedSystem } from '@/ui/drone';

/**
 * Constaté en jeu (sonde Playwright tests/e2e/sonde-drone-visee.mjs, mission cdt-02) : drone à 61 m, foule la plus dense
 * à 81 m derrière un immeuble de 23 m ; la nacelle visait cette foule invisible et le centre de l'image tombait sur
 * une toiture — « on ne voit pas vraiment ». Elle doit viser la foule qu'elle voit.
 */
describe('retour vidéo du drone — point visé visible', () => {
  function scene() {
    const people: { id: number; x: number; y: number; z: number; faction: string; dormant: boolean; health: number }[] = [];
    let id = 1;
    // foule A : 60 personnes à 80 m à l'est, derrière un immeuble (x de 40 à 70 m, 23 m de haut)
    for (let i = 0; i < 60; i++) people.push({ id: id++, x: 80 + (i % 8) - 4, y: 0, z: Math.floor(i / 8) - 4, faction: 'protest', dormant: false, health: 1 });
    // foule B : 20 personnes à 22 m à l'ouest, à découvert
    for (let i = 0; i < 20; i++) people.push({ id: id++, x: -22 + (i % 5) - 2, y: 0, z: Math.floor(i / 5) - 2, faction: 'protest', dormant: false, health: 1 });
    const drone = { id: 7, kind: 'drone', faction: 'police', dormant: false, state: 'ok', def: { flying: true }, x: 0, y: 61, z: 0, heading: 0 };
    const services = new Map<string, unknown>();
    const ctx = {
      headless: true,
      provide: (k: string, v: unknown) => services.set(k, v),
      service: (k: string) => services.get(k),
      vehicles: { list: [drone], get: (i: number) => (i === 7 ? drone : undefined) },
      people: {
        list: people,
        queryRadius: (x: number, z: number, r: number, out: unknown[], f: (p: unknown) => boolean) => {
          out.length = 0;
          for (const p of people) if (Math.hypot(p.x - x, p.z - z) <= r && f(p)) out.push(p);
          return out.length;
        },
      },
      world: {
        heightAt: () => 0,
        buildingHeightAt: (x: number, z: number): number => (x > 40 && x < 70 && Math.abs(z) < 30 ? 23 : 0),
      },
      ui: { notify: () => {} },
      events: { on: () => () => {} },
    };
    return { ctx, drone };
  }

  it('vise la foule à découvert plutôt qu’un attroupement plus gros caché derrière un immeuble', () => {
    const { ctx, drone } = scene();
    const sys = new DroneFeedSystem();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    const s = sys as unknown as { aim(c: unknown, v: unknown, dt: number): void; tx: number; tz: number; hasTarget: boolean; pose: { lookX: number; lookZ: number } };
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(true);
    expect(Math.hypot(s.tx + 22, s.tz)).toBeLessThan(5);
    // le centre de l'image n'est pas sur le toit
    expect(ctx.world.buildingHeightAt(s.pose.lookX, s.pose.lookZ)).toBe(0);
  });

  it('personne en vue : pas de point visé (regard oblique vers l’avant)', () => {
    const { ctx, drone } = scene();
    ctx.people.list.splice(60);           // seule la foule cachée reste
    const sys = new DroneFeedSystem();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    const s = sys as unknown as { aim(c: unknown, v: unknown, dt: number): void; hasTarget: boolean };
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(false);
  });

  it('effectif dans le champ : seulement les personnes visibles (pas à travers les toits)', () => {
    const { ctx, drone } = scene();
    // foule D : 30 personnes à 45 m à l'ouest, dans le champ mais derrière un immeuble (x de −40 à −32 m)
    let id = 1000;
    for (let i = 0; i < 30; i++) ctx.people.list.push({ id: id++, x: -45 + (i % 5) - 2, y: 0, z: Math.floor(i / 5) - 3, faction: 'protest', dormant: false, health: 1 });
    ctx.world.buildingHeightAt = (x: number, z: number) => ((x > 40 && x < 70 && Math.abs(z) < 30) || (x > -40 && x < -32 && Math.abs(z) < 30) ? 23 : 0);
    const aux = new AuxView();
    const sys = new DroneFeedSystem();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    (ctx as unknown as { provide(k: string, v: unknown): void }).provide('render.aux', aux);
    const s = sys as unknown as {
      aim(c: unknown, v: unknown, dt: number): void; applyCamera(a: unknown, c: unknown): void; countInView(c: unknown, a: unknown): number;
    };
    s.aim(ctx, drone, 0.1);
    s.applyCamera(aux, ctx);
    // la foule D est bien dans le cône de vue : seule la ligne de vue l'exclut
    const n = s.countInView(ctx, aux);
    expect(n).toBe(20);
  });

  it('foule masquée un instant par un immeuble (orbite) : la visée est gardée quelques secondes, pas de bascule vers les toits', () => {
    const { ctx, drone } = scene();
    const sys = new DroneFeedSystem();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    const s = sys as unknown as { aim(c: unknown, v: unknown, dt: number): void; hasTarget: boolean; tx: number; time: number };
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(true);
    // un immeuble passe entre la nacelle et la foule B
    const hidden = ctx.world.buildingHeightAt;
    ctx.world.buildingHeightAt = (x: number, z: number) => (x < -5 && x > -15 ? 60 : hidden(x, z));
    s.time = 1.5;
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(true);
    expect(s.tx).toBeLessThan(-15);
    s.time = 10;
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(false);
  });
});
