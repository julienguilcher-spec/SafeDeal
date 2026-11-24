/* Construction des maillages instanciés : corps (3 niveaux de détail), familles d'objets tenus
 * (géométries fusionnées, un appel de dessin par famille), ombres de contact. */

import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { buildBody } from './body';
import { buildHeadwear } from './wear_head';
import { buildBodywear } from './wear_body';
import { emitHeldModel, heldModels, type HeldModel } from './held';
import {
  createBlobMaterial, createPeopleDepthMaterial, createPeopleDistanceMaterial, createPeopleMaterial,
  type PeopleUniforms,
} from './shader';

/** Nombre maximal de sommets par famille d'objets opaques (chaque instance parcourt toute la famille). */
const FAMILY_BUDGET = 1400;

export interface InstancedLayer {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  /** Emplacements (ligne de texture) des instances. */
  slots: Float32Array;
  slotAttr: THREE.InstancedBufferAttribute;
  count: number;
  vertices: number;
  triangles: number;
}

export interface ItemLayer extends InstancedLayer {
  /** Par instance : identifiant de modèle, cellule de texte, 0, 0. */
  item: Float32Array;
  itemAttr: THREE.InstancedBufferAttribute;
  /** Par instance : couleur variable (linéaire). */
  col: Float32Array;
  colAttr: THREE.InstancedBufferAttribute;
  transparent: boolean;
}

function dyn(array: Float32Array, size: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(array, size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

function finishMesh(mesh: THREE.Mesh, name: string): void {
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
}

/** Géométrie complète d'un niveau de détail (corps + pièces portées). */
export function buildBodyGeometry(detail: number): GeoBuilder {
  const b = new GeoBuilder();
  b.detail = detail;
  buildBody(b);
  buildHeadwear(b);
  buildBodywear(b);
  return b;
}

export function createBodyLayer(detail: number, capacity: number, u: PeopleUniforms, material: THREE.Material, depth: THREE.Material, dist: THREE.Material): InstancedLayer {
  const b = buildBodyGeometry(detail);
  const geo = b.build();
  const slots = new Float32Array(capacity);
  const slotAttr = dyn(slots, 1);
  geo.setAttribute('aSlot', slotAttr);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, material);
  mesh.customDepthMaterial = depth;
  mesh.customDistanceMaterial = dist;
  finishMesh(mesh, 'personnages-lod' + detail);
  return { mesh, geo, slots, slotAttr, count: 0, vertices: b.vertexCount, triangles: b.idx.length / 3 };
}

/** Répartit les modèles en familles et construit une couche par famille. */
export function createItemLayers(capacity: number, u: PeopleUniforms): ItemLayer[] {
  const models = heldModels();
  // dessin de chaque modèle dans son propre constructeur pour connaître sa taille
  const built: { m: HeldModel; b: GeoBuilder }[] = [];
  for (const m of models) {
    const b = new GeoBuilder();
    try {
      emitHeldModel(m, b);
    } catch (err) {
      console.error('[people] modèle tenu invalide :', m.key, err);
      continue;
    }
    built.push({ m, b });
  }
  const layers: ItemLayer[] = [];
  const make = (group: { m: HeldModel; b: GeoBuilder }[], transparent: boolean, index: number): void => {
    const all = new GeoBuilder();
    for (const g of group) { all.append(g.b); g.m.family = index; }
    const geo = all.build();
    const cap = transparent ? capacity * 2 : capacity;
    const slots = new Float32Array(cap), item = new Float32Array(cap * 4), col = new Float32Array(cap * 3);
    const slotAttr = dyn(slots, 1), itemAttr = dyn(item, 4), colAttr = dyn(col, 3);
    geo.setAttribute('aSlot', slotAttr);
    geo.setAttribute('aItem', itemAttr);
    geo.setAttribute('aItemCol', colAttr);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, createPeopleMaterial(u, true, transparent));
    if (!transparent) {
      mesh.customDepthMaterial = createPeopleDepthMaterial(u, true);
      mesh.customDistanceMaterial = createPeopleDistanceMaterial(u, true);
    } else {
      mesh.renderOrder = 5;
    }
    finishMesh(mesh, (transparent ? 'objets-transparents-' : 'objets-') + index);
    layers.push({ mesh, geo, slots, slotAttr, item, itemAttr, col, colAttr, count: 0, transparent, vertices: all.vertexCount, triangles: all.idx.length / 3 });
  };
  // transparents : une seule famille
  const tr = built.filter((g) => g.m.transparent);
  // opaques : regroupés par taille croissante jusqu'au budget de sommets
  const op = built.filter((g) => !g.m.transparent).sort((a, b) => a.b.vertexCount - b.b.vertexCount);
  let group: { m: HeldModel; b: GeoBuilder }[] = [];
  let verts = 0;
  for (const g of op) {
    if (group.length > 0 && verts + g.b.vertexCount > FAMILY_BUDGET) {
      make(group, false, layers.length);
      group = [];
      verts = 0;
    }
    group.push(g);
    verts += g.b.vertexCount;
  }
  if (group.length > 0) make(group, false, layers.length);
  if (tr.length > 0) make(tr, true, layers.length);
  return layers;
}

export function createBlobLayer(capacity: number, u: PeopleUniforms, map: THREE.Texture): InstancedLayer {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  const slots = new Float32Array(capacity);
  const slotAttr = dyn(slots, 1);
  geo.setAttribute('aSlot', slotAttr);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, createBlobMaterial(u, map));
  mesh.renderOrder = -1;
  finishMesh(mesh, 'ombres-de-contact');
  return { mesh, geo, slots, slotAttr, count: 0, vertices: 4, triangles: 2 };
}

/** Remplace les tampons d'instance d'une couche après un agrandissement. */
export function resizeLayer(layer: InstancedLayer, capacity: number): void {
  const cap = (layer as ItemLayer).transparent ? capacity * 2 : capacity;
  layer.slots = new Float32Array(cap);
  layer.slotAttr = dyn(layer.slots, 1);
  layer.geo.setAttribute('aSlot', layer.slotAttr);
  const il = layer as ItemLayer;
  if (il.item) {
    il.item = new Float32Array(cap * 4);
    il.itemAttr = dyn(il.item, 4);
    il.geo.setAttribute('aItem', il.itemAttr);
    il.col = new Float32Array(cap * 3);
    il.colAttr = dyn(il.col, 3);
    il.geo.setAttribute('aItemCol', il.colAttr);
  }
  // libère les tampons GPU périmés ; ils seront recréés au prochain rendu
  layer.geo.dispose();
  layer.count = 0;
  layer.geo.instanceCount = 0;
}

/** Envoie au GPU les `count` premières instances d'une couche. */
export function commitLayer(layer: InstancedLayer): void {
  const n = layer.count;
  layer.geo.instanceCount = n;
  layer.mesh.visible = n > 0;
  if (n === 0) return;
  layer.slotAttr.clearUpdateRanges();
  layer.slotAttr.addUpdateRange(0, n);
  layer.slotAttr.needsUpdate = true;
  const il = layer as ItemLayer;
  if (il.item) {
    il.itemAttr.clearUpdateRanges();
    il.itemAttr.addUpdateRange(0, n * 4);
    il.itemAttr.needsUpdate = true;
    il.colAttr.clearUpdateRanges();
    il.colAttr.addUpdateRange(0, n * 3);
    il.colAttr.needsUpdate = true;
  }
}
