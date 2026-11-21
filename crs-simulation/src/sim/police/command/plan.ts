/* =====================================================================================
 * COMMANDEMENT — conception du dispositif : où placer les unités.
 *
 *   barrages latéraux   chaque rue qui débouche sur le parcours déclaré (ou sur le lieu de
 *                       rassemblement) reçoit un emplacement en retrait de l'axe, là où la rue est
 *                       encaissée entre ses façades, face au parcours : la canalisation du cortège
 *                       (docs/research/06-roles-jouables.md §4.2 : « demi-groupes aux débouchés
 *                       latéraux, à 10 m en retrait de l'axe, jamais en travers du parcours ») ;
 *   sites sensibles     monuments et institutions de la carte proches du parcours (bible §I.3) ;
 *   largeur             mesurée par lancers de rayon vers les façades (INTEGRATION-NOTES : la largeur
 *                       du graphe n'est que la largeur roulable).
 * Calcul fait une fois à la prise de commandement (et quand le parcours change) : hors boucle chaude.
 * ===================================================================================== */

import type { RoadClass, RoadEdgeInfo } from '@/core/contracts';
import type { Post } from './api';
import type { CommandCore } from './core';
import type { Picture } from './picture';

/** Portée des rayons latéraux (m) : une avenue de 40 m est mesurée depuis l'axe d'une de ses chaussées. */
const PROBE = 45;
/** Retrait minimal d'un barrage par rapport à l'axe du parcours (m). */
const SETBACK = 12;
/** Enfoncement dans la rue après le point où elle devient encaissée (m). */
const INSIDE = 6;
/** Rayon du lieu de rassemblement à défaut de place connue (m). */
const GATHER_RADIUS = 45;
/** Distance maximale d'un site sensible au parcours pour qu'il soit gardé (m). */
const SITE_RANGE = 130;
const MAX_POSTS = 40;

const CLASS_WEIGHT: Readonly<Record<RoadClass, number>> = {
  motorway: 3, primary: 3, secondary: 2.5, tertiary: 2, residential: 1.5, pedestrian: 1, service: 0.6, footway: 0.4,
};

/**
 * Lieu de rassemblement autour de (gx, gz) : la place qui contient le point (son centre et son rayon), sinon
 * le point lui-même avec un rayon de 45 m. Centre écrit dans core.v2 ; retourne le rayon.
 */
export function gatherPlace(core: CommandCore, gx: number, gz: number): number {
  const places = core.ctx.world.places;
  let best = 0;
  core.v2.x = gx;
  core.v2.z = gz;
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p.kind !== 'square') continue;
    const d = Math.hypot(p.x - gx, p.z - gz);
    if (d <= p.radius && p.radius > best && p.radius <= 160) {
      best = p.radius;
      core.v2.x = p.x;
      core.v2.z = p.z;
    }
  }
  return best > 0 ? best : GATHER_RADIUS;
}

/** Point de l'arête à la distance `d` du nœud `from` (dans core.v2) ; retourne false si l'arête est plus courte. */
function alongEdge(core: CommandCore, e: RoadEdgeInfo, from: number, d: number): boolean {
  const pts = e.points;
  const n = pts.length >> 1;
  const v = core.v2;
  const reverse = e.b === from && e.a !== from;
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const i0 = reverse ? n - k : k - 1;
    const i1 = reverse ? n - k - 1 : k;
    const ax = pts[i0 * 2];
    const az = pts[i0 * 2 + 1];
    const bx = pts[i1 * 2];
    const bz = pts[i1 * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (d <= acc + len) {
      const t = len > 1e-6 ? (d - acc) / len : 0;
      v.x = ax + (bx - ax) * t;
      v.z = az + (bz - az) * t;
      core.v3.x = len > 1e-6 ? (bx - ax) / len : 0;
      core.v3.z = len > 1e-6 ? (bz - az) / len : 1;
      return true;
    }
    acc += len;
  }
  const last = reverse ? 0 : n - 1;
  const prev = reverse ? 1 : n - 2;
  v.x = pts[last * 2];
  v.z = pts[last * 2 + 1];
  if (n >= 2) {
    const dx = pts[last * 2] - pts[prev * 2];
    const dz = pts[last * 2 + 1] - pts[prev * 2 + 1];
    const len = Math.hypot(dx, dz) || 1;
    core.v3.x = dx / len;
    core.v3.z = dz / len;
  }
  return false;
}

/** Distance libre depuis (x, z) dans la direction (ux, uz), bornée à PROBE. */
function probe(core: CommandCore, x: number, z: number, ux: number, uz: number): number {
  const hit = core.hit;
  if (core.ctx.world.raycast(x, z, x + ux * PROBE, z + uz * PROBE, hit) && hit.hit) return hit.t * PROBE;
  return PROBE;
}

function addPost(out: Post[], post: Post): void {
  // deux chaussées d'une même avenue donnent le même barrage : on garde le plus important
  for (let i = 0; i < out.length; i++) {
    const q = out[i];
    if (q.kind !== post.kind) continue;
    if ((q.x - post.x) * (q.x - post.x) + (q.z - post.z) * (q.z - post.z) < 14 * 14) {
      if (post.importance > q.importance) out[i] = post;
      return;
    }
  }
  if (out.length < MAX_POSTS) out.push(post);
}

/**
 * Emplacements du dispositif pour le parcours du tableau de situation (ou, sans parcours, pour le lieu de
 * rassemblement). (gx, gz) : lieu de rassemblement. Écrit dans `out` (vidé d'abord), trié par abscisse.
 */
export function planPosts(core: CommandCore, pic: Picture, gx: number, gz: number, out: Post[]): void {
  out.length = 0;
  const world = core.ctx.world;
  const hasRoute = pic.route.length >= 4;
  const rg = gatherPlace(core, gx, gz);
  gx = core.v2.x;
  gz = core.v2.z;
  const count = world.nodeCount;
  // emprise utile : le parcours et le lieu de rassemblement, avec une marge
  let minX = gx - rg - 20;
  let maxX = gx + rg + 20;
  let minZ = gz - rg - 20;
  let maxZ = gz + rg + 20;
  for (let i = 0; i + 1 < pic.route.length; i += 2) {
    const x = pic.route[i];
    const z = pic.route[i + 1];
    if (x - 20 < minX) minX = x - 20;
    if (x + 20 > maxX) maxX = x + 20;
    if (z - 20 < minZ) minZ = z - 20;
    if (z + 20 > maxZ) maxZ = z + 20;
  }
  for (let id = 0; id < count; id++) {
    const node = world.node(id);
    if (node.id < 0 || node.x < minX || node.x > maxX || node.z < minZ || node.z > maxZ) continue;
    const nx = node.x;
    const nz = node.z;
    let s = 0;
    let onRoute = false;
    if (hasRoute) {
      s = pic.routeAbscissa(nx, nz);
      onRoute = core.v3.y <= 16;
    }
    const inPlace = (nx - gx) * (nx - gx) + (nz - gz) * (nz - gz) <= (rg + 10) * (rg + 10);
    if (!onRoute && !inPlace) continue;
    if (!onRoute) s = 0;
    const edges = node.edges;
    for (let k = 0; k < edges.length; k++) {
      const e = world.edge(edges[k]);
      if (e.id < 0 || e.length < 8) continue;
      // direction prise en s'éloignant du nœud : point à 25 m
      alongEdge(core, e, id, Math.min(25, e.length));
      const qx = core.v2.x;
      const qz = core.v2.z;
      if (hasRoute) {
        pic.routeAbscissa(qx, qz);
        if (core.v3.y < 14) continue; // c'est le parcours lui-même
      }
      if ((qx - gx) * (qx - gx) + (qz - gz) * (qz - gz) < (rg - 4) * (rg - 4)) continue; // voie intérieure à la place
      // on s'enfonce dans la rue jusqu'à ce qu'elle soit encaissée entre deux obstacles
      let found = false;
      let px = 0;
      let pz = 0;
      let ux = 0;
      let uz = 1;
      let dA = 0;
      let dB = 0;
      const limit = Math.min(e.length, 90);
      for (let d = 6; d <= limit + 0.01 && !found; d += 2) {
        alongEdge(core, e, id, d);
        px = core.v2.x;
        pz = core.v2.z;
        ux = core.v3.x;
        uz = core.v3.z;
        if ((px - gx) * (px - gx) + (pz - gz) * (pz - gz) < (rg + 2) * (rg + 2)) continue;
        if (hasRoute) {
          pic.routeAbscissa(px, pz);
          if (core.v3.y < SETBACK) continue;
        }
        dA = probe(core, px, pz, -uz, ux);
        dB = probe(core, px, pz, uz, -ux);
        if (dA < PROBE && dB < PROBE) found = true;
      }
      if (!found) continue;
      // quelques mètres plus loin, là où les façades sont franches
      const dIn = Math.min(limit, Math.hypot(px - nx, pz - nz) + INSIDE);
      alongEdge(core, e, id, dIn);
      const ix = core.v2.x;
      const iz = core.v2.z;
      const iA = probe(core, ix, iz, -core.v3.z, core.v3.x);
      const iB = probe(core, ix, iz, core.v3.z, -core.v3.x);
      if (iA < PROBE && iB < PROBE) {
        px = ix;
        pz = iz;
        ux = core.v3.x;
        uz = core.v3.z;
        dA = iA;
        dB = iB;
      }
      const width = dA + dB;
      const shift = (dA - dB) * 0.5;
      const cx = px - uz * shift;
      const cz = pz + ux * shift;
      const pedestrian = e.pedestrianOnly || e.roadClass === 'footway' || e.roadClass === 'pedestrian';
      const name = e.name !== '' ? e.name : core.sector(cx, cz);
      addPost(out, {
        kind: 'barrage', x: cx, z: cz, heading: Math.atan2(-ux, -uz), width, s, name,
        importance: CLASS_WEIGHT[e.roadClass] + Math.min(2, width / 20), state: 'prevu', squadId: 0, closureId: 0, pedestrian,
      });
    }
  }
  planSites(core, pic, gx, gz, rg, out);
  out.sort(byAbscissa);
}

function byAbscissa(a: Post, b: Post): number {
  return a.s - b.s || a.x - b.x || a.z - b.z;
}

/** Sites sensibles : monuments et institutions proches du parcours, hors du lieu de rassemblement lui-même. */
function planSites(core: CommandCore, pic: Picture, gx: number, gz: number, rg: number, out: Post[]): void {
  const world = core.ctx.world;
  const hasRoute = pic.route.length >= 4;
  const consider = (name: string, x: number, z: number, radius: number, weight: number): void => {
    // un site au milieu du rassemblement n'est pas gardé par une unité statique : il est surveillé à distance
    if ((x - gx) * (x - gx) + (z - gz) * (z - gz) < (rg + 15) * (rg + 15)) return;
    let s = 0;
    let dist = Math.hypot(x - gx, z - gz);
    let tx = gx;
    let tz = gz;
    if (hasRoute) {
      s = pic.routeAbscissa(x, z);
      dist = core.v3.y;
      pic.routePoint(s);
      tx = core.v2.x;
      tz = core.v2.z;
    }
    if (dist > SITE_RANGE + radius) return;
    for (let i = 0; i < out.length; i++) if (out[i].kind === 'site' && (out[i].name === name || Math.hypot(out[i].x - x, out[i].z - z) < 20)) return;
    // la garde se tient entre le site et le parcours
    const d = Math.hypot(tx - x, tz - z) || 1;
    const ux = (tx - x) / d;
    const uz = (tz - z) / d;
    const off = Math.min(radius + 5, Math.max(4, d - 10));
    const v = core.v2;
    v.x = x + ux * off;
    v.z = z + uz * off;
    world.resolveCircle(v, 1.2);
    if (out.length < MAX_POSTS) {
      out.push({
        kind: 'site', x: v.x, z: v.z, heading: Math.atan2(ux, uz), width: Math.min(24, Math.max(8, radius)), s, name,
        importance: weight, state: 'prevu', squadId: 0, closureId: 0, pedestrian: true,
      });
    }
  };
  const places = world.places;
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p.kind === 'institution') consider(p.name, p.x, p.z, Math.min(40, p.radius), 3.2);
  }
  const marks = world.landmarks;
  for (let i = 0; i < marks.length; i++) {
    const l = marks[i];
    let r = 8;
    const fp = l.footprint;
    for (let j = 0; j + 1 < fp.length; j += 2) r = Math.max(r, Math.hypot(fp[j] - l.x, fp[j + 1] - l.z));
    consider(l.name, l.x, l.z, Math.min(30, r), 2.6);
  }
}

/** Largeur réelle de la voie en (x, z) pour un front de cap `heading` (m) ; 0 si le lieu est ouvert. */
export function streetWidth(core: CommandCore, x: number, z: number, heading: number): number {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const a = probe(core, x, z, -fz, fx);
  const b = probe(core, x, z, fz, -fx);
  return a < PROBE && b < PROBE ? a + b : 0;
}
