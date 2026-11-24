// Testeur indépendant — PERFORMANCES ET MÉMOIRE, vrai jeu, 960×540, qualité « bas ».
//   A. temps JavaScript par image et par système (service « perf ») : au repos (FPS, TPS) puis en marchant ;
//   B. traversée à 54 km/h (0,5 m par image) à travers une limite de détail : à-coups de construction des tuiles ;
//   C. tour de dix lieux éloignés puis retour : appels de dessin, triangles, géométries, textures, tas JS (après GC, par CDP),
//      mémoire résidente des processus Chromium ; second tour partiel pour distinguer cache et fuite.
// Usage : node tests/e2e/verif-tpm-perf.mjs [--crowd=600] [--parts=ABC] [--quality=bas]
import { execSync } from 'node:child_process';
import { startServer, openPage, waitFor, frames, step, state, snap, J, R, makeChecker } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const crowd = Number(args.crowd ?? 600);
const parts = args.parts ?? 'ABC';
const quality = args.quality ?? 'bas';
const tag = `verif-tpm-perf${args.tag ? '-' + args.tag : ''}`;
const C = makeChecker(tag);
const report = { crowd, quality };

/** Mémoire résidente (Mo) des processus Chromium lancés par CE script. */
function chromeRss() {
  const rows = execSync('ps -eo pid,ppid,rss,args', { encoding: 'utf8' }).split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 4)
    .map((c) => ({ pid: Number(c[0]), ppid: Number(c[1]), rss: Number(c[2]), args: c.slice(3).join(' ') }));
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const mine = [];
  const walk = (pid) => { for (const k of kids.get(pid) ?? []) { mine.push(k); walk(k.pid); } };
  walk(process.pid);
  const ch = mine.filter((r) => /chrome-headless-shell/.test(r.args));
  const sum = (f) => Math.round(ch.filter(f).reduce((s, r) => s + r.rss, 0) / 1024);
  return { totalMB: sum(() => true), rendererMB: sum((r) => /--type=renderer/.test(r.args)), gpuMB: sum((r) => /--type=gpu-process/.test(r.args)) };
}

const server = await startServer();
const url = `${server.url}?autostart=paris&quality=${quality}&role=crs&poste=lanceur&camera=tps&crowd=${crowd}`;
const t00 = Date.now();
const { browser, page, errors } = await openPage(url, { width: 960, height: 540 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const heapMB = async () => { await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return Math.round(h.usedSize / 104857.6) / 10; };

/** Dans la page : N images complètes game.frame(dt), chronométrées une à une ; gl.finish() et retour à la boucle d'événements entre deux. */
const measure = (n, opt = {}) => page.evaluate(async ([N, o]) => {
  const c = window.__CRS; const ctx = c.ctx; const perf = ctx.service('perf');
  const gl = ctx.view.renderer.getContext();
  const wv = ctx.service('world.view');
  const total = [], sim = [], present = [], build = [], pend = [];
  const per = perf.systems.map(() => []);
  const warm = o.warm ?? 3;
  const p = ctx.player.person();
  const x0 = p.x, z0 = p.z;
  for (let k = 0; k < N + warm; k++) {
    if (o.dx || o.dz) c.teleport(p.x + (o.dx || 0), p.z + (o.dz || 0));
    const t = performance.now();
    c.game.frame(o.dt ?? 1 / 30);
    const ms = performance.now() - t;
    gl.finish();
    await new Promise((r) => setTimeout(r, 0));
    if (k < warm) continue;
    total.push(ms); sim.push(perf.stats.simMs); present.push(perf.stats.presentMs);
    const st = wv && wv.stats ? wv.stats() : null;
    build.push(st ? st.lastFrameBuildMs : 0); pend.push(wv && wv.pending ? wv.pending() : 0);
    perf.systems.forEach((x, i) => per[i].push(x.updateMs + x.frameMs));
  }
  const srt = (a) => a.slice().sort((p, q) => p - q);
  const q = (a, f) => { const b = srt(a); return b[Math.min(b.length - 1, Math.floor(b.length * f))]; };
  const info = ctx.view.renderer.info;
  return {
    n: N, med: q(total, 0.5), p90: q(total, 0.9), min: Math.min(...total), max: Math.max(...total), over16: total.filter((v) => v > 16.7).length, over33: total.filter((v) => v > 33.3).length,
    simMed: q(sim, 0.5), simP90: q(sim, 0.9), presentMed: q(present, 0.5), presentP90: q(present, 0.9),
    buildMax: Math.max(...build), pendMax: Math.max(...pend), pendEnd: pend[pend.length - 1],
    series: o.series ? total.map((v, i) => [Math.round(v * 10) / 10, Math.round(build[i] * 10) / 10, pend[i]]) : undefined,
    systems: perf.systems.map((x, i) => ({ id: x.id, med: q(per[i], 0.5), p90: q(per[i], 0.9), max: Math.max(...per[i]), errors: x.errors, disabled: x.disabled })).filter((s) => s.p90 > 0.05 || s.errors || s.disabled),
    calls: info.render.calls, triangles: info.render.triangles, moved: Math.hypot(p.x - x0, p.z - z0),
    people: ctx.people.list.length, vehicles: ctx.vehicles.list.length,
  };
}, [n, opt]);
const show = (label, m) => {
  console.log(`  ${label} : JS/image médiane ${m.med.toFixed(1)} ms, p90 ${m.p90.toFixed(1)}, max ${m.max.toFixed(1)} (simulation ${m.simMed.toFixed(2)}, présentation ${m.presentMed.toFixed(2)}) ; ${m.calls} appels, ${Math.round(m.triangles / 1000)} k triangles ; ${m.people} personnes, ${m.vehicles} véhicules ; >16,7 ms : ${m.over16}/${m.n}, >33 ms : ${m.over33}/${m.n}`);
  for (const s of m.systems.sort((a, b) => b.med - a.med).slice(0, 9)) console.log(`      ${s.id.padEnd(22)} médiane ${s.med.toFixed(2)}  p90 ${s.p90.toFixed(2)}  max ${s.max.toFixed(1)} ms${s.errors ? `  ERREURS ${s.errors}` : ''}${s.disabled ? '  DÉSACTIVÉ' : ''}`);
};
/** Attend que la ville soit construite autour de la caméra : images jusqu'à file vide (stable 8 images) ; retourne les mesures. */
const settle = (maxFrames = 500) => page.evaluate(async (MAX) => {
  const c = window.__CRS; const ctx = c.ctx; const gl = ctx.view.renderer.getContext(); const wv = ctx.service('world.view'); const perf = ctx.service('perf');
  const t0 = performance.now(); let js = 0, maxMs = 0, calm = 0, n = 0, over33 = 0, over16 = 0, maxBuild = 0; const worst = [];
  while (n < MAX && calm < 8) {
    const t = performance.now(); c.game.frame(1 / 30); const ms = performance.now() - t; gl.finish();
    await new Promise((r) => setTimeout(r, 0));
    n++; js += ms; if (ms > maxMs) maxMs = ms; if (ms > 33.3) over33++; if (ms > 16.7) over16++;
    const st = wv.stats(); if (st.lastFrameBuildMs > maxBuild) maxBuild = st.lastFrameBuildMs;
    if (ms > 33.3) worst.push([n, Math.round(ms), perf.systems.slice().sort((a, b) => (b.updateMs + b.frameMs) - (a.updateMs + a.frameMs))[0].id]);
    const p = ctx.player.person();
    const busy = wv.pending() > 0 || st.queued > 0 || st.fetching > 0 || !ctx.world.isLoaded(p.x, p.z);
    calm = busy ? 0 : calm + 1;
  }
  const st = wv.stats();
  return { frames: n, wallMs: performance.now() - t0, jsMs: js, maxFrameMs: maxMs, over16, over33, maxBuildMs: maxBuild, settled: calm >= 8, worst: worst.slice(0, 12),
    stats: { detail: st.detailTiles, far: st.farTiles, tris: st.triangles, calls: st.drawCalls, bTris: st.buildingTriangles, bCalls: st.buildingDrawCalls, tileMB: st.tileGpuBytes / 1048576, sharedMB: st.sharedGpuBytes / 1048576, maxStepMs: st.maxStepMs, maxStepLabel: st.maxStepLabel, maxBuildingMs: st.maxBuildingMs, lastDetailMs: st.lastDetailMs } };
}, maxFrames);
/** Appels de dessin et triangles dans quatre directions (une image chacune). */
const lookAround = () => page.evaluate(async () => {
  const c = window.__CRS; const ctx = c.ctx; const gl = ctx.view.renderer.getContext(); const info = ctx.view.renderer.info; const out = [];
  for (let k = 0; k < 4; k++) {
    ctx.player.state.camYaw = k * Math.PI / 2; ctx.player.state.camPitch = 0;
    c.game.frame(1 / 30); c.game.frame(1 / 30); gl.finish();
    await new Promise((r) => setTimeout(r, 0));
    out.push({ calls: info.render.calls, triangles: info.render.triangles });
  }
  const mon = ctx.service('monuments')?.stats?.() ?? null;
  return { dirs: out, maxCalls: Math.max(...out.map((o) => o.calls)), maxTriangles: Math.max(...out.map((o) => o.triangles)), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : -1,
    monuments: mon ? { detailed: mon.detailed, distant: mon.distant, triangles: mon.triangles } : null, sector: (() => { const p = ctx.player.person(); return ctx.world.sectorName(p.x, p.z); })() };
});

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  report.startMs = Date.now() - t00;
  report.loading = await page.evaluate(() => ({ ...(window.__CRS.ctx.service('session.loading') ?? {}) }));
  console.log(`  démarrage + chargement (autostart) : ${(report.startMs / 1000).toFixed(1)} s ; ` + J(report.loading));
  // la boucle requestAnimationFrame est arrêtée : toutes les images sont lancées et chronométrées par le test
  await page.evaluate(() => window.__CRS.game.stop());
  // la foule arrive par vagues : 3 minutes simulées
  for (let i = 0; i < 18; i++) await step(page, 10);
  const pop = await page.evaluate(() => { const c = window.__CRS.ctx; const k = {}; for (const p of c.people.list) k[p.kind] = (k[p.kind] || 0) + 1; return { kinds: k, total: c.people.list.length, vehicles: c.vehicles.list.length, phase: c.director.phase, t: c.clock.now, attendus: c.director.stats.total, props: c.props.list.length }; });
  report.population = pop;
  console.log('  population après 3 min simulées : ' + J(pop));
  report.mem0 = { heapMB: await heapMB(), rss: chromeRss() };

  if (parts.includes('A')) {
    console.log('[A] temps JavaScript par image');
    // au repos, troisième personne, face à la foule (cap de mise en place)
    await page.evaluate(() => { const c = window.__CRS; const s = c.ctx.service('session.setup').summary; c.ctx.player.setCameraMode('tps'); c.ctx.player.state.camYaw = s.heading; c.ctx.player.state.camPitch = 0; });
    await settle(200);
    report.idleTps = await measure(40); show('repos, 3e personne', report.idleTps);
    await snap(page, `${tag}-repos-tps`);
    await page.evaluate(() => window.__CRS.ctx.player.setCameraMode('fps'));
    report.idleFps = await measure(40); show('repos, 1re personne', report.idleFps);
    // en marchant (entrée simulée par le service du module d'entrées : avancer + sprint), 120 images de 1/30 s
    await page.evaluate(() => { const s = window.__CRS.ctx.service('input.script'); s.setMove(0, 1); s.press('sprint'); window.__CRS.ctx.player.setCameraMode('tps'); });
    report.walk = await measure(120); show('en courant, 3e personne', report.walk);
    await page.evaluate(() => { const s = window.__CRS.ctx.service('input.script'); s.clear(); });
    C.check(report.walk.moved > 5, 'le personnage a bien couru pendant la mesure', `${report.walk.moved.toFixed(1)} m en 4 s simulées`);
    // simulation seule (sans rendu) : coût d'un pas avec la foule
    report.simOnly = await page.evaluate(() => { const c = window.__CRS; const a = []; for (let k = 0; k < 150; k++) { const t = performance.now(); c.game.step(1 / 30); a.push(performance.now() - t); } a.sort((p, q) => p - q); return { med: a[75], p90: a[135], max: a[149] }; });
    console.log(`  pas de simulation seul : médiane ${report.simOnly.med.toFixed(2)} ms, p90 ${report.simOnly.p90.toFixed(2)}, max ${report.simOnly.max.toFixed(1)}`);
    // étalon : vitesse de ce processeur en JavaScript (boucle flottante fixe), pour situer les mesures
    report.cpuRef = await page.evaluate(() => { const t = performance.now(); let s = 0; for (let i = 0; i < 2e7; i++) s += Math.sqrt(i) * 1.0001; return { ms: performance.now() - t, s }; });
    console.log(`  étalon processeur : 2e7 racines en ${report.cpuRef.ms.toFixed(0)} ms`);
    C.check(report.idleTps.systems.every((s) => !s.disabled && !s.errors), 'aucun système en erreur ni désactivé', report.idleTps.systems.filter((s) => s.disabled || s.errors).map((s) => s.id).join(','));
  }

  if (parts.includes('B')) {
    console.log('[B] traversée à 54 km/h à travers une limite de détail (à-coups de construction)');
    await page.evaluate(() => { const c = window.__CRS; c.teleport(240, -175); c.ctx.player.state.camYaw = Math.PI / 2; c.ctx.player.state.camPitch = 0; c.ctx.player.setCameraMode('tps'); });
    report.traverseSettle = await settle(500);
    console.log('  mise en place : ' + J(report.traverseSettle));
    const m = await measure(360, { dx: 0.5, series: true, warm: 0 });
    report.traverse = m;
    show('traversée 180 m', m);
    const bad = m.series.map((s, i) => [i, ...s]).filter((s) => s[1] > 33.3);
    console.log(`  images de plus de 33 ms : ${bad.length} — ` + bad.slice(0, 20).map((s) => `n°${s[0]} ${s[1]} ms (construction ${s[2]} ms, file ${s[3]})`).join(' ; '));
    console.log(`  construction de tuile par image : max ${m.buildMax.toFixed(1)} ms (budget annoncé en « bas » : 3 ms)`);
    report.traverseStats = await page.evaluate(() => { const st = window.__CRS.ctx.service('world.view').stats(); return { maxStepMs: st.maxStepMs, maxStepLabel: st.maxStepLabel, maxBuildingMs: st.maxBuildingMs, lastDetailMs: st.lastDetailMs, lastFarMs: st.lastFarMs }; });
    console.log('  ' + J(report.traverseStats));
    await snap(page, `${tag}-traversee`);
  }

  if (parts.includes('C')) {
    console.log('[C] tour de dix lieux éloignés, retour, second tour');
    const home = await page.evaluate(() => { const s = window.__CRS.ctx.service('session.setup').summary; return { x: s.x, z: s.z }; });
    // dix repères éloignés les uns des autres (échantillonnage du plus lointain), posés à 40 m du repère
    const places = await page.evaluate(() => {
      const c = window.__CRS.ctx; const L = c.world.landmarks.filter((l) => Number.isFinite(l.x)); const b = c.world.bounds;
      const inB = L.filter((l) => !b || (l.x > b.minX + 150 && l.x < b.maxX - 150 && l.z > b.minZ + 150 && l.z < b.maxZ - 150));
      const pick = [];
      let cur = { x: 0, z: 0 };
      const dmin = (l) => Math.min(Math.hypot(l.x - cur.x, l.z - cur.z), ...pick.map((p) => Math.hypot(l.x - p.x, l.z - p.z)));
      for (let k = 0; k < 10; k++) { let best = null, bd = -1; for (const l of inB) { if (pick.includes(l)) continue; const d = dmin(l); if (d > bd) { bd = d; best = l; } } if (best) pick.push(best); }
      return pick.map((l) => { const f = c.world.randomFreePoint ? null : null; let x = l.x + 45, z = l.z + 45; for (let a = 0; a < 16; a++) { const xx = l.x + Math.sin(a * Math.PI / 8) * 45, zz = l.z + Math.cos(a * Math.PI / 8) * 45; if (c.world.isFree(xx, zz, 0.5)) { x = xx; z = zz; break; } } return { key: l.key, name: l.name, x, z }; });
    });
    report.places = places;
    console.log('  lieux : ' + places.map((p) => `${p.key} (${Math.round(p.x)}, ${Math.round(p.z)})`).join(' ; '));
    const stops = [];
    const visit = async (label, x, z, shotName) => {
      await page.evaluate(([px, pz]) => { const c = window.__CRS; c.teleport(px, pz); c.ctx.player.setCameraMode('tps'); }, [x, z]);
      const s = await settle(600);
      const look = await lookAround();
      const heap = await heapMB();
      const rss = chromeRss();
      const row = { label, x: Math.round(x), z: Math.round(z), sector: look.sector, frames: s.frames, wallS: R(s.wallMs / 1000, 1), jsMs: Math.round(s.jsMs), maxFrameMs: R(s.maxFrameMs, 1), over16: s.over16, over33: s.over33, maxBuildMs: R(s.maxBuildMs, 1), settled: s.settled, worst: s.worst,
        calls: look.maxCalls, triangles: look.maxTriangles, dirs: look.dirs, geometries: look.geometries, textures: look.textures, programs: look.programs, heapMB: heap, rssMB: rss.totalMB, gpuMB: rss.gpuMB, rendererMB: rss.rendererMB, ...s.stats, monuments: look.monuments };
      stops.push(row);
      console.log(`  ${label.padEnd(26)} ${String(row.sector).slice(0, 26).padEnd(26)} construit en ${row.frames} images (${row.wallS} s réels, JS ${row.jsMs} ms, pire image ${row.maxFrameMs} ms, >33 ms : ${row.over33}) ; ${row.calls} appels, ${Math.round(row.triangles / 1000)} k tri ; géom ${row.geometries}, tex ${row.textures}, prog ${row.programs} ; tas ${row.heapMB} Mo ; Chromium ${row.rssMB} Mo (GPU ${row.gpuMB}) ; tuiles ${row.detail} dét. + ${row.far} loin., GPU tuiles ${R(row.tileMB, 1)} Mo${row.settled ? '' : '  [NON STABILISÉ]'}`);
      if (shotName) { await page.evaluate(() => { window.__CRS.game.frame(1 / 30); }); await snap(page, shotName); }
      return row;
    };
    await visit('départ (Concorde)', home.x, home.z, `${tag}-lieu-0-depart`);
    let i = 0;
    for (const p of places) { i++; await visit(`${i}. ${p.key}`, p.x, p.z, i === 3 || i === 7 ? `${tag}-lieu-${i}-${p.key}` : null); }
    const back1 = await visit('retour 1 (Concorde)', home.x, home.z, `${tag}-lieu-retour1`);
    for (const p of places.slice(0, 4)) await visit(`bis ${p.key}`, p.x, p.z, null);
    const back2 = await visit('retour 2 (Concorde)', home.x, home.z, null);
    for (const p of places.slice(4, 8)) await visit(`ter ${p.key}`, p.x, p.z, null);
    const back3 = await visit('retour 3 (Concorde)', home.x, home.z, null);
    report.stops = stops;
    const first = stops[0];
    console.log(`  bilan mémoire au même endroit — départ : géom ${first.geometries}, tex ${first.textures}, tas ${first.heapMB} Mo, Chromium ${first.rssMB} Mo ; retour 1 : ${back1.geometries}/${back1.textures}/${back1.heapMB}/${back1.rssMB} ; retour 2 : ${back2.geometries}/${back2.textures}/${back2.heapMB}/${back2.rssMB} ; retour 3 : ${back3.geometries}/${back3.textures}/${back3.heapMB}/${back3.rssMB}`);
    C.check(back3.geometries <= first.geometries * 1.2 + 20, 'géométries : retour au niveau de départ après les tours', `${first.geometries} → ${back1.geometries} → ${back2.geometries} → ${back3.geometries}`);
    // Les matériaux des monuments sont partagés et gardés pour la partie (une quarantaine de matières, textures de 256
    // ou 512 px) : le compte monte à la première visite de chaque lieu puis plafonne. Une fuite se verrait à ce que
    // revenir aux mêmes lieux le fasse encore monter.
    C.check(back3.textures <= back2.textures + 6 && back3.textures <= first.textures + 140, 'textures : le compte plafonne, revenir aux mêmes lieux ne le fait plus monter', `${first.textures} → ${back1.textures} → ${back2.textures} → ${back3.textures}`);
    C.check(back3.heapMB <= back1.heapMB * 1.15 + 10, 'tas JavaScript : stable entre le premier et le troisième retour', `${first.heapMB} → ${back1.heapMB} → ${back2.heapMB} → ${back3.heapMB} Mo`);
    C.check(back3.rssMB <= back1.rssMB * 1.2 + 100, 'mémoire résidente de Chromium : stable entre le premier et le troisième retour', `${first.rssMB} → ${back1.rssMB} → ${back2.rssMB} → ${back3.rssMB} Mo`);
    const maxStop = stops.reduce((a, b) => (b.triangles > a.triangles ? b : a));
    const maxCalls = stops.reduce((a, b) => (b.calls > a.calls ? b : a));
    console.log(`  maximum de triangles : ${Math.round(maxStop.triangles / 1000)} k (${maxStop.label}) ; maximum d'appels de dessin : ${maxCalls.calls} (${maxCalls.label})`);
    const people = await page.evaluate(() => window.__CRS.ctx.people.list.length);
    report.peopleEnd = people;
  }
  report.sys = await page.evaluate(() => window.__CRS.ctx.service('perf').systems.filter((s) => s.errors || s.disabled).map((s) => ({ id: s.id, errors: s.errors, disabled: s.disabled })));
  C.check(report.sys.length === 0, 'aucun système en erreur ni désactivé en fin de parcours', J(report.sys));
} catch (err) {
  C.check(false, 'exception générale', String(err && err.stack ? err.stack : err).slice(0, 500));
  try { await snap(page, `${tag}-echec`); } catch { /* */ }
}
report.errors = errors.slice();
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 800));
report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
