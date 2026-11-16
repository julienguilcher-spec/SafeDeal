// Tests de la vue à la première personne : bras résolus en espace caméra (x droite, y haut, -z devant).
import { describe, expect, it } from 'vitest';
import { FpRig } from '@/render/people/fp';
import { createAnimSample } from '@/render/people/animator';
import { BONE_COUNT, BONE_HAND_L, BONE_HAND_R, BONE_STRIDE, L_FORE, L_UPPER, BONE_ARM_R, BONE_FORE_R } from '@/render/people/skeleton';
import { HOLD_LONG, HOLD_NONE, HOLD_SHIELD, HOLD_SMALL, HOLD_STICK, UPPER_NAMES, upperId } from '@/render/people/poseparams';

function run(upper: string, hold: number, t: number, alt = false): Float32Array {
  const rig = new FpRig();
  const sm = createAnimSample();
  sm.upper = upperId(upper); sm.hold = hold; sm.upperT = t; sm.alt = alt;
  const out = new Float32Array(BONE_COUNT * BONE_STRIDE);
  rig.update(sm, 1, 0.2, 0, out, 0);
  return out;
}

const pos = (o: Float32Array, b: number): number[] => [o[b * BONE_STRIDE + 4], o[b * BONE_STRIDE + 5], o[b * BONE_STRIDE + 6]];

describe('rendu des personnages — première personne', () => {
  it('toutes les animations donnent des os finis et des bras de longueur constante', () => {
    for (const u of UPPER_NAMES.slice(0, 37)) {
      for (const hold of [HOLD_NONE, HOLD_STICK, HOLD_SHIELD, HOLD_LONG, HOLD_SMALL]) {
        for (const t of [0, 0.2, 0.4, 0.9]) {
          const o = run(u, hold, t);
          for (let k = 0; k < o.length; k++) expect(Number.isFinite(o[k]), `${u} ${hold} ${t}`).toBe(true);
          const sh = pos(o, BONE_ARM_R), el = pos(o, BONE_FORE_R), wr = pos(o, BONE_HAND_R);
          expect(Math.hypot(sh[0] - el[0], sh[1] - el[1], sh[2] - el[2])).toBeCloseTo(L_UPPER, 3);
          expect(Math.hypot(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2])).toBeCloseTo(L_FORE, 3);
        }
      }
    }
  });

  it('visée au pistolet : les deux mains sont devant la caméra, près de l’axe du regard', () => {
    const o = run('aim_pistol', HOLD_SMALL, 0, true);
    const r = pos(o, BONE_HAND_R), l = pos(o, BONE_HAND_L);
    expect(r[2]).toBeLessThan(-0.25);           // devant (−z)
    expect(l[2]).toBeLessThan(-0.25);
    expect(Math.abs(r[0])).toBeLessThan(0.15);  // proche du centre
    expect(r[1]).toBeGreaterThan(-0.25);        // sous l'œil mais dans le champ
    expect(r[1]).toBeLessThan(0.05);
  });

  it('bâton en main au repos : la main droite est remontée dans le champ, à droite', () => {
    const o = run('none', HOLD_STICK, 0);
    const r = pos(o, BONE_HAND_R);
    expect(r[0]).toBeGreaterThan(0.05);         // à droite de l'écran (+x)
    expect(r[2]).toBeLessThan(-0.15);
    const idle = run('none', HOLD_NONE, 0);
    // mains nues : bras le long du corps, hors du champ (bien plus bas)
    expect(pos(idle, BONE_HAND_R)[1]).toBeLessThan(r[1] - 0.2);
  });

  it('bouclier levé : la main gauche vient devant le visage', () => {
    const o = run('block', HOLD_SHIELD, 0, true);
    const l = pos(o, BONE_HAND_L);
    expect(l[2]).toBeLessThan(-0.12);
    expect(l[1]).toBeGreaterThan(-0.45);
  });

  it('lancer : la main part derrière puis passe devant', () => {
    const cocked = pos(run('throw', HOLD_SMALL, 0.29), BONE_HAND_R);
    const released = pos(run('throw', HOLD_SMALL, 0.46), BONE_HAND_R);
    expect(cocked[2]).toBeGreaterThan(released[2] + 0.4);
    expect(released[2]).toBeLessThan(-0.25);
  });
});
