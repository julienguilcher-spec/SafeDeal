// Canon à eau dans le vrai jeu : l'ordre de la chaîne de commandement s'affiche (objectif suivi au GPS) et la radio l'annonce.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&quality=bas&nomenu=1&role=operateur_canon_eau&crowd=200', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.__CRS.step(5));
    const got = await page.evaluate(() => !!window.__CRS.ctx.service('session.orders')?.current);
    if (got) break;
  }
  await new Promise((r) => setTimeout(r, 2500));
  const res = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const o = ctx.service('ui.objectives');
    const me = ctx.player.person();
    return {
      order: ctx.service('session.orders')?.current?.text ?? null,
      tracked: o?.tracked, objectives: o?.list.map((x) => `${x.id}:${x.state}:${x.text}`),
      gps: ctx.service('ui.maps')?.gpsTarget ?? null,
      radio: ctx.radio.log.filter((m) => /Rendez compte/.test(m.text)).map((m) => m.text).slice(-1)[0],
      poste: me?.poste, seat: me?.seat, vehicle: me?.vehicleId ? ctx.vehicles.get(me.vehicleId)?.kind : null,
    };
  });
  console.log(JSON.stringify(res, null, 1));
  // l'objectif suivi est celui de la carte « Ma mission » ('consigne'), qui porte le point de l'ordre ; à défaut 'ordre'
  if (!res.order || !['ordre', 'consigne'].includes(res.tracked)) ok = false;
  if (!res.objectives.some((o) => o.startsWith('consigne:actif:') || o.startsWith('ordre:actif:'))) ok = false;
  await shot(page, 'verif-ordre-joueur');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'ordre-joueur' });
