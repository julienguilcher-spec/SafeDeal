/* =====================================================================================
 * MÉDECINS DE RUE — réglages par défaut.
 * Sources : docs/research/06-roles-jouables.md §10.1, §10.3, §10.4 (gestes, barème) ;
 * docs/research/03-dynamique-manifestation.md §6.3, §6.4 ; bible §G.1 (gaz) et §G.3 (abri à 30–80 m).
 * ===================================================================================== */

import type { MedicsTuning } from './api';

export const DEFAULT_TUNING: Readonly<MedicsTuning> = Object.freeze({
  sightRange: 35,
  hearRange: 80,
  gasThreshold: 0.2,
  selfGasLimit: 0.55,
  waitForSamu: 180,
  followBack: 35,
});

/** Barème du joueur médecin (dossier 06 §10.4). */
export const PTS_RINSE = 3;
export const PTS_STABILISE = 8;
export const PTS_HANDOVER = 10;
export const PTS_TRANSMIT = 5;
export const PTS_TRIAGE_ERROR = -10;
export const PTS_ABANDON = -20;
export const PTS_EMPTY_BAG = -5;

/** Un blessé connu, sans soins après ce délai (s), alors que le joueur s'est éloigné : abandon. */
export const ABANDON_AFTER = 90;
export const ABANDON_DISTANCE = 40;
/** Rayon du tableau de tri du joueur (m). */
export const BOARD_RANGE = 45;
export const BOARD_MAX = 24;
/** Un appel « Médic ! » reste valable ce temps (s). */
export const HELP_MEMORY = 60;
