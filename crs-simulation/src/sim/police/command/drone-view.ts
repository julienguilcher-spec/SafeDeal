/* =====================================================================================
 * COMMANDEMENT — drone : où se placer pour que la caméra VOIE le sol (outils sans état, testés en Node).
 *
 *   attroupement   bloc de 3 × 3 cellules de 12 m le plus peuplé autour d'un point de référence (point
 *                  chaud, tête du cortège), les blocs lointains pénalisés (même idée que le point visé du
 *                  retour vidéo, src/ui/drone/logic.ts) ;
 *   axe de rue     le centre retenu est ramené sur l'axe de la rue où se tient l'attroupement (une place :
 *                  le barycentre est gardé) ;
 *   orbite         rayon et hauteur choisis par des lignes de vue 3D (ctx.world.buildingHeightAt) depuis
 *                  plusieurs points du cercle : depuis 60 m, une rue de 15 m entre des immeubles de 23 m ne
 *                  se voit qu'à la quasi-verticale. On garde la plus basse hauteur et le plus grand rayon qui
 *                  voient presque tout, en montant si besoin jusqu'au plafond réaliste de 120 m.
 * ===================================================================================== */

import type { Person, RoadSample, WorldQuery } from '@/core/contracts';

/** Cellule de la grille d'attroupement (m). */
const CELL = 12;
/** Hauteur maximale de travail (m) : plafond réglementaire du drone. */
export const VIEW_CEILING = 120;
/** Rayons d'orbite essayés, du plus large au plus serré (m). */
const RADII: readonly number[] = [14, 9, 5];
/** Points du cercle essayés et cibles au plus par essai. */
const RING = 8;
const MAX_TARGETS = 24;
/** Part des cibles qui doivent être vues, depuis CHAQUE point du cercle, pour qu'un placement soit retenu. */
const GOOD = 0.85;

export interface Cluster {
  x: number;
  z: number;
  count: number;
}

/** Ligne de vue 3D : échantillons tous les 2 m au plus le long du segment ; sous un toit = masqué. */
export function clearSight(world: WorldQuery, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.min(80, Math.max(2, Math.ceil(d / 2)));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const roof = world.buildingHeightAt(x, z);
    if (roof > 0 && world.heightAt(x, z) + roof > ay + (by - ay) * t) return false;
  }
  return true;
}

/**
 * Attroupement le plus dense parmi `list[0..n)` : bloc de 3 × 3 cellules de 12 m le plus peuplé, pondéré par
 * 1 / (1 + (d / falloff)²) depuis (refX, refZ) ; le point retourné est le barycentre des personnes du bloc.
 * false si personne.
 */
export function densestCluster(list: readonly Person[], n: number, refX: number, refZ: number, falloff: number, out: Cluster): boolean {
  if (n <= 0) return false;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = list[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const cols = Math.min(64, Math.floor((maxX - minX) / CELL) + 1);
  const rows = Math.min(64, Math.floor((maxZ - minZ) / CELL) + 1);
  const grid = new Int32Array(cols * rows);
  const col = (x: number): number => Math.min(cols - 1, Math.floor((x - minX) / CELL));
  const row = (z: number): number => Math.min(rows - 1, Math.floor((z - minZ) / CELL));
  for (let i = 0; i < n; i++) grid[row(list[i].z) * cols + col(list[i].x)]++;
  let best = -1;
  let bc = 0;
  let br = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] === 0) continue;
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < cols) sum += grid[rr * cols + cc];
        }
      }
      const dx = minX + (c + 0.5) * CELL - refX;
      const dz = minZ + (r + 0.5) * CELL - refZ;
      const score = sum / (1 + (dx * dx + dz * dz) / (falloff * falloff));
      if (score > best) {
        best = score;
        bc = c;
        br = r;
      }
    }
  }
  let sx = 0;
  let sz = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const p = list[i];
    if (Math.abs(col(p.x) - bc) <= 1 && Math.abs(row(p.z) - br) <= 1) {
      sx += p.x;
      sz += p.z;
      m++;
    }
  }
  out.x = sx / m;
  out.z = sz / m;
  out.count = m;
  return true;
}

/**
 * Ramène (x, z) sur l'axe de la rue où il se trouve (point le plus proche de l'axe, même abscisse le long de la
 * rue) si le point est dans l'emprise de la rue (chaussée et trottoirs) ; sur une place ou loin d'une rue, le
 * point est gardé. Résultat dans `out` (x, z) ; retourne true s'il a été ramené.
 */
export function snapToStreet(world: WorldQuery, x: number, z: number, road: RoadSample, out: { x: number; z: number }): boolean {
  out.x = x;
  out.z = z;
  if (!world.nearestRoad(x, z, road, 25)) return false;
  if (road.dist > road.width * 0.5 + 7) return false;
  // l'axe doit lui-même être à ciel ouvert (une voie sous un porche ne se filme pas)
  if (world.buildingHeightAt(road.x, road.z) > 0) return false;
  out.x = road.x;
  out.z = road.z;
  return true;
}

export interface Pattern {
  radius: number;
  altitude: number;
  /** Part des cibles vues depuis le plus mauvais point du cercle retenu (0..1). */
  seen: number;
}

/**
 * Orbite d'où la caméra voit les cibles (tx, tz, ty : coordonnées entrelacées par trois, `n` cibles) : hauteurs
 * de `minAlt` à 120 m par pas de 15 m, rayons du plus large (borné à `maxRadius`) au plus serré ; huit points du
 * cercle à chaque essai. Le premier placement d'où chaque point du cercle voit au moins 85 % des cibles l'emporte,
 * sinon le meilleur.
 */
export function choosePattern(
  world: WorldQuery, cx: number, cz: number, targets: ArrayLike<number>, n: number, minAlt: number, maxRadius: number, out: Pattern,
): Pattern {
  const ground = world.heightAt(cx, cz);
  const m = Math.min(n, MAX_TARGETS);
  const stride = n > MAX_TARGETS ? n / MAX_TARGETS : 1;
  out.radius = Math.min(maxRadius, RADII[RADII.length - 1]);
  out.altitude = minAlt;
  out.seen = -1;
  if (m <= 0) {
    out.radius = maxRadius;
    out.seen = 1;
    return out;
  }
  for (let alt = Math.min(minAlt, VIEW_CEILING); ; alt = Math.min(VIEW_CEILING, alt + 15)) {
    for (let k = 0; k < RADII.length; k++) {
      const r = Math.min(maxRadius, RADII[k]);
      if (k > 0 && r >= Math.min(maxRadius, RADII[k - 1])) continue;
      // l'image doit rester bonne tout le long de l'orbite : on retient le plus mauvais point du cercle
      let s = 1;
      for (let j = 0; j < RING && s >= out.seen; j++) {
        const a = (j / RING) * Math.PI * 2;
        const ax = cx + Math.sin(a) * r;
        const az = cz + Math.cos(a) * r;
        const ay = ground + alt - 0.35;
        let ok = 0;
        for (let i = 0; i < m; i++) {
          const q = Math.floor(i * stride) * 3;
          if (clearSight(world, ax, ay, az, targets[q], targets[q + 1], targets[q + 2])) ok++;
        }
        if (ok / m < s) s = ok / m;
      }
      if (s > out.seen + 1e-9) {
        out.seen = s;
        out.radius = r;
        out.altitude = alt;
      }
      if (s >= GOOD) return out;
    }
    if (alt >= VIEW_CEILING) break;
  }
  return out;
}
