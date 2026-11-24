/**
 * Modèle partagé de la vacation de patrouille (src/gameplay/patrols/model.ts) et contrats du rôle 'patrouille' :
 * configuration de session, aller-retour avec la vue Patrouille, migration des anciennes configurations « Monde
 * ouvert » de l'accueil, distribution de l'équipage, journée de service, grade par défaut, visibilité de carte,
 * paramètre d'essai &premier=.
 */
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { launchSessionConfig, parseLaunchParams } from '@/core/launch';
import { defaultRankForRole, sanitizeSessionConfig } from '@/core/session';
import {
  CREWS, IMPREVUS_KEY, VACATION_KEY, VEILLE_KEY, defaultPatrolSetup, migrateLegacyPatrol, nearestDepart,
  patrolSetupFromConfig, readImprevus, readVacation, resolveDepart, sanitizePatrolSetup, vacationSessionConfig,
  type PatrolSetup,
} from '@/gameplay/patrols/model';
import { BAC_SITES, TV_SITES } from '@/gameplay/patrols/sites';
import { castFor, isPoliceRole } from '@/gameplay/session/roster';
import { isJournee } from '@/gameplay/session/journee-data';
import { CROWD_VEILLE_KEY } from '@/sim/crowd/core';
import { visibilityFor } from '@/ui/maps/visibility';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';

function setup(p: Partial<PatrolSetup> = {}): PatrolSetup {
  return sanitizePatrolSetup({ ...defaultPatrolSetup(), ...p });
}

describe('vacationSessionConfig', () => {
  it('produit une session « monde_ouvert » sans foule, cœur de foule en veille, sans journée de service', () => {
    const cfg = vacationSessionConfig(setup({ rythme: 'agite', seed: 42 }));
    expect(cfg.mode).toBe('monde_ouvert');
    expect(cfg.missionId).toBe('');
    expect(cfg.role).toBe('patrouille');
    expect(cfg.rank).toBe('gardien');
    expect(cfg.crowdSize).toBe(0);
    expect(cfg.tension).toBe(0.45);
    expect(cfg.volatility).toBe(0.75);
    const extra = cfg.extra!;
    expect(extra[VEILLE_KEY]).toBe(true);
    expect(VEILLE_KEY).toBe(CROWD_VEILLE_KEY); // même clé que le module de foule
    expect(extra['journee']).toBe(false);
    expect((extra['options'] as { journee: boolean }).journee).toBe(false);
    expect(extra['foyers']).toBe(0);
    expect(extra['patrouilles']).toBe(4);
    expect(extra['poste']).toBe('conducteur');
    expect(extra['variante']).toBe('bac');
    expect(extra['scenario']).toBe(1);
    // aucune compagnie ni engin, secours sur appel
    const m = extra['moyens'] as Record<string, unknown>;
    expect([m.sections, m.fourgons, m.centaure, m.canon_eau, m.bravm, m.drone]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(isJournee(cfg)).toBe(false);
    // le départ est un vrai secteur BAC, coordonnées réelles
    const site = BAC_SITES[0]!;
    expect(cfg.x).toBe(site.x);
    expect(cfg.z).toBe(site.z);
    expect(cfg.place).toBe('secteur gare Saint-Lazare');
    // la session l'accepte sans rien corriger
    expect(sanitizeSessionConfig({ ...cfg })).toEqual([]);
    // et la relit comme vacation
    const v = readVacation(cfg)!;
    expect(v).not.toBeNull();
    expect(v.crew).toBe('bac');
    expect(v.seat).toBe('conducteur');
    expect(v.rythme).toBe('agite');
    expect(v.depart.callsign).toBe('BAC 75N');
    expect(v.depart.name).toBe('secteur gare Saint-Lazare');
    expect(v.types).toEqual({ feux: true, rassemblements: true, blocages: true, casseurs: true, manifs: true });
    expect(v.premier).toBeUndefined();
    // la configuration est du JSON pur (sauvegarde, historique)
    expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg);
  });

  it('chef de bord : poste « interpellation » ; Police secours : commissariat et voiture sérigraphiée', () => {
    const cfg = vacationSessionConfig(setup({ crew: 'police_secours', seat: 'chef_bord', departId: 'tv-75-09', rank: 'major' }));
    expect(cfg.extra!['poste']).toBe('interpellation');
    expect(cfg.extra!['variante']).toBe('police_secours');
    expect(cfg.rank).toBe('major');
    const v = readVacation(cfg)!;
    expect(v.depart.callsign).toBe('TV 75-09');
    expect(v.depart.name).toBe('commissariat du 9e arrondissement');
    expect(cfg.x).toBe(TV_SITES.find((s) => s.callsign === 'TV 75-09')!.x);
    expect(CREWS.find((c) => c.id === 'police_secours')!.vehicle).toBe('voiture_police');
    expect(CREWS.find((c) => c.id === 'bac')!.vehicle).toBe('voiture_bac');
  });

  it('les trois rythmes donnent tension et volatilité croissantes', () => {
    const t = (['calme', 'normal', 'agite'] as const).map((r) => vacationSessionConfig(setup({ rythme: r })));
    expect(t.map((c) => [c.tension, c.volatility])).toEqual([[0.15, 0.3], [0.3, 0.5], [0.45, 0.75]]);
  });

  it('premier (essais) est recopié dans la vacation', () => {
    const cfg = vacationSessionConfig(setup({ premier: 5 }));
    expect(readVacation(cfg)!.premier).toBe(5);
  });
});

describe('aller-retour avec la vue Patrouille', () => {
  it('patrolSetupFromConfig(vacationSessionConfig(s)) restitue s', () => {
    const cases: PatrolSetup[] = [
      defaultPatrolSetup(),
      setup({ crew: 'police_secours', seat: 'chef_bord', rank: 'brigadier_chef', departId: 'tv-75-04', rythme: 'calme', timeOfDay: 22.25, weather: 'pluie', windDir: 45, windSpeed: 30, duration: 'longue', seed: 777 }),
      setup({ departId: 'hasard', rythme: 'agite', duration: 'temps_reel', seed: 12345, premier: 5, violence: 'sobre' }),
      setup({ crew: 'police_secours', departId: 'hasard', seed: 9 }),
    ];
    for (const s of cases) {
      expect(patrolSetupFromConfig(vacationSessionConfig(s))).toEqual(s);
    }
  });

  it('« Au hasard » est déterministe pour une même graine et tire un départ de l’équipage', () => {
    const a = vacationSessionConfig(setup({ departId: 'hasard', seed: 31 }));
    const b = vacationSessionConfig(setup({ departId: 'hasard', seed: 31 }));
    expect(a).toEqual(b);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const d = resolveDepart(setup({ departId: 'hasard', seed }));
      expect(BAC_SITES.some((s) => s.callsign === d.callsign && s.x === d.x && s.z === d.z)).toBe(true);
      seen.add(d.id);
      const ps = resolveDepart(setup({ crew: 'police_secours', departId: 'hasard', seed }));
      expect(TV_SITES.some((s) => s.callsign === ps.callsign)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1); // le hasard varie selon la graine
  });

  it('sanitizePatrolSetup borne les valeurs absurdes', () => {
    const s = sanitizePatrolSetup({
      crew: 'bravm' as never, seat: 'arriere' as never, rank: 'commissaire', departId: 'tv-75-01', rythme: 'fou' as never,
      timeOfDay: Number.NaN, weather: 'neige' as never, windDir: 400, windSpeed: 500, duration: 'eternelle' as never,
      seed: -3.7, premier: -1,
    });
    expect(s.crew).toBe('bac');
    expect(s.seat).toBe('conducteur');
    expect(s.rank).toBe('gardien');
    expect(s.departId).toBe('bac-75n'); // un commissariat n'est pas un départ de la BAC
    expect(s.rythme).toBe('normal');
    expect(s.timeOfDay).toBe(16);
    expect(s.weather).toBe('nuageux');
    expect(s.windDir).toBe(45);
    expect(s.windSpeed).toBe(70);
    expect(s.duration).toBe('standard');
    expect(s.seed).toBe(3);
    expect(s.premier).toBeUndefined();
  });

  it('une configuration qui n’est pas une vacation ne se relit pas', () => {
    expect(patrolSetupFromConfig(buildSessionConfig(defaultDraft()))).toBeNull();
    expect(readVacation(null)).toBeNull();
    // une vacation sur un autre rôle n'en est pas une
    const cfg = vacationSessionConfig(defaultPatrolSetup());
    expect(readVacation({ ...cfg, role: 'crs' })).toBeNull();
    // départ abîmé : pas de vacation
    expect(readVacation({ ...cfg, extra: { ...cfg.extra, [VACATION_KEY]: { depart: { x: 'a', z: 0 } } } })).toBeNull();
  });
});

describe('migrateLegacyPatrol', () => {
  it('une ancienne configuration « Monde ouvert » à l’Opéra devient une vacation BAC au secteur le plus proche', () => {
    const d = defaultDraft();
    // place de l'Opéra (repère du jeu, DEFAULT_PLACES)
    // configuration telle que l'écrivait l'ancienne version de l'accueil en « Monde ouvert » (scénario libre, sans
    // journée de service ni préchargement) : l'accueil actuel la convertit déjà lui-même, on la reconstitue donc ici
    const libre = buildSessionConfig({ ...d, role: 'crs', place: 'Place de l’Opéra', x: 811, z: -564, timeOfDay: 21, weather: 'pluie', duration: 'longue', seed: 99 });
    const oldExtra: Record<string, unknown> = { ...libre.extra, journee: false };
    delete oldExtra['preload'];
    const old: SessionConfig = { ...libre, mode: 'monde_ouvert', extra: oldExtra };
    expect(old.crowdSize).toBeGreaterThan(0); // la manifestation fantôme de l'ancienne version
    const cfg = migrateLegacyPatrol(old);
    expect(cfg.mode).toBe('monde_ouvert');
    expect(cfg.role).toBe('patrouille');
    expect(cfg.crowdSize).toBe(0);
    expect(cfg.extra![VEILLE_KEY]).toBe(true);
    expect(cfg.extra!['journee']).toBe(false);
    const v = readVacation(cfg)!;
    expect(v.crew).toBe('bac');
    expect(v.depart.callsign).toBe(nearestDepart('bac', 811, -564).callsign);
    expect(v.depart.callsign).toBe('BAC 75N'); // gare Saint-Lazare est le secteur le plus proche de l'Opéra
    expect(cfg.timeOfDay).toBe(21);
    expect(cfg.weather).toBe('pluie');
    expect(cfg.duration).toBe('longue');
    expect(cfg.seed).toBe(99);
    // déjà migrée : rendue telle quelle
    expect(migrateLegacyPatrol(cfg)).toBe(cfg);
  });

  it('une configuration « libre » et un ?autostart=paris construit hors de l’interface sont rendus tels quels', () => {
    const libre = buildSessionConfig(defaultDraft());
    expect(migrateLegacyPatrol(libre)).toBe(libre);
    const snapshot = JSON.stringify(libre);
    migrateLegacyPatrol(libre);
    expect(JSON.stringify(libre)).toBe(snapshot);

    const auto = launchSessionConfig(parseLaunchParams('?autostart=paris'));
    expect(auto.mode).toBe('monde_ouvert'); // sémantique des scénarios navigateur inchangée
    expect(auto.role).toBe('crs');
    const autoSnap = JSON.stringify(auto);
    expect(migrateLegacyPatrol(auto)).toBe(auto);
    expect(JSON.stringify(auto)).toBe(autoSnap);
  });
});

describe('readImprevus', () => {
  it('relit et borne extra.imprevus ; absent ou nul : null', () => {
    expect(readImprevus({ extra: {} })).toBeNull();
    expect(readImprevus({ extra: { [IMPREVUS_KEY]: { sauvages: 0 } } })).toBeNull();
    expect(readImprevus({ extra: { [IMPREVUS_KEY]: { sauvages: 2, premier: 300 } } })).toEqual({ sauvages: 2, premier: 300 });
    expect(readImprevus({ extra: { [IMPREVUS_KEY]: { sauvages: 9, premier: -5, ecart: 120 } } })).toEqual({ sauvages: 3, ecart: 120 });
  });
});

describe('rôle « patrouille »', () => {
  it('castFor BAC conducteur : trois policiers en civil, voiture banalisée, joueur au volant', () => {
    const cfg = vacationSessionConfig(setup({ crew: 'bac', seat: 'conducteur', departId: 'bac-75n' }));
    const cast = castFor(cfg, undefined);
    expect(cast.slots).toHaveLength(3);
    expect(cast.slots.every((s) => s.kind === 'policier_civil')).toBe(true);
    expect(cast.vehicles).toEqual(['voiture_bac']);
    expect(cast.slots[cast.player]!.poste).toBe('conducteur');
    expect(cast.squads).toHaveLength(1);
    expect(cast.squads[0]!.name).toBe('BAC 75N');
    expect(cast.squads[0]!.kind).toBe('equipage');
    expect(cast.slots.every((s) => s.squad === 0)).toBe(true);
    expect(cast.slots[cast.player]!.rank).toBe('gardien');
  });

  it('castFor chef de bord : le joueur est le chef de bord ; Police secours en tenue, voiture sérigraphiée', () => {
    const cfg = vacationSessionConfig(setup({ crew: 'police_secours', seat: 'chef_bord', departId: 'tv-75-03', rank: 'major' }));
    const cast = castFor(cfg, undefined);
    expect(cast.vehicles).toEqual(['voiture_police']);
    expect(cast.slots.every((s) => s.kind === 'crs')).toBe(true); // archétype des voitures TV de l'IA
    const me = cast.slots[cast.player]!;
    expect(me.poste).toBe('interpellation');
    expect(me.leads).toBe('unite');
    expect(me.rank).toBe('major');
    expect(cast.slots.filter((s) => s.poste === 'conducteur')).toHaveLength(1);
    expect(cast.squads[0]!.name).toBe('TV 75-03');
  });

  it('castFor major au volant : le chef de bord de l’IA n’est pas moins gradé que lui', () => {
    const major = castFor(vacationSessionConfig(setup({ crew: 'bac', seat: 'conducteur', departId: 'bac-75n', rank: 'major' })), undefined);
    expect(major.slots[major.player]!.rank).toBe('major');
    expect(major.slots[0]!.rank).toBe('major');
    const gardien = castFor(vacationSessionConfig(setup({ crew: 'bac', seat: 'conducteur', departId: 'bac-75n', rank: 'gardien' })), undefined);
    expect(gardien.slots[0]!.rank).toBe('brigadier_chef');
  });

  it('castFor sans vacation (mode libre) : indicatif générique', () => {
    const cast = castFor({ ...buildSessionConfig(defaultDraft()), role: 'patrouille', extra: { variante: 'police_secours' } }, undefined);
    expect(cast.squads[0]!.name).toBe('TV 75');
    const bac = castFor({ ...buildSessionConfig(defaultDraft()), role: 'patrouille', extra: {} }, undefined);
    expect(bac.squads[0]!.name).toBe('BAC 75');
    expect(bac.vehicles).toEqual(['voiture_bac']);
  });

  it('jamais de journée de service, même demandée', () => {
    expect(isJournee({ role: 'patrouille', extra: { journee: true } })).toBe(false);
    expect(isJournee({ role: 'crs', extra: { journee: true } })).toBe(true);
    expect(isPoliceRole('patrouille')).toBe(true);
  });

  it('grade par défaut : gardien de la paix', () => {
    expect(defaultRankForRole('patrouille')).toBe('gardien');
  });

  it('la carte montre ce que voit la police', () => {
    expect(visibilityFor('patrouille')).toEqual(visibilityFor('crs'));
  });
});

describe('lancement par l’URL', () => {
  it('&premier= est lu (nombre ≥ 0) et le rôle « patrouille » accepté', () => {
    const p = parseLaunchParams('?autostart=paris&role=patrouille&premier=5');
    expect(p.premier).toBe(5);
    expect(p.role).toBe('patrouille');
    expect(parseLaunchParams('?premier=-2').premier).toBeNull();
    expect(parseLaunchParams('?premier=abc').premier).toBeNull();
    expect(parseLaunchParams('').premier).toBeNull();
    // le défaut de ?autostart=paris est inchangé
    const cfg: SessionConfig = launchSessionConfig(parseLaunchParams('?autostart=paris&premier=5'));
    expect(cfg.mode).toBe('monde_ouvert');
    expect(cfg.place).toBe('place de la Concorde');
  });
});
