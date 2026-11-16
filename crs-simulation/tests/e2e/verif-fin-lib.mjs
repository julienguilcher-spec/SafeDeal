// Testeur indépendant — CONTRÔLE FINAL (préfixe verif-fin). N'écrit rien dans le code du jeu : scripts et captures seulement.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { startServer, openPage, waitFor, OUT, ROOT } from './lib.mjs';
import { frames, step, state, installPad, PAD, padButton, padAxes, fingers, rects, overlap } from './verif-tpm-lib.mjs';
export { startServer, openPage, waitFor, OUT, ROOT, frames, step, state, installPad, PAD, padButton, padAxes, fingers, rects, overlap };

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
