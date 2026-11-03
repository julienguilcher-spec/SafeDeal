// Moteur : rendu WebGPU (repli WebGL 2), scène, environnement studio, matériaux et helpers de géométrie.
import * as THREE from 'three/webgpu';
import { uniform, float, vec3, positionWorld, normalWorld, cameraPosition, normalize, dot, pow, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEBUG, $ } from './data.js';

/* ------------------------------------------------------------------ rendu */
/* Résolution de rendu : sur un écran Retina, un ratio de 2 quadruple le nombre de pixels à traiter
   par le post-traitement. 1.5 reste net à l'œil et divise la charge par 1,8. */
const DPR_CAP = DEBUG.dpr !== null ? DEBUG.dpr : 1.5;
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: DEBUG.forceWebGL, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.id = 'scene';
document.body.insertBefore(renderer.domElement, document.body.firstChild);
/* démarrage robuste : délai maximal, repli WebGL 2 persistant, perte de périphérique */
const startupFailed = (message) => { const f = $('fallback'); $('fallback-text').textContent = message; f.classList.add('show'); $('boot-veil').classList.add('off'); };
const switchToCompatibility = () => { try { sessionStorage.setItem('jarvis.backend', 'webgl'); } catch (_) {} location.reload(); };
try {
  if (DEBUG.failInit) throw new Error('Échec simulé de l\'initialisation');
  await Promise.race([
    renderer.init(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DEBUG.initTimeout)),
  ]);
} catch (err) {
  if (!DEBUG.forceWebGL && !DEBUG.failInit) { switchToCompatibility(); await new Promise(() => {}); }
  startupFailed('Le moteur 3D n\'a pas pu démarrer : ce navigateur ne prend en charge ni WebGPU ni WebGL 2, ou le GPU est indisponible.');
  throw err;
}
renderer.onDeviceLost = (info) => {
  console.error('JARVIS : périphérique graphique perdu', info);
  if (!DEBUG.forceWebGL) switchToCompatibility();
  else startupFailed('Le périphérique graphique a été perdu. Recharge la page ; si cela se reproduit, ferme les autres onglets 3D.');
};

const BACKEND = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.2, 400);

/* temps : horloge maîtresse (déterministe en mode capture) */
const clock = { t: 0, dt: 1 / 60 };
const uTime = uniform(0);

/* ------------------------------------------------------------------ environnement studio (HDRI procédural) */
function makeStudioEnvironment() {
  const W = 256, H = 128, d = new Float32Array(W * H * 4);
  const softRect = (u, v, cu, cv, su, sv, feather) => {
    let du = Math.abs(u - cu); du = Math.min(du, 1 - du);
    const dx = Math.max(0, du - su) / feather, dy = Math.max(0, Math.abs(v - cv) - sv) / feather;
    const f = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)); return f * f * (3 - 2 * f);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, i = (y * W + x) * 4;
    const zen = Math.pow(Math.max(0, (v - 0.5) / 0.5), 1.6) * 0.26; // dégradé zénithal doux : lecture des volumes métalliques
    let r = 0.012 + zen * 0.92, g = 0.013 + zen * 0.96, b = 0.016 + zen * 1.0;
    const top = softRect(u, v, 0.5, 0.94, 0.24, 0.03, 0.08) * 2.0;      // grand softbox zénithal
    const key = softRect(u, v, 0.16, 0.80, 0.014, 0.09, 0.03) * 2.6;    // bande clé (haute, chaude)
    const rim = softRect(u, v, 0.78, 0.78, 0.012, 0.08, 0.03) * 2.0;    // bande contre (haute, froide)
    const back = softRect(u, v, 0.5, 0.70, 0.30, 0.0025, 0.01) * 0.7;   // fine ligne horizontale arrière
    const low = 0;
    r += top * 0.93 + key * 1.0 + rim * 0.82 + back * 0.9;
    g += top * 0.96 + key * 0.97 + rim * 0.92 + back * 0.95;
    b += top * 1.0 + key * 0.9 + rim * 1.0 + back * 1.0;
    if (v < 0.5) { const k = 0.25 + 0.75 * (v / 0.5); r *= k; g *= k; b *= k; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 1;
  }
  const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}
scene.environment = makeStudioEnvironment();
scene.environmentIntensity = 1.5;

const keyLight = new THREE.DirectionalLight(0xffffff, 0.85); keyLight.position.set(-6, 12, 8); scene.add(keyLight);
const coreLight = new THREE.PointLight(0xcfe9ff, 0, 60, 1.6); scene.add(coreLight);

/* ------------------------------------------------------------------ matériaux partagés */
const scratchNoise = mx_fractal_noise_float(positionWorld.mul(vec3(70, 5, 70)), 2, 2.0, 0.5, 1.0);
const dustNoise = mx_noise_float(positionWorld.mul(160.0));
const fresnelNode = pow(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))).abs().oneMinus().clamp(0, 1), 2.5);

const matTitanium = new THREE.MeshPhysicalNodeMaterial({ color: 0x2a2e35, metalness: 1.0, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.22, anisotropy: 0.7, anisotropyRotation: 0.4, iridescence: 0.16, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 420] });
matTitanium.roughnessNode = float(0.34).add(scratchNoise.mul(0.09)).add(dustNoise.mul(0.035)).clamp(0.08, 0.9);
const matGraphite = new THREE.MeshPhysicalNodeMaterial({ color: 0x15171b, metalness: 0.85, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.35 });
matGraphite.roughnessNode = float(0.5).add(scratchNoise.mul(0.1)).clamp(0.1, 0.95);
const matChrome = new THREE.MeshPhysicalNodeMaterial({ color: 0xb9bec6, metalness: 1.0, roughness: 0.06, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0.12, iridescenceIOR: 1.25 });
matChrome.roughnessNode = float(0.05).add(dustNoise.mul(0.03)).add(scratchNoise.mul(0.02)).clamp(0.02, 0.4);
const matGlass = new THREE.MeshPhysicalNodeMaterial({ color: 0xf4f8ff, metalness: 0, roughness: 0.04, transmission: 1.0, ior: 1.52, thickness: 0.28, dispersion: 4.0, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0.28, iridescenceIOR: 1.35, iridescenceThicknessRange: [140, 520], attenuationColor: new THREE.Color(0xdcecff), attenuationDistance: 2.4, specularIntensity: 1.0 });
const matGlassSoft = matGlass.clone(); matGlassSoft.roughness = 0.14; matGlassSoft.thickness = 0.12;

function makeEmissiveMaterial(opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x000000, roughness: 0.6, metalness: 0.0, transparent: !!opts.transparent, depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : !opts.transparent });
  return m;
}

/* ------------------------------------------------------------------ géométrie : helpers */
const GEO_CACHE = new Map();
function cached(key, make) { if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, make()); return GEO_CACHE.get(key); }
const bevelBox = (w, h, d, r = 0.012, s = 2) => cached(`bb${w}|${h}|${d}|${r}|${s}`, () => new RoundedBoxGeometry(w, h, d, s, r));
function machinedRing(rIn, rOut, h, ch, segs = 96) {
  return cached(`mr${rIn}|${rOut}|${h}|${ch}|${segs}`, () => {
    const p = [
      [rIn + ch, -h / 2], [rOut - ch, -h / 2], [rOut, -h / 2 + ch], [rOut, h / 2 - ch], [rOut - ch, h / 2], [rIn + ch, h / 2], [rIn, h / 2 - ch], [rIn, -h / 2 + ch], [rIn + ch, -h / 2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(p, segs).toNonIndexed(); g.computeVertexNormals(); return g;
  });
}
function latheFromProfile(points, segs = 64, flat = true) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  if (flat) { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; }
  return g;
}
function extrudeShape(shape, depth, bevel = 0.008, curveSegments = 24) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -depth / 2); return g;
}
function polyShape(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => (i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1]))); s.closePath(); return s; }
function roundedRectShape(w, h, r) { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function tubeAlong(points, radius, closed = false, segs = 48, smooth = true) {
  const v = points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0));
  let curve;
  if (smooth) curve = new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.5);
  else { curve = new THREE.CurvePath(); for (let i = 0; i < v.length - 1; i++) curve.add(new THREE.LineCurve3(v[i], v[i + 1])); if (closed) curve.add(new THREE.LineCurve3(v[v.length - 1], v[0])); }
  return new THREE.TubeGeometry(curve, segs, radius, 6, closed);
}
const _edgeA = new THREE.Vector3(), _edgeB = new THREE.Vector3(), _edgeM = new THREE.Matrix4(), _edgeQ = new THREE.Quaternion(), _edgeS = new THREE.Vector3(), _edgeUp = new THREE.Vector3(0, 1, 0), _edgeDir = new THREE.Vector3();
function edgeFrame(geometry, radius, material, threshold = 15, joints = true) {
  const edges = new THREE.EdgesGeometry(geometry, threshold); const pos = edges.attributes.position; const n = pos.count / 2;
  const cyl = cached(`cyl${radius}`, () => new THREE.CylinderGeometry(radius, radius, 1, 6, 1));
  const mesh = new THREE.InstancedMesh(cyl, material, n);
  for (let i = 0; i < n; i++) {
    _edgeA.fromBufferAttribute(pos, i * 2); _edgeB.fromBufferAttribute(pos, i * 2 + 1);
    _edgeDir.subVectors(_edgeB, _edgeA); const len = _edgeDir.length(); _edgeDir.normalize();
    _edgeQ.setFromUnitVectors(_edgeUp, _edgeDir); _edgeS.set(1, len, 1);
    _edgeM.compose(_edgeA.add(_edgeB).multiplyScalar(0.5), _edgeQ, _edgeS); mesh.setMatrixAt(i, _edgeM);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group(); group.add(mesh);
  if (joints) {
    const seen = new Map(); const pts = [];
    for (let i = 0; i < pos.count; i++) { const k = `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`; if (!seen.has(k)) { seen.set(k, 1); pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); } }
    const sph = cached(`sph${radius}`, () => new THREE.SphereGeometry(radius * 1.15, 8, 6));
    const jm = new THREE.InstancedMesh(sph, material, pts.length);
    pts.forEach((p, i) => { _edgeM.makeTranslation(p[0], p[1], p[2]); jm.setMatrixAt(i, _edgeM); });
    jm.instanceMatrix.needsUpdate = true; group.add(jm);
  }
  return group;
}
function M(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

export { renderer, BACKEND, DPR_CAP, scene, camera, clock, uTime, keyLight, coreLight, scratchNoise, dustNoise, fresnelNode, matTitanium, matGraphite, matChrome, matGlass, matGlassSoft, makeEmissiveMaterial, cached, bevelBox, machinedRing, latheFromProfile, extrudeShape, polyShape, roundedRectShape, tubeAlong, edgeFrame, M };
