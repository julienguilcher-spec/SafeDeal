/* =====================================================================================
 * RENDU DU DÉCOR — devantures des commerces.
 *
 * Une devanture est posée en avant de la façade : repère local x le long de la façade, y vers le haut,
 * z = normale sortante (cap du Shop), origine au milieu de la vitrine, au sol. Hauteur fixe de 3,36 m :
 * soubassement, vitrine jusqu'à 2,60 m, bandeau d'enseigne de 0,60 m, corniche.
 * États : intacte, taguée, fissurée, brisée (trou sombre, dents de verre, éclats au sol), protégée par
 * des panneaux de bois, rideau de fer baissé progressivement, rideau forcé, pillée, en feu, calcinée ;
 * vitrine et enseigne éclairées la nuit. La géométrie est écrite directement dans le tampon du morceau.
 * ===================================================================================== */

import { displayRegion, region } from './atlas-layout';
import type { Region } from './atlas-layout';
import { FX_BLINK, FX_FIRE, FX_NIGHT, F_NY, F_NZ, GeoBuilder } from './geo';
import { hash01 } from './meshbuf';
import type { Mat, MeshBuf } from './meshbuf';
import { BOIS_CLAIR, SUIE } from './palette';
import type { ShopStyle } from './signtext';

/** État d'une devanture, lu sur Shop et, quand il existe, sur le service étendu de la simulation. */
export interface ShopState {
  window: string;
  shutter: number;
  stock: number;
  burning: number;
  forced: boolean;
  burnt: boolean;
  /** Panneaux de bois en place. */
  boards: boolean;
  tags: number;
  hasShutter: boolean;
}

/** Hauteurs (m). */
export const SHOP_TOP = 2.6;
export const SHOP_BAND0 = 2.66;
export const SHOP_BAND1 = 3.26;
export const SHOP_HEIGHT = 3.36;
const GLASS_TOP = 2.52;
const PIL = 0.2;
const DEPTH = 0.14;

interface Opening { x0: number; x1: number; sill: number; door: boolean }

const openings: Opening[] = [];
for (let i = 0; i < 12; i++) openings.push({ x0: 0, x1: 0, sill: 0, door: false });

/** Découpe l'intervalle [a, b] en baies vitrées d'au plus 2,5 m ; retourne le nouveau nombre d'ouvertures. */
function splitSpan(a: number, b: number, sill: number, out: Opening[], n: number): number {
  const span = b - a;
  if (span <= 0.35) return n;
  const mull = 0.07;
  const bays = Math.max(1, Math.min(out.length - n, Math.ceil(span / 2.5)));
  const bw = (span - (bays - 1) * mull) / bays;
  for (let i = 0; i < bays; i++) {
    const o = out[n++]!;
    o.x0 = a + i * (bw + mull);
    o.x1 = o.x0 + bw;
    o.sill = sill;
    o.door = false;
  }
  return n;
}

/** Découpe la largeur utile en une porte et des baies vitrées ; retourne le nombre d'ouvertures. */
export function layoutOpenings(width: number, style: ShopStyle, out: Opening[] = openings): number {
  const W = Math.max(0.6, width - 2 * PIL);
  const x0 = -W / 2, x1 = W / 2;
  const doorW = W >= 2.6 ? 0.95 : W >= 1.7 ? 0.85 : 0;
  const mull = 0.07;
  if (doorW === 0) return splitSpan(x0, x1, style.sill, out, 0);
  const d0 = style.doorSide < 0 ? x0 : style.doorSide > 0 ? x1 - doorW : -doorW / 2;
  const o = out[0]!;
  o.x0 = d0;
  o.x1 = d0 + doorW;
  o.sill = 0.06;
  o.door = true;
  let n = splitSpan(x0, d0 - mull, style.sill, out, 1);
  n = splitSpan(d0 + doorW + mull, x1, style.sill, out, n);
  return n;
}

/** Lumière demandée par une devanture (repère local) : vitrine éclairée, croix de pharmacie, feu. */
export interface ShopGlow { x: number; y: number; z: number; radius: number; color: number; intensity: number; gate: number; ground: boolean }

const W = new GeoBuilder(0, 0);

/**
 * Écrit la devanture dans `dst` (repère donné par `m`). `lod` : 0 détaillée, 1 moyenne, 2 lointaine,
 * 3 silhouette. `sign` : cellule d'atlas de l'enseigne (null = bandeau sans texte lisible).
 */
export function buildShopfront(
  dst: MeshBuf, m: Mat, width: number, category: string, style: ShopStyle, st: ShopState, lod: number,
  sign: Region | null, seed: number,
): void {
  const b = W.begin(dst, m);
  const w = Math.max(1.0, width);
  const burnt = st.burnt;
  const broken = st.window === 'broken';
  const boarded = isBoarded(st);
  const closed = st.hasShutter && st.shutter >= 0.99 && !st.forced && !burnt;
  const looted = st.stock < 0.04;
  const burning = isBurning(st);
  const lit = isLit(st, style);
  const char = (c: number): number => (burnt ? SUIE : c);
  const display = looted || broken && st.stock < 0.3 ? region('etal_pille') : displayRegion(category);
  const frame = char(style.frame);

  // ── lointain : trois ou quatre quads, décollés de la façade d'autant plus qu'ils sont loin
  //    (la précision du tampon de profondeur baisse avec la distance) ──
  if (lod >= 2) {
    const z0 = lod === 2 ? 0.14 : 0.3, z1 = z0 + 0.03;
    b.c(frame).quadZ(0, SHOP_HEIGHT / 2, z0, w, SHOP_HEIGHT);
    const ww = w - 2 * PIL, y0 = style.sill, hh = GLASS_TOP - y0;
    if (burnt) b.c(0x0c0b0a).quadZ(0, y0 + hh / 2, z1, ww, hh);
    else if (boarded) b.c(0xffffff).tex('contreplaque').quadZ(0, y0 + hh / 2, z1, ww, hh).tex('');
    else if (st.hasShutter && st.shutter > 0.5) b.c(0xd8d8d8).tex('rideau').quadZ(0, y0 + hh / 2, z1, ww, hh).tex('');
    else {
      b.c(broken ? 0x8a8a8a : 0xffffff).texRegion(display).gloss(broken ? 0 : 0.6);
      if (burning) b.emit(FX_FIRE, 0.9, hash01(seed));
      else if (lit) b.emit(FX_NIGHT, broken ? 0.5 : 1);
      b.quadZ(0, y0 + hh / 2, z1, ww, hh).tex('').gloss(0).emit(0);
    }
    b.c(char(style.band));
    if (style.litSign && !burnt) b.emit(FX_NIGHT, 0.7);
    if (lod === 2 && !burnt) b.tex('texte_flou');
    b.quadZ(0, (SHOP_BAND0 + SHOP_BAND1) / 2, z1, w, SHOP_BAND1 - SHOP_BAND0).tex('').emit(0);
    return;
  }

  const detail = lod === 0;
  const n = layoutOpenings(w, style);

  // ── encadrement ──
  b.c(frame);
  if (detail) {
    b.box(-w / 2 + PIL / 2, SHOP_TOP / 2, DEPTH / 2, PIL, SHOP_TOP, DEPTH, F_NY | F_NZ);
    b.box(w / 2 - PIL / 2, SHOP_TOP / 2, DEPTH / 2, PIL, SHOP_TOP, DEPTH, F_NY | F_NZ);
    // linteau au-dessus des baies
    b.box(0, (GLASS_TOP + SHOP_TOP) / 2, DEPTH / 2, w - 2 * PIL, SHOP_TOP - GLASS_TOP, DEPTH, F_NZ);
    // moulures des pilastres
    b.c(char(lighten(style.frame, 1.25))).box(-w / 2 + PIL / 2, 1.5, DEPTH + 0.008, PIL * 0.5, 1.7, 0.016, F_NZ);
    b.box(w / 2 - PIL / 2, 1.5, DEPTH + 0.008, PIL * 0.5, 1.7, 0.016, F_NZ).c(frame);
  } else {
    // fond plat : pilastres, linteau et meneaux d'un seul quad derrière les baies
    b.quadZ(0, SHOP_TOP / 2, 0.02, w, SHOP_TOP);
  }

  // ── bandeau, enseigne, corniche ──
  const bandH = SHOP_BAND1 - SHOP_BAND0;
  b.c(char(style.band));
  if (detail) b.box(0, (SHOP_TOP + SHOP_BAND1) / 2, 0.08, w, SHOP_BAND1 - SHOP_TOP, 0.16, F_NZ | F_NY);
  else b.quadZ(0, (SHOP_TOP + SHOP_BAND1) / 2, 0.16, w, SHOP_BAND1 - SHOP_TOP);
  if (!burnt) {
    // l'enseigne garde les proportions de sa cellule (8:1) et se centre dans le bandeau
    const sw = Math.min(w - 0.3, bandH * 8), sh = sw / 8;
    b.c(0xffffff);
    if (style.litSign) b.emit(FX_NIGHT, 0.9);
    if (sign) b.texRegion(sign).quadZ(0, (SHOP_BAND0 + SHOP_BAND1) / 2, 0.163, sw, sh);
    else b.c(style.band).tex('texte_flou').quadZ(0, (SHOP_BAND0 + SHOP_BAND1) / 2, 0.163, sw, sh);
    b.tex('').emit(0);
  }
  b.c(char(lighten(style.frame, 1.15)));
  if (detail) b.box(0, (SHOP_BAND1 + SHOP_HEIGHT) / 2, 0.11, w + 0.06, SHOP_HEIGHT - SHOP_BAND1, 0.22, F_NZ);
  else b.quadZ(0, (SHOP_BAND1 + SHOP_HEIGHT) / 2, 0.17, w + 0.06, SHOP_HEIGHT - SHOP_BAND1);

  // ── baies ──
  let shardsDone = false;
  const totalW = w - 2 * PIL;
  for (let i = 0; i < n; i++) {
    const o = openings[i]!;
    const ow = o.x1 - o.x0, xc = (o.x0 + o.x1) / 2;
    const y0 = o.sill, hh = GLASS_TOP - y0, yc = y0 + hh / 2;
    // soubassement ou seuil
    if (o.door) {
      b.c(char(0x8a8d91));
      if (detail) b.box(xc, 0.03, 0.09, ow, 0.06, 0.18, F_NY | F_NZ);
      else b.quadZ(xc, 0.03, 0.05, ow, 0.06);
    } else {
      b.c(char(style.plinth));
      if (detail) {
        b.box(xc, y0 / 2, 0.06, ow, y0, 0.12, F_NY | F_NZ);
        if (y0 > 0.35) b.c(char(lighten(style.plinth, 1.2))).box(xc, y0 / 2, 0.125, ow - 0.2, y0 - 0.16, 0.01, F_NZ);
      } else {
        b.quadZ(xc, y0 / 2, 0.05, ow, y0);
      }
    }
    // meneau à droite de la baie
    if (detail && i < n - 1) b.c(frame).box(o.x1 + 0.035, SHOP_TOP / 2, DEPTH / 2, 0.07, SHOP_TOP, DEPTH, F_NY | F_NZ);

    if (burnt) {
      b.c(0x6a6460).tex('etal_brule').quadZ(xc, yc, 0.03, ow, hh).tex('');
      if (detail) b.c(0xb8b4ae).gloss(0.3).tex('verre_bords').quadZ(xc, yc, 0.045, ow, hh, false, 0, 0, 1, 0.45).tex('').gloss(0);
      continue;
    }
    if (boarded) {
      b.c(0xffffff).tex('contreplaque').quadZ(xc, yc, 0.125, ow, hh).tex('');
      if (detail) b.c(BOIS_CLAIR).box(xc, y0 + hh * 0.25, 0.14, ow, 0.07, 0.03, F_NZ).box(xc, y0 + hh * 0.75, 0.14, ow, 0.07, 0.03, F_NZ);
      tagQuads(b, st.tags, seed + i * 7, xc, yc, 0.128, ow, hh);
      continue;
    }
    const u0 = (o.x0 + totalW / 2) / totalW, u1 = (o.x1 + totalW / 2) / totalW;
    if (!closed) {
      if (broken) {
        // trou : on voit l'intérieur, sombre ; dents de verre au bord ; éclats sur le trottoir
        b.c(looted ? 0x6a6a6a : 0x7c7c7c).texRegion(display);
        if (burning) b.emit(FX_FIRE, 0.95, hash01(seed + i));
        else if (lit) b.emit(FX_NIGHT, 0.55);
        b.quadZ(xc, yc, 0.03, ow, hh, false, u0, 0, u1, 1).emit(0).tex('');
        b.c(0xffffff).gloss(0.8).tex('verre_bords').quadZ(xc, yc, 0.045, ow, hh).tex('');
        if (!shardsDone) {
          shardsDone = true;
          b.gloss(0.6).tex('eclats_sol').quadY(0, 0.012, 0.8, Math.min(w, 5) + 0.3, 1.3).tex('');
          if (looted) b.gloss(0).tex('dechets').quadY(xc * 0.5, 0.013, 1.1, 2.2, 1.6).tex('');
        }
        b.gloss(0);
      } else {
        b.c(0xffffff).texRegion(display).gloss(0.75);
        if (burning) b.emit(FX_FIRE, 0.8, hash01(seed + i));
        else if (lit) b.emit(FX_NIGHT, 1);
        b.quadZ(xc, yc, 0.04, ow, hh, false, u0, 0, u1, 1).emit(0).tex('');
        if (st.window === 'cracked') b.c(0xffffff).gloss(0.5).tex('fissures').quadZ(xc, yc, 0.044, ow, hh).tex('');
        b.gloss(0);
        if (detail && o.door) {
          // cadre et barre de poussée de la porte
          b.c(frame).box(o.x0 + 0.03, yc, 0.06, 0.06, hh, 0.06, F_NZ).box(o.x1 - 0.03, yc, 0.06, 0.06, hh, 0.06, F_NZ);
          b.c(0xc9ced4).gloss(0.4).box(xc, 1.05, 0.075, ow - 0.2, 0.04, 0.03, F_NZ).gloss(0);
        }
        if (st.window === 'tagged' || st.tags > 0) tagQuads(b, Math.max(1, st.tags), seed + i * 7, xc, yc, 0.046, ow, hh);
      }
    }
    // rideau de fer
    if (st.hasShutter && st.shutter > 0.004) {
      const full = GLASS_TOP - (o.door ? 0.06 : y0);
      if (st.forced) {
        // tordu et relevé d'un côté : on passe dessous
        const yl = GLASS_TOP - full * 0.34, yr = GLASS_TOP - full * 0.8;
        const flip = hash01(seed + 3) < 0.5;
        b.c(0x9a9c9e).tex('rideau');
        if (flip) b.quad(o.x0, yr, 0.11, o.x1, yl, 0.46, o.x1, GLASS_TOP, 0.1, o.x0, GLASS_TOP, 0.1, true, 0, 0, 1, 0.7);
        else b.quad(o.x0, yl, 0.46, o.x1, yr, 0.11, o.x1, GLASS_TOP, 0.1, o.x0, GLASS_TOP, 0.1, true, 0, 0, 1, 0.7);
        b.tex('');
      } else {
        const cov = full * Math.min(1, st.shutter);
        const yb = GLASS_TOP - cov;
        b.c(0xe2e2e2).tex('rideau').quadZ(xc, yb + cov / 2, 0.1, ow, cov, false, 0, 0, 1, Math.min(1, cov / 2.4)).tex('');
        if (detail) b.c(0x5a5d60).box(xc, yb + 0.03, 0.105, ow, 0.06, 0.03, F_NZ);
        if (st.shutter > 0.7 && st.tags > 0) tagQuads(b, st.tags, seed + i * 7, xc, yb + cov / 2, 0.106, ow, cov);
      }
    }
  }

  // ── store banne ──
  if (style.awning !== 0 && !burnt) {
    const aw = w - 0.24;
    if (boarded || (st.hasShutter && st.shutter > 0.5)) {
      b.c(style.awning).box(0, 2.6, 0.24, aw, 0.11, 0.13, F_NZ);
    } else {
      const strips = style.stripes !== 0 && lod === 0 ? Math.max(2, Math.round(aw / 0.4)) : 1;
      const sw = aw / strips;
      for (let k = 0; k < strips; k++) {
        const xa = -aw / 2 + k * sw, xb = xa + sw;
        b.c(k % 2 === 1 ? style.stripes : style.awning).tex('store');
        b.quad(xa, 2.24, 1.42, xb, 2.24, 1.42, xb, 2.62, 0.17, xa, 2.62, 0.17, true);
        b.quad(xa, 2.04, 1.42, xb, 2.04, 1.42, xb, 2.24, 1.42, xa, 2.24, 1.42, true);
      }
      b.tex('');
      if (detail) {
        b.c(0x3a3a3a).bar(-aw / 2 + 0.05, 2.1, 0.16, -aw / 2 + 0.05, 2.24, 1.4, 0.012, 3).bar(aw / 2 - 0.05, 2.1, 0.16, aw / 2 - 0.05, 2.24, 1.4, 0.012, 3);
      }
    }
  }

  // ── enseigne en drapeau ──
  if (style.blade !== '' && !burnt) {
    const sx = style.doorSide > 0 ? -w / 2 + 0.06 : w / 2 - 0.06;
    b.c(0xffffff).tex(style.blade);
    if (style.blade === 'croix_pharma') b.emit(FX_BLINK, 1, hash01(seed + 11));
    else b.emit(FX_NIGHT, 0.9);
    b.quadX(sx, 3.02, 0.55, 0.6, 0.6, true).tex('').emit(0);
    if (detail) b.c(0x2a2a2a).bar(sx, 3.3, 0.16, sx, 3.3, 0.8, 0.012, 3);
  }

  // ── ardoise du jour, affichettes ──
  if (detail && !burnt && !boarded && category === 'cafe_restaurant') {
    b.c(0xffffff).tex('ardoise').quadZ(-w / 2 + PIL / 2, 1.45, DEPTH + 0.02, 0.17, 0.42).tex('');
  }

  if (burnt && detail) b.c(0xffffff).tex('dechets').quadY(0, 0.013, 0.9, Math.min(w, 4), 1.5).tex('');
}

/** La devanture porte-t-elle des traces de suie (elle brûle ou a brûlé) ? */
export function hasSoot(st: ShopState): boolean {
  return st.burnt || st.burning > 0.05;
}

/**
 * Traînées de suie au-dessus des baies d'une boutique qui brûle ou a brûlé : quads à l'opacité en
 * dégradé, destinés au lot fondu (transparence vraie), dans le repère donné par `m`.
 */
export function buildShopSoot(dst: MeshBuf, m: Mat, width: number, st: ShopState): void {
  if (!hasSoot(st)) return;
  const w = Math.max(1.0, width);
  const b = W.begin(dst, m);
  b.c(0xffffff).alpha(st.burnt ? 0.95 : 0.7).tex('suie_mur');
  b.quadZ(0, SHOP_HEIGHT + 1.2, 0.035, w * 0.98, 2.6);
  b.quadZ(0, 2.96, 0.168, w * 0.92, 0.62);
  b.tex('').alpha(1);
}

function isBoarded(st: ShopState): boolean {
  return (st.window === 'boarded' || st.boards) && !st.burnt;
}

function isBurning(st: ShopState): boolean {
  return st.burning > 0.05 && !st.burnt;
}

/** La vitrine est-elle éclairée de l'intérieur la nuit ? */
function isLit(st: ShopState, style: ShopStyle): boolean {
  return style.lightsOn && !st.burnt && !isBoarded(st) && !(st.hasShutter && st.shutter > 0.6)
    && !(st.window === 'broken' && st.stock < 0.04);
}

/**
 * Lumières d'une devanture dans son repère local (écrites dans `glows`, vidé d'abord) : la vitrine
 * éclairée qui déborde sur le trottoir, la croix de pharmacie, la lueur d'un incendie.
 */
export function shopGlows(glows: ShopGlow[], width: number, style: ShopStyle, st: ShopState): void {
  glows.length = 0;
  const w = Math.max(1.0, width);
  if (isBurning(st)) {
    glows.push({ x: 0, y: 1.6, z: 0.6, radius: Math.min(4, 1.5 + w * 0.4), color: 0xff7a1a, intensity: 0.6, gate: FX_FIRE, ground: false });
    glows.push({ x: 0, y: 0, z: 2.0, radius: 4 + w * 0.6, color: 0xff6a12, intensity: 0.3, gate: FX_FIRE, ground: true });
  } else if (isLit(st, style)) {
    glows.push({ x: 0, y: 0, z: 1.3, radius: Math.min(5.5, 1.6 + w * 0.5), color: 0xffe8c4, intensity: 0.2, gate: FX_NIGHT, ground: true });
  }
  if (style.blade === 'croix_pharma' && !st.burnt) {
    const sx = style.doorSide > 0 ? -w / 2 + 0.06 : w / 2 - 0.06;
    glows.push({ x: sx, y: 3.02, z: 0.6, radius: 0.7, color: 0x30ff80, intensity: 0.7, gate: FX_BLINK, ground: false });
  }
}

/** Graffitis posés sur une baie (vitre, planches ou rideau). */
function tagQuads(b: GeoBuilder, count: number, seed: number, xc: number, yc: number, z: number, ow: number, hh: number): void {
  const n = Math.min(2, count);
  for (let k = 0; k < n; k++) {
    const tw = Math.min(ow * 0.92, 1.5), th = tw * 0.5;
    const x = xc + (hash01(seed + k * 13) - 0.5) * Math.max(0, ow - tw);
    const y = yc - hh * 0.12 + (hash01(seed + k * 29) - 0.5) * Math.max(0, hh - th) * 0.5;
    b.c(0xffffff).tex('tag_' + Math.floor(hash01(seed + k * 5 + 1) * 8)).quadZ(x, y, z + k * 0.002, tw, Math.min(th, hh * 0.9)).tex('');
  }
}

function lighten(hex: number, k: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k + 6)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k + 6));
  const bl = Math.min(255, Math.round((hex & 255) * k + 6));
  return (r << 16) | (g << 8) | bl;
}
