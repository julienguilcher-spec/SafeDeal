import path from "node:path";
import { fileURLToPath } from "node:url";

// Charger .env avant tout import qui lit la configuration.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"));
} catch {
  // Pas de .env : tout peut venir de l'environnement.
}

const { parseArgs } = await import("./args.js");
const { fail, log } = await import("./log.js");
const { MoodleError } = await import("./keats/client.js");

const HELP = `kcl — tes cours KEATS, en fiches, flashcards, quiz et réponses.

  Mise en route
    login                     Enregistre ton jeton KEATS (interactif)
    login --launch            Variante SSO : imprime l'URL de connexion mobile
    login --url "<lien>"      Termine la variante SSO avec le lien récupéré
    login --token <jeton>     Jeton collé directement
    doctor                    Vérifie jeton, droits et clé API

  Récupérer les cours
    sync                      Synchronise tous tes cours (incrémental)
    sync --course ECON        Limite à certains cours (répétable)
    sync --force              Re-télécharge tout
    reindex                   Reconstruit l'index sans retélécharger
    courses                   Liste les cours synchronisés
    docs <cours>              Liste les documents d'un cours
    agenda [--days 21]        Prochaines échéances

  Travailler la matière
    fiche <cours> [filtres]       Fiche de révision structurée
    resume <cours> [filtres]      Résumé suivi
    flashcards <cours> [--count]  Paquet Anki (.tsv) + version lisible
    quiz <cours> [--count]        Examen blanc avec corrigé

  Poser des questions
    search "<requête>"        Recherche locale, sans appel à l'API
    ask "<question>"          Réponse argumentée, citée, sur tes cours
    solve "<exercice>"        Résolution pas à pas, méthode du cours
      --file <chemin>         Lit l'énoncé dans un fichier
      --save                  Écrit la réponse dans data/out/

  Filtres (fiche / resume / flashcards / quiz)
    --section "Week 3"        Par section du cours (répétable)
    --doc <id>                Par document précis (voir \`docs\`, répétable)
    --grep <mot>              Par mot dans le titre
    --focus "<consigne>"      Oriente la génération
    --all                     Confirme un périmètre très large
    --out <fichier>           Chemin de sortie
    --print                   Affiche aussi le résultat

  Communs
    --course <cours>          Restreint à un cours (ask / solve / search)
    --top <n>                 Nombre de passages retenus
    --quiet                   Moins de bavardage
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      log(HELP);
      return;

    case "login":
      return (await import("./commands/auth.js")).login(args);
    case "doctor":
      return (await import("./commands/auth.js")).doctor();

    case "sync":
      return (await import("./commands/corpus.js")).runSync(args);
    case "reindex":
      return (await import("./commands/corpus.js")).runReindex();
    case "courses":
      return (await import("./commands/corpus.js")).listCourses();
    case "docs":
      return (await import("./commands/corpus.js")).listDocs(args);
    case "search":
      return (await import("./commands/corpus.js")).searchCorpus(args);
    case "agenda":
      return (await import("./commands/corpus.js")).showAgenda(args);

    case "fiche":
      return (await import("./commands/generate.js")).runSheet(args, "fiche");
    case "resume":
    case "résumé":
      return (await import("./commands/generate.js")).runSheet(args, "resume");
    case "flashcards":
    case "cards":
      return (await import("./commands/generate.js")).runFlashcards(args);
    case "quiz":
      return (await import("./commands/generate.js")).runQuiz(args);

    case "ask":
      return (await import("./commands/tutor.js")).runAsk(args, "ask");
    case "solve":
      return (await import("./commands/tutor.js")).runAsk(args, "solve");

    default:
      fail(`Commande inconnue : ${command}`);
      log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  if (err instanceof MoodleError && err.isAuthProblem) {
    fail(`KEATS a refusé le jeton (${err.errorcode}). Refais \`npm run kcl -- login\`.`);
  } else if (err instanceof Error && err.name === "AuthenticationError") {
    fail("Clé Anthropic refusée : vérifie ANTHROPIC_API_KEY dans .env.");
  } else {
    fail(err instanceof Error ? err.message : String(err));
  }
  process.exitCode = 1;
});
