import { KeatsClient, MoodleError } from "./client.js";

export interface SiteInfo {
  sitename: string;
  username: string;
  userid: number;
  release?: string;
  /** 1 si le compte a le droit de télécharger les fichiers via web service. */
  downloadfiles?: number;
  functions: Array<{ name: string; version: string }>;
}

export interface CourseSummary {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  startdate?: number;
  enddate?: number;
  visible?: number;
}

export interface ModuleContent {
  type: string;
  filename?: string;
  filepath?: string;
  filesize?: number;
  fileurl?: string;
  timemodified?: number;
  mimetype?: string;
}

export interface Module {
  id: number;
  name: string;
  modname: string;
  url?: string;
  description?: string;
  uservisible?: boolean;
  contents?: ModuleContent[];
}

export interface Section {
  id: number;
  name: string;
  summary?: string;
  modules: Module[];
}

export interface CalendarEvent {
  id: number;
  name: string;
  timesort: number;
  url?: string;
  activityname?: string;
  course?: { fullname?: string; shortname?: string };
}

export async function getSiteInfo(client: KeatsClient): Promise<SiteInfo> {
  return client.call<SiteInfo>("core_webservice_get_site_info");
}

/** Vrai si le site expose la fonction : tous les Moodle n'activent pas tout. */
export function hasFunction(info: SiteInfo, name: string): boolean {
  return (info.functions ?? []).some((f) => f.name === name);
}

export async function getCourses(client: KeatsClient, userId: number): Promise<CourseSummary[]> {
  const courses = await client.call<CourseSummary[]>("core_enrol_get_users_courses", { userid: userId });
  return courses.filter((c) => c.visible !== 0);
}

export async function getCourseContents(client: KeatsClient, courseId: number): Promise<Section[]> {
  const sections = await client.call<Section[]>("core_course_get_contents", { courseid: courseId });
  return sections.map((s) => ({
    ...s,
    // Un module masqué n'est pas lisible : l'ignorer évite des 403 au téléchargement.
    modules: (s.modules ?? []).filter((m) => m.uservisible !== false),
  }));
}

/**
 * Les pages Moodle (`mod_page`) n'exposent pas leur HTML dans
 * `core_course_get_contents` : il faut cette fonction dédiée.
 * Renvoie le HTML indexé par identifiant de module de cours.
 */
export async function getPageHtml(client: KeatsClient, courseId: number): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    const res = await client.call<{ pages?: Array<{ coursemodule: number; content?: string; intro?: string }> }>(
      "mod_page_get_pages_by_courses",
      { courseids: [courseId] },
    );
    for (const p of res.pages ?? []) {
      const html = [p.intro, p.content].filter(Boolean).join("\n");
      if (html.trim()) out.set(p.coursemodule, html);
    }
  } catch (err) {
    // Fonction non exposée par le site : on se contente des autres ressources.
    if (!(err instanceof MoodleError)) throw err;
  }
  return out;
}

/** Devoirs avec leur énoncé et leur date limite, par identifiant de module. */
export async function getAssignments(
  client: KeatsClient,
  courseId: number,
): Promise<Map<number, { intro: string; duedate?: number }>> {
  const out = new Map<number, { intro: string; duedate?: number }>();
  try {
    const res = await client.call<{
      courses?: Array<{ assignments?: Array<{ cmid: number; intro?: string; duedate?: number }> }>;
    }>("mod_assign_get_assignments", { courseids: [courseId] });
    for (const course of res.courses ?? []) {
      for (const a of course.assignments ?? []) {
        out.set(a.cmid, { intro: a.intro ?? "", duedate: a.duedate || undefined });
      }
    }
  } catch (err) {
    if (!(err instanceof MoodleError)) throw err;
  }
  return out;
}

/** Échéances à venir (devoirs, quiz) sur `days` jours. */
export async function getUpcoming(client: KeatsClient, days: number): Promise<CalendarEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const res = await client.call<{ events?: CalendarEvent[] }>("core_calendar_get_action_events_by_timesort", {
    timesortfrom: now,
    timesortto: now + days * 86_400,
    limitnum: 50,
  });
  return (res.events ?? []).sort((a, b) => a.timesort - b.timesort);
}
