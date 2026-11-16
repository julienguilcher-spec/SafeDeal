// Testeur indépendant — tour d'horizon d'un lieu de départ : captures dans les quatre directions, vues FPS/TPS,
// monument le plus proche, personnages (pieds / sol), puis la même vue de nuit.
// Usage : node tests/e2e/verif-lieux.mjs --place="Place de la République" --time=12 --quality=moyen --tag=rep
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss, pageMem } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'lieu';
const place = args.place ?? 'Place de la République';
const quality = args.quality ?? 'bas';
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const R = { tag, place, quality, mem: [] };
const server = await startServer();
const where = args.x !== undefined ? `x=${args.x}&z=${args.z}` : `place=${encodeURIComponent(place)}`;
const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&${where}&time=${args.time ?? 12}&weather=${args.weather ?? 'clair'}&quality=${quality}&seed=5&camera=fps`;
const { browser, page, errors } = await openPage(url, { width: W, height: H });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const mem = async (label) => { const m = { label, rss: rss(), page: await pageMem(page).catch(() => null) }; R.mem.push(m); log('  MEM', label, J(m.rss), J(m.page)); };
const look = async (yaw, pitch = 0) => { await ev(([y, p]) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = p; }, [yaw, pitch]); await step(page, 0.25); await frames(page, 3); };
try {
  const t0 = Date.now();
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  R.loadMs = Date.now() - t0;
  await install(page);
  await frames(page, 4);
  R.setup = await ev(() => {
    const c = window.__CRS.ctx; const p = c.player.person(); const b = c.service('render.base'); const i = c.view.renderer.info;
    const view = c.service('world.view');
    const feet = c.people.list.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 40 && q.vehicleId === 0).map((q) => ({ kind: q.kind, dy: +(q.y - c.world.heightAt(q.x, q.z)).toFixed(3), lift: view ? +view.liftAt(q.x, q.z).toFixed(3) : null, surf: c.world.surfaceAt(q.x, q.z), bh: c.world.buildingHeightAt(q.x, q.z) }));
    return {
      sector: c.world.sectorName(p.x, p.z), me: { x: p.x, z: p.z, y: p.y, surf: c.world.surfaceAt(p.x, p.z) }, env: { time: c.env.state.timeOfDay, night: c.env.state.isNight, weather: c.env.state.weather, lights: c.env.state.streetLights },
      quality: c.view.quality, draw: c.view.drawDistance, buf: `${b.stats.width}×${b.stats.height}`, calls: i.render.calls, tris: i.render.triangles,
      kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), vehicles: c.vehicles.list.length,
      feetLifted: feet.filter((f) => f.lift > 0.01).length, feetTotal: feet.length, feetInBuilding: feet.filter((f) => f.bh > 0).length, feetSample: feet.slice(0, 6),
      landmarks: c.world.landmarks.map((l) => ({ key: l.key, x: l.x, z: l.z, heading: l.heading, h: l.height, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) })).sort((a, b) => a.d - b.d).slice(0, 6), heading: c.service('session.setup').summary.heading,
      monuments: c.service('monuments')?.stats?.() ?? null,
    };
  });
  log('setup', J(R.setup), 'chargement', R.loadMs);
  await mem('début');
  const h0 = R.setup.heading;
  await step(page, 0.5);
  await look(h0); await snap(page, `verif-${tag}-face`);
  await look(h0 + Math.PI / 2); await snap(page, `verif-${tag}-gauche`);
  await look(h0 + Math.PI); await snap(page, `verif-${tag}-arriere`);
  await look(h0 - Math.PI / 2); await snap(page, `verif-${tag}-droite`);
  await look(h0, -0.9); await snap(page, `verif-${tag}-sol`);
  await look(h0, 0.7); await snap(page, `verif-${tag}-ciel`);
  await key.press('KeyV'); await look(h0, -0.1); await snap(page, `verif-${tag}-tps`);
  await look(h0 + Math.PI, -0.1); await snap(page, `verif-${tag}-tps-arriere`);
  await key.press('KeyV'); await step(page, 0.3);
  save();
  // monument le plus proche : on s'en approche à 60 m (ou on reste si plus près) et on le regarde
  const lm = args.lm ? (await ev((k) => { const c = window.__CRS.ctx; const p = c.player.person(); const l = c.world.landmarks.find((q) => q.key === k); return l ? { key: l.key, x: l.x, z: l.z, heading: l.heading, h: l.height, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) } : null; }, args.lm)) : R.setup.landmarks[0];
  if (lm) {
    const d = Math.max(30, Math.min(70, lm.h * 1.6));
    // point de vue dans l'axe du joueur vers le monument
    const me = R.setup.me; const ux = (me.x - lm.x) / (Math.hypot(me.x - lm.x, me.z - lm.z) || 1), uz = (me.z - lm.z) / (Math.hypot(me.x - lm.x, me.z - lm.z) || 1);
    const tp = await ev(([x, z]) => window.__V.tp(x, z), [lm.x + ux * d, lm.z + uz * d]);
    R.lmView = { key: lm.key, from: tp.info && { x: tp.info.x, z: tp.info.z, free: tp.info.free, bh: tp.info.bh } };
    const yaw = await ev((l) => { const p = window.__CRS.ctx.player.person(); return Math.atan2(l.x - p.x, l.z - p.z); }, lm);
    await look(yaw, 0.25); await snap(page, `verif-${tag}-monument`);
    await key.press('KeyV'); await look(yaw, 0.15); await snap(page, `verif-${tag}-monument-tps`); await key.press('KeyV'); await step(page, 0.3);
  }
  await mem('jour');
  // nuit (ou jour si la session est de nuit)
  const toNight = !R.setup.env.night;
  await ev((n) => { const c = window.__CRS.ctx; c.env.setTime(n ? 23.5 : 12); c.service('render.base')?.snap?.(); }, toNight);
  await step(page, 1.0); await frames(page, 5);
  R.env2 = await ev(() => { const c = window.__CRS.ctx; return { time: c.env.state.timeOfDay, night: c.env.state.isNight, lights: c.env.state.streetLights, daylight: c.env.state.daylight, lightsStats: { wanted: c.service('render.base').stats.lightsWanted, lit: c.service('render.base').stats.lightsLit } }; });
  log('autre heure', J(R.env2));
  if (lm) { const yaw = await ev((l) => { const p = window.__CRS.ctx.player.person(); return Math.atan2(l.x - p.x, l.z - p.z); }, lm); await look(yaw, 0.25); await snap(page, `verif-${tag}-monument-${toNight ? 'nuit' : 'jour'}`); }
  const home = [R.setup.me.x, R.setup.me.z];
  await ev(([x, z]) => window.__V.tp(x, z), home);
  await look(h0); await snap(page, `verif-${tag}-face-${toNight ? 'nuit' : 'jour'}`);
  await look(h0 + Math.PI); await snap(page, `verif-${tag}-arriere-${toNight ? 'nuit' : 'jour'}`);
  await key.press('KeyV'); await look(h0, -0.1); await snap(page, `verif-${tag}-tps-${toNight ? 'nuit' : 'jour'}`); await key.press('KeyV');
  await mem('fin');
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); } catch {}
R.errors = errors.slice(0, 30);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)));
save();
await browser.close();
await server.close();
process.exit(0);
