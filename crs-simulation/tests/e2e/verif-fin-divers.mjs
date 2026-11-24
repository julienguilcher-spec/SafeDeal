// Testeur indépendant — CONTRÔLE FINAL, mineurs rejoués en une session (place de la République, CRS porte-bouclier, midi) :
//   dispositif à l'écart ; touche F d'un simple gardien ; « Repousser » sur un collègue ; tronc d'arbre ; pieds sur le trottoir ;
//   bouclier levé à la première personne ; puis rue Royale (murs aveugles ?) ; puis lieu inconnu dans l'URL.
// Usage : node tests/e2e/verif-fin-divers.mjs
import { startServer, openPage, waitFor, frames, step, state, snap, hold, notices, sysErrors, census, makeChecker, args, J, R } from './verif-fin-lib.mjs';
const tag = 'verif-fin-divers';
const C = makeChecker(tag);
const report = {};
const server = await startServer();
const allErrors = [];
const tp = (page, x, z) => page.evaluate(async ([x, z]) => {
  const C = window.__CRS; const ctx = C.ctx;
  C.teleport(x, z);
  try { await Promise.race([ctx.world.whenLoaded(x, z, 300), new Promise((r) => setTimeout(r, 60000))]); } catch (e) { /* ignore */ }
  const view = ctx.service('world.view');
  let guard = 0;
  while (view && view.pending() > 0 && guard++ < 400) { view.flush(200); await new Promise((r) => setTimeout(r, 0)); }
  C.step(0.2);
}, [x, z]);

// ═════════════ 1. République ═════════════
{
  const url = `${server.url}?autostart=paris&role=crs&poste=bouclier&place=${encodeURIComponent('Place de la République')}&crowd=200&quality=bas&seed=23&time=12&weather=clair`;
  const { browser, page, errors } = await openPage(url, { width: 1024, height: 576, pointerLock: false });
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
    await frames(page, 4);
    const cs = await census(page);
    report.republique = cs;
    console.log('  recensement : ' + J({ police: cs.police, onFoot: cs.onFoot, vehicles: cs.vehicles, squads: cs.squads, protest: cs.protest, near: cs.nearestProtesterToPolice, toCrowd: cs.playerToCrowd, toPlace: cs.playerToPlace, sector: cs.sector }));
    C.check(/r[ée]publique/i.test(cs.sector), 'le joueur est place de la République', cs.sector);
    C.check(cs.protest > 5 && cs.nearestProtesterToPolice > 25, 'DISPOSITIF (République) : aucun manifestant à moins de 25 m d’un policier au départ', `${cs.protest} manifestants, le plus proche à ${R(cs.nearestProtesterToPolice, 0)} m ; joueur à ${R(cs.playerToCrowd, 0)} m de la foule`);
    const st0 = await state(page);
    await snap(page, tag + '-01-republique-depart-' + st0.camera);
    // véhicules de l'unité : nez vers la sortie, aucun collègue devant
    const vans = await page.evaluate(() => {
      const c = window.__CRS.ctx; const s = c.service('session.setup').summary; const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      // (sans les véhicules garés en réserve des commissariats : ils ne sont pas ceux de l'unité)
      const held = c.service('police.commissariats');
      return c.vehicles.list.filter((v) => v.faction === 'police' && !(held && held.holds(v.id))).map((v) => {
        const vfx = Math.sin(v.heading), vfz = Math.cos(v.heading); let ahead = 0;
        for (const p of c.people.list) { if (p.faction !== 'police' || p.vehicleId !== 0) continue; const dx = p.x - v.x, dz = p.z - v.z; const a = dx * vfx + dz * vfz, l = Math.abs(dx * vfz - dz * vfx); if (a > 2 && a < 30 && l < 1.6) ahead++; }
        return { kind: v.kind, facing: Math.sin(v.heading) * fx + Math.cos(v.heading) * fz, behind: -((v.x - s.x) * fx + (v.z - s.z) * fz), ahead, free: c.world.isFree(v.x, v.z, 0.8), bh: c.world.buildingHeightAt(v.x, v.z) };
      });
    });
    report.vehicules = vans;
    C.check(vans.length > 0 && vans.every((v) => v.ahead === 0), 'FOURGONS (République) : aucun collègue à pied devant le nez d’un véhicule de police', vans.map((v) => `${v.kind} ${R(v.behind, 0)} m derrière, orient. ${R(v.facing)}, ${v.ahead} devant`).join(' ; '));
    C.check(vans.every((v) => v.bh === 0), 'aucun véhicule de police posé dans un immeuble', vans.filter((v) => v.bh > 0).map((v) => v.kind).join(', '));

    // touche F d'un simple gardien : la roue réduite, mêmes numéros que pour un chef (F puis 1, F puis 2, F puis 7)
    await hold(page, 'KeyF');
    await frames(page, 3);
    const wheel = await page.evaluate(() => ({
      screen: window.__CRS.ctx.ui.current,
      // (libellés sur deux lignes : comparés sans les espaces)
      labels: [...document.querySelectorAll('[data-id="order-wheel"] .cw-label')].map((e) => (e.textContent || '').replace(/\s+/g, '')),
      keys: [...document.querySelectorAll('[data-id="order-wheel"] .cw-key')].map((e) => (e.textContent || '').trim()).join(','),
    }));
    C.check(wheel.labels.join('|') === 'Suivez-moiàpied|Suivez-moienvéhicules|Secoursici' && wheel.keys === '1,2,7',
      'TOUCHE F (simple gardien) : « Suivez-moi à pied » (1), « Suivez-moi en véhicules » (2), « Secours ici » (7)', J(wheel));
    await hold(page, 'Escape');
    await frames(page, 3);
    C.check((await state(page)).screen === null, '… Échap la referme : aucun écran ne reste ouvert');

    // « Repousser » sur un collègue : on se place face à un équipier, à 0,9 m
    const mate = await page.evaluate(() => {
      const c = window.__CRS.ctx; const me = c.player.person();
      const m = c.people.list.filter((p) => p.faction === 'police' && !p.isPlayer && p.vehicleId === 0).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (!m) return null;
      const a = m.heading + Math.PI; // derrière lui
      me.x = m.x + Math.sin(a) * 0.9; me.z = m.z + Math.cos(a) * 0.9; c.people.rebuildIndex();
      c.player.state.camYaw = Math.atan2(m.x - me.x, m.z - me.z); c.player.state.camPitch = 0;
      c.player.setCameraMode('fps');
      return { id: m.id, poste: m.poste };
    });
    await step(page, 0.3); await frames(page, 3);
    const prompt = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.state.prompt; const me = c.player.person(); const opts = []; try { c.interactions.find(me, opts); } catch (e) { /* signature différente */ } return { prompt: p ? { verb: p.verb, label: p.label, target: p.targetId } : null, aimed: c.player.state.aimedPersonId, opts: opts.map((o) => o.verb + ':' + o.label) }; });
    report.repousser = prompt;
    C.check(!prompt.prompt || !/repouss/i.test(prompt.prompt.verb + prompt.prompt.label), '« REPOUSSER » n’est plus proposé face à un collègue', `invite : ${prompt.prompt ? prompt.prompt.label : 'aucune'} ; options : ${prompt.opts.join(', ') || '—'}`);
    await snap(page, tag + '-02-face-a-un-collegue');

    // bouclier levé à la première personne
    await page.evaluate(() => { const c = window.__CRS; const s = c.ctx.service('session.setup').summary; c.teleport(s.x + Math.sin(s.heading) * 7, s.z + Math.cos(s.heading) * 7); c.ctx.player.state.camYaw = s.heading; c.ctx.player.state.camPitch = 0; c.ctx.actions.selectById(c.ctx.player.person(), 'bouclier'); });
    await step(page, 2);
    await page.mouse.move(512, 300); await page.mouse.click(512, 300); await frames(page, 2);
    await page.mouse.down({ button: 'right' });
    await step(page, 1.2);
    const up = await state(page);
    await snap(page, tag + '-03-bouclier-leve');
    await page.mouse.up({ button: 'right' });
    C.check(up.alt === true && up.item === 'bouclier', 'clic droit maintenu : bouclier levé', `alt ${up.alt}, objet ${up.item}, pose ${up.upper}`);

    // tronc d'arbre : droit dessus en marchant
    const tree = await page.evaluate(() => {
      const c = window.__CRS.ctx; const me = c.player.person(); const data = c.service('world.data'); const ts = c.world.tileSize;
      const tx0 = Math.floor(me.x / ts), tz0 = Math.floor(me.z / ts);
      let best = null;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const tile = data && data.tile ? data.tile(tx0 + dx, tz0 + dz) : null;
        if (!tile || !tile.trees) continue;
        const tr = tile.trees;
        for (let i = 0; i < tr.count; i++) {
          const x = tr.x[i], z = tr.z[i];
          const d = Math.hypot(x - me.x, z - me.z);
          if (best && d > best.d) continue;
          // le tronc est-il un obstacle (rayon court qui le traverse) ? et l'approche est-elle libre ?
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2; const sx = x - Math.sin(a) * 5, sz = z - Math.cos(a) * 5;
            if (!c.world.isFree(sx, sz, 0.5)) continue;
            const hit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
            c.world.raycast(sx, sz, x + Math.sin(a) * 1, z + Math.cos(a) * 1, hit);
            const dHit = hit.hit ? hit.t * 6 : -1;
            if (hit.hit && dHit > 3.8) { best = { x, z, d, a, sx, sz, kind: hit.kind, dHit }; break; }
          }
        }
      }
      if (!best) return null;
      window.__CRS.teleport(best.sx, best.sz);
      c.player.state.camYaw = best.a; c.player.state.camPitch = 0.1;
      return best;
    });
    report.arbre = tree;
    if (C.check(tree !== null, 'un tronc d’arbre solide est trouvé près du joueur', tree ? `à ${R(tree.d, 0)} m, obstacle « ${tree.kind} » à ${R(tree.dHit)} m sur 5` : 'aucun arbre faisant obstacle dans les 9 tuiles')) {
      await step(page, 0.4);
      await snap(page, tag + '-04-arbre-5m');
      const res = await page.evaluate((t) => { const c = window.__CRS; const me = c.ctx.player.person(); let min = 99; for (let i = 0; i < 30 * 7; i++) { c.ctx.player.state.camYaw = t.a; me.cmd.moveX = 0; c.game.step(1 / 30); min = Math.min(min, Math.hypot(me.x - t.x, me.z - t.z)); } return { min, along: (me.x - t.sx) * Math.sin(t.a) + (me.z - t.sz) * Math.cos(t.a) }; }, tree).catch(() => null);
      // la boucle ci-dessus n'enfonce pas la touche : on rejoue avec la touche tenue
      await page.evaluate((t) => { window.__CRS.teleport(t.sx, t.sz); window.__CRS.ctx.player.state.camYaw = t.a; }, tree);
      await page.keyboard.down('KeyW');
      const res2 = await page.evaluate((t) => { const c = window.__CRS; const me = c.ctx.player.person(); let min = 99; for (let i = 0; i < 30 * 7; i++) { c.ctx.player.state.camYaw = t.a; c.game.step(1 / 30); min = Math.min(min, Math.hypot(me.x - t.x, me.z - t.z)); } return { min, along: (me.x - t.sx) * Math.sin(t.a) + (me.z - t.sz) * Math.cos(t.a), side: (me.x - t.sx) * Math.cos(t.a) - (me.z - t.sz) * Math.sin(t.a) }; }, tree);
      await page.keyboard.up('KeyW');
      report.arbre.marche = res2;
      C.check(res2.min > 0.3, 'ARBRE : on ne traverse plus le tronc', `distance minimale à l’axe du tronc ${R(res2.min)} m ; ${R(res2.along)} m parcourus dans l’axe, écart latéral ${R(res2.side)} m`);
      await page.evaluate(() => { window.__CRS.ctx.player.state.camPitch = 0.3; });
      await step(page, 0.2);
      await snap(page, tag + '-05-arbre-contact');
    }

    // pieds sur le trottoir : un collègue ou le joueur lui-même, vu de près en troisième personne
    const feet = await page.evaluate(() => {
      const c = window.__CRS.ctx; const view = c.service('world.view'); const me = c.player.person();
      let best = null;
      for (let r = 6; r < 150 && !best; r += 4) for (let k = 0; k < 24 && !best; k++) {
        const x = me.x + Math.sin((k / 24) * Math.PI * 2) * r, z = me.z + Math.cos((k / 24) * Math.PI * 2) * r;
        if (c.world.surfaceAt(x, z) === 'sidewalk' && c.world.isFree(x, z, 0.8) && view.liftAt(x, z) > 0.03) best = { x, z, lift: view.liftAt(x, z) };
      }
      if (!best) return null;
      window.__CRS.teleport(best.x, best.z);
      c.player.setCameraMode('tps'); c.player.state.camPitch = -0.5;
      return best;
    });
    await step(page, 0.5);
    C.check(feet !== null, 'un trottoir surélevé est trouvé', feet ? `sol dessiné ${R(feet.lift * 100, 0)} cm au-dessus du sol simulé` : '');
    await snap(page, tag + '-06-pieds-trottoir');

    // ── rue Royale : murs aveugles à texture étirée ? ──
    const royale = await page.evaluate(() => { const c = window.__CRS.ctx; const lm = {}; for (const l of c.world.landmarks) lm[l.key] = { x: l.x, z: l.z }; return { mad: lm.madeleine ?? lm.eglise_madeleine ?? null, ob: lm.obelisque_concorde ?? { x: 0, z: 0 } }; });
    if (royale.mad) {
      const L = Math.hypot(royale.mad.x - royale.ob.x, royale.mad.z - royale.ob.z);
      const ux = (royale.mad.x - royale.ob.x) / L, uz = (royale.mad.z - royale.ob.z) / L;
      // points le long de l'axe Concorde → Madeleine (la rue Royale), à 45 % et 70 % du trajet
      let k = 0;
      for (const f of [0.42, 0.6, 0.75]) {
        const spot = await page.evaluate(([x, z]) => { const c = window.__CRS.ctx; for (let r = 0; r < 25; r += 1.5) for (let a = 0; a < 8; a++) { const px = x + Math.sin(a * Math.PI / 4) * r, pz = z + Math.cos(a * Math.PI / 4) * r; if (c.world.isFree(px, pz, 0.6) && c.world.buildingHeightAt(px, pz) === 0) return { x: px, z: pz, s: c.world.surfaceAt(px, pz), sector: c.world.sectorName(px, pz) }; } return null; }, [royale.ob.x + ux * L * f, royale.ob.z + uz * L * f]);
        if (!spot) continue;
        await tp(page, spot.x, spot.z);
        await page.evaluate(() => window.__CRS.ctx.player.setCameraMode('fps'));
        for (const [name, yaw, pitch] of [['axe', Math.atan2(ux, uz), 0.12], ['gauche', Math.atan2(ux, uz) + 1.1, 0.25], ['droite', Math.atan2(ux, uz) - 1.1, 0.25]]) {
          await page.evaluate(([y, p]) => { const s = window.__CRS.ctx.player.state; s.camYaw = y; s.camPitch = p; }, [yaw, pitch]);
          await step(page, 0.25); await frames(page, 4);
          await snap(page, `${tag}-07-rue-royale-${++k}-${name}`);
        }
        C.note(`rue Royale, point ${f} : ${spot.sector} (${spot.s})`);
      }
    }
    const se = await sysErrors(page);
    C.check(se.length === 0, 'aucun système en erreur ni désactivé', se.join(', '));
  } catch (err) {
    C.check(false, 'exception (République)', String(err && err.stack ? err.stack : err).slice(0, 600));
    try { await snap(page, tag + '-echec'); } catch { /* page fermée */ }
  }
  for (const e of errors) allErrors.push(e);
  await browser.close().catch(() => {});
}

// ═════════════ 2. lieu inconnu dans l'URL ═════════════
{
  const url = `${server.url}?autostart=paris&role=crs&poste=lanceur&place=${encodeURIComponent('Place du Nulle Part')}&crowd=0&quality=bas&seed=3`;
  const { browser, page, errors } = await openPage(url, { width: 960, height: 540, pointerLock: false });
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
    await frames(page, 4);
    const nt = await notices(page);
    const where = await page.evaluate(() => { const c = window.__CRS.ctx; const p = c.player.person(); return c.world.sectorName(p.x, p.z); });
    C.check(nt.some((t) => /inconnu|introuvable|Nulle Part/i.test(t)), 'LIEU INCONNU dans l’URL : le joueur est averti', `départ « ${where} » ; notifications : ${nt.join(' | ').slice(0, 200)}`);
    await snap(page, tag + '-08-lieu-inconnu');
  } catch (err) {
    C.check(false, 'exception (lieu inconnu)', String(err && err.stack ? err.stack : err).slice(0, 400));
  }
  for (const e of errors) allErrors.push(e);
  await browser.close().catch(() => {});
}
C.check(allErrors.length === 0, 'zéro erreur console', allErrors.slice(0, 4).join(' | ').slice(0, 600));
report.errors = allErrors; report.failures = C.failures; report.notes = C.notes;
C.done(report);
await server.close().catch(() => {});
process.exit(0);
