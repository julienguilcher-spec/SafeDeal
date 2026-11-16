// Testeur indépendant — JOUEUR SUR PC, suite : République à midi avec foule ; qualité changée EN JEU ; fin de partie,
// compte rendu, retour à l'accueil ; SECONDE session lancée depuis l'accueil (Étoile, nuit) : restes de la première ?
// puis passage sous l'Arc de Triomphe.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'p2';
const only = (args.only ?? 'ABCDE').toUpperCase();
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const R = { tag };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&place=${encodeURIComponent('Place de la République')}&time=12&weather=clair&quality=bas&seed=21&crowd=${args.crowd ?? 300}&tension=0.3`;
const { browser, page, errors } = await openPage(url, { width: W, height: H });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const section = async (name, fn) => {
  const n0 = errors.length;
  try { await fn(); } catch (e) { R[name + '_exception'] = String(e && e.stack ? e.stack : e).slice(0, 600); console.error(`EXCEPTION [${name}]`, String(e && e.stack ? e.stack : e).slice(0, 500)); try { await snap(page, `verif-${tag}-echec-${name}`); } catch {} }
  R[name + '_rss'] = rss(); log(`  [${name}] mémoire`, J(R[name + '_rss']));
  if (errors.length > n0) { R[name + '_errors'] = errors.slice(n0, n0 + 6); log(`  ERREURS CONSOLE pendant ${name}:`, J(errors.slice(n0, n0 + 6))); }
  save();
};
// clic réel (événements souris) sans attendre la « stabilité » de l'élément : les images peuvent durer plusieurs secondes ici
const click = async (sel) => { const loc = typeof sel === 'string' ? page.locator(sel) : sel; await loc.first().click({ timeout: 180000, force: true }); };
const tap = async (k) => { await key.down(k); await frames(page, 2); await key.up(k); await frames(page, 1); };
const memory = () => ev(() => { const c = window.__CRS.ctx; const m = c.view.renderer.info.memory; return { geometries: m.geometries, textures: m.textures, people: c.people.list.length, vehicles: c.vehicles.list.length, props: c.props.list.length, projectiles: c.projectiles.list.length, squads: c.squads.list.length, forceLog: c.law.forceLog.length }; });
const viewStats = () => ev(() => { const c = window.__CRS.ctx; const b = c.service('render.base'); const i = c.view.renderer.info; const wv = c.service('world.view').stats(); return { quality: c.view.quality, set: c.settings.values.quality, draw: Math.round(c.view.drawDistance), buf: `${b.stats.width}×${b.stats.height}`, shadows: b.shadows, calls: i.render.calls, tris: i.render.triangles, detailTiles: wv.detailTiles, farTiles: wv.farTiles, queued: wv.queued, geometries: i.memory.geometries, textures: i.memory.textures, manif: c.people.list.filter((q) => q.kind === 'manifestant').length, total: c.director.stats.total, crowdDensity: c.settings.values.crowdDensity }; });

try {
  const t0 = Date.now();
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  R.loadMs = Date.now() - t0;
  await install(page);
  await frames(page, 4);
  let heading = await ev(() => window.__CRS.ctx.service('session.setup').summary.heading);

  // ═══ A. République, midi, foule ═══
  if (only.includes('A')) await section('A', async () => {
    R.setupA = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z }, env: { time: c.env.state.timeOfDay, night: c.env.state.isNight }, kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), director: { phase: c.director.phase, total: c.director.stats.total, tension: c.director.tension, route: c.director.route.length / 2 }, bounds: c.world.bounds }; });
    log('A setup', J(R.setupA), 'chargement', R.loadMs);
    R.memA = await memory();
    await step(page, 20); // la foule arrive
    await snap(page, `verif-${tag}-A-fps`);
    await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-A-tps`); await key.press('KeyV'); await step(page, 0.3);
    // regard vers la foule : direction du plus gros paquet de manifestants
    const crowdAt = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const m = c.people.list.filter((q) => q.kind === 'manifestant'); if (!m.length) return null; const cx = m.reduce((s, q) => s + q.x, 0) / m.length, cz = m.reduce((s, q) => s + q.z, 0) / m.length; return { n: m.length, cx, cz, d: Math.hypot(cx - p.x, cz - p.z), yaw: Math.atan2(cx - p.x, cz - p.z), profiles: m.reduce((o, q) => (o[q.profile] = (o[q.profile] || 0) + 1, o), {}), dy: m.slice(0, 40).map((q) => +(q.y - c.world.heightAt(q.x, q.z)).toFixed(2)).filter((v) => Math.abs(v) > 0.02).length }; });
    R.crowd = crowdAt; log('  foule', J(crowdAt));
    if (crowdAt) {
      // on s'approche à 14 m du centre de la foule (déplacement instantané), vue à hauteur d'homme
      await ev((c) => window.__V.tp(c.cx - Math.sin(c.yaw) * 14, c.cz - Math.cos(c.yaw) * 14), crowdAt);
      await ev((c) => { const s = window.__CRS.ctx.player.state; const p = window.__CRS.ctx.player.person(); s.camYaw = Math.atan2(c.cx - p.x, c.cz - p.z); s.camPitch = 0; }, crowdAt);
      await step(page, 0.4); await frames(page, 4); await snap(page, `verif-${tag}-A-foule-fps`);
      await ev(() => { window.__CRS.ctx.player.state.zoom = 2.2; }); await step(page, 0.1); await frames(page, 3); await snap(page, `verif-${tag}-A-foule-zoom`);
      await ev(() => { window.__CRS.ctx.player.state.zoom = 1; });
    }
    // 3 minutes de manifestation : phases, tension, erreurs
    R.evolution = await ev(() => { const c = window.__CRS; const out = []; for (let k = 0; k < 6; k++) { for (let i = 0; i < 900; i++) c.game.step(1 / 30); const d = c.ctx.director; out.push({ t: Math.round(c.ctx.clock.now), phase: d.phase, tension: +d.tension.toFixed(2), manif: c.ctx.people.list.filter((q) => q.kind === 'manifestant').length, people: c.ctx.people.list.length, veh: c.ctx.vehicles.list.length }); } return out; });
    log('  évolution', J(R.evolution));
    await frames(page, 4); await snap(page, `verif-${tag}-A-foule-apres-3min`);
    R.sysA = await ev(() => window.__V.errors());
  });

  // ═══ B. qualité changée en jeu ═══
  if (only.includes('B')) await section('B', async () => {
    const home = await ev(() => { const s = window.__CRS.ctx.service('session.setup').summary; return [s.x, s.z]; });
    await ev(([x, z]) => window.__V.tp(x, z), home);
    await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0; }, heading);
    await step(page, 0.3); await frames(page, 3);
    R.qBas = await viewStats(); log('B bas', J(R.qBas));
    await snap(page, `verif-${tag}-B-bas`);
    await tap('KeyP');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
    await click('[data-id="pause-parametres"]');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "parametres"', 180000);
    await click('[data-id="ptab-graphismes"]'); await frames(page, 2);
    const tq = Date.now();
    await click('[data-id="set-quality"] [data-value="moyen"]');
    await waitFor(page, 'window.__CRS.ctx.settings.values.quality === "moyen"', 180000);
    await frames(page, 2);
    R.qSwitchMs = Date.now() - tq;
    await snap(page, `verif-${tag}-B-parametres-moyen`);
    await click('[data-id="parametres-retour"]');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
    await click('[data-id="pause-reprendre"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 180000);
    const tr = Date.now();
    await ev(async () => { const v = window.__CRS.ctx.service('world.view'); let g = 0; while (v && v.pending() > 0 && g++ < 600) { v.flush(150); await new Promise((r) => setTimeout(r, 0)); } });
    await frames(page, 4);
    R.qRebuildMs = Date.now() - tr;
    await step(page, 0.5); await frames(page, 3);
    R.qMoyen = await viewStats(); log('  moyen', J(R.qMoyen), 'bascule', R.qSwitchMs, 'ms, reconstruction', R.qRebuildMs, 'ms');
    await snap(page, `verif-${tag}-B-moyen`);
    await key.press('KeyV'); await step(page, 0.4); await frames(page, 2); await snap(page, `verif-${tag}-B-moyen-tps`); await key.press('KeyV'); await step(page, 0.3);
    R.frameMoyen = await ev(() => new Promise((resolve) => { const t = performance.now(); let n = 0; const f = () => (++n >= 3 ? resolve((performance.now() - t) / 3) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    R.sysB = await ev(() => window.__V.errors());
    // retour en « bas »
    await tap('KeyP');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
    await click('[data-id="pause-parametres"]');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "parametres"', 180000);
    await click('[data-id="ptab-graphismes"]'); await frames(page, 2);
    await click('[data-id="set-quality"] [data-value="bas"]');
    await waitFor(page, 'window.__CRS.ctx.settings.values.quality === "bas"', 180000);
    await click('[data-id="parametres-retour"]');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
    await click('[data-id="pause-reprendre"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 180000);
    await frames(page, 4);
    R.qBas2 = await viewStats(); log('  retour bas', J(R.qBas2), 'ms/image en moyen', Math.round(R.frameMoyen));
  });

  // ═══ C. terminer → compte rendu → accueil ═══
  if (only.includes('C')) await section('C', async () => {
    R.memBeforeEnd = await memory();
    await tap('KeyP');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
    await click('[data-id="pause-terminer"]');
    await page.waitForSelector('[data-id="dialog-confirm"]', { timeout: 120000 });
    await snap(page, `verif-${tag}-C-confirmation`);
    await click('[data-id="dialog-confirm"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "debrief"', 180000);
    await frames(page, 3); await snap(page, `verif-${tag}-C-compte-rendu`);
    R.debrief = await ev(() => (document.querySelector('.crs-ui')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 1400));
    log('C compte rendu', R.debrief);
    await ev(() => { const s = document.querySelector('.ui-scroll, .ui-debrief__body'); if (s) s.scrollTop = 99999; });
    await frames(page, 2); await snap(page, `verif-${tag}-C-compte-rendu-bas`);
    await click('[data-id="debrief-accueil"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "menu"', 180000);
    await frames(page, 3);
    R.menuAfter = await ev(() => { const c = window.__CRS.ctx; const m = c.view.renderer.info.memory; return { screen: c.ui.current, people: c.people.list.length, vehicles: c.vehicles.list.length, projectiles: c.projectiles.list.length, props: c.props.list.length, geometries: m.geometries, textures: m.textures, hudVisible: c.service('ui.debug')?.hudVisible, notices: (c.service('ui.debug')?.notices?.() ?? []).length, audio: c.service('audio.debug')?.stats?.() }; });
    log('  retour accueil', J(R.menuAfter));
    await snap(page, `verif-${tag}-C-accueil`);
  });

  // ═══ D. seconde session depuis l'accueil : Étoile, nuit ═══
  if (only.includes('D')) await section('D', async () => {
    await click('[data-id="tab-role"]'); await frames(page, 2);
    await click('[data-id="role-crs"]'); await frames(page, 2);
    await click('[data-value="bouclier"]'); await frames(page, 2);
    await click('[data-id="tab-lieu"]'); await frames(page, 2);
    await click(page.locator('.ui-list__item', { hasText: 'Champs-Élysées' })); await frames(page, 2);
    await click('[data-id="tab-meteo"]'); await frames(page, 2);
    await page.locator('[data-id="heure"]').focus();
    await tap('End'); await frames(page, 2); // 23 h 45
    R.resume2 = await ev(() => (document.querySelector('[data-id="lancer"]')?.closest('aside, .ui-panel, section')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 500));
    log('D résumé', R.resume2);
    await snap(page, `verif-${tag}-D-accueil-regle`);
    const t1 = Date.now();
    await click('[data-id="lancer"]');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
    R.loadMs2 = Date.now() - t1;
    await install(page);
    await frames(page, 4);
    R.setup2 = await ev(() => {
      const c = window.__CRS.ctx; const p = c.player.person(); const cfg = c.session.config;
      let gasMax = 0; for (let dx = -80; dx <= 80; dx += 8) for (let dz = -80; dz <= 80; dz += 8) gasMax = Math.max(gasMax, c.hazards.gasAt(p.x + dx, p.z + dz));
      return {
        cfg: { place: cfg.place, time: cfg.timeOfDay, crowd: cfg.crowdSize, seed: cfg.seed }, env: { time: c.env.state.timeOfDay, night: c.env.state.isNight, daylight: c.env.state.daylight, lights: c.env.state.streetLights }, sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z, poste: p.poste, health: p.health, stamina: p.stamina, gas: p.gas, inv: p.inventory.map((i) => i.id) },
        kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), farPeople: c.people.list.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) > 1200).length, director: { phase: c.director.phase, total: c.director.stats.total, tension: c.director.tension },
        gasMax, forceLog: c.law.forceLog.length, projectiles: c.projectiles.list.length, clock: c.clock.now, quality: c.view.quality, roe: { sommations: c.law.roe.sommations ?? c.law.roe.stage, level: c.law.roe.authorized ?? c.law.roe.maxForce },
        landmarks: c.world.landmarks.map((l) => ({ key: l.key, x: l.x, z: l.z, heading: l.heading, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) })).sort((a, b) => a.d - b.d).slice(0, 4), heading: c.service('session.setup').summary.heading,
        notices: (c.service('ui.debug')?.notices?.() ?? []).length, radioLog: c.radio.log ? c.radio.log.length : null,
      };
    });
    R.mem2 = await memory();
    log('  setup 2', J(R.setup2)); log('  mémoire A → 2', J(R.memA), J(R.mem2), 'chargement', R.loadMs2);
    heading = R.setup2.heading;
    await step(page, 0.5);
    await snap(page, `verif-${tag}-D-nuit-fps`);
    await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-D-nuit-tps`); await key.press('KeyV'); await step(page, 0.3);
    for (const [n, dy] of [['gauche', Math.PI / 2], ['arriere', Math.PI], ['droite', -Math.PI / 2]]) { await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0.05; }, heading + dy); await step(page, 0.3); await frames(page, 3); await snap(page, `verif-${tag}-D-nuit-${n}`); }
  });

  // ═══ E. passer sous l'Arc de Triomphe ═══
  if (only.includes('E')) await section('E', async () => {
    const arc = await ev(() => { const l = window.__CRS.ctx.world.landmarks.find((q) => /arc_de_triomphe|arc_triomphe/.test(q.key)); return l ? { key: l.key, x: l.x, z: l.z, heading: l.heading, height: l.height } : null; });
    R.arc = arc; log('E arc', J(arc));
    if (!arc) return;
    const far = await ev((a) => window.__V.tp(a.x, a.z + 70), arc);
    R.arcAxes = await ev((a) => { const out = []; const c = window.__CRS.ctx; for (let k = 0; k < 24; k++) { const ang = (k / 24) * Math.PI; const ax = a.x + Math.sin(ang) * 45, az = a.z + Math.cos(ang) * 45, bx = a.x - Math.sin(ang) * 45, bz = a.z - Math.cos(ang) * 45; const h = window.__V.ray(ax, az, bx, bz); out.push({ deg: Math.round(ang * 180 / Math.PI), blocked: h ? `${h.kind}@${h.d.toFixed(1)}` : null }); } return { axes: out, bhCentre: c.world.buildingHeightAt(a.x, a.z), freeCentre: c.world.isFree(a.x, a.z, 0.3), versConcorde: Math.round(Math.atan2(-7.7 - a.x, 17.4 - a.z) * 180 / Math.PI) }; }, arc);
    log('  axes libres', J(R.arcAxes.axes.filter((x) => !x.blocked).map((x) => x.deg)), 'cap vers la Concorde', R.arcAxes.versConcorde, 'centre', J({ bh: R.arcAxes.bhCentre, free: R.arcAxes.freeCentre }));
    const free = R.arcAxes.axes.filter((x) => !x.blocked);
    // l'axe libre le plus proche de la direction de la Concorde (grande arche)
    const want = ((R.arcAxes.versConcorde % 180) + 180) % 180;
    const best = free.sort((a, b) => Math.min(Math.abs(a.deg - want), 180 - Math.abs(a.deg - want)) - Math.min(Math.abs(b.deg - want), 180 - Math.abs(b.deg - want)))[0];
    R.arcAxis = best || null;
    const ang = (best ? best.deg : want) * Math.PI / 180;
    await ev(([a, an]) => window.__V.tp(a.x + Math.sin(an) * 60, a.z + Math.cos(an) * 60), [arc, ang]);
    await ev(([an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 0.3; }, [ang]);
    await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-E-arc-approche`);
    await key.down('KeyW');
    R.arcWalk = await ev(([a, an]) => { const c = window.__CRS; const p = c.ctx.player.person(); let min = 1e9, notFree = 0; const along = () => (p.x - a.x) * -Math.sin(an) + (p.z - a.z) * -Math.cos(an); for (let i = 0; i < 30 * 60; i++) { c.ctx.player.state.camYaw = an + Math.PI; c.game.step(1 / 30); const d = Math.hypot(p.x - a.x, p.z - a.z); min = Math.min(min, d); if (!c.ctx.world.isFree(p.x, p.z, 0.05)) notFree++; if (along() > 35) break; } return { minDistCentre: min, notFree, along: along(), crossed: along() > 30, end: { x: p.x, z: p.z } }; }, [arc, ang]);
    await key.up('KeyW');
    log('  traversée à pied', J(R.arcWalk));
    await ev(([a]) => { const c = window.__CRS; const p = c.ctx.player.person(); p.x = a.x; p.z = a.z; c.ctx.people.rebuildIndex(); }, [arc]);
    await ev(([an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 1.2; }, [ang]);
    await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-E-sous-arc-voute`);
    await ev(([an]) => { const s = window.__CRS.ctx.player.state; s.camYaw = an + Math.PI; s.camPitch = 0.05; }, [ang]);
    await step(page, 0.2); await frames(page, 3); await snap(page, `verif-${tag}-E-sous-arc-axe`);
    R.arcUnder = await ev(() => { const i = window.__V.info(); return { x: i.x, z: i.z, bh: i.bh, free: i.free, surface: i.surface, y: i.y, ground: i.ground }; });
    log('  sous l’arc', J(R.arcUnder));
    // vue d'ensemble de jour pour juger l'orientation : on s'éloigne vers la Concorde de 120 m
    await ev(([a]) => { const d = Math.hypot(-7.7 - a.x, 17.4 - a.z); return window.__V.tp(a.x + (-7.7 - a.x) / d * 120, a.z + (17.4 - a.z) / d * 120); }, [arc]);
    await ev(([a]) => { const c = window.__CRS.ctx; const p = c.player.person(); c.player.state.camYaw = Math.atan2(a.x - p.x, a.z - p.z); c.player.state.camPitch = 0.2; }, [arc]);
    await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-E-arc-nuit-120m`);
    await ev(() => { const c = window.__CRS.ctx; c.env.setTime(12); c.service('render.base')?.snap?.(); });
    await step(page, 0.6); await frames(page, 5); await snap(page, `verif-${tag}-E-arc-jour-120m`);
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
