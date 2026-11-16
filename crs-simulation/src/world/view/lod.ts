/* =====================================================================================
 * VILLE EN 3D — niveaux de détail et file de construction (logique pure).
 * -------------------------------------------------------------------------------------
 *   - une tuile est DÉTAILLÉE quand la caméra est à moins de `detailRadius` de son rectangle,
 *     LOINTAINE jusqu'à `drawDistance`, absente au-delà ;
 *   - hystérésis : une tuile ne redescend d'un niveau qu'après avoir dépassé le seuil d'une marge,
 *     pour qu'un va-et-vient autour d'une limite ne reconstruise rien ;
 *   - la file est triée par distance ; les versions lointaines, très peu coûteuses, passent avant
 *     les versions détaillées à distance comparable (la ville apparaît vite, puis se précise) ;
 *   - le travail est un générateur exécuté par tranches : on s'arrête dès que le budget de l'image
 *     est dépensé, ou quand une étape demande d'attendre l'image suivante.
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';

/** 0 = pas de vue, 1 = lointaine, 2 = détaillée. */
export type Lod = 0 | 1 | 2;

export interface LodParams {
  /** Rayon de la zone détaillée (m). */
  detailRadius: number;
  /** Distance d'affichage (m). */
  drawDistance: number;
}

/** Marges d'hystérésis : facteur et constante (m) ajoutés au seuil pour redescendre d'un niveau. */
export const DETAIL_KEEP_FACTOR = 1.18;
export const DETAIL_KEEP_MARGIN = 24;
export const FAR_KEEP_FACTOR = 1.08;
export const FAR_KEEP_MARGIN = 64;
/** Avance (m) donnée aux versions lointaines dans la file. */
export const FAR_PRIORITY_BONUS = 150;

/** Distance (m) d'un point au rectangle d'une tuile (0 si le point est dedans). */
export function tileDistance(tx: number, tz: number, x: number, z: number): number {
  const minX = tx * TILE_SIZE, minZ = tz * TILE_SIZE;
  const dx = x < minX ? minX - x : x > minX + TILE_SIZE ? x - minX - TILE_SIZE : 0;
  const dz = z < minZ ? minZ - z : z > minZ + TILE_SIZE ? z - minZ - TILE_SIZE : 0;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Niveau voulu pour une tuile à la distance `dist`, sachant son niveau actuel (hystérésis). */
export function wantedLod(dist: number, current: Lod, p: LodParams): Lod {
  const detail = Math.min(p.detailRadius, p.drawDistance);
  const keepDetail = detail * DETAIL_KEEP_FACTOR + DETAIL_KEEP_MARGIN;
  const keepFar = p.drawDistance * FAR_KEEP_FACTOR + FAR_KEEP_MARGIN;
  if (dist <= detail || (current === 2 && dist <= keepDetail)) return 2;
  if (dist <= p.drawDistance || (current >= 1 && dist <= keepFar)) return 1;
  return 0;
}

export interface BuildJob {
  key: string;
  tx: number;
  tz: number;
  /** Niveau à construire. */
  lod: 1 | 2;
  /** Distance à la caméra au moment du tri (m). */
  dist: number;
}

/** Rang d'un travail dans la file : plus petit = plus tôt. */
export function jobPriority(job: BuildJob): number {
  return job.dist + (job.lod === 2 ? FAR_PRIORITY_BONUS : 0);
}

/** Trie la file en place, du plus urgent au moins urgent (ordre stable par clé à égalité). */
export function sortJobs(jobs: BuildJob[]): BuildJob[] {
  return jobs.sort((a, b) => jobPriority(a) - jobPriority(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export type SliceResult = 'done' | 'frame' | 'budget';

/** Durées mesurées d'un travail : sa plus longue étape, la deuxième plus longue, le total (ms). */
export interface SliceSpent { maxStepMs: number; secondStepMs: number; totalMs: number }

/**
 * Exécute des étapes du générateur jusqu'à épuisement du budget.
 *   'done'   : le travail est terminé ;
 *   'frame'  : une étape a demandé d'attendre l'image suivante (valeur 1) ;
 *   'budget' : le temps accordé est dépensé.
 * Au moins une étape est toujours exécutée. `spent` (facultatif) cumule les durées des étapes.
 */
export function runSlice(work: Generator<number, void, void>, budgetMs: number, now: () => number, spent?: SliceSpent): SliceResult {
  const start = now();
  let last = start;
  for (;;) {
    const r = work.next();
    const t = now();
    if (spent) {
      const d = t - last;
      if (d > spent.maxStepMs) {
        spent.secondStepMs = spent.maxStepMs;
        spent.maxStepMs = d;
      } else if (d > spent.secondStepMs) {
        spent.secondStepMs = d;
      }
      spent.totalMs += d;
    }
    last = t;
    if (r.done) return 'done';
    if (r.value === 1) return 'frame';
    if (t - start >= budgetMs) return 'budget';
  }
}
