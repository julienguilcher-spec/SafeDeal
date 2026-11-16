/* =====================================================================================
 * RENDU DU DÉCOR — maillage à emplacements : un THREE.Mesh dont les attributs enveloppent un
 * MeshBuf. On le reconstruit en entier (changement de niveau de détail), ou on en réécrit une plage
 * (un objet change d'état) : seule la plage modifiée est renvoyée à la carte graphique.
 * ===================================================================================== */

import * as THREE from 'three';
import { MeshBuf } from './meshbuf';

export class SlotMesh {
  readonly mesh: THREE.Mesh;
  buf: MeshBuf;
  private geo: THREE.BufferGeometry | null = null;
  /** Tableaux actuellement enveloppés (pour détecter un agrandissement du tampon). */
  private wrapped: Float32Array | null = null;
  private wrappedIdx: Uint32Array | null = null;
  private aPos!: THREE.BufferAttribute;
  private aNrm!: THREE.BufferAttribute;
  private aCol!: THREE.BufferAttribute;
  private aUv!: THREE.BufferAttribute;
  private aFx!: THREE.BufferAttribute;
  private aIdx!: THREE.BufferAttribute;
  /** Appels de dessin et triangles comptés à la dernière image (hors passe d'ombre / passe d'ombre). */
  static drawn = 0;
  static shadowDrawn = 0;
  static triangles = 0;

  constructor(material: THREE.Material, depth: THREE.Material | null, name: string, vCap = 256, iCap = 512) {
    this.buf = new MeshBuf(vCap, iCap);
    this.mesh = new THREE.Mesh(undefined, material);
    this.mesh.name = name;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = true;
    if (depth) this.mesh.customDepthMaterial = depth;
    this.mesh.onBeforeRender = (_r, _s, _c, geometry) => {
      SlotMesh.drawn++;
      SlotMesh.triangles += geometry.drawRange.count / 3;
    };
    this.mesh.onBeforeShadow = () => {
      SlotMesh.shadowDrawn++;
    };
    // les visées et collisions passent par la simulation, jamais par le rendu
    this.mesh.raycast = () => { /* sans objet */ };
    this.mesh.visible = false;
  }

  private rewrap(): void {
    const b = this.buf;
    if (this.geo) this.geo.dispose();
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(b.pos, 3);
    this.aNrm = new THREE.BufferAttribute(b.nrm, 3, true);
    this.aCol = new THREE.BufferAttribute(b.col, 4, true);
    this.aUv = new THREE.BufferAttribute(b.uv, 2);
    this.aFx = new THREE.BufferAttribute(b.fx, 4, true);
    this.aIdx = new THREE.BufferAttribute(b.idx, 1);
    for (const a of [this.aPos, this.aNrm, this.aCol, this.aUv, this.aFx, this.aIdx]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('normal', this.aNrm);
    geo.setAttribute('color', this.aCol);
    geo.setAttribute('uv', this.aUv);
    geo.setAttribute('aFx', this.aFx);
    geo.setIndex(this.aIdx);
    geo.boundingSphere = this.geo && this.geo.boundingSphere ? this.geo.boundingSphere : new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    this.mesh.geometry = geo;
    this.wrapped = b.pos;
    this.wrappedIdx = b.idx;
  }

  /** Sphère englobante fixée par le propriétaire (morceau : centre et rayon connus d'avance). */
  setBounds(x: number, y: number, z: number, radius: number): void {
    if (!this.geo) this.rewrap();
    const s = this.geo!.boundingSphere!;
    s.center.set(x, y, z);
    s.radius = radius;
  }

  /** Après une reconstruction complète du tampon : tout renvoyer. */
  syncAll(): void {
    const b = this.buf;
    if (!this.geo || this.wrapped !== b.pos || this.wrappedIdx !== b.idx) {
      this.rewrap();
    } else {
      this.range(0, b.nv, 0, b.ni);
    }
    this.geo!.setDrawRange(0, b.ni);
    this.mesh.visible = b.ni > 0;
  }

  /** Après une réécriture en place : renvoyer la plage de sommets [v0, v1[ et d'indices [i0, i1[. */
  syncRange(v0: number, v1: number, i0: number, i1: number): void {
    const b = this.buf;
    if (!this.geo || this.wrapped !== b.pos || this.wrappedIdx !== b.idx) {
      this.rewrap();
    } else {
      this.range(v0, v1, i0, i1);
    }
    this.geo!.setDrawRange(0, b.ni);
    this.mesh.visible = b.ni > 0;
  }

  private range(v0: number, v1: number, i0: number, i1: number): void {
    const nv = v1 - v0;
    if (nv > 0) {
      this.aPos.addUpdateRange(v0 * 3, nv * 3);
      this.aNrm.addUpdateRange(v0 * 3, nv * 3);
      this.aCol.addUpdateRange(v0 * 4, nv * 4);
      this.aUv.addUpdateRange(v0 * 2, nv * 2);
      this.aFx.addUpdateRange(v0 * 4, nv * 4);
      this.aPos.needsUpdate = this.aNrm.needsUpdate = this.aCol.needsUpdate = this.aUv.needsUpdate = this.aFx.needsUpdate = true;
    }
    if (i1 > i0) {
      this.aIdx.addUpdateRange(i0, i1 - i0);
      this.aIdx.needsUpdate = true;
    }
  }

  /** Libère la géométrie (morceau hors de portée) ; le maillage peut resservir. */
  release(): void {
    if (this.geo) {
      this.geo.dispose();
      this.geo = null;
      this.wrapped = null;
      this.wrappedIdx = null;
      this.mesh.geometry = EMPTY;
    }
    this.mesh.visible = false;
    this.buf = new MeshBuf(16, 32);
  }

  dispose(): void {
    if (this.geo) this.geo.dispose();
    this.geo = null;
    this.mesh.removeFromParent();
  }
}

const EMPTY = new THREE.BufferGeometry();
