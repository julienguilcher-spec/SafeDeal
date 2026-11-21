/* =====================================================================================
 * Historique des parties (src/gameplay/history) : inscription à la fin de chaque partie, chiffres clés,
 * cumuls, plafond de la liste, lecture d'une section abîmée, persistance par ctx.save, configuration
 * à rejouer ; copie de secours de la sauvegarde (application de bureau, src/core/save.ts).
 * ===================================================================================== */

import { describe, expect, it } from 'vitest';
import type { ForceReport, SessionConfig } from '@/core/contracts';
import { SAVE_KEY, createSave } from '@/core/save';
import type { SaveMirror, StorageLike } from '@/core/save';
import { createTestContext } from '@/core/testing';
import { CareerSystem } from '@/gameplay/career';
import {
  HISTORY_MAX, HISTORY_SAVE_SECTION, HistoryBook, HistorySystem, emptyFigures, sanitizeHistory,
} from '@/gameplay/history';
import type { HistoryApi, HistoryEntry } from '@/gameplay/history';
import type { MissionResult } from '@/gameplay/missions/system';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class MemoryMirror implements SaveMirror {
  json: string | null = null;
  writes = 0;
  load(): string | null {
    return this.json;
  }
  store(json: string): void {
    this.json = json;
    this.writes++;
  }
}

function entry(n: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  const figures = { ...emptyFigures(), arrests: 2, injured: 1, forceUses: 3, sommations: 1 };
  return {
    id: 'p' + n, startedAt: 1000 * n, endedAt: 1000 * n + 600, playSeconds: 600, simSeconds: 620, mode: 'libre', role: 'crs',
    rank: 'gardien', place: 'Place de la République', timeOfDay: 14, weather: 'clair', crowdSize: 800, missionId: '',
    missionTitle: '', journee: '', outcome: 'terminee', debrief: true, result: null, figures, career: null,
    config: { mode: 'libre', missionId: '', role: 'crs', rank: 'gardien', place: 'Place de la République', timeOfDay: 14, weather: 'clair', crowdSize: 800, tension: 0.3, volatility: 0.2, duration: 'courte', seed: n },
    ...extra,
  };
}

function missionResult(success: boolean, summary = success ? 'Mission accomplie en 3 min.' : 'Mission échouée au bout de 3 min : blessé.'): MissionResult {
  return { id: 'ecole-01-tenir-la-ligne', title: 'Tenir la ligne', success, score: success ? 82 : 30, grade: success ? 'B — Bien' : 'E — Très insuffisant', summary, lines: [] };
}

describe('historique — registre', () => {
  it('inscrit les parties, les liste de la plus récente à la plus ancienne et tient les cumuls', () => {
    const book = new HistoryBook(createSave({ storage: null }));
    expect(book.entries).toEqual([]);
    book.add(entry(1));
    book.add(entry(2, { missionId: 'm', missionTitle: 'Mission', outcome: 'reussie', role: 'commandant', rank: 'commandant' }));
    book.add(entry(3, { missionId: 'm', outcome: 'echouee', career: { grade: 'C', success: false, promoted: false, message: '', sanction: 'Blâme : faute' } }));
    expect(book.entries.map((e) => e.id)).toEqual(['p3', 'p2', 'p1']);
    const t = book.totals;
    expect(t.sessions).toBe(3);
    expect(t.playSeconds).toBe(1800);
    expect(t.missions).toBe(2);
    expect(t.missionsSucceeded).toBe(1);
    expect(t.arrests).toBe(6);
    expect(t.forceUses).toBe(9);
    expect(t.sanctions).toBe(1);
    expect(t.firstAt).toBe(1000);
    expect(t.lastAt).toBe(3600);
    expect(t.byRole).toEqual({ crs: 2, commandant: 1 });
  });

  it('rend unique un identifiant déjà pris', () => {
    const book = new HistoryBook(createSave({ storage: null }));
    book.add(entry(1));
    const again = book.add(entry(1));
    expect(again.id).toBe('p1-2');
    expect(book.entries).toHaveLength(2);
  });

  it(`garde les ${HISTORY_MAX} dernières parties, mais les cumuls portent sur toutes`, () => {
    const book = new HistoryBook(createSave({ storage: null }));
    for (let i = 1; i <= HISTORY_MAX + 15; i++) book.add(entry(i));
    const list = book.entries;
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0]!.id).toBe('p' + (HISTORY_MAX + 15));
    expect(list[list.length - 1]!.id).toBe('p16');
    expect(book.totals.sessions).toBe(HISTORY_MAX + 15);
    expect(book.totals.arrests).toBe(2 * (HISTORY_MAX + 15));
  });

  it('répare une section abîmée sans perdre les parties lisibles', () => {
    const file = sanitizeHistory({
      entries: [entry(1), { id: 'x' }, 'n’importe quoi', { ...entry(2), figures: { arrests: -4, injured: 'trois' }, outcome: '???' }, entry(1)],
      totals: 'perdu',
    });
    expect(file.entries.map((e) => e.id)).toEqual(['p1', 'p2']);
    expect(file.entries[1]!.figures.arrests).toBe(0);
    expect(file.entries[1]!.outcome).toBe('quittee');
    expect(file.totals.sessions).toBe(2); // cumuls recalculés sur la liste
    expect(sanitizeHistory(null).entries).toEqual([]);
  });

  it('efface l’historique et ses cumuls', () => {
    const save = createSave({ storage: null });
    const book = new HistoryBook(save);
    book.add(entry(1));
    save.write('carriere', { chapter: 2 });
    book.clear();
    expect(book.entries).toEqual([]);
    expect(book.totals.sessions).toBe(0);
    expect(save.read('carriere', null)).toEqual({ chapter: 2 }); // le reste de la sauvegarde est intact
  });

  it('survit à une fermeture : la section est relue depuis le stockage', () => {
    const storage = new MemoryStorage();
    new HistoryBook(createSave({ storage })).add(entry(7));
    const reopened = new HistoryBook(createSave({ storage }));
    expect(reopened.entries.map((e) => e.id)).toEqual(['p7']);
    expect(reopened.totals.sessions).toBe(1);
    expect(reopened.replayConfig('p7')?.seed).toBe(7);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).sections[HISTORY_SAVE_SECTION].entries).toHaveLength(1);
  });
});

describe('historique — système', () => {
  async function setup(now = { t: 1_700_000_000_000 }): Promise<{ t: ReturnType<typeof createTestContext>; api: HistoryApi; now: { t: number } }> {
    const t = createTestContext({ systems: [new CareerSystem(), new HistorySystem({ now: () => now.t })] });
    await t.ready;
    const api = t.ctx.service<HistoryApi>('history')!;
    expect(api).toBeTruthy();
    return { t, api, now };
  }

  it('inscrit une partie libre à sa fin, avec ses chiffres clés et sa configuration', async () => {
    const { t, api, now } = await setup();
    const updates: unknown[] = [];
    t.ctx.events.onAny('history:updated', (p) => updates.push(p));
    const cfg = await t.start({ mode: 'libre', role: 'crs', place: '', crowdSize: 500, seed: 42, extra: { journee: false, scenario: 1 } });
    expect(api.willRecord()).toBe(false); // pas encore assez jouée
    now.t += 90_000;
    t.step(15);
    expect(api.willRecord()).toBe(true);
    const ev = t.ctx.events;
    ev.emit('person:arrested', { id: 5, byId: 1, lawful: true });
    ev.emit('person:arrested', { id: 6, byId: 1, lawful: false });
    ev.emit('law:sommation', { stage: 1 as never, byId: 1, x: 0, z: 0, text: '' });
    ev.emit('law:force', { report: { byId: 1, verdict: { kind: 'disproportionne', severity: 2 } } as unknown as ForceReport });
    ev.emit('fire:started', { x: 0, z: 0, targetKind: 'ground', targetId: 0, sourceId: 0 });
    ev.emit('fire:started', { x: 0, z: 0, targetKind: 'person', targetId: 3, sourceId: 0 });
    ev.emit('person:down', { id: 9, injury: 'serious', sourceId: 0 });
    ev.emit('person:down', { id: 9, injury: 'critical', sourceId: 0 });
    ev.emit('person:down', { id: 10, injury: 'light', sourceId: 0 });
    t.ctx.session.end(true);

    expect(updates).toHaveLength(1);
    const list = api.entries;
    expect(list).toHaveLength(1);
    const e = list[0]!;
    expect(e.mode).toBe('libre');
    expect(e.role).toBe('crs');
    expect(e.outcome).toBe('terminee');
    expect(e.debrief).toBe(true);
    expect(e.startedAt).toBe(1_700_000_000_000);
    expect(e.endedAt).toBe(1_700_000_090_000);
    expect(e.playSeconds).toBe(90);
    expect(e.simSeconds).toBeGreaterThanOrEqual(15);
    expect(e.figures.arrests).toBe(2);
    expect(e.figures.sommations).toBe(1);
    expect(e.figures.forceUses).toBe(1);
    expect(e.figures.forceFaults).toBe(1);
    expect(e.figures.fires).toBe(1);
    expect(e.figures.injured).toBe(1);
    expect(e.config?.seed).toBe(42);
    expect(e.config?.x).toBe(cfg.x);
    expect(api.last?.id).toBe(e.id);
    expect(api.totals.sessions).toBe(1);
    expect(api.totals.arrests).toBe(2);

    // rejouer : la configuration gardée relance la même partie
    const replay = api.replayConfig(e.id)!;
    expect(replay).toEqual(e.config);
    replay.seed = 1; // une copie : la modifier ne touche pas l'historique
    expect(api.replayConfig(e.id)!.seed).toBe(42);
    t.ctx.session.end(false);
    await t.ctx.session.start(api.replayConfig(e.id)!);
    expect(t.ctx.session.config?.seed).toBe(42);
    expect(t.ctx.session.config?.mode).toBe('libre');
  });

  it('n’inscrit pas une partie annulée aussitôt, ni les événements hors partie', async () => {
    const { t, api } = await setup();
    t.ctx.events.emit('person:arrested', { id: 5, byId: 1, lawful: true }); // au menu : ignoré
    await t.start({ mode: 'libre' });
    t.step(3);
    expect(api.willRecord()).toBe(false);
    t.ctx.session.end(false);
    expect(api.entries).toHaveLength(0);
    expect(api.totals.sessions).toBe(0);
  });

  it('inscrit la partie remplacée par une nouvelle, puis la suivante', async () => {
    const { t, api } = await setup();
    await t.start({ mode: 'libre', seed: 1 });
    t.step(12);
    t.ctx.events.emit('person:arrested', { id: 5, byId: 1, lawful: true });
    await t.start({ mode: 'monde_ouvert', seed: 2 }); // la première se termine d'elle-même
    expect(api.entries).toHaveLength(1);
    expect(api.entries[0]!.outcome).toBe('quittee');
    expect(api.entries[0]!.figures.arrests).toBe(1);
    t.step(12);
    t.ctx.session.end(false);
    expect(api.entries.map((e) => e.mode)).toEqual(['monde_ouvert', 'libre']);
    expect(api.entries[0]!.figures.arrests).toBe(0); // compteurs remis à zéro entre deux parties
  });

  it('retient le résultat de mission et le bilan de carrière', async () => {
    const { t, api } = await setup();
    await t.start({ mode: 'carriere', missionId: 'ecole-01-tenir-la-ligne' });
    t.step(12);
    t.ctx.events.emitAny('mission:finished', missionResult(true));
    t.ctx.session.end(true);
    const e = api.entries[0]!;
    expect(e.outcome).toBe('reussie');
    expect(e.missionId).toBe('ecole-01-tenir-la-ligne');
    expect(e.missionTitle).toBe('Tenir la ligne');
    expect(e.result).toEqual({ success: true, score: 82, grade: 'B — Bien', summary: 'Mission accomplie en 3 min.' });
    expect(e.career?.grade).toBe('B');
    expect(e.career?.success).toBe(true);
    expect(api.totals.missions).toBe(1);
    expect(api.totals.missionsSucceeded).toBe(1);

    // mission échouée, puis mission abandonnée (résultat émis pendant la fermeture de la session)
    await t.start({ mode: 'libre', missionId: 'ecole-01-tenir-la-ligne' });
    t.step(12);
    t.ctx.events.emitAny('mission:finished', missionResult(false));
    t.ctx.session.end(true);
    expect(api.entries[0]!.outcome).toBe('echouee');
    expect(api.entries[0]!.career).toBeNull(); // hors mode carrière

    await t.start({ mode: 'libre', missionId: 'ecole-01-tenir-la-ligne' });
    t.step(12);
    const off = t.ctx.events.on('session:ended', () => {
      t.ctx.events.emitAny('mission:finished', missionResult(false, 'Mission interrompue au bout de 1 min.'));
    });
    t.ctx.session.end(false);
    off();
    expect(api.entries[0]!.outcome).toBe('interrompue');
    expect(api.totals.missions).toBe(3);
    expect(api.totals.missionsSucceeded).toBe(1);
  });

  it('passe par ctx.save : l’export puis l’import dans une autre sauvegarde retrouvent l’historique', async () => {
    const { t, api } = await setup();
    await t.start({ mode: 'libre', seed: 9 });
    t.step(12);
    t.ctx.session.end(false);
    const json = t.ctx.save.exportAll();
    const storage = new MemoryStorage();
    expect(createSave({ storage }).importAll(json)).toBe(true);
    const book = new HistoryBook(createSave({ storage }));
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]!.id).toBe(api.entries[0]!.id);
    expect(book.replayConfig(book.entries[0]!.id)?.seed).toBe(9);
    // effacement depuis le service
    api.clear();
    expect(api.entries).toHaveLength(0);
    expect(api.last).toBeNull();
  });

  it('ne garde pas une configuration démesurée pour « Rejouer »', async () => {
    const { t, api } = await setup();
    await t.start({ mode: 'libre', extra: { gros: 'x'.repeat(20000) } } as Partial<SessionConfig>);
    t.step(12);
    t.ctx.session.end(false);
    expect(api.entries[0]!.config).toBeNull();
    expect(api.replayConfig(api.entries[0]!.id)).toBeNull();
  });
});

describe('sauvegarde — copie de secours (application de bureau)', () => {
  it('recopie chaque écriture, horodatée, dans la copie de secours', () => {
    const storage = new MemoryStorage();
    const mirror = new MemoryMirror();
    let clock = 5000;
    const save = createSave({ storage, mirror, now: () => clock });
    save.write('carriere', { chapter: 1 });
    clock = 4000; // horloge qui recule : l'horodatage reste croissant
    save.write('carriere', { chapter: 2 });
    const file = JSON.parse(mirror.json!);
    expect(file.sections.carriere).toEqual({ chapter: 2 });
    expect(file.savedAt).toBe(5001);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).savedAt).toBe(5001);
    expect(save.persistent).toBe(true);
  });

  it('rétablit tout depuis la copie quand le stockage du navigateur a été vidé', () => {
    const mirror = new MemoryMirror();
    new HistoryBook(createSave({ storage: new MemoryStorage(), mirror })).add(entry(3));
    const empty = new MemoryStorage();
    const save = createSave({ storage: empty, mirror });
    expect(new HistoryBook(save).entries.map((e) => e.id)).toEqual(['p3']);
    expect(empty.getItem(SAVE_KEY)).not.toBeNull(); // le stockage reprend la copie
  });

  it('retient la plus récente des deux copies', () => {
    const storage = new MemoryStorage();
    const mirror = new MemoryMirror();
    createSave({ storage, mirror, now: () => 100 }).write('s', { v: 'ancien' });
    // la copie de secours a reçu une écriture plus récente que le stockage (fermeture brutale)
    const newer = JSON.parse(mirror.json!);
    newer.savedAt = 200;
    newer.sections.s = { v: 'récent' };
    mirror.json = JSON.stringify(newer);
    expect(createSave({ storage, mirror }).read('s', null)).toEqual({ v: 'récent' });
    // et dans l'autre sens : un stockage plus récent l'emporte et met la copie à jour
    const storage2 = new MemoryStorage();
    storage2.setItem(SAVE_KEY, JSON.stringify({ format: 'crs-simulation-france', version: 1, savedAt: 300, sections: { s: { v: 'local' } } }));
    expect(createSave({ storage: storage2, mirror }).read('s', null)).toEqual({ v: 'local' });
    expect(JSON.parse(mirror.json!).sections.s).toEqual({ v: 'local' });
  });

  it('met à l’abri une sauvegarde existante dès le premier lancement avec la copie', () => {
    const storage = new MemoryStorage();
    createSave({ storage }).write('carriere', { chapter: 4 }); // version sans copie de secours
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).savedAt).toBeUndefined(); // navigateur : format inchangé
    const mirror = new MemoryMirror();
    createSave({ storage, mirror });
    expect(JSON.parse(mirror.json!).sections.carriere).toEqual({ chapter: 4 });
  });

  it('vide aussi la copie quand toute la sauvegarde est effacée', () => {
    const storage = new MemoryStorage();
    const mirror = new MemoryMirror();
    const save = createSave({ storage, mirror });
    save.write('carriere', { chapter: 4 });
    save.wipe();
    expect(JSON.parse(mirror.json!).sections).toEqual({});
    expect(createSave({ storage, mirror }).read('carriere', null)).toBeNull();
  });

  it('fonctionne avec la seule copie quand le navigateur n’a pas de stockage, et survit à une copie illisible ou en panne', () => {
    const mirror = new MemoryMirror();
    createSave({ storage: null, mirror }).write('a', 1);
    expect(createSave({ storage: null, mirror }).read('a', 0)).toBe(1);
    mirror.json = '{pas du json';
    expect(createSave({ storage: null, mirror }).read('a', 0)).toBe(0);
    const broken: SaveMirror = { load: () => { throw new Error('panne'); }, store: () => { throw new Error('panne'); } };
    const save = createSave({ storage: new MemoryStorage(), mirror: broken });
    save.write('b', 2);
    expect(save.read('b', 0)).toBe(2);
    expect(save.persistent).toBe(true); // le stockage du navigateur suffit
  });
});
