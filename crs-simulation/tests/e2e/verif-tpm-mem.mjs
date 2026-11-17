// Testeur indépendant — MÉMOIRE DANS LE TEMPS : quelle action fait grossir le processus ?
// Vrai jeu, 960×540, qualité « bas », session lancée d'office place de la Concorde. La boucle d'images tourne normalement.
// À chaque étape : tas JS (après ramasse-miettes, CDP), mémoire résidente des processus Chromium (rendu, navigateur, GPU),
// géométries / textures de three.js, nœuds DOM, canevas du document, images affichées.
// Usage : node tests/e2e/verif-tpm-mem.mjs [--seq=plan,tactique,radio,pause,captures,repos] [--mobile=1]
import { execSync } from 'node:child_process';
import { startServer, openPage, waitFor, frames, state, snap, J, makeChecker } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const seq = (args.seq ?? 'repos,plan,tactique,radio,pause,captures,repos').split(',');
const mobile = args.mobile === '1';
const tag = `verif-tpm-mem${args.tag ? '-' + args.tag : ''}`;
const C = makeChecker(tag);
const report = { seq, samples: [] };

function chromeRss() {
  const rows = execSync('ps -eo pid,ppid,rss,args', { encoding: 'utf8' }).split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 4)
    .map((c) => ({ pid: Number(c[0]), ppid: Number(c[1]), rss: Number(c[2]), args: c.slice(3).join(' ') }));
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const mine = [];
  const walk = (pid) => { for (const k of kids.get(pid) ?? []) { mine.push(k); walk(k.pid); } };
  walk(process.pid);
  const ch = mine.filter((r) => /chrome-headless-shell/.test(r.args));
  const sum = (f) => Math.round(ch.filter(f).reduce((s, r) => s + r.rss, 0) / 1024);
  return { rendu: sum((r) => /--type=renderer/.test(r.args)), gpu: sum((r) => /--type=gpu-process/.test(r.args)), navigateur: sum((r) => !/--type=/.test(r.args) && /\.real/.test(r.args)) };
}

const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&role=crs&poste=lanceur&crowd=150`, mobile ? { width: 844, height: 390, mobile: true } : { width: 960, height: 540 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const t0 = Date.now();
let last = null;
async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 104857.6) / 10;
  const dom = await cdp.send('Memory.getDOMCounters');
  const inPage = await page.evaluate(() => {
    const c = window.__CRS; const ctx = c.ctx; const m = ctx.view.renderer.info.memory;
    const cv = [...document.querySelectorAll('canvas')];
    return { geom: m.geometries, tex: m.textures, canvases: cv.length, canvasMpx: Math.round(cv.reduce((s, e) => s + e.width * e.height, 0) / 1e4) / 100, frames: c.game.stats.frames, phase: ctx.session.phase, screen: ctx.ui.current, t: Math.round(ctx.clock.now), people: ctx.people.list.length };
  });
  const rss = chromeRss();
  const row = { s: Math.round((Date.now() - t0) / 1000), label, heap, ...rss, nodes: dom.nodes, listeners: dom.jsEventListeners, ...inPage };
  report.samples.push(row);
  const d = last ? ` (Δ rendu ${row.rendu - last.rendu >= 0 ? '+' : ''}${row.rendu - last.rendu}, Δ navigateur ${row.navigateur - last.navigateur >= 0 ? '+' : ''}${row.navigateur - last.navigateur}, Δ tas ${(row.heap - last.heap).toFixed(1)}, ${row.frames - last.frames} images)` : '';
  console.log(`  ${String(row.s).padStart(4)} s  ${label.padEnd(34)} rendu ${String(row.rendu).padStart(5)} Mo  navigateur ${String(row.navigateur).padStart(5)} Mo  GPU ${String(row.gpu).padStart(4)} Mo  tas ${String(row.heap).padStart(6)} Mo  géom ${row.geom} tex ${row.tex}  DOM ${row.nodes}  canevas ${row.canvases} (${row.canvasMpx} Mpx)  écran ${row.screen}/${row.phase}${d}`);
  last = row;
  return row;
}
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k) => { await page.keyboard.press(k); await frames(page, 4); await wait(500); };

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 5);
  await sample('en jeu, départ');
  for (const part of seq) {
    if (part === 'repos') {
      for (let i = 1; i <= 4; i++) { await wait(12000); await sample(`repos en jeu +${i * 12} s`); }
    } else if (part === 'plan' || part === 'tactique' || part === 'radio') {
      const k = part === 'plan' ? 'KeyM' : part === 'tactique' ? 'Tab' : 'KeyT';
      await key(k);
      const s = await state(page);
      await sample(`${part} ouvert (${s.screen})`);
      await wait(12000); await sample(`${part} ouvert +12 s`);
      await wait(12000); await sample(`${part} ouvert +24 s`);
      if (part === 'radio') await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); else await key(k);
      await frames(page, 4);
      await sample(`${part} fermé`);
      await wait(12000); await sample(`${part} fermé +12 s`);
      await wait(12000); await sample(`${part} fermé +24 s`);
    } else if (part === 'pause') {
      await key('Escape');   // (la pause est sur Échap ; P accepte la proposition de l'adjoint)
      await sample('pause ouverte');
      for (let i = 1; i <= 3; i++) { await wait(12000); await sample(`pause +${i * 12} s`); }
      await page.locator('[data-id="pause-reprendre"]').click(); await frames(page, 4);
      await sample('reprise');
      await wait(12000); await sample('reprise +12 s');
      await wait(12000); await sample('reprise +24 s');
    } else if (part === 'captures') {
      for (let i = 0; i < 6; i++) await page.screenshot({ path: `${process.cwd()}/tests/e2e/out/${tag}-capture.png`, timeout: 240000 });
      await sample('après 6 captures d’écran');
      await wait(12000); await sample('captures +12 s');
    } else if (part === 'portrait') {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.height, height: vp.width }); await frames(page, 4);
      await sample('portrait');
      await wait(12000); await sample('portrait +12 s');
      await page.setViewportSize(vp); await frames(page, 4);
      await sample('retour paysage');
      await wait(12000); await sample('paysage +12 s');
    } else if (part === 'masque' || part === 'visiere') {
      const k = part === 'masque' ? 'KeyG' : 'KeyH';
      await page.keyboard.press(k); await frames(page, 3);
      await page.evaluate(() => window.__CRS.step(9.5)); await frames(page, 3);
      const fx = await page.evaluate(() => { const p = window.__CRS.ctx.player.person(); const f = document.querySelector('#game canvas'); return { gasProtection: p.gasProtection, look: JSON.stringify(p.look).slice(0, 200), filter: f.style.filter, fxShown: [...document.querySelectorAll('.crs-fx > div')].filter((e) => Number(getComputedStyle(e).opacity) > 0.01).map((e) => e.className) }; });
      console.log('    ' + part + ' : ' + JSON.stringify(fx));
      await sample(`${part} mis`);
      for (let i = 1; i <= 4; i++) { await wait(12000); await sample(`${part} mis +${i * 12} s`); }
      await page.keyboard.press(k); await frames(page, 3);
      await page.evaluate(() => window.__CRS.step(9.5)); await frames(page, 3);
      await sample(`${part} retiré`);
      await wait(12000); await sample(`${part} retiré +12 s`);
    } else if (part === 'gaz') {
      await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); for (let i = 0; i < 20; i++) { c.hazards.emitGas(p.x, p.z, 1, 8); window.__CRS.step(0.5); } });
      await frames(page, 3);
      const fx = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); const f = document.querySelector('#game canvas'); return { gas: c.hazards.gasAt(p.x, p.z), personGas: p.gas, filter: f.style.filter }; });
      console.log('    gaz : ' + JSON.stringify(fx));
      await sample('dans le gaz');
      for (let i = 1; i <= 4; i++) { await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); c.hazards.emitGas(p.x, p.z, 1, 8); }); await wait(12000); await sample(`dans le gaz +${i * 12} s`); }
      await page.evaluate(() => { const c = window.__CRS.ctx; c.hazards.clear(); window.__CRS.step(60); });
      await frames(page, 3);
      await sample('gaz dissipé');
      await wait(12000); await sample('gaz dissipé +12 s');
    } else if (part === 'vues') {
      for (const m of ['tps', 'fps', 'tps', 'fps']) { await page.evaluate((mode) => window.__CRS.ctx.player.setCameraMode(mode), m); await frames(page, 4); await wait(6000); await sample(`vue ${m}`); }
    } else if (part === 'pas') {
      for (let i = 0; i < 6; i++) await page.evaluate(() => window.__CRS.step(10));
      await sample('après 60 s simulées par step()');
    }
  }
  const first = report.samples[0], end = report.samples[report.samples.length - 1];
  const total = (r) => r.rendu + r.navigateur + r.gpu;
  C.check(total(end) < total(first) + 400, 'mémoire résidente totale de Chromium stable sur le parcours (moins de 400 Mo de hausse)', `${total(first)} Mo → ${total(end)} Mo en ${end.s - first.s} s (rendu ${first.rendu} → ${end.rendu}, navigateur ${first.navigateur} → ${end.navigateur}, GPU ${first.gpu} → ${end.gpu})`);
  C.check(end.heap < first.heap * 1.3 + 20, 'tas JavaScript stable', `${first.heap} → ${end.heap} Mo`);
} catch (err) {
  C.check(false, 'exception générale', String(err && err.stack ? err.stack : err).slice(0, 500));
}
report.errors = errors.slice();
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.failures = C.failures;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
