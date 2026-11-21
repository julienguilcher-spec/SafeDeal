import { describe, expect, it } from 'vitest';
import {
  AUDIBLE_EPS, HYSTERESIS, MAX_VOICES, PRIORITY_AMBIENT, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_VITAL,
  admitVoice, rebalanceVoices, voiceScore, type AdmitResult, type Rebalance, type VoiceCandidate,
} from '@/audio/voicePool';

function voice(handle: number, priority: number, gain: number, real = true): VoiceCandidate {
  return { handle, priority, gain, real };
}

const admit = (c: VoiceCandidate[], cap: number, p: number, g: number): AdmitResult =>
  admitVoice(c, cap, p, g, { admit: false, evict: 0 });
const balance = (c: VoiceCandidate[], cap: number): Rebalance => rebalanceVoices(c, cap, { start: [], stop: [] });

describe('réserve de voix : score', () => {
  it('la priorité domine, le gain départage', () => {
    expect(voiceScore(PRIORITY_HIGH, 0.01)).toBeGreaterThan(voiceScore(PRIORITY_NORMAL, 1));
    expect(voiceScore(PRIORITY_NORMAL, 0.8)).toBeGreaterThan(voiceScore(PRIORITY_NORMAL, 0.2));
    expect(voiceScore(PRIORITY_VITAL, 5)).toBeLessThan(PRIORITY_VITAL + 1);
  });

  it('un son inaudible a un score négatif', () => {
    expect(voiceScore(PRIORITY_VITAL, 0)).toBe(-1);
    expect(voiceScore(PRIORITY_VITAL, AUDIBLE_EPS * 0.5)).toBe(-1);
    expect(voiceScore(PRIORITY_AMBIENT, Number.NaN)).toBe(-1);
  });

  it('la capacité est de 32 sons simultanés', () => {
    expect(MAX_VOICES).toBe(32);
  });
});

describe('réserve de voix : admission', () => {
  it('admet tant qu’il reste de la place, sans évincer personne', () => {
    const r = admit([voice(1, 1, 0.5), voice(2, 1, 0.5)], 3, PRIORITY_AMBIENT, 0.1);
    expect(r).toEqual({ admit: true, evict: 0 });
  });

  it('refuse un son inaudible même s’il reste de la place', () => {
    expect(admit([], 4, PRIORITY_VITAL, 0).admit).toBe(false);
  });

  it('les voix virtuelles ne comptent pas dans la capacité', () => {
    const r = admit([voice(1, 1, 0.5), voice(2, 1, 0.5, false), voice(3, 1, 0.5, false)], 2, 1, 0.3);
    expect(r).toEqual({ admit: true, evict: 0 });
  });

  it('réserve pleine : à priorité égale, c’est le son le plus lointain (le plus faible) qui est coupé', () => {
    const cands = [voice(1, 1, 0.9), voice(2, 1, 0.05), voice(3, 1, 0.4)];
    const r = admit(cands, 3, PRIORITY_NORMAL, 0.6);
    expect(r).toEqual({ admit: true, evict: 2 });
  });

  it('réserve pleine : un son plus faible que tous les autres est refusé', () => {
    const cands = [voice(1, 1, 0.9), voice(2, 1, 0.5), voice(3, 1, 0.4)];
    expect(admit(cands, 3, PRIORITY_NORMAL, 0.1).admit).toBe(false);
  });

  it('une priorité supérieure passe devant un son plus proche mais moins important', () => {
    const cands = [voice(1, PRIORITY_AMBIENT, 1), voice(2, PRIORITY_NORMAL, 0.9)];
    const r = admit(cands, 2, PRIORITY_HIGH, 0.02);
    expect(r).toEqual({ admit: true, evict: 1 });
  });

  it('un son ordinaire, même tout proche, n’évince pas un son vital lointain', () => {
    const cands = [voice(1, PRIORITY_VITAL, 0.01), voice(2, PRIORITY_VITAL, 0.02)];
    expect(admit(cands, 2, PRIORITY_NORMAL, 1).admit).toBe(false);
  });

  it('hystérésis : il faut dépasser nettement la voix la plus faible pour prendre sa place', () => {
    const cands = [voice(1, 1, 0.5)];
    expect(admit(cands, 1, 1, 0.5 + HYSTERESIS * 0.5).admit).toBe(false);
    expect(admit(cands, 1, 1, 0.5 + HYSTERESIS * 1.5).admit).toBe(true);
  });
});

describe('réserve de voix : rééquilibrage', () => {
  it('garde les meilleures voix et ne dépasse jamais la capacité', () => {
    const cands: VoiceCandidate[] = [];
    for (let i = 0; i < 100; i++) cands.push(voice(i + 1, i % 4, ((i * 37) % 100) / 100 + 0.01, i % 3 === 0));
    const cap = 32;
    const r = balance(cands, cap);
    const real = new Set(cands.filter((c) => c.real).map((c) => c.handle));
    for (const h of r.stop) real.delete(h);
    for (const h of r.start) real.add(h);
    expect(real.size).toBe(cap);
    // toute voix gardée vaut au moins autant que toute voix écartée (à l'hystérésis près)
    const kept = cands.filter((c) => real.has(c.handle)).map((c) => voiceScore(c.priority, c.gain));
    const out = cands.filter((c) => !real.has(c.handle)).map((c) => voiceScore(c.priority, c.gain));
    expect(Math.min(...kept)).toBeGreaterThanOrEqual(Math.max(...out) - HYSTERESIS - 1e-9);
  });

  it('une boucle virtuelle redevenue audible redémarre s’il y a de la place', () => {
    const r = balance([voice(1, 2, 0.4, false), voice(2, 1, 0.3, true)], 4);
    expect(r.start).toEqual([1]);
    expect(r.stop).toEqual([]);
  });

  it('une voix réelle devenue inaudible est coupée, même si la réserve est vide', () => {
    const r = balance([voice(1, 3, 0, true)], 8);
    expect(r.stop).toEqual([1]);
    expect(r.start).toEqual([]);
  });

  it('une boucle virtuelle inaudible reste virtuelle', () => {
    const r = balance([voice(1, 3, 0.001, false)], 8);
    expect(r.start).toEqual([]);
  });

  it('réserve pleine : la boucle virtuelle prioritaire remplace la voix réelle la plus faible', () => {
    const r = balance([voice(1, 1, 0.2, true), voice(2, 1, 0.7, true), voice(3, 2, 0.3, false)], 2);
    expect(r.start).toEqual([3]);
    expect(r.stop).toEqual([1]);
  });

  it('pas de bascule entre deux voix presque à égalité (hystérésis)', () => {
    const r = balance([voice(1, 1, 0.5, true), voice(2, 1, 0.52, false)], 1);
    expect(r.start).toEqual([]);
    expect(r.stop).toEqual([]);
  });

  it('réutilise les tableaux de sortie sans garder d’anciennes valeurs', () => {
    const out: Rebalance = { start: [99], stop: [98] };
    rebalanceVoices([voice(1, 1, 0.5, true)], 4, out);
    expect(out.start).toEqual([]);
    expect(out.stop).toEqual([]);
  });
});
