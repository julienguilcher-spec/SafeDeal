// Réseau du commandement saturé par des messages urgents de la salle, chacun un peu différent (la rue change) : le
// compte rendu de fin d'ordre d'une unité (« Arrivé au point », priorité 1) passait toujours après eux, attendait plus de
// quatre-vingt-dix secondes et était abandonné — le commandant n'entendait jamais le résultat de son ordre. Un message
// qui attend gagne en priorité : il passe au bout d'une demi-minute environ.
import { describe, expect, it } from 'vitest';
import type { RadioMessage } from '@/core/contracts';
import { RadioQueue } from '@/gameplay/radio/queue';

const STREETS = ['place de la Concorde', 'pont de la Concorde', 'quai des Tuileries', 'voie Georges-Pompidou', 'rue Royale', 'avenue Gabriel'];

describe('radio — compte rendu de fin d’ordre sur un réseau saturé', () => {
  it('le compte rendu d’une unité passe malgré un flot de messages urgents', () => {
    const played: { msg: RadioMessage; t: number }[] = [];
    const q = new RadioQueue((m, now) => played.push({ msg: m, t: now }));
    const report: RadioMessage = { channel: 'commandement', from: 'MISTRAL 2', text: 'MISTRAL ICI MISTRAL 2. Arrivé au point. PARLEZ.', priority: 1 };
    let k = 0;
    let submitted = -1;
    for (let t = 0; t < 200; t += 0.25) {
      // un message urgent de la salle toutes les huit secondes environ, plus long que l'intervalle
      if (Math.abs(t % 8) < 1e-9) {
        const street = STREETS[k++ % STREETS.length]!;
        q.submit({ channel: 'commandement', from: 'CENTRAL', priority: 2,
          text: `MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, ${street}. Je demande une unité pour le dégager. Message numéro ${k}. PARLEZ.` }, t);
      }
      if (t === 20) { q.submit(report, t); submitted = t; }
      q.update(t);
    }
    const heard = played.find((p) => p.msg === report);
    expect(heard, `compte rendu abandonné (${q.counters.dropped} abandons)`).toBeTruthy();
    expect(heard!.t - submitted).toBeLessThan(60);
  });
});
