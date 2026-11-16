/* =====================================================================================
 * Système « environnement » : horloge de la journée, course du soleil et de la lune, lumière du
 * jour, éclairage public, météo, sol mouillé, vent. Publie ctx.env (EnvApi du contrat) et le
 * service étendu 'env.ext' (voir api.ts). Simulation pure : aucun DOM, aucun Three.js.
 * ===================================================================================== */

import type {
  DurationPreset, EnvApi, EnvState, GameContext, GameSystem, SessionConfig, WeatherKind,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { ENV_EXT_SERVICE, ENV_LIGHTNING_EVENT } from './api';
import type { EnvExtApi, EnvSkyState, LightningStrike } from './api';
import {
  PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG, SPRING_DATE, computeSkyBodies, computeSunTimes, createSkyBodies,
  julianDayLocal,
} from './astro';
import type { CalendarDate, SkyBodies } from './astro';
import { DEG, clamp, clamp01, smoothstep } from './mathx';
import { WeatherMachine, isWeatherKind } from './weather';
import type { DryingInputs } from './weather';

/** L'environnement se met à jour avant les contrôleurs : le vent du pas courant est connu de tous. */
export const ENV_ORDER = SystemOrder.INPUT + 50;

/**
 * Vitesse de l'horloge par défaut selon la durée de mission : une manifestation réelle dure
 * environ trois heures ; elle tient dans la durée de jeu choisie, et la lumière évolue d'autant.
 */
export const CLOCK_SCALE_BY_DURATION: Readonly<Record<DurationPreset, number>> = {
  courte: 18,       // 10 min de jeu ≈ 3 h
  standard: 8,      // 25 min ≈ 3 h 20
  longue: 4,        // 45 min ≈ 3 h
  temps_reel: 1,
};

/** Sous cette hauteur (degrés), le soleil n'éclaire plus : la lune prend le relais si elle est levée. */
const SUN_HANDOFF_DEG = -3;
/** Hauteur minimale de la direction publiée : une lumière rasante, jamais sous le sol. */
const MIN_LIGHT_ELEVATION = 2.5 * DEG;

const MAX_CLOCK_SCALE = 7200;
/** Composante verticale de la direction « lueur du ciel » (0,2 ; y ; 0,2), unitaire. */
const ZENITH_GLOW_Y = Math.sqrt(1 - 0.08);
/** Seuils de lumière ambiante de l'éclairage public (allumage / extinction). */
const LIGHTS_ON_BELOW = 0.42;
const LIGHTS_OFF_ABOVE = 0.5;

export class EnvSystem implements GameSystem, EnvApi, EnvExtApi {
  readonly id = 'env';
  readonly order = ENV_ORDER;

  readonly state: EnvState = {
    timeOfDay: 12, clockScale: 1, weather: 'clair', rain: 0, fog: 0.02, clouds: 0.12, wetness: 0,
    windX: 0, windZ: 0, sunX: 0, sunY: 1, sunZ: 0, daylight: 1, isNight: false, streetLights: false,
  };

  readonly sky: EnvSkyState = {
    sunX: 0, sunY: 1, sunZ: 0, sunElevation: Math.PI / 2, sunAzimuth: Math.PI,
    moonX: 0, moonY: -1, moonZ: 0, moonElevation: -Math.PI / 2, moonAzimuth: 0, moonPhase: 1,
    dominant: 'sun', lightning: 0, lightningX: 1, lightningZ: 0, windMeanX: 0, windMeanZ: 0, gust: 0,
    cloudX: 0, cloudZ: 0, ambient: 1, day: 0, sunrise: 6.5, sunset: 21, solarNoon: 13.8,
  };

  private ctx: GameContext | null = null;
  private readonly machine = new WeatherMachine();
  private readonly bodies: SkyBodies = createSkyBodies();
  private date: CalendarDate = SPRING_DATE;
  private lastHour = 12;
  private centerX = 0;
  private centerZ = 0;
  private readonly strikeEvent: LightningStrike = { x: 0, z: 0, distance: 0, intensity: 0 };
  /** Paramètres de séchage du sol, réutilisés à chaque pas (aucune allocation dans update). */
  private readonly drying: DryingInputs = { sun: 0 };

  constructor() {
    // état cohérent dès la construction (menu, bancs d'essai sans session)
    this.machine.reset('clair', 1, defaultRand());
    const t = computeSunTimes(this.date, PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG);
    this.sky.sunrise = t.sunrise;
    this.sky.sunset = t.sunset;
    this.sky.solarNoon = t.noon;
    this.refresh();
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.env = this;
    ctx.provide<EnvExtApi>(ENV_EXT_SERVICE, this);
  }

  /** Nouvelle session : heure et météo de la configuration, horloge selon la durée, vent tiré selon la graine. */
  reset(): void {
    const ctx = this.ctx;
    const config: SessionConfig | null = ctx ? ctx.session.config : null;
    const st = this.state;
    let seed = 1;
    let rand = defaultRand();
    if (ctx) {
      const rng = ctx.rng.fork('env');
      rand = () => rng.next();
      seed = Math.floor(rng.next() * 90000) + 1;
    }
    const weather: WeatherKind = config && isWeatherKind(config.weather) ? config.weather : 'clair';
    const hour = config && Number.isFinite(config.timeOfDay) ? wrapHour(config.timeOfDay) : 14;
    this.machine.reset(weather, seed, rand);
    this.machine.gustiness = 1;
    this.machine.dynamic = false;
    st.timeOfDay = hour;
    st.clockScale = config ? CLOCK_SCALE_BY_DURATION[config.duration] ?? 1 : 1;
    this.sky.day = 0;
    this.centerX = config && typeof config.x === 'number' ? config.x : 0;
    this.centerZ = config && typeof config.z === 'number' ? config.z : 0;
    if (config) {
      this.machine.dynamic = config.mode === 'monde_ouvert';
      const extra = config.extra;
      if (extra) {
        // options hors contrat : clockScale, weatherDynamic, wind {x, z} ou windSpeed + windHeading
        const cs = extra['clockScale'];
        if (typeof cs === 'number' && Number.isFinite(cs) && cs >= 0) st.clockScale = Math.min(cs, MAX_CLOCK_SCALE);
        const dyn = extra['weatherDynamic'];
        if (typeof dyn === 'boolean') this.machine.dynamic = dyn;
        const wind = extra['wind'] as { x?: unknown; z?: unknown } | undefined;
        const ws = extra['windSpeed'];
        const wh = extra['windHeading'];
        if (wind && typeof wind.x === 'number' && typeof wind.z === 'number') this.machine.setWind(wind.x, wind.z);
        else if (typeof ws === 'number' && typeof wh === 'number') this.machine.setWind(Math.sin(wh) * ws, Math.cos(wh) * ws);
      }
    }
    this.lastHour = Math.floor(st.timeOfDay);
    this.refresh();
    // l'éclairage public démarre dans l'état qui convient à l'heure, sans hystérésis
    st.streetLights = this.sky.sunElevation < 0 || this.sky.ambient < LIGHTS_ON_BELOW;
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    const st = this.state;
    // horloge
    if (st.clockScale > 0) {
      let h = st.timeOfDay + (dt * st.clockScale) / 3600;
      while (h >= 24) {
        h -= 24;
        this.sky.day++;
      }
      st.timeOfDay = h;
    }
    // météo, sol, vent, éclairs
    this.drying.sun = clamp01(Math.sin(Math.max(0, this.sky.sunElevation)) * 1.6);
    const switched = this.machine.update(dt, this.drying);
    this.refresh();
    const ctx = this.ctx;
    if (!ctx) return;
    if (switched) ctx.events.emit('env:weather', { weather: switched });
    const strike = this.machine.takeStrike();
    if (strike) this.emitStrike(strike.dirX, strike.dirZ, strike.distance, strike.intensity);
    this.emitHour();
  }

  // ───────────────────────────── EnvApi ─────────────────────────────

  setTime(hour: number): void {
    if (!Number.isFinite(hour)) return;
    this.state.timeOfDay = wrapHour(hour);
    this.refresh();
    this.emitHour();
  }

  setWeather(kind: WeatherKind, immediate?: boolean): void {
    if (!isWeatherKind(kind)) return;
    const changed = this.machine.setWeather(kind, immediate === true);
    this.refresh();
    if (changed && this.ctx) this.ctx.events.emit('env:weather', { weather: kind });
  }

  setClockScale(scale: number): void {
    if (Number.isFinite(scale) && scale >= 0) this.state.clockScale = Math.min(scale, MAX_CLOCK_SCALE);
  }

  setWind(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.machine.setWind(x, z);
    this.copyWeather();
  }

  // ───────────────────────────── EnvExtApi ─────────────────────────────

  get dynamicWeather(): boolean {
    return this.machine.dynamic;
  }

  set dynamicWeather(on: boolean) {
    this.machine.dynamic = on === true;
  }

  get gustiness(): number {
    return this.machine.gustiness;
  }

  set gustiness(v: number) {
    if (Number.isFinite(v)) this.machine.gustiness = clamp(v, 0, 2);
  }

  get target(): WeatherKind {
    return this.machine.v.weather;
  }

  get transition(): number {
    return this.machine.transition;
  }

  releaseWind(): void {
    this.machine.releaseWind();
  }

  strike(intensity = 1): void {
    const s = this.machine.strike(intensity);
    this.machine.takeStrike();
    this.copyWeather();
    this.sky.lightning = clamp01(s.intensity);
    this.emitStrike(s.dirX, s.dirZ, s.distance, s.intensity);
  }

  setWetness(value: number): void {
    if (!Number.isFinite(value)) return;
    this.machine.setWetness(value);
    this.state.wetness = this.machine.v.wetness;
  }

  timeLabel(): string {
    const total = Math.floor(this.state.timeOfDay * 60 + 1e-6);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${h} h ${m < 10 ? '0' : ''}${m}`;
  }

  /** Change la date de référence (saison) : recalcule horaires et astres. */
  setDate(date: CalendarDate): void {
    this.date = { year: date.year, month: date.month, day: date.day, utcOffset: date.utcOffset };
    const t = computeSunTimes(this.date, PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG);
    this.sky.sunrise = t.sunrise;
    this.sky.sunset = t.sunset;
    this.sky.solarNoon = t.noon;
    this.refresh();
  }

  // ───────────────────────────── interne ─────────────────────────────

  private emitHour(): void {
    const hour = Math.floor(this.state.timeOfDay);
    if (hour === this.lastHour) return;
    this.lastHour = hour;
    if (this.ctx) this.ctx.events.emit('env:hour', { hour });
  }

  private emitStrike(dirX: number, dirZ: number, distance: number, intensity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const e = this.strikeEvent;
    e.x = this.centerX + dirX * distance;
    e.z = this.centerZ + dirZ * distance;
    e.distance = distance;
    e.intensity = intensity;
    ctx.events.emitAny(ENV_LIGHTNING_EVENT, e);
  }

  private copyWeather(): void {
    const st = this.state;
    const sky = this.sky;
    const v = this.machine.v;
    st.weather = v.weather;
    st.clouds = v.clouds;
    st.rain = v.rain;
    st.fog = v.fog;
    st.wetness = v.wetness;
    st.windX = v.windX;
    st.windZ = v.windZ;
    sky.windMeanX = v.windMeanX;
    sky.windMeanZ = v.windMeanZ;
    sky.gust = v.gust;
    sky.lightning = v.lightning;
    sky.lightningX = v.lightningX;
    sky.lightningZ = v.lightningZ;
    sky.cloudX = v.cloudX;
    sky.cloudZ = v.cloudZ;
  }

  /** Recalcule tout ce qui dérive de l'heure et de la météo. */
  private refresh(): void {
    this.copyWeather();
    const st = this.state;
    const sky = this.sky;
    const b = computeSkyBodies(
      julianDayLocal(this.date, st.timeOfDay, sky.day), PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG, this.bodies,
    );
    sky.sunX = b.sunX; sky.sunY = b.sunY; sky.sunZ = b.sunZ;
    sky.sunElevation = b.sunElevation; sky.sunAzimuth = b.sunAzimuth;
    sky.moonX = b.moonX; sky.moonY = b.moonY; sky.moonZ = b.moonZ;
    sky.moonElevation = b.moonElevation; sky.moonAzimuth = b.moonAzimuth;
    sky.moonPhase = b.moonPhase;

    // ── lumière du jour : crépuscule civil de -7° à +9°, assombri par un ciel très chargé ──
    const elevDeg = b.sunElevation / DEG;
    const astro = smoothstep(-7, 9, elevDeg);
    const heavy = smoothstep(0.6, 1, st.clouds) * (0.5 + 0.5 * st.rain);
    const weatherDim = (1 - 0.45 * heavy) * (1 - 0.25 * st.fog);
    st.daylight = clamp01(astro * weatherDim);
    st.isNight = elevDeg < -4;
    sky.ambient = st.daylight;

    // ── éclairage public : allumé au coucher du soleil ou quand le ciel s'assombrit, avec hystérésis ──
    if (st.streetLights) {
      if (elevDeg > 1 && sky.ambient > LIGHTS_OFF_ABOVE) st.streetLights = false;
    } else if (elevDeg < -0.3 || sky.ambient < LIGHTS_ON_BELOW) {
      st.streetLights = true;
    }

    // ── astre dominant : direction publiée dans EnvState.sunX/Y/Z ──
    if (elevDeg > SUN_HANDOFF_DEG) {
      sky.dominant = 'sun';
      liftDirection(st, b.sunX, b.sunY, b.sunZ);
    } else if (b.moonElevation > 0) {
      sky.dominant = 'moon';
      liftDirection(st, b.moonX, b.moonY, b.moonZ);
    } else {
      // ni soleil ni lune : lueur du ciel, presque à la verticale
      sky.dominant = 'none';
      st.sunX = 0.2;
      st.sunY = ZENITH_GLOW_Y;
      st.sunZ = 0.2;
    }
  }
}

/** Écrit dans l'état une direction unitaire relevée au moins à MIN_LIGHT_ELEVATION au-dessus de l'horizon. */
function liftDirection(st: EnvState, x: number, y: number, z: number): void {
  const minY = Math.sin(MIN_LIGHT_ELEVATION);
  if (y >= minY) {
    st.sunX = x;
    st.sunY = y;
    st.sunZ = z;
    return;
  }
  const h = Math.hypot(x, z);
  const k = h > 1e-6 ? Math.cos(MIN_LIGHT_ELEVATION) / h : 0;
  st.sunX = h > 1e-6 ? x * k : Math.cos(MIN_LIGHT_ELEVATION);
  st.sunY = minY;
  st.sunZ = z * k;
}

function wrapHour(h: number): number {
  h = h % 24;
  return h < 0 ? h + 24 : h;
}

/** Générateur déterministe de secours (hors session : menu, bancs d'essai). */
function defaultRand(): () => number {
  let s = 0x2545f491;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}
