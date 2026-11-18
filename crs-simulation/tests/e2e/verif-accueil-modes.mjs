// Page d'accueil en quatre modes — PC (1280 × 720, clavier et souris) puis téléphone (844 × 390 en paysage, au doigt).
//   - hub : quatre tuiles, sans défilement ni débordement, focus initial sur la première, flèches, barre du haut ;
//   - chaque vue (Patrouille, Missions spéciales, Mode libre, fiche de carrière) s'ouvre et revient au hub (bouton et Échap) ;
//   - plus de 100 missions sur au moins 10 postes, fiche avec « Lancer la mission » ;
//   - aucune data-id en double (une seule vue montée) ;
//   - PC : « Prendre la vacation » (BAC, rythme agité, &premier=5) quitte l'accueil avec extra.vacation.
// Usage : node tests/e2e/verif-accueil-modes.mjs [--seul=pc|tel]
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
const view = (page) => page.evaluate(() => document.querySelector('.ui-home')?.dataset.view ?? '');
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? '');
const stack = (page) => page.evaluate(() => window.__CRS.ctx.ui.current);

/** data-id présentes plus d'une fois parmi les éléments visibles de l'accueil. */
const duplicates = (page) => page.evaluate(() => {
  const seen = new Map();
  for (const e of document.querySelectorAll('.ui-home [data-id]')) {
    const id = e.getAttribute('data-id');
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
});

/** Débordements : défilement horizontal de la page ou d'une vue, éléments interactifs hors de l'écran. */
const overflow = (page) => page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  const out = [];
  const se = document.scrollingElement;
  if (se && se.scrollWidth > W + 1) out.push(`page large de ${se.scrollWidth}px`);
  for (const e of document.querySelectorAll('.ui-home, .ui-home__stage, .ui-view')) {
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.push(`${e.className.split(' ').pop()} défile en largeur (${e.scrollWidth} > ${e.clientWidth})`);
  }
  for (const e of document.querySelectorAll('.ui-home button')) {
    const b = e.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    // les éléments d'une zone qui défile peuvent sortir de l'écran ; les autres non
    if (e.closest('.ui-scroll, .ui-scroll--x, .ui-spec__postes')) continue;
    if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) out.push(`${e.getAttribute('data-id') || (e.textContent || '').trim().slice(0, 20)} hors de l'écran`);
  }
  return out;
});

/** Cibles de moins de `min` px parmi les boutons visibles de la vue. */
const smallTargets = (page, min) => page.evaluate((m) => [...document.querySelectorAll('.ui-home button')].filter((e) => {
  const b = e.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return false;
  return b.width < m - 0.5 || b.height < m - 0.5;
}).map((e) => `${e.getAttribute('data-id') || e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 18)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`), min);

async function press(page, key) {
  await page.keyboard.press(key);
  await frames(page, 3);
}

/** Toucher (doigt) ou clic (souris) au centre d'un élément. */
async function hit(page, id, touch) {
  const loc = page.locator(`[data-id="${id}"]`).first();
  await loc.scrollIntoViewIfNeeded();
  if (touch) await loc.tap();
  else await loc.click();
  await frames(page, 3);
}

async function backToHub(page, how, touch) {
  if (how === 'escape') await press(page, 'Escape');
  else await hit(page, 'accueil-retour', touch);
  return (await view(page)) === 'hub';
}

async function run(server, size) {
  const touch = size.mobile;
  const tag = size.key;
  console.log(`[accueil-modes] ${tag}`);
  const { browser, page, errors } = await openPage(`${server.url}?quality=bas${size.premier ? '&premier=5' : ''}`, { width: size.width, height: size.height, mobile: touch, pointerLock: false });
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    await frames(page, 4);

    // ── hub ──
    check((await view(page)) === 'hub', `[${tag}] l'accueil s'ouvre sur le hub`);
    const hub = await page.evaluate(() => {
      const tiles = ['patrouille', 'carriere', 'missions', 'libre'].map((id) => {
        const e = document.querySelector(`[data-id="accueil-${id}"]`);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { id, x: b.left, y: b.top, w: b.width, h: b.height, text: (e.textContent || '').replace(/\s+/g, ' ').trim() };
      });
      const hubEl = document.querySelector('.ui-hub');
      const top = document.querySelector('.ui-home__top').getBoundingClientRect();
      return { tiles, scroll: hubEl ? hubEl.scrollHeight - hubEl.clientHeight : -1, top: top.height, H: innerHeight, W: innerWidth };
    });
    check(hub.tiles.every((t) => t !== null), `[${tag}] quatre tuiles : patrouille, carrière, missions, libre`);
    check(hub.tiles.every((t) => t && t.y >= 0 && t.y + t.h <= hub.H + 0.5 && t.x >= 0 && t.x + t.w <= hub.W + 0.5), `[${tag}] tuiles entièrement visibles`, JSONs(hub.tiles.map((t) => t && [t.id, Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)])));
    check(hub.scroll <= 1, `[${tag}] le hub ne défile pas`, `${hub.scroll}px`);
    const missionsLine = hub.tiles[2]?.text ?? '';
    const n = Number((missionsLine.match(/(\d[\d\s ]*) missions/) || [])[1]?.replace(/\D/g, '') || 0);
    check(n > 100, `[${tag}] tuile Missions spéciales : nombre calculé (${n})`, missionsLine.slice(0, 90));
    if (touch) {
      check(hub.top <= 44.5, `[${tag}] en-tête de 44 px au plus`, `${Math.round(hub.top)}px`);
      check(hub.tiles.every((t) => t && t.h <= 128.5), `[${tag}] tuiles de 128 px au plus`, hub.tiles.map((t) => t && Math.round(t.h)).join(', '));
      const xs = new Set(hub.tiles.map((t) => t && Math.round(t.x)));
      check(xs.size === 2, `[${tag}] grille 2 × 2`);
      const small = await smallTargets(page, 40);
      check(small.length === 0, `[${tag}] cibles du hub ≥ 40 px`, small.join(', '));
    } else {
      check(new Set(hub.tiles.map((t) => t && Math.round(t.y))).size === 1, `[${tag}] tuiles sur une rangée`);
    }
    check((await overflow(page)).length === 0, `[${tag}] hub sans débordement`, (await overflow(page)).join(' ; '));
    check(await page.locator('[data-id="nav-carriere"]').count() === 1 && await page.locator('[data-id="nav-historique"]').count() === 1, `[${tag}] barre du haut : Carrière et Historique`);
    check((await duplicates(page)).length === 0, `[${tag}] hub : aucune data-id en double`, (await duplicates(page)).join(', '));
    await shot(page, `accueil-modes-hub-${tag}`);
    if (!touch) {
      check((await focused(page)) === 'accueil-patrouille', '[pc] focus initial sur la tuile Patrouille', await focused(page));
      await press(page, 'ArrowRight');
      check((await focused(page)) === 'accueil-carriere', '[pc] flèche droite : tuile Carrière', await focused(page));
      await press(page, 'Tab');
      check((await focused(page)) === 'accueil-missions', '[pc] Tab : tuile Missions spéciales', await focused(page));
      await press(page, 'Enter');
      check((await view(page)) === 'missions', '[pc] Entrée ouvre les Missions spéciales');
      check(await backToHub(page, 'escape', touch), '[pc] Échap revient au hub');
      check((await focused(page)) === 'accueil-missions', '[pc] le focus revient sur la tuile quittée', await focused(page));
    }

    // ── Patrouille ──
    await hit(page, 'accueil-patrouille', touch);
    check((await view(page)) === 'patrouille', `[${tag}] tuile Patrouille → vue Patrouille`);
    const pat = await page.evaluate(() => ['crew-bac', 'crew-police_secours', 'patrouille-place', 'patrouille-grade', 'patrouille-depart-bac-75n', 'patrouille-depart-hasard', 'patrouille-rythme', 'patrouille-heure', 'patrouille-duree', 'patrouille-lancer', 'accueil-retour'].filter((id) => !document.querySelector(`[data-id="${id}"]`)));
    check(pat.length === 0, `[${tag}] vue Patrouille complète`, pat.join(', '));
    await hit(page, 'crew-police_secours', touch);
    const tv = await page.evaluate(() => [...document.querySelectorAll('[data-id^="patrouille-depart-"]')].map((e) => e.getAttribute('data-id')));
    check(tv.length === 8 && tv.includes('patrouille-depart-tv-75-09'), `[${tag}] Police secours : sept commissariats et « Au hasard »`, tv.join(', '));
    await hit(page, 'crew-bac', touch);
    const lancer = await page.evaluate(() => { const b = document.querySelector('[data-id="patrouille-lancer"]').getBoundingClientRect(); return { bottom: b.bottom, h: b.height, H: innerHeight }; });
    check(lancer.bottom <= lancer.H + 0.5 && lancer.bottom > lancer.H - 90, `[${tag}] « Prendre la vacation » collé en bas`, `${Math.round(lancer.bottom)} / ${lancer.H}`);
    check((await overflow(page)).length === 0, `[${tag}] Patrouille sans débordement`, (await overflow(page)).join(' ; '));
    if (touch) {
      const small = await smallTargets(page, 40);
      check(small.length === 0, `[${tag}] Patrouille : cibles ≥ 40 px`, small.join(', '));
    }
    check((await duplicates(page)).length === 0, `[${tag}] Patrouille : aucune data-id en double`, (await duplicates(page)).join(', '));
    await shot(page, `accueil-modes-patrouille-${tag}`);
    check(await backToHub(page, touch ? 'bouton' : 'escape', touch), `[${tag}] Patrouille → hub`);

    // ── Missions spéciales ──
    await hit(page, 'accueil-missions', touch);
    check((await view(page)) === 'missions', `[${tag}] tuile Missions spéciales → vue Missions`);
    const spec = await page.evaluate(() => {
      const postes = [...document.querySelectorAll('[data-id^="poste-"]')];
      const total = postes.reduce((s, p) => s + Number(p.querySelector('.ui-spec__count')?.textContent.replace(/\D/g, '') || 0), 0);
      return { postes: postes.length, total, items: document.querySelectorAll('[data-id^="spec-"]:not([data-id="spec-retour"])').length };
    });
    check(spec.postes >= 10 && spec.total > 100, `[${tag}] ${spec.total} missions sur ${spec.postes} postes`);
    check(spec.items > 0, `[${tag}] missions du poste listées (${spec.items})`);
    await hit(page, 'poste-bravm', touch);
    const firstSpec = await page.evaluate(() => document.querySelector('[data-id^="spec-"]:not([data-id="spec-retour"])')?.getAttribute('data-id'));
    await hit(page, firstSpec, touch);
    const card = await page.evaluate(() => {
      const b = document.querySelector('[data-id="briefing-lancer"]');
      const r = b ? b.getBoundingClientRect() : null;
      return { lancer: !!r && r.width > 0, bottom: r ? r.bottom : 0, H: innerHeight, objs: document.querySelectorAll('.ui-brief__objs li').length, detail: document.querySelector('.ui-spec').classList.contains('is-detail') };
    });
    check(card.lancer && card.bottom <= card.H + 0.5, `[${tag}] fiche : « Lancer la mission » visible`, `${Math.round(card.bottom)} / ${card.H}`);
    check(card.objs >= 1, `[${tag}] fiche : objectifs listés (${card.objs})`);
    check((await overflow(page)).length === 0, `[${tag}] Missions sans débordement`, (await overflow(page)).join(' ; '));
    if (touch) {
      check(card.detail, '[tel] la fiche s\'ouvre en plein panneau');
      const small = await smallTargets(page, 40);
      check(small.length === 0, '[tel] fiche : cibles ≥ 40 px', small.join(', '));
      await shot(page, `accueil-modes-fiche-${tag}`);
      await hit(page, 'spec-retour', touch);
      check(!(await page.evaluate(() => document.querySelector('.ui-spec').classList.contains('is-detail'))), '[tel] « ← Missions » revient à la liste');
    }
    check((await duplicates(page)).length === 0, `[${tag}] Missions : aucune data-id en double`, (await duplicates(page)).join(', '));
    await shot(page, `accueil-modes-missions-${tag}`);
    check(await backToHub(page, 'bouton', touch), `[${tag}] Missions → hub`);

    // ── Mode libre ──
    await hit(page, 'accueil-libre', touch);
    check((await view(page)) === 'libre' && await page.locator('[data-id="lancer"]').count() === 1, `[${tag}] tuile Mode libre → éditeur avec « Lancer »`);
    check(/Mission/.test(await page.evaluate(() => document.querySelector('[data-id="tab-mode"]')?.textContent || '')), `[${tag}] onglet « Mission (facultative) »`);
    check(await page.locator('[data-id^="mode-"]').count() === 0, `[${tag}] plus de cartes de mode dans l'éditeur`);
    check((await duplicates(page)).length === 0, `[${tag}] éditeur : aucune data-id en double`, (await duplicates(page)).join(', '));
    await shot(page, `accueil-modes-libre-${tag}`);
    check(await backToHub(page, touch ? 'bouton' : 'escape', touch), `[${tag}] Mode libre → hub`);

    // ── Carrière : écran de carrière, « Jouer la mission » → fiche de briefing ──
    await hit(page, 'accueil-carriere', touch);
    const careerScreen = (await stack(page)) === 'carriere';
    check(careerScreen, `[${tag}] tuile Carrière → écran de carrière`);
    if (careerScreen) {
      const first = await page.evaluate(() => [...document.querySelectorAll('[data-id^="carriere-mission-"]')].find((b) => !b.disabled)?.getAttribute('data-id'));
      if (first) {
        await hit(page, first, touch);
        await hit(page, 'carriere-jouer', touch);
        check((await stack(page)) === 'menu_principal' && (await view(page)) === 'briefing', `[${tag}] « Jouer la mission » → fiche de briefing`);
        check(await page.locator('[data-id="briefing-lancer"]').count() === 1 && await page.locator('[data-id="briefing-ajuster"]').count() === 1, `[${tag}] fiche : Lancer et Ajuster`);
        await shot(page, `accueil-modes-briefing-${tag}`);
        await hit(page, 'briefing-ajuster', touch);
        check((await view(page)) === 'libre' && (await page.evaluate(() => document.querySelector('[data-id="tab-mode"]')?.getAttribute('aria-selected'))) === 'true', `[${tag}] « Ajuster les réglages » → éditeur, onglet Mission`);
        check(await backToHub(page, 'bouton', touch), `[${tag}] éditeur → hub`);
      } else {
        check(false, `[${tag}] une mission de carrière ouverte`);
      }
    }
    check(errors.length === 0, `[${tag}] aucune erreur dans la console`, errors.slice(0, 3).join(' | '));

    // ── PC : prendre la vacation ──
    if (size.premier) {
      await hit(page, 'accueil-patrouille', touch);
      await hit(page, 'crew-bac', touch);
      await page.locator('[data-id="patrouille-rythme"] [data-value="agite"]').click();
      await hit(page, 'patrouille-lancer', touch);
      await waitFor(page, 'window.__CRS.ctx.ui.current !== "menu_principal"', 60000);
      const cfg = await page.evaluate(() => window.__CRS.ctx.session.config);
      const v = cfg && cfg.extra ? cfg.extra.vacation : null;
      check(!!v && cfg.role === 'patrouille' && cfg.mode === 'monde_ouvert', '« Prendre la vacation » quitte l\'accueil avec extra.vacation', v ? `${v.depart.callsign}, rythme ${v.rythme}, premier ${v.premier}` : 'pas de vacation');
      check(!!v && v.rythme === 'agite' && v.premier === 5 && v.crew === 'bac', 'vacation : BAC, rythme agité, premier appel à 5 s (paramètre &premier=)');
      await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 600000);
      await frames(page, 3);
      const inCar = await page.evaluate(() => {
        const c = window.__CRS.ctx;
        const p = c.player.person();
        const car = p && p.vehicleId ? c.vehicles.get(p.vehicleId) : null;
        return car ? car.kind : '';
      });
      check(inCar === 'voiture_bac', 'en jeu : le joueur est à bord de la voiture banalisée', inCar || 'à pied');
      await shot(page, `accueil-modes-vacation-${tag}`);
      check(errors.length === 0, `[${tag}] aucune erreur après le lancement`, errors.slice(0, 3).join(' | '));
    }
  } catch (err) {
    ok = false;
    console.error(`[accueil-modes] ${tag} : exception`, err);
    await shot(page, `accueil-modes-echec-${tag}`).catch(() => {});
  }
  for (const e of errors) console.error('  erreur page : ' + e);
  await browser.close();
}

function JSONs(v) { return JSON.stringify(v); }

const server = await startServer();
const SIZES = [
  { key: 'pc', width: 1280, height: 720, mobile: false, premier: true },
  { key: 'tel', width: 844, height: 390, mobile: true, premier: false },
];
for (const size of SIZES) {
  if (args.seul && args.seul !== size.key) continue;
  await run(server, size);
}
await finish({ server, ok, label: 'accueil-modes' });
