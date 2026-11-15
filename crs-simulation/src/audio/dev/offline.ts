/* =====================================================================================
 * Rendu hors ligne d'une recette (banc d'essai et tests de bout en bout — hors jeu livré).
 * Prouve au passage que la synthèse vise n'importe quel BaseAudioContext.
 * ===================================================================================== */

import type { SoundId } from '@/core/contracts';
import { soundDef } from '../catalog';
import { Kit } from '../kit';
import { mulberry32 } from '../prng';

export interface OfflineOpts {
  /** Durée de la fenêtre de rendu (s). Défaut : durée de la recette + 0,3 s, entre 1 et `maxSeconds`. */
  seconds?: number;
  maxSeconds?: number;
  sampleRate?: number;
  pitch?: number;
  loop?: boolean;
  seed?: number;
  text?: string;
  /** Appliquer le niveau du catalogue (défaut : oui). */
  applyLevel?: boolean;
}

export interface OfflineResult {
  id: string;
  data: Float32Array;
  sampleRate: number;
  /** Durée annoncée par la recette (s) ; Infinity pour une boucle entretenue. */
  declared: number;
  /** Instant de départ de la recette dans la fenêtre (s). */
  lead: number;
  seconds: number;
}

const LEAD = 0.02;

function build(ac: BaseAudioContext, id: SoundId, o: OfflineOpts): number {
  const def = soundDef(id);
  if (!def) throw new Error(`[audio] son inconnu : ${id}`);
  const out = ac.createGain();
  out.gain.value = o.applyLevel === false ? 1 : def.level;
  out.connect(ac.destination);
  const k = new Kit(ac, out, LEAD, mulberry32(o.seed ?? 12345), o.pitch ?? 1, o.loop ?? false, o.text ?? '');
  const d = def.recipe(k);
  if (Number.isFinite(d)) k.stopAll(LEAD + d + 0.05);
  return d;
}

/** Rend le son `id` dans un OfflineAudioContext et retourne les échantillons (mono). */
export async function renderOffline(id: SoundId, o: OfflineOpts = {}): Promise<OfflineResult> {
  const sampleRate = o.sampleRate ?? 44100;
  // 1er passage dans un contexte minuscule : la recette annonce sa durée (même graine → même durée).
  const probe = new OfflineAudioContext(1, 64, sampleRate);
  const declared = build(probe, id, o);
  const max = o.maxSeconds ?? 3.5;
  const seconds = o.seconds ?? Math.min(max, Math.max(1, (Number.isFinite(declared) ? declared : 3) + 0.3));
  const ac = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  build(ac, id, o);
  const buf = await ac.startRendering();
  return { id, data: buf.getChannelData(0), sampleRate, declared, lead: LEAD, seconds };
}
