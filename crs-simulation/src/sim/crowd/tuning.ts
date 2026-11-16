/* =====================================================================================
 * FOULE — constantes de réglage (toutes les valeurs de jeu du module sont ici).
 *
 * Sources : docs/research/00-bible-realisme.md §F (modèle de foule), §G.1 (gaz) ;
 * docs/research/03-dynamique-manifestation.md §1.4-1.6, §4.2, §5.5, §10 ;
 * docs/research/04-paris-lieux-monuments.md §1.2. Presque tout est « estimé » dans ces dossiers :
 * ce sont des valeurs de jeu, à régler par essais.
 * ===================================================================================== */

import type { DurationPreset, ProtestProfile } from '@/core/contracts';

// ───────────────────────────── phases (bible F.2) ─────────────────────────────

/** Part de la durée de mission : rassemblement, départ, cortège, dispersion, après-manif. */
export const PHASE_SHARE: readonly number[] = [0.12, 0.04, 0.44, 0.16, 0.24];
/** Durées réelles (s) pour le préréglage « temps réel » (bornes basses de la colonne « Réel »). */
export const REAL_PHASES: readonly number[] = [3600, 900, 10800, 2400, 7200];
/** Durée de référence (préréglage standard) : sert d'échelle de temps aux délais du module. */
export const STANDARD_DURATION = 1500;
/** Prolongation de l'après-manif tant qu'il reste plus de 5 % de la foule (s en durée standard), 3 au plus. */
export const OVERTIME = 300;
export const OVERTIME_MAX = 3;
/** La manifestation est finie sous cette part de la foule présente. */
export const END_SHARE = 0.05;
/** Paliers de tension (bible F.4) avec hystérésis : entrée / sortie des états superposés. */
export const TENSION_ON = 0.3;
export const TENSION_OFF = 0.24;
export const CLASH_ON = 0.5;
export const CLASH_OFF = 0.42;
/** Durée minimale d'un état superposé (s). */
export const OVERLAY_DWELL = 20;

export function totalDuration(preset: DurationPreset): number {
  switch (preset) {
    case 'courte': return 600;
    case 'standard': return 1500;
    case 'longue': return 2700;
    default: return REAL_PHASES[0]! + REAL_PHASES[1]! + REAL_PHASES[2]! + REAL_PHASES[3]! + REAL_PHASES[4]!;
  }
}

// ───────────────────────────── tension (dossier 03 §10) ─────────────────────────────

export const TENSION_CELL = 25;
/** Décroissance locale : 0,01 par 10 s sans incident (durée standard). */
export const TENSION_DECAY = 0.001;
/** Lissage de la tension globale (s). */
export const TENSION_SMOOTH = 10;
export const TENSION_MEAN_W = 0.6;
export const TENSION_MAX_W = 0.4;
/** La tension de départ retombe vers cette part d'elle-même. */
export const AMBIENT_FLOOR = 0.4;
/** Tronçon de légitimité et de cohésion (m). */
export const LEGIT_CELL = 50;
export const LEGIT_START = 0.7;
export const LEGIT_START_VOLATILE = 0.5;
export const COHESION_START = 0.3;
/** +0,01 de légitimité par 10 s sans emploi de la force ; −0,01 de cohésion par 10 s. */
export const LEGIT_RECOVERY = 0.001;
export const COHESION_DECAY = 0.001;

// ───────────────────────────── parcours et couloir ─────────────────────────────

/** Pas d'échantillonnage du parcours (m). */
export const ROUTE_STEP = 4;
/** Portée des rayons latéraux (m) et marge aux façades (m). */
export const CORRIDOR_REACH = 18;
export const CORRIDOR_MARGIN = 0.9;
/** Demi-largeur maximale occupée par le cortège (m) : un cortège ne s'étale pas sur toute une place. */
export const CORRIDOR_HALF_MAX = 11;
export const CORRIDOR_HALF_MIN = 1.3;
/** Demi-largeur par défaut quand ni la rue ni les murs ne sont connus (m). */
export const CORRIDOR_HALF_DEFAULT = 8;
/** Longueur visée du parcours de repli (m) : une place à 1 – 1,5 km. */
export const ROUTE_MIN = 1000;
export const ROUTE_MAX = 1500;

// ───────────────────────────── cortège ─────────────────────────────

/** Allure de marche entre deux arrêts (m/s) : 3,3 km/h. */
export const MARCH_SPEED = 0.92;
/** Allure maximale d'un bloc qui recolle (m/s). */
export const CATCHUP_GAIN = 0.45;
/** Temps de réaction d'un bloc à celui qui le précède (s) : c'est lui qui fait l'accordéon. */
export const BLOCK_TAU = 1.6;
/** Écart minimal entre deux blocs à l'arrêt, en part de l'écart nominal. */
export const BLOCK_JAM = 0.7;
/** Longueur nominale d'un bloc de la chaîne (m). */
export const BLOCK_LEN = 5;
/** Étirement maximal du cortège dans une rue étroite. */
export const STRETCH_MAX = 3;
/** Densités nominales (personnes/m², bible F.2) par type de tronçon. */
export const DENSITY_PRECORTEGE = 0.55;
export const DENSITY_CARRE = 1.7;
export const DENSITY_BLOC = 1.05;
export const DENSITY_DIVERS = 0.75;
export const DENSITY_QUEUE = 0.45;
/** Écart latéral entre deux marcheurs d'un même rang (m). */
export const ROW_SPACING = 1.05;
/** Tampon entre précortège et carré de tête (m) : calme, puis quand le service d'ordre isole son cortège. */
export const BUFFER_CALM = 14;
export const BUFFER_TENSE = 45;
/** Arrêts de marche : intervalle et durée (s, durée standard). */
export const HALT_EVERY_MIN = 70;
export const HALT_EVERY_MAX = 130;
export const HALT_MIN = 14;
export const HALT_MAX = 34;
/** Arrêt devant un barrage : distance au premier rang des forces (m). */
export const BARRAGE_STOP = 12;
export const BARRAGE_SCAN = 30;
/** Rappel d'une personne vers son emplacement (1/s) et allures. */
export const SLOT_GAIN = 0.8;
export const WALK_MAX = 1.35;
export const RUN_CATCHUP = 2.6;
export const RUN_FLEE = 4.6;
/** Camion sono : demi-largeur réservée, longueur, espace libre devant (m). */
export const SONO_HALF_WIDTH = 2.3;
export const SONO_LENGTH = 8;
export const SONO_CLEAR_AHEAD = 6;
export const SONO_MIN_CROWD = 120;

// ───────────────────────────── arrivées (bible F.2, métro) ─────────────────────────────

/** Part de la foule déjà sur place au début de la mission. */
export const PRESENT_AT_START = 0.3;
/** Part des arrivées qui sortent du métro quand une station est proche. */
export const METRO_SHARE = 0.65;
/** Part de la foule qui arrive en renfort après le départ. */
export const REINFORCE_SHARE = 0.15;
/** Stations desservant le rassemblement : à moins de 400 m (à défaut, la plus proche à moins de 900 m). */
export const STATION_RADIUS = 400;
export const STATION_FALLBACK = 900;
/** Vagues : 20 à 60 personnes toutes les 20 à 40 s par station (durée standard). */
export const WAVE_MIN = 20;
export const WAVE_MAX = 60;
export const WAVE_EVERY_MIN = 20;
export const WAVE_EVERY_MAX = 40;
/** Débit d'une bouche (personnes/s) : libre, puis filtrée par une unité. */
export const EXIT_RATE = 2;
export const EXIT_RATE_FILTERED = 0.55;
/** Station fermée : 70 % du flux reporté sur les deux voisines avec 60 à 120 s de retard, le reste à pied. */
export const CLOSURE_SHARE = 0.7;
export const CLOSURE_DELAY_MIN = 60;
export const CLOSURE_DELAY_MAX = 120;
export const CLOSURE_NEIGHBOUR = 1000;
/** Tension ajoutée par vague filtrée, et colère de ceux qu'on contrôle. */
export const FILTER_TENSION = 0.012;
export const FILTER_ANGER = 0.05;
/** Points d'entrée à pied : distance au rassemblement (m). */
export const FOOT_ENTRY_MIN = 150;
export const FOOT_ENTRY_MAX = 240;
/** Dispersion : la moitié des partants gagnent une bouche à moins de 300 m. */
export const LEAVE_METRO_SHARE = 0.5;
export const LEAVE_METRO_RADIUS = 300;
export const LEAVE_STREET_DIST = 230;
/** Débit d'entrée d'une bouche à la dispersion (personnes/s) et rayon d'arrivée (m). */
export const ENTER_RATE = 4;
export const EXIT_REACH_METRO = 3.2;
export const EXIT_REACH_STREET = 5;

// ───────────────────────────── réflexion ─────────────────────────────

/** Intervalle de réflexion (s) : près du joueur, à distance moyenne, loin. */
export const THINK_NEAR = 0.3;
export const THINK_MID = 0.55;
export const THINK_FAR = 1.1;
export const LOD_NEAR = 60;
export const LOD_MID = 140;
/** Itinéraires calculés par pas de simulation, au plus. */
export const PATH_BUDGET = 3;
export const WAYPOINT_REACH = 2.4;

// ───────────────────────────── profils (bible F.3) ─────────────────────────────

export interface ProfileTuning {
  /** Recule quand la peur dépasse ce seuil ; quitte les lieux au-delà du second. */
  backOff: number;
  quit: number;
  /** Distance tenue face à une ligne immobile (m). */
  keep: number;
  /** Sensibilité à la peur et à la colère. */
  fearK: number;
  angerK: number;
  /** Part cumulée de départs après l'annonce, la première puis la dernière sommation (foule calme, issue libre). */
  leave: readonly [number, number, number];
  /** Fenêtre de départ pendant la dispersion annoncée par les organisateurs (part de la phase). */
  goFrom: number;
  goTo: number;
  /** Distance de fuite devant une charge (m). */
  flee: number;
  /** Allure de marche relative et vitesse de fatigue relative. */
  pace: number;
  tire: number;
}

export const PROFILE: Readonly<Record<ProtestProfile | 'badaud', ProfileTuning>> = {
  famille: { backOff: 0.15, quit: 0.25, keep: 22, fearK: 1.5, angerK: 0.6, leave: [0.7, 0.95, 1], goFrom: 0, goTo: 0.25, flee: 60, pace: 0.86, tire: 1.5 },
  pacifique: { backOff: 0.4, quit: 0.6, keep: 12, fearK: 1, angerK: 1, leave: [0.25, 0.6, 0.9], goFrom: 0.03, goTo: 0.6, flee: 48, pace: 1, tire: 1 },
  militant: { backOff: 0.45, quit: 0.65, keep: 11, fearK: 0.9, angerK: 1.05, leave: [0.1, 0.35, 0.75], goFrom: 0.15, goTo: 0.7, flee: 42, pace: 1, tire: 0.9 },
  service_ordre: { backOff: 0.6, quit: 0.8, keep: 4.5, fearK: 0.6, angerK: 0.5, leave: [0.05, 0.25, 0.8], goFrom: 0.45, goTo: 0.85, flee: 30, pace: 1.03, tire: 0.8 },
  meneur: { backOff: 0.55, quit: 0.75, keep: 8, fearK: 0.6, angerK: 0.8, leave: [0.05, 0.2, 0.6], goFrom: 0.55, goTo: 0.9, flee: 32, pace: 1, tire: 0.8 },
  opportuniste: { backOff: 0.45, quit: 0.65, keep: 8, fearK: 0.9, angerK: 1.2, leave: [0.03, 0.12, 0.35], goFrom: 0.4, goTo: 1.25, flee: 36, pace: 1.05, tire: 0.8 },
  radical: { backOff: 0.7, quit: 0.8, keep: 7, fearK: 0.5, angerK: 1.3, leave: [0, 0.03, 0.1], goFrom: 0.9, goTo: 1.9, flee: 30, pace: 1.08, tire: 0.7 },
  pilleur: { backOff: 0.45, quit: 0.6, keep: 30, fearK: 0.9, angerK: 0.7, leave: [0.05, 0.2, 0.5], goFrom: 1.1, goTo: 2, flee: 45, pace: 1.05, tire: 0.7 },
  badaud: { backOff: 0.2, quit: 0.35, keep: 8, fearK: 1.2, angerK: 0.5, leave: [0.6, 0.95, 1], goFrom: 0, goTo: 0.3, flee: 50, pace: 1, tire: 1 },
};

/** Portée d'une sommation : intelligible, puis seulement audible (m, bible J.1). */
export const SOMMATION_CLEAR = 60;
export const SOMMATION_HEARD = 120;
/** Reculer : distance prise par rapport au dernier danger quand la peur dépasse le seuil (m). */
export const BACKOFF_MIN = 40;
export const BACKOFF_MAX = 60;
/** Gaz : seuils d'exposition et de concentration qui font sortir du nuage. */
export const GAS_FEEL = 0.1;
export const GAS_AIR = 0.06;
export const GAS_CLEAR = 0.03;
/** Première bouffée de gaz : la peur monte au moins jusqu'à ce niveau (× sensibilité du profil), même sans tir vu. */
export const GAS_SCARE = 0.16;
/** Canon à eau : distance tenue (m). */
export const WATER_KEEP = 40;

// ───────────────────────────── émotions (bible F.3, F.4) ─────────────────────────────

/** Demi-vies (s) quand le module des personnes ne s'en charge pas. */
export const FEAR_HALF = 45;
export const FEAR_HALF_RADICAL = 25;
export const FEAR_HALF_FAMILY = 90;
export const ANGER_HALF = 180;
/** Contagion toutes les 2 s, entre voisins à moins de 5 m. */
export const CONTAGION_EVERY = 2;
export const CONTAGION_CELL = 5;
export const CONTAGION_BASE = 0.1;
export const CONTAGION_COHESION = 0.3;
/** « Justifié » : un acte violent visible à moins de 40 m dans les 60 s précédentes. */
export const JUSTIFY_RADIUS = 40;
export const JUSTIFY_WINDOW = 60;
/** Radicalisation : tirage toutes les 10 s. */
export const RADICAL_EVERY = 10;
export const RAD_PACIFIQUE = 0.06;
export const RAD_MILITANT = 0.04;
export const RAD_OPPORTUNISTE = 0.03;
/** Service d'ordre : rayon d'apaisement (m), baisse de colère par seconde, plancher. */
export const SO_CALM_RADIUS = 6;
export const SO_CALM_RATE = 0.02;
export const SO_CALM_FLOOR = 0.15;
/** Fatigue : part acquise par seconde de marche en durée standard (≈ 0,6 à la fin du cortège). */
export const FATIGUE_RATE = 0.00075;

// ───────────────────────────── densité (bible F.2) ─────────────────────────────

export const DENSITY_CELL = 2.5;
export const DENSITY_EVERY = 0.5;
export const DENSITY_ALERT = 4;
export const DENSITY_DANGER = 5;
/** Une alerte n'est donnée que si la densité tient cette durée (s) ; délai avant de la redonner au même endroit. */
export const DENSITY_HOLD = 1.5;
export const DENSITY_REARM = 30;
/**
 * Densité « équivalente ». La locomotion ne laisse pas les corps se chevaucher et chacun cesse de forcer quand
 * on lui barre le passage : même paniquée, une foule simulée plafonne vers 3 personnes/m² (disques de 0,28 m
 * de rayon). Une vraie foule immobile et pressée de l'arrière atteint 4 à 5 et plus. La densité équivalente
 * majore donc la densité géométrique par la POUSSÉE : part des personnes de la cellule qui veulent avancer
 * vite et n'avancent plus (ou compression mesurée par le module des personnes). Foule serrée mais calme :
 * pas de majoration, pas d'alerte ; foule serrée qui pousse : jusqu'à × 1,6.
 */
export const DENSITY_PRESSURE_K = 0.6;
/** Au-delà de 5 : un blessé par compression toutes les 10 s par tranche de 50 personnes. */
export const CRUSH_PER_PERSON = 1 / 500;
export const DENSITY_TENSION = 0.06;

// ───────────────────────────── aléas ─────────────────────────────

/** Nombre d'aléas tirés par mission : base + volatility × portée, modulé par la durée. */
export const ALEA_BASE = 2;
export const ALEA_SPAN = 4;

/** Badauds en lisière : part de l'effectif, bornes. */
export const BYSTANDER_SHARE = 0.03;
export const BYSTANDER_MIN = 3;
export const BYSTANDER_MAX = 36;
