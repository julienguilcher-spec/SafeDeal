// Liens courbes, fusées de lumière instanciées, éclats, pools de lumière, poussière et étoiles.
import * as THREE from 'three/webgpu';
import { uniform, float, vec3, vec4, uv, positionLocal, positionWorld, cameraPosition, mix, smoothstep, sin, cos, pow, hash, exp, attribute, instancedBufferAttribute, mx_fractal_noise_float } from 'three/tsl';
import { rng, lerp, clamp01, easeOutQuint, HANDOVERS } from './data.js';
import { scene, camera, clock, uTime, makeEmissiveMaterial, cached } from './engine.js';
import { CORE_POS, jarvis } from './core.js';
import { agents, agentsById } from './agents.js';

/* ------------------------------------------------------------------ liens courbes */
const LINK_STYLE = { strong: { r: 0.0075, base: 0.22, alpha: 0.9 }, leader: { r: 0.0042, base: 0.14, alpha: 0.8 }, faint: { r: 0.002, base: 0.035, alpha: 0.45 }, hand: { r: 0.0045, base: 0.45, alpha: 0.9 } };
const links = []; const linksByKey = {};
const CURVE_SAMPLES = 96;
function makeLink(from, to, kind, color) {
  const st = LINK_STYLE[kind];
  const pA = from.clone(), pB = to.clone();
  const mid = pA.clone().lerp(pB, 0.5); const d = pA.distanceTo(pB);
  const side = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(d * (kind === 'hand' ? 0.12 : 0.05) * (rng() > 0.5 ? 1 : -1));
  mid.y += d * (kind === 'hand' ? 0.06 : 0.07) + 0.25; mid.add(side);
  const curve = new THREE.QuadraticBezierCurve3(pA, mid, pB);
  const geo = new THREE.TubeGeometry(curve, 72, st.r, 5, false);
  const mat = makeEmissiveMaterial({ transparent: true, depthWrite: true }); mat.blending = THREE.AdditiveBlending;
  const u = { color: uniform(color.clone()), intensity: uniform(st.base), draw: uniform(0), flow: uniform(0), alpha: uniform(st.alpha), dim: uniform(1) };
  {
    const t = uv().x;
    const drawn = smoothstep(u.draw.sub(0.025), u.draw, t).oneMinus();
    const ends = smoothstep(0.0, 0.06, t).mul(smoothstep(1.0, 0.94, t));
    const flow = sin(t.mul(46).sub(uTime.mul(3.2))).mul(0.5).add(0.5).pow(4).mul(u.flow).mul(0.6);
    mat.emissiveNode = u.color.mul(u.intensity.add(flow)).mul(drawn).mul(ends).mul(u.dim);
    const nearFade = smoothstep(0.8, 5.0, positionWorld.sub(cameraPosition).length()); // les liens s'effacent au passage près de la caméra
    mat.opacityNode = drawn.mul(ends).mul(u.alpha).mul(nearFade);
  }
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
  // échantillons pour les fusées
  const pts = new Float32Array((CURVE_SAMPLES + 1) * 3), tans = new Float32Array((CURVE_SAMPLES + 1) * 3); const p = new THREE.Vector3(), tv = new THREE.Vector3();
  for (let i = 0; i <= CURVE_SAMPLES; i++) { curve.getPointAt(i / CURVE_SAMPLES, p); curve.getTangentAt(i / CURVE_SAMPLES, tv); pts.set([p.x, p.y, p.z], i * 3); tans.set([tv.x, tv.y, tv.z], i * 3); }
  const link = { kind, mesh, mat, u, pts, tans, from, to, length: curve.getLength(), active: 0, fade: 0, handover: null };
  links.push(link); return link;
}
function sampleLink(link, t, outP, outT) {
  const f = clamp01(t) * CURVE_SAMPLES; const i = Math.min(CURVE_SAMPLES - 1, Math.floor(f)); const k = f - i;
  outP.set(lerp(link.pts[i * 3], link.pts[i * 3 + 3], k), lerp(link.pts[i * 3 + 1], link.pts[i * 3 + 4], k), lerp(link.pts[i * 3 + 2], link.pts[i * 3 + 5], k));
  if (outT) outT.set(lerp(link.tans[i * 3], link.tans[i * 3 + 3], k), lerp(link.tans[i * 3 + 1], link.tans[i * 3 + 4], k), lerp(link.tans[i * 3 + 2], link.tans[i * 3 + 5], k)).normalize();
}
const CORE_ANCHOR = CORE_POS.clone();
agents.forEach((a) => {
  const target = a.pos.clone();
  if (a.def.leader) { a.linkMain = makeLink(CORE_ANCHOR, target, 'strong', a.eco.color); linksByKey[`core>${a.def.id}`] = a.linkMain; }
  else {
    const leader = agentsById[a.eco.leader];
    a.linkMain = makeLink(leader.pos.clone(), target, 'leader', a.eco.color); linksByKey[`${leader.def.id}>${a.def.id}`] = a.linkMain;
    a.linkFaint = makeLink(CORE_ANCHOR, target, 'faint', a.eco.color); linksByKey[`core>${a.def.id}`] = a.linkFaint;
  }
  a.linkMain.agent = a; if (a.linkFaint) a.linkFaint.agent = a;
});
HANDOVERS.forEach(([f, t]) => { const A = agentsById[f], B = agentsById[t]; const l = makeLink(A.pos.clone(), B.pos.clone(), 'hand', A.eco.color); l.u.draw.value = 0; l.u.alpha.value = 0; l.handoverFrom = A; l.handoverTo = B; linksByKey[`hand:${f}>${t}`] = l; });
// chemin core → agent non-leader : via le leader (deux segments) ou le lien faible direct ; on utilise le lien principal (leader→agent) et le lien fort core→leader
function pathToAgent(agent) { return agent.def.leader ? [agent.linkMain] : [agentsById[agent.eco.leader].linkMain, agent.linkMain]; }

/* ------------------------------------------------------------------ fusées de lumière (instanciées) */
const ROCKET_MAX = 600;
const rocketGeo = (() => {
  const prof = []; const L = 0.85, r = 0.036; const N = 14;
  for (let i = 0; i <= N; i++) { const k = i / N; prof.push([r * Math.pow(k, 1.7) * (i === 0 ? 0 : 1), -L + k * L]); }
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push([r * Math.cos(a), Math.sin(a) * r * 1.6]); }
  prof.push([0, r * 1.6]);
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 16); g.rotateX(Math.PI / 2); return g;
})();
const rocketAttr = new THREE.InstancedBufferAttribute(new Float32Array(ROCKET_MAX * 4), 4);
const rocketMat = makeEmissiveMaterial({ transparent: true }); rocketMat.blending = THREE.AdditiveBlending; rocketMat.side = THREE.FrontSide;
{
  const inst = instancedBufferAttribute(rocketAttr); const k = uv().y;
  rocketMat.emissiveNode = vec3(inst.x, inst.y, inst.z).mul(inst.w).mul(pow(k, 2.4).mul(3.2).add(pow(k, 8).mul(4.0)));
  rocketMat.opacityNode = pow(k, 1.6).mul(inst.w.clamp(0, 1));
}
const rocketMesh = new THREE.InstancedMesh(rocketGeo, rocketMat, ROCKET_MAX); rocketMesh.frustumCulled = false; rocketMesh.count = 0; scene.add(rocketMesh);
const rockets = []; const _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4(), _rs = new THREE.Vector3(), _rz = new THREE.Vector3(0, 0, 1), _hide = new THREE.Matrix4().makeScale(0, 0, 0);
function spawnRocket(path, dir, color, intensity, speed, agent) {
  if (rockets.length >= ROCKET_MAX) return;
  rockets.push({ path, seg: dir > 0 ? 0 : path.length - 1, t: dir > 0 ? 0 : 1, dir, color, intensity, speed, agent, len: 0.7 + rng() * 0.6, paused: false });
}
function updateRockets(dt) {
  let n = 0;
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; const link = r.path[r.seg];
    const paused = r.agent && r.agent.data.state === 'waiting';
    if (!paused) {
      // accélération en sortie, freinage à l'arrivée (profil doux)
      const local = r.dir > 0 ? r.t : 1 - r.t; const ease = 0.35 + 0.65 * Math.sin(Math.min(1, local * 1.25) * Math.PI * 0.5 + 0.2);
      r.t += r.dir * r.speed * ease * dt / Math.max(0.35, link.length / 9);
      if (r.dir > 0 && r.t >= 1) { r.seg++; r.t = 0; if (r.seg >= r.path.length) { arriveRocket(r, true); rockets.splice(i, 1); continue; } }
      if (r.dir < 0 && r.t <= 0) { r.seg--; r.t = 1; if (r.seg < 0) { arriveRocket(r, false); rockets.splice(i, 1); continue; } }
    }
    sampleLink(link, r.t, _rp, _rt); if (r.dir < 0) _rt.negate();
    _rq.setFromUnitVectors(_rz, _rt); const s = paused ? 0.55 : 1; _rs.set(s, s, r.len * (paused ? 0.5 : 1));
    _rm.compose(_rp, _rq, _rs); rocketMesh.setMatrixAt(n, _rm);
    const flick = paused ? 0.45 + 0.25 * Math.sin(clock.t * 6 + i) : r.intensity;
    rocketAttr.setXYZW(n, r.color.r, r.color.g, r.color.b, flick); n++;
  }
  rocketMesh.count = n; rocketMesh.instanceMatrix.needsUpdate = true; rocketAttr.needsUpdate = true;
}
function arriveRocket(r, outbound) {
  const link = r.path[outbound ? r.path.length - 1 : 0];
  const p = outbound ? link.to : link.from;
  spawnBurst(p, r.color, outbound ? 0.5 : 0.75);
  if (outbound && r.agent) r.agent.glow = Math.min(1.6, r.agent.glow + 0.9);
  if (!outbound) jarvis.flicker = Math.min(1, jarvis.flicker + 0.35);
}

/* éclats d'arrivée (anneaux instanciés orientés caméra) */
const BURST_MAX = 96; const burstAttr = new THREE.InstancedBufferAttribute(new Float32Array(BURST_MAX * 4), 4);
const burstMat = makeEmissiveMaterial({ transparent: true }); burstMat.blending = THREE.AdditiveBlending; burstMat.side = THREE.DoubleSide;
{ const inst = instancedBufferAttribute(burstAttr); burstMat.emissiveNode = vec3(inst.x, inst.y, inst.z).mul(inst.w).mul(2.5); burstMat.opacityNode = inst.w.clamp(0, 1); }
const burstMesh = new THREE.InstancedMesh(cached('burst', () => new THREE.RingGeometry(0.88, 1.0, 64)), burstMat, BURST_MAX); burstMesh.frustumCulled = false; burstMesh.count = 0; scene.add(burstMesh);
const bursts = [];
function spawnBurst(p, color, size) { if (bursts.length >= BURST_MAX) bursts.shift(); bursts.push({ p: p.clone(), color, size, t: 0 }); }
function updateBursts(dt) {
  let n = 0;
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.t += dt / 0.5; if (b.t >= 1) { bursts.splice(i, 1); continue; }
    const e = easeOutQuint(b.t); const s = b.size * (0.1 + 0.9 * e); _rs.set(s, s, s); _rm.compose(b.p, camera.quaternion, _rs); burstMesh.setMatrixAt(n, _rm); burstAttr.setXYZW(n, b.color.r, b.color.g, b.color.b, Math.pow(1 - b.t, 2.2)); n++; }
  burstMesh.count = n; burstMesh.instanceMatrix.needsUpdate = true; burstAttr.needsUpdate = true;
}

/* ------------------------------------------------------------------ pools de lumière au sol (ancrage visuel + caustiques procédurales) */
const POOL_COUNT = agents.length + 1; const poolAttr = new THREE.InstancedBufferAttribute(new Float32Array(POOL_COUNT * 4), 4);
const poolMat = makeEmissiveMaterial({ transparent: true }); poolMat.blending = THREE.AdditiveBlending;
{
  const inst = instancedBufferAttribute(poolAttr); const c = uv().sub(0.5).mul(2); const d = c.length();
  const fall = d.oneMinus().clamp(0, 1).pow(2.6);
  const caus = mx_fractal_noise_float(vec3(positionWorld.x.mul(3.2), positionWorld.z.mul(3.2), uTime.mul(0.18)), 2, 2.2, 0.55, 1.0);
  const caustic = caus.abs().oneMinus().clamp(0, 1).pow(6).mul(0.9).add(0.55);
  poolMat.emissiveNode = vec3(inst.x, inst.y, inst.z).mul(inst.w).mul(fall).mul(caustic);
  poolMat.opacityNode = fall.mul(inst.w.clamp(0, 1));
}
const poolMesh = new THREE.InstancedMesh(cached('pool', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), poolMat, POOL_COUNT); poolMesh.frustumCulled = false; scene.add(poolMesh);
{ const m4 = new THREE.Matrix4(); agents.forEach((a, i) => { m4.makeTranslation(a.pos.x, 0.01, a.pos.z); m4.scale(new THREE.Vector3(2.6, 1, 2.6)); poolMesh.setMatrixAt(i, m4); }); m4.makeTranslation(CORE_POS.x, 0.01, CORE_POS.z); m4.scale(new THREE.Vector3(5, 1, 5)); poolMesh.setMatrixAt(agents.length, m4); poolMesh.instanceMatrix.needsUpdate = true; }

/* ------------------------------------------------------------------ poussière et étoiles */
function makePoints(count, place, sizeNode, colorFn, attenuate) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count), nrm = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { const p = place(i); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; seed[i] = rng(); nrm[i * 3 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); m.sizeAttenuation = attenuate; m.sizeNode = sizeNode; m.colorNode = colorFn(attribute('seed', 'float'));
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}
const dust = (() => {
  const count = 1400; const seedN = attribute('seed', 'float');
  const pts = makePoints(count, () => [(rng() - 0.5) * 70, rng() * 12 + 0.2, (rng() - 0.5) * 70], float(0.035).add(hash(seedN.mul(7.0)).mul(0.03)), (s) => {
    const distCore = positionWorld.sub(vec3(CORE_POS.x, CORE_POS.y, CORE_POS.z)).length();
    const near = exp(distCore.mul(-0.16)).mul(jarvis.u.nucleus.mul(0.18).add(0.1));
    const twinkle = sin(uTime.mul(0.9).add(s.mul(60))).mul(0.5).add(0.5).pow(2);
    const b = near.add(0.02).mul(twinkle.mul(0.6).add(0.4));
    return vec4(vec3(0.85, 0.92, 1.0).mul(b), b.clamp(0, 1));
  }, true);
  pts.material.positionNode = positionLocal.add(vec3(sin(uTime.mul(0.08).add(seedN.mul(40))).mul(0.5), sin(uTime.mul(0.06).add(seedN.mul(23))).mul(0.3), cos(uTime.mul(0.07).add(seedN.mul(31))).mul(0.5)));
  scene.add(pts); return pts;
})();
const starLayers = [[2600, 140, 2.0, 0.9], [2000, 230, 1.7, 0.8], [1600, 330, 1.5, 0.7]].map(([count, R, size, lum], li) => {
  const pts = makePoints(count, () => { const t = rng() * Math.PI * 2, p = Math.acos(2 * rng() - 1); const y = Math.cos(p); return [R * Math.sin(p) * Math.cos(t), Math.abs(y) * R * 0.8 + 2, R * Math.sin(p) * Math.sin(t)]; },
    float(size).add(hash(attribute('seed', 'float').mul(13.0)).pow(4).mul(size * 1.4)), (s) => { const b = hash(s.mul(5.0)).pow(2).mul(lum).add(0.04); const tint = mix(vec3(0.8, 0.86, 1.0), vec3(1.0, 0.95, 0.88), hash(s.mul(3.0))); return vec4(tint.mul(b), b.clamp(0, 1)); }, false);
  scene.add(pts); pts.userData.spin = (li + 1) * 0.0012; return pts;
});

export { LINK_STYLE, links, linksByKey, sampleLink, pathToAgent, rockets, rocketMesh, spawnRocket, updateRockets, bursts, spawnBurst, updateBursts, poolAttr, poolMesh, dust, starLayers };
