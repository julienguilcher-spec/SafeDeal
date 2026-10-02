import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "../config.js";
import { readDocText, type CorpusDoc } from "../corpus.js";
import { pdfPageCount } from "../extract/pdf.js";
import type { SearchHit } from "../search.js";

export interface Source {
  /** Étiquette courte citée par Claude : S1, S2… */
  tag: string;
  label: string;
  url?: string;
  docId: string;
}

export interface BuiltContext {
  blocks: Anthropic.ContentBlockParam[];
  sources: Source[];
  /** Ce qui n'a pas pu être inclus, à répéter à l'utilisateur. */
  notes: string[];
}

/** Au-delà, on tronque en le disant plutôt que de faire exploser la facture. */
const DEFAULT_CHAR_BUDGET = 600_000;

export function docLabel(doc: CorpusDoc): string {
  return [doc.course, doc.section, doc.title].filter(Boolean).join(" · ");
}

/**
 * Construit le contexte à partir de documents entiers. Un PDF assez petit est
 * envoyé tel quel : Claude voit alors les schémas, courbes et formules que
 * l'extraction de texte aplatit — et c'est le seul moyen de lire un scan.
 */
export async function buildDocContext(
  docs: CorpusDoc[],
  { charBudget = DEFAULT_CHAR_BUDGET, nativePdf = true } = {},
): Promise<BuiltContext> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  const sources: Source[] = [];
  const notes: string[] = [];
  let pdfBytes = 0;
  let chars = 0;

  for (const doc of docs) {
    const tag = `S${sources.length + 1}`;
    const label = docLabel(doc);
    const absolute = doc.file ? path.join(CONFIG.dataDir, doc.file) : undefined;

    if (nativePdf && doc.kind === "pdf" && absolute && fs.existsSync(absolute)) {
      const native = await tryNativePdf(absolute, pdfBytes);
      if (native) {
        pdfBytes += native.bytes;
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: native.base64 },
          title: label,
          context: `Source ${tag}. Cours ${doc.course}, section « ${doc.section} ».`,
        });
        sources.push({ tag, label, url: doc.url, docId: doc.id });
        continue;
      }
      if (doc.chars === 0) {
        notes.push(`${label} : non lisible (PDF sans texte et trop volumineux pour être envoyé tel quel).`);
        continue;
      }
    }

    const text = readDocText(doc);
    if (!text.trim()) {
      notes.push(`${label} : aucun texte exploitable${doc.error ? ` (${doc.error})` : ""}.`);
      continue;
    }
    const remaining = charBudget - chars;
    if (remaining <= 2_000) {
      notes.push(`${label} : laissé de côté, le budget de contexte est atteint.`);
      continue;
    }
    const body = text.length > remaining ? text.slice(0, remaining) : text;
    if (body.length < text.length) {
      notes.push(
        `${label} : tronqué à ${Math.round(body.length / 1000)}k caractères sur ${Math.round(text.length / 1000)}k. ` +
          `Vise une section précise (--doc) pour tout couvrir.`,
      );
    }
    chars += body.length;
    blocks.push({ type: "text", text: `=== [${tag}] ${label} ===\n${body}` });
    sources.push({ tag, label, url: doc.url, docId: doc.id });
  }

  markCacheable(blocks);
  return { blocks, sources, notes };
}

async function tryNativePdf(
  absolute: string,
  alreadySent: number,
): Promise<{ base64: string; bytes: number } | undefined> {
  const bytes = fs.statSync(absolute).size;
  const limitBytes = CONFIG.anthropic.maxPdfMb * 1024 * 1024;
  // La requête entière est plafonnée : garder de la marge pour les autres blocs.
  if (bytes > limitBytes || alreadySent + bytes > limitBytes) return undefined;

  const buf = fs.readFileSync(absolute);
  try {
    if ((await pdfPageCount(buf)) > CONFIG.anthropic.maxPdfPages) return undefined;
  } catch {
    // PDF que pdf.js n'ouvre pas : l'envoyer tel quel serait un pari, on passe au texte.
    return undefined;
  }
  return { base64: buf.toString("base64"), bytes };
}

/** Contexte fait de passages retrouvés par la recherche, numérotés pour la citation. */
export function buildPassageContext(hits: SearchHit[]): BuiltContext {
  const sources: Source[] = [];
  const parts: string[] = [];
  for (const [i, hit] of hits.entries()) {
    const tag = `S${i + 1}`;
    const label = [hit.chunk.course, hit.chunk.title, hit.chunk.anchor].filter(Boolean).join(" · ");
    sources.push({ tag, label, docId: hit.chunk.docId });
    parts.push(`=== [${tag}] ${label} ===\n${hit.chunk.text}`);
  }
  const blocks: Anthropic.ContentBlockParam[] = parts.length
    ? [{ type: "text", text: parts.join("\n\n") }]
    : [];
  markCacheable(blocks);
  return { blocks, sources, notes: [] };
}

/** Pose le point de cache sur le dernier bloc : le préfixe est réutilisé entre commandes. */
function markCacheable(blocks: Anthropic.ContentBlockParam[]): void {
  const last = blocks.at(-1);
  if (last && (last.type === "text" || last.type === "document")) {
    last.cache_control = { type: "ephemeral" };
  }
}

export function renderSources(sources: Source[]): string {
  if (!sources.length) return "";
  return ["", "## Sources", ...sources.map((s) => `- **${s.tag}** — ${s.label}${s.url ? ` · ${s.url}` : ""}`)].join("\n");
}
