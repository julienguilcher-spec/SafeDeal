/* =====================================================================================
 * IMMEUBLES — matériaux partagés
 * -------------------------------------------------------------------------------------
 * Trois matériaux pour toute la ville :
 *   - façades et toitures : matériau standard de Three.js (lumières, ombres et brouillard
 *     de la scène) dont on remplace l'échantillonnage de texture par l'atlas en couches, et
 *     auquel on ajoute les fenêtres éclairées la nuit et le reflet du ciel sur les vitres ;
 *   - garde-corps et mitrons : texture ajourée, test alpha, double face ;
 *   - lointain : couleurs par sommet, fenêtres suggérées par le shader.
 * L'éclairage nocturne ne coûte rien par image : un nombre aléatoire stable par fenêtre
 * (haché depuis la travée, le niveau et la graine du mur) est comparé à une proportion
 * d'allumage transmise par un uniforme partagé.
 * ===================================================================================== */

import * as THREE from 'three';
import type { EnvState } from '../../../core/contracts';
import { LAYER_GRAIN } from './layers';

/** Uniformes communs à tous les matériaux d'immeubles. */
export const buildingUniforms = {
  /** x : proportion de fenêtres allumées ; y : intensité lumineuse ; z : facteur nuit 0..1. */
  uLit: { value: new THREE.Vector4(0.1, 0.2, 0, 0) },
  /** Couleur du ciel reflétée par les vitres (linéaire). */
  uSky: { value: new THREE.Color(0.3, 0.4, 0.55) },
};

/** Proportion de fenêtres allumées selon l'heure (0..24) : repères interpolés linéairement. */
const LIT_KEYS = [
  0, 0.2, 1.5, 0.09, 3, 0.04, 5.5, 0.04, 6.5, 0.18, 7.5, 0.3, 9, 0.13, 12, 0.07, 16, 0.09, 17.5, 0.22, 19, 0.42, 21.5, 0.46, 23, 0.32, 24, 0.2,
];

export function litFractionAt(hour: number): number {
  let h = hour % 24;
  if (h < 0) h += 24;
  for (let i = 2; i < LIT_KEYS.length; i += 2) {
    if (h <= LIT_KEYS[i]) {
      const h0 = LIT_KEYS[i - 2], h1 = LIT_KEYS[i];
      const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
      return LIT_KEYS[i - 1] * (1 - t) + LIT_KEYS[i + 1] * t;
    }
  }
  return LIT_KEYS[1];
}

let lastHour = -1, lastDay = -1, lastClouds = -1;

/** Met à jour les uniformes partagés d'après l'heure et le ciel. Sans effet si rien n'a changé. */
export function updateBuildingUniforms(env: EnvState): void {
  if (env.timeOfDay === lastHour && env.daylight === lastDay && env.clouds === lastClouds) return;
  lastHour = env.timeOfDay; lastDay = env.daylight; lastClouds = env.clouds;
  const d = env.daylight < 0 ? 0 : env.daylight > 1 ? 1 : env.daylight;
  let t = (d - 0.1) / 0.45;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const night = 1 - t * t * (3 - 2 * t);
  buildingUniforms.uLit.value.set(litFractionAt(env.timeOfDay), 0.2 + 1.5 * night, night, 0);
  const c = env.clouds < 0 ? 0 : env.clouds > 1 ? 1 : env.clouds;
  // ciel clair bleuté → ciel couvert gris ; la nuit, un reflet très faible
  const k = 0.42 * d;
  buildingUniforms.uSky.value.setRGB(
    0.012 + k * (0.5 + 0.28 * c), 0.014 + k * (0.66 + 0.14 * c), 0.022 + k * (0.92 - 0.1 * c),
  );
}

const VERT_PARS = /* glsl */ `
attribute vec4 aFacade;
varying vec2 vBuv;
varying vec4 vBfac;
`;

const VERT_MAIN = /* glsl */ `
vBuv = uv;
vBfac = aFacade;
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2DArray uAtlas;
uniform vec4 uLit;
uniform vec3 uSky;
varying vec2 vBuv;
varying vec4 vBfac;
// hachage sans sinus : identique d'une carte graphique à l'autre
float bHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
`;

/** Échantillonnage de l'atlas : couche, travées (u calé dans [0, n] : les trumeaux répètent la colonne de mur), porte. */
const FRAG_MAP = /* glsl */ `
float bLayer = floor(vBfac.x + 0.5);
float bNb = floor(vBfac.y + 0.5);
bool bCont = bNb > 254.5;
float bU = bCont ? vBuv.x : clamp(vBuv.x, 0.0, bNb);
float bV = bCont ? vBuv.y : max(vBuv.y, 0.03);
float bBay = floor(bU);
if (!bCont && vBuv.x > 0.0 && vBuv.x < bNb && abs(bBay - floor(vBfac.w + 0.5)) < 0.5) bLayer += 1.0;
vec4 bTex = texture(uAtlas, vec3(bU, bV, bLayer));
float bGlass = bTex.a;
#ifdef B_DETAIL
  float bGrain = texture(uAtlas, vec3(vBuv.x * 4.0, vBuv.y * 4.6, float(B_GRAIN_LAYER))).r;
  bTex.rgb *= mix(1.0, 0.88 + 0.24 * bGrain, 1.0 - bGlass);
#endif
diffuseColor.rgb *= bTex.rgb;
`;

/** Fenêtres éclairées (stables par fenêtre) et reflet du ciel sur les vitres. */
const FRAG_EMISSIVE = /* glsl */ `
{
  float bFloor = floor(bV);
  float bH = bHash(vec3(bBay, bFloor, floor(vBfac.z + 0.5)));
  // les rez-de-chaussée s'allument moins que les étages
  float bOn = step(bH, uLit.x * (bFloor < 0.5 ? 0.4 : 1.0)) * bGlass;
  vec3 bWarm = mix(vec3(1.0, 0.66, 0.34), vec3(0.62, 0.78, 1.0), step(0.92, fract(bH * 13.7)));
  // pièce éclairée : plafond plus clair que le bas, voilages plus lumineux que le fond
  float bInside = (0.35 + 0.75 * fract(bV)) * (0.5 + 1.6 * dot(bTex.rgb, vec3(0.3, 0.5, 0.2)));
  totalEmissiveRadiance += bOn * bWarm * uLit.y * (0.45 + 0.55 * fract(bH * 7.3)) * bInside;
  float bNdv = saturate(dot(normalize(vViewPosition), normal));
  float bFres = 0.04 + 0.96 * pow(1.0 - bNdv, 4.0);
  totalEmissiveRadiance += bGlass * (1.0 - 0.75 * bOn) * uSky * bFres;
  #ifdef STANDARD
    roughnessFactor = mix(roughnessFactor, 0.2, bGlass);
  #endif
}
`;

export interface FacadeMaterialOptions {
  /** Matériau de Lambert (léger) au lieu du matériau standard. */
  lambert: boolean;
  /** Grain fin de près (un échantillon de texture de plus). */
  detail: boolean;
}

/** Matériau des façades et toitures (maillage opaque principal). */
export function createFacadeMaterial(atlas: THREE.DataArrayTexture, o: FacadeMaterialOptions): THREE.Material {
  const mat = o.lambert
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  mat.name = 'immeubles-facades';
  if (o.detail) mat.defines = { ...(mat.defines ?? {}), B_DETAIL: '', B_GRAIN_LAYER: LAYER_GRAIN };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: atlas };
    shader.uniforms.uLit = buildingUniforms.uLit;
    shader.uniforms.uSky = buildingUniforms.uSky;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => `crs-immeubles-facades-${o.lambert ? 'l' : 's'}${o.detail ? 'd' : ''}`;
  return mat;
}

/** Matériau ajouré des garde-corps et des mitrons. */
export function createRailMaterial(texture: THREE.Texture): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.38, side: THREE.DoubleSide });
  mat.name = 'immeubles-garde-corps';
  return mat;
}

const FAR_MAP = /* glsl */ `
float fLevels = floor(vBfac.x + 0.5);
float fRoof = max(step(fLevels, vBuv.y), step(0.5, vBfac.w));
float fKind = floor(vBfac.y + 0.5);
vec3 fRoofCol = fKind < 0.5 ? vec3(0.31, 0.35, 0.385) : fKind < 1.5 ? vec3(0.085, 0.1, 0.125) : fKind < 2.5 ? vec3(0.27, 0.265, 0.24) : vec3(0.215, 0.1, 0.07);
vec2 fCell = fract(vBuv);
float fWall = (1.0 - fRoof) * step(0.0, vBuv.y);
float fWin = step(0.3, fCell.x) * step(fCell.x, 0.72) * step(0.2, fCell.y) * step(fCell.y, 0.82) * fWall;
float fPx = max(fwidth(vBuv.x), fwidth(vBuv.y));
float fSharp = 1.0 - smoothstep(0.16, 0.45, fPx);
float fShade = mix(0.87, mix(1.0, 0.36, fWin), fSharp);
diffuseColor.rgb = mix(diffuseColor.rgb * fShade, fRoofCol * (0.86 + 0.28 * fract(vBfac.z * 0.137)), fRoof);
`;

const FAR_EMISSIVE = /* glsl */ `
{
  float fH = bHash(vec3(floor(vBuv.x), floor(vBuv.y), floor(vBfac.z + 0.5)));
  float fOn = step(fH, uLit.x);
  float fAmount = mix(0.26 * uLit.x, fOn * fWin, fSharp) * fWall;
  totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * uLit.y * fAmount * 0.3;
}
`;

/** Matériau de la version lointaine : couleurs par sommet, fenêtres et couverture peintes par le shader. */
export function createFarMaterial(): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.name = 'immeubles-lointain';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = buildingUniforms.uLit;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uLit;\nvarying vec2 vBuv;\nvarying vec4 vBfac;\n'
        + 'float bHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }\n')
      .replace('#include <map_fragment>', FAR_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FAR_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'crs-immeubles-lointain';
  return mat;
}
