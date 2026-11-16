// La ville en 3D : captures du banc d'essai harness/world.html et mesures.
// Usage : node tests/e2e/world.mjs [qualité] [vues séparées par des virgules | tout] [paramètres d'URL supplémentaires]
//   ex. : node tests/e2e/world.mjs haut champs,quai "dist=1200"
// Captures : tests/e2e/out/world-<qualité>-<vue>.png ; rapport : tests/e2e/out/world-report.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish, OUT } from './lib.mjs';

const quality = process.argv[2] ?? 'haut';
const only = process.argv[3] && process.argv[3] !== 'tout' ? process.argv[3].split(',') : null;
const extra = process.argv[4] ? '&' + process.argv[4] : '';

// [nom de la capture, vue, heure, météo]
const SHOTS = [
  ['champs', 'champs', 15, 'clair'],
  ['concorde', 'concorde', 11, 'clair'],
  ['rivoli', 'rivoli', 16, 'nuageux'],
  ['marais', 'marais', 14, 'clair'],
  ['quai', 'quai', 15.5, 'clair'],
  ['pont', 'pont', 10, 'clair'],
  ['etoile-ciel', 'etoile', 14, 'clair'],
  ['concorde-ciel', 'ciel', 14, 'clair'],
  ['nuit', 'chaussee', 22.5, 'clair'],
  ['pluie', 'rivoli', 17, 'pluie'],
  ['pluie-concorde', 'concorde', 13, 'averse'],
];

const server = await startServer();
const t0 = Date.now();
const { browser, page, errors } = await openPage(`${server.url}harness/world.html?shot=1&quality=${quality}&place=concorde${extra}`, { width: 1280, height: 720 });
let ok = true;
const report = { quality, shots: {}, roundTrip: null, map: null };
try {
  await waitFor(page, 'window.__ready === true || window.__error', 600000);
  const error = await page.evaluate(() => window.__error ?? null);
  if (error) throw new Error(error);
  console.log(`[world] prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const [name, vue, heure, meteo] of SHOTS) {
    if (only && !only.includes(name)) continue;
    const t1 = Date.now();
    const st = await page.evaluate(([v, h, m]) => window.__goto(v, { heure: h, meteo: m }), [vue, heure, meteo]);
    const file = await shot(page, `world-${quality}-${name}`);
    report.shots[name] = st;
    console.log(`capture : ${file} (${((Date.now() - t1) / 1000).toFixed(1)} s) — ${st.secteur} — ${st.detailTiles} tuiles détaillées, ${st.farTiles} lointaines ; ville ${st.drawCalls} appels / ${Math.round(st.triangles / 1000)} k tri ; immeubles ${st.buildingDrawCalls} appels / ${Math.round(st.buildingTriangles / 1000)} k tri ; image ${st.rendu.appels} appels / ${Math.round(st.rendu.triangles / 1000)} k tri ; étape max ${st.maxStepMs.toFixed(1)} ms`);
    if (st.maxDetailDrawCalls > 8) { console.error(`[world] ${name} : ${st.maxDetailDrawCalls} appels de dessin pour une tuile détaillée (budget : 8)`); ok = false; }
  }
  if (!only || only.includes('carte')) {
    // mini-carte et carte tactique (service world.map2d)
    await page.evaluate(() => window.__goto('concorde', { heure: 12, meteo: 'clair' }));
    let ms = await page.evaluate(() => window.__map({ mpp: 1.2 }));
    console.log('capture :', await shot(page, `world-${quality}-carte-concorde`), `(dessin ${ms.toFixed(1)} ms)`);
    ms = await page.evaluate(() => window.__map({ mpp: 5, theme: 'nuit', x: -900, z: -400 }));
    console.log('capture :', await shot(page, `world-${quality}-carte-tactique`), `(dessin ${ms.toFixed(1)} ms)`);
    ms = await page.evaluate(() => window.__map({ mpp: 0.5, rotation: 0.6 }));
    console.log('capture :', await shot(page, `world-${quality}-carte-zoom`), `(dessin ${ms.toFixed(1)} ms)`);
    report.map = { ms };
    await page.evaluate(() => window.__map(null));
  }
  if (!only || only.includes('memoire')) {
    // aller-retour : la mémoire de la carte graphique doit revenir à sa valeur de départ
    await page.evaluate(() => window.__goto('concorde', { heure: 12, meteo: 'clair' }));
    const trip = await page.evaluate(() => window.__roundTrip());
    report.roundTrip = trip;
    console.log(`aller-retour de ${trip.deplacement} m : géométries ${trip.avant.geometries} → ${trip.ailleurs.geometries} → ${trip.apres.geometries} ; textures ${trip.avant.textures} → ${trip.ailleurs.textures} → ${trip.apres.textures} ; tuiles [détaillées, lointaines] ${JSON.stringify(trip.tuilesAvant)} → ${JSON.stringify(trip.tuilesAilleurs)} → ${JSON.stringify(trip.tuilesApres)}`);
    if (Math.abs(trip.apres.geometries - trip.avant.geometries) > 2 || Math.abs(trip.apres.textures - trip.avant.textures) > 2) {
      console.error('[world] la mémoire de la carte graphique ne revient pas à sa valeur de départ après un aller-retour');
      ok = false;
    }
  }
} catch (err) {
  console.error('[world] ' + (err && err.stack ? err.stack : String(err)));
  ok = false;
}
writeFileSync(path.join(OUT, `world-report-${quality}.json`), JSON.stringify(report, null, 1));
await finish({ browser, server, errors, ok, label: 'world' });
