/* Kit monuments — lot « ponts » : palais de Chaillot (1937) et fontaine de Varsovie.
 *  - façades de pierre claire à hautes baies entre pilastres plats, peintes par travées (aile et pavillon), avec
 *    l'inscription en lettres d'or de l'attique des pavillons et l'éclairage nocturne ;
 *  - chaillotWing() : une aile sur son emprise réelle (pavillon de tête, barre courbe, pavillon de queue), statues
 *    dorées du parvis, groupe de bronze sur son pylône — dessinée dans le repère canonique de x-ponts-chaillot.ts ;
 *  - varsovieFountain() : bassins, cascade, canons à eau et groupes sculptés.
 * Fichier ajouté par le lot « ponts » : les fichiers d'origine du kit ne sont pas modifiés. */
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { box, boxAt, polygon, sweep } from './shapes';
import { figureGeo, horseGeo, lionGeo } from './sculpture';
import { jetArc, jetVertical } from './fountain';
import { canvas2d, css, mixHex, paintBumpBase, paintMatter, rngOf, texFrom } from './canvas';
import { defineMaterial, litMaterial } from './materials';
import { insetRing } from '../shape2d';
import { CHAILLOT, VARSOVIE, varsovieOutline, wingParts, type WingPlan } from '../x-ponts-chaillot';

// ───────────────────────────── façades peintes ─────────────────────────────

const STONE = 0xe6dfcd, GLASS = 0x222b34, BRONZE = 0x4a4136, GOLD = 0xd9b23a;
/** Travée et hauteur (m) couvertes par les deux atlas ; v = 1 au sommet du mur. */
export const WING_BAY = 4.5, WING_TEX_H = 24, HEAD_BAY = 5.4, HEAD_TEX_H = 32;

interface Bay { bay: number; H: number; paint(R: (c: CanvasRenderingContext2D, k: number, x0: number, y0: number, x1: number, y1: number, fill: string) => void, g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, k: number, lit: number[][]): void }

function facade(key: string, o: Bay, seed: number): void {
  defineMaterial(key, () => {
    const cv = canvas2d(512, 1024), bp = canvas2d(512, 1024), em = canvas2d(512, 1024);
    if (!cv || !bp || !em) return litMaterial(key, { color: STONE, roughness: 0.9, night: 0.85 });
    paintMatter(cv, STONE, 0.045, 6, seed, 0.03, mixHex(STONE, 0x8b8474, 0.5), 0.22);
    paintBumpBase(bp, 150, 5, 16, seed + 1);
    const W = cv.w, H = cv.h, bw = W / 2, sx = bw / o.bay, sy = H / o.H;
    const R = (c: CanvasRenderingContext2D, k: number, x0: number, y0: number, x1: number, y1: number, fill: string): void => {
      c.fillStyle = fill;
      c.fillRect(k * bw + x0 * sx, H - y1 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
    };
    const lit: number[][] = [];
    for (let k = 0; k < 2; k++) o.paint(R, cv.g, bp.g, k, lit);
    // nuit : pierre sous les projecteurs, baies allumées au hasard
    const e = em.g, rnd = rngOf(seed + 5);
    e.drawImage(cv.c, 0, 0);
    e.fillStyle = 'rgba(20,14,6,0.3)'; e.fillRect(0, 0, W, H);
    for (const [k, x0, y0, x1, y1] of lit) {
      const on = rnd() < 0.6;
      e.fillStyle = on ? 'rgba(255,206,130,0.92)' : 'rgba(8,10,14,0.85)';
      e.fillRect(k * bw + x0 * sx, H - y1 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
      if (on) { e.fillStyle = 'rgba(70,48,24,0.75)'; for (let y = y0 + 1.6; y < y1; y += 1.6) e.fillRect(k * bw + x0 * sx, H - y * sy, (x1 - x0) * sx, 2); e.fillRect(k * bw + ((x0 + x1) / 2) * sx - 1, H - y1 * sy, 2, (y1 - y0) * sy); }
    }
    const m = litMaterial(key, { color: 0xffffff, roughness: 0.88, night: 1.0, bumpScale: 3 }, { map: texFrom(cv), bump: texFrom(bp, { srgb: false }) });
    m.emissiveMap = texFrom(em);
    m.emissive.setHex(0xffd9a8);
    return m;
  });
}

const light = css(mixHex(STONE, 0xffffff, 0.3)), shade = css(mixHex(STONE, 0x000000, 0.45)), soft = css(mixHex(STONE, 0x000000, 0.16));

function windowAt(R: Parameters<Bay['paint']>[0], g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, k: number, x0: number, y0: number, x1: number, y1: number, bars: number, lit: number[][]): void {
  R(g, k, x0 - 0.16, y0 - 0.16, x1 + 0.16, y1 + 0.16, soft); R(b, k, x0 - 0.16, y0 - 0.16, x1 + 0.16, y1 + 0.16, '#787878');
  R(g, k, x0, y0, x1, y1, css(GLASS)); R(b, k, x0, y0, x1, y1, '#2a2a2a');
  R(g, k, x0, y1 - 0.3, x1, y1, 'rgba(0,0,0,0.5)');                       // ombre du linteau
  R(g, k, x0, y0, x0 + 0.12, y1, 'rgba(0,0,0,0.35)');
  for (let y = y0 + bars; y < y1 - 0.2; y += bars) R(g, k, x0, y - 0.05, x1, y + 0.05, css(BRONZE));
  const n = x1 - x0 > 2.2 ? 3 : 2;
  for (let i = 1; i < n; i++) R(g, k, x0 + ((x1 - x0) * i) / n - 0.04, y0, x0 + ((x1 - x0) * i) / n + 0.04, y1, css(BRONZE));
  R(g, k, x0 - 0.2, y0 - 0.22, x1 + 0.2, y0 - 0.08, light); R(b, k, x0 - 0.2, y0 - 0.22, x1 + 0.2, y0 - 0.08, '#ffffff');
  lit.push([k, x0, y0, x1, y1]);
}

function courses(R: Parameters<Bay['paint']>[0], g: CanvasRenderingContext2D, k: number, bay: number, y0: number, y1: number, step: number, alpha: number): void {
  for (let y = y0 + step; y < y1; y += step) R(g, k, 0, y - 0.012, bay, y + 0.012, `rgba(60,52,40,${alpha})`);
}

/** Aile : soubassement à assises, étage bas, grand ordre de baies de 9,6 m entre pilastres plats, attique nu. */
facade('chaillot_aile', {
  bay: WING_BAY, H: WING_TEX_H,
  paint(R, g, b, k, lit) {
    const bay = WING_BAY;
    courses(R, g, k, bay, 0, 7.0, 0.9, 0.3);
    R(g, k, 0, 0, bay, 7.0, 'rgba(70,62,50,0.10)');
    R(g, k, 0, 7.0, bay, 7.25, light); R(b, k, 0, 7.0, bay, 7.25, '#ffffff'); R(g, k, 0, 6.9, bay, 7.0, shade);
    courses(R, g, k, bay, 7.25, 22.4, 0.62, 0.12);
    // pilastres plats (à cheval sur deux travées)
    for (const [x0, x1] of [[0, 0.5], [bay - 0.5, bay]]) { R(g, k, x0, 7.25, x1, 22.3, 'rgba(255,255,255,0.16)'); R(b, k, x0, 7.25, x1, 22.3, '#e6e6e6'); }
    R(g, k, 0.5, 7.25, 0.56, 22.3, 'rgba(0,0,0,0.22)'); R(g, k, bay - 0.56, 7.25, bay - 0.5, 22.3, 'rgba(255,255,255,0.2)');
    windowAt(R, g, b, k, 1.3, 7.9, 3.2, 10.7, 1.4, lit);
    windowAt(R, g, b, k, 1.3, 11.8, 3.2, 21.4, 1.6, lit);
    // corniche et attique
    R(g, k, 0, 22.3, bay, 22.42, shade); R(g, k, 0, 22.42, bay, 22.8, light); R(b, k, 0, 22.42, bay, 22.8, '#ffffff');
    R(g, k, 0, 23.7, bay, 24, light); R(b, k, 0, 23.7, bay, 24, '#f4f4f4'); R(g, k, 0, 23.62, bay, 23.7, soft);
  },
}, 421);

/** Pavillon de tête : portes de bronze, baies de 14 m entre trumeaux nus, attique à inscription en lettres d'or. */
facade('chaillot_pavillon', {
  bay: HEAD_BAY, H: HEAD_TEX_H,
  paint(R, g, b, k, lit) {
    const bay = HEAD_BAY, rnd = rngOf(733 + k * 31);
    courses(R, g, k, bay, 0, 7.0, 0.9, 0.3);
    R(g, k, 0, 0, bay, 7.0, 'rgba(70,62,50,0.10)');
    R(g, k, 0, 7.0, bay, 7.3, light); R(b, k, 0, 7.0, bay, 7.3, '#ffffff'); R(g, k, 0, 6.9, bay, 7.0, shade);
    courses(R, g, k, bay, 7.3, 27.2, 0.7, 0.1);
    // porte de bronze et sa travée
    R(g, k, 1.4, 7.3, 4.0, 11.6, soft); R(g, k, 1.55, 7.3, 3.85, 11.4, css(BRONZE)); R(b, k, 1.55, 7.3, 3.85, 11.4, '#505050');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) R(g, k, 1.7 + i * 0.72, 7.5 + j * 0.98, 2.26 + i * 0.72, 8.3 + j * 0.98, 'rgba(120,98,66,0.55)');
    windowAt(R, g, b, k, 1.5, 12.4, 3.9, 26.4, 2.0, lit);
    // corniche, attique, trois lignes de lettres d'or
    R(g, k, 0, 27.1, bay, 27.25, shade); R(g, k, 0, 27.25, bay, 27.7, light); R(b, k, 0, 27.25, bay, 27.7, '#ffffff');
    for (let line = 0; line < 3; line++) {
      let x = 0.25 + rnd() * 0.3;
      const y = 28.3 + line * 0.95;
      while (x < bay - 0.3) {
        const w = 0.12 + rnd() * 0.2;
        if (rnd() < 0.82) { R(g, k, x, y, x + w, y + 0.5, css(GOLD)); R(g, k, x, y, x + w, y + 0.08, 'rgba(120,84,10,0.6)'); }
        x += w + 0.07 + (rnd() < 0.18 ? 0.3 : 0);
      }
    }
    R(g, k, 0, 31.6, bay, 32, light); R(b, k, 0, 31.6, bay, 32, '#f4f4f4'); R(g, k, 0, 31.5, bay, 31.6, soft);
  },
}, 431);

/** Mur d'un anneau habillé par un atlas de travées : v = 1 au sommet ; les pans trop courts restent en pierre nue. */
function dressRing(tex: Geo, plain: Geo, ring: ArrayLike<number>, yBot: number, yTop: number, bay: number, texH: number, skip?: (ax: number, az: number, bx: number, bz: number) => boolean): void {
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    if (len < bay * 0.72 || (skip && skip(ax, az, bx, bz))) { plain.face(ax, yBot, az, bx, yBot, bz, bx, yTop, bz, ax, yTop, az); continue; }
    const bays = Math.max(1, Math.round(len / bay));
    tex.face(ax, yBot, az, bx, yBot, bz, bx, yTop, bz, ax, yTop, az, 0, 1 - (yTop - yBot) / texH, { u1: bays / 2, v1: 1 });
  }
}

/** Toit-terrasse d'un volume : dalle, bandeau de corniche débordant, acrotère. */
function flatRoof(b: Builder, ring: number[], y: number): void {
  if (ring.length < 6) return;
  b.add('zinc', polygon(insetRing(ring, -0.5), y - 0.25));
  b.add('pierre_lisse_claire', sweep([0, y - 0.9, 0.28, y - 0.9, 0.28, y - 0.55, 0.06, y - 0.55, 0.06, y, -0.5, y, -0.5, y - 0.25], ring, { closed: true }));
}

/**
 * Une aile du palais dans le repère canonique (pavillon de tête vers −x, jardins vers +z). L'appelant pose le
 * repère canonique sur le site (wingMatrix). `groundAt` : altitude du sol au point canonique (x, z), relative à
 * l'origine ; `seed` distingue les deux ailes (poses des statues, groupe de bronze).
 */
export function chaillotWing(b: Builder, plan: WingPlan, quality: QualityLevel, groundAt: (x: number, z: number) => number, seed: number): void {
  const lod = quality === 'bas' ? 0 : 1;
  const C = CHAILLOT, P = plan.parvisY, low = plan.lowY;
  const parts = wingParts(plan.ring);
  const onCut = (ax: number, az: number, bx: number, bz: number): boolean =>
    (Math.abs(ax - C.headX) < 0.05 && Math.abs(bx - C.headX) < 0.05) || (Math.abs(az - C.tailZ) < 0.05 && Math.abs(bz - C.tailZ) < 0.05);
  const wingTex = new Geo(), headTex = new Geo(), plain = new Geo();
  // barre courbe et pavillon de queue : atlas de l'aile ; pavillon de tête : son propre atlas
  dressRing(wingTex, plain, parts.body, low, P + C.wingH, WING_BAY, WING_TEX_H, onCut);
  dressRing(wingTex, plain, parts.tail, low, P + C.tailH, WING_BAY, WING_TEX_H, onCut);
  dressRing(headTex, plain, parts.head, low, P + C.headH, HEAD_BAY, HEAD_TEX_H, onCut);
  b.add('chaillot_aile', wingTex); b.add('chaillot_pavillon', headTex); b.add('pierre_lisse_claire', plain);
  flatRoof(b, parts.body, P + C.wingH); flatRoof(b, parts.tail, P + C.tailH); flatRoof(b, parts.head, P + C.headH);

  // ── quatre statues de bronze doré au bord du parvis, sur leurs dés de pierre, tournées vers l'axe ──
  const stone = new Geo(), gold = new Geo();
  const poses = [
    { armL: { e: 1.2, a: 0.6, e2: 2.0, a2: 0.2 }, armR: { e: 0.3, a: 1.2 }, robe: true },
    { armL: { e: 0.5, a: 1.0 }, armR: { e: 2.3, a: 0.6, e2: 2.7, a2: 0.3 }, robe: false },
    { armL: { e: 1.6, a: 1.2, e2: 2.4, a2: 0.8 }, armR: { e: 0.9, a: 0.4, e2: 1.5, a2: 0 }, robe: true },
    { armL: { e: 0.4, a: 1.3, e2: 1.2, a2: 0.2 }, armR: { e: 0.4, a: 1.3, e2: 1.2, a2: 0.2 }, robe: false },
  ];
  C.statues.forEach(([x, z], i) => {
    const y = groundAt(x, z);
    stone.append(box(1.7, 2.2, 1.7).translate(x, y - 0.3, z)).append(box(1.95, 0.25, 1.95).translate(x, y + 1.9, z));
    const p = poses[(i + seed) % poses.length];
    const f = figureGeo({ height: 3.1, lod, robe: p.robe, armL: p.armL, armR: p.armR, lean: -0.03, itemR: i % 2 === 0 ? 'rameau' : undefined, itemScale: 0.5 });
    const m = pose(x, y + 2.15, z, -Math.PI / 2);
    gold.append(f.body, m).append(f.items, m);
  });
  // ── groupe de bronze sur son pylône, devant le pavillon, face aux jardins ──
  {
    const [x, z] = C.group;
    const y = groundAt(x, z);
    // pylône : socle, fût élancé à refends, tailloir
    stone.append(box(4.4, 2.4, 4.4).translate(x, y - 1.2, z)).append(box(3.3, C.groupPedH - 1.2, 3.3).translate(x, y + 1.2, z));
    for (let k = 1; k < 5; k++) stone.append(box(3.42, 0.14, 3.42).translate(x, y + 1.2 + (k * (C.groupPedH - 1.2)) / 5, z));
    stone.append(box(4.5, 0.5, 4.5).translate(x, y + C.groupPedH, z));
    const yb = y + C.groupPedH + 0.5;
    const bronze = new Geo();
    // Hercule et le taureau (Paris) ; Apollon musagète (Passy)
    const hero = figureGeo({ height: 5.6, lod, armL: { e: 1.5, a: 0.9, e2: 2.2, a2: 0.4 }, armR: { e: 1.0, a: 0.3, e2: 1.6, a2: 0 }, legL: { e: 0.35, a: 0 }, lean: 0.06, itemL: seed % 2 === 1 ? 'couronne' : undefined });
    bronze.append(hero.body.translate(x - 0.9, yb, z + 0.2)).append(hero.items.translate(x - 0.9, yb, z + 0.2));
    if (seed % 2 === 0) bronze.append(lionGeo('debout', 2.5, lod).rotateY(0.5).translate(x + 0.9, yb, z + 0.1));
    else { const muse = figureGeo({ height: 3.6, lod, robe: true, seated: true, armL: { e: 1.2, a: 0.6 } }); bronze.append(muse.body.translate(x + 1.1, yb, z + 0.4)); }
    b.add('bronze', bronze);
  }
  b.add('pierre_lisse_claire', stone); b.add('or', gold);
}

/** Matrice du repère canonique d'une aile vers le repère local du site (miroir compris pour l'aile de Passy). */
export function wingMatrix(plan: WingPlan): THREE.Matrix4 {
  const a = plan.align, k = plan.mirror ? -1 : 1;
  return new THREE.Matrix4().set(a.c * k, 0, -a.s, a.tx, 0, 1, 0, 0, a.s * k, 0, a.c, a.tz, 0, 0, 0, 1);
}

/** Silhouette d'une aile : trois prismes sur l'emprise simplifiée. */
export function chaillotWingFar(b: Builder, plan: WingPlan, stone: THREE.Material, roof: THREE.Material): void {
  const C = CHAILLOT, P = plan.parvisY, low = plan.lowY;
  const parts = wingParts(plan.ring);
  const simple = (ring: number[], tol: number): number[] => {
    // garde un sommet sur k tant que la silhouette reste lisible (les pavillons sont presque rectangulaires)
    const out: number[] = [];
    let px = Infinity, pz = Infinity;
    for (let i = 0; i + 1 < ring.length; i += 2) { if (Math.hypot(ring[i] - px, ring[i + 1] - pz) < tol) continue; px = ring[i]; pz = ring[i + 1]; out.push(px, pz); }
    return out.length >= 6 ? out : ring;
  };
  for (const [ring, h] of [[parts.head, C.headH], [parts.body, C.wingH], [parts.tail, C.tailH]] as const) {
    if (ring.length < 6) continue;
    const r = simple(ring, 9);
    const g = new Geo();
    const n = r.length >> 1;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.face(r[2 * i], low, r[2 * i + 1], r[2 * j], low, r[2 * j + 1], r[2 * j], P + h, r[2 * j + 1], r[2 * i], P + h, r[2 * i + 1]); }
    b.add(stone, g);
    b.add(roof, polygon(r, P + h));
  }
}

// ───────────────────────────── fontaine de Varsovie ─────────────────────────────

/** Mur de bassin le long d'un contour antihoraire (l'eau est à l'intérieur) : parement intérieur, margelle, parement extérieur. */
function basinWall(ring: ArrayLike<number>, water: number, groundAt: (x: number, z: number) => number, rim = 0.45, width = 0.6, step = 7): Geo {
  const g = new Geo();
  const n = ring.length >> 1;
  const out = insetRing(ring, width);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(ring[2 * j] - ring[2 * i], ring[2 * j + 1] - ring[2 * i + 1]);
    const parts = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < parts; k++) {
      const t0 = k / parts, t1 = (k + 1) / parts;
      const L = (r: ArrayLike<number>, t: number): [number, number] => [r[2 * i] + (r[2 * j] - r[2 * i]) * t, r[2 * i + 1] + (r[2 * j + 1] - r[2 * i + 1]) * t];
      const a = L(ring, t0), c = L(ring, t1), ao = L(out, t0), co = L(out, t1);
      const ga = groundAt(ao[0], ao[1]), gc = groundAt(co[0], co[1]);
      const ta = Math.max(ga, water) + rim, tc = Math.max(gc, water) + rim;
      g.face(c[0], water - 0.7, c[1], a[0], water - 0.7, a[1], a[0], ta, a[1], c[0], tc, c[1]);                 // vers l'eau
      g.face(a[0], ta, a[1], ao[0], ta, ao[1], co[0], tc, co[1], c[0], tc, c[1]);                               // margelle
      g.face(ao[0], Math.min(ga, water) - 0.5, ao[1], co[0], Math.min(gc, water) - 0.5, co[1], co[0], tc, co[1], ao[0], ta, ao[1]);   // vers les jardins
    }
  }
  return g;
}

/**
 * Fontaine de Varsovie dans son repère local (origine au milieu du grand bassin, +z vers la Seine).
 * `groundAt` : altitude du sol relative à l'origine.
 */
export function varsovieFountain(b: Builder, quality: QualityLevel, groundAt: (x: number, z: number) => number): void {
  const V = VARSOVIE, lod = quality === 'bas' ? 0 : 1, W = V.waterY, U = W + V.drop;
  const STONE_M = 'pierre_lisse_claire';
  // grand bassin et tête en croix
  const outline = varsovieOutline(quality === 'bas' ? 8 : 14);
  b.add(STONE_M, basinWall(outline, W, groundAt));
  b.add('eau', polygon(outline, W + 0.04));
  // bassin en fer à cheval au bas
  const shoe: number[] = [], seg = quality === 'bas' ? 8 : 14;
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; shoe.push(Math.cos(a) * V.shoeOut, V.z1 + Math.sin(a) * V.shoeOut); }
  for (let i = seg; i >= 0; i--) { const a = (i / seg) * Math.PI; shoe.push(Math.cos(a) * V.shoeIn, V.z1 + Math.sin(a) * V.shoeIn); }
  b.add(STONE_M, basinWall(shoe, V.shoeY, groundAt, 0.35, 0.45));
  b.add('eau', polygon(shoe, V.shoeY + 0.04));
  // petits bassins hauts
  for (const [x, z] of V.upper) {
    const h = V.upperSize / 2, r = [x - h, z - h, x - h, z + h, x + h, z + h, x + h, z - h];
    b.add(STONE_M, basinWall(r, U, groundAt));
    b.add('eau', polygon(r, U + 0.04));
  }
  // cascade : gradins de pierre, lames d'eau sur chaque palier, nappes sur chaque chute
  const jets = new Geo(), water = new Geo(), stone = new Geo();
  const run = (V.stepsZ1 - V.stepsZ0) / V.steps, fall = V.drop / V.steps;
  for (let k = 0; k < V.steps; k++) {
    const za = V.stepsZ0 + k * run, zb = za + run, y = U - k * fall;
    stone.append(boxAt(-V.stepsHalf - 0.8, W - 0.7, za, V.stepsHalf + 0.8, y - 0.06, zb, { top: true }));
    for (const sx of [-1, 1]) stone.append(boxAt(sx * V.stepsHalf, W - 0.7, za, sx * (V.stepsHalf + 0.8), y + 0.5, zb, { top: true }));
    water.face(-V.stepsHalf, y, zb, V.stepsHalf, y, zb, V.stepsHalf, y, za, -V.stepsHalf, y, za);
    jets.face(-V.stepsHalf, y - fall, zb + 0.12, V.stepsHalf, y - fall, zb + 0.12, V.stepsHalf, y, zb, -V.stepsHalf, y, zb, 0, 0.6, { u1: 14, v1: 0 });
  }
  // canons à eau : deux batteries de dix, tirant vers la Seine le long du grand bassin
  const half = V.cannons / 2;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < half; i++) {
      const x = sx * (2.4 + i * 2.6), z = V.headZ0 + 2.2 + (i % 2) * 1.6;
      stone.append(box(0.5, 0.9, 1.1).translate(x, W - 0.1, z));
      const reach = V.range - i * 2.2;
      jets.append(jetArc([x, W + 0.8, z + 0.5], [x * 0.42, W + 0.05, z + reach], V.apex - i * 0.25, 0.3, quality === 'bas' ? 6 : 10));
    }
  }
  // gerbes : deux rangs le long du grand bassin, colonnes d'eau dans la tête et les bassins hauts
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) jets.append(jetVertical(sx * (V.half - 2.6), W, V.z0 + 9 + i * 9.2, 4, 0.5));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) jets.append(jetVertical(sx * (16 + i * 5.2), W, (V.headZ0 + V.headZ1) / 2, 7, 0.6));
  for (const [x, z] of V.upper) jets.append(jetVertical(x, U, z, 5, 0.7));
  b.add(STONE_M, stone); b.add('eau', water); b.add('jet', jets);
  // groupes de bronze doré, au bas : taureau et daim (à l'est), chevaux et chien (à l'ouest)
  const gold = new Geo(), ped = new Geo(), figs = new Geo();
  V.animals.forEach(([x, z], i) => {
    const y = groundAt(x, z);
    // socle un peu plus haut et plus large que le bâtiment générique de 3,5 m que la carte place au même endroit
    ped.append(box(3.4, 4.2, 6.0).translate(x, y - 0.4, z)).append(box(3.8, 0.3, 6.4).translate(x, y + 3.8, z));
    const top = y + 4.1;
    if (i === 0) {
      gold.append(lionGeo('debout', 2.3, lod).translate(x, top, z + 0.6));
      gold.append(horseGeo({ scale: 0.75, gait: 0.3, lod }).translate(x + 0.2, top, z - 1.7));
    } else {
      gold.append(horseGeo({ scale: 1.35, rear: 0.45, lod }).translate(x - 0.5, top, z - 0.6));
      gold.append(horseGeo({ scale: 1.3, gait: 0.4, lod }).translate(x + 0.55, top, z + 0.5));
      gold.append(lionGeo('couche', 0.9, lod).translate(x, top, z + 2.3));
    }
  });
  // groupes de pierre au bord des bassins hauts (l'Homme, la Femme)
  V.stones.forEach(([x, z], i) => {
    const y = groundAt(x, z);
    ped.append(box(3.8, 2.4, 2.8).translate(x, y - 0.3, z));
    const f = figureGeo({ height: 4.6, lod, seated: true, robe: i === 1, lean: 0.15, armL: { e: 1.0, a: 0.8, e2: 1.6, a2: 0.2 }, armR: { e: 0.5, a: 1.1 } });
    figs.append(f.body.translate(x - 0.6, y + 2.1, z + 0.3));
    const g2 = figureGeo({ height: 2.6, lod: 0, armL: { e: 2.0, a: 0.8 }, legL: { e: 0.4, a: 0 } });
    figs.append(g2.body.translate(x + 1.1, y + 2.1, z + 0.2));
  });
  b.add(STONE_M, ped); b.add(STONE_M, figs); b.add('or', gold);
}
