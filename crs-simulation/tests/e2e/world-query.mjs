// Banc d'essai 2D du monde (simulation) : captures du quartier d'essai, et de Paris si les données existent.
// Usage : node tests/e2e/world-query.mjs
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish, ROOT } from './lib.mjs';

const server = await startServer();
// CRS_PARIS_BASE : URL (relative au serveur) d'un autre dossier de carte, ex. « /tests/e2e/out/paris-tmp/ ».
const parisBase = process.env.CRS_PARIS_BASE || '';
const hasParis = parisBase !== '' || existsSync(path.join(ROOT, 'public/data/paris/manifest.json'));
let ok = true;
const allErrors = [];

async function run(map, views, engine = false) {
  const extra = (map === 'paris' && parisBase !== '' ? `&base=${encodeURIComponent(parisBase)}` : '') + (engine ? '&engine=1' : '');
  const { browser, page, errors } = await openPage(`${server.url}harness/world-query.html?map=${map}${extra}`, { width: 1400, height: 900 });
  try {
    await waitFor(page, 'window.__ready === true || !!window.__error', 240000);
    const error = await page.evaluate(() => window.__error ?? null);
    if (error) throw new Error(error);
    if (engine) {
      // Monde branché dans le moteur : la session a chargé les tuiles autour du point de départ.
      const log = await page.evaluate(() => ({ ...window.__wq.engine, stats: window.__wq.world.stats() }));
      console.log(`moteur (${map}) : ${JSON.stringify(log)}`);
      if (!(log.loaded > 0) || log.stats.tilesLoaded === 0) {
        console.error('  ÉCHEC : aucune tuile chargée par la session');
        ok = false;
      }
    }
    for (const v of views) {
      const report = await page.evaluate((req) => window.__wq.view(req), v.req);
      const file = await shot(page, v.name);
      console.log(`${v.name} : ${JSON.stringify(report)}`);
      console.log(`  capture : ${file}`);
      if (report.walkersInSolid > 0) {
        console.error(`  ÉCHEC : ${report.walkersInSolid} pas de marcheur dans un obstacle plein`);
        ok = false;
      }
      if (v.expectSource && report.source !== v.expectSource) {
        console.error(`  ÉCHEC : jeu de données « ${report.source} » au lieu de « ${v.expectSource} »`);
        ok = false;
      }
      if (v.needsPath && !(report.footPath > 0 && report.vehiclePath > 0)) {
        console.error('  ÉCHEC : itinéraire introuvable');
        ok = false;
      }
    }
  } catch (err) {
    console.error(`[world-query] ${map} :`, err);
    ok = false;
  }
  allErrors.push(...errors);
  await browser.close();
}

await run('test', [
  { name: 'world-query-essai-ensemble', req: { x: 0, z: 0, span: 1060 }, expectSource: 'test-district', needsPath: true },
  { name: 'world-query-essai-place', req: { x: 0, z: 0, span: 230 }, expectSource: 'test-district', needsPath: true },
  { name: 'world-query-essai-square', req: { x: -234.5, z: 82, span: 190 }, expectSource: 'test-district', needsPath: true },
  { name: 'world-query-essai-pont', req: { x: 0, z: 360, span: 260 }, expectSource: 'test-district', needsPath: true },
  { name: 'world-query-essai-detail', req: { x: 150, z: -40, span: 90 }, expectSource: 'test-district', needsPath: true },
]);

// Le même module branché dans le vrai moteur (Game, session, source fetch, chargement étalé).
await run('test', [{ name: 'world-query-moteur-essai', req: { x: 0, z: 0, span: 400 }, expectSource: 'test-district', needsPath: true }], true);

if (hasParis) {
  await run('paris', [{ name: 'world-query-moteur-paris', req: { place: 'place de la Concorde', span: 700 }, expectSource: 'paris', needsPath: true }], true);
  await run('paris', [
    { name: 'world-query-paris-etoile', req: { place: 'place Charles de Gaulle', x: -1923, z: -908, span: 520 }, expectSource: 'paris', needsPath: true },
    { name: 'world-query-paris-concorde', req: { place: 'place de la Concorde', x: 0, z: 0, span: 520 }, expectSource: 'paris', needsPath: true },
    { name: 'world-query-paris-cite', req: { x: 1870, z: 1230, span: 900 }, expectSource: 'paris', needsPath: true },
    { name: 'world-query-paris-concorde-detail', req: { x: 0, z: 0, span: 160 }, expectSource: 'paris', needsPath: true },
    { name: 'world-query-paris-pont-concorde', req: { x: -127, z: 250, span: 260 }, expectSource: 'paris', needsPath: true },
  ]);
} else {
  console.log("[world-query] public/data/paris/manifest.json absent : captures de Paris non réalisées");
}

await finish({ server, errors: allErrors, ok, label: 'world-query' });
