// Captures du lot « palais » : pour chaque monument, 3 angles de jour (trois quarts, face, arrière en plongée),
// 1 vue à hauteur de piéton, 1 vue de nuit et la silhouette lointaine, avec le bilan (triangles et appels de
// dessin lus dans renderer.info). Des vues rapprochées propres à certains édifices complètent la série.
//   node tests/e2e/monuments-palais.mjs                 tout le lot
//   node tests/e2e/monuments-palais.mjs louvre invalides   quelques monuments
//   node tests/e2e/monuments-palais.mjs louvre --vues=pieton,pres1   seulement certaines vues
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, finish, OUT } from './lib.mjs';

export const KEYS = [
  'louvre', 'pyramide_louvre', 'arc_carrousel', 'invalides', 'hotel_de_ville', 'palais_bourbon', 'palais_elysee', 'hotel_marine',
  'hotel_crillon', 'palais_royal', 'ecole_militaire', 'institut_de_france', 'palais_justice', 'conciergerie', 'prefecture_police',
  'hotel_matignon', 'musee_orsay', 'gare_saint_lazare',
];
const BUDGET = { louvre: 120000 };
/** Vues rapprochées : [nom, caméra x, y, z, cible x, y, z] dans le repère du banc d'essai (monument à l'origine). */
const CLOSE = {
  hotel_marine: [['pres1', 18, 1.7, 52, -8, 9, 30], ['pres2', -30, 1.7, 30.2, 30, 5, 29.5]],
  hotel_crillon: [['pres1', 60, 1.7, 70, 20, 9, 45]],
  louvre: [
    ['pres1', 5, 1.7, -60, 5, 16, -170], ['pres2', 0, 1.7, -250, 60, 14, -200], ['pres3', 100, 1.7, 100, 150, 9, 100],
    ['pres4', 0, 60, -420, 0, 10, -330], ['pres5', -40, 1.7, 110, -150, 12, 60], ['pres6', 0, 140, 420, 0, 0, 60],
  ],
  pyramide_louvre: [['pres1', 30, 1.7, 44, 0, 8, 0]],
  arc_carrousel: [['pres1', 3, 1.7, 16, 0, 7, 0], ['pres2', 16, 6, 12, 0, 12, 0]],
  invalides: [['pres1', 10, 1.7, 175, 0, 14, 125], ['pres2', 30, 1.7, -190, 0, 50, -100], ['pres3', 0, 1.7, 95, 0, 8, 20], ['pres4', 90, 120, -230, 0, 50, -90]],
  hotel_de_ville: [['pres1', 20, 1.7, 80, 0, 18, 44], ['pres2', -90, 30, 100, 0, 20, 0]],
  palais_bourbon: [['pres1', -20, 1.7, 125, -18, 12, 80], ['pres2', 30, 12, 130, -18, 14, 80]],
  palais_elysee: [['pres1', 4, 1.7, 66, 0, 5, 40], ['pres2', 0, 40, 80, 0, 5, 0], ['pres3', 0, 1.7, 30, 0, 6, -10]],
  palais_royal: [['pres1', 10, 1.7, 10, 12, 4, -30], ['pres2', 30, 1.7, 90, 30, 8, 50], ['pres3', 12, 45, 40, 12, 0, -20]],
  ecole_militaire: [['pres1', 15, 1.7, 150, 0, 18, 80], ['pres2', -60, 25, 170, 0, 20, 80]],
  institut_de_france: [['pres1', 10, 1.7, 110, 0, 20, 40], ['pres2', -60, 20, 120, 0, 20, 40]],
  palais_justice: [['pres1', 20, 1.7, 140, 22, 12, 80], ['pres2', -150, 1.7, 10, -100, 12, 0]],
  conciergerie: [['pres1', 10, 1.7, 62, 5, 16, 25], ['pres2', -90, 1.7, 55, -60, 22, 25]],
  prefecture_police: [['pres1', 10, 1.7, 95, 0, 12, 58]],
  hotel_matignon: [['pres1', 3, 1.7, 52, 0, 5, 20], ['pres2', 0, 35, 70, 0, 5, 0], ['pres3', 0, 1.7, -75, 0, 8, -35]],
  musee_orsay: [['pres1', 30, 1.7, 75, 0, 16, 38], ['pres2', -110, 20, 90, -80, 20, 38]],
  gare_saint_lazare: [['pres1', 10, 1.7, 165, 0, 14, 110], ['pres2', 60, 90, 60, 0, 10, -20]],
};
const args = process.argv.slice(2);
const vuesArg = args.find((a) => a.startsWith('--vues='));
const vues = vuesArg ? vuesArg.slice(7).split(',') : null;
// --rapport=<nom> : fichier de rapport propre à cette exécution (plusieurs exécutions en parallèle)
const rapportArg = args.find((a) => a.startsWith('--rapport='));
const only = args.filter((a) => !a.startsWith('--'));
const want = (name) => only.length === 0 || only.includes(name);
const wantVue = (name) => vues === null || vues.includes(name);

const server = await startServer();
const errors = [];
const report = [];
let ok = true;
let browser = null;

/** Capture avec un délai large et deux reprises : le WebGL logiciel peut être très lent sur une machine chargée. */
async function snap(page, name) {
  const file = path.join(OUT, name + '.png');
  for (let attempt = 0; ; attempt++) {
    try { await page.screenshot({ path: file, timeout: 180000 }); return file; } catch (err) {
      if (attempt >= 2) throw err;
      console.log(`[monuments-palais] capture ${name} : nouvelle tentative (${String(err).split('\n')[0]})`);
    }
  }
}

async function settle(page, n = 3) {
  const f = await page.evaluate(() => window.__frames);
  await waitFor(page, `window.__frames >= ${f + n}`);
}

async function open(query) {
  if (browser) await browser.close().catch(() => {});
  const res = await openPage(`${server.url}harness/monuments.html?shot=1&${query}`, { width: 1280, height: 800 });
  browser = res.browser;
  const before = res.errors.length;
  await waitFor(res.page, 'window.__ready === true', 240000);
  return { page: res.page, pageErrors: res.errors, before };
}

for (const key of KEYS) {
  if (!want(key)) continue;
  const t0 = Date.now();
  const { page, pageErrors } = await open(`key=${key}&quality=haut`);
  for (const [i, name] of [[0, 'trois-quarts'], [1, 'face'], [3, 'arriere'], [2, 'pieton']]) {
    if (!wantVue(name)) continue;
    await page.evaluate((v) => window.__setView(v), i);
    await settle(page);
    await snap(page, `palais-${key}-jour-${name}`);
  }
  for (const [name, cx, cy, cz, tx, ty, tz] of CLOSE[key] ?? []) {
    if (!wantVue(name)) continue;
    await page.evaluate((v) => window.__look(...v), [cx, cy, cz, tx, ty, tz]);
    await settle(page);
    await snap(page, `palais-${key}-${name}`);
  }
  // bilan mesuré en vue d'ensemble (tout le monument dans le champ : aucun maillage écarté)
  await page.evaluate(() => window.__setView(0));
  await settle(page, 2);
  const st = await page.evaluate(() => window.__stats());
  if (wantVue('nuit')) {
    await page.evaluate(() => { window.__setNight(true); window.__setView(0); });
    await settle(page, 4);
    await snap(page, `palais-${key}-nuit`);
    await page.evaluate(() => window.__setNight(false));
  }
  await page.evaluate(() => { window.__setFar(true); window.__setView(0); });
  await settle(page);
  if (wantVue('silhouette')) await snap(page, `palais-${key}-silhouette`);
  const stFar = await page.evaluate(() => window.__stats());
  const max = BUDGET[key] ?? 60000;
  const pass = st.triangles <= max && st.drawCalls <= 12 && st.rendererCalls <= 12 && stFar.triangles <= 400;
  if (!pass) ok = false;
  report.push({
    key, triangles: st.triangles, rendererTriangles: st.rendererTriangles, drawCalls: st.drawCalls, rendererCalls: st.rendererCalls,
    farTriangles: stFar.triangles, farCalls: stFar.rendererCalls, buildMs: st.buildMs, height: st.height, width: st.width, depth: st.depth,
    budget: max, pass, ms: Date.now() - t0,
  });
  pageErrors.forEach((e) => errors.push(`${key} : ${e}`));
  console.log(`[monuments-palais] ${key} : ${st.triangles} triangles, ${st.rendererCalls} appels (silhouette ${stFar.triangles} tri., ${stFar.rendererCalls} appels) ${st.width} × ${st.height} × ${st.depth} m ${pass ? 'OK' : 'HORS BUDGET'} — ${Date.now() - t0} ms`);
}

// rapport cumulatif : une exécution partielle met à jour les monuments concernés sans effacer les autres
const file = path.join(OUT, rapportArg ? rapportArg.slice(10) : 'monuments-palais-report.json');
let all = [];
if (existsSync(file)) { try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { all = []; } }
for (const r of report) { const i = all.findIndex((x) => x.key === r.key); if (i >= 0) all[i] = r; else all.push(r); }
writeFileSync(file, JSON.stringify(all, null, 2));
console.log('rapport :', file);
await finish({ browser, server, errors, ok, label: 'monuments-palais' });
