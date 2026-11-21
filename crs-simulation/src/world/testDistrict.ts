/* =====================================================================================
 * CRS SIMULATION FRANCE — QUARTIER D'ESSAI
 * -------------------------------------------------------------------------------------
 * generateTestDistrict() fabrique un petit quartier FICTIF d'environ 1 km × 1 km, centré
 * sur l'origine, dans EXACTEMENT le format de la vraie carte (voir mapdata.ts et
 * docs/map-format.md). Il sert aux tests et de carte de secours si les vraies données ne
 * se chargent pas. Tout y est inventé : noms de voies, monument, station.
 *
 * Plan (x = est, z = sud) :
 *   - une avenue est-ouest de 40 m entre façades, à deux chaussées séparées par un
 *     terre-plein, qui traverse une place ronde dont le centre (l'origine) porte un monument ;
 *   - un quadrillage de rues de 10, 12 et 14 m entre façades, bordées d'îlots haussmanniens ;
 *   - un fleuve est-ouest au sud, ses deux quais, un pont dans l'axe nord-sud ;
 *   - un square clos de grilles, un parc, une mairie à cour intérieure, un parc de
 *     stationnement muré, un chantier, une rue piétonne pavée ;
 *   - arbres d'alignement, mobilier urbain, commerces, feux, bouches de métro, léger relief.
 *
 * Déterministe : une même graine donne exactement les mêmes fichiers.
 * ===================================================================================== */

import {
  FORMAT_VERSION,
  MAP_SURFACE_LAYER_ORDER,
  clipPolylineToRect,
  clipRingToRect,
  computeTileEdgeRefs,
  createManifest,
  decodeTerrain,
  encodeLandmarks,
  encodePlaces,
  encodeRoadGraph,
  encodeTerrain,
  encodeTile,
  headingOf,
  outwardHeading,
  ringBounds,
  ringSignedArea,
  sampleTerrain,
  terrainFromFunction,
  tileBounds,
  tileIndexOf,
  tileKey,
  treeSetFromList,
  worldToLonLat,
} from './mapdata';
import type {
  BarrierKind,
  Bounds,
  Building,
  BuildingKind,
  BuildingStyle,
  FurnitureItem,
  FurnitureKind,
  LandmarkInput,
  Loose,
  MapSurfaceKind,
  MetroEntrance,
  Place,
  PlaceKind,
  RawMapData,
  RoadClass,
  RoadEdgeInput,
  RoadNodeInput,
  RoadSurface,
  RoofShape,
  Shop,
  ShopCategory,
  Surface,
  Barrier,
  Terrain,
  TileInput,
  TrafficSignal,
} from './mapdata';

export interface TestDistrictOptions {
  /** Graine entière du générateur pseudo-aléatoire. Défaut 1. */
  seed?: number;
  /** Amplitude du relief : 1 = léger relief (défaut), 0 = terrain plat. */
  relief?: number;
}

/** Dimensions et noms remarquables du quartier d'essai (pour les tests et les démonstrations). */
export const TEST_DISTRICT = {
  name: 'test-district',
  /** Le quartier couvre [-512, 512] m sur chaque axe : 4 tuiles. */
  halfSize: 512,
  avenueName: "Avenue de l'Essai",
  /** Largeur de l'avenue entre façades (m). */
  avenueWidth: 40,
  /** Demi-largeur du terre-plein central (m). */
  medianHalfWidth: 2,
  /** Axe de chaque chaussée de l'avenue : z = ± cette valeur. */
  avenueLaneOffset: 7.25,
  plazaName: "Place de l'Essai",
  /** Rayons de la place ronde : îlot central, axe de l'anneau, bordure, façades. */
  plazaIslandRadius: 24,
  plazaRingRadius: 33,
  plazaCurbRadius: 42,
  plazaFacadeRadius: 60,
  landmarkKey: 'monument_essai',
  landmarkName: "Colonne de l'Essai",
  riverName: 'Le Fleuve',
  /** Le fleuve occupe z ∈ [riverNorth, riverSouth]. */
  riverNorth: 300,
  riverSouth: 420,
  bridgeName: "Pont de l'Essai",
  quayNorthName: 'Quai des Saules',
  quaySouthName: 'Quai du Port',
  gardenName: 'Square des Glycines',
  /** Emprise du square clos. */
  gardenBounds: { minX: -294, minZ: 20, maxX: -175, maxZ: 144 },
  parkName: 'Parc de la Butte',
  townHallName: "Mairie de l'Essai",
  stationName: "Rond-Point de l'Essai",
  pedestrianStreetName: 'Rue du Marché',
} as const;

// ─────────────────────────────────────────────────────────────────────────────────────
// Plan du quartier
// ─────────────────────────────────────────────────────────────────────────────────────

const HALF = TEST_DISTRICT.halfSize;
/** Limite des îlots (au-delà : marge jusqu'au bord du quartier). */
const BLOCK_LIMIT = 500;
const AVENUE_HALF = TEST_DISTRICT.avenueWidth / 2;
const AVENUE_CURB = 12.5;
const AVENUE_LANE = TEST_DISTRICT.avenueLaneOffset;
const AVENUE_CARRIAGE = 10.5;
const MEDIAN_HALF = TEST_DISTRICT.medianHalfWidth;
const PLAZA_ISLAND = TEST_DISTRICT.plazaIslandRadius;
const PLAZA_RING = TEST_DISTRICT.plazaRingRadius;
const PLAZA_CURB = TEST_DISTRICT.plazaCurbRadius;
const PLAZA_FACADE = TEST_DISTRICT.plazaFacadeRadius;
const RIVER_N = TEST_DISTRICT.riverNorth;
const RIVER_S = TEST_DISTRICT.riverSouth;
/** Façades, bordures et axes des quais. */
const QUAY_N_FACADE = 282;
const QUAY_S_FACADE = 438;
const QUAY_N_AXIS = 289.5;
const QUAY_S_AXIS = 430.5;
const QUAY_CARRIAGE = 9;
const BRIDGE_HALF = 7;
/** Profondeur des immeubles d'îlot (m). */
const LOT_DEPTH = 13;

interface StreetDef {
  /** Position de l'axe (x pour une rue nord-sud, z pour une rue est-ouest). */
  c: number;
  /** Largeur entre façades (m). */
  total: number;
  name: string;
  /** 0 = double sens ; 1 = sens unique vers les coordonnées croissantes ; -1 = vers les décroissantes. */
  oneway: 0 | 1 | -1;
  roadClass: RoadClass;
  surface: RoadSurface;
}

const NS_STREETS: readonly StreetDef[] = [
  { c: -430, total: 10, name: 'Rue des Lilas', oneway: 1, roadClass: 'residential', surface: 'asphalt' },
  { c: -300, total: 12, name: 'Rue des Acacias', oneway: 0, roadClass: 'tertiary', surface: 'asphalt' },
  { c: -170, total: 10, name: 'Rue du Lavoir', oneway: -1, roadClass: 'residential', surface: 'asphalt' },
  { c: 0, total: 14, name: 'Rue du Pont', oneway: 0, roadClass: 'secondary', surface: 'asphalt' },
  { c: 170, total: 10, name: 'Rue des Peupliers', oneway: 1, roadClass: 'residential', surface: 'asphalt' },
  { c: 300, total: 12, name: "Rue de l'Horloge", oneway: 0, roadClass: 'tertiary', surface: 'asphalt' },
  { c: 430, total: 10, name: 'Rue des Glycines', oneway: -1, roadClass: 'residential', surface: 'asphalt' },
];

const EW_STREETS: readonly StreetDef[] = [
  { c: -420, total: 12, name: 'Rue des Tilleuls', oneway: 0, roadClass: 'tertiary', surface: 'asphalt' },
  { c: -290, total: 10, name: 'Rue du Moulin', oneway: 1, roadClass: 'residential', surface: 'sett' },
  { c: -160, total: 12, name: 'Rue de la Fontaine', oneway: 0, roadClass: 'tertiary', surface: 'asphalt' },
  { c: 150, total: 12, name: TEST_DISTRICT.pedestrianStreetName, oneway: 0, roadClass: 'tertiary', surface: 'asphalt' },
];

/** Largeur de chaussée d'une rue selon sa largeur entre façades : 10 -> 6, 12 -> 7, 14 -> 8. */
function carriageOf(total: number): number {
  return total <= 10 ? 6 : total <= 12 ? 7 : 8;
}

function sidewalkOf(total: number): number {
  return (total - carriageOf(total)) / 2;
}

/** Intervalle d'îlots le long d'un axe, avec la largeur de trottoir de chaque côté. */
interface Span { lo: number; hi: number; swLo: number; swHi: number }

const EDGE_SIDEWALK = 2;

/** Intervalles d'îlots en x : entre les façades des rues nord-sud. */
function buildXSpans(): Span[] {
  const spans: Span[] = [];
  let lo = -BLOCK_LIMIT, swLo = EDGE_SIDEWALK;
  for (const s of NS_STREETS) {
    spans.push({ lo, hi: s.c - s.total / 2, swLo, swHi: sidewalkOf(s.total) });
    lo = s.c + s.total / 2;
    swLo = sidewalkOf(s.total);
  }
  spans.push({ lo, hi: BLOCK_LIMIT, swLo, swHi: EDGE_SIDEWALK });
  return spans;
}

/** Intervalles d'îlots en z : rues est-ouest, avenue, quais (aucun îlot sur le fleuve). */
function buildZSpans(): Span[] {
  const [tilleuls, moulin, fontaine, marche] = EW_STREETS;
  const avenueSidewalk = AVENUE_HALF - AVENUE_CURB;
  return [
    { lo: -BLOCK_LIMIT, hi: tilleuls.c - tilleuls.total / 2, swLo: EDGE_SIDEWALK, swHi: sidewalkOf(tilleuls.total) },
    { lo: tilleuls.c + tilleuls.total / 2, hi: moulin.c - moulin.total / 2, swLo: sidewalkOf(tilleuls.total), swHi: sidewalkOf(moulin.total) },
    { lo: moulin.c + moulin.total / 2, hi: fontaine.c - fontaine.total / 2, swLo: sidewalkOf(moulin.total), swHi: sidewalkOf(fontaine.total) },
    { lo: fontaine.c + fontaine.total / 2, hi: -AVENUE_HALF, swLo: sidewalkOf(fontaine.total), swHi: avenueSidewalk },
    { lo: AVENUE_HALF, hi: marche.c - marche.total / 2, swLo: avenueSidewalk, swHi: sidewalkOf(marche.total) },
    { lo: marche.c + marche.total / 2, hi: QUAY_N_FACADE, swLo: sidewalkOf(marche.total), swHi: 3 },
    { lo: QUAY_S_FACADE, hi: BLOCK_LIMIT, swLo: 3, swHi: EDGE_SIDEWALK },
  ];
}

/** Îlots particuliers, repérés par (colonne, rangée). Les autres portent des immeubles sur leur pourtour. */
const SPECIAL_BLOCKS: Readonly<Record<string, 'garden' | 'townhall' | 'park' | 'parking' | 'construction'>> = {
  '2_4': 'garden',
  '5_2': 'townhall',
  '6_1': 'park',
  '7_0': 'parking',
  '0_6': 'construction',
};

// ─────────────────────────────────────────────────────────────────────────────────────
// Outils
// ─────────────────────────────────────────────────────────────────────────────────────

type Ring = number[];

/** Générateur pseudo-aléatoire déterministe (mulberry32), valeurs dans [0, 1[. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rectangle antihoraire vu de dessus : sud-ouest, sud-est, nord-est, nord-ouest. */
function rectRing(x0: number, z0: number, x1: number, z1: number): Ring {
  return [x0, z1, x1, z1, x1, z0, x0, z0];
}

/** Polygone régulier inscrit dans un cercle, antihoraire vu de dessus. */
function circleRing(cx: number, cz: number, radius: number, segments: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push(cx + radius * Math.cos(t), cz - radius * Math.sin(t));
  }
  return out;
}

/** Point du segment [V T] situé à `radius` de l'origine, V étant à l'intérieur du cercle. */
function circleHit(vx: number, vz: number, tx: number, tz: number, radius: number): [number, number] {
  const dx = tx - vx, dz = tz - vz;
  const a = dx * dx + dz * dz, b = 2 * (vx * dx + vz * dz), c = vx * vx + vz * vz - radius * radius;
  const t = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return [vx + dx * t, vz + dz * t];
}

/**
 * Remplace tout sommet situé dans le cercle de la place (centré sur l'origine) par un arc de ce
 * cercle : c'est ainsi que les îlots et leurs trottoirs épousent la place ronde.
 */
function cutCorner(ring: Ring, radius: number, segmentLength: number): Ring {
  const n = ring.length >> 1;
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const vx = ring[2 * i], vz = ring[2 * i + 1];
    if (Math.hypot(vx, vz) >= radius) {
      out.push(vx, vz);
      continue;
    }
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const a = circleHit(vx, vz, ring[2 * p], ring[2 * p + 1], radius);
    const b = circleHit(vx, vz, ring[2 * q], ring[2 * q + 1], radius);
    const a0 = Math.atan2(a[1], a[0]);
    let da = Math.atan2(b[1], b[0]) - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const steps = Math.max(2, Math.round((Math.abs(da) * radius) / segmentLength));
    out.push(a[0], a[1]);
    for (let k = 1; k < steps; k++) {
      const t = a0 + (da * k) / steps;
      out.push(radius * Math.cos(t), radius * Math.sin(t));
    }
    out.push(b[0], b[1]);
  }
  return out;
}

/** Parcelle d'un îlot : son contour et son côté sur rue (de A vers B, la rue est à droite). */
interface Lot { ring: Ring; ax: number; az: number; bx: number; bz: number }

/**
 * Découpe le pourtour d'un îlot (contour antihoraire) en parcelles de profondeur `depth`. Les angles
 * sont partagés en onglet ; les longs côtés sont recoupés en façades de 12 à 20 m environ.
 * Retourne aussi le contour de la cour intérieure.
 */
function perimeterLots(outline: Ring, depth: number, rng: () => number): { lots: Lot[]; inner: Ring } {
  const n = outline.length >> 1;
  const ux: number[] = [], uz: number[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = outline[2 * j] - outline[2 * i], dz = outline[2 * j + 1] - outline[2 * i + 1];
    const l = Math.hypot(dx, dz);
    ux.push(dx / l);
    uz.push(dz / l);
    len.push(l);
  }
  // Normale vers l'intérieur d'un côté de direction (ux, uz) : (uz, -ux).
  const inner: Ring = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const k = depth / (1 + uz[p] * uz[i] + ux[p] * ux[i]);
    inner.push(outline[2 * i] + (uz[p] + uz[i]) * k, outline[2 * i + 1] - (ux[p] + ux[i]) * k);
  }
  const lots: Lot[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vx = outline[2 * i], vz = outline[2 * i + 1], wx = outline[2 * j], wz = outline[2 * j + 1];
    const length = len[i];
    // Portion du côté où une coupe perpendiculaire reste dans la bande (hors onglets).
    const sa = Math.max(0, (inner[2 * i] - vx) * ux[i] + (inner[2 * i + 1] - vz) * uz[i]);
    const sb = Math.min(length, length + (inner[2 * j] - wx) * ux[i] + (inner[2 * j + 1] - wz) * uz[i]);
    const cuts: number[] = [];
    if (sb - sa >= 20) {
      const first = sa + 7 + rng() * 4, last = sb - 7 - rng() * 4;
      const span = last - first;
      if (span < 9) {
        cuts.push((first + last) / 2);
      } else {
        const count = Math.max(1, Math.round(span / (13 + rng() * 7)));
        cuts.push(first);
        for (let k = 1; k < count; k++) cuts.push(first + (span * (k + (rng() - 0.5) * 0.3)) / count);
        cuts.push(last);
      }
    }
    let fx = vx, fz = vz, gx = inner[2 * i], gz = inner[2 * i + 1];
    for (let c = 0; c <= cuts.length; c++) {
      let rx: number, rz: number, hx: number, hz: number;
      if (c < cuts.length) {
        rx = vx + ux[i] * cuts[c];
        rz = vz + uz[i] * cuts[c];
        hx = rx + uz[i] * depth;
        hz = rz - ux[i] * depth;
      } else {
        rx = wx;
        rz = wz;
        hx = inner[2 * j];
        hz = inner[2 * j + 1];
      }
      lots.push({ ring: [fx, fz, rx, rz, hx, hz, gx, gz], ax: fx, az: fz, bx: rx, bz: rz });
      fx = rx;
      fz = rz;
      gx = hx;
      gz = hz;
    }
  }
  return { lots, inner };
}

/** Tirage pondéré : `weights[i]` est le poids de `values[i]`. */
function pick<T>(rng: () => number, values: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r < 0) return values[i];
  }
  return values[values.length - 1];
}

const SHOP_MIX: readonly ShopCategory[] = [
  'banque', 'luxe', 'mode', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant',
  'restauration_rapide', 'pharmacie', 'tabac_presse', 'telephonie', 'agence', 'autre',
];
const SHOP_WEIGHTS: readonly number[] = [8, 8, 16, 5, 10, 4, 17, 7, 6, 5, 5, 5, 4];

interface TreeItem { x: number; z: number; height: number; crownRadius: number }

/** Tuile en cours de construction. */
interface TileBuilder {
  tx: number;
  tz: number;
  rect: Bounds;
  buildings: Loose<Building>[];
  surfaces: Loose<Surface>[];
  barriers: Loose<Barrier>[];
  trees: TreeItem[];
  furniture: FurnitureItem[];
  signals: TrafficSignal[];
  metroEntrances: MetroEntrance[];
  shops: Shop[];
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Générateur
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Fabrique le quartier d'essai sous sa forme disque (RawMapData) : manifeste, 4 tuiles, graphe
 * routier, lieux, monument et relief, exactement comme les fichiers de public/data/paris/.
 * `decodeMapData` (mapdata.ts) en donne la forme décodée ; `mapDataFiles` la liste des fichiers.
 */
export function generateTestDistrict(options: TestDistrictOptions = {}): RawMapData {
  const seed = Math.floor(options.seed ?? 1);
  const relief = options.relief ?? 1;
  const rng = mulberry32(seed);
  const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);

  // ── relief : pente douce vers le fleuve et butte au nord-est ; y = 0 à l'origine ──
  const bump = (x: number, z: number): number => Math.exp(-((x - 260) * (x - 260) + (z + 300) * (z + 300)) / (2 * 170 * 170));
  const bump0 = bump(0, 0);
  const terrain: Terrain = decodeTerrain(
    encodeTerrain(terrainFromFunction(-528, -528, 16, 67, 67, (x, z) => relief * (-0.012 * z + 3 * (bump(x, z) - bump0)))),
  );
  const groundAt = (x: number, z: number): number => sampleTerrain(terrain, x, z);
  const waterLevel = Math.round((groundAt(0, RIVER_N) - 3.6) * 10) / 10;
  const baseOf = (ring: Ring): number => {
    let y = Infinity;
    for (let i = 0; i < ring.length; i += 2) y = Math.min(y, groundAt(ring[i], ring[i + 1]));
    return Math.round(y * 10) / 10;
  };

  // ── tuiles ──
  const builders = new Map<string, TileBuilder>();
  const tileList: TileBuilder[] = [];
  for (let tz = -1; tz <= 0; tz++) {
    for (let tx = -1; tx <= 0; tx++) {
      const b: TileBuilder = {
        tx, tz, rect: tileBounds(tx, tz),
        buildings: [], surfaces: [], barriers: [], trees: [], furniture: [], signals: [], metroEntrances: [], shops: [],
      };
      builders.set(tileKey(tx, tz), b);
      tileList.push(b);
    }
  }
  const tileAt = (x: number, z: number): TileBuilder => {
    const t = tileIndexOf(x, z);
    const b = builders.get(tileKey(t.tx, t.tz));
    if (b === undefined) throw new Error(`testDistrict: point (${x}, ${z}) hors du quartier`);
    return b;
  };

  /** Ajoute une surface, découpée par tuile. */
  const addSurface = (kind: MapSurfaceKind, outer: Ring, holes: Ring[] = [], name = '', level: number | null = null): void => {
    for (const b of tileList) {
      const clipped = clipRingToRect(outer, b.rect);
      if (clipped.length < 6 || Math.abs(ringSignedArea(clipped)) < 0.05) continue;
      const clippedHoles: Ring[] = [];
      for (const h of holes) {
        const ch = clipRingToRect(h, b.rect);
        if (ch.length >= 6 && Math.abs(ringSignedArea(ch)) >= 0.05) clippedHoles.push(ch);
      }
      b.surfaces.push({ kind, name, level, outer: clipped, holes: clippedHoles });
    }
  };
  /** Ajoute une barrière, découpée par tuile. */
  const addBarrier = (kind: BarrierKind, height: number, points: number[]): void => {
    for (const b of tileList) {
      for (const piece of clipPolylineToRect(points, b.rect)) b.barriers.push({ kind, height, points: piece });
    }
  };
  const addTree = (x: number, z: number, height: number, crownRadius: number): void => {
    tileAt(x, z).trees.push({ x, z, height: Math.round(height * 10) / 10, crownRadius: Math.round(crownRadius * 10) / 10 });
  };
  const addFurniture = (kind: FurnitureKind, x: number, z: number, heading: number): void => {
    tileAt(x, z).furniture.push({ kind, x, z, heading });
  };
  /** Bâtiment rattaché à la tuile qui contient le centre de sa boîte englobante. */
  const addBuilding = (b: Loose<Building>): void => {
    const bb = ringBounds(b.outer);
    tileAt((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2).buildings.push(b);
  };
  let nextShopId = 500001;
  const addShop = (x: number, z: number, heading: number, width: number, category: ShopCategory, buildingId: number): void => {
    tileAt(x, z).shops.push({ id: nextShopId++, x, z, heading, width: Math.round(width * 10) / 10, category, buildingId });
    if (category === 'cafe_restaurant') addFurniture('table_terrasse', x + Math.sin(heading) * 2.4, z + Math.cos(heading) * 2.4, heading);
  };

  // ── îlots ──
  const xSpans = buildXSpans(), zSpans = buildZSpans();
  /** Contours de bordure des îlots : ce sont les trous de la chaussée. */
  const curbs: Ring[] = [];
  const places: Place[] = [];
  const addPlace = (kind: PlaceKind, name: string, x: number, z: number, radius: number, importance: number, ref = ''): void => {
    places.push({ kind, name, x, z, radius, importance, ref });
  };

  for (let iz = 0; iz < zSpans.length; iz++) {
    for (let ix = 0; ix < xSpans.length; ix++) {
      const sx = xSpans[ix], sz = zSpans[iz];
      const blockId = 1000 + (iz * xSpans.length + ix) * 100;
      const outline = cutCorner(rectRing(sx.lo, sz.lo, sx.hi, sz.hi), PLAZA_FACADE, 17);
      const curb = cutCorner(rectRing(sx.lo - sx.swLo, sz.lo - sz.swLo, sx.hi + sx.swHi, sz.hi + sz.swHi), PLAZA_CURB, 6);
      curbs.push(curb);
      addSurface('sidewalk', curb);
      const cx = (sx.lo + sx.hi) / 2, cz = (sz.lo + sz.hi) / 2;
      const special = SPECIAL_BLOCKS[`${ix}_${iz}`];

      if (special === 'garden') {
        // Square clos : pelouses, allée, bassin, grilles avec deux portails, haies.
        const pond = circleRing(cx, cz, 9, 16);
        addSurface('garden', rectRing(sx.lo, sz.lo, sx.hi, sz.hi), [pond], TEST_DISTRICT.gardenName);
        addSurface('gravel', rectRing(cx - 15.5, sz.lo + 2, cx + 15.5, cz - 12));
        addSurface('gravel', rectRing(cx - 15.5, cz + 12, cx + 15.5, sz.hi - 2));
        addSurface('grass', rectRing(sx.lo + 6, sz.lo + 8, cx - 15.5, sz.hi - 8));
        addSurface('grass', rectRing(cx + 15.5, sz.lo + 8, sx.hi - 6, sz.hi - 8));
        addSurface('water', pond, [], 'Bassin du square', Math.round((groundAt(cx, cz) - 0.3) * 10) / 10);
        const x0 = sx.lo + 0.5, x1 = sx.hi - 0.5, z0 = sz.lo + 0.5, z1 = sz.hi - 0.5;
        addBarrier('fence', 2.2, [cx - 2, z0, x0, z0, x0, z1, cx - 2, z1]);
        addBarrier('fence', 2.2, [cx + 2, z1, x1, z1, x1, z0, cx + 2, z0]);
        addBarrier('gate', 2.2, [cx - 2, z0, cx + 2, z0]);
        addBarrier('gate', 2.2, [cx - 2, z1, cx + 2, z1]);
        addBarrier('hedge', 1.1, [cx - 15.5, sz.lo + 8, cx - 15.5, sz.hi - 8]);
        addBarrier('hedge', 1.1, [cx + 15.5, sz.lo + 8, cx + 15.5, sz.hi - 8]);
        for (let k = 0; k < 44; k++) {
          const x = between(sx.lo + 5, sx.hi - 5), z = between(sz.lo + 5, sz.hi - 5);
          if (Math.abs(x - cx) < 17) continue; // l'allée centrale et le bassin restent dégagés
          addTree(x, z, between(7, 16), between(2.5, 5));
        }
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
          const bx = cx + 12.5 * Math.cos(t), bz = cz + 12.5 * Math.sin(t);
          addFurniture('banc', bx, bz, headingOf(cx - bx, cz - bz));
        }
        addFurniture('fontaine_wallace', cx + 8, sz.lo + 6, 0);
        addFurniture('statue', cx, sz.hi - 14, Math.PI);
        addFurniture('poubelle', cx - 4, sz.lo + 4, 0);
        addFurniture('poubelle', cx + 4, sz.hi - 4, Math.PI);
        addPlace('garden', TEST_DISTRICT.gardenName, cx, cz, 85, 2);
        continue;
      }

      if (special === 'townhall') {
        // Mairie : un seul bâtiment monumental à cour intérieure, sur un parvis.
        const outer = rectRing(sx.lo + 8, sz.lo + 8, sx.hi - 8, sz.hi - 8);
        const court = rectRing(sx.lo + 26, sz.lo + 26, sx.hi - 26, sz.hi - 26);
        addSurface('plaza', rectRing(sx.lo, sz.lo, sx.hi, sz.hi), [], 'Parvis de la mairie');
        addSurface('courtyard', court);
        addBuilding({
          id: blockId, kind: 'public', roof: 'mansard', style: 'monumental', baseY: baseOf(outer), height: 21, levels: 4,
          outer, holes: [court], landmarkKey: '', name: TEST_DISTRICT.townHallName,
        });
        for (let k = -1; k <= 1; k++) addFurniture('mat_drapeau', cx + k * 3, sz.hi - 5, 0);
        for (let k = 0; k < 6; k++) addFurniture('jardiniere', sx.lo + 14 + k * 18, sz.hi - 3, 0);
        for (let k = 0; k < 5; k++) addFurniture('barriere_vauban', sx.lo + 3, sz.lo + 20 + k * 2.3, Math.PI / 2);
        for (const dx of [-30, 30]) addTree(cx + dx, sz.hi - 4, between(8, 11), between(2.5, 3.5));
        addPlace('institution', TEST_DISTRICT.townHallName, cx, cz, 60, 2);
        continue;
      }

      if (special === 'park') {
        // Parc ouvert : pelouse ovale, allées, kiosque à musique sous dôme.
        addSurface('park', rectRing(sx.lo, sz.lo, sx.hi, sz.hi), [], TEST_DISTRICT.parkName);
        addSurface('gravel', rectRing(sx.lo, cz - 3, sx.hi, cz + 3));
        addSurface('gravel', rectRing(cx - 3, sz.lo, cx + 3, sz.hi));
        addSurface('grass', circleRing(cx - 30, cz - 30, 20, 20));
        addSurface('grass', circleRing(cx + 30, cz + 30, 20, 20));
        const kiosk = circleRing(cx + 28, cz - 28, 5, 8);
        addBuilding({
          id: blockId, kind: 'kiosk', roof: 'dome', style: 'monumental', baseY: baseOf(kiosk), height: 6.5, levels: 1,
          outer: kiosk, holes: [], landmarkKey: '', name: 'Kiosque à musique',
        });
        for (let k = 0; k < 60; k++) {
          const x = between(sx.lo + 4, sx.hi - 4), z = between(sz.lo + 4, sz.hi - 4);
          if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5 || Math.hypot(x - cx - 28, z - cz + 28) < 9) continue;
          addTree(x, z, between(8, 20), between(3, 6));
        }
        for (const d of [-40, -15, 15, 40]) {
          addFurniture('banc', cx + d, cz - 4, 0);
          addFurniture('banc', cx - 4, cz + d, Math.PI / 2);
        }
        addFurniture('poubelle', cx + 5, cz + 5, 0);
        addPlace('garden', TEST_DISTRICT.parkName, cx, cz, 85, 1);
        continue;
      }

      if (special === 'parking') {
        // Parc de stationnement clos de murs, ouvert au sud.
        addSurface('parking', rectRing(sx.lo + 1, sz.lo + 1, sx.hi - 1, sz.hi - 1));
        const x0 = sx.lo + 1, x1 = sx.hi - 1, z0 = sz.lo + 1, z1 = sz.hi - 1;
        addBarrier('wall', 2.4, [cx - 4, z1, x0, z1, x0, z0, x1, z0, x1, z1, cx + 4, z1]);
        addFurniture('horodateur', cx + 6, sz.hi + 0.8, 0);
        continue;
      }

      if (special === 'construction') {
        // Chantier : palissade, immeuble en construction, matériel.
        addSurface('construction', rectRing(sx.lo + 1, sz.lo + 1, sx.hi - 1, sz.hi - 1));
        const x0 = sx.lo + 1, x1 = sx.hi - 1, z0 = sz.lo + 1, z1 = sz.hi - 1;
        addBarrier('fence', 2, [cx + 5, z0, x1, z0, x1, z1, x0, z1, x0, z0, cx - 5, z0]);
        const shell = rectRing(cx - 14, cz - 12, cx + 14, cz + 12);
        addBuilding({
          id: blockId, kind: 'construction', roof: 'flat', style: 'modern', baseY: baseOf(shell), height: 7, levels: 2,
          outer: shell, holes: [], landmarkKey: '', name: '',
        });
        addFurniture('echafaudage', cx, cz - 13.5, Math.PI);
        addFurniture('conteneur', cx - 22, cz + 18, 0);
        addFurniture('conteneur', cx - 22, cz + 12, 0);
        for (let k = 0; k < 6; k++) addFurniture('barriere_chantier', cx - 5 + k * 2, sz.lo + 2.2, Math.PI);
        continue;
      }

      // Îlot ordinaire : immeubles sur le pourtour, cour au centre.
      const { lots, inner } = perimeterLots(outline, LOT_DEPTH, rng);
      if (lots.length >= 100) throw new Error('testDistrict: trop de parcelles dans un îlot');
      addSurface('courtyard', inner);
      const outskirts = ix === 0 || ix === xSpans.length - 1 || iz === 0 || iz === zSpans.length - 1;
      for (let k = 0; k < lots.length; k++) {
        const lot = lots[k];
        const onAvenue = Math.abs(Math.abs(lot.az) - AVENUE_HALF) < 0.01 && Math.abs(Math.abs(lot.bz) - AVENUE_HALF) < 0.01;
        const onPlaza = Math.abs(Math.hypot(lot.ax, lot.az) - PLAZA_FACADE) < 0.01 && Math.abs(Math.hypot(lot.bx, lot.bz) - PLAZA_FACADE) < 0.01;
        const onMarket = lot.ax > 0 && lot.ax < 170 && lot.bx > 0 && lot.bx < 170 && Math.abs(lot.az - lot.bz) < 0.01 && Math.abs(lot.az - 150) < 7;
        let style: BuildingStyle, roof: RoofShape, levels: number, kind: BuildingKind;
        if (onAvenue || onPlaza) {
          style = 'haussmann';
          roof = 'mansard';
          levels = rng() < 0.6 ? 7 : 6;
          kind = pick(rng, ['generic', 'office', 'hotel'] as const, [70, 20, 10]);
        } else {
          style = pick(rng, ['haussmann', 'modern', 'faubourg'] as const, outskirts ? [35, 15, 50] : [75, 10, 15]);
          roof = style === 'haussmann' ? 'mansard' : style === 'modern' ? 'flat' : 'gabled';
          levels = style === 'haussmann' ? (rng() < 0.5 ? 6 : 5) : style === 'modern' ? 6 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 2);
          kind = pick(rng, ['generic', 'residential', 'office'] as const, [60, 30, 10]);
        }
        const roofHeight = roof === 'mansard' ? 3 : roof === 'gabled' ? 2.5 : 0.6;
        const id = blockId + k;
        addBuilding({
          id, kind, roof, style, baseY: baseOf(lot.ring),
          height: Math.round((levels * 3.1 + roofHeight + rng() * 0.6) * 10) / 10,
          levels, outer: lot.ring, holes: [], landmarkKey: '', name: '',
        });
        // Commerces : sur l'avenue, la place et la rue piétonne.
        if (!(onAvenue || onPlaza || onMarket)) continue;
        const dx = lot.bx - lot.ax, dz = lot.bz - lot.az;
        const facade = Math.hypot(dx, dz);
        const usable = facade - 1.5;
        if (usable < 3) continue;
        const heading = outwardHeading(lot.ax, lot.az, lot.bx, lot.bz);
        if (kind === 'hotel') {
          addShop(lot.ax + dx / 2, lot.az + dz / 2, heading, Math.min(usable, 6), 'hotel', id);
        } else if (usable >= 11 && rng() < 0.6) {
          const width = usable / 2 - 0.6;
          addShop(lot.ax + dx * 0.27, lot.az + dz * 0.27, heading, width, pick(rng, SHOP_MIX, SHOP_WEIGHTS), id);
          addShop(lot.ax + dx * 0.73, lot.az + dz * 0.73, heading, width, pick(rng, SHOP_MIX, SHOP_WEIGHTS), id);
        } else {
          addShop(lot.ax + dx / 2, lot.az + dz / 2, heading, Math.min(usable, between(4, 10)), pick(rng, SHOP_MIX, SHOP_WEIGHTS), id);
        }
      }
    }
  }

  // ── chaussée : tout ce qui n'est pas îlot, par rive et par tuile, les îlots en trous ──
  const roadAreas: readonly Bounds[] = [
    { minX: -HALF, minZ: -HALF, maxX: 0, maxZ: 0 },
    { minX: 0, minZ: -HALF, maxX: HALF, maxZ: 0 },
    { minX: -HALF, minZ: 0, maxX: 0, maxZ: RIVER_N },
    { minX: 0, minZ: 0, maxX: HALF, maxZ: RIVER_N },
    { minX: -HALF, minZ: RIVER_S, maxX: 0, maxZ: HALF },
    { minX: 0, minZ: RIVER_S, maxX: HALF, maxZ: HALF },
  ];
  for (const area of roadAreas) {
    const holes = curbs.filter((curb) => {
      const b = ringBounds(curb);
      return b.minX > area.minX && b.maxX < area.maxX && b.minZ > area.minZ && b.maxZ < area.maxZ;
    });
    addSurface('road', rectRing(area.minX, area.minZ, area.maxX, area.maxZ), holes);
  }

  // ── terre-plein de l'avenue (interrompu aux carrefours et à la place) ──
  {
    const gaps: [number, number][] = [[-PLAZA_CURB - 4, PLAZA_CURB + 4]];
    for (const s of NS_STREETS) if (s.c !== 0) gaps.push([s.c - carriageOf(s.total) / 2 - 2, s.c + carriageOf(s.total) / 2 + 2]);
    gaps.sort((p, q) => p[0] - q[0]);
    let from = -HALF;
    for (const [lo, hi] of gaps) {
      addSurface('median', rectRing(from, -MEDIAN_HALF, lo, MEDIAN_HALF));
      from = hi;
    }
    addSurface('median', rectRing(from, -MEDIAN_HALF, HALF, MEDIAN_HALF));
  }

  // ── place ronde : îlot central et monument ──
  addSurface('plaza', circleRing(0, 0, PLAZA_ISLAND, 32), [], TEST_DISTRICT.plazaName);
  const monumentBase = circleRing(0, 0, 5, 8);
  addBuilding({
    id: 900, kind: 'monument', roof: 'flat', style: 'monumental', baseY: baseOf(monumentBase), height: 32, levels: 1,
    outer: monumentBase, holes: [], landmarkKey: TEST_DISTRICT.landmarkKey, name: TEST_DISTRICT.landmarkName,
  });
  const landmarks: LandmarkInput[] = [
    { key: TEST_DISTRICT.landmarkKey, name: TEST_DISTRICT.landmarkName, x: 0, z: 0, y: groundAt(0, 0), heading: 0, height: 32, footprint: monumentBase },
  ];

  // ── rue piétonne pavée ──
  addSurface('pedestrian', rectRing(4, 144, 167, 156), [], TEST_DISTRICT.pedestrianStreetName);
  for (const x of [5.2, 165.8]) for (let k = 0; k < 5; k++) addFurniture('potelet', x, 146 + k * 2, Math.PI / 2);

  // ── fleuve, quais, pont ──
  addSurface('water', rectRing(-HALF, RIVER_N, HALF, RIVER_S), [], TEST_DISTRICT.riverName, waterLevel);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -HALF : BRIDGE_HALF - 3, x1 = side < 0 ? -BRIDGE_HALF + 3 : HALF;
    addSurface('sidewalk', rectRing(x0, RIVER_N - 6, x1, RIVER_N));
    addSurface('sidewalk', rectRing(x0, RIVER_S, x1, RIVER_S + 6));
    const wx0 = side < 0 ? -HALF : BRIDGE_HALF, wx1 = side < 0 ? -BRIDGE_HALF : HALF;
    const wallHeight = (z: number): number => Math.round((groundAt((wx0 + wx1) / 2, z) - waterLevel) * 10) / 10;
    addBarrier('quay_wall', wallHeight(RIVER_N), [wx0, RIVER_N, wx1, RIVER_N]);
    addBarrier('quay_wall', wallHeight(RIVER_S), [wx0, RIVER_S, wx1, RIVER_S]);
    addBarrier('railing', 1.1, [side * BRIDGE_HALF, RIVER_N, side * BRIDGE_HALF, RIVER_S]);
  }

  // ── graphe routier ──
  const nodes: RoadNodeInput[] = [];
  const nodeIndex = new Map<string, number>();
  // Clé au centimètre : deux calculs du même point (à 1e-9 près) donnent le même nœud.
  const nodeKey = (x: number, z: number): string => `${Math.round(x * 100)}_${Math.round(z * 100)}`;
  const nodeAt = (x: number, z: number): number => {
    const key = nodeKey(x, z);
    let i = nodeIndex.get(key);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ x, z, signal: false, crossing: false, boundary: Math.abs(x) >= HALF || Math.abs(z) >= HALF });
      nodeIndex.set(key, i);
    }
    return i;
  };
  const edges: RoadEdgeInput[] = [];
  interface EdgeAttrs {
    name: string;
    width: number;
    lanes: [number, number];
    oneway: boolean;
    roadClass: RoadClass;
    surface: RoadSurface;
    speedKmh: number;
    sidewalk: number;
    bridge?: boolean;
    pedestrianOnly?: boolean;
  }
  const addEdge = (points: number[], at: EdgeAttrs): void => {
    const n = points.length;
    edges.push({
      a: nodeAt(points[0], points[1]),
      b: nodeAt(points[n - 2], points[n - 1]),
      points,
      width: at.width,
      lanesForward: at.lanes[0],
      lanesBackward: at.lanes[1],
      oneway: at.oneway,
      roadClass: at.roadClass,
      name: at.name,
      bridge: at.bridge === true,
      tunnel: false,
      surface: at.surface,
      speedLimit: at.speedKmh / 3.6,
      sidewalk: at.sidewalk,
      pedestrianOnly: at.pedestrianOnly === true,
      landmarkKey: '',
    });
  };
  const streetAttrs = (s: StreetDef): EdgeAttrs => ({
    name: s.name,
    width: carriageOf(s.total),
    lanes: s.oneway !== 0 ? [1, 0] : [1, 1],
    oneway: s.oneway !== 0,
    roadClass: s.roadClass,
    surface: s.surface,
    speedKmh: 30,
    sidewalk: sidewalkOf(s.total),
  });
  /** Chaîne d'arêtes le long d'une droite ; `vertical` = rue nord-sud (les arrêts sont des z). */
  const addChain = (vertical: boolean, c: number, stops: readonly number[], at: EdgeAttrs, reverse: boolean, override?: (lo: number, hi: number) => Partial<EdgeAttrs> | null): void => {
    for (let k = 0; k + 1 < stops.length; k++) {
      const lo = stops[k], hi = stops[k + 1];
      const from = reverse ? hi : lo, to = reverse ? lo : hi;
      const points = vertical ? [c, from, c, to] : [from, c, to, c];
      const extra = override !== undefined ? override(lo, hi) : null;
      addEdge(points, extra !== null ? { ...at, ...extra } : at);
    }
  };

  const nsAxes = NS_STREETS.map((s) => s.c);
  const quayAttrs = (name: string): EdgeAttrs => ({
    name, width: QUAY_CARRIAGE, lanes: [1, 1], oneway: false, roadClass: 'secondary', surface: 'asphalt', speedKmh: 50, sidewalk: 3,
  });
  // Rues est-ouest et quais.
  for (const s of EW_STREETS) {
    addChain(false, s.c, [-HALF, ...nsAxes, HALF], streetAttrs(s), s.oneway < 0, (lo, hi) =>
      s.name === TEST_DISTRICT.pedestrianStreetName && lo === 0 && hi === 170
        ? { pedestrianOnly: true, roadClass: 'pedestrian', lanes: [0, 0], surface: 'sett', speedKmh: 10, sidewalk: 0, width: 12 }
        : null,
    );
  }
  addChain(false, QUAY_N_AXIS, [-HALF, -430, -300, -235, -170, 0, 170, 300, 430, HALF], quayAttrs(TEST_DISTRICT.quayNorthName), false);
  addChain(false, QUAY_S_AXIS, [-HALF, ...nsAxes, HALF], quayAttrs(TEST_DISTRICT.quaySouthName), false);
  // Rues nord-sud : de la limite nord au quai nord, puis du quai sud à la limite sud.
  const ewAxes = EW_STREETS.map((s) => s.c);
  for (const s of NS_STREETS) {
    if (s.c === 0) continue;
    const north = [-HALF, ...ewAxes.filter((z) => z < 0), -AVENUE_LANE, AVENUE_LANE, ...ewAxes.filter((z) => z > 0), QUAY_N_AXIS];
    addChain(true, s.c, north, streetAttrs(s), s.oneway < 0);
    addChain(true, s.c, [QUAY_S_AXIS, HALF], streetAttrs(s), s.oneway < 0);
  }
  // Axe nord-sud central : il s'interrompt sur la place et franchit le fleuve par le pont.
  const axis = NS_STREETS.find((s) => s.c === 0);
  if (axis === undefined) throw new Error('testDistrict: axe central introuvable');
  addChain(true, 0, [-HALF, ...ewAxes.filter((z) => z < 0), -PLAZA_RING], streetAttrs(axis), false);
  addChain(true, 0, [PLAZA_RING, ...ewAxes.filter((z) => z > 0), QUAY_N_AXIS, RIVER_N, RIVER_S, QUAY_S_AXIS, HALF], streetAttrs(axis), false, (lo, hi) =>
    lo === RIVER_N && hi === RIVER_S ? { bridge: true, name: TEST_DISTRICT.bridgeName } : null,
  );
  // Avenue : chaussée nord vers l'ouest, chaussée sud vers l'est, de part et d'autre de la place.
  const ringX = Math.sqrt(PLAZA_RING * PLAZA_RING - AVENUE_LANE * AVENUE_LANE);
  const avenueAttrs: EdgeAttrs = {
    name: TEST_DISTRICT.avenueName, width: AVENUE_CARRIAGE, lanes: [3, 0], oneway: true, roadClass: 'primary', surface: 'asphalt', speedKmh: 50, sidewalk: AVENUE_HALF - AVENUE_CURB,
  };
  addChain(false, -AVENUE_LANE, [-HALF, -430, -300, -170, -ringX], avenueAttrs, true);
  addChain(false, -AVENUE_LANE, [ringX, 170, 235, 300, 430, HALF], avenueAttrs, true);
  addChain(false, AVENUE_LANE, [-HALF, -430, -300, -170, -ringX], avenueAttrs, false);
  addChain(false, AVENUE_LANE, [ringX, 170, 235, 300, 430, HALF], avenueAttrs, false);
  // Anneau de la place : sens giratoire (antihoraire vu de dessus), en arcs entre les six branches.
  {
    const alpha = Math.asin(AVENUE_LANE / PLAZA_RING);
    const stops = [-alpha, alpha, Math.PI / 2, Math.PI - alpha, Math.PI + alpha, (3 * Math.PI) / 2, 2 * Math.PI - alpha];
    const at = (t: number): [number, number] => [PLAZA_RING * Math.cos(t), -PLAZA_RING * Math.sin(t)];
    const ringAttrs: EdgeAttrs = {
      name: TEST_DISTRICT.plazaName, width: 18, lanes: [4, 0], oneway: true, roadClass: 'primary', surface: 'asphalt', speedKmh: 30, sidewalk: 6,
    };
    for (let k = 0; k + 1 < stops.length; k++) {
      const t0 = stops[k], t1 = stops[k + 1];
      const steps = Math.max(1, Math.round((t1 - t0) / (Math.PI / 18)));
      const points: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const p = at(t0 + ((t1 - t0) * i) / steps);
        // Les extrémités sont posées exactement sur les nœuds des branches.
        if (i === 0 || i === steps) {
          const snapped = nodes[nodeAt(p[0], p[1])];
          points.push(snapped.x, snapped.z);
        } else {
          points.push(p[0], p[1]);
        }
      }
      addEdge(points, ringAttrs);
    }
  }

  // Feux et passages piétons.
  const flag = (x: number, z: number, signal: boolean): void => {
    const i = nodeIndex.get(nodeKey(x, z));
    if (i === undefined) throw new Error(`testDistrict: aucun nœud en (${x}, ${z})`);
    const nd = nodes[i];
    nd.crossing = true;
    if (signal) nd.signal = true;
  };
  for (const s of NS_STREETS) {
    if (s.c === 0) continue;
    flag(s.c, -AVENUE_LANE, true);
    flag(s.c, AVENUE_LANE, true);
    flag(s.c, QUAY_N_AXIS, false);
  }
  for (const [x, z] of [[0, -160], [0, 150], [-300, -160], [300, -160], [-300, 150], [300, 150], [0, QUAY_N_AXIS], [0, QUAY_S_AXIS]] as const) flag(x, z, true);
  for (const [x, z] of [[235, -AVENUE_LANE], [235, AVENUE_LANE], [-235, QUAY_N_AXIS], [0, -PLAZA_RING], [0, PLAZA_RING], [-ringX, -AVENUE_LANE], [-ringX, AVENUE_LANE], [ringX, -AVENUE_LANE], [ringX, AVENUE_LANE]] as const) flag(x, z, false);

  // Supports de feux : un par voie d'arrivée, sur le trottoir de droite, avant le carrefour.
  for (let e = 0; e < edges.length; e++) {
    const ed = edges[e];
    if (ed.pedestrianOnly) continue;
    const pts = ed.points, np = pts.length >> 1;
    for (const end of [0, 1]) {
      // end = 1 : arrivée sur b ; end = 0 : arrivée sur a (double sens uniquement).
      if (end === 0 && ed.oneway) continue;
      const nodeId = end === 1 ? ed.b : ed.a;
      if (!nodes[nodeId].signal) continue;
      const nx = pts[end === 1 ? 2 * np - 2 : 0], nz = pts[end === 1 ? 2 * np - 1 : 1];
      const px = pts[end === 1 ? 2 * np - 4 : 2], pz = pts[end === 1 ? 2 * np - 3 : 3];
      const length = Math.hypot(nx - px, nz - pz);
      // Traversée du terre-plein entre les deux chaussées de l'avenue : pas de feu intermédiaire.
      if (length < 20 && nodes[end === 1 ? ed.a : ed.b].signal) continue;
      const dx = (nx - px) / length, dz = (nz - pz) / length;
      const side = ed.width / 2 + 0.7;
      const x = nx - dx * 7.2 - dz * side, z = nz - dz * 7.2 + dx * side;
      tileAt(x, z).signals.push({ x, z, heading: headingOf(-dx, -dz), node: nodeId });
    }
  }

  // ── arbres d'alignement et mobilier ──
  const nearAxis = (v: number, axes: readonly StreetDef[], margin: number): boolean => axes.some((s) => Math.abs(v - s.c) < s.total / 2 + margin);
  // Avenue : arbres et candélabres sur les deux trottoirs, arbres sur le terre-plein.
  for (const side of [-1, 1]) {
    for (let x = -498; x <= 498; x += 9.5) {
      if (nearAxis(x, NS_STREETS, 5) || Math.abs(x) < PLAZA_FACADE + 6) continue;
      addTree(x, side * 15.2, between(12, 17), between(3.2, 4.6));
    }
    for (let x = -493; x <= 493; x += 29) {
      if (nearAxis(x, NS_STREETS, 3) || Math.abs(x) < PLAZA_FACADE + 4) continue;
      addFurniture('candelabre', x, side * 13.3, side < 0 ? 0 : Math.PI);
    }
    for (let x = -470; x <= 470; x += 57) {
      if (nearAxis(x, NS_STREETS, 6) || Math.abs(x) < PLAZA_FACADE + 8) continue;
      addFurniture('banc', x, side * 17.6, side < 0 ? 0 : Math.PI);
    }
    for (const s of NS_STREETS) {
      if (s.c === 0) continue;
      for (const d of [-1, 1]) {
        const cx = s.c + d * (carriageOf(s.total) / 2 + 1.6);
        addFurniture('poubelle', cx, side * 14.2, side < 0 ? 0 : Math.PI);
        for (let k = 0; k < 3; k++) addFurniture('potelet', s.c + d * (carriageOf(s.total) / 2 + 0.5), side * (13.2 + k * 1.5), 0);
      }
    }
  }
  for (let x = -500; x <= 500; x += 12) {
    if (nearAxis(x, NS_STREETS, 6) || Math.abs(x) < PLAZA_CURB + 8) continue;
    addTree(x, 0, between(9, 13), between(2.4, 3.4));
  }
  addFurniture('abribus', -110, -15, 0);
  addFurniture('abribus', 110, 15, Math.PI);
  addFurniture('colonne_morris', -225, 16.5, Math.PI);
  addFurniture('colonne_morris', 252, -16.5, 0);
  addFurniture('panneau_pub', -365, -14, 0);
  addFurniture('panneau_pub', 365, 14, Math.PI);
  addFurniture('station_velo', 122, -17.5, 0);
  addFurniture('arceau_velo', -122, 17.5, Math.PI);
  addFurniture('boite_aux_lettres', -174, -100, Math.PI / 2);
  addFurniture('colonne_verre', 296.5, 60, -Math.PI / 2);
  addFurniture('bouche_incendie', -296.6, -230, Math.PI / 2);
  addFurniture('bouche_incendie', 173.6, 90, Math.PI / 2);
  for (const z of [-350, -225, 85]) addFurniture('horodateur', -295.6, z, -Math.PI / 2);
  for (const z of [-350, -100, 220]) addFurniture('horodateur', 304.4, z, Math.PI / 2);

  // Place : couronne d'arbres, kiosque, horloge, caméras, fontaine.
  for (let k = 0; k < 24; k++) {
    const t = ((k + 0.5) / 24) * Math.PI * 2;
    const x = 51 * Math.cos(t), z = 51 * Math.sin(t);
    if (Math.abs(z) < AVENUE_HALF + 3 || Math.abs(x) < 11) continue; // débouchés de l'avenue et de l'axe
    addTree(x, z, between(11, 15), between(3, 4.2));
  }
  const onPlaza = (radius: number, degrees: number): [number, number] => {
    const t = (degrees * Math.PI) / 180;
    return [radius * Math.cos(t), -radius * Math.sin(t)];
  };
  const placeOnPlaza = (kind: FurnitureKind, radius: number, degrees: number): void => {
    const [x, z] = onPlaza(radius, degrees);
    addFurniture(kind, x, z, headingOf(-x, -z)); // tourné vers le centre de la place
  };
  placeOnPlaza('kiosque', 53, 40);
  placeOnPlaza('horloge', 46, 140);
  placeOnPlaza('camera', 44.5, 228);
  placeOnPlaza('camera', 44.5, 48);
  placeOnPlaza('fontaine_wallace', 54, 318);
  placeOnPlaza('colonne_morris', 54, 128);
  for (const deg of [35, 55, 125, 145, 215, 235, 305, 325]) placeOnPlaza('candelabre', 43.5, deg);
  for (const deg of [60, 120, 240, 300]) placeOnPlaza('banc', 56, deg);

  // Rues : un candélabre tous les 36 m sur un trottoir, hors carrefours.
  for (const s of NS_STREETS) {
    const x = s.c + carriageOf(s.total) / 2 + 0.6;
    for (let z = -494; z <= QUAY_N_FACADE - 4; z += 36) {
      if (nearAxis(z, EW_STREETS, 4) || Math.abs(z) < AVENUE_HALF + 4 || (s.c === 0 && Math.abs(z) < PLAZA_FACADE + 4)) continue;
      addFurniture('candelabre', x, z, -Math.PI / 2);
    }
    for (let z = QUAY_S_FACADE + 6; z <= 498; z += 36) addFurniture('candelabre', x, z, -Math.PI / 2);
  }
  for (const s of EW_STREETS) {
    const z = s.c - carriageOf(s.total) / 2 - 0.6;
    for (let x = -494; x <= 494; x += 36) {
      if (nearAxis(x, NS_STREETS, 4)) continue;
      addFurniture('candelabre', x, z, 0);
    }
  }

  // Quais : promenade plantée côté fleuve, bancs tournés vers l'eau.
  for (const bank of [-1, 1]) {
    // bank = -1 : rive nord (promenade z ∈ [294, 300]) ; bank = 1 : rive sud (z ∈ [420, 426]).
    const edge = bank < 0 ? RIVER_N : RIVER_S;
    for (let x = -505; x <= 505; x += 10) {
      if (Math.abs(x) < 14) continue;
      addTree(x, edge + bank * 2.8, between(10, 15), between(3, 4.2));
    }
    for (let x = -490; x <= 490; x += 30) {
      if (Math.abs(x) < 12) continue;
      addFurniture('candelabre', x, edge + bank * 5.1, bank < 0 ? Math.PI : 0);
    }
    for (let x = -475; x <= 475; x += 45) {
      if (Math.abs(x) < 16) continue;
      addFurniture('banc', x + 5, edge + bank * 1.3, bank < 0 ? 0 : Math.PI);
    }
  }
  addFurniture('sanisette', -62, RIVER_N - 3, Math.PI);
  addFurniture('armoire_technique', 9.5, QUAY_N_FACADE + 1.2, 0);
  addFurniture('panneau', -9.5, RIVER_N - 2, Math.PI);
  // Pont : candélabres sur les deux trottoirs.
  for (let z = RIVER_N + 15; z <= RIVER_S - 15; z += 30) {
    addFurniture('candelabre', -BRIDGE_HALF + 0.6, z, Math.PI / 2);
    addFurniture('candelabre', BRIDGE_HALF - 0.6, z, -Math.PI / 2);
  }

  // ── bouches de métro ──
  const addMetro = (x: number, z: number, heading: number, name: string, lines: string): void => {
    tileAt(x, z).metroEntrances.push({ x, z, heading, name, lines });
  };
  {
    const [x1, z1] = onPlaza(50, 68), [x2, z2] = onPlaza(50, 248);
    addMetro(x1, z1, headingOf(x1, z1), TEST_DISTRICT.stationName, '1;7');
    addMetro(x2, z2, headingOf(x2, z2), TEST_DISTRICT.stationName, '1;7');
    addMetro(-24, RIVER_N - 3.2, -Math.PI / 2, TEST_DISTRICT.quayNorthName, '7');
  }

  // ── lieux nommés ──
  addPlace('district', "Quartier de l'Essai", 0, 0, 720, 3);
  addPlace('square', TEST_DISTRICT.plazaName, 0, 0, PLAZA_FACADE, 3);
  addPlace('monument', TEST_DISTRICT.landmarkName, 0, 0, 8, 3);
  addPlace('street', TEST_DISTRICT.avenueName, 0, 0, HALF, 3);
  for (const s of NS_STREETS) addPlace('street', s.name, s.c, s.c === 0 ? -260 : -110, s.c === 0 ? 250 : 400, s.c === 0 ? 2 : 1);
  for (const s of EW_STREETS) addPlace('street', s.name, 0, s.c, HALF, 1);
  addPlace('bridge', TEST_DISTRICT.bridgeName, 0, (RIVER_N + RIVER_S) / 2, (RIVER_S - RIVER_N) / 2, 2);
  addPlace('quay', TEST_DISTRICT.quayNorthName, 0, QUAY_N_AXIS, HALF, 2);
  addPlace('quay', TEST_DISTRICT.quaySouthName, 0, QUAY_S_AXIS, HALF, 2);
  addPlace('station', TEST_DISTRICT.stationName, 0, 0, 60, 2, '1;7');
  addPlace('station', TEST_DISTRICT.quayNorthName, -24, RIVER_N - 3.2, 30, 1, '7');

  // ── assemblage ──
  const refs = computeTileEdgeRefs({ edges });
  const layer = (kind: MapSurfaceKind): number => MAP_SURFACE_LAYER_ORDER.indexOf(kind);
  const dropped: string[] = [];
  const rawTiles = tileList.map((b) => {
    // Surfaces du dessous vers le dessus (tri stable : l'ordre de création départage).
    const surfaces = b.surfaces.map((s, i) => ({ s, i })).sort((p, q) => layer(p.s.kind) - layer(q.s.kind) || p.i - q.i).map((p) => p.s);
    const tile: TileInput = {
      version: FORMAT_VERSION,
      tx: b.tx,
      tz: b.tz,
      buildings: b.buildings,
      roadEdges: refs.get(tileKey(b.tx, b.tz)) ?? [],
      surfaces,
      barriers: b.barriers,
      trees: treeSetFromList(b.trees),
      furniture: b.furniture,
      signals: b.signals,
      metroEntrances: b.metroEntrances,
      shops: b.shops,
    };
    return encodeTile(tile, dropped);
  });
  if (dropped.length > 0) throw new Error(`testDistrict: éléments non représentables — ${dropped.join(' ; ')}`);

  const nw = worldToLonLat(-HALF, -HALF), se = worldToLonLat(HALF, HALF);
  const manifest = createManifest({
    name: TEST_DISTRICT.name,
    tiles: tileList.map((b) => ({ tx: b.tx, tz: b.tz })),
    bbox: { west: nw.lon, south: se.lat, east: se.lon, north: nw.lat },
    bounds: { minX: -HALF, minZ: -HALF, maxX: HALF, maxZ: HALF },
    waterLevel,
    generatedAt: '',
    attribution: [
      {
        source: "Quartier d'essai procédural",
        license: 'Aucune donnée tierce',
        text: "Quartier d'essai fictif généré par le jeu — aucune donnée cartographique tierce.",
      },
    ],
  });

  return {
    manifest,
    tiles: rawTiles,
    roadGraph: encodeRoadGraph({ nodes, edges }),
    places: encodePlaces(places),
    landmarks: encodeLandmarks(landmarks),
    terrain: encodeTerrain(terrain),
  };
}
