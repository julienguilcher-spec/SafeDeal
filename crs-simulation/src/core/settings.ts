/* =====================================================================================
 * Réglages : valeurs par défaut sensées, qualité initiale choisie d'après l'appareil,
 * validation, persistance (section « settings » de la sauvegarde), événement settings:changed.
 * ===================================================================================== */

import type { EventBus, QualityLevel, SaveApi, Settings, SettingsApi } from './contracts';

/** Section de la sauvegarde où sont rangés les réglages. */
export const SETTINGS_SECTION = 'settings';

/** Indices matériels utilisés pour choisir la qualité initiale. */
export interface DeviceHints {
  /** Écran tactile comme pointeur principal. */
  touch: boolean;
  /** Agent utilisateur de téléphone ou de tablette. */
  mobile: boolean;
  /** Cœurs logiques (0 si inconnu). */
  cores: number;
  /** Mémoire vive en Go (0 si inconnue). */
  memoryGb: number;
  /** Plus petit côté de l'écran en pixels CSS (0 si inconnu). */
  screenMin: number;
}

/** Appareil de bureau de référence (tests, environnement inconnu). */
export const DESKTOP_HINTS: Readonly<DeviceHints> = Object.freeze({
  touch: false, mobile: false, cores: 8, memoryGb: 8, screenMin: 1080,
});

/** Lit les indices matériels du navigateur ; tout accès est protégé (Node, iframe restreinte). */
export function readDeviceHints(): DeviceHints {
  const hints: DeviceHints = { ...DESKTOP_HINTS };
  try {
    const g = globalThis as {
      navigator?: { maxTouchPoints?: number; hardwareConcurrency?: number; deviceMemory?: number; userAgent?: string };
      matchMedia?: (q: string) => { matches: boolean };
      screen?: { width?: number; height?: number };
      document?: unknown;
    };
    if (!g.document || !g.navigator) return hints; // hors navigateur : appareil de référence
    const nav = g.navigator;
    const mq = typeof g.matchMedia === 'function' ? g.matchMedia : null;
    const coarse = mq ? mq('(pointer: coarse)').matches : false;
    const anyFine = mq ? mq('(any-pointer: fine)').matches : true;
    // tactile = pointeur principal grossier, ou écran tactile sans souris ni pavé
    hints.touch = coarse || ((nav.maxTouchPoints ?? 0) > 0 && !anyFine);
    hints.mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '');
    hints.cores = nav.hardwareConcurrency ?? 0;
    hints.memoryGb = nav.deviceMemory ?? 0;
    const w = g.screen?.width ?? 0;
    const h = g.screen?.height ?? 0;
    hints.screenMin = w > 0 && h > 0 ? Math.min(w, h) : 0;
  } catch {
    // indices indisponibles : on garde l'appareil de référence
  }
  return hints;
}

/**
 * Qualité initiale : « bas » sur téléphone ou tablette tactile, « moyen » sur un appareil modeste
 * (4 cœurs ou moins, 4 Go ou moins), « haut » sinon. « ultra » n'est jamais choisi automatiquement.
 */
export function pickInitialQuality(h: DeviceHints): QualityLevel {
  if (h.mobile || (h.touch && h.screenMin > 0 && h.screenMin < 900)) return 'bas';
  if (h.touch) return 'moyen';
  if ((h.cores > 0 && h.cores <= 4) || (h.memoryGb > 0 && h.memoryGb <= 4)) return 'moyen';
  return 'haut';
}

/** Réglages graphiques associés à un niveau de qualité. */
export function qualityPreset(level: QualityLevel): Pick<Settings, 'quality' | 'renderScale' | 'shadows' | 'crowdScale' | 'drawDistance'> {
  switch (level) {
    case 'bas':
      return { quality: 'bas', renderScale: 0.7, shadows: false, crowdScale: 0.5, drawDistance: 220 };
    case 'moyen':
      return { quality: 'moyen', renderScale: 0.85, shadows: true, crowdScale: 0.75, drawDistance: 350 };
    case 'ultra':
      return { quality: 'ultra', renderScale: 1, shadows: true, crowdScale: 1.5, drawDistance: 800 };
    default:
      return { quality: 'haut', renderScale: 1, shadows: true, crowdScale: 1, drawDistance: 500 };
  }
}

/** Réglages par défaut pour un appareil donné. */
export function defaultSettings(hints: DeviceHints = DESKTOP_HINTS): Settings {
  return {
    ...qualityPreset(pickInitialQuality(hints)),
    fov: 70,
    mouseSensitivity: 1,
    gamepadSensitivity: 1,
    touchSensitivity: 1,
    invertY: false,
    volumeMaster: 0.8,
    volumeEffects: 1,
    volumeVoices: 1,
    volumeAmbience: 0.8,
    voiceSynthesis: true,
    subtitles: true,
    violence: 'realiste',
    hudMarkers: true,
    aimAssist: true,
    vibration: true,
    showFps: false,
  };
}

const QUALITY_LEVELS: readonly string[] = ['bas', 'moyen', 'haut', 'ultra'];
const VIOLENCE_LEVELS: readonly string[] = ['sobre', 'realiste'];

/** Bornes des réglages numériques. */
const RANGES: Partial<Record<keyof Settings, readonly [number, number]>> = {
  renderScale: [0.5, 1],
  crowdScale: [0.25, 2],
  drawDistance: [100, 1500],
  fov: [50, 110],
  mouseSensitivity: [0.1, 5],
  gamepadSensitivity: [0.1, 5],
  touchSensitivity: [0.1, 5],
  volumeMaster: [0, 1],
  volumeEffects: [0, 1],
  volumeVoices: [0, 1],
  volumeAmbience: [0, 1],
};

/**
 * Valide une valeur pour un réglage : retourne la valeur corrigée (bornée), ou undefined si elle
 * est inutilisable (mauvais type, niveau inconnu).
 */
export function sanitizeSetting<K extends keyof Settings>(key: K, value: unknown, reference: Settings): Settings[K] | undefined {
  const ref = reference[key];
  if (key === 'quality') return (typeof value === 'string' && QUALITY_LEVELS.indexOf(value) >= 0 ? value : undefined) as Settings[K] | undefined;
  if (key === 'violence') return (typeof value === 'string' && VIOLENCE_LEVELS.indexOf(value) >= 0 ? value : undefined) as Settings[K] | undefined;
  if (typeof ref === 'boolean') return (typeof value === 'boolean' ? value : undefined) as Settings[K] | undefined;
  if (typeof ref === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const range = RANGES[key];
    const v = range ? (value < range[0] ? range[0] : value > range[1] ? range[1] : value) : value;
    return v as Settings[K];
  }
  return undefined;
}

export interface SettingsOptions {
  save: SaveApi;
  events: EventBus;
  /** Indices matériels (par défaut : lus sur le navigateur). */
  device?: DeviceHints;
}

/** SettingsApi du contrat, plus les valeurs par défaut de cet appareil. */
export interface SettingsStore extends SettingsApi {
  readonly defaults: Readonly<Settings>;
  readonly device: Readonly<DeviceHints>;
}

export function createSettings(options: SettingsOptions): SettingsStore {
  const { save, events } = options;
  const device = options.device ?? readDeviceHints();
  const defaults = defaultSettings(device);
  const values: Settings = { ...defaults };
  const keys = Object.keys(defaults) as (keyof Settings)[];

  // valeurs enregistrées : seules les clés connues et valides sont reprises
  const stored = save.read<Record<string, unknown>>(SETTINGS_SECTION, {});
  if (stored && typeof stored === 'object') {
    for (const key of keys) {
      if (!(key in stored)) continue;
      const v = sanitizeSetting(key, stored[key], defaults);
      if (v !== undefined) (values as unknown as Record<string, unknown>)[key] = v;
    }
  }

  return {
    values,
    defaults,
    device,
    set<K extends keyof Settings>(key: K, value: Settings[K]): void {
      if (!(key in defaults)) return;
      const v = sanitizeSetting(key, value, defaults);
      if (v === undefined) {
        console.warn(`[settings] valeur refusée pour « ${String(key)} »`, value);
        return;
      }
      if (values[key] === v) return;
      values[key] = v;
      save.write(SETTINGS_SECTION, values);
      events.emit('settings:changed', { key });
    },
    reset(): void {
      const changed: (keyof Settings)[] = [];
      for (const key of keys) {
        if (values[key] !== defaults[key]) {
          (values as unknown as Record<string, unknown>)[key] = defaults[key];
          changed.push(key);
        }
      }
      save.remove(SETTINGS_SECTION);
      for (const key of changed) events.emit('settings:changed', { key });
    },
  };
}

/** Applique un niveau de qualité et les réglages graphiques qui vont avec. */
export function applyQualityPreset(settings: SettingsApi, level: QualityLevel): void {
  const preset = qualityPreset(level);
  settings.set('quality', preset.quality);
  settings.set('renderScale', preset.renderScale);
  settings.set('shadows', preset.shadows);
  settings.set('crowdScale', preset.crowdScale);
  settings.set('drawDistance', preset.drawDistance);
}
