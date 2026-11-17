// Testeur indépendant — TACTILE, seconde passe (compléments) : bande d'onglets au doigt, mini-plan, paramètres,
// lancer de grenade au bouton « Action », saut, masque, roue d'ordres, tiroirs de la carte tactique, doigt annulé,
// compte rendu et retour à l'accueil.  Usage : node tests/e2e/verif-tpm-tel2.mjs [--size=844x390] [--role=crs|chef_groupe] [--dpr=1]
import { startServer, openPage, waitFor, frames, step, state, snap, J, R, makeChecker, fingers, rects } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const [W, H] = (args.size ?? '844x390').split('x').map(Number);
const role = args.role ?? 'crs';
const dpr = Number(args.dpr ?? 1);
const tag = `verif-tpm-tel2-${W}x${H}-${role}`;
const C = makeChecker(tag);
const report = { size: `${W}x${H}`, role, dpr };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}${W >= 1000 ? '?quality=bas' : ''}`, { width: W, height: H, mobile: true, deviceScaleFactor: dpr });
const F = await fingers(page);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const tapSel = async (sel, scroll = true) => {
  if (scroll) { await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center', inline: 'center' }), sel); await frames(page, 2); }
  const r = (await rects(page, sel))[0];
  if (!r) return false;
  await F.tap(...center(r));
  await frames(page, 3);
  return true;
};
const safe = async (name, fn) => {
  try { await fn(); } catch (err) { C.check(false, `exception dans « ${name} »`, String(err && err.message ? err.message : err).slice(0, 300)); }
};
const summary = () => page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' '));
const topButtons = () => page.evaluate(() => { const W = window.innerWidth, H = window.innerHeight; return [...document.querySelectorAll('.crs-ui button, .crs-ui [role="tab"], .crs-ui [role="slider"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('[inert]') && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => { const b = e.getBoundingClientRect(); return { id: e.getAttribute('data-id') || '', text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28), aria: e.getAttribute('aria-label') || '', x: b.left + b.width / 2, y: b.top + b.height / 2, w: Math.round(b.width), h: Math.round(b.height), out: b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1 }; }); });

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  await frames(page, 4);

  // ═════════════ accueil : bande d'onglets, mini-plan, paramètres ═════════════
  await safe('bande d’onglets', async () => {
    const strip = await page.evaluate(() => {
      let e = document.querySelector('[data-id="tab-role"]');
      while (e && e !== document.body) { const s = getComputedStyle(e); if (e.scrollWidth > e.clientWidth + 4 && /(auto|scroll|hidden)/.test(s.overflowX)) break; e = e.parentElement; }
      if (!e || e === document.body) return null;
      e.setAttribute('data-verif-strip', '1');
      const b = e.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height, sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX, left: e.scrollLeft };
    });
    report.strip = strip;
    if (!strip) { C.note('bande d’onglets : tout tient dans la largeur (pas de défilement)'); return; }
    await F.drag(1, strip.x + strip.w * 0.8, strip.y + strip.h / 2, strip.x + strip.w * 0.15, strip.y + strip.h / 2, 8);
    await page.waitForTimeout(600); await frames(page, 3);
    const left = await page.evaluate(() => document.querySelector('[data-verif-strip]').scrollLeft);
    C.check(left > strip.left + 30, 'accueil : la bande d’onglets défile au doigt (onglets cachés à droite atteignables)', `scrollLeft ${strip.left} → ${left} (contenu ${strip.sw} px pour ${strip.cw} px visibles, overflow-x ${strip.ox})`);
    const last = (await rects(page, '[data-id="tab-options"]'))[0];
    const vis = last && last.x >= strip.x - 1 && last.x + last.w <= strip.x + strip.w + 1;
    C.note(`onglet « Options » après un balayage : ${last ? `x ${last.x}, largeur ${last.w}` : 'absent'} — ${vis ? 'visible' : 'encore caché'}`);
    await snap(page, `${tag}-onglets-balayes`);
    // l'indice visuel : y a-t-il un fondu ou une flèche qui signale la suite ?
    await page.evaluate(() => { document.querySelector('[data-verif-strip]').scrollLeft = 0; });
  });
  await safe('rôle et poste', async () => {
    C.check(await tapSel(`[data-id="role-${role}"]`), `tuile « ${role} » touchée`);
    if (role === 'crs') { C.check(await tapSel('[data-value="lanceur"]'), 'poste « lanceur » touché'); C.check(/lanceur/i.test(await summary()), 'poste lanceur pris en compte (résumé)', (await summary()).slice(0, 100)); }
  });
  await safe('mini-plan', async () => {
    await tapSel('[data-id="tab-lieu"]');
    await frames(page, 6); await page.waitForTimeout(500);
    const before = await summary();
    const plan = (await rects(page, '.ui-miniplan canvas'))[0] ?? (await rects(page, '.ui-miniplan'))[0];
    report.miniplan = plan ?? null;
    if (!plan) { C.check(false, 'mini-plan présent dans la section « Lieu »'); return; }
    // toucher le quart gauche du plan (ouest : Étoile / Trocadéro)
    await F.tap(plan.x + plan.w * 0.12, plan.y + plan.h * 0.45); await frames(page, 4);
    const after = await summary();
    const place = (s) => (s.match(/(Place|Champs|Avenue|Boulevard|Esplanade|Parvis|Rue|Quai|Pont|Trocad|Hôtel|Jardin|Gare)[^0-9]*?(?=\d)/) || [''])[0].trim();
    C.check(place(after) !== place(before), 'toucher le mini-plan choisit le lieu le plus proche', `« ${place(before)} » → « ${place(after)} »`);
    await snap(page, `${tag}-miniplan`);
    await page.evaluate(() => { const e = [...document.querySelectorAll('.ui-list__item')].find((x) => (x.textContent || '').includes('Place de la Concorde')); e?.setAttribute('data-verif-lieu', '1'); });
    await tapSel('[data-verif-lieu]');
    C.check((await summary()).includes('Concorde'), 'lieu « Concorde » choisi dans la liste');
  });
  await safe('paramètres', async () => {
    const btns = await topButtons();
    const p = btns.find((b) => /param/i.test(b.id + b.text));
    if (!p) { C.check(false, 'bouton « Paramètres » sur la page d’accueil'); return; }
    await F.tap(p.x, p.y); await frames(page, 5); await page.waitForTimeout(300);
    const s = await state(page);
    C.check(s.screen === 'parametres', '« Paramètres » s’ouvre au doigt', String(s.screen));
    await snap(page, `${tag}-parametres`);
    const b2 = await topButtons();
    report.settingsButtons = b2.map((b) => `${b.id || b.text}:${b.w}×${b.h}${b.out ? ':HORS' : ''}`);
    const small = b2.filter((b) => Math.min(b.w, b.h) < 40 && !b.out);
    C.check(small.length === 0, 'paramètres : cibles d’au moins 40 px', small.slice(0, 10).map((b) => `${b.id || b.text} ${b.w}×${b.h}`).join(', '));
    const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    C.check(doc.w <= W + 1 && doc.h <= H + 1, 'paramètres : la page ne déborde pas', `${doc.w}×${doc.h}`);
    // chaque onglet des paramètres : ouverture au doigt, capture du dernier
    const tabs = b2.filter((b) => /^tab-|onglet/.test(b.id) || false);
    const tabIds = await page.evaluate(() => [...document.querySelectorAll('.crs-ui [role="tab"]')].filter((e) => !e.closest('[inert]') && e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('data-id')));
    report.settingsTabs = tabIds;
    for (const id of tabIds.slice(0, 8)) { await tapSel(`[data-id="${id}"]`); const sel = await page.evaluate((i) => document.querySelector(`[data-id="${i}"]`)?.getAttribute('aria-selected'), id); if (sel !== 'true') C.check(false, `onglet de paramètres « ${id} » sélectionnable au doigt`, String(sel)); }
    await snap(page, `${tag}-parametres-dernier-onglet`);
    C.check(await tapSel('[data-id="parametres-retour"]'), 'paramètres : « Retour » touché');
    const s2 = await state(page);
    C.check(s2.screen === 'menu_principal', 'retour à l’accueil depuis les paramètres', String(s2.screen));
  });
  await safe('affluence', async () => {
    await tapSel('[data-id="tab-foule"]'); await frames(page, 3);
    const sl = (await rects(page, '[data-id="affluence"]'))[0];
    if (sl) await F.drag(2, sl.x + sl.w * 0.5, sl.y + sl.h / 2, sl.x + sl.w * 0.1, sl.y + sl.h / 2, 8);
    await frames(page, 3);
  });
  const tL = Date.now();
  await safe('lancement', async () => {
    C.check(await tapSel('[data-id="lancer"]'), '« Lancer » touché');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  });
  report.loadMs = Date.now() - tL;
  await step(page, 0.5); await frames(page, 4);
  const info = await page.evaluate(() => { const c = window.__CRS.ctx; const s = c.service('render.base').stats; const p = c.player.person(); const cv = document.querySelector('#game canvas');
    return { dpr: window.devicePixelRatio, buffer: `${s.width}×${s.height}`, pixelRatio: s.pixelRatio, canvasCss: `${cv.clientWidth}×${cv.clientHeight}`, canvasPx: `${cv.width}×${cv.height}`, quality: c.view.quality, role: c.player.state.role, poste: p.poste, rank: p.rank, inv: p.inventory.map((i) => i.id), crowd: c.session.config.crowdSize }; });
  report.game = info;
  console.log(`  chargement ${(report.loadMs / 1000).toFixed(1)} s ; ` + J(info));
  await snap(page, `${tag}-jeu`);
  const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => /ct-l-pied/.test(r.cls));

  await safe('ce que touche le doigt', async () => {
    const hits = await page.evaluate(() => ['radio', 'orders', 'primary', 'secondary', 'jump', 'crouch', 'interact', 'pause', 'map', 'tactical', 'camera', 'forward', 'mask', 'visor', 'lamp'].map((k) => {
      const e = document.querySelector(`.crs-touch .ct-l-pied.ct-k-${k}`); if (!e || e.classList.contains('ct-off')) return { k, missing: true };   // (masqué : bouton « Ordres » d'un poste qui n'en donne pas)
      const b = e.getBoundingClientRect(); const pts = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
      const res = pts.map(([fx, fy]) => { const h = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy); return !!h && (h === e || e.contains(h)); });
      const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { k, ok: res.filter(Boolean).length, of: res.length, top: h ? (h.getAttribute('data-w') || h.className || h.tagName).toString().slice(0, 40) : '' };
    }));
    report.hits = hits;
    const bad = hits.filter((h) => !h.missing && h.ok < h.of);
    C.check(bad.length === 0, 'chaque bouton tactile reçoit bien le doigt sur toute sa surface (rien par-dessus)', bad.map((h) => `${h.k} ${h.ok}/${h.of} (dessus : ${h.top})`).join(' ; '));
  });
  await safe('ordres', async () => {
    if (await page.evaluate(() => { const e = document.querySelector('.crs-touch .ct-l-pied.ct-k-orders'); return !e || e.classList.contains('ct-off'); })) {
      C.note('bouton « Ordres » masqué : ce poste reçoit les ordres, il n’en donne pas');
      return;
    }
    const r = await ctl('orders');
    await F.tap(...center(r)); await frames(page, 5); await page.waitForTimeout(400);
    let s = await state(page);
    report.ordersScreen = s.screen;
    await snap(page, `${tag}-ordres`);
    const toast = await page.evaluate(() => [...document.querySelectorAll('.crs-ui [class*="notice"], .crs-ui [class*="toast"]')].map((e) => (e.textContent || '').trim().slice(0, 80)).filter(Boolean));
    C.check(s.screen !== null || toast.length > 0, `bouton « Ordres » (${role}) : ouvre un écran ou explique pourquoi non`, `écran « ${s.screen} », messages : ${toast.join(' | ') || 'aucun'}`);
    if (s.screen !== null) {
      const b = await topButtons();
      report.ordersButtons = b.map((x) => `${x.id || x.text}:${x.w}×${x.h}${x.out ? ':HORS' : ''}`).slice(0, 30);
      // fermer : bouton de fermeture, sinon toucher hors de la roue
      const cl = b.find((q) => /ferm|retour|close|annul/i.test(q.id + q.text + q.aria));
      if (cl) await F.tap(cl.x, cl.y); else await F.tap(W - 30, H - 30);
      await frames(page, 4);
      s = await state(page);
      C.check(s.screen === null, 'la roue d’ordres se referme au doigt', cl ? (cl.id || cl.text) : `toucher hors de la roue → écran ${s.screen}`);
      if (s.screen !== null) { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); await frames(page, 3); }
    }
  });
  await safe('saut', async () => {
    const r = await ctl('jump');
    const s0 = await state(page);
    await F.down(5, ...center(r)); await step(page, 0.07);
    let ymax = s0.y; const ys = [];
    for (let i = 0; i < 9; i++) { await step(page, 0.07); const q = await state(page); ys.push(R(q.y - s0.y)); ymax = Math.max(ymax, q.y); }
    await F.up(5); await step(page, 0.5);
    report.jump = { posture: s0.posture, ys };
    C.check(ymax > s0.y + 0.05, 'bouton « Saut » debout : le personnage quitte le sol', `hauteurs relatives ${ys.join(', ')} m (posture ${s0.posture})`);
  });
  await safe('grenade', async () => {
    const inv = report.game.inv; const gi = inv.indexOf('grenade_lacrymo');
    if (gi < 0) { C.note(`pas de grenade dans cette dotation (${inv.join(', ')})`); return; }
    const items = await rects(page, '.crs-touch .ct-item');
    await F.tap(...center(items[gi])); await step(page, 2); await frames(page, 2);
    let s = await state(page);
    C.check(s.item === 'grenade_lacrymo', 'barre d’objets : la case met la grenade en main', `${s.item}`);
    const r = await ctl('primary');
    const n0 = s.projectiles; const yaw0 = s.camYaw;
    const [cx, cy] = center(r);
    await F.down(3, cx, cy); await step(page, 0.4);
    // viser en glissant le doigt posé sur « Action »
    for (let i = 1; i <= 5; i++) await F.move(3, cx - i * 14, cy);
    await step(page, 0.4);
    const mid = await state(page);
    await F.up(3); await step(page, 0.6);
    s = await state(page);
    C.check(mid.charge > 0.15, '« Action » tenu : le lancer se charge', `charge ${R(mid.charge)}`);
    C.check(Math.abs(mid.camYaw - yaw0) > 0.05, 'glisser le doigt posé sur « Action » fait tourner la visée', `lacet ${R(yaw0)} → ${R(mid.camYaw)}`);
    C.check(s.projectiles > n0, '« Action » relâché : la grenade part', `${n0} → ${s.projectiles} projectile(s)`);
    await step(page, 4); await frames(page, 3);
    await snap(page, `${tag}-grenade`);
  });
  await safe('masque', async () => {
    const r = await ctl('mask'); const g0 = await state(page);
    await F.tap(...center(r)); await step(page, 9.5); await frames(page, 2);
    const g1 = await state(page);
    C.check(g1.gasProtection > g0.gasProtection, 'bouton « Masque » : masque en place après 8 s', `protection ${g0.gasProtection} → ${g1.gasProtection}`);
    const v = await ctl('visor'); await F.tap(...center(v)); await step(page, 1.5);
    const g2 = await state(page);
    C.check(g2.look !== g1.look || g2.gasProtection !== g1.gasProtection, 'bouton « Visière » : effet sur le personnage', `${g1.look.slice(0, 120)} → ${g2.look.slice(0, 120)}`);
  });
  await safe('doigt annulé', async () => {
    const s0 = await state(page);
    await F.down(1, W * 0.16, H * 0.72); await F.move(1, W * 0.16, H * 0.72 - 100); await step(page, 1.5);
    const s1 = await state(page);
    await F.cancel();
    await step(page, 1); const s2 = await state(page); await step(page, 1); const s3 = await state(page);
    C.check(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 2, 'joystick : déplacement avant l’annulation', `${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m`);
    C.check(Math.hypot(s3.x - s2.x, s3.z - s2.z) < 0.2, 'toucher annulé par le système (touchcancel) : le personnage s’arrête', `${Math.hypot(s3.x - s2.x, s3.z - s2.z).toFixed(2)} m en 1 s`);
  });
  await safe('carte tactique : tiroirs', async () => {
    const r = await ctl('tactical');
    await F.tap(...center(r)); await frames(page, 5); await page.waitForTimeout(500);
    let b = await topButtons();
    for (const name of ['Ordres', 'Circulation', 'Journal']) {
      const t = b.find((q) => q.text === name || q.id === `tac-tab-${name.toLowerCase()}`);
      if (!t) { C.note(`carte tactique : onglet « ${name} » introuvable`); continue; }
      await F.tap(t.x, t.y); await frames(page, 5); await page.waitForTimeout(400);
      await snap(page, `${tag}-tactique-${name.toLowerCase()}`);
      b = await topButtons();
      const out = b.filter((q) => q.out);
      C.check(out.length === 0, `carte tactique, volet « ${name} » : aucun bouton hors écran`, out.slice(0, 8).map((q) => `${q.id || q.text}`).join(', '));
      const small = b.filter((q) => !q.out && Math.min(q.w, q.h) < 36);
      C.check(small.length === 0, `carte tactique, volet « ${name} » : boutons d’au moins 36 px`, small.slice(0, 8).map((q) => `${q.id || q.text} ${q.w}×${q.h}`).join(', '));
    }
    const cl = b.find((q) => q.id === 'tac-close' || /^Fermer/.test(q.text));
    if (cl) await F.tap(cl.x, cl.y);
    await frames(page, 4);
    const s = await state(page);
    C.check(s.screen === null, 'carte tactique refermée au doigt', String(s.screen));
    if (s.screen !== null) { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); await frames(page, 3); }
  });
  await safe('compte rendu', async () => {
    const r = await ctl('pause');
    await F.tap(...center(r)); await frames(page, 5); await page.waitForTimeout(300);
    C.check(await tapSel('[data-id="pause-terminer"]'), '« Terminer et voir le compte rendu » touché');
    await frames(page, 3);
    const dlg = (await rects(page, '[data-id="dialog-confirm"]'))[0];
    C.check(!!dlg, 'dialogue de confirmation affiché', dlg ? `${dlg.w}×${dlg.h}` : '');
    await snap(page, `${tag}-confirmation`);
    if (dlg) await F.tap(...center(dlg));
    await waitFor(page, 'window.__CRS.ctx.session.phase === "debrief"', 120000);
    await frames(page, 4);
    await snap(page, `${tag}-compte-rendu`);
    const b = await topButtons();
    const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    C.check(doc.w <= W + 1 && doc.h <= H + 1, 'compte rendu : la page ne déborde pas', `${doc.w}×${doc.h}`);
    const acc = b.find((q) => q.id === 'debrief-accueil');
    C.check(!!acc && !acc.out, 'compte rendu : bouton « Accueil » visible', acc ? `${Math.round(acc.x)},${Math.round(acc.y)} ${acc.w}×${acc.h}` : 'absent');
    if (acc) await F.tap(acc.x, acc.y);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "menu"', 120000);
    await frames(page, 4);
    const s = await state(page);
    C.check(s.screen === 'menu_principal', 'retour à l’accueil au doigt', String(s.screen));
    const touchApi = await page.evaluate(() => { const a = window.__CRS.ctx.service('input.touch'); return { layout: a.layout, visible: a.visible, shown: [...document.querySelectorAll('.crs-touch .ct-c')].filter((e) => e.getBoundingClientRect().width > 0).length }; });
    C.check(touchApi.shown === 0, 'à l’accueil, les commandes de jeu tactiles sont masquées', J(touchApi));
    await snap(page, `${tag}-retour-accueil`);
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
