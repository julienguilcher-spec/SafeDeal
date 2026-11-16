/* Obstacles du Centre Pompidou. Le volume vitré (166,4 × 48 m) et la nappe de tuyaux côté rue du Renard (est, −z)
 * sont pleins. Côté piazza (ouest, +z), l'ossature extérieure porte des coursives à partir du premier niveau
 * (7 m) : on marche DESSOUS, entre les poteaux ; seuls les poteaux et le pied de l'escalier mécanique touchent le sol.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -84.04, maxX: 84.1, minZ: -33, maxZ: 33.02 } as const;

export const EMPRISE: readonly number[] = [
  -84, -33, -83, 26.3, -65.2, 26.6, -65.3, 28.4, -68.5, 28.4, -68.5, 33, -56.4, 32.9, -56.4, 28.6, 50.8, 28.2, 84, 28.7,
  84.1, -33,
];

export const CP = {
  /** Demi-longueur, faces est et ouest du volume vitré, plans extérieurs de l'ossature (est, ouest), hauteur. */
  HX: 83.2, ZB0: -26, ZB1: 22, ZE: -32.6, ZW: 28.3, H: 42,
  /** Entraxe des portiques (13 travées), hauteur d'étage, axe de l'escalier mécanique, abscisse de son pied. */
  BAY: 12.8, FLOOR: 7, ZTUBE: 30.6, XFOOT: -62,
} as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const { HX, ZB0, ZB1, ZE, ZW, H, BAY, FLOOR, ZTUBE, XFOOT } = CP;
  const out: MonumentCollider[] = [
    { ring: fit(rectRing(0, (ZB0 + ZB1) / 2, 2 * HX, ZB1 - ZB0)), height: H, baseY: 0 },
    { ring: fit(rectRing(0, (ZE + ZB0) / 2 - 0.2, 2 * HX, ZB0 - ZE + 0.4)), height: H + 4, baseY: 0 },
    // coursives de la façade piazza : on passe dessous
    { ring: fit(rectRing(0, (ZB1 + ZW) / 2 + 0.3, 2 * HX, ZW - ZB1 + 0.6)), height: H - FLOOR, baseY: FLOOR - 0.4 },
    // pied de l'escalier mécanique (« chenille »), puis le tube qui monte au-dessus des têtes
    { ring: fit(rectRing(XFOOT - 0.4, ZTUBE, 11.6, 4.6)), height: 3.2, baseY: 0 },
    { ring: fit(rectRing((XFOOT + 12 + HX) / 2, ZTUBE, HX - XFOOT - 12, 4.4)), height: 34, baseY: 4.2 },
  ];
  for (let i = 0; i <= 13; i++) out.push({ ring: fit(rectRing(-HX + i * BAY, ZB1 + 1.6, 1.0, 1.0)), height: H, baseY: 0 });
  return out;
}
