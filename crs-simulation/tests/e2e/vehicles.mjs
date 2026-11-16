// Captures du banc d'essai des véhicules : alignements (face, profil, trois-quarts, dessus), nuit gyrophares
// allumés, états de dégâts, modèles lointains, vue intérieure, écran de tourelle, parc de 150 véhicules civils.
// Usage : node tests/e2e/vehicles.mjs [filtre]   — ex. « alignement », « fiche- » (toutes les fiches), « nuit », « interieur »,
// « parc », ou « tout » (jeu complet, fiches de chaque modèle comprises).
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const arg = process.argv[2] ?? '';
const filter = arg === 'tout' ? '' : arg;
const server = await startServer();
const allErrors = [];
let browserRef = null;
const results = {};

async function capture(name, query, opts = {}) {
  if (filter && !name.includes(filter)) return null;
  const t0 = Date.now();
  const { browser, page, errors } = await openPage(server.url + 'harness/vehicles.html?' + query, { width: opts.width ?? 1600, height: opts.height ?? 900 });
  browserRef = browser;
  try {
    await waitFor(page, `window.__ready === true && window.__frames >= ${opts.frames ?? 6}`, opts.timeout ?? 300000);
    // on fige le rendu : la capture n'a plus à disputer le processeur au WebGL logiciel
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(150);
    const file = await shot(page, 'vehicles-' + name);
    const info = await page.evaluate(() => window.__info);
    console.log(`[vehicles] ${name} : ${file} (${Date.now() - t0} ms) ${JSON.stringify(info)}`);
    for (const e of errors) allErrors.push(name + ' : ' + e);
    results[name] = info;
    return info;
  } finally {
    await browser.close().catch(() => {});
  }
}

// vue à la demande : node tests/e2e/vehicles.mjs libre "view=fiche&kind=taxi&nuit=1" [nom]
if (filter === 'libre') {
  const q = process.argv[3] ?? 'view=alignement';
  await capture('libre-' + (process.argv[4] ?? q.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)), q + '&pas=0.033', { frames: Number(process.argv[5] ?? 8) });
  await finish({ browser: browserRef, server, errors: allErrors, label: 'vehicles' });
}

const PAGES = 5;
// (a) alignements de jour : quatre points de vue par page
for (let p = 1; p <= PAGES; p++) {
  for (const cam of ['trois-quarts', 'face', 'profil', 'dessus']) {
    await capture(`alignement-${p}-${cam}`, `view=alignement&page=${p}&cam=${cam}&pas=0.033`);
  }
}
// (b) de nuit, gyrophares et phares allumés (deux instants : les éclats alternent)
for (let p = 1; p <= 3; p++) {
  await capture(`nuit-${p}-a`, `view=alignement&page=${p}&nuit=1&pas=0.033`, { frames: 9 });
  await capture(`nuit-${p}-b`, `view=alignement&page=${p}&nuit=1&pas=0.033`, { frames: 19 });
}
await capture('nuit-4', 'view=alignement&page=4&nuit=1&pas=0.033', { frames: 9 });
// (c) fiches : chaque modèle sous quatre angles
const KINDS = ['fourgon_crs', 'car_crs', 'vl_commandement', 'voiture_police', 'fourgon_cellulaire', 'centaure', 'canon_eau', 'moto_bravm',
  'camion_pompiers', 'ambulance', 'voiture', 'citadine', 'suv', 'taxi', 'utilitaire', 'camion', 'bus', 'scooter', 'camion_sono', 'drone', 'helicoptere'];
// (par défaut : les trois engins emblématiques ; `node tests/e2e/vehicles.mjs fiche-` les capture tous)
const SHEETS = arg.startsWith('fiche') || arg === 'tout' ? KINDS : ['fourgon_crs', 'centaure', 'canon_eau'];
for (const k of SHEETS) await capture(`fiche-${k}`, `view=fiche&kind=${k}&pas=0.033`);
await capture('fiche-centaure-tourelle', 'view=fiche&kind=centaure&gis=40&site=25&braq=25&portes=1&pas=0.033', { frames: 40 });
await capture('fiche-canon_eau-tourelle', 'view=fiche&kind=canon_eau&gis=35&site=20&braq=-20&pas=0.033');
await capture('fiche-fourgon_crs-portes', 'view=fiche&kind=fourgon_crs&portes=1&braq=20&arriere=1&pas=0.033', { frames: 40 });
await capture('fiche-fourgon_crs-nuit', 'view=fiche&kind=fourgon_crs&nuit=1&frein=1&clig=g&pas=0.033', { frames: 9 });
await capture('fiche-centaure-nuit', 'view=fiche&kind=centaure&nuit=1&pas=0.033', { frames: 10 });
// (d) modèles lointains au téléobjectif
for (let p = 1; p <= PAGES; p++) await capture(`lointain-${p}`, `view=alignement&page=${p}&loin=1&pas=0.033`);
// (e) états : intact, endommagé, épave, en feu, calciné
for (const k of ['voiture', 'fourgon_crs', 'centaure']) await capture(`etats-${k}`, `view=etats&kind=${k}&pas=0.033`, { frames: 30 });
await capture('etats-voiture-nuit', 'view=etats&kind=voiture&nuit=1&pas=0.033', { frames: 30 });
// (f) vue intérieure
for (const k of ['fourgon_crs', 'voiture_police', 'centaure', 'canon_eau', 'moto_bravm']) {
  await capture(`interieur-${k}`, `view=interieur&kind=${k}&vitesse=47&braq=12&gyro=1&sirene=1&pas=0.033`, { frames: 12 });
}
await capture('interieur-fourgon_crs-nuit', 'view=interieur&kind=fourgon_crs&nuit=1&vitesse=30&frein=1&clig=d&pas=0.033', { frames: 12 });
await capture('interieur-fourgon_crs-tableau', 'view=interieur&kind=fourgon_crs&vitesse=62&hausse=-32&fov=50&gyro=1&sirene=1&clig=g&pas=0.033', { frames: 12 });
await capture('interieur-voiture-gauche', 'view=interieur&kind=voiture&regard=-55&vitesse=20&pas=0.033', { frames: 12 });
// (g) écrans de tourelle
await capture('tourelle-centaure', 'view=tourelle&kind=centaure&gis=18&site=14&pas=0.033', { frames: 12 });
await capture('tourelle-canon_eau', 'view=tourelle&kind=canon_eau&gis=-12&site=6&pas=0.033', { frames: 12 });
// mesure du coût CPU du module seul (sans rendu) : 600 images à 60 Hz avec 150 véhicules
async function measure(name, query, n = 600) {
  if (filter && !name.includes(filter)) return null;
  const { browser, page, errors } = await openPage(server.url + 'harness/vehicles.html?' + query + '&mesure=' + n, { width: 480, height: 270 });
  browserRef = browser;
  try {
    await waitFor(page, 'window.__mesure !== undefined', 600000);
    const m = await page.evaluate(() => window.__mesure);
    console.log(`[vehicles] ${name} : ${m.vehicules} véhicules (${m.detailles} détaillés, ${m.lointains} lointains, ${m.masques} masqués, ${m.quads} quads lumineux), `
      + `${m.appels} appels de dessin, ${m.triangles} triangles — CPU par image : médiane ${m.mediane.toFixed(3)} ms, moyenne ${m.moyenne.toFixed(3)} ms, `
      + `p95 ${m.p95.toFixed(3)} ms, max ${m.max.toFixed(3)} ms (sur ${m.images} images) ; croissance du tas : `
      + (m.tasOctetsParImage === null ? 'non mesurable' : `${m.tasOctetsParImage.toFixed(0)} octets/image`));
    for (const e of errors) allErrors.push(name + ' : ' + e);
    return m;
  } finally {
    await browser.close().catch(() => {});
  }
}
const mesure = await measure('mesure-150-haut', 'view=parc&n=150&qualite=haut');
await measure('mesure-150-nuit', 'view=parc&n=150&qualite=haut&nuit=1');
await measure('mesure-150-bas', 'view=parc&n=150&qualite=bas');
// (h) parc de 150 véhicules civils
const parc = await capture('parc-150', 'view=parc&n=150&pas=0.033', { frames: 30, timeout: 600000 });
await capture('parc-150-sol', 'view=parc&n=150&cam=sol&pas=0.033', { frames: 30, timeout: 600000 });
await capture('parc-150-nuit', 'view=parc&n=150&nuit=1&pas=0.033', { frames: 30, timeout: 600000 });
await capture('parc-150-bas', 'view=parc&n=150&qualite=bas&pas=0.033', { frames: 30, timeout: 600000, width: 844, height: 390 });

let ok = true;
if (parc) {
  console.log(`[vehicles] parc de 150 : ${parc.moduleCalls} appels de dessin pour les véhicules (scène : ${parc.calls}), ${parc.moduleTriangles} triangles, `
    + `${parc.near} détaillés / ${parc.far} lointains / ${parc.hidden} masqués, CPU médian ${parc.cpuMedian.toFixed(2)} ms/image (max ${parc.cpuMax.toFixed(2)})`);
  if (parc.moduleCalls > 60) { ok = false; console.error('[vehicles] trop d’appels de dessin : ' + parc.moduleCalls); }
  if (parc.near + parc.far < 60) { ok = false; console.error('[vehicles] trop peu de véhicules affichés'); }
}
if (mesure && mesure.mediane > 2) { ok = false; console.error('[vehicles] coût CPU trop élevé : ' + mesure.mediane.toFixed(2) + ' ms'); }
await finish({ browser: browserRef, server, errors: allErrors, ok, label: 'vehicles' });
