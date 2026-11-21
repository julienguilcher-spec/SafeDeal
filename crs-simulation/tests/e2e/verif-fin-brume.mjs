// Testeur indépendant — CONTRÔLE FINAL, brume et monuments en qualité « bas » (midi, temps clair) :
// tour Eiffel depuis le Trocadéro et depuis la Concorde, Arc de Triomphe depuis les Champs-Élysées, Madeleine depuis la rue Royale,
// Notre-Dame depuis le parvis ; et la ville elle-même (rue en enfilade). Captures à REGARDER.
// Usage : node tests/e2e/verif-fin-brume.mjs [--quality=bas]
import { startServer, openPage, waitFor, frames, step, snap, sysErrors, makeChecker, args, J, R } from './verif-fin-lib.mjs';
const tag = 'verif-fin-brume';
const C = makeChecker(tag);
const quality = args.quality ?? 'bas';
const report = { quality };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&place=${encodeURIComponent('Place du Trocadéro et du 11 Novembre')}&time=12&weather=clair&quality=${quality}&seed=5&crowd=0&camera=fps`;
const { browser, page, errors } = await openPage(url, { width: 1280, height: 720, pointerLock: false });
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Déplacement instantané + attente du monde et de la ville. */
const tp = (x, z) => ev(async ([x, z]) => {
  const C = window.__CRS; const ctx = C.ctx;
  C.teleport(x, z);
  try { await Promise.race([ctx.world.whenLoaded(x, z, 300), new Promise((r) => setTimeout(r, 60000))]); } catch (e) { /* ignore */ }
  const view = ctx.service('world.view');
  let guard = 0;
  while (view && view.pending() > 0 && guard++ < 400) { view.flush(200); await new Promise((r) => setTimeout(r, 0)); }
  C.step(0.2);
  const p = ctx.player.person();
  return { x: p.x, z: p.z, free: ctx.world.isFree(p.x, p.z, 0.05), sector: ctx.world.sectorName(p.x, p.z) };
}, [x, z]);
const lookAt = async (t, pitch) => { await ev(([t, pitch]) => { const c = window.__CRS.ctx; const p = c.player.person(); c.player.state.camYaw = Math.atan2(t.x - p.x, t.z - p.z); c.player.state.camPitch = pitch; }, [t, pitch]); await step(page, 0.3); await frames(page, 5); };
/** Point libre à `d` mètres du repère, dans la direction `from` (ou la plus dégagée). */
const spotNear = (t, d, toward) => ev(([t, d, toward]) => {
  const c = window.__CRS.ctx;
  const base = toward ? Math.atan2(toward.x - t.x, toward.z - t.z) : 0;
  for (let k = 0; k < 24; k++) {
    const a = base + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 12);
    const x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
    if (c.world.isFree(x, z, 0.6) && c.world.buildingHeightAt(x, z) === 0) {
      const hit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
      c.world.raycast(x, z, t.x, t.z, hit);
      const clear = !hit.hit || hit.t * d > d - 80;
      if (clear) return { x, z, a };
    }
  }
  return null;
}, [t, d, toward ?? null]);
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  await frames(page, 4);
  const info = await ev(() => {
    const c = window.__CRS.ctx; const p = c.player.person();
    const lm = {}; for (const l of c.world.landmarks) lm[l.key] = { x: l.x, z: l.z, h: l.height, name: l.name };
    const fog = c.view.scene.fog;
    return { me: { x: p.x, z: p.z }, sector: c.world.sectorName(p.x, p.z), draw: c.view.drawDistance, far: c.view.camera.far, quality: c.view.quality, fog: fog ? { density: fog.density, near: fog.near, far: fog.far } : null, lm, clearAir: !!c.service('render.clearAir') };
  });
  report.info = { ...info, lm: Object.keys(info.lm).length };
  const LM = info.lm;
  console.log('  ' + J({ ...info, lm: Object.keys(info.lm).slice(0, 60) }));
  C.check(info.quality === quality, `qualité « ${quality} »`, `distance d’affichage ${R(info.draw, 0)} m, brouillard ${J(info.fog)}, service d’air clair : ${info.clearAir}`);
  const T = LM.tour_eiffel;
  const dTro = Math.hypot(T.x - info.me.x, T.z - info.me.z);
  // 1. tour Eiffel depuis le point de départ du Trocadéro, puis depuis le parvis (dans l'axe)
  await lookAt(T, 0.12);
  await snap(page, `${tag}-1-eiffel-depuis-depart-${Math.round(dTro)}m`);
  const chaillot = LM.palais_chaillot ?? LM.trocadero ?? null;
  const parvis = await spotNear(T, 620, info.me);
  if (parvis) { await tp(parvis.x, parvis.z); await lookAt(T, 0.2); await snap(page, `${tag}-2-eiffel-620m`); }
  // 2. tour Eiffel depuis la Concorde
  const ob = LM.obelisque_concorde ?? { x: 0, z: 0 };
  const sp = await spotNear(ob, 30, T);
  await tp(sp ? sp.x : 20, sp ? sp.z : 20);
  const dCon = await ev((t) => { const p = window.__CRS.ctx.player.person(); return Math.hypot(t.x - p.x, t.z - p.z); }, T);
  await lookAt(T, 0.06);
  await snap(page, `${tag}-3-eiffel-depuis-concorde-${Math.round(dCon)}m`);
  // la même, zoom ×? non : vue dans l'axe de la rue Royale vers la Madeleine
  const mad = LM.madeleine ?? LM.eglise_madeleine;
  if (mad) {
    const s2 = await spotNear(ob, 60, mad);
    if (s2) await tp(s2.x, s2.z);
    const dM = await ev((t) => { const p = window.__CRS.ctx.player.person(); return Math.hypot(t.x - p.x, t.z - p.z); }, mad);
    await lookAt(mad, 0.05);
    await snap(page, `${tag}-4-madeleine-depuis-concorde-${Math.round(dM)}m`);
  }
  // 3. Arc de Triomphe depuis les Champs-Élysées
  const arc = LM.arc_triomphe ?? LM.arc_de_triomphe;
  if (arc) {
    for (const d of [420, 160]) {
      const s3 = await spotNear(arc, d, ob);
      if (!s3) { C.note(`Arc : aucun point libre à ${d} m`); continue; }
      await tp(s3.x, s3.z);
      await lookAt(arc, d > 300 ? 0.08 : 0.2);
      await snap(page, `${tag}-5-arc-${d}m`);
    }
  }
  // 4. Notre-Dame depuis le parvis
  const nd = LM.notre_dame;
  if (nd) {
    const s4 = await spotNear(nd, 150, { x: nd.x - 200, z: nd.z });
    if (s4) { await tp(s4.x, s4.z); await lookAt(nd, 0.22); await snap(page, `${tag}-6-notre-dame-150m`); }
  }
  // 5. la ville en enfilade : avenue de l'Opéra vers l'Opéra (monument) — immeubles dans la brume, monument net ?
  const op = LM.opera_garnier ?? LM.opera;
  if (op) {
    const s5 = await spotNear(op, 380, { x: op.x + 150, z: op.z + 400 });
    if (s5) { await tp(s5.x, s5.z); await lookAt(op, 0.08); await snap(page, `${tag}-7-opera-380m`); }
  }
  const st = await ev(() => { const c = window.__CRS.ctx; const r = c.view.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures }; });
  report.rendu = st;
  C.note('rendu : ' + J(st));
  const se = await sysErrors(page);
  C.check(se.length === 0, 'aucun système en erreur ni désactivé', se.join(', '));
} catch (err) {
  C.check(false, 'exception', String(err && err.stack ? err.stack : err).slice(0, 600));
  try { await snap(page, tag + '-echec'); } catch { /* page fermée */ }
}
C.check(errors.length === 0, 'zéro erreur console', errors.slice(0, 4).join(' | ').slice(0, 600));
report.errors = errors; report.failures = C.failures; report.notes = C.notes;
C.done(report);
await browser.close().catch(() => {});
await server.close().catch(() => {});
process.exit(0);
