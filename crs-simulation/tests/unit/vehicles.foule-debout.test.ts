// Colonne garantie (plan « ordres directs », P17, point 4) : des personnes DEBOUT qui ne s'écartent pas devant un
// véhicule de police. Avant : « attente / personne » sans fin — les fourgons appelés pour un interpellé restaient plantés
// dans la foule, les motos de la BRAV-M attendaient des piétons arrêtés. Maintenant : au bout de 15 s, le véhicule avance
// au pas (sous la vitesse où un choc blesse), et le suivant d'une colonne contourne une personne immobile comme il
// contourne un blessé allongé.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function crewed(ctx: GameContext, kind: string, x: number, z: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, EAST, { faction: 'police' });
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

/** Garde une personne debout, immobile de son plein gré (elle peut être poussée). */
function planted(p: Person): void {
  p.vx = 0;
  p.vz = 0;
}

describe('pilote automatique : personnes debout qui ne s’écartent pas', () => {
  it('un fourgon de police arrêté par un rang de manifestants avance au pas au bout de 15 s, sans blesser personne', async () => {
    const town = createTown({ width: 12 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const van = crewed(b.ctx, 'fourgon_crs', 60, 121);
    expect(ap.driveTo(van, 380, 121)).toBe(true);
    expect(runUntil(b, () => van.x > 100, 40)).toBeGreaterThan(0);
    // un rang de manifestants en travers de toute la chaussée, 20 m devant le fourgon (aucun couloir pour le contourner)
    const row: Person[] = [];
    for (let k = -5; k <= 5; k++) row.push(b.ctx.people.spawn({ kind: 'manifestant', x: van.x + 22, z: 121 + k * 1.1 }));
    const hp0 = row.map((p) => p.health);
    let stoppedAt = -1;
    let fastNear = 0;
    let t = 0;
    const passed = runUntil(b, () => van.x > row[0]!.x + 4 || van.x > 200, 120, () => {
      t += 1 / 30;
      for (const p of row) planted(p);
      if (stoppedAt < 0 && Math.abs(van.speed) < 0.1 && ap.status(van).reason === 'personne') stoppedAt = t;
      // contact (moins de 30 cm de la carrosserie) au-dessus de la vitesse où un choc blesse
      const sn = Math.sin(van.heading), cs = Math.cos(van.heading);
      const touch = row.some((p) => {
        const rx = p.x - van.x, rz = p.z - van.z;
        const a = Math.abs(rx * sn + rz * cs) - van.def.length * 0.5, l = Math.abs(rx * cs - rz * sn) - van.def.width * 0.5;
        return Math.hypot(Math.max(0, a), Math.max(0, l)) < p.radius + 0.3;
      });
      if (touch && Math.abs(van.speed) > 2) fastNear++;
    });
    const st = ap.status(van);
    const msg = `${st.mode}/${st.state}/${st.reason} x=${van.x.toFixed(1)} arrêté à ${stoppedAt.toFixed(1)} s`;
    expect(stoppedAt, msg).toBeGreaterThanOrEqual(0);
    // il a d'abord attendu (ils peuvent s'écarter), puis il est passé
    expect(passed, msg).toBeGreaterThan(stoppedAt + 12);
    expect(passed, msg).toBeLessThan(90);
    // jamais vite au contact, personne de blessé
    expect(fastNear, msg).toBe(0);
    expect(row.map((p) => p.health), msg).toEqual(hp0);
  }, 120000);

  it('le suivant d’une colonne contourne une personne debout immobile sur la trace, sans la toucher', async () => {
    const town = createTown({ width: 12 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const head = crewed(b.ctx, 'vl_commandement', 60, 121);
    const next = crewed(b.ctx, 'fourgon_crs', 46, 121);
    expect(ap.convoy([head, next], 380, 121)).toBe(true);
    expect(runUntil(b, () => head.x > 100, 40)).toBeGreaterThan(0);
    const man = b.ctx.people.spawn({ kind: 'manifestant', x: next.x + 12, z: next.z });
    let closest = Infinity;
    const t = runUntil(b, () => next.x > man.x + 15, 120, () => {
      planted(man);
      const sn = Math.sin(next.heading), cs = Math.cos(next.heading);
      const rx = man.x - next.x, rz = man.z - next.z;
      const fwd = rx * sn + rz * cs, side = Math.abs(-rx * cs + rz * sn);
      const d = Math.hypot(Math.max(0, Math.abs(fwd) - next.def.length * 0.5), Math.max(0, side - next.def.width * 0.5));
      if (d < closest) closest = d;
    });
    const st = ap.status(next);
    expect(t, `${st.mode}/${st.state}/${st.reason} x=${next.x.toFixed(1)} personne x=${man.x.toFixed(1)}`).toBeGreaterThan(0);
    // contourné (avant les 15 s du passage au pas), sans contact
    expect(t).toBeLessThan(30);
    expect(closest).toBeGreaterThan(0.3);
  }, 120000);
});
