// Commandant : la proposition de l'adjoint s'affiche au HUD ; « Accepter » fait exécuter (mise en place du dispositif).
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=150', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.__CRS.step(5));
    await new Promise((r) => setTimeout(r, 700));
    if (await page.locator('[data-id="hud-proposal"]:not(.is-off)').count()) break;
  }
  const text = await page.locator('[data-id="hud-proposal"]').innerText();
  console.log('proposition :', JSON.stringify(text));
  await shot(page, 'proposition-1');
  const before = await page.evaluate(() => window.__CRS.ctx.service('police.command').decisions.length);
  await page.locator('[data-id="proposal-accept"]').click();
  await page.evaluate(() => window.__CRS.step(3));
  const after = await page.evaluate(() => window.__CRS.ctx.service('police.command').decisions.slice(-3).map((d) => d.key + ': ' + d.text.slice(0, 80)));
  console.log('décisions', before, '→', JSON.stringify(after, null, 1));
  await shot(page, 'proposition-2');
  if (!text.includes('PROPOSITION')) ok = false;
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'propositions' });
