import { describe, expect, it } from 'vitest';
import { BINDINGS_SECTION, BindingStore } from '@/input/bindings';
import { ACTIONS } from '@/input/buttons';
import type { BindAction } from '@/input/buttons';
import { steerWithLookKeys } from '@/input/kbm';

function memorySave(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    read<T>(section: string, fallback: T): T {
      return section in data ? (data[section] as T) : fallback;
    },
    write<T>(section: string, value: T): void {
      data[section] = JSON.parse(JSON.stringify(value));
    },
    remove(section: string): void {
      delete data[section];
    },
  };
}

const names = (s: BindingStore, code: string): BindAction[] => s.actionsFor('kbm', code).map((i) => ACTIONS[i]!).sort();

describe('entrées — flèches haut / bas = avancer / reculer (Mac sans souris)', () => {
  it('par défaut : ↑ avance, ↓ recule, ← → tournent la vue, Page préc. / suiv. lèvent / baissent le regard', () => {
    const s = new BindingStore(null);
    expect(s.get('kbm', 'move_forward')).toEqual(['KeyW', 'ArrowUp']);
    expect(s.get('kbm', 'move_back')).toEqual(['KeyS', 'ArrowDown']);
    expect(s.get('kbm', 'look_left')).toEqual(['ArrowLeft']);
    expect(s.get('kbm', 'look_right')).toEqual(['ArrowRight']);
    expect(s.get('kbm', 'look_up')).toEqual(['PageUp']);
    expect(s.get('kbm', 'look_down')).toEqual(['PageDown']);
    // les menus gardent les flèches (contexte « menu », à part)
    expect(names(s, 'ArrowUp')).toEqual(['move_forward', 'ui_up']);
    expect(names(s, 'ArrowDown')).toEqual(['move_back', 'ui_down']);
  });

  it('touches personnalisées d\'avant le changement : le choix enregistré du joueur l\'emporte, sans double action', () => {
    // ancien joueur : regard en haut sur ↑ + I, zoom avant sur Page préc. (écarts enregistrés en version 1)
    const save = memorySave({
      [BINDINGS_SECTION]: { v: 1, kbm: { look_up: ['ArrowUp', 'KeyI'], zoom_in: ['PageUp'] }, gamepad: {} },
    });
    const s = new BindingStore(save);
    expect(s.get('kbm', 'look_up')).toEqual(['ArrowUp', 'KeyI']);
    expect(s.get('kbm', 'zoom_in')).toEqual(['PageUp']);
    // ↑ ne fait plus que ce que le joueur a choisi (pas « avancer » en plus), Page préc. ne fait que zoomer
    expect(names(s, 'ArrowUp')).toEqual(['look_up', 'ui_up']);
    expect(names(s, 'PageUp')).toEqual(['zoom_in']);
    expect(s.get('kbm', 'move_forward')).toEqual(['KeyW']);
    // le reste des nouvelles valeurs par défaut s'applique
    expect(s.get('kbm', 'move_back')).toEqual(['KeyS', 'ArrowDown']);
    expect(s.get('kbm', 'look_down')).toEqual(['PageDown']);
    for (const a of ACTIONS) for (const c of s.get('kbm', a)) expect(s.conflicts('kbm', a, c), `${a} ${c}`).toEqual([]);
  });
});

describe('entrées — O (retour drone) et P (proposition de l\'adjoint) sont réservées', () => {
  it('réaffecter une action sur O ou P est refusé (sinon un appui déclencherait deux actions)', () => {
    const s = new BindingStore(null);
    expect(s.set('kbm', 'interact', 0, 'KeyO')).toBeNull();
    expect(s.set('kbm', 'radio', 1, 'KeyP')).toBeNull();
    expect(s.isBound('kbm', 'KeyO')).toBe(false);
    expect(s.isBound('kbm', 'KeyP')).toBe(false);
  });

  it('une sauvegarde qui les utiliserait est ignorée pour ces touches', () => {
    const save = memorySave({ [BINDINGS_SECTION]: { v: 1, kbm: { interact: ['KeyP', 'KeyK'] }, gamepad: {} } });
    const s = new BindingStore(save);
    expect(s.get('kbm', 'interact')).toEqual(['KeyK']);
  });
});

describe('entrées — au volant, ← / → braquent', () => {
  it('les touches de regard s\'ajoutent au volant, borné à ±1', () => {
    expect(steerWithLookKeys(0, 1)).toBe(1);
    expect(steerWithLookKeys(0, -1)).toBe(-1);
    expect(steerWithLookKeys(1, 1)).toBe(1);
    expect(steerWithLookKeys(-1, 1)).toBe(0);
    expect(steerWithLookKeys(0.5, -1)).toBe(-0.5);
  });
});
