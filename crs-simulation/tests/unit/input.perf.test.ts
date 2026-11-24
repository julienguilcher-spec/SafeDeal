import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { InputSystem } from '@/input';
import type { InputScriptApi } from '@/input';
import { BUTTONS } from '@/input/buttons';
import { createFakeContext } from '@/input/dev/fakeContext';
import type { PadLike } from '@/input/gamepad';

describe('entrées — performance', () => {
  it('boucle chaude : quelques microsecondes par image et pas d\'allocation', () => {
    const fake = createFakeContext({ headless: true });
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const axes = [0.1, 0.1, 0.1, 0.1];
    const pad = { id: 'Manette d\'essai', index: 0, connected: true, mapping: 'standard', axes, buttons } as PadLike;
    const pads: (PadLike | null)[] = [pad];
    // Horloge du test dans un tableau typé : un nombre flottant rangé dans une variable de fermeture
    // serait réalloué par le moteur JavaScript à chaque incrément et fausserait la mesure.
    const clock = new Float64Array(1);
    const sys = new InputSystem({ now: () => clock[0]!, getPads: () => pads });
    sys.provide(fake.ctx);
    sys.init(fake.ctx);
    const input = fake.ctx.input;
    const script = fake.ctx.require<InputScriptApi>('input.script');

    let hits = 0;
    const run = (frames: number): void => {
      for (let f = 0; f < frames; f++) {
        clock[0] += 16.6;
        // entrées qui changent sans cesse : sticks, gâchette, boutons de manette, appuis et regard simulés
        axes[0] = ((f % 200) - 100) / 100;
        axes[1] = ((f % 140) - 70) / 70;
        axes[2] = ((f % 90) - 45) / 45;
        axes[3] = -0.4;
        buttons[7]!.value = (f % 50) / 50;
        buttons[2]!.pressed = f % 7 < 3;
        buttons[0]!.pressed = f % 11 < 2;
        if (f % 13 === 0) script.tap('interact');
        if (f % 17 === 0) script.look(0.01, -0.005);
        const steps = f % 3;                       // 0, 1 ou 2 pas de simulation par image
        for (let s = 0; s < steps; s++) {
          sys.update(1 / 60);
          for (let b = 0; b < BUTTONS.length; b++) if (input.pressed(BUTTONS[b]!)) hits++;
          if (input.lookX !== 0) hits++;
        }
        sys.frame(1 / 60);
        if (input.down('primary')) hits++;
      }
    };

    run(40000);                                    // échauffement : compilation optimisée
    // Octets alloués par image : pente du tas entre deux lectures, sans collecte entre les deux
    // (une collecte fait baisser le tas : on garde la plus petite pente positive de plusieurs essais).
    let bytesPerFrame = Infinity;
    let usPerFrame = Infinity;
    const frames = 30000;
    for (let trial = 0; trial < 8; trial++) {
      const h0 = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      run(frames);
      const us = ((performance.now() - t0) * 1000) / frames;
      const bytes = (process.memoryUsage().heapUsed - h0) / frames;
      if (us < usPerFrame) usPerFrame = us;
      if (bytes >= 0 && bytes < bytesPerFrame) bytesPerFrame = bytes;
    }
    console.info(`[input] image complète (1 pas en moyenne, 42 lectures de boutons par pas, manette active) : ${usPerFrame.toFixed(2)} µs, ${bytesPerFrame.toFixed(1)} octets alloués`);
    expect(hits).toBeGreaterThan(1000);
    // Seul reste le nombre flottant rendu par l'horloge (16 octets) : un objet, un tableau ou une
    // fermeture créés par image dépasseraient ce plafond.
    expect(bytesPerFrame).toBeLessThanOrEqual(40);
    expect(usPerFrame).toBeLessThan(60);
  });
});
