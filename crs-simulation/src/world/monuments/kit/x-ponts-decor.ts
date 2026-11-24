/* Kit monuments — lot « ponts » : décor de pont métallique Belle Époque (pont Alexandre III) et pièces communes
 * au lot : acier peint gris perle, globes de candélabre allumés la nuit, balustres de fonte, candélabres de bronze,
 * guirlandes, arche métallique surbaissée. Même « espace du tablier » que x-ponts-pierre.ts (X = travers,
 * Y = au-dessus de la chaussée, Z = le long de l'axe).
 * Fichier ajouté par le lot « ponts » : les fichiers d'origine du kit ne sont pas modifiés. */
import * as THREE from 'three';
import { Builder } from './builder';
import { Geo } from './geo';
import { box, boxAt, cyl, lathe, sphere, tube } from './shapes';
import { ribbon } from './classical';
import { figureGeo } from './sculpture';
import { defineMaterial, litMaterial, type MatRef } from './materials';
import { balusterTex, metalTex } from './textures';

/** Acier riveté peint « gris perle » (arche et rives du pont Alexandre III) et sa version à l'ombre du tablier. */
defineMaterial('pont_acier', () => litMaterial('pont_acier', { color: 0xffffff, roughness: 0.55, metalness: 0.25, night: 0.9 }, metalTex(0xc2c7c9, 0x9aa3a6, 0.35, 0x596165, 0.1, 331, 3))
  ?? litMaterial('pont_acier', { color: 0xc2c7c9 }));
defineMaterial('pont_acier_ombre', () => litMaterial('pont_acier_ombre', { color: 0x7f888c, roughness: 0.7, metalness: 0.2, night: 0.5 }));
/** Globe de verre opalin : laiteux le jour, allumé la nuit. */
defineMaterial('pont_lanterne', () => litMaterial('pont_lanterne', { color: 0xf4edd8, roughness: 0.3, metalness: 0, night: 3.4, nightColor: 0xffd9a0, glow: 0.06 }));
/** Balustres de fonte gris perle (plan à découpe alpha, deux faces). */
defineMaterial('pont_balustres', () => {
  const t = balusterTex(0xc6cbc8, 57);
  const m = litMaterial('pont_balustres', { color: t ? 0xffffff : 0xc6cbc8, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, alphaTest: t ? 0.5 : 0, night: 0.85 }, t ? { map: t, bump: null } : null);
  m.userData.cutout = true;
  return m;
});

export interface CandelabreOpts {
  /** 'petit' : trois lanternes, ≈ 4,6 m ; 'grand' : cinq lanternes et ronde d'amours au pied, ≈ 6,4 m. */
  kind: 'petit' | 'grand';
  /** 0 = allégé. */
  lod?: 0 | 1;
  mat?: MatRef;
  matGlobe?: MatRef;
}

/** Candélabre de bronze à globes, pied sur y = 0, bras le long de Z. Retourne la hauteur. */
export function candelabre(b: Builder, o: CandelabreOpts): number {
  const big = o.kind === 'grand', lod = o.lod ?? 1;
  const seg = lod === 0 ? 5 : 7, k = big ? 1.4 : 1;
  const metal = new Geo(), globes = new Geo();
  const H = 3.5 * k;
  metal.append(lathe([
    0.34 * k, 0, 0.34 * k, 0.12 * k, 0.2 * k, 0.3 * k, 0.26 * k, 0.55 * k, 0.12 * k, 0.9 * k, 0.085 * k, 1.5 * k, 0.11 * k, 1.62 * k, 0.07 * k, 1.8 * k,
    0.055 * k, H - 0.3 * k, 0.12 * k, H - 0.18 * k, 0.05 * k, H,
  ], seg));
  const globe = (x: number, y: number, z: number, r: number): void => {
    globes.append(sphere(r, lod === 0 ? 5 : 7, lod === 0 ? 3 : 4).scale(1, 1.2, 1).translate(x, y + r * 1.2, z));
    metal.append(cyl(r * 0.5, r * 0.25, r * 0.5, 5).translate(x, y + r * 2.35, z));
    metal.append(cyl(r * 0.3, r * 0.55, r * 0.3, 5, { top: false }).translate(x, y - r * 0.28, z));
  };
  globe(0, H + 0.12 * k, 0, 0.24 * k);
  const arms: [number, number][] = big ? [[0, 1], [0, -1], [1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const reach = 0.72 * k, yArm = H - 0.95 * k;
  for (const [ax, az] of arms) {
    metal.append(tube(0, yArm - 0.35 * k, 0, ax * reach * 0.6, yArm - 0.3 * k, az * reach * 0.6, 0.035 * k, 0.03 * k, 4));
    metal.append(tube(ax * reach * 0.6, yArm - 0.3 * k, az * reach * 0.6, ax * reach, yArm, az * reach, 0.03 * k, 0.03 * k, 4));
    globe(ax * reach, yArm + 0.05 * k, az * reach, 0.2 * k);
  }
  if (big) {
    // ronde d'amours autour du fût
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const f = figureGeo({ height: 1.25, lod: 0, armL: { e: 1.5, a: 1.2 }, armR: { e: 1.5, a: 1.2 }, legL: { e: 0.5, a: 0 }, lean: -0.1 });
      metal.append(f.body.rotateY(a + Math.PI / 2).translate(Math.sin(a) * 0.62, 0.18, Math.cos(a) * 0.62));
    }
    metal.append(cyl(0.95, 1.05, 0.18, 10));
  }
  b.add(o.mat ?? 'bronze_sombre', metal);
  b.add(o.matGlobe ?? 'pont_lanterne', globes);
  return H + 0.7 * k;
}

/**
 * Balustrade de fonte le long de Z (de z0 à z1) sur la rive `side` (±1) d'un tablier de demi-largeur `half` :
 * lisse basse, main courante et deux nappes de balustres (extérieure et intérieure) qui enveloppent le parapet
 * générique de la ville. Dés de pierre aux abscisses `posts`.
 */
export function deckBalustrade(b: Builder, half: number, side: number, z0: number, z1: number, posts: readonly number[], o: { mat?: MatRef; matBalusters?: MatRef; matPost?: MatRef; height?: number } = {}): void {
  const h = o.height ?? 1.12, xo = side * (half + 0.07), xi = side * (half - 0.44);
  const rails = new Geo();
  rails.append(boxAt(xi, 0.0, z0, xo, 0.14, z1, { top: true }));
  rails.append(boxAt(side * (half - 0.5), h - 0.14, z0, side * (half + 0.13), h, z1, { bottom: true }));
  b.add(o.mat ?? 'pont_acier', rails);
  const bal = new Geo();
  for (const x of [xo, xi]) bal.append(ribbon([x, z0, x, z1], 0.14, h - 0.14));
  b.add(o.matBalusters ?? 'pont_balustres', bal);
  const dies = new Geo();
  for (const z of posts) {
    dies.append(boxAt(side * (half - 0.62), 0, z - 0.42, side * (half + 0.22), h + 0.16, z + 0.42));
    dies.append(boxAt(side * (half - 0.7), h + 0.16, z - 0.5, side * (half + 0.3), h + 0.28, z + 0.5, { bottom: true }));
  }
  b.add(o.matPost ?? 'pierre_lisse_claire', dies);
}

/** Altitude de l'extrados d'une arche surbaissée (parabole) : clef à yCrown au milieu, naissances `rise` plus bas. */
export function archY(z: number, z0: number, z1: number, yCrown: number, rise: number): number {
  const t = (2 * (z - z0)) / (z1 - z0) - 1;
  return yCrown - rise * t * t;
}

export interface SteelArchOpts {
  z0: number; z1: number; half: number;
  /** Altitude de l'extrados à la clef et flèche. */
  yCrown: number; rise: number;
  /** Hauteur de l'arc (membrure) à la clef et aux naissances. */
  depthCrown: number; depthSpring: number;
  seg?: number;
  /** Nombre de fermes visibles sous le tablier (0 = aucune). */
  ribs?: number;
  /** Montants de tympan tous les n mètres (0 = aucun). */
  struts?: number;
  /** Altitude du dessous de la rive du tablier (les montants y montent). */
  yDeck: number;
  mat?: MatRef; matShade?: MatRef;
}

/**
 * Arche métallique unique très surbaissée : deux arcs de rive (à X = ±half), douelle continue dessous, fermes
 * intermédiaires, montants de tympan. À construire dans l'espace du tablier avec le biais des rives.
 */
export function steelArch(b: Builder, o: SteelArchOpts): void {
  const seg = o.seg ?? 24, m = o.mat ?? 'pont_acier', shade = o.matShade ?? 'pont_acier_ombre';
  const top = (z: number): number => archY(z, o.z0, o.z1, o.yCrown, o.rise);
  const depth = (z: number): number => { const t = Math.abs((2 * (z - o.z0)) / (o.z1 - o.z0) - 1); return o.depthCrown + (o.depthSpring - o.depthCrown) * t * t; };
  const face = new Geo(), soffit = new Geo(), ribs = new Geo();
  const L = o.z1 - o.z0;
  for (let i = 0; i < seg; i++) {
    const za = o.z0 + (i / seg) * L, zb = o.z0 + ((i + 1) / seg) * L;
    const ta = top(za), tb = top(zb), ba = ta - depth(za), bb = tb - depth(zb);
    for (const sx of [-1, 1]) {
      const x = sx * o.half;
      // arc de rive : âme visible, semelles en léger relief (deux bandes)
      if (sx > 0) face.face(x, bb, zb, x, ba, za, x, ta, za, x, tb, zb, zb, 0, { u1: za, v1: 1 });
      else face.face(x, ba, za, x, ba, zb, x, tb, zb, x, ta, za, za, 0, { u1: zb, v1: 1 });
      const lip = 0.12;
      for (const [y0a, y0b] of [[ta - 0.16, tb - 0.16], [ba, bb]] as const) {
        const xo = sx * (o.half + lip);
        if (sx > 0) face.face(xo, y0b, zb, xo, y0a, za, xo, y0a + 0.16, za, xo, y0b + 0.16, zb).face(x, y0b + 0.16, zb, xo, y0b + 0.16, zb, xo, y0a + 0.16, za, x, y0a + 0.16, za);
        else face.face(xo, y0a, za, xo, y0b, zb, xo, y0b + 0.16, zb, xo, y0a + 0.16, za).face(x, y0a + 0.16, za, xo, y0a + 0.16, za, xo, y0b + 0.16, zb, x, y0b + 0.16, zb);
      }
    }
    // douelle (dessous de l'arche), vue d'en bas
    soffit.face(-o.half, ba, za, o.half, ba, za, o.half, bb, zb, -o.half, bb, zb);
    const n = o.ribs ?? 0;
    for (let k = 1; k <= n; k++) {
      const x = -o.half + (k / (n + 1)) * 2 * o.half;
      ribs.append(boxAt(x - 0.14, 0, 0, x + 0.14, 0.45, 1, { top: false }).transform(new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, 1, bb - ba, ba - 0.45,
        0, 0, zb - za, za,
        0, 0, 0, 1,
      )));
    }
  }
  b.add(m, face); b.add(shade, soffit); b.add(shade, ribs);
  // montants de tympan entre l'arc et la rive du tablier
  const every = o.struts ?? 0;
  if (every > 0) {
    const posts = new Geo();
    const n = Math.max(2, Math.round(L / every));
    for (let i = 1; i < n; i++) {
      const z = o.z0 + (i / n) * L, y = top(z);
      if (o.yDeck - y < 0.25) continue;
      for (const sx of [-1, 1]) posts.append(boxAt(sx * o.half - 0.1, y - 0.05, z - 0.11, sx * o.half + 0.1, o.yDeck, z + 0.11, { top: false }));
    }
    b.add(m, posts);
  }
}

/** Guirlande suspendue (feston) entre deux points d'une rive, dans le plan X = x : ruban épais à deux faces, pendentif au milieu. */
export function swag(x: number, y: number, z0: number, z1: number, drop: number, side: number, seg = 5): Geo {
  const g = new Geo();
  const w = 0.26, t = 0.1 * side;
  for (let i = 0; i < seg; i++) {
    const ta = i / seg, tb = (i + 1) / seg;
    const za = z0 + (z1 - z0) * ta, zb = z0 + (z1 - z0) * tb;
    const ya = y - drop * 4 * ta * (1 - ta), yb = y - drop * 4 * tb * (1 - tb);
    if (side > 0) g.face(x + t, yb - w, zb, x + t, ya - w, za, x + t, ya, za, x + t, yb, zb).face(x, yb, zb, x + t, yb, zb, x + t, ya, za, x, ya, za);
    else g.face(x + t, ya - w, za, x + t, yb - w, zb, x + t, yb, zb, x + t, ya, za).face(x, ya, za, x + t, ya, za, x + t, yb, zb, x, yb, zb);
  }
  const zm = (z0 + z1) / 2;
  g.append(box(0.12, 0.5, 0.22).translate(x + t * 0.6, y - drop - 0.62, zm));
  g.append(box(0.16, 0.3, 0.3).translate(x + t * 0.6, y - 0.22, z0));
  return g;
}
