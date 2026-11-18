// Commissariats — contrôle des sites figés sur la vraie carte de Paris (exécuté seulement si public/data/paris est
// présent). Régénérer les données : CRS_COMMISSARIATS_PRINT=1 npx vitest run tests/unit/commissariats.sites.paris.test.ts --silent=false
import { beforeAll, describe, expect, it } from 'vitest';
import type { RoadSample } from '@/core/contracts';
import { COMMISSARIATS, COMMISSARIAT_SEEDS } from '@/world/commissariats';
import {
  CHECK_DESTINATIONS, SLOT_RULES, exitWidthRules, layoutYard, parkEligible, pathWidthOk, printFrozen, siteLoadRadius, validateSite,
} from '@/world/commissariats/layout';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { FsMapSource, defaultParisDir } from '@/world/query/source-fs';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const available = await new FsMapSource(defaultParisDir()).exists();
if (!available) console.log('[commissariats] carte de Paris absente : essai non exécuté');
const PRINT = env.CRS_COMMISSARIATS_PRINT === '1';

describe.skipIf(!available)('commissariats sur la vraie carte de Paris', () => {
  let world: WorldQueryImpl;

  beforeAll(async () => {
    world = createWorldQuery({ source: 'paris', parisSource: new FsMapSource(defaultParisDir()) });
    await world.boot();
  }, 120_000);

  it.runIf(PRINT)('calcule et imprime les dispositions (CRS_COMMISSARIATS_PRINT=1)', async () => {
    const out: string[] = [];
    for (const seed of COMMISSARIAT_SEEDS) {
      await world.whenLoaded(seed.x, seed.z, 450);
      try {
        const l = layoutYard(world, seed);
        const report = validateSite(world, l.def);
        out.push(printFrozen(seed.id, l.frozen));
        console.log(`[${seed.id}] ${l.notes.join(' ; ') || 'rue du commissariat'} — ouverture ${report.openArcDeg}° — ${report.ok ? 'valide' : 'PROBLÈMES :\n  ' + report.problems.join('\n  ')}`);
      } catch (e) {
        console.log(`[${seed.id}] ÉCHEC : ${(e as Error).message}`);
      }
    }
    console.log('export const FROZEN_LAYOUTS: Readonly<Record<string, FrozenLayout>> = {\n' + out.join('\n') + '\n};');
  }, 600_000);

  it('les sept sites sont figés', () => {
    expect(COMMISSARIATS.map((c) => c.id)).toEqual(COMMISSARIAT_SEEDS.map((s) => s.id));
  });

  it('validateSite accepte chaque site (porte, places, dégagements, itinéraires, cheminements)', async () => {
    const bad: string[] = [];
    for (const def of COMMISSARIATS) {
      await world.whenLoaded(def.door.x, def.door.z, siteLoadRadius(def));
      const r = validateSite(world, def);
      if (!r.ok) bad.push(`${def.id} :\n  ${r.problems.join('\n  ')}`);
      expect(r.openArcDeg).toBeGreaterThanOrEqual(SLOT_RULES.openArcDeg);
      expect(r.slots).toHaveLength(def.slots.length);
    }
    if (bad.length > 0) console.log(bad.join('\n'));
    expect(bad).toEqual([]);
  }, 600_000);

  it('les itinéraires de chaque tête de file vers Concorde et République gardent la largeur voulue', async () => {
    const path: number[] = [];
    for (const def of COMMISSARIATS) {
      await world.whenLoaded(def.door.x, def.door.z, siteLoadRadius(def));
      for (const t of def.stock) {
        const head = def.slots[t.slots[0]!]!;
        const engine = t.vehicle === 'canon_eau' || t.vehicle === 'centaure' || t.vehicle === 'car_crs';
        for (const dst of CHECK_DESTINATIONS) {
          const found = world.findPath(head.x, head.z, dst.x, dst.z, 'vehicle', path, {
            heading: head.heading, uturn: 200, contraflow: 3, minWidth: (engine ? 2.6 : 2.05) + 1.2,
          });
          expect(found, `${t.callsign} → ${dst.name}`).toBe(true);
          for (const r of exitWidthRules(engine)) {
            const w = pathWidthOk(world, path, r.min, r.minOneway, r.upTo);
            expect(w.ok, `${t.callsign} → ${dst.name} : ${w.worst} m < ${r.min} m`).toBe(true);
          }
        }
      }
    }
  }, 600_000);

  it('chaque rue de places admet le stationnement selon la règle de la circulation', async () => {
    const s: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    for (const def of COMMISSARIATS) {
      await world.whenLoaded(def.door.x, def.door.z, siteLoadRadius(def));
      for (const slot of def.slots) {
        expect(world.nearestRoad(slot.x, slot.z, s, 12)).toBe(true);
        const e = world.edge(s.edgeId);
        expect(parkEligible(e), `${def.id} : ${e.name} ${e.width} m`).toBe(true);
        expect(e.width).toBeGreaterThanOrEqual(e.oneway ? SLOT_RULES.parkMinOneway : SLOT_RULES.parkMinTwoway);
        expect((def.bayStreet ?? def.street).split(' et '), `${def.id} : ${e.name}`).toContain(e.name || 'rue sans nom');
      }
    }
  }, 600_000);
});
