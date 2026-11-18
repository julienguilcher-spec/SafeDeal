// Mode Patrouille en jeu — carte d'appel de CENTRAL, touche Y, écran radio, compte rendu de vacation.
//   PC (1280 × 720, clavier) : hub → Patrouille → BAC → rythme agité, lancé avec &premier=5 → le joueur est dans une
//     'voiture_bac' ; la carte « hud-appel » paraît en moins de 30 s de jeu ; Y prend l'appel (état 'acceptee', objectif
//     publié) ; Renforts / Fin d'intervention ; pastille au bout de 20 s ; section « Appel en cours » de l'écran radio ;
//     compte rendu « Fin de vacation — BAC 75N » avec ses sept lignes ; aucune erreur de console.
//   Téléphone (844 × 390 en paysage, au doigt) : même parcours au toucher ; la carte ne recouvre ni la mini-carte ni les
//     actions rapides, boutons ≥ 40 px ; images par seconde mesurées.
// Usage : node tests/e2e/verif-patrouille.mjs [--seul=pc|tel]
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const s = a.replace(/^--/, ''); const i = s.indexOf('='); return i < 0 ? [s, '1'] : [s.slice(0, i), s.slice(i + 1)]; }));
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

/** Boîte d'un élément visible (null s'il est absent ou masqué). */
const box = (page, selector) => page.evaluate((sel) => {
  const e = document.querySelector(sel);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  if (b.width <= 0 || b.height <= 0) return null;
  return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom };
}, selector);

const visible = async (page, id) => (await box(page, `[data-id="${id}"]`)) !== null;
const overlap = (a, b) => !!a && !!b && a.x < b.r - 0.5 && a.r > b.x + 0.5 && a.y < b.b - 0.5 && a.b > b.y + 0.5;

/** Appel en cours du répartiteur, vu de la page. */
const current = (page) => page.evaluate(() => {
  const api = window.__CRS.ctx.service('patrol.mode');
  const c = api ? api.current : null;
  return c ? { id: c.id, state: c.state, label: c.label, place: c.place, kind: c.kind } : null;
});

async function hit(page, id, touch) {
  // la carte se replie au bout de 20 s réelles ; au WebGL logiciel (≈ 0,4 s par image), un parcours y suffit, et elle
  // peut se replier entre le relevé et le clic : on la rouvre par la pastille, puis on réessaie
  const loc = page.locator(`[data-id="${id}"]`).first();
  for (let attempt = 0; ; attempt++) {
    if (/^(appel-|renfort-)/.test(id) && await visible(page, 'hud-appel-pastille')) {
      const pill = page.locator('[data-id="hud-appel-pastille"]');
      if (touch) await pill.tap({ noWaitAfter: true });
      else await pill.click({ noWaitAfter: true });
      await frames(page, 3);
    }
    try {
      if (touch) await loc.tap({ timeout: 20000, noWaitAfter: true });
      else await loc.click({ timeout: 20000, noWaitAfter: true });
      break;
    } catch (err) {
      if (attempt >= 2 || !/^(appel-|renfort-)/.test(id)) throw err;
    }
  }
  await frames(page, 3);
}

/** Attend (temps réel) qu'une condition de la page soit vraie ; retourne false au délai. */
async function until(page, expression, timeout) {
  try {
    await waitFor(page, expression, timeout);
    return true;
  } catch {
    return false;
  }
}

async function run(server, size) {
  const touch = size.mobile;
  const tag = size.key;
  console.log(`[patrouille] ${tag}`);
  const { browser, page, errors } = await openPage(`${server.url}?quality=bas&premier=5`, { width: size.width, height: size.height, mobile: touch, pointerLock: false });
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    await frames(page, 4);

    // ── accueil : hub → Patrouille → BAC → rythme agité → « Prendre la vacation » ──
    await hit(page, 'accueil-patrouille', touch);
    await hit(page, 'crew-bac', touch);
    const agite = page.locator('[data-id="patrouille-rythme"] [data-value="agite"]');
    if (touch) await agite.tap();
    else await agite.click();
    await frames(page, 2);
    await hit(page, 'patrouille-lancer', touch);
    await waitFor(page, 'window.__CRS.ctx.ui.current !== "menu_principal"', 60000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 600000);
    await frames(page, 3);
    const start = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const p = c.player.person();
      const car = p && p.vehicleId ? c.vehicles.get(p.vehicleId) : null;
      const v = c.session.config.extra.vacation;
      return { kind: car ? car.kind : '', t: c.clock.now, premier: v ? v.premier : null, callsign: v ? v.depart.callsign : '' };
    });
    check(start.kind === 'voiture_bac', `[${tag}] le joueur est à bord de la voiture banalisée`, start.kind || 'à pied');
    check(start.premier === 5, `[${tag}] premier appel imposé à 5 s (&premier=5)`, String(start.premier));

    // ── la carte d'appel paraît ──
    const shown = await until(page, '!!document.querySelector(\'[data-id="hud-appel"]\') && document.querySelector(\'[data-id="hud-appel"]\').getBoundingClientRect().height > 0 && window.__CRS.ctx.service("patrol.mode").current !== null', 300000);
    const tCard = await page.evaluate(() => window.__CRS.ctx.clock.now);
    check(shown, `[${tag}] carte d'appel « hud-appel » affichée`);
    check(shown && tCard - start.t < 30, `[${tag}] … moins de 30 s de jeu après le départ`, `${(tCard - start.t).toFixed(1)} s`);
    const call = await current(page);
    const card = await page.evaluate(() => ({
      title: document.querySelector('[data-id="appel-titre"]')?.textContent ?? '',
      line: document.querySelector('[data-id="appel-ligne"]')?.textContent ?? '',
    }));
    check(!!call && call.state === 'annonce', `[${tag}] appel annoncé`, call ? `${call.label} — ${call.place}` : 'aucun');
    check(card.title.length > 5 && card.title === card.title.toUpperCase() && /(\d)\s?(m|km)$/.test(card.line) && !/undefined|NaN/.test(card.title + card.line), `[${tag}] carte : titre et ligne`, `${card.title} — ${card.line}`);
    check(await visible(page, 'appel-prendre') && await visible(page, 'appel-decliner'), `[${tag}] « Prendre l'appel » et « Décliner »`);
    await shot(page, `patrouille-appel-${tag}`);

    if (touch) {
      // ── téléphone : compacte, cibles ≥ 40 px, ni sur la mini-carte ni sur les actions rapides ──
      const cardBox = await box(page, '[data-id="hud-appel"]');
      const mini = await box(page, '[data-w="maps.minimap"]');
      const quick = await page.evaluate(() => [...document.querySelectorAll('[data-id="hud-quick"] .cm-btn, [data-id="hud-quick"] .cq-prop')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0).map((b) => ({ x: b.left, y: b.top, r: b.right, b: b.bottom })));
      check(!!cardBox && cardBox.x >= 0 && cardBox.y >= 0 && cardBox.r <= size.width + 0.5 && cardBox.b <= size.height + 0.5, '[tel] carte entièrement dans l\'écran', cardBox ? `${Math.round(cardBox.x)},${Math.round(cardBox.y)} ${Math.round(cardBox.w)}×${Math.round(cardBox.h)}` : 'absente');
      check(!overlap(cardBox, mini), '[tel] la carte ne recouvre pas la mini-carte', mini ? `mini-carte ${Math.round(mini.x)},${Math.round(mini.y)}–${Math.round(mini.r)},${Math.round(mini.b)}` : 'pas de mini-carte');
      check(!quick.some((q) => overlap(cardBox, q)), '[tel] la carte ne recouvre pas les actions rapides', `${quick.length} bouton(s)`);
      // boutons système de la surcouche tactile (en haut à droite ; en véhicule, pastille « Sortir » dessous : 293 × 161)
      const chips = { x: size.width - 293, y: 0, r: size.width, b: 161 };
      check(!overlap(cardBox, chips), '[tel] la carte ne recouvre pas les boutons système en haut à droite');
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-id="hud-appel"] button')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.height < 39.5 || b.width < 39.5);
      }).map((e) => `${e.getAttribute('data-id')} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
      check(small.length === 0, '[tel] boutons de la carte ≥ 40 px', small.join(', '));
      await hit(page, 'appel-prendre', true);
    } else {
      // ── PC : Y prend l'appel ──
      await page.locator('body').focus().catch(() => {});
      await page.keyboard.press('y');
      await frames(page, 3);
    }
    const taken = await until(page, 'window.__CRS.ctx.service("patrol.mode").calls.some((c) => c.state === "acceptee" || c.state === "sur_place")', 20000);
    const after = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const obj = c.service('ui.objectives') ?? null;
      const api = c.service('patrol.mode');
      const mine = api.calls.find((q) => q.state === 'acceptee' || q.state === 'sur_place');
      return { state: mine ? mine.state : '', tracked: obj ? obj.tracked : '', ids: obj ? obj.list.map((o) => o.id) : [] };
    });
    check(taken, `[${tag}] ${touch ? 'toucher « Prendre l\'appel »' : 'Y'} : appel pris`, after.state);
    check(after.ids.includes('patrouille.appel'), `[${tag}] objectif de l'appel publié`, after.ids.join(', '));
    await until(page, '!!document.querySelector(\'[data-id="appel-fin"]\') && document.querySelector(\'[data-id="appel-fin"]\').getBoundingClientRect().height > 0', 10000);
    check(await visible(page, 'appel-renforts') && await visible(page, 'appel-fin') && !(await visible(page, 'appel-prendre')), `[${tag}] carte de l'appel pris : « Renforts » et fin`);
    await hit(page, 'appel-renforts', touch);
    // au téléphone, « Renforts » ouvre l'écran radio (cibles de 44 px) ; au clavier, la carte déplie ses renforts
    const pre = touch ? 'radio-' : '';
    if (!touch && !(await until(page, '!!document.querySelector(\'[data-id="renfort-pompiers"]\') && document.querySelector(\'[data-id="renfort-pompiers"]\').getBoundingClientRect().height > 0', 5000))) {
      // (WebGL logiciel : la carte a pu se replier pendant le clic ; on la rouvre et on redemande)
      console.log('  · renforts non dépliés au premier clic : nouvel essai');
      await hit(page, 'appel-renforts', false);
    }
    if (touch) {
      await frames(page, 4);
      check(await page.evaluate(() => window.__CRS.ctx.ui.current) === 'radio', '[tel] « Renforts » ouvre l\'écran radio');
    }
    const backups = await page.evaluate((p) => ['patrouille', 'compagnie', 'pompiers', 'samu'].map((k) => {
      const e = document.querySelector(`[data-id="${p}renfort-${k}"]`);
      const b = e ? e.getBoundingClientRect() : null;
      return { k, shown: !!b && b.height > 0, disabled: !!e && e.disabled };
    }), pre);
    check(backups.filter((b) => b.k !== 'compagnie').every((b) => b.shown && !b.disabled), `[${tag}] renforts proposés : patrouille, pompiers, SAMU`, JSON.stringify(backups));
    await shot(page, `patrouille-renforts-${tag}`);
    await hit(page, pre + 'renfort-samu', touch);
    const samu = await page.evaluate(() => window.__CRS.ctx.service('patrol.mode').current?.backup ?? []);
    check(samu.includes('samu'), `[${tag}] « SAMU » : renfort demandé au répartiteur`, samu.join(', '));
    if (touch) {
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-id="radio-appel"] button')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.height < 39.5;
      }).map((e) => e.getAttribute('data-id')));
      check(small.length === 0, '[tel] radio : boutons de l\'appel ≥ 40 px', small.join(', '));
      const inside = await page.evaluate(() => {
        const r = document.querySelector('[data-id="radio-appel-fin"]')?.getBoundingClientRect();
        return !!r && r.height > 0 && r.bottom <= innerHeight + 0.5;
      });
      check(inside, '[tel] radio : « Fin d\'intervention » atteignable');
      await shot(page, 'patrouille-radio-tel');
      await hit(page, 'radio-close', true);
      check(await page.evaluate(() => window.__CRS.ctx.ui.current) === null, '[tel] « Fermer » referme la radio');
    }

    if (!touch) {
      // ── écran radio : section « Appel en cours » (chemin manette et clavier) ──
      await page.keyboard.press('y');
      await frames(page, 4);
      const radio = await page.evaluate(() => window.__CRS.ctx.ui.current);
      check(radio === 'radio', '[pc] Y (appel déjà pris) ouvre l\'écran radio', String(radio));
      check(await visible(page, 'radio-appel') && await visible(page, 'radio-appel-fin') && await visible(page, 'radio-renfort-pompiers'), '[pc] radio : « Appel en cours » avec renforts et fin');
      const focus = await page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? '');
      check(focus.startsWith('radio-renfort-') || focus === 'radio-appel-fin', '[pc] radio : le focus est sur l\'appel', focus);
      await shot(page, 'patrouille-radio-pc');
      await page.keyboard.press('Escape');
      await frames(page, 4);
      check(await page.evaluate(() => window.__CRS.ctx.ui.current) === null, '[pc] Échap referme la radio');

      // ── pastille au bout de 20 s sans changement ──
      const pill = await until(page, '!!document.querySelector(\'[data-id="hud-appel-pastille"]\') && document.querySelector(\'[data-id="hud-appel-pastille"]\').getBoundingClientRect().height > 0', 90000);
      check(pill, '[pc] la carte se replie en pastille « Appel en cours »');
      check(!(await visible(page, 'hud-appel')), '[pc] carte repliée');
      if (pill) {
        await hit(page, 'hud-appel-pastille', false);
        check(await visible(page, 'hud-appel'), '[pc] un clic sur la pastille rouvre la carte');
      }

      // ── fin de vacation forcée : compte rendu ──
      await page.evaluate(() => window.__CRS.ctx.session.end(true));
      await until(page, 'window.__CRS.ctx.ui.current === "debrief"', 60000);
      const debrief = await page.evaluate(() => ({
        title: document.querySelector('.ui-debrief .ui-title')?.textContent ?? '',
        kicker: document.querySelector('.ui-debrief .ui-kicker')?.textContent ?? '',
        lines: document.querySelectorAll('[data-id="debrief-vacation"] .ui-line').length,
        text: document.querySelector('[data-id="debrief-vacation"]')?.textContent ?? '',
        calls: document.querySelectorAll('[data-id="debrief-appels"] .ui-line').length,
      }));
      check(debrief.title === `Fin de vacation — ${start.callsign}`, '[pc] compte rendu : « Fin de vacation — <indicatif> »', debrief.title);
      check(debrief.kicker === 'Compte rendu de vacation', '[pc] compte rendu de vacation', debrief.kicker);
      check(debrief.lines === 7 && !/NaN|undefined/.test(debrief.text), '[pc] bilan : sept lignes', `${debrief.lines} ligne(s)`);
      check(debrief.calls >= 1, '[pc] liste des appels de la vacation', `${debrief.calls}`);
      await shot(page, 'patrouille-compte-rendu-pc');
    } else {
      // ── images par seconde au téléphone, en vacation ──
      const fps = await page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 >= 5000) resolve((n * 1000) / (performance.now() - t0));
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }));
      console.log(`  · images par seconde (téléphone, WebGL logiciel) : ${fps.toFixed(1)}`);
      check(fps > 0, '[tel] images par seconde mesurées', fps.toFixed(1));
    }
    check(errors.length === 0, `[${tag}] aucune erreur dans la console`, errors.slice(0, 3).join(' | '));
  } catch (err) {
    ok = false;
    console.error(`[patrouille] ${tag} : exception`, err);
    await shot(page, `patrouille-echec-${tag}`).catch(() => {});
  }
  for (const e of errors) console.error('  erreur page : ' + e);
  await browser.close();
}

const server = await startServer();
const SIZES = [
  { key: 'pc', width: 1280, height: 720, mobile: false },
  { key: 'tel', width: 844, height: 390, mobile: true },
];
for (const size of SIZES) {
  if (args.seul && args.seul !== size.key) continue;
  await run(server, size);
}
await finish({ server, ok, label: 'patrouille' });
