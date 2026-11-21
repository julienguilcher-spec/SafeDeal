// Testeur indépendant — JOUEUR SUR PC : bouclier, bâton, gazeuse ; puis la Seine depuis un quai et la traversée d'un pont.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss, pageMem } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const tag = args.tag ?? 'seine';
const only = (args.only ?? 'LIJK').toUpperCase();
const R = { tag, mem: [] };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la Concorde')}&time=12&weather=clair&quality=bas&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const mem = async (label) => { const m = { label, rss: rss(), page: await pageMem(page).catch(() => null) }; R.mem.push(m); log('  MEM', label, J(m.rss), J(m.page)); };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await install(page);
  await frames(page, 3);
  await mem('début');
  const heading = await ev(() => window.__CRS.ctx.service('session.setup').summary.heading);
  await page.mouse.move(2, 2); await page.mouse.click(2, 2); await frames(page, 2);

  if (only.includes('L')) {
    // ── L. les deux fontaines de la Concorde : sont-elles dessinées, et bloquent-elles ? ──
    R.fountains = await ev(() => { const c = window.__CRS.ctx; const mon = c.service('monuments'); return { lm: c.world.landmarks.filter((l) => /fontaine/.test(l.key)).map((l) => ({ key: l.key, x: l.x, z: l.z, h: l.height, n: l.footprint.length / 2 })), stats: mon && mon.stats ? mon.stats() : null }; });
    log('L fontaines', J(R.fountains));
    for (const f of R.fountains.lm.slice(0, 2)) {
      // on se place à 28 m au sud-est du repère, regard vers lui
      await ev((f) => window.__V.tp(f.x + 20, f.z + 20), f);
      await ev((f) => { const c = window.__CRS.ctx; const p = c.player.person(); c.player.state.camYaw = Math.atan2(f.x - p.x, f.z - p.z); c.player.state.camPitch = 0; }, f);
      await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-L-${f.key}`);
      await key.down('KeyW');
      const r = await ev((f) => { const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person(); let min = 1e9, inB = 0; for (let i = 0; i < 30 * 16; i++) { ctx.player.state.camYaw = Math.atan2(f.x - p.x, f.z - p.z); c.game.step(1 / 30); const d = Math.hypot(p.x - f.x, p.z - f.z); min = Math.min(min, d); if (ctx.world.buildingHeightAt(p.x, p.z) > 0) inB++; if (d < 0.6) break; } return { minDistCentre: min, inFootprintSteps: inB, bhHere: ctx.world.buildingHeightAt(p.x, p.z), surface: ctx.world.surfaceAt(p.x, p.z), y: p.y, g: ctx.world.heightAt(p.x, p.z) }; }, f);
      await key.up('KeyW');
      R['fountain_' + f.key] = r; log('  marche vers le centre de ' + f.key, J(r));
      await key.press('KeyV'); await step(page, 0.4); await frames(page, 3); await snap(page, `verif-${tag}-L-${f.key}-au-centre-tps`); await key.press('KeyV'); await step(page, 0.3);
    }
    const home = await ev(() => { const s = window.__CRS.ctx.service('session.setup').summary; return [s.x, s.z]; });
    await ev(([x, z]) => window.__V.tp(x, z), home);
    save(); await mem('après L');
  }

  if (only.includes('I')) {
    // ── I. bouclier levé ──
    await ev(() => { window.__ev = []; const E = window.__CRS.ctx.events; for (const n of ['item:used', 'person:hurt', 'person:down']) E.on(n, (e) => window.__ev.push({ n, ...JSON.parse(JSON.stringify(e)) })); E.onAny('people:blocked', (e) => window.__ev.push({ n: 'people:blocked', ...e })); E.onAny('player:use_failed', (e) => window.__ev.push({ n: 'use_failed', ...e })); });
    // la touche de la case déjà en main range l'objet : on ne l'appuie que si le bouclier n'est pas en main
    if ((await ev(() => window.__V.info())).item !== 'bouclier') { await key.press('Digit1'); await step(page, 1.2); }
    const s0 = await ev(() => window.__V.info());
    // seconde pression sur la même case : que se passe-t-il ?
    await key.press('Digit1'); await step(page, 1.2);
    const sToggle = await ev(() => window.__V.info());
    R.sameSlotAgain = { before: s0.item, after: sToggle.item };
    if (sToggle.item !== 'bouclier') { await key.press('Digit1'); await step(page, 1.2); }
    await page.mouse.down({ button: 'right' }); await step(page, 0.8);
    const s1 = await ev(() => ({ ...window.__V.info(), raised: window.__CRS.ctx.service('items')?.shieldRaised?.(window.__CRS.ctx.player.person()) }));
    await frames(page, 2); await snap(page, `verif-${tag}-I-bouclier-leve-fps`);
    await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-I-bouclier-leve-tps`);
    await key.down('KeyW');
    const sw = await ev((y) => window.__V.run(4, { yaw: y + Math.PI / 2 }), heading);
    await key.up('KeyW');
    await key.press('KeyV'); await step(page, 0.3);
    await page.mouse.up({ button: 'right' }); await step(page, 0.6);
    const s2 = await ev(() => window.__V.info());
    R.shield = { before: { item: s0.item, alt: s0.alt, upper: s0.upper }, raised: { alt: s1.alt, upper: s1.upper, raised: s1.raised }, walkSpeedRaised: sw.maxSpeed, after: { alt: s2.alt, upper: s2.upper } };
    log('I bouclier', J(R.shield));

    // ── bâton : coup dans le vide, puis sur un passant ──
    if ((await ev(() => window.__V.info())).item !== 'tonfa') { await key.press('Digit2'); await step(page, 1.6); }
    const b0 = await ev(() => window.__V.info());
    await page.mouse.down(); await step(page, 0.05); await page.mouse.up();
    const swing = await ev(() => { const c = window.__CRS; const p = c.ctx.player.person(); const seen = {}; const st0 = p.stamina; for (let i = 0; i < 36; i++) { c.game.step(1 / 30); seen[p.upper] = (seen[p.upper] || 0) + 1; } return { upper: seen, staminaCost: st0 - p.stamina }; });
    await page.mouse.down(); await step(page, 0.05); await page.mouse.up(); await step(page, 0.18);
    await key.press('KeyV'); await frames(page, 2); await snap(page, `verif-${tag}-I-baton-coup-tps`); await key.press('KeyV'); await step(page, 1);
    R.baton = { item: b0.item, swing, events: await ev(() => window.__ev.splice(0)) };
    log('  bâton (vide)', J(R.baton));
    // sur une personne civile proche (passant) : on se place à 1 m, face à elle
    const target = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); const t = c.people.list.filter((q) => q.faction === 'civil' && q.vehicleId === 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return t ? { id: t.id, kind: t.kind, x: t.x, z: t.z, health: t.health, d: Math.hypot(t.x - p.x, t.z - p.z) } : null; });
    R.batonTarget = target; log('  cible', J(target));
    if (target) {
      await ev((t) => window.__V.tp(t.x, t.z + 1.0), target);
      await ev((id) => { const c = window.__CRS.ctx; const p = c.player.person(); const t = c.people.get(id); c.player.state.camYaw = Math.atan2(t.x - p.x, t.z - p.z); c.player.state.camPitch = 0; }, target.id);
      await step(page, 0.3);
      if ((await ev(() => window.__V.info())).item !== 'tonfa') { await key.press('Digit2'); await step(page, 1.6); }
      const hits = [];
      for (let k = 0; k < 3; k++) {
        await ev((id) => { const c = window.__CRS.ctx; const p = c.player.person(); const t = c.people.get(id); if (t) { p.x = t.x; p.z = t.z + 0.95; c.people.rebuildIndex(); c.player.state.camYaw = Math.atan2(t.x - p.x, t.z - p.z); c.player.state.camPitch = 0; } }, target.id);
        await page.mouse.down(); await step(page, 0.05); await page.mouse.up(); await step(page, 1.2);
        hits.push(await ev((id) => { const c = window.__CRS.ctx; const p = c.player.person(); const t = c.people.get(id); return t ? { health: t.health, posture: t.posture, injury: t.injury, d: Math.hypot(t.x - p.x, t.z - p.z), fear: t.fear } : null; }, target.id));
      }
      await key.press('KeyV'); await step(page, 0.3); await snap(page, `verif-${tag}-I-baton-passant-tps`); await key.press('KeyV'); await step(page, 0.3);
      R.batonHit = { hits, events: await ev(() => window.__ev.splice(0)), forceLog: await ev(() => window.__CRS.ctx.law.forceLog.map((f) => ({ means: f.means, verdict: f.verdict && f.verdict.kind, target: f.targetId })).slice(-5)), notices: await ev(() => (window.__CRS.ctx.service('ui.debug')?.notices?.() ?? []).map((n) => (n.text || n.message || JSON.stringify(n)).slice(0, 90))) };
      log('  bâton (passant)', J(R.batonHit));
    }
    // gazeuse : jet maintenu
    await key.press('Digit3'); await step(page, 1.5);
    const g0 = await ev(() => { const p = window.__CRS.ctx.player.person(); return { item: window.__V.info().item, count: p.inventory[p.active] ? p.inventory[p.active].count : null }; });
    await page.mouse.down(); await step(page, 1.2); await frames(page, 2); await snap(page, `verif-${tag}-I-gazeuse-fps`); await step(page, 1.0); await page.mouse.up(); await step(page, 0.5);
    const g1 = await ev(() => { const c = window.__CRS.ctx; const p = c.player.person(); return { count: p.inventory[p.active] ? p.inventory[p.active].count : null, gasFront: c.hazards.gasAt(p.x + Math.sin(c.player.state.camYaw) * 2, p.z + Math.cos(c.player.state.camYaw) * 2), self: p.gas }; });
    R.gazeuse = { g0, g1, events: await ev(() => window.__ev.splice(0).slice(0, 6)) };
    log('  gazeuse', J(R.gazeuse));
    await key.press('Digit1'); await step(page, 1.2);
    save(); await mem('après I');
  }

  if (only.includes('J')) {
    // ── J. la Seine depuis un quai ──
    const water = await ev(() => {
      const c = window.__CRS.ctx; const p = c.player.person(); let best = null;
      for (let dx = -400; dx <= 400; dx += 20) for (let dz = 40; dz <= 900; dz += 4) {
        const x = p.x + dx, z = p.z + dz;
        if (c.world.surfaceAt(x, z) === 'water') { const d = Math.hypot(dx, dz); if (!best || d < best.d) best = { x, z, d, dx, prevSurf: c.world.surfaceAt(x, z - 4), prev2: c.world.surfaceAt(x, z - 12) }; break; }
      }
      return { best, waterLevel: c.world.waterLevel };
    });
    R.water = water; log('J eau la plus proche', J(water));
    if (water.best) {
      const w = water.best;
      const tp = await ev(([x, z]) => window.__V.tp(x, z), [w.x, w.z - 14]);
      log('  sur le quai', J(tp.info));
      R.quay = await ev((w) => { const c = window.__CRS.ctx; const prof = []; for (let dz = -20; dz <= 16; dz += 2) prof.push({ dz, s: c.world.surfaceAt(w.x, w.z + dz), g: +c.world.heightAt(w.x, w.z + dz).toFixed(2), free: c.world.isFree(w.x, w.z + dz, 0.28) }); return prof; }, w);
      log('  profil quai → eau', J(R.quay));
      await ev(() => { const s = window.__CRS.ctx.player.state; s.camYaw = 0; s.camPitch = -0.15; });
      await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-J-quai-fps`);
      await key.down('KeyW');
      const walk = await ev(() => window.__V.run(14, { yaw: 0, every: 30 }));
      await key.down('ShiftLeft'); await key.press('Space');
      const dash = await ev(() => window.__V.run(6, { yaw: 0, every: 30 }));
      await key.up('ShiftLeft'); await key.up('KeyW');
      const end = await ev(() => { const i = window.__V.info(); const c = window.__CRS.ctx; return { ...i, waterLevel: c.world.waterLevel, wet: c.player.person().wet, health: c.player.person().health, hit: window.__V.ray(i.x, i.z, i.x, i.z + 3) }; });
      R.seine = { walk: { dist: walk.dist, inWater: walk.inWater, firstBad: walk.firstBad, samples: walk.samples }, dash: { dist: dash.dist, inWater: dash.inWater, firstBad: dash.firstBad, samples: dash.samples }, end: { x: end.x, y: end.y, z: end.z, ground: end.ground, surface: end.surface, waterLevel: end.waterLevel, wet: end.wet, health: end.health, hit: end.hit && { kind: end.hit.kind, d: end.hit.d } } };
      log('  marche vers l’eau', J(R.seine));
      await frames(page, 3); await snap(page, `verif-${tag}-J-seine-fps`);
      await key.press('KeyV'); await step(page, 0.5); await snap(page, `verif-${tag}-J-seine-tps`); await key.press('KeyV'); await step(page, 0.3);
      // regard le long du fleuve
      await ev(() => { const s = window.__CRS.ctx.player.state; s.camYaw = Math.PI / 2; s.camPitch = -0.05; });
      await step(page, 0.3); await frames(page, 3); await snap(page, `verif-${tag}-J-seine-amont`);
    }
    save(); await mem('après J');
  }

  if (only.includes('K')) {
    // ── K. traverser un pont ──
    const bridge = await ev(() => {
      const c = window.__CRS.ctx; const w = c.world; const p = c.player.person(); let best = null;
      for (let i = 0; i < w.edgeCount; i++) { const e = w.edge(i); if (!e.bridge || e.length < 60) continue; const pts = e.points; const mx = pts[0], mz = pts[1]; const d = Math.hypot(mx - p.x, mz - p.z); if (!best || d < best.d) best = { id: e.id, name: e.name, d, length: e.length, width: e.width, sidewalk: e.sidewalk, pedestrianOnly: e.pedestrianOnly, points: Array.from(pts) }; }
      return best;
    });
    R.bridge = bridge; log('K pont', J(bridge && { ...bridge, points: bridge.points.length / 2 }));
    if (bridge) {
      const P = bridge.points; const n = P.length / 2;
      await ev(([x, z]) => window.__V.tp(x, z), [P[0], P[1]]);
      const tp = await ev(([x, z]) => window.__V.tp(x, z), [P[0], P[1]]);
      log('  entrée du pont', J(tp.info));
      const yaw0 = Math.atan2(P[2] - P[0], P[3] - P[1]);
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0; }, yaw0);
      await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-K-pont-entree`);
      await key.down('KeyW');
      const cross = await ev((P) => {
        const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person(); const n = P.length / 2; let k = 1; let dist = 0, px = p.x, pz = p.z; const surf = {}; let inWater = 0, maxGap = 0; const tr = []; let stuck = 0;
        for (let i = 0; i < 30 * 200 && k < n; i++) {
          const tx = P[2 * k], tz = P[2 * k + 1];
          if (Math.hypot(tx - p.x, tz - p.z) < 2.5) { k++; continue; }
          ctx.player.state.camYaw = Math.atan2(tx - p.x, tz - p.z);
          c.game.step(1 / 30);
          const d = Math.hypot(p.x - px, p.z - pz); dist += d; px = p.x; pz = p.z; stuck = d < 0.005 ? stuck + 1 : 0;
          const s = ctx.world.surfaceAt(p.x, p.z); surf[s] = (surf[s] || 0) + 1; if (s === 'water') inWater++;
          const g = ctx.world.heightAt(p.x, p.z); maxGap = Math.max(maxGap, Math.abs(p.y - g));
          if (i % 150 === 0) tr.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(2), g: +g.toFixed(2), s, wl: +ctx.world.waterLevel.toFixed(2) });
          if (stuck > 240) break;
        }
        return { reached: k >= n, k, n, dist, surf, inWater, maxGap, stuck, trace: tr, end: { x: p.x, z: p.z } };
      }, P);
      await key.up('KeyW');
      R.cross = cross; log('  traversée', J(cross));
      // milieu du pont : captures dans l'axe et vers le fleuve, puis tentative de sortie latérale
      const mid = [(P[0] + P[2 * n - 2]) / 2, (P[1] + P[2 * n - 1]) / 2];
      await ev(([x, z]) => window.__V.tp(x, z), mid);
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0; }, yaw0);
      await step(page, 0.3); await frames(page, 4); await snap(page, `verif-${tag}-K-pont-milieu-axe`);
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y + Math.PI / 2; s.camPitch = -0.1; }, yaw0);
      await step(page, 0.3); await frames(page, 3); await snap(page, `verif-${tag}-K-pont-milieu-fleuve`);
      await key.press('KeyV'); await step(page, 0.4); await snap(page, `verif-${tag}-K-pont-milieu-tps`); await key.press('KeyV'); await step(page, 0.3);
      await key.down('KeyW'); await key.down('ShiftLeft');
      const side = await ev((y) => window.__V.run(12, { yaw: y + Math.PI / 2, every: 30 }), yaw0);
      await key.press('Space');
      const side2 = await ev((y) => window.__V.run(4, { yaw: y + Math.PI / 2, every: 30 }), yaw0);
      await key.up('ShiftLeft'); await key.up('KeyW');
      const endS = await ev(() => { const i = window.__V.info(); return { x: i.x, y: i.y, z: i.z, ground: i.ground, surface: i.surface, wl: window.__CRS.ctx.world.waterLevel }; });
      R.bridgeSide = { dist: side.dist, inWater: side.inWater + side2.inWater, firstBad: side.firstBad || side2.firstBad, samples: side.samples.concat(side2.samples), end: endS };
      log('  sortie latérale', J(R.bridgeSide));
      await frames(page, 3); await snap(page, `verif-${tag}-K-pont-bord`);
      await key.press('KeyV'); await step(page, 0.4); await snap(page, `verif-${tag}-K-pont-bord-tps`); await key.press('KeyV');
    }
    save(); await mem('après K');
  }
} catch (e) {
  console.error('EXCEPTION', e);
  R.exception = String(e && e.stack ? e.stack : e);
  try { await snap(page, `verif-${tag}-echec`); } catch {}
}
try { R.systemErrors = await ev(() => window.__V.errors()); } catch {}
R.errors = errors.slice(0, 30);
log('ERREURS SYSTEMES', J(R.systemErrors), 'ERREURS CONSOLE', errors.length, J(errors.slice(0, 8)));
save();
await browser.close();
await server.close();
process.exit(0);
