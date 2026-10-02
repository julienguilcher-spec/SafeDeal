import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

function envEffort(name: string, fallback: Effort): Effort {
  const v = env(name);
  if (v === undefined) return fallback;
  if (!(EFFORTS as readonly string[]).includes(v)) {
    throw new Error(`${name} doit valoir ${EFFORTS.join(" | ")}, reçu "${v}"`);
  }
  return v as Effort;
}

function envInt(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${v}"`);
  return n;
}

const dataDir = path.resolve(env("KCL_DATA_DIR", path.resolve(here, "../data"))!);

export const CONFIG = {
  dataDir,
  /** Jeton web service + identité du site, écrit par `kcl login`. */
  authFile: path.join(dataDir, "auth.json"),
  /** Fichiers de cours téléchargés, rangés par cours. */
  filesDir: path.join(dataDir, "files"),
  /** Texte extrait, mis en cache par empreinte de fichier. */
  textDir: path.join(dataDir, "text"),
  /** Index de recherche (une ligne JSON par passage). */
  chunksFile: path.join(dataDir, "chunks.jsonl"),
  /** Inventaire des cours / documents vus lors des synchros. */
  manifestFile: path.join(dataDir, "manifest.json"),
  /** Fiches, flashcards et quiz générés. */
  outDir: path.join(dataDir, "out"),

  keats: {
    /** Racine du Moodle de KCL (KEATS). */
    site: (env("KEATS_URL", "https://keats.kcl.ac.uk")!).replace(/\/+$/, ""),
    /** Jeton web service, sinon celui de data/auth.json. */
    token: env("KEATS_TOKEN"),
    /** Le service mobile Moodle : c'est celui que l'appli officielle utilise. */
    service: env("KEATS_SERVICE", "moodle_mobile_app")!,
    /** Requêtes simultanées vers KEATS (rester poli avec le serveur de la fac). */
    concurrency: envInt("KEATS_CONCURRENCY", 3),
    /** Taille max d'un fichier téléchargé, en Mo. */
    maxFileMb: envInt("KEATS_MAX_FILE_MB", 80),
  },

  anthropic: {
    model: env("KCL_MODEL", "claude-opus-5-5")!,
    /** Modèle bon marché pour les tâches annexes (reformulation de requête). */
    fastModel: env("KCL_FAST_MODEL", "claude-sonnet-5-5")!,
    /** low | medium | high | xhigh | max — pilote la profondeur de réflexion. */
    effort: envEffort("KCL_EFFORT", "high"),
    /** Un PDF plus gros que ça est lu via le texte extrait, pas envoyé tel quel. */
    maxPdfMb: envInt("KCL_MAX_PDF_MB", 20),
    /** Limite de pages pour un PDF envoyé nativement (limite API : 600). */
    maxPdfPages: envInt("KCL_MAX_PDF_PAGES", 300),
  },

  /** Langue des fiches, résumés et réponses. */
  lang: env("KCL_LANG", "français")!,

  search: {
    chunkChars: envInt("KCL_CHUNK_CHARS", 4800),
    chunkOverlap: envInt("KCL_CHUNK_OVERLAP", 600),
    topK: envInt("KCL_TOP_K", 12),
  },
};

export type Config = typeof CONFIG;
