// Banc d'essai du module des entrées : état en direct (axes, boutons, périphérique actif),
// surcouche tactile, réaffectation, et une petite scène en perspective pour juger des sensations.
// Paramètres d'URL : ?layout=pied|vehicule|drone|menu|cache|auto  &force=1 (surcouche forcée)
//                    &clean=1 (panneau masqué)  &items=0 (barre d'objets vide)  &prompt=Texte
// Le test de bout en bout (tests/e2e/input.mjs) pilote la page par window.__inputTest.
import type { Button, InputState } from '@/core/contracts';
import { InputSystem } from '@/input';
import type {
  InputBindingsApi, InputLabelsApi, InputPointerApi, InputScriptApi, InputTouchApi, TouchLayoutMode,
} from '@/input';
import { BUTTONS } from '@/input/buttons';
import { createFakeContext, sampleInventory } from '@/input/dev/fakeContext';

const params = new URLSearchParams(location.search);
const { ctx, controls } = createFakeContext({ storage: window.localStorage, storageKey: 'crs-input-banc' });
if (params.get('items') !== '0') {
  controls.inventory = sampleInventory();
  controls.active = 0;
}
if (params.get('prompt')) controls.prompt = params.get('prompt');

// ───────────────────────────── scène d'essai (canevas 2D) ─────────────────────────────

const gameEl = document.getElementById('game') as HTMLDivElement;
const canvas = document.createElement('canvas');
gameEl.appendChild(canvas);
const g = canvas.getContext('2d')!;
let W = 0;
let H = 0;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = gameEl.clientWidth;
  H = gameEl.clientHeight;
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const cam = { x: 0, z: 0, yaw: 0.6, pitch: -0.05 };
const POSTS: { x: number; z: number; h: number; color: string }[] = [];
for (let ix = -6; ix <= 6; ix++) {
  for (let iz = -6; iz <= 6; iz++) {
    if (ix === 0 && iz === 0) continue;
    const big = ix % 3 === 0 && iz % 3 === 0;
    POSTS.push({ x: ix * 9, z: iz * 9, h: big ? 7 : 2.2, color: big ? '#c9b48a' : (ix + iz) % 2 === 0 ? '#5b7fb8' : '#b85b5b' });
  }
}

function drawScene(): void {
  const f = H * 0.9;                                  // focale en pixels
  const horizon = H / 2 + Math.tan(cam.pitch) * f;
  const sky = g.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  sky.addColorStop(0, '#6f93bd');
  sky.addColorStop(1, '#c9d6e2');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, Math.max(0, horizon));
  const ground = g.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, '#8a8d8c');
  ground.addColorStop(1, '#4e5154');
  g.fillStyle = ground;
  g.fillRect(0, Math.max(0, horizon), W, H);

  // Cap h : avant = (sin h, cos h) ; la droite de la caméra est alors (-cos h, sin h).
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  const rx = -fz;
  const rz = fx;
  const eye = 1.7;
  const order = POSTS.map((p) => {
    const dx = p.x - cam.x;
    const dz = p.z - cam.z;
    return { p, depth: dx * fx + dz * fz, side: dx * rx + dz * rz };
  }).filter((o) => o.depth > 0.6).sort((a, b) => b.depth - a.depth);
  for (const o of order) {
    const sx = W / 2 + (o.side / o.depth) * f;
    const base = horizon + (eye / o.depth) * f;
    const top = horizon - ((o.p.h - eye) / o.depth) * f;
    const w = Math.max(1.5, (0.5 / o.depth) * f);
    if (sx < -w || sx > W + w) continue;
    const fog = Math.min(0.75, o.depth / 90);
    g.fillStyle = o.p.color;
    g.globalAlpha = 1 - fog;
    g.fillRect(sx - w / 2, top, w, base - top);
    g.globalAlpha = 0.25 * (1 - fog);
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(sx, base, w * 1.3, Math.max(1, w * 0.3), 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // réticule
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(W / 2 - 9, H / 2);
  g.lineTo(W / 2 - 3, H / 2);
  g.moveTo(W / 2 + 3, H / 2);
  g.lineTo(W / 2 + 9, H / 2);
  g.moveTo(W / 2, H / 2 - 9);
  g.lineTo(W / 2, H / 2 - 3);
  g.moveTo(W / 2, H / 2 + 3);
  g.lineTo(W / 2, H / 2 + 9);
  g.stroke();
}

// ───────────────────────────── module à l'essai ─────────────────────────────

const sys = new InputSystem();
sys.provide(ctx);
sys.init(ctx);
const input: InputState = ctx.input;
const touch = ctx.require<InputTouchApi>('input.touch');
const labels = ctx.require<InputLabelsApi>('input.labels');
const bindings = ctx.require<InputBindingsApi>('input.bindings');
const script = ctx.require<InputScriptApi>('input.script');
const pointer = ctx.require<InputPointerApi>('input.pointer');

const layoutParam = params.get('layout');
if (layoutParam) touch.setLayout(layoutParam as TouchLayoutMode);
if (params.get('force') === '1') touch.setForced(true);

// Compteurs de fronts vus par un « système de simulation » (dans update) et par un « système de
// présentation » (dans frame) : le test vérifie qu'ils valent exactement 1 par appui.
type Counts = Record<string, number>;
const counts = { simPressed: {} as Counts, simReleased: {} as Counts, framePressed: {} as Counts, frameReleased: {} as Counts };
const sums = { simLookX: 0, simLookY: 0, frameLookX: 0, frameLookY: 0, simWheel: 0, frameWheel: 0 };
const perf = { updateMs: 0, frameMs: 0, samples: 0, maxUpdateMs: 0, maxFrameMs: 0 };
let rumbleCalls = 0;
let stepsPattern: number[] = [1];
let frames = 0;

function consume(pressed: Counts, released: Counts): void {
  for (let i = 0; i < BUTTONS.length; i++) {
    const b = BUTTONS[i]!;
    if (input.pressed(b)) pressed[b] = (pressed[b] ?? 0) + 1;
    if (input.released(b)) released[b] = (released[b] ?? 0) + 1;
  }
}

function simulate(dt: number): void {
  // contrôleur de démonstration : lit les entrées dans update(), comme le fera celui du joueur
  consume(counts.simPressed, counts.simReleased);
  sums.simLookX += input.lookX;
  sums.simLookY += input.lookY;
  sums.simWheel += input.wheel;
  cam.yaw -= input.lookX;                             // regard à droite = cap décroissant
  cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch + input.lookY));
  const speed = input.down('sprint') ? 7.5 : 3.8;
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  cam.x += (fx * input.moveY - fz * input.moveX) * speed * dt;
  cam.z += (fz * input.moveY + fx * input.moveX) * speed * dt;
}

// ───────────────────────────── panneau ─────────────────────────────

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const panel = $('panel');
const panelToggle = $('panel-toggle');
const hint = $('hint');
const coarse = window.matchMedia('(pointer: coarse)').matches;
function showPanel(show: boolean): void {
  panel.classList.toggle('hidden', !show);
}
showPanel(params.get('clean') !== '1' && !coarse);
if (params.get('clean') === '1') {
  panelToggle.classList.add('hidden');
  hint.classList.add('hidden');
}
panelToggle.addEventListener('click', () => showPanel(panel.classList.contains('hidden')));

const buttonChips: HTMLElement[] = [];
for (const b of BUTTONS) {
  const chip = document.createElement('i');
  chip.textContent = b;
  $('buttons').appendChild(chip);
  buttonChips.push(chip);
}
const LABELLED: Button[] = ['primary', 'secondary', 'interact', 'sprint', 'crouch', 'jump', 'item_next', 'radio', 'orders', 'map', 'tactical', 'camera', 'mask', 'siren', 'handbrake', 'pause'];
const labelCells: HTMLElement[] = [];
for (const b of LABELLED) {
  const name = document.createElement('span');
  name.textContent = labels.actionName(b);
  const value = document.createElement('span');
  $('labels').append(name, value);
  labelCells.push(value);
}
const axesCanvas = $('axes') as HTMLCanvasElement;
const ag = axesCanvas.getContext('2d')!;
const DEVICE_NAMES = { kbm: 'clavier / souris', gamepad: 'manette', touch: 'tactile' } as const;
let labelsVersion = -1;
let lastLookX = 0;
let lastLookY = 0;
let panelTimer = 0;

function drawAxes(): void {
  const w = axesCanvas.width;
  const h = axesCanvas.height;
  ag.clearRect(0, 0, w, h);
  const pad = (cx: number, x: number, y: number, title: string): void => {
    const r = 62;
    const cy = h / 2 + 8;
    ag.strokeStyle = '#3a4a68';
    ag.lineWidth = 2;
    ag.beginPath();
    ag.arc(cx, cy, r, 0, Math.PI * 2);
    ag.moveTo(cx - r, cy);
    ag.lineTo(cx + r, cy);
    ag.moveTo(cx, cy - r);
    ag.lineTo(cx, cy + r);
    ag.stroke();
    ag.fillStyle = '#5a9bff';
    ag.beginPath();
    ag.arc(cx + x * r, cy - y * r, 9, 0, Math.PI * 2);
    ag.fill();
    ag.fillStyle = '#8fa0bb';
    ag.font = '20px system-ui, sans-serif';
    ag.textAlign = 'center';
    ag.fillText(title, cx, 22);
  };
  pad(96, input.moveX, input.moveY, 'déplacement');
  // regard : vitesse de rotation ramenée à ±1 pour 6 rad/s
  pad(262, Math.max(-1, Math.min(1, lastLookX * 10)), Math.max(-1, Math.min(1, lastLookY * 10)), 'regard');
  const bar = (x: number, v: number, title: string, color: string): void => {
    ag.strokeStyle = '#3a4a68';
    ag.strokeRect(x, 36, 34, 132);
    ag.fillStyle = color;
    ag.fillRect(x + 2, 36 + 130 * (1 - v), 30, 130 * v);
    ag.fillStyle = '#8fa0bb';
    ag.fillText(title, x + 17, 22);
  };
  bar(380, input.throttle, 'gaz', '#4cc38a');
  bar(446, input.brake, 'frein', '#e5604d');
  bar(512, Math.min(1, Math.abs(input.wheel)), 'mol.', '#d6b34a');
}

function refreshPanel(): void {
  $('device').textContent = DEVICE_NAMES[input.device];
  $('v-move').textContent = `x ${input.moveX.toFixed(2)}   y ${input.moveY.toFixed(2)}`;
  $('v-look').textContent = `x ${lastLookX.toFixed(4)}   y ${lastLookY.toFixed(4)} rad`;
  $('v-trig').textContent = `${input.throttle.toFixed(2)} / ${input.brake.toFixed(2)}`;
  $('v-wheel').textContent = input.wheel.toFixed(2);
  $('v-lock').textContent = input.pointerLocked ? 'oui' : pointer.fallback ? 'non — glisser pour regarder' : 'non';
  $('v-pad').textContent = labels.padName ? `${labels.padName} (${labels.padStyle})` : 'aucune';
  $('v-kbd').textContent = `${labels.keyboardLayout.toUpperCase()} — ${labels.moveLabel('kbm')}`;
  $('v-touch').textContent = touch.visible ? `visible — ${touch.layout}` : `masquée — ${touch.layout}`;
  $('v-cam').textContent = `${(((cam.yaw * 180) / Math.PI) % 360).toFixed(0)} / ${((cam.pitch * 180) / Math.PI).toFixed(0)}`;
  for (let i = 0; i < BUTTONS.length; i++) buttonChips[i]!.classList.toggle('down', input.down(BUTTONS[i]!));
  if (labels.version !== labelsVersion) {
    labelsVersion = labels.version;
    for (let i = 0; i < LABELLED.length; i++) labelCells[i]!.textContent = labels.labelFor(LABELLED[i]!) || '—';
  }
  const last = controls.notices[controls.notices.length - 1];
  $('notice').textContent = last ?? '';
  $('pause').classList.toggle('on', controls.phase === 'paused');
  $('modal-open').classList.toggle('on', controls.modal);
  $('prompt').classList.toggle('on', controls.prompt !== null);
  hint.classList.toggle('hidden', params.get('clean') === '1' || input.pointerLocked || input.device !== 'kbm' || controls.modal);
  hint.textContent = pointer.fallback
    ? `Maintenez un bouton de la souris et glissez pour regarder — ${labels.moveLabel('kbm')} pour avancer`
    : `Cliquez dans la scène pour capturer la souris — ${labels.moveLabel('kbm')} pour avancer, Échap pour libérer`;
  drawAxes();
}

function setModal(open: boolean): void {
  controls.modal = open;
  $('modal').classList.toggle('open', open);
}
$('modal-open').addEventListener('click', () => setModal(!controls.modal));
$('modal-close').addEventListener('click', () => setModal(false));
$('pause').addEventListener('click', () => ctx.session.pause(controls.phase !== 'paused'));
$('prompt').addEventListener('click', () => {
  controls.prompt = controls.prompt === null ? 'Menotter' : null;
});
$('force').addEventListener('click', (e) => {
  const on = !(e.currentTarget as HTMLElement).classList.contains('on');
  (e.currentTarget as HTMLElement).classList.toggle('on', on);
  touch.setForced(on ? true : null);
});
($('layout') as HTMLSelectElement).value = layoutParam ?? 'auto';
$('layout').addEventListener('change', (e) => touch.setLayout((e.currentTarget as HTMLSelectElement).value as TouchLayoutMode));
$('rebind').addEventListener('click', () => {
  controls.notices.push('Appuyez sur la nouvelle touche pour « Interagir » (Échap pour annuler)…');
  bindings.capture('kbm', (code) => {
    if (code === null) {
      controls.notices.push('Réaffectation annulée.');
      return;
    }
    const lost = bindings.set('kbm', 'interact', 0, code) ?? [];
    controls.notices.push(`« Interagir » : ${labels.codeLabel('kbm', code)}` + (lost.length ? ` (retiré à : ${lost.map((a) => labels.actionName(a)).join(', ')})` : ''));
  });
});
$('reset').addEventListener('click', () => {
  bindings.reset();
  controls.notices.push('Touches par défaut rétablies.');
});
$('rumble').addEventListener('click', () => {
  rumbleCalls++;
  input.rumble(0.8, 0.3);
});

// ───────────────────────────── boucle ─────────────────────────────

let last = performance.now();
let manual = false;

/** Une image du « moteur » : N pas de simulation (update) puis la présentation (frame). */
function tick(dtReal: number, steps: number): void {
  const h = steps > 0 ? Math.min(0.05, dtReal / steps) : 0;
  for (let s = 0; s < steps; s++) {
    if (controls.phase !== 'playing') break;          // en pause, le moteur n'appelle plus update()
    const t0 = performance.now();
    sys.update(h);
    const t1 = performance.now();
    perf.updateMs += t1 - t0;
    if (t1 - t0 > perf.maxUpdateMs) perf.maxUpdateMs = t1 - t0;
    simulate(h);
  }
  const t0 = performance.now();
  sys.frame(dtReal);
  const t1 = performance.now();
  perf.frameMs += t1 - t0;
  if (t1 - t0 > perf.maxFrameMs) perf.maxFrameMs = t1 - t0;
  perf.samples++;
  consume(counts.framePressed, counts.frameReleased);
  sums.frameLookX += input.lookX;
  sums.frameLookY += input.lookY;
  sums.frameWheel += input.wheel;
  if (input.lookX !== 0 || input.lookY !== 0) {
    lastLookX = input.lookX;
    lastLookY = input.lookY;
  } else {
    lastLookX *= 0.8;
    lastLookY *= 0.8;
  }
  frames++;
}

function loop(t: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
  last = t;
  if (!manual) tick(dt, stepsPattern[frames % stepsPattern.length]!);
  drawScene();
  panelTimer += dt;
  if (panelTimer >= 0.08 && !panel.classList.contains('hidden')) {
    panelTimer = 0;
    refreshPanel();
  }
}
requestAnimationFrame(loop);

// ───────────────────────────── API pour le test de bout en bout ─────────────────────────────

const api = {
  ctx, controls, sys, input, touch, labels, bindings, script, pointer, cam,
  get frames(): number {
    return frames;
  },
  /** Nombre de pas de simulation par image, de façon cyclique : [1], [3], [0, 0, 1]… */
  setSteps(pattern: number[]): void {
    stepsPattern = pattern.length ? pattern : [1];
  },
  /** Mode manuel : la boucle ne fait plus avancer le module, le test appelle tick() lui-même. */
  setManual(on: boolean): void {
    manual = on;
  },
  tick(steps: number, dt = 1 / 60): void {
    tick(dt, steps);
  },
  resetCounts(): void {
    for (const c of [counts.simPressed, counts.simReleased, counts.framePressed, counts.frameReleased]) for (const k of Object.keys(c)) delete c[k];
    sums.simLookX = sums.simLookY = sums.frameLookX = sums.frameLookY = sums.simWheel = sums.frameWheel = 0;
  },
  resetPerf(): void {
    perf.updateMs = perf.frameMs = perf.samples = perf.maxUpdateMs = perf.maxFrameMs = 0;
  },
  setModal,
  showPanel,
  snapshot() {
    return {
      device: input.device, moveX: input.moveX, moveY: input.moveY, throttle: input.throttle, brake: input.brake,
      pointerLocked: input.pointerLocked, fallback: pointer.fallback,
      down: BUTTONS.filter((b) => input.down(b)),
      counts: JSON.parse(JSON.stringify(counts)) as typeof counts,
      sums: { ...sums },
      layout: touch.layout, mode: touch.mode, visible: touch.visible,
      notices: controls.notices.slice(), frames, yaw: cam.yaw, pitch: cam.pitch, x: cam.x, z: cam.z,
      padName: labels.padName, padStyle: labels.padStyle, keyboardLayout: labels.keyboardLayout,
      perf: { ...perf }, rumbleCalls,
      saved: controls.saved('bindings') ?? null,
    };
  },
  /** Coût moyen d'un update() et d'un frame() du module, en microsecondes (boucle serrée de n appels). */
  bench(n: number) {
    const wasManual = manual;
    manual = true;
    let t0 = performance.now();
    for (let i = 0; i < n; i++) sys.update(1 / 60);
    const updateUs = ((performance.now() - t0) * 1000) / n;
    t0 = performance.now();
    for (let i = 0; i < n; i++) sys.frame(1 / 60);
    const frameUs = ((performance.now() - t0) * 1000) / n;
    t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < n; i++) {
      for (let b = 0; b < BUTTONS.length; b++) if (input.down(BUTTONS[b]!) || input.pressed(BUTTONS[b]!)) hits++;
    }
    const readNs = ((performance.now() - t0) * 1e6) / (n * BUTTONS.length * 2);
    manual = wasManual;
    return { updateUs, frameUs, readNs, hits };
  },
  /** Rectangle écran d'une commande tactile de la disposition courante. */
  rect(key: string) {
    return sys.touch.overlay ? sys.touch.overlay.rectOf(key) : null;
  },
  stickHome() {
    return sys.touch.overlay ? sys.touch.overlay.stickHome() : null;
  },
};
(window as unknown as { __inputTest: typeof api; __ready: boolean }).__inputTest = api;
(window as unknown as { __ready: boolean }).__ready = true;
