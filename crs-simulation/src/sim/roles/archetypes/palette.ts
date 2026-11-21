/* =====================================================================================
 * ARCHÉTYPES — palette. Toutes les teintes viennent de docs/research/00-bible-realisme.md §D et
 * de docs/research/02-materiel-tenues-vehicules.md §8 (valeurs estimées d'après photos, sauf mention).
 * Couleurs : entiers 0xRRGGBB.
 * ===================================================================================== */

// ── forces de l'ordre ──
/** Tenue de maintien de l'ordre des CRS : marine très sombre. */
export const CRS_NAVY = 0x1a2238;
/** Protections rigides, gilet tactique. */
export const PROTECTION_BLACK = 0x15171a;
/** Coque du casque de CRS (bleu nuit presque noir, brillant). */
export const CRS_HELMET = 0x0f1420;
/** Les deux bandes jaunes du casque de CRS (vérifié). */
export const CRS_BAND = 0xf5c400;
/** Tenue de service marine (commissaire en tenue, télépilote, conducteur). */
export const SERVICE_NAVY = 0x1c2542;
/** Gendarmerie mobile : tenue, casque entièrement bleu (vérifié), insignes or. */
export const GENDARME_DARK = 0x0e1220;
export const GENDARME_HELMET = 0x2f55a4;
export const GENDARME_GOLD = 0xc9a227;
/** BRAV-M : noir, casque de moto gardé à pied. */
export const BRAV_BLACK = 0x0b0b0d;
export const BRAV_HELMET_DARK = 0x111111;
export const BRAV_HELMET_LIGHT = 0xe8ebee;
/** Brassard « POLICE » du policier en civil. */
export const POLICE_ARMBAND = 0xff6a00;
/** Costume sombre de l'autorité civile. */
export const SUIT_DARK = 0x1f2430;
/** Galons : argent, blanc des officiers, raie rouge, or (gendarmerie). */
export const RANK_SILVER = 0xc9ced6;
export const RANK_WHITE = 0xf4f4f4;
export const RANK_GOLD = 0xd4af37;
export const BOOT_BLACK = 0x0b0b0d;

// ── secours ──
export const POMPIER_NAVY = 0x1b2440;
export const POMPIER_BAND = 0xe6d200;
export const POMPIER_HELMET = 0xc8ccd2;
export const SAMU_WHITE = 0xf4f4f4;
export const SAMU_BLUE = 0x003da5;
export const MEDIC_WHITE = 0xf5f5f5;
export const MEDIC_RED = 0xd62828;
export const MEDIC_BLUE = 0x1d4e89;

// ── presse, observateurs ──
export const PRESS_ARMBAND = 0xffffff;
export const PRESS_HELMET_BLACK = 0x18181a;
export const PRESS_HELMET_WHITE = 0xf0f0ec;
export const OBSERVER_VEST = 0xf5f5f5;
export const OBSERVER_BLUE = 0x2d6cdf;

// ── cortège ──
export const FLUO_YELLOW = 0xdfff00;
/** Chasubles syndicales de repli (quand la cause n'a pas d'organisation syndicale). */
export const CHASUBLE_COLORS: readonly number[] = [0xd62828, 0xf77f00, 0x1d4e89, 0x6a4c93, 0x2a9d8f, 0xf2c94c];
/** Brassard du service d'ordre. */
export const SO_ARMBAND = 0xc1121f;
export const STUDENT_JEANS = 0x3b5b8c;
export const STUDENT_SWEAT = 0x58c99b;
export const CLIMATE_GREEN = 0x3c8d4b;
export const CLIMATE_YELLOW = 0xf2c94c;
export const BLOUSE_WHITE = 0xf5f5f5;
export const BLOUSE_BLUE = 0xa9cce3;
export const FARMER_GREEN = 0x4b6b3c;
export const FARMER_STRAW = 0xc8a24a;
export const SENIOR_BEIGE = 0xb8a98a;
export const SENIOR_GREY = 0x8a8d91;
export const BLOC_BLACK = 0x0b0b0d;
export const BLOC_ANTHRACITE = 0x1c1c1f;

// ── corps ──
export const SKIN_TONES: readonly number[] = [0xf3d4bd, 0xe8c1a3, 0xd9a981, 0xc08a62, 0x9a6845, 0x70482f, 0x4f3323];
/** Poids de tirage des teints (population d'une grande ville française ; estimé). */
export const SKIN_WEIGHTS: readonly number[] = [22, 26, 18, 13, 9, 7, 5];
export const HAIR_DARK: readonly number[] = [0x17120f, 0x2b1d14, 0x4a3021];
export const HAIR_LIGHT: readonly number[] = [0x6e4a2b, 0x9a7446, 0xc9a55f, 0x8c3f1f];
export const HAIR_GREY: readonly number[] = [0x8d8d8d, 0xb4b4b0, 0xd8d8d2];
/** Colorations vues dans un cortège étudiant ou militant. */
export const HAIR_DYED: readonly number[] = [0x3f6fb5, 0xb5407a, 0x3fa38a, 0xd9d2c4];

// ── vêtements civils crédibles pour Paris : beaucoup de noir, de marine, de gris et de beige ──
export const CIVIL_TOPS: readonly number[] = [
  0x17181b, 0x23272e, 0x1f2a44, 0x2a2f38, 0x34383f, 0x4a4f57, 0x6b6f76, 0x8c8f93, 0xcfcfc9, 0xe9e7df,
  0xb8a98a, 0xa08257, 0x7a5a3a, 0x3d4a36, 0x55613f, 0x2f4468, 0x4f6a8a, 0x6b2f2f, 0x8c3b34, 0x5a3f5c,
  0xb9963d, 0x2f5a57, 0xc7b299, 0x9d2b3a,
];
/** Hauts vifs (jeunes, militants climat, touristes). */
export const VIVID_TOPS: readonly number[] = [
  0x58c99b, 0xe0483c, 0xf2c94c, 0x3c8d4b, 0x2d6cdf, 0xe67e22, 0x7d3c98, 0xd95f8f, 0x1fa3a3, 0xf5f5f0,
];
export const CIVIL_BOTTOMS: readonly number[] = [
  0x15161a, 0x1b1d22, 0x2a2d33, 0x23304a, 0x2f4263, 0x3b5b8c, 0x43597a, 0x4a4a48, 0x6a655c, 0x8c806a,
  0x3a3328, 0xb7a98c,
];
export const CIVIL_SHOES: readonly number[] = [0x141414, 0x2a2a2c, 0x4a3524, 0x6b6b6b, 0xe8e8e4, 0xf2f2ee, 0x7a2f2f];
export const CAP_COLORS: readonly number[] = [0x1c2430, 0x2b2b2e, 0x6b1f24, 0x25402c, 0x3a3f55, 0x8a8f96, 0x20242c, 0x4a3a2a, 0xe6e2d6];
export const PACK_COLORS: readonly number[] = [0x2a2a2e, 0x333a48, 0x5a2226, 0x274a36, 0x4a4128, 0x2b3c60, 0x60646a, 0x26262a];
export const SCARF_COLORS: readonly number[] = [0x2a2a2e, 0x6b1f24, 0x1f2a44, 0x8a8f96, 0x3d4a36, 0xb9963d];
/** Costumes et tailleurs (personnalité officielle, commissaire en civil, commerçant de luxe). */
export const SUIT_COLORS: readonly number[] = [0x1d2230, 0x1f2430, 0x24262b, 0x2b2f3a, 0x33312f];
/** Tabliers de commerçant (café, boutique, alimentation). */
export const APRON_COLORS: readonly number[] = [0x17181b, 0x2f4a3a, 0xf0efe9, 0x6b1f24];

/** Une couleur est-elle un entier 0xRRGGBB valide ? */
export function isColor(c: number): boolean {
  return Number.isInteger(c) && c >= 0 && c <= 0xffffff;
}

/** Assombrit une couleur (k dans 0..1 : 1 = inchangée). */
export function shade(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}
