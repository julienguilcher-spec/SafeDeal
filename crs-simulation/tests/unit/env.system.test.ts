import { describe, expect, it } from 'vitest';
import type { EnvExtApi } from '@/env';
import { CLOCK_SCALE_BY_DURATION, ENV_EXT_SERVICE, EnvSystem, createSystems } from '@/env';
import { createFakeContext } from '@/env/dev/fakeContext';
import type { SessionConfig } from '@/core/contracts';

function boot(partial: Partial<SessionConfig> | null = {}) {
  const fake = createFakeContext(partial);
  const sys = createSystems()[0] as EnvSystem;
  sys.provide(fake.ctx);
  sys.reset();
  const step = (seconds: number, dt = 0.05): void => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) sys.update(dt);
  };
  return { ...fake, sys, step, env: fake.ctx.env, ext: fake.ctx.require<EnvExtApi>(ENV_EXT_SERVICE) };
}

describe('env — système', () => {
  it('publie ctx.env et le service étendu dès provide()', () => {
    const t = boot();
    expect(t.env).toBe(t.sys);
    expect(t.ext.sky).toBe(t.sys.sky);
    expect(t.sys.id).toBe('env');
  });

  it('se règle sur la configuration de session : heure, météo, vitesse de l’horloge', () => {
    const t = boot({ timeOfDay: 17.5, weather: 'pluie', duration: 'standard' });
    expect(t.env.state.timeOfDay).toBeCloseTo(17.5, 6);
    expect(t.env.state.weather).toBe('pluie');
    expect(t.env.state.rain).toBeGreaterThan(0.3);
    expect(t.env.state.wetness).toBe(1);
    expect(t.env.state.clockScale).toBe(CLOCK_SCALE_BY_DURATION.standard);
    // nouvelle session : tout est remis à zéro
    t.setConfig({ timeOfDay: 9, weather: 'clair', duration: 'temps_reel' });
    t.sys.reset();
    expect(t.env.state.timeOfDay).toBeCloseTo(9, 6);
    expect(t.env.state.rain).toBe(0);
    expect(t.env.state.wetness).toBe(0);
    expect(t.env.state.clockScale).toBe(1);
  });

  it('accepte les options hors contrat de config.extra', () => {
    const t = boot({ duration: 'standard', extra: { clockScale: 60, wind: { x: 3, z: -1 }, weatherDynamic: true } });
    expect(t.env.state.clockScale).toBe(60);
    expect(t.ext.sky.windMeanX).toBeCloseTo(3, 6);
    expect(t.ext.sky.windMeanZ).toBeCloseTo(-1, 6);
    expect(t.ext.dynamicWeather).toBe(true);
    const u = boot({ extra: { windSpeed: 5, windHeading: Math.PI / 2 } }); // cap 90° = vers l'est
    expect(u.ext.sky.windMeanX).toBeCloseTo(5, 5);
    expect(u.ext.sky.windMeanZ).toBeCloseTo(0, 5);
  });

  it('fonctionne sans configuration de session', () => {
    const t = boot(null);
    expect(t.env.state.weather).toBe('clair');
    expect(t.env.state.timeOfDay).toBe(14);
    t.step(1);
    expect(Number.isFinite(t.env.state.sunY)).toBe(true);
  });

  it('avance l’horloge selon clockScale et émet env:hour à chaque heure pleine', () => {
    const t = boot({ timeOfDay: 9.99, duration: 'temps_reel' });
    t.env.setClockScale(3600); // 1 s réelle = 1 h de jeu
    t.step(2.5);
    expect(t.env.state.timeOfDay).toBeCloseTo(12.49, 2);
    const hours = t.events.filter((e) => e[0] === 'env:hour').map((e) => (e[1] as { hour: number }).hour);
    expect(hours).toEqual([10, 11, 12]);
    // horloge arrêtée
    t.env.setClockScale(0);
    t.step(5);
    expect(t.env.state.timeOfDay).toBeCloseTo(12.49, 2);
    // valeurs invalides ignorées
    t.env.setClockScale(-3);
    t.env.setClockScale(NaN);
    expect(t.env.state.clockScale).toBe(0);
  });

  it('passe minuit sans rupture et compte les jours', () => {
    const t = boot({ timeOfDay: 23.9 });
    t.env.setClockScale(3600);
    const before = { x: t.ext.sky.moonX, y: t.ext.sky.moonY, z: t.ext.sky.moonZ };
    t.step(0.2);
    expect(t.env.state.timeOfDay).toBeCloseTo(0.1, 2);
    expect(t.ext.sky.day).toBe(1);
    // la lune n'a pas sauté (12 min de jeu : quelques degrés au plus)
    const dot = before.x * t.ext.sky.moonX + before.y * t.ext.sky.moonY + before.z * t.ext.sky.moonZ;
    expect(Math.acos(Math.min(1, dot)) * 57.3).toBeLessThan(5);
    expect(t.events.some((e) => e[0] === 'env:hour' && (e[1] as { hour: number }).hour === 0)).toBe(true);
  });

  it('setTime règle l’heure (modulo 24) et recalcule aussitôt le ciel', () => {
    const t = boot({ timeOfDay: 14 });
    t.env.setTime(26);
    expect(t.env.state.timeOfDay).toBeCloseTo(2, 6);
    expect(t.env.state.isNight).toBe(true);
    t.env.setTime(-1);
    expect(t.env.state.timeOfDay).toBeCloseTo(23, 6);
    t.env.setTime(NaN);
    expect(t.env.state.timeOfDay).toBeCloseTo(23, 6);
    expect(t.ext.timeLabel()).toBe('23 h 00');
    t.env.setTime(14 + 5 / 60);
    expect(t.ext.timeLabel()).toBe('14 h 05');
  });

  it('lumière du jour : pleine à midi, nulle la nuit, intermédiaire au crépuscule', () => {
    const t = boot({ timeOfDay: 13.8 });
    expect(t.env.state.daylight).toBeGreaterThan(0.95);
    expect(t.env.state.isNight).toBe(false);
    expect(t.env.state.streetLights).toBe(false);
    t.env.setTime(21.2); // juste après le coucher
    expect(t.env.state.daylight).toBeGreaterThan(0.1);
    expect(t.env.state.daylight).toBeLessThan(0.6);
    expect(t.env.state.isNight).toBe(false);
    t.env.setTime(1);
    expect(t.env.state.daylight).toBe(0);
    expect(t.env.state.isNight).toBe(true);
  });

  it('la lumière du jour suit une courbe monotone du lever à la culmination', () => {
    const t = boot({ timeOfDay: 4 });
    let prev = -1;
    for (let h = 4; h <= t.ext.sky.solarNoon; h += 0.1) {
      t.env.setTime(h);
      expect(t.env.state.daylight).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t.env.state.daylight;
    }
    expect(prev).toBeGreaterThan(0.95);
  });

  it('allume l’éclairage public quand il fait sombre, avec hystérésis', () => {
    const t = boot({ timeOfDay: 20 });
    expect(t.env.state.streetLights).toBe(false);
    t.env.setTime(20.9);  // soleil encore levé
    expect(t.env.state.streetLights).toBe(false);
    t.env.setTime(21.3);  // couché : allumage
    expect(t.env.state.streetLights).toBe(true);
    t.env.setTime(21.05); // on revient juste avant le coucher : pas de clignotement
    expect(t.env.state.streetLights).toBe(true);
    t.env.setTime(23);
    expect(t.env.state.streetLights).toBe(true);
    t.env.setTime(7.5);   // matin : extinction
    expect(t.env.state.streetLights).toBe(false);
    // orage en fin d'après-midi : le ciel s'assombrit nettement…
    const s = boot({ timeOfDay: 18.5, weather: 'orage' });
    expect(s.env.state.daylight).toBeLessThan(0.75);
    expect(s.env.state.streetLights).toBe(false);
    // … et l'éclairage s'allume plus tôt le soir (soleil encore à ≈ 3°)
    const dusk = boot({ timeOfDay: 20.75, weather: 'orage' });
    expect(dusk.env.state.streetLights).toBe(true);
    const clear = boot({ timeOfDay: 20.75, weather: 'clair' });
    expect(clear.env.state.streetLights).toBe(false);
    // session lancée de nuit : allumé d'emblée
    expect(boot({ timeOfDay: 2 }).env.state.streetLights).toBe(true);
  });

  it('la direction publiée pointe vers le soleil le jour, vers la lune la nuit, toujours au-dessus de l’horizon', () => {
    const t = boot({ timeOfDay: 10 });
    for (let h = 0; h < 24; h += 0.25) {
      t.env.setTime(h);
      const s = t.env.state;
      expect(Math.hypot(s.sunX, s.sunY, s.sunZ)).toBeCloseTo(1, 5);
      expect(s.sunY).toBeGreaterThan(0.04);
    }
    t.env.setTime(10);
    expect(t.ext.sky.dominant).toBe('sun');
    expect(t.env.state.sunX).toBeCloseTo(t.ext.sky.sunX, 6);
    expect(t.env.state.sunX).toBeGreaterThan(0); // matin : à l'est
    t.env.setTime(0.5);
    expect(t.ext.sky.dominant).toBe('moon');
    expect(t.env.state.sunX).toBeCloseTo(t.ext.sky.moonX, 6);
    expect(t.env.state.sunZ).toBeGreaterThan(0); // pleine lune au sud vers 1 h
    // le vrai soleil, lui, est sous l'horizon
    expect(t.ext.sky.sunY).toBeLessThan(-0.3);
    // soleil rasant : direction relevée mais même azimut
    t.env.setTime(21.1);
    expect(t.ext.sky.dominant).toBe('sun');
    expect(t.env.state.sunX).toBeLessThan(-0.8);
  });

  it('expose les horaires du soleil du jour', () => {
    const t = boot();
    expect(t.ext.sky.sunrise).toBeGreaterThan(6.3);
    expect(t.ext.sky.sunrise).toBeLessThan(6.7);
    expect(t.ext.sky.sunset).toBeGreaterThan(20.9);
    expect(t.ext.sky.sunset).toBeLessThan(21.3);
    // changement de saison : en plein hiver le jour est bien plus court
    t.sys.setDate({ year: 2026, month: 12, day: 21, utcOffset: 1 });
    expect(t.ext.sky.sunset - t.ext.sky.sunrise).toBeLessThan(8.6);
  });

  it('le coût d’un pas de simulation est négligeable', () => {
    const t = boot({ weather: 'orage' });
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) t.sys.update(0.05);
    const us = ((performance.now() - t0) / 20000) * 1000;
    expect(us).toBeLessThan(50); // microsecondes par pas (≈ 3 µs mesurés)
  });
});
