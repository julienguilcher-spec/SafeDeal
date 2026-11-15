/* =====================================================================================
 * Réserve de voix — logique pure (testable sous Node).
 *
 * Le moteur ne joue jamais plus de `capacity` sons à la fois. Chaque voix a une priorité
 * (0 = détail d'ambiance … 3 = vital : interface, radio, sons du joueur) et un gain effectif
 * (volume × atténuation). Le classement est lexicographique : priorité d'abord, puis gain ;
 * à priorité égale ce sont donc les sons les plus lointains (les plus faibles) qui sont coupés.
 *
 * Les boucles évincées deviennent « virtuelles » (elles reprendront dès qu'elles redeviennent
 * audibles et qu'une place se libère) ; les sons ponctuels évincés sont simplement perdus.
 * ===================================================================================== */

/** Nombre maximal de sons simultanés (ambiances comprises). */
export const MAX_VOICES = 32;
/** En dessous de ce gain effectif, un son est considéré comme inaudible. */
export const AUDIBLE_EPS = 0.004;
/** Avantage donné aux voix déjà en cours, pour éviter les bascules incessantes. */
export const HYSTERESIS = 0.06;

export const PRIORITY_AMBIENT = 0;
export const PRIORITY_NORMAL = 1;
export const PRIORITY_HIGH = 2;
export const PRIORITY_VITAL = 3;

export interface VoiceCandidate {
  handle: number;
  priority: number;
  /** Gain effectif 0..1 (volume × atténuation). */
  gain: number;
  /** La voix produit actuellement du son. */
  real: boolean;
}

/** Score de classement : la priorité domine, le gain départage. −1 = inaudible. */
export function voiceScore(priority: number, gain: number): number {
  if (!(gain >= AUDIBLE_EPS)) return -1;
  return priority + (gain >= 1 ? 0.999 : gain * 0.999);
}

export interface AdmitResult {
  admit: boolean;
  /** Poignée de la voix à couper pour faire de la place (0 = aucune). */
  evict: number;
}

/**
 * Un nouveau son demande une place. S'il reste de la place il entre ; sinon il ne prend la place
 * de la voix la plus faible que s'il la dépasse nettement.
 */
export function admitVoice(
  cands: readonly VoiceCandidate[], capacity: number, priority: number, gain: number, out: AdmitResult,
): AdmitResult {
  out.admit = false;
  out.evict = 0;
  const score = voiceScore(priority, gain);
  if (score < 0) return out;
  let realCount = 0;
  let weakest = -1;
  let weakestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]!;
    if (!c.real) continue;
    realCount++;
    const s = voiceScore(c.priority, c.gain);
    if (s < weakestScore) {
      weakestScore = s;
      weakest = i;
    }
  }
  if (realCount < capacity) {
    out.admit = true;
    return out;
  }
  if (weakest >= 0 && score > weakestScore + HYSTERESIS) {
    out.admit = true;
    out.evict = cands[weakest]!.handle;
  }
  return out;
}

export interface Rebalance {
  /** Voix virtuelles à (re)démarrer. */
  start: number[];
  /** Voix réelles à couper (devenues inaudibles ou dépassées par plus important). */
  stop: number[];
}

const scratchIndex: number[] = [];
const scratchScore: number[] = [];

/**
 * Rééquilibrage périodique : parmi toutes les voix connues (réelles et virtuelles), garde les
 * `capacity` meilleures. Écrit les poignées à démarrer / couper dans `out` (tableaux vidés).
 */
export function rebalanceVoices(cands: readonly VoiceCandidate[], capacity: number, out: Rebalance): Rebalance {
  out.start.length = 0;
  out.stop.length = 0;
  const n = cands.length;
  scratchIndex.length = n;
  scratchScore.length = n;
  for (let i = 0; i < n; i++) {
    const c = cands[i]!;
    let s = voiceScore(c.priority, c.gain);
    if (s >= 0 && c.real) s += HYSTERESIS;
    scratchScore[i] = s;
    scratchIndex[i] = i;
  }
  // Tri par insertion décroissant : n reste petit (quelques dizaines) et rien n'est alloué.
  for (let i = 1; i < n; i++) {
    const idx = scratchIndex[i]!;
    const s = scratchScore[idx]!;
    let j = i - 1;
    while (j >= 0 && scratchScore[scratchIndex[j]!]! < s) {
      scratchIndex[j + 1] = scratchIndex[j]!;
      j--;
    }
    scratchIndex[j + 1] = idx;
  }
  for (let rank = 0; rank < n; rank++) {
    const idx = scratchIndex[rank]!;
    const c = cands[idx]!;
    const keep = rank < capacity && scratchScore[idx]! >= 0;
    if (keep && !c.real) out.start.push(c.handle);
    else if (!keep && c.real) out.stop.push(c.handle);
  }
  return out;
}
