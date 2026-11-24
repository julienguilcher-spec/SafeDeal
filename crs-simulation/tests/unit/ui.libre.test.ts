// Page d'accueil, Mode libre : nom et organisateurs, curseur « Imprévu », lieu tiré au hasard, point de départ et aperçu
// des colonnes, rôle Patrouille ; compatibilité avec les configurations des versions précédentes (copies figées).
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { createRng } from '@/core/rng';
import { sanitizeSessionConfig } from '@/core/session';
import { createTestContext } from '@/core/testing';
import { readImprevus, readVacation, vacationSessionConfig, defaultPatrolSetup } from '@/gameplay/patrols/model';
import { SERVICE_BASES, isJournee } from '@/gameplay/session/journee-data';
import { castFor } from '@/gameplay/session/roster';
import { FoyersSystem } from '@/sim/crowd/foyers';
import type { ScenarioExtra } from '@/ui/core/api';
import { COLUMN_DEPARTS, DEFAULT_PLACES, MODES, ORGANISATEURS, ROLES, posteLabel, roleInfo } from '@/ui/screens/catalog';
import {
  autoFoyers, buildSessionConfig, cleanManifName, columnsPreview, defaultDraft, draftFromConfig, identityLabel, sanitizeDraft,
  suggestManifName, summarize, surpriseDraft,
} from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { createSystems as world } from '@/world/query';

const extraOf = (c: SessionConfig): ScenarioExtra & Record<string, unknown> => c.extra as unknown as ScenarioExtra & Record<string, unknown>;
const draft = (patch: Partial<ScenarioDraft>): ScenarioDraft => sanitizeDraft({ ...defaultDraft(), ...patch });

/*
 * Copies FIGÉES de configurations produites par la version précédente de la page d'accueil (commit eeaec87) :
 * brouillon par défaut, BRAV-M de nuit avec une manifestation simultanée, manifestant radical sans journée de service.
 * Ne pas les régénérer : elles prouvent que les réglages par défaut n'écrivent aucune clé nouvelle.
 */
const ANCIEN_DEFAUT = {
  "mode": "libre",
  "missionId": "",
  "role": "crs",
  "rank": "gardien",
  "place": "Place de la République",
  "timeOfDay": 14.5,
  "weather": "nuageux",
  "crowdSize": 600,
  "tension": 0.25,
  "volatility": 0.35,
  "duration": "standard",
  "seed": 1,
  "extra": {
    "scenario": 1,
    "poste": "bouclier",
    "variante": "",
    "cause": "retraites",
    "causeLabel": "Retraites",
    "composition": {
      "familles": 0.097,
      "gilets_jaunes": 0.097,
      "syndical": 0.388,
      "etudiants": 0.1455,
      "climat": 0.0485,
      "soignants": 0.0485,
      "agriculteurs": 0,
      "retraites": 0.1455,
      "black_bloc": 0.03
    },
    "vent": {
      "direction": 270,
      "vitesse": 10
    },
    "derapage": "hasard",
    "moyens": {
      "sections": 4,
      "fourgons": 12,
      "centaure": 0,
      "canon_eau": 1,
      "bravm": 1,
      "drone": 1,
      "pompiers": 1,
      "samu": 1,
      "secours_sur_appel": true
    },
    "options": {
      "sanctions": true,
      "violence": "realiste",
      "circulation": "ouverte",
      "metro": "ouvert",
      "journee": true
    },
    "journee": true,
    "preload": [
      {
        "candidates": [
          {
            "x": 1760,
            "z": 1225,
            "name": "caserne de la Cité"
          },
          {
            "x": 781,
            "z": -211,
            "name": "commissariat du 1er arrondissement (marché Saint-Honoré)"
          },
          {
            "x": 1350,
            "z": -897,
            "name": "commissariat du 9e arrondissement (rue Chauchat)"
          },
          {
            "x": 2255,
            "z": 271,
            "name": "commissariat du 3e arrondissement (rue aux Ours)"
          },
          {
            "x": -535,
            "z": -130,
            "name": "commissariat du 8e arrondissement (Grand Palais)"
          },
          {
            "x": -731,
            "z": 738,
            "name": "commissariat du 7e arrondissement (rue Fabert)"
          }
        ],
        "minDist": 1200,
        "maxDist": 3200,
        "as": "base"
      },
      {
        "candidates": [
          {
            "x": 1350,
            "z": -897,
            "name": "commissariat du 9e arrondissement (rue Chauchat)"
          },
          {
            "x": 2255,
            "z": 271,
            "name": "commissariat du 3e arrondissement (rue aux Ours)"
          },
          {
            "x": -535,
            "z": -130,
            "name": "commissariat du 8e arrondissement (Grand Palais)"
          },
          {
            "x": -731,
            "z": 738,
            "name": "commissariat du 7e arrondissement (rue Fabert)"
          },
          {
            "x": 781,
            "z": -211,
            "name": "commissariat du 1er arrondissement (marché Saint-Honoré)"
          }
        ],
        "minDist": 900,
        "maxDist": 3500,
        "as": "baseBravm"
      }
    ]
  },
  "x": 3123,
  "z": -208
} as unknown as SessionConfig;
const ANCIEN_BRAVM = {
  "mode": "libre",
  "missionId": "",
  "role": "bravm",
  "rank": "brigadier_chef",
  "place": "Place de la Bastille",
  "timeOfDay": 21.75,
  "weather": "averse",
  "crowdSize": 1800,
  "tension": 0.7,
  "volatility": 0.85,
  "duration": "longue",
  "seed": 123456,
  "extra": {
    "scenario": 1,
    "poste": "pilote_moto",
    "variante": "",
    "cause": "climat",
    "causeLabel": "Climat",
    "composition": {
      "familles": 0.044,
      "gilets_jaunes": 0.396,
      "syndical": 0.088,
      "etudiants": 0.264,
      "climat": 0.088,
      "soignants": 0,
      "agriculteurs": 0,
      "retraites": 0,
      "black_bloc": 0.12
    },
    "vent": {
      "direction": 45,
      "vitesse": 35
    },
    "derapage": "les_deux",
    "moyens": {
      "sections": 6,
      "fourgons": 18,
      "centaure": 1,
      "canon_eau": 2,
      "bravm": 2,
      "drone": 2,
      "pompiers": 2,
      "samu": 1,
      "secours_sur_appel": false
    },
    "options": {
      "sanctions": false,
      "violence": "sobre",
      "circulation": "coupee",
      "metro": "ferme",
      "journee": true
    },
    "journee": true,
    "manifestations": [
      {
        "place": "Place de la République",
        "x": 3123,
        "z": -208,
        "crowdSize": 600,
        "cause": "retraites",
        "causeLabel": "Retraites",
        "tension": 0.7,
        "volatility": 0.85
      }
    ],
    "preload": [
      {
        "candidates": [
          {
            "x": 1760,
            "z": 1225,
            "name": "caserne de la Cité"
          },
          {
            "x": 781,
            "z": -211,
            "name": "commissariat du 1er arrondissement (marché Saint-Honoré)"
          },
          {
            "x": 1350,
            "z": -897,
            "name": "commissariat du 9e arrondissement (rue Chauchat)"
          },
          {
            "x": 2255,
            "z": 271,
            "name": "commissariat du 3e arrondissement (rue aux Ours)"
          },
          {
            "x": -535,
            "z": -130,
            "name": "commissariat du 8e arrondissement (Grand Palais)"
          },
          {
            "x": -731,
            "z": 738,
            "name": "commissariat du 7e arrondissement (rue Fabert)"
          }
        ],
        "minDist": 1200,
        "maxDist": 3200,
        "as": "base"
      },
      {
        "candidates": [
          {
            "x": 1350,
            "z": -897,
            "name": "commissariat du 9e arrondissement (rue Chauchat)"
          },
          {
            "x": 2255,
            "z": 271,
            "name": "commissariat du 3e arrondissement (rue aux Ours)"
          },
          {
            "x": -535,
            "z": -130,
            "name": "commissariat du 8e arrondissement (Grand Palais)"
          },
          {
            "x": -731,
            "z": 738,
            "name": "commissariat du 7e arrondissement (rue Fabert)"
          },
          {
            "x": 781,
            "z": -211,
            "name": "commissariat du 1er arrondissement (marché Saint-Honoré)"
          }
        ],
        "minDist": 900,
        "maxDist": 3500,
        "as": "baseBravm"
      }
    ]
  },
  "x": 3542,
  "z": 1395
} as unknown as SessionConfig;
const ANCIEN_MANIFESTANT = {
  "mode": "libre",
  "missionId": "",
  "role": "manifestant",
  "rank": null,
  "place": "Place de la République",
  "timeOfDay": 14.5,
  "weather": "nuageux",
  "crowdSize": 600,
  "tension": 0.25,
  "volatility": 0.35,
  "duration": "standard",
  "seed": 77,
  "extra": {
    "scenario": 1,
    "poste": null,
    "variante": "radical",
    "cause": "retraites",
    "causeLabel": "Retraites",
    "composition": {
      "familles": 0.097,
      "gilets_jaunes": 0.097,
      "syndical": 0.388,
      "etudiants": 0.1455,
      "climat": 0.0485,
      "soignants": 0.0485,
      "agriculteurs": 0,
      "retraites": 0.1455,
      "black_bloc": 0.03
    },
    "vent": {
      "direction": 270,
      "vitesse": 10
    },
    "derapage": "hasard",
    "moyens": {
      "sections": 4,
      "fourgons": 12,
      "centaure": 0,
      "canon_eau": 1,
      "bravm": 1,
      "drone": 1,
      "pompiers": 1,
      "samu": 1,
      "secours_sur_appel": true
    },
    "options": {
      "sanctions": true,
      "violence": "realiste",
      "circulation": "ouverte",
      "metro": "ouvert",
      "journee": false
    },
    "journee": false
  },
  "x": 3123,
  "z": -208
} as unknown as SessionConfig;

describe('mode libre — compatibilité', () => {
  it('un brouillon par défaut produit EXACTEMENT la configuration de la version précédente', () => {
    expect(buildSessionConfig(defaultDraft())).toStrictEqual(ANCIEN_DEFAUT);
    expect(JSON.stringify(buildSessionConfig(defaultDraft()))).toBe(JSON.stringify(ANCIEN_DEFAUT));
  });

  it('une configuration enregistrée par la version précédente se relit sans perte', () => {
    for (const old of [ANCIEN_DEFAUT, ANCIEN_BRAVM, ANCIEN_MANIFESTANT]) {
      const d = draftFromConfig(old);
      expect(d.manifNom).toBe('');
      expect(d.organisateurs).toBe('intersyndicale');
      expect(d.imprevu).toBe(1);
      expect(d.lieuHasard).toBe(false);
      expect(buildSessionConfig(d)).toStrictEqual(old);
    }
    // sans journée de service, le départ des colonnes se relit « Déjà sur place »
    expect(draftFromConfig(ANCIEN_MANIFESTANT).depart).toBe('sur_place');
    expect(draftFromConfig(ANCIEN_BRAVM).depart).toBe('auto');
  });
});

describe('mode libre — aller-retour des nouveaux réglages', () => {
  it('nom, organisateurs, imprévu, lieu au hasard et départ des colonnes sont relus à l’identique', () => {
    const cases: Partial<ScenarioDraft>[] = [];
    for (const o of ORGANISATEURS) for (const imprevu of [0, 1, 2, 3] as const) {
      cases.push({ organisateurs: o.id, imprevu, manifNom: imprevu % 2 ? 'Marche pour le climat' : '', lieuHasard: imprevu === 2, seed: 17 + imprevu });
    }
    for (const c of COLUMN_DEPARTS) cases.push({ depart: c.id, options: { ...defaultDraft().options, journee: c.id !== 'sur_place' } });
    for (const patch of cases) {
      const d = draft(patch);
      const c1 = buildSessionConfig(d);
      const back = draftFromConfig(c1);
      expect(back.manifNom).toBe(d.manifNom);
      expect(back.organisateurs).toBe(d.organisateurs);
      expect(back.imprevu).toBe(d.imprevu);
      expect(back.lieuHasard).toBe(d.lieuHasard);
      expect(back.depart).toBe(d.depart);
      expect(buildSessionConfig(back)).toStrictEqual(c1);
      expect(JSON.parse(JSON.stringify(c1))).toEqual(c1);
      expect(sanitizeSessionConfig({ ...c1 })).toEqual([]);
    }
  });

  it('le nom est assaini (une ligne, 60 caractères au plus) et le nom proposé est propre', () => {
    expect(cleanManifName('  Marche \n\t pour   le climat ')).toBe('Marche pour le climat');
    expect(cleanManifName('x'.repeat(200)).length).toBe(60);
    expect(cleanManifName(42)).toBe('');
    expect(draft({ manifNom: 'a'.repeat(90) }).manifNom.length).toBe(60);
    for (const o of ORGANISATEURS) {
      for (const cause of ['Retraites', 'Climat', 'Hôpital', 'Libertés publiques', 'Prix des carburants']) {
        const name = suggestManifName({ causeLabel: cause, organisateurs: o.id });
        expect(name.length).toBeGreaterThan(5);
        expect(name.length).toBeLessThanOrEqual(60);
        expect(name).not.toMatch(/undefined|null|NaN/);
      }
    }
    expect(suggestManifName({ causeLabel: 'Climat', organisateurs: 'collectif' })).toBe('Marche citoyenne pour le climat');
  });
});

describe('mode libre — curseur « Imprévu »', () => {
  it('cran 0 : aucun foyer ; cran 1 : aucune clé ; cran 2 : foyers et une manifestation sauvage ; cran 3 : deux', () => {
    const e0 = extraOf(buildSessionConfig(draft({ imprevu: 0 })));
    expect(e0.foyers).toBe(0);
    expect(e0.imprevus).toBeUndefined();
    const e1 = extraOf(buildSessionConfig(draft({ imprevu: 1 })));
    expect('foyers' in e1).toBe(false);
    expect('imprevus' in e1).toBe(false);
    const c2 = buildSessionConfig(draft({ imprevu: 2 }));
    expect(extraOf(c2).foyers).toBeGreaterThanOrEqual(2);
    expect(extraOf(c2)['foyers.delai']).toBe(240);
    expect(readImprevus(c2)).toEqual({ sauvages: 1 });
    const c3 = buildSessionConfig(draft({ imprevu: 3 }));
    expect(extraOf(c3).foyers).toBe(5);
    expect(extraOf(c3)['foyers.delai']).toBe(150);
    expect(extraOf(c3)['foyers.ecart']).toBe(120);
    expect(readImprevus(c3)).toEqual({ sauvages: 2, premier: 300 });
  });

  it('le cran 2 garde au moins le nombre « automatique » du module de foule', () => {
    for (const crowdSize of [50, 300, 900, 1800, 5000]) {
      for (const volatility of [0, 0.3, 0.5, 0.75, 1]) {
        const cfg = buildSessionConfig(draft({ crowdSize, volatility }));
        expect(autoFoyers(crowdSize, volatility)).toBe(FoyersSystem.count(cfg, crowdSize, volatility));
        const e = extraOf(buildSessionConfig(draft({ crowdSize, volatility, imprevu: 2 })));
        expect(e.foyers).toBe(Math.max(2, FoyersSystem.count(cfg, crowdSize, volatility)));
      }
    }
  });

  it('une mission garde son propre scénario : ni imprévu, ni nom, ni lieu au hasard', () => {
    const c = buildSessionConfig(draft({ missionId: 'crs-01', imprevu: 3, manifNom: 'Essai', organisateurs: 'aucun', lieuHasard: true }));
    const e = extraOf(c);
    for (const k of ['foyers', 'imprevus', 'manif.nom', 'manif.organisateurs', 'crowd.sono', 'lieu.hasard']) expect(k in e).toBe(false);
    expect(c.place).toBe(DEFAULT_PLACES[0]!.name);
  });

  it('« Surprends-moi » tire un imprévu de 1 à 3 ; un samedi sans organisateur n’a pas d’organisateur', () => {
    const seen = new Set<number>();
    for (let s = 1; s <= 120; s++) {
      const d = surpriseDraft(createRng(s));
      expect(d.imprevu).toBeGreaterThanOrEqual(1);
      expect(d.imprevu).toBeLessThanOrEqual(3);
      expect(d.role).not.toBe('patrouille');
      seen.add(d.imprevu);
    }
    expect(seen.size).toBe(3);
  });
});

describe('mode libre — organisateurs', () => {
  it('« Sans organisateur » : ni sono ni service d’ordre (type de journée de la foule)', () => {
    const e = extraOf(buildSessionConfig(draft({ organisateurs: 'aucun' })));
    expect(e['crowd.sono']).toBe(false);
    expect(e['crowd.scenario']).toBe('samedi_sans_organisateur');
    expect(e['manif.organisateurs']).toBe('aucun');
    const named = extraOf(buildSessionConfig(draft({ manifNom: 'Grande marche' })));
    expect(named['manif.nom']).toBe('Grande marche');
    expect(named['manif.organisateurs']).toBe('intersyndicale');
    expect('crowd.sono' in named).toBe(false);
  });

  it('le résumé reprend le nom, les organisateurs et l’imprévu', () => {
    const text = summarize(draft({ manifNom: 'Grande marche', organisateurs: 'collectif', imprevu: 3 }));
    expect(text).toContain('Grande marche');
    expect(text).toContain('collectif citoyen');
    expect(text).toContain('Imprévu : imprévisible');
    expect(summarize(draft({ lieuHasard: true }))).toContain('Lieu tiré au hasard');
    expect(text).not.toMatch(/undefined|NaN|null/);
  });
});

describe('mode libre — lieu tiré au hasard', () => {
  it('même graine, même lieu ; toujours un lieu de DEFAULT_PLACES ; des lieux variés', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const a = buildSessionConfig(draft({ lieuHasard: true, seed }));
      const b = buildSessionConfig(draft({ lieuHasard: true, seed }));
      expect(b.place).toBe(a.place);
      const p = DEFAULT_PLACES.find((x) => x.name === a.place);
      expect(p).toBeDefined();
      expect(a.x).toBe(p!.x);
      expect(a.z).toBe(p!.z);
      seen.add(a.place);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('le lieu tiré reste à plus de 1,2 km des manifestations simultanées', () => {
    const others = [{ place: 'Place de la Bastille', x: 3542, z: 1395, crowdSize: 400, cause: 'climat', causeLabel: 'Climat' }];
    for (let seed = 1; seed <= 100; seed++) {
      const c = buildSessionConfig(draft({ lieuHasard: true, seed, manifestations: others }));
      expect(Math.hypot(c.x! - 3542, c.z! - 1395)).toBeGreaterThanOrEqual(1200);
    }
  });
});

describe('mode libre — point de départ des colonnes', () => {
  it('« Déjà sur place » : pas de journée de service ; une base : préchargement limité à cette base', () => {
    const sur = buildSessionConfig(draft({ depart: 'sur_place' }));
    expect(extraOf(sur).journee).toBe(false);
    expect(extraOf(sur).options.journee).toBe(false);
    expect(extraOf(sur).preload).toBeUndefined();
    expect(isJournee(sur)).toBe(false);
    for (const c of COLUMN_DEPARTS) {
      if (!c.base) continue;
      const cfg = buildSessionConfig(draft({ depart: c.id, moyens: { ...defaultDraft().moyens, bravm: 0 } }));
      const pre = extraOf(cfg).preload as { candidates: { x: number; z: number }[]; as: string }[];
      expect(pre).toHaveLength(1);
      expect(pre[0]!.as).toBe('base');
      expect(pre[0]!.candidates).toEqual([{ ...c.base }]);
      expect(extraOf(cfg).depart).toBe(c.id);
      expect(isJournee(cfg)).toBe(true);
    }
    // les six bases de la journée de service sont proposées, plus « Automatique » et « Déjà sur place »
    expect(COLUMN_DEPARTS.filter((c) => c.base).map((c) => c.base)).toEqual([...SERVICE_BASES]);
    expect(new Set(COLUMN_DEPARTS.map((c) => c.id)).size).toBe(COLUMN_DEPARTS.length);
  });

  it('la case « journée de service » décochée vaut « Déjà sur place »', () => {
    expect(draft({ options: { ...defaultDraft().options, journee: false } }).depart).toBe('sur_place');
    expect(draft({ depart: 'sur_place' }).options.journee).toBe(false);
  });

  it('la session part bien de la base choisie (carte réelle)', async () => {
    const t = createTestContext({ seed: 3, strict: true, modules: [world] });
    const cfg = buildSessionConfig(draft({ depart: 'arr-9', moyens: { ...defaultDraft().moyens, bravm: 0 } }));
    await t.start(cfg);
    const base = t.ctx.session.config!.extra!['base'] as { x: number; z: number; name: string };
    expect(base.name).toContain('9e arrondissement');
    expect(base.x).toBe(1350);
  });

  it('aperçu des colonnes : une seule colonne marquée pour chaque rôle de police, aucune pour un rôle civil', () => {
    for (const r of ROLES) {
      const d = draft({ role: r.id, rank: r.defaultRank, poste: r.defaultPoste, variante: r.variantes[0]?.id ?? '' });
      const cols = columnsPreview(d);
      const mine = cols.filter((c) => c.mine);
      if (r.police) expect(mine.length, r.id).toBe(1);
      else if (r.id === 'secouriste') expect(mine.length).toBe(1);
      else expect(mine.length, r.id).toBe(0);
      for (const c of cols) {
        expect(c.label).not.toMatch(/undefined|NaN|null/);
        expect(c.from).not.toBe('');
      }
    }
    const cols = columnsPreview(draft({ depart: 'arr-9' }));
    expect(cols.find((c) => c.id === 'compagnie')!.from).toContain('9e arrondissement');
    expect(columnsPreview(draft({ depart: 'sur_place' })).find((c) => c.id === 'compagnie')!.from).toBe('déjà sur place');
  });
});

describe('mode libre — rôle Patrouille', () => {
  it('le rôle est au catalogue : variantes BAC et Police secours, poste « Chef de bord »', () => {
    const info = roleInfo('patrouille');
    expect(info.id).toBe('patrouille');
    expect(info.variantes.map((v) => v.id)).toEqual(['bac', 'police_secours']);
    expect(info.postes).toEqual(['conducteur', 'interpellation']);
    expect(posteLabel('patrouille', 'interpellation')).toBe('Chef de bord');
    expect(posteLabel('crs', 'interpellation')).toBe('Interpellateur');
    expect(info.horsCarriere).toBe(true);
    expect(identityLabel({ role: 'patrouille', rank: 'gardien', poste: 'interpellation', variante: 'bac' })).toBe('Gardien de la paix, chef de bord (BAC)');
    expect(MODES.find((m) => m.id === 'monde_ouvert')!.label).toBe('Patrouille');
  });

  it('rôle patrouille en Mode libre : pas de journée de service, même case cochée', () => {
    const c = buildSessionConfig(draft({ role: 'patrouille', rank: 'gardien', poste: 'conducteur', variante: 'police_secours' }));
    expect(c.role).toBe('patrouille');
    expect(extraOf(c).journee).toBe(false);
    expect(extraOf(c).preload).toBeUndefined();
    expect(isJournee(c)).toBe(false);
    expect(extraOf(c).variante).toBe('police_secours');
    const back = draftFromConfig(c);
    expect(back.role).toBe('patrouille');
    expect(back.variante).toBe('police_secours');
  });
});

describe('Patrouille (monde_ouvert) depuis l’éditeur', () => {
  it('une ancienne configuration « Monde ouvert » devient une vacation BAC, sans foule', () => {
    const old: SessionConfig = { ...ANCIEN_DEFAUT, mode: 'monde_ouvert', place: 'Place de l’Opéra', x: 811, z: -564, extra: { ...ANCIEN_DEFAUT.extra, journee: false } };
    delete (old.extra as Record<string, unknown>)['preload'];
    const c = buildSessionConfig(draftFromConfig(old));
    expect(c.mode).toBe('monde_ouvert');
    expect(c.role).toBe('patrouille');
    expect(c.crowdSize).toBe(0);
    const v = readVacation(c)!;
    expect(v.crew).toBe('bac');
    expect(v.depart.id).toBe('bac-75n');
    expect(c.timeOfDay).toBe(old.timeOfDay);
    expect(c.seed).toBe(old.seed);
  });

  it('une vacation relue dans l’éditeur garde équipage, place, grade, départ et rythme', () => {
    const setup = { ...defaultPatrolSetup(), crew: 'police_secours' as const, seat: 'chef_bord' as const, rank: 'major' as const, departId: 'tv-75-09', rythme: 'agite' as const, seed: 4242 };
    const vac = vacationSessionConfig(setup);
    const d = draftFromConfig(vac);
    expect(d.mode).toBe('monde_ouvert');
    expect(d.role).toBe('patrouille');
    expect(d.variante).toBe('police_secours');
    expect(d.poste).toBe('interpellation');
    const c = buildSessionConfig(d);
    expect(c).toStrictEqual(vac);
    expect(summarize(d)).toContain('Police secours');
  });
});

describe('équipages d’engins : opérateur et chef d’engin jouables', () => {
  const cfg = (role: SessionConfig['role'], poste: string): SessionConfig => ({ ...ANCIEN_DEFAUT, role, extra: { ...ANCIEN_DEFAUT.extra, poste } });

  it('le catalogue propose les postes des missions (opérateur, chef d’engin) et l’accueil les garde', () => {
    expect(roleInfo('gendarme_centaure').postes).toEqual(['conducteur', 'operateur', 'chef_groupe']);
    expect(roleInfo('operateur_canon_eau').postes).toEqual(['conducteur', 'operateur']);
    for (const [role, poste] of [['operateur_canon_eau', 'operateur'], ['gendarme_centaure', 'operateur'], ['gendarme_centaure', 'chef_groupe']] as const) {
      const c = buildSessionConfig(draftFromConfig(cfg(role, poste)));
      expect(extraOf(c).poste).toBe(poste);
    }
  });

  it('la distribution place le joueur au poste choisi', () => {
    const at = (role: SessionConfig['role'], poste: string): { poste: string | null; leads: string } => {
      const cast = castFor(cfg(role, poste), undefined);
      const s = cast.slots[cast.player]!;
      return { poste: s.poste, leads: s.leads };
    };
    expect(at('operateur_canon_eau', 'conducteur').poste).toBe('conducteur');
    expect(at('operateur_canon_eau', 'operateur')).toEqual({ poste: 'operateur', leads: '' });
    expect(at('gendarme_centaure', 'conducteur').poste).toBe('conducteur');
    expect(at('gendarme_centaure', 'operateur')).toEqual({ poste: 'operateur', leads: '' });
    expect(at('gendarme_centaure', 'chef_groupe')).toEqual({ poste: 'chef_groupe', leads: 'unite' });
  });
});
