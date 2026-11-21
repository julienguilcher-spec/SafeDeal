/* Lot d'instances d'un modèle : une géométrie fusionnée + un InstancedMesh, donc UN appel de dessin par
 * (modèle, niveau de détail). Les tampons d'instance sont écrits directement (aucune allocation par image). */

import * as THREE from 'three';
import type { GeoData } from './geo';

/** Nombre de flottants par instance dans chaque attribut. */
const F4 = 4;

export function toBufferGeometry(d: GeoData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute('aColor', new THREE.BufferAttribute(d.color, 4, true));
  g.setAttribute('aPivot', new THREE.BufferAttribute(d.pivot, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(d.part, 3));
  g.setIndex(new THREE.BufferAttribute(d.vertexCount > 65535 ? d.index : new Uint16Array(d.index), 1));
  return g;
}

export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  readonly triangles: number;
  capacity: number;
  count = 0;
  matrix: Float32Array;
  color: Float32Array;
  anim: Float32Array;
  turret: Float32Array;
  state: Float32Array;
  light: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  constructor(data: GeoData, material: THREE.Material, capacity: number, castShadow: boolean) {
    this.geometry = toBufferGeometry(data);
    this.triangles = data.triangleCount;
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(this.geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix = this.mesh.instanceMatrix.array as Float32Array;
    this.color = new Float32Array(capacity * F4);
    this.anim = new Float32Array(capacity * F4);
    this.turret = new Float32Array(capacity * F4);
    this.state = new Float32Array(capacity * F4);
    this.light = new Float32Array(capacity * F4);
    this.bind();
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  private bind(): void {
    const set = (name: string, array: Float32Array): void => {
      const a = new THREE.InstancedBufferAttribute(array, F4);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, a);
    };
    set('iColor', this.color);
    set('iAnim', this.anim);
    set('iTurret', this.turret);
    set('iState', this.state);
    set('iLight', this.light);
  }

  /** Double la capacité (rare : seulement quand le nombre de véhicules d'un type dépasse la réserve). */
  private grow(): void {
    const cap = this.capacity * 2;
    const old = this.mesh.instanceMatrix;
    const m = new Float32Array(cap * 16);
    m.set(this.matrix);
    const next = new THREE.InstancedBufferAttribute(m, 16);
    next.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix = next;
    this.matrix = m;
    (old as unknown as { dispose?: () => void }).dispose?.();
    const widen = (a: Float32Array): Float32Array => { const b = new Float32Array(cap * F4); b.set(a); return b; };
    for (const name of ['iColor', 'iAnim', 'iTurret', 'iState', 'iLight']) {
      (this.geometry.getAttribute(name) as unknown as { dispose?: () => void }).dispose?.();
    }
    this.color = widen(this.color);
    this.anim = widen(this.anim);
    this.turret = widen(this.turret);
    this.state = widen(this.state);
    this.light = widen(this.light);
    this.bind();
    this.capacity = cap;
  }

  begin(): void {
    this.count = 0;
  }

  /** Réserve l'instance suivante et retourne son indice. */
  next(): number {
    if (this.count >= this.capacity) this.grow();
    return this.count++;
  }

  /** Fin d'image : transmet le nombre d'instances et marque les tampons à téléverser. */
  end(): void {
    const n = this.count;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    const g = this.geometry;
    (g.getAttribute('iColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('iAnim') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('iTurret') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('iState') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('iLight') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.mesh.dispose();
  }
}
