import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDocx, extractPptx } from "./office.js";
import { extractPdf } from "./pdf.js";
import { htmlToText, decodeEntities } from "./html.js";
import { sampleDocx, samplePdf, samplePptx } from "./fixtures.js";

test("extractPptx garde l'ordre numérique des diapos et les notes du prof", () => {
  const { text, slides } = extractPptx(samplePptx());
  assert.equal(slides, 3);
  assert.match(text, /## Diapo 1\nLecture 1: Demand curves/);
  // slide10 doit arriver après slide2, pas après slide1.
  assert.ok(text.indexOf("Elasticity") < text.indexOf("Wrap up"));
  // Les runs d'un même paragraphe sont recollés, les entités décodées.
  assert.match(text, /Point A & B suite/);
  assert.match(text, /Notes du prof : Insister sur le signe negatif/);
});

test("extractDocx rend les titres et recolle les runs", () => {
  const { text } = extractDocx(sampleDocx());
  assert.match(text, /^# Chapitre 2$/m);
  assert.match(text, /Le coût marginal augmente\./);
});

test("extractPdf lit le texte page par page", async () => {
  const { text, pages } = await extractPdf(samplePdf());
  assert.equal(pages, 1);
  assert.match(text, /## Page 1/);
  assert.match(text, /Marginal cost rises/);
  assert.match(text, /Second line here/);
});

test("htmlToText garde la structure et les liens externes", () => {
  const html = `<h2>Week 3</h2><p>Lire <a href="https://doi.org/10.1/x">cet article</a>.</p>
    <ul><li>Un</li><li>Deux</li></ul><script>ignore()</script>`;
  const text = htmlToText(html);
  assert.match(text, /^## Week 3$/m);
  assert.match(text, /\[https:\/\/doi\.org\/10\.1\/x\]/);
  assert.match(text, /• Un/);
  assert.doesNotMatch(text, /ignore\(\)/);
});

test("decodeEntities couvre les formes nommées, décimales et hexadécimales", () => {
  assert.equal(decodeEntities("co&#251;t &amp; b&eacute;n&#x65;fice"), "coût & bénefice");
});
