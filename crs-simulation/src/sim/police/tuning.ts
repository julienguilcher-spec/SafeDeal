/* =====================================================================================
 * FORCES DE L'ORDRE — constantes de réglage.
 *
 * Sources : docs/research/00-bible-realisme.md §E.8 (géométrie et allures des formations), §E.2
 * (front tenu), §A (cadre d'emploi de la force), §B (portées et cadences du matériel), §G (gaz,
 * secours), §H.1 (interpellation) ; docs/research/06-roles-jouables.md §2.5 (procédures pas à pas).
 * La géométrie réglementaire n'est pas publiée : ces valeurs sont des valeurs de jeu (estimé).
 * ===================================================================================== */

import type { PoliceTuning } from './api';

// ───────────────────────────── géométrie des formations ─────────────────────────────

/** Intervalle visé entre deux boucliers (m) : « boucliers jointifs, ≈ 1 m » (0,7 serré … 1,0 lâche, §E.2). */
export const SHIELD_SPACING = 0.9;
/** Coude à coude : en deçà, la locomotion écarte les agents (0,56 m de contact + 0,10 m de confort). */
export const SPACING_MIN = 0.68;
/** Au-delà de cet intervalle, des agents du second rang montent au premier pour barrer le front. */
export const SPACING_PROMOTE = 1.2;
/** Intervalle maximal d'une ligne lâche (m) : au-delà, le front demandé n'est pas entièrement tenu. */
export const SPACING_MAX = 2.4;
/** Marge laissée entre l'agent de flanc et la façade (m). */
export const WALL_MARGIN = 0.45;
/** Portée des rayons lancés vers les façades pour mesurer la largeur réelle d'une rue (m). */
export const STREET_PROBE = 32;
/** Second rang (lanceurs, LBD, extincteur, chefs de groupe, interpellateurs) : 2 m derrière les boucliers. */
export const RANK2_BACK = 2.0;
/** Chef de section : 5 m derrière le premier rang (§E.8 : 5 à 8 m). */
export const RANK3_BACK = 5.0;
/** Commandement de la compagnie : 8 m derrière. */
export const RANK4_BACK = 8.0;
/** Colonne : files espacées de 0,8 m, rangs tous les 1,2 m (§E.8). */
export const COLUMN_FILE = 0.8;
export const COLUMN_RANK = 1.2;
/** Tortue : deux rangs serrés. */
export const TORTUE_SPACING = 0.68;
export const TORTUE_RANK = 0.8;
/** Écran de protection : rayon minimal autour de la cible (m). */
export const SCREEN_RADIUS_MIN = 3;
/** Escorte : les files marchent à cette distance du flanc de l'élément escorté (m). */
export const ESCORT_SIDE = 1.6;
/** Largeur de la « porte » ouverte dans la ligne pour un binôme d'interpellation (m, §H.1). */
export const DOOR_WIDTH = 1.5;
/** Porte d'un barrage filtrant (m). */
export const FILTER_DOOR = 2.0;

// ───────────────────────────── allures et délais ─────────────────────────────

/** Pas cadencé, trot du bond offensif, charge (§E.8, §F.3), tortue, recul face à la foule (m/s). */
export const SPEED_PACE = 1.2;
export const SPEED_TROT = 2.3;
export const SPEED_CHARGE = 4.0;
export const SPEED_TORTUE = 0.6;
export const SPEED_REPLI = 0.9;
/** Mise en place : allure maximale d'un agent qui rejoint son emplacement (m/s). */
export const SPEED_JOIN = 2.6;
/** Accélération et freinage du repère d'une formation (m/s²) : départ franc, « arrêt net » (§E.8 : arrêt en 1 s). */
export const FRAME_ACCEL = 1.6;
export const FRAME_DECEL = 3.2;
/** Vitesse de pivotement maximale d'une ligne (rad/s) et vitesse maximale d'un flanc pendant la conversion (m/s). */
export const FRAME_TURN = 0.6;
export const FLANK_SPEED = 1.1;
/** Bond offensif : « ruée courte de 15 à 25 m » ; charge : 30 à 60 m ; refoulement : tronçons de 50 m, 10 s d'arrêt. */
export const BOND_MIN = 15;
export const BOND_MAX = 25;
export const BOND_DEFAULT = 20;
export const CHARGE_MIN = 30;
export const CHARGE_MAX = 60;
export const CHARGE_DEFAULT = 40;
export const WAVE_LEG = 50;
export const WAVE_PAUSE = 10;
/** Réalignement après un bond (s) avant le compte rendu. */
export const REALIGN_TIME = 2.5;
/** Écart toléré à l'emplacement pour déclarer la formation « en place » (m, §E.8 : 0,3). */
export const IN_PLACE_TOLERANCE = 0.3;
/** Délai au-delà duquel une mise en place est déclarée faite même si un agent manque (s). */
export const FORM_TIMEOUT = 25;
/** Relève : la section fraîche s'aligne 10 m derrière ; la section relevée se replie de 30 m. */
export const RELIEF_BEHIND = 10;
export const RELIEF_WITHDRAW = 30;
/** Débarquement : un agent sort toutes les 0,6 s par véhicule (groupe dehors en moins de 10 s). */
export const EXIT_INTERVAL = 0.6;
/** Distance à laquelle on monte à bord (m). */
export const BOARD_REACH = 2.6;

// ───────────────────────────── pilotage individuel ─────────────────────────────

/** Gain de rappel vers l'emplacement (1/s) et freinage de référence à l'approche (m/s²). */
export const STEER_GAIN = 3.2;
export const STEER_BRAKE = 4.5;
/** Zone morte à l'arrêt (m) : en deçà, l'agent ne bouge plus. */
export const STEER_DEAD = 0.035;
/** Distance au-delà de laquelle l'agent marche vers son emplacement en regardant devant lui (m). */
export const FACE_MOVE_FROM = 3.5;
/** Période de réflexion d'un agent (s), près et loin du joueur ; d'une unité. */
export const THINK_AGENT = 0.25;
export const THINK_AGENT_FAR = 0.5;
export const THINK_UNIT = 0.4;
export const FAR_DISTANCE = 90;
/** Agent bloqué : vitesse (m/s) et durée (s) qui déclenchent un contournement (§E.8 : jamais bloqué plus de 3 s). */
export const STUCK_SPEED = 0.25;
export const STUCK_TIME = 1.6;
/** Laisser passer : délai de piétinement avant de demander le passage (s), écart ouvert de chaque côté (m), portée latérale (m), durée (s). */
export const WAY_TIME = 0.45;
export const WAY_HALF = 0.6;
export const WAY_REACH = 3;
export const WAY_HOLD = 3;
/** Intervalle minimal entre deux calculs d'itinéraire d'un même agent (s). */
export const REPATH_INTERVAL = 2.0;

// ───────────────────────────── perception et emploi de la force ─────────────────────────────

/** Rayon de perception d'une unité autour de sa formation (m). */
export const SENSE_RADIUS = 60;
/** Une violence reste « actuelle » pendant cette durée (s) — aligné sur le module de droit (threatWindow). */
export const VIOLENT_WINDOW = 10;
/** Mémoire d'un flagrant délit pour une interpellation d'initiative (s). */
export const FLAGRANT_WINDOW = 45;
/** Projectiles reçus en 10 s (ou un agent blessé) qui déclenchent la riposte au gaz. */
export const RIPOSTE_PROJECTILES = 3;
/** Délai entre l'avertissement à la foule et la première grenade (s), puis entre deux salves. */
export const WARNING_DELAY = 2.5;
export const VOLLEY_INTERVAL = 14;
/** Portées (m) : grenade à main, lanceur de 56 mm, LBD, gazeuse, bâton, extincteur. */
export const HAND_GRENADE_MIN = 8;
export const HAND_GRENADE_MAX = 28;
export const LAUNCHER_MIN = 36;
export const LAUNCHER_MAX = 190;
export const LBD_MIN = 11;
export const LBD_MAX = 45;
export const GAZEUSE_RANGE = 3.6;
export const BATON_RANGE = 1.25;
export const EXTINGUISH_RANGE = 2.4;
/** Hauteur visée par le LBD en fraction de la taille de la cible (bassin : jamais au-dessus des épaules). */
export const LBD_AIM_ZONE = 0.5;
/** Vitesse de la cible au-delà de laquelle le tir de LBD est retenu (m/s) : cible fixe ou lente. */
export const LBD_TARGET_SPEED = 2.2;
/** Distance minimale entre le point de chute du gaz et nos lignes (m). */
export const GAS_SAFE_DISTANCE = 12;
/** Vent à partir duquel le sens du vent décide du point de chute (m/s). */
export const WIND_MATTERS = 0.8;
/** Concentration de gaz qui fait mettre le masque ; durée d'air pur avant de le retirer (s). */
export const MASK_ON_GAS = 0.06;
export const MASK_OFF_DELAY = 60;
/** Mise en place du masque (s, §B) avec un décalage individuel. */
export const MASK_DON_TIME = 8;
/** Encerclement réel (désencerclement) : hostiles à moins de 10 m, dans trois quadrants au moins. */
export const SURROUNDED_RADIUS = 10;
export const SURROUNDED_COUNT = 6;
/** Bouclier levé après une alerte projectile (s). */
export const SHIELD_ALERT_TIME = 3.5;
/** Tortue réflexe sous les mortiers d'artifice : nombre de tirs en 6 s. */
export const MORTAR_VOLLEY = 2;
/** Zone à évacuer autour d'un engin incendiaire (m). */
export const FIRE_CLEARANCE = 3.2;

// ───────────────────────────── tâches détachées ─────────────────────────────

/** Durée maximale hors de la ligne avant l'abandon d'une saisie (s) ; distance maximale à la ligne (m). */
export const ARREST_OUT_TIME = 30;
export const ARREST_MAX_RANGE = 45;
/** Portée de saisie (m) : en deçà de la portée du module de droit (2 m). */
export const ARREST_REACH = 1.5;
/** Hostiles autour de la cible au-delà desquels le binôme ne sort pas d'initiative. */
export const ARREST_CROWD_LIMIT = 4;
/** Secours : distance derrière le premier rang où l'on dépose un blessé (m). */
export const RESCUE_DROP_BACK = 7;
export const RESCUE_TIMEOUT = 75;
/** Ravitaillement au fourgon (s), agents simultanément hors du rang. */
export const RESUPPLY_TIME = 3;
export const RESUPPLY_PARALLEL = 3;
/** Opérations simultanées par unité. */
export const OPS_MAX = 4;

// ───────────────────────────── fatigue et moral ─────────────────────────────

/** Fatigue : part gagnée par seconde au repos tenu, sous pression ; récupération au repos (bible §E.8 : 120 s). */
export const FATIGUE_HOLD_TIME = 3600;
export const FATIGUE_REST_TIME = 120;
/** En dessous de cette part de valides, la relève est demandée (docs/research/06 §2.8 : 60 %). */
export const RELIEF_VALID_RATIO = 0.6;
export const RELIEF_REPEAT = 120;
/** Pertes au-delà desquelles l'unité se désordonne (§E.8 : 25 %), et temps pour se reformer (10 s). */
export const DISORDER_LOSSES = 0.25;
export const DISORDER_RECOVER = 10;
export const DISORDER_SPREAD = 1.3;

// ───────────────────────────── dotations (bible §B, quantités de jeu) ─────────────────────────────

/** Réserve d'un fourgon de groupe et du véhicule de commandement. */
export const RESERVE_FOURGON = { lacrymoMain: 12, lacrymoLanceur: 16, gm2l: 4, lbd: 12, desencerclement: 2, extincteur: 30, gazeuse: 14, menottes: 12 };
export const RESERVE_NONE = { lacrymoMain: 0, lacrymoLanceur: 0, gm2l: 0, lbd: 0, desencerclement: 0, extincteur: 0, gazeuse: 0, menottes: 0 };

export function defaultTuning(): PoliceTuning {
  return {
    shieldSpacing: SHIELD_SPACING,
    secondRank: RANK2_BACK,
    pace: SPEED_PACE,
    trot: SPEED_TROT,
    charge: SPEED_CHARGE,
    tortue: SPEED_TORTUE,
    repli: SPEED_REPLI,
    autoArrest: true,
    autoArrestRange: 18,
    autoRiposte: true,
    autoRescue: true,
    fatigueTime: 600,
    reliefAt: 0.7,
    reactionMin: 0.15,
    reactionMax: 0.7,
  };
}
