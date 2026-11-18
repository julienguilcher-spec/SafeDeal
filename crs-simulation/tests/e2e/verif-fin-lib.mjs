// Testeur indépendant — CONTRÔLE FINAL (préfixe verif-fin). N'écrit rien dans le code du jeu : scripts et captures seulement.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { startServer, openPage, waitFor, OUT, ROOT, ouvrirEditeur } from './lib.mjs';
import { frames, step, state, installPad, PAD, padButton, padAxes, fingers, rects, overlap } from './verif-tpm-lib.mjs';
export { startServer, openPage, waitFor, OUT, ROOT, ouvrirEditeur, frames, step, state, installPad, PAD, padButton, padAxes, fingers, rects, overlap };

export const args = Object.fromEntries(process.argv.slice(2).map((a) => { const s = a.replace(/^--/, ''); const i = s.indexOf('='); return i < 0 ? [s, '1'] : [s.slice(0, i), s.slice(i + 1)]; }));
export const R = (v, d = 2) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v);
export const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));

export function makeChecker(label) {
  const failures = [];
  const notes = [];
  let checks = 0;
  return {
    failures, notes,
    get checks() { return checks; },
    check(ok, msg, detail = '') {
      checks++;
      const line = msg + (detail ? ` — ${detail}` : '');
      if (ok) console.log('  ✓ ' + line);
      else { failures.push(line); console.log('  ✗ ' + line); }
      return ok;
    },
    note(msg) { notes.push(msg); console.log('  · ' + msg); },
    done(report) {
      if (report) writeFileSync(path.join(OUT, `${label}-report.json`), JSON.stringify(report, null, 2));
      console.log(`[${label}] ${checks} vérifications, ${failures.length} échec(s)`);
      for (const f of failures) console.log('  ✗ ' + f);
    },
  };
}

export async function snap(page, name) {
  try { await frames(page, 2); } catch { /* page occupée */ }
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('  capture : ' + file);
  return file;
}

/** Touche tenue pendant deux images (les menus lisent le clavier une fois par image). */
export async function hold(page, code, n = 2) {
  await page.keyboard.down(code);
  await frames(page, n);
  await page.keyboard.up(code);
  await frames(page, 1);
}

// ── carte de commandement (refonte) : état de l'écran et gestes réels au pointeur ──

/** État de la carte de commandement ouverte (null si elle est fermée) : feuille, intention, visée, fiche, Qui, « ✓ ORDRE DONNÉ ». */
export const tactical = (page) => page.evaluate(() => {
  const sys = window.__CRS.game.systems.find((s) => s.id === 'ui:command');
  const t = sys && sys.tactical;
  if (!t) return null;
  const s = t.state;
  const card = t.card;
  const list = card && s.card ? (s.card.othersOpen ? card.others : card.lines) : [];
  return {
    sheet: s.sheet, intent: s.intent, visee: s.visee && s.visee.name, kind: s.visee && s.visee.kind,
    line: s.card ? s.card.line : -1, lineLabel: s.card && list[s.card.line] ? list[s.card.line].label : '',
    lines: list.map((l) => l.label), who: s.who && s.who.label, sent: s.lastSent && s.lastSent.text,
  };
});

/** Clic réel du pointeur au centre d'un élément visible (amené dans sa liste au besoin) ; false s'il est absent ou masqué. */
export async function clickSel(page, sel) {
  const r = await page.evaluate((q) => {
    const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  if (!r) return false;
  await page.mouse.move(r.x, r.y);
  await frames(page, 2);
  await page.mouse.click(r.x, r.y);
  await frames(page, 3);
  return true;
}

/**
 * Clic réel sur la ligne de la fiche dont le libellé correspond à `re` (au pointeur, un clic sur une ligne envoie
 * l'ordre ; une ligne ⚖ / 🔒 ouvre la confirmation légale). Retourne le libellé cliqué, '' si aucune ligne ne correspond.
 */
export async function clickCardLine(page, re) {
  const found = await page.evaluate((src) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll('[data-id^="card-line-"]')].find((e) => rx.test(e.querySelector('.cc-lab')?.textContent || ''));
    return b ? { id: b.dataset.id, label: b.querySelector('.cc-lab')?.textContent || '' } : null;
  }, re.source);
  if (!found) return '';
  return (await clickSel(page, `[data-id="${found.id}"]`)) ? found.label : '';
}

/**
 * « Plus… › Tous les ordres » puis l'ordre `type` : la fiche s'ouvre à la visée sur cet ordre seul, Qui proposé. Clics réels ;
 * la barre du bas est masquée quand une fiche est ouverte : « Plus… » s'ouvre alors par sa touche (O).
 */
export async function verbFirst(page, type) {
  const shown = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getBoundingClientRect().width > 0; }, sel);
  if (!(await shown('[data-id="more-ordres"]'))) {
    if (await shown('[data-id="tac-more"]')) await clickSel(page, '[data-id="tac-more"]');
    else await hold(page, 'KeyO');
  }
  if (!(await clickSel(page, '[data-id="more-ordres"]'))) return false;
  return clickSel(page, `[data-id="verb-${type}"]`);
}

/**
 * Point de la carte de commandement (coordonnées de la page) à au moins 90 px de tout policier : un clic y désigne un
 * lieu (rue, place, point) et non une unité, dont la fiche remplacerait celle du lieu. `prefs` : fractions [fx, fy] de la
 * carte essayées dans l'ordre ; null si aucune ne convient.
 */
export const freeMapSpot = (page, prefs = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.2], [0.5, 0.8], [0.2, 0.5], [0.8, 0.5]]) => page.evaluate((list) => {
  const ctx = window.__CRS.ctx;
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  const r = t.map.canvas.getBoundingClientRect();
  const p = { x: 0, y: 0 };
  const units = ctx.people.list.filter((q) => q.faction === 'police').map((q) => { t.map.view.worldToScreen(q.x, q.z, p); return { x: r.left + p.x, y: r.top + p.y }; });
  // ni une foule, ni un incident, ni une unité (la fiche serait la leur, pas celle du lieu)
  const busy = (t.reperes || []).filter((q) => q.kind === 'foule' || q.kind === 'nasse' || q.kind === 'incident' || q.kind === 'cible')
    .map((q) => { t.map.view.worldToScreen(q.x, q.z, p); return { x: r.left + p.x, y: r.top + p.y, rad: 70 + (q.radius || 0) / Math.max(0.05, t.map.view.mpp) }; });
  for (const [fx, fy] of list) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (units.every((u) => Math.hypot(u.x - x, u.y - y) > 90) && busy.every((b) => Math.hypot(b.x - x, b.y - y) > b.rad)) return { x, y };
  }
  return null;
}, prefs);

export const notices = (page) => page.evaluate(() => window.__CRS.ctx.service('ui.debug').notices());
export const sysErrors = (page) => page.evaluate(() => window.__CRS.summary().systems.filter((s) => s.errors > 0 || s.disabled).map((s) => `${s.id}:${s.errors}${s.disabled ? ' (désactivé)' : ''}`));

/** Recensement indépendant de ce qui est réellement en jeu (ne lit PAS le résumé de la mise en place). */
export const census = (page) => page.evaluate(() => {
  const c = window.__CRS.ctx;
  const me = c.player.person();
  const police = c.people.list.filter((p) => p.faction === 'police');
  const byKind = {};
  for (const p of police) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const veh = {};
  for (const v of c.vehicles.list) if (v.faction === 'police') veh[v.kind] = (veh[v.kind] || 0) + 1;
  const squads = {};
  for (const s of c.squads.list) if (s.faction === 'police') squads[s.kind] = (squads[s.kind] || 0) + 1;
  const protest = c.people.list.filter((p) => p.faction === 'protest');
  let near = Infinity, cx = 0, cz = 0;
  for (const m of protest) { cx += m.x; cz += m.z; for (const q of police) near = Math.min(near, Math.hypot(m.x - q.x, m.z - q.z)); }
  if (protest.length) { cx /= protest.length; cz /= protest.length; }
  const cfg = c.session.config;
  return {
    police: police.length, onFoot: police.filter((p) => p.vehicleId === 0).length, byKind, vehicles: veh, squads,
    protest: protest.length, nearestProtesterToPolice: near, crowdCenter: { x: cx, z: cz },
    playerToCrowd: protest.length ? Math.hypot(me.x - cx, me.z - cz) : -1, playerToPlace: Math.hypot(me.x - cfg.x, me.z - cfg.z),
    civils: c.people.list.filter((p) => p.faction === 'civil').length, civVehicles: c.vehicles.list.filter((v) => v.faction !== 'police').length,
    props: c.props.list.length, shops: c.props.shops.length, phase: c.director.phase, tension: c.director.tension,
    sector: c.world.sectorName(me.x, me.z), extra: cfg.extra, crowdSize: cfg.crowdSize, place: cfg.place,
  };
});
