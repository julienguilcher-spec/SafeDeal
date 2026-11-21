/* =====================================================================================
 * RENDU DU DÉCOR — atlas de textures partagé (canvas) : toutes les régions statiques sont peintes
 * une fois ; les cellules d'enseigne sont peintes à la demande, quand un commerce proche a besoin de
 * son NOM FICTIF. Une seule texture pour tout le module (mobilier, devantures, barricades).
 * ===================================================================================== */

import * as THREE from 'three';
import { ATLAS_SIZE, REGIONS, SIGN_CELLS, SIGN_H, SIGN_W, SignAllocator, signRegion } from './atlas-layout';
import type { Region } from './atlas-layout';
import { staticPainters, hex } from './atlas-paint';
import { DISPLAY_PAINTERS } from './atlas-paint-shops';
import { lcg } from './models-a';
import { layoutSign, signKey } from './signtext';
import type { ShopStyle } from './signtext';

const FONTS: readonly string[] = [
  'Georgia, "Times New Roman", "DejaVu Serif", serif',
  '"Helvetica Neue", Arial, "DejaVu Sans", sans-serif',
  '"Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", Arial, sans-serif',
  'Georgia, "Times New Roman", "DejaVu Serif", serif',
];

function fontSpec(style: ShopStyle, px: number): string {
  const weight = style.font === 2 ? '800' : style.font === 1 ? '700' : '600';
  return `${style.font === 3 ? 'italic ' : ''}${weight} ${px}px ${FONTS[style.font]}`;
}

export class PropAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly signs = new SignAllocator(SIGN_CELLS);
  private readonly g: CanvasRenderingContext2D;
  private readonly scale: number;
  private dirty = false;
  /** Durée de la peinture initiale (ms) et nombre d'envois de la texture à la carte graphique. */
  paintMs = 0;
  uploads = 0;

  constructor(readonly size: number, anisotropy: number) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('[props] contexte 2D indisponible pour l\'atlas');
    this.canvas = canvas;
    this.g = g;
    this.scale = size / ATLAS_SIZE;
    const t0 = performance.now();
    this.paintStatic();
    this.paintMs = performance.now() - t0;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.max(1, Math.min(8, anisotropy));
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.name = 'atlas-decor';
    this.texture = tex;
    this.uploads = 1;
  }

  private begin(r: Region): CanvasRenderingContext2D {
    const g = this.g;
    g.save();
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.translate(r.x, r.y);
    g.beginPath();
    g.rect(0, 0, r.w, r.h);
    g.clip();
    g.clearRect(0, 0, r.w, r.h);
    g.globalAlpha = 1;
    g.textBaseline = 'alphabetic';
    return g;
  }

  private paintStatic(): void {
    const painters = { ...DISPLAY_PAINTERS, ...staticPainters() };
    let k = 0;
    for (const name of Object.keys(REGIONS)) {
      const p = painters[name];
      if (!p) continue;
      const r = REGIONS[name]!;
      const g = this.begin(r);
      try {
        p(g, r.w, r.h, lcg(101 + k * 7));
      } catch (err) {
        console.error('[props] peinture de la région « ' + name + ' » impossible :', err);
      }
      g.restore();
      k++;
    }
  }

  /** Région de l'enseigne d'un commerce : attribue et peint une cellule si besoin ; null si l'atlas est plein. */
  acquireSign(name: string, style: ShopStyle): Region | null {
    if (name === '') return null;
    const cell = this.signs.acquire(signKey(name, style));
    if (cell < 0) return null;
    if (this.signs.lastWasFresh) {
      this.paintSign(cell, name, style);
      this.dirty = true;
    }
    return signRegion(cell);
  }

  releaseSign(name: string, style: ShopStyle): void {
    if (name !== '') this.signs.release(signKey(name, style));
  }

  private paintSign(cell: number, name: string, style: ShopStyle): void {
    const r = signRegion(cell);
    const g = this.begin(r);
    g.fillStyle = hex(style.band);
    g.fillRect(0, 0, SIGN_W, SIGN_H);
    if (style.border) {
      g.strokeStyle = hex(style.ink);
      g.lineWidth = 1.5;
      g.strokeRect(5, 5, SIGN_W - 10, SIGN_H - 10);
    }
    const measure = (text: string, px: number): number => {
      g.font = fontSpec(style, px);
      return g.measureText(text).width;
    };
    const lay = layoutSign(name, SIGN_W - (style.border ? 20 : 0), SIGN_H, measure, style.upper);
    g.font = fontSpec(style, lay.fontPx);
    g.textAlign = 'center';
    g.fillStyle = hex(style.ink);
    for (let i = 0; i < lay.lines.length; i++) g.fillText(lay.lines[i]!, SIGN_W / 2, lay.baselines[i]!);
    g.restore();
  }

  /** À appeler une fois par image : renvoie la texture si des enseignes viennent d'être peintes. */
  flush(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    this.texture.needsUpdate = true;
    this.uploads++;
    return true;
  }

  dispose(): void {
    this.texture.dispose();
    this.signs.clear();
  }
}
