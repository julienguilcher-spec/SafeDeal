import { PerformanceObserver, performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { InputSystem } from '@/input';
import type { InputScriptApi } from '@/input';
import { BUTTONS } from '@/input/buttons';
import { createFakeContext } from '@/input/dev/fakeContext';
import type { PadLike } from '@/input/gamepad';

describe('entrées — performance', () => {
  it('boucle chaude sans allocation : aucun ramasse-miettes déclenché en 600 000 images', async () => {
    const fake = createFakeContext({ headless: true });
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const axes = [0, 0, 0, 0];
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
        // entrées qui changent sans cesse : sticks, gâchettes, boutons de manette et appuis simulés
        axes[0] = ((f % 200) - 100) / 100;
        axes[1] = ((f % 140) - 70) / 70;
        axes[2] = ((f % 90) - 45) / 45;
        buttons[7]!.value = (f % 50) / 50;
        buttons[2]!.pressed = f % 7 < 3;
        buttons[0]!.pressed = f % 11 < 2;
        if (f % 13 === 0) script.tap('interact');
        if (f % 17 === 0) script.look(0.01, -0.005);
        const steps = f % 3;                       // 0, 1 ou 2 pas par image
        for (let s = 0; s < steps; s++) {
          sys.update(1 / 60);
          for (let b = 0; b < BUTTONS.length; b++) if (input.pressed(BUTTONS[b]!)) hits++;
          hits += input.lookX !== 0 ? 1 : 0;
        }
        sys.frame(1 / 60);
        if (input.down('primary')) hits++;
      }
    };

    run(20000);                                    // échauffement : compilation, formes cachées
    let collections = 0;
    const observer = new PerformanceObserver((list) => {
      collections += list.getEntries().length;
    });
    observer.observe({ entryTypes: ['gc'] });
    await new Promise((r) => setTimeout(r, 20));
    collections = 0;
    const frames = 600000;
    const t0 = performance.now();
    run(frames);
    const ms = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 30));   // laisse l'observateur livrer ses entrées
    observer.disconnect();

    const usPerFrame = (ms * 1000) / frames;
    console.info(`[input] ${frames} images (1 pas en moyenne, 42 lectures de boutons par pas) : ${usPerFrame.toFixed(2)} µs par image, ${collections} passage(s) du ramasse-miettes`);
    expect(hits).toBeGreaterThan(1000);
    // Une allocation de 16 octets par image suffirait à déclencher plusieurs collectes sur cette durée.
    expect(collections).toBeLessThanOrEqual(1);
    expect(usPerFrame).toBeLessThan(40);
  });
});
