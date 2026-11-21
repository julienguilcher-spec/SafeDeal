// Netteté du retour vidéo du drone : captures de la fenêtre (petite, agrandie, plein écran) au-dessus d'une manifestation,
// sur un écran de Mac portable (1440 × 900, Retina ×2), pour juger à l'œil la lisibilité de l'image (foule, cordons, engins).
// Placement : l'appareil de l'IA doit montrer des GENS au centre de l'image (pas des toits), à ×1 comme à ×4 (Alt+O deux fois).
//   --lieu=republique (défaut) : la manifestation sur la place de la République, drone en placement libre ;
//   --lieu=rue : une soixantaine de manifestants arrêtés dans une rue étroite bordée d'immeubles près du drone, le point
//                chaud connu ramené sur eux (placement libre) — l'appareil doit venir dans l'axe de la rue.
// Usage : node tests/e2e/verif-drone-nettete.mjs [--tag=apres] [--lieu=republique|rue] [--size=1440x900] [--dpr=2] [--quality=moyen]
import { startServer, openPage, waitFor, finish, OUT } from './lib.mjs';
import path from 'node:path';

const opt = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const tag = opt('tag', 'apres');
const [W, H] = opt('size', '1440x900').split('x').map(Number);
const dpr = Number(opt('dpr', '2'));
const quality = opt('quality', 'moyen');
const lieu = opt('lieu', 'republique');
const server = await startServer();
const { browser, page, errors } = await openPage(
  server.url + `index.html?autostart=paris&mission=cdt-02-le-precortege&quality=${quality}&nomenu=1&camera=fps`,
  { width: W, height: H, deviceScaleFactor: dpr, pointerLock: false },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (cond, label, detail = '') => {
  console.log(`${cond ? 'OK ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) ok = false;
};
const state = () => page.evaluate(() => {
  const ctx = window.__CRS.ctx;
  const feed = ctx.service('ui.drone');
  const aux = ctx.service('render.aux');
  const el = document.querySelector('[data-id="drone-feed"]');
  const cv = document.querySelector('[data-id="drone-feed-video"]');
  const r = el ? el.getBoundingClientRect() : null;
  const cr = cv ? cv.getBoundingClientRect() : null;
  return {
    open: feed.open, mode: feed.mode ?? (feed.large ? 'large' : 'small'), zoom: feed.zoom, inView: feed.inView,
    frames: aux.frames, ms: aux.ms, lost: !!el && el.classList.contains('is-lost'),
    rect: r ? { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.width), h: Math.ceil(r.height) } : null,
    css: cr ? { w: cr.width, h: cr.height } : null, buf: cv ? { w: cv.width, h: cv.height } : null,
    dpr: window.devicePixelRatio, text: el ? el.innerText.replace(/\s+/g, ' ').trim() : '',
  };
});
const clip = async (name, s) => {
  const file = path.join(OUT, `drone-nettete-${tag}-${lieu}-${name}.png`);
  await page.screenshot({ path: file, clip: { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h }, timeout: 240000 });
  console.log('capture :', file);
};
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 400000);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__CRS.step(15));
    await sleep(300);
  }
  // le bandeau d'ouverture de la mission (calque des notifications) passerait devant la fenêtre : masqué pour les captures
  await page.addStyleTag({ content: '.ui-banner{display:none!important}' });
  if (lieu === 'republique') {
    // le point chaud connu est ramené sur la place (placement libre : l'appareil cherche la foule la plus dense autour)
    const r = await page.evaluate(() => {
      const ctx = window.__CRS.ctx;
      const pl = ctx.world.placeByName('Place de la République');
      const spots = ctx.service('police.command').hotspots;
      if (!pl || spots.length === 0) return { place: !!pl, spots: spots.length };
      for (const h of spots) h.heat = 0;
      Object.assign(spots[0], { x: pl.x, z: pl.z, heat: 3, seen: true, knownAt: 0, lastAt: ctx.clock.now });
      const n = ctx.people.list.filter((p) => p.faction === 'protest' && !p.dormant && Math.hypot(p.x - pl.x, p.z - pl.z) < 120).length;
      return { place: true, x: Math.round(pl.x), z: Math.round(pl.z), spots: spots.length, foule: n };
    });
    console.log('place de la République :', JSON.stringify(r));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__CRS.step(10));
      await sleep(300);
    }
  }
  if (lieu === 'rue') {
    const r = await page.evaluate(() => {
      const ctx = window.__CRS.ctx;
      const cmd = ctx.service('police.command');
      const sp = cmd.specials.find((q) => q.kind === 'drone');
      const v = sp ? ctx.vehicles.get(sp.vehicleId) : null;
      const ox = v ? v.x : ctx.player.person().x;
      const oz = v ? v.z : ctx.player.person().z;
      const w = ctx.world;
      // rue étroite (chaussée de 9 m au plus) bordée d'immeubles de plus de 12 m des deux côtés, la plus proche
      let best = null;
      for (let i = 0; i < w.edgeCount; i++) {
        const e = w.edge(i);
        if (e.width > 9 || e.length < 50 || e.bridge) continue;
        const pts = e.points;
        const n = pts.length >> 1;
        const k = Math.floor(n / 2);
        const ax = pts[Math.max(0, k - 1) * 2], az = pts[Math.max(0, k - 1) * 2 + 1];
        const bx = pts[Math.min(n - 1, k) * 2], bz = pts[Math.min(n - 1, k) * 2 + 1];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        const off = e.width / 2 + 6;
        const h1 = w.buildingHeightAt(mx - uz * off, mz + ux * off);
        const h2 = w.buildingHeightAt(mx + uz * off, mz - ux * off);
        if (h1 < 12 || h2 < 12 || w.buildingHeightAt(mx, mz) > 0) continue;
        const d = Math.hypot(mx - ox, mz - oz);
        if (d < 120 || d > 500) continue;
        if (!best || d < best.d) best = { d, x: mx, z: mz, ux, uz, name: e.name, width: e.width, h1, h2 };
      }
      if (!best) return null;
      // une soixantaine de manifestants arrêtés dans la rue, le long de l'axe
      const list = ctx.people.list.filter((p) => p.faction === 'protest' && !p.dormant && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down')
        .sort((a, b) => Math.hypot(a.x - best.x, a.z - best.z) - Math.hypot(b.x - best.x, b.z - best.z)).slice(0, 60);
      list.forEach((p, i) => {
        const along = (Math.floor(i / 4) - 7) * 1.6;
        const across = ((i % 4) - 1.5) * 1.5;
        p.x = best.x + best.ux * along - best.uz * across;
        p.z = best.z + best.uz * along + best.ux * across;
        p.brain = { tag: 'e2e.foule' };
        p.cmd.moveX = 0; p.cmd.moveZ = 0;
      });
      // le point chaud connu est sur eux (placement libre du drone)
      const spots = cmd.hotspots;
      for (const h of spots) h.heat = 0;
      if (spots.length > 0) {
        Object.assign(spots[0], { x: best.x, z: best.z, heat: 3, seen: true, knownAt: 0, lastAt: ctx.clock.now });
      }
      return { ...best, moved: list.length, spots: spots.length };
    });
    console.log('rue étroite :', JSON.stringify(r));
    check(!!r && r.spots > 0, 'rue étroite trouvée et point chaud déplacé');
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__CRS.step(10));
      await sleep(300);
    }
  }
  await page.evaluate(() => window.__CRS.ctx.service('ui.drone').show());
  await sleep(4000);
  const probe = () => page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const f = ctx.service('ui.drone');
    const v = ctx.vehicles.get(f.droneId);
    const sp = ctx.service('police.command').specials.find((q) => q.kind === 'drone');
    const p = f.pose;
    const w = ctx.world;
    const near = ctx.people.list.filter((q) => q.faction === 'protest' && !q.dormant && Math.hypot(q.x - p.lookX, q.z - p.lookZ) < 15
      && f.visibleFrom(ctx, p.x, p.y, p.z, q.x, q.y + 1.2, q.z)).length;
    return {
      drone: v ? { x: Math.round(v.x), z: Math.round(v.z), alt: Math.round(v.y - w.heightAt(v.x, v.z)) } : null,
      ordre: sp ? sp.order : '', etape: sp ? sp.stage : '', secteur: v ? w.sectorName(v.x, v.z) : '',
      horiz: Math.round(Math.hypot(p.lookX - p.x, p.lookZ - p.z)), pitch: Math.round(p.pitch * 180 / Math.PI),
      toitAuCentre: Math.round(w.buildingHeightAt(p.lookX, p.lookZ)), visiblesAuCentre15m: near, inView: f.inView,
    };
  });
  const pr = await probe();
  console.log('sonde :', JSON.stringify(pr));
  check(pr.toitAuCentre === 0 && pr.visiblesAuCentre15m >= 5, 'des manifestants visibles au centre de l\'image', JSON.stringify(pr));
  let s = await state();
  console.log('petite :', JSON.stringify(s));
  check(s.open && !s.lost && s.frames > 0, 'image transmise');
  await clip('1-petite', s);
  // agrandie : Maj+O (nouvelle commande) sinon l'ancienne bascule
  await page.keyboard.press('Shift+O');
  await sleep(3000);
  s = await state();
  if (s.mode === 'small' || !s.open) {
    // ancienne version : Maj + O fermait la fenêtre ; agrandie par le service
    await page.evaluate(() => { const f = window.__CRS.ctx.service('ui.drone'); f.show(); f.setLarge(true); });
    await sleep(3000);
    s = await state();
  }
  console.log('agrandie :', JSON.stringify(s));
  await clip('2-agrandie', s);
  // zoom optique ×2 (Alt+O) au format agrandi
  await page.keyboard.press('Alt+O');
  await sleep(3000);
  if ((await state()).zoom === 1) {
    // ancienne version : pas de touche, zoom par le bouton
    await page.evaluate(() => { const f = window.__CRS.ctx.service('ui.drone'); f.show(); f.cycleZoom(); });
    await sleep(3000);
  }
  s = await state();
  console.log('zoom :', JSON.stringify(s));
  await clip('3-agrandie-zoom', s);
  // ×4 : la foule doit toujours être au centre
  await page.keyboard.press('Alt+O');
  await sleep(3000);
  s = await state();
  console.log('zoom ×4 :', JSON.stringify(s), JSON.stringify(await probe()));
  check(s.zoom === 4 && s.inView >= 5, 'des manifestants dans le champ à ×4', 'inView ' + s.inView);
  await clip('3b-agrandie-zoom4', s);
  for (let k = 0; k < 3; k++) {
    await sleep(2500);
    const q = await probe();
    console.log('×4, +' + (k + 1) * 2.5 + ' s :', JSON.stringify(q), 'inView', (await state()).inView);
  }
  await page.keyboard.press('Alt+O');
  await page.keyboard.press('Alt+O');
  await sleep(500);
  // plein écran (nouvelle commande seulement)
  await page.keyboard.press('Shift+O');
  await sleep(3000);
  s = await state();
  console.log('plein écran :', JSON.stringify(s));
  if (s.mode === 'full') await clip('4-plein-ecran', s);
  await page.keyboard.press('Shift+O');
  await sleep(800);
  s = await state();
  console.log('retour :', JSON.stringify(s));
} catch (e) {
  console.error(e);
  ok = false;
}
await finish({ browser, server, errors, ok, label: 'drone-nettete' });
