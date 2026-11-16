// Test de bout en bout des cartes et du commandement (banc d'essai harness/command.html).
//   bureau     : mini-carte, carte tactique à la souris — sélection (clic, Maj+clic, liste, cadre), ordres par
//                geste (point, ligne de barrage, nasse), force autorisée, incidents (glisser-déposer, menu),
//                secours, fermeture de rues, métro, temps ralenti, exécution des ordres ; vérifie que les ordres
//                arrivent dans ctx.squads (type, x, z, heading, width).
//   roles      : étendue du commandement (commissaire, chef de groupe, CRS, journaliste, manifestant).
//   plan       : plan de Paris, recherche, repère GPS, mini-carte ; roue d'ordres et radio.
//   manette    : curseur au stick, zoom aux gâchettes, sélection et ordre, zones de focus.
//   tactile    : téléphone 844×390 et tablette 1180×820 — toucher, glisser, pincer, tracé de ligne ;
//                aucun chevauchement entre le HUD et les commandes tactiles du module d'entrées.
//   degrade    : services étendus absents, monde neutre.
//   socle      : les mêmes écrans branchés dans le VRAI socle de l'interface (src/ui) : HUD, touches, focus.
// Usage : node tests/e2e/command.mjs [bureau] [roles] [plan] [manette] [tactile] [degrade] [socle]   (défaut : tout)
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);
const server = await startServer();
const failures = [];
const allErrors = [];
let passed = 0;
const info = [];
const check = (cond, msg) => {
  if (cond) passed++;
  else {
    failures.push(msg);
    console.error('  ✗ ' + msg);
  }
};
const near = (a, b, eps, msg) => check(typeof a === 'number' && Math.abs(a - b) <= eps, `${msg} (obtenu ${typeof a === 'number' ? a.toFixed(3) : a}, attendu ${b.toFixed(3)} ± ${eps})`);
/** Écart angulaire replié sur ]−π, π]. */
const angleNear = (a, b, eps, msg) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  check(Math.abs(d) <= eps, `${msg} (obtenu ${a.toFixed(3)} rad, attendu ${b.toFixed(3)} ± ${eps})`);
};

const BASE = server.url + 'harness/command.html?';
async function open(query, opts = {}) {
  const o = await openPage(BASE + query, opts);
  allErrors.push(o.errors);
  await waitFor(o.page, 'window.__ready === true || !!window.__error', 90000);
  const err = await o.page.evaluate(() => window.__error);
  if (err) throw new Error('banc en erreur : ' + err);
  await o.page.waitForTimeout(700);
  return o;
}
const frames = (page, n = 3) => page.evaluate((k) => new Promise((res) => {
  let c = 0;
  const f = () => (++c >= k ? res(null) : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
const settle = (page, ms = 320) => page.waitForTimeout(ms);
/** Position à l'écran (client) d'un point du monde sur la carte ouverte ('tactique' ou 'plan'). */
const mapPoint = (page, x, z) => page.evaluate(([wx, wz]) => {
  const b = window.__cmd;
  const map = b.tactical() ? b.tactical().map : b.plan().map;
  const r = map.canvas.getBoundingClientRect();
  const p = map.screenOf(wx, wz);
  return { x: r.left + p.x, y: r.top + p.y };
}, [x, z]);
const worldAt = (page, cx, cy) => page.evaluate(([x, y]) => {
  const b = window.__cmd;
  const map = b.tactical() ? b.tactical().map : b.plan().map;
  const r = map.canvas.getBoundingClientRect();
  const w = { x: 0, z: 0 };
  map.view.screenToWorld(x - r.left, y - r.top, w);
  return w;
}, [cx, cy]);
const order = (page, squadId) => page.evaluate((id) => {
  const o = window.__cmd.ctx.squads.get(id).order;
  return { type: o.type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce, issuedBy: o.issuedBy };
}, squadId);
const ids = (page) => page.evaluate(() => {
  const s = window.__cmd.scenario;
  return {
    company: s.company.id, sections: s.sections.map((x) => x.id), groups: s.groups.map((g) => g.map((x) => x.id)),
    neptune: s.specials['NEPTUNE 1'].id, centaure: s.specials['CENTAURE 1'].id, faucon: s.specials['FAUCON 1'].id,
    player: window.__cmd.ctx.player.state.personId,
  };
});
const selection = (page) => page.evaluate(() => Array.from(window.__cmd.tactical().state.selection).sort((a, b) => a - b));
const stack = (page) => page.evaluate(() => window.__cmd.ui.stack());
const notices = (page) => page.evaluate(() => window.__cmd.ui.notices.slice(-6));
const unit = (page, key) => page.evaluate((k) => {
  const u = window.__cmd.maps.scene.unitModel.get(k);
  return u ? { x: u.x, z: u.z, valid: u.valid, total: u.total, orderDist: u.orderDist } : null;
}, key);
/** Glisse la souris de A à B (coordonnées client), avec capture facultative en cours de geste. */
async function drag(page, a, b, opts = {}) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: opts.button ?? 'left' });
  const steps = opts.steps ?? 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await frames(page, 1);
  }
  if (opts.shot) {
    await frames(page, 3);
    await shot(page, opts.shot);
  }
  await page.mouse.up({ button: opts.button ?? 'left' });
  await frames(page, 2);
}
const click = (page, id) => page.click(`[data-id="${id}"]`);
/** Attend qu'un écran soit ouvert (ou fermé) ; false si ce n'est pas le cas après le délai. */
const untilStack = (page, id, present = true, timeout = 15000) => page
  .waitForFunction(([i, p]) => window.__cmd.ui.stack().includes(i) === p, [id, present], { timeout, polling: 50 })
  .then(() => true, () => false);
/** Appuie sur une touche et attend que l'écran correspondant s'ouvre ou se ferme. */
async function key(page, code, id, present) {
  await page.keyboard.press(code);
  const ok = await untilStack(page, id, present);
  await frames(page, 3);
  return ok;
}

// ══════════════════════════════════ BUREAU : COMMANDANT ══════════════════════════════════
async function bureau() {
  console.log('— bureau (commandant, souris et clavier)');
  const { browser, page } = await open('role=commandant&freeze=1&ai=0');
  const I = await ids(page);

  // ── HUD : mini-carte et « mon unité » ──
  let s = await page.evaluate(() => {
    const b = window.__cmd;
    const m = b.mapsSystem.minimap;
    return { draws: m.draws, transforms: m.transforms, hud: !!document.querySelector('[data-id="hud-unit"]:not(.is-off)'), unitText: document.querySelector('[data-id="hud-unit"]').textContent };
  });
  check(s.draws > 0, 'la mini-carte a été dessinée');
  check(s.hud && /MISTRAL/.test(s.unitText) && /\d+\/\d+/.test(s.unitText), `élément « mon unité » affiché (${s.unitText})`);
  await shot(page, 'command-hud-1280x720');
  // rotation du regard : la mini-carte tourne par transformation CSS, sans redessiner à chaque image
  const before = await page.evaluate(() => ({ d: window.__cmd.mapsSystem.minimap.draws, t: window.__cmd.mapsSystem.minimap.transforms }));
  await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const f = () => {
      window.__cmd.ctx.player.state.camYaw += 0.03;
      if (++n >= 30) res(null);
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  const after = await page.evaluate(() => ({ d: window.__cmd.mapsSystem.minimap.draws, t: window.__cmd.mapsSystem.minimap.transforms }));
  check(after.t - before.t >= 20, `mini-carte : ${after.t - before.t} transformations pour 30 images de rotation`);
  check(after.d - before.d <= 8, `mini-carte : ${after.d - before.d} dessins du canevas pendant ces 30 images (≤ 8 attendu)`);
  info.push(`mini-carte : 30 images de rotation → ${after.t - before.t} écritures de transformation, ${after.d - before.d} dessins du canevas`);

  // ── ouverture par la touche « carte tactique » ──
  check(await key(page, 'Tab', 'carte_tactique', true), 'la touche Tab ouvre la carte tactique');
  await settle(page, 500);
  const t0 = await page.evaluate(() => window.__cmd.ctx.clock.now);
  await settle(page, 500);
  const t1 = await page.evaluate(() => window.__cmd.ctx.clock.now);
  check(t1 > t0 + 0.2, `la simulation continue carte ouverte (${(t1 - t0).toFixed(2)} s simulées en 0,5 s)`);
  check(await page.evaluate(() => window.__cmd.ctx.ui.modal === true), 'écran modal : le personnage n\'est plus commandé');
  await shot(page, 'command-tactique-1280x720');

  // ── sélection : clic sur un symbole, Maj + clic, liste, cadre ──
  // vue rapprochée sur la section 2 pour distinguer ses groupes
  const g2 = I.groups[1];
  await page.evaluate((key) => {
    const b = window.__cmd;
    const u = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(u.x, u.z, 0.16);
  }, I.sections[1]);
  await settle(page, 500);
  let u = await unit(page, g2[0]);
  let p = await mapPoint(page, u.x, u.z);
  await page.mouse.click(p.x, p.y);
  await settle(page);
  check(JSON.stringify(await selection(page)) === JSON.stringify([g2[0]]), `clic sur le symbole : groupe sélectionné (${await selection(page)})`);
  u = await unit(page, g2[1]);
  p = await mapPoint(page, u.x, u.z);
  await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await settle(page);
  check(JSON.stringify(await selection(page)) === JSON.stringify([g2[0], g2[1]].sort((a, b) => a - b)), `Maj + clic : deux groupes sélectionnés (${await selection(page)})`);
  await shot(page, 'command-tactique-selection-1280x720');

  // ── ligne de barrage tracée pour DEUX groupes : partagée, sans croisement ──
  await click(page, 'verb-ligne');
  await settle(page, 200);
  check(await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'order'), 'verbe « Ligne » armé : la carte attend le tracé');
  const A = { x: p.x - 60, y: p.y - 170 };
  const B = { x: p.x + 150, y: p.y - 150 };
  const wA = await worldAt(page, A.x, A.y);
  const wB = await worldAt(page, B.x, B.y);
  await drag(page, A, B, { shot: 'command-tactique-trace-ligne-1280x720' });
  await settle(page);
  const expWidth = Math.hypot(wB.x - wA.x, wB.z - wA.z);
  const expHeading = Math.atan2(wB.z - wA.z, -(wB.x - wA.x));
  let oa = await order(page, g2[0]);
  let ob = await order(page, g2[1]);
  check(oa.type === 'ligne' && ob.type === 'ligne', `ordre « ligne » reçu par les deux groupes (${oa.type}, ${ob.type})`);
  near(oa.width + ob.width, expWidth, 0.6, 'ligne partagée : la somme des largeurs vaut la longueur tracée');
  near(oa.width, expWidth / 2, 0.6, 'ligne partagée : effectifs égaux, largeurs égales');
  angleNear(oa.heading, expHeading, 0.02, 'cap de la ligne : perpendiculaire au tracé, flanc gauche au départ');
  angleNear(ob.heading, expHeading, 0.02, 'cap identique pour le second groupe');
  near((oa.x + ob.x) / 2, (wA.x + wB.x) / 2, 0.6, 'centre de la ligne (x) au milieu du tracé');
  near((oa.z + ob.z) / 2, (wA.z + wB.z) / 2, 0.6, 'centre de la ligne (z) au milieu du tracé');
  check(oa.issuedBy === I.player && oa.maxForce === 1, `ordre signé du joueur, force plafonnée au niveau autorisé (issuedBy ${oa.issuedBy}, maxForce ${oa.maxForce})`);
  // les deux tronçons sont jointifs et rangés de gauche à droite sans croisement
  const rx = -Math.cos(expHeading), rz = Math.sin(expHeading);
  const pa = (oa.x - wA.x) * rx + (oa.z - wA.z) * rz;
  const pb = (ob.x - wA.x) * rx + (ob.z - wA.z) * rz;
  near(Math.abs(pa - pb), expWidth / 2, 0.6, 'tronçons jointifs (écart des centres = demi-longueur)');
  check(await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'idle'), 'après l\'ordre, la carte revient au mode libre');
  check(await page.evaluate(() => window.__cmd.command.issued.length >= 2), 'ordres tracés dans le journal de l\'interface');
  const log1 = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-2).map((m) => m.text));
  check(log1.some((t) => /Ligne de barrage/.test(t) && /PARLEZ/.test(t)), `compte rendu radio de l'ordre (${log1[log1.length - 1]})`);
  await shot(page, 'command-tactique-ligne-1280x720');

  // ── sélection par la liste, puis ligne pour UNE section (centre, cap, largeur exacts) ──
  await page.evaluate((key) => {
    const b = window.__cmd;
    const u = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(u.x, u.z, 0.5);
  }, I.sections[2]);
  await settle(page, 400);
  await click(page, 'unit-' + I.sections[2]);
  await settle(page);
  check(JSON.stringify(await selection(page)) === JSON.stringify([I.sections[2]]), 'clic dans la liste : section sélectionnée');
  await click(page, 'verb-ligne');
  u = await unit(page, I.sections[2]);
  p = await mapPoint(page, u.x, u.z);
  const C = { x: p.x + 40, y: p.y + 120 }, D = { x: p.x + 40, y: p.y + 20 };
  const wC = await worldAt(page, C.x, C.y), wD = await worldAt(page, D.x, D.y);
  await drag(page, C, D);
  await settle(page);
  let o = await order(page, I.sections[2]);
  check(o.type === 'ligne', `section : ordre « ligne » (${o.type})`);
  near(o.x, (wC.x + wD.x) / 2, 0.3, 'section : centre x de la ligne');
  near(o.z, (wC.z + wD.z) / 2, 0.3, 'section : centre z de la ligne');
  near(o.width, Math.hypot(wD.x - wC.x, wD.z - wC.z), 0.3, 'section : largeur = longueur du tracé');
  angleNear(o.heading, Math.atan2(wD.z - wC.z, -(wD.x - wC.x)), 0.02, 'section : cap de la ligne');
  // tracé du sud vers le nord : flanc gauche au sud, la section fait face à l'ouest
  angleNear(o.heading, -Math.PI / 2, 0.05, 'tracé sud → nord : face à l\'ouest');
  // le banc répartit l'ordre entre les groupes : leurs largeurs se partagent celle de la section
  const kids = await Promise.all(I.groups[2].map((id) => order(page, id)));
  near(kids.reduce((a, k) => a + k.width, 0), o.width, 0.5, 'groupes de la section : largeurs réparties');

  // ── nasse : centre posé, glissé vers l'issue ──
  await click(page, 'verb-encercler');
  await settle(page, 200);
  const hint = await page.evaluate(() => document.querySelector('.ct-hint').textContent);
  check(/issue/i.test(hint) && /faute/i.test(hint), `rappel de la règle de la nasse affiché (${hint.slice(0, 90)}…)`);
  const N0 = { x: p.x - 130, y: p.y - 60 }, N1 = { x: p.x - 130 + 55, y: p.y - 60 - 40 };
  const wN0 = await worldAt(page, N0.x, N0.y), wN1 = await worldAt(page, N1.x, N1.y);
  await drag(page, N0, N1, { shot: 'command-tactique-trace-nasse-1280x720' });
  await settle(page);
  o = await order(page, I.sections[2]);
  check(o.type === 'encercler', `ordre « encercler » (${o.type})`);
  near(o.x, wN0.x, 0.3, 'nasse : centre x');
  near(o.z, wN0.z, 0.3, 'nasse : centre z');
  near(o.width, 2 * Math.hypot(wN1.x - wN0.x, wN1.z - wN0.z), 0.5, 'nasse : largeur = diamètre');
  angleNear(o.heading, Math.atan2(wN1.x - wN0.x, wN1.z - wN0.z), 0.02, 'nasse : cap = direction de l\'issue');
  await settle(page, 400);
  await shot(page, 'command-tactique-nasse-1280x720');

  // ── clic droit : « avancer » immédiat ; glisser droit : ligne directe ──
  await click(page, 'unit-' + I.sections[3]);
  await settle(page);
  u = await unit(page, I.sections[3]);
  await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(un.x, un.z, 0.5);
  }, I.sections[3]);
  await settle(page, 400);
  p = await mapPoint(page, u.x, u.z);
  const R = { x: p.x - 120, y: p.y - 40 };
  const wR = await worldAt(page, R.x, R.y);
  await page.mouse.click(R.x, R.y, { button: 'right' });
  await settle(page);
  o = await order(page, I.sections[3]);
  check(o.type === 'avancer', `clic droit : ordre « avancer » (${o.type})`);
  near(o.x, wR.x, 0.3, 'avancer : x du point désigné');
  near(o.z, wR.z, 0.3, 'avancer : z du point désigné');
  angleNear(o.heading, Math.atan2(wR.x - u.x, wR.z - u.z), 0.05, 'avancer : cap de l\'unité vers le point');
  const E = { x: p.x - 90, y: p.y + 90 }, F = { x: p.x + 30, y: p.y + 90 };
  const wE = await worldAt(page, E.x, E.y), wF = await worldAt(page, F.x, F.y);
  await drag(page, E, F, { button: 'right' });
  await settle(page);
  o = await order(page, I.sections[3]);
  check(o.type === 'ligne', `glisser au bouton droit : ligne directe (${o.type})`);
  near(o.width, Math.hypot(wF.x - wE.x, wF.z - wE.z), 0.3, 'ligne directe : largeur');
  angleNear(o.heading, Math.PI, 0.03, 'tracé ouest → est : face au nord');

  // ── cadre de sélection ──
  await page.evaluate(() => {
    const b = window.__cmd;
    b.tactical().state.clearSelection();
    const u = b.maps.scene.unitModel.get(b.scenario.sections[1].id);
    b.tactical().map.jumpTo(u.x, u.z, 0.15);
  });
  await settle(page, 500);
  await click(page, 'tac-tool-box');
  u = await unit(page, I.sections[1]);
  p = await mapPoint(page, u.x, u.z);
  await drag(page, { x: p.x - 110, y: p.y - 110 }, { x: p.x + 110, y: p.y + 110 }, { shot: 'command-tactique-cadre-1280x720' });
  await settle(page);
  const boxed = await selection(page);
  check(I.groups[1].every((g) => boxed.includes(g)), `cadre : les trois groupes de la section 2 sont sélectionnés (${boxed})`);
  check(await page.evaluate(() => window.__cmd.tactical().state.tool === 'main'), 'après le cadre, l\'outil revient à la main');

  // ── niveau de force : ordre refusé au-dessus du niveau autorisé, puis autorisé ──
  await click(page, 'verb-charge');
  await settle(page, 200);
  let nt = await notices(page);
  check(nt.some((t) => /Refusé/.test(t) && /niveau 2/.test(t)), `« Charge » refusée tant que la force de niveau 2 n'est pas autorisée (${nt[nt.length - 1]})`);
  check(await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'idle'), 'aucun geste armé après un refus');
  await click(page, 'tac-force-2');
  await settle(page, 200);
  check(await page.evaluate(() => window.__cmd.ctx.law.roe.authorizedForce === 2), 'le commandant fixe la force autorisée au niveau 2 (ctx.law.authorize)');
  const forceLog = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0].text);
  check(/autorisé/.test(forceLog), `autorisation annoncée à la radio (${forceLog})`);
  await click(page, 'verb-charge');
  await settle(page, 200);
  const T = { x: p.x + 60, y: p.y - 150 };
  const wT = await worldAt(page, T.x, T.y);
  await page.mouse.click(T.x, T.y);
  await settle(page);
  const charged = await Promise.all(I.groups[1].map((id) => order(page, id)));
  check(charged.every((c) => c.type === 'charge' && c.maxForce === 2), `charge ordonnée aux trois groupes, force 2 (${charged.map((c) => c.type + '/' + c.maxForce)})`);
  if (process.env.DEBUG_CMD) console.log('charge', JSON.stringify({ wT, charged, sec: await order(page, I.sections[1]), sel: await selection(page) }));
  near(charged.reduce((a, c) => a + c.x, 0) / 3, wT.x, 1.5, 'charge : les trois points sont répartis autour du point désigné (x)');
  near(charged.reduce((a, c) => a + c.z, 0) / 3, wT.z, 1.5, 'charge : idem (z)');
  nt = await notices(page);
  check(nt.some((t) => /avant la dernière sommation/.test(t)), 'avertissement : emploi de la force avant la dernière sommation');
  check(await page.evaluate(() => document.querySelector('[data-id="tac-sommation"]').style.display !== 'none'), 'commandant de la force publique (écharpe) : bouton « Sommation suivante » proposé');

  // ── ordre immédiat ──
  await click(page, 'verb-tenir');
  await settle(page, 200);
  check((await order(page, I.groups[1][0])).type === 'tenir', 'ordre immédiat « Tenir » transmis');

  // ── incidents : liste triée, glisser-déposer sur une unité, délégation par menu ──
  await click(page, 'tab-incidents');
  await settle(page, 400);
  const incs = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.ct-inc')).map((r) => Number(r.dataset.incident));
    const api = window.__cmd.scenario.incidents;
    return rows.map((id) => { const i = api.get(id); return { id, kind: i.kind, urgency: i.urgency, state: i.state, x: i.x, z: i.z }; });
  });
  check(incs.length === 6, `six incidents listés (${incs.length})`);
  check(incs.every((x, i) => i === 0 || incs[i - 1].urgency >= x.urgency), `liste triée par urgence décroissante (${incs.map((x) => x.urgency).join(',')})`);
  check(incs[0].kind === 'feu_vehicule', `le plus urgent en tête (${incs[0].kind})`);
  check(await page.evaluate(() => document.querySelector('.ct-tab em').textContent === '6'), 'pastille de l\'onglet : 6 incidents non traités');
  // glisser le feu de poubelles sur le groupe 2 ALFA (vue recadrée pour voir les deux)
  const feu = incs.find((x) => x.kind === 'feu_poubelle');
  await page.evaluate(([id, key]) => {
    const b = window.__cmd;
    const inc = b.scenario.incidents.get(id);
    const u = b.maps.scene.unitModel.get(key);
    b.tactical().state.clearSelection();
    b.tactical().map.jumpTo((inc.x + u.x) / 2, (inc.z + u.z) / 2, 0.2);
  }, [feu.id, I.groups[1][0]]);
  await settle(page, 500);
  const row = await page.evaluate((id) => {
    const r = document.querySelector(`[data-id="incident-${id}"]`).getBoundingClientRect();
    return { x: r.left + 60, y: r.top + r.height / 2 };
  }, feu.id);
  u = await unit(page, I.groups[1][0]);
  p = await mapPoint(page, u.x, u.z);
  await drag(page, row, p, { steps: 14, shot: 'command-tactique-delegation-1280x720' });
  await settle(page);
  let inc = await page.evaluate((id) => { const i = window.__cmd.scenario.incidents.get(id); return { state: i.state, means: i.means, squadId: i.squadId }; }, feu.id);
  check(inc.state === 'assigne' && inc.squadId === I.groups[1][0] && inc.means === 'unite', `incident déposé sur 2 ALFA : confié (${JSON.stringify(inc)})`);
  // glisser le marqueur d'un incident (sur la carte) vers une unité
  const blesse = incs.find((x) => x.kind === 'blesse');
  await page.evaluate(([id, key]) => {
    const b = window.__cmd;
    const i = b.scenario.incidents.get(id);
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo((i.x + un.x) / 2, (i.z + un.z) / 2, 0.2);
  }, [blesse.id, I.groups[2][1]]);
  await settle(page, 500);
  const pi = await mapPoint(page, blesse.x, blesse.z);
  u = await unit(page, I.groups[2][1]);
  p = await mapPoint(page, u.x, u.z);
  await drag(page, pi, p, { steps: 12 });
  await settle(page);
  inc = await page.evaluate((id) => { const i = window.__cmd.scenario.incidents.get(id); return { state: i.state, squadId: i.squadId }; }, blesse.id);
  check(inc.state === 'assigne' && inc.squadId === I.groups[2][1], `marqueur d'incident glissé sur une unité : confié (${JSON.stringify(inc)})`);
  // délégation par menu : le véhicule en feu au canon à eau
  await click(page, 'incident-' + incs[0].id);
  await settle(page, 300);
  await click(page, `delegate-${incs[0].id}-canon_eau`);
  await settle(page, 300);
  inc = await page.evaluate((id) => { const i = window.__cmd.scenario.incidents.get(id); return { state: i.state, means: i.means, squadId: i.squadId }; }, incs[0].id);
  check(inc.means === 'canon_eau' && inc.squadId === I.neptune, `véhicule en feu confié au canon à eau (${JSON.stringify(inc)})`);
  // moyen inadapté : le Centaure n'éteint pas un feu
  const bad = await page.evaluate(([id, sq]) => window.__cmd.scenario.incidents.assign(id, 'centaure', sq), [incs[0].id, I.centaure]);
  check(bad === false, 'réalisme des moyens : le Centaure ne peut pas être chargé d\'un feu');
  await shot(page, 'command-tactique-incidents-1280x720');

  // ── secours : appel en un point, suivi de l'arrivée ──
  await click(page, 'tac-call-pompiers');
  await settle(page, 200);
  const hp = await mapPoint(page, incs[0].x, incs[0].z);
  await page.mouse.click(hp.x + 18, hp.y + 10);
  await settle(page, 400);
  let calls = await page.evaluate(() => window.__cmd.scenario.rescue.calls.map((c) => ({ kind: c.kind, state: c.state, eta: c.eta, x: c.x, z: c.z })));
  check(calls.length === 1 && calls[0].kind === 'pompiers' && calls[0].eta > 30, `pompiers appelés en un point (${JSON.stringify(calls)})`);
  const wCall = await worldAt(page, hp.x + 18, hp.y + 10);
  near(calls[0].x, wCall.x, 0.3, 'point d\'intervention des secours (x)');
  check(await page.evaluate(() => /Pompiers/.test(document.querySelector('.ct-call').textContent) && /\d:\d\d/.test(document.querySelector('.ct-call').textContent)), 'suivi de l\'arrivée affiché (état et délai)');
  await page.evaluate(() => window.__cmd.game.step(12));
  await settle(page, 500);
  calls = await page.evaluate(() => window.__cmd.scenario.rescue.calls.map((c) => ({ state: c.state, eta: c.eta })));
  check(calls[0].state === 'en_route' && calls[0].eta < 70, `les secours sont en route, le délai décroît (${JSON.stringify(calls[0])})`);
  await shot(page, 'command-tactique-secours-1280x720');

  // ── circulation : fermer une rue, un périmètre, rouvrir ──
  await click(page, 'tab-circulation');
  await settle(page, 300);
  const before2 = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
  await click(page, 'tac-close-road');
  await settle(page, 200);
  // on vise le milieu d'une rue voisine de la section 3
  const road = await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(un.x, un.z, 0.6);
    const s = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    b.ctx.world.nearestRoad(un.x + 70, un.z + 40, s, 120);
    return s;
  }, I.sections[2]);
  await settle(page, 500);
  p = await mapPoint(page, road.x, road.z);
  await page.mouse.move(p.x, p.y);
  await frames(page, 4);
  await shot(page, 'command-tactique-fermeture-apercu-1280x720');
  await page.mouse.click(p.x, p.y);
  await settle(page, 400);
  let cl = await page.evaluate(() => window.__cmd.scenario.traffic.closures.map((c) => ({ id: c.id, edgeId: c.edgeId })));
  check(cl.length === before2 + 1 && cl[cl.length - 1].edgeId === road.edgeId, `rue fermée par un clic (${road.name || 'voie'} : arête ${road.edgeId})`);
  check(await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'close_road'), 'l\'outil reste armé pour fermer plusieurs rues');
  await shot(page, 'command-tactique-fermeture-1280x720');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check(await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'idle') && (await stack(page)).includes('carte_tactique'), 'Échap annule l\'outil sans fermer la carte');
  await click(page, 'reopen-' + cl[cl.length - 1].id);
  await settle(page, 300);
  check(await page.evaluate(() => window.__cmd.scenario.traffic.closures.length) === before2, 'rue rouverte depuis la liste');
  await click(page, 'tac-close-area');
  await settle(page, 200);
  const ctr = { x: p.x - 40, y: p.y + 30 };
  await drag(page, ctr, { x: ctr.x + 170, y: ctr.y }, { shot: 'command-tactique-perimetre-1280x720' });
  await settle(page, 400);
  const afterArea = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
  check(afterArea >= before2 + 2, `périmètre tracé : ${afterArea - before2} accès fermés`);

  // ── métro : bulle d'une station sur la carte, fermeture, filtrage par l'unité sélectionnée ──
  const station = await page.evaluate(() => {
    const b = window.__cmd;
    const s = b.scenario.metro.stations[0];
    b.tactical().map.jumpTo(s.x, s.z, 0.7);
    return { id: s.id, name: s.name, x: s.x, z: s.z };
  });
  await settle(page, 500);
  p = await mapPoint(page, station.x, station.z);
  await page.mouse.click(p.x, p.y);
  await settle(page, 300);
  check(await page.evaluate(() => document.querySelector('.ct-pop').classList.contains('is-on')), `bulle de la station ${station.name} ouverte au clic`);
  await shot(page, 'command-tactique-metro-1280x720');
  await click(page, 'pop-metro-open');
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).open === false, station.id), 'station fermée (MetroApi.setOpen)');
  await click(page, 'pop-metro-open');
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).open === true, station.id), 'station rouverte');
  await page.evaluate((key) => window.__cmd.tactical().state.setSelection([key]), I.groups[0][2]);
  await settle(page, 300);
  await click(page, `metro-${station.id}-filter`);
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).filtered === true, station.id), 'sortie filtrée par l\'unité sélectionnée (MetroApi.setFiltered)');

  // ── journal ──
  await click(page, 'tab-journal');
  await settle(page, 400);
  const msgs = await page.evaluate(() => document.querySelectorAll('.ct-msg').length);
  check(msgs >= 8, `journal radio : ${msgs} messages horodatés`);
  await shot(page, 'command-tactique-journal-1280x720');

  // ── temps ralenti ──
  await click(page, 'tac-slow');
  check(await page.evaluate(() => window.__cmd.ctx.clock.timeScale === 0.25), 'temps ralenti : horloge à 0,25');
  check(await key(page, 'Tab', 'carte_tactique', false), 'Tab referme la carte tactique');
  check(await page.evaluate(() => window.__cmd.ctx.clock.timeScale === 1), 'horloge rétablie à la fermeture');

  // ── exécution : l'ordre reste affiché jusqu'à l'arrivée, puis compte rendu ──
  await page.evaluate(() => { window.__cmd.scenario.aiEnabled = true; });
  await key(page, 'Tab', 'carte_tactique', true);
  await settle(page, 500);
  check(await page.evaluate((key) => window.__cmd.tactical().state.selection.has(key), I.groups[0][2]), 'réouverture : la sélection est retrouvée');
  await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().state.setSelection([key]);
    b.tactical().map.jumpTo(un.x, un.z, 0.4);
  }, I.sections[3]);
  await settle(page, 400);
  u = await unit(page, I.sections[3]);
  p = await mapPoint(page, u.x, u.z);
  await click(page, 'tab-ordres');
  await click(page, 'verb-avancer');
  await page.mouse.click(p.x + 150, p.y + 60);
  await settle(page, 600);
  const far = await unit(page, I.groups[3][0]);
  check(far.orderDist > 20, `ordre en cours : le groupe est encore à ${far.orderDist.toFixed(0)} m de son point`);
  await shot(page, 'command-tactique-ordre-en-cours-1280x720');
  await page.evaluate(() => window.__cmd.game.step(45));
  await settle(page, 700);
  const arrived = await unit(page, I.groups[3][0]);
  check(arrived.orderDist < 8, `après 45 s simulées, le groupe est arrivé (${arrived.orderDist.toFixed(1)} m)`);
  const reports = await page.evaluate(() => window.__cmd.ctx.radio.log.filter((m) => /en place/.test(m.text)).length);
  check(reports >= 1, `compte rendu d'exécution au journal (${reports})`);
  const perf = await page.evaluate(() => ({ ...window.__cmd.perf(), draws: window.__cmd.tactical().map.draws, base: window.__cmd.tactical().map.base.renders }));
  info.push(`carte tactique 1280×720 : interface ${perf['ui:banc'].toFixed(2)} ms par image en moyenne (écran compris), ${perf.base} dessins complets du fond pour ${perf.draws} dessins de la carte`);
  await browser.close();
}

// ══════════════════════════════════ RÔLES ══════════════════════════════════
async function roles() {
  console.log('— rôles et étendue du commandement');
  // commissaire : autorité habilitée, sommations
  {
    const { browser, page } = await open('role=commissaire&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    const sc = await page.evaluate(() => { const s = window.__cmd.command.scope(); return { level: s.level, canSommation: s.canSommation, canAuthorize: s.canAuthorize, n: s.squadIds.size }; });
    check(sc.level === 'tout' && sc.canSommation && sc.canAuthorize, `commissaire : tout le dispositif, sommations et autorisation (${JSON.stringify(sc)})`);
    for (let i = 1; i <= 3; i++) {
      await click(page, 'tac-sommation');
      await settle(page, 250);
      check(await page.evaluate((n) => window.__cmd.ctx.law.roe.sommation === n, i), `sommation suivante : étape ${i}`);
    }
    check(await page.evaluate(() => document.querySelector('[data-id="tac-sommation"]').disabled === true), 'bouton désactivé après la dernière sommation');
    check(await page.evaluate(() => window.__cmd.ctx.law.roe.lawfulForce === 3), 'force licite passée au niveau 3 après la dernière sommation');
    await shot(page, 'command-tactique-commissaire-1280x720');
    await browser.close();
  }
  // chef de groupe : son groupe seulement
  {
    const { browser, page } = await open('role=chef_groupe&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    const I = await ids(page);
    const sc = await page.evaluate(() => { const s = window.__cmd.command.scope(); return { level: s.level, ids: Array.from(s.squadIds), own: s.ownSquadId, canAuthorize: s.canAuthorize, canMetro: s.canMetro }; });
    check(sc.level === 'unite' && sc.ids.length === 1 && sc.ids[0] === I.groups[1][0] && !sc.canAuthorize && !sc.canMetro, `chef de groupe : son groupe seulement (${JSON.stringify(sc)})`);
    // une autre unité sélectionnée ne reçoit pas d'ordre
    const other = I.groups[0][0];
    const prev = await order(page, other);
    await page.evaluate((key) => window.__cmd.tactical().state.setSelection([key]), other);
    await settle(page, 300);
    await click(page, 'verb-tenir');
    await settle(page, 200);
    check((await order(page, other)).type === prev.type, 'ordre refusé pour une unité hors de son commandement');
    await page.evaluate((key) => window.__cmd.tactical().state.setSelection([key]), I.groups[1][0]);
    await settle(page, 300);
    await click(page, 'verb-tenir');
    await settle(page, 200);
    check((await order(page, I.groups[1][0])).type === 'tenir', 'ordre transmis à son propre groupe');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="tac-ask-force"]')).display !== 'none'), 'bouton « Demander l\'autorisation » proposé au chef de groupe');
    check(await page.evaluate(() => document.querySelector('[data-id="tac-sommation"]').style.display === 'none'), 'pas de bouton « Sommation » pour un chef de groupe (non habilité)');
    await shot(page, 'command-tactique-chef-groupe-1280x720');
    await browser.close();
  }
  // CRS : lecture seule
  {
    const { browser, page } = await open('role=crs&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    const r = await page.evaluate(() => ({
      level: window.__cmd.command.scope().level, units: window.__cmd.maps.scene.units.length,
      palette: getComputedStyle(document.querySelector('.ct-verbs')).display, force: document.querySelector('[data-id="tac-force-3"]').disabled,
      crowd: window.__cmd.maps.scene.crowdCount,
    }));
    check(r.level === 'lecture' && r.palette === 'none' && r.force === true, `CRS : lecture seule, pas de palette d'ordres (${JSON.stringify(r)})`);
    check(r.units > 20 && r.crowd > 250, `CRS : il voit les unités (${r.units}) et la foule (${r.crowd})`);
    await shot(page, 'command-tactique-crs-lecture-1280x720');
    await key(page, 'Tab', 'carte_tactique', false);
    // roue d'ordres : message, aucun ordre possible
    await page.keyboard.down('KeyF');
    await untilStack(page, 'roue_ordres', true);
    await frames(page, 3);
    check(await page.evaluate(() => /Aucune unité/.test(document.querySelector('[data-id="order-wheel"]')?.textContent ?? '')), 'roue d\'ordres d\'un CRS : « aucune unité sous vos ordres »');
    await page.keyboard.up('KeyF');
    check(await untilStack(page, 'roue_ordres', false), 'la roue se referme au relâchement');
    await browser.close();
  }
  // journaliste et manifestant : jamais les positions de police
  for (const role of ['journaliste', 'manifestant']) {
    const { browser, page } = await open(`role=${role}&freeze=1&ai=0&open=carte_tactique`);
    await settle(page, 700);
    const r = await page.evaluate(() => {
      const sc = window.__cmd.maps.scene;
      return { units: sc.units.length, crowd: sc.crowdCount, incidents: sc.incidents.length, closures: sc.closures.length, stations: sc.stations.length, route: sc.route.length, level: window.__cmd.command.scope().level, hud: !!document.querySelector('[data-id="hud-unit"]:not(.is-off)') };
    });
    check(r.units === 0, `${role} : aucune position de police sur la carte (${r.units})`);
    check(r.level === 'lecture' && !r.hud, `${role} : lecture seule, pas d'élément « mon unité »`);
    const around = await page.evaluate(() => {
      const b = window.__cmd;
      const me = b.ctx.player.person();
      const R = b.maps.scene.vis.nearRadius;
      return b.ctx.people.list.filter((q) => q.faction === 'protest' && Math.hypot(q.x - me.x, q.z - me.z) <= R).length;
    });
    check(r.crowd > 0 && r.crowd === around && (role === 'manifestant' || r.crowd < 300), `${role} : seule la foule autour de lui est connue (${r.crowd} personnes dans 150 m, sur 300)`);
    check(r.stations > 0 && r.route > 0, `${role} : métro et parcours déclaré visibles`);
    if (role === 'manifestant') check(r.incidents === 0 && r.closures === 0, 'manifestant : ni incidents ni fermetures du commandement');
    const log = await page.evaluate(() => {
      window.__cmd.tactical().state.setTab('journal');
      return window.__cmd.maps.scene.vis.radio.join(',');
    });
    check(!/commandement/.test(log), `${role} : n'entend pas le canal de commandement (${log})`);
    await settle(page, 400);
    await shot(page, `command-tactique-${role}-1280x720`);
    await browser.close();
  }
  // exécutant : incident confié, avec distance et direction
  {
    const { browser, page } = await open('role=operateur_canon_eau&freeze=1&ai=0');
    await settle(page, 600);
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-id="hud-incident"]');
      return { on: !el.classList.contains('is-off'), text: el.textContent, arrow: el.querySelector('.ch-arrow').style.transform, id: window.__cmd.scenario.incidents.playerIncidentId };
    });
    check(r.on && r.id !== 0 && /\d+\s?m/.test(r.text) && /rotate/.test(r.arrow), `incident confié affiché avec distance et direction (${r.text} · ${r.arrow})`);
    const gps = await page.evaluate(() => ({ target: window.__cmd.maps.target && window.__cmd.maps.target.source, d: window.__cmd.maps.distance }));
    check(gps.target === 'objectif' || gps.target === 'incident', `GPS : cible suivie (${gps.target}, ${Math.round(gps.d)} m)`);
    await shot(page, 'command-hud-incident-1280x720');
    await browser.close();
  }
}

// ══════════════════════════════════ PLAN, ROUE, RADIO ══════════════════════════════════
async function plan() {
  console.log('— plan de Paris, GPS, roue d\'ordres, radio');
  const { browser, page } = await open('role=chef_groupe&freeze=1&ai=0');
  const I = await ids(page);
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => { const m = window.__cmd.plan(); return !!m && m.map.draws > 0; }, null, { timeout: 20000 });
  await settle(page, 400);
  check((await stack(page)).includes('carte'), 'la touche M ouvre le plan');
  const planBase = await page.evaluate(() => { const b = window.__cmd.plan().map.base; return { ms: b.maxMs, n: b.renders }; });
  const surf = await page.evaluate(() => { const s = window.__cmd.maps.fallback.surfaces; return { ms: s.lastMs, n: s.built }; });
  info.push(`plan 1280×720 : dessin complet du fond en ${planBase.ms.toFixed(0)} ms au plus (${planBase.n} dessins), puis recopie ; ${surf.n} images d'occupation du sol, ${surf.ms.toFixed(1)} ms pour la dernière`);
  check(await page.evaluate(() => window.__cmd.ctx.session.phase === 'paused'), 'le plan met la simulation en pause');
  await shot(page, 'command-plan-1280x720');
  // zoom à la molette, déplacement au glisser
  const v0 = await page.evaluate(() => { const v = window.__cmd.plan().map.view; return { cx: v.cx, cz: v.cz, mpp: v.mpp }; });
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -400);
  await settle(page, 400);
  const v1 = await page.evaluate(() => { const v = window.__cmd.plan().map.view; return { cx: v.cx, cz: v.cz, mpp: v.mpp }; });
  check(v1.mpp < v0.mpp * 0.8, `molette : zoom avant (${v0.mpp.toFixed(2)} → ${v1.mpp.toFixed(2)} m/px)`);
  await drag(page, { x: 700, y: 400 }, { x: 560, y: 330 });
  const v2 = await page.evaluate(() => { const v = window.__cmd.plan().map.view; return { cx: v.cx, cz: v.cz, mpp: v.mpp }; });
  near(v2.cx - v1.cx, 140 * v1.mpp, 1.5, 'glisser : la carte suit le pointeur (x)');
  near(v2.cz - v1.cz, 70 * v1.mpp, 1.5, 'glisser : la carte suit le pointeur (z)');
  // recherche
  await page.click('[data-id="plan-search"]');
  await page.keyboard.type('bastille');
  await settle(page, 300);
  const results = await page.evaluate(() => Array.from(document.querySelectorAll('.cm-result b')).map((b) => b.textContent));
  check(results.length > 0 && /Bastille/i.test(results[0]), `recherche « bastille » : ${results.slice(0, 3).join(' | ')}`);
  await shot(page, 'command-plan-recherche-1280x720');
  await page.click('[data-id="plan-result-0"]');
  await settle(page, 900);
  const card = await page.evaluate(() => document.querySelector('.cm-plan-card').textContent);
  check(/Bastille/i.test(card) && /Poser le repère/.test(card), `fiche du lieu trouvé (${card.slice(0, 60)})`);
  await click(page, 'plan-set');
  await settle(page, 400);
  const wp = await page.evaluate(() => window.__cmd.maps.waypoint);
  check(wp !== null && /Bastille/i.test(wp.label), `repère GPS posé (${wp && wp.label})`);
  check(await key(page, 'KeyM', 'carte', false) && await page.evaluate(() => window.__cmd.ctx.session.phase === 'playing'), 'M referme le plan, la simulation reprend');
  await page.waitForFunction(() => window.__cmd.maps.route.length >= 4 && /m/.test(document.querySelector('.cm-mini-dist').textContent), null, { timeout: 15000 }).catch(() => {});
  const gps = await page.evaluate(() => ({ n: window.__cmd.maps.route.length, d: window.__cmd.maps.distance, src: window.__cmd.maps.target && window.__cmd.maps.target.source, text: document.querySelector('.cm-mini-info').textContent, shown: !document.querySelector('.cm-mini-info').classList.contains('is-off') }));
  check(gps.src === 'repere' && gps.n >= 4 && gps.d > 800, `itinéraire GPS calculé (${gps.n / 2} points, ${Math.round(gps.d)} m)`);
  check(gps.shown && /km|m/.test(gps.text) && /Bastille/i.test(gps.text), `distance et repère affichés près de la mini-carte (${gps.text})`);
  await shot(page, 'command-hud-gps-1280x720');
  // repère par clic droit sur le plan
  await key(page, 'KeyM', 'carte', true);
  await page.waitForFunction(() => { const m = window.__cmd.plan(); return !!m && m.map.draws > 0; }, null, { timeout: 20000 });
  await settle(page, 300);
  if (process.env.DEBUG_CMD) console.log('avant clic droit', JSON.stringify(await page.evaluate(() => ({ stack: window.__cmd.ui.stack(), el: document.elementFromPoint(820, 300).className, phase: window.__cmd.ctx.session.phase, v: (() => { const m = window.__cmd.plan(); return m ? { cx: m.map.view.cx, cz: m.map.view.cz, mpp: m.map.view.mpp } : null; })(), b: window.__cmd.ctx.world.bounds }))));
  await page.mouse.click(820, 300, { button: 'right' });
  await settle(page, 300);
  const wp2 = await page.evaluate(() => window.__cmd.maps.waypoint);
  check(wp2 !== null && !/Bastille/i.test(wp2.label), `clic droit sur le plan : nouveau repère (${wp2 && wp2.label})`);
  await click(page, 'plan-clear');
  await settle(page, 200);
  check(await page.evaluate(() => window.__cmd.maps.waypoint === null), 'repère supprimé');
  await key(page, 'KeyM', 'carte', false);

  // ── roue d'ordres : touche maintenue, direction à la souris, relâchement ──
  const aim = await page.evaluate(() => { const s = window.__cmd.ctx.player.state; return { x: s.aimX, z: s.aimZ, yaw: s.camYaw }; });
  await page.keyboard.down('KeyF');
  check(await untilStack(page, 'roue_ordres', true), 'touche F maintenue : la roue d\'ordres s\'ouvre');
  await settle(page, 300);
  await shot(page, 'command-roue-1280x720');
  // secteur « En avant » : en haut de la roue
  await page.mouse.move(640, 360);
  await page.mouse.move(640, 250, { steps: 4 });
  await settle(page, 200);
  check(await page.evaluate(() => document.querySelector('.cw-title').textContent === 'En avant'), 'survol : secteur « En avant » surligné');
  await shot(page, 'command-roue-survol-1280x720');
  await page.keyboard.up('KeyF');
  check(await untilStack(page, 'roue_ordres', false), 'relâchement : la roue se ferme');
  let o = await order(page, I.groups[1][0]);
  check(o.type === 'avancer' && o.issuedBy === I.player, `ordre « avancer » donné à son groupe (${o.type})`);
  near(o.x, aim.x, 0.5, 'roue : l\'ordre vise le point regardé (x)');
  near(o.z, aim.z, 0.5, 'roue : l\'ordre vise le point regardé (z)');
  // appui bref : la roue reste affichée ; un clic choisit
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 600);
  check((await stack(page)).includes('roue_ordres'), 'appui bref : la roue reste affichée');
  const wedge = await page.evaluate(() => {
    const r = document.querySelector('.cw-svg').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = r.width / 320;
    const a = (8 * (Math.PI * 2 / 10)) - Math.PI / 2; // secteur « En ligne »
    return { x: cx + Math.cos(a) * 106 * k, y: cy + Math.sin(a) * 106 * k };
  });
  await page.mouse.click(wedge.x, wedge.y);
  const closedAfterChoice = await untilStack(page, 'roue_ordres', false);
  o = await order(page, I.groups[1][0]);
  check(o.type === 'ligne', `clic sur « En ligne » : ordre transmis (${o.type})`);
  angleNear(o.heading, aim.yaw, 0.01, 'ligne de la roue : face au regard');
  check(closedAfterChoice, 'la roue se ferme après le choix');
  // ordre de force non autorisé : refus
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 300);
  const w2 = await page.evaluate(() => {
    const r = document.querySelector('.cw-svg').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = r.width / 320;
    const a = (2 * (Math.PI * 2 / 10)) - Math.PI / 2; // « Charge »
    return { x: cx + Math.cos(a) * 106 * k, y: cy + Math.sin(a) * 106 * k };
  });
  await page.mouse.click(w2.x, w2.y);
  await settle(page, 300);
  check((await order(page, I.groups[1][0])).type === 'ligne', 'secteur « Charge » indisponible (force non autorisée) : aucun ordre');
  check(await key(page, 'Escape', 'roue_ordres', false), 'Échap ferme la roue');

  // ── radio ──
  check(await key(page, 'KeyT', 'radio', true), 'la touche T ouvre la radio');
  await settle(page, 300);
  const n0 = await page.evaluate(() => window.__cmd.ctx.radio.log.length);
  await click(page, 'radio-cr');
  await settle(page, 300);
  let last = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0]);
  check(await page.evaluate((n) => window.__cmd.ctx.radio.log.length === n + 1, n0) && /CENTRAL ICI MISTRAL 2 ALFA/.test(last.text) && /Nature/.test(last.text) && /Volume/.test(last.text) && /Attitude/.test(last.text), `compte rendu de situation émis (${last.text})`);
  check(await page.evaluate(() => document.querySelector('[data-id="radio-renfort"]').disabled), 'un seul message à la fois : boutons en attente');
  await settle(page, 2200);
  await click(page, 'radio-force');
  await settle(page, 300);
  last = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0]);
  check(/AUTORITÉ ICI/.test(last.text) && /emploi de la force/.test(last.text), `demande d'autorisation d'emploi de la force (${last.text})`);
  await settle(page, 2200);
  await click(page, 'radio-samu');
  await settle(page, 300);
  last = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0]);
  const calls = await page.evaluate(() => window.__cmd.scenario.rescue.calls.map((c) => c.kind));
  check(/URGENT/.test(last.text) && last.channel === 'secours' && calls.includes('samu'), `demande de secours : message et appel du SAMU (${last.text})`);
  await settle(page, 2200);
  await click(page, 'radio-renfort');
  await settle(page, 300);
  last = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0]);
  check(/renfort/.test(last.text), `demande de renfort (${last.text})`);
  await shot(page, 'command-radio-1280x720');
  check(await key(page, 'KeyT', 'radio', false), 'T referme la radio');
  // mini-carte : zoom selon le déplacement
  await browser.close();
  {
    const v = await open('role=chef_groupe&freeze=1&ai=0&vehicle=1');
    await settle(v.page, 800);
    const m = await v.page.evaluate(() => ({ mpp: window.__cmd.mapsSystem.minimap.mpp, veh: window.__cmd.maps.scene.inVehicle }));
    check(m.veh && m.mpp > 1.8, `en véhicule, la mini-carte montre plus large (${m.mpp.toFixed(2)} m/px)`);
    await shot(v.page, 'command-hud-vehicule-1280x720');
    await v.browser.close();
  }
}

// ══════════════════════════════════ MANETTE ══════════════════════════════════
async function manette() {
  console.log('— manette');
  const { browser, page } = await open('role=commandant&freeze=1&ai=0');
  const I = await ids(page);
  await page.evaluate(() => {
    const pad = {
      id: 'Manette d\'essai (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__pad = pad;
    window.__press = (i, v = 1) => { pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
    window.dispatchEvent(new Event('gamepadconnected'));
  });
  const tapPad = async (i) => {
    await page.evaluate((k) => window.__press(k, 1), i);
    await frames(page, 4);
    await page.evaluate((k) => window.__press(k, 0), i);
    await frames(page, 4);
  };
  await frames(page, 6);
  // Select (B8) ouvre la carte tactique ? La table par défaut l'affecte à « carte » : on passe par l'interface.
  await page.evaluate(() => window.__cmd.ctx.ui.open('carte_tactique'));
  await settle(page, 600);
  // stick gauche : le curseur apparaît et se déplace
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await settle(page, 400);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  await frames(page, 4);
  let c = await page.evaluate(() => { const m = window.__cmd.tactical().map; return { on: m.cursorOn, x: m.cursorX, y: m.cursorY, w: m.view.width, dev: window.__cmd.ctx.input.device }; });
  check(c.dev === 'gamepad' && c.on && c.x > c.w / 2 + 60, `stick gauche : curseur affiché et déplacé (${JSON.stringify(c)})`);
  check(await page.evaluate(() => document.activeElement === window.__cmd.tactical().map.canvas), 'en mode carte, le focus reste sur la carte (les directions pilotent le curseur)');
  // gâchette droite : zoom avant
  const mpp0 = await page.evaluate(() => window.__cmd.tactical().map.view.mpp);
  await page.evaluate(() => window.__press(7, 1));
  await settle(page, 400);
  await page.evaluate(() => window.__press(7, 0));
  const mpp1 = await page.evaluate(() => window.__cmd.tactical().map.view.mpp);
  check(mpp1 < mpp0 * 0.8, `gâchette droite : zoom avant (${mpp0.toFixed(2)} → ${mpp1.toFixed(2)})`);
  // stick droit : déplacement de la vue
  const cx0 = await page.evaluate(() => window.__cmd.tactical().map.view.cx);
  await page.evaluate(() => { window.__pad.axes[2] = 1; });
  await settle(page, 400);
  await page.evaluate(() => { window.__pad.axes[2] = 0; });
  const cx1 = await page.evaluate(() => window.__cmd.tactical().map.view.cx);
  check(cx1 > cx0 + 5, `stick droit : la vue se déplace (${(cx1 - cx0).toFixed(1)} m)`);
  // amener le curseur sur la section 3 et valider : sélection
  await page.evaluate((key) => {
    const b = window.__cmd;
    const m = b.tactical().map;
    const u = b.maps.scene.unitModel.get(key);
    m.jumpTo(u.x + 30, u.z, 0.5);
    const p = m.screenOf(u.x, u.z);
    m.cursorX = p.x;
    m.cursorY = p.y;
  }, I.sections[2]);
  await settle(page, 300);
  await tapPad(0);
  await settle(page, 300);
  check(JSON.stringify(await selection(page)) === JSON.stringify([I.sections[2]]), `bouton A sur une unité : sélection (${await selection(page)})`);
  // X : ordre rapide au curseur ; stick vers le haut puis A : « Avancer »
  await page.evaluate(() => {
    const m = window.__cmd.tactical().map;
    m.cursorX += 120;
    m.cursorY -= 60;
  });
  const target = await page.evaluate(() => {
    const m = window.__cmd.tactical().map;
    const w = { x: 0, z: 0 };
    m.view.screenToWorld(m.cursorX, m.cursorY, w);
    return w;
  });
  await tapPad(2);
  await settle(page, 300);
  check(await page.evaluate(() => document.querySelector('.ct-quick').classList.contains('is-on')), 'bouton X : menu radial d\'ordre rapide');
  await page.evaluate(() => { window.__pad.axes[1] = -1; });
  await settle(page, 250);
  await shot(page, 'command-tactique-manette-radial-1280x720');
  await page.evaluate(() => window.__press(0, 1));
  await frames(page, 4);
  await page.evaluate(() => { window.__press(0, 0); window.__pad.axes[1] = 0; });
  await settle(page, 300);
  const o = await order(page, I.sections[2]);
  check(o.type === 'avancer', `menu radial : « Avancer » choisi au stick (${o.type})`);
  near(o.x, target.x, 0.5, 'ordre rapide : au point du curseur (x)');
  near(o.z, target.z, 0.5, 'ordre rapide : au point du curseur (z)');
  // ligne tracée au curseur : A maintenu pendant le déplacement
  await page.evaluate(() => {
    const t = window.__cmd.tactical();
    document.querySelector('[data-id="verb-ligne"]').click();
    t.map.canvas.focus();
  });
  await settle(page, 200);
  const a0 = await page.evaluate(() => { const m = window.__cmd.tactical().map; const w = { x: 0, z: 0 }; m.view.screenToWorld(m.cursorX, m.cursorY, w); return w; });
  await page.evaluate(() => window.__press(0, 1));
  await frames(page, 4);
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await settle(page, 250);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  await frames(page, 4);
  const a1 = await page.evaluate(() => { const m = window.__cmd.tactical().map; const w = { x: 0, z: 0 }; m.view.screenToWorld(m.cursorX, m.cursorY, w); return w; });
  await page.evaluate(() => window.__press(0, 0));
  await settle(page, 300);
  const ol = await order(page, I.sections[2]);
  check(ol.type === 'ligne', `ligne tracée à la manette (${ol.type})`);
  near(ol.width, Math.hypot(a1.x - a0.x, a1.z - a0.z), 1.2, 'ligne à la manette : largeur du tracé');
  // LB / RB : zones de focus (carte → unités → onglets)
  await tapPad(5);
  await settle(page, 200);
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('ct-unit')), 'RB : le focus passe à la liste des unités');
  await page.evaluate(() => window.__press(13, 1));
  await frames(page, 4);
  await page.evaluate(() => window.__press(13, 0));
  await frames(page, 4);
  await tapPad(0);
  await settle(page, 300);
  const selPad = await selection(page);
  check(selPad.length === 1 && selPad[0] !== I.sections[2], `croix bas puis A dans la liste : autre unité sélectionnée (${selPad})`);
  await tapPad(5);
  await settle(page, 200);
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('ct-tab')), 'RB : le focus passe aux onglets');
  await shot(page, 'command-tactique-manette-focus-1280x720');
  // B : retour (ferme la carte quand rien n'est en cours)
  await tapPad(1);
  await settle(page, 300);
  check(!(await stack(page)).includes('carte_tactique'), 'bouton B : la carte tactique se ferme');
  await browser.close();
}

// ══════════════════════════════════ TACTILE ══════════════════════════════════
async function tactile() {
  console.log('— tactile (téléphone 844×390, tablette 1180×820)');
  for (const size of [{ w: 844, h: 390, name: '844x390' }, { w: 1180, h: 820, name: '1180x820' }]) {
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&touch=1', { width: size.w, height: size.h, mobile: true, deviceScaleFactor: 2 });
    const I = await ids(page);
    const cdp = await page.context().newCDPSession(page);
    const fingers = new Map();
    const points = () => [...fingers].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id, radiusX: 9, radiusY: 9, force: 1 }));
    const down = async (id, x, y) => { fingers.set(id, { x, y }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points() }); };
    const move = async (id, x, y, steps = 6) => {
      const from = fingers.get(id);
      for (let i = 1; i <= steps; i++) {
        fingers.set(id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points() });
        await frames(page, 1);
      }
    };
    const up = async (id) => {
      const p = fingers.get(id);
      fingers.delete(id);
      const released = fingers.size > 0 && p ? [{ x: Math.round(p.x), y: Math.round(p.y), id, radiusX: 9, radiusY: 9, force: 1 }] : [];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: released });
    };
    const tap = async (x, y) => { await down(9, x, y); await frames(page, 2); await up(9); await frames(page, 3); };
    const tapId = async (id) => {
      const r = await page.evaluate((k) => { const e = document.querySelector(`[data-id="${k}"]`).getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2, w: e.width, h: e.height }; }, id);
      await page.touchscreen.tap(r.x, r.y);
      await frames(page, 3);
      return r;
    };
    await settle(page, 600);
    // ── HUD par-dessus les commandes tactiles du module d'entrées : aucun chevauchement ──
    const overlap = await page.evaluate(() => {
      const rects = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; })
        .map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id || e.className, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }).filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
      const controls = rects('.ct-c').concat(rects('.ct-stick'));
      const hud = rects('.cm-mini-disc').concat(rects('.cm-mini-info'), rects('.ch:not(.is-off)'));
      const hits = [];
      for (const a of hud) for (const b of controls) if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hits.push(`${a.id} ∩ ${b.id}`);
      const out = hud.filter((r) => r.x0 < 0 || r.y0 < 0 || r.x1 > innerWidth || r.y1 > innerHeight).map((r) => r.id);
      return { hits, out, controls: controls.length, hud: hud.length, touch: window.__cmd.ctx.service('input.touch').visible };
    });
    check(overlap.touch && overlap.controls >= 8, `${size.name} : commandes tactiles du module d'entrées affichées (${overlap.controls})`);
    check(overlap.hits.length === 0, `${size.name} : aucun élément de HUD ne recouvre une commande tactile (${overlap.hits.join(', ') || 'aucun'})`);
    check(overlap.out.length === 0 && overlap.hud >= 2, `${size.name} : HUD entièrement dans l'écran (${overlap.hud} éléments)`);
    await shot(page, `command-hud-${size.name}`);

    // ── plan : pincement ──
    await page.evaluate(() => window.__cmd.ctx.ui.open('carte'));
    await settle(page, 700);
    await shot(page, `command-plan-${size.name}`);
    const cxp = size.w / 2, cyp = size.h / 2 + 30;
    const m0 = await page.evaluate(() => window.__cmd.plan().map.view.mpp);
    await down(1, cxp - 40, cyp);
    await down(2, cxp + 40, cyp);
    await move(1, cxp - 110, cyp, 6);
    await move(2, cxp + 110, cyp, 6);
    await up(1);
    await up(2);
    await settle(page, 400);
    const m1 = await page.evaluate(() => window.__cmd.plan().map.view.mpp);
    check(m1 < m0 * 0.6, `${size.name} : pincement = zoom (${m0.toFixed(2)} → ${m1.toFixed(2)} m/px)`);
    // appui long : repère GPS
    await down(3, cxp + 60, cyp - 40);
    await settle(page, 800);
    await up(3);
    await settle(page, 300);
    check(await page.evaluate(() => window.__cmd.maps.waypoint !== null), `${size.name} : appui long sur le plan = repère GPS`);
    await page.evaluate(() => { window.__cmd.maps.clearWaypoint(); window.__cmd.ctx.ui.close('carte'); });
    await settle(page, 300);

    // ── carte tactique au doigt ──
    await page.evaluate(() => window.__cmd.ctx.ui.open('carte_tactique'));
    await settle(page, 800);
    await shot(page, `command-tactique-${size.name}`);
    const compact = await page.evaluate(() => document.querySelector('.ct').classList.contains('is-compact'));
    check(compact === (size.w < 980 || size.h < 520), `${size.name} : disposition ${compact ? 'compacte (tiroirs)' : 'large (panneaux)'}`);
    // cibles tactiles : boutons d'au moins 44 px (40 px tolérés pour les lignes de liste serrées)
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.ct button')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 39.5 || r.width < 39.5); }).map((b) => (b.dataset.id || b.className) + ' ' + Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height)));
    check(small.length === 0, `${size.name} : toutes les cibles tactiles font au moins 40 px (${small.slice(0, 6).join(', ') || 'ok'})`);
    // toucher une unité : sélection
    await page.evaluate((key) => {
      const b = window.__cmd;
      const u = b.maps.scene.unitModel.get(key);
      b.tactical().map.jumpTo(u.x, u.z, 0.5);
    }, I.sections[2]);
    await settle(page, 500);
    let u = await unit(page, I.sections[2]);
    let p = await mapPoint(page, u.x, u.z);
    await tap(p.x, p.y);
    await settle(page);
    check(JSON.stringify(await selection(page)) === JSON.stringify([I.sections[2]]), `${size.name} : toucher une unité la sélectionne (${await selection(page)})`);
    // glisser : déplacement de la carte
    const c0 = await page.evaluate(() => { const v = window.__cmd.tactical().map.view; return { cx: v.cx, cz: v.cz, mpp: v.mpp }; });
    await down(4, p.x + 60, p.y + 90);
    await move(4, p.x + 10, p.y + 40, 6);
    await up(4);
    await settle(page, 200);
    const c1 = await page.evaluate(() => { const v = window.__cmd.tactical().map.view; return { cx: v.cx, cz: v.cz }; });
    near(c1.cx - c0.cx, 50 * c0.mpp, 3, `${size.name} : glisser déplace la carte (x)`);
    // ouvrir le tiroir des ordres (compact), choisir « Ligne », tracer au doigt
    if (compact) {
      await tapId('tab-ordres');
      await settle(page, 300);
      check(await page.evaluate(() => document.querySelector('.ct-right').classList.contains('is-open')), `${size.name} : le tiroir des ordres s'ouvre`);
      await shot(page, `command-tactique-tiroir-${size.name}`);
    }
    await tapId('verb-ligne');
    await settle(page, 300);
    if (compact) {
      // le tiroir se referme pour tracer
      await tapId('tab-ordres');
      await settle(page, 300);
    }
    u = await unit(page, I.sections[2]);
    p = await mapPoint(page, u.x, u.z);
    const A = { x: p.x - 70, y: p.y + 70 }, B = { x: p.x + 60, y: p.y + 70 };
    const wA = await worldAt(page, A.x, A.y), wB = await worldAt(page, B.x, B.y);
    await down(5, A.x, A.y);
    await move(5, B.x, B.y, 8);
    await frames(page, 3);
    await shot(page, `command-tactique-trace-ligne-${size.name}`);
    await up(5);
    await settle(page, 400);
    let o = await order(page, I.sections[2]);
    check(o.type === 'ligne', `${size.name} : ligne tracée au doigt (${o.type})`);
    near(o.width, Math.hypot(wB.x - wA.x, wB.z - wA.z), 0.5, `${size.name} : largeur de la ligne`);
    near(o.x, (wA.x + wB.x) / 2, 0.5, `${size.name} : centre de la ligne (x)`);
    angleNear(o.heading, Math.PI, 0.03, `${size.name} : tracé ouest → est, face au nord`);
    // appui long avec une sélection : ordre rapide (menu radial), « Nasse »
    const L = { x: p.x - 100, y: p.y + 20 };
    const wL = await worldAt(page, L.x, L.y);
    await down(6, L.x, L.y);
    await settle(page, 800);
    await up(6);
    await settle(page, 300);
    check(await page.evaluate(() => document.querySelector('.ct-quick').classList.contains('is-on')), `${size.name} : appui long = menu radial d'ordre rapide`);
    await shot(page, `command-tactique-radial-${size.name}`);
    const nasse = await page.evaluate(() => {
      const r = document.querySelector('.ct-quick .cw-svg').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = r.width / 320;
      const a = (3 * (Math.PI * 2 / 8)) - Math.PI / 2; // quatrième secteur : « Nasse »
      return { x: cx + Math.cos(a) * 106 * k, y: cy + Math.sin(a) * 106 * k };
    });
    await page.touchscreen.tap(nasse.x, nasse.y);
    await settle(page, 400);
    o = await order(page, I.sections[2]);
    check(o.type === 'encercler' && o.width > 20, `${size.name} : « Nasse » depuis le menu radial (${o.type}, diamètre ${o.width.toFixed(0)} m)`);
    near(o.x, wL.x, 0.6, `${size.name} : nasse centrée sur le point appuyé`);
    await settle(page, 300);
    await shot(page, `command-tactique-nasse-${size.name}`);
    // incidents : menu de délégation ; fermeture de rue au doigt
    await tapId('tab-incidents');
    await settle(page, 400);
    const first = await page.evaluate(() => Number(document.querySelector('.ct-inc').dataset.incident));
    await tapId('incident-' + first);
    await settle(page, 400);
    await shot(page, `command-tactique-incidents-${size.name}`);
    await tapId(`delegate-${first}-pompiers`);
    await settle(page, 400);
    const call = await page.evaluate((id) => window.__cmd.scenario.rescue.calls.filter((c) => c.incidentId === id).map((c) => c.kind), first);
    check(call.includes('pompiers'), `${size.name} : véhicule en feu → pompiers appelés pour cet incident`);
    await tapId('tab-circulation');
    await settle(page, 300);
    await tapId('tac-close-road');
    await settle(page, 300);
    if (compact) {
      await tapId('tab-circulation');
      await settle(page, 300);
    }
    const nb = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
    const road = await page.evaluate(() => {
      const b = window.__cmd;
      const v = b.tactical().map.view;
      const s = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
      b.ctx.world.nearestRoad(v.cx + 40, v.cz - 60, s, 150);
      return s;
    });
    p = await mapPoint(page, road.x, road.z);
    await tap(p.x, p.y);
    await settle(page, 400);
    check(await page.evaluate(() => window.__cmd.scenario.traffic.closures.length) === nb + 1, `${size.name} : rue fermée d'un toucher (${road.name || 'voie'})`);
    await shot(page, `command-tactique-fermeture-${size.name}`);
    await browser.close();
  }
}

// ══════════════════════════════════ DÉGRADATION ══════════════════════════════════
async function degrade() {
  console.log('— services absents, monde neutre');
  {
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&absent=incidents,traffic,metro,rescue,hazards&open=carte_tactique');
    await settle(page, 700);
    const r = await page.evaluate(() => ({
      tabs: Array.from(document.querySelectorAll('.ct-tab')).filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.dataset.id),
      incidents: window.__cmd.maps.scene.incidents.length, stations: window.__cmd.maps.scene.stations.length, closures: window.__cmd.maps.scene.closures.length,
    }));
    check(JSON.stringify(r.tabs) === JSON.stringify(['tab-ordres', 'tab-journal']), `services étendus absents : seuls restent Ordres et Journal (${r.tabs})`);
    check(r.incidents === 0 && r.stations === 0 && r.closures === 0, 'couches correspondantes vides, sans erreur');
    const I = await ids(page);
    await click(page, 'unit-' + I.sections[0]);
    await click(page, 'verb-tenir');
    await settle(page, 200);
    check((await order(page, I.sections[0])).type === 'tenir', 'les ordres fonctionnent sans les services étendus');
    await shot(page, 'command-tactique-sans-services-1280x720');
    await key(page, 'Tab', 'carte_tactique', false);
    await key(page, 'KeyT', 'radio', true);
    await click(page, 'radio-pompiers');
    await settle(page, 300);
    const nt = await notices(page);
    check(nt.some((t) => /Aucun service de secours/.test(t)), 'radio : demande de secours transmise, absence du service signalée');
    await browser.close();
  }
  {
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&map=none&open=carte_tactique');
    await settle(page, 700);
    const I = await ids(page);
    check(await page.evaluate(() => window.__cmd.ctx.world.edgeCount === 0), 'monde neutre : aucun graphe routier');
    await click(page, 'unit-' + I.sections[1]);
    await click(page, 'verb-ligne');
    const u = await unit(page, I.sections[1]);
    const p = await mapPoint(page, u.x, u.z);
    await drag(page, { x: p.x - 50, y: p.y + 60 }, { x: p.x + 50, y: p.y + 60 });
    await settle(page);
    check((await order(page, I.sections[1])).type === 'ligne', 'monde neutre : la carte et les ordres fonctionnent sans plan');
    await shot(page, 'command-tactique-monde-neutre-1280x720');
    await page.evaluate(() => { window.__cmd.ctx.ui.close(); window.__cmd.ctx.ui.open('carte'); });
    await settle(page, 500);
    await shot(page, 'command-plan-monde-neutre-1280x720');
    await browser.close();
  }
  {
    // quartier d'essai : autre jeu de données, mêmes écrans
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&map=test&open=carte_tactique');
    await settle(page, 900);
    check(await page.evaluate(() => window.__cmd.ctx.world.edgeCount > 50), 'quartier d\'essai chargé');
    await shot(page, 'command-tactique-quartier-essai-1280x720');
    await browser.close();
  }
}

// ══════════════════════════════════ VRAI SOCLE DE L'INTERFACE ══════════════════════════════════
async function socle() {
  console.log('— intégration dans le vrai socle de l\'interface (src/ui)');
  const { browser, page } = await open('role=commandant&freeze=1&ai=0&kit=core');
  const I = await ids(page);
  await settle(page, 800);
  const hud = await page.evaluate(() => ({
    widgets: window.__cmd.ctx.service('ui.debug').hudWidgets(),
    mini: !!document.querySelector('.ui-layer--hud [data-id="minimap"]'), unit: document.querySelector('[data-id="hud-unit"]')?.textContent ?? '',
    screens: ['carte', 'carte_tactique', 'roue_ordres', 'radio'].map((id) => window.__cmd.ctx.service('ui.kit').hasScreen(id)),
  }));
  check(hud.widgets.includes('maps.minimap') && hud.widgets.includes('command.unit') && hud.widgets.includes('command.incident'), `éléments de HUD enregistrés auprès du vrai UiKit (${hud.widgets.join(', ')})`);
  check(hud.mini && /MISTRAL/.test(hud.unit), 'mini-carte et « mon unité » affichés dans le HUD du socle');
  check(hud.screens.every(Boolean), 'écrans carte, carte_tactique, roue_ordres et radio enregistrés');
  await shot(page, 'command-socle-hud-1280x720');
  // touches d'interface du socle (table HOTKEY_SCREENS)
  check(await key(page, 'Tab', 'carte_tactique', true), 'socle : Tab ouvre la carte tactique');
  await settle(page, 600);
  check(await page.evaluate(() => document.activeElement === window.__cmd.tactical().map.canvas), 'socle : à l\'ouverture, le focus est sur la carte (data-autofocus)');
  await click(page, 'unit-' + I.sections[2]);
  await click(page, 'verb-ligne');
  const u = await unit(page, I.sections[2]);
  const p = await mapPoint(page, u.x, u.z);
  const A = { x: p.x - 60, y: p.y + 80 }, B = { x: p.x + 70, y: p.y + 80 };
  const wA = await worldAt(page, A.x, A.y), wB = await worldAt(page, B.x, B.y);
  await drag(page, A, B);
  await settle(page);
  const o = await order(page, I.sections[2]);
  check(o.type === 'ligne', `socle : ligne tracée, ordre reçu (${o.type})`);
  near(o.width, Math.hypot(wB.x - wA.x, wB.z - wA.z), 0.4, 'socle : largeur de la ligne');
  near(o.x, (wA.x + wB.x) / 2, 0.4, 'socle : centre de la ligne');
  await settle(page, 400);
  await shot(page, 'command-socle-tactique-1280x720');
  check(await page.evaluate(() => window.__cmd.ctx.session.phase === 'playing'), 'socle : la simulation n\'est pas en pause carte tactique ouverte');
  await click(page, 'verb-avancer');
  check(await key(page, 'Escape', 'carte_tactique', true) && await page.evaluate(() => window.__cmd.tactical().state.mode.kind === 'idle'), 'socle : Échap annule d\'abord l\'ordre en préparation');
  check(await key(page, 'Escape', 'carte_tactique', false), 'socle : Échap ferme ensuite la carte');
  check(await key(page, 'KeyM', 'carte', true), 'socle : M ouvre le plan');
  await page.waitForFunction(() => { const m = window.__cmd.plan(); return !!m && m.map.draws > 0; }, null, { timeout: 20000 }).catch(() => {});
  check(await page.evaluate(() => window.__cmd.ctx.session.phase === 'paused'), 'socle : le plan met en pause');
  await shot(page, 'command-socle-plan-1280x720');
  check(await key(page, 'KeyM', 'carte', false) && await page.evaluate(() => window.__cmd.ctx.session.phase === 'playing'), 'socle : M referme le plan, reprise');
  check(await key(page, 'KeyT', 'radio', true), 'socle : T ouvre la radio');
  const n0 = await page.evaluate(() => window.__cmd.ctx.radio.log.length);
  await click(page, 'radio-cr');
  await settle(page, 300);
  check(await page.evaluate((n) => window.__cmd.ctx.radio.log.length === n + 1, n0), 'socle : message rapide émis');
  await shot(page, 'command-socle-radio-1280x720');
  check(await key(page, 'KeyT', 'radio', false), 'socle : T referme la radio');
  await page.keyboard.down('KeyF');
  check(await untilStack(page, 'roue_ordres', true), 'socle : F maintenue ouvre la roue d\'ordres');
  await settle(page, 300);
  await page.mouse.move(640, 360);
  await page.mouse.move(640, 250, { steps: 4 });
  await settle(page, 200);
  await shot(page, 'command-socle-roue-1280x720');
  await page.keyboard.up('KeyF');
  check(await untilStack(page, 'roue_ordres', false), 'socle : relâchement, la roue se ferme');
  check((await order(page, I.company)).type === 'avancer', 'socle : ordre de la roue transmis à l\'unité du joueur');
  // manette dans le vrai socle : zones de focus par LB / RB
  await page.evaluate(() => {
    const pad = { id: 'Manette d\'essai (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    window.__press = (i, v = 1) => { pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
    window.dispatchEvent(new Event('gamepadconnected'));
    window.__cmd.ctx.ui.open('carte_tactique');
  });
  await settle(page, 600);
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await settle(page, 300);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  await frames(page, 4);
  const pad = await page.evaluate(() => ({ on: window.__cmd.tactical().map.cursorOn, focus: document.activeElement === window.__cmd.tactical().map.canvas }));
  check(pad.on && pad.focus, `socle + manette : le stick déplace le curseur, le focus reste sur la carte (${JSON.stringify(pad)})`);
  await page.evaluate(() => window.__press(5, 1));
  await frames(page, 4);
  await page.evaluate(() => window.__press(5, 0));
  await settle(page, 300);
  check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('ct-unit')), 'socle + manette : RB passe le focus à la liste des unités (« ui:tab »)');
  await browser.close();
  // téléphone : HUD du socle + le nôtre + commandes tactiles
  {
    const m = await open('role=commandant&freeze=1&ai=0&kit=core&touch=1', { width: 844, height: 390, mobile: true, deviceScaleFactor: 2 });
    await settle(m.page, 3200);
    const overlap = await m.page.evaluate(() => {
      const rects = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; })
        .map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id || e.className, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }).filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
      const controls = rects('.ct-c').concat(rects('.ct-stick'));
      const mine = rects('.cm-mini-disc').concat(rects('.cm-mini-info'), rects('.ch:not(.is-off)'));
      const hits = [];
      for (const a of mine) for (const b of controls) if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hits.push(`${a.id} ∩ ${b.id}`);
      return { hits, controls: controls.length, mine: mine.length };
    });
    check(overlap.controls >= 8 && overlap.mine >= 2 && overlap.hits.length === 0, `socle, téléphone : nos éléments de HUD ne recouvrent aucune commande tactile (${overlap.hits.join(', ') || 'aucun chevauchement'})`);
    await shot(m.page, 'command-socle-hud-844x390');
    await m.page.evaluate(() => window.__cmd.ctx.ui.open('carte_tactique'));
    await settle(m.page, 900);
    await shot(m.page, 'command-socle-tactique-844x390');
    await m.browser.close();
  }
}

const steps = [['bureau', bureau], ['roles', roles], ['plan', plan], ['manette', manette], ['tactile', tactile], ['degrade', degrade], ['socle', socle]];
let crashed = false;
for (const [name, fn] of steps) {
  if (!want(name)) continue;
  try {
    await fn();
  } catch (err) {
    crashed = true;
    console.error(`[command] étape « ${name} » interrompue :`, err && err.stack ? err.stack : err);
    failures.push(`étape « ${name} » interrompue : ${err && err.message ? err.message : err}`);
  }
}
const errors = allErrors.flat();
console.log(`[command] ${passed} vérifications réussies, ${failures.length} échec(s)`);
for (const line of info) console.log('  · ' + line);
for (const f of failures) console.log('  ✗ ' + f);
await finish({ server, errors, ok: failures.length === 0 && !crashed, label: 'command' });
