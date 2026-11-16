/* =====================================================================================
 * DANGERS DIFFUS — constantes de grille et réglages physiques.
 *
 * Sources des valeurs (niveau gameplay) : docs/research/00-bible-realisme.md §G.1 et §G.4,
 * 02-materiel-tenues-vehicules.md §3.6, 03-dynamique-manifestation.md §4.3 :
 *   - dérive du nuage = vent × 0,8 ; étalement latéral ≈ 0,3 m/s ;
 *   - persistance après émission : 60 à 180 s sans vent, 20 à 40 s au-delà de 15 km/h, ÷ 2 sous la pluie ;
 *   - rue de moins de 12 m : concentration × 2 (confinement), durée × 1,5 ;
 *   - flaque de feu d'un engin incendiaire : Ø 2 à 3 m pendant 20 à 40 s ; fumée noire #141414 ;
 *   - un feu de bac roulant demande 8 s d'extincteur ou 3 s de canon à eau.
 * ===================================================================================== */

// ───────────────────────────── grille ─────────────────────────────

/** Côté d'une cellule (m). */
export const CELL = 2;
export const INV_CELL = 1 / CELL;
/** Un bloc = 16 × 16 cellules = 32 m de côté, alloué à la demande. */
export const BLOCK_SHIFT = 4;
export const BLOCK_CELLS = 1 << BLOCK_SHIFT;
export const BLOCK_MASK = BLOCK_CELLS - 1;
export const BLOCK_AREA = BLOCK_CELLS * BLOCK_CELLS;
export const BLOCK_SIZE = BLOCK_CELLS * CELL;
/** Indices de bloc admis : [−BLOCK_RANGE, BLOCK_RANGE[ (soit ± 524 km : largement au-delà de la carte). */
export const BLOCK_RANGE = 16384;
/** Plafond du nombre de blocs alloués (au-delà, le nuage ne s'étend plus). */
export const MAX_BLOCKS = 768;

/** Pas de temps du champ (s) : le gaz et la fumée avancent à 10 Hz, en alternance, quel que soit le pas du moteur. */
export const FIELD_DT = 0.1;
/** Nombre de Courant maximal par axe et par sous-pas (garantit la positivité du schéma amont). */
export const COURANT_MAX = 0.2;
/** Nombre maximal de sous-pas par pas de champ (grand vent). Au-delà, la dérive est plafonnée. */
export const MAX_SUBSTEPS = 4;
/** Période de rafraîchissement des coefficients d'un bloc (en pas de champ), étalée entre les blocs. */
export const REFRESH_PERIOD = 8;
/** Nombre de blocs de bâti analysés (ouverture des rues) par pas d'entretien. */
export const STATIC_JOBS_PER_STEP = 2;
/** Taille maximale du cache de bâti (blocs). */
export const STATIC_CACHE_MAX = 4096;

/** En dessous, une cellule est remise à zéro (évite les nombres dénormalisés et libère les blocs). */
export const CELL_EPS = 1e-4;
/** Un bord de bloc au-dessus de ce seuil fait allouer le bloc voisin. */
export const SPREAD_EPS = 0.008;
/** Un bloc dont le maximum reste sous ce seuil pendant IDLE_STEPS est libéré. */
export const FREE_EPS = 0.002;
/** Pas de champ d'inactivité avant libération d'un bloc (2 s). */
export const IDLE_STEPS = 20;

/** Concentration maximale stockée (une source ne sature pas indéfiniment la même cellule). */
export const GAS_CAP = 2.5;
export const SMOKE_CAP = 3;
/** Rayon minimal et maximal d'un dépôt (m). */
export const DEPOSIT_MIN_RADIUS = CELL;
export const DEPOSIT_MAX_RADIUS = 30;

// ───────────────────────────── couleurs ─────────────────────────────

/** Fumée par défaut d'emitSmoke (gris sombre). */
export const SMOKE_DEFAULT_COLOR = 0x2b2b2b;
/** Fumée d'incendie (plastique, hydrocarbures) — docs/research/03 §3.3. */
export const SMOKE_FIRE_COLOR = 0x141414;
/** Vapeur blanche dégagée par l'eau sur un feu. */
export const STEAM_COLOR = 0xc9cccc;

// ───────────────────────────── réglages ─────────────────────────────

export interface HazardTuning {
  /** Dérive du nuage = vent × driftFactor. */
  driftFactor: number;
  /** Diffusion turbulente de base, air calme (m²/s). */
  diffusion: number;
  /** Supplément de diffusion par m/s de dérive (m²/s par m/s) : le vent brasse le nuage. */
  windDiffusion: number;
  /** Taux de dilution du gaz au ras du sol, air calme et lieu dégagé (1/s). */
  gasDecay: number;
  /** Taux de dilution de la fumée (1/s) : plus chaude, elle monte plus vite. */
  smokeDecay: number;
  /** Accélération de la dilution par m/s de dérive locale. */
  windDecay: number;
  /** Accélération de la dilution par unité de pluie (env.rain 0..1) : « pluie » (0,5) divise la durée par 2. */
  rainDecay: number;
  /** Part de la dilution supprimée dans une rue étroite (0,33 → durée × 1,5). */
  canyonRetention: number;
  /** Largeur libre (m) sous laquelle une rue est totalement abritée du vent de travers. */
  openMin: number;
  /** Largeur libre (m) à partir de laquelle le vent passe sans abri. */
  openMax: number;
  /** Part du vent d'enfilade conservée dans une rue étroite (frottement des façades). */
  canyonAlong: number;
  /** Amplitude relative des rafales (0,2 = ± 20 % de vitesse). 0 = vent parfaitement régulier. */
  gust: number;
  /** Amplitude des sautes de direction (rad). */
  veer: number;
  /** Brassage lent de l'air calme (m/s) : un nuage sans vent ne reste pas figé. */
  meander: number;
  /** Extinction optique par mètre et par unité de fumée. */
  smokeOpacity: number;
  /** Extinction optique par mètre et par unité de gaz au-dessus de gasOpacityMin. */
  gasOpacity: number;
  gasOpacityMin: number;
  /** Part du gaz et de la fumée rabattue par unité d'eau au centre du jet. */
  washout: number;
  /** Durée d'une nappe de feu d'intensité 0 et d'intensité 1 (s), avant aléa de ± 15 %. */
  fireMinSeconds: number;
  fireMaxSeconds: number;
  /** Unités d'eau nécessaires pour éteindre une nappe de 1,25 m de rayon à pleine intensité. */
  fireHeat: number;
  /** Fumée émise par seconde au cœur d'un feu à pleine intensité (unités de smokeAt). */
  fireSmokeRate: number;
  /** Nombre maximal de nappes de feu simultanées. */
  maxFires: number;
}

export const DEFAULT_TUNING: Readonly<HazardTuning> = Object.freeze({
  driftFactor: 0.8,
  diffusion: 0.8,
  windDiffusion: 0.15,
  gasDecay: 1 / 45,
  smokeDecay: 1 / 30,
  windDecay: 0.5,
  rainDecay: 2,
  canyonRetention: 0.33,
  openMin: 12,
  openMax: 56,
  canyonAlong: 0.75,
  gust: 0.2,
  veer: 0.2,
  meander: 0.12,
  smokeOpacity: 0.55,
  gasOpacity: 0.14,
  gasOpacityMin: 0.12,
  washout: 0.45,
  fireMinSeconds: 20,
  fireMaxSeconds: 40,
  fireHeat: 3,
  fireSmokeRate: 0.35,
  maxFires: 96,
});

/** Réglages complets à partir de valeurs partielles (tests, bancs d'essai). */
export function makeTuning(partial: Partial<HazardTuning> = {}): HazardTuning {
  return { ...DEFAULT_TUNING, ...partial };
}
