/* Radio filtrée de l'exécutant : « À toutes les unités de CENTRAL : … » (foyers secondaires, src/sim/crowd/foyers.ts)
 * est une diffusion générale de la salle ; le simple CRS doit l'entendre. */
import { describe, expect, it } from 'vitest';
import type { RadioMessage } from '@/core/contracts';
import { ExecutantRadioFilter, classifyRadio } from '@/gameplay/radio/relevance';
import type { RadioScope } from '@/gameplay/radio/relevance';

const scope: RadioScope = { group: 'MISTRAL 1 ALFA', section: 'MISTRAL 1', company: 'MISTRAL', people: new Set([11, 12]), self: 10 };

function msg(text: string, priority: 0 | 1 | 2 = 2): RadioMessage {
  return { channel: 'commandement', from: 'CENTRAL', text, priority };
}

describe('radio exécutant — « À toutes les unités »', () => {
  it('diffusion de CENTRAL « À toutes les unités de CENTRAL : » = générale, entendue', () => {
    const m = msg('À toutes les unités de CENTRAL : groupe d’une centaine d’individus cagoulés, place de la République. Dégradations de vitrines en cours.');
    expect(classifyRadio(m, scope)).toBe('general');
    expect(new ExecutantRadioFilter().accept(m, scope, 10)).toBe(true);
  });

  it('les autres formes restent générales', () => {
    expect(classifyRadio(msg('À TOUS ICI CENTRAL. Feu de véhicule. TERMINÉ.'), scope)).toBe('general');
    expect(classifyRadio(msg('Toutes unités, fin de mission.'), scope)).toBe('general');
  });
});
