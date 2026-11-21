/* =====================================================================================
 * VISÉE ET DÉPART DES TIRS — du personnage au projectile : point de départ, vitesse selon l'objet
 * et la force de la personne, dispersion, puis résolution exacte de la visée (solveAim).
 *
 * Conventions : cap `yaw` → direction horizontale (sin yaw, cos yaw) ; site `pitch` positif vers le
 * haut. L'angle de départ réel vaut clamp(site de visée + loft, pitchMin, pitchMax) : un lancer à la
 * main part naturellement relevé, la crosse du lanceur de 56 mm impose + 30°, le viseur du LBD est
 * réglé pour 25 m. solveAim retourne le site de VISÉE à adopter (loft déjà retranché).
 * ===================================================================================== */

import type { AimSolution, ItemStack, Person, ProjectileKind, Vec3 } from '@/core/contracts';
import { clamp } from '@/core/math';
import { put, truncate } from '@/core/arrays';
import type { LaunchSpec, ProjectileSpec } from './api';
import {
  SOLVER_DT, makeAimSetup, makeFlatSim, makeShotSample, resetFlatSim, simulateFlat, solvePitchHigh, solvePitchLow,
  solveSpeed, speedForRange, stepFlight,
} from './ballistics';
import type { AimSetup, FlatSim } from './ballistics';
import { itemDef } from './defs';
import { projectileSpec } from './projectile-defs';
import { LAUNCHER_RANGES, activeStack, gasEffect } from './shared';
import type { ItemsCore } from './shared';
import { itemSpec } from './specs';

// ───────────────────────────── ce que tire l'objet en main ─────────────────────────────

/** Tir que produirait l'objet en main. */
export interface Shot {
  launch: LaunchSpec;
  kind: ProjectileKind;
  pspec: ProjectileSpec;
  /** Tiré par le lanceur de 56 mm (vitesse fixée par le dispositif de propulsion). */
  launcher: boolean;
}

export function makeShot(): Shot {
  const pspec = projectileSpec('debris');
  return { launch: itemSpec('pave')!.launch!, kind: 'debris', pspec, launcher: false };
}

function hasLauncher(p: Person): boolean {
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i]!.id === 'lanceur_cougar') return true;
  return false;
}

/**
 * Décrit le tir de la pile donnée. La grenade assourdissante-lacrymogène part du lanceur de 56 mm
 * quand la personne en porte un (tir en cloche) ; sinon elle est lancée à la main.
 */
export function shotFor(p: Person, stack: ItemStack, out: Shot): boolean {
  const def = itemDef(stack.id);
  const spec = itemSpec(stack.id);
  if (!def || !spec || !spec.launch || !def.projectile) return false;
  out.kind = def.projectile;
  out.pspec = projectileSpec(def.projectile);
  out.launcher = stack.id === 'lanceur_cougar';
  out.launch = spec.launch;
  if (stack.id === 'grenade_gm2l' && hasLauncher(p)) {
    out.launcher = true;
    out.launch = itemSpec('lanceur_cougar')!.launch!;
  }
  return true;
}

// ───────────────────────────── vitesses ─────────────────────────────

/** Hauteur de référence de la bouche du lanceur pour l'étalonnage des portées (m). */
const LAUNCHER_REF_HEIGHT = 1.5;
/**
 * Angle de départ sous lequel la portée nominale (50, 100, 200 m) est atteinte : la crosse impose
 * + 30°, le tireur relève le canon de 5° pour la distance nominale ; à l'inclinaison naturelle le tir
 * porte ≈ 5 % moins loin, et la portée maximale (≈ 40°) dépasse à peine la valeur nominale.
 */
const LAUNCHER_NOMINAL_PITCH = (35 * Math.PI) / 180;
const launcherSpeeds = new Map<string, number[]>();

/**
 * Vitesse initiale d'une munition tirée au lanceur de 56 mm avec le dispositif de propulsion d'indice
 * `mode`, étalonnée sur la portée nominale. Lever le canon au-delà de 40° raccourcit le tir
 * (trajectoire haute), jusqu'à un tiers de la portée à 80°.
 */
export function launcherSpeed(kind: ProjectileKind, mode: number): number {
  let table = launcherSpeeds.get(kind);
  if (!table) {
    const prm = projectileSpec(kind);
    table = [];
    for (let i = 0; i < LAUNCHER_RANGES.length; i++) {
      table.push(speedForRange(prm, LAUNCHER_RANGES[i]!, LAUNCHER_NOMINAL_PITCH, LAUNCHER_REF_HEIGHT));
    }
    launcherSpeeds.set(kind, table);
  }
  return table[mode < 0 ? 0 : mode > 2 ? 2 : mode]!;
}

/** Force de lancer d'une personne : carrure, endurance, blessures, posture (1 = adulte moyen reposé, debout). */
export function throwStrength(p: Person): number {
  let s = clamp(1 + (p.look.build - 1) * 0.7, 0.85, 1.18);
  s *= 0.8 + 0.2 * clamp(p.stamina / 100, 0, 1);
  if (p.injury === 'light') s *= 0.92;
  else if (p.injury === 'serious') s *= 0.72;
  else if (p.injury === 'critical') s *= 0.45;
  if (p.posture === 'crouch') s *= 0.8;
  else if (p.posture === 'kneel') s *= 0.85;
  else if (p.posture === 'sit' || p.posture === 'seated') s *= 0.6;
  return s;
}

/** Vitesse initiale pour une puissance 0..1. */
export function launchSpeed(core: ItemsCore, p: Person, shot: Shot, power: number): number {
  if (shot.launcher) return launcherSpeed(shot.kind, core.launcherIndex(p));
  const ls = shot.launch;
  if (!ls.byHand) return ls.speed;
  const k = ls.minFraction + (1 - ls.minFraction) * clamp(power, 0, 1);
  return ls.speed * throwStrength(p) * k;
}

/** Hauteur du point de départ au-dessus des pieds (m). */
export function launchHeight(p: Person, ls: LaunchSpec): number {
  let h = p.look.height * ls.heightFactor;
  if (p.posture === 'crouch') h *= 0.68;
  else if (p.posture === 'kneel') h *= 0.72;
  else if (p.posture === 'sit' || p.posture === 'seated') h *= 0.6;
  else if (p.posture === 'prone' || p.posture === 'down') h = 0.3;
  return h;
}

/** Angle de départ réel pour un site de visée donné. */
export function launchPitch(ls: LaunchSpec, aimPitch: number): number {
  return clamp(aimPitch + ls.loft, ls.pitchMin, ls.pitchMax);
}

/**
 * Facteur de dispersion d'une personne : fatigue, gaz dans les yeux, déplacement, étourdissement,
 * blessures ; l'arme épaulée et la position accroupie ou à genoux stabilisent le tir.
 */
export function spreadFactor(core: ItemsCore, p: Person, ls: LaunchSpec): number {
  let f = core.tuning.dispersion;
  if (!(f > 0)) return 0;
  if (p.isPlayer) f *= core.tuning.playerDispersion;
  const fatigue = 1 - clamp(p.stamina / 100, 0, 1);
  const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  const move = clamp(speed / (p.speedRun > 0 ? p.speedRun : 3.2), 0, 1.5);
  let k = 1 + 1.4 * fatigue + 2.2 * gasEffect(p) + 1.1 * move + 1.5 * clamp(p.stun, 0, 1);
  if (p.injury === 'light') k += 0.3;
  else if (p.injury === 'serious') k += 0.8;
  else if (p.injury === 'critical') k += 1.5;
  if (!ls.byHand) {
    if (p.alt) k *= 0.6;
    if (p.posture === 'crouch' || p.posture === 'kneel') k *= 0.85;
  }
  return f * k;
}

// ───────────────────────────── résolution de la visée ─────────────────────────────

const setup: AimSetup = makeAimSetup();
const sample = makeShotSample();
const shot: Shot = makeShot();
const flat: FlatSim = makeFlatSim();
const RAD = Math.PI / 180;

function prepare(core: ItemsCore, p: Person, s: Shot, tx: number, ty: number, tz: number): void {
  const yaw0 = Math.atan2(tx - p.x, tz - p.z);
  const env = core.ctx.env.state;
  setup.drag = s.pspec.drag;
  setup.windX = env.windX;
  setup.windZ = env.windZ;
  setup.sx = p.x + Math.sin(yaw0) * s.launch.forward;
  setup.sz = p.z + Math.cos(yaw0) * s.launch.forward;
  setup.sy = p.y + launchHeight(p, s.launch);
  setup.baseVx = p.vx;
  setup.baseVz = p.vz;
  const dx = tx - setup.sx;
  const dz = tz - setup.sz;
  const d = Math.sqrt(dx * dx + dz * dz);
  setup.dist = d;
  if (d > 1e-6) {
    setup.ux = dx / d;
    setup.uz = dz / d;
  } else {
    setup.ux = Math.sin(yaw0);
    setup.uz = Math.cos(yaw0);
  }
  setup.ty = ty;
  setup.yaw = Math.atan2(setup.ux, setup.uz);
}

/** Corrige le cap d'après l'écart latéral du dernier vol (vent, déplacement du tireur). true s'il a changé. */
function correctYaw(): boolean {
  if (setup.dist < 1 || Math.abs(sample.lateral) < 0.02) return false;
  setup.yaw -= sample.lateral / setup.dist;
  return true;
}

function solveLob(core: ItemsCore, p: Person, s: Shot, out: AimSolution): boolean {
  const ls = s.launch;
  const vMax = launchSpeed(core, p, s, 1);
  const vMin = launchSpeed(core, p, s, 0);
  let pitch = ls.preferredPitch;
  let v = vMax;
  for (let iter = 0; iter < 4; iter++) {
    pitch = ls.preferredPitch;
    v = solveSpeed(setup, pitch, vMin, vMax, sample);
    if (v === -2) {
      // trop loin pour l'angle préféré : pleine force, angle relevé jusqu'à la portée maximale
      v = vMax;
      pitch = solvePitchLow(setup, v, ls.preferredPitch, ls.pitchMax, sample);
      if (!Number.isFinite(pitch) || sample.error > 0.05) return false;
    } else if (v === -1) {
      // trop près : force minimale, angle abaissé
      v = vMin;
      pitch = solvePitchLow(setup, v, ls.pitchMin, ls.preferredPitch, sample);
      if (!Number.isFinite(pitch) || sample.error > 0.05) return false;
    }
    if (!correctYaw()) break;
  }
  const span = vMax - vMin;
  out.yaw = setup.yaw;
  out.pitch = pitch - ls.loft;
  out.power = span > 1e-9 ? clamp((v - vMin) / span, 0, 1) : 1;
  out.flightTime = sample.time;
  return true;
}

function solveDirect(core: ItemsCore, p: Person, s: Shot, out: AimSolution): boolean {
  const ls = s.launch;
  const v = launchSpeed(core, p, s, 1);
  const los = Math.atan2(setup.ty - setup.sy, setup.dist > 1e-6 ? setup.dist : 1e-6);
  const lo = Math.max(ls.pitchMin, los - 0.05);
  // au-delà de 20° au-dessus de la ligne de visée, ce n'est plus un tir tendu
  const hi = Math.min(ls.pitchMax, los + 20 * RAD);
  let pitch = lo;
  for (let iter = 0; iter < 4; iter++) {
    pitch = solvePitchLow(setup, v, lo, hi, sample);
    if (!Number.isFinite(pitch) || sample.error > 0.05) return false;
    if (!correctYaw()) break;
  }
  out.yaw = setup.yaw;
  out.pitch = pitch - ls.loft;
  out.power = 1;
  out.flightTime = sample.time;
  return true;
}

/** Marge au-delà de la portée nominale qu'un dispositif de propulsion peut encore atteindre (portée maximale ≈ + 7 %). */
const LAUNCHER_REACH = 1.12;

/** Tir en cloche du lanceur avec le dispositif d'indice `mode`. Retourne l'angle de départ, NaN si impossible. */
function clochePitch(kind: ProjectileKind, ls: LaunchSpec, mode: number): number {
  // inutile de simuler un dispositif manifestement trop court
  if (setup.dist > LAUNCHER_RANGES[mode]! * LAUNCHER_REACH && setup.ty >= setup.sy - 5) return NaN;
  const v = launcherSpeed(kind, mode);
  let pitch = NaN;
  const yaw0 = setup.yaw;
  for (let iter = 0; iter < 4; iter++) {
    pitch = solvePitchLow(setup, v, ls.pitchMin, ls.pitchMax, sample);
    if (Number.isFinite(pitch) && sample.error > 0.05) {
      // l'inclinaison minimale envoie déjà trop loin : trajectoire haute
      pitch = solvePitchHigh(setup, v, ls.pitchMin, ls.pitchMax, sample);
    }
    if (!Number.isFinite(pitch)) {
      setup.yaw = yaw0;
      return NaN;
    }
    if (!correctYaw()) break;
  }
  return pitch;
}

function solveCloche(core: ItemsCore, p: Person, s: Shot, out: AimSolution): boolean {
  const ls = s.launch;
  const current = core.launcherIndex(p);
  let mode = current;
  let pitch = NaN;
  if (p.isPlayer) {
    // le joueur choisit lui-même son dispositif de propulsion : on ne le change pas dans son dos
    pitch = clochePitch(s.kind, ls, current);
  } else {
    for (mode = 0; mode < LAUNCHER_RANGES.length; mode++) {
      pitch = clochePitch(s.kind, ls, mode);
      if (Number.isFinite(pitch)) break;
    }
  }
  if (!Number.isFinite(pitch)) return false;
  if (mode !== current) core.setLauncherIndex(p, mode);
  out.yaw = setup.yaw;
  out.pitch = pitch - ls.loft;
  out.power = (mode + 1) / LAUNCHER_RANGES.length;
  out.flightTime = sample.time;
  return true;
}

/** Distance horizontale parcourue à la fin du retard par un objet roulé à la vitesse v. */
function timedReach(s: Shot, pitch: number, v: number, floorY: number, fuse: number): number {
  const cp = Math.cos(pitch);
  resetFlatSim(
    flat, setup.sx, setup.sy, setup.sz,
    Math.sin(setup.yaw) * cp * v + setup.baseVx, Math.sin(pitch) * v, Math.cos(setup.yaw) * cp * v + setup.baseVz,
  );
  simulateFlat(flat, s.pspec, floorY, setup.windX, setup.windZ, SOLVER_DT, fuse, false);
  const dx = flat.x - setup.sx;
  const dz = flat.z - setup.sz;
  return dx * setup.ux + dz * setup.uz;
}

function solveTimed(core: ItemsCore, p: Person, s: Shot, out: AimSolution): boolean {
  const ls = s.launch;
  const fuse = s.pspec.fuse;
  const vMax = launchSpeed(core, p, s, 1);
  const vMin = launchSpeed(core, p, s, 0);
  const pitch = ls.preferredPitch;
  const d = setup.dist;
  if (timedReach(s, pitch, vMax, p.y, fuse) < d) return false;
  let v = vMin;
  if (timedReach(s, pitch, vMin, p.y, fuse) < d) {
    let lo = vMin;
    let hi = vMax;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) * 0.5;
      if (timedReach(s, pitch, mid, p.y, fuse) < d) lo = mid;
      else hi = mid;
    }
    v = (lo + hi) * 0.5;
  } else if (timedReach(s, pitch, vMin, p.y, fuse) > d + 3) {
    return false; // trop près : même roulée doucement, la grenade dépasserait la cible
  }
  const span = vMax - vMin;
  out.yaw = setup.yaw;
  out.pitch = pitch - ls.loft;
  out.power = span > 1e-9 ? clamp((v - vMin) / span, 0, 1) : 1;
  out.flightTime = fuse;
  return true;
}

/**
 * Visée pour atteindre le point (tx, ty, tz) avec l'objet en main. Objets sans projectile : visée
 * géométrique, vraie si le point est à portée de l'objet. false si hors de portée.
 * Lanceur de 56 mm : pour une IA, choisit aussi le dispositif de propulsion (le plus court qui porte).
 */
export function solveAim(core: ItemsCore, p: Person, tx: number, ty: number, tz: number, out: AimSolution): boolean {
  const stack = activeStack(p);
  if (!stack) return false;
  const def = itemDef(stack.id);
  if (!def) return false;
  if (!shotFor(p, stack, shot)) {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    out.yaw = Math.atan2(dx, dz);
    out.pitch = Math.atan2(ty - (p.y + p.look.height * 0.9), d > 1e-6 ? d : 1e-6);
    out.power = 1;
    out.flightTime = 0;
    return def.rangeMax > 0 && d <= def.rangeMax + p.radius;
  }
  prepare(core, p, shot, tx, ty, tz);
  switch (shot.launch.aim) {
    case 'lob': return solveLob(core, p, shot, out);
    case 'direct': return solveDirect(core, p, shot, out);
    case 'cloche': return solveCloche(core, p, shot, out);
    case 'timed': return solveTimed(core, p, shot, out);
    default:
      out.yaw = setup.yaw;
      out.pitch = 0;
      out.power = 1;
      out.flightTime = Number.isFinite(shot.pspec.fuse) ? shot.pspec.fuse : 0;
      return true;
  }
}

// ───────────────────────────── départ et prévisions ─────────────────────────────

/** État de départ d'un tir : position et vitesse (sans dispersion). */
export interface Launch {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  speed: number;
  pitch: number;
}

export function makeLaunch(): Launch {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, pitch: 0 };
}

/** Calcule le départ pour le cap, le site de visée et la vitesse donnés (la vitesse du tireur s'ajoute). */
export function computeLaunch(p: Person, ls: LaunchSpec, yaw: number, pitch: number, speed: number, out: Launch): void {
  const cp = Math.cos(pitch);
  out.x = p.x + Math.sin(yaw) * ls.forward;
  out.z = p.z + Math.cos(yaw) * ls.forward;
  out.y = p.y + launchHeight(p, ls);
  out.vx = Math.sin(yaw) * cp * speed + p.vx;
  out.vy = Math.sin(pitch) * speed;
  out.vz = Math.cos(yaw) * cp * speed + p.vz;
  out.speed = speed;
  out.pitch = pitch;
}

const planned: Launch = makeLaunch();

/**
 * Prévoit le vol d'un départ au-dessus d'un sol plat à `floorY` : retourne la durée jusqu'au premier
 * contact (−1 si aucun en 60 s) et écrit le point de chute dans `out` s'il est fourni.
 */
export function predictFlight(core: ItemsCore, l: Launch, pspec: ProjectileSpec, floorY: number, out?: Vec3): number {
  const env = core.ctx.env.state;
  resetFlatSim(flat, l.x, l.y, l.z, l.vx, l.vy, l.vz);
  simulateFlat(flat, pspec, floorY, env.windX, env.windZ, SOLVER_DT, 60, true);
  if (out) {
    out.x = flat.impactT >= 0 ? flat.impactX : flat.x;
    out.y = floorY;
    out.z = flat.impactT >= 0 ? flat.impactZ : flat.z;
  }
  return flat.impactT;
}

/** Point atteint par l'objet en main avec la visée courante et la puissance donnée (voir ItemsApi.predictImpact). */
export function predictImpact(core: ItemsCore, p: Person, power: number, out: Vec3): boolean {
  const stack = activeStack(p);
  if (!stack || !shotFor(p, stack, shot)) return false;
  const ls = shot.launch;
  computeLaunch(p, ls, p.aimYaw, launchPitch(ls, p.aimPitch), launchSpeed(core, p, shot, power), planned);
  if (ls.aim === 'timed') {
    const env = core.ctx.env.state;
    resetFlatSim(flat, planned.x, planned.y, planned.z, planned.vx, planned.vy, planned.vz);
    simulateFlat(flat, shot.pspec, p.y, env.windX, env.windZ, SOLVER_DT, shot.pspec.fuse, false);
    out.x = flat.x;
    out.y = p.y;
    out.z = flat.z;
    return true;
  }
  predictFlight(core, planned, shot.pspec, p.y, out);
  return true;
}

const trace = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

/** Échantillonne la trajectoire prévue de l'objet en main (voir ItemsApi.sampleTrajectory). */
export function sampleTrajectory(core: ItemsCore, p: Person, power: number, out: number[], maxPoints = 32): number {
  const stack = activeStack(p);
  if (!stack || !shotFor(p, stack, shot) || maxPoints < 2) {
    truncate(out, 0);
    return 0;
  }
  const ls = shot.launch;
  computeLaunch(p, ls, p.aimYaw, launchPitch(ls, p.aimPitch), launchSpeed(core, p, shot, power), planned);
  const env = core.ctx.env.state;
  const total = predictFlight(core, planned, shot.pspec, p.y);
  const duration = total > 0 ? total : 3;
  const steps = Math.max(1, Math.ceil(duration / SOLVER_DT));
  const every = Math.max(1, Math.ceil(steps / (maxPoints - 1)));
  trace.x = planned.x; trace.y = planned.y; trace.z = planned.z;
  trace.vx = planned.vx; trace.vy = planned.vy; trace.vz = planned.vz;
  let n = 0;
  let count = 0;
  n = put(out, n, trace.x);
  n = put(out, n, trace.y);
  n = put(out, n, trace.z);
  count++;
  for (let i = 1; i <= steps && count < maxPoints; i++) {
    stepFlight(trace, shot.pspec.drag, env.windX, env.windZ, SOLVER_DT);
    if (trace.y < p.y) trace.y = p.y;
    if (i % every === 0 || i === steps) {
      n = put(out, n, trace.x);
      n = put(out, n, trace.y);
      n = put(out, n, trace.z);
      count++;
    }
    if (trace.y <= p.y) break;
  }
  truncate(out, n);
  return count;
}
