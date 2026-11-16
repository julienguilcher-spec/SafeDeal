// Testeur indépendant — PERFORMANCES FACE À LA FOULE : affluence par défaut de la page d'accueil (600 → 300 en « bas »),
// le joueur est placé à 25 m du barycentre des manifestants et les regarde ; temps JS par image et par système, appels, triangles.
// Puis même mesure avec 1 200 manifestants demandés (600 simulés) pour voir la pente.
import { startServer, openPage, waitFor, step, snap, J, makeChecker } from './verif-tpm-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const crowd = Number(args.crowd ?? 600);
const tag = `verif-tpm-perf-foule-${crowd}`;
const C = makeChecker(tag);
const report = { crowd };
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&role=crs&poste=lanceur&camera=tps&crowd=${crowd}`, { width: 960, height: 540 });
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await page.evaluate(() => window.__CRS.game.stop());
  for (let i = 0; i < 15; i++) await step(page, 10);
  const place = await page.evaluate(() => {
    const c = window.__CRS; const ctx = c.ctx; const m = ctx.people.list.filter((p) => p.kind === 'manifestant');
    // zone la plus dense : le manifestant qui a le plus de voisins à 12 m
    let best = null, bn = -1; const out = [];
    for (let i = 0; i < m.length; i += 3) { const n = ctx.people.queryRadius(m[i].x, m[i].z, 12, out); if (n > bn) { bn = n; best = m[i]; } }
    if (!best) return null;
    let px = best.x, pz = best.z + 22;
    for (let a = 0; a < 16; a++) { const x = best.x + Math.sin(a * Math.PI / 8) * 22, z = best.z + Math.cos(a * Math.PI / 8) * 22; if (ctx.world.isFree(x, z, 0.5) && ctx.people.queryRadius(x, z, 3, out) === 0) { px = x; pz = z; break; } }
    c.teleport(px, pz);
    ctx.player.setCameraMode('tps'); ctx.player.state.camYaw = Math.atan2(best.x - px, best.z - pz); ctx.player.state.camPitch = -0.05;
    return { manifestants: m.length, total: ctx.people.list.length, dense: bn, x: Math.round(px), z: Math.round(pz), phase: ctx.director.phase, vehicles: ctx.vehicles.list.length };
  });
  report.place = place; console.log('  ' + J(place));
  const res = await page.evaluate(async () => {
    const c = window.__CRS; const ctx = c.ctx; const perf = ctx.service('perf'); const gl = ctx.view.renderer.getContext(); const wv = ctx.service('world.view');
    for (let k = 0; k < 60; k++) { c.game.frame(1 / 30); gl.finish(); await new Promise((r) => setTimeout(r, 0)); if (k > 20 && wv.pending() === 0) break; }
    const total = [], sim = [], present = []; const per = perf.systems.map(() => []);
    for (let k = 0; k < 60; k++) { const t = performance.now(); c.game.frame(1 / 30); const ms = performance.now() - t; gl.finish(); await new Promise((r) => setTimeout(r, 0)); total.push(ms); sim.push(perf.stats.simMs); present.push(perf.stats.presentMs); perf.systems.forEach((x, i) => per[i].push(x.updateMs + x.frameMs)); }
    const q = (a, f) => { const b = a.slice().sort((p, r) => p - r); return b[Math.min(b.length - 1, Math.floor(b.length * f))]; };
    const info = ctx.view.renderer.info; const ppl = ctx.service('peopleRender')?.stats ?? null;
    return { med: q(total, 0.5), p90: q(total, 0.9), min: Math.min(...total), max: Math.max(...total), simMed: q(sim, 0.5), presentMed: q(present, 0.5), over33: total.filter((v) => v > 33.3).length, over16: total.filter((v) => v > 16.7).length,
      systems: perf.systems.map((x, i) => ({ id: x.id, med: q(per[i], 0.5), p90: q(per[i], 0.9), max: Math.max(...per[i]) })).filter((s) => s.p90 > 0.05).sort((a, b) => b.med - a.med).slice(0, 12),
      calls: info.render.calls, triangles: info.render.triangles, people: ctx.people.list.length, ppl: ppl ? { near: ppl.near, mid: ppl.mid, far: ppl.far, drawCalls: ppl.drawCalls } : null };
  });
  report.res = res;
  console.log(`  face à la foule (${place.manifestants} manifestants, ${res.people} personnes) : JS/image médiane ${res.med.toFixed(1)} ms, min ${res.min.toFixed(1)}, p90 ${res.p90.toFixed(1)}, max ${res.max.toFixed(1)} (simulation ${res.simMed.toFixed(2)}, présentation ${res.presentMed.toFixed(2)}) ; ${res.calls} appels de dessin, ${Math.round(res.triangles / 1000)} k triangles ; >16,7 ms ${res.over16}/60, >33 ms ${res.over33}/60 ; personnages dessinés ${J(res.ppl)}`);
  for (const s of res.systems) console.log(`      ${s.id.padEnd(22)} médiane ${s.med.toFixed(2)}  p90 ${s.p90.toFixed(2)}  max ${s.max.toFixed(1)} ms`);
  report.sim = await page.evaluate(() => { const c = window.__CRS; const a = []; for (let k = 0; k < 150; k++) { const t = performance.now(); c.game.step(1 / 30); a.push(performance.now() - t); } a.sort((p, q) => p - q); return { med: a[75], p90: a[135], max: a[149] }; });
  report.cpuRef = await page.evaluate(() => { const t = performance.now(); let s = 0; for (let i = 0; i < 2e7; i++) s += Math.sqrt(i) * 1.0001; return performance.now() - t; });
  console.log(`  pas de simulation seul : médiane ${report.sim.med.toFixed(2)} ms, p90 ${report.sim.p90.toFixed(2)}, max ${report.sim.max.toFixed(1)} ; étalon processeur ${report.cpuRef.toFixed(0)} ms`);
  await page.evaluate(() => window.__CRS.game.frame(1 / 30));
  await snap(page, tag);
  const sys = await page.evaluate(() => window.__CRS.ctx.service('perf').systems.filter((s) => s.errors || s.disabled).map((s) => `${s.id}:${s.errors}`));
  C.check(sys.length === 0, 'aucun système en erreur', sys.join(', '));
} catch (err) { C.check(false, 'exception', String(err && err.stack ? err.stack : err).slice(0, 400)); }
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 3).join(' | ').slice(0, 600));
report.errors = errors; report.failures = C.failures;
C.done(report);
await browser.close().catch(() => {}); await server.close().catch(() => {}); process.exit(0);
