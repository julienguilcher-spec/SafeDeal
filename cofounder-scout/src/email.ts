import nodemailer from "nodemailer";
import { CONFIG } from "./config.js";
import type { ScoredCandidate } from "./score.js";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const AGE_LABEL: Record<string, string> = {
  under_25: "< 25 ans", "25_40": "25-40 ans", over_40: "> 40 ans", unknown: "âge inconnu",
};
const TYPE_LABEL: Record<string, string> = { business: "Profil business", tech: "Profil tech", hybrid: "Profil hybride business/tech" };
const FIT_LABEL: Record<string, string> = { cofounder: "Cofondateur·rice", first_employee: "Premier·e employé·e", either: "Cofondateur·rice ou premier·e employé·e" };
const FR_LABEL: Record<string, string> = {
  yes: "Français·e", likely: "Probablement français·e", unclear: "Nationalité à vérifier", no: "Pas français·e",
};

export function renderDigest(date: string, shortlist: ScoredCandidate[], stats: { fetched: number; scored: number; recipes: string[] }): { subject: string; html: string; text: string } {
  const subject = `[Cofounder Scout] ${shortlist.length} profil${shortlist.length > 1 ? "s" : ""} · ${date}`;

  const cards = shortlist
    .map((c, i) => {
      const s = c.score;
      const link = c.linkedinUrl ? `<a href="${esc(c.linkedinUrl)}" style="color:#1d4ed8">${esc(c.linkedinUrl.replace("https://www.", ""))}</a>` : "<em>pas de lien LinkedIn</em>";
      return `
<div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:14px 0;background:#fff">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <div style="font-size:17px;font-weight:600">${i + 1}. ${esc(c.name)}</div>
    <div style="font-size:13px;color:#fff;background:${s.score >= 80 ? "#16a34a" : "#ca8a04"};padding:2px 10px;border-radius:999px">${s.score}/100</div>
  </div>
  <div style="color:#374151;margin:4px 0 8px">${esc(c.headline)}${c.location ? ` · ${esc(c.location)}` : ""}</div>
  <div style="margin:2px 0 6px"><span style="font-size:12px;background:#1e3a8a;color:#fff;padding:2px 8px;border-radius:6px;margin-right:6px">${FIT_LABEL[s.best_fit]}</span><span style="font-size:12px;background:#e0e7ff;color:#1e3a8a;padding:2px 8px;border-radius:6px">${TYPE_LABEL[s.profile_type]}</span></div>
  <div style="font-size:13px;color:#6b7280;margin-bottom:8px">${FR_LABEL[s.is_french]} · ${AGE_LABEL[s.estimated_age_band]} · source: ${esc(c.source)} / ${esc(c.recipeId)}</div>
  <p style="margin:6px 0"><strong>En bref :</strong> ${esc(s.one_liner)}</p>
  ${s.matched_signals.length ? `<p style="margin:6px 0"><strong>Signaux :</strong></p><ul style="margin:2px 0 8px 18px;padding:0">${s.matched_signals.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
  ${s.concerns.length ? `<p style="margin:6px 0;color:#b45309"><strong>Points d'attention :</strong> ${s.concerns.map(esc).join(" · ")}</p>` : ""}
  <p style="margin:6px 0"><strong>Accroche :</strong> ${esc(s.outreach_hook)}</p>
  <div style="font-size:13px">${link}</div>
</div>`;
    })
    .join("");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;background:#f9fafb;color:#111827">
  <h2 style="margin:0 0 4px">Cofounder Scout · ${esc(date)}</h2>
  <div style="font-size:13px;color:#6b7280;margin-bottom:12px">${stats.fetched} profils remontés · ${stats.scored} évalués · ${shortlist.length} retenus · recettes : ${stats.recipes.map(esc).join(", ")}</div>
  ${shortlist.length ? cards : `<p>Aucun profil au-dessus du seuil aujourd'hui (min ${CONFIG.minScore}/100). Le bot creuse plus loin demain.</p>`}
  <div style="font-size:12px;color:#9ca3af;margin-top:18px">Les scores et l'âge estimé sont des estimations faites à partir du titre et de l'extrait public LinkedIn. À vérifier avant tout contact.</div>
</div>`;

  const text = [
    `Cofounder Scout - ${date}`,
    `${stats.fetched} fetched / ${stats.scored} scored / ${shortlist.length} shortlisted`,
    "",
    ...shortlist.map((c, i) =>
      [
        `${i + 1}. ${c.name} (${c.score.score}/100) · ${FIT_LABEL[c.score.best_fit]} · ${TYPE_LABEL[c.score.profile_type]}`,
        `   ${c.headline}`,
        `   ${c.score.one_liner}`,
        `   Hook: ${c.score.outreach_hook}`,
        `   ${c.linkedinUrl ?? "(no linkedin)"}`,
        "",
      ].join("\n"),
    ),
  ].join("\n");

  return { subject, html, text };
}

export async function sendDigest(digest: { subject: string; html: string; text: string }): Promise<void> {
  const { to, from, smtpHost, smtpPort, smtpUser, smtpPass } = CONFIG.email;
  if (!to || !smtpUser || !smtpPass) {
    throw new Error("Email not configured: set DIGEST_TO, SMTP_USER and SMTP_PASS");
  }
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transport.sendMail({ from: from ?? smtpUser, to, subject: digest.subject, html: digest.html, text: digest.text });
}
