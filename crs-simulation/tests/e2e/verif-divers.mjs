// Testeur indépendant — divers : (1) passer sous l'Arc de Triomphe à côté de la tombe, par la grande puis la petite arche ;
// (2) chef de groupe : roue d'ordres, un ordre donné, les collègues bougent-ils ? ; (3) bord du monde à l'est de la République.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'div';
const only = (args.only ?? 'ABC').toUpperCase();
const R = { tag };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=chef_groupe&place=${encodeURIComponent(args.place ?? 'Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=3&crowd=0`;
const { browser, page, errors } = await openPage(url, { width: 1280, height: 720 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const tap = async (k) => { await key.down(k); await frames(page, 2); await key.up(k); await frames(page, 1); };
const section = async (name, fn) => { try { await fn(); } catch (e) { R[name + '_exception'] = String(e && e.stack ? e.stack : e).slice(0, 500); console.error(`EXCEPTION [${name}]`, String(e && e.stack ? e.stack : e).slice(0, 400)); try { await snap(page, `verif-${tag}-echec-${name}`); } catch {} } save(); };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  await install(page);
  await frames(page, 3);
  R.setup = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { sector: c.world.sectorName(p.x, p.z), place: c.session.config.place, me: { x: p.x, z: p.z, kind: p.kind, poste: p.poste, rank: p.rank, inv: p.inventory.map((i) => i.id) }, role: c.player.state.role, squads: c.squads.list.map((s) => ({ id: s.id, kind: s.kind, name: s.name, n: s.members.length, leader: s.leaderId, parent: s.parentId })), kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}), vehicles: c.vehicles.list.filter((v) => v.faction === 'police').map((v) => v.kind) }; });
  log('setup', J(R.setup));

  // ═══ B. chef de groupe : roue d'ordres ═══
  if (only.includes('B')) await section('B', async () => {
    await snap(page, `verif-${tag}-B-chef-fps`);
    const mates0 = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); return c.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id).map((q) => ({ id: q.id, x: q.x, z: q.z })); });
    await tap('KeyF'); await page.waitForTimeout(600); await frames(page, 3);
    R.wheel = await ev(() => ({ screen: window.__CRS.ctx.ui.current, modal: window.__CRS.ctx.ui.modal, items: [...document.querySelectorAll('.crs-ui [data-order], .crs-ui .cmd-wheel button, .crs-ui [role="menuitem"], .crs-ui button')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).map((e) => `${e.getAttribute('data-order') || e.getAttribute('data-id') || ''}:${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26)}`).slice(0, 40) }));
    log('B roue', J(R.wheel));
    await snap(page, `verif-${tag}-B-roue`);
    // la roue se commande en maintenant F, en dirigeant la souris vers un secteur, puis en relâchant F
    if ((await ev(() => window.__CRS.ctx.ui.current)) === 'roue_ordres') { await tap('Escape'); await frames(page, 2); }
    if ((await ev(() => window.__CRS.ctx.ui.current)) === 'pause') { await page.locator('[data-id="pause-reprendre"]').first().click({ force: true, timeout: 120000 }); await frames(page, 2); }
    await ev(() => { window.__radio = []; window.__CRS.ctx.events.on('radio:message', (m) => window.__radio.push((m.text || (m.message && m.message.text) || JSON.stringify(m)).slice(0, 120))); window.__orders = []; window.__CRS.ctx.events.onAny('squad:order', (o) => window.__orders.push(o)); });
    await page.mouse.move(640, 360);
    await key.down('KeyF'); await frames(page, 3); await page.waitForTimeout(500);
    const open = await ev(() => window.__CRS.ctx.ui.current);
    await page.mouse.move(640, 300, { steps: 3 }); await frames(page, 2);
    await page.mouse.move(640, 215, { steps: 3 }); await frames(page, 3); // secteur « En avant » (en haut)
    await snap(page, `verif-${tag}-B-roue-en-avant`);
    await key.up('KeyF'); await frames(page, 4); await page.waitForTimeout(400);
    R.orderPick = { open, after: await ev(() => window.__CRS.ctx.ui.current) };
    await snap(page, `verif-${tag}-B-apres-ordre`);
    R.afterOrder = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const s = c.squads.get(p.squadId); const cmd = c.service('ui.command'); return { screen: c.ui.current, order: s && s.order ? { type: s.order.type, x: +s.order.x.toFixed(1), z: +s.order.z.toFixed(1) } : null, me: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, issued: cmd && cmd.issued ? cmd.issued.slice(-3).map((o) => ({ type: o.type, squadId: o.squadId })) : null, radio: window.__radio.slice(-4), notices: (c.service('ui.debug')?.notices?.() ?? []).map((n) => (n.text || '').slice(0, 80)) }; });
    log('  après ordre', J(R.afterOrder));
    if ((await ev(() => window.__CRS.ctx.ui.current)) !== null) { await tap('Escape'); await frames(page, 2); }
    if ((await ev(() => window.__CRS.ctx.ui.current)) === 'pause') { await page.locator('[data-id="pause-reprendre"]').first().click({ force: true, timeout: 120000 }); await frames(page, 2); }
    await step(page, 20);
    R.matesMoved = await ev((m0) => { const c = window.__CRS.ctx; return m0.map((m) => { const q = c.people.get(m.id); return q ? +Math.hypot(q.x - m.x, q.z - m.z).toFixed(2) : null; }); }, mates0);
    log('  déplacement des collègues 20 s après l’ordre (m)', J(R.matesMoved));
    // carte tactique : le chef peut-il donner un ordre ?
    await tap('Tab'); await page.waitForTimeout(700); await frames(page, 3);
    await snap(page, `verif-${tag}-B-tactique-chef`);
    R.tactical = await ev(() => ({ screen: window.__CRS.ctx.ui.current, scope: (() => { const s = window.__CRS.ctx.service('ui.command'); const sc = s && s.scope ? s.scope() : null; return sc ? { level: sc.level, label: sc.label, squads: sc.squadIds.length, canAuthorize: sc.canAuthorize, canSommation: sc.canSommation } : null; })(), text: (document.querySelector('.crs-ui')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 700) }));
    log('  carte tactique', J(R.tactical));
    await tap('Tab'); await frames(page, 2);
    if ((await ev(() => window.__CRS.ctx.ui.current)) !== null) { await tap('Escape'); await frames(page, 2); }
    if ((await ev(() => window.__CRS.ctx.ui.current)) === 'pause') { await page.locator('[data-id="pause-reprendre"]').first().click({ force: true, timeout: 120000 }); await frames(page, 2); }
    // circulation : 10 minutes simulées place de la Concorde, piétons heurtés par des véhicules de la circulation
    R.traffic = await ev(() => { const c = window.__CRS; const ctx = c.ctx; const hits = []; const off = ctx.events.on('vehicle:collision', (e) => { if (e.otherKind !== 'person') return; const v = ctx.vehicles.get(e.vehicleId); const q = ctx.people.get(e.otherId); hits.push({ t: Math.round(ctx.clock.now), veh: v ? `${v.kind}/${v.faction}` : '?', victime: q ? q.kind : '?', kmh: +(e.speed * 3.6).toFixed(0), surf: ctx.world.surfaceAt(e.x, e.z) }); }); const t0 = ctx.clock.now; for (let i = 0; i < 30 * 600; i++) c.game.step(1 / 30); if (typeof off === 'function') off(); return { seconds: Math.round(ctx.clock.now - t0), vehicles: ctx.vehicles.list.length, hits, blesses: ctx.people.list.filter((q) => q.faction === 'civil' && q.injury !== 'none').map((q) => `${q.kind}:${q.injury}`) }; });
    log('  circulation 10 min', J(R.traffic));
  });

  // ═══ A. sous l'Arc de Triomphe ═══
  if (only.includes('A')) await section('A', async () => {
    if ((await ev(() => window.__CRS.ctx.session.phase)) !== 'playing') await ev(() => window.__CRS.ctx.session.pause(false));
    const arc = await ev(() => { const l = window.__CRS.ctx.world.landmarks.find((q) => /arc_triomphe/.test(q.key)); return { x: l.x, z: l.z, heading: l.heading }; });
    R.arc = arc;
    // repère local du monument : façade vers +z local ; avant = (sin h, cos h), « gauche » = (cos h, −sin h)
    const pass = async (name, alongYaw, offset, len) => {
      const fx = Math.sin(alongYaw), fz = Math.cos(alongYaw), lx = Math.cos(alongYaw), lz = -Math.sin(alongYaw);
      const sx = arc.x - fx * len + lx * offset, sz = arc.z - fz * len + lz * offset;
      await ev(([x, z]) => window.__V.tp(x, z), [sx, sz]);
      await key.down('KeyW');
      const r = await ev(([a, yaw, len]) => { const c = window.__CRS; const p = c.ctx.player.person(); const fx = Math.sin(yaw), fz = Math.cos(yaw); const along = () => (p.x - a.x) * fx + (p.z - a.z) * fz; let stuck = 0, px = p.x, pz = p.z, minC = 1e9, under = 0; for (let i = 0; i < 30 * 70; i++) { c.ctx.player.state.camYaw = yaw; c.game.step(1 / 30); const d = Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; stuck = d < 0.005 ? stuck + 1 : 0; minC = Math.min(minC, Math.hypot(p.x - a.x, p.z - a.z)); if (Math.abs(along()) < 8) under++; if (along() > len - 5 || stuck > 90) break; } return { along: +along().toFixed(1), crossed: along() > 12, stuck: stuck > 90, minDistCentre: +minC.toFixed(1), stepsUnder: under, end: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) } }; }, [arc, alongYaw, len]);
      await key.up('KeyW');
      R['pass_' + name] = r; log(`A passage ${name}`, J(r));
      return r;
    };
    const big = await pass('grande-arche-décalé-4m', arc.heading, 4.5, 40);
    await ev(([a, h]) => { const c = window.__CRS; const p = c.ctx.player.person(); p.x = a.x + Math.cos(h) * 4.5; p.z = a.z - Math.sin(h) * 4.5; c.ctx.people.rebuildIndex(); c.ctx.player.state.camYaw = h; c.ctx.player.state.camPitch = 0.5; }, [arc, arc.heading]);
    await step(page, 0.2); await frames(page, 4); await snap(page, `verif-${tag}-A-sous-grande-arche`);
    await key.press('KeyV'); await ev(() => { window.__CRS.ctx.player.state.camPitch = 0.1; }); await step(page, 0.4); await frames(page, 3); await snap(page, `verif-${tag}-A-sous-grande-arche-tps`); await key.press('KeyV'); await step(page, 0.3);
    await pass('grande-arche-autre-sens-décalé', arc.heading + Math.PI, 4.5, 40);
    await pass('grande-arche-axe-perpendiculaire', arc.heading + Math.PI / 2, 0, 45);
    await pass('petite-arche', arc.heading + Math.PI / 2, 0.01, 45);
    await pass('grande-arche-dans-l-axe', arc.heading, 0, 40);
  });

  // ═══ C. bord du monde à l'est de la République ═══
  if (only.includes('C')) await section('C', async () => {
    const b = await ev(() => window.__CRS.ctx.world.bounds);
    R.bounds = b;
    const z = -160;
    const tp = await ev(([x, z]) => window.__V.tp(x, z), [b.maxX - 60, z]);
    // point libre le plus proche (rue)
    const road = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const rs = { edgeId: 0, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'primary', oneway: false }; return c.world.nearestRoad(p.x, p.z, rs, 200) ? { x: rs.x, z: rs.z, name: rs.name } : null; });
    if (road) await ev(([x, z]) => window.__V.tp(x, z), [road.x, road.z]);
    log('C bord est', J({ bounds: b, road, info: (await ev(() => window.__V.info())) }));
    await ev(() => { const s = window.__CRS.ctx.player.state; s.camYaw = Math.PI / 2; s.camPitch = 0; });
    await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-C-bord-est-avant`);
    await key.down('KeyW'); await key.down('ShiftLeft');
    R.edgeWalk = await ev((b) => { const c = window.__CRS; const p = c.ctx.player.person(); const tr = []; for (let k = 0; k < 40; k++) { for (let i = 0; i < 30; i++) { c.ctx.player.state.camYaw = Math.PI / 2; c.game.step(1 / 30); } tr.push({ x: +p.x.toFixed(0), z: +p.z.toFixed(0), y: +p.y.toFixed(1), s: c.ctx.world.surfaceAt(p.x, p.z), loaded: c.ctx.world.isLoaded(p.x, p.z), out: +(p.x - b.maxX).toFixed(0) }); } return tr; }, b);
    await key.up('KeyW'); await key.up('ShiftLeft');
    log('  marche vers l’est', J(R.edgeWalk.filter((_, i) => i % 4 === 3)));
    await ev(async () => { const v = window.__CRS.ctx.service('world.view'); let g = 0; while (v && v.pending() > 0 && g++ < 300) { v.flush(150); await new Promise((r) => setTimeout(r, 0)); } });
    await frames(page, 4); await snap(page, `verif-${tag}-C-bord-est-apres`);
    await key.press('KeyV'); await ev(() => { const s = window.__CRS.ctx.player.state; s.camYaw = -Math.PI / 2; s.camPitch = 0; }); await step(page, 0.4); await frames(page, 3); await snap(page, `verif-${tag}-C-bord-est-retour-tps`);
  });
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); } catch {}
R.rss = rss(); R.errors = errors.slice(0, 30);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)), 'rss', J(R.rss));
save();
await browser.close();
await server.close();
process.exit(0);
