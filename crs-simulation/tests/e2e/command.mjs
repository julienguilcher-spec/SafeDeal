// Test de bout en bout des cartes et du commandement (banc d'essai harness/command.html).
//   bureau     : mini-carte ; CARTE DE COMMANDEMENT à la souris / au pavé tactile — repos (S0, au plus 22 boutons),
//                fiche d'un repère (S1), Qui (Maj + clic, liste, cadre, « Toute la compagnie »), « Tracer la ligne
//                moi-même » en deux clics (géométrie exacte), cercle serré, gestes experts (clic droit, glisser droit),
//                confirmation légale (S3), « Cadre légal », incidents (« Plus… », glisser-déposer, fiche), secours,
//                fermeture de rues, métro, journal, temps ralenti, exécution des ordres ; vérifie que les ordres
//                arrivent dans ctx.squads (type, x, z, heading, width).
//   roles      : étendue du commandement (commissaire, chef de groupe, CRS en lecture seule, journaliste, manifestant).
//   plan       : plan de Paris, recherche, repère GPS, mini-carte ; roue d'ordres (8 secteurs) et radio ; carte au clavier.
//   manette    : correspondance du §5.1 — stick = visée libre, A = Entrée, B = Échap, X = U, Y = « Plus… », LB / RB =
//                « À traiter », croix = sauts de la visée, gâchettes = zoom.
//   tactile    : téléphone 844×390 et tablette 1180×820 — toucher (fiche, jamais d'ordre au premier toucher), glisser,
//                pincer, tracé de ligne, barre du bas, une feuille à la fois ; aucun chevauchement entre le HUD et les
//                commandes tactiles du module d'entrées.
//   degrade    : services étendus absents, monde neutre.
//   socle      : les mêmes écrans branchés dans le VRAI socle de l'interface (src/ui) : HUD, touches, focus.
// Captures des états de la carte : command-S0…S6-1280x720.png et command-S0…S6-844x390.png dans tests/e2e/out.
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
  return cond;
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
  return { type: o.type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce, issuedBy: o.issuedBy, issuedAt: o.issuedAt };
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
  if (opts.shift) await page.keyboard.down('Shift');
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
  if (opts.shift) await page.keyboard.up('Shift');
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

// ── carte de commandement : état de l'écran, fiche, repères ──

/** État de la carte de commandement : feuille, intention, visée, fiche (repère, ligne, lignes), Qui, mode, tracé. */
const tac = (page) => page.evaluate(() => {
  const t = window.__cmd.tactical();
  if (!t) return null;
  const s = t.state;
  const card = t.card;
  const list = card && s.card ? (s.card.othersOpen ? card.others : card.lines) : [];
  const r = s.card ? s.card.repere : null;
  return {
    sheet: s.sheet, intent: s.intent, mode: s.mode.kind, tool: s.tool, tracing: !!t.tmap.tracing, listIndex: s.listIndex,
    visee: s.visee ? { kind: s.visee.kind, name: s.visee.name, key: s.visee.key, x: s.visee.x, z: s.visee.z } : null,
    card: r ? { kind: r.kind, key: r.key, name: r.name, squadId: r.squadId ?? 0, incidentId: r.incidentId ?? 0, x: r.x, z: r.z, line: s.card.line, others: s.card.othersOpen } : null,
    lines: list.map((l) => l.label), lineLabel: s.card && list[s.card.line] ? list[s.card.line].label : '',
    who: s.who ? { label: s.who.label, ids: s.who.squadIds.slice() } : null, whole: s.whole, whoIndex: s.whoIndex,
    sent: s.lastSent ? s.lastSent.text : '', where: !!s.where,
  };
});
/** Texte visible d'un élément (espaces réduits), '' s'il est absent. */
const textOf = (page, sel) => page.evaluate((q) => (document.querySelector(q)?.innerText || '').replace(/\s+/g, ' ').trim(), sel);
/** Boutons visibles de la carte de commandement (data-id, sinon le début du texte). */
const visibleButtons = (page) => page.evaluate(() => [...document.querySelectorAll('[data-id="tactical"] button')].filter((b) => {
  const r = b.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
}).map((b) => b.dataset.id || b.textContent.trim().slice(0, 24)));
/** Clic réel au centre d'un élément visible ; false s'il est absent ou masqué. */
async function clickEl(page, sel, opts = {}) {
  const r = await page.evaluate((q) => {
    const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  if (!r) return false;
  await page.mouse.move(r.x, r.y);
  await frames(page, 2);
  await page.mouse.click(r.x, r.y, opts);
  await frames(page, 3);
  return true;
}
/** data-id de la ligne de la fiche dont le libellé correspond, '' sinon. */
const lineId = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const b = [...document.querySelectorAll('[data-id^="card-line-"]')].find((e) => rx.test(e.querySelector('.cc-lab')?.textContent || ''));
  return b ? b.dataset.id : '';
}, re.source);
/** Clic réel sur la ligne de la fiche dont le libellé correspond (au pointeur, un clic sur une ligne l'envoie). */
async function cardLine(page, re) {
  const id = await lineId(page, re);
  return id !== '' && clickEl(page, `[data-id="${id}"]`);
}
/** Survole la ligne (aperçu, phrase « Ce qui va se passer ») et rend le texte de la fiche. */
async function hoverLine(page, re) {
  const id = await lineId(page, re);
  if (id === '') return '';
  const r = await page.evaluate((q) => { const b = document.querySelector(`[data-id="${q}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
  await page.mouse.move(r.x, r.y);
  await frames(page, 4);
  await settle(page, 200);
  return textOf(page, '.ct-mount-card');
}
/** « Autres ordres ici… » (ligne 0) puis la ligne `re` de la liste. */
async function otherLine(page, re) {
  if (!(await clickEl(page, '[data-id="card-line-0"]'))) return false;
  return cardLine(page, re);
}
/** Retour au repos sans fermer la carte (Échap tant qu'une fiche, une feuille ou une intention est ouverte). */
async function rest(page) {
  for (let i = 0; i < 6; i++) {
    const s = await tac(page);
    if (!s || (!s.card && s.sheet === 'none' && !s.intent && !s.tracing)) return;
    await page.keyboard.press('Escape');
    await frames(page, 3);
  }
}
/**
 * Point de l'écran (client) proche de (sx, sy) où le repère accroché au pointeur est d'un des genres voulus
 * ('point' : aucun repère). `edge` : rue d'une arête précise. Le point est sur la carte visible (pas sous une feuille).
 */
const spot = (page, sx, sy, kinds = ['point', 'rue'], opts = {}) => page.evaluate(([x0, y0, ks, o]) => {
  const t = window.__cmd.tactical();
  const c = t.map.canvas;
  const r = c.getBoundingClientRect();
  const touch = !!o.touch;
  for (let rad = 0; rad <= (o.max ?? 160); rad += 10) {
    const n = rad === 0 ? 1 : 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = x0 + Math.cos(a) * rad, y = y0 + Math.sin(a) * rad;
      if (x < r.left + 30 || x > r.right - 30 || y < r.top + 30 || y > r.bottom - 30) continue;
      if (document.elementFromPoint(x, y) !== c) continue;
      const st = t.tmap.stackAt(x - r.left, y - r.top, touch, true);
      const kind = st.length === 0 ? 'point' : st[0].kind;
      if (!ks.includes(kind)) continue;
      if (o.edge !== undefined && !(st[0] && st[0].roadEdge === o.edge)) continue;
      return { x, y, kind };
    }
  }
  return null;
}, [sx, sy, kinds, opts]);
/** Ferme la phrase de première ouverture (« Compris ») si elle est affichée. */
async function dismissModel(page) {
  if (await page.evaluate(() => !!document.querySelector('.ct-model.is-on'))) await clickEl(page, '[data-id="tac-model-ok"]');
}
/** « Tracer la ligne moi-même » (dans « Autres ordres ici… » de la fiche ouverte) puis les deux bouts en deux clics. */
async function traceLine(page, A, B) {
  if (!(await otherLine(page, /^Tracer la ligne moi-même$/))) return false;
  if (!(await page.evaluate(() => !!window.__cmd.tactical().tmap.tracing))) return false;
  await page.mouse.click(A.x, A.y);
  await frames(page, 3);
  await page.mouse.click(B.x, B.y);
  await frames(page, 3);
  await settle(page, 200);
  return true;
}

// ══════════════════════════════════ BUREAU : COMMANDANT ══════════════════════════════════
async function bureau() {
  console.log('— bureau (commandant, souris et pavé tactile, clavier)');
  const { browser, page } = await open('role=commandant&freeze=1&ai=0');
  const I = await ids(page);

  // ── HUD : mini-carte et « mon unité » ──
  let s = await page.evaluate(() => {
    const b = window.__cmd;
    const m = b.mapsSystem.minimap;
    return { draws: m.draws, transforms: m.transforms, hud: !!document.querySelector('[data-id="hud-unit"]:not(.is-off)'), unitText: document.querySelector('[data-id="hud-unit"]').textContent };
  });
  check(s.draws > 0, 'la mini-carte a été dessinée');
  check(s.hud && /MISTRAL|avec vous/i.test(s.unitText) && /\d+\/\d+/.test(s.unitText), `élément « mon unité » affiché : qui est avec moi, effectif (${s.unitText})`);
  check(!/INITIATIVE|_/.test(s.unitText), `« mon unité » en mots simples, jamais « INITIATIVE » ni un type brut (${s.unitText})`);
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

  // ── ouverture par la touche « carte de commandement » ──
  check(await key(page, 'Tab', 'carte_tactique', true), 'la touche Tab ouvre la carte de commandement');
  await settle(page, 500);
  const t0 = await page.evaluate(() => window.__cmd.ctx.clock.now);
  await settle(page, 500);
  const t1 = await page.evaluate(() => window.__cmd.ctx.clock.now);
  check(t1 > t0 + 0.2, `la simulation continue carte ouverte (${(t1 - t0).toFixed(2)} s simulées en 0,5 s)`);
  check(await page.evaluate(() => window.__cmd.ctx.ui.modal === true), 'écran modal : le personnage n\'est plus commandé');
  // S0 : six intentions, « Plus… », la pastille légale en mots ; au plus 22 boutons
  // (§2.1 : 14 commandes fixes, au plus 3 « À traiter », une rangée par section ou groupe d'unités dans « Mes unités » —
  // 22 à la Concorde, voir verif-commande-clavier ; le banc a 4 sections et plus de moyens spéciaux)
  const b0 = (await visibleButtons(page)).filter((id) => id !== 'tac-model-ok');
  const fixed0 = b0.filter((id) => !id.startsWith('todo-') && !id.startsWith('follow-'));
  const rows0 = b0.filter((id) => id.startsWith('follow-'));
  const secs0 = await page.evaluate(() => window.__cmd.scenario.sections.length);
  check(fixed0.length <= 14 && b0.filter((id) => id.startsWith('todo-')).length <= 3, `S0 : au plus 14 commandes fixes et 3 « À traiter » (${b0.length} : ${b0.join(' · ')})`);
  const groups0 = new Set(I.groups.flat().map((id) => 'follow-u-' + id));
  check(rows0.length <= secs0 + 3 && !rows0.some((id) => groups0.has(id)), `S0 : « Mes unités » plié, une rangée par section ou groupe d'unités, aucun groupe déplié (${rows0.length} rangées pour ${secs0} sections)`);
  check(b0.filter((id) => id.startsWith('intent-')).length === 6 && b0.includes('tac-more') && b0.includes('tac-legal'), 'S0 : six intentions, « Plus… » et la pastille légale');
  const chip = await textOf(page, '[data-id="tac-legal"]');
  check(/Sommations \d\/3 · Force : [a-zàâçéèêëîïôûùüÿ ]+/i.test(chip) && !/Force : \d/.test(chip), `pastille légale en mots (${chip})`);
  check(/CARTE DE COMMANDEMENT/i.test(await textOf(page, '.ct-top')), 'titre « Carte de commandement »');
  await shot(page, 'command-S0-1280x720');
  await dismissModel(page);

  // ── clic sur une de mes unités : sa fiche ; Maj + clic : les unités choisies (Qui) ──
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
  const issued0 = (await order(page, g2[0])).issuedAt;
  await page.mouse.click(p.x, p.y);
  await settle(page);
  let t = await tac(page);
  check(t.card && t.card.kind === 'unite' && t.card.squadId === g2[0], `clic sur le symbole : la fiche du groupe s'ouvre (${JSON.stringify(t.card)})`);
  check(t.lines.length <= 6 && /^L.envoyer ailleurs/.test(t.lines[0] ?? '') && t.lines.some((l) => /Tenir sa position/.test(l)), `fiche d'une unité : au plus six lignes, « L’envoyer ailleurs… » d'abord (${t.lines.join(' | ')})`);
  check(t.sent === '' && (await order(page, g2[0])).issuedAt === issued0, 'un clic sur la carte ne donne jamais d\'ordre');
  await rest(page);
  await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  u = await unit(page, g2[1]);
  p = await mapPoint(page, u.x, u.z);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await settle(page);
  check(JSON.stringify(await selection(page)) === JSON.stringify([g2[0], g2[1]].sort((a, b) => a - b)), `Maj + clic : deux groupes choisis (${await selection(page)})`);
  await shot(page, 'command-tactique-selection-1280x720');

  // ── « Tracer la ligne moi-même » pour DEUX groupes : deux clics, ligne partagée, sans croisement ──
  const A = { x: p.x - 60, y: p.y - 170 };
  const B = { x: p.x + 150, y: p.y - 150 };
  const sp1 = await spot(page, p.x + 40, p.y - 100);
  check(!!sp1, 'un point libre de la carte pour ouvrir sa fiche');
  await page.mouse.click(sp1.x, sp1.y);
  await settle(page);
  t = await tac(page);
  check(t.card && (t.card.kind === 'point' || t.card.kind === 'rue') && t.who && t.who.ids.length === 2, `fiche du lieu : Qui = les deux groupes choisis (${JSON.stringify(t.who)})`);
  await shot(page, 'command-S1-1280x720');
  const wA = await worldAt(page, A.x, A.y);
  const wB = await worldAt(page, B.x, B.y);
  check(await traceLine(page, A, B), '« Tracer la ligne moi-même » : la carte attend les deux bouts');
  await shot(page, 'command-S4-1280x720');
  const expWidth = Math.hypot(wB.x - wA.x, wB.z - wA.z);
  const expHeading = Math.atan2(wB.z - wA.z, -(wB.x - wA.x));
  let oa = await order(page, g2[0]);
  let ob = await order(page, g2[1]);
  check(oa.type === 'ligne' && ob.type === 'ligne', `ordre « ligne » reçu par les deux groupes (${oa.type}, ${ob.type})`);
  near(oa.width + ob.width, expWidth, 0.6, 'ligne partagée : la somme des largeurs vaut la longueur tracée');
  near(oa.width, expWidth / 2, 0.6, 'ligne partagée : effectifs égaux, largeurs égales');
  angleNear(oa.heading, expHeading, 0.02, 'cap de la ligne : perpendiculaire au tracé, flanc gauche au premier clic');
  angleNear(ob.heading, expHeading, 0.02, 'cap identique pour le second groupe');
  near((oa.x + ob.x) / 2, (wA.x + wB.x) / 2, 0.6, 'centre de la ligne (x) au milieu du tracé');
  near((oa.z + ob.z) / 2, (wA.z + wB.z) / 2, 0.6, 'centre de la ligne (z) au milieu du tracé');
  check(oa.issuedBy === I.player && oa.maxForce === 1, `ordre signé du joueur, force plafonnée au niveau autorisé (issuedBy ${oa.issuedBy}, maxForce ${oa.maxForce})`);
  // les deux tronçons sont jointifs et rangés de gauche à droite sans croisement
  const rx = -Math.cos(expHeading), rz = Math.sin(expHeading);
  const pa = (oa.x - wA.x) * rx + (oa.z - wA.z) * rz;
  const pb = (ob.x - wA.x) * rx + (ob.z - wA.z) * rz;
  near(Math.abs(pa - pb), expWidth / 2, 0.6, 'tronçons jointifs (écart des centres = demi-longueur)');
  t = await tac(page);
  check(!t.tracing && t.mode === 'idle', 'après l\'ordre, la carte n\'attend plus de tracé');
  const s4 = await textOf(page, '.ct-mount-card');
  check(/ORDRE DONNÉ/.test(s4) && /Annuler l.ordre/.test(s4), `S4 : « ✓ ORDRE DONNÉ » et « Annuler l’ordre » dans la fiche (${s4.slice(0, 120)})`);
  check(!(await notices(page)).some((n) => /ordre transmis/.test(n)), 'pas de message « ordre transmis » par-dessus la carte (S4 le remplace)');
  check(await page.evaluate(() => window.__cmd.command.issued.length >= 2), 'ordres tracés dans le journal de l\'interface');
  const log1 = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-2).map((m) => m.text));
  check(log1.some((x) => /Ligne de barrage/.test(x) && /PARLEZ/.test(x)), `compte rendu radio de l'ordre (${log1[log1.length - 1]})`);
  await shot(page, 'command-tactique-ligne-1280x720');
  await settle(page, 2400);
  await rest(page);

  // ── « Mes unités » → fiche d'une section → « L'envoyer ailleurs… » → ligne tracée (centre, cap, largeur exacts) ──
  await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(un.x, un.z, 0.5);
  }, I.sections[2]);
  await settle(page, 400);
  check(await clickEl(page, `[data-id="follow-u-${I.sections[2]}"]`), '« Mes unités » : la rangée de la section 3');
  t = await tac(page);
  check(t.card && t.card.kind === 'unite' && t.card.squadId === I.sections[2], 'clic dans « Mes unités » : la fiche de la section');
  check(await cardLine(page, /^L.envoyer ailleurs/), '« L’envoyer ailleurs… »');
  t = await tac(page);
  check(t.where && t.who && JSON.stringify(t.who.ids) === JSON.stringify([I.sections[2]]), `« OÙ L’ENVOYER ? » : Qui fixé sur la section (${JSON.stringify(t.who)})`);
  u = await unit(page, I.sections[2]);
  p = await mapPoint(page, u.x, u.z);
  const C = { x: p.x + 40, y: p.y + 120 }, D = { x: p.x + 40, y: p.y + 20 };
  const sp2 = await spot(page, p.x + 110, p.y + 70);
  await page.mouse.click(sp2.x, sp2.y);
  await settle(page);
  const wC = await worldAt(page, C.x, C.y), wD = await worldAt(page, D.x, D.y);
  check(await traceLine(page, C, D), 'fiche du lieu, Qui fixé : « Tracer la ligne moi-même »');
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
  await settle(page, 2400);
  await rest(page);

  // ── cercle serré : la règle est dite avant l'envoi ; centre au lieu, rayon par défaut, sortie à l'opposé ──
  check(await clickEl(page, `[data-id="follow-u-${I.sections[2]}"]`) && await cardLine(page, /^L.envoyer ailleurs/), 'section 3 : « L’envoyer ailleurs… »');
  const sp3 = await spot(page, p.x - 130, p.y - 60);
  await page.mouse.click(sp3.x, sp3.y);
  await settle(page);
  check(await clickEl(page, '[data-id="card-line-0"]'), '« Autres ordres ici… »');
  const ruleText = await hoverLine(page, /^Encercler en cercle serré/);
  check(/issue/i.test(ruleText) || /sortie/i.test(ruleText), `règle de la nasse dite avant l'envoi (${ruleText.slice(0, 160)}…)`);
  const wN0 = (await tac(page)).card;
  check(await cardLine(page, /^Encercler en cercle serré/), '« Encercler en cercle serré ici »');
  // ordre coercitif permis avant la dernière sommation (⚖) : S3 le dit, « Donner l'ordre quand même »
  const s3e = await textOf(page, '.ct-mount-card');
  check((await tac(page)).sheet === 'confirm' && /avant la dernière sommation/.test(s3e), `cercle serré (⚖) : S3 avant l'envoi (${s3e.slice(0, 140)})`);
  check(await clickEl(page, '[data-id="card-confirm"]'), '« Donner l’ordre quand même »');
  await settle(page);
  o = await order(page, I.sections[2]);
  check(o.type === 'encercler', `ordre « encercler » (${o.type})`);
  near(o.x, wN0.x, 0.3, 'cercle serré : centre x (le lieu de la fiche)');
  near(o.z, wN0.z, 0.3, 'cercle serré : centre z');
  near(o.width, 36, 0.5, 'cercle serré : diamètre par défaut (rayon 18 m)');
  angleNear(o.heading, Math.atan2(wN0.x - u.x, wN0.z - u.z), 0.05, 'cercle serré : sortie à l\'opposé de l\'unité');
  await settle(page, 400);
  await shot(page, 'command-tactique-nasse-1280x720');
  await settle(page, 2000);
  await rest(page);

  // ── gestes experts : double clic = toute la section ; clic droit = « Avancer en formation » ; glisser droit = ligne ──
  await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(un.x, un.z, 0.16);
  }, I.sections[3]);
  await settle(page, 400);
  u = await unit(page, I.groups[3][0]);
  p = await mapPoint(page, u.x, u.z);
  await page.mouse.dblclick(p.x, p.y);
  await settle(page);
  const sel4 = await selection(page);
  check(I.groups[3].every((g) => sel4.includes(g)), `double clic sur un groupe : toute sa section choisie (${sel4})`);
  await rest(page);
  await page.evaluate((keys) => window.__cmd.tactical().state.setSelection(keys), I.groups[3]);
  await page.evaluate((key) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(key);
    b.tactical().map.jumpTo(un.x, un.z, 0.5);
  }, I.sections[3]);
  await settle(page, 400);
  u = await unit(page, I.sections[3]);
  p = await mapPoint(page, u.x, u.z);
  const Rp = { x: p.x - 120, y: p.y - 40 };
  const wR = await worldAt(page, Rp.x, Rp.y);
  await page.mouse.click(Rp.x, Rp.y, { button: 'right' });
  await settle(page);
  const adv = await Promise.all(I.groups[3].map((id) => order(page, id)));
  check(adv.every((x) => x.type === 'avancer'), `clic droit : « avancer » pour les unités choisies (${adv.map((x) => x.type)})`);
  near(adv.reduce((a, x) => a + x.x, 0) / adv.length, wR.x, 1.5, 'avancer : x du point désigné (unités côte à côte)');
  near(adv.reduce((a, x) => a + x.z, 0) / adv.length, wR.z, 1.5, 'avancer : z du point désigné');
  angleNear(adv[0].heading, Math.atan2(wR.x - u.x, wR.z - u.z), 0.08, 'avancer : cap de l\'unité vers le point');
  const E = { x: p.x - 90, y: p.y + 90 }, F = { x: p.x + 30, y: p.y + 90 };
  const wE = await worldAt(page, E.x, E.y), wF = await worldAt(page, F.x, F.y);
  await drag(page, E, F, { button: 'right' });
  await settle(page);
  const dl = await Promise.all(I.groups[3].map((id) => order(page, id)));
  check(dl.every((x) => x.type === 'ligne'), `glisser au bouton droit : ligne directe (${dl.map((x) => x.type)})`);
  near(dl.reduce((a, x) => a + x.width, 0), Math.hypot(wF.x - wE.x, wF.z - wE.z), 0.5, 'ligne directe : largeur (somme des tronçons)');
  angleNear(dl[0].heading, Math.PI, 0.03, 'tracé ouest → est : face au nord');

  // ── cadre de sélection (Maj + glisser) ──
  await page.evaluate(() => {
    const b = window.__cmd;
    b.tactical().state.clearSelection();
    const un = b.maps.scene.unitModel.get(b.scenario.sections[1].id);
    b.tactical().map.jumpTo(un.x, un.z, 0.15);
  });
  await settle(page, 500);
  u = await unit(page, I.sections[1]);
  p = await mapPoint(page, u.x, u.z);
  await drag(page, { x: p.x - 110, y: p.y - 110 }, { x: p.x + 110, y: p.y + 110 }, { shift: true, shot: 'command-tactique-cadre-1280x720' });
  await settle(page);
  const boxed = await selection(page);
  check(I.groups[1].every((g) => boxed.includes(g)), `Maj + glisser : les trois groupes de la section 2 sont choisis (${boxed})`);
  check(await page.evaluate(() => window.__cmd.tactical().state.tool === 'main'), 'après le cadre, l\'outil revient à la main');

  // ── « Toute la compagnie » (T), liste Qui à cases (S2), couches de la carte ──
  await page.evaluate(() => window.__cmd.tactical().state.clearSelection());
  const sp4 = await spot(page, p.x + 60, p.y - 120);
  await page.mouse.click(sp4.x, sp4.y);
  await settle(page);
  check(await clickEl(page, '[data-id="card-who-all"]'), 'bouton « Toute la compagnie »');
  t = await tac(page);
  check(t.whole && t.who && JSON.stringify(t.who.ids) === JSON.stringify([I.company]) && /compagnie/i.test(t.who.label), `« Toute la compagnie » : Qui = la compagnie elle-même (${JSON.stringify(t.who)})`);
  await clickEl(page, '[data-id="card-who-all"]');
  check(!(await tac(page)).whole, 'T encore : retour à la proposition du jeu');
  check(await clickEl(page, '[data-id="card-who"]'), 'clic sur le nom de Qui : la liste');
  t = await tac(page);
  check(t.sheet === 'qui', `liste « Qui envoyer ? » ouverte (${t.sheet})`);
  const rowsQ = await page.evaluate(() => document.querySelectorAll('[data-id^="who-row-"]').length);
  check(rowsQ >= 2 && rowsQ <= 7, `liste Qui : au plus sept rangées (${rowsQ})`);
  await shot(page, 'command-S2-1280x720');
  await clickEl(page, '[data-id="who-tick-1"]');
  await clickEl(page, '[data-id="who-tick-2"]');
  check(await clickEl(page, '[data-id="who-ok"]'), 'cases cochées : « Valider »');
  t = await tac(page);
  check(t.sheet === 'card' && t.who && t.who.ids.length >= 2, `deux rangées cochées : Qui = leurs unités ensemble (${JSON.stringify(t.who)})`);
  await rest(page);
  check(await clickEl(page, '[data-id="tac-more"]') && await clickEl(page, '[data-id="more-affichage"]'), '« Plus… › Affichage de la carte »');
  check(await clickEl(page, '[data-id="layer-crowd"]'), 'couche « Foule »');
  check(await page.evaluate(() => window.__cmd.tactical().map.overlay.layers.crowd === false), 'couches : la foule peut être masquée');
  await clickEl(page, '[data-id="layer-crowd"]');
  await page.keyboard.press('Escape');
  await settle(page, 200);
  t = await tac(page);
  check(t.sheet === 'more' && (await stack(page)).includes('carte_tactique'), `Échap : retour au menu « Plus… », la carte reste ouverte (${t.sheet})`);
  await page.keyboard.press('Escape');
  await settle(page, 200);
  check((await tac(page)).sheet === 'none' && (await stack(page)).includes('carte_tactique'), 'Échap encore : « Plus… » se referme, la carte reste ouverte');

  // ── niveau de force : « Charger » 🔒 → étapes légales (S3), rien ne part ; « Cadre légal » : autoriser ; ⚖ quand même ──
  await page.evaluate(() => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(b.scenario.sections[1].id);
    b.tactical().map.jumpTo(un.x, un.z, 0.5);
  });
  await settle(page, 400);
  await page.evaluate((keys) => window.__cmd.tactical().state.setSelection(keys), I.groups[1]);
  u = await unit(page, I.sections[1]);
  p = await mapPoint(page, u.x, u.z);
  const sp5 = await spot(page, p.x + 60, p.y - 150);
  await page.mouse.click(sp5.x, sp5.y);
  await settle(page);
  const wT = (await tac(page)).card;
  const charge0 = await Promise.all(I.groups[1].map((id) => order(page, id)));
  // « Plus… › Tous les ordres › Charger » : la fiche s'ouvre sur cet ordre seul (O, la barre du bas est masquée par la fiche)
  await page.keyboard.press('KeyO');
  await frames(page, 3);
  check(await clickEl(page, '[data-id="more-ordres"]') && await clickEl(page, '[data-id="verb-charge"]'), '« Plus… › Tous les ordres › Charger »');
  t = await tac(page);
  check(/Charger/.test(t.lineLabel) && t.who && t.who.ids.length === 3, `fiche : « Charger » surlignée, Qui = les trois groupes (${t.lineLabel}, ${JSON.stringify(t.who)})`);
  check(/🔒/.test(await textOf(page, '.ct-mount-card')), 'ligne verrouillée (🔒) tant que la force de niveau 2 n\'est pas autorisée');
  await clickEl(page, '[data-id="card-send"]');
  t = await tac(page);
  const s3 = await textOf(page, '.ct-mount-card');
  check(t.sheet === 'confirm' && /autoriser/i.test(s3) && /Faire les étapes dans l.ordre/.test(s3), `S3 : les étapes légales listées (${s3.slice(0, 200)})`);
  await shot(page, 'command-S3-1280x720');
  const charge1 = await Promise.all(I.groups[1].map((id) => order(page, id)));
  check(charge1.every((x, i) => x.issuedAt === charge0[i].issuedAt), 'rien ne part avant la confirmation des étapes');
  await page.keyboard.press('Escape');
  await settle(page, 200);
  check((await tac(page)).sheet === 'card', 'Échap : retour à la fiche');
  check(await clickEl(page, '[data-id="tac-legal"]'), 'pastille légale : « Cadre légal »');
  const legal = await textOf(page, '[data-id="tac-legal-panel"]');
  check(/CADRE LÉGAL/i.test(legal) && /La loi permet/.test(legal) && !/niveau \d/i.test(legal), `« Cadre légal » en mots (${legal.slice(0, 120)})`);
  check(await page.evaluate(() => { const b = document.querySelector('[data-id="legal-sommation"]'); return !!b && b.getBoundingClientRect().width > 0; }), 'commandant de la force publique (écharpe) : « Faire la sommation suivante seulement » proposé');
  check(await clickEl(page, '[data-id="legal-force-2"]'), '« Autoriser : bâton et gazeuse »');
  await settle(page, 200);
  check(await page.evaluate(() => window.__cmd.ctx.law.roe.authorizedForce === 2), 'le commandant fixe la force autorisée au niveau 2 (ctx.law.authorize)');
  const forceLog = await page.evaluate(() => window.__cmd.ctx.radio.log.slice(-1)[0].text);
  check(/autoris/i.test(forceLog), `autorisation annoncée à la radio (${forceLog})`);
  await page.keyboard.press('Escape');
  await settle(page, 200);
  // (le pointeur resté où était « Autoriser » survolerait une ligne de la fiche revenue : on l'écarte de la colonne)
  await page.mouse.move(20, 400);
  await frames(page, 3);
  t = await tac(page);
  check(t.sheet === 'card' && /Charger/.test(t.lineLabel), `« Cadre légal » refermé : la fiche revient, « Charger » surlignée (${t.sheet} : ${t.lineLabel} / ${t.lines.join(' | ')})`);
  check(!/🔒/.test(await textOf(page, '.ct-mount-card')) && /⚖/.test(await textOf(page, '.ct-mount-card')), '« Charger » permise, avant la dernière sommation (⚖)');
  await clickEl(page, '[data-id="card-send"]');
  const s3b = await textOf(page, '.ct-mount-card');
  check((await tac(page)).sheet === 'confirm' && /avant la dernière sommation/.test(s3b), `S3 : « L’ordre part avant la dernière sommation : vous en répondrez. » (${s3b.slice(0, 160)})`);
  check(await clickEl(page, '[data-id="card-confirm"]'), '« Donner l’ordre quand même »');
  await settle(page);
  const charged = await Promise.all(I.groups[1].map((id) => order(page, id)));
  check(charged.every((c) => c.type === 'charge' && c.maxForce === 2), `charge ordonnée aux trois groupes, force 2 (${charged.map((c) => c.type + '/' + c.maxForce)})`);
  near(charged.reduce((a, c) => a + c.x, 0) / 3, wT.x, 1.5, 'charge : les trois points sont répartis autour du lieu (x)');
  near(charged.reduce((a, c) => a + c.z, 0) / 3, wT.z, 1.5, 'charge : idem (z)');
  await settle(page, 2400);
  await rest(page);

  // ── ordre immédiat : « Tenir sa position » (fiche de l'unité) ──
  u = await unit(page, I.groups[1][0]);
  await page.evaluate((key) => { const b = window.__cmd; const un = b.maps.scene.unitModel.get(key); b.tactical().map.jumpTo(un.x, un.z, 0.16); }, I.sections[1]);
  await settle(page, 400);
  u = await unit(page, I.groups[1][0]);
  p = await mapPoint(page, u.x, u.z);
  await page.mouse.click(p.x, p.y);
  await settle(page);
  check(await cardLine(page, /^Tenir sa position$/), 'fiche du groupe : « Tenir sa position »');
  await settle(page);
  check((await order(page, I.groups[1][0])).type === 'tenir', 'ordre immédiat « tenir » transmis');
  // « Annuler l'ordre » (X, 5 s) : « cesser » aux mêmes unités
  await page.keyboard.press('KeyX');
  await settle(page, 200);
  check((await order(page, I.groups[1][0])).type === 'cesser', `X : « Annuler l’ordre » = « cesser » à la même unité (${(await order(page, I.groups[1][0])).type})`);
  await settle(page, 2400);
  await rest(page);

  // ── incidents : « À traiter », « Plus… › Tous les incidents », glisser-déposer, délégation, fiche d'un incident ──
  const todo = await page.evaluate(() => [...document.querySelectorAll('[data-id^="todo-"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ')));
  check(todo.length >= 1 && todo.length <= 3, `« À traiter » : au plus trois rangées (${todo.length} : ${todo.join(' | ')})`);
  check(/feu/i.test(todo[0] ?? '') && /v[ée]hicule/i.test(todo[0] ?? ''), `le plus urgent en tête de « À traiter » (${todo[0]})`);
  check(await clickEl(page, '[data-id="tac-more"]') && await clickEl(page, '[data-id="tab-incidents"]'), '« Plus… › Tous les incidents et secours »');
  await settle(page, 400);
  const incs = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.ct-inc')).map((r) => Number(r.dataset.incident));
    const api = window.__cmd.scenario.incidents;
    return rows.map((id) => { const i = api.get(id); return { id, kind: i.kind, urgency: i.urgency, state: i.state, x: i.x, z: i.z }; });
  });
  check(incs.length === 6, `six incidents listés (${incs.length})`);
  check(incs.every((x, i) => i === 0 || incs[i - 1].urgency >= x.urgency), `liste triée par urgence décroissante (${incs.map((x) => x.urgency).join(',')})`);
  check(incs[0].kind === 'feu_vehicule', `le plus urgent en tête (${incs[0].kind})`);
  // glisser le feu de poubelles sur le groupe 2 ALFA (vue recadrée pour voir les deux)
  const feu = incs.find((x) => x.kind === 'feu_poubelle');
  await page.evaluate(([id, k]) => {
    const b = window.__cmd;
    const inc = b.scenario.incidents.get(id);
    const un = b.maps.scene.unitModel.get(k);
    b.tactical().state.clearSelection();
    b.tactical().map.jumpTo((inc.x + un.x) / 2, (inc.z + un.z) / 2, 0.2);
  }, [feu.id, I.groups[1][0]]);
  await settle(page, 500);
  const row = await page.evaluate((id) => {
    const e = document.querySelector(`[data-id="incident-${id}"]`);
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect();
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
  await page.evaluate(([id, k]) => {
    const b = window.__cmd;
    const i = b.scenario.incidents.get(id);
    const un = b.maps.scene.unitModel.get(k);
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
  if (!(await page.evaluate(() => window.__cmd.tactical().state.sheet === 'more'))) await clickEl(page, '[data-id="tac-more"]');
  await clickEl(page, '[data-id="tab-incidents"]');
  await settle(page, 300);
  await clickEl(page, `[data-id="incident-${incs[0].id}"]`);
  await settle(page, 300);
  await clickEl(page, `[data-id="delegate-${incs[0].id}-canon_eau"]`);
  await settle(page, 300);
  inc = await page.evaluate((id) => { const i = window.__cmd.scenario.incidents.get(id); return { state: i.state, means: i.means, squadId: i.squadId }; }, incs[0].id);
  check(inc.means === 'canon_eau' && inc.squadId === I.neptune, `véhicule en feu confié au canon à eau (${JSON.stringify(inc)})`);
  // moyen inadapté : le Centaure n'éteint pas un feu
  const bad = await page.evaluate(([id, sq]) => window.__cmd.scenario.incidents.assign(id, 'centaure', sq), [incs[0].id, I.centaure]);
  check(bad === false, 'réalisme des moyens : le Centaure ne peut pas être chargé d\'un feu');
  await shot(page, 'command-tactique-incidents-1280x720');
  await rest(page);

  // ── secours : clic près du véhicule en feu → sa fiche → « Envoyer les pompiers » ; suivi de l'arrivée ──
  await page.evaluate((id) => { const b = window.__cmd; const i = b.scenario.incidents.get(id); b.tactical().map.jumpTo(i.x, i.z, 0.4); }, incs[0].id);
  await settle(page, 400);
  const hp = await mapPoint(page, incs[0].x, incs[0].z);
  await page.mouse.click(hp.x + 18, hp.y + 10);
  await settle(page, 400);
  t = await tac(page);
  check(t.card && t.card.kind === 'incident' && t.card.incidentId === incs[0].id, `clic près du feu : la fiche de l'incident (accroche 40 px) (${JSON.stringify(t.card)})`);
  check(t.lines.some((l) => /^Retirer l.affectation$/.test(l)), `incident confié : « Retirer l’affectation » proposé (${t.lines.join(' | ')})`);
  check(/confié/i.test(await textOf(page, '.ct-mount-card')), 'en-tête : à qui l\'incident est confié');
  check(await cardLine(page, /^Envoyer les pompiers/), '« Envoyer les pompiers »');
  await settle(page, 400);
  let calls = await page.evaluate(() => window.__cmd.scenario.rescue.calls.map((c) => ({ kind: c.kind, state: c.state, eta: c.eta, x: c.x, z: c.z, incidentId: c.incidentId })));
  check(calls.length === 1 && calls[0].kind === 'pompiers' && calls[0].eta > 30, `pompiers appelés (${JSON.stringify(calls)})`);
  // l'appel est lié à l'incident : c'est là que les secours interviennent
  check(calls[0] && calls[0].incidentId === incs[0].id, 'l\'appel est lié au feu');
  near(calls[0].x, incs[0].x, 0.5, 'point d\'intervention des secours (x, à l\'incident)');
  await rest(page);
  await clickEl(page, '[data-id="tac-more"]');
  await clickEl(page, '[data-id="tab-incidents"]');
  await settle(page, 300);
  check(await page.evaluate(() => { const c = document.querySelector('.ct-call'); return !!c && /Pompiers/.test(c.textContent) && /\d:\d\d/.test(c.textContent); }), 'suivi de l\'arrivée affiché (état et délai)');
  await page.evaluate(() => window.__cmd.game.step(12));
  await settle(page, 500);
  calls = await page.evaluate(() => window.__cmd.scenario.rescue.calls.map((c) => ({ state: c.state, eta: c.eta })));
  check(calls[0].state === 'en_route' && calls[0].eta < 70, `les secours sont en route, le délai décroît (${JSON.stringify(calls[0])})`);
  await shot(page, 'command-tactique-secours-1280x720');
  await rest(page);

  // ── circulation : fermer une rue (fiche de la rue), rouvrir (« Plus… › Circulation »), fermer un quartier ──
  const before2 = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
  // on vise le milieu d'une rue voisine de la section 3
  const road = await page.evaluate((k) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(k);
    b.tactical().map.jumpTo(un.x, un.z, 0.6);
    const sm = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    b.ctx.world.nearestRoad(un.x + 70, un.z + 40, sm, 120);
    return sm;
  }, I.sections[2]);
  await settle(page, 500);
  p = await mapPoint(page, road.x, road.z);
  const onRoad = await spot(page, p.x, p.y, ['rue'], { max: 60, edge: road.edgeId });
  check(!!onRoad, `la rue est désignable au pointeur (${road.name || 'voie'})`);
  await page.mouse.move(onRoad.x, onRoad.y);
  await frames(page, 4);
  await shot(page, 'command-tactique-fermeture-apercu-1280x720');
  await page.mouse.click(onRoad.x, onRoad.y);
  await settle(page, 400);
  t = await tac(page);
  check(t.card && t.card.kind === 'rue' && t.lines[0] === 'Barrer la rue' && t.lines[1] === 'Barrer la rue, passants admis', `fiche de la rue : « Barrer la rue », « … passants admis » (${t.lines.join(' | ')})`);
  check(await cardLine(page, /^Fermer aux voitures \(barrières\)$/), '« Fermer aux voitures (barrières) »');
  await settle(page, 400);
  let cl = await page.evaluate(() => window.__cmd.scenario.traffic.closures.map((c) => ({ id: c.id, edgeId: c.edgeId })));
  check(cl.length === before2 + 1 && cl[cl.length - 1].edgeId === road.edgeId, `rue fermée par la fiche (${road.name || 'voie'} : arête ${road.edgeId})`);
  await shot(page, 'command-tactique-fermeture-1280x720');
  await settle(page, 2400);
  await rest(page);
  check(await clickEl(page, '[data-id="tac-more"]') && await clickEl(page, '[data-id="tab-circulation"]'), '« Plus… › Circulation et métro »');
  check(await clickEl(page, `[data-id="reopen-${cl[cl.length - 1].id}"]`), '« Rouvrir »');
  await settle(page, 300);
  check(await page.evaluate(() => window.__cmd.scenario.traffic.closures.length) === before2, 'rue rouverte depuis la liste');
  check(await clickEl(page, '[data-id="tac-close-area-100"]'), '« Fermer un quartier aux voitures : 100 m »');
  await settle(page, 400);
  const afterArea = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
  check(afterArea >= before2 + 2, `quartier fermé : ${afterArea - before2} accès fermés`);
  await shot(page, 'command-tactique-perimetre-1280x720');
  await rest(page);

  // ── métro : fiche de la station sur la carte, fermeture, réouverture, filtrage par Qui ──
  const station = await page.evaluate(() => {
    const b = window.__cmd;
    const st0 = b.scenario.metro.stations[0];
    b.tactical().map.jumpTo(st0.x, st0.z, 0.7);
    return { id: st0.id, name: st0.name, x: st0.x, z: st0.z };
  });
  await settle(page, 500);
  p = await mapPoint(page, station.x, station.z);
  await page.mouse.click(p.x, p.y);
  await settle(page, 300);
  t = await tac(page);
  check(t.card && t.card.kind === 'metro', `fiche de la station ${station.name} ouverte au clic (${t.card && t.card.kind})`);
  await shot(page, 'command-tactique-metro-1280x720');
  check(await cardLine(page, /^Fermer la station$/), '« Fermer la station »');
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).open === false, station.id), 'station fermée (MetroApi.setOpen)');
  // « ✓ ORDRE DONNÉ » (2 s) puis la fiche se referme ; la station touchée de nouveau propose « Rouvrir la station »
  await settle(page, 2600);
  await page.mouse.click(p.x, p.y);
  await settle(page, 300);
  check(await cardLine(page, /^Rouvrir la station$/), 'la fiche propose ensuite « Rouvrir la station »');
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).open === true, station.id), 'station rouverte');
  await settle(page, 2600);
  await page.mouse.click(p.x, p.y);
  await settle(page, 300);
  check(await cardLine(page, /^Filtrer la sortie$/), '« Filtrer la sortie »');
  await settle(page, 300);
  check(await page.evaluate((id) => window.__cmd.scenario.metro.get(id).filtered === true, station.id), 'sortie filtrée par l\'unité proposée (MetroApi.setFiltered)');
  await settle(page, 2400);
  await rest(page);

  // ── journal (J) ──
  await page.keyboard.press('KeyJ');
  await settle(page, 400);
  const msgs = await page.evaluate(() => document.querySelectorAll('.ct-msg').length);
  check(msgs >= 8, `journal radio (J) : ${msgs} messages horodatés`);
  await shot(page, 'command-tactique-journal-1280x720');
  await rest(page);

  // ── « Mes unités » (S5) : ce que fait chaque unité, en mots simples ──
  const units = await textOf(page, '[data-id="tac-units"]');
  check(units.length > 0 && !/[A-Z]{3,}_[A-Z_]+|INITIATIVE/.test(units), `« Mes unités » sans type brut ni « INITIATIVE » (${units.slice(0, 160)})`);
  await shot(page, 'command-S5-1280x720');

  // ── temps ralenti ──
  await click(page, 'tac-slow');
  check(await page.evaluate(() => window.__cmd.ctx.clock.timeScale === 0.25), 'temps ralenti : horloge à 0,25');
  check(await key(page, 'Tab', 'carte_tactique', false), 'Tab referme la carte de commandement');
  check(await page.evaluate(() => window.__cmd.ctx.clock.timeScale === 1), 'horloge rétablie à la fermeture');

  // ── exécution : l'ordre reste affiché jusqu'à l'arrivée, puis compte rendu ──
  await page.evaluate(() => { window.__cmd.scenario.aiEnabled = true; });
  await key(page, 'Tab', 'carte_tactique', true);
  await settle(page, 500);
  await page.evaluate((k) => {
    const b = window.__cmd;
    const un = b.maps.scene.unitModel.get(k);
    b.tactical().state.setSelection([k]);
    b.tactical().map.jumpTo(un.x, un.z, 0.4);
  }, I.sections[3]);
  await settle(page, 400);
  u = await unit(page, I.sections[3]);
  p = await mapPoint(page, u.x, u.z);
  const sp6 = await spot(page, p.x + 150, p.y + 60);
  await page.mouse.click(sp6.x, sp6.y);
  await settle(page, 300);
  // ligne 2 de la fiche d'un point ; dans « Autres ordres ici… » pour une rue
  check(await cardLine(page, /^Avancer en formation jusqu.ici$/) || await otherLine(page, /^Avancer en formation jusqu.ici$/), '« Avancer en formation jusqu’ici »');
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
  info.push(`carte de commandement 1280×720 : interface ${perf['ui:banc'].toFixed(2)} ms par image en moyenne (écran compris), ${perf.base} dessins complets du fond pour ${perf.draws} dessins de la carte`);
  await browser.close();
}

// ══════════════════════════════════ RÔLES ══════════════════════════════════
async function roles() {
  console.log('— rôles et étendue du commandement');
  // commissaire : autorité habilitée, sommations (« Cadre légal », L)
  {
    const { browser, page } = await open('role=commissaire&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    const sc = await page.evaluate(() => { const s = window.__cmd.command.scope(); return { level: s.level, canSommation: s.canSommation, canAuthorize: s.canAuthorize, n: s.squadIds.size }; });
    check(sc.level === 'tout' && sc.canSommation && sc.canAuthorize, `commissaire : tout le dispositif, sommations et autorisation (${JSON.stringify(sc)})`);
    await page.keyboard.press('KeyL');
    await frames(page, 3);
    check((await tac(page)).sheet === 'legal', 'L : « Cadre légal »');
    for (let i = 1; i <= 3; i++) {
      await clickEl(page, '[data-id="legal-sommation"]');
      await settle(page, 250);
      check(await page.evaluate((n) => window.__cmd.ctx.law.roe.sommation === n, i), `« Faire la sommation suivante seulement » : étape ${i}`);
    }
    const last = await page.evaluate(() => {
      const one = document.querySelector('[data-id="legal-sommation"]');
      const all = document.querySelector('[data-id="legal-sommations"]');
      return { one: !!one && one.getBoundingClientRect().width > 0 && !one.disabled, all: all ? all.innerText.replace(/\s+/g, ' ') : '' };
    });
    check(!last.one && /Sommations faites/.test(last.all), `après la dernière sommation : plus de sommation à faire, « Sommations faites » (${JSON.stringify(last)})`);
    check(await page.evaluate(() => window.__cmd.ctx.law.roe.lawfulForce === 3), 'force licite passée au niveau 3 après la dernière sommation');
    const chip = await textOf(page, '[data-id="tac-legal"]');
    check(/Sommations faites|Sommations 3\/3/.test(chip) && !/Force : \d/.test(chip), `pastille légale à jour, en mots (${chip})`);
    await shot(page, 'command-tactique-commissaire-1280x720');
    await browser.close();
  }
  // chef de groupe : son groupe seulement
  {
    const { browser, page } = await open('role=chef_groupe&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    await dismissModel(page);
    const I = await ids(page);
    const sc = await page.evaluate(() => { const s = window.__cmd.command.scope(); return { level: s.level, ids: Array.from(s.squadIds), own: s.ownSquadId, canAuthorize: s.canAuthorize, canMetro: s.canMetro }; });
    check(sc.level === 'unite' && sc.ids.length === 1 && sc.ids[0] === I.groups[1][0] && !sc.canAuthorize && !sc.canMetro, `chef de groupe : son groupe seulement (${JSON.stringify(sc)})`);
    // une autre unité : sa fiche n'a aucun ordre pour elle (« pas sous vos ordres »)
    const other = I.groups[0][0];
    const prev = await order(page, other);
    await page.evaluate((k) => { const b = window.__cmd; const un = b.maps.scene.unitModel.get(k); b.tactical().map.jumpTo(un.x, un.z, 0.16); }, other);
    await settle(page, 400);
    let u = await unit(page, other);
    let p = await mapPoint(page, u.x, u.z);
    await page.mouse.click(p.x, p.y);
    await settle(page);
    let t = await tac(page);
    check(t.card && t.card.kind === 'cible' && !t.lines.some((l) => /Tenir sa position|L.envoyer ailleurs/.test(l)), `une unité hors de son commandement : fiche « pas sous vos ordres », sans ordre pour elle (${t.card && t.card.kind} : ${t.lines.join(' | ')})`);
    check((await order(page, other)).issuedAt === prev.issuedAt, 'aucun ordre pour une unité hors de son commandement');
    await rest(page);
    // son propre groupe : « Tenir sa position »
    await page.evaluate((k) => { const b = window.__cmd; const un = b.maps.scene.unitModel.get(k); b.tactical().map.jumpTo(un.x, un.z, 0.16); }, I.groups[1][0]);
    await settle(page, 400);
    u = await unit(page, I.groups[1][0]);
    p = await mapPoint(page, u.x, u.z);
    await page.mouse.click(p.x, p.y);
    await settle(page);
    check(await cardLine(page, /^Tenir sa position$/), 'fiche de son groupe : « Tenir sa position »');
    await settle(page);
    check((await order(page, I.groups[1][0])).type === 'tenir', 'ordre transmis à son propre groupe');
    await settle(page, 2400);
    await rest(page);
    // le T de la fiche s'appelle « Tout le groupe »
    const sp = await spot(page, p.x + 80, p.y - 60);
    await page.mouse.click(sp.x, sp.y);
    await settle(page);
    const whole = await textOf(page, '[data-id="card-who-all"]');
    check(whole === '' || /Tout le groupe/.test(whole), `bouton T : « Tout le groupe » pour un chef de groupe (${whole || 'absent : Qui est déjà son groupe'})`);
    await rest(page);
    // « Cadre légal » : ses ordres plafonnés, « Demander plus de force (radio) », pas de sommation
    await page.keyboard.press('KeyL');
    await frames(page, 3);
    const legal = await page.evaluate(() => ({
      request: !!document.querySelector('[data-id="legal-request"]') && document.querySelector('[data-id="legal-request"]').getBoundingClientRect().width > 0,
      sommation: !!document.querySelector('[data-id="legal-sommation"], [data-id="legal-sommations"]'),
      text: (document.querySelector('[data-id="tac-legal-panel"]')?.innerText || '').replace(/\s+/g, ' '),
    }));
    check(legal.request && /Demander plus de force/.test(legal.text), '« Demander plus de force (radio) » proposé au chef de groupe');
    check(!legal.sommation && /réservées au commissaire/.test(legal.text), 'pas de sommation pour un chef de groupe (non habilité)');
    check(/Mes ordres jusqu.à/.test(legal.text), `ses ordres plafonnés : « Mes ordres jusqu’à … » (${legal.text.slice(0, 160)})`);
    // pas de métro pour un chef de groupe dans « Plus… »
    await page.keyboard.press('Escape');
    await frames(page, 2);
    await clickEl(page, '[data-id="tac-more"]');
    const more = await page.evaluate(() => [...document.querySelectorAll('[data-id="tac-more-panel"] button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ')).join(' | '));
    check(!/métro/i.test(more), `« Plus… » d'un chef de groupe : sans le métro (${more.slice(0, 200)})`);
    await shot(page, 'command-tactique-chef-groupe-1280x720');
    await browser.close();
  }
  // CRS : lecture seule (S6)
  {
    const { browser, page } = await open('role=crs&freeze=1&ai=0&open=carte_tactique');
    await settle(page, 500);
    const r = await page.evaluate(() => ({
      level: window.__cmd.command.scope().level, units: window.__cmd.maps.scene.units.length,
      intents: [...document.querySelectorAll('[data-id^="intent-"]')].filter((b) => b.getBoundingClientRect().width > 0).length,
      chip: document.querySelector('[data-id="tac-legal"]')?.tagName ?? '',
      readonly: document.querySelector('[data-id="tactical"]').classList.contains('is-readonly'),
      crowd: window.__cmd.maps.scene.crowdCount,
    }));
    check(r.level === 'lecture' && r.readonly && r.intents === 0 && r.chip !== 'BUTTON', `CRS : lecture seule, ni intentions ni ordres, la pastille légale n'est qu'un affichage (${JSON.stringify(r)})`);
    check(r.units > 20 && r.crowd > 250, `CRS : il voit les unités (${r.units}) et la foule (${r.crowd})`);
    const btns = await visibleButtons(page);
    check(btns.length <= 4 && btns.includes('tac-close'), `CRS : Fermer, +, −, Moi seulement (${btns.join(', ')})`);
    await shot(page, 'command-S6-1280x720');
    // un clic sur la carte : une ligne d'information, jamais une fiche d'ordres
    const c = await page.evaluate(() => { const r0 = window.__cmd.tactical().map.canvas.getBoundingClientRect(); return { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 }; });
    await page.mouse.click(c.x, c.y);
    await settle(page);
    check(!(await tac(page)).card, 'CRS : un clic sur la carte n\'ouvre aucune fiche');
    await key(page, 'Tab', 'carte_tactique', false);
    // roue d'ordres réduite : « Suivez-moi à pied » (1), « Suivez-moi en véhicules » (2), « Secours ici » (7)
    await page.keyboard.down('KeyF');
    await untilStack(page, 'roue_ordres', true);
    await frames(page, 3);
    const w = await page.evaluate(() => ({
      labels: Array.from(document.querySelectorAll('.cw-label')).map((e) => e.textContent),
      keys: Array.from(document.querySelectorAll('.cw-key')).map((e) => e.textContent),
    }));
    const lab = w.labels.map((x) => (x || '').replace(/\s+/g, ''));
    check(lab.length === 2 && lab[0] === 'Avecmoi' && lab[1] === 'Secoursici' && w.keys.join(',') === '1,7',
      `roue d'ordres d'un CRS : « Avec moi » (1) et « Secours ici » (7), mêmes numéros que le chef (${JSON.stringify(w)})`);
    const wheelNt = await notices(page);
    check(!wheelNt.some((x) => /recevez les ordres/.test(x)), `roue d'ordres d'un CRS : plus de « vous recevez les ordres » (${JSON.stringify(wheelNt.slice(-3))})`);
    // appui LONG (plus d'un quart de seconde et de quatre images) : relâché trop tôt, c'est un appui bref et la
    // roue reste affichée — le scénario dépendait alors de la vitesse de la machine
    await settle(page, 400);
    await frames(page, 6);
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
    const log = await page.evaluate(() => window.__cmd.maps.scene.vis.radio.join(','));
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

  // ── roue d'ordres (7 secteurs, « Avec moi » d'abord) : touche maintenue, direction à la souris, relâchement ──
  const aim = await page.evaluate(() => { const s = window.__cmd.ctx.player.state; return { x: s.aimX, z: s.aimZ, yaw: s.camYaw }; });
  await page.keyboard.down('KeyF');
  check(await untilStack(page, 'roue_ordres', true), 'touche F maintenue : la roue d\'ordres s\'ouvre');
  await settle(page, 300);
  await shot(page, 'command-roue-1280x720');
  // (libellés sur deux lignes : comparés sans les espaces)
  const labels8 = await page.evaluate(() => Array.from(document.querySelectorAll('.cw-label')).map((e) => (e.textContent || '').replace(/\s+/g, '')));
  check(labels8.length === 7 && labels8[0] === 'Avecmoi' && labels8[1] === 'Envoyer' && labels8[2] === 'Bloquerunerue' && /^Plus/.test(labels8[6]), `roue du chef : sept secteurs, « Avec moi » en haut (${labels8.join(' | ')})`);
  // secteur « Envoyer » : le deuxième, en haut à droite (sens des aiguilles d'une montre depuis le haut, 7 secteurs)
  await page.mouse.move(640, 360);
  await page.mouse.move(726, 291, { steps: 4 });
  await settle(page, 200);
  check(await page.evaluate(() => /Envoyer/.test(document.querySelector('.cw-title').textContent)), `survol : secteur « Envoyer » surligné (${await page.evaluate(() => document.querySelector('.cw-title').textContent)})`);
  await shot(page, 'command-roue-survol-1280x720');
  await page.keyboard.up('KeyF');
  check(await untilStack(page, 'roue_ordres', false), 'relâchement : la roue se ferme');
  let o = await order(page, I.groups[1][0]);
  check(/^(avancer|colonne|faire_mouvement)$/.test(o.type) && o.issuedBy === I.player, `« Envoyer » : ordre de mouvement donné à son groupe (${o.type})`);
  // (le lieu désigné est le débouché de rue ou le carrefour le plus proche du point regardé : 60 m au plus)
  const sent = Math.hypot(o.x - aim.x, o.z - aim.z);
  check(sent <= 60, `roue : l'ordre vise le lieu regardé (${sent.toFixed(1)} m du point de visée)`);
  /** Centre (client) du secteur i d'une roue de n secteurs. */
  const wedgeAt = (i, n) => page.evaluate(([k, m]) => {
    const r = document.querySelector('.cw-svg').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, s = r.width / 320;
    const a = (k * (Math.PI * 2 / m)) - Math.PI / 2;
    return { x: cx + Math.cos(a) * 106 * s, y: cy + Math.sin(a) * 106 * s };
  }, [i, n]);
  // appui bref : la roue reste affichée ; un clic choisit
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 600);
  check((await stack(page)).includes('roue_ordres'), 'appui bref : la roue reste affichée');
  const wedge = await wedgeAt(2, 7); // troisième secteur : « Bloquer une rue »
  await page.mouse.click(wedge.x, wedge.y);
  const closedAfterChoice = await untilStack(page, 'roue_ordres', false);
  o = await order(page, I.groups[1][0]);
  check(/^(couper_circulation|ligne)$/.test(o.type) && o.issuedBy === I.player, `clic sur « Bloquer une rue » : ordre transmis (${o.type})`);
  const blockType = o.type;
  check(closedAfterChoice, 'la roue se ferme après le choix');
  // ordre de force non autorisé : « Plus… » (dernier secteur) puis « Charger » grisé — aucun ordre
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 300);
  const more = await wedgeAt(6, 7);
  await page.mouse.click(more.x, more.y);
  await settle(page, 300);
  const inner = await page.evaluate(() => Array.from(document.querySelectorAll('.cw-label')).map((e) => (e.textContent || '').replace(/\s+/g, '')));
  check(inner.some((x) => /Charger/.test(x)), `« Plus… » : la couronne intérieure (${inner.join(' | ')})`);
  const ci = inner.findIndex((x) => /Charger/.test(x));
  const w2 = await wedgeAt(ci, inner.length);
  await page.mouse.click(w2.x, w2.y);
  await settle(page, 300);
  check((await order(page, I.groups[1][0])).type === blockType, 'secteur « Charger » indisponible (force non autorisée) : aucun ordre');
  // Échap : de la couronne intérieure à la roue, puis la roue se ferme
  for (let i = 0; i < 2 && (await stack(page)).includes('roue_ordres'); i++) {
    await page.keyboard.press('Escape');
    await frames(page, 4);
  }
  check(await untilStack(page, 'roue_ordres', false), 'Échap ferme la roue');

  // ── roue d'ordres au clavier seul (Mac sans souris) : chiffres, flèches puis Entrée, ⌫ ──
  const held0 = await page.evaluate(() => { const p = window.__cmd.ctx.player.person(); return p ? p.active : -2; });
  const before0 = (await order(page, I.groups[1][0])).type;
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 300);
  const keysShown = await page.evaluate(() => Array.from(document.querySelectorAll('.cw-key')).map((e) => e.textContent));
  check(keysShown.join(' ') === '1 3 4 5 6 7 8', `chaque secteur affiche sa touche (${keysShown.join(' ')})`);
  check(await page.evaluate(() => /Chiffres, ou flèches puis Entrée/.test(document.querySelector('.cw-legend')?.textContent ?? '')), 'légende « Chiffres, ou flèches puis Entrée » sous la roue');
  await page.keyboard.press('ArrowUp');
  await frames(page, 3);
  check(await page.evaluate(() => /Avecmoi/.test(document.querySelector('.cw-title').textContent.replace(/\s+/g, ''))), '↑ : secteur « Avec moi » surligné');
  await page.keyboard.press('ArrowRight');
  await frames(page, 3);
  check(await page.evaluate(() => /Envoyer/.test(document.querySelector('.cw-title').textContent.replace(/\s+/g, ''))), '→ : secteur suivant (« Envoyer ») surligné');
  check(await key(page, 'Backspace', 'roue_ordres', false), '⌫ ferme la roue sans ordre');
  check((await order(page, I.groups[1][0])).type === before0, 'roue fermée au clavier : aucun nouvel ordre');
  await key(page, 'KeyF', 'roue_ordres', true);
  await settle(page, 300);
  await page.keyboard.press('Digit3');
  check(await untilStack(page, 'roue_ordres', false), 'chiffre 3 : la roue se ferme');
  await frames(page, 4);
  { const t3 = (await order(page, I.groups[1][0])).type; check(/^(avancer|colonne|faire_mouvement)$/.test(t3), `chiffre 3 : « Envoyer » transmis (${t3})`); }
  const held1 = await page.evaluate(() => { const p = window.__cmd.ctx.player.person(); return p ? p.active : -2; });
  check(held1 === held0, `le chiffre tapé dans la roue ne change pas l'objet en main (${held0} → ${held1})`);

  // ── carte de commandement au clavier seul : visée aux flèches, Maj + flèches, E (Envoyer), Entrée, L, H, Échap ──
  check(await key(page, 'Tab', 'carte_tactique', true), 'clavier : Tab ouvre la carte de commandement');
  await settle(page, 300);
  await frames(page, 3);
  const focus0 = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${a.className}#${a.dataset?.id ?? ''}` : 'null'; });
  check(focus0.endsWith('#tac-map'), `la carte a le focus à l'ouverture (${focus0})`);
  await page.keyboard.press('KeyH');
  await frames(page, 3);
  check(await page.evaluate(() => document.querySelector('[data-id="tac-help"]').classList.contains('is-on') && /Flèches/.test(document.querySelector('[data-id="tac-help"]').textContent)), 'H : l\'aide des touches');
  await page.keyboard.press('KeyH');
  await frames(page, 3);
  const vk0 = (await tac(page)).visee;
  await page.keyboard.press('ArrowRight');
  await frames(page, 3);
  const vk1 = (await tac(page)).visee;
  check(!!vk1 && (!vk0 || vk1.key !== vk0.key), `→ : la visée saute au repère voisin (${vk0 && vk0.name} → ${vk1 && vk1.name})`);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await settle(page, 250);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await frames(page, 2);
  check(await page.evaluate(() => window.__cmd.tactical().map.cursorOn && document.querySelector('.cm-cursor').classList.contains('is-on')), 'Maj + flèches : le curseur libre de la carte se déplace');
  const ord0 = await order(page, I.groups[1][0]);
  await page.keyboard.press('KeyE');
  await frames(page, 4);
  let tk = await tac(page);
  check(tk.intent === 'envoyer' && !!tk.card && tk.lineLabel !== '', `E : « Envoyer », la fiche du premier lieu proposé (${tk.card && tk.card.name} : ${tk.lineLabel})`);
  await settle(page, 700);
  await page.keyboard.press('Enter');
  await frames(page, 4);
  const ord1 = await order(page, I.groups[1][0]);
  check(ord1.issuedAt !== ord0.issuedAt && ord1.issuedBy === I.player, `Entrée : l'ordre part à son groupe (${ord0.type} → ${ord1.type})`);
  // une seconde Entrée aussitôt : rien (garde de 0,6 s)
  await page.keyboard.press('Enter');
  await frames(page, 3);
  check((await order(page, I.groups[1][0])).issuedAt === ord1.issuedAt, 'Entrée juste après un envoi : aucun second ordre');
  await settle(page, 2400);
  await rest(page);
  await page.keyboard.press('KeyL');
  await frames(page, 3);
  check((await tac(page)).sheet === 'legal', 'L : « Cadre légal »');
  await page.keyboard.press('ArrowDown');
  await frames(page, 3);
  check(await page.evaluate(() => !!document.querySelector('[data-id="tac-legal-panel"] button.is-hl')), 'flèches : on parcourt la liste du « Cadre légal »');
  await page.keyboard.press('Escape');
  await frames(page, 3);
  check((await tac(page)).sheet === 'none' && await page.evaluate(() => document.activeElement?.dataset.id === 'tac-map') && (await stack(page)).includes('carte_tactique'), 'Échap dans la liste : retour à la carte (sans la fermer)');
  check(await key(page, 'Escape', 'carte_tactique', false), 'Échap au repos : la carte se ferme');

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
  // adressée à l'autorité unique : le commandant de la compagnie (indicatif MISTRAL)
  check(/^(MISTRAL|AUTORITÉ) ICI/.test(last.text) && /emploi de la force/.test(last.text), `demande d'autorisation d'emploi de la force (${last.text})`);
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
// Correspondance du §5.1 : stick gauche = visée libre, croix = sauts de la visée, A = Entrée, B = Échap, X = U,
// Y = « Plus… », LB / RB = « À traiter » précédent / suivant, gâchettes = zoom.
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
  // Select (B8) ouvre le plan (table par défaut) : la carte de commandement s'ouvre par l'interface.
  await page.evaluate(() => window.__cmd.ctx.ui.open('carte_tactique'));
  await settle(page, 600);
  // stick gauche : le curseur apparaît et se déplace
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await settle(page, 400);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  await frames(page, 4);
  let c = await page.evaluate(() => { const m = window.__cmd.tactical().map; return { on: m.cursorOn, x: m.cursorX, y: m.cursorY, w: m.view.width, dev: window.__cmd.ctx.input.device }; });
  check(c.dev === 'gamepad' && c.on && c.x > c.w / 2 + 60, `stick gauche : curseur affiché et déplacé (${JSON.stringify(c)})`);
  check(await page.evaluate(() => document.activeElement === window.__cmd.tactical().map.canvas), 'en mode carte, le focus reste sur la carte (les directions pilotent la visée)');
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
  // la visée libre amenée sur la section 3 : A ouvre sa fiche
  const moveCursor = (sx, sy) => page.evaluate(([x, y]) => {
    const m = window.__cmd.tactical().map;
    m.cursorX = x;
    m.cursorY = y;
  }, [sx, sy]);
  await page.evaluate((key) => {
    const b = window.__cmd;
    const m = b.tactical().map;
    const u = b.maps.scene.unitModel.get(key);
    m.jumpTo(u.x + 30, u.z, 0.5);
  }, I.sections[2]);
  await settle(page, 300);
  let u = await page.evaluate((key) => { const b = window.__cmd; const un = b.maps.scene.unitModel.get(key); const p = b.tactical().map.screenOf(un.x, un.z); return { x: p.x, y: p.y }; }, I.sections[2]);
  // le stick bouge un peu (visée libre active), puis la visée est posée sur l'unité
  await page.evaluate(() => { window.__pad.axes[1] = 0.4; });
  await frames(page, 3);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  await moveCursor(u.x, u.y);
  await settle(page, 300);
  await tapPad(0);
  await settle(page, 300);
  let t = await tac(page);
  check(t.card && t.card.kind === 'unite' && t.card.squadId === I.sections[2], `bouton A sur une unité : sa fiche (${JSON.stringify(t.card)})`);
  // B : retour (la fiche se referme, la carte reste)
  await tapPad(1);
  await settle(page, 300);
  t = await tac(page);
  check(!t.card && (await stack(page)).includes('carte_tactique'), 'bouton B : la fiche se referme, la carte reste ouverte');
  // A sur un lieu libre : sa fiche ; X : Qui suivant ; A : l'ordre part à ce Qui
  const free = await page.evaluate(([x0, y0]) => {
    const t0 = window.__cmd.tactical();
    for (let rad = 60; rad <= 220; rad += 10) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = x0 + Math.cos(a) * rad, y = y0 + Math.sin(a) * rad;
        if (x < 40 || y < 40 || x > t0.map.view.width - 40 || y > t0.map.view.height - 40) continue;
        const st = t0.tmap.stackAt(x, y, false, true);
        if (st.length === 0 || st[0].kind === 'rue') return { x, y };
      }
    }
    return null;
  }, [u.x, u.y]);
  check(!!free, 'un lieu libre près de la section');
  await page.evaluate(() => { window.__pad.axes[1] = 0.4; });
  await frames(page, 3);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  await moveCursor(free.x, free.y);
  await settle(page, 300);
  await tapPad(0);
  await settle(page, 300);
  t = await tac(page);
  check(t.card && (t.card.kind === 'point' || t.card.kind === 'rue') && !!t.who, `A sur un lieu : sa fiche, Qui proposé (${t.card && t.card.kind}, ${t.who && t.who.label})`);
  const who0 = t.who ? t.who.label : '';
  await tapPad(2);
  await settle(page, 300);
  t = await tac(page);
  check(!!t.who && t.who.label !== who0, `X : Qui suivant (${who0} → ${t.who && t.who.label})`);
  const target = t.who ? t.who.ids : [];
  const before = await Promise.all(target.map((id) => order(page, id)));
  await settle(page, 700);
  await tapPad(0);
  await settle(page, 300);
  const after = await Promise.all(target.map((id) => order(page, id)));
  check(target.length > 0 && after.every((x, i) => x.issuedAt !== before[i].issuedAt && x.issuedBy === I.player), `A : « ${t.lineLabel} » part au Qui choisi (${after.map((x) => x.type).join(', ')})`);
  await settle(page, 2400);
  await rest(page);
  // Y : « Plus… » ; B le referme
  await tapPad(3);
  await settle(page, 300);
  check((await tac(page)).sheet === 'more', 'bouton Y : « Plus… »');
  await shot(page, 'command-tactique-manette-plus-1280x720');
  await tapPad(1);
  await settle(page, 300);
  check((await tac(page)).sheet === 'none' && (await stack(page)).includes('carte_tactique'), 'bouton B : « Plus… » se referme');
  // RB : « À traiter » suivant (la fiche de l'élément) ; LB : précédent
  await tapPad(5);
  await settle(page, 300);
  t = await tac(page);
  const first = t.card ? t.card.key : '';
  check(!!t.card && (t.card.kind === 'incident' || t.card.kind === 'proposition' || t.card.kind === 'nasse'), `RB : la fiche du premier « À traiter » (${t.card && t.card.name})`);
  await tapPad(5);
  await settle(page, 300);
  t = await tac(page);
  check(!!t.card && t.card.key !== first, `RB encore : l'élément suivant (${t.card && t.card.name})`);
  await tapPad(4);
  await settle(page, 300);
  t = await tac(page);
  check(!!t.card && t.card.key === first, 'LB : l\'élément précédent');
  await rest(page);
  // croix : la visée saute d'un repère à l'autre
  // (rien dans la direction : la carte défile d'un pas, comme aux flèches du clavier)
  // (Échap du clavier vient de servir : la manette reprend la main)
  await page.evaluate(() => { window.__pad.axes[1] = 0.4; });
  await frames(page, 3);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  await settle(page, 200);
  const v0 = (await tac(page)).visee;
  const vx0 = await page.evaluate(() => window.__cmd.tactical().map.view.cx);
  await tapPad(15);
  await settle(page, 200);
  const v1 = (await tac(page)).visee;
  const vx1 = await page.evaluate(() => window.__cmd.tactical().map.view.cx);
  check((!!v1 && (!v0 || v1.key !== v0.key)) || vx1 > vx0 + 1, `croix droite : la visée saute au repère voisin, ou la carte défile vers la droite (${v0 && v0.name} → ${v1 && v1.name} ; vue ${vx0.toFixed(0)} → ${vx1.toFixed(0)})`);
  await shot(page, 'command-tactique-manette-1280x720');
  // B au repos : la carte se ferme
  await tapPad(1);
  await settle(page, 300);
  check(!(await stack(page)).includes('carte_tactique'), 'bouton B au repos : la carte de commandement se ferme');
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
    /** Toucher au centre d'un élément visible ; null s'il est absent. */
    const tapId = async (id) => {
      const r = await page.evaluate((k) => {
        const e = [...document.querySelectorAll(`[data-id="${k}"]`)].find((x) => x.getBoundingClientRect().width > 0);
        if (!e) return null;
        e.scrollIntoView({ block: 'nearest' });
        const b = e.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
      }, id);
      if (!r) return null;
      await page.touchscreen.tap(r.x, r.y);
      await frames(page, 3);
      return r;
    };
    /** Toucher de la ligne de la fiche dont le libellé correspond. */
    const tapLine = async (re) => {
      const id = await lineId(page, re);
      return id !== '' && (await tapId(id)) !== null;
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

    // ── carte de commandement au doigt ──
    await page.evaluate(() => window.__cmd.ctx.ui.open('carte_tactique'));
    await settle(page, 800);
    const compact = await page.evaluate(() => document.querySelector('.ct').classList.contains('is-compact'));
    check(compact === (size.w < 980 || size.h < 520), `${size.name} : disposition ${compact ? 'compacte (une feuille à la fois)' : 'large (colonne de droite)'}`);
    await shot(page, `command-S0-${size.name}`);
    if (compact) {
      // barre du bas : sept boutons d'au moins 96 × 52 px dans la zone sûre ; rien ne déborde de l'écran
      const bar = await page.evaluate(() => [...document.querySelectorAll('[data-id="tac-intents"] button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.dataset.id, w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) };
      }));
      check(bar.length === 7 && bar.every((b) => b.w >= 96 && b.h >= 52 && b.l >= 0 && b.r <= size.w && b.b <= size.h), `${size.name} : barre du bas, sept boutons ≥ 96 × 52 px dans l'écran (${bar.map((b) => `${b.id} ${b.w}×${b.h}`).join(', ')})`);
      const sb = await visibleButtons(page);
      check(sb.length <= 14, `${size.name} : au repos, au plus 14 commandes (${sb.length} : ${sb.join(' · ')})`);
    }
    // cibles tactiles : au moins 40 px dans les deux sens (les lignes de fiche font 40 px au téléphone)
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.ct button')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 39.5 || r.width < 39.5); }).map((b) => (b.dataset.id || b.className) + ' ' + Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height)));
    check(small.length === 0, `${size.name} : toutes les cibles tactiles font au moins 40 px (${small.slice(0, 6).join(', ') || 'ok'})`);
    // toucher une unité : sa fiche (S1), sans aucun ordre
    await page.evaluate((key) => {
      const b = window.__cmd;
      const u = b.maps.scene.unitModel.get(key);
      b.tactical().map.jumpTo(u.x, u.z, 0.5);
    }, I.sections[2]);
    await settle(page, 500);
    let u = await unit(page, I.sections[2]);
    let p = await mapPoint(page, u.x, u.z);
    const issued0 = (await order(page, I.sections[2])).issuedAt;
    await tap(p.x, p.y);
    await settle(page);
    let t = await tac(page);
    check(t.card && t.card.kind === 'unite' && t.card.squadId === I.sections[2], `${size.name} : toucher une unité ouvre sa fiche (${JSON.stringify(t.card)})`);
    check((await order(page, I.sections[2])).issuedAt === issued0, `${size.name} : un toucher sur la carte ne donne aucun ordre`);
    await shot(page, `command-S1-${size.name}`);
    // une feuille à la fois : « Suivi » remplace la fiche
    if (compact) {
      await tapId('tac-suivi');
      await settle(page, 300);
      const on = await page.evaluate(() => ['follow', 'card', 'sheet'].filter((m) => document.querySelector('.ct-mount-' + m).classList.contains('is-on')));
      check(on.length === 1 && on[0] === 'follow', `${size.name} : une seule feuille ouverte (${on.join(', ')})`);
      await shot(page, `command-S5-${size.name}`);
      await tapId('tac-suivi');
      await settle(page, 300);
    }
    await rest(page);
    // glisser : déplacement de la carte (sur la carte visible, aucune feuille ouverte)
    const c0 = await page.evaluate(() => { const v = window.__cmd.tactical().map.view; return { cx: v.cx, cz: v.cz, mpp: v.mpp }; });
    const g0 = await spot(page, p.x - 120, p.y + 40, ['point', 'rue'], { touch: true });
    await down(4, g0.x, g0.y);
    await move(4, g0.x - 50, g0.y - 50, 6);
    await up(4);
    await settle(page, 200);
    const c1 = await page.evaluate(() => { const v = window.__cmd.tactical().map.view; return { cx: v.cx, cz: v.cz }; });
    near(c1.cx - c0.cx, 50 * c0.mpp, 3, `${size.name} : glisser déplace la carte (x)`);
    // ligne tracée au doigt : un lieu, « Autres ordres ici… », « Tracer la ligne moi-même » (toucher, puis second toucher), deux touchers
    u = await unit(page, I.sections[2]);
    p = await mapPoint(page, u.x, u.z);
    const sp = await spot(page, p.x - 40, p.y + 20, ['point', 'rue'], { touch: true });
    check(!!sp, `${size.name} : un lieu libre à toucher`);
    await tap(sp.x, sp.y);
    await settle(page, 300);
    t = await tac(page);
    check(t.card && (t.card.kind === 'point' || t.card.kind === 'rue'), `${size.name} : toucher un lieu ouvre sa fiche (${t.card && t.card.kind})`);
    const quiIds = t.who ? t.who.ids : [];
    await tapId('card-line-0');
    await settle(page, 200);
    check(await tapLine(/^Tracer la ligne moi-même$/), `${size.name} : « Tracer la ligne moi-même » touchée`);
    check(!(await tac(page)).tracing, `${size.name} : un seul toucher sur une ligne ne fait que la surligner`);
    await tapLine(/^Tracer la ligne moi-même$/);
    await settle(page, 200);
    check((await tac(page)).tracing, `${size.name} : second toucher sur la même ligne : la carte attend les deux bouts`);
    // les deux bouts, sur la partie visible de la carte (à gauche de la feuille au téléphone)
    const mapBox = await page.evaluate(() => { const r = window.__cmd.tactical().map.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    const A = { x: mapBox.l + mapBox.w * 0.25, y: mapBox.t + mapBox.h * 0.62 }, B = { x: mapBox.l + mapBox.w * 0.7, y: mapBox.t + mapBox.h * 0.62 };
    const wA = await worldAt(page, A.x, A.y), wB = await worldAt(page, B.x, B.y);
    await tap(A.x, A.y);
    await frames(page, 3);
    await shot(page, `command-tactique-trace-ligne-${size.name}`);
    await tap(B.x, B.y);
    await settle(page, 400);
    let o = quiIds.length > 0 ? await order(page, quiIds[0]) : { type: '' };
    check(o.type === 'ligne', `${size.name} : ligne tracée au doigt pour l'unité proposée (${o.type})`);
    if (quiIds.length === 1) {
      near(o.width, Math.hypot(wB.x - wA.x, wB.z - wA.z), 0.5, `${size.name} : largeur de la ligne`);
      near(o.x, (wA.x + wB.x) / 2, 0.5, `${size.name} : centre de la ligne (x)`);
      angleNear(o.heading, Math.PI, 0.03, `${size.name} : tracé ouest → est, face au nord`);
    }
    await shot(page, `command-S4-${size.name}`);
    await settle(page, 2400);
    await rest(page);
    // appui long = toucher : la fiche s'ouvre, aucun menu, aucun ordre
    const L = await spot(page, p.x - 100, p.y - 30, ['point', 'rue'], { touch: true });
    const nOrders = await page.evaluate(() => window.__cmd.command.issued.length);
    await down(6, L.x, L.y);
    await settle(page, 800);
    await up(6);
    await settle(page, 300);
    t = await tac(page);
    check(!!t.card && (await page.evaluate(() => window.__cmd.command.issued.length)) === nOrders, `${size.name} : appui long = toucher (fiche ouverte, aucun ordre)`);
    // Qui (S2) : la liste au doigt
    if (await tapId('card-who')) {
      await settle(page, 200);
      check((await tac(page)).sheet === 'qui', `${size.name} : « Qui ▸ » ouvre la liste`);
      await shot(page, `command-S2-${size.name}`);
    }
    await rest(page);
    // intention « Encercler (nasse) » : la fiche de la foule, la nasse surlignée ; le banc n'a pas les barrages de la
    // simulation (pas de rues d'issue) : on y prend « Encercler en cercle serré » (Autres), ordre ⚖ confirmé en S3
    check(!!(await tapId('intent-encercler')), `${size.name} : bouton « Encercler »`);
    await settle(page, 300);
    t = await tac(page);
    check(t.intent === 'encercler' && t.card && t.card.kind === 'foule' && /^Encercler \(nasse\)$/.test(t.lineLabel), `${size.name} : la fiche de la foule, « Encercler (nasse) » surlignée (${t.lineLabel})`);
    const crowdAt = t.card;
    await tapId('card-line-0');
    await settle(page, 200);
    await tapLine(/^Encercler en cercle serré/);
    await tapLine(/^Encercler en cercle serré/);
    await settle(page, 300);
    const s3c = await textOf(page, '.ct-mount-card');
    check((await tac(page)).sheet === 'confirm' && /avant la dernière sommation/.test(s3c), `${size.name} : cercle serré (⚖) : S3 avant l'envoi (${s3c.slice(0, 120)})`);
    const n0 = await page.evaluate(() => window.__cmd.command.issued.length);
    check(!!(await tapId('card-confirm')), `${size.name} : « Donner l’ordre quand même »`);
    await settle(page, 400);
    const enc = await page.evaluate((n) => window.__cmd.command.issued.slice(n), n0);
    check(enc.length >= 1 && enc.every((x) => x.type === 'encercler' && Math.abs(x.width - 36) < 0.5) && Math.hypot(enc[0].x - crowdAt.x, enc[0].z - crowdAt.z) < 0.5,
      `${size.name} : cercle serré autour de la foule (${enc.map((x) => `${x.type} ${x.width.toFixed(0)} m`).join(', ')})`);
    await settle(page, 2400);
    await rest(page);
    // S3 au doigt : « Disperser au gaz » 🔒 → les étapes
    if (await tapId('intent-disperser')) {
      await settle(page, 300);
      if (await tapLine(/^Disperser au gaz lacrymogène$/)) {
        await tapId('card-send');
        await settle(page, 300);
        check((await tac(page)).sheet === 'confirm', `${size.name} : « Disperser au gaz » : les étapes légales (S3)`);
        await shot(page, `command-S3-${size.name}`);
      }
      await rest(page);
    }
    // incidents : « Plus… › Tous les incidents », menu de délégation
    check(!!(await tapId('tac-more')), `${size.name} : « Plus… »`);
    await settle(page, 300);
    check(!!(await tapId('tab-incidents')), `${size.name} : « Tous les incidents et secours »`);
    await settle(page, 400);
    const first = await page.evaluate(() => Number(document.querySelector('.ct-inc').dataset.incident));
    await tapId('incident-' + first);
    await settle(page, 400);
    await shot(page, `command-tactique-incidents-${size.name}`);
    await tapId(`delegate-${first}-pompiers`);
    await settle(page, 400);
    const call = await page.evaluate((id) => window.__cmd.scenario.rescue.calls.filter((c) => c.incidentId === id).map((c) => c.kind), first);
    check(call.includes('pompiers'), `${size.name} : véhicule en feu → pompiers appelés pour cet incident`);
    await rest(page);
    // fermeture de rue au doigt : la rue, « Fermer aux voitures », « Donner l'ordre »
    const nb = await page.evaluate(() => window.__cmd.scenario.traffic.closures.length);
    const road = await page.evaluate(() => {
      const b = window.__cmd;
      const v = b.tactical().map.view;
      const sm = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
      b.ctx.world.nearestRoad(v.cx - 40, v.cz - 60, sm, 150);
      return sm;
    });
    p = await mapPoint(page, road.x, road.z);
    const onRoad = await spot(page, p.x, p.y, ['rue'], { touch: true, max: 70, edge: road.edgeId });
    check(!!onRoad, `${size.name} : la rue est désignable au doigt (${road.name || 'voie'})`);
    if (onRoad) {
      await tap(onRoad.x, onRoad.y);
      await settle(page, 300);
      check(await tapLine(/^Fermer aux voitures \(barrières\)$/), `${size.name} : « Fermer aux voitures (barrières) » touchée`);
      check(await page.evaluate(() => window.__cmd.scenario.traffic.closures.length) === nb, `${size.name} : un seul toucher ne ferme rien`);
      await tapId('card-send');
      await settle(page, 400);
      check(await page.evaluate(() => window.__cmd.scenario.traffic.closures.length) === nb + 1, `${size.name} : rue fermée (« Donner l’ordre ») (${road.name || 'voie'})`);
      await shot(page, `command-tactique-fermeture-${size.name}`);
    }
    await browser.close();
    // lecture seule (S6) au doigt : un CRS
    if (compact) {
      const r = await open('role=crs&freeze=1&ai=0&touch=1&open=carte_tactique', { width: size.w, height: size.h, mobile: true, deviceScaleFactor: 2 });
      await settle(r.page, 800);
      const btns = await visibleButtons(r.page);
      check(btns.length <= 3 && btns.includes('tac-close'), `${size.name} : CRS, carte en lecture seule : ✕ et ◎ seulement (${btns.join(', ')})`);
      await shot(r.page, `command-S6-${size.name}`);
      await r.browser.close();
    }
  }
}

// ══════════════════════════════════ DÉGRADATION ══════════════════════════════════
async function degrade() {
  console.log('— services absents, monde neutre');
  {
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&absent=incidents,traffic,metro,rescue,hazards&open=carte_tactique');
    await settle(page, 700);
    await dismissModel(page);
    await clickEl(page, '[data-id="tac-more"]');
    const r = await page.evaluate(() => ({
      entries: Array.from(document.querySelectorAll('[data-id="tac-more-panel"] button[data-id]')).filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.id),
      incidents: window.__cmd.maps.scene.incidents.length, stations: window.__cmd.maps.scene.stations.length, closures: window.__cmd.maps.scene.closures.length,
    }));
    check(r.entries.includes('more-ordres') && r.entries.includes('tab-journal') && !r.entries.includes('tab-incidents') && !r.entries.includes('tab-circulation'),
      `services étendus absents : « Plus… » sans incidents ni circulation (${r.entries.join(', ')})`);
    check(r.incidents === 0 && r.stations === 0 && r.closures === 0, 'couches correspondantes vides, sans erreur');
    await rest(page);
    const I = await ids(page);
    check(await clickEl(page, `[data-id="follow-u-${I.sections[0]}"]`) && await cardLine(page, /^Tenir sa position$/), 'section 1 : « Mes unités » → sa fiche → « Tenir sa position »');
    await settle(page, 200);
    check((await order(page, I.sections[0])).type === 'tenir', 'les ordres fonctionnent sans les services étendus');
    await shot(page, 'command-tactique-sans-services-1280x720');
    await key(page, 'Tab', 'carte_tactique', false);
    await key(page, 'KeyT', 'radio', true);
    await click(page, 'radio-pompiers');
    await settle(page, 300);
    const nt = await notices(page);
    check(nt.some((x) => /Aucun service de secours/.test(x)), 'radio : demande de secours transmise, absence du service signalée');
    await browser.close();
  }
  {
    const { browser, page } = await open('role=commandant&freeze=1&ai=0&map=none&open=carte_tactique');
    await settle(page, 700);
    await dismissModel(page);
    const I = await ids(page);
    check(await page.evaluate(() => window.__cmd.ctx.world.edgeCount === 0), 'monde neutre : aucun graphe routier');
    check(await clickEl(page, `[data-id="follow-u-${I.sections[1]}"]`) && await cardLine(page, /^L.envoyer ailleurs/), 'section 2 : « L’envoyer ailleurs… »');
    const u = await unit(page, I.sections[1]);
    const p = await mapPoint(page, u.x, u.z);
    const sp = await spot(page, p.x + 20, p.y + 120, ['point']);
    await page.mouse.click(sp.x, sp.y);
    await settle(page);
    check(await traceLine(page, { x: p.x - 50, y: p.y + 60 }, { x: p.x + 50, y: p.y + 60 }), 'monde neutre : « Tracer la ligne moi-même »');
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
  check(hud.mini && /MISTRAL|avec vous/i.test(hud.unit), `mini-carte et « mon unité » affichés dans le HUD du socle (${hud.unit})`);
  check(hud.screens.every(Boolean), 'écrans carte, carte_tactique, roue_ordres et radio enregistrés');
  await shot(page, 'command-socle-hud-1280x720');
  // touches d'interface du socle (table HOTKEY_SCREENS)
  check(await key(page, 'Tab', 'carte_tactique', true), 'socle : Tab ouvre la carte de commandement');
  await settle(page, 600);
  check(await page.evaluate(() => document.activeElement === window.__cmd.tactical().map.canvas), 'socle : à l\'ouverture, le focus est sur la carte (data-autofocus)');
  await dismissModel(page);
  check(await clickEl(page, `[data-id="follow-u-${I.sections[2]}"]`) && await cardLine(page, /^L.envoyer ailleurs/), 'socle : « Mes unités » → section 3 → « L’envoyer ailleurs… »');
  const u = await unit(page, I.sections[2]);
  const p = await mapPoint(page, u.x, u.z);
  const sp = await spot(page, p.x + 120, p.y + 40);
  await page.mouse.click(sp.x, sp.y);
  await settle(page);
  const A = { x: p.x - 60, y: p.y + 80 }, B = { x: p.x + 70, y: p.y + 80 };
  const wA = await worldAt(page, A.x, A.y), wB = await worldAt(page, B.x, B.y);
  check(await traceLine(page, A, B), 'socle : « Tracer la ligne moi-même », deux clics');
  await settle(page);
  const o = await order(page, I.sections[2]);
  check(o.type === 'ligne', `socle : ligne tracée, ordre reçu (${o.type})`);
  near(o.width, Math.hypot(wB.x - wA.x, wB.z - wA.z), 0.4, 'socle : largeur de la ligne');
  near(o.x, (wA.x + wB.x) / 2, 0.4, 'socle : centre de la ligne');
  await settle(page, 400);
  await shot(page, 'command-socle-tactique-1280x720');
  check(await page.evaluate(() => window.__cmd.ctx.session.phase === 'playing'), 'socle : la simulation n\'est pas en pause carte ouverte');
  await settle(page, 2400);
  await rest(page);
  await page.mouse.click(sp.x, sp.y);
  await settle(page);
  check((await tac(page)).card !== null, 'socle : une fiche ouverte');
  check(await key(page, 'Escape', 'carte_tactique', true) && (await tac(page)).card === null, 'socle : Échap referme d\'abord la fiche');
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
  await page.mouse.move(726, 291, { steps: 4 }); // secteur « Envoyer »
  await settle(page, 200);
  await shot(page, 'command-socle-roue-1280x720');
  await page.keyboard.up('KeyF');
  check(await untilStack(page, 'roue_ordres', false), 'socle : relâchement, la roue se ferme');
  {
    // (ordres directs : « Envoyer » va à l'unité libre la plus proche du lieu visé, pas à toute la compagnie)
    const sentTo = await page.evaluate((me) => window.__cmd.ctx.squads.list
      .filter((q) => q.order && q.order.issuedBy === me && /^(avancer|colonne|faire_mouvement)$/.test(q.order.type)).map((q) => `${q.name} : ${q.order.type}`), I.player);
    check(sentTo.length > 0, `socle : « Envoyer » (roue) transmis à une unité du joueur (${sentTo.join(' ; ') || 'aucune'})`);
  }
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
  const rb = await tac(page);
  check(!!rb.card && (rb.card.kind === 'incident' || rb.card.kind === 'proposition' || rb.card.kind === 'nasse'), `socle + manette : RB (« ui:tab ») ouvre le premier « À traiter » (${rb.card && rb.card.name})`);
  check(await page.evaluate(() => document.activeElement === window.__cmd.tactical().map.canvas), 'socle + manette : le focus reste sur la carte');
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
    const compact = await m.page.evaluate(() => document.querySelector('.ct').classList.contains('is-compact'));
    check(compact, 'socle, téléphone : carte de commandement en disposition compacte');
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
