// Retour vidéo du drone : mission de commandant avec drone, bouton « Vue drone » des actions rapides, fenêtre incrustée
// à gauche (image de la nacelle, habillage, repères de détection), agrandissement, fenêtre par-dessus la carte tactique,
// fermeture. Vue subjective du joueur (camera=fps) : ses bras, dessinés en espace caméra, ne doivent pas apparaître dans
// l'image du drone.
// Usage : node tests/e2e/verif-drone-video.mjs [--size=1280x720]
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const arg = process.argv.find((a) => a.startsWith('--size='));
const [W, H] = (arg ? arg.slice(7) : '1280x720').split('x').map(Number);
const server = await startServer();
const { browser, page, errors } = await openPage(
  server.url + 'index.html?autostart=paris&mission=cdt-02-le-precortege&quality=bas&nomenu=1&camera=fps',
  { width: W, height: H, deviceScaleFactor: 1, pointerLock: false },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (cond, label, detail = '') => {
  console.log(`${cond ? 'OK ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) ok = false;
};
const feedState = () => page.evaluate(() => {
  const ctx = window.__CRS.ctx;
  const feed = ctx.service('ui.drone');
  const aux = ctx.service('render.aux');
  const el = document.querySelector('[data-id="drone-feed"]');
  const r = el ? el.getBoundingClientRect() : null;
  const drones = ctx.vehicles.list.filter((v) => v.kind === 'drone').map((v) => ({ id: v.id, alt: Math.round(v.y - ctx.world.heightAt(v.x, v.z)), x: Math.round(v.x), z: Math.round(v.z) }));
  return {
    open: feed ? feed.open : null, droneId: feed ? feed.droneId : 0, inView: feed ? feed.inView : -1, engaged: feed ? feed.engaged() : false,
    auxFrames: aux ? aux.frames : -1, auxActive: aux ? aux.active : null,
    shown: !!el && !el.classList.contains('is-off'), lost: !!el && el.classList.contains('is-lost'),
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    text: el ? el.innerText.replace(/\s+/g, ' ').trim() : '', drones, ui: ctx.ui.current,
  };
});
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready', 300000);
  // laisser le drone décoller et se placer au-dessus de la foule
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__CRS.step(15));
    await sleep(300);
  }
  // le bandeau d'ouverture de la mission se retire (il recouvrirait la capture)
  await waitFor(page, '!document.querySelector(".ui-banner") || document.querySelector(".ui-banner").hidden', 120000).catch(() => {});
  await sleep(1000);
  let s = await feedState();
  console.log('drones :', JSON.stringify(s.drones));
  check(s.engaged, 'un drone est engagé dans la session');
  const btn = page.locator('[data-id="quick-drone"]');
  check(await btn.isVisible(), 'bouton « Vue drone » des actions rapides visible');
  await shot(page, 'drone-video-0-hud');
  await btn.click();
  await sleep(2500);
  s = await feedState();
  console.log('état :', JSON.stringify(s));
  check(s.open && s.shown, 'la fenêtre vidéo est ouverte');
  check(!s.lost, 'l’image du drone est transmise (pas de « signal perdu »)');
  check(s.auxFrames > 0, 'des images de la nacelle ont été rendues', `images ${s.auxFrames}`);
  check(s.rect && s.rect.x < W / 2, 'fenêtre à gauche de l’écran', JSON.stringify(s.rect));
  check(/REC/.test(s.text) && /ALT \d+ m/.test(s.text) && /CAP \d{3}°/.test(s.text), 'habillage : REC, altitude, cap', s.text);
  await shot(page, 'drone-video-1-fenetre');
  if (s.rect) await page.screenshot({ path: 'tests/e2e/out/drone-video-1-zoom.png', clip: { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h } });
  // agrandir d'un clic sur l'image
  await page.locator('[data-id="drone-feed-video"]').click();
  await sleep(1500);
  const big = await feedState();
  check(big.rect && s.rect && big.rect.w > s.rect.w, 'un clic sur l’image agrandit la fenêtre', `${s.rect?.w} → ${big.rect?.w}`);
  await shot(page, 'drone-video-2-agrandie');
  if (big.rect) await page.screenshot({ path: 'tests/e2e/out/drone-video-2-zoom.png', clip: { x: big.rect.x, y: big.rect.y, width: big.rect.w, height: big.rect.h } });
  // un deuxième clic : plein écran ; un troisième : retour à la petite fenêtre
  await page.locator('[data-id="drone-feed-video"]').click();
  await sleep(1200);
  const full = await feedState();
  check(full.rect && big.rect && full.rect.w > big.rect.w && full.rect.w > W * 0.7, 'un deuxième clic passe en plein écran', `${big.rect?.w} → ${full.rect?.w}`);
  await shot(page, 'drone-video-2b-plein-ecran');
  await page.locator('[data-id="drone-feed-video"]').click();
  await sleep(800);
  const small = await feedState();
  check(small.rect && s.rect && small.rect.w === s.rect.w, 'un troisième clic revient à la petite fenêtre', `${small.rect?.w}`);
  // par-dessus la carte tactique
  await page.locator('[data-id="quick-map"]').click();
  await sleep(2500);
  const tac = await feedState();
  check(tac.ui === 'carte_tactique' && tac.shown, 'la fenêtre reste visible par-dessus la carte de commandement', JSON.stringify(tac.rect));
  check(await page.locator('[data-id="tac-drone"]').isVisible(), 'bouton « Vue drone » dans le bandeau de la carte de commandement');
  // coin haut droit de la carte : « Rechercher un lieu » et les sous-titres radio (en haut à gauche) restent dégagés
  const place = await page.evaluate(() => {
    const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    const feed = [...document.querySelectorAll('[data-id="drone-feed"], .drone-feed, [data-id^="drone-feed"]')].map((e) => e.getBoundingClientRect()).find((b) => b.width > 120);
    return { map: r('[data-id="tac-map"]'), search: r('[data-id="tac-search"]'), feed: feed ? { l: feed.left, t: feed.top, r: feed.right, b: feed.bottom } : null };
  });
  const hit = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const f = tac.rect ? { l: tac.rect.x, t: tac.rect.y, r: tac.rect.x + tac.rect.w, b: tac.rect.y + tac.rect.h } : place.feed;
  check(!!f && !!place.map && Math.abs(f.r - (place.map.r - 10)) <= 12 && Math.abs(f.t - (place.map.t + 10)) <= 12, 'fenêtre du drone au coin haut droit de la carte', JSON.stringify({ feed: f, map: place.map }));
  check(!hit(f, place.search), 'la fenêtre du drone ne couvre pas « Rechercher un lieu »', JSON.stringify({ feed: f, search: place.search }));
  // O, carte ouverte : « Plus… » s'ouvre, le retour vidéo ne bascule pas
  const before = await feedState();
  await page.keyboard.press('KeyO');
  await sleep(800);
  const afterO = await feedState();
  const more = await page.evaluate(() => { const t = window.__CRS.game.systems.find((x) => x.id === 'ui:command').tactical; return t ? t.state.sheet : null; });
  check(afterO.open === before.open && more === 'more', 'O sur la carte : « Plus… » s’ouvre, la fenêtre du drone ne bascule pas', JSON.stringify({ avant: before.open, après: afterO.open, feuille: more }));
  await page.keyboard.press('Escape');
  await sleep(500);
  await shot(page, 'drone-video-3-carte');
  await page.locator('[data-id="tac-close"]').click();
  await sleep(800);
  // fermeture
  await page.locator('[data-id="drone-feed-close"]').click();
  await sleep(800);
  const closed = await feedState();
  check(!closed.open && !closed.shown && closed.auxActive === false, 'fermeture : fenêtre masquée, vue annexe coupée');
} catch (e) {
  console.error(e);
  ok = false;
}
await finish({ browser, server, errors, ok, label: 'drone-video' });
