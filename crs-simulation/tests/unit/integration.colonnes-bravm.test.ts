// Colonnes motorisées — banc d'essai avec la BRAV-M : la compagnie part de sa base de prise de service (choisie comme en
// jeu), la BRAV-M de chacun de ses commissariats (BRAVM_BASES) ; tout le monde doit se retrouver sur place dans les
// délais, sans filet de sécurité ni piéton heurté. Voir colonnes.bench.ts. COLONNES_BASES / COLONNES_DESTS restreignent.
import { describe, expect, it } from 'vitest';
import { BRAVM_BASES } from '@/gameplay/session/journee-data';
import { serviceBaseFor } from '@/gameplay/session';
import { DESTS, line, passed, runColumn } from './colonnes.bench';

const pick = (env: string | undefined, n: number): number[] => (env ? env.split(',').map(Number) : Array.from({ length: n }, (_, i) => i));
const BASES = pick(process.env['COLONNES_BASES'], BRAVM_BASES.length);
const DEST_IDX = pick(process.env['COLONNES_DESTS'], DESTS.length);

// Banc de mesure, long (plusieurs dizaines de minutes) : il ne tourne que sur demande — COLONNES_BENCH=1, ou une
// sélection COLONNES_BASES / COLONNES_DESTS. Les trajets en colonne de la suite courante sont couverts par
// integration.journee*.test.ts et integration.mouvement-motorise.test.ts.
const RUN = process.env['COLONNES_BENCH'] === '1' || process.env['COLONNES_BASES'] !== undefined || process.env['COLONNES_DESTS'] !== undefined;

describe.runIf(RUN)('colonnes motorisées — BRAV-M', () => {
  for (const bi of BASES) {
    const bb = BRAVM_BASES[bi]!;
    it(`BRAV-M depuis ${bb.name}`, async () => {
      const bad: string[] = [];
      for (const di of DEST_IDX) {
        const dest = DESTS[di]!;
        const base = serviceBaseFor(dest.x, dest.z);
        // (la BRAV-M part d'un autre point que la compagnie, pas sur le lieu même)
        if (Math.hypot(dest.x - bb.x, dest.z - bb.z) < 600 || Math.hypot(base.x - bb.x, base.z - bb.z) < 300) continue;
        const r = await runColumn(base, dest, { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0 }, 7, 'passager', bb);
        console.log(line(r));
        if (!passed(r)) bad.push(r.dest);
      }
      expect(bad).toEqual([]);
    }, 3_600_000);
  }
});
