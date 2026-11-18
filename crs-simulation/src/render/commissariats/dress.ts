/* =====================================================================================
 * RENDU DES COMMISSARIATS — largeur habillée de la façade (pur : sans THREE, importable par le rendu du décor).
 *
 * L'habillage d'un site (build.ts) occupe la façade de part et d'autre de son point de façade, le long de la façade :
 * encadrement de porte et plaque au milieu, lanterne d'un côté, hampe et drapeau de l'autre. Une devanture de
 * commerce des données de la carte posée sur ce morceau de façade (le 9e : une banque à 3,5 m de la porte, la plaque
 * « RÉPUBLIQUE FRANÇAISE » sur sa vitre ; les Célestins ; le 3e) n'est pas dessinée : le rendu du décor la saute
 * (renderer.ts, ShopRec.masked). La boutique reste dans la simulation (mêmes identifiants, mêmes tirages).
 * ===================================================================================== */

import type { CommissariatDef } from '@/world/commissariats';

/** Position de la lanterne et du drapeau le long de la façade (m, depuis le point de façade). */
export function sideOffsets(def: CommissariatDef): { lantern: number; flag: number } {
  return def.sign === 'none' ? { lantern: 1.6, flag: -1.6 } : { lantern: 2.75, flag: -2.75 };
}

/**
 * Dégagement laissé de part et d'autre de la lanterne et de la hampe (m) : chapeau de la lanterne (0,29 m), drapeau
 * qui pend de la hampe, et la place d'un trumeau de façade — une devanture collée au drapeau se lisait comme la
 * vitrine du commissariat (le 3e : enseigne à 0,5 m de la hampe).
 */
export const DRESS_CLEARANCE = 0.8;
/** Écart à la façade (m) et écart de cap (rad) au-delà desquels une devanture n'est pas sur la façade du site. */
const FACADE_DEPTH = 2.0;
const FACADE_TURN = 0.5;

/** Morceau de façade habillé, en abscisse le long de la façade (m, depuis le point de façade). */
export function dressSpan(def: CommissariatDef): { u0: number; u1: number } {
  const s = sideOffsets(def);
  return { u0: Math.min(s.flag, s.lantern) - DRESS_CLEARANCE, u1: Math.max(s.flag, s.lantern) + DRESS_CLEARANCE };
}

/** Devanture, comme la carte la donne : milieu de la vitrine, cap de la normale sortante, largeur. */
export interface ShopFrontLike {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly width: number;
}

/**
 * La vitrine de cette devanture chevauche-t-elle la façade habillée du site ? Même façade (à moins de FACADE_DEPTH m
 * de son plan, tournée du même côté) et intervalle de la vitrine le long de la façade qui recoupe dressSpan().
 */
export function shopOverlapsDress(shop: ShopFrontLike, def: CommissariatDef): boolean {
  const h = def.facade.heading;
  const ux = Math.cos(h), uz = -Math.sin(h);
  const nx = Math.sin(h), nz = Math.cos(h);
  const dx = shop.x - def.facade.x, dz = shop.z - def.facade.z;
  if (Math.abs(dx * nx + dz * nz) > FACADE_DEPTH) return false;
  let turn = (shop.heading - h) % (Math.PI * 2);
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  if (Math.abs(turn) > FACADE_TURN) return false;
  const u = dx * ux + dz * uz;
  const half = Math.max(0, shop.width) / 2;
  const span = dressSpan(def);
  return u + half > span.u0 && u - half < span.u1;
}

/** Devanture cachée par l'habillage d'un des sites (null : aucun). */
export function stationOverShop(shop: ShopFrontLike, defs: readonly CommissariatDef[]): CommissariatDef | null {
  for (const def of defs) {
    // (tri grossier : une vitrine à plus de 30 m de la porte ne touche pas la façade habillée)
    if (Math.abs(shop.x - def.door.x) > 30 || Math.abs(shop.z - def.door.z) > 30) continue;
    if (shopOverlapsDress(shop, def)) return def;
  }
  return null;
}
