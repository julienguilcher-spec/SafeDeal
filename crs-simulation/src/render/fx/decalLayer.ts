/* =====================================================================================
 * Effets visuels — couche des décalques : un maillage instancié (UN appel de dessin) pour les
 * marques persistantes au sol et sur les façades (brûlures, verre, flaques, peinture, tags) et
 * pour les lueurs que les feux posent sur le sol.
 * ===================================================================================== */

import * as THREE from 'three';
import { DECAL_COLS, buildDecalAtlas, isMaskTile } from './decalAtlas';
import type { DecalQueue } from './decalQueue';

const VERT = /* glsl */`
attribute vec4 iColor;
attribute vec4 iInfo;
varying vec2 vTileUv;
varying vec4 vColor;
varying vec3 vInfo;
varying vec3 vWorldPos;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
	vec4 wp = instanceMatrix * vec4( position, 1.0 );
	vec4 mvPosition = viewMatrix * wp;
	gl_Position = projectionMatrix * mvPosition;
	float tile = floor( iInfo.x + 0.5 );
	vTileUv = ( vec2( mod( tile, ${DECAL_COLS}.0 ), floor( tile / ${DECAL_COLS}.0 ) ) + uv ) / ${DECAL_COLS}.0;
	vColor = iColor;
	vInfo = iInfo.yzw;
	vWorldPos = wp.xyz;
	vNormal = normalize( instanceMatrix[ 2 ].xyz );
	#include <fog_vertex>
}
`;

const FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uLight;
uniform vec3 uSky;
varying vec2 vTileUv;
varying vec4 vColor;
varying vec3 vInfo;
varying vec3 vWorldPos;
varying vec3 vNormal;
#include <fog_pars_fragment>
void main() {
	vec4 tex = texture2D( uAtlas, vTileUv );
	float mode = vInfo.x;
	vec3 col;
	float alpha;
	float fogK = 0.0;
	#ifdef USE_FOG
		#ifdef FOG_EXP2
			fogK = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#else
			fogK = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
	#endif
	if ( mode > 0.5 && mode < 1.5 ) {
		// lueur posée sur le sol (additive)
		col = vColor.rgb * ( tex.a * vColor.a ) * ( 1.0 - fogK );
		gl_FragColor = vec4( col, 1.0 );
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		gl_FragColor.a = 0.0;
	} else {
		if ( mode < 0.5 ) {
			alpha = tex.a * vColor.a;
			col = mix( tex.rgb, vec3( 1.0 ), vInfo.y ) * vColor.rgb * uLight;
		} else {
			// flaque : assombrit le sol et reflète le ciel à incidence rasante
			vec3 v = normalize( cameraPosition - vWorldPos );
			float fres = pow( 1.0 - clamp( dot( v, vNormal ), 0.0, 1.0 ), 4.0 );
			alpha = tex.a * vColor.a * ( 0.5 + 0.45 * fres );
			col = vec3( 0.012 ) * uLight + uSky * ( 0.03 + 0.7 * fres );
		}
		#ifdef USE_FOG
			col = mix( col, fogColor, fogK );
		#endif
		gl_FragColor = vec4( col, 1.0 );
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		gl_FragColor = vec4( gl_FragColor.rgb * alpha, alpha );
	}
}
`;

export class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  /** Décalques dessinés à la dernière image (lueurs comprises). */
  drawn = 0;
  readonly uniforms: {
    uAtlas: { value: THREE.Texture };
    uLight: { value: THREE.Color };
    uSky: { value: THREE.Color };
  } & Record<string, THREE.IUniform>;

  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;
  private readonly infos: Float32Array;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aInfo: THREE.InstancedBufferAttribute;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.ShaderMaterial;
  private n = 0;

  /** `capacity` : décalques persistants + lueurs dynamiques. */
  constructor(capacity: number, atlasSize: number, maxAnisotropy: number) {
    this.capacity = capacity;
    this.texture = new THREE.CanvasTexture(buildDecalAtlas(atlasSize));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = true;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = Math.max(1, Math.min(4, maxAnisotropy));
    this.texture.needsUpdate = true;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uAtlas: { value: this.texture },
      uLight: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uSky: { value: new THREE.Color(0.4, 0.5, 0.6) },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'fx-decalques',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.name = 'fx-decalques';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 8;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.colors = new Float32Array(capacity * 4);
    this.infos = new Float32Array(capacity * 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.colors, 4);
    this.aInfo = new THREE.InstancedBufferAttribute(this.infos, 4);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    this.aInfo.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iInfo', this.aInfo);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  begin(): void {
    this.n = 0;
  }

  /**
   * Ajoute un quad orienté : centre, normale unitaire, taille (côté), rotation autour de la normale.
   * `lift` : décollement de la surface (m).
   */
  push(
    x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, rot: number,
    r: number, g: number, b: number, a: number, tile: number, mode: number, lift: number,
  ): void {
    const i = this.n;
    if (i >= this.capacity || !(a > 0.004)) return;
    // repère de la surface : tangente horizontale, bitangente « vers le haut » pour un mur
    let tx: number, ty: number, tz: number;
    if (ny > 0.9 || ny < -0.9) {
      // sol : tangente = x du monde tournée autour de la normale
      tx = 1 - nx * nx; ty = -nx * ny; tz = -nx * nz;
    } else {
      // mur : tangente = haut × normale (horizontale)
      tx = nz; ty = 0; tz = -nx;
    }
    let l = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (l < 1e-6) { tx = 1; ty = 0; tz = 0; l = 1; }
    tx /= l; ty /= l; tz /= l;
    // bitangente = normale × tangente
    let bx = ny * tz - nz * ty;
    let by = nz * tx - nx * tz;
    let bz = nx * ty - ny * tx;
    if (rot !== 0) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const ux = tx * c + bx * s;
      const uy = ty * c + by * s;
      const uz = tz * c + bz * s;
      bx = bx * c - tx * s; by = by * c - ty * s; bz = bz * c - tz * s;
      tx = ux; ty = uy; tz = uz;
    }
    const m = this.matrices;
    const o = i * 16;
    m[o] = tx * size; m[o + 1] = ty * size; m[o + 2] = tz * size; m[o + 3] = 0;
    m[o + 4] = bx * size; m[o + 5] = by * size; m[o + 6] = bz * size; m[o + 7] = 0;
    m[o + 8] = nx; m[o + 9] = ny; m[o + 10] = nz; m[o + 11] = 0;
    m[o + 12] = x + nx * lift; m[o + 13] = y + ny * lift; m[o + 14] = z + nz * lift; m[o + 15] = 1;
    const k = i * 4;
    this.colors[k] = r; this.colors[k + 1] = g; this.colors[k + 2] = b; this.colors[k + 3] = a;
    this.infos[k] = tile; this.infos[k + 1] = mode; this.infos[k + 2] = isMaskTile(tile) ? 1 : 0; this.infos[k + 3] = 0;
    this.n = i + 1;
  }

  /** Écrit tous les décalques vivants de la file, du plus ancien au plus récent. */
  writeQueue(q: DecalQueue, now: number): void {
    const cap = q.capacity;
    const count = q.count;
    // l'anneau plein commence à l'indice du plus ancien (celui qui sera remplacé au prochain ajout)
    const start = count < cap ? 0 : q.serialCounter % cap;
    for (let k = 0; k < count; k++) {
      const i = (start + k) % cap;
      const f = q.fade(i, now);
      if (f <= 0) continue;
      this.push(
        q.x[i]!, q.y[i]!, q.z[i]!, q.nx[i]!, q.ny[i]!, q.nz[i]!, q.size[i]!, q.rot[i]!,
        q.r[i]!, q.g[i]!, q.b[i]!, q.a[i]! * f, q.tile[i]!, q.mode[i]!, 0.012 + (k % 7) * 0.0015,
      );
    }
  }

  finish(): number {
    const n = this.n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aInfo.needsUpdate = true;
    }
    this.drawn = n;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
