import { CONFIG } from "../config.js";
import { loadManifest, readChunks, resolveCourse } from "../corpus.js";
import { SearchIndex } from "../search.js";
import { reindex, sync } from "../keats/sync.js";
import { requireAuth } from "../keats/auth.js";
import { KeatsClient } from "../keats/client.js";
import { getUpcoming } from "../keats/api.js";
import { isUsable } from "../select.js";
import { log, ok, warn } from "../log.js";
import { has, int, many, one, type Args } from "../args.js";

/** « 820 car. », « 12k car. » : jamais « 0k car. » pour un document non vide. */
function chars(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k car.` : `${n} car.`;
}

export async function runSync(args: Args): Promise<void> {
  await sync({ only: many(args, "course"), force: has(args, "force") });
}

export function runReindex(): void {
  const n = reindex(loadManifest());
  ok(`${n} passages réindexés depuis ${CONFIG.textDir}`);
}

export function listCourses(): void {
  const m = loadManifest();
  if (!m.courses.length) {
    warn("Aucun cours synchronisé. Lance `kcl sync`.");
    return;
  }
  log(`Dernière synchro : ${m.syncedAt ?? "jamais"}\n`);
  for (const c of m.courses) {
    const docs = m.docs.filter((d) => d.courseId === c.id);
    const usable = docs.filter(isUsable);
    const total = usable.reduce((sum, d) => sum + d.chars, 0);
    log(`${c.shortname.padEnd(16)} ${usable.length}/${docs.length} docs · ${chars(total)}`);
    log(`${" ".repeat(16)} ${c.fullname}`);
  }
}

export function listDocs(args: Args): void {
  const m = loadManifest();
  const course = resolveCourse(m, one(args, "course") ?? args.positional[0] ?? "");
  const docs = m.docs.filter((d) => d.courseId === course.id);
  log(`${course.shortname} — ${course.fullname}`);

  let section = "";
  for (const d of docs.sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title))) {
    if (d.section !== section) {
      section = d.section;
      log(`\n## ${section}`);
    }
    const size = d.chars > 0 ? chars(d.chars) : (d.error ?? "vide");
    const detail = d.pages ? `${d.pages} p.` : d.slides ? `${d.slides} diapos` : d.kind;
    log(`  ${isUsable(d) ? " " : "!"} ${d.title}`);
    log(`      ${d.id}  ·  ${detail}  ·  ${size}`);
  }
}

/** Recherche locale, sans appel à l'API : utile pour retrouver un passage précis. */
export function searchCorpus(args: Args): void {
  const query = args.positional.join(" ");
  if (!query) throw new Error('Donne une requête : kcl search "elasticity"');
  const chunks = readChunks();
  if (!chunks.length) throw new Error("L'index est vide : lance `kcl sync`.");

  const courseName = one(args, "course");
  const courseId = courseName ? resolveCourse(loadManifest(), courseName).id : undefined;
  const hits = new SearchIndex(chunks).search(query, { k: int(args, "top", 10), courseId });
  if (!hits.length) {
    warn("Aucun passage trouvé.");
    return;
  }
  for (const [i, h] of hits.entries()) {
    log(`\n${i + 1}. ${h.chunk.course} · ${h.chunk.title}${h.chunk.anchor ? ` · ${h.chunk.anchor}` : ""}  (${h.score.toFixed(1)})`);
    log(`   ${h.chunk.text.replace(/\s+/g, " ").slice(0, 220)}…`);
  }
}

export async function showAgenda(args: Args): Promise<void> {
  const days = int(args, "days", 21);
  const events = await getUpcoming(new KeatsClient(requireAuth()), days);
  if (!events.length) {
    ok(`Rien à rendre dans les ${days} prochains jours.`);
    return;
  }
  log(`Échéances sur ${days} jours :\n`);
  for (const e of events) {
    const when = new Date(e.timesort * 1000);
    const left = Math.ceil((when.getTime() - Date.now()) / 86_400_000);
    log(`${when.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }).padEnd(22)} J+${String(left).padEnd(3)} ${e.course?.shortname ?? ""} — ${e.name}`);
  }
}
