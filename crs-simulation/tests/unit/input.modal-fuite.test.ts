// Entrées — un écran bloquant (roue d'ordres, carte tactique) consomme les touches : un chiffre tapé pour choisir
// un secteur de la roue ne doit pas, une fois la roue refermée, changer l'objet en main (vue « simulation »).
import { describe, expect, it } from 'vitest';
import { InputSystem } from '@/input';
import type { InputScriptApi } from '@/input';
import { createFakeContext } from '@/input/dev/fakeContext';

function setup() {
  const fake = createFakeContext({ headless: true });
  const clock = { t: 1000 };
  const sys = new InputSystem({ now: () => clock.t });
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  const script = fake.ctx.require<InputScriptApi>('input.script');
  return { ...fake, sys, clock, script, input: fake.ctx.input };
}

describe('entrées — écran bloquant : rien ne fuit vers la simulation', () => {
  it('chiffre tapé pendant la roue, image sans pas de simulation puis roue refermée : aucun « slot » vu par le jeu', () => {
    const t = setup();
    // une image normale, roue ouverte
    t.controls.modal = true;
    t.clock.t += 16;
    t.sys.update(1 / 60);
    t.sys.frame(0.016);
    // le joueur tape « 3 » : l'image suivante n'a aucun pas de simulation (écran 120 Hz, simulation à 60 Hz)
    t.script.tap('slot3');
    t.clock.t += 8;
    t.sys.frame(0.008);
    // l'interface lit le chiffre dans la vue « image », choisit le secteur et referme la roue
    expect(t.input.pressed('slot3')).toBe(true);
    t.controls.modal = false;
    // pas suivant : le jeu ne doit pas voir l'appui
    t.clock.t += 8;
    let seen = false;
    t.sys.update(1 / 60);
    seen ||= t.input.pressed('slot3');
    t.sys.update(1 / 60);
    seen ||= t.input.pressed('slot3');
    expect(seen).toBe(false);
  });

  it('hors écran bloquant, un appui tapé entre deux pas reste bien vu par la simulation', () => {
    const t = setup();
    t.script.tap('slot3');
    t.clock.t += 8;
    t.sys.frame(0.008);
    t.clock.t += 8;
    t.sys.update(1 / 60);
    expect(t.input.pressed('slot3')).toBe(true);
  });
});
