/* =====================================================================================
 * GROUPES RADICAUX — constantes de réglage.
 *
 * Sources : docs/research/00-bible-realisme.md §F.1 à F.5 et §G.4 ; docs/research/03-dynamique-
 * manifestation.md §3.2 à 3.6. Presque tout y est marqué « estimé » : ce sont des valeurs de jeu.
 * Les durées marquées « durée standard » sont multipliées par l'échelle de temps de la mission,
 * bornée entre TIME_K_MIN et TIME_K_MAX (une mission courte garde des signes lisibles).
 * ===================================================================================== */

// ───────────────────────────── intensité (« chaleur ») ─────────────────────────────

/**
 * Chaleur = porte(volatilité) × (tension × (HEAT_T0 + HEAT_TV × volatilité) + HEAT_V × volatilité − HEAT_BIAS).
 * À volatilité nulle la porte vaut 0 : il ne se passe rien de violent, quelle que soit la tension.
 */
export const HEAT_GATE = 0.12;
export const HEAT_T0 = 0.35;
export const HEAT_TV = 0.75;
export const HEAT_V = 0.3;
export const HEAT_BIAS = 0.03;
/** La nuit, la propension à dégénérer est majorée (dossier 03 §3.1). */
export const NIGHT_VOLATILITY = 1.25;
/** Lissage de la chaleur (s). */
export const HEAT_SMOOTH = 6;

/** Paliers de chaleur (échelle de tension du dossier 03 §3.6, bible F.4). */
export const TIER_SIGNS = 0.12; // agitation : nébuleuse, visages couverts, tags, fumigènes
export const TIER_BLOC = 0.25; // tension : bloc formé, premiers jets, mobilier déplacé
export const TIER_CLASH = 0.4; // affrontement localisé : salves, vitrines, feux de poubelles, barricade
export const TIER_RIOT = 0.6; // affrontement généralisé : mortiers, engins incendiaires, véhicules en feu
export const TIER_EMEUTE = 0.8; // émeute : groupes dispersés, pillages en série

// ───────────────────────────── groupes d'affinité ─────────────────────────────

export const GROUP_MIN = 5;
export const GROUP_MAX = 15;
export const GROUP_IDEAL = 9;
/** En dessous de trois radicaux présents, personne ne passe à l'acte. */
export const GROUP_FLOOR = 3;
/** Suiveurs (opportunistes) qu'un groupe peut entraîner, par membre. */
export const FOLLOWERS_PER_MEMBER = 1.5;
/** Intervalle de réflexion d'un groupe (s) et durée minimale d'un plan avant d'en changer. */
export const GROUP_THINK = 1;
export const PLAN_DWELL = 8;
/** Moral : départ, plancher de repli, récupération par seconde au calme. */
export const MORALE_START = 0.7;
export const MORALE_BREAK = 0.25;
export const MORALE_RECOVER = 0.004;
/** Pertes (membres à terre ou interpellés) au-delà desquelles le groupe se retire (part de l'effectif). */
export const LOSS_BREAK = 0.3;
/** Cohésion : part des membres à moins de cette distance du point du groupe (m). */
export const COHESION_RADIUS = 12;

// ───────────────────────────── signes avant-coureurs (bible F.2, durée standard) ─────────────────────────────

export const TIME_K_MIN = 0.6;
export const TIME_K_MAX = 1.5;
/** Avance de chaque signe sur le passage à l'acte (s). */
export const LEAD_GATHER = 150;
export const LEAD_MASKS = 115;
export const LEAD_SIGNAL = 75;
export const LEAD_CHANGE = 60;
export const LEAD_UMBRELLAS = 35;
export const LEAD_COLLECT = 32;
/** Le signal du bloc tombe entre 20 % et 70 % de la phase « cortège » selon la volatilité (bible F.4). */
export const SIGNAL_SHARE_CALM = 0.7;
export const SIGNAL_SHARE_SPAN = 0.5;
/** Tension très forte avant l'heure prévue : le bloc avance son passage à l'acte, sans descendre sous ce délai (s). */
export const LEAD_RUSHED = 90;
/** Durée du changement de tenue d'une personne (s) et étalement des départs dans un groupe (s). */
export const CHANGE_SECONDS = 9;
export const CHANGE_STAGGER = 14;
/** Un signe reste publié ce temps après la fin de ce qui l'a produit (s). */
export const SIGNAL_LINGER = 20;
/** Signal du bloc (bible F.4) : tension locale et cohésion. */
export const SIGNAL_TENSION = 0.1;
export const SIGNAL_COHESION = 0.05;

// ───────────────────────────── bloc : formation et progression ─────────────────────────────

/** Écarts dans la formation compacte (m) : entre voisins d'un rang, entre deux rangs. */
export const ROW_GAP = 0.85;
export const FILE_GAP = 0.8;
export const BLOC_COLUMNS_MAX = 7;
/** Avance du bloc sur la tête du cortège (m). */
export const BLOC_AHEAD = 22;
/** Allures du point de groupe (m/s) : progression groupée, avance pour lancer, recul, repli. */
export const SPEED_WALK = 1.25;
export const SPEED_ADVANCE = 2.4;
export const SPEED_RETREAT = 3.2;
export const SPEED_RUN = 4.6;

// ───────────────────────────── actions : fenêtres et cadences ─────────────────────────────

/** Le noyau agit 30 à 90 s, se replie, se rechange (bible F.1) ; la fenêtre s'allonge avec la chaleur. */
export const ACTION_MIN = 30;
export const ACTION_MAX = 90;
/** Pause entre deux passages à l'acte (s, durée standard). */
export const REST_MIN = 40;
export const REST_MAX = 90;

/**
 * Salves : distance du premier rang à la ligne au moment de lancer, et distance de repli (m). La bible (F.3)
 * dit « bloc qui lance 20 à 35 m » ; avec la balistique du module du matériel un pavé lancé à la main porte
 * à 20–24 m selon le lanceur : le premier rang s'arrête à 15 m, les derniers lancent de 18 à 20 m.
 */
export const THROW_DIST = 15;
export const THROW_DIST_BOLD = 12;
/** Portée retenue pour choisir sa cible (m). */
export const THROW_RANGE = 20;
export const SAFE_DIST = 42;
/** Un lanceur attend 6 à 10 s entre deux jets (dossier 03 §3.3). */
/** Nombre de groupes qui tiennent de front face à une ligne, dans la largeur d'une rue. */
export const FRONT_GROUPS = 2;
/** Intérêt perdu par groupe déjà au front au-delà de cette largeur (les suivants font autre chose). */
export const FRONT_CROWDED = 0.2;
export const VOLLEY_PAUSE_MIN = 6;
export const VOLLEY_PAUSE_MAX = 10;
/** Étalement des lancers d'une même salve (s) et délai d'attente du groupe avant de lancer quand même (s). */
export const VOLLEY_SPREAD = 1.3;
export const VOLLEY_READY_TIMEOUT = 9;
/** Tireurs de mortier : 30 à 60 m, de préférence derrière un obstacle (bible F.3). */
export const MORTAR_MIN = 28;
export const MORTAR_MAX = 55;
export const MORTAR_INTERVAL = 1.8;
/** Engins incendiaires : portée de lancer (m). */
export const MOLOTOV_RANGE = 22;
/** Une ligne à moins de cette distance qui avance fait reculer le groupe (m, bible F.3 : 15 m). */
export const RETREAT_DIST = 16;
export const CHARGE_CLOSING = 1.6;
/** Tous à plus de 40 m de l'engin lanceur d'eau (bible F.3). */
export const WATER_KEEP = 42;
export const ARMOUR_KEEP = 35;
/** Gaz : exposition moyenne du groupe et concentration au point du groupe qui déclenchent le repli. */
export const GAS_BREAK = 0.42;
export const GAS_FIELD_BREAK = 0.55;
/** Exposition individuelle au-delà de laquelle un membre lâche tout pour sortir du nuage. */
export const GAS_PERSONAL = 0.5;

/** Charge au contact : agent isolé = au plus ce nombre de collègues valides à moins de ISOLATED_RADIUS. */
export const ISOLATED_MATES = 1;
export const ISOLATED_RADIUS = 10;
export const ASSAULT_RANGE = 45;
/** Libération d'un interpellé : distance de décision (m) et taille maximale de l'escorte attaquée. */
export const RESCUE_RANGE = 60;
export const RESCUE_ESCORT_MAX = 6;
export const RESCUE_SECONDS = 35;

/** Renvoi des grenades : rayon de réaction (m), durée du coup de pied (s). */
export const RETURN_RADIUS = 9;
export const KICK_SECONDS = 0.45;
export const KICK_POWER = 0.25;

/** Barricade (dossier 03 §3.3 : 8 m en 40 à 90 s à six) : rayon de collecte, volume visé, distance aux forces. */
export const BARRICADE_COLLECT = 55;
export const BARRICADE_BULK = 7;
export const BARRICADE_FROM_POLICE = 38;
export const BARRICADE_SECONDS = 110;
export const BARRICADE_SPACING = 1.1;

/** Casse : rayon de recherche des cibles (m), coups par vitrine avant de passer à autre chose. */
export const BREAK_RADIUS = 70;
export const BREAK_SECONDS = 45;
export const SHUTTER_HITS = 40;
/** Renversement d'une voiture : nombre de bras recherché. */
export const FLIP_CREW = 6;

// ───────────────────────────── munitions ─────────────────────────────

/** Rayon de recherche d'une source de projectiles (m) : mobilier, puis chaussée pavée, puis plus loin. */
export const SUPPLY_NEAR = 45;
export const SUPPLY_FAR = 200;
/** Part des lanceurs sans projectile au-delà de laquelle le groupe part se réapprovisionner. */
export const SUPPLY_TRIGGER = 0.6;
export const SUPPLY_SECONDS = 50;

// ───────────────────────────── repli, manifestation sauvage, fusion ─────────────────────────────

/** Petits groupes de repli (personnes) et distance des points de ralliement (m). */
export const SCATTER_TEAM = 4;
export const RALLY_MIN = 70;
export const RALLY_MAX = 130;
/** Un point de ralliement est « hors parcours » à plus de cette distance du parcours déclaré (m). */
export const OFF_ROUTE = 35;
export const SCATTER_SECONDS = 55;
/** Manifestation sauvage : si plus rien ne se présente, le bloc se déplace (m) après ce délai (s). */
export const ROAM_AFTER = 14;
export const ROAM_DIST = 90;
export const REGROUP_SECONDS = 40;
/** Pour se fondre dans la foule il faut des manifestants autour de soi (personnes à moins de 20 m). */
export const MELT_COVER = 12;
export const MELT_SECONDS = 30;

// ───────────────────────────── suiveurs et pilleurs (bible F.3, F.5) ─────────────────────────────

/** Un suiveur imite si trois radicaux agissent à moins de 20 m et qu'aucune ligne n'est à moins de 25 m. */
export const FOLLOW_RADIUS = 20;
export const FOLLOW_MIN_ACTING = 3;
export const FOLLOW_POLICE_KEEP = 25;
/** Pilleur : recule si une unité est visible à moins de 60 m, quitte les lieux à moins de 40 m. */
export const LOOTER_BACK = 60;
export const LOOTER_QUIT = 40;
/** Attrait d'une vitrine ouverte : rayon de base (m), rayon ajouté par pillage constaté, plafond. */
export const LOOT_RADIUS = 40;
export const LOOT_RADIUS_PER = 12;
export const LOOT_RADIUS_MAX = 130;
/** Probabilité par réflexion qu'un suiveur à portée se laisse tenter, à chaleur 1 ; multiplicateur de nuit. */
export const LOOT_PULL = 0.22;
export const LOOT_NIGHT = 1.7;
/** Durée pendant laquelle un pillage récent attire (s). */
export const LOOT_MEMORY = 120;

/** Poids des cibles de la casse (bible F.5), par catégorie de boutique. */
export const SHOP_WEIGHT: Readonly<Record<string, number>> = {
  banque: 9, agence: 7, restauration_rapide: 7, luxe: 6, telephonie: 6, bijouterie: 6, supermarche: 5, mode: 4,
  hotel: 3, tabac_presse: 1, alimentation: 1, cafe_restaurant: 1, autre: 1, pharmacie: 0,
};
/** Attrait pour les pilleurs (bible F.5 : tabac, téléphonie, optique, alimentation, habillement). */
export const LOOT_WEIGHT: Readonly<Record<string, number>> = {
  telephonie: 9, tabac_presse: 9, mode: 8, bijouterie: 8, luxe: 8, supermarche: 7, alimentation: 6,
  restauration_rapide: 3, banque: 0, agence: 0, pharmacie: 0, hotel: 0, cafe_restaurant: 2, autre: 2,
};
/** Poids du mobilier visé (bible F.5). */
export const PROP_WEIGHT: Readonly<Record<string, number>> = {
  distributeur: 9, panneau_pub: 8, abribus: 8, horodateur: 6, camera: 6, kiosque: 5, colonne_morris: 4,
  station_velo: 4,
};
/** Mobilier qui sert de matière à barricade, et son volume (comme le module du décor). */
export const BARRICADE_BULK_OF: Readonly<Record<string, number>> = {
  conteneur: 2, barriere_vauban: 1.5, barriere_chantier: 1.5, poubelle: 1, palette: 1, velo: 1,
  table_terrasse: 0.8, trottinette: 0.7, chaise: 0.4,
};
