/* =====================================================================================
 * HISTORIQUE — registre des parties : lecture tolérante, ajout, plafond, cumuls, effacement.
 *
 * Logique pure : ne dépend que de SaveApi. Le registre relit la section « historique » à chaque
 * lecture (aucune copie gardée en mémoire) : une sauvegarde importée ou effacée depuis les paramètres
 * est vue aussitôt. Une section abîmée (valeurs manquantes, mauvais types) est réparée à la lecture :
 * les parties illisibles sont écartées, les champs manquants prennent une valeur neutre.
 * ===================================================================================== */

import type { SaveApi, SessionConfig } from '@/core/contracts';
import { HISTORY_MAX, HISTORY_MAX_CONFIG_CHARS, HISTORY_SAVE_SECTION } from './api';
import type {
  HistoryCareer, HistoryEntry, HistoryFigures, HistoryFile, HistoryMissionResult, HistoryOutcome, HistoryTotals,
} from './api';

const OUTCOMES: readonly HistoryOutcome[] = ['reussie', 'echouee', 'interrompue', 'terminee', 'quittee'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Compteur : nombre fini, positif ou nul. */
function count(v: unknown): number {
  return Math.max(0, num(v, 0));
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function emptyFigures(): HistoryFigures {
  return {
    arrests: 0, injured: 0, forceUses: 0, forceFaults: 0, playerForceUses: 0, sommations: 0, fires: 0, firesOut: 0,
    treated: 0, crowd: 0, dispersed: 0, incidents: 0, incidentsTreated: 0, lawScore: null,
  };
}

export function emptyTotals(): HistoryTotals {
  return {
    sessions: 0, playSeconds: 0, simSeconds: 0, missions: 0, missionsSucceeded: 0, arrests: 0, injured: 0, forceUses: 0,
    forceFaults: 0, sommations: 0, fires: 0, firesOut: 0, treated: 0, promotions: 0, sanctions: 0, firstAt: 0, lastAt: 0,
    byRole: {},
  };
}

/** Configuration gardée pour « Rejouer » : copie si elle est lisible et pas trop volumineuse, sinon null. */
export function keepConfig(config: unknown): SessionConfig | null {
  if (!isRecord(config) || typeof config.role !== 'string' || typeof config.mode !== 'string') return null;
  try {
    const json = JSON.stringify(config);
    if (json.length > HISTORY_MAX_CONFIG_CHARS) return null;
    return JSON.parse(json) as SessionConfig;
  } catch {
    return null;
  }
}

function sanitizeFigures(raw: unknown): HistoryFigures {
  const f = emptyFigures();
  if (!isRecord(raw)) return f;
  for (const k of Object.keys(f) as (keyof HistoryFigures)[]) {
    if (k === 'lawScore') continue;
    (f as unknown as Record<string, number>)[k] = count(raw[k]);
  }
  const law = raw.lawScore;
  f.lawScore = typeof law === 'number' && Number.isFinite(law) ? Math.max(0, Math.min(100, law)) : null;
  return f;
}

function sanitizeResult(raw: unknown): HistoryMissionResult | null {
  if (!isRecord(raw) || typeof raw.success !== 'boolean') return null;
  return { success: raw.success, score: Math.max(0, Math.min(100, num(raw.score))), grade: str(raw.grade), summary: str(raw.summary) };
}

function sanitizeCareer(raw: unknown): HistoryCareer | null {
  if (!isRecord(raw) || typeof raw.grade !== 'string') return null;
  const c: HistoryCareer = { grade: raw.grade, success: raw.success === true, promoted: raw.promoted === true, message: str(raw.message) };
  if (typeof raw.newRank === 'string') c.newRank = raw.newRank as HistoryCareer['newRank'];
  if (typeof raw.sanction === 'string' && raw.sanction) c.sanction = raw.sanction;
  return c;
}

/** Une partie lue dans la sauvegarde, réparée ; null si elle est inutilisable. */
export function sanitizeEntry(raw: unknown): HistoryEntry | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const endedAt = num(raw.endedAt, 0);
  if (!id || endedAt <= 0 || typeof raw.role !== 'string' || typeof raw.mode !== 'string') return null;
  const outcome = OUTCOMES.indexOf(raw.outcome as HistoryOutcome) >= 0 ? (raw.outcome as HistoryOutcome) : 'quittee';
  return {
    id,
    startedAt: num(raw.startedAt, endedAt),
    endedAt,
    playSeconds: count(raw.playSeconds),
    simSeconds: count(raw.simSeconds),
    mode: raw.mode as HistoryEntry['mode'],
    role: raw.role as HistoryEntry['role'],
    rank: typeof raw.rank === 'string' ? (raw.rank as HistoryEntry['rank']) : null,
    place: str(raw.place),
    timeOfDay: num(raw.timeOfDay, 14),
    weather: str(raw.weather, 'clair') as HistoryEntry['weather'],
    crowdSize: count(raw.crowdSize),
    missionId: str(raw.missionId),
    missionTitle: str(raw.missionTitle),
    journee: str(raw.journee),
    outcome,
    debrief: raw.debrief === true,
    result: sanitizeResult(raw.result),
    figures: sanitizeFigures(raw.figures),
    career: sanitizeCareer(raw.career),
    config: keepConfig(raw.config),
  };
}

/** Ajoute une partie aux cumuls (en place). */
export function addToTotals(t: HistoryTotals, e: HistoryEntry): HistoryTotals {
  const f = e.figures;
  t.sessions++;
  t.playSeconds += e.playSeconds;
  t.simSeconds += e.simSeconds;
  if (e.missionId) {
    t.missions++;
    if (e.outcome === 'reussie') t.missionsSucceeded++;
  }
  t.arrests += f.arrests;
  t.injured += f.injured;
  t.forceUses += f.forceUses;
  t.forceFaults += f.forceFaults;
  t.sommations += f.sommations;
  t.fires += f.fires;
  t.firesOut += f.firesOut;
  t.treated += f.treated;
  if (e.career?.promoted) t.promotions++;
  if (e.career?.sanction) t.sanctions++;
  if (t.firstAt === 0 || e.startedAt < t.firstAt) t.firstAt = e.startedAt;
  if (e.endedAt > t.lastAt) t.lastAt = e.endedAt;
  t.byRole[e.role] = (t.byRole[e.role] ?? 0) + 1;
  return t;
}

function sanitizeTotals(raw: unknown, entries: readonly HistoryEntry[]): HistoryTotals {
  if (!isRecord(raw)) {
    // cumuls perdus : recalculés sur les parties encore listées
    const t = emptyTotals();
    for (const e of entries) addToTotals(t, e);
    return t;
  }
  const t = emptyTotals();
  for (const k of Object.keys(t) as (keyof HistoryTotals)[]) {
    if (k === 'byRole') continue;
    (t as unknown as Record<string, number>)[k] = count(raw[k]);
  }
  if (isRecord(raw.byRole)) {
    for (const role of Object.keys(raw.byRole)) {
      const n = count(raw.byRole[role]);
      if (n > 0) t.byRole[role as keyof HistoryTotals['byRole']] = n;
    }
  }
  // jamais moins que ce que la liste montre (cumuls d'une version antérieure, ou retouchés)
  if (t.sessions < entries.length) {
    const fresh = emptyTotals();
    for (const e of entries) addToTotals(fresh, e);
    return fresh;
  }
  return t;
}

/** Section « historique » lue et réparée. */
export function sanitizeHistory(raw: unknown): HistoryFile {
  const file: HistoryFile = { v: 1, entries: [], totals: emptyTotals() };
  if (!isRecord(raw)) return file;
  const seen = new Set<string>();
  if (Array.isArray(raw.entries)) {
    for (const it of raw.entries) {
      const e = sanitizeEntry(it);
      if (!e || seen.has(e.id)) continue;
      seen.add(e.id);
      file.entries.push(e);
    }
  }
  file.entries.sort((a, b) => a.endedAt - b.endedAt);
  if (file.entries.length > HISTORY_MAX) file.entries.splice(0, file.entries.length - HISTORY_MAX);
  file.totals = sanitizeTotals(raw.totals, file.entries);
  return file;
}

export class HistoryBook {
  constructor(private readonly save: SaveApi) {}

  /** Section lue et réparée (copie : la modifier ne change pas la sauvegarde). */
  read(): HistoryFile {
    return sanitizeHistory(this.save.read<unknown>(HISTORY_SAVE_SECTION, null));
  }

  /** Parties, de la plus récente à la plus ancienne. */
  get entries(): HistoryEntry[] {
    return this.read().entries.reverse();
  }

  get totals(): HistoryTotals {
    return this.read().totals;
  }

  get(id: string): HistoryEntry | null {
    for (const e of this.read().entries) if (e.id === id) return e;
    return null;
  }

  /** Inscrit une partie (identifiant rendu unique), met les cumuls à jour, retire les plus anciennes au-delà du plafond. */
  add(entry: HistoryEntry): HistoryEntry {
    const file = this.read();
    const clean = sanitizeEntry(entry);
    if (!clean) throw new Error('[historique] partie invalide');
    let id = clean.id;
    for (let n = 2; file.entries.some((e) => e.id === id); n++) id = `${clean.id}-${n}`;
    clean.id = id;
    file.entries.push(clean);
    file.entries.sort((a, b) => a.endedAt - b.endedAt);
    if (file.entries.length > HISTORY_MAX) file.entries.splice(0, file.entries.length - HISTORY_MAX);
    addToTotals(file.totals, clean);
    this.save.write(HISTORY_SAVE_SECTION, file);
    return clean;
  }

  /** Configuration à relancer (copie), ou null. */
  replayConfig(id: string): SessionConfig | null {
    const e = this.get(id);
    return e && e.config ? keepConfig(e.config) : null;
  }

  clear(): void {
    this.save.remove(HISTORY_SAVE_SECTION);
  }
}
