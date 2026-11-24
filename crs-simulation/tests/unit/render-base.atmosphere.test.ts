import { describe, expect, it } from 'vitest';
import {
  cloudOcclusion, computeAtmosphere, createAtmosphere, fogDensityFor, sunIntensityAt, toneMapAces, visibilityFor,
} from '@/render/base/atmosphere';
import type { AtmosphereInput } from '@/render/base/atmosphere';
import { luminance } from '@/render/base/util';

const DEG = Math.PI / 180;

/** Ciel d'essai : soleil à la hauteur donnée plein ouest, pleine lune à l'opposé. */
function input(sunElevDeg: number, over: Partial<AtmosphereInput> = {}): AtmosphereInput {
  const e = sunElevDeg * DEG;
  return {
    sunX: -Math.cos(e), sunY: Math.sin(e), sunZ: 0, sunElevDeg,
    moonX: Math.cos(e), moonY: Math.sin(-e), moonZ: 0, moonElevDeg: -sunElevDeg, moonPhase: 1,
    clouds: 0.12, fog: 0.02, rain: 0, lightning: 0,
    // allumage progressif des candélabres autour du coucher, comme dans le jeu (niveau lissé)
    streetLights: Math.min(1, Math.max(0, (1 - sunElevDeg) / 2)), ...over,
  };
}
const at = (elev: number, over: Partial<AtmosphereInput> = {}) => computeAtmosphere(input(elev, over), createAtmosphere());
const lum = (c: Float32Array) => luminance(c[0]!, c[1]!, c[2]!);

describe('rendu de base — modèle d’atmosphère', () => {
  it('plein jour : ciel bleu, soleil presque blanc et fort, exposition normale', () => {
    const a = at(56);
    expect(a.zenith[2]).toBeGreaterThan(a.zenith[0]! * 3);        // zénith bleu
    expect(lum(a.horizon)).toBeGreaterThan(lum(a.zenith) * 1.8);   // horizon plus clair que le zénith
    expect(a.lightIsMoon).toBe(false);
    expect(a.lightIntensity).toBeGreaterThan(2.8);
    expect(a.lightColor[2]).toBeGreaterThan(0.8);
    expect(a.exposure).toBeCloseTo(1, 1);
    expect(a.stars).toBe(0);
    expect(a.night).toBe(0);
    expect(a.lightY).toBeCloseTo(Math.sin(56 * DEG), 5);
  });

  it('pas d’ombres bouchées : l’ambiance garde au moins un sixième de la lumière directe', () => {
    for (const elev of [56, 30, 12]) {
      const a = at(elev);
      // surface horizontale blanche : éclairement direct ≈ intensité × sin(hauteur), ambiant ≈ luminance du ciel
      const direct = a.lightIntensity * Math.sin(elev * DEG);
      expect(lum(a.hemiSky) * a.hemiIntensity).toBeGreaterThan(direct / 6);
    }
  });

  it('coucher de soleil : lumière chaude et affaiblie, horizon embrasé du côté du soleil', () => {
    const noon = at(56);
    const set = at(2);
    expect(set.lightIntensity).toBeLessThan(noon.lightIntensity * 0.5);
    expect(set.lightIntensity).toBeGreaterThan(0.5);
    // la lumière vire à l'orangé : beaucoup moins de bleu que de rouge
    expect(set.lightColor[2]).toBeLessThan(set.lightColor[0]! * 0.35);
    expect(noon.lightColor[2]).toBeGreaterThan(noon.lightColor[0]! * 0.8);
    // l'horizon côté soleil est rouge-orangé, le côté opposé reste froid
    expect(set.horizonSun[0]).toBeGreaterThan(set.horizonSun[2]! * 2.5);
    expect(set.horizonSun[0]).toBeGreaterThan(set.horizon[0]! * 1.8);
    expect(set.horizon[2]).toBeGreaterThanOrEqual(set.horizon[0]!);
    // la lueur reste collée à l'horizon au couchant, elle s'étale en plein jour
    expect(set.warmFalloff).toBeGreaterThan(noon.warmFalloff * 1.8);
    // le soleil rasant garde une direction au-dessus de l'horizon
    expect(at(-1).lightY).toBeGreaterThan(0.04);
  });

  it('du jour à la nuit, la lumière directe passe par zéro : le relais soleil → lune est invisible', () => {
    const before = at(-2.9);
    const after = at(-3.1);
    expect(before.lightIsMoon).toBe(false);
    expect(after.lightIsMoon).toBe(true);
    expect(before.lightIntensity).toBeLessThan(0.02);
    expect(after.lightIntensity).toBeLessThan(0.02);
    // et l'ambiance, elle, reste continue
    expect(Math.abs(lum(before.hemiSky) - lum(after.hemiSky))).toBeLessThan(0.02);
    expect(Math.abs(before.exposure - after.exposure)).toBeLessThan(0.02);
  });

  it('tout varie continûment avec la hauteur du soleil (pas de saut de lumière)', () => {
    let prev = at(-20);
    for (let e = -19.9; e <= 60; e += 0.1) {
      const cur = at(e);
      expect(Math.abs(cur.lightIntensity - prev.lightIntensity)).toBeLessThan(0.06);
      expect(Math.abs(lum(cur.hemiSky) - lum(prev.hemiSky))).toBeLessThan(0.02);
      expect(Math.abs(lum(cur.fogColor) - lum(prev.fogColor))).toBeLessThan(0.02);
      expect(Math.abs(cur.exposure - prev.exposure)).toBeLessThan(0.02);
      prev = cur;
    }
  });

  it('nuit lisible : la lune éclaire, l’ambiance ne tombe jamais à zéro, l’exposition monte', () => {
    const night = at(-25);
    expect(night.lightIsMoon).toBe(true);
    expect(night.lightIntensity).toBeGreaterThan(0.3);     // pleine lune haute
    expect(night.lightColor[2]).toBeGreaterThan(night.lightColor[0]!);   // lumière froide
    expect(night.exposure).toBeGreaterThan(1.5);
    expect(night.stars).toBeGreaterThan(0.8);
    expect(night.night).toBe(1);
    // surface blanche horizontale à l'ombre de la lune, après exposition : nettement au-dessus du noir
    const shade = (lum(night.hemiSky) / Math.PI) * night.exposure;
    expect(shade).toBeGreaterThan(0.1);
    // sans lune ni éclairage public, il reste une lueur de ciel
    const dark = at(-25, { moonElevDeg: -30, moonY: -0.5, streetLights: 0 });
    expect(dark.lightIntensity).toBe(0);
    expect(lum(dark.hemiSky)).toBeGreaterThan(0.1);
    expect(dark.lightY).toBeGreaterThan(0.9);
    // l'éclairage public réchauffe et relève l'ambiance
    expect(lum(night.hemiSky)).toBeGreaterThan(lum(dark.hemiSky));
    expect(night.hemiSky[0]! / night.hemiSky[2]!).toBeGreaterThan(dark.hemiSky[0]! / dark.hemiSky[2]!);
    // nouvelle lune : presque pas de lumière directe
    expect(at(-25, { moonPhase: 0 }).lightIntensity).toBeLessThan(0.05);
  });

  it('ciel couvert : plus de soleil direct, lumière diffuse grise, ciel jamais uni (deux gris distincts)', () => {
    const clear = at(50);
    const over = at(50, { clouds: 0.95, fog: 0.08 });
    expect(over.lightIntensity).toBeLessThan(clear.lightIntensity * 0.15);
    expect(lum(over.hemiSky)).toBeGreaterThan(lum(clear.hemiSky));       // le ciel devient la source principale
    // gris : composantes proches
    expect(Math.abs(over.zenith[0]! - over.zenith[2]!)).toBeLessThan(0.12);
    expect(over.exposure).toBeGreaterThan(clear.exposure);
    // les nuages éclairés et à l'ombre restent distincts, même sous un ciel bouché
    expect(lum(over.cloudLit)).toBeGreaterThan(lum(over.cloudShade) * 1.5);
    expect(cloudOcclusion(0.1)).toBe(0);
    expect(cloudOcclusion(1)).toBe(1);
  });

  it('pluie et orage assombrissent le ciel et la scène', () => {
    const over = at(40, { clouds: 0.95 });
    const rain = at(40, { clouds: 0.97, rain: 0.45, fog: 0.14 });
    const storm = at(40, { clouds: 1, rain: 0.85, fog: 0.16 });
    expect(lum(rain.zenith)).toBeLessThan(lum(over.zenith));
    expect(lum(storm.zenith)).toBeLessThan(lum(rain.zenith) * 0.75);
    expect(lum(storm.hemiSky)).toBeLessThan(lum(over.hemiSky) * 0.8);
    expect(storm.storm).toBeGreaterThan(rain.storm);
    // mais l'orage de jour reste lisible
    expect(lum(storm.hemiSky)).toBeGreaterThan(0.45);
    // éclair : la scène s'illumine
    const flash = at(40, { clouds: 1, rain: 0.85, lightning: 1 });
    expect(lum(flash.hemiSky)).toBeGreaterThan(lum(storm.hemiSky) + 0.5);
  });

  it('brouillard : voile laiteux, soleil éteint, brume qui monte jusqu’au zénith', () => {
    const clear = at(30);
    const fog = at(30, { fog: 0.85, clouds: 0.7 });
    expect(fog.haze).toBeGreaterThan(clear.haze * 20);
    expect(fog.lightIntensity).toBeLessThan(clear.lightIntensity * 0.3);
    // zénith et horizon presque de la même couleur
    expect(Math.abs(lum(fog.zenith) - lum(fog.horizon))).toBeLessThan(0.15);
    expect(Math.abs(lum(clear.zenith) - lum(clear.horizon))).toBeGreaterThan(0.3);
    expect(fog.sunDisc[0]).toBeLessThan(clear.sunDisc[0]! * 0.05);
  });

  it('la couleur du brouillard est celle de l’horizon : le lointain se fond dans le ciel', () => {
    for (const elev of [56, 10, 0, -6, -25]) {
      const a = at(elev);
      for (let i = 0; i < 3; i++) {
        const lo = Math.min(a.horizon[i]!, a.horizonSun[i]!);
        const hi = Math.max(a.horizon[i]!, a.horizonSun[i]!);
        expect(a.fogColor[i]).toBeGreaterThanOrEqual(lo * 0.8 - 1e-6);
        expect(a.fogColor[i]).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('visibilité et densité du brouillard de scène', () => {
    expect(visibilityFor(500, 0, 0)).toBeCloseTo(500, 5);
    const fog = visibilityFor(500, 0.85, 0);
    expect(fog).toBeGreaterThan(50);
    expect(fog).toBeLessThan(90);
    expect(visibilityFor(500, 0, 1)).toBeLessThan(300);
    // plus de brouillard ⇒ on voit moins loin, toujours
    let prev = Infinity;
    for (let f = 0; f <= 1; f += 0.05) {
      const v = visibilityFor(500, f, 0);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    // à la distance de visibilité, le brouillard exponentiel de Three.js masque environ 92 %
    const d = fogDensityFor(200);
    expect(1 - Math.exp(-(d * 200) * (d * 200))).toBeGreaterThan(0.9);
    expect(1 - Math.exp(-(d * 50) * (d * 50))).toBeLessThan(0.2);   // et reste discret de près
  });

  it('intensité du soleil croissante avec sa hauteur', () => {
    let prev = -1;
    for (let e = -5; e <= 60; e += 1) {
      const v = sunIntensityAt(e);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(sunIntensityAt(-3)).toBe(0);
  });

  it('reproduit le tone mapping ACES du renderer', () => {
    const out = new Float32Array(3);
    toneMapAces(0, 0, 0, 1, out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
    // gris moyen : valeurs de référence de l'approximation RRT + ODT (exposition 1, pré-gain 1/0,6)
    toneMapAces(0.18, 0.18, 0.18, 1, out);
    expect(out[0]).toBeCloseTo(out[1]!, 2);
    expect(out[0]).toBeGreaterThan(0.2);
    expect(out[0]).toBeLessThan(0.36);
    // les hautes lumières sont comprimées sous 1 et l'ordre est conservé
    toneMapAces(4, 4, 4, 1, out);
    expect(out[0]).toBeGreaterThan(0.9);
    expect(out[0]).toBeLessThanOrEqual(1);
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    toneMapAces(0.3, 0.3, 0.3, 1, a);
    toneMapAces(0.3, 0.3, 0.3, 1.5, b);
    expect(b[0]).toBeGreaterThan(a[0]!);
  });

  it('ne produit aucune valeur invalide sur toute la plage d’entrées', () => {
    const a = createAtmosphere();
    for (let elev = -90; elev <= 90; elev += 7.5) {
      for (const clouds of [0, 0.5, 1]) {
        for (const fog of [0, 1]) {
          computeAtmosphere(input(elev, { clouds, fog, rain: clouds, lightning: fog, streetLights: fog }), a);
          for (const c of [a.zenith, a.horizon, a.horizonSun, a.fogColor, a.hemiSky, a.hemiGround, a.cloudLit, a.cloudShade, a.sunDisc, a.sunGlow, a.moonColor, a.lightColor]) {
            for (let i = 0; i < 3; i++) {
              expect(Number.isFinite(c[i])).toBe(true);
              expect(c[i]).toBeGreaterThanOrEqual(0);
            }
          }
          expect(Math.hypot(a.lightX, a.lightY, a.lightZ)).toBeCloseTo(1, 2);
          expect(a.lightY).toBeGreaterThan(0);
          expect(a.exposure).toBeGreaterThan(0.9);
          expect(a.exposure).toBeLessThan(2.2);
        }
      }
    }
  });
});
