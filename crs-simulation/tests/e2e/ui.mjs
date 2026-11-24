// Bout en bout — interface (socle, page d'accueil, HUD, menus), sur le banc d'essai harness/ui.html.
//   1. Chaque écran et le HUD dans plusieurs situations, aux trois tailles (1280×720, 844×390 tactile,
//      1180×820 tactile) : captures dans tests/e2e/out/ui-*.png et contrôles de mise en page dans le DOM
//      réel (rien hors écran, aucun texte coupé, cibles ≥ 44 px en tactile, HUD sans chevauchement —
//      ni entre ses éléments, ni avec la surcouche tactile du module d'entrées).
//   2. Parcours à la souris et au clavier : réglages, scénarios enregistrés, lancement, pause, paramètres,
//      compte rendu, retour à l'accueil, « Continuer ».
//   3. Parcours complet à la manette simulée (navigator.getGamepads remplacé) : accueil → réglages → lancer.
//   4. Intégration (informatif) : sous-modules cartes et commandement agrégés, vraies données de Paris.
// Usage : node tests/e2e/ui.mjs [--only=menus|hud|parcours|manette|integration] [--size=1280x720]
import { startServer, openPage, shot, waitFor, finish, ouvrirEditeur } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SIZES = [
  { key: '1280x720', width: 1280, height: 720, mobile: false },
  { key: '844x390', width: 844, height: 390, mobile: true },
  { key: '1180x820', width: 1180, height: 820, mobile: true },
].filter((s) => !args.size || s.key === args.size);
const only = (name) => !args.only || args.only === name;

const failures = [];
const notes = [];
let checks = 0;
const check = (ok, msg) => {
  checks++;
  if (!ok) {
    failures.push(msg);
    console.error('  ✗ ' + msg);
  }
};
const frames = (page, n = 3) => page.evaluate((count) => new Promise((resolve) => {
  let k = 0;
  const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
const settle = async (page, ms = 320) => {
  await frames(page, 3);
  await page.waitForTimeout(ms);
};
const stack = (page) => page.evaluate(() => [...window.__uiTest.debug().stack]);
const phase = (page) => page.evaluate(() => window.__uiTest.ctx.session.phase);
const text = (page, selector) => page.evaluate((s) => (document.querySelector(s)?.textContent ?? '').replace(/[  ]/g, ' '), selector);

// ───────────────────────────── contrôles de mise en page (dans la page) ─────────────────────────────

/** Écran du dessus : rien hors écran, aucun libellé coupé, cibles tactiles ≥ 44 px. */
function screenReport(touch) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const problems = [];
  const rectOf = (el) => {
    if (el.closest('[hidden], [inert]')) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    return r;
  };
  const nameOf = (el) => el.dataset.id || `${String(el.className).split(' ')[0]} « ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)} »`;
  if (document.documentElement.scrollWidth > W + 1) problems.push('la page défile horizontalement');
  const screens = document.querySelectorAll('.ui-screen');
  const top = screens[screens.length - 1];
  if (!top) return problems;
  // partie visible d'un élément dans ses zones défilantes (null s'il est entièrement défilé hors de vue)
  const visiblePart = (el, r) => {
    let left = r.left, top_ = r.top, right = r.right, bottom = r.bottom;
    for (let sc = el.parentElement?.closest('.ui-scroll'); sc; sc = sc.parentElement?.closest('.ui-scroll')) {
      const s = sc.getBoundingClientRect();
      left = Math.max(left, s.left);
      top_ = Math.max(top_, s.top);
      right = Math.min(right, s.right);
      bottom = Math.min(bottom, s.bottom);
    }
    return right - left > 2 && bottom - top_ > 2 ? { left, top: top_, right, bottom } : null;
  };
  const shown = (el, r) => visiblePart(el, r) !== null;
  for (const el of top.querySelectorAll('button, [role="slider"], input:not([type="file"]), textarea')) {
    const r = rectOf(el);
    if (!r) continue;
    const v = visiblePart(el, r);
    if (!v) continue;
    if (v.left < -0.5 || v.right > W + 0.5 || v.top < -0.5 || v.bottom > H + 0.5) problems.push(`hors écran : ${nameOf(el)}`);
    if (touch && (r.width < 43.5 || r.height < 43.5)) problems.push(`cible tactile de ${r.width.toFixed(0)} × ${r.height.toFixed(0)} px : ${nameOf(el)}`);
  }
  for (const el of top.querySelectorAll('.ui-btn .ui-lbl, .ui-tab__label, .ui-seg__opt, .ui-chip, .ui-card__title, .ui-title, .ui-field__value, .ui-field__label, .ui-stepper__value, .ui-key')) {
    const r = rectOf(el);
    if (!r || !shown(el, r)) continue;
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`texte coupé : ${nameOf(el)}`);
  }
  for (const el of top.querySelectorAll('.ui-panel')) {
    const r = rectOf(el);
    if (!r) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) problems.push(`panneau hors écran : ${nameOf(el)}`);
  }
  return problems;
}

/** HUD : éléments dans l'écran, sans chevauchement entre eux ni avec les commandes tactiles. */
function hudReport() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const problems = [];
  const rectOf = (el) => {
    if (el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
    return r;
  };
  const boxes = [];
  for (const el of document.querySelectorAll('.ui-hud .hud-slot > *')) {
    const r = rectOf(el);
    if (r) boxes.push({ name: el.dataset.w || 'élément', r });
  }
  for (const [selector, name] of [['.ui-toasts', 'notifications'], ['.ui-subs', 'sous-titres'], ['.ui-banner', 'bandeau']]) {
    for (const el of document.querySelectorAll(selector)) {
      const r = rectOf(el);
      if (r) boxes.push({ name, r });
    }
  }
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
  for (const b of boxes) {
    if (b.r.left < -0.5 || b.r.top < -0.5 || b.r.right > W + 0.5 || b.r.bottom > H + 0.5) problems.push(`HUD hors écran : ${b.name}`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i].r, boxes[j].r)) problems.push(`HUD : « ${boxes[i].name} » chevauche « ${boxes[j].name} »`);
    }
  }
  let controls = 0;
  for (const el of document.querySelectorAll('.crs-touch .ct-c, .crs-touch .ct-item, .crs-touch .ct-stick')) {
    const r = rectOf(el);
    if (!r) continue;
    controls++;
    const label = (el.textContent || '').trim().slice(0, 16) || 'joystick';
    for (const b of boxes) if (overlap(b.r, r)) problems.push(`HUD : « ${b.name} » recouvre la commande tactile « ${label} »`);
    for (const m of document.querySelectorAll('.hud-marker:not([hidden])')) {
      if (overlap(m.querySelector('.hud-marker__pin').getBoundingClientRect(), r)) problems.push(`marqueur 3D sur la commande tactile « ${label} »`);
    }
  }
  return { problems, widgets: boxes.map((b) => b.name), controls };
}

async function checkScreen(page, label, size) {
  const problems = await page.evaluate(screenReport, size.mobile);
  check(problems.length === 0, `${label} [${size.key}] : ${problems.slice(0, 6).join(' ; ')}`);
}

async function checkHud(page, label, size, expectTouch) {
  const report = await page.evaluate(hudReport);
  check(report.problems.length === 0, `${label} [${size.key}] : ${report.problems.slice(0, 6).join(' ; ')}`);
  if (expectTouch) check(report.controls >= 8, `${label} [${size.key}] : surcouche tactile visible (${report.controls} commandes)`);
  const widgets = await page.evaluate(() => window.__uiTest.debug().hudWidgets());
  const permanent = widgets.filter((w) => ['status', 'items', 'compass', 'objectives', 'situation', 'vehicle', 'drone', 'viewfinder'].includes(w));
  check(permanent.length + 1 <= 6, `${label} [${size.key}] : au plus six indicateurs permanents (${permanent.join(', ')} + cadre légal)`);
  return widgets;
}

const server = await startServer();
const base = server.url + 'harness/ui.html?clean=1&store=memoire';
const allErrors = [];
let lastBrowser = null;

async function open(query, size) {
  const { browser, page, errors } = await openPage(base + (query ? '&' + query : ''), size);
  lastBrowser = browser;
  await waitFor(page, 'window.__ready === true', 90000);
  await settle(page, 200);
  return { browser, page, errors };
}
async function close(session, label) {
  for (const e of session.errors) allErrors.push(`${label} : ${e}`);
  await session.browser.close();
  lastBrowser = null;
}

try {
  // ═════════════════════════ 1. Écrans et HUD aux trois tailles ═════════════════════════
  for (const size of SIZES) {
    if (only('menus')) {
      console.log(`[ui] écrans — ${size.key}`);
      const s = await open('missions=1', size);
      const { page } = s;
      check((await stack(page)).join() === 'menu_principal', `accueil affiché au démarrage [${size.key}]`);
      check(await page.evaluate(() => window.__uiTest.debug().hudVisible) === false, `HUD masqué sur l'accueil [${size.key}]`);
      // hub : quatre tuiles (Patrouille, Carrière, Missions spéciales, Mode libre), puis l'éditeur du Mode libre
      check(await page.locator('[data-id^="accueil-"]').count() === 4, `hub : quatre tuiles [${size.key}]`);
      await shot(page, `ui-accueil-hub-${size.key}`);
      await checkScreen(page, 'accueil, hub', size);
      await ouvrirEditeur(page);
      for (const section of ['role', 'mode', 'lieu', 'meteo', 'foule', 'tension', 'moyens', 'options', 'scenarios']) {
        const tab = page.locator(`[data-id="tab-${section}"]`);
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await settle(page, 180);
        await shot(page, `ui-accueil-${section}-${size.key}`);
        await checkScreen(page, `accueil, section « ${section} »`, size);
      }
      // paramètres : chaque onglet
      await page.locator('[data-id="nav-parametres"]').click();
      await settle(page, 200);
      check((await stack(page)).join() === 'menu_principal,parametres', `paramètres ouverts par-dessus l'accueil [${size.key}]`);
      for (const tab of ['graphismes', 'commandes', 'touches', 'son', 'jeu', 'sauvegarde']) {
        await page.locator(`[data-id="ptab-${tab}"]`).click();
        await settle(page, 160);
        await shot(page, `ui-parametres-${tab}-${size.key}`);
        await checkScreen(page, `paramètres, onglet « ${tab} »`, size);
      }
      await page.locator('[data-id="parametres-retour"]').click();
      await settle(page, 120);
      // crédits
      await page.locator('[data-id="nav-credits"]').click();
      await settle(page, 200);
      await shot(page, `ui-credits-${size.key}`);
      await checkScreen(page, 'crédits', size);
      const attribution = await text(page, '[data-id="attribution"]');
      check(/OpenStreetMap/.test(attribution), `crédits : attribution cartographique affichée (« ${attribution.slice(0, 50)}… ») [${size.key}]`);
      await page.locator('[data-id="credits-retour"]').click();
      await close(s, `écrans ${size.key}`);

      // chargement (retenu), avec progression réelle
      const l = await open('screen=chargement&role=commissaire', size);
      await l.page.evaluate(() => window.__uiTest.loading(0.42, 'Chargement des rues et du bâti…'));
      await settle(l.page, 350);
      check((await stack(l.page)).join() === 'chargement', `écran de chargement pendant le démarrage [${size.key}]`);
      check((await text(l.page, '.ui-load__label')) === 'Chargement des rues et du bâti…', `chargement : libellé de l'étape reçu par ui:loading [${size.key}]`);
      check((await l.page.evaluate(() => document.querySelector('.ui-load__bar').getAttribute('aria-valuenow'))) === '42', `chargement : progression réelle à 42 % [${size.key}]`);
      await shot(l.page, `ui-chargement-${size.key}`);
      await checkScreen(l.page, 'chargement', size);
      await l.page.evaluate(() => window.__uiTest.releaseLoading());
      await waitFor(l.page, 'window.__uiTest.ctx.session.phase === "playing"', 30000);
      await settle(l.page, 200);
      check((await stack(l.page)).length === 0, `chargement fermé une fois la partie prête [${size.key}]`);
      check(await l.page.evaluate(() => window.__uiTest.debug().hudVisible), `HUD affiché en jeu [${size.key}]`);
      await close(l, `chargement ${size.key}`);

      // pause puis compte rendu (résumé minimal, puis avec dossier juridique et résultat de mission)
      const p = await open('screen=pause&role=crs&situation=tension' + (size.mobile ? '&touch=1' : ''), size);
      await settle(p.page, 250);
      check((await stack(p.page)).join() === 'pause' && (await phase(p.page)) === 'paused', `pause : écran ouvert et simulation en pause [${size.key}]`);
      await shot(p.page, `ui-pause-${size.key}`);
      await checkScreen(p.page, 'pause', size);
      await close(p, `pause ${size.key}`);
      for (const variant of ['', '&missions=1&records=1']) {
        const d = await open('screen=debrief&role=crs&situation=affrontement' + variant, size);
        await settle(d.page, 250);
        check((await stack(d.page)).join() === 'debrief' && (await phase(d.page)) === 'debrief', `compte rendu affiché en fin de session [${size.key}]`);
        await shot(d.page, `ui-debrief${variant ? '-complet' : ''}-${size.key}`);
        await checkScreen(d.page, variant ? 'compte rendu complet' : 'compte rendu minimal', size);
        if (variant) check(/78/.test(await text(d.page, '.ui-score')), `compte rendu : note de la mission affichée [${size.key}]`);
        else check(/dossier juridique détaillé/.test(await text(d.page, '.ui-debrief__body')), `compte rendu minimal : l'absence du dossier juridique est dite [${size.key}]`);
        await close(d, `compte rendu ${size.key}`);
      }
    }

    if (only('hud')) {
      console.log(`[ui] HUD — ${size.key}`);
      const touch = size.mobile ? '&touch=1' : '';
      const scenes = [
        { name: 'crs-calme', query: 'role=crs&situation=calme', expect: ['situation', 'compass', 'objectives', 'status', 'items'] },
        { name: 'crs-affrontement-nuit', query: 'role=crs&situation=affrontement&gas=0.55&hour=21.5&camera=fps', busy: true, expect: ['situation', 'status', 'prompt'] },
        { name: 'commissaire-sommations', query: 'role=commissaire&situation=tension', expect: ['situation', 'items'] },
        { name: 'centaure-tourelle', query: 'role=gendarme_centaure&situation=tension&vehicle=centaure', expect: ['vehicle'], absent: ['items'] },
        { name: 'canon-eau', query: 'role=operateur_canon_eau&situation=affrontement&vehicle=canon_eau', expect: ['vehicle'], absent: ['items'] },
        { name: 'bravm-moto', query: 'role=bravm&situation=calme&vehicle=moto_bravm', expect: ['vehicle'] },
        { name: 'drone', query: 'role=telepilote&situation=tension&camera=drone', expect: ['drone'], absent: ['status', 'items', 'compass'] },
        { name: 'journaliste-viseur', query: 'role=journaliste&situation=tension&camera=viewfinder', expect: ['viewfinder'], absent: ['items', 'objectives'] },
        { name: 'manifestant', query: 'role=manifestant&situation=tension', expect: ['situation', 'items'] },
        { name: 'street-medic-pluie', query: 'role=street_medic&situation=affrontement&gas=0.4&weather=pluie', expect: ['status'] },
      ];
      for (const scene of scenes) {
        const s = await open(`screen=hud&${scene.query}${touch}`, size);
        const { page } = s;
        if (scene.busy) {
          await page.evaluate(() => {
            const t = window.__uiTest;
            t.demo.hit(70);
            t.demo.notify();
            t.demo.radio();
            t.demo.prompt('Menotter', true);
            t.forced.charge = 0.62;
          });
        }
        let painAtHit = 0;
        let arcAtHit = false;
        if (scene.busy) {
          await frames(page, 3);
          painAtHit = await page.evaluate(() => window.__uiTest.fx.pain);
          arcAtHit = await page.evaluate(() => [...document.querySelectorAll('.hud-dmg')].some((e) => Number(getComputedStyle(e).opacity) > 0.5));
        }
        await settle(page, 420);
        await shot(page, `ui-hud-${scene.name}-${size.key}`);
        const widgets = await checkHud(page, `HUD ${scene.name}`, size, size.mobile);
        for (const w of scene.expect ?? []) check(widgets.includes(w), `HUD ${scene.name} [${size.key}] : élément « ${w} » affiché (${widgets.join(', ')})`);
        for (const w of scene.absent ?? []) check(!widgets.includes(w), `HUD ${scene.name} [${size.key}] : élément « ${w} » masqué`);
        if (scene.name === 'crs-affrontement-nuit') {
          const fx = await page.evaluate(() => ({ ...window.__uiTest.fx }));
          check(fx.gas > 0.1 && painAtHit > 0.2 && fx.visor === 1, `effets d'écran envoyés à ctx.view (gaz ${fx.gas.toFixed(2)}, douleur au moment du coup ${painAtHit.toFixed(2)}, visière ${fx.visor}) [${size.key}]`);
          check(fx.pain < painAtHit, `l'effet de douleur s'estompe (${painAtHit.toFixed(2)} → ${fx.pain.toFixed(2)}) [${size.key}]`);
          check(arcAtHit, `indicateur de direction du coup reçu visible au moment du coup [${size.key}]`);
          const dash = await page.evaluate(() => Number(document.querySelector('.r-charge').getAttribute('stroke-dashoffset')));
          check(dash > 40 && dash < 70, `jauge de charge du lancer à 62 % (décalage ${dash}) [${size.key}]`);
          check((await page.evaluate(() => window.__uiTest.debug().notices().length)) === 3, `trois notifications en file [${size.key}]`);
          const shownToasts = await page.evaluate(() => [...document.querySelectorAll('.ui-toast')].filter((e) => e.getBoundingClientRect().height > 0).length);
          check(shownToasts === (size.height < 520 ? 1 : 3), `notifications affichées : ${shownToasts} (une seule sur écran bas) [${size.key}]`);
          check(/Alpha 1/i.test(await text(page, '.ui-subs')), `sous-titre radio affiché [${size.key}]`);
          if (!size.mobile) check(/Menotter/.test(await text(page, '.hud-prompt')), `invite d'interaction avec progression [${size.key}]`);
          else check(/Menotter/.test(await text(page, '.crs-touch .ct-k-interact')), `libellé d'interaction transmis au bouton tactile [${size.key}]`);
        }
        if (scene.name === 'crs-calme' && size.mobile) {
          const items = await page.evaluate(() => [...document.querySelectorAll('.crs-touch .ct-item')].filter((e) => e.getBoundingClientRect().width > 0).length);
          check(items === 8, `barre d'objets tactile alimentée par le HUD (${items} cases) [${size.key}]`);
          check(/Bouclier/.test(await text(page, '.crs-touch .ct-item')), `barre d'objets tactile : noms français transmis (« ${await text(page, '.crs-touch .ct-item')} ») [${size.key}]`);
        }
        if (scene.name === 'journaliste-viseur' && size.mobile) {
          check(/Appareil/.test(await text(page, '.crs-touch .ct-item')), `viseur : la barre d'objets tactile reste alimentée (« ${await text(page, '.crs-touch .ct-item')} ») [${size.key}]`);
        }
        if (scene.name === 'crs-calme' && !size.mobile) {
          // coût du HUD : mutations du DOM au repos puis regard en rotation, temps moyen par image du système
          const perf = await page.evaluate(async () => {
            const t = window.__uiTest;
            let n = 0;
            const mo = new MutationObserver((list) => { n += list.length; });
            mo.observe(document.querySelector('.ui-hud'), { subtree: true, childList: true, attributes: true, characterData: true });
            await new Promise((r) => setTimeout(r, 1000));
            const idle = n;
            n = 0;
            let count = 0;
            const start = performance.now();
            await new Promise((resolve) => {
              const f = () => {
                t.ctx.player.state.camYaw += 0.01;
                count++;
                if (performance.now() - start < 1000) requestAnimationFrame(f);
                else resolve();
              };
              requestAnimationFrame(f);
            });
            mo.disconnect();
            const ui = t.game.perf.find((p) => p.id === 'ui');
            return { idle, turning: n, frames: count, avgFrameMs: ui.avgFrameMs };
          });
          notes.push(`HUD au repos : ${perf.idle} mutation(s) du DOM en 1 s ; regard en rotation : ${(perf.turning / perf.frames).toFixed(1)} mutation(s) par image sur ${perf.frames} images ; système « ui » : ${perf.avgFrameMs.toFixed(3)} ms par image`);
          check(perf.idle <= 12, `HUD au repos : presque aucune écriture dans le DOM (${perf.idle} en 1 s)`);
          check(perf.turning / perf.frames <= 14, `HUD, regard en rotation : écritures bornées (${(perf.turning / perf.frames).toFixed(1)} par image)`);
          check(perf.avgFrameMs < 3, `coût moyen du système d'interface par image : ${perf.avgFrameMs.toFixed(3)} ms`);
        }
        if (scene.name === 'commissaire-sommations') {
          check(/Première sommation/.test(await text(page, '.hud-legal')), `cadre légal : « Première sommation » [${size.key}]`);
          check((await page.evaluate(() => document.querySelectorAll('.hud-somm i.is-on').length)) === 2, `cadre légal : deux sommations prononcées sur trois [${size.key}]`);
        }
        if (scene.name === 'manifestant') {
          check(/quittez les lieux/.test(await text(page, '.hud-remind')), `rappel du droit pour un civil [${size.key}]`);
          check(await page.evaluate(() => document.querySelector('.hud-legal').hidden), `pas de niveau de force affiché pour un civil [${size.key}]`);
        }
        if (scene.name === 'centaure-tourelle') check(/24\/30/.test(await text(page, '.hud-veh__ammo')), `véhicule : munitions de tourelle 24/30 [${size.key}]`);
        if (scene.name === 'canon-eau') check(/6 200 L/.test(await text(page, '.hud-veh__ammo')), `véhicule : eau restante 6 200 L [${size.key}]`);
        if (scene.name === 'drone') check(/58 m/.test(await text(page, '[data-w="drone"]')) && /78 %/.test(await text(page, '[data-w="drone"]')), `drone : altitude et batterie (« ${await text(page, '[data-w="drone"]')} ») [${size.key}]`);
        if (scene.name === 'journaliste-viseur') check(/70 mm/.test(await text(page, '[data-w="viewfinder"]')), `viseur : focale 70 mm [${size.key}]`);
        await close(s, `HUD ${scene.name} ${size.key}`);
      }
      // sans module de rendu : effets d'écran de repli, pas de marqueurs 3D
      const n = await open(`screen=hud&role=crs&situation=affrontement&gas=0.7&view=0${touch}`, size);
      await settle(n.page, 400);
      await shot(n.page, `ui-hud-sans-rendu-${size.key}`);
      check(await n.page.evaluate(() => Number(getComputedStyle(document.querySelector('.hud-fx--gas')).opacity) > 0.1), `sans ctx.view : voile de gaz de repli [${size.key}]`);
      check(!(await n.page.evaluate(() => window.__uiTest.debug().hudWidgets())).includes('markers'), `sans ctx.view : pas de marqueurs 3D [${size.key}]`);
      await close(n, `HUD sans rendu ${size.key}`);
    }
  }

  // ═════════════════════════ 2. Parcours souris et clavier ═════════════════════════
  if (only('parcours')) {
    console.log('[ui] parcours souris / clavier');
    const size = { key: '1280x720', width: 1280, height: 720, mobile: false };
    const s = await open('', size);
    const { page } = s;
    await ouvrirEditeur(page);
    // commandant unique (BRIEF §1) : pas de tuile « Commissaire » ; rôle → commandant, résumé mis à jour
    check((await page.locator('[data-id="role-commissaire"]').count()) === 0, 'pas de tuile « Commissaire » sur la page d’accueil');
    await page.locator('[data-id="role-commandant"]').click();
    check(/Commandant, commandant d.unité/.test(await text(page, '.ui-sum__role')), 'choix du rôle répercuté dans le résumé');
    // lieu
    await page.locator('[data-id="tab-lieu"]').click();
    // choisir sur le plan : un clic vers l'ouest de l'emprise sélectionne le Trocadéro, puis la liste reprend la main
    const plan = await page.locator('.ui-miniplan canvas').boundingBox();
    await page.mouse.click(plan.x + plan.width * 0.075, plan.y + plan.height * 0.62);
    await frames(page, 2);
    check(/Trocadéro/.test(await text(page, '.ui-home__summary')), `choix du lieu sur le mini-plan (résumé : ${(await text(page, '.ui-sum__row')).slice(0, 40)})`);
    await page.locator('[data-id="lieu-1"]').click();
    check(/Place de la Bastille/.test(await text(page, '.ui-home__summary')), 'choix du lieu répercuté dans le résumé');
    // heure : glisser le curseur à la souris
    await page.locator('[data-id="tab-meteo"]').click();
    const slider = page.locator('[data-id="heure"]');
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await frames(page, 2);
    const hour = await page.evaluate(() => Number(document.querySelector('[data-id="heure"]').getAttribute('aria-valuenow')));
    check(hour > 20 && hour < 22.5, `curseur de l'heure réglé à la souris (${hour})`);
    check((await page.evaluate(() => document.querySelector('.ui-sky').dataset.phase)) === 'nuit', 'aperçu de l’heure : nuit');
    await page.locator('[data-id="meteo-pluie"]').click();
    // foule : curseur au clavier (flèches lues par le module des entrées)
    await page.locator('[data-id="tab-foule"]').click();
    await page.locator('[data-id="affluence"]').focus();
    await page.keyboard.press('ArrowRight');
    await frames(page, 3);
    await page.keyboard.press('ArrowRight');
    await frames(page, 3);
    check(/900 manifestants/.test(await text(page, '.ui-home__summary')), `affluence réglée au clavier (${(await text(page, '.ui-home__summary')).match(/\d[\d ]* manifestants/)?.[0]})`);
    check(/450 personnes|675 personnes|900 personnes/.test(await text(page, '.ui-home__pane')), 'effectif réellement simulé affiché selon la densité de foule');
    await page.locator('[data-id="cause-climat"]').click();
    // options
    await page.locator('[data-id="tab-options"]').click();
    await page.locator('[data-id="opt-circulation"] [data-value="coupee"]').click();
    await page.locator('[data-id="tab-moyens"]').click();
    await page.locator('[data-id="moyen-centaure"] button[aria-label^="Augmenter"]').click();
    check(/Centaure/.test(await text(page, '.ui-home__summary')), 'moyens engagés répercutés dans le résumé');

    // scénarios : enregistrer, renommer, supprimer
    await page.locator('[data-id="tab-scenarios"]').click();
    await page.locator('[data-id="scenario-nom"]').fill('Bastille sous la pluie');
    await page.locator('[data-id="scenario-enregistrer"]').click();
    await frames(page, 3);
    check(/Bastille sous la pluie/.test(await text(page, '.ui-saved__name')), 'scénario enregistré et listé');
    check((await page.evaluate(() => window.__uiTest.debug().notices())).some((n) => /enregistré/.test(n)), 'notification d’enregistrement');
    await page.locator('[data-id="saved-renommer"]').click();
    await page.locator('[data-id="saved-nom"]').fill('Bastille, nuit de pluie');
    await page.keyboard.press('Enter');
    await frames(page, 3);
    check(/Bastille, nuit de pluie/.test(await text(page, '.ui-saved__name')), 'scénario renommé');
    check((await page.evaluate(() => window.__uiTest.ctx.save.read('scenarios', null).items.length)) === 1, 'scénario présent dans la section « scenarios » de la sauvegarde');
    await shot(page, 'ui-accueil-scenario-enregistre-1280x720');
    // « Surprends-moi » change le brouillon ; « Charger » le rétablit
    const before = await text(page, '.ui-home__summary');
    await page.locator('[data-id="surprise"]').click();
    await frames(page, 3);
    const after = await text(page, '.ui-home__summary');
    check(after !== before, '« Surprends-moi » tire un autre scénario');
    await shot(page, 'ui-accueil-surprise-1280x720');
    await page.locator('[data-id="saved-charger"]').click();
    await frames(page, 3);
    check(/Place de la Bastille/.test(await text(page, '.ui-home__summary')) && /Commandant/.test(await text(page, '.ui-sum__role')), '« Charger » rétablit le scénario enregistré');
    // suppression avec confirmation (retour arrière = annuler)
    await page.locator('[data-id="saved-supprimer"]').click();
    await frames(page, 2);
    await shot(page, 'ui-confirmation-1280x720');
    await page.keyboard.press('Escape');
    await frames(page, 4);
    check(/Bastille, nuit de pluie/.test(await text(page, '.ui-saved__name')), 'Échap annule la suppression');
    check((await stack(page)).join() === 'menu_principal', 'Échap dans une confirmation ne ferme pas l’écran');

    // lancer : SessionConfig complet, extras appliqués
    await page.locator('[data-id="lancer"]').click();
    await waitFor(page, 'window.__uiTest.ctx.session.phase === "playing"', 30000);
    await settle(page, 250);
    const cfg = await page.evaluate(() => window.__uiTest.ctx.session.config);
    check(cfg.mode === 'libre' && cfg.role === 'commandant' && cfg.rank === 'commandant' && cfg.place === 'Place de la Bastille', `SessionConfig lancé : ${cfg.mode}, ${cfg.role}, ${cfg.rank}, ${cfg.place}`);
    check(cfg.weather === 'pluie' && cfg.crowdSize === 900 && cfg.timeOfDay === hour && typeof cfg.x === 'number', `SessionConfig : météo ${cfg.weather}, foule ${cfg.crowdSize}, heure ${cfg.timeOfDay}`);
    check(cfg.extra.scenario === 1 && cfg.extra.cause === 'climat' && cfg.extra.options.circulation === 'coupee' && cfg.extra.moyens.centaure === 1 && cfg.extra.poste === 'commandant_unite', 'config.extra : cause, options, moyens, poste');
    const wind = await page.evaluate(() => ({ x: window.__uiTest.ctx.env.state.windX, z: window.__uiTest.ctx.env.state.windZ }));
    check(Math.abs(wind.x - 10 / 3.6) < 0.01 && Math.abs(wind.z) < 0.01, `vent du scénario appliqué à ctx.env (ouest, 10 km/h → x ${wind.x.toFixed(2)}, z ${wind.z.toFixed(2)})`);
    check((await stack(page)).length === 0 && await page.evaluate(() => window.__uiTest.debug().hudVisible), 'en jeu : aucun écran, HUD visible');

    // pause au clavier, paramètres par-dessus, réglage au clavier, retours successifs
    await page.keyboard.press('Escape');
    await settle(page, 150);
    check((await stack(page)).join() === 'pause' && (await phase(page)) === 'paused', 'Échap ouvre la pause (une seule fois, sans la refermer aussitôt)');
    check((await page.evaluate(() => window.__uiTest.debug().focused())) === 'pause-reprendre', 'focus initial sur « Reprendre »');
    await page.keyboard.press('ArrowDown');
    await frames(page, 3);
    check((await page.evaluate(() => window.__uiTest.debug().focused())) === 'pause-parametres', 'flèche bas : focus sur « Paramètres »');
    await page.keyboard.press('Enter');
    await settle(page, 150);
    check((await stack(page)).join() === 'pause,parametres', 'Entrée ouvre les paramètres par-dessus la pause (sans double validation)');
    await page.locator('[data-id="ptab-son"]').click();
    const volume = await page.evaluate(() => window.__uiTest.ctx.settings.values.volumeMaster);
    await page.locator('[data-id="set-volumeMaster"]').focus();
    await page.keyboard.press('ArrowLeft');
    await frames(page, 3);
    check(Math.abs((await page.evaluate(() => window.__uiTest.ctx.settings.values.volumeMaster)) - (volume - 0.05)) < 1e-6, 'paramètres : volume général réglé au clavier et enregistré dans ctx.settings');
    await page.locator('[data-id="set-subtitles"]').click();
    check((await page.evaluate(() => window.__uiTest.ctx.settings.values.subtitles)) === false, 'paramètres : interrupteur des sous-titres');
    await page.keyboard.press('Escape');
    await settle(page, 150);
    check((await stack(page)).join() === 'pause' && (await phase(page)) === 'paused', 'Échap ferme les paramètres et revient à la pause');
    await page.keyboard.press('Escape');
    await settle(page, 150);
    check((await stack(page)).length === 0 && (await phase(page)) === 'playing', 'Échap reprend la partie');
    // sous-titres coupés : la radio ne s'affiche plus
    await page.evaluate(() => window.__uiTest.demo.radio());
    await frames(page, 3);
    check((await text(page, '.ui-subs')) === '', 'sous-titres désactivés : rien ne s’affiche');

    // pause extérieure (autre module) : l'écran de pause apparaît ; reprise extérieure : il disparaît
    await page.evaluate(() => window.__uiTest.ctx.session.pause(true));
    await settle(page, 120);
    check((await stack(page)).join() === 'pause', 'pause posée par un autre module : écran de pause affiché');
    await page.evaluate(() => window.__uiTest.ctx.session.pause(false));
    await settle(page, 120);
    check((await stack(page)).length === 0 && (await phase(page)) === 'playing', 'reprise par un autre module : écran de pause fermé');

    // terminer → compte rendu → accueil → « Continuer »
    await page.keyboard.press('Escape');
    await settle(page, 150);
    await page.locator('[data-id="pause-terminer"]').click();
    await page.locator('[data-id="dialog-confirm"]').click();
    await settle(page, 200);
    check((await stack(page)).join() === 'debrief' && (await phase(page)) === 'debrief', 'terminer la mission ouvre le compte rendu');
    await page.keyboard.press('Escape');
    await frames(page, 4);
    check((await stack(page)).join() === 'debrief', 'le compte rendu ne se ferme pas par un simple retour arrière');
    await page.locator('[data-id="debrief-accueil"]').click();
    await settle(page, 200);
    check((await stack(page)).join() === 'menu_principal' && (await phase(page)) === 'menu', 'retour à l’accueil');
    check(await page.locator('[data-id="continuer"]').count() === 1, 'bouton « Continuer » proposé sur le hub après une première partie');
    check(/Place de la Bastille/.test(await text(page, '[data-id="continuer"]')), `« Continuer » nomme la dernière partie (${await text(page, '[data-id="continuer"]')})`);
    await shot(page, 'ui-accueil-continuer-1280x720');
    await page.locator('[data-id="continuer"]').click();
    await waitFor(page, 'window.__uiTest.ctx.session.phase === "playing"', 30000);
    const again = await page.evaluate(() => window.__uiTest.ctx.session.config);
    check(again.role === 'commandant' && again.place === 'Place de la Bastille' && again.seed === cfg.seed, '« Continuer » relance la dernière configuration à l’identique');
    await close(s, 'parcours');

    // paramètres : export / import / effacement de la sauvegarde ; entrées conditionnelles vers d'autres écrans
    const e = await open('extras=1&screen=parametres&tab=sauvegarde', size);
    await e.page.locator('[data-id="save-export"]').click();
    await frames(e.page, 3);
    const exported = await e.page.evaluate(() => document.querySelector('[data-id="save-json"]').value);
    check(/crs-simulation-france/.test(exported) && /settings|scenarios|sections/.test(exported), 'export : JSON de la sauvegarde affiché');
    await e.page.locator('[data-id="save-json"]').fill('{"pas":"une sauvegarde"}');
    await e.page.locator('[data-id="save-import"]').click();
    await frames(e.page, 3);
    check((await e.page.evaluate(() => window.__uiTest.debug().notices())).some((n) => /n’est pas une sauvegarde/.test(n)), 'import : un texte étranger est refusé avec un message clair');
    await e.page.locator('[data-id="save-json"]').fill(exported);
    await e.page.locator('[data-id="save-import"]').click();
    await frames(e.page, 3);
    check((await e.page.evaluate(() => window.__uiTest.debug().notices())).some((n) => /importée/.test(n)), 'import : la sauvegarde exportée est acceptée');
    await e.page.evaluate(() => window.__uiTest.ctx.settings.set('fov', 95));
    await e.page.locator('[data-id="save-wipe"]').click();
    await frames(e.page, 2);
    await shot(e.page, 'ui-parametres-effacement-1280x720');
    await e.page.locator('[data-id="dialog-confirm"]').click();
    await frames(e.page, 3);
    check((await e.page.evaluate(() => window.__uiTest.ctx.settings.values.fov)) === 70, 'effacement : paramètres revenus aux valeurs par défaut');
    check((await e.page.evaluate(() => window.__uiTest.ctx.save.read('scenarios', 'vide'))) === 'vide', 'effacement : sauvegarde vidée');
    await e.page.locator('[data-id="parametres-retour"]').click();
    await frames(e.page, 3);
    check(await e.page.locator('[data-id="nav-carriere"]').count() === 1 && await e.page.locator('[data-id="nav-missions"]').count() === 1, 'entrées « Carrière » et « Missions » présentes quand ces écrans sont enregistrés');
    await e.page.locator('[data-id="nav-carriere"]').click();
    await frames(e.page, 3);
    check((await stack(e.page)).join() === 'menu_principal,carriere', 'entrée « Carrière » : ouvre l’écran du module correspondant');
    await close(e, 'sauvegarde');
    const noExtras = await open('', size);
    check(await noExtras.page.locator('[data-id="nav-carriere"]').count() === 0, 'entrée « Carrière » absente quand son écran n’est pas enregistré');
    await ouvrirEditeur(noExtras.page);
    // infobulle au survol
    await noExtras.page.locator('[data-id="surprise"]').hover();
    await noExtras.page.waitForTimeout(250);
    check(/scénario cohérent/.test(await text(noExtras.page, '.ui-tip.is-on')), 'infobulle affichée au survol de « Surprends-moi »');
    await close(noExtras, 'sans extras');

    // bandeau de début de mission
    const b = await open('screen=hud&role=crs', size);
    await b.page.evaluate(() => window.__uiTest.demo.banner());
    await settle(b.page, 350);
    check(/Le cortège s’ébranle/.test(await text(b.page, '.ui-banner__title')) && !(await b.page.evaluate(() => document.querySelector('.ui-banner').hidden)), 'bandeau affiché par ctx.ui.banner');
    await shot(b.page, 'ui-hud-bandeau-1280x720');
    check((await b.page.evaluate(hudReport)).problems.length === 0, `bandeau sans chevauchement avec le HUD : ${(await b.page.evaluate(hudReport)).problems.join(' ; ')}`);
    await close(b, 'bandeau');

    // sans module d'entrées : services neutres, navigation au clavier lue par l'interface elle-même
    const n = await open('noinput=1', size);
    check((await stack(n.page)).join() === 'menu_principal', 'sans module d’entrées : accueil affiché, aucune erreur');
    // navigation au clavier depuis le hub : focus initial sur la première tuile, flèches, Entrée ouvre la tuile
    check((await n.page.evaluate(() => window.__uiTest.debug().focused())) === 'accueil-patrouille', `sans module d’entrées : focus initial sur la tuile Patrouille (${await n.page.evaluate(() => window.__uiTest.debug().focused())})`);
    await n.page.keyboard.press('ArrowRight');
    await frames(n.page, 2);
    check((await n.page.evaluate(() => window.__uiTest.debug().focused())) === 'accueil-carriere', `sans module d’entrées : flèche droite déplace le focus (${await n.page.evaluate(() => window.__uiTest.debug().focused())})`);
    await n.page.keyboard.press('ArrowRight');
    await n.page.keyboard.press('ArrowRight');
    await frames(n.page, 2);
    await n.page.keyboard.press('Enter');
    await frames(n.page, 3);
    check(await n.page.locator('[data-id="lancer"]').count() === 1, `sans module d’entrées : Entrée ouvre la tuile « Mode libre » (focus ${await n.page.evaluate(() => window.__uiTest.debug().focused())})`);
    await n.page.keyboard.press('ArrowDown');
    await frames(n.page, 2);
    check((await n.page.evaluate(() => window.__uiTest.debug().focused())) === 'tab-mode', `sans module d’entrées : flèche bas déplace le focus dans l’éditeur (${await n.page.evaluate(() => window.__uiTest.debug().focused())})`);
    await n.page.keyboard.press('Enter');
    await frames(n.page, 2);
    check((await n.page.evaluate(() => document.querySelector('[data-id="tab-mode"]').getAttribute('aria-selected'))) === 'true', 'sans module d’entrées : Entrée valide');
    await n.page.locator('[data-id="nav-parametres"]').click();
    await frames(n.page, 3);
    check(/n’est pas chargé/.test(await (async () => { await n.page.locator('[data-id="ptab-touches"]').click(); await frames(n.page, 2); return text(n.page, '.ui-window__pane'); })()), 'sans module d’entrées : la section « Touches » explique que la réaffectation est indisponible');
    await n.page.keyboard.press('Escape');
    await frames(n.page, 3);
    check((await stack(n.page)).join() === 'menu_principal', 'sans module d’entrées : Échap ferme l’écran du dessus');
    await n.page.locator('[data-id="lancer"]').click();
    await waitFor(n.page, 'window.__uiTest.ctx.session.phase === "playing"', 30000);
    await settle(n.page, 300);
    check(await n.page.evaluate(() => window.__uiTest.debug().hudVisible), 'sans module d’entrées : la partie démarre et le HUD s’affiche');
    await close(n, 'sans module d’entrées');
  }

  // ═════════════════════════ 3. Parcours complet à la manette simulée ═════════════════════════
  if (only('manette')) {
    console.log('[ui] parcours à la manette');
    const size = { key: '1280x720', width: 1280, height: 720, mobile: false };
    const s = await open('', size);
    const { page } = s;
    await ouvrirEditeur(page);
    await page.evaluate(() => {
      const pad = {
        id: 'Manette d\'essai (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      window.__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
      window.dispatchEvent(new Event('gamepadconnected'));
    });
    const A = 0, B = 1, LB = 4, RB = 5, START = 9, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;
    const tap = async (index, times = 1) => {
      for (let i = 0; i < times; i++) {
        await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, touched: true, value: 1 }; }, index);
        await frames(page, 3);
        await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, touched: false, value: 0 }; }, index);
        await frames(page, 3);
      }
    };
    const focused = () => page.evaluate(() => window.__uiTest.debug().focused());
    await frames(page, 6);

    await tap(RIGHT);
    check((await page.evaluate(() => window.__uiTest.ctx.input.device)) === 'gamepad', 'la manette devient le périphérique actif');
    check((await page.evaluate(() => document.querySelector('.crs-ui').getAttribute('data-nav'))) === 'keys', 'anneau de focus affiché à la manette');
    check((await focused()) === 'role-crs', `croix droite depuis l'onglet « Rôle » : première carte de rôle (focus : ${await focused()})`);
    await tap(RIGHT);
    check((await focused()) === 'role-chef_groupe', `croix droite : carte suivante (focus : ${await focused()})`);
    await tap(A);
    check(/Brigadier-chef/.test(await text(page, '.ui-sum__role')), 'A valide : rôle « chef de groupe » choisi');
    // (la carte du dessous dépend du nombre de colonnes de la grille : on vérifie la géométrie, pas un rôle précis)
    const topOf = (id) => page.evaluate((i) => { const e = document.querySelector(`[data-id="${i}"]`); return e ? Math.round(e.getBoundingClientRect().top) : -1; }, id);
    const chefTop = await topOf('role-chef_groupe');
    await tap(DOWN);
    const below = await focused();
    check(/^role-/.test(below) && below !== 'role-chef_groupe' && (await topOf(below)) > chefTop, `croix bas : carte du dessous (focus : ${below})`);
    await shot(page, 'ui-manette-roles-1280x720');
    check(/Start Lancer/.test(await text(page, '.ui-sum__hint')) && /LBRB Sections/.test(await text(page, '.ui-sum__hint')), `aide de navigation à la manette affichée (« ${await text(page, '.ui-sum__hint')} »)`);
    await tap(B);
    check((await focused()) === 'tab-role', 'B ramène le focus sur l’onglet de la section');
    // RB : section suivante, deux fois → « Lieu »
    await tap(RB, 2);
    check((await page.evaluate(() => document.querySelector('[data-id="tab-lieu"]').getAttribute('aria-selected'))) === 'true', 'RB change de section (Rôle → Mode → Lieu)');
    await tap(RIGHT);
    await tap(DOWN);
    check((await focused()) === 'lieu-1', `navigation dans la liste des lieux (focus : ${await focused()})`);
    await tap(A);
    check(/Place de la Bastille/.test(await text(page, '.ui-home__summary')), 'A valide : lieu « Place de la Bastille »');
    // heure : le curseur garde gauche / droite pour changer sa valeur
    await tap(B);
    await tap(RB);
    await tap(RIGHT);
    check((await focused()) === 'heure', `focus sur le curseur de l'heure (focus : ${await focused()})`);
    await tap(RIGHT, 4);
    check(/15 h 30/.test(await text(page, '.ui-home__summary')), `quatre crans à droite : 15 h 30 (${(await text(page, '.ui-home__summary')).match(/\d+ h \d+/)?.[0]})`);
    await tap(DOWN);
    check(/^meteo-/.test(await focused()), `croix bas : quitte le curseur vers la météo (focus : ${await focused()})`);
    // direction tenue : répétition automatique
    await tap(B);
    await tap(RB);
    await tap(RIGHT);
    // la rubrique « La manifestation » commence par son nom et ses organisateurs : l'affluence est plus bas
    const trailFoule = [await focused()];
    for (let i = 0; i < 10 && (await focused()) !== 'affluence'; i++) { await tap(DOWN); trailFoule.push(await focused()); }
    check((await focused()) === 'affluence', `focus sur le curseur d'affluence (parcours : ${trailFoule.join(' > ')})`);
    await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, touched: true, value: 1 }; }, RIGHT);
    await page.waitForTimeout(900);
    await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, touched: false, value: 0 }; }, RIGHT);
    await frames(page, 3);
    const crowd = Number((await page.evaluate(() => document.querySelector('[data-id="affluence"]').getAttribute('aria-valuenow'))));
    check(crowd >= 1200, `direction tenue : la valeur continue de monter (${crowd} manifestants)`);
    // LB revient en arrière
    await tap(LB);
    check((await page.evaluate(() => document.querySelector('[data-id="tab-meteo"]').getAttribute('aria-selected'))) === 'true', 'LB : section précédente');
    // Start : focus sur « Lancer », A lance
    await tap(START);
    check((await focused()) === 'lancer', `Start amène le focus sur « Lancer » (focus : ${await focused()})`);
    await shot(page, 'ui-manette-lancer-1280x720');
    await tap(A);
    await waitFor(page, 'window.__uiTest.ctx.session.phase === "playing"', 30000);
    await settle(page, 250);
    const cfg = await page.evaluate(() => window.__uiTest.ctx.session.config);
    check(cfg.role === 'chef_groupe' && cfg.rank === 'brigadier_chef' && cfg.place === 'Place de la Bastille' && cfg.timeOfDay === 15.5 && cfg.crowdSize === crowd,
      `partie lancée à la manette : ${cfg.role}, ${cfg.rank}, ${cfg.place}, ${cfg.timeOfDay} h, ${cfg.crowdSize} manifestants`);
    check((await stack(page)).length === 0 && await page.evaluate(() => window.__uiTest.debug().hudVisible), 'en jeu après le lancement : HUD visible');
    await shot(page, 'ui-manette-en-jeu-1280x720');
    // en jeu : Start ouvre la pause, B la referme ; les objets suivent LB / RB sans ouvrir d'écran
    await tap(START);
    check((await stack(page)).join() === 'pause' && (await phase(page)) === 'paused', 'Start en jeu : pause');
    await tap(DOWN, 2);
    // (deux crans vers le bas depuis « Reprendre » : le troisième bouton du menu, quel qu'il soit)
    const third = await page.evaluate(() => [...document.querySelectorAll('.ui-pause__list .ui-btn')].map((e) => e.dataset.id)[2]);
    check((await focused()) === third && third !== 'pause-reprendre', `navigation dans le menu de pause (focus : ${await focused()}, attendu : ${third})`);
    await tap(B);
    check((await stack(page)).length === 0 && (await phase(page)) === 'playing', 'B : reprise');
    await tap(RIGHT);
    check((await stack(page)).length === 0, 'croix droite en jeu (« Ordres ») sans écran enregistré : sans effet');
    await close(s, 'manette');
  }

  // ═════════════════════════ 4. Intégration : sous-modules et vraies données (informatif) ═════════════════════════
  if (only('integration')) {
    console.log('[ui] intégration (informatif)');
    const size = { key: '1280x720', width: 1280, height: 720, mobile: false };
    try {
      const s = await open('subs=1&world=paris&section=lieu', size);
      const { page } = s;
      await settle(page, 1200);
      await shot(page, 'ui-integration-lieu-paris-1280x720');
      const cap = await text(page, '.ui-miniplan__cap');
      notes.push(`mini-plan avec les données de Paris : « ${cap} », ${await page.evaluate(() => window.__uiTest.ctx.world.places.length)} lieux, ${await page.evaluate(() => window.__uiTest.ctx.world.edgeCount)} arêtes`);
      await page.locator('[data-id="nav-credits"]').click();
      await settle(page, 150);
      notes.push(`attribution du monde réel : « ${(await text(page, '[data-id="attribution"]')).slice(0, 90)}… »`);
      await page.locator('[data-id="credits-retour"]').click();
      await page.locator('[data-id="lancer"]').click();
      await waitFor(page, 'window.__uiTest.ctx.session.phase === "playing"', 60000);
      await settle(page, 600);
      await shot(page, 'ui-integration-hud-1280x720');
      const widgets = await page.evaluate(() => window.__uiTest.debug().hudWidgets());
      const report = await page.evaluate(hudReport);
      notes.push(`HUD avec sous-modules : ${widgets.join(', ')}${report.problems.length ? ' — ' + report.problems.join(' ; ') : ' — aucun chevauchement'}`);
      for (const [key, id] of [['m', 'carte'], ['Tab', 'carte_tactique']]) {
        await page.keyboard.press(key);
        await settle(page, 500);
        const st = await stack(page);
        notes.push(`touche ${key} → pile d'écrans : [${st.join(', ')}]${st.includes(id) ? '' : ' (écran « ' + id + ' » non ouvert)'}`);
        await shot(page, `ui-integration-${id}-1280x720`);
        await page.keyboard.press('Escape');
        await settle(page, 300);
        if ((await stack(page)).length) await page.evaluate(() => window.__uiTest.ctx.ui.close());
      }
      for (const e of s.errors) notes.push('erreur de page (intégration) : ' + e.slice(0, 200));
      await s.browser.close();
      lastBrowser = null;
    } catch (err) {
      notes.push('intégration interrompue : ' + (err && err.message ? err.message.split('\n')[0] : String(err)));
    }
  }
} catch (err) {
  failures.push('exception : ' + (err && err.stack ? err.stack : String(err)));
  console.error(err);
}

for (const n of notes) console.log('  · ' + n);
console.log(`[ui] ${checks} vérifications, ${failures.length} échec(s)`);
await finish({ browser: lastBrowser, server, errors: allErrors, ok: failures.length === 0, label: 'ui' });
