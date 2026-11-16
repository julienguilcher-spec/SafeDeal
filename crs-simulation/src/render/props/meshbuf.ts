/* =====================================================================================
 * RENDU DU DÉCOR — tampons de maillage et matrices (logique pure, sans DOM ni Three.js).
 *
 *   - MeshBuf : tampon extensible (positions, normales sur 8 bits, couleurs sRGB sur 8 bits,
 *     coordonnées d'atlas, octets d'effet, indices sur 32 bits) ;
 *   - matrices affines 3 × 4 (mêmes conventions que object.rotation de Three.js) ;
 *   - emitBuf / emitQuad : écrivent une instance transformée dans un tampon de destination.
 * ===================================================================================== */

import type { Region } from './atlas-layout';

// ───────────────────────────── tampon de maillage ─────────────────────────────

export class MeshBuf {
  pos: Float32Array;
  nrm: Int8Array;
  col: Uint8Array;
  uv: Float32Array;
  fx: Uint8Array;
  idx: Uint32Array;
  nv = 0;
  ni = 0;

  constructor(vCap = 256, iCap = 512) {
    this.pos = new Float32Array(vCap * 3);
    this.nrm = new Int8Array(vCap * 3);
    this.col = new Uint8Array(vCap * 4);
    this.uv = new Float32Array(vCap * 2);
    this.fx = new Uint8Array(vCap * 4);
    this.idx = new Uint32Array(iCap);
  }

  get vCap(): number {
    return this.pos.length / 3;
  }

  get iCap(): number {
    return this.idx.length;
  }

  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }

  /** Garantit la place pour `v` sommets et `i` indices supplémentaires (doublement de capacité). */
  ensure(v: number, i: number): void {
    const needV = this.nv + v;
    if (needV > this.vCap) {
      let cap = this.vCap * 2;
      while (cap < needV) cap *= 2;
      const pos = new Float32Array(cap * 3);
      pos.set(this.pos.subarray(0, this.nv * 3));
      this.pos = pos;
      const nrm = new Int8Array(cap * 3);
      nrm.set(this.nrm.subarray(0, this.nv * 3));
      this.nrm = nrm;
      const col = new Uint8Array(cap * 4);
      col.set(this.col.subarray(0, this.nv * 4));
      this.col = col;
      const uv = new Float32Array(cap * 2);
      uv.set(this.uv.subarray(0, this.nv * 2));
      this.uv = uv;
      const fx = new Uint8Array(cap * 4);
      fx.set(this.fx.subarray(0, this.nv * 4));
      this.fx = fx;
    }
    const needI = this.ni + i;
    if (needI > this.iCap) {
      let cap = this.iCap * 2;
      while (cap < needI) cap *= 2;
      const idx = new Uint32Array(cap);
      idx.set(this.idx.subarray(0, this.ni));
      this.idx = idx;
    }
  }

  /** Copie compacte (capacité = contenu). */
  compact(): MeshBuf {
    const b = new MeshBuf(Math.max(1, this.nv), Math.max(1, this.ni));
    b.pos.set(this.pos.subarray(0, this.nv * 3));
    b.nrm.set(this.nrm.subarray(0, this.nv * 3));
    b.col.set(this.col.subarray(0, this.nv * 4));
    b.uv.set(this.uv.subarray(0, this.nv * 2));
    b.fx.set(this.fx.subarray(0, this.nv * 4));
    b.idx.set(this.idx.subarray(0, this.ni));
    b.nv = this.nv;
    b.ni = this.ni;
    return b;
  }
}

// ───────────────────────────── matrices affines 3 × 4 ─────────────────────────────

/** [m00 m01 m02 tx  m10 m11 m12 ty  m20 m21 m22 tz] */
export type Mat = Float64Array;

export function matNew(): Mat {
  const m = new Float64Array(12);
  m[0] = m[5] = m[10] = 1;
  return m;
}

export function matIdentity(m: Mat): Mat {
  m.fill(0);
  m[0] = m[5] = m[10] = 1;
  return m;
}

export function matCopy(dst: Mat, src: Mat): Mat {
  dst.set(src);
  return dst;
}

const T = new Float64Array(12);

/** out = a · b (out peut être a). */
export function matMul(out: Mat, a: Mat, b: Mat): Mat {
  for (let r = 0; r < 3; r++) {
    const a0 = a[r * 4]!, a1 = a[r * 4 + 1]!, a2 = a[r * 4 + 2]!, a3 = a[r * 4 + 3]!;
    T[r * 4] = a0 * b[0]! + a1 * b[4]! + a2 * b[8]!;
    T[r * 4 + 1] = a0 * b[1]! + a1 * b[5]! + a2 * b[9]!;
    T[r * 4 + 2] = a0 * b[2]! + a1 * b[6]! + a2 * b[10]!;
    T[r * 4 + 3] = a0 * b[3]! + a1 * b[7]! + a2 * b[11]! + a3;
  }
  out.set(T);
  return out;
}

export function matTranslate(m: Mat, x: number, y: number, z: number): Mat {
  m[3]! += m[0]! * x + m[1]! * y + m[2]! * z;
  m[7]! += m[4]! * x + m[5]! * y + m[6]! * z;
  m[11]! += m[8]! * x + m[9]! * y + m[10]! * z;
  return m;
}

/** m = m · Ry(a) — même convention que object.rotation.y = a (le +z local part vers (sin a, cos a)). */
export function matRotY(m: Mat, a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 3; r++) {
    const x = m[r * 4]!, z = m[r * 4 + 2]!;
    m[r * 4] = x * c - z * s;
    m[r * 4 + 2] = x * s + z * c;
  }
  return m;
}

/** m = m · Rx(a) : a > 0 couche le +y local vers le +z local. */
export function matRotX(m: Mat, a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 3; r++) {
    const y = m[r * 4 + 1]!, z = m[r * 4 + 2]!;
    m[r * 4 + 1] = y * c + z * s;
    m[r * 4 + 2] = -y * s + z * c;
  }
  return m;
}

/** m = m · Rz(a) : a > 0 couche le +x local vers le +y local. */
export function matRotZ(m: Mat, a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 3; r++) {
    const x = m[r * 4]!, y = m[r * 4 + 1]!;
    m[r * 4] = x * c + y * s;
    m[r * 4 + 1] = -x * s + y * c;
  }
  return m;
}

export function matScale(m: Mat, sx: number, sy: number, sz: number): Mat {
  for (let r = 0; r < 3; r++) {
    m[r * 4]! *= sx;
    m[r * 4 + 1]! *= sy;
    m[r * 4 + 2]! *= sz;
  }
  return m;
}

/** Emplacement de graffiti : centre, demi-vecteur « droite », demi-vecteur « haut » (repère du modèle). */
export interface TagSpot {
  cx: number; cy: number; cz: number;
  rx: number; ry: number; rz: number;
  ux: number; uy: number; uz: number;
}


// ───────────────────────────── écriture d'instances ─────────────────────────────

/**
 * Ajoute à `dst` le maillage `src` transformé par `m`. `shade` assombrit les couleurs (1 = inchangé).
 * Aucune allocation hors croissance de `dst`.
 */
export function emitBuf(dst: MeshBuf, src: MeshBuf, m: Mat, shade = 1): void {
  const nv = src.nv;
  if (nv === 0) return;
  dst.ensure(nv, src.ni);
  const base = dst.nv;
  const sp = src.pos, sn = src.nrm, dp = dst.pos, dn = dst.nrm;
  const m0 = m[0]!, m1 = m[1]!, m2 = m[2]!, m3 = m[3]!, m4 = m[4]!, m5 = m[5]!, m6 = m[6]!, m7 = m[7]!;
  const m8 = m[8]!, m9 = m[9]!, m10 = m[10]!, m11 = m[11]!;
  let o = base * 3;
  for (let i = 0, k = 0; i < nv; i++, k += 3, o += 3) {
    const x = sp[k]!, y = sp[k + 1]!, z = sp[k + 2]!;
    dp[o] = m0 * x + m1 * y + m2 * z + m3;
    dp[o + 1] = m4 * x + m5 * y + m6 * z + m7;
    dp[o + 2] = m8 * x + m9 * y + m10 * z + m11;
    const nx = sn[k]!, ny = sn[k + 1]!, nz = sn[k + 2]!;
    // transformations rigides à l'instanciation : la partie linéaire suffit pour les normales
    const wx = m0 * nx + m1 * ny + m2 * nz, wy = m4 * nx + m5 * ny + m6 * nz, wz = m8 * nx + m9 * ny + m10 * nz;
    dn[o] = wx > 127 ? 127 : wx < -127 ? -127 : wx;
    dn[o + 1] = wy > 127 ? 127 : wy < -127 ? -127 : wy;
    dn[o + 2] = wz > 127 ? 127 : wz < -127 ? -127 : wz;
  }
  if (shade === 1) {
    dst.col.set(src.col.subarray(0, nv * 4), base * 4);
  } else {
    const sc = src.col, dc = dst.col;
    for (let i = 0, k = base * 4; i < nv * 4; i += 4, k += 4) {
      dc[k] = sc[i]! * shade;
      dc[k + 1] = sc[i + 1]! * shade;
      dc[k + 2] = sc[i + 2]! * shade;
      dc[k + 3] = sc[i + 3]!;
    }
  }
  dst.uv.set(src.uv.subarray(0, nv * 2), base * 2);
  dst.fx.set(src.fx.subarray(0, nv * 4), base * 4);
  const si = src.idx, di = dst.idx;
  let q = dst.ni;
  for (let i = 0; i < src.ni; i++) di[q++] = si[i]! + base;
  dst.nv = base + nv;
  dst.ni = q;
}

/** Ajoute à `dst` un quad texturé (graffiti) posé sur un emplacement du modèle, transformé par `m`. */
export function emitQuad(dst: MeshBuf, m: Mat, s: TagSpot, r: Region, color: number, lift = 0.012): void {
  dst.ensure(4, 6);
  // normale = droite × haut
  let nx = s.ry * s.uz - s.rz * s.uy, ny = s.rz * s.ux - s.rx * s.uz, nz = s.rx * s.uy - s.ry * s.ux;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const cx = s.cx + nx * lift, cy = s.cy + ny * lift, cz = s.cz + nz * lift;
  const base = dst.nv;
  const wnx = m[0]! * nx + m[1]! * ny + m[2]! * nz;
  const wny = m[4]! * nx + m[5]! * ny + m[6]! * nz;
  const wnz = m[8]! * nx + m[9]! * ny + m[10]! * nz;
  for (let k = 0; k < 4; k++) {
    const sr = k === 0 || k === 3 ? -1 : 1;
    const su = k < 2 ? -1 : 1;
    const x = cx + s.rx * sr + s.ux * su, y = cy + s.ry * sr + s.uy * su, z = cz + s.rz * sr + s.uz * su;
    const o = (base + k) * 3;
    dst.pos[o] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
    dst.pos[o + 1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
    dst.pos[o + 2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
    dst.nrm[o] = Math.round(wnx * 127);
    dst.nrm[o + 1] = Math.round(wny * 127);
    dst.nrm[o + 2] = Math.round(wnz * 127);
    const c = (base + k) * 4;
    dst.col[c] = (color >> 16) & 255;
    dst.col[c + 1] = (color >> 8) & 255;
    dst.col[c + 2] = color & 255;
    dst.col[c + 3] = 255;
    dst.uv[(base + k) * 2] = sr < 0 ? r.u0 : r.u1;
    dst.uv[(base + k) * 2 + 1] = su < 0 ? r.v0 : r.v1;
    dst.fx[c] = 0; dst.fx[c + 1] = 0; dst.fx[c + 2] = 0; dst.fx[c + 3] = 0;
  }
  const q = dst.ni;
  dst.idx[q] = base; dst.idx[q + 1] = base + 1; dst.idx[q + 2] = base + 2;
  dst.idx[q + 3] = base; dst.idx[q + 4] = base + 2; dst.idx[q + 5] = base + 3;
  dst.nv = base + 4;
  dst.ni = q + 6;
}

/** Hachage entier → [0, 1) (variantes déterministes par identifiant d'objet). */
export function hash01(n: number): number {
  let h = (n | 0) * 0x9e3779b1;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
