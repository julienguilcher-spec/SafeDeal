/* =====================================================================================
 * Personnes — constantes de réglage (toutes les valeurs de jeu du module sont ici).
 *
 * Sources : docs/research/06-roles-jouables.md §1.4 (allures, souffle, portage),
 * docs/research/03-dynamique-manifestation.md §5.4-5.5 (physique des foules, peur, colère),
 * §6.3 (gaz lacrymogène), docs/research/02-materiel-tenues-vehicules.md §2 (bouclier, masque).
 * Les valeurs marquées [JEU] sont des choix de conception calés sur ces documents.
 * ===================================================================================== */

// ───────────────────────────── locomotion ─────────────────────────────

/** Accélération au sol (m/s²) : 0 → 1,4 m/s en 0,3 s, 0 → 5,5 m/s en ≈ 1,3 s. */
export const ACCEL_GROUND = 4.2;
/** Freinage (m/s²) : arrêt depuis le sprint en ≈ 0,75 s (≈ 2 m). */
export const DECEL_GROUND = 7.5;
/** Frottement d'une personne à terre qui glisse (m/s²). */
export const DOWN_FRICTION = 9;
/** Vitesse horizontale maximale admise, tous effets confondus (m/s) — garde-fou numérique. */
export const SPEED_HARD_MAX = 12;
/** Vitesse de rotation du corps (rad/s) à l'arrêt et à pleine vitesse. */
export const TURN_RATE_SLOW = 9;
export const TURN_RATE_FAST = 4.5;
/** Vitesse de rotation de la visée d'une IA (rad/s). Le joueur vise instantanément. */
export const AIM_RATE = 8;
/** Torsion maximale du buste par rapport au corps quand le corps suit le déplacement (rad). */
export const AIM_TWIST_MAX = 1.75;
export const AIM_PITCH_MAX = 1.45;
/** Marche arrière (corps tourné vers la visée) : facteur de vitesse à 180°. */
export const BACKWARD_FACTOR = 0.6;

/** Perte de vitesse par kg porté, par allure (marche, course, sprint) : 20 kg → 1,3 / 2,8 / 4,4 m/s. */
export const LOAD_SPEED_K: readonly number[] = [0.0035, 0.006, 0.01];
export const LOAD_MAX = 45;
/** Facteur de vitesse par gravité de blessure. */
export const INJURY_SPEED_LIGHT = 0.9;
export const INJURY_SPEED_SERIOUS = 0.55;
export const INJURY_SPEED_CRITICAL = 0.25;
/** Gaz sans protection : vitesse × 0,6 (D03 §6.3). */
export const GAS_SPEED_LOSS = 0.4;
export const GAS_SPEED_FROM = 0.15;
export const GAS_SPEED_FULL = 0.7;
/** Étourdi : on titube. */
export const STUN_SPEED = 0.4;
export const WINDED_SPEED = 0.85;
/** Accroupi : marche à 55 % ; « course » accroupie plafonnée à la vitesse de marche. */
export const CROUCH_WALK = 0.55;
/** Bouclier levé : pas de sprint, course plafonnée à 3,2 m/s (D06 §1.4). */
export const SHIELD_RUN_MAX = 3.2;
/** Portage d'un blessé sur l'épaule : 1,2 m/s ; traîné : 0,6 m/s (D06 §1.4). */
export const CARRY_SPEED = 1.2;
export const DRAG_SPEED = 0.6;
/** Escorte d'une personne menottée ou port d'un objet : marche soutenue seulement. */
export const ESCORT_SPEED_FACTOR = 1.15;
/** Menotté et libre de ses mouvements : équilibre précaire. */
export const CUFFED_SPEED = 0.7;
/** Sol mouillé : adhérence (accélération, freinage) et vitesse de pointe. */
export const WET_GRIP_LOSS = 0.3;
export const WET_SETT_GRIP_LOSS = 0.5;
export const WET_SPRINT_LOSS = 0.1;
/** Surfaces meubles (parc, stabilisé). */
export const SOFT_GROUND_SPEED = 0.92;
/** Vêtements trempés. */
export const SOAKED_SPEED_LOSS = 0.05;
/** Densité de foule (pers/m²) à partir de laquelle on ralentit, et plancher (D03 §5.5). */
export const CROWD_FREE = 1.5;
export const CROWD_JAM = 4.5;
export const CROWD_MIN_FACTOR = 0.4;
export const CROWD_RADIUS = 1.5;

/** Se relever : assis ou à genoux, puis à plat ventre (s). */
export const GETUP_SIT = 0.6;
export const GETUP_PRONE = 1.1;

// séparation entre personnes
/** Portée de recherche au-delà du rayon propre (rayon d'autrui maximal + marge de confort). */
export const SEP_REACH = 0.47;
/** Marge de confort au-delà du contact (m) et raideur de la répulsion douce. */
export const SEP_COMFORT = 0.1;
export const SEP_COMFORT_K = 0.06;
/** Sur-relaxation du chevauchement : chacun s'écarte d'un peu plus que sa part, la convergence est plus rapide. */
export const SEP_STIFFNESS = 1.3;
/** Vitesse maximale d'écartement (m/s) — garde-fou contre toute explosion numérique. */
export const SEP_MAX_SPEED = 3.5;
/** Déplacement de séparation ignoré en dessous de ce seuil (m) : pas de tremblement. */
export const SEP_DEAD = 0.0012;
/** Part de la vitesse dirigée contre la poussée qui est absorbée. */
export const SEP_ABSORB = 0.85;
/** Contournement : glissement latéral face à quelqu'un dont on se rapproche (seuil et pleine mesure en m/s). */
export const SLIDE_K = 0.45;
export const SLIDE_MIN_CLOSING = 0.3;
export const SLIDE_FULL_CLOSING = 1.5;
/** Passage barré : chevauchement (m) à partir duquel on cesse de forcer, part de l'élan retirée, oubli (1/s). */
export const BLOCK_REF = 0.004;
export const BLOCK_K = 1;
export const BLOCK_DECAY = 3;
/** Décalage aléatoire (fraction du chevauchement) d'une personne comprimée entre des poussées opposées. */
export const SQUEEZE_JITTER = 0.15;
/** Taille des cellules de la grille fine de séparation (m). */
export const SEP_CELL = 1.5;
/** Compression (m/s d'écrasement) donnant une pression de 1. */
export const PRESSURE_REF = 0.9;
export const PRESSURE_SMOOTH = 0.12;
/** Résistance à la poussée : bouclier levé, formation tenue. */
export const RESIST_SHIELD = 3;
export const RESIST_LINE = 2;
/** Nombre de pas d'immobilité avant de ne vérifier la séparation qu'un pas sur quatre. */
export const CALM_STEPS = 10;

// saut et enjambement
export const JUMP_TIME = 0.5;
export const JUMP_HEIGHT = 0.4;
export const JUMP_COOLDOWN = 0.35;
export const JUMP_STAMINA = 6;
/** Obstacle franchissable : barrière Vauban (1,10 m), banc, poubelle, jardinière… */
export const VAULT_MAX_HEIGHT = 1.15;
export const VAULT_REACH = 1.3;
export const VAULT_MIN_SPEED = 2.4;
export const VAULT_MAX_SPEED = 4.5;
export const VAULT_STAMINA = 9;

// personnes tenues
export const DRAG_DISTANCE = 0.95;
export const ESCORT_AHEAD = 0.55;
export const ESCORT_SIDE = 0.12;

// fréquence réduite loin du joueur
export const LOD_MID = 55;
export const LOD_FAR = 110;
/** Au-delà de cette vitesse (m/s), une personne lointaine est mise à jour au moins un pas sur deux. */
export const LOD_FAST_SPEED = 2.5;
export const LOD_MAX_DT = 0.25;

// ───────────────────────────── endurance ─────────────────────────────

/** Souffle : 25 s de sprint sans charge (D06 §1.4) → 4 points/s. */
export const STAMINA_SPRINT_DRAIN = 4;
/** Course (trot) : ≈ 2 min sans charge. */
export const STAMINA_RUN_DRAIN = 0.8;
/** Récupération : 2 s de course rendues par seconde d'arrêt (D06 §1.4) → 8 points/s ; moitié en marchant. */
export const STAMINA_REST = 8;
export const STAMINA_WALK = 4;
/** Surcoût par kg d'équipement : 20 kg → sprint tenu 15 s (D03 §5.5). */
export const STAMINA_LOAD_K = 0.033;
export const STAMINA_LOAD_RECOVERY_K = 0.015;
/** Masque à gaz : on respire à travers une cartouche. */
export const MASK_DRAIN = 1.15;
export const MASK_RECOVERY = 0.7;
export const VISOR_RECOVERY = 0.95;
/** Dans le gaz sans masque : −30 % (D06 §1.4). */
export const GAS_STAMINA = 0.3;
export const STAMINA_INJURY_LIGHT = 0.85;
export const STAMINA_INJURY_SERIOUS = 0.5;
export const STAMINA_INJURY_CRITICAL = 0.25;
/** Bouclier levé : le bras fatigue, on récupère moins bien. */
export const SHIELD_RECOVERY = 0.6;
/** Effort continu du portage (points/s en mouvement). */
export const CARRY_DRAIN = 1.6;
export const DRAG_DRAIN = 1.0;
/** Essoufflé en dessous de ce niveau ; le souffle revient à partir de l'autre. */
export const WINDED_AT = 3;
export const WINDED_UNTIL = 35;

/** Masse de l'équipement porté sur soi d'après les protections (casque ≈ 1,75 kg, gilet et coques ≈ 14 kg). */
export const WEIGHT_HELMET = 2;
export const WEIGHT_BODY_ARMOR = 14;
export const WEIGHT_BACKPACK = 3;

// ───────────────────────────── santé ─────────────────────────────

/** Zones : hauteur d'impact relative (0 pieds … 1 tête). */
export const ZONE_HEAD = 0.82;
export const ZONE_LEGS = 0.42;
export const ZONE_DEFAULT = 0.6;
export const HEAD_DAMAGE = 1.6;
export const LEG_DAMAGE = 0.7;
/** Part de armorBody qui couvre les jambes (jambières). */
export const LEG_ARMOR = 0.6;
/** Seuils de points de vie des niveaux de blessure (identiques au service neutre). */
export const HEALTH_LIGHT = 75;
export const HEALTH_SERIOUS = 50;
export const HEALTH_CRITICAL = 25;
/** Dégât (après protections) ou recul (m/s) qui jette à terre. */
export const KNOCKDOWN_DAMAGE = 24;
export const KNOCKDOWN_KNOCKBACK = 4.2;
export const KNOCKDOWN_HEAD_STUN = 1.5;
/** Durée à terre avant de se relever seul (s). */
export const DOWN_TIME_MIN = 2.5;
export const DOWN_TIME_MAX = 5.5;
export const DOWN_TIME_SERIOUS = 2;
export const RECOVER_AFTER_HEAL = 2.5;
export const STUN_MAX = 12;
export const KNOCKBACK_MAX = 9;
/** Aggravation sans soins (points de vie par seconde). */
export const BLEED_SERIOUS = 0.05;
export const BLEED_CRITICAL = 0.15;
/** Un coup de cette ampleur rouvre une blessure stabilisée. */
export const REOPEN_DAMAGE = 5;
/** Dégât minimal (après protections) d'un coup pouvant tuer, en violence « réaliste ». */
export const LETHAL_MIN_DAMAGE = 30;

// bouclier
/** Demi-angle couvert par le bouclier levé : ± 70° autour du cap du corps. */
export const SHIELD_ARC_COS = 0.342;
/** Zones couvertes : debout, parade haute (visée levée), accroupi (tout le corps). */
export const SHIELD_LOW = 0.12;
export const SHIELD_HIGH = 0.92;
export const SHIELD_PARRY_PITCH = 0.2;
export const SHIELD_PARRY_LOW = 0.3;
export const SHIELD_KNOCKBACK = 0.3;
export const SHIELD_STAMINA_K = 0.12;
export const SHIELD_STAMINA_MAX = 8;

// gaz (D03 §6.3)
/** Montée de l'exposition (1/s) dans un nuage dense sans protection : gêne nette en ≈ 2 s, maximale en ≈ 3 s. */
export const GAS_RISE = 0.33;
/** Plafond d'exposition = concentration effective × ce facteur. */
export const GAS_CAP = 1.5;
/** Demi-vie à l'air libre : 20 s (effets forts dissipés en 60 s), puis longue traîne (gêne légère ≈ 5 min). */
export const GAS_HALFLIFE_FAST = 20;
export const GAS_HALFLIFE_SLOW = 90;
export const GAS_TAIL = 0.15;
/** Yeux rincés par un secouriste : récupération trois fois plus rapide pendant 30 s. */
export const GAS_RINSE_TIME = 30;
export const GAS_RINSE_HALFLIFE = 6;
/** Exposition forte prolongée (> 40 s) : la personne se plie en deux, a besoin d'aide. */
export const GAS_SEVERE = 0.6;
export const GAS_SEVERE_TIME = 40;
/** Toux audible au-dessus de ce niveau ; intervalle entre deux quintes (s). */
export const GAS_COUGH = 0.35;
export const COUGH_MIN = 2.5;
export const COUGH_MAX = 6;
/** Habitacle d'un véhicule : concentration divisée. */
export const VEHICLE_GAS = 0.3;
/** Dose reçue par un coup de type « gas » (gazeuse à main) : exposition par point de dégât. */
export const GAS_HIT_DOSE = 0.02;
export const GAS_HIT_HEALTH = 0.05;
/** Une personne sur vingt est asthmatique (malaise après une exposition forte prolongée). */
export const ASTHMA_ONE_IN = 20;

// feu
export const FIRE_IGNITE_MIN = 0.2;
/** Montée de l'embrasement dans un feu vif (1/s). */
export const FIRE_IGNITE_RATE = 1.2;
/** Points de vie perdus par seconde quand on brûle entièrement. */
export const BURN_DPS = 9;
/** Extinction : avec le temps, en étant trempé, sous la pluie, en se roulant au sol (1/s). */
export const BURN_DECAY = 0.11;
export const BURN_DECAY_WET = 2;
export const BURN_DECAY_RAIN = 0.3;
export const BURN_DECAY_ROLL = 0.25;
/** Coup de type « burn » : dégât qui enflamme entièrement. */
export const BURN_IGNITE_REF = 30;
export const BURN_VISIBLE = 0.12;

// eau
export const WET_RAIN_RATE = 0.02;
export const DRY_RATE = 0.004;
export const WATER_HIT_WET = 0.08;

// psychologie (D03 §5.5)
export const FEAR_HALFLIFE = 45;
export const FEAR_HALFLIFE_RADICAL = 25;
export const FEAR_HALFLIFE_FAMILY = 90;
export const ANGER_HALFLIFE = 180;
export const FEAR_PER_DAMAGE = 0.012;
export const ANGER_PER_DAMAGE = 0.009;
export const FEAR_BURNING = 0.5;
export const FEAR_GAS = 0.02;
export const FEAR_PRESSURE = 0.04;

// effets
export const BLOOD_MIN_DAMAGE = 8;
export const CRY_MIN_DAMAGE = 10;
export const CRY_INTERVAL = 1.5;
/** Portée au-delà de laquelle les sons d'ambiance individuels (toux) ne sont pas demandés (m). */
export const AMBIENT_SFX_RANGE = 70;

// ───────────────────────────── interactions ─────────────────────────────

export const CARRY_REACH = 1.7;
export const CARRY_TIME = 2.5;
export const DRAG_TIME = 0.8;
export const DROP_TIME = 1.2;
export const CARRY_MIN_STAMINA = 15;
export const PUSH_REACH = 0.55;
/** Vitesse donnée à la personne repoussée (m/s). */
export const PUSH_SPEED = 3;
export const PUSH_STAMINA = 4;
export const PUSH_COOLDOWN = 0.9;
export const PUSH_STUN = 0.25;
export const PUSH_ANIM = 0.45;
/** Déplacement (m) ou intention de bouger (norme de cmd.move) qui interrompt une action à durée. */
export const INTERRUPT_MOVE = 0.6;
export const INTERRUPT_INTENT = 0.3;
export const INTERRUPT_STUN = 0.2;

// ───────────────────────────── joueur ─────────────────────────────

export const LOOK_PITCH_MAX = 1.45;
/** Durée de charge complète d'un lancer (s) et puissance minimale d'un geste bref. */
export const CHARGE_TIME = 0.9;
export const CHARGE_MIN_POWER = 0.2;
/** En dessous de cette inclinaison du stick, on marche ; au-delà, on trottine. */
export const STICK_WALK = 0.55;
/** Joystick tactile poussé à fond : sprint. */
export const TOUCH_SPRINT = 0.97;
/** Rafraîchissement de l'invite d'interaction et de la visée (s). */
export const PROMPT_INTERVAL = 0.2;
export const AIM_INTERVAL = 0.1;
export const AIM_RANGE = 60;
export const AIM_GROUND_RANGE = 80;
/** Tolérance angulaire du réticule (rad) ; doublée avec l'aide à la visée à la manette. */
export const AIM_TOLERANCE = 0.02;
/** Hauteur des yeux en fraction de la taille : debout, accroupi. */
export const EYE_STAND = 0.93;
export const EYE_CROUCH = 0.62;
/** Mise en place du masque à gaz : 8 s (D02 §2.3) ; retrait : 3 s. */
export const MASK_DON_TIME = 8;
export const MASK_DOFF_TIME = 3;
export const MASK_PROTECTION = 0.97;
/** Visière baissée : protège le visage, réduit le champ de vision de 15 % ; masque : 30 % (D06 §2.4). */
export const VISOR_ARMOR = 0.12;
export const VISOR_FOV = 0.85;
export const MASK_FOV = 0.7;
/** Tourelle : vitesses de pointage (rad/s). */
export const TURRET_YAW_RATE = 1.4;
export const TURRET_PITCH_RATE = 0.9;
export const ZOOM_RATE = 1.4;
export const ZOOM_MAX_FOOT = 2.5;
export const ZOOM_MAX_OPTICS = 10;
/** Maintien de l'orientation vers la visée après un usage d'objet (s). */
export const FACE_AIM_HOLD = 0.7;
