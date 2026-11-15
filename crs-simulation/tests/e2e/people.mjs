// Captures du banc d'essai des personnages (tenues, poses, marche, foule de 1 500, première personne).
// Usage : node tests/e2e/people.mjs [filtre]   — ex. « tenues », « poses », « foule », « fps ».
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const filter = process.argv[2] ?? '';
const server = await startServer();
const allErrors = [];
let browserRef = null;

async function capture(name, query, opts = {}) {
  if (filter && !name.includes(filter)) return null;
  const t0 = Date.now();
  const { browser, page, errors } = await openPage(server.url + 'harness/people.html?' + query, { width: opts.width ?? 1600, height: opts.height ?? 900 });
  browserRef = browser;
  try {
    await waitFor(page, `window.__frames >= ${opts.frames ?? 8}`, opts.timeout ?? 240000);
    if (opts.before) await opts.before(page);
    const file = await shot(page, 'people-' + name);
    const info = await page.evaluate(() => window.__info);
    console.log(`[people] ${name} : ${file} (${Date.now() - t0} ms)`, JSON.stringify(info));
    for (const e of errors) allErrors.push(name + ' : ' + e);
    return info;
  } finally {
    await browser.close().catch(() => {});
  }
}

// vue de détail à la demande : node tests/e2e/people.mjs detail "anims=throw,strike&t=0.25"
if (filter === 'detail') {
  const q = process.argv[3] ?? 'anims=none';
  const name = 'detail-' + (process.argv[4] ?? q.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60));
  await capture(name, 'view=detail&pas=0.033&' + q, { frames: 30 });
  await finish({ browser: browserRef, server, errors: allErrors, label: 'people' });
}
// (a) tenues, de face et de dos
await capture('tenues-face-1', 'view=tenues&jeu=1&pas=0.033');
await capture('tenues-dos-1', 'view=tenues&jeu=1&dos=1&pas=0.033');
await capture('tenues-face-2', 'view=tenues&jeu=2&pas=0.033');
await capture('tenues-dos-2', 'view=tenues&jeu=2&dos=1&pas=0.033');
for (const de of [0, 4, 8, 12, 16, 18]) {
  await capture(`tenues-pres-${de}`, `view=tenues&pres=1&de=${de}&pas=0.033`);
  await capture(`tenues-pres-dos-${de}`, `view=tenues&pres=1&dos=1&de=${de}&pas=0.033`);
}
// (b) poses et animations (temps figé à plusieurs instants)
for (let page = 1; page <= 4; page++) {
  await capture(`poses-${page}-t025`, `view=poses&page=${page}&t=0.25&pas=0.033`, { frames: 30 });
  await capture(`poses-${page}-t045`, `view=poses&page=${page}&t=0.45&pas=0.033`, { frames: 30 });
}
await capture('marche', 'view=marche&pas=0.033', { frames: 45 });
await capture('marche-2', 'view=marche&pas=0.033', { frames: 52 });
// (c) foule de 1 500 personnes
const crowd = await capture('foule-1500', 'view=foule&n=1500&pas=0.033', { frames: 40, timeout: 600000 });
await capture('foule-1500-sol', 'view=foule&n=1500&cam=sol&pas=0.033', { frames: 30, timeout: 600000 });
await capture('foule-300-bas', 'view=foule&n=300&qualite=bas&pas=0.033', { frames: 30, timeout: 600000, width: 844, height: 390 });
// (d) première personne
const FP = [
  ['baton', 'none', 0, 0], ['baton', 'strike', 0.16, 0], ['baton', 'strike', 0.27, 0], ['bouclier', 'shield_carry', 0, 0],
  ['bouclier', 'block', 0, 1], ['lbd40', 'none', 0, 0], ['lbd40', 'aim_long', 0, 1], ['lanceur_cougar', 'aim_long', 0, 1],
  ['grenade', 'none', 0, 0], ['grenade', 'throw', 0.28, 0], ['grenade', 'throw', 0.42, 0], ['gazeuse', 'spray', 0, 0],
  ['megaphone', 'megaphone', 0, 0], ['pistolet', 'aim_pistol', 0, 1], ['telephone', 'film', 0, 0], ['aucun', 'hands_up', 0, 0],
  ['radio', 'radio', 0, 0], ['extincteur', 'extinguish', 0, 0],
];
for (const [objet, anim, t, alt] of FP) {
  await capture(`fps-${objet}-${anim}-${String(t).replace('.', '')}`, `view=fps&objet=${objet}&anim=${anim}&t=${t}&alt=${alt}&pas=0.033`, { frames: 25, width: 1280, height: 720 });
}

let ok = true;
if (crowd) {
  // mesures : coût CPU par image du module (objectif < 4 ms) et appels de dessin de toute la scène (objectif < 40)
  console.log(`[people] foule 1500 : CPU ${crowd.cpuMsAvg.toFixed(2)} ms/image, ${crowd.calls} appels de dessin, ${crowd.triangles} triangles`);
  if (crowd.calls >= 40) { ok = false; console.error('[people] trop d’appels de dessin : ' + crowd.calls); }
  if (crowd.near + crowd.mid + crowd.far < 600) { ok = false; console.error('[people] trop peu de personnes affichées'); }
}
await finish({ browser: browserRef, server, errors: allErrors, ok, label: 'people' });
