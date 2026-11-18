// Commissariats dans le vrai jeu (vraie carte de Paris, index.html) : stock garé, carte de commandement, envoi d'une
// unité, retour au commissariat, lecture seule, téléphone, habillage de jour et de nuit, coût par image.
//
//   node tests/e2e/verif-commissariats.mjs            toutes les parties, l'une après l'autre (un navigateur à la fois)
//   node tests/e2e/verif-commissariats.mjs pc tel     seulement ces parties : pc, crs, tel, vue
//
// pc  — portable 1280 × 800, clavier et pavé tactile : Tab ouvre la carte ; C ouvre la fiche d'un commissariat ;
//       « Plus… › Commissariats » liste les 7 sites (rangées ≥ 44 px) ; ↓ / Entrée sur le 9e, puis sur TV 75-19 : la fiche
//       du poste, sa ligne surlignée ; Entrée : « OÙ L'ENVOYER ? » ; un clic désigne le lieu, Entrée envoie ; 60 s plus
//       tard la voiture est à plus de 100 m de ses places, deux-tons ; « Rentrer au commissariat » : retour sans
//       deux-tons, puis « Au repos ».
// crs — un CRS : C ouvre la fiche du poste en lecture (« Seul le commandant… »), sans ligne « Envoyer ».
// tel — téléphone 844 × 390 au doigt : toucher le symbole du 9e, la ligne « Envoyer TV 75-19 », « Donner l'ordre »,
//       toucher la carte, « Donner l'ordre » : l'unité part.
// vue — devant la porte du 9e à 14 h et à 22 h (captures) ; coût des deux systèmes des commissariats par image
//       (≤ 0,3 ms en médiane) ; appels de dessin de l'habillage.
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, hold, tactical, clickSel, freeMapSpot, sysErrors, notices } from './verif-fin-lib.mjs';

const ALL = ['pc', 'crs', 'tel', 'vue'];
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const parts = asked.length ? ALL.filter((p) => asked.includes(p)) : ALL;
const C = makeChecker('verif-commissariats');
const server = await startServer();
let browser = null;

/** Partie lancée d'office sur la vraie carte. */
async function boot(query, view) {
  const opened = await openPage(`${server.url}index.html?quality=bas`, view);
  browser = opened.browser;
  const page = opened.page;
  const q = new URLSearchParams({ autostart: 'paris', nomenu: '1', mode: 'libre', quality: 'bas', seed: '7', weather: 'clair', ...query });
  await page.goto(`${server.url}index.html?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 600000);
  await step(page, 2);
  return { page, errors: opened.errors };
}

async function close() {
  if (browser) await browser.close().catch(() => {});
  browser = null;
}

/** Réserve garée : véhicules tenus par un commissariat, et sites du service. */
const stock = (page) => page.evaluate(() => {
  const ctx = window.__CRS.ctx;
  const a = ctx.service('police.commissariats');
  if (!a) return null;
  return { enabled: a.enabled, can: a.canDispatch, sites: a.list.length, held: ctx.vehicles.list.filter((v) => a.holds(v.id)).length };
});

const entry = (page, id) => page.evaluate((k) => {
  const ctx = window.__CRS.ctx;
  const e = ctx.service('police.commissariats').entry(k);
  const s = e && e.squadId ? ctx.squads.get(e.squadId) : null;
  const v = s && s.vehicleId ? ctx.vehicles.get(s.vehicleId) : null;
  const pat = ctx.service('police.patrols');
  const ps = pat && e && e.squadId ? pat.statusOf(e.squadId) : null;
  return e ? {
    state: e.state, squadId: e.squadId, x: v ? v.x : NaN, z: v ? v.z : NaN, siren: v ? v.siren : -1, beacons: v ? v.beacons : false,
    order: s ? `${s.order.type}(${Math.round(s.order.x)},${Math.round(s.order.z)})` : '', patrol: ps ? ps.state : '',
  } : null;
}, id);

/** Place de tête (x, z) d'une unité du stock. */
const homeOf = (page, id) => page.evaluate((k) => {
  const [site] = k.split(':');
  const v = window.__CRS.ctx.service('police.commissariats').get(site);
  const e = v.entries.find((x) => x.id === k);
  return { x: v.x, z: v.z, id: e.id };
}, id);

async function partPc() {
  console.log('— pc : portable, clavier et pavé tactile');
  const { page, errors } = await boot({ role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '150', time: '14' }, { width: 1280, height: 800, pointerLock: false });
  const s = await stock(page);
  C.check(!!s && s.enabled && s.sites === 7 && s.can, 'service des commissariats actif, 7 sites, le commandant peut engager', JSON.stringify(s));
  C.check(!!s && s.held >= 30, 'véhicules garés en réserve (32 attendus, places occupées exceptées)', String(s && s.held));
  const render = await page.evaluate(() => { const r = window.__CRS.ctx.service('render.commissariats'); return r ? { ...r.stats } : null; });
  C.check(!!render && render.sites === 7, 'habillage des commissariats branché (7 sites)', JSON.stringify(render));

  // Tab : la carte de commandement
  await hold(page, 'Tab');
  await frames(page, 6);
  let screen = await page.evaluate(() => window.__CRS.ctx.ui.current);
  if (screen !== 'carte_tactique') {
    C.note(`Tab a ouvert « ${screen} » : ouverture directe de la carte`);
    await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique'));
    await frames(page, 6);
    screen = await page.evaluate(() => window.__CRS.ctx.ui.current);
  }
  C.check(screen === 'carte_tactique', 'Tab : carte de commandement ouverte', screen);
  // C : la fiche d'un commissariat
  await hold(page, 'KeyC');
  await frames(page, 6);
  let t = await tactical(page);
  C.check(!!t && t.kind === 'commissariat' && t.lines.some((l) => /^Envoyer /.test(l)), 'C : fiche d’un commissariat, lignes « Envoyer … »', t && `${t.visee} · ${t.lines.join(' | ')}`);
  await snap(page, 'verif-commissariats-pc-C');
  // C de nouveau : le commissariat suivant (la deuxième pression restait sur le même)
  const firstSite = t && t.visee;
  await hold(page, 'KeyC');
  await frames(page, 6);
  const t2 = await tactical(page);
  C.check(!!t2 && t2.kind === 'commissariat' && t2.visee !== firstSite, 'C de nouveau : le commissariat suivant', t2 && `${firstSite} → ${t2.visee}`);
  await snap(page, 'verif-commissariats-pc-C2');
  // « Plus… › Commissariats »
  for (let i = 0; i < 4 && (await page.evaluate(() => { const x = window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical; return !!(x.state.card || x.state.intent); })); i++) await hold(page, 'Escape');
  await hold(page, 'KeyO');
  await frames(page, 4);
  C.check(await clickSel(page, '[data-id="more-commissariats"]'), '« Plus… › Commissariats » (clic au pavé tactile)');
  await frames(page, 6);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.cpc-site')].map((b) => ({ id: b.dataset.id, h: b.getBoundingClientRect().height, text: b.textContent.trim() })));
  C.check(rows.length === 7, '7 sites dans la liste', rows.map((r) => r.text.slice(0, 40)).join(' | '));
  C.check(rows.every((r) => r.h >= 44), 'rangées d’au moins 44 px', rows.map((r) => Math.round(r.h)).join(','));
  // le 9e au clavier : ↓ jusqu'à sa rangée, Entrée la déplie
  const i9 = rows.findIndex((r) => r.id === 'cpc-site-9e');
  C.check(i9 >= 0, 'le commissariat du 9e est listé');
  const focusRow = async (sel) => {
    for (let k = 0; k < 40; k++) {
      // (la rangée surlignée par les flèches porte la classe is-hl)
      const at = await page.evaluate((q) => { const a = document.querySelector('.is-hl'); return !!a && a.matches(q); }, sel);
      if (at) return true;
      await hold(page, 'ArrowDown');
    }
    return false;
  };
  C.check(await focusRow('[data-id="cpc-site-9e"]'), '↓ : la rangée du 9e prend le focus');
  await hold(page, 'Enter');
  await frames(page, 4);
  const tvRow = await page.evaluate(() => [...document.querySelectorAll('.cpc-unit')].find((b) => /TV 75-19/.test(b.textContent))?.dataset.id ?? '');
  C.check(tvRow !== '', 'Entrée : le 9e déplié, TV 75-19 listée');
  C.check(await focusRow(`[data-id="${tvRow}"]`), '↓ : la rangée de TV 75-19 prend le focus');
  await hold(page, 'Enter');
  await frames(page, 6);
  t = await tactical(page);
  C.check(!!t && t.kind === 'commissariat' && /^Envoyer TV 75-19/.test(t.lineLabel), 'Entrée : fiche du 9e, la ligne de TV 75-19 surlignée', t && t.lineLabel);
  await page.waitForTimeout(700);
  await hold(page, 'Enter');
  await frames(page, 6);
  const where = await page.evaluate(() => { const x = window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical; return x.state.where ? x.state.where.title : ''; });
  C.check(/^OÙ L.ENVOYER/.test(where), 'Entrée : « OÙ L’ENVOYER ? »', where);
  // le lieu : la carte centrée 500 m à l'ouest du 9e, un clic au pavé tactile sur un point libre
  const home = await homeOf(page, '9e:tv19');
  await page.evaluate((h) => window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical.map.flyTo(h.x - 500, h.z + 60, 1.2, 0), home);
  await frames(page, 10);
  const spot = await freeMapSpot(page);
  C.check(!!spot, 'point libre sur la carte');
  if (spot) {
    await page.mouse.click(spot.x, spot.y);
    await frames(page, 6);
  }
  const before = await tactical(page);
  await snap(page, 'verif-commissariats-pc-ou');
  await page.waitForTimeout(700);
  await hold(page, 'Enter');
  await frames(page, 8);
  const after = await tactical(page);
  C.note(`lieu désigné : ${before && before.visee} (${before && before.lineLabel}, qui ${before && before.who}) → ${after && after.sent}`);
  C.note('avis : ' + JSON.stringify((await notices(page)).slice(-4)));
  let e = await entry(page, '9e:tv19');
  C.check(!!e && e.squadId !== 0 && (e.state === 'alerte' || e.state === 'engage'), 'Entrée : TV 75-19 engagée et envoyée', JSON.stringify(e));
  const start = { x: e.x, z: e.z };
  await step(page, 60);
  e = await entry(page, '9e:tv19');
  const gone = Math.hypot(e.x - start.x, e.z - start.z);
  C.check(gone > 100, '60 s plus tard, la voiture est à plus de 100 m de ses places', `${Math.round(gone)} m, état ${e.state}`);
  C.check(e.siren > 0 && e.beacons, 'deux-tons et gyrophares en route', `sirène ${e.siren}, gyrophares ${e.beacons}`);
  await snap(page, 'verif-commissariats-pc-envoyee');
  // « Rentrer au commissariat » (ordre de la carte, comme le bouton de la fiche de l'unité)
  if (!e || e.squadId === 0) throw new Error('TV 75-19 n’a pas été engagée');
  const back = await page.evaluate((id) => {
    const ctx = window.__CRS.ctx;
    const core = ctx.service('ui.command');
    const r = core.issue('retour_poste', [ctx.squads.get(id)], null);
    return { ok: r.ok, reason: r.reason || '' };
  }, e.squadId);
  C.check(back.ok, '« Rentrer au commissariat » accepté', back.reason);
  await step(page, 20);
  e = await entry(page, '9e:tv19');
  C.check(e.state === 'retour' || e.state === 'repos' || e.state === 'au_poste', 'retour en cours', e.state);
  C.check(e.siren === 0, 'retour sans deux-tons', `sirène ${e.siren}`);
  for (let k = 0; k < 30 && e.state === 'retour'; k++) {
    await step(page, 20);
    e = await entry(page, '9e:tv19');
  }
  C.check(e.state === 'repos' || e.state === 'au_poste', 'arrivée : « Au repos » puis « Au poste »', e.state);
  const radio = await page.evaluate(() => window.__CRS.ctx.radio.log.map((m) => m.text).filter((x) => /TV 75-19|commissariat du 9e/.test(x)).slice(-4));
  C.note('radio : ' + radio.join(' / '));
  C.check((await sysErrors(page)).length === 0, 'aucun système en erreur', (await sysErrors(page)).join(', '));
  C.check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
  await close();
}

async function partCrs() {
  console.log('— crs : lecture seule');
  const { page, errors } = await boot({ role: 'crs', place: 'Place de la Concorde', crowd: '100', time: '14' }, { width: 1280, height: 800, pointerLock: false });
  const s = await stock(page);
  C.check(!!s && s.enabled && !s.can, 'CRS : stock visible, engagement réservé au commandant', JSON.stringify(s));
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique'));
  await frames(page, 8);
  await hold(page, 'KeyC');
  await frames(page, 6);
  const t = await page.evaluate(() => {
    const x = window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical;
    return { kind: x.state.visee && x.state.visee.kind, lines: x.card ? x.card.lines.map((l) => l.label) : [], notes: x.card ? x.card.notes : [] };
  });
  C.check(t.kind === 'commissariat', 'C : fiche du commissariat ouverte en lecture', t.kind);
  C.check(!t.lines.some((l) => /^Envoyer /.test(l)), 'aucune ligne « Envoyer »', t.lines.join(' | '));
  C.check(t.notes.some((n) => /Seul le commandant engage les moyens des commissariats/.test(n)), '« Seul le commandant engage les moyens des commissariats »', t.notes.join(' | '));
  await snap(page, 'verif-commissariats-crs');
  C.check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
  await close();
}

async function partTel() {
  console.log('— tel : téléphone 844 × 390, au doigt');
  const { page, errors } = await boot({ role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '100', time: '14' }, { width: 844, height: 390, mobile: true, pointerLock: false });
  await page.evaluate(() => window.__CRS.ctx.ui.open('carte_tactique'));
  await frames(page, 8);
  const home = await homeOf(page, '9e:tv19');
  await page.evaluate((h) => window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical.map.flyTo(h.x, h.z, 1.5, 0), home);
  await frames(page, 10);
  const sp = await page.evaluate((h) => {
    const t = window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical;
    const o = { x: 0, y: 0 };
    t.map.view.worldToScreen(h.x, h.z, o);
    const r = t.map.canvas.getBoundingClientRect();
    return { x: r.left + o.x, y: r.top + o.y };
  }, home);
  await page.touchscreen.tap(sp.x, sp.y);
  await frames(page, 8);
  let t = await tactical(page);
  C.check(!!t && t.kind === 'commissariat', 'toucher le symbole du 9e : fiche du poste', t && t.visee);
  const buttons = (re) => page.evaluate((src) => [...document.querySelectorAll('.ct-mount-card button')]
    .filter((b) => b.offsetParent && new RegExp(src).test(b.textContent))
    .map((b) => { const k = b.getBoundingClientRect(); return { x: k.left + k.width / 2, y: k.top + k.height / 2, h: k.height }; }), re.source);
  const tv = await buttons(/Envoyer TV 75-19/);
  // (rangées des fiches : 40 px au téléphone, règle de la refonte de la carte de commandement)
  C.check(tv.length > 0 && tv[0].h >= 40, 'ligne « Envoyer TV 75-19 » à la hauteur des rangées de fiche (≥ 40 px)', tv.length ? `${Math.round(tv[0].h)} px` : 'absente');
  await snap(page, 'verif-commissariats-tel-fiche');
  if (tv.length) {
    await page.touchscreen.tap(tv[0].x, tv[0].y);
    await frames(page, 6);
    const send = await buttons(/Donner l/);
    if (send.length) {
      await page.touchscreen.tap(send[0].x, send[0].y);
      await frames(page, 8);
    }
    const where = await page.evaluate(() => { const x = window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical; return x.state.where ? x.state.where.title : ''; });
    C.check(/^OÙ L.ENVOYER/.test(where), 'téléphone : « OÙ L’ENVOYER ? »', where);
    await page.evaluate((h) => window.__CRS.game.systems.find((q) => q.id === 'ui:command').tactical.map.flyTo(h.x - 400, h.z + 60, 1.5, 0), home);
    await frames(page, 10);
    const spot = await freeMapSpot(page);
    if (spot) await page.touchscreen.tap(spot.x, spot.y);
    await frames(page, 8);
    const send2 = await buttons(/Donner l/);
    await page.waitForTimeout(700);
    if (send2.length) await page.touchscreen.tap(send2[0].x, send2[0].y);
    await frames(page, 8);
    const e = await entry(page, '9e:tv19');
    C.check(!!e && (e.state === 'alerte' || e.state === 'engage'), 'téléphone : TV 75-19 engagée et envoyée', JSON.stringify(e));
    await snap(page, 'verif-commissariats-tel-envoyee');
  }
  C.check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
  await close();
}

async function partVue() {
  console.log('— vue : devant le 9e, de jour et de nuit ; coût par image');
  const { page, errors } = await boot({ role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '100', time: '14' }, { width: 1280, height: 720, pointerLock: false });
  // le joueur sur le trottoir, à 10 m devant la porte du 9e (dans l'axe de la façade, côté rue), regard vers la porte
  await page.evaluate(async () => {
    const c = window.__CRS;
    const v = c.ctx.service('police.commissariats').get('9e');
    // normale de la façade (vers la rue) : données figées du site, servies par le serveur de développement
    const data = await import('/src/world/commissariats/index.ts');
    const h = data.commissariatById('9e').facade.heading;
    const px = v.x + Math.sin(h) * 10;
    const pz = v.z + Math.cos(h) * 10;
    c.teleport(px, pz);
    const st = c.ctx.player.state;
    st.cameraMode = 'tps';
    st.camYaw = Math.atan2(v.x - px, v.z - pz);
    st.camPitch = 0.05;
  });
  for (let k = 0; k < 6; k++) await frames(page, 10);
  const stats = await page.evaluate(() => ({ ...window.__CRS.ctx.service('render.commissariats').stats }));
  C.check(stats.visible >= 1, 'habillage proche du 9e affiché', JSON.stringify(stats));
  C.check(stats.drawCalls <= 2 * Math.max(1, stats.visible) + 1, 'appels de dessin : au plus 2 par site proche + 1 lointain', `${stats.drawCalls} pour ${stats.visible} site(s) proche(s)`);
  await snap(page, 'verif-commissariats-9e-14h');
  await page.evaluate(() => window.__CRS.ctx.env.setTime(22));
  for (let k = 0; k < 4; k++) await frames(page, 10);
  await snap(page, 'verif-commissariats-9e-22h');
  // coût des deux systèmes des commissariats par image (service « perf », modèle de verif-tpm-perf)
  const cost = await page.evaluate(async () => {
    const perf = window.__CRS.ctx.service('perf');
    const ids = ['gameplay.commissariats', 'render.commissariats'];
    const per = [];
    for (let k = 0; k < 90; k++) {
      await new Promise((r) => requestAnimationFrame(() => r()));
      let ms = 0;
      for (const s of perf.systems) if (ids.includes(s.id)) ms += s.updateMs + s.frameMs;
      per.push(ms);
    }
    per.sort((a, b) => a - b);
    return { med: per[45], p90: per[81], found: perf.systems.filter((s) => ids.includes(s.id)).map((s) => s.id) };
  });
  C.check(cost.found.length === 2, 'les deux systèmes sont mesurés', cost.found.join(', '));
  C.check(cost.med <= 0.3, 'coût par image des commissariats ≤ 0,3 ms (médiane)', `médiane ${cost.med.toFixed(3)} ms, p90 ${cost.p90.toFixed(3)} ms`);
  // la Cité : le joueur arrive APRÈS la mise en place (tuiles et mobilier chargés ensuite) ; les véhicules garés ne sont
  // ni dans un candélabre ni dans la fontaine Wallace, ni sur le trottoir
  await page.evaluate(() => window.__CRS.ctx.env.setTime(14));
  await page.evaluate(async () => {
    const c = window.__CRS;
    const data = await import('/src/world/commissariats/index.ts');
    const d = data.commissariatById('cite');
    const s = d.slots[3];
    // de l'autre côté du boulevard, regard vers les places
    const nx = Math.cos(s.heading), nz = -Math.sin(s.heading);
    c.teleport(s.x + nx * 11, s.z + nz * 11);
    const st = c.ctx.player.state;
    st.cameraMode = 'tps';
    st.camYaw = Math.atan2(-nx, -nz) + 0.5;
    st.camPitch = 0.12;
  });
  for (let k = 0; k < 8; k++) await frames(page, 10);
  const cite = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const a = ctx.service('police.commissariats');
    const out = [];
    let n = 0;
    for (const e of a.get('cite').entries) {
      for (const id of e.vehicleIds) {
        const v = ctx.vehicles.get(id);
        n++;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const buf = [];
        const m = ctx.props.queryRadius(v.x, v.z, v.def.length / 2 + 3, buf);
        for (let i = 0; i < m; i++) {
          const p = buf[i];
          if (!p.blocksMove) continue;
          const dx = p.x - v.x, dz = p.z - v.z, r = Math.max(p.halfX, p.halfZ);
          if (Math.abs(dx * fx + dz * fz) < v.def.length / 2 + r && Math.abs(dx * fz - dz * fx) < v.def.width / 2 + r) out.push(`${e.callsign} dans ${p.kind}`);
        }
        if (ctx.world.surfaceAt(v.x, v.z) !== 'road') out.push(`${e.callsign} sur ${ctx.world.surfaceAt(v.x, v.z)}`);
      }
    }
    return { n, out, props: ctx.props.queryRadius(1780, 1200, 60, []) };
  });
  C.check(cite.n >= 7 && cite.props > 0 && cite.out.length === 0, 'Cité : véhicules garés hors du mobilier et sur la chaussée (mobilier chargé)', `${cite.n} véhicules, ${cite.props} objets du décor ; ${cite.out.join(', ') || 'aucun défaut'}`);
  await snap(page, 'verif-commissariats-cite-14h');
  C.check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
  await close();
}

const RUN = { pc: partPc, crs: partCrs, tel: partTel, vue: partVue };
try {
  for (const p of parts) {
    try {
      await RUN[p]();
    } catch (err) {
      C.check(false, `partie ${p} : exception`, String(err && err.stack || err).split('\n').slice(0, 4).join(' '));
      await close();
    }
  }
} finally {
  C.done();
  await close();
  await server.close();
}
process.exit(C.failures.length === 0 ? 0 : 1);
