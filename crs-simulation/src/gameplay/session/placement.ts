/* =====================================================================================
 * MISE EN PLACE DE SESSION — géométrie : où se tient le joueur, où s'aligne son groupe, où stationne
 * le fourgon. Logique pure : ne lit que WorldQuery (et PropApi pour éviter le mobilier).
 *
 * Rappel du repère : cap h → avant = (sin h, cos h), droite = (−cos h, sin h).
 * ===================================================================================== */

import type { GameContext, LandmarkInfo, RoadSample, SurfaceKind, Vec2 } from '@/core/contracts';

export interface Stand {
  x: number;
  z: number;
  /** Cap de la mise en place : le groupe fait face à ce cap. */
  heading: number;
  /** Repère auquel on fait face (clé), '' si aucun. */
  facing: string;
}

/** Rayon dans lequel un repère de la carte sert de point de mire. */
const LANDMARK_REACH = 130;
/** Distances d'essai au point de mire (m), de la préférée à la moins bonne. */
const RINGS: readonly number[] = [40, 48, 34, 56, 28, 66];
const DIRECTIONS = 16;
/** Rayon d'emprise au-delà duquel un repère est un grand édifice (on reste alors sur le lieu demandé). */
const COMPACT_REACH = 35;
/** On ne s'éloigne jamais de plus de cette distance du lieu demandé (m). */
const MAX_FROM_PLACE = 110;
/** Demi-largeur de front à garder libre (m) et recul du second rang. */
const FRONT_HALF = 4;
export const RANK_DEPTH = 1.6;
export const FILE_SPACING = 0.95;

const WALKABLE: Readonly<Record<SurfaceKind, number>> = {
  // préférence de sol pour se mettre en place : esplanade et pavés d'abord, jamais l'eau ni le bâti
  plaza: 3, sett: 3, sidewalk: 2.5, gravel: 2, park: 1.5, quay: 2, bridge: 1, road: 1, interior: 0, water: -1, building: -1, void: -1,
};

function nearestLandmark(ctx: GameContext, x: number, z: number): LandmarkInfo | null {
  let best: LandmarkInfo | null = null;
  let bestD = LANDMARK_REACH;
  const list = ctx.world.landmarks;
  for (let i = 0; i < list.length; i++) {
    const lm = list[i]!;
    const d = Math.hypot(lm.x - x, lm.z - z);
    if (d < bestD) {
      bestD = d;
      best = lm;
    }
  }
  return best;
}

/** Part des emplacements d'un front de deux rangs qui sont libres (0..1). */
function frontClearance(ctx: GameContext, x: number, z: number, heading: number): number {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -fz;
  const rz = fx;
  let free = 0;
  let total = 0;
  for (let rank = 0; rank < 2; rank++) {
    for (let k = -FRONT_HALF; k <= FRONT_HALF; k++) {
      const px = x + rx * k - fx * RANK_DEPTH * rank;
      const pz = z + rz * k - fz * RANK_DEPTH * rank;
      total++;
      if (ctx.world.isFree(px, pz, 0.4) && WALKABLE[ctx.world.surfaceAt(px, pz)] > 0) free++;
    }
  }
  return free / total;
}

const roadSample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
const tmp: Vec2 = { x: 0, z: 0 };

/**
 * Choisit l'emplacement de départ autour du lieu (x, z).
 * - Près d'un repère (obélisque, colonne, fontaine, statue) : à quelques dizaines de mètres, face à lui, sur
 *   un sol dégagé, de préférence au sud (le soleil dans le dos l'après-midi, la façade éclairée devant soi).
 * - Sinon : sur place (rue, avenue), dans l'axe de la voie la plus proche.
 */
export function chooseStand(ctx: GameContext, x: number, z: number, rand: () => number): Stand {
  const world = ctx.world;
  const lm = nearestLandmark(ctx, x, z);
  if (lm) {
    let best: Stand | null = null;
    let bestScore = -Infinity;
    // rayon de l'emprise du repère : on se place à distance de ses murs, pas de son centre
    let reach = 0;
    for (let i = 0; i + 1 < lm.footprint.length; i += 2) {
      const d = Math.hypot(lm.footprint[i]! - lm.x, lm.footprint[i + 1]! - lm.z);
      if (d > reach && Number.isFinite(d)) reach = d;
    }
    // un grand édifice (palais, église) se regarde depuis le lieu lui-même : pas de ronde autour de ses murs
    const compact = reach <= COMPACT_REACH;
    for (let r = 0; compact && r < RINGS.length; r++) {
      const ring = RINGS[r]! + reach;
      for (let k = 0; k < DIRECTIONS; k++) {
        const a = (k / DIRECTIONS) * Math.PI * 2;
        const cx = lm.x + Math.sin(a) * ring;
        const cz = lm.z + Math.cos(a) * ring;
        if (Math.hypot(cx - x, cz - z) > MAX_FROM_PLACE) continue;
        const ground = WALKABLE[world.surfaceAt(cx, cz)];
        if (!(ground > 0) || !world.isFree(cx, cz, 0.6)) continue;
        const heading = a + Math.PI; // on regarde le repère
        const clearance = frontClearance(ctx, cx, cz, heading);
        if (clearance < 0.75) continue;
        let score = clearance * 6 + ground - r * 0.6;
        if (world.isFree(cx, cz, 5)) score += 2;
        if (world.lineOfSight(cx, cz, lm.x + Math.sin(a) * 6, lm.z + Math.cos(a) * 6)) score += 2;
        score += Math.cos(a) * 1.2; // préférence pour le côté sud du repère
        // rester du côté du lieu demandé quand le repère en est éloigné
        score -= Math.hypot(cx - x, cz - z) * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, z: cz, heading: wrap(heading), facing: lm.key };
        }
      }
    }
    if (best) return best;
  }

  // pas de repère (ou aucun emplacement dégagé autour) : sur place, dans l'axe de la voie
  let sx = x;
  let sz = z;
  if (!(world.isFree(x, z, 0.6) && WALKABLE[world.surfaceAt(x, z)] > 0)) {
    for (let radius = 10; radius <= 80; radius *= 2) {
      if (world.randomFreePoint(x, z, radius, 'any', rand, tmp)) {
        sx = tmp.x;
        sz = tmp.z;
        break;
      }
    }
  }
  let heading = 0;
  if (lm) heading = Math.atan2(lm.x - sx, lm.z - sz);
  else if (world.nearestRoad(sx, sz, roadSample, 60)) heading = roadSample.heading;
  return { x: sx, z: sz, heading: wrap(heading), facing: lm ? lm.key : '' };
}

function wrap(a: number): number {
  let h = a % (Math.PI * 2);
  if (h > Math.PI) h -= Math.PI * 2;
  else if (h <= -Math.PI) h += Math.PI * 2;
  return h;
}

/**
 * Emplacement n° `index` d'un front de `perRank` personnes par rang, centré sur (stand), face à stand.heading.
 * Le rang 0 est devant ; les files sont jointives (boucliers côte à côte). Écrit dans `out`.
 */
export function lineSlot(stand: Stand, index: number, perRank: number, out: Vec2): void {
  const rank = Math.floor(index / perRank);
  const file = index % perRank;
  const inRank = perRank;
  const fx = Math.sin(stand.heading);
  const fz = Math.cos(stand.heading);
  const rx = -fz;
  const rz = fx;
  const lateral = (file - (inRank - 1) / 2) * FILE_SPACING;
  out.x = stand.x + rx * lateral - fx * RANK_DEPTH * rank;
  out.z = stand.z + rz * lateral - fz * RANK_DEPTH * rank;
}

/**
 * Rend un point praticable au plus près de `pos` : le point lui-même s'il est libre, sinon un point libre
 * tiré alentour. Le mobilier urbain est contourné (resolveCircle du décor). Retourne false si rien n'est libre.
 */
export function settle(ctx: GameContext, pos: Vec2, radius: number, rand: () => number): boolean {
  const world = ctx.world;
  const ok = (): boolean => world.isFree(pos.x, pos.z, radius) && WALKABLE[world.surfaceAt(pos.x, pos.z)] > 0;
  if (!ok()) {
    const ox = pos.x;
    const oz = pos.z;
    let found = false;
    for (let reach = 3; reach <= 24 && !found; reach *= 2) {
      for (let tries = 0; tries < 6 && !found; tries++) {
        if (world.randomFreePoint(ox, oz, reach, 'any', rand, pos) && ok()) found = true;
      }
    }
    if (!found) {
      pos.x = ox;
      pos.z = oz;
      return false;
    }
  }
  ctx.props.resolveCircle(pos, radius);
  world.resolveCircle(pos, radius);
  return true;
}

const propsOut: { blocksMove: boolean }[] = [];

/**
 * Emplacement de stationnement d'un véhicule de l'unité : derrière le front, hors du bâti et du mobilier.
 * `rank` décale les véhicules suivants (rangés côte à côte). Retourne false si aucune place n'est trouvée.
 */
export function parkingSpot(
  ctx: GameContext, stand: Stand, rank: number, length: number, width: number, out: { x: number; z: number; heading: number },
): boolean {
  const world = ctx.world;
  const fx = Math.sin(stand.heading);
  const fz = Math.cos(stand.heading);
  const rx = -fz;
  const rz = fx;
  const half = Math.max(length, width) * 0.5 + 0.4;
  // en bataille derrière le groupe : nez vers le front, véhicules espacés de leur largeur + 1,2 m
  const pitch = width + 1.2;
  const lateral0 = (rank % 2 === 0 ? 1 : -1) * Math.ceil(rank / 2) * pitch;
  for (let back = 13; back <= 45; back += 4) {
    for (let side = 0; side <= 6; side++) {
      const lateral = lateral0 + (side % 2 === 0 ? 1 : -1) * Math.ceil(side / 2) * pitch;
      const px = stand.x - fx * back + rx * lateral;
      const pz = stand.z - fz * back + rz * lateral;
      if (!world.isFree(px, pz, half) || !(WALKABLE[world.surfaceAt(px, pz)] > 0)) continue;
      // les deux bouts de la caisse aussi (isFree d'un grand disque ne voit pas les murets minces)
      if (!world.isFree(px + fx * length * 0.4, pz + fz * length * 0.4, width * 0.5)) continue;
      if (!world.isFree(px - fx * length * 0.4, pz - fz * length * 0.4, width * 0.5)) continue;
      const n = ctx.props.queryRadius(px, pz, half, propsOut as never[], (p) => p.blocksMove);
      if (n > 0) continue;
      if (ctx.vehicles.queryRadius(px, pz, half, propsOut as never[]) > 0) continue;
      if (ctx.people.countIn(px, pz, half + 0.5) > 0) continue;
      out.x = px;
      out.z = pz;
      out.heading = stand.heading;
      return true;
    }
  }
  return false;
}
