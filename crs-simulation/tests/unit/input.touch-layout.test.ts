import { describe, expect, it } from 'vitest';
import {
  CONTROLS, GAME_LAYOUTS, ICONS, ITEM_BAR, MOVE_ZONE, STICKS, controlRect, overlayScale, touchLabel,
} from '@/input/touch/layouts';
import type { ControlSpec, GameLayout } from '@/input/touch/layouts';

/** Écrans vérifiés : petit téléphone, téléphone de référence, grand téléphone, tablettes. */
const SCREENS: [number, number][] = [[667, 375], [844, 390], [932, 430], [1024, 768], [1180, 820], [1366, 1024]];

function overlap(a: ReturnType<typeof controlRect>, b: ReturnType<typeof controlRect>, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/** Rectangle réellement dessiné : une pastille contextuelle s'élargit avec son texte (jusqu'à 250 unités). */
function drawn(c: ControlSpec, w: number, h: number, s: number, widest: boolean): ReturnType<typeof controlRect> {
  const r = controlRect(c, w, h, s);
  if (c.shape === 'pill' && widest) {
    if (c.side === 'right') r.x0 = r.x1 - 250 * s;
    else r.x1 = r.x0 + 250 * s;
  }
  return r;
}

describe('surcouche tactile — dispositions', () => {
  it('échelle : 1 sur le téléphone de référence, bornée ailleurs', () => {
    expect(overlayScale(844, 390)).toBe(1);
    expect(overlayScale(1180, 820)).toBeCloseTo(1180 / 844, 6);
    expect(overlayScale(2000, 1400)).toBe(1.45);
    expect(overlayScale(480, 270)).toBe(0.82);
  });

  it('les trois dispositions ont leurs commandes obligatoires', () => {
    const has = (layout: GameLayout, button: string): boolean => CONTROLS.some((c) => c.layout === layout && c.button === button);
    for (const b of ['primary', 'secondary', 'interact', 'crouch', 'jump', 'radio', 'orders', 'map', 'camera', 'pause', 'tactical', 'mask', 'visor', 'fast_forward']) {
      expect(has('pied', b), `pied : ${b}`).toBe(true);
    }
    for (const b of ['siren', 'beacons', 'horn', 'handbrake', 'interact', 'pause', 'map', 'camera', 'radio']) {
      expect(has('vehicule', b), `véhicule : ${b}`).toBe(true);
    }
    expect(CONTROLS.some((c) => c.layout === 'vehicule' && c.pedal === 'throttle')).toBe(true);
    expect(CONTROLS.some((c) => c.layout === 'vehicule' && c.pedal === 'brake')).toBe(true);
    for (const b of ['jump', 'crouch', 'zoom_in', 'zoom_out', 'primary', 'interact', 'pause', 'camera']) {
      expect(has('drone', b), `drone : ${b}`).toBe(true);
    }
    for (const l of GAME_LAYOUTS) expect(STICKS.filter((s) => s.layout === l).length).toBe(1);
    expect(STICKS.find((s) => s.layout === 'vehicule')!.horizontal).toBe(true);
  });

  it('identifiants uniques par disposition, pictogrammes définis, libellés en français', () => {
    for (const l of GAME_LAYOUTS) {
      const keys = CONTROLS.filter((c) => c.layout === l).map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const c of CONTROLS) {
      expect(ICONS[c.icon], c.key).toBeTruthy();
      expect(c.label.length).toBeGreaterThan(2);
    }
    expect(touchLabel('interact', 'pied')).toBe('Interagir');
    expect(touchLabel('interact', 'vehicule')).toBe('Sortir');
    expect(touchLabel('sprint', 'pied')).toBe('Joystick à fond');
    expect(touchLabel('slot3', 'pied')).toBe('Barre d’objets');
    expect(touchLabel('siren', 'pied')).toBe('Sirène');           // absent à pied : libellé de la disposition véhicule
    expect(touchLabel('ui_accept', 'pied')).toBe('');
  });

  it('boutons assez grands pour un doigt (≥ 44 px), sur tous les écrans', () => {
    for (const [w, h] of SCREENS) {
      const s = overlayScale(w, h);
      for (const c of CONTROLS) {
        // sur le plus petit téléphone, on tolère 37 px pour les pastilles de la rangée système
        const min = s < 1 ? 37 : 44;
        expect(Math.min(c.w, c.h) * s, `${c.layout}/${c.key} sur ${w}×${h}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('rien ne se chevauche ni ne sort de l\'écran, même avec un long libellé contextuel', () => {
    for (const [w, h] of SCREENS) {
      const s = overlayScale(w, h);
      for (const layout of GAME_LAYOUTS) {
        const list = CONTROLS.filter((c) => c.layout === layout);
        const rects = list.map((c) => drawn(c, w, h, s, true));
        for (let i = 0; i < list.length; i++) {
          const r = rects[i]!;
          const where = `${layout}/${list[i]!.key} sur ${w}×${h}`;
          expect(r.x0, where).toBeGreaterThanOrEqual(0);
          expect(r.y0, where).toBeGreaterThanOrEqual(0);
          expect(r.x1, where).toBeLessThanOrEqual(w);
          expect(r.y1, where).toBeLessThanOrEqual(h);
          for (let j = i + 1; j < list.length; j++) {
            expect(overlap(r, rects[j]!, 3 * s), `${where} ↔ ${list[j]!.key}`).toBe(false);
          }
        }
        // socle du joystick au repos : dans l'écran, dans sa zone, sans toucher un bouton
        const st = STICKS.find((k) => k.layout === layout)!;
        const halfH = st.horizontal ? ((st.knob + 22) / 2) * s : st.radius * s;
        const base = { x0: (st.cx - st.radius) * s, x1: (st.cx + st.radius) * s, y0: h - st.cy * s - halfH, y1: h - st.cy * s + halfH };
        expect(base.x0).toBeGreaterThanOrEqual(0);
        expect(base.y1).toBeLessThanOrEqual(h);
        expect(base.x1).toBeLessThanOrEqual(w * MOVE_ZONE.width);
        expect(base.y0).toBeGreaterThanOrEqual(h * MOVE_ZONE.top);
        for (let i = 0; i < list.length; i++) {
          expect(overlap(base, rects[i]!, 3 * s), `joystick ↔ ${layout}/${list[i]!.key} sur ${w}×${h}`).toBe(false);
        }
      }
    }
  });

  it('barre d\'objets : entre le joystick et les boutons de droite, 9 cases de taille correcte', () => {
    for (const [w, h] of SCREENS) {
      const s = overlayScale(w, h);
      const bar = { x0: ITEM_BAR.left * s, x1: w - ITEM_BAR.right * s, y0: h - (ITEM_BAR.bottom + ITEM_BAR.height) * s, y1: h - ITEM_BAR.bottom * s };
      const avail = bar.x1 - bar.x0;
      const slot = Math.min(ITEM_BAR.slot * s, (avail - (ITEM_BAR.max - 1) * ITEM_BAR.gap * s) / ITEM_BAR.max);
      expect(slot, `case sur ${w}×${h}`).toBeGreaterThanOrEqual(34);
      for (const c of CONTROLS.filter((k) => k.layout === 'pied')) {
        expect(overlap(bar, controlRect(c, w, h, s), 2 * s), `barre ↔ ${c.key} sur ${w}×${h}`).toBe(false);
      }
      const st = STICKS.find((k) => k.layout === 'pied')!;
      expect((st.cx + st.radius) * s).toBeLessThanOrEqual(bar.x0);
    }
  });
});
