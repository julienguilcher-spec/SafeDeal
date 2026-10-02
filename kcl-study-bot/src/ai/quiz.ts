import { z } from "zod";
import { generateStructured } from "./client.js";
import { buildDocContext } from "./context.js";
import { GROUND_RULES } from "./prompts.js";
import type { CorpusDoc } from "../corpus.js";

export const QuestionSchema = z.object({
  kind: z.enum(["qcm", "ouverte", "calcul"]),
  difficulty: z.enum(["facile", "moyen", "difficile"]),
  question: z.string(),
  options: z
    .array(z.string())
    .describe("Pour un qcm : 4 propositions, dont des distracteurs plausibles issus d'erreurs réelles. Sinon : vide"),
  answer: z.string().describe("La réponse attendue. Pour un qcm, la lettre puis la proposition"),
  explanation: z.string().describe("Pourquoi cette réponse, et pourquoi les autres sont fausses"),
  source: z.string().describe("L'étiquette de la source, par exemple S2"),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = z.object({ questions: z.array(QuestionSchema) });

const SYSTEM = `${GROUND_RULES}

Tu écris un **examen blanc** sur ces documents.

- Couvre toute la matière fournie, pas seulement le début.
- Dose : environ un tiers facile (restitution), un tiers moyen (application), un tiers difficile (transfert, cas limite, piège).
- Les distracteurs d'un QCM sont des **erreurs que de vrais étudiants font** : signe inversé, mauvaise unité, confusion entre deux concepts voisins. Jamais d'option absurde.
- Les questions de calcul ont des nombres qui tombent juste et une réponse vérifiable.
- L'explication dit pourquoi la bonne réponse est bonne **et** pourquoi chaque mauvaise est fausse.
- Formule les questions dans le style de l'évaluation du cours quand les documents le montrent.`;

export async function makeQuiz(
  docs: CorpusDoc[],
  { count, focus }: { count: number; focus?: string },
): Promise<{ questions: Question[]; notes: string[] }> {
  if (!docs.length) throw new Error("Aucun document à traiter.");
  const context = await buildDocContext(docs);
  if (!context.blocks.length) {
    throw new Error(`Rien d'exploitable dans ces documents.\n${context.notes.map((n) => `  - ${n}`).join("\n")}`);
  }

  const quiz = await generateStructured(
    {
      system: SYSTEM,
      content: [
        ...context.blocks,
        {
          type: "text",
          text: [
            `Écris ${count} questions.`,
            focus ? `Reste sur : ${focus}.` : null,
            `Étiquettes de source utilisables : ${context.sources.map((s) => s.tag).join(", ")}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      maxTokens: 32_000,
    },
    QuizSchema,
  );
  return { questions: quiz.questions, notes: context.notes };
}

/** Sujet d'abord, corrigé ensuite : on peut s'entraîner sans voir les réponses. */
export function renderQuiz(questions: Question[], title: string): string {
  const paper = [`# Examen blanc — ${title}`, "", `${questions.length} questions.`, ""];
  const key = ["", "---", "", "# Corrigé", ""];

  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    paper.push(`### ${n}. ${q.question}`, "", `_${q.kind} · ${q.difficulty}_`, "");
    if (q.options.length) {
      paper.push(...q.options.map((o, j) => `- **${String.fromCharCode(65 + j)}.** ${o}`), "");
    }
    key.push(`### ${n}. ${q.answer}`, "", q.explanation, "", `_Source : ${q.source}_`, "");
  }
  return [...paper, ...key].join("\n");
}
