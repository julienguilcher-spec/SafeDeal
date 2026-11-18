// Commandant : la proposition de l'adjoint s'affiche au HUD sous un titre simple (« L'ADJOINT PROPOSE » + ce qu'elle
// fait, sans indicatif radio) ; P l'accepte et la fait exécuter (mise en place du dispositif) ; Maj + P la remet à plus tard.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=150', { width: 1280, height: 720 });
let ok = true;
const fail = (msg, detail = '') => {
  ok = false;
  console.error('  ✗ ' + msg + (detail ? ' — ' + detail : ''));
};
const shownProposal = () => page.evaluate(() => {
  const e = document.querySelector('[data-id="hud-proposal"]');
  return !!e && !e.classList.contains('is-off') && e.getBoundingClientRect().width > 0;
});
const pending = () => page.evaluate(() => window.__CRS.ctx.service('police.command').proposals.map((p) => p.id));
/** Touche tenue deux images (le jeu lit le clavier une fois par image). */
async function press(code, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down(code);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.keyboard.up(code);
  if (shift) await page.keyboard.up('Shift');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.__CRS.step(5));
    await new Promise((r) => setTimeout(r, 700));
    if (await shownProposal()) break;
  }
  const text = await page.locator('[data-id="hud-proposal"]').innerText();
  console.log('proposition :', JSON.stringify(text));
  await shot(page, 'proposition-1');
  // (fenêtre de 720 px de haut, sous 760 px : la carte se réduit à une ligne « L'adjoint propose : … [Accepter P] », §6.1)
  if (!/L.ADJOINT PROPOSE/i.test(text)) fail('titre « L’ADJOINT PROPOSE »', text);
  if (!/Accepter/.test(text) || !/\bP\b/.test(text)) fail('bouton « Accepter P »', text);
  if (/QUATRE-ZÉRO|PARLEZ|TERMINÉ/.test(text)) fail('titre en clair, sans la phrase radio', text);
  const before = await page.evaluate(() => window.__CRS.ctx.service('police.command').decisions.length);
  const ids0 = await pending();
  // P : accepter (touche globale, sans ouvrir la carte)
  await press('KeyP');
  await page.evaluate(() => window.__CRS.step(3));
  const after = await page.evaluate(() => window.__CRS.ctx.service('police.command').decisions.slice(-3).map((d) => d.key + ': ' + d.text.slice(0, 80)));
  const nAfter = await page.evaluate(() => window.__CRS.ctx.service('police.command').decisions.length);
  console.log('décisions', before, '→', nAfter, JSON.stringify(after, null, 1));
  if (!(nAfter > before)) fail('P : la proposition acceptée est exécutée (une décision de plus)');
  const ids0b = await pending();
  if (ids0.length > 0 && ids0.every((id) => ids0b.includes(id))) fail('P : la proposition acceptée n’est plus en attente', `${JSON.stringify(ids0)} → ${JSON.stringify(ids0b)}`);
  await shot(page, 'proposition-2');
  // Maj + P : la suivante est remise à plus tard
  for (let i = 0; i < 12 && !(await shownProposal()); i++) {
    await page.evaluate(() => window.__CRS.step(5));
    await new Promise((r) => setTimeout(r, 500));
  }
  if (await shownProposal()) {
    const ids1 = await pending();
    const t1 = await page.locator('[data-id="hud-proposal"]').innerText();
    await press('KeyP', true);
    await page.evaluate(() => window.__CRS.step(0.5));
    const ids2 = await pending();
    console.log('Maj + P sur', JSON.stringify(t1), ':', JSON.stringify(ids1), '→', JSON.stringify(ids2));
    if (ids1.length > 0 && ids1.every((id) => ids2.includes(id))) fail('Maj + P : la proposition est remise à plus tard');
  } else console.log('  · pas de seconde proposition en 60 s : Maj + P non vérifié');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'propositions' });
