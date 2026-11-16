// Éclairage nocturne des fenêtres : proportion selon l'heure, uniformes partagés.
import { describe, expect, it } from 'vitest';
import type { EnvState } from '../../src/core/contracts';
import { buildingUniforms, litFractionAt, updateBuildingUniforms } from '../../src/world/view/buildings/materials';

function env(hour: number, daylight: number, clouds = 0.2): EnvState {
  return {
    timeOfDay: hour, clockScale: 1, weather: 'clair', rain: 0, fog: 0, clouds, wetness: 0, windX: 0, windZ: 0,
    sunX: 0, sunY: 1, sunZ: 0, daylight, isNight: daylight < 0.15, streetLights: daylight < 0.3,
  };
}

describe('fenêtres éclairées', () => {
  it('proportion selon l\'heure : soirée > nuit profonde, matin > milieu de journée', () => {
    expect(litFractionAt(21)).toBeGreaterThan(0.4);
    expect(litFractionAt(21)).toBeGreaterThan(litFractionAt(23.5));
    expect(litFractionAt(23.5)).toBeGreaterThan(litFractionAt(3));
    expect(litFractionAt(3)).toBeLessThan(0.08);
    expect(litFractionAt(7.5)).toBeGreaterThan(litFractionAt(12));
    for (let h = -30; h <= 60; h += 0.25) {
      const f = litFractionAt(h);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(0.6);
    }
  });

  it('continue : pas de saut d\'un quart d\'heure à l\'autre, ni à minuit', () => {
    for (let h = 0; h < 24; h += 0.05) expect(Math.abs(litFractionAt(h + 0.05) - litFractionAt(h))).toBeLessThan(0.02);
    expect(litFractionAt(24)).toBeCloseTo(litFractionAt(0), 9);
    expect(litFractionAt(-1)).toBeCloseTo(litFractionAt(23), 9);
  });

  it('uniformes : intensité forte la nuit, faible le jour ; reflet du ciel éteint la nuit', () => {
    updateBuildingUniforms(env(22, 0));
    const night = buildingUniforms.uLit.value.clone();
    const skyNight = buildingUniforms.uSky.value.clone();
    expect(night.x).toBeCloseTo(litFractionAt(22), 9);
    expect(night.z).toBe(1);
    updateBuildingUniforms(env(14, 1));
    const day = buildingUniforms.uLit.value.clone();
    expect(day.z).toBe(0);
    expect(night.y).toBeGreaterThan(day.y * 4);
    expect(buildingUniforms.uSky.value.b).toBeGreaterThan(skyNight.b * 8);
    // ciel couvert : reflet plus gris (moins bleu par rapport au rouge)
    const clear = buildingUniforms.uSky.value.clone();
    updateBuildingUniforms(env(14, 1, 1));
    const overcast = buildingUniforms.uSky.value;
    expect(overcast.b / overcast.r).toBeLessThan(clear.b / clear.r);
    // valeurs hors bornes : rien d'infini
    updateBuildingUniforms(env(99, 7, -3));
    expect(Number.isFinite(buildingUniforms.uLit.value.x + buildingUniforms.uLit.value.y + buildingUniforms.uSky.value.r)).toBe(true);
  });
});
