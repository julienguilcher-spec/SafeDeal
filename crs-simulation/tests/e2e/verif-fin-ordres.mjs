// Testeur indépendant — CONTRÔLE FINAL, l'ordre du chef de groupe donné par l'INTERFACE est-il exécuté, et tient-il ?
//   Chronologie relevée toutes les 2 s après « En avant » (roue, touche F) : ordre en cours de l'unité, qui l'a donné, distance des
//   équipiers au point ORDONNÉ PAR LE JOUEUR (figé au moment de l'ordre). Variantes : ordre donné tôt (3 s) ou tard (40 s),
//   joueur immobile ou qui marche vers le point. Puis ordre « Ligne » par la carte tactique (clics réels).
// Usage : node tests/e2e/verif-fin-ordres.mjs [--at=3,40] [--walk=0,1] [--seed=11]
import { startServer, openPage, waitFor, frames, step, state, snap, hold, notices, sysErrors, makeChecker, args, J, R, rects } from './verif-fin-lib.mjs';
const tag = 'verif-fin-ordres';
const C = makeChecker(tag);
const report = { runs: [] };
const server = await startServer();
const seed = args.seed ?? '11';
const variants = [];
for (const at of (args.at ?? '3,40').split(',').map(Number)) for (const walk of (args.walk ?? '0,1').split(',').map(Number)) variants.push({ at, walk });
const allErrors = [];
let k = 0;
for (const v of variants) {
  k++;
  console.log(`[ordres] variante ${k} : ordre donné à ${v.at} s de jeu, joueur ${v.walk ? 'qui marche vers le point' : 'immobile'}`);
  const url = `${server.url}?autostart=paris&role=chef_groupe&place=${encodeURIComponent('Place de la Concorde')}&crowd=120&quality=bas&seed=${seed}&camera=tps&time=12&weather=clair`;
  const { browser, page, errors } = await openPage(url, { width: 1024, height: 576, pointerLock: false });
  const run = { ...v };
  report.runs.push(run);
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
    await frames(page, 4);
    await step(page, v.at);
    await page.evaluate(() => { const c = window.__CRS.ctx; const s = c.service('session.setup').summary; c.player.state.camYaw = s.heading; c.player.state.camPitch = -0.12; });
    await step(page, 0.3); await frames(page, 2);
    await page.keyboard.press('KeyF');
    await frames(page, 3); await page.waitForTimeout(400);
    let open = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null);
    if (!open) { await hold(page, 'KeyF', 1); await page.waitForTimeout(400); open = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null); }
    if (!C.check(open, `[${k}] la roue d’ordres s’ouvre (touche F)`)) { await browser.close(); continue; }
    // clic RÉEL de la souris au centre du secteur « En avant »
    const wedge = await page.evaluate(() => { const e = document.querySelector('[data-id="order-wheel"] .cw-wedge[data-index="0"]'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(wedge.x, wedge.y - 6); await frames(page, 1);
    await page.mouse.click(wedge.x, wedge.y - 6);
    await frames(page, 3);
    const o = await page.evaluate(() => {
      const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId);
      window.__pt = { x: sq.order.x, z: sq.order.z, me: me.id, t0: c.clock.now };
      const parent = c.squads.get(sq.parentId);
      return { type: sq.order.type, by: sq.order.issuedBy, me: me.id, d: Math.hypot(sq.order.x - me.x, sq.order.z - me.z), sectionLeader: parent ? parent.leaderId : 0, t: c.clock.now, screen: c.ui.current };
    });
    run.issued = o;
    if (!C.check(o.type === 'avancer' && o.by === o.me, `[${k}] « En avant » enregistré au nom du joueur`, `ordre « ${o.type} » par ${o.by} (joueur ${o.me}), point à ${R(o.d, 0)} m, à ${R(o.t, 0)} s de jeu ; notifications : ${(await notices(page)).join(' | ').slice(0, 140)}`)) { await snap(page, `${tag}-${k}-echec-roue`); await browser.close(); continue; }
    if (v.walk) {
      await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); c.player.state.camYaw = Math.atan2(window.__pt.x - me.x, window.__pt.z - me.z); });
      await page.keyboard.down('KeyW');
    }
    const trace = [];
    let arrivedAt = -1, replacedAt = -1, replacedBy = null, walking = !!v.walk;
    for (let t = 2; t <= 150; t += 2) {
      await step(page, 2);
      const r = await page.evaluate(() => {
        const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId); const pt = window.__pt;
        const d = sq.members.map((id) => c.people.get(id)).filter((p) => p && !p.isPlayer && p.vehicleId === 0).map((p) => Math.hypot(p.x - pt.x, p.z - pt.z));
        const by = c.people.get(sq.order.issuedBy);
        return { type: sq.order.type, by: sq.order.issuedBy, byName: by ? `${by.poste}` : '', mine: sq.order.issuedBy === pt.me, max: Math.max(...d), min: Math.min(...d), mean: d.reduce((a, b) => a + b, 0) / d.length, me: Math.hypot(me.x - pt.x, me.z - pt.z) };
      });
      trace.push({ t, ...r });
      if (walking && r.me < 1.5) { await page.keyboard.up('KeyW'); walking = false; }
      if (arrivedAt < 0 && r.max < 6) arrivedAt = t;
      if (replacedAt < 0 && !r.mine) { replacedAt = t; replacedBy = `${r.type} (par ${r.by}, poste ${r.byName})`; }
      if (arrivedAt >= 0 && t >= arrivedAt + 20) break;
      if (replacedAt >= 0 && t >= replacedAt + 30) break;
    }
    if (walking) await page.keyboard.up('KeyW');
    run.trace = trace; run.arrivedAt = arrivedAt; run.replacedAt = replacedAt; run.replacedBy = replacedBy;
    console.log('    ' + trace.filter((x, i) => i % 3 === 0 || i === trace.length - 1).map((x) => `${x.t}s:${x.type}${x.mine ? '*' : ''} ${R(x.min, 0)}–${R(x.max, 0)}m`).join('  '));
    C.check(arrivedAt >= 0, `[${k}] les équipiers rejoignent le point ordonné (tous à moins de 6 m)`, arrivedAt >= 0 ? `au bout de ${arrivedAt} s` : `jamais en ${trace[trace.length - 1].t} s ; au mieux ${R(Math.min(...trace.map((x) => x.max)), 0)} m pour le plus éloigné`);
    C.check(replacedAt < 0 || (arrivedAt >= 0 && replacedAt > arrivedAt), `[${k}] l’ordre du joueur n’est pas remplacé avant d’être exécuté`, replacedAt >= 0 ? `remplacé au bout de ${replacedAt} s par « ${replacedBy} »` : 'jamais remplacé');
    await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); c.player.state.camYaw = Math.atan2(window.__pt.x - me.x, window.__pt.z - me.z) + (Math.hypot(window.__pt.x - me.x, window.__pt.z - me.z) < 2 ? Math.PI : 0); c.player.state.camPitch = -0.15; });
    await step(page, 0.3);
    await snap(page, `${tag}-${k}-fin`);

    // ── carte tactique (dernière variante seulement) : unité → « Ligne » → glisser sur la carte ──
    if (k === variants.length) {
      await hold(page, 'Tab');
      await page.waitForTimeout(700); await frames(page, 3);
      const s = await state(page);
      C.check(s.screen === 'carte_tactique', 'TACTIQUE : Tab ouvre la carte', String(s.screen));
      const at = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const top = document.elementFromPoint(x, y); return { x, y, w: b.width, h: b.height, covered: !(top && (top === e || e.contains(top))), by: top ? (top.getAttribute('data-id') || top.className || top.tagName).toString().slice(0, 60) : '', text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), off: !!e.disabled }; }, sel);
      const mine = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-id^="unit-"]')].find((e) => /VOUS/.test(e.textContent || '') && /ALFA|BRAVO|CHARLIE|\d [A-Z]/.test(e.textContent || '') && !/^MISTRAL\s*VOUS/.test((e.textContent || '').trim())); const all = [...document.querySelectorAll('[data-id^="unit-"]')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()); if (b) b.setAttribute('data-vf', 'mine'); return { found: !!b, all }; });
      C.note('unités listées : ' + mine.all.join(' | '));
      const u = await at(mine.found ? '[data-vf="mine"]' : '[data-id^="unit-"]');
      if (u) { await page.mouse.click(u.x, u.y); await frames(page, 3); }
      const subs = await rects(page, '.ui-subtitles > *, .ui-subtitle, .ui-layer--notices .ui-sub');
      const vb = await at('[data-id="verb-ligne"]');
      run.tactique = { unit: u, verb: vb, subs: subs.length };
      C.check(vb && !vb.covered, 'TACTIQUE : le bouton « Ligne » est cliquable (rien ne le recouvre)', vb ? `recouvert : ${vb.covered}${vb.covered ? ' par ' + vb.by : ''} ; ${subs.length} sous-titre(s) radio affiché(s) par-dessus la carte` : 'bouton absent');
      await snap(page, `${tag}-tactique-1`);
      if (vb) {
        await page.mouse.click(vb.x, vb.y); await frames(page, 3);
        const box = await page.locator('[data-id="tac-map"]').boundingBox();
        const px = box.x + box.width * 0.45, py = box.y + box.height * 0.3;
        const before = await page.evaluate(() => { const c = window.__CRS.ctx; const sq = c.squads.get(c.player.person().squadId); return { type: sq.order.type, x: sq.order.x, z: sq.order.z, at: sq.order.issuedAt }; });
        await page.mouse.move(px, py); await page.mouse.down(); await frames(page, 2);
        await page.mouse.move(px + 60, py + 5, { steps: 5 }); await frames(page, 2); await page.mouse.up(); await frames(page, 3);
        await snap(page, `${tag}-tactique-2`);
        let after = await page.evaluate(() => { const c = window.__CRS.ctx; const sq = c.squads.get(c.player.person().squadId); return { type: sq.order.type, x: sq.order.x, z: sq.order.z, at: sq.order.issuedAt, by: sq.order.issuedBy, me: c.player.person().id }; });
        if (after.at === before.at) {
          // peut-être un simple clic suffit-il, ou une validation
          await page.mouse.click(px, py); await frames(page, 3);
          const confirm = (await rects(page, '[data-id="tactical"] button')).find((r) => /Valider|Confirmer|Donner l|Ordonner|Envoyer/.test(r.text));
          if (confirm) { await page.mouse.click(confirm.x + confirm.w / 2, confirm.y + confirm.h / 2); await frames(page, 3); }
          after = await page.evaluate(() => { const c = window.__CRS.ctx; const sq = c.squads.get(c.player.person().squadId); return { type: sq.order.type, x: sq.order.x, z: sq.order.z, at: sq.order.issuedAt, by: sq.order.issuedBy, me: c.player.person().id }; });
        }
        run.tactique.before = before; run.tactique.after = after;
        C.check(after.type === 'ligne' && after.by === after.me && after.at !== before.at, 'TACTIQUE : « Ligne » tracée sur la carte = ordre enregistré au nom du joueur', `« ${before.type} » → « ${after.type} » (par ${after.by}, joueur ${after.me}) ; notifications : ${(await notices(page)).join(' | ').slice(0, 160)}`);
        await snap(page, `${tag}-tactique-3`);
      }
      await hold(page, 'Tab'); await frames(page, 3);
      if ((await state(page)).screen !== null) { await hold(page, 'Escape'); await frames(page, 3); }
    }
    const se = await sysErrors(page);
    C.check(se.length === 0, `[${k}] aucun système en erreur`, se.join(', '));
  } catch (err) {
    C.check(false, `[${k}] exception`, String(err && err.stack ? err.stack : err).slice(0, 500));
    try { await snap(page, `${tag}-${k}-echec`); } catch { /* page fermée */ }
  }
  for (const e of errors) allErrors.push(e);
  await browser.close().catch(() => {});
}
C.check(allErrors.length === 0, 'zéro erreur console', allErrors.slice(0, 4).join(' | ').slice(0, 500));
report.errors = allErrors; report.failures = C.failures; report.notes = C.notes;
C.done(report);
await server.close().catch(() => {});
process.exit(0);
