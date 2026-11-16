import { describe, expect, it } from 'vitest';
import type { OrderType } from '@/core/contracts';
import {
  MIN_LINE, ORDER_VERBS, areaToOrder, lineEnds, lineToOrder, orderLabel, pointHeading, slotsAlongLine, splitLine,
  spreadPoint, verbOf,
} from '@/ui/command/orders';
import type { OrderGeom } from '@/ui/command/orders';

const geom = (): OrderGeom => ({ x: 0, z: 0, heading: 0, width: 0 });
/** Avant et droite d'un cap, selon la convention du jeu. */
const fwd = (h: number): [number, number] => [Math.sin(h), Math.cos(h)];
const right = (h: number): [number, number] => [-Math.cos(h), Math.sin(h)];

describe('commandement — tracé de ligne → ordre', () => {
  it('centre, largeur et cap : tracé d\'ouest en est, l\'unité fait face au nord', () => {
    const g = lineToOrder(-10, 5, 30, 5, geom());
    expect(g.x).toBeCloseTo(10, 9);
    expect(g.z).toBeCloseTo(5, 9);
    expect(g.width).toBeCloseTo(40, 9);
    const [fx, fz] = fwd(g.heading);
    expect(fx).toBeCloseTo(0, 9);
    expect(fz).toBeCloseTo(-1, 9); // −z = nord
  });

  it('les quatre directions : le flanc gauche est toujours au point de départ', () => {
    const cases: [number, number, number, number, [number, number]][] = [
      [0, 0, 10, 0, [0, -1]], // ouest → est : face au nord
      [10, 0, 0, 0, [0, 1]], // est → ouest : face au sud
      [0, 0, 0, 10, [1, 0]], // nord → sud : face à l'est
      [0, 10, 0, 0, [-1, 0]], // sud → nord : face à l'ouest
    ];
    for (const [ax, az, bx, bz, expected] of cases) {
      const g = lineToOrder(ax, az, bx, bz, geom());
      const [fx, fz] = fwd(g.heading);
      expect(fx).toBeCloseTo(expected[0], 9);
      expect(fz).toBeCloseTo(expected[1], 9);
      // le flanc droit de la formation est bien du côté de B
      const [rx, rz] = right(g.heading);
      expect(rx * (bx - ax) + rz * (bz - az)).toBeCloseTo(g.width, 9);
    }
  });

  it('tracé oblique : le cap est perpendiculaire au segment', () => {
    const g = lineToOrder(3, -2, 27, 16, geom());
    const [fx, fz] = fwd(g.heading);
    expect(fx * 24 + fz * 18).toBeCloseTo(0, 9);
    expect(g.width).toBeCloseTo(30, 9);
  });

  it('lineEnds est l\'inverse de lineToOrder', () => {
    const g = lineToOrder(3, -2, 27, 16, geom());
    const e = { ax: 0, az: 0, bx: 0, bz: 0 };
    lineEnds(g, e);
    expect(e.ax).toBeCloseTo(3, 9);
    expect(e.az).toBeCloseTo(-2, 9);
    expect(e.bx).toBeCloseTo(27, 9);
    expect(e.bz).toBeCloseTo(16, 9);
  });

  it('un tracé nul ne produit pas de valeur invalide', () => {
    const g = lineToOrder(5, 5, 5, 5, geom());
    expect(g.width).toBe(0);
    expect(Number.isFinite(g.heading)).toBe(true);
    expect(MIN_LINE).toBeGreaterThan(0);
  });

  it('partage entre unités : tronçons jointifs, au prorata des effectifs, de gauche à droite', () => {
    const g = lineToOrder(0, 0, 30, 0, geom());
    const parts = splitLine(g, [6, 6, 3], []);
    expect(parts.length).toBe(3);
    expect(parts.map((p) => p.width)).toEqual([12, 12, 6]);
    expect(parts.map((p) => p.x)).toEqual([6, 18, 27]);
    for (const p of parts) {
      expect(p.z).toBeCloseTo(0, 9);
      expect(p.heading).toBe(g.heading);
    }
    // la somme des largeurs vaut la ligne, et les tronçons se touchent
    expect(parts.reduce((a, p) => a + p.width, 0)).toBeCloseTo(30, 9);
    expect(parts[0]!.x + parts[0]!.width / 2).toBeCloseTo(parts[1]!.x - parts[1]!.width / 2, 9);
  });

  it('partage : effectifs nuls → parts égales ; un seul élément → toute la ligne', () => {
    const g = lineToOrder(0, 0, 20, 0, geom());
    expect(splitLine(g, [0, 0], []).map((p) => p.width)).toEqual([10, 10]);
    const one = splitLine(g, [5], []);
    expect(one[0]!.x).toBeCloseTo(10, 9);
    expect(one[0]!.width).toBeCloseTo(20, 9);
  });

  it('les unités prennent les tronçons sans se croiser', () => {
    const g = lineToOrder(0, 0, 30, 0, geom()); // face au nord, la gauche est à l'ouest
    const idx = slotsAlongLine(g, [{ x: 25, z: 40 }, { x: -5, z: 30 }, { x: 12, z: 60 }]);
    expect(idx).toEqual([1, 2, 0]);
    // ligne retournée (face au sud) : la gauche est à l'est
    const back = lineToOrder(30, 0, 0, 0, geom());
    expect(slotsAlongLine(back, [{ x: 25, z: 40 }, { x: -5, z: 30 }, { x: 12, z: 60 }])).toEqual([0, 2, 1]);
  });

  it('spreadPoint : rang centré, perpendiculaire au cap', () => {
    const pts = spreadPoint(100, 50, Math.PI, 3, 10, []); // face au nord
    expect(pts.map((p) => Math.round(p.x))).toEqual([90, 100, 110]);
    for (const p of pts) expect(p.z).toBeCloseTo(50, 9);
    const mean = pts.reduce((a, p) => a + p.x, 0) / 3;
    expect(mean).toBeCloseTo(100, 9);
  });

  it('cap d\'un ordre de mouvement : vers le point ; un repli garde la face vers l\'arrière', () => {
    const h = pointHeading('avancer', 0, 0, 10, 0);
    expect(fwd(h)[0]).toBeCloseTo(1, 9);
    const r = pointHeading('repli', 0, 0, 10, 0);
    expect(fwd(r)[0]).toBeCloseTo(-1, 9);
    expect(Number.isFinite(pointHeading('avancer', 5, 5, 5, 5))).toBe(true);
  });

  it('nasse : centre, diamètre, issue dans la direction du geste', () => {
    const g = areaToOrder(10, 10, 10, -20, geom()); // glissé vers le nord, 30 m
    expect(g.x).toBe(10);
    expect(g.z).toBe(10);
    expect(g.width).toBeCloseTo(60, 9);
    const [fx, fz] = fwd(g.heading);
    expect(fx).toBeCloseTo(0, 9);
    expect(fz).toBeCloseTo(-1, 9);
    // geste trop court : rayon minimal
    expect(areaToOrder(0, 0, 1, 0, geom()).width).toBe(16);
  });
});

describe('commandement — catalogue des ordres', () => {
  const CONTRACT: OrderType[] = [
    'libre', 'suivre', 'tenir', 'ligne', 'colonne', 'tortue', 'avancer', 'bond_offensif', 'charge', 'refoulement', 'repli',
    'encercler', 'disperser_gaz', 'interpeller', 'proteger', 'embarquer', 'debarquer', 'degager_barricade', 'escorter', 'cesser',
  ];

  it('tous les verbes d\'OrderType du contrat ont un libellé français, une seule fois', () => {
    // « faire_mouvement » est un ordre de l'interface seule (colonne motorisée lancée par police.command), jamais
    // transmis tel quel à une unité
    const types = ORDER_VERBS.map((v) => v.type).filter((t) => t !== 'faire_mouvement').sort();
    expect(types).toEqual([...CONTRACT].sort());
    expect(ORDER_VERBS.some((v) => v.type === 'faire_mouvement')).toBe(true);
    for (const v of ORDER_VERBS) {
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.short.length).toBeGreaterThan(2);
      expect(v.short.length).toBeLessThanOrEqual(11);
      expect(v.label).not.toContain('_');
      expect(orderLabel(v.type)).toBe(v.short);
    }
  });

  it('gestes : la ligne se trace, la nasse se pose en zone et rappelle la règle de l\'issue', () => {
    expect(verbOf('ligne')!.gesture).toBe('line');
    expect(verbOf('encercler')!.gesture).toBe('area');
    expect(verbOf('encercler')!.rule).toMatch(/issue/i);
    expect(verbOf('encercler')!.rule).toMatch(/faute/i);
    expect(verbOf('tenir')!.gesture).toBe('immediate');
    expect(verbOf('interpeller')!.gesture).toBe('target');
  });

  it('niveaux de force : le gaz suppose le niveau 3, la charge le niveau 2 ; un ordre à geste a une consigne', () => {
    expect(verbOf('disperser_gaz')!.force).toBe(3);
    expect(verbOf('charge')!.force).toBe(2);
    expect(verbOf('repli')!.force).toBe(0);
    expect(verbOf('repli')!.coercive).toBe(false);
    expect(verbOf('charge')!.coercive).toBe(true);
    for (const v of ORDER_VERBS) if (v.gesture !== 'immediate') expect(v.hint.length).toBeGreaterThan(10);
  });
});
