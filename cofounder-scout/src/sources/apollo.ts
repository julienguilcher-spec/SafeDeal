import { CONFIG } from "../config.js";
import type { SearchRecipe } from "../icp.js";
import { normalizeLinkedin, type RawCandidate, type Source } from "./types.js";

/**
 * Apollo.io People Search (https://docs.apollo.io/reference/people-search).
 * Search results do not consume enrichment credits; they return name, title,
 * headline, LinkedIn URL, current organization and employment history.
 * Email / phone are deliberately NOT requested: outreach happens on LinkedIn.
 */
interface ApolloPerson {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  headline?: string;
  linkedin_url?: string;
  city?: string;
  country?: string;
  organization?: { name?: string };
  employment_history?: Array<{
    organization_name?: string;
    title?: string;
    start_date?: string;
    end_date?: string | null;
  }>;
}

interface ApolloResponse {
  people?: ApolloPerson[];
  pagination?: { page: number; total_pages: number };
}

export const apolloSource: Source = {
  name: "apollo",
  enabled: Boolean(CONFIG.apollo.apiKey),

  async search(recipe: SearchRecipe, page: number): Promise<RawCandidate[]> {
    if (!recipe.apollo) return [];
    const body: Record<string, unknown> = {
      q_keywords: recipe.apollo.keywords,
      person_locations: CONFIG.apollo.locations,
      page,
      per_page: CONFIG.apollo.perPage,
    };
    if (recipe.apollo.titles?.length) body.person_titles = recipe.apollo.titles;

    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": CONFIG.apollo.apiKey!,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Apollo search failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as ApolloResponse;

    return (data.people ?? []).map((p) => {
      const linkedin = normalizeLinkedin(p.linkedin_url);
      const history = (p.employment_history ?? [])
        .slice(0, 8)
        .map((h) => `${h.title ?? "?"} @ ${h.organization_name ?? "?"} (${h.start_date?.slice(0, 4) ?? "?"}-${h.end_date ? h.end_date.slice(0, 4) : "now"})`)
        .join("; ");
      const name = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
      return {
        key: linkedin ?? `apollo:${p.id}`,
        name,
        headline: p.headline ?? p.title ?? "",
        details: history ? `Employment history: ${history}` : "",
        linkedinUrl: linkedin,
        location: [p.city, p.country].filter(Boolean).join(", ") || undefined,
        currentCompany: p.organization?.name,
        currentTitle: p.title,
        source: "apollo",
        recipeId: recipe.id,
      };
    });
  },
};
