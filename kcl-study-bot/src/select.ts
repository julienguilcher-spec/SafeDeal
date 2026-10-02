import { loadManifest, resolveCourse, slug, type CorpusCourse, type CorpusDoc } from "./corpus.js";
import { many, one, type Args } from "./args.js";

export interface Selection {
  course: CorpusCourse;
  docs: CorpusDoc[];
  /** Intitulé lisible du périmètre, réutilisé comme titre et comme nom de fichier. */
  label: string;
}

/** Un document apporte quelque chose s'il a du texte, ou s'il est un PDF lisible tel quel. */
export function isUsable(doc: CorpusDoc): boolean {
  return doc.chars > 0 || (doc.kind === "pdf" && doc.file !== undefined);
}

/**
 * Traduit `<cours> [--section X] [--doc Y] [--grep Z]` en liste de documents.
 * Lève une erreur utile (avec les sections disponibles) quand rien ne matche.
 */
export function select(args: Args, courseQuery: string | undefined): Selection {
  const manifest = loadManifest();
  if (!manifest.docs.length) throw new Error("Rien de synchronisé. Lance `kcl sync`.");
  if (!courseQuery) {
    throw new Error(
      "Précise un cours. Disponibles :\n" +
        manifest.courses.map((c) => `  - ${c.shortname} — ${c.fullname}`).join("\n"),
    );
  }

  const course = resolveCourse(manifest, courseQuery);
  let docs = manifest.docs.filter((d) => d.courseId === course.id && isUsable(d));

  const sections = many(args, "section");
  if (sections.length) {
    const needles = sections.map((s) => s.toLowerCase());
    docs = docs.filter((d) => needles.some((n) => d.section.toLowerCase().includes(n)));
  }

  const picks = many(args, "doc");
  if (picks.length) {
    const needles = picks.map((s) => s.toLowerCase());
    docs = docs.filter((d) => needles.some((n) => d.id.toLowerCase() === n || d.id.toLowerCase().includes(n)));
  }

  const grep = one(args, "grep");
  if (grep) {
    const needle = grep.toLowerCase();
    docs = docs.filter(
      (d) => d.title.toLowerCase().includes(needle) || d.moduleName.toLowerCase().includes(needle),
    );
  }

  if (!docs.length) {
    const available = [...new Set(manifest.docs.filter((d) => d.courseId === course.id).map((d) => d.section))];
    throw new Error(
      `Aucun document de ${course.shortname} ne correspond à ces filtres.\nSections disponibles :\n` +
        available.map((s) => `  - ${s}`).join("\n"),
    );
  }

  docs.sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
  return { course, docs, label: labelFor(course, sections, picks, grep) };
}

function labelFor(course: CorpusCourse, sections: string[], docs: string[], grep?: string): string {
  const scope = [...sections, ...(grep ? [grep] : []), ...(docs.length ? [`${docs.length} doc(s)`] : [])];
  return scope.length ? `${course.shortname} — ${scope.join(", ")}` : `${course.shortname} — tout le cours`;
}

export function outputStem(label: string): string {
  return slug(label) || "sortie";
}

/**
 * Garde-fou : générer une fiche sur 80 documents coûte cher et donne une bouillie.
 * On demande `--all` pour confirmer un périmètre très large.
 */
export function assertReasonableScope(selection: Selection, args: Args, maxDocs = 25): void {
  if (selection.docs.length <= maxDocs || args.booleans.has("all")) return;
  const sections = [...new Set(selection.docs.map((d) => d.section))];
  throw new Error(
    `${selection.docs.length} documents sélectionnés : c'est beaucoup pour une seule génération.\n` +
      `Restreins avec --section ou --grep, ou confirme avec --all.\nSections :\n` +
      sections.map((s) => `  - ${s}`).join("\n"),
  );
}
