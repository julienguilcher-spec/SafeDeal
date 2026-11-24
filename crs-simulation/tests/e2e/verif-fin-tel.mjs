// Testeur indépendant — CONTRÔLE FINAL, parcours complet sur TÉLÉPHONE 844×390 (émulation tactile, doigts simulés par CDP) :
// accueil au doigt → CRS lanceur → Concorde → Lancer → joystick (marche, course) → regard au doigt → caméra → objet → lancer
// → carte → carte tactique → pause → compte rendu → accueil.
// Usage : node tests/e2e/verif-fin-tel.mjs [--size=844x390]
import { startServer, openPage, waitFor, ouvrirEditeur, frames, step, state, snap, notices, sysErrors, census, makeChecker, args, J, R, fingers, rects, overlap } from './verif-fin-lib.mjs';
const tag = 'verif-fin-tel';
const C = makeChecker(tag);
const [W, H] = (args.size ?? '844x390').split('x').map(Number);
const report = { size: `${W}x${H}` };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}`, { width: W, height: H, mobile: true, deviceScaleFactor: 2 });
const F = await fingers(page);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const tapSel = async (sel, scroll = true) => {
  if (scroll) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center', inline: 'nearest' }), sel);
  await frames(page, 2);
  const r = (await rects(page, sel))[0];
  if (!r) return false;
  await F.tap(...center(r));
  await frames(page, 3);
  return true;
};
const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => !/ct-off/.test(r.cls));
const tapCtl = async (key) => { const r = await ctl(key); if (!r) return false; await F.tap(...center(r)); await frames(page, 3); return true; };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await ouvrirEditeur(page);
  await frames(page, 4);
  await snap(page, tag + '-01-accueil');
  const q = await page.evaluate(() => ({ q: window.__CRS.ctx.view ? window.__CRS.ctx.view.quality : null, dpr: devicePixelRatio, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight }));
  C.check(q.q === 'bas', 'téléphone : qualité « bas » choisie d’office', J(q));
  C.check(q.docW <= W + 1 && q.docH <= H + 1, 'accueil : la page ne déborde pas', `${q.docW}×${q.docH}`);
  C.check(await tapSel('[data-id="role-crs"]'), 'tuile CRS au doigt');
  C.check(await tapSel('[data-value="lanceur"]'), 'poste « lanceur » au doigt');
  C.check(await tapSel('[data-id="tab-lieu"]'), 'onglet Lieu au doigt');
  const lieu = await page.evaluate(() => { const e = [...document.querySelectorAll('.ui-list__item')].find((x) => /Place de la Concorde/.test(x.textContent || '')); if (!e) return false; e.setAttribute('data-vf', 'concorde'); return true; });
  C.check(lieu && await tapSel('[data-vf="concorde"]'), 'lieu « Place de la Concorde » au doigt');
  const sum = await page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || document.body.textContent || '').replace(/\s+/g, ' '));
  C.check(/Concorde/.test(sum) && /lanceur/i.test(sum), 'le résumé reflète les choix', sum.slice(0, 200));
  await snap(page, tag + '-02-accueil-regle');
  const t0 = Date.now();
  C.check(await tapSel('[data-id="lancer"]'), '« Lancer » au doigt');
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  report.loadMs = Date.now() - t0;
  C.note(`chargement : ${(report.loadMs / 1000).toFixed(1)} s`);
  await frames(page, 4);
  await snap(page, tag + '-03-depart');
  const cs = await census(page);
  report.census = cs;
  console.log('  recensement : ' + J({ police: cs.police, vehicles: cs.vehicles, protest: cs.protest, sector: cs.sector, moyens: cs.extra?.moyens, crowd: cs.crowdSize }));
  const lay = await page.evaluate(() => { const c = window.__CRS.ctx; const api = c.service('input.touch'); const s = c.service('render.base').stats; return { device: c.input.device, layout: api?.layout, visible: api?.visible, buf: `${s.width}×${s.height}`, pr: s.pixelRatio, camera: c.player.state.cameraMode }; });
  report.layout = lay;
  C.check(lay.device === 'touch' && lay.visible === true, 'commandes tactiles affichées', J(lay));
  // chevauchements commandes ↔ HUD
  const controls = (await rects(page, '.crs-touch .ct-c')).filter((r) => !/ct-off/.test(r.cls));
  const items = await rects(page, '.crs-touch .ct-item');
  const hud = await rects(page, '.ui-hud .hud-sit, .ui-hud .hud-compass, .ui-hud .hud-band, .ui-hud .hud-status, .ui-hud [data-id="minimap"]');
  const subs = await rects(page, '.ui-subtitles > *, .ui-subtitle');
  const over = [];
  const name = (r) => r.id || (r.cls.match(/ct-k-(\w+)/)?.[0]) || r.cls.split(' ')[0];
  for (const a of hud) for (const b of [...controls, ...items]) { const o = overlap(a, b); if (o > 30) over.push(`${name(a)}×${name(b)} (${o} px²)`); }
  const subOver = [];
  for (const a of subs) for (const b of [...hud, ...controls, ...items]) { const o = overlap(a, b); if (o > 30) subOver.push(`sous-titre×${name(b)} (${o} px²)`); }
  C.check(over.length === 0, 'aucun élément de HUD sous une commande tactile', over.join(' ; '));
  C.note(`${controls.length} boutons tactiles, ${items.length} cases d’objets ; sous-titres : ${subs.length} bandeau(x) ; recouvrements sous-titres : ${subOver.join(' ; ') || 'aucun'}`);
  report.subOver = subOver;

  // ── joystick : mi-course (marche) puis à fond (course) ──
  const s0 = await state(page);
  const jx = W * 0.16, jy = H * 0.72;
  await F.down(1, jx, jy); await F.move(1, jx, jy - 14); await F.move(1, jx, jy - 26);
  await step(page, 5);
  const s1 = await state(page);
  const v1 = Math.hypot(s1.x - s0.x, s1.z - s0.z) / (s1.t - s0.t);
  C.check(v1 > 0.5, 'joystick à mi-course : le personnage avance', `${R(Math.hypot(s1.x - s0.x, s1.z - s0.z), 1)} m, ${R(v1)} m/s`);
  await F.move(1, jx, jy - 45); await F.move(1, jx, jy - 62);
  await step(page, 5);
  const s2 = await state(page);
  const v2 = Math.hypot(s2.x - s1.x, s2.z - s1.z) / (s2.t - s1.t);
  C.check(v2 > v1 * 1.3, 'joystick à fond : il court', `${R(v2)} m/s contre ${R(v1)}`);
  // regard : glisser à droite de l'écran pendant que le joystick est tenu
  // le doigt se pose sur l'image (zone du regard), pas sur un bouton du HUD qui s'y trouverait (zone de gauche)
  const [lx, ly] = await page.evaluate(([w, h]) => {
    for (const [fx, fy] of [[0.62, 0.5], [0.66, 0.42], [0.58, 0.36], [0.7, 0.5], [0.55, 0.62]]) {
      const e = document.elementFromPoint(w * fx, h * fy);
      if (e && e.closest('[data-ct="look"]') && document.elementFromPoint(w * fx + 110, h * fy)?.closest('[data-ct="look"]')) return [w * fx, h * fy];
    }
    return [w * 0.62, h * 0.5];
  }, [W, H]);
  await F.drag(2, lx, ly, lx + 110, ly, 6);
  await step(page, 0.4);
  const s3 = await state(page);
  C.check(Math.abs(s3.camYaw - s2.camYaw) > 0.1, 'glisser à droite de l’écran fait tourner le regard', `${R(s2.camYaw)} → ${R(s3.camYaw)} rad`);
  await F.up(1);
  await step(page, 0.5);
  await snap(page, tag + '-04-apres-course');
  C.check(s3.free && !s3.inBuilding, 'le joueur n’est dans aucun obstacle');

  // ── caméra ──
  const c0 = (await state(page)).camera;
  C.check(await tapCtl('camera'), 'bouton « Caméra » touché');
  await step(page, 0.4);
  const c1 = (await state(page)).camera;
  C.check(c1 !== c0, 'le bouton Caméra bascule la vue', `${c0} → ${c1}`);
  await snap(page, tag + '-05-camera-' + c1);
  if (c1 !== 'fps') { await tapCtl('camera'); await step(page, 0.4); }

  // ── grenade : case d'objet au doigt, bouton Action maintenu puis relâché ──
  await page.evaluate(() => { const c = window.__CRS; const s = c.ctx.service('session.setup').summary; c.teleport(s.x + Math.sin(s.heading) * 8, s.z + Math.cos(s.heading) * 8); c.ctx.player.state.camYaw = s.heading; c.ctx.player.state.camPitch = 0; });
  await step(page, 0.5);
  const inv = await page.evaluate(() => window.__CRS.ctx.player.person().inventory.map((i) => i.id));
  const gi = inv.indexOf('grenade_lacrymo');
  const item = (await rects(page, `.crs-touch .ct-item[data-ct="i${gi}"]`))[0] ?? (await rects(page, '.crs-touch .ct-item'))[gi];
  if (C.check(!!item, 'case « grenade lacrymogène » présente dans la barre tactile', inv.join(', '))) {
    await F.tap(...center(item)); await frames(page, 3);
    await step(page, 1.8);
    const s = await state(page);
    C.check(s.item === 'grenade_lacrymo', 'la case met la grenade en main', s.item);
    const act = await ctl('primary');
    const n0 = await page.evaluate(() => window.__CRS.ctx.actions.has(window.__CRS.ctx.player.person(), 'grenade_lacrymo'));
    await F.down(3, ...center(act)); await frames(page, 2);
    await step(page, 0.8);
    const charge = await page.evaluate(() => window.__CRS.ctx.player.state.charge);
    await F.up(3); await frames(page, 2);
    await step(page, 0.6);
    const thr = await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); return { mine: c.projectiles.list.filter((q) => q.ownerId === me.id).length, left: c.actions.has(me, 'grenade_lacrymo') }; });
    C.check(charge > 0.15 && thr.left === n0 - 1, 'bouton « Action » maintenu puis relâché : la grenade part', `charge ${R(charge)}, dotation ${n0} → ${thr.left}, ${thr.mine} projectile(s)`);
    await step(page, 6);
    await snap(page, tag + '-06-gaz');
    C.note('notifications : ' + (await notices(page)).join(' | ').slice(0, 220));
  }

  // ── carte, carte tactique ──
  C.check(await tapCtl('map'), 'bouton « Carte » touché');
  await page.waitForTimeout(600); await frames(page, 3);
  let s = await state(page);
  C.check(s.screen === 'carte', 'le plan s’ouvre', String(s.screen));
  await snap(page, tag + '-07-plan');
  const closeBtn = async () => { const b = (await rects(page, '[data-id="plan-close"], [data-id="tac-close"], .ui-screen [data-id="fermer"], .ui-screen .ui-close, [data-id$="-fermer"], [aria-label="Fermer"]'))[0]; if (b) { await F.tap(...center(b)); await frames(page, 3); return true; } return false; };
  const closed1 = await closeBtn();
  s = await state(page);
  if (s.screen !== null) { await page.keyboard.press('Escape'); await frames(page, 3); s = await state(page); }
  C.check(closed1 && s.screen === null, 'le plan se referme au doigt (bouton de fermeture)', `bouton trouvé : ${closed1}, écran ${s.screen}`);
  C.check(await tapCtl('tactical'), 'bouton « Tactique » touché');
  await page.waitForTimeout(600); await frames(page, 3);
  s = await state(page);
  C.check(s.screen === 'carte_tactique', 'la carte tactique s’ouvre', String(s.screen));
  await snap(page, tag + '-08-tactique');
  const closed2 = await closeBtn();
  s = await state(page);
  if (s.screen !== null) { await page.keyboard.press('Escape'); await frames(page, 3); s = await state(page); }
  C.check(closed2 && s.screen === null, 'la carte tactique se referme au doigt', `bouton trouvé : ${closed2}, écran ${s.screen}`);

  // ── pause, compte rendu, accueil ──
  C.check(await tapCtl('pause'), 'bouton « Pause » touché');
  await page.waitForTimeout(400); await frames(page, 3);
  s = await state(page);
  C.check(s.screen === 'pause' && s.phase === 'paused', 'pause au doigt', `${s.screen} / ${s.phase}`);
  await snap(page, tag + '-09-pause');
  C.check(await tapSel('[data-id="pause-reprendre"]'), '« Reprendre » touché');
  s = await state(page);
  C.check(s.screen === null && s.phase === 'playing', 'la partie reprend', `${s.screen} / ${s.phase}`);
  C.check(await page.evaluate(() => document.pointerLockElement === null), 'au doigt, la reprise ne capture pas la souris');
  await tapCtl('pause');
  await page.waitForTimeout(400); await frames(page, 3);
  C.check(await tapSel('[data-id="pause-terminer"]'), '« Terminer » touché');
  await page.waitForTimeout(600); await frames(page, 3);
  s = await state(page);
  if (s.screen !== 'debrief') {
    const b = (await rects(page, '.ui-dialog button, .ui-modal button')).find((r) => /Terminer|Oui|Confirmer/.test(r.text));
    if (b) { await F.tap(...center(b)); await page.waitForTimeout(600); await frames(page, 3); s = await state(page); }
  }
  C.check(s.screen === 'debrief', 'compte rendu affiché', `${s.screen} / ${s.phase}`);
  await snap(page, tag + '-10-compte-rendu');
  C.check(await tapSel('[data-id="debrief-accueil"]'), '« Accueil » touché');
  await page.waitForTimeout(600); await frames(page, 3);
  s = await state(page);
  C.check(s.screen === 'menu_principal' && s.phase === 'menu', 'retour à l’accueil', `${s.screen} / ${s.phase}`);
  await snap(page, tag + '-11-accueil-retour');
  const se = await sysErrors(page);
  C.check(se.length === 0, 'aucun système en erreur ni désactivé', se.join(', '));
} catch (err) {
  C.check(false, 'exception pendant le parcours', String(err && err.stack ? err.stack : err).slice(0, 600));
  try { await snap(page, tag + '-echec'); } catch { /* page fermée */ }
}
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.errors = errors; report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
