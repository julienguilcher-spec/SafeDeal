/* =====================================================================================
 * Droit — réglages. Sources : docs/research/00-bible-realisme.md (A.3, A.5, B) et
 * docs/research/01-doctrine-cadre-legal.md (§1.5, §1.6, §3). Aucun délai chiffré n'existe dans
 * les textes : les délais sont des valeurs de jeu, compressées selon la durée de la mission.
 * ===================================================================================== */

import type { DurationPreset, ForceLevel, ForceMeans, SessionConfig } from '@/core/contracts';
import type { LawConfig } from './api';

interface DelaySet {
  annonce: number;
  sommation: number;
  force: number;
  armes: number;
}

/** Table A.5 de la bible : intervalles minimaux par durée de mission (s). */
const DELAYS: Record<DurationPreset, DelaySet> = {
  courte: { annonce: 15, sommation: 15, force: 10, armes: 5 },
  standard: { annonce: 30, sommation: 30, force: 20, armes: 10 },
  longue: { annonce: 60, sommation: 60, force: 40, armes: 20 },
  temps_reel: { annonce: 120, sommation: 120, force: 60, armes: 30 },
};

export function createLawConfig(): LawConfig {
  return {
    delayAnnonce: DELAYS.standard.annonce,
    delaySommation: DELAYS.standard.sommation,
    delayForce: DELAYS.standard.force,
    delayArmes: DELAYS.standard.armes,
    megaphoneRange: 60,
    vehicleSpeakerRange: 150,
    voiceRange: 15,
    flareRange: 300,
    sequenceRadius: 150,
    attroupementStay: 8,
    dispersedRatio: 0.05,
    dispersedMin: 2,
    cessationGrace: 20,
    sequenceEndDelay: 45,

    attackMemory: 30,
    riposteRadius: 60,
    projectileNearRadius: 15,

    witnessRange: 45,
    minVisibility: 0.3,
    pressRange: 30,
    phoneRange: 20,
    bodycamRange: 15,
    droneRange: 150,

    threatWindow: 15,
    lbdMinRange: 10,
    lbdMaxRange: 50,
    headZone: 0.86,
    areaRadius: 12,

    reach: 2,
    cuffTime: 4,
    searchTime: 3,
    escortTime: 1.2,
    handoverTime: 3,
    releaseTime: 1.5,
    controlTime: 5,
    handoverPointRadius: 6,
    handoverVehicleRange: 5,
    // fourgon cellulaire : on y fait monter l'interpellé par la porte arrière, le véhicule garé en retrait (plan §5.3)
    handoverCellularRange: 12,
  };
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Applique à `cfg` les délais de la durée de mission choisie, puis les surcharges éventuelles de
 * la configuration de session : `extra['law.delayScale']` (multiplicateur) et `extra['law.delays']`
 * ({ annonce, sommation, force, armes } en secondes). Les autres réglages retrouvent leur défaut.
 */
export function applySessionConfig(cfg: LawConfig, session: SessionConfig | null): void {
  Object.assign(cfg, createLawConfig());
  const d = DELAYS[session ? session.duration : 'standard'] ?? DELAYS.standard;
  let scale = 1;
  const extra = session && session.extra ? session.extra : null;
  if (extra) {
    const s = positive(extra['law.delayScale']);
    if (s !== null) scale = s;
  }
  cfg.delayAnnonce = d.annonce * scale;
  cfg.delaySommation = d.sommation * scale;
  cfg.delayForce = d.force * scale;
  cfg.delayArmes = d.armes * scale;
  const custom = extra ? extra['law.delays'] : null;
  if (custom && typeof custom === 'object') {
    const c = custom as Record<string, unknown>;
    const a = positive(c['annonce']);
    const s = positive(c['sommation']);
    const f = positive(c['force']);
    const w = positive(c['armes']);
    if (a !== null) cfg.delayAnnonce = a;
    if (s !== null) cfg.delaySommation = s;
    if (f !== null) cfg.delayForce = f;
    if (w !== null) cfg.delayArmes = w;
  }
}

// ───────────────────────────── constantes internes ─────────────────────────────

/** Niveaux de la gradation (contrat ForceLevel) atteints par chaque cadre juridique. */
export const LEVEL_CONTACT: ForceLevel = 1;
/** Emploi de la force après les deux sommations : bâton, aérosol, lacrymogènes à main, engin lanceur d'eau. */
export const LEVEL_FORCE: ForceLevel = 3;
/** Usage des armes après réitération, ou riposte directe : lanceurs, grenades assourdissantes, désencerclement. */
export const LEVEL_ARMS: ForceLevel = 4;
/** Riposte immédiate permise sans ordre : jusqu'aux lacrymogènes à main. */
export const LEVEL_RIPOSTE_AUTO: ForceLevel = 3;

/** Moyens dirigés contre une personne précise (par opposition aux moyens de zone). */
export const INDIVIDUAL_MEANS: Readonly<Record<ForceMeans, boolean>> = {
  presence: false, contact: true, baton: true, gazeuse: true, lacrymo: false, canon_eau: false,
  gm2l: false, desencerclement: false, lbd: true, arme_feu: true, vehicule: false,
};

/** Fenêtre de fusion de deux déclarations identiques (même agent, même moyen, même cible), en secondes. */
export const MERGE_WINDOW: Readonly<Record<ForceMeans, number>> = {
  presence: 30, contact: 2, baton: 0.25, gazeuse: 1.5, lacrymo: 0.3, canon_eau: 1.5,
  gm2l: 0.3, desencerclement: 0.3, lbd: 0.3, arme_feu: 0.15, vehicule: 2,
};

/** Durée pendant laquelle une blessure infligée est rattachée à une déclaration d'emploi de la force (s). */
export const HURT_LINK_WINDOW: Readonly<Record<ForceMeans, number>> = {
  presence: 0, contact: 2, baton: 1.5, gazeuse: 3, lacrymo: 0, canon_eau: 0,
  gm2l: 0, desencerclement: 0, lbd: 3, arme_feu: 2, vehicule: 2,
};

/** Nombre maximal d'entrées du journal de la force avant purge des plus anciennes. */
export const FORCE_LOG_MAX = 4000;
export const FORCE_LOG_TRIM = 1000;
/** Nombre maximal d'infractions conservées par personne. */
export const OFFENSES_MAX = 24;
/** Deux infractions du même type par la même personne dans cet intervalle n'en font qu'une (s). */
export const OFFENSE_MERGE_WINDOW = 2;
/** Taille de la mémoire des violences contre les forces et des prises de vue. */
export const ATTACK_RING = 32;
export const SHOT_RING = 16;
/** Taille de la mémoire des infractions récentes (constat de l'attroupement). */
export const TROUBLE_RING = 48;
/** Constat de l'attroupement : nombre d'infractions vues, fenêtre (s) et rayon (m) — bible A.3.3. */
export const TROUBLE_COUNT = 3;
export const TROUBLE_WINDOW = 60;
export const TROUBLE_RADIUS = 100;
/** Angle minimal d'un tir au lanceur de grenades : en dessous, c'est un tir tendu (rad). */
export const FLAT_SHOT_ANGLE = (20 * Math.PI) / 180;
/** Vitesse d'un véhicule au-delà de laquelle un choc avec une personne est un emploi du véhicule contre elle (m/s). */
export const VEHICLE_HIT_SPEED = 2;
/** Taille en dessous de laquelle une personne est manifestement un enfant (m). */
export const CHILD_HEIGHT = 1.5;
/** Vitesse de fuite caractérisée (m/s). */
export const FLEE_SPEED = 2.2;
