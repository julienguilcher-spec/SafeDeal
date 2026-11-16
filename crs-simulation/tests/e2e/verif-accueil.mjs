// Testeur indépendant — page d'accueil : chaque rubrique, « Surprends-moi », inventaire des éléments.
import { startServer, openPage, waitFor, frames, snap, log, J } from './verif-lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 720 });
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await snap(page, 'verif-accueil-0');
  const inventory = () => page.evaluate(() => [...document.querySelectorAll('[data-id]')].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }).map((e) => `${e.getAttribute('data-id')}<${e.tagName.toLowerCase()}>${(e.textContent || '').trim().slice(0, 30).replace(/\s+/g, ' ')}`));
  log('ELEMENTS ACCUEIL', J(await inventory()));
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-id^="tab-"]')].map((e) => e.getAttribute('data-id')));
  log('ONGLETS', J(tabs));
  for (const t of tabs) {
    await page.locator(`[data-id="${t}"]`).first().click();
    await frames(page, 2);
    await page.waitForTimeout(200);
    await snap(page, 'verif-accueil-' + t);
    log('  ' + t, J(await inventory()));
    // dépassements : éléments visibles qui sortent de la fenêtre ou texte tronqué
    const overflow = await page.evaluate(() => {
      const out = [];
      const W = innerWidth, H = innerHeight;
      for (const e of document.querySelectorAll('button, .ui-list__item, label, h1, h2, h3')) {
        const b = e.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') out.push('tronqué: ' + (e.textContent || '').trim().slice(0, 40));
      }
      return out.slice(0, 20);
    });
    if (overflow.length) log('    débordements', J(overflow));
  }
  // brouillon courant
  const draft = () => page.evaluate(() => {
    const s = document.querySelector('.ui-home__summary, [data-id="resume"], .home-summary');
    return s ? (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600) : null;
  });
  log('RESUME', await draft());
  // Surprends-moi : cinq tirages
  const hasard = await page.evaluate(() => {
    const e = [...document.querySelectorAll('button')].find((b) => /surprends/i.test(b.textContent || ''));
    return e ? e.getAttribute('data-id') : null;
  });
  log('BOUTON SURPRENDS-MOI', hasard);
  if (hasard) {
    for (let i = 0; i < 5; i++) {
      await page.locator(`[data-id="${hasard}"]`).first().click();
      await frames(page, 2);
      await page.waitForTimeout(150);
      log('  tirage', i, await draft());
      if (i < 2) await snap(page, 'verif-accueil-hasard-' + i);
    }
  }
} catch (e) {
  console.error('EXCEPTION', e);
  try { await snap(page, 'verif-accueil-echec'); } catch {}
}
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 10)));
await browser.close();
await server.close();
process.exit(0);
