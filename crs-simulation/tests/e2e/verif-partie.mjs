// Testeur indépendant — JOUEUR SUR PC : parcours complet depuis l'accueil (République, midi), objets, fourgon,
// cartes, roue d'ordres, radio, pause, paramètres (qualité en jeu), compte rendu, accueil, SECONDE session (Étoile, nuit).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const tag = args.tag ?? 'partie';
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const R = { tag };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: W, height: H });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const section = async (name, fn) => {
  const n0 = errors.length;
  try { await fn(); } catch (e) { R[name + '_exception'] = String(e && e.stack ? e.stack : e).slice(0, 600); console.error(`EXCEPTION [${name}]`, e); try { await snap(page, `verif-${tag}-echec-${name}`); } catch {} }
  R[name + '_rss'] = rss(); log(`  [${name}] mémoire`, J(R[name + '_rss']));
  if (errors.length > n0) { R[name + '_errors'] = errors.slice(n0, n0 + 6); log(`  ERREURS CONSOLE pendant ${name}:`, J(errors.slice(n0, n0 + 6))); }
  save();
};
const click = async (sel) => { const loc = typeof sel === 'string' ? page.locator(sel) : sel; await loc.first().scrollIntoViewIfNeeded(); await loc.first().click(); };
const resume = () => page.evaluate(() => { const h = document.querySelector('.ui-home__summary'); return document.querySelector('[data-id="lancer"]')?.closest('.ui-panel, aside, section')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? (h ? h.textContent : null); });
/** Rectangles des éléments de HUD visibles et recouvrements deux à deux. */
const hudOverlaps = () => page.evaluate(() => {
  const els = [...document.querySelectorAll('.ui-hud .hud-box, .ui-hud [data-id], .ui-hud [data-widget]')].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 4 && b.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; });
  // on ne garde que les éléments les plus hauts dans l'arbre (pas un enfant d'un autre de la liste)
  const top = els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
  const rects = top.map((e) => { const b = e.getBoundingClientRect(); return { id: e.getAttribute('data-id') || e.getAttribute('data-widget') || e.className.toString().slice(0, 40), x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; });
  const over = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 3 && oy > 3) over.push(`${a.id} ∩ ${b.id} : ${ox}×${oy}px`);
  }
  const out = rects.filter((r) => r.x < -2 || r.y < -2 || r.x + r.w > innerWidth + 2 || r.y + r.h > innerHeight + 2).map((r) => r.id);
  return { rects, over, horsEcran: out };
});
const launchFromHome = async ({ poste, lieu, hourSteps, meteo, affluence }) => {
  await click('[data-id="tab-role"]');
  await click('[data-id="role-crs"]');
  if (poste) await click(`[data-value="${poste}"]`);
  await click('[data-id="tab-lieu"]');
  await click(page.locator('.ui-list__item', { hasText: lieu }));
  await click('[data-id="tab-meteo"]');
  await page.locator('[data-id="heure"]').focus();
  await key.press('Home');
  for (let i = 0; i < hourSteps; i++) await key.press('ArrowRight');
  if (meteo) await click(`[data-id="meteo-${meteo}"]`);
  await click('[data-id="tab-foule"]');
  await page.locator('[data-id="affluence"]').focus();
  await key.press('Home');
  for (let i = 0; i < affluence; i++) await key.press('ArrowRight');
  await frames(page, 2);
  const txt = await resume();
  const t0 = Date.now();
  await click('[data-id="lancer"]');
  return { t0, txt };
};
const memory = () => ev(() => { const c = window.__CRS.ctx; const m = c.view.renderer.info.memory; const pm = performance.memory; return { geometries: m.geometries, textures: m.textures, heapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null, people: c.people.list.length, vehicles: c.vehicles.list.length, props: c.props.list.length, projectiles: c.projectiles.list.length, squads: c.squads.list.length, forceLog: c.law.forceLog.length }; });

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);

  // ═══ 1. accueil → République, midi, clair, CRS lanceur, 200 manifestants ═══
  await section('lancement1', async () => {
    const { t0, txt } = await launchFromHome({ poste: 'lanceur', lieu: 'Place de la République', hourSteps: 48, meteo: 'clair', affluence: 4 });
    R.resume1 = txt; log('résumé avant lancement', txt);
    await waitFor(page, 'window.__CRS.ctx.session.phase !== "menu"', 60000);
    await page.waitForTimeout(500);
    await snap(page, `verif-${tag}-1-chargement`);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
    R.loadMs1 = Date.now() - t0;
    await install(page);
    await frames(page, 4);
    R.setup1 = await ev(() => {
      const c = window.__CRS.ctx; const p = c.player.person(); const cfg = c.session.config;
      return {
        cfg: { place: cfg.place, time: cfg.timeOfDay, weather: cfg.weather, crowd: cfg.crowdSize, role: cfg.role, extra: cfg.extra && { poste: cfg.extra.poste, options: cfg.extra.options } },
        env: { time: c.env.state.timeOfDay, weather: c.env.state.weather, night: c.env.state.isNight }, sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z, poste: p.poste, inv: p.inventory.map((i) => `${i.id}×${i.count ?? ''}`) },
        kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), director: { phase: c.director.phase, total: c.director.stats.total, tension: c.director.tension }, vehicles: c.vehicles.list.filter((v) => v.faction === 'police').map((v) => v.kind),
        landmarks: c.world.landmarks.map((l) => ({ key: l.key, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) })).sort((a, b) => a.d - b.d).slice(0, 5), quality: c.view.quality, heading: c.service('session.setup').summary.heading,
      };
    });
    log('1 setup', J(R.setup1), 'chargement', R.loadMs1, 'ms');
    R.mem1 = await memory();
    await step(page, 0.5);
    await snap(page, `verif-${tag}-1-fps`);
    R.hud1 = await hudOverlaps(); log('  HUD', J({ over: R.hud1.over, hors: R.hud1.horsEcran, n: R.hud1.rects.length }));
    await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-1-tps`); await key.press('KeyV'); await step(page, 0.3);
  });

  // ═══ 2. objets : sélection de chaque case, lancer dosé, lanceur ═══
  await section('objets', async () => {
    await page.mouse.move(2, 2); await page.mouse.click(2, 2); await frames(page, 2);
    const inv = R.setup1.me.inv.map((s) => s.split('×')[0]);
    R.select = [];
    for (let i = 0; i < inv.length && i < 9; i++) {
      const cur = (await ev(() => window.__V.info())).item;
      if (cur !== inv[i]) { await key.press(`Digit${i + 1}`); await step(page, 1.7); }
      const s = await ev(() => { const i = window.__V.info(); return { item: i.item, upper: i.upper }; });
      R.select.push({ slot: i + 1, attendu: inv[i], enMain: s.item, upper: s.upper, dejaEnMain: cur === inv[i] });
      if (/grenade_lacrymo|lanceur|lbd|gazeuse/.test(inv[i])) await snap(page, `verif-${tag}-2-main-${inv[i]}`);
    }
    log('2 sélection', J(R.select));
    // molette : objet suivant
    const before = (await ev(() => window.__V.info())).item;
    await page.mouse.wheel(0, 100); await step(page, 1.7);
    R.wheel = { before, after: (await ev(() => window.__V.info())).item };
    // lancer dosé : charge courte puis charge pleine, mêmes angles
    const slot = inv.indexOf('grenade_lacrymo') + 1;
    const throwOnce = async (hold) => {
      if ((await ev(() => window.__V.info())).item !== 'grenade_lacrymo') { await key.press(`Digit${slot}`); await step(page, 1.7); }
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0.1; }, R.setup1.heading);
      const n0 = await ev(() => window.__CRS.ctx.projectiles.list.length);
      await page.mouse.down(); await step(page, hold);
      const charge = await ev(() => window.__CRS.ctx.player.state.charge);
      await page.mouse.up(); await step(page, 0.4);
      const res = await ev(() => {
        const c = window.__CRS; const ctx = c.ctx; const me = ctx.player.person();
        const mine = ctx.projectiles.list.filter((q) => q.ownerId === me.id).sort((a, b) => b.id - a.id)[0];
        if (!mine) return null;
        const id = mine.id; let last = { x: mine.x, z: mine.z, y: mine.y }; let maxY = mine.y;
        for (let i = 0; i < 150; i++) { c.game.step(1 / 30); const q = ctx.projectiles.list.find((r) => r.id === id); if (!q) break; last = { x: q.x, z: q.z, y: q.y }; maxY = Math.max(maxY, q.y); }
        return { kind: mine.kind, range: Math.hypot(last.x - me.x, last.z - me.z), maxY: maxY - me.y, at: last, gas: ctx.hazards.gasAt(last.x, last.z) };
      });
      return { hold, charge, n0, ...res };
    };
    if (slot > 0) {
      R.throwShort = await throwOnce(0.25);
      await step(page, 2);
      R.throwFull = await throwOnce(1.2);
      log('  lancer court', J(R.throwShort), 'lancer plein', J(R.throwFull));
      await step(page, 4);
      if (R.throwFull && R.throwFull.at) {
        await ev((at) => { const c = window.__CRS.ctx; const p = c.player.person(); c.player.state.camYaw = Math.atan2(at.x - p.x, at.z - p.z); c.player.state.camPitch = -0.05; }, R.throwFull.at);
        await step(page, 0.3); await snap(page, `verif-${tag}-2-gaz`);
      }
      R.afterThrow = await ev(() => { const c = window.__CRS.ctx; return { forceLog: c.law.forceLog.map((f) => ({ means: f.means, verdict: f.verdict && f.verdict.kind, t: f.t })).slice(-4), tension: c.director.tension, notices: (c.service('ui.debug')?.notices?.() ?? []).map((n) => (n.text || n.message || JSON.stringify(n)).slice(0, 80)), fx: { ...(c.service('render.fx')?.stats ?? {}) } }; });
      log('  après lancers', J(R.afterThrow));
    }
    // lanceur de 56 mm : clic = tir ; clic droit = portée
    const ls = inv.indexOf('lanceur_cougar') + 1;
    if (ls > 0) {
      if ((await ev(() => window.__V.info())).item !== 'lanceur_cougar') { await key.press(`Digit${ls}`); await step(page, 1.9); }
      const n0 = await ev(() => window.__CRS.ctx.projectiles.list.length);
      const r0 = await ev(() => window.__CRS.ctx.service('items')?.launcherRange?.(window.__CRS.ctx.player.person()));
      await page.mouse.click(2, 2, { button: 'right' }); await step(page, 0.3);
      const r1 = await ev(() => window.__CRS.ctx.service('items')?.launcherRange?.(window.__CRS.ctx.player.person()));
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0.1; }, R.setup1.heading);
      await page.mouse.down(); await step(page, 0.15); await page.mouse.up(); await step(page, 0.5);
      const n1 = await ev(() => { const c = window.__CRS.ctx; const me = c.player.person(); return { n: c.projectiles.list.length, kinds: c.projectiles.list.filter((q) => q.ownerId === me.id).map((q) => q.kind), item: window.__V.info().item, count: me.inventory[me.active] ? me.inventory[me.active].count : null }; });
      await snap(page, `verif-${tag}-2-lanceur-tir`);
      R.launcher = { n0, n1, range0: r0, range1: r1 };
      log('  lanceur', J(R.launcher));
      await step(page, 6);
    }
    R.hud2 = await hudOverlaps(); log('  HUD après tirs', J({ over: R.hud2.over, hors: R.hud2.horsEcran }));
  });

  // ═══ 3. fourgon : invites autour du véhicule, monter, rouler 100 m, descendre ═══
  await section('fourgon', async () => {
    const veh = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const v = c.vehicles.list.filter((q) => q.faction === 'police').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; if (!v) return null; const d = c.vehicles.def(v.kind); return { id: v.id, kind: v.kind, x: v.x, z: v.z, heading: v.heading, length: d.length, width: d.width, seats: d.seats.map((s) => ({ role: s.role, x: s.x, z: s.z })), state: v.state }; });
    R.vehicle = veh; log('3 véhicule', J(veh));
    if (!veh) return;
    // invites à 16 points autour du véhicule
    R.prompts = await ev(async (v) => {
      const c = window.__CRS; const ctx = c.ctx; const out = [];
      const hw = v.width / 2 + 0.7, hl = v.length / 2 + 0.7;
      const pts = [];
      for (const s of [-1, 1]) for (const f of [-0.8, -0.4, 0, 0.4, 0.8]) pts.push([s * hw, f * (v.length / 2)]);
      pts.push([0, hl], [0, -hl]);
      for (const [lx, lz] of pts) {
        // repère local : +z = avant du véhicule (cap), +x = à sa gauche ? on note les deux
        const wx = v.x + Math.sin(v.heading) * lz + Math.cos(v.heading) * lx;
        const wz = v.z + Math.cos(v.heading) * lz - Math.sin(v.heading) * lx;
        const p = ctx.player.person();
        p.x = wx; p.z = wz; ctx.people.rebuildIndex();
        ctx.player.state.camYaw = Math.atan2(v.x - wx, v.z - wz);
        c.step(0.3);
        const pr = ctx.player.state.prompt;
        out.push({ lx: +lx.toFixed(1), lz: +lz.toFixed(1), free: ctx.world.isFree(wx, wz, 0.28), prompt: pr ? `${pr.verb}:${pr.label}` : null, moved: Math.hypot(p.x - wx, p.z - wz).toFixed(2) });
      }
      return out;
    }, veh);
    log('  invites', J(R.prompts));
    const drv = R.prompts.find((p) => p.prompt && /conduire/i.test(p.prompt)) || R.prompts.find((p) => p.prompt && /monter/i.test(p.prompt));
    if (!drv) { R.vehicleNoPrompt = true; return; }
    await ev(([v, d]) => { const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person(); p.x = v.x + Math.sin(v.heading) * d.lz + Math.cos(v.heading) * d.lx; p.z = v.z + Math.cos(v.heading) * d.lz - Math.sin(v.heading) * d.lx; ctx.people.rebuildIndex(); ctx.player.state.camYaw = Math.atan2(v.x - p.x, v.z - p.z); c.step(0.3); }, [veh, drv]);
    await snap(page, `verif-${tag}-3-invite`);
    R.promptHud = await ev(() => { const el = [...document.querySelectorAll('.ui-hud *')].find((e) => /Conduire|Monter/.test(e.textContent || '') && e.children.length < 4); return el ? (el.textContent || '').trim().slice(0, 80) : null; });
    await key.press('KeyE'); await step(page, 2.5);
    let s = await ev(() => { const i = window.__V.info(); const c = window.__CRS.ctx; const p = c.player.person(); return { vehicleId: i.vehicleId, seat: p.seat, posture: p.posture, camera: i.camera, prompt: c.player.state.prompt && c.player.state.prompt.label }; });
    R.enter = s; log('  montée', J(s));
    if (!s.vehicleId) { await key.down('KeyE'); await step(page, 2.5); await key.up('KeyE'); s = await ev(() => { const i = window.__V.info(); return { vehicleId: i.vehicleId, camera: i.camera }; }); R.enterHold = s; log('  montée (E maintenu)', J(s)); }
    if (!s.vehicleId) return;
    await frames(page, 3); await snap(page, `verif-${tag}-3-a-bord`);
    R.hudVeh = await hudOverlaps();
    // rouler : W tenu, on mesure distance, vitesse, obstacles
    await key.down('KeyW');
    R.drive = await ev((id) => {
      const c = window.__CRS; const ctx = c.ctx; const v = ctx.vehicles.get(id); const x0 = v.x, z0 = v.z; let dist = 0, px = v.x, pz = v.z, maxSp = 0, inB = 0; const tr = [];
      for (let i = 0; i < 30 * 25; i++) { c.game.step(1 / 30); dist += Math.hypot(v.x - px, v.z - pz); px = v.x; pz = v.z; maxSp = Math.max(maxSp, Math.abs(v.speed)); if (ctx.world.buildingHeightAt(v.x, v.z) > 0) inB++; if (i % 90 === 0) tr.push({ t: (i / 30).toFixed(0), x: +v.x.toFixed(1), z: +v.z.toFixed(1), sp: +v.speed.toFixed(1), gear: v.gear, state: v.state }); if (dist > 110) break; }
      return { dist, net: Math.hypot(v.x - x0, v.z - z0), maxSpeedKmh: maxSp * 3.6, inBuilding: inB, trace: tr, engine: v.engineOn, handbrake: v.handbrake };
    }, s.vehicleId);
    log('  conduite', J(R.drive));
    await frames(page, 3); await snap(page, `verif-${tag}-3-conduite-1`);
    await key.press('KeyV'); await step(page, 0.4); await frames(page, 3);
    R.driveCam = (await ev(() => window.__V.info())).camera;
    await snap(page, `verif-${tag}-3-conduite-2`);
    await key.up('KeyW');
    // volant : gauche 2 s
    await key.down('KeyW'); await key.down('KeyA');
    R.steer = await ev((id) => { const c = window.__CRS; const v = c.ctx.vehicles.get(id); const h0 = v.heading; for (let i = 0; i < 60; i++) c.game.step(1 / 30); return { dHeading: v.heading - h0, speed: v.speed }; }, s.vehicleId);
    await key.up('KeyA'); await key.up('KeyW');
    // sirène et gyrophares
    await key.press('KeyR'); await step(page, 0.3); await key.press('KeyB'); await step(page, 0.3);
    R.lights = await ev((id) => { const v = window.__CRS.ctx.vehicles.get(id); return { siren: v.siren, beacons: v.beacons }; }, s.vehicleId);
    // freiner puis descendre
    await key.down('KeyS');
    await ev((id) => { const c = window.__CRS; const v = c.ctx.vehicles.get(id); for (let i = 0; i < 150 && Math.abs(v.speed) > 0.3; i++) c.game.step(1 / 30); }, s.vehicleId);
    await key.up('KeyS'); await key.press('Space'); await step(page, 0.5);
    const stopped = await ev((id) => { const v = window.__CRS.ctx.vehicles.get(id); return { speed: v.speed, x: v.x, z: v.z, bh: window.__CRS.ctx.world.buildingHeightAt(v.x, v.z), surf: window.__CRS.ctx.world.surfaceAt(v.x, v.z) }; }, s.vehicleId);
    await key.press('KeyE'); await step(page, 2.5);
    const out = await ev((id) => { const c = window.__CRS.ctx; const p = c.player.person(); const v = c.vehicles.get(id); const i = window.__V.info(); return { vehicleId: p.vehicleId, posture: p.posture, camera: i.camera, free: i.free, bh: i.bh, dVeh: Math.hypot(p.x - v.x, p.z - v.z), y: p.y, g: i.ground }; }, s.vehicleId);
    R.exit = { stopped, out, steer: R.steer, lights: R.lights }; log('  descente', J(R.exit));
    await frames(page, 3); await snap(page, `verif-${tag}-3-descendu`);
  });

  // ═══ 4. écrans : plan, carte tactique, roue d'ordres, radio, pause, paramètres (qualité) ═══
  await section('ecrans', async () => {
    const scr = async () => ev(() => ({ screen: window.__CRS.ctx.ui.current, phase: window.__CRS.ctx.session.phase, modal: window.__CRS.ctx.ui.modal, stack: window.__CRS.ctx.service('ui.debug')?.stack }));
    R.screens = {};
    for (const [name, k, file] of [['plan', 'KeyM', 'plan'], ['tactique', 'Tab', 'tactique'], ['ordres', 'KeyF', 'ordres'], ['radio', 'KeyT', 'radio']]) {
      await key.press(k); await frames(page, 4); await page.waitForTimeout(700);
      const a = await scr();
      await snap(page, `verif-${tag}-4-${file}`);
      const texts = await ev(() => [...document.querySelectorAll('.crs-ui button, .crs-ui [role="menuitem"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)).filter(Boolean).slice(0, 40));
      await key.press('Escape'); await frames(page, 4); await page.waitForTimeout(300);
      let b = await scr();
      if (b.screen === a.screen && a.screen) { await key.press(k); await frames(page, 3); b = { ...(await scr()), closedBy: 'touche' }; }
      R.screens[name] = { open: a, afterEscape: b, boutons: texts };
      log(`4 ${name}`, J(R.screens[name]));
      if (b.screen === 'pause') { await click('[data-id="pause-reprendre"]'); await frames(page, 3); }
    }
    // pause par Échap
    await key.press('Escape'); await frames(page, 4); await page.waitForTimeout(400);
    const p1 = await scr();
    R.pauseEscape = p1; log('  Échap', J(p1));
    if (p1.screen !== 'pause') { await key.press('Escape'); await frames(page, 4); await page.waitForTimeout(300); R.pauseP = await scr(); }
    await snap(page, `verif-${tag}-4-pause`);
    await click('[data-id="pause-parametres"]'); await frames(page, 4); await page.waitForTimeout(300);
    R.paramTabs = await ev(() => [...document.querySelectorAll('[data-id^="ptab-"]')].map((e) => e.getAttribute('data-id')));
    for (const t of R.paramTabs) { await click(`[data-id="${t}"]`); await frames(page, 2); await page.waitForTimeout(150); await snap(page, `verif-${tag}-4-param-${t}`); }
    await click('[data-id="ptab-graphismes"]'); await frames(page, 2);
    const q0 = await ev(() => { const c = window.__CRS.ctx; const b = c.service('render.base'); return { quality: c.view.quality, set: c.settings.values.quality, draw: c.view.drawDistance, buf: `${b.stats.width}×${b.stats.height}`, shadows: b.shadows }; });
    await click('[data-id="set-quality"] [data-value="moyen"]'); await frames(page, 3); await page.waitForTimeout(300);
    await click('[data-id="parametres-retour"]'); await frames(page, 3);
    await click('[data-id="pause-reprendre"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 60000);
    await step(page, 1); await frames(page, 6);
    await ev(async () => { const v = window.__CRS.ctx.service('world.view'); let g = 0; while (v && v.pending() > 0 && g++ < 300) { v.flush(200); await new Promise((r) => setTimeout(r, 0)); } });
    await frames(page, 4);
    const q1 = await ev(() => { const c = window.__CRS.ctx; const b = c.service('render.base'); const i = c.view.renderer.info; return { quality: c.view.quality, set: c.settings.values.quality, draw: c.view.drawDistance, buf: `${b.stats.width}×${b.stats.height}`, shadows: b.shadows, calls: i.render.calls, tris: i.render.triangles, manif: c.people.list.filter((q) => q.kind === 'manifestant').length, total: c.director.stats.total }; });
    R.quality = { before: q0, after: q1 }; log('  qualité en jeu', J(R.quality));
    await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0; }, R.setup1.heading);
    await step(page, 0.3);
    await snap(page, `verif-${tag}-4-qualite-moyen`);
    R.sysErrors1 = await ev(() => window.__V.errors());
    R.mem1b = await memory();
    // retour en « bas » pour la suite
    await key.press('Escape'); await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 120000);
    await click('[data-id="pause-parametres"]'); await frames(page, 3); await click('[data-id="ptab-graphismes"]'); await frames(page, 2);
    await click('[data-id="set-quality"] [data-value="bas"]'); await frames(page, 3);
    await click('[data-id="parametres-retour"]'); await frames(page, 3);
  });

  // ═══ 5. terminer → compte rendu → accueil ═══
  await section('fin1', async () => {
    if ((await ev(() => window.__CRS.ctx.ui.current)) !== 'pause') { await key.press('Escape'); await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 120000); }
    await click('[data-id="pause-terminer"]'); await click('[data-id="dialog-confirm"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "debrief"', 120000);
    await frames(page, 3); await snap(page, `verif-${tag}-5-compte-rendu`);
    R.debrief = await ev(() => (document.querySelector('.crs-ui')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 900));
    log('5 compte rendu', R.debrief);
    await click('[data-id="debrief-accueil"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "menu"', 120000);
    await frames(page, 3);
    R.menuAfter = await ev(() => { const c = window.__CRS.ctx; const m = c.view.renderer.info.memory; return { screen: c.ui.current, people: c.people.list.length, vehicles: c.vehicles.list.length, projectiles: c.projectiles.list.length, geometries: m.geometries, textures: m.textures, hudVisible: c.service('ui.debug')?.hudVisible }; });
    log('  retour accueil', J(R.menuAfter));
    await snap(page, `verif-${tag}-5-accueil`);
  });

  // ═══ 6. seconde session : Étoile, nuit ═══
  await section('lancement2', async () => {
    const { t0, txt } = await launchFromHome({ poste: 'bouclier', lieu: 'Champs-Élysées', hourSteps: 92, meteo: 'clair', affluence: 4 });
    R.resume2 = txt; log('résumé 2', txt);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
    R.loadMs2 = Date.now() - t0;
    await install(page);
    await frames(page, 4);
    R.setup2 = await ev(() => {
      const c = window.__CRS.ctx; const p = c.player.person(); const cfg = c.session.config;
      const gasMax = (() => { let m = 0; for (let dx = -60; dx <= 60; dx += 6) for (let dz = -60; dz <= 60; dz += 6) m = Math.max(m, c.hazards.gasAt(p.x + dx, p.z + dz)); return m; })();
      return {
        cfg: { place: cfg.place, time: cfg.timeOfDay, crowd: cfg.crowdSize }, env: { time: c.env.state.timeOfDay, night: c.env.state.isNight, daylight: c.env.state.daylight }, sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z, poste: p.poste, health: p.health, stamina: p.stamina, gas: p.gas, inv: p.inventory.map((i) => i.id) },
        kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), far: c.people.list.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) > 1500).length, director: { phase: c.director.phase, total: c.director.stats.total, tension: c.director.tension },
        gasMax, forceLog: c.law.forceLog.length, projectiles: c.projectiles.list.length, clock: c.clock.now, quality: c.view.quality,
        landmarks: c.world.landmarks.map((l) => ({ key: l.key, x: l.x, z: l.z, heading: l.heading, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) })).sort((a, b) => a.d - b.d).slice(0, 4), heading: c.service('session.setup').summary.heading,
        notices: (c.service('ui.debug')?.notices?.() ?? []).length,
      };
    });
    R.mem2 = await memory();
    log('6 setup 2', J(R.setup2), 'mémoire 1 → 2', J(R.mem1), J(R.mem2));
    await step(page, 0.5);
    await snap(page, `verif-${tag}-6-nuit-fps`);
    await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-6-nuit-tps`); await key.press('KeyV'); await step(page, 0.3);
    R.hud3 = await hudOverlaps();
  });

  // ═══ 7. passer sous l'Arc de Triomphe ═══
  await section('arc', async () => {
    const arc = await ev(() => { const l = window.__CRS.ctx.world.landmarks.find((q) => /arc_de_triomphe|arc_triomphe/.test(q.key)); return l ? { key: l.key, x: l.x, z: l.z, heading: l.heading, height: l.height } : null; });
    R.arc = arc; log('7 arc', J(arc));
    if (!arc) return;
    // axes d'approche : tous les 22,5° ; on cherche ceux où la ligne droite traverse le monument sans obstacle
    R.arcAxes = await ev((a) => { const out = []; for (let k = 0; k < 16; k++) { const ang = (k / 16) * Math.PI * 2; const ax = a.x + Math.sin(ang) * 45, az = a.z + Math.cos(ang) * 45, bx = a.x - Math.sin(ang) * 45, bz = a.z - Math.cos(ang) * 45; const h = window.__V.ray(ax, az, bx, bz); out.push({ deg: Math.round(ang * 180 / Math.PI), blocked: h ? `${h.kind}@${h.d.toFixed(1)}` : null, bhCenter: window.__CRS.ctx.world.buildingHeightAt(a.x, a.z) }); } return out; }, arc);
    log('  axes', J(R.arcAxes));
    const freeAxis = R.arcAxes.find((x) => !x.blocked);
    const deg = freeAxis ? freeAxis.deg : Math.round(arc.heading * 180 / Math.PI);
    const ang = deg * Math.PI / 180;
    await ev(([x, z]) => window.__V.tp(x, z), [arc.x + Math.sin(ang) * 45, arc.z + Math.cos(ang) * 45]);
    await ev(([a, an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 0.25; }, [arc, ang]);
    await step(page, 0.3); await frames(page, 4);
    await snap(page, `verif-${tag}-7-arc-approche`);
    await key.down('KeyW');
    R.arcWalk = await ev(([a, an]) => { const c = window.__CRS; const p = c.ctx.player.person(); let min = 1e9, inB = 0; for (let i = 0; i < 30 * 40; i++) { c.ctx.player.state.camYaw = an + Math.PI; c.game.step(1 / 30); const d = Math.hypot(p.x - a.x, p.z - a.z); min = Math.min(min, d); if (c.ctx.world.buildingHeightAt(p.x, p.z) > 0) inB++; if ((p.x - a.x) * -Math.sin(an) + (p.z - a.z) * -Math.cos(an) > 30) break; } return { minDistCentre: min, inBuildingSteps: inB, end: { x: p.x, z: p.z }, crossed: (p.x - a.x) * -Math.sin(an) + (p.z - a.z) * -Math.cos(an) > 25 }; }, [arc, ang]);
    await key.up('KeyW');
    log('  traversée', J(R.arcWalk));
    await ev(([a]) => window.__V.tp(a.x, a.z), [arc]);
    const under = await ev(() => { const i = window.__V.info(); return { x: i.x, z: i.z, bh: i.bh, free: i.free, surface: i.surface }; });
    R.arcUnder = under;
    await ev(([an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 0.9; }, [ang]);
    await step(page, 0.3); await frames(page, 3); await snap(page, `verif-${tag}-7-sous-arc-haut`);
    await ev(([an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 0.05; }, [ang]);
    await step(page, 0.3); await frames(page, 3); await snap(page, `verif-${tag}-7-sous-arc`);
    log('  sous l’arc', J(under));
  });
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); R.memEnd = await memory(); } catch {}
R.errors = errors.slice(0, 40);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)));
save();
await browser.close();
await server.close();
process.exit(0);
