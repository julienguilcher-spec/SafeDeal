import { z } from "zod";
import { generateStructured } from "./client.js";
import { buildDocContext } from "./context.js";
import { GROUND_RULES } from "./prompts.js";
import type { CorpusDoc } from "../corpus.js";

export const CardSchema = z.object({
  type: z.enum(["basic", "cloze"]).describe("basic = question/réponse ; cloze = phrase à trous avec {{c1::...}}"),
  front: z
    .string()
    .describe("Pour basic : la question, précise et autoportante. Pour cloze : la phrase complète avec {{c1::terme}}"),
  back: z.string().describe("Pour basic : la réponse seule, sans phrase d'introduction. Pour cloze : une précision courte, ou vide"),
  tags: z.array(z.string()).describe("Mots-clés sans espace, en minuscules, dont le code du cours et le thème"),
  source: z.string().describe("L'étiquette de la source, par exemple S2"),
});
export type Card = z.infer<typeof CardSchema>;

export const DeckSchema = z.object({
  cards: z.array(CardSchema),
});

const SYSTEM = `${GROUND_RULES}

Tu fabriques un paquet de **flashcards** destiné à la répétition espacée (Anki).

Ce qui fait une bonne carte :
- **Une seule chose par carte.** Si la réponse contient « et », coupe en deux cartes.
- **Le recto se comprend seul**, sans savoir d'où la carte vient : « En microéconomie, que mesure l'élasticité-prix de la demande ? », pas « Que mesure-t-elle ? ».
- **Le verso est la réponse nue** : un terme, une formule, une définition. Pas de paragraphe, pas de « Il s'agit de… ».
- Teste la **compréhension**, pas la reconnaissance de la mise en page des slides.
- Pour une définition, un symbole ou une date : type cloze, avec le terme à retrouver entre {{c1::…}}.
- Pour une formule : une carte « quand l'utilise-t-on », une carte « que vaut chaque symbole ». Pas une carte « recopie la formule ».
- Le terme technique anglais reste en anglais des deux côtés.

N'invente aucune carte sur un point absent des documents. Mieux vaut vingt bonnes cartes que soixante creuses.`;

export async function makeDeck(
  docs: CorpusDoc[],
  { count, focus }: { count: number; focus?: string },
): Promise<{ cards: Card[]; notes: string[] }> {
  if (!docs.length) throw new Error("Aucun document à traiter.");
  const context = await buildDocContext(docs);
  if (!context.blocks.length) {
    throw new Error(`Rien d'exploitable dans ces documents.\n${context.notes.map((n) => `  - ${n}`).join("\n")}`);
  }

  const instruction = [
    `Fabrique environ ${count} flashcards à partir de ces documents.`,
    focus ? `Reste sur : ${focus}.` : null,
    `Étiquettes de source utilisables : ${context.sources.map((s) => s.tag).join(", ")}.`,
    "Produis moins de cartes que demandé si la matière ne suffit pas ; ne remplis pas pour faire le compte.",
  ]
    .filter(Boolean)
    .join("\n");

  const deck = await generateStructured(
    { system: SYSTEM, content: [...context.blocks, { type: "text", text: instruction }], maxTokens: 32_000 },
    DeckSchema,
  );
  return { cards: deck.cards, notes: context.notes };
}

/** Un champ TSV pour Anki : pas de tabulation, les retours à la ligne en <br>. */
export function escapeAnkiField(s: string): string {
  return s.replace(/\r?\n/g, "<br>").replace(/\t/g, " ").trim();
}

/**
 * Deux fichiers séparés, parce qu'Anki importe un seul type de note par fichier :
 * `basic` (Recto/Verso) et `cloze` (Texte/Extra).
 */
export function toAnkiTsv(cards: Card[]): { basic?: string; cloze?: string } {
  const render = (subset: Card[], noteType: string) =>
    [
      "#separator:tab",
      "#html:true",
      `#notetype:${noteType}`,
      "#tags column:3",
      ...subset.map((c) =>
        [escapeAnkiField(c.front), escapeAnkiField(c.back), c.tags.map((t) => t.replace(/\s+/g, "-")).join(" ")].join("\t"),
      ),
    ].join("\n") + "\n";

  const basic = cards.filter((c) => c.type === "basic");
  const cloze = cards.filter((c) => c.type === "cloze");
  return {
    basic: basic.length ? render(basic, "Basic") : undefined,
    cloze: cloze.length ? render(cloze, "Cloze") : undefined,
  };
}

export function toMarkdown(cards: Card[], title: string): string {
  const lines = [`# Flashcards — ${title}`, "", `${cards.length} cartes.`, ""];
  for (const [i, c] of cards.entries()) {
    lines.push(`### ${i + 1}. ${c.type === "cloze" ? "Texte à trous" : "Question"} _(${c.source})_`);
    lines.push("", c.front, "");
    if (c.back.trim()) lines.push(`**→** ${c.back}`, "");
    if (c.tags.length) lines.push(`\`${c.tags.join("` `")}\``, "");
  }
  return lines.join("\n");
}
