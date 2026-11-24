// HUD de terrain, roue d'ordres et carte de l'exécutant (refonte du commandement, §6 ; ordres directs, §1.6) — scénario
// navigateur.
//   1. Ordinateur 1280 × 800, commandant à la Concorde : le bloc d'ordres (262 px) a la ligne d'état « AVEC VOUS · … »,
//      l'ordre prêt « Entrée  … » (le même texte que le moteur 'command.direct'), la ligne des touches « A avec moi · U
//      autre unité · F tous les ordres · Tab carte » et « Secours ici » F puis 7 ; plus de titre « ORDRES » ni de
//      « Suivez-moi à pied / en véhicules ». Entrée donne l'ordre affiché : la puce montre son ticket, « ⌫ annuler — … »
//      remplace les touches, un repère « … — Bloquer » est posé ; ⌫ l'annule. Un clic sur « U autre unité » change
//      l'unité de l'ordre prêt. Au clavier, la roue des ordres directs a 7 secteurs (1 3 4 5 6 7 8, le 2 en alias du 1) ;
//      F puis 1 et F puis 2 donnent « Avec moi », F puis 7 puis 1 appelle les pompiers là où se trouve le joueur.
//   2. Téléphone 844 × 390, commandant : deux pastilles de 44 px sous la mini-carte (jamais dessus) : « Avec moi » et
//      « Secours ici » ; « Avec moi » en UN toucher ; la puce d'état devient « ↶ Annuler — … » (44 px) pendant 5 s, et la
//      toucher annule ; la proposition de l'adjoint est un bandeau en haut au centre, ses boutons font 44 px.
//   3. CRS, ordinateur puis téléphone : la carte « Ma mission » commence par « ORDRE DU … », l'ordre, le lieu ; au
//      téléphone deux lignes, l'ordre jamais coupé.
// Usage : node tests/e2e/verif-hud-ordres.mjs
import { startServer, openPage, waitFor, frames, step, rects, overlap, makeChecker, snap, notices } from './verif-fin-lib.mjs';

const tag = 'verif-hud-ordres';
const C = makeChecker(tag);
const server = await startServer();
const allErrors = [];
const base = `${server.url}?autostart=paris&mode=libre&quality=bas&nomenu=1&place=${encodeURIComponent('Place de la Concorde')}&seed=11&time=12&weather=clair`;

async function ready(page) {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 4);
}

/** Texte visible d'un élément ('' s'il est absent ou caché). */
const text = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return '';
  const b = e.getBoundingClientRect();
  return b.width > 0 && b.height > 0 ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : '';
}, sel);

/** Ordres en cours de l'unité « Suivez-moi » du joueur et de ses sous-unités. */
const followOrders = (page) => page.evaluate(() => {
  const c = window.__CRS.ctx;
  const core = c.service('ui.command');
  const u = core.followUnit();
  if (!u) return [];
  return [u, ...c.squads.childrenOf(u.id)].map((s) => String(s.order.type));
});

/** F (appui bref : la roue reste affichée) puis les chiffres donnés. */
async function wheel(page, digits) {
  await page.keyboard.press('KeyF');
  await frames(page, 3);
  await page.waitForTimeout(300);
  let open = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null);
  if (!open) {
    await page.keyboard.down('KeyF'); await frames(page, 2); await page.keyboard.up('KeyF'); await frames(page, 3);
    open = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null);
  }
  const wedges = await page.evaluate(() => [...document.querySelectorAll('[data-id="order-wheel"] .cw-key')].map((k) => k.textContent));
  for (const d of digits) {
    await page.keyboard.press(d);
    await frames(page, 3);
    await page.waitForTimeout(150);
  }
  const still = await page.evaluate(() => window.__CRS.ctx.ui.current === 'roue_ordres');
  return { open, wedges, still };
}

// ───────────────────────────── 1. ordinateur, commandant ─────────────────────────────
{
  console.log('[1] ordinateur 1280 × 800, commandant');
  const { browser, page, errors } = await openPage(`${base}&role=commandant&rank=commandant&crowd=150`, { width: 1280, height: 800, pointerLock: false });
  try {
    await ready(page);
    await step(page, 6);
    await page.waitForTimeout(800);
    const block = (await rects(page, '[data-id="hud-orders"]'))[0];
    const state = await text(page, '[data-id="hud-state"]');
    const go = await text(page, '[data-id="hud-ready"]');
    const keys = (await text(page, '[data-id="hud-keys"]')).replace(/\s*·\s*/g, ' · ');
    const rescue = await text(page, '[data-id="quick-rescue"]');
    const head = await text(page, '[data-id="hud-orders"] .cq-head');
    const shown = await page.evaluate(() => window.__CRS.ctx.service('command.direct').ready());
    C.check(!!block && block.w <= 264, 'bloc d’ordres de 262 px sous la mini-carte', JSON.stringify(block));
    C.check(head === '' && !/Suivez-moi/.test(await text(page, '[data-id="hud-orders"]')), 'plus de titre « ORDRES » ni de « Suivez-moi à pied / en véhicules »');
    C.check(/^AVEC VOUS\b/.test(state), 'ligne d’état « AVEC VOUS · … »', state);
    C.check(!/SANS ORDRE|\bMONTE\b|\bDESCEND\b|EN FILE/.test(state), 'la ligne d’état ne dit jamais « SANS ORDRE », « MONTE », « DESCEND », « EN FILE »', state);
    if (shown && shown.rule !== 'i') C.check(go.replace(/\s+/g, ' ') === `Entrée ${shown.text}`.replace(/\s+/g, ' '), 'ordre prêt : « Entrée  » + la ligne du moteur', `« ${go} » / « ${shown.text} »`);
    else C.check(/^Visez une rue/.test(go), 'rien de visé : la ligne grise dit quoi viser', go);
    C.check(/^[AQ] avec moi · U autre unité · F tous les ordres · Tab carte$/.test(keys), 'ligne des touches (A en AZERTY, Q en QWERTY : la même touche)', keys);
    C.check(rescue.replace(/\s+/g, '') === 'SecoursiciFpuis7', '« Secours ici » F puis 7', rescue);
    const rows = await rects(page, '[data-id="hud-orders"] > *');
    C.check(!!block && rows.every((r) => r.x >= block.x - 1 && r.x + r.w <= block.x + block.w + 1), 'aucune ligne ne déborde du bloc', rows.map((r) => `${r.id || r.cls} ${r.w}`).join(', '));
    await snap(page, `${tag}-pc-commandant`);

    // un clic sur « U autre unité » (pavé tactile) : l'ordre prêt change d'unité
    const who0 = await page.evaluate(() => window.__CRS.ctx.service('command.direct').whoKey());
    await page.click('[data-id="hud-key-who"]');
    await frames(page, 3);
    const who1 = await page.evaluate(() => window.__CRS.ctx.service('command.direct').whoKey());
    C.check(who1 !== who0, 'un clic sur « U autre unité » choisit l’unité suivante', `${who0} → ${who1}`);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-id="hud-quick"]') !== null);
    C.check(!focused, 'le bouton cliqué ne garde pas le focus (Entrée ne le « recliquerait » pas)');
    await page.evaluate(() => window.__CRS.ctx.service('command.direct').setWho('auto'));
    await step(page, 1);

    // Entrée : l'ordre affiché part ; la puce montre son ticket, « ⌫ annuler — … », un repère « … — verbe ». La vue est
    // tournée aux flèches jusqu'à une rue (clavier seul, comme le joueur sur son Mac)
    const readyLine = () => page.evaluate(() => { const r = window.__CRS.ctx.service('command.direct').ready(); return r ? { enabled: r.enabled, text: r.text, rule: r.rule } : null; });
    let shownNow = await readyLine();
    for (let i = 0; i < 48 && !(shownNow && shownNow.rule === 'g' && shownNow.enabled); i++) {
      await page.keyboard.down('ArrowRight');
      await frames(page, 2);
      await page.keyboard.up('ArrowRight');
      await frames(page, 2);
      await step(page, 0.3);
      shownNow = await readyLine();
    }
    await step(page, 0.7);
    await frames(page, 3);
    const marked = await page.evaluate(() => [...document.querySelectorAll('.hud-marker:not([hidden])')].map((m) => `${m.getAttribute('data-kind')}:${m.textContent}`));
    C.check(marked.some((m) => /^designation(-person)?:/.test(m)), 'la désignation est marquée dans le monde avant l’appui', marked.join(' | '));
    shownNow = await readyLine();
    if (shownNow && shownNow.enabled) {
      await page.keyboard.press('Enter');
      await frames(page, 4);
      await page.waitForTimeout(400);
      const chip = await text(page, '[data-id="hud-unit"]');
      const k2 = (await text(page, '[data-id="hud-keys"]')).replace(/\s*·\s*/g, ' · ');
      const marks = await page.evaluate(() => [...document.querySelectorAll('.hud-marker:not([hidden])')].map((m) => `${m.getAttribute('data-kind')}:${m.textContent}`));
      C.check(/· reçu$|·.+(en route|descend|en place|✓)/.test(chip), 'Entrée : la puce montre le ticket de l’ordre', chip);
      C.check(/^⌫ annuler — /.test(k2), '« ⌫ annuler — … » remplace la ligne des touches', k2);
      C.check(marks.some((m) => /^ordre(-ok)?:/.test(m)), 'un repère est posé au point de l’ordre', marks.join(' | '));
      await snap(page, `${tag}-pc-apres-entree`);
      await page.keyboard.press('Backspace');
      await frames(page, 3);
      const undone = await page.evaluate(() => window.__CRS.ctx.service('command.direct').undoable());
      C.check(undone === null, '⌫ annule l’ordre (plus rien à annuler)');
      await step(page, 1);
    } else C.note(`ordre prêt inactif à ce moment (${JSON.stringify(shownNow)}) : Entrée non vérifiée`);

    let w = await wheel(page, ['Digit1']);
    C.check(w.open, 'F ouvre la roue d’ordres', w.wedges.join(' '));
    C.check(w.wedges.join(' ') === '1 3 4 5 6 7 8', 'roue de 7 secteurs : 1, 3 à 8 (le 2 : alias du 1)', w.wedges.join(' '));
    await step(page, 1);
    let o = await followOrders(page);
    C.check(!w.still && o.some((x) => x === 'suivre' || x === 'debarquer' || x === 'suivre_pied'), 'F puis 1 : « Avec moi », la compagnie suit le joueur à pied', o.join(', '));
    await step(page, 1);
    w = await wheel(page, ['Digit2']);
    await step(page, 1);
    o = await followOrders(page);
    // l'ancien « F puis 2 » (« Suivez-moi en véhicules ») : « Avec moi » — à pied, la compagnie le suit à pied
    C.check(!w.still && o.some((x) => x === 'suivre' || x === 'debarquer' || x === 'suivre_pied'), 'F puis 2 (alias de 1) : « Avec moi »', o.join(', '));
    const before = await page.evaluate(() => (window.__CRS.ctx.service('rescue.dispatch')?.calls ?? []).length);
    w = await wheel(page, ['Digit7']);
    const inner = await page.evaluate(() => [...document.querySelectorAll('[data-id="order-wheel"] .cw-label')].map((k) => k.textContent));
    C.check(inner.join(' | ') === 'Pompiers ici | SAMU ici', 'F puis 7 : couronne « Pompiers ici » / « SAMU ici »', inner.join(' | '));
    await snap(page, `${tag}-pc-roue-secours`);
    await page.keyboard.press('Digit1');
    await frames(page, 4);
    const call = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const me = c.player.person();
      const calls = c.service('rescue.dispatch')?.calls ?? [];
      const last = calls[calls.length - 1];
      return { n: calls.length, kind: last ? last.kind : '', d: last ? Math.hypot(last.x - me.x, last.z - me.z) : -1, screen: c.ui.current };
    });
    C.check(call.n === before + 1 && call.kind === 'pompiers' && call.d >= 0 && call.d < 5, 'F puis 7 puis 1 : pompiers demandés à la position du joueur', JSON.stringify(call));
    C.note('notifications : ' + (await notices(page)).slice(-3).join(' | '));
  } catch (e) {
    C.check(false, 'scénario ordinateur', String(e && e.stack ? e.stack : e));
  }
  allErrors.push(...errors);
  await browser.close();
}

// ───────────────────────────── 2. téléphone, commandant ─────────────────────────────
{
  console.log('[2] téléphone 844 × 390, commandant');
  const { browser, page, errors } = await openPage(`${base}&role=commandant&rank=commandant&crowd=150`, { width: 844, height: 390, mobile: true, pointerLock: false });
  try {
    await ready(page);
    await step(page, 6);
    // laisser à l'adjoint le temps de proposer la mise en place du dispositif (dite à la radio)
    for (let i = 0; i < 12; i++) {
      const has = await page.evaluate(() => (window.__CRS.ctx.service('police.command')?.proposals ?? []).some((p) => p.executable && p.saidAt >= 0));
      if (has) break;
      await step(page, 5);
    }
    await page.waitForTimeout(1200);
    await frames(page, 4);
    const chips = await rects(page, '[data-id="hud-quick"] .cm-btn');
    const mini = (await rects(page, '[data-id="minimap"]'))[0];
    C.check(chips.map((r) => r.id).join(',') === 'quick-with-me,quick-rescue', 'deux pastilles : « Avec moi » et « Secours ici »', chips.map((r) => `${r.id} « ${r.text} »`).join(' | '));
    C.check(chips.every((r) => r.h >= 44), 'pastilles de 44 px au moins', chips.map((r) => `${r.id} ${r.h}`).join(', '));
    C.check(!!mini && chips.every((r) => overlap(r, mini) === 0 && r.y >= mini.y + mini.h - 1), 'pastilles sous la mini-carte, jamais dessus', `${JSON.stringify(mini)} / ${chips.map((r) => `${r.x},${r.y} ${r.w}×${r.h}`).join(' ; ')}`);
    const hidden = await rects(page, '[data-id="hud-state"], [data-id="hud-ready"], [data-id="hud-keys"]');
    C.check(hidden.length === 0, 'au toucher, ni ligne d’état ni ordre prêt dans le bloc (la puce et la pastille du module tactile les portent)', hidden.map((r) => r.id).join(', '));
    const banner = await rects(page, '[data-id="hud-banner"] [data-id="hud-proposal"]');
    if (banner.length > 0) {
      const b = banner[0];
      C.check(Math.abs(b.x + b.w / 2 - 422) < 60 && b.y < 200, 'proposition de l’adjoint : bandeau en haut au centre', `« ${b.text} » ${b.x},${b.y} ${b.w}×${b.h}`);
      C.check(!mini || overlap(b, mini) === 0, 'le bandeau ne couvre pas la mini-carte');
      const subs = await rects(page, '.ui-sub-line');
      C.check(subs.every((r) => overlap(r, b) === 0 && chips.every((c) => overlap(r, c) === 0)), 'les sous-titres radio ne couvrent ni le bandeau ni les pastilles',
        subs.map((r) => `${r.x},${r.y} ${r.w}×${r.h} « ${r.text} »`).join(' | ') || 'aucun sous-titre affiché');
      const oui = await text(page, '[data-id="hud-banner"] [data-id="proposal-accept"]');
      C.check(oui === 'Oui', 'bouton « Oui » du bandeau', oui);
      const btns = await rects(page, '[data-id="hud-banner"] .cm-btn');
      C.check(btns.every((r) => r.h >= 44 && r.w >= 44), 'boutons du bandeau de 44 × 44 px au moins', btns.map((r) => `${r.id} ${r.w}×${r.h}`).join(', '));
    } else C.note('aucune proposition de l’adjoint à ce moment de la partie : bandeau non vérifié');
    await snap(page, `${tag}-tel-commandant`);
    const withMe = chips.find((r) => r.id === 'quick-with-me');
    if (withMe) {
      await page.touchscreen.tap(withMe.x + withMe.w / 2, withMe.y + withMe.h / 2);
      await frames(page, 3);
      await step(page, 1);
      const o = await followOrders(page);
      C.check(o.some((x) => x === 'suivre' || x === 'debarquer'), '« Avec moi » en UN toucher', o.join(', '));
      await page.waitForTimeout(400);
      await frames(page, 4);
      const undo = (await rects(page, '[data-id="hud-undo"]'))[0];
      C.check(!!undo && undo.h >= 44 && /^↶ Annuler — /.test(undo.text), 'la puce d’état devient « ↶ Annuler — … » (44 px)', JSON.stringify(undo));
      await snap(page, `${tag}-tel-annuler`);
      if (undo) {
        await page.touchscreen.tap(undo.x + undo.w / 2, undo.y + undo.h / 2);
        await frames(page, 3);
        const left = await page.evaluate(() => window.__CRS.ctx.service('command.direct').undoable());
        C.check(left === null, 'toucher « ↶ Annuler » annule (plus rien à annuler)');
      }
    }
  } catch (e) {
    C.check(false, 'scénario téléphone', String(e && e.stack ? e.stack : e));
  }
  allErrors.push(...errors);
  await browser.close();
}

// ───────────────────────────── 3. CRS : la carte « Ma mission », l'ordre d'abord ─────────────────────────────
for (const [label, opts] of [['ordinateur', { width: 1280, height: 800 }], ['téléphone', { width: 844, height: 390, mobile: true }]]) {
  console.log(`[3] CRS, ${label}`);
  const { browser, page, errors } = await openPage(`${base}&role=crs&rank=gardien&crowd=200`, { ...opts, pointerLock: false });
  try {
    await ready(page);
    await step(page, 8);
    // le commandant (IA) donne une ligne de barrage à la compagnie, 230 m plus loin
    const issued = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const me = c.player.person();
      let s = c.squads.get(me.squadId);
      for (let g = 0; s && s.parentId !== 0 && g < 8; g++) s = c.squads.get(s.parentId);
      if (!s || s.leaderId === 0) return false;
      c.squads.issue(s.id, { type: 'ligne', x: me.x + 230, z: me.z, heading: 0, width: 0, issuedBy: s.leaderId });
      return true;
    });
    C.check(issued, `[${label}] ordre de la compagnie donné par son chef`);
    await step(page, 2);
    await page.waitForTimeout(1200);
    await frames(page, 4);
    if (label === 'ordinateur') {
      const head = await text(page, '.hud-mis .hud-cap');
      const order = await text(page, '.hud-mis__order');
      const where = await text(page, '.hud-mis__where');
      const you = await text(page, '.hud-mis__you');
      C.check(/^ORDRE D(U|E) /.test(head), '« ORDRE DU … » en tête de la carte', head);
      C.check(order === 'Tenir la ligne', 'première ligne : l’ordre', order);
      C.check(/\d+\s?m/.test(where), 'deuxième ligne : le lieu et la distance', where);
      C.check(you.startsWith('Vous : '), '« Vous : … » : ce que fait le joueur', you);
    } else {
      const l1 = await text(page, '.hud-mis__l1');
      const l2 = await text(page, '.hud-mis__l2');
      const cut = await page.evaluate(() => { const b = document.querySelector('.hud-mis__l1 b'); return b ? b.scrollWidth > b.clientWidth + 1 : true; });
      const lines = await rects(page, '.hud-mis > *');
      C.check(l1.startsWith('Tenir la ligne'), 'téléphone, ligne 1 : l’ordre d’abord', l1);
      C.check(!cut, 'téléphone : l’ordre n’est jamais coupé');
      C.check(lines.length <= 2, 'téléphone : deux lignes exactement', lines.map((r) => r.cls).join(' | '));
      C.note(`ligne 2 : « ${l2} »`);
    }
    await snap(page, `${tag}-crs-${label === 'ordinateur' ? 'pc' : 'tel'}`);
  } catch (e) {
    C.check(false, `scénario CRS (${label})`, String(e && e.stack ? e.stack : e));
  }
  allErrors.push(...errors);
  await browser.close();
}

await server.close();
const real = allErrors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader/i.test(e));
C.check(real.length === 0, 'aucune erreur dans la page', real.slice(0, 3).join(' | '));
C.done();
process.exit(C.failures.length === 0 ? 0 : 1);
