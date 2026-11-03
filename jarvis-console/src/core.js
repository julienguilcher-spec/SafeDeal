// Sol de verre laqué (miroir planaire) et cœur JARVIS : noyau, bobines, anneaux usinés, cage géodésique, coque, onde.
import * as THREE from 'three/webgpu';
import { uniform, float, vec3, vec4, uv, positionLocal, positionWorld, normalLocal, cameraPosition, mix, smoothstep, sin, normalize, reflector, atan, mrt, output, emissive, instancedBufferAttribute, mx_noise_float, PI } from 'three/tsl';
import { rng } from './data.js';
import { scene, uTime, dustNoise, scratchNoise, fresnelNode, matTitanium, matGraphite, matChrome, matGlass, makeEmissiveMaterial, cached, machinedRing, extrudeShape, polyShape, edgeFrame, M } from './engine.js';

/* ------------------------------------------------------------------ sol : verre laqué noir, miroir planaire */
const reflection = reflector({ resolutionScale: 0.6, generateMipmaps: true, bounces: false });
reflection.target.rotateX(-Math.PI / 2);
scene.add(reflection.target);
const uReflStrength = uniform(1.0), uReflFade = uniform(40.0), uReflBlur = uniform(0.085);
const camDistNode = positionWorld.sub(cameraPosition).length();
reflection.levelNode = camDistNode.mul(uReflBlur).clamp(0.0, 3.5); // flou qui augmente avec la distance (chute de rugosité)
const floorMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x000000, metalness: 0.0, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.12, specularIntensity: 0.7 });
floorMat.roughnessNode = float(0.15).add(dustNoise.mul(0.05)).add(scratchNoise.mul(0.03)).clamp(0.05, 0.6);
{
  const fade = camDistNode.div(uReflFade).oneMinus().clamp(0, 1).pow(1.7);
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const grazing = viewDir.y.clamp(0, 1).oneMinus().pow(3.0); // 0 à la verticale, 1 rasant (Fresnel du vernis)
  floorMat.emissiveNode = reflection.rgb.min(vec3(2.2)).mul(fade).mul(uReflStrength).mul(mix(0.2, 0.95, grazing));
  const horizonFade = camDistNode.div(uReflFade.mul(1.6)).oneMinus().clamp(0, 1).pow(1.2);
  floorMat.clearcoatNode = horizonFade.mul(0.7); floorMat.specularIntensityNode = horizonFade.mul(0.7);
  floorMat.outputNode = vec4(output.rgb.mul(horizonFade), 1.0);
  floorMat.mrtNode = mrt({ emissive: emissive.mul(0.4) }); // le reflet ne doit pas doubler le bloom
}
const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 1, 1), floorMat);
floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = 0; scene.add(floorMesh);

/* ------------------------------------------------------------------ JARVIS : le cœur */
const CORE_POS = new THREE.Vector3(0, 2.1, 0);
const core = new THREE.Group(); core.position.copy(CORE_POS); scene.add(core);
const jarvis = {
  nucleus: 0, listening: 0, speaking: 0, wave: 0, boost: 0, flicker: 0, speakUntil: 0,
  u: {
    nucleus: uniform(0), nucleusColor: uniform(new THREE.Color(0.78, 0.92, 1.0)),
    wave: uniform(0), waveColor: uniform(new THREE.Color(0.75, 0.9, 1.0)),
    shock: uniform(0), coilGain: uniform(0),
  },
};
const COIL_COUNT = 24;

/* noyau */
const nucleusMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x05070a, roughness: 0.35, metalness: 0.0, clearcoat: 0.6 });
{
  const plasma = mx_noise_float(normalLocal.mul(2.6).add(vec3(uTime.mul(0.11), uTime.mul(0.07), 0))).mul(0.16).add(0.92);
  nucleusMat.emissiveNode = jarvis.u.nucleusColor.mul(jarvis.u.nucleus).mul(fresnelNode.oneMinus().mul(0.7).add(0.42)).mul(plasma);
}
const nucleus = M(new THREE.SphereGeometry(0.3, 64, 40), nucleusMat); core.add(nucleus);
const nucleusCoreGlow = M(new THREE.SphereGeometry(0.16, 32, 24), (() => { const m = makeEmissiveMaterial(); m.emissiveNode = jarvis.u.nucleusColor.mul(jarvis.u.nucleus).mul(1.6); return m; })()); nucleus.add(nucleusCoreGlow);
const nucleusGlass = M(new THREE.SphereGeometry(0.46, 64, 40), matGlass); core.add(nucleusGlass);

/* bobines segmentées */
const coilLitAttr = new THREE.InstancedBufferAttribute(new Float32Array(COIL_COUNT), 1);
const coilMat = matTitanium.clone();
{
  const lit = instancedBufferAttribute(coilLitAttr);
  coilMat.emissiveNode = jarvis.u.nucleusColor.mul(lit).mul(jarvis.u.coilGain).mul(uv().y.sub(0.5).abs().mul(2).oneMinus().smoothstep(0.0, 0.35));
}
const coils = new THREE.InstancedMesh(cached('coil', () => new THREE.TorusGeometry(0.64, 0.03, 10, 10, (Math.PI * 2 / COIL_COUNT) * 0.7)), coilMat, COIL_COUNT);
{
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < COIL_COUNT; i++) { m4.makeRotationY((i / COIL_COUNT) * Math.PI * 2); m4.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)); coils.setMatrixAt(i, m4); }
  coils.instanceMatrix.needsUpdate = true;
  core.add(coils);
}
const coilRail = M(machinedRing(0.60, 0.68, 0.016, 0.004, 128), matGraphite); core.add(coilRail);

/* anneaux usinés */
const ringDefs = [
  { r: 1.32, w: 0.085, h: 0.1, tilt: [0, 0, 0], spin: 0.14, ticks: 120, axis: 'y' },
  { r: 1.6, w: 0.07, h: 0.08, tilt: [1.08, 0, 0], spin: -0.09, ticks: 144, axis: 'y' },
  { r: 1.88, w: 0.055, h: 0.065, tilt: [0, 0, 1.08], spin: 0.06, ticks: 180, axis: 'y' },
];
const rings = ringDefs.map((def, idx) => {
  const pivot = new THREE.Group(); const spin = new THREE.Group(); pivot.add(spin); core.add(pivot);
  const ring = M(machinedRing(def.r - def.w / 2, def.r + def.w / 2, def.h, 0.008, 160), idx === 1 ? matChrome : matTitanium); spin.add(ring);
  // graduations : petites encoches instanciées sur la face externe
  const tickGeo = cached('tick', () => new THREE.BoxGeometry(0.006, 0.014, 0.012));
  const ticks = new THREE.InstancedMesh(tickGeo, matGraphite, def.ticks); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < def.ticks; i++) { const a = (i / def.ticks) * Math.PI * 2; const long = i % 6 === 0; p.set(Math.cos(a) * (def.r + def.w / 2 + 0.001), 0, Math.sin(a) * (def.r + def.w / 2 + 0.001)); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); s.set(1, long ? 2.2 : 1, 1); m4.compose(p, q, s); ticks.setMatrixAt(i, m4); }
  ticks.instanceMatrix.needsUpdate = true; spin.add(ticks);
  // incrustation lumineuse fine sur l'arête interne
  const inlayMat = makeEmissiveMaterial(); const uInlay = uniform(0);
  inlayMat.emissiveNode = jarvis.u.nucleusColor.mul(uInlay);
  const inlay = M(new THREE.TorusGeometry(def.r - def.w / 2 + 0.006, 0.0035, 6, 200), inlayMat); inlay.rotation.x = Math.PI / 2; spin.add(inlay);
  // vis / repères chromés
  const screws = new THREE.InstancedMesh(cached('screw', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10)), matChrome, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; p.set(Math.cos(a) * def.r, def.h / 2 + 0.004, Math.sin(a) * def.r); q.identity(); s.set(1, 1, 1); m4.compose(p, q, s); screws.setMatrixAt(i, m4); }
  screws.instanceMatrix.needsUpdate = true; spin.add(screws);
  return { def, pivot, spin, uInlay, angle: rng() * 6 };
});

/* cage géodésique */
const geodesic = edgeFrame(new THREE.IcosahedronGeometry(1.06, 1), 0.0045, matChrome, 1, true); core.add(geodesic);

/* plaques de coque (faces du dodécaèdre dual) */
function buildPlates() {
  const ico = new THREE.IcosahedronGeometry(1, 0); const pos = ico.attributes.position;
  const verts = []; const faces = [];
  const key = (v) => `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;
  for (let f = 0; f < pos.count / 3; f++) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, f * 3), b = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 2);
    faces.push({ k: [key(a), key(b), key(c)], centroid: a.clone().add(b).add(c).divideScalar(3).normalize() });
    [a, b, c].forEach((v) => { if (!verts.find((w) => key(w) === key(v))) verts.push(v.clone().normalize()); });
  }
  const plates = [];
  const R = 2.62, inset = 0.955, depth = 0.03;
  verts.forEach((d, idx) => {
    const corners = faces.filter((f) => f.k.includes(key(d))).map((f) => f.centroid);
    const x = corners[0].clone().sub(d.clone().multiplyScalar(corners[0].dot(d))).normalize(); const y = new THREE.Vector3().crossVectors(d, x);
    corners.sort((p, q) => Math.atan2(p.dot(y), p.dot(x)) - Math.atan2(q.dot(y), q.dot(x)));
    const D = corners[0].dot(d) * R; const pts2 = corners.map((c) => [c.dot(x) * R * inset, c.dot(y) * R * inset]);
    const geo = extrudeShape(polyShape(pts2), depth, 0.01, 4);
    const pivot = new THREE.Group(); const basis = new THREE.Matrix4().makeBasis(x, y, d); pivot.quaternion.setFromRotationMatrix(basis);
    const mesh = M(geo, matTitanium); pivot.add(mesh);
    // liseré gravé (très faible) sur la plaque
    const edge = edgeFrame(geo, 0.002, matGraphite, 40, false); mesh.add(edge);
    core.add(pivot); plates.push({ pivot, mesh, dir: d, D, idx, phase: rng() * 6.28 });
  });
  return plates;
}
const plates = buildPlates();

/* anneau d'onde (écoute / parole) */
const waveMat = makeEmissiveMaterial({ transparent: true });
{
  const ang = atan(positionLocal.y, positionLocal.x);
  const w = sin(ang.mul(16).add(uTime.mul(7))).mul(0.5).add(sin(ang.mul(23).sub(uTime.mul(11))).mul(0.3)).add(sin(ang.mul(5).add(uTime.mul(3))).mul(0.2));
  const disp = w.mul(jarvis.u.wave).mul(0.1);
  waveMat.positionNode = positionLocal.add(vec3(0, 0, 1).mul(disp)).add(normalize(vec3(positionLocal.xy, 0)).mul(disp.mul(0.35)));
  waveMat.emissiveNode = jarvis.u.waveColor.mul(jarvis.u.wave).mul(2.2);
  waveMat.opacityNode = jarvis.u.wave.clamp(0, 1);
  waveMat.blending = THREE.AdditiveBlending;
}
const waveRing = M(new THREE.TorusGeometry(2.4, 0.004, 6, 360), waveMat); waveRing.rotation.x = -Math.PI / 2; core.add(waveRing);

/* onde de choc au sol */
const shockMat = makeEmissiveMaterial({ transparent: true }); shockMat.blending = THREE.AdditiveBlending;
shockMat.emissiveNode = jarvis.u.nucleusColor.mul(jarvis.u.shock).mul(1.4).mul(uv().x.mul(PI).sin().pow(0.6));
shockMat.opacityNode = jarvis.u.shock.clamp(0, 1);
const shockwave = M(new THREE.RingGeometry(0.965, 1.0, 160), shockMat); shockwave.rotation.x = -Math.PI / 2; shockwave.position.y = 0.012; shockwave.visible = false; scene.add(shockwave);
const shock = { t: -1 };

export { reflection, uReflStrength, uReflFade, uReflBlur, floorMat, floorMesh, CORE_POS, core, jarvis, COIL_COUNT, nucleus, nucleusGlass, coilLitAttr, coils, coilRail, rings, geodesic, plates, waveRing, shockwave, shock };
