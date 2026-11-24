// Testeur indépendant — la tour Eiffel : visible depuis le Trocadéro ? passe-t-on dessous ? Qualité au choix.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'eiffel';
const quality = args.quality ?? 'bas';
const R = { tag, quality };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&place=${encodeURIComponent('Place du Trocadéro et du 11 Novembre')}&time=12&weather=clair&quality=${quality}&seed=5&crowd=0`;
const { browser, page, errors } = await openPage(url, { width: 1280, height: 720 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const lookAt = async (t, pitch) => { await ev(([t, pitch]) => { const c = window.__CRS.ctx; const p = c.player.person(); c.player.state.camYaw = Math.atan2(t.x - p.x, t.z - p.z); c.player.state.camPitch = pitch; }, [t, pitch]); await step(page, 0.25); await frames(page, 4); };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  await install(page);
  await frames(page, 4);
  R.setup = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const t = c.world.landmarks.find((l) => l.key === 'tour_eiffel'); const mon = c.service('monuments'); return { sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z, y: p.y }, tower: t && { x: t.x, z: t.z, y: t.y, h: t.height, heading: t.heading, d: Math.round(Math.hypot(t.x - p.x, t.z - p.z)) }, draw: Math.round(c.view.drawDistance), far: c.view.camera.far, fog: c.view.scene.fog ? { density: c.view.scene.fog.density, near: c.view.scene.fog.near, far: c.view.scene.fog.far } : null, monuments: mon && mon.stats ? mon.stats() : null }; });
  log('setup', J(R.setup));
  const T = R.setup.tower;
  await lookAt(T, 0.12); await snap(page, `verif-${tag}-1-depuis-depart-${R.setup.tower.d}m`);
  for (const d of [400, 200, 110]) {
    // on s'approche dans l'axe du Trocadéro (direction départ → tour)
    const me = R.setup.me; const L = Math.hypot(me.x - T.x, me.z - T.z); const ux = (me.x - T.x) / L, uz = (me.z - T.z) / L;
    const tp = await ev(([x, z]) => window.__V.tp(x, z), [T.x + ux * d, T.z + uz * d]);
    R['at' + d] = { free: tp.info.free, surf: tp.info.surface, y: tp.info.y, monuments: await ev(() => { const m = window.__CRS.ctx.service('monuments'); const s = m && m.stats ? m.stats() : null; return s && { detailed: s.detailed, distant: s.distant, tris: s.triangles }; }) };
    await lookAt(T, d > 300 ? 0.3 : d > 150 ? 0.55 : 0.8); await snap(page, `verif-${tag}-2-a-${d}m`);
  }
  log('approche', J({ at400: R.at400, at200: R.at200, at110: R.at110 }));
  // passer sous la tour : de 90 m d'un côté à 90 m de l'autre, par le centre
  const me = R.setup.me; const L = Math.hypot(me.x - T.x, me.z - T.z); const ux = (me.x - T.x) / L, uz = (me.z - T.z) / L;
  await ev(([x, z]) => window.__V.tp(x, z), [T.x + ux * 90, T.z + uz * 90]);
  const yaw = Math.atan2(-ux, -uz);
  await key.down('KeyW'); await key.down('ShiftLeft');
  R.under = await ev(([t, yaw]) => { const c = window.__CRS; const p = c.ctx.player.person(); const fx = Math.sin(yaw), fz = Math.cos(yaw); const along = () => (p.x - t.x) * fx + (p.z - t.z) * fz; let stuck = 0, px = p.x, pz = p.z, minC = 1e9; const blocks = []; for (let i = 0; i < 30 * 120; i++) { c.ctx.player.state.camYaw = yaw; c.game.step(1 / 30); const d = Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; stuck = d < 0.005 ? stuck + 1 : 0; minC = Math.min(minC, Math.hypot(p.x - t.x, p.z - t.z)); if (stuck === 45) { const h = window.__V.ray(p.x, p.z, p.x + fx * 1.5, p.z + fz * 1.5); const pr = []; c.ctx.props.queryRadius(p.x + fx * 0.6, p.z + fz * 0.6, 1.3, pr); blocks.push({ along: +along().toFixed(1), monde: h ? `${h.kind}@${h.d.toFixed(2)} h=${h.height}` : null, props: pr.map((q) => q.kind) }); p.x += Math.cos(yaw) * 2.5; p.z -= Math.sin(yaw) * 2.5; c.ctx.people.rebuildIndex(); stuck = 0; if (blocks.length > 8) break; } if (along() > 85) break; } return { along: +along().toFixed(1), crossed: along() > 80, minDistCentre: +minC.toFixed(1), blocks, bhCentre: c.ctx.world.buildingHeightAt(t.x, t.z), surfCentre: c.ctx.world.surfaceAt(t.x, t.z) }; }, [T, yaw]);
  await key.up('KeyW'); await key.up('ShiftLeft');
  log('sous la tour', J(R.under));
  await ev(([t]) => { const c = window.__CRS; const p = c.ctx.player.person(); p.x = t.x + 6; p.z = t.z + 6; c.ctx.people.rebuildIndex(); }, [T]);
  await ev(([yaw]) => { const s = window.__CRS.ctx.player.state; s.camYaw = yaw; s.camPitch = 1.35; }, [yaw]);
  await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-3-sous-la-tour-zenith`);
  await ev(([yaw]) => { const s = window.__CRS.ctx.player.state; s.camYaw = yaw; s.camPitch = 0.25; }, [yaw]);
  await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-4-sous-la-tour-axe`);
  await key.press('KeyV'); await step(page, 0.4); await frames(page, 3); await snap(page, `verif-${tag}-5-sous-la-tour-tps`);
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); } catch {}
R.rss = rss(); R.errors = errors.slice(0, 30);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)), 'rss', J(R.rss));
save();
await browser.close();
await server.close();
process.exit(0);
