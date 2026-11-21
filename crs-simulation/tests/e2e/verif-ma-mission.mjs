// Carte « Ma mission » du CRS stagiaire : capture d'une session (deviceScaleFactor 1). L'ordre d'abord : le titre dit
// d'où vient l'ordre (« ORDRE DU … », sinon « MA MISSION ») et la première ligne est l'ordre lui-même ; sur le téléphone,
// exactement deux lignes, l'ordre jamais coupé.
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
  // l'ordre d'abord : titre (« ORDRE DU COMMANDANT », « ORDRE DU CHEF DE GROUPE »… ou « MA MISSION »), puis l'ordre
  const head = await page.evaluate(() => {
    const card = document.querySelector('.hud-mis');
    const vis = (q) => { const e = card && card.querySelector(q); return e && e.getBoundingClientRect().height > 0 ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
    const b = window.__CRS.ctx.service('session.mission');
    return { cap: vis('.hud-mis__head .hud-cap'), order: vis('.hud-mis__order'), command: b.command ? b.command.text : '', title: b.instruction.title };
  });
  console.log('en-tête :', JSON.stringify(head));
  if (!/^(ORDRE (DU|DE) |ORDRE REÇU|MA MISSION)/.test(head.cap)) { ok = false; console.error('  ✗ titre « ORDRE DU … » ou « MA MISSION »', head.cap); }
  if (head.order === '' || head.order !== (head.command || head.title)) { ok = false; console.error('  ✗ la première ligne est l’ordre', JSON.stringify(head)); }
  console.log('capture : ' + await shot(page, 'ma-mission-crs'));
  // éloigné de son groupe : rappel, GPS sur le chef ; écran bas (disposition compacte)
  await page.evaluate(() => { const c = window.__CRS.ctx; const b = c.service('session.mission'); window.__CRS.teleport(b.chief.x + 70, b.chief.z); });
  await page.waitForTimeout(4000);
  console.log('éloigné : ' + await page.evaluate(() => window.__CRS.ctx.service('session.mission').instruction.title));
  console.log('capture : ' + await shot(page, 'ma-mission-crs-eloigne'));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(3000);
  console.log('capture : ' + await shot(page, 'ma-mission-crs-compact'));
  // téléphone : deux lignes exactement, l'ordre entier sur la première
  const tel = await page.evaluate(() => {
    const card = document.querySelector('.hud-mis');
    if (!card) return null;
    const shown = [...card.children].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.className.split(' ')[0]);
    const l1 = card.querySelector('.hud-mis__l1');
    const b = l1 && l1.querySelector('b');
    const lines = (e) => (e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '16')) : 0);
    return { shown, l1: l1 ? l1.innerText.replace(/\s+/g, ' ') : '', l2: (card.querySelector('.hud-mis__l2')?.innerText || '').replace(/\s+/g, ' '),
      orderCut: !!b && b.scrollWidth > b.clientWidth + 1, rows: [lines(l1), lines(card.querySelector('.hud-mis__l2'))] };
  });
  console.log('téléphone :', JSON.stringify(tel));
  if (!tel || tel.shown.join(',') !== 'hud-mis__l1,hud-mis__l2' && tel.shown.join(',') !== 'hud-mis__l1') { ok = false; console.error('  ✗ téléphone : la carte tient en deux lignes', JSON.stringify(tel)); }
  else if (tel.orderCut || tel.l1 === '') { ok = false; console.error('  ✗ téléphone : l’ordre n’est jamais coupé', JSON.stringify(tel)); }
} catch (err) {
  ok = false;
  console.error(err);
}
await finish({ browser, server, errors, ok, label: 'ma-mission' });
