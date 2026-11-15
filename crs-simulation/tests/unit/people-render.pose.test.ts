// Tests de la logique pure du rendu des personnages : calcul des poses (pas de NaN, longueurs d'os,
// cinématique inverse exacte, symétrie de la marche, pied d'appui immobile, foulée ∝ vitesse).
import { describe, expect, it } from 'vitest';
import {
  BONE_ARM_L, BONE_ARM_R, BONE_CHEST, BONE_COUNT, BONE_FOOT_L, BONE_FOOT_R, BONE_FORE_L, BONE_FORE_R,
  BONE_HAND_L, BONE_HAND_R, BONE_HEAD, BONE_SHIN_L, BONE_SHIN_R, BONE_STRIDE, BONE_THIGH_L, BONE_THIGH_R,
  ANKLE_H, L_FORE, L_SHIN, L_THIGH, L_UPPER, LOCAL_SIZE,
} from '@/render/people/skeleton';
import { computePose, createPoseParams } from '@/render/people/pose';
import { composePose, solveLocal } from '@/render/people/solve';
import { gaitFrequency, strideLength } from '@/render/people/gait';
import {
  POSTURE_NAMES, POSTURE_STAND, P_ARM_L, P_ARM_R, UPPER_NAMES, U_NONE,
  armIK, createPoseInput, handAbs, type PoseInput,
} from '@/render/people/poseparams';

const P = createPoseParams();
const L = new Float64Array(LOCAL_SIZE);
const OUT = new Float64Array(BONE_COUNT * BONE_STRIDE);

function pose(inp: PoseInput, build = 1, yaw = 0): Float64Array {
  computePose(inp, P);
  solveLocal(P, build, L, 0);
  composePose(L, 0, inp.scale, build, yaw, 0, 0, OUT, 0);
  return OUT;
}

function bone(out: Float64Array, b: number): [number, number, number] {
  return [out[b * BONE_STRIDE + 4], out[b * BONE_STRIDE + 5], out[b * BONE_STRIDE + 6]];
}

function dist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function allFiniteAndUnit(out: Float64Array): boolean {
  for (let b = 0; b < BONE_COUNT; b++) {
    const o = b * BONE_STRIDE;
    for (let k = 0; k < 7; k++) if (!Number.isFinite(out[o + k])) return false;
    const n = Math.hypot(out[o], out[o + 1], out[o + 2], out[o + 3]);
    if (Math.abs(n - 1) > 1e-3) return false;
  }
  return true;
}

describe('rendu des personnages — poses', () => {
  it('pose de repos : proportions anatomiques', () => {
    const inp = createPoseInput();
    const out = pose(inp);
    const head = bone(out, BONE_HEAD);
    expect(head[1]).toBeGreaterThan(1.52);
    expect(head[1]).toBeLessThan(1.56);
    // chevilles à 8 cm du sol, écartées symétriquement
    const fl = bone(out, BONE_FOOT_L), fr = bone(out, BONE_FOOT_R);
    expect(fl[1]).toBeCloseTo(ANKLE_H, 2);
    expect(fr[1]).toBeCloseTo(ANKLE_H, 2);
    expect(fl[0]).toBeGreaterThan(0.05);
    expect(fl[0] + fr[0]).toBeCloseTo(0, 2);
    // poignets vers 0,86 m (bras le long du corps, coudes à peine fléchis)
    const hl = bone(out, BONE_HAND_L);
    expect(hl[1]).toBeGreaterThan(0.82);
    expect(hl[1]).toBeLessThan(0.92);
  });

  it('aucun NaN et quaternions unitaires pour toutes les postures et animations', () => {
    const inp = createPoseInput();
    let n = 0;
    for (let po = 0; po < POSTURE_NAMES.length; po++) {
      for (let u = 0; u < UPPER_NAMES.length; u++) {
        for (const speed of [0, 0.4, 1.4, 3.5, 6.5]) {
          for (const t of [0, 0.07, 0.21, 0.33, 0.5, 0.9, 2.3]) {
            for (const hold of [0, 2, 3, 4, 6, 10]) {
              inp.posture = po; inp.upper = u; inp.upperT = t; inp.t = t * 3.1 + 1; inp.speed = speed;
              inp.phase = (t * 1.7) % 1; inp.aimPitch = (t - 0.4) * 1.2; inp.aimYaw = (t - 0.5) * 2.5;
              inp.hold = hold; inp.alt = t > 0.3; inp.injury = u % 5; inp.variant = n; inp.seed = (n % 97) / 97;
              inp.moveFwd = Math.cos(t * 5); inp.moveSide = Math.sin(t * 5); inp.scale = 0.86 + (n % 5) * 0.06;
              const out = pose(inp, 0.85 + (n % 4) * 0.13, t * 2);
              if (!allFiniteAndUnit(out)) throw new Error(`pose invalide : posture ${POSTURE_NAMES[po]}, anim ${UPPER_NAMES[u]}, t ${t}, v ${speed}`);
              n++;
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(50000);
  });

  it('les os gardent leur longueur quelle que soit la pose', () => {
    const inp = createPoseInput();
    for (let u = 0; u < UPPER_NAMES.length; u++) {
      for (let po = 0; po < POSTURE_NAMES.length; po++) {
        inp.posture = po; inp.upper = u; inp.upperT = 0.25; inp.speed = 2.2; inp.phase = 0.37; inp.scale = 1.08;
        const out = pose(inp, 1.1, 0.7);
        const s = inp.scale;
        expect(dist(bone(out, BONE_ARM_L), bone(out, BONE_FORE_L))).toBeCloseTo(L_UPPER * s, 3);
        expect(dist(bone(out, BONE_FORE_L), bone(out, BONE_HAND_L))).toBeCloseTo(L_FORE * s, 3);
        expect(dist(bone(out, BONE_ARM_R), bone(out, BONE_FORE_R))).toBeCloseTo(L_UPPER * s, 3);
        expect(dist(bone(out, BONE_FORE_R), bone(out, BONE_HAND_R))).toBeCloseTo(L_FORE * s, 3);
        expect(dist(bone(out, BONE_THIGH_L), bone(out, BONE_SHIN_L))).toBeCloseTo(L_THIGH * s, 3);
        expect(dist(bone(out, BONE_SHIN_R), bone(out, BONE_FOOT_R))).toBeCloseTo(L_SHIN * s, 3);
      }
    }
  });

  it('cinématique inverse des bras : le poignet atteint la cible, la main prend l’orientation demandée', () => {
    const PP = createPoseParams();
    const LL = new Float64Array(LOCAL_SIZE);
    const O = new Float64Array(BONE_COUNT * BONE_STRIDE);
    const targets = [[0.2, 0.1, 0.35], [0.05, 0.35, 0.3], [0.3, 0.45, 0.05], [0.03, -0.25, -0.15], [-0.05, 0.2, 0.3]];
    for (const [tx, ty, tz] of targets) {
      PP.fill(0);
      armIK(PP, P_ARM_L, tx, ty, tz, 0.7, -0.7, -0.1);
      armIK(PP, P_ARM_R, tx, ty, tz, 0.7, -0.7, -0.1);
      handAbs(PP, P_ARM_R, 0, 0, 1, 0, 1, 0);
      solveLocal(PP, 1, LL, 0);
      composePose(LL, 0, 1, 1, 0, 0, 0, O, 0);
      const chest = bone(O, BONE_CHEST);
      const wl = bone(O, BONE_HAND_L), wr = bone(O, BONE_HAND_R);
      // repère « miroir » : x > 0 vers l'extérieur (gauche = +X du modèle, droite = -X)
      expect(wl[0] - chest[0]).toBeCloseTo(tx, 3);
      expect(wr[0] - chest[0]).toBeCloseTo(-tx, 3);
      expect(wl[1] - chest[1]).toBeCloseTo(ty, 3);
      expect(wr[2] - chest[2]).toBeCloseTo(tz, 3);
      // main droite : l'axe -Y (doigts, canon) pointe vers +Z, l'axe +Z (pouce) vers le haut
      const o = BONE_HAND_R * BONE_STRIDE;
      const qx = O[o], qy = O[o + 1], qz = O[o + 2], qw = O[o + 3];
      const rot = (vx: number, vy: number, vz: number): number[] => {
        const txx = 2 * (qy * vz - qz * vy), tyy = 2 * (qz * vx - qx * vz), tzz = 2 * (qx * vy - qy * vx);
        return [vx + qw * txx + (qy * tzz - qz * tyy), vy + qw * tyy + (qz * txx - qx * tzz), vz + qw * tzz + (qx * tyy - qy * txx)];
      };
      const fingers = rot(0, -1, 0), thumb = rot(0, 0, 1);
      expect(fingers[2]).toBeCloseTo(1, 3);
      expect(thumb[1]).toBeCloseTo(1, 3);
    }
  });

  it('marche symétrique : la jambe droite reproduit la gauche une demi-foulée plus tard', () => {
    const inp = createPoseInput();
    inp.speed = 1.4; inp.posture = POSTURE_STAND; inp.upper = U_NONE;
    for (const speed of [0.8, 1.4, 3.6, 6.0]) {
      inp.speed = speed;
      for (let i = 0; i < 20; i++) {
        const ph = i / 20;
        inp.phase = ph;
        const a = pose(inp);
        const fl = bone(a, BONE_FOOT_L), hl = bone(a, BONE_HAND_L), kl = bone(a, BONE_SHIN_L);
        inp.phase = (ph + 0.5) % 1;
        const b = pose(inp);
        const fr = bone(b, BONE_FOOT_R), hr = bone(b, BONE_HAND_R), kr = bone(b, BONE_SHIN_R);
        // miroir : x opposé, y et z identiques
        expect(fr[0]).toBeCloseTo(-fl[0], 2);
        expect(fr[1]).toBeCloseTo(fl[1], 2);
        expect(fr[2]).toBeCloseTo(fl[2], 2);
        expect(kr[1]).toBeCloseTo(kl[1], 2);
        expect(kr[2]).toBeCloseTo(kl[2], 2);
        expect(hr[1]).toBeCloseTo(hl[1], 2);
        expect(hr[2]).toBeCloseTo(hl[2], 2);
      }
    }
  });

  it('foulée proportionnelle à la vitesse : cadence et longueur de foulée croissantes', () => {
    let lastF = 0, lastS = 0;
    for (let v = 0.4; v <= 7; v += 0.2) {
      const f = gaitFrequency(v), st = strideLength(v, 1, 0);
      expect(f).toBeGreaterThan(lastF);
      expect(st).toBeGreaterThanOrEqual(lastS);
      // vitesse = cadence × foulée (au-dessus du pas minimal)
      if (st > 0.3) expect(f * st).toBeCloseTo(v, 5);
      lastF = f; lastS = st;
    }
    // ordres de grandeur réalistes : marche ≈ 1 cycle/s et 1,4 m par cycle ; sprint ≈ 3,6 m par cycle
    expect(strideLength(1.4, 1, 0)).toBeGreaterThan(1.2);
    expect(strideLength(1.4, 1, 0)).toBeLessThan(1.7);
    expect(strideLength(6.5, 1, 0)).toBeGreaterThan(3.2);
  });

  it('pied d’appui immobile : le recul du pied compense exactement l’avance du corps', () => {
    const inp = createPoseInput();
    for (const speed of [0.7, 1.0, 1.4, 1.8]) {
      inp.speed = speed;
      const stride = strideLength(speed, 1, 0);
      // phase d'appui à plat de la jambe gauche : 20 % à 50 % de l'appui (appui = 62 % du cycle)
      const zs: number[] = [];
      for (let ph = 0.62 * 0.2; ph <= 0.62 * 0.5; ph += 0.01) {
        inp.phase = ph;
        const out = pose(inp);
        const rootZ = ph * stride;          // le corps avance d'une foulée par cycle
        zs.push(rootZ + bone(out, BONE_FOOT_L)[2]);
        expect(Math.abs(bone(out, BONE_FOOT_L)[1] - ANKLE_H)).toBeLessThan(0.012);
      }
      const spread = Math.max(...zs) - Math.min(...zs);
      expect(spread).toBeLessThan(0.012);
    }
  });
});
