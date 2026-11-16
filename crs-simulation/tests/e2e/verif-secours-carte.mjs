// Carte tactique : « Pompiers → » puis un clic sur un feu : l'appel est lié au feu (l'équipe va directement l'éteindre).
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=60', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  const fire = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const x = me.x + 40, z = me.z + 10;
    const prop = ctx.props.spawn('poubelle', x, z, 0);
    ctx.props.damage(prop, 1000, 'burn', 0);
    ctx.hazards.ignite(x, z, 1.2, 0.9, 0);
    return { x, z };
  });
  await page.evaluate(() => window.__CRS.step(3));
  const incs = await page.evaluate(() => window.__CRS.ctx.service('incidents')?.list?.map((i) => i.kind + '#' + i.id) ?? null);
  console.log('incidents', JSON.stringify(incs));
  await page.evaluate((f) => window.__CRS.ctx.ui.open('carte_tactique', { x: f.x, z: f.z, mpp: 0.6 }), fire);
  await new Promise((r) => setTimeout(r, 3500));
  await page.locator('[data-id="tac-rescue-pompiers"]').click();
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, 'secours-carte-1');
  const canvas = page.locator('canvas').last();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, 1500));
  const calls = await page.evaluate(() => (window.__CRS.ctx.service('rescue.dispatch')?.calls ?? []).map((c) => ({ kind: c.kind, incident: c.incidentId, x: Math.round(c.x), z: Math.round(c.z), eta: Math.round(c.eta) })));
  console.log('appels', JSON.stringify(calls));
  await shot(page, 'secours-carte-2');
  if (!calls.length || !calls[0].incident) ok = false;
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'secours-carte' });
