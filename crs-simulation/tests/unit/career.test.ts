/* =====================================================================================
 * Carrière (src/gameplay/career) : progression par chapitres, grades, disponibilité des missions,
 * rôles par grade, sanctions, sauvegarde et branchement sur 'mission:finished'.
 * ===================================================================================== */

import { describe, expect, it } from 'vitest';
import { createSave } from '@/core/save';
import { createTestContext } from '@/core/testing';
import {
  CAREER_SAVE_SECTION, CareerBook, CareerSystem, rankOpeningRole, rolesForRank, sanitizeProgress,
} from '@/gameplay/career';
import type { CareerApi, CareerOutcome } from '@/gameplay/career';
import { missionById } from '@/gameplay/missions/catalog';
import { CAREER_CHAPTERS } from '@/gameplay/missions/catalog/career';
import type { MissionResult } from '@/gameplay/missions/system';

const GRADE_TEXT: Record<string, string> = { A: 'A — Très bien', B: 'B — Bien', C: 'C — Assez bien', D: 'D — Insuffisant', E: 'E — Très insuffisant' };
const SCORE: Record<string, number> = { A: 90, B: 75, C: 60, D: 45, E: 20 };

function result(id: string, grade: keyof typeof GRADE_TEXT, success = true, extra: Partial<MissionResult> = {}): MissionResult {
  return {
    id, title: missionById(id)?.title ?? id, success, score: SCORE[grade]!, grade: GRADE_TEXT[grade]!,
    summary: success ? 'Mission accomplie.' : 'Mission échouée.', lines: [], ...extra,
  };
}

/** Réussit toutes les missions requises d'un chapitre avec la note donnée. */
function clearChapter(book: CareerBook, index: number, grade: keyof typeof GRADE_TEXT = 'B'): CareerOutcome[] {
  const c = CAREER_CHAPTERS[index]!;
  return c.missions.slice(0, c.requiredMissions).map((id) => book.record(result(id, grade)));
}

describe('carrière — progression', () => {
  it('commence à l’école, gardien stagiaire', () => {
    const book = new CareerBook(createSave({ storage: null }));
    expect(book.progress.chapter).toBe(0);
    expect(book.progress.rank).toBe('gardien_stagiaire');
    expect(book.chapters[0]!.status).toBe('current');
    expect(book.chapters[1]!.status).toBe('locked');
    expect(book.chapters[0]!.progressLabel).toBe('0 / 4 missions réussies (C exigée)');
  });

  it('termine un chapitre quand l’exigence est remplie et passe au suivant', () => {
    const book = new CareerBook(createSave({ storage: null }));
    const outs = clearChapter(book, 0, 'C');
    expect(outs[2]!.message).toMatch(/Encore 1 mission à réussir/);
    const last = outs[3]!;
    expect(last.chapterDone).toBe(0);
    expect(last.promoted).toBe(false); // l'école et la première ligne se font au même grade
    expect(book.progress.chapter).toBe(1);
    expect(book.progress.unlocked).toEqual(CAREER_CHAPTERS[0]!.unlocks);
    expect(book.chapters[0]!.status).toBe('done');
    expect(book.chapters[1]!.status).toBe('current');
  });

  it('promeut au grade du chapitre suivant', () => {
    const book = new CareerBook(createSave({ storage: null }));
    clearChapter(book, 0);
    const outs = clearChapter(book, 1);
    const last = outs[outs.length - 1]!;
    expect(last.promoted).toBe(true);
    expect(last.newRank).toBe('gardien');
    expect(last.message).toMatch(/Promotion : vous êtes nommé gardien de la paix/);
    expect(book.progress.rank).toBe('gardien');
    expect(book.progress.chapter).toBe(2);
  });

  it('exige la moyenne : des missions réussies mais notées C ne suffisent pas au chapitre 2', () => {
    const book = new CareerBook(createSave({ storage: null }));
    clearChapter(book, 0);
    clearChapter(book, 1);
    const outs = clearChapter(book, 2, 'C');
    expect(book.progress.chapter).toBe(2);
    expect(outs[outs.length - 1]!.message).toMatch(/Moyenne insuffisante/);
    // rejouer pour améliorer la note : la meilleure note compte
    const c2 = CAREER_CHAPTERS[2]!;
    for (const id of c2.missions.slice(0, 4)) book.record(result(id, 'A'));
    expect(book.progress.chapter).toBe(3);
    expect(book.progress.rank).toBe('brigadier_chef');
    const r = book.progress.results[c2.missions[0]!]!;
    expect(r.best).toBe('A');
    expect(r.plays).toBe(2);
  });

  it('une mission échouée ne compte pas, même bien notée', () => {
    const book = new CareerBook(createSave({ storage: null }));
    for (const id of CAREER_CHAPTERS[0]!.missions) book.record(result(id, 'A', false));
    expect(book.progress.chapter).toBe(0);
    expect(book.chapters[0]!.succeeded).toBe(0);
    expect(book.chapters[0]!.played).toBe(4);
  });

  it('mène la carrière jusqu’au bout du parcours principal', () => {
    const book = new CareerBook(createSave({ storage: null }));
    for (let i = 0; i <= 8; i++) clearChapter(book, i, 'A');
    expect(book.progress.chapter).toBe(8);
    expect(book.progress.rank).toBe('commandant');
    expect(book.chapters[8]!.status).toBe('done');
    expect(book.progress.unlocked).toContain(CAREER_CHAPTERS[8]!.unlocks[0]);
  });
});

describe('carrière — sauvegarde', () => {
  it('relit la progression écrite dans la section « carriere »', () => {
    const save = createSave({ storage: null });
    const a = new CareerBook(save);
    clearChapter(a, 0);
    clearChapter(a, 1);
    a.record(result(CAREER_CHAPTERS[2]!.missions[0]!, 'B'));
    const b = new CareerBook(save);
    expect(b.progress).toEqual(a.progress);
    expect(save.read<{ chapter: number } | null>(CAREER_SAVE_SECTION, null)?.chapter).toBe(2);
  });

  it('reset() efface la section et revient à l’école', () => {
    const save = createSave({ storage: null });
    const a = new CareerBook(save);
    clearChapter(a, 0);
    a.reset();
    expect(a.progress.chapter).toBe(0);
    expect(Object.keys(a.progress.results)).toHaveLength(0);
    expect(save.read(CAREER_SAVE_SECTION, null)).toBeNull();
    expect(new CareerBook(save).progress.chapter).toBe(0);
  });

  it('assainit une sauvegarde faussée', () => {
    expect(sanitizeProgress('n’importe quoi').chapter).toBe(0);
    const p = sanitizeProgress({
      chapter: 99, rank: 'commissaire', completed: [2, 2, 'x', 40],
      results: { 'ecole-01-tenir-la-ligne': { best: 'Z', plays: -3, success: 1 }, 'mission-inconnue': { best: 'A' } },
      sanctions: [{ kind: 'pendaison', reason: 'x' }, { kind: 'blame', reason: 'Faute', at: 5 }],
    });
    expect(p.chapter).toBe(8);
    expect(p.rank).toBe('commandant'); // le grade suit le chapitre, pas la valeur enregistrée
    expect(p.completed).toEqual([2, 0, 1, 3, 4, 5, 6, 7]);
    expect(p.results['ecole-01-tenir-la-ligne']).toEqual({ best: 'E', success: false, plays: 1, lastAt: 0 });
    expect(p.results['mission-inconnue']).toBeUndefined();
    expect(p.sanctions).toHaveLength(1);
    expect(p.sanctions[0]!.kind).toBe('blame');
  });
});

describe('carrière — missions ouvertes', () => {
  it('missions du chapitre courant et des précédents seulement', () => {
    const book = new CareerBook(createSave({ storage: null }));
    expect(book.isMissionAvailable('ecole-01-tenir-la-ligne')).toBe(true);
    const crs = book.missionStatus('crs-01-premier-samedi');
    expect(crs.available).toBe(false);
    expect(crs.chapter).toBe(1);
    expect(crs.reason).toMatch(/chapitre 1/);
    clearChapter(book, 0);
    expect(book.isMissionAvailable('crs-01-premier-samedi')).toBe(true);
    expect(book.isMissionAvailable('ecole-01-tenir-la-ligne')).toBe(true); // on peut rejouer
    expect(book.isMissionAvailable('crs-03-extincteur')).toBe(false);
  });

  it('détachements ouverts à la fin du chapitre qui les annonce', () => {
    const book = new CareerBook(createSave({ storage: null }));
    for (let i = 0; i <= 1; i++) clearChapter(book, i);
    expect(book.missionStatus('bravm-01-en-selle').reason).toMatch(/Détachement ouvert à la fin du chapitre 2/);
    clearChapter(book, 2);
    expect(book.isMissionAvailable('bravm-01-en-selle')).toBe(true);
    expect(book.isMissionAvailable('canon-01-dix-mille-litres')).toBe(true);
    expect(book.isMissionAvailable('drone-01-arrete-prefectoral')).toBe(false);
    expect(book.chapters[9]!.status).toBe('current');
    expect(book.chapters[11]!.status).toBe('locked');
    clearChapter(book, 3);
    expect(book.isMissionAvailable('drone-01-arrete-prefectoral')).toBe(true);
    expect(book.isMissionAvailable('centaure-01-quatorze-tonnes-et-demie')).toBe(true);
  });

  it('un détachement se termine indépendamment du parcours principal', () => {
    const book = new CareerBook(createSave({ storage: null }));
    for (let i = 0; i <= 2; i++) clearChapter(book, i);
    const outs = clearChapter(book, 9);
    expect(outs[outs.length - 1]!.chapterDone).toBe(9);
    expect(book.chapters[9]!.status).toBe('done');
    expect(book.progress.chapter).toBe(3);
    expect(book.progress.unlocked).toContain('Moto BRAV-M');
  });

  it('rôles civils : mission miroir jouée, ou trois missions sans miroir par chapitre terminé', () => {
    const book = new CareerBook(createSave({ storage: null }));
    const mirror = missionById('journaliste-05-trente-secondes-d-antenne')!;
    expect(mirror.mirrorOf).toBe('crs-04-le-pont-ne-passe-pas');
    expect(book.missionStatus(mirror.id).reason).toMatch(/mission miroir/);
    expect(book.isMissionAvailable('medecin-01-serum-physiologique')).toBe(false);
    expect(book.chapters[13]!.status).toBe('locked');
    clearChapter(book, 0);
    // trois missions civiles sans miroir s'ouvrent avec le premier chapitre terminé
    expect(book.isMissionAvailable('medecin-01-serum-physiologique')).toBe(true);
    expect(book.isMissionAvailable('medecin-03-trois-metres-cinquante')).toBe(true);
    expect(book.isMissionAvailable('medecin-05-neutre')).toBe(true);
    expect(book.isMissionAvailable('medecin-06-fouille')).toBe(false);
    expect(book.chapters[13]!.status).toBe('current');
    // jouer la mission miroir (même échouée) ouvre la mission civile
    book.record(result('crs-04-le-pont-ne-passe-pas', 'D', false));
    expect(book.isMissionAvailable(mirror.id)).toBe(true);
  });

  it('une mission hors carrière n’est jamais proposée', () => {
    const book = new CareerBook(createSave({ storage: null }));
    const st = book.missionStatus('mission-qui-n-existe-pas');
    expect(st.available).toBe(false);
    expect(st.chapter).toBe(-1);
  });
});

describe('carrière — rôles par grade', () => {
  it('ouvre les rôles avec les grades', () => {
    expect(rolesForRank('gardien_stagiaire')).toEqual(['crs', 'street_medic', 'secouriste', 'journaliste', 'manifestant']);
    const gardien = rolesForRank('gardien');
    for (const r of ['crs', 'bravm', 'telepilote', 'operateur_canon_eau', 'gendarme_centaure'] as const) expect(gardien).toContain(r);
    expect(gardien).not.toContain('chef_groupe');
    expect(rolesForRank('brigadier_chef')).toContain('chef_groupe');
    expect(rolesForRank('major')).not.toContain('commandant');
    expect(rolesForRank('capitaine')).toContain('commandant');
    expect(rolesForRank('commandant')).not.toContain('commissaire');
    expect(rankOpeningRole('chef_groupe')).toBe('brigadier_chef');
    expect(rankOpeningRole('journaliste')).toBeNull();
  });

  it('les rôles des missions de chaque chapitre sont ouverts au grade du chapitre', () => {
    for (const c of CAREER_CHAPTERS) {
      const roles = rolesForRank(c.rank);
      for (const id of c.missions) expect(roles, `${id} au chapitre ${c.index}`).toContain(missionById(id)!.role);
    }
  });
});

describe('carrière — sanctions', () => {
  it('blâme pour une bavure grave, rétrogradation pour une révocation', () => {
    const book = new CareerBook(createSave({ storage: null }));
    const def = missionById('cdt-11-l-echarpe') ?? missionById('ecole-01-tenir-la-ligne')!;
    const bavure = def.failures.find((f) => f.kind === 'bavure_grave');
    const revoc = def.failures.find((f) => f.kind === 'revocation');
    if (bavure) {
      const o = book.record(result(def.id, 'E', false, { summary: `Mission échouée au bout de 3 min : ${bavure.text}` }));
      expect(o.sanction?.kind).toBe('blame');
      expect(o.message).toMatch(/Blâme inscrit au dossier/);
    }
    if (revoc) {
      const o = book.record(result(def.id, 'E', false, { summary: `Mission échouée au bout de 3 min : ${revoc.text}` }));
      expect(o.sanction?.kind).toBe('retrogradation');
    }
    expect(bavure || revoc).toBeTruthy();
  });

  it('avertissement : emploi de la force irrégulier, ou échec noté E', () => {
    const book = new CareerBook(createSave({ storage: null }));
    const o1 = book.record(result('ecole-01-tenir-la-ligne', 'B', true, { lines: [{ label: 'Régularité de l’emploi de la force', value: '42 / 100' }] }));
    expect(o1.sanction?.kind).toBe('avertissement');
    const o2 = book.record(result('ecole-02-porter-le-bouclier', 'E', false));
    expect(o2.sanction?.kind).toBe('avertissement');
    const o3 = book.record(result('ecole-03-ecouter-les-sommations', 'D', false, { lines: [{ label: 'Régularité de l’emploi de la force', value: '95 / 100' }] }));
    expect(o3.sanction).toBeUndefined();
    expect(book.progress.sanctions).toHaveLength(2);
  });
});

describe('carrière — système', () => {
  it('enregistre les missions terminées en mode carrière seulement', async () => {
    const t = createTestContext({ systems: [new CareerSystem()] });
    await t.ready;
    const career = t.ctx.service<CareerApi>('career')!;
    expect(career).toBeTruthy();
    const updates: unknown[] = [];
    t.ctx.events.onAny('career:updated', (p) => updates.push(p));

    await t.start({ mode: 'test' });
    t.ctx.events.emitAny('mission:finished', result('ecole-01-tenir-la-ligne', 'A'));
    expect(career.progress.results['ecole-01-tenir-la-ligne']).toBeUndefined();
    expect(career.last).toBeNull();

    await t.start({ mode: 'carriere', missionId: 'ecole-01-tenir-la-ligne' });
    t.ctx.events.emitAny('mission:finished', result('ecole-01-tenir-la-ligne', 'A'));
    expect(career.progress.results['ecole-01-tenir-la-ligne']?.best).toBe('A');
    expect(career.last?.missionId).toBe('ecole-01-tenir-la-ligne');
    expect(career.last?.message).toMatch(/Encore 3 missions à réussir/);
    expect(updates).toHaveLength(1);
    // la progression est écrite dans la sauvegarde du contexte
    expect(t.ctx.save.read<{ results: Record<string, unknown> }>('carriere', { results: {} }).results['ecole-01-tenir-la-ligne']).toBeTruthy();
    // charge utile invalide : ignorée
    t.ctx.events.emitAny('mission:finished', { id: 42 });
    expect(updates).toHaveLength(1);

    // le bilan affiché au compte rendu est oublié à la session suivante ; la progression reste
    await t.start({ mode: 'carriere' });
    expect(career.last).toBeNull();
    expect(career.progress.results['ecole-01-tenir-la-ligne']).toBeTruthy();
    expect(career.availableRoles()).toContain('crs');
    career.reset();
    expect(career.progress.results['ecole-01-tenir-la-ligne']).toBeUndefined();
    expect(updates[updates.length - 1]).toBeNull();
  });
});
