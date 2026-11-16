// Bout en bout — LE VRAI JEU (index.html, vraie carte de Paris, tous les modules branchés).
//
//   Ordinateur (960×540, qualité « bas ») : page d'accueil → scénario CRS lanceur de grenades, place de la Concorde →
//   chargement → en jeu : vue à la première puis à la troisième personne, déplacement au clavier (≥ 60 m, sans
//   traverser l'obélisque ni un mur), changement de caméra, lancer d'une grenade lacrymogène (projectile puis gaz),
//   carte, pause, paramètres. Zéro erreur console sur tout le parcours. Mesures : chargement, appels de dessin,
//   triangles, temps JavaScript par système, mémoire.
//   Téléphone (844×390 tactile) : même parcours abrégé, commandes tactiles visibles.
//
// Usage : node tests/e2e/game.mjs [--only=bureau|telephone] [--quality=bas] [--size=960x540]
// Captures : tests/e2e/out/game-*.png ; rapport : tests/e2e/out/game-report.json
// La simulation avance avec window.__CRS.step(secondes) : le WebGL logiciel de cette machine est trop lent pour
// attendre le temps réel (et le cœur borne le temps réel par image à 0,1 s).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, finish, OUT } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = (name) => !args.only || args.only === name;
const quality = args.quality ?? 'bas';
// petite fenêtre : chaque image coûte plusieurs dixièmes de seconde en WebGL logiciel
const [W, H] = (args.size ?? '960x540').split('x').map(Number);

const failures = [];
let checks = 0;
const check = (ok, msg, detail = '') => {
  checks++;
  if (ok) console.log('  ✓ ' + msg + (detail ? ` — ${detail}` : ''));
  else {
    failures.push(msg);
    console.error('  ✗ ' + msg + (detail ? ` — ${detail}` : ''));
  }
  return ok;
};
const frames = (page, n = 3) => page.evaluate((count) => new Promise((resolve) => {
  let k = 0;
  const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
/** Avance la simulation (sans attendre d'image : le WebGL logiciel met plusieurs dixièmes de seconde par image). */
const step = (page, seconds) => page.evaluate((s) => window.__CRS.step(s), seconds);
const state = (page) => page.evaluate(() => {
  const c = window.__CRS;
  const ctx = c.ctx;
  const p = ctx.player.person();
  const st = ctx.player.state;
  return {
    phase: ctx.session.phase, screen: ctx.ui.current, modal: ctx.ui.modal, camera: st.cameraMode, camYaw: st.camYaw,
    x: p ? p.x : NaN, z: p ? p.z : NaN, heading: p ? p.heading : NaN, active: p ? p.active : -2,
    item: p && p.active >= 0 ? p.inventory[p.active].id : '', free: p ? ctx.world.isFree(p.x, p.z, 0.05) : false,
    inBuilding: p ? ctx.world.buildingHeightAt(p.x, p.z) > 0 : false, people: ctx.people.list.length,
    projectiles: ctx.projectiles.list.length, t: ctx.clock.now,
  };
});
const report = { quality, bureau: null, telephone: null };

/** Capture avec un délai large : sous WebGL logiciel et machine chargée, une image peut demander plusieurs secondes. */
async function snap(page, name) {
  await frames(page, 2);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  return file;
}

/** Règle la page d'accueil (rôle CRS, poste, lieu) puis lance ; retourne le temps de chargement (ms). */
async function launchFromHome(page, { poste, tap }) {
  const click = async (selector, options) => {
    const loc = typeof selector === 'string' ? page.locator(selector) : selector;
    await loc.first().scrollIntoViewIfNeeded();
    if (tap) await loc.first().tap(options);
    else await loc.first().click(options);
  };
  await click('[data-id="role-crs"]');
  if (poste) await click(`[data-value="${poste}"]`);
  await click('[data-id="tab-lieu"]');
  await click(page.locator('.ui-list__item', { hasText: 'Place de la Concorde' }));
  await frames(page, 2);
  const t0 = Date.now();
  await click('[data-id="lancer"]');
  return t0;
}

// ═════════════════════════════════ ordinateur ═════════════════════════════════
async function bureau(server) {
  console.log(`[game] ordinateur ${W}×${H}`);
  const { browser, page, errors } = await openPage(`${server.url}?quality=${quality}`, { width: W, height: H });
  const r = { captures: [] };
  report.bureau = r;
  const capture = async (name) => {
    const file = await snap(page, name);
    r.captures.push(file);
    console.log('  capture : ' + file);
  };
  try {
    // ── page d'accueil ──
    const tBoot = Date.now();
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    r.bootMs = Date.now() - tBoot;
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    check(await page.evaluate(() => document.querySelector('.diag') === null), 'le panneau de diagnostic a disparu');
    check(await page.evaluate(() => document.querySelector('[data-id="role-commissaire"]') === null), 'pas de tuile « Commissaire » (commandant unique)');
    check(await page.evaluate(() => document.querySelector('[data-id="role-commandant"]') !== null), 'tuile « Commandant » présente');
    await capture('game-accueil');

    // ── lancement : CRS, lanceur de grenades, place de la Concorde ──
    const t0 = await launchFromHome(page, { poste: 'lanceur', tap: false });
    await waitFor(page, 'window.__CRS.ctx.session.phase !== "menu"', 30000);
    await page.waitForTimeout(400);
    if ((await state(page)).phase === 'loading') await capture('game-chargement');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 300000);
    r.loadMs = Date.now() - t0;
    r.loading = await page.evaluate(() => ({ ...window.__CRS.ctx.service('session.loading') }));
    console.log(`  chargement : ${(r.loadMs / 1000).toFixed(1)} s (monuments ${Math.round(r.loading.monumentsMs)} ms, ville ${Math.round(r.loading.cityMs)} ms)`);
    await frames(page, 5);

    const setup = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const s = c.service('session.setup').summary;
      const p = c.player.person();
      const cfg = c.session.config;
      const mates = c.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id);
      return {
        summary: s, kind: p.kind, poste: p.poste, rank: p.rank, role: c.player.state.role, place: cfg.place, quality: c.view.quality,
        inventory: p.inventory.map((i) => i.id), mates: mates.length, matesPostes: mates.map((m) => m.poste),
        vehicles: c.vehicles.list.map((v) => v.kind), obelisk: c.world.landmarks.find((l) => l.key === 'obelisque_concorde'),
        sector: c.world.sectorName(p.x, p.z),
      };
    });
    r.setup = setup;
    check(setup.role === 'crs' && setup.kind === 'crs' && setup.poste === 'lanceur', 'le joueur est un CRS lanceur de grenades', `${setup.kind} / ${setup.poste} / ${setup.rank}`);
    check(/concorde/i.test(setup.sector), 'il se trouve place de la Concorde', setup.sector);
    check(setup.quality === quality, `qualité « ${quality} »`);
    check(setup.mates === 5, 'son groupe de six CRS est en place', setup.matesPostes.join(', '));
    check(setup.vehicles.includes('fourgon_crs'), 'un fourgon de CRS est stationné');
    check(setup.inventory.includes('grenade_lacrymo'), 'il a des grenades lacrymogènes', setup.inventory.join(', '));
    let s = await state(page);
    check(s.camera === 'fps', 'vue de départ à la première personne');
    check(s.screen === null && !s.modal, 'aucun écran ouvert en jeu', String(s.screen));
    check(await page.evaluate(() => {
      const hud = document.querySelector('.ui-hud');
      return !!hud && getComputedStyle(hud).display !== 'none' && hud.getBoundingClientRect().width > 0;
    }), 'le HUD est affiché');
    check(await page.evaluate(() => document.querySelector('[data-id="minimap"]') !== null), 'la mini-carte est affichée');

    // ── première personne : face à l'obélisque, puis un regard vers les collègues ──
    await step(page, 0.5);
    await capture('game-fps');
    // capture de la souris par un clic sur la vue (le clic de capture ne déclenche aucune action)
    await page.mouse.click(W / 2, H * 0.42);
    await frames(page, 3);
    // regard vers la droite (flèches du clavier) : la ligne de boucliers est devant-droite, le fourgon derrière
    await page.keyboard.down('ArrowRight');
    await step(page, 0.55);
    await page.keyboard.up('ArrowRight');
    await step(page, 0.2);
    await capture('game-fps-collegues');
    const yawTurned = (await state(page)).camYaw;
    check(Math.abs(yawTurned - s.camYaw) > 0.3, 'le regard tourne au clavier', `${s.camYaw.toFixed(2)} → ${yawTurned.toFixed(2)} rad`);

    // ── troisième personne ──
    await page.keyboard.press('KeyV');
    await step(page, 0.4);
    s = await state(page);
    check(s.camera === 'tps', 'la touche V passe à la troisième personne', s.camera);
    await capture('game-tps-collegues');
    // retour face à l'obélisque
    await page.keyboard.down('ArrowLeft');
    await step(page, 0.55);
    await page.keyboard.up('ArrowLeft');
    await step(page, 0.3);
    await capture('game-tps');

    // ── déplacement : droit sur l'obélisque (on doit buter sur sa grille), puis contournement ──
    const start = await state(page);
    await page.keyboard.down('KeyW');
    await step(page, 3);
    const walk = await state(page);
    const dWalk = Math.hypot(walk.x - start.x, walk.z - start.z);
    // la boucle d'images fait aussi avancer la simulation en temps réel : la vitesse se mesure sur l'horloge simulée
    const vWalk = dWalk / Math.max(0.1, walk.t - start.t);
    check(vWalk > 0.9 && vWalk < 1.9, 'marche : environ 1,4 m/s', `${dWalk.toFixed(1)} m en ${(walk.t - start.t).toFixed(1)} s simulées, soit ${vWalk.toFixed(2)} m/s`);
    await page.keyboard.down('ShiftLeft');
    let travelled = dWalk;
    let last = walk;
    let minObelisk = Infinity;
    for (let i = 0; i < 12; i++) {
      await step(page, 2);
      const now = await state(page);
      travelled += Math.hypot(now.x - last.x, now.z - last.z);
      minObelisk = Math.min(minObelisk, Math.hypot(now.x - setup.obelisk.x, now.z - setup.obelisk.z));
      last = now;
      if (!now.free || now.inBuilding) break;
    }
    await capture('game-contre-obelisque');
    check(last.free && !last.inBuilding, 'après la course, le joueur n’est dans aucun obstacle');
    check(minObelisk > 2.2, 'il n’a pas traversé l’obélisque (arrêté par le socle ou la grille)', `distance minimale au centre ${minObelisk.toFixed(1)} m`);
    const blockedAt = await state(page);
    // on tourne d'un quart de tour et on repart en courant : la place est dégagée
    await page.keyboard.down('ArrowLeft');
    await step(page, 0.75);
    await page.keyboard.up('ArrowLeft');
    for (let i = 0; i < 10; i++) {
      await step(page, 2);
      const now = await state(page);
      travelled += Math.hypot(now.x - last.x, now.z - last.z);
      last = now;
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await step(page, 1);
    const end = await state(page);
    r.travelled = travelled;
    check(travelled >= 60, 'déplacement au clavier sur au moins 60 m', `${travelled.toFixed(0)} m parcourus`);
    check(Math.hypot(end.x - blockedAt.x, end.z - blockedAt.z) > 20, 'la position a changé après le contournement', `${Math.hypot(end.x - blockedAt.x, end.z - blockedAt.z).toFixed(0)} m`);
    check(end.free && !end.inBuilding, 'à l’arrivée, le joueur n’est dans aucun obstacle');
    await capture('game-apres-course');

    // ── changement de caméra ──
    await page.keyboard.press('KeyV');
    await step(page, 0.3);
    s = await state(page);
    check(s.camera === 'fps', 'la touche V revient à la première personne', s.camera);

    // ── grenade lacrymogène : sélection, lancer, projectile, gaz ──
    const slot = setup.inventory.indexOf('grenade_lacrymo') + 1;
    await page.keyboard.press(`Digit${slot}`);
    await step(page, 1.8); // mise en main
    s = await state(page);
    check(s.item === 'grenade_lacrymo', `la touche ${slot} met la grenade lacrymogène en main`, s.item);
    await capture('game-grenade-en-main');
    const before = await page.evaluate(() => ({ n: window.__CRS.ctx.projectiles.list.length, count: window.__CRS.ctx.actions.has(window.__CRS.ctx.player.person(), 'grenade_lacrymo') }));
    await page.mouse.down();
    await step(page, 0.7); // charge du lancer
    const charge = await page.evaluate(() => window.__CRS.ctx.player.state.charge);
    await page.mouse.up();
    await step(page, 0.6);
    const thrown = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const me = c.player.person();
      const pr = c.projectiles.list.filter((q) => q.ownerId === me.id);
      return { n: c.projectiles.list.length, mine: pr.map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, z: q.z })), count: c.actions.has(me, 'grenade_lacrymo') };
    });
    check(charge > 0.2, 'le lancer se charge en maintenant le clic', `charge ${charge.toFixed(2)}`);
    check(thrown.mine.length >= 1 && /lacrymo/.test(thrown.mine[0]?.kind ?? ''), 'un projectile apparaît', JSON.stringify(thrown.mine[0] ?? null));
    check(thrown.count === before.count - 1, 'une grenade a quitté la dotation', `${before.count} → ${thrown.count}`);
    await capture('game-grenade-en-vol');
    let gas = 0;
    let gasAt = null;
    for (let i = 0; i < 12 && gas <= 0.02; i++) {
      await step(page, 1);
      const g = await page.evaluate((id) => {
        const c = window.__CRS.ctx;
        let best = 0;
        let at = null;
        // le gaz est émis par la grenade et ses palets : on cherche le maximum autour de tous les projectiles du joueur
        const me = c.player.person();
        for (const q of c.projectiles.list) {
          if (q.ownerId !== me.id) continue;
          const v = c.hazards.gasAt(q.x, q.z);
          if (v > best) { best = v; at = { x: q.x, z: q.z, kind: q.kind }; }
        }
        return { best, at, id };
      }, thrown.mine[0]?.id ?? 0);
      gas = g.best;
      gasAt = g.at;
    }
    r.gas = gas;
    check(gas > 0.02, 'du gaz lacrymogène se répand au point de chute (ctx.hazards.gasAt > 0)', `concentration ${gas.toFixed(2)} ${gasAt ? `en (${gasAt.x.toFixed(0)}, ${gasAt.z.toFixed(0)})` : ''}`);
    check((await page.evaluate(() => window.__CRS.ctx.law.forceLog.length)) >= 1, 'l’emploi de la force est inscrit au journal');
    await capture('game-gaz');

    // ── carte ──
    await page.keyboard.press('KeyM');
    await frames(page, 4);
    await page.waitForTimeout(600);
    s = await state(page);
    check(s.screen === 'carte', 'la touche M ouvre le plan de Paris', String(s.screen));
    await capture('game-carte');
    await page.keyboard.press('KeyM');
    await frames(page, 3);
    s = await state(page);
    check(s.screen === null && s.phase === 'playing', 'la touche M referme le plan et le jeu reprend', `${s.screen} / ${s.phase}`);
    await page.keyboard.press('Tab');
    await frames(page, 4);
    await page.waitForTimeout(600);
    s = await state(page);
    check(s.screen === 'carte_tactique', 'la touche Tab ouvre la carte tactique', String(s.screen));
    await capture('game-carte-tactique');
    await page.keyboard.press('Tab');
    await frames(page, 3);
    s = await state(page);
    check(s.screen === null, 'la touche Tab referme la carte tactique', String(s.screen));

    // ── pause, paramètres ──
    await page.keyboard.press('KeyP');
    await frames(page, 4);
    await page.waitForTimeout(300);
    s = await state(page);
    check(s.screen === 'pause' && s.phase === 'paused', 'la touche P met en pause', `${s.screen} / ${s.phase}`);
    const tPaused = s.t;
    await capture('game-pause');
    await page.locator('[data-id="pause-parametres"]').click();
    await frames(page, 4);
    await page.waitForTimeout(300);
    s = await state(page);
    check(s.screen === 'parametres', 'les paramètres s’ouvrent depuis la pause', String(s.screen));
    await capture('game-parametres');
    await page.locator('[data-id="parametres-retour"]').click();
    await frames(page, 3);
    s = await state(page);
    check(s.screen === 'pause', 'retour à la pause', String(s.screen));
    check(s.t === tPaused, 'le temps simulé est figé en pause');
    await page.locator('[data-id="pause-reprendre"]').click();
    await frames(page, 4);
    s = await state(page);
    check(s.phase === 'playing' && s.screen === null, '« Reprendre » relance le jeu', `${s.phase} / ${s.screen}`);

    // ── mesures (vue à la première personne, place de la Concorde) ──
    await step(page, 1);
    await page.waitForTimeout(3000); // quelques dizaines d'images pour les moyennes glissantes
    r.perf = await page.evaluate(() => {
      const c = window.__CRS;
      const ctx = c.ctx;
      const perf = ctx.service('perf');
      const info = ctx.view.renderer.info;
      const base = ctx.service('render.base').stats;
      const mem = performance.memory ? { usedMB: performance.memory.usedJSHeapSize / 1048576, totalMB: performance.memory.totalJSHeapSize / 1048576 } : null;
      return {
        drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
        renderMs: base.renderMs, prepareMs: base.prepareMs, buffer: `${base.width}×${base.height}`,
        fps: perf.stats.fps, frameMs: perf.stats.avgFrameMs, simMs: perf.stats.simMs, presentMs: perf.stats.presentMs,
        systems: perf.systems.map((x) => ({ id: x.id, update: x.avgUpdateMs, frame: x.avgFrameMs, errors: x.errors, disabled: x.disabled })),
        people: ctx.people.list.length, props: ctx.props.list.length, shops: ctx.props.shops.length, vehicles: ctx.vehicles.list.length,
        memory: mem,
      };
    });
    const slow = r.perf.systems.filter((x) => x.update + x.frame > 4);
    console.log(`  rendu : ${r.perf.drawCalls} appels de dessin, ${Math.round(r.perf.triangles / 1000)} k triangles, tampon ${r.perf.buffer}`);
    console.log(`  JavaScript par image : ${r.perf.frameMs.toFixed(1)} ms (simulation ${r.perf.simMs.toFixed(1)}, présentation ${r.perf.presentMs.toFixed(1)} dont renderer.render ${r.perf.renderMs.toFixed(1)})`);
    for (const x of r.perf.systems) if (x.update + x.frame > 0.3) console.log(`    ${x.id.padEnd(22)} update ${x.update.toFixed(2)} ms  frame ${x.frame.toFixed(2)} ms${x.update + x.frame > 4 ? '   ← plus de 4 ms' : ''}`);
    if (r.perf.memory) console.log(`  mémoire JavaScript : ${r.perf.memory.usedMB.toFixed(0)} Mo utilisés`);
    r.slowSystems = slow.map((x) => x.id);
    check(r.perf.systems.every((x) => !x.disabled && x.errors === 0), 'aucun système en erreur ni désactivé', r.perf.systems.filter((x) => x.disabled || x.errors).map((x) => x.id).join(', '));
  } catch (err) {
    failures.push('exception : ' + (err && err.stack ? err.stack : String(err)));
    console.error(err);
    try { await snap(page, 'game-echec-bureau'); } catch { /* page fermée */ }
  }
  r.errors = errors.slice();
  check(errors.length === 0, 'zéro erreur console sur tout le parcours (ordinateur)', errors.slice(0, 3).join(' | '));
  await browser.close();
}

// ═════════════════════════════════ téléphone ═════════════════════════════════
async function telephone(server) {
  console.log('[game] téléphone 844×390 (tactile)');
  const { browser, page, errors } = await openPage(`${server.url}?quality=${quality}`, { width: 844, height: 390, mobile: true });
  const r = { captures: [] };
  report.telephone = r;
  const capture = async (name) => {
    const file = await snap(page, name);
    r.captures.push(file);
    console.log('  capture : ' + file);
  };
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    await capture('game-mobile-accueil');
    const t0 = await launchFromHome(page, { poste: 'lanceur', tap: true });
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 300000);
    r.loadMs = Date.now() - t0;
    console.log(`  chargement : ${(r.loadMs / 1000).toFixed(1)} s`);
    await step(page, 0.5);
    await frames(page, 5);
    const touch = await page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden';
      });
      const api = window.__CRS.ctx.service('input.touch');
      return {
        device: window.__CRS.ctx.input.device, layout: api ? api.layout : '', visible: api ? api.visible : false,
        buttons: vis('.crs-touch .ct-c').length, items: vis('.crs-touch .ct-item').length, stick: vis('.crs-touch .ct-stick, .crs-touch .ct-move').length,
      };
    });
    r.touch = touch;
    check(touch.visible && touch.buttons >= 6, 'les commandes tactiles sont visibles', JSON.stringify(touch));
    check(touch.items >= 3, 'la barre d’objets tactile est remplie', `${touch.items} cases`);
    await capture('game-mobile-jeu');

    // déplacement au joystick virtuel : un doigt posé à gauche, poussé vers le haut (à fond = course)
    const cdp = await page.context().newCDPSession(page);
    const start = await state(page);
    const finger = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await finger('touchStart', 130, 280);
    await finger('touchMove', 130, 250);
    await finger('touchMove', 130, 190);
    await step(page, 8);
    await capture('game-mobile-course');
    await finger('touchEnd', 130, 190);
    await step(page, 0.5);
    const end = await state(page);
    const d = Math.hypot(end.x - start.x, end.z - start.z);
    r.travelled = d;
    check(d > 8, 'le joystick virtuel déplace le personnage', `${d.toFixed(1)} m en 8 s`);
    check(end.free && !end.inBuilding, 'le joueur n’est dans aucun obstacle');

    // pause par le bouton tactile, puis reprise
    const pauseBtn = page.locator('.crs-touch [data-b="pause"], .crs-touch [data-button="pause"]').first();
    if (await pauseBtn.count()) await pauseBtn.tap();
    else await page.evaluate(() => window.__CRS.ctx.service('input.script').tap('pause'));
    await frames(page, 5);
    await page.waitForTimeout(300);
    let s = await state(page);
    check(s.screen === 'pause', 'la pause s’ouvre au doigt', String(s.screen));
    await capture('game-mobile-pause');
    await page.locator('[data-id="pause-reprendre"]').tap();
    await frames(page, 4);
    s = await state(page);
    check(s.phase === 'playing', 'reprise au doigt', s.phase);
    r.perf = await page.evaluate(() => {
      const ctx = window.__CRS.ctx;
      const info = ctx.view.renderer.info;
      return { drawCalls: info.render.calls, triangles: info.render.triangles };
    });
  } catch (err) {
    failures.push('exception (téléphone) : ' + (err && err.stack ? err.stack : String(err)));
    console.error(err);
    try { await snap(page, 'game-echec-telephone'); } catch { /* page fermée */ }
  }
  r.errors = errors.slice();
  check(errors.length === 0, 'zéro erreur console sur tout le parcours (téléphone)', errors.slice(0, 3).join(' | '));
  await browser.close();
}

const server = await startServer();
if (only('bureau')) await bureau(server);
if (only('telephone')) await telephone(server);
writeFileSync(path.join(OUT, 'game-report.json'), JSON.stringify(report, null, 2));
console.log(`[game] ${checks} vérifications, ${failures.length} échec(s). Rapport : ${path.join(OUT, 'game-report.json')}`);
for (const f of failures) console.error('  ✗ ' + f);
await finish({ server, errors: [], ok: failures.length === 0, label: 'game' });
