// Outillage du testeur indépendant (préfixe verif-). N'écrit rien dans le code du jeu.
import path from 'node:path';
import { OUT } from './lib.mjs';
export { startServer, waitFor, OUT } from './lib.mjs';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { chromium } = require_('playwright');

/**
 * Ouvre la page du jeu. Par défaut la capture de la souris est REFUSÉE (comme dans une iframe sans permission) :
 * sous Chromium headless, une souris capturée emballe le navigateur (images rares, mémoire qui enfle — constaté aussi
 * sur une page vide, voir verif-diag-lock-vide.mjs). Le jeu passe alors dans son mode de repli : le clic agit, glisser regarde.
 */
export async function openPage(url, opts = {}) {
  const { width = 1280, height = 720, lock = false } = opts;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (!lock) await page.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('capture refusée (essai)', 'NotAllowedError')); }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack ? e.stack : String(e))));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { browser, page, errors };
}

export const frames = (page, n = 3) => page.evaluate((count) => new Promise((resolve) => {
  let k = 0;
  const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
export const step = (page, seconds) => page.evaluate((s) => window.__CRS.step(s), seconds);
export const state = (page) => page.evaluate(() => {
  const c = window.__CRS;
  const ctx = c.ctx;
  const p = ctx.player.person();
  const st = ctx.player.state;
  return {
    phase: ctx.session.phase, screen: ctx.ui.current, modal: ctx.ui.modal, camera: st.cameraMode, camYaw: st.camYaw, camPitch: st.camPitch,
    x: p ? p.x : NaN, y: p ? p.y : NaN, z: p ? p.z : NaN, heading: p ? p.heading : NaN, active: p ? p.active : -2,
    item: p && p.active >= 0 && p.inventory[p.active] ? p.inventory[p.active].id : '',
    free: p ? ctx.world.isFree(p.x, p.z, 0.05) : false,
    bh: p ? ctx.world.buildingHeightAt(p.x, p.z) : 0,
    ground: p ? ctx.world.heightAt(p.x, p.z) : 0,
    surface: p && ctx.world.surfaceAt ? ctx.world.surfaceAt(p.x, p.z) : '',
    stamina: p ? p.stamina : NaN, health: p ? p.health : NaN, stance: p ? p.stance : '', vehicleId: p ? p.vehicleId : 0,
    speed: p ? Math.hypot(p.vx, p.vz) : 0, vy: p ? p.vy : 0,
    people: ctx.people.list.length, projectiles: ctx.projectiles.list.length, t: ctx.clock.now,
  };
});
export async function snap(page, name) {
  await frames(page, 2);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('  capture : ' + file);
  return file;
}
export const log = (...a) => console.log(...a);
export const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));

/** Installe window.__V : aides de mesure exécutées dans la page (boucles de pas sans aller-retour). */
export const install = (page) => page.evaluate(() => {
  const C = window.__CRS;
  const ctx = C.ctx;
  const V = {};
  const P = () => ctx.player.person();
  V.info = () => {
    const p = P();
    const st = ctx.player.state;
    return {
      x: p.x, y: p.y, z: p.z, ground: ctx.world.heightAt(p.x, p.z), surface: ctx.world.surfaceAt(p.x, p.z), bh: ctx.world.buildingHeightAt(p.x, p.z),
      free: ctx.world.isFree(p.x, p.z, 0.05), stamina: p.stamina, posture: p.posture, speed: Math.hypot(p.vx, p.vz), heading: p.heading,
      camYaw: st.camYaw, camPitch: st.camPitch, camera: st.cameraMode, t: ctx.clock.now, vehicleId: p.vehicleId, alt: p.alt, upper: p.upper,
      active: p.active, item: p.active >= 0 && p.inventory[p.active] ? p.inventory[p.active].id : '', health: p.health, gas: p.gas,
      sector: ctx.world.sectorName(p.x, p.z), phase: ctx.session.phase, screen: ctx.ui.current,
    };
  };
  /** Avance de `seconds` par pas de 1/30 s en relevant la trajectoire ; s'arrête tôt si `stop(p)` rend vrai. */
  V.run = (seconds, opts = {}) => {
    const p = P();
    const n = Math.max(1, Math.round(seconds * 30));
    const h = seconds / n;
    let dist = 0;
    let px = p.x, pz = p.z;
    const x0 = p.x, z0 = p.z, t0 = ctx.clock.now;
    let inBuilding = 0, inWater = 0, notFree = 0, maxLift = 0, maxSpeed = 0, minStamina = p.stamina;
    const surfaces = {};
    const samples = [];
    let firstBad = null;
    for (let i = 0; i < n; i++) {
      if (opts.yaw !== undefined) ctx.player.state.camYaw = opts.yaw;
      C.game.step(h);
      const d = Math.hypot(p.x - px, p.z - pz);
      dist += d;
      px = p.x; pz = p.z;
      const bh = ctx.world.buildingHeightAt(p.x, p.z);
      const s = ctx.world.surfaceAt(p.x, p.z);
      surfaces[s] = (surfaces[s] || 0) + 1;
      const g = ctx.world.heightAt(p.x, p.z);
      if (bh > 0) { inBuilding++; if (!firstBad) firstBad = { why: 'batiment', x: p.x, z: p.z, bh, t: ctx.clock.now }; }
      if (s === 'water') { inWater++; if (!firstBad) firstBad = { why: 'eau', x: p.x, z: p.z, y: p.y, g, t: ctx.clock.now }; }
      if (!ctx.world.isFree(p.x, p.z, 0.05)) notFree++;
      maxLift = Math.max(maxLift, p.y - g);
      const sp = Math.hypot(p.vx, p.vz);
      maxSpeed = Math.max(maxSpeed, sp);
      minStamina = Math.min(minStamina, p.stamina);
      if (opts.every && i % opts.every === 0) samples.push({ t: +(ctx.clock.now - t0).toFixed(2), x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), g: +g.toFixed(2), sp: +sp.toFixed(2), st: +p.stamina.toFixed(1), s, bh: +bh.toFixed(1), po: p.posture });
      if (opts.stopWater && s === 'water' && i > 30) break;
    }
    return {
      dist, net: Math.hypot(p.x - x0, p.z - z0), dt: ctx.clock.now - t0, inBuilding, inWater, notFree, maxLift, maxSpeed, minStamina, surfaces, firstBad,
      end: { x: p.x, y: p.y, z: p.z, g: ctx.world.heightAt(p.x, p.z), s: ctx.world.surfaceAt(p.x, p.z), stamina: p.stamina, speed: Math.hypot(p.vx, p.vz) }, samples,
    };
  };
  /** Rayon monde : première rencontre du décor statique. */
  V.ray = (ax, az, bx, bz) => {
    const hit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
    ctx.world.raycast(ax, az, bx, bz, hit);
    return hit.hit ? { ...hit, d: hit.t * Math.hypot(bx - ax, bz - az) } : null;
  };
  /** Mur de bâtiment le plus proche (rayons en étoile). */
  V.nearestWall = (range = 250, kind = 'building', minH = 0) => {
    const p = P();
    let best = null;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const h = V.ray(p.x, p.z, p.x + Math.sin(a) * range, p.z + Math.cos(a) * range);
      if (h && h.kind === kind && h.height >= minH && (!best || h.d < best.d)) best = { ...h, yaw: a };
    }
    return best;
  };
  V.tp = async (x, z) => {
    C.teleport(x, z);
    try { await Promise.race([ctx.world.whenLoaded(x, z, 300), new Promise((r) => setTimeout(r, 60000))]); } catch (e) { /* ignore */ }
    const view = ctx.service('world.view');
    let guard = 0;
    while (view && view.pending() > 0 && guard++ < 400) { view.flush(200); await new Promise((r) => setTimeout(r, 0)); }
    C.step(0.2);
    return { pending: view ? view.pending() : -1, loaded: ctx.world.isLoaded(x, z), info: V.info() };
  };
  V.cam = () => {
    const c = ctx.view.camera;
    const g = ctx.world.heightAt(c.position.x, c.position.z);
    const bh = ctx.world.buildingHeightAt(c.position.x, c.position.z);
    const p = P();
    return { x: c.position.x, y: c.position.y, z: c.position.z, ground: g, bh, insideBuilding: bh > 0 && c.position.y < g + bh, distToPlayer: Math.hypot(c.position.x - p.x, c.position.z - p.z), near: c.near, far: c.far, fov: c.fov };
  };
  V.trees = (range = 80) => {
    const p = P();
    const data = ctx.service('world.data');
    const out = [];
    const ts = ctx.world.tileSize;
    const tx0 = Math.floor(p.x / ts), tz0 = Math.floor(p.z / ts);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const tile = data.tile(tx0 + dx, tz0 + dz);
      if (!tile || !tile.trees) continue;
      const tr = tile.trees;
      for (let i = 0; i < tr.count; i++) {
        // coordonnées de tuile : locales ou monde ? on essaie les deux
        let x = tr.x[i], z = tr.z[i];
        if (Math.abs(x) <= ts && Math.abs(z) <= ts && (tx0 + dx !== 0 || tz0 + dz !== 0)) { /* peut-être local */ }
        out.push({ x, z, h: tr.height[i], r: tr.crownRadius[i], tx: tx0 + dx, tz: tz0 + dz });
      }
    }
    return out;
  };
  V.errors = () => C.summary().systems.filter((s) => s.errors > 0 || s.disabled).map((s) => `${s.id}:${s.errors}${s.disabled ? ' (désactivé)' : ''}`);
  window.__V = V;
  return true;
});

import { execSync } from 'node:child_process';
/** Mémoire résidente (Mo) des processus Chromium descendants de ce script : { renderer, gpu, total }. */
export function rss() {
  try {
    const rows = execSync('ps -eo pid,ppid,rss,args', { encoding: 'utf8' }).split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((r) => r.length > 3).map((r) => ({ pid: +r[0], ppid: +r[1], rss: +r[2], args: r.slice(3).join(' ') }));
    const mine = new Set([process.pid]);
    let grew = true;
    while (grew) { grew = false; for (const r of rows) if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } }
    let renderer = 0, gpu = 0, total = 0;
    for (const r of rows) if (mine.has(r.pid) && /chrome/.test(r.args)) { total += r.rss; if (/--type=renderer/.test(r.args)) renderer += r.rss; if (/--type=gpu-process/.test(r.args)) gpu += r.rss; }
    return { renderer: Math.round(renderer / 1024), gpu: Math.round(gpu / 1024), total: Math.round(total / 1024) };
  } catch { return null; }
}
/** Ressources côté page : tas JS, géométries, textures, tuiles. */
export const pageMem = (page) => page.evaluate(() => {
  const c = window.__CRS.ctx; const m = c.view ? c.view.renderer.info.memory : { geometries: 0, textures: 0 }; const pm = performance.memory;
  const wv = c.service('world.view'); const st = wv ? wv.stats() : null;
  return { heapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null, geometries: m.geometries, textures: m.textures, detailTiles: st ? st.detailTiles : null, farTiles: st ? st.farTiles : null, tileGpuMB: st ? Math.round(st.tileGpuBytes / 1048576) : null, sharedGpuMB: st ? Math.round(st.sharedGpuBytes / 1048576) : null, people: c.people.list.length, t: Math.round(c.clock.now) };
});
