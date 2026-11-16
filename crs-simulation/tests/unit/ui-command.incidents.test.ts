import { describe, expect, it } from 'vitest';
import type { Incident, IncidentKind, IncidentState } from '@/core/extensions';
import {
  INCIDENT_KIND_LABELS, MEANS_ADVICE, MEANS_FOR, ageLabel, compareIncidents, meansOfSymbol, sortIncidents,
} from '@/ui/command/incidents';
import { facingCardinal, orderPhrase, radioFrame, roundVolume, situationReport, spellNumber } from '@/ui/command/phrases';

let nextId = 1;
function inc(kind: IncidentKind, urgency: 1 | 2 | 3, state: IncidentState = 'ouvert', severity = 0.5, createdAt = 0): Incident {
  return { id: nextId++, kind, label: kind, x: 0, z: 0, targetKind: 'place', targetId: 0, urgency, severity, state, createdAt, means: '', squadId: 0, progress: 0 };
}

describe('commandement — tri des incidents', () => {
  it('urgence décroissante, puis gravité, puis ancienneté', () => {
    const a = inc('feu_poubelle', 1, 'ouvert', 0.9, 10);
    const b = inc('blesse', 2, 'ouvert', 0.2, 50);
    const c = inc('feu_vehicule', 3, 'ouvert', 0.1, 90);
    const d = inc('pillage', 2, 'ouvert', 0.8, 60);
    const e = inc('barricade', 2, 'ouvert', 0.8, 20);
    const sorted = sortIncidents([a, b, c, d, e]);
    expect(sorted).toEqual([c, e, d, b, a]);
  });

  it('ce qui attend une décision passe avant ce qui est déjà confié, même plus urgent', () => {
    const open1 = inc('feu_poubelle', 1, 'ouvert');
    const assigned = inc('feu_vehicule', 3, 'assigne');
    const running = inc('blesse', 3, 'en_cours');
    expect(sortIncidents([running, assigned, open1])).toEqual([open1, assigned, running]);
    expect(compareIncidents(open1, assigned)).toBeLessThan(0);
  });

  it('les incidents clos sortent de la liste ; le tableau d\'entrée n\'est pas modifié', () => {
    const list = [inc('blesse', 2, 'resolu'), inc('pillage', 2, 'echoue'), inc('suspect', 1, 'ouvert')];
    const copy = [...list];
    const sorted = sortIncidents(list);
    expect(sorted.length).toBe(1);
    expect(sorted[0]!.kind).toBe('suspect');
    expect(list).toEqual(copy);
  });

  it('tri stable et total : même ordre quelle que soit la permutation de départ', () => {
    const items = [inc('feu_poubelle', 1), inc('blesse', 2), inc('agent_isole', 3), inc('pillage', 2, 'assigne'), inc('barricade', 1, 'ouvert', 0.5, 5)];
    const ref = sortIncidents(items).map((i) => i.id);
    for (let k = 0; k < items.length; k++) {
      const rotated = items.slice(k).concat(items.slice(0, k));
      expect(sortIncidents(rotated).map((i) => i.id)).toEqual(ref);
    }
  });

  it('réalisme des moyens : le canon à eau éteint, pas le Centaure ; le Centaure dégage', () => {
    const fires: IncidentKind[] = ['feu_poubelle', 'feu_barricade', 'feu_vehicule', 'feu_boutique'];
    for (const k of fires) {
      expect(MEANS_FOR[k]).toContain('canon_eau');
      expect(MEANS_FOR[k]).toContain('pompiers');
      expect(MEANS_FOR[k]).not.toContain('centaure');
    }
    expect(MEANS_FOR.barricade[0]).toBe('centaure');
    expect(MEANS_FOR.feu_vehicule).not.toContain('unite'); // un extincteur ne suffit pas pour un véhicule embrasé
    expect(MEANS_FOR.feu_poubelle[0]).toBe('unite');
    expect(MEANS_FOR.blesse[0]).toBe('samu');
    for (const k of Object.keys(MEANS_FOR) as IncidentKind[]) {
      expect(INCIDENT_KIND_LABELS[k].length).toBeGreaterThan(3);
      expect(MEANS_ADVICE[k].length).toBeGreaterThan(10);
    }
  });

  it('moyen correspondant à une unité d\'après son symbole', () => {
    expect(meansOfSymbol('canon_eau')).toBe('canon_eau');
    expect(meansOfSymbol('centaure')).toBe('centaure');
    expect(meansOfSymbol('bravm')).toBe('bravm');
    expect(meansOfSymbol('groupe')).toBe('unite');
    expect(meansOfSymbol('section')).toBe('unite');
    expect(meansOfSymbol('pompiers')).toBe('pompiers');
  });

  it('âge lisible', () => {
    expect(ageLabel(45)).toBe('45 s');
    expect(ageLabel(185)).toBe('3 min');
  });
});

describe('commandement — phraséologie radio', () => {
  it('chiffres dits un par un, milliers ronds exceptés', () => {
    expect(spellNumber(45)).toBe('QUATRE-CINQ');
    expect(spellNumber(300)).toBe('TROIS-ZÉRO-ZÉRO');
    expect(spellNumber(5000)).toBe('CINQ MILLE');
    expect(spellNumber(0)).toBe('ZÉRO');
    expect(spellNumber(12000)).toBe('UN-DEUX MILLE');
  });

  it('volumes arrondis comme dans un compte rendu', () => {
    expect(roundVolume(3)).toBe(3);
    expect(roundVolume(47)).toBe(50);
    expect(roundVolume(287)).toBe(300);
    expect(roundVolume(1840)).toBe(1800);
  });

  it('points cardinaux d\'un cap (cap 0 = sud, π = nord, π/2 = est)', () => {
    expect(facingCardinal(0)).toBe('sud');
    expect(facingCardinal(Math.PI)).toBe('nord');
    expect(facingCardinal(Math.PI / 2)).toBe('est');
    expect(facingCardinal(-Math.PI / 2)).toBe('ouest');
    expect(facingCardinal((3 * Math.PI) / 4)).toBe('nord-est');
  });

  it('gabarit « APPELÉ ICI APPELANT … PARLEZ »', () => {
    expect(radioFrame('Mistral 2', 'Mistral', 'Tenez la position')).toBe('MISTRAL 2 ICI MISTRAL. Tenez la position. PARLEZ.');
    expect(radioFrame('central', 'x', 'Reçu.', false)).toBe('CENTRAL ICI X. Reçu. TERMINÉ.');
  });

  it('message d\'ordre : ligne de barrage avec face et front', () => {
    const text = orderPhrase({ type: 'ligne', unit: 'MISTRAL 2', from: 'MISTRAL', sector: 'rue de Rivoli', heading: Math.PI, width: 24, distance: 80, target: '' });
    expect(text).toBe('MISTRAL 2 ICI MISTRAL. Ligne de barrage, rue de Rivoli, face nord, front DEUX-QUATRE mètres. PARLEZ.');
    const nasse = orderPhrase({ type: 'encercler', unit: 'MISTRAL 1', from: 'MISTRAL', sector: '', heading: Math.PI / 2, width: 40, distance: 30, target: '' });
    expect(nasse).toMatch(/Sortie contrôlée laissée ouverte face est/);
    expect(nasse).toMatch(/rayon DEUX-ZÉRO mètres/);
  });

  it('compte rendu de situation : nature, volume, attitude', () => {
    const text = situationReport({ from: 'MISTRAL 2 ALFA', sector: 'boulevard du Temple', phase: 'cortege', volume: 287, tension: 0.5 });
    expect(text).toBe('CENTRAL ICI MISTRAL 2 ALFA. Position boulevard du Temple. Nature : cortège. Volume : TROIS-ZÉRO-ZÉRO. Attitude : tendue. PARLEZ.');
    expect(situationReport({ from: 'X', sector: 'quai', phase: 'aucune', volume: 0, tension: 0 })).toMatch(/Rien à signaler/);
  });
});
