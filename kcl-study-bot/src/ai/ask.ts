import { z } from "zod";
import { CONFIG } from "../config.js";
import { readChunks } from "../corpus.js";
import { SearchIndex, type SearchHit } from "../search.js";
import { generateStructured, generateText } from "./client.js";
import { buildPassageContext, renderSources, type Source } from "./context.js";
import { ASK_SYSTEM, SOLVE_SYSTEM } from "./prompts.js";

export type AskMode = "ask" | "solve";

const ExpansionSchema = z.object({
  keywords: z
    .array(z.string())
    .describe(
      "3 à 5 reformulations pour une recherche plein texte. Du vocabulaire technique, en anglais ET en français, " +
        "y compris les synonymes et les symboles épelés. Pas de phrases.",
    ),
});

/**
 * Les documents de cours sont en anglais, les questions souvent en français.
 * On élargit donc la requête avant la recherche lexicale, avec un modèle bon marché.
 */
async function expandQuery(question: string): Promise<string[]> {
  try {
    const { keywords } = await generateStructured(
      {
        system:
          "Tu prépares une recherche plein texte dans des supports de cours universitaires rédigés en anglais. " +
          "À partir de la question, produis les expressions à chercher. Ne réponds pas à la question.",
        content: [{ type: "text", text: question }],
        model: CONFIG.anthropic.fastModel,
        effort: "low",
        maxTokens: 1_024,
      },
      ExpansionSchema,
    );
    return [question, ...keywords];
  } catch {
    // L'élargissement est un bonus : sans lui, on cherche la question telle quelle.
    return [question];
  }
}

export interface Answer {
  markdown: string;
  sources: Source[];
  hits: SearchHit[];
}

export async function ask(
  question: string,
  { mode, courseId, topK = CONFIG.search.topK }: { mode: AskMode; courseId?: number; topK?: number },
): Promise<Answer> {
  const chunks = readChunks();
  if (!chunks.length) {
    throw new Error("L'index est vide : lance d'abord `kcl sync` pour récupérer tes cours.");
  }

  const index = new SearchIndex(chunks);
  const hits = index.searchMany(await expandQuery(question), { k: topK, courseId });
  const context = buildPassageContext(hits);

  const instruction = hits.length
    ? `Question : ${question}\n\nÉtiquettes de source utilisables : ${context.sources.map((s) => s.tag).join(", ")}.`
    : `Question : ${question}\n\nAucun passage de tes documents ne ressort pour cette question : dis-le d'abord, puis réponds de façon générale en annonçant que c'est hors cours.`;

  const markdown = await generateText({
    system: mode === "solve" ? SOLVE_SYSTEM : ASK_SYSTEM,
    content: [...context.blocks, { type: "text", text: instruction }],
  });

  return { markdown: `${markdown}\n${renderSources(context.sources)}\n`, sources: context.sources, hits };
}
