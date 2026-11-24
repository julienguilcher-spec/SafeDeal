// Testeur indépendant — JOUEUR SUR PC : monter dans le fourgon, sirène et gyrophares, rouler 100 m et plus sur la chaussée,
// caméra extérieure / intérieure, descendre. Place de la Concorde, midi.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'veh';
const R = { tag };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent(args.place ?? 'Place de la Concorde')}&time=${args.time ?? 12}&weather=clair&quality=bas&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  await install(page);
  await frames(page, 3);
  await ev(() => { window.__ev = []; const E = window.__CRS.ctx.events; for (const n of ['vehicle:collision', 'vehicle:state', 'vehicle:siren', 'vehicle:entered', 'vehicle:exited', 'person:hurt', 'person:down']) E.on(n, (e) => { if (window.__ev.length < 400) window.__ev.push({ n, t: +window.__CRS.ctx.clock.now.toFixed(1), ...JSON.parse(JSON.stringify(e)) }); }); });
  const veh = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const v = c.vehicles.list.filter((q) => q.faction === 'police').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; const d = c.vehicles.def(v.kind); return { id: v.id, kind: v.kind, x: v.x, z: v.z, heading: v.heading, length: d.length, width: d.width, hasSiren: d.hasSiren, hasBeacons: d.hasBeacons, maxSpeed: d.maxSpeed }; });
  R.vehicle = veh; log('véhicule', J(veh));
  // à la portière du conducteur (côté gauche, à hauteur du siège avant), à pied depuis 3 m
  const door = [veh.x + Math.sin(veh.heading) * 1.4 + Math.cos(veh.heading) * 4.0, veh.z + Math.cos(veh.heading) * 1.4 - Math.sin(veh.heading) * 4.0];
  await ev(([x, z]) => window.__V.tp(x, z), door);
  await key.down('KeyW');
  R.approach = await ev((v) => { const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person(); let prompt = null; for (let i = 0; i < 90; i++) { ctx.player.state.camYaw = Math.atan2(v.x + Math.sin(v.heading) * 1.4 - p.x, v.z + Math.cos(v.heading) * 1.4 - p.z); c.game.step(1 / 30); const pr = ctx.player.state.prompt; if (pr && /conduire/i.test(pr.verb)) { prompt = pr.label; break; } } return { prompt, d: Math.hypot(p.x - v.x, p.z - v.z) }; }, veh);
  await key.up('KeyW');
  log('approche à pied', J(R.approach));
  await frames(page, 3); await snap(page, `verif-${tag}-1-invite`);
  await key.press('KeyE'); await step(page, 2.5); await frames(page, 4);
  R.enter = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const v = c.player.vehicle(); return { vehicleId: p.vehicleId, seat: p.seat, posture: p.posture, camera: c.player.state.cameraMode, engine: v ? v.engineOn : null, camYaw: c.player.state.camYaw, heading: v ? v.heading : null, controlHint: c.player.state.prompt && c.player.state.prompt.label }; });
  log('à bord', J(R.enter));
  await snap(page, `verif-${tag}-2-a-bord-ext`);
  if (R.enter.vehicleId) {
    const id = R.enter.vehicleId;
    // sirène, gyrophares, klaxon
    const lights = async () => ev((id) => { const v = window.__CRS.ctx.vehicles.get(id); return { siren: v.siren, beacons: v.beacons, headlights: v.headlights, horn: v.cmd && v.cmd.horn }; }, id);
    R.lights = { depart: await lights() };
    await key.press('KeyB'); await step(page, 0.2); R.lights.B = await lights();
    await key.press('KeyR'); await step(page, 0.2); R.lights.R1 = await lights();
    await key.press('KeyR'); await step(page, 0.2); R.lights.R2 = await lights();
    await key.down('KeyN'); await step(page, 0.2); R.lights.N = await lights(); await key.up('KeyN');
    await frames(page, 3); await snap(page, `verif-${tag}-3-gyrophares`);
    await key.press('KeyR'); await step(page, 0.2); R.lights.R3 = await lights();
    log('feux', J(R.lights));
    // recentrage de la caméra extérieure : on recule 3 s EN IMAGES RÉELLES (le rig travaille dans frame())
    await key.down('KeyS');
    R.camFollow = await ev(async (id) => { const c = window.__CRS; const ctx = c.ctx; const v = ctx.vehicles.get(id); const out = []; for (let k = 0; k < 60; k++) { c.step(0.05); await new Promise((r) => requestAnimationFrame(r)); if (k % 10 === 9) { const want = v.heading; let d = ctx.player.state.camYaw - want; d = Math.atan2(Math.sin(d), Math.cos(d)); out.push({ t: +ctx.clock.now.toFixed(1), speed: +v.speed.toFixed(1), ecartCapCamera: +d.toFixed(2), mode: ctx.player.state.cameraMode }); } } return out; }, id);
    await key.up('KeyS');
    log('caméra extérieure pendant la marche arrière', J(R.camFollow));
    await snap(page, `verif-${tag}-4-marche-arriere`);
    // itinéraire routier d'au moins 250 m, suivi par un petit pilote qui écrit les axes d'entrée (service input.script)
    R.route = await ev((id) => {
      const c = window.__CRS; const ctx = c.ctx; const w = ctx.world; const v = ctx.vehicles.get(id); const script = ctx.service('input.script');
      // destination : un point de chaussée à ~260 m, derrière le véhicule (on s'éloigne du groupe)
      let dest = null; const out = { x: 0, z: 0 }; const rs = { edgeId: 0, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'primary', oneway: false };
      for (let a = 0; a < 16 && !dest; a++) { const ang = v.heading + Math.PI + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.35; const x = v.x + Math.sin(ang) * 260, z = v.z + Math.cos(ang) * 260; if (w.nearestRoad(x, z, rs, 60) && !ctx.world.edge(rs.edgeId).pedestrianOnly) { const path = []; if (w.findPath(v.x, v.z, rs.x, rs.z, 'vehicle', path) && path.length >= 4) dest = { x: rs.x, z: rs.z, path, name: rs.name }; } }
      if (!dest) return { error: 'aucun itinéraire' };
      const P = dest.path; let k = 1; let dist = 0, px = v.x, pz = v.z, maxSp = 0, inB = 0, offRoad = 0; const tr = []; let stuck = 0; const surf = {};
      for (let i = 0; i < 30 * 150; i++) {
        while (k < P.length / 2 - 1 && Math.hypot(P[2 * k] - v.x, P[2 * k + 1] - v.z) < 9) k++;
        const tx = P[2 * k], tz = P[2 * k + 1];
        let d = Math.atan2(tx - v.x, tz - v.z) - v.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        // d > 0 : la cible est à gauche (cap croissant = vers la gauche) → volant à gauche = moveX négatif
        const steer = Math.max(-1, Math.min(1, -d * 2.2));
        const slow = Math.abs(d) > 0.5 || Math.abs(v.speed) > 9;
        script.setMove(steer, slow ? (Math.abs(v.speed) > 4 ? 0 : 0.5) : 1);
        c.game.step(1 / 30);
        const m = Math.hypot(v.x - px, v.z - pz); dist += m; px = v.x; pz = v.z; maxSp = Math.max(maxSp, Math.abs(v.speed)); stuck = m < 0.003 ? stuck + 1 : 0;
        if (w.buildingHeightAt(v.x, v.z) > 0) inB++;
        const s = w.surfaceAt(v.x, v.z); surf[s] = (surf[s] || 0) + 1;
        if (i % 150 === 0) tr.push({ t: i / 30, x: +v.x.toFixed(0), z: +v.z.toFixed(0), sp: +v.speed.toFixed(1), k, s, state: v.state });
        if (Math.hypot(P[P.length - 2] - v.x, P[P.length - 1] - v.z) < 12 || stuck > 240 || dist > 320) break;
      }
      script.setMove(0, 0);
      return { name: dest.name, pathPoints: P.length / 2, k, dist, maxSpeedKmh: maxSp * 3.6, inBuilding: inB, surfaces: surf, stuck, state: v.state, health: v.health, trace: tr, end: { x: v.x, z: v.z, y: v.y, g: w.heightAt(v.x, v.z) } };
    }, id);
    log('route', J(R.route));
    R.driveEvents = await ev(() => window.__ev.filter((e) => e.n !== 'vehicle:siren').slice(0, 40));
    log('événements', J(R.driveEvents));
    await ev((id) => { const c = window.__CRS.ctx; const v = c.vehicles.get(id); c.player.state.camYaw = v.heading; c.player.state.camPitch = -0.05; }, id);
    await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-5-route-ext`);
    await key.press('KeyV'); await step(page, 0.3); await frames(page, 4);
    R.camInt = await ev(() => window.__CRS.ctx.player.state.cameraMode);
    await ev((id) => { const c = window.__CRS.ctx; const v = c.vehicles.get(id); c.player.state.camYaw = v.heading; c.player.state.camPitch = 0; }, id);
    await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-6-route-int`);
    await key.press('KeyV'); await step(page, 0.3);
    // descendre en roulant : refusé au-delà de 1,5 m/s ?
    await key.down('KeyW'); await step(page, 3);
    const sp0 = await ev((id) => window.__CRS.ctx.vehicles.get(id).speed, id);
    await key.press('KeyE'); await step(page, 0.5);
    R.exitMoving = { speed: sp0, stillAboard: await ev(() => window.__CRS.ctx.player.person().vehicleId !== 0) };
    await key.up('KeyW');
    // s'arrêter (frein puis frein à main) et descendre
    await key.down('KeyS'); await ev((id) => { const c = window.__CRS; const v = c.ctx.vehicles.get(id); for (let i = 0; i < 200 && v.speed > 0.2; i++) c.game.step(1 / 30); }, id); await key.up('KeyS');
    await key.press('Space'); await step(page, 0.6);
    await key.press('KeyE'); await step(page, 2.5); await frames(page, 3);
    R.exit = await ev((id) => { const c = window.__CRS.ctx; const p = c.player.person(); const v = c.vehicles.get(id); return { vehicleId: p.vehicleId, posture: p.posture, camera: c.player.state.cameraMode, free: c.world.isFree(p.x, p.z, 0.2), dVeh: Math.hypot(p.x - v.x, p.z - v.z), vSpeed: v.speed, handbrake: v.handbrake, dy: p.y - c.world.heightAt(p.x, p.z) }; }, id);
    log('descente', J({ exitMoving: R.exitMoving, exit: R.exit }));
    await snap(page, `verif-${tag}-7-descendu`);
    await key.press('KeyV'); await step(page, 0.4); await snap(page, `verif-${tag}-8-descendu-tps`);
  }
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); } catch {}
R.rss = rss();
R.errors = errors.slice(0, 30);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)), 'rss', J(R.rss));
save();
await browser.close();
await server.close();
process.exit(0);
