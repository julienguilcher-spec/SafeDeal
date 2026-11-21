import { describe, expect, it } from 'vitest';
import type { EnvExtApi } from '@/env';
import { ENV_EXT_SERVICE, EnvSystem, WEATHER_KINDS, WEATHER_PROFILES, createSystems } from '@/env';
import { createFakeContext } from '@/env/dev/fakeContext';
import type { SessionConfig, WeatherKind } from '@/core/contracts';

function boot(partial: Partial<SessionConfig> = {}) {
  const fake = createFakeContext(partial);
  const sys = createSystems()[0] as EnvSystem;
  sys.provide(fake.ctx);
  sys.reset();
  const step = (seconds: number, dt = 0.05, each?: () => void): void => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      sys.update(dt);
      if (each) each();
    }
  };
  return { ...fake, sys, step, env: fake.ctx.env, ext: fake.ctx.require<EnvExtApi>(ENV_EXT_SERVICE) };
}

describe('env — météo', () => {
  it('connaît les sept temps du contrat, chacun avec un profil cohérent', () => {
    expect([...WEATHER_KINDS].sort()).toEqual(['averse', 'brouillard', 'clair', 'couvert', 'nuageux', 'orage', 'pluie']);
    for (const k of WEATHER_KINDS) {
      const p = WEATHER_PROFILES[k];
      for (const v of [p.clouds, p.rain, p.fog]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (p.rain > 0) expect(p.clouds).toBeGreaterThan(0.85); // pas de pluie sans ciel chargé
    }
    expect(WEATHER_PROFILES.clair.clouds).toBeLessThan(WEATHER_PROFILES.nuageux.clouds);
    expect(WEATHER_PROFILES.nuageux.clouds).toBeLessThan(WEATHER_PROFILES.couvert.clouds);
    expect(WEATHER_PROFILES.pluie.rain).toBeLessThan(WEATHER_PROFILES.averse.rain);
    expect(WEATHER_PROFILES.brouillard.fog).toBeGreaterThan(0.7);
    expect(WEATHER_PROFILES.orage.lightning).toBeGreaterThan(0);
  });

  it('setWeather immédiat applique le profil tout de suite et émet env:weather', () => {
    const t = boot({ weather: 'clair' });
    t.env.setWeather('averse', true);
    expect(t.env.state.weather).toBe('averse');
    expect(t.env.state.rain).toBeCloseTo(WEATHER_PROFILES.averse.rain, 5);
    expect(t.env.state.clouds).toBeCloseTo(1, 5);
    expect(t.events.filter((e) => e[0] === 'env:weather')).toEqual([['env:weather', { weather: 'averse' }]]);
    // même temps redemandé : pas de nouvel événement
    t.env.setWeather('averse', true);
    expect(t.events.filter((e) => e[0] === 'env:weather').length).toBe(1);
    // valeur inconnue ignorée
    t.env.setWeather('neige' as WeatherKind);
    expect(t.env.state.weather).toBe('averse');
  });

  it('transition douce du beau temps vers l’averse : les nuages d’abord, la pluie ensuite, sans à-coup', () => {
    const t = boot({ weather: 'clair' });
    t.env.setWeather('averse');
    // l'état officiel change tout de suite, les grandeurs physiques non
    expect(t.env.state.weather).toBe('averse');
    expect(t.env.state.rain).toBe(0);
    expect(t.env.state.clouds).toBeLessThan(0.2);
    expect(t.ext.transition).toBeLessThan(0.15);
    let prevRain = 0;
    let prevClouds = t.env.state.clouds;
    let maxRainStep = 0;
    let maxCloudStep = 0;
    let rainStartClouds = -1;
    t.step(240, 0.05, () => {
      const s = t.env.state;
      maxRainStep = Math.max(maxRainStep, Math.abs(s.rain - prevRain));
      maxCloudStep = Math.max(maxCloudStep, Math.abs(s.clouds - prevClouds));
      if (rainStartClouds < 0 && s.rain > 0.02) rainStartClouds = s.clouds;
      prevRain = s.rain;
      prevClouds = s.clouds;
    });
    // aucune marche visible : moins de 0,3 % par pas de 50 ms
    expect(maxRainStep).toBeLessThan(0.003);
    expect(maxCloudStep).toBeLessThan(0.002);
    // la pluie n'a commencé que sous un ciel déjà bien chargé
    expect(rainStartClouds).toBeGreaterThan(0.55);
    // au bout de 4 min le temps est installé
    expect(t.env.state.clouds).toBeGreaterThan(0.95);
    expect(t.env.state.rain).toBeGreaterThan(0.7);
    expect(t.ext.transition).toBeGreaterThan(0.95);
  });

  it('l’éclaircie : la pluie cesse avant que le ciel ne se dégage', () => {
    const t = boot({ weather: 'averse' });
    t.env.setWeather('clair');
    let rainStoppedAt = -1;
    let elapsed = 0;
    let cloudsWhenRainStopped = 0;
    t.step(300, 0.05, () => {
      elapsed += 0.05;
      if (rainStoppedAt < 0 && t.env.state.rain === 0) {
        rainStoppedAt = elapsed;
        cloudsWhenRainStopped = t.env.state.clouds;
      }
    });
    expect(rainStoppedAt).toBeGreaterThan(10);
    expect(rainStoppedAt).toBeLessThan(120);
    expect(cloudsWhenRainStopped).toBeGreaterThan(0.6);
    expect(t.env.state.clouds).toBeLessThan(0.25);
    expect(t.env.state.rain).toBe(0);
  });

  it('le brouillard s’installe et se lève progressivement', () => {
    const t = boot({ weather: 'clair' });
    t.env.setWeather('brouillard');
    t.step(20);
    expect(t.env.state.fog).toBeGreaterThan(0.05);
    expect(t.env.state.fog).toBeLessThan(0.5);
    t.step(200);
    expect(t.env.state.fog).toBeGreaterThan(0.8);
    t.env.setWeather('clair');
    t.step(240);
    expect(t.env.state.fog).toBeLessThan(0.06);
  });

  it('le sol se mouille sous la pluie, plus vite sous l’averse, et reste dans [0, 1]', () => {
    const light = boot({ weather: 'clair' });
    light.env.setWeather('pluie', true);
    expect(light.env.state.wetness).toBe(0);
    light.step(30);
    const afterLight = light.env.state.wetness;
    expect(afterLight).toBeGreaterThan(0.2);
    expect(afterLight).toBeLessThan(0.8);
    const heavy = boot({ weather: 'clair' });
    heavy.env.setWeather('averse', true);
    heavy.step(30);
    expect(heavy.env.state.wetness).toBeGreaterThan(afterLight);
    heavy.step(120);
    expect(heavy.env.state.wetness).toBe(1);
  });

  it('le sol sèche lentement une fois la pluie finie, plus vite au soleil', () => {
    const sunny = boot({ weather: 'clair', timeOfDay: 14 });
    sunny.ext.setWetness(1);
    sunny.step(60);
    expect(sunny.env.state.wetness).toBeLessThan(1);
    expect(sunny.env.state.wetness).toBeGreaterThan(0.75); // une minute ne suffit pas
    sunny.step(600, 0.05);
    const sunnyLeft = sunny.env.state.wetness;
    const night = boot({ weather: 'couvert', timeOfDay: 2 });
    night.ext.setWetness(1);
    night.step(660, 0.05);
    expect(sunnyLeft).toBeLessThan(night.env.state.wetness - 0.2);
    expect(night.env.state.wetness).toBeGreaterThan(0.4);
    // séchage complet au soleil en un temps de jeu raisonnable (moins de 15 min)
    sunny.step(300, 0.05);
    expect(sunny.env.state.wetness).toBe(0);
  });

  it('le brouillard entretient un sol humide', () => {
    const t = boot({ weather: 'brouillard' });
    expect(t.env.state.wetness).toBeGreaterThan(0.2);
    t.step(600);
    expect(t.env.state.wetness).toBeGreaterThan(0.2);
  });

  it('le vent souffle avec des rafales lentes autour d’une moyenne propre à chaque temps', () => {
    const t = boot({ weather: 'averse', seed: 4 });
    let sum = 0;
    let min = Infinity;
    let max = 0;
    let n = 0;
    let maxStep = 0;
    let prev = Math.hypot(t.env.state.windX, t.env.state.windZ);
    t.step(600, 0.05, () => {
      const s = Math.hypot(t.env.state.windX, t.env.state.windZ);
      maxStep = Math.max(maxStep, Math.abs(s - prev));
      prev = s;
      sum += s;
      min = Math.min(min, s);
      max = Math.max(max, s);
      n++;
    });
    const mean = sum / n;
    const profile = WEATHER_PROFILES.averse.wind;
    expect(mean).toBeGreaterThan(profile * 0.75);
    expect(mean).toBeLessThan(profile * 1.35);
    expect(max).toBeGreaterThan(mean * 1.25);  // de vraies rafales
    expect(min).toBeGreaterThan(profile * 0.25); // jamais de calme plat sous l'averse
    expect(maxStep).toBeLessThan(0.08);        // rafales lentes : pas de saut d'un pas à l'autre
    // le vent moyen du beau temps est bien plus faible
    const calm = boot({ weather: 'clair', seed: 4 });
    expect(Math.hypot(calm.ext.sky.windMeanX, calm.ext.sky.windMeanZ)).toBeCloseTo(WEATHER_PROFILES.clair.wind, 5);
  });

  it('le vent dominant vient de l’ouest : il pousse vers l’est', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = boot({ seed });
      expect(t.ext.sky.windMeanX).toBeGreaterThan(0);
    }
  });

  it('setWind impose le vent : effet immédiat, rafales autour, calme plat si nul', () => {
    const t = boot({ weather: 'orage' });
    t.env.setWind(0, -6); // vers le nord
    expect(t.env.state.windX).toBe(0);
    expect(t.env.state.windZ).toBe(-6);
    t.step(120);
    expect(t.ext.sky.windMeanZ).toBe(-6);
    expect(t.env.state.windZ).toBeLessThan(-1.5); // toujours vers le nord malgré les rafales
    t.ext.gustiness = 0;
    t.step(1);
    expect(t.env.state.windX).toBeCloseTo(0, 9);
    expect(t.env.state.windZ).toBeCloseTo(-6, 9);
    t.env.setWind(0, 0);
    t.ext.gustiness = 1;
    t.step(30);
    expect(Math.hypot(t.env.state.windX, t.env.state.windZ)).toBe(0);
    // on rend la main à la météo : le vent d'orage revient
    t.ext.releaseWind();
    t.step(120);
    expect(Math.hypot(t.ext.sky.windMeanX, t.ext.sky.windMeanZ)).toBeGreaterThan(5);
    t.env.setWind(NaN, 1);
    expect(Number.isFinite(t.env.state.windX)).toBe(true);
  });

  it('les éclairs ne tombent que par temps d’orage et préviennent par un événement', () => {
    const calm = boot({ weather: 'averse' });
    calm.step(300);
    expect(calm.events.filter((e) => e[0] === 'env:lightning').length).toBe(0);
    expect(calm.ext.sky.lightning).toBe(0);

    const storm = boot({ weather: 'orage', seed: 9 });
    let peak = 0;
    let lit = 0;
    let n = 0;
    storm.step(300, 0.05, () => {
      peak = Math.max(peak, storm.ext.sky.lightning);
      if (storm.ext.sky.lightning > 0.3) lit++;
      n++;
    });
    const strikes = storm.events.filter((e) => e[0] === 'env:lightning');
    expect(strikes.length).toBeGreaterThan(8);   // ≈ 5 par minute en moyenne
    expect(strikes.length).toBeLessThan(70);
    expect(peak).toBeGreaterThan(0.4);
    expect(lit / n).toBeLessThan(0.05);          // des éclats brefs, pas un stroboscope
    const s = strikes[0]![1] as { distance: number; intensity: number };
    expect(s.distance).toBeGreaterThan(400);
    expect(s.intensity).toBeGreaterThan(0);
    // éclair commandé
    const manual = boot({ weather: 'clair' });
    manual.ext.strike(1);
    expect(manual.ext.sky.lightning).toBeGreaterThan(0.9);
    manual.step(2);
    expect(manual.ext.sky.lightning).toBe(0);
  });

  it('est déterministe : même graine, même météo', () => {
    const run = (seed: number): number[] => {
      const t = boot({ weather: 'orage', seed });
      const out: number[] = [];
      t.step(120, 0.05, () => out.push(t.env.state.windX, t.env.state.rain, t.ext.sky.lightning));
      return out;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('météo dynamique : le temps évolue de lui-même vers un temps voisin', () => {
    const t = boot({ weather: 'nuageux', seed: 3, extra: { weatherDynamic: true } });
    t.step(3600, 0.05);
    const changes = t.events.filter((e) => e[0] === 'env:weather').map((e) => (e[1] as { weather: WeatherKind }).weather);
    expect(changes.length).toBeGreaterThan(2);
    expect(changes.length).toBeLessThan(16);
    // jamais de saut direct du beau temps à l'orage
    const seq: WeatherKind[] = ['nuageux', ...changes];
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === 'orage') expect(seq[i - 1]).toBe('averse');
    }
    // par défaut (missions) la météo demandée reste en place
    const fixed = boot({ weather: 'nuageux', seed: 3 });
    fixed.step(3600, 0.05);
    expect(fixed.events.filter((e) => e[0] === 'env:weather').length).toBe(0);
    expect(fixed.env.state.weather).toBe('nuageux');
  });
});
