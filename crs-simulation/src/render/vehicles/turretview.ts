/* Vue de tourelle (caméra 'turret') : écran de visée de l'opérateur — tourelleau téléopéré du Centaure ou
 * canon de l'engin lanceur d'eau. Un quad plein écran en espace de découpe (indépendant de la caméra) dessine
 * le cadre du moniteur, le balayage, le réticule, l'échelle de site et le ruban de gisement ; un bandeau de
 * texte (canvas, redessiné seulement quand une valeur change) donne gisement, site et munitions.
 * Un seul appel de dessin, et seulement dans ce mode de caméra. */

import * as THREE from 'three';
import type { GameContext, Vehicle, ViewApi } from '@/core/contracts';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy * 2.0, 0.0, 1.0 );
}
`;

const FRAG = /* glsl */`
uniform sampler2D uText;
uniform float uAspect;
uniform float uYaw;      // gisement (rad, positif à droite)
uniform float uPitch;    // site (rad, positif vers le haut)
uniform float uKind;     // 0 lance-grenades, 1 canon à eau, 2 caméra
uniform float uTime;
uniform float uReady;    // 1 = prêt à tirer
varying vec2 vUv;
float lineH( vec2 p, float y, float x0, float x1, float w ) { return step( abs( p.y - y ), w ) * step( x0, p.x ) * step( p.x, x1 ); }
float lineV( vec2 p, float x, float y0, float y1, float w ) { return step( abs( p.x - x ), w ) * step( y0, p.y ) * step( p.y, y1 ); }
float ring( vec2 p, float r, float w ) { return step( abs( length( p ) - r ), w ); }
void main() {
	// p : coordonnées centrées, unité = demi-hauteur d'écran
	vec2 p = ( vUv - 0.5 ) * vec2( 2.0 * uAspect, 2.0 );
	float px = 2.0 / 720.0;
	vec3 ink = uKind > 0.5 && uKind < 1.5 ? vec3( 0.55, 0.9, 1.0 ) : vec3( 0.62, 1.0, 0.62 );
	float a = 0.0;
	// réticule
	float gap = 0.035;
	a += lineH( p, 0.0, - 0.22, - gap, px * 1.1 ) + lineH( p, 0.0, gap, 0.22, px * 1.1 );
	a += lineV( p, 0.0, - 0.22, - gap, px * 1.1 ) + lineV( p, 0.0, gap, 0.06, px * 1.1 );
	a += step( length( p ), px * 2.2 );
	if ( uKind < 0.5 ) {
		// lance-grenades : chevrons de hausse sous l'axe (tir en cloche)
		for ( int i = 1; i <= 4; i ++ ) {
			float y = - 0.07 * float( i );
			float w = 0.07 - 0.012 * float( i );
			a += lineH( p, y, - w, w, px );
			a += lineV( p, - w, y, y + 0.012, px ) + lineV( p, w, y, y + 0.012, px );
		}
	} else if ( uKind < 1.5 ) {
		// canon à eau : cercle de dispersion du jet et ellipse d'impact
		a += ring( p, 0.09, px ) * step( 0.2, abs( sin( atan( p.y, p.x ) * 6.0 ) ) );
		a += ring( vec2( p.x, ( p.y + 0.2 ) * 2.6 ), 0.16, px * 1.6 );
	}
	// coins du champ
	vec2 q = abs( p ) - vec2( uAspect * 0.62, 0.62 );
	float corner = step( abs( q.x ), px * 1.2 ) * step( - 0.09, q.y ) * step( q.y, 0.0 ) + step( abs( q.y ), px * 1.2 ) * step( - 0.09, q.x ) * step( q.x, 0.0 );
	a += corner;
	// ruban de gisement en haut : graduation tous les 10°, repère fixe au centre
	float deg = uYaw * 57.29578;
	vec2 t = vec2( p.x, p.y - 0.78 );
	if ( abs( t.x ) < 0.6 && abs( t.y ) < 0.05 ) {
		float d = t.x * 60.0 + deg;                    // 0,6 d'écran = 36°
		float m = abs( fract( d / 10.0 + 0.5 ) - 0.5 ) * 10.0;
		float major = step( abs( fract( d / 30.0 + 0.5 ) - 0.5 ) * 30.0, 0.5 );
		a += step( m, 0.18 ) * step( t.y, mix( - 0.01, 0.03, major ) ) * step( - 0.03, t.y );
	}
	a += lineV( p, 0.0, 0.69, 0.735, px * 1.6 );
	// échelle de site à gauche : de −20° à +60°, curseur mobile
	vec2 e = vec2( p.x + uAspect * 0.7, p.y );
	if ( abs( e.x ) < 0.05 && abs( e.y ) < 0.4 ) {
		float d = ( e.y / 0.4 ) * 40.0 + 20.0;         // degrés
		float m = abs( fract( d / 10.0 + 0.5 ) - 0.5 ) * 10.0;
		a += step( m, 0.5 ) * step( 0.0, e.x ) * step( e.x, 0.03 );
	}
	float curY = clamp( ( uPitch * 57.29578 - 20.0 ) / 40.0, - 1.0, 1.0 ) * 0.4;
	vec2 c = vec2( e.x + 0.02, p.y - curY );
	a += step( abs( c.y ), 0.012 - c.x * 0.5 ) * step( - 0.02, c.x ) * step( c.x, 0.024 );
	a = clamp( a, 0.0, 1.0 );
	// habillage du moniteur : vignette, lignes de balayage, cadre
	float vig = smoothstep( 0.75, 1.25, length( p / vec2( uAspect, 1.0 ) ) * 1.15 );
	float scan = 0.055 * step( 0.5, fract( vUv.y * 240.0 ) );
	vec2 b = abs( p ) - vec2( uAspect - 0.03, 0.97 );
	float bezel = step( 0.0, max( b.x, b.y ) );
	float dark = clamp( vig * 0.75 + scan + bezel, 0.0, 1.0 );
	vec3 col = ink * a * ( 0.85 + 0.15 * sin( uTime * 3.0 ) );
	// voyant « prêt » : pastille en haut à droite
	vec2 r = p - vec2( uAspect * 0.62, 0.8 );
	float led = step( length( r ), 0.018 );
	col += mix( vec3( 1.0, 0.25, 0.15 ), vec3( 0.3, 1.0, 0.4 ), uReady ) * led;
	// bandeau de texte en bas
	vec2 tu = vec2( ( p.x / ( uAspect * 0.9 ) ) * 0.5 + 0.5, ( p.y + 0.94 ) / 0.17 );
	if ( tu.x > 0.0 && tu.x < 1.0 && tu.y > 0.0 && tu.y < 1.0 ) {
		vec4 tx = texture2D( uText, tu );
		col += ink * tx.a;
		dark = max( dark, 0.45 * ( 1.0 - bezel ) + bezel );
	}
	float alpha = clamp( dark * ( 1.0 - a ), 0.0, 1.0 );
	// mélange prémultiplié : le sombre voile la scène, l'encre s'ajoute
	gl_FragColor = vec4( col, alpha );
}
`;

export class TurretView {
  drawCalls = 0;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private signature = -1;
  private since = 1;
  private lastT = 0;

  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 96;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uText: { value: this.texture }, uAspect: { value: 16 / 9 }, uYaw: { value: 0 }, uPitch: { value: 0 },
        uKind: { value: 0 }, uTime: { value: 0 }, uReady: { value: 1 },
      },
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10000;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  /** Tourelle servie par le joueur : celle de son siège de tireur (le n-ième siège 'gunner' sert la n-ième tourelle). */
  private turretIndex(ctx: GameContext, v: Vehicle): number {
    const p = ctx.player.person();
    if (!p || p.vehicleId !== v.id || p.seat < 0) return 0;
    let n = 0;
    for (let i = 0; i < v.def.seats.length; i++) {
      if (v.def.seats[i]!.role !== 'gunner') continue;
      if (i === p.seat) return Math.min(n, Math.max(0, v.def.turrets.length - 1));
      n++;
    }
    return 0;
  }

  update(v: Vehicle | null, ctx: GameContext, view: ViewApi, time: number): void {
    const dt = Math.max(0, Math.min(0.1, time - this.lastT));
    this.lastT = time;
    if (!v || v.def.turrets.length === 0) {
      this.mesh.visible = false;
      this.drawCalls = 0;
      return;
    }
    const i = this.turretIndex(ctx, v);
    const def = v.def.turrets[i]!;
    const yaw = v.turretYaw[i] ?? 0, pitch = v.turretPitch[i] ?? 0, ammo = v.turretAmmo[i] ?? 0;
    const u = this.material.uniforms;
    u.uAspect!.value = view.camera.aspect;
    u.uYaw!.value = yaw;
    u.uPitch!.value = pitch;
    u.uKind!.value = def.kind === 'lance_grenades' ? 0 : def.kind === 'canon_eau' ? 1 : 2;
    u.uTime!.value = time;
    u.uReady!.value = ammo > 0 ? 1 : 0;
    this.mesh.visible = true;
    this.drawCalls = 1;
    // bandeau : redessiné quand une valeur affichée change, au plus 10 fois par seconde
    this.since += dt;
    const yd = Math.round(yaw * 57.29578), pd = Math.round(pitch * 57.29578);
    const am = def.kind === 'canon_eau' ? Math.round(ammo / 10) * 10 : Math.round(ammo);
    const zoom = Math.round(ctx.player.state.zoom * 10) / 10;
    // signature numérique de ce qui est affiché (aucune chaîne créée tant que rien ne change)
    const kindCode = def.kind === 'lance_grenades' ? 0 : def.kind === 'canon_eau' ? 1 : 2;
    const sig = ((((i * 3 + kindCode) * 721 + (yd + 360)) * 181 + (pd + 90)) * 1000 + Math.round(zoom * 10)) * 100003 + (am % 100003);
    if (sig !== this.signature && this.since >= 0.1) {
      this.signature = sig;
      this.since = 0;
      const title = def.kind === 'lance_grenades' ? 'TOURELLEAU TÉLÉOPÉRÉ — LANCE-GRENADES 56 mm'
        : def.kind === 'canon_eau' ? `CANON À EAU N° ${i + 1}` : 'CAMÉRA D\'OBSERVATION';
      const load = def.kind === 'lance_grenades' ? `TUBES ${am}/${def.capacity}`
        : def.kind === 'canon_eau' ? `CUVE ${am.toLocaleString('fr-FR')} L` : '';
      const sgn = (n: number): string => (n >= 0 ? '+' : '−') + String(Math.abs(n)).padStart(3, '0');
      const g = this.g;
      g.clearRect(0, 0, 1024, 96);
      g.fillStyle = '#ffffff';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      // deux lignes : désignation de l'équipement, puis les valeurs
      g.font = '700 24px "Arial Narrow", Arial, "Liberation Sans Narrow", "DejaVu Sans Condensed", sans-serif';
      g.fillText(title, 10, 24);
      g.font = '700 30px "Arial Narrow", Arial, "Liberation Sans Narrow", "DejaVu Sans Condensed", sans-serif';
      g.fillText(`GISEMENT ${sgn(yd)}°    SITE ${sgn(pd)}°    ZOOM ×${zoom.toFixed(1)}`, 10, 68);
      g.textAlign = 'right';
      g.fillText(load, 1014, 68);
      this.texture.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
