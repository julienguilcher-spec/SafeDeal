import { CONFIG } from "../config.js";
import { log, ok, step } from "../log.js";
import { loadAuth } from "../keats/auth.js";
import { KeatsClient } from "../keats/client.js";
import { getSiteInfo, hasFunction } from "../keats/api.js";
import {
  buildLaunchUrl, decodeLaunchToken, newPassport, promptToken, readPassport, savePassport, tokenPageUrl,
  validateAndSave,
} from "../keats/login.js";
import { has, one, type Args } from "../args.js";

export async function login(args: Args): Promise<void> {
  const site = one(args, "site") ?? CONFIG.keats.site;

  // Mode « appli mobile » : on imprime l'URL du SSO, l'étudiant·e colle le retour.
  if (has(args, "launch")) {
    const passport = newPassport();
    savePassport(passport);
    log(`
Ouvre cette URL dans ton navigateur et connecte-toi normalement à KCL :

    ${buildLaunchUrl(site, passport)}

À la fin, le navigateur essaiera d'ouvrir un lien « moodlemobile://token=… ».
Il ne s'ouvrira pas (tu n'as pas l'appli) : copie ce lien depuis la barre
d'adresse ou le message d'erreur, puis lance :

    npm run kcl -- login --url "moodlemobile://token=..."
`);
    return;
  }

  const url = one(args, "url");
  let token = one(args, "token");
  let privateToken: string | undefined;

  if (url) {
    const decoded = decodeLaunchToken(url, site, readPassport());
    token = decoded.token;
    privateToken = decoded.privateToken;
  }
  token ??= await promptToken(site);
  if (!token) throw new Error("Aucun jeton fourni.");

  step("Vérification auprès de KEATS…");
  const auth = await validateAndSave(site, token, privateToken);
  ok(`Connecté en tant que ${auth.username} (id ${auth.userId}). Jeton enregistré dans ${CONFIG.authFile}.`);
  log("Prochaine étape : `npm run kcl -- sync`");
}

/** Diagnostic : jeton valide ? fonctions nécessaires exposées ? */
export async function doctor(): Promise<void> {
  const auth = loadAuth();
  log(`Site      : ${CONFIG.keats.site}`);
  log(`Jeton     : ${auth ? (auth.savedAt === "env" ? "via KEATS_TOKEN" : CONFIG.authFile) : "absent"}`);
  log(`Modèle    : ${CONFIG.anthropic.model} (effort ${CONFIG.anthropic.effort})`);
  log(`Clé API   : ${process.env.ANTHROPIC_API_KEY ? "présente" : "absente — ANTHROPIC_API_KEY n'est pas défini"}`);
  if (!auth) {
    log(`\nPas de jeton. Va sur ${tokenPageUrl(CONFIG.keats.site)} puis lance \`kcl login\`.`);
    return;
  }

  const info = await getSiteInfo(new KeatsClient(auth));
  ok(`${info.sitename} — connecté en tant que ${info.username} (Moodle ${info.release ?? "?"})`);
  log(`Téléchargement de fichiers : ${info.downloadfiles === 0 ? "REFUSÉ par le site" : "autorisé"}`);

  const needed = [
    ["core_enrol_get_users_courses", "lister tes cours"],
    ["core_course_get_contents", "lire le contenu d'un cours"],
    ["mod_page_get_pages_by_courses", "lire les pages Moodle"],
    ["mod_assign_get_assignments", "lire les énoncés de devoirs"],
    ["core_calendar_get_action_events_by_timesort", "lister les échéances"],
  ] as const;
  for (const [fn, why] of needed) {
    log(`${hasFunction(info, fn) ? "  ✓" : "  ✗"} ${fn} — ${why}`);
  }
}
