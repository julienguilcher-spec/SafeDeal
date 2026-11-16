// Testeur indépendant — CONTRÔLE FINAL, chef de groupe place de la Concorde :
//   A. les collègues bougent-ils d'eux-mêmes (commandant IA) ? où part le groupe du joueur ?
//   B. ordre donné PAR L'INTERFACE (roue d'ordres : touche F puis clic sur « En avant ») : est-il exécuté, en combien de temps,
//      joueur immobile puis joueur qui marche ?
//   C. ordre donné par la CARTE TACTIQUE (unité → verbe → clic sur la carte) ;
//   D. manette : Select → plan → carte tactique → jeu ;
//   E. fourgon : nez vers la sortie, rouler tout droit ; puis renverser VOLONTAIREMENT un collègue : faute relevée et annoncée ?
// Usage : node tests/e2e/verif-fin-chef.mjs [--only=ABCDE] [--seed=11]
import { startServer, openPage, waitFor, frames, step, state, snap, hold, notices, sysErrors, census, makeChecker, args, J, R, installPad, PAD, padButton } from './verif-fin-lib.mjs';

const tag = 'verif-fin-chef';
const C = makeChecker(tag);
const parts = (args.only ?? 'ABCDE').toUpperCase();
const seed = args.seed ?? '11';
const report = {};
const server = await startServer();
const url = `${server.url}?autostart=paris&role=chef_groupe&place=${encodeURIComponent('Place de la Concorde')}&crowd=120&quality=bas&seed=${seed}&camera=tps&time=12&weather=clair`;
const { browser, page, errors } = await openPage(url, { width: 1024, height: 576, pointerLock: false });
const mates = () => page.evaluate(() => {
  const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId);
  const list = sq.members.map((id) => c.people.get(id)).filter((p) => p && !p.isPlayer);
  return { name: sq.name, leader: sq.leaderId === me.id, order: sq.order.type, by: sq.order.issuedBy, ox: sq.order.x, oz: sq.order.z, me: { x: me.x, z: me.z },
    mates: list.map((p) => ({ id: p.id, poste: p.poste, x: p.x, z: p.z, d: Math.hypot(p.x - me.x, p.z - me.z), veh: p.vehicleId })) };
});
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 4);
  const cs = await census(page);
  report.census = cs;
  console.log('  recensement : ' + J(cs));
  await snap(page, tag + '-01-depart');
  const m0 = await mates();
  report.depart = m0;
  C.check(m0.leader && m0.mates.length >= 4, 'le joueur est chef de son groupe', `${m0.name}, ${m0.mates.length} équipiers à ${m0.mates.map((q) => R(q.d, 0)).join(', ')} m`);

  if (parts.includes('A')) {
    // ── A. sans rien faire pendant 40 s ──
    const before = await page.evaluate(() => window.__CRS.ctx.people.list.filter((q) => q.faction === 'police' && !q.isPlayer && q.vehicleId === 0).map((q) => ({ id: q.id, x: q.x, z: q.z })));
    await step(page, 40);
    const moved = await page.evaluate((b) => { const c = window.__CRS.ctx; let n = 0; for (const q of b) { const p = c.people.get(q.id); if (p && Math.hypot(p.x - q.x, p.z - q.z) > 5) n++; } return { n, total: b.length, radio: c.radio.log.length, last: c.radio.log.slice(-4).map((m) => `${m.from} : ${m.text.slice(0, 90)}`) }; }, before);
    report.autonomie = moved;
    C.check(moved.n >= 8, 'COLLÈGUES : les unités manœuvrent d’elles-mêmes (commandant IA)', `${moved.n} agents sur ${moved.total} ont bougé de plus de 5 m en 40 s ; ${moved.radio} messages radio`);
    for (const l of moved.last) C.note('radio : ' + l);
    const m1 = await mates();
    report.apres40s = m1;
    const far = Math.max(...m1.mates.map((q) => q.d));
    C.note(`groupe du joueur après 40 s sans rien faire : ordre « ${m1.order} » (donné par ${m1.by}), équipiers à ${m1.mates.map((q) => R(q.d, 0)).join(', ')} m du joueur resté sur place`);
    report.chefLaisse = far;
    const hud = await page.evaluate(() => { const e = document.querySelector('[data-id="hud-unit"]'); return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; });
    C.note(`HUD unité : « ${hud} » ; notifications : ${(await notices(page)).join(' | ').slice(0, 200)}`);
    await snap(page, tag + '-02-apres-40s');
  }

  if (parts.includes('B')) {
    // ── B. ordre par la roue : regard devant soi, appui bref sur F, clic sur « En avant » ──
    await page.evaluate(() => { const c = window.__CRS.ctx; const s = c.service('session.setup').summary; c.player.state.camYaw = s.heading; c.player.state.camPitch = -0.12; });
    await step(page, 0.3); await frames(page, 2);
    await page.keyboard.press('KeyF');
    await frames(page, 3); await page.waitForTimeout(400);
    let s = await state(page);
    let wheelOpen = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null);
    if (!wheelOpen) { await hold(page, 'KeyF', 1); await page.waitForTimeout(400); wheelOpen = await page.evaluate(() => document.querySelector('[data-id="order-wheel"] .cw-wedge') !== null); }
    C.check(wheelOpen, 'ROUE : la touche F ouvre la roue d’ordres du chef de groupe', `écran « ${s.screen} »`);
    await snap(page, tag + '-03-roue');
    if (wheelOpen) {
      const labels = await page.evaluate(() => [...document.querySelectorAll('[data-id="order-wheel"] text, [data-id="order-wheel"] .cw-label')].map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 24));
      C.note('secteurs : ' + labels.join(' · '));
      await page.locator('[data-id="order-wheel"] .cw-wedge[data-index="0"]').click({ force: true });
      await frames(page, 3);
    }
    const o = await mates();
    const myId = await page.evaluate(() => window.__CRS.ctx.player.person().id);
    report.ordreRoue = { order: o.order, by: o.by, me: myId, dx: o.ox - o.me.x, dz: o.oz - o.me.z };
    const dTarget = Math.hypot(o.ox - o.me.x, o.oz - o.me.z);
    C.check(o.order === 'avancer' && o.by === myId, 'ROUE : l’ordre « En avant » est enregistré au nom du joueur', `ordre « ${o.order} » par ${o.by}, point à ${R(dTarget, 0)} m ; notifications : ${(await notices(page)).join(' | ').slice(0, 160)}`);
    const toTarget = () => page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId); return { order: sq.order.type, by: sq.order.issuedBy, d: sq.members.map((id) => c.people.get(id)).filter((p) => p && !p.isPlayer && p.vehicleId === 0).map((p) => Math.hypot(p.x - sq.order.x, p.z - sq.order.z)), me: Math.hypot(me.x - sq.order.x, me.z - sq.order.z) }; });
    const t0 = await toTarget();
    // joueur immobile, 60 s
    const trace = [];
    for (let i = 0; i < 6; i++) { await step(page, 10); const t = await toTarget(); trace.push({ t: (i + 1) * 10, max: Math.max(...t.d), mean: t.d.reduce((a, b) => a + b, 0) / t.d.length, order: t.order }); }
    report.ordreImmobile = { d0: t0.d, trace };
    const t60 = await toTarget();
    C.note(`joueur immobile : distance des équipiers au point ordonné ${t0.d.map((d) => R(d, 0)).join(', ')} m → après 60 s ${t60.d.map((d) => R(d, 0)).join(', ')} m (ordre en cours « ${t60.order} »)`);
    const arrivedStill = t60.d.every((d) => d < 6);
    C.check(arrivedStill, 'ROUE : joueur immobile, les équipiers ont rejoint le point en 60 s', trace.map((x) => `${x.t}s:${R(x.max, 0)}m`).join(' '));
    await snap(page, tag + '-04-ordre-60s');
    // puis le joueur marche vers le point ; on attend jusqu'à 120 s de plus
    await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId); c.player.state.camYaw = Math.atan2(sq.order.x - me.x, sq.order.z - me.z); c.player.state.camPitch = -0.1; });
    await page.keyboard.down('KeyW');
    let waited = 0; let t = t60;
    while (waited < 120 && !t.d.every((d) => d < 6)) {
      await step(page, 5); waited += 5; t = await toTarget();
      if (t.me < 1.5) await page.keyboard.up('KeyW');
    }
    await page.keyboard.up('KeyW');
    report.ordreMarche = { waited, d: t.d, order: t.order, by: t.by };
    C.check(t.d.every((d) => d < 6) && t.order === 'avancer', 'ROUE : le joueur marche vers le point, les équipiers l’y rejoignent', `${waited} s après son départ : ${t.d.map((d) => R(d, 1)).join(', ')} m ; ordre « ${t.order} »`);
    await step(page, 0.3);
    await snap(page, tag + '-05-ordre-execute');
  }

  if (parts.includes('C')) {
    // ── C. carte tactique : unité → « ligne » → clic sur la carte ──
    await hold(page, 'Tab');
    await page.waitForTimeout(700); await frames(page, 3);
    let s = await state(page);
    C.check(s.screen === 'carte_tactique', 'TACTIQUE : Tab ouvre la carte tactique', String(s.screen));
    await snap(page, tag + '-06-tactique');
    const ui = await page.evaluate(() => ({ units: [...document.querySelectorAll('[data-id^="unit-"]')].map((e) => ({ id: e.dataset.id, t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })), verbs: [...document.querySelectorAll('[data-id^="verb-"]')].map((e) => ({ id: e.dataset.id, off: e.disabled, vis: e.getBoundingClientRect().width > 0 })), tabs: [...document.querySelectorAll('[data-id="tactical"] [data-id^="tab-"]')].map((e) => e.dataset.id) }));
    report.tactique = ui;
    C.note(`carte tactique : ${ui.units.length} unité(s) listée(s) (${ui.units.slice(0, 4).map((u) => u.t).join(' | ')}), ${ui.verbs.filter((v) => !v.off).length} verbes actifs sur ${ui.verbs.length}, onglets ${ui.tabs.join(', ')}`);
    try {
      const before = await mates();
      if (ui.units.length) { await page.locator('[data-id^="unit-"]').first().click(); await frames(page, 2); }
      const tabOrders = page.locator('[data-id="tactical"] [data-id="tab-ordres"], [data-id="tactical"] [data-id="tab-orders"]');
      if (await tabOrders.count()) { await tabOrders.first().click(); await frames(page, 2); }
      const verb = page.locator('[data-id="verb-ligne"]');
      await verb.first().scrollIntoViewIfNeeded({ timeout: 5000 });
      await verb.first().click({ timeout: 5000 });
      await frames(page, 2);
      const box = await page.locator('[data-id="tac-map"]').boundingBox();
      const px = box.x + box.width * 0.5 + 40, py = box.y + box.height * 0.5 - 30;
      await page.mouse.move(px, py);
      await page.mouse.down(); await frames(page, 2); await page.mouse.move(px + 50, py + 10, { steps: 4 }); await frames(page, 2); await page.mouse.up();
      await frames(page, 3);
      await snap(page, tag + '-07-tactique-ordre');
      // validation éventuelle
      const confirm = page.locator('[data-id="tactical"] button').filter({ hasText: /Valider|Confirmer|Donner|Ordonner|Envoyer/ });
      if (await confirm.count()) { await confirm.first().click(); await frames(page, 3); }
      const after = await mates();
      report.ordreTactique = { before: before.order, after: after.order, by: after.by, moved: Math.hypot(after.ox - before.ox, after.oz - before.oz) };
      C.check(after.order === 'ligne', 'TACTIQUE : l’ordre « En ligne » posé sur la carte est enregistré', `ordre « ${before.order} » → « ${after.order} », point déplacé de ${R(Math.hypot(after.ox - before.ox, after.oz - before.oz), 0)} m ; notifications : ${(await notices(page)).join(' | ').slice(0, 160)}`);
    } catch (err) {
      C.check(false, 'TACTIQUE : donner un ordre par la carte', String(err).slice(0, 300));
    }
    await hold(page, 'Tab');
    await frames(page, 3);
    s = await state(page);
    if (s.screen !== null) { await hold(page, 'Escape'); await frames(page, 3); s = await state(page); }
    C.check(s.screen === null && s.phase === 'playing', 'TACTIQUE : la carte se referme, le jeu reprend', `${s.screen} / ${s.phase}`);
    if (report.ordreTactique && report.ordreTactique.after === 'ligne') {
      const tgt = await mates();
      await step(page, 45);
      const aft = await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId); return sq.members.map((id) => c.people.get(id)).filter((p) => p && !p.isPlayer && p.vehicleId === 0).map((p) => Math.hypot(p.x - sq.order.x, p.z - sq.order.z)); });
      C.check(aft.every((d) => d < 8), 'TACTIQUE : 45 s plus tard les équipiers sont en ligne sur le point', aft.map((d) => R(d, 1)).join(', ') + ' m');
      await page.evaluate(() => { const c = window.__CRS.ctx; const me = c.player.person(); const sq = c.squads.get(me.squadId); c.player.state.camYaw = Math.atan2(sq.order.x - me.x, sq.order.z - me.z); c.player.state.camPitch = -0.1; });
      await step(page, 0.3);
      await snap(page, tag + '-08-ligne');
    }
  }

  if (parts.includes('D')) {
    // ── D. manette ──
    await installPad(page);
    await frames(page, 6);
    const pad = async (i) => { await padButton(page, i, 1); await frames(page, 3); await padButton(page, i, 0); await frames(page, 3); };
    await pad(PAD.SELECT); await page.waitForTimeout(300);
    const s1 = (await state(page)).screen;
    await pad(PAD.SELECT); await page.waitForTimeout(300);
    const s2 = (await state(page)).screen;
    if (s2 === 'carte_tactique') await snap(page, tag + '-09-manette-tactique');
    await pad(PAD.SELECT); await page.waitForTimeout(300);
    const s3 = await state(page);
    C.check(s1 === 'carte' && s2 === 'carte_tactique' && s3.screen === null && s3.phase === 'playing', 'MANETTE : Select → plan → carte tactique → jeu', `${s1} → ${s2} → ${s3.screen} (${s3.phase})`);
    await page.evaluate(() => { window.__pad.connected = false; Object.defineProperty(navigator, 'getGamepads', { value: () => [null, null, null, null], configurable: true }); window.dispatchEvent(new Event('gamepaddisconnected')); });
    await frames(page, 3);
    if ((await state(page)).screen === 'pause') { await page.locator('[data-id="pause-reprendre"]').click(); await frames(page, 3); }
  }

  if (parts.includes('E')) {
    // ── E. fourgon ──
    const van = await page.evaluate(() => {
      const c = window.__CRS.ctx; const s = c.service('session.setup').summary; const me = c.player.person(); const sq = c.squads.get(me.squadId);
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      const vans = c.vehicles.list.filter((q) => q.faction === 'police' && q.kind === 'fourgon_crs');
      const v = vans.find((q) => q.id === sq.vehicleId) ?? vans[0];
      if (!v) return null;
      const all = vans.map((q) => ({ behind: (q.x - s.x) * fx + (q.z - s.z) * fz, facing: Math.sin(q.heading) * fx + Math.cos(q.heading) * fz }));
      const vfx = Math.sin(v.heading), vfz = Math.cos(v.heading);
      // des collègues à pied devant le nez du fourgon, dans un couloir de 3 m de large sur 40 m ?
      let ahead = 0;
      for (const p of c.people.list) { if (p.faction !== 'police' || p.vehicleId !== 0) continue; const dx = p.x - v.x, dz = p.z - v.z; const a = dx * vfx + dz * vfz, l = Math.abs(dx * vfz - dz * vfx); if (a > 2 && a < 40 && l < 1.6) ahead++; }
      const side = v.def.width * 0.5 + 0.7;
      window.__CRS.teleport(v.x + vfz * side + vfx * v.def.length * 0.22, v.z - vfx * side + vfz * v.def.length * 0.22);
      return { id: v.id, own: v.id === sq.vehicleId, n: vans.length, all, ahead, aiDriver: v.seats[0] !== 0 && v.seats[0] !== me.id };
    });
    report.fourgon = van;
    if (C.check(van !== null, 'FOURGON : un fourgon de CRS existe', van ? `${van.n} fourgon(s) ; fourgon du groupe : ${van.own}` : '')) {
      C.check(van.all.every((a) => a.facing < -0.8), 'FOURGON : tous les fourgons sont garés nez vers la sortie (dos au dispositif)', van.all.map((a) => `${R(-a.behind, 0)} m derrière, orientation ${R(a.facing)}`).join(' ; '));
      C.check(van.ahead === 0, 'FOURGON : aucun collègue à pied dans l’axe, devant le nez du fourgon', `${van.ahead} collègue(s) dans un couloir de 3 m × 40 m`);
      await step(page, 0.8); await frames(page, 3);
      const prompt = await page.evaluate(() => { const p = window.__CRS.ctx.player.state.prompt; return p ? { verb: p.verb, label: p.label } : null; });
      C.check(prompt !== null && prompt.verb === 'conduire', 'FOURGON : invite « Conduire » à la portière', prompt ? prompt.label + (van.aiDriver ? ' (conducteur IA au volant)' : '') : 'aucune invite');
      await snap(page, tag + '-10-portiere');
      await hold(page, 'KeyE');
      await step(page, 4);
      const boarded = await page.evaluate((id) => {
        const c = window.__CRS.ctx; const me = c.player.person(); const v = c.vehicles.get(id);
        window.__hurt = [];
        c.events.on('person:hurt', (e) => { const p = c.people.get(e.id); if (p && p.faction === 'police' && e.info && e.info.kind === 'vehicle') window.__hurt.push({ id: e.id, amount: e.info.amount }); });
        return me.vehicleId === v.id && v.seats[0] === me.id;
      }, van.id);
      C.check(boarded, 'FOURGON : le joueur prend le volant');
      await step(page, 0.5);
      await snap(page, tag + '-11-au-volant');
      const b = await page.evaluate((id) => { const v = window.__CRS.ctx.vehicles.get(id); return { x: v.x, z: v.z }; }, van.id);
      await page.keyboard.down('KeyW');
      await step(page, 7);
      await page.keyboard.up('KeyW');
      await step(page, 1.5);
      const a = await page.evaluate((id) => { const c = window.__CRS.ctx; const v = c.vehicles.get(id); return { x: v.x, z: v.z, hurt: window.__hurt.length, faults: c.law.forceLog.filter((f) => f.means === 'vehicule').length }; }, van.id);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      C.check(d > 8 && a.hurt === 0, 'FOURGON : rouler tout droit 7 s ne renverse aucun collègue', `${R(d, 0)} m parcourus, ${a.hurt} collègue(s) heurté(s)`);
      await snap(page, tag + '-12-fourgon-roule');
      // renverser volontairement un collègue à pied : le jeu le relève-t-il ET le dit-il au joueur ?
      const setup = await page.evaluate((id) => {
        const c = window.__CRS.ctx; const v = c.vehicles.get(id);
        let best = null;
        for (const p of c.people.list) {
          if (p.faction !== 'police' || p.vehicleId !== 0 || p.isPlayer) continue;
          // 14 m de sol libre devant lui pour poser le fourgon
          for (let k = 0; k < 12 && !best; k++) {
            const a = (k / 12) * Math.PI * 2; const sx = p.x - Math.sin(a) * 14, sz = p.z - Math.cos(a) * 14;
            let ok = true;
            for (let t = 0; ok && t <= 14; t += 1) ok = c.world.isFree(sx + Math.sin(a) * t, sz + Math.cos(a) * t, 1.4);
            const crowd = c.people.countIn(sx + Math.sin(a) * 7, sz + Math.cos(a) * 7, 7, (q) => q !== p && q.vehicleId === 0);
            if (ok && crowd === 0) best = { pid: p.id, a, sx, sz, px: p.x, pz: p.z, h0: p.health };
          }
          if (best) break;
        }
        if (!best) return null;
        v.x = best.sx; v.z = best.sz; v.heading = best.a; v.vx = 0; v.vz = 0; v.speed = 0;
        const me = c.player.person(); me.x = v.x; me.z = v.z; c.people.rebuildIndex(); c.world.setFocus(v.x, v.z);
        return best;
      }, van.id);
      if (C.check(setup !== null, 'un collègue à pied dégagé est trouvé pour l’essai de renversement')) {
        const f0 = await page.evaluate(() => window.__CRS.ctx.law.forceLog.length);
        await page.keyboard.down('KeyW');
        await step(page, 4.5);
        await page.keyboard.up('KeyW');
        await step(page, 1);
        await frames(page, 3);
        const res = await page.evaluate(([pid, f0]) => { const c = window.__CRS.ctx; const p = c.people.get(pid); const log = c.law.forceLog.slice(f0); return { hurt: window.__hurt, health: p ? p.health : null, injury: p ? p.injury : null, posture: p ? p.posture : null, log: log.map((f) => ({ means: f.means, verdict: f.verdict && f.verdict.kind ? f.verdict.kind : f.verdict, sev: f.verdict && f.verdict.severity, target: f.targetId })) }; }, [setup.pid, f0]);
        const nt = await notices(page);
        report.renversement = { ...res, notices: nt };
        const hit = res.hurt.some((h) => h.id === setup.pid) || (res.health !== null && res.health < setup.h0);
        C.note(`collègue visé : santé ${R(setup.h0, 0)} → ${R(res.health, 0)}, blessure « ${res.injury} », posture « ${res.posture} » ; ${res.hurt.length} choc(s) ; journal : ${J(res.log)} ; notifications : ${nt.join(' | ').slice(0, 240)}`);
        if (C.check(hit, 'le fourgon a bien heurté le collègue (essai valide)')) {
          C.check(res.log.some((f) => f.means === 'vehicule' && f.verdict !== 'licite'), 'FAUTE : un collègue renversé par un véhicule de police est relevé par le droit', J(res.log));
          C.check(nt.some((t) => /faute|collègue|renvers|interdit/i.test(t)), 'FAUTE : le joueur en est averti à l’écran', nt.join(' | ').slice(0, 240));
        }
        await snap(page, tag + '-13-collegue-renverse');
      }
    }
  }
  const se = await sysErrors(page);
  C.check(se.length === 0, 'aucun système en erreur ni désactivé', se.join(', '));
} catch (err) {
  C.check(false, 'exception pendant le parcours', String(err && err.stack ? err.stack : err).slice(0, 600));
  try { await snap(page, tag + '-echec'); } catch { /* page fermée */ }
}
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.errors = errors; report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
