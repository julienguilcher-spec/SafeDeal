import { describe, expect, it } from 'vitest';
import { PointerGestures } from '@/ui/maps/gestures';
import type { GestureHandlers, PointerInfo } from '@/ui/maps/gestures';

const MOUSE: PointerInfo = { button: 0, shift: false, ctrl: false, kind: 'mouse' };
const TOUCH: PointerInfo = { button: 0, shift: false, ctrl: false, kind: 'touch' };

function setup(capture = false): { g: PointerGestures; log: string[]; pan: { x: number; y: number }; zoom: number[] } {
  const log: string[] = [];
  const pan = { x: 0, y: 0 };
  const zoom: number[] = [];
  const h: GestureHandlers = {
    onDragStart: () => {
      log.push('dragStart');
      return capture ? 'capture' : 'pan';
    },
    onDragMove: (x, y) => log.push(`dragMove ${x},${y}`),
    onDragEnd: (x, y, _i, cancelled) => log.push(`dragEnd ${x},${y}${cancelled ? ' annulé' : ''}`),
    onTap: (x, y, info) => log.push(`tap ${x},${y} b${info.button}`),
    onDoubleTap: (x, y) => log.push(`double ${x},${y}`),
    onLongPress: (x, y) => log.push(`long ${x},${y}`),
    onPan: (dx, dy) => {
      pan.x += dx;
      pan.y += dy;
    },
    onZoom: (_x, _y, f) => zoom.push(f),
  };
  return { g: new PointerGestures(h), log, pan, zoom };
}

describe('cartes — gestes', () => {
  it('toucher : appui et relâchement sans mouvement', () => {
    const s = setup();
    s.g.down(1, 100, 100, 0, MOUSE);
    s.g.move(1, 102, 101); // sous le seuil
    s.g.up(1, 102, 101, 0.1);
    expect(s.log).toEqual(['tap 102,101 b0']);
    expect(s.g.mode).toBe('idle');
  });

  it('clic secondaire : toucher avec le bouton 2, jamais de double toucher', () => {
    const s = setup();
    const right = { ...MOUSE, button: 2 };
    s.g.down(1, 50, 50, 0, right);
    s.g.up(1, 50, 50, 0.05);
    s.g.down(1, 50, 50, 0.1, right);
    s.g.up(1, 50, 50, 0.15);
    expect(s.log).toEqual(['tap 50,50 b2', 'tap 50,50 b2']);
  });

  it('double toucher', () => {
    const s = setup();
    s.g.down(1, 100, 100, 0, TOUCH);
    s.g.up(1, 100, 100, 0.05);
    s.g.down(1, 104, 98, 0.2, TOUCH);
    s.g.up(1, 104, 98, 0.25);
    expect(s.log).toEqual(['tap 100,100 b0', 'double 104,98']);
  });

  it('glisser : déplace la carte du mouvement total', () => {
    const s = setup(false);
    s.g.down(1, 100, 100, 0, MOUSE);
    s.g.move(1, 110, 100);
    s.g.move(1, 150, 130);
    s.g.up(1, 150, 130, 0.3);
    expect(s.log).toEqual(['dragStart']);
    expect(s.pan).toEqual({ x: 50, y: 30 });
  });

  it('glisser capturé par l\'outil : début, mouvements, fin', () => {
    const s = setup(true);
    s.g.down(1, 10, 10, 0, MOUSE);
    s.g.move(1, 30, 10);
    s.g.move(1, 60, 20);
    s.g.up(1, 60, 20, 0.4);
    expect(s.log).toEqual(['dragStart', 'dragMove 30,10', 'dragMove 60,20', 'dragEnd 60,20']);
    expect(s.pan).toEqual({ x: 0, y: 0 });
  });

  it('le doigt tolère un tremblement plus grand que la souris', () => {
    const s = setup();
    s.g.down(1, 100, 100, 0, TOUCH);
    s.g.move(1, 107, 100);
    s.g.up(1, 107, 100, 0.1);
    expect(s.log).toEqual(['tap 107,100 b0']);
  });

  it('appui long : déclenché une fois, pas de toucher au relâchement', () => {
    const s = setup();
    s.g.down(1, 200, 200, 0, TOUCH);
    s.g.tick(0.3);
    expect(s.log).toEqual([]);
    s.g.tick(0.6);
    s.g.tick(0.9);
    s.g.up(1, 200, 200, 1);
    expect(s.log).toEqual(['long 200,200']);
  });

  it('pincement : zoom du rapport des écartements, puis un doigt continue à déplacer', () => {
    const s = setup();
    s.g.down(1, 100, 100, 0, TOUCH);
    s.g.down(2, 200, 100, 0, TOUCH);
    expect(s.g.mode).toBe('pinch');
    s.g.move(1, 50, 100);
    s.g.move(2, 250, 100);
    const total = s.zoom.reduce((a, f) => a * f, 1);
    expect(total).toBeCloseTo(2, 6);
    s.g.up(2, 250, 100, 0.5);
    expect(s.g.mode).toBe('pan');
    const before = s.pan.x;
    s.g.move(1, 80, 100);
    expect(s.pan.x - before).toBe(30);
    s.g.up(1, 80, 100, 0.6);
    expect(s.g.mode).toBe('idle');
    expect(s.log).toEqual([]);
  });

  it('un second doigt annule le geste capturé en cours', () => {
    const s = setup(true);
    s.g.down(1, 10, 10, 0, TOUCH);
    s.g.move(1, 40, 10);
    s.g.down(2, 100, 100, 0.1, TOUCH);
    expect(s.log[s.log.length - 1]).toBe('dragEnd 40,10 annulé');
    expect(s.g.mode).toBe('pinch');
  });

  it('molette : vers le haut rapproche, vers le bas éloigne', () => {
    const s = setup();
    s.g.wheel(0, 0, -100);
    s.g.wheel(0, 0, 100);
    expect(s.zoom[0]).toBeGreaterThan(1);
    expect(s.zoom[1]).toBeLessThan(1);
    expect(s.zoom[0]! * s.zoom[1]!).toBeCloseTo(1, 9);
  });
});
