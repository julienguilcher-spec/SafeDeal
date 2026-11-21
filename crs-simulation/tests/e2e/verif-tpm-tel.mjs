// Testeur indépendant — TÉLÉPHONE 844×390 et TABLETTE 1180×820 (émulation tactile), vrai jeu.
// Usage : node tests/e2e/verif-tpm-tel.mjs [--size=844x390|1180x820] [--quality=bas|auto]
import { startServer, openPage, waitFor, ouvrirEditeur, frames, step, state, snap, J, R, makeChecker, fingers, rects, overlap } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const [W, H] = (args.size ?? '844x390').split('x').map(Number);
const tag = `verif-tpm-tel-${W}x${H}`;
const quality = args.quality ?? (W < 1000 ? 'auto' : 'bas');
const C = makeChecker(tag);
const report = { size: `${W}x${H}`, quality };

const server = await startServer();
const url = `${server.url}${quality === 'auto' ? '' : `?quality=${quality}`}`;
const { browser, page, errors } = await openPage(url, { width: W, height: H, mobile: true });
const F = await fingers(page);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const tapSel = async (sel) => {
  const r = (await rects(page, sel))[0];
  if (!r) return false;
  await F.tap(...center(r));
  await frames(page, 3);
  return true;
};
const safe = async (name, fn) => {
  try { await fn(); } catch (err) { C.check(false, `exception dans « ${name} »`, String(err && err.message ? err.message : err).slice(0, 300)); }
};

try {
  const t0 = Date.now();
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  report.bootMs = Date.now() - t0;
  // accueil en quatre modes : l'éditeur est la vue « Mode libre »
  await ouvrirEditeur(page);
  await frames(page, 4);
  await snap(page, `${tag}-accueil`);

  // ═════════════ 1. page d'accueil au doigt ═════════════
  await safe('accueil', async () => {
    const home = await page.evaluate(() => {
      const W = window.innerWidth, H = window.innerHeight;
      const root = document.querySelector('.crs-ui');
      const sel = 'button, [role="tab"], [role="slider"], [role="option"], [role="radio"], [role="switch"], input, select, a[href], .ui-list__item, .ui-card';
      const out = [];
      for (const e of root.querySelectorAll(sel)) {
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (!(b.width > 0 && b.height > 0) || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('[inert]')) continue;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const inView = b.left >= -1 && b.top >= -1 && b.right <= W + 1 && b.bottom <= H + 1;
        let hit = null, covered = false;
        if (cx >= 0 && cy >= 0 && cx < W && cy < H) { hit = document.elementFromPoint(cx, cy); covered = !(hit && (hit === e || e.contains(hit) || hit.contains(e))); }
        // l'élément est-il dans un conteneur défilant ?
        let sc = e.parentElement, scroll = false;
        while (sc && sc !== root) { const s = getComputedStyle(sc); if (/(auto|scroll)/.test(s.overflowY) && sc.scrollHeight > sc.clientHeight + 2) { scroll = true; break; } sc = sc.parentElement; }
        out.push({
          id: e.getAttribute('data-id') || '', tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 36),
          x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), inView, covered, scroll,
          clipped: e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2,
          coveredBy: covered && hit ? (hit.getAttribute('data-id') || hit.className || hit.tagName).toString().slice(0, 50) : '',
        });
      }
      return {
        W, H, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, items: out,
        device: window.__CRS.ctx.input.device, quality: window.__CRS.ctx.settings.values.quality, viewQuality: window.__CRS.ctx.view ? window.__CRS.ctx.view.quality : null,
        dpr: window.devicePixelRatio,
      };
    });
    report.home = home;
    console.log(`  accueil : ${home.items.length} éléments interactifs visibles ; qualité réglée « ${home.quality} », rendu « ${home.viewQuality} », dpr ${home.dpr}`);
    C.check(home.docW <= home.W + 1 && home.docH <= home.H + 1, 'accueil : la page ne déborde pas de l’écran', `document ${home.docW}×${home.docH} pour ${home.W}×${home.H}`);
    const small = home.items.filter((i) => Math.min(i.w, i.h) < 40 && i.tag !== 'a');
    C.check(small.length === 0, 'accueil : toutes les cibles tactiles font au moins 40 px', small.slice(0, 12).map((i) => `${i.id || i.text}:${i.w}×${i.h}`).join(', '));
    const out = home.items.filter((i) => !i.inView && !i.scroll);
    C.check(out.length === 0, 'accueil : aucun élément interactif hors écran (hors zone défilante)', out.slice(0, 10).map((i) => `${i.id || i.text}@${i.x},${i.y} ${i.w}×${i.h}`).join(', '));
    const cov = home.items.filter((i) => i.covered && i.inView);
    C.check(cov.length === 0, 'accueil : aucun élément interactif recouvert par un autre', cov.slice(0, 10).map((i) => `${i.id || i.text} sous ${i.coveredBy}`).join(', '));
    const clip = home.items.filter((i) => i.clipped && i.inView && (i.tag === 'button' || i.role === 'tab'));
    C.check(clip.length === 0, 'accueil : aucun libellé de bouton coupé', clip.slice(0, 10).map((i) => `${i.id || i.text}`).join(', '));
    const lancer = home.items.find((i) => i.id === 'lancer');
    C.check(!!lancer && lancer.inView && !lancer.covered, 'accueil : « Lancer » visible sans défilement', lancer ? `${lancer.x},${lancer.y} ${lancer.w}×${lancer.h}` : 'absent');
    if (W < 1000) C.check(home.viewQuality === 'bas', 'téléphone : qualité « bas » choisie d’office', String(home.viewQuality));

    // rôle CRS au doigt, poste lanceur
    C.check(await tapSel('[data-id="role-crs"]'), 'tuile « CRS » touchée');
    await frames(page, 3);
    // la grille des rôles (13 tuiles) repousse les postes sous le pli : on les amène dans l'écran avant de toucher
    await page.evaluate(() => document.querySelector('[data-value="lanceur"]')?.scrollIntoView({ block: 'center' }));
    await frames(page, 2);
    const postes = (await rects(page, '[data-value="lanceur"]')).filter((r) => r.visible && r.y >= 0 && r.y + r.h <= H);
    if (postes.length) { await F.tap(...center(postes[0])); await frames(page, 3); } else {
      // le poste peut être sous le pli : faire défiler la section au doigt
      await page.evaluate(() => document.querySelector('[data-value="lanceur"]')?.scrollIntoView({ block: 'center' }));
      await frames(page, 3);
      await tapSel('[data-value="lanceur"]');
    }
    const sum1 = await page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' '));
    C.check(/lanceur/i.test(sum1), 'poste « lanceur de grenades » choisi au doigt (résumé)', sum1.slice(0, 160));

    // défilement au doigt de la section (si elle défile)
    const scr = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.crs-ui *')].filter((e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20 && b.width > 100 && b.height > 60; });
      const e = els[0];
      if (!e) return null;
      e.setAttribute('data-verif-scroll', '1');
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height, top: e.scrollTop, max: e.scrollHeight - e.clientHeight, cls: e.className, n: els.length };
    });
    report.homeScroll = scr;
    if (scr) {
      const dy = Math.min(120, scr.h * 0.6);
      // (le poste a pu être amené à l'écran en bas de la section : on glisse alors vers le haut de la liste)
      const down = scr.max - scr.top > 20;
      if (down) await F.drag(1, scr.x, scr.y + dy / 2, scr.x, scr.y - dy / 2, 8);
      else await F.drag(1, scr.x, scr.y - dy / 2, scr.x, scr.y + dy / 2, 8);
      await page.waitForTimeout(500);
      await frames(page, 3);
      const top2 = await page.evaluate(() => document.querySelector('[data-verif-scroll]').scrollTop);
      C.check(down ? top2 > scr.top + 10 : top2 < scr.top - 10, 'accueil : la section défile au doigt', `scrollTop ${scr.top} → ${top2} (max ${scr.max}, ${scr.cls})`);
      await page.evaluate(() => { document.querySelector('[data-verif-scroll]').scrollTop = 0; });
    } else C.note('accueil : aucune zone défilante dans la section « Rôle »');

    // lieu : onglet puis un lieu de la liste
    await page.evaluate(() => document.querySelector('[data-id="tab-lieu"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    C.check(await tapSel('[data-id="tab-lieu"]'), 'onglet « Lieu » touché');
    await frames(page, 4);
    await snap(page, `${tag}-accueil-lieu`);
    const lieux = await page.evaluate(() => [...document.querySelectorAll('.ui-list__item')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
    report.lieux = lieux;
    const cible = 'Place de la Concorde';
    await page.evaluate((name) => { const e = [...document.querySelectorAll('.ui-list__item')].find((x) => (x.textContent || '').includes(name)); e?.scrollIntoView({ block: 'center' }); e?.setAttribute('data-verif-lieu', '1'); }, cible);
    await frames(page, 3);
    await tapSel('[data-verif-lieu]');
    const sum2 = await page.evaluate(() => (document.querySelector('.ui-home__summary')?.textContent || '').replace(/\s+/g, ' '));
    C.check(sum2.includes('Concorde'), 'lieu choisi au doigt dans la liste (résumé)', sum2.slice(0, 160));
    // mini-plan : un toucher choisit le lieu le plus proche
    const plan = (await rects(page, '.ui-miniplan canvas, .ui-miniplan'))[0];
    report.miniplan = plan ?? null;

    // affluence : curseur glissé au doigt
    await page.evaluate(() => document.querySelector('[data-id="tab-foule"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    C.check(await tapSel('[data-id="tab-foule"]'), 'onglet « Foule » touché');
    await frames(page, 4);
    // nom et organisateurs de la manifestation précèdent l'affluence : le curseur est amené dans l'écran
    await page.evaluate(() => document.querySelector('[data-id="affluence"]')?.scrollIntoView({ block: 'center' }));
    await frames(page, 2);
    const sl = (await rects(page, '[data-id="affluence"]'))[0];
    const v0 = await page.evaluate(() => Number(document.querySelector('[data-id="affluence"]')?.getAttribute('aria-valuenow')));
    if (sl) {
      await F.drag(2, sl.x + sl.w * 0.5, sl.y + sl.h / 2, sl.x + sl.w * 0.08, sl.y + sl.h / 2, 8);
      await frames(page, 3);
    }
    const v1 = await page.evaluate(() => Number(document.querySelector('[data-id="affluence"]')?.getAttribute('aria-valuenow')));
    report.affluence = { before: v0, after: v1, rect: sl ?? null };
    C.check(!!sl && v1 !== v0 && v1 < v0, 'curseur d’affluence réglable en glissant le doigt', `${v0} → ${v1} (curseur ${sl ? `${sl.w}×${sl.h}` : 'introuvable'})`);
    await snap(page, `${tag}-accueil-foule`);
  });

  // ═════════════ 2. lancement au doigt ═════════════
  const tL = Date.now();
  await safe('lancement', async () => {
    C.check(await tapSel('[data-id="lancer"]'), '« Lancer » touché');
    await waitFor(page, 'window.__CRS.ctx.session.phase !== "menu"', 60000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  });
  report.loadMs = Date.now() - tL;
  console.log(`  chargement : ${(report.loadMs / 1000).toFixed(1)} s`);
  await step(page, 0.5);
  await frames(page, 4);
  await snap(page, `${tag}-jeu`);

  // ═════════════ 3. mise en page en jeu : commandes tactiles et HUD ═════════════
  await safe('mise en page', async () => {
    const info = await page.evaluate(() => {
      const c = window.__CRS.ctx; const api = c.service('input.touch');
      return { device: c.input.device, layout: api?.layout, visible: api?.visible, mode: api?.mode, crowd: c.session.config.crowdSize, quality: c.view.quality, place: c.session.config.place,
        buf: (() => { const s = c.service('render.base').stats; return `${s.width}×${s.height} pr ${s.pixelRatio}`; })() };
    });
    report.game = info;
    console.log('  en jeu : ' + J(info));
    C.check(info.visible === true && info.layout === 'pied', 'commandes tactiles affichées, disposition « pied »', J(info));
    const controls = (await rects(page, '.crs-touch .ct-c')).filter((r) => !/ct-off/.test(r.cls));
    const items = await rects(page, '.crs-touch .ct-item');
    const stick = await rects(page, '.crs-touch .ct-stick');
    const hud = await rects(page, '.ui-hud [data-w]');
    const notices = await rects(page, '.ui-notice, .ui-toast, .ui-subtitles, .ui-banner');
    report.layout = { controls, items, stick, hud, notices };
    console.log(`  ${controls.length} boutons tactiles, ${items.length} cases d’objets, ${hud.length} éléments de HUD visibles`);
    const named = (r) => r.id || (r.cls.match(/ct-k-(\w+)/)?.[0]) || r.cls.split(' ')[0] || r.tag;
    // 3a. boutons hors écran
    const off = [...controls, ...items].filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H);
    C.check(off.length === 0, 'aucune commande tactile hors de l’écran', off.map(named).join(', '));
    // 3b. chevauchements commandes ↔ commandes
    const cc = [];
    const all = [...controls, ...items, ...stick];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = overlap(all[i], all[j]); if (a > 4) cc.push(`${named(all[i])}×${named(all[j])} (${a} px²)`); }
    C.check(cc.length === 0, 'aucun chevauchement entre commandes tactiles', cc.slice(0, 10).join(' ; '));
    // 3c. chevauchements HUD ↔ commandes tactiles
    const hc = [];
    const hudNamed = (r) => `hud:${(r.cls || '').split(' ')[0]}[${r.text.slice(0, 16)}]`;
    const hudW = await page.evaluate(() => [...document.querySelectorAll('.ui-hud [data-w]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.hidden; }).map((e) => { const b = e.getBoundingClientRect(); return { w: e.dataset.w, x: Math.round(b.left), y: Math.round(b.top), ww: Math.round(b.width), hh: Math.round(b.height), full: b.width >= window.innerWidth * 0.95 && b.height >= window.innerHeight * 0.9 }; }));
    report.layout.hudW = hudW;
    const boxes = hudW.filter((x) => !x.full).map((x) => ({ id: x.w, cls: x.w, text: '', tag: 'div', x: x.x, y: x.y, w: x.ww, h: x.hh }));
    for (const hb of boxes) for (const t of [...controls, ...items]) { const a = overlap(hb, t); if (a > 30) hc.push(`${hb.id}×${named(t)} (${a} px²)`); }
    C.check(hc.length === 0, 'aucun élément de HUD ne chevauche une commande tactile', hc.slice(0, 12).join(' ; '));
    // 3d. HUD ↔ HUD
    const hh = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = overlap(boxes[i], boxes[j]); if (a > 30) hh.push(`${boxes[i].id}×${boxes[j].id} (${a} px²)`); }
    C.check(hh.length === 0, 'aucun chevauchement entre éléments de HUD', hh.slice(0, 12).join(' ; '));
    const offHud = boxes.filter((r) => r.x < -1 || r.y < -1 || r.x + r.w > W + 1 || r.y + r.h > H + 1);
    C.check(offHud.length === 0, 'aucun élément de HUD hors écran', offHud.map((r) => `${r.id}@${r.x},${r.y} ${r.w}×${r.h}`).join(', '));
    const tiny = controls.filter((r) => Math.min(r.w, r.h) < 40);
    C.check(tiny.length === 0, 'boutons tactiles d’au moins 40 px', tiny.map((r) => `${named(r)} ${r.w}×${r.h}`).join(', '));
  });

  // ═════════════ 4. gestes : joystick, regard, boutons ═════════════
  const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => /ct-l-pied/.test(r.cls));
  await safe('joystick', async () => {
    const s0 = await state(page);
    // joystick à mi-course vers l'avant : marche
    const jx = W * 0.16, jy = H * 0.72;
    await F.down(1, jx, jy);
    await F.move(1, jx, jy - 14);
    await F.move(1, jx, jy - 28);
    await step(page, 3);
    const s1 = await state(page);
    const d1 = Math.hypot(s1.x - s0.x, s1.z - s0.z), v1 = d1 / (s1.t - s0.t);
    // direction du déplacement par rapport au regard
    const fwd = ((s1.x - s0.x) * Math.sin(s0.camYaw) + (s1.z - s0.z) * Math.cos(s0.camYaw)) / Math.max(0.01, d1);
    C.check(d1 > 1.5, 'joystick à mi-course : le personnage avance', `${d1.toFixed(1)} m en ${(s1.t - s0.t).toFixed(1)} s (${v1.toFixed(2)} m/s), alignement avec le regard ${fwd.toFixed(2)}`);
    C.check(fwd > 0.8, 'joystick vers le haut = vers l’avant du regard', fwd.toFixed(2));
    // à fond : course
    await F.move(1, jx, jy - 60);
    await F.move(1, jx, jy - 110);
    await step(page, 3);
    const s2 = await state(page);
    const d2 = Math.hypot(s2.x - s1.x, s2.z - s1.z), v2 = d2 / (s2.t - s1.t);
    C.check(v2 > v1 * 1.3 && d2 > 4, 'joystick à fond : le personnage court', `${d2.toFixed(1)} m (${v2.toFixed(2)} m/s contre ${v1.toFixed(2)})`);
    // vers la gauche
    await F.move(1, jx - 90, jy);
    await step(page, 2);
    const s3 = await state(page);
    const dx = s3.x - s2.x, dz = s3.z - s2.z;
    const left = (dx * Math.cos(s2.camYaw) - dz * Math.sin(s2.camYaw)) / Math.max(0.01, Math.hypot(dx, dz)); // gauche = (cos, −sin) ?
    report.strafe = { dx, dz, yaw: s2.camYaw, left };
    C.check(Math.hypot(dx, dz) > 1.5, 'joystick vers la gauche : déplacement latéral', `${Math.hypot(dx, dz).toFixed(1)} m, composante gauche ${left.toFixed(2)}`);
    // regard pendant le déplacement : second doigt glissé à droite de l'écran
    const yaw0 = s3.camYaw, pitch0 = s3.camPitch;
    await F.down(2, W * 0.62, H * 0.45);
    for (let i = 1; i <= 6; i++) await F.move(2, W * 0.62 + i * 20, H * 0.45 - i * 6);
    await step(page, 0.3);
    const s4 = await state(page);
    report.look = { yaw0, yaw1: s4.camYaw, pitch0, pitch1: s4.camPitch };
    C.check(Math.abs(s4.camYaw - yaw0) > 0.1, 'glisser à droite de l’écran fait tourner le regard (pendant que le joystick est tenu)', `lacet ${yaw0.toFixed(2)} → ${s4.camYaw.toFixed(2)}, site ${pitch0.toFixed(2)} → ${s4.camPitch.toFixed(2)}`);
    C.check(s4.camYaw < yaw0, 'glisser vers la droite = regard vers la droite (lacet décroissant)', `${(s4.camYaw - yaw0).toFixed(2)} rad`);
    C.check(s4.camPitch > pitch0, 'glisser vers le haut = regard vers le haut', `${(s4.camPitch - pitch0).toFixed(2)} rad`);
    await F.up(2);
    await F.up(1);
    await step(page, 1);
    const s5 = await state(page);
    await step(page, 1);
    const s6 = await state(page);
    C.check(Math.hypot(s6.x - s5.x, s6.z - s5.z) < 0.3, 'doigt levé : le personnage s’arrête', `${Math.hypot(s6.x - s5.x, s6.z - s5.z).toFixed(2)} m en 1 s`);
    C.check(s6.free && !s6.inBuilding, 'le joueur n’est dans aucun obstacle');
    C.check(s6.device === 'touch', 'périphérique actif : tactile', s6.device);
    await snap(page, `${tag}-apres-gestes`);
  });

  await safe('boutons', async () => {
    // caméra
    let s = await state(page);
    const cam0 = s.camera;
    let r = await ctl('camera');
    await F.tap(...center(r)); await step(page, 0.3); await frames(page, 2);
    s = await state(page);
    C.check(s.camera !== cam0, 'bouton « Caméra » : change de vue', `${cam0} → ${s.camera}`);
    await snap(page, `${tag}-vue-${s.camera}`);
    // barre d'objets : toucher une case
    const items = await rects(page, '.crs-touch .ct-item');
    const inv = await page.evaluate(() => window.__CRS.ctx.player.person().inventory.map((i) => i.id));
    report.inventory = inv;
    const gi = inv.indexOf('grenade_lacrymo');
    if (gi >= 0 && items[gi]) {
      await F.tap(...center(items[gi])); await step(page, 2); await frames(page, 2);
      s = await state(page);
      C.check(s.item === 'grenade_lacrymo', 'barre d’objets : toucher la case met la grenade en main', `${s.item} (case ${gi + 1} sur ${items.length})`);
      // Action : maintenir puis relâcher
      r = await ctl('primary');
      const n0 = s.projectiles;
      await F.down(3, ...center(r)); await step(page, 0.7);
      const ch = (await state(page)).charge;
      await F.up(3); await step(page, 0.6);
      s = await state(page);
      C.check(ch > 0.15, 'bouton « Action » tenu : le lancer se charge', `charge ${R(ch)}`);
      C.check(s.projectiles > n0, 'bouton « Action » relâché : la grenade part', `${n0} → ${s.projectiles} projectile(s)`);
    } else C.check(false, 'grenade lacrymogène dans la barre d’objets', inv.join(', '));
    // Viser (bascule)
    r = await ctl('secondary');
    await F.tap(...center(r)); await step(page, 0.4);
    let st = await page.evaluate(() => ({ down: window.__CRS.ctx.input.down('secondary'), alt: window.__CRS.ctx.player.person().alt }));
    C.check(st.down === true, 'bouton « Viser » : bascule enfoncée après un toucher', J(st));
    await F.tap(...center(r)); await step(page, 0.4);
    st = await page.evaluate(() => ({ down: window.__CRS.ctx.input.down('secondary') }));
    C.check(st.down === false, 'bouton « Viser » : relâché au second toucher', J(st));
    // Accroupi (maintien)
    r = await ctl('crouch');
    await F.down(4, ...center(r)); await step(page, 0.6);
    s = await state(page);
    C.check(/accroup|crouch/i.test(s.posture), 'bouton « Accroupi » tenu : posture accroupie', s.posture);
    await F.up(4); await step(page, 0.6);
    // Saut
    r = await ctl('jump');
    const y0 = (await state(page)).y;
    await F.down(5, ...center(r)); await step(page, 0.15);
    let ymax = y0;
    for (let i = 0; i < 6; i++) { await step(page, 0.08); ymax = Math.max(ymax, (await state(page)).y); }
    await F.up(5); await step(page, 0.5);
    report.jump = { y0, ymax };
    C.check(ymax > y0 + 0.05, 'bouton « Saut » : le personnage quitte le sol', `altitude ${y0.toFixed(2)} → ${ymax.toFixed(2)} m`);
    // Masque
    r = await ctl('mask');
    const g0 = (await state(page));
    if (r) { await F.tap(...center(r)); await step(page, 2.5); const g1 = await state(page); report.mask = { before: g0.gasProtection, after: g1.gasProtection, look0: g0.look, look1: g1.look };
      C.check(g1.gasProtection !== g0.gasProtection || g1.look !== g0.look, 'bouton « Masque » : effet sur le personnage', `protection ${g0.gasProtection} → ${g1.gasProtection}`); }
    // Carte
    r = await ctl('map');
    await F.tap(...center(r)); await frames(page, 4); await page.waitForTimeout(500);
    s = await state(page);
    C.check(s.screen === 'carte', 'bouton « Carte » : ouvre le plan', String(s.screen));
    await snap(page, `${tag}-carte`);
    // fermeture au doigt : un bouton de fermeture doit exister
    const closers = await page.evaluate(() => [...document.querySelectorAll('.crs-ui button')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && !e.closest('[inert]') && !e.closest('[hidden]'); }).map((e) => ({ id: e.getAttribute('data-id') || '', text: (e.textContent || '').trim().slice(0, 24), aria: e.getAttribute('aria-label') || '', x: e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2, y: e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
    report.mapButtons = closers;
    const closer = closers.find((b) => /ferm|retour|close|back/i.test(b.id + b.text + b.aria));
    if (closer) { await F.tap(closer.x, closer.y); await frames(page, 4); }
    s = await state(page);
    C.check(!!closer && s.screen === null, 'le plan se referme au doigt (bouton de fermeture)', closer ? `${closer.id || closer.text || closer.aria} → écran ${s.screen}` : 'aucun bouton de fermeture trouvé : ' + closers.map((b) => b.id || b.text).join(','));
    if (s.screen !== null) { await page.evaluate(() => window.__CRS.ctx.ui.close()); await frames(page, 3); }
    // Carte tactique
    r = await ctl('tactical');
    await F.tap(...center(r)); await frames(page, 4); await page.waitForTimeout(500);
    s = await state(page);
    C.check(s.screen === 'carte_tactique', 'bouton « Tactique » : ouvre la carte tactique', String(s.screen));
    await snap(page, `${tag}-carte-tactique`);
    const tac = await page.evaluate(() => { const W = window.innerWidth, H = window.innerHeight; return [...document.querySelectorAll('.crs-ui button, .crs-ui [role="tab"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && !e.closest('[inert]') && !e.closest('[hidden]'); }).map((e) => { const b = e.getBoundingClientRect(); return { id: e.getAttribute('data-id') || '', text: (e.textContent || '').trim().slice(0, 24), aria: e.getAttribute('aria-label') || '', x: b.left + b.width / 2, y: b.top + b.height / 2, w: Math.round(b.width), h: Math.round(b.height), out: b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1 }; }); });
    report.tacButtons = tac;
    const tacOut = tac.filter((b) => b.out);
    C.check(tacOut.length === 0, 'carte tactique : aucun bouton hors écran', tacOut.map((b) => b.id || b.text).slice(0, 8).join(', '));
    const tacSmall = tac.filter((b) => Math.min(b.w, b.h) < 36);
    C.check(tacSmall.length === 0, 'carte tactique : boutons d’au moins 36 px', tacSmall.map((b) => `${b.id || b.text} ${b.w}×${b.h}`).slice(0, 10).join(', '));
    const closer2 = tac.find((b) => /ferm|retour|close|back/i.test(b.id + b.text + b.aria));
    if (closer2) { await F.tap(closer2.x, closer2.y); await frames(page, 4); }
    s = await state(page);
    C.check(!!closer2 && s.screen === null, 'la carte tactique se referme au doigt', closer2 ? `${closer2.id || closer2.text || closer2.aria} → écran ${s.screen}` : 'aucun bouton de fermeture : ' + tac.map((b) => b.id || b.text).slice(0, 14).join(','));
    if (s.screen !== null) { await page.evaluate(() => window.__CRS.ctx.ui.close()); await frames(page, 3); }
    // Radio / Ordres
    for (const key of ['radio', 'orders']) {
      r = await ctl(key);
      if (!r) { C.note(`bouton ${key} absent`); continue; }
      await F.tap(...center(r)); await frames(page, 4); await page.waitForTimeout(300);
      s = await state(page);
      report['screen_' + key] = s.screen;
      C.note(`bouton « ${key} » → écran ${s.screen}`);
      await snap(page, `${tag}-${key}`);
      if (s.screen !== null) {
        const b = await page.evaluate(() => [...document.querySelectorAll('.crs-ui button')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && !e.closest('[inert]') && !e.closest('[hidden]'); }).map((e) => { const q = e.getBoundingClientRect(); return { id: e.getAttribute('data-id') || '', text: (e.textContent || '').trim().slice(0, 24), aria: e.getAttribute('aria-label') || '', x: q.left + q.width / 2, y: q.top + q.height / 2 }; }));
        const cl = b.find((q) => /ferm|retour|close|back|annul/i.test(q.id + q.text + q.aria));
        if (cl) { await F.tap(cl.x, cl.y); await frames(page, 4); }
        s = await state(page);
        C.check(s.screen === null, `écran « ${key} » : se referme au doigt`, cl ? `${cl.id || cl.text}` : 'aucun bouton de fermeture : ' + b.map((q) => q.id || q.text).slice(0, 12).join(','));
        if (s.screen !== null) { await page.evaluate(() => { const u = window.__CRS.ctx.ui; let n = 0; while (u.current && n++ < 4) u.close(); }); await frames(page, 3); }
      }
    }
    // Pause puis reprise
    r = await ctl('pause');
    await F.tap(...center(r)); await frames(page, 5); await page.waitForTimeout(300);
    s = await state(page);
    C.check(s.screen === 'pause' && s.phase === 'paused', 'bouton « Pause » : met en pause', `${s.screen} / ${s.phase}`);
    await snap(page, `${tag}-pause`);
    const pb = await rects(page, '.crs-ui button');
    const pOut = pb.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1);
    C.check(pOut.length === 0, 'menu de pause : tous les boutons dans l’écran', pOut.map((b) => b.id || b.text).join(', '));
    await tapSel('[data-id="pause-reprendre"]');
    await frames(page, 4);
    s = await state(page);
    C.check(s.phase === 'playing' && s.screen === null, '« Reprendre » au doigt', `${s.phase} / ${s.screen}`);
    // « Reprendre » redemande la capture de la souris : sur un écran tactile elle n'a aucun sens
    const lock = await page.evaluate(() => { const l = !!document.pointerLockElement; if (l) document.exitPointerLock(); return { lock: l, input: window.__CRS.ctx.input.pointerLocked }; });
    report.pointerLockAfterResume = lock;
    C.check(!lock.lock, 'tactile : « Reprendre » ne capture pas la souris', J(lock));
  });

  // ═════════════ 5. portrait ═════════════
  await safe('portrait', async () => {
    await page.setViewportSize({ width: H, height: W });
    await frames(page, 4); await page.waitForTimeout(400);
    const p = await page.evaluate(() => {
      const el = document.querySelector('.crs-touch .ct-rotate');
      const b = el ? el.getBoundingClientRect() : null;
      return { present: !!el, visible: !!b && b.width > 0 && b.height > 0 && getComputedStyle(el).display !== 'none', text: el ? (el.textContent || '').trim().slice(0, 80) : '', w: b ? b.width : 0, h: b ? b.height : 0, phase: window.__CRS.ctx.session.phase,
        canvas: (() => { const c = document.querySelector('#game canvas'); const q = c.getBoundingClientRect(); return `${Math.round(q.width)}×${Math.round(q.height)}`; })() };
    });
    report.portrait = p;
    C.check(p.visible && /tourn/i.test(p.text), 'portrait : message « Tournez votre appareil »', J(p));
    C.check(p.w >= H * 0.9 && p.h >= W * 0.9, 'portrait : le message couvre l’écran', `${Math.round(p.w)}×${Math.round(p.h)} pour ${H}×${W}`);
    await snap(page, `${tag}-portrait`);
    const t0 = (await state(page)).t;
    await page.waitForTimeout(1500);
    const t1 = (await state(page)).t;
    C.note(`portrait : phase « ${p.phase} », temps simulé ${t0.toFixed(1)} → ${t1.toFixed(1)} s pendant 1,5 s de message (le jeu ${t1 > t0 ? 'continue de tourner' : 'est figé'})`);
    report.portrait.simRuns = t1 > t0;
    await page.setViewportSize({ width: W, height: H });
    await frames(page, 4); await page.waitForTimeout(400);
    const back = await page.evaluate(() => { const el = document.querySelector('.crs-touch .ct-rotate'); const b = el.getBoundingClientRect(); const c = document.querySelector('#game canvas').getBoundingClientRect(); return { rotate: b.width > 0 && getComputedStyle(el).display !== 'none', canvas: `${Math.round(c.width)}×${Math.round(c.height)}`, phase: window.__CRS.ctx.session.phase, screen: window.__CRS.ctx.ui.current }; });
    C.check(!back.rotate && back.canvas === `${W}×${H}`, 'retour en paysage : message retiré, canevas à la taille de l’écran', J(back));
    await snap(page, `${tag}-retour-paysage`);
  });
  report.perf = await page.evaluate(() => { const i = window.__CRS.ctx.view.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
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
