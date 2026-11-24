// Colonnes motorisées — banc d'essai : de chaque base de prise de service vers les grands lieux de rassemblement.
// Chaque colonne doit arriver dans les délais (itinéraire / 6 m/s + 180 s), au complet, sans heurter de piéton et sans
// que le filet de sécurité (véhicule replacé hors de vue) ait à intervenir. Voir colonnes.bench.ts.
// COLONNES_BASES / COLONNES_DESTS (indices séparés par des virgules) restreignent le banc.
import { describe, expect, it } from 'vitest';
import { SERVICE_BASES } from '@/gameplay/session';
import { DESTS, line, passed, runColumn } from './colonnes.bench';

const pick = (env: string | undefined, n: number): number[] => (env ? env.split(',').map(Number) : Array.from({ length: n }, (_, i) => i));
const BASES = pick(process.env['COLONNES_BASES'], SERVICE_BASES.length);
const DEST_IDX = pick(process.env['COLONNES_DESTS'], DESTS.length);

// Banc de mesure, long (plusieurs dizaines de minutes) : il ne tourne que sur demande — COLONNES_BENCH=1, ou une
// sélection COLONNES_BASES / COLONNES_DESTS. Les trajets en colonne de la suite courante sont couverts par
// integration.journee*.test.ts et integration.mouvement-motorise.test.ts.
const RUN = process.env['COLONNES_BENCH'] === '1' || process.env['COLONNES_BASES'] !== undefined || process.env['COLONNES_DESTS'] !== undefined;

describe.runIf(RUN)('colonnes motorisées — banc d’essai', () => {
  for (const bi of BASES) {
    const base = SERVICE_BASES[bi]!;
    it(`depuis ${base.name}`, async () => {
      const bad: string[] = [];
      for (const di of DEST_IDX) {
        const dest = DESTS[di]!;
        // (lieu trop proche de la base : pas de trajet en colonne)
        if (Math.hypot(dest.x - base.x, dest.z - base.z) < 600) continue;
        const means = { sections: 1 + ((bi + di) % 2), fourgons: 3 + ((bi + di) % 4), centaure: (bi + di) % 3 === 0 ? 1 : 0, canon_eau: (bi + di) % 4 === 1 ? 1 : 0 };
        const t0 = Date.now();
        const r = await runColumn(base, dest, means, Number(process.env['COLONNES_SEED'] ?? 7), (process.env['COLONNES_JOUEUR'] as 'loin' | 'passager' | undefined) ?? 'passager');
        console.log(line(r) + `  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
        if (!passed(r)) bad.push(`${r.dest}`);
      }
      expect(bad).toEqual([]);
    }, 3_600_000);
  }
});
