/* =====================================================================================
 * Instanciation d'une recette sur un BaseAudioContext quelconque (temps réel ou hors ligne).
 * Point de passage unique du moteur et des tests : même graphe, même niveau, même fondu final.
 * ===================================================================================== */

import type { SoundDef } from './catalog';
import { Kit } from './kit';
import { mulberry32 } from './prng';

export interface InstanceOpts {
  seed: number;
  pitch: number;
  /** Boucle demandée (seules les recettes entretenues durent alors indéfiniment). */
  loop: boolean;
  text: string;
}

export interface Instance {
  kit: Kit;
  /** Nœud de sortie de l'instance (niveau du catalogue + fondu final). */
  out: GainNode;
  /** Durée (s) ; Infinity pour une boucle entretenue. */
  duration: number;
  /** Période de relance (s) quand un son non entretenu est joué en boucle. */
  period: number;
}

/** Fondu de sécurité à la fin d'un son ponctuel : aucune coupure nette, même si une résonance traîne. */
const END_FADE = 0.035;

export function instantiate(ac: BaseAudioContext, def: SoundDef, dest: AudioNode, when: number, o: InstanceOpts): Instance {
  const out = ac.createGain();
  out.gain.value = def.level;
  out.connect(dest);
  const kit = new Kit(ac, out, when, mulberry32(o.seed), o.pitch, o.loop && def.sustained, o.text);
  const duration = def.recipe(kit);
  if (Number.isFinite(duration)) {
    out.gain.setValueAtTime(def.level, when + Math.max(0, duration - END_FADE));
    out.gain.linearRampToValueAtTime(0, when + duration);
    kit.stopAll(when + duration + 0.05);
  }
  return { kit, out, duration, period: kit.period > 0 ? kit.period : duration };
}
