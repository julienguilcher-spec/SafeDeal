/* Rythmes lumineux — logique pure (testée sous Node).
 *
 * Feux d'urgence français : toujours bleus, « 2 à 4 éclats par seconde, doubles flashs alternés
 * gauche / droite » (dossier 02 §4.8). Trois motifs :
 *   - 'rampe'  : rampe de toit à LED, double éclat du côté A puis double éclat du côté B ;
 *   - 'gyro'   : gyrophare tournant (pompiers, engins anciens) : impulsion douce, les deux feux en opposition ;
 *   - 'strobe' : feux de calandre / de moto : éclat simple alterné, plus rapide.
 * Clignotants : 90 battements par minute (la réglementation impose 60 à 120), rapport cyclique 50 %.
 */

export type BeaconPattern = 'rampe' | 'gyro' | 'strobe';

/** Durée d'un cycle complet (s) par motif. */
export const BEACON_PERIOD: Readonly<Record<BeaconPattern, number>> = { rampe: 0.6, gyro: 0.8, strobe: 0.5 };

/** Durée d'un éclat de LED (s) et intervalle entre les deux éclats d'un double flash. */
export const FLASH_ON = 0.06;
export const FLASH_GAP = 0.06;

/** Fréquence des clignotants (Hz) : 90 par minute. */
export const INDICATOR_HZ = 1.5;

function frac(x: number): number {
  return x - Math.floor(x);
}

/**
 * Niveau lumineux 0..1 d'un des deux groupes de feux (side 0 = A, gauche ; 1 = B, droite) à l'instant t.
 * `phase` (0..1) décale le cycle d'un véhicule à l'autre pour qu'ils ne clignotent pas à l'unisson.
 */
export function beaconLevel(pattern: BeaconPattern, t: number, side: 0 | 1, phase = 0): number {
  const period = BEACON_PERIOD[pattern];
  // position dans le cycle, côté B décalé d'une demi-période
  const u = frac(t / period + phase + (side === 1 ? 0.5 : 0)) * period;
  if (pattern === 'rampe') {
    // double éclat pendant la première moitié du cycle
    if (u < FLASH_ON) return 1;
    if (u >= FLASH_ON + FLASH_GAP && u < 2 * FLASH_ON + FLASH_GAP) return 1;
    return 0;
  }
  if (pattern === 'strobe') {
    return u < 0.09 ? 1 : 0;
  }
  // gyrophare tournant : lobe lumineux qui passe devant l'observateur une fois par tour
  const c = Math.cos((u / period) * Math.PI * 2);
  return c <= 0 ? 0 : c * c * c;
}

/** Nombre d'éclats par seconde émis par UN groupe de feux pour un motif (pour les tests et l'audio visuel). */
export function flashesPerSecond(pattern: BeaconPattern): number {
  const perCycle = pattern === 'rampe' ? 2 : 1;
  return perCycle / BEACON_PERIOD[pattern];
}

/** Clignotant allumé à l'instant t ? */
export function indicatorOn(t: number): boolean {
  return frac(t * INDICATOR_HZ) < 0.5;
}

/**
 * Motif de gyrophare adapté à un type de véhicule. Voiture banalisée de la BAC : gyrophare aimanté à LED et feux à
 * éclats de calandre, en éclats simples alternés (le dôme et le feu de calandre gauche, puis le feu de droite).
 */
export function beaconPatternFor(kind: string): BeaconPattern {
  if (kind === 'camion_pompiers' || kind === 'centaure' || kind === 'canon_eau') return 'gyro';
  if (kind === 'moto_bravm' || kind === 'helicoptere' || kind === 'drone' || kind === 'voiture_bac') return 'strobe';
  return 'rampe';
}

/** Décalage de cycle déterministe (0..1) d'après l'identifiant du véhicule. */
export function beaconPhaseFor(id: number): number {
  let h = (id | 0) * 0x9e3779b1;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 1024) / 1024;
}
