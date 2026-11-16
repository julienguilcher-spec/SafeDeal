/* =====================================================================================
 * BALISTIQUE — intégration, rebonds, roulement et résolution de tir. Logique pure, sans allocation.
 *
 * Modèle : gravité + traînée quadratique relative à l'air (le vent agit par la traînée : un pavé
 * l'ignore presque, un palet ou une balle de défense dérivent). Intégration au point milieu
 * (ordre 2) : exacte sans traînée, et assez insensible au pas pour que la visée, calculée avec son
 * propre pas, reste juste à quelques centimètres près quand le jeu tourne à 1/20, 1/30 ou 1/60 s.
 *
 * Le même code sert au vol réel des projectiles (projectiles.ts) et aux prévisions (visée des IA,
 * aide à la visée, retard des grenades tirées au lanceur) : ce qui est prévu est ce qui se produit.
 * ===================================================================================== */

export const GRAVITY = 9.81;
/** Pas de temps des prévisions (s). */
export const SOLVER_DT = 1 / 30;
/** Vitesse verticale de rebond sous laquelle l'objet cesse de rebondir et roule (m/s). */
export const ROLL_THRESHOLD = 0.9;
/** Vitesse au sol sous laquelle l'objet s'immobilise (m/s). */
export const REST_SPEED = 0.15;
/** Vitesse normale d'impact (m/s) à laquelle le rebond est réduit de moitié. */
export const HARD_IMPACT_SPEED = 12;

/** Corps ponctuel : un Projectile du contrat satisfait cette interface. */
export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

/** Un pas de vol libre (point milieu) avec traînée quadratique `drag` (1/m) et vent horizontal. */
export function stepFlight(b: Body, drag: number, windX: number, windZ: number, dt: number): void {
  const half = dt * 0.5;
  let rx = b.vx - windX;
  let ry = b.vy;
  let rz = b.vz - windZ;
  let s = Math.sqrt(rx * rx + ry * ry + rz * rz) * drag;
  const mx = b.vx - s * rx * half;
  const my = b.vy - (GRAVITY + s * ry) * half;
  const mz = b.vz - s * rz * half;
  rx = mx - windX;
  ry = my;
  rz = mz - windZ;
  s = Math.sqrt(rx * rx + ry * ry + rz * rz) * drag;
  b.x += mx * dt;
  b.y += my * dt;
  b.z += mz * dt;
  b.vx -= s * rx * dt;
  b.vy -= (GRAVITY + s * ry) * dt;
  b.vz -= s * rz * dt;
}

/**
 * Contact avec un sol horizontal situé à `floorY` pendant le pas qui a mené de (px, py, pz) à la
 * position courante : ramène le corps au point de contact et applique le rebond (le reste du pas est
 * abandonné). Retourne la vitesse normale d'impact (m/s, ≥ 0).
 */
export function contactGround(
  b: Body, px: number, py: number, pz: number, floorY: number, radius: number, restitution: number, friction: number,
): number {
  const h0 = py - radius - floorY;
  const h1 = b.y - radius - floorY;
  let f = h0 > h1 ? h0 / (h0 - h1) : 0;
  if (f < 0) f = 0;
  else if (f > 1) f = 1;
  b.x = px + (b.x - px) * f;
  b.z = pz + (b.z - pz) * f;
  b.y = floorY + radius;
  const vn = b.vy < 0 ? -b.vy : 0;
  // plus le choc est violent, moins il restitue (déformation, éclats de bitume) : une grenade tombée
  // de haut ne rebondit pas à hauteur d'homme
  b.vy = (vn * restitution) / (1 + vn / HARD_IMPACT_SPEED);
  const k = 1 - friction;
  b.vx *= k;
  b.vz *= k;
  return vn;
}

/**
 * Rebond sur une paroi verticale de normale (nx, nz) tournée vers le corps. Retourne la vitesse
 * normale d'impact (0 si le corps s'éloignait déjà de la paroi).
 */
export function bounceWall(b: Body, nx: number, nz: number, restitution: number, friction: number): number {
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= 0) return 0;
  const k = 1 - friction;
  const tx = b.vx - vn * nx;
  const tz = b.vz - vn * nz;
  b.vx = tx * k - vn * restitution * nx;
  b.vz = tz * k - vn * restitution * nz;
  b.vy *= 1 - friction * 0.5;
  return -vn;
}

/** Un pas de roulement ou de glissement au sol (décélération `decel`, m/s²). true si l'objet s'arrête. */
export function stepRoll(b: Body, decel: number, dt: number): boolean {
  const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
  if (sp < REST_SPEED) {
    b.vx = 0;
    b.vz = 0;
    return true;
  }
  const drop = decel * dt;
  if (sp <= drop) {
    const d = (sp * sp) / (2 * decel);
    b.x += (b.vx / sp) * d;
    b.z += (b.vz / sp) * d;
    b.vx = 0;
    b.vz = 0;
    return true;
  }
  const k = (sp - drop) / sp;
  b.x += b.vx * dt * (1 + k) * 0.5;
  b.z += b.vz * dt * (1 + k) * 0.5;
  b.vx *= k;
  b.vz *= k;
  return false;
}

// ───────────────────────────── prévision sur sol plat ─────────────────────────────

/** Paramètres physiques utiles à une prévision (un ProjectileSpec les fournit). */
export interface FlatParams {
  drag: number;
  radius: number;
  restitution: number;
  friction: number;
  roll: number;
}

export interface FlatSim extends Body {
  /** Temps écoulé (s). */
  t: number;
  rolling: boolean;
  resting: boolean;
  /** Premier contact avec le sol : instant (−1 si aucun), point et vitesse d'arrivée. */
  impactT: number;
  impactX: number;
  impactZ: number;
  impactSpeed: number;
}

export function makeFlatSim(): FlatSim {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, rolling: false, resting: false,
    impactT: -1, impactX: 0, impactZ: 0, impactSpeed: 0,
  };
}

export function resetFlatSim(s: FlatSim, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
  s.x = x; s.y = y; s.z = z;
  s.vx = vx; s.vy = vy; s.vz = vz;
  s.t = 0;
  s.rolling = false;
  s.resting = false;
  s.impactT = -1;
  s.impactX = 0;
  s.impactZ = 0;
  s.impactSpeed = 0;
}

/**
 * Fait avancer la prévision jusqu'à `tEnd` (ou l'immobilisation) au-dessus d'un sol plat à `floorY`,
 * avec rebonds et roulement. `stopAtImpact` : s'arrêter au premier contact avec le sol.
 */
export function simulateFlat(
  s: FlatSim, prm: FlatParams, floorY: number, windX: number, windZ: number, dt: number, tEnd: number,
  stopAtImpact: boolean,
): void {
  let guard = 4000;
  while (s.t < tEnd - 1e-9 && !s.resting && guard-- > 0) {
    let h = tEnd - s.t;
    if (h > dt) h = dt;
    if (s.rolling) {
      if (stepRoll(s, prm.roll * GRAVITY, h)) s.resting = true;
      s.t += h;
      continue;
    }
    const px = s.x;
    const py = s.y;
    const pz = s.z;
    stepFlight(s, prm.drag, windX, windZ, h);
    if (s.y - prm.radius < floorY) {
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
      const h0 = py - prm.radius - floorY;
      const h1 = s.y - prm.radius - floorY;
      const f = h0 > h1 ? Math.min(1, Math.max(0, h0 / (h0 - h1))) : 0;
      contactGround(s, px, py, pz, floorY, prm.radius, prm.restitution, prm.friction);
      if (s.impactT < 0) {
        s.impactT = s.t + h * f;
        s.impactX = s.x;
        s.impactZ = s.z;
        s.impactSpeed = speed;
      }
      if (stopAtImpact) {
        s.t += h * f;
        s.resting = true;
        return;
      }
      if (s.vy < ROLL_THRESHOLD) {
        s.vy = 0;
        s.rolling = true;
      }
    }
    s.t += h;
  }
}

// ───────────────────────────── résolution de tir ─────────────────────────────

/** Données d'un problème de visée : départ, vitesse héritée du tireur, cible, air. */
export interface AimSetup {
  drag: number;
  windX: number;
  windZ: number;
  /** Point de départ. */
  sx: number; sy: number; sz: number;
  /** Vitesse du tireur ajoutée à celle du projectile. */
  baseVx: number;
  baseVz: number;
  /** Axe horizontal unitaire du départ vers la cible, et distance horizontale. */
  ux: number;
  uz: number;
  dist: number;
  /** Altitude visée. */
  ty: number;
  /** Cap de tir courant. */
  yaw: number;
}

export function makeAimSetup(): AimSetup {
  return { drag: 0, windX: 0, windZ: 0, sx: 0, sy: 0, sz: 0, baseVx: 0, baseVz: 0, ux: 0, uz: 1, dist: 0, ty: 0, yaw: 0 };
}

/** Résultat du dernier vol calculé par shotError(). */
export interface ShotSample {
  /** Altitude atteinte à la distance de la cible, moins l'altitude visée (−1e9 si la distance n'est pas atteinte). */
  error: number;
  /** Écart latéral à la distance de la cible (m, positif à gauche de l'axe : voir aim.ts). */
  lateral: number;
  /** Durée du vol jusqu'à la distance de la cible (s). */
  time: number;
  /** Vitesse à l'arrivée (m/s). */
  speed: number;
}

export function makeShotSample(): ShotSample {
  return { error: 0, lateral: 0, time: 0, speed: 0 };
}

const fly: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const NOT_REACHED = -1e9;
/** Écart vertical (m) sous lequel une visée est tenue pour exacte. */
const AIM_TOLERANCE = 0.004;

/**
 * Vol libre (sol ignoré) depuis le départ avec l'angle de site `pitch` et la vitesse `speed` : écart
 * vertical à la distance de la cible. Remplit `out` ; retourne out.error.
 * Le pas d'intégration s'adapte à la durée du vol (≈ 48 pas, entre 1/60 et 1/10 s) : l'intégrateur
 * d'ordre 2 garde l'écart avec le vol réel sous quelques centimètres à 200 m.
 */
export function shotError(a: AimSetup, pitch: number, speed: number, out: ShotSample): number {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  fly.x = a.sx;
  fly.y = a.sy;
  fly.z = a.sz;
  fly.vx = Math.sin(a.yaw) * cp * speed + a.baseVx;
  fly.vy = sp * speed;
  fly.vz = Math.cos(a.yaw) * cp * speed + a.baseVz;
  // durée estimée : trajet horizontal, ou temps de montée et de descente d'un tir en cloche
  const vh = speed * cp;
  let estimate = a.dist / (vh > 1 ? vh : 1);
  const lob = sp > 0 ? (2 * speed * sp) / GRAVITY : 0;
  if (lob > estimate) estimate = lob;
  let dt = estimate / 48;
  if (dt < 1 / 60) dt = 1 / 60;
  else if (dt > 0.1) dt = 0.1;
  let prevAlong = 0;
  let prevLat = 0;
  let prevY = a.sy;
  let t = 0;
  for (let i = 0; i < 2000; i++) {
    stepFlight(fly, a.drag, a.windX, a.windZ, dt);
    t += dt;
    const rx = fly.x - a.sx;
    const rz = fly.z - a.sz;
    const along = rx * a.ux + rz * a.uz;
    const lat = rx * a.uz - rz * a.ux;
    if (along >= a.dist) {
      const span = along - prevAlong;
      const f = span > 1e-9 ? (a.dist - prevAlong) / span : 1;
      out.error = prevY + (fly.y - prevY) * f - a.ty;
      out.lateral = prevLat + (lat - prevLat) * f;
      out.time = t - dt + dt * f;
      out.speed = Math.sqrt(fly.vx * fly.vx + fly.vy * fly.vy + fly.vz * fly.vz);
      return out.error;
    }
    // perdu : tombé très bas, ou repoussé par le vent
    if (fly.y < a.ty - 400 || (along < prevAlong && fly.vy < 0 && along < a.dist * 0.5 && t > 2)) break;
    prevAlong = along;
    prevLat = lat;
    prevY = fly.y;
  }
  out.error = NOT_REACHED;
  out.lateral = 0;
  out.time = t;
  out.speed = 0;
  return NOT_REACHED;
}

const GOLD = 0.6180339887498949;

/** Angle de site de [lo, hi] qui passe le plus haut à la distance de la cible (recherche par section dorée). */
export function bestPitch(a: AimSetup, speed: number, lo: number, hi: number, out: ShotSample): number {
  let x1 = hi - (hi - lo) * GOLD;
  let x2 = lo + (hi - lo) * GOLD;
  let f1 = shotError(a, x1, speed, out);
  let f2 = shotError(a, x2, speed, out);
  for (let i = 0; i < 10; i++) {
    if (f1 < f2) {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + (hi - lo) * GOLD;
      f2 = shotError(a, x2, speed, out);
    } else {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - (hi - lo) * GOLD;
      f1 = shotError(a, x1, speed, out);
    }
  }
  return (lo + hi) * 0.5;
}

/**
 * Racine de l'écart vertical entre deux angles où il change de signe (fLo et fHi : écarts déjà
 * calculés en lo et hi). Fausse position amortie (méthode « Illinois ») : une demi-douzaine de vols
 * suffit. Le dernier vol calculé, à la racine, remplit `out`.
 */
export function rootPitch(
  a: AimSetup, speed: number, lo: number, fLo: number, hi: number, fHi: number, out: ShotSample,
): number {
  let side = 0;
  let mid = (lo + hi) * 0.5;
  for (let i = 0; i < 40; i++) {
    const wild = fLo < -1e6 || fHi < -1e6 || fLo > 1e6 || fHi > 1e6;
    mid = wild ? (lo + hi) * 0.5 : (lo * fHi - hi * fLo) / (fHi - fLo);
    if (!(mid > lo && mid < hi)) mid = (lo + hi) * 0.5;
    const f = shotError(a, mid, speed, out);
    if (f > -AIM_TOLERANCE && f < AIM_TOLERANCE) return mid;
    if ((f < 0) === (fLo < 0)) {
      lo = mid;
      fLo = f;
      if (side === -1) fHi *= 0.5;
      side = -1;
    } else {
      hi = mid;
      fHi = f;
      if (side === 1) fLo *= 0.5;
      side = 1;
    }
    if (hi - lo < 1e-7) break;
  }
  return mid;
}

/**
 * Trajectoire basse : plus petit angle de [lo, hi] qui atteint la cible. NaN si elle est hors de
 * portée ; si même l'angle `lo` passe au-dessus de la cible, retourne `lo` avec out.error > 0.
 */
export function solvePitchLow(a: AimSetup, speed: number, lo: number, hi: number, out: ShotSample): number {
  const fLo = shotError(a, lo, speed, out);
  if (fLo >= 0) return lo;
  // un angle un peu plus relevé suffit presque toujours à encadrer la solution
  const span = hi - lo;
  for (let k = 1; k <= 3; k++) {
    const top = lo + span * 0.2 * k;
    const fTop = shotError(a, top, speed, out);
    if (fTop >= 0) return rootPitch(a, speed, lo, fLo, top, fTop, out);
  }
  // cible proche de la portée maximale : on cherche l'angle qui porte le plus loin
  const top = bestPitch(a, speed, lo, hi, out);
  const fTop = shotError(a, top, speed, out);
  if (fTop < 0) return NaN;
  return rootPitch(a, speed, lo, fLo, top, fTop, out);
}

/**
 * Trajectoire haute (tir en cloche) : plus grand angle de [lo, hi] qui atteint la cible, sachant que
 * l'angle `lo` envoie trop loin. NaN si la cible est trop proche pour l'angle maximal.
 */
export function solvePitchHigh(a: AimSetup, speed: number, lo: number, hi: number, out: ShotSample): number {
  const fHi = shotError(a, hi, speed, out);
  if (fHi > 0) return NaN;
  const fLo = shotError(a, lo, speed, out);
  if (fLo < 0) {
    // l'angle bas est trop court lui aussi : la solution haute est au-delà de l'angle de portée maximale
    const top = bestPitch(a, speed, lo, hi, out);
    const fTop = shotError(a, top, speed, out);
    if (fTop < 0) return NaN;
    return rootPitch(a, speed, top, fTop, hi, fHi, out);
  }
  return rootPitch(a, speed, lo, fLo, hi, fHi, out);
}

/**
 * Vitesse de [vMin, vMax] qui atteint la cible sous l'angle `pitch` (l'écart croît avec la vitesse).
 * Retourne −1 si vMin envoie déjà trop loin, −2 si vMax ne suffit pas.
 */
export function solveSpeed(a: AimSetup, pitch: number, vMin: number, vMax: number, out: ShotSample): number {
  let fHi = shotError(a, pitch, vMax, out);
  if (fHi < 0) return -2;
  let fLo = shotError(a, pitch, vMin, out);
  if (fLo > 0) return -1;
  let lo = vMin;
  let hi = vMax;
  let side = 0;
  let mid = (lo + hi) * 0.5;
  for (let i = 0; i < 40; i++) {
    mid = fLo < -1e6 ? (lo + hi) * 0.5 : (lo * fHi - hi * fLo) / (fHi - fLo);
    if (!(mid > lo && mid < hi)) mid = (lo + hi) * 0.5;
    const f = shotError(a, pitch, mid, out);
    if (f > -AIM_TOLERANCE && f < AIM_TOLERANCE) return mid;
    if (f < 0) {
      lo = mid;
      fLo = f;
      if (side === -1) fHi *= 0.5;
      side = -1;
    } else {
      hi = mid;
      fHi = f;
      if (side === 1) fLo *= 0.5;
      side = 1;
    }
    if (hi - lo < 1e-7) break;
  }
  return mid;
}

// ───────────────────────────── étalonnage ─────────────────────────────

const calib = makeFlatSim();

/** Portée sur sol plat (m) d'un tir de vitesse `speed` et d'angle `pitch` parti de la hauteur `h0`. */
export function flatRange(prm: FlatParams, speed: number, pitch: number, h0: number): number {
  resetFlatSim(calib, 0, h0, 0, 0, Math.sin(pitch) * speed, Math.cos(pitch) * speed);
  simulateFlat(calib, prm, 0, 0, 0, SOLVER_DT, 60, true);
  return calib.impactT < 0 ? 0 : calib.impactZ;
}

/** Vitesse initiale donnant la portée `range` sous l'angle `pitch` depuis la hauteur `h0` (dichotomie). */
export function speedForRange(prm: FlatParams, range: number, pitch: number, h0: number): number {
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) * 0.5;
    if (flatRange(prm, mid, pitch, h0) < range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Angle de hausse (rad) pour qu'un tir horizontal de vitesse `speed` coupe la ligne de visée à `zeroRange`. */
export function zeroingAngle(drag: number, speed: number, zeroRange: number): number {
  const a = makeAimSetup();
  a.drag = drag;
  a.dist = zeroRange;
  a.ux = 0;
  a.uz = 1;
  const s = makeShotSample();
  const pitch = solvePitchLow(a, speed, -0.05, 0.6, s);
  return Number.isFinite(pitch) && Math.abs(s.error) < 0.05 ? pitch : 0;
}
