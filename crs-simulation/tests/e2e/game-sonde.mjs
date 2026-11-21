// Sonde rapide (outil de mise au point de l'assemblage) : ouvre le vrai jeu avec une URL donnée, attend __CRS.ready,
// affiche le résumé et prend une capture. Usage : node tests/e2e/game-sonde.mjs "<paramètres d'URL>" [nom] [largeur] [hauteur] ["<code>"]
// Le code facultatif est évalué dans la page avant la capture (c = window.__CRS), par exemple pour tourner la caméra :
//   node tests/e2e/game-sonde.mjs "autostart=paris&quality=bas&nomenu=1&camera=tps" derriere 960 540 "c.ctx.player.state.camYaw += Math.PI" 
import { startServer, openPage, waitFor, shot, finish, OUT } from './lib.mjs';

const query = process.argv[2] ?? 'autostart=paris&quality=bas&nomenu=1';
const name = process.argv[3] ?? 'game-sonde';
const width = Number(process.argv[4] ?? 960);
const height = Number(process.argv[5] ?? 540);
const code = process.argv[6] ?? '';
const server = await startServer();
const t0 = Date.now();
const { browser, page, errors } = await openPage(`${server.url}?${query}`, { width, height });
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'info') console.log(`  [${m.type()}] ${m.text().slice(0, 300)}`); });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && (window.__CRS.ready === true || window.__CRS.error)', 300000);
  console.log(`prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const s = await page.evaluate(() => {
    const c = window.__CRS;
    const sum = c.summary();
    const p = c.ctx.player.person();
    return {
      error: c.error, phase: sum.phase, view: sum.view, entities: sum.entities, player: sum.player,
      cam: c.ctx.player.state.cameraMode, setup: c.ctx.service('session.setup')?.summary ?? null,
      inv: p ? p.inventory.map((i) => `${i.id}×${i.count}`) : null,
      loading: c.ctx.service('session.loading') ?? null,
      systems: sum.systems.filter((x) => x.errors > 0 || x.disabled),
      render: c.ctx.service('render.base')?.stats ?? null,
    };
  });
  console.log(JSON.stringify(s, null, 1));
  if (code) {
    const out = await page.evaluate((src) => { const c = window.__CRS; const r = (0, eval)(`(function (c) { ${src} })`)(c); c.step(0.2); return r === undefined ? null : JSON.stringify(r); }, code);
    if (out) console.log('code →', out);
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 240000 });
  console.log('capture :', `${OUT}/${name}.png`);
} catch (err) {
  ok = false;
  console.error(String(err));
  try { console.log('capture (échec) :', await shot(page, name + '-echec')); } catch {}
}
await finish({ browser, server, errors, ok, label: 'game-sonde' });
