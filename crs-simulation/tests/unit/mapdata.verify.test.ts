// Carte de Paris — non-régression des défauts trouvés à la vérification indépendante de la carte
// (docs/map-verification.md). Chaque test porte sur un défaut corrigé dans tools/map/build*.mjs :
// s'il réapparaît, c'est ici qu'on le voit. Les mesures complètes sont dans tools/map/verify-map.mjs.
// Dossier lu : public/data/paris, ou celui de la variable d'environnement CRS_PARIS_DATA.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAP_FILES, decodeLandmarks, decodePlaces, decodeRoadGraph, decodeTile, parseManifest, pointInPolygon, pointInRing } from '../../src/world/mapdata';
import type { Building, Landmark, Manifest, Place, RoadEdge, RoadGraph, Surface, Tile } from '../../src/world/mapdata';

const dir = process.env.CRS_PARIS_DATA ?? path.resolve(__dirname, '../../public/data/paris');
const read = (rel: string): string => readFileSync(path.join(dir, rel), 'utf8');

let manifest: Manifest;
let tiles: Tile[] = [];
let graph: RoadGraph;
let places: Place[] = [];
let landmarks: Landmark[] = [];
/** Toutes les chaînes publiées (tables des tuiles, graphe, lieux, monuments). */
const strings = new Set<string>();

// Index des bâtiments par cellule de 32 m.
const cells = new Map<number, Building[]>();
const cellKey = (cx: number, cz: number): number => cx * 100003 + cz;
function buildingAt(x: number, z: number): Building | null {
  for (const b of cells.get(cellKey(Math.floor(x / 32), Math.floor(z / 32))) ?? []) {
    if (pointInPolygon(b.outer, b.holes, x, z)) return b;
  }
  return null;
}

function distToRing(ring: Float32Array, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const ax = ring[i], az = ring[i + 1], dx = ring[j] - ax, dz = ring[j + 1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Profondeur (m) d'un point dans l'emprise d'un bâtiment : 0 s'il est dehors. */
function depthInBuilding(x: number, z: number): number {
  const b = buildingAt(x, z);
  if (b === null) return 0;
  let d = distToRing(b.outer, x, z);
  for (const h of b.holes) d = Math.min(d, distToRing(h, x, z));
  return d;
}

const isDrivable = (e: RoadEdge): boolean => !e.pedestrianOnly && e.roadClass !== 'footway' && e.roadClass !== 'pedestrian';
const norm = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

describe('carte de Paris — défauts corrigés à la vérification', () => {
  beforeAll(() => {
    if (!existsSync(path.join(dir, MAP_FILES.manifest))) {
      throw new Error(`données de carte absentes de ${dir} : lancer « node tools/map/build.mjs »`);
    }
    manifest = parseManifest(JSON.parse(read(MAP_FILES.manifest)));
    tiles = manifest.tiles.map((t) => {
      const raw = JSON.parse(read(t.file)) as { str?: string[] };
      for (const s of raw.str ?? []) strings.add(s);
      return decodeTile(raw as never);
    });
    const rawGraph = JSON.parse(read(manifest.files.roadGraph)) as { str?: string[] };
    for (const s of rawGraph.str ?? []) strings.add(s);
    graph = decodeRoadGraph(rawGraph as never);
    places = decodePlaces(JSON.parse(read(manifest.files.places)));
    landmarks = decodeLandmarks(JSON.parse(read(manifest.files.landmarks)));
    for (const p of places) strings.add(p.name);
    for (const l of landmarks) strings.add(l.name);
    for (const t of tiles) {
      for (const b of t.buildings) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < b.outer.length; i += 2) {
          minX = Math.min(minX, b.outer[i]); maxX = Math.max(maxX, b.outer[i]);
          minZ = Math.min(minZ, b.outer[i + 1]); maxZ = Math.max(maxZ, b.outer[i + 1]);
        }
        for (let cx = Math.floor(minX / 32); cx <= Math.floor(maxX / 32); cx++) {
          for (let cz = Math.floor(minZ / 32); cz <= Math.floor(maxZ / 32); cz++) {
            const k = cellKey(cx, cz);
            const list = cells.get(k);
            if (list === undefined) cells.set(k, [b]); else list.push(b);
          }
        }
      }
    }
  });

  it('aucun mur de quai au-dessus du canal couvert (boulevard Richard-Lenoir, place de la Bastille)', () => {
    // La voûte du canal Saint-Martin va de la rue du Faubourg-du-Temple au bassin de l'Arsenal : en surface, ni eau ni quai.
    const water: Surface[] = [];
    for (const t of tiles) for (const s of t.surfaces) if (s.kind === 'water') water.push(s);
    const nearWater = (x: number, z: number, r: number): boolean => {
      for (const s of water) {
        if (pointInPolygon(s.outer, s.holes, x, z) || distToRing(s.outer, x, z) <= r) return true;
        for (const h of s.holes) if (distToRing(h, x, z) <= r) return true;
      }
      return false;
    };
    let walls = 0, stray = 0;
    for (const t of tiles) {
      for (const b of t.barriers) {
        if (b.kind !== 'quay_wall') continue;
        walls++;
        // Le milieu de chaque mur de quai est à moins de 50 m d'une eau à ciel ouvert.
        const m = Math.floor(b.points.length / 4) * 2;
        if (!nearWater(b.points[m], b.points[m + 1], 50)) stray++;
      }
    }
    expect(walls).toBeGreaterThan(200);
    expect(stray).toBe(0);
    // Deux points de l'ancien tracé fautif : le terre-plein du boulevard Richard-Lenoir et le centre de la place de la Bastille.
    for (const [x, z] of [[3470, 700], [3500, 1300]]) {
      for (const t of tiles) {
        for (const b of t.barriers) {
          if (b.kind !== 'quay_wall') continue;
          for (let i = 0; i < b.points.length; i += 2) expect(Math.hypot(b.points[i] - x, b.points[i + 1] - z)).toBeGreaterThan(60);
        }
      }
    }
  });

  it('le graphe n\'a aucune boucle : une arête ne revient jamais à son nœud de départ', () => {
    expect(graph.edges.filter((e) => e.a === e.b)).toEqual([]);
  });

  it('un nœud de limite est un bout de voie : bord de la carte ou bouche de souterrain', () => {
    const b = manifest.bounds;
    let atEdge = 0, mouths = 0;
    for (const n of graph.nodes) {
      if (!n.boundary) continue;
      const inside = n.x > b.minX + 30 && n.x < b.maxX - 30 && n.z > b.minZ + 30 && n.z < b.maxZ - 30;
      if (inside) {
        mouths++;
        expect(n.edges.filter((i) => isDrivable(graph.edges[i])).length).toBe(1);
      } else {
        atEdge++;
        expect(n.edges.length).toBe(1);
      }
    }
    expect(atEdge).toBeGreaterThan(200);
    // Les voies souterraines sont retirées du graphe : là où elles commençaient, la chaussée de surface « sort » de la carte.
    expect(mouths).toBeGreaterThan(30);
    // La voie Georges-Pompidou plonge sous les Tuileries à l'est de la Concorde : sa trémie se termine par un nœud de limite.
    const pompidou = graph.edges.filter((e) => e.name === 'Voie Georges-Pompidou');
    expect(pompidou.length).toBeGreaterThan(0);
    expect(pompidou.some((e) => graph.nodes[e.a].boundary || graph.nodes[e.b].boundary)).toBe(true);
  });

  it('arbres, mobilier et feux ne sont jamais dans l\'emprise d\'un bâtiment', () => {
    // Tolérance de 20 cm : un point posé pile sur un mur tombe d'un côté ou de l'autre selon l'arrondi au décimètre.
    let trees = 0, furniture = 0, signals = 0;
    for (const t of tiles) {
      for (let i = 0; i < t.trees.count; i++) if (depthInBuilding(t.trees.x[i], t.trees.z[i]) > 0.2) trees++;
      for (const f of t.furniture) if (depthInBuilding(f.x, f.z) > 0.2) furniture++;
      for (const s of t.signals) if (depthInBuilding(s.x, s.z) > 0.2) signals++;
    }
    expect({ trees, furniture, signals }).toEqual({ trees: 0, furniture: 0, signals: 0 });
  });

  it('les bouches de métro sont sur la voie publique, pas dans un bâtiment', () => {
    // La foule sort par les bouches : un accès relevé dans une gare ou un immeuble est reporté devant la façade.
    const inside: string[] = [];
    let total = 0;
    for (const t of tiles) {
      for (const m of t.metroEntrances) {
        total++;
        if (depthInBuilding(m.x, m.z) > 0.3) inside.push(m.name);
      }
    }
    expect(total).toBeGreaterThan(400);
    // Reste connu : la halle de la gare de l'Est, dont l'emprise recouvre son propre parvis.
    expect(inside.length).toBeLessThanOrEqual(4);
    for (const name of inside) expect(name).toBe('Gare de l\'Est');
  });

  it('chaque trou d\'une surface est dans son contour', () => {
    let bad = 0;
    for (const t of tiles) {
      for (const s of t.surfaces) {
        for (const h of s.holes) {
          for (let i = 0; i < h.length; i += 2) {
            if (!pointInRing(s.outer, h[i], h[i + 1]) && distToRing(s.outer, h[i], h[i + 1]) > 0.15) { bad++; break; }
          }
        }
      }
    }
    expect(bad).toBe(0);
  });

  it('les passerelles ont leur vraie largeur, pas celle d\'un sentier', () => {
    const width = (name: string): number => Math.max(...graph.edges.filter((e) => e.name === name && e.bridge).map((e) => e.width));
    expect(width('Pont des Arts')).toBeGreaterThanOrEqual(9);
    expect(width('Pont des Arts')).toBeLessThanOrEqual(13);
    expect(width('Passerelle Léopold-Sédar-Senghor')).toBeGreaterThanOrEqual(10);
    expect(width('Passerelle Debilly')).toBe(8);
    // Un cheminement qui longe la chaussée d'un pont routier reste un trottoir étroit.
    for (const e of graph.edges) if (e.bridge && e.roadClass === 'footway' && e.name === '') expect(e.width).toBeLessThanOrEqual(25);
  });

  it('aucune enseigne ni établissement commercial relevé à la relecture ne subsiste', () => {
    const banned = [
      'baccarat', 'grevin', 'banksy', 'gainsbourg', 'alaia', 'mundolingua', 'bpifrance', 'credit municipal', 'point show', 'theatre daunou',
      'au gagne petit', 'au planteur', 'musee du chocolat', 'musee du vin', 'musee de la magie', 'galeries lafayette', 'samaritaine', 'fragonard',
      'bateaux parisiens', 'yves saint laurent', 'galerie berri washington', 'galerie elysees', 'isec', 'mod spe',
    ];
    const hits: string[] = [];
    for (const s of strings) {
      const k = ` ${norm(s)} `;
      for (const b of banned) if (k.includes(` ${b} `)) hits.push(s);
    }
    expect(hits).toEqual([]);
    // Libellés qui ne sont pas des lieux (pièces d'un bâtiment, mots isolés) : retirés des lieux nommés.
    const junk = new Set(['direction', 'reserve', 'recherche reseau', 'emploi du temps materiel', 'vie associative', 'aumonerie', 'potager', 'fruitier paris']);
    expect(places.filter((p) => junk.has(norm(p.name))).map((p) => p.name)).toEqual([]);
    // Les toponymes publics homonymes d'une enseigne restent : ils ne doivent pas être emportés par le filtre.
    for (const keep of ['Rue de Longchamp', 'Rue Scribe', 'Rue Drouot', 'Rue de Mogador', 'Église Saint-Laurent']) expect(strings.has(keep), keep).toBe(true);
  });

  it('les monuments majeurs sont à leur place (positions Wikidata, à 40 m près ou dans l\'emprise)', () => {
    const LON0 = 2.321236, LAT0 = 48.865633;
    const refs: [string, number, number][] = [
      ['arc_triomphe', 48.87378, 2.29504], ['tour_eiffel', 48.858296, 2.294479], ['obelisque_concorde', 48.865475, 2.321133],
      ['notre_dame', 48.853, 2.3498], ['opera_garnier', 48.871944, 2.331667], ['pyramide_louvre', 48.861, 2.335861],
      ['colonne_vendome', 48.867469, 2.329414], ['colonne_juillet', 48.853056, 2.369167], ['statue_republique', 48.86751, 2.363818],
      ['madeleine', 48.87, 2.324444], ['sainte_chapelle', 48.855369, 2.345028], ['centre_pompidou', 48.860642, 2.352245],
    ];
    for (const [key, lat, lon] of refs) {
      const lm = landmarks.find((l) => l.key === key);
      expect(lm, key).toBeDefined();
      if (lm === undefined) continue;
      const x = (lon - LON0) * 73305, z = -(lat - LAT0) * 111214;
      const ok = pointInRing(lm.footprint, x, z) || Math.hypot(lm.x - x, lm.z - z) <= 40;
      expect(ok, `${key} : ancrage (${lm.x.toFixed(0)} ; ${lm.z.toFixed(0)}), attendu (${x.toFixed(0)} ; ${z.toFixed(0)})`).toBe(true);
    }
  });
});
