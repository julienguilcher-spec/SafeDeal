// Vraies données de Paris (public/data/paris/, produites par tools/map/build.mjs) : tout est lu
// avec le décodeur du jeu, contrôlé, puis confronté à quelques repères connus du plan de Paris.
// Dossier lu : public/data/paris, ou celui de la variable d'environnement CRS_PARIS_DATA.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MAP_FILES,
  PARIS_BBOX,
  SHOP_CATEGORIES,
  boundsOfBbox,
  decodeLandmarks,
  decodePlaces,
  decodeRoadGraph,
  decodeTerrain,
  decodeTile,
  encodeRoadGraph,
  encodeTile,
  parseManifest,
  pointInPolygon,
  roadGraphComponents,
  sampleTerrain,
  tileIndexOf,
  tileKey,
  tilesCoveringBounds,
  validateLandmarks,
  validateMapData,
  validatePlaces,
  validateRawTile,
  validateRoadGraph,
  validateTerrain,
  validateTile,
} from '../../src/world/mapdata';
import type { Landmark, Manifest, Place, RawRoadGraph, RawTile, RoadEdge, RoadGraph, Terrain, Tile } from '../../src/world/mapdata';

const dir = process.env.CRS_PARIS_DATA ?? path.resolve(__dirname, '../../public/data/paris');
const read = (rel: string): string => readFileSync(path.join(dir, rel), 'utf8');

/** Budget de la sortie (docs/BRIEF.md, docs/map-format.md § 2). */
const MAX_FILES = 110;
const MAX_BYTES = 30 * 1024 * 1024;

// Repères en mètres monde (projection du BRIEF).
const ETOILE = { x: -1920, z: -906 };
const REPUBLIQUE = { x: 3122, z: -208 };

let manifest: Manifest;
let rawTiles: RawTile[] = [];
let tiles: Tile[] = [];
let rawGraph: RawRoadGraph;
let graph: RoadGraph;
let terrain: Terrain;
let places: Place[] = [];
let landmarks: Landmark[] = [];
const tileByKey = new Map<string, Tile>();

function tileAt(x: number, z: number): Tile {
  const t = tileIndexOf(x, z);
  const tile = tileByKey.get(tileKey(t.tx, t.tz));
  if (tile === undefined) throw new Error(`aucune tuile en (${x}, ${z})`);
  return tile;
}

/** Tuiles qui touchent le disque (centre, rayon). */
function tilesNear(x: number, z: number, r: number): Tile[] {
  const out: Tile[] = [];
  for (const t of tiles) {
    const minX = t.tx * 512 - r, maxX = (t.tx + 1) * 512 + r, minZ = t.tz * 512 - r, maxZ = (t.tz + 1) * 512 + r;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) out.push(t);
  }
  return out;
}

function distToPolyline(points: Float32Array, x: number, z: number): number {
  let best = Infinity;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2], az = points[i - 1], dx = points[i] - ax, dz = points[i + 1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Arêtes portant ce nom à moins de `r` mètres du point. */
function edgesNear(name: string, x: number, z: number, r: number): RoadEdge[] {
  return graph.edges.filter((e) => e.name === name && distToPolyline(e.points, x, z) <= r);
}

function buildingsNear(x: number, z: number, r: number): number {
  let n = 0;
  for (const t of tilesNear(x, z, r)) {
    for (const b of t.buildings) {
      // centre de la boîte englobante
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < b.outer.length; i += 2) {
        minX = Math.min(minX, b.outer[i]); maxX = Math.max(maxX, b.outer[i]);
        minZ = Math.min(minZ, b.outer[i + 1]); maxZ = Math.max(maxZ, b.outer[i + 1]);
      }
      if (Math.hypot((minX + maxX) / 2 - x, (minZ + maxZ) / 2 - z) <= r) n++;
    }
  }
  return n;
}

/** Nature de la surface la plus haute dans l'ordre de superposition qui contient le point ('' si aucune). */
function topSurfaceAt(x: number, z: number): { kind: string; name: string; level: number | null } {
  const list = tileAt(x, z).surfaces;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (pointInPolygon(s.outer, s.holes, x, z)) return { kind: s.kind, name: s.name, level: s.level };
  }
  return { kind: '', name: '', level: null };
}

function landmark(key: string): Landmark {
  const lm = landmarks.find((l) => l.key === key);
  if (lm === undefined) throw new Error(`monument « ${key} » absent de landmarks.json`);
  return lm;
}

function place(kind: string, name: string): Place {
  const p = places.find((q) => q.kind === kind && q.name === name);
  if (p === undefined) throw new Error(`lieu ${kind} « ${name} » absent de places.json`);
  return p;
}

describe('carte de Paris — vraies données (public/data/paris)', () => {
  beforeAll(() => {
    if (!existsSync(path.join(dir, MAP_FILES.manifest))) {
      throw new Error(`données de carte absentes de ${dir} : lancer « node tools/map/build.mjs »`);
    }
    manifest = parseManifest(JSON.parse(read(MAP_FILES.manifest)));
    rawTiles = manifest.tiles.map((t) => JSON.parse(read(t.file)) as RawTile);
    tiles = rawTiles.map(decodeTile);
    for (const t of tiles) tileByKey.set(tileKey(t.tx, t.tz), t);
    rawGraph = JSON.parse(read(manifest.files.roadGraph)) as RawRoadGraph;
    graph = decodeRoadGraph(rawGraph);
    terrain = decodeTerrain(JSON.parse(read(manifest.files.terrain)));
    places = decodePlaces(JSON.parse(read(manifest.files.places)));
    landmarks = decodeLandmarks(JSON.parse(read(manifest.files.landmarks)));
  });

  describe('manifeste et budget', () => {
    it('décrit Paris : emprise, 98 tuiles, niveau du fleuve', () => {
      expect(manifest.name).toBe('paris');
      expect(manifest.bbox).toEqual(PARIS_BBOX);
      const expected = tilesCoveringBounds(boundsOfBbox(PARIS_BBOX));
      expect(manifest.tiles.length).toBe(98);
      expect(manifest.tiles.map((t) => tileKey(t.tx, t.tz)).sort()).toEqual(expected.map((t) => tileKey(t.tx, t.tz)).sort());
      // La Seine est à 26,5 m NGF environ, la Concorde à 32,8 m.
      expect(manifest.waterLevel).toBeGreaterThan(-7.5);
      expect(manifest.waterLevel).toBeLessThan(-5);
    });

    it('crédite chaque source avec sa licence', () => {
      const sources = manifest.attribution.map((a) => a.source);
      for (const s of ['OpenStreetMap', 'IGN', 'Ville de Paris', 'Apur', 'Île-de-France Mobilités']) expect(sources).toContain(s);
      const text = manifest.attribution.map((a) => `${a.text} ${a.license}`).join('\n');
      expect(text).toContain("© les contributeurs d'OpenStreetMap");
      expect(text).toContain('BD TOPO®');
      expect(text).toContain('RGE ALTI®');
      expect(text).toContain('BDCOM 2023');
      expect(text).toContain('ODbL');
      expect(text).toContain('Licence Ouverte 2.0');
      for (const a of manifest.attribution) expect(a.license.length).toBeGreaterThan(0);
    });

    it('tient dans le budget : au plus 110 fichiers et 30 Mo', () => {
      let files = 0, bytes = 0;
      const walk = (d: string): void => {
        for (const name of readdirSync(d)) {
          const p = path.join(d, name);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else { files++; bytes += st.size; }
        }
      };
      walk(dir);
      expect(files).toBeLessThanOrEqual(MAX_FILES);
      expect(bytes).toBeLessThanOrEqual(MAX_BYTES);
      // Tailles annoncées par le manifeste = tailles réelles.
      for (const t of manifest.tiles) expect(t.bytes).toBe(statSync(path.join(dir, t.file)).size);
    });
  });

  describe('tuiles', () => {
    it('toutes les tuiles ont une structure saine (validateRawTile)', () => {
      for (let i = 0; i < rawTiles.length; i++) {
        const r = validateRawTile(rawTiles[i]);
        expect(r.errors, `tuile ${manifest.tiles[i].file}`).toEqual([]);
        expect(rawTiles[i].tx).toBe(manifest.tiles[i].tx);
        expect(rawTiles[i].tz).toBe(manifest.tiles[i].tz);
      }
    });

    it('toutes les tuiles décodées respectent les invariants (validateTile)', () => {
      const ctx = { edgeCount: graph.edges.length, nodeCount: graph.nodes.length, landmarkKeys: new Set(landmarks.map((l) => l.key)) };
      for (const t of tiles) {
        const r = validateTile(t, ctx);
        expect(r.errors, `tuile ${tileKey(t.tx, t.tz)}`).toEqual([]);
      }
    });

    it('ré-encoder une tuile décodée redonne exactement le fichier', () => {
      for (let i = 0; i < tiles.length; i++) {
        expect(JSON.stringify(encodeTile(tiles[i])), `tuile ${manifest.tiles[i].file}`).toBe(JSON.stringify(rawTiles[i]));
      }
    });

    it('aucune tuile de l\'emprise n\'est vide de bâtiments, de surfaces ou de voies', () => {
      const b = boundsOfBbox(PARIS_BBOX);
      for (const t of tiles) {
        // Seules les tuiles largement dans l'emprise sont exigeantes (les bords ne portent qu'une bande).
        const inside = t.tx * 512 >= b.minX && (t.tx + 1) * 512 <= b.maxX && t.tz * 512 >= b.minZ && (t.tz + 1) * 512 <= b.maxZ;
        if (!inside) continue;
        const key = tileKey(t.tx, t.tz);
        expect(t.buildings.length, `bâtiments de la tuile ${key}`).toBeGreaterThan(20);
        expect(t.surfaces.length, `surfaces de la tuile ${key}`).toBeGreaterThan(50);
        expect(t.roadEdges.length, `arêtes de la tuile ${key}`).toBeGreaterThan(30);
      }
    });

    it('ordres de grandeur : bâtiments, arbres, mobilier, feux, métro', () => {
      const sum = (f: (t: Tile) => number): number => tiles.reduce((s, t) => s + f(t), 0);
      expect(sum((t) => t.buildings.length)).toBeGreaterThan(28000);
      expect(sum((t) => t.surfaces.length)).toBeGreaterThan(25000);
      expect(sum((t) => t.barriers.length)).toBeGreaterThan(3000);
      expect(sum((t) => t.trees.count)).toBeGreaterThan(35000);
      expect(sum((t) => t.furniture.length)).toBeGreaterThan(18000);
      expect(sum((t) => t.signals.length)).toBeGreaterThan(6000);
      expect(sum((t) => t.metroEntrances.length)).toBeGreaterThan(400);
      // Tissu parisien : la grande majorité des immeubles font de 15 à 30 m et portent une mansarde.
      const all = tiles.flatMap((t) => t.buildings);
      const haussmann = all.filter((b) => b.style === 'haussmann' && b.roof === 'mansard').length;
      expect(haussmann / all.length).toBeGreaterThan(0.6);
      for (const b of all) {
        expect(b.height).toBeGreaterThan(1.9);
        if (b.landmarkKey === '') expect(b.height).toBeLessThanOrEqual(120);
      }
    });

    it('chaque feu désigne un nœud à feux du graphe, à proximité', () => {
      let withNode = 0, total = 0;
      for (const t of tiles) {
        for (const s of t.signals) {
          total++;
          if (s.node < 0) continue;
          withNode++;
          const n = graph.nodes[s.node];
          expect(n.signal).toBe(true);
          expect(Math.hypot(n.x - s.x, n.z - s.z)).toBeLessThanOrEqual(45.2);
        }
      }
      expect(withNode / total).toBeGreaterThan(0.95);
    });
  });

  describe('commerces', () => {
    it('sont posés sur la façade de leur bâtiment, sans aucune enseigne', () => {
      const buildings = new Map<number, { outer: Float32Array; holes: Float32Array[] }>();
      for (const t of tiles) for (const b of t.buildings) buildings.set(b.id, b);
      let total = 0, far = 0;
      const ids = new Set<number>();
      const byCategory = new Map<string, number>();
      for (const t of tiles) {
        for (const s of t.shops) {
          total++;
          expect(ids.has(s.id)).toBe(false);
          ids.add(s.id);
          expect(SHOP_CATEGORIES).toContain(s.category);
          byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
          expect(s.width).toBeGreaterThanOrEqual(2);
          const b = buildings.get(s.buildingId);
          expect(b, `bâtiment du commerce ${s.id}`).toBeDefined();
          if (b === undefined) continue;
          let d = distToPolyline(b.outer, s.x, s.z);
          // côté de fermeture de l'anneau
          const n = b.outer.length;
          d = Math.min(d, distToPolyline(Float32Array.of(b.outer[n - 2], b.outer[n - 1], b.outer[0], b.outer[1]), s.x, s.z));
          if (d > 0.3) far++;
        }
      }
      expect(total).toBeGreaterThan(20000);
      expect(far).toBe(0);
      // Toutes les catégories de jeu sont représentées.
      for (const c of SHOP_CATEGORIES) expect(byCategory.get(c) ?? 0, `catégorie ${c}`).toBeGreaterThan(50);
      // Le format ne prévoit aucun nom de commerce : la couche ne porte que ses colonnes connues.
      for (const raw of rawTiles) {
        if (raw.shops === undefined) continue;
        for (const column of Object.keys(raw.shops)) expect(['n', 'id', 'xz', 'a', 'w', 'cat', 'b']).toContain(column);
      }
    });
  });

  describe('graphe routier', () => {
    it('est valide et se ré-encode à l\'identique', () => {
      const r = validateRoadGraph(graph);
      expect(r.errors).toEqual([]);
      expect(JSON.stringify(encodeRoadGraph(graph))).toBe(JSON.stringify(rawGraph));
      expect(graph.edges.length).toBeGreaterThan(15000);
      expect(graph.nodes.length).toBeGreaterThan(12000);
    });

    it('ne contient aucune voie souterraine, garde les ponts', () => {
      expect(graph.edges.filter((e) => e.tunnel).length).toBe(0);
      const bridges = new Set(graph.edges.filter((e) => e.bridge && /^(Pont|Petit-Pont|Passerelle)/.test(e.name)).map((e) => e.name));
      for (const name of ['Pont de la Concorde', 'Pont Alexandre III', 'Pont Neuf', "Pont d'Iéna", "Pont de l'Alma", 'Pont au Change', 'Pont Royal', 'Pont de Sully']) {
        expect([...bridges]).toContain(name);
      }
      expect(bridges.size).toBeGreaterThanOrEqual(20);
    });

    it('la plus grande composante connexe porte au moins 97 % des arêtes carrossables', () => {
      const drivable = graph.edges.filter((e) => !e.pedestrianOnly);
      const comp = roadGraphComponents({ nodes: graph.nodes, edges: drivable });
      const count = new Map<number, number>();
      for (const e of drivable) count.set(comp.labels[e.a], (count.get(comp.labels[e.a]) ?? 0) + 1);
      const main = Math.max(...count.values());
      expect(main / drivable.length).toBeGreaterThanOrEqual(0.97);
    });

    it('porte des feux, des passages piétons et des limites de carte sur ses nœuds', () => {
      expect(graph.nodes.filter((n) => n.signal).length).toBeGreaterThan(2000);
      expect(graph.nodes.filter((n) => n.crossing).length).toBeGreaterThan(5000);
      expect(graph.nodes.filter((n) => n.boundary).length).toBeGreaterThan(100);
    });

    it('donne aux Champs-Élysées environ 70 m de façade à façade', () => {
      // Tronçon bâti, entre le Rond-Point et l'Étoile (plus bas, l'avenue longe des jardins).
      const upper = graph.edges.filter((e) => e.name === 'Avenue des Champs-Élysées' && !e.pedestrianOnly && e.points[0] < -1050);
      expect(upper.length).toBeGreaterThan(10);
      let length = 0, weighted = 0;
      for (const e of upper) {
        length += e.length;
        weighted += (e.width + 2 * e.sidewalk) * e.length;
        expect(e.surface).toBe('sett');
      }
      const mean = weighted / length;
      expect(mean).toBeGreaterThan(60);
      expect(mean).toBeLessThan(76);
    });
  });

  describe('relief, lieux, monuments', () => {
    it('relief : y = 0 à l\'obélisque, l\'Étoile et le Trocadéro en hauteur, emprise couverte', () => {
      const r = validateTerrain(terrain);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(Math.abs(sampleTerrain(terrain, 0, 0))).toBeLessThan(0.06);
      // Altitudes réelles (IGN) : Étoile 58,6 m, Trocadéro 60,5 m, République 36,9 m, Concorde 32,8 m.
      expect(sampleTerrain(terrain, ETOILE.x, ETOILE.z)).toBeGreaterThan(23);
      expect(sampleTerrain(terrain, ETOILE.x, ETOILE.z)).toBeLessThan(28);
      expect(sampleTerrain(terrain, -2411, 387)).toBeGreaterThan(24);
      expect(sampleTerrain(terrain, REPUBLIQUE.x, REPUBLIQUE.z)).toBeGreaterThan(2.5);
      expect(sampleTerrain(terrain, REPUBLIQUE.x, REPUBLIQUE.z)).toBeLessThan(5.5);
      const b = manifest.bounds;
      expect(terrain.x0).toBeLessThanOrEqual(b.minX);
      expect(terrain.z0).toBeLessThanOrEqual(b.minZ);
      expect(terrain.x0 + (terrain.nx - 1) * terrain.step).toBeGreaterThanOrEqual(b.maxX);
      expect(terrain.z0 + (terrain.nz - 1) * terrain.step).toBeGreaterThanOrEqual(b.maxZ);
      // Relief lissé : aucune marche entre deux nœuds voisins dans l'emprise.
      let steepest = 0;
      for (let iz = 0; iz < terrain.nz; iz++) {
        for (let ix = 0; ix + 1 < terrain.nx; ix++) {
          const x = terrain.x0 + ix * terrain.step, z = terrain.z0 + iz * terrain.step;
          if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
          steepest = Math.max(steepest, Math.abs(terrain.heights[iz * terrain.nx + ix + 1] - terrain.heights[iz * terrain.nx + ix]) / terrain.step);
        }
      }
      expect(steepest).toBeLessThan(0.25);
    });

    it('lieux : valides, sans doublon, avec les grands repères et les lignes des stations', () => {
      const r = validatePlaces(places);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(places.length).toBeGreaterThan(2500);
      const concorde = place('square', 'Place de la Concorde');
      expect(Math.hypot(concorde.x, concorde.z)).toBeLessThan(150);
      expect(concorde.importance).toBe(3);
      const etoile = place('square', 'Place Charles de Gaulle');
      expect(Math.hypot(etoile.x - ETOILE.x, etoile.z - ETOILE.z)).toBeLessThan(120);
      const republique = place('square', 'Place de la République');
      expect(Math.hypot(republique.x - REPUBLIQUE.x, republique.z - REPUBLIQUE.z)).toBeLessThan(120);
      expect(place('station', 'Concorde').ref).toBe('1;8;12');
      expect(place('station', 'République').ref).toBe('3;5;8;9;11');
      // Une voie nommée porte le nom d'arêtes du graphe, et son point est sur l'une d'elles.
      const names = new Set(graph.edges.map((e) => e.name));
      for (const p of places) {
        if (p.kind !== 'street' && p.kind !== 'quay' && p.kind !== 'bridge') continue;
        expect(names.has(p.name), `voie « ${p.name} » sans arête`).toBe(true);
      }
      const champs = place('street', 'Avenue des Champs-Élysées');
      expect(edgesNear('Avenue des Champs-Élysées', champs.x, champs.z, 1).length).toBeGreaterThan(0);
      expect(champs.radius).toBeGreaterThan(800);
    });

    it('monuments : clés uniques, emprises valides, bâtiments et ponts rattachés', () => {
      const r = validateLandmarks(landmarks);
      expect(r.errors).toEqual([]);
      const keys = landmarks.map((l) => l.key);
      for (const k of [
        'arc_triomphe', 'tour_eiffel', 'obelisque_concorde', 'fontaines_concorde', 'fontaine_des_mers', 'louvre', 'pyramide_louvre',
        'notre_dame', 'opera_garnier', 'invalides', 'grand_palais', 'petit_palais', 'madeleine', 'palais_bourbon', 'hotel_de_ville',
        'colonne_vendome', 'colonne_juillet', 'statue_republique', 'palais_chaillot', 'pont_alexandre_iii', 'pont_neuf',
      ]) expect(keys).toContain(k);
      const used = new Set<string>();
      for (const t of tiles) for (const b of t.buildings) if (b.landmarkKey !== '') used.add(b.landmarkKey);
      for (const k of used) expect(keys).toContain(k);
      expect(used.size).toBeGreaterThanOrEqual(35);
      // Tour Eiffel : 330 m, au bord du Champ-de-Mars.
      const eiffel = landmark('tour_eiffel');
      expect(eiffel.height).toBe(330);
      expect(Math.hypot(eiffel.x - -1961, eiffel.z - 816)).toBeLessThan(30);
      // Aucun nom de monument ne reprend l'enseigne du palace de la place de la Concorde.
      for (const l of landmarks) expect(l.name).not.toMatch(/Crillon/i);
    });
  });

  describe('repères du plan de Paris', () => {
    it('Concorde : obélisque à l\'origine, fontaines, place pavée, rue Royale, pont, palais de Gabriel', () => {
      const obelisk = landmark('obelisque_concorde');
      expect(Math.hypot(obelisk.x, obelisk.z)).toBeLessThan(25);
      // Les deux fontaines sont à 64 m de l'obélisque, sur l'axe rue Royale – pont de la Concorde.
      const north = landmark('fontaines_concorde'), south = landmark('fontaine_des_mers');
      expect(Math.hypot(north.x - obelisk.x, north.z - obelisk.z)).toBeGreaterThan(55);
      expect(Math.hypot(north.x - obelisk.x, north.z - obelisk.z)).toBeLessThan(75);
      expect(north.z).toBeLessThan(obelisk.z);
      expect(south.z).toBeGreaterThan(obelisk.z);
      // Chaussées pavées de la place, rues voisines, pont.
      const ring = edgesNear('Place de la Concorde', 0, 0, 200).filter((e) => !e.pedestrianOnly);
      expect(ring.length).toBeGreaterThan(10);
      expect(ring.filter((e) => e.surface === 'sett').length).toBeGreaterThan(ring.length * 0.7);
      expect(edgesNear('Rue Royale', 0, 0, 300).length).toBeGreaterThan(0);
      expect(edgesNear('Rue de Rivoli', 0, 0, 350).length).toBeGreaterThan(0);
      expect(edgesNear('Avenue des Champs-Élysées', 0, 0, 300).length).toBeGreaterThan(0);
      const bridge = edgesNear('Pont de la Concorde', 0, 0, 450).filter((e) => e.bridge);
      expect(bridge.length).toBeGreaterThan(0);
      // Les deux palais de Gabriel ferment la place au nord ; le jardin des Tuileries la borde à l'est.
      const marked = new Set<string>();
      for (const t of tilesNear(0, 0, 400)) for (const b of t.buildings) if (b.landmarkKey !== '') marked.add(b.landmarkKey);
      expect(marked.has('hotel_marine')).toBe(true);
      expect(marked.has('hotel_crillon')).toBe(true);
      expect(buildingsNear(0, 0, 450)).toBeGreaterThan(40);
      // L'origine est sur la place : la surface nommée « Place de la Concorde » la contient.
      const named = tileAt(1, 1).surfaces.concat(tileAt(-1, -1).surfaces, tileAt(1, -1).surfaces, tileAt(-1, 1).surfaces)
        .filter((s) => s.name === 'Place de la Concorde');
      expect(named.length).toBeGreaterThan(0);
      expect(named.some((s) => pointInPolygon(s.outer, s.holes, 5, 5) || pointInPolygon(s.outer, s.holes, -5, -5))).toBe(true);
      expect(topSurfaceAt(401, 209).name === 'Jardin des Tuileries' || tileAt(401, 209).surfaces.some((s) => s.name === 'Jardin des Tuileries')).toBe(true);
      // Stations de métro de la place.
      const entrances = tilesNear(0, 0, 300).flatMap((t) => t.metroEntrances).filter((m) => m.name === 'Concorde');
      expect(entrances.length).toBeGreaterThanOrEqual(3);
      expect(entrances[0].lines).toBe('1;8;12');
    });

    it('Étoile : Arc de Triomphe, anneau à sens giratoire, douze avenues, immeubles', () => {
      const arc = landmark('arc_triomphe');
      expect(Math.hypot(arc.x - ETOILE.x, arc.z - ETOILE.z)).toBeLessThan(30);
      expect(arc.height).toBeGreaterThanOrEqual(49);
      // La façade regarde les Champs-Élysées : azimut 115° environ, soit un cap de 1,13 rad.
      expect(Math.abs(Math.atan2(Math.sin(arc.heading - 1.13), Math.cos(arc.heading - 1.13)))).toBeLessThan(0.1);
      const ring = edgesNear('Place Charles de Gaulle', ETOILE.x, ETOILE.z, 200);
      expect(ring.length).toBeGreaterThanOrEqual(8);
      for (const e of ring) expect(e.oneway).toBe(true);
      const avenues = [
        'Avenue des Champs-Élysées', 'Avenue de Friedland', 'Avenue Hoche', 'Avenue de Wagram', 'Avenue Mac-Mahon', 'Avenue Carnot',
        'Avenue de la Grande Armée', 'Avenue Foch', 'Avenue Victor Hugo', 'Avenue Kléber', "Avenue d'Iéna", 'Avenue Marceau',
      ];
      for (const name of avenues) expect(edgesNear(name, ETOILE.x, ETOILE.z, 220).length, name).toBeGreaterThan(0);
      expect(buildingsNear(ETOILE.x, ETOILE.z, 350)).toBeGreaterThan(60);
      // L'Arc est remplacé par son modèle : son bâtiment porte la clé.
      const marked = tilesNear(ETOILE.x, ETOILE.z, 100).flatMap((t) => t.buildings).filter((b) => b.landmarkKey === 'arc_triomphe');
      expect(marked.length).toBeGreaterThanOrEqual(1);
    });

    it('République : statue, boulevards, immeubles, commerces, bouches de métro', () => {
      const statue = landmark('statue_republique');
      expect(Math.hypot(statue.x - REPUBLIQUE.x, statue.z - REPUBLIQUE.z)).toBeLessThan(30);
      for (const name of ['Place de la République', 'Boulevard du Temple', 'Boulevard Voltaire', 'Boulevard de Magenta', 'Boulevard Saint-Martin', 'Avenue de la République', 'Rue du Faubourg du Temple']) {
        expect(edgesNear(name, REPUBLIQUE.x, REPUBLIQUE.z, 350).length, name).toBeGreaterThan(0);
      }
      expect(buildingsNear(REPUBLIQUE.x, REPUBLIQUE.z, 350)).toBeGreaterThan(150);
      const near = tilesNear(REPUBLIQUE.x, REPUBLIQUE.z, 350);
      const shops = near.flatMap((t) => t.shops).filter((s) => Math.hypot(s.x - REPUBLIQUE.x, s.z - REPUBLIQUE.z) <= 350);
      expect(shops.length).toBeGreaterThan(100);
      const entrances = near.flatMap((t) => t.metroEntrances).filter((m) => m.name === 'République');
      expect(entrances.length).toBeGreaterThanOrEqual(4);
      for (const m of entrances) expect(m.lines).toBe('3;5;8;9;11');
      // La place est piétonne en son centre : ni chaussée ni bâtiment au pied de la statue.
      const ground = topSurfaceAt(REPUBLIQUE.x + 25, REPUBLIQUE.z - 25);
      expect(['sidewalk', 'plaza', 'pedestrian', 'water']).toContain(ground.kind);
    });

    it('Pont Neuf : de l\'eau sous le pont, au niveau du fleuve, et un tablier porté par une arête', () => {
      for (const key of ['pont_neuf', 'pont_neuf_petit_bras']) {
        const lm = landmark(key);
        // Le pont est à la pointe ouest de l'île de la Cité.
        expect(Math.hypot(lm.x - 1485, lm.z - 927), key).toBeLessThan(160);
        const top = topSurfaceAt(lm.x, lm.z);
        expect(top.kind, `${key} : surface au milieu du pont`).toBe('water');
        expect(top.name).toBe('La Seine');
        expect(top.level).toBeCloseTo(manifest.waterLevel, 5);
        // Le sol de part et d'autre est plus haut que l'eau : le pont a de la hauteur.
        expect(sampleTerrain(terrain, lm.x, lm.z) - manifest.waterLevel).toBeGreaterThan(3);
        const deck = graph.edges.filter((e) => e.bridge && e.landmarkKey === key);
        expect(deck.length, `${key} : arêtes du tablier`).toBeGreaterThan(0);
        expect(Math.min(...deck.map((e) => distToPolyline(e.points, lm.x, lm.z)))).toBeLessThan(12);
        for (const e of deck) expect(e.name).toBe('Pont Neuf');
        // Aucun bâtiment sur le pont.
        for (const t of tilesNear(lm.x, lm.z, 0)) {
          for (const b of t.buildings) expect(pointInPolygon(b.outer, b.holes, lm.x, lm.z)).toBe(false);
        }
      }
      // L'île de la Cité, elle, est à sec : place Dauphine, juste à l'est du pont.
      const dauphine = place('square', 'Place Dauphine');
      expect(topSurfaceAt(dauphine.x, dauphine.z).kind).not.toBe('water');
    });
  });

  describe('carte entière', () => {
    it('validateMapData ne trouve aucune erreur (références croisées comprises)', () => {
      const r = validateMapData({ manifest, tiles, roadGraph: graph, places, landmarks, terrain });
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    });
  });
});
