/* =====================================================================================
 * Préréglages de qualité du rendu de base. Logique pure (testable sous Node).
 *
 * « bas » vise un téléphone récent à 30 images/s : pas d'ombre portée, pas d'anticrénelage,
 * densité de pixels plafonnée, ciel allégé, peu de particules et de lumières dynamiques.
 * ===================================================================================== */

import type { QualityLevel, Settings } from '@/core/contracts';

export interface QualityPreset {
  level: QualityLevel;
  /** Anticrénelage matériel (MSAA) — fixé à la création du contexte WebGL. */
  antialias: boolean;
  /** Plafond de densité de pixels (devicePixelRatio), avant application de Settings.renderScale. */
  pixelRatioCap: number;
  /** Côté de la texture d'ombre par cascade (0 = pas d'ombre portée). */
  shadowMapSize: number;
  /** Portée des ombres depuis la caméra (m). */
  shadowDistance: number;
  /** Rayon du filtrage des ombres, en texels. */
  shadowRadius: number;
  /** Distance d'affichage maximale (m) : Settings.drawDistance est plafonné à cette valeur. */
  maxDrawDistance: number;
  /** Nombre maximal de traits de pluie et rayon de la zone de pluie autour de la caméra (m). */
  rainCount: number;
  rainRadius: number;
  /** Lumières dynamiques réellement allumées en même temps (ponctuelles / projecteurs). */
  pointLights: number;
  spotLights: number;
  /** Ciel : octaves du bruit des nuages, ombrage des nuages vers le soleil, voile de cirrus, étoiles. */
  cloudOctaves: number;
  cloudShading: boolean;
  highClouds: boolean;
  stars: boolean;
  /** Effets d'écran : flou CSS autorisé (coûteux sur téléphone). */
  screenBlur: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = ['bas', 'moyen', 'haut', 'ultra'];

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, Readonly<QualityPreset>>> = {
  bas: {
    level: 'bas', antialias: false, pixelRatioCap: 1.5,
    shadowMapSize: 0, shadowDistance: 0, shadowRadius: 0, maxDrawDistance: 300,
    rainCount: 700, rainRadius: 8, pointLights: 2, spotLights: 1,
    cloudOctaves: 3, cloudShading: false, highClouds: false, stars: true, screenBlur: false,
  },
  moyen: {
    level: 'moyen', antialias: true, pixelRatioCap: 1.5,
    shadowMapSize: 1024, shadowDistance: 90, shadowRadius: 1.5, maxDrawDistance: 500,
    rainCount: 2200, rainRadius: 10, pointLights: 4, spotLights: 2,
    cloudOctaves: 4, cloudShading: true, highClouds: false, stars: true, screenBlur: true,
  },
  haut: {
    level: 'haut', antialias: true, pixelRatioCap: 2,
    shadowMapSize: 2048, shadowDistance: 140, shadowRadius: 2, maxDrawDistance: 900,
    rainCount: 4500, rainRadius: 11, pointLights: 8, spotLights: 3,
    cloudOctaves: 5, cloudShading: true, highClouds: true, stars: true, screenBlur: true,
  },
  ultra: {
    level: 'ultra', antialias: true, pixelRatioCap: 2,
    shadowMapSize: 4096, shadowDistance: 220, shadowRadius: 2.5, maxDrawDistance: 1500,
    rainCount: 8000, rainRadius: 13, pointLights: 12, spotLights: 4,
    cloudOctaves: 6, cloudShading: true, highClouds: true, stars: true, screenBlur: true,
  },
};

export function presetFor(level: QualityLevel | string | undefined): Readonly<QualityPreset> {
  const p = QUALITY_PRESETS[level as QualityLevel];
  return p ?? QUALITY_PRESETS.moyen;
}

/**
 * Densité de pixels effective du tampon de rendu : celle de l'écran, plafonnée par le préréglage,
 * multipliée par l'échelle de rendu choisie (0,5 – 1). Jamais sous 0,5 pour rester lisible.
 */
export function effectivePixelRatio(devicePixelRatio: number, preset: QualityPreset, renderScale: number): number {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const scale = Number.isFinite(renderScale) ? Math.min(1, Math.max(0.5, renderScale)) : 1;
  return Math.max(0.5, Math.min(dpr, preset.pixelRatioCap) * scale);
}

/** Distance d'affichage par temps clair : le réglage du joueur, borné par le préréglage. */
export function baseDrawDistance(settings: Pick<Settings, 'drawDistance'>, preset: QualityPreset): number {
  const d = Number.isFinite(settings.drawDistance) ? settings.drawDistance : preset.maxDrawDistance;
  return Math.max(100, Math.min(d, preset.maxDrawDistance));
}

/** Les ombres portées sont-elles actives pour ces réglages ? */
export function shadowsEnabled(settings: Pick<Settings, 'shadows'>, preset: QualityPreset): boolean {
  return settings.shadows !== false && preset.shadowMapSize > 0;
}
