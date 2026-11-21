/* =====================================================================================
 * Carte de densité de la foule : agrégation des positions par cellules (logique pure).
 *
 * La grille s'ajuste à l'emprise des personnes retenues ; si elle dépasse la taille maximale,
 * la cellule double jusqu'à ce qu'elle tienne. Aucune allocation tant que la capacité suffit.
 * ===================================================================================== */

export interface DensityPoint {
  x: number;
  z: number;
}

export interface DensityGrid {
  /** Côté d'une cellule (m). */
  cell: number;
  /** Coin nord-ouest de la grille (monde). */
  ox: number;
  oz: number;
  cols: number;
  rows: number;
  /** Nombre de personnes par cellule, rangé ligne par ligne (index = row · cols + col). */
  counts: Float32Array;
  /** Plus grand compte d'une cellule. */
  max: number;
  /** Personnes comptées. */
  total: number;
}

export interface DensityOptions {
  /** Côté de cellule souhaité (m). */
  cell: number;
  maxCols: number;
  maxRows: number;
  /** Ne compter que dans un disque (perception d'un civil) : centre et rayon ; rayon ≤ 0 = partout. */
  cx?: number;
  cz?: number;
  radius?: number;
}

export function createDensityGrid(): DensityGrid {
  return { cell: 1, ox: 0, oz: 0, cols: 0, rows: 0, counts: new Float32Array(0), max: 0, total: 0 };
}

/**
 * Agrège `count` points (les `count` premiers de `points`) dans `out`. Les points hors du disque
 * éventuel sont ignorés. Retourne `out`.
 */
export function aggregateDensity(
  points: readonly DensityPoint[], count: number, opts: DensityOptions, out: DensityGrid,
): DensityGrid {
  const useDisc = opts.radius !== undefined && opts.radius > 0;
  const dcx = opts.cx ?? 0;
  const dcz = opts.cz ?? 0;
  const r2 = useDisc ? opts.radius! * opts.radius! : 0;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    if (useDisc) {
      const dx = p.x - dcx, dz = p.z - dcz;
      if (dx * dx + dz * dz > r2) continue;
    }
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    total++;
  }
  out.total = total;
  out.max = 0;
  if (total === 0) {
    out.cols = 0;
    out.rows = 0;
    return out;
  }
  let cell = opts.cell > 0 ? opts.cell : 1;
  // une cellule de marge de chaque côté : le lissage à l'affichage ne coupe pas les bords
  let cols = Math.floor((maxX - minX) / cell) + 3;
  let rows = Math.floor((maxZ - minZ) / cell) + 3;
  while (cols > opts.maxCols || rows > opts.maxRows) {
    cell *= 2;
    cols = Math.floor((maxX - minX) / cell) + 3;
    rows = Math.floor((maxZ - minZ) / cell) + 3;
  }
  // origine calée sur la grille du monde : les cellules ne « glissent » pas quand la foule avance
  const ox = (Math.floor(minX / cell) - 1) * cell;
  const oz = (Math.floor(minZ / cell) - 1) * cell;
  cols = Math.floor((maxX - ox) / cell) + 2;
  rows = Math.floor((maxZ - oz) / cell) + 2;
  const n = cols * rows;
  if (out.counts.length < n) out.counts = new Float32Array(Math.max(n, out.counts.length * 2));
  else out.counts.fill(0, 0, n);
  const counts = out.counts;
  let max = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    if (useDisc) {
      const dx = p.x - dcx, dz = p.z - dcz;
      if (dx * dx + dz * dz > r2) continue;
    }
    const c = Math.floor((p.x - ox) / cell);
    const r = Math.floor((p.z - oz) / cell);
    const v = ++counts[r * cols + c]!;
    if (v > max) max = v;
  }
  out.cell = cell;
  out.ox = ox;
  out.oz = oz;
  out.cols = cols;
  out.rows = rows;
  out.max = max;
  return out;
}

/** Densité (personnes par m²) d'une cellule. */
export function densityOf(grid: DensityGrid, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
  return grid.counts[row * grid.cols + col]! / (grid.cell * grid.cell);
}

/** Densité au point du monde (0 hors grille). */
export function densityAt(grid: DensityGrid, x: number, z: number): number {
  if (grid.cols === 0) return 0;
  return densityOf(grid, Math.floor((x - grid.ox) / grid.cell), Math.floor((z - grid.oz) / grid.cell));
}

/**
 * Couleur d'une cellule : la teinte suit la tension locale (jaune pâle = calme, orange, rouge),
 * l'opacité suit la densité. Écrit r, g, b, a (0..255) dans `out` à partir de `offset`.
 */
export function densityColor(density: number, tension: number, out: Uint8ClampedArray, offset: number): void {
  const t = tension < 0 ? 0 : tension > 1 ? 1 : tension;
  // jaune pâle (255,224,138) → orange (255,154,60) → rouge (255,59,48)
  let g: number, b: number;
  if (t < 0.5) {
    const k = t * 2;
    g = 224 + (154 - 224) * k;
    b = 138 + (60 - 138) * k;
  } else {
    const k = (t - 0.5) * 2;
    g = 154 + (59 - 154) * k;
    b = 60 + (48 - 60) * k;
  }
  // foule clairsemée : déjà nettement visible ; 1,2 pers./m² et plus : opacité maximale
  const a = density <= 0 ? 0 : 0.34 + 0.52 * Math.min(1, Math.sqrt(density / 1.2));
  out[offset] = 255;
  out[offset + 1] = g;
  out[offset + 2] = b;
  out[offset + 3] = a * 255;
}
