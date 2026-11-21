// Captures et contrôles du banc d'essai des commissariats (harness/commissariats.html).
// Usage : node tests/e2e/commissariats.mjs [filtre]   — ex. « 9e », « nuit », « tel » ; « jeu » : vraie carte seule ;
//         « tout » : banc d'essai et vraie carte
// Contrôles :
//   - de jour et de nuit, la lanterne est plus lumineuse la nuit (un site de chaque sorte d'enseigne) ;
//   - l'enseigne n'est pas une tache uniforme (lettrage visible) ;
//   - au téléphone (390 × 844, qualité « bas »), appels de dessin ≤ base + 2 par site proche + 1 (lointain).
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const filter = process.argv[2] ?? '';
const server = await startServer();
const errors = [];
const failures = [];
let browserRef = null;

function check(ok, msg) {
  if (ok) console.log(`[commissariats] OK   ${msg}`);
  else { console.log(`[commissariats] ÉCHEC ${msg}`); failures.push(msg); }
}

async function open(name, query, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const t0 = Date.now();
      const { browser, page, errors: pageErrors } = await openPage(server.url + 'harness/commissariats.html?' + query, {
        width: opts.width ?? 1280, height: opts.height ?? 720, mobile: !!opts.mobile,
      });
      browserRef = browser;
      try {
        await waitFor(page, `window.__ready === true && window.__frames >= ${opts.frames ?? 6}`, 300000);
        await page.evaluate(() => { window.__pause = true; });
        await page.waitForTimeout(150);
        const file = await shot(page, 'commissariats-' + name);
        const out = await opts.probe?.(page);
        const info = await page.evaluate(() => window.__info);
        console.log(`[commissariats] ${name} : ${file} (${Date.now() - t0} ms) ${JSON.stringify(info)}`);
        for (const e of pageErrors) errors.push(name + ' : ' + e);
        return out;
      } finally {
        await browser.close().catch(() => {});
        browserRef = null;
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (attempt >= 2) { errors.push(name + ' : ' + msg); return null; }
      console.warn(`[commissariats] ${name} : nouvel essai après « ${msg.split('\n')[0]} »`);
    }
  }
}

const want = (name) => !filter || name.includes(filter);
const sample = (what, half) => (page) => page.evaluate(([w, h]) => window.__sample(w, h), [what, half]);

for (const site of ['9e', 'celestins', 'cite']) {
  if (!want(site) && !want('nuit') && !want('jour')) continue;
  const probe = async (page) => ({
    lantern: await sample('lantern', 5)(page),
    sign: await sample('sign', 14)(page),
  });
  const day = await open(`${site}-jour`, `site=${site}&cam=porte&shot=1`, { probe });
  const nightRes = await open(`${site}-nuit`, `site=${site}&cam=porte&nuit=1&shot=1`, { probe });
  if (day && nightRes && day.lantern && nightRes.lantern) {
    console.log(`[commissariats] ${site} lanterne : jour ${JSON.stringify(day.lantern)} — nuit ${JSON.stringify(nightRes.lantern)}`);
    check(nightRes.lantern.lum > day.lantern.lum, `${site} : lanterne plus lumineuse la nuit (${nightRes.lantern.lum.toFixed(1)} > ${day.lantern.lum.toFixed(1)})`);
    check(nightRes.lantern.b > nightRes.lantern.r + 20, `${site} : lanterne bleue la nuit (b ${nightRes.lantern.b.toFixed(0)}, r ${nightRes.lantern.r.toFixed(0)})`);
  } else check(false, `${site} : mesure de la lanterne impossible`);
  if (site !== 'cite') {
    check(!!(day && day.sign && day.sign.std > 18), `${site} : enseigne lettrée, non uniforme (écart type ${day && day.sign ? day.sign.std.toFixed(1) : '—'})`);
  } else {
    check(!!day && day.sign === null, 'préfecture : pas d\'enseigne');
  }
}

if (want('places')) {
  await open('9e-places', 'site=9e&cam=places&shot=1');
  await open('cite-places', 'site=cite&cam=places&shot=1');
}
if (want('loin')) {
  // à 480 m : la façade proche est masquée, la lanterne lointaine reste une petite lumière bleue
  const far = await open('9e-loin-nuit', 'site=9e&cam=loin&nuit=1&shot=1', { probe: sample('lantern', 1) });
  check(!!far && far.b > 60 && far.b > far.r + 20, `de loin, la nuit : petite lumière bleue (${far ? `b ${far.b.toFixed(0)}, r ${far.r.toFixed(0)}` : '—'})`);
}
// contrôle d'intégration sur la vraie carte (lent : la ville est construite autour du joueur)
if (filter === 'jeu' || filter === 'tout') {
  for (const [site, cam, nuit] of [['9e', 'porte', 0], ['9e', 'porte', 1], ['9e', 'places', 0], ['cite', 'porte', 0], ['celestins', 'porte', 0], ['1er', 'porte', 0], ['3e', 'porte', 0], ['7e', 'porte', 0], ['8e', 'porte', 0]]) {
    const r = await open(`jeu-${site}-${cam}${nuit ? '-nuit' : ''}`, `view=jeu&site=${site}&cam=${cam}&nuit=${nuit}&shot=1`, {
      frames: 30, probe: (page) => page.evaluate(() => window.__info),
    });
    check(!!r && r.visible >= 1, `vraie carte, ${site} (${cam}) : habillage proche affiché`);
  }
}
if (want('atlas')) await open('atlas', 'view=atlas&shot=1', { frames: 1 });

if (want('tel')) {
  const m = await open('tel-9e', 'site=9e&cam=porte&qualite=bas&shot=1', {
    width: 390, height: 844, mobile: true,
    probe: (page) => page.evaluate(() => window.__measure()),
  });
  if (m) {
    const limit = m.base + 2 * m.near + (m.far > 0 ? 1 : 0);
    check(m.total <= limit, `téléphone : ${m.total} appels de dessin ≤ ${limit} (base ${m.base}, ${m.near} site(s) proche(s), lointain ${m.far > 0 ? 'oui' : 'non'})`);
    check(m.near >= 1, 'téléphone : le site proche est affiché');
  } else check(false, 'téléphone : mesure impossible');
}

for (const f of failures) errors.push('contrôle : ' + f);
await finish({ browser: browserRef, server, errors, ok: failures.length === 0, label: 'commissariats' });
