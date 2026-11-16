// Testeur indépendant — diagnostic : qui ralentit les images et fait enfler la mémoire après le premier clic ?
// Phase B : clic avec le moteur sonore neutralisé (engine.disabled) ; phase C : moteur sonore actif ; profil CPU dans chaque phase.
import { startServer, openPage, waitFor, log, J, install, rss } from './verif-lib.mjs';
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540, lock: true });
let dead = false;
const watch = setInterval(() => { const r = rss(); if (r && r.renderer > 3200 && !dead) { dead = true; log('MÉMOIRE > 3,2 Go : arrêt', J(r)); browser.close().finally(() => process.exit(3)); } }, 1500);
const counters = () => page.evaluate(() => { const c = window.__cnt; const S = window.__CRS.summary(); const d = window.__CRS.ctx.service('audio.debug'); const a = d ? d.stats() : null; const o = { raf: c.raf, longest: c.longest, lock: !!document.pointerLockElement, phase: S.phase, sim: +S.time.toFixed(1), frameMs: +S.stats.frameMs.toFixed(0), sys: S.systems.filter((x) => x.updateMs + x.frameMs > 4).map((x) => `${x.id}:${x.updateMs.toFixed(0)}/${x.frameMs.toFixed(0)}`), audio: a ? `${a.state} réels ${a.real} virtuels ${a.virtual} joués ${a.played}` : null, disabled: window.__CRS.ctx.audio.engine.disabled }; c.longest = 0; return o; });
const sample = async (label) => log(label.padEnd(26), 'rss', J(rss()), J(await counters().catch((e) => String(e).slice(0, 80))));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
const profile = async (label, ms) => {
  await cdp.send('Profiler.start');
  await page.waitForTimeout(ms);
  const { profile: p } = await cdp.send('Profiler.stop');
  const dt = p.timeDeltas || []; const self = new Map(); const byId = new Map(p.nodes.map((n) => [n.id, n]));
  let total = 0;
  (p.samples || []).forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anonyme)'} @ ${(n.callFrame.url || '').split('/').slice(-2).join('/').split('?')[0]}:${n.callFrame.lineNumber}`; const d = (dt[i] || 0) / 1000; self.set(k, (self.get(k) || 0) + d); total += d; });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${v.toFixed(0)} ms  ${k}`);
  log(`PROFIL ${label} (${total.toFixed(0)} ms échantillonnés)`); for (const t of top) log('    ' + t);
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await install(page);
  await page.evaluate(() => { const c = window.__cnt = { raf: 0, longest: 0 }; let last = performance.now(); const f = () => { const n = performance.now(); c.longest = Math.max(c.longest, Math.round(n - last)); last = n; c.raf++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await sample('A départ');
  await page.waitForTimeout(12000); await sample('A +12 s (son verrouillé)');
  // B : moteur sonore neutralisé, puis clic (capture de la souris)
  await page.evaluate(() => { window.__CRS.ctx.audio.engine.disabled = true; });
  await page.mouse.move(2, 2); await page.mouse.click(2, 2);
  await sample('B clic, son neutralisé');
  await page.waitForTimeout(12000); await sample('B +12 s');
  await profile('B (capture, son neutralisé)', 10000);
  await sample('B +22 s');
  // C : moteur sonore actif
  await page.evaluate(() => { window.__CRS.ctx.audio.engine.disabled = false; window.__CRS.ctx.service('audio.debug').unlock(); });
  await page.keyboard.press('KeyH');
  await sample('C son actif');
  await page.waitForTimeout(12000); await sample('C +12 s');
  await profile('C (capture, son actif)', 15000);
  await sample('C +27 s');
  await page.waitForTimeout(10000); await sample('C +37 s');
  // D : son actif, capture rendue SANS pause (on reprend si le jeu s'est mis en pause)
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const c = window.__CRS.ctx; if (c.session.phase === 'paused') c.session.resume(); });
  await sample('D capture rendue, jeu repris');
  await page.waitForTimeout(12000); await sample('D +12 s');
  await page.waitForTimeout(12000); await sample('D +24 s');
} catch (e) { console.error('EXCEPTION', String(e).slice(0, 300)); }
clearInterval(watch);
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 6)));
await browser.close().catch(() => {}); await server.close(); process.exit(0);
