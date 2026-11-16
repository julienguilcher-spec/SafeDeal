/* Obstacles de l'église Saint-Sulpice. Le rez-de-chaussée de la façade est un PORTIQUE OUVERT entre les deux tours :
 * on passe sous la colonnade dorique (entablement à 14 m), entre les colonnes ; les tours, le mur du fond, la nef,
 * le transept, le chevet et la chapelle de la Vierge sont pleins.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { ngonRing, rectRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -28.96, maxX: 28.83, minZ: -61.13, maxZ: 61.19 } as const;

export const EMPRISE: readonly number[] = [
  -28.1, 61.2, 27.6, 61.2, 27.7, 47.7, 23.9, 47.7, 24.6, 16.7, 26.3, 16.7, 26.2, 15.4, 27.4, 15.4, 27.4, 13, 26.8, 13.2,
  26.8, 7.9, 27.4, 7.9, 27.4, 6.3, 28.8, 6.3, 28.8, -10.8, 27.4, -10.9, 27.4, -12.4, 26.8, -12.4, 26.7, -18.7, 27.3, -18.7,
  27.3, -20.3, 26.2, -20.3, 27.2, -43.5, 26.8, -43.6, 27.6, -52.5, 27.3, -54, 26.3, -55.7, 24.6, -56.7, 3, -58.6, 2.3, -60.1,
  0.6, -61.1, -1.4, -61, -3.1, -58.9, -7.1, -59, -6.9, -57, -8.3, -54.8, -9.8, -54.9, -9.8, -49.1, -13.4, -47.4, -18.4, -42.9,
  -20.9, -39.4, -22.8, -34.8, -26, -34.8, -26.1, -21, -26.8, -20.2, -27.7, -20.2, -27.7, -18.1, -27.3, -18.2, -27.4, -12.1, -27.9, -12.1,
  -27.8, -10.8, -29, -10.7, -29, 6.3, -27.7, 6.3, -27.7, 7.7, -27.3, 7.8, -27.3, 13.7, -27.7, 13.7, -27.8, 15.8, -26.3, 16.3,
  -26.2, 16.8, -24.6, 16.8, -25, 47.8, -28.1, 47.8,
];

export const SUL = {
  /** Front et fond du massif de façade, mur du fond du portique, demi-largeur de la façade, demi-largeur entre tours. */
  ZF: 61.2, ZB: 48.3, ZWALL: 53.4, HF: 28, HP: 16.5,
  /** Demi-largeur des chapelles et du vaisseau, transept (demi-longueur, faces ouest et est), centre du chevet. */
  HB: 24.6, HN: 10.5, HT: 29, ZT0: 6.3, ZT1: -10.6, ZA: -28,
  /** Colonnade basse : nombre de colonnes par rang, diamètre, dessous de l'entablement, hauteur du perron. */
  COLS: 8, DIA: 1.6, ENT: 14.4, STEP: 0.5,
} as const;

/** Abscisses des colonnes du portique (deux rangs identiques), dans le repère de dessin. */
export function porticoColumns(): number[] {
  const out: number[] = [];
  const span = SUL.HP - 1.6;
  for (let i = 0; i < SUL.COLS; i++) out.push(-span + (i / (SUL.COLS - 1)) * 2 * span);
  return out;
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const { ZF, ZB, ZWALL, HF, HP, HB, HT, ZT0, ZT1, ZA, DIA, ENT } = SUL;
  const out: MonumentCollider[] = [
    // tours, mur du fond du portique, nef et chœur, transept, chevet, chapelle de la Vierge, sacristie
    { ring: fit(rectRing(-(HF + HP) / 2, (ZF + ZB) / 2, HF - HP, ZF - ZB)), height: 73, baseY: 0 },
    { ring: fit(rectRing((HF + HP) / 2, (ZF + ZB) / 2, HF - HP, ZF - ZB)), height: 68, baseY: 0 },
    { ring: fit(rectRing(0, (ZWALL + ZA) / 2, 2 * HB, ZWALL - ZA)), height: 41, baseY: 0 },
    { ring: fit(rectRing(0, (ZT0 + ZT1) / 2, 2 * HT, ZT0 - ZT1)), height: 41, baseY: 0 },
    { ring: fit(ngonRing(0, ZA, HB, 16)), height: 41, baseY: 0 },
    { ring: fit(ngonRing(0, -54.5, 7, 12)), height: 20, baseY: 0 },
    { ring: fit(rectRing(18.2, -47.5, 18.6, 19)), height: 11, baseY: 0 },
    // loggia haute et entablement au-dessus du portique : on passe dessous
    { ring: fit(rectRing(0, (ZF + ZWALL) / 2, 2 * HP, ZF - ZWALL)), height: 17.5, baseY: ENT },
  ];
  for (const x of porticoColumns()) for (const z of [ZF - 1.4, ZF - 5.2]) out.push({ ring: fit(ngonRing(x, z, DIA / 2 + 0.1, 8)), height: ENT, baseY: 0 });
  return out;
}
