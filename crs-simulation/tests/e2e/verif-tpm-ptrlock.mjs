// Testeur indépendant — TÉMOIN : la hausse de mémoire sous capture de la souris vient-elle du jeu ou de Chromium sans tête ?
// Page vide (aucun code du jeu) : un canevas, capture de la souris au clic, comptage des mousemove, mémoire résidente.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
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
  return { rendu: sum((r) => /--type=renderer/.test(r.args)), navigateur: sum((r) => !/--type=/.test(r.args) && /\.real/.test(r.args)) };
}
const withGl = process.argv.includes('--gl');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
await page.setContent(`<body style="margin:0"><canvas id="c" width="960" height="540" style="width:960px;height:540px;display:block"></canvas><script>
  window.n = 0; window.sx = 0; window.frames = 0;
  const c = document.getElementById('c');
  c.addEventListener('click', () => c.requestPointerLock());
  document.addEventListener('mousemove', (e) => { window.n++; window.sx += Math.abs(e.movementX) + Math.abs(e.movementY); });
  ${withGl ? `const gl = c.getContext('webgl2'); const loop = () => { window.frames++; gl.clearColor(Math.random(), 0.3, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(loop); }; requestAnimationFrame(loop);` : `const loop = () => { window.frames++; requestAnimationFrame(loop); }; requestAnimationFrame(loop);`}
</script></body>`);
const show = async (label) => { const s = await page.evaluate(() => ({ lock: !!document.pointerLockElement, moves: window.n, sum: window.sx, frames: window.frames })); const r = chromeRss(); console.log(`  ${label.padEnd(34)} rendu ${r.rendu} Mo, navigateur ${r.navigateur} Mo ; souris capturée ${s.lock}, ${s.moves} mousemove (Σ|déplacement| ${s.sum}), ${s.frames} images`); return { ...s, ...r }; };
console.log(`[témoin] page vide${withGl ? ' avec canevas WebGL animé' : ''}`);
const a = await show('avant le clic');
await page.waitForTimeout(8000);
const a2 = await show('8 s sans capture');
await page.mouse.move(480, 270);
await page.mouse.click(480, 270);
await page.waitForTimeout(500);
const b = await show('juste après le clic (capture)');
await page.waitForTimeout(15000);
const c = await show('capture +15 s');
await page.waitForTimeout(15000);
const d = await show('capture +30 s');
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(8000);
const e = await show('capture rendue +8 s');
console.log(`[témoin] sous capture : rendu ${b.rendu} → ${d.rendu} Mo, navigateur ${b.navigateur} → ${d.navigateur} Mo, ${d.moves - b.moves} mousemove en 30 s, ${d.frames - b.frames} images en 30 s (${a2.frames - a.frames} images en 8 s avant)`);
await browser.close();
