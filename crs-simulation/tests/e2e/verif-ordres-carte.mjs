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
  const rows = page.locator('[data-id^="unit-"]');
  console.log('lignes d’unités', await rows.count());
  await shot(page, 'verif-ordres-1');
  // première section : clic sur la ligne
  const row = rows.nth(1);
  const sid = ((await row.getAttribute('data-id')) || '').replace('unit-', '');
  await row.click();
  await new Promise((r) => setTimeout(r, 1500));
  await page.locator('[data-id="verb-ligne"]').click();
  await new Promise((r) => setTimeout(r, 1000));
  // (la carte : le dernier canvas de la page est celui, masqué, du retour vidéo du drone)
  const canvas = page.locator('[data-id="tac-map"]');
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
    const notes = ctx.service('ui.debug')?.notices?.() ?? [];
    return { squad: sq && sq.name, order: sq && sq.order.type, by: sq && sq.order.issuedBy === ctx.player.state.personId, notes: notes.slice(-4) };
  }, sid);
  console.log('résultat', JSON.stringify(res));
  // L'ordre est pris : soit l'unité est déjà en « ligne », soit — point éloigné, unité qui a ses fourgons — elle
  // embarque d'abord pour s'y rendre en colonne et se mettra en ligne à l'arrivée ; dans les deux cas le joueur en a
  // la confirmation (« Ligne de barrage — ordre transmis »).
  const told = res.notes.some((n) => /Ligne de barrage — (ordre transmis|\d+ unités)/.test(n));
  if (!res.squad || !told || !(res.order === 'ligne' || res.order === 'embarquer' || res.order === 'faire_mouvement')) ok = false;
  await shot(page, 'verif-ordres-2');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'ordres-carte' });
