// Mode libre de l'accueil en quatre modes : nom de la manifestation, organisateurs, curseur « Imprévu », lieu tiré au
// hasard, point de départ des colonnes et aperçu des colonnes — au CLAVIER SEUL en 1280 × 800 (MacBook sans souris),
// puis au DOIGT en 844 × 390 (téléphone en paysage). On lance ensuite la partie et on vérifie que la session reçoit
// bien chaque réglage (extra) et que CENTRAL annonce la manifestation par son nom.
// Usage : node tests/e2e/verif-modes-libre.mjs
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

let ok = true;
const check = (cond, label, detail = '') => {
  if (!cond) ok = false;
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? ' — ' + detail : ''}`);
};
const frames = (page, n = 3) => page.evaluate((count) => new Promise((resolve) => {
  let k = 0;
  const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? '');
async function tabTo(page, selector, max = 120) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((sel) => !!document.activeElement && document.activeElement.matches(sel), selector)) return true;
    await page.keyboard.press('Tab');
    await frames(page, 1);
  }
  return page.evaluate((sel) => !!document.activeElement && document.activeElement.matches(sel), selector);
}
/** Aucun élément visible ne dépasse de l'écran ; aucune data-id en double. */
const layout = (page) => page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  const over = [];
  for (const e of document.querySelectorAll('.ui-home [data-id]')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden') continue;
    // (bandeau défilant à l'horizontale : onglets du téléphone)
    let clipped = false;
    for (let a = e.parentElement; a && !clipped; a = a.parentElement) clipped = /auto|scroll/.test(getComputedStyle(a).overflowX);
    if (clipped) continue;
    if (r.right > W + 1 || r.left < -1) over.push(e.getAttribute('data-id'));
  }
  const ids = [...document.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  return { over: over.slice(0, 8), dup: [...new Set(dup)].slice(0, 8), scrollX: document.documentElement.scrollWidth - W };
});

const server = await startServer();
const allErrors = [];
let browser = null;
try {
  for (const vp of [{ key: 'pc', width: 1280, height: 800, mobile: false }, { key: 'tel', width: 844, height: 390, mobile: true }]) {
    console.log(`[modes-libre] ${vp.key}`);
    const opened = await openPage(`${server.url}?quality=bas`, { width: vp.width, height: vp.height, mobile: vp.mobile, pointerLock: false });
    browser = opened.browser;
    const { page, errors } = opened;
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    await frames(page, 4);
    const tap = async (id) => {
      const el = page.locator(`[data-id="${id}"]`);
      await el.scrollIntoViewIfNeeded();
      if (vp.mobile) await el.tap();
      else {
        await el.focus();
        await page.keyboard.press('Enter');
      }
      await frames(page, 2);
    };

    // hub → Mode libre (clavier : flèches puis Entrée ; téléphone : toucher)
    if (vp.mobile) await tap('accueil-libre');
    else {
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      await frames(page, 2);
      check(await focused(page) === 'accueil-libre', `[${vp.key}] flèches jusqu'à « Mode libre »`, await focused(page));
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector('[data-id="lancer"]', { timeout: 60000 });
    await tap('tab-foule');
    // nom de la manifestation : proposition, puis saisie au clavier
    await tap('manif-nom-proposer');
    const proposed = await page.inputValue('[data-id="manif-nom"]');
    check(proposed.length > 5 && !/undefined|null/.test(proposed), `[${vp.key}] nom proposé`, proposed);
    await page.locator('[data-id="manif-nom"]').fill('');
    await page.locator('[data-id="manif-nom"]').focus();
    await page.keyboard.type('Marche pour les services publics');
    await page.keyboard.press('Tab');
    await frames(page, 2);
    await tap('org-aucun');
    check(await page.getAttribute('[data-id="org-aucun"]', 'aria-pressed') === 'true', `[${vp.key}] organisateurs : « Sans organisateur »`);
    // curseur Imprévu au clavier : flèche droite jusqu'au cran 3 (« Imprévisible »)
    const imp = page.locator('[data-id="imprevu"]');
    await imp.scrollIntoViewIfNeeded();
    await imp.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await frames(page, 2);
    const impText = await page.evaluate(() => document.querySelector('[data-id="imprevu"]')?.closest('.ui-field')?.innerText ?? document.querySelector('[data-id="imprevu"]')?.parentElement?.innerText ?? '');
    check(/Imprévisible/.test(impText), `[${vp.key}] curseur « Imprévu » au cran « Imprévisible »`, impText.replace(/\s+/g, ' ').slice(0, 160));
    const hasard = page.locator('[data-id="lieu-hasard"]');
    await hasard.scrollIntoViewIfNeeded();
    if (vp.mobile) await hasard.tap();
    else {
      await hasard.focus();
      await page.keyboard.press('Space');
    }
    await frames(page, 2);
    const draftFoule = await page.evaluate(() => document.querySelector('.ui-home__summary')?.innerText ?? '');
    check(/Lieu tiré au hasard/.test(draftFoule), `[${vp.key}] résumé : « Lieu tiré au hasard »`);
    check(/« Marche pour les services publics »/.test(draftFoule) && /sans organisateur/.test(draftFoule), `[${vp.key}] résumé : nom et organisateurs de la manifestation`);
    check(/imprévu : imprévisible/.test(draftFoule), `[${vp.key}] résumé : cran d'imprévu`);
    let lay = await layout(page);
    check(lay.over.length === 0 && lay.scrollX <= 1, `[${vp.key}] onglet Manifestation sans débordement`, JSON.stringify(lay));
    check(lay.dup.length === 0, `[${vp.key}] aucune data-id en double`, lay.dup.join(', '));
    await shot(page, `modes-libre-foule-${vp.key}`);

    // moyens : point de départ des colonnes et aperçu
    await tap('tab-moyens');
    await tap('colonne-depart-arr-9');
    check(await page.getAttribute('[data-id="colonne-depart-arr-9"]', 'aria-pressed') === 'true', `[${vp.key}] départ des colonnes : commissariat du 9e`);
    const cols = await page.evaluate(() => document.querySelector('[data-id="colonnes"]')?.innerText ?? '');
    check(/9e/.test(cols) && cols.trim().length > 10, `[${vp.key}] aperçu des colonnes depuis le 9e`, cols.replace(/\s+/g, ' ').slice(0, 200));
    lay = await layout(page);
    check(lay.over.length === 0 && lay.scrollX <= 1, `[${vp.key}] onglet Moyens sans débordement`, JSON.stringify(lay));
    await shot(page, `modes-libre-moyens-${vp.key}`);

    if (vp.key === 'pc') {
      // « Lancer » au clavier
      const reached = await tabTo(page, '[data-id="lancer"]');
      check(reached, '[pc] Tab atteint « Lancer »');
      await page.keyboard.press('Enter');
      await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 600000);
      const cfg = await page.evaluate(() => {
        const c = window.__CRS.ctx.session.config;
        return { place: c.place, mode: c.mode, extra: { nom: c.extra['manif.nom'], org: c.extra['manif.organisateurs'], imprevus: c.extra.imprevus, foyers: c.extra.foyers, hasard: c.extra['lieu.hasard'], depart: c.extra.depart, base: c.extra.base?.name, sono: c.extra['crowd.sono'] } };
      });
      check(cfg.mode === 'libre', '[pc] partie en Mode libre', cfg.mode);
      check(cfg.extra.nom === 'Marche pour les services publics', '[pc] nom transmis à la session', cfg.extra.nom);
      check(cfg.extra.org === 'aucun' && cfg.extra.sono === false, '[pc] sans organisateur : pas de sono');
      check(cfg.extra.imprevus && cfg.extra.imprevus.sauvages === 2 && cfg.extra.foyers === 5, '[pc] imprévu « Imprévisible » transmis', JSON.stringify(cfg.extra));
      check(cfg.extra.hasard === true && cfg.place !== '', '[pc] lieu tiré au hasard', cfg.place);
      check(/9e/.test(cfg.extra.base ?? ''), '[pc] journée de service au commissariat du 9e', cfg.extra.base);
      await waitFor(page, 'window.__CRS.ctx.radio.log.some((m) => m.text.includes("Marche pour les services publics"))', 240000).catch(() => {});
      const said = await page.evaluate(() => window.__CRS.ctx.radio.log.find((m) => m.text.includes('Marche pour les services publics'))?.text ?? '');
      check(said !== '', '[pc] CENTRAL annonce la manifestation par son nom', said);
      await shot(page, 'modes-libre-en-jeu-pc');
    }
    allErrors.push(...errors);
    check(errors.length === 0, `[${vp.key}] aucune erreur dans la console`, errors.slice(0, 3).join(' | '));
    await browser.close();
    browser = null;
  }
} catch (err) {
  ok = false;
  console.error(err);
}
await finish({ browser, server, errors: allErrors, ok, label: 'modes-libre' });
