// Page d'accueil — scénarios enregistrés (section « scenarios » de ctx.save) : enregistrer, renommer, supprimer, relancer.
import { describe, expect, it } from 'vitest';
import { createSave } from '@/core/save';
import { SCENARIOS_SECTION } from '@/ui/core/api';
import { buildSessionConfig, defaultDraft, draftFromConfig, sanitizeDraft } from '@/ui/screens/scenario';
import { MAX_NAME_LENGTH, MAX_SCENARIOS, ScenarioStore, cleanName, uniqueName } from '@/ui/screens/scenarios-store';

function setup(): { store: ScenarioStore; save: ReturnType<typeof createSave>; tick: () => void } {
  const save = createSave({ storage: null });
  let now = 1_800_000_000_000;
  const store = new ScenarioStore(save, () => now);
  return { store, save, tick: () => { now += 1000; } };
}

describe('ui/scénarios enregistrés', () => {
  it('enregistre, liste du plus récent au plus ancien, relit la configuration à l’identique', () => {
    const { store, tick } = setup();
    expect(store.list()).toEqual([]);
    const c1 = buildSessionConfig(defaultDraft());
    const a = store.add('Samedi calme', c1);
    tick();
    const c2 = buildSessionConfig(sanitizeDraft({ ...defaultDraft(), role: 'commissaire', crowdSize: 2000 }));
    const b = store.add('Journée tendue', c2);
    const list = store.list();
    expect(list.map((s) => s.name)).toEqual(['Journée tendue', 'Samedi calme']);
    expect(store.get(a.id)!.config).toEqual(c1);
    expect(store.get(b.id)!.config).toEqual(c2);
    // « relancer » : la configuration relue redonne le même brouillon
    expect(buildSessionConfig(draftFromConfig(store.get(b.id)!.config))).toEqual(c2);
  });

  it('survit à un nouvel objet de sauvegarde (persistance par la section JSON)', () => {
    const { store, save } = setup();
    store.add('À garder', buildSessionConfig(defaultDraft()));
    const again = new ScenarioStore(save);
    expect(again.list().map((s) => s.name)).toEqual(['À garder']);
    const exported = save.exportAll();
    const other = createSave({ storage: null });
    expect(other.importAll(exported)).toBe(true);
    expect(new ScenarioStore(other).list().map((s) => s.name)).toEqual(['À garder']);
  });

  it('renomme, refuse un nom vide, garde les noms uniques', () => {
    const { store, tick } = setup();
    const a = store.add('Essai', buildSessionConfig(defaultDraft()));
    tick();
    const b = store.add('Essai', buildSessionConfig(defaultDraft()));
    expect(b.name).toBe('Essai (2)');
    expect(store.rename(a.id, '   ')).toBe(false);
    expect(store.rename('inconnu', 'X')).toBe(false);
    expect(store.rename(a.id, '  Bastille   de  nuit ')).toBe(true);
    expect(store.get(a.id)!.name).toBe('Bastille de nuit');
    expect(store.rename(b.id, 'Bastille de nuit')).toBe(true);
    expect(store.get(b.id)!.name).toBe('Bastille de nuit (2)');
    // renommer à l'identique ne crée pas de doublon numéroté
    expect(store.rename(a.id, 'Bastille de nuit')).toBe(true);
    expect(store.get(a.id)!.name).toBe('Bastille de nuit');
  });

  it('supprime', () => {
    const { store } = setup();
    const a = store.add('Un', buildSessionConfig(defaultDraft()));
    expect(store.remove(a.id)).toBe(true);
    expect(store.remove(a.id)).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.get(a.id)).toBeNull();
  });

  it('dernière configuration lancée (« Continuer »)', () => {
    const { store } = setup();
    expect(store.last()).toBeNull();
    const c = buildSessionConfig(sanitizeDraft({ ...defaultDraft(), role: 'journaliste' }));
    store.setLast(c);
    expect(store.last()).toEqual(c);
    // enregistrer un scénario n'efface pas la dernière configuration, et inversement
    store.add('Autre', buildSessionConfig(defaultDraft()));
    expect(store.last()).toEqual(c);
    store.setLast(buildSessionConfig(defaultDraft()));
    expect(store.list().length).toBe(1);
  });

  it('borne le nombre de scénarios en gardant les plus récents', () => {
    const { store, tick } = setup();
    for (let i = 0; i < MAX_SCENARIOS + 5; i++) {
      store.add('S' + i, buildSessionConfig(defaultDraft()));
      tick();
    }
    const list = store.list();
    expect(list.length).toBe(MAX_SCENARIOS);
    expect(list[0]!.name).toBe('S' + (MAX_SCENARIOS + 4));
    expect(list.some((s) => s.name === 'S0')).toBe(false);
    expect(new Set(list.map((s) => s.id)).size).toBe(MAX_SCENARIOS);
  });

  it('ignore une section abîmée sans lever d’exception', () => {
    const { store, save } = setup();
    save.write(SCENARIOS_SECTION, { v: 1, last: 'oups', items: [null, 3, { id: '', name: 'x', config: {} }, { id: 'ok', name: 42, savedAt: 'hier', config: buildSessionConfig(defaultDraft()) }, { id: 'ok', name: 'doublon', config: buildSessionConfig(defaultDraft()) }] });
    expect(store.last()).toBeNull();
    const list = store.list();
    expect(list.length).toBe(1);
    expect(list[0]!.name).toBe('Scénario sans nom');
    expect(list[0]!.savedAt).toBe(0);
    save.write(SCENARIOS_SECTION, 'n’importe quoi');
    expect(store.list()).toEqual([]);
    expect(() => store.add('Reparti', buildSessionConfig(defaultDraft()))).not.toThrow();
    expect(store.list().length).toBe(1);
  });

  it('noms nettoyés et uniques', () => {
    expect(cleanName('  a   b  ')).toBe('a b');
    expect(cleanName('x'.repeat(200)).length).toBe(MAX_NAME_LENGTH);
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A'])).toBe('A (2)');
    expect(uniqueName('A (2)', ['A', 'A (2)'])).toBe('A (3)');
  });
});
