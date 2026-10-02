import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import {
  docId, loadManifest, readDocText, saveManifest, slug, writeChunks, writeDocText,
  type CorpusDoc, type Manifest, type StoredChunk,
} from "../corpus.js";
import { chunkText } from "../chunk.js";
import { extractFile, kindFor } from "../extract/index.js";
import { htmlToText } from "../extract/html.js";
import { ok, pool, step, warn } from "../log.js";
import { requireAuth } from "./auth.js";
import { KeatsClient, MoodleError } from "./client.js";
import {
  getAssignments, getCourseContents, getCourses, getPageHtml, getSiteInfo,
  type CourseSummary, type Module, type Section,
} from "./api.js";

export interface SyncOptions {
  /** Ne synchroniser que les cours dont le nom contient un de ces fragments. */
  only?: string[];
  /** Re-télécharger et ré-extraire même si rien n'a changé. */
  force?: boolean;
}

/** Une unité à récupérer : un fichier, une page, un énoncé de devoir. */
interface Candidate {
  doc: Omit<CorpusDoc, "chars" | "syncedAt">;
  /** Fichier distant à télécharger, s'il y en a un. */
  remote?: { fileUrl: string; bytes?: number };
  /** Contenu HTML déjà en main (page Moodle, énoncé, description). */
  html?: string;
}

export async function sync(options: SyncOptions = {}): Promise<Manifest> {
  const auth = requireAuth();
  const client = new KeatsClient(auth);

  step("Vérification du jeton KEATS…");
  const info = await getSiteInfo(client);
  ok(`connecté à ${info.sitename} en tant que ${info.username}`);
  if (info.downloadfiles === 0) {
    warn("Ce jeton n'a pas le droit de télécharger les fichiers : seuls les textes des pages seront récupérés.");
  }

  let courses = await getCourses(client, info.userid);
  if (options.only?.length) {
    const needles = options.only.map((s) => s.toLowerCase());
    courses = courses.filter((c) =>
      needles.some((n) => c.shortname.toLowerCase().includes(n) || c.fullname.toLowerCase().includes(n)),
    );
    if (!courses.length) throw new Error(`Aucun cours inscrit ne correspond à : ${options.only.join(", ")}`);
  }
  ok(`${courses.length} cours inscrit${courses.length > 1 ? "s" : ""}`);

  const previous = loadManifest();
  const previousById = new Map(previous.docs.map((d) => [d.id, d]));
  // Les cours non synchronisés cette fois gardent leur contenu déjà indexé.
  const keptDocs = previous.docs.filter((d) => !courses.some((c) => c.id === d.courseId));
  const freshDocs: CorpusDoc[] = [];

  for (const course of courses) {
    step(`${course.shortname} — ${course.fullname}`);
    const candidates = await collectCandidates(client, course);
    let downloaded = 0;
    let reused = 0;
    let skipped = 0;

    const results = await pool(candidates, CONFIG.keats.concurrency, async (candidate) => {
      try {
        const doc = await materialize(client, candidate, previousById.get(candidate.doc.id), options.force);
        if (!doc) {
          skipped++;
          return undefined;
        }
        if (doc.reused) reused++;
        else downloaded++;
        return doc.doc;
      } catch (err) {
        const message = err instanceof MoodleError ? `${err.errorcode}: ${err.message}` : (err as Error).message;
        warn(`  ${candidate.doc.title} — ignoré (${message})`);
        return { ...candidate.doc, chars: 0, syncedAt: new Date().toISOString(), error: message };
      }
    });

    for (const d of results) if (d) freshDocs.push(d);
    ok(`  ${downloaded} nouveau(x), ${reused} déjà à jour, ${skipped} non exploitable(s)`);
  }

  const manifest: Manifest = {
    version: 1,
    site: auth.site,
    syncedAt: new Date().toISOString(),
    courses: [
      ...previous.courses.filter((c) => !courses.some((n) => n.id === c.id)),
      ...courses.map((c) => ({ id: c.id, shortname: c.shortname, fullname: c.fullname })),
    ].sort((a, b) => a.shortname.localeCompare(b.shortname)),
    docs: [...keptDocs, ...freshDocs].sort((a, b) => a.id.localeCompare(b.id)),
  };
  saveManifest(manifest);

  const chunks = reindex(manifest);
  ok(`index reconstruit : ${manifest.docs.filter((d) => d.chars > 0).length} documents, ${chunks} passages`);
  return manifest;
}

/** Reconstruit chunks.jsonl depuis les textes déjà extraits. */
export function reindex(manifest: Manifest): number {
  const chunks: StoredChunk[] = [];
  for (const doc of manifest.docs) {
    const text = readDocText(doc);
    if (!text.trim()) continue;
    for (const [i, c] of chunkText(text).entries()) {
      chunks.push({
        id: `${doc.id}#${i}`,
        docId: doc.id,
        courseId: doc.courseId,
        course: doc.course,
        title: doc.title,
        anchor: c.anchor,
        text: c.text,
      });
    }
  }
  writeChunks(chunks);
  return chunks.length;
}

async function collectCandidates(client: KeatsClient, course: CourseSummary): Promise<Candidate[]> {
  const [sections, pages, assignments] = await Promise.all([
    getCourseContents(client, course.id),
    getPageHtml(client, course.id),
    getAssignments(client, course.id),
  ]);

  const out: Candidate[] = [];
  for (const section of sections) {
    const sectionName = section.name?.trim() || "Général";
    for (const module of section.modules) {
      out.push(...candidatesForModule(course, sectionName, module, pages, assignments));
    }
  }
  return out;
}

function candidatesForModule(
  course: CourseSummary,
  section: string,
  module: Module,
  pages: Map<number, string>,
  assignments: Map<number, { intro: string; duedate?: number }>,
): Candidate[] {
  const base = {
    courseId: course.id,
    course: course.shortname,
    section,
    moduleId: module.id,
    moduleName: module.name,
    modname: module.modname,
    url: module.url,
  };
  const out: Candidate[] = [];

  for (const content of module.contents ?? []) {
    if (content.type !== "file" || !content.fileurl || !content.filename) continue;
    const kind = kindFor(content.filename, content.mimetype);
    if (kind === "unsupported") continue;
    out.push({
      doc: {
        ...base,
        id: docId(course.id, module.id, `${module.name}-${content.filename}`),
        title: titleFor(module.name, content.filename),
        kind,
        mimetype: content.mimetype,
        bytes: content.filesize,
        timemodified: content.timemodified,
        file: path.join("files", slug(course.shortname), `${module.id}-${safeName(content.filename)}`),
      },
      remote: { fileUrl: content.fileurl, bytes: content.filesize },
    });
  }

  // Contenu HTML propre au module : page Moodle, énoncé de devoir, ou description.
  const pageHtml = pages.get(module.id);
  const assignment = assignments.get(module.id);
  const html = pageHtml ?? assignment?.intro ?? module.description;
  if (html && htmlToText(html).length > 40) {
    const dueNote = assignment?.duedate
      ? `\n\nÀ rendre le ${new Date(assignment.duedate * 1000).toLocaleString("fr-FR")}.`
      : "";
    out.push({
      doc: {
        ...base,
        id: docId(course.id, module.id, module.name),
        title: module.name,
        kind: "html",
      },
      html: html + dueNote,
    });
  }
  return out;
}

function titleFor(moduleName: string, filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  // Éviter « Lecture 3 — Lecture 3 » quand le fichier porte le nom du module.
  return slug(stem) === slug(moduleName) ? moduleName : `${moduleName} — ${filename}`;
}

function safeName(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_").slice(-100);
}

/**
 * Télécharge (si besoin) et extrait un candidat. Renvoie `undefined` quand il
 * n'y a rien d'exploitable, et `reused: true` quand le cache suffisait.
 */
async function materialize(
  client: KeatsClient,
  candidate: Candidate,
  previous: CorpusDoc | undefined,
  force = false,
): Promise<{ doc: CorpusDoc; reused: boolean } | undefined> {
  const { doc, remote, html } = candidate;
  const now = new Date().toISOString();

  if (html !== undefined) {
    const text = htmlToText(html);
    if (!text.trim()) return undefined;
    return {
      doc: { ...doc, chars: text.length, text: writeDocText(doc.id, text), syncedAt: now },
      reused: false,
    };
  }
  if (!remote || !doc.file) return undefined;

  const absolute = path.join(CONFIG.dataDir, doc.file);
  const unchanged =
    !force &&
    previous?.timemodified === doc.timemodified &&
    previous?.chars !== undefined &&
    previous.chars > 0 &&
    fs.existsSync(absolute) &&
    previous.text !== undefined &&
    fs.existsSync(path.join(CONFIG.dataDir, previous.text));
  if (unchanged) return { doc: { ...previous, ...doc, chars: previous.chars, text: previous.text }, reused: true };

  await client.download(remote.fileUrl, absolute, remote.bytes);
  const buf = fs.readFileSync(absolute);
  const extracted = await extractFile(buf, path.basename(doc.file), doc.mimetype);
  if (!extracted.text.trim()) {
    // PDF scanné ou slides en images : on garde le fichier, Claude saura le lire.
    return {
      doc: { ...doc, chars: 0, bytes: buf.length, pages: extracted.pages, syncedAt: now, error: "aucun texte extractible (document probablement scanné)" },
      reused: false,
    };
  }
  return {
    doc: {
      ...doc,
      bytes: buf.length,
      pages: extracted.pages,
      slides: extracted.slides,
      chars: extracted.text.length,
      text: writeDocText(doc.id, extracted.text),
      syncedAt: now,
    },
    reused: false,
  };
}
