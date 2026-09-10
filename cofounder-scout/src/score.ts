import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CONFIG } from "./config.js";
import { ICP } from "./icp.js";
import type { RawCandidate } from "./sources/types.js";

export const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Overall fit for the cofounder / first-hire role, 0-100"),
  verdict: z.enum(["shortlist", "maybe", "reject"]),
  is_french: z.enum(["yes", "likely", "unclear", "no"]),
  estimated_age_band: z.enum(["under_25", "25_40", "over_40", "unknown"]),
  profile_type: z.enum(["business", "tech", "hybrid"]).describe("business = GTM/ops/program/partnerships; tech = AI/ML engineer, CTO, researcher; hybrid = both credibly"),
  best_fit: z.enum(["cofounder", "first_employee", "either"]).describe("cofounder = has founded before or shows clear appetite for risk and ownership; first_employee = strong operator/engineer more likely to join an existing founder"),
  matched_signals: z.array(z.string()).describe("Which ICP strong signals this person matches, quoting the evidence"),
  concerns: z.array(z.string()).describe("Red flags or missing information"),
  one_liner: z.string().describe("One sentence, in French, summarizing who this person is for a busy founder"),
  outreach_hook: z.string().describe("One sentence, in French, suggesting a personalized angle for a first LinkedIn message"),
});
export type Score = z.infer<typeof ScoreSchema>;

export interface ScoredCandidate extends RawCandidate {
  score: Score;
}

const SYSTEM_PROMPT = `You are a senior startup recruiter helping a founder find a cofounder or first employee.

## The role
${ICP.role}

## Must-haves (violations are serious; mark them in concerns and lower the score)
${ICP.must.map((m) => `- ${m}`).join("\n")}

## Strong signals (two or more of these usually means a shortlist)
${ICP.strongSignals.map((s) => `- ${s}`).join("\n")}

## Negatives
${ICP.negatives.map((n) => `- ${n}`).join("\n")}

## Scoring guide
- 80-100: shortlist. Clearly French, right age band, 2+ strong signals, plausibly open to a cofounder / early-stage role.
- 60-79: maybe. Good signals but one thing unclear (age, nationality, appetite for risk).
- 0-59: reject.
Label profile_type (business / tech / hybrid). Technical profiles are welcome and scored on the same scale as business ones: a strong French AI engineer who teaches or mentors is a shortlist, not a maybe. Label best_fit: "cofounder" if the person has already founded something or clearly signals wanting to build (EIR, "next adventure", "en réflexion", exited founder); "first_employee" if the person is a strong operator or engineer without founder signals; "either" when both are plausible.
You only see a LinkedIn headline, a snippet, and sometimes an employment history. Do not invent facts. When something is unknown, say "unclear" or "unknown" rather than guessing. Estimate age from graduation years (bachelor at ~22, grande école diploma at ~23-24) or from total career length. A French grande école, a French-sounding name combined with Paris, or French-language text are all evidence of being French; a non-French school abroad with no French link is evidence against. Write one_liner and outreach_hook in French, tutoiement is fine.`;

const client = new Anthropic();

export async function scoreCandidate(c: RawCandidate): Promise<Score> {
  if (CONFIG.mock.scorer) return mockScore(c);

  const profile = [
    `Name: ${c.name}`,
    `Headline: ${c.headline || "(none)"}`,
    c.currentTitle ? `Current title: ${c.currentTitle}` : null,
    c.currentCompany ? `Current company: ${c.currentCompany}` : null,
    c.location ? `Location: ${c.location}` : null,
    c.details ? `Details: ${c.details}` : null,
    `Found via search: ${c.recipeId} (${c.source})`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.parse({
    model: CONFIG.anthropic.model,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: zodOutputFormat(ScoreSchema) },
    messages: [{ role: "user", content: `Evaluate this profile:\n\n${profile}` }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude refused to score ${c.name}`);
  }
  if (!response.parsed_output) {
    throw new Error(`Claude returned unparseable output for ${c.name} (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** Score many candidates with bounded concurrency; failures are logged and skipped. */
export async function scoreAll(candidates: RawCandidate[], concurrency = 4): Promise<ScoredCandidate[]> {
  const out: ScoredCandidate[] = [];
  let i = 0;
  const worker = async () => {
    while (i < candidates.length) {
      const c = candidates[i++];
      try {
        out.push({ ...c, score: await scoreCandidate(c) });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          await new Promise((r) => setTimeout(r, 15_000));
          i--; // retry the same candidate after backoff
          continue;
        }
        console.error(`[score] skipped ${c.name}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return out;
}

/** Deterministic keyword-based stand-in so the pipeline runs without an API key. */
function mockScore(c: RawCandidate): Score {
  const text = `${c.headline} ${c.details} ${c.location ?? ""}`.toLowerCase();
  const has = (words: readonly string[]) => words.some((w) => text.includes(w.toLowerCase()));
  let score = 30;
  const matched: string[] = [];
  if (has(ICP.keywords.schools)) { score += 20; matched.push("Top French school"); }
  if (has(ICP.keywords.aiLabs)) { score += 15; matched.push("AI lab"); }
  if (has(ICP.keywords.eduCompanies)) { score += 20; matched.push("Education company"); }
  if (has(ICP.keywords.founderTitles)) { score += 15; matched.push("Founder/exec title"); }
  const french = /paris|france/.test(text) ? "likely" : "unclear";
  if (french === "unclear") score -= 25;
  if (/199\d|198\d/.test(text)) score -= 30;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    verdict: score >= 80 ? "shortlist" : score >= 60 ? "maybe" : "reject",
    is_french: french,
    estimated_age_band: /199\d|198\d/.test(text) ? "over_40" : "25_40",
    profile_type: /engineer|scientist|cto|research/.test(text) ? "tech" : "business",
    best_fit: has(ICP.keywords.founderTitles) || /residence|next adventure/.test(text) ? "cofounder" : "first_employee",
    matched_signals: matched,
    concerns: matched.length ? [] : ["No ICP signal detected"],
    one_liner: `${c.name} — ${c.headline}`,
    outreach_hook: "Mock hook: mentionner son parcours et la vision de l'école.",
  };
}
