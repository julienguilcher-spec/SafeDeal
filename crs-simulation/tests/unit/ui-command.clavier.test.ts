// Commandement au clavier seul (Mac portable sans souris) : roue d'ordres (huit secteurs numérotés 1 à 8, la roue du CRS
// garde les numéros 1, 2 et 7 ; chiffres, flèches, Entrée ; couronnes « Secours ici » et « Plus… »), carte tactique
// (sections au chiffre, unité suivante, curseur aux flèches). Logique pure : la partie DOM se contente de l'appliquer.
import { describe, expect, it } from 'vitest';

import type { Button, InputDevice } from '@/core/contracts';
import { FOLLOW_WHEEL, MORE_RING, RESCUE_RING, WHEEL, lockedReason, splitLabel, wheelItems, wrapWords } from '@/ui/command/orderWheel';
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
  it('huit secteurs, les ordres « Suivez-moi » d’abord, numérotés 1 à 8 dans le sens horaire', () => {
    expect(WHEEL.length).toBe(8);
    expect(WHEEL.map((w) => w.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(WHEEL.map((w) => w.type)).toEqual(['suivre_pied', 'avec_moi', 'avancer', 'ligne', 'interpeller', 'degager_obstacle', 'secours', 'plus']);
    expect(WHEEL.map((w) => w.label)).toEqual([
      'Suivez-moi à pied', 'Suivez-moi en véhicules', 'Avancer jusqu’ici', 'Tenir une ligne ici', 'Interpeller', 'Pousser un véhicule',
      'Secours ici', 'Plus…',
    ]);
    const keys = WHEEL.map((w) => w.key);
    expect(WHEEL[wheelSectorIndex('Digit1', keys)]!.type).toBe('suivre_pied');
    expect(WHEEL[wheelSectorIndex('Digit2', keys)]!.type).toBe('avec_moi');
    expect(WHEEL[wheelSectorIndex('Digit6', keys)]!.type).toBe('degager_obstacle');
    expect(WHEEL[wheelSectorIndex('Digit8', keys)]!.type).toBe('plus');
    // pavé numérique ; chiffres sans secteur ; touches qui ne sont pas des chiffres
    expect(WHEEL[wheelSectorIndex('Numpad7', keys)]!.type).toBe('secours');
    expect(wheelSectorIndex('Digit9', keys)).toBe(-1);
    expect(wheelSectorIndex('Digit0', keys)).toBe(-1);
    expect(wheelSectorIndex('KeyF', keys)).toBe(-1);
    expect(wheelSectorIndex('Enter', keys)).toBe(-1);
    expect(keyDigit('Numpad0')).toBe(0);
    expect(keyDigit('KeyA')).toBe(-1);
    // la roue prend pour elle les chiffres (jamais transmis au jeu, qui changerait d'objet en main), pas les lettres
    expect(isWheelKeyCode('Digit3')).toBe(true);
    expect(isWheelKeyCode('Numpad5')).toBe(true);
    expect(isWheelKeyCode('Minus')).toBe(true);
    expect(isWheelKeyCode('KeyF')).toBe(false);
    expect(isWheelKeyCode('Enter')).toBe(false);
  });

  it('roue du CRS (lecture seule) : trois secteurs, avec les MÊMES numéros 1, 2 et 7', () => {
    expect(FOLLOW_WHEEL.map((w) => w.type)).toEqual(['suivre_pied', 'avec_moi', 'secours']);
    const keys = FOLLOW_WHEEL.map((w) => w.key);
    expect(keys).toEqual([1, 2, 7]);
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit1', keys)]!.type).toBe('suivre_pied');
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit2', keys)]!.type).toBe('avec_moi');
    expect(FOLLOW_WHEEL[wheelSectorIndex('Digit7', keys)]!.type).toBe('secours');
    // « 3 » n'est pas « Secours ici » : ce numéro n'existe pas dans la roue du CRS
    expect(wheelSectorIndex('Digit3', keys)).toBe(-1);
    // les numéros imprimés sur les secteurs sont ceux des touches
    const items = wheelItems(FOLLOW_WHEEL, { roe: { authorizedForce: 1, underAttack: false, sommation: 0 }, hasTarget: false });
    expect(items.map((i) => i.key)).toEqual(['1', '2', '7']);
  });

  it('couronnes intérieures : « Secours ici » (1 Pompiers, 2 SAMU) et « Plus… » (1 à 8)', () => {
    const rescue = WHEEL.find((w) => w.type === 'secours')!.ring!;
    expect(rescue).toBe(RESCUE_RING);
    expect(rescue.map((w) => `${w.key} ${w.label}`)).toEqual(['1 Pompiers ici', '2 SAMU ici']);
    const more = WHEEL.find((w) => w.type === 'plus')!.ring!;
    expect(more).toBe(MORE_RING);
    expect(more.map((w) => w.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(more.map((w) => w.type)).toEqual(['repli', 'bond_offensif', 'charge', 'disperser_gaz', 'tenir', 'cesser', 'libre', 'tortue']);
    expect(more.map((w) => w.label)).toEqual([
      'Se replier', 'Bond en avant', 'Charger', 'Disperser au gaz', 'Tenir sa position', 'Arrêter l’action', 'Laisser agir seuls', 'Se protéger (tortue)',
    ]);
    // chaque ordre de la roue existe (aucun secteur qui ne ferait rien)
    for (const w of [...WHEEL, ...MORE_RING]) {
      if (w.ring) continue;
      expect(verbOf(w.type), w.type).toBeTruthy();
    }
  });

  it('secteur verrouillé : grisé, avec sa raison en une ligne ; interpeller sans personne visée', () => {
    const calm = { authorizedForce: 1 as const, underAttack: false, sommation: 0 as const };
    const items = wheelItems(MORE_RING, { roe: calm, hasTarget: false });
    const gas = items.find((i) => i.id === 'disperser_gaz')!;
    expect(gas.disabled).toBe(true);
    expect(gas.sub).toBe('il faut les sommations et l’autorisation du gaz');
    const charge = items.find((i) => i.id === 'charge')!;
    expect(charge.disabled).toBe(true);
    expect(charge.sub).toBe('il faut les sommations et l’autorisation du bâton');
    expect(items.find((i) => i.id === 'tenir')!.disabled).toBe(false);
    // sommations faites, gaz autorisé : plus de verrou ; attaqués : riposte permise
    expect(lockedReason(verbOf('disperser_gaz')!, { authorizedForce: 3, underAttack: false, sommation: 3 })).toBe('');
    expect(lockedReason(verbOf('disperser_gaz')!, { authorizedForce: 1, underAttack: true, sommation: 0 })).toBe('');
    expect(lockedReason(verbOf('disperser_gaz')!, { authorizedForce: 2, underAttack: false, sommation: 3 })).toBe('il faut l’autorisation du gaz');
    const main = wheelItems(WHEEL, { roe: calm, hasTarget: false });
    const arrest = main.find((i) => i.id === 'interpeller')!;
    expect(arrest.disabled).toBe(true);
    expect(arrest.sub).toBe('visez quelqu’un');
    expect(wheelItems(WHEEL, { roe: calm, hasTarget: true }).find((i) => i.id === 'interpeller')!.disabled).toBe(false);
    // la raison tient dans le secteur : trois lignes au plus, sans perdre un mot ; libellés longs sur deux lignes
    const lines = wrapWords(gas.sub!, 19, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(' ')).toBe(gas.sub);
    expect(splitLabel('Suivez-moi en véhicules')).toEqual(['Suivez-moi', 'en véhicules']);
    expect(splitLabel('Interpeller')).toBeNull();
    // jamais un niveau de force en chiffre dans la roue
    for (const i of [...main, ...items]) expect(`${i.label} ${i.sub ?? ''}`).not.toMatch(/force \d|niveau \d/);
  });

  it('chaque secteur affiche sa touche ; la légende est celle demandée', () => {
    expect(wheelItems(WHEEL, { roe: { authorizedForce: 4, underAttack: false, sommation: 3 }, hasTarget: true }).map((i) => i.key))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
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
    expect(WHEEL[4]!.type).toBe('interpeller');
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
    // roue du CRS : en haut « Suivez-moi à pied »
    expect(wheelArrowStep(-1, 'up', 3)).toBe(0);
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
