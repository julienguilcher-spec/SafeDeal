// Ligne automatique (« Tenir une ligne ici », « Contenir : ligne face à la foule ») : en travers de la rue, face à la
// foule, largeur de la chaussée ou du front de l'unité (40 m au plus), flanc gauche d'abord comme issueLine.
import { describe, expect, it } from 'vitest';

import { AUTO_LINE_MAX, CONTAIN_GAP, autoLine, pointLineWidth } from '@/ui/command/autoLine';
import { FRONT_PER_AGENT, lineToOrder } from '@/ui/command/orders';
import type { OrderGeom } from '@/ui/command/orders';

/** Avant d'un cap (convention du jeu). */
function forward(h: number): { x: number; z: number } {
  return { x: Math.sin(h), z: Math.cos(h) };
}

function angle(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

describe('ligne automatique', () => {
  it('sur une rue : en travers de la chaussée, d’une façade à l’autre, face à la foule', () => {
    // rue orientée nord-sud (cap 0), 18 m de large ; foule au sud
    const road = { x: 100, z: 50, heading: 0, width: 18 };
    const l = autoLine({ x: 101, z: 52, road, crowd: { x: 100, z: -40, radius: 20 }, agents: 19, from: { x: 100, z: 120 } });
    expect(l.width).toBe(18);
    expect(l.x).toBe(100);
    expect(l.z).toBe(50);
    // la ligne regarde le long de la voie, vers la foule (sud = cap π)
    expect(angle(l.heading, Math.PI)).toBeLessThan(1e-9);
    // ses deux bouts sont de part et d'autre de la chaussée (axe est-ouest)
    expect(Math.abs(l.az - l.bz)).toBeLessThan(1e-9);
    expect(Math.abs(l.ax - l.bx)).toBeCloseTo(18, 9);
    // la même rue avec la foule au nord : la ligne se retourne
    const l2 = autoLine({ x: 100, z: 50, road, crowd: { x: 100, z: 200, radius: 20 }, agents: 19, from: null });
    expect(angle(l2.heading, 0)).toBeLessThan(1e-9);
    // rue en biais (cap 45°) : la ligne lui est perpendiculaire
    const diag = autoLine({ x: 0, z: 0, road: { x: 0, z: 0, heading: Math.PI / 4, width: 12 }, crowd: { x: 50, z: 50, radius: 10 }, agents: 10, from: null });
    expect(angle(diag.heading, Math.PI / 4)).toBeLessThan(1e-9);
    const dx = diag.bx - diag.ax, dz = diag.bz - diag.az;
    const f = forward(diag.heading);
    expect(Math.abs(dx * f.x + dz * f.z)).toBeLessThan(1e-9);
  });

  it('sur un point : perpendiculaire à la direction de la foule ; largeur = front de l’unité × 1,1, 40 m au plus', () => {
    const crowd = { x: 0, z: 100, radius: 30 };
    const l = autoLine({ x: 0, z: 0, road: null, crowd, agents: 19, from: { x: 0, z: -50 } });
    expect(angle(l.heading, 0)).toBeLessThan(1e-9);
    expect(l.width).toBeCloseTo(19 * FRONT_PER_AGENT * 1.1, 9);
    // la ligne est perpendiculaire à la direction de la foule
    const f = forward(l.heading);
    expect(Math.abs((l.bx - l.ax) * f.x + (l.bz - l.az) * f.z)).toBeLessThan(1e-9);
    // une compagnie entière : bornée à 40 m
    expect(autoLine({ x: 0, z: 0, road: null, crowd, agents: 80, from: null }).width).toBe(AUTO_LINE_MAX);
    expect(pointLineWidth(80)).toBe(AUTO_LINE_MAX);
    // sans foule : face au sens d'arrivée des unités
    const noCrowd = autoLine({ x: 0, z: 0, road: null, crowd: null, agents: 10, from: { x: -100, z: 0 } });
    expect(angle(noCrowd.heading, Math.PI / 2)).toBeLessThan(1e-9);
  });

  it('flanc gauche d’abord : les bouts redonnent le même cap par lineToOrder (issueLine)', () => {
    const cases = [
      autoLine({ x: 10, z: 10, road: { x: 10, z: 10, heading: 1.1, width: 22 }, crowd: { x: -40, z: 80, radius: 15 }, agents: 19, from: null }),
      autoLine({ x: -5, z: 30, road: null, crowd: { x: 60, z: -20, radius: 15 }, agents: 12, from: { x: -40, z: 50 } }),
    ];
    for (const l of cases) {
      const g: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
      lineToOrder(l.ax, l.az, l.bx, l.bz, g);
      expect(angle(g.heading, l.heading)).toBeLessThan(1e-9);
      expect(g.width).toBeCloseTo(l.width, 9);
      expect(g.x).toBeCloseTo(l.x, 9);
      expect(g.z).toBeCloseTo(l.z, 9);
      // A est à gauche de la ligne qui regarde son cap : gauche = (cos h, −sin h)
      const lx = Math.cos(l.heading), lz = -Math.sin(l.heading);
      expect((l.ax - l.x) * lx + (l.az - l.z) * lz).toBeGreaterThan(0);
      expect((l.bx - l.x) * lx + (l.bz - l.z) * lz).toBeLessThan(0);
    }
  });

  it('« Contenir » : la ligne se pose au bord de la foule, du côté des unités, face à elle', () => {
    const crowd = { x: 0, z: 0, radius: 25 };
    const l = autoLine({ x: 0, z: 0, road: { x: 0, z: 0, heading: 0.3, width: 30 }, crowd, agents: 19, from: { x: 200, z: 0 }, contain: true });
    // au bord, côté est (là où sont les unités), et pas sur la rue sous la foule
    expect(l.x).toBeCloseTo(crowd.radius + CONTAIN_GAP, 9);
    expect(l.z).toBeCloseTo(0, 9);
    // face à la foule (ouest = cap −π/2)
    expect(angle(l.heading, -Math.PI / 2)).toBeLessThan(1e-9);
    // unités déjà au contact : la ligne reste où elles sont
    const close = autoLine({ x: 0, z: 0, road: null, crowd, agents: 19, from: { x: 0, z: -20 }, contain: true });
    expect(Math.hypot(close.x, close.z)).toBeCloseTo(20, 9);
  });
});
