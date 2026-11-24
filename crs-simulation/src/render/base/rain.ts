/* =====================================================================================
 * Pluie : des traits instanciés dans un volume qui suit la caméra. Aucun calcul par goutte côté
 * CPU : chaque trait a une position de départ aléatoire ; le vertex shader lui ajoute la chute
 * cumulée (vent compris) et replie le tout dans le volume autour de la caméra. Les gouttes sont
 * donc fixes dans le monde quand on se déplace, et inclinées par le vent.
 * ===================================================================================== */

import * as THREE from 'three';
import type { QualityPreset } from './quality';
import { clamp01 } from './util';

const VERTEX = /* glsl */ `
attribute vec3 aSeed;
attribute float aRand;
uniform vec3 uBox;
uniform vec3 uOffset;
uniform float uExtra;
uniform vec3 uCam;
uniform vec3 uStreak;
uniform float uWidth;
varying float vAlpha;
varying float vAcross;
void main() {
  // position de la goutte, repliée dans le volume centré sur la caméra
  vec3 p = aSeed * uBox + uOffset;
  // quatre classes de vitesse : le repli de uExtra (période 4 × hauteur) reste invisible
  p.y -= floor( aRand * 4.0 ) * 0.25 * uExtra;
  vec3 rel = mod( p - uCam, uBox ) - 0.5 * uBox;
  // trait étiré le long de la vitesse de chute, face à la caméra
  float len = 0.6 + 0.7 * aRand;
  vec3 center = rel + uStreak * ( position.y * len );
  vec3 axis = normalize( uStreak );
  vec3 sideDir = normalize( cross( axis, normalize( center ) ) );
  float dist = length( center );
  float halfWidth = max( uWidth, dist * 0.0009 );
  vec3 world = uCam + center + sideDir * ( position.x * halfWidth );
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
  vAcross = position.x;
  // fondu de près (pas de goutte collée à l'objectif), de loin et aux bords du volume
  float edge = 0.5 * min( uBox.x, uBox.z );
  vAlpha = smoothstep( 0.8, 3.0, dist ) * ( 1.0 - smoothstep( edge * 0.6, edge, length( rel.xz ) ) ) * ( 0.45 + 0.55 * aRand );
  vAlpha *= 1.0 - abs( position.y ) * 0.6;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vAcross;
void main() {
  float a = vAlpha * uOpacity * ( 1.0 - vAcross * vAcross );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly u: Record<string, THREE.IUniform>;
  private max = 0;
  private radius = 12;
  private readonly height = 11;
  /** Chute cumulée, repliée dans le volume (m). */
  private offX = 0;
  private offY = 0;
  private offZ = 0;
  private extra = 0;
  /** Nombre de traits dessinés à la dernière image. */
  drawn = 0;

  constructor(preset: QualityPreset) {
    this.u = {
      uBox: { value: new THREE.Vector3(24, this.height, 24) },
      uOffset: { value: new THREE.Vector3() },
      uExtra: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uStreak: { value: new THREE.Vector3(0, -1, 0) },
      uWidth: { value: 0.0034 },
      uColor: { value: new THREE.Vector3(0.7, 0.75, 0.8) },
      uOpacity: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'pluie',
      uniforms: this.u,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.geometry = new THREE.InstancedBufferGeometry();
    // un quadrilatère : x = travers (-1..1), y = long du trait (-0,5..0,5)
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0,
    ]), 3));
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'pluie';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.setQuality(preset);
  }

  /** (Re)crée les attributs d'instance pour le nombre de traits du préréglage. */
  setQuality(preset: QualityPreset): void {
    if (preset.rainCount === this.max && preset.rainRadius === this.radius) return;
    this.max = preset.rainCount;
    this.radius = preset.rainRadius;
    const seeds = new Float32Array(this.max * 3);
    const rands = new Float32Array(this.max);
    // suite déterministe à faible discrépance : répartition régulière quel que soit le nombre affiché
    let s = 0x9e3779b9;
    const next = (): number => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < this.max; i++) {
      seeds[i * 3] = next();
      seeds[i * 3 + 1] = next();
      seeds[i * 3 + 2] = next();
      rands[i] = next();
    }
    this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    this.geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 1));
    (this.u['uBox']!.value as THREE.Vector3).set(this.radius * 2, this.height, this.radius * 2);
    this.geometry.instanceCount = 0;
  }

  /**
   * Met la pluie à jour. `rain` : intensité 0..1 ; `windX/Z` : vent (m/s) ; `brightness` : luminosité
   * ambiante 0..1 (les gouttes sont plus claires de jour) ; caméra en repère monde.
   */
  update(dt: number, rain: number, windX: number, windZ: number, camX: number, camY: number, camZ: number, brightness: number): void {
    const r = clamp01(rain);
    if (r < 0.01 || this.max === 0) {
      this.mesh.visible = false;
      this.drawn = 0;
      return;
    }
    const u = this.u;
    // la pluie fine tombe plus lentement que l'averse
    const fall = 6.5 + 3.5 * r;
    const box = u['uBox']!.value as THREE.Vector3;
    this.offX = wrap(this.offX + windX * dt, box.x);
    this.offY = wrap(this.offY - fall * dt, box.y);
    this.offZ = wrap(this.offZ + windZ * dt, box.z);
    this.extra = wrap(this.extra + fall * 0.35 * dt, box.y * 4);
    (u['uOffset']!.value as THREE.Vector3).set(this.offX, this.offY, this.offZ);
    u['uExtra']!.value = this.extra;
    (u['uCam']!.value as THREE.Vector3).set(camX, camY, camZ);
    // longueur du trait : le filé d'une pose de ~1/25 s
    const streak = 0.03;
    (u['uStreak']!.value as THREE.Vector3).set(windX * streak, -fall * streak, windZ * streak);
    const b = 0.16 + 0.62 * clamp01(brightness);
    (u['uColor']!.value as THREE.Vector3).set(b * 0.92, b * 0.96, b);
    u['uOpacity']!.value = 0.3 + 0.25 * r;
    const count = Math.min(this.max, Math.round(this.max * (0.12 + 0.88 * Math.pow(r, 0.85))));
    this.geometry.instanceCount = count;
    this.drawn = count;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function wrap(v: number, period: number): number {
  return v - Math.floor(v / period) * period;
}
