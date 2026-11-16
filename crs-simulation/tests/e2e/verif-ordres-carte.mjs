// Carte tactique du vrai jeu, commandant : sélectionner une unité dans la liste, choisir « Ligne », cliquer sur la carte.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=100', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(20));
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique'));
  await new Promise((r) => setTimeout(r, 5000));
  const scope = await page.evaluate(() => window.__CRS.ctx.service('ui.command')?.scope?.() ?? null);
  console.log('étendue', JSON.stringify(scope && { level: scope.level, label: scope.label, n: scope.squadIds?.size }));
  const rows = page.locator('[data-squad], .ct-unit, .ct-tree-row');
  console.log('lignes d’unités', await rows.count());
  await shot(page, 'verif-ordres-1');
  // première section : clic sur la ligne
  const row = rows.nth(1);
  const sid = await row.getAttribute('data-squad');
  await row.click();
  await new Promise((r) => setTimeout(r, 1500));
  await page.locator('[data-id="verb-ligne"]').click();
  await new Promise((r) => setTimeout(r, 1000));
  const canvas = page.locator('canvas').last();
  const box = await canvas.boundingBox();
  // tracé d'une ligne (glisser) au centre de la carte
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 2000));
  const res = await page.evaluate((sid) => {
    const ctx = window.__CRS.ctx;
    const sq = sid ? ctx.squads.get(Number(sid)) : null;
    return { squad: sq && sq.name, order: sq && sq.order.type, by: sq && sq.order.issuedBy === ctx.player.state.personId };
  }, sid);
  console.log('résultat', JSON.stringify(res));
  await shot(page, 'verif-ordres-2');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'ordres-carte' });
