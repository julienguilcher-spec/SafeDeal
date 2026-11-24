// Carte de commandement au CLAVIER SEUL (refonte du commandement, §4 et §5.1) — scénario navigateur.
// Ordinateur 1280 × 800, commandant à la place de la Concorde, aucune souris :
//   S0     au plus 22 boutons visibles ; rien ne recouvre le bandeau ; les touches du jeu (T V D S G H C R X E B N L
//          Espace) et la touche O du drone ne déclenchent aucune action de terrain pendant que la carte est ouverte ;
//   T3     N, Entrée : la nasse part (une unité par rue) ;
//   T1     B, 2, Entrée : « Barrer la rue, passants admis » (couper_circulation, targetId −2) ; B reste actif ;
//          deux Entrée de suite : un seul ordre ;
//   T8     (B actif) →, 4, Entrée : la rue est fermée aux voitures ;
//   T4     I, Entrée : un ordre « interpeller » part ;
//   T7     S, Entrée : les pompiers sont demandés ;
//   T5     D, 4, Entrée (S3 : les étapes), Entrée : la chaîne légale fait les 3 sommations, autorise le gaz et donne
//          l'ordre « disperser_gaz » (temps accéléré) ;
//   S1 à 1280 × 720 : la fiche ne défile pas.
// Le nombre de touches de chaque tâche est comparé à §4 (au plus). Captures commande-S0…S4-1280x800.png et
// commande-S1-1280x720.png dans tests/e2e/out.
// Usage : node tests/e2e/verif-commande-clavier.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, notices } from './verif-fin-lib.mjs';

const tag = 'verif-commande-clavier';
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: 1280, height: 800, pointerLock: false });

/** Nombre de touches de la tâche en cours. */
let keys = 0;
async function press(code, { shift = false, count = true } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down(code);
  await frames(page, 2);
  await page.keyboard.up(code);
  if (shift) await page.keyboard.up('Shift');
  await frames(page, 3);
  if (count) keys++;
}
/** Entrée : jamais moins de 0,6 s après un envoi (la garde de l'écran). */
async function enter() {
  await page.waitForTimeout(700);
  await press('Enter');
  await frames(page, 3);
}

const tac = () => page.evaluate(() => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  if (!t) return null;
  const s = t.state;
  return {
    intent: s.intent, sheet: s.sheet, visee: s.visee && s.visee.name, kind: s.visee && s.visee.kind, line: s.card && s.card.line,
    cands: s.candidates.length, candIndex: s.candIndex, who: s.who && s.who.label, sent: s.lastSent && s.lastSent.text,
    lineLabel: t.card && s.card ? (s.card.othersOpen ? t.card.others : t.card.lines)[s.card.line]?.label ?? '' : '',
  };
});
/** Ordres donnés depuis le début (relevés à chaque appel de core.issue). */
const sends = () => page.evaluate(() => window.__c6.slice());
const current = () => page.evaluate(() => window.__CRS.ctx.ui.current);
/** Revient au repos sans fermer la carte. */
const rest = () => page.evaluate(() => {
  const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical;
  for (let i = 0; i < 6 && (t.state.card || t.state.sheet !== 'none' || t.state.intent); i++) if (!t.back()) break;
});
/** Boutons visibles de la carte. */
const visibleButtons = () => page.evaluate(() => [...document.querySelectorAll('[data-id="tactical"] button')].filter((b) => {
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
}).map((b) => b.dataset.id || b.textContent.trim().slice(0, 24)));
/** La fiche : sa hauteur visible et sa hauteur totale (défilement). */
const cardScroll = () => page.evaluate(() => {
  const c = document.querySelector('.ct-mount-card');
  if (!c) return null;
  let worst = 0;
  for (const e of [c, ...c.querySelectorAll('*')]) {
    const cs = getComputedStyle(e);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll' || e === c) && e.clientHeight > 0) worst = Math.max(worst, e.scrollHeight - e.clientHeight);
  }
  return worst;
});

try {
  const q = new URLSearchParams({
    autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
    quality: 'bas', seed: '7', time: '12', weather: 'clair',
  });
  await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 3);
  // relevé de chaque ordre donné (core.issue est le seul passage des ordres de la carte et de la chaîne légale)
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__c6 = [];
    core.issue = (type, squads, geoms, targetId = 0, ...rest) => {
      const r = orig(type, squads, geoms, targetId, ...rest);
      window.__c6.push({ type: String(type), ids: squads.map((s) => s.id), targetId, ok: r.ok, t: window.__CRS.ctx.clock.now });
      return r;
    };
  });

  // ── S0 ──
  await press('Tab', { count: false });
  await page.waitForTimeout(500);
  await frames(page, 4);
  C.check((await current()) === 'carte_tactique', 'Tab ouvre la carte de commandement');
  // le modèle en deux phrases de la première ouverture : n'importe quelle touche le referme
  const b0 = await visibleButtons();
  C.check(b0.length <= 22, `S0 : au plus 22 boutons visibles (${b0.length})`, b0.join(' · '));
  C.check(b0.filter((id) => id.startsWith('intent-')).length === 6 && b0.includes('tac-more') && b0.includes('tac-legal'), 'S0 : six intentions, « Plus… » et la pastille légale');
  const chip = await page.evaluate(() => document.querySelector('[data-id="tac-legal"]').innerText.replace(/\s+/g, ' ').trim());
  C.check(/Sommations 0\/3 · Force : mains nues/.test(chip) && !/\d\s*$/.test(chip.replace(/0\/3/, '')), 'pastille légale en mots', chip);
  await snap(page, 'commande-S0-1280x800');
  const topOverlap = await page.evaluate(() => {
    const top = document.querySelector('.ct-top').getBoundingClientRect();
    const out = [];
    for (const e of document.querySelectorAll('.ui-sub-line, .ui-toast')) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top < top.bottom - 1 && r.bottom > top.top) out.push(e.textContent.slice(0, 40));
    }
    return out;
  });
  C.check(topOverlap.length === 0, 'rien ne recouvre le bandeau (sous-titres radio, messages)', topOverlap.join(' | '));

  // ── touches du jeu : aucune action de terrain tant que la carte est ouverte ──
  const field = () => page.evaluate(() => {
    const c = window.__CRS.ctx;
    const p = c.player.person();
    const feed = c.service('ui.drone');
    return {
      x: p ? Math.round(p.x * 10) : 0, z: p ? Math.round(p.z * 10) : 0, posture: p ? p.posture : '', cam: c.player.state.cameraMode,
      drone: feed && typeof feed.open === 'boolean' ? feed.open : false,
    };
  });
  const f0 = await field();
  const bad = [];
  for (const k of ['KeyT', 'KeyV', 'KeyD', 'KeyS', 'KeyG', 'KeyH', 'KeyC', 'KeyR', 'KeyX', 'KeyE', 'KeyB', 'KeyN', 'KeyL', 'Space', 'KeyO']) {
    await press(k, { count: false });
    await step(page, 0.3);
    const cur = await current();
    const f = await field();
    if (cur !== 'carte_tactique') bad.push(`${k} → écran ${cur}`);
    if (f.x !== f0.x || f.z !== f0.z) bad.push(`${k} → le joueur bouge`);
    if (f.posture !== f0.posture) bad.push(`${k} → posture ${f.posture}`);
    if (f.cam !== f0.cam) bad.push(`${k} → caméra ${f.cam}`);
    if (f.drone !== f0.drone) bad.push(`${k} → retour vidéo du drone`);
    // R ouvre « Rechercher un lieu » (le champ prend la main) ; V ralentit : on remet tout comme avant
    if (k === 'KeyR') await page.keyboard.press('Escape');
    if (k === 'KeyV') await press('KeyV', { count: false });
    await rest();
    await frames(page, 2);
  }
  C.check(bad.length === 0, 'aucune touche du jeu (T V D S G H C R X E B N L Espace) ni O ne déclenche une action de terrain', bad.join(' ; '));
  C.check(await page.evaluate(() => { const t = window.__CRS.game.systems.find((s) => s.id === 'ui:command').tactical; return !!t && t.state.sheet === 'none'; }), 'retour au repos');

  // ── T3 : N, Entrée ──
  keys = 0;
  let n0 = (await sends()).length;
  await press('KeyN');
  await step(page, 0.3);
  const t3 = await tac();
  C.check(t3 && t3.intent === 'encercler' && /Encercler \(nasse\)|Ouvrir une sortie filtrée/.test(t3.lineLabel), 'N : la fiche de la foule, « Encercler (nasse) » surlignée', JSON.stringify(t3));
  await enter();
  await step(page, 0.5);
  let s = (await sends()).slice(n0);
  C.check(s.length >= 1 && s.every((o) => o.ok && o.type === 'couper_circulation' && o.ids.length === 1), `T3 : la nasse part, une unité par rue (${s.length} unité(s))`, JSON.stringify(s.map((o) => o.ids)));
  // sur une place à 27 rues, les unités ne suffisent pas : « ✓ ORDRE DONNÉ » le dit
  const t3sent = (await tac()).sent || '';
  C.check(/barre|barrent/.test(t3sent) && (s.length >= 4 || /restent ouvertes/.test(t3sent)), 'T3 : « ✓ ORDRE DONNÉ » dit ce qui reste ouvert', t3sent);
  C.check(keys <= 2, `T3 : ${keys} touches carte ouverte (§4 : 3 avec Tab)`);
  await snap(page, 'commande-S4-1280x800');
  await step(page, 2.5);
  await rest();

  // ── T1 : B, 2, Entrée (passants admis) ──
  keys = 0;
  await press('KeyB');
  await step(page, 0.3);
  const t1 = await tac();
  C.check(t1 && t1.intent === 'bloquer' && t1.kind === 'rue' && t1.lineLabel === 'Barrer la rue', 'B : une rue d’issue, « Barrer la rue » surlignée', JSON.stringify(t1));
  C.check(t1 && !/^Passage piéton$/i.test(t1.visee || ''), 'B : la rue proposée a un vrai nom', t1 && t1.visee);
  await snap(page, 'commande-S1-1280x800');
  // S2 : Maj + Entrée ouvre la liste Qui ; Échap y revient
  await press('Enter', { shift: true, count: false });
  const qui = await tac();
  C.check(qui && qui.sheet === 'qui', 'Maj + Entrée : la liste « Qui envoyer ? »', JSON.stringify(qui));
  await snap(page, 'commande-S2-1280x800');
  await page.keyboard.press('Escape');
  await frames(page, 3);
  C.check((await tac()).sheet === 'card', 'Échap : retour à la fiche');
  await press('Digit2');
  const t1b = await tac();
  C.check(t1b.lineLabel === 'Barrer la rue, passants admis', '2 : « Barrer la rue, passants admis »', t1b.lineLabel);
  n0 = (await sends()).length;
  await enter();
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.length === 1 && s[0].ok && s[0].type === 'couper_circulation' && s[0].targetId === -2, 'T1 : couper_circulation, passants admis (targetId −2)', JSON.stringify(s));
  C.check(keys <= 3, `T1 : ${keys} touches carte ouverte (§4 : 4 avec Tab)`);
  const t1c = await tac();
  C.check(t1c.intent === 'bloquer' && t1c.candIndex === 1, 'B reste actif : la visée est sur la rue suivante', JSON.stringify(t1c));
  // deux Entrée de suite : un seul ordre
  n0 = (await sends()).length;
  await page.waitForTimeout(700);
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await frames(page, 4);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.length === 1, `double Entrée après un envoi : un seul ordre (${s.length})`);

  // ── T8 : (B actif) →, 4, Entrée : fermer aux voitures ──
  keys = 0;
  const closures0 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').traffic?.closures.length ?? -1);
  await page.waitForTimeout(700);
  await press('ArrowRight');
  await press('Digit4');
  const t8 = await tac();
  C.check(t8.lineLabel === 'Fermer aux voitures (barrières)', '4 : « Fermer aux voitures (barrières) »', t8.lineLabel);
  await enter();
  await step(page, 0.3);
  const closures1 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').traffic?.closures.length ?? -1);
  C.check(closures0 >= 0 && closures1 > closures0, `T8 : la rue est fermée aux voitures (${closures0} → ${closures1})`);
  C.check(keys <= 3, `T8 : ${keys} touches (§4 : 4 avec B)`);
  await step(page, 0.5);
  await rest();

  // ── T4 : I, Entrée ──
  keys = 0;
  n0 = (await sends()).length;
  await press('KeyI');
  const t4 = await tac();
  // (aucun fait constaté près du point visé : la ligne dit d'emblée « Aller constater » — intents.ts NO_FACT_LABEL ;
  // « Interpeller… » quand un auteur est là)
  C.check(t4 && t4.intent === 'interpeller' && /^(Aller constater|Interpeller)/.test(t4.lineLabel), 'I : « Aller constater » (ou « Interpeller… ») surlignée', JSON.stringify(t4));
  await enter();
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  C.check(s.some((o) => o.ok && o.type === 'interpeller'), 'T4 : un ordre « interpeller » part', JSON.stringify(s));
  C.check(keys <= 2, `T4 : ${keys} touches (§4 : 3 avec Tab)`);
  await step(page, 2.5);
  await rest();

  // ── T7 : S, Entrée ──
  keys = 0;
  const calls0 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').rescue?.calls.length ?? -1);
  await press('KeyS');
  const t7 = await tac();
  C.check(t7 && t7.intent === 'secours' && /pompiers/i.test(t7.lineLabel), 'S : les pompiers proposés', JSON.stringify(t7));
  await enter();
  await step(page, 0.3);
  const calls1 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').rescue?.calls.length ?? -1);
  C.check(calls0 >= 0 && calls1 > calls0, `T7 : les pompiers sont demandés (${calls0} → ${calls1})`);
  C.check(keys <= 2, `T7 : ${keys} touches (§4 : 3 avec Tab)`);
  await rest();

  // ── T5 : D, 4, Entrée (S3), Entrée : la chaîne légale ──
  keys = 0;
  n0 = (await sends()).length;
  await press('KeyD');
  await press('Digit4');
  const t5 = await tac();
  C.check(t5.lineLabel === 'Disperser au gaz lacrymogène', 'D puis 4 : « Disperser au gaz lacrymogène »', t5.lineLabel);
  await enter();
  const s3 = await tac();
  const s3text = await page.evaluate(() => document.querySelector('.ct-mount-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  C.check(s3.sheet === 'confirm' && /sommations/i.test(s3text) && /Faire les étapes dans l.ordre/.test(s3text), 'S3 : les étapes légales et « Faire les étapes dans l’ordre »', s3text.slice(0, 300));
  await snap(page, 'commande-S3-1280x800');
  await enter();
  C.check(keys <= 4, `T5 : ${keys} touches (§4 : 5 avec Tab)`);
  let chain = null;
  for (let i = 0; i < 60; i++) {
    await step(page, 5);
    chain = await page.evaluate(() => {
      const core = window.__CRS.ctx.service('ui.command');
      const st = core.legalChain.status();
      return { st: st && { stage: st.stage, text: st.text, reason: st.reason }, roe: window.__CRS.ctx.law.roe.sommation, gas: window.__c6.some((o) => o.type === 'disperser_gaz' && o.ok) };
    });
    if (chain.gas || (chain.st && (chain.st.stage === 'refus' || chain.st.stage === 'annule'))) break;
  }
  C.check(chain && chain.roe >= 3, `T5 : les 3 sommations sont faites (${chain && chain.roe})`, JSON.stringify(chain));
  C.check(chain && chain.gas, 'T5 : l’ordre « disperser_gaz » part après l’autorisation', JSON.stringify(chain));
  // les messages (bas à gauche de la carte) ne couvrent ni la rose des vents ni les boutons de la carte
  const covered = await page.evaluate(() => {
    const out = [];
    const widgets = [...document.querySelectorAll('.ct-wind, .ct-mapctl')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    for (const e of document.querySelectorAll('.ui-toast')) {
      const t = e.getBoundingClientRect();
      if (t.width <= 0 || getComputedStyle(e).display === 'none') continue;
      for (const w of widgets) if (t.left < w.right && t.right > w.left && t.top < w.bottom && t.bottom > w.top) out.push(e.textContent.slice(0, 40));
    }
    return out;
  });
  C.check(covered.length === 0, 'les messages ne couvrent ni la rose des vents ni + / − / Moi', covered.join(' | '));
  await rest();

  // ── S1 à 1280 × 720 : la fiche ne défile pas ──
  await page.setViewportSize({ width: 1280, height: 720 });
  await frames(page, 4);
  await press('KeyB', { count: false });
  await step(page, 0.3);
  const over = await cardScroll();
  C.check(over !== null && over <= 1, `fiche à 1280 × 720 sans défilement (${over} px de trop)`);
  await snap(page, 'commande-S1-1280x720');
  await rest();

  const n = await notices(page);
  C.note('messages : ' + JSON.stringify(n.slice(-8)));
} catch (e) {
  C.check(false, 'scénario interrompu', e && e.stack ? e.stack : String(e));
} finally {
  C.check(errors.length === 0, 'aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  C.done();
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
