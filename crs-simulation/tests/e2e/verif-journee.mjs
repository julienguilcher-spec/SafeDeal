// Journée de service dans le vrai jeu : prise de service à la caserne de la Cité, objectif « Embarquez » suivi au GPS,
// puis le joueur monte et la colonne part, sirènes, conduite par l'IA.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&journee=1&quality=bas&nomenu=1&role=crs&crowd=150&place=Place%20de%20la%20R%C3%A9publique&x=3123&z=-208', { width: 1280, height: 720 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(12));
  await new Promise((r) => setTimeout(r, 2500));
  const a = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const o = ctx.service('ui.objectives');
    return { stage: ctx.service('session.journee')?.stage, me: [Math.round(me.x), Math.round(me.z)], objectives: o?.list.map((x) => x.text), tracked: o?.tracked,
      radio: ctx.radio.log.slice(-4).map((m) => m.from + ': ' + m.text) };
  });
  console.log('caserne', JSON.stringify(a, null, 1));
  await shot(page, 'journee-1-caserne');
  if (a.stage !== 'embarquement' || a.tracked !== 'journee') ok = false;
  // le joueur monte dans le véhicule indiqué
  await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const o = ctx.service('ui.objectives').list.find((x) => x.id === 'journee');
    const v = ctx.vehicles.list.filter((q) => q.faction === 'police' && q.seats.some((id, i) => id === 0 && i > 0)).sort((p, q) => Math.hypot(p.x - o.x, p.z - o.z) - Math.hypot(q.x - o.x, q.z - o.z))[0];
    me.x = v.x + 3; me.z = v.z;
    ctx.vehicles.enter(me, v, 'passenger');
  });
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() => window.__CRS.step(5));
    const st = await page.evaluate(() => window.__CRS.ctx.service('session.journee')?.stage);
    if (st === 'route' && i > 3) break;
  }
  await new Promise((r) => setTimeout(r, 2500));
  const b = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const v = ctx.vehicles.get(me.vehicleId);
    return { stage: ctx.service('session.journee')?.stage, inVehicle: !!v, kind: v?.kind, speed: v ? +v.speed.toFixed(1) : 0, siren: v?.siren, driverIsPlayer: v ? v.seats[0] === me.id : null,
      camera: ctx.player.state.cameraMode, objective: ctx.service('ui.objectives')?.list.map((x) => x.text) };
  });
  console.log('colonne', JSON.stringify(b, null, 1));
  await shot(page, 'journee-2-colonne');
  if (b.stage !== 'route' || !b.inVehicle || b.driverIsPlayer) ok = false;
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'journee' });
