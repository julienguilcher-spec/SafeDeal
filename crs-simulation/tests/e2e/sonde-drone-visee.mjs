// Sonde : où regarde la nacelle du drone (point visé, inclinaison, toit ou rue au centre de l'image, foule visible ?).
// Usage : node tests/e2e/sonde-drone-visee.mjs
import { startServer, openPage, waitFor, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(
  server.url + 'index.html?autostart=paris&mission=cdt-02-le-precortege&quality=bas&nomenu=1&camera=fps',
  { width: 960, height: 600, deviceScaleFactor: 1, pointerLock: false },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 400000);
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__CRS.step(15)); await sleep(300); }
  await page.evaluate(() => window.__CRS.ctx.service('ui.drone').show());
  for (let k = 0; k < 4; k++) {
    await sleep(2500);
    const r = await page.evaluate(() => {
      const ctx = window.__CRS.ctx;
      const f = ctx.service('ui.drone');
      const v = ctx.vehicles.get(f.droneId);
      const p = f.pose;
      const w = ctx.world;
      const roof = (x, z) => Math.round(w.buildingHeightAt(x, z));
      const near = ctx.people.list.filter((q) => q.faction === 'protest' && !q.dormant && Math.hypot(q.x - p.lookX, q.z - p.lookZ) < 25).length;
      const tgt = { x: Math.round(f.tx), z: Math.round(f.tz) };
      const vis = f.visibleFrom(ctx, p.x, p.y, p.z, f.tx, w.heightAt(f.tx, f.tz) + 1.2, f.tz);
      return {
        drone: { x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z) }, hasTarget: f.hasTarget, tgt,
        horiz: Math.round(Math.hypot(f.tx - v.x, f.tz - v.z)), pitchDeg: Math.round(f.pitch * 180 / Math.PI),
        posePitch: Math.round(p.pitch * 180 / Math.PI), look: { x: Math.round(p.lookX), z: Math.round(p.lookZ) },
        roofAtLook: roof(p.lookX, p.lookZ), roofAtTarget: roof(f.tx, f.tz), roofUnderDrone: roof(v.x, v.z), peopleNearLook: near, targetVisible: vis, inView: f.inView,
      };
    });
    console.log(JSON.stringify(r));
  }
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'sonde-drone' });
