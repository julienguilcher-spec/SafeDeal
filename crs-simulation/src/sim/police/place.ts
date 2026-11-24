/* =====================================================================================
 * FORCES DE L'ORDRE — placement des formations dans le monde : itinéraire d'une colonne (chaque
 * rang suit la trace de la tête), emplacements du monde d'après le repère de la formation (et sa
 * vitesse : translation + rotation), porte ouverte dans un premier rang, emplacements poussés hors
 * des obstacles, mesure de l'alignement.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { Agent, FormGroup } from './brain';
import { F_COLUMN } from './brain';
import type { Kernel } from './kernel';
import * as T from './tuning';

// ───────────────────────────── itinéraire d'une colonne ─────────────────────────────

/** Fixe l'itinéraire [x0, z0, …] d'une colonne (copié) ; la tête part de l'abscisse 0. */
export function setPath(g: FormGroup, pts: ArrayLike<number>, count: number): void {
  const path = g.path;
  const cum = g.cum;
  let m = 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const px = pts[i * 2];
    const pz = pts[i * 2 + 1];
    if (m > 0) {
      const dx = px - path[m * 2 - 2];
      const dz = pz - path[m * 2 - 1];
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l < 0.05) continue;
      total += l;
    }
    path[m * 2] = px;
    path[m * 2 + 1] = pz;
    cum[m] = total;
    m++;
  }
  path.length = m * 2;
  cum.length = m;
  g.pathN = m;
  g.total = total;
  g.s = 0;
}

/** Ajoute un point à l'itinéraire (trace d'une cible suivie). */
export function appendPath(g: FormGroup, x: number, z: number): void {
  const m = g.pathN;
  if (m > 0) {
    const dx = x - g.path[m * 2 - 2];
    const dz = z - g.path[m * 2 - 1];
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.6) return;
    g.total += l;
  }
  g.path[m * 2] = x;
  g.path[m * 2 + 1] = z;
  g.cum[m] = g.total;
  g.pathN = m + 1;
  // la trace déjà parcourue est oubliée par blocs (la colonne ne mesure que quelques dizaines de mètres)
  if (g.pathN > 400) {
    const drop = 200;
    const base = g.cum[drop];
    g.path.splice(0, drop * 2);
    g.cum.splice(0, drop);
    for (let i = 0; i < g.cum.length; i++) g.cum[i] -= base;
    g.pathN -= drop;
    g.total -= base;
    g.s -= base;
  }
}

const sample = { x: 0, z: 0, dx: 0, dz: 1 };

/** Point de l'itinéraire à l'abscisse s (prolongé en ligne droite avant le départ et après l'arrivée). */
function samplePath(g: FormGroup, s: number): void {
  const n = g.pathN;
  const path = g.path;
  const cum = g.cum;
  if (n < 2) {
    const fx = Math.sin(g.ah);
    const fz = Math.cos(g.ah);
    const bx = n === 1 ? path[0] : g.ax;
    const bz = n === 1 ? path[1] : g.az;
    sample.x = bx + fx * s;
    sample.z = bz + fz * s;
    sample.dx = fx;
    sample.dz = fz;
    return;
  }
  let i: number;
  if (s <= 0) i = 0;
  else if (s >= g.total) i = n - 2;
  else {
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    i = lo;
  }
  const ax = path[i * 2];
  const az = path[i * 2 + 1];
  let dx = path[i * 2 + 2] - ax;
  let dz = path[i * 2 + 3] - az;
  const l = cum[i + 1] - cum[i];
  const inv = l > 1e-6 ? 1 / l : 0;
  dx *= inv;
  dz *= inv;
  const t = s - cum[i];
  sample.x = ax + dx * t;
  sample.z = az + dz * t;
  sample.dx = dx;
  sample.dz = dz;
}

// ───────────────────────────── emplacements dans le monde ─────────────────────────────

/** Recalcule l'emplacement dans le monde de chaque agent du bloc (position, cap, vitesse). */
export function placeGroup(k: Kernel, g: FormGroup): void {
  const agents = g.agents;
  const n = agents.length;
  if (g.kind === F_COLUMN) {
    placeColumn(g);
    return;
  }
  const h = g.ah;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = -fz;
  const rz = fx;
  const ax = g.ax;
  const az = g.az;
  const avx = g.avx;
  const avz = g.avz;
  const aw = g.aw;
  const door = g.doorW > 0 && k.now < g.doorUntil;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    if (!a.hasSlot) continue;
    const lx = a.lx;
    const lf = a.lf;
    a.sx = ax + rx * lx + fx * lf;
    a.sz = az + rz * lx + fz * lf;
    a.sh = h + a.lh;
    if (aw !== 0) {
      a.svx = avx + aw * (lx * fx - lf * rx);
      a.svz = avz + aw * (lx * fz - lf * rz);
    } else {
      a.svx = avx;
      a.svz = avz;
    }
  }
  if (door) openDoor(g, rx, rz);
  g.dirty = g.moving;
}

/** Écarte les agents du premier rang de part et d'autre de la porte, en gardant leur ordre. */
function openDoor(g: FormGroup, rx: number, rz: number): void {
  const front = g.front;
  const n = front.length;
  const half = g.doorW / 2 + 0.3;
  const c = g.doorX;
  // côté droit : de la porte vers le flanc
  let prev = c + half - T.SPACING_MIN;
  for (let i = 0; i < n; i++) {
    const a = front[i];
    if (a.lx < c) continue;
    const want = a.lx < prev + T.SPACING_MIN ? prev + T.SPACING_MIN : a.lx;
    if (want !== a.lx) {
      a.sx += rx * (want - a.lx);
      a.sz += rz * (want - a.lx);
    } else break;
    prev = want;
  }
  prev = c - half + T.SPACING_MIN;
  for (let i = n - 1; i >= 0; i--) {
    const a = front[i];
    if (a.lx >= c) continue;
    const want = a.lx > prev - T.SPACING_MIN ? prev - T.SPACING_MIN : a.lx;
    if (want !== a.lx) {
      a.sx += rx * (want - a.lx);
      a.sz += rz * (want - a.lx);
    } else break;
    prev = want;
  }
}

function placeColumn(g: FormGroup): void {
  const agents = g.agents;
  const n = agents.length;
  const v = g.v;
  let lastLf = NaN;
  let px = 0;
  let pz = 0;
  let dx = 0;
  let dz = 1;
  let rx = 0;
  let rz = 0;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    if (!a.hasSlot) continue;
    if (a.lf !== lastLf) {
      lastLf = a.lf;
      const s = g.s + a.lf;
      samplePath(g, s);
      px = sample.x;
      pz = sample.z;
      dx = sample.dx;
      dz = sample.dz;
      // direction lissée sur une corde de 1,6 m : le rang pivote progressivement dans un virage
      samplePath(g, s + 0.8);
      const bx = sample.x;
      const bz = sample.z;
      samplePath(g, s - 0.8);
      let cx = bx - sample.x;
      let cz = bz - sample.z;
      const cl = Math.sqrt(cx * cx + cz * cz);
      if (cl > 1e-4) {
        cx /= cl;
        cz /= cl;
      } else {
        cx = dx;
        cz = dz;
      }
      rx = -cz;
      rz = cx;
      dx = cx;
      dz = cz;
    }
    a.sx = px + rx * a.lx;
    a.sz = pz + rz * a.lx;
    a.sh = Math.atan2(dx, dz);
    a.svx = dx * v;
    a.svz = dz * v;
  }
  // repère : la tête
  samplePath(g, g.s);
  g.ax = sample.x;
  g.az = sample.z;
  g.ah = Math.atan2(sample.dx, sample.dz);
  g.avx = sample.dx * v;
  g.avz = sample.dz * v;
  g.dirty = g.moving;
}

/** Pousse hors des obstacles les emplacements d'un bloc à l'arrêt (murs, mobilier). */
export function settleSlots(k: Kernel, g: FormGroup): void {
  const agents = g.agents;
  const pos = k.v2;
  const world = k.ctx.world;
  const props = k.ctx.props;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.hasSlot) continue;
    pos.x = a.sx;
    pos.z = a.sz;
    let moved = world.resolveCircle(pos, 0.34);
    if (props.resolveCircle(pos, 0.34)) moved = true;
    if (moved && pos.x === pos.x && pos.z === pos.z) {
      a.sx = pos.x;
      a.sz = pos.z;
    }
  }
}

// ───────────────────────────── mesures ─────────────────────────────

/**
 * Écarts des agents du premier rang à leur emplacement (maximum, quadratique moyen) et retard maximal de
 * tout agent dans le sens de la marche. Les agents détachés ou hors de combat ne sont pas comptés.
 */
export function measure(g: FormGroup): void {
  const front = g.front;
  let max = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < front.length; i++) {
    const a = front[i];
    if (!a.hasSlot || !a.able || a.op !== null || a.p.isPlayer) continue;
    const dx = a.sx - a.p.x;
    const dz = a.sz - a.p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > max) max = d2;
    sum += d2;
    cnt++;
  }
  g.errMax = Math.sqrt(max);
  g.errRms = cnt > 0 ? Math.sqrt(sum / cnt) : 0;
  let lag = 0;
  let all = 0;
  const sp = Math.sqrt(g.avx * g.avx + g.avz * g.avz);
  const ux = sp > 0.05 ? g.avx / sp : 0;
  const uz = sp > 0.05 ? g.avz / sp : 0;
  const agents = g.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.hasSlot || !a.able || a.op !== null || a.p.isPlayer) continue;
    const dx = a.sx - a.p.x;
    const dz = a.sz - a.p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > all) all = d2;
    const l = dx * ux + dz * uz;
    if (l > lag) lag = l;
  }
  g.errAll = Math.sqrt(all);
  g.lag = lag;
}

/** Écart maximal des personnes à la droite ajustée sur elles (moindres carrés) : rectitude d'un rang. */
export function lineError(people: readonly Person[], n: number): number {
  if (n < 3) return 0;
  let mx = 0;
  let mz = 0;
  for (let i = 0; i < n; i++) {
    mx += people[i].x;
    mz += people[i].z;
  }
  mx /= n;
  mz /= n;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (let i = 0; i < n; i++) {
    const dx = people[i].x - mx;
    const dz = people[i].z - mz;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  // direction principale
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(theta);
  const uz = Math.sin(theta);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs((people[i].x - mx) * -uz + (people[i].z - mz) * ux);
    if (d > max) max = d;
  }
  return max;
}

/** Barycentre des agents formables d'une liste (écrit dans k.v2) ; retourne leur nombre. */
export function centroid(k: Kernel, agents: readonly Agent[]): number {
  let x = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.formable) continue;
    x += a.p.x;
    z += a.p.z;
    n++;
  }
  if (n === 0) {
    for (let i = 0; i < agents.length; i++) {
      x += agents[i].p.x;
      z += agents[i].p.z;
      n++;
    }
  }
  k.v2.x = n > 0 ? x / n : 0;
  k.v2.z = n > 0 ? z / n : 0;
  return n;
}
