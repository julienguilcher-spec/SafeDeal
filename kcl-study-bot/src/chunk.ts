import { CONFIG } from "./config.js";

export interface TextChunk {
  text: string;
  /** Repère de citation : « Page 4 », « Diapo 12 » ou le dernier titre vu. */
  anchor?: string;
}

const ANCHOR_RE = /^#{1,6}\s+(.+)$/;

/**
 * Découpe un texte en passages de taille à peu près constante, en coupant sur
 * les paragraphes et en se chevauchant un peu pour ne pas trancher une idée.
 * Chaque passage retient le dernier titre (page, diapo, section) pour la citation.
 */
export function chunkText(
  text: string,
  { size = CONFIG.search.chunkChars, overlap = CONFIG.search.chunkOverlap } = {},
): TextChunk[] {
  const paragraphs = text.split(/\n{2,}/).flatMap((para) => splitHugeParagraph(para, size));
  const chunks: TextChunk[] = [];
  let buffer: string[] = [];
  let length = 0;
  let anchor: string | undefined;
  let anchorOfChunk: string | undefined;

  const flush = () => {
    const body = buffer.join("\n\n").trim();
    if (body) chunks.push({ text: body, anchor: anchorOfChunk });
    // Repartir sur la fin du passage précédent : le chevauchement garde le contexte.
    const tail: string[] = [];
    let tailLen = 0;
    for (let i = buffer.length - 1; i >= 0 && tailLen < overlap; i--) {
      tail.unshift(buffer[i]);
      tailLen += buffer[i].length;
    }
    buffer = overlap > 0 ? tail : [];
    length = tailLen;
    anchorOfChunk = anchor;
  };

  for (const para of paragraphs) {
    const heading = ANCHOR_RE.exec(para.trim());
    if (heading) {
      anchor = heading[1].trim();
      anchorOfChunk ??= anchor;
    }
    if (length + para.length > size && buffer.length) flush();
    anchorOfChunk ??= anchor;
    buffer.push(para);
    length += para.length;
  }
  if (buffer.join("").trim()) chunks.push({ text: buffer.join("\n\n").trim(), anchor: anchorOfChunk });
  return chunks;
}

/** Un paragraphe plus long qu'un passage entier est recoupé sur les phrases. */
function splitHugeParagraph(para: string, max: number): string[] {
  if (para.length <= max) return [para];
  const out: string[] = [];
  let current = "";
  for (const sentence of para.split(/(?<=[.!?;:])\s+/)) {
    if (current.length + sentence.length > max && current) {
      out.push(current.trim());
      current = "";
    }
    current += `${sentence} `;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
