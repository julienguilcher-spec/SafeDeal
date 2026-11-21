import { describe, expect, it } from 'vitest';
import { KeyLabels, detectPadStyle, guessKeyboardLayout, padDisplayName, padLabel } from '@/input/labels';

describe('entrées — libellés des touches', () => {
  it('AZERTY : les touches physiques ZQSD portent les bonnes lettres', () => {
    const k = new KeyLabels('azerty');
    expect(k.label('KeyW')).toBe('Z');
    expect(k.label('KeyA')).toBe('Q');
    expect(k.label('KeyS')).toBe('S');
    expect(k.label('KeyD')).toBe('D');
    expect(k.label('KeyQ')).toBe('A');
    expect(k.label('KeyZ')).toBe('W');
    expect(k.label('Semicolon')).toBe('M');
    expect(k.label('KeyE')).toBe('E');
    expect(k.moveLabel('KeyW', 'KeyA', 'KeyS', 'KeyD')).toBe('ZQSD');
  });

  it('QWERTY et QWERTZ', () => {
    const q = new KeyLabels('qwerty');
    expect(q.label('KeyW')).toBe('W');
    expect(q.moveLabel('KeyW', 'KeyA', 'KeyS', 'KeyD')).toBe('WASD');
    expect(q.label('Period')).toBe('.');
    const z = new KeyLabels('qwertz');
    expect(z.label('KeyY')).toBe('Z');
    expect(z.label('KeyZ')).toBe('Y');
  });

  it('touches nommées en français, souris, chiffres, pavé, fonctions', () => {
    const k = new KeyLabels('azerty');
    expect(k.label('Space')).toBe('Espace');
    expect(k.label('ShiftLeft')).toBe('Maj');
    expect(k.label('Escape')).toBe('Échap');
    expect(k.label('Enter')).toBe('Entrée');
    expect(k.label('Tab')).toBe('Tab');
    expect(k.label('Mouse0')).toBe('Clic gauche');
    expect(k.label('Mouse2')).toBe('Clic droit');
    expect(k.label('WheelDown')).toBe('Molette ↓');
    expect(k.label('Digit3')).toBe('3');
    expect(k.label('Numpad7')).toBe('Pavé 7');
    expect(k.label('F4')).toBe('F4');
    expect(k.label('ArrowUp')).toBe('↑');
    expect(k.moveLabel('ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight')).toBe('Flèches');
    expect(k.moveLabel('KeyW', 'KeyA', 'KeyS', 'ShiftLeft')).toBe('Z Q S Maj');
  });

  it('apprend la disposition réelle d\'après les frappes', () => {
    const k = new KeyLabels('azerty');
    const v = k.version;
    k.learn('KeyW', 'w');                 // la touche physique KeyW produit « w » : clavier QWERTY
    expect(k.layout).toBe('qwerty');
    expect(k.label('KeyW')).toBe('W');
    expect(k.label('KeyA')).toBe('A');    // plus de table AZERTY
    expect(k.version).toBeGreaterThan(v);
    k.learn('KeyY', 'z');
    expect(k.layout).toBe('qwertz');
    k.learn('Space', ' ');                // ignoré
    k.learn('Digit1', '&');               // ignoré : on garde « 1 »
    expect(k.label('Digit1')).toBe('1');
    k.learn('KeyS', 'ß');                 // majuscule de deux lettres : ignoré
    expect(k.label('KeyS')).toBe('S');
  });

  it('devine la disposition d\'après la langue du navigateur', () => {
    expect(guessKeyboardLayout(['fr-FR', 'en'])).toBe('azerty');
    expect(guessKeyboardLayout(['fr'])).toBe('azerty');
    expect(guessKeyboardLayout(['fr-BE'])).toBe('azerty');
    expect(guessKeyboardLayout(['fr-CA'])).toBe('qwerty');
    expect(guessKeyboardLayout(['fr-CH'])).toBe('qwertz');
    expect(guessKeyboardLayout(['en-US'])).toBe('qwerty');
    expect(guessKeyboardLayout(['de-DE'])).toBe('qwertz');
    expect(guessKeyboardLayout([])).toBe('azerty');
  });
});

describe('entrées — libellés de manette', () => {
  it('famille de manette d\'après son identifiant', () => {
    expect(detectPadStyle('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('lettres');
    expect(detectPadStyle('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('formes');
    expect(detectPadStyle('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('lettres_inversees');
    expect(detectPadStyle('')).toBe('lettres');
  });

  it('le même bouton physique porte la gravure de la manette', () => {
    expect(padLabel('B2', 'lettres')).toBe('X');
    expect(padLabel('B2', 'formes')).toBe('□');
    expect(padLabel('B2', 'lettres_inversees')).toBe('Y');
    expect(padLabel('B0', 'lettres')).toBe('A');
    expect(padLabel('B0', 'formes')).toBe('✕');
    expect(padLabel('B7', 'lettres')).toBe('RT');
    expect(padLabel('B7', 'formes')).toBe('R2');
    expect(padLabel('B12', 'lettres')).toBe('Croix ↑');
    expect(padLabel('B99', 'lettres')).toBe('B99');
    expect(padLabel('KeyW', 'lettres')).toBe('KeyW');
  });

  it('nom affichable sans codes USB', () => {
    expect(padDisplayName('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('Xbox 360 Controller');
    expect(padDisplayName('054c-0ce6-DualSense Wireless Controller')).toBe('DualSense Wireless Controller');
    expect(padDisplayName('')).toBe('Manette');
  });
});
