// Carte de commandement partagée avec le terrain (ordres directs §1.4, §4.3) — scénario navigateur, 1280 × 800,
// commandant à la Concorde, clavier seul :
//   1. U sur le terrain choisit une unité ; Tab ouvre la carte : la fiche d'« Envoyer » (E) la prend pour Qui ;
//   2. U dans la fiche : le même cycle que sur le terrain (automatique → BRAV-M → sections…), et le terrain suit ;
//      la carte refermée (Échap, Tab), l'unité choisie sur la carte est celle de l'ordre prêt du terrain ;
//   3. « Trop loin pour viser » : la carte s'ouvre sur le point avec l'unité et l'intention « Envoyer » ; Entrée
//      (« Donner l'ordre ») envoie l'unité et la carte se referme d'elle-même.
// Usage : node tests/e2e/verif-carte-partagee.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, notices } from './verif-fin-lib.mjs';

const tag = 'verif-carte-partagee';
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 800, pointerLock: false });

async function press(code, { shift = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down(code);
  await frames(page, 2);
  await page.keyboard.up(code);
  if (shift) await page.keyboard.up('Shift');
  await frames(page, 3);
}
const whoKey = () => page.evaluate(() => window.__CRS.ctx.service('command.direct').whoKey());
const nameOf = (key) => page.evaluate((k) => {
  const id = Number(String(k).slice(1));
  const s = window.__CRS.ctx.squads.get(id);
  return s ? s.name : '';
}, key);
/** Nom affiché dans le Qui de la fiche ouverte ('' si aucune). */
const cardWho = () => page.evaluate(() => {
  const e = document.querySelector('[data-id="tactical"] .cc-who-name');
  return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : '';
});
const screen = () => page.evaluate(() => window.__CRS.ctx.ui.current);

try {
  const q = new URLSearchParams({
    autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', rank: 'commandant', variante: 'terrain', place: 'Place de la Concorde',
    crowd: '300', quality: 'bas', seed: '21', time: '12', weather: 'clair',
  });
  await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 4);
  await frames(page, 4);

  // ── 1. U sur le terrain, puis Tab : la carte reprend l'unité ──
  await press('KeyU');
  const k1 = await whoKey();
  const n1 = await nameOf(k1);
  C.check(/^u\d+$/.test(k1) && n1 !== '', 'U sur le terrain choisit une unité', `${k1} ${n1}`);
  await press('Tab');
  await page.waitForTimeout(1500);
  await frames(page, 4);
  C.check((await screen()) === 'carte_tactique', 'Tab ouvre la carte de commandement');
  await press('KeyE');
  await page.waitForTimeout(600);
  await frames(page, 4);
  let w = await cardWho();
  C.check(w.includes(n1), `la fiche « Envoyer » prend ${n1} pour Qui (le choix du terrain)`, `« ${w} »`);
  await snap(page, `${tag}-1-qui-du-terrain`);

  // ── 2. U dans la fiche : le cycle partagé ; le terrain suit ──
  await press('KeyU');
  await page.waitForTimeout(400);
  await frames(page, 4);
  const k2 = await whoKey();
  w = await cardWho();
  const n2 = k2.startsWith('u') ? await nameOf(k2) : '';
  C.check(k2 !== k1, 'U dans la fiche passe à l’unité suivante du même cycle', `${k1} → ${k2}`);
  if (n2 !== '') C.check(w.includes(n2), `la fiche nomme ${n2}`, `« ${w} »`);
  await snap(page, `${tag}-2-u-dans-la-fiche`);
  // Échap referme la fiche, puis la carte (sans fiche ni intention, Échap ferme l'écran)
  for (let i = 0; i < 4 && (await screen()) !== null; i++) await press('Escape');
  await page.waitForTimeout(800);
  await step(page, 0.8);
  C.check((await screen()) === null, 'la carte est refermée');
  const k3 = await whoKey();
  C.check(k3 === k2, 'carte refermée : l’ordre prêt du terrain garde l’unité choisie sur la carte', `${k2} / ${k3}`);
  await page.evaluate(() => window.__CRS.ctx.service('command.direct').setWho('auto'));

  // ── 3. « Trop loin pour viser » : la carte s'ouvre sur le point, Entrée envoie et la referme ──
  const far = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const me = c.player.person();
    const env = c.service('command.direct').env();
    const sec = env.units.find((u) => u.symbol === 'section' && u.valid > 0);
    for (let k = 0; k < 32; k++) {
      const a = (k * Math.PI) / 16;
      const x = me.x + Math.sin(a) * 460, z = me.z + Math.cos(a) * 460;
      if (env.roadAt(x, z, 25)) return { x, z, id: sec ? sec.squadId : 0, name: sec ? sec.name : '' };
    }
    return null;
  });
  C.check(!!far && far.id !== 0, 'un point de rue à 460 m et une section', JSON.stringify(far));
  if (far && far.id !== 0) {
    // ce que fait Tab sur la ligne « Trop loin pour viser » (direct/runtime.ts openFar, tacticalOpen.ts openTacticalAt)
    await page.evaluate((f) => window.__CRS.ctx.ui.open('carte_tactique', { x: f.x, z: f.z, squadIds: [f.id], intent: 'envoyer', fromField: true }), far);
    await page.waitForTimeout(1500);
    await frames(page, 4);
    w = await cardWho();
    C.check(w.includes(far.name), `la fiche du point lointain prend ${far.name} pour Qui`, `« ${w} »`);
    await snap(page, `${tag}-3-trop-loin`);
    const before = await page.evaluate(() => window.__CRS.ctx.clock.now);
    await press('Enter');
    await page.waitForTimeout(800);
    await frames(page, 4);
    const after = await page.evaluate((id) => {
      const c = window.__CRS.ctx;
      const o = c.squads.get(id).order;
      // l'ordre du joueur retenu (une colonne motorisée l'exécute au débarquement : l'ordre en cours est alors « embarquer »)
      const r = c.service('ui.command').playerOrderRecord(id);
      return {
        screen: c.ui.current, type: String(o.type), byPlayer: o.byPlayer === true, simAt: o.issuedAt,
        playerType: r ? String(r.type) : '', issuedAt: r ? r.issuedAt : -1, x: r && r.geom ? r.geom.x : NaN, z: r && r.geom ? r.geom.z : NaN,
      };
    }, far.id);
    C.check(after.issuedAt >= before && after.playerType !== '', '« Donner l’ordre » : la section reçoit l’ordre du joueur', JSON.stringify(after));
    C.check(Math.hypot(after.x - far.x, after.z - far.z) < 60, 'l’ordre va au point lointain', JSON.stringify(after));
    C.check(after.screen === null, 'la carte ouverte depuis le terrain se referme d’elle-même après l’envoi', String(after.screen));
    await snap(page, `${tag}-4-apres-envoi`);
  }
  C.note('notifications : ' + (await notices(page)).slice(-4).join(' | '));
} catch (e) {
  C.check(false, 'scénario', String(e && e.stack ? e.stack : e));
}
await browser.close();
await server.close();
const real = errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e));
C.check(real.length === 0, 'aucune erreur dans la page', real.slice(0, 3).join(' | '));
C.done();
process.exit(C.failures.length === 0 ? 0 : 1);
