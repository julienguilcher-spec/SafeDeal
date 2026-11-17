// Testeur indépendant — carte tactique sur téléphone 844×390 : les volets (Ordres, Circulation, Journal, unités) s'ouvrent-ils au doigt ?
import { startServer, openPage, waitFor, frames, state, snap, J, makeChecker, fingers } from './verif-tpm-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const role = args.role ?? 'chef_groupe';
const [W, H] = (args.size ?? '844x390').split('x').map(Number);
const tag = `verif-tpm-tactique-tel-${W}x${H}-${role}`;
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&role=${role}&crowd=100`, { width: W, height: H, mobile: true });
const F = await fingers(page);
const dump = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`; };
  const right = q('.ct-right'), panes = q('.ct-panes'), left = q('.ct-left'), root = q('.ct');
  return { root: root ? root.className : null, right: right ? right.className : null, panesDisplay: panes ? getComputedStyle(panes).display : null, panes: r(panes), left: left ? left.className : null, leftRect: r(left),
    tabs: [...document.querySelectorAll('.ct-tab')].map((e) => `${e.dataset.id}${e.classList.contains('is-on') ? '*' : ''}@${r(e)}`), screen: window.__CRS.ctx.ui.current, phase: window.__CRS.ctx.session.phase };
});
const rectOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, hit: h ? (h.dataset?.id || h.className || h.tagName).toString().slice(0, 40) : null, hitOk: !!h && (h === e || e.contains(h)) }; }, sel);
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 4);
  // ouverture par le bouton tactile « Tactique »
  const tb = await rectOf('.crs-touch .ct-l-pied.ct-k-tactical');
  await F.tap(tb.x, tb.y); await frames(page, 5); await page.waitForTimeout(500);
  console.log('  ouverte : ' + J(await dump()));
  await snap(page, `${tag}-0-ouverte`);
  for (const id of (args.only === 'unites' ? [] : ['tab-ordres', 'tab-circulation', 'tab-journal'])) {
    const r = await rectOf(`.ct-tab[data-id="${id}"]`);
    if (!r) continue;
    await F.tap(r.x, r.y); await frames(page, 5); await page.waitForTimeout(400);
    const d = await dump();
    console.log(`  doigt sur ${id} (cible ${Math.round(r.w)}×${Math.round(r.h)}, sous le doigt : ${r.hit}) → droite « ${d.right} », volet ${d.panesDisplay} ${d.panes}`);
    C.check(/is-open/.test(d.right || '') && d.panesDisplay !== 'none', `carte tactique (téléphone) : toucher l’onglet « ${id} » ouvre son volet`, `classe ${d.right}, volet ${d.panesDisplay} ${d.panes}`);
    await snap(page, `${tag}-${id}`);
    const inside = await page.evaluate(() => { const W = window.innerWidth, H = window.innerHeight; return [...document.querySelectorAll('.ct-panes button, .ct-panes [role="button"], .ct-panes input, .ct-panes select')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.id || (e.textContent || '').trim().slice(0, 18), w: Math.round(b.width), h: Math.round(b.height), out: b.left < -1 || b.right > W + 1 || b.top < -1 || b.bottom > H + 1 }; }); });
    const small = inside.filter((b) => !b.out && Math.min(b.w, b.h) < 36);
    console.log(`    ${inside.length} commandes dans le volet ; petites (< 36 px) : ${small.slice(0, 8).map((b) => `${b.id} ${b.w}×${b.h}`).join(', ') || 'aucune'}`);
    if (small.length) C.check(false, `volet « ${id} » : cibles tactiles d’au moins 36 px`, small.slice(0, 8).map((b) => `${b.id} ${b.w}×${b.h}`).join(', '));
    // second toucher : referme
    const r2 = await rectOf(`.ct-tab[data-id="${id}"]`);
    await F.tap(r2.x, r2.y); await frames(page, 5); await page.waitForTimeout(300);
    const d2 = await dump();
    C.check(!/is-open/.test(d2.right || ''), `second toucher sur « ${id} » : referme le volet (la carte redevient visible)`, `classe ${d2.right}`);
  }
  // volet des unités (outil en haut à gauche)
  const tu = await rectOf('.ct-tool-units');
  console.log('  outil unités : ' + J(tu) + ' ; état : ' + J(await page.evaluate(() => { const b = document.querySelector('.ct-tool-units'); return { cls: b?.className, disp: b ? getComputedStyle(b).display : null, root: document.querySelector('.ct')?.className }; })));
  if (tu) { await F.tap(tu.x, tu.y); await frames(page, 5); await page.waitForTimeout(400); const d = await dump(); console.log('  outil unités → gauche « ' + d.left + ' » ' + d.leftRect); C.check(/is-open/.test(d.left || ''), 'carte tactique (téléphone) : le volet des unités s’ouvre au doigt', `${d.left} ${d.leftRect}`);
    if (!/is-open/.test(d.left || '')) { await page.evaluate(() => document.querySelector('.ct-tool-units').click()); await frames(page, 5); await page.waitForTimeout(300); const d3 = await dump(); console.log('  par element.click() → gauche « ' + d3.left + ' » ' + d3.leftRect + ' ; racine ' + d3.root); } await snap(page, `${tag}-unites`);
    // sélectionner l'unité puis donner un ordre : la roue / le menu apparaît-il ?
    const u = await rectOf('.ct-left [data-id^="unit-"]');
    if (u) { await F.tap(u.x, u.y); await frames(page, 5); await page.waitForTimeout(300); await snap(page, `${tag}-unite-choisie`); }
    await F.tap(tu.x, tu.y); await frames(page, 4);
  } else C.note('outil « unités » introuvable');
  // toucher la carte : le menu d'ordres s'ouvre-t-il ? (chef de groupe)
  await F.tap(W * 0.45, H * 0.6); await frames(page, 5); await page.waitForTimeout(400);
  await snap(page, `${tag}-toucher-carte`);
  const pop = await page.evaluate(() => [...document.querySelectorAll('.ct [class*="pop"], .ct [class*="menu"], .ct [class*="quick"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => `${e.className.toString().slice(0, 30)}:${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)}`));
  console.log('  après un toucher sur la carte : ' + J(pop));
  const cl = await rectOf('[data-id="tac-close"]');
  console.log('  bouton Fermer : ' + J(cl));
  if (cl) { await F.tap(cl.x, cl.y); await frames(page, 5); }
  const s = await state(page);
  C.check(s.screen === null, 'carte tactique refermée au doigt par « Fermer »', `${s.screen} (sous le doigt : ${cl ? cl.hit : '—'})`);
} catch (err) { C.check(false, 'exception', String(err && err.stack ? err.stack : err).slice(0, 400)); }
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 3).join(' | ').slice(0, 500));
C.done({ failures: C.failures, notes: C.notes, errors });
await browser.close().catch(() => {}); await server.close().catch(() => {}); process.exit(0);
