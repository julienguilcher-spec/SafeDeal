// HUD — logique pure : éléments affichés selon le rôle et la situation, cadre légal, boussole, projection des marqueurs.
import { describe, expect, it } from 'vitest';
import type { CameraMode, PlayableRole, RoeState, SeatRole, VehicleDef } from '@/core/contracts';
import { touchScale } from '@/ui/hud/layout';
import { clampToFrame, projectPoint } from '@/ui/hud/markers';
import {
  compassMarkerOffset, focalLength, forceLabel, gearLabel, healthTone, hudProfile, injuryLabel, isPoliceRole, itemName, legalReminder,
  legalState, permanentCount, phaseLabel, relativeBearing, showsCount, tensionSegments, tensionTone, turretReadout, wrap180,
} from '@/ui/hud/model';

const ROLES: PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'street_medic', 'secouriste', 'journaliste', 'manifestant',
];
const CAMERAS: CameraMode[] = ['fps', 'tps', 'vehicle_int', 'vehicle_ext', 'turret', 'drone', 'tactical', 'viewfinder', 'free'];
const SEATS: (SeatRole | null)[] = [null, 'driver', 'gunner', 'passenger'];

const roe = (over: Partial<RoeState> = {}): RoeState => ({
  dispersionOrdered: false, sommation: 0, sommationAt: 0, underAttack: false, lawfulForce: 1, authorizedForce: 1, ...over,
});

describe('hud/profil', () => {
  it('jamais plus de six indicateurs permanents, quel que soit le rôle, la caméra ou le siège', () => {
    for (const role of ROLES) for (const camera of CAMERAS) for (const seat of SEATS) for (const person of [true, false]) {
      const p = hudProfile(role, camera, seat, person);
      expect(permanentCount(p), `${role}/${camera}/${seat}`).toBeLessThanOrEqual(6);
    }
  });

  it('à pied : état, objets, boussole, objectifs, situation ; cadre légal complet pour les forces de l’ordre seulement', () => {
    const crs = hudProfile('crs', 'tps', null, true);
    expect(crs).toMatchObject({ status: true, items: true, compass: true, objectives: true, situation: true, legal: 'full', vehicle: false, reticle: 'dot' });
    const civil = hudProfile('manifestant', 'tps', null, true);
    expect(civil.legal).toBe('reminder');
    expect(permanentCount(civil)).toBe(5);
    expect(isPoliceRole('telepilote')).toBe(true);
    expect(isPoliceRole('journaliste')).toBe(false);
  });

  it('en véhicule : tableau de bord à la place de la barre d’objets ; réticule de tourelle pour le tireur', () => {
    const driver = hudProfile('gendarme_centaure', 'vehicle_ext', 'driver', true);
    expect(driver).toMatchObject({ vehicle: true, items: false, reticle: 'none' });
    expect(hudProfile('gendarme_centaure', 'turret', 'gunner', true).reticle).toBe('turret');
    expect(hudProfile('operateur_canon_eau', 'vehicle_int', 'gunner', true).reticle).toBe('turret');
  });

  it('drone, viseur, vue tactique', () => {
    expect(hudProfile('telepilote', 'drone', null, true)).toMatchObject({ drone: true, status: false, items: false, compass: false, reticle: 'none' });
    expect(hudProfile('journaliste', 'viewfinder', null, true)).toMatchObject({ viewfinder: true, items: false, objectives: false, reticle: 'none' });
    expect(hudProfile('commandant', 'tactical', null, true)).toMatchObject({ status: false, items: false, compass: false, reticle: 'none' });
  });

  it('sans personne incarnée : ni état, ni objets, ni réticule', () => {
    expect(hudProfile('crs', 'tps', null, false)).toMatchObject({ status: false, items: false, reticle: 'none' });
  });
});

describe('hud/cadre légal', () => {
  it('suit la séquence des sommations', () => {
    expect(legalState(roe())).toMatchObject({ code: 'cortege', tone: 'neutral', sommation: 0, usable: 1 });
    expect(legalState(roe({ sommation: 1 }))).toMatchObject({ code: 'annonce', label: 'Annonce faite', tone: 'orange' });
    expect(legalState(roe({ sommation: 2 }))).toMatchObject({ code: 'sommation1', label: 'Première sommation' });
    expect(legalState(roe({ sommation: 3 }))).toMatchObject({ code: 'derniere', tone: 'orange' });
    expect(legalState(roe({ sommation: 3, lawfulForce: 3, authorizedForce: 3 }))).toMatchObject({ code: 'force', tone: 'red', usable: 3 });
    expect(legalState(roe({ sommation: 3, lawfulForce: 4, authorizedForce: 4 }))).toMatchObject({ code: 'armes', tone: 'ring' });
  });

  it('la riposte directe prime, et le niveau utilisable est le plus petit du licite et de l’autorisé', () => {
    const s = legalState(roe({ sommation: 1, underAttack: true, lawfulForce: 4, authorizedForce: 2 }));
    expect(s).toMatchObject({ code: 'riposte', tone: 'yellow', lawful: 4, authorized: 2, usable: 2 });
    expect(legalState(roe({ lawfulForce: 1, authorizedForce: 5 })).usable).toBe(1);
  });

  it('libellés de force et rappel du droit pour les civils', () => {
    expect(forceLabel(0)).toBe('Aucune force');
    expect(forceLabel(3)).toBe('Lacrymogène');
    expect(forceLabel(5)).toBe('Arme de service');
    expect(forceLabel(9)).toBe('Arme de service');
    expect(legalReminder(roe())).toBe('');
    expect(legalReminder(roe({ sommation: 2 }))).toContain('Première sommation');
    expect(legalReminder(roe({ sommation: 3 }))).toBe('Dernière sommation entendue : rester est un délit');
  });
});

describe('hud/libellés', () => {
  it('phases, tension, santé, blessures', () => {
    expect(phaseLabel('cortege')).toBe('Cortège');
    expect(phaseLabel('apres_manif')).toBe('Après-manifestation');
    expect(tensionTone(0.1)).toBe('ok');
    expect(tensionTone(0.6)).toBe('hot');
    expect(tensionTone(0.95)).toBe('alert');
    expect(tensionSegments(0)).toBe(1);
    expect(tensionSegments(0.5)).toBe(3);
    expect(tensionSegments(1)).toBe(5);
    expect(tensionSegments(7)).toBe(5);
    expect(healthTone(90)).toBe('ok');
    expect(healthTone(20)).toBe('alert');
    expect(injuryLabel('none')).toBe('');
    expect(injuryLabel('serious')).toBe('Blessure grave');
  });

  it('objets : nom de repli en français, quantité affichée seulement si elle a un sens', () => {
    expect(itemName('lbd40')).toBe('LBD 40');
    expect(itemName('lbd40', 'Lanceur de balles de défense')).toBe('Lanceur de balles de défense');
    expect(itemName('objet_inconnu')).toBe('objet inconnu');
    expect(showsCount('bouclier', 1, 1)).toBe(false);
    expect(showsCount('grenade_lacrymo', 0, 4)).toBe(true);
    expect(showsCount('radio', 1, undefined)).toBe(false);
    expect(showsCount('gazeuse', 5, undefined)).toBe(true);
  });

  it('véhicule : rapport, tourelle, focale', () => {
    expect(gearLabel({ gear: 2, speed: 5, engineOn: true })).toBe('2');
    expect(gearLabel({ gear: 1, speed: -2, engineOn: true })).toBe('R');
    expect(gearLabel({ gear: 0, speed: 0, engineOn: true })).toBe('N');
    expect(gearLabel({ gear: 1, speed: 0, engineOn: false })).toBe('P');
    const def = (turrets: VehicleDef['turrets']): VehicleDef => ({ turrets } as VehicleDef);
    const t = { x: 0, y: 0, z: 0, yawMin: 0, yawMax: 0, pitchMin: 0, pitchMax: 0, interval: 1 };
    expect(turretReadout({ def: def([]), turretAmmo: [] })).toBeNull();
    expect(turretReadout({ def: def([{ ...t, kind: 'camera', capacity: 0 }]), turretAmmo: [0] })).toBeNull();
    expect(turretReadout({ def: def([{ ...t, kind: 'lance_grenades', capacity: 30 }]), turretAmmo: [24] })).toEqual({ kind: 'lance_grenades', label: 'Grenades', value: 24, max: 30, unit: '' });
    expect(turretReadout({ def: def([{ ...t, kind: 'camera', capacity: 0 }, { ...t, kind: 'canon_eau', capacity: 10000 }]), turretAmmo: [0, 6200] })).toMatchObject({ kind: 'canon_eau', value: 6200, unit: 'L' });
    expect(focalLength(1)).toBe(24);
    expect(focalLength(2.9)).toBe(70);
    expect(focalLength(50)).toBe(200);
    expect(focalLength(NaN)).toBe(24);
  });
});

describe('hud/boussole et directions', () => {
  it('gisement par rapport au regard (cap 0 = sud, x = est, z = sud)', () => {
    // regard vers le sud (+z) : l'est (+x) est à GAUCHE, l'ouest à droite
    expect(relativeBearing(0, 0, 10)).toBeCloseTo(0, 6);
    expect(relativeBearing(0, 10, 0)).toBeCloseTo(-90, 6);
    expect(relativeBearing(0, -10, 0)).toBeCloseTo(90, 6);
    expect(Math.abs(relativeBearing(0, 0, -10))).toBeCloseTo(180, 6);
    // regard vers le nord (cap π) : l'est est à droite
    expect(relativeBearing(Math.PI, 10, 0)).toBeCloseTo(90, 6);
    // regard vers l'est (cap π/2) : le sud est à droite
    expect(relativeBearing(Math.PI / 2, 0, 10)).toBeCloseTo(90, 6);
    expect(relativeBearing(1.2, 0, 0)).toBe(0);
  });

  it('wrap180 et repères du ruban bornés aux bords', () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(360)).toBe(0);
    expect(compassMarkerOffset(10, 3, 172)).toEqual({ x: 30, clamped: 0 });
    expect(compassMarkerOffset(120, 3, 172)).toEqual({ x: 172, clamped: 1 });
    expect(compassMarkerOffset(-170, 3, 172)).toEqual({ x: -172, clamped: -1 });
  });

  it('échelle de la surcouche tactile : mêmes bornes que le module d’entrées', () => {
    expect(touchScale(844, 390)).toBe(1);
    expect(touchScale(667, 375)).toBeCloseTo(0.82, 2);
    expect(touchScale(1180, 820)).toBeCloseTo(1180 / 844, 6);
    expect(touchScale(2560, 1440)).toBe(1.45);
  });
});

describe('hud/marqueurs projetés', () => {
  // caméra à l'origine regardant vers −z (repère Three.js), champ vertical de 90°, écran carré : matrices écrites à la main
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const near = 0.1;
  const far = 1000;
  const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0];
  const out = { x: 0, y: 0, front: true };

  it('un point droit devant est au centre ; à droite et en haut, il se décale du bon côté', () => {
    projectPoint(view, proj, 0, 0, -10, 800, 800, out);
    expect(out).toEqual({ x: 400, y: 400, front: true });
    projectPoint(view, proj, 5, 0, -10, 800, 800, out);
    expect(out.x).toBeCloseTo(600, 6);
    projectPoint(view, proj, 0, 5, -10, 800, 800, out);
    expect(out.y).toBeCloseTo(200, 6);
  });

  it('un point derrière la caméra est signalé, et ramené sur le bord du bon côté', () => {
    projectPoint(view, proj, 5, 0, 10, 800, 800, out);
    expect(out.front).toBe(false);
    const edge = clampToFrame(out, 800, 800, { left: 40, right: 40, top: 100, bottom: 120 });
    expect(edge).toBe(true);
    expect(out.x).toBeCloseTo(760, 6); // à droite : il faut tourner vers la droite
    expect(out.y).toBeGreaterThanOrEqual(100);
    expect(out.y).toBeLessThanOrEqual(680);
  });

  it('un point dans le cadre n’est pas déplacé ; hors cadre, il est ramené sur le bord en gardant sa direction', () => {
    const m = { left: 40, right: 60, top: 100, bottom: 120 };
    const p = { x: 300, y: 300, front: true };
    expect(clampToFrame(p, 800, 600, m)).toBe(false);
    expect(p).toEqual({ x: 300, y: 300, front: true });
    const q = { x: 2000, y: 300, front: true };
    expect(clampToFrame(q, 800, 600, m)).toBe(true);
    expect(q.x).toBeCloseTo(740, 6);
    expect(q.y).toBeCloseTo(300, 6);
    const up = { x: 400, y: -900, front: true };
    clampToFrame(up, 800, 600, m);
    expect(up).toMatchObject({ x: 400, y: 100 });
    const corner = { x: -5000, y: 5000, front: true };
    clampToFrame(corner, 800, 600, m);
    expect(corner.x).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(corner.y).toBeLessThanOrEqual(480 + 1e-6);
  });
});
