import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${v}"`);
  return n;
}

export const CONFIG = {
  /** Where the pipeline keeps its memory (seen candidates, recipe cursor). */
  stateFile: env("SCOUT_STATE_FILE", path.resolve(here, "../data/state.json"))!,
  /** Last rendered digest is also written here for inspection. */
  lastDigestFile: path.resolve(here, "../data/last-digest.html"),

  /** Campaign window: the bot silently no-ops after this date (YYYY-MM-DD). */
  campaignEnd: env("SCOUT_CAMPAIGN_END", "2026-11-10")!,

  /** How many candidates to shortlist per day. */
  shortlistSize: envInt("SCOUT_SHORTLIST_SIZE", 5),
  /** Minimum Claude score (0-100) to be eligible for the shortlist. */
  minScore: envInt("SCOUT_MIN_SCORE", 60),
  /** Recipes queried per day (rotated); more = wider net, more API calls. */
  recipesPerDay: envInt("SCOUT_RECIPES_PER_DAY", 3),
  /** Max raw candidates sent to Claude per day (cost cap). */
  maxToScore: envInt("SCOUT_MAX_TO_SCORE", 40),

  anthropic: {
    model: env("SCOUT_MODEL", "claude-opus-5")!,
  },

  apollo: {
    apiKey: env("APOLLO_API_KEY"),
    perPage: envInt("APOLLO_PER_PAGE", 25),
    locations: (env("APOLLO_LOCATIONS", "Paris, France")!).split("|"),
  },

  google: {
    apiKey: env("GOOGLE_CSE_KEY"),
    cx: env("GOOGLE_CSE_CX"),
    resultsPerRecipe: envInt("GOOGLE_RESULTS_PER_RECIPE", 20),
  },

  email: {
    to: env("DIGEST_TO"),
    from: env("DIGEST_FROM", env("SMTP_USER")),
    smtpHost: env("SMTP_HOST", "smtp.gmail.com")!,
    smtpPort: envInt("SMTP_PORT", 465),
    smtpUser: env("SMTP_USER"),
    smtpPass: env("SMTP_PASS"),
  },

  mock: {
    sources: env("MOCK_SOURCES") === "1",
    scorer: env("MOCK_SCORER") === "1",
  },
};

export type Config = typeof CONFIG;
