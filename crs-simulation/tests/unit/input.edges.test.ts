import { describe, expect, it } from 'vitest';
import { ButtonLatch, DeltaLatch, VIEW_FRAME, VIEW_SIM } from '@/input/edges';
import { InputCore } from '@/input/core';
import { BUTTON_INDEX } from '@/input/buttons';
import { SRC_KBM, SRC_PAD, SRC_TOUCH } from '@/input/merge';

const B = 3;

/** Lit l'état d'un bouton dans une vue sous forme compacte : D = down, P = pressed, R = released. */
function read(l: ButtonLatch, view: 0 | 1, i = B): string {
  return (l.down(view, i) ? 'D' : '-') + (l.pressed(view, i) ? 'P' : '-') + (l.released(view, i) ? 'R' : '-');
}

describe('entrées — détection des fronts (ButtonLatch)', () => {
  it('appui maintenu : pressed pendant un seul verrouillage, released pendant un seul', () => {
    const l = new ButtonLatch(8);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('---');
    l.set(SRC_KBM, B, true);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('DP-');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('D--');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('D--');
    l.set(SRC_KBM, B, false);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('--R');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('---');
  });

  it('appui bref entre deux verrouillages : jamais perdu, pressed puis released', () => {
    const l = new ButtonLatch(8);
    l.latch(VIEW_SIM);
    l.set(SRC_KBM, B, true);
    l.set(SRC_KBM, B, false);        // relâché avant que quiconque ait regardé
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('DP-');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('--R');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('---');
  });

  it('pulse() équivaut à un appui bref', () => {
    const l = new ButtonLatch(8);
    l.pulse(SRC_KBM, B);
    l.latch(VIEW_FRAME);
    expect(read(l, VIEW_FRAME)).toBe('DP-');
    l.latch(VIEW_FRAME);
    expect(read(l, VIEW_FRAME)).toBe('--R');
  });

  it('relâché puis renfoncé entre deux verrouillages : released puis pressed, sans bouton collé', () => {
    const l = new ButtonLatch(8);
    l.set(SRC_KBM, B, true);
    l.latch(VIEW_SIM);
    l.set(SRC_KBM, B, false);
    l.set(SRC_KBM, B, true);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('--R');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('DP-');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('D--');
  });

  it('pressed et released ne sont jamais vrais ensemble ; l\'état converge vers l\'état physique', () => {
    const l = new ButtonLatch(4);
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let physical = false;
    for (let step = 0; step < 4000; step++) {
      const changes = Math.floor(rnd() * 4);
      for (let c = 0; c < changes; c++) {
        physical = !physical;
        l.set(SRC_KBM, 1, physical);
      }
      l.latch(VIEW_SIM);
      expect(l.pressed(VIEW_SIM, 1) && l.released(VIEW_SIM, 1)).toBe(false);
      if (l.pressed(VIEW_SIM, 1)) expect(l.down(VIEW_SIM, 1)).toBe(true);
      if (l.released(VIEW_SIM, 1)) expect(l.down(VIEW_SIM, 1)).toBe(false);
    }
    // sans nouvel événement, deux verrouillages suffisent à rejoindre l'état physique
    l.latch(VIEW_SIM);
    l.latch(VIEW_SIM);
    l.latch(VIEW_SIM);
    expect(l.down(VIEW_SIM, 1)).toBe(physical);
    expect(l.pressed(VIEW_SIM, 1)).toBe(false);
    expect(l.released(VIEW_SIM, 1)).toBe(false);
  });

  it('chaque appui produit exactement un pressed et un released (appuis brefs et maintenus, au hasard)', () => {
    // Une vue montre au plus une transition par verrouillage : un appui bref occupe donc deux
    // verrouillages. Tant que les appuis ne sont pas plus rapprochés que cela (30 par seconde à
    // 60 pas/s), aucun n'est fusionné ni perdu.
    const l = new ButtonLatch(4);
    let presses = 0;
    let seenPressed = 0;
    let seenReleased = 0;
    let wait = 0;
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let step = 0; step < 4000; step++) {
      if (wait > 0) {
        wait--;
      } else {
        const r = rnd();
        if (r < 0.25 && !l.rawDown(2)) {
          l.pulse(SRC_TOUCH, 2);       // appui bref, relâché avant le verrouillage
          presses++;
          wait = 1;
        } else if (r < 0.5) {
          if (!l.rawDown(2)) presses++;
          l.set(SRC_KBM, 2, !l.rawDown(2));
        }
      }
      l.latch(VIEW_SIM);
      if (l.pressed(VIEW_SIM, 2)) seenPressed++;
      if (l.released(VIEW_SIM, 2)) seenReleased++;
    }
    l.set(SRC_KBM, 2, false);
    for (let i = 0; i < 3; i++) {
      l.latch(VIEW_SIM);
      if (l.pressed(VIEW_SIM, 2)) seenPressed++;
      if (l.released(VIEW_SIM, 2)) seenReleased++;
    }
    expect(presses).toBeGreaterThan(300);
    expect(seenPressed).toBe(presses);
    expect(seenReleased).toBe(presses);
  });

  it('les deux vues sont indépendantes', () => {
    const l = new ButtonLatch(8);
    l.set(SRC_KBM, B, true);
    l.latch(VIEW_FRAME);
    expect(read(l, VIEW_FRAME)).toBe('DP-');
    expect(read(l, VIEW_SIM)).toBe('---');       // la simulation n'a pas encore fait de pas
    l.latch(VIEW_FRAME);
    l.latch(VIEW_FRAME);
    expect(read(l, VIEW_FRAME)).toBe('D--');
    l.latch(VIEW_SIM);                           // trois images plus tard, le pas voit quand même le front
    expect(read(l, VIEW_SIM)).toBe('DP-');
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('D--');
  });

  it('sync() recale sans front et oublie ce qui était en attente', () => {
    const l = new ButtonLatch(8);
    l.pulse(SRC_KBM, B);                         // appui bref pendant la pause
    l.set(SRC_KBM, 5, true);                     // touche encore tenue à la reprise
    l.sync(VIEW_SIM);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM, B)).toBe('---');
    expect(read(l, VIEW_SIM, 5)).toBe('D--');    // tenue, mais sans pressed
    l.set(SRC_KBM, 5, false);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM, 5)).toBe('--R');
  });

  it('plusieurs sources : enfoncé tant qu\'une source le tient, un seul front', () => {
    const l = new ButtonLatch(8);
    l.set(SRC_KBM, B, true);
    l.set(SRC_PAD, B, true);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('DP-');
    l.set(SRC_KBM, B, false);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('D--');       // la manette le tient encore
    expect(l.heldBy(SRC_PAD, B)).toBe(true);
    expect(l.heldBy(SRC_KBM, B)).toBe(false);
    l.releaseSource(SRC_PAD);
    l.latch(VIEW_SIM);
    expect(read(l, VIEW_SIM)).toBe('--R');
  });

  it('index hors bornes : sans effet', () => {
    const l = new ButtonLatch(4);
    l.set(SRC_KBM, -1, true);
    l.set(SRC_KBM, 99, true);
    l.pulse(SRC_KBM, -1);
    expect(l.rawDown(-1)).toBe(false);
    expect(l.rawDown(99)).toBe(false);
  });
});

describe('entrées — accumulateur de rotation (DeltaLatch)', () => {
  it('rend la somme une seule fois à chaque vue', () => {
    const d = new DeltaLatch(2);
    d.add(0, 0.1);
    d.add(0, 0.2);
    d.add(1, -0.05);
    d.latch(VIEW_SIM);
    expect(d.get(VIEW_SIM, 0)).toBeCloseTo(0.3, 12);
    expect(d.get(VIEW_SIM, 1)).toBeCloseTo(-0.05, 12);
    d.latch(VIEW_SIM);
    expect(d.get(VIEW_SIM, 0)).toBe(0);
    d.latch(VIEW_FRAME);
    expect(d.get(VIEW_FRAME, 0)).toBeCloseTo(0.3, 12);
    d.add(0, 1);
    d.flush(VIEW_SIM);
    d.latch(VIEW_SIM);
    expect(d.get(VIEW_SIM, 0)).toBe(0);          // oublié pour la simulation
    d.latch(VIEW_FRAME);
    expect(d.get(VIEW_FRAME, 0)).toBe(1);        // mais pas pour l'image
  });
});

describe('entrées — InputCore : vues simulation et image', () => {
  const E = BUTTON_INDEX.interact;

  it('trois pas dans une image : le front n\'est vu qu\'au premier', () => {
    const core = new InputCore();
    core.beginFrame(true);
    core.latch.set(SRC_KBM, E, true);
    core.addLook(0.2, -0.1);
    const seen: boolean[] = [];
    const looks: number[] = [];
    for (let s = 0; s < 3; s++) {
      core.beginStep();
      seen.push(core.pressed('interact'));
      looks.push(core.lookX);
      expect(core.down('interact')).toBe(true);
    }
    expect(seen).toEqual([true, false, false]);
    expect(looks).toEqual([0.2, 0, 0]);
    core.beginFrame(true);
    expect(core.pressed('interact')).toBe(true);   // l'interface le voit aussi, une fois
    expect(core.lookX).toBeCloseTo(0.2, 12);
    expect(core.lookY).toBeCloseTo(-0.1, 12);
    core.beginFrame(true);
    expect(core.pressed('interact')).toBe(false);
    expect(core.lookX).toBe(0);
  });

  it('plusieurs images sans pas : le front attend le pas suivant', () => {
    const core = new InputCore();
    core.beginFrame(true);
    core.latch.pulse(SRC_KBM, E);
    let frameSeen = 0;
    for (let f = 0; f < 4; f++) {
      core.beginFrame(true);
      if (core.pressed('interact')) frameSeen++;
    }
    expect(frameSeen).toBe(1);
    core.beginStep();
    expect(core.pressed('interact')).toBe(true);
    expect(core.down('interact')).toBe(true);
    core.beginStep();
    expect(core.pressed('interact')).toBe(false);
    expect(core.released('interact')).toBe(true);
  });

  it('simulation arrêtée (pause) : rien ne fuit vers le premier pas de la reprise', () => {
    const core = new InputCore();
    core.beginFrame(false);
    core.latch.pulse(SRC_KBM, BUTTON_INDEX.jump);    // Espace pressé dans le menu de pause
    core.latch.set(SRC_KBM, BUTTON_INDEX.sprint, true);
    core.addLook(1.5, 0);
    core.beginFrame(false);
    expect(core.pressed('jump')).toBe(true);         // l'interface, elle, le voit
    core.beginFrame(false);
    core.beginStep();                                // reprise
    expect(core.pressed('jump')).toBe(false);
    expect(core.down('jump')).toBe(false);
    expect(core.pressed('sprint')).toBe(false);      // tenu, sans front
    expect(core.down('sprint')).toBe(true);
    expect(core.lookX).toBe(0);                      // pas de saut de caméra
  });

  it('bouton inconnu : faux partout, sans erreur', () => {
    const core = new InputCore();
    core.beginStep();
    expect(core.down('nimporte' as never)).toBe(false);
    expect(core.pressed('toString' as never)).toBe(false);
  });

  it('rumble : borne et protège le récepteur', () => {
    const core = new InputCore();
    const calls: [number, number][] = [];
    core.rumbleSink = (s, t) => calls.push([s, t]);
    core.rumble(3, 60);
    core.rumble(0, 1);
    core.rumble(0.5, -1);
    expect(calls).toEqual([[1, 5]]);
    core.rumbleSink = () => {
      throw new Error('moteur en panne');
    };
    const err = console.error;
    console.error = () => {};
    expect(() => core.rumble(1, 1)).not.toThrow();
    console.error = err;
  });
});
