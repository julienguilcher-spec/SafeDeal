import { extractDocx, extractPptx } from "./office.js";
import { htmlToText } from "./html.js";
import { extractPdf } from "./pdf.js";

export type DocKind = "pdf" | "pptx" | "docx" | "html" | "text" | "unsupported";

export interface Extracted {
  kind: DocKind;
  text: string;
  pages?: number;
  slides?: number;
}

const BY_EXTENSION: Record<string, DocKind> = {
  pdf: "pdf",
  pptx: "pptx", pptm: "pptx", ppsx: "pptx",
  docx: "docx", docm: "docx",
  html: "html", htm: "html", xhtml: "html",
  txt: "text", md: "text", markdown: "text", csv: "text", tex: "text",
};

export function kindFor(filename: string, mimetype?: string): DocKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const byExt = BY_EXTENSION[ext];
  if (byExt) return byExt;
  if (mimetype?.startsWith("text/html")) return "html";
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype?.startsWith("text/")) return "text";
  // Vidéos, images, .zip, .xlsx, vieux .doc/.ppt binaires : on n'y touche pas.
  return "unsupported";
}

export async function extractFile(buf: Buffer, filename: string, mimetype?: string): Promise<Extracted> {
  const kind = kindFor(filename, mimetype);
  switch (kind) {
    case "pdf":
      return { kind, ...(await extractPdf(buf)) };
    case "pptx":
      return { kind, ...extractPptx(buf) };
    case "docx":
      return { kind, ...extractDocx(buf) };
    case "html":
      return { kind, text: htmlToText(buf.toString("utf8")) };
    case "text":
      return { kind, text: buf.toString("utf8").trim() };
    default:
      return { kind: "unsupported", text: "" };
  }
}
