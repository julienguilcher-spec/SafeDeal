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

/** Parts de chaque famille (somme = 1), pour comparer deux compositions données en poids ou en parts. */
function shares(c: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const src = (c ?? {}) as Record<string, number>;
  let sum = 0;
  for (const v of Object.values(src)) sum += Math.max(0, v);
  for (const [k, v] of Object.entries(src)) if (v > 0) out[k] = v / (sum || 1);
  return out;
}

/** Écart le plus grand entre deux compositions (parts). */
function compoGap(a: unknown, b: unknown): number {
  const sa = shares(a);
  const sb = shares(b);
  let gap = 0;
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) gap = Math.max(gap, Math.abs((sa[k] ?? 0) - (sb[k] ?? 0)));
  return gap;
}

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
function launchFromSheet(draft: ScenarioDraft, id: string, mode: 'libre' | 'carriere' = 'libre'): SessionConfig {
  const model = fakeModel(draft);
  if (draft.mode !== mode) model.update({ mode });
  pickMission(model, catalog.find((m) => m.id === id)!);
  return buildSessionConfig(model.draft);
}

describe('robot joueur : Missions spéciales lancées depuis la fiche', () => {
  const dirty = (): ScenarioDraft => sanitizeDraft({
    ...defaultDraft(), role: 'patrouille', variante: 'bac', poste: 'interpellation', rank: 'major', imprevu: 3, lieuHasard: true,
    depart: 'sur_place', organisateurs: 'aucun', manifNom: 'Marche test', crowdSize: 3000,
  });

  for (const [label, make, mode] of [['brouillon par défaut', () => defaultDraft(), 'libre'], ['après un Mode libre réglé', dirty, 'libre'],
    ['fiche de la carrière', dirty, 'carriere']] as const) {
    it(`chaque mission démarre dans son rôle et son poste (${label})`, () => {
      const bad: string[] = [];
      for (const m of MISSIONS) {
        const expected = missionConfig(m, null);
        const exPoste = (expected.extra as Record<string, unknown> | undefined)?.poste;
        const exVar = (expected.extra as Record<string, unknown> | undefined)?.variante;
        const cfg = launchFromSheet(make(), m.id, mode);
        const extra = cfg.extra as Record<string, unknown>;
        const wrong: string[] = [];
        if (cfg.missionId !== m.id) wrong.push(`missionId ${cfg.missionId}`);
        if (cfg.mode !== mode) wrong.push(`mode ${cfg.mode}`);
        if (expected.role && cfg.role !== expected.role && !(expected.role === 'commissaire' && cfg.role === 'commandant')) wrong.push(`rôle ${cfg.role} au lieu de ${expected.role}`);
        if (typeof exPoste === 'string' && extra.poste !== exPoste) wrong.push(`poste ${String(extra.poste)} au lieu de ${exPoste}`);
        if (typeof exVar === 'string' && exVar !== '' && extra.variante !== exVar) wrong.push(`variante ${String(extra.variante)} au lieu de ${exVar}`);
        if (expected.place && cfg.place !== expected.place) wrong.push(`lieu ${cfg.place} au lieu de ${expected.place}`);
        if (readVacation(cfg)) wrong.push('vacation');
        if (extra.imprevus !== undefined || extra['manif.nom'] !== undefined || extra['lieu.hasard'] !== undefined || extra['crowd.sono'] === false) wrong.push(`réglages du Mode libre reportés : ${JSON.stringify({ imprevus: extra.imprevus, nom: extra['manif.nom'], hasard: extra['lieu.hasard'], sono: extra['crowd.sono'] })}`);
        if (cfg.timeOfDay !== expected.timeOfDay) wrong.push(`heure ${cfg.timeOfDay} au lieu de ${expected.timeOfDay}`);
        if (cfg.crowdSize !== expected.crowdSize) wrong.push(`foule ${cfg.crowdSize} au lieu de ${expected.crowdSize}`);
        // une mission sans foule n'en a aucune (le module de foule ne crée personne)
        if ((expected.extra as Record<string, unknown>)['crowd.none'] === true && extra['crowd.none'] !== true) wrong.push('crowd.none perdu');
        // les familles de la fiche (supporters, curieux, riverains… = 'divers') : pas un cortège syndical à leur place
        if (compoGap(extra.composition, (expected.extra as Record<string, unknown>).composition) > 0.02) wrong.push(`composition ${JSON.stringify(extra.composition)} au lieu de ${JSON.stringify((expected.extra as Record<string, unknown>).composition)}`);
        // parcours déclaré par la fiche (relu par le module de foule, src/sim/crowd/route.ts)
        if (m.crowd.route.length >= 2 && JSON.stringify(extra['crowd.route']) !== JSON.stringify(m.crowd.route)) wrong.push(`parcours ${JSON.stringify(extra['crowd.route'])}`);
        if (wrong.length) bad.push(`${m.id} (${m.title}) : ${wrong.join(' ; ')}`);
      }
      if (bad.length) console.log(bad.join('\n'));
      expect(bad).toEqual([]);
    });
  }
});
