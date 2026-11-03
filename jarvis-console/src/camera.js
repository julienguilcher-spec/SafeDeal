// Caméra (voyage, jamais de bascule), sélection, post-traitement et échelle de qualité.
import * as THREE from 'three/webgpu';
import { Fn, uniform, float, vec2, vec3, vec4, screenUV, smoothstep, sin, dot, fract, hash, exp, luminance, convertToTexture, perspectiveDepthToViewZ, select, pass, mrt, output, emissive, metalness, roughness, normalView, directionToColor, colorToDirection, blendColor, sample } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import { PARAMS, DEBUG, clamp01, lerp, damp, easeInOutQuint, ECO } from './data.js';
import { renderer, scene, camera, clock, uTime } from './engine.js';
import { $ } from './data.js';
import { reflection, CORE_POS } from './core.js';
import { agents, agentsById } from './agents.js';
import { showAgentDetail, setFocusLabel, openCommand, closeCommand } from './hud.js';

/* ------------------------------------------------------------------ caméra : voyage, jamais de bascule */
const OVERVIEW = { target: new THREE.Vector3(1.4, 1.4, -4.0), dist: 26.5, yaw: 0.1, pitch: 0.3 };
const cam = {
  target: OVERVIEW.target.clone(), dist: 60, yaw: 0, pitch: 0.12,
  yawV: 0, pitchV: 0, dollyV: 0, dragging: false, lastX: 0, lastY: 0, moved: 0,
  fly: null, speed: 0, pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), enabled: false, focus: null, focusEco: null,
};
function camApply() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  cam.pos.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + sp * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  if (cam.pos.y < 0.35) cam.pos.y = 0.35;
  camera.position.copy(cam.pos); camera.lookAt(cam.target); camera.updateMatrixWorld();
}
function flyTo({ target, dist, yaw, pitch }, duration = 2.0, onDone) {
  const from = { target: cam.target.clone(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch };
  let y = yaw !== undefined ? yaw : cam.yaw; while (y - from.yaw > Math.PI) y -= Math.PI * 2; while (y - from.yaw < -Math.PI) y += Math.PI * 2;
  cam.fly = { from, to: { target: target.clone(), dist, yaw: y, pitch: pitch !== undefined ? pitch : cam.pitch }, t: 0, duration, onDone };
  cam.yawV = cam.pitchV = cam.dollyV = 0;
}
function updateCamera(dt) {
  cam.prevPos.copy(cam.pos);
  if (cam.fly) {
    const f = cam.fly; f.t += dt / f.duration; const k = easeInOutQuint(clamp01(f.t));
    cam.target.lerpVectors(f.from.target, f.to.target, k); cam.dist = lerp(f.from.dist, f.to.dist, k); cam.yaw = lerp(f.from.yaw, f.to.yaw, k); cam.pitch = lerp(f.from.pitch, f.to.pitch, k);
    if (f.t >= 1) { cam.fly = null; if (f.onDone) f.onDone(); }
  } else if (cam.enabled) {
    cam.yaw += cam.yawV * dt; cam.pitch = Math.min(1.25, Math.max(-0.12, cam.pitch + cam.pitchV * dt));
    const k = Math.exp(-dt * 5.5); cam.yawV *= k; cam.pitchV *= k;
    if (Math.abs(cam.dollyV) > 1e-4) { // vol avant/arrière le long du regard : la cible avance avec la caméra
      const fwd = new THREE.Vector3().subVectors(cam.target, cam.pos).normalize(); const step = cam.dollyV * dt;
      cam.target.addScaledVector(fwd, step); if (cam.target.y < 0.6) cam.target.y = 0.6; if (cam.target.length() > 90) cam.target.multiplyScalar(90 / cam.target.length());
      cam.dollyV *= Math.exp(-dt * 3.2);
    }
  }
  camApply();
  const sp = cam.prevPos.distanceTo(cam.pos) / Math.max(dt, 1e-3); cam.speed = damp(cam.speed, sp, 6, dt);
}
function focusAgent(id, duration = 2.2) {
  const a = agentsById[id]; if (!a) return;
  cam.focus = a; cam.focusEco = a.eco; closeCommand();
  const dir = new THREE.Vector3().subVectors(cam.pos, a.pos); let yaw = Math.atan2(dir.x, dir.z); if (!isFinite(yaw)) yaw = 0;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  flyTo({ target: a.pos.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(right, 0.7), dist: 4.3, yaw, pitch: 0.1 }, duration);
  showAgentDetail(a); setFocusLabel(a);
}
function focusEcosystem(id, duration = 2.4) {
  const eco = ECO[id]; if (!eco) return; cam.focus = null; cam.focusEco = eco; closeCommand(); setFocusLabel(null);
  const dir = new THREE.Vector3().subVectors(cam.pos, eco.center); let yaw = Math.atan2(dir.x, dir.z);
  const toCore = Math.atan2(CORE_POS.x - eco.center.x, CORE_POS.z - eco.center.z);
  yaw = toCore + Math.PI + (Math.sign(yaw - toCore - Math.PI) || 1) * 0.7;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  flyTo({ target: eco.center.clone().add(new THREE.Vector3(0, 0.3, 0)).addScaledVector(right, eco.focusDist * 0.19), dist: eco.focusDist, yaw, pitch: 0.2 }, duration);
}
function goOverview(duration = 2.4) { cam.focus = null; cam.focusEco = null; setFocusLabel(null); flyTo(OVERVIEW, duration); }

/* entrées */
const canvas = renderer.domElement; const pointer = new THREE.Vector2(-10, -10);
canvas.addEventListener('pointerdown', (e) => { if (!cam.enabled) return; cam.dragging = true; cam.moved = 0; cam.lastX = e.clientX; cam.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (!cam.dragging) return; const dx = e.clientX - cam.lastX, dy = e.clientY - cam.lastY; cam.lastX = e.clientX; cam.lastY = e.clientY; cam.moved += Math.abs(dx) + Math.abs(dy);
  if (cam.fly) cam.fly = null;
  cam.yawV = -dx * 0.16; cam.pitchV = dy * 0.11;
});
const endDrag = (e) => { if (!cam.dragging) return; cam.dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} if (cam.moved < 5) onClick(); };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { if (!cam.enabled) return; e.preventDefault(); if (cam.fly) cam.fly = null; const d = Math.sign(e.deltaY) * Math.min(1.6, Math.abs(e.deltaY) / 60); cam.dollyV = Math.max(-26, Math.min(26, cam.dollyV - d * 5.2)); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target === $('command-input')) { if (e.key === 'Escape') closeCommand(); return; }
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (!cam.enabled) return;
  if (e.key === '1') focusEcosystem('studio'); else if (e.key === '2') focusEcosystem('kcl'); else if (e.key === '3') focusEcosystem('redacteur');
  else if (e.key === 'Escape' || e.key === '0') goOverview(); else if (e.key.toLowerCase() === 'j') { goOverview(); openCommand(); }
});

/* sélection : sphères englobantes */
const raycaster = new THREE.Raycaster(); const _ray = new THREE.Ray(); const _hit = new THREE.Vector3();
function pick() {
  raycaster.setFromCamera(pointer, camera); _ray.copy(raycaster.ray); let best = null, bestD = Infinity;
  const test = (center, r, obj) => { const d = _ray.distanceToPoint(center); if (d < r) { const along = center.distanceTo(_ray.origin); if (along < bestD) { bestD = along; best = obj; } } };
  test(CORE_POS, 1.9, { type: 'core' });
  agents.forEach((a) => { if (a.u.reveal.value > 0.5) test(a.pos, 0.85, { type: 'agent', agent: a }); });
  return best;
}
function onClick() {
  const h = pick(); if (!h) return;
  if (h.type === 'core') { goOverview(2.2); openCommand(); return; }
  const a = h.agent;
  if (cam.focus === a) { focusEcosystem(a.eco.id); return; }
  if (cam.focusEco !== a.eco && cam.focus === null && cam.dist > 14) { focusEcosystem(a.eco.id); return; }
  focusAgent(a.def.id);
}

/* ------------------------------------------------------------------ post-traitement */
const post = { tier: 3, pp: null, uFocus: uniform(26), uFocalRange: uniform(16), uBokeh: uniform(1.0), uBlur: uniform(0), uCA: uniform(0.0022), uGrain: uniform(0.028), uGodRays: uniform(0.55), uFlare: uniform(0), uCore: uniform(new THREE.Vector2(0.5, 0.5)), uAspect: uniform(16 / 9), uVignette: uniform(0.55), bloomStrength: uniform(0.75) };
const DOF_TAPS = (() => { const arr = []; const n = 12; for (let i = 0; i < n; i++) { const r = Math.sqrt((i + 0.5) / n); const a = i * 2.39996; arr.push([Math.cos(a) * r, Math.sin(a) * r]); } return arr; })();
function buildPost(tier) {
  post.tier = tier;
  const scenePass = pass(scene, camera); post.scenePass = scenePass;
  const mrtDef = { output, emissive };
  if (tier >= 3) { mrtDef.normal = directionToColor(normalView); mrtDef.metalrough = vec2(metalness, roughness); }
  scenePass.setMRT(mrt(mrtDef));
  const colorN = scenePass.getTextureNode('output'); const emisN = scenePass.getTextureNode('emissive'); const depthN = scenePass.getTextureNode('depth');
  let base = colorN;
  if (tier >= 3) {
    const nT = scenePass.getTexture('normal'); nT.type = THREE.UnsignedByteType; const mrT = scenePass.getTexture('metalrough'); mrT.type = THREE.UnsignedByteType;
    const normalN = scenePass.getTextureNode('normal'); const mrN = scenePass.getTextureNode('metalrough');
    const sceneNormal = sample((uvN) => colorToDirection(normalN.sample(uvN)));
    const ssrN = ssr(colorN, depthN, sceneNormal, mrN.r, mrN.g, camera); ssrN.resolutionScale = 0.4; ssrN.maxDistance.value = 0.5; ssrN.opacity.value = 0.5; ssrN.thickness.value = 0.02; ssrN.quality.value = 0.3; ssrN.blurQuality.value = 1;
    base = blendColor(colorN, ssrN);
  }
  const bloomN = bloom(emisN, 0.55, 0.28, 0.62); post.bloomNode = bloomN;
  let comp = base.add(bloomN);
  if (tier >= 2) { const rays = radialBlur(emisN, { center: post.uCore, count: 16, decay: 0.9, weight: 0.5, exposure: 0.9 }); comp = comp.add(rays.mul(post.uGodRays)); }
  if (tier >= 1) {
    // profondeur de champ physique (cercle de confusion, bokeh disque pondéré par la luminance)
    const compTex = convertToTexture(comp);
    const nearF = float(camera.near), farF = float(camera.far);
    const viewZAt = (uvN) => perspectiveDepthToViewZ(depthN.sample(uvN).r, nearF, farF);
    const dofFn = Fn(() => {
      const uvN = screenUV; const vz = viewZAt(uvN).negate();
      const coc0 = smoothstep(0.0, post.uFocalRange, vz.sub(post.uFocus).abs()).mul(post.uBokeh).mul(smoothstep(140.0, 70.0, vz)).toVar(); // le fond étoilé reste fin
      const radius = coc0.mul(0.016).toVar();
      const acc = compTex.sample(uvN).rgb.toVar(); const wsum = float(1).toVar();
      const texel = vec2(float(1).div(post.uAspect), 1.0);
      /* Une seule lecture par tap : la pondération par profondeur coûtait une lecture de plus
         par échantillon, pour un gain invisible sur un fond noir. */
      for (const [tx, ty] of DOF_TAPS) {
        const suv = uvN.add(vec2(tx, ty).mul(radius).mul(texel));
        const c = compTex.sample(suv).rgb;
        const w = luminance(c).mul(0.9).add(0.35);
        acc.addAssign(c.mul(w)); wsum.addAssign(w);
      }
      return vec4(acc.div(wsum), 1.0);
    });
    comp = dofFn();
  }
  // objectif : flou de vitesse, aberration chromatique, flare retenu sur le cœur, grain, vignette
  const lensTex = convertToTexture(comp);
  const lensFn = Fn(() => {
    const uvN = screenUV; const dir = uvN.sub(0.5); const rr = dir.length();
    const ca = dir.mul(post.uCA).mul(rr.mul(rr).mul(3).add(0.35));
    const acc = vec3(0).toVar(); const N = 3; const blurCenter = post.uCore.mul(0.3).add(0.35);
    for (let i = 0; i < N; i++) {
      const off = uvN.sub(blurCenter).mul(post.uBlur).mul(i / (N - 1));
      acc.addAssign(vec3(lensTex.sample(uvN.sub(off).sub(ca)).r, lensTex.sample(uvN.sub(off)).g, lensTex.sample(uvN.sub(off).add(ca)).b));
    }
    let col = acc.div(N);
    // flare : halo doux, trait anamorphique, trois fantômes sur l'axe optique
    const aspect = vec2(post.uAspect, 1.0); const toCore = uvN.sub(post.uCore).mul(aspect); const dC = toCore.length();
    const halo = exp(dC.mul(-9.0)).mul(0.22);
    const streak = exp(toCore.y.abs().mul(-220)).mul(exp(toCore.x.abs().mul(-7.5))).mul(0.22);
    const ghostAt = (s, r, tint) => { const gp = post.uCore.add(vec2(0.5).sub(post.uCore).mul(s)); const d = uvN.sub(gp).mul(aspect).length(); return smoothstep(r, r.mul(0.55), d).mul(smoothstep(r.mul(0.4), r.mul(0.6), d).mul(0.6).add(0.4)).mul(tint); };
    const ghosts = ghostAt(float(0.55), float(0.045), vec3(0.6, 0.9, 1.0).mul(0.05)).add(ghostAt(float(1.25), float(0.09), vec3(0.7, 0.7, 1.0).mul(0.035))).add(ghostAt(float(1.7), float(0.028), vec3(0.9, 0.95, 1.0).mul(0.06)));
    col = col.add(vec3(0.75, 0.9, 1.0).mul(halo.add(streak)).add(ghosts).mul(post.uFlare));
    const vig = smoothstep(1.35, 0.3, dir.mul(vec2(post.uAspect.mul(0.8), 1.0)).length().mul(1.15)).mul(post.uVignette).add(float(1).sub(post.uVignette));
    const px = uvN.mul(vec2(1920.0, 1080.0)).floor().add(fract(uTime.mul(7.31)).mul(1000.0));
    const g = fract(sin(dot(px, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(post.uGrain);
    return vec4(col.mul(vig).add(g), 1.0);
  });
  if (!post.pp) post.pp = new THREE.PostProcessing(renderer);
  post.pp.outputNode = PARAMS.get('raw') === '1' ? colorN : PARAMS.get('raw') === '2' ? comp : lensFn(); post.pp.needsUpdate = true;
  reflection.reflector.resolutionScale = tier >= 2 ? 0.6 : 0.4;
}
/* Palier de départ : le palier 3 (réflexions écran) ne tient que sur une carte dédiée.
   Sur un GPU intégré, partir au palier 2 évite une reconstruction coûteuse dès les premières secondes. */
function detectTier() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile || cores <= 4 || mem <= 4) return 1;
  let dedicated = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    dedicated = /nvidia|geforce|rtx|gtx|radeon (rx|pro)|arc a/i.test(name);
    if (gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
  } catch (_) {}
  return dedicated ? 3 : 2;
}
buildPost(DEBUG.quality !== null ? DEBUG.quality : detectTier());

/* échelle de qualité automatique */
const perf = { samples: [], fps: 60, low: 0, lastDrop: 0 };
function updatePerf(dt) {
  if (DEBUG.fixedStep) return;
  perf.samples.push(dt); if (perf.samples.length > 90) perf.samples.shift();
  const avg = perf.samples.reduce((a, b) => a + b, 0) / perf.samples.length; perf.fps = 1 / Math.max(avg, 1e-3);
  if (clock.t > 12 && perf.samples.length >= 60) {
    if (perf.fps < 55) perf.low += dt; else perf.low = Math.max(0, perf.low - dt * 0.5);
    if (perf.low > 3 && clock.t - perf.lastDrop > 10) {
      /* Reconstruire le graphe recompile des shaders : on ne le fait qu'une fois par palier,
         espacé de dix secondes, et jamais dans l'autre sens. */
      if (post.tier > 0) buildPost(post.tier - 1);
      else if (!perf.dprReduced) { perf.dprReduced = true; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1)); renderer.setSize(window.innerWidth, window.innerHeight); }
      perf.low = 0; perf.lastDrop = clock.t; perf.samples.length = 0;
    }
  }
}

export { OVERVIEW, detectTier, cam, camApply, flyTo, updateCamera, focusAgent, focusEcosystem, goOverview, canvas, pointer, pick, onClick, post, buildPost, perf, updatePerf };
