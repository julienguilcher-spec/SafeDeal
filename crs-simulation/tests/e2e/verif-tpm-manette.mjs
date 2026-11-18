// Testeur indépendant — MANETTE simulée (navigator.getGamepads remplacé), vrai jeu, 960×540, qualité « bas ».
// Accueil à la manette → lancement → sticks (déplacement, regard) → boutons → débranchement.
import { startServer, openPage, waitFor, frames, step, state, snap, J, R, makeChecker, installPad, PAD, padButton, padAxes } from './verif-tpm-lib.mjs';

const tag = 'verif-tpm-manette';
const C = makeChecker(tag);
const report = {};
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 960, height: 540 });
const tap = async (index, times = 1) => {
  for (let i = 0; i < times; i++) {
    await padButton(page, index, 1); await frames(page, 3);
    await padButton(page, index, 0); await frames(page, 3);
  }
};
const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('data-id') || e.getAttribute('data-value') || e.className || e.tagName).toString().slice(0, 60) : ''; });
const summary = () => page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' '));
const safe = async (name, fn) => {
  try { await fn(); } catch (err) { C.check(false, `exception dans « ${name} »`, String(err && err.message ? err.message : err).slice(0, 300)); }
};

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await installPad(page);
  await frames(page, 6);

  // ═════════════ 1. accueil à la manette ═════════════
  await safe('accueil', async () => {
    await tap(PAD.RIGHT);
    const dev = await page.evaluate(() => window.__CRS.ctx.input.device);
    C.check(dev === 'gamepad', 'la manette devient le périphérique actif', dev);
    // hub : la croix va jusqu'à la tuile « Mode libre », Start ouvre la tuile focalisée
    const hubTrail = [await focused()];
    for (let i = 0; i < 4 && (await focused()) !== 'accueil-libre'; i++) { await tap(PAD.RIGHT); hubTrail.push(await focused()); }
    C.check((await focused()) === 'accueil-libre', 'hub : tuile « Mode libre » atteinte à la croix', hubTrail.join(' > '));
    await tap(PAD.START);
    await frames(page, 3);
    C.check(await page.evaluate(() => !!document.querySelector('[data-id="lancer"]')), 'Start ouvre la tuile focalisée (éditeur du Mode libre)', await focused());
    await tap(PAD.RIGHT);
    const f1 = await focused();
    C.check(f1 === 'role-crs', 'croix droite : focus sur la première tuile de rôle', f1);
    await tap(PAD.A);
    C.check(/CRS|Gardien/i.test(await summary()), 'A valide le rôle CRS', (await summary()).slice(0, 120));
    // chercher le poste « lanceur » à la croix
    const trail = [];
    let found = false;
    // les postes forment une grille (deux par rangée sur cet écran) : bas jusqu'à « Porte-bouclier », puis droite
    for (let i = 0; i < 14 && !found; i++) {
      await tap(PAD.DOWN);
      const f = await focused(); trail.push(f);
      if (f === 'lanceur') found = true;
      if (f === 'bouclier') { await tap(PAD.RIGHT); const g = await focused(); trail.push('→' + g); if (g === 'lanceur') found = true; else break; }
    }
    if (!found) for (let i = 0; i < 8 && !found; i++) { await tap(PAD.RIGHT); const f = await focused(); trail.push('→' + f); if (f === 'lanceur') found = true; }
    if (!found) for (let i = 0; i < 8 && !found; i++) { await tap(PAD.LEFT); const f = await focused(); trail.push('←' + f); if (f === 'lanceur') found = true; }
    report.trailPoste = trail;
    C.check(found, 'le poste « lanceur » est atteignable à la croix directionnelle', trail.join(' > ').slice(0, 300));
    if (found) { await tap(PAD.A); C.check(/lanceur/i.test(await summary()), 'A valide le poste lanceur', (await summary()).slice(0, 140)); }
    await snap(page, `${tag}-accueil-role`);
    // B puis RB ×2 → Lieu
    await tap(PAD.B);
    const tabsBefore = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-id'));
    await tap(PAD.RB, 2);
    const tabLieu = await page.evaluate(() => document.querySelector('[data-id="tab-lieu"]')?.getAttribute('aria-selected'));
    C.check(tabLieu === 'true', 'RB ×2 : section « Lieu »', `${tabsBefore} → lieu=${tabLieu}`);
    await tap(PAD.RIGHT);
    const trail2 = [await focused()];
    // descendre jusqu'à « Place de la République » (ou à défaut le 2e lieu)
    let lieu = '';
    for (let i = 0; i < 12; i++) {
      const txt = await page.evaluate(() => (document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
      if (/Bastille/.test(txt)) { lieu = txt; break; }
      await tap(PAD.DOWN); trail2.push(await focused());
    }
    report.trailLieu = trail2;
    if (lieu) { await tap(PAD.A); C.check(/Bastille/.test(await summary()), 'A valide le lieu « Place de la Bastille »', (await summary()).slice(0, 160)); }
    else C.check(false, 'lieu « Bastille » atteignable à la croix', trail2.join(' > ').slice(0, 300));
    await snap(page, `${tag}-accueil-lieu`);
    // Foule : réduire l'affluence (gauche tenu)
    await tap(PAD.B);
    await tap(PAD.RB, 2);
    const tabFoule = await page.evaluate(() => document.querySelector('[data-id="tab-foule"]')?.getAttribute('aria-selected'));
    C.check(tabFoule === 'true', 'RB ×2 : section « Foule »', String(tabFoule));
    await tap(PAD.RIGHT);
    // la rubrique commence par le nom et les organisateurs de la manifestation : l'affluence est plus bas
    // appui d'une seule image : sous WebGL logiciel, une image dure ~0,4 s et un appui de trois images déclencherait la
    // répétition automatique de la croix (un pas de plus que voulu)
    const nudge = async (index) => { await padButton(page, index, 1); await frames(page, 1); await padButton(page, index, 0); await frames(page, 3); };
    const trailFoule = [await focused()];
    for (let i = 0; i < 10 && (await focused()) !== 'affluence'; i++) { await nudge(PAD.DOWN); trailFoule.push(await focused()); }
    report.trailFoule = trailFoule;
    console.log('  parcours vers l’affluence : ' + trailFoule.join(' > '));
    const f3 = await focused();
    const v0 = await page.evaluate(() => Number(document.querySelector('[data-id="affluence"]')?.getAttribute('aria-valuenow')));
    if (f3 === 'affluence') {
      await padButton(page, PAD.LEFT, 1); await page.waitForTimeout(2500); await frames(page, 2); await padButton(page, PAD.LEFT, 0); await frames(page, 3);
    }
    const v1 = await page.evaluate(() => Number(document.querySelector('[data-id="affluence"]')?.getAttribute('aria-valuenow')));
    C.check(f3 === 'affluence' && v1 < v0, 'curseur d’affluence réglable à la croix (gauche tenu)', `focus ${f3}, ${v0} → ${v1}`);
    report.affluence = { v0, v1 };
    // stick gauche dans le menu
    const fBefore = await focused();
    await padAxes(page, [0, 1, null, null]); await frames(page, 4); await padAxes(page, [0, 0, null, null]); await frames(page, 3);
    const fAfter = await focused();
    C.check(fAfter !== fBefore, 'le stick gauche déplace aussi le focus dans le menu', `${fBefore} → ${fAfter}`);
    await tap(PAD.START);
    const f4 = await focused();
    C.check(f4 === 'lancer', 'Start amène le focus sur « Lancer »', f4);
    await snap(page, `${tag}-accueil-lancer`);
  });

  // ═════════════ 2. lancement ═════════════
  const tL = Date.now();
  await safe('lancement', async () => {
    await tap(PAD.A);
    await waitFor(page, 'window.__CRS.ctx.session.phase !== "menu"', 60000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  });
  report.loadMs = Date.now() - tL;
  const cfg = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { role: c.session.config.role, place: c.session.config.place, crowd: c.session.config.crowdSize, poste: p?.poste, sector: p ? c.world.sectorName(p.x, p.z) : '', inv: p ? p.inventory.map((i) => i.id) : [], device: c.input.device, pointerLocked: c.input.pointerLocked }; });
  report.cfg = cfg;
  console.log(`  chargement ${(report.loadMs / 1000).toFixed(1)} s ; ` + J(cfg));
  C.check(cfg.role === 'crs' && cfg.poste === 'lanceur' && /Bastille/.test(cfg.place || ''), 'partie lancée à la manette avec les réglages faits à la manette', J({ role: cfg.role, poste: cfg.poste, place: cfg.place, crowd: cfg.crowd }));
  C.check(/bastille/i.test(cfg.sector), 'le joueur est place de la Bastille', cfg.sector);
  await step(page, 0.5); await frames(page, 4);
  await snap(page, `${tag}-jeu`);
  // libellés de l'aide : la manette doit être proposée
  const labels = await page.evaluate(() => { const l = window.__CRS.ctx.service('input.labels'); return l ? { interact: l.labelFor('interact'), primary: l.labelFor('primary'), move: l.moveLabel(), pad: l.padName } : null; });
  report.labels = labels;
  C.note('libellés affichés à la manette : ' + J(labels));

  // ═════════════ 3. sticks ═════════════
  await safe('sticks', async () => {
    const s0 = await state(page);
    await padAxes(page, [0, -0.5, 0, 0]); await frames(page, 3);
    await step(page, 3);
    const s1 = await state(page);
    const d1 = Math.hypot(s1.x - s0.x, s1.z - s0.z), v1 = d1 / (s1.t - s0.t);
    const fwd = ((s1.x - s0.x) * Math.sin(s0.camYaw) + (s1.z - s0.z) * Math.cos(s0.camYaw)) / Math.max(0.01, d1);
    C.check(d1 > 1.2 && fwd > 0.8, 'stick gauche à mi-course vers l’avant : marche vers l’avant', `${d1.toFixed(1)} m, ${v1.toFixed(2)} m/s, alignement ${fwd.toFixed(2)}`);
    await padAxes(page, [0, -1, 0, 0]); await frames(page, 3);
    await step(page, 3);
    const s2 = await state(page);
    const v2 = Math.hypot(s2.x - s1.x, s2.z - s1.z) / (s2.t - s1.t);
    C.check(v2 > v1 * 1.2, 'stick gauche à fond : plus rapide (course)', `${v2.toFixed(2)} m/s contre ${v1.toFixed(2)}`);
    // sprint : clic du stick gauche
    await padButton(page, PAD.L3, 1); await frames(page, 3);
    await step(page, 3);
    const s3 = await state(page);
    const v3 = Math.hypot(s3.x - s2.x, s3.z - s2.z) / (s3.t - s2.t);
    await padButton(page, PAD.L3, 0);
    C.check(v3 > v2 * 1.15, 'clic du stick gauche : sprint', `${v3.toFixed(2)} m/s contre ${v2.toFixed(2)}`);
    await padAxes(page, [0, 0, 0, 0]); await frames(page, 3); await step(page, 1);
    // regard : stick droit à droite pendant 0,5 s simulée
    const y0 = (await state(page));
    await padAxes(page, [0, 0, 1, 0]); await frames(page, 3);
    await step(page, 0.5);
    await padAxes(page, [0, 0, 0, 0]); await frames(page, 2);
    const y1 = await state(page);
    report.lookX = { before: y0.camYaw, after: y1.camYaw };
    C.check(y1.camYaw < y0.camYaw - 0.2, 'stick droit vers la droite : le regard tourne à droite', `lacet ${y0.camYaw.toFixed(2)} → ${y1.camYaw.toFixed(2)} rad`);
    await padAxes(page, [0, 0, 0, -1]); await frames(page, 3);
    await step(page, 0.3);
    await padAxes(page, [0, 0, 0, 0]); await frames(page, 2);
    const y2 = await state(page);
    C.check(y2.camPitch > y1.camPitch + 0.05, 'stick droit vers le haut : le regard monte', `site ${y1.camPitch.toFixed(2)} → ${y2.camPitch.toFixed(2)} rad`);
    await page.evaluate(() => { window.__CRS.ctx.player.state.camPitch = 0; });
    // dérive : le regard ne doit pas bouger stick au repos
    await step(page, 1); await frames(page, 3);
    const y3 = await state(page);
    await step(page, 1); await frames(page, 3);
    const y4 = await state(page);
    C.check(Math.abs(y4.camYaw - y3.camYaw) < 0.01 && Math.hypot(y4.x - y3.x, y4.z - y3.z) < 0.2, 'sticks au repos : ni dérive du regard ni du déplacement');
    C.check(y4.free && !y4.inBuilding, 'le joueur n’est dans aucun obstacle');
    await snap(page, `${tag}-apres-sticks`);
  });

  // ═════════════ 4. boutons ═════════════
  await safe('boutons', async () => {
    let s = await state(page);
    const cam0 = s.camera;
    await tap(PAD.R3); await step(page, 0.3);
    s = await state(page);
    C.check(s.camera !== cam0, 'clic du stick droit : change de vue', `${cam0} → ${s.camera}`);
    // objets : RB jusqu'à la grenade
    const inv = report.cfg.inv;
    let got = false;
    const seq = [];
    for (let i = 0; i < inv.length + 2 && !got; i++) {
      await tap(PAD.RB); await step(page, 1.8);
      s = await state(page); seq.push(s.item);
      got = s.item === 'grenade_lacrymo';
    }
    C.check(got, 'RB fait défiler les objets jusqu’à la grenade lacrymogène', seq.join(' > '));
    if (got) {
      const n0 = s.projectiles;
      await padButton(page, PAD.RT, 1); await frames(page, 3); await step(page, 0.7);
      const ch = (await state(page)).charge;
      await padButton(page, PAD.RT, 0); await frames(page, 3); await step(page, 0.6);
      s = await state(page);
      C.check(ch > 0.15 && s.projectiles > n0, 'gâchette droite : charge puis lance la grenade', `charge ${R(ch)}, ${n0} → ${s.projectiles} projectile(s)`);
    }
    await tap(PAD.LB); await step(page, 1.8);
    const sLB = await state(page);
    C.check(sLB.item !== s.item, 'LB : objet précédent', `${s.item} → ${sLB.item}`);
    // saut (A), accroupi (B)
    const y0 = sLB.y; let ymax = y0;
    await padButton(page, PAD.A, 1); await frames(page, 3); await step(page, 0.1);
    for (let i = 0; i < 6; i++) { await step(page, 0.08); ymax = Math.max(ymax, (await state(page)).y); }
    await padButton(page, PAD.A, 0); await frames(page, 2); await step(page, 0.6);
    C.check(ymax > y0 + 0.05, 'A : saut', `altitude ${y0.toFixed(2)} → ${ymax.toFixed(2)}`);
    await padButton(page, PAD.B, 1); await frames(page, 3); await step(page, 0.6);
    s = await state(page);
    C.check(/accroup|crouch/i.test(s.posture), 'B tenu : accroupi', s.posture);
    await padButton(page, PAD.B, 0); await frames(page, 2); await step(page, 0.6);
    // gâchette gauche : action secondaire
    await padButton(page, PAD.LT, 1); await frames(page, 3); await step(page, 0.4);
    const sec = await page.evaluate(() => window.__CRS.ctx.input.down('secondary'));
    await padButton(page, PAD.LT, 0); await frames(page, 2);
    C.check(sec === true, 'gâchette gauche : action secondaire tenue');
    // Select : plan ; B : ferme
    await tap(PAD.SELECT); await frames(page, 4); await page.waitForTimeout(400);
    s = await state(page);
    C.check(s.screen === 'carte', 'Select : ouvre le plan de Paris', String(s.screen));
    await snap(page, `${tag}-carte`);
    await tap(PAD.B); await frames(page, 3);
    s = await state(page);
    C.check(s.screen === null && s.phase === 'playing', 'B : referme le plan', `${s.screen} / ${s.phase}`);
    // croix : radio (haut), ordres (droite), masque (bas), visière (gauche)
    for (const [name, b] of [['radio', PAD.UP], ['ordres', PAD.RIGHT]]) {
      await tap(b); await frames(page, 4); await page.waitForTimeout(300);
      s = await state(page);
      report['screen_' + name] = s.screen;
      C.note(`croix ${name} → écran « ${s.screen} »`);
      if (s.screen) { await snap(page, `${tag}-${name}`); await tap(PAD.B); await frames(page, 3); s = await state(page);
        C.check(s.screen === null, `écran « ${name} » : B le referme`, String(s.screen));
        if (s.screen !== null) { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); await frames(page, 3); } }
    }
    const g0 = await state(page);
    await tap(PAD.DOWN); await step(page, 2.5);
    const g1 = await state(page);
    C.check(g1.gasProtection !== g0.gasProtection || g1.look !== g0.look, 'croix bas : masque à gaz', `protection ${g0.gasProtection} → ${g1.gasProtection}`);
    // carte tactique : aucune touche de manette par défaut (compte rendu des entrées) — vérifier
    const tacLabel = await page.evaluate(() => window.__CRS.ctx.service('input.labels')?.labelFor('tactical', 'gamepad'));
    report.tacticalPadLabel = tacLabel;
    C.check(!!tacLabel, 'la carte tactique a un bouton de manette', `libellé : « ${tacLabel} »`);
    // Start : pause ; navigation ; B : reprise
    await tap(PAD.START); await frames(page, 4); await page.waitForTimeout(300);
    s = await state(page);
    C.check(s.screen === 'pause' && s.phase === 'paused', 'Start : pause', `${s.screen} / ${s.phase}`);
    await tap(PAD.DOWN, 2);
    const fp = await focused();
    C.check(/^pause-/.test(fp), 'navigation à la croix dans le menu de pause', fp);
    await snap(page, `${tag}-pause`);
    await tap(PAD.B); await frames(page, 3);
    s = await state(page);
    C.check(s.phase === 'playing' && s.screen === null, 'B : reprise', `${s.phase} / ${s.screen}`);
  });

  // ═════════════ 5. débranchement à chaud ═════════════
  await safe('débranchement', async () => {
    await padAxes(page, [0, -1, 0, 0]); await frames(page, 3); await step(page, 0.5);
    await page.evaluate(() => {
      const pad = window.__pad; pad.connected = false;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [null, null, null, null], configurable: true });
      const ev = new Event('gamepaddisconnected'); ev.gamepad = pad; window.dispatchEvent(ev);
    });
    await frames(page, 6); await page.waitForTimeout(500); await frames(page, 3);
    const s = await state(page);
    C.check(s.phase === 'paused' || s.screen === 'pause', 'manette débranchée en jeu : pause automatique', `${s.phase} / ${s.screen}`);
    const mv = await page.evaluate(() => ({ x: window.__CRS.ctx.input.moveX, y: window.__CRS.ctx.input.moveY, device: window.__CRS.ctx.input.device }));
    C.check(Math.abs(mv.x) < 0.01 && Math.abs(mv.y) < 0.01, 'manette débranchée : axes remis à zéro (le personnage ne continue pas de courir)', J(mv));
    await snap(page, `${tag}-debranchee`);
  });
} catch (err) {
  C.check(false, 'exception générale', String(err && err.stack ? err.stack : err).slice(0, 400));
  try { await snap(page, `${tag}-echec`); } catch { /* */ }
}
report.errors = errors.slice();
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
