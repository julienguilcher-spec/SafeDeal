/* =====================================================================================
 * SECOURS — réglages par défaut.
 *
 * Sources : docs/research/00-bible-realisme.md §G.3 (les secours n'entrent en zone dangereuse que sous
 * protection ; un bilan transmis fait venir une équipe en 60 à 120 s ; couloir de 3,5 m ; point de
 * rassemblement des victimes à 100–200 m derrière le dispositif), §G.4 (pompiers : voiture éteinte en
 * 20 à 30 s, scooter 15 s), table C (engin-pompe : 6 sapeurs, lance de 25 m à 8 l/s, cuve 3 000 l ;
 * ambulance : équipage de 3) ; docs/research/06-roles-jouables.md §10. Valeurs de jeu.
 * ===================================================================================== */

import type { RescueTuning } from './api';

export const DEFAULT_TUNING: Readonly<RescueTuning> = Object.freeze({
  dispatchMin: 18,
  dispatchMax: 32,
  delayScale: 1,
  originDistance: 520,
  standoff: 55,
  workDistanceFire: 16,
  workDistanceCare: 9,
  hoseRate: 2,
  hoseFlow: 8,
  hoseSetup: 10,
  pompiersCrew: 6,
  samuCrew: 3,
  maxPompiers: 2,
  maxSamu: 2,
  unsafeTension: 0.6,
  unsafeHostiles: 4,
  unsafeGas: 0.4,
  retreatWhenAttacked: true,
});

/** Allure prise pour estimer le temps de trajet : engin en intervention urgente en ville, équipe à pied (m/s). */
export const ETA_SPEED_VEHICLE = 9;
export const ETA_SPEED_FOOT = 2.6;
/** Vitesse de croisière demandée au pilote automatique (m/s) : 40 km/h en intervention, 30 km/h au retour. */
export const CRUISE_URGENT = 11;
export const CRUISE_RETURN = 8;

/** Rayon de travail autour du point d'appel : foyers et victimes pris en compte (m). */
export const WORK_RADIUS = 28;
/** Distance d'attaque d'un foyer à la lance (m) ; plus loin pour un véhicule (risque d'explosion). */
export const HOSE_STAND = 9;
export const HOSE_STAND_VEHICLE = 12;
/** Portée maximale de la lance (m). */
export const HOSE_RANGE = 25;
/** Rayon arrosé (m). */
export const HOSE_SPLASH = 1.5;
/** Longueur d'établissement : la lance ne s'éloigne pas de plus de cela de l'engin (m). */
export const HOSE_LENGTH = 70;
/** Bouche d'incendie utilisable à moins de cette distance de l'engin (m), et débit d'alimentation (l/s). */
export const HYDRANT_RANGE = 80;
export const HYDRANT_FLOW = 15;

/** Sans foyer depuis ce temps (s), le feu est tenu pour éteint (surveillance des points chauds). */
export const FIRE_WATCH = 6;
/** Rangement du matériel avant de repartir (s). */
export const PACK_TIME = 6;
/** Sans victime trouvée sur place après ce temps (s), l'équipe médicale repart. */
export const NO_VICTIM_LEAVE = 12;
/** Une équipe ne reste pas plus longtemps auprès d'une victime en attendant l'ambulance (s). */
export const STAY_WITH_VICTIM = 150;

/** Mémoire des projectiles hostiles pour l'évaluation de la sécurité (s) et rayon pris en compte (m). */
export const THREAT_MEMORY = 12;
export const THREAT_RADIUS = 30;
/** Durée du repli après une prise à partie (s). */
export const RETREAT_TIME = 20;
/** Rayon dans lequel une unité qui « protège » couvre la zone ou l'équipage (m). */
export const PROTECT_RANGE = 45;
/** Zone tenue de fait : nombre d'agents dans ce rayon, sans hostile au contact. */
export const HELD_POLICE = 6;
export const HELD_RANGE = 25;

/** L'engin est bloqué sur son itinéraire depuis ce temps (s) : l'appel passe « en attente ». */
export const BLOCKED_PATIENCE = 6;
/** Bloqué à moins de cette distance du but sur une zone sûre : l'équipage finit à pied (m). */
export const DISMOUNT_RANGE = 140;

/** Un appel terminé reste dans la liste publiée pendant ce temps (s). */
export const CALL_LINGER = 30;
/** Deux appels du même service à moins de cette distance désignent la même intervention (m). */
export const SAME_CALL_RANGE = 25;

/** Durées des gestes (bible §G.3, dossier 06 §10.3). */
export const BILAN_TIME = 5;
export const CARE_LIGHT = 8;
export const CARE_SERIOUS = 12;
export const CARE_CRITICAL = 15;
export const RINSE_TIME = 6;
export const HANDOVER_TIME = 4;
export const LOAD_TIME = 5;
/** Portée d'un geste de soin (m). */
export const CARE_REACH = 1.7;
/** Seuil d'exposition au gaz qui justifie un rinçage. */
export const RINSE_MIN_GAS = 0.12;
/** Un rinçage n'est pas répété avant ce délai (s). */
export const RINSE_AGAIN = 30;
