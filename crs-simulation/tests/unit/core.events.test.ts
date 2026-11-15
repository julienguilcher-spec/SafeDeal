import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@/core/events';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bus d\'événements', () => {
  it('on / emit : appelle les gestionnaires dans l\'ordre d\'abonnement avec la charge utile', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('person:spawned', (e) => calls.push('a' + e.id));
    bus.on('person:spawned', (e) => calls.push('b' + e.id));
    bus.on('person:removed', (e) => calls.push('x' + e.id));
    bus.emit('person:spawned', { id: 7 });
    expect(calls).toEqual(['a7', 'b7']);
    expect(bus.listenerCount('person:spawned')).toBe(2);
    expect(bus.listenerCount('explosion')).toBe(0);
    bus.emit('explosion', { kind: 'pave', x: 0, y: 0, z: 0, radius: 1, sourceId: 0 }); // aucun abonné : sans effet
  });

  it('le désabonnement est idempotent', () => {
    const bus = createEventBus();
    let n = 0;
    const off = bus.on('sfx', () => n++);
    bus.emit('sfx', { id: 'pas' });
    off();
    off();
    bus.emit('sfx', { id: 'pas' });
    expect(n).toBe(1);
    expect(bus.listenerCount('sfx')).toBe(0);
  });

  it('once ne se déclenche qu\'une fois, et peut être annulé avant', () => {
    const bus = createEventBus();
    let n = 0;
    bus.once('session:paused', () => n++);
    bus.emit('session:paused', { paused: true });
    bus.emit('session:paused', { paused: false });
    expect(n).toBe(1);
    const off = bus.once('session:paused', () => n++);
    off();
    bus.emit('session:paused', { paused: true });
    expect(n).toBe(1);
    expect(bus.listenerCount('session:paused')).toBe(0);
  });

  it('se désabonner pendant une émission ne casse rien : les autres sont appelés une fois chacun', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const offs: (() => void)[] = [];
    offs.push(bus.on('fx', () => {
      calls.push('a');
      offs[0]!(); // se retire lui-même
    }));
    offs.push(bus.on('fx', () => {
      calls.push('b');
      offs[2]!(); // retire le suivant, pas encore appelé
    }));
    offs.push(bus.on('fx', () => calls.push('c')));
    offs.push(bus.on('fx', () => calls.push('d')));
    bus.emit('fx', { id: 'gaz', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['a', 'b', 'd']);
    calls.length = 0;
    bus.emit('fx', { id: 'gaz', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['b', 'd']);
    expect(bus.listenerCount('fx')).toBe(2);
  });

  it('un gestionnaire ajouté pendant une émission n\'est appelé qu\'à la suivante', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('fx', () => {
      calls.push('a');
      if (calls.length === 1) bus.on('fx', () => calls.push('tardif'));
    });
    bus.emit('fx', { id: 'feu', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['a']);
    bus.emit('fx', { id: 'feu', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['a', 'a', 'tardif']);
  });

  it('émissions imbriquées et désabonnement pendant l\'imbrication', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    let depth = 0;
    const offB = bus.on('sfx', () => calls.push('b' + depth));
    bus.on('sfx', () => {
      calls.push('c' + depth);
      if (depth === 0) {
        depth = 1;
        offB();
        bus.emit('sfx', { id: 'cri' }); // ré-émission depuis un gestionnaire
        depth = 0;
      }
    });
    bus.on('sfx', () => calls.push('d' + depth));
    bus.emit('sfx', { id: 'cri' });
    expect(calls).toEqual(['b0', 'c0', 'c1', 'd1', 'd0']);
    expect(bus.listenerCount('sfx')).toBe(2);
    calls.length = 0;
    bus.emit('sfx', { id: 'cri' });
    expect(calls).toEqual(['c0', 'c1', 'd1', 'd0']);
  });

  it('une exception dans un gestionnaire est journalisée et n\'empêche pas les autres', () => {
    const bus = createEventBus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    bus.on('person:down', () => calls.push('avant'));
    bus.on('person:down', () => {
      throw new Error('boum');
    });
    bus.on('person:down', () => calls.push('après'));
    expect(() => bus.emit('person:down', { id: 1, injury: 'serious', sourceId: 0 })).not.toThrow();
    expect(calls).toEqual(['avant', 'après']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toContain('person:down');
    expect((spy.mock.calls[0]![1] as Error).message).toBe('boum');
    expect(bus.errorCount).toBe(1);
    // le bus reste utilisable
    bus.emit('person:down', { id: 2, injury: 'light', sourceId: 0 });
    expect(calls).toEqual(['avant', 'après', 'avant', 'après']);
    expect(bus.errorCount).toBe(2);
  });

  it('onAny / emitAny : événements libres, sur les mêmes canaux que les événements du contrat', () => {
    const bus = createEventBus();
    const got: unknown[] = [];
    const off = bus.onAny('missions:objectif', (p) => got.push(p));
    bus.emitAny('missions:objectif', { id: 3 });
    bus.emitAny('autre', 1);
    expect(got).toEqual([{ id: 3 }]);
    off();
    bus.emitAny('missions:objectif', { id: 4 });
    expect(got).toEqual([{ id: 3 }]);
    // un abonné « libre » voit aussi un événement du contrat portant ce nom
    bus.onAny('person:spawned', (p) => got.push(p));
    bus.emit('person:spawned', { id: 9 });
    expect(got).toEqual([{ id: 3 }, { id: 9 }]);
  });

  it('clear retire tous les gestionnaires, même pendant une émission', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('fx', () => {
      calls.push('a');
      bus.clear();
    });
    bus.on('fx', () => calls.push('b'));
    bus.emit('fx', { id: 'feu', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['a']);
    bus.emit('fx', { id: 'feu', x: 0, y: 0, z: 0 });
    expect(calls).toEqual(['a']);
    expect(bus.listenerCount('fx')).toBe(0);
  });
});
