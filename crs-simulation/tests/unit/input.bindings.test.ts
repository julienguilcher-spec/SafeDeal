import { describe, expect, it } from 'vitest';
import { BINDINGS_SECTION, BindingStore, DEFAULT_GAMEPAD, DEFAULT_KBM, isValidCode } from '@/input/bindings';
import { ACTIONS, BUTTONS, BUTTON_COUNT, BUTTON_INDEX, actionContext, actionIndex, actionName, contextsOverlap } from '@/input/buttons';
import type { BindAction } from '@/input/buttons';
import { createFakeContext } from '@/input/dev/fakeContext';

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

describe('entrées — catalogue des boutons', () => {
  it('tous les boutons du contrat ont un index distinct, un nom français et un contexte', () => {
    expect(BUTTONS.length).toBe(BUTTON_COUNT);
    expect(new Set(BUTTONS.map((b) => BUTTON_INDEX[b])).size).toBe(BUTTON_COUNT);
    for (let i = 0; i < BUTTON_COUNT; i++) expect(BUTTON_INDEX[BUTTONS[i]!]).toBe(i);
    for (const a of ACTIONS) {
      expect(actionIndex(a)).toBeGreaterThanOrEqual(0);
      expect(actionName(a).length).toBeGreaterThan(2);
      expect(actionName(a)).not.toBe(a);
      expect(['pied', 'vehicule', 'commun', 'menu']).toContain(actionContext(a));
    }
    expect(actionIndex('inconnu')).toBe(-1);
    expect(actionIndex('constructor')).toBe(-1);
  });

  it('contextes : pied et véhicule ne se gênent pas, commun gêne les deux, menu est à part', () => {
    expect(contextsOverlap('pied', 'vehicule')).toBe(false);
    expect(contextsOverlap('pied', 'pied')).toBe(true);
    expect(contextsOverlap('commun', 'vehicule')).toBe(true);
    expect(contextsOverlap('menu', 'commun')).toBe(false);
    expect(contextsOverlap('menu', 'menu')).toBe(true);
  });
});

describe('entrées — table par défaut conforme à docs/ARCHITECTURE.md §5', () => {
  const s = new BindingStore(null);
  const kbm = (a: BindAction): readonly string[] => s.get('kbm', a);
  const pad = (a: BindAction): readonly string[] => s.get('gamepad', a);

  it('clavier/souris', () => {
    expect(kbm('move_forward')).toEqual(['KeyW', 'ArrowUp']);
    expect(kbm('move_left')).toEqual(['KeyA']);
    expect(kbm('move_back')).toEqual(['KeyS', 'ArrowDown']);
    expect(kbm('move_right')).toEqual(['KeyD']);
    expect(kbm('primary')).toEqual(['Mouse0']);
    expect(kbm('secondary')).toEqual(['Mouse2']);
    expect(kbm('interact')).toEqual(['KeyE']);
    expect(kbm('sprint')).toEqual(['ShiftLeft']);
    expect(kbm('crouch')).toEqual(['KeyC']);
    expect(kbm('jump')).toEqual(['Space']);
    expect(kbm('item_next')).toEqual(['WheelDown']);
    expect(kbm('item_prev')).toEqual(['WheelUp']);
    for (let n = 1; n <= 9; n++) expect(kbm(('slot' + n) as BindAction)).toEqual(['Digit' + n]);
    expect(kbm('radio')).toEqual(['KeyT']);
    expect(kbm('orders')).toEqual(['KeyF']);
    expect(kbm('map')).toEqual(['KeyM']);
    expect(kbm('tactical')).toEqual(['Tab']);
    expect(kbm('camera')).toEqual(['KeyV']);
    expect(kbm('mask')).toEqual(['KeyG']);
    expect(kbm('visor')).toEqual(['KeyH']);
    expect(kbm('siren')).toEqual(['KeyR']);
    expect(kbm('beacons')).toEqual(['KeyB']);
    expect(kbm('horn')).toEqual(['KeyN']);
    expect(kbm('handbrake')).toEqual(['Space']);
    expect(kbm('fast_forward')).toEqual(['Period']);
    expect(kbm('pause')).toEqual(['Escape']);
  });

  it('manette (mapping standard)', () => {
    expect(pad('primary')).toEqual(['B7']);      // gâchette droite
    expect(pad('secondary')).toEqual(['B6']);    // gâchette gauche
    expect(pad('interact')).toEqual(['B2']);     // X / carré
    expect(pad('sprint')).toEqual(['B10']);      // clic stick gauche
    expect(pad('crouch')).toEqual(['B1']);       // B / rond
    expect(pad('jump')).toEqual(['B0']);         // A / croix
    expect(pad('item_prev')).toEqual(['B4']);    // LB
    expect(pad('item_next')).toEqual(['B5']);    // RB
    expect(pad('radio')).toEqual(['B12']);       // croix haut
    expect(pad('orders')).toEqual(['B15']);      // croix droite
    expect(pad('map')).toEqual(['B8']);          // Select
    expect(pad('camera')).toEqual(['B11']);      // clic stick droit
    expect(pad('mask')).toEqual(['B13']);        // croix bas
    expect(pad('visor')).toEqual(['B14']);       // croix gauche
    expect(pad('handbrake')).toEqual(['B0']);    // A
    expect(pad('pause')).toEqual(['B9']);        // Start
  });

  it('aucune touche par défaut n\'est partagée par deux actions du même contexte', () => {
    for (const device of ['kbm', 'gamepad'] as const) {
      for (const a of ACTIONS) {
        for (const code of s.get(device, a)) {
          expect(s.conflicts(device, a, code), `${device} ${a} ${code}`).toEqual([]);
        }
      }
    }
  });

  it('les tables par défaut ne contiennent que des codes valides', () => {
    for (const codes of Object.values(DEFAULT_KBM)) for (const c of codes!) expect(isValidCode('kbm', c)).toBe(true);
    for (const codes of Object.values(DEFAULT_GAMEPAD)) for (const c of codes!) expect(isValidCode('gamepad', c)).toBe(true);
    expect(isValidCode('gamepad', 'B17')).toBe(false);
    expect(isValidCode('gamepad', 'KeyW')).toBe(false);
    expect(isValidCode('kbm', '')).toBe(false);
    expect(isValidCode('kbm', '<script>')).toBe(false);
    expect(isValidCode('kbm', 12 as unknown)).toBe(false);
  });

  it('table inverse : une touche déclenche toutes ses actions', () => {
    const names = (code: string): string[] => s.actionsFor('kbm', code).map((i) => ACTIONS[i]!).sort();
    expect(names('Space')).toEqual(['handbrake', 'jump']);
    expect(names('KeyR')).toEqual(['reload', 'siren']);
    expect(names('Escape')).toEqual(['pause', 'ui_back']);
    expect(names('KeyJ')).toEqual([]);
    expect(s.isBound('kbm', 'KeyW')).toBe(true);
    expect(s.isBound('kbm', 'KeyJ')).toBe(false);
  });
});

describe('entrées — réaffectation et persistance', () => {
  it('réaffecter enregistre seulement l\'écart, relu à la création suivante', () => {
    const save = memorySave();
    const a = new BindingStore(save);
    expect(save.data[BINDINGS_SECTION]).toBeUndefined();
    expect(a.set('kbm', 'interact', 0, 'KeyK')).toEqual([]);
    expect(a.get('kbm', 'interact')).toEqual(['KeyK']);
    expect(a.isDefault('kbm')).toBe(false);
    expect(a.isDefault('kbm', 'interact')).toBe(false);
    expect(a.isDefault('kbm', 'jump')).toBe(true);
    expect(save.data[BINDINGS_SECTION]).toEqual({ v: 1, kbm: { interact: ['KeyK'] }, gamepad: {} });

    const b = new BindingStore(save);
    expect(b.get('kbm', 'interact')).toEqual(['KeyK']);
    expect(b.actionsFor('kbm', 'KeyE')).toEqual([]);
    expect(b.actionsFor('kbm', 'KeyK').map((i) => ACTIONS[i])).toEqual(['interact']);
    expect(b.get('kbm', 'jump')).toEqual(['Space']);
  });

  it('prendre une touche déjà utilisée dans le même contexte la retire à l\'autre action', () => {
    const s = new BindingStore(memorySave());
    expect(s.conflicts('kbm', 'interact', 'KeyC')).toEqual(['crouch']);
    expect(s.set('kbm', 'interact', 0, 'KeyC')).toEqual(['crouch']);
    expect(s.get('kbm', 'crouch')).toEqual([]);
    expect(s.get('kbm', 'interact')).toEqual(['KeyC']);
  });

  it('… mais pas dans un autre contexte (Espace : sauter à pied, frein à main en véhicule)', () => {
    const s = new BindingStore(memorySave());
    expect(s.set('kbm', 'horn', 0, 'KeyC')).toEqual([]);      // klaxon (véhicule) et s'accroupir (pied) cohabitent
    expect(s.get('kbm', 'crouch')).toEqual(['KeyC']);
    expect(s.get('kbm', 'horn')).toEqual(['KeyC']);
  });

  it('second emplacement, vidage d\'un emplacement, demandes invalides', () => {
    const s = new BindingStore(memorySave());
    expect(s.set('kbm', 'jump', 1, 'KeyJ')).toEqual([]);
    expect(s.get('kbm', 'jump')).toEqual(['Space', 'KeyJ']);
    expect(s.set('kbm', 'jump', 0, null)).toEqual([]);
    expect(s.get('kbm', 'jump')).toEqual(['KeyJ']);
    expect(s.set('kbm', 'jump', 5, 'KeyJ')).toBeNull();
    expect(s.set('kbm', 'inconnu' as BindAction, 0, 'KeyJ')).toBeNull();
    expect(s.set('gamepad', 'jump', 0, 'KeyJ')).toBeNull();
    expect(s.set('gamepad', 'jump', 0, 'B3')).toEqual(['reload']);
    expect(s.get('gamepad', 'jump')).toEqual(['B3']);
  });

  it('réinitialisation : valeurs par défaut et sauvegarde effacée', () => {
    const save = memorySave();
    const s = new BindingStore(save);
    s.set('kbm', 'interact', 0, 'KeyK');
    s.set('gamepad', 'interact', 0, 'B3');
    let notified = 0;
    s.onChange(() => notified++);
    const v = s.version;
    s.reset('kbm');
    expect(s.get('kbm', 'interact')).toEqual(['KeyE']);
    expect(s.get('gamepad', 'interact')).toEqual(['B3']);          // la manette n'est pas touchée
    expect(save.data[BINDINGS_SECTION]).toEqual({ v: 1, kbm: {}, gamepad: { interact: ['B3'], reload: [], siren: [] } });
    s.reset();
    expect(s.isDefault('kbm')).toBe(true);
    expect(s.isDefault('gamepad')).toBe(true);
    expect(save.data[BINDINGS_SECTION]).toBeUndefined();
    expect(s.version).toBeGreaterThan(v);
    expect(notified).toBe(2);
    s.set('kbm', 'jump', 0, 'KeyJ');
    s.resetAction('kbm', 'jump');
    expect(s.get('kbm', 'jump')).toEqual(['Space']);
    expect(save.data[BINDINGS_SECTION]).toBeUndefined();
  });

  it('sauvegarde abîmée ou d\'une autre version : ignorée sans erreur', () => {
    for (const bad of [null, 42, 'x', [], { v: 99, kbm: { jump: ['KeyJ'] } }, { v: 1, kbm: 'non' }, { v: 1, kbm: { jump: 'KeyJ' } }]) {
      const s = new BindingStore(memorySave({ [BINDINGS_SECTION]: bad }));
      expect(s.get('kbm', 'jump')).toEqual(['Space']);
    }
    const s = new BindingStore(memorySave({
      [BINDINGS_SECTION]: { v: 1, kbm: { jump: ['KeyJ', 7, '<b>', 'KeyJ', 'KeyU', 'KeyI'], inconnue: ['KeyX'] }, gamepad: { jump: ['B99', 'B5'] } },
    }));
    expect(s.get('kbm', 'jump')).toEqual(['KeyJ', 'KeyU']);          // codes invalides et doublons écartés, 2 au plus
    expect(s.get('gamepad', 'jump')).toEqual(['B5']);
  });

  it('persistance par ctx.save (section « bindings ») à travers le contexte factice', () => {
    const { ctx, controls } = createFakeContext({ headless: true });
    const s = new BindingStore(ctx.save);
    // (KeyK : touche libre ; KeyY est réservée aux appels de CENTRAL, mode Patrouille)
    s.set('kbm', 'radio', 0, 'KeyK');
    expect(controls.saved('bindings')).toEqual({ v: 1, kbm: { radio: ['KeyK'] }, gamepad: {} });
    expect(new BindingStore(ctx.save).get('kbm', 'radio')).toEqual(['KeyK']);
  });
});
