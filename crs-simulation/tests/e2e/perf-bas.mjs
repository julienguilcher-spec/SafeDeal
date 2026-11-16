// Charge graphique en qualité « bas » (téléphone) : triangles, appels de dessin, mémoire GPU et JS, à trois endroits.
import { startServer, openPage, waitFor, finish } from './lib.mjs';
const server = await startServer();
const spots = [['Concorde', -10, 15]];
const { browser, page, errors } = await openPage(server.url + `index.html?autostart=paris&quality=bas&nomenu=1&role=crs&x=${spots[0][1]}&z=${spots[0][2]}&crowd=150`, { width: 844, height: 390, mobile: true });
let ok = true;
const out = [];
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  for (const [name, x, z] of spots) {
    await page.evaluate(([x, z]) => window.__CRS.teleport(x, z), [x, z]);
    await page.evaluate(() => window.__CRS.step(3));
    await new Promise((r) => setTimeout(r, 15000));
    const m = await page.evaluate(() => {
      const v = window.__CRS.ctx.view;
      v.renderer.info.autoReset = true;
      const i = v.renderer.info;
      const perf = window.__CRS.ctx.service('perf');
      return { triangles: i.render.triangles, appels: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures,
        tasMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
        msJS: perf && perf.stats ? perf.stats.frameMs ?? perf.stats.lastFrameMs ?? null : null };
    });
    const parts = await page.evaluate(() => {
      const v = window.__CRS.ctx.view;
      const res = {};
      const tri = (g) => { if (!g) return 0; const idx = g.index; const n = idx ? idx.count : (g.attributes.position ? g.attributes.position.count : 0); return n / 3; };
      const walk = (o, key) => {
        if (!o.visible) return;
        if (o.isMesh || o.isInstancedMesh) {
          const n = tri(o.geometry) * (o.isInstancedMesh ? o.count : 1);
          const k = key + '/' + (o.name || o.parent?.name || '?') + (o.isInstancedMesh ? ` [inst ${o.count}×${Math.round(tri(o.geometry))}]` : '');
          res[k] = (res[k] || 0) + n;
        }
        for (const c of o.children) walk(c, key);
      };
      for (const c of v.scene.children) {
        if (c === v.world) { for (const w of c.children) walk(w, 'monde/' + (w.name || w.type)); }
        else walk(c, c.name || c.type);
      }
      return Object.fromEntries(Object.entries(res).filter(([, n]) => n > 5000).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, Math.round(n)]));
    });
    out.push({ lieu: name, ...m, parts });
  }
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.error(e); ok = false; }
await finish({ browser, server, errors, ok, label: 'perf-bas' });
