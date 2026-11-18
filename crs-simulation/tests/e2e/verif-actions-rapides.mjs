// Actions rapides du HUD : le bloc titré « ORDRES » (« Suivez-moi à pied », « Suivez-moi en véhicules », « Secours ici »,
// « Carte de commandement »), « Secours ici » → Pompiers / SAMU à la position du joueur, la carte de commandement d'un clic.
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'index.html?autostart=paris&mode=libre&quality=bas&nomenu=1&role=commandant&rank=commandant&crowd=100', { width: 1280, height: 720 });
let ok = true;
const fail = (msg, detail = '') => {
  ok = false;
  console.error('  ✗ ' + msg + (detail ? ' — ' + detail : ''));
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  await page.evaluate(() => window.__CRS.step(10));
  await new Promise((r) => setTimeout(r, 2000));
  // le bloc « ORDRES » : titre, quatre rangées, touches écrites « F puis 1 »
  const block = await page.evaluate(() => {
    const b = document.querySelector('[data-id="hud-orders"]');
    if (!b) return null;
    const shown = (id) => { const e = b.querySelector(`[data-id="${id}"]`); return !!e && e.getBoundingClientRect().width > 0 && !e.classList.contains('is-off'); };
    return {
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      rows: ['quick-follow-foot', 'quick-follow-column', 'quick-rescue', 'quick-map'].filter(shown),
    };
  });
  console.log('bloc ORDRES :', JSON.stringify(block));
  if (!block) fail('bloc « ORDRES » absent');
  else {
    if (!/ORDRES/.test(block.text)) fail('le bloc est titré « ORDRES »', block.text);
    if (block.rows.length !== 4) fail('quatre rangées : Suivez-moi à pied, Suivez-moi en véhicules, Secours ici, Carte de commandement', block.rows.join(', '));
    for (const w of ['Suivez-moi à pied', 'Suivez-moi en véhicules', 'Secours ici']) if (!block.text.includes(w)) fail(`rangée « ${w} »`, block.text);
    if (/\bF \d\b|\bF\d\b/.test(block.text)) fail('touches écrites « F puis 1 », jamais « F 1 » ni « F1 »', block.text);
  }
  const label = await page.locator('[data-id="quick-map"]').innerText();
  console.log('bouton carte :', JSON.stringify(label));
  if (!label.includes('Carte de commandement')) fail('bouton « Carte de commandement »', label);
  await shot(page, 'quick-1-hud');
  await page.locator('[data-id="quick-rescue"]').click();
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, 'quick-2-secours');
  const calls0 = await page.evaluate(() => window.__CRS.ctx.service('rescue.dispatch')?.calls?.length ?? -1);
  await page.locator('[data-id="quick-pompiers"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const after = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const me = c.player.person();
    const calls = c.service('rescue.dispatch')?.calls ?? [];
    const last = calls[calls.length - 1];
    return { n: calls.length, kind: last && last.kind, d: last && me ? Math.round(Math.hypot(last.x - me.x, last.z - me.z)) : -1, radio: c.radio.log.slice(-1)[0]?.text };
  });
  console.log('appels secours', calls0, '→', after.n, '| dernier :', after.kind, `à ${after.d} m du joueur`, '| radio :', after.radio);
  if (!(after.n > calls0)) fail('« Pompiers ici » : un appel part');
  else if (!(after.d >= 0 && after.d <= 40)) fail('« Pompiers ici » : à la position du joueur', `${after.d} m`);
  await page.locator('[data-id="quick-map"]').click();
  await new Promise((r) => setTimeout(r, 2500));
  const open = await page.evaluate(() => window.__CRS.ctx.ui.current === 'carte_tactique' && document.querySelector('[data-id="tac-close"]') !== null);
  console.log('carte de commandement ouverte :', open);
  if (!open) fail('« Carte de commandement » ouvre la carte');
  await shot(page, 'quick-3-carte');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'actions-rapides' });
