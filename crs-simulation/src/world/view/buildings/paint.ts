/* =====================================================================================
 * IMMEUBLES — outils de peinture des cellules de texture (canvas 2D)
 * -------------------------------------------------------------------------------------
 * Une cellule est peinte en MÈTRES, origine en bas à gauche, y vers le haut : on dessine
 * une travée de façade comme on la dessinerait sur un plan d'élévation. Deux calques :
 *   - la couleur (albédo, avec ombres peintes : la lumière vient d'en haut à gauche) ;
 *   - le masque des vitrages (blanc = vitre), qui devient le canal alpha de l'atlas et
 *     pilote l'éclairage nocturne des fenêtres et le reflet du ciel.
 * ===================================================================================== */

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' → 'rgba(r,g,b,a)'. */
export function rgba(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/** Mélange de deux couleurs '#rrggbb' (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
  const g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
  const bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur, k dans [-1, 1]. */
export function tone(hex: string, k: number): string {
  return k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#000000', -k);
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Bruit de valeur raccordable (il se répète sans couture) : carré de `size` pixels, niveaux de gris
 * centrés sur 128. `cells` = nombre de mailles de la première octave.
 */
export function makeNoiseCanvas(size: number, cells: number, octaves: number, seed: number, contrast: number): HTMLCanvasElement {
  const rnd = makeRandom(seed);
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0;
  let n = cells;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const step = size / n;
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy) % n, y1 = (y0 + 1) % n;
      let fy = gy - Math.floor(gy);
      fy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx) % n, x1 = (x0 + 1) % n;
        let fx = gx - Math.floor(gx);
        fx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * n + x0] * (1 - fx) + grid[y0 * n + x1] * fx;
        const b = grid[y1 * n + x0] * (1 - fx) + grid[y1 * n + x1] * fx;
        acc[y * size + x] += (a * (1 - fy) + b * fy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    n = Math.min(size, n * 2);
  }
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < acc.length; i++) {
    let v = 128 + (acc[i] / total - 0.5) * 255 * contrast;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    img.data[4 * i] = v; img.data[4 * i + 1] = v; img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Peintre d'une cellule : coordonnées en mètres, y vers le haut. */
export class CellPainter {
  readonly color: HTMLCanvasElement;
  readonly maskCanvas: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
  readonly k: CanvasRenderingContext2D;
  /** Taille en pixels, dimensions représentées en mètres. */
  readonly S: number;
  W = 2.8;
  H = 3.2;

  constructor(size: number) {
    this.S = size;
    this.color = createCanvas(size, size);
    this.maskCanvas = createCanvas(size, size);
    this.c = this.color.getContext('2d', { willReadFrequently: true })!;
    this.k = this.maskCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** Remet la cellule à neuf pour une surface de w × h mètres. */
  begin(w: number, h: number, background: string): void {
    this.W = w;
    this.H = h;
    const { c, k, S } = this;
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = background;
    c.fillRect(0, 0, S, S);
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.fillStyle = '#000000';
    k.fillRect(0, 0, S, S);
  }

  px(x: number): number { return (x / this.W) * this.S; }
  py(y: number): number { return this.S - (y / this.H) * this.S; }
  /** Longueur horizontale / verticale en pixels. */
  sx(w: number): number { return (w / this.W) * this.S; }
  sy(h: number): number { return (h / this.H) * this.S; }

  rect(x: number, y: number, w: number, h: number, fill: string): void {
    this.c.fillStyle = fill;
    this.c.fillRect(this.px(x), this.py(y + h), this.sx(w), this.sy(h));
  }

  /** Dégradé vertical (couleur du bas, couleur du haut). */
  vgrad(x: number, y: number, w: number, h: number, bottom: string, top: string): void {
    const g = this.c.createLinearGradient(0, this.py(y), 0, this.py(y + h));
    g.addColorStop(0, bottom);
    g.addColorStop(1, top);
    this.c.fillStyle = g;
    this.c.fillRect(this.px(x), this.py(y + h), this.sx(w), this.sy(h));
  }

  /** Dégradé horizontal (couleur de gauche, couleur de droite). */
  hgrad(x: number, y: number, w: number, h: number, left: string, right: string): void {
    const g = this.c.createLinearGradient(this.px(x), 0, this.px(x + w), 0);
    g.addColorStop(0, left);
    g.addColorStop(1, right);
    this.c.fillStyle = g;
    this.c.fillRect(this.px(x), this.py(y + h), this.sx(w), this.sy(h));
  }

  /** Voile noir en dégradé vertical : alpha en bas, alpha en haut (ombre portée, salissure). */
  shade(x: number, y: number, w: number, h: number, alphaBottom: number, alphaTop: number): void {
    this.vgrad(x, y, w, h, `rgba(0,0,0,${alphaBottom})`, `rgba(0,0,0,${alphaTop})`);
  }

  /** Voile blanc en dégradé vertical. */
  light(x: number, y: number, w: number, h: number, alphaBottom: number, alphaTop: number): void {
    this.vgrad(x, y, w, h, `rgba(255,255,255,${alphaBottom})`, `rgba(255,255,255,${alphaTop})`);
  }

  /** Trait horizontal (épaisseur en mètres, au moins un pixel). */
  hline(x: number, y: number, w: number, thick: number, fill: string): void {
    const t = Math.max(1, this.sy(thick));
    this.c.fillStyle = fill;
    this.c.fillRect(this.px(x), this.py(y) - t / 2, this.sx(w), t);
  }

  /** Trait vertical (épaisseur en mètres, au moins un pixel). */
  vline(x: number, y: number, h: number, thick: number, fill: string): void {
    const t = Math.max(1, this.sx(thick));
    this.c.fillStyle = fill;
    this.c.fillRect(this.px(x) - t / 2, this.py(y + h), t, this.sy(h));
  }

  /** Vitre : zone du masque (valeur 0..1). */
  mask(x: number, y: number, w: number, h: number, value = 1): void {
    const v = Math.round(value * 255);
    this.k.fillStyle = `rgb(${v},${v},${v})`;
    this.k.fillRect(this.px(x), this.py(y + h), this.sx(w), this.sy(h));
  }

  /** Élément opaque devant une vitre (menuiserie, barreau) : peint la couleur ET efface le masque. */
  bar(x: number, y: number, w: number, h: number, fill: string): void {
    const X = this.px(x), Y = this.py(y + h);
    const pw = Math.max(1, this.sx(w)), ph = Math.max(1, this.sy(h));
    this.c.fillStyle = fill;
    this.c.fillRect(X, Y, pw, ph);
    this.k.fillStyle = '#000000';
    this.k.fillRect(X, Y, pw, ph);
  }

  /** Chemin d'une baie à linteau cintré : rectangle surmonté d'un arc (flèche `rise`). */
  private archPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rise: number): void {
    const x0 = this.px(x), x1 = this.px(x + w), yb = this.py(y), ys = this.py(y + h - rise), yt = this.py(y + h);
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(x0, ys);
    if (rise > 0) {
      // arc en anse : deux quarts d'ellipse
      ctx.ellipse((x0 + x1) / 2, ys, (x1 - x0) / 2, ys - yt, 0, Math.PI, 0, false);
    } else {
      ctx.lineTo(x1, ys);
    }
    ctx.lineTo(x1, yb);
    ctx.closePath();
  }

  /** Remplit une baie cintrée. */
  arch(x: number, y: number, w: number, h: number, rise: number, fill: string | CanvasGradient): void {
    this.archPath(this.c, x, y, w, h, rise);
    this.c.fillStyle = fill;
    this.c.fill();
  }

  /** Masque d'une baie cintrée. */
  archMask(x: number, y: number, w: number, h: number, rise: number, value = 1): void {
    const v = Math.round(value * 255);
    this.archPath(this.k, x, y, w, h, rise);
    this.k.fillStyle = `rgb(${v},${v},${v})`;
    this.k.fill();
  }

  /** Restreint les dessins suivants à une baie cintrée (à refermer par unclip). */
  clipArch(x: number, y: number, w: number, h: number, rise: number): void {
    this.c.save();
    this.archPath(this.c, x, y, w, h, rise);
    this.c.clip();
    this.k.save();
    this.archPath(this.k, x, y, w, h, rise);
    this.k.clip();
  }

  unclip(): void {
    this.c.restore();
    this.k.restore();
  }

  /** Dégradé vertical utilisable comme remplissage (bas → haut). */
  gradient(y: number, h: number, bottom: string, top: string): CanvasGradient {
    const g = this.c.createLinearGradient(0, this.py(y), 0, this.py(y + h));
    g.addColorStop(0, bottom);
    g.addColorStop(1, top);
    return g;
  }

  /** Disque (rayon en mètres, mesuré horizontalement). */
  disc(x: number, y: number, r: number, fill: string): void {
    this.c.fillStyle = fill;
    this.c.beginPath();
    this.c.ellipse(this.px(x), this.py(y), this.sx(r), this.sy(r), 0, 0, Math.PI * 2);
    this.c.fill();
  }

  /** Anneau (cercle au trait), aussi effacé du masque. */
  ring(x: number, y: number, r: number, thick: number, stroke: string): void {
    for (const ctx of [this.c, this.k]) {
      ctx.strokeStyle = ctx === this.c ? stroke : '#000000';
      ctx.lineWidth = Math.max(1, this.sx(thick));
      ctx.beginPath();
      ctx.ellipse(this.px(x), this.py(y), this.sx(r), this.sy(r), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Trait oblique (aussi effacé du masque). */
  stroke(x0: number, y0: number, x1: number, y1: number, thick: number, color: string): void {
    for (const ctx of [this.c, this.k]) {
      ctx.strokeStyle = ctx === this.c ? color : '#000000';
      ctx.lineWidth = Math.max(1, this.sx(thick));
      ctx.beginPath();
      ctx.moveTo(this.px(x0), this.py(y0));
      ctx.lineTo(this.px(x1), this.py(y1));
      ctx.stroke();
    }
  }

  /** Applique un calque de bruit (grain de pierre, patine) sur toute la cellule. */
  grain(noise: HTMLCanvasElement, alpha: number, mode: GlobalCompositeOperation = 'overlay'): void {
    const c = this.c;
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = mode;
    c.drawImage(noise, 0, 0, this.S, this.S);
    c.restore();
  }

  /**
   * Lit la cellule : RVBA, lignes du BAS vers le HAUT (convention des textures de données),
   * alpha = masque des vitrages. Écrit dans `out` à partir de `offset`.
   */
  read(out: Uint8Array, offset: number): void {
    const S = this.S;
    const col = this.c.getImageData(0, 0, S, S).data;
    const msk = this.k.getImageData(0, 0, S, S).data;
    for (let y = 0; y < S; y++) {
      const src = (S - 1 - y) * S * 4;
      const dst = offset + y * S * 4;
      for (let x = 0; x < S; x++) {
        const s = src + x * 4, d = dst + x * 4;
        out[d] = col[s];
        out[d + 1] = col[s + 1];
        out[d + 2] = col[s + 2];
        out[d + 3] = msk[s];
      }
    }
  }
}
