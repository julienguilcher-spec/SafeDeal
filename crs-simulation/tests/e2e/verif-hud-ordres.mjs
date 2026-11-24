// HUD de terrain, roue d'ordres et carte de l'exécutant (refonte du commandement, §6) — scénario navigateur.
//   1. Ordinateur 1280 × 800, commandant à la Concorde : le bloc « ORDRES » est là avec ses 4 lignes (« Suivez-moi à
//      pied » F puis 1, « Suivez-moi en véhicules » F puis 2, « Secours ici » F puis 7, « Carte de commandement » Tab) ;
//      au clavier, F puis 1 et F puis 2 donnent suivre_pied / avec_moi à la compagnie, F puis 7 puis 1 appelle les
//      pompiers là où se trouve le joueur.
//   2. Téléphone 844 × 390, commandant : les pastilles sont sous la mini-carte (jamais dessus) ; une seule pastille
//      « Suivez-moi à pied » (à pied) qui donne l'ordre en UN toucher ; la proposition de l'adjoint est un bandeau en
//      haut au centre.
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
    const rows = await rects(page, '[data-id="hud-orders"] .cm-btn');
    const head = await text(page, '[data-id="hud-orders"] .cq-head');
    C.check(head.startsWith('ORDRES'), 'bloc titré « ORDRES » (touche F)', head);
    // libellé et touche sont deux éléments : on compare sans les espaces
    const labels = rows.map((r) => r.text.replace(/\s+/g, ''));
    C.check(rows.length === 4, 'le bloc a 4 lignes (sans drone engagé)', labels.join(' | '));
    const want = ['Suivez-moi à pied F puis 1', 'Suivez-moi en véhicules F puis 2', 'Secours ici F puis 7', 'Carte de commandement Tab'].map((x) => x.replace(/\s+/g, ''));
    C.check(want.every((w, i) => labels[i] === w), 'libellés et touches « F puis n »', labels.join(' | '));
    C.check(rows.every((r) => r.h >= 33), 'lignes d’au moins 34 px', rows.map((r) => r.h).join(', '));
    await snap(page, `${tag}-pc-commandant`);

    let w = await wheel(page, ['Digit1']);
    C.check(w.open, 'F ouvre la roue d’ordres', w.wedges.join(' '));
    C.check(w.wedges.join(' ') === '1 2 3 4 5 6 7 8', 'roue de 8 secteurs numérotés 1 à 8', w.wedges.join(' '));
    await step(page, 1);
    let o = await followOrders(page);
    C.check(!w.still && o.some((x) => x === 'suivre' || x === 'debarquer' || x === 'suivre_pied'), 'F puis 1 : la compagnie suit le joueur à pied', o.join(', '));
    w = await wheel(page, ['Digit2']);
    await step(page, 1);
    o = await followOrders(page);
    C.check(!w.still && o.some((x) => x === 'embarquer' || x === 'avec_moi'), 'F puis 2 : la compagnie embarque pour suivre son véhicule', o.join(', '));
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
    C.check(chips.map((r) => r.id).join(',') === 'quick-follow-foot,quick-rescue', 'deux pastilles : « Suivez-moi à pied » (à pied) et « Secours ici »', chips.map((r) => `${r.id} « ${r.text} »`).join(' | '));
    C.check(!!mini && chips.every((r) => overlap(r, mini) === 0 && r.y >= mini.y + mini.h - 1), 'pastilles sous la mini-carte, jamais dessus', `${JSON.stringify(mini)} / ${chips.map((r) => `${r.x},${r.y} ${r.w}×${r.h}`).join(' ; ')}`);
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
    } else C.note('aucune proposition de l’adjoint à ce moment de la partie : bandeau non vérifié');
    await snap(page, `${tag}-tel-commandant`);
    const foot = chips.find((r) => r.id === 'quick-follow-foot');
    if (foot) {
      await page.touchscreen.tap(foot.x + foot.w / 2, foot.y + foot.h / 2);
      await frames(page, 3);
      await step(page, 1);
      const o = await followOrders(page);
      C.check(o.some((x) => x === 'suivre' || x === 'debarquer'), '« Suivez-moi à pied » en UN toucher', o.join(', '));
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
