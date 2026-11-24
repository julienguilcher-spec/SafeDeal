/* Kit monuments — scintillement : nuage de points lumineux clignotant au hasard (un seul appel de dessin). */
import * as THREE from 'three';

const VERT = `
attribute float phase;
uniform float uTime;
uniform float uAmount;
uniform float uSize;
varying float vOn;
void main() {
  float t = floor(uTime * 11.0 + phase * 53.0);
  float r = fract(sin(t * 12.9898 + phase * 78.233) * 43758.5453);
  vOn = step(0.82, r) * uAmount;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vOn > 0.0 ? clamp(uSize * 520.0 / max(1.0, -mv.z), 2.4, 10.0) : 0.0;
}`;
const FRAG = `
varying float vOn;
void main() {
  if (vOn <= 0.0) discard;
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.08, d);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 2.4, a * vOn);
}`;

/** Crée le nuage de points scintillants (positions [x, y, z, …] dans le repère du monument). Invisible au départ. */
export function sparklePoints(positions: number[], size = 1): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const n = positions.length / 3;
  const phase = new Float32Array(n);
  let s = 12345;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; phase[i] = (s >>> 0) / 4294967296; }
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uSize: { value: size } },
  });
  m.name = 'scintillement';
  const p = new THREE.Points(g, m);
  p.name = 'scintillement';
  p.visible = false;
  p.frustumCulled = true;
  p.renderOrder = 3;
  p.userData.ownMaterial = m;
  return p;
}

/** Règle l'intensité (0..1) et l'horloge du scintillement ; masque l'objet quand il est éteint. */
export function updateSparkle(points: THREE.Points, time: number, amount: number): void {
  const m = points.material as THREE.ShaderMaterial;
  points.visible = amount > 0.01;
  m.uniforms.uTime.value = time;
  m.uniforms.uAmount.value = amount;
}
