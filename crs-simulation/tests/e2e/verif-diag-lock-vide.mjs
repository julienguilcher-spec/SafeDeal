// Testeur indépendant — contrôle : une page VIDE (sans le jeu) qui capture la souris sous Chromium headless
// montre-t-elle le même emballement (images rares, mémoire qui enfle) ? Si oui, c'est l'outillage, pas le jeu.
import { createRequire } from 'node:module';
import { rss } from './verif-lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const heavy = process.argv.includes('--lourd');
await page.setContent(`<canvas id="c" width="960" height="540" style="width:960px;height:540px"></canvas><script>
  window.cnt = { raf: 0, move: 0, longest: 0, lock: false };
  let last = performance.now();
  const g = document.getElementById('c').getContext('2d');
  const f = () => { const n = performance.now(); cnt.longest = Math.max(cnt.longest, Math.round(n - last)); last = n; cnt.raf++;
    ${heavy ? 'const t = performance.now(); while (performance.now() - t < 400) {}' : ''}
    g.fillStyle = 'hsl(' + (cnt.raf % 360) + ',50%,50%)'; g.fillRect(0, 0, 960, 540); requestAnimationFrame(f); };
  requestAnimationFrame(f);
  addEventListener('mousemove', () => cnt.move++);
  document.addEventListener('pointerlockchange', () => { cnt.lock = !!document.pointerLockElement; });
  addEventListener('mousedown', () => document.getElementById('c').requestPointerLock());
</script>`);
const sample = async (label) => { const c = await page.evaluate(() => { const o = { ...cnt }; cnt.longest = 0; return o; }); console.log(label.padEnd(24), JSON.stringify(rss()), JSON.stringify(c)); };
await sample('départ');
await page.waitForTimeout(8000); await sample('8 s sans capture');
await page.mouse.move(2, 2); await page.mouse.click(2, 2);
await sample('clic');
for (let k = 1; k <= 4; k++) { await page.waitForTimeout(8000); await sample(`capture +${k * 8}s`); }
await page.evaluate(() => document.exitPointerLock());
for (let k = 1; k <= 2; k++) { await page.waitForTimeout(8000); await sample(`rendue +${k * 8}s`); }
await browser.close(); process.exit(0);
