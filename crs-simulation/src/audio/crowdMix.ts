/* =====================================================================================
 * Mixage de la foule — logique pure (testable sous Node).
 *
 * À partir de ce que l'auditeur a autour de lui (nombre de manifestants, colère et peur
 * moyennes) et de l'état du directeur de foule (phase, tension), calcule le niveau de chaque
 * couche sonore : murmure, slogans scandés, huées, sifflets, panique, percussions.
 * Le système d'ambiance lisse ensuite ces cibles dans le temps.
 * ===================================================================================== */

import type { CrowdPhase } from '@/core/contracts';

export interface CrowdInput {
  /** Manifestants dans le rayon d'écoute. */
  count: number;
  /** Distance moyenne de ces manifestants à l'auditeur (m). */
  meanDistance: number;
  /** Colère moyenne 0..1. */
  anger: number;
  /** Peur moyenne 0..1. */
  fear: number;
  phase: CrowdPhase;
  /** Tension 0..1 (au point d'écoute si disponible, sinon globale). */
  tension: number;
}

export interface CrowdMix {
  /** Densité perçue 0..1 (0 = personne, → 1 = foule compacte tout autour). */
  presence: number;
  murmur: number;
  chant: number;
  boo: number;
  whistle: number;
  panic: number;
  drums: number;
}

interface PhaseWeights { murmur: number; chant: number; boo: number; whistle: number; panic: number; drums: number }

/** Couleur de base de chaque phase de la manifestation. */
const PHASE: Record<CrowdPhase, PhaseWeights> = {
  aucune:        { murmur: 0.55, chant: 0.0,  boo: 0.0,  whistle: 0.0,  panic: 0.0,  drums: 0.0 },
  rassemblement: { murmur: 1.0,  chant: 0.25, boo: 0.0,  whistle: 0.12, panic: 0.0,  drums: 0.2 },
  depart:        { murmur: 0.8,  chant: 0.6,  boo: 0.0,  whistle: 0.3,  panic: 0.0,  drums: 0.55 },
  cortege:       { murmur: 0.6,  chant: 1.0,  boo: 0.05, whistle: 0.4,  panic: 0.0,  drums: 0.85 },
  tension:       { murmur: 0.5,  chant: 0.65, boo: 0.55, whistle: 0.7,  panic: 0.05, drums: 0.3 },
  affrontement:  { murmur: 0.25, chant: 0.25, boo: 0.8,  whistle: 0.6,  panic: 0.45, drums: 0.0 },
  dispersion:    { murmur: 0.4,  chant: 0.1,  boo: 0.4,  whistle: 0.25, panic: 0.4,  drums: 0.0 },
  apres_manif:   { murmur: 0.4,  chant: 0.0,  boo: 0.1,  whistle: 0.05, panic: 0.0,  drums: 0.0 },
  terminee:      { murmur: 0.3,  chant: 0.0,  boo: 0.0,  whistle: 0.0,  panic: 0.0,  drums: 0.0 },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Densité perçue : sature doucement (40 personnes ≈ 0,63 ; 100 ≈ 0,92), s'éteint avec l'éloignement. */
export function crowdPresence(count: number, meanDistance: number): number {
  if (!(count > 0)) return 0;
  const density = 1 - Math.exp(-count / 40);
  const near = 1 - 0.6 * smooth(15, 70, meanDistance);
  return clamp01(density * near);
}

/** Calcule le mixage cible. Écrit dans `out` (aucune allocation) et le retourne. */
export function computeCrowdMix(input: CrowdInput, out: CrowdMix): CrowdMix {
  const presence = crowdPresence(input.count, input.meanDistance);
  out.presence = presence;
  if (presence <= 0) {
    out.murmur = out.chant = out.boo = out.whistle = out.panic = out.drums = 0;
    return out;
  }
  const w = PHASE[input.phase] ?? PHASE.aucune;
  const anger = clamp01(input.anger);
  const fear = clamp01(input.fear);
  const tension = clamp01(input.tension);
  const agitation = Math.max(anger, fear);

  // La peur éteint les slogans et les percussions ; la colère les durcit avant de les remplacer par des huées.
  const panic = clamp01(w.panic * (0.4 + fear) + smooth(0.35, 0.8, fear) * 0.9);
  const boo = clamp01(w.boo * (0.5 + 0.8 * anger) + smooth(0.45, 0.9, anger) * 0.6 + tension * 0.15 * anger);
  const chant = clamp01(w.chant * (1 - 0.75 * fear) * (1 - 0.45 * smooth(0.6, 1, anger)) * (1 - 0.6 * panic));
  const whistle = clamp01((w.whistle + 0.45 * anger + 0.2 * tension) * (1 - 0.7 * fear));
  const drums = clamp01(w.drums * (1 - fear) * (1 - 0.8 * smooth(0.5, 0.9, tension)) * (1 - panic));
  const murmur = clamp01(w.murmur * (1 - 0.65 * agitation) + 0.15);

  out.murmur = murmur * presence;
  out.chant = chant * presence;
  out.boo = boo * presence;
  out.whistle = whistle * presence;
  out.panic = panic * presence;
  out.drums = drums * presence;
  return out;
}

/** Couche dominante (pour le débogage et les tests). */
export function dominantLayer(m: CrowdMix): 'silence' | 'murmur' | 'chant' | 'boo' | 'panic' {
  let best: 'silence' | 'murmur' | 'chant' | 'boo' | 'panic' = 'silence';
  let v = 0.02;
  if (m.murmur > v) { v = m.murmur; best = 'murmur'; }
  if (m.chant > v) { v = m.chant; best = 'chant'; }
  if (m.boo > v) { v = m.boo; best = 'boo'; }
  if (m.panic > v) { v = m.panic; best = 'panic'; }
  return best;
}

/**
 * Niveau de la rumeur de la ville selon l'heure (0..1) : creux de la nuit, pointes du matin et
 * du soir. Une manifestation coupe la circulation alentour : `crowdPresence` l'atténue.
 */
export function cityLevel(hour: number, presence = 0): number {
  const h = ((hour % 24) + 24) % 24;
  // points d'appui (heure → niveau), interpolation linéaire
  const pts = CITY_CURVE;
  let level = pts[pts.length - 1]![1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (h >= a[0] && h <= b[0]) {
      level = a[1] + (b[1] - a[1]) * ((h - a[0]) / (b[0] - a[0]));
      break;
    }
  }
  return clamp01(level * (1 - 0.45 * clamp01(presence)));
}

const CITY_CURVE: readonly (readonly [number, number])[] = [
  [0, 0.3], [2, 0.2], [4.5, 0.18], [6, 0.4], [8.5, 0.95], [10, 0.8], [12.5, 0.85],
  [15, 0.75], [18, 1.0], [20, 0.75], [22, 0.5], [24, 0.3],
];
