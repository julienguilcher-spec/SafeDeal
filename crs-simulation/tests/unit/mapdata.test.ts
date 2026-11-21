// Tests du format de carte (src/world/mapdata.ts) et du quartier d'essai (src/world/testDistrict.ts).
import { describe, expect, it } from 'vitest';
import {
  ANGLE_UNITS,
  BUILDING_STYLES,
  FORMAT_NAME,
  FORMAT_VERSION,
  MAP_FILES,
  MAX_OVERHANG,
  PARIS_BBOX,
  ROOF_SHAPES,
  SHOP_CATEGORIES,
  TILE_SIZE,
  TILE_UNITS,
  boundsOfBbox,
  clipPolylineToRect,
  clipRingToRect,
  computeTileEdgeRefs,
  createEmptyTile,
  createManifest,
  decodeLandmarks,
  decodeMapData,
  decodePlaces,
  decodeRoadGraph,
  decodeTerrain,
  decodeTile,
  edgesByName,
  encodeLandmarks,
  encodeMapData,
  encodePlaces,
  encodeRoadGraph,
  encodeTerrain,
  encodeTile,
  estimateLevels,
  headingOf,
  lonLatToWorld,
  mapDataFiles,
  osmStableId,
  outwardHeading,
  parseManifest,
  parseTileKey,
  pointInPolygon,
  pointInRing,
  polylineLength,
  reverseRing,
  ringBounds,
  ringIsCCW,
  ringSelfIntersects,
  ringSignedArea,
  roadGraphComponents,
  sampleTerrain,
  segmentIntersectsRect,
  terrainFromFunction,
  tileBounds,
  tileIndexOf,
  tileKey,
  tilePath,
  tilesCoveringBounds,
  treeSetFromList,
  validateLandmarks,
  validateManifest,
  validateMapData,
  validatePlaces,
  validateRawTile,
  validateRoadGraph,
  validateTerrain,
  validateTile,
  worldToLonLat,
} from '../../src/world/mapdata';
import type { Landmark, MapData, Place, RawTile, RoadEdgeInput, RoadGraph, RoadNodeInput, Tile } from '../../src/world/mapdata';
import { TEST_DISTRICT, generateTestDistrict } from '../../src/world/testDistrict';

// ─────────────────────────────────────────────────────────────────────────────────────
// Outils de test
// ─────────────────────────────────────────────────────────────────────────────────────

/** Rectangle antihoraire vu de dessus : sud-ouest, sud-est, nord-est, nord-ouest. */
function rect(x0: number, z0: number, x1: number, z1: number): number[] {
  return [x0, z1, x1, z1, x1, z0, x0, z0];
}

function f32(values: number[]): Float32Array {
  return Float32Array.from(values);
}

/** Passe par le texte JSON, comme une lecture sur disque. */
function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Tous les nombres d'une structure JSON. */
function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allNumbers(v, out);
  else if (typeof value === 'object' && value !== null) for (const v of Object.values(value)) allNumbers(v, out);
  return out;
}

function expectCoordsClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 0.0501): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
}

/** Écart angulaire (rad) ramené dans [0, π]. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

const TX = -2, TZ = 1;
const OX = TX * TILE_SIZE, OZ = TZ * TILE_SIZE;

/** Tuile synthétique qui exerce toutes les couches et toutes les colonnes facultatives. */
function sampleTile(): Tile {
  const t = createEmptyTile(TX, TZ);
  t.buildings.push(
    {
      id: osmStableId('way', 1234567890), kind: 'office', roof: 'mansard', style: 'haussmann', baseY: -1.3, height: 22.4, levels: 7,
      outer: f32(rect(OX + 10, OZ + 10, OX + 60, OZ + 40)),
      holes: [f32(reverseRing(rect(OX + 25, OZ + 18, OX + 45, OZ + 32)))],
      landmarkKey: '', name: 'Hôtel des Essais',
    },
    {
      id: 77, kind: 'monument', roof: 'dome', style: 'monumental', baseY: 2, height: 43, levels: 1,
      outer: f32([OX + 100, OZ + 130, OX + 131.5, OZ + 128, OX + 140, OZ + 100, OX + 112, OZ + 92.5]),
      holes: [], landmarkKey: 'dome_essai', name: '',
    },
    {
      // Déborde de la tuile à l'ouest et au nord : autorisé pour un bâtiment (jamais découpé).
      id: 78, kind: 'generic', roof: 'flat', style: 'modern', baseY: 0, height: 9.3, levels: 3,
      outer: f32(rect(OX - 12, OZ - 5.5, OX + 30, OZ + 9)),
      holes: [], landmarkKey: '', name: '',
    },
  );
  t.roadEdges = [3, 17, 256];
  t.surfaces.push(
    { kind: 'road', name: '', level: null, outer: f32(rect(OX, OZ, OX + 512, OZ + 512)), holes: [f32(reverseRing(rect(OX + 5, OZ + 5, OX + 70, OZ + 45)))] },
    { kind: 'garden', name: 'Square des Essais', level: null, outer: f32(rect(OX + 200, OZ + 200, OX + 300, OZ + 280)), holes: [] },
    { kind: 'water', name: 'Le Fleuve', level: -7.5, outer: f32(rect(OX, OZ + 400, OX + 512, OZ + 512)), holes: [] },
  );
  t.barriers.push(
    { kind: 'fence', height: 2.2, points: f32([OX + 200, OZ + 200, OX + 300, OZ + 200, OX + 300, OZ + 280]) },
    { kind: 'quay_wall', height: 5.5, points: f32([OX, OZ + 400, OX + 512, OZ + 400]) },
    { kind: 'wall', height: 2, points: f32([OX + 400, OZ + 20, OX + 400, OZ + 60]) },
  );
  t.trees = treeSetFromList([
    { x: OX + 0, z: OZ + 0, height: 12.5, crownRadius: 4 },
    { x: OX + 255.3, z: OZ + 300.7, height: 8, crownRadius: 2.5 },
    { x: OX + 511.9, z: OZ + 511.9, height: 20.1, crownRadius: 6.2 },
  ]);
  t.furniture.push(
    { kind: 'banc', x: OX + 50, z: OZ + 60, heading: 0 },
    { kind: 'candelabre', x: OX + 51.2, z: OZ + 61.7, heading: Math.PI / 2 },
    { kind: 'abribus', x: OX + 80, z: OZ + 61, heading: Math.PI },
    { kind: 'camera', x: OX + 81, z: OZ + 62, heading: (3 * Math.PI) / 2 },
  );
  t.signals.push({ x: OX + 90, z: OZ + 5, heading: 1.25, node: 12 }, { x: OX + 95, z: OZ + 8, heading: 4, node: -1 });
  t.metroEntrances.push(
    { x: OX + 70, z: OZ + 70, heading: 2.5, name: 'Essai — Rond-Point', lines: '1;7' },
    { x: OX + 75, z: OZ + 90, heading: 0.5, name: 'Essai — Rond-Point', lines: '' },
  );
  t.shops.push(
    { id: 9001, x: OX + 35, z: OZ + 40, heading: 0, width: 6.4, category: 'banque', buildingId: osmStableId('way', 1234567890) },
    { id: 9002, x: OX + 60, z: OZ + 25, heading: Math.PI / 2, width: 4, category: 'cafe_restaurant', buildingId: osmStableId('way', 1234567890) },
  );
  return t;
}

function expectTileClose(actual: Tile, expected: Tile): void {
  expect(actual.version).toBe(FORMAT_VERSION);
  expect([actual.tx, actual.tz]).toEqual([expected.tx, expected.tz]);
  expect(actual.buildings.length).toBe(expected.buildings.length);
  for (let i = 0; i < expected.buildings.length; i++) {
    const a = actual.buildings[i], e = expected.buildings[i];
    expect([a.id, a.kind, a.roof, a.style, a.levels, a.landmarkKey, a.name]).toEqual([e.id, e.kind, e.roof, e.style, e.levels, e.landmarkKey, e.name]);
    expect(a.baseY).toBeCloseTo(e.baseY, 6);
    expect(a.height).toBeCloseTo(e.height, 6);
    expect(a.outer).toBeInstanceOf(Float32Array);
    expectCoordsClose(a.outer, e.outer);
    expect(a.holes.length).toBe(e.holes.length);
    for (let k = 0; k < e.holes.length; k++) expectCoordsClose(a.holes[k], e.holes[k]);
  }
  expect(actual.roadEdges).toEqual(expected.roadEdges);
  expect(actual.surfaces.length).toBe(expected.surfaces.length);
  for (let i = 0; i < expected.surfaces.length; i++) {
    const a = actual.surfaces[i], e = expected.surfaces[i];
    expect([a.kind, a.name, a.level]).toEqual([e.kind, e.name, e.level]);
    expectCoordsClose(a.outer, e.outer);
    expect(a.holes.length).toBe(e.holes.length);
    for (let k = 0; k < e.holes.length; k++) expectCoordsClose(a.holes[k], e.holes[k]);
  }
  expect(actual.barriers.length).toBe(expected.barriers.length);
  for (let i = 0; i < expected.barriers.length; i++) {
    expect(actual.barriers[i].kind).toBe(expected.barriers[i].kind);
    expect(actual.barriers[i].height).toBeCloseTo(expected.barriers[i].height, 6);
    expectCoordsClose(actual.barriers[i].points, expected.barriers[i].points);
  }
  expect(actual.trees.count).toBe(expected.trees.count);
  expectCoordsClose(actual.trees.x, expected.trees.x, 0.1001); // un point en bord de tuile y est ramené
  expectCoordsClose(actual.trees.z, expected.trees.z, 0.1001);
  expectCoordsClose(actual.trees.height, expected.trees.height);
  expectCoordsClose(actual.trees.crownRadius, expected.trees.crownRadius);
  expect(actual.furniture.length).toBe(expected.furniture.length);
  for (let i = 0; i < expected.furniture.length; i++) {
    const a = actual.furniture[i], e = expected.furniture[i];
    expect(a.kind).toBe(e.kind);
    expectCoordsClose([a.x, a.z], [e.x, e.z]);
    expect(angleGap(a.heading, e.heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
  }
  expect(actual.signals.length).toBe(expected.signals.length);
  for (let i = 0; i < expected.signals.length; i++) {
    const a = actual.signals[i], e = expected.signals[i];
    expect(a.node).toBe(e.node);
    expectCoordsClose([a.x, a.z], [e.x, e.z]);
    expect(angleGap(a.heading, e.heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
  }
  expect(actual.metroEntrances.length).toBe(expected.metroEntrances.length);
  for (let i = 0; i < expected.metroEntrances.length; i++) {
    const a = actual.metroEntrances[i], e = expected.metroEntrances[i];
    expect([a.name, a.lines]).toEqual([e.name, e.lines]);
    expectCoordsClose([a.x, a.z], [e.x, e.z]);
    expect(angleGap(a.heading, e.heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
  }
  expect(actual.shops.length).toBe(expected.shops.length);
  for (let i = 0; i < expected.shops.length; i++) {
    const a = actual.shops[i], e = expected.shops[i];
    expect([a.id, a.category, a.buildingId]).toEqual([e.id, e.category, e.buildingId]);
    expect(a.width).toBeCloseTo(e.width, 6);
    expectCoordsClose([a.x, a.z], [e.x, e.z]);
    expect(angleGap(a.heading, e.heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Projection et tuiles
// ─────────────────────────────────────────────────────────────────────────────────────

describe('projection et tuiles', () => {
  it("place l'origine sur l'obélisque de la Concorde", () => {
    const p = lonLatToWorld(2.321236, 48.865633);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it("projette l'Arc de Triomphe vers x ≈ -1920 m, z ≈ -907 m", () => {
    const p = lonLatToWorld(2.29504, 48.87379);
    expect(Math.abs(p.x - -1920)).toBeLessThan(1);
    expect(Math.abs(p.z - -907)).toBeLessThan(1);
    expect(p.x).toBeCloseTo((2.29504 - 2.321236) * 73305, 6);
    expect(p.z).toBeCloseTo(-(48.87379 - 48.865633) * 111214, 6);
  });

  it("oriente x vers l'est et z vers le sud", () => {
    expect(lonLatToWorld(2.33, 48.865633).x).toBeGreaterThan(0);
    expect(lonLatToWorld(2.321236, 48.87).z).toBeLessThan(0);
    expect(lonLatToWorld(2.321236, 48.86).z).toBeGreaterThan(0);
  });

  it('inverse la projection', () => {
    for (const [lon, lat] of [[2.285, 48.85], [2.3725, 48.878], [2.29504, 48.87379], [2.3522, 48.8566]]) {
      const w = lonLatToWorld(lon, lat);
      const g = worldToLonLat(w.x, w.z);
      expect(g.lon).toBeCloseTo(lon, 10);
      expect(g.lat).toBeCloseTo(lat, 10);
    }
  });

  it('réutilise l’objet de sortie fourni', () => {
    const out = { x: 0, z: 0 };
    expect(lonLatToWorld(2.3, 48.86, out)).toBe(out);
    const idx = { tx: 0, tz: 0 };
    expect(tileIndexOf(-1, 600, idx)).toBe(idx);
    expect(idx).toEqual({ tx: -1, tz: 1 });
  });

  it("couvre l'emprise de Paris avec 98 tuiles de 512 m", () => {
    const b = boundsOfBbox(PARIS_BBOX);
    expect(b.minX).toBeCloseTo(-2656.3, 0);
    expect(b.maxX).toBeCloseTo(3757.9, 0);
    expect(b.minZ).toBeCloseTo(-1375.4, 0);
    expect(b.maxZ).toBeCloseTo(1738.6, 0);
    const tiles = tilesCoveringBounds(b);
    expect(tiles.length).toBe(98);
    expect(Math.min(...tiles.map((t) => t.tx))).toBe(-6);
    expect(Math.max(...tiles.map((t) => t.tx))).toBe(7);
    expect(Math.min(...tiles.map((t) => t.tz))).toBe(-3);
    expect(Math.max(...tiles.map((t) => t.tz))).toBe(3);
    // 98 tuiles + 5 fichiers globaux : sous la limite de 110 fichiers.
    expect(tiles.length + 5).toBeLessThanOrEqual(110);
  });

  it('calcule indices, clés, chemins et bornes de tuile', () => {
    expect(tileIndexOf(0, 0)).toEqual({ tx: 0, tz: 0 });
    expect(tileIndexOf(-0.01, -0.01)).toEqual({ tx: -1, tz: -1 });
    expect(tileIndexOf(511.99, 512)).toEqual({ tx: 0, tz: 1 });
    expect(tileIndexOf(-1920.3, -907.2)).toEqual({ tx: -4, tz: -2 });
    expect(tileKey(-3, 2)).toBe('-3_2');
    expect(parseTileKey('-3_2')).toEqual({ tx: -3, tz: 2 });
    expect(() => parseTileKey('3-2')).toThrow();
    expect(tilePath(-3, 2)).toBe('tiles/t_-3_2.json');
    expect(tileBounds(-3, 2)).toEqual({ minX: -1536, minZ: 1024, maxX: -1024, maxZ: 1536 });
    expect(tilesCoveringBounds({ minX: -512, minZ: -512, maxX: 512, maxZ: 512 })).toEqual([
      { tx: -1, tz: -1 }, { tx: 0, tz: -1 }, { tx: -1, tz: 0 }, { tx: 0, tz: 0 },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Géométrie
// ─────────────────────────────────────────────────────────────────────────────────────

describe('géométrie', () => {
  const square = rect(0, 0, 10, 10);

  it('donne une aire positive aux anneaux antihoraires vus de dessus', () => {
    expect(ringSignedArea(square)).toBe(100);
    expect(ringIsCCW(square)).toBe(true);
    const reversed = reverseRing(square);
    expect(reversed.slice(0, 2)).toEqual(square.slice(0, 2));
    expect(ringSignedArea(reversed)).toBe(-100);
    expect(ringIsCCW(reversed)).toBe(false);
  });

  it('oriente la normale sortante vers la rue', () => {
    // Côté sud du carré (du sud-ouest au sud-est) : la normale regarde le sud, cap 0.
    expect(outwardHeading(0, 10, 10, 10)).toBeCloseTo(0, 12);
    // Côté est (du sud-est au nord-est) : la normale regarde l'est, cap π/2.
    expect(outwardHeading(10, 10, 10, 0)).toBeCloseTo(Math.PI / 2, 12);
    // Côté nord : cap π (ou -π).
    expect(Math.abs(outwardHeading(10, 0, 0, 0))).toBeCloseTo(Math.PI, 12);
    expect(headingOf(0, 1)).toBe(0);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('teste l’appartenance à un anneau et à un polygone troué', () => {
    expect(pointInRing(square, 5, 5)).toBe(true);
    expect(pointInRing(square, 15, 5)).toBe(false);
    const hole = reverseRing(rect(4, 4, 6, 6));
    expect(pointInPolygon(square, [hole], 5, 5)).toBe(false);
    expect(pointInPolygon(square, [hole], 2, 2)).toBe(true);
    expect(ringBounds(square)).toEqual({ minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
    expect(polylineLength([0, 0, 3, 4, 3, 10])).toBe(11);
  });

  it('découpe un anneau par un rectangle', () => {
    const box = { minX: 0, minZ: 0, maxX: 512, maxZ: 512 };
    const clipped = clipRingToRect(rect(-20, 100, 30, 140), box);
    expect(ringSignedArea(clipped)).toBeCloseTo(30 * 40, 9);
    expect(ringBounds(clipped)).toEqual({ minX: 0, minZ: 100, maxX: 30, maxZ: 140 });
    expect(clipRingToRect(rect(-50, -50, -10, -10), box)).toEqual([]);
    // Un anneau qui ne fait que toucher le bord ne laisse rien.
    expect(clipRingToRect(rect(-50, 0, 0, 50), box)).toEqual([]);
    const inside = rect(10, 10, 20, 20);
    expect(ringSignedArea(clipRingToRect(inside, box))).toBe(100);
  });

  it('découpe une polyligne par un rectangle', () => {
    const box = { minX: 0, minZ: 0, maxX: 100, maxZ: 100 };
    expect(clipPolylineToRect([-50, 50, 150, 50], box)).toEqual([[0, 50, 100, 50]]);
    // Sort puis rentre : deux morceaux.
    const pieces = clipPolylineToRect([10, 10, 10, 150, 60, 150, 60, 10], box);
    expect(pieces).toEqual([[10, 10, 10, 100], [60, 100, 60, 10]]);
    expect(clipPolylineToRect([200, 200, 300, 300], box)).toEqual([]);
    expect(clipPolylineToRect([10, 10, 20, 20, 30, 10], box)).toEqual([[10, 10, 20, 20, 30, 10]]);
    // Un mur posé pile sur une limite de tuile n'est gardé que par une des deux tuiles voisines.
    const wall = [-20, 512, 40, 512];
    const kept = [tileBounds(0, 0), tileBounds(0, 1), tileBounds(-1, 0), tileBounds(-1, 1)].map((r) => clipPolylineToRect(wall, r));
    expect(kept).toEqual([[], [[0, 512, 40, 512]], [], [[-20, 512, 0, 512]]]);
  });

  it('détecte les anneaux qui se recoupent et les segments qui touchent un rectangle', () => {
    expect(ringSelfIntersects(square)).toBe(false);
    expect(ringSelfIntersects([0, 0, 10, 10, 10, 0, 0, 10])).toBe(true);
    const box = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };
    expect(segmentIntersectsRect(-5, 5, 15, 5, box)).toBe(true);
    expect(segmentIntersectsRect(-5, -5, -1, 20, box)).toBe(false);
    expect(segmentIntersectsRect(-5, 12, 12, -5, box)).toBe(true);
    expect(segmentIntersectsRect(-5, 16, 16, -5, box)).toBe(true);
    expect(segmentIntersectsRect(-5, 26, 26, -5, box)).toBe(false);
  });

  it('estime les niveaux et fabrique des identifiants stables', () => {
    expect(estimateLevels(21.7)).toBe(7);
    expect(estimateLevels(0.5)).toBe(1);
    const ids = new Set([osmStableId('node', 42), osmStableId('way', 42), osmStableId('relation', 42), osmStableId('way', 43)]);
    expect(ids.size).toBe(4);
    expect(Number.isSafeInteger(osmStableId('node', 13_000_000_000))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Tuiles
// ─────────────────────────────────────────────────────────────────────────────────────

describe('tuile : encodage et décodage', () => {
  it('fait un aller-retour fidèle au décimètre', () => {
    const source = sampleTile();
    const dropped: string[] = [];
    const raw = encodeTile(source, dropped);
    expect(dropped).toEqual([]);
    expect(validateRawTile(raw)).toEqual({ ok: true, errors: [], warnings: [] });
    const decoded = decodeTile(viaJson(raw));
    expectTileClose(decoded, source);
    expect(validateTile(decoded)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("n'écrit que des entiers, relatifs à l'origine de la tuile", () => {
    const raw = encodeTile(sampleTile());
    expect(raw.v).toBe(FORMAT_VERSION);
    expect([raw.tx, raw.tz]).toEqual([TX, TZ]);
    for (const n of allNumbers(raw)) expect(Number.isInteger(n)).toBe(true);
    // Premier sommet du premier bâtiment : (10 m, 40 m) depuis l'origine de la tuile, en décimètres.
    expect(raw.buildings?.xz.slice(0, 2)).toEqual([100, 400]);
    // Sommets suivants en deltas : 50 m vers l'est, puis 30 m vers le nord.
    expect(raw.buildings?.xz.slice(2, 6)).toEqual([500, 0, 0, -300]);
    // Arbres : positions absolues dans la tuile, bornées à [0, TILE_UNITS - 1].
    expect(raw.trees?.xz).toEqual([0, 0, 2553, 3007, TILE_UNITS - 1, TILE_UNITS - 1]);
    expect(raw.str?.[0]).toBe('');
    expect(raw.roads).toEqual([3, 17, 256]);
  });

  it('est idempotent : réencoder une tuile décodée redonne le même fichier', () => {
    const raw = encodeTile(sampleTile());
    const again = encodeTile(decodeTile(viaJson(raw)));
    expect(again).toEqual(raw);
    expect(JSON.stringify(again)).toBe(JSON.stringify(raw));
  });

  it('impose le sens des anneaux et retire les sommets superflus', () => {
    const t = createEmptyTile(0, 0);
    t.buildings.push({
      id: 1, kind: 'generic', roof: 'flat', style: 'haussmann', baseY: 0, height: 10, levels: 3,
      // Horaire, refermé explicitement, avec un sommet doublé : tout est normalisé à l'encodage.
      outer: f32([...reverseRing(rect(10, 10, 30, 30)), 10, 30, 10, 30.01]),
      // Trou donné dans le mauvais sens (antihoraire).
      holes: [f32(rect(15, 15, 25, 25))],
      landmarkKey: '', name: '',
    });
    const b = decodeTile(encodeTile(t)).buildings[0];
    expect(b.outer.length).toBe(8);
    expect(ringSignedArea(b.outer)).toBeCloseTo(400, 3);
    expect(ringSignedArea(b.holes[0])).toBeCloseTo(-100, 3);
    expect(validateTile(decodeTile(encodeTile(t))).ok).toBe(true);
  });

  it('écarte et signale ce qui ne peut pas être représenté', () => {
    const t = createEmptyTile(0, 0);
    t.buildings.push({
      id: 5, kind: 'generic', roof: 'flat', style: 'haussmann', baseY: 0, height: 10, levels: 3,
      outer: f32([10, 10, 10.02, 10.01, 10.03, 10.04]), holes: [], landmarkKey: '', name: '',
    });
    t.surfaces.push({ kind: 'park', name: '', level: null, outer: f32([0, 0, 50, 0, 100, 0]), holes: [] });
    t.barriers.push({ kind: 'wall', height: 2, points: f32([5, 5, 5.01, 5.02]) });
    t.trees = treeSetFromList([{ x: 600, z: 10, height: 10, crownRadius: 3 }, { x: 10, z: 10, height: 10, crownRadius: 3 }]);
    t.furniture.push({ kind: 'banc', x: -3, z: 10, heading: 0 });
    t.shops.push({ id: 1, x: 10, z: 700, heading: 0, width: 4, category: 'mode', buildingId: 0 });
    const dropped: string[] = [];
    const raw = encodeTile(t, dropped);
    expect(dropped.length).toBe(6);
    expect(raw.buildings).toBeUndefined();
    expect(raw.surfaces).toBeUndefined();
    expect(raw.barriers).toBeUndefined();
    expect(raw.furniture).toBeUndefined();
    expect(raw.shops).toBeUndefined();
    expect(raw.trees?.n).toBe(1);
    // Sans tableau de signalement, l'encodage reste silencieux.
    expect(() => encodeTile(t)).not.toThrow();
  });

  it('refuse une valeur d’énumération inconnue et des indices de tuile non entiers', () => {
    const t = sampleTile();
    (t.buildings[0] as { kind: string }).kind = 'chateau';
    expect(() => encodeTile(t)).toThrow(/chateau/);
    expect(() => encodeTile(createEmptyTile(0.5, 0))).toThrow();
  });

  it('omet les couches vides et les colonnes à leur valeur par défaut', () => {
    expect(encodeTile(createEmptyTile(3, -2))).toEqual({ v: FORMAT_VERSION, tx: 3, tz: -2 });
    const empty = decodeTile({ v: FORMAT_VERSION, tx: 3, tz: -2 });
    expect(empty.buildings).toEqual([]);
    expect(empty.trees.count).toBe(0);
    expect(empty.roadEdges).toEqual([]);

    const t = createEmptyTile(0, 0);
    t.buildings.push({
      id: 1, kind: 'generic', roof: 'flat', style: 'haussmann', baseY: 0, height: 15.5, levels: 0,
      outer: f32(rect(10, 10, 30, 30)), holes: [], landmarkKey: '', name: '',
    });
    t.trees = treeSetFromList([{ x: 5, z: 5, height: 10, crownRadius: 3 }]);
    t.furniture.push({ kind: 'autre', x: 1, z: 1, heading: 0 });
    const raw = encodeTile(t);
    expect(Object.keys(raw.buildings ?? {}).sort()).toEqual(['h', 'id', 'len', 'n', 'xz']);
    expect(Object.keys(raw.trees ?? {}).sort()).toEqual(['n', 'xz']);
    expect(Object.keys(raw.furniture ?? {}).sort()).toEqual(['n', 'xz']);
    expect(raw.str).toBeUndefined();
    const d = decodeTile(raw);
    expect(d.buildings[0].levels).toBe(estimateLevels(15.5)); // niveaux inconnus : estimés d'après la hauteur
    expect(d.trees.height[0]).toBe(10);
    expect(d.trees.crownRadius[0]).toBe(3);
    expect(d.furniture[0]).toEqual({ kind: 'autre', x: 1, z: 1, heading: 0 });
  });

  it('reste lisible quand les données sont plus récentes que le code', () => {
    const raw = viaJson(encodeTile(sampleTile())) as RawTile & Record<string, unknown>;
    // Couche et colonne inconnues : ignorées.
    raw.futureLayer = { n: 1, xz: [1, 2] };
    (raw.buildings as unknown as Record<string, unknown>).futureColumn = [1, 2, 3];
    // Codes d'énumération inconnus : repli sur la valeur d'indice 0.
    if (raw.buildings?.kind) raw.buildings.kind[0] = 999;
    if (raw.furniture?.kind) raw.furniture.kind[0] = 999;
    if (raw.surfaces) raw.surfaces.kind[1] = 999;
    const d = decodeTile(raw);
    expect(d.buildings.length).toBe(3);
    expect(d.buildings[0].kind).toBe('generic');
    expect(d.furniture[0].kind).toBe('autre');
    expect(d.surfaces[1].kind).toBe('plaza');
    const check = validateRawTile(raw);
    expect(check.ok).toBe(true);
    expect(check.warnings.length).toBe(3);
  });

  it('refuse une version non prise en charge et une structure incohérente', () => {
    expect(() => decodeTile({ v: FORMAT_VERSION + 1, tx: 0, tz: 0 })).toThrow(/version/);
    const raw = viaJson(encodeTile(sampleTile()));
    raw.buildings?.xz.pop();
    expect(() => decodeTile(raw)).toThrow();
  });
});

describe('tuile : robustesse sur des données aléatoires', () => {
  /** Générateur congruentiel simple, déterministe. */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Polygone étoilé autour d'un centre : simple par construction, antihoraire vu de dessus. */
  function blob(rnd: () => number, cx: number, cz: number, radius: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = ((i + rnd() * 0.6) / n) * Math.PI * 2;
      const r = radius * (0.55 + rnd() * 0.45);
      out.push(cx + r * Math.cos(t), cz - r * Math.sin(t));
    }
    return out;
  }

  function randomTile(rnd: () => number, tx: number, tz: number, buildings: number, vertices: number): Tile {
    const t = createEmptyTile(tx, tz);
    const ox = tx * TILE_SIZE, oz = tz * TILE_SIZE;
    for (let i = 0; i < buildings; i++) {
      const cx = ox + 20 + rnd() * 472, cz = oz + 20 + rnd() * 472;
      const radius = 6 + rnd() * 14;
      const outer = blob(rnd, cx, cz, radius, vertices);
      const holes = rnd() < 0.2 ? [reverseRing(blob(rnd, cx, cz, radius * 0.3, 5))] : [];
      t.buildings.push({
        id: 1 + i + (tx + 10) * 100000 + (tz + 10) * 10000000,
        kind: rnd() < 0.5 ? 'generic' : 'residential',
        roof: ROOF_SHAPES[Math.floor(rnd() * ROOF_SHAPES.length)],
        style: BUILDING_STYLES[Math.floor(rnd() * BUILDING_STYLES.length)],
        baseY: Math.round((rnd() * 60 - 10) * 10) / 10,
        height: Math.round((4 + rnd() * 30) * 10) / 10,
        levels: 1 + Math.floor(rnd() * 9),
        outer: f32(outer), holes: holes.map(f32),
        landmarkKey: '', name: rnd() < 0.02 ? `Bâtiment ${i}` : '',
      });
    }
    const trees = [];
    for (let i = 0; i < buildings / 2; i++) trees.push({ x: ox + rnd() * 511.9, z: oz + rnd() * 511.9, height: 5 + rnd() * 20, crownRadius: 2 + rnd() * 5 });
    t.trees = treeSetFromList(trees);
    for (let i = 0; i < buildings / 2; i++) {
      t.furniture.push({ kind: rnd() < 0.5 ? 'candelabre' : 'potelet', x: ox + rnd() * 511.9, z: oz + rnd() * 511.9, heading: (rnd() - 0.5) * 20 });
    }
    t.barriers.push({ kind: 'fence', height: 2, points: f32(blob(rnd, ox + 256, oz + 256, 200, 30)) });
    t.surfaces.push({ kind: 'park', name: 'Parc', level: null, outer: f32(blob(rnd, ox + 256, oz + 256, 240, 40)), holes: [] });
    return t;
  }

  it('reste fidèle et idempotent sur 60 tuiles aléatoires, jusqu’aux bords de l’emprise', () => {
    const rnd = lcg(20261115);
    for (let k = 0; k < 60; k++) {
      const tx = -6 + Math.floor(rnd() * 14), tz = -3 + Math.floor(rnd() * 7);
      const source = randomTile(rnd, tx, tz, 40, 3 + Math.floor(rnd() * 12));
      const dropped: string[] = [];
      const raw = encodeTile(source, dropped);
      expect(dropped).toEqual([]);
      expect(validateRawTile(raw).errors).toEqual([]);
      const decoded = decodeTile(viaJson(raw));
      expect(encodeTile(decoded)).toEqual(raw);
      expect(decoded.buildings.length).toBe(source.buildings.length);
      for (let i = 0; i < source.buildings.length; i++) {
        expectCoordsClose(decoded.buildings[i].outer, source.buildings[i].outer, 0.0502);
        expect(ringIsCCW(decoded.buildings[i].outer)).toBe(true);
        for (const h of decoded.buildings[i].holes) expect(ringIsCCW(h)).toBe(false);
      }
      expectCoordsClose(decoded.barriers[0].points, source.barriers[0].points, 0.0502);
      expectCoordsClose(decoded.trees.x, source.trees.x, 0.1002);
      for (let i = 0; i < source.furniture.length; i++) expect(angleGap(decoded.furniture[i].heading, source.furniture[i].heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
      // Tout point décodé retombe dans sa tuile.
      for (let i = 0; i < decoded.trees.count; i++) expect(tileIndexOf(decoded.trees.x[i], decoded.trees.z[i])).toEqual({ tx, tz });
      expect(validateTile(decoded).errors).toEqual([]);
    }
  });

  it('reste compact : une tuile dense tient dans le budget', () => {
    // 1 500 bâtiments de 10 sommets, 750 arbres, 750 objets : plus dense qu'une tuile du centre de Paris.
    const raw = encodeTile(randomTile(lcg(7), 2, -1, 1500, 10));
    const bytes = JSON.stringify(raw).length;
    const vertices = (raw.buildings?.xz.length ?? 0) / 2;
    expect(vertices).toBeGreaterThan(15000);
    expect(bytes).toBeLessThan(250_000);
    // Le décodage redonne tous les bâtiments.
    expect(decodeTile(viaJson(raw)).buildings.length).toBe(1500);
  });
});

describe('tuile : contrôles d’intégrité', () => {
  it('validateRawTile détecte les fichiers abîmés', () => {
    const good = encodeTile(sampleTile());
    const cases: [string, (r: RawTile) => void][] = [
      ['coordonnée non entière', (r) => { if (r.buildings) r.buildings.xz[0] = 1.5; }],
      ['colonne trop courte', (r) => { r.buildings?.h.pop(); }],
      ['colonne xz tronquée', (r) => { r.surfaces?.xz.pop(); }],
      ['table de chaînes sans chaîne vide en tête', (r) => { if (r.str) r.str[0] = 'x'; }],
      ['arbre hors de la tuile', (r) => { if (r.trees) r.trees.xz[0] = TILE_UNITS; }],
      ['indices de routes non croissants', (r) => { r.roads = [5, 5]; }],
      ['référence de chaîne hors table', (r) => { if (r.buildings?.name) r.buildings.name[1] = 99; }],
      ['angle hors de 0..3599', (r) => { if (r.furniture?.a) r.furniture.a[0] = ANGLE_UNITS; }],
      ['anneau très loin de la tuile', (r) => { if (r.buildings) r.buildings.xz[0] = -(MAX_OVERHANG + 50) * 10; }],
      ['version inconnue', (r) => { r.v = 99; }],
    ];
    for (const [label, damage] of cases) {
      const raw = viaJson(good);
      damage(raw);
      expect(validateRawTile(raw).ok, label).toBe(false);
    }
    expect(validateRawTile(null).ok).toBe(false);
    expect(validateRawTile(viaJson(good)).ok).toBe(true);
  });

  it('validateTile détecte les violations d’invariants', () => {
    const cases: [string, (t: Tile) => void][] = [
      ['anneau extérieur horaire', (t) => { t.buildings[0].outer = f32(reverseRing(Array.from(t.buildings[0].outer))); }],
      ['trou antihoraire', (t) => { t.buildings[0].holes[0] = f32(reverseRing(Array.from(t.buildings[0].holes[0]))); }],
      ['hauteur nulle', (t) => { t.buildings[1].height = 0; }],
      ['niveaux nuls', (t) => { t.buildings[1].levels = 0; }],
      ['identifiant de bâtiment en double', (t) => { t.buildings[1].id = t.buildings[0].id; }],
      ['bâtiment centré hors de la tuile', (t) => { t.buildings[2].outer = f32(rect(OX - 40, OZ + 10, OX + 10, OZ + 30)); }],
      ['arbre hors de la tuile', (t) => { t.trees.x[1] = OX + 600; }],
      ['mobilier hors de la tuile', (t) => { t.furniture[0].z = OZ - 1; }],
      ['commerce loin de la façade', (t) => { t.shops[0].z = OZ + 48; }],
      ['identifiant de commerce en double', (t) => { t.shops[1].id = t.shops[0].id; }],
      ['arêtes non croissantes', (t) => { t.roadEdges = [17, 3]; }],
      ['barrière réduite à un point', (t) => { t.barriers[0].points = f32([OX + 1, OZ + 1]); }],
      ['station sans nom', (t) => { t.metroEntrances[0].name = ''; }],
      ['surface à moins de 3 sommets', (t) => { t.surfaces[0].outer = f32([OX, OZ, OX + 5, OZ]); }],
    ];
    for (const [label, damage] of cases) {
      const t = decodeTile(encodeTile(sampleTile()));
      damage(t);
      expect(validateTile(t).ok, label).toBe(false);
    }
  });

  it('plafonne le nombre de messages sans perdre le compte', () => {
    const t = createEmptyTile(0, 0);
    const trees = [];
    for (let i = 0; i < 450; i++) trees.push({ x: 10, z: 10, height: -1, crownRadius: 3 });
    t.trees = treeSetFromList(trees);
    const check = validateTile(t);
    expect(check.ok).toBe(false);
    expect(check.errors.length).toBe(201);
    expect(check.errors[200]).toContain('250 autre(s)');
  });

  it('contrôle les références vers le graphe et les monuments quand le contexte est fourni', () => {
    const t = decodeTile(encodeTile(sampleTile()));
    expect(validateTile(t, { edgeCount: 300, nodeCount: 20, landmarkKeys: new Set(['dome_essai']) }).ok).toBe(true);
    expect(validateTile(t, { edgeCount: 100 }).ok).toBe(false);
    expect(validateTile(t, { nodeCount: 5 }).ok).toBe(false);
    expect(validateTile(t, { landmarkKeys: new Set(['autre']) }).ok).toBe(false);
  });

  it('avertit sans bloquer pour les données douteuses', () => {
    const t = decodeTile(encodeTile(sampleTile()));
    t.shops[0].heading = Math.PI; // vitrine tournée vers l'intérieur du bâtiment
    t.shops[1].buildingId = 0;
    t.surfaces[1].outer = f32(rect(OX + 200, OZ + 200, OX + 700, OZ + 280)); // déborde de 188 m
    const check = validateTile(t);
    expect(check.ok).toBe(true);
    expect(check.warnings.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Graphe routier
// ─────────────────────────────────────────────────────────────────────────────────────

function sampleGraph(): { nodes: RoadNodeInput[]; edges: RoadEdgeInput[] } {
  const nodes: RoadNodeInput[] = [
    { x: 0, z: 0, signal: true, crossing: true, boundary: false },
    { x: 600, z: 0, signal: false, crossing: false, boundary: true },
    { x: 600.04, z: -250.37, signal: false, crossing: true, boundary: false },
    { x: -80, z: 40, signal: false, crossing: false, boundary: false },
  ];
  const base = { tunnel: false, landmarkKey: '', lanesForward: 1, lanesBackward: 1, oneway: false, bridge: false, pedestrianOnly: false };
  const edges: RoadEdgeInput[] = [
    { ...base, a: 0, b: 1, points: [0, 0, 300, 20, 600, 0], width: 10.5, lanesForward: 3, lanesBackward: 0, oneway: true, roadClass: 'primary', name: "Avenue de l'Essai", surface: 'asphalt', speedLimit: 50 / 3.6, sidewalk: 7.5 },
    { ...base, a: 1, b: 2, points: [600, 0, 600.04, -250.37], width: 7, roadClass: 'tertiary', name: 'Rue du Moulin', surface: 'sett', speedLimit: 30 / 3.6, sidewalk: 2.5 },
    { ...base, a: 2, b: 0, points: [600.04, -250.37, 400, -260, 200, -200, 100, -80, 0, 0], width: 8, roadClass: 'secondary', name: "Pont de l'Essai", surface: 'asphalt', speedLimit: 30 / 3.6, sidewalk: 3, bridge: true, landmarkKey: 'pont_essai' },
    { ...base, a: 0, b: 3, points: [0, 0, -80, 40], width: 4, lanesForward: 0, lanesBackward: 0, roadClass: 'footway', name: '', surface: 'gravel', speedLimit: 10 / 3.6, sidewalk: 0, pedestrianOnly: true },
  ];
  return { nodes, edges };
}

describe('graphe routier', () => {
  it('fait un aller-retour fidèle et calcule adjacence et longueurs', () => {
    const source = sampleGraph();
    expect(validateRoadGraph(source)).toEqual({ ok: true, errors: [], warnings: [] });
    const raw = encodeRoadGraph(source);
    for (const n of allNumbers(raw)) expect(Number.isInteger(n)).toBe(true);
    const g = decodeRoadGraph(viaJson(raw));
    expect(g.version).toBe(FORMAT_VERSION);
    expect(g.nodes.length).toBe(4);
    expect(g.edges.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expectCoordsClose([g.nodes[i].x, g.nodes[i].z], [source.nodes[i].x, source.nodes[i].z]);
      expect([g.nodes[i].signal, g.nodes[i].crossing, g.nodes[i].boundary]).toEqual([source.nodes[i].signal, source.nodes[i].crossing, source.nodes[i].boundary]);
    }
    for (let e = 0; e < 4; e++) {
      const a = g.edges[e], s = source.edges[e];
      expect(a.points).toBeInstanceOf(Float32Array);
      expectCoordsClose(a.points, s.points);
      expect([a.a, a.b, a.lanesForward, a.lanesBackward, a.oneway, a.roadClass, a.name, a.bridge, a.tunnel, a.surface, a.pedestrianOnly, a.landmarkKey]).toEqual(
        [s.a, s.b, s.lanesForward, s.lanesBackward, s.oneway, s.roadClass, s.name, s.bridge, s.tunnel, s.surface, s.pedestrianOnly, s.landmarkKey],
      );
      expect(a.width).toBeCloseTo(s.width, 6);
      expect(a.sidewalk).toBeCloseTo(s.sidewalk, 6);
      expect(a.speedLimit).toBeCloseTo(s.speedLimit, 6);
      expect(a.length).toBeCloseTo(polylineLength(a.points), 6);
      // Les extrémités de la polyligne sont exactement les nœuds.
      expect([a.points[0], a.points[1]]).toEqual([Math.fround(g.nodes[a.a].x), Math.fround(g.nodes[a.a].z)]);
      expect([a.points[a.points.length - 2], a.points[a.points.length - 1]]).toEqual([Math.fround(g.nodes[a.b].x), Math.fround(g.nodes[a.b].z)]);
    }
    expect(g.edges[0].length).toBeCloseTo(2 * Math.hypot(300, 20), 3);
    expect(g.nodes.map((n) => n.edges)).toEqual([[0, 2, 3], [0, 1], [1, 2], [3]]);
    expect(validateRoadGraph(g)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('est idempotent', () => {
    const raw = encodeRoadGraph(sampleGraph());
    expect(encodeRoadGraph(decodeRoadGraph(viaJson(raw)))).toEqual(raw);
  });

  it('refuse les graphes incohérents', () => {
    const g = sampleGraph();
    (g.edges[0].points as number[])[0] = 5; // la polyligne ne part plus du nœud a
    expect(() => encodeRoadGraph(g)).toThrow(/extrémités/);
    expect(validateRoadGraph(g).ok).toBe(false);
    const h = sampleGraph();
    h.edges[1].b = 9;
    expect(() => encodeRoadGraph(h)).toThrow();
    expect(validateRoadGraph(h).ok).toBe(false);
    const k = sampleGraph();
    k.edges[0].lanesBackward = 1; // sens unique avec une voie à contresens
    expect(validateRoadGraph(k).ok).toBe(false);
    expect(() => decodeRoadGraph({ ...encodeRoadGraph(sampleGraph()), v: 0 })).toThrow(/version/);
  });

  it('compte les composantes connexes et indexe les noms', () => {
    const g = sampleGraph();
    expect(roadGraphComponents(g).count).toBe(1);
    g.nodes.push({ x: 2000, z: 2000, signal: false, crossing: false, boundary: false }, { x: 2100, z: 2000, signal: false, crossing: false, boundary: false });
    g.edges.push({ ...g.edges[1], a: 4, b: 5, points: [2000, 2000, 2100, 2000] });
    const comp = roadGraphComponents(g);
    expect(comp.count).toBe(2);
    expect(Array.from(comp.labels)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(validateRoadGraph(g).warnings.some((w) => w.includes('2 composantes'))).toBe(true);
    expect(edgesByName(g).get('Rue du Moulin')).toEqual([1, 4]);
    expect(edgesByName(g).has('')).toBe(false);
  });

  it('rattache chaque arête aux tuiles qu’elle traverse, emprise comprise', () => {
    const refs = computeTileEdgeRefs(decodeRoadGraph(encodeRoadGraph(sampleGraph())));
    // Arête 0 : de (0, 0) à (600, 0) en passant par z = 20 ; emprise de 12,75 m de part et d'autre.
    expect(refs.get('0_0')).toContain(0);
    expect(refs.get('1_0')).toContain(0);
    expect(refs.get('0_-1')).toContain(0); // l'emprise déborde au nord de z = 0
    expect(refs.get('-1_0')).toContain(0); // et à l'ouest de x = 0
    // Arête 3 : allée de (0, 0) à (-80, 40), tuile (-1, 0) ; 2 m d'emprise autour de l'origine.
    expect(refs.get('-1_0')).toContain(3);
    expect(refs.get('0_0')).toContain(3);
    expect(refs.get('1_0')).not.toContain(3);
    // Arête 1 : x ≈ 600, de z = 0 à z = -250 : tuiles (1, -1) et, par son emprise, (1, 0).
    expect(refs.get('1_-1')).toContain(1);
    expect(refs.get('0_-1')).not.toContain(1);
    for (const list of refs.values()) expect(list).toEqual([...new Set(list)].sort((p, q) => p - q));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Relief
// ─────────────────────────────────────────────────────────────────────────────────────

describe('relief', () => {
  it('interpole bilinéairement entre les 4 nœuds voisins', () => {
    const t = decodeTerrain({ v: FORMAT_VERSION, x0: 100, z0: -50, step: 10, nx: 2, nz: 2, scale: 0.1, h: [0, 100, -60, 160] });
    // Nœuds : (100,-50)=0  (110,-50)=10  (100,-40)=4  (110,-40)=20.
    expect(Array.from(t.heights)).toEqual([0, 10, 4, 20].map(Math.fround));
    expect(sampleTerrain(t, 100, -50)).toBeCloseTo(0, 5);
    expect(sampleTerrain(t, 110, -50)).toBeCloseTo(10, 5);
    expect(sampleTerrain(t, 100, -40)).toBeCloseTo(4, 5);
    expect(sampleTerrain(t, 110, -40)).toBeCloseTo(20, 5);
    expect(sampleTerrain(t, 105, -50)).toBeCloseTo(5, 5);
    expect(sampleTerrain(t, 100, -45)).toBeCloseTo(2, 5);
    expect(sampleTerrain(t, 105, -45)).toBeCloseTo((0 + 10 + 4 + 20) / 4, 5);
    expect(sampleTerrain(t, 102.5, -42.5)).toBeCloseTo(0.75 * 0.25 * 0 + 0.25 * 0.25 * 10 + 0.75 * 0.75 * 4 + 0.25 * 0.75 * 20, 5);
    expect([t.minY, t.maxY]).toEqual([0, 20]);
  });

  it('restitue exactement un plan incliné et borne hors de la grille', () => {
    const plane = (x: number, z: number): number => 0.01 * x - 0.02 * z + 3;
    const t = terrainFromFunction(-64, -32, 16, 9, 5, plane);
    for (const [x, z] of [[-64, -32], [0, 0], [13.7, -5.2], [63.9, 31.9], [-20.5, 17.25]]) {
      expect(sampleTerrain(t, x, z)).toBeCloseTo(plane(x, z), 4);
    }
    // Hors de la grille : la valeur du bord le plus proche.
    expect(sampleTerrain(t, -1000, 0)).toBeCloseTo(plane(-64, 0), 4);
    expect(sampleTerrain(t, 1000, 1000)).toBeCloseTo(plane(64, 32), 4);
    expect(sampleTerrain(t, 10, -500)).toBeCloseTo(plane(10, -32), 4);
  });

  it('fait un aller-retour au décimètre, en entiers codés en deltas', () => {
    const t = terrainFromFunction(-528, -528, 16, 67, 67, (x, z) => 6 * Math.sin(x / 200) * Math.cos(z / 170) - 0.01 * z);
    const raw = encodeTerrain(t);
    expect(raw.h.length).toBe(67 * 67);
    for (const n of raw.h) expect(Number.isInteger(n)).toBe(true);
    // Deltas : la plupart des valeurs tiennent sur un chiffre.
    expect(raw.h.filter((n) => Math.abs(n) <= 9).length).toBeGreaterThan(raw.h.length * 0.95);
    const d = decodeTerrain(viaJson(raw));
    expect([d.x0, d.z0, d.step, d.nx, d.nz]).toEqual([-528, -528, 16, 67, 67]);
    expectCoordsClose(d.heights, t.heights);
    expect(d.minY).toBeCloseTo(Math.min(...d.heights), 6);
    expect(d.maxY).toBeCloseTo(Math.max(...d.heights), 6);
    expect(encodeTerrain(d)).toEqual(raw);
    expect(validateTerrain(d).ok).toBe(true);
    // Échelle plus fine au choix.
    const fine = decodeTerrain(encodeTerrain(t, 0.01));
    expectCoordsClose(fine.heights, t.heights, 0.00501);
  });

  it('refuse les grilles incohérentes', () => {
    expect(() => encodeTerrain({ x0: 0, z0: 0, step: 16, nx: 3, nz: 3, heights: [1, 2, 3] })).toThrow();
    expect(() => decodeTerrain({ v: FORMAT_VERSION, x0: 0, z0: 0, step: 16, nx: 2, nz: 2, scale: 0.1, h: [1, 2, 3] })).toThrow();
    expect(() => decodeTerrain({ v: 7, x0: 0, z0: 0, step: 16, nx: 1, nz: 1, scale: 0.1, h: [1] })).toThrow(/version/);
    expect(validateTerrain({ x0: 0, z0: 0, step: 0, nx: 2, nz: 2, heights: [0, 0, 0, 0] }).ok).toBe(false);
    // y = 0 est attendu à l'origine quand la grille la couvre.
    const offset = terrainFromFunction(-16, -16, 16, 3, 3, () => 12);
    expect(validateTerrain(offset).warnings.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Lieux, monuments, manifeste
// ─────────────────────────────────────────────────────────────────────────────────────

describe('lieux, monuments et manifeste', () => {
  const places: Place[] = [
    { name: "Place de l'Essai", kind: 'square', x: 0, z: 0, radius: 60, importance: 3, ref: '' },
    { name: 'Rond-Point', kind: 'station', x: -1920.3, z: -907.2, radius: 40, importance: 2, ref: '1;7' },
    { name: 'Rue du Moulin', kind: 'street', x: 12.34, z: -56.78, radius: 400, importance: 1, ref: '' },
  ];
  const landmarks: Landmark[] = [
    { key: 'monument_essai', name: "Colonne de l'Essai", x: 0, z: 0, y: 0, heading: 0, height: 32, footprint: f32(rect(-4, -4, 4, 4)) },
    { key: 'arc_essai', name: "Arc de l'Essai", x: -1920.3, z: -907.2, y: 24.3, heading: 2.1, height: 49.5, footprint: f32(rect(-1942.8, -918.3, -1897.8, -896.1)) },
  ];

  it('fait un aller-retour des lieux', () => {
    const raw = encodePlaces(places);
    const d = decodePlaces(viaJson(raw));
    expect(d.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect([d[i].name, d[i].kind, d[i].radius, d[i].importance, d[i].ref]).toEqual([places[i].name, places[i].kind, places[i].radius, places[i].importance, places[i].ref]);
      expectCoordsClose([d[i].x, d[i].z], [places[i].x, places[i].z]);
    }
    expect(encodePlaces(d)).toEqual(raw);
    expect(validatePlaces(d)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(validatePlaces([{ ...places[0], importance: 7 }]).ok).toBe(false);
    expect(decodePlaces(encodePlaces([]))).toEqual([]);
  });

  it('fait un aller-retour des monuments', () => {
    const raw = encodeLandmarks(landmarks);
    const d = decodeLandmarks(viaJson(raw));
    expect(d.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect([d[i].key, d[i].name]).toEqual([landmarks[i].key, landmarks[i].name]);
      expectCoordsClose([d[i].x, d[i].z, d[i].y, d[i].height], [landmarks[i].x, landmarks[i].z, landmarks[i].y, landmarks[i].height]);
      expect(angleGap(d[i].heading, landmarks[i].heading)).toBeLessThan((Math.PI * 2) / ANGLE_UNITS);
      expectCoordsClose(d[i].footprint, landmarks[i].footprint);
      expect(ringIsCCW(d[i].footprint)).toBe(true);
    }
    expect(encodeLandmarks(d)).toEqual(raw);
    expect(validateLandmarks(d)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(validateLandmarks([landmarks[0], landmarks[0]]).ok).toBe(false);
    expect(validateLandmarks([{ ...landmarks[0], key: 'Clé Bizarre' }]).warnings.length).toBe(1);
    expect(() => encodeLandmarks([{ ...landmarks[0], footprint: [0, 0, 1, 1] }])).toThrow();
  });

  it('fabrique et contrôle le manifeste de Paris', () => {
    const tiles = tilesCoveringBounds(boundsOfBbox(PARIS_BBOX));
    const m = createManifest({
      name: 'paris',
      tiles,
      generatedAt: '2026-11-15T00:00:00Z',
      waterLevel: -7.5,
      attribution: [{ source: 'OpenStreetMap', license: 'ODbL 1.0', text: '© les contributeurs d’OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
    });
    expect(m.format).toBe(FORMAT_NAME);
    expect(m.version).toBe(FORMAT_VERSION);
    expect(m.tileSize).toBe(512);
    expect(m.origin).toEqual({ lat: 48.865633, lon: 2.321236 });
    expect(m.bbox).toEqual({ west: 2.285, south: 48.85, east: 2.3725, north: 48.878 });
    expect(m.tiles.length).toBe(98);
    expect(m.tiles[0]).toEqual({ tx: -6, tz: -3, file: 'tiles/t_-6_-3.json' });
    expect(m.files).toEqual({ roadGraph: 'roadgraph.json', places: 'places.json', landmarks: 'landmarks.json', terrain: 'terrain.json' });
    expect(MAP_FILES.manifest).toBe('manifest.json');
    expect(validateManifest(m)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(parseManifest(viaJson(m))).toEqual(m);
  });

  it('refuse un manifeste étranger, trop récent ou sans attribution', () => {
    const m = createManifest({ name: 'paris', tiles: [{ tx: 0, tz: 0 }], attribution: [{ source: 's', license: 'l', text: 't' }] });
    expect(() => parseManifest({ ...m, version: FORMAT_VERSION + 1 })).toThrow(/version/);
    expect(() => parseManifest({ ...m, format: 'autre' })).toThrow();
    expect(() => parseManifest({ ...m, tileSize: 256 })).toThrow();
    expect(() => parseManifest({ ...m, attribution: [] })).toThrow(/attribution/);
    expect(() => parseManifest({ ...m, tiles: [{ tx: 0, tz: 0, file: 'a' }, { tx: 0, tz: 0, file: 'b' }] })).toThrow();
    expect(() => parseManifest('manifest')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Quartier d'essai
// ─────────────────────────────────────────────────────────────────────────────────────

describe("quartier d'essai", () => {
  const raw = generateTestDistrict();
  const data: MapData = decodeMapData(raw);
  const graph: RoadGraph = data.roadGraph;
  const allBuildings = data.tiles.flatMap((t) => t.buildings);
  const allSurfaces = data.tiles.flatMap((t) => t.surfaces);
  const allBarriers = data.tiles.flatMap((t) => t.barriers);
  const allFurniture = data.tiles.flatMap((t) => t.furniture);
  const allShops = data.tiles.flatMap((t) => t.shops);
  const allSignals = data.tiles.flatMap((t) => t.signals);
  const allTrees = data.tiles.flatMap((t) => Array.from({ length: t.trees.count }, (_, i) => ({ x: t.trees.x[i], z: t.trees.z[i], height: t.trees.height[i], crownRadius: t.trees.crownRadius[i] })));
  const H = TEST_DISTRICT.halfSize;

  it('est déterministe et dépend de la graine', () => {
    const a = JSON.stringify(generateTestDistrict({ seed: 7 }));
    expect(JSON.stringify(generateTestDistrict({ seed: 7 }))).toBe(a);
    expect(JSON.stringify(generateTestDistrict({ seed: 8 }))).not.toBe(a);
    expect(JSON.stringify(generateTestDistrict())).toBe(JSON.stringify(raw));
    expect(JSON.stringify(generateTestDistrict({ seed: 1 }))).toBe(JSON.stringify(raw));
  });

  it("a exactement l'arborescence et le format de la vraie carte", () => {
    expect(raw.manifest.name).toBe('test-district');
    expect(raw.manifest.format).toBe(FORMAT_NAME);
    expect(raw.manifest.version).toBe(FORMAT_VERSION);
    expect(raw.manifest.bounds).toEqual({ minX: -H, minZ: -H, maxX: H, maxZ: H });
    expect(raw.manifest.attribution.length).toBeGreaterThan(0);
    const files = mapDataFiles(raw);
    expect(files.map((f) => f.path)).toEqual([
      'manifest.json', 'roadgraph.json', 'places.json', 'landmarks.json', 'terrain.json',
      'tiles/t_-1_-1.json', 'tiles/t_0_-1.json', 'tiles/t_-1_0.json', 'tiles/t_0_0.json',
    ]);
    // Tout est du JSON pur : un passage par le texte ne change rien au décodage.
    const reread = decodeMapData(viaJson(raw));
    expect(reread).toEqual(data);
    // Le quartier reste petit : moins de 300 ko au total.
    const bytes = files.reduce((sum, f) => sum + JSON.stringify(f.data).length, 0);
    expect(bytes).toBeLessThan(300_000);
    // Quartier d'environ 1 km × 1 km centré sur l'origine.
    const lon = raw.manifest.bbox.east - raw.manifest.bbox.west, lat = raw.manifest.bbox.north - raw.manifest.bbox.south;
    expect(lon * 73305).toBeCloseTo(1024, 6);
    expect(lat * 111214).toBeCloseTo(1024, 6);
  });

  it('passe validateRawTile et validateTile sur chaque tuile, sans erreur ni avertissement', () => {
    expect(raw.tiles.length).toBe(4);
    const ctx = { edgeCount: graph.edges.length, nodeCount: graph.nodes.length, landmarkKeys: new Set(data.landmarks.map((l) => l.key)) };
    for (let i = 0; i < raw.tiles.length; i++) {
      expect(validateRawTile(raw.tiles[i])).toEqual({ ok: true, errors: [], warnings: [] });
      const tile = decodeTile(raw.tiles[i]);
      expect(validateTile(tile)).toEqual({ ok: true, errors: [], warnings: [] });
      expect(validateTile(tile, ctx)).toEqual({ ok: true, errors: [], warnings: [] });
      // Aller-retour : réencoder la tuile décodée redonne exactement le fichier.
      expect(encodeTile(tile)).toEqual(raw.tiles[i]);
    }
  });

  it('passe le contrôle de la carte entière et se réencode à l’identique', () => {
    expect(validateManifest(raw.manifest)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(validateMapData(data)).toEqual({ ok: true, errors: [], warnings: [] });
    const again = encodeMapData(data);
    expect(again.roadGraph).toEqual(raw.roadGraph);
    expect(again.places).toEqual(raw.places);
    expect(again.landmarks).toEqual(raw.landmarks);
    expect(again.terrain).toEqual(raw.terrain);
    expect(again.tiles).toEqual(raw.tiles);
  });

  it('validateMapData détecte les références croisées cassées', () => {
    const broken = decodeMapData(viaJson(raw));
    broken.tiles[0].roadEdges = broken.tiles[0].roadEdges.slice(1); // une arête traverse la tuile sans y être référencée
    broken.tiles[1].shops[0].buildingId = 123456789; // bâtiment inexistant
    broken.tiles[2].buildings[0].id = broken.tiles[3].buildings[0].id; // identifiant présent dans deux tuiles
    broken.landmarks.length = 0; // le monument référencé par un bâtiment n'existe plus
    const check = validateMapData(broken);
    expect(check.ok).toBe(false);
    expect(check.errors.some((e) => e.includes('sans y être référencée'))).toBe(true);
    expect(check.errors.some((e) => e.includes('introuvable'))).toBe(true);
    expect(check.errors.some((e) => e.includes('plusieurs tuiles'))).toBe(true);
    expect(check.errors.some((e) => e.includes('absent de landmarks.json'))).toBe(true);
  });

  it('a un graphe routier connexe', () => {
    expect(graph.nodes.length).toBeGreaterThan(80);
    expect(graph.edges.length).toBeGreaterThan(120);
    expect(roadGraphComponents(graph).count).toBe(1);
    for (const n of graph.nodes) expect(n.edges.length).toBeGreaterThan(0);
    expect(validateRoadGraph(graph)).toEqual({ ok: true, errors: [], warnings: [] });
    // Parcours explicite depuis le nœud 0, sens de circulation ignorés : tout est atteint.
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const n = queue.pop() as number;
      for (const e of graph.nodes[n].edges) {
        const other = graph.edges[e].a === n ? graph.edges[e].b : graph.edges[e].a;
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    expect(seen.size).toBe(graph.nodes.length);
  });

  it('reste connexe pour les véhicules en respectant les sens uniques', () => {
    // Depuis un carrefour intérieur, on atteint tout nœud intérieur et on en revient (hors rue piétonne).
    const reach = (start: number, backward: boolean): Set<number> => {
      const seen = new Set<number>([start]);
      const queue = [start];
      while (queue.length > 0) {
        const n = queue.pop() as number;
        for (const e of graph.nodes[n].edges) {
          const ed = graph.edges[e];
          if (ed.pedestrianOnly) continue;
          const from = backward ? ed.b : ed.a, to = backward ? ed.a : ed.b;
          let next = -1;
          if (from === n) next = to;
          else if (!ed.oneway) next = from;
          if (next >= 0 && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      return seen;
    };
    const start = graph.nodes.findIndex((n) => !n.boundary && n.signal);
    const forward = reach(start, false), backward = reach(start, true);
    for (let i = 0; i < graph.nodes.length; i++) {
      if (graph.nodes[i].boundary) continue;
      expect(forward.has(i), `nœud ${i} inaccessible`).toBe(true);
      expect(backward.has(i), `nœud ${i} sans retour`).toBe(true);
    }
    const boundary = graph.nodes.filter((n) => n.boundary);
    expect(boundary.length).toBeGreaterThanOrEqual(20);
    for (const n of boundary) expect(Math.max(Math.abs(n.x), Math.abs(n.z))).toBe(H);
  });

  it('référence dans chaque tuile les arêtes qui la traversent', () => {
    const refs = computeTileEdgeRefs(graph);
    for (const t of data.tiles) {
      expect(t.roadEdges).toEqual(refs.get(tileKey(t.tx, t.tz)));
      expect(t.roadEdges.length).toBeGreaterThan(30);
    }
    // Une arête de l'avenue qui franchit x = 0... n'existe pas (la place l'interrompt) ; l'anneau, lui, est partagé.
    const ring = edgesByName(graph).get(TEST_DISTRICT.plazaName) ?? [];
    expect(ring.length).toBe(6);
    for (const t of data.tiles) expect(ring.some((e) => t.roadEdges.includes(e))).toBe(true);
  });

  it('a une avenue de 40 m entre façades, à deux chaussées et terre-plein', () => {
    const avenue = (edgesByName(graph).get(TEST_DISTRICT.avenueName) ?? []).map((e) => graph.edges[e]);
    expect(avenue.length).toBeGreaterThanOrEqual(16);
    for (const ed of avenue) {
      expect(ed.oneway).toBe(true);
      expect(ed.roadClass).toBe('primary');
      expect(ed.width).toBe(10.5);
      expect([ed.lanesForward, ed.lanesBackward]).toEqual([3, 0]);
      const z = ed.points[1];
      expect(Math.abs(Math.abs(z) - TEST_DISTRICT.avenueLaneOffset)).toBeLessThanOrEqual(0.06);
      // Circulation à droite : la chaussée nord roule vers l'ouest, la chaussée sud vers l'est.
      const dx = ed.points[ed.points.length - 2] - ed.points[0];
      expect(Math.sign(dx)).toBe(z < 0 ? -1 : 1);
      // Chaussée + trottoir + demi-terre-plein = demi-largeur de l'avenue.
      expect(TEST_DISTRICT.medianHalfWidth + ed.width + ed.sidewalk).toBe(TEST_DISTRICT.avenueWidth / 2);
    }
    // Façades : de part et d'autre, les immeubles s'arrêtent exactement à 20 m de l'axe.
    let north = -Infinity, south = Infinity;
    for (const b of allBuildings) {
      for (let i = 0; i < b.outer.length; i += 2) {
        const x = b.outer[i], z = b.outer[i + 1];
        if (Math.abs(x) < 80) continue; // hors de la place
        if (z < 0) north = Math.max(north, z);
        else south = Math.min(south, z);
      }
    }
    expect(south - north).toBeCloseTo(TEST_DISTRICT.avenueWidth, 4);
    const medians = allSurfaces.filter((s) => s.kind === 'median');
    expect(medians.length).toBeGreaterThanOrEqual(8);
    for (const m of medians) {
      const b = ringBounds(m.outer);
      expect(b.minZ).toBeGreaterThanOrEqual(-TEST_DISTRICT.medianHalfWidth);
      expect(b.maxZ).toBeLessThanOrEqual(TEST_DISTRICT.medianHalfWidth);
    }
  });

  it('a des rues de 10 à 14 m entre façades', () => {
    const totals = new Set<number>();
    for (const ed of graph.edges) {
      if (ed.roadClass === 'primary' || ed.pedestrianOnly || ed.bridge) continue;
      if (ed.name === TEST_DISTRICT.quayNorthName || ed.name === TEST_DISTRICT.quaySouthName) continue;
      const total = ed.width + 2 * ed.sidewalk;
      expect(total).toBeGreaterThanOrEqual(10);
      expect(total).toBeLessThanOrEqual(14);
      totals.add(total);
    }
    expect([...totals].sort((a, b) => a - b)).toEqual([10, 12, 14]);
    expect(graph.edges.some((e) => e.surface === 'sett')).toBe(true);
    const market = graph.edges.filter((e) => e.pedestrianOnly);
    expect(market.length).toBe(1);
    expect(market[0].name).toBe(TEST_DISTRICT.pedestrianStreetName);
    expect([market[0].lanesForward, market[0].lanesBackward, market[0].roadClass]).toEqual([0, 0, 'pedestrian']);
    expect(allSurfaces.some((s) => s.kind === 'pedestrian' && s.name === TEST_DISTRICT.pedestrianStreetName)).toBe(true);
  });

  it('a une place ronde à sens giratoire, avec un monument fictif en son centre', () => {
    const ring = (edgesByName(graph).get(TEST_DISTRICT.plazaName) ?? []).map((e) => graph.edges[e]);
    expect(ring.length).toBe(6);
    let turn = 0;
    for (const ed of ring) {
      expect(ed.oneway).toBe(true);
      for (let i = 0; i < ed.points.length; i += 2) {
        expect(Math.abs(Math.hypot(ed.points[i], ed.points[i + 1]) - TEST_DISTRICT.plazaRingRadius)).toBeLessThan(0.12);
      }
      // Sens antihoraire vu de dessus : l'aire balayée depuis le centre est positive.
      turn += ringSignedArea([0, 0, ...Array.from(ed.points)]);
    }
    expect(turn).toBeCloseTo(Math.PI * TEST_DISTRICT.plazaRingRadius ** 2, -2);
    // Les six arcs se suivent et se referment.
    const next = new Map(ring.map((ed) => [ed.a, ed.b]));
    let node = ring[0].a;
    for (let i = 0; i < 6; i++) node = next.get(node) as number;
    expect(node).toBe(ring[0].a);

    expect(data.landmarks.length).toBe(1);
    const lm = data.landmarks[0];
    expect([lm.key, lm.name, lm.x, lm.z]).toEqual([TEST_DISTRICT.landmarkKey, TEST_DISTRICT.landmarkName, 0, 0]);
    expect(lm.height).toBeGreaterThan(20);
    expect(pointInRing(lm.footprint, 0, 0)).toBe(true);
    const replaced = allBuildings.filter((b) => b.landmarkKey !== '');
    expect(replaced.length).toBe(1);
    expect(replaced[0].landmarkKey).toBe(lm.key);
    expect(pointInRing(replaced[0].outer, 0, 0)).toBe(true);
    // L'îlot central est une surface « plaza » nommée, découpée entre les 4 tuiles.
    const island = allSurfaces.filter((s) => s.kind === 'plaza' && s.name === TEST_DISTRICT.plazaName);
    expect(island.length).toBe(4);
    const area = island.reduce((sum, s) => sum + ringSignedArea(s.outer), 0);
    expect(area).toBeGreaterThan(0.98 * Math.PI * TEST_DISTRICT.plazaIslandRadius ** 2 * (Math.sin(Math.PI / 16) / (Math.PI / 16)) * Math.cos(Math.PI / 16));
    expect(area).toBeLessThan(Math.PI * TEST_DISTRICT.plazaIslandRadius ** 2);
    // Aucun immeuble n'empiète sur la place.
    for (const b of allBuildings) {
      if (b.landmarkKey !== '') continue;
      for (let i = 0; i < b.outer.length; i += 2) expect(Math.hypot(b.outer[i], b.outer[i + 1])).toBeGreaterThan(TEST_DISTRICT.plazaFacadeRadius - 0.1);
    }
    expect(data.places.some((p) => p.kind === 'square' && p.name === TEST_DISTRICT.plazaName)).toBe(true);
    expect(data.places.some((p) => p.kind === 'monument' && p.name === TEST_DISTRICT.landmarkName)).toBe(true);
  });

  it('a un fleuve, un pont et des quais', () => {
    const river = allSurfaces.filter((s) => s.kind === 'water' && s.name === TEST_DISTRICT.riverName);
    expect(river.length).toBe(2); // découpé à la limite de tuile x = 0
    const area = river.reduce((sum, s) => sum + ringSignedArea(s.outer), 0);
    expect(area).toBeCloseTo(2 * H * (TEST_DISTRICT.riverSouth - TEST_DISTRICT.riverNorth), 3);
    for (const s of river) {
      expect(s.level).toBe(data.manifest.waterLevel);
      // L'eau est en contrebas des quais.
      expect(sampleTerrain(data.terrain, 0, TEST_DISTRICT.riverNorth) - (s.level as number)).toBeGreaterThan(2);
    }
    const bridges = graph.edges.filter((e) => e.bridge);
    expect(bridges.length).toBe(1);
    expect(bridges[0].name).toBe(TEST_DISTRICT.bridgeName);
    expect(Array.from(bridges[0].points)).toEqual([0, TEST_DISTRICT.riverNorth, 0, TEST_DISTRICT.riverSouth]);
    // Aucune autre arête ne franchit le fleuve.
    for (const ed of graph.edges) {
      if (ed.bridge) continue;
      for (let i = 1; i < ed.points.length; i += 2) expect(ed.points[i] > TEST_DISTRICT.riverNorth && ed.points[i] < TEST_DISTRICT.riverSouth).toBe(false);
    }
    const walls = allBarriers.filter((b) => b.kind === 'quay_wall');
    expect(walls.length).toBe(4);
    for (const w of walls) {
      expect(w.height).toBeGreaterThan(2);
      expect([TEST_DISTRICT.riverNorth, TEST_DISTRICT.riverSouth]).toContain(w.points[1]);
    }
    expect(allBarriers.filter((b) => b.kind === 'railing').length).toBe(2);
    for (const name of [TEST_DISTRICT.quayNorthName, TEST_DISTRICT.quaySouthName]) {
      expect((edgesByName(graph).get(name) ?? []).length).toBeGreaterThanOrEqual(8);
      expect(data.places.some((p) => p.kind === 'quay' && p.name === name)).toBe(true);
    }
    expect(data.places.some((p) => p.kind === 'bridge' && p.name === TEST_DISTRICT.bridgeName)).toBe(true);
    // Aucun bâtiment, arbre ni commerce dans le fleuve.
    for (const b of allBuildings) for (let i = 1; i < b.outer.length; i += 2) expect(b.outer[i] > TEST_DISTRICT.riverNorth && b.outer[i] < TEST_DISTRICT.riverSouth).toBe(false);
    for (const t of allTrees) expect(t.z > TEST_DISTRICT.riverNorth && t.z < TEST_DISTRICT.riverSouth).toBe(false);
  });

  it('a un jardin clos de grilles', () => {
    const g = TEST_DISTRICT.gardenBounds;
    const garden = allSurfaces.filter((s) => s.kind === 'garden' && s.name === TEST_DISTRICT.gardenName);
    expect(garden.length).toBe(1);
    expect(ringBounds(garden[0].outer)).toEqual(g);
    expect(garden[0].holes.length).toBe(1); // le bassin
    const inGarden = (x: number, z: number): boolean => x > g.minX && x < g.maxX && z > g.minZ && z < g.maxZ;
    // Grilles et portails forment une boucle fermée : chaque extrémité en rejoint exactement une autre.
    const fences = allBarriers.filter((b) => (b.kind === 'fence' || b.kind === 'gate') && inGarden(b.points[0], b.points[1]));
    expect(fences.filter((b) => b.kind === 'gate').length).toBe(2);
    const ends = new Map<string, number>();
    let length = 0;
    for (const b of fences) {
      const n = b.points.length;
      for (const key of [`${b.points[0]}_${b.points[1]}`, `${b.points[n - 2]}_${b.points[n - 1]}`]) ends.set(key, (ends.get(key) ?? 0) + 1);
      length += polylineLength(b.points);
      expect(b.height).toBeGreaterThanOrEqual(2);
    }
    expect(ends.size).toBe(4);
    for (const count of ends.values()) expect(count).toBe(2);
    expect(length).toBeCloseTo(2 * (g.maxX - g.minX - 1 + (g.maxZ - g.minZ - 1)), 3);
    expect(allBarriers.some((b) => b.kind === 'hedge')).toBe(true);
    expect(allTrees.filter((t) => inGarden(t.x, t.z)).length).toBeGreaterThan(15);
    expect(allFurniture.filter((f) => f.kind === 'banc' && inGarden(f.x, f.z)).length).toBe(8);
    expect(allSurfaces.some((s) => s.kind === 'water' && s.name === 'Bassin du square')).toBe(true);
    expect(data.places.some((p) => p.kind === 'garden' && p.name === TEST_DISTRICT.gardenName)).toBe(true);
    // Aucun immeuble dans le jardin.
    for (const b of allBuildings) expect(inGarden(b.outer[0], b.outer[1])).toBe(false);
  });

  it('a des îlots haussmanniens, des trous et les quatre formes de toit', () => {
    expect(allBuildings.length).toBeGreaterThan(1000);
    expect(new Set(allBuildings.map((b) => b.id)).size).toBe(allBuildings.length);
    const share = allBuildings.filter((b) => b.style === 'haussmann').length / allBuildings.length;
    expect(share).toBeGreaterThan(0.5);
    expect(new Set(allBuildings.map((b) => b.style))).toEqual(new Set(BUILDING_STYLES));
    expect(new Set(allBuildings.map((b) => b.roof))).toEqual(new Set(ROOF_SHAPES));
    for (const b of allBuildings) {
      expect(ringIsCCW(b.outer)).toBe(true);
      expect(ringSelfIntersects(b.outer)).toBe(false);
      for (const h of b.holes) expect(ringIsCCW(h)).toBe(false);
      for (let i = 0; i < b.outer.length; i++) expect(Math.abs(b.outer[i])).toBeLessThanOrEqual(H);
      expect(b.levels).toBeGreaterThanOrEqual(1);
      expect(b.height).toBeGreaterThan(b.landmarkKey === '' ? 5 : 20);
      expect(b.height).toBeLessThan(40);
      // Le pied du bâtiment est posé sur le relief.
      const bb = ringBounds(b.outer);
      expect(Math.abs(b.baseY - sampleTerrain(data.terrain, (bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2))).toBeLessThan(1.5);
    }
    const haussmann = allBuildings.filter((b) => b.style === 'haussmann');
    for (const b of haussmann) {
      expect(b.roof).toBe('mansard');
      expect(b.levels).toBeGreaterThanOrEqual(5);
      expect(b.levels).toBeLessThanOrEqual(7);
    }
    const townHall = allBuildings.filter((b) => b.name === TEST_DISTRICT.townHallName);
    expect(townHall.length).toBe(1);
    expect(townHall[0].holes.length).toBe(1);
    expect(ringSignedArea(townHall[0].outer) + ringSignedArea(townHall[0].holes[0])).toBeGreaterThan(5000);
    // La chaussée est un polygone dont les îlots sont les trous.
    const roads = allSurfaces.filter((s) => s.kind === 'road');
    expect(roads.length).toBe(6);
    expect(roads.reduce((sum, s) => sum + s.holes.length, 0)).toBe(56);
    expect(allSurfaces.filter((s) => s.kind === 'sidewalk').length).toBeGreaterThanOrEqual(56);
    for (const kind of ['park', 'parking', 'construction', 'courtyard', 'grass', 'gravel'] as const) expect(allSurfaces.some((s) => s.kind === kind), kind).toBe(true);
    // Dans chaque tuile, les surfaces sont rangées du dessous vers le dessus : la chaussée d'abord, l'eau en dernier.
    for (const t of data.tiles) {
      expect(t.surfaces[0].kind).toBe('road');
      const firstWater = t.surfaces.findIndex((s) => s.kind === 'water');
      if (firstWater >= 0) expect(t.surfaces.slice(firstWater).every((s) => s.kind === 'water')).toBe(true);
    }
  });

  it("a des arbres d'alignement et du mobilier urbain", () => {
    expect(allTrees.length).toBeGreaterThan(400);
    for (const side of [-1, 1]) {
      // Une rangée par trottoir de l'avenue, plantée tous les 9,5 m.
      const row = allTrees.filter((t) => Math.abs(t.z - side * 15.2) < 0.06).map((t) => t.x).sort((a, b) => a - b);
      expect(row.length).toBeGreaterThan(60);
      const gaps = row.slice(1).map((x, i) => x - row[i]);
      expect(Math.min(...gaps)).toBeCloseTo(9.5, 1);
    }
    expect(allTrees.filter((t) => t.z === 0).length).toBeGreaterThan(40); // terre-plein
    for (const t of allTrees) {
      expect(t.height).toBeGreaterThan(5);
      expect(t.height).toBeLessThan(25);
      expect(t.crownRadius).toBeGreaterThan(2);
      expect(t.crownRadius).toBeLessThan(7);
    }
    const kinds = new Set(allFurniture.map((f) => f.kind));
    for (const kind of ['candelabre', 'banc', 'poubelle', 'potelet', 'abribus', 'kiosque', 'colonne_morris', 'fontaine_wallace', 'table_terrasse', 'barriere_vauban'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(20);
    expect(allFurniture.filter((f) => f.kind === 'candelabre').length).toBeGreaterThan(150);
    // Aucun mobilier dans un bâtiment.
    for (const f of allFurniture) {
      for (const b of allBuildings) {
        const bb = ringBounds(b.outer);
        if (f.x < bb.minX || f.x > bb.maxX || f.z < bb.minZ || f.z > bb.maxZ) continue;
        expect(pointInPolygon(b.outer, b.holes, f.x, f.z), `${f.kind} en (${f.x}, ${f.z})`).toBe(false);
      }
    }
    const stations = new Set(data.tiles.flatMap((t) => t.metroEntrances).map((m) => m.name));
    expect(stations).toEqual(new Set([TEST_DISTRICT.stationName, TEST_DISTRICT.quayNorthName]));
  });

  it("a des commerces sur l'avenue, posés sur la façade de leur bâtiment", () => {
    expect(allShops.length).toBeGreaterThan(120);
    expect(new Set(allShops.map((s) => s.id)).size).toBe(allShops.length);
    const onAvenue = allShops.filter((s) => Math.abs(Math.abs(s.z) - TEST_DISTRICT.avenueWidth / 2) < 0.06);
    expect(onAvenue.length).toBeGreaterThan(80);
    const byId = new Map(allBuildings.map((b) => [b.id, b]));
    for (const s of allShops) {
      expect(SHOP_CATEGORIES).toContain(s.category);
      expect(s.width).toBeGreaterThanOrEqual(3);
      const b = byId.get(s.buildingId);
      expect(b, `bâtiment du commerce ${s.id}`).toBeDefined();
      if (b === undefined) continue;
      // Un pas vers l'extérieur sort du bâtiment, un pas vers l'intérieur y entre.
      const nx = Math.sin(s.heading), nz = Math.cos(s.heading);
      expect(pointInRing(b.outer, s.x + nx * 0.5, s.z + nz * 0.5)).toBe(false);
      expect(pointInRing(b.outer, s.x - nx * 0.5, s.z - nz * 0.5)).toBe(true);
    }
    // Sur l'avenue, les vitrines regardent l'avenue : vers le sud côté nord, vers le nord côté sud.
    for (const s of onAvenue) expect(Math.cos(s.heading) * Math.sign(s.z)).toBeLessThan(-0.99);
    expect(new Set(allShops.map((s) => s.category)).size).toBeGreaterThanOrEqual(10);
    // Chaque café a sa terrasse devant la vitrine.
    expect(allFurniture.filter((f) => f.kind === 'table_terrasse').length).toBe(allShops.filter((s) => s.category === 'cafe_restaurant').length);
  });

  it('a des feux aux carrefours', () => {
    const signalNodes = graph.nodes.map((n, i) => (n.signal ? i : -1)).filter((i) => i >= 0);
    expect(signalNodes.length).toBeGreaterThanOrEqual(18);
    for (const i of signalNodes) expect(graph.nodes[i].crossing).toBe(true);
    // Tout croisement d'une rue avec une chaussée de l'avenue est à feux.
    for (const x of [-430, -300, -170, 170, 300, 430]) {
      const crossing = graph.nodes.filter((n) => n.x === x && Math.abs(n.z) < 8);
      expect(crossing.length).toBe(2);
      for (const n of crossing) expect(n.signal).toBe(true);
    }
    // Chaque carrefour à feux a au moins un support, et chaque support commande un carrefour à feux proche.
    const served = new Set(allSignals.map((s) => s.node));
    for (const i of signalNodes) expect(served.has(i), `carrefour ${i} sans feu`).toBe(true);
    expect(allSignals.length).toBeGreaterThan(40);
    for (const s of allSignals) {
      const n = graph.nodes[s.node];
      expect(n.signal).toBe(true);
      const d = Math.hypot(s.x - n.x, s.z - n.z);
      expect(d).toBeGreaterThan(5);
      expect(d).toBeLessThan(13);
      // La face lumineuse regarde à l'opposé du carrefour, vers les véhicules qui arrivent.
      expect(Math.sin(s.heading) * (n.x - s.x) + Math.cos(s.heading) * (n.z - s.z)).toBeLessThan(0);
    }
    // Passages piétons hors carrefour à feux.
    expect(graph.nodes.filter((n) => n.crossing && !n.signal).length).toBeGreaterThanOrEqual(9);
  });

  it('a un léger relief, nul à l’origine', () => {
    const t = data.terrain;
    expect(sampleTerrain(t, 0, 0)).toBe(0);
    expect(t.minY).toBeLessThan(-3);
    expect(t.maxY).toBeGreaterThan(3);
    expect(t.maxY - t.minY).toBeLessThan(20);
    // Pentes douces : moins de 4 % entre nœuds voisins.
    for (let iz = 0; iz < t.nz; iz++) {
      for (let ix = 0; ix + 1 < t.nx; ix++) expect(Math.abs(t.heights[iz * t.nx + ix + 1] - t.heights[iz * t.nx + ix]) / t.step).toBeLessThan(0.04);
    }
    for (let iz = 0; iz + 1 < t.nz; iz++) {
      for (let ix = 0; ix < t.nx; ix++) expect(Math.abs(t.heights[(iz + 1) * t.nx + ix] - t.heights[iz * t.nx + ix]) / t.step).toBeLessThan(0.04);
    }
    // Le terrain descend vers le fleuve et couvre tout le quartier.
    expect(sampleTerrain(t, 0, -400)).toBeGreaterThan(sampleTerrain(t, 0, 280));
    expect(t.x0).toBeLessThanOrEqual(-H);
    expect(t.x0 + (t.nx - 1) * t.step).toBeGreaterThanOrEqual(H);
    // Option « terrain plat ».
    const flat = decodeMapData(generateTestDistrict({ relief: 0 }));
    expect([flat.terrain.minY, flat.terrain.maxY]).toEqual([0, 0]);
    expect(validateMapData(flat)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('décrit les lieux nommés du quartier', () => {
    expect(validatePlaces(data.places)).toEqual({ ok: true, errors: [], warnings: [] });
    const kinds = new Set(data.places.map((p) => p.kind));
    expect(kinds).toEqual(new Set(['square', 'street', 'bridge', 'quay', 'garden', 'district', 'monument', 'station', 'institution']));
    // Tout lieu de type rue, pont ou quai porte le nom d'au moins une arête du graphe.
    const names = edgesByName(graph);
    for (const p of data.places) {
      if (p.kind === 'street' || p.kind === 'bridge' || p.kind === 'quay') expect(names.has(p.name), p.name).toBe(true);
      expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThanOrEqual(H);
    }
    // Et toute arête nommée correspond à un lieu.
    const placeNames = new Set(data.places.map((p) => p.name));
    for (const name of names.keys()) expect(placeNames.has(name), name).toBe(true);
  });
});
