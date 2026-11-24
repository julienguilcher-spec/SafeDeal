import { describe, expect, it } from 'vitest';
import { DroneFeedSystem } from '@/ui/drone';

/**
 * Constaté en jeu (tests/e2e/verif-drone-nettete.mjs, mission cdt-02, zoom ×4) : « personne » à l'image alors que deux
 * groupes se tenaient à une dizaine de mètres de part et d'autre du centre. Le point visé était le barycentre du bloc le plus dense
 * (36 m de côté) : entre deux groupes, il tombe sur une chaussée vide, et au zoom ×4 le champ (une vingtaine de mètres)
 * ne montre plus personne. Le centre de l'image doit être SUR des gens.
 */
describe('retour vidéo du drone — centre de l’image sur la foule', () => {
  it('deux groupes de part et d’autre : le point visé est sur l’un d’eux, pas entre les deux', () => {
    const people: { id: number; x: number; y: number; z: number; faction: string; dormant: boolean; health: number; custody: string; posture: string; vehicleId: number }[] = [];
    let id = 1;
    const add = (x: number, z: number): void => {
      people.push({ id: id++, x, y: 0, z, faction: 'protest', dormant: false, health: 1, custody: 'free', posture: 'stand', vehicleId: 0 });
    };
    // deux groupes de 15 personnes sur les trottoirs d'une large avenue, à 10 m de part et d’autre de l’axe
    for (let i = 0; i < 15; i++) add(-10 + (i % 3) - 1, Math.floor(i / 3) - 2);
    for (let i = 0; i < 15; i++) add(10 + (i % 3) - 1, Math.floor(i / 3) - 2);
    const drone = { id: 7, kind: 'drone', faction: 'police', dormant: false, state: 'ok', def: { flying: true }, x: 0, y: 60, z: 3, heading: 0 };
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
      world: { heightAt: () => 0, buildingHeightAt: () => 0 },
      ui: { notify: () => {} },
      events: { on: () => () => {} },
    };
    const sys = new DroneFeedSystem();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    const s = sys as unknown as { aim(c: unknown, v: unknown, dt: number): void; tx: number; tz: number; hasTarget: boolean };
    s.aim(ctx, drone, 0.1);
    expect(s.hasTarget).toBe(true);
    let nearest = Infinity;
    let around = 0;
    for (const p of people) {
      const d = Math.hypot(p.x - s.tx, p.z - s.tz);
      nearest = Math.min(nearest, d);
      if (d < 5) around++;
    }
    console.log('point visé', s.tx.toFixed(1), s.tz.toFixed(1), '; personne la plus proche à', nearest.toFixed(1), 'm ;', around, 'à moins de 5 m');
    // au zoom ×4 (champ d'une vingtaine de mètres à 60 m), le centre montre un groupe
    expect(nearest).toBeLessThan(3);
    expect(around).toBeGreaterThanOrEqual(8);
  });
});
