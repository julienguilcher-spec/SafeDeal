/* =====================================================================================
 * Conduite des véhicules terrestres : modèle « bicyclette » dynamique à adhérence latérale.
 *
 * État : position, cap, vitesse monde (vx, vz), vitesse de lacet. À chaque sous-pas (≤ 1/120 s,
 * autant qu'il en faut pour couvrir le pas demandé : le résultat ne dépend pas de la cadence) :
 *   - braquage réel limité en vitesse de rotation et réduit avec la vitesse (un volant à fond à
 *     90 km/h ne braque pas les roues de 35°) ;
 *   - force motrice = min(accélération du type, puissance / vitesse), boîte automatique (rapport et
 *     régime pour le son et le tableau de bord), limitée par l'adhérence de l'essieu moteur ;
 *   - freins répartis selon la charge de chaque essieu, bornés par l'adhérence ; frein moteur ;
 *     marche arrière ;
 *   - pneus : force latérale proportionnelle à la dérive puis saturée à μ·charge (cercle d'adhérence
 *     partagé avec le freinage et la traction) → sous-virage quand on arrive trop vite ;
 *   - frein à main : roues arrière bloquées, elles glissent au lieu de guider → survirage ;
 *   - transfert de charge avant / arrière selon l'accélération ; pente du terrain (heightAt) ;
 *   - adhérence selon la nature du sol (surfaceAt) et l'humidité (env.state.wetness).
 * Sorties : speed, yawRate, steerAngle, braking, rpm, gear, pitch, roll, y, vy.
 * ===================================================================================== */

import type { Vehicle, VehicleDef } from '@/core/contracts';
import { clamp } from '@/core/math';
import { GRAVITY } from './api';
import { OCCUPANT_MASS } from './runtime';
import type { VehicleKernel, VehicleRt } from './runtime';
import { surfaceGrip, surfaceRolling } from './specs';

/** Sous-pas maximal de l'intégration (s). */
export const SUB_DT = 1 / 120;
const MAX_SUBSTEPS = 24;
/** Vitesse plancher du calcul des dérives (m/s) : en dessous, le pneu se comporte en amortisseur visqueux. */
const U_MIN = 3;
/** Vitesse de rotation du braquage (rad/s). */
const STEER_RATE = 2.2;
/** Frottement de glissement rapporté à l'adhérence (roues bloquées, pneus qui ont décroché). */
const SLIDE = 0.8;
/** En dessous de cette vitesse (au carré), un véhicule endormi le reste. */
const SLEEP_SPEED2 = 0.0009;

/** Ce que la conduite demande au sous-système des collisions. */
export interface WorldCollider {
  /** Résout l'emprise du véhicule contre le décor ; true s'il y a eu contact. */
  world(rt: VehicleRt): boolean;
}

/** Braquage maximal utile (rad) à une vitesse donnée. */
export function steerLimit(def: VehicleDef, steerSpeed: number, speed: number): number {
  const k = speed / steerSpeed;
  return def.maxSteer / (1 + k * k);
}

const gearCache = new Map<VehicleDef, number[]>();

/** Vitesse atteinte au régime maximal dans chaque rapport (index 0 = 1re). */
export function gearTops(def: VehicleDef, gears: number): number[] {
  let tops = gearCache.get(def);
  if (tops) return tops;
  tops = [];
  const top = def.maxSpeed * 1.15;
  if (gears <= 1) {
    tops.push(top);
  } else {
    const first = Math.max(top * 0.14, 3.5);
    for (let g = 0; g < gears; g++) tops.push(first * Math.pow(top / first, g / (gears - 1)));
  }
  gearCache.set(def, tops);
  return tops;
}

/** Saturation d'un pneu : linéaire jusqu'au décrochage, puis légère perte (glissement). */
function saturate(x: number): number {
  const a = x < 0 ? -x : x;
  if (a <= 1) return x;
  const loss = 1 - 0.18 * (a - 1 > 3 ? 1 : (a - 1) / 3);
  return x < 0 ? -loss : loss;
}

export class GroundPhysics {
  constructor(private readonly k: VehicleKernel, private readonly collider: WorldCollider) {}

  /** Avance un véhicule terrestre de dt secondes. */
  step(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    const def = v.def;
    const spec = rt.spec;
    const cmd = v.cmd;
    // conduit : un conducteur est assis, le pilote automatique tient le volant, ou un autre module
    // (trafic) pilote le véhicule par cmd et l'a signalé en posant Vehicle.brain
    const controlled = rt.driverId !== 0 || rt.apActive || v.brain != null;
    const operable = v.engineOn && (v.state === 'ok' || v.state === 'damaged') && !rt.flipped;

    let thr = controlled && operable ? clamp(cmd.throttle, -1, 1) : 0;
    let steerCmd = controlled ? clamp(cmd.steer, -1, 1) : 0;
    let brake = controlled ? clamp(cmd.brake, 0, 1) : 1;
    let handbrake = controlled ? cmd.handbrake : true;
    if (thr !== thr) thr = 0; // NaN
    if (steerCmd !== steerCmd) steerCmd = 0;
    if (brake !== brake) brake = 0;
    if (rt.flipped || v.state === 'wrecked' || v.state === 'burnt') {
      // épave : roues bloquées, plus de direction
      brake = 1;
      handbrake = true;
      steerCmd = 0;
    }

    const relief = rt.pushRelief;
    rt.pushRelief = -1;

    // ── sommeil : à l'arrêt, sans commande, rien à calculer ──
    const sp2 = v.vx * v.vx + v.vz * v.vz;
    if (!rt.awake) {
      const steerRest = controlled ? steerCmd * def.maxSteer : 0;
      if (thr === 0 && rt.drag === 0 && sp2 < SLEEP_SPEED2 && rt.groundKnown && v.steerAngle === steerRest) {
        rt.dyn.asleep = true;
        this.idleOutputs(rt, controlled, operable, dt);
        return;
      }
      rt.awake = true;
    }
    rt.dyn.asleep = false;

    // ── sol : relief, nature, humidité ──
    const ctx = this.k.ctx;
    const world = ctx.world;
    let sn = Math.sin(v.heading);
    let cs = Math.cos(v.heading);
    const moving = sp2 > 1e-4 || !rt.groundKnown;
    if (moving) {
      const hl = def.wheelbase * 0.5;
      const hw = rt.halfW * 0.85;
      const hF = world.heightAt(v.x + sn * hl, v.z + cs * hl);
      const hR = world.heightAt(v.x - sn * hl, v.z - cs * hl);
      const hLeft = world.heightAt(v.x + cs * hw, v.z - sn * hw);
      const hRight = world.heightAt(v.x - cs * hw, v.z + sn * hw);
      rt.groundPitch = Math.atan2(hF - hR, def.wheelbase);
      rt.groundRoll = Math.atan2(hLeft - hRight, hw * 2);
      const y = (hF + hR) * 0.5;
      v.vy = rt.groundKnown && dt > 0 ? (y - v.y) / dt : 0;
      v.y = y;
      rt.groundKnown = true;
      const surface = world.surfaceAt(v.x, v.z);
      rt.mu = surfaceGrip(surface, ctx.env.state.wetness) * spec.handling.grip;
      rt.rolling = surfaceRolling(surface);
      rt.dyn.grip = rt.mu;
    } else {
      v.vy = 0;
    }

    // ── constantes du pas ──
    const m = rt.mass;
    // accélération et freinage du type s'entendent conducteur à bord : chaque passager en plus les émousse
    const refMass = def.mass + OCCUPANT_MASS;
    const L = def.wheelbase;
    const hd = spec.handling;
    const b = hd.frontWeight * L; // centre de gravité → essieu arrière
    const a = L - b; // centre de gravité → essieu avant
    const Iz = m * a * b * 1.05;
    // poussé par un engin à lame : l'adhérence qui le retient est plafonnée à ce que la lame vainc
    const mu = relief >= 0 ? Math.min(rt.mu, relief / (m * GRAVITY)) : rt.mu;
    const muRear = relief >= 0 ? mu : mu * hd.rearBias;
    const eng = spec.engine;
    const powerScale = v.state === 'damaged' ? (v.health < 20 ? 0.4 : 0.7) : 1;
    const P = eng.power * powerScale;
    const aMaxLow = def.accel * powerScale;
    const aTop = Math.min(def.accel, eng.power / def.maxSpeed);
    const aero = Math.max(2e-5, (aTop - 0.015 * GRAVITY) / (def.maxSpeed * def.maxSpeed)) * 0.85;
    const slope = -GRAVITY * Math.sin(rt.groundPitch);
    const rollRes = rt.rolling * GRAVITY;
    const stiff = hd.stiffness;
    const hOverL = hd.cgHeight / L;
    const shiftScale = rt.shiftT > 0 ? 0.45 : 1;
    const extraDrag = rt.drag / m;
    rt.drag = 0;

    let n = Math.ceil(dt / SUB_DT - 1e-9);
    if (n < 1) n = 1;
    if (n > MAX_SUBSTEPS) n = MAX_SUBSTEPS;
    const h = dt / n;
    // collisions contre le décor : au moins en fin de pas, et dès que l'emprise a avancé d'un demi-rayon
    const checkDist = rt.halfW * 0.5;
    let sinceCheck = 0;

    let delta = -v.steerAngle; // braquage, positif vers la gauche
    let brakingLight = false;
    let skid = 0;
    let axOut = 0;
    let ayOut = 0;
    let wOut = 0;

    for (let i = 0; i < n; i++) {
      let u = v.vx * sn + v.vz * cs; // vitesse longitudinale
      let w = v.vx * cs - v.vz * sn; // vitesse latérale (vers la gauche)
      let r = v.yawRate;
      const au = u < 0 ? -u : u;

      // braquage
      const dMax = steerLimit(def, hd.steerSpeed, au);
      const dTarget = -steerCmd * dMax;
      const dStep = STEER_RATE * h;
      if (dTarget > delta + dStep) delta += dStep;
      else if (dTarget < delta - dStep) delta -= dStep;
      else delta = dTarget;
      const cd = Math.cos(delta);
      const sd = Math.sin(delta);

      // charges par essieu (transfert selon l'accélération longitudinale filtrée)
      const transfer = rt.axF * hOverL;
      let Nf = m * (GRAVITY * (b / L) - transfer);
      let Nr = m * (GRAVITY * (a / L) + transfer);
      const nMin = m * GRAVITY * 0.06;
      if (Nf < nMin) Nf = nMin;
      if (Nr < nMin) Nr = nMin;

      // commande longitudinale : accélérateur, marche arrière, frein
      let drive = 0;
      let brk = brake;
      if (thr > 0) {
        if (u < -0.5) brk = brk > thr ? brk : thr;
        else if (u < def.maxSpeed) {
          let acc = P / (au > 0.5 ? au : 0.5);
          if (acc > aMaxLow) acc = aMaxLow;
          const gov = (def.maxSpeed - u) / 0.6;
          drive = thr * acc * shiftScale * (gov < 1 ? gov : 1);
        }
      } else if (thr < 0) {
        if (u > 0.5) brk = brk > -thr ? brk : -thr;
        else if (u > -def.maxReverse) {
          const gov = (def.maxReverse + u) / 0.8;
          drive = thr * aMaxLow * 0.7 * (gov < 1 ? gov : 1);
        }
      }
      // traction limitée par l'adhérence de l'essieu moteur
      let Fd = drive * refMass;
      let FdF = 0;
      let FdR = 0;
      if (Fd !== 0) {
        if (eng.drive === 'av') {
          const cap = mu * Nf;
          if (Fd > cap) Fd = cap; else if (Fd < -cap) Fd = -cap;
          FdF = Fd;
        } else if (eng.drive === 'ar') {
          const cap = muRear * Nr;
          if (Fd > cap) Fd = cap; else if (Fd < -cap) Fd = -cap;
          FdR = Fd;
        } else {
          const cap = mu * Nf + muRear * Nr;
          if (Fd > cap) Fd = cap; else if (Fd < -cap) Fd = -cap;
          FdF = Fd * (Nf / (Nf + Nr));
          FdR = Fd - FdF;
        }
      }
      // freins (forces dissipatives, bornées par l'adhérence)
      // répartition électronique : chaque essieu freine à proportion de sa charge
      const Fb = brk * refMass * def.brake;
      let FbF = (Fb * Nf) / (Nf + Nr);
      let FbR = Fb - FbF;
      if (FbF > mu * Nf) FbF = mu * Nf;
      if (FbR > muRear * Nr) FbR = muRear * Nr;
      if (brk > 0.05 || handbrake) brakingLight = true;

      // pneus avant : vitesse du point de contact dans le repère de la roue braquée
      const vfy = w + a * r;
      const vlw = u * cd + vfy * sd;
      const vtw = -u * sd + vfy * cd;
      const avl = vlw < 0 ? -vlw : vlw;
      const slipF = Math.atan2(vtw, avl > U_MIN ? avl : U_MIN);
      const fxF = FdF !== 0 ? FdF : FbF;
      let capF2 = mu * Nf * mu * Nf - fxF * fxF;
      const capFmin = 0.3 * mu * Nf;
      const capF = capF2 > capFmin * capFmin ? Math.sqrt(capF2) : capFmin;
      const xF = (stiff * Nf * slipF) / capF;
      const Ff = -saturate(xF) * capF;

      // pneus arrière
      const vry = w - b * r;
      let Fr: number;
      let lockDecel = 0;
      let xR = 0;
      if (handbrake) {
        // roues bloquées : frottement de glissement opposé à la vitesse du point de contact
        const vr = Math.sqrt(u * u + vry * vry);
        const slide = SLIDE * muRear * Nr;
        if (vr > 0.4) {
          Fr = (-slide * vry) / vr;
          lockDecel = (slide * au) / vr / m;
          xR = 2;
        } else {
          Fr = (-slide * vry) / 0.4;
          lockDecel = slide / m;
        }
        FbR = 0;
      } else {
        const slipR = Math.atan2(vry, au > U_MIN ? au : U_MIN);
        const fxR = FdR !== 0 ? FdR : FbR;
        capF2 = muRear * Nr * muRear * Nr - fxR * fxR;
        const capRmin = 0.3 * muRear * Nr;
        const capR = capF2 > capRmin * capRmin ? Math.sqrt(capF2) : capRmin;
        xR = (stiff * Nr * slipR) / capR;
        Fr = -saturate(xR) * capR;
      }
      const sk = Math.max(xF < 0 ? -xF : xF, xR < 0 ? -xR : xR) - 1;
      if (sk > skid) skid = sk;

      // forces dans le repère de la caisse
      const Fx = Fd - Ff * sd;
      const Fy = Ff * cd + Fr;
      const Mz = a * Ff * cd - b * Fr;
      const ax = Fx / m + slope;
      const ay = Fy / m;

      // intégration : forces conservatives, puis dissipation qui ne peut qu'arrêter, jamais inverser
      let u2 = u + h * (ax + w * r);
      const brakeDecel = (FbF + FbR) / m + lockDecel;
      let diss = brakeDecel + rollRes + aero * u * u + extraDrag;
      if (thr === 0 && v.engineOn && au > 1.5 && !handbrake) diss += eng.engineBrake;
      const du = diss * h;
      if (u2 > du) u2 -= du;
      else if (u2 < -du) u2 += du;
      else u2 = 0;
      const w2 = w + h * (ay - u * r);
      r += (h * Mz) / Iz;

      // filtre du transfert de charge et sorties
      const axReal = (u2 - u) / h - w * r;
      rt.axF += (axReal - rt.axF) * (1 - Math.exp(-h * 8));
      axOut = axReal;
      ayOut = ay;

      // arrêt franc : plus de vitesse, et frein tenu (ou terrain plat sans commande)
      const holding = brk > 0.2 || handbrake;
      if (
        drive === 0 && u2 * u2 + w2 * w2 < 0.0025 && (r < 0 ? -r : r) < 0.03 &&
        (holding || (thr === 0 && slope * slope < 0.04))
      ) {
        wOut = 0;
        v.vx = 0;
        v.vz = 0;
        v.yawRate = 0;
        rt.axF = 0;
        continue;
      }
      w = w2;
      wOut = w2;
      u = u2;

      // cap et position
      v.heading += r * h;
      v.yawRate = r;
      sn = Math.sin(v.heading);
      cs = Math.cos(v.heading);
      v.vx = u * sn + w * cs;
      v.vz = u * cs - w * sn;
      const mx = v.vx * h;
      const mz = v.vz * h;
      v.x += mx;
      v.z += mz;
      sinceCheck += Math.sqrt(mx * mx + mz * mz);

      if (sinceCheck >= checkDist || i === n - 1) {
        if (sinceCheck > 0 && this.collider.world(rt)) {
          sn = Math.sin(v.heading);
          cs = Math.cos(v.heading);
        }
        sinceCheck = 0;
      }
    }

    // ── sorties ──
    if (v.heading > Math.PI) v.heading -= Math.PI * 2;
    else if (v.heading < -Math.PI) v.heading += Math.PI * 2;
    const uEnd = v.vx * sn + v.vz * cs;
    v.speed = uEnd;
    v.steerAngle = -delta;
    v.braking = brakingLight;
    const dyn = rt.dyn;
    dyn.lateralSpeed = wOut;
    dyn.slipAngle = uEnd * uEnd + wOut * wOut > 0.25 ? Math.atan2(wOut, uEnd < 0 ? -uEnd : uEnd) : 0;
    dyn.accelLong = axOut;
    dyn.accelLat = ayOut;
    dyn.skid = skid > 1 ? 1 : skid > 0 ? skid : 0;

    this.attitude(rt, ayOut, dt);
    this.gearbox(rt, uEnd, thr, controlled, operable, dt);

    // endormissement : immobile, sans commande, roues revenues à leur consigne
    if (v.vx === 0 && v.vz === 0 && v.yawRate === 0 && thr === 0 && v.steerAngle === (controlled ? steerCmd * def.maxSteer : 0)) {
      rt.awake = false;
    }
  }

  /** Assiette de la caisse : pente du terrain + tangage et roulis dynamiques (ou inclinaison d'un deux-roues). */
  private attitude(rt: VehicleRt, ay: number, dt: number): void {
    const v = rt.v;
    const hd = rt.spec.handling;
    const k = 1 - Math.exp(-dt * 7);
    const pitchDyn = clamp(rt.axF * hd.pitchGain, -0.08, 0.08);
    rt.bodyPitch += (pitchDyn - rt.bodyPitch) * k;
    let rollDyn: number;
    if (hd.twoWheels) {
      // la moto penche dans le virage : virage à gauche (lacet positif) → inclinaison à gauche (roulis négatif)
      // (accélération latérale fournie par les pneus : bornée par l'adhérence, même en glissade)
      rollDyn = -Math.atan(ay / GRAVITY);
      if (rollDyn > 0.75) rollDyn = 0.75;
      else if (rollDyn < -0.75) rollDyn = -0.75;
    } else {
      // la caisse verse vers l'extérieur : virage à gauche → roulis à droite (positif)
      rollDyn = clamp(ay * hd.rollGain, -0.1, 0.1);
    }
    rt.bodyRoll += (rollDyn - rt.bodyRoll) * k;
    if (!rt.flipped) {
      v.pitch = rt.groundPitch + rt.bodyPitch;
      v.roll = rt.groundRoll + rt.bodyRoll;
    }
  }

  /** Boîte automatique : rapport et régime (pour le son et le tableau de bord). */
  private gearbox(rt: VehicleRt, u: number, thr: number, controlled: boolean, operable: boolean, dt: number): void {
    const v = rt.v;
    const eng = rt.spec.engine;
    if (rt.shiftT > 0) rt.shiftT -= dt;
    if (rt.gearT > 0) rt.gearT -= dt;
    if (!v.engineOn || !operable) {
      v.gear = 0;
      rt.rpmF += (0 - rt.rpmF) * (1 - Math.exp(-dt * 4));
      v.rpm = rt.rpmF < 1 ? 0 : rt.rpmF;
      return;
    }
    const tops = gearTops(v.def, eng.gears);
    const au = u < 0 ? -u : u;
    const at = thr < 0 ? -thr : thr;
    const span = eng.redline - eng.idle;
    let target: number;
    if (!controlled) {
      v.gear = 0;
      target = eng.idle;
    } else if (u < -0.3 || (thr < 0 && u < 0.5)) {
      v.gear = -1;
      target = eng.idle + span * Math.min(1, au / (v.def.maxReverse * 1.4)) + span * 0.15 * at;
    } else {
      let g = v.gear < 1 ? 1 : v.gear;
      if (g > tops.length) g = tops.length;
      if (rt.gearT <= 0) {
        if (g < tops.length && au / tops[g - 1]! > 0.55 + 0.35 * at) {
          g++;
          rt.gearT = 0.5;
          rt.shiftT = 0.16;
        } else if (g > 1 && au / tops[g - 2]! < 0.3 + 0.25 * at) {
          g--;
          rt.gearT = 0.5;
          rt.shiftT = 0.12;
        }
      }
      v.gear = g;
      const ratio = au / tops[g - 1]!;
      // régime mécanique + glissement du convertisseur à bas régime sous charge
      target = eng.redline * ratio + span * 0.22 * at * (ratio < 1 ? 1 - ratio : 0);
      if (target < eng.idle) target = eng.idle + span * 0.12 * at;
      if (target > eng.redline) target = eng.redline;
    }
    rt.rpmF += (target - rt.rpmF) * (1 - Math.exp(-dt * 9));
    v.rpm = rt.rpmF;
  }

  /** Véhicule endormi : seules les sorties lentes continuent d'évoluer (régime, assiette). */
  private idleOutputs(rt: VehicleRt, controlled: boolean, operable: boolean, dt: number): void {
    const v = rt.v;
    v.speed = 0;
    v.vy = 0;
    v.braking = !controlled || v.cmd.brake > 0.05 || v.cmd.handbrake;
    rt.dyn.lateralSpeed = 0;
    rt.dyn.slipAngle = 0;
    rt.dyn.accelLong = 0;
    rt.dyn.accelLat = 0;
    rt.dyn.skid = 0;
    if (v.engineOn || rt.rpmF > 1) this.gearbox(rt, 0, 0, controlled, operable, dt);
    if (rt.bodyPitch !== 0 || rt.bodyRoll !== 0) {
      rt.axF = 0;
      this.attitude(rt, 0, dt);
      if (Math.abs(rt.bodyPitch) < 1e-4) rt.bodyPitch = 0;
      if (Math.abs(rt.bodyRoll) < 1e-4) rt.bodyRoll = 0;
    }
  }
}
