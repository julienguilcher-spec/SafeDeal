// Carte de commandement — « Négocier un parcours (liaison) » au CLAVIER SEUL (scénario navigateur).
// Ordinateur 1280 × 800, commandant à la place de la Concorde : Tab, N (la visée va sur la foule), 0 (« Autres ordres
// ici… ») : la première ligne est « Négocier un parcours (liaison) » ; 1 puis Entrée : l'équipe de liaison est au
// contact des organisateurs (directeur de la foule), un message radio part, aucune unité ne reçoit d'ordre, et la ligne
// disparaît de la fiche. Capture commande-liaison-1280x800.png dans tests/e2e/out.
// Usage : node tests/e2e/verif-commande-liaison.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, tactical } from './verif-fin-lib.mjs';

const tag = 'verif-commande-liaison';
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 800, pointerLock: false });

async function press(code) {
  await page.keyboard.down(code);
  await frames(page, 2);
  await page.keyboard.up(code);
  await frames(page, 3);
}

try {
  const q = new URLSearchParams({
    autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
    quality: 'bas', seed: '7', time: '12', weather: 'clair',
  });
  await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 3);
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__lia = [];
    core.issue = (...a) => { window.__lia.push(String(a[0])); return orig(...a); };
  });
  C.check(await page.evaluate(() => window.__CRS.ctx.director.liaison === false), 'au départ, l’équipe de liaison n’est pas au contact');

  await press('Tab');
  await page.waitForTimeout(500);
  await frames(page, 4);
  await press('KeyN');
  await step(page, 0.3);
  let t = await tactical(page);
  C.check(t && t.kind === 'foule', `N : la visée est sur une foule (${t && t.visee})`);
  await press('Digit0');
  await step(page, 0.2);
  t = await tactical(page);
  C.check(t && t.lines[0] === 'Négocier un parcours (liaison)', '« Autres ordres ici… » commence par « Négocier un parcours (liaison) »', JSON.stringify(t && t.lines));
  await press('Digit1');
  await step(page, 0.2);
  await snap(page, 'commande-liaison-1280x800');
  await page.waitForTimeout(700);
  await press('Enter');
  await step(page, 0.5);
  const after = await page.evaluate(() => ({
    liaison: window.__CRS.ctx.director.liaison,
    radio: window.__CRS.ctx.radio.log.slice(-6).map((m) => m.text),
    issued: window.__lia.slice(),
  }));
  t = await tactical(page);
  C.check(after.liaison === true, 'Entrée : l’équipe de liaison est au contact des organisateurs');
  C.check(after.radio.some((x) => /LIAISON ICI/.test(x) && /organisateurs/.test(x)), 'un message radio part vers la liaison', after.radio.join(' | '));
  C.check(after.issued.length === 0, 'aucune unité ne reçoit d’ordre', after.issued.join(','));
  C.check(t && /liaison/i.test(t.sent || ''), `« ✓ ORDRE DONNÉ » le dit (${t && t.sent})`);
  // la ligne n'est plus proposée
  await press('Escape');
  await press('KeyN');
  await step(page, 0.3);
  await press('Digit0');
  await step(page, 0.2);
  t = await tactical(page);
  C.check(t && !t.lines.includes('Négocier un parcours (liaison)'), 'la ligne n’est plus proposée une fois la liaison au contact', JSON.stringify(t && t.lines));
} catch (e) {
  C.check(false, 'scénario interrompu', e && e.stack ? e.stack : String(e));
} finally {
  C.check(errors.length === 0, 'aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  C.done();
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
