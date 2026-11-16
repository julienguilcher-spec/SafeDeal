/* =====================================================================================
 * VILLE EN 3D — arbres instanciés (Three.js).
 * -------------------------------------------------------------------------------------
 * Platanes d'alignement : un tronc élancé à l'écorce en plaques et un houppier fait de quelques
 * volumes bosselés fondus en un seul maillage. Une instance par arbre (taille, rotation et teinte
 * propres) : deux appels de dessin par tuile détaillée, un seul (houppiers simplifiés) au loin.
 * ===================================================================================== */

import * as THREE from 'three';
import type { TreeSet } from '../mapdata';
import { hash01 } from './classes';

export interface TreeDetail {
  /** Subdivision du volume principal et des volumes secondaires du houppier (-1 = pas de volume secondaire). */
  main: number;
  side: number;
  trunkSides: number;
}

/** Bruit de valeur 3D minimal (bosses du houppier). */
function lump(x: number, y: number, z: number): number {
  return Math.sin(x * 3.1 + y * 1.7) * Math.cos(z * 2.9 - y * 2.3) * 0.5 + Math.sin(x * 6.3 - z * 5.1 + y * 4.7) * 0.25;
}

/** Un volume bosselé centré en (cx, cy, cz), de rayons (rx, ry, rz) ; écrit position, normale, uv et teinte par sommet. */
function blob(detail: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = pos.count;
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.26 * lump(x * 1.3 + seed, y * 1.3, z * 1.3 - seed);
    // dessous aplati : un houppier porte ses feuilles vers le haut et sur les côtés
    const flat = y < 0 ? 0.72 : 1;
    const px = cx + x * rx * k, py = cy + y * ry * k * flat, pz = cz + z * rz * k;
    pos.setXYZ(i, px, py, pz);
    // normale « de boule » : éclairage doux, sans facettes
    const len = Math.hypot(x / rx, y / ry, z / rz) || 1;
    nor[3 * i] = x / rx / len;
    nor[3 * i + 1] = y / ry / len;
    nor[3 * i + 2] = z / rz / len;
    // ombre propre : le dessous et le cœur du houppier sont plus sombres
    const shade = 0.5 + 0.5 * Math.min(1, Math.max(0, (py + 0.9) / 1.5));
    col[3 * i] = shade;
    col[3 * i + 1] = shade;
    col[3 * i + 2] = shade;
    uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2.5);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.getAttribute('position').count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const p of parts) {
    const n = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    col.set(p.getAttribute('color').array as Float32Array, o * 3);
    uv.set(p.getAttribute('uv').array as Float32Array, o * 2);
    o += n;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Houppier unité (tient dans une boule de rayon ≈ 1,15 autour de l'origine). */
export function createCrownGeometry(detail: TreeDetail): THREE.BufferGeometry {
  const parts = [blob(detail.main, 0, 0.04, 0, 0.86, 0.92, 0.86, 1.3)];
  if (detail.side >= 0) {
    parts.push(blob(detail.side, 0.52, -0.2, 0.22, 0.6, 0.55, 0.6, 4.1));
    parts.push(blob(detail.side, -0.44, -0.08, -0.4, 0.62, 0.6, 0.62, 7.7));
    parts.push(blob(detail.side, -0.2, 0.3, 0.5, 0.52, 0.5, 0.52, 2.9));
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Tronc unité : de y = 0 à y = 1, rayon 1 au pied, 0,55 en haut, empattement à la base. */
export function createTrunkGeometry(sides: number): THREE.BufferGeometry {
  const rings = [0, 0.06, 1];
  const radii = [1.35, 1, 0.55];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[r], rings[r], Math.sin(a) * radii[r]);
      nor.push(Math.cos(a), 0.12, Math.sin(a));
      uv.push((s / sides) * 3, rings[r] * 7);
    }
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Proportions d'un arbre d'après la carte (hauteur totale, rayon de couronne) : valeurs écrites dans `out`. */
export function treeShape(height: number, crownRadius: number, out: { trunkTop: number; trunkRadius: number; crownY: number; crownRy: number; crownRx: number }): void {
  const h = Math.min(45, Math.max(2, height));
  const r = Math.min(8, Math.max(0.8, crownRadius));
  const bole = Math.min(9, Math.max(1.1, h * 0.36));
  const crownH = h - bole;
  out.crownRy = (crownH / 2) * 1.12;
  out.crownY = bole + crownH / 2;
  out.crownRx = Math.max(r, crownH * 0.24) / 1.08;
  out.trunkTop = out.crownY;
  out.trunkRadius = Math.min(0.42, Math.max(0.08, h * 0.012 + r * 0.012 + 0.03));
}

const shape = { trunkTop: 0, trunkRadius: 0, crownY: 0, crownRy: 0, crownRx: 0 };
const mat = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const posv = new THREE.Vector3();
const axisY = new THREE.Vector3(0, 1, 0);
const color = new THREE.Color();

export interface TreeMeshes { trunks: THREE.InstancedMesh | null; crowns: THREE.InstancedMesh | null; count: number }

/**
 * Maillages instanciés des arbres d'une tuile, en coordonnées locales à la tuile (ox, oz).
 * @param groundAt altitude du sol dessiné au pied de l'arbre
 * @param trunkGeometry null : pas de troncs (vue lointaine)
 */
export function buildTreeMeshes(
  trees: TreeSet, ox: number, oz: number, groundAt: (x: number, z: number) => number, crownGeometry: THREE.BufferGeometry,
  crownMaterial: THREE.Material, trunkGeometry: THREE.BufferGeometry | null, trunkMaterial: THREE.Material | null, seed: number,
): TreeMeshes {
  const n = trees.count;
  if (n === 0) return { trunks: null, crowns: null, count: 0 };
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, n);
  const trunks = trunkGeometry !== null && trunkMaterial !== null ? new THREE.InstancedMesh(trunkGeometry, trunkMaterial, n) : null;
  crowns.name = 'houppiers';
  if (trunks) trunks.name = 'troncs';
  for (let i = 0; i < n; i++) {
    const x = trees.x[i], z = trees.z[i];
    const y = groundAt(x, z);
    const h1 = hash01(seed + i * 7919 + Math.round(x * 3) * 31 + Math.round(z * 3) * 17);
    const h2 = hash01(seed * 3 + i * 104729 + 5);
    treeShape(trees.height[i] * (0.94 + 0.12 * h1), trees.crownRadius[i], shape);
    quat.setFromAxisAngle(axisY, h2 * Math.PI * 2);
    posv.set(x - ox, y + shape.crownY, z - oz);
    scl.set(shape.crownRx * (0.95 + 0.1 * h2), shape.crownRy, shape.crownRx * (1.05 - 0.1 * h2));
    mat.compose(posv, quat, scl);
    crowns.setMatrixAt(i, mat);
    // teinte : du vert profond au vert jauni, un arbre sur dix plus clair
    const warm = h1 * h1;
    const light = 0.86 + 0.3 * h2;
    color.setRGB((0.82 + 0.34 * warm) * light, (0.96 + 0.06 * warm) * light, (0.78 - 0.2 * warm) * light);
    crowns.setColorAt(i, color);
    if (trunks) {
      posv.set(x - ox, y - 0.25, z - oz);
      scl.set(shape.trunkRadius, shape.trunkTop + 0.25, shape.trunkRadius);
      mat.compose(posv, quat, scl);
      trunks.setMatrixAt(i, mat);
    }
  }
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns.computeBoundingSphere();
  crowns.computeBoundingBox();
  crowns.matrixAutoUpdate = false;
  if (trunks) {
    trunks.instanceMatrix.needsUpdate = true;
    trunks.computeBoundingSphere();
    trunks.computeBoundingBox();
    trunks.matrixAutoUpdate = false;
  }
  return { trunks, crowns, count: n };
}
