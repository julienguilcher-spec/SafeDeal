// Marquages au sol : passages piétons, lignes de voies, lignes d'arrêt, couloirs de bus.
import { describe, expect, it } from 'vitest';
import type { RoadEdge, RoadGraph, RoadNode } from '../../src/world/mapdata';
import {
  BUS_LINE_WIDTH, DASH_LENGTH, DASH_PERIOD, GLYPH_BUS, LINE_WIDTH, MARK_BUS_LINE, MARK_CROSSWALK, MARK_LINE, MARK_STOP, STOP_LINE_WIDTH,
  ZEBRA_BAND, ZEBRA_LENGTH, ZEBRA_PERIOD, carriageDegree, crosswalk, edgeLines, hasLaneLines, nodeMarkings, pointAlong, setbackAt, tileMarkings,
} from '../../src/world/view/markings';
import type { MarkingSink } from '../../src/world/view/markings';

interface Quad { p: number[]; kind: number }

function collector(): { sink: MarkingSink; quads: Quad[]; glyphs: { x: number; z: number; heading: number; kind: number }[] } {
  const quads: Quad[] = [];
  const glyphs: { x: number; z: number; heading: number; kind: number }[] = [];
  return {
    quads, glyphs,
    sink: {
      quad: (x0, z0, x1, z1, x2, z2, x3, z3, kind) => { quads.push({ p: [x0, z0, x1, z1, x2, z2, x3, z3], kind }); },
      glyph: (x, z, heading, kind) => { glyphs.push({ x, z, heading, kind }); },
    },
  };
}

function node(x: number, z: number, flags: { signal?: boolean; crossing?: boolean } = {}): RoadNode {
  return { x, z, signal: flags.signal ?? false, crossing: flags.crossing ?? false, boundary: false, edges: [] };
}

function edge(a: number, b: number, nodes: RoadNode[], o: Partial<RoadEdge> = {}): RoadEdge {
  const pts = new Float32Array([nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z]);
  return {
    a, b, points: pts, width: 7, lanesForward: 1, lanesBackward: 1, oneway: false, roadClass: 'residential', name: '', bridge: false, tunnel: false,
    surface: 'asphalt', speedLimit: 8.3, sidewalk: 2, pedestrianOnly: false, landmarkKey: '',
    length: Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z), ...o,
  };
}

function graphOf(nodes: RoadNode[], edges: RoadEdge[]): RoadGraph {
  for (const n of nodes) n.edges.length = 0;
  edges.forEach((e, i) => {
    nodes[e.a].edges.push(i);
    nodes[e.b].edges.push(i);
  });
  return { version: 1, nodes, edges };
}

const ALL = { minX: -1e6, minZ: -1e6, maxX: 1e6, maxZ: 1e6 };

function center(q: Quad): { x: number; z: number } {
  return { x: (q.p[0] + q.p[2] + q.p[4] + q.p[6]) / 4, z: (q.p[1] + q.p[3] + q.p[5] + q.p[7]) / 4 };
}

function area(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    a += q.p[2 * i] * q.p[2 * j + 1] - q.p[2 * j] * q.p[2 * i + 1];
  }
  return Math.abs(a) / 2;
}

describe('ville 3D — bandes d\'un passage piéton', () => {
  it('chaussée de 7 m : sept bandes de 0,5 m tous les mètres, symétriques, longues de 3,4 m', () => {
    const c = collector();
    // chaussée dirigée vers +z ; sa droite est vers −x
    const n = crosswalk(100, 50, 0, 1, 3.5, 3.5, c.sink);
    // 7 m moins 0,25 m de marge à chaque bordure : 6,5 m, soit 7 bandes et 6 intervalles
    expect(n).toBe(7);
    expect(c.quads.length).toBe(7);
    const xs = c.quads.map((q) => center(q).x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(ZEBRA_PERIOD, 6);
    // symétrie autour de l'axe
    expect(xs[0] + xs[xs.length - 1]).toBeCloseTo(200, 6);
    for (const q of c.quads) {
      expect(q.kind).toBe(MARK_CROSSWALK);
      expect(area(q)).toBeCloseTo(ZEBRA_BAND * ZEBRA_LENGTH, 6);
      expect(center(q).z).toBeCloseTo(50, 6);
      // toutes les bandes restent entre les deux bordures
      for (let k = 0; k < 8; k += 2) {
        expect(q.p[k]).toBeGreaterThanOrEqual(96.5 - 1e-9);
        expect(q.p[k]).toBeLessThanOrEqual(103.5 + 1e-9);
      }
    }
  });

  it('chaussée dissymétrique : les bandes suivent l\'emprise réelle', () => {
    const c = collector();
    const n = crosswalk(0, 0, 1, 0, 2, 9, c.sink);
    expect(n).toBe(11);
    // direction +x : la droite est vers +z ; 2 m à gauche (z = −2), 9 m à droite (z = 9)
    const zs = c.quads.map((q) => center(q).z);
    expect(Math.min(...zs)).toBeGreaterThan(-2);
    expect(Math.max(...zs)).toBeLessThan(9);
    expect(Math.min(...zs) + 2).toBeCloseTo(9 - Math.max(...zs), 6);
  });

  it('pas de bande sur une chaussée trop étroite', () => {
    const c = collector();
    expect(crosswalk(0, 0, 1, 0, 0.4, 0.4, c.sink)).toBe(0);
    expect(c.quads.length).toBe(0);
  });
});

describe('ville 3D — marquages d\'un nœud', () => {
  it('passage en pleine voie : un seul passage au nœud, en travers de la chaussée', () => {
    const nodes = [node(0, 0), node(100, 0, { crossing: true }), node(200, 0)];
    const g = graphOf(nodes, [edge(0, 1, nodes), edge(1, 2, nodes)]);
    expect(carriageDegree(g, 1)).toBe(2);
    const c = collector();
    const n = nodeMarkings(g, 1, c.sink);
    expect(n).toBe(7);
    for (const q of c.quads) {
      expect(center(q).x).toBeCloseTo(100, 6);
      expect(Math.abs(center(q).z)).toBeLessThan(3.5);
    }
  });

  it('carrefour à quatre branches : un passage en retrait sur chaque branche', () => {
    const nodes = [node(0, 0, { crossing: true }), node(80, 0), node(-80, 0), node(0, 80), node(0, -80)];
    const g = graphOf(nodes, [edge(0, 1, nodes), edge(2, 0, nodes), edge(0, 3, nodes, { width: 12, lanesForward: 2, lanesBackward: 2 }), edge(4, 0, nodes)]);
    const c = collector();
    nodeMarkings(g, 0, c.sink);
    const east = c.quads.filter((q) => center(q).x > 8);
    const south = c.quads.filter((q) => center(q).z > 5);
    expect(east.length).toBe(7);
    expect(south.length).toBe(12); // chaussée de 12 m
    expect(c.quads.length).toBe(7 + 7 + 12 + 7);
    // le passage de la branche est se tient au-delà de la demi-largeur (6 m) de la voie la plus large qu'il longe
    for (const q of east) expect(center(q).x - ZEBRA_LENGTH / 2).toBeGreaterThan(6);
    // et les lignes de voies de cette branche s'arrêtent avant lui
    expect(setbackAt(g, 0, 0)).toBeGreaterThan(Math.max(...east.map((q) => center(q).x)) + ZEBRA_LENGTH / 2 - 1e-6);
  });

  it('nœud à feux : ligne d\'arrêt sur les seules voies qui arrivent', () => {
    const nodes = [node(0, 0), node(100, 0, { signal: true }), node(200, 0)];
    const g = graphOf(nodes, [edge(0, 1, nodes), edge(1, 2, nodes, { oneway: true, lanesBackward: 0 })]);
    const c = collector();
    nodeMarkings(g, 1, c.sink);
    const stops = c.quads.filter((q) => q.kind === MARK_STOP);
    // arête 0 → 1 : sa voie « aller » arrive au feu ; arête 1 → 2 en sens unique : rien n'arrive par elle
    expect(stops.length).toBe(1);
    const s = stops[0];
    expect(center(s).x).toBeLessThan(100);
    // moitié droite de la chaussée dans le sens +x : z de 0 à 3,5
    const zs = [s.p[1], s.p[3], s.p[5], s.p[7]];
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(3.5, 6);
    expect(area(s)).toBeCloseTo(3.5 * STOP_LINE_WIDTH, 6);
  });

  it('rien sur un nœud ordinaire, ni sur un croisement d\'allées', () => {
    const nodes = [node(0, 0), node(50, 0), node(100, 0, { crossing: true }), node(150, 0)];
    const g = graphOf(nodes, [edge(0, 1, nodes), edge(2, 3, nodes, { pedestrianOnly: true, roadClass: 'footway', width: 2 })]);
    const c = collector();
    expect(nodeMarkings(g, 1, c.sink)).toBe(0);
    expect(nodeMarkings(g, 2, c.sink)).toBe(0);
  });
});

describe('ville 3D — lignes de voies', () => {
  it('rue à double sens de 7 m : un axe en tirets de 3 m tous les 13 m', () => {
    const nodes = [node(0, 0), node(130, 0)];
    const g = graphOf(nodes, [edge(0, 1, nodes)]);
    expect(hasLaneLines(g.edges[0])).toBe(true);
    const c = collector();
    expect(edgeLines(g, 0, ALL, c.sink)).toBe(1);
    expect(c.quads.length).toBe(10);
    for (const q of c.quads) {
      expect(q.kind).toBe(MARK_LINE);
      expect(area(q)).toBeCloseTo(DASH_LENGTH * LINE_WIDTH, 6);
      expect(center(q).z).toBeCloseTo(0, 6);
    }
    const xs = c.quads.map((q) => center(q).x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(DASH_LENGTH / 2, 6);
    expect(xs[1] - xs[0]).toBeCloseTo(DASH_PERIOD, 6);
  });

  it('pas de ligne sur une rue à une voie, une voie de service ou une allée', () => {
    const nodes = [node(0, 0), node(100, 0)];
    const mk = (o: Partial<RoadEdge>): number => {
      const g = graphOf(nodes, [edge(0, 1, nodes, o)]);
      return edgeLines(g, 0, ALL, collector().sink);
    };
    expect(mk({ oneway: true, lanesBackward: 0, width: 4 })).toBe(0);
    expect(mk({ roadClass: 'service' })).toBe(0);
    expect(mk({ pedestrianOnly: true })).toBe(0);
    expect(mk({ width: 5 })).toBe(0);
    expect(mk({ tunnel: true })).toBe(0);
  });

  it('grand axe à trois voies par sens : axe continu, séparateurs, couloir de bus et son symbole', () => {
    const nodes = [node(0, 0), node(260, 0)];
    const g = graphOf(nodes, [edge(0, 1, nodes, { width: 21, lanesForward: 3, lanesBackward: 3, roadClass: 'primary' })]);
    const c = collector();
    expect(edgeLines(g, 0, ALL, c.sink)).toBe(5);
    const bus = c.quads.filter((q) => q.kind === MARK_BUS_LINE);
    expect(bus.length).toBeGreaterThan(0);
    // lignes de bus continues, larges de 0,25 m, à 3,5 m de chaque bordure
    const zs = new Set(bus.map((q) => Math.round(center(q).z * 100) / 100));
    expect([...zs].sort((a, b) => a - b)).toEqual([-7, 7]);
    let busArea = 0;
    for (const q of bus) busArea += area(q);
    expect(busArea).toBeCloseTo(2 * 260 * BUS_LINE_WIDTH, 3);
    // symboles « BUS » au milieu des couloirs, lus dans le sens de la marche de chaque côté
    expect(c.glyphs.length).toBeGreaterThanOrEqual(2);
    for (const gl of c.glyphs) {
      expect(gl.kind).toBe(GLYPH_BUS);
      expect(Math.abs(gl.z)).toBeCloseTo(8.75, 6);
      // on roule à droite : côté z > 0 dans le sens +x (cap π/2), côté z < 0 dans le sens −x (cap −π/2)
      expect(Math.sin(gl.heading)).toBeCloseTo(gl.z > 0 ? 1 : -1, 6);
    }
  });

  it('une tuile ne garde que les éléments centrés chez elle : deux tuiles voisines se complètent sans doublon', () => {
    const nodes = [node(-200, 5), node(300, 5)];
    const g = graphOf(nodes, [edge(0, 1, nodes)]);
    const left = collector(), right = collector(), whole = collector();
    edgeLines(g, 0, { minX: -512, minZ: 0, maxX: 0, maxZ: 512 }, left.sink);
    edgeLines(g, 0, { minX: 0, minZ: 0, maxX: 512, maxZ: 512 }, right.sink);
    edgeLines(g, 0, ALL, whole.sink);
    expect(left.quads.length + right.quads.length).toBe(whole.quads.length);
    for (const q of left.quads) expect(center(q).x).toBeLessThan(0);
    for (const q of right.quads) expect(center(q).x).toBeGreaterThanOrEqual(0);
  });

  it('tileMarkings : lignes des arêtes et marquages des nœuds de la tuile, chaque nœud une seule fois', () => {
    const nodes = [node(10, 10), node(110, 10, { crossing: true }), node(210, 10), node(700, 10, { crossing: true })];
    const g = graphOf(nodes, [edge(0, 1, nodes), edge(1, 2, nodes), edge(2, 3, nodes)]);
    const c = collector();
    tileMarkings(g, [0, 1, 2], { minX: 0, minZ: 0, maxX: 512, maxZ: 512 }, c.sink);
    const zebra = c.quads.filter((q) => q.kind === MARK_CROSSWALK);
    // le nœud 1 est commun à deux arêtes : un seul passage ; le nœud 3 est hors de la tuile
    expect(zebra.length).toBe(7);
    for (const q of zebra) expect(center(q).x).toBeCloseTo(110, 6);
  });
});

describe('ville 3D — abscisse le long d\'une voie', () => {
  it('point et tangente sur une polyligne coudée', () => {
    const pts = [0, 0, 10, 0, 10, 20];
    let p = pointAlong(pts, 4);
    expect([p.x, p.z, p.ux, p.uz]).toEqual([4, 0, 1, 0]);
    p = pointAlong(pts, 15);
    expect([p.x, p.z, p.ux, p.uz]).toEqual([10, 5, 0, 1]);
    p = pointAlong(pts, 99);
    expect([p.x, p.z]).toEqual([10, 20]);
    p = pointAlong(pts, -3);
    expect([p.x, p.z]).toEqual([0, 0]);
  });
});
