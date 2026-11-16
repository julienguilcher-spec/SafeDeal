// Objectifs « personnalisés » : les textes qui décrivent une grandeur connue du jeu sont reconnus et mesurés.
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { frenchNumber, parseCustom } from '@/gameplay/missions/custom';

describe('objectifs personnalisés mesurables', () => {
  it('lit les nombres écrits en toutes lettres', () => {
    expect(frenchNumber('quatre mille')).toBe(4000);
    expect(frenchNumber('deux mille')).toBe(2000);
    expect(frenchNumber('cent')).toBe(100);
    expect(frenchNumber('cinquante')).toBe(50);
    expect(frenchNumber('quinze')).toBe(15);
    expect(frenchNumber('25')).toBe(25);
  });

  it('reconnaît les règles du catalogue', () => {
    expect(parseCustom('Garder plus de quatre mille litres après l’exercice')).toEqual({ kind: 'water_keep', n: 4000, t: 0 });
    expect(parseCustom('Consommer moins de quatre mille litres')).toEqual({ kind: 'water_use', n: 4000, t: 0 });
    expect(parseCustom('Ne laisser aucun agent isolé plus de quinze secondes')).toEqual({ kind: 'no_isolated', n: 25, t: 15 });
    expect(parseCustom('Ne laisser aucun agent isolé')?.kind).toBe('no_isolated');
    expect(parseCustom('Rester sous le plafond de cent mètres')).toEqual({ kind: 'drone_ceiling', n: 100, t: 5 });
    expect(parseCustom('Ne pas voler à moins de cinquante mètres de la foule')?.n).toBe(50);
    expect(parseCustom('Rester à plus de dix mètres des lignes de police')?.n).toBe(10);
    expect(parseCustom('Ramener le blindé intact')?.kind).toBe('vehicle_intact');
    expect(parseCustom('Reprendre dix slogans')).toBeNull();
  });

  it('une part notable des objectifs personnalisés devient mesurable', () => {
    let n = 0, measured = 0;
    for (const m of MISSIONS) for (const o of m.objectives) {
      if (o.kind !== 'personnalise') continue;
      n++;
      if (parseCustom(o.text)) measured++;
    }
    console.log(`objectifs personnalisés : ${measured} mesurés sur ${n}`);
    expect(measured).toBeGreaterThanOrEqual(20);
  });
});
