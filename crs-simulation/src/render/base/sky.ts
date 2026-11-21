/* =====================================================================================
 * Ciel procédural : un dôme centré sur la caméra, dessiné en premier, sans écriture de profondeur.
 *
 * Tout est calculé dans le fragment shader, en une passe : dégradé atmosphérique (zénith → horizon,
 * plus chaud du côté du soleil), disque solaire et halo, brume d'horizon accordée au brouillard de
 * scène, étoiles, lune avec sa phase réelle, nuages procéduraux (bruit fractal projeté sur un plan
 * d'altitude) pilotés par la couverture nuageuse, ciel bouché texturé, éclairs.
 * Les couleurs viennent du modèle d'atmosphère (atmosphere.ts) ; la sortie est HDR linéaire et
 * passe par le tone mapping du renderer.
 * ===================================================================================== */

import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import type { QualityPreset } from './quality';

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // rotation de la caméra seule : le dôme l'accompagne partout
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = p.xyww;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uFogColor;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunDisc;
uniform vec3 uSunGlow;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonGlow;
uniform float uStars;
uniform float uHaze;
uniform float uCoverage;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec2 uCloudOffset;
uniform float uTime;
uniform float uLightning;
uniform vec2 uLightningDir;
uniform float uWarmFalloff;
uniform float uStorm;
uniform float uBoltSeed;
varying vec3 vDir;

#include <common>
#include <dithering_pars_fragment>

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float hash31( vec3 p ) {
  p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
  p += dot( p, p.yxz + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

// bruit fractal normalisé dans [0, 1]
float fbm( vec2 p ) {
  float a = 0.5;
  float s = 0.0;
  float n = 0.0;
  for ( int i = 0; i < CLOUD_OCTAVES; i ++ ) {
    s += a * vnoise( p );
    n += a;
    p = p * 2.03 + vec2( 17.3, 9.1 );
    a *= 0.5;
  }
  return s / n;
}

void main() {
  vec3 dir = normalize( vDir );
  float y = max( dir.y, 0.0 );
  vec2 flat2 = normalize( dir.xz + vec2( 1e-5 ) );
  vec2 sunFlat = normalize( uSunDir.xz + vec2( 1e-5 ) );

  // ── dégradé atmosphérique ──
  float side = dot( flat2, sunFlat ) * 0.5 + 0.5;      // 1 du côté du soleil
  side = side * side * ( 3.0 - 2.0 * side );
  float sunSide = side * side;
  vec3 col = mix( uHorizon, uZenith, pow( y, 0.45 ) );
  // la lueur chaude reste près de l'horizon, du côté du soleil ; elle monte plus haut en plein jour
  // (simple éclaircissement vers le soleil) qu'au crépuscule (bande de braise au ras des toits)
  float band = exp( - y * uWarmFalloff );
  col += ( uHorizonSun - uHorizon ) * band * sunSide;

  // ── étoiles ──
  #ifdef SKY_STARS
  if ( uStars > 0.003 ) {
    vec3 sp = dir * 110.0;
    vec3 cell = floor( sp );
    float h = hash31( cell );
    vec3 jitter = vec3( hash31( cell + 11.0 ), hash31( cell + 23.0 ), hash31( cell + 37.0 ) ) - 0.5;
    float d = length( fract( sp ) - 0.5 - jitter * 0.6 );
    float bright = pow( fract( h * 197.3 ), 5.0 ) * 1.6 + 0.12;
    float twinkle = 0.78 + 0.22 * sin( uTime * ( 2.0 + 4.0 * h ) + h * 90.0 );
    float star = step( 0.9, h ) * smoothstep( 0.16, 0.0, d ) * bright * twinkle;
    // teintes d'étoiles : du bleuté à l'orangé
    vec3 tint = mix( vec3( 0.75, 0.84, 1.0 ), vec3( 1.0, 0.86, 0.7 ), fract( h * 53.7 ) );
    col += tint * star * uStars * smoothstep( 0.03, 0.4, dir.y ) * 0.9;
  }
  #endif

  // ── lune : disque éclairé par le vrai soleil (phase exacte), mers esquissées, halo ──
  float dm = distance( dir, uMoonDir );
  if ( uMoonColor.g > 0.001 ) {
    const float MOON_R = 0.0165;
    if ( dm < MOON_R * 1.2 ) {
      vec3 mr = normalize( cross( vec3( 0.0, 1.0, 0.0 ), uMoonDir ) );
      vec3 mu = cross( uMoonDir, mr );
      vec3 rel = dir - uMoonDir;
      vec2 q = vec2( dot( rel, mr ), dot( rel, mu ) ) / MOON_R;
      float r2 = dot( q, q );
      float edge = 1.0 - smoothstep( 0.86, 1.0, r2 );
      vec3 nrm = normalize( q.x * mr + q.y * mu - sqrt( max( 1.0 - r2, 0.0 ) ) * uMoonDir );
      float lit = smoothstep( -0.04, 0.22, dot( nrm, uSunDir ) );
      float maria = 1.0 - 0.34 * smoothstep( 0.42, 0.7, vnoise( q * 1.9 + 7.3 ) ) - 0.14 * vnoise( q * 5.5 );
      vec3 moon = uMoonColor * ( lit * maria + 0.012 );
      col = mix( col, col * 0.25 + moon, edge );
    }
    col += vec3( 0.62, 0.72, 1.0 ) * uMoonGlow * ( exp( - dm * dm * 260.0 ) * 1.6 + exp( - dm * 7.0 ) * 0.35 );
  }

  // ── soleil : halo large, halo serré, disque ──
  float cosS = max( dot( dir, uSunDir ), 0.0 );
  float c2 = cosS * cosS;
  float c8 = c2 * c2 * c2 * c2;
  float c64 = c8 * c8 * c8 * c8 * c8 * c8 * c8 * c8;
  col += uSunGlow * ( 0.05 * c2 + 0.42 * c8 + 1.1 * c64 );
  float ds = distance( dir, uSunDir );
  vec3 sunDisc = uSunDisc * ( 1.0 - smoothstep( 0.0085, 0.0105, ds ) );

  // ── nuages ──
  float cloud = 0.0;
  vec3 cloudCol = uCloudShade;
  float overcast = smoothstep( 0.8, 1.0, uCoverage );
  if ( dir.y > -0.02 ) {
    vec2 uv = dir.xz / ( y + 0.16 ) * 0.9 + uCloudOffset;
    // déformation du domaine : des volutes plutôt que des taches rondes
    vec2 warp = vec2( vnoise( uv * 1.6 + 3.1 ), vnoise( uv * 1.6 + 9.7 ) ) - 0.5;
    vec2 q = uv + warp * 0.55;
    float n = fbm( q );
    float thr = mix( 0.7, 0.3, uCoverage );
    cloud = smoothstep( thr, thr + 0.17, n );
    // cœur du nuage : plus épais, donc plus sombre par-dessous
    float core = smoothstep( thr + 0.06, thr + 0.4, n );
    #ifdef SKY_HIGH_CLOUDS
    // voile de cirrus, plus haut et plus lent, étiré par le vent d'altitude
    float cirrus = fbm( uv * vec2( 0.3, 1.2 ) + uCloudOffset * 0.4 + 41.0 );
    float veil = smoothstep( 0.5, 0.82, cirrus ) * 0.4 * ( 1.0 - overcast ) * smoothstep( 0.0, 0.6, uCoverage + 0.3 );
    #else
    float veil = 0.0;
    #endif
    #ifdef SKY_CLOUD_SHADING
    // un second échantillon décalé vers le soleil : plus il y a de nuage dans cette direction, plus on est à l'ombre
    float toward = fbm( q + sunFlat * 0.2 );
    float shadow = smoothstep( thr - 0.04, thr + 0.34, toward );
    float shade = clamp( 0.62 * shadow + 0.5 * core, 0.0, 1.0 );
    #else
    float shade = clamp( 0.85 * core, 0.0, 1.0 );
    #endif
    cloudCol = mix( uCloudLit, uCloudShade, shade );
    // ciel bouché : couvercle continu, modelé par de grandes masses plus sombres
    float mass = fbm( uv * 0.4 + 3.7 );
    cloud = mix( cloud, 1.0, overcast );
    float relief = mix( 0.56, 1.3, uStorm );
    cloudCol *= mix( 1.0, 1.0 - relief * 0.5 + relief * mass, overcast );
    // frange argentée et transparence lumineuse vers le soleil
    cloudCol += uSunGlow * ( 0.6 * c8 * c8 ) * ( 1.0 - 0.6 * core ) + uSunGlow * 0.14 * c2 * overcast;
    // éclairs : les nuages s'illuminent de l'intérieur, surtout du côté de l'impact
    float toStrike = max( dot( flat2, uLightningDir ), 0.0 );
    cloudCol += vec3( 0.72, 0.8, 1.0 ) * uLightning * ( 0.12 + 2.4 * toStrike * toStrike * toStrike ) * ( 0.2 + 1.6 * mass * n );
    // le voile fin prend la couleur éclairée
    cloudCol = mix( cloudCol, uCloudLit, step( cloud, veil ) * ( 1.0 - cloud ) );
    cloud = max( cloud, veil );
    // les nuages lointains se perdent dans la brume
    cloud *= smoothstep( -0.02, 0.1, dir.y );
  }
  col = mix( col + sunDisc, cloudCol, cloud );

  // ── trait de foudre : une ligne brisée du nuage vers l'horizon, dans la direction de l'impact ──
  if ( uLightning > 0.25 && dir.y > 0.0 && dir.y < 0.5 ) {
    float az = atan( flat2.x * uLightningDir.y - flat2.y * uLightningDir.x, dot( flat2, uLightningDir ) );
    float h = dir.y;
    float jag = ( vnoise( vec2( h * 16.0, uBoltSeed ) ) - 0.5 ) * 0.16 + ( vnoise( vec2( h * 70.0, uBoltSeed + 7.0 ) ) - 0.5 ) * 0.03;
    float d = abs( az - jag );
    float bolt = smoothstep( 0.0035, 0.0008, d ) + 0.22 * smoothstep( 0.035, 0.0, d );
    col += vec3( 0.82, 0.88, 1.0 ) * bolt * ( uLightning - 0.25 ) * 9.0 * smoothstep( 0.5, 0.34, h );
  }

  // ── brume d'horizon (même couleur que le brouillard de scène) et dessous de l'horizon ──
  float hz = exp( - y / uHaze );
  vec3 hazeCol = uFogColor + uSunGlow * 0.35 * c8 + vec3( 0.72, 0.8, 1.0 ) * uLightning * 0.15;
  col = mix( col, hazeCol, hz );
  if ( dir.y < 0.0 ) col = mix( hazeCol, uGround, smoothstep( 0.0, -0.45, dir.y ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly u: Record<string, THREE.IUniform>;
  private time = 0;

  constructor(preset: QualityPreset) {
    this.u = {
      uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uHorizonSun: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunDisc: { value: new THREE.Vector3() },
      uSunGlow: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonColor: { value: new THREE.Vector3() },
      uMoonGlow: { value: 0 },
      uStars: { value: 0 },
      uHaze: { value: 0.05 },
      uCoverage: { value: 0.1 },
      uCloudLit: { value: new THREE.Vector3(1, 1, 1) },
      uCloudShade: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uCloudOffset: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uLightning: { value: 0 },
      uLightningDir: { value: new THREE.Vector2(1, 0) },
      uWarmFalloff: { value: 5 },
      uStorm: { value: 0 },
      uBoltSeed: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'ciel',
      uniforms: this.u,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: Sky.defines(preset),
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      dithering: true,
    });
    // un icosaèdre suffit : la direction est renormalisée par fragment
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'ciel';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000000;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  private static defines(preset: QualityPreset): Record<string, string | number> {
    const d: Record<string, string | number> = { CLOUD_OCTAVES: preset.cloudOctaves };
    if (preset.cloudShading) d['SKY_CLOUD_SHADING'] = '';
    if (preset.highClouds) d['SKY_HIGH_CLOUDS'] = '';
    if (preset.stars) d['SKY_STARS'] = '';
    return d;
  }

  /** Change de niveau de détail (recompile le shader une fois). */
  setQuality(preset: QualityPreset): void {
    this.material.defines = Sky.defines(preset);
    this.material.needsUpdate = true;
  }

  /**
   * Met à jour les uniformes. `sun` et `moon` : directions RÉELLES (le soleil sous l'horizon éclaire
   * encore le ciel et la lune) ; `cloudX/Z` : défilement cumulé des nuages (m).
   */
  update(
    dt: number, atm: Atmosphere, coverage: number,
    sunX: number, sunY: number, sunZ: number, moonX: number, moonY: number, moonZ: number,
    cloudX: number, cloudZ: number, lightning: number, lightningX: number, lightningZ: number,
  ): void {
    const u = this.u;
    this.time = (this.time + dt) % 3600;
    v3(u['uZenith']!, atm.zenith);
    v3(u['uHorizon']!, atm.horizon);
    v3(u['uHorizonSun']!, atm.horizonSun);
    v3(u['uFogColor']!, atm.fogColor);
    v3(u['uGround']!, atm.ground);
    v3(u['uSunDisc']!, atm.sunDisc);
    v3(u['uSunGlow']!, atm.sunGlow);
    v3(u['uMoonColor']!, atm.moonColor);
    v3(u['uCloudLit']!, atm.cloudLit);
    v3(u['uCloudShade']!, atm.cloudShade);
    (u['uSunDir']!.value as THREE.Vector3).set(sunX, sunY, sunZ);
    (u['uMoonDir']!.value as THREE.Vector3).set(moonX, moonY, moonZ);
    u['uMoonGlow']!.value = atm.moonGlow;
    u['uStars']!.value = atm.stars;
    u['uHaze']!.value = atm.haze;
    u['uCoverage']!.value = coverage;
    u['uTime']!.value = this.time;
    u['uLightning']!.value = lightning;
    u['uWarmFalloff']!.value = atm.warmFalloff;
    u['uStorm']!.value = atm.storm;
    // chaque éclair a son tracé : la graine vient de sa direction
    u['uBoltSeed']!.value = (lightningX * 37.7 + lightningZ * 91.3) % 50;
    (u['uLightningDir']!.value as THREE.Vector2).set(lightningX, lightningZ);
    // les nuages sont à ~1 500 m : un déplacement de 1 500 m décale le motif d'une unité
    const k = 1 / 1500;
    (u['uCloudOffset']!.value as THREE.Vector2).set(wrap(cloudX * k), wrap(cloudZ * k));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

function v3(uniform: THREE.IUniform, c: Float32Array): void {
  (uniform.value as THREE.Vector3).set(c[0]!, c[1]!, c[2]!);
}

/** Garde le décalage du bruit dans une plage où la précision des flottants reste bonne. */
function wrap(v: number): number {
  return v - Math.floor(v / 512) * 512;
}
