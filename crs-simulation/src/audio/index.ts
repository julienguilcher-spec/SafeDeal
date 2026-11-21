/* =====================================================================================
 * Module audio — moteur sonore entièrement synthétisé (WebAudio, aucun fichier son).
 *
 * Branchement (racine de composition) :
 *     import { createSystems as audio } from '@/audio';
 *     game.add(audio);            // ou : systems.push(...audio())
 * Le système publie ctx.audio, ctx.service('audio.engine') et ctx.service('audio.debug').
 * Voir api.ts (services), wiring.ts (événements écoutés), catalog.ts (ajouter un son).
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { AudioSystem } from './system';

export const createSystems: ModuleFactory = () => [new AudioSystem()];

export { AudioSystem } from './system';
export { AUDIO_DEBUG_SERVICE, AUDIO_ENGINE_SERVICE } from './api';
export type { AudioDebug, EngineSound, EngineSoundService, SpeakExtra } from './api';
export { ALL_SOUND_IDS, CONTRACT_SOUND_IDS, EXTRA_SOUND_IDS } from './catalog';
