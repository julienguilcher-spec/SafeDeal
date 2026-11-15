/* Kit monuments — silhouettes lointaines : très peu de triangles, un ou deux matériaux sans texture. */
import * as THREE from 'three';
import { Builder } from './builder';
import { defineMaterial, mat, NIGHT_WARM, litMaterial } from './materials';

/** Matériau uni de silhouette (partagé par teinte), illuminé la nuit comme les monuments proches. */
export function farMaterial(color: number, night = 0.85, nightColor = NIGHT_WARM): THREE.Material {
  const key = `loin:${color.toString(16)}:${night}:${nightColor.toString(16)}`;
  defineMaterial(key, () => litMaterial(key, { color, roughness: 0.95, metalness: 0, night, nightColor }));
  return mat(key);
}

/** Assembleur pour une silhouette : identique au Builder, mais les maillages ne projettent pas d'ombre. */
export function finishFar(b: Builder, name: string): THREE.Group {
  const g = b.build(`${name}:loin`);
  g.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });
  return g;
}
