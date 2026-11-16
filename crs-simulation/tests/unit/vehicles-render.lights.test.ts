/* Rythme des gyrophares et des clignotants, niveaux de détail, tableau de bord : logique pure. */
import { describe, expect, it } from 'vitest';
import {
  BEACON_PERIOD, FLASH_ON, INDICATOR_HZ, beaconLevel, beaconPatternFor, beaconPhaseFor, flashesPerSecond, indicatorOn,
} from '@/render/vehicles/beacons';
import type { BeaconPattern } from '@/render/vehicles/beacons';
import {
  LOD_FAR, LOD_HIDDEN, LOD_HYSTERESIS, LOD_NEAR, VEHICLE_QUALITY, adaptNearScale, chooseLod, lodSizeFactor,
} from '@/render/vehicles/lod';
import { dashSignature, gearLabel, needleAngle, rpmFraction, speedKmh, speedoMax } from '@/render/vehicles/dashlogic';

/** Compte les fronts montants d'un groupe de feux sur `seconds` secondes. */
function countFlashes(pattern: BeaconPattern, side: 0 | 1, seconds: number, phase = 0): number {
  const dt = 0.001;
  let n = 0, prev = beaconLevel(pattern, 0, side, phase) > 0.5;
  for (let t = dt; t < seconds; t += dt) {
    const on = beaconLevel(pattern, t, side, phase) > 0.5;
    if (on && !prev) n++;
    prev = on;
  }
  return n;
}

describe('gyrophares', () => {
  it('2 à 4 éclats par seconde et par groupe de feux (dossier 02 §4.8)', () => {
    for (const p of ['rampe', 'gyro', 'strobe'] as const) {
      const f = flashesPerSecond(p);
      expect(f, p).toBeGreaterThanOrEqual(1.2);
      expect(f, p).toBeLessThanOrEqual(4);
      const measured = countFlashes(p, 0, 12) / 12;
      expect(Math.abs(measured - f), p).toBeLessThan(0.2);
    }
    expect(flashesPerSecond('rampe')).toBeGreaterThanOrEqual(2);
    expect(flashesPerSecond('rampe')).toBeLessThanOrEqual(4);
  });

  it('rampe : doubles éclats alternés gauche / droite, jamais les deux côtés ensemble', () => {
    let both = 0, a = 0, b = 0;
    const dt = 0.001;
    for (let t = 0; t < 6; t += dt) {
      const la = beaconLevel('rampe', t, 0), lb = beaconLevel('rampe', t, 1);
      if (la > 0 && lb > 0) both++;
      if (la > 0) a++;
      if (lb > 0) b++;
    }
    expect(both).toBe(0);
    // même temps d'allumage des deux côtés : deux éclats de FLASH_ON par cycle
    const duty = (2 * FLASH_ON) / BEACON_PERIOD.rampe;
    expect(a * dt / 6).toBeCloseTo(duty, 1);
    expect(b * dt / 6).toBeCloseTo(duty, 1);
    // le côté B joue le même motif une demi-période plus tard
    for (const t of [0.01, 0.07, 0.13, 0.2, 0.4]) {
      expect(beaconLevel('rampe', t + BEACON_PERIOD.rampe / 2, 1)).toBe(beaconLevel('rampe', t, 0));
    }
  });

  it('rampe : deux éclats groupés puis une pause (double flash)', () => {
    // fronts montants du côté A sur un cycle : à 0 et à FLASH_ON + intervalle
    const ups: number[] = [];
    let prev = false;
    for (let t = 0; t < BEACON_PERIOD.rampe; t += 0.001) {
      const on = beaconLevel('rampe', t, 0) > 0;
      if (on && !prev) ups.push(t);
      prev = on;
    }
    expect(ups.length).toBe(2);
    expect(ups[1]! - ups[0]!).toBeLessThan(0.2);
    expect(ups[1]!).toBeLessThan(BEACON_PERIOD.rampe / 2);
  });

  it('gyrophare tournant : impulsion douce bornée à [0, 1], les deux feux en opposition', () => {
    let max = 0;
    for (let t = 0; t < 2; t += 0.005) {
      const l = beaconLevel('gyro', t, 0);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      max = Math.max(max, l);
      expect(beaconLevel('gyro', t, 0) * beaconLevel('gyro', t, 1)).toBeLessThan(1e-9);
    }
    expect(max).toBeGreaterThan(0.95);
  });

  it('le décalage par véhicule est déterministe et réparti', () => {
    const seen = new Set<number>();
    for (let id = 1; id <= 200; id++) {
      const p = beaconPhaseFor(id);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
      expect(beaconPhaseFor(id)).toBe(p);
      seen.add(Math.floor(p * 10));
    }
    expect(seen.size).toBe(10);
    // un décalage change l'instant des éclats, pas leur cadence (à un éclat près aux bornes de la fenêtre)
    expect(Math.abs(countFlashes('rampe', 0, 6, 0.37) - countFlashes('rampe', 0, 6, 0))).toBeLessThanOrEqual(1);
  });

  it('motif selon le type de véhicule', () => {
    expect(beaconPatternFor('fourgon_crs')).toBe('rampe');
    expect(beaconPatternFor('camion_pompiers')).toBe('gyro');
    expect(beaconPatternFor('moto_bravm')).toBe('strobe');
    expect(beaconPatternFor('type_inconnu')).toBe('rampe');
  });

  it('clignotants : 60 à 120 battements par minute, moitié du temps allumés', () => {
    expect(INDICATOR_HZ * 60).toBeGreaterThanOrEqual(60);
    expect(INDICATOR_HZ * 60).toBeLessThanOrEqual(120);
    let on = 0, ups = 0, prev = indicatorOn(0);
    const dt = 0.001;
    for (let t = dt; t < 10; t += dt) {
      const o = indicatorOn(t);
      if (o) on++;
      if (o && !prev) ups++;
      prev = o;
    }
    expect(on * dt / 10).toBeCloseTo(0.5, 1);
    expect(ups / 10).toBeCloseTo(INDICATOR_HZ, 0);
  });
});

describe('niveaux de détail', () => {
  const q = VEHICLE_QUALITY.haut;

  it('près : détaillé ; loin : simplifié ; au-delà de la distance d\'affichage : masqué', () => {
    expect(chooseLod(LOD_HIDDEN, 5, 4.5, q, 900)).toBe(LOD_NEAR);
    expect(chooseLod(LOD_HIDDEN, q.near * 0.99, 4.5, q, 900)).toBe(LOD_NEAR);
    expect(chooseLod(LOD_HIDDEN, q.near * 1.01, 4.5, q, 900)).toBe(LOD_FAR);
    expect(chooseLod(LOD_HIDDEN, q.far * 0.9, 4.5, q, 900)).toBe(LOD_FAR);
    expect(chooseLod(LOD_HIDDEN, q.far * 1.01, 4.5, q, 900)).toBe(LOD_HIDDEN);
    // la distance d'affichage du rendu borne celle du module
    expect(chooseLod(LOD_HIDDEN, 150, 4.5, q, 120)).toBe(LOD_HIDDEN);
    expect(chooseLod(LOD_HIDDEN, 100, 4.5, q, 120)).toBe(LOD_FAR);
  });

  it('hystérésis : pas de battement autour du seuil', () => {
    const d = q.near * (1 + LOD_HYSTERESIS * 0.5);
    expect(chooseLod(LOD_NEAR, d, 4.5, q, 900)).toBe(LOD_NEAR);   // déjà détaillé : il le reste
    expect(chooseLod(LOD_FAR, d, 4.5, q, 900)).toBe(LOD_FAR);     // déjà simplifié : il le reste
    expect(chooseLod(LOD_NEAR, q.near * (1 + LOD_HYSTERESIS) * 1.01, 4.5, q, 900)).toBe(LOD_FAR);
    const h = q.far * (1 + LOD_HYSTERESIS * 0.5);
    expect(chooseLod(LOD_FAR, h, 4.5, q, 900)).toBe(LOD_FAR);
    expect(chooseLod(LOD_HIDDEN, h, 4.5, q, 900)).toBe(LOD_HIDDEN);
    // aller-retour : une seule bascule à l'aller, une seule au retour
    let lod = chooseLod(LOD_HIDDEN, 10, 4.5, q, 900), switches = 0;
    for (let dist = 10; dist <= q.near * 1.5; dist += 0.25) { const n = chooseLod(lod, dist, 4.5, q, 900); if (n !== lod) switches++; lod = n; }
    for (let dist = q.near * 1.5; dist >= 10; dist -= 0.25) { const n = chooseLod(lod, dist, 4.5, q, 900); if (n !== lod) switches++; lod = n; }
    expect(switches).toBe(2);
  });

  it('un gros véhicule garde son détail plus loin qu\'une citadine', () => {
    expect(lodSizeFactor(12)).toBeGreaterThan(lodSizeFactor(3.7));
    const d = q.near * 1.6;
    expect(chooseLod(LOD_HIDDEN, d, 12, q, 900)).toBe(LOD_NEAR);
    expect(chooseLod(LOD_HIDDEN, d, 3.7, q, 900)).toBe(LOD_FAR);
    expect(lodSizeFactor(0.35)).toBe(0.6);
    expect(lodSizeFactor(40)).toBe(2.6);
  });

  it('la qualité basse simplifie plus tôt que la qualité ultra', () => {
    expect(VEHICLE_QUALITY.bas.near).toBeLessThan(VEHICLE_QUALITY.moyen.near);
    expect(VEHICLE_QUALITY.moyen.near).toBeLessThan(VEHICLE_QUALITY.haut.near);
    expect(VEHICLE_QUALITY.haut.near).toBeLessThan(VEHICLE_QUALITY.ultra.near);
    expect(chooseLod(LOD_HIDDEN, 30, 4.5, VEHICLE_QUALITY.bas, 900)).toBe(LOD_FAR);
    expect(chooseLod(LOD_HIDDEN, 30, 4.5, VEHICLE_QUALITY.ultra, 900)).toBe(LOD_NEAR);
  });

  it('budget de modèles détaillés : la distance se resserre au-dessus du budget et se relâche en dessous', () => {
    let s = 1;
    for (let i = 0; i < 10; i++) s = adaptNearScale(s, 60, 28);
    expect(s).toBeLessThan(0.6);
    expect(chooseLod(LOD_HIDDEN, q.near * 0.8, 4.5, q, 900, s)).toBe(LOD_FAR);
    for (let i = 0; i < 200; i++) s = adaptNearScale(s, 3, 28);
    expect(s).toBe(1);
    for (let i = 0; i < 500; i++) s = adaptNearScale(s, 500, 28);
    expect(s).toBeCloseTo(0.35);
    // zone morte : entre 70 % et 100 % du budget, rien ne bouge
    expect(adaptNearScale(0.8, 24, 28)).toBe(0.8);
  });
});

describe('tableau de bord', () => {
  it('vitesse en km/h, graduation adaptée au véhicule', () => {
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(-5)).toBe(18);
    expect(speedoMax(110 / 3.6)).toBe(140);
    expect(speedoMax(30 / 3.6)).toBe(60);
    expect(speedoMax(400 / 3.6)).toBe(260);
  });

  it('compte-tours : accepte un régime normalisé, des tr/min, ou l\'estime d\'après la vitesse', () => {
    expect(rpmFraction(0, 0, 30, false)).toBe(0);
    expect(rpmFraction(0, 0, 30, true)).toBeCloseTo(0.14);          // ralenti
    expect(rpmFraction(3000, 10, 30, true)).toBeCloseTo(0.5);
    expect(rpmFraction(9000, 10, 30, true)).toBe(1);
    expect(rpmFraction(1, 10, 30, true)).toBeCloseTo(1);
    expect(rpmFraction(0.5, 10, 30, true)).toBeCloseTo(0.57);
    const slow = rpmFraction(0, 2, 30, true), fast = rpmFraction(0, 7, 30, true);
    expect(fast).toBeGreaterThan(slow);
    for (let v = 0; v <= 40; v += 0.5) {
      const f = rpmFraction(0, v, 30, true);
      expect(f).toBeGreaterThanOrEqual(0.14);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('aiguille : 270° de course, bornée', () => {
    expect(needleAngle(0)).toBeCloseTo((-225 * Math.PI) / 180);
    expect(needleAngle(1)).toBeCloseTo((45 * Math.PI) / 180);
    expect(needleAngle(0.5)).toBeCloseTo((-90 * Math.PI) / 180);   // à mi-course, l'aiguille pointe vers le haut
    expect(needleAngle(7)).toBe(needleAngle(1));
    expect(needleAngle(-1)).toBe(needleAngle(0));
  });

  it('rapport affiché', () => {
    expect(gearLabel(0, 0, false)).toBe('N');
    expect(gearLabel(-1, -2, true)).toBe('R');
    expect(gearLabel(0, -2, true)).toBe('R');
    expect(gearLabel(0, 0, true)).toBe('N');
    expect(gearLabel(0, 8, true)).toBe('D');
    expect(gearLabel(3, 12, true)).toBe('3');
  });

  it('signature : identique si l\'affichage est identique, différente au moindre changement visible', () => {
    const f = { headlights: false, beacons: true, siren: false, handbrake: false, left: false, right: false, engineWarning: false, engineOn: true };
    const a = dashSignature(47, 0.5, 'D', f, false);
    expect(dashSignature(47, 0.501, 'D', { ...f }, false)).toBe(a);
    expect(dashSignature(48, 0.5, 'D', f, false)).not.toBe(a);
    expect(dashSignature(47, 0.56, 'D', f, false)).not.toBe(a);
    expect(dashSignature(47, 0.5, 'R', f, false)).not.toBe(a);
    expect(dashSignature(47, 0.5, 'D', f, true)).not.toBe(a);
    for (const k of Object.keys(f) as (keyof typeof f)[]) {
      expect(dashSignature(47, 0.5, 'D', { ...f, [k]: !f[k] }, false), k).not.toBe(a);
    }
  });
});
