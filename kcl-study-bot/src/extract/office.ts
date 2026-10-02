import { unzipSync } from "fflate";
import { decodeEntities } from "./html.js";

const decoder = new TextDecoder("utf8");

function entry(zip: Record<string, Uint8Array>, name: string): string | undefined {
  const data = zip[name];
  return data ? decoder.decode(data) : undefined;
}

/** Trie `slide2.xml` avant `slide10.xml`, ce que l'ordre alphabétique rate. */
function byNumericSuffix(a: string, b: string): number {
  const n = (s: string) => Number.parseInt(s.match(/(\d+)\.xml$/)?.[1] ?? "0", 10);
  return n(a) - n(b);
}

/** Extrait le texte d'un XML Office en respectant les paragraphes. */
function xmlParagraphs(xml: string, paragraphTag: string, textTag: string): string[] {
  const out: string[] = [];
  for (const block of xml.split(new RegExp(`</${paragraphTag}>`))) {
    const heading = /w:pStyle w:val="Heading(\d)"/.exec(block);
    const runs = [...block.matchAll(new RegExp(`<${textTag}[^>]*>([\\s\\S]*?)</${textTag}>`, "g"))].map((m) =>
      decodeEntities(m[1]),
    );
    if (!runs.length) continue;
    const line = runs
      .join("")
      .replace(/[ \t ]+/g, " ")
      .trim();
    if (!line) continue;
    out.push(heading ? `${"#".repeat(Math.min(6, Number(heading[1])))} ${line}` : line);
  }
  return out;
}

export function extractDocx(buf: Buffer): { text: string } {
  const zip = unzipSync(new Uint8Array(buf));
  const xml = entry(zip, "word/document.xml");
  if (!xml) throw new Error("ce .docx n'a pas de word/document.xml");
  const body = xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n");
  return { text: xmlParagraphs(body, "w:p", "w:t").join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

/**
 * Un .pptx : une section par diapo, avec les notes du prof quand il y en a —
 * elles contiennent souvent l'explication que les slides ne disent pas.
 */
export function extractPptx(buf: Buffer): { text: string; slides: number } {
  const zip = unzipSync(new Uint8Array(buf));
  const slides = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(byNumericSuffix);
  if (!slides.length) throw new Error("ce .pptx n'a aucune diapo lisible");

  const parts: string[] = [];
  for (const [i, name] of slides.entries()) {
    const num = i + 1;
    const lines = xmlParagraphs(entry(zip, name) ?? "", "a:p", "a:t");
    const notesXml = entry(zip, `ppt/notesSlides/notesSlide${name.match(/(\d+)\.xml$/)?.[1]}.xml`);
    const notes = notesXml ? xmlParagraphs(notesXml, "a:p", "a:t") : [];
    const block = [`## Diapo ${num}`, ...lines];
    if (notes.length) block.push("", `Notes du prof : ${notes.join(" ")}`);
    parts.push(block.join("\n"));
  }
  return { text: parts.join("\n\n").trim(), slides: slides.length };
}
