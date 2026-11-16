// Testeur indépendant — diagnostic mémoire : le premier clic (déverrouillage du son, capture de la souris) fait-il enfler la page ?
import { startServer, openPage, waitFor, frames, log, J, install, rss, pageMem } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=11${args.extra ?? ''}`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540, lock: true });
const LIMIT = Number(args.limit ?? 3000);
let dead = false;
const watch = setInterval(() => { const r = rss(); if (r && r.renderer > LIMIT && !dead) { dead = true; log(`MÉMOIRE du moteur de page > ${LIMIT} Mo : arrêt`, J(r)); browser.close().finally(() => process.exit(3)); } }, 1500);
const audio = () => page.evaluate(() => { const d = window.__CRS.ctx.service('audio.debug'); if (!d) return null; const s = d.stats(); return { ...s, voices: d.voices().length, speech: d.speech() }; }).catch((e) => 'ERR ' + e.message);
const sample = async (label) => log(label.padEnd(34), 'rss', J(rss()), 'page', J(await pageMem(page).catch(() => null)), 'audio', J(await audio()));
const wait = async (label, seconds, every = 10) => { for (let t = 0; t < seconds; t += every) { await page.waitForTimeout(every * 1000); await sample(`${label} +${t + every}s`); } };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await install(page);
  await frames(page, 3);
  await sample('départ (aucun geste)');
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__V.run(40, {}));
  await sample('après 40 s simulées, sans clic');
  await wait('temps réel sans clic', 20, 10);
  if (args.mode === 'unlock') {
    // déverrouillage du son SANS capture de la souris
    log('unlock() =', await page.evaluate(() => window.__CRS.ctx.service('audio.debug').unlock()));
  } else if (args.mode === 'lock') {
    log('capture seule =', await page.evaluate(async () => { try { await document.querySelector('#game canvas, canvas').requestPointerLock(); } catch (e) { return String(e); } return !!document.pointerLockElement; }));
  } else {
    await page.mouse.move(2, 2); await page.mouse.click(2, 2);
  }
  await frames(page, 2);
  await sample('juste après le geste');
  log('souris capturée :', await page.evaluate(() => window.__CRS.ctx.input.pointerLocked), 'device', await page.evaluate(() => window.__CRS.ctx.input.device));
  await wait('temps réel après geste', Number(args.real ?? 60), 10);
  await page.evaluate(() => window.__V.run(40, {}));
  await sample('après 40 s simulées, avec geste');
  await wait('temps réel ensuite', 30, 10);
} catch (e) { console.error('EXCEPTION', String(e).slice(0, 300)); }
clearInterval(watch);
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 6)));
await browser.close().catch(() => {}); await server.close(); process.exit(0);
