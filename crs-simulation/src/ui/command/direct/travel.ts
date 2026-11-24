/* =====================================================================================
 * Ordres directs — QUAND ROULER (une seule règle pour la fiche, le terrain et le Qui) — logique pure.
 *
 *   motorizes(unit, x, z, playerAboard)
 *     l'unité contient le joueur et il n'est pas à bord d'un de ses véhicules → jamais (sa colonne l'attendrait,
 *       diag-arrivee P2 : « l'ordre à ma propre unité l'embarque et elle m'attend » ) ;
 *     engins et voitures de patrouille → toujours (ce sont des véhicules) ;
 *     BRAV-M en selle (opérateurs en selle : plus de la moitié de l'unité assise, les pilotes restant au guidon quand
 *       les opérateurs ont mis pied à terre) → à partir de BRAVM_RIDE_MIN ; à pied → à partir de BRAVM_REMOUNT_MIN — les
 *       seuils mêmes de sim/police/command/bravm.ts (RIDE_BEYOND, WALK_BELOW) : en selle, en deçà de 60 m, pied à terre
 *       et à pied ; à pied, au-delà de 150 m, en selle (machines à portée, ou amenées par les pilotes) ;
 *     au moins la moitié des agents assis dans leurs véhicules et plus de 150 m → en véhicules (colonne implicite) ;
 *     à pied, plus de 450 m et des véhicules → en véhicules ;
 *     sinon à pied (au trot au-delà de 15 m).
 *   travelOf(unit, x, z, playerAboard)   délai, distance et mode pour la fiche et le Qui.
 * ===================================================================================== */

/** Seuils (m) : assis dans les véhicules, à pied, BRAV-M en selle, BRAV-M à pied, trot. */
export const SEATED_DRIVE_MIN = 150;
export const FOOT_DRIVE_MIN = 450;
export const BRAVM_RIDE_MIN = 60;
export const BRAVM_REMOUNT_MIN = 150;
export const TROT_BEYOND = 15;
/** Vitesses de calcul des délais (m/s) : au pas, au trot, en véhicules. */
export const WALK_SPEED = 1.4;
export const TROT_SPEED = 2.4;
export const DRIVE_SPEED = 11;

/** Ce que la règle lit d'une unité (CardUnit, DirectUnit ou MapUnit conviennent). */
export interface TravelUnit {
  x: number;
  z: number;
  hasVehicles: boolean;
  /** Le joueur fait partie de l'unité. */
  hasPlayer?: boolean;
  /** Part (0..1) des agents assis dans leurs véhicules ; absente : `embarked` (tous ou aucun). */
  seatedShare?: number;
  embarked?: boolean;
  /** Symbole de carte (UnitSymbol) : engins, BRAV-M. */
  symbol?: string;
  patrol?: boolean;
}

/** Engins qui se déplacent toujours en véhicule. */
const ROLLING: ReadonlySet<string> = new Set(['centaure', 'canon_eau', 'vehicule', 'drone']);

function seatedShare(u: TravelUnit): number {
  if (u.seatedShare !== undefined && Number.isFinite(u.seatedShare)) return Math.max(0, Math.min(1, u.seatedShare));
  return u.embarked ? 1 : 0;
}

/** L'unité ira-t-elle au point (x, z) en véhicules ? `playerAboard` : le joueur est à bord d'un véhicule de l'unité. */
export function motorizes(u: TravelUnit, x: number, z: number, playerAboard = false): boolean {
  const d = Math.hypot(u.x - x, u.z - z);
  if (u.hasPlayer && !playerAboard) return false;
  if (u.patrol || (u.symbol !== undefined && ROLLING.has(u.symbol))) return true;
  const share = seatedShare(u);
  if (u.symbol === 'bravm') return share > 0.5 ? d >= BRAVM_RIDE_MIN : d >= BRAVM_REMOUNT_MIN;
  if (!u.hasVehicles) return false;
  if (share >= 0.5) return d > SEATED_DRIVE_MIN;
  return d > FOOT_DRIVE_MIN;
}

/** Délai (s), distance (m) et mode d'une unité jusqu'au point. */
export function travelOf(u: TravelUnit, x: number, z: number, playerAboard = false): { eta: number; distance: number; mode: 'pied' | 'vehicules' } {
  const d = Math.hypot(u.x - x, u.z - z);
  if (motorizes(u, x, z, playerAboard)) return { eta: d / DRIVE_SPEED, distance: d, mode: 'vehicules' };
  return { eta: d / (d > TROT_BEYOND ? TROT_SPEED : WALK_SPEED), distance: d, mode: 'pied' };
}
