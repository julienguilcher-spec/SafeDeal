/** A person surfaced by one of the sources, before scoring. */
export interface RawCandidate {
  /** Stable identity key: normalized LinkedIn URL when available, else `${source}:${id}`. */
  key: string;
  name: string;
  headline: string;
  /** Any extra text we have (snippet, employment history, education). */
  details: string;
  linkedinUrl?: string;
  location?: string;
  currentCompany?: string;
  currentTitle?: string;
  source: "apollo" | "google" | "mock";
  recipeId: string;
  /**
   * True when the source only gave a partial identity (Apollo search results
   * obfuscate last names and omit the LinkedIn URL). The runner tries to
   * resolve these into a full profile before scoring.
   */
  partial?: boolean;
  /** Apollo person id, needed for the optional people/match enrichment. */
  apolloId?: string;
}

export interface Source {
  name: string;
  enabled: boolean;
  search(recipe: import("../icp.js").SearchRecipe, page: number): Promise<RawCandidate[]>;
}

/** Normalize a LinkedIn profile URL so the same person from two sources dedups. */
export function normalizeLinkedin(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!u.hostname.endsWith("linkedin.com")) return undefined;
    const m = u.pathname.match(/\/in\/([^/?#]+)/i);
    if (!m) return undefined;
    return `https://www.linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}`;
  } catch {
    return undefined;
  }
}
