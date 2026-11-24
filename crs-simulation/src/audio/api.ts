/* =====================================================================================
 * Services étendus du module audio (à importer en `import type` par les autres modules).
 *
 *   ctx.audio                                — AudioApi du contrat (play / stop / speak / setListener)
 *   ctx.service<EngineSoundService>('audio.engine') — moteurs de véhicule pilotés en continu
 *   ctx.service<AudioDebug>('audio.debug')   — état du moteur sonore (banc d'essai, HUD de débogage)
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import type { CrowdMix } from './crowdMix';
import type { EngineStats } from './engine';

export const AUDIO_ENGINE_SERVICE = 'audio.engine';
export const AUDIO_DEBUG_SERVICE = 'audio.debug';

/** Son de moteur attaché à un véhicule. */
export interface EngineSound {
  /** Régime : tr/min réels, ou valeur normalisée 0..1 (0 = ralenti, 1 = régime maximal) si ≤ 1,5. */
  setRpm(rpm: number): void;
  /** Charge 0..1 (pied sur l'accélérateur). */
  setLoad(load: number): void;
  setPosition(x: number, y: number, z: number): void;
  dispose(): void;
}

export interface EngineSoundService {
  /**
   * Crée le son de moteur d'un véhicule (timbre choisi d'après son type). Tant qu'un module
   * extérieur tient un moteur pour ce véhicule, le module audio ne le sonorise plus lui-même.
   */
  create(vehicleId: EntityId): EngineSound;
}

/** Options de speak() au-delà du contrat (le contrat ne prévoit que voice, radio, volume, x, z). */
export interface SpeakExtra {
  /** Habillage mégaphone (clic, larsen, souffle d'ampli ; voix indistincte si pas de synthèse). */
  megaphone?: boolean;
  /** 0 = ambiance (abandonné si la file est pleine), 1 = normal, 2 = urgent (passe devant). */
  priority?: 0 | 1 | 2;
  y?: number;
}

export interface AudioDebug {
  stats(): EngineStats;
  voices(): string[];
  /** Mixage de foule courant (lissé). */
  crowdMix(): Readonly<CrowdMix>;
  /** Force la création / reprise du contexte (à appeler depuis un geste de l'utilisateur). */
  unlock(): boolean;
  analyser(): AnalyserNode | null;
  /** État de la voix : synthèse disponible, voix française trouvée, messages en file. */
  speech(): { supported: boolean; frenchVoices: number; queued: number; speaking: boolean };
}
