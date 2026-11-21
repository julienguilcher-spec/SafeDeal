import { describe, expect, it } from 'vitest';
import {
  CUTOFF_OCCLUDED, CUTOFF_OPEN, SPEED_OF_SOUND, behindFactor, computeSpatial, distanceGain, dopplerFactor,
  lowpassCutoff, propagationDelay, stereoPan, type SpatialProfile, type SpatialResult,
} from '@/audio/spatial';

const profile: SpatialProfile = { refDistance: 4, maxDistance: 120, rolloff: 1 };
const res = (): SpatialResult => ({ gain: 0, pan: 0, cutoff: 0, distance: 0 });

describe('atténuation par la distance', () => {
  it('plein volume jusqu’à la distance de référence', () => {
    expect(distanceGain(0, profile)).toBe(1);
    expect(distanceGain(4, profile)).toBe(1);
  });

  it('décroît strictement puis s’annule à la portée', () => {
    let prev = 1;
    for (let d = 5; d < 120; d += 5) {
      const g = distanceGain(d, profile);
      expect(g).toBeLessThan(prev);
      expect(g).toBeGreaterThan(0);
      prev = g;
    }
    expect(distanceGain(120, profile)).toBe(0);
    expect(distanceGain(500, profile)).toBe(0);
  });

  it('suit la loi inverse loin du fondu final : moitié du niveau à deux fois la référence', () => {
    expect(distanceGain(8, profile)).toBeCloseTo(0.5, 5);
    expect(distanceGain(16, profile)).toBeCloseTo(0.25, 5);
  });

  it('n’a pas de marche à la portée maximale (fondu continu)', () => {
    expect(distanceGain(119.9, profile)).toBeLessThan(0.001);
  });

  it('une distance non finie donne un gain nul', () => {
    expect(distanceGain(Number.NaN, profile)).toBe(0);
  });
});

describe('panoramique stéréo (repère du contrat : x = est, z = sud, cap 0 = regard vers +z)', () => {
  it('regard vers le sud : une source à l’est est à GAUCHE, à l’ouest à DROITE', () => {
    expect(stereoPan(10, 0, 0)).toBeLessThan(-0.8);
    expect(stereoPan(-10, 0, 0)).toBeGreaterThan(0.8);
  });

  it('une source droit devant ou droit derrière est centrée', () => {
    expect(stereoPan(0, 10, 0)).toBeCloseTo(0, 6);
    expect(stereoPan(0, -10, 0)).toBeCloseTo(0, 6);
  });

  it('suit l’orientation de l’auditeur : regard vers l’est, le sud est à droite', () => {
    const east = Math.PI / 2; // avant = (sin h, cos h) = (1, 0)
    expect(stereoPan(0, 10, east)).toBeGreaterThan(0.8);
    expect(stereoPan(0, -10, east)).toBeLessThan(-0.8);
    expect(stereoPan(10, 0, east)).toBeCloseTo(0, 6);
  });

  it('reste dans [-1, 1] et se recentre à très courte distance', () => {
    expect(Math.abs(stereoPan(1000, 0, 0))).toBeLessThanOrEqual(1);
    expect(Math.abs(stereoPan(0.2, 0, 0))).toBeLessThan(0.01);
    expect(stereoPan(0, 0, 0)).toBe(0);
  });

  it('est antisymétrique', () => {
    expect(stereoPan(6, 3, 0.7)).toBeCloseTo(-stereoPan(-6, -3, 0.7), 9);
  });
});

describe('filtre passe-bas', () => {
  it('ouvert au contact, de plus en plus fermé avec la distance', () => {
    expect(lowpassCutoff(0, 0)).toBe(CUTOFF_OPEN);
    let prev = CUTOFF_OPEN;
    for (const d of [10, 30, 60, 150, 300, 600]) {
      const c = lowpassCutoff(d, 0);
      expect(c).toBeLessThan(prev);
      prev = c;
    }
    expect(lowpassCutoff(60, 0)).toBeCloseTo(10000, -2);
  });

  it('une source masquée est fortement assourdie', () => {
    expect(lowpassCutoff(10, 1)).toBeCloseTo(CUTOFF_OCCLUDED, 5);
    expect(lowpassCutoff(10, 0.5)).toBeLessThan(lowpassCutoff(10, 0));
    expect(lowpassCutoff(10, 0.5)).toBeGreaterThan(lowpassCutoff(10, 1));
  });

  it('l’occlusion ne rouvre jamais le filtre d’une source déjà lointaine', () => {
    const far = lowpassCutoff(800, 0);
    expect(far).toBeLessThan(CUTOFF_OCCLUDED);
    expect(lowpassCutoff(800, 1)).toBeCloseTo(far, 6);
  });

  it('une source dans le dos perd un peu d’aigus', () => {
    expect(lowpassCutoff(20, 0, 1)).toBeLessThan(lowpassCutoff(20, 0, 0));
    expect(behindFactor(0, -10, 0)).toBeCloseTo(1, 6);
    expect(behindFactor(0, 10, 0)).toBe(0);
    expect(behindFactor(10, 0, 0)).toBeCloseTo(0, 9);
  });

  it('ne descend jamais sous 120 Hz', () => {
    expect(lowpassCutoff(1e6, 1, 1)).toBeGreaterThanOrEqual(120);
  });
});

describe('calcul complet', () => {
  it('combine distance, hauteur, occlusion et orientation', () => {
    const open = { ...computeSpatial(0, 1.7, 0, 0, 12, 1.7, 0, profile, 0, res()) };
    expect(open.distance).toBeCloseTo(12, 6);
    expect(open.gain).toBeCloseTo(distanceGain(12, profile), 6);
    expect(open.pan).toBeLessThan(0);
    const hidden = computeSpatial(0, 1.7, 0, 0, 12, 1.7, 0, profile, 1, res());
    expect(hidden.gain).toBeCloseTo(open.gain * 0.45, 6);
    expect(hidden.cutoff).toBeLessThan(open.cutoff);
  });

  it('tient compte de l’altitude (drone au-dessus de l’auditeur)', () => {
    const r = computeSpatial(0, 1.7, 0, 0, 0, 41.7, 0, profile, 0, res());
    expect(r.distance).toBeCloseTo(40, 6);
    expect(r.pan).toBe(0);
    expect(r.gain).toBeLessThan(0.2);
  });

  it('écrit dans l’objet fourni sans allouer', () => {
    const out = res();
    expect(computeSpatial(0, 0, 0, 0, 3, 0, 4, profile, 0, out)).toBe(out);
    expect(out.distance).toBeCloseTo(5, 9);
  });
});

describe('propagation et Doppler', () => {
  it('retard de propagation : 343 m/s, plafonné', () => {
    expect(propagationDelay(343)).toBeCloseTo(1, 6);
    expect(propagationDelay(34.3)).toBeCloseTo(0.1, 6);
    expect(propagationDelay(5000)).toBe(1.2);
    expect(propagationDelay(-3)).toBe(0);
    expect(SPEED_OF_SOUND).toBe(343);
  });

  it('une source qui approche sonne plus aigu, une source qui s’éloigne plus grave', () => {
    // source à 100 m à l'est, auditeur immobile à l'origine
    const approaching = dopplerFactor(0, 0, 0, 0, 100, 0, -20, 0);
    const receding = dopplerFactor(0, 0, 0, 0, 100, 0, 20, 0);
    expect(approaching).toBeCloseTo(343 / (343 - 20), 6);
    expect(receding).toBeCloseTo(343 / (343 + 20), 6);
  });

  it('un déplacement transversal ne change pas la hauteur', () => {
    expect(dopplerFactor(0, 0, 0, 0, 100, 0, 0, 25)).toBeCloseTo(1, 9);
  });

  it('l’auditeur qui avance vers la source entend plus aigu', () => {
    expect(dopplerFactor(0, 0, 15, 0, 100, 0, 0, 0)).toBeCloseTo((343 + 15) / 343, 6);
  });

  it('borné, et neutre quand la source est sur l’auditeur', () => {
    expect(dopplerFactor(0, 0, 0, 0, 100, 0, -300, 0)).toBe(1.25);
    expect(dopplerFactor(0, 0, 0, 0, 100, 0, 3000, 0)).toBe(0.8);
    expect(dopplerFactor(0, 0, 0, 0, 0.5, 0, -30, 0)).toBe(1);
  });
});
