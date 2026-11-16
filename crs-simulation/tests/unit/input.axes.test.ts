import { describe, expect, it } from 'vitest';
import {
  LOOK_STICK, MOVE_STICK, TOUCH_STICK, analogButton, clampUnit, curve, deadzone1, digitalMove, resetVirtualStick,
  shapePedal, shapeStick, shapeTrigger, shapeVirtualStick,
} from '@/input/axes';
import type { VirtualStick } from '@/input/axes';

const out = { x: 0, y: 0 };

describe('entrées — zones mortes et courbes', () => {
  it('zone morte d\'un axe : nulle en dessous, continue au bord, saturée au-delà', () => {
    expect(deadzone1(0.1, 0.2)).toBe(0);
    expect(deadzone1(-0.2, 0.2)).toBe(0);
    expect(deadzone1(0.2001, 0.2)).toBeCloseTo(0, 3);       // pas de saut au bord de la zone morte
    expect(deadzone1(0.6, 0.2)).toBeCloseTo(0.5, 6);
    expect(deadzone1(-0.6, 0.2)).toBeCloseTo(-0.5, 6);
    expect(deadzone1(1, 0.2)).toBe(1);
    expect(deadzone1(0.95, 0.2, 0.9)).toBe(1);
    expect(deadzone1(NaN, 0.2)).toBe(0);
  });

  it('stick : zone morte radiale, direction conservée', () => {
    expect(shapeStick(0.1, 0.1, MOVE_STICK, out)).toBe(0);  // norme 0,141 < 0,16
    expect(out).toEqual({ x: 0, y: 0 });
    // un axe sous le seuil ne disparaît pas si la norme dépasse la zone morte (pas d'effet « croix »)
    const n = shapeStick(0.5, 0.05, MOVE_STICK, out);
    expect(n).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0);
    expect(out.y / out.x).toBeCloseTo(0.1, 6);
  });

  it('stick : pleine course = norme 1, même en diagonale et au-delà de la butée', () => {
    expect(shapeStick(1, 0, MOVE_STICK, out)).toBe(1);
    expect(out.x).toBeCloseTo(1, 9);
    expect(shapeStick(0.75, 0.75, MOVE_STICK, out)).toBe(1);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 9);
    expect(shapeStick(1, 1, LOOK_STICK, out)).toBe(1);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 9);
  });

  it('stick : la courbe de réponse affine les petits mouvements sans changer les extrêmes', () => {
    const half = MOVE_STICK.inner + (MOVE_STICK.outer - MOVE_STICK.inner) / 2;
    const linear = shapeStick(half, 0, { ...LOOK_STICK, inner: MOVE_STICK.inner, outer: MOVE_STICK.outer, gamma: 1 }, out);
    expect(linear).toBeCloseTo(0.5, 6);
    const curved = shapeStick(half, 0, { inner: MOVE_STICK.inner, outer: MOVE_STICK.outer, gamma: 1.9 }, out);
    expect(curved).toBeCloseTo(Math.pow(0.5, 1.9), 6);
    expect(curved).toBeLessThan(linear);
    expect(curve(-0.5, 2)).toBeCloseTo(-0.25, 9);
    expect(curve(1, 3)).toBe(1);
  });

  it('stick : valeurs non finies ignorées', () => {
    expect(shapeStick(NaN, Infinity, MOVE_STICK, out)).toBe(0);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('gâchette : zone morte basse, saturation avant la butée, monotone', () => {
    expect(shapeTrigger(0)).toBe(0);
    expect(shapeTrigger(0.05)).toBe(0);
    expect(shapeTrigger(0.95)).toBe(1);
    expect(shapeTrigger(1)).toBe(1);
    expect(shapeTrigger(0.5)).toBeCloseTo((0.5 - 0.06) / 0.88, 6);
    let prev = -1;
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const s = shapeTrigger(v);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('bouton analogique : hystérésis', () => {
    expect(analogButton(0.39, false)).toBe(false);
    expect(analogButton(0.4, false)).toBe(true);
    expect(analogButton(0.3, true)).toBe(true);      // reste enfoncé entre les deux seuils
    expect(analogButton(0.25, true)).toBe(false);
    expect(analogButton(0.3, false)).toBe(false);    // ne s'enfonce pas entre les deux seuils
  });

  it('déplacement au clavier : diagonale normalisée, touches opposées annulées', () => {
    digitalMove(true, false, false, false, out);
    expect(out).toEqual({ x: 0, y: 1 });
    digitalMove(true, false, false, true, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 9);
    expect(out.x).toBeCloseTo(Math.SQRT1_2, 9);
    digitalMove(true, true, true, true, out);
    expect(out).toEqual({ x: 0, y: 0 });
    digitalMove(false, true, true, false, out);
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBeLessThan(0);
  });

  it('borne au disque unité', () => {
    expect(clampUnit(3, 4, out)).toBe(1);
    expect(out.x).toBeCloseTo(0.6, 9);
    expect(out.y).toBeCloseTo(0.8, 9);
    expect(clampUnit(0.3, 0.4, out)).toBeCloseTo(0.5, 9);
    expect(out).toEqual({ x: 0.3, y: 0.4 });
  });
});

describe('entrées — joystick virtuel et pédale tactiles', () => {
  const tuning = { radius: 60, ...TOUCH_STICK };
  const stick: VirtualStick = { x: 0, y: 0, knobX: 0, knobY: 0, full: false };

  it('zone morte au centre, « avant » = doigt vers le haut de l\'écran', () => {
    resetVirtualStick(stick);
    shapeVirtualStick(3, -3, tuning, stick);
    expect(stick.x).toBe(0);
    expect(stick.y).toBe(0);
    shapeVirtualStick(0, -30, tuning, stick);
    expect(stick.x).toBeCloseTo(0, 9);
    expect(stick.y).toBeGreaterThan(0.3);
    expect(stick.y).toBeLessThan(0.6);
    expect(stick.full).toBe(false);
  });

  it('poussé à fond = course, avec hystérésis ; pommeau borné au socle', () => {
    resetVirtualStick(stick);
    shapeVirtualStick(0, -50, tuning, stick);            // 83 % : marche rapide, pas de course
    expect(stick.full).toBe(false);
    shapeVirtualStick(0, -58, tuning, stick);            // 97 % : course
    expect(stick.full).toBe(true);
    shapeVirtualStick(0, -52, tuning, stick);            // 87 % : la course tient (hystérésis)
    expect(stick.full).toBe(true);
    shapeVirtualStick(0, -40, tuning, stick);            // 67 % : retour à la marche
    expect(stick.full).toBe(false);
    shapeVirtualStick(90, -120, tuning, stick);          // doigt hors du socle
    expect(stick.full).toBe(true);
    expect(Math.hypot(stick.knobX, stick.knobY)).toBeCloseTo(60, 6);
    expect(Math.hypot(stick.x, stick.y)).toBeCloseTo(1, 9);
    expect(stick.x).toBeCloseTo(0.6, 6);
    expect(stick.y).toBeCloseTo(0.8, 6);
  });

  it('pédale : filet de gaz en bas, pleine charge en haut', () => {
    expect(shapePedal(0)).toBeCloseTo(0.3, 9);
    expect(shapePedal(-0.2)).toBeCloseTo(0.3, 9);
    expect(shapePedal(0.36)).toBeCloseTo(0.65, 6);
    expect(shapePedal(0.72)).toBe(1);
    expect(shapePedal(1.4)).toBe(1);
  });
});
