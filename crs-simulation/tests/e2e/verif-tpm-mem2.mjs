// Testeur indépendant — MÉMOIRE, bissection : quelle action précise déclenche la hausse de plusieurs centaines de Mo ?
// Chaque action est isolée, avec un relevé avant, juste après et 20 s plus tard. Compteurs de nœuds WebAudio par CDP.
// Usage : node tests/e2e/verif-tpm-mem2.mjs [--seq=a,b,c,…] [--tag=x]
import { execSync } from 'node:child_process';
import { startServer, openPage, waitFor, frames, makeChecker } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const seq = (args.seq ?? 'repos,pause_api,pause_clavier,clic_vue,echap_reprendre,masque,repos').split(',');
const tag = `verif-tpm-mem2${args.tag ? '-' + args.tag : ''}`;
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
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&role=crs&poste=lanceur&crowd=150`, { width: 960, height: 540 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const audio = { contexts: 0, created: 0, destroyed: 0, byType: {} };
try {
  await cdp.send('WebAudio.enable');
  cdp.on('WebAudio.contextCreated', () => { audio.contexts++; });
  cdp.on('WebAudio.audioNodeCreated', (e) => { audio.created++; const t = e.node?.nodeType ?? '?'; audio.byType[t] = (audio.byType[t] || 0) + 1; });
  cdp.on('WebAudio.audioNodeWillBeDestroyed', () => { audio.destroyed++; });
} catch (e) { console.log('  (domaine CDP WebAudio indisponible : ' + e.message + ')'); }
const t0 = Date.now();
let last = null;
async function sample(label, gc = true) {
  let heap = -1;
  if (gc) { await cdp.send('HeapProfiler.collectGarbage'); heap = Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 104857.6) / 10; }
  const inPage = await page.evaluate(() => {
    const c = window.__CRS; const ctx = c.ctx;
    const a = ctx.service('audio.debug') ?? ctx.service('audio') ?? null;
    let ad = {};
    try { const eng = ctx.audio; ad = { keys: Object.keys(eng || {}).slice(0, 12).join(',') }; } catch { /* */ }
    return { frames: c.game.stats.frames, phase: ctx.session.phase, screen: ctx.ui.current, lock: !!document.pointerLockElement, speaking: typeof speechSynthesis !== 'undefined' ? `${speechSynthesis.speaking}/${speechSynthesis.pending}` : 'n/a', frameMs: Math.round(c.game.stats.avgFrameMs * 10) / 10, t: Math.round(ctx.clock.now), ad: ad.keys, hasA: !!a };
  });
  const rss = chromeRss();
  const row = { s: Math.round((Date.now() - t0) / 1000), label, heap, ...rss, audioVivants: audio.created - audio.destroyed, audioCrees: audio.created, ctxAudio: audio.contexts, ...inPage };
  report.samples.push(row);
  const d = last ? `  Δrendu ${row.rendu - last.rendu >= 0 ? '+' : ''}${row.rendu - last.rendu} Δnav ${row.navigateur - last.navigateur >= 0 ? '+' : ''}${row.navigateur - last.navigateur}` : '';
  console.log(`  ${String(row.s).padStart(4)} s  ${label.padEnd(40)} rendu ${String(row.rendu).padStart(5)} nav ${String(row.navigateur).padStart(5)} gpu ${String(row.gpu).padStart(4)} Mo  tas ${String(row.heap).padStart(5)}  audio : ${row.ctxAudio} ctx, ${row.audioVivants} nœuds vivants / ${row.audioCrees} créés  parole ${row.speaking}  souris capturée ${row.lock}  ${row.screen}/${row.phase}  JS ${row.frameMs} ms/image, ${row.frames} images${d}`);
  last = row;
  return row;
}
const wait = (ms) => page.waitForTimeout(ms);
const settle = async (label) => { await wait(20000); return sample(label + ' +20 s'); };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 5);
  await sample('en jeu, départ (aucun geste)');
  for (const part of seq) {
    const before = last;
    if (part === 'repos') { await settle('repos'); }
    else if (part === 'pause_api') {
      await page.evaluate(() => window.__CRS.ctx.session.pause(true)); await frames(page, 4); await sample('pause par session.pause(true)');
      await page.evaluate(() => window.__CRS.ctx.session.pause(false)); await frames(page, 4); await sample('reprise par session.pause(false)');
      await settle('reprise (API)');
    } else if (part === 'pause_clavier') {
      await page.keyboard.press('Escape'); await frames(page, 4); await sample('pause au clavier (Échap) — premier geste clavier');
      await page.keyboard.press('Escape'); await frames(page, 4); await sample('reprise au clavier (Échap)');
      await settle('reprise (clavier)');
    } else if (part === 'touche') {
      await page.keyboard.press('KeyV'); await frames(page, 4); await sample('touche V (premier geste clavier)');
      await settle('touche V');
    } else if (part === 'clic_vue') {
      await page.mouse.move(2, 2); await page.mouse.click(2, 2); await frames(page, 4); await sample('clic dans la vue (capture de la souris)');
      await settle('clic dans la vue');
    } else if (part === 'echap_reprendre') {
      await page.keyboard.press('Escape'); await frames(page, 4); await sample('pause (Échap)');
      await page.locator('[data-id="pause-reprendre"]').click(); await frames(page, 4); await sample('clic sur « Reprendre »');
      await settle('« Reprendre »');
    } else if (part === 'masque') {
      await page.keyboard.press('KeyG'); await frames(page, 3); await page.evaluate(() => window.__CRS.step(9.5)); await frames(page, 3);
      await sample('masque mis'); await settle('masque mis');
    } else if (part === 'muet') {
      await page.evaluate(() => { window.__CRS.ctx.settings.set('masterVolume', 0); }); await frames(page, 3); await sample('volume général à 0'); await settle('volume 0');
    } else if (part === 'audio_off') {
      const r = await page.evaluate(async () => { const e = window.__CRS.ctx.service('audio.engine') || null; const acs = []; return { e: !!e }; });
      await sample('—');
    }
    if (before && last.rendu - before.rendu > 250) console.log(`  >>> « ${part} » : +${last.rendu - before.rendu} Mo de mémoire de rendu`);
  }
  report.audio = audio;
  console.log('  nœuds WebAudio créés par type : ' + JSON.stringify(audio.byType));
} catch (err) {
  C.check(false, 'exception générale', String(err && err.stack ? err.stack : err).slice(0, 500));
}
report.errors = errors.slice();
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
