// Immeubles de Paris : captures du banc d'essai (jour et nuit, caméra piétonne et aérienne) et mesures.
// Usage : node tests/e2e/buildings.mjs [qualités séparées par des virgules] [paramètres d'URL supplémentaires]
//   ex. : node tests/e2e/buildings.mjs haut,bas "src=paris&tile=1,-1"
// Captures : tests/e2e/out/buildings-<qualité>-<vue>-<heure>.png
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const qualities = (process.argv[2] ?? 'haut,bas').split(',');
const extra = process.argv[3] ? '&' + process.argv[3] : '';
const tag = process.argv[4] ? process.argv[4] + '-' : '';
const SHOTS = [
  ['street', 15], ['facade', 15], ['close', 15], ['roofs', 15], ['aerial', 15], ['far', 15], ['top', 11],
  ['street', 22], ['facade', 22], ['aerial', 22], ['street', 19.5],
];

const server = await startServer();
const allErrors = [];
let ok = true;
let browserToClose = null;
for (const quality of qualities) {
  const t0 = Date.now();
  const { browser, page, errors } = await openPage(`${server.url}harness/buildings.html?quality=${quality}${extra}`, { width: 1280, height: 720 });
  browserToClose = browser;
  await waitFor(page, 'window.__ready === true || window.__error', 300000);
  const error = await page.evaluate(() => window.__error ?? null);
  if (error) { console.error(`[buildings] ${quality} : ${error}`); ok = false; allErrors.push(...errors); await browser.close(); continue; }
  for (const [view, hour] of SHOTS) {
    if (quality !== qualities[0] && !['street', 'aerial', 'facade'].includes(view)) continue;
    await page.evaluate(([v, h]) => { window.__setTime(h); window.__setView(v); }, [view, hour]);
    const file = await shot(page, `buildings-${tag}${quality}-${view}-${String(hour).replace('.', 'h')}`);
    console.log('capture :', file);
  }
  const stats = await page.evaluate(() => window.__stats);
  const bench = await page.evaluate(() => window.__bench(9));
  const before = await page.evaluate(() => window.__memory());
  const after = await page.evaluate(() => window.__dispose());
  console.log(`\n=== ${stats.world} — tuile ${stats.tile} — qualité ${quality} (${((Date.now() - t0) / 1000).toFixed(1)} s) ===`);
  console.log(`bâtiments de la tuile        : ${stats.buildings}`);
  console.log(`version détaillée            : ${stats.triangles} triangles, ${stats.vertices} sommets, ${(stats.gpuBytes / 1048576).toFixed(1)} Mo sur la carte graphique, ${stats.drawCalls} appel(s) de dessin, palier de détail ${stats.detailStep}`);
  console.log(`  construction (1re fois)    : ${stats.buildMs.toFixed(1)} ms   |  9 essais : médiane ${bench.detailMedianMs.toFixed(1)} ms, min ${bench.detailMinMs.toFixed(1)}, max ${bench.detailMaxMs.toFixed(1)}`);
  console.log(`version lointaine (voisines) : ${stats.farTiles} tuiles, max ${stats.farTrianglesMax} triangles, ${stats.farDrawCallsMax} appel de dessin, ${stats.farBuildMsMax.toFixed(1)} ms max`);
  console.log(`  même tuile en lointain     : ${bench.farTriangles} triangles, médiane ${bench.farMedianMs.toFixed(1)} ms`);
  console.log(`atlas de textures            : peint en ${stats.atlasPaintMs.toFixed(0)} ms, ${(stats.atlasBytes / 1048576).toFixed(1)} Mo (hors mipmaps)`);
  console.log(`scène entière (dernier rendu): ${stats.rendererCalls} appels de dessin, ${stats.rendererTriangles} triangles (ombres et sol compris)`);
  console.log(`mémoire GPU avant / après dispose() : ${before.geometries} géométries, ${before.textures} textures → ${after.geometries} géométries, ${after.textures} textures`);
  if (stats.drawCalls > 4 || stats.farDrawCallsMax > 1 || stats.triangles > 250000 || stats.farTrianglesMax > 15000) { console.error('[buildings] budget dépassé'); ok = false; }
  // après dispose() il ne doit rester que ce que le banc d'essai possédait avant toute tuile (sol, carte d'ombres)
  // (hors qualité basse, Three.js garde en plus sa propre table DFG du matériau standard : une texture)
  const kept = quality === 'bas' ? 0 : 1;
  if (after.geometries > stats.baseline.geometries || after.textures > stats.baseline.textures + kept) {
    console.error(`[buildings] ressources non libérées (référence : ${stats.baseline.geometries} géométries, ${stats.baseline.textures} textures)`);
    ok = false;
  }
  allErrors.push(...errors);
  await browser.close();
}
await finish({ browser: null, server, errors: allErrors, ok, label: 'buildings' });
