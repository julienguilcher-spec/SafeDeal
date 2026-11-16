// Carte « Ma mission » du CRS stagiaire : capture d'une session (deviceScaleFactor 1).
// Usage : node tests/e2e/verif-ma-mission.mjs
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&seed=7&mode=libre&role=crs&rank=gardien_stagiaire&crowd=300`, { width: 1280, height: 720, pointerLock: false });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await waitFor(page, 'window.__CRS.ctx.service("session.mission") && window.__CRS.ctx.service("session.mission").active', 120000);
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => {
    const b = window.__CRS.ctx.service('session.mission');
    const card = document.querySelector('[data-w="mission"]');
    return { active: b.active, chain: b.chain, chief: b.chief && b.chief.label, title: b.instruction.title, source: b.instruction.source, visible: !!card && !card.hidden, text: card ? card.textContent : '' };
  });
  console.log(JSON.stringify(info, null, 1));
  ok = info.visible;
  console.log('capture : ' + await shot(page, 'ma-mission-crs'));
  // éloigné de son groupe : rappel, GPS sur le chef ; écran bas (disposition compacte)
  await page.evaluate(() => { const c = window.__CRS.ctx; const b = c.service('session.mission'); window.__CRS.teleport(b.chief.x + 70, b.chief.z); });
  await page.waitForTimeout(4000);
  console.log('éloigné : ' + await page.evaluate(() => window.__CRS.ctx.service('session.mission').instruction.title));
  console.log('capture : ' + await shot(page, 'ma-mission-crs-eloigne'));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(3000);
  console.log('capture : ' + await shot(page, 'ma-mission-crs-compact'));
} catch (err) {
  ok = false;
  console.error(err);
}
await finish({ browser, server, errors, ok, label: 'ma-mission' });
