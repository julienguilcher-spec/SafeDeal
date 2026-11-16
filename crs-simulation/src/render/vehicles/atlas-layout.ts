/* Plan de l'atlas de marquages des véhicules — logique pure (aucun DOM) : les constructeurs de modèles
 * n'ont besoin que des rectangles ; le dessin sur canvas est dans atlas.ts. */

import type { UvRect } from './geo';

export const ATLAS_W = 2048;
export const ATLAS_H = 1024;
const PAD = 8;

/** Vitrage : trois variantes côte à côte (intact, brisé, brûlé). Le shader décale u de GLASS_SHIFT_U par état. */
export const GLASS_CELL = 96;
export const GLASS_SHIFT_U = GLASS_CELL / ATLAS_W;

export type TileName =
  | 'blanc' | 'verre' | 'grille' | 'jante_tole' | 'jante_alu' | 'jante_pl' | 'jante_moto'
  | 'police' | 'gendarmerie' | 'pompiers' | 'samu' | 'ambulance' | 'taxi'
  | 'bande_police' | 'chevrons' | 'damier' | 'girouette' | 'banderole' | 'enceinte' | 'calandre'
  | 'tubes' | 'blindage' | 'optique' | 'rideau' | 'led' | 'plancher';

/** Dimensions (px) de chaque tuile. */
export const TILE_SIZES: Readonly<Record<TileName, readonly [number, number]>> = {
  blanc: [32, 32],
  verre: [GLASS_CELL * 3, GLASS_CELL],
  grille: [512, 256],
  jante_tole: [128, 128],
  jante_alu: [128, 128],
  jante_pl: [128, 128],
  jante_moto: [128, 128],
  police: [512, 128],
  gendarmerie: [896, 128],
  pompiers: [896, 176],
  samu: [320, 128],
  ambulance: [640, 96],
  taxi: [256, 96],
  bande_police: [1024, 96],
  chevrons: [256, 128],
  damier: [512, 48],
  girouette: [448, 64],
  banderole: [1024, 192],
  enceinte: [128, 128],
  calandre: [256, 96],
  tubes: [256, 216],
  blindage: [256, 128],
  optique: [64, 64],
  rideau: [128, 128],
  led: [128, 32],
  plancher: [128, 128],
};

export interface TilePx { x: number; y: number; w: number; h: number }

/** Placement par étagères, déterministe : tuiles triées par hauteur décroissante puis par nom. */
function pack(): Record<TileName, TilePx> {
  const names = (Object.keys(TILE_SIZES) as TileName[]).sort((a, b) => {
    const d = TILE_SIZES[b][1] - TILE_SIZES[a][1];
    return d !== 0 ? d : a < b ? -1 : 1;
  });
  const out = {} as Record<TileName, TilePx>;
  let x = PAD, y = PAD, shelf = 0;
  for (const name of names) {
    const [w, h] = TILE_SIZES[name];
    if (x + w + PAD > ATLAS_W) { x = PAD; y += shelf + PAD; shelf = 0; }
    out[name] = { x, y, w, h };
    x += w + PAD;
    if (h > shelf) shelf = h;
  }
  if (y + shelf + PAD > ATLAS_H) throw new Error('[vehicles] atlas trop petit pour les tuiles déclarées');
  return out;
}

export const TILE_PX: Readonly<Record<TileName, TilePx>> = pack();

function toUv(p: TilePx, inset: number): UvRect {
  return {
    u0: (p.x + inset) / ATLAS_W,
    u1: (p.x + p.w - inset) / ATLAS_W,
    v0: 1 - (p.y + p.h - inset) / ATLAS_H,
    v1: 1 - (p.y + inset) / ATLAS_H,
  };
}

const UV: Record<string, UvRect> = {};
for (const name of Object.keys(TILE_PX) as TileName[]) UV[name] = toUv(TILE_PX[name], 0.75);
// le vitrage n'utilise que la première cellule (les deux autres sont atteintes par décalage dans le shader)
{
  const p = TILE_PX.verre;
  UV.verre = toUv({ x: p.x, y: p.y, w: GLASS_CELL, h: GLASS_CELL }, 3);
}
// l'aplat blanc est échantillonné en son centre (aucun risque de bavure)
{
  const p = TILE_PX.blanc;
  UV.blanc = toUv({ x: p.x + 12, y: p.y + 12, w: 8, h: 8 }, 0);
}

/** Rectangle d'atlas d'une tuile. */
export function tile(name: TileName): UvRect {
  return UV[name]!;
}

/** Proportion largeur / hauteur d'une tuile (pour dimensionner un panneau sans déformer le texte). */
export function tileAspect(name: TileName): number {
  const s = TILE_SIZES[name];
  return s[0] / s[1];
}

// ── plaques d'immatriculation : texture séparée, petite, mise à jour à la volée ──────────────────
export const PLATE_COLS = 8;
export const PLATE_ROWS = 8;
export const PLATE_SLOTS = PLATE_COLS * PLATE_ROWS;
export const PLATE_W = 128;
export const PLATE_H = 32;
