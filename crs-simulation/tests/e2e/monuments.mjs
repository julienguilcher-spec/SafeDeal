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
  /** Attend une condition sans faire échouer tout le script : l'échec est consigné. */
  const until = async (expr, label) => {
    try { await waitFor(page, expr, 150000); return true; } catch { errors.push(`système : condition jamais atteinte (${label}) : ${expr}`); return false; }
  };
  const stats = () => page.evaluate(() => window.__sys.stats());
  // 1. caméra devant le premier monument : lui en détail, les suivants en silhouette, les petits lointains absents
  await page.evaluate(() => window.__sys.setCam(70, 28, 150, 0, 22, 0));
  await until('window.__sys.stats().detailed === 1 && window.__sys.stats().distant >= 3', 'détail près de la caméra');
  await settle(page, 3);
  const a = await stats();
  await shot(page, 'monument-systeme-jour');
  // 2. déplacement devant les fontaines (4e emplacement, posé deux fois) : l'Arc est relâché, les fontaines détaillées
  await page.evaluate(() => window.__sys.setCam(1350 + 50, 16, 70, 1350, 5, -40));
  await until('window.__sys.stats().detailed === 2', 'deux fontaines détaillées');
  await settle(page, 4);
  const b = await stats();
  await shot(page, 'monument-systeme-fontaines');
  // 3. nuit, début d'heure, au pied de la Tour : illumination et scintillement
  await page.evaluate(() => { window.__sys.setHour(22.02); window.__sys.setCam(2700 + 150, 1.7, 230, 2700, 150, 0); });
  await until('window.__sys.stats().night > 0.97 && window.__sys.stats().sparkle > 0.9 && window.__sys.stats().detailed >= 1', 'nuit et scintillement');
  await settle(page, 3);
  const c = await stats();
  await shot(page, 'monument-systeme-nuit');
  // 4. hors de l'heure pleine : le scintillement s'éteint, l'illumination reste
  await page.evaluate(() => window.__sys.setHour(22.5));
  await until('window.__sys.stats().sparkle < 0.05 && window.__sys.stats().night > 0.97', 'fin du scintillement');
  const c2 = await stats();
  // 5. vue d'ensemble à 900 m : plus aucun modèle détaillé, huit silhouettes
  await page.evaluate(() => { window.__sys.setHour(15); window.__sys.setCam(1350, 250, 900, 1350, 40, 0); });
  await until('window.__sys.stats().detailed === 0 && window.__sys.stats().distant === 8 && window.__sys.stats().night < 0.03', 'silhouettes seules');
  await settle(page, 4);
  const d = await stats();
  await shot(page, 'monument-systeme-lointain');
  // 6. en enfilade depuis 700 m : les petits monuments sortent de la distance d'affichage, la Tour reste visible à 3 km
  await page.evaluate(() => window.__sys.setCam(-500, 120, 500, 2700, 120, 0));
  await until('window.__sys.stats().detailed === 0 && window.__sys.stats().distant >= 3 && window.__sys.stats().distant <= 5', 'libération hors de portée');
  await settle(page, 4);
  const e = await stats();
  await shot(page, 'monument-systeme-enfilade');
  // 7. changement de qualité (les modèles détaillés sont reconstruits), puis remise à zéro
  await page.evaluate(() => { window.__sys.setCam(70, 28, 150, 0, 22, 0); });
  await until('window.__sys.stats().detailed === 1', 'retour devant l\'Arc');
  const f1 = await stats();
  await page.evaluate(() => window.__sys.quality('bas'));
  await until(`window.__sys.stats().detailed === 1 && window.__sys.stats().triangles < ${f1.triangles}`, 'reconstruction en qualité basse');
  const f2 = await stats();
  // remise à zéro : tout est relâché immédiatement, puis le système se repeuple à l'image suivante
  const g = await page.evaluate(() => { window.__sys.reset(); return window.__sys.stats(); });
  await until('window.__sys.stats().known === 8 && window.__sys.stats().detailed === 1', 'repeuplement après remise à zéro');
  const sysOk = a.known === 8 && a.detailed === 1 && a.distant >= 3 && b.detailed === 2 && c.sparkle > 0.9 && c.night > 0.97 && c2.sparkle < 0.05
    && d.detailed === 0 && d.distant === 8 && d.triangles <= 400 * 8 && e.distant >= 3 && e.distant <= 5 && f2.triangles < f1.triangles && g.known === 0;
  if (!sysOk) ok = false;
  report.push({ key: 'systeme', pres: a, fontaines: b, nuit: c, apresHeure: c2, lointain: d, enfilade: e, qualiteMoyenne: f1, qualiteBasse: f2, apresRemise: g, pass: sysOk });
  console.log('[monuments] système :', JSON.stringify({ a, b, c, c2, d, e, f1, f2, g }), sysOk ? 'OK' : 'ÉCHEC');
}

const file = path.join(OUT, 'monuments-report.json');
writeFileSync(file, JSON.stringify(report, null, 2));
console.log('rapport :', file);
await finish({ browser, server, errors, ok, label: 'monuments' });
