// Géométrie pure de la ville en 3D : triangulation, sol en facettes, tabliers des ponts, grille de surfaces.
import { describe, expect, it } from 'vitest';
import { decodeMapData, ringSignedArea } from '../../src/world/mapdata';
import type { RoadGraph } from '../../src/world/mapdata';
import { generateTestDistrict } from '../../src/world/testDistrict';
import {
  CL_ASPHALT, CL_DEFAULT, CL_GRASS, CL_PLAZA, CL_SETT, CL_SIDEWALK, CL_STABILISE, CODE_CLASS_MASK, CODE_DECK, CODE_NOT_FLUSH, CODE_OVER_WATER,
  CODE_WATER, CURB_HEIGHT, PLANTED_LIFT, styleOfSurface,
} from '../../src/world/view/classes';
import { BridgeProfile } from '../../src/world/view/decks';
import { triangulate, triangulatedArea } from '../../src/world/view/earcut';
import { EdgeIndex } from '../../src/world/view/edgeindex';
import {
  RULE_DECK, RULE_GREEN, RULE_SETT, bakeMacro, classAt, codeAt, createRaster, fillRings, flushOverRaised, liftOfCode, paintCapsule,
  rasterizeTile, waterShare,
} from '../../src/world/view/raster';
import { TIN_CELL, TileTin, clipTriangleToTin } from '../../src/world/view/tin';

function ringArea(ring: ArrayLike<number>): number {
  return Math.abs(ringSignedArea(ring));
}

describe('ville 3D — triangulation', () => {
  it('carré, polygone en L, polygone à trou : l\'aire est conservée', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    let t = triangulate(square, null);
    expect(t.length).toBe(6);
    expect(triangulatedArea(square, t)).toBeCloseTo(100, 9);
    const ell = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];
    t = triangulate(ell, null);
    expect(t.length).toBe(12);
    expect(triangulatedArea(ell, t)).toBeCloseTo(64, 9);
    const holed = [0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 3, 7, 7, 7, 7, 3];
    t = triangulate(holed, [4]);
    expect(t.length).toBe(24);
    expect(triangulatedArea(holed, t)).toBeCloseTo(100 - 16, 9);
  });

  it('le sens des anneaux est indifférent', () => {
    const cw = [0, 0, 0, 10, 10, 10, 10, 0, 3, 3, 7, 3, 7, 7, 3, 7];
    const t = triangulate(cw, [4]);
    expect(triangulatedArea(cw, t)).toBeCloseTo(84, 9);
  });

  it('étoiles et couronnes au hasard : aire conservée, aucun triangle hors du polygone', () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 60; trial++) {
      const n = 5 + Math.floor(rnd() * 40);
      const flat: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, r = 20 + rnd() * 30;
        flat.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      const holes: number[] = [];
      let holeArea = 0;
      if (trial % 2 === 0) {
        holes.push(n);
        const m = 4 + Math.floor(rnd() * 8);
        const ring: number[] = [];
        for (let i = 0; i < m; i++) {
          const a = -(i / m) * Math.PI * 2, r = 4 + rnd() * 10;
          ring.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        holeArea = ringArea(ring);
        flat.push(...ring);
      }
      const t = triangulate(flat, holes.length > 0 ? holes : null);
      const expected = ringArea(flat.slice(0, n * 2)) - holeArea;
      expect(triangulatedArea(flat, t)).toBeCloseTo(expected, 6);
    }
  });

  it('anneaux dégénérés : pas d\'exception, rien ou presque', () => {
    expect(triangulate([0, 0, 1, 1], null).length).toBe(0);
    expect(triangulate([0, 0, 5, 0, 10, 0], null).length).toBe(0);
    expect(triangulate([0, 0, 5, 0, 5, 0, 5, 5], null).length).toBe(3);
  });
});

describe('ville 3D — sol en facettes', () => {
  const relief = (x: number, z: number): number => 0.01 * x + 0.02 * z + 0.4 * Math.sin(x / 40) * Math.cos(z / 55);

  it('passe par le relief aux nœuds et reste continu d\'une facette à l\'autre', () => {
    const tin = new TileTin(1, -1, relief);
    for (let j = 0; j <= 64; j += 7) {
      for (let i = 0; i <= 64; i += 5) {
        const x = 512 + i * TIN_CELL, z = -512 + j * TIN_CELL;
        expect(tin.y(x, z)).toBeCloseTo(relief(x, z), 4);
      }
    }
    // continuité : de part et d'autre d'une limite de carré et de la diagonale
    for (let k = 0; k < 200; k++) {
      const x = 512 + 8 * (1 + (k % 60)) , z = -512 + 3.37 * k % 500;
      expect(Math.abs(tin.y(x - 1e-4, z) - tin.y(x + 1e-4, z))).toBeLessThan(1e-3);
      const d = 512 + 16 + (k % 8), dz = -512 + 16 + (k % 8);
      expect(Math.abs(tin.y(d + 1e-4, dz) - tin.y(d, dz + 1e-4))).toBeLessThan(1e-3);
    }
    // l'écart avec le relief reste petit pour un relief doux
    let worst = 0;
    for (let k = 0; k < 2000; k++) {
      const x = 512 + (k * 37.7) % 512, z = -512 + (k * 91.3) % 512;
      worst = Math.max(worst, Math.abs(tin.y(x, z) - relief(x, z)));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('le découpage d\'un triangle conserve son aire et range chaque morceau dans une seule facette', () => {
    const ox = 512, oz = -512;
    const tri = [530.5, -500.2, 601.3, -470.9, 548.7, -401.4];
    let area = 0, pieces = 0;
    clipTriangleToTin(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5], ox, oz, (poly, n) => {
      pieces++;
      let a = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let side = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1];
        minX = Math.min(minX, poly[2 * i]);
        maxX = Math.max(maxX, poly[2 * i]);
        minZ = Math.min(minZ, poly[2 * i + 1]);
        maxZ = Math.max(maxZ, poly[2 * i + 1]);
      }
      area += Math.abs(a) / 2;
      // dans un seul carré de 8 m…
      const ci = Math.floor(((minX + maxX) / 2 - ox) / TIN_CELL), cj = Math.floor(((minZ + maxZ) / 2 - oz) / TIN_CELL);
      expect(minX).toBeGreaterThanOrEqual(ox + ci * TIN_CELL - 1e-6);
      expect(maxX).toBeLessThanOrEqual(ox + (ci + 1) * TIN_CELL + 1e-6);
      expect(minZ).toBeGreaterThanOrEqual(oz + cj * TIN_CELL - 1e-6);
      expect(maxZ).toBeLessThanOrEqual(oz + (cj + 1) * TIN_CELL + 1e-6);
      // … et d'un seul côté de sa diagonale
      for (let i = 0; i < n; i++) {
        const u = poly[2 * i] - (ox + ci * TIN_CELL), v = poly[2 * i + 1] - (oz + cj * TIN_CELL);
        const s = u - v > 1e-6 ? 1 : u - v < -1e-6 ? -1 : 0;
        if (s !== 0) {
          if (side === 0) side = s;
          expect(s).toBe(side);
        }
      }
    });
    const expected = Math.abs((tri[2] - tri[0]) * (tri[5] - tri[1]) - (tri[4] - tri[0]) * (tri[3] - tri[1])) / 2;
    expect(area).toBeCloseTo(expected, 6);
    expect(pieces).toBeGreaterThan(50);
  });

  it('une surface découpée selon les facettes est exactement parallèle au sol', () => {
    const tin = new TileTin(0, 0, relief);
    // en tout point d'un morceau, l'altitude interpolée entre ses sommets est celle du sol en facettes
    clipTriangleToTin(20.3, 30.1, 95.2, 41.7, 60.4, 110.9, 0, 0, (poly, n) => {
      let cx = 0, cz = 0, cy = 0;
      for (let i = 0; i < n; i++) {
        cx += poly[2 * i] / n;
        cz += poly[2 * i + 1] / n;
        cy += tin.y(poly[2 * i], poly[2 * i + 1]) / n;
      }
      // pour un morceau plan (triangle) le centre de gravité suffit ; pour un polygone à plus de sommets, tous sont coplanaires
      if (n === 3) expect(cy).toBeCloseTo(tin.y(cx, cz), 5);
    });
  });

  it('ce qui dépasse de la tuile est rattaché aux facettes du bord, sans perte', () => {
    let area = 0;
    clipTriangleToTin(-10, 5, 30, 5, 10, 40, 0, 0, (poly, n) => {
      let a = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1];
      }
      area += Math.abs(a) / 2;
    });
    expect(area).toBeCloseTo((40 * 35) / 2, 6);
  });
});

describe('ville 3D — grille de surfaces', () => {
  it('remplit un polygone à trou, cellule par cellule', () => {
    const r = createRaster(0, 0, 512);
    fillRings(r, [[10, 10, 30, 10, 30, 30, 10, 30], [15, 15, 15, 25, 25, 25, 25, 15]], CL_GRASS);
    expect(codeAt(r, 12.5, 12.5)).toBe(CL_GRASS);
    expect(codeAt(r, 20, 20)).toBe(0);
    expect(codeAt(r, 31, 20)).toBe(0);
    let count = 0;
    for (let i = 0; i < r.codes.length; i++) if (r.codes[i] === CL_GRASS) count++;
    expect(count).toBe(400 - 100);
  });

  it('règles : allée sur un espace vert, pavés sur l\'enrobé seulement, tablier au-dessus de l\'eau', () => {
    const r = createRaster(0, 0, 512);
    r.codes.fill(CL_DEFAULT);
    fillRings(r, [[0, 0, 100, 0, 100, 100, 0, 100]], CL_STABILISE);
    // une place posée à cheval sur le jardin et sur le reste : stabilisé sur le jardin, dallage ailleurs
    fillRings(r, [[80, 40, 140, 40, 140, 60, 80, 60]], CL_PLAZA, RULE_GREEN, CL_STABILISE);
    expect(classAt(r, 90, 50)).toBe(CL_STABILISE);
    expect(classAt(r, 120, 50)).toBe(CL_PLAZA);
    // chaussée, trottoir surélevé, puis pavés le long d'un axe : seule la chaussée change
    fillRings(r, [[200, 0, 220, 0, 220, 100, 200, 100]], CL_ASPHALT);
    fillRings(r, [[220, 0, 226, 0, 226, 100, 220, 100]], CL_SIDEWALK | CODE_NOT_FLUSH);
    paintCapsule(r, 210, 10, 210, 90, 14, RULE_SETT, 0);
    expect(classAt(r, 205, 50)).toBe(CL_SETT);
    expect(codeAt(r, 223, 50)).toBe(CL_SIDEWALK | CODE_NOT_FLUSH);
    expect(codeAt(r, 198, 50)).toBe(CL_DEFAULT);
    expect(classAt(r, 198, 50)).toBe(CL_SIDEWALK);
    // eau, puis tablier : il retient l'eau du dessous, mais ne mord pas sur le trottoir du quai
    fillRings(r, [[300, 0, 400, 0, 400, 100, 300, 100]], CODE_WATER);
    fillRings(r, [[290, 40, 300, 40, 300, 60, 290, 60]], CL_SIDEWALK | CODE_NOT_FLUSH);
    fillRings(r, [[280, 45, 410, 45, 410, 55, 280, 55]], CL_ASPHALT | CODE_DECK | CODE_NOT_FLUSH, RULE_DECK);
    expect(codeAt(r, 350, 50)).toBe(CL_ASPHALT | CODE_DECK | CODE_NOT_FLUSH | CODE_OVER_WATER);
    expect(codeAt(r, 295, 50)).toBe(CL_SIDEWALK | CODE_NOT_FLUSH);
    expect(codeAt(r, 285, 50)).toBe(CL_ASPHALT | CODE_DECK | CODE_NOT_FLUSH);
    expect(codeAt(r, 350, 20)).toBe(CODE_WATER);
    expect(waterShare(r, 310, 10, 390, 30)).toBe(1);
    expect(waterShare(r, 290, 0, 309, 9)).toBeCloseTo(0.5, 5);
  });

  it('surélévations lues dans la grille', () => {
    expect(liftOfCode(CL_ASPHALT)).toBe(0);
    expect(liftOfCode(CL_DEFAULT)).toBe(0);
    expect(liftOfCode(CODE_WATER)).toBe(0);
    expect(liftOfCode(CL_SIDEWALK | CODE_NOT_FLUSH)).toBe(CURB_HEIGHT);
    expect(liftOfCode(CL_GRASS | CODE_NOT_FLUSH)).toBe(PLANTED_LIFT);
    expect(liftOfCode(CL_ASPHALT | CODE_DECK | CODE_NOT_FLUSH)).toBe(0);
    expect(liftOfCode(CL_SIDEWALK | CODE_DECK | CODE_NOT_FLUSH | CODE_OVER_WATER)).toBe(CURB_HEIGHT);
  });

  it('une pelouse placée après la voirie est posée par-dessus, un parc placé avant reste au sol', () => {
    expect(styleOfSurface('grass', true).raised).toBe(true);
    expect(styleOfSurface('grass', false).raised).toBe(false);
    expect(styleOfSurface('park', true).raised).toBe(false);
    expect(styleOfSurface('sidewalk', false).raised).toBe(true);
    expect(styleOfSurface('road', true).cls).toBe(CL_ASPHALT);
  });
});

describe('ville 3D — quartier d\'essai', () => {
  const data = decodeMapData(generateTestDistrict({ seed: 1 }));
  const graph: RoadGraph = data.roadGraph;
  const index = new EdgeIndex(graph);

  it('l\'index des arêtes retrouve au moins celles que chaque tuile annonce', () => {
    for (const tile of data.tiles) {
      const ids = index.query(tile.tx * 512, tile.tz * 512, tile.tx * 512 + 512, tile.tz * 512 + 512);
      const set = new Set(ids);
      for (const e of tile.roadEdges) expect(set.has(e)).toBe(true);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });

  it('grille : chaussées, trottoirs surélevés, fleuve, pont au-dessus de l\'eau', () => {
    let water = 0, deckOverWater = 0, raised = 0, road = 0, sett = 0, unset = 0, ribbons = 0, total = 0;
    for (const tile of data.tiles) {
      const r = rasterizeTile(createRaster(tile.tx, tile.tz, 512), tile, graph, index.query(tile.tx * 512 - 48, tile.tz * 512 - 48, tile.tx * 512 + 560, tile.tz * 512 + 560));
      ribbons += r.ribbons.length / 10;
      for (let i = 0; i < r.codes.length; i++) {
        const code = r.codes[i];
        total++;
        if (code === CODE_WATER) water++;
        else if ((code & CODE_DECK) !== 0 && (code & CODE_OVER_WATER) !== 0) deckOverWater++;
        else if ((code & CODE_NOT_FLUSH) !== 0) raised++;
        const cls = code & CODE_CLASS_MASK;
        if (code === CL_ASPHALT) road++;
        if (cls === CL_SETT) sett++;
        if (cls === CL_DEFAULT) unset++;
      }
    }
    // un fleuve de 120 m sur 1 024 m de long, moins le pont
    expect(water).toBeGreaterThan(100000);
    expect(water).toBeLessThan(130000);
    // le pont : la carte ne donne pas son emprise (convention du format), le ruban de repli la fournit
    expect(ribbons).toBeGreaterThan(0);
    expect(deckOverWater).toBeGreaterThan(1200);
    expect(raised).toBeGreaterThan(total * 0.05);
    expect(road).toBeGreaterThan(total * 0.08);
    // la rue pavée du quartier
    expect(sett).toBeGreaterThan(500);
    expect(unset).toBeLessThan(total * 0.2);
  });

  it('le quartier d\'essai range des surfaces au sol après les trottoirs ; texture lointaine : l\'eau a un alpha nul', () => {
    const tile = data.tiles.find((t) => t.surfaces.some((s) => s.kind === 'water'));
    expect(tile).toBeDefined();
    if (!tile) return;
    expect(flushOverRaised(tile)).toBe(true);
    const r = rasterizeTile(createRaster(tile.tx, tile.tz, 256), tile, graph, tile.roadEdges);
    expect(r.hasWater).toBe(true);
    const px = bakeMacro(r, 64);
    let wet = 0, dry = 0;
    for (let p = 3; p < px.length; p += 4) {
      if (px[p] === 0) wet++;
      else if (px[p] === 255) dry++;
    }
    expect(wet + dry).toBe(64 * 64);
    expect(wet).toBeGreaterThan(200);
    expect(dry).toBeGreaterThan(2000);
  });

  it('tablier du pont : rectiligne entre l\'altitude du sol à ses deux bouts', () => {
    const relief = (x: number, z: number): number => 0.004 * x - 0.01 * z + 2;
    const profile = new BridgeProfile(graph, relief);
    expect(profile.bridgeSegments).toBeGreaterThan(0);
    const bridges = graph.edges.map((e, i) => ({ e, i })).filter((b) => b.e.bridge);
    expect(bridges.length).toBeGreaterThan(0);
    profile.focus(-600, -600, 600, 600);
    for (const { e, i } of bridges) {
      const pts = e.points;
      const ax = pts[0], az = pts[1], bx = pts[pts.length - 2], bz = pts[pts.length - 1];
      const ya = profile.axisY(i, 0), yb = profile.axisY(i, e.length);
      // sur l'axe, au milieu : la moyenne des deux bouts, quel que soit le sol dessous
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      expect(profile.deckY(mx, mz, -50)).toBeCloseTo((ya + yb) / 2, 3);
      // à 1 m de l'axe : pareil (dans la demi-largeur du tablier)
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      expect(profile.deckY(mx + nx, mz + nz, -50)).toBeCloseTo((ya + yb) / 2, 3);
    }
    // loin de tout pont : le sol, inchangé
    expect(profile.deckY(-400, -400, 3.25)).toBe(3.25);
  });
});
