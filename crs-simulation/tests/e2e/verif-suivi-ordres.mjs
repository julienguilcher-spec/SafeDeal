// Carte tactique : un ordre donné à un groupe montre l'itinéraire réel, la distance et le temps estimé.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=60', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(15));
  const info = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const g = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe');
    // un groupe vers la terrasse du Jeu de Paume (détour par les escaliers), un autre vers la rue Royale
    ctx.squads.issue(g[0].id, { type: 'tenir', x: 140, z: 5, heading: 0, width: 12, issuedBy: me.id });
    ctx.squads.issue(g[1].id, { type: 'ligne', x: 126, z: -230, heading: 3.1, width: 14, issuedBy: me.id });
    return g.slice(0, 2).map((s) => s.name);
  });
  await page.evaluate(() => window.__CRS.step(4));
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique', { x: 60, z: -40, mpp: 0.9 }));
  await new Promise((r) => setTimeout(r, 4000));
  const routes = await page.evaluate(() => [...(window.__CRS.ctx.service('ui.maps')?.scene?.routes?.entries?.() ?? [])].map(([k, r]) => `${k}: ${Math.round(r.length)} m`));
  console.log('groupes', info.join(', '), '| itinéraires', JSON.stringify(routes));
  await shot(page, 'suivi-ordres');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'suivi-ordres' });
