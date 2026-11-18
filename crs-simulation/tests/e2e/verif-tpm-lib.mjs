// Outillage du testeur indépendant « téléphone, manette, performances » (préfixe verif-tpm).
// N'écrit rien dans le code du jeu : scripts et captures seulement.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { startServer, openPage, waitFor, OUT, ROOT, ouvrirEditeur } from './lib.mjs';
export { startServer, openPage, waitFor, OUT, ROOT, ouvrirEditeur };

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
    posture: p ? p.posture : '', upper: p ? p.upper : '', alt: p ? p.alt : false, gasProtection: p ? p.gasProtection : 0,
    look: p ? JSON.stringify(p.look) : '',
    free: p ? ctx.world.isFree(p.x, p.z, 0.05) : false, inBuilding: p ? ctx.world.buildingHeightAt(p.x, p.z) > 0 : false,
    speed: p ? Math.hypot(p.vx, p.vz) : 0, people: ctx.people.list.length, projectiles: ctx.projectiles.list.length,
    t: ctx.clock.now, device: ctx.input.device, charge: st.charge, control: st.controlEnabled,
  };
});
export async function snap(page, name) {
  try { await frames(page, 2); } catch { /* page occupée */ }
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('  capture : ' + file);
  return file;
}
export const R = (v, d = 2) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v);
export const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));

/** Compteur de vérifications : ok / échec / note. */
export function makeChecker(label) {
  const failures = [];
  const notes = [];
  let checks = 0;
  return {
    failures, notes,
    get checks() { return checks; },
    check(ok, msg, detail = '') {
      checks++;
      const line = msg + (detail ? ` — ${detail}` : '');
      if (ok) console.log('  ✓ ' + line);
      else { failures.push(line); console.log('  ✗ ' + line); }
      return ok;
    },
    note(msg) { notes.push(msg); console.log('  · ' + msg); },
    done(report) {
      if (report) writeFileSync(path.join(OUT, `${label}-report.json`), JSON.stringify(report, null, 2));
      console.log(`[${label}] ${checks} vérifications, ${failures.length} échec(s)`);
      for (const f of failures) console.log('  ✗ ' + f);
    },
  };
}

/** Doigts simulés par CDP (Input.dispatchTouchEvent) : chaque appel envoie la liste complète des doigts posés. */
export async function fingers(page) {
  const cdp = await page.context().newCDPSession(page);
  const active = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...active.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  return {
    cdp,
    async down(id, x, y) { active.set(id, { x, y }); await send('touchStart'); },
    async move(id, x, y) { active.set(id, { x, y }); await send('touchMove'); },
    async up(id) { active.delete(id); await send('touchEnd'); },
    /** Glisser progressif d'un doigt de (x0,y0) à (x1,y1). */
    async drag(id, x0, y0, x1, y1, n = 6, hold = false) {
      active.set(id, { x: x0, y: y0 }); await send('touchStart');
      for (let i = 1; i <= n; i++) { active.set(id, { x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n }); await send('touchMove'); }
      if (!hold) { active.delete(id); await send('touchEnd'); }
    },
    /** Toucher annulé par le système : tous les doigts sont retirés d'un coup. */
    async cancel() { active.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); },
    async tap(x, y, id = 9) { active.set(id, { x, y }); await send('touchStart'); active.delete(id); await send('touchEnd'); },
  };
}

/** Manette simulée : remplace navigator.getGamepads dans la page. */
export async function installPad(page) {
  await page.evaluate(() => {
    const pad = {
      id: 'Manette d\'essai (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: { type: 'dual-rumble', playEffect: () => Promise.resolve('complete'), reset: () => Promise.resolve('complete') },
    };
    window.__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => { pad.timestamp = performance.now(); return [pad, null, null, null]; }, configurable: true });
    const ev = new Event('gamepadconnected');
    ev.gamepad = pad;
    window.dispatchEvent(ev);
  });
}
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const padButton = (page, index, value) => page.evaluate(([b, v]) => { window.__pad.buttons[b] = { pressed: v > 0.5, touched: v > 0, value: v }; }, [index, value]);
export const padAxes = (page, axes) => page.evaluate((a) => { for (let i = 0; i < a.length; i++) if (a[i] !== null) window.__pad.axes[i] = a[i]; }, axes);

/** Rectangles visibles d'un ensemble de sélecteurs (dans la page). */
export const rects = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  const b = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return {
    id: e.getAttribute('data-id') || '', cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 80), tag: e.tagName.toLowerCase(),
    text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
    visible: b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.02,
  };
}).filter((r) => r.visible), selector);
export const overlap = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1 && h > 1 ? w * h : 0;
};
