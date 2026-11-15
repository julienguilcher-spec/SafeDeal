// Captures des monuments : pour chaque monument, 3 angles de jour + 1 de nuit + la silhouette lointaine,
// avec le bilan (triangles, appels de dessin lus dans renderer.info). Puis les vitrines du kit et le système complet.
//   node tests/e2e/monuments.mjs                 tout
//   node tests/e2e/monuments.mjs arc_triomphe    un seul monument (ou kit | palais | systeme)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish, OUT } from './lib.mjs';

const KEYS = ['arc_triomphe', 'tour_eiffel', 'obelisque_concorde', 'fontaines_concorde', 'colonne_vendome', 'colonne_juillet', 'statue_republique'];
const BUDGET = { tour_eiffel: 150000 };
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);

const server = await startServer();
const errors = [];
const report = [];
let ok = true;
let browser = null;

async function settle(page, n = 3) {
  const f = await page.evaluate(() => window.__frames);
  await waitFor(page, `window.__frames >= ${f + n}`);
}

async function open(query) {
  if (browser) await browser.close().catch(() => {});
  const res = await openPage(`${server.url}harness/monuments.html?shot=1&${query}`, { width: 1280, height: 800 });
  browser = res.browser;
  res.errors.forEach((e) => errors.push(`${query} : ${e}`));
  const before = res.errors.length;
  await waitFor(res.page, 'window.__ready === true', 240000);
  return { page: res.page, pageErrors: res.errors, before };
}

for (const key of KEYS) {
  if (!want(key)) continue;
  const t0 = Date.now();
  const { page, pageErrors, before } = await open(`key=${key}&quality=haut`);
  const views = ['trois-quarts', 'face', 'pieton'];
  for (let i = 0; i < views.length; i++) {
    await page.evaluate((v) => window.__setView(v), i);
    await settle(page);
    await shot(page, `monument-${key}-jour-${views[i]}`);
  }
  // bilan mesuré en vue d'ensemble (tout le monument dans le champ : aucun maillage écarté)
  await page.evaluate(() => window.__setView(0));
  await settle(page, 2);
  const st = await page.evaluate(() => window.__stats());
  await page.evaluate(() => { window.__setNight(true); window.__setView(0); if (window.__setSparkle) window.__setSparkle(1); });
  await settle(page, 4);
  await shot(page, `monument-${key}-nuit`);
  await page.evaluate(() => { window.__setNight(false); window.__setSparkle(0); window.__setFar(true); window.__setView(0); });
  await settle(page);
  await shot(page, `monument-${key}-silhouette`);
  const stFar = await page.evaluate(() => window.__stats());
  const max = BUDGET[key] ?? 60000;
  const pass = st.triangles <= max && st.drawCalls <= 12 && st.rendererCalls <= 12 && stFar.triangles <= 400;
  if (!pass) ok = false;
  report.push({
    key, triangles: st.triangles, rendererTriangles: st.rendererTriangles, drawCalls: st.drawCalls, rendererCalls: st.rendererCalls,
    farTriangles: stFar.triangles, farCalls: stFar.rendererCalls, buildMs: st.buildMs, height: st.height, width: st.width, depth: st.depth,
    budget: max, pass, ms: Date.now() - t0,
  });
  pageErrors.slice(before).forEach((e) => errors.push(`${key} : ${e}`));
  console.log(`[monuments] ${key} : ${st.triangles} triangles, ${st.rendererCalls} appels (silhouette ${stFar.triangles} tri.) ${pass ? 'OK' : 'HORS BUDGET'} — ${Date.now() - t0} ms`);
}

for (const demo of ['kit', 'palais']) {
  if (!want(demo)) continue;
  const { page } = await open(`demo=${demo}&quality=haut`);
  for (const [i, name] of [[0, 'trois-quarts'], [1, 'face'], [3, 'arriere']]) {
    await page.evaluate((v) => window.__setView(v), i);
    await settle(page);
    await shot(page, `monument-demo-${demo}-${name}`);
  }
  await page.evaluate(() => { window.__setNight(true); window.__setView(0); });
  await settle(page, 4);
  await shot(page, `monument-demo-${demo}-nuit`);
  const st = await page.evaluate(() => window.__stats());
  report.push({ key: `demo:${demo}`, triangles: st.triangles, drawCalls: st.drawCalls, rendererCalls: st.rendererCalls, buildMs: st.buildMs });
  console.log(`[monuments] vitrine ${demo} : ${st.triangles} triangles, ${st.rendererCalls} appels`);
}

if (want('systeme')) {
  const { page } = await open('demo=systeme&quality=moyen');
  // caméra devant le premier monument : lui en détail, les autres en silhouette ou absents
  await page.evaluate(() => window.__sys.setCam(70, 28, 150, 0, 22, 0));
  await waitFor(page, 'window.__sys.stats().detailed >= 1', 120000);
  await settle(page, 3);
  const a = await page.evaluate(() => window.__sys.stats());
  await shot(page, 'monument-systeme-jour');
  // déplacement devant le quatrième monument
  await page.evaluate(() => window.__sys.setCam(1350 + 60, 20, 120, 1350, 14, 0));
  await waitFor(page, 'window.__sys.stats().detailed >= 1 && window.__frames > 12', 120000);
  await settle(page, 6);
  const b = await page.evaluate(() => window.__sys.stats());
  // nuit, début d'heure : illumination et scintillement
  await page.evaluate(() => window.__sys.setHour(22.02));
  await waitFor(page, 'window.__sys.stats().night > 0.97 && window.__sys.stats().sparkle > 0.9', 120000);
  await settle(page, 3);
  const c = await page.evaluate(() => window.__sys.stats());
  await shot(page, 'monument-systeme-nuit');
  // vue d'ensemble de loin : silhouettes
  await page.evaluate(() => { window.__sys.setHour(15); window.__sys.setCam(1350, 420, 2600, 1350, 60, 0); });
  await waitFor(page, 'window.__sys.stats().detailed === 0 && window.__sys.stats().distant >= 6', 120000);
  await settle(page, 4);
  const d = await page.evaluate(() => window.__sys.stats());
  await shot(page, 'monument-systeme-lointain');
  await page.evaluate(() => window.__sys.reset());
  await settle(page, 2);
  const sysOk = a.detailed >= 1 && a.distant >= 1 && b.detailed >= 1 && c.sparkle > 0.9 && d.detailed === 0 && d.distant >= 6 && d.triangles <= 400 * d.distant;
  if (!sysOk) ok = false;
  report.push({ key: 'systeme', pres: a, deplace: b, nuit: c, lointain: d, pass: sysOk });
  console.log('[monuments] système :', JSON.stringify({ a, b, c, d }), sysOk ? 'OK' : 'ÉCHEC');
}

const file = path.join(OUT, 'monuments-report.json');
writeFileSync(file, JSON.stringify(report, null, 2));
console.log('rapport :', file);
await finish({ browser, server, errors, ok, label: 'monuments' });
