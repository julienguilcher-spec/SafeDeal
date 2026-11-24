// Ordres directs AU CLAVIER SEUL (Mac sans souris) — scénario navigateur, 1280 × 800, commandant à la Concorde.
// Rien que des touches, comme le joueur : ← / → pour tourner la vue, Entrée, Maj+Entrée, A, U, Maj+U, ⌫, F puis un
// chiffre, Tab, Échap.
//   1. ← / → jusqu'à ce que l'ordre prêt soit « Bloquer la rue … » ; Entrée : l'ordre part (ticket « reçu » à l'instant,
//      ordre du joueur) ; une seconde Entrée dans les 0,6 s et une Entrée tenue (répétition) ne donnent rien de plus ;
//   2. A : tout le monde revient avec le commandant ; ⌫ dans les 5 s : la section reprend sa rue (rien n'est perdu) ;
//   3. U : l'unité change (la ligne la nomme), Maj+U revient ; le choix ne vaut que pour un ordre ;
//   4. la carte (Tab) refermée, une Entrée tout de suite ne donne aucun ordre sur le terrain ; la roue (F) refermée par ⌫
//      n'annule rien ;
//   5. la roue : 1 3 4 5 6 7 8 imprimés ; F 3 (Envoyer), F 4 (Bloquer) donnent un ordre à une unité — jamais à la racine
//      de la compagnie ; F 5 sans personne visée et F 6 avant les sommations restent ouverts avec leur raison ; F 7 1
//      appelle les pompiers ; F 1 et F 2 : « Avec moi » ; F 8 9 : « Pousser un véhicule » (le Centaure).
// Captures ordre-direct-clavier-*.png dans le dossier donné par --out= (défaut tests/e2e/out).
// Usage : node tests/e2e/ordre-direct-clavier.mjs [--out=/chemin/vers/le/dossier]
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer, openPage, waitFor, frames, step, makeChecker, notices, args, OUT } from './verif-fin-lib.mjs';

const tag = 'ordre-direct-clavier';
const C = makeChecker(tag);
const outDir = args.out && args.out !== '1' ? args.out : OUT;
mkdirSync(outDir, { recursive: true });
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 800, pointerLock: false });

async function snap(name) {
  const file = path.join(outDir, `${tag}-${name}.png`);
  try { await frames(page, 2); } catch { /* page occupée */ }
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('  capture : ' + file);
}

/** Appui bref (deux images tenues : le jeu lit le clavier une fois par image). */
async function press(code, { shift = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down(code);
  await frames(page, 2);
  await page.keyboard.up(code);
  if (shift) await page.keyboard.up('Shift');
  await frames(page, 2);
}

/** État des ordres directs (service 'command.direct') et de l'écran. */
const direct = () => page.evaluate(() => {
  const c = window.__CRS.ctx;
  const d = c.service('command.direct');
  const n = d.ready();
  const u = d.undoable();
  return {
    screen: c.ui.current, who: d.whoKey(), rule: n ? n.rule : '', text: n ? n.text : '', enabled: n ? n.enabled : false,
    addressee: n && n.who ? n.who.label : '', ids: n && n.who ? n.who.squadIds.slice() : [], undo: u ? `${u.who} · ${u.verb}` : '',
    autre: n && n.autre ? n.autre.text : '', now: c.clock.now,
  };
});
/** Ordres donnés depuis le début (chaque passage par core.issue). */
const sends = () => page.evaluate(() => window.__od.slice());
const orderOf = (id) => page.evaluate((sid) => {
  const s = window.__CRS.ctx.squads.get(sid);
  return s ? { type: String(s.order.type), byPlayer: s.order.byPlayer === true, targetId: s.order.targetId } : null;
}, id);
const ticketOf = (id) => page.evaluate((sid) => {
  const t = window.__CRS.ctx.service('command.direct').ticketOf(sid);
  return t ? { state: t.state, verb: t.verb } : null;
}, id);
/** Laisse passer la garde de 0,6 s (temps de la simulation). */
const guard = () => step(page, 0.7);

try {
  const q = new URLSearchParams({
    autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', rank: 'commandant', variante: 'terrain', place: 'Place de la Concorde',
    crowd: '300', quality: 'bas', seed: '21', time: '12', weather: 'clair',
  });
  await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 4);
  await frames(page, 4);
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__od = [];
    core.issue = (type, squads, geoms, targetId = 0, ...rest) => {
      const r = orig(type, squads, geoms, targetId, ...rest);
      window.__od.push({ type: String(type), ids: squads.map((s) => s.id), ok: r.ok, t: window.__CRS.ctx.clock.now });
      return r;
    };
  });
  const root = await page.evaluate(() => window.__CRS.ctx.service('ui.command').scope().ownSquadId);

  // ── 1. ← / → jusqu'à une rue ; Entrée ──
  let d = await direct();
  for (let i = 0; i < 48 && !(d.rule === 'g' && d.enabled); i++) {
    await page.keyboard.down('ArrowRight');
    await frames(page, 2);
    await page.keyboard.up('ArrowRight');
    await frames(page, 2);
    await step(page, 0.3);
    d = await direct();
  }
  C.check(d.rule === 'g' && d.enabled, 'la vue tournée aux flèches : ordre prêt « Bloquer la rue … »', d.text);
  C.check(!d.ids.includes(root), 'l’ordre prêt ne va jamais à la racine de la compagnie', `${d.addressee} ${JSON.stringify(d.ids)}`);
  await snap('1-ordre-pret');
  const n0 = (await sends()).length;
  const unit = d.ids[0];
  await press('Enter');
  let s = await sends();
  C.check(s.length === n0 + 1 && s[s.length - 1].type === 'couper_circulation' && s[s.length - 1].ok, 'Entrée : « Bloquer la rue » part à l’unité affichée', JSON.stringify(s.slice(n0)));
  const o1 = await orderOf(unit);
  C.check(!!o1 && o1.type === 'couper_circulation' && o1.byPlayer, 'l’unité a l’ordre du joueur', JSON.stringify(o1));
  const t1 = await ticketOf(unit);
  C.check(!!t1 && t1.verb === 'bloquer', 'ticket de l’ordre créé à l’appui même', JSON.stringify(t1));
  // une seconde Entrée tout de suite : rien dans les 0,6 s (temps de la simulation : le WebGL logiciel est lent, une
  // image peut durer plus que la garde — seul compte l'écart entre les ordres)
  await press('Enter');
  s = await sends();
  const t0 = s[n0].t;
  C.check(s.slice(n0 + 1).every((o) => o.t - t0 >= 0.6 - 1e-6), 'deuxième Entrée dans les 0,6 s : aucun second ordre', JSON.stringify(s.slice(n0).map((o) => o.t)));
  // une Entrée tenue (répétition du clavier) : un seul ordre, même longtemps après la garde
  await guard();
  const n1 = (await sends()).length;
  await page.keyboard.down('Enter');
  await frames(page, 2);
  await step(page, 1);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await frames(page, 2);
  await page.keyboard.up('Enter');
  await frames(page, 2);
  s = await sends();
  C.check(s.length - n1 <= 1, 'Entrée tenue (répétition du clavier) : jamais un second ordre', `${s.length - n1} ordre(s)`);
  await step(page, 1);
  await snap('2-apres-entree');

  // ── 2. A puis ⌫ ──
  await guard();
  await press('KeyQ');
  await step(page, 1);
  const o2 = await orderOf(unit);
  const me = await page.evaluate(() => window.__CRS.ctx.player.state.personId);
  C.check(!!o2 && ((o2.type === 'suivre' && o2.targetId === me) || o2.type === 'suivre_pied' || o2.type === 'debarquer'), 'A (touche A en AZERTY) : la section revient avec le commandant', JSON.stringify(o2));
  d = await direct();
  C.check(d.undo !== '', '« ⌫ annuler » possible juste après A', d.undo);
  await press('Backspace');
  await step(page, 1);
  const o3 = await orderOf(unit);
  C.check(!!o3 && o3.type === 'couper_circulation', '⌫ dans les 5 s : la section reprend sa rue', JSON.stringify(o3));
  await snap('3-annule');

  // ── 3. U, Maj+U ──
  await guard();
  const w0 = (await direct()).who;
  await press('KeyU');
  const u1 = await direct();
  C.check(u1.who !== w0 && u1.who !== 'auto', 'U : une autre unité choisie', `${w0} → ${u1.who} (${u1.addressee})`);
  C.check(u1.text.includes(u1.addressee), 'la ligne nomme l’unité choisie', u1.text);
  await press('KeyU', { shift: true });
  const u2 = await direct();
  C.check(u2.who === w0, 'Maj+U : retour au choix d’avant', `${u1.who} → ${u2.who}`);
  await snap('4-a-qui');

  // ── 4. gardes : la carte refermée, la roue refermée par ⌫ ──
  await guard();
  const n4 = (await sends()).length;
  await press('Tab');
  await frames(page, 4);
  C.check((await direct()).screen === 'carte_tactique', 'Tab ouvre la carte');
  // Tab qui referme la carte et Entrée dans la même image (le même geste), puis une Entrée juste après : la garde de
  // 0,6 s (temps de la simulation) court depuis la fermeture
  await page.keyboard.down('Tab');
  await page.keyboard.down('Enter');
  await frames(page, 2);
  await page.keyboard.up('Tab');
  await page.keyboard.up('Enter');
  await frames(page, 2);
  const closedAt = await page.evaluate(() => window.__CRS.ctx.service('command.direct').closedAt);
  await page.keyboard.press('Enter');
  await frames(page, 3);
  const after = (await sends()).slice(n4);
  C.check((await direct()).screen === null, 'Tab referme la carte');
  C.check(after.every((o) => o.t - closedAt >= 0.6 - 1e-6), 'carte refermée : aucune Entrée dans les 0,6 s ne donne un ordre de terrain', JSON.stringify(after.map((o) => [o.type, o.t, closedAt])));
  await guard();
  await press('KeyF');
  await page.waitForTimeout(300);
  C.check((await direct()).screen === 'roue_ordres', 'F ouvre la roue');
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-id="order-wheel"] .cw-key')].map((k) => k.textContent).join(' '));
  C.check(keys === '1 3 4 5 6 7 8', 'roue : 1 3 4 5 6 7 8 (le 2 est l’alias du 1, non dessiné)', keys);
  await snap('5-roue');
  const before4 = await orderOf(unit);
  await press('Backspace');
  await frames(page, 3);
  C.check((await direct()).screen === null, '⌫ referme la roue');
  const after4 = await orderOf(unit);
  C.check(JSON.stringify(after4) === JSON.stringify(before4), 'le ⌫ qui referme la roue n’annule aucun ordre', `${JSON.stringify(before4)} → ${JSON.stringify(after4)}`);

  // ── 5. la roue, secteur par secteur ──
  /** F puis les chiffres ; rend les ordres donnés pendant ce temps et l'écran à la fin. */
  async function wheel(digits) {
    await guard();
    const k0 = (await sends()).length;
    await press('KeyF');
    await page.waitForTimeout(250);
    for (const dg of digits) {
      await press(dg);
      await page.waitForTimeout(120);
    }
    await frames(page, 3);
    const all = await sends();
    return { orders: all.slice(k0), screen: (await direct()).screen, notes: (await notices(page)).slice(-2) };
  }
  let w = await wheel(['Digit3']);
  C.check(w.orders.length >= 1 && w.orders.every((o) => o.ok && ['colonne', 'avancer', 'faire_mouvement'].includes(o.type) && !o.ids.includes(root)) && w.screen === null,
    'F 3 : Envoyer, à une unité (jamais la racine)', JSON.stringify(w.orders));
  w = await wheel(['Digit4']);
  C.check(w.orders.length >= 1 && w.orders.every((o) => o.ok && ['couper_circulation', 'ligne'].includes(o.type) && !o.ids.includes(root)) && w.screen === null,
    'F 4 : Bloquer une rue', JSON.stringify(w.orders));
  w = await wheel(['Digit5']);
  C.check(w.orders.length === 0 && w.screen === 'roue_ordres', 'F 5 sans personne visée : aucun ordre, la roue reste ouverte', w.notes.join(' | '));
  await snap('6-roue-interpeller');
  await press('Escape');
  await frames(page, 3);
  const calls0 = await page.evaluate(() => (window.__CRS.ctx.service('rescue.dispatch')?.calls ?? []).length);
  w = await wheel(['Digit7', 'Digit1']);
  const calls1 = await page.evaluate(() => (window.__CRS.ctx.service('rescue.dispatch')?.calls ?? []).length);
  C.check(w.screen === null && (calls1 === calls0 + 1 || w.notes.some((t) => /Pompiers/.test(t))), 'F 7 puis 1 : les pompiers sont demandés', `${calls0} → ${calls1} ; ${w.notes.join(' | ')}`);
  for (const dg of ['Digit1', 'Digit2']) {
    w = await wheel([dg]);
    await step(page, 1);
    const o = await orderOf(unit);
    C.check(w.screen === null && !!o && ((o.type === 'suivre' && o.targetId === me) || o.type === 'suivre_pied' || o.type === 'debarquer'), `F ${dg.slice(5)} : « Avec moi »`, JSON.stringify(o));
  }
  w = await wheel(['Digit8', 'Digit9']);
  C.check(w.orders.some((o) => o.type === 'degager_obstacle') || w.notes.length > 0, 'F 8 puis 9 : « Pousser un véhicule » (le Centaure)', `${JSON.stringify(w.orders)} ; ${w.notes.join(' | ')}`);
  // refusé (pas de Centaure) : la roue reste ouverte sur « Plus… » ; Échap revient à la roue, Échap la referme
  for (let i = 0; i < 3 && (await direct()).screen !== null; i++) await press('Escape');
  C.check((await direct()).screen === null, 'Échap, Échap : la roue est refermée');
  // la foule : le commandant est amené à 50 m d'elle (mise en place de l'essai), puis ← jusqu'à « Bloquer ici, face à la
  // foule » (Maj+Entrée : Disperser) ; F 6 avant les sommations
  const moved = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    // le cœur de la foule : le manifestant qui a le plus de voisins à 15 m
    const me = c.player.person();
    const demos = c.people.list.filter((p) => p.faction === 'protest' && p.vehicleId === 0);
    if (!demos.length || !me) return null;
    let k = demos[0], best = -1;
    const tmp = [];
    for (const p of demos) {
      const n = c.people.queryRadius(p.x, p.z, 15, tmp, (q) => q.faction === 'protest');
      if (n > best) { best = n; k = p; }
    }
    // un point dégagé à 40–60 m d'elle, d'où on la voit (ni fontaine ni obélisque entre les deux)
    const hit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, id: 0 };
    for (const r of [45, 55, 40, 60]) {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        const x = k.x + Math.sin(a) * r, z = k.z + Math.cos(a) * r;
        if (!c.world.isFree(x, z, 0.6)) continue;
        hit.hit = false;
        if (c.world.raycast(x, z, k.x, k.z, hit) && hit.hit) continue;
        const at = window.__CRS.teleport(x, z);
        return { ...at, yaw: Math.atan2(k.x - x, k.z - z), crowd: best };
      }
    }
    return null;
  });
  C.check(!!moved, 'mise en place : le commandant à 50 m de la foule, en vue directe', JSON.stringify(moved));
  await step(page, 1);
  // le regard tourné vers elle (mise en place, comme le déplacement)
  const yawErr = () => page.evaluate((target) => {
    let e = (target - window.__CRS.ctx.player.state.camYaw) % (Math.PI * 2);
    if (e > Math.PI) e -= Math.PI * 2;
    if (e < -Math.PI) e += Math.PI * 2;
    return e;
  }, moved ? moved.yaw : 0);
  await page.evaluate((yaw) => {
    const c = window.__CRS.ctx;
    c.player.state.camYaw = yaw;
    c.player.state.camPitch = 0;
    const me = c.player.person();
    if (me) me.aimYaw = yaw;
  }, moved ? moved.yaw : 0);
  await step(page, 0.6);
  await frames(page, 3);
  d = await direct();
  const cands = await page.evaluate(() => window.__CRS.game.systems.find((s) => s.id === 'ui:command').keys.designator.candidates().map((c) => `${c.kind} ${c.place} ${Math.round(c.distance)}`));
  C.note(`écart de cap ${(await yawErr()).toFixed(3)} rad ; candidats : ${cands.join(' | ')}`);
  C.check(d.rule === 'f', 'la vue sur la foule : « Bloquer ici, face à la foule »', `${d.text} / autre : ${d.autre}`);
  C.check(/^Disperser/.test(d.autre), 'Maj+Entrée proposé : Disperser', d.autre);
  w = await wheel(['Digit6']);
  C.check(w.orders.length === 0 && w.screen === 'roue_ordres' && w.notes.some((t) => /sommations/.test(t)), 'F 6 avant les sommations : aucun refoulement, la raison est dite', w.notes.join(' | '));
  await snap('7-roue-disperser');
  // second appui dans les 3 s : les sommations sont lancées (chaîne légale), l'unité se met en ligne, pas de refoulement
  await press('Digit6');
  await frames(page, 3);
  const legal = await page.evaluate(() => window.__CRS.ctx.service('ui.command').legalChain.active());
  const refoul = (await sends()).filter((o) => o.type === 'refoulement').length;
  C.check(legal && refoul === 0, 'F 6 une seconde fois : les sommations sont lancées, aucun refoulement', `chaîne ${legal}, refoulements ${refoul}`);
  await snap('8-fin');
} catch (e) {
  C.check(false, 'scénario', String(e && e.stack ? e.stack : e));
}

await browser.close();
await server.close();
const real = errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e));
C.check(real.length === 0, 'aucune erreur dans la page', real.slice(0, 3).join(' | '));
C.done();
process.exit(C.failures.length === 0 ? 0 : 1);
