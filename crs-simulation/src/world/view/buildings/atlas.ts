/* =====================================================================================
 * IMMEUBLES — atlas de textures des façades et des toitures
 * -------------------------------------------------------------------------------------
 * Toutes les cellules sont peintes sur canvas puis rangées dans UNE texture « tableau »
 * (une couche par cellule, voir layers.ts). RVB = albédo (sRGB), alpha = masque des vitrages.
 * La texture est créée une fois par taille de cellule et partagée par toutes les tuiles.
 * ===================================================================================== */

import * as THREE from 'three';
import {
  FAUBOURG_VARIANTS, HAUSSMANN_VARIANTS, LAYER_BETON, LAYER_COUNT, LAYER_COUR_RDC, LAYER_FAUBOURG, LAYER_HAUSSMANN, LAYER_MODERN,
  LAYER_MONUMENTAL, LAYER_PIGNON, LAYER_ZINC_BRISIS, MODERN_VARIANTS, MONUMENTAL_VARIANTS,
} from './layers';
import { CellPainter, makeNoiseCanvas } from './paint';
import { paintHaussmannFamily } from './paintHaussmann';
import type { PaintEnv } from './paintHaussmann';
import { paintRailTexture, paintRoofLayers } from './paintRoofs';
import { paintConcrete, paintCourtyardFloor, paintCourtyardGround, paintFaubourgFamily, paintGable, paintModernFamily, paintMonumentalFamily } from './paintStyles';

export interface AtlasOptions {
  /** Côté d'une cellule en pixels (puissance de 2). */
  cellSize: number;
  /** Balcons et garde-corps filants peints dans la texture (quand ils ne sont pas en volume). */
  paintedBalconies: boolean;
  anisotropy: number;
}

export interface FacadeAtlas {
  texture: THREE.DataArrayTexture;
  options: AtlasOptions;
  /** Temps de peinture (ms) et octets de la texture (niveau 0, hors mipmaps). */
  paintMs: number;
  bytes: number;
}

/**
 * Peint toutes les couches. Retourne les pixels RVBA (lignes du bas vers le haut), couche après couche.
 * `onLayer` (banc d'essai) reçoit une copie du canvas de chaque couche.
 */
export function paintAtlasPixels(options: AtlasOptions, onLayer?: (layer: number, color: HTMLCanvasElement, mask: HTMLCanvasElement) => void): Uint8Array {
  const S = options.cellSize;
  const data = new Uint8Array(S * S * 4 * LAYER_COUNT);
  const env: PaintEnv = {
    grain: makeNoiseCanvas(S, Math.max(8, S / 4), 3, 12345, 0.5),
    blotch: makeNoiseCanvas(S, 4, 4, 6789, 0.55),
    fine: makeNoiseCanvas(S, S / 2, 2, 424242, 0.9),
    paintedBalconies: options.paintedBalconies,
  };
  const p = new CellPainter(S);
  let layer = 0;
  const emit = (): void => {
    if (layer >= LAYER_COUNT) throw new Error('[buildings] atlas : trop de couches peintes');
    p.read(data, layer * S * S * 4);
    if (onLayer) onLayer(layer, p.color, p.maskCanvas);
    layer++;
  };
  const expect = (index: number, what: string): void => {
    if (layer !== index) throw new Error(`[buildings] atlas : la couche « ${what} » devrait être ${index}, pas ${layer}`);
  };
  expect(LAYER_HAUSSMANN, 'haussmann');
  for (let v = 0; v < HAUSSMANN_VARIANTS; v++) paintHaussmannFamily(p, env, v, emit);
  expect(LAYER_FAUBOURG, 'faubourg');
  for (let v = 0; v < FAUBOURG_VARIANTS; v++) paintFaubourgFamily(p, env, v, emit);
  expect(LAYER_MODERN, 'moderne');
  for (let v = 0; v < MODERN_VARIANTS; v++) paintModernFamily(p, env, v, emit);
  expect(LAYER_MONUMENTAL, 'monumental');
  for (let v = 0; v < MONUMENTAL_VARIANTS; v++) paintMonumentalFamily(p, env, v, emit);
  expect(LAYER_COUR_RDC, 'cour');
  paintCourtyardGround(p, env); emit();
  paintCourtyardFloor(p, env); emit();
  expect(LAYER_PIGNON, 'pignon');
  paintGable(p, env, 0); emit();
  paintGable(p, env, 1); emit();
  expect(LAYER_BETON, 'béton');
  paintConcrete(p, env); emit();
  expect(LAYER_ZINC_BRISIS, 'toitures');
  paintRoofLayers(p, env, emit);
  expect(LAYER_COUNT, 'fin');
  return data;
}

/** Crée la texture tableau de l'atlas. */
export function createFacadeAtlas(options: AtlasOptions): FacadeAtlas {
  const t0 = performance.now();
  const S = options.cellSize;
  const data = paintAtlasPixels(options);
  const texture = new THREE.DataArrayTexture(data, S, S, LAYER_COUNT);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = options.anisotropy;
  texture.needsUpdate = true;
  texture.name = `immeubles-atlas-${S}`;
  return { texture, options, paintMs: performance.now() - t0, bytes: data.byteLength };
}

/** Texture ajourée des garde-corps et des mitrons (répétée en u). */
export function createRailTexture(size: number, anisotropy: number): THREE.CanvasTexture {
  const canvas = paintRailTexture(size * 2, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.name = 'immeubles-garde-corps';
  return texture;
}
