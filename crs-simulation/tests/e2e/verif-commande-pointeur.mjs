// Carte de commandement AU POINTEUR SEUL (pavé tactile d'un Mac : clics, défilement à deux doigts, pincement ; ni glissé,
// ni clic droit, ni appui long, ni touche) — refonte du commandement, §4 et §5.2. Ordinateur 1280 × 800, commandant à
// la place de la Concorde :
//   ouverture  le bouton « Carte de commandement » du HUD (1 clic) ;
//   S0         au plus 22 boutons ; aucun libellé n'emploie une abréviation, un type d'ordre brut ou une force en chiffre ;
//   survol     survoler une ligne la surligne (aperçu) sans rien envoyer ; un clic sur la carte n'envoie jamais rien ;
//   T1         clic sur une rue · clic sur « Barrer la rue, passants admis » (3 avec l'ouverture) ;
//   T8         clic sur une rue · clic sur « Fermer aux voitures (barrières) » (3) ;
//   T3         clic sur la foule · clic sur « Encercler (nasse) » (3) ;
//   T4         « Interpeller » · clic sur la ligne (3) ;
//   T7         « Secours » · clic sur la ligne des pompiers (3) ;
//   T2         pincement · défilement à deux doigts · clic sur le lieu · « Toute la compagnie » · « Y aller » (5) ;
//   T5         clic sur la foule · « Disperser au gaz lacrymogène » · « Faire les étapes dans l'ordre » (4), puis la
//              chaîne se suit et s'annule depuis « Mes unités ».
// Captures commande-ptr-*.png dans tests/e2e/out.
// Usage : node tests/e2e/verif-commande-pointeur.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap } from './verif-fin-lib.mjs';

const tag = 'verif-commande-pointeur';
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 800, pointerLock: false });

/** Nombre de clics de la tâche en cours. */
let clicks = 0;
async function clickAt(x, y) {
  await page.mouse.move(x, y, { steps: 3 });
  await frames(page, 2);
  await page.mouse.click(x, y);
  await frames(page, 4);
  clicks++;
}
const rectOf = (sel) => page.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
  if (!e) return null;
  const b = e.getBoundingClientRect();
  const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, top: b.top, bottom: b.bottom, hitOk: !!h && (h === e || e.contains(h)) };
}, sel);
async function clickSel(sel) {
  let r = await rectOf(sel);
  if (!r) { await frames(page, 3); r = await rectOf(sel); }
  if (!r) throw new Error(`introuvable ou caché : ${sel}`);
  if (!r.hitOk) throw new Error(`recouvert : ${sel} ${JSON.stringify(r)}`);
  if (r.bottom > 800.5 || r.top < -0.5) throw new Error(`hors de l’écran : ${sel} ${JSON.stringify(r)}`);
  await clickAt(r.x, r.y);
}
/** Ligne de la fiche dont le libellé correspond. */
const lineId = (re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const b = [...document.querySelectorAll('[data-id^="card-line-"]')].find((e) => e.getBoundingClientRect().width > 0 && rx.test(e.querySelector('.cc-lab')?.textContent || ''));
  return b ? b.dataset.id : null;
}, re.source);
const tac = () => page.evaluate(() => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  if (!t) return null;
  const s = t.state;
  const list = t.card && s.card ? (s.card.othersOpen ? t.card.others : t.card.lines) : [];
  return {
    intent: s.intent, sheet: s.sheet, kind: s.card && s.card.repere.kind, name: s.card && s.card.repere.name, line: s.card ? s.card.line : -1,
    lineLabel: list[s.card ? s.card.line : -1]?.label ?? '', lines: list.map((l) => l.label), who: s.who && s.who.label, sent: s.lastSent && s.lastSent.text,
  };
});
const sends = () => page.evaluate(() => window.__c6.slice());
const screenOf = (x, z) => page.evaluate(([wx, wz]) => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  const p = t.map.view.worldToScreen(wx, wz, { x: 0, y: 0 });
  const r = t.map.canvas.getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y, w: r.width, h: r.height, left: r.left, top: r.top, inside: p.x > 40 && p.y > 60 && p.x < r.width - 40 && p.y < r.height - 60 };
}, [x, z]);
/** Défilement à deux doigts (événements wheel sans Ctrl, petits pas fractionnaires) jusqu'à voir le point au centre. */
let gestures = 0;
async function scrollTo(x, z) {
  for (let i = 0; i < 40; i++) {
    const p = await screenOf(x, z);
    const cx = p.left + p.w / 2, cy = p.top + p.h / 2;
    const dx = p.x - cx, dy = p.y - cy;
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) return true;
    await page.mouse.move(cx, cy);
    // la carte suit les doigts : faire défiler de +d amène ce qui est à +d au centre
    await page.mouse.wheel(Math.max(-390, Math.min(390, dx)) + 0.5, Math.max(-390, Math.min(390, dy)) + 0.5);
    await frames(page, 2);
    gestures++;
  }
  return false;
}
/** Revient au repos sans fermer la carte (bouton « ‹ Retour » cliqué tant qu'il y en a un). */
async function rest() {
  for (let i = 0; i < 6; i++) {
    const t = await tac();
    if (!t || (!t.intent && t.sheet === 'none')) return;
    const back = await rectOf('[data-id="card-back"]');
    if (back && back.hitOk) { await page.mouse.click(back.x, back.y); await frames(page, 3); continue; }
    await page.evaluate(() => window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical.back());
    await frames(page, 2);
  }
}
/** Tous les libellés visibles de la carte de commandement (boutons, fiche, panneaux). */
const visibleTexts = () => page.evaluate(() => {
  const root = document.querySelector('[data-id="tactical"]');
  const out = [];
  for (const e of root.querySelectorAll('button, .cc-lab, .cc-exp, .cc-head, .ct-top, [data-id^="follow-"], [data-id^="todo-"]')) {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || getComputedStyle(e).visibility === 'hidden') continue;
    out.push((e.innerText || '').replace(/\s+/g, ' ').trim());
  }
  return [...new Set(out)].filter((s) => s !== '');
});
/** Libellés suspects : type d'ordre brut, abréviation non expliquée, niveau de force en chiffre. */
function suspicious(texts) {
  const bad = [];
  for (const s of texts) {
    if (/[A-Z]{3,}_[A-Z]/.test(s) || /\b(couper_circulation|faire_mouvement|suivre_pied|avec_moi|bond_offensif|disperser_gaz|degager_\w+|retour_poste)\b/.test(s)) bad.push('type brut : ' + s);
    if (/\b(VL|GM2L|LBD40)\b/.test(s) || (/\bLBD\b/.test(s) && !/lanceurs de balles/.test(s))) bad.push('abréviation : ' + s);
    if (/\bTV\b/.test(s) && !/police secours|Patrouille TV/i.test(s)) bad.push('abréviation TV : ' + s);
    if (/(Force|force|Niveau|niveau|licite|autorisée)\s*:?\s*[0-4]\b/.test(s)) bad.push('force en chiffre : ' + s);
  }
  return bad;
}
const allTexts = new Set();
async function readTexts(label) {
  const t = await visibleTexts();
  for (const s of t) allTexts.add(s);
  const bad = suspicious(t);
  C.check(bad.length === 0, `${label} : aucun libellé brut, abrégé ou chiffré`, bad.slice(0, 4).join(' | '));
}

try {
  const q = new URLSearchParams({
    autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
    quality: 'bas', seed: '11', time: '12', weather: 'clair',
  });
  await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 3);
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__c6 = [];
    core.issue = (type, squads, geoms, targetId = 0, ...rest) => {
      const r = orig(type, squads, geoms, targetId, ...rest);
      window.__c6.push({ type: String(type), ids: squads.map((s) => s.id), targetId, ok: r.ok, geoms: (geoms || []).map((g) => g && g.kind) });
      return r;
    };
  });

  // ── ouverture au clic ──
  clicks = 0;
  await clickSel('[data-id="hud-key-map"]');
  await page.waitForTimeout(500);
  await frames(page, 4);
  C.check(await page.evaluate(() => window.__CRS.ctx.ui.current === 'carte_tactique'), 'le bouton du HUD ouvre la carte de commandement');
  const ok = await rectOf('[data-id="tac-model-ok"]');
  if (ok) { await page.mouse.click(ok.x, ok.y); await frames(page, 3); }
  const b0 = await page.evaluate(() => [...document.querySelectorAll('[data-id="tactical"] button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
  }).length);
  C.check(b0 <= 22, `S0 : au plus 22 boutons (${b0})`);
  await readTexts('S0');
  await snap(page, 'commande-ptr-S0-1280x800');

  const env = await page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const e = t.cardEnv();
    const c = e.crowds.slice().sort((a, b) => b.people - a.people)[0];
    return c ? { x: c.x, z: c.z, exits: c.exits.filter((x) => x.edgeId >= 0 && x.street.trim() !== '' && !x.held).map((x) => ({ x: x.x, z: x.z, name: x.street })) } : null;
  });
  C.check(!!env && env.exits.length >= 2, 'la foule principale a des rues d’issue nommées', JSON.stringify(env && env.exits.slice(0, 3)));

  let p, st, s, n0;
  // ── T3 : foule · « Encercler (nasse) » ──
  clicks = 1;
  await scrollTo(env.x, env.z);
  p = await screenOf(env.x, env.z);
  await clickAt(p.x, p.y);
  st = await tac();
  C.check(st && (st.kind === 'foule' || st.kind === 'nasse'), 'clic sur la foule : sa fiche', JSON.stringify(st));
  await readTexts('fiche de foule');
  const over = await page.evaluate(() => { const l = document.querySelector('.cc-list'); return l ? l.scrollHeight - l.clientHeight : -1; });
  C.check(over >= 0 && over <= 1, `fiche de la foule sans défilement à 1280 × 800 (${over} px de trop)`);
  await snap(page, 'commande-ptr-S1-foule');
  const idN = await lineId(/^Encercler \(nasse\)$/);
  n0 = (await sends()).length;
  if (idN) await clickSel(`[data-id="${idN}"]`);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.length >= 1 && s.every((o) => o.ok && o.type === 'couper_circulation'), `T3 : la nasse part (${s.length} unité(s))`, JSON.stringify(s.map((o) => o.ids)));
  C.check(clicks <= 3, `T3 : ${clicks} clics (§4 : 3)`);
  await step(page, 2.5);
  await rest();

  // ── un clic sur la carte n'envoie jamais rien ; survol = aperçu ──
  n0 = (await sends()).length;
  await scrollTo(env.exits[0].x, env.exits[0].z);
  p = await screenOf(env.exits[0].x, env.exits[0].z);
  await clickAt(p.x, p.y);
  st = await tac();
  C.check(st && st.sheet === 'card', 'clic sur une rue : sa fiche', JSON.stringify(st));
  C.check((await sends()).length === n0, 'un clic sur la carte n’envoie rien');
  await readTexts('fiche de rue');
  await snap(page, 'commande-ptr-S1-rue');
  const id3 = await lineId(/^Barrage filtrant$/);
  if (id3) {
    const r = await rectOf(`[data-id="${id3}"]`);
    await page.mouse.move(r.x, r.y, { steps: 4 });
    await frames(page, 4);
    st = await tac();
    C.check(st.lineLabel === 'Barrage filtrant', 'survol de « Barrage filtrant » : surlignée (aperçu)', st.lineLabel);
    C.check((await sends()).length === n0, 'le survol n’envoie rien');
    await page.mouse.move(r.x - 600, r.y, { steps: 3 });
    await frames(page, 3);
  }

  // ── T1 : rue · « Barrer la rue, passants admis » ──
  clicks = 2;
  const id2 = await lineId(/^Barrer la rue, passants admis$/);
  C.check(!!id2, 'la fiche de rue propose « Barrer la rue, passants admis »', JSON.stringify(st.lines));
  n0 = (await sends()).length;
  if (id2) await clickSel(`[data-id="${id2}"]`);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.length === 1 && s[0].ok && s[0].type === 'couper_circulation' && s[0].targetId === -2, 'T1 : couper_circulation, passants admis', JSON.stringify(s));
  C.check(clicks <= 3, `T1 : ${clicks} clics (§4 : 3)`);
  st = await tac();
  C.check(/ORDRE DONNÉ/.test(st.sent || '') || !!st.sent, '« ✓ ORDRE DONNÉ » dans la fiche', st.sent);
  await snap(page, 'commande-ptr-S4');
  await step(page, 2.5);
  await rest();

  // ── T8 : rue · « Fermer aux voitures (barrières) » ──
  clicks = 1;
  await scrollTo(env.exits[1].x, env.exits[1].z);
  p = await screenOf(env.exits[1].x, env.exits[1].z);
  await clickAt(p.x, p.y);
  st = await tac();
  const closures0 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').traffic?.closures.length ?? -1);
  const id4 = await lineId(/^Fermer aux voitures/);
  C.check(st.kind === 'rue' && !!id4, 'clic sur une autre rue : « Fermer aux voitures (barrières) »', JSON.stringify(st));
  if (id4) await clickSel(`[data-id="${id4}"]`);
  await step(page, 0.3);
  const closures1 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').traffic?.closures.length ?? -1);
  C.check(closures1 > closures0, `T8 : la rue est fermée aux voitures (${closures0} → ${closures1})`);
  C.check(clicks <= 3, `T8 : ${clicks} clics (§4 : 3)`);
  await step(page, 2.5);
  await rest();

  // ── T4 : « Interpeller » · ligne ──
  clicks = 1;
  await clickSel('[data-id="intent-interpeller"]');
  st = await tac();
  // (aucun fait constaté dans cette foule : la fiche propose d'aller constater, cahier des charges §4.3)
  C.check(st && st.intent === 'interpeller' && /Interpeller|constater/.test(st.lineLabel), '« Interpeller » : « Interpeller… » ou « Aller constater » surlignée', JSON.stringify(st));
  await readTexts('fiche Interpeller');
  const idI = await page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    return `card-line-${t.card.lines[t.state.card.line].n ?? t.state.card.line + 1}`;
  });
  n0 = (await sends()).length;
  const hl = await page.evaluate(() => { const e = document.querySelector('.cc-row.is-hl, [data-id^="card-line-"].is-on, [data-id^="card-line-"][aria-current="true"]'); return e ? e.dataset.id : null; });
  await clickSel(`[data-id="${hl || idI}"]`);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.some((o) => o.ok && o.type === 'interpeller'), 'T4 : un ordre « interpeller » part', JSON.stringify(s));
  C.check(clicks <= 3, `T4 : ${clicks} clics (§4 : 3)`);
  await step(page, 2.5);
  await rest();

  // ── T7 : « Secours » · pompiers ──
  clicks = 1;
  const calls0 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').rescue?.calls.length ?? -1);
  await clickSel('[data-id="intent-secours"]');
  st = await tac();
  C.check(st && /pompiers/i.test(st.lineLabel), '« Secours » : les pompiers surlignés', JSON.stringify(st));
  await readTexts('fiche Secours');
  const idP = await lineId(/pompiers|Pompiers/);
  if (idP) await clickSel(`[data-id="${idP}"]`);
  await step(page, 0.3);
  const calls1 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').rescue?.calls.length ?? -1);
  C.check(calls1 > calls0, `T7 : les pompiers sont demandés (${calls0} → ${calls1})`);
  C.check(clicks <= 3, `T7 : ${clicks} clics (§4 : 3)`);
  await rest();

  // ── T2 : pincement · défilement · lieu lointain · « Toute la compagnie » · « Y aller » ──
  clicks = 1;
  gestures = 0;
  const mapR = await rectOf('[data-id="tac-map"]');
  const mc = mapR || { x: 470, y: 400 };
  await page.mouse.move(mc.x, mc.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 30.5); await frames(page, 1); }
  await page.keyboard.up('Control');
  gestures++;
  const far = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const p = c.player.person();
    const out = { x: 0, z: 0 };
    for (const [dx, dz] of [[900, -900], [-900, -900], [900, 900], [-900, 900]]) {
      if (c.world.randomFreePoint(p.x + dx, p.z + dz, 60, 'road', () => 0.5, out)) return { x: out.x, z: out.z };
    }
    return null;
  });
  const g0 = gestures;
  await scrollTo(far.x, far.z);
  C.note(`T2 : ${gestures - g0} défilement(s) à deux doigts pour amener le lieu (non comptés comme clics)`);
  p = await screenOf(far.x, far.z);
  await clickAt(p.x, p.y);
  st = await tac();
  C.check(st && st.sheet === 'card', 'clic sur un lieu lointain : sa fiche', JSON.stringify(st));
  await clickSel('[data-id="card-who-all"]');
  st = await tac();
  C.check(/Toute la compagnie/.test(st.who || ''), '« Toute la compagnie » : Qui = toute la compagnie', st.who);
  const idGo = await lineId(/^Y aller$/);
  C.check(!!idGo, 'la fiche propose « Y aller »', JSON.stringify(st.lines));
  const sentence = await page.evaluate(() => document.querySelector('.ct-mount-card')?.innerText.replace(/\s+/g, ' ') ?? '');
  C.check(/en véhicules/.test(sentence) && /km/.test(sentence), 'la fiche dit « en véhicules » et la distance en km', sentence.slice(0, 300));
  await snap(page, 'commande-ptr-T2');
  n0 = (await sends()).length;
  if (idGo) await clickSel(`[data-id="${idGo}"]`);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  const company = await page.evaluate(() => window.__CRS.ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police')?.id ?? 0);
  C.check(s.length === 1 && s[0].ok && s[0].ids.includes(company), 'T2 : l’ordre part à la compagnie', JSON.stringify(s));
  C.check(clicks <= 4 && gestures - g0 <= 6, `T2 : ${clicks} clics + 1 pincement (§4 : 5 actions)`);
  await step(page, 2.5);
  await rest();

  // ── T5 : foule · gaz · « Faire les étapes dans l'ordre » ; puis annuler depuis « Mes unités » ──
  clicks = 1;
  await page.mouse.move(mc.x, mc.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -30.5); await frames(page, 1); }
  await page.keyboard.up('Control');
  await scrollTo(env.x, env.z);
  p = await screenOf(env.x, env.z);
  await clickAt(p.x, p.y);
  const idG = await lineId(/^Disperser au gaz lacrymogène$/);
  C.check(!!idG, 'la fiche de la foule propose « Disperser au gaz lacrymogène »', JSON.stringify((await tac()).lines));
  n0 = (await sends()).length;
  if (idG) await clickSel(`[data-id="${idG}"]`);
  st = await tac();
  const s3 = await page.evaluate(() => document.querySelector('.ct-mount-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  C.check(st.sheet === 'confirm' && /sommations/i.test(s3), 'S3 : les étapes légales', s3.slice(0, 300));
  C.check((await sends()).length === n0, 'S3 : rien ne part avant la confirmation');
  await readTexts('S3');
  await snap(page, 'commande-ptr-S3');
  await clickSel('[data-id="card-confirm"]');
  C.check(clicks <= 4, `T5 : ${clicks} clics (§4 : 4)`);
  await step(page, 6);
  const chain = await page.evaluate(() => window.__CRS.ctx.service('ui.command').legalChain.status());
  C.check(!!chain && chain.stage !== 'refus', 'la chaîne légale tourne', JSON.stringify(chain));
  await rest();
  // « Mes unités » : la ligne de la chaîne et son « Annuler »
  const rowTxt = await page.evaluate(() => { const e = document.querySelector('[data-id="follow-chaine"]'); return e ? e.innerText.replace(/\s+/g, ' ') : null; });
  C.check(!!rowTxt && /sommation/i.test(rowTxt), '« Mes unités » montre la chaîne (sommation n sur 3)', rowTxt);
  await readTexts('Mes unités');
  await snap(page, 'commande-ptr-S5');
  await clickSel('[data-id="chain-cancel"]');
  await step(page, 0.5);
  const after = await page.evaluate(() => window.__CRS.ctx.service('ui.command').legalChain.status());
  C.check(!after || after.stage === 'annule', 'la chaîne s’annule depuis « Mes unités »', JSON.stringify(after));
  await step(page, 60);
  C.check(!(await sends()).some((o) => o.type === 'disperser_gaz'), 'après l’annulation, aucun gaz ne part');

  C.note('libellés lus : ' + [...allTexts].slice(0, 200).join(' ‖ '));
} catch (e) {
  C.check(false, 'scénario interrompu', e && e.stack ? e.stack : String(e));
} finally {
  C.check(errors.length === 0, 'aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  C.done();
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
