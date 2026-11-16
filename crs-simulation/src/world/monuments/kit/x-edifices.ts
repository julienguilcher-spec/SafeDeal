/* Kit monuments — lot « édifices » : outils communs aux églises, opéras et palais du lot.
 *  - ajustement d'un modèle dessiné sur l'emprise réelle (siteFit) ;
 *  - toits (deux versants, appentis), plaques extrudées (pignons, joues, arcs), murs à UV libres, rubans ;
 *  - peinture rapide de pierre de taille sur canvas (sans bruit par pixel : les atlas restent rapides à générer) ;
 *  - matériaux unis et verrières (trame de fers et de vitrages, éclairée de l'intérieur la nuit).
 * Fichier ajouté par le lot « édifices » : les fichiers d'origine du kit ne sont pas modifiés. */
import * as THREE from 'three';
import { Geo, triangulateRaw } from './geo';
import { canvas2d, css, mixHex, rngOf, texFrom, type Canvas2D } from './canvas';
import { defineMaterial, litMaterial, type LitParams, type MatRef } from './materials';
import { zincTex } from './textures';
import { cleanRing, ensureCCW, ringBounds } from '../shape2d';
import { alignRigid } from '../x-edifices-align';
import type { MonumentSite } from '../types';

// ───────────────────────────── emprise réelle ─────────────────────────────

export interface DesignBox { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Matrice amenant un modèle DESSINÉ dans la boîte `design` (bornes de l'emprise réelle relevées dans la carte, repère
 * local) sur les bornes de l'emprise effectivement fournie par le site. Identité si le site n'a pas d'emprise ou si
 * elle est aberrante (rapport hors 0,6–1,6) : le modèle garde alors ses cotes de dessin.
 */
export function siteFit(site: MonumentSite, design: DesignBox): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (site.footprint.length < 6) return m;
  const b = ringBounds(site.footprint);
  const sx = b.w / (design.maxX - design.minX), sz = b.d / (design.maxZ - design.minZ);
  if (!(sx > 0.6 && sx < 1.6 && sz > 0.6 && sz < 1.6)) return m;
  if (Math.abs(sx - 1) < 0.002 && Math.abs(sz - 1) < 0.002 && Math.abs(b.minX - design.minX) < 0.05 && Math.abs(b.minZ - design.minZ) < 0.05) return m;
  m.makeScale(sx, 1, sz);
  m.setPosition(b.minX - design.minX * sx, 0, b.minZ - design.minZ * sz);
  return m;
}

/**
 * Matrice amenant un modèle DESSINÉ sur l'emprise de référence `design` (repère local de dessin) sur l'emprise réelle
 * du site : pose rigide sommet pour sommet quand c'est le même contour (le modèle suit alors un changement de point
 * d'ancrage ou de cap dans la carte), sinon ajustement sur les bornes (siteFit). Identité sans emprise.
 */
export function siteAlign(site: MonumentSite, design: ArrayLike<number>, box: DesignBox): THREE.Matrix4 {
  if (site.footprint.length < 6) return new THREE.Matrix4();
  const a = alignRigid(design, site.footprint);
  if (!a) return siteFit(site, box);
  return new THREE.Matrix4().set(a.c, 0, -a.s, a.tx, 0, 1, 0, 0, a.s, 0, a.c, a.tz, 0, 0, 0, 1);
}

/** Emprise de référence nettoyée et antihoraire (repère de dessin). */
export function designRing(design: ArrayLike<number>, eps = 0.05): number[] {
  return cleanRing(ensureCCW(design), eps);
}

/** Emprise du site (nettoyée, antihoraire) ou, à défaut, l'emprise de repli du monument. */
export function siteRing(site: MonumentSite, fallback: ArrayLike<number>, eps = 0.05): number[] {
  const src = site.footprint.length >= 6 ? site.footprint : fallback;
  return cleanRing(ensureCCW(src), eps);
}

// ───────────────────────────── géométrie ─────────────────────────────

/** Mur vertical de a vers b (normale sortante (−dz, dx)), UV libres : u de u0 à u1, v de v0 à v1. */
export function wallUv(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u0: number, u1: number, v0 = 0, v1 = 1): Geo {
  return new Geo().face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, u0, v0, { u1, v1 });
}

/** Mur vertical de a vers b, UV en mètres (pierre courante). */
export function wallM(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): Geo {
  return new Geo().face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, y0);
}

/** Ruban vertical le long d'une polyligne, u = longueur / pitch (répétitions entières par côté), v de v0 à v1. */
export function ribbonUv(path: ArrayLike<number>, y0: number, y1: number, closed: boolean, pitch: number, v0 = 0, v1 = 1): Geo {
  const g = new Geo();
  const n = path.length >> 1, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const ax = path[2 * i], az = path[2 * i + 1], bx = path[2 * j], bz = path[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const k = Math.max(1, Math.round(len / pitch));
    g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, v0, { u1: k, v1 });
  }
  return g;
}

/**
 * Toit à deux versants d'axe z : égouts à x = ±halfW (y = 0), faîte sur x = 0 à y = rise, de z0 à z1 (z0 < z1).
 * `gables` ferme les deux pignons par des triangles (même matériau).
 */
export function gableRoof(halfW: number, z0: number, z1: number, rise: number, gables = false): Geo {
  const g = new Geo();
  g.face(halfW, 0, z1, halfW, 0, z0, 0, rise, z0, 0, rise, z1);
  g.face(-halfW, 0, z0, -halfW, 0, z1, 0, rise, z1, 0, rise, z0);
  if (gables) {
    g.face3(-halfW, 0, z1, halfW, 0, z1, 0, rise, z1, 0, 0, 2 * halfW, 0, halfW, rise);
    g.face3(halfW, 0, z0, -halfW, 0, z0, 0, rise, z0, 0, 0, 2 * halfW, 0, halfW, rise);
  }
  return g;
}

/** Toit à croupes d'axe z : comme gableRoof, mais les deux bouts sont des croupes de recul `hip` (m). */
export function hipRoof(halfW: number, z0: number, z1: number, rise: number, hip = halfW): Geo {
  const g = new Geo();
  const a = z0 + hip, b = z1 - hip;
  g.face(halfW, 0, z1, halfW, 0, z0, 0, rise, a, 0, rise, b);
  g.face(-halfW, 0, z0, -halfW, 0, z1, 0, rise, b, 0, rise, a);
  g.face3(-halfW, 0, z1, halfW, 0, z1, 0, rise, b, 0, 0, 2 * halfW, 0, halfW, Math.hypot(rise, hip));
  g.face3(halfW, 0, z0, -halfW, 0, z0, 0, rise, a, 0, 0, 2 * halfW, 0, halfW, Math.hypot(rise, hip));
  return g;
}

/** Pan de toit incliné (appentis) entre le bord bas a→b (altitude y0) et le bord haut d→c (altitude y1) : a, b, c, d antihoraires vus de dessus. */
export function roofQuad(ax: number, az: number, bx: number, bz: number, y0: number, cx: number, cz: number, dx: number, dz: number, y1: number): Geo {
  return new Geo().face(ax, y0, az, bx, y0, bz, cx, y1, cz, dx, y1, dz);
}

/**
 * Plaque : polygone du plan (x, y) — sens indifférent — extrudé de z = −t/2 à z = +t/2. Pignons, gâbles,
 * arcs-boutants, joues d'escalier. UV en mètres.
 */
export function slabXY(pts: ArrayLike<number>, t: number, faces: { front?: boolean; back?: boolean; sides?: boolean } = {}): Geo {
  const g = new Geo();
  const n = pts.length >> 1;
  if (n < 3) return g;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += pts[2 * j] * pts[2 * i + 1] - pts[2 * i] * pts[2 * j + 1];
  const p: number[] = [];
  if (area >= 0) for (let i = 0; i < 2 * n; i++) p.push(pts[i]);
  else for (let i = n - 1; i >= 0; i--) p.push(pts[2 * i], pts[2 * i + 1]);
  const h = t / 2;
  const tris = triangulateRaw(p);
  const ccw = (a: number, b: number, c: number): boolean =>
    (p[2 * b] - p[2 * a]) * (p[2 * c + 1] - p[2 * a + 1]) - (p[2 * c] - p[2 * a]) * (p[2 * b + 1] - p[2 * a + 1]) > 0;
  if (faces.front !== false) {
    const f = g.vertexCount;
    for (let i = 0; i < n; i++) g.vert(p[2 * i], p[2 * i + 1], h, 0, 0, 1, p[2 * i], p[2 * i + 1]);
    for (let i = 0; i < tris.length; i += 3) { const a = tris[i], b = tris[i + 1], c = tris[i + 2]; if (ccw(a, b, c)) g.tri(f + a, f + b, f + c); else g.tri(f + a, f + c, f + b); }
  }
  if (faces.back !== false) {
    const f = g.vertexCount;
    for (let i = 0; i < n; i++) g.vert(p[2 * i], p[2 * i + 1], -h, 0, 0, -1, -p[2 * i], p[2 * i + 1]);
    for (let i = 0; i < tris.length; i += 3) { const a = tris[i], b = tris[i + 1], c = tris[i + 2]; if (ccw(a, b, c)) g.tri(f + a, f + c, f + b); else g.tri(f + a, f + b, f + c); }
  }
  if (faces.sides !== false && t > 1e-6) {
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      g.face(ax, ay, h, ax, ay, -h, bx, by, -h, bx, by, h, 0, u, { u1: t, v1: u + len });
      u += len;
    }
  }
  return g;
}

/** Polygone plan vertical (x, y) dans le plan z = 0, tourné vers +z, UV NORMALISÉES sur la boîte [x0,x1]×[y0,y1] donnée. */
export function panelXY(pts: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1): Geo {
  const g = new Geo();
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    g.vert(x, y, 0, 0, 0, 1, u0 + ((x - x0) / (x1 - x0)) * (u1 - u0), v0 + ((y - y0) / (y1 - y0)) * (v1 - v0));
  }
  const tris = triangulateRaw(pts);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    const s = (pts[2 * b] - pts[2 * a]) * (pts[2 * c + 1] - pts[2 * a + 1]) - (pts[2 * c] - pts[2 * a]) * (pts[2 * b + 1] - pts[2 * a + 1]);
    if (s > 0) g.tri(a, b, c); else g.tri(a, c, b);
  }
  return g;
}

/** Points [x0, z0, …] d'un arc de cercle horizontal : angle a (rad) → (cx + r·sin a, cz + r·cos a), comme `cyl`. */
export function arcRing(cx: number, cz: number, r: number, a0: number, a1: number, seg: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg; out.push(cx + r * Math.sin(a), cz + r * Math.cos(a)); }
  return out;
}

/** Voûte en berceau (demi-ellipse) d'axe z : naissances à x = ±halfW (y = 0), clef à y = rise, de z0 à z1. UV en mètres. */
export function barrelVault(halfW: number, rise: number, z0: number, z1: number, seg = 12, a0 = 0, a1 = Math.PI): Geo {
  const g = new Geo();
  let u = 0;
  const pt = (a: number): [number, number, number, number] => {
    const x = halfW * Math.cos(a), y = rise * Math.sin(a);
    let nx = Math.cos(a) / halfW, ny = Math.sin(a) / rise;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    return [x, y, nx, ny];
  };
  for (let i = 0; i < seg; i++) {
    const p = pt(a0 + ((a1 - a0) * i) / seg), q = pt(a0 + ((a1 - a0) * (i + 1)) / seg);
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const a = g.vert(p[0], p[1], z1, p[2], p[3], 0, 0, u), b = g.vert(p[0], p[1], z0, p[2], p[3], 0, z1 - z0, u);
    const c = g.vert(q[0], q[1], z0, q[2], q[3], 0, z1 - z0, u + l), d = g.vert(q[0], q[1], z1, q[2], q[3], 0, 0, u + l);
    g.quad(a, b, c, d);
    u += l;
  }
  return g;
}

/** Demi-disque elliptique vertical fermant un berceau (tympan vitré) : plan z = 0, tourné vers +z. UV en mètres. */
export function vaultEnd(halfW: number, rise: number, seg = 12): Geo {
  const g = new Geo();
  const c = g.vert(0, 0, 0, 0, 0, 1, 0, 0);
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; g.vert(halfW * Math.cos(a), rise * Math.sin(a), 0, 0, 0, 1, halfW * Math.cos(a), rise * Math.sin(a)); }
  for (let i = 0; i < seg; i++) g.tri(c, c + 1 + i, c + 2 + i);
  return g;
}

/**
 * Nervures méridiennes d'un dôme de révolution : `profile` = [r0, y0, r1, y1, …] (comme `lathe`), `count` nervures de
 * largeur `width`, en relief de `lift` au-dessus de la calotte. Faces orientées vers l'extérieur (la fonction dome()
 * du kit produit des nervures dont le dessus est retourné : on pose celles-ci à la place, avec `ribs: 0`).
 */
export function domeRibs(profile: ArrayLike<number>, count: number, width: number, lift = 0.15, phase = 0): Geo {
  const g = new Geo();
  const n = profile.length >> 1;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    for (let k = 0; k < n - 1; k++) {
      const r0 = profile[2 * k], y0 = profile[2 * k + 1], r1 = profile[2 * k + 2], y1 = profile[2 * k + 3];
      const dl = Math.hypot(r1 - r0, y1 - y0) || 1, nr = (y1 - y0) / dl, ny = -(r1 - r0) / dl;
      const rmax = Math.max(profile[0], 1e-6);
      const w0 = (width / 2) * Math.max(0.3, r0 / rmax), w1 = (width / 2) * Math.max(0.3, r1 / rmax);
      const p = (r: number, y: number, side: number, w: number, l: number): [number, number, number] =>
        [(r + nr * l) * s + side * w * c, y + ny * l, (r + nr * l) * c - side * w * s];
      const a0 = p(r0, y0, -1, w0, lift), b0 = p(r0, y0, 1, w0, lift), a1 = p(r1, y1, -1, w1, lift), b1 = p(r1, y1, 1, w1, lift);
      const c0 = p(r0, y0, -1, w0, -0.05), d0 = p(r0, y0, 1, w0, -0.05), c1 = p(r1, y1, -1, w1, -0.05), d1 = p(r1, y1, 1, w1, -0.05);
      g.face(a0[0], a0[1], a0[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], a1[0], a1[1], a1[2]);
      g.face(b0[0], b0[1], b0[2], d0[0], d0[1], d0[2], d1[0], d1[1], d1[2], b1[0], b1[1], b1[2]);
      g.face(c0[0], c0[1], c0[2], a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], c1[0], c1[1], c1[2]);
    }
  }
  return g;
}

// ───────────────────────────── peinture sur canvas ─────────────────────────────

/**
 * Pierre de taille peinte rapidement dans le rectangle (x, y, w, h) EN PIXELS : fond uni, assises, blocs nuancés,
 * quelques salissures. `pxm` = pixels par mètre (horizontal, vertical). Le relief (bp) reçoit les joints.
 */
export function paintAshlar(cv: Canvas2D, bp: Canvas2D | null, x: number, y: number, w: number, h: number, tint: number, pxmX: number, pxmY: number, seed: number, course = 0.48): void {
  const g = cv.g, rnd = rngOf(seed);
  g.fillStyle = css(tint); g.fillRect(x, y, w, h);
  if (bp) { bp.g.fillStyle = '#c8c8c8'; bp.g.fillRect(x, y, w, h); }
  const ch = Math.max(3, course * pxmY), rows = Math.ceil(h / ch);
  const blockW = Math.max(6, course * 2.3 * pxmX);
  for (let r = 0; r < rows; r++) {
    const yy = y + h - (r + 1) * ch;
    const off = (r % 2) * blockW * 0.5;
    for (let bx = -blockW; bx < w; bx += blockW) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? `rgba(60,48,30,${(0.5 - v) * 0.2})` : `rgba(255,250,235,${(v - 0.5) * 0.2})`;
      const x0 = Math.max(x, x + bx + off), x1 = Math.min(x + w, x + bx + off + blockW);
      if (x1 > x0) g.fillRect(x0, Math.max(y, yy), x1 - x0, Math.min(ch, y + h - Math.max(y, yy)));
      if (x + bx + off > x && x + bx + off < x + w) { g.fillStyle = 'rgba(52,44,34,0.30)'; g.fillRect(x + bx + off, Math.max(y, yy), 1, ch); }
    }
    if (yy > y) {
      g.fillStyle = 'rgba(52,44,34,0.34)'; g.fillRect(x, yy, w, 1);
      g.fillStyle = 'rgba(255,250,236,0.16)'; g.fillRect(x, yy + 1, w, 1);
      if (bp) { bp.g.fillStyle = 'rgba(0,0,0,0.55)'; bp.g.fillRect(x, yy, w, 1.5); }
    }
  }
  // salissures et coulures légères
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    const sx = x + rnd() * w, sw = 2 + rnd() * 10, sh = h * (0.08 + rnd() * 0.3), sy = y + rnd() * (h - sh);
    const gr = g.createLinearGradient(0, sy, 0, sy + sh);
    gr.addColorStop(0, 'rgba(70,62,48,0.10)'); gr.addColorStop(1, 'rgba(70,62,48,0)');
    g.fillStyle = gr; g.fillRect(sx, sy, sw, sh);
  }
}

// ───────────────────────────── matériaux ─────────────────────────────

/** Matériau uni (sans texture), créé une fois sous la clé donnée. */
export function plainMaterial(key: string, color: number, p: LitParams = {}): string {
  defineMaterial(key, () => litMaterial(key, { color, roughness: 0.8, metalness: 0, night: 0.8, ...p }));
  return key;
}

/**
 * Couverture métallique à joints debout (plomb neuf, zinc, cuivre) à la teinte voulue, éclairée la nuit comme la
 * pierre : les matériaux 'zinc' et 'plomb' du kit restent presque noirs sous les projecteurs (gain 0,25–0,3).
 */
export function roofingMaterial(key: string, tint: number, night = 0.7, seed = 5): string {
  defineMaterial(key, () => {
    const m = litMaterial(key, { roughness: 0.55, metalness: 0.35, night, bumpScale: 2 }, zincTex(tint, seed));
    if (!m.map) m.color.setHex(tint);
    return m;
  });
  return key;
}

export interface GlazingOpts {
  /** Couleur des fers / profilés et du vitrage. */
  frame: number; glass: number;
  /** Taille réelle du motif (m) et nombre de vitres par motif (colonnes, rangées). */
  tile: [number, number]; panes?: [number, number];
  /** Épaisseur relative des fers principaux (fraction du motif) et des petits fers. */
  bar?: number; minor?: number;
  /** Gain d'illumination nocturne (verrière éclairée de l'intérieur). */
  night?: number; nightColor?: number;
  roughness?: number; metalness?: number;
  /** Part de vitres opaques (panneaux pleins) tirées au hasard, et leur teinte. */
  solid?: number; solidColor?: number;
}

/**
 * Verrière ou façade-rideau : trame de profilés et de vitres, reflets, vitres éclairées la nuit. UV en mètres
 * (le motif se répète tous les `tile` mètres). Matériau opaque : on ne modélise pas l'intérieur.
 */
export function glazingMaterial(key: string, o: GlazingOpts): string {
  defineMaterial(key, () => {
    const size = 256;
    const cv = canvas2d(size, size), em = canvas2d(size, size);
    const base: LitParams = { roughness: o.roughness ?? 0.22, metalness: o.metalness ?? 0.35, night: o.night ?? 1.4, nightColor: o.nightColor ?? 0xffe2b0 };
    if (!cv || !em) return litMaterial(key, { ...base, color: mixHex(o.glass, o.frame, 0.25) });
    const g = cv.g, e = em.g, rnd = rngOf(key.length * 131 + 7);
    const [nx, ny] = o.panes ?? [4, 4];
    const pw = size / nx, ph = size / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = rnd(), solid = rnd() < (o.solid ?? 0);
      const col = solid ? (o.solidColor ?? o.frame) : mixHex(o.glass, v < 0.5 ? 0x000000 : 0xffffff, Math.abs(v - 0.5) * 0.22);
      g.fillStyle = css(col); g.fillRect(i * pw, j * ph, pw, ph);
      if (!solid) {
        const gr = g.createLinearGradient(i * pw, j * ph, (i + 1) * pw, (j + 1) * ph);
        gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
        g.fillStyle = gr; g.fillRect(i * pw, j * ph, pw, ph);
      }
      const lit = !solid && rnd() < 0.7;
      e.fillStyle = solid ? 'rgb(18,16,12)' : lit ? `rgb(${200 + Math.round(rnd() * 55)},${170 + Math.round(rnd() * 50)},${110 + Math.round(rnd() * 50)})` : 'rgb(60,52,40)';
      e.fillRect(i * pw, j * ph, pw, ph);
    }
    const minor = Math.max(1, (o.minor ?? 0.012) * size), bar = Math.max(2, (o.bar ?? 0.04) * size);
    for (const ctx of [g, e]) {
      ctx.fillStyle = ctx === g ? css(mixHex(o.frame, 0x000000, 0.12)) : 'rgb(30,26,20)';
      for (let i = 1; i < nx; i++) ctx.fillRect(i * pw - minor / 2, 0, minor, size);
      for (let j = 1; j < ny; j++) ctx.fillRect(0, j * ph - minor / 2, size, minor);
      ctx.fillStyle = ctx === g ? css(o.frame) : 'rgb(46,40,30)';
      ctx.fillRect(0, 0, bar / 2, size); ctx.fillRect(size - bar / 2, 0, bar / 2, size);
      ctx.fillRect(0, 0, size, bar / 2); ctx.fillRect(0, size - bar / 2, size, bar / 2);
    }
    const m = litMaterial(key, { ...base, color: 0xffffff }, { map: texFrom(cv, { tile: o.tile }), bump: null });
    m.emissiveMap = texFrom(em, { tile: o.tile });
    m.emissive.setHex(o.nightColor ?? 0xffe2b0);
    return m;
  });
  return key;
}

/** Garde-fou de type pour les defs : matériau du kit ou clé d'un matériau déclaré par le lot. */
export type EdMat = MatRef;
