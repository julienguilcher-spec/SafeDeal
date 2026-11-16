/* Couche d'effets lumineux des véhicules : éclats des gyrophares et des feux, halos au sol la nuit, faisceau des
 * phares, flammes et fumée des véhicules incendiés. Tout tient en UN appel de dessin : un InstancedMesh de
 * quads dont le fragment shader choisit le motif d'après l'attribut d'instance.
 *
 * Mélange prémultiplié (source : 1, destination : 1 − alpha) : alpha = 0 donne une lumière additive (éclats,
 * halos, flammes) ; alpha > 0 donne un voile opaque (fumée). */

import * as THREE from 'three';

export const FX_SPRITE = 0;  // éclat face à la caméra
export const FX_POOL = 1;    // nappe de lumière au sol
export const FX_BEAM = 2;    // faisceau de phares au sol
export const FX_FLAME = 3;   // flamme (face à la caméra, base en bas)
export const FX_SMOKE = 4;   // bouffée de fumée noire

const VERT = /* glsl */`
attribute vec4 iFx;   // rgb, intensité
attribute vec4 iFx2;  // motif, graine, temps, —
varying vec2 vUv;
varying vec4 vFx;
varying vec4 vFx2;
void main() {
	vUv = uv;
	vFx = iFx;
	vFx2 = iFx2;
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;

const FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vFx;
varying vec4 vFx2;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
	vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) { return noise( p ) * 0.55 + noise( p * 2.1 + 3.7 ) * 0.3 + noise( p * 4.3 + 9.1 ) * 0.15; }
void main() {
	vec2 c = vUv - 0.5;
	float r = length( c ) * 2.0;
	float kind = vFx2.x;
	vec3 col = vec3( 0.0 );
	float alpha = 0.0;
	if ( kind < 0.5 ) {
		// éclat : cœur vif, auréole douce, léger étirement horizontal
		float core = exp( - r * r * 26.0 );
		float halo = pow( max( 0.0, 1.0 - r ), 2.6 );
		float streak = exp( - abs( c.y ) * 46.0 ) * pow( max( 0.0, 1.0 - abs( c.x ) * 2.0 ), 2.0 );
		col = vFx.rgb * vFx.a * ( core * 2.4 + halo * 0.5 + streak * 0.12 ) + vec3( core * vFx.a * 0.9 );
	} else if ( kind < 1.5 ) {
		float f = pow( max( 0.0, 1.0 - r ), 1.7 );
		col = vFx.rgb * vFx.a * f;
	} else if ( kind < 2.5 ) {
		// faisceau : étroit à l'origine (v = 0), s'élargit et s'estompe vers l'avant
		float v = vUv.y;
		float w = 0.1 + 0.42 * v;
		float side = 1.0 - smoothstep( w * 0.55, w, abs( c.x ) );
		float along = smoothstep( 0.0, 0.07, v ) * pow( max( 0.0, 1.0 - v ), 1.35 );
		col = vFx.rgb * vFx.a * side * along;
	} else if ( kind < 3.5 ) {
		// flamme : langues ascendantes, cœur jaune, bords rouges
		float t = vFx2.z, sd = vFx2.y;
		float y = vUv.y;
		float n = fbm( vec2( vUv.x * 3.2 + sd * 7.0, y * 2.6 - t * 2.4 ) );
		float n2 = fbm( vec2( vUv.x * 6.0 - sd * 3.0, y * 5.0 - t * 4.1 ) );
		float width = ( 1.0 - y ) * 0.9 + 0.1;
		float body = 1.0 - abs( c.x ) * 2.0 / max( 0.05, width * ( 0.55 + n * 0.75 ) );
		float f = clamp( body, 0.0, 1.0 ) * ( 1.0 - y * ( 0.75 + n2 * 0.6 ) ) * smoothstep( 0.0, 0.08, y );
		f = clamp( f * 1.9, 0.0, 1.0 );
		vec3 ramp = mix( vec3( 0.9, 0.12, 0.0 ), vec3( 1.0, 0.55, 0.06 ), smoothstep( 0.15, 0.55, f ) );
		ramp = mix( ramp, vec3( 1.0, 0.92, 0.55 ), smoothstep( 0.6, 1.0, f ) );
		col = ramp * f * vFx.a * 1.6;
	} else {
		// fumée : bouffée sombre aux contours déchiquetés
		float t = vFx2.z, sd = vFx2.y;
		float n = fbm( c * 3.0 + vec2( sd * 5.0, - t * 0.35 ) );
		float a = smoothstep( 1.0, 0.25, r + ( n - 0.5 ) * 0.7 ) * vFx.a;
		col = vFx.rgb * a;
		alpha = a;
	}
	gl_FragColor = vec4( col, alpha );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export class FxLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  count = 0;
  private readonly matrix: Float32Array;
  private readonly fx: Float32Array;
  private readonly fx2: Float32Array;
  private readonly aFx: THREE.InstancedBufferAttribute;
  private readonly aFx2: THREE.InstancedBufferAttribute;
  // base de la caméra pour orienter les éclats
  private rx = 1; private ry = 0; private rz = 0;
  private ux = 0; private uy = 1; private uz = 0;
  private fxv = 0; private fyv = 0; private fzv = 1;
  private cx = 0; private cy = 0; private cz = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 20;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix = this.mesh.instanceMatrix.array as Float32Array;
    this.fx = new Float32Array(capacity * 4);
    this.fx2 = new Float32Array(capacity * 4);
    this.aFx = new THREE.InstancedBufferAttribute(this.fx, 4);
    this.aFx2 = new THREE.InstancedBufferAttribute(this.fx2, 4);
    this.aFx.setUsage(THREE.DynamicDrawUsage);
    this.aFx2.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iFx', this.aFx);
    geo.setAttribute('iFx2', this.aFx2);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** Début d'image : mémorise la base de la caméra (matrice monde, ordre colonne). */
  begin(camera: THREE.Camera): void {
    this.count = 0;
    const e = camera.matrixWorld.elements;
    this.rx = e[0]!; this.ry = e[1]!; this.rz = e[2]!;
    this.ux = e[4]!; this.uy = e[5]!; this.uz = e[6]!;
    this.fxv = e[8]!; this.fyv = e[9]!; this.fzv = e[10]!;
    this.cx = e[12]!; this.cy = e[13]!; this.cz = e[14]!;
  }

  private put(kind: number, r: number, g: number, b: number, intensity: number, seed: number, t: number): number {
    const i = this.count++;
    const o = i * 4;
    this.fx[o] = r; this.fx[o + 1] = g; this.fx[o + 2] = b; this.fx[o + 3] = intensity;
    this.fx2[o] = kind; this.fx2[o + 1] = seed; this.fx2[o + 2] = t; this.fx2[o + 3] = 0;
    return i * 16;
  }

  /** Éclat face à la caméra, légèrement avancé vers elle pour ne pas être masqué par sa lentille. */
  sprite(x: number, y: number, z: number, size: number, r: number, g: number, b: number, intensity: number): void {
    if (this.count >= this.capacity) return;
    const m = this.matrix, o = this.put(FX_SPRITE, r, g, b, intensity, 0, 0);
    let dx = this.cx - x, dy = this.cy - y, dz = this.cz - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const push = Math.min(0.25, d * 0.5) / d;
    dx *= push; dy *= push; dz *= push;
    m[o] = this.rx * size; m[o + 1] = this.ry * size; m[o + 2] = this.rz * size; m[o + 3] = 0;
    m[o + 4] = this.ux * size; m[o + 5] = this.uy * size; m[o + 6] = this.uz * size; m[o + 7] = 0;
    m[o + 8] = this.fxv; m[o + 9] = this.fyv; m[o + 10] = this.fzv; m[o + 11] = 0;
    m[o + 12] = x + dx; m[o + 13] = y + dy; m[o + 14] = z + dz; m[o + 15] = 1;
  }

  /**
   * Quad couché au sol : `fx`, `fz` = direction « avant » (unitaire) ; demi-axes sx (travers) et sz (long).
   * Pour FX_BEAM, l'origine du faisceau est le bord arrière du quad.
   */
  ground(kind: number, x: number, y: number, z: number, fx: number, fz: number, sx: number, sz: number, r: number, g: number, b: number, intensity: number): void {
    if (this.count >= this.capacity) return;
    const m = this.matrix, o = this.put(kind, r, g, b, intensity, 0, 0);
    // axe local x → travers (−fz, 0, fx) ; axe local y → avant
    m[o] = -fz * sx; m[o + 1] = 0; m[o + 2] = fx * sx; m[o + 3] = 0;
    m[o + 4] = fx * sz; m[o + 5] = 0; m[o + 6] = fz * sz; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 1; m[o + 10] = 0; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  }

  /** Flamme ou fumée dressée, tournée vers la caméra autour de la verticale ; (x, y, z) = centre de la base. */
  upright(kind: number, x: number, y: number, z: number, w: number, h: number, r: number, g: number, b: number, intensity: number, seed: number, t: number): void {
    if (this.count >= this.capacity) return;
    const m = this.matrix, o = this.put(kind, r, g, b, intensity, seed, t);
    // « droite » horizontale de la caméra
    let hx = this.rx, hz = this.rz;
    const l = Math.sqrt(hx * hx + hz * hz) || 1;
    hx /= l; hz /= l;
    m[o] = hx * w; m[o + 1] = 0; m[o + 2] = hz * w; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = -hz; m[o + 9] = 0; m[o + 10] = hx; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y + h * 0.5; m[o + 14] = z; m[o + 15] = 1;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aFx.needsUpdate = true;
    this.aFx2.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
