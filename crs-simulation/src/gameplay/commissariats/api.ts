/* =====================================================================================
 * COMMISSARIATS (jeu) — types publics de src/gameplay/commissariats (à importer en `import type`).
 *
 * Service ctx.service<CommissariatsApi>('police.commissariats') : le stock d'unités des sept sites de police réels
 * (données figées de src/world/commissariats). Les véhicules sont garés dans les places réservées dès la mise en
 * place de la session (sans équipage) ; un commandant ou un commissaire « engage » une unité depuis la carte
 * tactique (l'équipage est créé à bord, en alerte), puis lui donne sa destination et sa mission par les ordres
 * habituels. « Rentrer au commissariat » ramène n'importe quelle unité, sans deux tons, à ses places : remise des
 * interpellés encore à bord, réserves complétées, repos, puis de nouveau disponible.
 *
 * Les autres systèmes ignorent les véhicules garés en réserve par isHeldVehicle() ('@/world/commissariats').
 *
 * Événements libres émis (ctx.events.emitAny) :
 *   'commissariat:engaged'  CommissariatEngagedEvent  — une unité vient d'être engagée (équipage à bord) ;
 *   'commissariat:returned' CommissariatReturnedEvent — une unité rappelée est arrivée à son commissariat ;
 *   'commissariat:stock'    CommissariatStockEvent    — le stock d'un site a changé (affichage).
 *
 * Clés lues dans session.config.extra :
 *   'commissariats' (booléen, défaut true) — false : aucun véhicule garé, service inactif ;
 *   'renforts'      (booléen, défaut true) — false : stock visible, mais personne ne peut engager d'unité
 *                                            (« Moyens fixés par l'ordre d'opération »).
 * Le module est inactif dans les modes 'editeur' et 'test'.
 * ===================================================================================== */

import type { EntityId, VehicleKind } from '@/core/contracts';
import type { CommissariatKind, StockKind } from '@/world/commissariats';

/** Clé du service (même valeur que celle lue par isHeldVehicle). */
export const COMMISSARIATS_SERVICE = 'police.commissariats';
/** Identifiant du système de jeu. */
export const COMMISSARIATS_SYSTEM_ID = 'gameplay.commissariats';

export const COMMISSARIAT_ENGAGED_EVENT = 'commissariat:engaged';
export const COMMISSARIAT_RETURNED_EVENT = 'commissariat:returned';
export const COMMISSARIAT_STOCK_EVENT = 'commissariat:stock';

/** Charge utile de 'commissariat:engaged'. */
export interface CommissariatEngagedEvent {
  commissariatId: string;
  entryId: string;
  squadId: number;
  /** Temps de simulation (s). */
  t: number;
}

/** Charge utile de 'commissariat:returned'. */
export interface CommissariatReturnedEvent {
  commissariatId: string;
  squadId: number;
  /** Interpellés remis à l'officier de police judiciaire à l'arrivée. */
  detainees: number;
  t: number;
}

/** Charge utile de 'commissariat:stock'. */
export interface CommissariatStockEvent {
  commissariatId: string;
}

/**
 * au_poste     : garée dans ses places, sans équipage (« Au poste — prêt ») ;
 * alerte       : engagée, équipage à bord, encore dans ses places (« En alerte (équipage à bord) ») ;
 * engage       : partie en mission (« Engagé — <secteur> ») ;
 * retour       : rappelée, roule vers ses places sans deux tons (« Retour ») ;
 * repos        : rentrée, équipage au repos (« Au repos 1:20 ») ;
 * indisponible : véhicules détruits ou pris, ou équipage hors de combat (« Indisponible »).
 */
export type EntryState = 'au_poste' | 'alerte' | 'engage' | 'retour' | 'repos' | 'indisponible';

/** Une unité du stock d'un site (ou une unité adoptée, rentrée dans un site qui n'est pas le sien). */
export interface StockEntryView {
  /** Identifiant stable (celui du modèle de stock, « 9e:faucon9 » ; « adopte:<unité> » pour une unité adoptée). */
  readonly id: string;
  readonly commissariatId: string;
  readonly kind: StockKind | 'adopte';
  readonly callsign: string;
  /** Description en français. */
  readonly label: string;
  readonly vehicle: VehicleKind;
  /** Véhicules restants dans le stock (un véhicule pris par un joueur ou détruit en est retiré). */
  vehicles: number;
  /** Effectif embarqué à l'engagement. */
  readonly crew: number;
  state: EntryState;
  /** Unité créée à l'engagement (0 : pas encore engagée). */
  squadId: number;
  /** Fin du repos, en temps de simulation (s ; 0 hors repos). */
  restUntil: number;
  /** Véhicules garés (au poste) ou de l'unité (engagée). */
  vehicleIds: readonly EntityId[];
  readonly engageable: boolean;
  /** Secteur où se trouve l'unité engagée (« place de la République »), '' au poste. */
  where: string;
}

/** Un site, tel que l'affichent la carte et le panneau des commissariats. */
export interface CommissariatView {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly kind: CommissariatKind;
  /** Porte. */
  readonly x: number;
  readonly z: number;
  /** Centre de la file de réserve (retour d'une unité adoptée) et son cap. */
  readonly returnX: number;
  readonly returnZ: number;
  readonly returnHeading: number;
  readonly entries: readonly StockEntryView[];
  /** Unités engageables au poste (badge vert de la carte). */
  available: number;
  /** Unités engagées ou en retour. */
  engaged: number;
  /** Unités au repos. */
  resting: number;
  /** Patrouilles rattachées à ce site (unités du module des patrouilles, hors stock). */
  readonly patrols: readonly number[];
}

/** Résultat d'un engagement. */
export interface EngageResult {
  ok: boolean;
  /** Raison du refus, en français (vide si ok). */
  reason: string;
  /** Unité créée (0 si refus). */
  squadId: number;
  /** Ordre à armer par défaut : véhicules → faire mouvement ; BRAV-M → colonne ; patrouille → avancer. */
  defaultVerb: 'faire_mouvement' | 'colonne' | 'avancer';
}

/** Destination d'un rappel : centre de la file de places de l'unité (sur le trottoir, pas sur la chaussée). */
export interface RecallTarget {
  commissariatId: string;
  x: number;
  z: number;
  heading: number;
  /** Porte (unités à pied). */
  doorX: number;
  doorZ: number;
}

/** Service 'police.commissariats'. */
export interface CommissariatsApi {
  /** Module actif pour cette session (stock garé). */
  readonly enabled: boolean;
  /** Le joueur peut-il engager des unités (commandant, commissaire, grade ≥ commandant ; renforts permis) ? */
  readonly canDispatch: boolean;
  /** Les sites, dans l'ordre des données. */
  readonly list: readonly CommissariatView[];
  get(id: string): CommissariatView | undefined;
  entry(entryId: string): StockEntryView | undefined;
  /** Engage une unité (idempotent : une unité déjà engagée renvoie son unité). `by` : personne qui ordonne. */
  engage(entryId: string, by?: EntityId): EngageResult;
  /** Prépare le retour d'une unité (adoptée si elle n'appartient à aucun site) ; null si aucun site joignable. */
  recall(squadId: number): RecallTarget | null;
  /** Le véhicule est-il garé en réserve (à ignorer par les autres systèmes) ? */
  holds(vehicleId: EntityId): boolean;
  /** L'unité vient-elle d'un commissariat (stock ou adoptée) ? */
  isStationUnit(squadId: number): boolean;
  entryOf(squadId: number): StockEntryView | undefined;
  /** L'unité est-elle au poste, en alerte ou au repos (exclue de « Tout », des chiffres et du cycle des unités) ? */
  atPost(squadId: number): boolean;
}
