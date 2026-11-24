/* =====================================================================================
 * Service étendu du module « environnement » : ctx.service<EnvExtApi>('env.ext').
 *
 * Le contrat (EnvApi / EnvState) suffit à la plupart des modules. Ce service ajoute ce dont le
 * rendu du ciel et quelques systèmes ont besoin : direction RÉELLE du soleil (même sous
 * l'horizon), lune et phase, éclairs, vent moyen et rafales, horaires du soleil.
 * Les autres modules l'importent en `import type` uniquement.
 * ===================================================================================== */

import type { WeatherKind } from '@/core/contracts';

export const ENV_EXT_SERVICE = 'env.ext';

/** Événement libre émis à chaque éclair : ctx.events.onAny('env:lightning', …). */
export const ENV_LIGHTNING_EVENT = 'env:lightning';

export interface LightningStrike {
  /** Point d'impact approximatif (repère monde). */
  x: number;
  z: number;
  /** Distance au centre de la session (m) : le tonnerre arrive distance / 340 s plus tard. */
  distance: number;
  /** Puissance relative 0..1. */
  intensity: number;
}

export interface EnvSkyState {
  /** Direction réelle vers le soleil, unitaire ; y < 0 quand il est sous l'horizon. */
  sunX: number; sunY: number; sunZ: number;
  /** Hauteur apparente du soleil (rad) et azimut (rad depuis le nord, vers l'est). */
  sunElevation: number;
  sunAzimuth: number;
  /** Direction réelle vers la lune, unitaire. */
  moonX: number; moonY: number; moonZ: number;
  moonElevation: number;
  moonAzimuth: number;
  /** Fraction éclairée du disque lunaire (0 = nouvelle lune, 1 = pleine lune). */
  moonPhase: number;
  /** Astre qui éclaire la scène : celui dont EnvState.sunX/Y/Z donne la direction. */
  dominant: 'sun' | 'moon' | 'none';
  /** Éclat instantané des éclairs 0..1 (retombe en une fraction de seconde). */
  lightning: number;
  /** Direction horizontale (unitaire) du dernier éclair, pour illuminer les nuages de ce côté. */
  lightningX: number;
  lightningZ: number;
  /** Vent moyen (m/s), hors rafales. */
  windMeanX: number;
  windMeanZ: number;
  /** Rafale en cours : rapport de la vitesse instantanée à la vitesse moyenne, moins 1 (-0,5 … +1). */
  gust: number;
  /** Déplacement cumulé des nuages (m, repère monde) : intégrale du vent, pour faire défiler le ciel. */
  cloudX: number;
  cloudZ: number;
  /** Lumière ambiante 0..1 tenant compte de la couverture nuageuse (sert au déclenchement de l'éclairage public). */
  ambient: number;
  /** Jours écoulés depuis le début de la session (l'horloge a passé minuit autant de fois). */
  day: number;
  /** Horaires du soleil ce jour-là (heures légales). */
  sunrise: number;
  sunset: number;
  solarNoon: number;
}

export interface EnvExtApi {
  readonly sky: EnvSkyState;
  /** La météo évolue d'elle-même (monde ouvert) ou reste celle demandée (missions). */
  dynamicWeather: boolean;
  /** Amplitude des rafales : 0 = vent parfaitement régulier, 1 = rafales de la météo courante. */
  gustiness: number;
  /** Rend la main à la météo pour le vent moyen (après un setWind explicite). */
  releaseWind(): void;
  /** Déclenche un éclair (script de mission, banc d'essai). */
  strike(intensity?: number): void;
  /** Force l'humidité du sol 0..1 (canon à eau, scénario « après la pluie »). */
  setWetness(value: number): void;
  /** Météo vers laquelle l'état est en train de tendre et avancement 0..1 de la transition. */
  readonly target: WeatherKind;
  readonly transition: number;
  /** Texte de l'heure courante, « 14 h 05 ». */
  timeLabel(): string;
}
