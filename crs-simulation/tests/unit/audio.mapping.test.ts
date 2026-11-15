import { describe, expect, it } from 'vitest';
import {
  collisionSound, explosionSound, footstepSound, hurtSound, impactSound, sirenSound, strideLength,
  voicePitchFor, windowSound, type SoundChoice,
} from '@/audio/mapping';
import { soundDef } from '@/audio/catalog';
import { engineProfileFor, resolveRpm } from '@/audio/engineGraph';

const c = (): SoundChoice => ({ id: '', volume: 1, pitch: 1 });

describe('correspondances événement → son', () => {
  it('explosions selon ce qui explose', () => {
    expect(explosionSound('vehicule', 12, c()).id).toBe('explosion_vehicule');
    expect(explosionSound('gm2l', 8, c()).id).toBe('detonation');
    expect(explosionSound('desencerclement', 10, c()).id).toBe('desencerclement');
    expect(explosionSound('mortier', 6, c()).id).toBe('mortier_explosion');
    expect(explosionSound('molotov', 3, c()).id).toBe('molotov');
    expect(explosionSound('grenade_lacrymo_56', 1, c()).id).toBe('grenade_pop');
    expect(explosionSound('palet_lacrymo', 1, c()).id).toBe('grenade_pop');
  });

  it('explosion de type inconnu : pétard si petite, détonation sinon', () => {
    expect(explosionSound('truc_inconnu', 1.5, c()).id).toBe('petard');
    const big = explosionSound('truc_inconnu', 9, c());
    expect(big.id).toBe('detonation');
    expect(big.volume).toBeGreaterThan(0.5);
    expect(big.volume).toBeLessThanOrEqual(1);
  });

  it('impact : le bouclier levé change le son', () => {
    expect(impactSound('pave', 'person', true, c())!.id).toBe('impact_bouclier');
    expect(impactSound('pave', 'person', false, c())!.id).toBe('coup_baton');
    expect(impactSound('pave', 'ground', true, c())!.id).toBe('impact_sol');
    expect(impactSound('lbd', 'person', true, c())!.id).toBe('impact_bouclier');
  });

  it('impact : selon le projectile et ce qui est touché', () => {
    expect(impactSound('pave', 'vehicle', false, c())!.id).toBe('tole');
    expect(impactSound('pave', 'building', false, c())!.id).toBe('impact_sol');
    expect(impactSound('bouteille', 'ground', false, c())!.id).toBe('verre_brise');
    expect(impactSound('molotov', 'ground', false, c())!.id).toBe('molotov');
    expect(impactSound('grenade_lacrymo_main', 'ground', false, c())!.id).toBe('impact_sol');
    expect(impactSound('balle', 'vehicle', false, c())!.id).toBe('tole');
  });

  it('impact muet quand l’explosion qui suit fait le bruit', () => {
    expect(impactSound('mortier', 'ground', false, c())).toBeNull();
    expect(impactSound('fusee_rouge', 'ground', false, c())).toBeNull();
  });

  it('chaque service a sa sirène', () => {
    expect(sirenSound('voiture_police', 'police', 1)).toBe('sirene_police');
    expect(sirenSound('fourgon_crs', 'police', 1)).toBe('sirene_police');
    expect(sirenSound('camion_pompiers', 'rescue', 1)).toBe('sirene_pompiers');
    expect(sirenSound('ambulance', 'medic', 1)).toBe('sirene_samu');
    expect(sirenSound('centaure', 'police', 1)).toBe('sirene_gendarmerie');
    expect(sirenSound('voiture', 'rescue', 1)).toBe('sirene_pompiers');
    expect(sirenSound('voiture_police', 'police', 2)).toBe('sirene_hurleur');
    expect(sirenSound('voiture_police', 'police', 0)).toBeNull();
  });

  it('pas selon la surface et l’humidité', () => {
    expect(footstepSound('road', 0)).toBe('pas');
    expect(footstepSound('sidewalk', 0)).toBe('pas');
    expect(footstepSound('sett', 0)).toBe('pas_pave');
    expect(footstepSound('gravel', 0)).toBe('pas_gravier');
    expect(footstepSound('park', 1)).toBe('pas_herbe');
    expect(footstepSound('water', 0)).toBe('pas_eau');
    expect(footstepSound('road', 0.9)).toBe('pas_eau');
    expect(footstepSound('sett', 0.9)).toBe('pas_eau');
  });

  it('la foulée s’allonge avec la vitesse, dans des bornes humaines', () => {
    expect(strideLength(1.4)).toBeCloseTo(0.816, 3);
    expect(strideLength(4)).toBeGreaterThan(strideLength(1.4));
    expect(strideLength(0)).toBe(0.65);
    expect(strideLength(30)).toBe(1.6);
  });

  it('réaction d’une personne blessée', () => {
    expect(hurtSound('gas', 0.5, c())!.id).toBe('toux');
    expect(hurtSound('blunt', 20, c())!.id).toBe('cri');
    expect(hurtSound('blunt', 1, c())).toBeNull();
    expect(hurtSound('water', 50, c())).toBeNull();
    expect(hurtSound('blunt', 500, c())!.volume).toBeLessThanOrEqual(1);
  });

  it('collision : rien en dessous d’un frôlement, plus fort avec la vitesse', () => {
    expect(collisionSound(0.3, 'world', c())).toBeNull();
    const slow = { ...collisionSound(3, 'vehicle', c())! };
    const fast = { ...collisionSound(15, 'vehicle', c())! };
    expect(slow.id).toBe('collision');
    expect(fast.volume).toBeGreaterThan(slow.volume);
    expect(collisionSound(5, 'person', c())!.id).toBe('coup_baton');
    expect(collisionSound(2, 'prop', c())!.id).toBe('tole');
    expect(collisionSound(-12, 'world', c())!.id).toBe('collision');
  });

  it('vitrines', () => {
    expect(windowSound('broken', c())!.id).toBe('verre_brise');
    expect(windowSound('cracked', c())!.id).toBe('verre_brise');
    expect(windowSound('cracked', c())!.volume).toBeLessThan(1);
    expect(windowSound('tagged', c())!.id).toBe('spray');
    expect(windowSound('intact', c())).toBeNull();
    expect(windowSound('boarded', c())).toBeNull();
  });

  it('tous les sons choisis existent au catalogue', () => {
    const ids = new Set<string>();
    for (const k of ['vehicule', 'gm2l', 'desencerclement', 'mortier', 'molotov', 'palet_lacrymo', 'fusee_rouge', 'x'] as const) {
      ids.add(explosionSound(k, 1, c()).id);
      ids.add(explosionSound(k, 9, c()).id);
    }
    for (const k of ['pave', 'bouteille', 'molotov', 'gm2l', 'lbd', 'balle', 'oeuf_peinture', 'x'] as const) {
      for (const h of ['ground', 'person', 'vehicle', 'building'] as const) {
        for (const s of [true, false]) {
          const r = impactSound(k, h, s, c());
          if (r) ids.add(r.id);
        }
      }
    }
    for (const s of ['road', 'sett', 'gravel', 'park', 'water'] as const) ids.add(footstepSound(s, 0)), ids.add(footstepSound(s, 1));
    for (const id of ids) expect(soundDef(id), id).toBeDefined();
  });

  it('hauteur de voix stable par personne, répartie entre voix graves et aiguës', () => {
    expect(voicePitchFor(42)).toBe(voicePitchFor(42));
    let low = 0;
    for (let id = 1; id <= 400; id++) {
      const p = voicePitchFor(id);
      expect(p).toBeGreaterThanOrEqual(0.78);
      expect(p).toBeLessThanOrEqual(1.5);
      if (p < 1.1) low++;
    }
    expect(low).toBeGreaterThan(180);
    expect(low).toBeLessThan(300);
  });
});

describe('profils de moteur', () => {
  it('timbre selon le type de véhicule', () => {
    expect(engineProfileFor('moto_bravm').cylinders).toBe(2);
    expect(engineProfileFor('fourgon_crs').clatter).toBeGreaterThan(0);
    expect(engineProfileFor('centaure').redline).toBeLessThan(engineProfileFor('voiture').redline);
    expect(engineProfileFor('drone').type).toBe('electrique');
    expect(engineProfileFor('helicoptere').type).toBe('rotor');
    expect(engineProfileFor('vehicule_inconnu').type).toBe('thermique');
  });

  it('régime : tr/min réels ou valeur normalisée 0..1', () => {
    const p = engineProfileFor('voiture');
    expect(resolveRpm(0, p)).toBe(p.idle);
    expect(resolveRpm(1, p)).toBe(p.redline);
    expect(resolveRpm(0.5, p)).toBeCloseTo((p.idle + p.redline) / 2, 6);
    expect(resolveRpm(3000, p)).toBe(3000);
    expect(resolveRpm(99999, p)).toBeCloseTo(p.redline * 1.1, 6);
    expect(resolveRpm(Number.NaN, p)).toBe(p.idle);
    expect(resolveRpm(-5, p)).toBe(p.idle);
  });
});
