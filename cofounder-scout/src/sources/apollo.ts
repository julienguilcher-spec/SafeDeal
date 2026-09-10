import { CONFIG } from "../config.js";
import type { SearchRecipe } from "../icp.js";
import { normalizeLinkedin, type RawCandidate, type Source } from "./types.js";

/**
 * Apollo.io People Search (https://docs.apollo.io/reference/people-search).
 * Search results do not consume credits, but since 2025 Apollo obfuscates the
 * last name ("Pa***d") and omits the LinkedIn URL for people not already in
 * your account. We therefore return *partial* candidates (first name, masked
 * last name, title, company) and let the runner resolve them either through
 * a Google lookup (free) or through people/match (1 credit, APOLLO_ENRICH=1).
 * Email / phone are deliberately NOT requested: outreach happens on LinkedIn.
 */
interface ApolloPerson {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
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
      const fullName = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
      const partial = !linkedin && !p.last_name;
      const name = partial ? [p.first_name, p.last_name_obfuscated].filter(Boolean).join(" ") : fullName;
      return {
        key: linkedin ?? `apollo:${p.id}`,
        name,
        partial,
        apolloId: p.id,
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

/**
 * Optional enrichment (1 Apollo credit per person). Only used when
 * APOLLO_ENRICH=1 and the free Google resolution failed or is not configured.
 */
export async function apolloEnrich(c: RawCandidate): Promise<RawCandidate | undefined> {
  if (!c.apolloId) return undefined;
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": CONFIG.apollo.apiKey! },
    body: JSON.stringify({ id: c.apolloId, reveal_personal_emails: false, reveal_phone_number: false }),
  });
  if (!res.ok) throw new Error(`Apollo enrich failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const person = ((await res.json()) as { person?: ApolloPerson }).person;
  if (!person) return undefined;
  const linkedin = normalizeLinkedin(person.linkedin_url);
  if (!linkedin) return undefined;
  const history = (person.employment_history ?? [])
    .slice(0, 8)
    .map((h) => `${h.title ?? "?"} @ ${h.organization_name ?? "?"} (${h.start_date?.slice(0, 4) ?? "?"}-${h.end_date ? h.end_date.slice(0, 4) : "now"})`)
    .join("; ");
  return {
    ...c,
    key: linkedin,
    name: person.name ?? [person.first_name, person.last_name].filter(Boolean).join(" "),
    headline: person.headline ?? c.headline,
    details: history ? `Employment history: ${history}` : c.details,
    linkedinUrl: linkedin,
    partial: false,
  };
}
