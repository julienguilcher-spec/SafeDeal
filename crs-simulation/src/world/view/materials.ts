/* =====================================================================================
 * VILLE EN 3D — matériaux partagés (Three.js).
 * -------------------------------------------------------------------------------------
 * Tous dérivent des matériaux de Three.js (lumières, ombres et brouillard de la scène) :
 *   - sol : la couleur vient de l'atlas en couches. Pour la nappe de base, la classe est lue dans
 *     la grille de la tuile (quatre cellules voisines fondues : pas d'escalier) ; pour le reste,
 *     elle est portée par les sommets. Au loin, tout se fond vers la texture de couleurs de la
 *     tuile : deux surfaces superposées y ont la même couleur, donc aucun scintillement ;
 *   - mouillé : le sol fonce, devient lisse, reflète le ciel ; des flaques se forment dans les creux ;
 *   - eau : ondes animées, reflet du ciel selon l'angle, éclat du soleil ;
 *   - panneaux découpés (grilles, garde-corps, symboles peints), arbres, halos des candélabres.
 * ===================================================================================== */

import * as THREE from 'three';
import type { EnvState } from '../../core/contracts';
import { TILE_SIZE } from '../mapdata';
import { CLASS_LAYERS, CL_ASPHALT, CL_PAINT, CL_ROADMACRO, CL_SETT, CL_SIDEWALK, CL_STONE, CODE_WATER } from './classes';
import { LAYER_METERS } from './paint';

/** Uniformes communs à tous les matériaux de la ville (mis à jour une fois par image). */
export const cityUniforms = {
  uTime: { value: 0 },
  /** x : sol mouillé 0..1 ; y : pluie 0..1 ; z : nuit 0..1 ; w : libre. */
  uWet: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Couleur du ciel reflétée (linéaire). */
  uSky: { value: new THREE.Color(0.45, 0.55, 0.7) },
  /** x, y : distances de début et de fin du fondu vers la vue lointaine (m). */
  uFade: { value: new THREE.Vector2(90, 170) },
  /** x, z : vent (m/s) ; w : force 0..1. */
  uWind: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMeters: { value: LAYER_METERS.slice() },
};

let lastEnvKey = '';

/** Met à jour les uniformes communs d'après l'environnement. `time` : temps écoulé (s). */
export function updateCityUniforms(env: EnvState, time: number): void {
  cityUniforms.uTime.value = time;
  const d = env.daylight < 0 ? 0 : env.daylight > 1 ? 1 : env.daylight;
  const key = `${env.wetness.toFixed(3)}|${env.rain.toFixed(2)}|${d.toFixed(3)}|${env.clouds.toFixed(2)}|${env.windX.toFixed(1)}|${env.windZ.toFixed(1)}`;
  if (key === lastEnvKey) return;
  lastEnvKey = key;
  let t = (d - 0.1) / 0.45;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const night = 1 - t * t * (3 - 2 * t);
  cityUniforms.uWet.value.set(env.wetness, env.rain, night, 0);
  const c = env.clouds < 0 ? 0 : env.clouds > 1 ? 1 : env.clouds;
  // Ciel près de l'horizon (c'est lui que reflète un sol vu de biais) : bleu pâle → gris couvert ; lueur urbaine la nuit.
  const k = 0.9 * d;
  cityUniforms.uSky.value.setRGB(0.035 + k * (0.62 + 0.1 * c), 0.03 + k * (0.72 + 0.02 * c), 0.035 + k * (0.86 - 0.14 * c));
  const speed = Math.hypot(env.windX, env.windZ);
  cityUniforms.uWind.value.set(env.windX, 0, env.windZ, Math.min(1, speed / 12));
}

const NOISE_GLSL = /* glsl */ `
float cHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// ─────────────────────────────── sol ───────────────────────────────

const GROUND_VERT_PARS = /* glsl */ `
attribute vec4 aData;
varying vec3 vGPos;
varying vec3 vGWorld;
varying vec4 vGData;
varying vec3 vGNor;
`;

const GROUND_VERT_MAIN = /* glsl */ `
vGPos = position;
vGData = aData * 255.0;
vGNor = normal;
vGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/** Les éléments posés sur le sol (marquages, bordures) sont rapprochés de l'œil d'une fraction de leur distance. */
const DECAL_VERT = /* glsl */ `
if (aData.y * 255.0 > 2.5) {
  mvPosition.xyz *= 1.0 - 9.0e-5;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const GROUND_FRAG_PARS = /* glsl */ `
uniform sampler2DArray uAtlas;
uniform sampler2D uIds;
uniform sampler2D uMacro;
uniform vec4 uGrid;
uniform float uMeters[${CLASS_LAYERS}];
uniform vec4 uWet;
uniform vec3 uSky;
uniform vec2 uFade;
uniform float uTime;
varying vec3 vGPos;
varying vec3 vGWorld;
varying vec4 vGData;
varying vec3 vGNor;
${NOISE_GLSL}
float gWetGloss = 0.0;
float gPuddle = 0.0;
float gCode(ivec2 p) {
  return floor(texelFetch(uIds, clamp(p, ivec2(0), ivec2(int(uGrid.y) - 1)), 0).r * 255.0 + 0.5);
}
float gClassOf(float code) {
  float c = mod(code, 32.0);
  if (abs(code - ${CODE_WATER}.0) < 0.5) return ${CL_STONE}.0;
  return c > ${CLASS_LAYERS - 0.5} ? ${CL_SIDEWALK}.0 : c;
}
// Dérivées fournies : l'échantillonnage a lieu dans des branches, où les dérivées implicites ne sont pas définies.
vec4 gLayer(float cls, vec2 uv, vec2 dx, vec2 dy) {
  float m = 1.0 / uMeters[int(cls)];
  return textureGrad(uAtlas, vec3(uv * m, cls), dx * m, dy * m);
}
`;

/** Remplace l'échantillonnage de texture : classe, couleur, fondu lointain, plaques d'égout, peinture usée, mouillé. */
const GROUND_FRAG_MAP = /* glsl */ `
float gMode = floor(vGData.y + 0.5);
float gCls = floor(vGData.x + 0.5);
float gDist = length(vViewPosition);
vec3 gN = normalize(vGNor);
bool gVertical = abs(gN.y) < 0.5;
vec2 gUv = gVertical ? vec2(dot(vGWorld.xz, vec2(-gN.z, gN.x)), vGWorld.y) : vGWorld.xz;
vec2 gDx = dFdx(gUv), gDy = dFdy(gUv);
vec2 gWx = dFdx(vGWorld.xz), gWy = dFdy(vGWorld.xz);
vec4 gTex;
if (gMode < 0.5) {
  // Nappe de base : la classe vient de la grille de la tuile.
  vec2 gt = vGPos.xz * uGrid.x - 0.5;
  ivec2 gi = ivec2(floor(gt));
  vec2 gf = fract(gt);
  float c00 = gCode(gi), c10 = gCode(gi + ivec2(1, 0)), c01 = gCode(gi + ivec2(0, 1)), c11 = gCode(gi + ivec2(1, 1));
  float cN = gCode(ivec2(floor(vGPos.xz * uGrid.x)));
  if (abs(cN - ${CODE_WATER}.0) < 0.5) discard;
  if (min(min(c00, c10), min(c01, c11)) > 127.5) discard;
  float k00 = gClassOf(c00), k10 = gClassOf(c10), k01 = gClassOf(c01), k11 = gClassOf(c11);
  gCls = gClassOf(cN);
  #ifdef G_BLEND
    if (k00 == k10 && k00 == k01 && k00 == k11) {
      gTex = gLayer(k00, gUv, gDx, gDy);
    } else {
      // Limite entre deux revêtements : fondu resserré autour de la ligne de partage.
      vec2 gs = smoothstep(0.25, 0.75, gf);
      gTex = mix(mix(gLayer(k00, gUv, gDx, gDy), gLayer(k10, gUv, gDx, gDy), gs.x), mix(gLayer(k01, gUv, gDx, gDy), gLayer(k11, gUv, gDx, gDy), gs.x), gs.y);
    }
  #else
    gTex = gLayer(gCls, gUv, gDx, gDy);
  #endif
} else {
  if (uGrid.z > 0.5 && gMode < 1.5) {
    // Surface surélevée recouverte par une surface au sol venue après elle dans la carte.
    vec2 gt = vGPos.xz * uGrid.x - 0.5;
    ivec2 gi = ivec2(floor(gt));
    if (max(max(gCode(gi), gCode(gi + ivec2(1, 0))), max(gCode(gi + ivec2(0, 1)), gCode(gi + ivec2(1, 1)))) < 127.5) discard;
  }
  gTex = gLayer(gCls, gUv, gDx, gDy);
}
vec3 gAlb = gTex.rgb;
float gH = gTex.a;
bool gRoad = abs(gCls - ${CL_ASPHALT}.0) < 0.5;
#ifdef G_DETAIL
  if (!gVertical) {
    // Seconde lecture, plus large et tournée : casse la répétition à moyenne distance.
    vec2 gUv2 = vec2(gUv.x * 0.8829 - gUv.y * 0.4695, gUv.x * 0.4695 + gUv.y * 0.8829) * 0.283 + 7.31;
    vec3 gFar = gLayer(gCls, gUv2, vec2(gDx.x * 0.8829 - gDx.y * 0.4695, gDx.x * 0.4695 + gDx.y * 0.8829) * 0.283, vec2(gDy.x * 0.8829 - gDy.y * 0.4695, gDy.x * 0.4695 + gDy.y * 0.8829) * 0.283).rgb;
    gAlb = mix(gAlb, gFar, 0.5 * smoothstep(5.0, 42.0, gDist));
  }
#endif
if (gRoad && !gVertical) {
  // Rapiéçages, tranchées et joints de bitume ; plaques d'égout.
  vec2 gMu = vec2(vGWorld.x * 0.9397 + vGWorld.z * 0.3420, -vGWorld.x * 0.3420 + vGWorld.z * 0.9397);
  float gMm = 1.0 / uMeters[${CL_ROADMACRO}];
  float gMac = textureGrad(uAtlas, vec3(gMu * gMm, ${CL_ROADMACRO}.0), vec2(gWx.x * 0.9397 + gWx.y * 0.3420, -gWx.x * 0.3420 + gWx.y * 0.9397) * gMm, vec2(gWy.x * 0.9397 + gWy.y * 0.3420, -gWy.x * 0.3420 + gWy.y * 0.9397) * gMm).r;
  gAlb *= 0.55 + 0.9 * gMac;
  vec2 gCell = floor(vGWorld.xz / 13.0);
  float gPick = cHash(gCell);
  if (gPick < 0.3) {
    vec2 gCtr = (gCell + 0.2 + 0.6 * vec2(cHash(gCell + 3.7), cHash(gCell + 9.1))) * 13.0;
    vec2 gD = vGWorld.xz - gCtr;
    float gR = length(gD);
    if (gR < 0.38) {
      float gRing = step(0.5, fract(gR * 15.0)) * 0.5 + step(0.33, gR) * 0.3;
      float gBars = step(0.5, fract(atan(gD.y, gD.x) * 2.546)) * step(gR, 0.3) * step(0.08, gR);
      gAlb = mix(vec3(0.045, 0.043, 0.04), vec3(0.11, 0.105, 0.1), clamp(gRing + gBars * 0.4, 0.0, 1.0));
      gH = 0.8;
    }
  }
}
if (abs(gCls - ${CL_PAINT}.0) < 0.5) {
  // Peinture usée : l'enrobé réapparaît par plaques et sur les granulats saillants.
  vec4 gUnder = gLayer(${CL_ASPHALT}.0, gUv, gDx, gDy);
  float gWear = cNoise(vGWorld.xz * 0.7) * 0.55 + cNoise(vGWorld.xz * 3.1) * 0.25 + gUnder.a * 0.3;
  gAlb = mix(gUnder.rgb * 1.15, gAlb, smoothstep(0.34, 0.5, 1.0 - gWear * 0.72));
  gH = gUnder.a;
}
// Variation lente de teinte (identique de près et de loin).
float gVar = 0.9 + 0.2 * (cNoise(vGWorld.xz / 23.0) * 0.6 + cNoise(vGWorld.xz / 71.0) * 0.4);
gAlb *= gVar;
if (gMode < 1.5 || gMode > 2.5) {
  // Au loin : la texture de couleurs de la tuile (une seule couleur par point du sol, quelle que soit la surface).
  float gFadeK = smoothstep(uFade.x, uFade.y, gDist);
  if (gFadeK > 0.0) {
    vec3 gMacro = textureGrad(uMacro, vGPos.xz / ${TILE_SIZE}.0, gWx / ${TILE_SIZE}.0, gWy / ${TILE_SIZE}.0).rgb * gVar;
    gAlb = mix(gAlb, gMacro, gFadeK);
  }
}
gAlb *= (0.6 + 0.8 * vGData.z / 255.0) * (vGData.w / 255.0);
// Mouillé : les sols poreux boivent l'eau, les sols durs deviennent luisants ; flaques dans les creux.
float gHard = (gCls > 4.5 && gCls < 7.5) || abs(gCls - 12.0) < 0.5 || abs(gCls - 13.0) < 0.5 ? 0.25 : 1.0;
float gWetK = uWet.x;
if (gWetK > 0.001) {
  gAlb *= mix(1.0, gHard > 0.5 ? 0.5 : 0.7, gWetK);
  gWetGloss = gWetK * gHard;
  if (!gVertical && gHard > 0.5) {
    float gPn = cNoise(vGWorld.xz / 6.5) * 0.65 + cNoise(vGWorld.xz / 1.9) * 0.35;
    float gLevel = 0.83 - 0.15 * gWetK;
    gPuddle = smoothstep(gLevel, gLevel + 0.05, gPn - (gH - 0.5) * 0.14) * smoothstep(0.3, 0.6, gWetK);
    // Les pavés gardent leurs têtes hors de l'eau.
    if (abs(gCls - ${CL_SETT}.0) < 0.5) gPuddle *= 1.0 - smoothstep(0.55, 0.8, gH);
    gAlb *= 1.0 - 0.45 * gPuddle;
  }
}
diffuseColor.rgb *= gAlb;
`;

const GROUND_FRAG_ROUGH = /* glsl */ `
#ifdef STANDARD
  roughnessFactor = mix(roughnessFactor, 0.34, gWetGloss);
  roughnessFactor = mix(roughnessFactor, 0.05, gPuddle);
#endif
`;

const GROUND_FRAG_EMISSIVE = /* glsl */ `
if (gWetGloss > 0.001) {
  float gNdv = saturate(dot(normalize(vViewPosition), normal));
  float gFres = 0.02 + 0.98 * pow(1.0 - gNdv, 5.0);
  // Gouttes de pluie : frémissement des flaques.
  float gRip = 1.0 + 0.3 * uWet.y * (cNoise(vGWorld.xz * 7.0 + uTime * 4.0) - 0.5);
  totalEmissiveRadiance += uSky * (gFres * (0.1 * gWetGloss + 0.62 * gPuddle) + 0.03 * gPuddle) * gRip;
}
`;

export interface GroundMaterialOptions {
  /** Matériau de Lambert (qualité basse). */
  lambert: boolean;
  /** Fondu des quatre cellules voisines aux limites de revêtements. */
  blend: boolean;
  /** Seconde lecture de texture contre la répétition. */
  detail: boolean;
}

/** Textures propres à une tuile lues par son matériau de sol. */
export interface GroundTileTextures {
  ids: THREE.Texture;
  macro: THREE.Texture;
  /** Cellules par côté de la grille. */
  gridSize: number;
  /** Une surface au sol recouvre des surfaces surélevées dans cette tuile. */
  cutRaised: boolean;
}

/** Matériau du sol d'une tuile (le programme est partagé par toutes les tuiles ; seules les textures de la tuile changent). */
export function createGroundMaterial(atlas: THREE.DataArrayTexture, tile: GroundTileTextures, o: GroundMaterialOptions): THREE.Material {
  const mat = o.lambert ? new THREE.MeshLambertMaterial() : new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.name = 'ville-sol';
  const defines: Record<string, unknown> = { ...(mat.defines ?? {}) };
  if (o.blend) defines.G_BLEND = '';
  if (o.detail) defines.G_DETAIL = '';
  mat.defines = defines;
  const grid = new THREE.Vector4(tile.gridSize / TILE_SIZE, tile.gridSize, tile.cutRaised ? 1 : 0, 0);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: atlas };
    shader.uniforms.uIds = { value: tile.ids };
    shader.uniforms.uMacro = { value: tile.macro };
    shader.uniforms.uGrid = { value: grid };
    shader.uniforms.uMeters = cityUniforms.uMeters;
    shader.uniforms.uWet = cityUniforms.uWet;
    shader.uniforms.uSky = cityUniforms.uSky;
    shader.uniforms.uFade = cityUniforms.uFade;
    shader.uniforms.uTime = cityUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GROUND_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROUND_VERT_MAIN)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + DECAL_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_PARS)
      .replace('#include <map_fragment>', GROUND_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + GROUND_FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GROUND_FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => `crs-ville-sol-${o.lambert ? 'l' : 's'}${o.blend ? 'b' : ''}${o.detail ? 'd' : ''}`;
  return mat;
}

// ─────────────────────────────── vue lointaine ───────────────────────────────

const FAR_FRAG_PARS = /* glsl */ `
uniform vec3 uSky;
varying vec3 vFWorld;
${NOISE_GLSL}
float fWater = 0.0;
`;

const FAR_FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 fTex = texture2D(map, vMapUv);
  fWater = 1.0 - step(0.5, fTex.a);
  float fVar = 0.9 + 0.2 * (cNoise(vFWorld.xz / 23.0) * 0.6 + cNoise(vFWorld.xz / 71.0) * 0.4);
  diffuseColor.rgb *= fTex.rgb * mix(fVar, 0.55, fWater);
#endif
`;

const FAR_FRAG_EMISSIVE = /* glsl */ `
if (fWater > 0.5) {
  float fNdv = saturate(dot(normalize(vViewPosition), normal));
  totalEmissiveRadiance += uSky * (0.05 + 0.6 * pow(1.0 - fNdv, 4.0));
}
`;

/** Sol d'une tuile lointaine : une texture de couleurs ; l'eau (alpha nul) reflète le ciel. */
export function createFarGroundMaterial(macro: THREE.Texture): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ map: macro });
  mat.name = 'ville-sol-loin';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSky = cityUniforms.uSky;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FAR_FRAG_PARS)
      .replace('#include <map_fragment>', FAR_FRAG_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FAR_FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'crs-ville-sol-loin';
  return mat;
}

// ─────────────────────────────── eau ───────────────────────────────

const WATER_FRAG_PARS = /* glsl */ `
uniform vec3 uSky;
uniform float uTime;
uniform vec4 uWet;
varying vec3 vWWorld;
${NOISE_GLSL}
`;

/** Ondes : somme de bruits qui glissent ; la normale s'incline, le reflet du ciel suit l'angle de vue. */
const WATER_FRAG_NORMAL = /* glsl */ `
{
  vec2 wp = vWWorld.xz;
  float wd = length(vViewPosition);
  float wAmp = 1.0 / (1.0 + wd * 0.012);
  vec2 wq = wp * 0.45 + vec2(uTime * 0.22, uTime * 0.05);
  vec2 wr = wp * 1.3 + vec2(-uTime * 0.31, uTime * 0.27);
  float e = 0.35;
  float h0 = cNoise(wq) + 0.5 * cNoise(wr);
  float hx = cNoise(wq + vec2(e, 0.0)) + 0.5 * cNoise(wr + vec2(e, 0.0));
  float hz = cNoise(wq + vec2(0.0, e)) + 0.5 * cNoise(wr + vec2(0.0, e));
  vec3 wn = normalize(vec3(-(hx - h0) * 0.55 * wAmp, 1.0, -(hz - h0) * 0.55 * wAmp));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

const WATER_FRAG_EMISSIVE = /* glsl */ `
{
  float wNdv = saturate(dot(normalize(vViewPosition), normal));
  float wFres = 0.03 + 0.97 * pow(1.0 - wNdv, 5.0);
  totalEmissiveRadiance += uSky * wFres * 0.8;
  diffuseColor.rgb *= 1.0 - 0.6 * wFres;
}
`;

/** Matériau de l'eau (Seine, canal, bassins). */
export function createWaterMaterial(lambert: boolean): THREE.Material {
  const mat = lambert
    ? new THREE.MeshLambertMaterial({ color: 0x3a5246 })
    : new THREE.MeshStandardMaterial({ color: 0x3a5246, roughness: 0.16, metalness: 0 });
  mat.name = 'ville-eau';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSky = cityUniforms.uSky;
    shader.uniforms.uTime = cityUniforms.uTime;
    shader.uniforms.uWet = cityUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_FRAG_PARS)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WATER_FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + WATER_FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => `crs-ville-eau-${lambert ? 'l' : 's'}`;
  return mat;
}

// ─────────────────────────────── panneaux découpés ───────────────────────────────

/** Grilles, garde-corps, portails, symboles peints et grilles d'arbres : texture à découpe alpha, double face. */
export function createCutoutMaterial(texture: THREE.Texture, antialias: boolean): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.3, side: THREE.DoubleSide });
  mat.alphaToCoverage = antialias;
  mat.name = 'ville-decoupe';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aData;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + DECAL_VERT);
  };
  mat.customProgramCacheKey = () => 'crs-ville-decoupe';
  return mat;
}

// ─────────────────────────────── arbres ───────────────────────────────

const CROWN_VERT_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
varying float vCrownNdv;
`;

/** Balancement : le houppier ploie dans le vent, davantage en haut, avec un déphasage par arbre. */
const CROWN_VERT_WIND = /* glsl */ `
#ifdef C_WIND
  #ifdef USE_INSTANCING
    vec2 cBase = instanceMatrix[3].xz;
  #else
    vec2 cBase = vec2(0.0);
  #endif
  float cPhase = cBase.x * 0.37 + cBase.y * 0.23;
  float cLift = position.y * 0.5 + 0.5;
  float cSway = sin(uTime * 1.1 + cPhase) * 0.6 + sin(uTime * 2.7 + cPhase * 1.7 + position.x * 3.0) * 0.4;
  vec2 cDir = uWind.w > 0.01 ? normalize(uWind.xz) : vec2(1.0, 0.0);
  transformed.xz += cDir * cSway * cLift * cLift * (0.012 + 0.06 * uWind.w);
  transformed.xyz += normal * sin(uTime * 3.3 + cPhase + position.y * 9.0 + position.z * 7.0) * (0.004 + 0.02 * uWind.w);
#endif
`;

const CROWN_FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 cTex = texture2D(map, vMapUv);
  diffuseColor.rgb *= cTex.rgb;
  #ifdef C_CUT
    // Silhouette découpée : près du contour, seules les feuilles restent.
    float cNdv = abs(dot(normalize(vViewPosition), normalize(vNormal)));
    if (cTex.a < 0.95 - cNdv * 2.4) discard;
    // le pourtour, fait de feuilles éparses, est plus sombre que le plein du feuillage
    diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.55, cNdv);
  #endif
#endif
`;

export interface CrownMaterialOptions { wind: boolean; cut: boolean }

/** Houppiers : feuillage texturé, teinte par arbre (couleur d'instance), ombrage par sommet, balancement au vent. */
export function createCrownMaterial(leaf: THREE.Texture | null, o: CrownMaterialOptions): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ map: leaf, vertexColors: true });
  // Sans texture (vue lointaine) : la couleur moyenne du feuillage.
  if (leaf === null) mat.color.setRGB(0.3, 0.42, 0.19, THREE.SRGBColorSpace);
  mat.name = 'ville-houppiers';
  const defines: Record<string, string> = {};
  if (o.wind) defines.C_WIND = '';
  if (o.cut && leaf !== null) defines.C_CUT = '';
  mat.defines = defines;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = cityUniforms.uTime;
    shader.uniforms.uWind = cityUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + CROWN_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CROWN_VERT_WIND);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', CROWN_FRAG_MAP);
  };
  mat.customProgramCacheKey = () => `crs-ville-houppiers-${o.wind ? 'w' : ''}${o.cut ? 'c' : ''}${leaf !== null ? 't' : ''}`;
  return mat;
}

/** Troncs : écorce de platane. */
export function createTrunkMaterial(bark: THREE.Texture): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ map: bark });
  mat.name = 'ville-troncs';
  return mat;
}

/** Halos au sol des candélabres : taches additives, sans écriture de profondeur. */
export function createHaloMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: texture, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  mat.name = 'ville-halos';
  return mat;
}
