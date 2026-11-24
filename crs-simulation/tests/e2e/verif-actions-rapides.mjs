// Actions rapides du HUD (bloc d'ordres, ordres directs §1.6) : la ligne d'état, l'ordre prêt, la ligne des touches
// (« A avec moi · U autre unité · F tous les ordres · Tab carte », chaque morceau cliquable), « Secours ici » → Pompiers /
// SAMU à la position du joueur, la carte de commandement d'un clic (« Tab carte »).
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
  // le bloc d'ordres : ligne d'état, ordre prêt, touches, « Secours ici » (touche écrite « F puis 7 »)
  const block = await page.evaluate(() => {
    const b = document.querySelector('[data-id="hud-orders"]');
    if (!b) return null;
    const shown = (id) => { const e = b.querySelector(`[data-id="${id}"]`); return !!e && e.getBoundingClientRect().width > 0 && !e.classList.contains('is-off'); };
    const txt = (id) => { const e = b.querySelector(`[data-id="${id}"]`); return e ? e.innerText.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim() : ''; };
    return {
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      rows: ['hud-state', 'hud-ready', 'hud-keys', 'quick-rescue'].filter(shown),
      state: txt('hud-state'), keys: txt('hud-keys'),
    };
  });
  console.log('bloc d’ordres :', JSON.stringify(block));
  if (!block) fail('bloc d’ordres absent');
  else {
    if (block.rows.length !== 4) fail('quatre rangées : ligne d’état, ordre prêt, touches, Secours ici', block.rows.join(', '));
    if (!/^AVEC VOUS\b/.test(block.state)) fail('ligne d’état « AVEC VOUS · … »', block.state);
    // « A » sur un clavier AZERTY, « Q » sur un QWERTY (la même touche physique, KeyQ)
    if (!/^[AQ] avec moi · U autre unité · F tous les ordres · Tab carte$/.test(block.keys)) fail('ligne des touches', block.keys);
    if (!block.text.includes('Secours ici')) fail('rangée « Secours ici »', block.text);
    if (/Suivez-moi|ORDRES/.test(block.text)) fail('plus de titre « ORDRES » ni de « Suivez-moi … »', block.text);
    if (/\bF \d\b|\bF\d\b/.test(block.text)) fail('touches écrites « F puis 7 », jamais « F 7 » ni « F7 »', block.text);
  }
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
  // « Tab carte » se clique : la carte de commandement s'ouvre
  await page.locator('[data-id="hud-key-map"]').click();
  await new Promise((r) => setTimeout(r, 2500));
  const open = await page.evaluate(() => window.__CRS.ctx.ui.current === 'carte_tactique' && document.querySelector('[data-id="tac-close"]') !== null);
  console.log('carte de commandement ouverte :', open);
  if (!open) fail('« Tab carte » ouvre la carte de commandement');
  await shot(page, 'quick-3-carte');
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'actions-rapides' });
