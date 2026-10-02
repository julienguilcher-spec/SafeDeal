import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";
import type { DocKind } from "./extract/index.js";

export interface CorpusCourse {
  id: number;
  shortname: string;
  fullname: string;
}

export interface CorpusDoc {
  /** Identifiant stable et utilisable comme nom de fichier. */
  id: string;
  courseId: number;
  course: string;
  section: string;
  moduleId: number;
  moduleName: string;
  modname: string;
  title: string;
  kind: DocKind;
  /** Chemin relatif à data/ du fichier d'origine, quand il a été téléchargé. */
  file?: string;
  /** Chemin relatif à data/ du texte extrait. */
  text?: string;
  mimetype?: string;
  bytes?: number;
  pages?: number;
  slides?: number;
  chars: number;
  /** Lien KEATS, pour pouvoir remonter à la source d'une citation. */
  url?: string;
  timemodified?: number;
  syncedAt: string;
  /** Renseigné quand l'extraction a échoué : le document reste listé. */
  error?: string;
}

export interface Manifest {
  version: 1;
  site: string;
  syncedAt?: string;
  courses: CorpusCourse[];
  docs: CorpusDoc[];
}

const EMPTY: Manifest = { version: 1, site: CONFIG.keats.site, courses: [], docs: [] };

export function loadManifest(): Manifest {
  if (!fs.existsSync(CONFIG.manifestFile)) return structuredClone(EMPTY);
  return { ...structuredClone(EMPTY), ...(JSON.parse(fs.readFileSync(CONFIG.manifestFile, "utf8")) as Manifest) };
}

export function saveManifest(m: Manifest): void {
  writeAtomic(CONFIG.manifestFile, JSON.stringify(m, null, 2));
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export function docId(courseId: number, moduleId: number, label: string): string {
  return `${courseId}-${moduleId}-${slug(label) || "doc"}`;
}

export function readDocText(doc: CorpusDoc): string {
  if (!doc.text) return "";
  const p = path.join(CONFIG.dataDir, doc.text);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

export function writeDocText(id: string, text: string): string {
  const rel = path.join("text", `${id}.txt`);
  writeAtomic(path.join(CONFIG.dataDir, rel), text);
  return rel;
}

/** Un passage indexé, tel qu'il est stocké dans chunks.jsonl. */
export interface StoredChunk {
  id: string;
  docId: string;
  courseId: number;
  course: string;
  title: string;
  anchor?: string;
  text: string;
}

export function writeChunks(chunks: StoredChunk[]): void {
  writeAtomic(CONFIG.chunksFile, chunks.map((c) => JSON.stringify(c)).join("\n") + (chunks.length ? "\n" : ""));
}

export function readChunks(): StoredChunk[] {
  if (!fs.existsSync(CONFIG.chunksFile)) return [];
  return fs
    .readFileSync(CONFIG.chunksFile, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as StoredChunk);
}

/**
 * Retrouve un cours à partir d'un bout de nom ou de son identifiant.
 * Lève une erreur explicite en cas d'ambiguïté plutôt que de deviner.
 */
export function resolveCourse(m: Manifest, query: string): CorpusCourse {
  const q = query.trim().toLowerCase();
  if (!q) throw new Error("Précise un cours (son code, un mot de son intitulé, ou son id).");

  const byId = m.courses.find((c) => String(c.id) === q);
  if (byId) return byId;

  const exact = m.courses.filter((c) => c.shortname.toLowerCase() === q);
  if (exact.length === 1) return exact[0];

  const matches = m.courses.filter(
    (c) => c.shortname.toLowerCase().includes(q) || c.fullname.toLowerCase().includes(q),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `« ${query} » correspond à plusieurs cours :\n` +
        matches.map((c) => `  - ${c.shortname} (${c.id}) — ${c.fullname}`).join("\n"),
    );
  }
  throw new Error(
    `Aucun cours ne correspond à « ${query} ». Cours synchronisés :\n` +
      (m.courses.map((c) => `  - ${c.shortname} — ${c.fullname}`).join("\n") || "  (aucun — lance `kcl sync`)"),
  );
}

export function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}
