// Bout en bout — le jeu CONSTRUIT (dist/) servi par un petit serveur statique, sous un sous-chemin
// (/sous/chemin/jeu/) : la page d'accueil s'affiche, puis une session se lance place de la Concorde
// (chemins relatifs : aucun fichier n'est demandé hors du sous-chemin, aucun appel réseau externe).
// Le jeu est d'abord construit (équivalent de `npx vite build`, quelques secondes) pour que dist/ soit à jour.
// Usage : node tests/e2e/game-dist.mjs [--no-build]
import { build } from 'vite';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { openPage, waitFor, finish, ROOT, OUT } from './lib.mjs';

const DIST = path.join(ROOT, 'dist');
const PREFIX = '/sous/chemin/jeu/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream' };
if (!process.argv.includes('--no-build')) {
  const t0 = Date.now();
  await build({ root: ROOT, logLevel: 'error' });
  console.log(`  construction : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('[game-dist] dist/index.html introuvable après la construction');
  process.exit(1);
}
const outside = [];
const requested = [];
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(PREFIX)) {
    outside.push(url);
    res.writeHead(404).end();
    return;
  }
  let file = path.join(DIST, url.slice(PREFIX.length) || 'index.html');
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) {
    requested.push('404 ' + url);
    res.writeHead(404).end();
    return;
  }
  requested.push(url);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${http.address().port}${PREFIX}`;
const server = { close: () => new Promise((resolve) => http.close(resolve)) };

const problems = [];
const check = (ok, msg, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(msg);
};
let browser = null;
const allErrors = [];
try {
  // 1. page d'accueil
  let page;
  let errors;
  ({ browser, page, errors } = await openPage(base, { width: 960, height: 540 }));
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  check(true, 'la page d’accueil du jeu construit s’affiche');
  check(await page.evaluate(() => window.__CRS.ctx.world.edgeCount > 1000), 'la carte de Paris est chargée (chemins relatifs)');
  await page.screenshot({ path: path.join(OUT, 'game-dist-accueil.png'), timeout: 240000 });
  allErrors.push(...errors);
  await browser.close();

  // 2. session lancée par l'URL
  const t0 = Date.now();
  ({ browser, page, errors } = await openPage(`${base}?autostart=paris&quality=bas&nomenu=1&poste=lanceur&camera=tps`, { width: 960, height: 540 }));
  await waitFor(page, 'window.__CRS && (window.__CRS.ready === true || window.__CRS.error)', 300000);
  const s = await page.evaluate(() => {
    const c = window.__CRS;
    const p = c.ctx.player.person();
    const info = c.ctx.view.renderer.info.render;
    return {
      error: c.error, phase: c.ctx.session.phase, player: p ? { kind: p.kind, poste: p.poste, x: p.x, z: p.z } : null,
      sector: p ? c.ctx.world.sectorName(p.x, p.z) : '', people: c.ctx.people.list.length, calls: info.calls, triangles: info.triangles,
      external: performance.getEntriesByType('resource').map((r) => r.name).filter((u) => !u.startsWith(location.origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
    };
  });
  console.log(`  session prête en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${JSON.stringify(s)}`);
  check(s.error === null && s.phase === 'playing', 'la session démarre dans le jeu construit', `${s.phase}`);
  check(s.player && s.player.poste === 'lanceur' && /concorde/i.test(s.sector), 'le joueur est en place, place de la Concorde', s.sector);
  check(s.triangles > 100000, 'la ville est dessinée', `${s.calls} appels, ${Math.round(s.triangles / 1000)} k triangles`);
  check(s.external.length === 0, 'aucun appel réseau hors des fichiers du jeu', s.external.join(', '));
  const steps = await page.evaluate(() => window.__CRS.step(2));
  check(steps === 60, 'la simulation avance', `${steps} pas pour 2 s`);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(OUT, 'game-dist-jeu.png'), timeout: 240000 });
  console.log('  capture : ' + path.join(OUT, 'game-dist-jeu.png'));
  allErrors.push(...errors);
  check(outside.length === 0, 'aucune requête hors du sous-chemin (chemins relatifs)', outside.slice(0, 5).join(', '));
  const missing = requested.filter((u) => u.startsWith('404 '));
  check(missing.length === 0, 'aucun fichier manquant', missing.slice(0, 5).join(', '));
  console.log(`  ${requested.length} fichiers servis depuis dist/`);
} catch (err) {
  problems.push('exception : ' + (err && err.stack ? err.stack : String(err)));
  console.error(err);
}
for (const p of problems) console.error('[game-dist] ÉCHEC — ' + p);
await finish({ browser, server, errors: allErrors, ok: problems.length === 0, label: 'game-dist' });
