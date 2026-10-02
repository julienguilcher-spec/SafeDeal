import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText } from "./chunk.js";
import { SearchIndex, tokenize } from "./search.js";
import { parseArgs, int, many, one } from "./args.js";
import { escapeAnkiField, toAnkiTsv, type Card } from "./ai/flashcards.js";
import { slug, docId, type StoredChunk } from "./corpus.js";

test("parseArgs gère valeurs, drapeaux, répétitions et =", () => {
  const a = parseArgs(["ECON101", "--section", "Week 3", "--section=Week 4", "--all", "--count", "20"]);
  assert.deepEqual(a.positional, ["ECON101"]);
  assert.deepEqual(many(a, "section"), ["Week 3", "Week 4"]);
  assert.equal(one(a, "count"), "20");
  assert.ok(a.booleans.has("all"));
  assert.equal(int(a, "count", 5), 20);
  assert.equal(int(a, "absent", 5), 5);
  assert.throws(() => int(parseArgs(["--count", "zero"]), "count", 5), /entier positif/);
});

test("parseArgs laisse passer une question entière après --", () => {
  const a = parseArgs(["--course", "ECON", "--", "pourquoi --elasticity est-elle négative ?"]);
  assert.equal(one(a, "course"), "ECON");
  assert.deepEqual(a.positional, ["pourquoi --elasticity est-elle négative ?"]);
});

test("chunkText respecte la taille, chevauche et retient le repère de page", () => {
  const text = [
    "## Page 1",
    "Alpha ".repeat(40).trim(),
    "## Page 2",
    "Beta ".repeat(40).trim(),
    "## Page 3",
    "Gamma ".repeat(40).trim(),
  ].join("\n\n");

  const chunks = chunkText(text, { size: 300, overlap: 60 });
  assert.ok(chunks.length > 1, "le texte doit être découpé");
  assert.equal(chunks[0].anchor, "Page 1");
  // Chaque passage porte un repère, donc toute citation est localisable.
  for (const c of chunks) assert.ok(c.anchor, "chaque passage doit avoir un repère");
  // Le dernier passage parle bien de la fin du document.
  assert.match(chunks.at(-1)!.text, /Gamma/);
});

test("chunkText recoupe un paragraphe plus long qu'un passage", () => {
  const sentence = "Le coût marginal augmente avec la quantité produite. ";
  const chunks = chunkText(sentence.repeat(80), { size: 500, overlap: 0 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.text.length <= 1_000, `passage trop long : ${c.text.length}`);
});

test("tokenize normalise les accents et écarte les mots vides", () => {
  assert.deepEqual(tokenize("Le coût marginal de la firme"), ["cout", "marginal", "firme"]);
  assert.deepEqual(tokenize("The price elasticity of demand"), ["price", "elasticity", "demand"]);
});

function chunk(id: string, course: string, title: string, text: string, courseId = 1): StoredChunk {
  return { id, docId: id, courseId, course, title, text };
}

test("SearchIndex classe par pertinence et filtre par cours", () => {
  const index = new SearchIndex([
    chunk("a", "ECON101", "Lecture 1", "Price elasticity of demand measures responsiveness to a price change."),
    chunk("b", "ECON101", "Lecture 2", "Marginal cost is the cost of producing one additional unit."),
    chunk("c", "LAW201", "Seminar 1", "Elasticity has no meaning in contract law.", 2),
  ]);

  const hits = index.search("elasticity of demand");
  assert.equal(hits[0].chunk.id, "a");

  const scoped = index.search("elasticity", { courseId: 2 });
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].chunk.id, "c");

  assert.deepEqual(index.search("blockchain"), []);
  assert.deepEqual(index.search("   "), []);
});

test("searchMany fait remonter un passage trouvé par plusieurs formulations", () => {
  const index = new SearchIndex([
    chunk("a", "ECON101", "Lecture 1", "Marginal cost equals marginal revenue at the profit maximising output."),
    chunk("b", "ECON101", "Lecture 2", "Fixed cost does not vary with output."),
  ]);
  const hits = index.searchMany(["coût marginal", "marginal cost", "marginal revenue"], { k: 2 });
  assert.equal(hits[0].chunk.id, "a");
  // Pas de doublon malgré trois requêtes qui matchent le même passage.
  assert.equal(new Set(hits.map((h) => h.chunk.id)).size, hits.length);
});

test("escapeAnkiField protège le format TSV", () => {
  assert.equal(escapeAnkiField("ligne 1\nligne 2"), "ligne 1<br>ligne 2");
  assert.equal(escapeAnkiField("avec\ttab"), "avec tab");
});

test("toAnkiTsv sépare les types de note et pose les en-têtes", () => {
  const cards: Card[] = [
    { type: "basic", front: "Que mesure l'elasticité ?", back: "La sensibilité\nau prix", tags: ["econ101", "demand curve"], source: "S1" },
    { type: "cloze", front: "Le {{c1::marginal cost}} est le coût d'une unité de plus.", back: "", tags: ["econ101"], source: "S1" },
  ];
  const { basic, cloze } = toAnkiTsv(cards);

  assert.match(basic!, /^#separator:tab$/m);
  assert.match(basic!, /^#notetype:Basic$/m);
  assert.match(cloze!, /^#notetype:Cloze$/m);

  const row = basic!.trim().split("\n").at(-1)!.split("\t");
  assert.equal(row.length, 3);
  assert.equal(row[1], "La sensibilité<br>au prix");
  // Les espaces dans un tag couperaient le tag en deux dans Anki.
  assert.equal(row[2], "econ101 demand-curve");
  assert.ok(!basic!.includes("{{c1::"), "la carte cloze ne doit pas finir dans le fichier basic");
});

test("slug et docId donnent des identifiants stables et sûrs pour un nom de fichier", () => {
  assert.equal(slug("Week 3 — Élasticité & demande"), "week-3-elasticite-demande");
  assert.equal(docId(42, 7, "Lecture 1 / slides.pdf"), "42-7-lecture-1-slides-pdf");
  assert.match(docId(1, 2, "???"), /^1-2-doc$/);
});
