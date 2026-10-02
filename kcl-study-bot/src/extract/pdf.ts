import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api.js";

function params(buf: Buffer): DocumentInitParameters {
  return {
    data: new Uint8Array(buf),
    // Les slides de cours sont pleines de polices exotiques : ne pas bloquer dessus.
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  };
}

/**
 * Extraction de texte d'un PDF via pdf.js. Le build « legacy » est celui qui
 * tourne sous Node sans canvas ; on n'instancie aucun worker.
 */
export async function extractPdf(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument(params(buf));
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const content = await page.getTextContent();
        const lines: string[] = [];
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str;
          if (item.hasEOL) {
            lines.push(line);
            line = "";
          }
        }
        if (line) lines.push(line);
        const text = lines
          .map((l) => l.replace(/[ \t ]+/g, " ").trim())
          .filter(Boolean)
          .join("\n");
        if (text) pages.push(`## Page ${n}\n${text}`);
      } finally {
        page.cleanup();
      }
    }
    return { text: pages.join("\n\n").trim(), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/** Nombre de pages seul : sert à décider si on peut envoyer le PDF tel quel. */
export async function pdfPageCount(buf: Buffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument(params(buf));
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}
