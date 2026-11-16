/* =====================================================================================
 * Rasterisation de la grille de surfaces d'une tuile (voir raster.ts pour l'ordre de peinture).
 * Exécuté à la première requête de surface dans une tuile, puis complété quand une tuile
 * voisine se charge (ses bâtiments peuvent déborder).
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';
import type { RoadGraph, Tile } from '../mapdata';
import type { WorldBase } from './base';
import { CAP_STRIDE, SOLID_LANDMARK, SOLID_WATER } from './collision';
import type { CollisionBucket } from './collision';
import {
  CODE_BRIDGE, CODE_BUILDING, CODE_PLAZA, CODE_ROAD, CODE_SETT, CODE_SIDEWALK, CODE_UNSET, CODE_WATER, TileGrid,
  codeOfCarriageway, codeOfMapSurface, codeOfPedestrianWay, fillPolygon, heightToDm, paintCapsule, paintPolyline,
} from './raster';
import type { TileEntry } from './tiles';

function paintBuildings(grid: TileGrid, tile: Tile, replaced: ReadonlySet<string>): void {
  const minX = grid.ox, minZ = grid.oz, maxX = grid.ox + TILE_SIZE, maxZ = grid.oz + TILE_SIZE;
  const own = tile.tx * TILE_SIZE === grid.ox && tile.tz * TILE_SIZE === grid.oz;
  for (const b of tile.buildings) {
    if (b.landmarkKey !== '' && replaced.has(b.landmarkKey)) continue;
    if (!own) {
      // Bâtiment d'une tuile voisine : seulement s'il déborde sur cette grille.
      const o = b.outer;
      let hit = false;
      for (let i = 0; i + 1 < o.length && !hit; i += 2) hit = o[i] >= minX && o[i] <= maxX && o[i + 1] >= minZ && o[i + 1] <= maxZ;
      if (!hit) continue;
    }
    fillPolygon(grid, b.holes.length === 0 ? [b.outer] : [b.outer, ...b.holes], CODE_BUILDING, heightToDm(b.height), 0);
  }
}

/** Obstacles de monuments d'un lot (piliers, socles, emprises de secours) : bâti, avec leur hauteur. */
function paintLandmarkSolids(grid: TileGrid, bucket: CollisionBucket): void {
  for (let q = 0; q < bucket.polyCount; q++) {
    if (bucket.polyKind[q] !== SOLID_LANDMARK) continue;
    const rings: Float32Array[] = [];
    for (let r = bucket.polyRing0[q], end = bucket.polyRing0[q + 1]; r < end; r++) {
      rings.push(bucket.xz.subarray(bucket.ringPt0[r] * 2, bucket.ringPt0[r + 1] * 2));
    }
    fillPolygon(grid, rings, CODE_BUILDING, heightToDm(bucket.polyHeight[q]), 0);
  }
}

/** Passages de voies sous les bâtiments d'un lot : le sol y redevient celui de la voie. */
function paintPassages(grid: TileGrid, bucket: CollisionBucket, graph: RoadGraph): void {
  for (let q = 0; q < bucket.polyCount; q++) {
    if (bucket.polyKind[q] === SOLID_WATER) continue;
    for (let c = bucket.polyCap0[q], end = bucket.polyCap0[q + 1]; c < end; c++) {
      const o = c * CAP_STRIDE;
      const ed = graph.edges[bucket.capEdge[c]];
      const code = ed === undefined ? CODE_SIDEWALK : ed.pedestrianOnly ? codeOfPedestrianWay(ed) : codeOfCarriageway(ed);
      paintCapsule(grid, bucket.caps[o], bucket.caps[o + 1], bucket.caps[o + 2], bucket.caps[o + 3], bucket.caps[o + 4], code, true, true, 0, 1 << CODE_BUILDING, 0);
    }
  }
}

export function buildTileGrid(base: WorldBase, entry: TileEntry, edgeScratch: number[]): TileGrid {
  const tile = entry.tile as Tile;
  const replaced = base.landmarkSet.replaced;
  const grid = new TileGrid(entry.tx * TILE_SIZE, entry.tz * TILE_SIZE);
  grid.kinds.fill(CODE_UNSET);
  // 1-2. Surfaces de la carte, dans leur ordre de superposition.
  let explicitRoads = false;
  for (const s of tile.surfaces) {
    if (s.kind === 'road') explicitRoads = true;
    fillPolygon(grid, s.holes.length === 0 ? [s.outer] : [s.outer, ...s.holes], codeOfMapSurface(s.kind), -1, 0);
  }
  // Arêtes du graphe qui touchent la tuile.
  const roads = base.roads;
  const margin = 64;
  const count = roads.querySegments(grid.ox - margin, grid.oz - margin, grid.ox + TILE_SIZE + margin, grid.oz + TILE_SIZE + margin, edgeScratch);
  const edges = new Set<number>();
  for (let k = 0; k < count; k++) edges.add(roads.segEdge[edgeScratch[k]]);
  const graph = base.decoded.roadGraph;
  const water = 1 << CODE_WATER, road = 1 << CODE_ROAD, sett = 1 << CODE_SETT;
  // 3. Voies piétonnes : jamais par-dessus l'eau ni une chaussée.
  for (const e of edges) {
    const ed = graph.edges[e];
    if (ed.tunnel || !ed.pedestrianOnly || ed.bridge) continue;
    paintPolyline(grid, ed.points, Math.max(0.75, ed.width / 2), codeOfPedestrianWay(ed), true, water | road | sett, 0, -1);
  }
  // 4. Chaussées. Si la carte fournit les emprises de chaussée (polygones « road »), elles font
  //    foi : la largeur estimée d'une arête ne déborde ni sur un trottoir ni sur un jardin, elle ne
  //    comble que les zones sans information (voies privées, cours). Sinon, l'arête épaissie EST la chaussée.
  const weak = (1 << CODE_UNSET) | (1 << CODE_PLAZA);
  for (const e of edges) {
    const ed = graph.edges[e];
    if (ed.tunnel || ed.pedestrianOnly || ed.bridge) continue;
    if (explicitRoads) paintPolyline(grid, ed.points, ed.width / 2, codeOfCarriageway(ed), true, 0, weak, -1);
    else paintPolyline(grid, ed.points, ed.width / 2, codeOfCarriageway(ed), true, water, 0, -1);
  }
  if (explicitRoads) {
    // Les pavés ne sont connus que du graphe : une chaussée fournie par la carte devient pavée
    // le long d'une arête pavée.
    for (const e of edges) {
      const ed = graph.edges[e];
      if (ed.tunnel || ed.bridge || ed.surface !== 'sett') continue;
      // Élargi de 4 m : la largeur de l'arête est une estimation, et seule une chaussée peut être convertie.
      paintPolyline(grid, ed.points, ed.width / 2 + 4, CODE_SETT, true, 0, road, -1);
    }
  }
  // 5. Tabliers des ponts.
  for (const e of edges) {
    const ed = graph.edges[e];
    if (ed.tunnel || !ed.bridge) continue;
    paintPolyline(grid, ed.points, roads.halfDeck[e], CODE_BRIDGE, false, 0, 0, -1);
  }
  // Ce qui n'est rien d'autre est de l'espace public piéton.
  const kinds = grid.kinds;
  for (let i = 0; i < kinds.length; i++) if (kinds[i] === CODE_UNSET) kinds[i] = CODE_SIDEWALK;
  // 6. Bâtiments : ceux de la tuile, puis ceux des voisines qui débordent ; obstacles des monuments.
  paintBuildings(grid, tile, replaced);
  const store = base.store;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const n = store.entry(entry.tx + dx, entry.tz + dz);
      if (n !== null && n.tile !== null) paintBuildings(grid, n.tile, replaced);
      if (n !== null && n.bucket !== null) paintLandmarkSolids(grid, n.bucket);
    }
  }
  paintLandmarkSolids(grid, base.landmarkBucket);
  if (entry.bucket !== null) paintLandmarkSolids(grid, entry.bucket);
  // 7. Porches.
  if (entry.bucket !== null) paintPassages(grid, entry.bucket, graph);
  paintPassages(grid, base.landmarkBucket, graph);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const n = store.entry(entry.tx + dx, entry.tz + dz);
      if (n !== null && n.bucket !== null) paintPassages(grid, n.bucket, graph);
    }
  }
  return grid;
}

/**
 * Une tuile voisine vient de se charger : ses bâtiments (et obstacles de monuments, et porches) qui
 * débordent sur cette grille y sont ajoutés.
 */
export function patchNeighbourGrid(base: WorldBase, grid: TileGrid, tile: Tile, bucket: CollisionBucket): void {
  paintBuildings(grid, tile, base.landmarkSet.replaced);
  paintLandmarkSolids(grid, bucket);
  paintPassages(grid, bucket, base.decoded.roadGraph);
}
