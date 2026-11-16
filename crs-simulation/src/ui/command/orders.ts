/* =====================================================================================
 * Catalogue des ordres (tous les verbes d'OrderType du contrat, libellés français) et géométrie
 * des gestes : segment tracé → ligne de barrage (centre, cap, largeur), partage entre plusieurs
 * unités, point → ordre de mouvement, cercle → nasse. Logique pure, sans DOM.
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';

/** Geste attendu sur la carte après le choix du verbe. */
export type OrderGesture = 'immediate' | 'point' | 'line' | 'area' | 'target';
export type OrderGroup = 'posture' | 'mouvement' | 'manoeuvre' | 'appui' | 'fin';

export interface OrderVerb {
  type: OrderType;
  /** Libellé complet (« Ligne de barrage ») et libellé court pour les pastilles et la roue. */
  label: string;
  short: string;
  group: OrderGroup;
  gesture: OrderGesture;
  /** Niveau de force minimal que l'ordre suppose (rappel affiché si la force autorisée est inférieure). */
  force: ForceLevel;
  /** Emploi collectif de la force : suppose les sommations faites (hors riposte à des violences). */
  coercive: boolean;
  /** Consigne affichée pendant le geste. */
  hint: string;
  /** Rappel de règle affiché avec l'ordre (vide si aucun). */
  rule: string;
}

export const ORDER_VERBS: readonly OrderVerb[] = [
  { type: 'tenir', label: 'Tenir la position', short: 'Tenir', group: 'posture', gesture: 'immediate', force: 1, coercive: false,
    hint: '', rule: '' },
  { type: 'ligne', label: 'Ligne de barrage', short: 'Ligne', group: 'posture', gesture: 'line', force: 1, coercive: false,
    hint: 'Tracez la ligne d’un flanc à l’autre\u00a0: l’unité fait face du côté où le flanc gauche est à votre gauche.', rule: '' },
  { type: 'colonne', label: 'En colonne vers…', short: 'Colonne', group: 'posture', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez le point à rejoindre en colonne.', rule: '' },
  { type: 'tortue', label: 'Tortue', short: 'Tortue', group: 'posture', gesture: 'immediate', force: 1, coercive: false,
    hint: '', rule: 'Boucliers de face et au-dessus des têtes\u00a0: aucun tir possible.' },
  { type: 'avancer', label: 'Avancer jusqu’à…', short: 'Avancer', group: 'mouvement', gesture: 'point', force: 1, coercive: false,
    hint: 'Désignez le point à atteindre\u00a0; glissez pour fixer le cap à l’arrivée.', rule: '' },
  { type: 'bond_offensif', label: 'Bond offensif', short: 'Bond', group: 'mouvement', gesture: 'point', force: 1, coercive: true,
    hint: 'Désignez la limite du bond (20 à 40 m)\u00a0: arrêt net et réalignement.', rule: 'Sans rechercher le contact.' },
  { type: 'charge', label: 'Charge', short: 'Charge', group: 'mouvement', gesture: 'point', force: 2, coercive: true,
    hint: 'Désignez la limite de la charge\u00a0: arrêt au sifflet, repli au pas.', rule: 'Après la dernière sommation, sauf violences contre l’unité.' },
  { type: 'refoulement', label: 'Vague de refoulement', short: 'Refouler', group: 'mouvement', gesture: 'point', force: 1, coercive: true,
    hint: 'Désignez la limite du refoulement\u00a0: par tronçons de 50 m, issue libre devant la foule.', rule: 'Après la dernière sommation\u00a0; une issue reste libre.' },
  { type: 'repli', label: 'Repli', short: 'Repli', group: 'mouvement', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez la position de repli\u00a0: l’unité recule par échelons, face à la foule.', rule: '' },
  { type: 'encercler', label: 'Encercler (nasse)', short: 'Nasse', group: 'manoeuvre', gesture: 'area', force: 1, coercive: true,
    hint: 'Posez le centre, puis glissez vers l’ISSUE à laisser ouverte\u00a0: la longueur du geste fixe le rayon.',
    rule: 'Règle\u00a0: une issue doit rester ouverte et annoncée. Un encerclement sans sortie est une faute.' },
  { type: 'disperser_gaz', label: 'Disperser au gaz', short: 'Gaz', group: 'manoeuvre', gesture: 'point', force: 3, coercive: true,
    hint: 'Désignez la zone à traiter\u00a0: vérifiez le vent avant de valider.', rule: 'Lacrymogènes\u00a0: force de niveau 3, après la dernière sommation.' },
  { type: 'interpeller', label: 'Interpeller la cible', short: 'Interpeller', group: 'manoeuvre', gesture: 'target', force: 1, coercive: false,
    hint: 'Désignez la cible\u00a0: un incident «\u00a0suspect\u00a0» ou «\u00a0pillage\u00a0», ou le secteur où l’auteur a été vu.', rule: 'Sur fait constaté seulement.' },
  { type: 'degager_barricade', label: 'Dégager une barricade', short: 'Dégager', group: 'manoeuvre', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez la barricade à dégager.', rule: '' },
  { type: 'proteger', label: 'Protéger', short: 'Protéger', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité, le véhicule de secours ou le point à protéger.', rule: '' },
  { type: 'escorter', label: 'Escorter', short: 'Escorter', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité ou le véhicule à escorter.', rule: '' },
  { type: 'suivre', label: 'Suivre', short: 'Suivre', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité à suivre.', rule: '' },
  { type: 'embarquer', label: 'Embarquer', short: 'Embarquer', group: 'appui', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '' },
  { type: 'debarquer', label: 'Débarquer', short: 'Débarquer', group: 'appui', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: 'À 50 m au moins de la foule.' },
  { type: 'cesser', label: 'Cesser l’action', short: 'Cesser', group: 'fin', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '' },
  { type: 'libre', label: 'Reprendre l’initiative', short: 'Libre', group: 'fin', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '' },
];

export const ORDER_GROUP_LABELS: Readonly<Record<OrderGroup, string>> = {
  posture: 'Postures', mouvement: 'Mouvements', manoeuvre: 'Manœuvres', appui: 'Appui', fin: 'Fin d’action',
};

const BY_TYPE = new Map<string, OrderVerb>();
for (let i = 0; i < ORDER_VERBS.length; i++) BY_TYPE.set(ORDER_VERBS[i]!.type, ORDER_VERBS[i]!);

export function verbOf(type: OrderType): OrderVerb | undefined {
  return BY_TYPE.get(type);
}

/** Libellé français d'un ordre en cours (pour les listes et le HUD). */
export function orderLabel(type: OrderType): string {
  const v = BY_TYPE.get(type);
  return v ? v.short : String(type);
}

/** Intitulés des niveaux de force, dans l'ordre de la gradation. */
export const FORCE_LABELS: readonly string[] = [
  'Aucune force', 'Présence, contact', 'Bâton, gazeuse', 'Lacrymogènes, canon à eau', 'GM2L, désencerclement, LBD', 'Arme à feu',
];
export const FORCE_SHORT: readonly string[] = ['Aucune', 'Contact', 'Bâton', 'Lacrymogènes', 'LBD, GM2L', 'Arme'];

// ───────────────────────────── géométrie ─────────────────────────────

export interface OrderGeom {
  x: number;
  z: number;
  heading: number;
  width: number;
}

/** Longueur minimale d'un tracé pour valoir une ligne (m) ; en deçà, c'est un point. */
export const MIN_LINE = 3;
/** Front par agent en ligne serrée (m) : sert à borner les largeurs. */
export const FRONT_PER_AGENT = 0.7;

/**
 * Segment tracé de A vers B → ligne de barrage. A est le flanc GAUCHE de la formation, B son flanc
 * droit : l'unité fait face perpendiculairement, du côté où A est à sa gauche. Avec la convention du
 * jeu (cap h : avant = (sin h, cos h), droite = (−cos h, sin h)), tracer d'ouest en est fait face au nord.
 */
export function lineToOrder(ax: number, az: number, bx: number, bz: number, out: OrderGeom): OrderGeom {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  out.x = (ax + bx) * 0.5;
  out.z = (az + bz) * 0.5;
  out.width = len;
  // droite = (dx, dz)/len = (−cos h, sin h)  ⇒  h = atan2(dz, −dx)
  out.heading = len > 1e-6 ? Math.atan2(dz, -dx) : 0;
  return out;
}

/** Extrémités (flanc gauche puis flanc droit) d'une ligne : inverse de lineToOrder. */
export function lineEnds(g: OrderGeom, out: { ax: number; az: number; bx: number; bz: number }): void {
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  const h = g.width * 0.5;
  out.ax = g.x - rx * h;
  out.az = g.z - rz * h;
  out.bx = g.x + rx * h;
  out.bz = g.z + rz * h;
}

/**
 * Partage une ligne entre plusieurs unités, de gauche à droite, au prorata de `weights` (effectifs).
 * Écrit `weights.length` tronçons jointifs dans `out` (objets réutilisés ou créés).
 */
export function splitLine(g: OrderGeom, weights: readonly number[], out: OrderGeom[]): OrderGeom[] {
  const n = weights.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i]! > 0 ? weights[i]! : 0;
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  let cursor = -g.width * 0.5;
  for (let i = 0; i < n; i++) {
    const share = total > 0 ? (weights[i]! > 0 ? weights[i]! : 0) / total : 1 / n;
    const w = g.width * share;
    const mid = cursor + w * 0.5;
    let o = out[i];
    if (!o) {
      o = { x: 0, z: 0, heading: 0, width: 0 };
      out[i] = o;
    }
    o.x = g.x + rx * mid;
    o.z = g.z + rz * mid;
    o.heading = g.heading;
    o.width = w;
    cursor += w;
  }
  out.length = n;
  return out;
}

/**
 * Ordre des unités le long d'une ligne : celles qui sont déjà à gauche prennent les tronçons de
 * gauche (aucun croisement). Retourne les indices des unités, triés de gauche à droite.
 */
export function slotsAlongLine(g: OrderGeom, positions: readonly { x: number; z: number }[]): number[] {
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  const idx: number[] = [];
  for (let i = 0; i < positions.length; i++) idx.push(i);
  idx.sort((a, b) => {
    const pa = (positions[a]!.x - g.x) * rx + (positions[a]!.z - g.z) * rz;
    const pb = (positions[b]!.x - g.x) * rx + (positions[b]!.z - g.z) * rz;
    return pa - pb || a - b;
  });
  return idx;
}

/** Répartit `n` unités en rang, perpendiculairement au cap, autour d'un point (espacement en mètres). */
export function spreadPoint(x: number, z: number, heading: number, n: number, spacing: number, out: OrderGeom[]): OrderGeom[] {
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * spacing;
    let o = out[i];
    if (!o) {
      o = { x: 0, z: 0, heading: 0, width: 0 };
      out[i] = o;
    }
    o.x = x + rx * k;
    o.z = z + rz * k;
    o.heading = heading;
    o.width = 0;
  }
  out.length = n;
  return out;
}

/**
 * Cap d'un ordre désignant un point : par défaut de l'unité vers le point ; pour un repli, l'unité
 * garde la face tournée vers l'endroit qu'elle quitte.
 */
export function pointHeading(type: OrderType, fromX: number, fromZ: number, x: number, z: number): number {
  const dx = x - fromX;
  const dz = z - fromZ;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  return type === 'repli' ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
}

/** Geste de nasse : centre posé, glissé vers l'issue. Largeur = diamètre, cap = direction de l'issue. */
export function areaToOrder(cx: number, cz: number, px: number, pz: number, out: OrderGeom, minRadius = 8): OrderGeom {
  const dx = px - cx;
  const dz = pz - cz;
  const r = Math.max(minRadius, Math.hypot(dx, dz));
  out.x = cx;
  out.z = cz;
  out.width = r * 2;
  out.heading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : 0;
  return out;
}
