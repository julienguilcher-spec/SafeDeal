/* =====================================================================================
 * RENDU DU DÉCOR — halos et taches de lumière à coût fixe.
 *
 * Un seul maillage instancié, additif, pour toutes les sources du module : halo des lanternes
 * (panneau face à la caméra, taille apparente minimale pour rester visible au loin), tache de lumière
 * au sol (quad horizontal qui épouse la pente), feux tricolores, caissons lumineux, lueur des feux.
 * L'allumage (éclairage public, nuit, cycle des feux, vacillement) est calculé par le shader à partir
 * des mêmes uniformes que le matériau du décor : aucune mise à jour par image côté JavaScript.
 * ===================================================================================== */

import * as THREE from 'three';
import { GATE_GLSL } from './material';
import type { PropUniforms } from './material';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;   // x : rayon (m), y : pente en x, z : condition d'allumage, w : phase
attribute vec4 iColor;  // rgb : couleur × intensité, a : 0 = halo, 1 = tache au sol (pente en z dans a - 1)
uniform float uPTime;
uniform float uPNight;
uniform float uPLamps;
uniform float uPixel;
varying vec2 vQ;
varying vec3 vCol;
varying float vGround;
#include <fog_pars_vertex>
${GATE_GLSL}
void main() {
  vec2 g = crsGate( floor( iData.z + 0.5 ), iData.w );
  float on = g.x + g.y;
  vCol = iColor.rgb * on;
  vQ = position.xy;
  vec4 mvPosition;
  if ( iColor.a < 0.5 ) {
    vGround = 0.0;
    mvPosition = viewMatrix * vec4( iPos, 1.0 );
    float d = max( 0.1, -mvPosition.z );
    // au moins ~1,5 pixel de rayon : une lanterne lointaine reste un point lumineux
    float s = max( iData.x, d * uPixel * 1.5 );
    vCol *= max( 0.35, iData.x / s );
    mvPosition.xy += position.xy * s;
  } else {
    vGround = 1.0;
    vec3 p = iPos + vec3( position.x, 0.0, position.y ) * iData.x;
    p.y += ( position.x * iData.y + position.y * ( iColor.a - 2.0 ) ) * iData.x + 0.035;
    mvPosition = viewMatrix * vec4( p, 1.0 );
  }
  // éteint : hors du champ, aucun fragment
  if ( on < 0.004 ) mvPosition = vec4( 0.0, 0.0, 10.0, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
varying vec2 vQ;
varying vec3 vCol;
varying float vGround;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length( vQ );
  if ( r >= 1.0 ) discard;
  float a = vGround > 0.5
    ? pow( 1.0 - r, 1.6 )
    : exp( -r * r * 9.0 ) + 0.2 * ( 1.0 - r ) * ( 1.0 - r );
  vec3 c = vCol * a;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    c *= 1.0 - fogFactor * ( vGround > 0.5 ? 1.0 : 0.8 );
  #endif
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Lot de halos : ajout et retrait en temps constant, tampons agrandis par doublement. */
export class HaloBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private data: Float32Array;
  private color: Float32Array;
  private aPos!: THREE.InstancedBufferAttribute;
  private aData!: THREE.InstancedBufferAttribute;
  private aColor!: THREE.InstancedBufferAttribute;
  private cap: number;
  private n = 0;
  /** Poignée → emplacement, emplacement → poignée. */
  private slotOf: number[] = [];
  private handleAt: number[] = [];
  private freeHandles: number[] = [];
  private dirtyFrom = Infinity;
  private dirtyTo = -1;
  private readonly uPixel = { value: 0.001 };
  private readonly material: THREE.ShaderMaterial;
  private readonly tmp = new THREE.Color();

  constructor(u: PropUniforms, capacity = 512) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * 4);
    this.color = new Float32Array(capacity * 4);
    this.material = new THREE.ShaderMaterial({
      name: 'decor-halos',
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      fog: true,
    });
    const un = this.material.uniforms;
    un['uPTime'] = u.uPTime;
    un['uPNight'] = u.uPNight;
    un['uPLamps'] = u.uPLamps;
    un['uPixel'] = this.uPixel;
    this.geo = this.makeGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.name = 'decor-halos';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.matrixAutoUpdate = false;
  }

  get count(): number {
    return this.n;
  }

  private makeGeometry(): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.aData = new THREE.InstancedBufferAttribute(this.data, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.color, 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData.setUsage(THREE.DynamicDrawUsage);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = this.n;
    return geo;
  }

  private grow(): void {
    this.cap *= 2;
    const pos = new Float32Array(this.cap * 3);
    pos.set(this.pos);
    this.pos = pos;
    const data = new Float32Array(this.cap * 4);
    data.set(this.data);
    this.data = data;
    const color = new Float32Array(this.cap * 4);
    color.set(this.color);
    this.color = color;
    this.geo.dispose();
    this.geo = this.makeGeometry();
    this.mesh.geometry = this.geo;
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  private touch(slot: number): void {
    if (slot < this.dirtyFrom) this.dirtyFrom = slot;
    if (slot > this.dirtyTo) this.dirtyTo = slot;
  }

  /**
   * Ajoute un halo (ground = false) ou une tache au sol (ground = true ; slopeX, slopeZ : pente du terrain).
   * `color` 0xRRGGBB sRGB, `intensity` en unités de luminance avant tone mapping. Retourne une poignée.
   */
  add(
    x: number, y: number, z: number, radius: number, color: number, intensity: number, gate: number, phase: number,
    ground: boolean, slopeX = 0, slopeZ = 0,
  ): number {
    if (this.n >= this.cap) this.grow();
    const s = this.n++;
    const h = this.freeHandles.length > 0 ? this.freeHandles.pop()! : this.slotOf.length;
    this.slotOf[h] = s;
    this.handleAt[s] = h;
    this.pos[s * 3] = x;
    this.pos[s * 3 + 1] = y;
    this.pos[s * 3 + 2] = z;
    this.data[s * 4] = radius;
    this.data[s * 4 + 1] = slopeX;
    this.data[s * 4 + 2] = gate;
    this.data[s * 4 + 3] = phase;
    const c = this.tmp.setHex(color);
    this.color[s * 4] = c.r * intensity;
    this.color[s * 4 + 1] = c.g * intensity;
    this.color[s * 4 + 2] = c.b * intensity;
    this.color[s * 4 + 3] = ground ? 2 + Math.max(-0.9, Math.min(0.9, slopeZ)) : 0;
    this.touch(s);
    this.geo.instanceCount = this.n;
    return h;
  }

  remove(handle: number): void {
    const s = this.slotOf[handle];
    if (s === undefined || s < 0) return;
    const last = this.n - 1;
    if (s !== last) {
      this.pos.copyWithin(s * 3, last * 3, last * 3 + 3);
      this.data.copyWithin(s * 4, last * 4, last * 4 + 4);
      this.color.copyWithin(s * 4, last * 4, last * 4 + 4);
      const moved = this.handleAt[last]!;
      this.handleAt[s] = moved;
      this.slotOf[moved] = s;
      this.touch(s);
    }
    this.slotOf[handle] = -1;
    this.freeHandles.push(handle);
    this.n = last;
    this.geo.instanceCount = this.n;
  }

  clear(): void {
    this.n = 0;
    this.slotOf.length = 0;
    this.handleAt.length = 0;
    this.freeHandles.length = 0;
    this.geo.instanceCount = 0;
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  /** À appeler une fois par image : envoie les instances modifiées et règle la taille d'un pixel. */
  flush(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.uPixel.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
    this.mesh.visible = this.n > 0;
    if (this.dirtyTo < this.dirtyFrom) return;
    const from = this.dirtyFrom, count = Math.min(this.n, this.dirtyTo + 1) - from;
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
    if (count <= 0) return;
    this.aPos.addUpdateRange(from * 3, count * 3);
    this.aPos.needsUpdate = true;
    this.aData.addUpdateRange(from * 4, count * 4);
    this.aData.needsUpdate = true;
    this.aColor.addUpdateRange(from * 4, count * 4);
    this.aColor.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
