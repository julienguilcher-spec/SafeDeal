import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { loadManifest, resolveCourse, slug, writeAtomic } from "../corpus.js";
import { ask, type AskMode } from "../ai/ask.js";
import { log, ok, step, warn } from "../log.js";
import { has, int, one, type Args } from "../args.js";

export async function runAsk(args: Args, mode: AskMode): Promise<void> {
  const fromFile = one(args, "file");
  const question = fromFile
    ? fs.readFileSync(path.resolve(fromFile), "utf8").trim()
    : args.positional.join(" ").trim();
  if (!question) {
    throw new Error(
      mode === "solve"
        ? 'Donne l\'exercice : kcl solve "un monopole avec c(q)=2q..." (ou --file enonce.txt)'
        : 'Donne ta question : kcl ask "pourquoi la courbe de demande est-elle décroissante ?"',
    );
  }

  const courseName = one(args, "course");
  const courseId = courseName ? resolveCourse(loadManifest(), courseName).id : undefined;

  step(mode === "solve" ? "Résolution…" : "Recherche dans tes cours…");
  const answer = await ask(question, { mode, courseId, topK: int(args, "top", CONFIG.search.topK) });
  if (!answer.hits.length) {
    warn("Aucun passage de tes cours ne correspond : la réponse ci-dessous sort du cadre de tes documents.");
  }

  log(`\n${answer.markdown}`);

  if (has(args, "save")) {
    const stem = slug(question.slice(0, 50)) || "reponse";
    const file = one(args, "out") ?? path.join(CONFIG.outDir, mode === "solve" ? "exercices" : "reponses", `${stem}.md`);
    writeAtomic(path.resolve(file), `# ${question}\n\n${answer.markdown}`);
    ok(`sauvegardé dans ${file}`);
  }
}
