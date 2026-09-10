import { CONFIG } from "../config.js";
import type { SearchRecipe } from "../icp.js";
import { normalizeLinkedin, type RawCandidate, type Source } from "./types.js";

/**
 * Google Programmable Search JSON API, restricted to public LinkedIn profile
 * pages (site:linkedin.com/in). We only use what Google already indexes:
 * the page title ("Name - Headline - Company | LinkedIn") and the snippet.
 * 10 results per call, so one recipe = ceil(resultsPerRecipe / 10) calls.
 */
interface GoogleItem {
  title?: string;
  link?: string;
  snippet?: string;
}
interface GoogleResponse {
  items?: GoogleItem[];
  error?: { message?: string };
}

/** "Jane Doe - COO @ Foo - Paris | LinkedIn" -> { name, headline } */
export function parseLinkedinTitle(title: string): { name: string; headline: string } {
  const cleaned = title.replace(/\s*[|–-]\s*LinkedIn\s*$/i, "").trim();
  const parts = cleaned.split(/\s+[-–]\s+/);
  const name = (parts.shift() ?? cleaned).trim();
  return { name, headline: parts.join(" - ").trim() };
}

export const googleSource: Source = {
  name: "google",
  enabled: Boolean(CONFIG.google.apiKey && CONFIG.google.cx),

  async search(recipe: SearchRecipe, page: number): Promise<RawCandidate[]> {
    const out: RawCandidate[] = [];
    const perCall = 10;
    const calls = Math.ceil(CONFIG.google.resultsPerRecipe / perCall);
    // `page` shifts the window so day N+k sees deeper results for the same recipe.
    const baseStart = 1 + (page - 1) * CONFIG.google.resultsPerRecipe;

    for (let i = 0; i < calls; i++) {
      const start = baseStart + i * perCall;
      if (start > 91) break; // Google CSE caps at 100 results per query
      const params = new URLSearchParams({
        key: CONFIG.google.apiKey!,
        cx: CONFIG.google.cx!,
        q: `site:linkedin.com/in ${recipe.google}`,
        num: String(perCall),
        start: String(start),
        gl: "fr",
        hl: "fr",
      });
      const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      const data = (await res.json()) as GoogleResponse;
      if (!res.ok) {
        throw new Error(`Google CSE failed (${res.status}): ${data.error?.message ?? "unknown"}`);
      }
      const items = data.items ?? [];
      for (const it of items) {
        const linkedin = normalizeLinkedin(it.link);
        if (!linkedin || !it.title) continue;
        const { name, headline } = parseLinkedinTitle(it.title);
        out.push({
          key: linkedin,
          name,
          headline,
          details: it.snippet ?? "",
          linkedinUrl: linkedin,
          source: "google",
          recipeId: recipe.id,
        });
      }
      if (items.length < perCall) break;
    }
    return out;
  },
};

/**
 * Resolve a partial Apollo candidate ("Boris Pa***d, Co-founder @ Le Wagon")
 * into a public LinkedIn profile with one Google query. Returns undefined if
 * nothing convincing comes back (first name must match).
 */
export async function googleResolve(c: RawCandidate): Promise<RawCandidate | undefined> {
  if (!googleSource.enabled) return undefined;
  const firstName = c.name.split(" ")[0];
  const q = [`"${firstName}"`, c.currentCompany ? `"${c.currentCompany}"` : "", c.currentTitle ?? "", "site:linkedin.com/in"].filter(Boolean).join(" ");
  const params = new URLSearchParams({ key: CONFIG.google.apiKey!, cx: CONFIG.google.cx!, q, num: "5", gl: "fr", hl: "fr" });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  const data = (await res.json()) as GoogleResponse;
  if (!res.ok) throw new Error(`Google resolve failed (${res.status}): ${data.error?.message ?? "unknown"}`);
  for (const it of data.items ?? []) {
    const linkedin = normalizeLinkedin(it.link);
    if (!linkedin || !it.title) continue;
    const { name, headline } = parseLinkedinTitle(it.title);
    if (!name.toLowerCase().startsWith(firstName.toLowerCase())) continue;
    return {
      ...c,
      key: linkedin,
      name,
      headline: headline || c.headline,
      details: [c.details, it.snippet].filter(Boolean).join(" | "),
      linkedinUrl: linkedin,
      partial: false,
    };
  }
  return undefined;
}
