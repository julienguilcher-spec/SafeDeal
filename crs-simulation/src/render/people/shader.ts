/* Matériaux des personnages : matériaux standard de Three.js (éclairage, brouillard, ombres conservés)
 * dont le vertex shader est greffé (onBeforeCompile) pour appliquer, par sommet, la transformation de
 * l'os lue dans la texture de poses, les couleurs de la palette et les marquages de l'atlas de textes. */

import * as THREE from 'three';
import { PALETTE_SIZE, SLOT_ITEM } from './geo';
import { LOOK_OPT, LOOK_TEXT } from './look';
import { ATLAS_COLS, ATLAS_ROWS } from './atlas';
import { MASK_BITS } from './parts';
import { BONE_ARM_L, BONE_FOOT_L, BONE_FOOT_R, BONE_HAND_R, BONE_HEAD } from './skeleton';

/** Drapeaux d'instance (texel 1, canal w de la ligne de pose). */
export const FLAG_NORMAL = 0;
export const FLAG_FP = 1;
export const FLAG_SHADOW_ONLY = 2;
export const FLAG_NO_BLOB = 3;

export interface PeopleUniforms {
  uPose: { value: THREE.Texture | null };
  uLook: { value: THREE.Texture | null };
  uAtlas: { value: THREE.Texture | null };
  /** Compression de profondeur des bras à la première personne (1 = désactivée). */
  uFpDepth: { value: number };
}

export function createUniforms(): PeopleUniforms {
  return { uPose: { value: null }, uLook: { value: null }, uAtlas: { value: null }, uFpDepth: { value: 0.06 } };
}

const VERT_PARS = /* glsl */`
uniform highp sampler2D uPose;
uniform highp sampler2D uLook;
uniform float uFpDepth;
attribute float aSlot;
attribute vec4 aSeg;
#ifdef CRS_ITEM
attribute vec4 aItem;
attribute vec3 aItemCol;
#endif
varying vec3 vCrsText;
vec3 crsRot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
`;

const VERT_SETUP = /* glsl */`
// Les sommets des pièces non portées (ou des autres modèles de la famille d'objets) sont rejetés hors du
// volume de vue AVANT tout autre calcul : ils ne coûtent qu'une ou deux lectures de texture.
#ifdef CRS_ITEM
	if ( abs( aSeg.z - aItem.x ) > 0.5 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
#endif
int crsSlot = int( aSlot + 0.5 );
vec4 crsPrm = texelFetch( uPose, ivec2( 1, crsSlot ), 0 );
float crsFlag = crsPrm.w;
bool crsFp = crsFlag > 0.5 && crsFlag < 1.5;
int crsBone = int( aSeg.x + 0.5 );
bool crsHide = false;
#ifndef CRS_ITEM
	if ( aSeg.z > 0.5 ) {
		vec4 crsOpt = texelFetch( uLook, ivec2( ${LOOK_OPT}, crsSlot ), 0 );
		int crsPi = int( aSeg.z + 0.5 );
		int crsWi = crsPi / ${MASK_BITS};
		int crsBi = crsPi - crsWi * ${MASK_BITS};
		float crsM = crsWi == 0 ? crsOpt.x : ( crsWi == 1 ? crsOpt.y : crsOpt.z );
		if ( ( ( int( crsM + 0.5 ) >> crsBi ) & 1 ) == 0 ) crsHide = true;
	}
	if ( crsFp && ( crsBone < ${BONE_ARM_L} || crsBone > ${BONE_HAND_R} ) ) crsHide = true;
#endif
#ifdef CRS_DEPTH
	if ( crsFp ) crsHide = true;
#else
	if ( crsFlag > 1.5 && crsFlag < 2.5 ) crsHide = true;
#endif
if ( crsHide ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
vec4 crsRoot = texelFetch( uPose, ivec2( 0, crsSlot ), 0 );
vec4 crsQ = texelFetch( uPose, ivec2( 2 + crsBone * 2, crsSlot ), 0 );
vec4 crsP = texelFetch( uPose, ivec2( 3 + crsBone * 2, crsSlot ), 0 );
float crsW = aSeg.w + 0.5;
float crsTextKind = floor( crsW / 8.0 );
float crsMode = crsW - crsTextKind * 8.0;
vec3 crsScale = crsMode < 1.0 ? vec3( crsPrm.x )
	: ( crsMode < 2.0 ? vec3( crsPrm.x * crsPrm.y, crsPrm.x, crsPrm.x * crsPrm.y )
	: ( crsMode < 3.0 ? vec3( crsPrm.z ) : vec3( 1.0 ) ) );
`;

const VERT_COLOR = /* glsl */`
{
	vec3 crsC = pow( color.rgb, vec3( 2.2 ) );
	int crsPs = int( aSeg.y + 0.5 );
	if ( crsPs < ${PALETTE_SIZE} ) crsC *= texelFetch( uLook, ivec2( crsPs, crsSlot ), 0 ).rgb;
	#ifdef CRS_ITEM
	else if ( crsPs == ${SLOT_ITEM} ) crsC *= aItemCol;
	#endif
	// plancher d'albédo : aucun matériau réel n'est d'un noir absolu (garde du modelé aux tenues sombres)
	vColor = vec4( max( crsC, vec3( 0.026, 0.026, 0.029 ) ), color.a );
}
vCrsText = vec3( 0.0 );
if ( crsTextKind > 0.5 ) {
	float crsCell;
	#ifdef CRS_ITEM
		crsCell = aItem.y;
	#else
		vec4 crsTx = texelFetch( uLook, ivec2( ${LOOK_TEXT}, crsSlot ), 0 );
		crsCell = crsTextKind < 1.5 ? crsTx.x : ( crsTextKind < 2.5 ? crsTx.y : ( crsTextKind < 3.5 ? 0.0 : crsTx.z ) );
	#endif
	if ( crsCell > 0.5 ) {
		float crsCc = mod( crsCell, ${ATLAS_COLS}.0 );
		float crsCr = floor( crsCell / ${ATLAS_COLS}.0 );
		vCrsText = vec3( ( crsCc + uv.x ) / ${ATLAS_COLS}.0, 1.0 - ( crsCr + 1.0 - uv.y ) / ${ATLAS_ROWS}.0, 1.0 );
	}
}
`;

const VERT_BEGINNORMAL = /* glsl */`
vec3 objectNormal = crsRot( crsQ, normal / crsScale );
`;

const VERT_DEFAULTNORMAL = /* glsl */`
vec3 transformedNormal = objectNormal;
if ( ! crsFp ) transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
`;

const VERT_BEGIN = /* glsl */`
vec3 transformed = crsRoot.xyz + crsP.xyz + crsRot( crsQ, position * crsScale );
`;

const VERT_PROJECT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
if ( ! crsFp ) mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
if ( crsFp ) gl_Position.z = ( gl_Position.z + gl_Position.w ) * uFpDepth - gl_Position.w;
`;

const VERT_WORLDPOS = /* glsl */`
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
	if ( crsFp ) worldPosition = inverse( viewMatrix ) * mvPosition;
#endif
`;

const FRAG_PARS = /* glsl */`
uniform sampler2D uAtlas;
varying vec3 vCrsText;
`;

// Marquage sur la face avant seulement : les matériaux transparents sont dessinés des deux côtés (bouclier),
// et l'envers d'une face marquée montrerait le texte en miroir (« ECILOP » vu de dos ou en vue subjective).
// Three.js dessine un transparent double face en deux passes ; la passe de l'envers (FLIP_SIDED) inverse le
// sens des faces avant (gl.frontFace), si bien que gl_FrontFacing y vaut vrai : on l'écarte par la définition.
const FRAG_TEXT = /* glsl */`
#ifdef FLIP_SIDED
	bool crsRecto = false;
#else
	bool crsRecto = gl_FrontFacing;
#endif
if ( vCrsText.z > 0.5 && crsRecto ) {
	float crsTa = texture2D( uAtlas, vCrsText.xy ).r;
	float crsLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 crsTc = crsLum > 0.2 ? vec3( 0.012, 0.016, 0.035 ) : vec3( 0.9 );
	diffuseColor.rgb = mix( diffuseColor.rgb, crsTc, crsTa );
	#ifndef CRS_ROUGH
		diffuseColor.a = max( diffuseColor.a, crsTa );
	#endif
}
`;

const FRAG_ROUGH = /* glsl */`
#ifdef CRS_ROUGH
	roughnessFactor = clamp( vColor.a, 0.06, 1.0 );
#endif
`;

function patchVertex(src: string, full: boolean): string {
  let s = src;
  s = s.replace('#include <common>', '#include <common>\n' + VERT_PARS);
  s = s.replace('void main() {', 'void main() {\n' + VERT_SETUP);
  s = s.replace('#include <begin_vertex>', VERT_BEGIN);
  s = s.replace('#include <project_vertex>', VERT_PROJECT);
  s = s.replace('#include <worldpos_vertex>', VERT_WORLDPOS);
  if (full) {
    s = s.replace('#include <color_vertex>', '#include <color_vertex>\n' + VERT_COLOR);
    s = s.replace('#include <beginnormal_vertex>', VERT_BEGINNORMAL);
    s = s.replace('#include <defaultnormal_vertex>', VERT_DEFAULTNORMAL);
  }
  return s;
}

type Shader = { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> };

function bind(shader: Shader, u: PeopleUniforms): void {
  shader.uniforms.uPose = u.uPose;
  shader.uniforms.uLook = u.uLook;
  shader.uniforms.uAtlas = u.uAtlas;
  shader.uniforms.uFpDepth = u.uFpDepth;
}

/** Matériau principal : corps (item = false) ou objets tenus (item = true), opaque ou transparent. */
export function createPeopleMaterial(u: PeopleUniforms, item: boolean, transparent: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: transparent ? 0.12 : 0.9,
    metalness: 0,
    vertexColors: true,
    transparent,
    depthWrite: !transparent,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
  });
  const defines: Record<string, string> = {};
  if (item) defines.CRS_ITEM = '';
  if (!transparent) defines.CRS_ROUGH = '';
  mat.defines = { ...(mat.defines ?? {}), ...defines };
  mat.onBeforeCompile = (shader) => {
    bind(shader as unknown as Shader, u);
    shader.vertexShader = patchVertex(shader.vertexShader, true);
    let f = shader.fragmentShader;
    f = f.replace('#include <common>', '#include <common>\n' + FRAG_PARS);
    f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_TEXT);
    f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH);
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `crs-people-${item ? 'i' : 'b'}${transparent ? 't' : 'o'}`;
  return mat;
}

/** Matériau de profondeur pour les ombres portées (lumières directionnelles et projecteurs). */
export function createPeopleDepthMaterial(u: PeopleUniforms, item: boolean): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial();
  mat.defines = { ...(mat.defines ?? {}), CRS_DEPTH: '', ...(item ? { CRS_ITEM: '' } : {}) };
  mat.onBeforeCompile = (shader) => {
    bind(shader as unknown as Shader, u);
    shader.vertexShader = patchVertex(shader.vertexShader, false);
  };
  mat.customProgramCacheKey = () => `crs-people-depth-${item ? 'i' : 'b'}`;
  return mat;
}

/** Matériau de distance pour les ombres des lumières ponctuelles. */
export function createPeopleDistanceMaterial(u: PeopleUniforms, item: boolean): THREE.MeshDistanceMaterial {
  const mat = new THREE.MeshDistanceMaterial();
  mat.defines = { ...(mat.defines ?? {}), CRS_DEPTH: '', ...(item ? { CRS_ITEM: '' } : {}) };
  mat.onBeforeCompile = (shader) => {
    bind(shader as unknown as Shader, u);
    shader.vertexShader = patchVertex(shader.vertexShader, false);
  };
  mat.customProgramCacheKey = () => `crs-people-dist-${item ? 'i' : 'b'}`;
  return mat;
}

/** Ombre de contact : ellipse sombre à bord doux sous chaque personnage, étirée sous un corps allongé. */
export function createBlobMaterial(u: PeopleUniforms, map: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: map,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (shader) => {
    const sh = shader as unknown as Shader;
    sh.uniforms.uPose = u.uPose;
    let s = shader.vertexShader;
    s = s.replace('#include <common>', `#include <common>
uniform highp sampler2D uPose;
attribute float aSlot;`);
    s = s.replace('#include <begin_vertex>', /* glsl */`
int crsSlot = int( aSlot + 0.5 );
vec4 crsPrm = texelFetch( uPose, ivec2( 1, crsSlot ), 0 );
if ( crsPrm.w > 0.5 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
vec4 crsRoot = texelFetch( uPose, ivec2( 0, crsSlot ), 0 );
vec3 crsHead = texelFetch( uPose, ivec2( ${3 + BONE_HEAD * 2}, crsSlot ), 0 ).xyz;
vec3 crsFl = texelFetch( uPose, ivec2( ${3 + BONE_FOOT_L * 2}, crsSlot ), 0 ).xyz;
vec3 crsFr = texelFetch( uPose, ivec2( ${3 + BONE_FOOT_R * 2}, crsSlot ), 0 ).xyz;
vec2 crsFeet = ( crsFl.xz + crsFr.xz ) * 0.5;
vec2 crsAx = crsHead.xz - crsFeet;
float crsLen = length( crsAx );
vec2 crsDir = crsLen > 0.04 ? crsAx / crsLen : vec2( 1.0, 0.0 );
float crsHalfL = 0.30 * crsPrm.x + crsLen * 0.5;
float crsHalfW = 0.29 * crsPrm.x * crsPrm.y;
vec2 crsC = ( crsHead.xz + crsFeet ) * 0.5;
vec2 crsOff = crsDir * ( position.x * crsHalfL ) + vec2( - crsDir.y, crsDir.x ) * ( position.z * crsHalfW );
vec3 transformed = vec3( crsRoot.x + crsC.x + crsOff.x, crsRoot.y + 0.025, crsRoot.z + crsC.y + crsOff.y );
`);
    shader.vertexShader = s;
  };
  mat.customProgramCacheKey = () => 'crs-people-blob';
  return mat;
}
