// Test de bout en bout du cœur du moteur : la page se charge sans erreur, window.__CRS.ready
// devient vrai, une session d'essai démarre et avance, la page tient sur un écran de téléphone.
// Captures : tests/e2e/out/boot.png, boot-session.png, boot-mobile.png
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const server = await startServer();
const t0 = Date.now();
const problems = [];
const allErrors = [];
let browser = null;

function check(cond, message) {
  if (!cond) problems.push(message);
}

try {
  // ── 1. chargement simple : moteur prêt, phase « menu », panneau de diagnostic ──
  let page;
  let errors;
  ({ browser, page, errors } = await openPage(server.url));
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true');
  const boot = await page.evaluate(() => {
    const s = window.__CRS.summary();
    return {
      summary: s,
      title: document.title,
      lang: document.documentElement.lang,
      hasGame: !!document.getElementById('game'),
      hasUi: !!document.getElementById('ui'),
      splash: !!document.getElementById('boot-splash'),
      heading: document.querySelector('.diag-title')?.textContent ?? '',
      scroll: document.documentElement.scrollHeight > window.innerHeight || document.documentElement.scrollWidth > window.innerWidth,
      touchAction: getComputedStyle(document.body).touchAction,
      userSelect: getComputedStyle(document.body).userSelect,
      external: performance.getEntriesByType('resource').map((r) => r.name).filter((u) => !u.startsWith(location.origin) && !u.startsWith('data:')),
    };
  });
  check(boot.summary.ready === true, 'summary().ready devrait être vrai');
  check(boot.summary.phase === 'menu', `phase attendue « menu », obtenue « ${boot.summary.phase} »`);
  check(boot.summary.headless === false, 'le contexte ne devrait pas être headless dans le navigateur');
  check(boot.summary.systems.length >= 1, 'au moins le système interne devrait être présent');
  check(boot.lang === 'fr', 'la page devrait être en français (lang="fr")');
  check(boot.hasGame && boot.hasUi, 'conteneurs #game et #ui attendus');
  check(!boot.splash, "l'écran de chargement devrait avoir disparu");
  check(boot.summary.view || /^Moteur prêt — \d+ systèmes?$/.test(boot.heading), `titre du panneau inattendu : « ${boot.heading} »`);
  check(!boot.scroll, 'la page ne devrait pas défiler');
  check(boot.touchAction === 'none', `touch-action attendu « none », obtenu « ${boot.touchAction} »`);
  check(boot.userSelect === 'none', `user-select attendu « none », obtenu « ${boot.userSelect} »`);
  check(boot.external.length === 0, 'appels réseau externes : ' + boot.external.join(', '));
  const file1 = await shot(page, 'boot');
  console.log('capture :', file1, '|', boot.heading, '| systèmes :', boot.summary.systems.map((s) => s.id).join(', '));

  // ── 1 bis. les boutons du panneau de diagnostic pilotent réellement la session ──
  if (!boot.summary.view) {
    const phase = () => page.evaluate(() => window.__CRS.ctx.session.phase);
    const button = (label) => page.getByRole('button', { name: label, exact: true });
    await button('Démarrer une session d’essai').click();
    await waitFor(page, "window.__CRS.ctx.session.phase === 'playing'", 30000);
    await button('Mettre en pause').click();
    check((await phase()) === 'paused', 'le bouton « Mettre en pause » devrait mettre la session en pause');
    await button('Reprendre').click();
    check((await phase()) === 'playing', 'le bouton « Reprendre » devrait relancer la session');
    await button('Avance rapide ×8').click();
    check((await page.evaluate(() => window.__CRS.ctx.clock.timeScale)) === 8, 'le bouton « Avance rapide ×8 » devrait régler clock.timeScale à 8');
    const t1 = await page.evaluate(() => window.__CRS.ctx.clock.now);
    await page.waitForTimeout(500);
    const t2 = await page.evaluate(() => window.__CRS.ctx.clock.now);
    check(t2 - t1 > 2, `en avance rapide ×8, 0,5 s réelle devrait simuler environ 4 s (simulé : ${(t2 - t1).toFixed(2)} s)`);
    await button('Avance rapide ×8').click();
    check((await page.evaluate(() => window.__CRS.ctx.clock.timeScale)) === 1, 'second clic : retour à la vitesse normale');
    await button('Terminer la session').click();
    check((await phase()) === 'menu', 'le bouton « Terminer la session » devrait ramener au menu');
    check(await button('Mettre en pause').isDisabled(), 'au menu, le bouton de pause devrait être inactif');
    console.log(`panneau : boutons vérifiés (avance rapide ×8 : ${(t2 - t1).toFixed(2)} s simulées en 0,5 s réelle)`);
  }

  // ── 2. session d'essai : démarrage par l'API de débogage, avance manuelle, pause, fin ──
  const run = await page.evaluate(async () => {
    const crs = window.__CRS;
    const events = [];
    crs.ctx.events.on('session:started', () => events.push('started'));
    crs.ctx.events.on('session:paused', (e) => events.push(e.paused ? 'paused' : 'resumed'));
    crs.ctx.events.on('session:ended', () => events.push('ended'));
    const cfg = await crs.start({ seed: 42 });
    const p = crs.ctx.people.spawn({ kind: 'crs', x: 3, z: 4 });
    crs.ctx.player.possess(p.id, 'crs');
    const before = crs.summary();
    const steps = crs.step(2);
    const after = crs.summary();
    const tp = crs.teleport(120, -60);
    crs.ctx.session.pause(true);
    const pausedSteps = crs.step(1);
    const pausedPhase = crs.ctx.session.phase;
    crs.ctx.session.pause(false);
    return { cfg, before, after, steps, tp, pausedSteps, pausedPhase, px: p.x, pz: p.z, events };
  });
  check(run.cfg && run.cfg.seed === 42 && Number.isFinite(run.cfg.x) && Number.isFinite(run.cfg.z), 'configuration de session inattendue');
  check(run.before.phase === 'playing', `phase attendue « playing », obtenue « ${run.before.phase} »`);
  check(run.before.entities.people >= 1 && run.before.player && run.before.player.personId > 0, 'personne incarnée attendue');
  check(run.steps === 60, `60 pas attendus pour 2 s, obtenus ${run.steps}`);
  check(run.after.time - run.before.time > 1.99, `le temps simulé devrait avancer de 2 s (avancé de ${run.after.time - run.before.time})`);
  check(run.px === 120 && run.pz === -60 && run.tp.x === 120, 'teleport() devrait déplacer le joueur');
  check(run.pausedSteps === 0 && run.pausedPhase === 'paused', 'aucun pas ne doit être simulé en pause');
  check(run.events.join(',') === 'started,paused,resumed', 'événements de session inattendus : ' + run.events.join(','));
  // mesures dans le navigateur : coût du moteur avec 500 personnes (création, pas de simulation, requêtes)
  const perf = await page.evaluate(() => {
    const crs = window.__CRS;
    const ctx = crs.ctx;
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) ctx.people.spawn({ kind: i % 6 === 0 ? 'crs' : 'manifestant', x: 200 + (i % 25) * 1.5, z: Math.floor(i / 25) * 1.5 });
    const spawnMs = performance.now() - t0;
    const t1 = performance.now();
    const steps = crs.step(20);
    const stepMs = (performance.now() - t1) / steps;
    const out = [];
    let found = 0;
    const t2 = performance.now();
    for (let n = 0; n < 20; n++) {
      for (const p of ctx.people.list) found += ctx.people.queryRadius(p.x, p.z, 2, out);
    }
    const queryMs = (performance.now() - t2) / 20;
    for (const p of ctx.people.list.slice()) if (!p.isPlayer) ctx.people.remove(p.id);
    return { spawnMs, steps, stepMs, queryMs, found, left: ctx.people.list.length };
  });
  check(perf.steps === 600 && perf.found > 0 && perf.left === 1, 'mesures de performance incohérentes');
  check(perf.stepMs < 2, `un pas de simulation à vide devrait coûter bien moins de 2 ms (mesuré : ${perf.stepMs.toFixed(3)} ms)`);
  console.log(
    `mesures (Chromium) : création de 500 personnes ${perf.spawnMs.toFixed(1)} ms | pas de simulation (500 personnes, index compris) ` +
      `${(perf.stepMs * 1000).toFixed(1)} µs | 500 requêtes de voisinage ${perf.queryMs.toFixed(3)} ms`,
  );

  // la boucle requestAnimationFrame fait avancer le temps toute seule
  const tA = await page.evaluate(() => window.__CRS.ctx.clock.now);
  await waitFor(page, `window.__CRS.ctx.clock.now > ${tA + 0.5}`, 60000);
  await page.waitForTimeout(400); // laisse le panneau se rafraîchir
  const file2 = await shot(page, 'boot-session');
  const loop = await page.evaluate(() => {
    const s = window.__CRS.summary();
    window.__CRS.ctx.session.end(false);
    return { fps: s.stats.fps, frames: s.stats.frames, phaseAfter: window.__CRS.ctx.session.phase };
  });
  check(loop.frames > 5, 'la boucle devrait avoir traité des images');
  check(loop.phaseAfter === 'menu', 'la session devrait être terminée');
  console.log('capture :', file2, '| images :', loop.frames, '| images/s :', loop.fps.toFixed(1));
  allErrors.push(...errors);
  await browser.close();
  browser = null;

  // ── 3. démarrage automatique par l'URL, sur un écran de téléphone ──
  ({ browser, page, errors } = await openPage(server.url + '?autostart=test&nomenu=1&quality=bas&seed=7', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  }));
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true');
  const auto = await page.evaluate(() => ({
    summary: window.__CRS.summary(),
    error: window.__CRS.error,
    launch: window.__CRS.ctx.service('launch'),
    quality: window.__CRS.ctx.settings.values.quality,
    mode: window.__CRS.ctx.session.config?.mode,
    seed: window.__CRS.ctx.session.config?.seed,
    scroll: document.documentElement.scrollWidth > window.innerWidth,
    cardWidth: document.querySelector('.diag-card')?.getBoundingClientRect().width ?? 0,
  }));
  check(auto.error === null, 'erreur de démarrage automatique : ' + auto.error);
  check(auto.summary.phase === 'playing', `autostart : phase attendue « playing », obtenue « ${auto.summary.phase} »`);
  check(auto.mode === 'test' && auto.seed === 7, 'autostart : configuration inattendue');
  check(auto.launch && auto.launch.nomenu === true && auto.launch.autostart === 'test', 'paramètres de lancement mal lus');
  check(auto.quality === 'bas', `qualité attendue « bas », obtenue « ${auto.quality} »`);
  check(!auto.scroll, 'la page ne devrait pas déborder en largeur sur téléphone');
  check(auto.summary.view || (auto.cardWidth > 0 && auto.cardWidth <= 390), 'le panneau devrait tenir dans la largeur du téléphone');
  await page.waitForTimeout(600);
  const file3 = await shot(page, 'boot-mobile');
  // le panneau est plus haut que l'écran : il doit pouvoir défiler jusqu'en bas
  const scrolled = await page.evaluate(() => {
    const d = document.querySelector('.diag');
    if (!d) return null;
    d.scrollTop = d.scrollHeight;
    const foot = document.querySelector('.diag-foot')?.getBoundingClientRect();
    return { scrollTop: d.scrollTop, overflow: d.scrollHeight - d.clientHeight, footBottom: foot ? foot.bottom : 0, touchAction: getComputedStyle(d).touchAction };
  });
  if (scrolled) {
    check(scrolled.overflow <= 0 || scrolled.scrollTop > 0, 'le panneau devrait défiler sur téléphone');
    check(scrolled.footBottom <= 844 + 1, 'le bas du panneau devrait être atteignable');
    check(scrolled.touchAction === 'pan-y', 'le panneau doit autoriser le défilement vertical au doigt');
    await shot(page, 'boot-mobile-bas');
  }
  console.log('capture :', file3, '| phase :', auto.summary.phase, '| qualité :', auto.quality);
  allErrors.push(...errors);
} catch (err) {
  problems.push('exception : ' + (err && err.stack ? err.stack : String(err)));
}

for (const p of problems) console.error('[boot] ÉCHEC — ' + p);
console.log('[boot] durée :', Date.now() - t0, 'ms');
await finish({ browser, server, errors: allErrors, ok: problems.length === 0, label: 'boot' });
