import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkedinTitle } from "./sources/google.js";
import { normalizeLinkedin } from "./sources/types.js";
import { ScoreSchema } from "./score.js";

test("normalizeLinkedin dedups variants of the same profile", () => {
  assert.equal(normalizeLinkedin("https://fr.linkedin.com/in/Jane-Doe-123?trk=x"), "https://www.linkedin.com/in/jane-doe-123");
  assert.equal(normalizeLinkedin("linkedin.com/in/jane-doe-123/"), "https://www.linkedin.com/in/jane-doe-123");
  assert.equal(normalizeLinkedin("https://www.linkedin.com/company/acme"), undefined);
  assert.equal(normalizeLinkedin("https://example.com/in/jane"), undefined);
});

test("parseLinkedinTitle splits name and headline", () => {
  assert.deepEqual(parseLinkedinTitle("Jane Doe - COO @ Le Wagon - Paris | LinkedIn"), {
    name: "Jane Doe",
    headline: "COO @ Le Wagon - Paris",
  });
  assert.deepEqual(parseLinkedinTitle("Jane Doe – LinkedIn"), { name: "Jane Doe", headline: "" });
});

test("ScoreSchema rejects out-of-range scores", () => {
  assert.equal(ScoreSchema.safeParse({ score: 101, verdict: "shortlist", is_french: "yes", estimated_age_band: "25_40", matched_signals: [], concerns: [], one_liner: "x", outreach_hook: "y" }).success, false);
});
