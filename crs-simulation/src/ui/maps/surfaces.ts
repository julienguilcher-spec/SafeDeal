/* =====================================================================================
 * Occupation du sol pour le fond de plan de repli : une petite image par tuile du monde, obtenue
 * en échantillonnant ctx.world.surfaceAt (bâti, eau, parcs, places). Construite à la demande, une
 * tuile à la fois, et seulement là où le monde est chargé ; conservée ensuite (les quartiers déjà
 * parcourus restent détaillés sur le plan).
 * ===================================================================================== */

import type { GameContext, SurfaceKind } from '@/core/contracts';

/** Pas d'échantillonnage (m). */
const STEP = 2;
/** Nombre maximal d'images conservées. */
const MAX_TILES = 64;

/** Couleurs RGBA par nature de sol (alpha 0 : on laisse voir le fond). */
const COLORS: Readonly<Record<SurfaceKind, readonly [number, number, number, number]>> = {
  building: [27, 39, 64, 255],
  interior: [27, 39, 64, 255],
  water: [14, 48, 88, 255],
  park: [19, 50, 34, 255],
  gravel: [30, 41, 46, 255],
  plaza: [20, 30, 50, 255],
  sett: [20, 30, 50, 255],
  quay: [18, 27, 45, 255],
  road: [0, 0, 0, 0],
  sidewalk: [0, 0, 0, 0],
  bridge: [0, 0, 0, 0],
  void: [0, 0, 0, 0],
};

interface TileImage {
  canvas: HTMLCanvasElement;
  used: number;
}

export class SurfaceTiles {
  /** Incrémenté à chaque image construite. */
  revision = 0;
  private readonly tiles = new Map<string, TileImage>();
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private clock = 0;

  constructor(private readonly ctx: GameContext) {}

  /** Image de la tuile, ou null si elle n'est pas (encore) disponible : elle est alors mise en file. */
  get(tx: number, tz: number): HTMLCanvasElement | null {
    const key = tx + '_' + tz;
    const t = this.tiles.get(key);
    if (t) {
      t.used = ++this.clock;
      return t.canvas;
    }
    if (!this.queued.has(key)) {
      this.queued.add(key);
      this.queue.push(key);
    }
    return null;
  }

  /** Oublie tout (changement de jeu de données). */
  clear(): void {
    this.tiles.clear();
    this.queue.length = 0;
    this.queued.clear();
    this.revision++;
  }

  /** Des tuiles attendent-elles d'être construites ? */
  get pending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Construit au plus une image en attente. Retourne true si une image a été ajoutée.
   * Les tuiles demandées mais non chargées par le monde sortent de la file (elles seront
   * redemandées au prochain dessin).
   */
  pump(): boolean {
    const world = this.ctx.world;
    const size = world.tileSize > 0 ? world.tileSize : 512;
    while (this.queue.length > 0) {
      const key = this.queue.shift()!;
      this.queued.delete(key);
      const sep = key.indexOf('_');
      const tx = Number(key.slice(0, sep));
      const tz = Number(key.slice(sep + 1));
      if (!world.isLoaded((tx + 0.5) * size, (tz + 0.5) * size)) continue;
      const canvas = this.build(tx, tz, size);
      if (!canvas) return false;
      this.tiles.set(key, { canvas, used: ++this.clock });
      this.evict();
      this.revision++;
      return true;
    }
    return false;
  }

  private build(tx: number, tz: number, size: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const n = Math.max(1, Math.round(size / STEP));
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const image = g.createImageData(n, n);
    const data = image.data;
    const world = this.ctx.world;
    const ox = tx * size + STEP * 0.5;
    const oz = tz * size + STEP * 0.5;
    let o = 0;
    for (let j = 0; j < n; j++) {
      const z = oz + j * STEP;
      for (let i = 0; i < n; i++) {
        const c = COLORS[world.surfaceAt(ox + i * STEP, z)] ?? COLORS.void;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = c[3];
        o += 4;
      }
    }
    g.putImageData(image, 0, 0);
    return canvas;
  }

  private evict(): void {
    if (this.tiles.size <= MAX_TILES) return;
    let oldestKey = '';
    let oldest = Infinity;
    this.tiles.forEach((t, k) => {
      if (t.used < oldest) {
        oldest = t.used;
        oldestKey = k;
      }
    });
    if (oldestKey) this.tiles.delete(oldestKey);
  }
}
