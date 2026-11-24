import { describe, expect, it } from 'vitest';
import { chantBeats, estimateSpeechSeconds, speechBeats, syllabify, type Beat } from '@/audio/prosody';

const count = (t: string): number => syllabify(t).length;
const vowels = (t: string): string => syllabify(t).map((s) => s.vowel).join('');

describe('découpage en syllabes', () => {
  it('compte les syllabes de slogans courants', () => {
    expect(count('Tous ensemble')).toBe(3);        // tous-en-sem(ble)
    expect(count('On lâche rien')).toBe(3);        // on-lâ(che)-rien
    expect(count('Résistance')).toBe(3);           // ré-sis-tan(ce)
    expect(count('La rue, elle est à nous')).toBe(6);
    expect(count('Dispersez-vous')).toBe(4);
  });

  it('ignore le « e » muet final mais garde les mots d’une syllabe', () => {
    expect(count('porte')).toBe(1);
    expect(count('portes')).toBe(1);
    expect(count('portent')).toBe(1);
    expect(count('le')).toBe(1);
    expect(count('de')).toBe(1);
    expect(count('liberté')).toBe(3);
  });

  it('reconnaît la couleur des voyelles', () => {
    expect(vowels('nous')).toBe('u');
    expect(vowels('loi')).toBe('a');
    expect(vowels('beau')).toBe('o');
    expect(vowels('paix')).toBe('e');
    expect(vowels('ami')).toBe('ai');
    expect(vowels('on')).toBe('o');
    expect(vowels('enfant')).toBe('aa');
  });

  it('accentue la fin des mots pleins et marque les respirations', () => {
    const s = syllabify('Retrait, retrait du projet !');
    expect(s.map((x) => x.stress)).toEqual([false, true, false, true, false, false, true]);
    expect(s.map((x) => x.pause)).toEqual([false, true, false, false, false, false, true]);
  });

  it('la dernière syllabe est toujours accentuée et suivie d’une respiration', () => {
    const s = syllabify('on est là');
    expect(s[s.length - 1]).toMatchObject({ stress: true, pause: true });
  });

  it('texte vide ou sans lettres : aucune syllabe', () => {
    expect(syllabify('')).toEqual([]);
    expect(syllabify('… !! 123 —')).toEqual([]);
  });

  it('plafonne les textes très longs et réutilise le tableau fourni', () => {
    const out = syllabify('a', []);
    const long = 'Obéissance à la loi, vous participez à un attroupement, nous allons faire usage de la force, quittez immédiatement les lieux';
    expect(syllabify(long, out)).toBe(out);
    expect(out.length).toBe(28);
  });
});

describe('rythme scandé', () => {
  it('une syllabe par temps, un silence après chaque respiration, phrase bouclée sur un nombre pair de temps', () => {
    const beats: Beat[] = [];
    const total = chantBeats(syllabify('Tous ensemble, tous ensemble, ouais !'), 0.3, beats);
    expect(beats.length).toBe(7);
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.t).toBeGreaterThan(beats[i - 1]!.t);
    // 7 syllabes + 3 silences = 10 temps
    expect(total).toBeCloseTo(10 * 0.3, 6);
    expect(Math.round(total / 0.3) % 2).toBe(0);
  });

  it('les syllabes accentuées sont tenues plus longtemps, sans jamais déborder sur la suivante', () => {
    const beats: Beat[] = [];
    chantBeats(syllabify('On lâche rien'), 0.3, beats);
    const stressed = beats.filter((b) => b.stress);
    const plain = beats.filter((b) => !b.stress);
    expect(stressed.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    expect(stressed[0]!.len).toBeGreaterThan(plain[0]!.len);
    for (const b of beats) expect(b.len).toBeLessThan(0.3);
  });

  it('une phrase d’un nombre impair de temps est complétée par un silence', () => {
    const beats: Beat[] = [];
    // « non » : 1 syllabe + 1 silence = 2 temps (déjà pair) ; « non non » : 2 + 1 = 3 → 4
    expect(chantBeats(syllabify('non'), 0.25, beats)).toBeCloseTo(0.5, 6);
    expect(chantBeats(syllabify('non non'), 0.25, beats)).toBeCloseTo(1.0, 6);
  });
});

describe('débit de parole', () => {
  it('durée croissante avec la longueur, proportionnelle à l’inverse du débit', () => {
    const short = estimateSpeechSeconds('Reçu.');
    const long = estimateSpeechSeconds('Alpha 1 de Autorité, tenez la ligne à hauteur de la place.');
    expect(short).toBeGreaterThan(0.2);
    expect(long).toBeGreaterThan(short * 3);
    expect(estimateSpeechSeconds('Reçu.', 2)).toBeCloseTo(short / 2, 6);
    expect(estimateSpeechSeconds('')).toBe(0);
  });

  it('les temps de parole sont croissants et la durée totale couvre la dernière syllabe', () => {
    const beats: Beat[] = [];
    let seed = 1;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const total = speechBeats(syllabify('Première sommation : on va faire usage de la force.'), 1, rnd, beats);
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.t).toBeGreaterThan(beats[i - 1]!.t);
    const last = beats[beats.length - 1]!;
    expect(total).toBeGreaterThanOrEqual(last.t + last.len);
  });
});
