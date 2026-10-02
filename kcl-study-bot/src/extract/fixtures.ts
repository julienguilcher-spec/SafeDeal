import { strToU8, zipSync } from "fflate";

/**
 * Fabrique des .pptx / .docx / .pdf minimalistes pour les tests, afin de ne pas
 * commiter de binaires (et de ne jamais commiter un vrai cours).
 */

function slideXml(title: string): Uint8Array {
  return strToU8(
    `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>` +
      `<a:p><a:r><a:t>${title}</a:t></a:r></a:p>` +
      `<a:p><a:r><a:t>Point A &amp; B</a:t></a:r><a:r><a:t> suite</a:t></a:r></a:p>` +
      `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  );
}

export function samplePptx(): Buffer {
  return Buffer.from(
    zipSync({
      "ppt/slides/slide1.xml": slideXml("Lecture 1: Demand curves"),
      "ppt/slides/slide2.xml": slideXml("Elasticity"),
      // Volontairement à deux chiffres : vérifie le tri numérique des diapos.
      "ppt/slides/slide10.xml": slideXml("Wrap up"),
      "ppt/notesSlides/notesSlide2.xml": strToU8(
        `<?xml version="1.0"?><p:notes xmlns:a="a"><a:p><a:r><a:t>Insister sur le signe negatif</a:t></a:r></a:p></p:notes>`,
      ),
    }),
  );
}

export function sampleDocx(): Buffer {
  return Buffer.from(
    zipSync({
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>` +
          `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapitre 2</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Le co&#251;t marginal</w:t></w:r><w:r><w:t> augmente.</w:t></w:r></w:p>` +
          `</w:body></w:document>`,
      ),
    }),
  );
}

/** PDF volontairement sans table xref : pdf.js doit la reconstruire. */
export function samplePdf(): Buffer {
  const stream = `BT /F1 12 Tf 20 200 Td (Marginal cost rises) Tj 0 -20 Td (Second line here) Tj ET`;
  return Buffer.from(
    `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`,
    "latin1",
  );
}
