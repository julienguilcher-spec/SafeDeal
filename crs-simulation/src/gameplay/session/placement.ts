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
/** Recul du second rang : deux mètres, comme dans les formations du module de police (on voit entre les casques). */
export const RANK_DEPTH = 2;
export const FILE_SPACING = 0.95;

/** Distances d'essai au lieu de rassemblement quand une manifestation s'y tient (m). */
const CROWD_RINGS: readonly number[] = [95, 105, 85, 115, 125];
const CROWD_DIRECTIONS = 24;
/** Aucun manifestant à moins de cette distance de l'emplacement des forces (m). */
const CROWD_CLEAR = 30;
/** Distance minimale au parcours déclaré du cortège (m) : on ne se met pas en travers. */
const ROUTE_CLEAR = 40;

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

/** Distance d'un point à une polyligne [x0, z0, x1, z1, …] (Infinity si elle est vide). */
export function distanceToRoute(route: ArrayLike<number>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < route.length; i += 2) {
    const ax = route[i]!;
    const az = route[i + 1]!;
    const dx = route[i + 2]! - ax;
    const dz = route[i + 3]! - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-6 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  if (route.length === 2) best = Math.hypot(x - route[0]!, z - route[1]!);
  return best;
}

/**
 * Nombre de véhicules que le module de police pourra ranger derrière un emplacement (0 à 14). Il les pose l'un après
 * l'autre sur deux files à 1,8 m de l'axe, un rang tous les 7,6 m à partir de 24 m ; un emplacement pris (arbre, mur,
 * mobilier) l'arrête : les véhicules suivants ne sont pas créés. On compte donc les places libres CONSÉCUTIVES depuis
 * la première — c'est ce nombre qui dit si l'unité aura ses fourgons.
 */
export function parkingRoom(ctx: GameContext, x: number, z: number, heading: number): number {
  const world = ctx.world;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let n = 0;
  for (; n < 14; n++) {
    const file = n & 1 ? 1 : -1;
    const back = 24 + (n >> 1) * 7.6;
    const px = x - fx * back - fz * file * 1.8;
    const pz = z - fz * back + fx * file * 1.8;
    if (!(world.isFree(px, pz, 1.3) && world.isFree(px + fx * 2.4, pz + fz * 2.4, 1.2) && world.isFree(px - fx * 2.4, pz - fz * 2.4, 1.2))) break;
  }
  return n;
}

/**
 * Emplacement des forces de l'ordre quand une manifestation se tient au lieu (x, z) : HORS du rassemblement et du
 * couloir du parcours déclaré, à une centaine de mètres, face au lieu, sur un sol dégagé, sans manifestant
 * alentour, de préférence avec vue sur le rassemblement et de la place derrière soi pour les véhicules.
 * `route` = parcours du cortège [x0, z0, …] (vide : rassemblement statique). Retourne null si rien ne convient
 * (l'appelant se rabat sur chooseStand).
 */
export function chooseStandOffCrowd(
  ctx: GameContext, x: number, z: number, route: ArrayLike<number>, isProtester: (p: { faction: string }) => boolean,
): Stand | null {
  const world = ctx.world;
  let best: Stand | null = null;
  let bestScore = -Infinity;
  // deux passes : exigences complètes, puis distances réduites pour les lieux très bâtis
  for (let pass = 0; pass < 2 && !best; pass++) {
    const routeClear = pass === 0 ? ROUTE_CLEAR : ROUTE_CLEAR * 0.55;
    const crowdClear = pass === 0 ? CROWD_CLEAR : CROWD_CLEAR * 0.6;
    for (let r = 0; r < CROWD_RINGS.length; r++) {
      const ring = pass === 0 ? CROWD_RINGS[r]! : CROWD_RINGS[r]! * 0.72;
      for (let k = 0; k < CROWD_DIRECTIONS; k++) {
        const a = (k / CROWD_DIRECTIONS) * Math.PI * 2;
        const cx = x + Math.sin(a) * ring;
        const cz = z + Math.cos(a) * ring;
        const ground = WALKABLE[world.surfaceAt(cx, cz)];
        if (!(ground > 0) || !world.isFree(cx, cz, 0.6)) continue;
        const dRoute = distanceToRoute(route, cx, cz);
        if (dRoute < routeClear) continue;
        if (ctx.people.countIn(cx, cz, crowdClear, isProtester as never) > 0) continue;
        const heading = a + Math.PI; // face au lieu de rassemblement
        const clearance = frontClearance(ctx, cx, cz, heading);
        if (clearance < 0.75) continue;
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        let score = clearance * 6 + ground - r * 0.5;
        if (world.isFree(cx, cz, 5)) score += 2;
        // vue sur le rassemblement (jusqu'à 30 m de son centre : le centre lui-même est souvent un monument)
        if (world.lineOfSight(cx, cz, cx + fx * (ring - 30), cz + fz * (ring - 30))) score += 3;
        // de la place derrière soi pour ranger les véhicules de l'unité : c'est ce qui décide entre deux emplacements
        // dégagés (une rue ou une avenue qui débouche sur le lieu offre toute sa longueur)
        score += parkingRoom(ctx, cx, cz, heading) * 0.7;
        // plutôt loin du parcours (on le borde, on ne le coupe pas)
        score += Math.min(dRoute, 90) / 45;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, z: cz, heading: wrap(heading), facing: '' };
        }
      }
    }
  }
  return best;
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
  // en bataille derrière le groupe, NEZ VERS LA SORTIE (dos au groupe) : prêts à repartir, et un départ tout droit
  // ne passe jamais sur les collègues ; véhicules espacés de leur largeur + 1,2 m
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
      out.heading = wrap(stand.heading + Math.PI);
      return true;
    }
  }
  return false;
}

const WHEELED: Readonly<Record<SurfaceKind, number>> = {
  // sols où l'on gare un engin : chaussée et esplanades, jamais une pelouse ni l'eau
  road: 3, plaza: 2.5, sett: 2.5, sidewalk: 1.5, gravel: 1.5, quay: 2, bridge: 1, park: 0, interior: 0, water: -1, building: -1, void: -1,
};

/**
 * Emplacement n° `index` d'un moyen d'appui (engin lanceur d'eau, blindé, BRAV-M, équipe drone) : sur les côtés de
 * l'unité, en retrait, sur un sol carrossable, à l'écart du bâti, du mobilier, des véhicules et des personnes.
 * Les emplacements déjà pris (`taken` : [x0, z0, …]) sont évités. Retourne false si aucune place n'est trouvée.
 */
export function supportSpot(
  ctx: GameContext, stand: Stand, index: number, radius: number, taken: number[], out: { x: number; z: number; heading: number },
  /** Longueur (m) de la bande à garder libre DERRIÈRE l'emplacement (machines garées en file) ; 0 = aucune. */
  rearLane = 0,
): boolean {
  const world = ctx.world;
  const fx = Math.sin(stand.heading);
  const fz = Math.cos(stand.heading);
  const rx = -fz;
  const rz = fx;
  const tryAt = (back: number, side: number): boolean => {
    const px = stand.x - fx * back + rx * side;
    const pz = stand.z - fz * back + rz * side;
    if (!(WHEELED[world.surfaceAt(px, pz)] > 0) || !world.isFree(px, pz, radius)) return false;
    for (let i = 0; i + 1 < taken.length; i += 2) if (Math.hypot(taken[i]! - px, taken[i + 1]! - pz) < radius + 6) return false;
    if (ctx.props.queryRadius(px, pz, radius, propsOut as never[], (p) => p.blocksMove) > 0) return false;
    if (ctx.vehicles.queryRadius(px, pz, radius + 1.5, propsOut as never[]) > 0) return false;
    if (ctx.people.countIn(px, pz, radius + 1) > 0) return false;
    for (let b = 6; b <= rearLane; b += 4) {
      const lx = px - fx * b;
      const lz = pz - fz * b;
      if (!world.isFree(lx, lz, 3.4) || ctx.vehicles.queryRadius(lx, lz, 4, propsOut as never[]) > 0) return false;
    }
    out.x = px;
    out.z = pz;
    out.heading = stand.heading;
    taken.push(px, pz);
    if (rearLane > 0) taken.push(px - fx * rearLane * 0.6, pz - fz * rearLane * 0.6, px - fx * rearLane, pz - fz * rearLane);
    return true;
  };
  // un côté puis l'autre, de plus en plus loin ; puis plus en retrait
  // (jusqu'à une trentaine d'engins : dix Centaures, dix canons à eau, huit BRAV-M, drones — un grand dispositif
  // s'étale sur plusieurs rues autour de la compagnie)
  for (let back = 8; back <= 236; back += 12) {
    for (let step = 0; step < 18; step++) {
      const side = ((step + index) % 2 === 0 ? 1 : -1) * (12 + Math.floor(step / 2) * 9);
      if (tryAt(back, side)) return true;
    }
  }
  // rue étroite : dans l'axe, derrière les véhicules de l'unité
  for (let back = 84; back <= 164; back += 8) {
    if (tryAt(back, 0) || tryAt(back, 3.5) || tryAt(back, -3.5)) return true;
  }
  return false;
}

/**
 * Filet de sécurité : un véhicule qui n'a trouvé de place ni derrière l'unité ni sur ses flancs se gare sur la
 * CHAUSSÉE la plus proche (couronnes de plus en plus larges autour du point, jusqu'à 220 m), dans l'axe de la voie,
 * du côté droit. Sans lui, un BRAV-M ou un équipage pouvait commencer sans son véhicule et rester à pied.
 */
export function roadSpot(
  ctx: GameContext, x: number, z: number, length: number, width: number, out: { x: number; z: number; heading: number },
): boolean {
  const world = ctx.world;
  const road = roadTmp;
  const half = Math.max(length, width) * 0.5 + 0.4;
  for (let r = 0; r <= 220; r += 10) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 14));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
      if (!world.nearestRoad(qx, qz, road, 12) || road.width < Math.max(4, width + 1)) continue;
      const h = road.heading;
      const edge = Math.max(0, road.width * 0.5 - width * 0.5 - 0.6);
      // le long du trottoir de droite d'abord (potelets et candélabres le bordent souvent), puis vers l'axe
      for (const f of OFFSETS) {
        const off = edge * f;
        const px = road.x + Math.cos(h) * off, pz = road.z - Math.sin(h) * off;
        // (surface encore inconnue — tuile non chargée — : la voie du réseau suffit)
        const surf = world.surfaceAt(px, pz);
        if ((!(WHEELED[surf] > 0) && surf !== 'void') || !world.isFree(px, pz, width * 0.5 + 0.2)) continue;
        if (!world.isFree(px + Math.sin(h) * length * 0.45, pz + Math.cos(h) * length * 0.45, width * 0.5)) continue;
        if (!world.isFree(px - Math.sin(h) * length * 0.45, pz - Math.cos(h) * length * 0.45, width * 0.5)) continue;
        if (ctx.vehicles.queryRadius(px, pz, half + 0.6, propsOut as never[]) > 0) continue;
        if (ctx.props.queryRadius(px, pz, half, propsOut as never[], (p) => p.blocksMove) > 0) continue;
        if (ctx.people.countIn(px, pz, Math.max(1, width * 0.5 + 0.3)) > 0) continue;
        out.x = px;
        out.z = pz;
        out.heading = h;
        return true;
      }
    }
  }
  return false;
}

const OFFSETS: readonly number[] = [1, 0.6, 0.25, 0];
const roadTmp = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;

