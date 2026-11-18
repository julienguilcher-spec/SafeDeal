// Testeur indépendant — carte de commandement sur téléphone 844×390 : les feuilles (« Suivi », « Plus… » et ses sections,
// « Cadre légal », la fiche d'un lieu) s'ouvrent-elles au doigt, une à la fois, et se referment-elles ?
// Usage : node tests/e2e/verif-tpm-tactique-tel.mjs [--role=chef_groupe] [--size=844x390]
import { startServer, openPage, waitFor, frames, state, snap, J, makeChecker, fingers } from './verif-tpm-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const role = args.role ?? 'chef_groupe';
const [W, H] = (args.size ?? '844x390').split('x').map(Number);
const tag = `verif-tpm-tactique-tel-${W}x${H}-${role}`;
const C = makeChecker(tag);
const server = await startServer();
const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&role=${role}&crowd=100`, { width: W, height: H, mobile: true });
const F = await fingers(page);
/** Feuilles ouvertes (points de montage de la colonne de droite), barre du bas, état de l'écran. */
const dump = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`; };
  const root = q('.ct');
  const right = q('.ct-right2');
  const bar = q('[data-id="tac-intents"]');
  const sys = window.__CRS.game.systems.find((s) => s.id === 'ui:command');
  const t = sys && sys.tactical;
  return {
    root: root ? root.className : null, right: right && getComputedStyle(right).display !== 'none' ? r(right) : null,
    mounts: ['follow', 'card', 'sheet'].filter((m) => q('.ct-mount-' + m)?.classList.contains('is-on')),
    bar: bar ? getComputedStyle(bar).display : null, sheet: t ? t.state.sheet : null, card: t && t.state.card ? t.state.card.repere.kind : null,
    screen: window.__CRS.ctx.ui.current, phase: window.__CRS.ctx.session.phase,
  };
});
const rectOf = (sel) => page.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, hit: h ? (h.dataset?.id || h.className || h.tagName).toString().slice(0, 40) : null, hitOk: !!h && (h === e || e.contains(h)) };
}, sel);
/** Commandes trop petites pour le doigt (< 36 px) dans la colonne de droite. */
const smallIn = () => page.evaluate(() => {
  const W0 = window.innerWidth, H0 = window.innerHeight;
  return [...document.querySelectorAll('.ct-right2 button, .ct-right2 [role="button"], .ct-right2 input')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
    .map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.id || (e.textContent || '').trim().slice(0, 18), w: Math.round(b.width), h: Math.round(b.height), out: b.left < -1 || b.right > W0 + 1 || b.top < -1 || b.bottom > H0 + 1 }; })
    .filter((b) => !b.out && Math.min(b.w, b.h) < 36);
});
async function tapSel(sel) {
  const r = await rectOf(sel);
  if (!r) return null;
  await F.tap(r.x, r.y); await frames(page, 5); await page.waitForTimeout(300);
  return r;
}
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 4);
  // ouverture par le bouton tactile « Tactique »
  const tb = await rectOf('.crs-touch .ct-l-pied.ct-k-tactical');
  await F.tap(tb.x, tb.y); await frames(page, 5); await page.waitForTimeout(500);
  let d = await dump();
  console.log('  ouverte : ' + J(d));
  C.check(d.screen === 'carte_tactique' && /is-compact/.test(d.root || '') && d.mounts.length === 0 && d.bar !== 'none', 'carte de commandement (téléphone) : au repos, aucune feuille, la barre du bas visible', J(d));
  await snap(page, `${tag}-0-ouverte`);
  // feuilles du bandeau : « Suivi », « Cadre légal » ; « Plus… » (barre du bas) et ses sections
  for (const [id, sheet, mount] of [['tac-suivi', 'suivi', 'follow'], ['tac-legal', 'legal', 'sheet'], ['tac-more', 'more', 'sheet']]) {
    const r = await tapSel(`[data-id="${id}"]`);
    if (!C.check(!!r, `bouton « ${id} » présent et visible`)) continue;
    d = await dump();
    console.log(`  doigt sur ${id} (cible ${Math.round(r.w)}×${Math.round(r.h)}, sous le doigt : ${r.hit}) → ${J(d)}`);
    C.check(d.sheet === sheet && d.mounts.length === 1 && d.mounts[0] === mount && !!d.right && d.bar === 'none', `carte (téléphone) : toucher « ${id} » ouvre une seule feuille, la barre du bas se cache`, J(d));
    await snap(page, `${tag}-${sheet}`);
    const small = await smallIn();
    if (small.length) C.check(false, `feuille « ${sheet} » : cibles tactiles d’au moins 36 px`, small.slice(0, 8).map((b) => `${b.id} ${b.w}×${b.h}`).join(', '));
    if (sheet === 'more') {
      for (const sec of ['tab-circulation', 'tab-journal']) {
        const rs = await tapSel(`[data-id="${sec}"]`);
        if (!rs) { C.note(`« Plus… » : pas d’entrée ${sec} pour ce poste`); continue; }
        await snap(page, `${tag}-${sec}`);
        const smallS = await smallIn();
        if (smallS.length) C.check(false, `section « ${sec} » : cibles tactiles d’au moins 36 px`, smallS.slice(0, 8).map((b) => `${b.id} ${b.w}×${b.h}`).join(', '));
        await tapSel('[data-id="more-back"]');
        C.check((await dump()).sheet === 'more', `« ‹ Plus… » : retour au menu depuis ${sec}`);
      }
    }
    // second toucher (même bouton, ou ✕ de la feuille) : la referme, la carte redevient entière
    const again = await rectOf(`[data-id="${id}"]`);
    if (again && again.hitOk) await F.tap(again.x, again.y);
    else await tapSel(sheet === 'more' ? '[data-id="more-close"]' : sheet === 'legal' ? '[data-id="legal-close"]' : `[data-id="${id}"]`);
    await frames(page, 5); await page.waitForTimeout(300);
    const d2 = await dump();
    C.check(d2.sheet === 'none' && d2.mounts.length === 0, `second toucher sur « ${id} » : referme la feuille (la carte redevient visible)`, J(d2));
  }
  // toucher la carte : la fiche du lieu s'ouvre dans la feuille (jamais d'ordre)
  const n0 = await page.evaluate(() => window.__CRS.ctx.service('ui.command').issued.length);
  await F.tap(W * 0.45, H * 0.55); await frames(page, 5); await page.waitForTimeout(400);
  d = await dump();
  await snap(page, `${tag}-toucher-carte`);
  console.log('  après un toucher sur la carte : ' + J(d));
  C.check(d.sheet === 'card' && !!d.card && d.mounts.length === 1 && d.mounts[0] === 'card', 'toucher la carte : la fiche du repère, seule feuille ouverte', J(d));
  C.check((await page.evaluate(() => window.__CRS.ctx.service('ui.command').issued.length)) === n0, 'toucher la carte ne donne aucun ordre');
  const small = await smallIn();
  if (small.length) C.check(false, 'fiche : cibles tactiles d’au moins 36 px', small.slice(0, 8).map((b) => `${b.id} ${b.w}×${b.h}`).join(', '));
  const back = await tapSel('[data-id="card-back"]');
  C.check(!!back && (await dump()).sheet === 'none', '✕ de la fiche : la feuille se referme');
  const cl = await rectOf('[data-id="tac-close"]');
  console.log('  bouton Fermer : ' + J(cl));
  if (cl) { await F.tap(cl.x, cl.y); await frames(page, 5); }
  const s = await state(page);
  C.check(s.screen === null, 'carte refermée au doigt par « Fermer »', `${s.screen} (sous le doigt : ${cl ? cl.hit : '—'})`);
} catch (err) { C.check(false, 'exception', String(err && err.stack ? err.stack : err).slice(0, 400)); }
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 3).join(' | ').slice(0, 500));
C.done({ failures: C.failures, notes: C.notes, errors });
await browser.close().catch(() => {}); await server.close().catch(() => {}); process.exit(C.failures.length === 0 ? 0 : 1);
