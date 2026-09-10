import fs from "node:fs";
import { CONFIG } from "./config.js";
import { ICP, RECIPES, type SearchRecipe } from "./icp.js";
import { renderDigest, sendDigest } from "./email.js";
import { scoreAll, type ScoredCandidate } from "./score.js";
import { apolloSource } from "./sources/apollo.js";
import { googleSource } from "./sources/google.js";
import { mockSource } from "./sources/mock.js";
import type { RawCandidate, Source } from "./sources/types.js";
import { loadState, saveState } from "./state.js";

const DRY_RUN = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);

function log(msg: string) {
  console.log(`[scout ${today}] ${msg}`);
}

/** Pick today's recipes by rotating a cursor through the list. */
function pickRecipes(cursor: number, n: number): { recipes: SearchRecipe[]; nextCursor: number } {
  const recipes: SearchRecipe[] = [];
  for (let i = 0; i < Math.min(n, RECIPES.length); i++) {
    recipes.push(RECIPES[(cursor + i) % RECIPES.length]);
  }
  return { recipes, nextCursor: (cursor + n) % RECIPES.length };
}

/**
 * Cheap keyword pre-filter so we don't pay Claude for obvious misses.
 * A candidate passes if it has any ICP keyword OR we have almost no text
 * (Google snippets can be thin; let Claude decide in that case).
 */
export function prefilter(c: RawCandidate): boolean {
  const text = `${c.headline} ${c.details} ${c.currentTitle ?? ""} ${c.currentCompany ?? ""}`.toLowerCase();
  if (!c.name || c.name.length < 3) return false;
  if (text.trim().length < 20) return true;
  const all = [
    ...ICP.keywords.schools,
    ...ICP.keywords.aiLabs,
    ...ICP.keywords.eduCompanies,
    ...ICP.keywords.founderTitles,
    "startup", "edtech", "école", "school", "bootcamp", "program", "mckinsey", "bcg", "bain", "coo", "cbo", "chief of staff",
  ];
  return all.some((k) => text.includes(k.toLowerCase()));
}

/** Rank scored candidates: verdict first, then score, then must-have flags. */
export function rank(cands: ScoredCandidate[]): ScoredCandidate[] {
  const penalty = (c: ScoredCandidate) =>
    (c.score.is_french === "no" ? 100 : c.score.is_french === "unclear" ? 8 : 0) +
    (c.score.estimated_age_band === "over_40" || c.score.estimated_age_band === "under_25" ? 100 : c.score.estimated_age_band === "unknown" ? 5 : 0);
  return [...cands].sort((a, b) => b.score.score - penalty(b) - (a.score.score - penalty(a)));
}

async function main() {
  if (today > CONFIG.campaignEnd) {
    log(`campaign ended on ${CONFIG.campaignEnd}; nothing to do`);
    return;
  }

  const sources: Source[] = CONFIG.mock.sources ? [mockSource] : [apolloSource, googleSource].filter((s) => s.enabled);
  if (sources.length === 0) {
    throw new Error("No source configured. Set APOLLO_API_KEY and/or GOOGLE_CSE_KEY + GOOGLE_CSE_CX (or MOCK_SOURCES=1).");
  }
  log(`sources: ${sources.map((s) => s.name).join(", ")}${DRY_RUN ? " (dry run, no email, state not saved)" : ""}`);

  const state = loadState();
  const { recipes, nextCursor } = pickRecipes(state.recipeCursor, CONFIG.recipesPerDay);
  log(`recipes: ${recipes.map((r) => r.id).join(", ")}`);

  // 1. Fetch
  const raw = new Map<string, RawCandidate>();
  for (const recipe of recipes) {
    const page = state.recipePages[recipe.id] ?? 1;
    for (const source of sources) {
      try {
        const found = await source.search(recipe, page);
        for (const c of found) if (!raw.has(c.key)) raw.set(c.key, c);
        log(`${source.name}/${recipe.id} page ${page}: ${found.length} results`);
      } catch (err) {
        console.error(`[fetch] ${source.name}/${recipe.id} failed: ${(err as Error).message}`);
      }
    }
    state.recipePages[recipe.id] = page + 1;
  }

  // 2. Dedup against history + pre-filter + cost cap
  const fresh = [...raw.values()].filter((c) => !state.seen[c.key]);
  const eligible = fresh.filter(prefilter).slice(0, CONFIG.maxToScore);
  log(`fetched ${raw.size} · new ${fresh.length} · to score ${eligible.length}`);

  // Mark everything we fetched as seen so tomorrow digs into new people.
  for (const c of raw.values()) {
    state.seen[c.key] ??= { name: c.name, firstSeen: today };
  }

  // 3. Score with Claude
  const scored = await scoreAll(eligible);
  for (const c of scored) state.seen[c.key].score = c.score.score;

  // 4. Shortlist
  const shortlist = rank(scored)
    .filter((c) => c.score.score >= CONFIG.minScore && c.score.verdict !== "reject")
    .slice(0, CONFIG.shortlistSize);
  for (const c of shortlist) state.seen[c.key].shortlistedOn = today;
  log(`shortlisted ${shortlist.length}: ${shortlist.map((c) => `${c.name} (${c.score.score})`).join(", ") || "none"}`);

  // 5. Digest
  const digest = renderDigest(today, shortlist, { fetched: raw.size, scored: scored.length, recipes: recipes.map((r) => r.label) });
  fs.mkdirSync(CONFIG.lastDigestFile.replace(/[^/]+$/, ""), { recursive: true });
  fs.writeFileSync(CONFIG.lastDigestFile, digest.html);

  if (DRY_RUN) {
    console.log("\n" + digest.text);
    log(`dry run: digest written to ${CONFIG.lastDigestFile}`);
    return;
  }

  await sendDigest(digest);
  log(`digest sent to ${CONFIG.email.to}`);

  state.recipeCursor = nextCursor;
  state.runs.push({ date: today, recipes: recipes.map((r) => r.id), fetched: raw.size, scored: scored.length, shortlisted: shortlist.length });
  saveState(state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
