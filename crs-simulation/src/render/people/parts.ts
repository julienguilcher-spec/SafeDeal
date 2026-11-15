/* Pièces optionnelles du personnage (coiffures, casques, protections, marquages…). Chaque pièce est un
 * bit du masque d'options de la personne ; la pièce 0 est toujours affichée. */

export const PART_BASE = 0;
export const PART_HAIR_BUZZ = 1;
export const PART_HAIR_SHORT = 2;
export const PART_HAIR_MEDIUM = 3;
export const PART_HAIR_LONG = 4;
export const PART_HAIR_PONYTAIL = 5;
export const PART_HAIR_BUN = 6;
export const PART_HAIR_AFRO = 7;
export const PART_BEARD = 8;
export const PART_HELMET_MO = 9;
export const PART_HELMET_STRIPES = 10;
export const PART_HELMET_MOTO = 11;
export const PART_HELMET_LIGHT = 12;
export const PART_HELMET_POMPIER = 13;
export const PART_HELMET_TEXT = 14;
export const PART_HOOD_UP = 15;
export const PART_CAP = 16;
export const PART_BEANIE = 17;
export const PART_BALACLAVA = 18;
export const PART_CALOT = 19;
export const PART_CAP_POLICE = 20;
export const PART_GAS_MASK = 21;
export const PART_FACE_COVER = 22;
export const PART_GOGGLES = 23;
export const PART_VEST_TACTICAL = 24;
export const PART_ARM_GUARDS = 25;
export const PART_LEG_GUARDS = 26;
export const PART_BACK_TEXT = 27;
export const PART_BACK_TEXT_VEST = 28;
export const PART_CHEST_TEXT = 29;
export const PART_CHASUBLE = 30;
export const PART_REFLECT_BANDS = 31;
export const PART_SASH = 32;
export const PART_ARMBAND = 33;
export const PART_BACKPACK = 34;
export const PART_JACKET = 35;
export const PART_COAT = 36;
export const PART_HOOD_DOWN = 37;
export const PART_SKIRT = 38;
export const PART_SUIT = 39;
export const PART_BELT_GEAR = 40;
export const PART_RANK = 41;
export const PART_HAND_L_OPEN = 42;
export const PART_HAND_L_FIST = 43;
export const PART_HAND_R_OPEN = 44;
export const PART_HAND_R_FIST = 45;
export const PART_CROSS = 46;
export const PART_LIMB_BANDS = 47;
export const PART_SCARF = 48;
export const PART_CHEST_TEXT_VEST = 49;
/** Écusson rouge des CRS sur la poitrine droite (vêtement léger / gilet). */
export const PART_BADGE = 50;
export const PART_BADGE_VEST = 51;
export const PART_COUNT = 52;

/** Nombre de bits par mot du masque (les mots sont stockés dans des flottants de texture). */
export const MASK_BITS = 24;
