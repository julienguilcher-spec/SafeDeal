import { describe, expect, it } from 'vitest';
import { SystemOrder } from '@/core/contracts';
import type { Button, InputState } from '@/core/contracts';
import { InputSystem, createSystems } from '@/input';
import type { InputBindingsApi, InputLabelsApi, InputScriptApi, InputTouchApi } from '@/input';
import { createFakeContext } from '@/input/dev/fakeContext';
import type { PadLike } from '@/input/gamepad';
import { PAD_YAW_SPEED } from '@/input/gamepad';

/** Manette factice au mapping standard. */
function fakePad(id = 'Manette d\'essai (STANDARD GAMEPAD)') {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const rumbles: Record<string, number>[] = [];
  const pad = {
    id, index: 0, connected: true, mapping: 'standard', axes, buttons,
    vibrationActuator: {
      playEffect(_type: string, params: Record<string, number>) {
        rumbles.push(params);
        return Promise.resolve('complete');
      },
    },
  };
  return {
    pad: pad as PadLike & { connected: boolean },
    axes,
    rumbles,
    press(i: number, value = 1): void {
      buttons[i] = { pressed: value > 0.5, value };
    },
    release(i: number): void {
      buttons[i] = { pressed: false, value: 0 };
    },
  };
}

/** Monte le système sur un contexte factice sans navigateur, avec une horloge pilotée par le test. */
function setup(withPad = false) {
  const fake = createFakeContext({ headless: true });
  const clock = { t: 1000 };
  const gp = fakePad();
  const pads: (PadLike | null)[] = withPad ? [gp.pad] : [];
  const sys = new InputSystem({ now: () => clock.t, getPads: withPad ? () => pads : undefined });
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  const input = fake.ctx.input;
  /** Une image du moteur : `steps` pas de simulation puis la présentation ; 16 ms réelles s'écoulent. */
  const tick = (steps: number, each?: (input: InputState, step: number) => void, frame?: (input: InputState) => void): void => {
    clock.t += 16;
    for (let s = 0; s < steps; s++) {
      sys.update(1 / 60);
      if (each) each(input, s);
    }
    sys.frame(0.016);
    if (frame) frame(input);
  };
  return {
    ...fake, sys, input, clock, gp, pads, tick,
    script: fake.ctx.require<InputScriptApi>('input.script'),
    touch: fake.ctx.require<InputTouchApi>('input.touch'),
    labels: fake.ctx.require<InputLabelsApi>('input.labels'),
    bindings: fake.ctx.require<InputBindingsApi>('input.bindings'),
  };
}

describe('entrées — système', () => {
  it('fabrique du module : un système d\'ordre INPUT qui publie ctx.input et ses services', () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0]!.id).toBe('input');
    expect(systems[0]!.order).toBe(SystemOrder.INPUT);
    const t = setup();
    expect(t.input).toBe(t.sys.core);
    expect(t.input.device).toBe('kbm');
    for (const key of ['input.touch', 'input.labels', 'input.bindings', 'input.script', 'input.pointer']) {
      expect(t.ctx.service(key), key).toBeDefined();
    }
    expect(t.input.pointerLocked).toBe(false);
    expect(t.input.moveX).toBe(0);
    expect(t.input.down('primary')).toBe(false);
  });

  it('un appui est vu exactement une fois par les pas ET une fois par les images, quel que soit l\'entrelacement', () => {
    const t = setup();
    const count = (pattern: number[]): { sim: number; simRel: number; frame: number; frameRel: number } => {
      const c = { sim: 0, simRel: 0, frame: 0, frameRel: 0 };
      const each = (i: InputState): void => {
        if (i.pressed('interact')) c.sim++;
        if (i.released('interact')) c.simRel++;
      };
      const frame = (i: InputState): void => {
        if (i.pressed('interact')) c.frame++;
        if (i.released('interact')) c.frameRel++;
      };
      // appui bref au milieu du motif, puis assez d'images pour tout écouler
      for (let k = 0; k < pattern.length; k++) {
        if (k === 2) t.script.tap('interact');
        t.tick(pattern[k]!, each, frame);
      }
      for (let k = 0; k < 6; k++) t.tick(1, each, frame);
      return c;
    };
    expect(count([1, 1, 1, 1, 1])).toEqual({ sim: 1, simRel: 1, frame: 1, frameRel: 1 });      // 60 images/s
    expect(count([3, 3, 3, 3, 3])).toEqual({ sim: 1, simRel: 1, frame: 1, frameRel: 1 });      // avance rapide : 3 pas par image
    expect(count([1, 0, 0, 0, 1])).toEqual({ sim: 1, simRel: 1, frame: 1, frameRel: 1 });      // images sans pas
    expect(count([0, 4, 0, 2, 0, 0, 3])).toEqual({ sim: 1, simRel: 1, frame: 1, frameRel: 1 });
  });

  it('appui maintenu : down pendant toute la durée, fronts uniques', () => {
    const t = setup();
    const seen: string[] = [];
    const each = (i: InputState): void => {
      seen.push((i.down('primary') ? 'D' : '-') + (i.pressed('primary') ? 'P' : '-') + (i.released('primary') ? 'R' : '-'));
    };
    t.tick(1, each);
    t.script.press('primary');
    t.tick(2, each);
    t.tick(1, each);
    t.script.release('primary');
    t.tick(2, each);
    expect(seen).toEqual(['---', 'DP-', 'D--', 'D--', '--R', '---']);
  });

  it('lookX / lookY / wheel : rendus une fois par pas et une fois par image', () => {
    const t = setup();
    t.tick(1);
    t.script.look(0.3, -0.1);
    t.script.wheel(2);
    const sim: number[] = [];
    let frameLook = 0;
    let frameWheel = 0;
    t.tick(3, (i) => sim.push(i.lookX), (i) => {
      frameLook = i.lookX;
      frameWheel = i.wheel;
    });
    expect(sim).toEqual([0.3, 0, 0]);
    expect(frameLook).toBeCloseTo(0.3, 12);
    expect(frameWheel).toBe(2);
    t.tick(1, (i) => expect(i.lookX).toBe(0), (i) => expect(i.wheel).toBe(0));
  });

  it('pause : ce qui est pressé dans les menus ne parvient pas à la simulation à la reprise', () => {
    const t = setup();
    t.tick(1);
    t.controls.phase = 'paused';
    let frameSaw = 0;
    t.script.tap('jump');
    t.script.look(2, 0);
    for (let k = 0; k < 4; k++) t.tick(0, undefined, (i) => {
      if (i.pressed('jump')) frameSaw++;
    });
    expect(frameSaw).toBe(1);                      // l'interface l'a vu
    t.controls.phase = 'playing';
    let simSaw = 0;
    let look = 0;
    for (let k = 0; k < 3; k++) t.tick(1, (i) => {
      if (i.pressed('jump') || i.released('jump')) simSaw++;
      look += i.lookX;
    });
    expect(simSaw).toBe(0);
    expect(look).toBe(0);
  });

  it('reset() (nouvelle session) : plus aucun front en attente', () => {
    const t = setup();
    t.tick(1);
    t.script.tap('primary');
    t.script.look(1, 1);
    t.sys.reset();
    let saw = false;
    t.tick(2, (i) => {
      saw = saw || i.pressed('primary') || i.lookX !== 0;
    });
    expect(saw).toBe(false);
  });

  it('source script : axes bornés, gâchettes, relâchement général', () => {
    const t = setup();
    t.script.setMove(3, 4);
    t.script.setTriggers(0.5, 2);
    t.script.press('sprint');
    t.tick(1);
    expect(t.input.moveX).toBeCloseTo(0.6, 9);
    expect(t.input.moveY).toBeCloseTo(0.8, 9);
    expect(t.input.throttle).toBe(0.5);
    expect(t.input.brake).toBe(1);
    expect(t.input.down('sprint')).toBe(true);
    expect(t.input.device).toBe('kbm');            // le script ne change pas le périphérique actif
    t.script.clear();
    t.tick(1);
    expect(t.input.moveX).toBe(0);
    expect(t.input.throttle).toBe(0);
    expect(t.input.down('sprint')).toBe(false);
  });

  it('à pied la norme du déplacement est bornée à 1 ; en véhicule les axes sont indépendants', () => {
    const t = setup(true);
    t.tick(1);
    t.script.setMove(0, 1);                        // « avancer » maintenu par ailleurs
    t.gp.axes[0] = 1;                              // stick à droite toute
    t.tick(1);
    expect(Math.hypot(t.input.moveX, t.input.moveY)).toBeCloseTo(1, 9);
    expect(t.input.moveX).toBeCloseTo(Math.SQRT1_2, 6);
    t.controls.inVehicle = true;
    t.tick(1);
    expect(t.input.moveX).toBeCloseTo(1, 9);       // volant à fond
    expect(t.input.moveY).toBeCloseTo(1, 9);       // accélérateur à fond
  });

  it('sans navigateur (pas de frame) : les axes sont relus à chaque pas', () => {
    const t = setup();
    t.script.setMove(0, 1);
    t.sys.update(1 / 30);
    expect(t.input.moveY).toBe(1);
    t.script.setMove(1, 0);
    t.sys.update(1 / 30);
    expect(t.input.moveX).toBe(1);
    expect(t.input.moveY).toBe(0);
  });
});

describe('entrées — manette', () => {
  it('branchement à chaud, zones mortes, sticks, gâchettes analogiques, périphérique actif', () => {
    const t = setup(true);
    t.tick(1);
    expect(t.controls.notices).toContain('Manette connectée.');
    expect(t.input.device).toBe('kbm');            // branchée mais pas encore utilisée
    t.gp.axes[0] = 0.08;                           // dérive dans la zone morte
    t.gp.axes[1] = -0.05;
    t.tick(1);
    expect(t.input.moveX).toBe(0);
    expect(t.input.moveY).toBe(0);
    expect(t.input.device).toBe('kbm');
    t.gp.axes[0] = 0;
    t.gp.axes[1] = -1;                             // stick gauche vers le haut = avancer
    t.clock.t += 400;
    t.tick(1);
    expect(t.input.moveY).toBeCloseTo(1, 9);
    expect(t.input.moveX).toBeCloseTo(0, 9);
    expect(t.input.device).toBe('gamepad');
    t.gp.press(7, 0.5);                            // gâchette droite à mi-course
    t.gp.press(6, 1);
    t.tick(1);
    expect(t.input.throttle).toBeCloseTo((0.5 - 0.06) / 0.88, 6);
    expect(t.input.brake).toBe(1);
    expect(t.input.down('primary')).toBe(true);    // la gâchette est aussi le bouton d'action
    expect(t.input.down('secondary')).toBe(true);
    t.gp.press(7, 0.2);                            // presque relâchée : plus d'action, encore un filet de gaz
    t.tick(1);
    expect(t.input.down('primary')).toBe(false);
    expect(t.input.throttle).toBeGreaterThan(0.1);
  });

  it('boutons selon le tableau, y compris les doubles emplois par contexte', () => {
    const t = setup(true);
    t.tick(1);
    const check = (index: number, expected: Button[]): void => {
      t.gp.press(index);
      t.tick(1);
      for (const b of expected) expect(t.input.down(b), `B${index} → ${b}`).toBe(true);
      t.gp.release(index);
      t.tick(1);
      for (const b of expected) expect(t.input.down(b), `B${index} relâché → ${b}`).toBe(false);
    };
    check(0, ['jump', 'handbrake', 'ui_accept']);
    check(1, ['crouch', 'ui_back']);
    check(2, ['interact']);
    check(4, ['item_prev']);
    check(5, ['item_next']);
    check(8, ['map']);
    check(9, ['pause']);
    check(10, ['sprint']);
    check(11, ['camera']);
    check(12, ['radio', 'ui_up']);
    check(13, ['mask', 'ui_down']);
    check(14, ['visor', 'ui_left']);
    check(15, ['orders', 'ui_right']);
  });

  it('stick droit : rotation proportionnelle au temps réel et à la sensibilité, inversion Y', () => {
    const t = setup(true);
    t.tick(1);
    t.gp.axes[2] = 1;
    t.gp.axes[3] = -1;                             // en haut à droite, à fond
    let look = { x: 0, y: 0 };
    t.tick(1, (i) => {
      look = { x: i.lookX, y: i.lookY };
    });
    const k = Math.SQRT1_2;                        // norme 1 répartie sur les deux axes
    expect(look.x).toBeCloseTo(k * PAD_YAW_SPEED * 0.016, 6);
    expect(look.y).toBeGreaterThan(0);             // stick vers le haut = lever le regard
    t.controls.settings.gamepadSensitivity = 2;
    t.controls.settings.invertY = true;
    t.tick(1, (i) => {
      look = { x: i.lookX, y: i.lookY };
    });
    expect(look.x).toBeCloseTo(2 * k * PAD_YAW_SPEED * 0.016, 6);
    expect(look.y).toBeLessThan(0);
  });

  it('le stick gauche pilote aussi les menus (ui_*), avec hystérésis', () => {
    const t = setup(true);
    t.tick(1);
    t.gp.axes[1] = 1;                              // vers le bas
    t.tick(1);
    expect(t.input.down('ui_down')).toBe(true);
    expect(t.input.down('ui_up')).toBe(false);
    t.gp.axes[1] = 0.55;                           // revient un peu : toujours enfoncé
    t.tick(1);
    expect(t.input.down('ui_down')).toBe(true);
    t.gp.axes[1] = 0.3;
    t.tick(1);
    expect(t.input.down('ui_down')).toBe(false);
  });

  it('vibration : envoyée à la manette active, respecte le réglage', () => {
    const t = setup(true);
    t.tick(1);
    t.gp.press(0);
    t.clock.t += 400;
    t.tick(1);
    expect(t.input.device).toBe('gamepad');
    t.input.rumble(0.6, 0.25);
    expect(t.gp.rumbles.length).toBe(1);
    expect(t.gp.rumbles[0]!.duration).toBe(250);
    expect(t.gp.rumbles[0]!.weakMagnitude).toBeCloseTo(0.6, 9);
    t.controls.settings.vibration = false;
    t.input.rumble(1, 1);
    expect(t.gp.rumbles.length).toBe(1);
  });

  it('débranchement à chaud : tout est relâché, repli sur le clavier, pause demandée', () => {
    const t = setup(true);
    t.tick(1);
    t.gp.press(2);
    t.gp.axes[0] = 1;
    t.clock.t += 400;
    t.tick(1);
    expect(t.input.device).toBe('gamepad');
    expect(t.input.down('interact')).toBe(true);
    t.clock.t += 2000;
    t.pads[0] = null;                              // débranchée
    let pausePressed = 0;
    t.tick(1, (i) => {
      if (i.pressed('pause')) pausePressed++;
    });
    expect(t.input.down('interact')).toBe(false);
    expect(t.input.moveX).toBe(0);
    expect(t.input.device).toBe('kbm');
    expect(t.controls.notices).toContain('Manette débranchée.');
    for (let k = 0; k < 3; k++) t.tick(1, (i) => {
      if (i.pressed('pause')) pausePressed++;
    });
    expect(pausePressed).toBe(1);
    // rebranchée : reprise sans intervention (recherche périodique)
    t.gp.release(2);
    t.gp.axes[0] = 0;
    t.pads[0] = t.gp.pad;
    for (let k = 0; k < 80; k++) t.tick(1);
    t.gp.press(2);
    t.tick(1);
    expect(t.input.down('interact')).toBe(true);
  });

  it('réaffectation d\'un bouton de manette : capture, puis nouvelle table utilisée et enregistrée', () => {
    const t = setup(true);
    t.tick(1);
    let captured: string | null | undefined;
    t.bindings.capture('gamepad', (code) => {
      captured = code;
    });
    t.gp.press(3);
    let leaked = false;
    t.tick(1, (i) => {
      leaked = leaked || i.down('reload');
    });
    expect(captured).toBe('B3');
    expect(leaked).toBe(false);                    // le bouton capturé n'agit pas dans le jeu
    // « interagir » vaut partout : Y est retiré à « recharger » (à pied) et à « sirène » (en véhicule)
    expect(t.bindings.set('gamepad', 'interact', 0, 'B3')).toEqual(['reload', 'siren']);
    t.gp.release(3);
    t.tick(1);
    t.gp.press(3);
    t.tick(1);
    expect(t.input.down('interact')).toBe(true);
    expect(t.controls.saved('bindings')).toEqual({ v: 1, kbm: {}, gamepad: { interact: ['B3'], reload: [], siren: [] } });
    t.bindings.reset('gamepad');
    t.tick(1);
    t.gp.release(3);
    t.tick(1);
    t.gp.press(2);
    t.tick(1);
    expect(t.input.down('interact')).toBe(true);
    expect(t.controls.saved('bindings')).toBeUndefined();
  });
});

describe('entrées — libellés et surcouche tactile sans DOM', () => {
  it('labelFor suit le périphérique et la disposition du clavier', () => {
    const t = setup(true);
    t.tick(1);
    expect(t.labels.labelFor('interact')).toBe('E');
    expect(t.labels.labelFor('primary')).toBe('Clic gauche');
    expect(t.labels.labelFor('sprint')).toBe('Maj');
    expect(t.labels.labelFor('pause')).toBe('Échap');
    expect(t.labels.labelsFor('pause')).toEqual(['Échap', 'P']);
    expect(t.labels.moveLabel()).toBe('ZQSD');
    expect(t.labels.lookLabel()).toBe('Souris');
    expect(t.labels.labelFor('interact', 'gamepad')).toBe('X');
    expect(t.labels.labelFor('primary', 'gamepad')).toBe('RT');
    expect(t.labels.moveLabel('gamepad')).toBe('Stick gauche');
    expect(t.labels.labelFor('interact', 'touch')).toBe('Interagir');
    expect(t.labels.labelFor('primary', 'touch')).toBe('Action');
    expect(t.labels.labelFor('secondary', 'touch')).toBe('Viser');
    expect(t.labels.labelFor('megaphone', 'gamepad')).toBe('');     // rien d'affecté
    expect(t.labels.actionName('siren')).toBe('Sirène');
    expect(t.labels.codeLabel('kbm', 'KeyW')).toBe('Z');
    const v = t.labels.version;
    t.bindings.set('kbm', 'interact', 0, 'KeyK');
    expect(t.labels.labelFor('interact')).toBe('K');
    expect(t.labels.version).toBeGreaterThan(v);
    // bascule sur la manette : le libellé par défaut suit
    t.gp.press(0);
    t.clock.t += 400;
    t.tick(1);
    expect(t.labels.labelFor('interact')).toBe('X');
    expect(t.labels.labelFor('jump')).toBe('A');
  });

  it('service input.touch : disposition automatique d\'après le joueur, écran modal, disposition imposée', () => {
    const t = setup();
    t.tick(1);
    expect(t.touch.mode).toBe('auto');
    expect(t.touch.layout).toBe('pied');
    expect(t.touch.visible).toBe(false);           // périphérique actif : clavier
    t.controls.inVehicle = true;
    t.tick(1);
    expect(t.touch.layout).toBe('vehicule');
    expect(t.labels.labelFor('interact', 'touch')).toBe('Sortir');
    t.controls.flying = true;
    t.tick(1);
    expect(t.touch.layout).toBe('drone');
    t.controls.inVehicle = false;
    t.controls.cameraMode = 'drone';
    t.tick(1);
    expect(t.touch.layout).toBe('drone');
    t.controls.cameraMode = 'fps';
    t.controls.modal = true;
    t.tick(1);
    expect(t.touch.layout).toBe('menu');
    t.controls.modal = false;
    t.controls.phase = 'menu';
    t.tick(0);
    expect(t.touch.layout).toBe('menu');
    t.touch.setLayout('vehicule');                 // imposée par l'interface
    t.tick(0);
    expect(t.touch.layout).toBe('vehicule');
    t.touch.setLayout('cache');
    t.touch.setForced(true);
    t.tick(0);
    expect(t.touch.layout).toBe('cache');
    expect(t.touch.visible).toBe(false);
    t.touch.setLayout('pied');
    t.tick(0);
    expect(t.touch.visible).toBe(true);
    // ces appels ne doivent rien casser sans DOM
    t.touch.setInteractLabel('Menotter');
    t.touch.setItemBar(['🛡', { icon: '◍', label: 'Grenade', count: 3 }], 1);
    t.touch.setItemBar(null);
    t.touch.setButtonVisible('visor', false);
    t.touch.setToggle('crouch', true);
    t.touch.setLayout('nimporte' as never);
    t.tick(1);
    expect(t.touch.layout).toBe('pied');
  });
});
