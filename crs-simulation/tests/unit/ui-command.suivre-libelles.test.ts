// Ordres « me suivre » : deux ordres nettement nommés, côte à côte, avec les mêmes mots partout où le joueur les donne
// (« Suivez-moi à pied », « Suivez-moi en véhicules » : bloc « ORDRES » du HUD, roue d'ordres, fiche « VOUS » de la carte) ;
// la formation à pied « en file » ne se confond plus avec la colonne de véhicules.
import { describe, expect, it } from 'vitest';

import { ORDER_VERBS, verbOf } from '@/ui/command/orders';
import { WHEEL } from '@/ui/command/orderWheel';
import { sectorForDigit } from '@/ui/command/direct/words';
import { QUICK_LABELS, followTitles, smartFollowColumn, wheelHint } from '@/ui/command/quickActions';

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

  it('mêmes mots partout : « Suivez-moi à pied » / « Suivez-moi en véhicules » (fiche « VOUS », carte) ; « Avec moi » sur le terrain', () => {
    expect(verbOf('suivre_pied')!.plain).toBe('Suivez-moi à pied');
    expect(verbOf('avec_moi')!.plain).toBe('Suivez-moi en véhicules');
    // roue d'ordres (ordres directs) : un seul secteur « Avec moi » (1), qui s'adapte à la façon dont il se déplace ; le
    // 2 (l'ancien « Suivez-moi en véhicules ») en est l'alias, non dessiné
    const wf = WHEEL.findIndex((w) => w.action === 'avec_moi');
    expect(wf).toBe(0);
    expect(WHEEL[wf]!.label).toBe('Avec moi');
    expect(WHEEL[wf]!.key).toBe(1);
    expect(sectorForDigit(WHEEL, 2)).toBe(WHEEL[wf]);
    expect(WHEEL.some((w) => w.key === 2)).toBe(false);
    // bloc d'ordres du HUD (ordres directs) : « A avec moi » dans la ligne des touches, la pastille « Avec moi » du
    // téléphone (le même mot que le secteur 1), et la touche de la roue écrite « F puis 7 » (jamais « F7 », touche de
    // fonction du Mac)
    expect(QUICK_LABELS.withMe).toBe(WHEEL[wf]!.label);
    expect(wheelHint('F', 7)).toBe('F puis 7');
    expect(wheelHint('F', 7)).not.toMatch(/F\s?\d/);
    // « Avec moi » s'adapte : à pied → ils le suivent à pied ; à bord ou au volant → derrière son véhicule
    expect(smartFollowColumn(0)).toBe(false);
    expect(smartFollowColumn(42)).toBe(true);
  });

  it('infobulles selon le rôle : la compagnie (commandant), la section, le groupe (chef de groupe, CRS), l’équipage', () => {
    expect(followTitles('compagnie')).toEqual({
      foot: 'Toute la compagnie descend et vous suit à pied', column: 'Toute la compagnie remonte et suit votre véhicule',
    });
    expect(followTitles('section').foot).toBe('Toute la section descend et vous suit à pied');
    expect(followTitles('groupe')).toEqual({ foot: 'Votre groupe vous suit à pied', column: 'Votre groupe suit votre véhicule' });
    expect(followTitles('equipage').column).toBe('Votre équipage suit votre véhicule');
  });
});
