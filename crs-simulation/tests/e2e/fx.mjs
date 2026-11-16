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
  await later(page, name, 1.6, 'fusee');
});
// (e) jet du canon à eau sur un feu
await capture('jet', 'scene=jet&t=5.5', {}, async (page, name) => { await later(page, name, 9, 'eteint'); });
// (f) barricade embrasée
await capture('barricade-nuit', 'scene=barricade&nuit=1&t=18.6');
await capture('barricade-jour', 'scene=barricade&t=18.6');
// (g) catalogue des FxId : pendant l'explosion, puis les décalques qui restent
await capture('divers', 'scene=divers&t=0.7', {}, async (page, name) => { await later(page, name, 5, 'apres'); });

console.log('[fx] résumé : ' + JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
  appels: v.measure?.appelsModule, triangles: v.info.trianglesModule, quads: v.info.quads, cpuMoy: v.info.cpuMoy, cpuP95: v.info.cpuP95, cpuMax: v.info.cpuMax,
}]))));
await finish({ browser: browserRef, server, errors: allErrors, ok, label: 'fx' });
