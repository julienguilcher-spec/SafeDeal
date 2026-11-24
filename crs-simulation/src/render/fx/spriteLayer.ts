/* =====================================================================================
 * Effets visuels — couche de particules : un seul maillage instancié pour TOUS les quads
 * (nuages, fumées, flammes, étincelles, eau, débris, traînées, éclairs).
 *
 * À chaque image : begin() → les émetteurs écrivent dans `stage` (16 flottants par quad) et
 * `depth` → finish() trie du plus loin au plus proche (tri par comptage) et recopie dans le
 * tampon du GPU. Aucune allocation par image.
 * ===================================================================================== */

import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, buildNoiseTexture, buildSpriteAtlas } from './atlas';
import { NO_FLOOR, sortFarToNear } from './pool';
import { SPRITE_FRAGMENT_SHADER, spriteVertexShader } from './spriteShader';

export const SPRITE_STRIDE = 16;
const BUCKETS = 2048;

export class SpriteLayer {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  /** Zone de préparation : 16 flottants par quad, dans l'ordre d'émission. */
  readonly stage: Float32Array;
  /** Profondeur de chaque quad le long de l'axe de visée (m). */
  readonly depth: Float32Array;
  /** Nombre de quads préparés pour l'image en cours. */
  count = 0;
  /** Quads refusés faute de place pendant l'image. */
  overflow = 0;
  /** Nombre de quads réellement dessinés à la dernière image. */
  drawn = 0;

  // caméra de l'image en cours (lecture par les émetteurs)
  camX = 0; camY = 0; camZ = 0;
  fwdX = 0; fwdY = 0; fwdZ = -1;
  rightX = 1; rightY = 0; rightZ = 0;
  upX = 0; upY = 1; upZ = 0;

  readonly uniforms: {
    uAtlas: { value: THREE.Texture };
    uNoise: { value: THREE.Texture };
    uTime: { value: number };
    uCamRight: { value: THREE.Vector3 };
    uCamUp: { value: THREE.Vector3 };
    uSunDir: { value: THREE.Vector3 };
    uSunCol: { value: THREE.Color };
    uSkyCol: { value: THREE.Color };
    uGroundCol: { value: THREE.Color };
    uLightPos: { value: Float32Array };
    uLightCol: { value: Float32Array };
  } & Record<string, THREE.IUniform>;

  readonly lightCount: number;
  private readonly gpu: Float32Array;
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly order: Uint32Array;
  private readonly counts = new Uint32Array(BUCKETS + 1);
  private readonly range = { start: 0, count: 0 };
  private readonly atlas: THREE.DataTexture;
  private readonly noise: THREE.DataTexture;

  constructor(capacity: number, atlasTile: number, lightCount: number) {
    this.capacity = capacity;
    this.lightCount = lightCount;
    this.stage = new Float32Array(capacity * SPRITE_STRIDE);
    this.depth = new Float32Array(capacity);
    this.gpu = new Float32Array(capacity * SPRITE_STRIDE);
    this.order = new Uint32Array(capacity);

    const a = buildSpriteAtlas(atlasTile);
    this.atlas = new THREE.DataTexture(a.data, a.width, a.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas.generateMipmaps = true;
    this.atlas.colorSpace = THREE.NoColorSpace;
    this.atlas.needsUpdate = true;
    const NS = 64;
    this.noise = new THREE.DataTexture(buildNoiseTexture(NS), NS, NS, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.noise.wrapS = THREE.RepeatWrapping;
    this.noise.wrapT = THREE.RepeatWrapping;
    this.noise.magFilter = THREE.LinearFilter;
    this.noise.minFilter = THREE.LinearFilter;
    this.noise.generateMipmaps = false;
    this.noise.colorSpace = THREE.NoColorSpace;
    this.noise.needsUpdate = true;

    const lightPos = new Float32Array(lightCount * 4);
    for (let i = 0; i < lightCount; i++) lightPos[i * 4 + 3] = 1e-3;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uAtlas: { value: this.atlas },
      uNoise: { value: this.noise },
      uTime: { value: 0 },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0.8, 0.78, 0.72) },
      uSkyCol: { value: new THREE.Color(0.25, 0.3, 0.38) },
      uGroundCol: { value: new THREE.Color(0.1, 0.1, 0.09) },
      uLightPos: { value: lightPos },
      uLightCol: { value: new Float32Array(lightCount * 3) },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'fx-particules',
      uniforms: this.uniforms,
      vertexShader: spriteVertexShader(lightCount),
      fragmentShader: SPRITE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.gpu, SPRITE_STRIDE, 1);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', new THREE.InterleavedBufferAttribute(this.buffer, 4, 0));
    geo.setAttribute('iB', new THREE.InterleavedBufferAttribute(this.buffer, 4, 4));
    geo.setAttribute('iC', new THREE.InterleavedBufferAttribute(this.buffer, 4, 8));
    geo.setAttribute('iD', new THREE.InterleavedBufferAttribute(this.buffer, 4, 12));
    geo.instanceCount = 0;
    this.geometry = geo;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'fx-particules';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 30;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Nombre de vignettes de l'atlas (pour les bancs d'essai). */
  get tiles(): number {
    return ATLAS_COLS * ATLAS_ROWS;
  }

  /** Début d'image : relève la caméra et vide la zone de préparation. */
  begin(camera: THREE.Camera, time: number): void {
    const e = camera.matrixWorld.elements;
    this.rightX = e[0]!; this.rightY = e[1]!; this.rightZ = e[2]!;
    this.upX = e[4]!; this.upY = e[5]!; this.upZ = e[6]!;
    this.fwdX = -e[8]!; this.fwdY = -e[9]!; this.fwdZ = -e[10]!;
    this.camX = e[12]!; this.camY = e[13]!; this.camZ = e[14]!;
    this.uniforms.uCamRight.value.set(this.rightX, this.rightY, this.rightZ);
    this.uniforms.uCamUp.value.set(this.upX, this.upY, this.upZ);
    this.uniforms.uTime.value = time % 600;
    this.count = 0;
    this.overflow = 0;
  }

  /**
   * Ajoute un quad (chemin commode pour les émetteurs peu nombreux ; les boucles lourdes écrivent
   * directement dans `stage`). `kindMode` = famille + 4 × orientation. Retourne false si plein ou derrière la caméra.
   */
  push(
    x: number, y: number, z: number, size: number, ax: number, ay: number, az: number, rot: number,
    r: number, g: number, b: number, a: number, tile: number, kindMode: number, floorY: number, seed: number,
  ): boolean {
    const n = this.count;
    if (n >= this.capacity) {
      this.overflow++;
      return false;
    }
    const d = (x - this.camX) * this.fwdX + (y - this.camY) * this.fwdY + (z - this.camZ) * this.fwdZ;
    const ext = size + Math.abs(ax) + Math.abs(ay) + Math.abs(az);
    if (d < -ext) return false;
    const s = this.stage;
    const o = n * SPRITE_STRIDE;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = size;
    s[o + 4] = ax; s[o + 5] = ay; s[o + 6] = az; s[o + 7] = rot;
    s[o + 8] = r; s[o + 9] = g; s[o + 10] = b; s[o + 11] = a;
    s[o + 12] = tile; s[o + 13] = kindMode; s[o + 14] = floorY; s[o + 15] = seed;
    this.depth[n] = d;
    this.count = n + 1;
    return true;
  }

  /** Fin d'image : tri par profondeur et envoi au GPU. Retourne le nombre de quads dessinés. */
  finish(): number {
    const n = this.count;
    const depth = this.depth;
    let maxDepth = 1;
    for (let i = 0; i < n; i++) {
      const d = depth[i]!;
      if (d > maxDepth) maxDepth = d;
    }
    sortFarToNear(depth, n, maxDepth, this.order, this.counts, BUCKETS);
    const src = this.stage;
    const dst = this.gpu;
    const order = this.order;
    for (let k = 0; k < n; k++) {
      let s = order[k]! * SPRITE_STRIDE;
      let d = k * SPRITE_STRIDE;
      const end = d + SPRITE_STRIDE;
      while (d < end) dst[d++] = src[s++]!;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      // une seule plage d'envoi, objet réutilisé (le rendu vide la liste après l'envoi)
      this.range.start = 0;
      this.range.count = n * SPRITE_STRIDE;
      const ranges = this.buffer.updateRanges;
      ranges.length = 0;
      ranges.push(this.range);
      this.buffer.needsUpdate = true;
    }
    this.drawn = n;
    return n;
  }

  /** Lumières ponctuelles vues par les fumées : positions (x, y, z, portée) et couleurs × intensité. */
  setLights(pos: Float32Array, col: Float32Array, n: number): void {
    const P = this.uniforms.uLightPos.value;
    const C = this.uniforms.uLightCol.value;
    const max = this.lightCount;
    for (let i = 0; i < max; i++) {
      if (i < n) {
        P[i * 4] = pos[i * 4]!; P[i * 4 + 1] = pos[i * 4 + 1]!; P[i * 4 + 2] = pos[i * 4 + 2]!;
        P[i * 4 + 3] = Math.max(1e-3, pos[i * 4 + 3]!);
        C[i * 3] = col[i * 3]!; C[i * 3 + 1] = col[i * 3 + 1]!; C[i * 3 + 2] = col[i * 3 + 2]!;
      } else {
        P[i * 4 + 3] = 1e-3;
        C[i * 3] = 0; C[i * 3 + 1] = 0; C[i * 3 + 2] = 0;
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
    this.noise.dispose();
  }
}

export { NO_FLOOR };
