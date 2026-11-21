/* =====================================================================================
 * CARTE DE PARIS — construction du RELIEF
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/terrain.json (RGE ALTI, pas de 25 m, altitudes NGF, terrain nu).
 * Sortie : un relief LISSÉ, relatif au sol de la Concorde (y = 0 à l'origine du monde).
 *
 * Convention du format (docs/map-format.md, § 7) : sous l'eau, l'altitude du relief n'est pas
 * contractuelle ; le plan d'eau est affiché au niveau porté par la surface « water », et les
 * murs de quai portent la dénivelée. On RETIRE donc le lit du fleuve et des canaux du relief :
 * leurs nœuds sont remplacés par une interpolation des berges, puis l'ensemble est lissé. Le
 * sol reste ainsi continu d'une rive à l'autre, à la hauteur des quais.
 * ===================================================================================== */
import path from 'node:path';
import { M, NORM, BOUNDS, SOURCE_MARGIN, readJson, pointInPoly, bboxOf, median, round2 } from './build-lib.mjs';

/** Écart (m) au-dessus du niveau du fleuve en dessous duquel un nœud qui touche le fleuve est traité comme de l'eau. */
const WATER_SLACK = 0.8;
/** Passes du filtre binomial 3 × 3 (σ ≈ 0,7 pas chacune). */
const SMOOTH_PASSES = 2;

/** Échantillonnage bilinéaire d'une grille brute (hors grille : ramené au bord). */
function sampleGrid(g, heights, x, z) {
  const mx = g.nx - 1, mz = g.nz - 1;
  let fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
  fx = fx < 0 ? 0 : fx > mx ? mx : fx;
  fz = fz < 0 ? 0 : fz > mz ? mz : fz;
  let ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix >= mx) ix = mx - 1;
  if (iz >= mz) iz = mz - 1;
  const ax = fx - ix, az = fz - iz;
  const i = iz * g.nx + ix;
  const top = heights[i] + (heights[i + 1] - heights[i]) * ax;
  const bottom = heights[i + g.nx] + (heights[i + g.nx + 1] - heights[i + g.nx]) * ax;
  return top + (bottom - top) * az;
}

/**
 * @param waterPolys  polygones d'eau « fleuve » et « canal » en mètres : [{ poly, river }]
 * @returns { terrain, decoded, raw, offset, waterLevel, heightAt, rawNgfAt, report }
 */
export function buildTerrain(waterPolys) {
  const src = readJson(path.join(NORM, 'terrain.json'));
  if (src.flat === true) throw new Error('terrain.json est un relief plat de repli (IGN injoignable au téléchargement) : relancer fetch-b-7-terrain.mjs');
  const step = src.cellM, nx = src.nx, nz = src.nz, x0 = src.x0, z0 = src.z0;
  if (!(step > 0) || !Number.isInteger(nx) || !Number.isInteger(nz) || src.heights.length !== nx * nz) throw new Error('terrain.json : grille incohérente');
  const g = { x0, z0, step, nx, nz };
  const raw = Float64Array.from(src.heights);
  const n = nx * nz;

  // 1. Nœuds dans l'eau (fleuve, canaux).
  const water = new Uint8Array(n);       // 1 = fleuve, 2 = canal
  for (const w of waterPolys) {
    const b = bboxOf(w.poly.outer);
    const ix0 = Math.max(0, Math.ceil((b.minX - x0) / step)), ix1 = Math.min(nx - 1, Math.floor((b.maxX - x0) / step));
    const iz0 = Math.max(0, Math.ceil((b.minZ - z0) / step)), iz1 = Math.min(nz - 1, Math.floor((b.maxZ - z0) / step));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        if (water[iz * nx + ix] === 0 && pointInPoly(w.poly, x0 + ix * step, z0 + iz * step)) water[iz * nx + ix] = w.river ? 1 : 2;
      }
    }
  }
  const riverValues = [];
  for (let i = 0; i < n; i++) if (water[i] === 1) riverValues.push(raw[i]);
  if (riverValues.length < 50) throw new Error(`relief : ${riverValues.length} nœuds seulement dans le fleuve — polygone de la Seine absent ?`);
  const riverNgf = median(riverValues);

  // 2. Nœuds au niveau de l'eau qui touchent le fleuve : le contour OSM et le modèle IGN ne sont pas
  //    recalés, et le fleuve se prolonge au-delà de son polygone dans la marge du relief.
  let extra = 0;
  const queue = [];
  for (let i = 0; i < n; i++) if (water[i] === 1) queue.push(i);
  while (queue.length > 0) {
    const i = queue.pop();
    const ix = i % nx, iz = (i - ix) / nx;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
        const j = jz * nx + jx;
        if (water[j] !== 0 || raw[j] >= riverNgf + WATER_SLACK) continue;
        water[j] = 3;
        extra++;
        queue.push(j);
      }
    }
  }

  // 3. Comblement du lit : diffusion depuis les berges (relaxation de Laplace sur les nœuds d'eau).
  const filled = Float64Array.from(raw);
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = water[i] === 0 ? 1 : 0;
  // 3a. Amorce : propagation de proche en proche de la moyenne des voisins connus.
  let pending = n - known.reduce((s, v) => s + v, 0);
  const waterCount = pending;
  while (pending > 0) {
    const add = [];
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (known[i]) continue;
        let s = 0, c = 0;
        if (ix > 0 && known[i - 1]) { s += filled[i - 1]; c++; }
        if (ix < nx - 1 && known[i + 1]) { s += filled[i + 1]; c++; }
        if (iz > 0 && known[i - nx]) { s += filled[i - nx]; c++; }
        if (iz < nz - 1 && known[i + nx]) { s += filled[i + nx]; c++; }
        if (c > 0) add.push(i, s / c);
      }
    }
    if (add.length === 0) throw new Error('relief : comblement du lit impossible (aucun nœud de berge)');
    for (let k = 0; k < add.length; k += 2) { filled[add[k]] = add[k + 1]; known[add[k]] = 1; }
    pending -= add.length / 2;
  }
  // 3b. Relaxation.
  for (let pass = 0; pass < 200; pass++) {
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (water[i] === 0) continue;
        let s = 0, c = 0;
        if (ix > 0) { s += filled[i - 1]; c++; }
        if (ix < nx - 1) { s += filled[i + 1]; c++; }
        if (iz > 0) { s += filled[i - nx]; c++; }
        if (iz < nz - 1) { s += filled[i + nx]; c++; }
        filled[i] = s / c;
      }
    }
  }

  // 4. Lissage : filtre binomial 3 × 3 séparable, bords répliqués.
  let cur = filled;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const tmp = new Float64Array(n), next = new Float64Array(n);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const l = cur[ix > 0 ? i - 1 : i], r = cur[ix < nx - 1 ? i + 1 : i];
        tmp[i] = (l + 2 * cur[i] + r) / 4;
      }
    }
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const u = tmp[iz > 0 ? i - nx : i], d = tmp[iz < nz - 1 ? i + nx : i];
        next[i] = (u + 2 * tmp[i] + d) / 4;
      }
    }
    cur = next;
  }

  // 5. Origine : y = 0 au sol de la Concorde.
  const offset = sampleGrid(g, cur, 0, 0);
  const heights = new Float32Array(n);
  for (let i = 0; i < n; i++) heights[i] = cur[i] - offset;
  const terrain = { x0, z0, step, nx, nz, heights };
  // Le moteur lira les altitudes quantifiées : on échantillonne les mêmes.
  const rawTerrain = M.encodeTerrain(terrain, 0.05);
  const decoded = M.decodeTerrain(rawTerrain);
  const heightAt = (x, z) => M.sampleTerrain(decoded, x, z);
  const rawNgfAt = (x, z) => sampleGrid(g, raw, x, z);
  const waterLevel = Math.round((riverNgf - offset) * 10) / 10;

  // Rapport : pentes et écart au modèle brut, dans l'emprise du jeu élargie de la marge des sources.
  const b = BOUNDS;
  const inMap = (ix, iz) => {
    const x = x0 + ix * step, z = z0 + iz * step;
    return x >= b.minX - SOURCE_MARGIN && x <= b.maxX + SOURCE_MARGIN && z >= b.minZ - SOURCE_MARGIN && z <= b.maxZ + SOURCE_MARGIN;
  };
  let maxSlope = 0, steep = 0, sumAbs = 0, maxAbs = 0, land = 0, minIn = Infinity, maxIn = -Infinity, pairs = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (!inMap(ix, iz)) continue;
      const i = iz * nx + ix;
      const y = decoded.heights[i];
      if (y < minIn) minIn = y;
      if (y > maxIn) maxIn = y;
      if (ix < nx - 1 && inMap(ix + 1, iz)) { const s = Math.abs(decoded.heights[i + 1] - y) / step; pairs++; if (s > maxSlope) maxSlope = s; if (s > 0.08) steep++; }
      if (iz < nz - 1 && inMap(ix, iz + 1)) { const s = Math.abs(decoded.heights[i + nx] - y) / step; pairs++; if (s > maxSlope) maxSlope = s; if (s > 0.08) steep++; }
      if (water[i] === 0) {
        const d = Math.abs(y + offset - raw[i]);
        sumAbs += d; land++;
        if (d > maxAbs) maxAbs = d;
      }
    }
  }
  const ref = (name, lon, lat) => {
    const x = (lon - M.ORIGIN_LON) * M.M_PER_DEG_LON, z = -(lat - M.ORIGIN_LAT) * M.M_PER_DEG_LAT;
    return { name, y: round2(heightAt(x, z)), ngfBrut: round2(rawNgfAt(x, z)) };
  };
  const report = {
    source: src.source,
    grid: `${nx} × ${nz} nœuds au pas de ${step} m`,
    x0, z0,
    offsetNgf: round2(offset),
    riverNgf: round2(riverNgf),
    waterLevel,
    waterNodes: waterCount,
    bankNodesAtWaterLevel: extra,
    smoothPasses: SMOOTH_PASSES,
    minY: round2(decoded.minY),
    maxY: round2(decoded.maxY),
    inMap: {
      minY: round2(minIn),
      maxY: round2(maxIn),
      maxSlopePercent: round2(maxSlope * 100),
      nodePairs: pairs,
      pairsOver8Percent: steep,
    },
    meanAbsDiffToRawOnLand: round2(sumAbs / Math.max(1, land)),
    maxAbsDiffToRawOnLand: round2(maxAbs),
    references: [
      ref('Concorde (obélisque)', 2.321236, 48.865633),
      ref('Étoile (Arc de Triomphe)', 2.29504, 48.873779),
      ref('Trocadéro (parvis)', 2.28835, 48.86215),
      ref('République', 2.36384, 48.8675),
      ref('Bastille', 2.36956, 48.85309),
      ref('Opéra', 2.3323, 48.8707),
      ref('Champ-de-Mars', 2.29823, 48.85584),
      ref('Hôtel de Ville (parvis)', 2.3514, 48.8567),
    ],
  };
  return { terrain, rawTerrain, decoded, offset, waterLevel, riverNgf, heightAt, rawNgfAt, report };
}
