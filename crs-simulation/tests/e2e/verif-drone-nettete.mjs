// Netteté du retour vidéo du drone : captures de la fenêtre (petite, agrandie, plein écran) au-dessus d'une manifestation,
// sur un écran de Mac portable (1440 × 900, Retina ×2), pour juger à l'œil la lisibilité de l'image (foule, cordons, engins).
// Usage : node tests/e2e/verif-drone-nettete.mjs [--tag=apres] [--size=1440x900] [--dpr=2] [--quality=moyen]
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
  const file = path.join(OUT, `drone-nettete-${tag}-${name}.png`);
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
  await page.evaluate(() => window.__CRS.ctx.service('ui.drone').show());
  await sleep(4000);
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
