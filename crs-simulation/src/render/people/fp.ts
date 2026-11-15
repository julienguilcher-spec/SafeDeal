/* Vue à la première personne : bras et objet tenu dans le champ de vision. Les mêmes animations du haut
 * du corps qu'en vue extérieure sont résolues autour d'un thorax virtuel solidaire de la caméra ; les os
 * sont écrits en ESPACE CAMÉRA (le shader n'applique alors pas la matrice de vue : aucun décalage d'une
 * image entre la caméra et les bras). Logique pure. */

import { BONE_CHEST, BONE_COUNT, BONE_STRIDE, CHEST_EYE_Y, CHEST_EYE_Z, LOCAL_SIZE } from './skeleton';
import { TAU, ease, fsin } from './mathx';
import { computePose, createPoseParams } from './pose';
import { blendLocal, composePose, solveLocal } from './solve';
import {
  HOLD_LONG, POSTURE_STAND, P_CHEST, P_PX, P_PY, P_PZ, P_RX, P_RY, P_RZ, P_SPINE, U_AIM_LONG, U_AIM_PISTOL,
  U_NONE, U_STRIKE, U_THROW, createPoseInput, type PoseInput,
} from './poseparams';
import type { AnimSample } from './animator';

export class FpRig {
  private readonly inp: PoseInput = createPoseInput();
  private readonly P = createPoseParams();
  private readonly cur = new Float64Array(LOCAL_SIZE);
  private readonly last = new Float64Array(LOCAL_SIZE);
  private readonly prev = new Float64Array(LOCAL_SIZE);
  private readonly tmp = new Float64Array(BONE_COUNT * BONE_STRIDE);
  private blendT = 1;
  private blendDur = 0;
  private lastUpper = -1;
  private lastHold = -1;
  private lastUpperT = 0;
  private lastT = -1;
  private aimK = 0;
  private fresh = true;

  reset(): void {
    this.fresh = true;
  }

  /**
   * Calcule les os des bras dans l'espace de la caméra (x droite, y haut, -z devant) et les écrit dans
   * `out` à partir de `oo` (BONE_COUNT × 8). `phase` et `speed` : cycle de marche et vitesse du joueur.
   */
  update(sm: AnimSample, now: number, phase: number, speed: number, out: Float32Array, oo: number): void {
    const inp = this.inp;
    let dt = now - this.lastT;
    if (!(dt >= 0) || dt > 0.5) this.fresh = true;
    if (dt > 0.1) dt = 0.1;
    this.lastT = now;
    inp.t = now;
    inp.seed = 0.37;
    inp.variant = 0;
    inp.phase = phase;
    inp.speed = 0;
    inp.moveFwd = 1;
    inp.moveSide = 0;
    inp.turnRate = 0;
    inp.posture = POSTURE_STAND;
    inp.upper = sm.upper;
    inp.upperT = sm.upperT;
    inp.aimYaw = 0;
    inp.aimPitch = 0;
    inp.alt = sm.alt;
    inp.hold = sm.hold;
    inp.gas = sm.gas;
    inp.stun = sm.stun;
    inp.burning = sm.burning;
    inp.injury = 0;
    inp.cuffed = sm.cuffed;
    inp.scale = sm.scale;
    inp.steer = sm.steer;
    inp.fp = true;
    const P = this.P;
    computePose(inp, P);
    // le buste suit la caméra : on ne garde qu'une fraction des mouvements du tronc
    const keep = sm.upper === U_THROW || sm.upper === U_STRIKE ? 0.45 : 0.25;
    P[P_PX] = 0; P[P_PY] = 0; P[P_PZ] = 0;
    P[P_RX] = 0; P[P_RY] = 0; P[P_RZ] = 0;
    for (let i = 0; i < 3; i++) { P[P_SPINE + i] *= keep; P[P_CHEST + i] *= keep; }
    solveLocal(P, sm.build, this.cur, 0);

    if (this.fresh) {
      this.last.set(this.cur);
      this.blendT = 1;
      this.blendDur = 0;
      this.aimK = sm.upper === U_AIM_LONG ? 1 : 0;
    } else {
      if (sm.upper !== this.lastUpper || sm.hold !== this.lastHold || sm.upperT < this.lastUpperT - 0.05) {
        this.prev.set(this.last);
        this.blendT = 0;
        this.blendDur = sm.upper === U_THROW || sm.upper === U_STRIKE ? 0.08 : 0.16;
      }
      if (this.blendT < this.blendDur) {
        this.blendT += dt;
        blendLocal(this.prev, 0, this.cur, 0, ease(this.blendT / this.blendDur), this.last, 0);
      } else {
        this.last.set(this.cur);
      }
    }
    this.fresh = false;
    this.lastUpper = sm.upper;
    this.lastHold = sm.hold;
    this.lastUpperT = sm.upperT;

    // visée épaulée : l'arme est ramenée vers l'axe du regard
    const long = sm.upper === U_AIM_LONG || (sm.upper === U_NONE && sm.hold === HOLD_LONG && sm.alt);
    const aimTarget = long ? 1 : sm.upper === U_AIM_PISTOL ? 0.3 : 0;
    this.aimK += (aimTarget - this.aimK) * (1 - Math.exp(-dt / 0.07));

    const s = sm.scale;
    const tmp = this.tmp;
    composePose(this.last, 0, s, sm.build, Math.PI, 0, 0, tmp, 0);
    // position voulue du thorax dans l'espace caméra : sous l'œil et légèrement en retrait
    const w = speed > 2.2 ? 1.5 : speed / 1.5;
    const bobX = 0.006 * w * fsin(TAU * phase);
    const bobY = 0.011 * w * fsin(2 * TAU * phase);
    const cx = bobX - 0.085 * this.aimK;
    const cy = -CHEST_EYE_Y * s - 0.045 + bobY + 0.085 * this.aimK;
    const cz = CHEST_EYE_Z * s + 0.075 - 0.03 * this.aimK;
    const co = BONE_CHEST * BONE_STRIDE;
    const dx = cx - tmp[co + 4], dy = cy - tmp[co + 5], dz = cz - tmp[co + 6];
    for (let b = 0; b < BONE_COUNT; b++) {
      const o = b * BONE_STRIDE;
      out[oo + o] = tmp[o];
      out[oo + o + 1] = tmp[o + 1];
      out[oo + o + 2] = tmp[o + 2];
      out[oo + o + 3] = tmp[o + 3];
      out[oo + o + 4] = tmp[o + 4] + dx;
      out[oo + o + 5] = tmp[o + 5] + dy;
      out[oo + o + 6] = tmp[o + 6] + dz;
      out[oo + o + 7] = 0;
    }
  }
}
