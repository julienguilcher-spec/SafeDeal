/* =====================================================================================
 * Recettes : avertisseurs et moteurs.
 *
 * Avertisseurs spéciaux français « deux tons » (arrêté du 3 novembre 1987, valeurs reprises du
 * dossier docs/research/02-materiel-tenues-vehicules.md § 4.7) : la note grave est toujours
 * 435 Hz (la3 du diapason français), la note aiguë et la cadence identifient le service :
 *     police       435 / 580 Hz   50 à 60 cycles/min   (quarte, rapide)
 *     gendarmerie  435 / 732 Hz   50 à 60 cycles/min   (intervalle large, rapide)
 *     pompiers     435 / 488 Hz   25 à 30 cycles/min   (un ton, lent : « pin-pon »)
 *     SAMU         435 / 651 Hz   50 à 60 cycles/min   (quinte, rapide)
 * Les deux notes alternent SANS glissando.
 * ===================================================================================== */

import { EngineGraph, ENGINE_PROFILES } from '../engineGraph';
import type { Kit } from '../kit';

export interface TwoToneSpec {
  low: number;
  high: number;
  /** Cycles (grave + aigu) par minute. */
  cyclesPerMinute: number;
  timbre: 'electronique' | 'pneumatique';
}

export const SIREN_SPECS = {
  sirene_police: { low: 435, high: 580, cyclesPerMinute: 55, timbre: 'electronique' },
  sirene_gendarmerie: { low: 435, high: 732, cyclesPerMinute: 55, timbre: 'electronique' },
  sirene_pompiers: { low: 435, high: 488, cyclesPerMinute: 27.5, timbre: 'pneumatique' },
  sirene_samu: { low: 435, high: 651, cyclesPerMinute: 55, timbre: 'electronique' },
} as const satisfies Record<string, TwoToneSpec>;

/** Pavillon d'un haut-parleur de sirène : coupe le grave, accentue fortement 1,5 à 3 kHz. */
function pavillon(k: Kit, to: AudioNode, bright: number): AudioNode {
  const lp = k.bq('lowpass', 5200, 0.7, to);
  const p2 = k.bq('peaking', 2700 * bright, 1.5, lp, 6);
  const p1 = k.bq('peaking', 1500 * bright, 1.0, p2, 10);
  return k.bq('highpass', 380, 0.8, p1);
}

function deuxTons(k: Kit, spec: TwoToneSpec, squareMix: number, bright: number): number {
  const m = k.sustain(3, 0.02, 0.06);
  const rate = spec.cyclesPerMinute / 60;
  const mid = (spec.low + spec.high) / 2;
  const half = (spec.high - spec.low) / 2;
  // commande d'alternance : carré lissé sur quelques millisecondes (pas de clic, pas de glissando audible)
  const sq = k.square(rate);
  if (spec.timbre === 'electronique') {
    // un générateur unique dont la fréquence bascule d'une note à l'autre
    const horn = pavillon(k, k.gain(0.26, m), bright);
    const o1 = k.osc('sawtooth', mid, k.gain(1 - squareMix, horn));
    const o2 = k.osc('square', mid, k.gain(squareMix, horn));
    const smooth = k.bq('lowpass', 70, 0.5);
    const depth = k.gain(half);
    sq.connect(smooth);
    smooth.connect(depth);
    depth.connect(o1.frequency);
    depth.connect(o2.frequency);
  } else {
    // deux trompes à air comprimé, une par note, ouvertes à tour de rôle
    const smooth = k.bq('lowpass', 16, 0.5);
    sq.connect(smooth);
    const notes: [number, number][] = [[spec.high, 0.5], [spec.low, -0.5]];
    for (let i = 0; i < 2; i++) {
      const [freq, sign] = notes[i]!;
      const valve = k.gain(0.5, k.gain(0.23, m));
      const drive = k.gain(sign);
      smooth.connect(drive);
      drive.connect(valve.gain);
      const trompe = k.bq('lowpass', 3400, 0.7, valve);
      const body = k.bq('peaking', 950, 1.2, trompe, 8);
      const hp = k.bq('highpass', 300, 0.7, body);
      k.osc('sawtooth', freq, hp);
      k.osc('sawtooth', freq * 1.004, k.gain(0.5, hp));
      k.osc('square', freq, k.gain(0.3, hp));
      // l'air qui passe dans la trompe
      k.noise('pink', k.bq('bandpass', 1800, 0.8, k.gain(0.12, valve)));
    }
  }
  return k.duration;
}

export function sirenePolice(k: Kit): number {
  return deuxTons(k, SIREN_SPECS.sirene_police, 0.25, 1);
}

export function sireneGendarmerie(k: Kit): number {
  return deuxTons(k, SIREN_SPECS.sirene_gendarmerie, 0.25, 1.05);
}

export function sirenePompiers(k: Kit): number {
  return deuxTons(k, SIREN_SPECS.sirene_pompiers, 0.3, 1);
}

export function sireneSamu(k: Kit): number {
  // timbre plus creux (davantage de carré) pour se distinguer de la police à l'oreille
  return deuxTons(k, SIREN_SPECS.sirene_samu, 0.7, 0.85);
}

/** Variante « hurleur » : balayage rapide 650 ↔ 1 450 Hz (signal secondaire des véhicules récents). */
export function sireneHurleur(k: Kit): number {
  const m = k.sustain(3, 0.02, 0.06);
  const horn = pavillon(k, k.gain(0.28, m), 1);
  const o = k.osc('sawtooth', 1050, horn);
  k.lfo('triangle', 3.4, 400, o.frequency);
  return k.duration;
}

/** Klaxon de voiture : deux notes simultanées à la tierce, timbre nasillard (entretenu). */
export function klaxon(k: Kit): number {
  const m = k.sustain(0.5, 0.012, 0.05);
  const lp = k.bq('lowpass', 4200, 0.7, k.gain(0.15, m));
  const pk = k.bq('peaking', 2100, 2, lp, 9);
  const hp = k.bq('highpass', 320, 0.7, pk);
  k.osc('square', 415, hp);
  k.osc('square', 522, k.gain(0.9, hp));
  k.osc('sawtooth', 416.5, k.gain(0.5, hp));
  k.osc('sawtooth', 520.6, k.gain(0.5, hp));
  return k.duration;
}

/** Moteur à régime fixe (≈ 1 500 tr/min × pitch) : pour un véhicule à l'arrêt ou un essai. */
export function moteur(k: Kit): number {
  const m = k.sustain(2.5, 0.12, 0.3);
  const g = new EngineGraph(k, m, ENGINE_PROFILES.essence);
  g.set(1500, 0.3, k.t, true);
  return k.duration;
}

/** Drone quadrirotor en vol stationnaire. */
export function drone(k: Kit): number {
  const m = k.sustain(2.5, 0.15, 0.3);
  const g = new EngineGraph(k, m, ENGINE_PROFILES.drone);
  g.set(0.55, 0.5, k.t, true);
  return k.duration;
}
