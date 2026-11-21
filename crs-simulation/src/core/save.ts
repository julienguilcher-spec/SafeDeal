/* =====================================================================================
 * Sauvegarde : sections JSON nommées, rangées sous une seule clé versionnée de localStorage.
 *
 *   - repli automatique en mémoire sous Node, en navigation privée, dans une iframe sans accès
 *     au stockage, ou si le quota est dépassé ;
 *   - une écriture refusée (quota, stockage momentanément indisponible) n'est pas définitive :
 *     tout reste en mémoire et l'écriture suivante réessaie — `persistent` dit si la dernière a abouti ;
 *   - aucune méthode ne lève d'exception : une sauvegarde illisible (JSON tronqué, autre format)
 *     est ignorée et signalée, sa copie brute est mise de côté sous la clé « <clé>.illisible »
 *     (récupérable à la main), et le jeu continue de sauvegarder normalement ;
 *   - exportAll() / importAll() : sauvegarde complète en JSON (pour la copier d'un appareil à l'autre) ;
 *   - les valeurs lues et écrites sont des copies : modifier un objet lu ne modifie pas la sauvegarde ;
 *   - copie de secours (application de bureau) : quand la page expose `window.crsDesktop` (préchargement
 *     d'Electron, desktop/preload.js), chaque écriture est aussi envoyée à un fichier du dossier de
 *     l'utilisateur, et au démarrage la plus récente des deux copies (localStorage ou fichier, d'après
 *     leur horodatage `savedAt`) est retenue : rien n'est perdu si le stockage du navigateur intégré est
 *     vidé ou n'a pas eu le temps d'écrire avant la fermeture. Dans un navigateur ordinaire, rien ne change
 *     (pas de copie, pas d'horodatage dans le fichier).
 * ===================================================================================== */

import type { SaveApi } from './contracts';

/** Version du schéma de sauvegarde (à incrémenter en cas de changement incompatible). */
export const SAVE_VERSION = 1;
/** Clé de stockage (la version en fait partie : une version future ne lira pas une ancienne clé par erreur). */
export const SAVE_KEY = `crs-simulation-france.save.v${SAVE_VERSION}`;
/** Marqueur de format des exports. */
export const SAVE_FORMAT = 'crs-simulation-france';
/** Suffixe de la clé où est mise de côté une sauvegarde illisible avant d'être remplacée. */
export const SAVE_UNREADABLE_SUFFIX = '.illisible';

/** Sous-ensemble de l'interface Storage utilisé par la sauvegarde. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Copie de secours hors du navigateur (fichier de l'application de bureau). `load` est synchrone : la
 * sauvegarde doit être connue dès la création du contexte, avant le chargement des paramètres.
 */
export interface SaveMirror {
  /** Contenu de la copie (JSON du fichier de sauvegarde), ou null s'il n'y en a pas. */
  load(): string | null;
  /** Remplace la copie par ce JSON (fichier de sauvegarde complet). */
  store(json: string): void;
}

export interface SaveOptions {
  /** Clé de stockage (par défaut SAVE_KEY). */
  key?: string;
  /** Stockage à utiliser ; `null` force la mémoire ; absent = localStorage s'il est utilisable. */
  storage?: StorageLike | null;
  /** Copie de secours ; `null` : aucune ; absent = celle de l'application de bureau si elle existe. */
  mirror?: SaveMirror | null;
  /** Horloge des horodatages (ms) ; Date.now par défaut (tests). */
  now?: () => number;
}

/** SaveApi du contrat, plus un indicateur de persistance. */
export interface SaveStore extends SaveApi {
  /**
   * true si les écritures atteignent un stockage durable (la dernière a abouti) ; false si tout reste
   * en mémoire : pas de stockage, ou dernière écriture refusée (la suivante réessaiera).
   */
  readonly persistent: boolean;
  /** Noms des sections présentes. */
  sections(): string[];
}

interface SaveFile {
  format: string;
  version: number;
  /** Instant de l'écriture (ms) : seulement avec une copie de secours, pour retenir la plus récente au démarrage. */
  savedAt?: number;
  sections: Record<string, unknown>;
}

/** Nom de la propriété globale posée par le préchargement de l'application de bureau. */
export const DESKTOP_GLOBAL = 'crsDesktop';

/**
 * Copie de secours de l'application de bureau (window.crsDesktop : loadBackup() / saveBackup(json)),
 * ou null dans un navigateur ordinaire et sous Node.
 */
export function detectMirror(): SaveMirror | null {
  try {
    const d = (globalThis as Record<string, unknown>)[DESKTOP_GLOBAL] as { loadBackup?: unknown; saveBackup?: unknown } | undefined;
    if (!d || typeof d.loadBackup !== 'function' || typeof d.saveBackup !== 'function') return null;
    const load = d.loadBackup as () => unknown;
    const save = d.saveBackup as (json: string) => unknown;
    return {
      load: (): string | null => {
        const v = load.call(d);
        return typeof v === 'string' && v !== '' ? v : null;
      },
      store: (json: string): void => {
        save.call(d, json);
      },
    };
  } catch {
    return null;
  }
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

/** Horodatage d'un fichier analysé (0 s'il n'en a pas : écrit sans copie de secours, ou ancien). */
function savedAtOf(data: unknown): number {
  if (!isRecord(data)) return 0;
  const t = data.savedAt;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0;
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
  const mirror: SaveMirror | null = options.mirror === undefined ? detectMirror() : options.mirror;
  const now = options.now ?? ((): number => Date.now());
  /** Horodatage de la dernière écriture (strictement croissant d'une écriture à l'autre). */
  let lastSavedAt = 0;
  /** La dernière écriture de la copie de secours a abouti. */
  let mirrorOk = mirror !== null;

  function adopt(src: Record<string, unknown>): void {
    const next = Object.create(null) as Record<string, unknown>;
    for (const name of Object.keys(src)) next[name] = src[name];
    sections = next;
  }

  /** La dernière écriture a atteint le stockage (ou aucune n'a encore été tentée). */
  let lastWriteOk = true;

  // chargement initial
  let localLoaded = false;
  let localSavedAt = 0;
  if (storage) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch (err) {
      // le stockage lui-même est inaccessible (iframe restreinte…) : tout se passera en mémoire
      console.warn('[save] lecture de la sauvegarde impossible : repli en mémoire', err);
      storage = null;
    }
    if (storage && raw) {
      // le stockage fonctionne ; si son CONTENU est illisible, on le met de côté et on continue de sauvegarder
      let loaded: Record<string, unknown> | null = null;
      try {
        const data: unknown = JSON.parse(raw);
        loaded = sectionsOf(data);
        if (loaded) localSavedAt = savedAtOf(data);
      } catch {
        loaded = null; // JSON tronqué ou invalide
      }
      if (loaded) {
        adopt(loaded);
        localLoaded = true;
      } else {
        let kept = false;
        try {
          storage.setItem(key + SAVE_UNREADABLE_SUFFIX, raw);
          kept = true;
        } catch {
          // pas de place pour la copie : tant pis, la sauvegarde illisible sera remplacée à la prochaine écriture
        }
        console.warn(
          '[save] sauvegarde illisible ou de version inconnue : ignorée' +
            (kept ? ` (copie brute conservée sous « ${key}${SAVE_UNREADABLE_SUFFIX} »)` : ''),
        );
      }
    }
  }

  /** Envoie un fichier complet à la copie de secours (sans jamais lever). */
  function mirrorStore(json: string): void {
    if (!mirror) return;
    try {
      mirror.store(json);
      if (!mirrorOk) console.warn('[save] copie de secours de nouveau disponible');
      mirrorOk = true;
    } catch (err) {
      if (mirrorOk) console.warn('[save] copie de secours impossible : nouvel essai à la prochaine écriture', err);
      mirrorOk = false;
    }
  }

  /** Fichier complet sérialisé ; horodaté seulement s'il y a une copie de secours (format inchangé sinon). */
  function serialize(): string {
    const file: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, sections };
    if (mirror) {
      lastSavedAt = Math.max(now(), lastSavedAt + 1);
      file.savedAt = lastSavedAt;
    }
    return JSON.stringify(file);
  }

  // copie de secours : la plus récente des deux copies l'emporte ; une copie absente ou en retard est mise à jour
  if (mirror) {
    let backup: Record<string, unknown> | null = null;
    let backupSavedAt = 0;
    try {
      const raw = mirror.load();
      if (raw) {
        const data: unknown = JSON.parse(raw);
        backup = sectionsOf(data);
        backupSavedAt = savedAtOf(data);
      }
    } catch (err) {
      console.warn('[save] copie de secours illisible : ignorée', err);
      backup = null;
    }
    lastSavedAt = Math.max(localSavedAt, backupSavedAt);
    if (backup && (!localLoaded || backupSavedAt > localSavedAt)) {
      adopt(backup);
      if (!localLoaded) console.warn('[save] sauvegarde du navigateur absente : rétablie depuis la copie de secours');
      if (storage) {
        // le stockage du navigateur reprend la copie (sans horodatage nouveau : les deux copies restent égales)
        try {
          storage.setItem(key, JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: backupSavedAt, sections } satisfies SaveFile));
        } catch {
          // stockage plein ou indisponible : la copie de secours suffit, la prochaine écriture réessaiera
        }
      }
    } else if (localLoaded && (!backup || backupSavedAt < localSavedAt || localSavedAt === 0)) {
      mirrorStore(serialize());
    }
  }

  function persist(): void {
    if (!storage) {
      if (mirror) mirrorStore(serialize());
      return;
    }
    const json = serialize();
    mirrorStore(json);
    try {
      storage.setItem(key, json);
      if (!lastWriteOk) console.warn('[save] stockage de nouveau disponible : la sauvegarde est à jour');
      lastWriteOk = true;
    } catch (err) {
      // tout reste en mémoire ; la prochaine écriture réessaiera (signalé une seule fois par panne)
      if (lastWriteOk) {
        console.warn('[save] écriture impossible (quota ou stockage indisponible) : valeurs gardées en mémoire, nouvel essai à la prochaine écriture', err);
      }
      lastWriteOk = false;
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
      // la copie de secours est vidée elle aussi : sinon elle rétablirait la sauvegarde au prochain démarrage
      if (mirror) mirrorStore(serialize());
      if (!storage) return;
      try {
        storage.removeItem(key);
        lastWriteOk = true;
      } catch {
        lastWriteOk = false; // l'effacement sera refait par la prochaine écriture réussie
      }
    },
    get persistent(): boolean {
      return (storage !== null && lastWriteOk) || (mirror !== null && mirrorOk);
    },
    sections(): string[] {
      return Object.keys(sections);
    },
  };
}
