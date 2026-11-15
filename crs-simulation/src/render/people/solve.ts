/* Résolution d'une pose : paramètres sémantiques → rotations locales des os (quaternions), puis
 * cinématique directe → rotations et positions des os dans le repère du monde (relatif à la racine).
 * Logique pure, sans allocation. */

import {
  BONE_COUNT, BONE_OFFSET, BONE_PARENT, BONE_STRIDE, L_FORE, L_UPPER, LOCAL_SIZE,
  SHOULDER_X, SHOULDER_Y, SHOULDER_Z,
  BONE_ARM_L, BONE_ARM_R, BONE_THIGH_L, BONE_THIGH_R,
} from './skeleton';
import { fcos, fsin, qEulerXZY, qEulerYXZ, qFromBasis, qmul, type NumArray } from './mathx';
import {
  A_ABD, A_DX, A_DY, A_DZ, A_ELBOW, A_HMODE, A_MODE, A_POLEX, A_POLEY, A_POLEZ, A_SWING, A_TWIST,
  A_TX, A_TY, A_TZ, A_UX, A_UY, A_UZ, A_WX, A_WY, A_WZ, ARM_IK,
  LG_ABD, LG_ANKLE, LG_FLEX, LG_KNEE, LG_TWIST,
  P_ARM_L, P_ARM_R, P_CHEST, P_HEAD, P_LEG_L, P_LEG_R, P_NECK, P_PX, P_PY, P_PZ, P_RX, P_RY, P_RZ, P_SPINE,
} from './poseparams';

const ARM_REACH = L_UPPER + L_FORE - 0.003;
const tq = new Float64Array(12);

function solveArm(P: Float64Array, base: number, side: number, build: number, L: NumArray, o: number): void {
  if (P[base + A_MODE] !== ARM_IK) {
    qEulerXZY(L, o, -P[base + A_SWING], -side * P[base + A_TWIST], side * P[base + A_ABD]);
    const e = P[base + A_ELBOW] * 0.5;
    L[o + 4] = -fsin(e); L[o + 5] = 0; L[o + 6] = 0; L[o + 7] = fcos(e);
    const wx = P[base + A_WX], wy = P[base + A_WY], wz = P[base + A_WZ];
    if (wx === 0 && wy === 0 && wz === 0) {
      L[o + 8] = 0; L[o + 9] = 0; L[o + 10] = 0; L[o + 11] = 1;
    } else {
      qEulerXZY(L, o + 8, -wx, side * wy, side * wz);
    }
    return;
  }
  // ── cinématique inverse à deux os dans le repère du thorax ──
  const sx = side * SHOULDER_X * build;
  let dx = side * P[base + A_TX] - sx, dy = P[base + A_TY] - SHOULDER_Y, dz = P[base + A_TZ] - SHOULDER_Z;
  let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-5) { dx = 0; dy = -1; dz = 0; dist = 1e-5; }
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  if (dist > ARM_REACH) dist = ARM_REACH;
  else if (dist < 0.09) dist = 0.09;
  let cphi = (L_UPPER * L_UPPER + dist * dist - L_FORE * L_FORE) / (2 * L_UPPER * dist);
  cphi = cphi > 1 ? 1 : cphi < -1 ? -1 : cphi;
  const sphi = Math.sqrt(1 - cphi * cphi);
  // direction du coude : composante du « pôle » perpendiculaire à l'axe épaule → poignet
  let px = side * P[base + A_POLEX], py = P[base + A_POLEY], pz = P[base + A_POLEZ];
  let pd = px * nx + py * ny + pz * nz;
  let mx = px - pd * nx, my = py - pd * ny, mz = pz - pd * nz;
  let ml = Math.sqrt(mx * mx + my * my + mz * mz);
  if (ml < 1e-4) {
    // pôle dégénéré : on prend l'extérieur du corps, sinon l'arrière
    px = side; py = -0.3; pz = -0.4;
    pd = px * nx + py * ny + pz * nz;
    mx = px - pd * nx; my = py - pd * ny; mz = pz - pd * nz;
    ml = Math.sqrt(mx * mx + my * my + mz * mz);
    if (ml < 1e-4) { mx = 0; my = 0; mz = -1; ml = 1; }
  }
  mx /= ml; my /= ml; mz /= ml;
  // a1 : épaule → coude ; a2 : coude → poignet
  const a1x = cphi * nx + sphi * mx, a1y = cphi * ny + sphi * my, a1z = cphi * nz + sphi * mz;
  let a2x = (dist * nx - L_UPPER * a1x) / L_FORE;
  let a2y = (dist * ny - L_UPPER * a1y) / L_FORE;
  let a2z = (dist * nz - L_UPPER * a1z) / L_FORE;
  const a2l = Math.sqrt(a2x * a2x + a2y * a2y + a2z * a2z) || 1;
  a2x /= a2l; a2y /= a2l; a2z /= a2l;
  // axe de charnière du coude : X = normalize(a2 × a1)
  let hx = a2y * a1z - a2z * a1y, hy = a2z * a1x - a2x * a1z, hz = a2x * a1y - a2y * a1x;
  let hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (hl < 1e-4) {
    hx = a1y * mz - a1z * my; hy = a1z * mx - a1x * mz; hz = a1x * my - a1y * mx;
    hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
  }
  hx /= hl; hy /= hl; hz /= hl;
  // bras : Y = -a1, Z = X × Y
  const y1x = -a1x, y1y = -a1y, y1z = -a1z;
  qFromBasis(L, o, hx, hy, hz, y1x, y1y, y1z, hy * y1z - hz * y1y, hz * y1x - hx * y1z, hx * y1y - hy * y1x);
  // avant-bras : flexion pure autour de la charnière
  let c = a1x * a2x + a1y * a2y + a1z * a2z;
  c = c > 1 ? 1 : c < -1 ? -1 : c;
  L[o + 4] = -Math.sqrt((1 - c) * 0.5); L[o + 5] = 0; L[o + 6] = 0; L[o + 7] = Math.sqrt((1 + c) * 0.5);
  // main
  const hm = P[base + A_HMODE];
  if (hm === 0) {
    L[o + 8] = 0; L[o + 9] = 0; L[o + 10] = 0; L[o + 11] = 1;
    return;
  }
  let yx: number, yy: number, yz: number, zx: number, zy: number, zz: number;
  if (hm === 1) {
    // d exact (doigts / canon), u redressé
    let ddx = side * P[base + A_DX], ddy = P[base + A_DY], ddz = P[base + A_DZ];
    const dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    ddx /= dl; ddy /= dl; ddz /= dl;
    yx = -ddx; yy = -ddy; yz = -ddz;
    zx = side * P[base + A_UX]; zy = P[base + A_UY]; zz = P[base + A_UZ];
    const k = zx * yx + zy * yy + zz * yz;
    zx -= k * yx; zy -= k * yy; zz -= k * yz;
    let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (zl < 1e-4) { zx = hy * yz - hz * yy; zy = hz * yx - hx * yz; zz = hx * yy - hy * yx; zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; }
    zx /= zl; zy /= zl; zz /= zl;
  } else {
    // u exact (axe de l'objet, côté du pouce), doigts au plus près de l'avant-bras
    zx = side * P[base + A_UX]; zy = P[base + A_UY]; zz = P[base + A_UZ];
    const zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    yx = -a2x; yy = -a2y; yz = -a2z;
    const k = yx * zx + yy * zy + yz * zz;
    yx -= k * zx; yy -= k * zy; yz -= k * zz;
    let yl = Math.sqrt(yx * yx + yy * yy + yz * yz);
    if (yl < 1e-3) { yx = zy * hz - zz * hy; yy = zz * hx - zx * hz; yz = zx * hy - zy * hx; yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1; }
    yx /= yl; yy /= yl; yz /= yl;
  }
  // X = Y × Z ; rotation de la main dans le repère du thorax, puis ramenée dans celui de l'avant-bras
  qFromBasis(tq, 0, yy * zz - yz * zy, yz * zx - yx * zz, yx * zy - yy * zx, yx, yy, yz, zx, zy, zz);
  qmul(tq, 4, L, o, L, o + 4);          // avant-bras dans le repère du thorax
  tq[4] = -tq[4]; tq[5] = -tq[5]; tq[6] = -tq[6]; // conjugué
  qmul(L, o + 8, tq, 4, tq, 0);
}

function solveLeg(P: Float64Array, base: number, side: number, L: NumArray, o: number): void {
  qEulerXZY(L, o, -P[base + LG_FLEX], side * P[base + LG_TWIST], side * P[base + LG_ABD]);
  const k = P[base + LG_KNEE] * 0.5;
  L[o + 4] = fsin(k); L[o + 5] = 0; L[o + 6] = 0; L[o + 7] = fcos(k);
  const a = -P[base + LG_ANKLE] * 0.5;
  L[o + 8] = fsin(a); L[o + 9] = 0; L[o + 10] = 0; L[o + 11] = fcos(a);
}

/** Paramètres de pose → pose locale (LOCAL_SIZE nombres à partir de `o`). */
export function solveLocal(P: Float64Array, build: number, L: NumArray, o: number): void {
  qEulerYXZ(L, o, P[P_RX], P[P_RY], P[P_RZ]);
  qEulerYXZ(L, o + 4, P[P_SPINE], P[P_SPINE + 1], P[P_SPINE + 2]);
  qEulerYXZ(L, o + 8, P[P_CHEST], P[P_CHEST + 1], P[P_CHEST + 2]);
  qEulerYXZ(L, o + 12, P[P_NECK], P[P_NECK + 1], P[P_NECK + 2]);
  qEulerYXZ(L, o + 16, P[P_HEAD], P[P_HEAD + 1], P[P_HEAD + 2]);
  solveArm(P, P_ARM_L, 1, build, L, o + BONE_ARM_L * 4);
  solveArm(P, P_ARM_R, -1, build, L, o + BONE_ARM_R * 4);
  solveLeg(P, P_LEG_L, 1, L, o + BONE_THIGH_L * 4);
  solveLeg(P, P_LEG_R, -1, L, o + BONE_THIGH_R * 4);
  L[o + 68] = P[P_PX];
  L[o + 69] = P[P_PY];
  L[o + 70] = P[P_PZ];
}

/** Fondu entre deux poses locales (nlerp des quaternions, plus court chemin). out peut être a ou b. */
export function blendLocal(a: NumArray, ao: number, b: NumArray, bo: number, w: number, out: NumArray, oo: number): void {
  const u = 1 - w;
  for (let i = 0; i < BONE_COUNT * 4; i += 4) {
    const ax = a[ao + i], ay = a[ao + i + 1], az = a[ao + i + 2], aw = a[ao + i + 3];
    let bx = b[bo + i], by = b[bo + i + 1], bz = b[bo + i + 2], bw = b[bo + i + 3];
    if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let d = ax * bx + ay * by + az * bz + aw * bw;
    let ka = u, kb = w;
    if (d < 0.8) {
      // grand écart angulaire (retournement du corps) : interpolation sphérique, à vitesse angulaire constante
      if (d < -1) d = -1;
      const th = Math.acos(d), sn = Math.sin(th);
      if (sn > 1e-4) { ka = Math.sin(u * th) / sn; kb = Math.sin(w * th) / sn; }
    }
    const x = ax * ka + bx * kb, y = ay * ka + by * kb, z = az * ka + bz * kb, q = aw * ka + bw * kb;
    const n = 1 / (Math.sqrt(x * x + y * y + z * z + q * q) || 1);
    out[oo + i] = x * n; out[oo + i + 1] = y * n; out[oo + i + 2] = z * n; out[oo + i + 3] = q * n;
  }
  for (let i = BONE_COUNT * 4; i < LOCAL_SIZE; i++) out[oo + i] = a[ao + i] * u + b[bo + i] * w;
}

const rq = new Float64Array(4);

/**
 * Cinématique directe : pose locale → pour chaque os, quaternion (4) + position (3) + 0, relatifs à la
 * racine (pieds), cap inclus. `s` = échelle de taille, `build` = carrure (écarte épaules et hanches).
 * `yaw` = cap du corps ; `pitch`, `roll` = assiette supplémentaire (véhicule).
 */
export function composePose(
  L: NumArray, o: number, s: number, build: number,
  yaw: number, pitch: number, roll: number,
  out: NumArray, oo: number,
): void {
  if (pitch === 0 && roll === 0) {
    rq[0] = 0; rq[1] = fsin(yaw * 0.5); rq[2] = 0; rq[3] = fcos(yaw * 0.5);
  } else {
    qEulerYXZ(rq, 0, pitch, yaw, roll);
  }
  // bassin
  qmul(out, oo, rq, 0, L, o);
  {
    const vx = L[o + 68] * s, vy = (BONE_OFFSET[1] + L[o + 69]) * s, vz = L[o + 70] * s;
    const qx = rq[0], qy = rq[1], qz = rq[2], qw = rq[3];
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    out[oo + 4] = vx + qw * tx + (qy * tz - qz * ty);
    out[oo + 5] = vy + qw * ty + (qz * tx - qx * tz);
    out[oo + 6] = vz + qw * tz + (qx * ty - qy * tx);
    out[oo + 7] = 0;
  }
  const sb = s * build;
  for (let b = 1; b < BONE_COUNT; b++) {
    const po = oo + BONE_PARENT[b] * BONE_STRIDE;
    const bo = oo + b * BONE_STRIDE;
    const qx = out[po], qy = out[po + 1], qz = out[po + 2], qw = out[po + 3];
    const lo = o + b * 4;
    const lx = L[lo], ly = L[lo + 1], lz = L[lo + 2], lw = L[lo + 3];
    out[bo] = qw * lx + qx * lw + qy * lz - qz * ly;
    out[bo + 1] = qw * ly - qx * lz + qy * lw + qz * lx;
    out[bo + 2] = qw * lz + qx * ly - qy * lx + qz * lw;
    out[bo + 3] = qw * lw - qx * lx - qy * ly - qz * lz;
    const vx = BONE_OFFSET[b * 3] * sb, vy = BONE_OFFSET[b * 3 + 1] * s, vz = BONE_OFFSET[b * 3 + 2] * s;
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    out[bo + 4] = out[po + 4] + vx + qw * tx + (qy * tz - qz * ty);
    out[bo + 5] = out[po + 5] + vy + qw * ty + (qz * tx - qx * tz);
    out[bo + 6] = out[po + 6] + vz + qw * tz + (qx * ty - qy * tx);
    out[bo + 7] = 0;
  }
}
