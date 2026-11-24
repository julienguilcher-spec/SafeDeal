/* Paramètres de pose : description « sémantique » d'une pose (angles et cibles de mains), produite par
 * les générateurs (locomotion, postures, animations du haut du corps) puis résolue en rotations d'os.
 *
 * Conventions de signe des paramètres (toutes « naturelles ») :
 *   - tronc/tête (rx, ry, rz) : rx > 0 = penché vers l'avant ; ry > 0 = tourne vers la gauche ;
 *     rz > 0 = incline vers la droite.
 *   - jambes : hanche flexion > 0 vers l'avant, torsion > 0 pointe du pied vers l'extérieur,
 *     abduction > 0 vers l'extérieur, genou > 0 fléchi, cheville > 0 pointe relevée.
 *   - bras en mode FK : balancement > 0 vers l'avant, abduction > 0 vers l'extérieur, coude > 0 fléchi.
 *   - bras en mode IK : cible du poignet dans le repère du THORAX (m à l'échelle 1), avec x > 0 vers
 *     l'EXTÉRIEUR du corps (repère « miroir » : la même valeur vaut pour le bras gauche et le droit).
 */

export const P_PX = 0;
export const P_PY = 1;
export const P_PZ = 2;
export const P_RX = 3;
export const P_RY = 4;
export const P_RZ = 5;
export const P_SPINE = 6;
export const P_CHEST = 9;
export const P_NECK = 12;
export const P_HEAD = 15;
export const P_LEG_L = 18;
export const P_LEG_R = 23;
export const P_ARM_L = 28;
export const P_ARM_R = 42;
export const P_SIZE = 56;

// jambe : décalages
export const LG_FLEX = 0;
export const LG_TWIST = 1;
export const LG_ABD = 2;
export const LG_KNEE = 3;
export const LG_ANKLE = 4;

// bras : décalages
export const A_MODE = 0;
// mode FK (0)
export const A_SWING = 1;
export const A_TWIST = 2;
export const A_ABD = 3;
export const A_ELBOW = 4;
export const A_WX = 5;
export const A_WY = 6;
export const A_WZ = 7;
// mode IK (1)
export const A_TX = 1;
export const A_TY = 2;
export const A_TZ = 3;
export const A_POLEX = 4;
export const A_POLEY = 5;
export const A_POLEZ = 6;
/** 0 = main dans le prolongement de l'avant-bras ; 1 = orientation absolue (d, u) ; 2 = pouce vers u. */
export const A_HMODE = 7;
export const A_DX = 8;
export const A_DY = 9;
export const A_DZ = 10;
export const A_UX = 11;
export const A_UY = 12;
export const A_UZ = 13;

export const ARM_FK = 0;
export const ARM_IK = 1;

// ── identifiants numériques ─────────────────────────────────────────────────────────

export const POSTURE_STAND = 0;
export const POSTURE_CROUCH = 1;
export const POSTURE_KNEEL = 2;
export const POSTURE_SIT = 3;
export const POSTURE_PRONE = 4;
export const POSTURE_DOWN = 5;
export const POSTURE_SEATED = 6;

export const POSTURE_NAMES: readonly string[] = ['stand', 'crouch', 'kneel', 'sit', 'prone', 'down', 'seated'];

/** Animations du haut du corps, dans l'ordre du contrat (UpperAnim), puis animations internes. */
export const UPPER_NAMES: readonly string[] = [
  'none', 'throw', 'strike', 'block', 'shield_carry', 'aim_long', 'aim_pistol', 'spray',
  'megaphone', 'radio', 'hands_up', 'fist', 'clap', 'carry_sign', 'carry_banner',
  'film', 'photo', 'treat', 'carry_person', 'drag', 'pickup', 'push', 'cover_face',
  'cuffed', 'umbrella', 'point', 'wave', 'drive', 'ride', 'kick', 'hammer',
  'spraypaint', 'carry_loot', 'extinguish', 'remote', 'cough', 'restrain',
  // internes (déduites de l'état : étourdissement, feu, personne portée / traînée)
  'stagger', 'burn', 'carried', 'dragged',
];

export const U_NONE = 0;
export const U_THROW = 1;
export const U_STRIKE = 2;
export const U_BLOCK = 3;
export const U_SHIELD_CARRY = 4;
export const U_AIM_LONG = 5;
export const U_AIM_PISTOL = 6;
export const U_SPRAY = 7;
export const U_MEGAPHONE = 8;
export const U_RADIO = 9;
export const U_HANDS_UP = 10;
export const U_FIST = 11;
export const U_CLAP = 12;
export const U_CARRY_SIGN = 13;
export const U_CARRY_BANNER = 14;
export const U_FILM = 15;
export const U_PHOTO = 16;
export const U_TREAT = 17;
export const U_CARRY_PERSON = 18;
export const U_DRAG = 19;
export const U_PICKUP = 20;
export const U_PUSH = 21;
export const U_COVER_FACE = 22;
export const U_CUFFED = 23;
export const U_UMBRELLA = 24;
export const U_POINT = 25;
export const U_WAVE = 26;
export const U_DRIVE = 27;
export const U_RIDE = 28;
export const U_KICK = 29;
export const U_HAMMER = 30;
export const U_SPRAYPAINT = 31;
export const U_CARRY_LOOT = 32;
export const U_EXTINGUISH = 33;
export const U_REMOTE = 34;
export const U_COUGH = 35;
export const U_RESTRAIN = 36;
export const U_STAGGER = 37;
export const U_BURN = 38;
export const U_CARRIED = 39;
export const U_DRAGGED = 40;

const UPPER_INDEX = new Map<string, number>();
for (let i = 0; i < UPPER_NAMES.length; i++) UPPER_INDEX.set(UPPER_NAMES[i], i);
const POSTURE_INDEX = new Map<string, number>();
for (let i = 0; i < POSTURE_NAMES.length; i++) POSTURE_INDEX.set(POSTURE_NAMES[i], i);

/** Identifiant numérique d'une animation du haut du corps (inconnue → 'none'). */
export function upperId(name: string): number {
  const v = UPPER_INDEX.get(name);
  return v === undefined ? U_NONE : v;
}

export function postureId(name: string): number {
  const v = POSTURE_INDEX.get(name);
  return v === undefined ? POSTURE_STAND : v;
}

/** Style de prise de l'objet tenu : détermine le maintien par défaut quand aucune animation n'est demandée. */
export const HOLD_NONE = 0;
export const HOLD_SMALL = 1;
export const HOLD_STICK = 2;
export const HOLD_SHIELD = 3;
export const HOLD_LONG = 4;
export const HOLD_PISTOL = 5;
export const HOLD_POLE = 6;
export const HOLD_BANNER = 7;
export const HOLD_LOOT = 8;
export const HOLD_CAMERA = 9;
export const HOLD_CAMERA_TV = 10;
export const HOLD_PHONE = 11;
export const HOLD_MEGAPHONE = 12;
export const HOLD_EXTINGUISHER = 13;
export const HOLD_BAG = 14;
export const HOLD_REMOTE = 15;
export const HOLD_SPRAY = 16;

export const HOLD_NAMES: readonly string[] = [
  'none', 'small', 'stick', 'shield', 'long', 'pistol', 'pole', 'banner', 'loot', 'camera',
  'camera_tv', 'phone', 'megaphone', 'extinguisher', 'bag', 'remote', 'spray',
];

export const INJURY_NONE = 0;
export const INJURY_LIGHT = 1;
export const INJURY_SERIOUS = 2;
export const INJURY_CRITICAL = 3;
export const INJURY_DEAD = 4;

/** Entrée du calcul de pose (objet réutilisé, aucun champ optionnel). */
export interface PoseInput {
  /** Temps d'animation global (s). */
  t: number;
  /** Aléa propre à la personne, 0..1. */
  seed: number;
  /** Variante entière propre à la personne (choix de postures au sol, côté de boiterie…). */
  variant: number;
  /** Phase du cycle de marche, 0..1 (un cycle = deux pas). */
  phase: number;
  /** Vitesse horizontale réelle (m/s). */
  speed: number;
  /** Direction du déplacement dans le repère du corps (unitaire) : avant et gauche. */
  moveFwd: number;
  moveSide: number;
  /** Vitesse de rotation du corps (rad/s). */
  turnRate: number;
  posture: number;
  upper: number;
  upperT: number;
  /** Visée relative au corps (rad) : lacet (> 0 = à gauche) et site (> 0 = vers le haut). */
  aimYaw: number;
  aimPitch: number;
  alt: boolean;
  hold: number;
  /** Exposition effective au gaz 0..1. */
  gas: number;
  stun: number;
  burning: number;
  injury: number;
  cuffed: boolean;
  /** Échelle de taille (look.height / 1,75). */
  scale: number;
  /** Angle du volant (-1..1) pour 'drive' / 'ride'. */
  steer: number;
  /** Vue à la première personne : seules les mains comptent. */
  fp: boolean;
  /** Sorties intermédiaires : abaissement / recul du bassin demandés par l'animation du haut du corps. */
  pelvisDY: number;
  pelvisDZ: number;
}

export function createPoseInput(): PoseInput {
  return {
    t: 0, seed: 0, variant: 0, phase: 0, speed: 0, moveFwd: 1, moveSide: 0, turnRate: 0,
    posture: POSTURE_STAND, upper: U_NONE, upperT: 0, aimYaw: 0, aimPitch: 0, alt: false,
    hold: HOLD_NONE, gas: 0, stun: 0, burning: 0, injury: INJURY_NONE, cuffed: false,
    scale: 1, steer: 0, fp: false, pelvisDY: 0, pelvisDZ: 0,
  };
}

// ── aides d'écriture des bras ───────────────────────────────────────────────────────

/** Bras en cinématique directe : balancement, abduction, flexion du coude, torsion. */
export function armFK(P: Float64Array, base: number, swing: number, abd: number, elbow: number, twist: number): void {
  P[base + A_MODE] = ARM_FK;
  P[base + A_SWING] = swing;
  P[base + A_TWIST] = twist;
  P[base + A_ABD] = abd;
  P[base + A_ELBOW] = elbow;
  P[base + A_WX] = 0;
  P[base + A_WY] = 0;
  P[base + A_WZ] = 0;
}

/** Bras en cinématique inverse : cible du poignet et direction souhaitée du coude (repère thorax, x vers l'extérieur). */
export function armIK(
  P: Float64Array, base: number,
  tx: number, ty: number, tz: number,
  px: number, py: number, pz: number,
): void {
  P[base + A_MODE] = ARM_IK;
  P[base + A_TX] = tx;
  P[base + A_TY] = ty;
  P[base + A_TZ] = tz;
  P[base + A_POLEX] = px;
  P[base + A_POLEY] = py;
  P[base + A_POLEZ] = pz;
  P[base + A_HMODE] = 0;
}

/** Orientation absolue de la main : d = direction des doigts / du canon, u = côté du pouce / haut de l'objet. */
export function handAbs(P: Float64Array, base: number, dx: number, dy: number, dz: number, ux: number, uy: number, uz: number): void {
  P[base + A_HMODE] = 1;
  P[base + A_DX] = dx;
  P[base + A_DY] = dy;
  P[base + A_DZ] = dz;
  P[base + A_UX] = ux;
  P[base + A_UY] = uy;
  P[base + A_UZ] = uz;
}

/** Main dans l'axe de l'avant-bras, pouce orienté au mieux vers u. */
export function handThumb(P: Float64Array, base: number, ux: number, uy: number, uz: number): void {
  P[base + A_HMODE] = 2;
  P[base + A_UX] = ux;
  P[base + A_UY] = uy;
  P[base + A_UZ] = uz;
}

/**
 * Fait pivoter la cible et l'orientation de la main d'un bras IK autour de l'axe des épaules
 * (site de visée, > 0 vers le haut). Pivot (py, pz) dans le repère du thorax.
 */
export function armPitch(P: Float64Array, base: number, pitch: number, py: number, pz: number): void {
  if (pitch === 0 || P[base + A_MODE] !== ARM_IK) return;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  let y = P[base + A_TY] - py, z = P[base + A_TZ] - pz;
  P[base + A_TY] = py + y * c + z * s;
  P[base + A_TZ] = pz - y * s + z * c;
  y = P[base + A_POLEY]; z = P[base + A_POLEZ];
  P[base + A_POLEY] = y * c + z * s;
  P[base + A_POLEZ] = -y * s + z * c;
  if (P[base + A_HMODE] !== 0) {
    y = P[base + A_UY]; z = P[base + A_UZ];
    P[base + A_UY] = y * c + z * s;
    P[base + A_UZ] = -y * s + z * c;
    if (P[base + A_HMODE] === 1) {
      y = P[base + A_DY]; z = P[base + A_DZ];
      P[base + A_DY] = y * c + z * s;
      P[base + A_DZ] = -y * s + z * c;
    }
  }
}
