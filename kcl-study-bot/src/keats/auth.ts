import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";

export interface Auth {
  /** Racine du site Moodle, sans slash final. */
  site: string;
  /** Jeton web service (celui de l'appli mobile). */
  token: string;
  /** Jeton privé renvoyé par le flux de connexion ; sert au SSO des liens. */
  privateToken?: string;
  username?: string;
  userId?: number;
  savedAt: string;
}

export function loadAuth(): Auth | undefined {
  // Un jeton passé par l'environnement gagne : pratique en CI ou en one-shot.
  if (CONFIG.keats.token) {
    return { site: CONFIG.keats.site, token: CONFIG.keats.token, savedAt: "env" };
  }
  if (!fs.existsSync(CONFIG.authFile)) return undefined;
  return JSON.parse(fs.readFileSync(CONFIG.authFile, "utf8")) as Auth;
}

export function requireAuth(): Auth {
  const auth = loadAuth();
  if (!auth) {
    throw new Error(
      "Pas de jeton KEATS. Lance `npm run kcl -- login` (il t'explique où le copier), " +
        "ou mets KEATS_TOKEN dans .env.",
    );
  }
  return auth;
}

export function saveAuth(auth: Auth): void {
  fs.mkdirSync(path.dirname(CONFIG.authFile), { recursive: true });
  const tmp = `${CONFIG.authFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(auth, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CONFIG.authFile);
  fs.chmodSync(CONFIG.authFile, 0o600);
}
