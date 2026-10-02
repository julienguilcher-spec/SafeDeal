import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { CONFIG } from "../config.js";
import { saveAuth, type Auth } from "./auth.js";
import { KeatsClient } from "./client.js";
import { getSiteInfo } from "./api.js";

const passportFile = path.join(CONFIG.dataDir, ".login-passport");

/** Page où un étudiant peut lire son propre jeton web service. */
export function tokenPageUrl(site: string): string {
  return `${site}/user/managetoken.php`;
}

/**
 * URL du flux de connexion de l'appli mobile Moodle. Elle passe par le SSO de
 * la fac puis redirige vers `moodlemobile://token=...`, que l'appli intercepte.
 */
export function buildLaunchUrl(site: string, passport: string): string {
  const u = new URL(`${site}/admin/tool/mobile/launch.php`);
  u.searchParams.set("service", CONFIG.keats.service);
  u.searchParams.set("passport", passport);
  u.searchParams.set("urlscheme", "moodlemobile");
  return u.toString();
}

export function newPassport(): string {
  // Moodle attend un nombre ; l'appli officielle tire un aléatoire sur [0, 1000).
  return String(crypto.randomInt(0, 1_000_000) / 1000);
}

export function savePassport(passport: string): void {
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
  fs.writeFileSync(passportFile, passport, { mode: 0o600 });
}

export function readPassport(): string | undefined {
  return fs.existsSync(passportFile) ? fs.readFileSync(passportFile, "utf8").trim() : undefined;
}

/**
 * Décode l'URL de retour du flux mobile : `moodlemobile://token=<base64>`,
 * où le base64 vaut `md5(site + passport):::<jeton>[:::<jeton privé>]`.
 * La signature est vérifiée quand on connaît le passport utilisé.
 */
export function decodeLaunchToken(
  raw: string,
  site: string,
  passport?: string,
): { token: string; privateToken?: string } {
  const match = raw.match(/token=([^&\s]+)/);
  if (!match) throw new Error("URL inattendue : il faut la forme `moodlemobile://token=...`");

  const decoded = Buffer.from(decodeURIComponent(match[1]), "base64").toString("utf8");
  const parts = decoded.split(":::");
  if (parts.length < 2) throw new Error("Jeton illisible : le contenu base64 n'a pas la forme attendue");

  const [signature, token, privateToken] = parts;
  if (passport) {
    const expected = crypto.createHash("md5").update(`${site}${passport}`).digest("hex");
    if (signature !== expected) {
      throw new Error("Signature invalide : relance `kcl login --launch` et refais la connexion dans le navigateur");
    }
  }
  if (!token) throw new Error("Jeton vide");
  return { token, privateToken: privateToken || undefined };
}

/** Vérifie le jeton auprès du site, puis l'écrit dans data/auth.json. */
export async function validateAndSave(site: string, token: string, privateToken?: string): Promise<Auth> {
  const probe: Auth = { site, token, privateToken, savedAt: new Date().toISOString() };
  const info = await getSiteInfo(new KeatsClient(probe));
  const auth: Auth = { ...probe, username: info.username, userId: info.userid };
  saveAuth(auth);
  fs.rmSync(passportFile, { force: true });
  return auth;
}

export async function promptToken(site: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`
Ouvre cette page (connecté à KEATS) :

    ${tokenPageUrl(site)}

Copie la clé de la ligne « Moodle mobile web service » (une suite de 32 caractères).
Si la page est vide, clique sur « Create token » / « Créer un jeton » pour le service mobile.
`);
    return (await rl.question("Jeton : ")).trim();
  } finally {
    rl.close();
  }
}
