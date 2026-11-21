/* Préréglages de niveaux de détail et de cadence d'animation selon la qualité graphique (ViewApi.quality). */

import type { QualityLevel } from '@/core/contracts';

export interface QualityPreset {
  near: number;
  mid: number;
  maxNear: number;
  maxMid: number;
  /** Niveaux de détail qui projettent une ombre réelle (0 = aucun, 1 = proche, 2 = proche et moyen). */
  castLevels: number;
  /** Intervalle minimal entre deux recalculs de pose (s) aux niveaux moyen et lointain. */
  midInterval: number;
  farInterval: number;
  maxDistance: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  bas: { near: 7, mid: 26, maxNear: 16, maxMid: 140, castLevels: 0, midInterval: 1 / 24, farInterval: 1 / 12, maxDistance: 220 },
  moyen: { near: 11, mid: 42, maxNear: 40, maxMid: 320, castLevels: 1, midInterval: 1 / 32, farInterval: 1 / 16, maxDistance: 320 },
  haut: { near: 15, mid: 58, maxNear: 70, maxMid: 560, castLevels: 2, midInterval: 1 / 32, farInterval: 1 / 16, maxDistance: 400 },
  ultra: { near: 20, mid: 80, maxNear: 110, maxMid: 900, castLevels: 2, midInterval: 1 / 40, farInterval: 1 / 20, maxDistance: 500 },
};
