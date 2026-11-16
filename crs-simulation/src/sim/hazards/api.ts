/* =====================================================================================
 * DANGERS DIFFUS — types publics du module (gaz lacrymogène, fumée, feu, eau).
 *
 * Les autres modules n'importent jamais l'implémentation : ils passent par ctx.hazards (HazardApi
 * du contrat) et, pour le rendu ou le débogage, par le service de lecture
 *     ctx.service<HazardFieldView>(HAZARD_FIELD_SERVICE)        // clé « hazards.field »
 * dont les types sont décrits ici (`import type` autorisé depuis ce fichier).
 * ===================================================================================== */

import type { EntityId, Vec2 } from '@/core/contracts';

/** Clé du service de lecture publié par le module. */
export const HAZARD_FIELD_SERVICE = 'hazards.field';

/**
 * Événement libre émis à chaque douse() : { x, z, radius, amount }. Les modules qui gèrent leurs
 * propres incendies (mobilier, véhicules, vitrines) s'y abonnent par ctx.events.onAny pour éteindre
 * ce qui leur appartient, sans dépendre de ce module.
 */
export const HAZARD_DOUSE_EVENT = 'hazards:douse';

/** Charge utile de HAZARD_DOUSE_EVENT (objet réutilisé d'un appel à l'autre : ne pas le conserver). */
export interface HazardDouseEvent {
  x: number;
  z: number;
  radius: number;
  /** Quantité d'agent extincteur : 1 ≈ une seconde de jet d'extincteur portatif. */
  amount: number;
}

/** Nappe de feu au sol, en lecture seule (objets stables tant que le feu existe). */
export interface FireView {
  /** Numéro propre au module (pas un EntityId), stable pendant la vie du feu. */
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Rayon courant de la nappe (m) : se rétracte pendant l'extinction. */
  readonly radius: number;
  /** Intensité courante 0..1 (hauteur de flamme, chaleur, lumière). */
  readonly intensity: number;
  /** Secondes écoulées depuis l'allumage. */
  readonly age: number;
  /** Personne à l'origine du feu (0 si inconnue). */
  readonly sourceId: EntityId;
}

/**
 * Rappel de parcours des cellules actives.
 * @param x, z   centre de la cellule (m, repère monde)
 * @param gas    concentration de lacrymogène (0 = air pur, 1 = insoutenable ; peut dépasser 1 près d'une source)
 * @param smoke  densité de fumée (0..1 = opacité utile ; peut dépasser 1 près d'une source)
 * @param color  couleur moyenne de la fumée 0xRRGGBB (0 si la cellule n'a pas de fumée)
 */
export type HazardCellCallback = (x: number, z: number, gas: number, smoke: number, color: number) => void;

/** Compteurs d'état, pour l'affichage de débogage et les tests. */
export interface HazardStats {
  /** Blocs de 16 × 16 cellules actuellement alloués. */
  blocks: number;
  /** Parmi eux, blocs qui transportent de la fumée. */
  smokeBlocks: number;
  /** Blocs en réserve (déjà alloués, prêts à resservir). */
  pooledBlocks: number;
  /** Blocs de bâti mis en cache (masque des cellules infranchissables). */
  staticBlocks: number;
  /** Pas de champ exécutés depuis le début de la session (gaz et fumée confondus). */
  fieldSteps: number;
  /** Sous-pas d'advection par pas de champ (1 par vent modéré ; davantage par grand vent). */
  substeps: number;
  fires: number;
}

/**
 * Lecture du champ pour le rendu (particules, carte tactique) et le débogage. Aucune de ces méthodes
 * n'alloue : passer une fonction conservée d'une image à l'autre, pas une fermeture créée à chaque image.
 */
export interface HazardFieldView {
  /** Côté d'une cellule (m). */
  readonly cellSize: number;
  /** Côté d'un bloc (m). */
  readonly blockSize: number;
  /** Incrémenté à chaque changement du champ ou des feux (pas de champ, émission, eau, remise à zéro). */
  readonly revision: number;
  /**
   * Appelle `cb` pour chaque cellule dont le gaz ou la fumée atteint `minDensity` (défaut 0,01).
   * Si `radius` est fourni (> 0), seules les cellules des blocs proches de (cx, cz) sont parcourues.
   * Retourne le nombre de cellules visitées.
   */
  forEachActiveCell(cb: HazardCellCallback, minDensity?: number, cx?: number, cz?: number, radius?: number): number;
  /** Nappes de feu actives (tableau stable, modifié en place ; ne pas le conserver trié). */
  readonly fires: readonly FireView[];
  /** Dérive moyenne des nuages à cet instant (m/s) : vent × 0,8, rafales et sautes comprises. */
  readonly driftX: number;
  readonly driftZ: number;
  /** Dérive locale (m/s) : tient compte de l'abri et de la canalisation par les rues. Écrit dans `out`. */
  driftAt(x: number, z: number, out: Vec2): Vec2;
  /** Masse totale de gaz et de fumée (concentration × m²) : sert aux tests et aux courbes de débogage. */
  totalGas(): number;
  totalSmoke(): number;
  readonly stats: Readonly<HazardStats>;
}
