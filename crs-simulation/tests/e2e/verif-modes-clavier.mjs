// Accueil en quatre modes et vacation de patrouille AU CLAVIER SEUL (MacBook sans souris), en 1280 × 800.
//   - hub : focus initial sur « Patrouille », flèches entre les tuiles, Entrée ouvre, Échap revient ;
//   - Missions spéciales : Entrée sur un poste puis une mission ouvre la fiche, Échap revient jusqu'au hub ;
//   - Mode libre : l'éditeur s'ouvre, « Lancer » est atteignable à la tabulation, Échap revient au hub ;
//   - Patrouille : Tab jusqu'au rythme « Agité », Entrée, Tab jusqu'à « Prendre la vacation », Entrée ;
//   - en jeu : le joueur est au volant de la voiture banalisée et la fait avancer aux flèches ; la carte d'appel paraît,
//     Y prend l'appel, l'objectif est publié ; aucune erreur de console.
// Aucun clic, aucun toucher : seulement page.keyboard. Usage : node tests/e2e/verif-modes-clavier.mjs
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
const view = (page) => page.evaluate(() => document.querySelector('.ui-home')?.dataset.view ?? '');
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? '');
const press = async (page, key) => {
  await page.keyboard.press(key);
  await frames(page, 2);
};

/** Tabule (au plus `max` fois) jusqu'à ce que l'élément focalisé corresponde au sélecteur ; vrai si atteint. */
async function tabTo(page, selector, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((sel) => !!document.activeElement && document.activeElement.matches(sel), selector)) return true;
    await page.keyboard.press('Tab');
    await frames(page, 1);
  }
  return page.evaluate((sel) => !!document.activeElement && document.activeElement.matches(sel), selector);
}

async function until(page, expression, timeout) {
  try {
    await waitFor(page, expression, timeout);
    return true;
  } catch {
    return false;
  }
}

const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas&premier=5`, { width: 1280, height: 800, pointerLock: false });
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await frames(page, 4);

  // ── hub ──
  check(await view(page) === 'hub', 'l’accueil s’ouvre sur le hub', await view(page));
  check(await focused(page) === 'accueil-patrouille', 'focus initial sur la tuile « Patrouille »', await focused(page));
  await shot(page, 'clavier-hub');
  await press(page, 'ArrowRight');
  check(await focused(page) === 'accueil-carriere', 'flèche droite : « Carrière »', await focused(page));
  await press(page, 'ArrowRight');
  check(await focused(page) === 'accueil-missions', 'flèche droite : « Missions spéciales »', await focused(page));

  // ── Missions spéciales ──
  await press(page, 'Enter');
  await frames(page, 3);
  check(await view(page) === 'missions', 'Entrée ouvre les Missions spéciales', await view(page));
  const reached = await tabTo(page, '[data-id^="spec-"]', 60);
  check(reached, 'Tab atteint la liste des missions', await focused(page));
  const specId = await focused(page);
  await press(page, 'Enter');
  await frames(page, 3);
  const card = await page.evaluate(() => {
    const b = document.querySelector('[data-id="briefing-lancer"]');
    const r = b ? b.getBoundingClientRect() : null;
    return { lancer: !!r && r.height > 0, text: document.querySelector('.ui-home')?.innerText.slice(0, 2000) ?? '' };
  });
  check(card.lancer, `Entrée sur ${specId} : fiche avec « Lancer la mission »`);
  check(/ce qu.on attend de vous/i.test(card.text), 'fiche : « Ce qu’on attend de vous »');
  check(!/undefined|NaN|\bnull\b/.test(card.text), 'fiche : aucun « undefined », « NaN » ni « null »');
  await shot(page, 'clavier-missions-fiche');
  for (let i = 0; i < 3 && (await view(page)) !== 'hub'; i++) await press(page, 'Escape');
  check(await view(page) === 'hub', 'Échap revient au hub depuis les Missions spéciales', await view(page));
  check(await focused(page) === 'accueil-missions', 'retour : focus sur la tuile quittée', await focused(page));

  // ── Mode libre ──
  await press(page, 'ArrowRight');
  check(await focused(page) === 'accueil-libre', 'flèche droite : « Mode libre »', await focused(page));
  await press(page, 'Enter');
  await frames(page, 3);
  check(await view(page) === 'libre', 'Entrée ouvre le Mode libre', await view(page));
  check(await tabTo(page, '[data-id="lancer"]', 120), 'Tab atteint « Lancer » dans l’éditeur');
  await shot(page, 'clavier-libre');
  for (let i = 0; i < 4 && (await view(page)) !== 'hub'; i++) await press(page, 'Escape');
  check(await view(page) === 'hub', 'Échap revient au hub depuis le Mode libre', await view(page));

  // ── Patrouille ──
  for (let i = 0; i < 4 && (await focused(page)) !== 'accueil-patrouille'; i++) await press(page, 'ArrowLeft');
  check(await focused(page) === 'accueil-patrouille', 'flèches : retour sur « Patrouille »', await focused(page));
  await press(page, 'Enter');
  await frames(page, 3);
  check(await view(page) === 'patrouille', 'Entrée ouvre la vue Patrouille', await view(page));
  check(await tabTo(page, '[data-id="crew-bac"]', 40), 'Tab atteint l’équipage BAC');
  await press(page, 'Enter');
  check(await tabTo(page, '[data-id="patrouille-rythme"] [data-value="agite"]', 80), 'Tab atteint le rythme « Agité »');
  await press(page, 'Enter');
  const agite = await page.evaluate(() => document.querySelector('[data-id="patrouille-rythme"] [data-value="agite"]')?.getAttribute('aria-checked'));
  check(agite === 'true', 'Entrée choisit le rythme « Agité »', String(agite));
  check(await tabTo(page, '[data-id="patrouille-lancer"]', 120), 'Tab atteint « Prendre la vacation »');
  const lancer = await page.evaluate(() => {
    const r = document.querySelector('[data-id="patrouille-lancer"]').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: innerHeight };
  });
  check(lancer.bottom <= lancer.h + 0.5 && lancer.top >= 0, '« Prendre la vacation » visible à l’écran', JSON.stringify(lancer));
  await shot(page, 'clavier-patrouille');
  await press(page, 'Enter');
  await waitFor(page, 'window.__CRS.ctx.ui.current !== "menu_principal"', 60000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 600000);
  await frames(page, 3);

  // ── en jeu ──
  const start = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const p = c.player.person();
    const car = p && p.vehicleId ? c.vehicles.get(p.vehicleId) : null;
    const v = c.session.config.extra.vacation;
    return {
      kind: car ? car.kind : '', seat: p ? p.seat : -1, driver: !!car && car.seats[0] === p.id,
      rythme: v ? v.rythme : '', callsign: v ? v.depart.callsign : '', x: car ? car.x : 0, z: car ? car.z : 0,
    };
  });
  check(start.kind === 'voiture_bac', 'le joueur est à bord de la voiture banalisée', start.kind || 'à pied');
  check(start.driver, 'le joueur est au volant', `siège ${start.seat}`);
  check(start.rythme === 'agite', 'vacation au rythme « Agité »', start.rythme);
  await shot(page, 'clavier-en-voiture');

  // conduite aux flèches (sans souris)
  await page.locator('body').focus().catch(() => {});
  await page.keyboard.down('ArrowUp');
  await frames(page, 25);
  await page.keyboard.up('ArrowUp');
  const moved = await page.evaluate((s) => {
    const c = window.__CRS.ctx;
    const p = c.player.person();
    const car = p && p.vehicleId ? c.vehicles.get(p.vehicleId) : null;
    return car ? Math.hypot(car.x - s.x, car.z - s.z) : 0;
  }, start);
  check(moved > 0.5, 'flèche haut : la voiture avance', `${moved.toFixed(1)} m`);

  // carte d'appel, Y
  const shown = await until(page, '!!document.querySelector(\'[data-id="hud-appel"]\') && document.querySelector(\'[data-id="hud-appel"]\').getBoundingClientRect().height > 0', 300000);
  check(shown, 'carte d’appel affichée');
  const cardText = await page.evaluate(() => document.querySelector('[data-id="hud-appel"]')?.innerText ?? '');
  check(/Y/.test(cardText) && !/undefined|NaN/.test(cardText), 'carte : touche Y indiquée, texte propre', cardText.replace(/\n+/g, ' | ').slice(0, 200));
  await shot(page, 'clavier-appel');
  await page.keyboard.press('y');
  await frames(page, 3);
  const taken = await until(page, 'window.__CRS.ctx.service("patrol.mode").calls.some((c) => c.state === "acceptee" || c.state === "sur_place")', 20000);
  check(taken, 'Y : appel pris');
  const ids = await page.evaluate(() => window.__CRS.ctx.service('ui.objectives')?.list.map((o) => o.id) ?? []);
  check(ids.includes('patrouille.appel'), 'objectif GPS de l’appel publié', ids.join(', '));
  await frames(page, 3);
  await shot(page, 'clavier-appel-pris');
  check(errors.length === 0, 'aucune erreur dans la console', errors.slice(0, 3).join(' | '));
} catch (err) {
  ok = false;
  console.error('[modes-clavier] exception', err);
  await shot(page, 'clavier-echec').catch(() => {});
}
for (const e of errors) console.error('  erreur page : ' + e);
await browser.close();
await finish({ server, ok, label: 'modes-clavier' });
