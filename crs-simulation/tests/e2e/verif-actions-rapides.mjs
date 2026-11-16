// Actions rapides du HUD : « Carte tactique » d'un clic (commandant), « Secours » → Pompiers / SAMU.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=100', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(10));
  await new Promise((r) => setTimeout(r, 2000));
  const label = await page.locator('[data-id="quick-map"]').innerText();
  console.log('bouton carte :', JSON.stringify(label));
  await shot(page, 'quick-1-hud');
  await page.locator('[data-id="quick-rescue"]').click();
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, 'quick-2-secours');
  const calls0 = await page.evaluate(() => window.__CRS.ctx.service('rescue.dispatch')?.calls?.length ?? -1);
  await page.locator('[data-id="quick-pompiers"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const calls1 = await page.evaluate(() => window.__CRS.ctx.service('rescue.dispatch')?.calls?.length ?? -1);
  const radio = await page.evaluate(() => window.__CRS.ctx.radio.log.slice(-1)[0]?.text);
  console.log('appels secours', calls0, '→', calls1, '| radio :', radio);
  await page.locator('[data-id="quick-map"]').click();
  await new Promise((r) => setTimeout(r, 2500));
  const open = await page.evaluate(() => document.querySelector('[data-id="tac-close"]') !== null || !!document.querySelector('.tac, .cm-tac'));
  console.log('carte tactique ouverte :', open);
  await shot(page, 'quick-3-carte');
  if (!label.includes('Carte tactique') || !open) ok = false;
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'actions-rapides' });
