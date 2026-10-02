import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import type { Auth } from "./auth.js";

/** Erreur renvoyée par Moodle lui-même (jeton invalide, fonction interdite...). */
export class MoodleError extends Error {
  constructor(
    message: string,
    readonly errorcode: string,
    readonly wsfunction: string,
  ) {
    super(message);
    this.name = "MoodleError";
  }

  /** Vrai quand le jeton est mort : il faut refaire `kcl login`. */
  get isAuthProblem(): boolean {
    return ["invalidtoken", "accessexception", "invalidlogin", "sitemaintenance", "tokenexpired"].includes(
      this.errorcode,
    );
  }
}

/**
 * Aplatit des paramètres en notation tableau PHP, la seule que Moodle accepte :
 * `{ courseids: [4, 7] }` → `courseids[0]=4&courseids[1]=7`.
 */
export function serializeParams(params: unknown, prefix = ""): [string, string][] {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) {
    return params.flatMap((v, i) => serializeParams(v, prefix ? `${prefix}[${i}]` : String(i)));
  }
  if (typeof params === "object") {
    return Object.entries(params as Record<string, unknown>).flatMap(([k, v]) =>
      serializeParams(v, prefix ? `${prefix}[${k}]` : k),
    );
  }
  if (typeof params === "boolean") return [[prefix, params ? "1" : "0"]];
  return [[prefix, String(params)]];
}

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000];

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Une erreur Moodle est définitive : réessayer ne changera rien.
      if (err instanceof MoodleError) throw err;
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw new Error(`${label} a échoué après ${RETRY_DELAYS_MS.length + 1} tentatives : ${(lastErr as Error).message}`);
}

/**
 * Ajoute le jeton à une URL `pluginfile.php`, en passant par le point d'entrée
 * web service quand Moodle a renvoyé l'URL de navigateur.
 */
export function authorizeFileUrl(fileUrl: string, token: string): string {
  const url = new URL(fileUrl);
  if (url.pathname.includes("/pluginfile.php") && !url.pathname.includes("/webservice/pluginfile.php")) {
    url.pathname = url.pathname.replace("/pluginfile.php", "/webservice/pluginfile.php");
  }
  url.searchParams.set("token", token);
  // `forcedownload` évite les pages HTML d'aperçu sur certains types de fichiers.
  if (!url.searchParams.has("forcedownload")) url.searchParams.set("forcedownload", "1");
  return url.toString();
}

export class KeatsClient {
  constructor(private readonly auth: Auth) {}

  get site(): string {
    return this.auth.site.replace(/\/+$/, "");
  }

  /** Appelle une fonction web service Moodle et renvoie son JSON déjà vérifié. */
  async call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    const body = new URLSearchParams([
      ["wstoken", this.auth.token],
      ["wsfunction", wsfunction],
      ["moodlewsrestformat", "json"],
      ...serializeParams(params),
    ]);

    return withRetry(wsfunction, async () => {
      const res = await fetch(`${this.site}/webservice/rest/server.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${wsfunction}`);

      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`${wsfunction} n'a pas renvoyé du JSON (${text.slice(0, 120)})`);
      }

      // Moodle signale ses erreurs dans un 200 avec une clé `exception`.
      if (json && typeof json === "object" && "exception" in json) {
        const e = json as { errorcode?: string; message?: string };
        throw new MoodleError(e.message ?? "erreur Moodle", e.errorcode ?? "unknown", wsfunction);
      }
      return json as T;
    });
  }

  /**
   * Télécharge un fichier de cours. Renvoie `false` si rien n'a été écrit
   * parce que la version locale est déjà à jour.
   */
  async download(fileUrl: string, dest: string, expectedSize?: number): Promise<boolean> {
    if (expectedSize && expectedSize > CONFIG.keats.maxFileMb * 1024 * 1024) {
      throw new Error(`fichier trop gros (${Math.round(expectedSize / 1e6)} Mo > ${CONFIG.keats.maxFileMb} Mo)`);
    }
    const url = authorizeFileUrl(fileUrl, this.auth.token);

    return withRetry(`téléchargement de ${path.basename(dest)}`, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      // Jeton refusé : Moodle répond 200 avec un JSON d'erreur au lieu du fichier.
      if (res.headers.get("content-type")?.includes("application/json")) {
        const e = JSON.parse(buf.toString("utf8")) as { errorcode?: string; error?: string };
        throw new MoodleError(e.error ?? "téléchargement refusé", e.errorcode ?? "filenotfound", "pluginfile");
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return true;
    });
  }
}
