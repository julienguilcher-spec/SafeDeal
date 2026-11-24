// RECETTE DES ORDRES DIRECTS dans le navigateur (plan ordres-directs, paquet P16) : le commandant, place de la Concorde,
// joue les parcours §7.1, §7.2 et §7.3 — au CLAVIER SEUL à 1280 × 800 (Mac sans souris), puis AU DOIGT à 844 × 390
// (téléphone tenu à deux mains).
//   §7.1  il tourne la vue jusqu'à lire « Bloquer la rue … · MISTRAL n · N m », Entrée (ou la pastille) : le ticket
//         « reçu » est là à l'instant, l'unité tient l'ordre du joueur, la ligne d'état le dit ;
//   §7.2  un manifestant lance un projectile (fait constaté) : il tourne la vue vers lui jusqu'à lire « Interpeller le
//         lanceur de projectile · … », UN appui : l'ordre part, le marqueur suit l'auteur ;
//   §7.3  U (⟳) : la BRAV-M ; la ligne nomme FAUCON ; « Envoyer » part (Maj+Entrée sur une rue, ou Entrée sur un point).
// Vérifié par le DOM et window.__CRS ; une capture à chaque étape (ordre-direct-recette-<taille>-<étape>.png), à REGARDER.
// Usage : node tests/e2e/ordre-direct-recette.mjs [--out=/chemin/vers/le/dossier] [--only=clavier|tel]
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer, openPage, waitFor, frames, step, makeChecker, fingers, rects, overlap, OUT } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const tag = 'ordre-direct-recette';
const C = makeChecker(tag);
const outDir = args.out && args.out !== '1' ? args.out : OUT;
mkdirSync(outDir, { recursive: true });
const server = await startServer();
const query = new URLSearchParams({
  autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', rank: 'commandant', variante: 'terrain', place: 'Place de la Concorde',
  crowd: '300', quality: 'bas', seed: '21', time: '12', weather: 'clair',
});

/** État des ordres directs, des tickets et de ce que le HUD écrit. */
const lire = (page) => page.evaluate(() => {
  const c = window.__CRS.ctx;
  const d = c.service('command.direct');
  const n = d.ready();
  const text = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
  return {
    rule: n ? n.rule : '', text: n ? n.text : '', enabled: n ? n.enabled : false, who: n && n.who ? n.who.label : '', ids: n && n.who ? n.who.squadIds.slice() : [],
    autre: n && n.autre ? n.autre.text : '', autreOk: !!(n && n.autre && n.autre.enabled), person: n ? n.personId : 0, distance: n ? n.distance : 0,
    key: d.whoKey(),
    tickets: d.tickets.map((t) => ({ id: t.squadId, who: t.who, verb: t.verb, state: t.state })),
    hud: text('.cq, .cm-quick, [data-hud="ordres"], .crs-orders').join(' | ').slice(0, 400),
    chip: text('.cu-chip, .crs-unit-chip, [data-hud="unite"]').join(' | ').slice(0, 200),
    now: c.clock.now,
  };
});
const ordreDe = (page, id) => page.evaluate((sid) => {
  const s = window.__CRS.ctx.squads.get(sid);
  return s ? { name: s.name, type: String(s.order.type), byPlayer: s.order.byPlayer === true, targetId: s.order.targetId } : null;
}, id);

/**
 * Le manifestant libre le plus près de l'axe du regard (à moins de 2,5°, en vue, à 20–110 m) lance un projectile, des
 * agents le voient (ce que fait le monde) ; null : personne dans l'axe. Le rendu logiciel fait tourner la vue par grands
 * crans : on ne vise pas à 4° près aux flèches ici, c'est le lanceur qui est pris là où le joueur regarde.
 */
const lanceur = (page) => page.evaluate(() => {
  const c = window.__CRS.ctx;
  const me = c.player.person();
  const cam = c.player.state.camYaw;
  let best = null, ba = 2.5 * Math.PI / 180, bd = 0;
  for (const p of c.people.list) {
    if (p.faction !== 'protest' || p.custody !== 'free' || p.vehicleId !== 0 || p.dormant) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < 20 || d > 110 || !c.world.lineOfSight(me.x, me.z, p.x, p.z)) continue;
    const yaw = Math.atan2(p.x - me.x, p.z - me.z);
    const a = Math.abs(Math.atan2(Math.sin(yaw - cam), Math.cos(yaw - cam)));
    if (a < ba) { ba = a; best = p; bd = d; }
  }
  if (!best) return null;
  c.law.recordOffense(best, 'jet_projectile', best.x, best.z, 3).witnessed = true;
  return { id: best.id, d: bd, ecart: ba * 180 / Math.PI };
});

async function jouer(mode) {
  const tel = mode === 'tel';
  const W = tel ? 844 : 1280, H = tel ? 390 : 800;
  const { browser, page, errors } = await openPage(`${server.url}?${query}`, { width: W, height: H, mobile: tel, pointerLock: false });
  const snap = async (name) => {
    const file = path.join(outDir, `${tag}-${mode}-${name}.png`);
    try { await frames(page, 2); } catch { /* page occupée */ }
    await page.screenshot({ path: file, timeout: 240000 });
    console.log('  capture : ' + file);
  };
  const F = tel ? await fingers(page) : null;
  const touche = async (code, shift = false) => {
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.down(code);
    await frames(page, 2);
    await page.keyboard.up(code);
    if (shift) await page.keyboard.up('Shift');
    await frames(page, 2);
  };
  /** Centre d'une commande tactile visible (pastille « Ordre prêt » : orders ; « ⟳ À qui » : order_who). */
  const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => r.w > 0) ?? null;
  const toucher = async (key) => {
    const r = await ctl(key);
    if (!r) return false;
    // (toucher bref, posé et levé d'un seul envoi : tenu plus de 350 ms, c'est l'appui long qui ouvre la roue)
    const pt = [{ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 7 }];
    await Promise.all([F.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }), F.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })]);
    await frames(page, 3);
    return true;
  };
  /** Tourne la vue d'un cran : flèche (clavier) ou glissé du pouce droit (téléphone). */
  const tourner = async (dir) => {
    if (!tel) {
      const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(k);
      await frames(page, 2);
      await page.keyboard.up(k);
    } else {
      await F.drag(2, W * 0.72, H * 0.42, W * 0.72 + dir * 90, H * 0.42, 5);
    }
    await frames(page, 2);
    await step(page, 0.3);
  };
  const ordonner = async () => (tel ? toucher('orders') : touche('Enter'));
  const aQui = async () => (tel ? toucher('order_who') : touche('KeyU'));
  const L = (s) => `${mode} — ${s}`;
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
    await step(page, 4);
    await frames(page, 4);
    await snap('0-depart');

    // ── §7.1 : une bouche de rue, puis l'ordre ──
    let d = await lire(page);
    for (let i = 0; i < 60 && !(d.rule === 'g' && d.enabled && d.ids.length === 1); i++) { await tourner(1); d = await lire(page); }
    C.check(d.rule === 'g' && d.enabled, L('§7.1 la vue tournée : la ligne dit « Bloquer la rue … · unité · distance »'), d.text);
    C.check(/^Bloquer .+ · MISTRAL \d · \d+ m$/.test(d.text), L('§7.1 la ligne nomme la rue, la section et la distance'), d.text);
    await snap('1-rue-designee');
    const section = d.ids[0];
    const t0 = d.now;
    await ordonner();
    let e = await lire(page);
    const tk = e.tickets.find((t) => t.id === section);
    C.check(!!tk && tk.verb === 'bloquer', L('§7.1 un appui : le ticket de la section existe aussitôt'), JSON.stringify(tk));
    const o1 = await ordreDe(page, section);
    C.check(!!o1 && o1.type === 'couper_circulation' && o1.byPlayer, L('§7.1 la section tient « barrer la rue », ordre du joueur'), JSON.stringify(o1));
    await snap('2-ordre-donne');
    await step(page, 12);
    await frames(page, 3);
    e = await lire(page);
    const tk2 = e.tickets.find((t) => t.id === section);
    C.check(!!tk2 && ['route', 'attente', 'en_place'].includes(tk2.state), L('§7.1 douze secondes plus tard : en route, ou déjà en place'), `${JSON.stringify(tk2)} (t+${(e.now - t0).toFixed(0)} s)`);
    await snap('3-en-route');

    // ── §7.2 : un lanceur de projectile, un appui ──
    // il tourne la vue jusqu'à avoir un manifestant dans l'axe ; celui-là lance un projectile
    let cible = await lanceur(page);
    for (let i = 0; i < 40 && !cible; i++) { await tourner(1); cible = await lanceur(page); }
    C.check(!!cible, L('§7.2 un manifestant dans l’axe du regard lance un projectile'), JSON.stringify(cible));
    if (cible) {
      await step(page, 1);
      await frames(page, 3);
      d = await lire(page);
      C.check(d.rule === 'c' && d.person === cible.id && /^Interpeller le lanceur de projectile · .+ · \d+\u00a0m$/.test(d.text), L('§7.2 la ligne dit « Interpeller le lanceur de projectile · unité · distance »'), d.text);
      await snap('4-lanceur-designe');
      const unit = d.ids[0];
      await ordonner();
      const o2 = unit ? await ordreDe(page, unit) : null;
      C.check(!!o2 && o2.type === 'interpeller' && o2.byPlayer && o2.targetId === cible.id, L('§7.2 un appui : l’unité tient « interpeller » cet auteur'), JSON.stringify(o2));
      await step(page, 2);
      await snap('5-interpeller');
    }

    // ── §7.3 : U (⟳) — la BRAV-M —, puis « Envoyer » ──
    await step(page, 1);
    d = await lire(page);
    for (let i = 0; i < 80 && !((d.rule === 'g' && d.autre.startsWith('Envoyer')) || d.rule === 'h'); i++) { await tourner(-1); d = await lire(page); }
    C.check((d.rule === 'g' && d.autre.startsWith('Envoyer')) || d.rule === 'h', L('§7.3 la vue tournée : un lieu où envoyer une unité'), `${d.text} / autre : ${d.autre}`);
    // (la partie lancée par l'adresse a les moyens par défaut : la BRAV-M n'y est que si la foule annoncée le demande)
    const aBravm = await page.evaluate(() => window.__CRS.ctx.service('command.direct').env().units.some((u) => u.kind === 'bravm'));
    const avant = d.who;
    await aQui();
    await frames(page, 2);
    d = await lire(page);
    if (aBravm) C.check(/FAUCON|BRAV-M/.test(d.who), L('§7.3 U (⟳) : la ligne nomme la BRAV-M, première du cycle'), `${d.text} / autre : ${d.autre} / choix ${d.key}`);
    else C.check(d.key !== 'auto' && d.who !== '', L('§7.3 U (⟳) : le choix devient manuel, la ligne nomme l’unité (pas de BRAV-M dans cette partie)'), `${avant} → ${d.who} / choix ${d.key}`);
    await snap('6-bravm-choisie');
    const bravm = d.ids[0];
    await step(page, 0.7);
    if (d.rule === 'h') await ordonner();
    else if (!tel) await touche('Enter', true);
    else {
      // téléphone : l'ordre « autre » est sur la roue (appui long sur la pastille, relâcher sur le secteur en surbrillance)
      const r = await ctl('orders');
      await F.down(1, r.x + r.w / 2, r.y + r.h / 2);
      await step(page, 0.5);
      await frames(page, 4);
      await snap('7-roue-appui-long');
      const hot = await page.evaluate(() => { const w = document.querySelector('.cw-wedge.is-hot'); if (!w) return null; const b = w.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      if (hot) await F.move(1, hot.x, hot.y);
      await frames(page, 3);
      await F.up(1);
      await frames(page, 4);
    }
    const o3 = bravm ? await ordreDe(page, bravm) : null;
    C.check(!!o3 && ['colonne', 'avancer'].includes(o3.type) && o3.byPlayer, L('§7.3 « Envoyer » part à l’unité choisie (ordre du joueur)'), JSON.stringify(o3));
    await step(page, 3);
    await snap('8-bravm-envoyee');
    e = await lire(page);
    C.check(e.tickets.some((t) => t.id === bravm && t.verb === 'envoyer'), L('§7.3 le ticket « Envoyer » de l’unité choisie est affiché'), JSON.stringify(e.tickets.filter((t) => t.id === bravm)));

    // ── rien ne se chevauche : la pastille, ⟳ et la zone gauche du HUD (téléphone) ──
    if (tel) {
      const a = await ctl('orders'), b = await ctl('order_who');
      C.check(!!a && !!b && a.h >= 44 && b.h >= 44 && b.w >= 44, L('pastille et ⟳ : au moins 44 px'), JSON.stringify({ a, b }));
      const hudLeft = (await rects(page, '.cq .cm-btn')).filter((r) => r.w > 0);
      const hits = hudLeft.filter((r) => (a && overlap(a, r)) || (b && overlap(b, r)));
      C.check(hits.length === 0, L('la pastille et ⟳ ne recouvrent aucun bouton de la zone gauche du HUD'), JSON.stringify(hits));
    }
    C.check(errors.length === 0, L('aucune erreur dans la console'), errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

try {
  if (!args.only || args.only === 'clavier') await jouer('clavier');
  if (!args.only || args.only === 'tel') await jouer('tel');
} catch (err) {
  C.check(false, 'le scénario va jusqu’au bout', String(err && err.stack ? err.stack : err).slice(0, 600));
} finally {
  C.done();
  await server.close().catch(() => {});
}
process.exit(C.failures.length === 0 ? 0 : 1);
