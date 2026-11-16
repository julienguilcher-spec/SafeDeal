// Mission lancée par l'URL dans le vrai jeu : bandeau, objectifs au HUD, aucune erreur ; captures.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mission=crs-01-premier-samedi&quality=bas&nomenu=1', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(4));
  await new Promise((r) => setTimeout(r, 4000));
  const a = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const m = ctx.service('missions');
    const o = ctx.service('ui.objectives');
    return { mission: m && m.current ? m.current.id : null, phase: m ? m.phaseIndex : -2, objectifs: o ? o.list.map((x) => x.text) : [], session: ctx.session.phase };
  });
  console.log('début', JSON.stringify(a));
  ok = ok && a.mission === 'crs-01-premier-samedi' && a.objectifs.length >= 3;
  await shot(page, 'mission-debut');
  await page.evaluate(() => window.__CRS.step(120));
  await new Promise((r) => setTimeout(r, 4000));
  const b = await page.evaluate(() => { const m = window.__CRS.ctx.service('missions'); return { phase: m.phaseIndex }; });
  console.log('après 2 min', JSON.stringify(b));
  ok = ok && b.phase >= 1;
  await shot(page, 'mission-2min');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'mission' });
