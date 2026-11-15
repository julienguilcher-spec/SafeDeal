// fetch-b-all.mjs — lance toute la chaîne des couches de détail (lot B), dans l'ordre des dépendances.
//   node tools/map/fetch-b-all.mjs            # utilise le cache disque (raw/b/), quelques secondes
//   node tools/map/fetch-b-all.mjs --force    # retélécharge tout (≈ 70 requêtes, 1 par seconde et par hôte)
// Ordre : OSM → arbres → monuments → mobilier (lit monuments + bâtiments + rues) → commerces → feux et métro → relief → contrôle.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const STEPS = ['fetch-b-1-osm.mjs', 'fetch-b-2-trees.mjs', 'fetch-b-3-landmarks.mjs', 'fetch-b-4-furniture.mjs', 'fetch-b-5-shops.mjs', 'fetch-b-6-signals-metro.mjs', 'fetch-b-7-terrain.mjs', 'fetch-b-8-check.mjs'];
const t0 = Date.now();
for (const step of STEPS) {
  console.log(`\n════════ ${step} ════════`);
  const r = spawnSync(process.execPath, [path.join(here, step), ...args], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\n${step} a échoué (code ${r.status}) : chaîne interrompue.`); process.exit(r.status || 1); }
}
console.log(`\nChaîne B terminée en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
