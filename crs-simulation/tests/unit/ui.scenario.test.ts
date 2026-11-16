// Page d'accueil — construction du SessionConfig, assainissement du brouillon, aller-retour avec une configuration.
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { sanitizeSessionConfig } from '@/core/session';
import type { ScenarioExtra } from '@/ui/core/api';
import { DEFAULT_PLACES, FAMILY_IDS, ROLES, roleInfo } from '@/ui/screens/catalog';
import {
  buildSessionConfig, compositionShares, dayPhase, defaultDraft, draftFromConfig, forceRatio, identityLabel, meansSummary,
  sanitizeDraft, simulatedCrowd, suggestName, summarize, tensionLabel, volatilityLabel, windLabel,
} from '@/ui/screens/scenario';

const extraOf = (c: SessionConfig): ScenarioExtra => c.extra as unknown as ScenarioExtra;

describe('ui/scénario — buildSessionConfig', () => {
  it('remplit tous les champs de SessionConfig à partir du brouillon par défaut', () => {
    const d = defaultDraft();
    const c = buildSessionConfig(d);
    expect(c.mode).toBe('libre');
    expect(c.missionId).toBe('');
    expect(c.role).toBe('crs');
    expect(c.rank).toBe('gardien');
    expect(c.place).toBe(DEFAULT_PLACES[0]!.name);
    expect(c.x).toBe(DEFAULT_PLACES[0]!.x);
    expect(c.z).toBe(DEFAULT_PLACES[0]!.z);
    expect(c.timeOfDay).toBe(14.5);
    expect(c.weather).toBe('nuageux');
    expect(c.crowdSize).toBe(600);
    expect(c.tension).toBe(0.25);
    expect(c.volatility).toBe(0.35);
    expect(c.duration).toBe('standard');
    expect(c.seed).toBeGreaterThan(0);
  });

  it('range dans extra tout ce qui n’est pas un champ de SessionConfig, sous des clés documentées', () => {
    const d = defaultDraft();
    d.options.circulation = 'coupee';
    d.moyens.centaure = 1;
    const e = extraOf(buildSessionConfig(d));
    expect(e.scenario).toBe(1);
    expect(e.poste).toBe('bouclier');
    expect(e.cause).toBe('retraites');
    expect(e.causeLabel).toBe('Retraites');
    expect(e.vent).toEqual({ direction: 270, vitesse: 10 });
    expect(e.derapage).toBe('hasard');
    expect(e.moyens).toEqual({ sections: 4, fourgons: 12, centaure: 1, canon_eau: 1, bravm: 1, drone: 1, pompiers: 1, samu: 1, secours_sur_appel: true });
    expect(e.options).toEqual({ sanctions: true, violence: 'realiste', circulation: 'coupee', metro: 'ouvert', journee: true });
    expect(e.journee).toBe(true);
    expect(Object.keys(e.composition).sort()).toEqual([...FAMILY_IDS].sort());
  });

  it('produit une configuration qui est du JSON pur et que le cœur n’a pas à corriger', () => {
    const c = buildSessionConfig(defaultDraft());
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    expect(sanitizeSessionConfig({ ...c })).toEqual([]);
  });

  it('n’envoie pas de coordonnées quand le lieu n’en a pas', () => {
    const d = defaultDraft();
    d.place = 'Place inconnue';
    d.x = null;
    d.z = null;
    const c = buildSessionConfig(d);
    expect('x' in c).toBe(false);
    expect('z' in c).toBe(false);
  });

  it('un rôle civil n’a ni grade ni poste ; sa variante est dans extra', () => {
    const d = sanitizeDraft({ ...defaultDraft(), role: 'manifestant', rank: 'commandant', poste: 'lbd', variante: 'radical' });
    const c = buildSessionConfig(d);
    expect(c.rank).toBeNull();
    expect(extraOf(c).poste).toBeNull();
    expect(extraOf(c).variante).toBe('radical');
  });

  it('le mode libre permet de démarrer directement commandant ou commissaire', () => {
    for (const role of ['commandant', 'commissaire'] as const) {
      const info = roleInfo(role);
      const c = buildSessionConfig(sanitizeDraft({ ...defaultDraft(), role, rank: info.defaultRank, poste: info.defaultPoste }));
      expect(c.rank).toBe(role);
    }
  });
});

describe('ui/scénario — composition de la foule', () => {
  it('les parts font toujours 1 et le black bloc est une part absolue', () => {
    const d = defaultDraft();
    d.composition = { familles: 20, gilets_jaunes: 0, syndical: 60, etudiants: 20, climat: 0, soignants: 0, agriculteurs: 0, retraites: 0, black_bloc: 10 };
    const s = compositionShares(d.composition);
    expect(s.black_bloc).toBeCloseTo(0.1, 6);
    expect(s.syndical).toBeCloseTo(0.54, 6);
    expect(s.familles).toBeCloseTo(0.18, 6);
    let sum = 0;
    for (const id of FAMILY_IDS) sum += s[id];
    expect(sum).toBeCloseTo(1, 9);
  });

  it('une foule sans aucune famille reçoit un cortège syndical par défaut', () => {
    const d = sanitizeDraft({ ...defaultDraft(), composition: { familles: 0, gilets_jaunes: 0, syndical: 0, etudiants: 0, climat: 0, soignants: 0, agriculteurs: 0, retraites: 0, black_bloc: 5 } });
    expect(d.composition.syndical).toBeGreaterThan(0);
    const s = compositionShares(d.composition);
    expect(s.syndical).toBeCloseTo(0.95, 6);
  });

  it('borne le black bloc à 25 %', () => {
    const d = sanitizeDraft({ ...defaultDraft(), composition: { ...defaultDraft().composition, black_bloc: 80 } });
    expect(d.composition.black_bloc).toBe(25);
  });

  it('les parts restent de somme 1 pour des poids quelconques', () => {
    for (let k = 0; k < 200; k++) {
      const c = defaultDraft().composition;
      for (const id of FAMILY_IDS) c[id] = (k * 37 + id.length * 13 + id.charCodeAt(0)) % (id === 'black_bloc' ? 26 : 101);
      const s = compositionShares(sanitizeDraft({ ...defaultDraft(), composition: c }).composition);
      let sum = 0;
      for (const id of FAMILY_IDS) {
        expect(s[id]).toBeGreaterThanOrEqual(0);
        sum += s[id];
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('ui/scénario — assainissement', () => {
  it('rétablit la cohérence rôle / grade / poste / variante pour les douze rôles', () => {
    for (const r of ROLES) {
      const d = sanitizeDraft({ ...defaultDraft(), role: r.id, rank: 'gardien_stagiaire', poste: 'autorite_civile', variante: 'x' });
      if (r.ranks.length === 0) expect(d.rank).toBeNull();
      else expect(r.ranks).toContain(d.rank);
      if (r.postes.length === 0) expect(d.poste).toBeNull();
      else expect(r.postes).toContain(d.poste);
      if (r.variantes.length === 0) expect(d.variante).toBe('');
      else expect(r.variantes.map((v) => v.id)).toContain(d.variante);
    }
  });

  it('borne les valeurs numériques et remplace les valeurs inconnues', () => {
    const d = sanitizeDraft({
      ...defaultDraft(), crowdSize: 999999, tension: 4, volatility: -2, timeOfDay: 31.3, windSpeed: 500, windDir: 100, seed: -42.7,
      weather: 'neige' as never, duration: 'infinie' as never, mode: 'test' as never, derapage: 'x' as never,
    });
    expect(d.crowdSize).toBe(5000);
    expect(d.tension).toBe(1);
    expect(d.volatility).toBe(0);
    expect(d.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(d.timeOfDay).toBeLessThan(24);
    expect(d.windSpeed).toBe(70);
    expect(d.windDir % 45).toBe(0);
    expect(d.seed).toBe(42);
    expect(d.weather).toBe('clair');
    expect(d.duration).toBe('standard');
    expect(d.mode).toBe('libre');
    expect(d.derapage).toBe('hasard');
    const low = sanitizeDraft({ ...defaultDraft(), crowdSize: 3, moyens: { ...defaultDraft().moyens, drone: 9, sections: -4 } });
    expect(low.crowdSize).toBe(50);
    expect(low.moyens.drone).toBe(2);
    expect(low.moyens.sections).toBe(0);
  });

  it('ne lève rien sur des valeurs absentes ou absurdes', () => {
    expect(() => sanitizeDraft(null)).not.toThrow();
    expect(() => sanitizeDraft({ composition: 3 as never, moyens: 'x' as never, options: null as never })).not.toThrow();
    expect(() => draftFromConfig(null)).not.toThrow();
    expect(() => draftFromConfig({ extra: { composition: 'non', vent: 4, moyens: [] } } as never)).not.toThrow();
  });
});

describe('ui/scénario — relecture d’une configuration', () => {
  it('brouillon → configuration → brouillon → configuration est stable', () => {
    const d = sanitizeDraft({
      ...defaultDraft(), role: 'bravm', rank: 'brigadier_chef', poste: 'pilote_moto', timeOfDay: 21.75, weather: 'averse', windDir: 45, windSpeed: 35,
      crowdSize: 1800, cause: 'climat', causeLabel: 'Climat', tension: 0.7, volatility: 0.85, derapage: 'les_deux', duration: 'longue', seed: 123456,
      composition: { familles: 5, gilets_jaunes: 45, syndical: 10, etudiants: 30, climat: 10, soignants: 0, agriculteurs: 0, retraites: 0, black_bloc: 12 },
      moyens: { sections: 6, fourgons: 18, centaure: 1, canon_eau: 2, bravm: 2, drone: 2, pompiers: 2, samu: 1, secours_sur_appel: false },
      options: { sanctions: false, violence: 'sobre', circulation: 'coupee', metro: 'ferme', journee: false },
    });
    const c1 = buildSessionConfig(d);
    const c2 = buildSessionConfig(draftFromConfig(c1));
    expect(c2).toEqual(c1);
  });

  it('une configuration étrangère (session d’essai du cœur) donne un brouillon valide', () => {
    const d = draftFromConfig({ mode: 'test', missionId: '', role: 'crs', rank: 'gardien', place: '', timeOfDay: 14, weather: 'clair', crowdSize: 0, tension: 0, volatility: 0, duration: 'standard', seed: 1 });
    expect(d.mode).toBe('libre');
    expect(d.crowdSize).toBe(50);
    expect(d.place).not.toBe('');
  });

  it('un préréglage de mission qui change de lieu ne garde pas les anciennes coordonnées', () => {
    const base = defaultDraft();
    const d = draftFromConfig({ ...buildSessionConfig(base), place: 'Place de la Concorde', x: undefined, z: undefined }, base);
    expect(d.place).toBe('Place de la Concorde');
    expect(d.x).toBeNull();
    expect(d.z).toBeNull();
  });
});

describe('ui/scénario — libellés', () => {
  it('résumé en français avec lieu, heure, foule, cause et rôle', () => {
    const text = summarize(defaultDraft());
    expect(text).toContain('Place de la République');
    expect(text).toContain('14 h 30');
    expect(text).toContain('600 manifestants');
    expect(text).toContain('retraites');
    expect(text).toContain('cortège syndical en tête');
    expect(text).toContain('gardien de la paix, porte-bouclier');
    expect(text).not.toMatch(/undefined|NaN|null/);
  });

  it('résumé du monde ouvert sans manifestation', () => {
    const text = summarize(sanitizeDraft({ ...defaultDraft(), mode: 'monde_ouvert' }));
    expect(text).toContain('Patrouille libre');
    expect(text).not.toContain('manifestants');
  });

  it('identité selon le rôle', () => {
    expect(identityLabel({ role: 'commissaire', rank: 'commissaire', poste: 'autorite_civile', variante: '' })).toBe('Commissaire, autorité civile');
    expect(identityLabel({ role: 'gendarme_centaure', rank: 'gardien', poste: 'conducteur', variante: '' })).toBe('Gendarme, conducteur');
    expect(identityLabel({ role: 'secouriste', rank: null, poste: null, variante: 'samu' })).toBe('SAMU');
    expect(identityLabel({ role: 'manifestant', rank: null, poste: null, variante: 'service_ordre' })).toBe('Manifestant, service d’ordre');
    expect(identityLabel({ role: 'journaliste', rank: null, poste: null, variante: '' })).toBe('Journaliste');
  });

  it('niveaux de tension, vent, moyens, rapport de forces, effectif simulé', () => {
    expect(tensionLabel(0)).toBe('calme');
    expect(tensionLabel(0.5)).toBe('tendue');
    expect(tensionLabel(1)).toBe('explosive');
    expect(volatilityLabel(0.8)).toBe('très élevée');
    expect(windLabel(270, 10)).toBe('vent d’ouest, 10 km/h');
    expect(windLabel(0, 20)).toBe('vent de nord, 20 km/h');
    expect(windLabel(90, 0)).toBe('vent nul');
    expect(meansSummary(defaultDraft().moyens)).toBe('4 sections · 12 fourgons · canon à eau · BRAV-M · drone · secours sur appel');
    expect(meansSummary({ sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true })).toBe('aucun moyen engagé');
    expect(forceRatio(defaultDraft())).toEqual({ agents: 76, per100: (76 / 600) * 100 });
    expect(simulatedCrowd(1000, 0.75)).toBe(750);
    expect(simulatedCrowd(600, NaN)).toBe(600);
    expect(suggestName(defaultDraft())).toBe('République — 600 manifestants — 14 h 30');
  });

  it('moment de la journée pour l’aperçu de l’heure', () => {
    expect(dayPhase(14)).toBe('jour');
    expect(dayPhase(19.5)).toBe('crepuscule');
    expect(dayPhase(7)).toBe('crepuscule');
    expect(dayPhase(23)).toBe('nuit');
    expect(dayPhase(3)).toBe('nuit');
  });
});
