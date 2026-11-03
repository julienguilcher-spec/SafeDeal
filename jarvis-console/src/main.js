// Point d'entrée : séquence d'arrivée, animation du cœur et des agents, boucle principale.
import './styles.css';
import * as THREE from 'three/webgpu';
import { DEBUG, clamp01, lerp, damp, seg, easeInOutQuint, easeOutQuint, easeInOutCubic, easeOutExpo, $, ECOSYSTEMS } from './data.js';
import { renderer, BACKEND, scene, camera, clock, uTime, coreLight } from './engine.js';
import { CORE_POS, core, jarvis, COIL_COUNT, nucleus, coilLitAttr, rings, geodesic, plates, shockwave, shock } from './core.js';
import { agents, agentsById } from './agents.js';
import { LINK_STYLE, rockets, updateRockets, updateBursts, poolAttr, starLayers } from './links.js';
import { OVERVIEW, cam, camApply, flyTo, updateCamera, canvas, pick, post, perf, updatePerf } from './camera.js';
import { hud, el, updateLabels, uiState, positionCommand, renderAll } from './hud.js';
import { handovers, updateHandovers, updateSim, updateTraffic, api } from './sim.js';
let hoverTarget = null;
let firstFrameDone = false;
const fatalBeforeReady = (message) => { if (firstFrameDone) return; const f = $('fallback'); $('fallback-text').textContent = message; f.classList.add('show'); $('boot-veil').classList.add('off'); };
window.addEventListener('error', (e) => fatalBeforeReady(`La console n'a pas pu démarrer : ${(e.error && e.error.message) || e.message || 'erreur inconnue'}.`));
window.addEventListener('unhandledrejection', (e) => fatalBeforeReady(`La console n'a pas pu démarrer : ${(e.reason && e.reason.message) || e.reason || 'erreur inconnue'}.`));

/* ------------------------------------------------------------------ séquence d'arrivée et animation du cœur */
const BOOT = { approachEnd: 2.4, platesStart: 2.4, ringsStart: 2.8, coilsStart: 3.3, igniteStart: 3.9, shockAt: 4.7, reveal: { studio: 5.4, redacteur: 6.6, kcl: 7.2 }, hudAt: 8.2, controlsAt: 9.2 };
let bootDone = false; let shockFired = false; let hudShown = false; let veilOff = false;
function heartbeat(t, period) { const p = (t % period); const a = Math.exp(-Math.pow(p / 0.16, 2)); const b = 0.55 * Math.exp(-Math.pow((p - 0.3) / 0.16, 2)); return a + b; }
const _plateQ = new THREE.Quaternion(), _plateAxis = new THREE.Vector3(1, 0, 0), _tmpV = new THREE.Vector3();
function updateCore(t, dt) {
  const ignite = easeOutQuint(seg(t, BOOT.igniteStart, BOOT.igniteStart + 1.1));
  const settle = 1 + 0.28 * Math.sin(Math.PI * seg(t, BOOT.igniteStart + 0.4, BOOT.igniteStart + 1.9)); // léger pic qui s'apaise
  const listening = damp(jarvis.listening, uiState.commandOpen ? 1 : 0, 4, dt); jarvis.listening = listening;
  const speaking = damp(jarvis.speaking, clock.t < jarvis.speakUntil ? 1 : 0, 5, dt); jarvis.speaking = speaking;
  jarvis.flicker = Math.max(0, jarvis.flicker - dt * 2.2);
  const period = lerp(2.6, 1.15, listening);
  const hb = heartbeat(t, period) * 0.14;
  const base = ignite * settle * (1.0 + hb + jarvis.flicker * 0.25 + speaking * 0.12 * (0.5 + 0.5 * Math.sin(t * 17)));
  jarvis.u.nucleus.value = base * 3.8;
  nucleus.scale.setScalar(lerp(0.06, 1.0, ignite) * (1 + hb * 0.25));
  coreLight.intensity = base * 14; coreLight.position.copy(CORE_POS);
  jarvis.u.coilGain.value = 1.6 + hb * 2.0 + speaking * 0.8;
  // bobines : allumage séquentiel puis onde lente
  for (let i = 0; i < COIL_COUNT; i++) { const lit = seg(t, BOOT.coilsStart + i * 0.05, BOOT.coilsStart + i * 0.05 + 0.3); const wave = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.4 - i * (Math.PI * 2 / COIL_COUNT) * 2), 3); coilLitAttr.setX(i, lit * (0.35 + 0.65 * wave)); }
  coilLitAttr.needsUpdate = true;
  // anneaux : mise en place puis contre-rotations lentes, resserrées à l'écoute
  const ringsIn = easeInOutQuint(seg(t, BOOT.ringsStart, BOOT.ringsStart + 2.1));
  rings.forEach((r, i) => {
    r.pivot.rotation.set(r.def.tilt[0] * ringsIn, r.def.tilt[1] * ringsIn, r.def.tilt[2] * ringsIn);
    r.angle += r.def.spin * (1 + listening * 1.4 + speaking * 0.6) * dt * ringsIn + (1 - ringsIn) * dt * 0.0;
    r.spin.rotation.y = r.angle + (1 - ringsIn) * (i + 1) * 1.3;
    const sc = lerp(1, 0.94, listening); r.pivot.scale.setScalar(sc);
    r.uInlay.value = ignite * (0.7 + hb * 1.5) * (i === 1 ? 1.2 : 0.8);
  });
  geodesic.rotation.y = -t * 0.035; geodesic.rotation.z = Math.sin(t * 0.05) * 0.08;
  // plaques : coque fermée → déploiement lourd, dérive lente, frémissement à la parole
  const plateOpen = seg(t, BOOT.platesStart, BOOT.platesStart + 1.7);
  plates.forEach((p, i) => {
    const o = easeInOutQuint(seg(plateOpen, i * 0.025, 1 - (plates.length - 1 - i) * 0.0 + i * 0.025 * 0 + 0.000001)); const open = easeInOutQuint(clamp01((plateOpen - i * 0.02) / 0.75));
    const jitter = speaking * 0.045 * Math.sin(t * 9 + p.phase) + 0.012 * Math.sin(t * 0.6 + p.phase);
    const dist = p.D + open * 1.6 + jitter;
    p.pivot.position.copy(p.dir).multiplyScalar(dist);
    _plateQ.setFromAxisAngle(_plateAxis, open * 1.2 + jitter * 2.0); p.mesh.quaternion.copy(_plateQ);
    const vanish = 1 - easeInOutCubic(seg(open, 0.72, 1.0)); p.pivot.scale.setScalar(Math.max(0.0001, vanish)); p.pivot.visible = vanish > 0.001;
    void o;
  });
  core.rotation.y = t * 0.02;
  // anneau d'onde
  jarvis.wave = damp(jarvis.wave, Math.max(listening * 0.6, speaking), 6, dt); jarvis.u.wave.value = jarvis.wave * ignite;
  // onde de choc
  if (t >= BOOT.shockAt && !shockFired) { shockFired = true; shock.t = 0; shockwave.visible = true; }
  if (shock.t >= 0) { shock.t += dt / 1.9; if (shock.t >= 1) { shock.t = -1; shockwave.visible = false; jarvis.u.shock.value = 0; } else { const e = easeOutExpo(shock.t); const s = 0.6 + e * 40; shockwave.scale.set(s, s, 1); jarvis.u.shock.value = Math.pow(1 - shock.t, 1.6) * 1.2; } }
}

/* ------------------------------------------------------------------ agents, liens, accent par profondeur */
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _white = new THREE.Color(0.86, 0.9, 0.94);
function updateAgents(t, dt) {
  // constellation la plus proche de la caméra : accent plein ; les autres tombent vers le monochrome
  let nearest = null, nd = Infinity; ECOSYSTEMS.forEach((e) => { const d = e.center.distanceTo(cam.pos); if (d < nd) { nd = d; nearest = e; } });
  ECOSYSTEMS.forEach((e) => {
    const targetAccent = e === nearest ? 1 : 0.32; e.accent = damp(e.accent === undefined ? targetAccent : e.accent, targetAccent, 1.6, dt);
    const targetDim = cam.focusEco && cam.focusEco !== e ? 0.42 : 1; e.dim = damp(e.dim === undefined ? 1 : e.dim, targetDim, 2.2, dt);
    const reveal = easeOutQuint(seg(t, BOOT.reveal[e.id], BOOT.reveal[e.id] + 1.6)); e.reveal = reveal;
  });
  agents.forEach((a) => {
    const d = a.data; const e = a.eco; const reveal = e.reveal; a.u.reveal.value = reveal;
    a.group.visible = reveal > 0.001; a.group.scale.setScalar(lerp(0.55, 1, reveal) * 1.25);
    a.inner.rotation.y = t * a.spin + a.phase; a.inner.position.y = Math.sin(t * 0.5 + a.phase) * 0.04;
    if (a.anim) a.anim(t, dt);
    const working = d.state === 'working' ? 1 : 0, waiting = d.state === 'waiting' ? 1 : 0;
    a.wk = damp(a.wk === undefined ? working : a.wk, working, 3, dt); a.wt = damp(a.wt === undefined ? waiting : a.wt, waiting, 3, dt);
    a.glow = Math.max(0, a.glow - dt * 2.4);
    _c1.copy(_white).lerp(e.color, e.accent); a.u.edgeColor.value.copy(_c1);
    const edgeBase = 0.22 + a.wk * 0.75 + a.glow * 1.3; a.u.edge.value = edgeBase * reveal * e.dim * (0.85 + 0.15 * Math.sin(t * 2.1 + a.phase));
    const statusPulse = working ? 0.7 + 0.3 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 + a.phase), 2) : 1;
    a.u.status.value = (0.5 + a.wk * 2.6 * statusPulse + a.wt * 1.2) * reveal * e.dim;
    _c2.copy(waiting ? new THREE.Color(1.0, 0.68, 0.3) : _c1); a.u.statusColor.value.copy(_c2);
    a.u.progress.value = d.progress || 0; a.u.working.value = a.wk * reveal * e.dim; a.u.waiting.value = a.wt * reveal * e.dim;
    a.progRing.rotation.y = 0; a.waitRing.rotation.z = t * 0.2;
    // liens : tracé à la révélation, lueur selon activité ; au repos rien ne bouge
    const drawT = easeInOutCubic(seg(t, BOOT.reveal[e.id] - 0.2, BOOT.reveal[e.id] + 1.2));
    const setLink = (l, baseK) => { if (!l) return; l.u.draw.value = drawT; l.u.flow.value = a.wk * 0.6; l.u.dim.value = e.dim; l.u.intensity.value = LINK_STYLE[l.kind].base * baseK * (1 + a.wk * 0.9 + a.glow * 0.6); l.u.color.value.copy(_c1); };
    setLink(a.linkMain, 1); setLink(a.linkFaint, 1);
    poolAttr.setXYZW(a.index, _c1.r, _c1.g, _c1.b, (0.07 + a.wk * 0.12 + a.glow * 0.1 + a.wt * 0.04) * reveal * e.dim);
  });
  const nb = jarvis.u.nucleus.value / 3.8; poolAttr.setXYZW(agents.length, 0.75, 0.88, 1.0, 0.06 * nb + jarvis.flicker * 0.04); poolAttr.needsUpdate = true;
}

/* ------------------------------------------------------------------ boucle principale */
const _coreNdc = new THREE.Vector3();
function updatePostUniforms(dt) {
  post.uAspect.value = window.innerWidth / window.innerHeight;
  _coreNdc.copy(CORE_POS).project(camera); const onScreen = _coreNdc.z < 1 && Math.abs(_coreNdc.x) < 1.3 && Math.abs(_coreNdc.y) < 1.3;
  post.uCore.value.set((_coreNdc.x + 1) / 2, (1 - _coreNdc.y) / 2);
  const edgeFade = onScreen ? clamp01(1.4 - Math.max(Math.abs(_coreNdc.x), Math.abs(_coreNdc.y))) : 0;
  const nb = jarvis.u.nucleus.value / 3.8; const distK = clamp01((cam.pos.distanceTo(CORE_POS) - 4) / 10);
  post.uFlare.value = damp(post.uFlare.value, edgeFade * nb * (0.55 + 0.45 * distK), 4, dt);
  post.uGodRays.value = damp(post.uGodRays.value, edgeFade * nb * 0.5, 4, dt);
  // mise au point : sur l'agent ciblé, sinon la cible d'orbite
  const focusDist = cam.focus ? cam.pos.distanceTo(cam.focus.pos) : cam.pos.distanceTo(cam.target);
  post.uFocus.value = damp(post.uFocus.value, focusDist, 3, dt); post.uFocalRange.value = damp(post.uFocalRange.value, cam.focus ? 4.5 : Math.max(10, focusDist * 0.7), 3, dt); post.uBokeh.value = cam.focus ? 1.0 : 0.45;
  post.uBlur.value = damp(post.uBlur.value, Math.min(0.09, cam.speed * 0.0045), 8, dt);
  if (post.bloomNode) post.bloomNode.strength.value = 0.52 + nb * 0.08;
}
let lastNow = performance.now(); let frames = 0;
function tick(nowMs) {
  let dt = (nowMs - lastNow) / 1000; lastNow = nowMs; if (DEBUG.fixedStep) dt = DEBUG.fixedStep; dt = Math.min(dt, 0.1); if (!(dt > 0)) dt = 1 / 60;
  simStep(dt); render();
}
function simStep(dt) {
  clock.t += dt; clock.dt = dt; uTime.value = clock.t; const t = clock.t;
  // caméra d'arrivée
  if (!bootDone) {
    if (t < BOOT.approachEnd) { const k = easeInOutCubic(seg(t, 0, BOOT.approachEnd)); cam.target.set(0, 2.1, 0); cam.dist = lerp(60, 10.5, k); cam.pitch = lerp(0.12, 0.27, k); cam.yaw = lerp(-0.35, -0.05, k); }
    else if (t < BOOT.reveal.studio - 0.2) { const k = seg(t, BOOT.approachEnd, BOOT.reveal.studio - 0.2); cam.dist = lerp(10.5, 9.6, k); cam.yaw = lerp(-0.05, 0.02, k); cam.target.set(0, 2.1, 0); }
    else if (!cam.fly) { cam.target.set(0, 2.1, 0); flyTo(OVERVIEW, 3.6, () => { cam.enabled = true; }); bootDone = true; }
    if (!bootDone) camApply();
  }
  if (t >= BOOT.hudAt && !hudShown) { hudShown = true; hud.classList.add('ready'); }
  if (bootDone) updateCamera(dt);
  updateCore(t, dt); updateSim(dt); updateHandovers(dt); updateTraffic(dt); updateAgents(t, dt); updateRockets(dt); updateBursts(dt);
  starLayers.forEach((s) => { s.rotation.y += s.userData.spin * dt; });
  hoverTarget = DEBUG.forceHover ? { type: 'agent', agent: agentsById[DEBUG.forceHover] } : (cam.enabled && !cam.dragging ? pick() : null); canvas.style.cursor = hoverTarget ? 'pointer' : 'default';
  updatePostUniforms(dt); updatePerf(dt);
  hud.classList.toggle('moving', cam.speed > 2.5);
  updateLabels(hoverTarget); if (uiState.commandOpen) positionCommand();
  if ((frames++ & 15) === 0) el.fps.textContent = DEBUG.fixedStep ? '' : `${Math.round(perf.fps)} ips`;
}
function render() { post.pp.render(); if (!firstFrameDone) { firstFrameDone = true; veilOff = true; $('loader-text').textContent = ''; $('boot-veil').classList.add('off'); window.dispatchEvent(new Event('jarvis-ready')); } }
function onResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', onResize);

/* ------------------------------------------------------------------ démarrage */
renderAll();
camApply();
if (DEBUG.startAt > 0) { const n = Math.ceil(DEBUG.startAt * 30); for (let i = 0; i < n; i++) simStep(DEBUG.startAt / n); }
$('loader-text').textContent = 'Compilation des shaders';
if (!DEBUG.capture) renderer.setAnimationLoop(tick); else render();
window.__jarvisDebug = { hover(id) { DEBUG.forceHover = id; }, advance(seconds, hz = 30) { const n = Math.ceil(seconds * hz); for (let i = 0; i < n; i++) simStep(seconds / n); render(); }, coreScreen() { const v = CORE_POS.clone().project(camera); return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight }; }, state: () => ({ t: clock.t, tier: post.tier, backend: BACKEND, fps: perf.fps, rockets: rockets.length, handovers: handovers.map((l) => ({ draw: l.u.draw.value, t: l.handover && l.handover.t, launched: l.handover && l.handover.launched })), wave: jarvis.wave, cam: { pos: cam.pos.toArray(), target: cam.target.toArray() } }), api, scene, camera, renderer, post, cam };
console.info(`JARVIS console — rendu ${BACKEND}, qualité ${post.tier}`);
