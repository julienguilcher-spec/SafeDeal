/* Animateur : état d'animation par emplacement (phase de marche, vitesse lissée, fondus entre poses)
 * et production de la pose finale d'une personne. Aucun accès à Three.js ni au DOM : testable sous Node. */

import type { Person } from '@/core/contracts';
import { LOCAL_SIZE, REF_HEIGHT } from './skeleton';
import { clamp01, ease, hash01, hash32, wrapPi } from './mathx';
import { strideLength } from './gait';
import { computePose, createPoseParams } from './pose';
import { blendLocal, composePose, solveLocal } from './solve';
import {
  HOLD_NONE, INJURY_CRITICAL, INJURY_DEAD, INJURY_LIGHT, INJURY_NONE, INJURY_SERIOUS,
  POSTURE_DOWN, POSTURE_PRONE, POSTURE_STAND,
  U_BLOCK, U_BURN, U_COUGH, U_COVER_FACE, U_CUFFED, U_HANDS_UP, U_KICK, U_NONE, U_STAGGER, U_STRIKE, U_THROW,
  createPoseInput, postureId, upperId, type PoseInput,
} from './poseparams';

/** Échantillon de l'état d'une personne tel que l'animateur le consomme (objet réutilisé). */
export interface AnimSample {
  x: number;
  z: number;
  heading: number;
  /** Assiette supplémentaire (véhicule). */
  pitch: number;
  roll: number;
  /** Vitesse annoncée par la simulation (sert à la première image seulement). */
  vx: number;
  vz: number;
  posture: number;
  upper: number;
  upperT: number;
  /** Visée dans le repère du monde. */
  aimYaw: number;
  aimPitch: number;
  alt: boolean;
  hold: number;
  gas: number;
  stun: number;
  burning: number;
  injury: number;
  cuffed: boolean;
  /** look.height / 1,75 et look.build. */
  scale: number;
  build: number;
  steer: number;
  /** La racine est imposée (véhicule, personne portée) : pas de marche déduite du déplacement. */
  attached: boolean;
}

export function createAnimSample(): AnimSample {
  return {
    x: 0, z: 0, heading: 0, pitch: 0, roll: 0, vx: 0, vz: 0,
    posture: POSTURE_STAND, upper: U_NONE, upperT: 0, aimYaw: 0, aimPitch: 0, alt: false,
    hold: HOLD_NONE, gas: 0, stun: 0, burning: 0, injury: INJURY_NONE, cuffed: false,
    scale: 1, build: 1, steer: 0, attached: false,
  };
}

function injuryId(level: string): number {
  switch (level) {
    case 'light': return INJURY_LIGHT;
    case 'serious': return INJURY_SERIOUS;
    case 'critical': return INJURY_CRITICAL;
    case 'dead': return INJURY_DEAD;
    default: return INJURY_NONE;
  }
}

/**
 * Remplit l'échantillon à partir d'une personne du contrat. Les états (menottes, feu, étourdissement,
 * gaz) priment sur l'animation demandée : menotté dans le dos, gestes de panique, titubement, toux pliée.
 */
export function sampleFromPerson(p: Person, hold: number, out: AnimSample): void {
  out.x = p.x;
  out.z = p.z;
  out.heading = p.heading;
  out.pitch = 0;
  out.roll = 0;
  out.vx = p.vx;
  out.vz = p.vz;
  const posture = postureId(p.posture);
  out.posture = posture;
  out.upperT = p.upperT;
  out.aimYaw = p.aimYaw;
  out.aimPitch = p.aimPitch;
  out.alt = p.alt;
  out.hold = hold;
  const gas = p.gas * (1 - 0.9 * clamp01(p.gasProtection));
  out.gas = gas;
  out.stun = p.stun;
  out.burning = p.burning;
  out.injury = injuryId(p.injury);
  const cuffed = p.custody !== 'free';
  out.cuffed = cuffed;
  const look = p.look;
  out.scale = look.height / REF_HEIGHT;
  out.build = look.build;
  out.steer = 0;
  out.attached = false;
  let u = upperId(p.upper);
  const lying = posture === POSTURE_PRONE || posture === POSTURE_DOWN;
  if (!lying) {
    if (cuffed) u = U_CUFFED;
    else if (p.burning > 0.25) u = U_BURN;
    else if (p.stun > 0.3 && u !== U_BLOCK) u = U_STAGGER;
    else if (gas > 0.5) u = U_COUGH;
  }
  out.upper = u;
}

function blendDuration(upper: number, postureChanged: boolean, lying: boolean): number {
  if (postureChanged) return lying ? 0.6 : 0.38;
  switch (upper) {
    case U_THROW: case U_STRIKE: case U_KICK: return 0.09;
    case U_BLOCK: case U_COVER_FACE: case U_HANDS_UP: return 0.14;
    default: return 0.2;
  }
}

export class PeopleAnimator {
  capacity: number;
  private phase: Float32Array;
  private lastT: Float64Array;
  private lastX: Float64Array;
  private lastZ: Float64Array;
  private velX: Float32Array;
  private velZ: Float32Array;
  private lastHeading: Float32Array;
  private turnRate: Float32Array;
  private blendT: Float32Array;
  private blendDur: Float32Array;
  private lastUpper: Int16Array;
  private lastUpperT: Float32Array;
  private lastPosture: Int8Array;
  private lastHold: Int8Array;
  private fresh: Uint8Array;
  private seed: Float32Array;
  private variant: Int32Array;
  private last: Float32Array;
  private prev: Float32Array;

  private readonly inp: PoseInput = createPoseInput();
  private readonly P = createPoseParams();
  private readonly cur = new Float64Array(LOCAL_SIZE);

  constructor(capacity: number) {
    this.capacity = capacity;
    this.phase = new Float32Array(capacity);
    this.lastT = new Float64Array(capacity);
    this.lastX = new Float64Array(capacity);
    this.lastZ = new Float64Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velZ = new Float32Array(capacity);
    this.lastHeading = new Float32Array(capacity);
    this.turnRate = new Float32Array(capacity);
    this.blendT = new Float32Array(capacity);
    this.blendDur = new Float32Array(capacity);
    this.lastUpper = new Int16Array(capacity);
    this.lastUpperT = new Float32Array(capacity);
    this.lastPosture = new Int8Array(capacity);
    this.lastHold = new Int8Array(capacity);
    this.fresh = new Uint8Array(capacity).fill(1);
    this.seed = new Float32Array(capacity);
    this.variant = new Int32Array(capacity);
    this.last = new Float32Array(capacity * LOCAL_SIZE);
    this.prev = new Float32Array(capacity * LOCAL_SIZE);
  }

  /** Agrandit les tableaux en conservant l'état. */
  grow(capacity: number): void {
    if (capacity <= this.capacity) return;
    const g32 = (a: Float32Array, k: number): Float32Array => { const b = new Float32Array(capacity * k); b.set(a); return b; };
    const g64 = (a: Float64Array): Float64Array => { const b = new Float64Array(capacity); b.set(a); return b; };
    this.phase = g32(this.phase, 1);
    this.lastT = g64(this.lastT);
    this.lastX = g64(this.lastX);
    this.lastZ = g64(this.lastZ);
    this.velX = g32(this.velX, 1);
    this.velZ = g32(this.velZ, 1);
    this.lastHeading = g32(this.lastHeading, 1);
    this.turnRate = g32(this.turnRate, 1);
    this.blendT = g32(this.blendT, 1);
    this.blendDur = g32(this.blendDur, 1);
    this.lastUpperT = g32(this.lastUpperT, 1);
    const lu = new Int16Array(capacity); lu.set(this.lastUpper); this.lastUpper = lu;
    const lp = new Int8Array(capacity); lp.set(this.lastPosture); this.lastPosture = lp;
    const lh = new Int8Array(capacity); lh.set(this.lastHold); this.lastHold = lh;
    const fr = new Uint8Array(capacity).fill(1); fr.set(this.fresh); this.fresh = fr;
    this.seed = g32(this.seed, 1);
    const va = new Int32Array(capacity); va.set(this.variant); this.variant = va;
    this.last = g32(this.last, LOCAL_SIZE);
    this.prev = g32(this.prev, LOCAL_SIZE);
    this.capacity = capacity;
  }

  /** Associe un emplacement à une nouvelle personne (aléa déterministe d'après son identifiant). */
  assign(slot: number, personId: number): void {
    this.fresh[slot] = 1;
    this.seed[slot] = hash01(personId * 7919 + 13);
    this.variant[slot] = hash32(personId * 31 + 7) & 0x7fff;
    this.phase[slot] = hash01(personId * 131 + 5);
    this.blendT[slot] = 1;
    this.blendDur[slot] = 0;
    this.turnRate[slot] = 0;
  }

  /** Force la prochaine pose à s'appliquer sans fondu (téléportation, réapparition). */
  markFresh(slot: number): void {
    this.fresh[slot] = 1;
  }

  seedOf(slot: number): number {
    return this.seed[slot];
  }

  variantOf(slot: number): number {
    return this.variant[slot];
  }

  /** Phase courante du cycle de marche (0..1). */
  phaseOf(slot: number): number {
    return this.phase[slot];
  }

  /** Vitesse horizontale lissée (m/s) estimée d'après les déplacements réels. */
  speedOf(slot: number): number {
    return Math.hypot(this.velX[slot], this.velZ[slot]);
  }

  /**
   * Met à jour l'animation de l'emplacement et écrit les os (BONE_COUNT × 8 nombres) dans `out` à partir
   * de `oo`. `now` = temps d'animation (s). Retourne false si rien n'a été écrit.
   */
  update(slot: number, sm: AnimSample, now: number, out: Float32Array, oo: number): boolean {
    const inp = this.inp;
    let dt = now - this.lastT[slot];
    let fresh = this.fresh[slot] === 1;
    if (!(dt >= 0) || dt > 0.6) fresh = true;
    if (dt > 0.1) dt = 0.1;
    const h = sm.heading;
    const sh = Math.sin(h), ch = Math.cos(h);

    let vx: number, vz: number;
    if (fresh || sm.attached) {
      vx = sm.attached ? 0 : sm.vx;
      vz = sm.attached ? 0 : sm.vz;
      this.turnRate[slot] = 0;
    } else {
      const dx = sm.x - this.lastX[slot], dz = sm.z - this.lastZ[slot];
      vx = this.velX[slot];
      vz = this.velZ[slot];
      if (dt > 1e-4) {
        const ix = dx / dt, iz = dz / dt;
        if (ix * ix + iz * iz < 196) {
          // déplacement plausible : lissage de la vitesse et avance de la phase avec la distance parcourue
          const a = 1 - Math.exp(-dt / 0.09);
          vx += (ix - vx) * a;
          vz += (iz - vz) * a;
          const sp = Math.sqrt(vx * vx + vz * vz);
          let cf = 1, cs = 0;
          if (sp > 0.05) { cf = (vx * sh + vz * ch) / sp; cs = (vx * ch - vz * sh) / sp; }
          const stride = strideLength(sp / sm.scale, cf, cs) * sm.scale;
          let ph = this.phase[slot] + Math.sqrt(dx * dx + dz * dz) / stride;
          ph -= Math.floor(ph);
          this.phase[slot] = ph;
        }
        this.turnRate[slot] = wrapPi(h - this.lastHeading[slot]) / dt;
      }
    }
    this.velX[slot] = vx;
    this.velZ[slot] = vz;
    this.lastX[slot] = sm.x;
    this.lastZ[slot] = sm.z;
    this.lastHeading[slot] = h;
    this.lastT[slot] = now;

    const speed = Math.sqrt(vx * vx + vz * vz);
    inp.t = now;
    inp.seed = this.seed[slot];
    inp.variant = this.variant[slot];
    inp.phase = this.phase[slot];
    inp.speed = speed;
    if (speed > 0.05) {
      inp.moveFwd = (vx * sh + vz * ch) / speed;
      inp.moveSide = (vx * ch - vz * sh) / speed;
    } else {
      inp.moveFwd = 1;
      inp.moveSide = 0;
    }
    inp.turnRate = this.turnRate[slot];
    inp.posture = sm.posture;
    inp.upper = sm.upper;
    inp.upperT = sm.upperT;
    inp.aimYaw = wrapPi(sm.aimYaw - h);
    inp.aimPitch = sm.aimPitch;
    inp.alt = sm.alt;
    inp.hold = sm.hold;
    inp.gas = sm.gas;
    inp.stun = sm.stun;
    inp.burning = sm.burning;
    inp.injury = sm.injury;
    inp.cuffed = sm.cuffed;
    inp.scale = sm.scale;
    inp.steer = sm.steer;
    inp.fp = false;

    computePose(inp, this.P);
    const cur = this.cur;
    solveLocal(this.P, sm.build, cur, 0);

    const lo = slot * LOCAL_SIZE;
    const last = this.last;
    if (fresh) {
      this.blendT[slot] = 1;
      this.blendDur[slot] = 0;
      for (let i = 0; i < LOCAL_SIZE; i++) last[lo + i] = cur[i];
    } else {
      const postureChanged = sm.posture !== this.lastPosture[slot];
      if (postureChanged || sm.upper !== this.lastUpper[slot] || sm.hold !== this.lastHold[slot]
        || sm.upperT < this.lastUpperT[slot] - 0.05) {
        // changement d'animation : on repart de la pose affichée, fondu vers la nouvelle
        const prev = this.prev;
        for (let i = 0; i < LOCAL_SIZE; i++) prev[lo + i] = last[lo + i];
        this.blendT[slot] = 0;
        const lying = sm.posture === POSTURE_PRONE || sm.posture === POSTURE_DOWN
          || this.lastPosture[slot] === POSTURE_PRONE || this.lastPosture[slot] === POSTURE_DOWN;
        this.blendDur[slot] = blendDuration(sm.upper, postureChanged, lying);
      }
      const bd = this.blendDur[slot];
      let bt = this.blendT[slot];
      if (bt < bd) {
        bt += dt;
        this.blendT[slot] = bt;
        const w = ease(bt / bd);
        blendLocal(this.prev, lo, cur, 0, w, last, lo);
      } else {
        for (let i = 0; i < LOCAL_SIZE; i++) last[lo + i] = cur[i];
      }
    }
    this.fresh[slot] = 0;
    this.lastUpper[slot] = sm.upper;
    this.lastUpperT[slot] = sm.upperT;
    this.lastPosture[slot] = sm.posture;
    this.lastHold[slot] = sm.hold;

    composePose(last, lo, sm.scale, sm.build, h, sm.pitch, sm.roll, out, oo);
    return true;
  }
}

