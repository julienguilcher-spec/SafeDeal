/* =====================================================================================
 * Effets visuels — conversion concentration → densité visuelle (logique pure).
 *
 * Le champ des dangers donne une concentration de gaz (0 = air pur, 1 = insoutenable) et une
 * densité de fumée (0..1 = opacité utile). Une bouffée représente un tronçon de nuage de
 * longueur `path` (m) : son opacité suit la loi de Beer-Lambert, de sorte que deux bouffées de
 * 2 m traversées à la suite masquent exactement autant qu'une bouffée de 4 m. Regarder à travers
 * 10 m de nuage donne donc la même opacité quel que soit le niveau de détail.
 *
 * Coefficients : volontairement plus couvrants que ceux de la simulation pour la visée des IA
 * (visibility : 0,55 par mètre et par unité de fumée, 0,14 pour le gaz au-dessus de 0,12), parce qu'un
 * nuage doit se LIRE de loin et que le champ reste dilué dès qu'il y a du vent (repères du gaz :
 * 0,05 = perceptible, 0,1 = bord du nuage, 0,5 = près d'un palet ; 0,12 au plus par vent de 18 km/h).
 * ===================================================================================== */

/** Extinction du lacrymogène (par mètre et par unité de concentration). */
export const GAS_SIGMA = 0.85;
/** Extinction de la fumée (par mètre et par unité de densité). */
export const SMOKE_SIGMA = 0.9;
/** Concentration sous laquelle rien n'est dessiné. */
export const GAS_VISIBLE_MIN = 0.015;
export const SMOKE_VISIBLE_MIN = 0.015;
/** Opacité maximale d'une seule bouffée : au-delà, les volutes se découpent comme du coton ; l'opacité d'un nuage dense vient de l'empilement. */
export const PUFF_ALPHA_MAX = 0.66;

/** Opacité d'un tronçon de `path` mètres de gaz à la concentration `c` (0..1, croissante, bornée). */
export function gasOpacity(c: number, path: number): number {
  const e = c - GAS_VISIBLE_MIN;
  if (!(e > 0) || !(path > 0)) return 0;
  return 1 - Math.exp(-GAS_SIGMA * e * path);
}

/** Opacité d'un tronçon de `path` mètres de fumée de densité `s`. */
export function smokeOpacity(s: number, path: number): number {
  const e = s - SMOKE_VISIBLE_MIN;
  if (!(e > 0) || !(path > 0)) return 0;
  return 1 - Math.exp(-SMOKE_SIGMA * e * path);
}

/** Opacité d'une bouffée mêlant gaz et fumée (les transmittances se multiplient). */
export function puffAlpha(gas: number, smoke: number, path: number): number {
  const a = 1 - (1 - gasOpacity(gas, path)) * (1 - smokeOpacity(smoke, path));
  return a > PUFF_ALPHA_MAX ? PUFF_ALPHA_MAX : a;
}

/** Part de la fumée dans l'opacité d'une bouffée (0 = gaz pur, 1 = fumée pure) : pondère la couleur. */
export function smokeShare(gas: number, smoke: number): number {
  const g = GAS_SIGMA * Math.max(0, gas - GAS_VISIBLE_MIN);
  const s = SMOKE_SIGMA * Math.max(0, smoke - SMOKE_VISIBLE_MIN);
  const t = g + s;
  return t > 1e-9 ? s / t : 0;
}

/**
 * Hauteur du nuage (m) selon la concentration : un voile ténu reste bas (≈ 2 m), un nuage dense
 * atteint 5 m (dossier de réalisme : 3 à 5 m de haut).
 */
export function cloudHeight(density: number): number {
  const k = density <= 0 ? 0 : density >= 0.6 ? 1 : density / 0.6;
  return 2 + 3 * k * (2 - k);
}

/** Albédo du lacrymogène : blanc cassé (#E4E6E1) qui grisonne quand le nuage s'épaissit (#C7CBC6). */
export const GAS_ALBEDO_THIN: readonly [number, number, number] = [0.78, 0.79, 0.76];
export const GAS_ALBEDO_DENSE: readonly [number, number, number] = [0.58, 0.6, 0.57];

/** Écrit dans `out` (r, g, b linéaires) l'albédo d'une bouffée de gaz à la concentration `c`. */
export function gasAlbedo(c: number, out: Float32Array | number[]): void {
  const k = c <= 0 ? 0 : c >= 0.8 ? 1 : c / 0.8;
  out[0] = GAS_ALBEDO_THIN[0] + (GAS_ALBEDO_DENSE[0] - GAS_ALBEDO_THIN[0]) * k;
  out[1] = GAS_ALBEDO_THIN[1] + (GAS_ALBEDO_DENSE[1] - GAS_ALBEDO_THIN[1]) * k;
  out[2] = GAS_ALBEDO_THIN[2] + (GAS_ALBEDO_DENSE[2] - GAS_ALBEDO_THIN[2]) * k;
}

/**
 * Secousse de caméra demandée pour une explosion (0 = aucune) : dépend du type d'engin et de la
 * distance à la caméra. Retourne l'amplitude ; la durée se déduit par shakeSeconds().
 */
export function shakeFor(kind: string, radius: number, distance: number): number {
  let base = 0.18;
  let reach = 18;
  switch (kind) {
    case 'vehicule': base = 0.95; reach = 70; break;
    case 'gm2l': base = 0.75; reach = 50; break;
    case 'desencerclement': base = 0.6; reach = 38; break;
    case 'mortier': base = 0.3; reach = 26; break;
    case 'molotov': base = 0.14; reach = 14; break;
    case 'grenade_lacrymo_main':
    case 'grenade_lacrymo_56': base = 0.07; reach = 9; break;
    case 'fusee_rouge': return 0;
    default:
      // type inconnu : proportionné au rayon annoncé
      base = Math.min(0.9, 0.08 + radius * 0.07);
      reach = 10 + radius * 5;
      break;
  }
  if (!(distance < reach)) return 0;
  const k = 1 - distance / reach;
  return base * k * k;
}

export function shakeSeconds(amount: number): number {
  return amount <= 0 ? 0 : 0.18 + 0.55 * Math.min(1, amount);
}
