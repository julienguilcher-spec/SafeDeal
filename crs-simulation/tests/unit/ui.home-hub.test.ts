// Page d'accueil en quatre modes : parties pures du hub, des Missions spéciales (rangement par poste, fiche de
// briefing) et de la vue Patrouille, sur le VRAI catalogue des missions et le vrai modèle de vacation.
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import type { CareerApi } from '@/gameplay/career/api';
import { MISSIONS, missionById } from '@/gameplay/missions/catalog';
import { defaultPatrolSetup, readVacation, vacationSessionConfig } from '@/gameplay/patrols/model';
import { pickNeighbor } from '@/ui/core/focus';
import { hourLabel } from '@/ui/core/format';
import { ROLES } from '@/ui/screens/catalog';
import { careerTileLine, continueLabel, missionsTileLine, normalizeHomeRequest } from '@/ui/screens/home-hub';
import { ECOLE_POSTE, briefingOf, missionLine, missionsByPoste, posteOf, stars } from '@/ui/screens/home-missions';
import { RYTHMES, initialPatrolSetup, patrolRecap } from '@/ui/screens/home-patrol';
import { readMissions } from '@/ui/screens/services';

/** Le catalogue tel que le service 'missions' le publie (même forme que catalogEntry de missions/system.ts). */
const catalog = readMissions({
  catalog: MISSIONS.map((m) => ({
    id: m.id, title: m.title, roles: [m.role, ...m.altRoles], type: m.type, difficulty: m.difficulty, summary: m.pitch, place: m.place, config: {},
  })),
});

describe('Missions spéciales : rangement par poste', () => {
  const groups = missionsByPoste(catalog);

  it('chaque mission du catalogue apparaît une seule fois, dans un seul poste', () => {
    const ids = groups.flatMap((g) => g.missions.map((m) => m.id));
    expect(ids.length).toBe(MISSIONS.length);
    expect(new Set(ids).size).toBe(MISSIONS.length);
    for (const m of MISSIONS) expect(ids).toContain(m.id);
  });

  it('plus de 100 missions sur au moins 10 postes, École en tête, aucun poste « commissaire »', () => {
    expect(catalog.length).toBeGreaterThan(100);
    expect(groups.length).toBeGreaterThanOrEqual(10);
    expect(groups[0]!.id).toBe(ECOLE_POSTE);
    expect(groups[0]!.label).toBe('École de police');
    expect(groups.some((g) => g.id === 'commissaire')).toBe(false);
    for (const g of groups) {
      expect(g.missions.length).toBeGreaterThan(0);
      expect(g.label).not.toMatch(/undefined|_/);
    }
  });

  it('chapitre 0 → École ; sinon le rôle principal de la mission ; commissaire → Commandant', () => {
    for (const like of catalog) {
      const def = missionById(like.id)!;
      const poste = posteOf(like);
      if (def.chapter === 0) expect(poste).toBe(ECOLE_POSTE);
      else expect(poste).toBe(def.role === 'commissaire' ? 'commandant' : def.role);
    }
    // une mission inconnue du catalogue (fournie par un autre module) se range d'après son premier rôle
    expect(posteOf({ id: 'M29', title: 'L’écharpe', roles: ['commissaire'], type: '', difficulty: 2, summary: '', place: '', config: {} })).toBe('commandant');
  });

  it('les postes suivent l’ordre des rôles de l’accueil', () => {
    const order = groups.slice(1).map((g) => ROLES.findIndex((r) => r.id === g.id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('la ligne de la tuile compte les missions depuis le catalogue et cite des postes variés', () => {
    const line = missionsTileLine(groups);
    expect(line.startsWith(`${MISSIONS.length} missions rangées par poste : `)).toBe(true);
    expect(line).toContain('CRS');
    expect(line).toContain('BRAV-M');
    expect(line).toContain('canon à eau');
    expect(line).toContain('journaliste');
    expect(missionsTileLine([])).toMatch(/pas installé/);
  });
});

describe('fiche de briefing', () => {
  it('chaque mission a au moins un objectif principal, les principaux avant les secondaires', () => {
    for (const like of catalog) {
      const b = briefingOf(like);
      expect(b.objectives.filter((o) => !o.secondary).length, like.id).toBeGreaterThanOrEqual(1);
      const firstSecondary = b.objectives.findIndex((o) => o.secondary);
      if (firstSecondary >= 0) expect(b.objectives.slice(firstSecondary).every((o) => o.secondary), like.id).toBe(true);
    }
  });

  it('accroche, lieu, heure, météo, durée, difficulté et rôle tenu, sans valeur vide ni « undefined »', () => {
    for (const like of catalog) {
      const b = briefingOf(like);
      expect(b.pitch.length, like.id).toBeGreaterThan(10);
      const labels = b.facts.map((f) => f.label);
      expect(labels, like.id).toEqual(['Lieu', 'Heure', 'Météo', 'Durée', 'Difficulté', 'Vous êtes']);
      for (const f of b.facts) {
        expect(f.value.trim().length, `${like.id} ${f.label}`).toBeGreaterThan(0);
        expect(f.value, `${like.id} ${f.label}`).not.toMatch(/undefined|NaN|null/);
      }
      expect(missionLine(like)).not.toMatch(/undefined/);
    }
  });

  it('le rôle tenu reprend grade et poste de la mission ; un rôle imposé (carrière) le remplace', () => {
    const def = MISSIONS.find((m) => m.role === 'crs' && m.rank === 'gardien' && m.poste === 'bouclier')!;
    const like = catalog.find((m) => m.id === def.id)!;
    expect(briefingOf(like).facts.find((f) => f.label === 'Vous êtes')!.value).toBe('Gardien de la paix, porte-bouclier');
    expect(briefingOf(like, missionById, 'Brigadier, porte-bouclier').facts.find((f) => f.label === 'Vous êtes')!.value).toBe('Brigadier, porte-bouclier');
  });

  it('une mission hors catalogue (autre module) a une fiche lisible', () => {
    const b = briefingOf({ id: 'M01', title: 'Premier samedi', roles: ['crs'], type: 'Manifestation déclarée', difficulty: 1, summary: 'Tenir sa place.', place: 'Place de la République', config: { timeOfDay: 14 } });
    expect(b.pitch).toBe('Tenir sa place.');
    expect(b.objectives).toEqual([]);
    expect(b.facts.map((f) => f.label)).toEqual(['Lieu', 'Heure', 'Difficulté', 'Vous êtes']);
  });

  it('étoiles de difficulté', () => {
    expect(stars(3)).toBe('★★★☆☆');
    expect(stars(0)).toBe('');
    expect(stars(9)).toBe('★★★★★');
  });
});

describe('données d’ouverture de l’accueil', () => {
  it('par défaut : le hub', () => {
    expect(normalizeHomeRequest(undefined)).toEqual({ view: 'hub', section: null, mode: null, missionId: '' });
    expect(normalizeHomeRequest(null).view).toBe('hub');
    expect(normalizeHomeRequest('libre').view).toBe('hub');
    expect(normalizeHomeRequest([]).view).toBe('hub');
    expect(normalizeHomeRequest({ view: 'inconnue', mode: 'editeur' })).toEqual({ view: 'hub', section: null, mode: null, missionId: '' });
  });

  it('une section sans vue ouvre l’éditeur du Mode libre', () => {
    expect(normalizeHomeRequest({ section: 'foule' })).toEqual({ view: 'libre', section: 'foule', mode: null, missionId: '' });
    expect(normalizeHomeRequest({ section: 'pas-une-section' }).view).toBe('hub');
  });

  it('fiche de carrière : vue briefing, mode carrière, mission', () => {
    expect(normalizeHomeRequest({ view: 'briefing', mode: 'carriere', missionId: 'crs-01' })).toEqual({ view: 'briefing', section: null, mode: 'carriere', missionId: 'crs-01' });
    // une mission seule ouvre sa fiche ; une fiche sans mission ouvre les Missions spéciales
    expect(normalizeHomeRequest({ missionId: 'crs-01' }).view).toBe('briefing');
    expect(normalizeHomeRequest({ view: 'briefing' }).view).toBe('missions');
    // ancienne forme (« Jouer la mission » vers l'onglet Mission) : l'éditeur, la mission choisie
    expect(normalizeHomeRequest({ section: 'mode', mode: 'carriere', missionId: 'crs-01' })).toEqual({ view: 'libre', section: 'mode', mode: 'carriere', missionId: 'crs-01' });
  });

  it('chaque vue nommée est acceptée', () => {
    for (const v of ['hub', 'patrouille', 'missions', 'libre'] as const) expect(normalizeHomeRequest({ view: v }).view).toBe(v);
  });
});

describe('tuiles du hub et « Continuer »', () => {
  it('Carrière : grade et chapitre en cours, ou le parcours complet sans carrière', () => {
    expect(careerTileLine(null)).toBe('De gardien stagiaire à commandant');
    const chapters = [{ index: 0 }, { index: 1 }, { index: 2 }] as unknown as CareerApi['chapters'];
    expect(careerTileLine({ progress: { chapter: 2, rank: 'gardien' } as CareerApi['progress'], chapters })).toBe('Gardien de la paix — chapitre 2');
    expect(careerTileLine({ progress: { chapter: 0, rank: 'gardien_stagiaire' } as CareerApi['progress'], chapters })).toBe('Gardien stagiaire — école de police');
  });

  it('Continuer : la vacation par son indicatif, la mission par son titre, sinon rôle et lieu', () => {
    const vac = vacationSessionConfig(defaultPatrolSetup());
    expect(continueLabel(vac, catalog)).toBe('BAC 75N, secteur gare Saint-Lazare');
    const m = MISSIONS[5]!;
    const cfg = { mode: 'libre', missionId: m.id, role: m.role, rank: m.rank, place: m.place, timeOfDay: 14, weather: 'clair', crowdSize: 300, tension: 0.2, volatility: 0.3, duration: 'standard', seed: 1 } as SessionConfig;
    expect(continueLabel(cfg, catalog)).toBe(m.title);
    expect(continueLabel({ ...cfg, missionId: '', role: 'journaliste', place: 'Place de la Bastille' }, catalog)).toBe('Journaliste, Place de la Bastille');
  });
});

describe('vue Patrouille : réglages', () => {
  it('reprend la dernière vacation lancée, sans son délai d’essai', () => {
    const last = vacationSessionConfig({ ...defaultPatrolSetup(), crew: 'police_secours', departId: 'tv-75-03', seat: 'chef_bord', rank: 'major', rythme: 'agite', premier: 5, seed: 4242 });
    const s = initialPatrolSetup({ memory: { poste: '', missionId: '', patrol: null }, lastConfig: last, newSeed: () => 7 });
    expect(s).toMatchObject({ crew: 'police_secours', departId: 'tv-75-03', seat: 'chef_bord', rank: 'major', rythme: 'agite', seed: 4242 });
    expect(s.premier).toBeUndefined();
  });

  it('sans vacation précédente : réglages par défaut, graine neuve', () => {
    const libre = { mode: 'libre', missionId: '', role: 'crs', rank: 'gardien', place: 'Place de la République', timeOfDay: 14, weather: 'clair', crowdSize: 600, tension: 0.2, volatility: 0.3, duration: 'standard', seed: 3 } as SessionConfig;
    const s = initialPatrolSetup({ memory: { poste: '', missionId: '', patrol: null }, lastConfig: libre, newSeed: () => 777 });
    expect(s).toMatchObject({ crew: 'bac', seat: 'conducteur', departId: 'bac-75n', seed: 777 });
    // la vacation construite depuis ces réglages est bien une vacation (crowd.veille, aucune journée)
    const cfg = vacationSessionConfig(s);
    expect(readVacation(cfg)?.depart.callsign).toBe('BAC 75N');
    expect(cfg.extra?.['crowd.veille']).toBe(true);
  });

  it('les réglages en mémoire (vue rouverte) priment', () => {
    const mem = { ...defaultPatrolSetup(), crew: 'police_secours' as const, departId: 'hasard', seed: 9 };
    const s = initialPatrolSetup({ memory: { poste: '', missionId: '', patrol: mem }, lastConfig: null, newSeed: () => 1 });
    expect(s.crew).toBe('police_secours');
    expect(s.departId).toBe('hasard');
  });

  it('rappel lisible pour chaque équipage, place, rythme et durée', () => {
    for (const crew of ['bac', 'police_secours'] as const) {
      for (const r of RYTHMES) {
        for (const duration of ['courte', 'standard', 'longue', 'temps_reel'] as const) {
          const text = patrolRecap({ ...defaultPatrolSetup(), crew, departId: crew === 'bac' ? 'hasard' : 'tv-75-09', rythme: r.id, duration, seat: 'chef_bord' });
          expect(text).not.toMatch(/undefined|NaN/);
          expect(text).toContain(r.label.toLowerCase());
        }
      }
    }
    expect(patrolRecap(defaultPatrolSetup())).toBe(`BAC · BAC 75N · au volant · ${hourLabel(16)}, nuageux · 25 min · normal`);
  });
});

describe('navigation au clavier et à la manette dans l’accueil', () => {
  it('« bas » choisit l’élément du dessous, pas un élément lointain bord contre bord (recouvrement sub-pixel)', () => {
    // relevé réel (rubrique « La manifestation », 960 × 540) : « Proposer un nom », puis les organisateurs, et une
    // cause bien plus bas dont le bord gauche touche, à 0,3 px près, le bord droit du bouton
    const proposer = { x: 255, y: 253, w: 188, h: 44 };
    const candidates = [
      { x: 442.7, y: 945, w: 95, h: 44 }, // cause « Éducation »
      { x: 255, y: 385, w: 123, h: 44 }, // organisateurs « Intersyndicale »
      { x: 386, y: 385, w: 136, h: 44 }, // organisateurs « Collectif citoyen »
    ];
    expect(pickNeighbor(proposer, candidates, 'down')).toBe(1);
  });
});
