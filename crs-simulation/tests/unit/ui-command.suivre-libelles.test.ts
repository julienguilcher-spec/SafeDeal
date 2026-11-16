// Ordres « me suivre » : deux ordres nettement nommés, côte à côte, partout où le joueur donne ses ordres (palette de la
// carte tactique, ordre rapide, roue d'ordres) ; la formation à pied « en file » ne se confond plus avec la colonne de
// véhicules.
import { describe, expect, it } from 'vitest';

import { ORDER_VERBS, verbOf } from '@/ui/command/orders';
import { WHEEL } from '@/ui/command/orderWheel';
import { QUICK_VERBS } from '@/ui/command/tacticalScreen';

describe('commandement — ordres « me suivre »', () => {
  it('palette : « Me suivre à pied » puis « Me suivre en colonne (véhicules) », côte à côte, ordres immédiats', () => {
    const foot = ORDER_VERBS.findIndex((v) => v.type === 'suivre_pied');
    const column = ORDER_VERBS.findIndex((v) => v.type === 'avec_moi');
    expect(ORDER_VERBS[foot]!.label).toBe('Me suivre à pied');
    expect(ORDER_VERBS[column]!.label).toBe('Me suivre en colonne (véhicules)');
    expect(column).toBe(foot + 1);
    expect(ORDER_VERBS[foot]!.group).toBe(ORDER_VERBS[column]!.group);
    expect(verbOf('suivre_pied')!.gesture).toBe('immediate');
    expect(verbOf('avec_moi')!.gesture).toBe('immediate');
    // un seul concept, un seul libellé : plus d'« Avec moi »
    expect(ORDER_VERBS.some((v) => /avec moi/i.test(v.label) || /avec moi/i.test(v.short))).toBe(false);
    // exactement deux ordres « me suivre »
    expect(ORDER_VERBS.filter((v) => /^me suivre/i.test(v.label)).map((v) => v.type)).toEqual(['suivre_pied', 'avec_moi']);
  });

  it('la formation à pied « en file » ne s’appelle plus « colonne »', () => {
    const file = verbOf('colonne')!;
    expect(file.label).toBe('En file (à pied) vers…');
    expect(file.short).toBe('En file');
    expect(file.label + file.short + file.hint).not.toMatch(/colonne/i);
    // « colonne » ne désigne plus qu'un ordre : la colonne de véhicules
    expect(ORDER_VERBS.filter((v) => /colonne/i.test(v.label)).map((v) => v.type)).toEqual(['avec_moi']);
  });

  it('roue d’ordres et ordre rapide de la carte : les deux ordres, l’un à côté de l’autre', () => {
    const wf = WHEEL.findIndex((w) => w.type === 'suivre_pied');
    const wc = WHEEL.findIndex((w) => w.type === 'avec_moi');
    expect(wf).toBeGreaterThanOrEqual(0);
    expect(wc).toBe(wf + 1);
    expect(`${WHEEL[wf]!.label} ${WHEEL[wf]!.sub}`).toBe('Me suivre à pied');
    expect(`${WHEEL[wc]!.label} ${WHEEL[wc]!.sub}`).toMatch(/^Me suivre en colonne/);
    expect(WHEEL.some((w) => w.type === 'suivre')).toBe(false);
    const qf = QUICK_VERBS.indexOf('suivre_pied');
    expect(qf).toBeGreaterThanOrEqual(0);
    expect(QUICK_VERBS.indexOf('avec_moi')).toBe(qf + 1);
  });
});
