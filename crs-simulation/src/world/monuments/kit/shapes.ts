/* Kit monuments — primitives : boîte, tronc de pyramide, cylindre, révolution, prisme sur emprise,
 * extrusion d'un profil le long d'une polyligne, poutre et tube entre deux points, sphère, disque.
 * Toutes les primitives sont posées sur y = 0 (sauf mention) et produisent des UV en mètres. */
import * as THREE from 'three';
import { Geo, triangulateRaw } from './geo';
import { signedArea } from '../shape2d';

const TAU = Math.PI * 2;

export interface CapOpts { top?: boolean; bottom?: boolean }

/** Tronc de pyramide à base rectangulaire w0×d0 (y = 0) et sommet w1×d1 (y = h), centré. */
export function frustum(w0: number, d0: number, w1: number, d1: number, h: number, caps: CapOpts = {}): Geo {
  const g = new Geo();
  const a = w0 / 2, b = d0 / 2, c = w1 / 2, e = d1 / 2;
  g.face(-a, 0, b, a, 0, b, c, h, e, -c, h, e);            // +z
  g.face(a, 0, b, a, 0, -b, c, h, -e, c, h, e);            // +x
  g.face(a, 0, -b, -a, 0, -b, -c, h, -e, c, h, -e);        // −z
  g.face(-a, 0, -b, -a, 0, b, -c, h, e, -c, h, -e);        // −x
  if (caps.top !== false && c > 0 && e > 0) g.face(-c, h, e, c, h, e, c, h, -e, -c, h, -e);
  if (caps.bottom === true) g.face(-a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b);
  return g;
}

/** Boîte w×h×d posée sur y = 0, centrée en x/z. Le dessous est omis par défaut. */
export function box(w: number, h: number, d: number, caps: CapOpts = {}): Geo {
  return frustum(w, d, w, d, h, caps);
}

/** Boîte définie par ses coins (x0..x1, y0..y1, z0..z1). */
export function boxAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, caps: CapOpts = {}): Geo {
  return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), caps).translate((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2);
}

export interface CylOpts extends CapOpts {
  /** Portion d'arc : angle de départ et étendue (rad). Par défaut tour complet. */
  start?: number;
  sweep?: number;
  /** Normales à facettes (prisme) au lieu de lisses. */
  flat?: boolean;
  /** UV normalisées 0..1 (u autour, v en hauteur) au lieu de mètres. */
  uvFit?: boolean;
}

/** Cylindre / cône d'axe y : rayon r0 en bas (y = 0), r1 en haut (y = h). Angle 0 = +z, croissant vers +x. */
export function cyl(r0: number, r1: number, h: number, seg = 16, o: CylOpts = {}): Geo {
  const g = new Geo();
  const start = o.start ?? 0, sweep = o.sweep ?? TAU;
  const slant = Math.hypot(h, r0 - r1);
  const ny = (r0 - r1) / (slant || 1), nr = h / (slant || 1);
  const rRef = Math.max(r0, r1);
  const uLen = o.uvFit ? 1 : rRef * sweep, vLen = o.uvFit ? 1 : slant;
  if (o.flat) {
    for (let i = 0; i < seg; i++) {
      const a0 = start + (i / seg) * sweep, a1 = start + ((i + 1) / seg) * sweep;
      const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
      g.face(r0 * s0, 0, r0 * c0, r0 * s1, 0, r0 * c1, r1 * s1, h, r1 * c1, r1 * s0, h, r1 * c0,
        (i / seg) * uLen, 0, { u1: ((i + 1) / seg) * uLen, v1: vLen });
    }
  } else {
    for (let i = 0; i <= seg; i++) {
      const a = start + (i / seg) * sweep;
      const s = Math.sin(a), c = Math.cos(a);
      g.vert(r0 * s, 0, r0 * c, s * nr, ny, c * nr, (i / seg) * uLen, 0);
      g.vert(r1 * s, h, r1 * c, s * nr, ny, c * nr, (i / seg) * uLen, vLen);
    }
    for (let i = 0; i < seg; i++) {
      const k = i * 2;
      if (r0 > 0 && r1 > 0) g.quad(k, k + 2, k + 3, k + 1);
      else if (r1 > 0) g.tri(k, k + 3, k + 1);
      else g.tri(k, k + 2, k + 1);
    }
  }
  if (o.top !== false && r1 > 0 && sweep >= TAU - 1e-6) g.append(disc(r1, seg, h, true, start));
  if (o.bottom === true && r0 > 0 && sweep >= TAU - 1e-6) g.append(disc(r0, seg, 0, false, start));
  return g;
}

/** Disque horizontal à l'altitude y, tourné vers le haut (ou le bas). UV en mètres. */
export function disc(r: number, seg = 16, y = 0, up = true, start = 0): Geo {
  const g = new Geo();
  const ny = up ? 1 : -1;
  const c = g.vert(0, y, 0, 0, ny, 0, 0, 0);
  for (let i = 0; i <= seg; i++) {
    const a = start + (i / seg) * TAU;
    const x = r * Math.sin(a), z = r * Math.cos(a);
    g.vert(x, y, z, 0, ny, 0, x, z);
  }
  for (let i = 0; i < seg; i++) { if (up) g.tri(c, c + 1 + i, c + 2 + i); else g.tri(c, c + 2 + i, c + 1 + i); }
  return g;
}

/** Couronne horizontale (rIn..rOut) à l'altitude y, tournée vers le haut. */
export function annulus(rIn: number, rOut: number, seg = 24, y = 0, up = true): Geo {
  const g = new Geo();
  const ny = up ? 1 : -1;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const s = Math.sin(a), c = Math.cos(a);
    g.vert(rIn * s, y, rIn * c, 0, ny, 0, rIn * s, rIn * c);
    g.vert(rOut * s, y, rOut * c, 0, ny, 0, rOut * s, rOut * c);
  }
  for (let i = 0; i < seg; i++) {
    const k = i * 2;
    if (up) g.quad(k, k + 1, k + 3, k + 2); else g.quad(k, k + 2, k + 3, k + 1);
  }
  return g;
}

export interface LatheOpts {
  /** Lisse le long du profil (dômes, vasques) ; sinon arêtes vives entre segments (moulures). */
  smooth?: boolean;
  start?: number;
  sweep?: number;
  /** UV normalisées 0..1. */
  uvFit?: boolean;
}

/**
 * Surface de révolution autour de y. `profile` = [r0, y0, r1, y1, …] décrit de BAS en HAUT le long de la
 * face extérieure (la matière est du côté de l'axe).
 */
export function lathe(profile: ArrayLike<number>, seg = 16, o: LatheOpts = {}): Geo {
  const g = new Geo();
  const n = profile.length >> 1;
  const start = o.start ?? 0, sweep = o.sweep ?? TAU;
  let rRef = 0, total = 0;
  const cum: number[] = [0];
  for (let k = 0; k < n; k++) {
    rRef = Math.max(rRef, profile[2 * k]);
    if (k > 0) { total += Math.hypot(profile[2 * k] - profile[2 * k - 2], profile[2 * k + 1] - profile[2 * k - 1]); cum.push(total); }
  }
  const uLen = o.uvFit ? 1 : rRef * sweep;
  const vScale = o.uvFit ? 1 / (total || 1) : 1;
  // normales de segment (radiale, y)
  const snr: number[] = [], sny: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const dr = profile[2 * k + 2] - profile[2 * k], dy = profile[2 * k + 3] - profile[2 * k + 1];
    const l = Math.hypot(dr, dy) || 1;
    snr.push(dy / l); sny.push(-dr / l);
  }
  const ring = (k: number, nr: number, ny: number): number => {
    const first = g.vertexCount;
    const r = profile[2 * k], y = profile[2 * k + 1];
    for (let i = 0; i <= seg; i++) {
      const a = start + (i / seg) * sweep;
      const s = Math.sin(a), c = Math.cos(a);
      g.vert(r * s, y, r * c, s * nr, ny, c * nr, (i / seg) * uLen, cum[k] * vScale);
    }
    return first;
  };
  const stitch = (lo: number, hi: number, rLo: number, rHi: number): void => {
    for (let i = 0; i < seg; i++) {
      if (rLo > 1e-6 && rHi > 1e-6) g.quad(lo + i, lo + i + 1, hi + i + 1, hi + i);
      else if (rHi > 1e-6) g.tri(lo + i, hi + i + 1, hi + i);
      else if (rLo > 1e-6) g.tri(lo + i, lo + i + 1, hi + i);
    }
  };
  if (o.smooth) {
    const rows: number[] = [];
    for (let k = 0; k < n; k++) {
      let nr = 0, ny = 0;
      if (k > 0) { nr += snr[k - 1]; ny += sny[k - 1]; }
      if (k < n - 1) { nr += snr[k]; ny += sny[k]; }
      const l = Math.hypot(nr, ny) || 1;
      rows.push(ring(k, nr / l, ny / l));
    }
    for (let k = 0; k < n - 1; k++) stitch(rows[k], rows[k + 1], profile[2 * k], profile[2 * k + 2]);
  } else {
    for (let k = 0; k < n - 1; k++) {
      const lo = ring(k, snr[k], sny[k]);
      const hi = ring(k + 1, snr[k], sny[k]);
      stitch(lo, hi, profile[2 * k], profile[2 * k + 2]);
    }
  }
  return g;
}

/** Triangule un anneau plan ; triangles renvoyés antihoraires vus de dessus (index dans contour puis trous). */
export function triangulate(ring: ArrayLike<number>, holes: ArrayLike<number>[] = []): number[] {
  const all: number[] = [];
  for (let i = 0; i < ring.length; i++) all.push(ring[i]);
  for (const h of holes) for (let i = 0; i < h.length; i++) all.push(h[i]);
  const tris = triangulateRaw(ring, holes);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    const area = signedArea([all[2 * a], all[2 * a + 1], all[2 * b], all[2 * b + 1], all[2 * c], all[2 * c + 1]]);
    if (area < 0) { tris[i + 1] = c; tris[i + 2] = b; }
  }
  return tris;
}

/** Face plane horizontale d'après une emprise (et ses trous), à l'altitude y. */
export function polygon(ring: ArrayLike<number>, y = 0, up = true, holes: ArrayLike<number>[] = []): Geo {
  const g = new Geo();
  const ny = up ? 1 : -1;
  const add = (r: ArrayLike<number>): void => { for (let i = 0; i + 1 < r.length; i += 2) g.vert(r[i], y, r[i + 1], 0, ny, 0, r[i], r[i + 1]); };
  add(ring);
  for (const h of holes) add(h);
  const tris = triangulate(ring, holes);
  for (let i = 0; i < tris.length; i += 3) { if (up) g.tri(tris[i], tris[i + 1], tris[i + 2]); else g.tri(tris[i], tris[i + 2], tris[i + 1]); }
  return g;
}

/** Murs verticaux d'une emprise (antihoraire) entre y0 et y1. `inward` retourne les faces (cour, trou). */
export function walls(ring: ArrayLike<number>, y0: number, y1: number, inward = false, uvFitV = false): Geo {
  const g = new Geo();
  const n = ring.length >> 1;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const fit = { u1: u + len, v1: uvFitV ? 1 : y1 - y0 };
    if (!inward) g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, u, 0, fit);
    else g.face(bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz, u, 0, fit);
    u += len;
  }
  return g;
}

/** Prisme droit sur une emprise antihoraire, de y0 à y1, avec dessus (et dessous facultatif). */
export function prism(ring: ArrayLike<number>, y0: number, y1: number, caps: CapOpts = {}, holes: ArrayLike<number>[] = []): Geo {
  const g = walls(ring, y0, y1);
  for (const h of holes) g.append(walls(h, y0, y1));
  if (caps.top !== false) g.append(polygon(ring, y1, true, holes));
  if (caps.bottom === true) g.append(polygon(ring, y0, false, holes));
  return g;
}

export interface SweepOpts {
  /** Polyligne fermée (anneau antihoraire : le profil sort vers l'extérieur). */
  closed?: boolean;
  /** Ferme les deux extrémités d'une polyligne ouverte par la section du profil. */
  capEnds?: boolean;
  /** Retourne le côté de sortie du profil (anneau horaire, cour intérieure). */
  flip?: boolean;
}

/**
 * Extrusion d'un PROFIL le long d'une POLYLIGNE horizontale avec raccords en onglet : corniches,
 * entablements, bandeaux, socles, mains courantes posés sur une emprise réelle.
 * `profile` = [o0, y0, o1, y1, …] : o = saillie vers l'extérieur (m) par rapport à la polyligne, y = altitude,
 * décrit de BAS en HAUT le long de la surface visible. `path` = [x0, z0, …].
 * Pour une polyligne ouverte, « l'extérieur » est à DROITE du sens de parcours vu de dessus… c'est-à-dire
 * du côté (−dz, dx), comme pour un anneau antihoraire.
 */
export function sweep(profile: ArrayLike<number>, path: ArrayLike<number>, o: SweepOpts = {}): Geo {
  const g = new Geo();
  const n = path.length >> 1;
  const m = profile.length >> 1;
  if (n < 2 || m < 2) return g;
  const closed = o.closed === true;
  const sign = o.flip ? -1 : 1;
  // direction d'onglet et échelle en chaque sommet
  const mx: number[] = [], mz: number[] = [], ms: number[] = [];
  const edgeN = (i: number, j: number): [number, number] => {
    const dx = path[2 * j] - path[2 * i], dz = path[2 * j + 1] - path[2 * i + 1];
    const l = Math.hypot(dx, dz) || 1;
    return [(-dz / l) * sign, (dx / l) * sign];
  };
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const n0 = hasPrev ? edgeN(p, i) : edgeN(i, q);
    const n1 = hasNext ? edgeN(i, q) : n0;
    let x = n0[0] + n1[0], z = n0[1] + n1[1];
    const l = Math.hypot(x, z);
    if (l < 1e-6) { x = n0[0]; z = n0[1]; } else { x /= l; z /= l; }
    const cos = Math.max(x * n0[0] + z * n0[1], 1 / 3);
    mx.push(x); mz.push(z); ms.push(1 / cos);
  }
  // longueurs cumulées du profil (v)
  const cum: number[] = [0];
  for (let k = 1; k < m; k++) cum.push(cum[k - 1] + Math.hypot(profile[2 * k] - profile[2 * k - 2], profile[2 * k + 1] - profile[2 * k - 1]));
  const segs = closed ? n : n - 1;
  let u = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const [enx, enz] = edgeN(i, j);
    const len = Math.hypot(path[2 * j] - path[2 * i], path[2 * j + 1] - path[2 * i + 1]);
    if (len < 1e-6) continue;
    for (let k = 0; k < m - 1; k++) {
      const o0 = profile[2 * k], y0 = profile[2 * k + 1], o1 = profile[2 * k + 2], y1 = profile[2 * k + 3];
      const dl = Math.hypot(o1 - o0, y1 - y0);
      if (dl < 1e-9) continue;
      const pn = (y1 - y0) / dl, py = -(o1 - o0) / dl;   // normale du segment de profil (sortie, y)
      const nx = enx * pn, nz = enz * pn;
      const ax0 = path[2 * i] + mx[i] * ms[i] * o0, az0 = path[2 * i + 1] + mz[i] * ms[i] * o0;
      const bx0 = path[2 * j] + mx[j] * ms[j] * o0, bz0 = path[2 * j + 1] + mz[j] * ms[j] * o0;
      const ax1 = path[2 * i] + mx[i] * ms[i] * o1, az1 = path[2 * i + 1] + mz[i] * ms[i] * o1;
      const bx1 = path[2 * j] + mx[j] * ms[j] * o1, bz1 = path[2 * j + 1] + mz[j] * ms[j] * o1;
      const a = g.vert(ax0, y0, az0, nx, py, nz, u, cum[k]);
      const b = g.vert(bx0, y0, bz0, nx, py, nz, u + len, cum[k]);
      const c = g.vert(bx1, y1, bz1, nx, py, nz, u + len, cum[k + 1]);
      const d = g.vert(ax1, y1, az1, nx, py, nz, u, cum[k + 1]);
      if (sign > 0) g.quad(a, b, c, d); else g.quad(a, d, c, b);
    }
    u += len;
  }
  if (!closed && o.capEnds) {
    // sections d'extrémité : polygone (saillie, y) fermé sur l'axe de la polyligne
    const capAt = (i: number, towardStart: boolean): void => {
      const pts: number[] = [];
      for (let k = 0; k < m; k++) pts.push(profile[2 * k], profile[2 * k + 1]);
      pts.push(Math.min(0, profile[2 * (m - 1)]), profile[2 * (m - 1) + 1], Math.min(0, profile[0]), profile[1]);
      const tris = triangulateRaw(pts);
      const j = towardStart ? 1 : n - 2;
      let tx = path[2 * i] - path[2 * j], tz = path[2 * i + 1] - path[2 * j + 1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const first = g.vertexCount;
      for (let k = 0; k < pts.length; k += 2) g.vert(path[2 * i] + mx[i] * pts[k], pts[k + 1], path[2 * i + 1] + mz[i] * pts[k], tx, 0, tz, pts[k], pts[k + 1]);
      for (let t = 0; t < tris.length; t += 3) {
        const a = first + tris[t], b = first + tris[t + 1], c = first + tris[t + 2];
        // oriente d'après la normale voulue
        const e1x = g.pos[3 * b] - g.pos[3 * a], e1y = g.pos[3 * b + 1] - g.pos[3 * a + 1], e1z = g.pos[3 * b + 2] - g.pos[3 * a + 2];
        const e2x = g.pos[3 * c] - g.pos[3 * a], e2y = g.pos[3 * c + 1] - g.pos[3 * a + 1], e2z = g.pos[3 * c + 2] - g.pos[3 * a + 2];
        const cx = e1y * e2z - e1z * e2y, cz = e1x * e2y - e1y * e2x;
        if (cx * tx + cz * tz >= 0) g.tri(a, b, c); else g.tri(a, c, b);
      }
    };
    capAt(0, true);
    capAt(n - 1, false);
  }
  return g;
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** Matrice amenant l'axe +y (longueur 1) sur le segment a→b (origine en a). */
export function alignY(ax: number, ay: number, az: number, bx: number, by: number, bz: number): { m: THREE.Matrix4; len: number } {
  _from.set(ax, ay, az); _to.set(bx, by, bz);
  _dir.subVectors(_to, _from);
  const len = _dir.length();
  if (len > 1e-9) _dir.divideScalar(len); else _dir.set(0, 1, 0);
  _q.setFromUnitVectors(_up, _dir);
  return { m: new THREE.Matrix4().compose(_from, _q, new THREE.Vector3(1, 1, 1)), len };
}

/** Tube (cylindre effilé) entre deux points : membres de sculptures, hampes, tuyaux. */
export function tube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1 = r0, seg = 6, caps = false): Geo {
  const { m, len } = alignY(ax, ay, az, bx, by, bz);
  return cyl(r0, r1, len, seg, { top: caps, bottom: caps }).transform(m);
}

/** Poutre de section w×d entre deux points (treillis, barreaux, chevrons). Sans abouts par défaut. */
export function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, d = w, caps = false): Geo {
  const { m, len } = alignY(ax, ay, az, bx, by, bz);
  return box(w, len, d, { top: caps, bottom: caps }).transform(m);
}

/** Sphère (ou ellipsoïde via scale) centrée à l'origine. */
export function sphere(r: number, wSeg = 10, hSeg = 6): Geo {
  const g = new Geo();
  for (let j = 0; j <= hSeg; j++) {
    const phi = (j / hSeg) * Math.PI;           // 0 = pôle haut
    const y = Math.cos(phi), s = Math.sin(phi);
    for (let i = 0; i <= wSeg; i++) {
      const a = (i / wSeg) * TAU;
      const x = s * Math.sin(a), z = s * Math.cos(a);
      g.vert(r * x, r * y, r * z, x, y, z, (i / wSeg) * TAU * r, (1 - j / hSeg) * Math.PI * r);
    }
  }
  const row = wSeg + 1;
  for (let j = 0; j < hSeg; j++) {
    for (let i = 0; i < wSeg; i++) {
      const a = j * row + i, b = a + row;
      if (j > 0) g.tri(a, b + 1, a + 1);
      if (j < hSeg - 1) g.tri(a, b, b + 1);
    }
  }
  return g;
}

/** Calotte / demi-sphère de rayon r (y ≥ 0), lisse, ouverte en bas. */
export function hemisphere(r: number, seg = 16, rows = 5, squash = 1): Geo {
  const prof: number[] = [];
  for (let k = 0; k <= rows; k++) { const a = (k / rows) * Math.PI / 2; prof.push(r * Math.cos(a), r * Math.sin(a) * squash); }
  return lathe(prof, seg, { smooth: true });
}

/** Quadrilatère libre à UV normalisées (plans à découpe alpha, panneaux de bas-relief). */
export function quadFit(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
  u0 = 0, v0 = 0, u1 = 1, v1 = 1,
): Geo {
  return new Geo().face(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, { u1, v1 });
}
