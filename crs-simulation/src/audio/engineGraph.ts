/* =====================================================================================
 * Graphe de synthèse d'un moteur piloté en continu (régime, charge).
 *
 *   - thermique : la fréquence d'allumage (régime / 60 × cylindres / 2) porte une dent de scie,
 *     son octave (carré) et l'ordre ½ (irrégularité des cylindres, très présent au ralenti) ;
 *     saturation, passe-bas qui s'ouvre avec le régime et la charge ; bruit d'admission et
 *     d'échappement ; claquement haché à la fréquence d'allumage pour les diesels ;
 *   - électrique (drone) : quatre hélices légèrement désaccordées, timbre nasillard ;
 *   - rotor (hélicoptère) : bruit grave haché par le passage des pales + sifflement de turbine.
 * ===================================================================================== */

import type { VehicleKind } from '@/core/contracts';
import type { Kit } from './kit';

export interface EngineProfile {
  type: 'thermique' | 'electrique' | 'rotor';
  cylinders: number;
  /** Régime de ralenti et régime maximal (tr/min). */
  idle: number;
  redline: number;
  /** 0..1 : claquement diesel. */
  clatter: number;
  /** Brillance du timbre (1 = voiture essence). */
  tone: number;
  /** 0..1 : poids de l'ordre ½ (moteur « qui boite »). */
  rough: number;
  level: number;
}

const ESSENCE: EngineProfile = { type: 'thermique', cylinders: 4, idle: 850, redline: 6200, clatter: 0, tone: 1, rough: 0.35, level: 1 };
const DIESEL: EngineProfile = { type: 'thermique', cylinders: 4, idle: 780, redline: 4300, clatter: 0.5, tone: 0.8, rough: 0.45, level: 1 };
const POIDS_LOURD: EngineProfile = { type: 'thermique', cylinders: 6, idle: 600, redline: 2500, clatter: 0.65, tone: 0.7, rough: 0.5, level: 1.15 };
const MOTO: EngineProfile = { type: 'thermique', cylinders: 2, idle: 1150, redline: 8500, clatter: 0, tone: 1.5, rough: 0.6, level: 1 };
const SCOOTER: EngineProfile = { type: 'thermique', cylinders: 1, idle: 1700, redline: 8500, clatter: 0, tone: 1.7, rough: 0.25, level: 0.8 };
const DRONE: EngineProfile = { type: 'electrique', cylinders: 4, idle: 3000, redline: 9000, clatter: 0, tone: 1, rough: 0, level: 0.8 };
const HELICO: EngineProfile = { type: 'rotor', cylinders: 4, idle: 250, redline: 400, clatter: 0, tone: 1, rough: 0, level: 1.2 };

export const ENGINE_PROFILES = { essence: ESSENCE, diesel: DIESEL, poids_lourd: POIDS_LOURD, moto: MOTO, scooter: SCOOTER, drone: DRONE, helico: HELICO } as const;

/** Profil de moteur d'après le type de véhicule du contrat. */
export function engineProfileFor(kind: VehicleKind): EngineProfile {
  switch (kind) {
    case 'moto_bravm': return MOTO;
    case 'scooter': return SCOOTER;
    case 'drone': return DRONE;
    case 'helicoptere': return HELICO;
    case 'fourgon_crs': case 'fourgon_cellulaire': case 'utilitaire': case 'ambulance': case 'vl_commandement':
      return DIESEL;
    case 'car_crs': case 'centaure': case 'canon_eau': case 'camion_pompiers': case 'camion': case 'bus': case 'camion_sono':
      return POIDS_LOURD;
    default: return ESSENCE;
  }
}

/**
 * Convertit le régime reçu en tr/min réels : une valeur ≤ 1,5 est comprise comme un régime
 * normalisé (0 = ralenti, 1 = régime maximal), sinon comme des tours par minute.
 */
export function resolveRpm(rpm: number, p: EngineProfile): number {
  if (!(rpm >= 0)) return p.idle;
  const v = rpm <= 1.5 ? p.idle + (p.redline - p.idle) * Math.min(1, rpm) : rpm;
  return v < p.idle * 0.5 ? p.idle * 0.5 : v > p.redline * 1.1 ? p.redline * 1.1 : v;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export class EngineGraph {
  private readonly p: EngineProfile;
  private readonly oscs: OscillatorNode[] = [];
  private readonly ratios: number[] = [];
  private lp: BiquadFilterNode | null = null;
  private nbp: BiquadFilterNode | null = null;
  private amp: GainNode;
  private noiseGain: GainNode | null = null;
  private halfGain: GainNode | null = null;
  private clatterGain: GainNode | null = null;
  private pulseOsc: OscillatorNode | null = null;

  constructor(k: Kit, to: AudioNode, profile: EngineProfile) {
    this.p = profile;
    this.amp = k.gain(0, to);
    if (profile.type === 'thermique') this.buildThermal(k, to);
    else if (profile.type === 'electrique') this.buildElectric(k, to);
    else this.buildRotor(k, to);
  }

  private add(o: OscillatorNode, ratio: number): void {
    this.oscs.push(o);
    this.ratios.push(ratio);
  }

  private buildThermal(k: Kit, to: AudioNode): void {
    const p = this.p;
    // caisse de résonance : légère bosse dans le grave
    const body = k.bq('peaking', 115, 1, this.amp, 5);
    this.lp = k.bq('lowpass', 600, 0.9, body);
    const sat = k.sat(2.2, this.lp);
    const sum = k.gain(1, sat);
    this.add(k.osc('sawtooth', 30, k.gain(0.55, sum)), 1);
    this.halfGain = k.gain(p.rough, sum);
    this.add(k.osc('sawtooth', 15, this.halfGain), 0.5);
    this.add(k.osc('square', 60, k.gain(0.16, sum)), 2.006);
    // admission / échappement
    this.noiseGain = k.gain(0, to);
    this.nbp = k.bq('bandpass', 600, 0.8, this.noiseGain);
    k.noise('pink', this.nbp);
    // claquement diesel : bruit aigu haché à la fréquence d'allumage
    if (p.clatter > 0) {
      this.clatterGain = k.gain(0, to);
      const gate = k.gain(0, this.clatterGain);
      const bp = k.bq('bandpass', 2600, 0.9, gate);
      k.noise('white', k.bq('highpass', 1400, 0.7, bp));
      this.pulseOsc = k.pulse(30, 0.3, gate.gain);
    }
    // le ralenti n'est jamais parfaitement stable
    for (let i = 0; i < this.oscs.length; i++) k.lfo('sine', 5.3, 9, this.oscs[i]!.detune);
  }

  private buildElectric(k: Kit, to: AudioNode): void {
    const hp = k.bq('highpass', 220, 0.7, this.amp);
    const bp = k.bq('peaking', 1900, 0.8, hp, 9);
    const mix = k.gain(0.3, bp);
    const spread = [1, 1.013, 0.987, 1.031];
    for (let i = 0; i < 4; i++) this.add(k.osc('sawtooth', 200, mix), spread[i]!);
    this.noiseGain = k.gain(0, to);
    k.noise('white', k.bq('highpass', 3500, 0.7, this.noiseGain));
    // les hélices ne tournent jamais exactement au même régime : battements lents
    for (let i = 0; i < 4; i++) k.lfo('sine', 0.9 + 0.37 * i, 12, this.oscs[i]!.detune);
  }

  private buildRotor(k: Kit, to: AudioNode): void {
    // pales : bruit grave haché
    const gate = k.gain(0.25, this.amp);
    const lp = k.bq('lowpass', 420, 0.7, gate);
    k.noise('brown', lp);
    k.noise('pink', k.gain(0.5, lp));
    this.pulseOsc = k.pulse(18, 0.4, gate.gain);
    // turbine
    this.noiseGain = k.gain(0, to);
    k.noise('white', k.bq('bandpass', 5200, 1.5, this.noiseGain));
    this.add(k.osc('sine', 2400, k.gain(0.05, this.amp)), 1);
  }

  /**
   * Applique un régime (tr/min réels ou normalisé, voir resolveRpm) et une charge 0..1.
   * `immediate` : sans transition (à la création du graphe).
   */
  set(rpmIn: number, loadIn: number, when: number, immediate = false): void {
    const p = this.p;
    const rpm = resolveRpm(rpmIn, p);
    const load = clamp(loadIn, 0, 1);
    const n = clamp((rpm - p.idle) / (p.redline - p.idle), 0, 1);
    const tau = immediate ? 0 : 0.07;
    const set = (param: AudioParam, v: number): void => {
      if (tau === 0) param.setValueAtTime(v, when);
      else param.setTargetAtTime(v, when, tau);
    };
    if (p.type === 'thermique') {
      const f = (rpm / 60) * (p.cylinders / 2);
      for (let i = 0; i < this.oscs.length; i++) set(this.oscs[i]!.frequency, f * this.ratios[i]!);
      set(this.lp!.frequency, clamp((170 + rpm * 0.42 * (0.55 + 0.75 * load)) * p.tone, 120, 6500));
      set(this.amp.gain, p.level * (0.34 + 0.3 * n + 0.36 * load));
      set(this.halfGain!.gain, p.rough * (1 - 0.65 * n));
      set(this.nbp!.frequency, clamp(f * 6, 250, 2600));
      set(this.noiseGain!.gain, p.level * (0.03 + 0.09 * n + 0.13 * load));
      if (this.pulseOsc && this.clatterGain) {
        set(this.pulseOsc.frequency, f);
        set(this.clatterGain.gain, p.level * p.clatter * (0.38 - 0.22 * n));
      }
    } else if (p.type === 'electrique') {
      const f = 125 + 235 * n;
      for (let i = 0; i < this.oscs.length; i++) set(this.oscs[i]!.frequency, f * this.ratios[i]!);
      set(this.amp.gain, p.level * (0.45 + 0.35 * n + 0.2 * load));
      set(this.noiseGain!.gain, p.level * (0.02 + 0.05 * n));
    } else {
      set(this.pulseOsc!.frequency, 13 + 9 * n);
      set(this.oscs[0]!.frequency, 2100 + 700 * n);
      set(this.amp.gain, p.level * (0.6 + 0.4 * load));
      set(this.noiseGain!.gain, p.level * (0.04 + 0.05 * n));
    }
  }
}
