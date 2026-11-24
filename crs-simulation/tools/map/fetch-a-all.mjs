// fetch-a-all.mjs — enchaîne toute la chaîne « couches structurelles » (téléchargements avec cache, normalisation, contrôle).
//
//   node tools/map/fetch-a-all.mjs            (réutilise le cache disque de raw/)
//   node tools/map/fetch-a-all.mjs --force    (retélécharge tout)
//
// Étapes : 1 OSM · 2 IGN BD TOPO · 3 Ville de Paris · 4 buildings · 5 roads · 6 areas + barriers · 7 places · 8 contrôle.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { HERE } from './lib-a.mjs';

const force = process.argv.includes('--force');
const STEPS = [
  ['fetch-a-1-osm.mjs', true], ['fetch-a-2-ign.mjs', true], ['fetch-a-3-paris.mjs', true],
  ['fetch-a-4-buildings.mjs', false], ['fetch-a-5-roads.mjs', false], ['fetch-a-6-areas.mjs', false], ['fetch-a-7-places.mjs', false],
  ['fetch-a-8-check.mjs', false],
];
for (const [script, isFetch] of STEPS) {
  console.log(`\n══════ ${script} ══════`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...(force && isFetch ? ['--force'] : [])], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${script} a échoué (code ${r.status}). Arrêt.`);
    process.exit(r.status || 1);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
console.log('\nChaîne terminée : couches dans tools/map/raw/normalized/.');
