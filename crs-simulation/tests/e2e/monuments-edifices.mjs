// Captures du lot « édifices » (églises, opéras, palais) dans le banc d'essai des monuments :
// pour chaque monument, 3 angles de jour (trois quarts, face, arrière en plongée), 1 vue à hauteur de piéton,
// 1 vue de nuit et la silhouette lointaine, avec le bilan lu dans renderer.info (triangles, appels de dessin).
//   node tests/e2e/monuments-edifices.mjs                        tout le lot
//   node tests/e2e/monuments-edifices.mjs notre_dame madeleine   quelques monuments
//   … --look=cx,cy,cz,tx,ty,tz[,nuit]   vue libre supplémentaire (répétable) : monument-<clé>-vue-<n>.png
//   … --quick                           seulement trois quarts + face (mise au point)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish, OUT } from './lib.mjs';

export const KEYS = [
  'notre_dame', 'sainte_chapelle', 'madeleine', 'opera_garnier', 'saint_eustache', 'saint_sulpice',
  'tour_saint_jacques', 'bourse_commerce', 'centre_pompidou', 'opera_bastille', 'grand_palais', 'petit_palais',
];
const BUDGET = { notre_dame: 120000 };
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const looks = args.filter((a) => a.startsWith('--look=')).map((a) => a.slice(7).split(','));
const quick = args.includes('--quick');
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
  await waitFor(res.page, 'window.__ready === true', 240000);
  return { page: res.page, pageErrors: res.errors };
}

for (const key of KEYS) {
  if (!want(key)) continue;
  const t0 = Date.now();
  const { page, pageErrors } = await open(`key=${key}&quality=haut`);
  const views = quick ? [[0, 'trois-quarts'], [1, 'face']] : [[0, 'trois-quarts'], [1, 'face'], [3, 'arriere'], [2, 'pieton']];
  for (const [i, name] of views) {
    await page.evaluate((v) => window.__setView(v), i);
    await settle(page);
    await shot(page, `monument-${key}-jour-${name}`);
  }
  for (let i = 0; i < looks.length; i++) {
    const [cx, cy, cz, tx, ty, tz, night] = looks[i];
    await page.evaluate(([a, n]) => { window.__setNight(!!n); window.__look(...a); }, [[cx, cy, cz, tx, ty, tz].map(Number), night === 'nuit']);
    await settle(page, 4);
    await shot(page, `monument-${key}-vue-${i + 1}`);
    await page.evaluate(() => window.__setNight(false));
  }
  // bilan mesuré en vue d'ensemble (tout le monument dans le champ : aucun maillage écarté)
  await page.evaluate(() => window.__setView(0));
  await settle(page, 2);
  const st = await page.evaluate(() => window.__stats());
  let stFar = { triangles: 0, rendererCalls: 0 };
  if (!quick) {
    await page.evaluate(() => { window.__setNight(true); window.__setView(0); });
    await settle(page, 4);
    await shot(page, `monument-${key}-nuit`);
    await page.evaluate(() => { window.__setNight(false); window.__setFar(true); window.__setView(0); });
    await settle(page);
    await shot(page, `monument-${key}-silhouette`);
    stFar = await page.evaluate(() => window.__stats());
  }
  const max = BUDGET[key] ?? 60000;
  const pass = st.triangles <= max && st.drawCalls <= 12 && st.rendererCalls <= 12 && stFar.triangles <= 400;
  if (!pass) ok = false;
  report.push({
    key, triangles: st.triangles, rendererTriangles: st.rendererTriangles, drawCalls: st.drawCalls, rendererCalls: st.rendererCalls,
    farTriangles: stFar.triangles, farCalls: stFar.rendererCalls, buildMs: st.buildMs, height: st.height, width: st.width, depth: st.depth,
    budget: max, pass, ms: Date.now() - t0,
  });
  pageErrors.forEach((e) => errors.push(`${key} : ${e}`));
  console.log(`[monuments-edifices] ${key} : ${st.triangles} triangles, ${st.rendererCalls} appels (silhouette ${stFar.triangles} tri., ${stFar.rendererCalls} appels), ${st.width} × ${st.height} × ${st.depth} m, construction ${st.buildMs} ms ${pass ? 'OK' : 'HORS BUDGET'} — ${Date.now() - t0} ms`);
}

if (only.length === 0 && !quick) {
  const file = path.join(OUT, 'monuments-edifices-report.json');
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('rapport :', file);
}
await finish({ browser, server, errors, ok, label: 'monuments-edifices' });
