/* =====================================================================================
 * Page d'accueil — scénarios enregistrés et dernière configuration lancée.
 * Rangés dans la section « scenarios » de ctx.save (ScenariosFile). Logique pure : ne dépend que de SaveApi.
 * ===================================================================================== */

import type { SaveApi, SessionConfig } from '@/core/contracts';
import { SCENARIOS_SECTION } from '../core/api';
import type { SavedScenario, ScenariosFile } from '../core/api';

/** Nombre maximal de scénarios conservés (les plus anciens sont retirés au-delà). */
export const MAX_SCENARIOS = 40;
export const MAX_NAME_LENGTH = 60;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isConfig(v: unknown): v is SessionConfig {
  return isRecord(v) && typeof v.role === 'string' && typeof v.mode === 'string';
}

/** Nettoie un nom saisi : espaces superflus retirés, longueur bornée ; '' si rien d'utilisable. */
export function cleanName(name: string): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export class ScenarioStore {
  constructor(private readonly save: SaveApi, private readonly now: () => number = () => Date.now()) {}

  /** Lit la section, en écartant tout ce qui est mal formé. */
  private read(): ScenariosFile {
    const raw = this.save.read<unknown>(SCENARIOS_SECTION, null);
    const file: ScenariosFile = { v: 1, last: null, items: [] };
    if (!isRecord(raw)) return file;
    if (isConfig(raw.last)) file.last = raw.last;
    if (Array.isArray(raw.items)) {
      const seen = new Set<string>();
      for (const it of raw.items) {
        if (!isRecord(it) || typeof it.id !== 'string' || !it.id || seen.has(it.id) || !isConfig(it.config)) continue;
        seen.add(it.id);
        file.items.push({
          id: it.id,
          name: cleanName(typeof it.name === 'string' ? it.name : '') || 'Scénario sans nom',
          savedAt: typeof it.savedAt === 'number' && Number.isFinite(it.savedAt) ? it.savedAt : 0,
          config: it.config,
        });
      }
    }
    return file;
  }

  private write(file: ScenariosFile): void {
    this.save.write(SCENARIOS_SECTION, file);
  }

  /** Scénarios enregistrés, du plus récent au plus ancien. */
  list(): SavedScenario[] {
    return this.read().items.sort((a, b) => b.savedAt - a.savedAt);
  }

  get(id: string): SavedScenario | null {
    for (const it of this.read().items) if (it.id === id) return it;
    return null;
  }

  /** Enregistre un scénario sous un nom (rendu unique : « Nom (2) »). Retourne l'entrée créée. */
  add(name: string, config: SessionConfig): SavedScenario {
    const file = this.read();
    const base = cleanName(name) || 'Scénario sans nom';
    const entry: SavedScenario = {
      id: this.newId(file),
      name: uniqueName(base, file.items.map((i) => i.name)),
      savedAt: this.now(),
      config,
    };
    file.items.push(entry);
    if (file.items.length > MAX_SCENARIOS) {
      file.items.sort((a, b) => b.savedAt - a.savedAt);
      file.items.length = MAX_SCENARIOS;
    }
    this.write(file);
    return entry;
  }

  /** Renomme un scénario. false si l'identifiant est inconnu ou le nom vide. */
  rename(id: string, name: string): boolean {
    const file = this.read();
    const next = cleanName(name);
    if (!next) return false;
    for (const it of file.items) {
      if (it.id !== id) continue;
      if (it.name === next) return true;
      it.name = uniqueName(next, file.items.filter((i) => i.id !== id).map((i) => i.name));
      this.write(file);
      return true;
    }
    return false;
  }

  remove(id: string): boolean {
    const file = this.read();
    const before = file.items.length;
    file.items = file.items.filter((i) => i.id !== id);
    if (file.items.length === before) return false;
    this.write(file);
    return true;
  }

  /** Dernière configuration lancée (bouton « Continuer »), ou null. */
  last(): SessionConfig | null {
    return this.read().last;
  }

  setLast(config: SessionConfig): void {
    const file = this.read();
    file.last = config;
    this.write(file);
  }

  private newId(file: ScenariosFile): string {
    const stamp = Math.floor(this.now()).toString(36);
    let n = file.items.length + 1;
    let id = `sc-${stamp}-${n}`;
    while (file.items.some((i) => i.id === id)) id = `sc-${stamp}-${++n}`;
    return id;
  }
}

/** « Nom », puis « Nom (2) », « Nom (3) »… tant que le nom est pris. */
export function uniqueName(name: string, taken: readonly string[]): string {
  if (taken.indexOf(name) < 0) return name;
  const root = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root} (${n})`;
    if (taken.indexOf(candidate) < 0) return candidate;
  }
  return `${root} (${taken.length + 1})`;
}
