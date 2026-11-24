// Testeur indépendant — JOUEUR SUR PC : déplacements et collisions, place de la Concorde, midi, qualité « bas ».
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss, pageMem } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const quality = args.quality ?? 'bas';
const place = args.place ?? 'Place de la Concorde';
const tag = args.tag ?? 'dep';
const R = { tag, mem: [] };
const only = (args.only ?? 'ABCDEFGH').toUpperCase();
const want = (l) => only.includes(l);
const mem = async (label) => { const m = { label, rss: rss(), page: await pageMem(page).catch(() => null) }; R.mem.push(m); log('  MEM', label, J(m.rss), J(m.page)); };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent(place)}&time=${args.time ?? 12}&weather=clair&quality=${quality}&seed=11`;
const { browser, page, errors } = await openPage(url, { width: 960, height: 540 });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
try {
  const t0 = Date.now();
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  R.loadMs = Date.now() - t0;
  await install(page);
  await frames(page, 3);
  // ── A. mise en place ──
  R.setup = await ev(() => {
    const c = window.__CRS.ctx; const p = c.player.person();
    const mates = c.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id);
    const view = c.service('world.view');
    return {
      me: { x: p.x, z: p.z, y: p.y, g: c.world.heightAt(p.x, p.z), kind: p.kind, poste: p.poste, inv: p.inventory.map((i) => `${i.id}×${i.count ?? ''}`), radius: p.radius, speeds: [p.speedWalk, p.speedRun, p.speedSprint] },
      mates: mates.map((m) => ({ id: m.id, poste: m.poste, d: Math.hypot(m.x - p.x, m.z - p.z), dy: m.y - c.world.heightAt(m.x, m.z), lift: view ? view.liftAt(m.x, m.z) : null, surf: c.world.surfaceAt(m.x, m.z) })),
      vehicles: c.vehicles.list.map((v) => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, d: Math.hypot(v.x - p.x, v.z - p.z), faction: v.faction })).sort((a, b) => a.d - b.d).slice(0, 12),
      people: c.people.list.length, kinds: c.people.list.reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}),
      props: c.props.list.length, phase: c.director.phase, time: c.env.state.timeOfDay, weather: c.env.state.weather, quality: c.view.quality,
      landmarks: c.world.landmarks.map((l) => ({ key: l.key, d: Math.round(Math.hypot(l.x - p.x, l.z - p.z)) })).sort((a, b) => a.d - b.d).slice(0, 8),
      myLift: view ? view.liftAt(p.x, p.z) : null, mySurf: c.world.surfaceAt(p.x, p.z), heading: c.service('session.setup').summary.heading,
    };
  });
  log('A setup', J(R.setup));
  await step(page, 0.5);
  await snap(page, `verif-${tag}-A-fps`);
  await key.press('KeyV'); await step(page, 0.5);
  await snap(page, `verif-${tag}-A-tps`);
  R.camTps = await ev(() => window.__V.cam());
  await key.press('KeyV'); await step(page, 0.3);
  save();

  const home = R.setup.me;
  await mem('début');
  if (want('B')) {
  // ── souris capturée : un déplacement de souris tourne-t-il le regard ? ──
  await page.mouse.move(2, 2); await page.mouse.click(2, 2); await frames(page, 2);
  R.pointerLocked = await ev(() => window.__CRS.ctx.input.pointerLocked);
  const yawA = (await ev(() => window.__V.info())).camYaw;
  await ev(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40, movementY: 0, bubbles: true })); });
  await step(page, 0.2);
  const yawB = (await ev(() => window.__V.info())).camYaw;
  R.mouseLook = { locked: R.pointerLocked, yawA, yawB, delta: yawB - yawA };
  log('souris', J(R.mouseLook));

  // ── B. marcher 200 m dans quatre directions ──
    R.walk = [];
  for (const [name, yaw] of [['nord', Math.PI], ['est', Math.PI / 2], ['sud', 0], ['ouest', -Math.PI / 2]]) {
    await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
    await key.down('KeyW');
    const r = await ev((y) => window.__V.run(85, { yaw: y, every: 300 }), yaw);
    await key.up('KeyW');
    await step(page, 0.5);
    r.name = name;
    r.wall = await ev((y) => { const p = window.__CRS.ctx.player.person(); return window.__V.ray(p.x, p.z, p.x + Math.sin(y) * 3, p.z + Math.cos(y) * 3); }, yaw);
    R.walk.push(r);
    log(`B marche ${name}`, J({ dist: r.dist, net: r.net, dt: r.dt, inBuilding: r.inBuilding, inWater: r.inWater, notFree: r.notFree, maxLift: r.maxLift, surfaces: r.surfaces, firstBad: r.firstBad, end: r.end, wall: r.wall && r.wall.kind }));
    await snap(page, `verif-${tag}-B-${name}`);
    save();
  }

  await mem('après B');
  }
  if (want('C')) {
  // ── C. sprint jusqu'à l'essoufflement (au centre de la place, vers l'ouest puis demi-tours) ──
  await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
  await step(page, 12); // récupération complète
  const winded = [];
  await ev(() => { window.__winded = []; window.__CRS.ctx.events.onAny('people:winded', (e) => window.__winded.push({ ...e, t: window.__CRS.ctx.clock.now })); });
  await key.down('ShiftLeft'); await key.down('KeyW');
  const sprint = await ev((y) => {
    const out = []; let yaw = y;
    for (let k = 0; k < 60; k++) {
      const r = window.__V.run(1, { yaw });
      out.push({ t: k + 1, st: +r.end.stamina.toFixed(1), sp: +r.end.speed.toFixed(2), d: +r.dist.toFixed(1) });
      if (r.dist < 0.8 && k % 2 === 0) yaw += Math.PI / 2; // obstacle : on tourne
    }
    return out;
  }, R.setup.heading);
  await snap(page, `verif-${tag}-C-essouffle`);
  await key.up('ShiftLeft'); await key.up('KeyW');
  R.sprint = sprint;
  R.winded = await ev(() => window.__winded);
  const rest = await ev(() => { const out = []; for (let k = 0; k < 30; k++) { const r = window.__V.run(1); out.push(+r.end.stamina.toFixed(1)); } return out; });
  R.rest = rest;
  log('C sprint', J(sprint.filter((_, i) => i % 3 === 0)), 'winded', J(R.winded), 'repos', J(rest.filter((_, i) => i % 5 === 0)));
  save();

  await mem('après C');
  }
  if (want('D')) {
  // ── D. s'accroupir ──
  await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
  const standCam = await ev(() => window.__V.cam());
  await key.press('KeyC'); await step(page, 0.8);
  const crouch1 = await ev(() => window.__V.info());
  await frames(page, 2);
  const crouchCam = await ev(() => window.__V.cam());
  await key.down('KeyW');
  const crouchWalk = await ev((y) => window.__V.run(4, { yaw: y }), R.setup.heading + Math.PI);
  await key.up('KeyW');
  await snap(page, `verif-${tag}-D-accroupi-fps`);
  await key.press('KeyV'); await step(page, 0.4); await snap(page, `verif-${tag}-D-accroupi-tps`); await key.press('KeyV'); await step(page, 0.3);
  await key.press('KeyC'); await step(page, 1.2);
  const stand2 = await ev(() => window.__V.info());
  R.crouch = { posture: crouch1.posture, eyeStand: standCam.y - standCam.ground, eyeCrouch: crouchCam.y - crouchCam.ground, speed: crouchWalk.maxSpeed, dist: crouchWalk.dist, after: stand2.posture };
  log('D accroupi', J(R.crouch));

  // ── E. sauter ──
  const jumpTrace = async () => {
    await key.press('Space');
    return ev(() => {
      const c = window.__CRS; const p = c.ctx.player.person(); const loco = c.ctx.service('people.locomotion');
      let maxUp = 0, air = 0; const st0 = p.stamina;
      for (let i = 0; i < 30; i++) { c.game.step(1 / 30); maxUp = Math.max(maxUp, p.y - c.ctx.world.heightAt(p.x, p.z)); if (loco && loco.isAirborne(p)) air++; }
      return { maxUp, airSteps: air, staminaCost: st0 - p.stamina };
    });
  };
  R.jumpStill = await jumpTrace();
  await key.down('KeyW'); await step(page, 1.5);
  R.jumpRun = await jumpTrace();
  await key.up('KeyW'); await step(page, 0.5);
  // l'image montre-t-elle le saut ? hauteur de la caméra pendant le vol
  await key.press('Space');
  R.jumpCam = await ev(async () => {
    const c = window.__CRS; const cam = c.ctx.view.camera; let maxY = -1e9; const y0 = cam.position.y;
    for (let i = 0; i < 6; i++) { c.step(0.08); await new Promise((r) => requestAnimationFrame(r)); maxY = Math.max(maxY, cam.position.y); }
    return { y0, maxY, rise: maxY - y0 };
  });
  log('E saut', J({ still: R.jumpStill, run: R.jumpRun, cam: R.jumpCam }));
  save();

  await mem('après E');
  }
  if (want('F')) {
  // ── F. traverser un collègue ──
  await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
  await step(page, 1);
  await key.down('KeyW');
  R.mate = await ev(() => {
    const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person();
    const mates = ctx.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const m = mates[0]; const m0 = { x: m.x, z: m.z };
    const d0 = Math.hypot(m.x - p.x, m.z - p.z);
    let min = d0; let passed = false;
    const ux = (m.x - p.x) / d0, uz = (m.z - p.z) / d0;
    for (let i = 0; i < 240; i++) {
      ctx.player.state.camYaw = Math.atan2(m.x - p.x, m.z - p.z);
      c.game.step(1 / 30);
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      min = Math.min(min, d);
      if ((p.x - m0.x) * ux + (p.z - m0.z) * uz > 0.6) passed = true;
    }
    return { d0, min, sumRadii: p.radius + m.radius, matePushed: Math.hypot(m.x - m0.x, m.z - m0.z), passedThrough: passed, mateBrain: typeof m.brain };
  });
  await key.up('KeyW');
  log('F collègue', J(R.mate));
  await key.press('KeyV'); await step(page, 0.4); await snap(page, `verif-${tag}-F-collegue-tps`); await key.press('KeyV'); await step(page, 0.3);

  }
  if (want('G')) {
  // ── G. immeuble : pousser contre le mur, courir, sauter, glisser ──
  await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
  let wall = await ev((mh) => window.__V.nearestWall(500, 'building', mh), Number(args.minH ?? 0));
  R.wall0 = wall;
  log('G mur le plus proche', J(wall));
  if (wall) {
    const bx = wall.x - Math.sin(wall.yaw) * 6, bz = wall.z - Math.cos(wall.yaw) * 6;
    const tp = await ev(([x, z]) => window.__V.tp(x, z), [bx, bz]);
    log('  devant le mur', J(tp));
    await key.down('KeyW');
    const push = await ev((y) => window.__V.run(6, { yaw: y }), wall.yaw);
    await key.down('ShiftLeft');
    const pushSprint = await ev((y) => window.__V.run(4, { yaw: y }), wall.yaw);
    await key.press('Space');
    const pushJump = await ev((y) => window.__V.run(1.5, { yaw: y }), wall.yaw);
    const afterPush = await ev(() => window.__V.info());
    const distWall = await ev((y) => { const p = window.__CRS.ctx.player.person(); const h = window.__V.ray(p.x, p.z, p.x + Math.sin(y) * 5, p.z + Math.cos(y) * 5); return h ? h.d : null; }, wall.yaw);
    await key.up('ShiftLeft');
    await frames(page, 2);
    const camFps = await ev(() => window.__V.cam());
    await snap(page, `verif-${tag}-G-mur-fps`);
    // glissades obliques
    const slideL = await ev((y) => window.__V.run(8, { yaw: y + 1.0 }), wall.yaw);
    const slideR = await ev((y) => window.__V.run(8, { yaw: y - 1.0 }), wall.yaw);
    await key.up('KeyW');
    // dos au mur, troisième personne : la caméra entre-t-elle dans l'immeuble ?
    const w2 = await ev((mh) => window.__V.nearestWall(60, 'building', mh), Number(args.minH ?? 0));
    let camBack = null, camBackUp = null;
    if (w2) {
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y + Math.PI; s.camPitch = 0; }, w2.yaw);
      await key.press('KeyV'); await step(page, 0.8); await frames(page, 3);
      camBack = await ev(() => window.__V.cam());
      await snap(page, `verif-${tag}-G-dos-au-mur-tps`);
      await ev(() => { window.__CRS.ctx.player.state.camPitch = 0.6; });
      await step(page, 0.5); await frames(page, 3);
      camBackUp = await ev(() => window.__V.cam());
      await snap(page, `verif-${tag}-G-dos-au-mur-tps-haut`);
      // face au mur, troisième personne
      await ev((y) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = 0; }, w2.yaw);
      await step(page, 0.5);
      await snap(page, `verif-${tag}-G-face-au-mur-tps`);
      await key.press('KeyV'); await step(page, 0.3);
    }
    R.wall = { push: { d: push.dist, inB: push.inBuilding, nf: push.notFree }, sprint: { d: pushSprint.dist, inB: pushSprint.inBuilding }, jump: { inB: pushJump.inBuilding, lift: pushJump.maxLift }, distWall, afterPush: { bh: afterPush.bh, free: afterPush.free, surface: afterPush.surface }, camFps, slideL: { d: slideL.dist, inB: slideL.inBuilding, nf: slideL.notFree }, slideR: { d: slideR.dist, inB: slideR.inBuilding, nf: slideR.notFree }, w2, camBack, camBackUp };
    log('G immeuble', J(R.wall));
  }
  save();

  await mem('après G');
  }
  if (want('H')) {
  // ── H. arbre ──
  await ev(([x, z]) => window.__V.tp(x, z), [home.x, home.z]);
  R.tree = await ev(() => {
    const ctx = window.__CRS.ctx; const p = ctx.player.person();
    const trees = window.__V.trees().map((t) => ({ ...t, d: Math.hypot(t.x - p.x, t.z - p.z) })).filter((t) => ctx.world.buildingHeightAt(t.x, t.z) === 0).sort((a, b) => a.d - b.d);
    return { count: trees.length, nearest: trees[0] || null, freeAtTrunk: trees[0] ? ctx.world.isFree(trees[0].x, trees[0].z, 0.3) : null };
  });
  log('H arbres', J(R.tree));
  if (R.tree.nearest) {
    const t = R.tree.nearest;
    await ev(([x, z]) => window.__V.tp(x, z), [t.x, t.z + 5]);
    await key.down('KeyW');
    R.treeWalk = await ev((tr) => {
      const c = window.__CRS; const p = c.ctx.player.person(); let min = 1e9;
      for (let i = 0; i < 150; i++) { c.ctx.player.state.camYaw = Math.PI; c.game.step(1 / 30); min = Math.min(min, Math.hypot(p.x - tr.x, p.z - tr.z)); if (p.z < tr.z - 3) break; }
      return { minDistToTrunk: min, endZ: p.z, treeZ: tr.z, crossed: p.z < tr.z - 1 };
    }, t);
    await key.up('KeyW');
    log('  traversée du tronc', J(R.treeWalk));
    await ev(([x, z]) => { const c = window.__CRS; const p = c.ctx.player.person(); p.x = x; p.z = z; c.ctx.player.state.camYaw = Math.PI; c.ctx.player.state.camPitch = 0; }, [t.x, t.z]);
    await key.press('KeyV'); await step(page, 0.3);
    R.treeStand = await ev((tr) => { const p = window.__CRS.ctx.player.person(); return { d: Math.hypot(p.x - tr.x, p.z - tr.z) }; }, t);
    await snap(page, `verif-${tag}-H-dans-arbre-tps`);
    await key.press('KeyV'); await step(page, 0.3);
  }
  await mem('fin');
  }
  save();
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
