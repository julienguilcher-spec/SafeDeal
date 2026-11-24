/* =====================================================================================
 * RENDU DES COMMISSARIATS — atlas de textures partagé (une seule texture 1024 × 512 pour tous les sites).
 *
 * Régions : les enseignes de chaque site (« COMMISSARIAT DE POLICE — 9ᵉ ARRONDISSEMENT »…), les faces de lanterne
 * « POLICE » et « GENDARMERIE », le vitrage de porte lettré, la plaque « RÉPUBLIQUE FRANÇAISE », le marquage des
 * places réservées (ligne jaune et « POLICE » au sol) et une case blanche pour les pièces unies (teinte par sommet).
 *
 * La disposition est PURE (calculable sous Node, pour les coordonnées de texture) ; la peinture demande un canevas :
 * sous Node, createCommissariatAtlas() rend null et les maillages gardent leurs couleurs par sommet.
 * ===================================================================================== */

import * as THREE from 'three';
import { COMMISSARIATS } from '@/world/commissariats';
import type { CommissariatDef } from '@/world/commissariats';

export const ATLAS_W = 1024;
export const ATLAS_H = 512;

/** Rectangle de l'atlas en pixels (origine en haut à gauche du canevas). */
export interface AtlasRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Coordonnées de texture d'une région (v vers le haut : la texture est retournée au chargement). */
export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Enseignes : deux colonnes de 448 × 75 px (rapport 6:1 de la plaque de 4,2 × 0,7 m), quatre rangées. */
const PLATE_W = 448;
const PLATE_H = 75;
const PLATE_COLS = 2;
const PLATE_ROWS = 4;
export const PLATE_CAPACITY = PLATE_COLS * PLATE_ROWS;

export type FixedRegion =
  | 'lanterne_police' | 'lanterne_gendarmerie' | 'plaque_rf' | 'blanc' | 'baie' | 'baie_moto' | 'vitre_police'
  | 'vitre_gendarmerie';

export const REGIONS: Readonly<Record<FixedRegion, AtlasRegion>> = {
  lanterne_police: { x: 896, y: 0, w: 128, h: 128 },
  lanterne_gendarmerie: { x: 896, y: 128, w: 128, h: 128 },
  plaque_rf: { x: 896, y: 256, w: 128, h: 88 },
  blanc: { x: 952, y: 360, w: 16, h: 16 },
  baie: { x: 0, y: 304, w: 320, h: 112 },
  baie_moto: { x: 320, y: 304, w: 160, h: 96 },
  vitre_police: { x: 480, y: 304, w: 128, h: 176 },
  vitre_gendarmerie: { x: 608, y: 304, w: 128, h: 176 },
};

/** Sites portant une enseigne, dans l'ordre des données : leur rang donne leur case d'enseigne. */
const PLATE_SITES: readonly string[] = COMMISSARIATS.filter((c) => c.sign !== 'none').map((c) => c.id);

/** Case d'enseigne d'un site (null : pas d'enseigne). Au-delà de la capacité, la première case sert de repli. */
export function plateRegion(siteId: string): AtlasRegion | null {
  const i = PLATE_SITES.indexOf(siteId);
  if (i < 0) return null;
  const k = i < PLATE_CAPACITY ? i : 0;
  return { x: (k % PLATE_COLS) * PLATE_W, y: Math.floor(k / PLATE_COLS) * PLATE_H, w: PLATE_W, h: PLATE_H };
}

/** Coordonnées de texture d'une région, rentrées d'un pixel et demi (pas de débordement des régions voisines). */
export function uvOf(r: AtlasRegion): UvRect {
  const inset = 1.5;
  return {
    u0: (r.x + inset) / ATLAS_W,
    u1: (r.x + r.w - inset) / ATLAS_W,
    v0: 1 - (r.y + r.h - inset) / ATLAS_H,
    v1: 1 - (r.y + inset) / ATLAS_H,
  };
}

/** Point de texture au centre de la case blanche (pièces unies). */
export const WHITE_UV: readonly [number, number] = [
  (REGIONS.blanc.x + REGIONS.blanc.w / 2) / ATLAS_W,
  1 - (REGIONS.blanc.y + REGIONS.blanc.h / 2) / ATLAS_H,
];

// ───────────────────────────── peinture ─────────────────────────────

const SANS = '"Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
const NAVY = '#16306e';
const YELLOW = '#f2c400';

/** Ordinal français en exposant : « 1 » + « er », « 9 » + « e ». */
function ordinal(n: number): [string, string] {
  return [String(n), n === 1 ? 'er' : 'e'];
}

/** Police la plus grande (≤ px) pour que `text` tienne dans `maxW`. */
function fitFont(g: CanvasRenderingContext2D, text: string, px: number, maxW: number, weight = '700'): number {
  let size = px;
  for (; size > 8; size--) {
    g.font = `${weight} ${size}px ${SANS}`;
    if (g.measureText(text).width <= maxW) break;
  }
  return size;
}

/** « 9ᵉ ARRONDISSEMENT » centré, l'ordinal en exposant. */
function drawArrondissement(g: CanvasRenderingContext2D, n: number, cx: number, baseline: number, px: number, maxW: number): void {
  const [num, sup] = ordinal(n);
  const rest = ' ARRONDISSEMENT';
  let size = px;
  let wNum = 0, wSup = 0, wRest = 0;
  for (; size > 8; size--) {
    g.font = `700 ${size}px ${SANS}`;
    wNum = g.measureText(num).width;
    wRest = g.measureText(rest).width;
    g.font = `700 ${Math.round(size * 0.62)}px ${SANS}`;
    wSup = g.measureText(sup).width;
    if (wNum + wSup + wRest <= maxW) break;
  }
  let x = cx - (wNum + wSup + wRest) / 2;
  g.textAlign = 'left';
  g.font = `700 ${size}px ${SANS}`;
  g.fillText(num, x, baseline);
  x += wNum;
  g.font = `700 ${Math.round(size * 0.62)}px ${SANS}`;
  g.fillText(sup, x, baseline - size * 0.38);
  x += wSup;
  g.font = `700 ${size}px ${SANS}`;
  g.fillText(rest, x, baseline);
}

function paintPlate(g: CanvasRenderingContext2D, def: CommissariatDef, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1d3a80');
  grad.addColorStop(1, NAVY);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // liseré tricolore à gauche, filet blanc
  const band = 9;
  g.fillStyle = '#1f3f9a'; g.fillRect(6, 6, band, h - 12);
  g.fillStyle = '#f4f4f0'; g.fillRect(6 + band, 6, band, h - 12);
  g.fillStyle = '#d0202e'; g.fillRect(6 + band * 2, 6, band, h - 12);
  g.strokeStyle = '#eef2fa';
  g.lineWidth = 2;
  g.strokeRect(3, 3, w - 6, h - 6);
  const left = 6 + band * 3 + 6;
  const cx = (left + w - 8) / 2;
  const maxW = w - 8 - left - 6;
  g.fillStyle = '#ffffff';
  g.textBaseline = 'alphabetic';
  let line1: string;
  if (def.sign === 'gendarmerie') line1 = 'GENDARMERIE NATIONALE';
  else if (def.sign === 'hotel_police') line1 = 'HÔTEL DE POLICE';
  else line1 = 'COMMISSARIAT DE POLICE';
  const s1 = fitFont(g, line1, 27, maxW, '800');
  g.font = `800 ${s1}px ${SANS}`;
  g.textAlign = 'center';
  g.fillText(line1, cx, h * 0.47);
  if (def.sign === 'gendarmerie') {
    const line2 = 'CASERNE DES CÉLESTINS';
    const s2 = fitFont(g, line2, 18, maxW);
    g.font = `700 ${s2}px ${SANS}`;
    g.fillText(line2, cx, h * 0.83);
  } else if (def.arrondissement > 0) {
    drawArrondissement(g, def.arrondissement, cx, h * 0.83, 19, maxW);
  }
}

function paintLantern(g: CanvasRenderingContext2D, word: string, w: number, h: number): void {
  g.fillStyle = '#10204a';
  g.fillRect(0, 0, w, h);
  const grad = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.62);
  grad.addColorStop(0, '#3f6fe6');
  grad.addColorStop(1, '#1d43b8');
  g.fillStyle = grad;
  g.fillRect(9, 9, w - 18, h - 18);
  // montants du verre
  g.fillStyle = 'rgba(10,20,50,0.55)';
  g.fillRect(9, 9, w - 18, 5);
  g.fillRect(9, h - 14, w - 18, 5);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = fitFont(g, word, 34, w - 30, '800');
  g.font = `800 ${size}px ${SANS}`;
  g.fillText(word, w / 2, h / 2 + 2);
}

function paintGlass(g: CanvasRenderingContext2D, word: string, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#3a525c');
  grad.addColorStop(0.55, '#22343c');
  grad.addColorStop(1, '#1a262c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // reflet oblique
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  g.moveTo(w * 0.15, 0); g.lineTo(w * 0.45, 0); g.lineTo(w * 0.05, h); g.lineTo(0, h); g.lineTo(0, h * 0.6);
  g.closePath();
  g.fill();
  // deux vantaux : montant central, barres de poussée
  g.fillStyle = '#2a2d31';
  g.fillRect(w / 2 - 2, 0, 4, h);
  g.fillRect(0, 0, w, 4);
  g.fillStyle = '#b8bcc0';
  g.fillRect(w / 2 - 12, h * 0.52, 3, h * 0.16);
  g.fillRect(w / 2 + 9, h * 0.52, 3, h * 0.16);
  // lettrage blanc adhésif
  g.fillStyle = '#f2f4f6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = fitFont(g, word, 26, w - 16, '800');
  g.font = `800 ${size}px ${SANS}`;
  g.fillText(word, w / 2, h * 0.36);
  g.fillStyle = '#1f3f9a'; g.fillRect(w / 2 - 21, h * 0.36 + size * 0.7, 14, 4);
  g.fillStyle = '#f4f4f0'; g.fillRect(w / 2 - 7, h * 0.36 + size * 0.7, 14, 4);
  g.fillStyle = '#d0202e'; g.fillRect(w / 2 + 7, h * 0.36 + size * 0.7, 14, 4);
}

function paintPlaque(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f1ede2';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = NAVY;
  g.lineWidth = 3;
  g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#1f3f9a'; g.fillRect(w / 2 - 18, 12, 12, 9);
  g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 6, 12, 12, 9);
  g.fillStyle = '#d0202e'; g.fillRect(w / 2 + 6, 12, 12, 9);
  g.fillStyle = NAVY;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const s = fitFont(g, 'RÉPUBLIQUE', 19, w - 18, '800');
  g.font = `800 ${s}px ${SANS}`;
  g.fillText('RÉPUBLIQUE', w / 2, 44);
  g.fillText('FRANÇAISE', w / 2, 64);
  const s2 = fitFont(g, 'Liberté Égalité Fraternité', 10, w - 18, 'italic 500');
  g.font = `italic 500 ${s2}px ${SANS}`;
  g.fillText('Liberté Égalité Fraternité', w / 2, 79);
}

/** Marquage d'une place : cadre jaune et « POLICE » dans le sens de la longueur (fond transparent). */
function paintBay(g: CanvasRenderingContext2D, w: number, h: number, line: number, px: number): void {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = YELLOW;
  g.lineWidth = line;
  g.strokeRect(line / 2 + 2, line / 2 + 2, w - line - 4, h - line - 4);
  g.fillStyle = YELLOW;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = fitFont(g, 'POLICE', px, w - line * 4 - 12, '800');
  g.font = `800 ${size}px ${SANS}`;
  g.fillText('POLICE', w / 2, h / 2 + 1);
}

function paintWhite(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
}

export interface CommissariatAtlas {
  readonly texture: THREE.CanvasTexture;
  dispose(): void;
}

/** Peint l'atlas (navigateur) ; null sans canevas (Node) ou si le contexte 2D est refusé. */
export function createCommissariatAtlas(anisotropy = 4): CommissariatAtlas | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const paint = (r: AtlasRegion, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void => {
    g.save();
    g.translate(r.x, r.y);
    g.beginPath();
    g.rect(0, 0, r.w, r.h);
    g.clip();
    try {
      fn(g, r.w, r.h);
    } catch (err) {
      console.error('[commissariats] peinture de l\'atlas impossible :', err);
    }
    g.restore();
  };
  for (const def of COMMISSARIATS) {
    const r = plateRegion(def.id);
    if (r) paint(r, (gg, w, h) => paintPlate(gg, def, w, h));
  }
  paint(REGIONS.lanterne_police, (gg, w, h) => paintLantern(gg, 'POLICE', w, h));
  paint(REGIONS.lanterne_gendarmerie, (gg, w, h) => paintLantern(gg, 'GENDARMERIE', w, h));
  paint(REGIONS.vitre_police, (gg, w, h) => paintGlass(gg, 'POLICE', w, h));
  paint(REGIONS.vitre_gendarmerie, (gg, w, h) => paintGlass(gg, 'GENDARMERIE', w, h));
  paint(REGIONS.plaque_rf, paintPlaque);
  paint(REGIONS.baie, (gg, w, h) => paintBay(gg, w, h, 7, 44));
  paint(REGIONS.baie_moto, (gg, w, h) => paintBay(gg, w, h, 6, 30));
  paint(REGIONS.blanc, paintWhite);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.max(1, Math.min(8, anisotropy));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.name = 'atlas-commissariats';
  return {
    texture: tex,
    dispose: () => tex.dispose(),
  };
}
