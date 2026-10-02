import { generateText } from "./client.js";
import { buildDocContext, renderSources, type BuiltContext } from "./context.js";
import { FICHE_SYSTEM, RESUME_SYSTEM } from "./prompts.js";
import type { CorpusDoc } from "../corpus.js";

export type SheetMode = "fiche" | "resume";

export interface Sheet {
  markdown: string;
  notes: string[];
  sourceCount: number;
}

/** Fiche de révision ou résumé, à partir des documents donnés. */
export async function makeSheet(
  docs: CorpusDoc[],
  { mode, title, focus }: { mode: SheetMode; title: string; focus?: string },
): Promise<Sheet> {
  if (!docs.length) throw new Error("Aucun document à traiter.");
  const context: BuiltContext = await buildDocContext(docs);
  if (!context.blocks.length) {
    throw new Error(`Rien d'exploitable dans ces documents.\n${context.notes.map((n) => `  - ${n}`).join("\n")}`);
  }

  const instruction = [
    `Sujet : ${title}.`,
    focus ? `Concentre-toi sur : ${focus}.` : null,
    `Étiquettes de citation disponibles : ${context.sources.map((s) => s.tag).join(", ")}.`,
    mode === "fiche" ? "Produis la fiche de révision." : "Produis le résumé.",
  ]
    .filter(Boolean)
    .join("\n");

  const markdown = await generateText({
    system: mode === "fiche" ? FICHE_SYSTEM : RESUME_SYSTEM,
    content: [...context.blocks, { type: "text", text: instruction }],
  });

  return {
    markdown: `${markdown}\n${renderSources(context.sources)}\n`,
    notes: context.notes,
    sourceCount: context.sources.length,
  };
}
