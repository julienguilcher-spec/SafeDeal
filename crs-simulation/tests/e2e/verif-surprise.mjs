// Testeur indépendant — JOUEUR SUR PC : (1) le scénario PAR DÉFAUT de l'accueil lancé tel quel ; pousser un collègue (E) ;
// (2) « Quitter vers l'accueil » ; (3) « Surprends-moi » puis « Lancer », deux fois : la partie démarre-t-elle sans erreur ?
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, ouvrirEditeur, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const tag = 'surp';
const R = { tag, runs: [] };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 720 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const click = async (sel) => { const loc = typeof sel === 'string' ? page.locator(sel) : sel; await loc.first().click({ timeout: 180000, force: true }); };
const tap = async (k) => { await key.down(k); await frames(page, 2); await key.up(k); await frames(page, 1); };
const resume = () => ev(() => (document.querySelector('[data-id="lancer"]')?.closest('aside, .ui-panel, section')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 420));
const describe = () => ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const cfg = c.session.config; const i = c.view.renderer.info; return { cfg: { role: cfg.role, place: cfg.place, time: cfg.timeOfDay, weather: cfg.weather, crowd: cfg.crowdSize, tension: cfg.tension, duration: cfg.duration, poste: cfg.extra && cfg.extra.poste, variante: cfg.extra && cfg.extra.variante }, player: p ? { kind: p.kind, poste: p.poste, faction: p.faction, x: Math.round(p.x), z: Math.round(p.z), vehicle: p.vehicleId !== 0, inv: p.inventory.map((q) => q.id), free: c.world.isFree(p.x, p.z, 0.1), bh: c.world.buildingHeightAt(p.x, p.z), surf: c.world.surfaceAt(p.x, p.z) } : null, camera: c.player.state.cameraMode, sector: p ? c.world.sectorName(p.x, p.z) : null, env: { time: c.env.state.timeOfDay, weather: c.env.state.weather, night: c.env.state.isNight, rain: c.env.state.rain }, kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), vehicles: c.vehicles.list.filter((v) => v.faction !== 'civil').map((v) => v.kind), director: { phase: c.director.phase, total: c.director.stats.total }, render: { calls: i.render.calls, tris: i.render.triangles }, sys: window.__V.errors() }; });
const quitToHome = async () => {
  await tap('Escape');
  await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 180000);
  const sel = await ev(() => { const b = [...document.querySelectorAll('.crs-ui button')].find((e) => /Quitter vers/.test(e.textContent || '')); return b ? b.getAttribute('data-id') : null; });
  await click(`[data-id="${sel}"]`);
  await frames(page, 2);
  if (await ev(() => !!document.querySelector('[data-id="dialog-confirm"]'))) await click('[data-id="dialog-confirm"]');
  await waitFor(page, 'window.__CRS.ctx.session.phase === "menu"', 180000);
  await frames(page, 3);
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
  for (let run = 0; run < 3; run++) {
    const n0 = errors.length;
    const r = { run };
    try {
      // accueil en quatre modes : l'éditeur est la vue « Mode libre » (le hub s'affiche au retour)
      await ouvrirEditeur(page);
      if (run > 0) { await click('[data-id="surprise"]'); await frames(page, 3); }
      r.resume = await resume(); log(`── partie ${run} :`, r.resume);
      const t0 = Date.now();
      await click('[data-id="lancer"]');
      await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 600000);
      r.loadMs = Date.now() - t0;
      await install(page);
      await frames(page, 4); await step(page, 0.5);
      r.state = await describe(); log('   ', J(r.state), 'chargement', r.loadMs);
      await snap(page, `verif-${tag}-${run}-depart`);
      await key.press('KeyV'); await step(page, 0.5); await frames(page, 2); await snap(page, `verif-${tag}-${run}-depart-autre-vue`); await key.press('KeyV'); await step(page, 0.3);
      if (run === 0) {
        // pousser un collègue : on le vise et on appuie sur E
        r.push = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const m = c.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; if (!m) return null; c.player.state.camYaw = Math.atan2(m.x - p.x, m.z - p.z); c.player.state.camPitch = 0; window.__mate = { id: m.id, x: m.x, z: m.z, health: m.health }; return { d: Math.hypot(m.x - p.x, m.z - p.z) }; });
        await step(page, 0.3);
        const prompt = await ev(() => { const pr = window.__CRS.ctx.player.state.prompt; return pr ? `${pr.verb}:${pr.label}` : null; });
        await key.press('KeyE'); await step(page, 1.5);
        r.push = { ...r.push, prompt, after: await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const m = c.people.get(window.__mate.id); return { moved: +Math.hypot(m.x - window.__mate.x, m.z - window.__mate.z).toFixed(2), posture: m.posture, health: m.health, forceLog: c.law.forceLog.map((f) => ({ means: f.means, verdict: f.verdict && f.verdict.kind })).slice(-2), myOffenses: p.offenses.map((o) => o.type), notices: (c.service('ui.debug')?.notices?.() ?? []).map((n) => (n.text || '').slice(0, 110)) }; }) };
        log('    pousser un collègue', J(r.push));
        await frames(page, 2); await snap(page, `verif-${tag}-0-collegue-pousse`);
        // avance rapide (touche point)
        const t1 = await ev(() => ({ scale: window.__CRS.ctx.clock.timeScale }));
        await key.down('Period'); await frames(page, 3); const t2 = await ev(() => ({ scale: window.__CRS.ctx.clock.timeScale })); await key.up('Period'); await frames(page, 2);
        const t3 = await ev(() => ({ scale: window.__CRS.ctx.clock.timeScale }));
        r.fastForward = { avant: t1.scale, tenu: t2.scale, apres: t3.scale }; log('    avance rapide', J(r.fastForward));
      }
      await step(page, 15);
      r.after15 = await ev(() => ({ sys: window.__V.errors(), people: window.__CRS.ctx.people.list.length, phase: window.__CRS.ctx.director.phase }));
      await quitToHome();
      r.home = await ev(() => ({ screen: window.__CRS.ctx.ui.current }));
    } catch (e) { r.exception = String(e && e.stack ? e.stack : e).slice(0, 500); console.error('EXCEPTION', r.exception); try { await snap(page, `verif-${tag}-${run}-echec`); } catch {} }
    r.errors = errors.slice(n0, n0 + 6); r.rss = rss();
    if (r.errors.length) log('    ERREURS CONSOLE', J(r.errors));
    R.runs.push(r); save();
    if (r.exception) break;
  }
} catch (e) { console.error('EXCEPTION', e); R.exception = String(e); }
log('ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)));
save();
await browser.close(); await server.close(); process.exit(0);
