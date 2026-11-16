/* =====================================================================================
 * RENDU DU DÉCOR — matériaux.
 *
 * Un seul matériau opaque pour tout le module : couleurs par sommet (sRGB sur 8 bits, décodées dans
 * le shader), atlas partagé avec découpe alpha, et un attribut d'effet par sommet (aFx) qui porte
 *   - l'émission : lanternes (allumage public), intérieurs et enseignes (nuit), écrans, feux
 *     tricolores (cycle calculé dans le shader), lueur d'incendie vacillante, clignotant ;
 *   - la brillance : faux reflets de ciel, de façades et de lampes sur les vitrines et le métal.
 * Rien n'est recalculé par image côté JavaScript : seuls quatre uniformes changent.
 * Un second matériau, transparent, sert au verre (abribus, sac des corbeilles) et aux décalcomanies
 * fondues (traînées de suie sur les façades).
 * ===================================================================================== */

import * as THREE from 'three';

export interface PropUniforms {
  /** Temps (s). */
  uPTime: { value: number };
  /** Nuit 0..1 (vitrines et enseignes éclairées). */
  uPNight: { value: number };
  /** Éclairage public 0..1. */
  uPLamps: { value: number };
  /** Couleur du ciel et des façades d'en face (linéaire, avant tone mapping) pour les faux reflets. */
  uPSky: { value: THREE.Color };
  uPWarm: { value: THREE.Color };
}

export function createUniforms(): PropUniforms {
  return {
    uPTime: { value: 0 },
    uPNight: { value: 0 },
    uPLamps: { value: 0 },
    uPSky: { value: new THREE.Color(0.55, 0.68, 0.85) },
    uPWarm: { value: new THREE.Color(0.5, 0.46, 0.4) },
  };
}

/** Condition d'allumage commune au matériau opaque et aux halos (mêmes codes FX_* que geo.ts). */
export const GATE_GLSL = /* glsl */ `
// x : émission proportionnelle à la couleur de la surface ; y : lueur d'incendie
vec2 crsGate( float kind, float phase ) {
  if ( kind < 0.5 ) return vec2( 0.0 );
  if ( kind < 1.5 ) return vec2( uPLamps, 0.0 );
  if ( kind < 2.5 ) return vec2( uPNight, 0.0 );
  if ( kind < 3.5 ) return vec2( 1.0, 0.0 );
  if ( kind < 6.5 || kind > 8.5 ) {
    // cycle de 60 s : vert 0–26 s, orange 26–29 s, rouge 29–60 s ; la phase décale l'axe perpendiculaire
    float t = mod( uPTime + phase * 60.0, 60.0 );
    float green = step( t, 26.0 );
    float amber = step( 26.0, t ) * step( t, 29.0 );
    float red = step( 29.0, t );
    float walk = step( 31.0, t ) * step( t, 55.0 );
    float on = kind < 4.5 ? red : kind < 5.5 ? amber : kind < 6.5 ? green : kind < 9.5 ? 1.0 - walk : walk;
    return vec2( on, 0.0 );
  }
  if ( kind < 7.5 ) {
    return vec2( 0.0, 0.62 + 0.25 * sin( uPTime * 11.0 + phase * 40.0 ) + 0.13 * sin( uPTime * 23.7 + phase * 17.0 ) );
  }
  return vec2( 0.1 + 0.9 * step( 0.5, fract( uPTime * 0.9 + phase ) ), 0.0 );
}
`;

type Shader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };

function patch(shader: Shader, u: PropUniforms, standard: boolean, glass: boolean): void {
  shader.uniforms['uPTime'] = u.uPTime;
  shader.uniforms['uPNight'] = u.uPNight;
  shader.uniforms['uPLamps'] = u.uPLamps;
  shader.uniforms['uPSky'] = u.uPSky;
  shader.uniforms['uPWarm'] = u.uPWarm;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec4 aFx;
uniform float uPTime;
uniform float uPNight;
uniform float uPLamps;
varying vec3 vPFx;
${GATE_GLSL}`)
    .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  // couleurs de sommet stockées en sRGB sur 8 bits
  vColor.rgb = pow( vColor.rgb, vec3( 2.2 ) );
#endif
  {
    float crsKind = floor( aFx.x * 255.0 + 0.5 );
    vec2 crsG = crsGate( crsKind, aFx.z );
    // puissances : lanterne 7, intérieur éclairé 1,6, écran 1,4, feu tricolore 5 (lentille éteinte : 0,04)
    float crsPower = crsKind < 1.5 ? 7.0 : crsKind < 2.5 ? 1.6 : crsKind < 3.5 ? 1.4 : crsKind < 7.5 ? 5.0 : crsKind < 8.5 ? 3.0 : 4.0;
    float crsFloor = ( crsKind > 3.5 && crsKind < 6.5 ) || crsKind > 8.5 ? 0.04 : 0.0;
    vPFx = vec3( ( crsFloor + crsG.x * crsPower ) * aFx.y, crsG.y * 0.36 * aFx.y * aFx.y, aFx.w );
  }`);
  let f = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vPFx;
uniform vec3 uPSky;
uniform vec3 uPWarm;
uniform float uPLamps;`)
    .replace('#include <map_fragment>', `#ifdef USE_MAP
  // léger biais vers le niveau de mip plus fin : enseignes lisibles et motifs ajourés plus francs
  diffuseColor *= texture2D( map, vMapUv, -0.7 );
#endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vPFx.x + vec3( 1.0, 0.36, 0.06 ) * vPFx.y;`);
  if (standard) {
    f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix( roughnessFactor, 0.16, vPFx.z );`);
  }
  f = f.replace('#include <opaque_fragment>', `if ( vPFx.z > 0.02 ) {
    // faux reflet d'environnement : chaussée sombre, façades claires à l'horizon, ciel, éclats de lampes
    vec3 crsV = normalize( vViewPosition );
    vec3 crsR = reflect( -crsV, normal );
    vec3 crsW = normalize( ( vec4( crsR, 0.0 ) * viewMatrix ).xyz );
    float crsF = 0.13 + 0.87 * pow( 1.0 - saturate( dot( normal, crsV ) ), 4.0 );
    vec3 crsEnv = mix( uPSky * 0.16, uPWarm, smoothstep( -0.2, 0.03, crsW.y ) );
    crsEnv = mix( crsEnv, uPSky, smoothstep( 0.2, 0.55, crsW.y ) );
    float crsA = atan( crsW.x, crsW.z );
    crsEnv *= 0.78 + 0.22 * sin( crsA * 7.0 + crsW.y * 4.0 );
    float crsGlint = uPLamps * smoothstep( 0.93, 1.0, sin( crsA * 5.0 + 1.3 ) ) * smoothstep( 0.04, 0.16, crsW.y ) * ( 1.0 - smoothstep( 0.26, 0.42, crsW.y ) );
    crsEnv += vec3( 1.0, 0.78, 0.5 ) * crsGlint * 0.9;
    outgoingLight += crsEnv * crsF * vPFx.z;
    ${glass ? 'diffuseColor.a = saturate( diffuseColor.a + crsF * 0.55 );' : ''}
  }
  #include <opaque_fragment>`);
  shader.fragmentShader = f;
}

export interface PropMaterials {
  opaque: THREE.Material;
  glass: THREE.Material;
  /** Matériau de profondeur des ombres (respecte la découpe alpha de l'atlas). */
  depth: THREE.MeshDepthMaterial;
}

/**
 * Crée les matériaux du module. `lambert` : éclairage diffus seul (qualité basse) ; `hashed` :
 * découpe hachée des motifs ajourés (qualités moyenne et plus).
 */
export function createMaterials(atlas: THREE.Texture, u: PropUniforms, lambert: boolean, hashed: boolean): PropMaterials {
  // Découpe : en qualité basse, seuil franc ; sinon découpe « hachée » (alphaHash) — une grille ou un filet
  // vus de loin deviennent une trame semi-transparente au lieu de disparaître ou de se boucher.
  const common = { map: atlas, vertexColors: true, alphaTest: lambert ? 0.4 : 0.1 };
  const opaque: THREE.Material = lambert
    ? new THREE.MeshLambertMaterial(common)
    : new THREE.MeshStandardMaterial({ ...common, roughness: 0.82, metalness: 0, alphaHash: hashed });
  opaque.name = 'decor';
  opaque.onBeforeCompile = (shader) => patch(shader as unknown as Shader, u, !lambert, false);
  opaque.customProgramCacheKey = () => 'crs-decor-' + (lambert ? 'l' : 's') + (hashed ? 'h' : '');

  const glass: THREE.Material = lambert
    ? new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false })
    : new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0 });
  glass.name = 'decor-verre';
  glass.onBeforeCompile = (shader) => patch(shader as unknown as Shader, u, !lambert, true);
  glass.customProgramCacheKey = () => 'crs-decor-verre-' + (lambert ? 'l' : 's');

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.4 });
  return { opaque, glass, depth };
}

export function disposeMaterials(m: PropMaterials): void {
  m.opaque.dispose();
  m.glass.dispose();
  m.depth.dispose();
}
