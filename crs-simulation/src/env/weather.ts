/* =====================================================================================
 * Machine d'états météo : sept temps, des transitions douces et ordonnées (les nuages arrivent
 * avant la pluie, la pluie cesse avant l'éclaircie), des variations lentes à l'intérieur d'un
 * même temps (averses qui pulsent, éclaircies), le sol qui se mouille et sèche, le vent et ses
 * rafales, les éclairs d'orage. Logique pure, déterministe pour une graine donnée.
 * ===================================================================================== */

import type { WeatherKind } from '@/core/contracts';
import { approach, clamp, clamp01, noise1, smoothstep } from './mathx';

export interface WeatherProfile {
  /** Couverture nuageuse, pluie et brouillard visés (0..1). */
  clouds: number;
  rain: number;
  fog: number;
  /** Vent moyen (m/s) et amplitude relative des rafales. */
  wind: number;
  gust: number;
  /** Éclairs par minute. */
  lightning: number;
  /** Amplitude des variations lentes de la couverture et de la pluie. */
  cloudSwing: number;
  rainSwing: number;
}

export const WEATHER_KINDS: readonly WeatherKind[] = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'];

/** Vent : Paris connaît 10 à 15 km/h de vent moyen ; l'averse et l'orage amènent 25 à 30 km/h et des rafales. */
export const WEATHER_PROFILES: Readonly<Record<WeatherKind, WeatherProfile>> = {
  clair:      { clouds: 0.12, rain: 0,    fog: 0.02, wind: 2.0, gust: 0.25, lightning: 0, cloudSwing: 0.05, rainSwing: 0 },
  nuageux:    { clouds: 0.50, rain: 0,    fog: 0.03, wind: 3.2, gust: 0.35, lightning: 0, cloudSwing: 0.12, rainSwing: 0 },
  couvert:    { clouds: 0.95, rain: 0,    fog: 0.08, wind: 3.6, gust: 0.35, lightning: 0, cloudSwing: 0.03, rainSwing: 0 },
  pluie:      { clouds: 0.97, rain: 0.45, fog: 0.14, wind: 4.5, gust: 0.40, lightning: 0, cloudSwing: 0.02, rainSwing: 0.10 },
  averse:     { clouds: 1.00, rain: 0.95, fog: 0.22, wind: 6.5, gust: 0.55, lightning: 0, cloudSwing: 0,    rainSwing: 0.20 },
  brouillard: { clouds: 0.70, rain: 0,    fog: 0.85, wind: 0.7, gust: 0.15, lightning: 0, cloudSwing: 0.05, rainSwing: 0 },
  orage:      { clouds: 1.00, rain: 0.85, fog: 0.16, wind: 8.5, gust: 0.70, lightning: 5, cloudSwing: 0,    rainSwing: 0.15 },
};

/** Évolutions plausibles d'un temps vers un autre (météo dynamique) : [temps suivant, poids]. */
const NEXT: Readonly<Record<WeatherKind, readonly (readonly [WeatherKind, number])[]>> = {
  clair: [['nuageux', 3], ['clair', 2]],
  nuageux: [['clair', 3], ['couvert', 3], ['pluie', 1]],
  couvert: [['nuageux', 3], ['pluie', 3], ['brouillard', 0.5]],
  pluie: [['couvert', 3], ['averse', 2], ['nuageux', 1]],
  averse: [['pluie', 3], ['orage', 1.5], ['nuageux', 1]],
  brouillard: [['couvert', 3], ['nuageux', 2]],
  orage: [['averse', 2], ['pluie', 3]],
};

export function isWeatherKind(v: unknown): v is WeatherKind {
  return typeof v === 'string' && (WEATHER_KINDS as readonly string[]).indexOf(v) >= 0;
}

export interface WeatherValues {
  weather: WeatherKind;
  clouds: number;
  rain: number;
  fog: number;
  wetness: number;
  /** Vent instantané (rafales comprises), m/s. */
  windX: number;
  windZ: number;
  /** Vent moyen. */
  windMeanX: number;
  windMeanZ: number;
  gust: number;
  /** Éclat de l'éclair en cours 0..1 et sa direction horizontale. */
  lightning: number;
  lightningX: number;
  lightningZ: number;
  /** Défilement cumulé des nuages (m). */
  cloudX: number;
  cloudZ: number;
}

export interface StrikeInfo { dirX: number; dirZ: number; distance: number; intensity: number }

/** Paramètres extérieurs dont dépend le séchage du sol. */
export interface DryingInputs {
  /** 0..1 : ensoleillement direct. */
  sun: number;
}

const RAIN_RISE = 1 / 22;      // la pluie s'installe en ~20 s une fois le ciel chargé
const RAIN_FALL = 1 / 30;
const CLOUD_RATE = 1 / 70;     // un ciel met ~1 min à se charger ou à se dégager
const FOG_RATE = 1 / 80;
const WIND_RATE = 1 / 25;

export class WeatherMachine {
  readonly v: WeatherValues = {
    weather: 'clair', clouds: 0.12, rain: 0, fog: 0.02, wetness: 0,
    windX: 0, windZ: 0, windMeanX: 0, windMeanZ: 0, gust: 0,
    lightning: 0, lightningX: 1, lightningZ: 0, cloudX: 0, cloudZ: 0,
  };

  /** La météo change d'elle-même au fil du temps. */
  dynamic = false;
  /** Multiplicateur de l'amplitude des rafales (0 = vent régulier). */
  gustiness = 1;

  private seed = 1;
  private rand: () => number = Math.random;
  private t = 0;
  /** Direction du vent moyen (unitaire) et vitesse moyenne lissée. */
  private dirX = 0.9;
  private dirZ = -0.43;
  private speed = 2;
  /** Vent moyen imposé par setWind (la météo ne le modifie plus). */
  private forced = false;
  private forcedX = 0;
  private forcedZ = 0;
  /** Orage : intensité lissée 0..1, compte à rebours du prochain éclair, éclair en cours. */
  private storm = 0;
  private nextStrike = 0;
  private flashAge = 99;
  private flashPower = 0;
  private flashEchoes = 0;
  private flashGap = 0.1;
  private dwell = 0;
  private lastStrike: StrikeInfo | null = null;
  /** Écart couverture / cible au début de la transition, pour mesurer l'avancement. */
  private span = 0;

  /**
   * Remise à zéro de session. `rand` : générateur déterministe de la session ; `seed` : entier
   * qui décale les bruits lents. Le sol démarre mouillé s'il pleut déjà.
   */
  reset(kind: WeatherKind, seed: number, rand: () => number): void {
    this.seed = (seed | 0) % 100000;
    this.rand = rand;
    this.t = 0;
    this.forced = false;
    this.storm = kind === 'orage' ? 1 : 0;
    this.flashAge = 99;
    this.flashPower = 0;
    this.lastStrike = null;
    // vent dominant d'ouest à sud-ouest : il souffle vers l'est / nord-est, avec une dispersion par session
    const a = (-25 + (rand() * 2 - 1) * 55) * (Math.PI / 180); // angle du vecteur vent par rapport à l'est, vers le nord
    this.dirX = Math.cos(a);
    this.dirZ = Math.sin(a);
    this.v.cloudX = 0;
    this.v.cloudZ = 0;
    this.setWeather(kind, true);
    const p = WEATHER_PROFILES[kind];
    this.v.wetness = p.rain > 0 ? 1 : p.fog > 0.5 ? 0.3 : 0;
    this.nextStrike = this.strikeDelay();
    this.dwell = this.dwellTime();
    this.applyWind(p.gust);
  }

  /** Change de temps. `immediate` : sans transition (début de session, banc d'essai). Retourne true si le temps a changé. */
  setWeather(kind: WeatherKind, immediate = false): boolean {
    const v = this.v;
    const changed = v.weather !== kind;
    v.weather = kind;
    const p = WEATHER_PROFILES[kind];
    if (immediate) {
      v.clouds = p.clouds;
      v.rain = p.rain;
      v.fog = p.fog;
      this.speed = p.wind;
      this.storm = kind === 'orage' ? 1 : 0;
      this.span = 0;
      this.applyWind(p.gust);
    } else {
      this.span = Math.max(Math.abs(p.clouds - v.clouds), Math.abs(p.rain - v.rain), Math.abs(p.fog - v.fog));
    }
    if (changed) this.dwell = this.dwellTime();
    return changed;
  }

  /** Avancement 0..1 de la transition en cours (1 = temps installé). */
  get transition(): number {
    if (this.span <= 1e-4) return 1;
    const p = WEATHER_PROFILES[this.v.weather];
    const v = this.v;
    const rest = Math.max(Math.abs(p.clouds - v.clouds) - p.cloudSwing, Math.abs(p.rain - v.rain) - p.rainSwing, Math.abs(p.fog - v.fog));
    return clamp01(1 - rest / this.span);
  }

  /** Impose le vent moyen (m/s). Effet immédiat ; les rafales modulent ensuite autour de cette valeur. */
  setWind(x: number, z: number): void {
    this.forced = true;
    this.forcedX = x;
    this.forcedZ = z;
    const s = Math.hypot(x, z);
    if (s > 1e-6) {
      this.dirX = x / s;
      this.dirZ = z / s;
    }
    this.speed = s;
    const v = this.v;
    v.windMeanX = x;
    v.windMeanZ = z;
    v.windX = x;
    v.windZ = z;
    v.gust = 0;
  }

  releaseWind(): void {
    this.forced = false;
  }

  setWetness(value: number): void {
    this.v.wetness = clamp01(value);
  }

  /** Déclenche un éclair maintenant. */
  strike(intensity = 1): StrikeInfo {
    const a = this.rand() * Math.PI * 2;
    const info: StrikeInfo = {
      dirX: Math.cos(a),
      dirZ: Math.sin(a),
      distance: 500 + this.rand() * 3500,
      intensity: clamp(intensity, 0.1, 1),
    };
    this.flashAge = 0;
    this.flashPower = info.intensity;
    this.flashEchoes = Math.floor(this.rand() * 3);  // 0 à 2 répliques
    this.flashGap = 0.07 + this.rand() * 0.08;
    this.v.lightningX = info.dirX;
    this.v.lightningZ = info.dirZ;
    this.lastStrike = info;
    return info;
  }

  /** Éclair survenu pendant le dernier update (lu une fois, puis effacé). */
  takeStrike(): StrikeInfo | null {
    const s = this.lastStrike;
    this.lastStrike = null;
    return s;
  }

  /**
   * Avance la météo de `dt` secondes. Retourne le nouveau temps si la météo dynamique vient d'en
   * changer, sinon null.
   */
  update(dt: number, drying: DryingInputs): WeatherKind | null {
    if (!(dt > 0)) return null;
    const v = this.v;
    this.t += dt;
    const t = this.t;
    const seed = this.seed;
    let switched: WeatherKind | null = null;

    // ── météo dynamique : au bout d'un certain temps, on glisse vers un temps voisin ──
    if (this.dynamic) {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        const next = this.pickNext(v.weather);
        this.dwell = this.dwellTime();
        if (next !== v.weather) {
          this.setWeather(next, false);
          switched = next;
        }
      }
    }

    const p = WEATHER_PROFILES[v.weather];

    // ── nuages : cible + respiration lente ──
    let cloudTarget = clamp01(p.clouds + p.cloudSwing * noise1(t / 95, seed + 11));
    // tant qu'il pleut encore, le ciel reste chargé : l'éclaircie ne vient qu'après la dernière goutte
    if (v.rain > 0.004) cloudTarget = Math.max(cloudTarget, 0.72 + 0.23 * smoothstep(0, 0.3, v.rain));
    v.clouds = approach(v.clouds, cloudTarget, 0.06, CLOUD_RATE, dt);

    // ── pluie : elle ne tombe que d'un ciel chargé, et cesse avant que le ciel ne se dégage ──
    const pulse = p.rainSwing * noise1(t / 38, seed + 23);
    const rainTarget = clamp01(p.rain + (p.rain > 0 ? pulse : 0)) * smoothstep(0.55, 0.85, v.clouds);
    v.rain = approach(v.rain, rainTarget, 0.12, rainTarget > v.rain ? RAIN_RISE : RAIN_FALL, dt);
    if (v.rain < 0.004 && rainTarget === 0) v.rain = 0;

    // ── brouillard ──
    v.fog = approach(v.fog, p.fog, 0.05, FOG_RATE, dt);

    // ── sol : la pluie le mouille vite, il sèche lentement (soleil et vent aident, l'humidité de l'air freine) ──
    if (v.rain > 0.02) {
      v.wetness = clamp01(v.wetness + dt * (0.004 + v.rain * 0.022));
    } else {
      const windSpeed = Math.hypot(v.windX, v.windZ);
      const rate = (1 / 1500 + drying.sun * (1 - v.clouds * 0.8) / 520 + Math.min(windSpeed, 10) / 26000) * (1 - 0.75 * v.fog);
      // un air saturé (brouillard) entretient un sol humide
      const floor = v.fog > 0.5 ? 0.3 * smoothstep(0.5, 0.85, v.fog) : 0;
      if (v.wetness > floor) v.wetness = Math.max(floor, v.wetness - dt * rate);
      else if (v.wetness < floor) v.wetness = Math.min(floor, v.wetness + dt * 0.002);
    }

    // ── vent ──
    if (!this.forced) this.speed = approach(this.speed, p.wind, 0.08, WIND_RATE * 8, dt);
    this.applyWind(p.gust);
    v.cloudX += v.windMeanX * dt * 2.2;   // en altitude le vent est plus fort qu'au sol
    v.cloudZ += v.windMeanZ * dt * 2.2;

    // ── orage ──
    this.storm = approach(this.storm, v.weather === 'orage' ? 1 : 0, 0.05, 1 / 45, dt);
    if (this.storm > 0.3 && p.lightning > 0) {
      this.nextStrike -= dt * this.storm;
      if (this.nextStrike <= 0) {
        this.strike(0.45 + this.rand() * 0.55);
        this.nextStrike = this.strikeDelay();
      }
    }
    this.flashAge += dt;
    v.lightning = this.flashLevel();
    return switched;
  }

  /** Vent instantané = vent moyen × rafales lentes, avec une légère girouette. */
  private applyWind(gustAmp: number): void {
    const v = this.v;
    const t = this.t;
    const seed = this.seed;
    let mx: number;
    let mz: number;
    if (this.forced) {
      mx = this.forcedX;
      mz = this.forcedZ;
    } else {
      mx = this.dirX * this.speed;
      mz = this.dirZ * this.speed;
    }
    v.windMeanX = mx;
    v.windMeanZ = mz;
    const amp = gustAmp * this.gustiness;
    if (amp <= 0) {
      v.windX = mx;
      v.windZ = mz;
      v.gust = 0;
      return;
    }
    // deux houles lentes (≈ 50 s et ≈ 14 s) + de rares coups de vent plus marqués
    const slow = noise1(t / 26, seed + 31);
    const quick = noise1(t / 7, seed + 37);
    const burst = smoothstep(0.45, 0.9, noise1(t / 61, seed + 41));
    const g = amp * (0.6 * slow + 0.3 * quick) + amp * 0.9 * burst;
    const factor = Math.max(0.3, 1 + g);
    // la direction oscille de ±20° environ
    const swing = amp * (0.5 * noise1(t / 47, seed + 43) + 0.2 * noise1(t / 11, seed + 47));
    const c = Math.cos(swing);
    const s = Math.sin(swing);
    v.windX = (mx * c - mz * s) * factor;
    v.windZ = (mx * s + mz * c) * factor;
    v.gust = factor - 1;
  }

  /** Enveloppe lumineuse d'un éclair : décharge principale puis jusqu'à deux répliques. */
  private flashLevel(): number {
    const a = this.flashAge;
    if (a > 1.2) return 0;
    let level = pulse(a, 0.09);
    for (let i = 1; i <= this.flashEchoes; i++) level = Math.max(level, 0.7 * pulse(a - i * (this.flashGap + 0.07), 0.07));
    // lueur résiduelle dans les nuages
    level = Math.max(level, 0.18 * Math.exp(-a * 5));
    return clamp01(level * this.flashPower);
  }

  private strikeDelay(): number {
    const p = WEATHER_PROFILES.orage;
    const mean = 60 / p.lightning;
    // loi exponentielle bornée : des salves rapprochées et de longs silences
    return clamp(-Math.log(1 - this.rand() * 0.999) * mean, 1.5, mean * 4);
  }

  private dwellTime(): number {
    return 240 + this.rand() * 420;   // 4 à 11 minutes par temps
  }

  private pickNext(from: WeatherKind): WeatherKind {
    const options = NEXT[from];
    let total = 0;
    for (let i = 0; i < options.length; i++) total += options[i]![1];
    let r = this.rand() * total;
    for (let i = 0; i < options.length; i++) {
      r -= options[i]![1];
      if (r <= 0) return options[i]![0];
    }
    return from;
  }
}

/** Impulsion brève : montée instantanée, extinction en `width` secondes. */
function pulse(age: number, width: number): number {
  if (age < 0 || age > width) return 0;
  const k = 1 - age / width;
  return k * k;
}
