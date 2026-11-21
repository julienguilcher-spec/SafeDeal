/* =====================================================================================
 * MURS DE QUAI HORS DES CHAUSSÉES.
 *
 * Les murs de quai viennent des données réelles (BD TOPO) : leur crête longe le bord RÉEL de la voie sur berge
 * ou du quai haut. Dans le jeu, une chaussée est une emprise de largeur constante autour de l'axe de la voie,
 * souvent un peu plus large que la vraie : un quart de la longueur des murs de quai se retrouvait ainsi posé
 * SUR la chaussée (un muret de pierre au milieu de la voie, qui arrêtait aussi les véhicules).
 *
 * Il en va de même sur les promenades piétonnes des berges (parc Rives de Seine, l'ancienne voie express).
 *
 *   - un tronçon de mur qui longe la voie est ramené au bord de sa chaussée, du côté où il se trouvait
 *     (côté fleuve) : la route se termine au mur, comme en vrai ;
 *   - un tronçon qui traverse une voie (mur qui passe sous un pont) est retiré dans l'emprise de la voie :
 *     plus de mur en travers d'un tablier.
 * Les autres barrières (murs, grilles, garde-corps, haies) suivent la même règle sur les voies carrossables : ce qui
 * coupe une rue est ouvert dans son emprise, ce qui la longe à l'intérieur est reposé à son bord. Les portails ne
 * sont pas touchés. Les arbres que la carte pose dans l'emprise d'une rue sont décalés à son bord (clearTrees).
 * Logique pure : modifie les données d'une tuile décodée, avant que le rendu et les collisions les lisent.
 * ===================================================================================== */

import { pointInPolygon } from '../mapdata';
import type { Barrier, Surface } from '../mapdata';
import { ROAD_ANY, ROAD_DRIVABLE } from './roads';

/** Vue minimale du réseau de voies (RoadNetwork). */
export interface QuayRoads {
  nearest(x: number, z: number, maxDist: number, filter: number): boolean;
  readonly snapEdge: number;
  readonly snapX: number;
  readonly snapZ: number;
  readonly snapDist: number;
  readonly edges: ArrayLike<{ width: number; sidewalk?: number }>;
}

/** Pas de découpe du mur (m), marge entre le bord de chaussée et le mur (m), tronçon minimal conservé (m). */
const STEP = 2;
const MARGIN = 0.9;
const MIN_RUN = 3;
/** Rayon de recherche d'une voie autour d'un point du mur (m). */
const REACH = 14;
/** Au-delà de ce cosinus entre le mur et la voie, le mur « longe » la voie ; en deçà, il la traverse. */
const ALONG = 0.6;

/**
 * Le point est-il dans l'emprise d'une voie ? `walk` : trottoirs compris (largeur du passage, comme l'ouverture des
 * barrières par le constructeur de collisions) ; sinon la chaussée seule. Renseigne roads.snap*.
 */
function inside(roads: QuayRoads, x: number, z: number, filter: number, walk = false): boolean {
  if (!roads.nearest(x, z, REACH, filter)) return false;
  const e = roads.edges[roads.snapEdge];
  return !!e && roads.snapDist < e.width * 0.5 + (walk ? e.sidewalk ?? 0 : 0) + 0.3;
}

/** Le point est-il sur une chaussée dessinée en surface (place, quai large, tablier de pont) ? */
function onRoadSurface(polys: readonly Surface[], x: number, z: number): boolean {
  for (let i = 0; i < polys.length; i++) {
    const s = polys[i]!;
    if (pointInPolygon(s.outer, s.holes, x, z)) return true;
  }
  return false;
}

const NO_SURFACES: readonly Surface[] = [];

/** Pas (m) et portée (m) du décalage supplémentaire quand le bord de la voie tombe encore sur une chaussée. */
const PUSH_STEP = 0.5;
const PUSH_MAX = 6;

/**
 * Ramène les murs de quai de `barriers` hors des chaussées. Retourne la longueur (m) de mur déplacée ou retirée.
 * La liste est modifiée en place (les barrières intactes gardent leur objet).
 */
export function clearQuayWalls(barriers: Barrier[], roads: QuayRoads | null, surfaces: readonly Surface[] = []): number {
  if (roads === null) return 0;
  const polys = surfaces.filter((s) => s.kind === 'road');
  let changed = 0;
  const out: Barrier[] = [];
  for (const b of barriers) {
    if (b.kind === 'gate' || b.points.length < 4) { out.push(b); continue; }
    // mur de quai : toutes les voies (promenades des berges comprises) et les chaussées dessinées en surface ;
    // autres barrières : les voies carrossables seulement
    const quay = b.kind === 'quay_wall';
    const filter = quay ? ROAD_ANY : ROAD_DRIVABLE;
    const surf = quay ? polys : NO_SURFACES;
    // polyligne redécoupée : un point tous les STEP mètres au plus
    const p = b.points;
    const xs: number[] = [p[0]!];
    const zs: number[] = [p[1]!];
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2]!, az = p[i - 1]!, bx = p[i]!, bz = p[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
      for (let k = 1; k <= steps; k++) { xs.push(ax + ((bx - ax) * k) / steps); zs.push(az + ((bz - az) * k) / steps); }
    }
    const n = xs.length;
    // tracé d'origine : les tangentes se lisent sur lui, pas sur les points déjà déplacés
    const ox = xs.slice(), oz = zs.slice();
    const keep = new Uint8Array(n).fill(1);
    let touched = false;
    for (let i = 0; i < n; i++) {
      const x = xs[i]!, z = zs[i]!;
      // (emprise avec trottoirs : un mur qui traverse y est ouvert sur toute la largeur du passage)
      const inWalk = inside(roads, x, z, filter, true);
      const inEdge = inWalk && roads.snapDist < roads.edges[roads.snapEdge]!.width * 0.5 + 0.3;
      if (!inWalk && !onRoadSurface(surf, x, z)) continue;
      touched = true;
      // sur une surface de chaussée loin de tout axe : rien pour dire de quel côté le ramener — ce point disparaît
      if (!inEdge && !roads.nearest(x, z, REACH * 2, filter)) { keep[i] = 0; changed += STEP; continue; }
      const sx = roads.snapX, sz = roads.snapZ, d = roads.snapDist;
      const half = Math.max(roads.edges[roads.snapEdge]!.width * 0.5, inEdge ? 0 : d - MARGIN);
      // tangente du mur (voisins) et normale sortante de la voie (de l'axe vers le point)
      const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
      let tx = ox[i1]! - ox[i0]!, tz = oz[i1]! - oz[i0]!;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-4 || d < 0.15) { keep[i] = 0; changed += STEP; continue; }
      tx /= tl; tz /= tl;
      const nx = (x - sx) / d, nz = (z - sz) / d;
      // la voie court le long de (−nz, nx) : le mur la longe si sa tangente lui est presque parallèle
      const along = Math.abs(tx * -nz + tz * nx);
      if (along < ALONG) { keep[i] = 0; changed += STEP; continue; }
      // il longe la voie sur son trottoir, hors de la chaussée : il est à sa place
      if (inWalk && !inEdge && !onRoadSurface(surf, x, z)) continue;
      // bord de la voie, du côté où le mur se trouve ; s'il tombe encore sur une chaussée (surface plus large que la
      // voie, carrefour), on s'écarte encore un peu, puis on renonce : ce point du mur disparaît
      let px = 0, pz = 0;
      let placed = false;
      for (let extra = MARGIN; extra <= MARGIN + PUSH_MAX && !placed; extra += PUSH_STEP) {
        px = sx + nx * (half + extra);
        pz = sz + nz * (half + extra);
        placed = !inside(roads, px, pz, filter) && !onRoadSurface(surf, px, pz);
      }
      if (!placed) { keep[i] = 0; changed += STEP; continue; }
      changed += Math.hypot(px - x, pz - z) > 0.05 ? STEP : 0;
      xs[i] = px;
      zs[i] = pz;
    }
    if (!touched) { out.push(b); continue; }
    // tronçons conservés
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 4) {
        let len = 0;
        for (let k = 2; k < run.length; k += 2) len += Math.hypot(run[k]! - run[k - 2]!, run[k + 1]! - run[k - 1]!);
        if (len >= MIN_RUN) out.push({ kind: b.kind, height: b.height, points: Float32Array.from(run) });
      }
      run = [];
    };
    for (let i = 0; i < n; i++) {
      if (keep[i] === 1) run.push(xs[i]!, zs[i]!);
      else flush();
    }
    flush();
  }
  if (changed > 0) {
    barriers.length = 0;
    for (const b of out) barriers.push(b);
  }
  return changed;
}

/** Arbres d'une tuile (colonnes de la carte). */
export interface TreeColumns {
  count: number;
  x: { [i: number]: number };
  z: { [i: number]: number };
  height: ArrayLike<number>;
  crownRadius: ArrayLike<number>;
}

/** Marge entre le bord de la chaussée et le tronc replacé (m). */
const TREE_MARGIN = 0.8;

/**
 * Arbres posés par la carte dans l'emprise d'une voie carrossable : décalés au bord de la chaussée, du côté où ils
 * se trouvent (l'alignement de l'avenue est conservé). Un arbre dont le bord tombe dans une autre voie (carrefour)
 * reste où il est (les collisions l'ignorent déjà). Retourne le nombre d'arbres déplacés. Modifie les colonnes en place.
 */
export function clearTrees(trees: TreeColumns | undefined, roads: QuayRoads | null): number {
  if (!trees || roads === null) return 0;
  let moved = 0;
  for (let i = 0; i < trees.count; i++) {
    const x = trees.x[i]!, z = trees.z[i]!;
    if (!roads.nearest(x, z, REACH, ROAD_DRIVABLE)) continue;
    const e = roads.edges[roads.snapEdge];
    if (!e) continue;
    const h = Math.min(45, Math.max(2, trees.height[i]!));
    const r = Math.min(8, Math.max(0.8, trees.crownRadius[i]!));
    const radius = Math.min(0.42, Math.max(0.08, h * 0.012 + r * 0.012 + 0.03));
    const half = e.width * 0.5;
    const d = roads.snapDist;
    if (d >= half + radius + 0.35 || d < 0.15) continue;
    const sx = roads.snapX, sz = roads.snapZ;
    const nx = (x - sx) / d, nz = (z - sz) / d;
    const px = sx + nx * (half + radius + TREE_MARGIN), pz = sz + nz * (half + radius + TREE_MARGIN);
    if (roads.nearest(px, pz, REACH, ROAD_DRIVABLE)) {
      const e2 = roads.edges[roads.snapEdge];
      if (e2 && roads.snapDist < e2.width * 0.5 + radius + 0.35) continue;
    }
    trees.x[i] = px;
    trees.z[i] = pz;
    moved++;
  }
  return moved;
}
