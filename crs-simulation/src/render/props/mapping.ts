/* =====================================================================================
 * RENDU DU DÉCOR — correspondances et choix de niveau de détail (logique pure, testée sous Node).
 *
 *   - type d'objet (PropKind, y compris les types propres à la carte et les inconnus) → modèle ;
 *   - gabarit debout de chaque modèle (identique aux gabarits de la simulation du décor), façon de
 *     se renverser, de brûler, nombre de vitrages, nombre de variantes de couleur ;
 *   - niveau de détail d'un morceau de 128 m selon la distance et la qualité, puis niveau du modèle
 *     de chaque objet selon sa taille (les petits objets disparaissent au loin) ;
 *   - axe de chute d'un objet renversé, déduit de sa boîte de collision ;
 *   - signatures d'état (un entier par objet ou vitrine) pour ne réécrire que ce qui change.
 * ===================================================================================== */

import { own } from './meshbuf';

export type Quality = 'bas' | 'moyen' | 'haut' | 'ultra';

export type BurnMode = 'fond' | 'tord' | 'charbon' | 'aucune';
export type ToppleMode = 'none' | 'lie' | 'flat';
export type CarryMode = 'non' | 'porte' | 'roule';

export interface KindInfo {
  readonly model: string;
  /** Gabarit debout : demi-largeur (x local), demi-profondeur (z local), hauteur (m). */
  readonly hx: number;
  readonly hz: number;
  readonly h: number;
  /** 0 = petit (masqué au loin), 1 = moyen, 2 = grand (visible jusqu'à la limite d'affichage). */
  readonly size: 0 | 1 | 2;
  readonly topple: ToppleMode;
  readonly carry: CarryMode;
  /** Façon de brûler : plastique qui fond, cadre qui se tord, bois qui charbonne, incombustible. */
  readonly burn: BurnMode;
  /** Hauteur restante une fois calciné (facteur). */
  readonly burntHeight: number;
  /** Nombre de vitrages qui éclatent un à un. */
  readonly panes: number;
  /** Nombre de variantes de couleur. */
  readonly skins: number;
}

function ki(
  model: string, hx: number, hz: number, h: number, size: 0 | 1 | 2, topple: ToppleMode = 'none',
  carry: CarryMode = 'non', burn: BurnMode = 'aucune', burntHeight = 1, panes = 0, skins = 1,
): KindInfo {
  return { model, hx, hz, h, size, topple, carry, burn, burntHeight, panes, skins };
}

const LIST: readonly KindInfo[] = [
  ki('poubelle', 0.22, 0.22, 1.0, 1, 'lie', 'roule', 'fond', 0.25),
  ki('conteneur', 0.63, 0.39, 1.2, 1, 'lie', 'roule', 'fond', 0.2, 0, 4),
  ki('barriere_vauban', 1.25, 0.2, 1.1, 1, 'flat', 'porte'),
  ki('barriere_chantier', 1.75, 0.25, 2.0, 1, 'flat', 'porte', 'tord', 0.3, 0, 2),
  ki('banc', 1.0, 0.3, 0.8, 1, 'none', 'non', 'charbon', 0.6),
  ki('abribus', 2.1, 0.8, 2.6, 2, 'none', 'non', 'aucune', 1, 4, 4),
  ki('kiosque', 1.5, 1.1, 3.5, 2, 'none', 'non', 'charbon', 0.8, 2, 2),
  ki('colonne_morris', 0.7, 0.7, 4.5, 2, 'none', 'non', 'aucune', 1, 2, 4),
  ki('panneau_pub', 0.65, 0.12, 2.7, 2, 'none', 'non', 'aucune', 1, 2, 4),
  ki('potelet', 0.06, 0.06, 1.0, 0),
  ki('velo', 0.28, 0.9, 1.05, 1, 'flat', 'roule', 'tord', 0.5, 0, 2),
  ki('trottinette', 0.22, 0.55, 1.15, 0, 'flat', 'porte', 'tord', 0.4, 0, 3),
  ki('palette', 0.6, 0.4, 0.15, 0, 'none', 'porte', 'charbon', 0.4),
  ki('pile_paves', 0.5, 0.5, 0.5, 1),
  ki('table_terrasse', 0.35, 0.35, 0.75, 0, 'lie', 'porte', 'charbon', 0.3, 0, 2),
  ki('chaise', 0.23, 0.25, 0.85, 0, 'lie', 'porte', 'charbon', 0.3, 0, 2),
  ki('candelabre', 0.12, 0.12, 9.0, 2),
  ki('feu_tricolore', 0.1, 0.1, 3.5, 2, 'none', 'non', 'aucune', 1, 1),
  ki('distributeur', 0.45, 0.35, 1.8, 1, 'none', 'non', 'aucune', 1, 1),
  ki('fontaine_wallace', 0.4, 0.4, 2.7, 2),
  ki('barricade', 1.5, 0.6, 1.3, 2, 'none', 'non', 'charbon', 0.5),
  ki('debris', 0.4, 0.4, 0.3, 0, 'none', 'porte', 'aucune', 1, 0, 3),
  ki('cone', 0.18, 0.18, 0.6, 0, 'lie', 'porte', 'fond', 0.2),
  ki('jardiniere', 0.75, 0.3, 0.7, 1),
  ki('echafaudage', 4.0, 0.6, 9.0, 2),
  ki('sanisette', 1.6, 1.0, 2.6, 2),
  ki('station_velo', 3.0, 0.9, 1.2, 2),
  // types propres à la carte
  ki('boite_aux_lettres', 0.25, 0.22, 1.4, 1),
  ki('arceau_velo', 0.45, 0.04, 0.85, 0),
  ki('panneau', 0.05, 0.05, 2.8, 1, 'none', 'non', 'aucune', 1, 0, 4),
  ki('statue', 0.8, 0.8, 4.0, 2),
  ki('mat_drapeau', 0.08, 0.08, 8.0, 2),
  ki('bouche_incendie', 0.15, 0.15, 0.7, 0),
  ki('horodateur', 0.15, 0.15, 1.6, 1, 'none', 'non', 'aucune', 1, 1),
  ki('armoire_technique', 0.45, 0.2, 1.4, 1),
  ki('colonne_verre', 0.75, 0.75, 1.7, 1),
  ki('horloge', 0.1, 0.1, 4.0, 2, 'none', 'non', 'aucune', 1, 1),
  ki('camera', 0.07, 0.07, 5.0, 1, 'none', 'non', 'aucune', 1, 1),
  ki('autre', 0.2, 0.2, 1.0, 0),
];

const TABLE = new Map<string, KindInfo>();
for (const k of LIST) TABLE.set(k.model, k);

/** Noms des modèles disponibles (un par PropKind du contrat). */
export const MODEL_KEYS: readonly string[] = LIST.map((k) => k.model);

/** Autres orthographes rencontrées dans les données de carte ou les scripts de mission. */
const ALIASES: Readonly<Record<string, string>> = {
  corbeille: 'poubelle', bin: 'poubelle', bac: 'conteneur', benne: 'conteneur', barriere: 'barriere_vauban',
  vauban: 'barriere_vauban', grille_chantier: 'barriere_chantier', bench: 'banc', bus_shelter: 'abribus',
  newsstand: 'kiosque', kiosk: 'kiosque', morris_column: 'colonne_morris', advert_panel: 'panneau_pub',
  sucette: 'panneau_pub', bollard: 'potelet', borne: 'potelet', bike: 'velo', scooter: 'trottinette',
  paves: 'pile_paves', table: 'table_terrasse', lamp: 'candelabre', lampadaire: 'candelabre', reverbere: 'candelabre',
  feu: 'feu_tricolore', traffic_light: 'feu_tricolore', dab: 'distributeur', atm: 'distributeur',
  wallace_fountain: 'fontaine_wallace', fountain: 'fontaine_wallace', fontaine: 'fontaine_wallace', gravats: 'debris',
  plot: 'cone', planter: 'jardiniere', toilet: 'sanisette', toilettes: 'sanisette', velib: 'station_velo',
  boite_lettres: 'boite_aux_lettres', arceau: 'arceau_velo', signalisation: 'panneau', flagpole: 'mat_drapeau',
  mat: 'mat_drapeau', hydrant: 'bouche_incendie', parcmetre: 'horodateur', armoire: 'armoire_technique',
  colonne_a_verre: 'colonne_verre', clock: 'horloge', surveillance: 'camera', phone: 'autre',
};

/** Modèle d'un type d'objet : lui-même s'il est connu, son alias, sinon « autre ». */
export function modelFor(kind: string): string {
  if (TABLE.has(kind)) return kind;
  const alias = own(ALIASES, kind);
  return alias !== undefined ? alias : 'autre';
}

export function kindInfo(kind: string): KindInfo {
  return TABLE.get(modelFor(kind))!;
}

// ───────────────────────────── niveaux de détail ─────────────────────────────

/** Côté d'un morceau (m) : un quart de tuile. */
export const CHUNK_SIZE = 128;

export interface LodConfig {
  /** Sous d0 : modèles détaillés ; sous d1 : modèles moyens ; sous d2 : lointains, petits objets masqués. */
  readonly d0: number;
  readonly d1: number;
  readonly d2: number;
  /** Au-delà : rien (distance horizontale). */
  readonly cap: number;
  /**
   * Les morceaux de niveau ≤ shadowLevel projettent une ombre (-1 = aucun). Chaque morceau qui projette
   * coûte un appel de dessin par cascade d'ombre : seuls les plus proches le font.
   */
  readonly shadowLevel: number;
  /** Nombre maximal d'objets en mouvement redessinés à chaque image. */
  readonly maxDynamic: number;
  /** Vraies lumières demandées au rendu de base (candélabres proches, feux). */
  readonly lamps: number;
  readonly fires: number;
  /** Côté réel de l'atlas (px). */
  readonly atlas: number;
}

export const LOD_CONFIGS: Readonly<Record<Quality, LodConfig>> = {
  bas: { d0: 0, d1: 50, d2: 140, cap: 300, shadowLevel: -1, maxDynamic: 32, lamps: 2, fires: 1, atlas: 1024 },
  moyen: { d0: 20, d1: 95, d2: 220, cap: 450, shadowLevel: 0, maxDynamic: 64, lamps: 4, fires: 2, atlas: 2048 },
  haut: { d0: 38, d1: 150, d2: 320, cap: 600, shadowLevel: 0, maxDynamic: 96, lamps: 6, fires: 3, atlas: 2048 },
  ultra: { d0: 60, d1: 210, d2: 430, cap: 700, shadowLevel: 1, maxDynamic: 128, lamps: 8, fires: 4, atlas: 2048 },
};

export function lodConfig(quality: string): LodConfig {
  return own(LOD_CONFIGS, quality) ?? LOD_CONFIGS.moyen;
}

/** Marge d'hystérésis : un morceau garde son niveau détaillé jusqu'à 12 % au-delà du seuil. */
export const LOD_HYSTERESIS = 1.12;

/**
 * Niveau d'un morceau : 0 détaillé, 1 moyen, 2 lointain, 3 très lointain, -1 masqué.
 * distH : distance horizontale de la caméra au morceau (limite d'affichage) ; dist3 : distance en
 * volume (choix du détail : une caméra haute voit tout en version lointaine). `current` : niveau
 * actuellement construit (-1 si aucun), pour l'hystérésis.
 */
export function chunkLevel(distH: number, dist3: number, cfg: LodConfig, current: number, drawDistance = Infinity): number {
  const cap = Math.min(cfg.cap, drawDistance);
  const keepCap = current >= 0 ? cap * LOD_HYSTERESIS : cap;
  if (!(distH < keepCap)) return -1;
  let lvl = dist3 < cfg.d0 ? 0 : dist3 < cfg.d1 ? 1 : dist3 < cfg.d2 ? 2 : 3;
  if (current >= 0 && current < lvl) {
    // on s'éloigne : garder le niveau plus détaillé tant qu'on reste dans la marge
    const lim = current === 0 ? cfg.d0 : current === 1 ? cfg.d1 : cfg.d2;
    if (dist3 < lim * LOD_HYSTERESIS) lvl = current;
  }
  return lvl;
}

/**
 * Niveau du modèle (0, 1, 2) d'un objet de taille `size` dans un morceau de niveau `level`, ou -1 s'il
 * n'est pas dessiné. Un objet endormi (loin de toute personne) n'est dessiné qu'en version lointaine.
 */
export function objectLod(level: number, size: number, dormant = false): number {
  if (level < 0) return -1;
  const l = dormant && level < 2 ? 2 : level;
  if (l === 0) return 0;
  if (l === 1) return 1;
  if (l === 2) return size >= 1 ? 2 : -1;
  return size >= 2 ? 2 : -1;
}

/** Niveau de la devanture d'un commerce (0 détaillée, 1 moyenne, 2 lointaine, 3 silhouette). */
export function shopLod(level: number, dormant = false): number {
  if (level < 0) return -1;
  return dormant && level < 2 ? 2 : level;
}

export function chunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

export function chunkKey(cx: number, cz: number): number {
  return (cx + 8192) * 16384 + (cz + 8192);
}

/** Distance horizontale d'un point au carré d'un morceau (0 à l'intérieur). */
export function chunkDistance(x: number, z: number, cx: number, cz: number): number {
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const dx = x < x0 ? x0 - x : x > x0 + CHUNK_SIZE ? x - x0 - CHUNK_SIZE : 0;
  const dz = z < z0 ? z0 - z : z > z0 + CHUNK_SIZE ? z - z0 - CHUNK_SIZE : 0;
  return Math.sqrt(dx * dx + dz * dz);
}

// ───────────────────────────── renversement ─────────────────────────────

export const FALL_NONE = 0;
/** Couché vers l'avant ou l'arrière (le long de l'axe z local). */
export const FALL_Z = 1;
/** Couché sur le flanc (le long de l'axe x local). */
export const FALL_X = 2;

/**
 * Axe de chute d'un objet renversé, déduit de sa boîte de collision actuelle : la simulation couche la
 * hauteur du gabarit sur l'un des deux axes au sol (demi-dimension = hauteur / 2). Retourne FALL_NONE
 * si le gabarit n'a pas changé (objet fixe « cassé » qui garde son emprise).
 */
export function fallAxis(info: KindInfo, halfX: number, halfZ: number, height: number): number {
  if (info.topple === 'none') return FALL_NONE;
  const half = info.h * 0.5;
  // toujours debout : hauteur d'origine et emprise d'origine
  if (Math.abs(height - info.h) < 0.05 * info.h && Math.abs(halfX - info.hx) < 0.02 && Math.abs(halfZ - info.hz) < 0.02) return FALL_NONE;
  return Math.abs(halfZ - half) <= Math.abs(halfX - half) ? FALL_Z : FALL_X;
}

// ───────────────────────────── signatures d'état ─────────────────────────────

const STATE_CODES: Readonly<Record<string, number>> = { intact: 0, damaged: 1, broken: 2, burning: 3, burnt: 4 };

export function stateCode(state: string): number {
  return own(STATE_CODES, state) ?? 0;
}

/** Entier qui change dès que l'aspect d'un objet doit être redessiné (hors position). */
export function propSignature(state: string, toppled: boolean, tags: number, carried: boolean, dormant: boolean, panes: number): number {
  const t = tags > 3 ? 3 : tags < 0 ? 0 : tags | 0;
  return stateCode(state) | (toppled ? 8 : 0) | (t << 4) | (carried ? 64 : 0) | (dormant ? 128 : 0) | ((panes & 7) << 8);
}

const WINDOW_CODES: Readonly<Record<string, number>> = { intact: 0, tagged: 1, cracked: 2, broken: 3, boarded: 4 };

export function windowCode(w: string): number {
  return own(WINDOW_CODES, w) ?? 0;
}

/** Pas de quantification du rideau de fer (61 positions : ~4 cm par pas sur une vitrine). */
export const SHUTTER_STEPS = 60;

/** Tranche de marchandise : 0 = vide (pillée), 1 = entamée, 2 = pleine. */
export function stockBucket(stock: number): number {
  return stock < 0.04 ? 0 : stock < 0.55 ? 1 : 2;
}

/** Entier qui change dès que la devanture d'un commerce doit être redessinée. */
export function shopSignature(
  window: string, shutter: number, stock: number, burning: number, dormant: boolean,
  forced: boolean, burnt: boolean, boarded: boolean, tags: number,
): number {
  const q = Math.round(Math.max(0, Math.min(1, shutter)) * SHUTTER_STEPS);
  const t = tags > 3 ? 3 : tags < 0 ? 0 : tags | 0;
  return windowCode(window) | (q << 3) | (stockBucket(stock) << 9) | (burning > 0.05 ? 2048 : 0) | (dormant ? 4096 : 0)
    | (forced ? 8192 : 0) | (burnt ? 16384 : 0) | (boarded ? 32768 : 0) | (t << 16);
}
