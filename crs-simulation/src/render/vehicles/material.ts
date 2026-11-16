/* Matériau des véhicules : matériau standard de Three.js (éclairage, ombres, brouillard conservés) greffé par
 * onBeforeCompile. Le vertex shader anime les pièces mobiles (roues, braquage, tourelles, portes, rotors,
 * fourche) à partir des attributs d'instance ; le fragment shader gère teinte par instance, vitrages
 * (intact, brisé, brûlé), tôles noircies, carcasse calcinée, plaques et émission des feux.
 *
 * Attributs par sommet : position, normal, uv, aColor (rgb sRGB + type de surface), aPivot, aPart (pièce, paramètre, feu).
 * Attributs par instance (15 emplacements au total, la limite de WebGL 2 étant 16) :
 *   iColor  rgb linéaire de la carrosserie ; a = ouverture des 4 portes (4 bits chacune)
 *   iAnim   angle des roues, braquage (repère Three), angle des rotors, emplacement de plaque + graine (partie fractionnaire)
 *   iTurret gisement et site des tourelles 0 et 1 (repère Three)
 *   iState  dégâts 0..1, carbonisation 0..1, lueur d'incendie 0..1, affaissement (m)
 *   iLight  phares/feux arrière, stop/recul, clignotants G/D, gyrophares A/B (deux niveaux de 4 bits par composante)
 */

import * as THREE from 'three';
import { GLASS_SHIFT_U, PLATE_COLS, PLATE_ROWS } from './atlas-layout';
import { FORK_AXIS_Y, FORK_AXIS_Z } from './models/light';

export interface VehicleUniforms {
  uPlates: { value: THREE.Texture | null };
  /** Couleur du ciel reflétée par les vitrages (linéaire). */
  uSky: { value: THREE.Color };
  /** Gain d'émission des feux. */
  uLampGain: { value: number };
}

export function createVehicleUniforms(): VehicleUniforms {
  return { uPlates: { value: null }, uSky: { value: new THREE.Color(0.55, 0.68, 0.85) }, uLampGain: { value: 3.2 } };
}

const VERT_PARS = /* glsl */`
attribute vec4 aColor;
attribute vec3 aPivot;
attribute vec3 aPart;
attribute vec4 iColor;
attribute vec4 iAnim;
attribute vec4 iTurret;
attribute vec4 iState;
attribute vec4 iLight;
uniform float uLampGain;
varying vec3 vCrsCol;
varying vec3 vCrsEmis;
varying vec4 vCrsSurf;   // rugosité, métal, carbonisation, dégâts
varying vec3 vCrsLocal;
varying vec2 vCrsKind;   // x : 0 opaque, 1..3 vitrage (intact, brisé, brûlé) ; y : 1 = plaque, 2 = peinture
vec3 crsRotX( vec3 p, float a ) { float c = cos( a ), s = sin( a ); return vec3( p.x, p.y * c - p.z * s, p.y * s + p.z * c ); }
vec3 crsRotY( vec3 p, float a ) { float c = cos( a ), s = sin( a ); return vec3( p.x * c + p.z * s, p.y, - p.x * s + p.z * c ); }
vec3 crsRotAxis( vec3 p, vec3 k, float a ) { float c = cos( a ), s = sin( a ); return p * c + cross( k, p ) * s + k * dot( k, p ) * ( 1.0 - c ); }
float crsLo( float p ) { return mod( p, 16.0 ) / 15.0; }
float crsHi( float p ) { return floor( p / 16.0 ) / 15.0; }
`;

/** Remplace <beginnormal_vertex> : calcule la position et la normale animées. */
const VERT_BEGINNORMAL = /* glsl */`
vec3 objectNormal = vec3( normal );
vec3 crsPos = vec3( position );
float crsType = aPart.x;
float crsChar = iState.y;
bool crsWheel = false;
if ( crsType > 0.5 ) {
	vec3 rel = crsPos - aPivot;
	vec3 piv = aPivot;
	float shrink = mix( 1.0, 0.72, smoothstep( 0.86, 1.0, crsChar ) );
	if ( crsType < 2.5 ) {
		// roues : rotation d'essieu, puis braquage des roues directrices
		crsWheel = true;
		float a = iAnim.x * ( aPart.y == 0.0 ? 1.0 : aPart.y );
		rel = crsRotX( rel, a ); objectNormal = crsRotX( objectNormal, a );
		rel.yz *= shrink;
		if ( crsType < 1.5 ) { rel = crsRotY( rel, iAnim.y ); objectNormal = crsRotY( objectNormal, iAnim.y ); }
	} else if ( crsType < 6.5 ) {
		// tourelles : site (canon seulement) puis gisement, tourillon sur l'axe de gisement
		bool second = crsType > 4.5;
		float yaw = second ? iTurret.z : iTurret.x;
		float pit = second ? iTurret.w : iTurret.y;
		bool barrel = ( crsType > 3.5 && crsType < 4.5 ) || crsType > 5.5;
		if ( barrel ) { rel = crsRotX( rel, pit ); objectNormal = crsRotX( objectNormal, pit ); }
		rel = crsRotY( rel, yaw ); objectNormal = crsRotY( objectNormal, yaw );
	} else if ( crsType < 8.5 ) {
		// portes : indice et côté dans le paramètre, ouverture dans iColor.a (4 bits par porte)
		float di = abs( aPart.y ) - 1.0;
		float sg = sign( aPart.y );
		float open = mod( floor( iColor.a / pow( 16.0, di ) + 0.001 ), 16.0 ) / 15.0;
		if ( crsType < 7.5 ) { float a = - sg * open * 1.15; rel = crsRotY( rel, a ); objectNormal = crsRotY( objectNormal, a ); }
		else { rel.z -= open * 1.05; rel.x += sg * min( 1.0, open * 4.0 ) * 0.07; }
	} else if ( crsType < 9.5 ) {
		float a = iAnim.z * aPart.y; rel = crsRotY( rel, a ); objectNormal = crsRotY( objectNormal, a );
	} else if ( crsType < 10.5 ) {
		float a = iAnim.z * aPart.y; rel = crsRotX( rel, a ); objectNormal = crsRotX( objectNormal, a );
	} else if ( crsType < 12.5 ) {
		// deux-roues : roue avant (essieu) puis direction autour de l'axe de fourche incliné
		vec3 k = vec3( 0.0, ${FORK_AXIS_Y.toFixed(4)}, ${FORK_AXIS_Z.toFixed(4)} );
		if ( crsType > 11.5 ) {
			crsWheel = true;
			float a = iAnim.x * ( aPart.y == 0.0 ? 1.0 : aPart.y );
			rel = crsRotX( rel, a ); objectNormal = crsRotX( objectNormal, a );
			rel.yz *= shrink;
		}
		rel = crsRotAxis( rel, k, iAnim.y ); objectNormal = crsRotAxis( objectNormal, k, iAnim.y );
	} else {
		// volant de l'habitacle : rotation autour de la colonne de direction (angle transmis dans iAnim.z)
		vec3 k = vec3( 0.0, sin( aPart.y ), - cos( aPart.y ) );
		rel = crsRotAxis( rel, k, iAnim.z ); objectNormal = crsRotAxis( objectNormal, k, iAnim.z );
	}
	crsPos = piv + rel;
}
float crsDmg = iState.x;
if ( crsDmg > 0.001 && ! crsWheel ) {
	// tôles froissées : déformation continue de l'espace (aucune fissure entre les panneaux superposés)
	float sd = fract( iAnim.w ) * 37.0;
	vec3 w = vec3(
		sin( crsPos.z * 2.7 + sd ) * sin( crsPos.y * 3.9 + sd * 1.7 ),
		0.6 * sin( crsPos.x * 3.3 + sd * 2.3 ) * sin( crsPos.z * 2.1 + sd ),
		sin( crsPos.y * 4.1 + sd * 0.7 ) * sin( crsPos.x * 2.9 + sd ) );
	crsPos += w * crsDmg * 0.04;
}
crsPos.y -= iState.w;
`;

/** Après <uv_vertex> : couleurs, type de surface, émission, coordonnées de vitrage et de plaque. */
const VERT_AFTER_UV = /* glsl */`
{
	float surf = floor( aColor.a * 255.0 + 0.5 );
	vec3 c = pow( aColor.rgb, vec3( 2.2 ) );
	if ( surf < 0.5 ) c *= iColor.rgb;
	vCrsCol = max( c, vec3( 0.004 ) );
	float rough = 0.78, metal = 0.0;
	if ( surf < 0.5 ) { rough = 0.44; metal = 0.06; }
	else if ( surf < 1.5 ) { rough = 0.72; }
	else if ( surf < 2.5 ) { rough = 0.07; }
	else if ( surf < 3.5 ) { rough = 0.93; }
	else if ( surf < 4.5 ) { rough = 0.46; metal = 0.15; }
	else if ( surf < 5.5 ) { rough = 0.22; }
	else if ( surf < 6.5 ) { rough = 0.55; }
	else { rough = 0.95; }
	float burnt = step( 0.999, iState.y );
	vCrsSurf = vec4( rough, metal, iState.y, iState.x );
	vCrsKind = vec2( 0.0, surf < 0.5 ? 2.0 : 0.0 );
	if ( surf > 1.5 && surf < 2.5 ) {
		float gs = burnt > 0.5 ? 2.0 : ( iState.x > 0.3 ? 1.0 : 0.0 );
		vCrsKind.x = 1.0 + gs;
		vMapUv.x += gs * ${GLASS_SHIFT_U.toFixed(8)};
	}
	if ( surf > 5.5 && surf < 6.5 ) {
		vCrsKind.y = 1.0;
		float slot = floor( iAnim.w );
		float col = mod( slot, ${PLATE_COLS.toFixed(1)} );
		float row = floor( slot / ${PLATE_COLS.toFixed(1)} );
		vMapUv = vec2( ( col + uv.x ) / ${PLATE_COLS.toFixed(1)}, 1.0 - ( row + 1.0 - uv.y ) / ${PLATE_ROWS.toFixed(1)} );
	}
	// feux
	float lc = aPart.z;
	float lv = 0.0;
	if ( lc > 0.5 ) {
		float head = crsLo( iLight.x ), tail = crsHi( iLight.x );
		float brake = crsLo( iLight.y ), rev = crsHi( iLight.y );
		if ( lc < 1.5 ) lv = head;
		else if ( lc < 2.5 ) lv = max( tail * 0.3, brake );
		else if ( lc < 3.5 ) lv = brake;
		else if ( lc < 4.5 ) lv = rev;
		else if ( lc < 5.5 ) lv = crsLo( iLight.z );
		else if ( lc < 6.5 ) lv = crsHi( iLight.z );
		else if ( lc < 7.5 ) lv = crsLo( iLight.w );
		else if ( lc < 8.5 ) lv = crsHi( iLight.w );
		else lv = max( head, tail );
	}
	vCrsEmis = c * lv * uLampGain;
	// l'habitacle en feu rougeoie à travers les vitres
	if ( surf > 1.5 && surf < 2.5 ) vCrsEmis += vec3( 1.0, 0.33, 0.05 ) * iState.z * 2.2;
}
`;

const FRAG_PARS = /* glsl */`
uniform sampler2D uPlates;
uniform vec3 uSky;
varying vec3 vCrsCol;
varying vec3 vCrsEmis;
varying vec4 vCrsSurf;
varying vec3 vCrsLocal;
varying vec2 vCrsKind;
float crsHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float crsNoise( vec3 x ) {
	vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( crsHash( i ), crsHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( crsHash( i + vec3( 0, 1, 0 ) ), crsHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( crsHash( i + vec3( 0, 0, 1 ) ), crsHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( crsHash( i + vec3( 0, 1, 1 ) ), crsHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;

/** Remplace <map_fragment> : atlas ou texture de plaques, vitrages, teinte, dégâts et carbonisation. */
const FRAG_MAP = /* glsl */`
vec4 sampledDiffuseColor = texture2D( map, vMapUv );
vec4 crsPlate = texture2D( uPlates, vMapUv );
if ( vCrsKind.y > 0.5 && vCrsKind.y < 1.5 ) sampledDiffuseColor = vec4( crsPlate.rgb, 1.0 );
vec3 crsBase = vCrsCol;
float crsChar = vCrsSurf.z;
float crsDmg = vCrsSurf.w;
if ( vCrsKind.x > 2.5 ) {
	// baie brûlée : couleur directe de la tuile
	crsBase = sampledDiffuseColor.rgb;
} else if ( vCrsKind.x > 1.5 ) {
	// vitrage brisé : rouge = fêlures laiteuses, vert = trous
	crsBase = mix( vCrsCol, vec3( 0.52, 0.56, 0.58 ), sampledDiffuseColor.r * 0.9 );
	crsBase = mix( crsBase, vec3( 0.006 ), sampledDiffuseColor.g );
} else {
	crsBase *= sampledDiffuseColor.rgb;
}
diffuseColor.a *= sampledDiffuseColor.a;
float crsN = crsNoise( vCrsLocal * 3.1 );
float crsN2 = crsNoise( vCrsLocal * 9.7 + 13.0 );
if ( vCrsKind.x < 0.5 ) {
	// tôles assombries par plaques (suie, impacts), puis carbonisation : noir de fumée et rouille
	float blot = smoothstep( 0.42, 0.7, crsN * 0.7 + crsN2 * 0.3 + crsDmg * 0.22 );
	crsBase *= 1.0 - 0.72 * crsDmg * blot;
	vec3 burntCol = mix( vec3( 0.012, 0.011, 0.010 ), vec3( 0.062, 0.03, 0.018 ), smoothstep( 0.55, 0.85, crsN2 * 0.6 + crsN * 0.4 ) );
	crsBase = mix( crsBase, burntCol, smoothstep( 0.0, 1.0, crsChar * 1.35 - crsN * 0.35 ) );
}
diffuseColor.rgb *= crsBase;
`;

const FRAG_AFTER_METAL = /* glsl */`
roughnessFactor = mix( vCrsSurf.x, 0.96, vCrsSurf.z );
metalnessFactor = vCrsSurf.y * ( 1.0 - vCrsSurf.z );
if ( vCrsKind.x > 1.5 ) roughnessFactor = 0.6;
`;

const FRAG_AFTER_EMISSIVE = /* glsl */`
totalEmissiveRadiance += vCrsEmis * ( vCrsKind.x > 0.5 ? vec3( 1.0 ) : sampledDiffuseColor.rgb );
if ( vCrsKind.x > 0.5 && vCrsKind.x < 1.5 ) {
	// reflet du ciel sur les vitrages intacts (terme de Fresnel simplifié, sans carte d'environnement)
	float crsF = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 3.0 );
	totalEmissiveRadiance += uSky * ( 0.035 + 0.5 * crsF ) * ( 1.0 - vCrsSurf.z );
} else if ( vCrsKind.y > 1.5 ) {
	// vernis de carrosserie : léger reflet du ciel en incidence rasante (garde du modelé aux teintes sombres)
	float crsF = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 2.5 );
	totalEmissiveRadiance += uSky * ( 0.01 + 0.16 * crsF ) * ( 1.0 - vCrsSurf.z ) * ( 1.0 - 0.7 * vCrsSurf.w );
}
`;

/** Matériau partagé par tous les modèles (un seul programme GPU). */
export function createVehicleMaterial(atlas: THREE.Texture, uniforms: VehicleUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.6, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlates = uniforms.uPlates;
    shader.uniforms.uSky = uniforms.uSky;
    shader.uniforms.uLampGain = uniforms.uLampGain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + VERT_AFTER_UV)
      .replace('#include <beginnormal_vertex>', VERT_BEGINNORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = crsPos;\nvCrsLocal = crsPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_AFTER_METAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_AFTER_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'crs-vehicle-1';
  return mat;
}
