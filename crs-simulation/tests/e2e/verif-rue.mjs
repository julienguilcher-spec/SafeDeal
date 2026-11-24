// Testeur indépendant — JOUEUR SUR PC : longer un trottoir dans une rue (obstacles invisibles ?), regarder les immeubles et le sol,
// compter les piétons heurtés par la circulation. Usage : node tests/e2e/verif-rue.mjs --rue="Rue Royale" --quality=bas
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, frames, step, snap, log, J, install, OUT, rss } from './verif-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const tag = args.tag ?? 'rue';
const rue = args.rue ?? 'Rue Royale';
const quality = args.quality ?? 'bas';
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const R = { tag, rue, quality };
const server = await startServer();
const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&place=${encodeURIComponent(args.place ?? 'Place de la Concorde')}&time=${args.time ?? 12}&weather=clair&quality=${quality}&seed=11`;
const { browser, page, errors } = await openPage(url, { width: W, height: H });
const key = page.keyboard;
const ev = (fn, arg) => page.evaluate(fn, arg);
const save = () => writeFileSync(path.join(OUT, `verif-${tag}.json`), JSON.stringify(R, null, 1));
const look = async (yaw, pitch = 0) => { await ev(([y, p]) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = p; }, [yaw, pitch]); await step(page, 0.2); await frames(page, 3); };
try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 500000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 500000);
  await install(page);
  await frames(page, 3);
  await ev(() => { window.__hits = []; window.__CRS.ctx.events.on('vehicle:collision', (e) => { if (e.otherKind === 'person' && window.__hits.length < 200) { const c = window.__CRS.ctx; const v = c.vehicles.get(e.vehicleId); const p = c.people.get(e.otherId); const pl = c.player.vehicle(); window.__hits.push({ t: +c.clock.now.toFixed(1), veh: v ? v.kind : '?', vehFaction: v ? v.faction : '?', joueur: !!pl && pl.id === e.vehicleId, victime: p ? p.kind : '?', speedKmh: +(e.speed * 3.6).toFixed(1), surf: c.world.surfaceAt(e.x, e.z), x: Math.round(e.x), z: Math.round(e.z) }); } }); });
  // la rue : arête nommée la plus proche du joueur, de longueur suffisante
  const street = await ev((name) => {
    const c = window.__CRS.ctx; const w = c.world; const p = c.player.person(); let best = null;
    for (let i = 0; i < w.edgeCount; i++) { const e = w.edge(i); if (e.name !== name || e.length < 60) continue; const d = Math.hypot(e.points[0] - p.x, e.points[1] - p.z); if (!best || d < best.d) best = { id: e.id, d, length: e.length, width: e.width, sidewalk: e.sidewalk, cls: e.roadClass, points: Array.from(e.points) }; }
    return best;
  }, rue);
  R.street = street && { ...street, points: street.points.length / 2 }; log('rue', J(R.street));
  if (!street) throw new Error('rue introuvable : ' + rue);
  const P = street.points; const n = P.length / 2;
  const yaw0 = Math.atan2(P[2 * n - 2] - P[0], P[2 * n - 1] - P[1]);
  // trottoir : on cherche de quel côté et à quelle distance de l'axe la surface est « sidewalk »
  const side = await ev(([P, yaw]) => { const c = window.__CRS.ctx; const lx = Math.cos(yaw), lz = -Math.sin(yaw); const mx = (P[0] + P[2]) / 2 + Math.sin(yaw) * 10, mz = (P[1] + P[3]) / 2 + Math.cos(yaw) * 10; const prof = []; for (let o = -16; o <= 16; o += 1) prof.push({ o, s: c.world.surfaceAt(mx + lx * o, mz + lz * o), bh: c.world.buildingHeightAt(mx + lx * o, mz + lz * o) > 0 }); const sw = prof.filter((q) => q.s === 'sidewalk' && !q.bh); const pick = sw.length ? sw.reduce((a, b) => (Math.abs(Math.abs(b.o) - 8) < Math.abs(Math.abs(a.o) - 8) ? b : a)) : { o: 6 }; return { prof: prof.map((q) => `${q.o}:${q.bh ? 'B' : q.s[0]}`).join(' '), offset: pick.o, lx, lz }; }, [P, yaw0]);
  R.side = side; log('profil en travers', side.prof, '→ trottoir à', side.offset, 'm de l’axe');
  const start = [P[0] + side.lx * side.offset + Math.sin(yaw0) * 6, P[1] + side.lz * side.offset + Math.cos(yaw0) * 6];
  const tp = await ev(([x, z]) => window.__V.tp(x, z), start);
  log('départ', J({ x: tp.info.x, z: tp.info.z, surf: tp.info.surface, free: tp.info.free }));
  await look(yaw0, -0.05); await snap(page, `verif-${tag}-1-rue-axe`);
  await look(yaw0, 0.55); await snap(page, `verif-${tag}-2-facades-haut`);
  await look(yaw0 + (side.offset > 0 ? -1 : 1) * 1.2, 0.2); await snap(page, `verif-${tag}-3-facade-en-face`);
  // marche le long du trottoir : chaque blocage est relevé (mobilier simulé à proximité ?)
  await key.down('KeyW');
  const walk = await ev(([yaw, len]) => {
    const c = window.__CRS; const ctx = c.ctx; const p = ctx.player.person(); const x0 = p.x, z0 = p.z; const blocks = []; let stuck = 0, dist = 0, px = p.x, pz = p.z; const out = [];
    const along = () => (p.x - x0) * Math.sin(yaw) + (p.z - z0) * Math.cos(yaw);
    for (let i = 0; i < 30 * 150 && along() < len; i++) {
      ctx.player.state.camYaw = yaw; c.game.step(1 / 30);
      const d = Math.hypot(p.x - px, p.z - pz); dist += d; px = p.x; pz = p.z; stuck = d < 0.01 ? stuck + 1 : 0;
      if (stuck === 20) {
        out.length = 0; ctx.props.queryRadius(p.x + Math.sin(yaw) * 0.6, p.z + Math.cos(yaw) * 0.6, 1.3, out);
        const veh = []; ctx.vehicles.queryRadius(p.x, p.z, 3.5, veh); const ppl = []; ctx.people.queryRadius(p.x, p.z, 1.2, ppl);
        const hit = window.__V.ray(p.x, p.z, p.x + Math.sin(yaw) * 1.2, p.z + Math.cos(yaw) * 1.2);
        blocks.push({ at: +along().toFixed(1), x: +p.x.toFixed(1), z: +p.z.toFixed(1), props: out.map((q) => `${q.kind}@${Math.hypot(q.x - p.x, q.z - p.z).toFixed(1)}`), vehicules: veh.map((v) => v.kind), personnes: ppl.length - 1, monde: hit ? `${hit.kind}@${hit.d.toFixed(2)}` : null, surf: ctx.world.surfaceAt(p.x, p.z) });
        if (blocks.length >= 12) break;
        // on contourne : pas de côté de 1,2 m vers la chaussée puis reprise
        const lx = Math.cos(yaw), lz = -Math.sin(yaw); const s = blocks.length % 2 ? 1 : -1; p.x += lx * 1.2 * s + Math.sin(yaw) * 0.3; p.z += lz * 1.2 * s + Math.cos(yaw) * 0.3; ctx.people.rebuildIndex(); stuck = 0;
      }
    }
    return { dist, along: along(), blocks, t: ctx.clock.now };
  }, [yaw0, Math.min(street.length - 20, Number(args.len ?? 160))]);
  await key.up('KeyW');
  R.walk = walk; log('marche sur le trottoir', J(walk));
  // premier blocage dû au mobilier : capture à la troisième personne
  const b = walk.blocks.find((q) => q.props.length > 0 && !q.monde && q.vehicules.length === 0);
  if (b) {
    await ev(([x, z]) => { const c = window.__CRS; const p = c.ctx.player.person(); p.x = x; p.z = z; c.ctx.people.rebuildIndex(); }, [b.x, b.z]);
    await look(yaw0, -0.35); await snap(page, `verif-${tag}-4-blocage-fps`);
    await key.press('KeyV'); await look(yaw0, -0.25); await snap(page, `verif-${tag}-5-blocage-tps`); await key.press('KeyV'); await step(page, 0.3);
    R.blockShown = b;
  }
  // vues de la rue à mi-parcours, dans les deux sens, et le sol
  await look(yaw0, -0.05); await snap(page, `verif-${tag}-6-rue-suite`);
  await look(yaw0 + Math.PI, -0.05); await snap(page, `verif-${tag}-7-rue-retour`);
  await look(yaw0, -0.8); await snap(page, `verif-${tag}-8-sol`);
  R.stats = await ev(() => { const c = window.__CRS.ctx; const i = c.view.renderer.info; const b = c.service('render.base'); return { calls: i.render.calls, tris: i.render.triangles, buf: `${b.stats.width}×${b.stats.height}`, draw: Math.round(c.view.drawDistance), props: c.props.list.length, propKinds: c.props.list.slice(0, 4000).reduce((o, q) => (o[q.kind] = (o[q.kind] || 0) + 1, o), {}) }; });
  log('stats', J(R.stats));
  // circulation : 4 minutes simulées, piétons heurtés par des véhicules
  R.traffic = await ev(() => { const c = window.__CRS; const t0 = c.ctx.clock.now; for (let i = 0; i < 30 * 240; i++) c.game.step(1 / 30); return { seconds: c.ctx.clock.now - t0, veh: c.ctx.vehicles.list.length, drivers: c.ctx.people.list.filter((q) => q.kind === 'conducteur').length, civils: c.ctx.people.list.filter((q) => q.faction === 'civil' && q.vehicleId === 0).length, down: c.ctx.people.list.filter((q) => q.faction === 'civil' && (q.posture === 'down' || q.injury !== 'none')).map((q) => `${q.kind}:${q.injury}:${q.posture}`) }; });
  R.hits = await ev(() => window.__hits);
  log('circulation', J(R.traffic)); log('piétons heurtés', J(R.hits));
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
