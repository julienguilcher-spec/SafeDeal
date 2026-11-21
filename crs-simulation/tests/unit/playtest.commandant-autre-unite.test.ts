// Partie robot du commandant, troisième tour : « Autre unité » (U). Quand aucune de mes unités ne convient, Qui dit
// « Aucune unité libre — renfort possible : <renfort> : U » ; le premier U doit donner CE renfort, pas le suivant.
// Avec mes unités, U passe à la suivante de la liste du jeu, Maj+U revient en arrière.
import { describe, expect, it } from 'vitest';
import { defaultWho, noUnitText, whoAt } from '@/ui/command/bestUnit';
import type { WhoCandidate } from '@/ui/command/cardTypes';

const mine = (id: number, label: string, eta: number): WhoCandidate => ({ squadIds: [id], label, mode: 'pied', eta, distance: eta, busy: 'sans ordre' });
const station = (id: number, label: string, eta: number): WhoCandidate => ({ ...mine(id, label, eta), mode: 'vehicules', fromStation: id });

describe('commandant : « Autre unité » (U)', () => {
  it('que des renforts de commissariat : le premier U donne celui que nomme Qui', () => {
    const list = [station(101, 'Patrouille TV 75-19', 240), station(102, 'Patrouille TV 75-07', 420)];
    expect(defaultWho(list)).toBeNull();
    expect(noUnitText(list)).toContain('TV 75-19');
    expect(whoAt(list, 0)).toBeNull();
    expect(whoAt(list, 1)!.label).toBe('Patrouille TV 75-19');
    expect(whoAt(list, 2)!.label).toBe('Patrouille TV 75-07');
    expect(whoAt(list, 3)!.label).toBe('Patrouille TV 75-19');
    expect(whoAt(list, -1)!.label).toBe('Patrouille TV 75-07');
  });

  it('avec mes unités : d’office la première, U la suivante (renforts en dernier), Maj+U la dernière', () => {
    const list = [mine(1, 'Section MISTRAL 1', 60), mine(2, 'Section MISTRAL 2', 90), station(101, 'Patrouille TV 75-19', 240)];
    expect(whoAt(list, 0)!.label).toBe('Section MISTRAL 1');
    expect(whoAt(list, 1)!.label).toBe('Section MISTRAL 2');
    expect(whoAt(list, 2)!.label).toBe('Patrouille TV 75-19');
    expect(whoAt(list, 3)!.label).toBe('Section MISTRAL 1');
    expect(whoAt(list, -1)!.label).toBe('Patrouille TV 75-19');
    expect(whoAt([], 1)).toBeNull();
  });
});
