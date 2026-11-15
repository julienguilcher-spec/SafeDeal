/* Kit monuments — assembleur : fusion des géométries PAR MATÉRIAU (un maillage = un appel de dessin). */
import * as THREE from 'three';
import { Geo } from './geo';
import { mat, type MatRef } from './materials';

export interface BuildStats { triangles: number; drawCalls: number; vertices: number }

/**
 * Assembleur d'un monument. On y verse des `Geo` avec un matériau ; `build()` rend un groupe contenant
 * un seul maillage par matériau. Une pile de matrices permet de poser des sous-ensembles :
 *   b.push(pose(x, 0, z, cap)); colonne(b, …); b.pop();
 */
export class Builder {
  private readonly parts = new Map<THREE.Material, Geo>();
  private readonly extras: THREE.Object3D[] = [];
  private readonly stack: THREE.Matrix4[] = [];
  private current: THREE.Matrix4 | null = null;

  /** Empile une transformation (composée avec la courante). */
  push(m: THREE.Matrix4): this {
    const next = this.current ? this.current.clone().multiply(m) : m.clone();
    this.stack.push(next);
    this.current = next;
    return this;
  }

  pop(): this {
    this.stack.pop();
    this.current = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    return this;
  }

  /** Exécute `fn` sous une transformation, puis dépile. */
  with(m: THREE.Matrix4, fn: () => void): this {
    this.push(m);
    try { fn(); } finally { this.pop(); }
    return this;
  }

  /** Matrice courante (copie) — utile pour poser un objet annexe au même endroit. */
  matrix(): THREE.Matrix4 { return this.current ? this.current.clone() : new THREE.Matrix4(); }

  /** Ajoute une géométrie au matériau donné (clé du kit ou matériau), avec une pose locale facultative. */
  add(material: MatRef, geo: Geo, m?: THREE.Matrix4): this {
    const material3 = typeof material === 'string' ? mat(material) : material;
    let target = this.parts.get(material3);
    if (!target) { target = new Geo(); this.parts.set(material3, target); }
    const full = this.current ? (m ? this.current.clone().multiply(m) : this.current) : m;
    target.append(geo, full ?? undefined);
    return this;
  }

  /** Ajoute un objet tel quel (InstancedMesh, Points…) : il compte pour ses propres appels de dessin. */
  addObject(obj: THREE.Object3D): this {
    if (this.current) obj.applyMatrix4(this.current);
    this.extras.push(obj);
    return this;
  }

  get triangles(): number {
    let t = 0;
    for (const g of this.parts.values()) t += g.triangleCount;
    return t;
  }

  /** Construit le groupe final. `userData.stats` contient le bilan (triangles, appels de dessin). */
  build(name = 'monument'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    let triangles = 0, vertices = 0, drawCalls = 0;
    for (const [material, geo] of this.parts) {
      if (geo.triangleCount === 0) continue;
      const mesh = new THREE.Mesh(geo.toBufferGeometry(), material);
      mesh.name = `${name}:${material.name || 'mat'}`;
      const shadow = material.userData.shadow !== false;
      mesh.castShadow = shadow && !material.transparent;
      mesh.receiveShadow = shadow;
      if (material.transparent) mesh.renderOrder = 2;
      group.add(mesh);
      triangles += geo.triangleCount;
      vertices += geo.vertexCount;
      drawCalls++;
    }
    for (const o of this.extras) {
      group.add(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh || (c as THREE.Points).isPoints) {
          drawCalls++;
          const g = m.geometry;
          const count = g.getIndex() ? g.getIndex()!.count / 3 : g.getAttribute('position').count / 3;
          const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
          if (m.isMesh) triangles += count * inst;
        }
      });
    }
    const stats: BuildStats = { triangles: Math.round(triangles), drawCalls, vertices };
    group.userData.stats = stats;
    this.parts.clear();
    this.extras.length = 0;
    return group;
  }
}

/** Bilan d'un objet construit par le kit (ou recalculé par parcours si absent). */
export function statsOf(obj: THREE.Object3D): BuildStats {
  const s = obj.userData.stats as BuildStats | undefined;
  if (s) return s;
  let triangles = 0, drawCalls = 0, vertices = 0;
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh && !(c as THREE.Points).isPoints) return;
    drawCalls++;
    const g = m.geometry;
    vertices += g.getAttribute('position').count;
    if (m.isMesh) triangles += (g.getIndex() ? g.getIndex()!.count : g.getAttribute('position').count) / 3;
  });
  return { triangles, drawCalls, vertices };
}

/** Libère les géométries d'un objet construit par le kit (les matériaux et textures sont partagés : on n'y touche pas). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const own = c.userData.ownMaterial as THREE.Material | undefined;
    if (own) own.dispose();
  });
}
