/* =====================================================================================
 * Points d'apparition : un point libre aléatoire, sur la surface voulue, relié à une rue.
 * ===================================================================================== */

import type { Vec2 } from '@/core/contracts';
import type { CollisionWorld } from './collision';
import { CODE_BRIDGE, CODE_BUILDING, CODE_PLAZA, CODE_ROAD, CODE_SETT, CODE_SIDEWALK, CODE_VOID, CODE_WATER } from './raster';
import type { RoadNetwork } from './roads';
import { ROAD_ANY, ROAD_DRIVABLE } from './roads';

export type SpawnSurface = 'sidewalk' | 'road' | 'any';

/** Ce dont la recherche a besoin du monde : la nature du sol en un point. */
export interface SurfaceLookup {
  surfaceCodeAt(x: number, z: number): number;
}

/** Rayon libre exigé autour d'un point d'apparition (m). */
const SPAWN_CLEARANCE = 0.45;
/** Nombre d'essais : tirages uniformes, puis tirages guidés par le réseau. */
const SPAWN_TRIES = 32;
const SPAWN_GUIDED_TRIES = 24;
/** Distance maximale d'un point d'apparition au réseau de rues (m). */
const SPAWN_ROAD_DISTANCE = 120;

/**
 * Un point convient-il pour faire apparaître quelqu'un ? Sol de la bonne nature, disque libre,
 * et liaison en ligne droite avec l'axe d'une voie proche (jamais dans une cour fermée, ni
 * derrière une grille). Sur un pont : la chaussée vaut « road », les trottoirs « sidewalk ».
 */
function acceptSpawn(world: SurfaceLookup, collision: CollisionWorld, roads: RoadNetwork, px: number, pz: number, surface: SpawnSurface): boolean {
  const code = world.surfaceCodeAt(px, pz);
  if (code === CODE_VOID || code === CODE_WATER || code === CODE_BUILDING) return false;
  if (code === CODE_BRIDGE) {
    if (!roads.nearest(px, pz, 60, ROAD_ANY)) return false;
    const ed = roads.edges[roads.snapEdge];
    const onCarriageway = !ed.pedestrianOnly && roads.snapDist <= ed.width / 2;
    if (surface === 'road' ? !onCarriageway : surface === 'sidewalk' && onCarriageway) return false;
  } else if (surface === 'sidewalk') {
    if (code !== CODE_SIDEWALK && code !== CODE_PLAZA) return false;
  } else if (surface === 'road') {
    if (code !== CODE_ROAD && code !== CODE_SETT) return false;
  }
  if (!collision.isFree(px, pz, SPAWN_CLEARANCE)) return false;
  if (surface === 'road') {
    if (!roads.nearest(px, pz, 40, ROAD_DRIVABLE)) return false;
    return roads.snapDist <= roads.edges[roads.snapEdge].width / 2 + 0.5;
  }
  if (!roads.nearest(px, pz, SPAWN_ROAD_DISTANCE, ROAD_ANY)) return false;
  return !collision.blocked(px, pz, roads.snapX, roads.snapZ);
}

/**
 * Point libre aléatoire autour de (x, z). 'sidewalk' : trottoir ou place ; 'road' : sur la
 * chaussée d'une voie carrossable ; 'any' : tout sol praticable. D'abord des tirages uniformes
 * dans le disque ; s'ils échouent (peu de surface voulue alentour), des tirages guidés par le
 * réseau : un point de la voie la plus proche, décalé vers la chaussée ou vers un trottoir.
 */
export function findSpawnPoint(
  world: SurfaceLookup, collision: CollisionWorld, roads: RoadNetwork,
  x: number, z: number, radius: number, surface: SpawnSurface, rand: () => number, out: Vec2,
): boolean {
  for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!acceptSpawn(world, collision, roads, px, pz, surface)) continue;
    out.x = px;
    out.z = pz;
    return true;
  }
  const filter = surface === 'road' ? ROAD_DRIVABLE : ROAD_ANY;
  for (let attempt = 0; attempt < SPAWN_GUIDED_TRIES; attempt++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    if (!roads.nearest(x + Math.cos(a) * r, z + Math.sin(a) * r, radius, filter)) continue;
    const s = roads.snapSeg, ed = roads.edges[roads.snapEdge];
    const sx = roads.snapX, sz = roads.snapZ;
    const dx = roads.segXZ[4 * s + 2] - roads.segXZ[4 * s], dz = roads.segXZ[4 * s + 3] - roads.segXZ[4 * s + 1];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) continue;
    let offset: number;
    if (surface === 'road') {
      offset = (rand() - 0.5) * Math.max(0, ed.width - 1.2);
    } else if (surface === 'sidewalk') {
      const side = rand() < 0.5 ? -1 : 1;
      offset = side * (ed.width / 2 + 0.6 + rand() * Math.max(1, ed.sidewalk - 1.2));
    } else {
      offset = (rand() - 0.5) * (ed.width + 2 * ed.sidewalk);
    }
    const px = sx - (dz / len) * offset, pz = sz + (dx / len) * offset;
    const ex = px - x, ez = pz - z;
    if (ex * ex + ez * ez > radius * radius) continue;
    if (!acceptSpawn(world, collision, roads, px, pz, surface)) continue;
    out.x = px;
    out.z = pz;
    return true;
  }
  return false;
}
