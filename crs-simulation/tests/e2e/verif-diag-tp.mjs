// Testeur indépendant — diagnostic : après un déplacement instantané en (x, z), quelle étape s'emballe ?
import { startServer, openPage, waitFor, frames, log, J, install, rss, pageMem } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const X = Number(args.x ?? 39.9), Z = Number(args.z ?? -19.9);
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540 });
page.on('console', (m) => { if (m.type() !== 'error') log('   [page]', m.text().slice(0, 300)); });
const watch = setInterval(() => { const r = rss(); if (r && r.renderer > 2500) { log('MÉMOIRE > 2,5 Go : arrêt', J(r)); process.exit(3); } }, 2000);
const stage = async (name, fn, arg, ms = 60000) => {
  const t = Date.now();
  let res;
  try { res = await Promise.race([page.evaluate(fn, arg), new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), ms))]); } catch (e) { res = 'ERREUR ' + e.message; }
  log(`${name} : ${Date.now() - t} ms`, J(res), 'rss', J(rss()));
  return res;
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await install(page);
  await frames(page, 3);
  log('départ', J(await pageMem(page)), J(rss()));
  await stage('état du point', ([x, z]) => { const c = window.__CRS.ctx; return { free: c.world.isFree(x, z, 0.28), surf: c.world.surfaceAt(x, z), bh: c.world.buildingHeightAt(x, z), loaded: c.world.isLoaded(x, z), props: (() => { const out = []; c.props.queryRadius(x, z, 2, out); return out.map((p) => p.kind); })(), veh: (() => { const out = []; c.vehicles.queryRadius(x, z, 4, out); return out.map((v) => v.kind); })(), ppl: (() => { const out = []; c.people.queryRadius(x, z, 2, out); return out.map((v) => v.kind); })() }; }, [X, Z]);
  await stage('teleport', ([x, z]) => window.__CRS.teleport(x, z), [X, Z]);
  await stage('1 pas', () => { const t = performance.now(); window.__CRS.game.step(1 / 30); return performance.now() - t; });
  await stage('30 pas', () => { const t = performance.now(); const ms = []; for (let i = 0; i < 30; i++) { const a = performance.now(); window.__CRS.game.step(1 / 30); ms.push(+(performance.now() - a).toFixed(1)); } return { total: performance.now() - t, max: Math.max(...ms), sys: window.__CRS.summary().systems.filter((s) => s.updateMs > 2).map((s) => `${s.id}:${s.updateMs.toFixed(1)}`) }; }, null, 120000);
  await stage('whenLoaded', async ([x, z]) => { await Promise.race([window.__CRS.ctx.world.whenLoaded(x, z, 300), new Promise((r) => setTimeout(r, 30000))]); return window.__CRS.ctx.world.isLoaded(x, z); }, [X, Z]);
  await stage('pending', () => { const v = window.__CRS.ctx.service('world.view'); return { pending: v.pending(), stats: v.stats() }; });
  for (let k = 0; k < 6; k++) await stage('flush ' + k, () => { const v = window.__CRS.ctx.service('world.view'); const t = performance.now(); const done = v.flush(200); return { done, ms: performance.now() - t, pending: v.pending() }; });
  await stage('2 images', () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), null, 120000);
  log('après', J(await pageMem(page)), J(rss()));
  await stage('info', () => window.__V.info());
  await stage('300 pas', () => { const t = performance.now(); for (let i = 0; i < 300; i++) window.__CRS.game.step(1 / 30); return { total: performance.now() - t, sys: window.__CRS.summary().systems.filter((s) => s.updateMs > 1).map((s) => `${s.id}:${s.updateMs.toFixed(1)}`) }; }, null, 180000);
  log('fin', J(await pageMem(page)), J(rss()));
} catch (e) { console.error('EXCEPTION', e); }
clearInterval(watch);
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 6)));
await browser.close(); await server.close(); process.exit(0);
