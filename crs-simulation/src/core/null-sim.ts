/* =====================================================================================
 * Services neutres de simulation : environnement, dangers diffus, santé, directeur de foule.
 * Chacun est remplacé par le module concerné dès qu'il est branché.
 * ===================================================================================== */

import type {
  CrowdPhase, CrowdStats, DamageInfo, DirectorApi, EntityId, EnvApi, EnvState, GameContext, HazardApi,
  HealthApi, InjuryLevel, Person, WeatherKind,
} from './contracts';
import { clamp, smoothstep } from './math';

// ───────────────────────────── environnement ─────────────────────────────

/** Hauteur maximale du soleil à midi (rad) — valeur moyenne pour Paris. */
const SUN_MAX_ELEVATION = (45 * Math.PI) / 180;

const WEATHER_PRESETS: Record<WeatherKind, { clouds: number; rain: number; fog: number }> = {
  clair: { clouds: 0.1, rain: 0, fog: 0 },
  nuageux: { clouds: 0.5, rain: 0, fog: 0 },
  couvert: { clouds: 0.9, rain: 0, fog: 0.05 },
  pluie: { clouds: 0.9, rain: 0.5, fog: 0.1 },
  averse: { clouds: 1, rain: 1, fog: 0.15 },
  brouillard: { clouds: 0.6, rain: 0, fog: 0.8 },
  orage: { clouds: 1, rain: 0.9, fog: 0.1 },
};

export interface NullEnv extends EnvApi {
  /** Début de session : plus de vent, horloge à la vitesse normale (heure et météo sont fixées par la session). */
  reset(): void;
}

/**
 * Environnement neutre : midi, temps clair, sans vent. Modifiable par setTime / setWeather /
 * setClockScale / setWind (effet immédiat) ; l'heure n'avance pas toute seule.
 * Modèle solaire simple : lever à 6 h à l'est, midi au sud, coucher à 18 h à l'ouest ; la nuit,
 * la direction renvoyée est celle de la lune (à l'opposé du soleil).
 */
export function createNullEnv(ctx: GameContext): NullEnv {
  const state: EnvState = {
    timeOfDay: 12,
    clockScale: 1,
    weather: 'clair',
    rain: 0,
    fog: 0,
    clouds: 0.1,
    wetness: 0,
    windX: 0,
    windZ: 0,
    sunX: 0,
    sunY: 1,
    sunZ: 0,
    daylight: 1,
    isNight: false,
    streetLights: false,
  };

  function applySun(): void {
    const phi = (Math.PI * (state.timeOfDay - 6)) / 12;
    const elev = SUN_MAX_ELEVATION * Math.sin(phi);
    const elevDeg = (elev * 180) / Math.PI;
    state.daylight = smoothstep(-6, 10, elevDeg);
    state.isNight = state.daylight < 0.2;
    state.streetLights = state.daylight < 0.45;
    // direction vers l'astre visible : le soleil, ou la lune (à l'opposé) quand il est sous l'horizon
    const up = elev >= 0 ? elev : -elev;
    const side = elev >= 0 ? 1 : -1;
    const h = Math.cos(up);
    state.sunX = Math.cos(phi) * h * side;
    state.sunZ = Math.sin(phi) * h * side;
    state.sunY = Math.sin(up);
    if (state.sunY < 0.02) {
      // astre à l'horizon : garder un vecteur unitaire légèrement relevé
      state.sunY = 0.02;
      const l = Math.sqrt(state.sunX * state.sunX + state.sunY * state.sunY + state.sunZ * state.sunZ);
      state.sunX /= l;
      state.sunY /= l;
      state.sunZ /= l;
    }
  }

  function applyWeather(): void {
    const p = WEATHER_PRESETS[state.weather] ?? WEATHER_PRESETS.clair;
    state.clouds = p.clouds;
    state.rain = p.rain;
    state.fog = p.fog;
    state.wetness = p.rain > 0 ? clamp(p.rain * 1.5, 0, 1) : 0;
  }

  applySun();
  applyWeather();

  return {
    state,
    setTime(hour: number): void {
      if (!Number.isFinite(hour)) return;
      const previous = Math.floor(state.timeOfDay);
      let h = hour % 24;
      if (h < 0) h += 24;
      state.timeOfDay = h;
      applySun();
      if (Math.floor(h) !== previous) ctx.events.emit('env:hour', { hour: Math.floor(h) });
    },
    setWeather(kind: WeatherKind): void {
      if (!(kind in WEATHER_PRESETS)) return;
      const changed = kind !== state.weather;
      state.weather = kind;
      applyWeather();
      if (changed) ctx.events.emit('env:weather', { weather: kind });
    },
    setClockScale(scale: number): void {
      if (Number.isFinite(scale) && scale >= 0) state.clockScale = scale;
    },
    setWind(x: number, z: number): void {
      if (Number.isFinite(x) && Number.isFinite(z)) {
        state.windX = x;
        state.windZ = z;
      }
    },
    reset(): void {
      state.windX = 0;
      state.windZ = 0;
      state.clockScale = 1;
    },
  };
}

// ───────────────────────────── dangers diffus ─────────────────────────────

/** Dangers neutres : air pur, aucune fumée, aucun feu, visibilité parfaite. */
export function createNullHazards(): HazardApi {
  return {
    emitGas(): void {},
    emitSmoke(): void {},
    gasAt(): number {
      return 0;
    },
    smokeAt(): number {
      return 0;
    },
    ignite(): void {},
    fireAt(): number {
      return 0;
    },
    douse(): void {},
    visibility(): number {
      return 1;
    },
    clear(): void {},
  };
}

// ───────────────────────────── santé ─────────────────────────────

/** Niveau de blessure correspondant à des points de vie (hors décès). */
export function injuryForHealth(health: number): InjuryLevel {
  if (health > 75) return 'none';
  if (health > 50) return 'light';
  if (health > 25) return 'serious';
  return 'critical';
}

/**
 * Santé neutre : hurt() retire les points de vie tels quels (sans protection ni zone), applique
 * l'étourdissement, met à terre à zéro et émet person:hurt / person:down. Personne ne meurt.
 */
export function createNullHealth(ctx: GameContext): HealthApi {
  function setDown(target: Person, down: boolean, sourceId: EntityId): void {
    if (down) {
      if (target.posture === 'down') return;
      target.posture = 'down';
      target.vx = 0;
      target.vz = 0;
      target.cmd.moveX = 0;
      target.cmd.moveZ = 0;
      // une personne à terre lâche ce qu'elle porte
      if (target.carrying !== 0) {
        const carried = ctx.people.get(target.carrying);
        if (carried && carried.heldBy === target.id) carried.heldBy = 0;
        const prop = carried ? undefined : ctx.props.get(target.carrying);
        if (prop && prop.carriedBy === target.id) prop.carriedBy = 0;
        target.carrying = 0;
      }
      ctx.events.emit('person:down', { id: target.id, injury: target.injury, sourceId });
    } else {
      if (target.posture !== 'down' || target.health <= 0 || target.injury === 'dead') return;
      target.posture = 'stand';
      ctx.events.emit('person:recovered', { id: target.id });
    }
  }

  return {
    hurt(target: Person, d: DamageInfo): void {
      if (target.injury === 'dead') return;
      const amount = d.amount > 0 ? d.amount : 0;
      target.health = target.health - amount;
      if (target.health < 0) target.health = 0;
      if (d.stun !== undefined && d.stun > target.stun) target.stun = d.stun;
      target.injury = injuryForHealth(target.health);
      ctx.events.emit('person:hurt', { id: target.id, info: d, healthAfter: target.health });
      if (target.health <= 0) setDown(target, true, d.sourceId);
    },
    heal(target: Person, amount: number, byId: EntityId): void {
      if (target.injury === 'dead' || !(amount > 0)) return;
      target.health = target.health + amount;
      if (target.health > 100) target.health = 100;
      target.injury = injuryForHealth(target.health);
      ctx.events.emit('person:treated', { id: target.id, byId });
    },
    setDown(target: Person, down: boolean, sourceId: EntityId = 0): void {
      setDown(target, down, sourceId);
    },
    isIncapacitated(p: Person): boolean {
      return p.posture === 'down' || p.health <= 0 || p.injury === 'dead';
    },
  };
}

// ───────────────────────────── directeur de foule ─────────────────────────────

/** Directeur neutre : aucune manifestation, tension nulle. */
export function createNullDirector(): DirectorApi {
  const stats: CrowdStats = { total: 0, present: 0, dispersed: 0, radicals: 0, injured: 0, arrested: 0 };
  const route: readonly number[] = Object.freeze([]);
  const phase: CrowdPhase = 'aucune';
  return {
    phase,
    tension: 0,
    tensionAt(): number {
      return 0;
    },
    addTension(): void {},
    stats,
    route,
    headProgress: 0,
  };
}
