/* Kit monuments — outils de textures procédurales sur canvas (aucun fichier d'asset).
 * Sous Node (tests unitaires), `document` n'existe pas : les fabriques rendent `null` et les matériaux
 * sont créés sans texture ; la géométrie reste entièrement constructible et mesurable. */
import * as THREE from 'three';

export type RGB = [number, number, number];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function rngOf(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgbOf(hex: number): RGB {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export function css(hex: number, alpha = 1): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mélange deux couleurs 0xRRGGBB. */
export function mixHex(a: number, b: number, t: number): number {
  const A = rgbOf(a), B = rgbOf(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return (r << 16) | (g << 8) | bl;
}

export function hasCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export interface Canvas2D { c: HTMLCanvasElement; g: CanvasRenderingContext2D; w: number; h: number }

/** Crée un canvas 2D, ou null hors navigateur. */
export function canvas2d(w: number, h: number): Canvas2D | null {
  if (!hasCanvas()) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  return { c, g, w, h };
}

export interface TexOpts {
  /** Taille réelle du motif en mètres (un nombre ou [largeur, hauteur]) : repeat = 1 / taille. Absent : UV 0..1. */
  tile?: number | [number, number];
  /** Texture de couleur (sRGB) ou de données (relief). */
  srgb?: boolean;
  /** Pas de répétition (panneau unique). */
  clamp?: boolean;
}

export function texFrom(cv: Canvas2D, o: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv.c);
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (o.tile !== undefined) {
    const tx = typeof o.tile === 'number' ? o.tile : o.tile[0];
    const ty = typeof o.tile === 'number' ? o.tile : o.tile[1];
    t.repeat.set(1 / tx, 1 / ty);
  }
  t.needsUpdate = true;
  return t;
}

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur lissé, périodique (période entière en unités de maille). */
export function tileNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v: number): number => ((v % period) + period) % period;
  const a = hash(w(x0), w(y0), seed), b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed), d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Bruit fractal périodique 0..1. */
export function fbm(x: number, y: number, period: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(x * f, y * f, period * f, seed + o * 17) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/**
 * Remplit le canvas d'une matière mouchetée répétable : teinte de base modulée par un bruit lent
 * (amplitude `amp`, `cells` mailles par côté) et un grain fin (`grain`). `tint2` : seconde teinte mêlée par taches.
 */
export function paintMatter(cv: Canvas2D, base: number, amp: number, cells: number, seed: number, grain = 0.05, tint2?: number, tint2Amount = 0.5): void {
  const { g, w, h } = cv;
  const img = g.createImageData(w, h);
  const d = img.data;
  const [r0, g0, b0] = rgbOf(base);
  const t2 = tint2 !== undefined ? rgbOf(tint2) : null;
  const rnd = rngOf(seed * 7 + 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * cells, (y / h) * cells, cells, 4, seed);
      const k = 1 + (n - 0.5) * 2 * amp + (rnd() - 0.5) * 2 * grain;
      let r = r0, gg = g0, b = b0;
      if (t2) {
        const m = Math.min(1, Math.max(0, (fbm((x / w) * cells * 0.5 + 9.3, (y / h) * cells * 0.5 + 4.1, Math.max(1, cells >> 1), 3, seed + 91) - 0.42) * 4)) * tint2Amount;
        r += (t2[0] - r) * m; gg += (t2[1] - gg) * m; b += (t2[2] - b) * m;
      }
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, r * k));
      d[i + 1] = Math.max(0, Math.min(255, gg * k));
      d[i + 2] = Math.max(0, Math.min(255, b * k));
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Remplit un canvas de relief (niveaux de gris) : fond clair avec un léger bruit de surface. */
export function paintBumpBase(cv: Canvas2D, level: number, amp: number, cells: number, seed: number): void {
  const { g, w, h } = cv;
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * cells, (y / h) * cells, cells, 3, seed);
      const v = Math.max(0, Math.min(255, level + (n - 0.5) * 2 * amp));
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Coulures verticales sombres (patine) répétables : bandes sur toute la hauteur, d'opacité variable. */
export function paintStreaks(cv: Canvas2D, color: number, count: number, maxAlpha: number, seed: number): void {
  const { g, w, h } = cv;
  const rnd = rngOf(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, sw = 2 + rnd() * (w / 24), a = maxAlpha * (0.3 + 0.7 * rnd());
    const grad = g.createLinearGradient(x - sw, 0, x + sw, 0);
    grad.addColorStop(0, css(color, 0)); grad.addColorStop(0.5, css(color, a)); grad.addColorStop(1, css(color, 0));
    g.fillStyle = grad;
    for (const dx of [-w, 0, w]) { g.save(); g.translate(dx, 0); g.fillRect(x - sw, 0, sw * 2, h); g.restore(); }
  }
}
