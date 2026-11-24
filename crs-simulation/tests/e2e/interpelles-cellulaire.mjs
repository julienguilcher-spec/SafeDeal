// Interpellés à l'écran (plan ordres-directs §5.2, §5.3, paquet P15), dans le vrai jeu, à 1280×800 puis à 844×390 :
// un CRS interpelle lui-même un lanceur de projectile loin de ses collègues (aucun binôme à 60 m), à moins de 100 m d'un
// fourgon cellulaire. Vérifié dans le DOM et par window.__CRS (les captures ne sont qu'une trace) :
//  - la ligne d'aide « Interpellé. E : … » est sous l'invite au plus 0,5 s après la palpation ;
//  - la carte « Ma mission » dit en tête « VOTRE INTERPELLÉ » — « Emmenez l’interpellé au fourgon cellulaire n » et la
//    distance (« 85 m ») ; le repère de la carte est sur le fourgon ;
//  - au-dessus des fourgons, l'étiquette « Fourgon cellulaire n — pour les interpellés » ;
//  - à côté du fourgon, « Remettre … » : l'interpellé est à bord ; l'étiquette dit ensuite « CELLULAIRE n · 1/8 ».
// Usage : node tests/e2e/interpelles-cellulaire.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';

const KEEP = process.env.CAPTURES_DIR || '';
const server = await startServer();
let ok = true;
let browser = null;
const errors = [];

/** Dans la page : outils du scénario (interagir, avancer le temps, lire le DOM). */
const TOOLS = () => {
  const C = window.__CRS;
  const ctx = C.ctx;
  const me = () => ctx.player.person();
  const press = () => {
    const opts = [];
    ctx.interactions.options(me(), opts);
    const top = opts[0];
    if (!top) return null;
    const copy = { verb: top.verb, label: top.label };
    if (!ctx.interactions.start(me(), top)) return null;
    const cur = ctx.interactions.current(me());
    if (cur) C.step(cur.opt.duration + 0.2);
    return copy;
  };
  const vans = () => ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'equipage' && s.vehicleId !== 0)
    .map((s) => ({ s, v: ctx.vehicles.get(s.vehicleId) })).filter((q) => q.v && q.v.kind === 'fourgon_cellulaire');
  const text = (q) => {
    const e = document.querySelector(q);
    return e && e.getBoundingClientRect().height > 0 ? e.innerText.replace(/\s+/g, ' ').trim() : '';
  };
  const marks = (kind) => [...document.querySelectorAll(`.hud-marker[data-kind="${kind}"]`)].filter((e) => !e.hidden)
    .map((e) => e.querySelector('.hud-marker__label').textContent.replace(/\s+/g, ' ').trim());
  return { C, ctx, me, press, vans, text, marks };
};

async function run(width, height) {
  const tag = `${width}x${height}`;
  const opened = await openPage(`${server.url}?autostart=paris&quality=bas&seed=5&mode=libre&role=crs&rank=gardien&crowd=150`, { width, height, pointerLock: false });
  browser = opened.browser;
  const page = opened.page;
  opened.errors.forEach((e) => errors.push(e));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e}`));
  await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 400000);
  await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
  await page.evaluate(() => window.__CRS.step(3));
  await page.evaluate(`window.__P15 = (${TOOLS.toString()})()`);

  // un point de chaussée à 70–95 m d'un fourgon cellulaire, sans policier à pied à 65 m
  const spot = await page.evaluate(() => {
    const { ctx, vans } = window.__P15;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' };
    const cop = (x, z) => Math.min(...ctx.people.list.filter((p) => p.faction === 'police' && !p.isPlayer && p.vehicleId === 0 && !p.dormant).map((p) => Math.hypot(p.x - x, p.z - z)));
    // (marge : le jeu tourne pendant le scénario, les binômes bougent — un binôme à 60 m le ferait « Confier »)
    for (const margin of [95, 85, 75]) {
      for (const { v, s } of vans()) {
        for (let a = 0; a < 36; a++) {
          for (const d of [80, 90, 72]) {
            const x = v.x + Math.sin((a * Math.PI) / 18) * d, z = v.z + Math.cos((a * Math.PI) / 18) * d;
            if (!ctx.world.nearestRoad(x, z, road, 15) || !ctx.world.isFree(road.x, road.z, 1.5)) continue;
            const dv = Math.min(...vans().map((q) => Math.hypot(road.x - q.v.x, road.z - q.v.z)));
            if (dv > 68 && dv < 96 && cop(road.x, road.z) > margin) return { x: road.x, z: road.z, h: road.heading, van: s.name, vanId: v.id, squadId: s.id, d: dv, margin };
          }
        }
      }
    }
    return null;
  });
  console.log(`[${tag}] point : ${JSON.stringify(spot)}`);
  if (!spot) throw new Error('aucun point isolé à 70–95 m d’un fourgon');

  // interpeller, menotter, palper
  const arrest = await page.evaluate((sp) => {
    const { C, ctx, me, press } = window.__P15;
    C.teleport(sp.x, sp.z);
    const p = me();
    p.heading = sp.h;
    p.aimYaw = sp.h;
    const t = ctx.people.spawn({ kind: 'manifestant', x: p.x + Math.sin(p.heading) * 1.2, z: p.z + Math.cos(p.heading) * 1.2, name: 'Christian Lopez' });
    ctx.law.recordOffense(t, 'jet_projectile', t.x, t.z, 2).witnessed = true;
    window.__P15.target = t;
    const verbs = [];
    for (let i = 0; i < 8 && t.custody !== 'held'; i++) {
      t.x = p.x + Math.sin(p.heading) * 1.2;
      t.z = p.z + Math.cos(p.heading) * 1.2;
      ctx.people.rebuildIndex();
      const r = press();
      verbs.push(r ? r.verb : '—');
      if (t.custody !== 'held') C.step(2.1);
    }
    verbs.push((press() || {}).verb, (press() || {}).verb);
    return { verbs, custody: t.custody };
  }, spot);
  console.log(`[${tag}] gestes : ${arrest.verbs.join(', ')} → ${arrest.custody}`);
  if (arrest.custody !== 'cuffed') throw new Error('interpellation ratée');
  // 0,5 s après la palpation : la ligne d'aide, la carte, les étiquettes
  const after = await page.evaluate(() => {
    const { C, ctx, me, text, marks } = window.__P15;
    C.step(0.5);
    const b = ctx.service('session.mission');
    return {
      hint: text('.hud-prompt__hint'), cap: text('.hud-mis__head .hud-cap'), order: text('.hud-mis__order'), dist: text('.hud-mis__dist'),
      l1: text('.hud-mis__l1'), source: b.instruction.source, x: b.instruction.x, z: b.instruction.z, cellulaire: marks('cellulaire'),
      way: ctx.service('law.custody').bestWay(me().id),
    };
  });
  console.log(`[${tag}] après la palpation : ${JSON.stringify(after)}`);
  // le fourgon où l'emmener : le plus proche (celui que nomme la ligne d'aide)
  const dropName = after.way ? after.way.name : '';
  const dropId = after.way ? after.way.vehicleId : 0;
  const n = dropName.replace(/^CELLULAIRE /, '');
  const compact = height < 500;
  const check = (cond, what) => { if (!cond) { ok = false; console.error(`  ✗ [${tag}] ${what}`); } else console.log(`  ✓ [${tag}] ${what}`); };
  check(after.way && after.way.kind === 'emmener' && /^CELLULAIRE \d$/.test(dropName), `issue « Emmener » vers un fourgon cellulaire : ${dropName}`);
  check(new RegExp(`^Interpellé\\. E\\s?: l’emmener au fourgon cellulaire ${n} \\(\\d+\\s?m, flèche\\)$`).test(after.hint), `ligne d'aide ≤ 0,5 s : « ${after.hint} »`);
  if (compact) {
    check(new RegExp(`^Emmenez l’interpellé au fourgon cellulaire ${n} · \\d+\\s?m`).test(after.l1), `carte (téléphone) : « ${after.l1} »`);
  } else {
    check(after.cap === 'VOTRE INTERPELLÉ', `titre de la carte : « ${after.cap} »`);
    check(after.order === `Emmenez l’interpellé au fourgon cellulaire ${n}`, `consigne : « ${after.order} »`);
    check(/^\d+\s?m$/.test(after.dist), `distance : « ${after.dist} »`);
  }
  const van = await page.evaluate((id) => { const v = window.__CRS.ctx.vehicles.get(id); return v ? { x: v.x, z: v.z } : { x: NaN, z: NaN }; }, dropId);
  check(after.x !== undefined && Math.hypot(after.x - van.x, after.z - van.z) < 3, 'repère de la carte sur le fourgon');
  // (la présentation « — pour les interpellés » a été montrée au début de la partie, quand il est passé près d'eux)
  check(after.cellulaire.some((l) => l === `Fourgon cellulaire ${n} — pour les interpellés` || l === `${dropName} · 0/8`), `étiquette du fourgon : ${JSON.stringify(after.cellulaire)}`);
  console.log(`[${tag}] capture : ${await shot(page, `interpelles-cellulaire-${tag}-emmener`)}`);

  // à côté du fourgon : Remettre ; puis l'étiquette donne sa charge
  const remise = await page.evaluate((id) => {
    const { C, ctx, me, press } = window.__P15;
    const v = ctx.vehicles.get(id);
    const t = window.__P15.target;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let x = v.x + fz * 7, z = v.z - fx * 7;
    for (const [lat, lon] of [[7, 0], [-7, 0], [0, -9], [7, -4], [-7, -4]]) {
      const qx = v.x + fz * lat + fx * lon, qz = v.z - fx * lat + fz * lon;
      if (ctx.world.isFree(qx, qz, 0.6) && ctx.world.isFree(qx + fx * 1.2, qz + fz * 1.2, 0.6)) { x = qx; z = qz; break; }
    }
    C.teleport(x, z);
    const p = me();
    p.heading = v.heading;
    t.x = p.x + Math.sin(p.heading) * 1.2;
    t.z = p.z + Math.cos(p.heading) * 1.2;
    ctx.people.rebuildIndex();
    C.step(0.6);
    const before = ctx.service('session.mission').instruction.title;
    const r = press();
    C.step(1);
    return { before, verb: r && r.verb, custody: t.custody, inVan: t.vehicleId === id };
  }, dropId);
  console.log(`[${tag}] remise : ${JSON.stringify(remise)}`);
  check(remise.before === `Remettez l’interpellé au fourgon cellulaire ${n}`, `à côté du fourgon : « ${remise.before} »`);
  check(remise.verb === 'remettre' && remise.inVan, 'l’interpellé est à bord du fourgon');
  const label = await page.evaluate(() => { window.__CRS.step(17); return window.__P15.marks('cellulaire'); });
  check(label.includes(`${dropName} · 1/8`), `étiquette après la remise : ${JSON.stringify(label)}`);
  const file = await shot(page, `interpelles-cellulaire-${tag}-remis`);
  console.log(`[${tag}] capture : ${file}`);
  if (KEEP) {
    mkdirSync(KEEP, { recursive: true });
    for (const f of [`interpelles-cellulaire-${tag}-emmener.png`, `interpelles-cellulaire-${tag}-remis.png`]) copyFileSync(path.join(path.dirname(file), f), path.join(KEEP, f));
  }
  await browser.close();
  browser = null;
}

try {
  await run(1280, 800);
  await run(844, 390);
} catch (err) {
  ok = false;
  console.error(err);
}
await finish({ browser, server, errors, ok, label: 'interpelles-cellulaire' });
