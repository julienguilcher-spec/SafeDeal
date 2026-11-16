/* Lot « palais » — corps de bâtiment sur EMPRISE RÉELLE, pour les grands édifices très découpés.
 * Différences avec addPalace (palace.ts) :
 *   - les murs sont interrompus au droit des PASSAGES (guichets, porches) : on voit et on marche à travers ;
 *   - le toit ne suit pas chaque redent de l'emprise : il est posé en retrait sur une emprise simplifiée, dont on
 *     vérifie qu'elle reste un polygone simple (sinon on simplifie davantage, puis on renonce au comble) ;
 *   - un plafond ferme le dessus des murs (vu d'un drone, le bâtiment n'est jamais creux).
 * La façade peinte, la plinthe, le bandeau, la corniche et la balustrade viennent du kit. */
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { box, polygon, sweep } from './shapes';
import { balustrade, bandProfile, corniceProfile, loft, plinthProfile } from './classical';
import { archBlock, type ArchOpening } from './arch';
import { brisis, facadeMaterial, type FacadeLayout, type PalaceStyle } from './facade';
import type { MatRef } from './materials';
import { cleanRing, ensureCCW, insetRing, isSimpleRing, pointInRing, signedArea } from '../shape2d';
import { passageArches, passageWindow, segmentParts, simplifyRing, type Passage } from '../x-palais-plan';

export interface BodyOpts {
  /** Cours intérieures (sens indifférent). */
  holes?: ArrayLike<number>[];
  /** Passages voûtés traversants. */
  passages?: Passage[];
  /** Pierre des moulures. */
  trim?: MatRef;
  /** false : pas de toit (le monument pose le sien). */
  roof?: boolean;
  /** Tolérance de simplification de l'emprise du toit (m). */
  roofTol?: number;
  /** Pierre des blocs de guichet et matériau de leurs voûtes. */
  matPassage?: MatRef; matVault?: MatRef;
  /** Balustrade : false pour la supprimer même si le style en prévoit une ; dés tous les n mètres (0 = aucun). */
  balustrade?: boolean; postEvery?: number;
  /** Ordonnance propre aux murs des cours (même hauteur de murs que le style principal ; sinon elle est étirée). */
  courtStyle?: PalaceStyle;
  /** Moulures allégées (plinthe et bandeau omis) pour les très grandes emprises ou la basse qualité. */
  light?: boolean;
}

export interface BodyResult { wallTop: number; roofTop: number; bays: number }

interface Run { path: number[]; closed: boolean }

/** Chaînes de l'anneau situées hors des fenêtres de passage (pour les moulures basses). */
function runsOutside(ring: number[], windows: number[][]): Run[] {
  if (windows.length === 0) return [{ path: ring, closed: true }];
  const n = ring.length >> 1;
  const runs: number[][] = [];
  let cur: number[] = [];
  let anyCut = false, startsOutside = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const parts = segmentParts(ax, az, bx, bz, windows);
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      if (p.win < 0) {
        if (i === 0 && k === 0) startsOutside = true;
        if (cur.length === 0) cur.push(ax + (bx - ax) * p.t0, az + (bz - az) * p.t0);
        cur.push(ax + (bx - ax) * p.t1, az + (bz - az) * p.t1);
      } else {
        anyCut = true;
        if (cur.length >= 4) runs.push(cur);
        cur = [];
      }
    }
  }
  if (!anyCut) return [{ path: ring, closed: true }];
  if (cur.length >= 4) {
    if (runs.length > 0 && startsOutside) runs[0] = cur.concat(runs[0].slice(2)); else runs.push(cur);
  }
  return runs.map((path) => ({ path, closed: false }));
}

/** Murs à façade peinte d'un anneau, interrompus sous `passH[w]` dans chaque fenêtre de passage. */
function facadeRing(g: Geo, ring: number[], H: number, vTop: number, bay: number, windows: number[][], passH: number[]): number {
  const n = ring.length >> 1;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const short = len < bay * 0.6;
    const hu = Math.min(0.04, (len / bay) * 0.25);
    const k = Math.max(1, Math.round(len / bay));
    const U = (t: number): number => (short ? -hu + 2 * hu * t : (t * k) / 2);
    const parts = windows.length > 0 ? segmentParts(ax, az, bx, bz, windows) : [{ t0: 0, t1: 1, win: -1 }];
    for (const p of parts) {
      const y0 = p.win >= 0 ? passH[p.win] : 0;
      if (y0 >= H - 0.2) continue;
      const x0 = ax + (bx - ax) * p.t0, z0 = az + (bz - az) * p.t0, x1 = ax + (bx - ax) * p.t1, z1 = az + (bz - az) * p.t1;
      const v0 = (y0 / H) * vTop;
      g.faceUv(x0, y0, z0, x1, y0, z1, x1, H, z1, x0, H, z0, U(p.t0), v0, U(p.t1), v0, U(p.t1), vTop, U(p.t0), vTop);
    }
    if (!short) total += k;
  }
  return total;
}

/** Versant de comble peint (bande de lucarnes de l'atlas de façade), entre deux anneaux homologues. */
function paintedSlope(g: Geo, lo: number[], yLo: number, hi: number[], yHi: number, v0: number, v1: number, bay: number): void {
  const n = lo.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = lo[2 * i], az = lo[2 * i + 1], bx = lo[2 * j], bz = lo[2 * j + 1];
    const cx = hi[2 * j], cz = hi[2 * j + 1], dx = hi[2 * i], dz = hi[2 * i + 1];
    const l2 = Math.hypot(bx - ax, bz - az);
    if (l2 < 0.05) continue;
    const ex = (bx - ax) / l2, ez = (bz - az) / l2;
    const short = l2 < bay * 0.6;
    const k = Math.max(1, Math.round(l2 / bay));
    const u0 = short ? 0.46 : 0, su = short ? 0.08 / l2 : k / 2 / l2;
    const ud = ((dx - ax) * ex + (dz - az) * ez) * su, uc = ((cx - ax) * ex + (cz - az) * ez) * su;
    g.faceUv(ax, yLo, az, bx, yLo, bz, cx, yHi, cz, dx, yHi, dz, u0, v0, u0 + l2 * su, v0, u0 + uc, v1, u0 + ud, v1);
  }
}

/** Un anneau décalé est-il sain (polygone simple, de même sens que l'anneau d'origine, sans effondrement) ? */
function saneRing(ring: number[], from: number[], outer: boolean): boolean {
  const a = signedArea(ring), a0 = signedArea(from);
  if (ring.length < 6 || a * a0 <= 0) return false;
  if (outer ? a < a0 * 0.2 : Math.abs(a) > Math.abs(a0) * 12) return false;
  return isSimpleRing(ring);
}

interface Miter { mx: number[]; mz: number[]; scale: number[]; limit: number[] }

/**
 * Direction d'onglet rentrante de chaque sommet de `ring` et recul maximal le long de cette direction : la moitié
 * de la distance au premier mur rencontré en face (les siens ou ceux des `others`). Un comble ainsi borné ne
 * traverse jamais le versant opposé, même dans une aile étroite : le versant y devient simplement plus raide.
 */
function miterOf(ring: number[], others: number[][]): Miter {
  const n = ring.length >> 1;
  const M: Miter = { mx: [], mz: [], scale: [], limit: [] };
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let ax = ring[2 * i] - ring[2 * p], az = ring[2 * i + 1] - ring[2 * p + 1];
    let bx = ring[2 * q] - ring[2 * i], bz = ring[2 * q + 1] - ring[2 * i + 1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    let mx = az + bz, mz = -ax - bx;                              // somme des normales rentrantes (dz, −dx)
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = az; mz = -ax; } else { mx /= ml; mz /= ml; }
    const cos = Math.max(mx * az + mz * -ax, 1 / 3);
    const ox = ring[2 * i], oz = ring[2 * i + 1];
    let hit = Infinity;
    const probe = (other: number[], self: boolean): void => {
      const m = other.length >> 1;
      for (let k = 0; k < m; k++) {
        const l = (k + 1) % m;
        if (self && (k === i || l === i)) continue;
        const cx = other[2 * k], cz = other[2 * k + 1], dx = other[2 * l] - cx, dz = other[2 * l + 1] - cz;
        const den = mx * dz - mz * dx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ox) * dz - (cz - oz) * dx) / den;
        const u = ((cx - ox) * mz - (cz - oz) * mx) / den;
        if (t > 0.05 && u >= -1e-6 && u <= 1 + 1e-6 && t < hit) hit = t;
      }
    };
    probe(ring, true);
    for (const o of others) probe(o, false);
    M.mx.push(mx); M.mz.push(mz); M.scale.push(1 / cos); M.limit.push(hit === Infinity ? 1e9 : Math.max(0, hit * 0.4 - 0.1));
  }
  return M;
}

function insetLimited(ring: number[], M: Miter, d: number): number[] {
  const n = ring.length >> 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(d * M.scale[i], M.limit[i]);
    out.push(ring[2 * i] + M.mx[i] * t, ring[2 * i + 1] + M.mz[i] * t);
  }
  // un côté plus court que le recul se retourne : on le referme sur son milieu (le petit redent disparaît du toit)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = ring[2 * j] - ring[2 * i], ez = ring[2 * j + 1] - ring[2 * i + 1];
      const fx = out[2 * j] - out[2 * i], fz = out[2 * j + 1] - out[2 * i + 1];
      if (ex * fx + ez * fz < -1e-9) {
        const mx = (out[2 * i] + out[2 * j]) / 2, mz = (out[2 * i + 1] + out[2 * j + 1]) / 2;
        out[2 * i] = mx; out[2 * i + 1] = mz; out[2 * j] = mx; out[2 * j + 1] = mz;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Comble en retrait sur l'emprise `rings` ([contour antihoraire, cours horaires…]) : brisis (peint si le style a
 * des lucarnes), terrasson, dessus. Chaque anneau est simplifié juste assez pour que ses décalages restent des
 * polygones sains ; un anneau récalcitrant garde un comble droit (attique). Retourne l'altitude du faîte.
 */
export function addRoof(b: Builder, fac: Geo, rings: number[][], tol0: number, H: number, style: PalaceStyle, L: FacadeLayout): number {
  const top = style.roof.top ?? 'zinc';
  if (style.roof.kind === 'terrasse') return H;
  const { rise, run } = brisis(style);
  const h2 = style.roof.kind === 'mansart' ? style.roof.height * 0.28 : 0;
  const lo: number[][] = [], mid: number[][] = [], hi: number[][] = [];
  for (let i = 0; i < rings.length; i++) {
    const others = rings.filter((_, k) => k !== i);
    let done = false;
    for (const tol of [tol0, tol0 * 1.8, tol0 * 3.2, tol0 * 5.5]) {
      const simple = simplifyRing(rings[i], tol);
      const M = miterOf(simple, others);
      const g = tol * 0.75 + 0.3;
      const r0 = insetLimited(simple, M, g), r1 = insetLimited(simple, M, g + run), r2 = insetLimited(simple, M, g + run + h2 * 3);
      if (!saneRing(r0, simple, i === 0) || !saneRing(r1, simple, i === 0) || !saneRing(r2, simple, i === 0)) continue;
      lo.push(r0); mid.push(r1); hi.push(r2);
      done = true;
      break;
    }
    if (!done) {
      const simple = simplifyRing(rings[i], tol0);
      const r0 = insetLimited(simple, miterOf(simple, others), 0.3);
      lo.push(r0); mid.push(r0); hi.push(r0);
    }
  }
  const y1 = H + rise, yTop = y1 + h2;
  const painted = L.roofBand > 0;
  for (let i = 0; i < lo.length; i++) {
    if (painted) paintedSlope(fac, lo[i], H, mid[i], y1, L.floorV[L.floorV.length - 1], 1, style.bay);
    else b.add(style.roof.mat ?? 'ardoise', loft(lo[i], H, mid[i], y1));
    if (h2 > 0) b.add(top, loft(mid[i], y1, hi[i], yTop));
  }
  // dessus : seulement si les anneaux hauts ne se chevauchent pas (sinon la terrasse du niveau des murs reste visible)
  if (disjoint(hi)) b.add(top, polygon(hi[0], yTop, true, hi.slice(1)));
  return yTop;
}

function cross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Les cours restent-elles dans le contour, sans toucher ni le contour ni une autre cour ? */
function disjoint(rings: number[][]): boolean {
  for (let i = 1; i < rings.length; i++) {
    if (!pointInRing(rings[i][0], rings[i][1], rings[0])) return false;
    for (let j = 1; j < rings.length; j++) if (j !== i && pointInRing(rings[i][0], rings[i][1], rings[j])) return false;
  }
  for (let i = 0; i < rings.length; i++) {
    const a = rings[i], n = a.length >> 1;
    for (let j = i + 1; j < rings.length; j++) {
      const c = rings[j], m = c.length >> 1;
      for (let p = 0; p < n; p++) {
        const p2 = (p + 1) % n;
        for (let q = 0; q < m; q++) {
          const q2 = (q + 1) % m;
          if (cross(a[2 * p], a[2 * p + 1], a[2 * p2], a[2 * p2 + 1], c[2 * q], c[2 * q + 1], c[2 * q2], c[2 * q2 + 1])) return false;
        }
      }
    }
  }
  return true;
}

/** Bloc d'un guichet : mur épais percé d'arches, en légère saillie sur les deux faces de l'aile. */
export function addPassage(b: Builder, p: Passage, mat: MatRef = 'pierre_lisse', matVault: MatRef = 'pierre_lisse', proud = 0.35): void {
  const openings: ArchOpening[] = passageArches(p).map((a) => ({ x: a.x, width: a.width, height: a.height }));
  b.with(pose(p.x, 0, p.z, p.rot ?? 0), () => {
    archBlock(b, { width: p.width, height: p.height, depth: p.length + 2 * proud, openings, mat, matVault, left: true, right: true, top: true, seg: 10 });
    // corniche du bloc, sur les deux faces
    const c = new Geo();
    for (const s of [-1, 1]) c.append(box(p.width + 0.5, 0.45, 0.5, { bottom: true }).translate(0, p.height - 0.45, s * (p.length / 2 + proud + 0.05)));
    b.add(mat, c);
  });
}

/**
 * Corps de bâtiment sur emprise : murs à façade peinte (interrompus aux passages), moulures, plafond, comble en
 * retrait, balustrade, blocs de guichet. `emprise` : anneau [x0, z0, …], sens indifférent.
 */
export function addBody(b: Builder, emprise: ArrayLike<number>, style: PalaceStyle, o: BodyOpts = {}): BodyResult {
  const ring = cleanRing(ensureCCW(emprise), 0.05);
  if (ring.length < 6) return { wallTop: 0, roofTop: 0, bays: 0 };
  const holes = (o.holes ?? []).map((h) => {
    const c = cleanRing(ensureCCW(h), 0.05);
    const r: number[] = [];
    for (let i = (c.length >> 1) - 1; i >= 0; i--) r.push(c[2 * i], c[2 * i + 1]);
    return r;
  }).filter((h) => h.length >= 6);
  const rings = [ring, ...holes];
  const { material, layout } = facadeMaterial(style);
  const trim = o.trim ?? 'pierre_lisse';
  const H = layout.wallH, vTop = layout.floorV[layout.floorV.length - 1];
  const passages = o.passages ?? [];
  const windows = passages.map((p) => passageWindow(p));
  const passH = passages.map((p) => p.height);
  const fac = new Geo();
  let bays = facadeRing(fac, ring, H, vTop, style.bay, windows, passH);
  if (o.courtStyle && holes.length > 0) {
    const court = facadeMaterial(o.courtStyle);
    const cf = new Geo(), cv = court.layout.floorV[court.layout.floorV.length - 1];
    for (const r of holes) bays += facadeRing(cf, r, H, cv, o.courtStyle.bay, windows, passH);
    b.add(court.material, cf);
  } else for (const r of holes) bays += facadeRing(fac, r, H, vTop, style.bay, windows, passH);
  // moulures
  const cor = style.cornice ?? 0.7, corH = Math.max(0.6, cor * 1.1);
  const firstH = style.floors[0].height;
  const bandCut = passH.some((h) => h > firstH - 0.4);
  for (const r of rings) {
    if (!o.light) {
      for (const run of runsOutside(r, windows)) b.add(trim, sweep(plinthProfile(0, style.plinth ?? 0.8, 0.16), run.path, { closed: run.closed }));
      if (style.floors.length > 1) {
        const runs = bandCut ? runsOutside(r, windows) : [{ path: r, closed: true }];
        for (const run of runs) b.add(trim, sweep(bandProfile(firstH - 0.34, 0.34, 0.2), run.path, { closed: run.closed }));
      }
    }
    b.add(trim, sweep(corniceProfile(H - corH, corH, cor, r.length > 120 || o.light === true), r, { closed: true }));
  }
  // plafond au sommet des murs, puis comble en retrait
  b.add(style.roof.top ?? 'zinc', polygon(ring, H - 0.02, true, holes));
  let roofTop = H;
  if (o.roof !== false && style.roof.kind !== 'terrasse') roofTop = addRoof(b, fac, rings, o.roofTol ?? 1.6, H, style, layout);
  if (style.balustrade && o.balustrade !== false) {
    for (const r of rings) {
      const path = r.length > 80 ? simplifyRing(r, 0.45) : r;
      balustrade(b, insetRing(path, cor * 0.25), { y: H, height: 1.05, closed: true, mat: trim, postEvery: o.postEvery ?? style.bay * 2 });
    }
  }
  for (const p of passages) addPassage(b, p, o.matPassage ?? trim, o.matVault ?? trim);
  b.add(material, fac);
  return { wallTop: H, roofTop, bays };
}
