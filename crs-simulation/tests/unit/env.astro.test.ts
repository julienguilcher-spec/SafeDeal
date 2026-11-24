import { describe, expect, it } from 'vitest';
import {
  PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG, SPRING_DATE, computeSkyBodies, computeSunTimes, createSkyBodies,
  julianDay, julianDayLocal, refractionDeg,
} from '@/env/astro';

const DEG = Math.PI / 180;
const at = (hour: number, dayOffset = 0) =>
  computeSkyBodies(julianDayLocal(SPRING_DATE, hour, dayOffset), PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG, createSkyBodies());

describe('env — astronomie de position', () => {
  it('calcule le jour julien de référence', () => {
    expect(julianDay(2000, 1, 1, 12)).toBeCloseTo(2451545.0, 6);
    expect(julianDay(2026, 5, 1, 0)).toBeCloseTo(2461161.5, 6);
    // 12 h légales à Paris en heure d'été = 10 h TU
    expect(julianDayLocal(SPRING_DATE, 12)).toBeCloseTo(2461161.5 + 10 / 24, 6);
  });

  it('le soleil se lève à l’est, culmine au sud et se couche à l’ouest (x = est, z = sud)', () => {
    const times = computeSunTimes(SPRING_DATE, PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG);
    const rise = at(times.sunrise);
    const noon = at(times.noon);
    const set = at(times.sunset);
    // lever : vers l'est (x > 0), un peu au nord au printemps (z < 0)
    expect(rise.sunX).toBeGreaterThan(0.85);
    expect(rise.sunZ).toBeLessThan(0);
    expect(Math.abs(rise.sunY)).toBeLessThan(0.02);
    // culmination : plein sud (z > 0), ni est ni ouest
    expect(Math.abs(noon.sunX)).toBeLessThan(0.01);
    expect(noon.sunZ).toBeGreaterThan(0.5);
    expect(noon.sunY).toBeGreaterThan(0.8);
    // coucher : vers l'ouest (x < 0), un peu au nord
    expect(set.sunX).toBeLessThan(-0.85);
    expect(set.sunZ).toBeLessThan(0);
    expect(Math.abs(set.sunY)).toBeLessThan(0.02);
    // la matinée est à l'est, l'après-midi à l'ouest
    expect(at(9).sunX).toBeGreaterThan(0);
    expect(at(18).sunX).toBeLessThan(0);
  });

  it('donne les horaires réels du 1er mai à Paris (heure d’été)', () => {
    const t = computeSunTimes(SPRING_DATE, PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG);
    // éphémérides : lever ≈ 6 h 32, coucher ≈ 21 h 05, midi solaire ≈ 13 h 48, hauteur ≈ 56°
    expect(Math.abs(t.sunrise - (6 + 32 / 60))).toBeLessThan(0.12);
    expect(Math.abs(t.sunset - (21 + 5 / 60))).toBeLessThan(0.12);
    expect(Math.abs(t.noon - (13 + 48 / 60))).toBeLessThan(0.08);
    expect(t.noonElevation / DEG).toBeGreaterThan(55);
    expect(t.noonElevation / DEG).toBeLessThan(57.5);
  });

  it('renvoie des directions unitaires, de jour comme de nuit', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const b = at(h);
      expect(Math.hypot(b.sunX, b.sunY, b.sunZ)).toBeCloseTo(1, 6);
      expect(Math.hypot(b.moonX, b.moonY, b.moonZ)).toBeCloseTo(1, 6);
      expect(b.sunY).toBeCloseTo(Math.sin(b.sunElevation), 6);
    }
    // nuit noire à 1 h du matin : soleil nettement sous l'horizon, au nord
    const night = at(1);
    expect(night.sunElevation / DEG).toBeLessThan(-18);
    expect(night.sunZ).toBeLessThan(0);
  });

  it('la course du soleil est continue (pas de saut d’une minute à l’autre)', () => {
    let prev = at(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const cur = at(m / 60);
      const dot = prev.sunX * cur.sunX + prev.sunY * cur.sunY + prev.sunZ * cur.sunZ;
      // 0,25° par minute au plus (+ réfraction près de l'horizon)
      expect(Math.acos(Math.min(1, dot)) / DEG).toBeLessThan(0.4);
      prev = cur;
    }
  });

  it('pleine lune le soir du 1er mai 2026 : elle se lève quand le soleil se couche', () => {
    const evening = at(23);
    expect(evening.moonPhase).toBeGreaterThan(0.97);
    expect(evening.moonElevation).toBeGreaterThan(5 * DEG);
    // à l'opposé du soleil : au sud-est en fin de soirée
    expect(evening.moonX).toBeGreaterThan(0);
    expect(evening.moonZ).toBeGreaterThan(0);
    // en plein jour la pleine lune est sous l'horizon
    expect(at(13).moonElevation).toBeLessThan(0);
    // une semaine plus tard : dernier quartier, lune décroissante
    const later = at(23, 8);
    expect(later.moonPhase).toBeGreaterThan(0.3);
    expect(later.moonPhase).toBeLessThan(0.7);
    expect(later.moonWaxing).toBe(false);
    // deux semaines plus tard : nouvelle lune
    expect(at(12, 15).moonPhase).toBeLessThan(0.06);
  });

  it('la réfraction relève l’astre à l’horizon et s’annule en hauteur', () => {
    expect(refractionDeg(0)).toBeGreaterThan(0.4);
    expect(refractionDeg(0)).toBeLessThan(0.7);
    expect(refractionDeg(45)).toBeLessThan(0.03);
    expect(refractionDeg(-4)).toBeCloseTo(0, 6);
    // continue autour de -1°
    expect(Math.abs(refractionDeg(-1.001) - refractionDeg(-0.999))).toBeLessThan(0.01);
  });
});
