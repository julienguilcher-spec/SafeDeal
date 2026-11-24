/* =====================================================================================
 * Carte de commandement — LIGNE AUTOMATIQUE (« Tenir une ligne ici », « Contenir : ligne face à la foule »).
 * Le joueur ne trace rien : le jeu oriente et dimensionne la ligne.
 *
 *   sur une rue   en travers de la chaussée (cap de la voie ± 90°), d'une façade à l'autre (largeur de la voie),
 *                 face à la foule la plus proche (sinon face au sens d'arrivée des unités) ;
 *   sur un point  perpendiculaire à la direction de la foule la plus proche, largeur = min(agents × front par agent
 *                 × 1,1 ; 40 m) ;
 *   face à une foule (« Contenir »)  la ligne se place entre les unités et la foule, à son bord.
 *
 * Les extrémités suivent la règle de issueLine (orders.ts, lineToOrder) : A est le flanc GAUCHE, B le flanc droit ;
 * l'unité fait face du côté où A est à sa gauche. Logique pure (testée).
 * ===================================================================================== */

import { FRONT_PER_AGENT, MIN_LINE } from './orders';

/** Largeur maximale d'une ligne posée sur un point (m). */
export const AUTO_LINE_MAX = 40;
/** Marge de la largeur d'une ligne sur un point (front serré × 1,1). */
export const AUTO_LINE_MARGIN = 1.1;
/** Distance (m) au bord d'une foule où se pose la ligne « Contenir ». */
export const CONTAIN_GAP = 12;
/** Largeur par défaut d'une ligne quand l'effectif est inconnu (m). */
const DEFAULT_WIDTH = 14;

export interface AutoLineInput {
  /** Point désigné (centre de la ligne, sauf pour « Contenir »). */
  x: number;
  z: number;
  /** Voie nommée sous le point (cap et largeur de la chaussée), null sur un point quelconque. */
  road: { x: number; z: number; heading: number; width: number } | null;
  /** Foule la plus proche (la ligne lui fait face), null s'il n'y en a pas. */
  crowd: { x: number; z: number; radius: number } | null;
  /** Agents valides des unités de Qui (largeur d'une ligne sur un point). */
  agents: number;
  /** Centre des unités de Qui (sens d'arrivée sans foule ; côté de la ligne « Contenir »), null s'il est inconnu. */
  from: { x: number; z: number } | null;
  /** « Contenir » : la ligne se place entre les unités et la foule, au bord de celle-ci. */
  contain?: boolean;
}

export interface AutoLine {
  /** Flanc gauche (A) et flanc droit (B), à passer tels quels à issueLine. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Centre, cap (face de la ligne, convention du jeu : avant = (sin h, cos h)) et largeur. */
  x: number;
  z: number;
  heading: number;
  width: number;
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Largeur d'une ligne posée sur un point pour cet effectif (m). */
export function pointLineWidth(agents: number): number {
  if (!(agents > 0)) return DEFAULT_WIDTH;
  return Math.max(MIN_LINE + 1, Math.min(AUTO_LINE_MAX, agents * FRONT_PER_AGENT * AUTO_LINE_MARGIN));
}

/**
 * Ligne automatique. Cap : vers la foule ; sans foule, dans le sens d'arrivée des unités (de `from` vers le point) ;
 * sans l'un ni l'autre, vers le nord. Sur une rue, le cap est celui de la voie (dans le sens qui regarde la foule).
 */
export function autoLine(input: AutoLineInput): AutoLine {
  let cx = input.x;
  let cz = input.z;
  const crowd = input.crowd;
  // « Contenir » : au bord de la foule, du côté des unités
  if (input.contain && crowd) {
    const fx = input.from ? input.from.x - crowd.x : 0;
    const fz = input.from ? input.from.z - crowd.z : 0;
    const d = Math.hypot(fx, fz);
    const ux = d > 1e-6 ? fx / d : 0;
    const uz = d > 1e-6 ? fz / d : -1;
    const gap = Math.max(0, crowd.radius) + CONTAIN_GAP;
    // jamais au-delà des unités elles-mêmes (une unité déjà au contact tient sa ligne où elle est)
    const k = d > 1e-6 ? Math.min(gap, d) : gap;
    cx = crowd.x + ux * k;
    cz = crowd.z + uz * k;
  }
  // direction voulue : vers la foule, sinon le sens d'arrivée
  let want = 0;
  if (crowd && Math.hypot(crowd.x - cx, crowd.z - cz) > 1e-3) want = Math.atan2(crowd.x - cx, crowd.z - cz);
  else if (input.from && Math.hypot(cx - input.from.x, cz - input.from.z) > 1e-3) want = Math.atan2(cx - input.from.x, cz - input.from.z);
  let heading = want;
  let width: number;
  const road = !input.contain ? input.road : null;
  if (road) {
    // en travers de la chaussée : la ligne regarde le long de la voie, dans le sens de la foule
    const h1 = road.heading;
    const h2 = road.heading + Math.PI;
    heading = angleDiff(h1, want) <= angleDiff(h2, want) ? h1 : h2;
    width = road.width > MIN_LINE ? road.width : pointLineWidth(input.agents);
    cx = road.x;
    cz = road.z;
  } else {
    width = pointLineWidth(input.agents);
  }
  heading = Math.atan2(Math.sin(heading), Math.cos(heading));
  // flanc droit = (−cos h, sin h) ; A (gauche) = centre − droite × w/2
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  const h = width * 0.5;
  return {
    ax: cx - rx * h, az: cz - rz * h, bx: cx + rx * h, bz: cz + rz * h,
    x: cx, z: cz, heading, width,
  };
}
