/* =====================================================================================
 * INCIDENTS — réglages et constantes par nature d'incident.
 *
 * Sources des valeurs : docs/research/00-bible-realisme.md §G.2 (blessures : « critical = décès
 * évitable si la prise en charge commence en moins de 240 s »), §G.4 (feux : un bac gagne un objet
 * voisin après 60 s et une façade après 90 s ; une voiture s'embrase en 120 à 240 s), §F.4 (tension).
 * Ce sont des valeurs de jeu : elles règlent la vitesse à laquelle un incident non traité s'aggrave.
 * ===================================================================================== */

import type { IncidentKind, IncidentMeans } from '@/core/extensions';
import type { IncidentsTuning } from './api';

export const DEFAULT_TUNING: Readonly<IncidentsTuning> = Object.freeze({
  detection: true,
  autoDispatch: true,
  radio: true,
  mergeFire: 5,
  mergeFireBig: 8,
  mergeVictims: 6,
  mergeBarricades: 6,
  mergeLooting: 12,
  groundFireConfirm: 5,
  downConfirm: 6,
  closedLinger: 12,
  assignTimeout: 150,
  isolatedFriendRange: 14,
  isolatedHostileRange: 9,
  isolatedHostiles: 4,
  isolatedConfirm: 4,
  dispatchDelay: 8,
  dispatchRangeFoot: 90,
  dispatchRangeVehicle: 400,
});

// ── familles : deux incidents ne se regroupent que dans la même famille ──
export const FAM_FIRE = 0;
export const FAM_VICTIM = 1;
export const FAM_OFFICER = 2;
export const FAM_ISOLATED = 3;
export const FAM_LOOTING = 4;
export const FAM_BARRICADE = 5;
export const FAM_MOTORIST = 6;
export const FAM_RESCUE = 7;
export const FAM_SUSPECT = 8;

export const FAMILY_OF: Readonly<Record<IncidentKind, number>> = {
  feu_poubelle: FAM_FIRE, feu_barricade: FAM_FIRE, feu_vehicule: FAM_FIRE, feu_boutique: FAM_FIRE,
  blesse: FAM_VICTIM, agent_a_terre: FAM_OFFICER, agent_isole: FAM_ISOLATED,
  pillage: FAM_LOOTING, barricade: FAM_BARRICADE, automobiliste_bloque: FAM_MOTORIST,
  secours_bloques: FAM_RESCUE, suspect: FAM_SUSPECT,
};

/** Rang d'un feu : le plus grave donne sa nature à l'incident quand plusieurs foyers sont regroupés. */
export const FIRE_RANK: Readonly<Record<string, number>> = {
  feu_poubelle: 1, feu_barricade: 2, feu_vehicule: 3, feu_boutique: 4,
};

/** Urgence de départ par nature (1 = à traiter, 2 = urgent, 3 = vital). */
export const BASE_URGENCY: Readonly<Record<IncidentKind, 1 | 2 | 3>> = {
  feu_poubelle: 1, feu_barricade: 2, feu_vehicule: 2, feu_boutique: 3,
  blesse: 2, agent_a_terre: 3, agent_isole: 3,
  pillage: 2, barricade: 1, automobiliste_bloque: 1, secours_bloques: 2, suspect: 1,
};

/** Gravité potentielle d'un feu en pleine intensité, et temps (s) pour l'atteindre s'il n'est pas combattu. */
export const FIRE_THREAT: Readonly<Record<string, number>> = {
  feu_poubelle: 0.45, feu_barricade: 0.65, feu_vehicule: 0.8, feu_boutique: 1,
};
export const FIRE_RAMP_TIME: Readonly<Record<string, number>> = {
  feu_poubelle: 150, feu_barricade: 150, feu_vehicule: 180, feu_boutique: 120,
};

/** Mesure sous laquelle un foyer est tenu pour éteint, et durée de confirmation (s). */
export const FIRE_OUT = 0.03;
export const FIRE_OUT_HOLD = 2.5;
/** Mesure en dessous de laquelle un feu de véhicule ou de boutique n'est qu'un départ de feu (extincteur suffisant). */
export const FIRE_STARTING = 0.35;
/** Une reprise de feu sur la même cible dans ce délai (s) est annoncée comme telle. */
export const REIGNITION_WINDOW = 180;

/** Blessé : délai au-delà duquel une urgence absolue non prise en charge est perdue (bible §G.2). */
export const VICTIM_GOLDEN_TIME = 240;
/** Durée sans pillage après laquelle l'incident est tenu pour terminé (s). */
export const LOOTING_QUIET = 30;
/** Automobiliste : roule de nouveau depuis ce temps (s) = libéré. */
export const MOTORIST_FREE = 4;
/** Agent isolé : la condition a cessé depuis ce temps (s) = il a rejoint son unité. */
export const ISOLATED_CLEAR = 6;
/** Les secours sont à l'arrêt depuis ce temps (s) avant qu'un incident « secours bloqués » soit ouvert. */
export const RESCUE_WAIT_BEFORE_INCIDENT = 5;

/** Une unité affectée est « sur place » quand un de ses agents est à moins de cette distance (m). */
export const ON_SITE_RANGE = 9;
/** Le joueur est « sur place » à moins de cette distance (m). */
export const PLAYER_ON_SITE = 12;
/** Une preuve de traitement (arrosage, soin) vaut pendant ce temps (s). */
export const TOUCH_MEMORY = 8;

/** Intervalle minimal entre deux annonces radio du module (s). */
export const RADIO_GAP = 3.5;
/** Hausse de gravité qui fait dire qu'un incident s'est aggravé. */
export const AGGRAVATION_STEP = 0.25;

/** Moyens admis par nature d'incident (réalisme des moyens, BRIEF §1). */
export const MEANS_ALLOWED: Readonly<Record<IncidentKind, readonly IncidentMeans[]>> = {
  feu_poubelle: ['unite', 'canon_eau', 'pompiers', 'joueur'],
  feu_barricade: ['canon_eau', 'pompiers', 'unite', 'joueur'],
  // un extincteur ne suffit pas pour un véhicule embrasé ou une boutique : « unite » n'est admis que pour un départ de feu
  feu_vehicule: ['pompiers', 'canon_eau', 'unite', 'joueur'],
  feu_boutique: ['pompiers', 'canon_eau', 'unite', 'joueur'],
  blesse: ['samu', 'unite', 'pompiers', 'bravm', 'joueur'],
  agent_a_terre: ['unite', 'samu', 'centaure', 'pompiers', 'bravm', 'joueur'],
  agent_isole: ['unite', 'bravm', 'centaure', 'joueur'],
  pillage: ['bravm', 'unite', 'joueur'],
  barricade: ['centaure', 'unite', 'canon_eau', 'joueur'],
  automobiliste_bloque: ['unite', 'bravm', 'joueur'],
  secours_bloques: ['unite', 'centaure', 'bravm', 'joueur'],
  suspect: ['bravm', 'unite', 'joueur'],
};
