/* Lot « palais » — géométrie plane des grands édifices sur emprise réelle. DONNÉES PURES : aucun import de
 * Three.js ni du kit (ce fichier est chargé par collide/*.ts, donc aussi par la simulation sous Node).
 *
 * REPÈRE CANONIQUE. L'emprise fournie par la carte arrive dans le repère local du monument (origine au point
 * d'ancrage, façade vers +z), mais ni l'ancrage ni le cap ne sont garantis au degré près. Les pièces posées à la
 * main (dôme, colonnade, pavillons, guichets) sont donc exprimées dans un repère déduit de l'EMPRISE elle-même :
 * axes alignés sur la direction dominante des murs, origine au centre du rectangle englobant. `planOf` calcule ce
 * repère et le recale sur l'emprise de référence du monument (quart de tour ou demi-tour si la forme le demande). */
import type { MonumentCollider, MonumentSite } from './types';
import { cleanRing, ensureCCW, ringBounds, signedArea, transformRing, worldRingToLocal } from './shape2d';

export interface Plan {
  /** Emprise dans le repère canonique : antihoraire, murs alignés sur les axes, centrée sur son rectangle englobant. */
  ring: number[];
  /** Pose du repère canonique dans le repère local : translation (ox, oz), rotation `rot` (comme rotation.y). */
  ox: number; oz: number; rot: number;
  /** Largeur (x) et profondeur (z) du rectangle englobant. */
  w: number; d: number;
  /** true : emprise absente ou sans rapport avec la référence ; c'est la référence qui est utilisée. */
  fallback: boolean;
}

/** Rotation (rad, entre −45° et +45°) qui aligne la direction dominante des murs sur les axes. */
export function wallAngle(ring: ArrayLike<number>): number {
  const n = ring.length >> 1;
  let c = 0, s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const dx = ring[2 * i] - ring[2 * j], dz = ring[2 * i + 1] - ring[2 * j + 1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const a = 4 * Math.atan2(dz, dx);
    c += len * Math.cos(a); s += len * Math.sin(a);
  }
  return -Math.atan2(s, c) / 4;
}

/** Centre de gravité de la surface d'un anneau. */
export function centroid(ring: ArrayLike<number>): [number, number] {
  const n = ring.length >> 1;
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const k = ring[2 * j] * ring[2 * i + 1] - ring[2 * i] * ring[2 * j + 1];
    a += k; cx += (ring[2 * j] + ring[2 * i]) * k; cz += (ring[2 * j + 1] + ring[2 * i + 1]) * k;
  }
  if (Math.abs(a) < 1e-9) return [0, 0];
  return [cx / (3 * a), cz / (3 * a)];
}

interface Canon { ring: number[]; ox: number; oz: number; rot: number; w: number; d: number; gx: number; gz: number }

function canonAt(ring: ArrayLike<number>, rot: number): Canon {
  const turned = worldRingToLocal(ring, 0, 0, rot);
  const b = ringBounds(turned);
  const out: number[] = [];
  for (let i = 0; i < turned.length; i += 2) out.push(turned[i] - b.cx, turned[i + 1] - b.cz);
  const o = transformRing([b.cx, b.cz], 0, 0, rot);
  const g = centroid(out);
  return { ring: out, ox: o[0], oz: o[1], rot, w: b.w, d: b.d, gx: g[0], gz: g[1] };
}

/** Repère canonique d'une emprise seule (sans référence) : murs alignés, au plus près des axes locaux. */
export function canonFrame(footprint: ArrayLike<number>): Plan {
  const ring = cleanRing(ensureCCW(footprint), 0.01);
  const c = canonAt(ring, wallAngle(ring));
  return { ring: c.ring, ox: c.ox, oz: c.oz, rot: c.rot, w: c.w, d: c.d, fallback: false };
}

/**
 * Plan d'un monument : l'emprise du site ramenée dans le repère de la référence `ref` (emprise de référence du
 * monument, dans le repère où ses pièces ont été dessinées). Les deux emprises sont d'abord ramenées à leur repère
 * « murs alignés » ; parmi les quatre orientations possibles, on garde celle dont le gabarit et le centre de
 * gravité ressemblent le plus à la référence, avec une préférence pour l'orientation annoncée par la carte.
 */
export function planOf(site: MonumentSite, ref: ArrayLike<number>): Plan {
  const refRing = ensureCCW(ref);
  const rb = ringBounds(refRing);
  const identity: Plan = { ring: refRing, ox: 0, oz: 0, rot: 0, w: rb.w, d: rb.d, fallback: true };
  if (site.footprint.length < 6) return identity;
  const ring = cleanRing(ensureCCW(site.footprint), 0.01);
  if (ring.length < 6 || Math.abs(signedArea(ring)) < 1) return identity;
  const rc = canonAt(refRing, wallAngle(refRing));
  const base = wallAngle(ring);
  let best: Canon | null = null, bestCost = Infinity;
  for (let k = 0; k < 4; k++) {
    const c = canonAt(ring, base + (k * Math.PI) / 2);
    let turn = (c.rot - rc.rot) % (2 * Math.PI);
    if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
    const prior = 3 * Math.min(2, Math.abs(turn) / (Math.PI / 4));
    const cost = Math.abs(c.w - rc.w) + Math.abs(c.d - rc.d) + Math.abs(c.gx - rc.gx) + Math.abs(c.gz - rc.gz) + prior;
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  const c = best!;
  const rot = c.rot - rc.rot;
  const o = transformRing(worldRingToLocal([0, 0], rc.ox, rc.oz, rc.rot), c.ox, c.oz, c.rot);
  // emprise sans rapport avec la référence (gabarit à plus de 15 %) : la référence, posée au même endroit
  const off = Math.max(Math.abs(c.w - rc.w) / Math.max(rc.w, 1), Math.abs(c.d - rc.d) / Math.max(rc.d, 1));
  if (off > 0.15) return { ring: refRing, ox: o[0], oz: o[1], rot, w: rb.w, d: rb.d, fallback: true };
  const out = transformRing(c.ring, rc.ox, rc.oz, rc.rot);
  const ob = ringBounds(out);
  return { ring: out, ox: o[0], oz: o[1], rot, w: ob.w, d: ob.d, fallback: false };
}

/** Anneau du repère canonique → repère local du monument. */
export function planToLocal(p: Plan, ring: ArrayLike<number>): number[] {
  return transformRing(ring, p.ox, p.oz, p.rot);
}

/** Obstacles exprimés dans le repère canonique → repère local du monument. */
export function collidersToLocal(p: Plan, list: MonumentCollider[]): MonumentCollider[] {
  if (p.ox === 0 && p.oz === 0 && p.rot === 0) return list;
  return list.map((c) => ({ ring: transformRing(c.ring, p.ox, p.oz, p.rot), height: c.height, baseY: c.baseY }));
}

/** Rectangle orienté antihoraire : centre, largeur (x), profondeur (z), rotation (comme rotation.y). */
export function orect(cx: number, cz: number, w: number, d: number, rot = 0): number[] {
  const hx = w / 2, hz = d / 2;
  return transformRing([-hx, -hz, -hx, hz, hx, hz, hx, -hz], cx, cz, rot);
}

/** Rectangle aligné sur les axes, donné par ses bornes. */
export function rectOf(x0: number, z0: number, x1: number, z1: number): number[] {
  const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), e = Math.max(z0, z1);
  return [a, c, a, e, b, e, b, c];
}

// ───────────────────────────── simplification ─────────────────────────────

function dpRange(pts: ArrayLike<number>, i0: number, i1: number, tol: number, keep: Uint8Array): void {
  const n = pts.length >> 1;
  const ax = pts[2 * (i0 % n)], az = pts[2 * (i0 % n) + 1], bx = pts[2 * (i1 % n)], bz = pts[2 * (i1 % n) + 1];
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  let worst = -1, wd = tol;
  for (let i = i0 + 1; i < i1; i++) {
    const px = pts[2 * (i % n)] - ax, pz = pts[2 * (i % n) + 1] - az;
    const dist = len < 1e-9 ? Math.hypot(px, pz) : Math.abs(px * dz - pz * dx) / len;
    if (dist > wd) { wd = dist; worst = i; }
  }
  if (worst < 0) return;
  keep[worst % n] = 1;
  dpRange(pts, i0, worst, tol, keep);
  dpRange(pts, worst, i1, tol, keep);
}

/** Simplifie un anneau fermé (Douglas-Peucker) : les décrochements plus petits que `tol` disparaissent. */
export function simplifyRing(ring: ArrayLike<number>, tol: number): number[] {
  const n = ring.length >> 1;
  if (n <= 4) return Array.from(ring);
  // deux ancres : le sommet le plus à gauche et le plus éloigné de lui
  let a = 0;
  for (let i = 1; i < n; i++) if (ring[2 * i] < ring[2 * a] || (ring[2 * i] === ring[2 * a] && ring[2 * i + 1] < ring[2 * a + 1])) a = i;
  let b = a, far = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(ring[2 * i] - ring[2 * a], ring[2 * i + 1] - ring[2 * a + 1]); if (d > far) { far = d; b = i; } }
  const keep = new Uint8Array(n);
  keep[a] = 1; keep[b] = 1;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  dpRange(ring, lo, hi, tol, keep);
  dpRange(ring, hi, lo + n, tol, keep);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[2 * i], ring[2 * i + 1]);
  return out.length >= 6 ? out : Array.from(ring);
}

// ───────────────────────────── découpe ─────────────────────────────

/**
 * Coupe un anneau simple par la droite n·p = c. Rend les morceaux situés de chaque côté (`neg` : n·p < c).
 * Les morceaux gardent le sens de l'anneau d'origine. La droite est décalée d'une fraction de millimètre si elle
 * passe par un sommet.
 */
export function splitByLine(ring: ArrayLike<number>, nx: number, nz: number, c: number): { neg: number[][]; pos: number[][] } {
  const n = ring.length >> 1;
  const d = new Float64Array(n);
  let shift = 0;
  for (let tries = 0; tries < 40; tries++) {
    let touch = false;
    for (let i = 0; i < n; i++) { d[i] = nx * ring[2 * i] + nz * ring[2 * i + 1] - c - shift; if (Math.abs(d[i]) < 1e-5) touch = true; }
    if (!touch) break;
    shift += 0.00037;
  }
  let hasNeg = false, hasPos = false;
  for (let i = 0; i < n; i++) { if (d[i] < 0) hasNeg = true; else hasPos = true; }
  if (!hasPos) return { neg: [Array.from(ring)], pos: [] };
  if (!hasNeg) return { neg: [], pos: [Array.from(ring)] };
  const X: number[] = [], Z: number[] = [], D: number[] = [], next: number[] = [], prev: number[] = [], cross: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    X.push(ring[2 * i]); Z.push(ring[2 * i + 1]); D.push(d[i]);
    if (d[i] * d[j] < 0) {
      const t = d[i] / (d[i] - d[j]);
      cross.push(X.length);
      X.push(ring[2 * i] + (ring[2 * j] - ring[2 * i]) * t); Z.push(ring[2 * i + 1] + (ring[2 * j + 1] - ring[2 * i + 1]) * t); D.push(0);
    }
  }
  const N = X.length;
  for (let k = 0; k < N; k++) { next.push((k + 1) % N); prev.push((k + N - 1) % N); }
  // cordes intérieures : croisements triés le long de la droite, appariés deux à deux
  const tx = -nz, tz = nx;
  cross.sort((p, q) => X[p] * tx + Z[p] * tz - (X[q] * tx + Z[q] * tz));
  for (let m = 0; m + 1 < cross.length; m += 2) {
    const A = cross[m], B = cross[m + 1];
    const pa = prev[A], nb = next[B];
    const A2 = X.length; X.push(X[A]); Z.push(Z[A]); D.push(0); next.push(0); prev.push(0);
    const B2 = X.length; X.push(X[B]); Z.push(Z[B]); D.push(0); next.push(0); prev.push(0);
    next[pa] = A2; prev[A2] = pa; next[A2] = B2; prev[B2] = A2; next[B2] = nb; prev[nb] = B2;
    next[B] = A; prev[A] = B;
  }
  const seen = new Uint8Array(X.length);
  const neg: number[][] = [], pos: number[][] = [];
  for (let k = 0; k < X.length; k++) {
    if (seen[k]) continue;
    const piece: number[] = [];
    let side = 0, guard = 0;
    for (let q = k; !seen[q] && guard < 100000; q = next[q], guard++) {
      seen[q] = 1;
      piece.push(X[q], Z[q]);
      if (Math.abs(D[q]) > Math.abs(side)) side = D[q];
    }
    if (piece.length < 6 || Math.abs(signedArea(piece)) < 1e-4) continue;
    (side < 0 ? neg : pos).push(piece);
  }
  return { neg, pos };
}

function overlaps(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const p = ringBounds(a), q = ringBounds(b);
  return p.maxX > q.minX && q.maxX > p.minX && p.maxZ > q.minZ && q.maxZ > p.minZ;
}

interface Cross { ea: number; ta: number; eb: number; tb: number; x: number; z: number; entering: boolean; used: boolean; pa: number; pb: number }
interface Node { x: number; z: number; xi: number }

/**
 * Différence A − B d'un anneau simple A et d'un polygone CONVEXE B, par suivi des contours (Weiler-Atherton) :
 * le résultat n'est pas fragmenté (une encoche reste d'un seul tenant, un passage traversant donne deux morceaux).
 * Rend null si B est entièrement à l'intérieur de A (il faudrait un trou) : l'appelant coupe alors A en deux.
 */
function differenceConvex(a: number[], conv: ArrayLike<number>): number[][] | null {
  const na = a.length >> 1, nb = conv.length >> 1;
  // légère perturbation de B : aucun sommet de A (coordonnées au décimètre) ne tombe exactement sur un côté de B
  const B: number[] = [];
  for (let i = 0; i < nb; i++) B.push(conv[2 * i] + 1.37e-4 + i * 3.1e-5, conv[2 * i + 1] + 2.91e-4 - i * 1.7e-5);
  const xs: Cross[] = [];
  for (let i = 0; i < na; i++) {
    const i2 = (i + 1) % na;
    const ax = a[2 * i], az = a[2 * i + 1], dx = a[2 * i2] - ax, dz = a[2 * i2 + 1] - az;
    for (let j = 0; j < nb; j++) {
      const j2 = (j + 1) % nb;
      const bx = B[2 * j], bz = B[2 * j + 1], ex = B[2 * j2] - bx, ez = B[2 * j2 + 1] - bz;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((bx - ax) * ez - (bz - az) * ex) / den, u = ((bx - ax) * dz - (bz - az) * dx) / den;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      // normale sortante de B sur ce côté : (−ez, ex) ; A entre dans B si sa direction va contre elle
      xs.push({ ea: i, ta: t, eb: j, tb: u, x: ax + dx * t, z: az + dz * t, entering: dx * -ez + dz * ex < 0, used: false, pa: 0, pb: 0 });
    }
  }
  if (xs.length === 0) {
    if (pointInside(a[0], a[1], B)) return [];
    if (pointInside(B[0], B[1], a)) return null;
    return [a];
  }
  if (xs.length % 2 !== 0) return [a];                       // cas dégénéré : on renonce à découper
  const listA: Node[] = [], listB: Node[] = [];
  for (let i = 0; i < na; i++) {
    listA.push({ x: a[2 * i], z: a[2 * i + 1], xi: -1 });
    const on: number[] = [];
    for (let k = 0; k < xs.length; k++) if (xs[k].ea === i) on.push(k);
    on.sort((p, q) => xs[p].ta - xs[q].ta);
    for (const k of on) { xs[k].pa = listA.length; listA.push({ x: xs[k].x, z: xs[k].z, xi: k }); }
  }
  for (let j = 0; j < nb; j++) {
    listB.push({ x: B[2 * j], z: B[2 * j + 1], xi: -1 });
    const on: number[] = [];
    for (let k = 0; k < xs.length; k++) if (xs[k].eb === j) on.push(k);
    on.sort((p, q) => xs[p].tb - xs[q].tb);
    for (const k of on) { xs[k].pb = listB.length; listB.push({ x: xs[k].x, z: xs[k].z, xi: k }); }
  }
  const LA = listA.length, LB = listB.length;
  const out: number[][] = [];
  for (const start of xs) {
    if (start.entering || start.used) continue;
    const poly: number[] = [];
    let cur = start, guard = 0, bad = false;
    do {
      cur.used = true;
      poly.push(cur.x, cur.z);
      // contour de A, vers l'avant, jusqu'au prochain croisement (une entrée dans B)
      let k = (cur.pa + 1) % LA;
      while (listA[k].xi < 0 && guard++ < 200000) { poly.push(listA[k].x, listA[k].z); k = (k + 1) % LA; }
      const e = xs[listA[k].xi];
      if (!e || !e.entering) { bad = true; break; }
      e.used = true;
      poly.push(e.x, e.z);
      // contour de B, à rebours, jusqu'au prochain croisement (une sortie de A)
      let m = (e.pb + LB - 1) % LB;
      while (listB[m].xi < 0 && guard++ < 200000) { poly.push(listB[m].x, listB[m].z); m = (m + LB - 1) % LB; }
      cur = xs[listB[m].xi];
      if (!cur || cur.entering) { bad = true; break; }
    } while (cur !== start && guard++ < 200000);
    if (bad) return [a];
    out.push(poly);
  }
  return out;
}

function pointInside(px: number, pz: number, ring: ArrayLike<number>): boolean {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ix = ring[2 * i], iz = ring[2 * i + 1], jx = ring[2 * j], jz = ring[2 * j + 1];
    if ((iz > pz) !== (jz > pz) && px < ((jx - ix) * (pz - iz)) / (jz - iz) + ix) inside = !inside;
  }
  return inside;
}

/**
 * Retire un polygone CONVEXE d'un ensemble d'anneaux simples : rend des anneaux simples, sans trou. Une cour
 * entièrement entourée coupe l'anneau en deux le long d'une droite passant par son centre.
 */
export function subtractConvex(rings: number[][], conv: ArrayLike<number>): number[][] {
  const c = ensureCCW(conv);
  const out: number[][] = [];
  for (const ring of rings) {
    if (!overlaps(ring, c)) { out.push(ring); continue; }
    const diff = differenceConvex(ring, c);
    if (diff !== null) { for (const p of diff) out.push(p); continue; }
    // cour fermée : couper par la droite qui passe par son centre, le long de son premier côté
    const g = centroid(c);
    const dx = c[2] - c[0], dz = c[3] - c[1], len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const { neg, pos } = splitByLine(ring, nx, nz, nx * g[0] + nz * g[1]);
    for (const piece of [...neg, ...pos]) {
      const d2 = overlaps(piece, c) ? differenceConvex(piece, c) : [piece];
      for (const p of d2 ?? [piece]) out.push(p);
    }
  }
  return out;
}

/** Emprise privée de cours et de passages (polygones convexes) : la liste des pleins, en anneaux simples antihoraires. */
export function solidsMinus(ring: ArrayLike<number>, voids: ArrayLike<number>[], minArea = 2): number[][] {
  let rings: number[][] = [ensureCCW(ring)];
  for (const v of voids) rings = subtractConvex(rings, ensureCCW(v));
  return rings.map((r) => cleanRing(r, 0.02)).filter((r) => r.length >= 6 && signedArea(r) > minArea);
}

/** Partie d'un anneau située dans un polygone convexe (antihoraire) : les morceaux, en anneaux simples. */
export function clipConvex(ring: ArrayLike<number>, conv: ArrayLike<number>): number[][] {
  const m = conv.length >> 1;
  let inside: number[][] = [Array.from(ring)];
  for (let i = 0; i < m && inside.length > 0; i++) {
    const j = (i + 1) % m;
    const ax = conv[2 * i], az = conv[2 * i + 1], dx = conv[2 * j] - ax, dz = conv[2 * j + 1] - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    const nx = -dz / len, nz = dx / len;
    const nextInside: number[][] = [];
    for (const piece of inside) for (const p of splitByLine(piece, nx, nz, nx * ax + nz * az).neg) nextInside.push(p);
    inside = nextInside;
  }
  return inside.map((r) => cleanRing(r, 0.02)).filter((r) => r.length >= 6 && Math.abs(signedArea(r)) > 0.5);
}

export interface SegPart { t0: number; t1: number; /** Indice de la fenêtre qui contient ce tronçon, −1 = hors de toute fenêtre. */ win: number }

/** Découpe le segment a→b selon des fenêtres convexes (antihoraires, disjointes) : tronçons successifs de t = 0 à 1. */
export function segmentParts(ax: number, az: number, bx: number, bz: number, windows: ArrayLike<number>[]): SegPart[] {
  const hits: SegPart[] = [];
  const dx = bx - ax, dz = bz - az;
  for (let w = 0; w < windows.length; w++) {
    const conv = windows[w], m = conv.length >> 1;
    let t0 = 0, t1 = 1, ok = true;
    for (let i = 0; i < m && ok; i++) {
      const j = (i + 1) % m;
      const ex = conv[2 * j] - conv[2 * i], ez = conv[2 * j + 1] - conv[2 * i + 1];
      const nx = -ez, nz = ex;                                   // normale sortante (non normée)
      const num = nx * (conv[2 * i] - ax) + nz * (conv[2 * i + 1] - az), den = nx * dx + nz * dz;
      if (Math.abs(den) < 1e-12) { if (num < 0) ok = false; continue; }
      const t = num / den;
      if (den > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t;
      if (t0 >= t1) ok = false;
    }
    if (ok && t1 - t0 > 1e-6) hits.push({ t0, t1, win: w });
  }
  if (hits.length === 0) return [{ t0: 0, t1: 1, win: -1 }];
  hits.sort((p, q) => p.t0 - q.t0);
  const out: SegPart[] = [];
  let t = 0;
  for (const h of hits) {
    if (h.t0 > t + 1e-6) out.push({ t0: t, t1: h.t0, win: -1 });
    if (h.t1 > t) { out.push({ t0: Math.max(t, h.t0), t1: h.t1, win: h.win }); t = h.t1; }
  }
  if (t < 1 - 1e-6) out.push({ t0: t, t1: 1, win: -1 });
  return out;
}

/** Obstacle plein posé au sol. */
export function solid(ring: number[], height: number): MonumentCollider {
  return { ring: ensureCCW(ring), height, baseY: 0 };
}

/** Obstacle en surplomb (voûte de guichet, linteau) : on passe dessous si baseY > 2,5 m. */
export function overhead(ring: number[], baseY: number, top: number): MonumentCollider {
  return { ring: ensureCCW(ring), height: Math.max(0.1, top - baseY), baseY };
}

// ───────────────────────────── passages (guichets, porches) ─────────────────────────────

/** Passage voûté à travers une aile : rectangle orienté. On le traverse selon son axe z local (tourné de `rot`). */
export interface Passage {
  /** Centre du passage. */
  x: number; z: number;
  /** Largeur du bloc (le long de l'aile) et longueur de la traversée (épaisseur de l'aile). */
  width: number; length: number;
  /** Rotation de l'axe de traversée (rad, comme rotation.y ; 0 = on traverse selon z, π/2 = selon x). */
  rot?: number;
  /** Hauteur du bloc du guichet. */
  height: number;
  /** Arches : nombre (1 ou 3 en général), largeur et hauteur sous clef de chacune. */
  arches?: number; archWidth?: number; archHeight?: number;
}

/** Emprise au sol du bloc d'un passage (antihoraire). */
export function passageWindow(p: Passage, grow = 0): number[] {
  return orect(p.x, p.z, p.width + 2 * grow, p.length + 2 * grow, p.rot ?? 0);
}

/** Baies d'un passage : abscisse (le long de la largeur), largeur, hauteur sous clef. */
export function passageArches(p: Passage): { x: number; width: number; height: number }[] {
  const n = Math.max(1, p.arches ?? 1);
  const pitch = p.width / n;
  const w = Math.min(p.archWidth ?? pitch * 0.66, pitch - 0.6), h = Math.min(p.archHeight ?? p.height * 0.84, p.height - 0.5);
  const out: { x: number; width: number; height: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: -p.width / 2 + (i + 0.5) * pitch, width: w, height: h });
  return out;
}

/**
 * Obstacles d'un passage : les piles entre les baies (pleines) et la voûte (en surplomb, on passe dessous).
 * `top` : altitude du dessus de l'aile. `grow` élargit le bloc en longueur pour recouvrir les murs découpés.
 */
export function passageColliders(p: Passage, top: number, grow = 0.4): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const arches = passageArches(p), rot = p.rot ?? 0, len = p.length + 2 * grow;
  let x = -p.width / 2;
  const pier = (x0: number, x1: number): void => {
    if (x1 - x0 < 0.15) return;
    const c = transformRing([(x0 + x1) / 2, 0], p.x, p.z, rot);
    out.push(solid(orect(c[0], c[1], x1 - x0, len, rot), top));
  };
  let spring = Infinity;
  for (const a of arches) {
    pier(x, a.x - a.width / 2);
    x = a.x + a.width / 2;
    spring = Math.min(spring, a.height - a.width / 2);
  }
  pier(x, p.width / 2);
  const base = Math.max(2.6, spring);
  out.push(overhead(orect(p.x, p.z, p.width, len, rot), base, top));
  return out;
}
