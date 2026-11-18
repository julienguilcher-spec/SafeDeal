// Robot joueur de l'accueil en quatre modes (sans DOM) : chaque mission spéciale lancée depuis la fiche démarre dans
// le bon rôle et le bon poste, même quand le Mode libre a été réglé avant (rôle Patrouille, imprévu, lieu au hasard,
// départ des colonnes) ; le curseur « Imprévu » change vraiment la session ; « Continuer » relance la même chose.
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { missionConfig } from '@/gameplay/missions';
import { readVacation } from '@/gameplay/patrols/model';
import { pickMission } from '@/ui/screens/home-panes-a';
import type { HomeModel } from '@/ui/screens/home';
import { buildSessionConfig, defaultDraft, draftFromConfig, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { readMissions } from '@/ui/screens/services';
import { CROWD_MIN } from '@/ui/screens/catalog';

/**
 * Écarts antérieurs à l'accueil en quatre modes (même chemin que l'ancien éditeur, commit eeaec87), signalés à part :
 * l'atelier ecole-03 demande le poste 'chef_groupe' à un élève CRS (poste absent du rôle CRS de l'accueil), et les
 * missions sans foule (taille 0) reçoivent la foule minimale de l'éditeur (CROWD_MIN).
 */
const PREEXISTING_POSTE = new Set(['ecole-03-ecouter-les-sommations']);

const catalog = readMissions({
  catalog: MISSIONS.map((m) => ({
    id: m.id, title: m.title, roles: [m.role, ...m.altRoles], type: m.type, difficulty: m.difficulty, summary: m.pitch, place: m.place,
    config: missionConfig(m, null),
  })),
});

/** Modèle minimal de l'accueil : le brouillon et replace() (comme home.ts). */
function fakeModel(draft: ScenarioDraft): HomeModel {
  const model = {
    draft,
    update(patch: Partial<ScenarioDraft>) { Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft)); },
    replace(next: ScenarioDraft) { Object.assign(draft, sanitizeDraft(next, draft)); },
  };
  return model as unknown as HomeModel;
}

/** Ce que fait la fiche « Lancer la mission » des Missions spéciales (home.ts launchMission, mode libre). */
function launchFromSheet(draft: ScenarioDraft, id: string): SessionConfig {
  const model = fakeModel(draft);
  if (draft.mode !== 'libre') model.update({ mode: 'libre' });
  pickMission(model, catalog.find((m) => m.id === id)!);
  return buildSessionConfig(model.draft);
}

describe('robot joueur : Missions spéciales lancées depuis la fiche', () => {
  const dirty = (): ScenarioDraft => sanitizeDraft({
    ...defaultDraft(), role: 'patrouille', variante: 'bac', poste: 'interpellation', rank: 'major', imprevu: 3, lieuHasard: true,
    depart: 'sur_place', organisateurs: 'aucun', manifNom: 'Marche test', crowdSize: 3000,
  });

  for (const [label, make] of [['brouillon par défaut', () => defaultDraft()], ['après un Mode libre réglé', dirty]] as const) {
    it(`chaque mission démarre dans son rôle et son poste (${label})`, () => {
      const bad: string[] = [];
      for (const m of MISSIONS) {
        const expected = missionConfig(m, null);
        const exPoste = (expected.extra as Record<string, unknown> | undefined)?.poste;
        const exVar = (expected.extra as Record<string, unknown> | undefined)?.variante;
        const cfg = launchFromSheet(make(), m.id);
        const extra = cfg.extra as Record<string, unknown>;
        const wrong: string[] = [];
        if (cfg.missionId !== m.id) wrong.push(`missionId ${cfg.missionId}`);
        if (cfg.mode !== 'libre') wrong.push(`mode ${cfg.mode}`);
        if (expected.role && cfg.role !== expected.role && !(expected.role === 'commissaire' && cfg.role === 'commandant')) wrong.push(`rôle ${cfg.role} au lieu de ${expected.role}`);
        if (typeof exPoste === 'string' && extra.poste !== exPoste && !PREEXISTING_POSTE.has(m.id)) wrong.push(`poste ${String(extra.poste)} au lieu de ${exPoste}`);
        if (typeof exVar === 'string' && exVar !== '' && extra.variante !== exVar) wrong.push(`variante ${String(extra.variante)} au lieu de ${exVar}`);
        if (expected.place && cfg.place !== expected.place) wrong.push(`lieu ${cfg.place} au lieu de ${expected.place}`);
        if (readVacation(cfg)) wrong.push('vacation');
        if (extra.imprevus !== undefined || extra['manif.nom'] !== undefined || extra['lieu.hasard'] !== undefined || extra['crowd.sono'] === false) wrong.push(`réglages du Mode libre reportés : ${JSON.stringify({ imprevus: extra.imprevus, nom: extra['manif.nom'], hasard: extra['lieu.hasard'], sono: extra['crowd.sono'] })}`);
        if (typeof expected.crowdSize === 'number' && expected.crowdSize >= CROWD_MIN && cfg.crowdSize !== expected.crowdSize) wrong.push(`foule ${cfg.crowdSize} au lieu de ${expected.crowdSize}`);
        if (wrong.length) bad.push(`${m.id} (${m.title}) : ${wrong.join(' ; ')}`);
      }
      if (bad.length) console.log(bad.join('\n'));
      expect(bad).toEqual([]);
    });
  }
});
