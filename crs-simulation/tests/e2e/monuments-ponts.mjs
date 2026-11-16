// Captures du lot « ponts » sur site réel (harness/monuments-ponts.html : vrai système, vraie carte) :
// pour chaque monument, 3 angles de jour (trois quarts, élévation, arrière en plongée), 1 vue à hauteur de piéton,
// 1 vue de nuit et la silhouette lointaine, avec le bilan du monument (triangles, appels de dessin).
//   node tests/e2e/monuments-ponts.mjs                       tout le lot + horizon
//   node tests/e2e/monuments-ponts.mjs pont_neuf horizon      quelques sujets
//   … --look=cx,cy,cz,tx,ty,tz[,nuit]   vue libre supplémentaire en repère local (répétable) : monument-<clé>-vue-<n>.png
//   … --quick                           seulement trois quarts + élévation
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish, OUT } from './lib.mjs';

export const KEYS = [
  'pont_alexandre_iii', 'pont_neuf', 'pont_neuf_petit_bras', 'palais_chaillot', 'palais_chaillot_passy', 'fontaine_varsovie',
  'fontaine_des_mers', 'porte_saint_denis', 'porte_saint_martin',
];
/** Vues propres à un monument (repère local) : [nom, cx, cy, cz, tx, ty, tz]. */
const EXTRA = {
  pont_alexandre_iii: [['berge', 70, -3.5, 30, 0, -1, 0], ['pylone', 6, 1.7, 52, 23, 9, 68], ['clef', 46, 0.5, 6, 20, -1, 1]],
  pont_neuf: [['berge', -60, -5, 10, 0, -2, 5], ['demi-lune', -4.5, 1.7, 23, -11.5, 0.6, 14.5], ['corniche', -22, -1.2, 30, -10.5, -0.8, 17], ['henri-iv', -6, 1.9, 96, -26, 5, 105]],
  pont_neuf_petit_bras: [['berge', 48, -4.5, -6, 0, -2, 0]],
  palais_chaillot: [['parvis', -122, 5.6, -56, -122, 6, 60], ['statues', -118, 5.5, -52, -97, 9, -28], ['ensemble', -122, 150, 330, -122, 0, 20], ['jardins', -122, -12, 150, -122, 10, -20]],
  palais_chaillot_passy: [['statues', 118, 5.5, -52, 97, 9, -28], ['pavillon', 74, -3.5, 40, 74, 12, -10]],
  fontaine_varsovie: [['canons', 0, 6, 75, 0, 3, -30], ['haut', 30, 22, -95, 0, -2, 20]],
  porte_saint_denis: [['face', 0, 9, 46, 0, 12, 0], ['sous-arche', 0, 1.7, 22, 0, 8, 0]],
  porte_saint_martin: [['face', 0, 7, 36, 0, 9, 0], ['sous-arche', 0, 1.7, 18, 0, 6, 0]],
};
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
  const res = await openPage(`${server.url}harness/monuments-ponts.html?shot=1&${query}`, { width: 1280, height: 800 });
  browser = res.browser;
  await waitFor(res.page, 'window.__ready === true', 300000);
  return { page: res.page, pageErrors: res.errors };
}

for (const key of KEYS) {
  if (!want(key)) continue;
  const t0 = Date.now();
  const { page, pageErrors } = await open(`key=${key}&quality=haut`);
  const failed = await page.evaluate(() => window.__failed);
  if (failed) { errors.push(`${key} : ${failed}`); pageErrors.forEach((e) => errors.push(`${key} : ${e}`)); ok = false; continue; }
  const views = quick ? [[0, 'trois-quarts'], [1, 'elevation']] : [[0, 'trois-quarts'], [1, 'elevation'], [3, 'arriere'], [2, 'pieton']];
  for (const [i, name] of views) {
    await page.evaluate((v) => window.__setView(v), i);
    await settle(page, 5);
    await shot(page, `monument-${key}-jour-${name}`);
  }
  for (const [name, ...v] of quick ? [] : EXTRA[key] ?? []) {
    await page.evaluate((a) => window.__look(...a), v);
    await settle(page, 5);
    await shot(page, `monument-${key}-jour-${name}`);
  }
  for (let i = 0; i < looks.length; i++) {
    const [cx, cy, cz, tx, ty, tz, n] = looks[i];
    await page.evaluate(([a, nn]) => { window.__setNight(!!nn); window.__look(...a); }, [[cx, cy, cz, tx, ty, tz].map(Number), n === 'nuit']);
    await settle(page, 5);
    await shot(page, `monument-${key}-vue-${i + 1}`);
    await page.evaluate(() => window.__setNight(false));
  }
  await page.evaluate(() => window.__setView(0));
  await settle(page, 4);
  const st = await page.evaluate(() => window.__stats());
  let stFar = { triangles: 0, drawCalls: 0 };
  if (!quick) {
    await page.evaluate(() => { window.__setNight(true); window.__setView(0); });
    await settle(page, 5);
    await shot(page, `monument-${key}-nuit`);
    await page.evaluate(() => { window.__setNight(false); window.__setFar(true); window.__setView(0); });
    await settle(page, 8);
    await shot(page, `monument-${key}-silhouette`);
    stFar = await page.evaluate(() => window.__stats());
  }
  const pass = st.triangles > 0 && st.triangles <= 60000 && st.drawCalls <= 12 && stFar.triangles <= 400 && (quick || stFar.triangles > 0);
  if (!pass) ok = false;
  report.push({ key, triangles: st.triangles, drawCalls: st.drawCalls, farTriangles: stFar.triangles, farCalls: stFar.drawCalls, width: st.width, depth: st.depth, top: st.top, pass, ms: Date.now() - t0 });
  pageErrors.forEach((e) => errors.push(`${key} : ${e}`));
  console.log(`[monuments-ponts] ${key} : ${st.triangles} triangles, ${st.drawCalls} appels (silhouette ${stFar.triangles} tri., ${stFar.drawCalls} appels), ${st.width} × ${st.top} × ${st.depth} m ${pass ? 'OK' : 'HORS BUDGET'} — ${Date.now() - t0} ms`);
}

if (want('horizon')) {
  // silhouettes d'horizon : vues de la Concorde (œil à 12 m pour passer au-dessus du décor sommaire), puis au téléobjectif
  const { page, pageErrors } = await open('horizon=1&quality=haut');
  const list = await page.evaluate(() => window.__horizon);
  for (const h of list) {
    await page.evaluate((a) => window.__lookWorld(0, 12, 0, a.x, a.baseY + a.height * 0.4, a.z, 12), h);
    await settle(page, 4);
    await shot(page, `horizon-${h.key}-concorde`);
    const d = Math.hypot(h.x, h.z), k = (d - 900) / d;
    await page.evaluate(([a, kk]) => window.__lookWorld(a.x * kk, a.baseY + 30, a.z * kk, a.x, a.baseY + a.height * 0.45, a.z, 30), [h, k]);
    await settle(page, 4);
    await shot(page, `horizon-${h.key}-proche`);
  }
  await page.evaluate(() => { window.__setNight(true); window.__lookWorld(0, 12, 0, 1597, 140, -2354, 12); });
  await settle(page, 5);
  await shot(page, 'horizon-sacre_coeur-nuit');
  const st = await page.evaluate(() => window.__stats());
  const each = await page.evaluate(() => window.__sys.api.stats());
  console.log(`[monuments-ponts] horizon : ${st.horizon} silhouettes, ${each.horizonTriangles} triangles, ${each.horizonDrawCalls} appels`);
  report.push({ key: 'horizon', count: st.horizon, triangles: each.horizonTriangles, drawCalls: each.horizonDrawCalls });
  if (st.horizon !== list.length) ok = false;
  pageErrors.forEach((e) => errors.push(`horizon : ${e}`));
}

if (only.length === 0 && !quick) {
  const file = path.join(OUT, 'monuments-ponts-report.json');
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('rapport :', file);
}
await finish({ browser, server, errors, ok, label: 'monuments-ponts' });
