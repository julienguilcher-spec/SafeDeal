// Socle de l'interface — pile d'écrans : ouverture, fermeture, retour arrière, écrans modaux, pause automatique.
import { describe, expect, it } from 'vitest';
import type { InputState, SessionPhase } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import { createNullInput } from '@/core/null-presentation';
import { ScreenManager } from '@/ui/core/screens';

interface Fixture {
  screens: ScreenManager;
  session: { phase: SessionPhase; pause(p: boolean): void; calls: boolean[] };
  log: string[];
  hosts: Set<object>;
}

function setup(phase: SessionPhase = 'playing'): Fixture {
  const log: string[] = [];
  const hosts = new Set<object>();
  const session = {
    phase,
    calls: [] as boolean[],
    pause(paused: boolean): void {
      session.calls.push(paused);
      if (paused && session.phase === 'playing') session.phase = 'paused';
      else if (!paused && session.phase === 'paused') session.phase = 'playing';
    },
  };
  const screens = new ScreenManager({
    session,
    hostFactory: (id) => {
      const host = { id } as unknown as HTMLElement;
      hosts.add(host);
      return host;
    },
    hostRemove: (host) => {
      hosts.delete(host);
    },
    onOpened: (s) => log.push('ouvert:' + s.id),
    onClosing: (s) => log.push('fermeture:' + s.id),
    onChange: () => log.push('pile:' + screens.stack.map((s) => s.id).join(',')),
  });
  const simple = (id: string, extra: Partial<ScreenInstance> = {}) => (): ScreenInstance => ({
    dispose: () => log.push('détruit:' + id),
    ...extra,
  });
  screens.register('menu', simple('menu'), { modal: true, pauses: false, hidesHud: true });
  screens.register('pause', simple('pause'), { modal: true, pauses: true });
  screens.register('parametres', simple('parametres'), { modal: true, pauses: true });
  screens.register('roue', simple('roue'), { modal: false, pauses: false });
  screens.register('racine', simple('racine', { back: () => true }), { modal: true, pauses: false });
  return { screens, session, log, hosts };
}

describe('ui/écrans — pile', () => {
  it('ouvre au sommet, ferme le sommet par défaut, tient current et modal', () => {
    const { screens, hosts } = setup();
    expect(screens.current).toBeNull();
    expect(screens.modal).toBe(false);
    expect(screens.open('roue')).toBe(true);
    expect(screens.current).toBe('roue');
    expect(screens.modal).toBe(false);
    screens.open('pause');
    screens.open('parametres');
    expect(screens.stack.map((s) => s.id)).toEqual(['roue', 'pause', 'parametres']);
    expect(screens.modal).toBe(true);
    expect(hosts.size).toBe(3);
    expect(screens.close()).toBe(true);
    expect(screens.current).toBe('pause');
    expect(screens.close('roue')).toBe(true);
    expect(screens.stack.map((s) => s.id)).toEqual(['pause']);
    expect(screens.close('roue')).toBe(false);
    screens.close();
    expect(screens.close()).toBe(false);
    expect(hosts.size).toBe(0);
  });

  it('ignore un écran non enregistré', () => {
    const { screens } = setup();
    expect(screens.has('carte')).toBe(false);
    expect(screens.open('carte')).toBe(false);
    expect(screens.current).toBeNull();
  });

  it('rouvrir un écran déjà ouvert le recrée au sommet avec ses nouvelles données', () => {
    const { screens, log } = setup();
    const seen: unknown[] = [];
    screens.register('fiche', (_h, data) => {
      seen.push(data);
      return { dispose: () => log.push('détruit:fiche') };
    }, { modal: true, pauses: false });
    screens.open('fiche', 1);
    screens.open('menu');
    screens.open('fiche', 2);
    expect(seen).toEqual([1, 2]);
    expect(screens.stack.map((s) => s.id)).toEqual(['menu', 'fiche']);
    expect(log.filter((l) => l === 'détruit:fiche').length).toBe(1);
  });

  it('détruit l’instance et retire l’hôte à la fermeture, dans cet ordre', () => {
    const { screens, log, hosts } = setup();
    screens.open('pause');
    log.length = 0;
    screens.close('pause');
    expect(log).toEqual(['fermeture:pause', 'détruit:pause', 'pile:']);
    expect(hosts.size).toBe(0);
  });

  it('une création qui échoue ne laisse ni écran ni hôte', () => {
    const { screens, hosts } = setup();
    screens.register('casse', () => {
      throw new Error('boum');
    }, { modal: true, pauses: true });
    expect(screens.open('casse')).toBe(false);
    expect(screens.stack.length).toBe(0);
    expect(hosts.size).toBe(0);
  });

  it('closeAll avec filtre', () => {
    const { screens } = setup();
    screens.open('roue');
    screens.open('pause');
    screens.open('parametres');
    screens.closeAll((s) => s.options.pauses);
    expect(screens.stack.map((s) => s.id)).toEqual(['roue']);
    screens.closeAll();
    expect(screens.stack.length).toBe(0);
  });
});

describe('ui/écrans — retour arrière', () => {
  it('ferme l’écran du sommet, un à la fois', () => {
    const { screens } = setup();
    screens.open('pause');
    screens.open('parametres');
    expect(screens.back()).toBe(true);
    expect(screens.current).toBe('pause');
    expect(screens.back()).toBe(true);
    expect(screens.current).toBeNull();
    expect(screens.back()).toBe(false);
  });

  it('un écran qui traite lui-même le retour reste ouvert', () => {
    const { screens } = setup();
    screens.open('racine');
    expect(screens.back()).toBe(true);
    expect(screens.current).toBe('racine');
  });

  it('un back() qui lève une exception ferme tout de même l’écran', () => {
    const { screens } = setup();
    screens.register('fragile', () => ({ back: () => { throw new Error('boum'); }, dispose: () => {} }), { modal: true, pauses: false });
    screens.open('fragile');
    expect(screens.back()).toBe(true);
    expect(screens.current).toBeNull();
  });
});

describe('ui/écrans — pause automatique', () => {
  it('met la session en pause à l’ouverture et la relâche quand le dernier écran « pauses » se ferme', () => {
    const { screens, session } = setup();
    screens.open('roue');
    expect(session.phase).toBe('playing');
    screens.open('pause');
    expect(session.phase).toBe('paused');
    expect(screens.holdsPause).toBe(true);
    screens.open('parametres');
    screens.close('parametres');
    expect(session.phase).toBe('paused');
    screens.close('pause');
    expect(session.phase).toBe('playing');
    expect(session.calls).toEqual([true, false]);
    expect(screens.holdsPause).toBe(false);
  });

  it('ne touche pas à la session hors du jeu (menu, chargement)', () => {
    const { screens, session } = setup('menu');
    screens.open('parametres');
    screens.close('parametres');
    expect(session.calls).toEqual([]);
    expect(session.phase).toBe('menu');
  });

  it('un écran « pauses » ouvert pendant le chargement met en pause dès que la partie commence', () => {
    const { screens, session } = setup('loading');
    screens.open('parametres');
    expect(session.calls).toEqual([]);
    session.phase = 'playing';
    screens.syncPause();
    expect(session.phase).toBe('paused');
    screens.close('parametres');
    expect(session.phase).toBe('playing');
  });

  it('reprend à son compte une pause posée par un autre, et la lève à la fermeture', () => {
    const { screens, session } = setup();
    session.pause(true); // perte de focus, autre module…
    session.calls.length = 0;
    screens.open('pause');
    expect(session.calls).toEqual([]);
    screens.close('pause');
    expect(session.phase).toBe('playing');
  });

  it('ne relâche pas une pause qu’il n’a pas posée', () => {
    const { screens, session } = setup();
    session.pause(true);
    screens.open('roue');
    screens.close('roue');
    expect(session.phase).toBe('paused');
  });

  it('reprise par un autre que l’interface : les écrans qui tenaient la pause se ferment sans re-pauser', () => {
    const { screens, session } = setup();
    screens.open('roue');
    screens.open('pause');
    screens.open('parametres');
    session.phase = 'playing'; // repris de l'extérieur
    session.calls.length = 0;
    screens.releasePausingScreens();
    expect(screens.stack.map((s) => s.id)).toEqual(['roue']);
    expect(session.phase).toBe('playing');
    expect(session.calls).toEqual([]);
  });

  it('hidesHud suit les écrans ouverts', () => {
    const { screens } = setup();
    expect(screens.hidesHud).toBe(false);
    screens.open('pause');
    expect(screens.hidesHud).toBe(false);
    screens.open('menu');
    expect(screens.hidesHud).toBe(true);
    screens.close('menu');
    expect(screens.hidesHud).toBe(false);
  });
});

describe('ui/écrans — mise à jour', () => {
  it('appelle update() de chaque écran ouvert, et isole les erreurs', () => {
    const { screens } = setup();
    const calls: string[] = [];
    const input: InputState = createNullInput();
    screens.register('a', () => ({ update: (dt) => calls.push('a' + dt), dispose: () => {} }), { modal: false, pauses: false });
    screens.register('b', () => ({ update: () => { throw new Error('boum'); }, dispose: () => {} }), { modal: false, pauses: false });
    screens.register('c', () => ({ update: (_dt, i) => calls.push('c' + (i === input)), dispose: () => {} }), { modal: false, pauses: false });
    screens.open('a');
    screens.open('b');
    screens.open('c');
    expect(() => screens.update(0.5, input)).not.toThrow();
    expect(calls).toEqual(['a0.5', 'ctrue']);
  });
});
