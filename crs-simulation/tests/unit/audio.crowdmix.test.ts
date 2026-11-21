import { describe, expect, it } from 'vitest';
import type { CrowdPhase } from '@/core/contracts';
import { cityLevel, computeCrowdMix, crowdPresence, dominantLayer, type CrowdInput, type CrowdMix } from '@/audio/crowdMix';

function mix(partial: Partial<CrowdInput>): CrowdMix {
  const input: CrowdInput = { count: 80, meanDistance: 10, anger: 0.1, fear: 0, phase: 'cortege', tension: 0.1, ...partial };
  return computeCrowdMix(input, { presence: 0, murmur: 0, chant: 0, boo: 0, whistle: 0, panic: 0, drums: 0 });
}

const LAYERS = ['murmur', 'chant', 'boo', 'whistle', 'panic', 'drums'] as const;
const PHASES: CrowdPhase[] = ['aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion', 'apres_manif', 'terminee'];

describe('mixage de foule', () => {
  it('personne autour : silence complet, quelle que soit la phase', () => {
    for (const phase of PHASES) {
      const m = mix({ count: 0, phase, anger: 1, fear: 1, tension: 1 });
      expect(m.presence).toBe(0);
      for (const k of LAYERS) expect(m[k]).toBe(0);
      expect(dominantLayer(m)).toBe('silence');
    }
  });

  it('toutes les couches restent dans [0, 1] pour tout état', () => {
    for (const phase of PHASES) {
      for (const count of [1, 20, 300]) {
        for (const anger of [0, 0.5, 1]) {
          for (const fear of [0, 0.5, 1]) {
            for (const tension of [0, 1]) {
              const m = mix({ phase, count, anger, fear, tension });
              for (const k of LAYERS) {
                expect(m[k]).toBeGreaterThanOrEqual(0);
                expect(m[k]).toBeLessThanOrEqual(1);
                expect(Number.isFinite(m[k])).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('la présence croît avec le nombre et sature', () => {
    expect(crowdPresence(10, 5)).toBeLessThan(crowdPresence(40, 5));
    expect(crowdPresence(40, 5)).toBeLessThan(crowdPresence(200, 5));
    expect(crowdPresence(40, 5)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(crowdPresence(5000, 5)).toBeLessThanOrEqual(1);
    expect(crowdPresence(-3, 5)).toBe(0);
  });

  it('une foule lointaine s’entend moins qu’une foule qui vous entoure', () => {
    expect(crowdPresence(80, 65)).toBeLessThan(crowdPresence(80, 10) * 0.6);
  });

  it('rassemblement calme : le murmure domine', () => {
    const m = mix({ phase: 'rassemblement', anger: 0.05 });
    expect(dominantLayer(m)).toBe('murmur');
    expect(m.panic).toBe(0);
    expect(m.boo).toBeLessThan(0.1);
  });

  it('cortège paisible : slogans scandés et tambours dominent', () => {
    const m = mix({ phase: 'cortege', anger: 0.15, fear: 0 });
    expect(dominantLayer(m)).toBe('chant');
    expect(m.chant).toBeGreaterThan(0.6);
    expect(m.drums).toBeGreaterThan(0.5);
    expect(m.panic).toBe(0);
  });

  it('la colère transforme les slogans en huées et en sifflets', () => {
    const calm = mix({ phase: 'tension', anger: 0.2 });
    const angry = mix({ phase: 'tension', anger: 0.95 });
    expect(angry.boo).toBeGreaterThan(calm.boo);
    expect(angry.whistle).toBeGreaterThan(calm.whistle);
    expect(angry.chant).toBeLessThan(calm.chant);
    expect(dominantLayer(mix({ phase: 'affrontement', anger: 0.9, fear: 0.1 }))).toBe('boo');
  });

  it('la peur fait taire slogans et tambours et déclenche la panique', () => {
    const scared = mix({ phase: 'cortege', fear: 0.9 });
    const serene = mix({ phase: 'cortege', fear: 0 });
    expect(scared.panic).toBeGreaterThan(0.6);
    expect(scared.chant).toBeLessThan(serene.chant * 0.25);
    expect(scared.drums).toBeLessThan(0.05);
    expect(dominantLayer(scared)).toBe('panic');
  });

  it('la panique est monotone avec la peur, les huées avec la colère', () => {
    let prevPanic = -1;
    let prevBoo = -1;
    for (let v = 0; v <= 1.0001; v += 0.1) {
      const p = mix({ phase: 'affrontement', fear: v, anger: 0.3 }).panic;
      const b = mix({ phase: 'affrontement', anger: v, fear: 0.1 }).boo;
      expect(p).toBeGreaterThanOrEqual(prevPanic - 1e-9);
      expect(b).toBeGreaterThanOrEqual(prevBoo - 1e-9);
      prevPanic = p;
      prevBoo = b;
    }
  });

  it('la tension coupe les percussions', () => {
    expect(mix({ phase: 'cortege', tension: 0.95 }).drums).toBeLessThan(mix({ phase: 'cortege', tension: 0.1 }).drums * 0.4);
  });

  it('plus de monde = plus fort, à état égal', () => {
    const small = mix({ count: 10 });
    const big = mix({ count: 150 });
    for (const k of ['murmur', 'chant', 'drums'] as const) expect(big[k]).toBeGreaterThan(small[k]);
  });

  it('hors manifestation, un attroupement ne fait que murmurer', () => {
    const m = mix({ phase: 'aucune', count: 30, anger: 0, fear: 0, tension: 0 });
    expect(m.murmur).toBeGreaterThan(0.2);
    expect(m.chant).toBe(0);
    expect(m.drums).toBe(0);
  });

  it('écrit dans l’objet fourni', () => {
    const out: CrowdMix = { presence: 9, murmur: 9, chant: 9, boo: 9, whistle: 9, panic: 9, drums: 9 };
    const r = computeCrowdMix({ count: 0, meanDistance: 0, anger: 0, fear: 0, phase: 'cortege', tension: 0 }, out);
    expect(r).toBe(out);
    expect(out.chant).toBe(0);
  });
});

describe('rumeur de la ville selon l’heure', () => {
  it('creux de la nuit, pointes du matin et du soir', () => {
    expect(cityLevel(4)).toBeLessThan(0.25);
    expect(cityLevel(8.5)).toBeGreaterThan(0.9);
    expect(cityLevel(18)).toBeGreaterThan(0.9);
    expect(cityLevel(4)).toBeLessThan(cityLevel(14));
    expect(cityLevel(14)).toBeLessThan(cityLevel(18));
  });

  it('continue à minuit et périodique sur 24 h', () => {
    expect(cityLevel(0)).toBeCloseTo(cityLevel(24), 6);
    expect(cityLevel(23.999)).toBeCloseTo(cityLevel(0.001), 2);
    expect(cityLevel(27)).toBeCloseTo(cityLevel(3), 6);
    expect(cityLevel(-2)).toBeCloseTo(cityLevel(22), 6);
  });

  it('une manifestation coupe la circulation alentour', () => {
    expect(cityLevel(15, 1)).toBeLessThan(cityLevel(15, 0) * 0.6);
  });

  it('reste dans [0, 1] à toute heure', () => {
    for (let h = 0; h <= 24; h += 0.25) {
      expect(cityLevel(h)).toBeGreaterThanOrEqual(0);
      expect(cityLevel(h)).toBeLessThanOrEqual(1);
    }
  });
});
