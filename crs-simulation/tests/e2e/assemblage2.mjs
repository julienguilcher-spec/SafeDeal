// Bout en bout — ASSEMBLAGE 2 : corrections de la recette du premier jeu assemblé qui ne sont pas couvertes par
// game.mjs. Vrai jeu, vraie carte, qualité « bas », capture de la souris refusée (voir lib.mjs).
//
//   A. manette : Select → plan ; Select → carte tactique ; Select → jeu ; entrée « Carte tactique » du menu de pause ;
//   B. chef de groupe : un ordre donné (« avancer ») est exécuté par les équipiers ;
//   C. fourgon : garé nez vers la sortie ; monter et rouler tout droit ne renverse aucun collègue ;
//   D. vue subjective : lanceur de 56 mm visible au port, bouclier levé sous le réticule ; pieds sur le trottoir ;
//   E. de nuit, place de la République : candélabres dessinés, lumières dynamiques demandées ;
//   F. fenêtres de 640×360 et 700×900 : aucun chevauchement dans le HUD ;
//   G. téléphone en portrait : la partie se met en pause derrière « Tournez votre appareil ».
//
// Usage : node tests/e2e/assemblage2.mjs [--only=ABCDEFG]
// Captures : tests/e2e/out/a2-*.png ; rapport : tests/e2e/out/a2-report.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, finish, OUT } from './lib.mjs';
import { frames, step, state, installPad, PAD, padButton, rects, overlap } from './verif-tpm-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const parts = (args.only ?? 'ABCDEFG').toUpperCase();
const failures = [];
let checks = 0;
const check = (ok, msg, detail = '') => {
  checks++;
  if (ok) console.log('  ✓ ' + msg + (detail ? ` — ${detail}` : ''));
  else {
    failures.push(msg);
    console.error('  ✗ ' + msg + (detail ? ` — ${detail}` : ''));
  }
  return ok;
};
const report = {};
const snap = async (page, name) => {
  await frames(page, 2);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('  capture : ' + file);
  return file;
};
const playing = async (page) => {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await frames(page, 4);
};
const allErrors = [];

async function session(server, query, size, body, opts = {}) {
  const { browser, page, errors } = await openPage(`${server.url}?autostart=paris&quality=bas&seed=7&${query}`, { width: size[0], height: size[1], pointerLock: false, ...opts });
  try {
    await playing(page);
    await body(page);
  } catch (err) {
    failures.push('exception : ' + (err && err.stack ? err.stack : String(err)));
    console.error(err);
    try { await snap(page, 'a2-echec'); } catch { /* page fermée */ }
  }
  try {
    const sys = await page.evaluate(() => window.__CRS.ctx.service('perf').systems.filter((x) => x.disabled || x.errors > 0).map((x) => `${x.id} (${x.errors})`));
    check(sys.length === 0, 'aucun système en erreur ni désactivé', sys.join(', '));
  } catch { /* page fermée */ }
  for (const e of errors) allErrors.push(e);
  await browser.close();
}

const server = await startServer();

// ═════════════════════ A, B, C : chef de groupe, manette, ordres, fourgon ═════════════════════
if (/[ABC]/.test(parts)) {
  console.log('[a2] chef de groupe, place de la Concorde (manette, ordres, fourgon)');
  await session(server, 'role=chef_groupe&place=Place%20de%20la%20Concorde&crowd=120&camera=tps', [960, 540], async (page) => {
    const pad = async (index) => {
      await padButton(page, index, 1);
      await frames(page, 3);
      await padButton(page, index, 0);
      await frames(page, 3);
    };
    if (parts.includes('A')) {
      await installPad(page);
      await frames(page, 6);
      await pad(PAD.SELECT);
      await page.waitForTimeout(300);
      const s1 = (await state(page)).screen;
      await pad(PAD.SELECT);
      await page.waitForTimeout(300);
      const s2 = (await state(page)).screen;
      if (s2 === 'carte_tactique') await snap(page, 'a2-manette-carte-tactique');
      await pad(PAD.SELECT);
      await page.waitForTimeout(300);
      const s3 = await state(page);
      check(s1 === 'carte' && s2 === 'carte_tactique' && s3.screen === null && s3.phase === 'playing',
        'manette : Select ouvre le plan, un second appui la carte tactique, un troisième revient au jeu', `${s1} → ${s2} → ${s3.screen}`);
      // menu de pause : entrée « Carte tactique »
      await pad(PAD.START);
      await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 60000);
      const label = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.ui-keys > span')].map((e) => (e.textContent || '').trim());
        const i = rows.indexOf('Carte tactique');
        return i >= 0 ? rows[i + 1] : '';
      });
      check(/Select/.test(label) && !/Tab/.test(label), 'l’aide de la pause annonce la carte tactique sur un bouton de la manette', `« ${label} »`);
      await page.locator('[data-id="pause-tactique"]').click();
      await frames(page, 4);
      await page.waitForTimeout(300);
      const s4 = await state(page);
      check(s4.screen === 'carte_tactique', 'menu de pause : « Carte tactique » ouvre la carte', String(s4.screen));
      await pad(PAD.B);
      await frames(page, 3);
      const s5 = await state(page);
      check(s5.screen === null && s5.phase === 'playing', 'B referme la carte et le jeu reprend', `${s5.screen} / ${s5.phase}`);
      check(await page.evaluate(() => document.pointerLockElement === null), 'à la manette, la reprise ne capture pas la souris');
      // retour au clavier pour la suite
      await page.evaluate(() => { window.__pad.connected = false; Object.defineProperty(navigator, 'getGamepads', { value: () => [null, null, null, null], configurable: true }); window.dispatchEvent(new Event('gamepaddisconnected')); });
      await frames(page, 3);
      if ((await state(page)).screen === 'pause') {
        await page.locator('[data-id="pause-reprendre"]').click();
        await frames(page, 3);
      }
    }
    if (parts.includes('B')) {
      // Ordre « avancer » de 20 m donné par le chef de groupe à son groupe, dans une compagnie menée par l'IA : le chef
      // de section (IA) a déjà envoyé le groupe à son poste ; l'ordre du joueur prime, le groupe se reforme sur son
      // chef puis rejoint le point. Le joueur marche vers le point qu'il a ordonné (le groupe attend son chef, qui
      // n'est jamais déplacé par l'IA : immobile, il ferait avancer la colonne au ralenti).
      const r = await page.evaluate(() => {
        const c = window.__CRS.ctx;
        const me = c.player.person();
        const sq = c.squads.get(me.squadId);
        const s = c.service('session.setup').summary;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const tx = me.x + fx * 20, tz = me.z + fz * 20;
        const mates = sq.members.map((id) => c.people.get(id)).filter((p) => p && !p.isPlayer && p.vehicleId === 0);
        const from = mates.map((p) => ({ id: p.id, d: Math.hypot(p.x - tx, p.z - tz) }));
        c.player.state.camYaw = s.heading;
        c.player.state.camPitch = -0.1;
        c.squads.issue(sq.id, { type: 'avancer', x: tx, z: tz, heading: s.heading, issuedBy: me.id });
        return { leader: sq.leaderId === me.id, name: sq.name, from, tx, tz, x0: me.x, z0: me.z };
      });
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 20; i++) {
        await step(page, 1);
        const left = await page.evaluate((r0) => { const me = window.__CRS.ctx.player.person(); return Math.hypot(me.x - r0.tx, me.z - r0.tz); }, r);
        if (left < 1.5) break;
      }
      await page.keyboard.up('KeyW');
      // Le groupe revient d'abord là où son chef a donné l'ordre (il était parti à son poste, parfois à plus de
      // 100 m), s'y met en colonne, puis rejoint le point : on attend son arrivée, 180 s simulées au plus.
      const read = () => page.evaluate((r0) => {
        const c = window.__CRS.ctx;
        const me = c.player.person();
        const sq = c.squads.get(me.squadId);
        return {
          left: r0.from.map((f) => { const p = c.people.get(f.id); return p ? Math.hypot(p.x - r0.tx, p.z - r0.tz) : 99; }),
          walked: Math.hypot(me.x - r0.x0, me.z - r0.z0), order: sq.order.type, by: sq.order.issuedBy === me.id,
        };
      }, r);
      let after = await read();
      let waited = 0;
      while (waited < 180 && !after.left.every((d) => d < 6)) {
        await step(page, 5);
        waited += 5;
        after = await read();
      }
      after.waited = waited;
      report.ordre = { ...r, ...after };
      check(after.walked > 14, 'le chef de groupe marche vers le point qu’il a ordonné', `${after.walked.toFixed(1)} m`);
      check(after.order === 'avancer' && after.by, 'l’ordre du joueur n’est pas remplacé par celui du chef de section (IA)', `ordre en cours « ${after.order} »`);
      check(r.leader && after.left.length >= 4 && after.left.every((d) => d < 6), 'l’ordre « avancer » du chef de groupe est exécuté : ses équipiers rejoignent le point',
        `${r.name} : distances au point ${r.from.map((f) => f.d.toFixed(0)).join(', ')} m → ${after.left.map((d) => d.toFixed(1)).join(', ')} m, ${waited} s après l’arrivée du chef`);
      await step(page, 0.3);
      await snap(page, 'a2-ordre-avancer');
    }
    if (parts.includes('C')) {
      const van = await page.evaluate(() => {
        const c = window.__CRS.ctx;
        const s = c.service('session.setup').summary;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const v = c.vehicles.list.find((q) => q.faction === 'police' && q.kind === 'fourgon_crs');
        if (!v) return null;
        const me = c.player.person();
        // à la portière du conducteur (gauche du véhicule)
        const vfx = Math.sin(v.heading), vfz = Math.cos(v.heading);
        const side = v.def.width * 0.5 + 0.7;
        window.__CRS.teleport(v.x + vfz * side + vfx * v.def.length * 0.22, v.z - vfx * side + vfz * v.def.length * 0.22);
        return { id: v.id, behind: (v.x - s.x) * fx + (v.z - s.z) * fz, facing: Math.sin(v.heading) * fx + Math.cos(v.heading) * fz, aiDriver: v.seats[0] !== 0 && v.seats[0] !== me.id };
      });
      check(van !== null && van.behind < -10 && van.facing < -0.9, 'le fourgon est garé derrière l’unité, nez vers la sortie', van ? `à ${(-van.behind).toFixed(0)} m derrière, orientation ${van.facing.toFixed(2)}` : 'aucun fourgon');
      if (van) {
        // à la portière du conducteur : l'invite « Conduire » est proposée même si un collègue IA tient le volant
        await step(page, 0.8);
        await frames(page, 3);
        const prompt = await page.evaluate(() => { const p = window.__CRS.ctx.player.state.prompt; return p ? { verb: p.verb, label: p.label } : null; });
        check(prompt !== null && prompt.verb === 'conduire', 'à la portière, l’invite « Conduire » est proposée au joueur', prompt ? `${prompt.label}${van.aiDriver ? ' (un conducteur IA est au volant : il cède sa place)' : ''}` : 'aucune invite');
        await page.keyboard.down('KeyE');
        await frames(page, 2);
        await page.keyboard.up('KeyE');
        await step(page, 4);
        const boarded = await page.evaluate((id) => {
          const c = window.__CRS.ctx;
          const me = c.player.person();
          const v = c.vehicles.get(id);
          window.__hurt = [];
          c.events.on('person:hurt', (e) => { const p = c.people.get(e.id); if (p && p.faction === 'police' && e.info.kind === 'vehicle') window.__hurt.push(e.id); });
          return me.vehicleId === v.id && v.seats[0] === me.id;
        }, van.id);
        check(boarded, 'le joueur prend le volant du fourgon');
        await step(page, 0.5);
        const before = await page.evaluate((id) => { const v = window.__CRS.ctx.vehicles.get(id); return { x: v.x, z: v.z }; }, van.id);
        await page.keyboard.down('KeyW');
        await step(page, 7);
        await page.keyboard.up('KeyW');
        await step(page, 1);
        const after = await page.evaluate((id) => {
          const c = window.__CRS.ctx;
          const v = c.vehicles.get(id);
          const down = c.people.list.filter((p) => p.faction === 'police' && (p.posture === 'down' || p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead')).length;
          return { x: v.x, z: v.z, speed: v.speed, hurt: window.__hurt.length, down, faults: c.law.forceLog.filter((f) => f.means === 'vehicule').length };
        }, van.id);
        const d = Math.hypot(after.x - before.x, after.z - before.z);
        report.fourgon = { d, ...after };
        check(d > 8, 'le fourgon roule', `${d.toFixed(0)} m en 7 s`);
        check(after.hurt === 0 && after.down === 0, 'rouler tout droit depuis la place de stationnement ne renverse aucun collègue', `${after.hurt} collègue(s) heurté(s), ${after.down} à terre`);
        await snap(page, 'a2-fourgon');
      }
    }
  });
}

// ═════════════════════ D : vue subjective, pieds sur le trottoir ═════════════════════
if (parts.includes('D')) {
  console.log('[a2] vue subjective : lanceur au port, bouclier levé ; pieds sur le trottoir');
  await session(server, 'role=crs&poste=lanceur&place=Place%20de%20la%20Concorde&crowd=0&camera=fps', [960, 540], async (page) => {
    // à l'écart des collègues, regard vers la place
    await page.evaluate(() => {
      const c = window.__CRS;
      const s = c.ctx.service('session.setup').summary;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      c.teleport(s.x + fx * 6, s.z + fz * 6);
      c.ctx.player.state.camYaw = s.heading;
      c.ctx.player.state.camPitch = 0;
    });
    await step(page, 2);
    const st = await state(page);
    check(st.item === 'lanceur_cougar' && st.camera === 'fps', 'lanceur de 56 mm en main, vue subjective', `${st.item} / ${st.camera}`);
    await snap(page, 'a2-fps-lanceur-au-port');
    // pieds sur le trottoir : un collègue sur un trottoir, vu de près en vue extérieure
    const feet = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const view = c.service('world.view');
      const me = c.player.person();
      let best = null;
      for (let r = 6; r < 120 && !best; r += 4) {
        for (let k = 0; k < 24 && !best; k++) {
          const x = me.x + Math.sin((k / 24) * Math.PI * 2) * r, z = me.z + Math.cos((k / 24) * Math.PI * 2) * r;
          if (c.world.surfaceAt(x, z) === 'sidewalk' && c.world.isFree(x, z, 0.6) && view.liftAt(x, z) > 0.03) best = { x, z, lift: view.liftAt(x, z) };
        }
      }
      if (!best) return null;
      window.__CRS.teleport(best.x, best.z);
      c.player.setCameraMode('tps');
      c.player.state.camPitch = -0.45;
      return best;
    });
    await step(page, 0.5);
    check(feet !== null && feet.lift > 0.03, 'un trottoir surélevé est trouvé près du départ', feet ? `surélévation du sol dessiné ${(feet.lift * 100).toFixed(0)} cm` : 'aucun');
    await snap(page, 'a2-pieds-trottoir');
  });
  await session(server, 'role=crs&poste=bouclier&place=Place%20de%20la%20Concorde&crowd=0&camera=fps', [960, 540], async (page) => {
    await page.evaluate(() => {
      const c = window.__CRS;
      const s = c.ctx.service('session.setup').summary;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      c.teleport(s.x + fx * 6, s.z + fz * 6);
      c.ctx.player.state.camYaw = s.heading;
      c.ctx.player.state.camPitch = 0;
      c.ctx.actions.selectById(c.ctx.player.person(), 'bouclier');
    });
    await step(page, 2);
    await snap(page, 'a2-fps-bouclier-bas');
    // clic droit maintenu : bouclier levé (mode de repli : le bouton agit)
    await page.mouse.move(480, 300);
    await page.mouse.click(480, 300); // premier clic : tentative de capture, refusée → mode de repli
    await frames(page, 2);
    await page.mouse.down({ button: 'right' });
    await step(page, 1.2);
    const up = await state(page);
    await snap(page, 'a2-fps-bouclier-leve');
    await page.mouse.up({ button: 'right' });
    check(up.alt === true && up.item === 'bouclier', 'clic droit maintenu : bouclier levé', `alt ${up.alt}, pose « ${up.upper} »`);
  });
}

// ═════════════════════ E : nuit, place de la République ═════════════════════
if (parts.includes('E')) {
  console.log('[a2] nuit, place de la République');
  await session(server, 'role=crs&poste=lanceur&place=Place%20de%20la%20R%C3%A9publique&crowd=0&time=23.5&camera=tps', [960, 540], async (page) => {
    await step(page, 2);
    await frames(page, 4);
    const night = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const base = c.service('render.base').stats;
      const props = c.service('propsRender').stats;
      return { streetLights: c.env.state.streetLights, isNight: c.env.state.isNight, lightsWanted: base.lightsWanted, lightsLit: base.lightsLit, halos: props.halos, lights: props.lights, drawCalls: props.drawCalls };
    });
    report.nuit = night;
    check(night.isNight && night.streetLights, 'il fait nuit, l’éclairage public est allumé');
    check(night.halos > 0, 'les lanternes des candélabres sont dessinées (halos)', `${night.halos} halos`);
    check(night.lightsWanted > 0 && night.lightsLit > 0, 'des lumières dynamiques éclairent la rue', `${night.lightsWanted} demandées, ${night.lightsLit} allumées (dont ${night.lights} du mobilier)`);
    await snap(page, 'a2-nuit-republique');
  });
}

// ═════════════════════ F : petites fenêtres ═════════════════════
if (parts.includes('F')) {
  console.log('[a2] HUD dans une petite fenêtre');
  await session(server, 'role=crs&poste=lanceur&place=Place%20de%20la%20Concorde&crowd=100&camera=tps', [960, 540], async (page) => {
    for (const [w, h] of [[640, 360], [700, 900], [960, 540]]) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 6);
      await step(page, 0.3);
      await frames(page, 4);
      const boxes = await rects(page, '.ui-hud .hud-sit, .ui-hud .hud-compass, .ui-hud .hud-band, .ui-hud .hud-status, .ui-hud .hud-items, .ui-hud [data-id="minimap"]');
      const over = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = overlap(boxes[i], boxes[j]);
        if (a > 0) over.push(`${boxes[i].cls.split(' ')[0] || boxes[i].id} × ${boxes[j].cls.split(' ')[0] || boxes[j].id} (${a} px²)`);
      }
      const out = boxes.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > w + 1 || b.y + b.h > h + 1).map((b) => b.cls.split(' ')[0] || b.id);
      check(boxes.length >= 5 && over.length === 0 && out.length === 0, `fenêtre ${w}×${h} : aucun chevauchement dans le HUD, rien hors de l’écran`, `${boxes.length} éléments ; ${over.join(' ; ') || 'aucun chevauchement'}${out.length ? ' ; hors écran : ' + out.join(', ') : ''}`);
      await snap(page, `a2-hud-${w}x${h}`);
    }
  });
}

// ═════════════════════ G : téléphone en portrait ═════════════════════
if (parts.includes('G')) {
  console.log('[a2] téléphone : portrait');
  await session(server, 'role=crs&poste=lanceur&place=Place%20de%20la%20Concorde&crowd=0', [844, 390], async (page) => {
    // un doigt sur l'écran : le périphérique actif devient le tactile, la surcouche s'affiche
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 600, y: 200, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames(page, 4);
    const t0 = (await state(page)).t;
    await page.setViewportSize({ width: 390, height: 844 });
    await frames(page, 8);
    await page.waitForTimeout(500);
    const s1 = await state(page);
    await frames(page, 6);
    const s2 = await state(page);
    await snap(page, 'a2-portrait');
    check(s1.phase === 'paused', 'en portrait, la partie se met en pause', `phase « ${s1.phase} », écran « ${s1.screen} »`);
    check(s2.t === s1.t, 'le temps simulé n’avance plus derrière « Tournez votre appareil »', `${t0.toFixed(1)} → ${s1.t.toFixed(1)} → ${s2.t.toFixed(1)} s`);
    await page.setViewportSize({ width: 844, height: 390 });
    await frames(page, 6);
    const s3 = await state(page);
    check(s3.screen === 'pause', 'de retour en paysage, le menu de pause attend le joueur', String(s3.screen));
  }, { mobile: true, pointerLock: true });
}

check(allErrors.length === 0, 'zéro erreur console sur tous les parcours', allErrors.slice(0, 3).join(' | '));
writeFileSync(path.join(OUT, 'a2-report.json'), JSON.stringify(report, null, 2));
console.log(`[a2] ${checks} vérifications, ${failures.length} échec(s)`);
for (const f of failures) console.error('  ✗ ' + f);
await finish({ server, errors: [], ok: failures.length === 0, label: 'assemblage2' });
