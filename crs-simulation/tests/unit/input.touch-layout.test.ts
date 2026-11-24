import { describe, expect, it } from 'vitest';
import {
  COMMS_ROW, CONTROLS, GAME_LAYOUTS, ICONS, ITEM_BAR, LONG_PRESS_MS, MIN_SCALE, MOVE_ZONE, STICKS, STICK_TIP, TAP_MAX_MS, TAP_REPEAT_MS, TAP_SLOP_PX,
  WORLD_TAP_MS, controlRect, overlayScale, touchLabel,
} from '@/input/touch/layouts';
import type { ControlSpec, GameLayout } from '@/input/touch/layouts';
import { ORDER_PILL_AIM, ORDER_PILL_IDLE, ORDER_PILL_WHEEL } from '@/input/touch/controller';
import { TOUCH_COMMS_ROW, TOUCH_LEFT_ZONE_X, touchCommsRect, touchScale } from '@/ui/hud/layout';
import { CSS_HUD } from '@/ui/core/css/hud';
import {
  PILL_PAD, PILL_SHORT_FORMS, PILL_WHO_PX, PILL_WIDTH, VERB_WORDS, fitsPill, pillWhoText, textWidthPx,
} from '@/ui/command/direct/words';

/** Écrans vérifiés : petit téléphone, téléphone de référence, grand téléphone, tablettes. */
const SCREENS: [number, number][] = [[667, 375], [844, 390], [932, 430], [1024, 768], [1180, 820], [1366, 1024]];

function overlap(a: ReturnType<typeof controlRect>, b: ReturnType<typeof controlRect>, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/**
 * Rectangle réellement dessiné : une pastille contextuelle s'élargit avec son texte (jusqu'à 250 unités) ; la pastille
 * « Ordre prêt » a une largeur fixe (128).
 */
function drawn(c: ControlSpec, w: number, h: number, s: number, widest: boolean): ReturnType<typeof controlRect> {
  const r = controlRect(c, w, h, s);
  if (c.shape === 'pill' && c.contextual && widest) {
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
        // son libellé au repos (« Volant »), écrit au-dessus de lui, ne passe pas sous la rangée Radio / ordre prêt
        if (st.label !== '') {
          const tip = { x0: base.x0, x1: base.x1, y0: base.y0 - (STICK_TIP.gap + STICK_TIP.height) * s, y1: base.y0 };
          for (let i = 0; i < list.length; i++) {
            expect(overlap(tip, rects[i]!, 0), `« ${st.label} » ↔ ${layout}/${list[i]!.key} sur ${w}×${h}`).toBe(false);
          }
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

  it('rangée de gauche : Radio, pastille « Ordre prêt » (128 px), « ⟳ À qui », sous la mini-carte et au-dessus du joystick', () => {
    for (const layout of GAME_LAYOUTS) {
      const row = CONTROLS.filter((c) => c.layout === layout && c.side === 'left' && c.anchor === 'bottom' && c.y === COMMS_ROW.bottom);
      expect(row.map((c) => c.key), layout).toEqual(['radio', 'orders', 'order_who']);
      const pill = row[1]!;
      const who = row[2]!;
      // la pastille : toucher = l'ordre prêt (Entrée), appui long = la roue (F), deux lignes, largeur fixe
      expect(pill.shape).toBe('pill');
      expect(pill.tap).toBe('order_go');
      expect(pill.button).toBe('orders');
      expect(pill.longPress).toBe(true);
      expect(pill.twoLine).toBe(true);
      expect(pill.contextual).toBeFalsy();
      expect([pill.x, pill.w, pill.h]).toEqual([82, PILL_WIDTH, 54]);
      // « À qui » : toujours « À qui » (U), jamais « Annuler »
      expect(who.tap).toBe('order_who');
      expect(who.button).toBe('order_who');
      expect(who.label).toBe('À qui');
      expect(who.longPress).toBeFalsy();
      // la Radio est inchangée : elle s'ouvre au contact
      expect(row[0]!.tap).toBeUndefined();
      expect(row[0]!.button).toBe('radio');
      // rectangles à 844 × 390 (échelle 1) : 18–72, 82–210, 214–268 ; 200–254 en hauteur
      const r = row.map((c) => controlRect(c, 844, 390, 1));
      expect(r.map((q) => [q.x0, q.x1])).toEqual([[18, 72], [82, 210], [214, 268]]);
      for (const q of r) expect([q.y0, q.y1]).toEqual([200, 254]);
    }
    // la pastille est le bouton « Ordres » (la roue à l'appui long) ; Entrée n'a pas de nom au toucher (« Maj+… » n'y a
    // pas de sens) ; « À qui » est U
    expect(touchLabel('orders', 'pied')).toBe('Ordres');
    expect(touchLabel('order_go', 'pied')).toBe('');
    expect(touchLabel('order_who', 'vehicule')).toBe('À qui');
  });

  it('rangée de gauche à l\'échelle 1 et 0,82 : ≥ 44 px, dans les 40 % de gauche et la zone du joystick, rien dessus', () => {
    for (const [w, h] of [[844, 390], [667, 375], [568, 320], [932, 430]] as [number, number][]) {
      const s = overlayScale(w, h);
      for (const layout of GAME_LAYOUTS) {
        const list = CONTROLS.filter((c) => c.layout === layout);
        for (const c of list.filter((k) => k.tap)) {
          const r = controlRect(c, w, h, s);
          const where = `${layout}/${c.key} sur ${w}×${h}`;
          expect(Math.min(r.x1 - r.x0, r.y1 - r.y0), where).toBeGreaterThanOrEqual(44);
          expect(r.x1, where).toBeLessThanOrEqual(w * MOVE_ZONE.width);
          expect(r.y0, where).toBeGreaterThanOrEqual(h * MOVE_ZONE.top);
          for (const o of list) {
            if (o === c) continue;
            expect(overlap(r, drawn(o, w, h, s, true), 3 * s), `${where} ↔ ${o.key}`).toBe(false);
          }
        }
      }
    }
    expect(MIN_SCALE * 54).toBeGreaterThanOrEqual(44);
  });

  it('seuils des gestes : toucher < 600 ms et < 12 px, appui long 350 ms, double toucher 0,6 s, monde < 220 ms', () => {
    expect(TAP_MAX_MS).toBe(600);
    expect(TAP_SLOP_PX).toBe(12);
    expect(LONG_PRESS_MS).toBe(350);
    expect(TAP_REPEAT_MS).toBe(600);
    expect(WORLD_TAP_MS).toBe(220);
    expect(LONG_PRESS_MS).toBeLessThan(TAP_MAX_MS);
  });

  it('le HUD connaît la même rangée : la mini-carte s\'en écarte, la zone de gauche est à sa droite', () => {
    expect(TOUCH_COMMS_ROW).toEqual(COMMS_ROW);
    for (const [w, h] of SCREENS) {
      expect(touchScale(w, h)).toBeCloseTo(overlayScale(w, h), 9);
      const s = overlayScale(w, h);
      const row = touchCommsRect(w, h);
      const ctl = CONTROLS.filter((c) => c.layout === 'pied' && c.y === COMMS_ROW.bottom).map((c) => controlRect(c, w, h, s));
      expect(row.left).toBeCloseTo(Math.min(...ctl.map((r) => r.x0)), 6);
      expect(row.right).toBeCloseTo(Math.max(...ctl.map((r) => r.x1)), 6);
      expect(row.top).toBeCloseTo(ctl[0]!.y0, 6);
      expect(row.bottom).toBeCloseTo(ctl[0]!.y1, 6);
      // la zone de gauche du HUD commence à 8 px au moins à droite de « À qui »
      expect(TOUCH_LEFT_ZONE_X * s - row.right).toBeGreaterThanOrEqual(8 * s - 1e-9);
    }
    // sur 844 × 390, la mini-carte (112 px sous le panneau de situation, jusqu'à 196) passe au-dessus de la rangée
    expect(touchCommsRect(844, 390).top).toBeGreaterThanOrEqual(196 + 4);
    // la feuille du HUD place bien la zone de gauche à cette abscisse dans les trois dispositions
    for (const l of ['pied', 'vehicule', 'drone']) expect(CSS_HUD).toContain(`.ui-hud[data-touch="${l}"] .hud-slot--left`);
    expect(CSS_HUD).toContain(`left: calc(${TOUCH_LEFT_ZONE_X}px * var(--ts) + var(--ui-safe-l)); }`);
  });

  it('pastille : chaque forme courte tient sur ses 128 px à l\'échelle 1 et 105 px à 0,82, l\'unité jamais coupée sur la distance', () => {
    const verbs = new Set<string>([...PILL_SHORT_FORMS, ORDER_PILL_IDLE.verb, ORDER_PILL_AIM.verb, ORDER_PILL_WHEEL.verb]);
    for (const v of Object.values(VERB_WORDS)) if (v.short !== '') verbs.add(v.short);
    for (const t of verbs) {
      expect(fitsPill(t, 1), `« ${t} » à l'échelle 1`).toBe(true);
      expect(fitsPill(t, MIN_SCALE), `« ${t} » à 0,82`).toBe(true);
      expect(textWidthPx(t, 15 * MIN_SCALE, true), `« ${t} » ≤ 105 px`).toBeLessThanOrEqual(105);
    }
    const room = PILL_WIDTH - 2 * PILL_PAD;
    for (const t of [ORDER_PILL_IDLE.who, ORDER_PILL_AIM.who, ORDER_PILL_WHEEL.who]) {
      expect(textWidthPx(t, PILL_WHO_PX, false), `« ${t} »`).toBeLessThanOrEqual(room);
    }
    // les indicatifs longs sont raccourcis, jamais la distance
    for (const name of ['MISTRAL 1', 'FAUCON 1', 'BRAV-M', 'CELLULAIRE 1', 'MISTRAL 2 ALFA', 'Toute la compagnie', 'fourgon cellulaire 1']) {
      for (const d of [null, 9, 90, 400, 1250]) {
        const t = pillWhoText(name, d);
        expect(textWidthPx(t, PILL_WHO_PX, false), t).toBeLessThanOrEqual(room);
        if (d !== null) expect(t.endsWith(d >= 1000 ? 'km' : '\u00a0m'), t).toBe(true);
      }
    }
  });
});

