import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { writeAtomic } from "../corpus.js";
import { makeSheet, type SheetMode } from "../ai/fiche.js";
import { makeDeck, toAnkiTsv, toMarkdown } from "../ai/flashcards.js";
import { makeQuiz, renderQuiz } from "../ai/quiz.js";
import { assertReasonableScope, outputStem, select } from "../select.js";
import { log, ok, step, warn } from "../log.js";
import { int, one, type Args } from "../args.js";

function reportNotes(notes: string[]): void {
  for (const n of notes) warn(`  ${n}`);
}

function destination(args: Args, subdir: string, stem: string, ext: string): string {
  const explicit = one(args, "out");
  if (explicit) return path.resolve(explicit);
  return path.join(CONFIG.outDir, subdir, `${stem}.${ext}`);
}

export async function runSheet(args: Args, mode: SheetMode): Promise<void> {
  const selection = select(args, one(args, "course") ?? args.positional[0]);
  assertReasonableScope(selection, args);

  step(`${mode === "fiche" ? "Fiche" : "Résumé"} — ${selection.label} (${selection.docs.length} doc(s))`);
  const sheet = await makeSheet(selection.docs, {
    mode,
    title: selection.label,
    focus: one(args, "focus"),
  });
  reportNotes(sheet.notes);

  const file = destination(args, mode === "fiche" ? "fiches" : "resumes", outputStem(selection.label), "md");
  writeAtomic(file, sheet.markdown);
  ok(`écrit dans ${file}`);
  if (args.booleans.has("print")) log(`\n${sheet.markdown}`);
}

export async function runFlashcards(args: Args): Promise<void> {
  const selection = select(args, one(args, "course") ?? args.positional[0]);
  assertReasonableScope(selection, args);

  const count = int(args, "count", 40);
  step(`Flashcards — ${selection.label} (objectif ${count})`);
  const { cards, notes } = await makeDeck(selection.docs, { count, focus: one(args, "focus") });
  reportNotes(notes);
  if (!cards.length) {
    warn("Aucune carte produite : la matière sélectionnée est probablement trop mince.");
    return;
  }

  // Avec --out, c'est le nom demandé qui sert de base aux trois fichiers.
  const target = destination(args, "flashcards", outputStem(selection.label), "md");
  const dir = path.dirname(target);
  const stem = path.basename(target).replace(/\.[^.]+$/, "");
  fs.mkdirSync(dir, { recursive: true });

  const { basic, cloze } = toAnkiTsv(cards);
  const written: string[] = [];
  if (basic) {
    writeAtomic(path.join(dir, `${stem}.basic.tsv`), basic);
    written.push(`${stem}.basic.tsv`);
  }
  if (cloze) {
    writeAtomic(path.join(dir, `${stem}.cloze.tsv`), cloze);
    written.push(`${stem}.cloze.tsv`);
  }
  writeAtomic(path.join(dir, `${stem}.md`), toMarkdown(cards, selection.label));
  written.push(`${stem}.md`);

  ok(`${cards.length} cartes dans ${dir} : ${written.join(", ")}`);
  log("Dans Anki : Fichier → Importer, séparateur « Tabulation », et laisse le type de note proposé par l'en-tête.");
}

export async function runQuiz(args: Args): Promise<void> {
  const selection = select(args, one(args, "course") ?? args.positional[0]);
  assertReasonableScope(selection, args);

  const count = int(args, "count", 12);
  step(`Examen blanc — ${selection.label} (${count} questions)`);
  const { questions, notes } = await makeQuiz(selection.docs, { count, focus: one(args, "focus") });
  reportNotes(notes);

  const file = destination(args, "quiz", outputStem(selection.label), "md");
  writeAtomic(file, renderQuiz(questions, selection.label));
  ok(`${questions.length} questions dans ${file}`);
  log("Le corrigé est à la fin du fichier : fais le sujet avant de dérouler.");
}
