// Carte de commandement : intention « Secours » (bouton du bas) → la fiche du feu, « Envoyer les pompiers » surlignée →
// « Donner l'ordre » : l'appel est lié au feu (l'équipe va directement l'éteindre). Puis, au clic sur le feu, sa fiche
// propose les secours dans l'ordre des moyens et dit qu'ils y vont déjà.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
import { clickSel, frames, tactical } from './verif-fin-lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=60', { width: 1280, height: 720 });
let ok = true;
const fail = (msg, detail = '') => {
  ok = false;
  console.error('  ✗ ' + msg + (detail ? ' — ' + detail : ''));
};
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
  // intention « Secours » (S) : la visée va au feu, « Envoyer les pompiers » surlignée
  if (!(await clickSel(page, '[data-id="intent-secours"]'))) throw new Error('bouton « Secours » absent');
  await frames(page, 3);
  const card = await tactical(page);
  console.log('fiche', JSON.stringify(card));
  if (!card || card.intent !== 'secours' || card.kind !== 'incident') fail('« Secours » : la fiche de l’incident le plus urgent', JSON.stringify(card));
  if (!card || !/pompiers/i.test(card.lineLabel)) fail('« Secours » : « Envoyer les pompiers » surlignée', card && card.lineLabel);
  await shot(page, 'secours-carte-1');
  if (!(await clickSel(page, '[data-id="card-send"]'))) fail('bouton « Donner l’ordre » absent');
  await new Promise((r) => setTimeout(r, 1500));
  const calls = await page.evaluate(() => (window.__CRS.ctx.service('rescue.dispatch')?.calls ?? []).map((c) => ({ kind: c.kind, incident: c.incidentId, x: Math.round(c.x), z: Math.round(c.z), eta: Math.round(c.eta) })));
  console.log('appels', JSON.stringify(calls));
  if (!calls.length || !calls[0].incident || calls[0].kind !== 'pompiers') fail('les pompiers sont appelés, l’appel lié au feu', JSON.stringify(calls));
  await shot(page, 'secours-carte-2');
  // la fiche du feu, au clic : les moyens et ce qui est déjà en route
  await page.evaluate(() => { const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical; for (let i = 0; i < 6 && (t.state.card || t.state.intent); i++) if (!t.back()) break; });
  await frames(page, 3);
  const at = await page.evaluate((f) => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const r = t.map.canvas.getBoundingClientRect();
    const p = { x: 0, y: 0 };
    t.map.view.worldToScreen(f.x, f.z, p);
    return { x: r.left + p.x, y: r.top + p.y };
  }, fire);
  await page.mouse.click(at.x, at.y);
  await new Promise((r) => setTimeout(r, 800));
  const inc = await tactical(page);
  const text = await page.evaluate(() => (document.querySelector('[data-id="card"]')?.innerText || '').replace(/\s+/g, ' '));
  console.log('fiche du feu', JSON.stringify(inc), '|', text.slice(0, 220));
  if (!inc || inc.kind !== 'incident' || !inc.lines.some((l) => /pompiers/i.test(l))) fail('clic sur le feu : sa fiche propose les pompiers', JSON.stringify(inc));
  await shot(page, 'secours-carte-3');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'secours-carte' });
