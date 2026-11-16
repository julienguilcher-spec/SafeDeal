// Captures du banc d'essai du mobilier urbain, des vitrines et des barricades.
// Usage : node tests/e2e/props.mjs [filtre]        — ex. « planche », « devantures », « rue », « barricade », « masse », « mesure »
//         node tests/e2e/props.mjs libre "view=rue&nuit=1&cam=haut" [nom] [images]   — une vue à la demande
//         node tests/e2e/props.mjs tout            — jeu complet (toutes les planches, toutes les pages)
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const arg = process.argv[2] ?? '';
const all = arg === 'tout';
const filter = all ? '' : arg;
const server = await startServer();
const allErrors = [];
let browserRef = null;
const results = {};

async function capture(name, query, opts = {}) {
  if (filter && filter !== 'libre' && !name.includes(filter)) return null;
  // la machine d'essai est partagée : un navigateur peut être fermé de l'extérieur — on réessaie une fois
  for (let attempt = 1; ; attempt++) {
    try {
      return await captureOnce(name, query, opts);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (attempt >= 2) { allErrors.push(name + ' : ' + msg); return null; }
      console.warn(`[props] ${name} : nouvel essai après « ${msg.split('\n')[0]} »`);
    }
  }
}

async function captureOnce(name, query, opts) {
  const t0 = Date.now();
  const { browser, page, errors } = await openPage(server.url + 'harness/props.html?' + query, { width: opts.width ?? 1600, height: opts.height ?? 900 });
  browserRef = browser;
  try {
    await waitFor(page, `window.__ready === true && window.__frames >= ${opts.frames ?? 8}`, opts.timeout ?? 420000);
    // on fige le rendu : la capture n'a plus à disputer le processeur au WebGL logiciel
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(200);
    const file = await shot(page, 'props-' + name);
    const info = await page.evaluate(() => window.__info);
    console.log(`[props] ${name} : ${file} (${Date.now() - t0} ms) ${JSON.stringify(info)}`);
    for (const e of errors) allErrors.push(name + ' : ' + e);
    results[name] = info;
    return info;
  } finally {
    await browser.close().catch(() => {});
  }
}

if (filter === 'libre') {
  const q = process.argv[3] ?? 'view=planche&page=1';
  await capture('libre-' + (process.argv[4] ?? q.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)), q + '&pas=0.033', { frames: Number(process.argv[5] ?? 8) });
  await finish({ browser: browserRef, server, errors: allErrors, label: 'props' });
}

// (a) planches : tous les objets dans tous leurs états, avec la silhouette de 1,80 m (deux demi-planches par page)
for (let p = 1; p <= 5; p++) {
  await capture(`planche-${p}a`, `view=planche&page=${p}&moitie=1&pas=0.033`);
  await capture(`planche-${p}b`, `view=planche&page=${p}&moitie=2&pas=0.033`);
}
await capture('planche-6', 'view=planche&page=6&pas=0.033');
await capture('planche-5a-nuit', 'view=planche&page=5&moitie=1&nuit=1&pas=0.033');
if (all) for (let p = 1; p <= 6; p++) await capture(`planche-${p}-entiere`, `view=planche&page=${p}&pas=0.033`);
// (b) devantures dans tous les états, de jour et de nuit
for (let p = 1; p <= 3; p++) await capture(`devantures-${p}`, `view=devantures&page=${p}&pas=0.033`);
for (let p = 1; p <= (all ? 3 : 2); p++) await capture(`devantures-${p}-nuit`, `view=devantures&page=${p}&nuit=1&pas=0.033`);
// (c) rue commerçante d'essai
await capture('rue-trottoir', 'view=rue&pas=0.033', { frames: 10 });
await capture('rue-haut', 'view=rue&cam=haut&pas=0.033', { frames: 10 });
await capture('rue-emeute', 'view=rue&cam=emeute&pas=0.033', { frames: 10 });
await capture('rue-nuit', 'view=rue&nuit=1&pas=0.033', { frames: 10 });
// sans le service 'render.lights' : halos et taches de lumière à coût fixe seulement
await capture('rue-haut-nuit-sans-lumieres', 'view=rue&cam=haut&nuit=1&lumieres=0&pas=0.033', { frames: 10 });
await capture('rue-carrefour-nuit', 'view=rue&cam=carrefour&nuit=1&pas=0.033', { frames: 10 });
// qualité basse (téléphone) : matériau diffus, pas d'ombre, atlas de 1024
await capture('rue-bas', 'view=rue&qualite=bas&pas=0.033', { frames: 10, width: 844, height: 390 });
// sans le service 'props.ext' de la simulation : états déduits du seul contrat
if (all) await capture('devantures-2-sans-ext', 'view=devantures&page=2&ext=0&pas=0.033');
// (d) barricade avant, pendant et après le feu
await capture('barricade', 'view=barricade&pas=0.033', { frames: 10 });
await capture('barricade-avant', 'view=barricade&cam=avant&pas=0.033', { frames: 10 });
await capture('barricade-feu-nuit', 'view=barricade&cam=feu&nuit=1&pas=0.033', { frames: 10 });
await capture('barricade-apres', 'view=barricade&cam=apres&pas=0.033', { frames: 10 });
// (e) vue d'ensemble de 3 000 objets
const masse = await capture('masse-3000', 'view=masse&n=3000&pas=0.033', { frames: 12, timeout: 600000 });
await capture('masse-3000-nuit', 'view=masse&n=3000&nuit=1&pas=0.033', { frames: 12, timeout: 600000 });
await capture('masse-3000-sol', 'view=masse&n=3000&cam=sol&pas=0.033', { frames: 12, timeout: 600000 });
if (all) await capture('masse-3000-bas', 'view=masse&n=3000&qualite=bas&pas=0.033', { frames: 12, timeout: 600000, width: 844, height: 390 });
if (all) await capture('atlas', 'view=atlas', { frames: 1, width: 1200, height: 1200 });
// (g) contrôle d'intégration : vrai rendu de base, vrai monde d'essai, vraie simulation du décor. Les erreurs de
// ces modules (écrits par d'autres) sont signalées sans faire échouer ce test.
{
  const before = allErrors.length;
  try {
    const jeu = await capture('jeu-nuit', 'view=jeu&boutique=40&nuit=1&pas=0.033', { frames: 14, timeout: 600000 });
    if (jeu) console.log(`[props] jeu intégré : ${jeu.props} objets et ${jeu.shops} vitrines suivis (simulation : ${jeu.simProps} et ${jeu.simShops}), `
      + `${jeu.drawCalls} appels de dessin (+${jeu.shadowCalls} ombre), ${jeu.lights} vraies lumières`);
  } catch (err) {
    console.warn('[props] contrôle d’intégration impossible : ' + (err && err.message ? err.message : err));
  }
  const foreign = allErrors.splice(before);
  for (const e of foreign) console.warn('[props] (intégration, non bloquant) ' + e);
}

// (f) mesures : coût CPU du module seul (sans rendu), appels de dessin, triangles
async function measure(name, query) {
  if (filter && !name.includes(filter)) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      return await measureOnce(name, query);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (attempt >= 2) { allErrors.push(name + ' : ' + msg); return null; }
      console.warn(`[props] ${name} : nouvel essai après « ${msg.split('\n')[0]} »`);
    }
  }
}

async function measureOnce(name, query) {
  const { browser, page, errors } = await openPage(server.url + 'harness/props.html?' + query, { width: 1280, height: 720 });
  browserRef = browser;
  try {
    await waitFor(page, 'window.__mesure !== undefined', 600000);
    const m = await page.evaluate(() => window.__mesure);
    console.log(`[props] ${name} : ${m.objets} objets, ${m.vitrines} vitrines, ${m.morceaux} morceaux, ${m.halos} halos, ${m.modeles} modèles — `
      + `${m.appelsModule} appels de dessin (+${m.appelsOmbre} en passe d'ombre ; scène : ${m.appelsScene}), ${m.trianglesModule} triangles (scène : ${m.trianglesScene}) — `
      + `CPU par image au repos : moyenne ${m.moyenne.toFixed(4)} ms, médiane des lots ${m.mediane.toFixed(4)} ms, pire lot ${m.max.toFixed(4)} ms (${m.images} images) ; `
      + `rafale de changements (6 par image) : moyenne ${m.rafaleMoyenne.toFixed(3)} ms, max ${m.rafaleMax.toFixed(1)} ms ; `
      + `caméra en mouvement : moyenne ${m.deplacementMoyenne.toFixed(3)} ms, p95 ${m.deplacementP95.toFixed(1)} ms, max ${m.deplacementMax.toFixed(1)} ms ; `
      + `${m.reconstructions} reconstructions, ${m.reecritures} réécritures, dernière reconstruction ${m.derniereReconstructionMs.toFixed(2)} ms`);
    for (const e of errors) allErrors.push(name + ' : ' + e);
    return m;
  } finally {
    await browser.close().catch(() => {});
  }
}
const mesure = await measure('mesure-3000-haut', 'view=masse&n=3000&qualite=haut&mesure=300');
await measure('mesure-3000-nuit', 'view=masse&n=3000&qualite=haut&nuit=1&mesure=300');
const mesureBas = await measure('mesure-3000-bas', 'view=masse&n=3000&qualite=bas&mesure=300');
await measure('mesure-3000-sol', 'view=masse&n=3000&qualite=haut&cam=sol&mesure=300');

let ok = true;
const check = (cond, msg) => { if (!cond) { ok = false; console.error('[props] ' + msg); } };
if (masse) {
  console.log(`[props] 3 000 objets : ${masse.moduleCalls} appels de dessin du module (+${masse.shadowCalls} ombre ; scène : ${masse.calls}), `
    + `${masse.moduleTriangles} triangles, CPU médian ${masse.cpuMedian.toFixed(2)} ms/image`);
  check(masse.props >= 2900, 'trop peu d’objets suivis : ' + masse.props);
  check(masse.moduleCalls + masse.shadowCalls <= 70, 'trop d’appels de dessin : ' + (masse.moduleCalls + masse.shadowCalls));
  check(masse.moduleCalls >= 3, 'rien n’est dessiné');
}
if (mesure) {
  check(mesure.appelsModule + mesure.appelsOmbre <= 70, 'trop d’appels de dessin (mesure) : ' + (mesure.appelsModule + mesure.appelsOmbre));
  check(mesure.moyenne < 0.5, 'coût CPU au repos trop élevé : ' + mesure.moyenne.toFixed(3) + ' ms');
  check(mesure.rafaleMoyenne < 3, 'coût CPU d’une rafale de changements trop élevé : ' + mesure.rafaleMoyenne.toFixed(2) + ' ms');
}
if (mesureBas) check(mesureBas.appelsModule <= 70, 'trop d’appels de dessin en qualité basse : ' + mesureBas.appelsModule);
await finish({ browser: browserRef, server, errors: allErrors, ok, label: 'props' });
