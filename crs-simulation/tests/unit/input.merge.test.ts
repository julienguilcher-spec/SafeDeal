import { describe, expect, it } from 'vitest';
import {
  DEVICE_DWELL, DeviceTracker, MouseTravel, PAD_STICK_ACTIVITY, createSourceAxes, mergeAxes, padIsActive,
} from '@/input/merge';

describe('entrées — fusion des périphériques', () => {
  it('additionne les déplacements et borne la norme à 1', () => {
    const kbm = createSourceAxes();
    const pad = createSourceAxes();
    const out = createSourceAxes();
    kbm.moveY = 1;
    pad.moveX = 0.5;
    mergeAxes([kbm, pad], out);
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1, 9);
    expect(out.moveY).toBeGreaterThan(out.moveX);
    kbm.moveY = 0.3;
    pad.moveX = 0.2;
    pad.moveY = 0.1;
    mergeAxes([kbm, pad], out);
    expect(out.moveX).toBeCloseTo(0.2, 9);
    expect(out.moveY).toBeCloseTo(0.4, 9);
  });

  it('à pied la diagonale du clavier est normalisée ; en véhicule volant et accélérateur restent indépendants', () => {
    const kbm = createSourceAxes();
    const out = createSourceAxes();
    kbm.moveX = 1;
    kbm.moveY = 1;                                   // Z + D
    mergeAxes([kbm], out, true);
    expect(out.moveX).toBeCloseTo(Math.SQRT1_2, 9);
    expect(out.moveY).toBeCloseTo(Math.SQRT1_2, 9);
    mergeAxes([kbm], out, false);
    expect(out.moveX).toBe(1);                       // braquer à fond…
    expect(out.moveY).toBe(1);                       // … sans lever le pied
    const pad = createSourceAxes();
    pad.moveX = 0.8;
    mergeAxes([kbm, pad], out, false);
    expect(out.moveX).toBe(1);                       // chaque axe reste dans [-1, 1]
  });

  it('des directions opposées s\'annulent', () => {
    const a = createSourceAxes();
    const b = createSourceAxes();
    const out = createSourceAxes();
    a.moveX = 1;
    b.moveX = -1;
    mergeAxes([a, b], out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(0);
  });

  it('gâchettes : le maximum des sources, borné à 0..1', () => {
    const a = createSourceAxes();
    const b = createSourceAxes();
    const out = createSourceAxes();
    a.throttle = 1;
    b.throttle = 0.4;
    b.brake = 0.7;
    mergeAxes([a, b], out);
    expect(out.throttle).toBe(1);
    expect(out.brake).toBe(0.7);
    b.brake = 4;
    mergeAxes([a, b], out);
    expect(out.brake).toBe(1);
  });

  it('aucune source : tout à zéro ; valeurs non finies neutralisées', () => {
    const out = createSourceAxes();
    out.moveX = 0.7;
    mergeAxes([], out);
    expect(out).toEqual({ moveX: 0, moveY: 0, throttle: 0, brake: 0 });
    const bad = createSourceAxes();
    bad.moveX = NaN;
    mergeAxes([bad], out);
    expect(out.moveX).toBe(0);
  });
});

describe('entrées — périphérique actif', () => {
  it('le dernier périphérique utilisé l\'emporte', () => {
    const t = new DeviceTracker('kbm');
    expect(t.device).toBe('kbm');
    t.time = 10;
    expect(t.note('gamepad')).toBe(true);
    expect(t.device).toBe('gamepad');
    t.time = 10.1;
    expect(t.note('gamepad')).toBe(false);
    t.time = 11;
    expect(t.note('touch')).toBe(true);
    expect(t.device).toBe('touch');
    t.time = 12;
    expect(t.note('kbm')).toBe(true);
    expect(t.device).toBe('kbm');
    expect(t.version).toBe(3);
  });

  it('pas de clignotement : une bascule est refusée juste après la précédente', () => {
    const t = new DeviceTracker('kbm');
    t.time = 5;
    t.note('gamepad');
    t.time = 5 + DEVICE_DWELL / 2;
    expect(t.note('kbm')).toBe(false);
    expect(t.device).toBe('gamepad');
    t.time = 5 + DEVICE_DWELL + 0.01;
    expect(t.note('kbm')).toBe(true);
    expect(t.device).toBe('kbm');
  });

  it('repli immédiat quand le périphérique actif disparaît', () => {
    const t = new DeviceTracker('kbm');
    t.time = 1;
    t.note('gamepad');
    t.time = 1.01;
    expect(t.fallback('gamepad', 'kbm')).toBe(true);    // manette débranchée
    expect(t.device).toBe('kbm');
    t.time = 2;
    expect(t.fallback('gamepad', 'touch')).toBe(false);  // la manette n'était plus active
    expect(t.device).toBe('kbm');
  });

  it('manette : une dérive de stick ne compte pas comme un usage', () => {
    expect(padIsActive(0.05, 0, 0, 0, false)).toBe(false);
    expect(padIsActive(PAD_STICK_ACTIVITY, 0, 0, 0, false)).toBe(true);
    expect(padIsActive(0, 0.6, 0, 0, false)).toBe(true);
    expect(padIsActive(0, 0, 0.1, 0.1, false)).toBe(false);
    expect(padIsActive(0, 0, 0.5, 0, false)).toBe(true);
    expect(padIsActive(0, 0, 0, 0, true)).toBe(true);
  });

  it('souris : un tremblement ne bascule pas, un vrai mouvement oui', () => {
    const m = new MouseTravel(48, 160);
    let fired = false;
    for (let i = 0; i < 120; i++) fired = m.update(2, 1 / 60) || fired;   // 2 px par image : s'évapore
    expect(fired).toBe(false);
    fired = false;
    for (let i = 0; i < 6; i++) fired = m.update(15, 1 / 60) || fired;    // geste franc
    expect(fired).toBe(true);
  });
});
