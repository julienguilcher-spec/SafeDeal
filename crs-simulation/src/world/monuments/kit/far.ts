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

/** Voile atmosphérique d'une silhouette d'horizon : rgb = couleur du voile (espace de sortie), a = quantité 0..1. */
export type Haze = THREE.Vector4;

/**
 * Matériau d'une silhouette d'HORIZON (repère hors carte, à plusieurs kilomètres) : uni, illuminé la nuit comme
 * les autres, mais INSENSIBLE au brouillard de scène (qui efface tout au-delà de la distance d'affichage) ; il
 * porte son propre voile atmosphérique, réglé par le système d'après la distance réelle et la météo
 * (`material.userData.haze`, un Vector4 partagé avec le shader). Un matériau par clé : chaque repère a son voile.
 */
export function horizonMaterial(key: string, color: number, night = 0.6, nightColor = NIGHT_WARM, glow = 0): THREE.Material {
  const name = `horizon:${key}`;
  defineMaterial(name, () => {
    const m = litMaterial(name, { color, roughness: 0.95, metalness: 0, night, nightColor, glow, fog: false });
    const haze: Haze = new THREE.Vector4(0.79, 0.86, 0.93, 0);
    m.userData.haze = haze;
    const inner = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      inner.call(m, shader, renderer);
      shader.uniforms.kitHaze = { value: haze };
      shader.fragmentShader = 'uniform vec4 kitHaze;\n' + shader.fragmentShader.replace(
        '#include <fog_fragment>',
        'gl_FragColor.rgb = mix( gl_FragColor.rgb, kitHaze.rgb, kitHaze.a );',
      );
    };
    m.customProgramCacheKey = () => (night > 0 || glow > 0 ? 'kit-horizon-lit' : 'kit-horizon');
    return m;
  });
  return mat(name);
}

/** Voiles atmosphériques de tous les matériaux d'horizon d'un objet (un par matériau, sans doublon). */
export function hazesOf(obj: THREE.Object3D): Haze[] {
  const out: Haze[] = [];
  obj.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | undefined;
    const h = m?.userData?.haze as Haze | undefined;
    if (h && !out.includes(h)) out.push(h);
  });
  return out;
}
