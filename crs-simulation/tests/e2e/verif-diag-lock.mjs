// Testeur indépendant — diagnostic : sous capture de la souris, que reçoit la page et la mémoire enfle-t-elle ?
import { startServer, openPage, waitFor, frames, log, J, install, rss, pageMem } from './verif-lib.mjs';
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540, lock: true });
let dead = false;
const watch = setInterval(() => { const r = rss(); if (r && r.renderer > 3000 && !dead) { dead = true; log('MÉMOIRE > 3 Go : arrêt', J(r)); browser.close().finally(() => process.exit(3)); } }, 1500);
const counters = () => page.evaluate(() => { const c = window.__cnt; const S = window.__CRS.summary(); const o = { move: c.move, lockchange: c.lockchange, lockerror: c.lockerror, raf: c.raf, lock: !!document.pointerLockElement, t: Math.round(performance.now() / 1000), sim: +S.time.toFixed(1), stats: { frameMs: +S.stats.frameMs.toFixed(0), simMs: +S.stats.simMs.toFixed(1), presentMs: +S.stats.presentMs.toFixed(0) }, sys: S.systems.filter((x) => x.updateMs + x.frameMs > 1).map((x) => `${x.id}:${x.updateMs.toFixed(1)}/${x.frameMs.toFixed(1)}`), dom: document.getElementsByTagName('*').length, longest: c.longest, audio: (() => { const d = window.__CRS.ctx.service('audio.debug'); const a = d ? d.stats() : null; return a ? `${a.state} réels ${a.real} joués ${a.played}` : null; })() }; c.longest = 0; return o; });
const sample = async (label) => log(label.padEnd(30), 'rss', J(rss()), 'évts', J(await counters().catch((e) => String(e).slice(0, 80))));
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await install(page);
  await page.evaluate(() => {
    const c = window.__cnt = { move: 0, down: 0, up: 0, lockchange: 0, lockerror: 0, raf: 0, sumAbsX: 0, first: [] };
    window.addEventListener('mousemove', (e) => { c.move++; c.sumAbsX += Math.abs(e.movementX); if (c.first.length < 12) c.first.push([e.movementX, e.movementY]); }, true);
    window.addEventListener('mousedown', () => c.down++, true);
    window.addEventListener('mouseup', () => c.up++, true);
    document.addEventListener('pointerlockchange', () => c.lockchange++);
    document.addEventListener('pointerlockerror', () => c.lockerror++);
    let last = performance.now(); c.longest = 0; const f = () => { const n = performance.now(); c.longest = Math.max(c.longest, Math.round(n - last)); last = n; c.raf++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
  await sample('avant le clic');
  await page.waitForTimeout(15000);
  await sample('15 s sans capture');
  await page.mouse.move(2, 2); await page.mouse.click(2, 2);
  await sample('juste après le clic');
  for (let k = 1; k <= 5; k++) { await page.waitForTimeout(10000); await sample(`capture +${k * 10}s`); }
  await page.evaluate(() => document.exitPointerLock());
  await sample('capture rendue');
  for (let k = 1; k <= 4; k++) { await page.waitForTimeout(10000); await sample(`sans capture +${k * 10}s`); }
} catch (e) { console.error('EXCEPTION', String(e).slice(0, 300)); }
clearInterval(watch);
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 6)));
await browser.close().catch(() => {}); await server.close(); process.exit(0);
