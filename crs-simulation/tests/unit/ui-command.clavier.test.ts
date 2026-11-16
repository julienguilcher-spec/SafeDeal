// Commandement au clavier seul (Mac portable sans souris) : roue d'ordres (chiffres, flèches, Entrée), carte tactique
// (sections au chiffre, unité suivante, curseur aux flèches). Logique pure : la partie DOM se contente de l'appliquer.
import { describe, expect, it } from 'vitest';

import type { Button, InputDevice } from '@/core/contracts';
import { WHEEL } from '@/ui/command/orderWheel';
import { cycleUnitKey, keyboardSections, sectionKeyIndex } from '@/ui/command/tacticalKeys';
import type { KeyUnit } from '@/ui/command/tacticalKeys';
import { QUICK_VERBS } from '@/ui/command/tacticalScreen';
import {
  WHEEL_KEYS_LEGEND, wheelArrowStep, wheelKeyAction, wheelKeyIndex, wheelKeyLabel,
} from '@/ui/command/wheelKeys';
import type { WheelDir } from '@/ui/command/wheelKeys';
import { CURSOR_EDGE, KEY_CURSOR_FAST, KEY_CURSOR_SPEED, cursorAxes, cursorWakes, stepCursor } from '@/ui/maps/cursor';
import type { CursorAxes, CursorInput } from '@/ui/maps/cursor';

/** Entrées d'une image : boutons enfoncés / venant d'être pressés. */
function frame(device: InputDevice, down: Button[] = [], pressed: Button[] = [], move = { x: 0, y: 0 }): CursorInput {
  return {
    device, moveX: move.x, moveY: move.y,
    down: (b) => down.includes(b) || pressed.includes(b),
    pressed: (b) => pressed.includes(b),
  };
}

describe('roue d’ordres au clavier — touche → secteur → ordre', () => {
  it('1…9 puis 0 choisissent les secteurs 1 à 10, « ) » et « - » (Minus, Equal) les deux derniers', () => {
    const n = WHEEL.length;
    expect(n).toBe(12);
    expect(WHEEL[wheelKeyIndex('Digit1', n)]!.type).toBe('avancer');
    expect(WHEEL[wheelKeyIndex('Digit3', n)]!.type).toBe('charge');
    expect(WHEEL[wheelKeyIndex('Digit9', n)]!.type).toBe('tenir');
    expect(WHEEL[wheelKeyIndex('Digit0', n)]!.type).toBe('ligne');
    expect(WHEEL[wheelKeyIndex('Minus', n)]!.type).toBe('suivre_pied');
    expect(WHEEL[wheelKeyIndex('Equal', n)]!.type).toBe('avec_moi');
    // pavé numérique
    expect(wheelKeyIndex('Numpad7', n)).toBe(6);
    expect(wheelKeyIndex('Numpad0', n)).toBe(9);
    // touches sans secteur
    expect(wheelKeyIndex('KeyF', n)).toBe(-1);
    expect(wheelKeyIndex('Enter', n)).toBe(-1);
    // roue plus petite (ordre rapide de la carte : 10 secteurs) : « ) » ne choisit rien
    expect(wheelKeyIndex('Minus', QUICK_VERBS.length)).toBe(-1);
    expect(wheelKeyIndex('Digit0', QUICK_VERBS.length)).toBe(9);
  });

  it('chaque secteur affiche sa touche ; la légende est celle demandée', () => {
    const labels = WHEEL.map((_, i) => wheelKeyLabel(i));
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ')', '-']);
    // disposition connue : libellé du service des touches pour les deux touches après le 0
    expect(wheelKeyLabel(10, (code) => (code === 'Minus' ? '°' : ''))).toBe('°');
    expect(wheelKeyLabel(11, () => '')).toBe('-');
    expect(wheelKeyLabel(0, () => '&')).toBe('1');          // les chiffres restent des chiffres (AZERTY)
    expect(WHEEL_KEYS_LEGEND).toBe('Chiffres, ou flèches puis Entrée');
  });

  it('un chiffre tapé donne directement l’ordre (choix), même sans flèches ; les flèches ne servent qu’au clavier', () => {
    const none = { pressed: () => false };
    expect(wheelKeyAction(-1, 12, 'Digit5', none, false)).toEqual({ kind: 'choose', index: 4 });
    expect(WHEEL[4]!.type).toBe('degager_obstacle');
    const right = { pressed: (b: string) => b === 'ui_right' };
    expect(wheelKeyAction(-1, 12, '', right, true)).toEqual({ kind: 'highlight', index: 3 });
    // manette : la croix porte aussi « Ordres » → pas de déplacement par les boutons ui_*
    expect(wheelKeyAction(-1, 12, '', right, false)).toBeNull();
    // touche sans secteur : les flèches de la même image restent prises en compte
    expect(wheelKeyAction(0, 12, 'KeyQ', right, true)).toEqual({ kind: 'highlight', index: 1 });
  });

  it('flèches sans surlignage : le secteur placé dans cette direction', () => {
    expect(wheelArrowStep(-1, 'up', 12)).toBe(0);
    expect(wheelArrowStep(-1, 'right', 12)).toBe(3);
    expect(wheelArrowStep(-1, 'down', 12)).toBe(6);
    expect(wheelArrowStep(-1, 'left', 12)).toBe(9);
    expect(wheelArrowStep(-1, 'down', 10)).toBe(5);
  });

  it('flèches avec surlignage : on glisse vers le voisin qui va dans ce sens, sans sauter ni boucler', () => {
    // à droite (3) : ↑ remonte (2), ↓ descend (4)
    expect(wheelArrowStep(3, 'up', 12)).toBe(2);
    expect(wheelArrowStep(3, 'down', 12)).toBe(4);
    // à gauche (9) : ↑ remonte (10), ↓ descend (8)
    expect(wheelArrowStep(9, 'up', 12)).toBe(10);
    expect(wheelArrowStep(9, 'down', 12)).toBe(8);
    // en haut (0) : → sens horaire (1), ← antihoraire (11), ↑ ne bouge pas
    expect(wheelArrowStep(0, 'right', 12)).toBe(1);
    expect(wheelArrowStep(0, 'left', 12)).toBe(11);
    expect(wheelArrowStep(0, 'up', 12)).toBe(0);
    // en bas (6) : → va vers la droite (5), ← vers la gauche (7)
    expect(wheelArrowStep(6, 'right', 12)).toBe(5);
    expect(wheelArrowStep(6, 'left', 12)).toBe(7);
  });

  it('aux flèches seules, tous les secteurs sont atteignables', () => {
    for (const count of [10, 12]) {
      const seen = new Set<number>();
      const dirs: WheelDir[] = ['up', 'right', 'down', 'left'];
      // parcours en largeur depuis « aucun surlignage »
      const queue = [-1];
      const visited = new Set<number>([-1]);
      while (queue.length > 0) {
        const h = queue.shift()!;
        for (const d of dirs) {
          const n = wheelArrowStep(h, d, count);
          seen.add(n);
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(count);
    }
  });
});

describe('carte tactique au clavier — choix des unités', () => {
  // compagnie 1 (commandée) → sections 2, 3, 4 → groupes ; une unité 9 d'une autre compagnie (non commandée)
  const units: (KeyUnit & { name: string })[] = [
    { key: 1, squadId: 1, parentKey: 0, name: 'CIE' },
    { key: 2, squadId: 2, parentKey: 1, name: 'S1' },
    { key: 21, squadId: 21, parentKey: 2, name: 'S1 A' },
    { key: 22, squadId: 22, parentKey: 2, name: 'S1 B' },
    { key: 3, squadId: 3, parentKey: 1, name: 'S2' },
    { key: 4, squadId: 4, parentKey: 1, name: 'S3' },
    { key: 9, squadId: 9, parentKey: 0, name: 'AUTRE' },
  ];
  const all = (id: number) => id !== 9;

  it('commandant : 1, 2, 3 = ses sections (sous la compagnie unique)', () => {
    expect(keyboardSections(units, all).map((u) => u.name)).toEqual(['S1', 'S2', 'S3']);
    expect(sectionKeyIndex('Digit1')).toBe(0);
    expect(sectionKeyIndex('Numpad3')).toBe(2);
    expect(sectionKeyIndex('Digit0')).toBe(-1);
    expect(sectionKeyIndex('KeyU')).toBe(-1);
  });

  it('chef de section : 1, 2 = ses groupes', () => {
    const mine = (id: number) => id === 2 || id === 21 || id === 22;
    expect(keyboardSections(units, mine).map((u) => u.name)).toEqual(['S1 A', 'S1 B']);
  });

  it('U / Maj + U : unité suivante / précédente sous mes ordres, en faisant le tour', () => {
    const mine = (id: number) => id === 3 || id === 4;
    expect(cycleUnitKey(units, mine, 0, 1)).toBe(3);
    expect(cycleUnitKey(units, mine, 3, 1)).toBe(4);
    expect(cycleUnitKey(units, mine, 4, 1)).toBe(3);
    expect(cycleUnitKey(units, mine, 3, -1)).toBe(4);
    expect(cycleUnitKey(units, mine, 0, -1)).toBe(4);
    // sélection hors de mes unités : on repart de la première
    expect(cycleUnitKey(units, mine, 9, 1)).toBe(3);
    expect(cycleUnitKey(units, () => false, 0, 1)).toBe(0);
  });
});

describe('carte au clavier — curseur aux flèches', () => {
  const axes = (): CursorAxes => ({ x: 0, y: 0, speed: 0 });

  it('clavier : les flèches (ui_*) déplacent le curseur ; diagonale normalisée ; Maj accélère', () => {
    const a = cursorAxes(frame('kbm', ['ui_right']), 560, axes());
    expect(a).toEqual({ x: 1, y: 0, speed: KEY_CURSOR_SPEED });
    const d = cursorAxes(frame('kbm', ['ui_up', 'ui_left']), 560, axes());
    expect(d.x).toBeCloseTo(-Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
    expect(cursorAxes(frame('kbm', ['ui_down', 'sprint']), 560, axes()).speed).toBe(KEY_CURSOR_SPEED * KEY_CURSOR_FAST);
    // les touches de déplacement du personnage (stick fusionné moveX / moveY) ne pilotent pas le curseur au clavier
    expect(cursorAxes(frame('kbm', [], [], { x: 1, y: 0 }), 560, axes()).x).toBe(0);
  });

  it('manette : stick gauche ; doigt : rien', () => {
    expect(cursorAxes(frame('gamepad', [], [], { x: 0.5, y: -1 }), 560, axes())).toEqual({ x: 0.5, y: -1, speed: 560 });
    expect(cursorAxes(frame('touch', ['ui_right']), 560, axes())).toEqual({ x: 0, y: 0, speed: 0 });
  });

  it('le curseur apparaît à la première flèche ou à Entrée', () => {
    expect(cursorWakes(frame('kbm', ['ui_left']), cursorAxes(frame('kbm', ['ui_left']), 560, axes()))).toBe(true);
    expect(cursorWakes(frame('kbm', [], ['ui_accept']), axes())).toBe(true);
    expect(cursorWakes(frame('kbm'), axes())).toBe(false);
    expect(cursorWakes(frame('touch', [], ['ui_accept']), axes())).toBe(false);
  });

  it('↑ monte à l’écran ; au bord, la carte défile sous le curseur', () => {
    const out = { x: 0, y: 0, panX: 0, panY: 0 };
    const up = cursorAxes(frame('kbm', ['ui_up']), 560, axes());
    stepCursor(400, 300, up, 0.1, 800, 600, out);
    expect(out.x).toBe(400);
    expect(out.y).toBeCloseTo(300 - KEY_CURSOR_SPEED * 0.1);
    expect(out.panY).toBe(0);
    const right = cursorAxes(frame('kbm', ['ui_right']), 560, axes());
    stepCursor(790, 300, right, 0.1, 800, 600, out);
    expect(out.x).toBe(800 - CURSOR_EDGE);
    expect(out.panX).toBeLessThan(0);
  });
});
