/* =====================================================================================
 * VILLE EN 3D — ressources partagées par toutes les tuiles (Three.js) : atlas du sol, texture
 * découpée, textures et géométries des arbres, matériaux communs. Créées une fois par qualité,
 * libérées d'un seul appel.
 * ===================================================================================== */

import * as THREE from 'three';
import { CLASS_COLOR, CLASS_LAYERS, CL_ASPHALT, CL_ROADMACRO, CL_WATER } from './classes';
import {
  createCrownMaterial, createCutoutMaterial, createHaloMaterial, createTrunkMaterial, createWaterMaterial,
} from './materials';
import { paintBarkTexture, paintCutoutAtlas, paintGroundAtlas, paintHaloTexture, paintLeafTexture } from './paint';
import type { CityQuality } from './quality';
import { createCrownGeometry, createTrunkGeometry } from './trees';

export interface SharedResources {
  quality: CityQuality;
  atlas: THREE.DataArrayTexture;
  /** Couleur moyenne (sRGB 0..255) de chaque classe, mesurée sur l'atlas : palette de la vue lointaine. */
  palette: (readonly [number, number, number])[];
  cutoutTexture: THREE.CanvasTexture;
  cutout: THREE.Material;
  water: THREE.Material;
  leafTexture: THREE.CanvasTexture;
  barkTexture: THREE.CanvasTexture;
  crownGeometry: THREE.BufferGeometry;
  crownFarGeometry: THREE.BufferGeometry;
  trunkGeometry: THREE.BufferGeometry;
  crown: THREE.Material;
  crownFar: THREE.Material;
  trunk: THREE.Material;
  haloTexture: THREE.CanvasTexture;
  haloGeometry: THREE.BufferGeometry;
  halo: THREE.MeshBasicMaterial;
  /** Temps de peinture des textures (ms) et octets des textures partagées (niveau 0). */
  paintMs: number;
  textureBytes: number;
}

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/** Couleur moyenne de chaque couche (moyenne en lumière linéaire, rendue en sRGB). */
function measurePalette(data: Uint8Array, size: number): (readonly [number, number, number])[] {
  const palette: (readonly [number, number, number])[] = [];
  const stride = size * size * 4;
  const step = Math.max(1, Math.floor(size / 64));
  for (let layer = 0; layer < CLASS_LAYERS; layer++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const o = layer * stride + (y * size + x) * 4;
        r += srgbToLinear(data[o]);
        g += srgbToLinear(data[o + 1]);
        b += srgbToLinear(data[o + 2]);
        n++;
      }
    }
    palette.push([linearToSrgb(r / n), linearToSrgb(g / n), linearToSrgb(b / n)]);
  }
  // La couche « grande échelle » n'est pas un revêtement ; l'eau n'a pas de couche.
  palette[CL_ROADMACRO] = palette[CL_ASPHALT];
  palette[CL_WATER] = CLASS_COLOR[CL_WATER];
  // L'enrobé est assombri en moyenne par sa couche de grande échelle (facteur 0,55 + 0,9 × 0,5 ≈ 1).
  return palette;
}

function canvasTexture(canvas: HTMLCanvasElement, anisotropy: number, repeat: boolean, name: string): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.name = name;
  return t;
}

/** Crée toutes les ressources partagées d'une qualité. `antialias` : le contexte WebGL est-il antialiasé ? */
export function createSharedResources(q: CityQuality, antialias: boolean): SharedResources {
  const t0 = performance.now();
  const S = q.atlasSize;
  const data = paintGroundAtlas(S);
  const atlas = new THREE.DataArrayTexture(data, S, S, CLASS_LAYERS);
  atlas.format = THREE.RGBAFormat;
  atlas.type = THREE.UnsignedByteType;
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.wrapT = THREE.RepeatWrapping;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.anisotropy = q.anisotropy;
  atlas.needsUpdate = true;
  atlas.name = `ville-sol-atlas-${S}`;
  const palette = measurePalette(data, S);

  const cutSize = q.lambert ? 512 : 1024;
  const cutoutTexture = canvasTexture(paintCutoutAtlas(cutSize), q.anisotropy, false, 'ville-decoupe');
  cutoutTexture.wrapS = THREE.RepeatWrapping;
  const leafSize = q.lambert ? 128 : 256;
  const leafTexture = canvasTexture(paintLeafTexture(leafSize), Math.min(4, q.anisotropy), true, 'ville-feuillage');
  const barkTexture = canvasTexture(paintBarkTexture(64, 128), 2, true, 'ville-ecorce');
  const haloTexture = canvasTexture(paintHaloTexture(64), 1, false, 'ville-halo');

  const crownGeometry = createCrownGeometry({ main: q.crownMain, side: q.crownSide, trunkSides: q.trunkSides });
  const crownFarGeometry = createCrownGeometry({ main: 0, side: -1, trunkSides: 0 });
  const trunkGeometry = createTrunkGeometry(q.trunkSides);
  const haloGeometry = new THREE.PlaneGeometry(2, 2);
  haloGeometry.rotateX(-Math.PI / 2);

  return {
    quality: q,
    atlas,
    palette,
    cutoutTexture,
    cutout: createCutoutMaterial(cutoutTexture, antialias),
    water: createWaterMaterial(q.lambert),
    leafTexture,
    barkTexture,
    crownGeometry,
    crownFarGeometry,
    trunkGeometry,
    crown: createCrownMaterial(leafTexture, { wind: q.wind, cut: q.leafCut }),
    crownFar: createCrownMaterial(null, { wind: false, cut: false }),
    trunk: createTrunkMaterial(barkTexture),
    haloTexture,
    haloGeometry,
    halo: createHaloMaterial(haloTexture),
    paintMs: performance.now() - t0,
    textureBytes: data.byteLength + cutSize * cutSize * 4 + leafSize * leafSize * 4 + 64 * 128 * 4 + 64 * 64 * 4,
  };
}

export function disposeSharedResources(s: SharedResources): void {
  s.atlas.dispose();
  s.cutoutTexture.dispose();
  s.cutout.dispose();
  s.water.dispose();
  s.leafTexture.dispose();
  s.barkTexture.dispose();
  s.crownGeometry.dispose();
  s.crownFarGeometry.dispose();
  s.trunkGeometry.dispose();
  s.crown.dispose();
  s.crownFar.dispose();
  s.trunk.dispose();
  s.haloTexture.dispose();
  s.haloGeometry.dispose();
  s.halo.dispose();
}
