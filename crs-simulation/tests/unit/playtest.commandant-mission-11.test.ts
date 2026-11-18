// Robot du commandant en mission (voir playtest.commandant-mission.lib.ts) : cdt-11-l-echarpe, lancée depuis la fiche de l'accueil,
// arrivée en passager, au volant, puis seul devant la colonne ; trois minutes d'ordres dès l'arrivée.
// Joué sur demande (quelques minutes par mission) : PLAYTEST_COMMANDANT=1, ou PLAYTEST_ARRIVAL=passager|volant|devant pour
// une seule façon d'arriver. Relevé en cours : les colonnes qui roulent sans le joueur se garent encore loin du lieu
// (pilote automatique, colonne de la journée) — voir le compte rendu de la recette.
import { describe, expect, it } from 'vitest';
import { ARRIVALS, defects, playCommandant, report } from './playtest.commandant-mission.lib';

const ONLY = process.env.PLAYTEST_ARRIVAL;
const RUN = process.env.PLAYTEST_COMMANDANT === '1' || ONLY !== undefined;

describe.skipIf(!RUN)('commandant en mission : cdt-11-l-echarpe', () => {
  for (const arrival of ARRIVALS) {
    if (ONLY && ONLY !== arrival) continue;
    it(`${arrival} : il commande dès l’arrivée et il est obéi`, async () => {
      const r = await playCommandant('cdt-11-l-echarpe', arrival);
      console.log(report(r));
      expect(defects(r)).toEqual([]);
    }, 1_200_000);
  }
});
