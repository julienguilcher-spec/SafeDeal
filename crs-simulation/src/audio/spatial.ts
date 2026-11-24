/* =====================================================================================
 * Spatialisation « économique » — calculs purs (aucun accès à WebAudio, testables sous Node).
 *
 *   - atténuation par la distance (modèle inverse borné, fondu jusqu'à la portée maximale) ;
 *   - panoramique stéréo d'après l'orientation de l'auditeur ;
 *   - filtre passe-bas qui se ferme avec la distance (absorption de l'air, exagérée comme dans
 *     tous les jeux pour donner un indice de profondeur) et quand la source est masquée ;
 *   - retard de propagation et effet Doppler.
 *
 * Conventions du contrat : x = est, z = sud, y = haut ; cap h : avant = (sin h, cos h).
 * La droite de l'auditeur vaut donc (−cos h, sin h) : en regardant vers +z (sud), l'est (+x)
 * est à main GAUCHE.
 * ===================================================================================== */

/** Vitesse du son dans l'air (m/s). */
export const SPEED_OF_SOUND = 343;
/** Fréquence de coupure « filtre ouvert » (Hz). */
export const CUTOFF_OPEN = 20000;
/** Coupure plancher d'une source masquée par un bâtiment (Hz). */
export const CUTOFF_OCCLUDED = 900;

export interface SpatialProfile {
  /** Distance en deçà de laquelle le son est à plein volume (m). */
  refDistance: number;
  /** Portée : au-delà, le son est inaudible (m). */
  maxDistance: number;
  /** Raideur de la décroissance (1 = inverse de la distance). */
  rolloff: number;
}

export interface SpatialResult {
  /** Gain 0..1 (distance, occlusion, source derrière l'auditeur). */
  gain: number;
  /** Panoramique −1 (gauche) … +1 (droite). */
  pan: number;
  /** Coupure du passe-bas (Hz). */
  cutoff: number;
  /** Distance source-auditeur (m). */
  distance: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Gain dû à la seule distance : 1 jusqu'à refDistance, décroissance inverse, fondu vers 0 à maxDistance. */
export function distanceGain(d: number, p: SpatialProfile): number {
  if (!(d < p.maxDistance)) return 0;
  const ref = p.refDistance;
  let g = 1;
  if (d > ref) g = ref / (ref + p.rolloff * (d - ref));
  // Fondu final : pas de coupure nette quand une source franchit sa portée.
  return g * (1 - smooth(p.maxDistance * 0.7, p.maxDistance, d));
}

/**
 * Panoramique stéréo. (dx, dz) = source − auditeur ; yaw = cap de l'auditeur.
 * Atténué à très courte distance pour qu'un son émis « sur » l'auditeur reste centré.
 */
export function stereoPan(dx: number, dz: number, yaw: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const side = (dx * rx + dz * rz) / d;
  return 0.92 * side * smooth(0.25, 2.5, d);
}

/** 0 quand la source est devant ou sur le côté, 1 quand elle est exactement dans le dos. */
export function behindFactor(dx: number, dz: number, yaw: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return 0;
  const front = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d;
  return clamp01(-front) * smooth(0.5, 3, d);
}

/** Coupure du passe-bas selon la distance (m) et l'occlusion 0..1. */
export function lowpassCutoff(d: number, occlusion: number, behind = 0): number {
  // Absorption de l'air : 20 kHz au contact, ≈ 10 kHz à 60 m, ≈ 4 kHz à 150 m, ≈ 1,6 kHz à 300 m.
  let c = CUTOFF_OPEN / (1 + Math.pow(Math.max(0, d) / 60, 1.5));
  // Source dans le dos : le pavillon de l'oreille filtre un peu les aigus.
  c *= 1 - 0.35 * clamp01(behind);
  if (occlusion > 0) {
    const o = clamp01(occlusion);
    const floor = Math.min(c, CUTOFF_OCCLUDED);
    c = Math.pow(c, 1 - o) * Math.pow(floor, o); // interpolation en fréquence logarithmique
  }
  return c < 120 ? 120 : c;
}

/**
 * Calcul complet pour une source ponctuelle. `occlusion` : 0 = vue directe, 1 = masquée.
 * Écrit dans `out` (aucune allocation) et le retourne.
 */
export function computeSpatial(
  lx: number, ly: number, lz: number, yaw: number,
  sx: number, sy: number, sz: number,
  profile: SpatialProfile, occlusion: number, out: SpatialResult,
): SpatialResult {
  const dx = sx - lx;
  const dz = sz - lz;
  const dy = sy - ly;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const behind = behindFactor(dx, dz, yaw);
  const o = clamp01(occlusion);
  out.distance = d;
  out.gain = distanceGain(d, profile) * (1 - 0.55 * o) * (1 - 0.12 * behind);
  out.pan = stereoPan(dx, dz, yaw);
  out.cutoff = lowpassCutoff(d, o, behind);
  return out;
}

/** Retard de propagation (s), plafonné pour ne pas désynchroniser un effet visuel de plus de `max` s. */
export function propagationDelay(d: number, max = 1.2): number {
  const t = d / SPEED_OF_SOUND;
  return t > max ? max : t < 0 ? 0 : t;
}

/**
 * Facteur Doppler (multiplicateur de fréquence perçue).
 * (sx, sz) et (lx, lz) : positions ; (svx, svz), (lvx, lvz) : vitesses en m/s.
 * Borné à [0,8 ; 1,25] : au-delà l'effet devient caricatural (et les à-coups de caméra s'entendent).
 */
export function dopplerFactor(
  lx: number, lz: number, lvx: number, lvz: number,
  sx: number, sz: number, svx: number, svz: number,
): number {
  const dx = lx - sx;
  const dz = lz - sz;
  const d = Math.hypot(dx, dz);
  if (d < 1) return 1;
  const nx = dx / d; // de la source vers l'auditeur
  const nz = dz / d;
  const vSource = svx * nx + svz * nz;      // > 0 : la source se rapproche
  const vListener = -(lvx * nx + lvz * nz); // > 0 : l'auditeur se rapproche
  const f = (SPEED_OF_SOUND + vListener) / (SPEED_OF_SOUND - vSource);
  return f < 0.8 ? 0.8 : f > 1.25 ? 1.25 : f;
}
