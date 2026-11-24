/* =====================================================================================
 * Effets visuels — shader de la couche de particules (UN appel de dessin pour tout).
 *
 * Mélange prémultiplié (source 1, destination 1 − alpha) : une même passe dessine les volumes
 * opaques (fumée, gaz : alpha > 0) et les lumières additives (étincelles, éclairs : alpha = 0).
 * Les quads étant triés du plus loin au plus proche, une fumée devant une flamme la masque bien.
 *
 * Attributs d'instance (16 flottants) :
 *   iA = centre (xyz), taille
 *   iB = axe monde (xyz), rotation
 *   iC = couleur linéaire (rgb), opacité ou intensité
 *   iD = vignette, famille + 4 × orientation, altitude du sol (fondu), graine
 * ===================================================================================== */

export function spriteVertexShader(lights: number): string {
  return /* glsl */`
#define NL ${lights}
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uSunDir;
uniform vec4 uLightPos[NL];
uniform vec3 uLightCol[NL];
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
varying vec2 vUv;
varying vec2 vTileUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vLight;
varying vec3 vLightDir;
varying vec3 vSunB;
varying vec3 vUpB;
varying vec4 vGround;
#include <fog_pars_vertex>
void main() {
	vec2 corner = position.xy;
	float km = iD.y;
	float mode = floor( km * 0.25 + 0.01 );
	float kind = km - mode * 4.0;
	vec3 center = iA.xyz;
	float size = iA.w;
	float cr = cos( iB.w );
	float sr = sin( iB.w );
	vec2 rc = vec2( corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr );
	vec3 bx = uCamRight;
	vec3 by = uCamUp;
	vec3 bz = cross( uCamRight, uCamUp );
	vec3 worldPos;
	vec2 rot = vec2( cr, sr );
	if ( mode < 0.5 ) {
		worldPos = center + ( bx * rc.x + by * rc.y ) * size;
	} else if ( mode < 1.5 ) {
		// étiré le long d'un axe du monde, tourné vers la caméra
		vec3 ax = iB.xyz;
		float al = length( ax );
		vec3 axn = al > 1e-5 ? ax / al : vec3( 0.0, 1.0, 0.0 );
		vec3 side = cross( axn, cameraPosition - center );
		float sl = length( side );
		side = sl > 1e-5 ? side / sl : uCamRight;
		worldPos = center + ax * corner.y + side * ( corner.x * size );
		bx = side;
		by = axn;
		bz = cross( side, axn );
		rot = vec2( 1.0, 0.0 );
	} else if ( mode < 2.5 ) {
		// à plat sur le sol
		worldPos = center + vec3( rc.x, 0.0, rc.y ) * size;
		bx = vec3( 1.0, 0.0, 0.0 );
		by = vec3( 0.0, 0.0, 1.0 );
		bz = vec3( 0.0, 1.0, 0.0 );
	} else {
		// face à la caméra, allongé selon la projection de l'axe à l'écran
		vec2 a2 = vec2( dot( iB.xyz, uCamRight ), dot( iB.xyz, uCamUp ) );
		float al = length( a2 );
		vec2 an = al > 1e-4 ? a2 / al : vec2( 1.0, 0.0 );
		vec2 q = rc * size;
		q += an * dot( q, an ) * ( al / max( size, 1e-3 ) );
		worldPos = center + bx * q.x + by * q.y;
	}
	vec4 mvPosition = viewMatrix * vec4( worldPos, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	vUv = corner + 0.5;
	float tile = floor( iD.x + 0.5 );
	float tx = mod( tile, 4.0 );
	float ty = floor( tile * 0.25 );
	vTileUv = ( vec2( tx, ty ) + vUv ) * 0.25;
	vColor = iC;
	vInfo = vec4( kind, iD.w, rot );
	// fondu au sol : hauteur du sommet au-dessus du sol, et épaisseur du fondu
	vGround = vec4( worldPos.y - iD.z, max( 0.25, size * 0.3 ), - mvPosition.z, 0.0 );
	// lumières ponctuelles : éclairement au centre de la particule, direction dominante
	vec3 acc = vec3( 0.0 );
	vec3 dirAcc = vec3( 0.0 );
	for ( int i = 0; i < NL; i ++ ) {
		vec3 d = uLightPos[ i ].xyz - center;
		float d2 = dot( d, d );
		float rg = uLightPos[ i ].w;
		float w = max( 0.0, 1.0 - d2 / ( rg * rg ) );
		vec3 cl = uLightCol[ i ] * ( w * w / ( d2 + 1.5 ) );
		acc += cl;
		dirAcc += d * inversesqrt( d2 + 1e-3 ) * dot( cl, vec3( 0.3, 0.5, 0.2 ) );
	}
	vLight = acc;
	float dl = length( dirAcc );
	vec3 ld = dl > 1e-6 ? dirAcc / dl : vec3( 0.0, 1.0, 0.0 );
	vLightDir = vec3( dot( ld, bx ), dot( ld, by ), dot( ld, bz ) );
	vSunB = vec3( dot( uSunDir, bx ), dot( uSunDir, by ), dot( uSunDir, bz ) );
	vUpB = vec3( bx.y, by.y, bz.y );
	#include <fog_vertex>
}
`;
}

export const SPRITE_FRAGMENT_SHADER = /* glsl */`
uniform sampler2D uAtlas;
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec2 vUv;
varying vec2 vTileUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vLight;
varying vec3 vLightDir;
varying vec3 vSunB;
varying vec3 vUpB;
varying vec4 vGround;
#include <fog_pars_fragment>
void main() {
	float kind = vInfo.x;
	vec3 col;
	float alpha;
	if ( kind < 0.5 ) {
		// volume éclairé : normale apparente de l'atlas, soleil enveloppant, ciel, lumières des feux
		vec4 tex = texture2D( uAtlas, vTileUv );
		vec2 nxy = tex.rg * 2.0 - 1.0;
		nxy = vec2( nxy.x * vInfo.z - nxy.y * vInfo.w, nxy.x * vInfo.w + nxy.y * vInfo.z );
		vec3 n = vec3( nxy, sqrt( max( 0.0, 1.0 - dot( nxy, nxy ) ) ) );
		float thick = tex.b;
		alpha = tex.a * vColor.a;
		alpha *= clamp( vGround.x / vGround.y, 0.0, 1.0 );
		alpha *= clamp( ( vGround.z - 0.35 ) * 0.6, 0.0, 1.0 );
		float ndl = dot( n, vSunB );
		float sun = clamp( ndl * 0.6 + 0.4, 0.0, 1.0 ) * mix( 1.0, 0.5, thick * ( 1.0 - clamp( ndl, 0.0, 1.0 ) ) );
		float back = pow( clamp( - vSunB.z, 0.0, 1.0 ), 3.0 ) * ( 1.0 - thick ) * 0.7;
		float hemi = dot( n, vUpB ) * 0.5 + 0.5;
		vec3 amb = mix( uGroundCol, uSkyCol, hemi ) * mix( 1.0, 0.72, thick );
		float pl = clamp( dot( n, vLightDir ) * 0.5 + 0.62, 0.0, 1.12 );
		col = vColor.rgb * ( uSunCol * ( sun + back ) + amb + vLight * pl );
	} else if ( kind < 1.5 ) {
		// flamme : goutte dressée, rongée et balancée par un bruit qui défile vers le haut
		float seed = vInfo.y;
		float t = uTime + seed * 17.0;
		float y = vUv.y;
		float n1 = texture2D( uNoise, vec2( vUv.x * 0.45 + seed * 3.1, y * 0.34 - t * 0.5 ) ).r;
		float n2 = texture2D( uNoise, vec2( vUv.x * 1.3 - seed * 1.7, y * 0.9 - t * 1.25 ) ).g;
		float n3 = texture2D( uNoise, vec2( vUv.x * 2.6 + seed, y * 1.7 - t * 2.1 ) ).b;
		float x = ( vUv.x - 0.5 ) * 2.0 + ( n1 - 0.5 ) * 0.7 * y;
		float w = 0.82 * pow( max( 0.0, 1.0 - y ), 0.55 ) * sqrt( smoothstep( 0.0, 0.16, y ) );
		float body = 1.0 - ( x * x ) / max( 0.002, w * w );
		float heat = body * ( 1.0 - 0.62 * pow( y, 1.25 ) ) - ( n2 * 0.75 + n3 * 0.35 - 0.34 ) * ( 0.25 + 0.95 * y );
		float f = clamp( heat * 1.2, 0.0, 1.0 );
		// du rouge sombre des pointes au jaune du cœur : jamais blanc, une flamme de rue est orangée
		vec3 ramp = mix( vec3( 0.5, 0.03, 0.0 ), vec3( 1.0, 0.24, 0.01 ), smoothstep( 0.04, 0.38, f ) );
		ramp = mix( ramp, vec3( 1.0, 0.5, 0.06 ), smoothstep( 0.38, 0.7, f ) );
		ramp = mix( ramp, vec3( 1.0, 0.78, 0.24 ), smoothstep( 0.72, 1.0, f ) );
		alpha = smoothstep( 0.0, 0.26, f ) * 0.94 * min( 1.0, vColor.a );
		col = ramp * vColor.rgb * ( 0.85 + 0.75 * f ) * max( 1.0, vColor.a );
	} else if ( kind < 2.5 ) {
		// lumière additive
		float g = texture2D( uAtlas, vTileUv ).a;
		col = vColor.rgb * ( g * vColor.a );
		alpha = 0.0;
	} else {
		// matière : débris, verre, gouttes
		vec4 tex = texture2D( uAtlas, vTileUv );
		alpha = tex.a * vColor.a;
		col = vColor.rgb * tex.rgb * ( uSunCol * 0.6 + mix( uGroundCol, uSkyCol, 0.75 ) + vLight );
	}
	float fogK = 0.0;
	#ifdef USE_FOG
		#ifdef FOG_EXP2
			fogK = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#else
			fogK = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
	#endif
	if ( kind > 1.5 && kind < 2.5 ) {
		// additif : la lumière s'éteint dans le brouillard
		gl_FragColor = vec4( col * ( 1.0 - fogK ), 1.0 );
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		gl_FragColor.a = 0.0;
	} else {
		#ifdef USE_FOG
			col = mix( col, fogColor, fogK );
		#endif
		// la couleur est convertie « droite », puis prémultipliée : le tone mapping n'est pas linéaire
		gl_FragColor = vec4( col, 1.0 );
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
		gl_FragColor = vec4( gl_FragColor.rgb * alpha, alpha );
	}
}
`;
