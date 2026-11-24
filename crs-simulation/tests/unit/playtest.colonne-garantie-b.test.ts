// Colonne garantie (plan « ordres directs », P17) : robot du commandant en mission, trois façons d'arriver (passager, au
// volant, seul devant) — voir playtest.colonne-garantie.lib.ts. À son arrivée au lieu, tous ses groupes à
// moins de 300 m (du lieu ou de lui) dans les 180 s. Joué sur demande (quelques minutes par partie) :
// PLAYTEST_COLONNE=1, ou PLAYTEST_ARRIVAL=passager|volant|devant pour une seule façon d'arriver.
import { describe, expect, it } from 'vitest';
import { ARRIVALS } from './playtest.commandant-mission.lib';
import { columnDefects, columnReport, playColumn } from './playtest.colonne-garantie.lib';

const ONLY = process.env.PLAYTEST_ARRIVAL;
const RUN = process.env.PLAYTEST_COLONNE === '1' || process.env.PLAYTEST_COMMANDANT === '1';

for (const id of ['cdt-04-nuit-des-vitrines', 'cdt-07-cortege-officiel']) {
  describe.skipIf(!RUN)(`colonne garantie : ${id}`, () => {
    for (const arrival of ARRIVALS) {
      if (ONLY && ONLY !== arrival) continue;
      it(`${arrival} : toute la compagnie arrive avec le commandant`, async () => {
        const r = await playColumn(id, arrival);
        console.log(columnReport(r));
        expect(columnDefects(r)).toEqual([]);
      }, 1_800_000);
    }
  });
}
