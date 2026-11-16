/* =====================================================================================
 * VILLE EN 3D — peinture procédurale des revêtements (canvas 2D).
 * -------------------------------------------------------------------------------------
 * Chaque couche de l'atlas du sol est une image carrée qui se répète sans raccord visible :
 * tout motif est dessiné « en tore » (ce qui sort d'un bord rentre par le bord opposé) et les
 * bruits sont périodiques. RVB = couleur (sRGB) ; alpha = relief (0 = creux : joint, interstice ;
 * 255 = saillie), que le shader utilise pour le mouillé (l'eau remplit d'abord les creux).
 * ===================================================================================== */

import {
  CLASS_LAYERS, CL_ASPHALT, CL_CONCRETE, CL_COURT, CL_CURB, CL_EARTH, CL_GRASS, CL_HEDGE, CL_PAINT, CL_PLASTER, CL_PLAZA, CL_ROADMACRO,
  CL_SETT, CL_SIDEWALK, CL_SOIL, CL_STABILISE, CL_STONE,
} from './classes';

/** Longueur réelle (m) couverte par une répétition de chaque couche. */
export const LAYER_METERS: readonly number[] = (() => {
  const m = new Array<number>(CLASS_LAYERS).fill(4);
  m[CL_ASPHALT] = 4;
  m[CL_SETT] = 2.4;
  m[CL_SIDEWALK] = 3;
  m[CL_CURB] = 2;
  m[CL_PLAZA] = 4;
  m[CL_STABILISE] = 4;
  m[CL_GRASS] = 4;
  m[CL_SOIL] = 3;
  m[CL_STONE] = 3.2;
  m[CL_CONCRETE] = 3;
  m[CL_COURT] = 4;
  m[CL_PAINT] = 2;
  m[CL_EARTH] = 4;
  m[CL_HEDGE] = 2;
  m[CL_PLASTER] = 3;
  m[CL_ROADMACRO] = 26;
  return m;
})();

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit de valeur périodique : `size` × `size` valeurs dans [0, 1], maille de `period` cellules par côté. */
export function noiseTile(size: number, period: number, seed: number): Float32Array {
  const rnd = seeded(seed);
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const out = new Float32Array(size * size);
  const scale = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.floor(fy), ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const r0 = (y0 % period) * period, r1 = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.floor(fx), tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const c0 = x0 % period, c1 = (x0 + 1) % period;
      const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx;
      const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/** Somme de bruits périodiques (octaves) normalisée dans [0, 1]. */
export function fbmTile(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, p = period;
  for (let o = 0; o < octaves && p <= size; o++) {
    const n = noiseTile(size, p, seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Bruits partagés par toutes les couches d'une taille donnée. */
export interface PaintNoise {
  size: number;
  /** Grain très fin (un grain par pixel ou presque). */
  fine: Float32Array;
  /** Grain moyen (granulats). */
  grain: Float32Array;
  /** Taches larges. */
  blotch: Float32Array;
  /** Nuages très larges. */
  cloud: Float32Array;
}

export function makePaintNoise(size: number): PaintNoise {
  return {
    size,
    fine: noiseTile(size, size / 2, 11),
    grain: fbmTile(size, size / 8, 3, 23),
    blotch: fbmTile(size, 8, 3, 37),
    cloud: fbmTile(size, 3, 2, 53),
  };
}

/** Deux canvas de travail : couleur et relief. */
export class LayerPainter {
  readonly size: number;
  readonly color: HTMLCanvasElement;
  readonly height: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly h: CanvasRenderingContext2D;

  constructor(size: number) {
    this.size = size;
    this.color = document.createElement('canvas');
    this.height = document.createElement('canvas');
    this.color.width = this.color.height = size;
    this.height.width = this.height.height = size;
    this.g = this.color.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.h = this.height.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }

  /** Remplit la couleur et met le relief à mi-hauteur. */
  clear(css: string, heightGray = 128): void {
    this.g.globalAlpha = 1;
    this.g.fillStyle = css;
    this.g.fillRect(0, 0, this.size, this.size);
    this.h.globalAlpha = 1;
    this.h.fillStyle = `rgb(${heightGray},${heightGray},${heightGray})`;
    this.h.fillRect(0, 0, this.size, this.size);
  }

  /** Appelle `draw` neuf fois, décalé d'une image dans chaque direction : le motif se referme sur lui-même. */
  wrap(ctx: CanvasRenderingContext2D, draw: () => void): void {
    const s = this.size;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        ctx.save();
        ctx.translate(dx * s, dy * s);
        draw();
        ctx.restore();
      }
    }
  }

  /**
   * Applique les bruits pixel par pixel et écrit le résultat RVBA dans `out` (à partir de `offset`).
   * @param fine, grain, blotch, cloud amplitudes (en niveaux, sur 255) de chaque bruit
   * @param heightFromGrain part du grain dans le relief (0 = le relief vient du seul canvas de relief)
   */
  read(out: Uint8Array, offset: number, noise: PaintNoise, fine: number, grain: number, blotch: number, cloud: number, heightFromGrain: number): void {
    const s = this.size;
    const c = this.g.getImageData(0, 0, s, s).data;
    const hh = this.h.getImageData(0, 0, s, s).data;
    const nf = noise.fine, ng = noise.grain, nb = noise.blotch, nc = noise.cloud;
    for (let i = 0, p = 0; i < s * s; i++, p += 4) {
      const d = (nf[i] - 0.5) * fine + (ng[i] - 0.5) * grain + (nb[i] - 0.5) * blotch + (nc[i] - 0.5) * cloud;
      let r = c[p] + d, g = c[p + 1] + d, b = c[p + 2] + d;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      let a = hh[p] + (ng[i] - 0.5) * 255 * heightFromGrain;
      a = a < 0 ? 0 : a > 255 ? 255 : a;
      out[offset + p] = r;
      out[offset + p + 1] = g;
      out[offset + p + 2] = b;
      out[offset + p + 3] = a;
    }
  }
}

function gray(v: number, a = 1): string {
  const k = Math.round(v);
  return a >= 1 ? `rgb(${k},${k},${k})` : `rgba(${k},${k},${k},${a})`;
}

function rgb(r: number, g: number, b: number, a = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// ─────────────────────────────── revêtements ───────────────────────────────

/** Enrobé : fond sombre, granulats clairs et sombres. */
function paintAsphalt(p: LayerPainter, rnd: () => number): void {
  const s = p.size;
  p.clear('rgb(92,93,96)', 128);
  const g = p.g;
  const n = Math.round(s * s * 0.02);
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = 0.6 + rnd() * rnd() * (s / 200);
    const v = rnd();
    g.fillStyle = v < 0.55 ? gray(126 + rnd() * 60, 0.6) : gray(40 + rnd() * 30, 0.55);
    g.fillRect(x, y, r, r);
  }
}

/** Pavés de granit en rangées décalées : têtes bombées, joints sombres. */
function paintSett(p: LayerPainter, rnd: () => number): void {
  const s = p.size;
  p.clear('rgb(52,50,47)', 20);
  const rows = 16, cols = 12;
  const rh = s / rows, cw = s / cols;
  const g = p.g, h = p.h;
  for (let j = 0; j < rows; j++) {
    const shift = (j % 2) * 0.5 + (rnd() - 0.5) * 0.12;
    for (let i = 0; i < cols; i++) {
      const jx = (rnd() - 0.5) * cw * 0.08, jy = (rnd() - 0.5) * rh * 0.1;
      const x = (i + shift) * cw + jx, y = j * rh + jy;
      const gap = Math.max(1.2, s / 300) * (0.8 + rnd() * 0.7);
      const w = cw - gap, hh = rh - gap;
      const tone = rnd();
      // gris, gris-beige, quelques pavés rosés ou bleutés
      const base = 92 + rnd() * 40;
      const cr = base + (tone > 0.8 ? 14 : tone < 0.15 ? -6 : 3), cg = base + (tone > 0.8 ? 4 : 0), cb = base + (tone < 0.15 ? 8 : -5);
      const rad = Math.min(w, hh) * 0.22;
      const draw = (ctx: CanvasRenderingContext2D, fill: string): void => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x + gap / 2, y + gap / 2, w, hh, rad);
        ctx.fill();
      };
      p.wrap(g, () => {
        draw(g, rgb(cr, cg, cb));
        // reflet d'usure en haut à gauche, ombre en bas à droite
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.beginPath();
        g.roundRect(x + gap / 2 + w * 0.12, y + gap / 2 + hh * 0.12, w * 0.6, hh * 0.45, rad);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.lineWidth = Math.max(1, s / 420);
        g.beginPath();
        g.roundRect(x + gap / 2 + 0.5, y + gap / 2 + 0.5, w - 1, hh - 1, rad);
        g.stroke();
      });
      p.wrap(h, () => draw(h, gray(190 + rnd() * 60)));
    }
  }
}

/** Dalles rectangulaires en appareil décalé. */
function paintSlabs(
  p: LayerPainter, rnd: () => number, rows: number, cols: number, base: readonly [number, number, number], spread: number, joint: string,
  jointWidth: number,
): void {
  const s = p.size;
  p.clear(joint, 40);
  const rh = s / rows, cw = s / cols;
  const g = p.g, h = p.h;
  const gap = Math.max(1, (s / 512) * jointWidth);
  for (let j = 0; j < rows; j++) {
    const shift = (j % 2) * 0.5;
    for (let i = 0; i < cols; i++) {
      const x = (i + shift) * cw, y = j * rh;
      const d = (rnd() - 0.5) * spread;
      const warm = (rnd() - 0.5) * spread * 0.4;
      p.wrap(g, () => {
        g.fillStyle = rgb(base[0] + d + warm, base[1] + d, base[2] + d - warm);
        g.fillRect(x + gap / 2, y + gap / 2, cw - gap, rh - gap);
      });
      p.wrap(h, () => {
        h.fillStyle = gray(215);
        h.fillRect(x + gap / 2, y + gap / 2, cw - gap, rh - gap);
      });
    }
  }
}

/** Mouchetures du granit. */
function speckle(p: LayerPainter, rnd: () => number, density: number, dark: number, light: number): void {
  const s = p.size, g = p.g;
  const n = Math.round(s * s * density);
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v < 0.55 ? gray(dark + rnd() * 30, 0.5) : gray(light + rnd() * 30, 0.45);
    const r = 0.6 + rnd() * (s / 400);
    g.fillRect(rnd() * s, rnd() * s, r, r);
  }
}

/** Stabilisé : sable beige, gravillons. */
function paintStabilise(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(196,178,142)', 128);
  const n = Math.round(s * s * 0.02);
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v < 0.4 ? rgb(150, 132, 100, 0.5) : v < 0.8 ? rgb(226, 212, 180, 0.5) : rgb(120, 112, 100, 0.55);
    const r = 0.6 + rnd() * rnd() * (s / 200);
    g.fillRect(rnd() * s, rnd() * s, r, r);
  }
}

/** Pelouse : brins courts de verts différents. */
function paintGrass(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(78,108,56)', 128);
  const n = Math.round(s * s * 0.03);
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s;
    const len = (1.5 + rnd() * 3.5) * (s / 512), a = rnd() * Math.PI * 2;
    const v = rnd();
    g.strokeStyle = v < 0.3 ? rgb(52, 84, 40, 0.6) : v < 0.75 ? rgb(98, 132, 62, 0.6) : rgb(132, 150, 76, 0.5);
    g.lineWidth = Math.max(1, s / 512);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
}

/** Feuillage ras (massifs, haies) : petites feuilles serrées, trous sombres. */
function paintFoliage(p: LayerPainter, rnd: () => number, base: readonly [number, number, number]): void {
  const s = p.size, g = p.g, h = p.h;
  p.clear(rgb(base[0] * 0.45, base[1] * 0.5, base[2] * 0.45), 30);
  const n = Math.round((s * s) / 46);
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s;
    const r = (1.6 + rnd() * 2.6) * (s / 512), a = rnd() * Math.PI;
    const d = (rnd() - 0.35) * 46;
    const fill = rgb(base[0] + d * 0.7, base[1] + d, base[2] + d * 0.5);
    p.wrap(g, () => {
      g.fillStyle = fill;
      g.beginPath();
      g.ellipse(x, y, r * 1.5, r * 0.8, a, 0, Math.PI * 2);
      g.fill();
    });
    p.wrap(h, () => {
      h.fillStyle = gray(120 + rnd() * 130);
      h.beginPath();
      h.ellipse(x, y, r * 1.5, r * 0.8, a, 0, Math.PI * 2);
      h.fill();
    });
  }
}

/** Pierre de taille : assises de 40 cm, blocs décalés, coulures. */
function paintAshlar(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g, h = p.h;
  p.clear('rgb(120,110,92)', 40);
  const courses = 8;
  const ch = s / courses;
  const gap = Math.max(1.2, s / 340);
  for (let j = 0; j < courses; j++) {
    let x = rnd() * s * 0.3;
    const end = x + s;
    while (x < end - 1) {
      const w = Math.min(end - x, s * (0.22 + rnd() * 0.16));
      const d = (rnd() - 0.5) * 22, warm = (rnd() - 0.5) * 8;
      const x0 = x;
      p.wrap(g, () => {
        g.fillStyle = rgb(190 + d + warm, 178 + d, 154 + d - warm);
        g.fillRect(x0 + gap / 2, j * ch + gap / 2, w - gap, ch - gap);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(x0 + gap / 2, j * ch + gap / 2, w - gap, ch * 0.16);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x0 + gap / 2, (j + 1) * ch - gap / 2 - ch * 0.12, w - gap, ch * 0.12);
      });
      p.wrap(h, () => {
        h.fillStyle = gray(210);
        h.fillRect(x0 + gap / 2, j * ch + gap / 2, w - gap, ch - gap);
      });
      x += w;
    }
  }
  // coulures sombres (la texture se lit avec v vers le haut : les coulures descendent)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * s, w = (2 + rnd() * 10) * (s / 512), len = s * (0.15 + rnd() * 0.5), y = rnd() * s;
    p.wrap(g, () => {
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, 'rgba(40,36,28,0.16)');
      grad.addColorStop(1, 'rgba(40,36,28,0)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, len);
    });
  }
}

/** Béton : dalles coulées, fissures fines. */
function paintConcrete(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g, h = p.h;
  p.clear('rgb(140,138,133)', 150);
  const w = Math.max(1, s / 380);
  for (let k = 1; k <= 2; k++) {
    for (const ctx of [g, h]) {
      ctx.fillStyle = ctx === g ? 'rgba(60,58,54,0.55)' : gray(40);
      ctx.fillRect(0, (k * s) / 2 - w / 2, s, w);
      ctx.fillRect((k * s) / 2 - w / 2, 0, w, s);
    }
  }
  g.strokeStyle = 'rgba(50,48,44,0.4)';
  g.lineWidth = Math.max(0.8, s / 600);
  for (let i = 0; i < 7; i++) {
    let x = rnd() * s, y = rnd() * s;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * s * 0.07;
      y += (rnd() - 0.2) * s * 0.05;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/** Enduit : beige taché, légères coulures. */
function paintPlaster(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(198,186,162)', 128);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * s, w = (4 + rnd() * 26) * (s / 512), len = s * (0.2 + rnd() * 0.6), y = rnd() * s;
    p.wrap(g, () => {
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, 'rgba(70,62,48,0.13)');
      grad.addColorStop(1, 'rgba(70,62,48,0)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, len);
    });
  }
}

/** Cour d'îlot : enrobé clair usé, rapiécé de béton. */
function paintCourt(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(126,122,114)', 128);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * s, y = rnd() * s, w = s * (0.1 + rnd() * 0.25), hgt = s * (0.08 + rnd() * 0.2);
    const d = (rnd() - 0.5) * 26;
    p.wrap(g, () => {
      g.fillStyle = rgb(128 + d, 124 + d, 116 + d, 0.55);
      g.fillRect(x, y, w, hgt);
    });
  }
  speckle(p, rnd, 0.008, 60, 150);
}

/** Terre battue et ballast. */
function paintEarth(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(124,110,92)', 128);
  const n = Math.round(s * s * 0.02);
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? rgb(92, 80, 66, 0.55) : v < 0.85 ? rgb(152, 140, 122, 0.5) : rgb(70, 66, 62, 0.6);
    const r = 0.8 + rnd() * rnd() * (s / 130);
    g.fillRect(rnd() * s, rnd() * s, r, r);
  }
}

/** Peinture routière : blanc cassé ; le relief sert de masque d'usure. */
function paintRoadPaint(p: LayerPainter): void {
  p.clear('rgb(226,226,220)', 128);
}

/**
 * Grande échelle de la chaussée (26 m) : rapiéçages, tranchées rebouchées, joints de bitume,
 * taches. Gris neutre 128 = sans effet ; plus clair ou plus sombre = module l'enrobé.
 */
function paintRoadMacro(p: LayerPainter, rnd: () => number): void {
  const s = p.size, g = p.g;
  p.clear('rgb(128,128,128)', 128);
  // rapiéçages rectangulaires
  for (let i = 0; i < 9; i++) {
    const x = rnd() * s, y = rnd() * s, w = s * (0.04 + rnd() * 0.12), hgt = s * (0.03 + rnd() * 0.1), a = (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? 0 : Math.PI / 2);
    const v = 128 + (rnd() < 0.6 ? -1 : 1) * (10 + rnd() * 22);
    p.wrap(g, () => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = gray(v, 0.85);
      g.fillRect(-w / 2, -hgt / 2, w, hgt);
      g.strokeStyle = 'rgba(40,40,40,0.5)';
      g.lineWidth = Math.max(1, s / 400);
      g.strokeRect(-w / 2, -hgt / 2, w, hgt);
      g.restore();
    });
  }
  // tranchées : longues bandes étroites
  for (let i = 0; i < 5; i++) {
    const x = rnd() * s, y = rnd() * s, len = s * (0.3 + rnd() * 0.5), w = s * (0.012 + rnd() * 0.02), a = rnd() * Math.PI;
    const v = 128 - 14 - rnd() * 18;
    p.wrap(g, () => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = gray(v, 0.8);
      g.fillRect(-len / 2, -w / 2, len, w);
      g.restore();
    });
  }
  // fissures scellées au bitume
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    let x = rnd() * s, y = rnd() * s;
    const a0 = rnd() * Math.PI * 2;
    const pts: number[] = [x, y];
    for (let k = 0; k < 9; k++) {
      const a = a0 + (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * s * 0.03;
      y += Math.sin(a) * s * 0.03;
      pts.push(x, y);
    }
    p.wrap(g, () => {
      g.strokeStyle = 'rgba(52,52,52,0.75)';
      g.lineWidth = Math.max(1, s / 300);
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
      g.stroke();
    });
  }
  // taches d'huile et zones lustrées
  for (let i = 0; i < 16; i++) {
    const x = rnd() * s, y = rnd() * s, r = s * (0.008 + rnd() * 0.03);
    p.wrap(g, () => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(70,70,70,0.55)');
      grad.addColorStop(1, 'rgba(70,70,70,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
}

/**
 * Peint toutes les couches de l'atlas du sol. Retourne les pixels RVBA, couche après couche.
 * `onLayer` (banc d'essai) reçoit le canvas de couleur de chaque couche.
 */
export function paintGroundAtlas(size: number, onLayer?: (layer: number, color: HTMLCanvasElement) => void): Uint8Array {
  const data = new Uint8Array(size * size * 4 * CLASS_LAYERS);
  const noise = makePaintNoise(size);
  const p = new LayerPainter(size);
  const stride = size * size * 4;
  const done = (layer: number, fine: number, grain: number, blotch: number, cloud: number, hGrain: number): void => {
    p.read(data, layer * stride, noise, fine, grain, blotch, cloud, hGrain);
    if (onLayer) onLayer(layer, p.color);
  };
  paintAsphalt(p, seeded(101));
  done(CL_ASPHALT, 26, 18, 10, 8, 0.9);
  paintSett(p, seeded(102));
  done(CL_SETT, 14, 12, 14, 8, 0.15);
  paintSlabs(p, seeded(103), 6, 4, [150, 148, 144], 14, 'rgb(86,84,80)', 1.6);
  speckle(p, seeded(1031), 0.02, 70, 180);
  done(CL_SIDEWALK, 16, 10, 8, 6, 0.12);
  p.clear('rgb(168,166,161)', 170);
  speckle(p, seeded(104), 0.03, 80, 200);
  done(CL_CURB, 18, 12, 8, 4, 0.2);
  paintSlabs(p, seeded(105), 4, 4, [178, 170, 154], 16, 'rgb(104,98,86)', 1.8);
  done(CL_PLAZA, 10, 8, 12, 8, 0.1);
  paintStabilise(p, seeded(106));
  done(CL_STABILISE, 18, 14, 14, 10, 0.7);
  paintGrass(p, seeded(107));
  done(CL_GRASS, 14, 12, 22, 16, 0.8);
  paintFoliage(p, seeded(108), [66, 96, 50]);
  done(CL_SOIL, 8, 8, 14, 10, 0.2);
  paintAshlar(p, seeded(109));
  done(CL_STONE, 10, 8, 12, 8, 0.1);
  paintConcrete(p, seeded(110));
  done(CL_CONCRETE, 12, 10, 16, 10, 0.3);
  paintCourt(p, seeded(111));
  done(CL_COURT, 16, 12, 16, 10, 0.6);
  paintRoadPaint(p);
  done(CL_PAINT, 8, 6, 6, 4, 1.6);
  paintEarth(p, seeded(112));
  done(CL_EARTH, 18, 16, 20, 14, 0.8);
  paintFoliage(p, seeded(113), [52, 84, 44]);
  done(CL_HEDGE, 8, 8, 12, 8, 0.2);
  paintPlaster(p, seeded(114));
  done(CL_PLASTER, 8, 8, 14, 10, 0.3);
  paintRoadMacro(p, seeded(115));
  done(CL_ROADMACRO, 0, 0, 10, 14, 0);
  return data;
}

// ─────────────────────────────── textures découpées ───────────────────────────────

/**
 * Texture découpée (alpha) : quatre bandes horizontales. De bas en haut (v croissant) :
 * grille à lances, garde-corps, portail (répétées en u), puis les éléments posés au sol
 * (grille d'arbre, lettres « BUS »). Voir CUTOUT_ROWS (barriers.ts) et CUTOUT_UV (ground.ts).
 */
export function paintCutoutAtlas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, size, size);
  const band = size / 4;
  // v = 0 est en bas de l'image : la bande k (v de k/4 à (k+1)/4) occupe les lignes y de size − (k+1)·band à size − k·band.
  const top = (k: number): number => size - (k + 1) * band;
  const pad = Math.max(2, size / 256);
  const iron = 'rgb(28,34,30)';

  // ── bande 0 : grille de jardin à barreaux et lances (1,6 m de large) ──
  {
    const y0 = top(0) + pad, y1 = top(0) + band - pad, hgt = y1 - y0;
    const bars = 12, step = size / bars, bw = Math.max(2, size / 110);
    g.fillStyle = iron;
    for (let i = 0; i < bars; i++) {
      const x = (i + 0.5) * step;
      g.fillRect(x - bw / 2, y0 + hgt * 0.1, bw, hgt * 0.9);
      // fer de lance
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + bw * 1.6, y0 + hgt * 0.1);
      g.lineTo(x, y0 + hgt * 0.14);
      g.lineTo(x - bw * 1.6, y0 + hgt * 0.1);
      g.closePath();
      g.fill();
    }
    g.fillRect(0, y0 + hgt * 0.17, size, hgt * 0.035);
    g.fillRect(0, y0 + hgt * 0.86, size, hgt * 0.04);
    // dorure discrète des pointes
    g.fillStyle = 'rgb(150,128,62)';
    for (let i = 0; i < bars; i++) g.fillRect((i + 0.5) * step - bw * 0.5, y0 + hgt * 0.02, bw, hgt * 0.05);
  }
  // ── bande 1 : garde-corps (2 m de large) : lisse haute, lisse basse, barreaudage, poteaux ──
  {
    const y0 = top(1) + pad, y1 = top(1) + band - pad, hgt = y1 - y0;
    const bars = 16, step = size / bars, bw = Math.max(2, size / 170);
    g.fillStyle = 'rgb(34,38,40)';
    g.fillRect(0, y0, size, hgt * 0.07);
    g.fillRect(0, y0 + hgt * 0.84, size, hgt * 0.05);
    for (let i = 0; i < bars; i++) g.fillRect((i + 0.5) * step - bw / 2, y0, bw, hgt * 0.88);
    g.fillRect(0, y0, bw * 3, hgt);
    g.fillRect(size - bw * 3, y0, bw * 3, hgt);
  }
  // ── bande 2 : portail à deux vantaux (3,2 m de large) ──
  {
    const y0 = top(2) + pad, y1 = top(2) + band - pad, hgt = y1 - y0;
    g.fillStyle = iron;
    const frame = Math.max(3, size / 90);
    for (let leaf = 0; leaf < 2; leaf++) {
      const x0 = (leaf * size) / 2, w = size / 2;
      g.fillRect(x0, y0 + hgt * 0.08, frame, hgt * 0.92);
      g.fillRect(x0 + w - frame, y0 + hgt * 0.08, frame, hgt * 0.92);
      g.fillRect(x0, y0 + hgt * 0.08, w, frame * 0.8);
      g.fillRect(x0, y0 + hgt * 0.6, w, frame * 0.7);
      g.fillRect(x0, y1 - frame, w, frame);
      const bars = 9;
      for (let i = 1; i < bars; i++) {
        const x = x0 + (i * w) / bars;
        g.fillRect(x - frame * 0.22, y0 + hgt * 0.02, frame * 0.44, hgt * 0.98);
      }
      // croisillons du soubassement
      g.lineWidth = frame * 0.4;
      g.strokeStyle = iron;
      g.beginPath();
      g.moveTo(x0, y0 + hgt * 0.6);
      g.lineTo(x0 + w, y1);
      g.moveTo(x0 + w, y0 + hgt * 0.6);
      g.lineTo(x0, y1);
      g.stroke();
    }
  }
  // ── bande 3 : éléments posés au sol ──
  {
    const y0 = top(3), cell = band;
    // grille d'arbre (u de 0 à 0,25) : fonte ajourée en rayons, trou central pour le tronc
    const cx = cell / 2, cy = y0 + cell / 2, r = cell / 2 - pad;
    g.save();
    g.beginPath();
    g.rect(pad, y0 + pad, cell - 2 * pad, cell - 2 * pad);
    g.clip();
    g.fillStyle = 'rgb(86,82,76)';
    g.fillRect(0, y0, cell, cell);
    g.strokeStyle = 'rgb(30,27,24)';
    g.lineWidth = Math.max(1.5, cell / 60);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36);
      g.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
      g.stroke();
    }
    g.strokeStyle = 'rgb(112,106,98)';
    g.lineWidth = Math.max(2, cell / 40);
    for (const k of [0.36, 0.62, 0.9]) {
      g.beginPath();
      g.arc(cx, cy, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeRect(pad * 1.5, y0 + pad * 1.5, cell - 3 * pad, cell - 3 * pad);
    g.restore();
    // trou du tronc : transparent
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // lettres « BUS » (u de 0,25 à 0,625), étirées par le quadrilatère qui les porte
    g.fillStyle = 'rgb(232,232,226)';
    g.font = `bold ${Math.round(band * 0.86)}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tx = size * 0.4375;
    g.save();
    g.beginPath();
    g.rect(size * 0.25 + pad, y0 + pad, size * 0.375 - 2 * pad, band - 2 * pad);
    g.clip();
    g.fillText('BUS', tx, y0 + band * 0.54, size * 0.36);
    g.restore();
  }
  return c;
}

/** Feuillage des houppiers : feuilles claires sur fond sombre ; alpha = densité (découpe de la silhouette). */
export function paintLeafTexture(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(77);
  g.clearRect(0, 0, size, size);
  // fond : ombre intérieure du houppier, à demi opaque
  g.fillStyle = 'rgba(26,40,20,0.35)';
  g.fillRect(0, 0, size, size);
  const n = Math.round((size * size) / 30);
  for (let i = 0; i < n; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = (2.2 + rnd() * 3.4) * (size / 256), a = rnd() * Math.PI;
    const d = (rnd() - 0.4) * 60;
    const fill = `rgb(${Math.round(72 + d * 0.8)},${Math.round(98 + d)},${Math.round(44 + d * 0.5)})`;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        g.fillStyle = fill;
        g.beginPath();
        g.ellipse(x + dx * size, y + dy * size, r * 1.5, r * 0.85, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

/** Écorce de platane : plaques claires et sombres. */
export function paintBarkTexture(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(88);
  g.fillStyle = 'rgb(132,122,100)';
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * width, y = rnd() * height, w = (4 + rnd() * 12) * (width / 64), h = (8 + rnd() * 26) * (height / 128);
    const v = rnd();
    g.fillStyle = v < 0.4 ? 'rgba(92,84,68,0.7)' : v < 0.75 ? 'rgba(170,164,138,0.7)' : 'rgba(112,118,92,0.6)';
    for (let dx = -1; dx <= 1; dx++) {
      g.beginPath();
      g.ellipse(x + dx * width, y, w / 2, h / 2, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Halo au sol d'un candélabre : tache douce, plus dense au centre. */
export function paintHaloTexture(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.07)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Silhouette de toits parisiens (alpha) : immeubles de hauteurs variées, cheminées, quelques dômes et clochers. */
export function paintSkyline(width: number, height: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(seed);
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#fff';
  let x = 0;
  while (x < width) {
    const w = width * (0.006 + rnd() * 0.014);
    const hgt = height * (0.42 + rnd() * 0.24);
    g.fillRect(x, height - hgt, w + 1, hgt);
    // comble en retrait
    g.fillRect(x + w * 0.08, height - hgt - height * 0.05, w * 0.84, height * 0.06);
    // cheminées
    const chimneys = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < chimneys; k++) g.fillRect(x + w * (0.15 + rnd() * 0.7), height - hgt - height * (0.08 + rnd() * 0.05), Math.max(1, w * 0.07), height * 0.1);
    const r = rnd();
    if (r < 0.035) {
      // dôme
      g.beginPath();
      g.ellipse(x + w / 2, height - hgt, w * 0.42, height * 0.2, 0, Math.PI, 0);
      g.fill();
      g.fillRect(x + w / 2 - 1, height - hgt - height * 0.27, 2, height * 0.08);
    } else if (r < 0.06) {
      // clocher
      g.beginPath();
      g.moveTo(x + w * 0.35, height - hgt);
      g.lineTo(x + w * 0.5, height - hgt - height * 0.34);
      g.lineTo(x + w * 0.65, height - hgt);
      g.fill();
    }
    x += w;
  }
  return c;
}
