// Commandement au clavier seul (Mac portable sans souris) : roue d'ordres (sept secteurs numérotés 1, 3 à 8, le 2 en alias
// du 1 ; la roue du CRS garde les numéros 1 et 7 ; chiffres, flèches, Entrée ; couronnes « Secours ici » et « Plus… »), carte tactique
// (sections au chiffre, unité suivante, curseur aux flèches). Logique pure : la partie DOM se contente de l'appliquer.
import { describe, expect, it } from 'vitest';

import type { Button, InputDevice } from '@/core/contracts';
import { FOLLOW_WHEEL, MORE_RING, RESCUE_RING, WHEEL, splitLabel, wheelItems, wrapWords } from '@/ui/command/orderWheel';
import { DIGIT_ALIASES } from '@/ui/command/direct/words';
import { verbOf } from '@/ui/command/orders';
import { cycleUnitKey, keyboardSections, sectionKeyIndex } from '@/ui/command/tacticalKeys';
import type { KeyUnit } from '@/ui/command/tacticalKeys';
import {
  WHEEL_KEYS_LEGEND, isWheelKeyCode, keyDigit, wheelArrowStep, wheelKeyAction, wheelKeyIndex, wheelKeyLabel, wheelSectorIndex,
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
  it('sept secteurs, mêmes mots que la carte, numérotés 1, 3 à 8 dans le sens horaire (le 2 : alias du 1)', () => {
    expect(WHEEL.length).toBe(7);
    expect(WHEEL.map((w) => w.key)).toEqual([1, 3, 4, 5, 6, 7, 8]);
    expect(WHEEL.map((w) => w.action)).toEqual(['avec_moi', 'envoyer', 'bloquer', 'interpeller', 'disperser', 'secours', 'plus']);
    expect(WHEEL.map((w) => w.label)).toEqual(['Avec moi', 'Envoyer', 'Bloquer une rue', 'Interpeller', 'Disperser', 'Secours ici', 'Plus…']);
    const keys = WHEEL.map((w) => w.key);
    const at = (code: string): string => WHEEL[wheelSectorIndex(code, keys, DIGIT_ALIASES)]?.action ?? '';
    expect(at('Digit1')).toBe('avec_moi');
    // « F puis 2 » (l'ancien « Suivez-moi en véhicules ») : « Avec moi », qui suit en véhicules quand il est à bord
    expect(at('Digit2')).toBe('avec_moi');
    expect(wheelSectorIndex('Digit2', keys)).toBe(-1);
    expect(at('Digit3')).toBe('envoyer');
    expect(at('Digit4')).toBe('bloquer');
    expect(at('Digit6')).toBe('disperser');
    expect(at('Digit8')).toBe('plus');
    // pavé numérique ; chiffres sans secteur ; touches qui ne sont pas des chiffres
    expect(at('Numpad7')).toBe('secours');
    expect(at('Numpad2')).toBe('avec_moi');
    expect(wheelSectorIndex('Digit9', keys, DIGIT_ALIASES)).toBe(-1);
    expect(wheelSectorIndex('Digit0', keys, DIGIT_ALIASES)).toBe(-1);
    expect(wheelSectorIndex('KeyF', keys, DIGIT_ALIASES)).toBe(-1);
    expect(wheelSectorIndex('Enter', keys, DIGIT_ALIASES)).toBe(-1);
    expect(keyDigit('Numpad0')).toBe(0);
    expect(keyDigit('KeyA')).toBe(-1);
    // la roue prend pour elle les chiffres (jamais transmis au jeu, qui changerait d'objet en main), pas les lettres
    expect(isWheelKeyCode('Digit3')).toBe(true);
    expect(isWheelKeyCode('Numpad5')).toBe(true);
    expect(isWheelKeyCode('Minus')).toBe(true);
    expect(isWheelKeyCode('KeyF')).toBe(false);
    expect(isWheelKeyCode('Enter')).toBe(false);
  });

  it('roue du CRS (lecture seule) : « Avec moi » (1, et 2) et « Secours ici » (7), les MÊMES numéros', () => {
    expect(FOLLOW_WHEEL.map((w) => w.action)).toEqual(['avec_moi', 'secours']);
    const keys = FOLLOW_WHEEL.map((w) => w.key);
    expect(keys).toEqual([1, 7]);
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit1', keys, DIGIT_ALIASES)]!.action).toBe('avec_moi');
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit2', keys, DIGIT_ALIASES)]!.action).toBe('avec_moi');
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit7', keys, DIGIT_ALIASES)]!.action).toBe('secours');
    // « 3 » n'est pas « Secours ici » : ce numéro n'existe pas dans la roue du CRS
    expect(wheelSectorIndex('Digit3', keys, DIGIT_ALIASES)).toBe(-1);
    // les numéros imprimés sur les secteurs sont ceux des touches
    const items = wheelItems(FOLLOW_WHEEL, [null, null]);
    expect(items.map((i) => i.key)).toEqual(['1', '7']);
  });

  it('couronnes intérieures : « Secours ici » (1 Pompiers, 2 SAMU) et « Plus… » (1 à 8 d’avant, 9 Pousser)', () => {
    const rescue = WHEEL.find((w) => w.action === 'secours')!.ring!;
    expect(rescue).toBe(RESCUE_RING);
    expect(rescue.map((w) => `${w.key} ${w.label}`)).toEqual(['1 Pompiers ici', '2 SAMU ici']);
    const more = WHEEL.find((w) => w.action === 'plus')!.ring!;
    expect(more).toBe(MORE_RING);
    expect(more.map((w) => w.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(more.map((w) => w.orders[0])).toEqual(['repli', 'bond_offensif', 'charge', 'disperser_gaz', 'tenir', 'cesser', 'libre', 'tortue', 'degager_obstacle']);
    expect(more.map((w) => w.label)).toEqual([
      'Se replier', 'Bond en avant', 'Charger', 'Disperser au gaz', 'Tenir sa position', 'Arrêter l’action', 'Laisser agir seuls', 'Se protéger (tortue)',
      'Pousser un véhicule',
    ]);
    // dans une couronne, pas d'alias : le 2 de « Plus… » est « Bond en avant »
    expect(more[wheelSectorIndex('Digit2', more.map((w) => w.key))]!.label).toBe('Bond en avant');
    // chaque ordre de la roue existe (aucun secteur qui ne ferait rien)
    for (const w of [...WHEEL, ...MORE_RING]) {
      if (w.ring || w.action === 'avec_moi') continue;
      for (const o of w.orders) expect(verbOf(o), String(o)).toBeTruthy();
      if (w.action !== 'secours') expect(w.orders.length, w.label).toBeGreaterThan(0);
    }
  });

  it('secteur verrouillé : grisé mais choisissable, sa raison en quelques mots ; l’unité qui obéira en deuxième ligne', () => {
    const order = (whoShort: string, enabled: boolean, legalFirst = false) => ({ whoShort, enabled, legalFirst }) as never;
    const items = wheelItems(MORE_RING.slice(0, 3), [order('MISTRAL 1 · 40\u00a0m', true), order('sommations d’abord', true, true), order('accord du commandant', false)]);
    expect(items.map((i) => i.sub)).toEqual(['MISTRAL 1 · 40\u00a0m', 'sommations d’abord', 'accord du commandant']);
    expect(items.map((i) => i.locked)).toEqual([false, true, true]);
    // jamais `disabled` pour le menu radial : le choisir dit la raison (ou fait les sommations au second appui)
    expect(items.every((i) => i.disabled === false)).toBe(true);
    // ordres de force : surlignés en rouge
    expect(items.map((i) => i.force)).toEqual([false, true, true]);
    // sans ordre calculé (couronne, appel) : la deuxième ligne d'origine
    expect(wheelItems(RESCUE_RING, [null, null]).map((i) => i.sub)).toEqual(['à votre position', 'à votre position']);
    // la raison tient dans le secteur : trois lignes au plus, sans perdre un mot ; libellés longs sur deux lignes
    const long = 'la rue visée, toute sa largeur';
    const lines = wrapWords(long, 19, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(' ')).toBe(long);
    expect(splitLabel('Se protéger (tortue)')).toEqual(['Se protéger', '(tortue)']);
    expect(splitLabel('Interpeller')).toBeNull();
    // jamais un niveau de force en chiffre dans la roue
    for (const i of [...wheelItems(WHEEL, WHEEL.map(() => null)), ...wheelItems(MORE_RING, MORE_RING.map(() => null))]) {
      expect(`${i.label} ${i.sub ?? ''}`).not.toMatch(/force \d|niveau \d/);
    }
  });

  it('chaque secteur affiche sa touche ; la légende est celle demandée', () => {
    expect(wheelItems(WHEEL, WHEEL.map(() => null)).map((i) => i.key)).toEqual(['1', '3', '4', '5', '6', '7', '8']);
    expect(WHEEL_KEYS_LEGEND).toBe('Chiffres, ou flèches puis Entrée');
    // règle générale des menus radiaux sans numéros propres (wheel.ts) : inchangée
    expect(wheelKeyIndex('Digit1', 12)).toBe(0);
    expect(wheelKeyIndex('Digit0', 12)).toBe(9);
    expect(wheelKeyIndex('Minus', 12)).toBe(10);
    expect(wheelKeyLabel(10, (code) => (code === 'Minus' ? '°' : ''))).toBe('°');
    expect(wheelKeyLabel(0, () => '&')).toBe('1');          // les chiffres restent des chiffres (AZERTY)
  });

  it('un chiffre tapé donne directement l’ordre (choix), même sans flèches ; les flèches ne servent qu’au clavier', () => {
    const none = { pressed: () => false };
    expect(wheelKeyAction(-1, 8, 'Digit5', none, false)).toEqual({ kind: 'choose', index: 4 });
    // la roue d'ordres lit le numéro IMPRIMÉ : 5 = Interpeller (4e secteur, le 2 n'étant pas dessiné)
    expect(WHEEL[wheelSectorIndex('Digit5', WHEEL.map((w) => w.key))]!.action).toBe('interpeller');
    const right = { pressed: (b: string) => b === 'ui_right' };
    expect(wheelKeyAction(-1, 8, '', right, true)).toEqual({ kind: 'highlight', index: 2 });
    // manette : la croix porte aussi « Ordres » → pas de déplacement par les boutons ui_*
    expect(wheelKeyAction(-1, 8, '', right, false)).toBeNull();
    // touche sans secteur : les flèches de la même image restent prises en compte
    expect(wheelKeyAction(0, 8, 'KeyQ', right, true)).toEqual({ kind: 'highlight', index: 1 });
  });

  it('flèches sans surlignage : le secteur placé dans cette direction', () => {
    expect(wheelArrowStep(-1, 'up', 8)).toBe(0);
    expect(wheelArrowStep(-1, 'right', 8)).toBe(2);
    expect(wheelArrowStep(-1, 'down', 8)).toBe(4);
    expect(wheelArrowStep(-1, 'left', 8)).toBe(6);
    // roue du CRS : en haut « Avec moi »
    expect(wheelArrowStep(-1, 'up', FOLLOW_WHEEL.length)).toBe(0);
  });

  it('flèches avec surlignage : on glisse vers le voisin qui va dans ce sens, sans sauter ni boucler', () => {
    // à droite (2) : ↑ remonte (1), ↓ descend (3)
    expect(wheelArrowStep(2, 'up', 8)).toBe(1);
    expect(wheelArrowStep(2, 'down', 8)).toBe(3);
    // à gauche (6) : ↑ remonte (7), ↓ descend (5)
    expect(wheelArrowStep(6, 'up', 8)).toBe(7);
    expect(wheelArrowStep(6, 'down', 8)).toBe(5);
    // en haut (0) : → sens horaire (1), ← antihoraire (7), ↑ ne bouge pas
    expect(wheelArrowStep(0, 'right', 8)).toBe(1);
    expect(wheelArrowStep(0, 'left', 8)).toBe(7);
    expect(wheelArrowStep(0, 'up', 8)).toBe(0);
  });

  it('aux flèches seules, tous les secteurs sont atteignables (roue, roue du CRS, couronnes)', () => {
    for (const count of [WHEEL.length, FOLLOW_WHEEL.length, RESCUE_RING.length, MORE_RING.length]) {
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
      expect(seen.size, `${count} secteurs`).toBe(count);
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
