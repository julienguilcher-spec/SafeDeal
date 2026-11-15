/* Animations du haut du corps : chaque animation écrit les cibles des mains (repère du thorax, x vers
 * l'extérieur), l'orientation des mains et des corrections du tronc. Logique pure, sans allocation.
 *
 * Repères de temps utiles à la simulation (secondes depuis le début, champ Person.upperT) :
 *   throw  : armé 0–0,30 ; lancer 0,30–0,46 (l'objet quitte la main vers 0,42) ; accompagnement jusqu'à 0,8.
 *   strike : armé 0–0,18 ; frappe 0,18–0,30 (impact vers 0,28) ; retour jusqu'à 0,6.
 *   kick   : armé 0–0,16 ; extension 0,16–0,28 (impact vers 0,26) ; retour jusqu'à 0,56.
 *   pickup : descente 0–0,32 ; prise vers 0,35 ; remontée jusqu'à 0,8. */

import { TAU, ease, fsin, lerp } from './mathx';
import {
  A_MODE, A_POLEX, A_POLEY, A_POLEZ, A_TX, A_TY, A_TZ, A_UX, A_UY, A_UZ, ARM_IK,
  HOLD_BANNER, HOLD_CAMERA, HOLD_CAMERA_TV, HOLD_LONG, HOLD_LOOT, HOLD_MEGAPHONE, HOLD_NONE, HOLD_PHONE,
  HOLD_PISTOL, HOLD_POLE, HOLD_REMOTE, HOLD_SHIELD, HOLD_SMALL, HOLD_SPRAY, HOLD_STICK, HOLD_BAG, HOLD_EXTINGUISHER,
  LG_ABD, LG_ANKLE, LG_FLEX, LG_KNEE,
  POSTURE_STAND, POSTURE_CROUCH, POSTURE_SEATED,
  P_ARM_L, P_ARM_R, P_CHEST, P_HEAD, P_LEG_R, P_NECK, P_PX, P_SPINE,
  U_AIM_LONG, U_AIM_PISTOL, U_BLOCK, U_BURN, U_CARRY_BANNER, U_CARRY_LOOT, U_CARRY_PERSON, U_CARRY_SIGN,
  U_CLAP, U_COUGH, U_COVER_FACE, U_CUFFED, U_DRAG, U_DRIVE, U_EXTINGUISH, U_FILM, U_FIST, U_HAMMER,
  U_HANDS_UP, U_KICK, U_MEGAPHONE, U_NONE, U_PHOTO, U_PICKUP, U_POINT, U_PUSH, U_RADIO, U_REMOTE,
  U_RESTRAIN, U_RIDE, U_SHIELD_CARRY, U_SPRAY, U_SPRAYPAINT, U_STAGGER, U_STRIKE, U_THROW, U_TREAT,
  U_UMBRELLA, U_WAVE,
  armIK, armPitch, handAbs, handThumb, type PoseInput,
} from './poseparams';

const L = P_ARM_L;
const R = P_ARM_R;
const SH_Y = 0.215;

// position de repos (bras pendant) exprimée en cible IK, pour revenir en douceur
const REST_X = 0.215, REST_Y = -0.30, REST_Z = 0.035;

function torso(P: Float64Array, lean: number, twist: number): void {
  P[P_SPINE] += lean * 0.6;
  P[P_CHEST] += lean * 0.4;
  P[P_SPINE + 1] += twist * 0.45;
  P[P_CHEST + 1] += twist * 0.55;
}

function head(P: Float64Array, nod: number, turn: number, tilt: number): void {
  P[P_NECK] += nod * 0.4;
  P[P_HEAD] += nod * 0.6;
  P[P_NECK + 1] += turn * 0.4;
  P[P_HEAD + 1] += turn * 0.6;
  P[P_HEAD + 2] += tilt;
}

/** Interpolation de la cible d'un bras IK vers (x, y, z). */
function toward(P: Float64Array, base: number, x: number, y: number, z: number, k: number): void {
  P[base + A_TX] += (x - P[base + A_TX]) * k;
  P[base + A_TY] += (y - P[base + A_TY]) * k;
  P[base + A_TZ] += (z - P[base + A_TZ]) * k;
}

function pole(P: Float64Array, base: number, x: number, y: number, z: number): void {
  P[base + A_POLEX] = x;
  P[base + A_POLEY] = y;
  P[base + A_POLEZ] = z;
}

function thumbToward(P: Float64Array, base: number, x: number, y: number, z: number, k: number): void {
  P[base + A_UX] += (x - P[base + A_UX]) * k;
  P[base + A_UY] += (y - P[base + A_UY]) * k;
  P[base + A_UZ] += (z - P[base + A_UZ]) * k;
}

// ── maintiens par défaut selon l'objet tenu ─────────────────────────────────────────

function shieldCarry(inp: PoseInput, P: Float64Array, raised: number): void {
  // bouclier tenu par l'avant-bras gauche ; raised = 0 (porté bas) … 1 (levé devant le visage)
  armIK(P, L, lerp(0.02, -0.03, raised), lerp(-0.07, 0.16, raised), lerp(0.29, 0.33, raised), 0.7, -0.65, -0.1);
  handAbs(P, L, -1, lerp(-0.05, 0, raised), lerp(0.2, 0.12, raised), 0.03, 1, 0.06 * (1 - raised));
}

function batonReady(P: Float64Array): void {
  armIK(P, R, 0.26, 0.06, 0.16, 0.7, -0.6, -0.35);
  handThumb(P, R, 0.12, 0.9, 0.38);
}

function longLowReady(P: Float64Array): void {
  // arme longue en travers de la poitrine, canon vers le bas
  armIK(P, R, 0.14, -0.14, 0.15, 0.7, -0.5, -0.5);
  handAbs(P, R, -0.36, -0.52, 0.78, 0.2, 0.75, 0.6);
  armIK(P, L, 0.03, -0.35, 0.39, 0.7, -0.5, -0.4);
}

function aimLong(inp: PoseInput, P: Float64Array): void {
  armIK(P, R, 0.115, 0.165, 0.17, 0.65, -0.75, -0.2);
  handAbs(P, R, -0.05, 0, 1, 0, 1, 0);
  armIK(P, L, -0.085, 0.13, 0.45, 0.5, -0.85, 0);
  armPitch(P, R, inp.aimPitch, SH_Y, 0);
  armPitch(P, L, inp.aimPitch, SH_Y, 0);
  head(P, 0.06, 0, 0.10);
}

function aimPistol(inp: PoseInput, P: Float64Array): void {
  armIK(P, R, 0.045, 0.335, 0.47, 0.5, -0.85, 0);
  handAbs(P, R, -0.09, 0, 1, 0, 1, 0);
  armIK(P, L, 0.005, 0.30, 0.44, 0.5, -0.85, 0);
  handAbs(P, L, -0.25, 0.1, 1, 0, 1, 0);
  armPitch(P, R, inp.aimPitch, SH_Y, 0);
  armPitch(P, L, inp.aimPitch, SH_Y, 0);
}

function poleCarry(inp: PoseInput, P: Float64Array, lift: number): void {
  const bob = 0.03 * fsin(TAU * inp.t + inp.seed * 20);
  armIK(P, R, 0.03, 0.03 + bob + lift, 0.27, 0.7, -0.7, -0.1);
  handAbs(P, R, 0, -0.04, 1, 0, 1, 0.04);
  armIK(P, L, 0.03, -0.19 + bob + lift, 0.275, 0.7, -0.7, -0.1);
  handAbs(P, L, 0, -0.04, 1, 0, 1, 0.04);
}

function bannerCarry(P: Float64Array): void {
  armIK(P, R, 0.26, 0.165, 0.37, 0.6, -0.8, -0.1);
  handAbs(P, R, 0, 0.1, 1, -1, 0, 0);
  armIK(P, L, 0.26, 0.165, 0.37, 0.6, -0.8, -0.1);
  handAbs(P, L, 0, 0.1, 1, -1, 0, 0);
}

function lootCarry(P: Float64Array): void {
  armIK(P, R, 0.165, -0.13, 0.30, 0.8, -0.5, -0.3);
  handAbs(P, R, -0.7, 0.1, 0.7, 0, 1, 0);
  armIK(P, L, 0.165, -0.13, 0.30, 0.8, -0.5, -0.3);
  handAbs(P, L, -0.7, 0.1, 0.7, 0, 1, 0);
  torso(P, -0.08, 0);
}

function filmShoulder(inp: PoseInput, P: Float64Array): void {
  armIK(P, R, 0.215, 0.29, 0.20, 0.7, -0.7, -0.1);
  armIK(P, L, -0.10, 0.31, 0.33, 0.6, -0.8, 0);
  head(P, 0, 0, 0.08);
}

function filmPhone(inp: PoseInput, P: Float64Array): void {
  armIK(P, R, 0.13, 0.35, 0.36, 0.7, -0.7, 0);
  handAbs(P, R, -0.8, 0.5, 0.3, 0, 1, 0);
  armPitch(P, R, inp.aimPitch * 0.8, SH_Y, 0);
}

function cameraChest(P: Float64Array): void {
  armIK(P, R, 0.085, 0.03, 0.25, 0.7, -0.7, -0.2);
  handAbs(P, R, 0, 1, 0.15, 0, 0.15, -1);
  armIK(P, L, 0.02, 0.0, 0.29, 0.7, -0.7, -0.2);
}

/** Maintien quand aucune animation n'est demandée : dépend de l'objet en main. */
function holdPose(inp: PoseInput, P: Float64Array): void {
  switch (inp.hold) {
    case HOLD_SHIELD: shieldCarry(inp, P, inp.alt ? 1 : 0); break;
    case HOLD_LONG: if (inp.alt) aimLong(inp, P); else longLowReady(P); break;
    case HOLD_PISTOL: if (inp.alt) aimPistol(inp, P); else if (inp.fp) fpReady(inp, P); break;
    case HOLD_POLE: poleCarry(inp, P, 0); break;
    case HOLD_BANNER: bannerCarry(P); break;
    case HOLD_LOOT: lootCarry(P); break;
    case HOLD_CAMERA_TV: filmShoulder(inp, P); break;
    case HOLD_CAMERA: cameraChest(P); break;
    case HOLD_NONE: break;
    default: if (inp.fp) fpReady(inp, P); break;
  }
}

/** Vue à la première personne : l'objet tenu est remonté dans le champ de vision. */
function fpReady(inp: PoseInput, P: Float64Array): void {
  armIK(P, R, 0.17, 0.02, 0.36, 0.6, -0.8, -0.2);
  switch (inp.hold) {
    case HOLD_STICK: handThumb(P, R, -0.2, 0.85, 0.48); break;
    case HOLD_PISTOL: handAbs(P, R, -0.15, -0.3, 0.94, 0, 1, 0.3); break;
    case HOLD_SPRAY: handAbs(P, R, -0.05, 0.05, 1, 0, 1, 0); break;
    case HOLD_MEGAPHONE: handAbs(P, R, -0.1, 0.1, 1, 0, 1, 0); break;
    case HOLD_PHONE: handAbs(P, R, -0.8, 0.45, 0.4, 0, 1, 0); P[R + A_TY] = 0.18; break;
    case HOLD_REMOTE: handAbs(P, R, -0.5, 0.1, 0.85, -0.2, 0.9, -0.3); break;
    case HOLD_BAG: case HOLD_EXTINGUISHER: P[R + A_MODE] = 0; break;
    case HOLD_SMALL: default: handAbs(P, R, -0.2, 0.15, 1, 0.97, 0, 0.2); break;
  }
}

// ── animations ──────────────────────────────────────────────────────────────────────

function throwAnim(inp: PoseInput, P: Float64Array): void {
  const t = inp.upperT;
  const a = ease(t / 0.30), b = ease((t - 0.30) / 0.16), c = ease((t - 0.46) / 0.30), d = ease((t - 0.80) / 0.25);
  armIK(P, R, REST_X, REST_Y, REST_Z, 0.8, -0.3, -0.5);
  toward(P, R, 0.30, 0.40, -0.26, a);
  toward(P, R, 0.14, 0.50, 0.40, b);
  toward(P, R, -0.05, -0.08, 0.38, c);
  toward(P, R, REST_X, REST_Y, REST_Z, d);
  pole(P, R, lerp(0.8, 0.6, b), lerp(-0.2, -0.6, b), lerp(-0.6, -0.2, b));
  armPitch(P, R, inp.aimPitch * 0.7 * b * (1 - c), SH_Y, 0);
  armIK(P, L, REST_X, REST_Y, REST_Z, 0.7, -0.5, -0.5);
  toward(P, L, 0.10, 0.22, 0.44, a);
  toward(P, L, 0.26, -0.22, -0.12, b);
  toward(P, L, REST_X, REST_Y, REST_Z, d);
  const tw = -0.5 * a + 0.85 * b + 0.1 * c - 0.45 * d;
  const ln = -0.10 * a + 0.28 * b + 0.14 * c - 0.32 * d;
  torso(P, ln, tw);
}

function strikeAnim(inp: PoseInput, P: Float64Array): void {
  const t = inp.upperT;
  const a = ease(t / 0.18), b = ease((t - 0.18) / 0.12), c = ease((t - 0.32) / 0.28);
  armIK(P, R, 0.22, 0.02, 0.24, 0.7, -0.6, -0.35);
  handThumb(P, R, 0.1, 0.85, 0.5);
  toward(P, R, 0.30, 0.48, -0.10, a);
  thumbToward(P, R, 0.2, 0.55, -0.8, a);
  toward(P, R, 0.0, 0.06, 0.50, b);
  thumbToward(P, R, -0.12, -0.18, 0.97, b);
  toward(P, R, 0.22, 0.02, 0.24, c);
  thumbToward(P, R, 0.1, 0.85, 0.5, c);
  if (inp.hold !== HOLD_SHIELD && P[L + A_MODE] !== ARM_IK) {
    armIK(P, L, 0.12, 0.05, 0.28, 0.7, -0.7, -0.1);
  }
  torso(P, 0.20 * b * (1 - c) - 0.05 * a * (1 - b), -0.30 * a + 0.62 * b - 0.32 * c);
}

function kickAnim(inp: PoseInput, P: Float64Array): void {
  if (inp.posture !== POSTURE_STAND) return;
  const t = inp.upperT;
  const a = ease(t / 0.16), b = ease((t - 0.16) / 0.12), c = ease((t - 0.30) / 0.26);
  const k = a * (1 - c);
  let flex = lerp(P[P_LEG_R + LG_FLEX], 1.15, a);
  flex = lerp(flex, 1.40, b);
  let knee = lerp(P[P_LEG_R + LG_KNEE], 1.7, a);
  knee = lerp(knee, 0.12, b);
  P[P_LEG_R + LG_FLEX] = lerp(flex, P[P_LEG_R + LG_FLEX], c);
  P[P_LEG_R + LG_KNEE] = lerp(knee, P[P_LEG_R + LG_KNEE], c);
  P[P_LEG_R + LG_ANKLE] = lerp(P[P_LEG_R + LG_ANKLE], -0.3, k);
  P[P_LEG_R + LG_ABD] = lerp(P[P_LEG_R + LG_ABD], 0.02, k);
  P[P_PX] += 0.03 * k;
  torso(P, -0.18 * k, 0.1 * k);
  armIK(P, R, 0.22, 0.10, 0.20, 0.8, -0.6, -0.2);
  armIK(P, L, 0.22, 0.10, 0.20, 0.8, -0.6, -0.2);
}

function pickupAnim(inp: PoseInput, P: Float64Array): void {
  const t = inp.upperT;
  const k = ease(t / 0.32) * (1 - ease((t - 0.42) / 0.38));
  torso(P, 1.15 * k, 0);
  head(P, -0.3 * k, 0, 0);
  armIK(P, R, REST_X, REST_Y, REST_Z, 0.6, -0.3, -0.7);
  toward(P, R, 0.08, -0.26, 0.50, k);
}

function hammerAnim(inp: PoseInput, P: Float64Array): void {
  const cyc = inp.upperT * 1.5 - Math.floor(inp.upperT * 1.5);
  const k = ease(cyc / 0.55) * (1 - ease((cyc - 0.55) / 0.2));
  armIK(P, R, lerp(0.10, 0.26, k), lerp(-0.03, 0.42, k), lerp(0.47, 0.06, k), 0.7, -0.6, -0.4);
  handThumb(P, R, lerp(-0.05, 0.1, k), lerp(0.1, 0.8, k), lerp(1, -0.6, k));
  torso(P, 0.20 - 0.15 * k, -0.2 * k);
}

function driveAnim(inp: PoseInput, P: Float64Array): void {
  const sg = inp.steer * 1.2;
  const r = 0.18;
  const ar = 0.95 + sg, al = 0.95 - sg;
  const cr = Math.cos(ar), cl = Math.cos(al);
  armIK(P, R, r * Math.sin(ar), -0.03 + r * cr * 0.9, 0.40 - r * cr * 0.42, 0.6, -0.8, -0.2);
  armIK(P, L, r * Math.sin(al), -0.03 + r * cl * 0.9, 0.40 - r * cl * 0.42, 0.6, -0.8, -0.2);
}

function coughAnim(inp: PoseInput, P: Float64Array): void {
  const s = fsin(TAU * 2.3 * inp.t + inp.seed * 50);
  const jerk = s > 0 ? s * s * s : 0;
  torso(P, 0.62 + 0.16 * jerk, 0.08 * fsin(inp.t * 1.7 + inp.seed * 9));
  head(P, 0.30 + 0.1 * jerk, 0, 0);
  if (inp.hold !== HOLD_SHIELD || P[R + A_MODE] !== ARM_IK) {
    armIK(P, R, -0.02, 0.33, 0.15, 0.7, -0.7, 0.1);
  }
  if (inp.hold !== HOLD_SHIELD) armIK(P, L, 0.14, -0.34, 0.22, 0.8, -0.3, -0.5);
}

/** Abaissement / recul du bassin demandés par l'animation (à appeler AVANT basePose). */
export function upperPrepare(inp: PoseInput): void {
  let dy = 0, dz = 0;
  if (inp.posture === POSTURE_STAND || inp.posture === POSTURE_CROUCH) {
    const t = inp.upperT;
    switch (inp.upper) {
      case U_BLOCK: dy = -0.05; break;
      case U_DRAG: dy = -0.10; dz = -0.04; break;
      case U_PICKUP: {
        const k = ease(t / 0.32) * (1 - ease((t - 0.42) / 0.38));
        dy = -0.27 * k; dz = -0.10 * k;
        break;
      }
      case U_RESTRAIN: dy = -0.12; dz = -0.03; break;
      case U_PUSH: dy = -0.04; break;
      case U_COUGH: dy = -0.05; dz = -0.05; break;
      case U_TREAT: dy = -0.22; dz = -0.06; break;
      case U_THROW: {
        const b = ease((t - 0.30) / 0.16), d = ease((t - 0.80) / 0.25);
        dy = -0.03 * b * (1 - d);
        break;
      }
      case U_STAGGER: dy = -0.04; break;
      case U_NONE: if (inp.hold === HOLD_SHIELD && inp.alt) dy = -0.05; break;
      default: break;
    }
    if (inp.posture === POSTURE_CROUCH) { dy *= 0.3; dz *= 0.3; }
  }
  inp.pelvisDY = dy;
  inp.pelvisDZ = dz;
}

/** Applique l'animation du haut du corps sur une pose de base. */
export function upperPose(inp: PoseInput, P: Float64Array): void {
  const t = inp.upperT, g = inp.t, seed = inp.seed;
  switch (inp.upper) {
    case U_NONE: holdPose(inp, P); break;
    case U_THROW: throwAnim(inp, P); break;
    case U_STRIKE:
      if (inp.hold === HOLD_SHIELD) shieldCarry(inp, P, 0.5);
      strikeAnim(inp, P);
      break;
    case U_BLOCK:
      shieldCarry(inp, P, inp.alt ? 1 : 0.8);
      batonReady(P);
      torso(P, 0.10, 0);
      head(P, 0.08, 0, 0);
      break;
    case U_SHIELD_CARRY: shieldCarry(inp, P, inp.alt ? 1 : 0); break;
    case U_AIM_LONG: aimLong(inp, P); break;
    case U_AIM_PISTOL: aimPistol(inp, P); break;
    case U_SPRAY:
      armIK(P, R, 0.15, 0.25, 0.47, 0.6, -0.8, 0);
      handAbs(P, R, -0.05, 0.02, 1, 0, 1, 0);
      armPitch(P, R, inp.aimPitch, SH_Y, 0);
      if (inp.hold !== HOLD_SHIELD) armIK(P, L, 0.12, 0.02, 0.26, 0.6, -0.8, 0);
      break;
    case U_MEGAPHONE:
      armIK(P, R, 0.07, 0.295, 0.19, 0.9, -0.4, -0.1);
      handAbs(P, R, -0.08, 0.10, 1, 0, 1, 0);
      head(P, -0.05, 0, 0);
      break;
    case U_RADIO:
      armIK(P, R, -0.01, 0.275, 0.165, 0.8, -0.6, 0);
      handThumb(P, R, 0.1, 0.95, 0.2);
      head(P, 0.10, -0.12, 0);
      break;
    case U_HANDS_UP:
      armIK(P, R, 0.31, 0.47, 0.07, 0.9, -0.5, -0.1);
      handAbs(P, R, 0, 1, 0.05, -1, 0, 0);
      armIK(P, L, 0.31, 0.47, 0.07, 0.9, -0.5, -0.1);
      handAbs(P, L, 0, 1, 0.05, -1, 0, 0);
      break;
    case U_FIST: {
      const beat = 0.5 - 0.5 * fsin(TAU * (g * 1.9 + seed * 0.12) + 1.5708);
      armIK(P, R, 0.21, 0.46 + 0.20 * beat, 0.06 + 0.04 * beat, 0.8, -0.5, -0.2);
      handAbs(P, R, 0, 1, 0, -1, 0, 0.2);
      torso(P, -0.03 * beat, 0);
      break;
    }
    case U_CLAP: {
      const x = 0.035 + 0.07 * (0.5 + 0.5 * fsin(TAU * 2.6 * g + seed * 30));
      armIK(P, R, x, 0.13, 0.30, 0.7, -0.7, 0);
      handAbs(P, R, -0.15, 0.6, 0.78, 0, 0.8, -0.6);
      armIK(P, L, x, 0.13, 0.30, 0.7, -0.7, 0);
      handAbs(P, L, -0.15, 0.6, 0.78, 0, 0.8, -0.6);
      break;
    }
    case U_CARRY_SIGN: poleCarry(inp, P, inp.alt ? 0.2 : 0); break;
    case U_UMBRELLA:
      armIK(P, R, 0.10, 0.0, 0.23, 0.7, -0.7, -0.1);
      handAbs(P, R, 0, 0.05, 1, -0.05, 1, -0.05);
      break;
    case U_CARRY_BANNER: bannerCarry(P); break;
    case U_FILM:
      if (inp.hold === HOLD_CAMERA_TV) filmShoulder(inp, P); else filmPhone(inp, P);
      break;
    case U_PHOTO:
      armIK(P, R, 0.085, 0.385, 0.20, 0.7, -0.7, -0.1);
      handAbs(P, R, 0, 1, 0.1, 0, 0.1, -1);
      armIK(P, L, -0.02, 0.36, 0.26, 0.6, -0.8, 0);
      armPitch(P, R, inp.aimPitch * 0.8, SH_Y + 0.2, 0);
      armPitch(P, L, inp.aimPitch * 0.8, SH_Y + 0.2, 0);
      head(P, 0.04, 0, 0);
      break;
    case U_TREAT: {
      const m = 0.03 * fsin(TAU * 1.7 * g + seed * 20);
      armIK(P, R, 0.10, -0.28 + m, 0.44, 0.7, -0.3, -0.6);
      armIK(P, L, 0.10, -0.28 - m, 0.44, 0.7, -0.3, -0.6);
      torso(P, 0.6, 0);
      head(P, 0.2, 0, 0);
      break;
    }
    case U_CARRY_PERSON:
      armIK(P, R, 0.17, 0.20, 0.26, 0.9, -0.4, 0.1);
      armIK(P, L, 0.23, 0.10, 0.22, 0.8, -0.6, 0);
      torso(P, 0.14, 0);
      break;
    case U_DRAG:
      armIK(P, R, 0.13, -0.36, 0.36, 0.8, -0.2, -0.6);
      armIK(P, L, 0.13, -0.36, 0.36, 0.8, -0.2, -0.6);
      torso(P, 0.6, 0);
      head(P, -0.2, 0, 0);
      break;
    case U_PICKUP: pickupAnim(inp, P); break;
    case U_PUSH:
      armIK(P, R, 0.15, 0.13, 0.49, 0.7, -0.7, 0);
      handAbs(P, R, 0, 0.7, 0.7, -1, 0, 0);
      armIK(P, L, 0.15, 0.13, 0.49, 0.7, -0.7, 0);
      handAbs(P, L, 0, 0.7, 0.7, -1, 0, 0);
      torso(P, 0.32, 0);
      head(P, -0.15, 0, 0);
      break;
    case U_COVER_FACE:
      armIK(P, R, -0.03, 0.47, 0.17, 0.6, -0.8, 0.1);
      armIK(P, L, -0.03, 0.40, 0.19, 0.6, -0.8, 0.1);
      head(P, 0.3, 0, 0);
      torso(P, 0.15, 0);
      break;
    case U_CUFFED:
      armIK(P, R, 0.035, -0.26, -0.155, 0.9, 0.2, -0.4);
      armIK(P, L, 0.035, -0.26, -0.155, 0.9, 0.2, -0.4);
      torso(P, 0.08, 0);
      head(P, 0.15, 0, 0);
      break;
    case U_POINT:
      armIK(P, R, 0.18, 0.27, 0.51, 0.6, -0.8, 0);
      handAbs(P, R, 0, 0, 1, 0, 1, 0);
      armPitch(P, R, inp.aimPitch, SH_Y, 0);
      break;
    case U_WAVE: {
      const sw = fsin(TAU * 1.5 * g + seed * 20);
      armIK(P, R, 0.30 + 0.13 * sw, 0.60, 0.06, 0.9, -0.4, -0.1);
      handAbs(P, R, 0.25 * sw, 1, 0, -1, 0, 0);
      break;
    }
    case U_DRIVE: driveAnim(inp, P); break;
    case U_RIDE:
      armIK(P, R, 0.30, -0.06, 0.40 - 0.05 * inp.steer, 0.8, -0.5, -0.3);
      handAbs(P, R, -0.1, -0.1, 1, -1, 0, 0);
      armIK(P, L, 0.30, -0.06, 0.40 + 0.05 * inp.steer, 0.8, -0.5, -0.3);
      handAbs(P, L, -0.1, -0.1, 1, -1, 0, 0);
      break;
    case U_KICK: kickAnim(inp, P); break;
    case U_HAMMER: hammerAnim(inp, P); break;
    case U_SPRAYPAINT:
      armIK(P, R, 0.16 + 0.16 * fsin(TAU * 0.55 * t), 0.26 + 0.10 * fsin(TAU * 0.9 * t + 1), 0.49, 0.6, -0.8, 0);
      handAbs(P, R, 0, 0.05, 1, 0, 1, 0);
      break;
    case U_CARRY_LOOT: lootCarry(P); break;
    case U_EXTINGUISH:
      armIK(P, R, 0.20, -0.12, 0.25, 0.6, -0.4, -0.7);
      handAbs(P, R, 0, -0.97, 0.2, 0, 0.2, 1);
      armIK(P, L, 0.04 + 0.12 * fsin(TAU * 0.7 * g), 0.0, 0.46, 0.6, -0.8, 0);
      torso(P, 0.1, 0);
      break;
    case U_REMOTE:
      armIK(P, R, 0.10, -0.07, 0.31, 0.8, -0.6, -0.2);
      handAbs(P, R, -0.5, 0.1, 0.85, -0.2, 0.9, -0.3);
      armIK(P, L, 0.10, -0.07, 0.31, 0.8, -0.6, -0.2);
      handAbs(P, L, -0.5, 0.1, 0.85, -0.2, 0.9, -0.3);
      head(P, 0.3 * (0.5 + 0.5 * fsin(g * 0.6 + seed * 9)), 0, 0);
      break;
    case U_COUGH: coughAnim(inp, P); break;
    case U_RESTRAIN:
      armIK(P, R, 0.11, -0.14, 0.46, 0.8, -0.4, -0.5);
      handAbs(P, R, 0, -0.5, 0.85, -1, 0, 0.2);
      armIK(P, L, 0.11, -0.14, 0.46, 0.8, -0.4, -0.5);
      handAbs(P, L, 0, -0.5, 0.85, -1, 0, 0.2);
      torso(P, 0.56, 0);
      head(P, 0.1, 0, 0);
      break;
    case U_STAGGER: {
      const sw = fsin(TAU * 0.7 * g + seed * 20);
      armIK(P, R, 0.10, 0.44, 0.10, 1, -0.3, 0);
      armIK(P, L, 0.10, 0.44, 0.10, 1, -0.3, 0);
      torso(P, 0.25 + 0.08 * sw, 0.1 * sw);
      P[P_SPINE + 2] += 0.12 * sw;
      head(P, 0.3, 0, 0);
      break;
    }
    case U_BURN: {
      const a1 = fsin(g * 7.1 + seed * 30), a2 = fsin(g * 9.3 + 1 + seed * 17), a3 = fsin(g * 8.2 + 2);
      armIK(P, R, 0.25 + 0.12 * a1, 0.22 + 0.26 * a2, 0.20 + 0.15 * a3, 0.8, -0.5, -0.2);
      armIK(P, L, 0.25 - 0.12 * a2, 0.22 + 0.26 * a3, 0.20 + 0.15 * a1, 0.8, -0.5, -0.2);
      torso(P, 0.15 + 0.1 * a3, 0.4 * fsin(g * 5.0 + seed * 9));
      break;
    }
    default: holdPose(inp, P); break;
  }
}

/** Animations pour lesquelles le buste s'oriente franchement vers la visée. */
function aimsWithTorso(u: number): boolean {
  return u === U_AIM_LONG || u === U_AIM_PISTOL || u === U_SPRAY || u === U_POINT || u === U_THROW
    || u === U_FILM || u === U_PHOTO || u === U_MEGAPHONE || u === U_EXTINGUISH || u === U_SPRAYPAINT
    || u === U_BLOCK || u === U_STRIKE;
}

/** La tête et le buste suivent la visée (lacet et site relatifs au corps). */
export function applyLook(inp: PoseInput, P: Float64Array): void {
  let yaw = inp.aimYaw, pitch = inp.aimPitch;
  yaw = yaw > 1.4 ? 1.4 : yaw < -1.4 ? -1.4 : yaw;
  pitch = pitch > 0.9 ? 0.9 : pitch < -0.9 ? -0.9 : pitch;
  if (inp.posture === POSTURE_SEATED) yaw *= 0.7;
  let chestYaw: number;
  if (aimsWithTorso(inp.upper) || (inp.alt && inp.upper === U_NONE)) {
    chestYaw = yaw > 0.8 ? 0.8 : yaw < -0.8 ? -0.8 : yaw;
    if (pitch > 0) P[P_SPINE] -= 0.18 * pitch;
  } else {
    chestYaw = yaw * 0.22;
  }
  P[P_SPINE + 1] += chestYaw * 0.45;
  P[P_CHEST + 1] += chestYaw * 0.55;
  let hy = yaw - chestYaw;
  hy = hy > 1.1 ? 1.1 : hy < -1.1 ? -1.1 : hy;
  P[P_NECK + 1] += hy * 0.4;
  P[P_HEAD + 1] += hy * 0.6;
  P[P_NECK] -= pitch * 0.35;
  P[P_HEAD] -= pitch * 0.5;
}


