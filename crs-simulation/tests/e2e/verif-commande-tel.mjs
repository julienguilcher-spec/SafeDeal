// Carte de commandement au TÉLÉPHONE (844 × 390, paysage, au doigt seulement — aucune touche, qui masquerait les
// commandes tactiles) — refonte du commandement, §2.1–§2.6, §4 et §5.3. Commandant à la place de la Concorde :
//   S0     la barre du bas : 7 boutons d'au moins 96 × 52 px, dans l'écran ; « ☰ Suivi » ;
//   T1     Carte · toucher une rue · toucher la ligne 2 · « Donner l'ordre » (4 touchers) : couper_circulation,
//          passants admis ; un seul toucher sur une ligne n'envoie jamais rien ;
//   T3     toucher la foule · « Donner l'ordre » (+ Carte = 3) : la nasse part ;
//   T4     « Interpeller » · « Donner l'ordre » : un ordre « interpeller » part ;
//   T2     pincer (1) · toucher un lieu lointain · « Qui ▸ » · « Toute la compagnie » · « Donner l'ordre » : la
//          compagnie part en véhicules ;
//   une seule feuille à la fois (fiche, « Suivi ») ; S3 : « Disperser » · ligne 4 · « Donner l'ordre ».
// Captures commande-tel-S0/S1/S3-844x390.png dans tests/e2e/out.
// Usage : node tests/e2e/verif-commande-tel.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, fingers } from './verif-tpm-lib.mjs';

const tag = 'verif-commande-tel';
const C = makeChecker(tag);
const server = await startServer();
const q = new URLSearchParams({
  autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
  quality: 'bas', seed: '7', time: '12', weather: 'clair',
});
const { browser, page, errors } = await openPage(`${server.url}?${q}`, { width: 844, height: 390, mobile: true, pointerLock: false });
const F = await fingers(page);

/** Nombre de touchers de la tâche en cours. */
let taps = 0;
async function tapAt(x, y) {
  await F.tap(x, y);
  await frames(page, 4);
  await page.waitForTimeout(150);
  taps++;
}
const rectOf = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  if (b.width <= 0 || b.height <= 0) return null;
  const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom, hitOk: !!h && (h === e || e.contains(h)) };
}, sel);
async function tapSel(sel) {
  let r = await rectOf(sel);
  // (la barre du bas réapparaît au rafraîchissement qui suit le retour au repos : une image de plus)
  if (!r) { await frames(page, 3); r = await rectOf(sel); }
  if (!r) {
    const why = await page.evaluate(() => { const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical; return { screen: window.__CRS.ctx.ui.current, root: t ? t.root.className : null, sheet: t ? t.state.sheet : null, card: !!(t && t.state.card), intent: t ? t.state.intent : null }; });
    throw new Error(`introuvable ou caché : ${sel} ${JSON.stringify(why)}`);
  }
  if (!r.hitOk || r.bottom > 390.5 || r.top < -3) throw new Error(`hors de l’écran ou recouvert : ${sel} ${JSON.stringify(r)}`);
  await tapAt(r.x, r.y);
  return r;
}
const tac = () => page.evaluate(() => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  if (!t) return null;
  const s = t.state;
  return {
    intent: s.intent, sheet: s.sheet, kind: s.card && s.card.repere.kind, name: s.card && s.card.repere.name, line: s.card && s.card.line,
    lineLabel: t.card && s.card ? (s.card.othersOpen ? t.card.others : t.card.lines)[s.card.line]?.label ?? '' : '',
    who: s.who && s.who.label,
  };
});
const sends = () => page.evaluate(() => window.__c6.slice());
/** Point de l'écran d'un repère (monde → écran de la carte). */
const screenOf = (x, z) => page.evaluate(([wx, wz]) => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  const p = t.map.view.worldToScreen(wx, wz, { x: 0, y: 0 });
  const r = t.map.canvas.getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y, inside: p.x > 20 && p.y > 20 && p.x < r.width - 20 && p.y < r.height - 20 };
}, [x, z]);
/** Les feuilles ouvertes de la colonne (une seule à la fois). */
const sheetsOn = () => page.evaluate(() => [...document.querySelectorAll('.ct-mount.is-on')].map((e) => e.dataset.mount));
/** Revient au repos sans fermer la carte. */
const rest = () => page.evaluate(() => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  for (let i = 0; i < 6 && (t.state.card || t.state.sheet !== 'none' || t.state.intent); i++) if (!t.back()) break;
});
/** Centre la carte sur un point (comme un glissé du doigt, hors du compte des touchers). */
const centre = (x, z) => page.evaluate(([wx, wz]) => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  t.map.jumpTo(wx, wz, Math.min(t.map.view.mpp, 1.2));
}, [x, z]);

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 3);
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__c6 = [];
    core.issue = (type, squads, geoms, targetId = 0, ...rest) => {
      const r = orig(type, squads, geoms, targetId, ...rest);
      window.__c6.push({ type: String(type), ids: squads.map((s) => s.id), targetId, ok: r.ok });
      return r;
    };
  });

  // ── ouverture (le toucher « Tactique » compte pour T3) ──
  taps = 0;
  await tapSel('.crs-touch .ct-l-pied.ct-k-tactical');
  await page.waitForTimeout(500);
  await frames(page, 4);
  C.check(await page.evaluate(() => window.__CRS.ctx.ui.current === 'carte_tactique'), 'le bouton tactile « Tactique » ouvre la carte de commandement');
  // le modèle en deux phrases de la première ouverture se referme d'un toucher sur « Compris » (hors compte)
  const ok = await rectOf('[data-id="tac-model-ok"]');
  if (ok) { await F.tap(ok.x, ok.y); await frames(page, 3); }
  // S0 : barre du bas
  const bar = await page.evaluate(() => [...document.querySelectorAll('.ct-intents > button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { id: b.dataset.id, w: Math.round(r.width), h: Math.round(r.height), left: r.left, right: r.right };
  }));
  C.check(bar.length === 7, `barre du bas : 7 boutons (${bar.length})`);
  C.check(bar.every((b) => b.w >= 96 && b.h >= 52), 'chaque bouton fait au moins 96 × 52 px', bar.map((b) => `${b.id} ${b.w}×${b.h}`).join(', '));
  C.check(bar.every((b) => b.left >= 0 && b.right <= 844), 'la barre tient dans l’écran');
  C.check(!!(await rectOf('[data-id="tac-suivi"]')), '« ☰ Suivi » au bandeau');
  await snap(page, 'commande-tel-S0-844x390');
  // ── T3 : toucher la foule · « Donner l'ordre » ──
  const crowd = await page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const env = t.cardEnv();
    const c = env.crowds.slice().sort((a, b) => b.people - a.people)[0];
    return c ? { x: c.x, z: c.z } : null;
  });
  await centre(crowd.x, crowd.z);
  await frames(page, 3);
  let p = await screenOf(crowd.x, crowd.z);
  await tapAt(p.x, p.y);
  let st = await tac();
  C.check(st && (st.kind === 'foule' || st.kind === 'nasse') && /Encercler \(nasse\)|Ouvrir une sortie filtrée/.test(st.lineLabel), 'toucher la foule : sa fiche, « Encercler (nasse) » surlignée', JSON.stringify(st));
  let n0 = (await sends()).length;
  await tapSel('[data-id="card-send"]');
  await step(page, 0.3);
  let s = (await sends()).slice(n0);
  C.check(s.length >= 1 && s.every((o) => o.ok && o.type === 'couper_circulation'), `T3 : la nasse part (${s.length} unité(s) à une rue chacune)`, JSON.stringify(s));
  C.check(taps <= 3, `T3 : ${taps} touchers (§4 : 3)`);
  await step(page, 2.5);
  await rest();

  // ── T1 : rue · ligne 2 · « Donner l'ordre » (+ Carte) ──
  taps = 1;
  // une rue d'issue de la foule : on la touche
  const street = await page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    const env = t.cardEnv();
    const c = env.crowds.slice().sort((a, b) => b.people - a.people)[0];
    const e = c && c.exits.find((x) => x.edgeId >= 0 && x.street.trim() !== '' && !x.held);
    return e ? { x: e.x, z: e.z, name: e.street } : null;
  });
  C.check(!!street, 'une rue nommée part de la foule', JSON.stringify(street));
  await centre(street.x, street.z);
  await frames(page, 3);
  p = await screenOf(street.x, street.z);
  await tapAt(p.x, p.y);
  st = await tac();
  C.check(st && st.sheet === 'card' && st.kind === 'rue', 'toucher la rue : sa fiche s’ouvre dans la feuille de droite', JSON.stringify(st));
  C.check(JSON.stringify(await sheetsOn()) === '["card"]', 'une seule feuille ouverte (la fiche)', JSON.stringify(await sheetsOn()));
  await snap(page, 'commande-tel-S1-844x390');
  // §2.2 : la fiche tient dans les 390 px sans défiler — les six lignes, « Autres ordres ici… » et « Donner l'ordre »
  const fit = await page.evaluate(() => {
    const out = {};
    for (const id of ['card-line-1', 'card-line-6', 'card-line-0', 'card-send']) {
      const e = [...document.querySelectorAll(`[data-id="${id}"]`)].find((x) => x.getBoundingClientRect().width > 0);
      if (!e) { out[id] = 'absent'; continue; }
      const r = e.getBoundingClientRect();
      // visible : dans la fenêtre et pas caché par un ancêtre qui défile
      let ok = r.top >= -0.5 && r.bottom <= innerHeight + 0.5;
      for (let q = e.parentElement; q && ok; q = q.parentElement) {
        if (getComputedStyle(q).overflowY === 'visible') continue;
        const b = q.getBoundingClientRect();
        if (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) ok = false;
      }
      out[id] = ok ? 'ok' : `hors vue (${Math.round(r.top)}–${Math.round(r.bottom)})`;
    }
    return out;
  });
  C.check(Object.values(fit).every((v) => v === 'ok' || v === 'absent') && fit['card-send'] === 'ok' && fit['card-line-1'] === 'ok',
    'S1 : la fiche tient dans l’écran sans défiler (lignes, « Autres ordres ici… », « Donner l’ordre »)', JSON.stringify(fit));
  // un seul toucher sur la ligne 2 : surlignée, rien n'est envoyé
  n0 = (await sends()).length;
  await tapSel('[data-id="card-line-2"]');
  st = await tac();
  C.check(st.lineLabel === 'Barrer la rue, passants admis', 'toucher la ligne 2 : « Barrer la rue, passants admis » surlignée', st.lineLabel);
  await step(page, 0.3);
  C.check((await sends()).length === n0, 'un seul toucher sur une ligne n’envoie rien');
  await tapSel('[data-id="card-send"]');
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.length === 1 && s[0].ok && s[0].type === 'couper_circulation' && s[0].targetId === -2, 'T1 : « Donner l’ordre » : couper_circulation, passants admis', JSON.stringify(s));
  C.check(taps <= 4, `T1 : ${taps} touchers (§4 : 4)`);
  await step(page, 2.5);
  await rest();

  // ── T4 : « Interpeller » · « Donner l'ordre » ──
  taps = 1;
  await tapSel('[data-id="intent-interpeller"]');
  st = await tac();
  C.check(st && st.intent === 'interpeller' && /Interpeller/.test(st.lineLabel), '« Interpeller » : la fiche, « Interpeller… » surlignée', JSON.stringify(st));
  n0 = (await sends()).length;
  await tapSel('[data-id="card-send"]');
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.some((o) => o.ok && o.type === 'interpeller'), 'T4 : un ordre « interpeller » part', JSON.stringify(s));
  C.check(taps <= 3, `T4 : ${taps} touchers (§4 : 3)`);
  await step(page, 2.5);
  await rest();

  // ── T2 : pincer · toucher un lieu lointain · « Qui ▸ » · « Toute la compagnie » · « Donner l'ordre » ──
  taps = 1;
  // pincer pour voir loin (un geste)
  await page.evaluate(() => {
    const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
    t.map.zoomBy(1 / 2.5);
  });
  taps++;
  await frames(page, 3);
  const far = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const p = c.player.person();
    // un point de la chaussée à environ 1,3 km
    const out = { x: 0, z: 0 };
    for (const [dx, dz] of [[900, -900], [-900, -900], [900, 900], [-900, 900]]) {
      if (c.world.randomFreePoint(p.x + dx, p.z + dz, 60, 'road', () => 0.5, out)) return { x: out.x, z: out.z };
    }
    return null;
  });
  C.check(!!far, 'un lieu lointain sur la chaussée', JSON.stringify(far));
  await centre(far.x, far.z);
  await frames(page, 3);
  p = await screenOf(far.x, far.z);
  await tapAt(p.x, p.y);
  st = await tac();
  // une rue (le toucher accroche la voie la plus proche) : « Y aller » est sa ligne 6 ; un point : sa ligne 1
  if (st && st.kind === 'rue') await tapSel('[data-id="card-line-6"]');
  st = await tac();
  C.check(st && st.sheet === 'card' && /^Y aller/.test(st.lineLabel), 'toucher le lieu : sa fiche, « Y aller » surlignée', JSON.stringify(st));
  await tapSel('[data-id="card-who"]');
  st = await tac();
  C.check(st.sheet === 'qui', '« Qui ▸ » : la liste « Qui envoyer ? »', JSON.stringify(st));
  const wholeRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-id^="who-row-"]')];
    const r = rows.find((e) => /Toute la compagnie/.test(e.textContent || ''));
    return r ? r.dataset.id : null;
  });
  C.check(!!wholeRow, 'la liste propose « Toute la compagnie »');
  await tapSel(`[data-id="${wholeRow}"]`);
  st = await tac();
  C.check(st.sheet === 'card' && /Toute la compagnie|MISTRAL/.test(st.who || ''), 'la liste se referme, Qui = toute la compagnie', JSON.stringify(st));
  n0 = (await sends()).length;
  await tapSel('[data-id="card-send"]');
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  const company = await page.evaluate(() => window.__CRS.ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police')?.id ?? 0);
  C.check(s.length === 1 && s[0].ok && s[0].ids.includes(company), 'T2 : l’ordre part à la compagnie', JSON.stringify(s));
  const convoy = await page.evaluate((id) => {
    const core = window.__CRS.ctx.service('ui.command');
    const q = window.__CRS.ctx.squads.get(id);
    return { order: q ? String(q.order.type) : '', later: core.afterConvoy.has(id) };
  }, company);
  C.check(convoy.later || /embarquer|colonne/.test(convoy.order), 'T2 : loin : la compagnie embarque et part en véhicules', JSON.stringify(convoy));
  C.check(taps <= 7, `T2 : ${taps} touchers (§4 : 6 sur un point, 7 sur une rue où « Y aller » est la ligne 6)`);
  await step(page, 2.5);
  await rest();

  // ── une feuille à la fois ; S3 ──
  await tapSel('[data-id="intent-disperser"]');
  C.check(JSON.stringify(await sheetsOn()) === '["card"]', 'Disperser : la fiche seule');
  await tapSel('[data-id="tac-suivi"]');
  C.check(JSON.stringify(await sheetsOn()) === '["follow"]', '« Suivi » remplace la fiche (une feuille à la fois)', JSON.stringify(await sheetsOn()));
  const barHidden = await page.evaluate(() => { const b = document.querySelector('.ct-intents'); return !b || b.getBoundingClientRect().height === 0 || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden'; });
  C.check(barHidden, 'la barre du bas est masquée pendant une feuille');
  await tapSel('[data-id="tac-suivi"]');
  C.check(JSON.stringify(await sheetsOn()) === '["card"]', '« Suivi » refermé : la fiche « Disperser » revient', JSON.stringify(await sheetsOn()));
  await tapSel('[data-id="card-line-4"]');
  st = await tac();
  C.check(st.lineLabel === 'Disperser au gaz lacrymogène', 'ligne 4 : « Disperser au gaz lacrymogène »', st.lineLabel);
  n0 = (await sends()).length;
  await tapSel('[data-id="card-send"]');
  st = await tac();
  const s3 = await page.evaluate(() => document.querySelector('.ct-mount-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  C.check(st.sheet === 'confirm' && /sommations/i.test(s3), 'S3 : les étapes légales avant le gaz', s3.slice(0, 240));
  C.check((await sends()).length === n0, 'S3 : rien ne part avant la confirmation');
  await snap(page, 'commande-tel-S3-844x390');
} catch (e) {
  C.check(false, 'scénario interrompu', e && e.stack ? e.stack : String(e));
} finally {
  C.check(errors.length === 0, 'aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  C.done();
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
