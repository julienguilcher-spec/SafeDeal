/* Pose de base : posture (debout, accroupi, à genoux, assis, couché, à terre, assis en véhicule) et
 * locomotion (marche, course, sprint, pas de côté, marche arrière). Logique pure, sans allocation.
 *
 * Le pied d'appui recule exactement à la vitesse du corps : la phase du cycle avance avec la distance
 * réellement parcourue (voir animator.ts) et la course du pied vaut (fraction d'appui × longueur de foulée). */

import { ANKLE_H, HIP_DROP, L_SHIN, L_THIGH, PELVIS_Y } from './skeleton';
import { HALF_PI, TAU, ease, facos, fcos, fsin, lerp, noise1, smoothstep } from './mathx';
import {
  INJURY_CRITICAL, INJURY_DEAD, INJURY_LIGHT, INJURY_SERIOUS,
  LG_ABD, LG_ANKLE, LG_FLEX, LG_KNEE, LG_TWIST,
  POSTURE_CROUCH, POSTURE_DOWN, POSTURE_KNEEL, POSTURE_PRONE, POSTURE_SEATED, POSTURE_SIT,
  P_ARM_L, P_ARM_R, P_CHEST, P_HEAD, P_LEG_L, P_LEG_R, P_NECK, P_PX, P_PY, P_PZ, P_RX, P_RY, P_RZ, P_SPINE,
  U_CARRIED, U_DRAGGED, U_RIDE,
  armFK, armIK, type PoseInput,
} from './poseparams';

const LEG_MAX = L_THIGH + L_SHIN - 0.004;
const FOOT_TOE = 0.19;
const FOOT_HEEL = 0.065;

/** Fréquence du cycle (cycles/s) pour une vitesse normalisée (m/s divisés par l'échelle de taille). */
export function gaitFrequency(vn: number): number {
  const run = smoothstep(2.0, 3.3, vn);
  return lerp(0.66 + 0.24 * vn, 1.15 + 0.095 * vn, run);
}

/**
 * Longueur d'un cycle complet (deux pas), à l'échelle 1. Plus courte en pas de côté et en marche arrière.
 * La phase avance de (distance parcourue / échelle) / strideLength.
 */
export function strideLength(vn: number, fwd: number, side: number): number {
  let st = vn / gaitFrequency(vn);
  const as = side < 0 ? -side : side;
  st *= (1 - 0.42 * as) * (fwd < 0 ? 1 + 0.3 * fwd : 1);
  return st < 0.28 ? 0.28 : st;
}

// résultat de la trajectoire d'un pied (réutilisé)
let footX = 0;
let footY = 0;
let footPitch = 0;

/** Avancée de la cheville quand le pied pivote (p > 0 : talon levé autour de la pointe ; p < 0 : pointe levée autour du talon). */
function rollX(p: number): number {
  if (p >= 0) return FOOT_TOE * (1 - fcos(p)) + ANKLE_H * fsin(p);
  return -FOOT_HEEL * (1 - fcos(p)) + ANKLE_H * fsin(p);
}

function rollY(p: number): number {
  if (p >= 0) return FOOT_TOE * fsin(p) - ANKLE_H * (1 - fcos(p));
  return -FOOT_HEEL * fsin(p) - ANKLE_H * (1 - fcos(p));
}

/** Trajectoire de la cheville par rapport à la hanche pour une phase de jambe 0..1. */
function footPath(ph: number, beta: number, travel: number, x0: number, pMax: number, pStrike: number, bump: number): void {
  if (ph < beta) {
    const tau = ph / beta;
    let p = 0;
    if (tau < 0.12) p = -pStrike * (1 - tau / 0.12);
    else if (tau > 0.5) p = pMax * ease((tau - 0.5) * 2);
    footX = x0 - travel * tau + rollX(p);
    footY = ANKLE_H + rollY(p);
    footPitch = p;
  } else {
    const sg = (ph - beta) / (1 - beta);
    const xa = x0 - travel + rollX(pMax);
    const ya = ANKLE_H + rollY(pMax);
    const xb = x0 + rollX(-pStrike);
    const yb = ANKLE_H + rollY(-pStrike);
    const e = ease(sg);
    footX = xa + (xb - xa) * e;
    footY = ya + (yb - ya) * sg + bump * fsin(Math.PI * sg) * (1.25 - 0.5 * sg);
    footPitch = pMax + (-pStrike - pMax) * ease(sg * 1.2);
  }
}

/**
 * Jambe par cinématique inverse dans le plan sagittal : cheville à (fwd, ankleY) par rapport à la hanche
 * (hauteur hipH), décalage latéral `lat` (> 0 vers la gauche du personnage), tangage du pied `pitch`.
 */
function legIK(
  P: Float64Array, base: number, side: number,
  fwd: number, lat: number, ankleY: number, hipH: number, pitch: number,
  pelvisRx: number, baseAbd: number, twist: number,
): void {
  const dy = hipH - ankleY;
  const d0 = Math.sqrt(fwd * fwd + dy * dy);
  let d = d0;
  if (d > LEG_MAX) d = LEG_MAX;
  else if (d < 0.14) d = 0.14;
  // angle de la droite hanche → cheville par rapport à la verticale (arc sinus rapide quand le pied est sous la hanche)
  const alpha = dy > 0.02 ? HALF_PI - facos(fwd / d0) : Math.atan2(fwd, dy);
  const cg = (L_THIGH * L_THIGH + d * d - L_SHIN * L_SHIN) / (2 * L_THIGH * d);
  const ck = (L_THIGH * L_THIGH + L_SHIN * L_SHIN - d * d) / (2 * L_THIGH * L_SHIN);
  const thigh = alpha + facos(cg);
  const knee = Math.PI - facos(ck);
  let sl = lat / (d < 0.35 ? 0.35 : d);
  sl = sl > 0.6 ? 0.6 : sl < -0.6 ? -0.6 : sl;
  P[base + LG_FLEX] = thigh + pelvisRx;
  P[base + LG_TWIST] = twist;
  P[base + LG_ABD] = baseAbd + side * (HALF_PI - facos(sl));
  P[base + LG_KNEE] = knee;
  P[base + LG_ANKLE] = -(pitch + thigh - knee);
}

function legFK(P: Float64Array, base: number, flex: number, abd: number, twist: number, knee: number, ankle: number): void {
  P[base + LG_FLEX] = flex;
  P[base + LG_TWIST] = twist;
  P[base + LG_ABD] = abd;
  P[base + LG_KNEE] = knee;
  P[base + LG_ANKLE] = ankle;
}

/** Debout / accroupi (crouch = 0 ou 1), avec marche et course. */
function locomotion(inp: PoseInput, P: Float64Array, crouch: number): void {
  const t = inp.t, seed = inp.seed;
  const vn = inp.speed / inp.scale;
  const w = smoothstep(0.02, 0.22, vn);
  const run = smoothstep(2.0, 3.3, vn) * (1 - crouch);
  const sprint = smoothstep(4.2, 6.5, vn) * (1 - crouch);
  const cf = inp.moveFwd, cs = inp.moveSide;
  const fwdness = cf > 0 ? cf : 0;
  const limp = inp.injury === INJURY_LIGHT ? 0.4 : inp.injury >= INJURY_SERIOUS ? 0.85 : 0;

  // phase (légère déformation en cas de boiterie : l'appui sur la jambe douloureuse est écourté)
  let ph = inp.phase;
  const beta = lerp(0.62, 0.38, run) - 0.12 * sprint;
  if (limp > 0) ph += 0.03 * limp * w * fsin(TAU * (ph - 0.5 - beta * 0.5));
  ph -= Math.floor(ph);
  const c1 = fcos(TAU * ph), s1 = fsin(TAU * ph);

  const stride = strideLength(vn, cf, cs);
  const travel = beta * stride * w;
  const pMax = lerp(0.85, 1.05, run) * fwdness * w * (1 - 0.5 * crouch);
  const pStrike = lerp(0.3, 0.06, run) * fwdness * w * (1 - crouch);
  const x0 = 0.5 * (travel - rollX(pMax)) + lerp(0.02, -0.10, run) * w;
  // piétinement quand le corps pivote sur place : les pieds se soulèvent sans avancer
  const turn = inp.turnRate < 0 ? -inp.turnRate : inp.turnRate;
  const shuffle = 0.55 * smoothstep(0.5, 2.2, turn) * (1 - w);
  const bump = (lerp(0.05, 0.22, run) + 0.16 * sprint) * (w + shuffle) * (1 - 0.3 * crouch);

  // bassin : hauteur de base, abaissement au double appui (marche) ou à mi-appui (course)
  const pelvisBase = -0.006 - 0.30 * crouch - 0.03 * limp * (1 - crouch) + inp.pelvisDY;
  const hipStand = PELVIS_Y + pelvisBase - HIP_DROP;
  const xr = x0 + rollX(-pStrike);
  const reachV = Math.sqrt(Math.max(0.01, LEG_MAX * LEG_MAX - xr * xr));
  const need = hipStand - (ANKLE_H + rollY(-pStrike) + reachV);
  const drop = need > 0 ? (need < 0.065 ? need : 0.065) : 0;
  const walkBob = -drop * (0.5 + 0.5 * fcos(2 * TAU * ph));
  const runBob = -0.035 - 0.05 * (0.5 + 0.5 * fcos(2 * TAU * (ph - beta * 0.5)));
  let bob = lerp(walkBob, runBob * w, run);
  // boiterie : le corps plonge quand la jambe droite (douloureuse) est en appui
  const badStance = limp > 0 ? smoothstep(-0.2, 0.6, -s1) : 0;
  bob -= 0.035 * limp * w * badStance;

  const idle = 1 - w;
  const swayT = t * 0.37 + seed * 17;
  P[P_PX] = 0.016 * w * s1 * (1 - run) + 0.012 * idle * fsin(swayT) - 0.02 * limp * w * badStance;
  P[P_PY] = pelvisBase + bob;
  P[P_PZ] = -0.10 * crouch + inp.pelvisDZ;
  P[P_RX] = 0.02 * run + 0.10 * crouch;
  P[P_RY] = -(0.07 + 0.05 * run) * c1 * w * fwdness;
  P[P_RZ] = 0.035 * s1 * w * (1 - run) + 0.01 * idle * fsin(swayT) - 0.05 * limp * w * badStance;

  // jambes
  const hipH = PELVIS_Y + P[P_PY] - HIP_DROP;
  const baseAbd = 0.032 + 0.02 * crouch;
  const twist = 0.13 * (1 - 0.6 * w);
  const stiff = 1 - 0.6 * limp;
  footPath(ph, beta, travel, x0, pMax, pStrike, bump);
  legIK(P, P_LEG_L, 1, footX * cf - P[P_PZ], footX * cs - P[P_PX], footY, hipH, footPitch, P[P_RX], baseAbd, twist);
  let phR = ph + 0.5;
  if (phR >= 1) phR -= 1;
  footPath(phR, beta, travel, x0, pMax * stiff, pStrike, bump * stiff);
  legIK(P, P_LEG_R, -1, footX * cf - P[P_PZ], footX * cs - P[P_PX], footY, hipH, footPitch, P[P_RX], baseAbd, twist);

  // tronc : contre-rotation des épaules, buste penché en courant, respiration
  const breath = fsin(t * 1.55 + seed * 40);
  const lean = 0.025 * w + 0.075 * run + 0.085 * sprint + 0.07 * limp;
  const counter = (0.06 + 0.07 * run) * c1 * w * fwdness;
  P[P_SPINE] = lean + 0.26 * crouch;
  P[P_SPINE + 1] = counter;
  P[P_SPINE + 2] = -0.5 * P[P_RZ] + 0.06 * limp * w * badStance;
  P[P_CHEST] = lean * 0.8 + 0.16 * crouch + 0.012 * breath;
  P[P_CHEST + 1] = counter;
  P[P_CHEST + 2] = 0;
  P[P_NECK] = -0.3 * (lean * 1.8 + 0.42 * crouch);
  P[P_HEAD] = -0.5 * (lean * 1.8 + 0.42 * crouch) + 0.02 * noise1(t * 0.31, seed) * idle;
  P[P_HEAD + 1] = 0.10 * noise1(t * 0.23 + 7, seed) * idle;

  // bras : balancement opposé aux jambes, coudes pliés en courant
  const amp = w * lerp(0.10 + 0.24 * (vn < 1.5 ? vn / 1.5 : 1), 0.8 + 0.25 * sprint, run) * (fwdness * 0.8 + 0.2);
  const elbowBase = lerp(0.16 + 0.10 * w, 1.45, run);
  const abd = 0.07 + 0.09 * run + 0.02 * idle * fsin(swayT * 1.3);
  const lag = fcos(TAU * ph - 0.25);
  armFK(P, P_ARM_L, -amp * lag + 0.04, abd, elbowBase + (0.22 - 0.1 * run) * amp * (1 - lag), 0.12 * run);
  armFK(P, P_ARM_R, amp * lag + 0.04, abd, elbowBase + (0.22 - 0.1 * run) * amp * (1 + lag), 0.12 * run);
}

function kneel(inp: PoseInput, P: Float64Array): void {
  const breath = fsin(inp.t * 1.5 + inp.seed * 40);
  P[P_PY] = -0.435;
  P[P_RX] = 0.03;
  const hipH = PELVIS_Y + P[P_PY] - HIP_DROP;
  // jambe gauche : pied à plat devant ; jambe droite : genou au sol, orteils en appui
  legIK(P, P_LEG_L, 1, 0.42, 0, ANKLE_H, hipH, 0, P[P_RX], 0.10, 0.05);
  legFK(P, P_LEG_R, -0.10 + P[P_RX], 0.06, 0, 1.75, 0);
  P[P_SPINE] = 0.05;
  P[P_CHEST] = 0.04 + 0.012 * breath;
  armFK(P, P_ARM_L, 0.55, 0.10, 0.85, 0.2);
  armFK(P, P_ARM_R, 0.12, 0.08, 0.35, 0);
}

function sit(inp: PoseInput, P: Float64Array): void {
  const breath = fsin(inp.t * 1.5 + inp.seed * 40);
  const variant = inp.variant & 1;
  P[P_PY] = -0.83;
  P[P_RX] = -0.22;
  const hipH = PELVIS_Y + P[P_PY] - HIP_DROP;
  if (variant === 0) {
    // genoux relevés, mains sur les tibias
    legIK(P, P_LEG_L, 1, 0.44, 0, ANKLE_H, hipH, 0, P[P_RX], 0.12, 0.1);
    legIK(P, P_LEG_R, -1, 0.40, 0, ANKLE_H, hipH, 0, P[P_RX], 0.12, 0.1);
    P[P_SPINE] = 0.30;
    P[P_CHEST] = 0.22 + 0.012 * breath;
    armIK(P, P_ARM_L, 0.13, -0.10, 0.37, 0.6, -1, 0.1);
    armIK(P, P_ARM_R, 0.13, -0.10, 0.37, 0.6, -1, 0.1);
  } else {
    // jambes allongées, appui sur les mains en arrière
    legIK(P, P_LEG_L, 1, 0.80, 0, ANKLE_H + 0.01, hipH, -0.5, P[P_RX], 0.14, 0.25);
    legIK(P, P_LEG_R, -1, 0.74, 0, ANKLE_H + 0.03, hipH, -0.4, P[P_RX], 0.14, 0.25);
    P[P_SPINE] = 0.05;
    P[P_CHEST] = 0.05 + 0.012 * breath;
    armIK(P, P_ARM_L, 0.24, -0.26, -0.20, 0.5, 0.2, -1);
    armIK(P, P_ARM_R, 0.24, -0.26, -0.20, 0.5, 0.2, -1);
  }
  P[P_NECK] = -0.05;
  P[P_HEAD] = -0.08;
}

function prone(inp: PoseInput, P: Float64Array): void {
  const vn = inp.speed / inp.scale;
  const crawl = smoothstep(0.05, 0.3, vn);
  const ph = inp.phase;
  const c1 = fcos(TAU * ph), s1 = fsin(TAU * ph);
  P[P_PY] = -0.815;
  P[P_RX] = 1.5;
  P[P_RZ] = 0.06 * s1 * crawl;
  P[P_RY] = 0.08 * c1 * crawl;
  // jambes dans l'axe, un genou remonte alternativement en rampant
  const kl = crawl * (0.5 + 0.5 * c1), kr = crawl * (0.5 - 0.5 * c1);
  legFK(P, P_LEG_L, 0.03 + 0.55 * kl, 0.12 + 0.35 * kl, 0.25, 0.08 + 1.0 * kl, -0.95);
  legFK(P, P_LEG_R, 0.03 + 0.55 * kr, 0.12 + 0.35 * kr, 0.25, 0.08 + 1.0 * kr, -0.95);
  // appui sur les coudes
  P[P_SPINE] = -0.22;
  P[P_CHEST] = -0.20 + 0.01 * fsin(inp.t * 1.5 + inp.seed * 40);
  P[P_NECK] = -0.25;
  P[P_HEAD] = -0.35;
  const rl = 0.10 * crawl * c1;
  armIK(P, P_ARM_L, 0.17, 0.31 - rl, 0.345, 0.35, -0.6, 0.5);
  armIK(P, P_ARM_R, 0.17, 0.31 + rl, 0.345, 0.35, -0.6, 0.5);
}

function down(inp: PoseInput, P: Float64Array): void {
  const t = inp.t, seed = inp.seed;
  const v = inp.variant % 5;
  const alive = inp.injury < INJURY_DEAD ? 1 : 0;
  const conscious = inp.injury < INJURY_CRITICAL ? 1 : 0;
  const breath = alive * fsin(t * (conscious ? 2.1 : 1.1) + seed * 40);
  const writhe = conscious * fsin(t * 1.3 + seed * 30);
  const writhe2 = conscious * fsin(t * 0.83 + seed * 11);
  if (inp.upper === U_DRAGGED) {
    // traîné par les épaules : buste relevé, bras vers le haut, jambes qui traînent
    P[P_PY] = -0.80;
    P[P_RX] = -1.28;
    legFK(P, P_LEG_L, 0.10, 0.08, 0.3, 0.12, -0.6);
    legFK(P, P_LEG_R, 0.16, 0.10, 0.3, 0.20, -0.6);
    P[P_SPINE] = 0.12;
    P[P_CHEST] = 0.10 + 0.012 * breath;
    P[P_HEAD] = 0.35;
    armIK(P, P_ARM_L, 0.16, 0.56, 0.10, 1, 0, 0.2);
    armIK(P, P_ARM_R, 0.16, 0.56, 0.10, 1, 0, 0.2);
    return;
  }
  if (v < 3) {
    // sur le dos
    P[P_PY] = -0.82;
    P[P_RX] = -1.5;
    P[P_RZ] = 0.04 * writhe2;
    const knee = v === 0 ? 1.25 + 0.15 * writhe : v === 1 ? 0.25 : 0.7 + 0.2 * writhe;
    legFK(P, P_LEG_L, 0.04, 0.12, 0.35, 0.10 + 0.05 * writhe2, -0.55);
    legFK(P, P_LEG_R, knee * 0.6, 0.16, 0.15, knee, -0.25);
    P[P_SPINE] = 0.04 * writhe;
    P[P_CHEST] = 0.02 + 0.015 * breath;
    P[P_NECK + 1] = 0.25 * (v === 1 ? -1 : 1);
    P[P_HEAD + 1] = 0.35 * (v === 1 ? -1 : 1) + 0.2 * writhe2;
    if (conscious && v !== 1) {
      // une main sur le ventre / la blessure, l'autre au sol
      armIK(P, P_ARM_L, 0.44, -0.04, -0.07, 0.3, -1, -0.2);
      armIK(P, P_ARM_R, -0.02, -0.10 + 0.02 * writhe, 0.135, 1, -0.2, 0.3);
    } else {
      armIK(P, P_ARM_L, 0.42, -0.10, -0.07, 0.3, -1, -0.2);
      armIK(P, P_ARM_R, 0.30, 0.34, -0.07, 1, 0.3, -0.2);
    }
  } else {
    // sur le côté, recroquevillé (position latérale)
    const sd = v === 3 ? 1 : -1;
    P[P_PY] = -0.77;
    P[P_RZ] = 1.5 * sd;
    P[P_RX] = 0.10;
    legFK(P, P_LEG_L, 1.0 + 0.1 * writhe, 0.0, 0, 1.45, -0.2);
    legFK(P, P_LEG_R, 0.75 + 0.1 * writhe2, 0.0, 0, 1.2, -0.2);
    P[P_SPINE] = 0.32;
    P[P_CHEST] = 0.24 + 0.015 * breath;
    P[P_NECK] = 0.15;
    P[P_HEAD] = 0.15;
    armIK(P, P_ARM_L, 0.02, 0.12, 0.24, 0.3, -1, 0.2);
    armIK(P, P_ARM_R, 0.04, -0.02, 0.27, 0.3, -1, 0.2);
  }
}

function seated(inp: PoseInput, P: Float64Array): void {
  const breath = fsin(inp.t * 1.5 + inp.seed * 40);
  const ride = inp.upper === U_RIDE ? 1 : 0;
  P[P_PY] = -0.39;
  P[P_RX] = -0.12 + 0.10 * ride;
  const hipH = PELVIS_Y + P[P_PY] - HIP_DROP;
  if (ride) {
    // à moto : jambes de part et d'autre de la selle, pieds sur les repose-pieds
    legIK(P, P_LEG_L, 1, 0.06, 0.10, 0.12, hipH, 0.1, P[P_RX], 0.30, 0.1);
    legIK(P, P_LEG_R, -1, 0.06, -0.10, 0.12, hipH, 0.1, P[P_RX], 0.30, 0.1);
    P[P_SPINE] = 0.22;
    P[P_CHEST] = 0.16 + 0.01 * breath;
    P[P_NECK] = -0.15;
    P[P_HEAD] = -0.22;
  } else {
    legIK(P, P_LEG_L, 1, 0.45, 0, 0.21, hipH, 0, P[P_RX], 0.07, 0.08);
    legIK(P, P_LEG_R, -1, 0.42, 0, 0.21, hipH, 0, P[P_RX], 0.07, 0.08);
    P[P_SPINE] = 0.10;
    P[P_CHEST] = 0.06 + 0.012 * breath;
    P[P_HEAD] = -0.04;
  }
  armIK(P, P_ARM_L, 0.10, -0.25, 0.30, 0.7, -0.6, -0.4);
  armIK(P, P_ARM_R, 0.10, -0.25, 0.30, 0.7, -0.6, -0.4);
}

/** Personne portée sur l'épaule d'un autre (la racine est alors placée sur le porteur). */
function carried(inp: PoseInput, P: Float64Array): void {
  const sway = fsin(inp.t * 2.2 + inp.seed * 9);
  P[P_PX] = -0.17;
  P[P_PY] = 0.56;
  P[P_PZ] = 0.02;
  P[P_RY] = Math.PI;
  P[P_RX] = 2.05;
  legFK(P, P_LEG_L, 1.75, 0.03, 0, 0.35 + 0.06 * sway, -0.5);
  legFK(P, P_LEG_R, 1.85, 0.03, 0, 0.25 - 0.06 * sway, -0.5);
  P[P_SPINE] = 0.30;
  P[P_CHEST] = 0.25;
  P[P_NECK] = 0.2;
  P[P_HEAD] = 0.25;
  armFK(P, P_ARM_L, 2.3 + 0.05 * sway, 0.12, 0.25, 0);
  armFK(P, P_ARM_R, 2.3 - 0.05 * sway, 0.12, 0.25, 0);
}

/** Écrit la pose de base (tous les paramètres) pour l'entrée donnée. */
export function basePose(inp: PoseInput, P: Float64Array): void {
  P.fill(0);
  if (inp.upper === U_CARRIED) {
    carried(inp, P);
    return;
  }
  switch (inp.posture) {
    case POSTURE_CROUCH: locomotion(inp, P, 1); break;
    case POSTURE_KNEEL: kneel(inp, P); break;
    case POSTURE_SIT: sit(inp, P); break;
    case POSTURE_PRONE: prone(inp, P); break;
    case POSTURE_DOWN: down(inp, P); break;
    case POSTURE_SEATED: seated(inp, P); break;
    default: locomotion(inp, P, 0); break;
  }
}

/** Indique si la posture laisse le haut du corps libre pour une animation. */
export function postureAllowsUpper(posture: number): boolean {
  return posture !== POSTURE_PRONE && posture !== POSTURE_DOWN;
}

