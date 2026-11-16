/* =====================================================================================
 * Aides de test du module (utilisées par tests/unit/world-query.*.test.ts et par les bancs
 * d'essai) : générateur pseudo-aléatoire déterministe, mini-carte fabriquée à la main.
 * Rien ici n'est chargé par le jeu.
 * ===================================================================================== */

import {
  FORMAT_VERSION, computeTileEdgeRefs, createManifest, encodeLandmarks, encodePlaces, encodeRoadGraph, encodeTerrain,
  encodeTile, terrainFromFunction, tileKey, treeSetFromList,
} from '../mapdata';
import type { RawMapData, RoadEdgeInput, RoadNodeInput, TileInput } from '../mapdata';

/** Générateur pseudo-aléatoire déterministe [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Longueur d'une polyligne [x0, z0, …]. */
export function pathLength(points: ArrayLike<number>): number {
  let len = 0;
  for (let i = 2; i + 1 < points.length; i += 2) len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  return len;
}

/** Repères de la mini-carte (voir miniMapRaw). */
export const MINI_MAP = {
  /** Immeuble traversé par une rue (porche) : x de 100 à 140, z de 200 à 212 ; la rue passe en x = 120. */
  porch: { minX: 100, minZ: 200, maxX: 140, maxZ: 212, roadX: 120, roadWidth: 6 },
  /** Mur isolé en z = 230, de x = 60 à 180, coupé par la même rue. */
  wallZ: 230,
  /** Immeuble traversé par un SOUTERRAIN (aucune ouverture) : x de 300 à 340, z de 200 à 212 ; x = 320. */
  tunnel: { minX: 300, minZ: 200, maxX: 340, maxZ: 212, roadX: 320 },
  /** Bassin (x 200..260, z 300..340) traversé par une allée piétonne en x = 230, large de 2 m. */
  pond: { minX: 200, minZ: 300, maxX: 260, maxZ: 340, pathX: 230 },
  /** Rivière (z 400..460) ; pont en x = 400 (chaussée 6 m + trottoirs 2 m : demi-tablier 5 m). */
  river: { north: 400, south: 460, bridgeX: 400, halfDeck: 5, bed: -5 },
  /** Statue (monument sans bâtiment) : socle carré de 2 m centré ici, haut de 6 m. */
  statue: { x: 60, z: 60, height: 6 },
} as const;

/**
 * Mini-carte d'une tuile (0, 0), fabriquée avec les encodeurs de mapdata, pour éprouver les cas
 * que le quartier d'essai ne contient pas : porche sous un immeuble, mur coupé par une rue,
 * souterrain, allée à travers un bassin, mur de quai continu sous un pont, lit de rivière creusé
 * dans le relief (le tablier du pont ne doit pas le suivre).
 */
export function miniMapRaw(): RawMapData {
  const nodes: RoadNodeInput[] = [];
  const node = (x: number, z: number): number => {
    nodes.push({ x, z, signal: false, crossing: false, boundary: false });
    return nodes.length - 1;
  };
  const edges: RoadEdgeInput[] = [];
  const edge = (a: number, b: number, over: Partial<RoadEdgeInput> = {}): void => {
    edges.push({
      a, b, points: [nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z], width: 6, lanesForward: 1, lanesBackward: 1, oneway: false,
      roadClass: 'residential', name: '', bridge: false, tunnel: false, surface: 'asphalt', speedLimit: 8.33, sidewalk: 0,
      pedestrianOnly: false, landmarkKey: '', ...over,
    });
  };
  const n0 = node(120, 150), n1 = node(120, 260), n2 = node(320, 150), n3 = node(320, 260);
  const n4 = node(230, 280), n5 = node(230, 360), n6 = node(400, 380), n7 = node(400, 480);
  edge(n0, n1, { name: 'Rue du Porche' });
  edge(n0, n2, { name: 'Rue Haute' });
  edge(n2, n3, { name: 'Souterrain', tunnel: true });
  edge(n1, n3, { name: 'Rue Basse' });
  edge(n1, n4, { name: 'Rue Basse' });
  edge(n4, n5, { name: 'Allée du Bassin', pedestrianOnly: true, roadClass: 'footway', width: 2, lanesForward: 0, lanesBackward: 0 });
  edge(n5, n6, { name: 'Quai Nord' });
  edge(n6, n7, { name: 'Pont Neuf Fictif', bridge: true, sidewalk: 2, landmarkKey: 'pont_test' });

  const rect = (x0: number, z0: number, x1: number, z1: number): number[] => [x0, z0, x0, z1, x1, z1, x1, z0];
  const p = MINI_MAP;
  const refs = computeTileEdgeRefs({ edges });
  const tile: TileInput = {
    version: FORMAT_VERSION,
    tx: 0,
    tz: 0,
    buildings: [
      { id: 1, kind: 'generic', roof: 'flat', style: 'haussmann', baseY: 0, height: 15, levels: 5, outer: rect(p.porch.minX, p.porch.minZ, p.porch.maxX, p.porch.maxZ), holes: [], landmarkKey: '', name: '' },
      { id: 2, kind: 'generic', roof: 'flat', style: 'haussmann', baseY: 0, height: 18, levels: 6, outer: rect(p.tunnel.minX, p.tunnel.minZ, p.tunnel.maxX, p.tunnel.maxZ), holes: [], landmarkKey: '', name: '' },
    ],
    roadEdges: refs.get(tileKey(0, 0)) ?? [],
    surfaces: [
      { kind: 'water', name: 'Bassin', level: -0.3, outer: rect(p.pond.minX, p.pond.minZ, p.pond.maxX, p.pond.maxZ), holes: [] },
      { kind: 'water', name: 'Rivière', level: -3, outer: rect(0, p.river.north, 512, p.river.south), holes: [] },
    ],
    barriers: [
      { kind: 'wall', height: 2.5, points: [60, p.wallZ, 180, p.wallZ] },
      { kind: 'quay_wall', height: 3, points: [0, p.river.north, 512, p.river.north] },
      { kind: 'quay_wall', height: 3, points: [0, p.river.south, 512, p.river.south] },
    ],
    trees: treeSetFromList([]),
    furniture: [],
    signals: [],
    metroEntrances: [],
    shops: [],
  };
  const dropped: string[] = [];
  const rawTile = encodeTile(tile, dropped);
  if (dropped.length > 0) throw new Error(`mini-carte : ${dropped.join(' ; ')}`);
  const manifest = createManifest({
    name: 'mini',
    tiles: [{ tx: 0, tz: 0 }],
    bounds: { minX: 0, minZ: 0, maxX: 512, maxZ: 512 },
    waterLevel: -3,
    attribution: [{ source: 'Mini-carte de test', license: 'Aucune donnée tierce', text: 'Mini-carte de test.' }],
  });
  // Lit de rivière creusé entre z = 408 et z = 452 (nœuds 416, 432, 448) : les berges restent à 0.
  const terrain = terrainFromFunction(-16, -16, 16, 35, 35, (_x, z) => (z > 408 && z < 452 ? p.river.bed : 0));
  return {
    manifest,
    tiles: [rawTile],
    roadGraph: encodeRoadGraph({ nodes, edges }),
    places: encodePlaces([{ name: 'Place du Porche', kind: 'square', x: 120, z: 150, radius: 30, importance: 2, ref: '' }]),
    landmarks: encodeLandmarks([
      // Une statue sans bâtiment dans la tuile : son emprise sert d'obstacle de secours.
      { key: 'statue_test', name: 'Statue de test', x: p.statue.x, z: p.statue.z, y: 0, heading: 0, height: p.statue.height, footprint: rect(p.statue.x - 1, p.statue.z - 1, p.statue.x + 1, p.statue.z + 1) },
      // Un pont modélisé à la main (clé portée par l'arête) : jamais un obstacle plein.
      { key: 'pont_test', name: 'Pont de test', x: p.river.bridgeX, z: 430, y: 0, heading: 0, height: 8, footprint: rect(p.river.bridgeX - 5, p.river.north, p.river.bridgeX + 5, p.river.south) },
    ]),
    terrain: encodeTerrain(terrain),
  };
}
