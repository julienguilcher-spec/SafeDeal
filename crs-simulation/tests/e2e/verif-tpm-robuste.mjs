// Testeur indépendant — ROBUSTESSE, vrai jeu, 960×540, qualité « bas » :
//   1. rechargement de la page en cours de partie ;  2. sauvegarde corrompue (JSON tronqué, puis JSON valide au contenu absurde) ;
//   3. stockage local indisponible (accès qui lève) ;  4. fenêtre redimensionnée en jeu ;  5. onglet masqué puis réaffiché ;
//   6. perte puis restauration du contexte WebGL.
// Usage : node tests/e2e/verif-tpm-robuste.mjs [--only=1,2,3,4,5,6]
import { createRequire } from 'node:module';
import { startServer, waitFor, frames, step, state, snap, J, R, makeChecker } from './verif-tpm-lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = (n) => !args.only || args.only.split(',').includes(String(n));
const tag = 'verif-tpm-robuste';
const C = makeChecker(tag);
const report = {};
const KEY = 'crs-simulation-france.save.v1';
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const warnings = [];
async function newPage(url, { init, width = 960, height = 540 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack ? e.stack : String(e)).slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 400)); if (m.type() === 'warning' && /\[(save|core|main|ui)\]/.test(m.text())) warnings.push(m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { context, page };
}
const ready = (page) => waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
const safe = async (name, fn) => {
  const n0 = errors.length;
  try { await fn(); } catch (err) { C.check(false, `exception dans « ${name} »`, String(err && err.message ? err.message : err).slice(0, 400)); }
  C.check(errors.length === n0, `« ${name} » : aucune erreur console`, errors.slice(n0, n0 + 3).join(' | ').slice(0, 700));
};
const launchFromHome = async (page) => {
  await page.locator('[data-id="role-crs"]').first().click();
  await page.locator('[data-id="tab-foule"]').first().click();
  await page.locator('[data-id="affluence"]').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.locator('[data-id="lancer"]').first().click();
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
};

// ═════════════ 1. rechargement en cours de partie ═════════════
if (only(1)) await safe('rechargement en cours de partie', async () => {
  console.log('[1] rechargement en cours de partie');
  const { context, page } = await newPage(`${server.url}?quality=bas`);
  await ready(page);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await launchFromHome(page);
  await step(page, 20);
  const before = await page.evaluate(() => ({ t: window.__CRS.ctx.clock.now, cfg: window.__CRS.ctx.session.config, people: window.__CRS.ctx.people.list.length }));
  const stored0 = await page.evaluate((k) => localStorage.getItem(k), KEY);
  const t0 = Date.now();
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await ready(page);
  await frames(page, 4);
  const after = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const btn = [...document.querySelectorAll('.crs-ui button')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('data-id') || '') + ':' + (e.textContent || '').trim().slice(0, 30));
    return { phase: c.session.phase, screen: c.ui.current, people: c.people.list.length, buttons: btn, summary: (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200), quality: c.settings.values.quality };
  });
  report.reload = { before: { t: before.t, place: before.cfg.place, crowd: before.cfg.crowdSize, role: before.cfg.role }, after, ms: Date.now() - t0, storedBytes: stored0 ? stored0.length : 0 };
  console.log('  après rechargement : ' + J({ phase: after.phase, screen: after.screen, people: after.people, ms: Date.now() - t0 }));
  C.check(after.phase === 'menu' && after.screen === 'menu_principal', 'après rechargement : retour propre à la page d’accueil', `${after.phase} / ${after.screen}`);
  C.check(after.people === 0, 'après rechargement : aucun reste de la partie précédente', `${after.people} personnes`);
  const cont = after.buttons.find((b) => /continu|reprendre/i.test(b));
  C.check(!!cont, 'après rechargement : la page d’accueil propose de reprendre / continuer le dernier scénario', cont ?? 'aucun bouton « Continuer » : ' + after.buttons.slice(0, 14).join(' | '));
  C.check(/75|100|Concorde|République/.test(after.summary), 'après rechargement : le dernier scénario réglé est retrouvé dans le résumé', after.summary);
  await snap(page, `${tag}-apres-rechargement`);
  // relancer une partie après rechargement
  if (cont) { await page.locator(`[data-id="${cont.split(':')[0]}"]`).first().click().catch(() => {}); await frames(page, 4); }
  const ph = await page.evaluate(() => window.__CRS.ctx.session.phase);
  if (ph === 'menu') await page.locator('[data-id="lancer"]').first().click();
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  const again = await page.evaluate(() => ({ people: window.__CRS.ctx.people.list.length, player: !!window.__CRS.ctx.player.person(), cfg: { place: window.__CRS.ctx.session.config.place, crowd: window.__CRS.ctx.session.config.crowdSize, role: window.__CRS.ctx.session.config.role } }));
  C.check(again.player, 'une partie se relance après le rechargement', J(again));
  report.reload.again = again;
  await context.close();
});

// ═════════════ 2. sauvegarde corrompue ═════════════
if (only(2)) await safe('sauvegarde corrompue', async () => {
  console.log('[2] sauvegarde corrompue');
  const cases = [
    ['JSON tronqué', '{"format":"crs-simulation-france","version":1,"sections":{"settings":{"quality":"ba'],
    ['JSON valide, contenu absurde', JSON.stringify({ format: 'crs-simulation-france', version: 1, sections: {
      settings: { quality: 'zzz', fov: 'large', masterVolume: -40, sensitivity: null, drawDistance: 1e12, crowdDensity: 'beaucoup', invertY: 'oui', subtitles: 7, language: 42 },
      scenarios: { v: 1, last: { role: 'empereur', rank: 12, place: 123456, timeOfDay: 'midi', weather: 'neige', crowdSize: -5, tension: 'haute', duration: 'eternelle', extra: 'rien' }, items: 'aucun' },
      bindings: { kbm: 'tout', gamepad: [1, 2, 3] }, career: 12, } })],
    ['scénario enregistré à moitié valide', JSON.stringify({ format: 'crs-simulation-france', version: 1, sections: {
      settings: { quality: 'bas' },
      scenarios: { v: 1, last: null, items: [{ id: 'x1', name: 'Cassé', savedAt: 'hier', config: null }, { id: 'x2', name: 12, config: { role: 'crs', place: 'Lieu qui n’existe pas', crowdSize: 1e9, extra: { poste: 'inconnu', composition: 'tout', moyens: null, options: 5 } } }, null, 7] } } })],
  ];
  report.corrupt = [];
  for (const [name, value] of cases) {
    const n0 = errors.length;
    const { context, page } = await newPage(`${server.url}?quality=bas`, { init: `try { if (!sessionStorage.getItem('__verif')) { localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(value)}); sessionStorage.setItem('__verif', '1'); } } catch (e) {}` });
    let ok = true;
    try { await ready(page); } catch { ok = false; }
    await frames(page, 4).catch(() => {});
    const st = await page.evaluate(() => { const c = window.__CRS?.ctx; if (!c) return { boot: false, splash: document.getElementById('boot-splash')?.textContent?.trim().slice(0, 200) }; return { boot: true, phase: c.session.phase, screen: c.ui.current, quality: c.settings.values.quality, fov: c.settings.values.fov, volume: c.settings.values.masterVolume, summary: (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' ').slice(0, 160) }; });
    console.log(`  ${name} : ` + J(st));
    C.check(ok && st.boot && st.phase === 'menu' && st.screen === 'menu_principal', `sauvegarde corrompue (${name}) : le jeu arrive quand même à la page d’accueil`, J(st));
    await snap(page, `${tag}-corrompue-${report.corrupt.length + 1}`);
    let launched = false, detail = '';
    if (st.boot) {
      try {
        // ouvrir « Mes scénarios » (les éléments enregistrés corrompus y sont lus), puis lancer
        await page.locator('[data-id="tab-scenarios"]').first().click({ timeout: 5000 }).catch(() => {});
        await frames(page, 3);
        const saved = await page.evaluate(() => [...document.querySelectorAll('.crs-ui [data-id^="saved-"], .crs-ui .ui-list__item')].map((e) => (e.textContent || '').trim().slice(0, 40)).slice(0, 8));
        detail = 'scénarios affichés : ' + JSON.stringify(saved);
        const charger = page.locator('[data-id="saved-charger"], [data-id^="saved-load"]').first();
        if (await charger.count()) { await charger.click({ timeout: 3000 }).catch(() => {}); await frames(page, 3); }
        await page.locator('[data-id="lancer"]').first().click({ timeout: 5000 });
        await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
        const g = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { player: !!p, role: c.session.config.role, place: c.session.config.place, crowd: c.session.config.crowdSize, quality: c.view.quality, x: p ? Math.round(p.x) : null, z: p ? Math.round(p.z) : null, people: c.people.list.length }; });
        launched = g.player; detail += ' ; partie : ' + J(g);
        await step(page, 3);
        const sys = await page.evaluate(() => window.__CRS.ctx.service('perf').systems.filter((s) => s.errors || s.disabled).map((s) => s.id));
        C.check(sys.length === 0, `sauvegarde corrompue (${name}) : aucun système en erreur en jeu`, sys.join(','));
      } catch (err) { detail += ' ; ' + String(err.message || err).slice(0, 200); }
    }
    C.check(launched, `sauvegarde corrompue (${name}) : une partie se lance`, detail.slice(0, 500));
    const stored = await page.evaluate((k) => { try { const s = JSON.parse(localStorage.getItem(k)); return { ok: true, sections: Object.keys(s.sections || {}), backup: (localStorage.getItem(k + '.illisible') || '').length }; } catch (e) { return { ok: false, raw: (localStorage.getItem(k) || '').slice(0, 60) }; } }, KEY);
    C.check(stored.ok, `sauvegarde corrompue (${name}) : le stockage est de nouveau lisible après la partie`, J(stored));
    report.corrupt.push({ name, st, launched, detail, stored, errors: errors.slice(n0) });
    await context.close();
  }
});

// ═════════════ 3. stockage indisponible ═════════════
if (only(3)) await safe('stockage indisponible', async () => {
  console.log('[3] stockage local indisponible');
  const init = `(() => { const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: boom }); } catch (e) {}
    try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: boom }); } catch (e) {} })();`;
  const { context, page } = await newPage(`${server.url}?quality=bas`, { init });
  let ok = true;
  try { await ready(page); } catch { ok = false; }
  const st = await page.evaluate(() => { const c = window.__CRS?.ctx; let thrown = false; try { void window.localStorage; } catch { thrown = true; } if (!c) return { boot: false, thrown, splash: document.getElementById('boot-splash')?.textContent?.trim().slice(0, 300) }; return { boot: true, thrown, phase: c.session.phase, screen: c.ui.current, persistent: c.save.persistent, quality: c.settings.values.quality }; });
  console.log('  ' + J(st));
  C.check(st.thrown, 'le stockage local lève bien une exception dans cette page (montage du test)');
  C.check(ok && st.boot && st.phase === 'menu', 'stockage indisponible : le jeu arrive à la page d’accueil', J(st));
  await snap(page, `${tag}-sans-stockage`);
  if (st.boot) {
    const told = await page.evaluate(() => /m[ée]moire|sauvegard|stockage/i.test([...document.querySelectorAll('.crs-ui [class*="notice"], .crs-ui [class*="toast"], .crs-ui [class*="warn"]')].map((e) => e.textContent).join(' ')));
    C.note(`stockage indisponible : ${told ? 'le joueur est prévenu que rien ne sera enregistré' : 'aucun message ne prévient le joueur que rien ne sera enregistré'} (save.persistent = ${st.persistent})`);
    report.noStorageTold = told;
    await launchFromHome(page);
    // réglage modifié en jeu : pas d'exception
    await page.evaluate(() => { window.__CRS.ctx.settings.set('fov', 80); window.__CRS.ctx.save.write('verif', { a: 1 }); });
    await step(page, 3);
    const g = await page.evaluate(() => ({ player: !!window.__CRS.ctx.player.person(), fov: window.__CRS.ctx.settings.values.fov, back: window.__CRS.ctx.save.read('verif', null) }));
    C.check(g.player && g.fov === 80 && g.back && g.back.a === 1, 'stockage indisponible : la partie se lance, réglages et sauvegarde tenus en mémoire', J(g));
    // paramètres → export de la sauvegarde ne doit pas planter
    const exp = await page.evaluate(() => { try { return window.__CRS.ctx.save.exportAll().length; } catch (e) { return 'exception ' + e.message; } });
    C.check(typeof exp === 'number' && exp > 10, 'stockage indisponible : l’export de la sauvegarde fonctionne', String(exp));
  }
  report.noStorage = st;
  await context.close();
});

// ═════════════ 4–6. redimensionnement, onglet masqué, contexte WebGL perdu ═════════════
if (only(4) || only(5) || only(6)) {
  const { context, page } = await newPage(`${server.url}?autostart=paris&quality=bas&role=crs&poste=lanceur&camera=tps&crowd=100`);
  await ready(page);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 1); await frames(page, 4);
  const geo = () => page.evaluate(() => {
    const c = window.__CRS.ctx; const cv = document.querySelector('#game canvas'); const b = cv.getBoundingClientRect(); const s = c.service('render.base').stats; const cam = c.view.camera;
    const hud = [...document.querySelectorAll('.ui-hud [data-w]')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && !e.hidden && !(q.width >= window.innerWidth * 0.95 && q.height >= window.innerHeight * 0.9); }).map((e) => { const q = e.getBoundingClientRect(); return { w: e.dataset.w, x: Math.round(q.left), y: Math.round(q.top), ww: Math.round(q.width), hh: Math.round(q.height) }; });
    const out = hud.filter((h) => h.x < -1 || h.y < -1 || h.x + h.ww > window.innerWidth + 1 || h.y + h.hh > window.innerHeight + 1).map((h) => h.w);
    const over = [];
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) { const a = hud[i], d = hud[j]; const w = Math.min(a.x + a.ww, d.x + d.ww) - Math.max(a.x, d.x), h = Math.min(a.y + a.hh, d.y + d.hh) - Math.max(a.y, d.y); if (w > 2 && h > 2) over.push(`${a.w}×${d.w} (${w}×${h} px)`); }
    return { win: `${window.innerWidth}×${window.innerHeight}`, css: `${Math.round(b.width)}×${Math.round(b.height)}`, buffer: `${cv.width}×${cv.height}`, stats: `${s.width}×${s.height}`, aspectCam: Math.round(cam.aspect * 1000) / 1000, aspectWin: Math.round(window.innerWidth / window.innerHeight * 1000) / 1000, hudOut: out, hudOver: over, phase: c.session.phase, screen: c.ui.current };
  });
  if (only(4)) await safe('fenêtre redimensionnée', async () => {
    console.log('[4] fenêtre redimensionnée en jeu');
    report.resize = [];
    for (const [w, h] of [[960, 540], [1280, 720], [640, 360], [1600, 500], [700, 900], [960, 540]]) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 4); await page.waitForTimeout(400); await frames(page, 2);
      const g = await geo();
      report.resize.push(g);
      console.log('  ' + J(g));
      C.check(g.css === `${w}×${h}`, `redimensionnement ${w}×${h} : le canevas remplit la fenêtre`, g.css);
      C.check(Math.abs(g.aspectCam - g.aspectWin) < 0.02, `redimensionnement ${w}×${h} : la caméra garde les bonnes proportions (image non étirée)`, `caméra ${g.aspectCam}, fenêtre ${g.aspectWin}, tampon ${g.buffer}`);
      C.check(g.hudOut.length === 0, `redimensionnement ${w}×${h} : HUD dans l’écran`, g.hudOut.join(', '));
      if (g.hudOver.length) C.check(false, `redimensionnement ${w}×${h} : aucun chevauchement dans le HUD`, g.hudOver.join(' ; '));
      await snap(page, `${tag}-fenetre-${w}x${h}`);
    }
    const s = await state(page);
    C.check(s.phase === 'playing' || s.phase === 'paused', 'après les redimensionnements : la partie est intacte', `${s.phase} / ${s.screen}`);
    if (s.phase === 'paused') { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); window.__CRS.ctx.session.pause(false); }); await frames(page, 3); }
  });
  if (only(5)) await safe('onglet masqué puis réaffiché', async () => {
    console.log('[5] onglet masqué puis réaffiché');
    const s0 = await state(page);
    // (a) vrai changement d'onglet : une autre page passe au premier plan
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.waitForTimeout(1500);
    const vis = await page.evaluate(() => ({ v: document.visibilityState, hidden: document.hidden, focus: document.hasFocus() }));
    console.log('  autre onglet au premier plan : ' + J(vis));
    report.hidden = { real: vis };
    // (b) si le navigateur sans tête ne masque pas réellement la page, on simule : visibilitychange + blur
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(800);
    const s1 = await state(page);
    const audio1 = await page.evaluate(() => { const a = window.__CRS.ctx.service('audio.debug') || window.__CRS.ctx.service('audio.ext'); const ac = window.__CRS.ctx.audio; return { ctxState: a && a.context ? a.context.state : (ac && ac.state) || 'inconnu' }; });
    await page.waitForTimeout(4000);
    const s2 = await state(page);
    C.check(s1.phase === 'paused', 'onglet masqué : la partie se met en pause toute seule', `${s1.phase} / ${s1.screen}`);
    C.check(Math.abs(s2.t - s1.t) < 0.01, 'onglet masqué : le temps simulé n’avance plus', `${R(s1.t)} → ${R(s2.t)} s en 4 s réelles`);
    report.hidden.audio = audio1;
    await page.evaluate(() => {
      delete document.visibilityState; delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await other.close();
    await page.bringToFront();
    await frames(page, 4); await page.waitForTimeout(500);
    const s3 = await state(page);
    console.log('  retour : ' + J({ phase: s3.phase, screen: s3.screen, t: s3.t, t0: s0.t }));
    C.check(s3.screen === 'pause' && s3.phase === 'paused', 'onglet réaffiché : le menu de pause attend le joueur', `${s3.phase} / ${s3.screen}`);
    C.check(s3.t - s1.t < 0.5, 'onglet réaffiché : aucun saut du temps simulé', `${R(s1.t)} → ${R(s3.t)} s`);
    await snap(page, `${tag}-retour-onglet`);
    await page.locator('[data-id="pause-reprendre"]').click({ timeout: 10000 }).catch(() => {});
    await frames(page, 4);
    const s4 = await state(page);
    C.check(s4.phase === 'playing', 'reprise après le retour sur l’onglet', `${s4.phase} / ${s4.screen}`);
    // touche tenue au moment où l'onglet est masqué : ne doit pas rester enfoncée
    await page.keyboard.down('KeyW'); await step(page, 0.5);
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW').catch(() => {});
    const mv = await page.evaluate(() => ({ y: window.__CRS.ctx.input.moveY, phase: window.__CRS.ctx.session.phase }));
    C.check(Math.abs(mv.y) < 0.01, 'perte de focus touche tenue : la touche est relâchée (le personnage ne part pas tout seul)', J(mv));
    if (mv.phase === 'paused') { await page.locator('[data-id="pause-reprendre"]').click({ timeout: 10000 }).catch(() => {}); await frames(page, 3); }
  });
  if (only(6)) await safe('contexte WebGL perdu puis rendu', async () => {
    console.log('[6] contexte WebGL perdu puis restauré');
    const lost = await page.evaluate(async () => {
      const r = window.__CRS.ctx.view.renderer; const gl = r.getContext(); const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { ext: false };
      window.__lose = ext; let lostEv = 0, restEv = 0;
      r.domElement.addEventListener('webglcontextlost', () => { lostEv++; }); r.domElement.addEventListener('webglcontextrestored', () => { restEv++; });
      window.__ctxEv = () => ({ lostEv, restEv });
      ext.loseContext();
      await new Promise((res) => setTimeout(res, 1500));
      return { ext: true, isLost: gl.isContextLost(), ...window.__ctxEv() };
    });
    console.log('  perdu : ' + J(lost));
    if (!lost.ext) { C.note('extension WEBGL_lose_context indisponible : essai impossible'); return; }
    await snap(page, `${tag}-webgl-perdu`);
    const told = await page.evaluate(() => [...document.querySelectorAll('.crs-ui [class*="notice"], .crs-ui [class*="toast"], #boot-splash, .crs-ui [class*="banner"]')].map((e) => (e.textContent || '').trim().slice(0, 100)).filter(Boolean));
    report.webgl = { lost, told };
    await page.evaluate(async () => { window.__lose.restoreContext(); await new Promise((res) => setTimeout(res, 2500)); });
    await frames(page, 6).catch(() => {});
    const back = await page.evaluate(() => { const r = window.__CRS.ctx.view.renderer; const gl = r.getContext(); const i = r.info; return { isLost: gl.isContextLost(), ...window.__ctxEv(), calls: i.render.calls, triangles: i.render.triangles, phase: window.__CRS.ctx.session.phase, sys: window.__CRS.ctx.service('perf').systems.filter((s) => s.errors || s.disabled).map((s) => `${s.id}:${s.errors}${s.disabled ? ':désactivé' : ''}`) }; });
    console.log('  restauré : ' + J(back));
    report.webgl.back = back;
    await snap(page, `${tag}-webgl-restaure`);
    C.check(!back.isLost && back.restEv >= 1, 'contexte WebGL restauré par le navigateur', J(back));
    C.check(back.sys.length === 0, 'après restauration : aucun système en erreur', back.sys.join(', '));
    C.note(`contexte WebGL perdu : messages affichés au joueur : ${told.join(' | ') || 'aucun'} (regarder les captures ${tag}-webgl-perdu et -restaure)`);
  });
  await context.close();
}
report.errors = errors.slice(); report.warnings = warnings.slice(0, 40);
report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
