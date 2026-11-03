// Les dix-neuf agents : instruments de précision procéduraux, états, anneaux et marqueurs.
import * as THREE from 'three/webgpu';
import { uniform, float, vec3, uv, positionLocal, smoothstep, step, sin, atan, PI2 } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, seg, easeInOutCubic, ECOSYSTEMS, ECO, AGENT_DEFS, agentById } from './data.js';
import { scene, uTime, matTitanium, matGraphite, matChrome, matGlass, matGlassSoft, makeEmissiveMaterial, cached, bevelBox, machinedRing, latheFromProfile, extrudeShape, polyShape, tubeAlong, edgeFrame, M } from './engine.js';
import { CORE_POS } from './core.js';

/* ------------------------------------------------------------------ agents : instruments de précision */
const BUILDERS = {};

function crownPart(ctx, g, y = 0.18, scale = 1) {
  const band = M(machinedRing(0.2 * scale, 0.245 * scale, 0.095 * scale, 0.008, 96), ctx.body, 0, y, 0); g.add(band);
  const spikeGeo = cached('spike', () => { const c = new THREE.ConeGeometry(0.045, 0.2, 4, 1); c.translate(0, 0.1, 0); const n = c.toNonIndexed(); n.computeVertexNormals(); return n; });
  const spikes = new THREE.InstancedMesh(spikeGeo, ctx.body, 8); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(scale, scale, scale), e = new THREE.Euler();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(Math.cos(a) * 0.215 * scale, y + 0.045 * scale, Math.sin(a) * 0.215 * scale); e.set(Math.sin(a) * 0.22, -a, -Math.cos(a) * 0.22, 'YXZ'); q.setFromEuler(e); m4.compose(p, q, s); spikes.setMatrixAt(i, m4); }
  spikes.instanceMatrix.needsUpdate = true; g.add(spikes);
  const tips = new THREE.InstancedMesh(cached('tip', () => new THREE.SphereGeometry(0.014, 10, 8)), ctx.chrome, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(Math.cos(a) * (0.215 + 0.045) * scale, y + 0.045 * scale + 0.195 * scale, Math.sin(a) * (0.215 + 0.045) * scale); m4.makeTranslation(p.x, p.y, p.z); tips.setMatrixAt(i, m4); }
  tips.instanceMatrix.needsUpdate = true; g.add(tips);
  const inlay = M(new THREE.TorusGeometry(0.247 * scale, 0.0035, 6, 120), ctx.edge, 0, y + 0.03 * scale, 0); inlay.rotation.x = Math.PI / 2; g.add(inlay);
  return band;
}
BUILDERS.crown = (ctx, g) => {
  crownPart(ctx, g, 0.2, 1);
  const diamond = M(new THREE.OctahedronGeometry(0.19, 0), ctx.glass, 0, -0.2, 0); diamond.scale.set(1, 1.45, 1); g.add(diamond);
  const frame = edgeFrame(new THREE.OctahedronGeometry(0.19, 0), 0.004, ctx.edge, 10, true); frame.scale.set(1, 1.45, 1); frame.position.y = -0.2; g.add(frame);
  return (t) => { diamond.rotation.y = t * 0.35; frame.rotation.y = t * 0.35; };
};
BUILDERS.crowncap = (ctx, g) => {
  crownPart(ctx, g, 0.0, 0.95);
  const board = M(bevelBox(0.52, 0.016, 0.52, 0.006), ctx.body, 0, 0.3, 0); board.rotation.y = Math.PI / 4; g.add(board);
  const cap = M(machinedRing(0.0, 0.17, 0.1, 0.012, 48), ctx.graphite, 0, 0.245, 0); g.add(cap);
  const button = M(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12), ctx.chrome, 0, 0.315, 0); g.add(button);
  const tassel = M(tubeAlong([[0.0, 0.312, 0], [0.2, 0.3, -0.2], [0.26, 0.2, -0.26], [0.27, 0.06, -0.27]], 0.004, false, 24, true), ctx.chrome); g.add(tassel);
  const tip = M(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 10), ctx.edge, 0.27, 0.02, -0.27); g.add(tip);
  const diamond = M(new THREE.OctahedronGeometry(0.11, 0), ctx.glass, 0, -0.26, 0); diamond.scale.set(1, 1.5, 1); g.add(diamond);
  const frame = edgeFrame(new THREE.OctahedronGeometry(0.11, 0), 0.0035, ctx.edge, 10, true); frame.scale.set(1, 1.5, 1); frame.position.y = -0.26; g.add(frame);
  return (t) => { diamond.rotation.y = -t * 0.3; frame.rotation.y = -t * 0.3; };
};
BUILDERS.lenses = (ctx, g) => {
  const defs = [[0, 0, 0, 0.35, 0, 0], [0.19, 0.09, 0.13, 0.55, 0.35, 0.1], [-0.16, -0.07, 0.2, 0.2, -0.45, 0.3]];
  const discs = defs.map((d, i) => {
    const grp = new THREE.Group(); grp.position.set(d[0], d[1], d[2]); grp.rotation.set(d[3], d[4], d[5]); g.add(grp);
    const glass = M(new THREE.CylinderGeometry(0.255, 0.255, 0.03, 72), i === 1 ? ctx.glassSoft : ctx.glass); grp.add(glass);
    const rim = M(machinedRing(0.252, 0.278, 0.046, 0.006, 96), i === 2 ? ctx.chrome : ctx.body); grp.add(rim);
    const notches = new THREE.InstancedMesh(cached('notch', () => new THREE.BoxGeometry(0.008, 0.05, 0.012)), ctx.graphite, 24); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; p.set(Math.cos(a) * 0.279, 0, Math.sin(a) * 0.279); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); m4.compose(p, q, new THREE.Vector3(1, 1, 1)); notches.setMatrixAt(k, m4); }
    notches.instanceMatrix.needsUpdate = true; grp.add(notches);
    if (i === 0) { const inlay = M(new THREE.TorusGeometry(0.265, 0.003, 6, 120), ctx.edge, 0, 0.024, 0); inlay.rotation.x = Math.PI / 2; grp.add(inlay); }
    return grp;
  });
  return (t) => { discs[1].rotation.y = 0.35 + Math.sin(t * 0.4) * 0.12; discs[2].rotation.x = 0.2 + Math.sin(t * 0.33 + 1) * 0.1; };
};
BUILDERS.arm = (ctx, g) => {
  const base = M(latheFromProfile([[0, -0.03], [0.16, -0.03], [0.17, -0.02], [0.17, 0.0], [0.12, 0.01], [0.09, 0.03], [0.0, 0.03]], 48), ctx.body, 0, -0.42, 0); g.add(base);
  const column = M(bevelBox(0.09, 0.22, 0.09), ctx.graphite, 0, -0.28, 0); g.add(column);
  const shoulder = new THREE.Group(); shoulder.position.set(0, -0.16, 0); shoulder.rotation.z = -0.35; g.add(shoulder);
  shoulder.add(M(new THREE.CylinderGeometry(0.065, 0.065, 0.11, 24).rotateX(Math.PI / 2), ctx.chrome));
  const upper = M(bevelBox(0.07, 0.36, 0.06), ctx.body, 0, 0.18, 0); shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.set(0, 0.36, 0); elbow.rotation.z = 1.25; shoulder.add(elbow);
  elbow.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 24).rotateX(Math.PI / 2), ctx.chrome));
  const fore = M(bevelBox(0.055, 0.32, 0.05), ctx.body, 0, 0.16, 0); elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.set(0, 0.33, 0); wrist.rotation.z = -0.6; elbow.add(wrist);
  wrist.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16), ctx.chrome));
  wrist.add(M(bevelBox(0.02, 0.1, 0.03, 0.005), ctx.graphite, -0.035, 0.08, 0)); wrist.add(M(bevelBox(0.02, 0.1, 0.03, 0.005), ctx.graphite, 0.035, 0.08, 0));
  const cube = edgeFrame(new THREE.BoxGeometry(0.2, 0.2, 0.2), 0.0035, ctx.edge, 10, true); cube.position.set(0, 0.2, 0); wrist.add(cube);
  const screws = new THREE.InstancedMesh(cached('screw2', () => new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8).rotateX(Math.PI / 2)), ctx.chrome, 6); const m4 = new THREE.Matrix4();
  [[0.03, 0.08, 0.047], [-0.03, 0.08, 0.047], [0.03, 0.28, 0.047], [-0.03, 0.28, 0.047], [0, -0.22, 0.047], [0, -0.34, 0.047]].forEach((p, i) => { m4.makeTranslation(p[0], p[1] - 0.16, p[2]); screws.setMatrixAt(i, m4); });
  screws.instanceMatrix.needsUpdate = true; g.add(screws);
  return (t) => { shoulder.rotation.z = -0.35 + Math.sin(t * 0.5) * 0.08; elbow.rotation.z = 1.25 + Math.sin(t * 0.5 + 1.2) * 0.1; cube.rotation.y = t * 0.6; cube.rotation.x = t * 0.25; };
};
function lensPart(ctx, grp, r = 0.13) {
  grp.add(M(machinedRing(r, r + 0.022, 0.04, 0.005, 72), ctx.body));
  grp.add(M(new THREE.CylinderGeometry(r, r, 0.022, 64), ctx.glass));
  const inlay = M(new THREE.TorusGeometry(r + 0.012, 0.0025, 6, 96), ctx.edge, 0, 0.021, 0); inlay.rotation.x = Math.PI / 2; grp.add(inlay);
}
BUILDERS.shield = (ctx, g) => {
  const s = new THREE.Shape(); s.moveTo(-0.24, 0.2); s.lineTo(0.24, 0.2); s.lineTo(0.24, -0.02); s.quadraticCurveTo(0.22, -0.2, 0, -0.32); s.quadraticCurveTo(-0.22, -0.2, -0.24, -0.02); s.closePath();
  const shield = M(extrudeShape(s, 0.028, 0.008), ctx.body); g.add(shield);
  const inner = new THREE.Shape(); inner.moveTo(-0.2, 0.16); inner.lineTo(0.2, 0.16); inner.lineTo(0.2, -0.02); inner.quadraticCurveTo(0.18, -0.16, 0, -0.26); inner.quadraticCurveTo(-0.18, -0.16, -0.2, -0.02); inner.closePath();
  const groove = M(new THREE.ShapeGeometry(inner, 24), ctx.graphite, 0, 0, 0.0145); g.add(groove);
  const check = M(tubeAlong([[-0.08, -0.03, 0.03], [-0.02, -0.1, 0.03], [0.1, 0.08, 0.03]], 0.009, false, 24, false), ctx.edge); g.add(check);
  const lens = new THREE.Group(); lens.position.set(0.13, 0.12, 0.12); lens.rotation.set(Math.PI / 2 - 0.25, 0.2, 0); g.add(lens); lensPart(ctx, lens, 0.12);
  const handle = M(new THREE.CylinderGeometry(0.014, 0.018, 0.22, 16), ctx.chrome, 0.27, -0.07, 0.12); handle.rotation.z = 0.75; g.add(handle);
  const grip = M(bevelBox(0.03, 0.12, 0.03, 0.006), ctx.graphite, 0.35, -0.17, 0.12); grip.rotation.z = 0.75; g.add(grip);
  const rivets = new THREE.InstancedMesh(cached('rivet', () => new THREE.SphereGeometry(0.007, 8, 6)), ctx.chrome, 6); const m4 = new THREE.Matrix4();
  [[-0.2, 0.16], [0.2, 0.16], [-0.17, -0.06], [0.17, -0.06], [-0.08, -0.22], [0.08, -0.22]].forEach((p, i) => { m4.makeTranslation(p[0], p[1], 0.016); rivets.setMatrixAt(i, m4); });
  rivets.instanceMatrix.needsUpdate = true; g.add(rivets);
  return (t) => { lens.position.x = 0.13 + Math.sin(t * 0.45) * 0.03; };
};
BUILDERS.bag = (ctx, g) => {
  const frame = M(tubeAlong([[-0.2, 0.2, 0], [0.2, 0.2, 0], [0.22, 0.17, 0], [0.22, -0.2, 0], [0.19, -0.24, 0], [-0.19, -0.24, 0], [-0.22, -0.2, 0], [-0.22, 0.17, 0]], 0.012, true, 64, true), ctx.body); g.add(frame);
  const handle = M(tubeAlong([[-0.11, 0.2, 0], [-0.11, 0.3, 0], [-0.06, 0.36, 0], [0.06, 0.36, 0], [0.11, 0.3, 0], [0.11, 0.2, 0]], 0.009, false, 32, true), ctx.chrome); g.add(handle);
  const panel = M(bevelBox(0.38, 0.4, 0.012, 0.004), ctx.graphite, 0, -0.02, 0); g.add(panel);
  const lockBody = M(bevelBox(0.09, 0.07, 0.016, 0.004), ctx.body, 0, -0.06, 0.012); g.add(lockBody);
  const lockEdge = edgeFrame(bevelBox(0.09, 0.07, 0.016, 0.004), 0.0018, ctx.edge, 50, false); lockEdge.position.set(0, -0.06, 0.012); g.add(lockEdge);
  const shackle = M(new THREE.TorusGeometry(0.028, 0.006, 8, 24, Math.PI), ctx.chrome, 0, -0.025, 0.012); g.add(shackle);
  const keyhole = M(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 12).rotateX(Math.PI / 2), ctx.edge, 0, -0.06, 0.02); g.add(keyhole);
  const seam = M(bevelBox(0.3, 0.002, 0.004, 0.0005), ctx.chrome, 0, 0.12, 0.007); g.add(seam);
  return null;
};
function radarPart(ctx, g, opts) {
  const { dishR = 0.3, mastH = 0.5, grill = true } = opts;
  const prof = []; for (let i = 0; i <= 10; i++) { const r = (i / 10) * dishR; prof.push([r, 0.6 * r * r]); }
  const outer = prof.slice().reverse().map(([r, y]) => [r + (r > 0 ? 0.012 : 0.0), y - 0.012]);
  const dish = M(latheFromProfile([...prof, ...outer], 64, false), ctx.body); dish.geometry.computeVertexNormals();
  const dishGrp = new THREE.Group(); g.add(dishGrp); dishGrp.position.set(0, mastH - 0.12, 0); dishGrp.rotation.set(-0.95, 0, 0);
  dishGrp.add(dish);
  if (grill) for (let k = 1; k <= 3; k++) { const r = dishR * k / 3.3; const ring = M(new THREE.TorusGeometry(r, 0.003, 6, 72), ctx.chrome, 0, 0.6 * r * r + 0.004, 0); ring.rotation.x = Math.PI / 2; dishGrp.add(ring); }
  const rim = M(new THREE.TorusGeometry(dishR + 0.006, 0.0035, 6, 96), ctx.edge, 0, 0.6 * dishR * dishR - 0.004, 0); rim.rotation.x = Math.PI / 2; dishGrp.add(rim);
  const feedArm = M(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 10), ctx.chrome, 0, 0.13, 0); dishGrp.add(feedArm);
  const feed = M(new THREE.SphereGeometry(0.018, 14, 10), ctx.edge, 0, 0.27, 0); dishGrp.add(feed);
  const sweep = M(new THREE.TorusGeometry(dishR + 0.02, 0.003, 6, 48, 0.9), ctx.edge, 0, 0.6 * dishR * dishR + 0.02, 0); sweep.rotation.x = Math.PI / 2; dishGrp.add(sweep);
  const base = M(latheFromProfile([[0, -0.03], [0.11, -0.03], [0.12, -0.02], [0.12, 0.0], [0.07, 0.015], [0.0, 0.015]], 48), ctx.body, 0, -0.5, 0); g.add(base);
  const mast = M(new THREE.CylinderGeometry(0.022, 0.028, mastH, 20), ctx.graphite, 0, mastH / 2 - 0.5, 0); g.add(mast);
  for (let k = 0; k < 3; k++) g.add(M(machinedRing(0.022, 0.034, 0.014, 0.003, 32), ctx.chrome, 0, -0.5 + mastH * (0.25 + k * 0.28), 0));
  const knuckle = M(new THREE.SphereGeometry(0.045, 20, 14), ctx.chrome, 0, mastH - 0.5, 0); g.add(knuckle);
  const dishOffset = -0.5 + mastH; dishGrp.position.y = dishOffset + 0.02;
  return (t) => { sweep.rotation.z = t * 1.6; dishGrp.rotation.y = Math.sin(t * 0.25) * 0.6; };
}
BUILDERS.radar = (ctx, g) => radarPart(ctx, g, { dishR: 0.3, mastH: 0.56, grill: true });
BUILDERS.radar2 = (ctx, g) => radarPart(ctx, g, { dishR: 0.36, mastH: 0.46, grill: false });
BUILDERS.bars = (ctx, g) => {
  const heights = [0.16, 0.27, 0.22, 0.4, 0.54]; const bars = [];
  g.add(M(bevelBox(0.66, 0.02, 0.18, 0.006), ctx.body, 0, -0.33, 0));
  g.add(M(bevelBox(0.62, 0.004, 0.14, 0.001), ctx.chrome, 0, -0.318, 0));
  const pts = [];
  heights.forEach((h, i) => { const x = -0.26 + i * 0.13; const geo = new RoundedBoxGeometry(0.075, h, 0.075, 2, 0.008); geo.translate(0, h / 2, 0); const b = M(geo, ctx.glass, x, -0.32, 0); g.add(b); bars.push(b); pts.push([x, -0.32 + h + 0.07, 0]); });
  const line = M(tubeAlong(pts, 0.004, false, 48, true), ctx.edge); g.add(line);
  const nodes = new THREE.InstancedMesh(cached('node', () => new THREE.SphereGeometry(0.011, 10, 8)), ctx.edge, pts.length); const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); nodes.setMatrixAt(i, m4); }); nodes.instanceMatrix.needsUpdate = true; g.add(nodes);
  return (t) => { bars.forEach((b, i) => { b.scale.y = 1 + Math.sin(t * 0.6 + i * 0.9) * 0.035; }); };
};
BUILDERS.cone = (ctx, g) => {
  const cone = new THREE.Group(); cone.rotation.set(0, 0, -0.5); g.add(cone);
  cone.add(M(latheFromProfile([[0.03, -0.32], [0.05, -0.3], [0.05, -0.12], [0.2, 0.2], [0.21, 0.21], [0.21, 0.23], [0.19, 0.23], [0.045, -0.1], [0.04, -0.3]], 64), ctx.body));
  cone.add(M(machinedRing(0.2, 0.228, 0.03, 0.005, 96), ctx.chrome, 0, 0.225, 0));
  cone.add(M(bevelBox(0.05, 0.12, 0.04, 0.006), ctx.graphite, 0, -0.38, 0));
  const inlay = M(new THREE.TorusGeometry(0.205, 0.003, 6, 96), ctx.edge, 0, 0.24, 0); inlay.rotation.x = Math.PI / 2; cone.add(inlay);
  const rings = [0, 1, 2].map(() => { const r = M(new THREE.TorusGeometry(0.26, 0.0035, 6, 96), ctx.edge); r.rotation.x = Math.PI / 2; cone.add(r); return r; });
  return (t) => { rings.forEach((r, i) => { const p = ((t * 0.45 + i / 3) % 1); r.position.y = 0.26 + p * 0.5; const s = 0.9 + p * 1.1; r.scale.set(s, s, 1); r.visible = p < 0.92; }); };
};
BUILDERS.parcel = (ctx, g) => {
  g.add(M(bevelBox(0.42, 0.3, 0.3, 0.01), ctx.body, 0, -0.1, 0));
  const flap = (w, d, x, z, ry, rx) => { const geo = new RoundedBoxGeometry(w, 0.014, d, 2, 0.004); geo.translate(0, 0, -d / 2); const f = M(geo, ctx.body, x, 0.053, z); f.rotation.set(rx, ry, 0, 'YXZ'); g.add(f); return f; };
  flap(0.42, 0.15, 0, 0.15, 0, 1.95); flap(0.42, 0.15, 0, -0.15, Math.PI, 1.95); flap(0.3, 0.21, 0.21, 0, Math.PI / 2, 2.2); flap(0.3, 0.21, -0.21, 0, -Math.PI / 2, 2.2);
  const seam = M(bevelBox(0.38, 0.004, 0.012, 0.001), ctx.edge, 0, 0.05, 0); g.add(seam);
  const inner = M(new THREE.PlaneGeometry(0.38, 0.26), (() => { const m = makeEmissiveMaterial(); m.emissiveNode = ctx.edge.emissiveNode.mul(0.25); return m; })(), 0, 0.04, 0); inner.rotation.x = -Math.PI / 2; g.add(inner);
  g.add(M(bevelBox(0.03, 0.3, 0.302, 0.002), ctx.chrome, 0.0, -0.1, 0));
  g.add(M(bevelBox(0.422, 0.012, 0.302, 0.002), ctx.graphite, 0, -0.245, 0));
  return null;
};
BUILDERS.calendar = (ctx, g) => {
  g.add(M(bevelBox(0.5, 0.56, 0.03, 0.008), ctx.graphite, 0, -0.03, 0));
  g.add(M(bevelBox(0.5, 0.09, 0.036, 0.008), ctx.body, 0, 0.21, 0));
  g.add(M(bevelBox(0.46, 0.003, 0.004, 0.0005), ctx.edge, 0, 0.162, 0.018));
  [-0.15, 0.15].forEach((x) => { const r = M(new THREE.TorusGeometry(0.03, 0.006, 8, 24), ctx.chrome, x, 0.27, 0); g.add(r); });
  const cells = new THREE.InstancedMesh(bevelBox(0.058, 0.055, 0.012, 0.004), ctx.body, 35); const m4 = new THREE.Matrix4();
  let k = 0; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { m4.makeTranslation(-0.21 + c * 0.07, 0.1 - r * 0.075, 0.02); cells.setMatrixAt(k++, m4); }
  cells.instanceMatrix.needsUpdate = true; g.add(cells);
  const today = edgeFrame(bevelBox(0.058, 0.055, 0.012, 0.004), 0.0018, ctx.edge, 50, false); today.position.set(-0.21 + 3 * 0.07, 0.1 - 2 * 0.075, 0.02); g.add(today);
  const dot = M(new THREE.SphereGeometry(0.008, 10, 8), ctx.edge, -0.21 + 5 * 0.07, 0.1 - 1 * 0.075, 0.03); g.add(dot);
  return null;
};
BUILDERS.book = (ctx, g) => {
  const left = new THREE.Group(); left.rotation.z = 0.2; left.position.set(-0.01, -0.2, 0); g.add(left);
  const right = new THREE.Group(); right.rotation.z = -0.2; right.position.set(0.01, -0.2, 0); g.add(right);
  const coverGeo = new RoundedBoxGeometry(0.3, 0.02, 0.42, 2, 0.006); coverGeo.translate(0.15, 0, 0);
  const pagesGeo = new RoundedBoxGeometry(0.28, 0.035, 0.4, 2, 0.004); pagesGeo.translate(0.14, 0.027, 0);
  left.add(M(coverGeo, ctx.body)); left.scale.x = -1; left.add(M(pagesGeo, ctx.graphite));
  right.add(M(coverGeo, ctx.body)); right.add(M(pagesGeo, ctx.graphite));
  g.add(M(bevelBox(0.03, 0.03, 0.42, 0.004), ctx.chrome, 0, -0.2, 0));
  g.add(M(bevelBox(0.004, 0.004, 0.38, 0.001), ctx.edge, 0, -0.17, 0));
  const layers = [0, 1, 2].map((i) => { const l = M(bevelBox(0.24, 0.005, 0.34, 0.002), ctx.glassSoft, 0.17, -0.02 + i * 0.09, 0); l.rotation.set(0, i * 0.15, -0.15 + i * 0.04); g.add(l); return l; });
  const lines = new THREE.InstancedMesh(cached('line', () => new THREE.BoxGeometry(0.14, 0.002, 0.006)), ctx.graphite, 9); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 9; i++) { m4.makeTranslation(0.17, -0.016 + Math.floor(i / 3) * 0.09, -0.08 + (i % 3) * 0.08); lines.setMatrixAt(i, m4); } lines.instanceMatrix.needsUpdate = true; g.add(lines);
  return (t) => { layers.forEach((l, i) => { l.position.y = -0.02 + i * 0.09 + Math.sin(t * 0.7 + i) * 0.012; l.rotation.y = i * 0.15 + Math.sin(t * 0.3 + i) * 0.06; }); };
};
BUILDERS.lenscheck = (ctx, g) => {
  const lens = new THREE.Group(); lens.rotation.set(Math.PI / 2 - 0.15, 0, 0.1); lens.position.set(-0.05, 0.08, 0); g.add(lens); lensPart(ctx, lens, 0.24);
  const ticks = new THREE.InstancedMesh(cached('tick2', () => new THREE.BoxGeometry(0.006, 0.05, 0.014)), ctx.graphite, 16); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.set(Math.cos(a) * 0.263, 0, Math.sin(a) * 0.263); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); m4.compose(p, q, new THREE.Vector3(1, 1, 1)); ticks.setMatrixAt(k, m4); }
  ticks.instanceMatrix.needsUpdate = true; lens.add(ticks);
  const check = M(tubeAlong([[-0.1, -0.02, 0.03], [-0.03, -0.1, 0.03], [0.12, 0.1, 0.03]], 0.012, false, 24, false), ctx.edge); check.position.set(0, 0.0, 0.0); lens.add(check); check.rotation.x = -Math.PI / 2 + 0.0;
  const handle = M(new THREE.CylinderGeometry(0.02, 0.026, 0.34, 16), ctx.chrome, 0.26, -0.24, 0); handle.rotation.z = 0.8; g.add(handle);
  g.add(M(bevelBox(0.04, 0.14, 0.04, 0.008), ctx.body, 0.37, -0.36, 0)).rotation.z = 0.8;
  g.add(M(machinedRing(0.02, 0.03, 0.02, 0.003, 24), ctx.body, 0.16, -0.13, 0)).rotation.z = 0.8;
  return null;
};
BUILDERS.pen = (ctx, g) => {
  const pen = new THREE.Group(); pen.rotation.set(0, 0, -0.62); g.add(pen);
  pen.add(M(latheFromProfile([[0, 0.5], [0.03, 0.5], [0.046, 0.47], [0.046, 0.2], [0.043, 0.18], [0.0, 0.18]], 40), ctx.body));
  pen.add(M(machinedRing(0.044, 0.049, 0.02, 0.003, 40), ctx.chrome, 0, 0.21, 0));
  pen.add(M(bevelBox(0.012, 0.22, 0.016, 0.004), ctx.chrome, 0.05, 0.36, 0));
  pen.add(M(latheFromProfile([[0, 0.18], [0.042, 0.18], [0.042, -0.12], [0.036, -0.14], [0.0, -0.14]], 40), ctx.graphite));
  pen.add(M(latheFromProfile([[0, -0.14], [0.036, -0.14], [0.03, -0.24], [0.0, -0.24]], 40), ctx.chrome));
  const nib = M(extrudeShape(polyShape([[-0.03, 0.0], [0.03, 0.0], [0.012, -0.12], [0.0, -0.14], [-0.012, -0.12]]), 0.006, 0.0015, 6), ctx.chrome, 0, -0.24, 0); pen.add(nib);
  pen.add(M(bevelBox(0.0025, 0.08, 0.008, 0.0005), ctx.edge, 0, -0.33, 0.0));
  pen.add(M(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10).rotateX(Math.PI / 2), ctx.graphite, 0, -0.29, 0));
  pen.add(M(new THREE.TorusGeometry(0.047, 0.0025, 6, 48), ctx.edge, 0, 0.47, 0)).rotation.x = Math.PI / 2;
  return (t) => { pen.rotation.z = -0.62 + Math.sin(t * 0.5) * 0.04; pen.position.y = Math.sin(t * 0.8) * 0.015; };
};
BUILDERS.cards = (ctx, g) => {
  const cards = [0, 1, 2, 3, 4].map((i) => { const c = M(bevelBox(0.44, 0.28, 0.008, 0.004), i === 4 ? ctx.glass : ctx.glassSoft, 0, -0.14 + i * 0.07, 0); c.rotation.set(-Math.PI / 2 + 0.25, i * 0.14 - 0.28, 0, 'YXZ'); g.add(c); return c; });
  const top = edgeFrame(bevelBox(0.44, 0.28, 0.008, 0.004), 0.0022, ctx.edge, 50, false); top.rotation.copy(cards[4].rotation); top.position.copy(cards[4].position); g.add(top);
  const tab = M(bevelBox(0.1, 0.003, 0.012, 0.001), ctx.chrome, 0.1, 0.14, 0.14); tab.rotation.copy(cards[4].rotation); g.add(tab);
  const lines = new THREE.InstancedMesh(cached('line2', () => new THREE.BoxGeometry(0.2, 0.0015, 0.004)), ctx.graphite, 6); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) { m4.makeTranslation(-0.06 + (i % 2) * 0.02, -0.14 + Math.floor(i / 2) * 0.07 + 0.006, -0.03 + (i % 3) * 0.03); lines.setMatrixAt(i, m4); } lines.instanceMatrix.needsUpdate = true; g.add(lines);
  return (t) => { cards.forEach((c, i) => { c.rotation.y = i * 0.14 - 0.28 + Math.sin(t * 0.35 + i * 0.7) * 0.04; }); top.rotation.copy(cards[4].rotation); };
};
BUILDERS.screen = (ctx, g) => {
  const scr = new THREE.Group(); scr.rotation.set(-0.08, 0.3, 0); scr.position.y = 0.06; g.add(scr);
  [[0, 0.17, 0.56, 0.018], [0, -0.17, 0.56, 0.018], [-0.27, 0, 0.018, 0.34], [0.27, 0, 0.018, 0.34]].forEach((b) => scr.add(M(bevelBox(b[2], b[3], 0.03, 0.005), ctx.body, b[0], b[1], 0)));
  scr.add(M(bevelBox(0.53, 0.32, 0.012, 0.003), ctx.glassSoft));
  scr.add(M(bevelBox(0.5, 0.29, 0.004, 0.001), ctx.graphite, 0, 0, -0.006));
  const tri = extrudeShape(polyShape([[-0.05, -0.065], [-0.05, 0.065], [0.065, 0]]), 0.012, 0.003, 4);
  scr.add(M(tri, ctx.body, 0.01, 0, 0.012)); const triEdge = edgeFrame(tri, 0.003, ctx.edge, 20, true); triEdge.position.set(0.01, 0, 0.012); scr.add(triEdge);
  scr.add(M(bevelBox(0.3, 0.0025, 0.004, 0.0005), ctx.edge, 0, -0.12, 0.012));
  scr.add(M(bevelBox(0.09, 0.0025, 0.004, 0.0005), ctx.chrome, -0.105, -0.12, 0.013));
  g.add(M(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 12), ctx.chrome, 0, -0.19, 0));
  g.add(M(bevelBox(0.26, 0.014, 0.12, 0.004), ctx.body, 0, -0.28, 0));
  return null;
};
BUILDERS.chart = (ctx, g) => {
  g.add(M(bevelBox(0.62, 0.02, 0.2, 0.006), ctx.body, 0, -0.33, 0));
  [0.12, 0.3, 0.2, 0.42].forEach((h, i) => { const geo = new RoundedBoxGeometry(0.085, h, 0.085, 2, 0.008); geo.translate(0, h / 2, 0); g.add(M(geo, i === 3 ? ctx.chrome : ctx.body, -0.21 + i * 0.14, -0.32, 0)); });
  const sigma = M(tubeAlong([[0.12, 0.34, -0.06], [-0.1, 0.34, -0.06], [0.02, 0.17, -0.06], [-0.1, 0.0, -0.06], [0.12, 0.0, -0.06]], 0.009, false, 32, false), ctx.edge); sigma.position.set(0.0, 0.0, -0.08); g.add(sigma);
  const ticks = new THREE.InstancedMesh(cached('tick3', () => new THREE.BoxGeometry(0.02, 0.002, 0.004)), ctx.chrome, 6); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) { m4.makeTranslation(-0.3, -0.3 + i * 0.09, 0.1); ticks.setMatrixAt(i, m4); } ticks.instanceMatrix.needsUpdate = true; g.add(ticks);
  g.add(M(bevelBox(0.004, 0.5, 0.004, 0.001), ctx.chrome, -0.3, -0.07, 0.1));
  return null;
};
BUILDERS.quill = (ctx, g) => {
  const q = new THREE.Group(); q.rotation.set(0.3, 0.6, -0.6); q.position.set(0.04, 0.12, 0); g.add(q);
  const vane = new THREE.Shape(); vane.moveTo(0.0, -0.12); vane.quadraticCurveTo(0.2, 0.12, 0.09, 0.56); vane.quadraticCurveTo(0.02, 0.66, -0.03, 0.62); vane.quadraticCurveTo(-0.15, 0.3, -0.02, -0.12); vane.closePath();
  const vaneMesh = M(extrudeShape(vane, 0.022, 0.006, 18), ctx.chrome); q.add(vaneMesh);
  q.add(M(tubeAlong([[0.0, -0.5, 0], [0.0, -0.12, 0], [0.02, 0.25, 0.0], [0.04, 0.62, 0.0]], 0.011, false, 32, true), ctx.chrome));
  const barbs = new THREE.InstancedMesh(cached('barb', () => new THREE.BoxGeometry(0.1, 0.0016, 0.004)), ctx.graphite, 28); const m4 = new THREE.Matrix4(), e = new THREE.Euler(), qq = new THREE.Quaternion();
  for (let i = 0; i < 28; i++) { const k = i % 14; const y = -0.06 + k * 0.045; const side = i < 14 ? 1 : -1; e.set(0, 0, side * 0.75); qq.setFromEuler(e); m4.compose(new THREE.Vector3(side * (0.035 + k * 0.004), y, 0.0055), qq, new THREE.Vector3(1 - k * 0.03, 1, 1)); barbs.setMatrixAt(i, m4); }
  barbs.instanceMatrix.needsUpdate = true; q.add(barbs);
  q.add(M(new THREE.TorusGeometry(0.016, 0.004, 6, 24), ctx.chrome, 0.0, -0.3, 0));
  const nib = M(extrudeShape(polyShape([[-0.018, 0], [0.018, 0], [0.005, -0.09], [0, -0.1], [-0.005, -0.09]]), 0.005, 0.001, 4), ctx.chrome, 0, -0.5, 0); q.add(nib);
  q.add(M(bevelBox(0.002, 0.05, 0.007, 0.0005), ctx.edge, 0, -0.55, 0.0));
  const inkMat = ctx.edge.clone(); const uDraw = uniform(0);
  inkMat.emissiveNode = ctx.edge.emissiveNode.mul(smoothstep(uDraw.sub(0.04), uDraw, uv().x).oneMinus()).mul(smoothstep(0.0, 0.05, uv().x)).mul(1.4);
  inkMat.transparent = true; inkMat.opacityNode = smoothstep(uDraw.sub(0.04), uDraw, uv().x).oneMinus();
  const ink = M(tubeAlong([[-0.3, -0.38, 0.28], [-0.14, -0.38, 0.16], [0.0, -0.38, 0.26], [0.12, -0.38, 0.12], [0.26, -0.38, 0.2], [0.36, -0.38, 0.08]], 0.0045, false, 64, true), inkMat); g.add(ink);
  return (t) => { const c = (t * 0.12) % 1; uDraw.value = c < 0.7 ? easeInOutCubic(c / 0.7) : 1 - seg(c, 0.85, 1.0); q.rotation.z = -0.6 + Math.sin(t * 0.6) * 0.03; };
};

/* ------------------------------------------------------------------ construction des agents */
const agents = []; const agentsById = {};
function placeAgents() {
  const perEco = {};
  AGENT_DEFS.forEach((d) => { (perEco[d.eco] = perEco[d.eco] || []).push(d); });
  const positions = {};
  ECOSYSTEMS.forEach((eco) => {
    const list = perEco[eco.id]; const leader = list.find((d) => d.leader); const others = list.filter((d) => !d.leader);
    positions[leader.id] = eco.center.clone().add(new THREE.Vector3(0, 0.75, 0));
    const n = others.length; const toCore = new THREE.Vector3().subVectors(CORE_POS, eco.center).setY(0).normalize();
    others.forEach((d, i) => {
      const a = (i / n) * Math.PI * 2 + 0.35 + Math.atan2(toCore.x, toCore.z);
      const rr = eco.radius * (0.86 + 0.26 * ((i * 5) % 3) / 2);
      const y = eco.center.y + Math.sin(i * 2.3 + 0.7) * 0.7 + ((i % 2) ? 0.25 : -0.25);
      positions[d.id] = new THREE.Vector3(eco.center.x + Math.sin(a) * rr, y, eco.center.z + Math.cos(a) * rr);
    });
  });
  return positions;
}
const AGENT_POS = placeAgents();

AGENT_DEFS.forEach((def, index) => {
  const eco = ECO[def.eco]; const g = new THREE.Group(); g.position.copy(AGENT_POS[def.id]); scene.add(g);
  const inner = new THREE.Group(); g.add(inner);
  const u = { edge: uniform(0.0), edgeColor: uniform(eco.color.clone()), status: uniform(0.6), statusColor: uniform(eco.color.clone()), progress: uniform(0), working: uniform(0), waiting: uniform(0), reveal: uniform(0) };
  const edgeMat = makeEmissiveMaterial(); edgeMat.emissiveNode = u.edgeColor.mul(u.edge);
  const ctx = { body: matTitanium, graphite: matGraphite, chrome: matChrome, glass: matGlass, glassSoft: matGlassSoft, edge: edgeMat, color: eco.color };
  const anim = BUILDERS[def.kind](ctx, inner) || null;
  // point de statut : marqueur permanent
  const statusMat = makeEmissiveMaterial(); statusMat.emissiveNode = u.statusColor.mul(u.status);
  const status = M(new THREE.SphereGeometry(0.02, 14, 10), statusMat, 0.62, 0.58, 0); g.add(status);
  // anneau de progression (fin) et anneau d'attente ambré
  const ringGeo = cached('agentring', () => new THREE.TorusGeometry(0.5, 0.0024, 6, 160));
  const progMat = makeEmissiveMaterial({ transparent: true, depthWrite: true }); progMat.blending = THREE.AdditiveBlending;
  { const ang = atan(positionLocal.y, positionLocal.x).div(PI2).add(0.5); const mask = step(ang, u.progress); progMat.emissiveNode = u.edgeColor.mul(mask).mul(u.working).mul(1.1).add(u.edgeColor.mul(u.working).mul(0.05)); progMat.opacityNode = u.working.clamp(0, 1); }
  const progRing = M(ringGeo, progMat); progRing.rotation.x = -Math.PI / 2; progRing.rotation.z = Math.PI / 2; g.add(progRing);
  const waitMat = makeEmissiveMaterial({ transparent: true, depthWrite: true }); waitMat.blending = THREE.AdditiveBlending;
  { const pulse = sin(uTime.mul(1.3).add(float(index))).mul(0.5).add(0.5).pow(2).mul(0.7).add(0.3); waitMat.emissiveNode = vec3(1.0, 0.68, 0.3).mul(u.waiting).mul(pulse).mul(1.1); waitMat.opacityNode = u.waiting.clamp(0, 1); }
  const waitRing = M(cached('waitring', () => new THREE.TorusGeometry(0.56, 0.0022, 6, 160)), waitMat); waitRing.rotation.x = -Math.PI / 2; g.add(waitRing);
  const agent = { def, data: agentById(def.id), eco, group: g, inner, u, anim, edgeMat, status, progRing, waitRing, index, pos: g.position.clone(), spin: 0.08 + rng() * 0.08, phase: rng() * 6.28, glow: 0, revealAt: 0, scale: 1 };
  agents.push(agent); agentsById[def.id] = agent;
});

export { BUILDERS, agents, agentsById, AGENT_POS };
