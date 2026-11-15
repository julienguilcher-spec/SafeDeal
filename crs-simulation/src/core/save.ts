/* =====================================================================================
 * Sauvegarde : sections JSON nommées, rangées sous une seule clé versionnée de localStorage.
 *
 *   - repli automatique en mémoire sous Node, en navigation privée, dans une iframe sans accès
 *     au stockage, ou si le quota est dépassé ;
 *   - aucune méthode ne lève d'exception : une sauvegarde illisible est ignorée (et signalée) ;
 *   - exportAll() / importAll() : sauvegarde complète en JSON (pour la copier d'un appareil à l'autre) ;
 *   - les valeurs lues et écrites sont des copies : modifier un objet lu ne modifie pas la sauvegarde.
 * ===================================================================================== */

import type { SaveApi } from './contracts';

/** Version du schéma de sauvegarde (à incrémenter en cas de changement incompatible). */
export const SAVE_VERSION = 1;
/** Clé de stockage (la version en fait partie : une version future ne lira pas une ancienne clé par erreur). */
export const SAVE_KEY = `crs-simulation-france.save.v${SAVE_VERSION}`;
/** Marqueur de format des exports. */
export const SAVE_FORMAT = 'crs-simulation-france';

/** Sous-ensemble de l'interface Storage utilisé par la sauvegarde. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveOptions {
  /** Clé de stockage (par défaut SAVE_KEY). */
  key?: string;
  /** Stockage à utiliser ; `null` force la mémoire ; absent = localStorage s'il est utilisable. */
  storage?: StorageLike | null;
}

/** SaveApi du contrat, plus un indicateur de persistance. */
export interface SaveStore extends SaveApi {
  /** true si les écritures atteignent un stockage durable ; false si tout reste en mémoire. */
  readonly persistent: boolean;
  /** Noms des sections présentes. */
  sections(): string[];
}

interface SaveFile {
  format: string;
  version: number;
  sections: Record<string, unknown>;
}

/** localStorage s'il existe et fonctionne réellement (écriture d'essai), sinon null. */
export function detectStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    const s = g.localStorage;
    if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function') return null;
    const probe = '__crs_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valide un fichier de sauvegarde analysé ; retourne ses sections ou null. */
function sectionsOf(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (data.format !== SAVE_FORMAT) return null;
  if (typeof data.version !== 'number' || data.version < 1 || data.version > SAVE_VERSION) return null;
  if (!isRecord(data.sections)) return null;
  return data.sections;
}

export function createSave(options: SaveOptions = {}): SaveStore {
  const key = options.key ?? SAVE_KEY;
  let storage: StorageLike | null = options.storage === undefined ? detectStorage() : options.storage;
  let sections: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  function adopt(src: Record<string, unknown>): void {
    const next = Object.create(null) as Record<string, unknown>;
    for (const name of Object.keys(src)) next[name] = src[name];
    sections = next;
  }

  // chargement initial
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const loaded = sectionsOf(JSON.parse(raw));
        if (loaded) adopt(loaded);
        else console.warn('[save] sauvegarde illisible ou de version inconnue : ignorée');
      }
    } catch (err) {
      console.warn('[save] lecture de la sauvegarde impossible : repli en mémoire', err);
      storage = null;
    }
  }

  function persist(): void {
    if (!storage) return;
    try {
      const file: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, sections };
      storage.setItem(key, JSON.stringify(file));
    } catch (err) {
      console.warn('[save] écriture impossible (quota ou stockage indisponible) : repli en mémoire', err);
      storage = null;
    }
  }

  return {
    read<T>(section: string, fallback: T): T {
      try {
        if (!(section in sections)) return fallback;
        const v = sections[section];
        return v === undefined ? fallback : (clone(v) as T);
      } catch {
        return fallback;
      }
    },
    write<T>(section: string, value: T): void {
      try {
        const copy = clone(value);
        if (copy === undefined) delete sections[section];
        else sections[section] = copy;
        persist();
      } catch (err) {
        console.warn(`[save] section « ${section} » non sérialisable : écriture ignorée`, err);
      }
    },
    remove(section: string): void {
      if (section in sections) {
        delete sections[section];
        persist();
      }
    },
    exportAll(): string {
      try {
        const file: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, sections };
        return JSON.stringify(file);
      } catch {
        return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, sections: {} });
      }
    },
    importAll(json: string): boolean {
      try {
        const loaded = sectionsOf(JSON.parse(json));
        if (!loaded) return false;
        adopt(clone(loaded));
        persist();
        return true;
      } catch {
        return false;
      }
    },
    wipe(): void {
      sections = Object.create(null) as Record<string, unknown>;
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        storage = null;
      }
    },
    get persistent(): boolean {
      return storage !== null;
    },
    sections(): string[] {
      return Object.keys(sections);
    },
  };
}
