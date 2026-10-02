const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è",
  agrave: "à", ccedil: "ç", ocirc: "ô", ecirc: "ê", ugrave: "ù", hellip: "…", mdash: "—",
  ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", deg: "°",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number.parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** HTML Moodle → texte lisible, en gardant titres, listes et sauts de blocs. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|tr|h[1-6]|li|blockquote|pre|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<h([1-6])[^>]*>/gi, (_, lvl: string) => `\n${"#".repeat(Number(lvl))} `)
      .replace(/<t[dh][^>]*>/gi, " | ")
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href: string) =>
        // Garder les liens externes : ce sont souvent les lectures obligatoires.
        /^https?:/i.test(href) ? ` [${href}] ` : "",
      )
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}
