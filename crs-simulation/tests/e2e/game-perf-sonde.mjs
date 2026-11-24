// Sonde de performance (mise au point) : coût d'un pas de simulation par système, joueur immobile puis en course.
import { startServer, openPage, waitFor, finish } from './lib.mjs';
const query = process.argv[2] ?? 'autostart=paris&quality=bas&nomenu=1&poste=lanceur';
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?${query}`, { width: 960, height: 540 });
let ok = true;
try {
  await waitFor(page, 'window.__CRS && (window.__CRS.ready === true || window.__CRS.error)', 300000);
  const measure = (label, run) => page.evaluate(([lbl, moving]) => {
    const c = window.__CRS;
    const game = c.game;
    const script = c.ctx.service('input.script');
    if (moving) { script.setMove(0, 1); script.press('sprint'); } else { script.clear(); }
    // temps par système : on enveloppe update() le temps de la mesure
    const acc = new Map();
    const restore = [];
    for (const sys of game.systems) {
      if (typeof sys.update !== 'function') continue;
      const orig = sys.update;
      acc.set(sys.id, 0);
      sys.update = function (dt) { const t = performance.now(); orig.call(this, dt); acc.set(sys.id, acc.get(sys.id) + performance.now() - t); };
      restore.push(() => { sys.update = orig; });
    }
    const t0 = performance.now();
    const steps = c.step(4);
    const total = performance.now() - t0;
    for (const r of restore) r();
    script.clear();
    const p = c.ctx.player.person();
    return {
      label: lbl, steps, totalMs: total, perStepMs: total / steps, x: p.x, z: p.z,
      systems: [...acc.entries()].map(([id, ms]) => ({ id, perStepMs: ms / steps })).filter((s) => s.perStepMs > 0.02).sort((a, b) => b.perStepMs - a.perStepMs),
    };
  }, [label, run]);
  for (const [label, run] of [['immobile', false], ['course', true], ['course 2', true], ['immobile 2', false]]) {
    const m = await measure(label, run);
    console.log(`${m.label} : ${m.steps} pas en ${m.totalMs.toFixed(0)} ms → ${m.perStepMs.toFixed(2)} ms par pas ; joueur en (${m.x.toFixed(0)}, ${m.z.toFixed(0)})`);
    for (const s of m.systems) console.log(`    ${s.id.padEnd(22)} ${s.perStepMs.toFixed(3)} ms`);
  }
  const fr = await page.evaluate(() => new Promise((resolve) => {
    const c = window.__CRS;
    const t0 = performance.now();
    let n = 0;
    const f = () => { if (++n >= 20) { const perf = c.ctx.service('perf'); resolve({ ms: (performance.now() - t0) / n, stats: { ...perf.stats }, systems: perf.systems.map((s) => ({ id: s.id, u: s.avgUpdateMs, f: s.avgFrameMs })).filter((s) => s.u + s.f > 0.05) }); } else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  console.log(`image : ${fr.ms.toFixed(0)} ms réels par image ; JS ${fr.stats.avgFrameMs.toFixed(1)} ms (sim ${fr.stats.simMs.toFixed(1)}, présentation ${fr.stats.presentMs.toFixed(1)})`);
  for (const s of fr.systems) console.log(`    ${s.id.padEnd(22)} update ${s.u.toFixed(2)}  frame ${s.f.toFixed(2)}`);
} catch (err) {
  ok = false;
  console.error(String(err));
}
await finish({ browser, server, errors, ok, label: 'game-perf-sonde' });
