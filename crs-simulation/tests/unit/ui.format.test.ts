// Interface — mise en forme française (nombres, heures, durées, distances) et lecture tolérante des services facultatifs.
import { describe, expect, it } from 'vitest';
import {
  NBSP, NNBSP, capitalize, cardinal8, cardinalName, decimal, distanceLabel, durationLabel, hourClock, hourLabel, int, percent, plural,
  quote, speedLabel, stopwatch, times,
} from '@/ui/core/format';
import { readCauses, readMissionResult, readMissions } from '@/ui/screens/services';
import { TIPS, tipsFor } from '@/ui/screens/tips';

describe('ui/format', () => {
  it('nombres : séparateur de milliers en espace fine insécable, virgule décimale', () => {
    expect(int(5)).toBe('5');
    expect(int(1200)).toBe(`1${NNBSP}200`);
    expect(int(1234567)).toBe(`1${NNBSP}234${NNBSP}567`);
    expect(int(-4200)).toBe(`−4${NNBSP}200`);
    expect(int(NaN)).toBe('—');
    expect(decimal(0.75, 2)).toBe('0,75');
    expect(decimal(12.34, 1)).toBe('12,3');
    expect(times(0.75)).toBe('×0,75');
    expect(percent(0.456)).toBe(`46${NBSP}%`);
    expect(percent(7)).toBe(`100${NBSP}%`);
  });

  it('heures', () => {
    expect(hourLabel(14.5)).toBe(`14${NBSP}h${NBSP}30`);
    expect(hourLabel(9)).toBe(`9${NBSP}h${NBSP}00`);
    expect(hourLabel(23.999)).toBe(`0${NBSP}h${NBSP}00`);
    expect(hourLabel(-1)).toBe(`23${NBSP}h${NBSP}00`);
    expect(hourClock(14.5)).toBe('14:30');
    expect(hourClock(7.25)).toBe('07:15');
  });

  it('durées et distances', () => {
    expect(stopwatch(75)).toBe('1:15');
    expect(stopwatch(3725)).toBe('1:02:05');
    expect(stopwatch(-3)).toBe('0:00');
    expect(durationLabel(40)).toBe(`40${NBSP}s`);
    expect(durationLabel(1500)).toBe(`25${NBSP}min`);
    expect(durationLabel(3725)).toBe(`1${NBSP}h${NBSP}02`);
    expect(durationLabel(Infinity)).toBe('temps réel');
    expect(distanceLabel(8.4)).toBe(`8${NBSP}m`);
    expect(distanceLabel(123)).toBe(`125${NBSP}m`);
    expect(distanceLabel(1250)).toBe(`1,3${NBSP}km`);
    expect(speedLabel(10)).toBe(`36${NBSP}km/h`);
  });

  it('accords, guillemets, points cardinaux', () => {
    expect(plural(1, 'section', 'sections')).toBe(`1${NBSP}section`);
    expect(plural(4, 'section', 'sections')).toBe(`4${NBSP}sections`);
    expect(plural(0, 'drone', 'drones')).toBe(`0${NBSP}drone`);
    expect(quote('Lancer')).toBe(`«${NBSP}Lancer${NBSP}»`);
    expect(capitalize('place de la Concorde')).toBe('Place de la Concorde');
    expect(capitalize('étoile')).toBe('Étoile');
    expect(cardinal8(0)).toBe('N');
    expect(cardinal8(225)).toBe('SO');
    expect(cardinal8(-90)).toBe('O');
    expect(cardinal8(359)).toBe('N');
    expect(cardinalName(315)).toBe('nord-ouest');
  });
});

describe('ui/services facultatifs', () => {
  it('missions : tableau, propriété ou fonction ; synonymes acceptés ; entrées invalides écartées', () => {
    expect(readMissions(undefined)).toEqual([]);
    expect(readMissions(42)).toEqual([]);
    const list = readMissions({
      catalog: () => [
        { id: 'M01', title: 'Premier samedi', roles: ['crs'], type: 'Manifestation déclarée', difficulty: 1, summary: 'Tenir sa place.', place: 'Place de la République', config: { crowdSize: 400 } },
        { id: 'M02', titre: 'Pluie de pavés', role: 'crs', categorie: 'Dégénère', difficulte: 9, description: 'Ça dégénère.', defaults: { place: 'Place de la Bastille' } },
        { id: 'M02', title: 'doublon' },
        { title: 'sans identifiant' },
        null,
      ],
    });
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ id: 'M01', title: 'Premier samedi', roles: ['crs'], type: 'Manifestation déclarée', difficulty: 1, summary: 'Tenir sa place.', place: 'Place de la République', config: { crowdSize: 400 } });
    expect(list[1]).toMatchObject({ id: 'M02', title: 'Pluie de pavés', roles: ['crs'], type: 'Dégénère', difficulty: 5, summary: 'Ça dégénère.', place: 'Place de la Bastille' });
    expect(readMissions([{ id: 'x', name: 'Direct' }]).map((m) => m.title)).toEqual(['Direct']);
    expect(readMissions({ list: () => { throw new Error('boum'); } })).toEqual([]);
  });

  it('causes : chaînes ou objets', () => {
    expect(readCauses(undefined)).toEqual([]);
    expect(readCauses(['retraites', 'climat', 'retraites'])).toEqual([{ id: 'retraites', label: 'Retraites' }, { id: 'climat', label: 'Climat' }]);
    expect(readCauses({ list: [{ id: 'horizon', label: 'projet Horizon' }, { nom: 'sans id' }] })).toEqual([{ id: 'horizon', label: 'Projet Horizon' }]);
  });

  it('résultat de mission : tous les champs sont facultatifs', () => {
    expect(readMissionResult(undefined)).toBeNull();
    expect(readMissionResult({})).toBeNull();
    expect(readMissionResult({ result: null })).toBeNull();
    const r = readMissionResult({ result: { title: 'Le pont', success: true, score: 140, grade: 'Bien', lines: [{ label: 'Barrage tenu', value: '25 min', delta: 20 }, { value: 3 }, { label: 'Tir', valeur: -12, motif: 'trop tôt' }] } });
    expect(r).toEqual({ title: 'Le pont', success: true, score: 100, grade: 'Bien', lines: [{ label: 'Barrage tenu', value: '25 min', delta: 20 }, { label: 'Tir', value: -12, note: 'trop tôt' }] });
    expect(readMissionResult({ debrief: () => ({ reussite: false }) })).toEqual({ success: false });
  });
});

describe('ui/conseils de chargement', () => {
  it('chaque rôle reçoit des conseils, les siens d’abord, tous en français soigné', () => {
    const roles = ['crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote', 'street_medic', 'secouriste', 'journaliste', 'manifestant'] as const;
    for (const role of roles) {
      const tips = tipsFor(role);
      expect(tips.length).toBeGreaterThanOrEqual(3);
      for (const t of tips) expect(!t.roles || t.roles.includes(role)).toBe(true);
    }
    expect(tipsFor('gendarme_centaure')[0]!.text).toContain('Centaure');
    expect(tipsFor(null).every((t) => !t.roles)).toBe(true);
    for (const t of TIPS) {
      expect(t.text.endsWith('.')).toBe(true);
      expect(t.text).not.toMatch(/'/); // apostrophes typographiques
      expect(t.text.length).toBeLessThan(170);
    }
  });
});
