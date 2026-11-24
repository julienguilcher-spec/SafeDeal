// Carte « Ma mission » d'un CRS en journée de service : l'ordre de mouvement (qui, où, distance) et l'état du départ
// de la colonne (embarquement compté, la colonne part, en route). Captures 1280x720 puis 844x390 (téléphone).
// Usage : node tests/e2e/verif-ordres-clairs.mjs
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&journee=1&quality=bas&nomenu=1&role=crs&rank=gardien_stagiaire&crowd=150&place=Place%20de%20la%20R%C3%A9publique&x=3123&z=-208', { width: 1280, height: 720, pointerLock: false });
let ok = true;
const card = () => page.evaluate(() => {
  const b = window.__CRS.ctx.service('session.mission');
  const el = document.querySelector('[data-w="mission"]') || document.querySelector('.hud-mis');
  const rows = el ? [...el.querySelectorAll('.hud-mis__cmd, .hud-mis__task, .hud-mis__status, .hud-mis__chief')].filter((r) => !r.hidden && getComputedStyle(r).display !== 'none').map((r) => r.textContent) : [];
  const box = el ? el.getBoundingClientRect() : null;
  return { status: b.status, command: b.command && `${b.command.from} : ${b.command.text} — ${b.command.place}`, title: b.instruction.title, rows, h: box ? Math.round(box.height) : 0, visible: !!el && el.offsetParent !== null };
});
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 400000);
  await page.evaluate(() => window.__CRS.step(6));
  await new Promise((r) => setTimeout(r, 2500));
  const a = await card();
  console.log('caserne : ' + JSON.stringify(a, null, 1));
  if (!a.visible || !/^Embarquement : \d+ \/ \d+ à bord/.test(a.status) || !a.command) ok = false;
  console.log('capture : ' + await shot(page, 'ordres-clairs-1-caserne'));
  await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const v = ctx.vehicles.list.filter((q) => (q.kind === 'fourgon_crs' || q.kind === 'vl_commandement') && q.seats[0] !== 0 && q.seats.some((id, i) => id === 0 && i > 0)).sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z))[0];
    me.x = v.x + 3; me.z = v.z;
    ctx.vehicles.enter(me, v, 'passenger');
  });
  let seen = '';
  for (let i = 0; i < 40 && !/^En route/.test(seen); i++) {
    await page.evaluate(() => window.__CRS.step(5));
    seen = (await card()).status;
  }
  const b = await card();
  console.log('en route : ' + JSON.stringify(b, null, 1));
  console.log('capture : ' + await shot(page, 'ordres-clairs-2-route'));
  await page.setViewportSize({ width: 844, height: 390 });
  await new Promise((r) => setTimeout(r, 3000));
  const c = await card();
  console.log('téléphone : ' + JSON.stringify(c, null, 1));
  if (c.rows.length > 3) ok = false;
  console.log('capture : ' + await shot(page, 'ordres-clairs-3-telephone'));
} catch (err) {
  ok = false;
  console.error(err);
}
await finish({ browser, server, errors, ok, label: 'ordres-clairs' });
