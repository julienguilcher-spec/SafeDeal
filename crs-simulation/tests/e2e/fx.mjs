// Captures du banc d'essai des effets visuels : rue remplie de gaz sous un vent latéral (jour, nuit, vue de
// dessus, qualité « bas » sur téléphone), poubelles et véhicule en feu (jour et nuit), salve de trente grenades,
// tirs de mortier et fusée rouge, jet du canon à eau sur un feu, barricade embrasée, catalogue des FxId.
// Usage : node tests/e2e/fx.mjs [filtre]   — ex. « gaz », « feu », « salve », « nuit », ou rien pour tout.
// Chaque scène est simulée par pas fixes SANS dessin jusqu'à l'instant voulu (le WebGL logiciel est lent), puis
// dessinée ; les mesures (appels de dessin, triangles, temps CPU du module) sont lues dans la page.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const filter = process.argv[2] ?? '';
const server = await startServer();
const allErrors = [];
const results = {};
let browserRef = null;
let ok = true;

function check(name, cond, message) {
  if (cond) return;
  ok = false;
  console.error(`[fx] ${name} : ÉCHEC — ${message}`);
}

/** Ouvre une scène, l'avance jusqu'à `t`, capture ; `then` permet d'enchaîner d'autres instants dans la même page. */
async function capture(name, query, opts = {}, then = null) {
  if (filter && !name.includes(filter)) return null;
  const t0 = Date.now();
  const { browser, page, errors } = await openPage(server.url + 'harness/fx.html?' + query + '&fige=1&aide=0', {
    width: opts.width ?? 1280, height: opts.height ?? 720, mobile: opts.mobile ?? false,
  });
  browserRef = browser;
  try {
    await waitFor(page, 'window.__ready === true', opts.timeout ?? 400000);
    await page.waitForTimeout(200);
    const file = await shot(page, 'fx-' + name);
    const info = await page.evaluate(() => window.__fx.info());
    const measure = await page.evaluate(() => window.__fx.measure());
    console.log(`[fx] ${name} : ${file} (${Date.now() - t0} ms)\n      ${JSON.stringify(info)}\n      ${JSON.stringify(measure)}`);
    results[name] = { info, measure };
    check(name, measure.appelsModule <= 14, `${measure.appelsModule} appels de dessin pour le module (budget : 14)`);
    check(name, info.evenementsPerdus === 0, `${info.evenementsPerdus} événements d'effet perdus`);
    if (then) await then(page, name);
    for (const e of errors) allErrors.push(name + ' : ' + e);
    return info;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Avance la simulation dans la page puis capture un second instant. */
async function later(page, name, seconds, suffix) {
  const info = await page.evaluate((s) => { const i = window.__fx.advance(s); window.__fx.draw(); return i; }, seconds);
  await page.waitForTimeout(150);
  const file = await shot(page, 'fx-' + name + '-' + suffix);
  console.log(`[fx] ${name}-${suffix} : ${file}\n      ${JSON.stringify(info)}`);
  results[name + '-' + suffix] = { info };
  return info;
}

// (a) rue remplie de gaz sous un vent latéral
await capture('gaz-jour', 'scene=gaz&t=38');
await capture('gaz-rue', 'scene=gaz&t=38&cam=-13,1.75,1.6,10,2.0,0');
// vue en travers de la rue : le vent souffle de gauche à droite, les volutes s'étirent
await capture('gaz-travers', 'scene=gaz&t=38&cam=14,2.2,24,14,2.6,0');
await capture('gaz-nuit', 'scene=gaz&nuit=1&t=38');
await capture('gaz-dessus', 'scene=dessus&t=38');
await capture('gaz-bas-telephone', 'scene=gaz&qualite=bas&t=38', { width: 844, height: 390, mobile: true });
// (b) poubelles, conteneur et véhicule en feu
await capture('feu-jour', 'scene=feu&t=14');
await capture('feu-nuit', 'scene=feu&nuit=1&t=14');
// (c) salve de trente grenades : grenades en vol et premières ouvertures, puis la rue noyée
await capture('salve', 'scene=salve&t=3.6', {}, async (page, name) => {
  await page.evaluate(() => window.__fx.resetCpu());
  const i = await later(page, name, 4.4, 'palets');
  check(name, i.particulesRefusees >= 0, 'mesure manquante');
  await later(page, name, 18, 'nuage');
});
await capture('salve-bas', 'scene=salve&qualite=bas&t=8');
// (d) mortiers d'artifice à tir tendu et fusée rouge de sommation, de nuit
await capture('mortier', 'scene=mortier&nuit=1&t=1.42', {}, async (page, name) => {
  await later(page, name, 1.0, 'bouquets');
  // la fusée rouge est suspendue à une cinquantaine de mètres : on recule et on lève la caméra
  await page.evaluate(() => window.__fx.camera(6, 1.8, 62, -8, 27, -6));
  await later(page, name, 1.6, 'fusee');
});
// (e) jet du canon à eau sur un feu
await capture('jet', 'scene=jet&t=5.5', {}, async (page, name) => { await later(page, name, 9, 'eteint'); });
// de nuit, une fois le feu noyé : carcasses qui rougeoient, filets de fumée
await capture('braises-nuit', 'scene=jet&nuit=1&t=13.6&cam=3,2.2,9,9.6,0.8,-1.1');
// (f) barricade embrasée
await capture('barricade-nuit', 'scene=barricade&nuit=1&t=18.6');
await capture('barricade-jour', 'scene=barricade&t=18.6');
// (g) catalogue des FxId : pendant l'explosion, puis les décalques qui restent
await capture('divers', 'scene=divers&t=0.7', {}, async (page, name) => { await later(page, name, 5, 'apres'); });

// (h) contrôle d'intégration : vrais modules de simulation des dangers et des objets
await capture('reel', 'scene=reel&t=5.2', {}, async (page, name) => {
  const i = await later(page, name, 20, 'nuage');
  check(name, i.cellules > 20, `le vrai champ de gaz n'a donné que ${i.cellules} cellules`);
  check(name, i.bouffees > 5, `aucune bouffée dessinée à partir du vrai champ (${i.bouffees})`);
});

// (i) coût CPU pendant la salve : trois exécutions de la même scène (déterministe), minimum image par image —
// la machine de test étant très chargée, c'est le seul moyen d'écarter les pauses de l'ordonnanceur
async function perf(name, query) {
  if (filter && !name.includes(filter)) return;
  const runs = [];
  for (let r = 0; r < 3; r++) {
    const { browser, page, errors } = await openPage(server.url + 'harness/fx.html?' + query + '&fige=1&aide=0', { width: 640, height: 360 });
    browserRef = browser;
    try {
      await waitFor(page, 'window.__ready === true', 400000);
      runs.push(await page.evaluate(() => window.__fx.series()));
      for (const e of errors) allErrors.push(name + ' : ' + e);
    } finally {
      await browser.close().catch(() => {});
    }
  }
  const n = Math.min(...runs.map((a) => a.length));
  const best = [];
  for (let i = 0; i < n; i++) best.push(Math.min(runs[0][i], runs[1][i], runs[2][i]));
  const sorted = [...best].sort((a, b) => a - b);
  const avg = best.reduce((a, b) => a + b, 0) / n;
  const raw = runs.map((a) => Math.max(...a).toFixed(1)).join(' / ');
  const res = {
    images: n, moy: +avg.toFixed(3), med: sorted[n >> 1], p95: sorted[Math.floor(n * 0.95)], p99: sorted[Math.floor(n * 0.99)], max: sorted[n - 1],
    plusDe4ms: best.filter((v) => v > 4).length, maxBruts: raw,
  };
  console.log(`[fx] ${name} (minimum de 3 exécutions, ms par image) : ${JSON.stringify(res)}`);
  results[name] = { info: { trianglesModule: 0, quads: 0, cpuMoy: res.moy, cpuP95: res.p95, cpuMax: res.max } };
  check(name, res.p99 < 8, `99e centile à ${res.p99} ms pendant la salve`);
}
await perf('perf-salve-haut', 'scene=salve&t=14');
await perf('perf-salve-bas', 'scene=salve&qualite=bas&t=14');

console.log('[fx] résumé : ' + JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
  appels: v.measure?.appelsModule, triangles: v.info.trianglesModule, quads: v.info.quads, cpuMoy: v.info.cpuMoy, cpuP95: v.info.cpuP95, cpuMax: v.info.cpuMax,
}]))));
await finish({ browser: browserRef, server, errors: allErrors, ok, label: 'fx' });
