// Bout en bout — LE VRAI JEU (index.html, vraie carte de Paris, tous les modules branchés).
//
//   Ordinateur (960×540, qualité « bas ») : page d'accueil → scénario CRS lanceur de grenades, place de la Concorde →
//   affluence réduite, « Moyens engagés » par défaut → chargement → en jeu : compagnie et moyens d'appui à l'écart de la
//   manifestation qui se rassemble, mobilier urbain dessiné, vues à la troisième puis à la première personne, marche,
//   petite foulée et sprint au clavier (≥ 60 m, sans traverser un mur ni l'obélisque), avance rapide, lancer d'une
//   grenade lacrymogène (projectile puis gaz), unités qui manœuvrent sur ordre du commandant IA, carte, carte tactique,
//   pause, paramètres. Zéro erreur console sur tout le parcours. Mesures : chargement, appels de dessin, triangles,
//   temps JavaScript par système, mémoire.
//   La capture de la souris est REFUSÉE (pointerLock: false) : sous Chromium headless elle emballe le navigateur.
//   Téléphone (844×390 tactile) : même parcours abrégé, commandes tactiles visibles.
//
// Usage : node tests/e2e/game.mjs [--only=bureau|telephone] [--quality=bas] [--size=960x540]
// Captures : tests/e2e/out/game-*.png ; rapport : tests/e2e/out/game-report.json
// La simulation avance avec window.__CRS.step(secondes) : le WebGL logiciel de cette machine est trop lent pour
// attendre le temps réel (et le cœur borne le temps réel par image à 0,1 s).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, finish, ouvrirEditeur, OUT } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = (name) => !args.only || args.only === name;
const quality = args.quality ?? 'bas';
// petite fenêtre : chaque image coûte plusieurs dixièmes de seconde en WebGL logiciel
const [W, H] = (args.size ?? '960x540').split('x').map(Number);

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
const frames = (page, n = 3) => page.evaluate((count) => new Promise((resolve) => {
  let k = 0;
  const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
/** Avance la simulation (sans attendre d'image : le WebGL logiciel met plusieurs dixièmes de seconde par image). */
const step = (page, seconds) => page.evaluate((s) => window.__CRS.step(s), seconds);
const state = (page) => page.evaluate(() => {
  const c = window.__CRS;
  const ctx = c.ctx;
  const p = ctx.player.person();
  const st = ctx.player.state;
  return {
    phase: ctx.session.phase, screen: ctx.ui.current, modal: ctx.ui.modal, camera: st.cameraMode, camYaw: st.camYaw,
    x: p ? p.x : NaN, z: p ? p.z : NaN, heading: p ? p.heading : NaN, active: p ? p.active : -2,
    item: p && p.active >= 0 ? p.inventory[p.active].id : '', free: p ? ctx.world.isFree(p.x, p.z, 0.05) : false,
    inBuilding: p ? ctx.world.buildingHeightAt(p.x, p.z) > 0 : false, people: ctx.people.list.length,
    speed: p ? Math.hypot(p.vx, p.vz) : 0,
    projectiles: ctx.projectiles.list.length, t: ctx.clock.now,
  };
});
const report = { quality, bureau: null, telephone: null };

/** Capture avec un délai large : sous WebGL logiciel et machine chargée, une image peut demander plusieurs secondes. */
async function snap(page, name) {
  await frames(page, 2);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  return file;
}

/** Règle la page d'accueil (rôle CRS, poste, lieu) puis lance ; retourne le temps de chargement (ms). */
async function launchFromHome(page, { poste, tap }) {
  const click = async (selector, options) => {
    const loc = typeof selector === 'string' ? page.locator(selector) : selector;
    await loc.first().scrollIntoViewIfNeeded();
    if (tap) await loc.first().tap(options);
    else await loc.first().click(options);
  };
  // accueil en quatre modes : l'éditeur est la vue « Mode libre »
  await ouvrirEditeur(page);
  await click('[data-id="role-crs"]');
  if (poste) await click(`[data-value="${poste}"]`);
  await click('[data-id="tab-lieu"]');
  await click(page.locator('.ui-list__item', { hasText: 'Place de la Concorde' }));
  // affluence : 200 manifestants demandés (100 en qualité « bas », qui divise la foule par deux) — au clavier sur le curseur
  await click('[data-id="tab-foule"]');
  await page.locator('[data-id="affluence"]').focus();
  // Les menus lisent le clavier une fois par image : à moins d'une image par seconde (WebGL logiciel, machine
  // chargée), une frappe brève se perd. Chaque touche est donc tenue pendant deux images.
  const hold = async (code) => {
    await page.keyboard.down(code);
    await frames(page, 2);
    await page.keyboard.up(code);
    await frames(page, 1);
  };
  await hold('Home');
  for (let i = 0; i < 4; i++) await hold('ArrowRight');
  await frames(page, 2);
  // ce scénario vérifie le dispositif déjà en place près du rassemblement : sans « journée de service »
  // (départ de la caserne, vérifié à part par verif-journee.mjs)
  await click('[data-id="tab-options"]');
  await click('[data-id="opt-journee"]');
  await frames(page, 2);
  const t0 = Date.now();
  await click('[data-id="lancer"]');
  return t0;
}

// ═════════════════════════════════ ordinateur ═════════════════════════════════
async function bureau(server) {
  console.log(`[game] ordinateur ${W}×${H}`);
  const { browser, page, errors } = await openPage(`${server.url}?quality=${quality}`, { width: W, height: H, pointerLock: false });
  const r = { captures: [] };
  report.bureau = r;
  const capture = async (name) => {
    const file = await snap(page, name);
    r.captures.push(file);
    console.log('  capture : ' + file);
  };
  try {
    // ── page d'accueil ──
    const tBoot = Date.now();
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    r.bootMs = Date.now() - tBoot;
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    check(await page.evaluate(() => document.querySelector('.diag') === null), 'le panneau de diagnostic a disparu');
    await ouvrirEditeur(page);
    check(await page.evaluate(() => document.querySelector('[data-id="role-commissaire"]') === null), 'pas de tuile « Commissaire » (commandant unique)');
    check(await page.evaluate(() => document.querySelector('[data-id="role-commandant"]') !== null), 'tuile « Commandant » présente');
    await capture('game-accueil');

    // ── lancement : CRS, lanceur de grenades, place de la Concorde ──
    const t0 = await launchFromHome(page, { poste: 'lanceur', tap: false });
    await waitFor(page, 'window.__CRS.ctx.session.phase !== "menu"', 30000);
    await page.waitForTimeout(400);
    if ((await state(page)).phase === 'loading') await capture('game-chargement');
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 300000);
    r.loadMs = Date.now() - t0;
    r.loading = await page.evaluate(() => ({ ...window.__CRS.ctx.service('session.loading') }));
    console.log(`  chargement : ${(r.loadMs / 1000).toFixed(1)} s (monuments ${Math.round(r.loading.monumentsMs)} ms, ville ${Math.round(r.loading.cityMs)} ms)`);
    await frames(page, 5);

    const setup = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const s = c.service('session.setup').summary;
      const p = c.player.person();
      const cfg = c.session.config;
      const mates = c.people.list.filter((q) => q.squadId === p.squadId && q.id !== p.id);
      const police = c.people.list.filter((q) => q.faction === 'police');
      const protesters = c.people.list.filter((q) => q.faction === 'protest');
      let nearest = Infinity;
      for (const m of protesters) for (const q of police) nearest = Math.min(nearest, Math.hypot(m.x - q.x, m.z - q.z));
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      // (sans les véhicules garés en réserve des commissariats, ailleurs dans Paris)
      const held = c.service('police.commissariats');
      const vans = c.vehicles.list.filter((v) => v.faction === 'police' && (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && !(held && held.holds(v.id)));
      const squad = c.squads.get(p.squadId);
      const section = squad ? c.squads.get(squad.parentId) : undefined;
      const company = section ? c.squads.get(section.parentId) : undefined;
      return {
        summary: s, kind: p.kind, poste: p.poste, rank: p.rank, role: c.player.state.role, place: cfg.place, quality: c.view.quality,
        inventory: p.inventory.map((i) => i.id), mates: mates.length, matesPostes: mates.map((m) => m.poste),
        vehicles: c.vehicles.list.map((v) => v.kind), obelisk: c.world.landmarks.find((l) => l.key === 'obelisque_concorde'),
        sector: c.world.sectorName(p.x, p.z), police: police.length, nearestProtester: nearest,
        fromPlace: Math.hypot(s.x - cfg.x, s.z - cfg.z), moyens: cfg.extra ? cfg.extra.moyens : null,
        unit: [squad?.name, section?.name, company?.name], companyKind: company?.kind ?? '',
        vansBehind: vans.every((v) => (v.x - s.x) * fx + (v.z - s.z) * fz < -10),
        // (le bloc est tourné vers sa vraie sortie — plus forcément dos à l'unité — : toutes les files au même cap)
        vansAligned: vans.length > 0 && vans.every((v) => Math.cos(v.heading - vans[0].heading) > 0.95),
        propsDrawn: { ...(c.service('propsRender')?.stats ?? {}) },
      };
    });
    r.setup = setup;
    check(setup.role === 'crs' && setup.kind === 'crs' && setup.poste === 'lanceur', 'le joueur est un CRS lanceur de grenades', `${setup.kind} / ${setup.poste} / ${setup.rank}`);
    check(/concorde/i.test(setup.sector), 'il se trouve place de la Concorde', setup.sector);
    check(setup.quality === quality, `qualité « ${quality} »`);
    check(setup.mates >= 5, 'il tient son poste dans un groupe de sa compagnie', `${setup.unit.join(' ← ')} ; équipiers : ${setup.matesPostes.join(', ')}`);
    check(setup.companyKind === 'compagnie' && setup.summary.usedPoliceUnits, 'la compagnie est construite par le module de police (unités pilotées par l’IA)');
    // « Moyens engagés » de la page d'accueil (défaut : 4 sections · 12 fourgons · canon à eau · BRAV-M · drone)
    const m = setup.summary.means;
    const asked = setup.moyens ?? {};
    check(m.sections === asked.sections && m.fourgons === asked.fourgons && m.canon_eau === asked.canon_eau && m.bravm === asked.bravm && m.drone === asked.drone,
      'les « Moyens engagés » réglés sur la page d’accueil sont réellement en jeu',
      `demandés ${asked.sections} sections · ${asked.fourgons} fourgons · ${asked.canon_eau} canon à eau · ${asked.bravm} BRAV-M · ${asked.drone} drone ; en jeu ${m.sections} · ${m.fourgons} · ${m.canon_eau} · ${m.bravm} · ${m.drone} (${m.agents} agents)`);
    check(setup.summary.offCrowd && setup.fromPlace >= 80 && setup.nearestProtester > 25, 'le dispositif est à l’écart du rassemblement',
      `à ${setup.fromPlace.toFixed(0)} m du lieu ; manifestant le plus proche d’un policier : ${setup.nearestProtester.toFixed(0)} m`);
    check(setup.vansBehind && setup.vansAligned, 'les fourgons sont garés derrière l’unité, en files au même cap');
    check((setup.propsDrawn.props ?? 0) > 100 && (setup.propsDrawn.drawCalls ?? 0) > 0, 'le mobilier urbain est dessiné',
      `${setup.propsDrawn.props} objets, ${setup.propsDrawn.shops} devantures, ${setup.propsDrawn.drawCalls} appel(s) de dessin, ${setup.propsDrawn.triangles} triangles`);
    check(setup.inventory.includes('grenade_lacrymo'), 'il a des grenades lacrymogènes', setup.inventory.join(', '));
    const demo = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      return {
        crowdSize: c.session.config.crowdSize, phase: c.director.phase, total: c.director.stats.total,
        manif: c.people.list.filter((q) => q.kind === 'manifestant').length, route: c.director.route.length / 2,
        metro: c.service('crowd.metro')?.stations.length ?? -1, traffic: c.service('traffic.control') !== undefined,
      };
    });
    r.demo = demo;
    check(demo.crowdSize === 200, 'l’affluence réglée sur la page d’accueil arrive dans la session', `${demo.crowdSize} manifestants demandés`);
    check(demo.phase === 'rassemblement' && demo.manif > 10, 'une manifestation se rassemble', `phase « ${demo.phase} », ${demo.manif} manifestants sur place, ${demo.total} attendus, ${demo.metro} stations de métro`);
    check(demo.traffic, 'le service de circulation est branché');
    let s = await state(page);
    // Le lanceur tient le second rang d'une compagnie menée par l'IA : il ne commence ni le nez dans le dos des
    // collègues ni enfermé derrière les boucliers (il est posé au bout du premier rang) ; à défaut, vue à la
    // troisième personne.
    const depart = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const me = c.player.person();
      const h = c.service('session.setup').summary.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      let devant = 0, proche = Infinity;
      for (const p of c.people.list) {
        if (p === me || p.dormant || p.vehicleId !== 0) continue;
        const dx = p.x - me.x, dz = p.z - me.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        if (ahead > 0.4 && ahead < 3.2 && side < ahead * 0.7 + 0.3) devant++;
        if (p.faction === 'police') proche = Math.min(proche, Math.hypot(dx, dz));
      }
      return { devant, proche };
    });
    r.depart = { ...depart, camera: s.camera };
    check(depart.devant === 0 || s.camera === 'tps', 'au départ, aucun collègue ne bouche la vue ni le passage du joueur (ou vue à la troisième personne)',
      `${depart.devant} personne(s) dans l’axe à moins de 3,2 m, vue « ${s.camera} »`);
    check(depart.proche < 6, 'le joueur commence à côté de son unité', `collègue le plus proche à ${depart.proche.toFixed(1)} m`);
    check(s.screen === null && !s.modal, 'aucun écran ouvert en jeu', String(s.screen));
    check(await page.evaluate(() => {
      const hud = document.querySelector('.ui-hud');
      return !!hud && getComputedStyle(hud).display !== 'none' && hud.getBoundingClientRect().width > 0;
    }), 'le HUD est affiché');
    check(await page.evaluate(() => document.querySelector('[data-id="minimap"]') !== null), 'la mini-carte est affichée');

    // ── vue de départ, puis troisième personne : l'unité, face au lieu de rassemblement ──
    await step(page, 0.5);
    await capture('game-depart');
    if (s.camera !== 'tps') {
      await page.keyboard.press('KeyV');
      await step(page, 0.4);
      s = await state(page);
      check(s.camera === 'tps', 'la touche V passe à la troisième personne', s.camera);
    }
    await capture('game-tps-depart');
    // La capture de la souris est refusée dans ce test (voir lib.mjs) : le jeu passe en mode de repli, sans erreur.
    await page.mouse.move(2, 2);
    await page.mouse.click(2, 2);
    await frames(page, 2);
    check(await page.evaluate(() => window.__CRS.ctx.input.pointerLocked === false && window.__CRS.ctx.service('input.pointer').fallback === true),
      'capture de la souris refusée : le jeu passe en mode de repli (clic = action, flèches ou glisser = regard)');
    // ── première personne ──
    await page.keyboard.press('KeyV');
    await step(page, 0.4);
    s = await state(page);
    check(s.camera === 'fps', 'la touche V passe à la première personne', s.camera);
    await capture('game-fps');
    // regard vers la droite (flèches du clavier)
    await page.keyboard.down('ArrowRight');
    await step(page, 0.55);
    await page.keyboard.up('ArrowRight');
    await step(page, 0.2);
    await capture('game-fps-collegues');
    const yawTurned = (await state(page)).camYaw;
    check(Math.abs(yawTurned - s.camYaw) > 0.3, 'le regard tourne au clavier', `${s.camYaw.toFixed(2)} → ${yawTurned.toFixed(2)} rad`);

    // ── retour à la troisième personne ──
    await page.keyboard.press('KeyV');
    await step(page, 0.4);
    s = await state(page);
    check(s.camera === 'tps', 'la touche V revient à la troisième personne', s.camera);
    await capture('game-tps-collegues');
    // retour face à l'obélisque : les flèches tournent aussi pendant les images réelles (durée variable sous WebGL
    // logiciel), on vérifie donc le sens du retour puis on recale le regard exactement dans l'axe de départ
    await page.keyboard.down('ArrowLeft');
    await step(page, 0.3);
    await page.keyboard.up('ArrowLeft');
    const yawBack = (await state(page)).camYaw;
    check(Math.sin(yawBack - yawTurned) > 0, 'la flèche gauche ramène le regard vers la gauche', `${yawTurned.toFixed(2)} → ${yawBack.toFixed(2)} rad`);
    await page.evaluate(() => {
      const c = window.__CRS.ctx;
      c.player.state.camYaw = c.service('session.setup').summary.heading;
      c.player.state.camPitch = 0;
    });
    await step(page, 0.3);
    await capture('game-tps');

    // ── déplacement : marche par défaut, petite foulée par bascule, sprint tenu ; le souffle ne s'use pas en marchant ──
    // On part sur le flanc de l'unité, dos au rassemblement (terrain dégagé derrière le dispositif).
    await page.evaluate(() => {
      const c = window.__CRS;
      const s = c.ctx.service('session.setup').summary;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      c.teleport(s.x + fz * 22 - fx * 2, s.z - fx * 22 - fz * 2);
      c.ctx.player.state.camYaw = s.heading + Math.PI / 2;
      c.ctx.player.state.camPitch = 0;
    });
    await step(page, 0.5);
    const staminaOf = () => page.evaluate(() => window.__CRS.ctx.player.person().stamina);
    const start = await state(page);
    const st0 = await staminaOf();
    // appuis de moins d'une seconde : on marche (tenue plus longtemps, la touche fait trottiner puis courir)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('KeyW');
      await step(page, 0.9);
      await page.keyboard.up('KeyW');
      await frames(page, 1);
    }
    const walk = await state(page);
    const dWalk = Math.hypot(walk.x - start.x, walk.z - start.z);
    // la boucle d'images fait aussi avancer la simulation en temps réel : la vitesse se mesure sur l'horloge simulée
    const vWalk = dWalk / Math.max(0.1, walk.t - start.t);
    check(vWalk > 0.7 && vWalk < 1.9, 'au clavier, la touche « avancer » fait MARCHER', `${dWalk.toFixed(1)} m en ${(walk.t - start.t).toFixed(1)} s simulées, soit ${vWalk.toFixed(2)} m/s`);
    check((await staminaOf()) >= st0 - 0.5, 'le souffle ne s’use pas en marchant', `${st0.toFixed(0)} → ${(await staminaOf()).toFixed(0)}`);
    // bascule « marcher / trottiner » (touche physique KeyZ) : petite foulée, même touche avant tenue
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyZ');
    await frames(page, 2);
    await page.keyboard.up('KeyZ');
    await step(page, 1);
    // vitesse de pointe relevée par tranches d'une seconde (le mobilier urbain et les arbres du trottoir font dévier :
    // la moyenne sur le trajet est plus basse que l'allure)
    let vJog = 0;
    let jog1 = await state(page);
    for (let i = 0; i < 5; i++) {
      await step(page, 1);
      jog1 = await state(page);
      vJog = Math.max(vJog, jog1.speed);
    }
    check(vJog > vWalk * 1.6 && vJog < 3.6, 'la bascule d’allure passe à la petite foulée', `${vJog.toFixed(2)} m/s en pointe`);
    check((await page.evaluate(() => window.__CRS.ctx.service('ui.debug').notices())).some((t) => /Allure/.test(t)), 'le changement d’allure est annoncé au joueur');
    await page.keyboard.down('ShiftLeft');
    let travelled = dWalk + Math.hypot(jog1.x - walk.x, jog1.z - walk.z);
    let last = jog1;
    let vSprint = 0;
    for (let i = 0; i < 8; i++) {
      await step(page, 1);
      const now = await state(page);
      travelled += Math.hypot(now.x - last.x, now.z - last.z);
      vSprint = Math.max(vSprint, now.speed);
      last = now;
      if (!now.free || now.inBuilding) break;
    }
    check(vSprint > vJog * 1.2, 'Maj tenu : sprint', `${vSprint.toFixed(2)} m/s en pointe`);
    await page.keyboard.up('ShiftLeft');
    // on tourne d'un quart de tour et on repart en petite foulée
    await page.keyboard.down('ArrowLeft');
    await step(page, 0.75);
    await page.keyboard.up('ArrowLeft');
    for (let i = 0; i < 6; i++) {
      await step(page, 2);
      const now = await state(page);
      travelled += Math.hypot(now.x - last.x, now.z - last.z);
      last = now;
    }
    await page.keyboard.up('KeyW');
    await step(page, 1);
    const end = await state(page);
    r.travelled = travelled;
    check(travelled >= 60, 'déplacement au clavier sur au moins 60 m', `${travelled.toFixed(0)} m parcourus`);
    check(end.free && !end.inBuilding, 'à l’arrivée, le joueur n’est dans aucun obstacle');
    await capture('game-apres-course');
    // retour à la marche pour la suite
    await page.keyboard.down('KeyZ');
    await frames(page, 2);
    await page.keyboard.up('KeyZ');

    // ── obstacle : droit sur l'obélisque depuis le nord — on bute sur sa grille, on ne le traverse pas ──
    await page.evaluate((ob) => {
      const c = window.__CRS;
      c.teleport(ob.x, ob.z - 17);
      c.ctx.player.state.camYaw = 0; // cap 0 = vers +z (sud) : droit sur l'obélisque
      c.ctx.player.state.camPitch = 0;
    }, setup.obelisk);
    await step(page, 0.5);
    let minObelisk = Infinity;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    for (let i = 0; i < 4; i++) {
      await step(page, 1.5);
      const now = await state(page);
      minObelisk = Math.min(minObelisk, Math.hypot(now.x - setup.obelisk.x, now.z - setup.obelisk.z));
      last = now;
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await capture('game-contre-obelisque');
    check(last.free && !last.inBuilding, 'après la course, le joueur n’est dans aucun obstacle');
    check(minObelisk > 5 && minObelisk < 14, 'il n’a pas traversé l’obélisque : il a buté sur sa grille', `distance minimale au centre ${minObelisk.toFixed(1)} m`);

    // ── avance rapide (touche « . ») ──
    const ts0 = await page.evaluate(() => window.__CRS.ctx.clock.timeScale);
    await page.keyboard.down('Period');
    await step(page, 0.2);
    await page.keyboard.up('Period');
    await step(page, 0.2);
    const ts1 = await page.evaluate(() => window.__CRS.ctx.clock.timeScale);
    await page.keyboard.down('Period');
    await step(page, 0.2);
    await page.keyboard.up('Period');
    await step(page, 0.2);
    const ts2 = await page.evaluate(() => window.__CRS.ctx.clock.timeScale);
    check(ts0 === 1 && ts1 === 4 && ts2 === 1, 'la touche d’avance rapide bascule la vitesse de la simulation', `×${ts0} → ×${ts1} → ×${ts2}`);

    // ── roue d'ordres pour un simple CRS : trois secteurs, mêmes numéros que pour un chef (F puis 1, F puis 2, F puis 7) ──
    await page.keyboard.down('KeyF');
    await frames(page, 2);
    await page.keyboard.up('KeyF');
    await frames(page, 3);
    const followWheel = await page.evaluate(() => {
      const w = document.querySelector('[data-id="order-wheel"]');
      return {
        wedges: w ? w.querySelectorAll('.cw-wedge').length : 0,
        // (libellés sur deux lignes : comparés sans les espaces)
        labels: w ? Array.from(w.querySelectorAll('.cw-label')).map((e) => (e.textContent || '').replace(/\s+/g, '')).join('|') : '',
        keys: w ? Array.from(w.querySelectorAll('.cw-key')).map((e) => (e.textContent || '').trim()).join(',') : '',
      };
    });
    check(followWheel.wedges === 3 && followWheel.labels === 'Suivez-moiàpied|Suivez-moienvéhicules|Secoursici' && followWheel.keys === '1,2,7',
      'touche des ordres pour un équipier : la roue réduite « Suivez-moi à pied » (1), « Suivez-moi en véhicules » (2), « Secours ici » (7)', JSON.stringify(followWheel));
    await page.keyboard.press('Escape');
    await frames(page, 3);
    check((await state(page)).screen === null, '… et Échap la referme : aucun écran ne reste ouvert', String((await state(page)).screen));

    // ── les unités manœuvrent : le commandant IA déploie la compagnie (ordres, comptes rendus radio) ──
    const unitsBefore = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      return c.people.list.filter((q) => q.faction === 'police' && !q.isPlayer && q.vehicleId === 0).map((q) => ({ id: q.id, x: q.x, z: q.z }));
    });
    await step(page, 100);
    const units = await page.evaluate((before) => {
      const c = window.__CRS.ctx;
      let moved = 0;
      for (const b of before) {
        const q = c.people.get(b.id);
        if (q && Math.hypot(q.x - b.x, q.z - b.z) > 5) moved++;
      }
      const stuck = c.people.list.filter((q) => q.faction === 'police' && q.vehicleId === 0 && !c.world.isFree(q.x, q.z, 0.05)).length;
      return { moved, total: before.length, stuck, radio: c.radio.log.length, last: c.radio.log.slice(-3).map((m) => `${m.from} : ${m.text.slice(0, 70)}`), command: c.service('police.command')?.commands?.[0]?.phase ?? '' };
    }, unitsBefore);
    r.units = units;
    check(units.moved >= 10, 'les unités manœuvrent sur ordre du commandant IA', `${units.moved} agents sur ${units.total} se sont déplacés de plus de 5 m ; commandement « ${units.command} » ; ${units.radio} messages radio — ${units.last.join(' | ')}`);
    check(units.stuck === 0, 'aucun agent dans un obstacle après la manœuvre');
    await page.evaluate(() => {
      const c = window.__CRS;
      const s = c.ctx.service('session.setup').summary;
      c.teleport(s.x - Math.sin(s.heading) * 3, s.z - Math.cos(s.heading) * 3);
      c.ctx.player.state.camYaw = s.heading;
      c.ctx.player.state.camPitch = 0;
    });
    await step(page, 0.5);
    await capture('game-unites-en-manoeuvre');

    // ── première personne pour le lancer ──
    await page.keyboard.press('KeyV');
    await step(page, 0.3);
    s = await state(page);
    check(s.camera === 'fps', 'la touche V repasse à la première personne', s.camera);

    // ── grenade lacrymogène : sélection, lancer, projectile, gaz ──
    const slot = setup.inventory.indexOf('grenade_lacrymo') + 1;
    await page.keyboard.press(`Digit${slot}`);
    await step(page, 1.8); // mise en main
    s = await state(page);
    check(s.item === 'grenade_lacrymo', `la touche ${slot} met la grenade lacrymogène en main`, s.item);
    await capture('game-grenade-en-main');
    const before = await page.evaluate(() => ({ n: window.__CRS.ctx.projectiles.list.length, count: window.__CRS.ctx.actions.has(window.__CRS.ctx.player.person(), 'grenade_lacrymo') }));
    const aimBefore = await state(page);
    await page.mouse.down();
    await step(page, 0.7); // charge du lancer
    const charge = await page.evaluate(() => window.__CRS.ctx.player.state.charge);
    await page.mouse.up();
    await step(page, 0.6);
    const thrown = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const me = c.player.person();
      const pr = c.projectiles.list.filter((q) => q.ownerId === me.id);
      return { n: c.projectiles.list.length, mine: pr.map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, z: q.z })), count: c.actions.has(me, 'grenade_lacrymo') };
    });
    check(charge > 0.2, 'le lancer se charge en maintenant le clic', `charge ${charge.toFixed(2)}`);
    check(Math.abs((await state(page)).camYaw - aimBefore.camYaw) < 0.05, 'le regard ne bouge pas pendant le lancer');
    check(thrown.mine.length >= 1 && /lacrymo/.test(thrown.mine[0]?.kind ?? ''), 'un projectile apparaît', JSON.stringify(thrown.mine[0] ?? null));
    check(thrown.count === before.count - 1, 'une grenade a quitté la dotation', `${before.count} → ${thrown.count}`);
    await capture('game-grenade-en-vol');
    let gas = 0;
    let gasAt = null;
    for (let i = 0; i < 12 && gas <= 0.02; i++) {
      await step(page, 1);
      const g = await page.evaluate((id) => {
        const c = window.__CRS.ctx;
        let best = 0;
        let at = null;
        // le gaz est émis par la grenade et ses palets : on cherche le maximum autour de tous les projectiles du joueur
        const me = c.player.person();
        for (const q of c.projectiles.list) {
          if (q.ownerId !== me.id) continue;
          const v = c.hazards.gasAt(q.x, q.z);
          if (v > best) { best = v; at = { x: q.x, z: q.z, kind: q.kind }; }
        }
        return { best, at, id };
      }, thrown.mine[0]?.id ?? 0);
      gas = g.best;
      gasAt = g.at;
    }
    r.gas = gas;
    check(gas > 0.02, 'du gaz lacrymogène se répand au point de chute (ctx.hazards.gasAt > 0)', `concentration ${gas.toFixed(2)} ${gasAt ? `en (${gasAt.x.toFixed(0)}, ${gasAt.z.toFixed(0)})` : ''}`);
    check((await page.evaluate(() => window.__CRS.ctx.law.forceLog.length)) >= 1, 'l’emploi de la force est inscrit au journal');
    // regard vers le point de chute, puis une image : le rendu des effets doit dessiner le nuage
    if (gasAt) {
      await page.evaluate((at) => {
        const c = window.__CRS.ctx;
        const p = c.player.person();
        c.player.state.camYaw = Math.atan2(at.x - p.x, at.z - p.z);
        c.player.state.camPitch = 0;
      }, gasAt);
    }
    await step(page, 0.3);
    await capture('game-gaz');
    const fx = await page.evaluate(() => ({ ...(window.__CRS.ctx.service('render.fx')?.stats ?? {}) }));
    r.fx = fx;
    check((fx.cells ?? 0) + (fx.puffs ?? 0) + (fx.sprites ?? 0) > 0, 'le nuage de gaz est dessiné par le rendu des effets', `cellules ${fx.cells}, bouffées ${fx.puffs}, sprites ${fx.sprites}, ${fx.drawCalls} appel(s) de dessin`);

    // ── carte ──
    await page.keyboard.press('KeyM');
    await frames(page, 4);
    await page.waitForTimeout(600);
    s = await state(page);
    check(s.screen === 'carte', 'la touche M ouvre le plan de Paris', String(s.screen));
    await capture('game-carte');
    await page.keyboard.press('KeyM');
    await frames(page, 3);
    s = await state(page);
    check(s.screen === null && s.phase === 'playing', 'la touche M referme le plan et le jeu reprend', `${s.screen} / ${s.phase}`);
    await page.keyboard.press('Tab');
    await frames(page, 4);
    await page.waitForTimeout(600);
    s = await state(page);
    check(s.screen === 'carte_tactique', 'la touche Tab ouvre la carte de commandement (lecture seule pour un équipier)', String(s.screen));
    await capture('game-carte-tactique');
    await page.keyboard.press('Tab');
    await frames(page, 3);
    s = await state(page);
    check(s.screen === null, 'la touche Tab referme la carte de commandement', String(s.screen));

    // ── pause, paramètres ──
    await page.keyboard.press('Escape');
    await frames(page, 4);
    await page.waitForTimeout(300);
    s = await state(page);
    check(s.screen === 'pause' && s.phase === 'paused', 'la touche Échap met en pause', `${s.screen} / ${s.phase}`);
    const tPaused = s.t;
    await capture('game-pause');
    await page.locator('[data-id="pause-parametres"]').click();
    await frames(page, 4);
    await page.waitForTimeout(300);
    s = await state(page);
    check(s.screen === 'parametres', 'les paramètres s’ouvrent depuis la pause', String(s.screen));
    await capture('game-parametres');
    await page.locator('[data-id="parametres-retour"]').click();
    await frames(page, 3);
    s = await state(page);
    check(s.screen === 'pause', 'retour à la pause', String(s.screen));
    check(s.t === tPaused, 'le temps simulé est figé en pause');
    await page.locator('[data-id="pause-reprendre"]').click();
    await frames(page, 4);
    s = await state(page);
    check(s.phase === 'playing' && s.screen === null, '« Reprendre » relance le jeu', `${s.phase} / ${s.screen}`);

    // ── mesures (vue à la première personne, place de la Concorde) ──
    // Le joueur revient à sa place de départ (groupe, obélisque et fontaine dans le champ), vue à la troisième personne.
    // Temps JavaScript : 16 images complètes (un pas de simulation de 1/30 s + frame() de chaque système) lancées
    // par game.frame(), chronométrées une à une. Après chaque image, gl.finish() attend la fin du tramage logiciel
    // (hors chronomètre) : sans cela les images s'empilent dans le processus graphique, qui finit tué faute de mémoire.
    // Médiane = coût typique ; minimum = coût sans préemption (la machine d'essai est chargée).
    await page.evaluate(() => {
      const c = window.__CRS;
      const s = c.ctx.service('session.setup').summary;
      c.teleport(s.x - Math.sin(s.heading) * 4, s.z - Math.cos(s.heading) * 4);
      c.ctx.player.state.camYaw = s.heading;
      c.ctx.player.state.camPitch = 0;
      c.ctx.player.setCameraMode('tps');
    });
    await step(page, 1);
    await frames(page, 2);
    r.perf = await page.evaluate(() => {
      const c = window.__CRS;
      const ctx = c.ctx;
      const perf = ctx.service('perf');
      const N = 16;
      const gl = ctx.view.renderer.getContext();
      const total = [];
      const sim = [];
      const present = [];
      const per = perf.systems.map(() => ({ update: [], frame: [] }));
      for (let k = 0; k < N + 3; k++) {
        const t = performance.now();
        c.game.frame(1 / 30);
        const ms = performance.now() - t;
        gl.finish();
        if (k < 3) continue; // mise en train
        total.push(ms);
        sim.push(perf.stats.simMs);
        present.push(perf.stats.presentMs);
        perf.systems.forEach((x, i) => {
          per[i].update.push(x.updateMs);
          per[i].frame.push(x.frameMs);
        });
      }
      const med = (a) => { const b = a.slice().sort((p, q) => p - q); return b[b.length >> 1]; };
      const min = (a) => Math.min(...a);
      const max = (a) => Math.max(...a);
      const info = ctx.view.renderer.info;
      const base = ctx.service('render.base').stats;
      const mem = performance.memory ? { usedMB: performance.memory.usedJSHeapSize / 1048576, totalMB: performance.memory.totalJSHeapSize / 1048576 } : null;
      const city = ctx.service('world.view')?.stats?.() ?? null;
      const mon = ctx.service('monuments')?.stats?.() ?? null;
      const ppl = ctx.service('peopleRender')?.stats ?? null;
      const veh = ctx.service('vehiclesRender')?.stats ?? null;
      return {
        drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
        buffer: `${base.width}×${base.height}`,
        frameMs: med(total), frameMinMs: min(total), frameMaxMs: max(total), simMs: med(sim), presentMs: med(present),
        systems: perf.systems.map((x, i) => ({
          id: x.id, update: med(per[i].update), frame: med(per[i].frame), min: min(per[i].update) + min(per[i].frame),
          max: max(per[i].update.map((u, k) => u + per[i].frame[k])), errors: x.errors, disabled: x.disabled,
        })),
        people: ctx.people.list.length, props: ctx.props.list.length, shops: ctx.props.shops.length, vehicles: ctx.vehicles.list.length,
        memory: mem,
        parts: {
          ville: city ? { triangles: city.triangles, drawCalls: city.drawCalls, immeubles: city.buildingTriangles, detail: city.detailTiles, lointaines: city.farTiles } : null,
          monuments: mon ? { triangles: mon.triangles + mon.horizonTriangles, drawCalls: mon.drawCalls + mon.horizonDrawCalls, detailed: mon.detailed, distant: mon.distant } : null,
          personnages: ppl ? { near: ppl.near, mid: ppl.mid, far: ppl.far, drawCalls: ppl.drawCalls } : null,
          vehicules: veh ? { triangles: veh.triangles, drawCalls: veh.drawCalls, near: veh.near, far: veh.far } : null,
        },
      };
    });
    // cadence réelle (tramage logiciel compris), sur quelques images de la boucle normale
    r.perf.realFrameMs = await page.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      let n = 0;
      const f = () => (++n >= 4 ? resolve((performance.now() - t0) / 4) : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }));
    const slow = r.perf.systems.filter((x) => x.update + x.frame > 4);
    console.log(`  rendu : ${r.perf.drawCalls} appels de dessin, ${Math.round(r.perf.triangles / 1000)} k triangles, tampon ${r.perf.buffer}, ${r.perf.geometries} géométries, ${r.perf.textures} textures`);
    console.log(`  JavaScript par image : médiane ${r.perf.frameMs.toFixed(1)} ms, minimum ${r.perf.frameMinMs.toFixed(1)} ms, pire ${r.perf.frameMaxMs.toFixed(1)} ms (simulation ${r.perf.simMs.toFixed(2)}, présentation ${r.perf.presentMs.toFixed(1)}) ; ${r.perf.realFrameMs.toFixed(0)} ms réels par image avec le tramage logiciel`);
    for (const x of r.perf.systems) if (x.update + x.frame > 0.1) console.log(`    ${x.id.padEnd(22)} update ${x.update.toFixed(2)} ms  frame ${x.frame.toFixed(2)} ms  (min ${x.min.toFixed(2)}, max ${x.max.toFixed(1)})${x.update + x.frame > 4 ? '   ← plus de 4 ms' : ''}`);
    for (const [name, part] of Object.entries(r.perf.parts)) if (part) console.log(`    ${name} : ${JSON.stringify(part)}`);
    if (r.perf.memory) console.log(`  mémoire JavaScript : ${r.perf.memory.usedMB.toFixed(0)} Mo utilisés`);
    await capture('game-mesures');

    // ── recommencer : la session repart de zéro, sans fuite (mêmes effectifs, ressources graphiques stables) ──
    const before2 = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const m = c.view.renderer.info.memory;
      return {
        people: c.people.list.filter((q) => q.faction === 'police').length, vehicles: c.vehicles.list.filter((q) => q.faction === 'police').length,
        squads: c.squads.list.filter((q) => q.faction === 'police').length, all: c.people.list.length, geometries: m.geometries, textures: m.textures,
      };
    });
    await page.keyboard.press('Escape');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 120000);
    await page.locator('[data-id="pause-recommencer"]').click();
    await page.locator('[data-id="dialog-confirm"]').click();
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing" && window.__CRS.ctx.clock.now < 5', 300000);
    await frames(page, 3);
    const after2 = await page.evaluate(() => {
      const c = window.__CRS.ctx;
      const m = c.view.renderer.info.memory;
      const p = c.player.person();
      return {
        people: c.people.list.filter((q) => q.faction === 'police').length, vehicles: c.vehicles.list.filter((q) => q.faction === 'police').length,
        squads: c.squads.list.filter((q) => q.faction === 'police').length, all: c.people.list.length, geometries: m.geometries, textures: m.textures,
        player: !!p && p.isPlayer, screen: c.ui.current, projectiles: c.projectiles.list.length, forceLog: c.law.forceLog.length, phase: c.director.phase,
      };
    });
    r.restart = { before: before2, after: after2 };
    check(after2.player && after2.screen === null, '« Recommencer » relance la partie, joueur incarné');
    check(after2.people === before2.people && after2.vehicles === before2.vehicles && after2.squads === before2.squads, 'mêmes effectifs de police après redémarrage (rien ne survit de la partie précédente)', `${after2.people} agents, ${after2.vehicles} véhicule(s), ${after2.squads} unité(s) ; ${before2.all} → ${after2.all} personnes en tout`);
    check(after2.phase === 'rassemblement' && after2.all < before2.all + 20, 'la manifestation repart du rassemblement', `phase « ${after2.phase} »`);
    check(after2.projectiles === 0 && after2.forceLog === 0, 'projectiles et journal de la force remis à zéro');
    check(after2.geometries <= before2.geometries * 1.15 + 20 && after2.textures <= before2.textures + 8, 'pas de fuite de ressources graphiques au redémarrage', `géométries ${before2.geometries} → ${after2.geometries}, textures ${before2.textures} → ${after2.textures}`);

    // ── terminer : compte rendu, puis retour à l'accueil ──
    await step(page, 2);
    await page.keyboard.press('Escape');
    await waitFor(page, 'window.__CRS.ctx.ui.current === "pause"', 120000);
    await page.locator('[data-id="pause-terminer"]').click();
    await page.locator('[data-id="dialog-confirm"]').click();
    await waitFor(page, 'window.__CRS.ctx.session.phase === "debrief"', 120000);
    await frames(page, 3);
    s = await state(page);
    check(s.screen === 'debrief', 'terminer la partie ouvre le compte rendu', String(s.screen));
    await capture('game-compte-rendu');
    await page.locator('[data-id="debrief-accueil"]').click();
    await waitFor(page, 'window.__CRS.ctx.session.phase === "menu"', 120000);
    await frames(page, 3);
    s = await state(page);
    check(s.screen === 'menu_principal', 'retour à la page d’accueil', String(s.screen));
    r.slowSystems = slow.map((x) => x.id);
    check(r.perf.systems.every((x) => !x.disabled && x.errors === 0), 'aucun système en erreur ni désactivé', r.perf.systems.filter((x) => x.disabled || x.errors).map((x) => x.id).join(', '));
  } catch (err) {
    failures.push('exception : ' + (err && err.stack ? err.stack : String(err)));
    console.error(err);
    try { await snap(page, 'game-echec-bureau'); } catch { /* page fermée */ }
  }
  r.errors = errors.slice();
  check(errors.length === 0, 'zéro erreur console sur tout le parcours (ordinateur)', errors.slice(0, 3).join(' | '));
  await browser.close();
}

// ═════════════════════════════════ téléphone ═════════════════════════════════
async function telephone(server) {
  console.log('[game] téléphone 844×390 (tactile)');
  const { browser, page, errors } = await openPage(`${server.url}?quality=${quality}`, { width: 844, height: 390, mobile: true });
  const r = { captures: [] };
  report.telephone = r;
  const capture = async (name) => {
    const file = await snap(page, name);
    r.captures.push(file);
    console.log('  capture : ' + file);
  };
  try {
    await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
    await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
    await capture('game-mobile-accueil');
    const t0 = await launchFromHome(page, { poste: 'lanceur', tap: true });
    await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 300000);
    r.loadMs = Date.now() - t0;
    console.log(`  chargement : ${(r.loadMs / 1000).toFixed(1)} s`);
    await step(page, 0.5);
    await frames(page, 5);
    const touch = await page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden';
      });
      const api = window.__CRS.ctx.service('input.touch');
      return {
        device: window.__CRS.ctx.input.device, layout: api ? api.layout : '', visible: api ? api.visible : false,
        buttons: vis('.crs-touch .ct-c').length, items: vis('.crs-touch .ct-item').length, stick: vis('.crs-touch .ct-stick, .crs-touch .ct-move').length,
      };
    });
    r.touch = touch;
    check(touch.visible && touch.buttons >= 6, 'les commandes tactiles sont visibles', JSON.stringify(touch));
    check(touch.items >= 3, 'la barre d’objets tactile est remplie', `${touch.items} cases`);
    await capture('game-mobile-jeu');

    // déplacement au joystick virtuel : un doigt posé à gauche, poussé vers le haut (à fond = course)
    const cdp = await page.context().newCDPSession(page);
    const start = await state(page);
    const finger = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await finger('touchStart', 130, 280);
    await finger('touchMove', 130, 250);
    await finger('touchMove', 130, 190);
    await step(page, 8);
    await capture('game-mobile-course');
    await finger('touchEnd', 130, 190);
    await step(page, 0.5);
    const end = await state(page);
    const d = Math.hypot(end.x - start.x, end.z - start.z);
    r.travelled = d;
    check(d > 8, 'le joystick virtuel déplace le personnage', `${d.toFixed(1)} m en 8 s`);
    check(end.free && !end.inBuilding, 'le joueur n’est dans aucun obstacle');

    // pause par le bouton tactile, puis reprise
    const pauseBtn = page.locator('.crs-touch [data-b="pause"], .crs-touch [data-button="pause"]').first();
    if (await pauseBtn.count()) await pauseBtn.tap();
    else await page.evaluate(() => window.__CRS.ctx.service('input.script').tap('pause'));
    await frames(page, 5);
    await page.waitForTimeout(300);
    let s = await state(page);
    check(s.screen === 'pause', 'la pause s’ouvre au doigt', String(s.screen));
    await capture('game-mobile-pause');
    await page.locator('[data-id="pause-reprendre"]').tap();
    await frames(page, 4);
    s = await state(page);
    check(s.phase === 'playing', 'reprise au doigt', s.phase);
    r.perf = await page.evaluate(() => {
      const ctx = window.__CRS.ctx;
      const info = ctx.view.renderer.info;
      return { drawCalls: info.render.calls, triangles: info.render.triangles };
    });
  } catch (err) {
    failures.push('exception (téléphone) : ' + (err && err.stack ? err.stack : String(err)));
    console.error(err);
    try { await snap(page, 'game-echec-telephone'); } catch { /* page fermée */ }
  }
  r.errors = errors.slice();
  check(errors.length === 0, 'zéro erreur console sur tout le parcours (téléphone)', errors.slice(0, 3).join(' | '));
  await browser.close();
}

const server = await startServer();
if (only('bureau')) await bureau(server);
if (only('telephone')) await telephone(server);
writeFileSync(path.join(OUT, 'game-report.json'), JSON.stringify(report, null, 2));
console.log(`[game] ${checks} vérifications, ${failures.length} échec(s). Rapport : ${path.join(OUT, 'game-report.json')}`);
for (const f of failures) console.error('  ✗ ' + f);
await finish({ server, errors: [], ok: failures.length === 0, label: 'game' });
