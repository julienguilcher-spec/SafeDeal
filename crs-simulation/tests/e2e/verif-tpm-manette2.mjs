// Testeur indépendant — MANETTE, seconde passe : poste choisi à la croix, lancer à la gâchette, saut, masque,
// accès à la carte tactique, capture de la souris après « B : reprise », roue d'ordres d'un chef de groupe.
// Usage : node tests/e2e/verif-tpm-manette2.mjs [--role=crs|chef_groupe]
import { startServer, openPage, waitFor, frames, step, state, snap, J, R, makeChecker, installPad, PAD, padButton, padAxes } from './verif-tpm-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const role = args.role ?? 'crs';
const tag = `verif-tpm-manette2-${role}`;
const C = makeChecker(tag);
const report = { role };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 960, height: 540 });
const tap = async (index, times = 1) => { for (let i = 0; i < times; i++) { await padButton(page, index, 1); await frames(page, 3); await padButton(page, index, 0); await frames(page, 3); } };
const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('data-id') || e.getAttribute('data-value') || e.className || e.tagName).toString().slice(0, 60) : ''; });
const summary = () => page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' '));
const safe = async (name, fn) => { try { await fn(); } catch (err) { C.check(false, `exception dans « ${name} »`, String(err && err.message ? err.message : err).slice(0, 300)); } };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await installPad(page); await frames(page, 6);
  await safe('accueil', async () => {
    await tap(PAD.RIGHT);
    // hub : tuile « Mode libre » à la croix, ouverte par A
    const hubTrail = [await focused()];
    for (let i = 0; i < 4 && (await focused()) !== 'accueil-libre'; i++) { await tap(PAD.RIGHT); hubTrail.push(await focused()); }
    C.check((await focused()) === 'accueil-libre', 'hub : tuile « Mode libre » atteinte à la croix', hubTrail.join(' > '));
    await tap(PAD.A);
    await frames(page, 3);
    await tap(PAD.RIGHT);
    // aller sur la tuile du rôle voulu
    const trail = [await focused()];
    for (let i = 0; i < 12 && (await focused()) !== `role-${role}`; i++) { await tap(PAD.RIGHT); trail.push(await focused()); }
    C.check((await focused()) === `role-${role}`, `tuile « ${role} » atteinte à la croix`, trail.join(' > '));
    await tap(PAD.A);
    if (role === 'crs') {
      const t2 = [];
      for (let i = 0; i < 10 && (await focused()) !== 'bouclier'; i++) { await tap(PAD.DOWN); t2.push(await focused()); }
      await tap(PAD.RIGHT); t2.push('→' + await focused());
      const ok = (await focused()) === 'lanceur';
      C.check(ok, 'poste « lanceur » atteint : bas jusqu’à « Porte-bouclier », puis droite', t2.join(' > '));
      if (ok) await tap(PAD.A);
      C.check(/lanceur/i.test(await summary()), 'poste « lanceur » validé par A', (await summary()).slice(0, 90));
    }
    // affluence au minimum
    await tap(PAD.B);
    const sel = async () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-id'));
    for (let i = 0; i < 9 && (await sel()) !== 'tab-foule'; i++) await tap(PAD.RB);
    await tap(PAD.RIGHT);
    // la rubrique commence par le nom et les organisateurs de la manifestation : l'affluence est plus bas
    // appui d'une seule image (sous WebGL logiciel, trois images déclencheraient la répétition de la croix)
    for (let i = 0; i < 10 && (await focused()) !== 'affluence'; i++) { await padButton(page, PAD.DOWN, 1); await frames(page, 1); await padButton(page, PAD.DOWN, 0); await frames(page, 3); }
    if ((await focused()) === 'affluence') { await padButton(page, PAD.LEFT, 1); await page.waitForTimeout(2500); await padButton(page, PAD.LEFT, 0); await frames(page, 3); }
    await tap(PAD.START);
    C.check((await focused()) === 'lancer', 'Start : focus sur « Lancer »', await focused());
    await tap(PAD.A);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  });
  const cfg = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { role: c.session.config.role, place: c.session.config.place, crowd: c.session.config.crowdSize, poste: p?.poste, rank: p?.rank, inv: p ? p.inventory.map((i) => i.id) : [] }; });
  report.cfg = cfg; console.log('  ' + J(cfg));
  await step(page, 0.5); await frames(page, 3);
  if (role === 'crs') await safe('grenade', async () => {
    let s = await state(page); const seq = []; let got = false;
    for (let i = 0; i < cfg.inv.length + 2 && !got; i++) { await tap(PAD.RB); await step(page, 1.8); s = await state(page); seq.push(s.item); got = s.item === 'grenade_lacrymo'; }
    C.check(got, 'RB : défile jusqu’à la grenade lacrymogène', seq.join(' > '));
    const n0 = s.projectiles;
    await padButton(page, PAD.RT, 1); await frames(page, 2); await step(page, 0.7);
    const ch = (await state(page)).charge;
    await padButton(page, PAD.RT, 0); await frames(page, 2); await step(page, 0.6);
    s = await state(page);
    C.check(ch > 0.15 && s.projectiles > n0, 'gâchette droite tenue puis relâchée : la grenade part', `charge ${R(ch)}, projectiles ${n0} → ${s.projectiles}`);
    await step(page, 5); await frames(page, 3); await snap(page, `${tag}-grenade`);
  });
  await safe('saut', async () => {
    const s0 = await state(page); const st0 = await page.evaluate(() => window.__CRS.ctx.player.person().stamina);
    await padButton(page, PAD.A, 1); await frames(page, 1);
    const ys = [];
    for (let i = 0; i < 10; i++) { await step(page, 0.05); ys.push(R((await state(page)).y - s0.y)); }
    await padButton(page, PAD.A, 0); await frames(page, 2);
    const st1 = await page.evaluate(() => window.__CRS.ctx.player.person().stamina);
    report.jump = { ys, st0, st1, posture: s0.posture };
    C.check(Math.max(...ys) > 0.05 || st1 < st0 - 3, 'A : le saut a lieu (altitude ou endurance dépensée)', `hauteurs ${ys.join(', ')} m ; endurance ${R(st0)} → ${R(st1)} ; posture ${s0.posture}`);
    if (!(Math.max(...ys) > 0.05)) C.note('saut : l’altitude du personnage (Person.y) ne varie pas pendant le saut — le saut n’est visible que si le rendu le dessine');
  });
  await safe('masque', async () => {
    const g0 = await state(page);
    await tap(PAD.DOWN); await step(page, 9.5); await frames(page, 2);
    const g1 = await state(page);
    C.check(g1.gasProtection > g0.gasProtection, 'croix bas : masque à gaz en place après 8 s', `protection ${g0.gasProtection} → ${g1.gasProtection}`);
  });
  await safe('ordres', async () => {
    // la roue est tenue : croix droite maintenue, direction au stick, relâcher valide
    const before = await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get ? c.squads.get(me.squadId) : c.squads.list.find((q) => q.id === me.squadId); return { order: sq && sq.order ? sq.order.type : null, issuedAt: sq && sq.order ? sq.order.issuedAt : null, squad: me.squadId, leader: sq ? sq.leaderId === me.id : null }; });
    await padButton(page, PAD.RIGHT, 1); await frames(page, 3); await page.waitForTimeout(400);
    const held = await state(page);
    report.ordersHeld = held.screen;
    await snap(page, `${tag}-roue-tenue`);
    C.check(held.screen === 'roue_ordres' || role === 'crs', `croix droite maintenue (${role}) : la roue d’ordres s’affiche`, `écran « ${held.screen} »`);
    if (held.screen === null) {
      const toast = await page.evaluate(() => [...document.querySelectorAll('.crs-ui [class*="notice"], .crs-ui [class*="toast"]')].map((e) => (e.textContent || '').trim().slice(0, 60)).filter((t) => !/^Faute/.test(t)));
      C.check(toast.length > 0, `croix droite (${role}) sans roue : un message explique pourquoi`, toast.join(' | ') || 'aucun message');
    } else {
      await padAxes(page, [0, -0.95, null, null]); await frames(page, 4); await page.waitForTimeout(200);
      // (le secteur surligné est un tracé sans texte : son nom se lit au centre de la roue, « cw-title »)
      const sel = await page.evaluate(() => {
        const w = document.querySelector('[data-id="order-wheel"]');
        const hot = w ? w.querySelectorAll('.cw-wedge.is-hot').length : 0;
        const title = w ? (w.querySelector('.cw-title')?.textContent || '').trim() : '';
        return hot > 0 ? [title || 'secteur'] : [];
      });
      report.wheelSel = sel;
      await snap(page, `${tag}-roue-stick-haut`);
      C.check(sel.length > 0, 'roue d’ordres : le stick gauche désigne un secteur', sel.join(' | ') || 'aucun secteur mis en évidence');
      await padButton(page, PAD.RIGHT, 0); await frames(page, 4);
      await padAxes(page, [0, 0, null, null]); await frames(page, 2); await step(page, 0.5);
      const after = await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get ? c.squads.get(me.squadId) : c.squads.list.find((q) => q.id === me.squadId); return { order: sq && sq.order ? sq.order.type : null, issuedAt: sq && sq.order ? sq.order.issuedAt : null, screen: c.ui.current }; });
      report.orderAfter = { before, after };
      C.check(after.screen === null, 'relâcher la croix referme la roue', String(after.screen));
      C.check(after.order !== before.order || after.issuedAt !== before.issuedAt, 'relâcher valide l’ordre désigné (ordre de l’unité modifié)', `ordre ${before.order} → ${after.order} (émis à ${before.issuedAt} → ${after.issuedAt})`);
      if (after.screen) { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); await frames(page, 3); }
    }
    await padButton(page, PAD.RIGHT, 0); await padAxes(page, [0, 0, null, null]); await frames(page, 2);
  });
  await safe('carte tactique', async () => {
    const lab = await page.evaluate(() => { const l = window.__CRS.ctx.service('input.labels'); return { tactical: l.labelFor('tactical', 'gamepad'), map: l.labelFor('map', 'gamepad'), orders: l.labelFor('orders', 'gamepad') }; });
    report.labels = lab;
    await tap(PAD.SELECT); await frames(page, 4); await page.waitForTimeout(400);
    const inPlan = await page.evaluate(() => [...document.querySelectorAll('.crs-ui button')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[inert]')).map((e) => (e.getAttribute('data-id') || '') + ':' + (e.textContent || '').trim().slice(0, 22)));
    await tap(PAD.B); await frames(page, 3);
    await tap(PAD.START); await frames(page, 4); await page.waitForTimeout(300);
    const inPause = await page.evaluate(() => [...document.querySelectorAll('.crs-ui button')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[inert]')).map((e) => (e.getAttribute('data-id') || '') + ':' + (e.textContent || '').trim().slice(0, 22)));
    const padHelp = await page.evaluate(() => (document.querySelector('.ui-pause')?.textContent || '').replace(/\s+/g, ' ').slice(0, 600));
    report.padHelp = padHelp;
    await snap(page, `${tag}-pause-aide`);
    const way = [...inPlan, ...inPause].find((b) => /tacti/i.test(b));
    C.check(!!lab.tactical || !!way, 'la carte tactique est accessible à la manette (bouton ou entrée de menu)', `libellé manette : « ${lab.tactical} » ; boutons du plan : ${inPlan.join(', ').slice(0, 200)} ; menu de pause : ${inPause.join(', ').slice(0, 200)}`);
    await tap(PAD.B); await frames(page, 4);
    const s = await state(page);
    const lock = await page.evaluate(() => { const l = !!document.pointerLockElement; if (l) document.exitPointerLock(); return l; });
    C.check(s.phase === 'playing', 'B : reprise', `${s.phase} / ${s.screen}`);
    C.note(`après « B : reprise » à la manette, souris capturée : ${lock} (sous Chromium sans tête la capture est accordée sans geste ; elle est relâchée par le test)`);
    report.lockAfterB = lock;
  });
  await snap(page, `${tag}-fin`);
} catch (err) { C.check(false, 'exception générale', String(err && err.stack ? err.stack : err).slice(0, 400)); }
report.errors = errors.slice();
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
