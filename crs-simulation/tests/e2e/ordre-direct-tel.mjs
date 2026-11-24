// Ordres directs au TÉLÉPHONE (844 × 390, paysage, au doigt seulement) — §1.6 et §7.1–7.3 de la spécification des
// ordres directs. Commandant, place de la Concorde :
//   G   la rangée de gauche (Radio, pastille « Ordre prêt », « ⟳ À qui ») : ≥ 44 px, dans les 40 % de gauche, sans
//       chevaucher les vrais rectangles du HUD (« Avec moi », « Secours ici », mini-carte), « Action » / « Interagir »,
//       la barre d'objets ni le socle du joystick — à pied, en véhicule et au drone ; tout ce qui se touche au HUD ≥ 44 px ;
//   L   la pastille dit l'ordre prêt de 'command.direct' (forme courte, deux lignes, sans débordement) ;
//   M   toucher le monde (une rue) : elle est désignée sous le doigt, la pastille le dit ;
//   T   toucher la pastille : l'ordre part (un seul pour deux touchers rapprochés) ; « ↶ Annuler » le défait ;
//   W   « ⟳ » : l'unité suivante (« À qui », jamais « Annuler », même juste après un ordre) ; la pastille touchée
//       ensuite : l'ordre part à l'unité choisie, puis le choix revient à l'automatique (§7.3) ;
//   D   un doigt posé sur la pastille qui glisse : le joueur marche, aucun ordre, pas de roue ;
//   R   appui long : la roue s'ouvre, le doigt glisse sur « Avec moi », relâché : l'ordre part, la roue se referme ;
//   I   toucher l'auteur d'un jet de projectile : « Interpeller », la pastille touchée : l'interpellation part (§7.2) ;
//   B   les bords : un doigt posé sur le bord droit de « ⟳ » (à 8 px du bouton « Avec moi » du HUD) reste sur « ⟳ », le
//       haut de la pastille (à 4 px de la mini-carte) reste la pastille — Chrome rapproche sinon le toucher du bouton
//       cliquable voisin.
// Captures ordre-direct-tel-*.png dans tests/e2e/out.
// Usage : node tests/e2e/ordre-direct-tel.mjs
import { startServer, openPage, waitFor, frames, step, makeChecker, snap, fingers, rects, overlap } from './verif-tpm-lib.mjs';

const tag = 'ordre-direct-tel';
const C = makeChecker(tag);
const server = await startServer();
const q = new URLSearchParams({
  autostart: 'paris', nomenu: '1', mode: 'libre', role: 'commandant', variante: 'terrain', place: 'Place de la Concorde', crowd: '300',
  quality: 'bas', seed: '7', time: '12', weather: 'clair',
});
const W = 844, H = 390;
const { browser, page, errors } = await openPage(`${server.url}?${q}`, { width: W, height: H, mobile: true, pointerLock: false });
const F = await fingers(page);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
/**
 * Doigts envoyés d'un seul envoi (sans attendre l'image entre deux) : avec le WebGL logiciel, une image dure 0,4 s et
 * un toucher envoyé en deux temps durerait plus d'une seconde — un appui long, pas un toucher.
 */
const touch = (type, pts) => F.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 12 })) });
const quickTap = (x, y) => Promise.all([touch('touchStart', [[x, y]]), touch('touchEnd', [])]);
/** Pose un doigt et le fait glisser de (dx, dy) en `n` pas, d'un seul envoi ; le doigt reste posé. */
const quickDrag = (x, y, dx, dy, n = 6) => {
  const all = [touch('touchStart', [[x, y]])];
  for (let i = 1; i <= n; i++) all.push(touch('touchMove', [[x + (dx * i) / n, y + (dy * i) / n]]));
  return Promise.all(all);
};
const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => !/ct-off/.test(r.cls)) ?? null;
const sends = () => page.evaluate(() => window.__od.slice());
const direct = () => page.evaluate(() => {
  const d = window.__CRS.ctx.service('command.direct');
  const n = d.ready();
  return { who: d.whoKey(), short: n ? n.short : '', whoShort: n ? n.whoShort : '', rule: n ? n.rule : '', enabled: n ? n.enabled : false, undo: d.undoable(), screen: window.__CRS.ctx.ui.current };
});
const pill = () => page.evaluate(() => {
  const e = [...document.querySelectorAll('.crs-touch .ct-k-orders')].find((x) => x.getBoundingClientRect().width > 0);
  if (!e) return null;
  const t = e.querySelector('.ct-t'), t2 = e.querySelector('.ct-t2');
  return { verb: t.textContent, who: t2 ? t2.textContent : '', dim: e.classList.contains('is-dim'), fits: t.scrollWidth <= t.clientWidth + 1 && (!t2 || t2.scrollWidth <= t2.clientWidth + 1), w: e.getBoundingClientRect().width };
});
/** Écran d'un point du monde (caméra 3D du jeu). */
const screenOf = (x, z, dy = 0) => page.evaluate(([wx, wz, up]) => {
  const ctx = window.__CRS.ctx;
  const cam = ctx.view.camera;
  cam.updateMatrixWorld();
  const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
  const y = ctx.world.heightAt(wx, wz) + up;
  const vx = v[0] * wx + v[4] * y + v[8] * wz + v[12], vy = v[1] * wx + v[5] * y + v[9] * wz + v[13], vz = v[2] * wx + v[6] * y + v[10] * wz + v[14];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12], cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13], cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  const r = ctx.view.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height, front: cw > 0 };
}, [x, z, dy]);

/** La rangée de gauche et ce qu'elle ne doit jamais toucher, dans la disposition affichée. */
async function layoutChecks(label, W = 844, H = 390) {
  const scale = Math.min(1.45, Math.max(0.82, Math.min(W / 844, H / 390)));
  await frames(page, 4);
  const row = [];
  for (const k of ['radio', 'orders', 'order_who']) row.push([k, await ctl(k)]);
  for (const [k, r] of row) {
    C.check(!!r, `${label} : « ${k} » affiché`);
    if (!r) continue;
    C.check(r.w >= 44 && r.h >= 44, `${label} : « ${k} » ≥ 44 px (${r.w}×${r.h})`);
    C.check(r.x + r.w <= W * 0.4 + 0.5 && r.y >= H * 0.3, `${label} : « ${k} » dans la zone du joystick (40 % de gauche)`, JSON.stringify(r));
  }
  const p = row[1][1];
  if (p) C.check(Math.abs(p.w - 128 * scale) <= 1, `${label} : pastille de ${Math.round(128 * scale)} px (${p.w})`);
  const others = [
    ...(await rects(page, '.hud-slot--left .cm-btn, .hud-slot--left .cq-prop')).map((r) => ['HUD ' + (r.id || r.text), r]),
    ...(await rects(page, '.cm-mini-disc')).map((r) => ['mini-carte', r]),
    ...(await rects(page, '.crs-touch .ct-item')).map((r) => ['objet ' + r.text, r]),
  ];
  for (const k of ['primary', 'interact', 'exit', 'quit', 'secondary', 'jump', 'up', 'down', 'zoomin', 'zoomout', 'gas', 'brake', 'fire']) {
    const r = await ctl(k);
    if (r) others.push([k, r]);
  }
  const stick = await page.evaluate(() => {
    const o = window.__CRS.ctx.service('input.touch').overlay;
    const s = o.stickHome();
    const el = document.querySelector('.crs-touch .ct-stick');
    return el && getComputedStyle(el).display !== 'none' ? { x: s.x - s.radius, y: s.y - s.radius, w: 2 * s.radius, h: 2 * s.radius } : null;
  });
  // (en véhicule le socle est une piste : son rectangle réel est celui de l'élément)
  if (stick && !/^véhicule/.test(label)) others.push(['socle du joystick', stick]);
  else for (const r of await rects(page, '.crs-touch .ct-stick, .crs-touch .ct-stick-tip')) if (r.w > 0 && r.h > 0) others.push([/ct-stick-tip/.test(r.cls) ? `libellé « ${r.text} »` : 'piste du volant', r]);
  const bad = [];
  for (const [k, r] of row) {
    if (!r) continue;
    for (const [n, o] of others) if (overlap(r, o) > 0) bad.push(`${k} ↔ ${n}`);
  }
  C.check(bad.length === 0, `${label} : la rangée ne chevauche rien (${others.length} rectangles vérifiés)`, bad.join(', '));
  // tout ce qui se touche au HUD : 44 px au moins
  const small = (await rects(page, '.ui-hud .cm-btn, .ui-hud [data-id="hud-undo"]')).filter((r) => r.w < 44 || r.h < 44);
  C.check(small.length === 0, `${label} : chaque bouton du HUD fait au moins 44 × 44 px`, small.map((r) => `${r.id || r.text} ${r.w}×${r.h}`).join(', '));
}

try {
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
  await step(page, 3);
  await page.evaluate(() => {
    const core = window.__CRS.ctx.service('ui.command');
    const orig = core.issue.bind(core);
    window.__od = [];
    core.issue = (type, squads, geoms, targetId = 0, ...rest) => {
      const r = orig(type, squads, geoms, targetId, ...rest);
      window.__od.push({ type: String(type), ids: squads.map((s) => s.id), ok: r.ok, targetId, t: window.__CRS.ctx.clock.now });
      return r;
    };
  });
  // un premier toucher : le tactile devient le périphérique actif
  await F.tap(560, 120);
  await frames(page, 6);
  const dev = await page.evaluate(() => ({ device: window.__CRS.ctx.input.device, layout: window.__CRS.ctx.service('input.touch').layout, visible: window.__CRS.ctx.service('input.touch').visible }));
  C.check(dev.device === 'touch' && dev.visible && dev.layout === 'pied', 'commandes tactiles à pied', JSON.stringify(dev));

  // ── G : à pied ──
  await layoutChecks('à pied');
  await snap(page, `${tag}-G-pied`);

  // ── L : la pastille dit l'ordre prêt ──
  await frames(page, 4);
  let d = await direct();
  let pl = await pill();
  C.check(!!pl && (d.short === '' ? pl.verb === 'Visez' || pl.verb === 'Ordres' : pl.verb === d.short), `pastille = ordre prêt (« ${pl && pl.verb} » / « ${pl && pl.who} »)`, JSON.stringify(d));
  C.check(!!pl && pl.fits, 'les deux lignes de la pastille tiennent sans déborder');

  // ── M : toucher une rue dans le monde ──
  const road = await page.evaluate(() => {
    const ctx = window.__CRS.ctx;
    const me = ctx.player.person();
    const cam = ctx.view.camera;
    const out = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    // devant la caméra, 25–60 m, sur une rue nommée, en vue directe
    const yaw = ctx.player.state.camYaw;
    for (let r = 25; r <= 60; r += 5) for (let k = -3; k <= 3; k++) {
      const a = yaw + k * 0.12;
      const x = me.x + Math.sin(a) * r, z = me.z + Math.cos(a) * r;
      if (ctx.world.nearestRoad(x, z, out, 8) && out.name.trim() !== '' && ctx.world.buildingHeightAt(out.x, out.z) <= 0) {
        const hit = { hit: false, x: 0, z: 0, t: 1 };
        if (!ctx.world.raycast(me.x, me.z, out.x, out.z, hit) || !hit.hit) return { x: out.x, z: out.z, name: out.name, yaw, cam: [cam.position.x, cam.position.z] };
      }
    }
    return null;
  });
  C.check(!!road, 'une rue nommée devant le joueur', JSON.stringify(road));
  if (road) {
    const sp = await screenOf(road.x, road.z, 0);
    C.check(sp.front && sp.x > W * 0.45 && sp.x < W - 10 && sp.y > 10 && sp.y < H - 10, 'la rue est à l’écran, dans la zone du regard', JSON.stringify(sp));
    await quickTap(sp.x, sp.y);
    await frames(page, 3);
    await step(page, 0.6);
    await frames(page, 3);
    const tap = await page.evaluate(() => {
      const k = window.__CRS.game.systems.find((s) => s.id === 'ui:command').keys;
      const c = k.tap.current();
      return c ? { kind: c.kind, x: c.x, z: c.z } : null;
    });
    const why = tap ? null : await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      const k = window.__CRS.game.systems.find((q) => q.id === 'ui:command').keys;
      const dd = k.tap.designateAtScreen(x, y);
      return { under: e ? `${e.tagName}.${String(e.className).slice(0, 60)} ${e.dataset ? JSON.stringify(e.dataset) : ''}` : null, direct: dd ? { kind: dd.kind, x: dd.x, z: dd.z } : null };
    }, [sp.x, sp.y]);
    C.check(!!tap && Math.hypot(tap.x - road.x, tap.z - road.z) < 6, `toucher la rue : désignée sous le doigt (${road.name})`, JSON.stringify({ tap, road, why }));
    d = await direct();
    pl = await pill();
    C.check(!!pl && pl.verb === d.short && d.short !== '' && pl.who === d.whoShort, `la pastille dit l’ordre de ce point : « ${pl && pl.verb} » / « ${pl && pl.who} »`, JSON.stringify(d));
    await snap(page, `${tag}-M-rue`);
  }

  // ── T : toucher la pastille (deux fois rapprochées : un seul ordre) ──
  let n0 = (await sends()).length;
  let pr = await ctl('orders');
  d = await direct();
  await Promise.all([quickTap(...center(pr)), quickTap(...center(pr))]);
  await frames(page, 4);
  await step(page, 0.3);
  let s = (await sends()).slice(n0);
  C.check(d.enabled ? s.length === 1 && s[0].ok : s.length === 0, `toucher la pastille : ${d.enabled ? 'l’ordre part, une seule fois pour deux touchers' : 'ligne grise, rien ne part'} (${s.length})`, JSON.stringify({ s, d }));
  // ⟳ juste après l'ordre : toujours « À qui »
  const whoLabel = await page.evaluate(() => [...document.querySelectorAll('.crs-touch .ct-k-order_who')].find((x) => x.getBoundingClientRect().width > 0)?.textContent ?? '');
  C.check(/À qui/.test(whoLabel), `« ⟳ » juste après l’ordre : « ${whoLabel} »`);
  if (s.length === 1) {
    await frames(page, 4);
    const undo = (await rects(page, '[data-id="hud-undo"]'))[0];
    C.check(!!undo && undo.h >= 44, '« ↶ Annuler » à toucher dans la pastille d’état (≥ 44 px)', JSON.stringify(undo));
    if (undo) {
      await quickTap(...center(undo));
      await frames(page, 4);
      await step(page, 0.2);
      d = await direct();
      C.check(d.undo === null, '« ↶ Annuler » défait l’ordre', JSON.stringify(d.undo));
    }
  }
  await step(page, 0.8);

  // ── W : « ⟳ » change d'unité ──
  d = await direct();
  const before = d.who;
  const w = await ctl('order_who');
  await quickTap(...center(w));
  await frames(page, 4);
  await step(page, 0.3);
  await frames(page, 6);
  const after = await direct();
  C.check(after.who !== before, `« ⟳ » : unité suivante (${before} → ${after.who})`);
  pl = await pill();
  C.check(!!pl && pl.who === after.whoShort, `la pastille nomme l’unité choisie (« ${pl && pl.who} »)`);
  await snap(page, `${tag}-W-qui`);
  // §7.3 : la pastille touchée après « ⟳ » — l'ordre part à l'unité choisie, et le choix ne vaut que pour cet ordre
  if (after.enabled && /^u\d+$/.test(after.who)) {
    n0 = (await sends()).length;
    pr = await ctl('orders');
    await quickTap(...center(pr));
    await frames(page, 4);
    await step(page, 0.3);
    s = (await sends()).slice(n0);
    const chosen = Number(after.who.slice(1));
    C.check(s.length === 1 && s[0].ok && s[0].ids.length === 1 && s[0].ids[0] === chosen, `« ⟳ » puis la pastille : l’ordre part à l’unité choisie (${after.whoShort})`, JSON.stringify(s));
    d = await direct();
    C.check(d.who === 'auto', 'le choix « À qui » ne vaut que pour un ordre', d.who);
    await step(page, 0.8);
  } else {
    C.note(`« ⟳ » puis la pastille : non joué (ligne grise ou choix « ${after.who} »)`);
  }

  // ── B : les bords de la rangée, à quelques pixels des boutons du HUD ──
  {
    const wr = await ctl('order_who');
    const b0 = await direct();
    n0 = (await sends()).length;
    await quickTap(wr.x + wr.w - 3, wr.y + wr.h / 2);
    await frames(page, 4);
    await step(page, 0.3);
    await frames(page, 4);
    const b1 = await direct();
    s = (await sends()).slice(n0);
    C.check(b1.who !== b0.who && s.length === 0 && b1.screen === null, `bord droit de « ⟳ » (3 px du bord, « Avec moi » à 8 px) : l’unité change, aucun ordre (${b0.who} → ${b1.who})`, JSON.stringify(s));
    // retour au choix automatique (le cycle du commandant finit par y revenir)
    for (let i = 0; i < 12 && (await direct()).who !== 'auto'; i++) {
      await quickTap(wr.x + wr.w / 2, wr.y + wr.h / 2);
      await frames(page, 3);
      await step(page, 0.2);
    }
    await step(page, 0.8);
    const pr2 = await ctl('orders');
    const b2 = await direct();
    n0 = (await sends()).length;
    await quickTap(pr2.x + pr2.w / 2, pr2.y + 3);
    await frames(page, 4);
    await step(page, 0.3);
    s = (await sends()).slice(n0);
    const b3 = await direct();
    C.check(b3.screen === null && (b2.enabled ? s.length === 1 && s[0].ok : s.length === 0), `haut de la pastille (3 px du bord, la mini-carte à 4 px) : ${b2.enabled ? 'l’ordre prêt part' : 'ligne grise, rien ne part'}, la carte ne s’ouvre pas`, JSON.stringify({ s, screen: b3.screen, b2 }));
    await step(page, 0.8);
  }

  // ── D : glisser depuis la pastille : on marche, aucun ordre ──
  n0 = (await sends()).length;
  pr = await ctl('orders');
  const [px, py] = center(pr);
  const p0 = await page.evaluate(() => { const p = window.__CRS.ctx.player.person(); return { x: p.x, z: p.z }; });
  await quickDrag(px, py, 0, -54);
  await frames(page, 2);
  const mv = await page.evaluate(() => window.__CRS.ctx.input.state ? window.__CRS.ctx.input.state.moveY : window.__CRS.ctx.input.moveY);
  await step(page, 1.2);
  await frames(page, 2);
  const p1 = await page.evaluate(() => { const p = window.__CRS.ctx.player.person(); return { x: p.x, z: p.z }; });
  await touch('touchEnd', []);
  await frames(page, 3);
  await step(page, 0.3);
  s = (await sends()).slice(n0);
  d = await direct();
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  C.check(moved > 0.5, `glisser depuis la pastille : le joueur marche (${moved.toFixed(2)} m, moveY ${mv})`);
  C.check(s.length === 0 && d.screen === null, 'glisser depuis la pastille : aucun ordre, pas de roue', JSON.stringify({ s, screen: d.screen }));

  // ── R : appui long → la roue, glisser sur « Avec moi », relâcher ──
  await step(page, 0.8);
  n0 = (await sends()).length;
  pr = await ctl('orders');
  await F.down(5, ...center(pr));
  await page.waitForTimeout(700);
  await frames(page, 3);
  d = await direct();
  C.check(d.screen === 'roue_ordres', 'appui long sur la pastille : la roue d’ordres s’ouvre', JSON.stringify(d.screen));
  const wheel = await page.evaluate(() => {
    const svg = document.querySelector('.cw-svg');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const wedges = [...svg.querySelectorAll('.cw-wedge')];
    const hot = wedges.findIndex((x) => x.classList.contains('is-hot'));
    const labels = [...svg.querySelectorAll('.cw-label')].map((x) => x.textContent);
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, k: r.width / 320, n: wedges.length, hot, labels };
  });
  const autre = await page.evaluate(() => { const n = window.__CRS.ctx.service('command.direct').ready(); return n && n.autre ? n.autre.verb : ''; });
  C.check(!!wheel, 'la roue est affichée', JSON.stringify(wheel));
  if (wheel) {
    if (autre !== '') C.check(wheel.hot >= 0, `la ligne « autre » (${autre}) est surlignée à l’ouverture`, JSON.stringify(wheel));
    await snap(page, `${tag}-R-roue`);
    // « Avec moi » : le secteur du haut (indice 0)
    const tx = wheel.cx, ty = wheel.cy - 105 * wheel.k;
    for (let i = 1; i <= 6; i++) await F.move(5, center(pr)[0] + (tx - center(pr)[0]) * i / 6, center(pr)[1] + (ty - center(pr)[1]) * i / 6);
    await frames(page, 3);
    const hot = await page.evaluate(() => [...document.querySelectorAll('.cw-wedge')].findIndex((x) => x.classList.contains('is-hot')));
    C.check(hot === 0, `le doigt sur « ${wheel.labels[0]} » : surligné (${hot})`);
    await F.up(5);
    await frames(page, 4);
    await step(page, 0.3);
    await frames(page, 2);
    s = (await sends()).slice(n0);
    d = await direct();
    C.check(d.screen === null, 'relâché : la roue se referme', JSON.stringify(d.screen));
    C.check(s.length >= 1 && s.every((o) => o.ok) && s.some((o) => /suivre|avec_moi/.test(o.type)), 'relâché sur « Avec moi » : ils reviennent avec le joueur', JSON.stringify(s));
  } else {
    await F.up(5);
  }
  await step(page, 1);

  // ── I : toucher l'auteur d'un jet de projectile, puis la pastille (§7.2) ──
  const thrower = await page.evaluate(() => {
    const c = window.__CRS.ctx;
    const me = c.player.person();
    const hit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, id: 0 };
    const list = c.people.list
      .filter((p) => p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0 && p.injury !== 'dead')
      .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.z - me.z) }))
      .filter((q) => q.d >= 18 && q.d <= 100)
      .sort((a, b) => a.d - b.d);
    for (const q of list) {
      hit.hit = false;
      if (c.world.raycast(me.x, me.z, q.p.x, q.p.z, hit) && hit.hit) continue;
      const off = c.law.recordOffense(q.p, 'jet_projectile', q.p.x, q.p.z, 3);
      off.witnessed = true;
      if (!c.law.canArrest(q.p)) continue;
      return { id: q.p.id, dist: q.d, yaw: Math.atan2(q.p.x - me.x, q.p.z - me.z) };
    }
    return null;
  });
  C.check(!!thrower, 'mise en place : un manifestant en vue directe a lancé un projectile (fait constaté)', JSON.stringify(thrower));
  if (thrower) {
    // le regard tourné à peu près vers lui (mise en place) : il est à l'écran, hors du centre, dans la zone du regard
    let at = null;
    for (const off of [0.22, -0.22, 0.32, -0.32, 0.12]) {
      await page.evaluate(([yaw]) => {
        const c = window.__CRS.ctx;
        c.player.state.camYaw = yaw;
        c.player.state.camPitch = 0;
        const me = c.player.person();
        if (me) me.aimYaw = yaw;
      }, [thrower.yaw + off]);
      await step(page, 0.3);
      await frames(page, 3);
      const sp = await page.evaluate(([id]) => {
        const c = window.__CRS.ctx;
        const p = c.people.get(id);
        const cam = c.view.camera;
        cam.updateMatrixWorld();
        const v = cam.matrixWorldInverse.elements, m = cam.projectionMatrix.elements;
        const y = c.world.heightAt(p.x, p.z) + 1.2;
        const vx = v[0] * p.x + v[4] * y + v[8] * p.z + v[12], vy = v[1] * p.x + v[5] * y + v[9] * p.z + v[13], vz = v[2] * p.x + v[6] * y + v[10] * p.z + v[14];
        const cx = m[0] * vx + m[4] * vy + m[8] * vz + m[12], cy = m[1] * vx + m[5] * vy + m[9] * vz + m[13], cw = m[3] * vx + m[7] * vy + m[11] * vz + m[15];
        const r = c.view.renderer.domElement.getBoundingClientRect();
        const x = r.left + (cx / cw * 0.5 + 0.5) * r.width, yy = r.top + (-cy / cw * 0.5 + 0.5) * r.height;
        const e = cw > 0 ? document.elementFromPoint(x, yy) : null;
        return { x, y: yy, look: !!(e && e.closest('[data-ct="look"]')) };
      }, [thrower.id]);
      if (sp.look) { at = sp; break; }
    }
    C.check(!!at, 'le lanceur est à l’écran, sous un doigt possible (zone du regard)', JSON.stringify(at));
    if (at) {
      await quickTap(at.x, at.y);
      await frames(page, 3);
      await step(page, 0.6);
      await frames(page, 3);
      const tapped = await page.evaluate(() => {
        const k = window.__CRS.game.systems.find((q) => q.id === 'ui:command').keys;
        const c = k.tap.current();
        return c ? { kind: c.kind, person: c.person ? { id: c.person.id, kind: c.person.kind } : null } : null;
      });
      const whyI = tapped ? null : await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        const k = window.__CRS.game.systems.find((q) => q.id === 'ui:command').keys;
        const dd = k.tap.designateAtScreen(x, y);
        const t = window.__CRS.ctx.service('input.touch');
        return {
          under: e ? `${e.tagName}.${String(e.className).slice(0, 60)} ${e.dataset ? JSON.stringify(e.dataset) : ''}` : null,
          direct: dd ? { kind: dd.kind, person: dd.person ? dd.person.id : 0 } : null, device: window.__CRS.ctx.input.device, visible: t.visible, layout: t.layout,
          screen: window.__CRS.ctx.ui.current,
        };
      }, [at.x, at.y]);
      C.check(!!tapped && !!tapped.person && tapped.person.id === thrower.id && tapped.person.kind === 'offender', 'toucher le lanceur : il est désigné', JSON.stringify({ tapped, thrower, at, whyI }));
      d = await direct();
      pl = await pill();
      C.check(d.rule === 'c' && !!pl && pl.verb === 'Interpeller' && pl.who === d.whoShort && pl.fits, `la pastille : « ${pl && pl.verb} » / « ${pl && pl.who} »`, JSON.stringify(d));
      await snap(page, `${tag}-I-lanceur`);
      n0 = (await sends()).length;
      pr = await ctl('orders');
      await quickTap(...center(pr));
      await frames(page, 4);
      await step(page, 0.3);
      s = (await sends()).slice(n0);
      C.check(d.enabled ? s.length === 1 && s[0].ok && s[0].type === 'interpeller' && s[0].targetId === thrower.id : s.length === 0,
        `toucher la pastille : ${d.enabled ? 'l’interpellation du lanceur part' : 'ligne grise, rien ne part'}`, JSON.stringify({ s, d }));
    }
  }
  await step(page, 1);

  // ── G : en véhicule et au drone (disposition imposée) ──
  for (const [layout, label] of [['vehicule', 'véhicule'], ['drone', 'drone']]) {
    await page.evaluate((l) => window.__CRS.ctx.service('input.touch').setLayout(l), layout);
    await frames(page, 8);
    await step(page, 0.3);
    await frames(page, 6);
    await layoutChecks(label);
    await snap(page, `${tag}-G-${layout}`);
  }
  await page.evaluate(() => window.__CRS.ctx.service('input.touch').setLayout('auto'));
  await frames(page, 4);

  // ── G : petit téléphone (667 × 375 : échelle 0,82) — toujours 44 px, la pastille tient encore ses deux lignes ──
  await page.setViewportSize({ width: 667, height: 375 });
  await frames(page, 8);
  await step(page, 0.6);
  await frames(page, 6);
  await layoutChecks('à pied, 667 × 375', 667, 375);
  pl = await pill();
  C.check(!!pl && pl.fits, `petit téléphone : les deux lignes de la pastille tiennent (« ${pl && pl.verb} » / « ${pl && pl.who} »)`);
  await snap(page, `${tag}-G-petit`);
} catch (e) {
  C.check(false, 'scénario interrompu', e && e.stack ? e.stack : String(e));
} finally {
  C.check(errors.length === 0, 'aucune erreur dans la page', errors.slice(0, 5).join(' | '));
  C.done();
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  process.exit(C.failures.length === 0 ? 0 : 1);
}
