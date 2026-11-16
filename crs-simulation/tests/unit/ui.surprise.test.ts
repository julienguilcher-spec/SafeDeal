// Page d'accueil — « Surprends-moi » : tirage aléatoire cohérent et reproductible.
import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { CROWD_STOPS, DEFAULT_CAUSES, DEFAULT_PLACES, FAMILY_IDS, MEANS_LIMITS, roleInfo } from '@/ui/screens/catalog';
import { buildSessionConfig, compositionShares, dayPhase, forceRatio, sanitizeDraft, surpriseDraft } from '@/ui/screens/scenario';

describe('ui/scénario — « Surprends-moi »', () => {
  it('même graine, même scénario ; graines différentes, scénarios différents', () => {
    const a = surpriseDraft(createRng(42));
    const b = surpriseDraft(createRng(42));
    expect(b).toEqual(a);
    const seen = new Set<string>();
    for (let s = 1; s <= 40; s++) seen.add(JSON.stringify(surpriseDraft(createRng(s))));
    expect(seen.size).toBeGreaterThan(35);
  });

  it('tous les tirages sont cohérents (500 graines)', () => {
    const roles = new Set<string>();
    const weathers = new Set<string>();
    let night = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const d = surpriseDraft(createRng(seed));
      roles.add(d.role);
      weathers.add(d.weather);
      const info = roleInfo(d.role);

      // rôle, grade, poste, variante accordés
      if (info.ranks.length) expect(info.ranks).toContain(d.rank);
      else expect(d.rank).toBeNull();
      if (info.postes.length) expect(info.postes).toContain(d.poste);
      else expect(d.poste).toBeNull();
      if (info.variantes.length) expect(info.variantes.map((v) => v.id)).toContain(d.variante);
      else expect(d.variante).toBe('');

      // lieu connu, avec ses coordonnées
      const place = DEFAULT_PLACES.find((p) => p.name === d.place);
      expect(place).toBeDefined();
      expect(d.x).toBe(place!.x);
      expect(d.z).toBe(place!.z);

      // foule : valeur du curseur, cause connue, composition de somme 1 avec une famille dominante
      expect(CROWD_STOPS).toContain(d.crowdSize);
      expect(DEFAULT_CAUSES.map((c) => c.id)).toContain(d.cause);
      expect(d.causeLabel).not.toBe('');
      const shares = compositionShares(d.composition);
      let sum = 0;
      let top = 0;
      for (const id of FAMILY_IDS) {
        sum += shares[id];
        if (id !== 'black_bloc') top = Math.max(top, shares[id]);
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
      expect(top).toBeGreaterThan(0.3);
      expect(shares.black_bloc).toBeLessThanOrEqual(0.15 + 1e-9);

      // une marche calme n'a pas de black bloc massif ; une foule tendue en a un
      if (d.tension < 0.25) expect(d.composition.black_bloc).toBeLessThanOrEqual(2);
      if (d.tension >= 0.4) expect(d.composition.black_bloc).toBeGreaterThanOrEqual(3);
      expect(d.tension).toBeGreaterThanOrEqual(0);
      expect(d.tension).toBeLessThanOrEqual(1);
      expect(d.volatility).toBeGreaterThanOrEqual(0);
      expect(d.volatility).toBeLessThanOrEqual(1);

      // moyens : jamais moins de deux sections, dans les bornes, proportionnés à la foule
      expect(d.moyens.sections).toBeGreaterThanOrEqual(2);
      for (const key of Object.keys(MEANS_LIMITS) as (keyof typeof MEANS_LIMITS)[]) {
        expect(d.moyens[key]).toBeGreaterThanOrEqual(MEANS_LIMITS[key][0]);
        expect(d.moyens[key]).toBeLessThanOrEqual(MEANS_LIMITS[key][1]);
      }
      expect(d.moyens.fourgons).toBe(Math.min(24, d.moyens.sections * 3));
      if (d.moyens.sections > 2 && d.moyens.sections < 8) {
        const r = forceRatio(d).per100;
        expect(r).toBeGreaterThan(1.5);
        expect(r).toBeLessThan(14);
      }
      // le blindé reste une décision rare, réservée aux situations tendues (sauf si on l'incarne)
      if (d.moyens.centaure > 0 && d.role !== 'gendarme_centaure') expect(d.tension).toBeGreaterThan(0.6);

      // le moyen du rôle incarné est engagé
      if (d.role === 'gendarme_centaure') expect(d.moyens.centaure).toBeGreaterThanOrEqual(1);
      if (d.role === 'operateur_canon_eau') expect(d.moyens.canon_eau).toBeGreaterThanOrEqual(1);
      if (d.role === 'bravm') expect(d.moyens.bravm).toBeGreaterThanOrEqual(1);
      if (d.role === 'secouriste') expect(d.variante === 'samu' ? d.moyens.samu : d.moyens.pompiers).toBeGreaterThanOrEqual(1);
      if (d.role === 'telepilote') {
        expect(d.moyens.drone).toBeGreaterThanOrEqual(1);
        // l'arrêté n'autorise le vol que de jour
        expect(d.timeOfDay).toBeGreaterThanOrEqual(7);
        expect(d.timeOfDay).toBeLessThanOrEqual(20);
      }
      if (dayPhase(d.timeOfDay) === 'nuit') {
        night++;
        if (d.role !== 'telepilote') expect(d.moyens.drone).toBe(0);
      }

      // météo et vent accordés
      expect(d.windDir % 45).toBe(0);
      if (d.weather === 'orage') expect(d.windSpeed).toBeGreaterThanOrEqual(30);
      if (d.weather === 'brouillard') expect(d.windSpeed).toBeLessThanOrEqual(8);

      // toujours en mode libre, sans mission, et déjà assaini
      expect(d.mode).toBe('libre');
      expect(d.missionId).toBe('');
      expect(sanitizeDraft(d, d)).toEqual(d);
      expect(() => buildSessionConfig(d)).not.toThrow();
    }
    // la variété est réelle : tous les rôles sortent, plusieurs météos, des scénarios de nuit
    expect(roles.size).toBe(12);
    expect(weathers.size).toBeGreaterThanOrEqual(6);
    expect(night).toBeGreaterThan(10);
  });

  it('tire parmi les lieux et les causes fournis', () => {
    const places = [{ name: 'Place Vendôme', x: 601, z: -204 }];
    const causes = [{ id: 'horizon', label: 'Projet Horizon' }];
    for (let seed = 1; seed <= 20; seed++) {
      const d = surpriseDraft(createRng(seed), { places, causes, violence: 'sobre' });
      expect(d.place).toBe('Place Vendôme');
      expect(d.x).toBe(601);
      expect(d.cause).toBe('horizon');
      expect(d.causeLabel).toBe('Projet Horizon');
      expect(d.options.violence).toBe('sobre');
    }
  });
});
