/* =====================================================================================
 * Ordres directs sur le terrain — CONTRAT de la logique pure (types seulement, aucune logique).
 *
 * Vocabulaire :
 *   désignation   ce que le joueur regarde (réticule, cône de 4° pour les personnes, rayon lointain) — remplie par
 *                 designate.ts (P9), lue ici ;
 *   ordre prêt    ce que fait Entrée sur ce qu'il regarde (natural.ts), avec son unité (who.ts) et la ligne « autre »
 *                 (Maj+Entrée) ;
 *   ticket        l'état d'un ordre du joueur, de « reçu » à « en place » (tickets.ts) ;
 *   ligne d'unité ce que la puce d'état dit d'une unité (state.ts), jamais « sans ordre » pour une unité sous ses ordres.
 *
 * DirectEnv est une vue étroite de la partie (env.ts la lit dans la partie en cours ; les tests la construisent à la
 * main) : la logique ne touche jamais ctx.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { UnitSymbol } from '../../maps/units';
import type { CardRoad } from '../cardTypes';

/** Poste de commandement du joueur, tel que les ordres directs le voient. */
export type Poste =
  /** chef de groupe : son groupe, sans choix d'unité */
  | 'groupe'
  /** chef de section : sa section, ses groupes pour interpeller */
  | 'section'
  /** chef de la BRAV-M */
  | 'bravm'
  /** commandant ou commissaire : tout le dispositif, jamais la racine de la compagnie d'office */
  | 'commandant'
  /** chef de bord d'une patrouille : ses deux collègues (Avec moi, Interpeller, Secours, interpellé) */
  | 'equipage'
  /** aucune autorité de commandement */
  | 'lecture';

/**
 * Verbes du terrain (mêmes mots que les intentions de la carte). Les verbes coercitifs (disperser, charge, gaz) ne
 * sont jamais l'ordre prêt.
 */
export type DirectVerb =
  | 'avec_moi' | 'envoyer' | 'bloquer' | 'face_foule' | 'interpeller' | 'constater' | 'disperser' | 'secours'
  | 'pousser' | 'tenir' | 'cesser' | 'repli' | 'bond' | 'charge' | 'gaz' | 'libre' | 'tortue' | 'encercler'
  | 'confier' | 'remettre' | 'emmener' | 'faire_venir' | 'partir' | 'venir' | 'rien';

/** Genre d'unité pour les capacités (caps.ts). */
export type UnitKind = 'troupe' | 'bravm' | 'centaure' | 'canon_eau' | 'drone' | 'cellulaire' | 'patrouille' | 'autre';

/** Dernier ordre donné par le joueur à cette unité (P8 : CommandCore.playerOrder). */
export interface PlayerOrderInfo {
  type: OrderType;
  verb: DirectVerb | null;
  issuedAt: number;
  /** Ordre terminé (Envoyer arrivé, interpellé remis, secours fini). */
  done: boolean;
  /** Lieu nommé de l'ordre (« rue Saint-Gilles »), '' sinon. */
  place: string;
}

/** Unité sous les ordres du joueur, vue par les ordres directs. */
export interface DirectUnit {
  squadId: number;
  /** Indicatif (« MISTRAL 2 », « FAUCON 1 », « CELLULAIRE 1 »). */
  name: string;
  symbol: UnitSymbol;
  kind: UnitKind;
  x: number;
  z: number;
  total: number;
  valid: number;
  /** Unité supérieure (0 : aucune). */
  parentId: number;
  /** Le joueur fait partie de l'unité (directement ou par une subordonnée). */
  hasPlayer: boolean;
  hasVehicles: boolean;
  /** Agents assis dans des véhicules (le joueur exclu). */
  seated: number;
  /** Ordre en cours dans la simulation (null : aucun). */
  order: { type: OrderType; x: number; z: number; targetId: number; issuedAt: number; byPlayer: boolean } | null;
  /** Dernier ordre du joueur à cette unité (null : aucun). */
  playerOrder: PlayerOrderInfo | null;
  /** L'unité suit le joueur (« Avec moi » à pied ou en véhicules). */
  avecVous: boolean;
  /** Renfort d'un commissariat engagé par le joueur (choisi après les unités du dispositif, §1.4). */
  station?: boolean;
  /** Fourgon cellulaire : interpellés à bord et places de retenue. */
  detainees?: number;
  seats?: number;
}

/** Ce qu'il y a d'interpellable, de blessé ou de policier sous la désignation. */
export interface DesignatedPerson {
  id: number;
  kind: 'offender' | 'wounded' | 'police' | 'demonstrator' | 'other';
  /** Désignation en clair avec l'article (« le lanceur de projectile », « Christian Lopez »). */
  label: string;
  /** Unité d'un policier désigné (0 : aucune). */
  squadId: number;
  /** Sous le réticule même (aimedPersonId), pas seulement dans le cône de 4°. */
  exact: boolean;
}

/** Désignation du joueur (designate.ts, P9). */
export interface Designation {
  /** 'none' : le ciel, un mur à moins de 6 m, rien de désignable. */
  kind: 'none' | 'ground' | 'person';
  x: number;
  z: number;
  /** Distance horizontale au joueur (m). */
  distance: number;
  person: DesignatedPerson | null;
  /** Lieu nommé des candidats le long du rayon (« carrefour Voltaire »), '' : à déduire de la rue ou du secteur. */
  place: string;
  /** Désigné par le rayon lointain. */
  far: boolean;
}

/** Le joueur tient un interpellé (custody.escortedBy, ou palpation qui vient de finir). */
export interface DetaineeInfo {
  personId: number;
  name: string;
}

/** Binôme libre le plus proche à qui confier un interpellé. */
export interface FreePair {
  squadId: number;
  name: string;
  distance: number;
}

/** Vue étroite de la partie pour les ordres directs. */
export interface DirectEnv {
  now: number;
  poste: Poste;
  /** Unité que le joueur commande (racine de son commandement), 0 : aucune. */
  ownSquadId: number;
  player: { x: number; z: number; heading: number; inVehicle: boolean } | null;
  /** Unités sous ses ordres (la racine comprise), fourgons cellulaires compris. */
  units: readonly DirectUnit[];
  /** Manifestants à moins de `radius` m du point : nombre et centre. */
  demonstratorsAt(x: number, z: number, radius: number): { count: number; x: number; z: number };
  /** Voie nommée la plus proche à moins de `maxDist` m, null sinon. */
  roadAt(x: number, z: number, maxDist: number): CardRoad | null;
  /** Nom du secteur (« place de la Concorde »), '' s'il est inconnu. */
  placeName(x: number, z: number): string;
  /** Blessé au sol ou feu à moins de `radius` m (« blessé au sol », « feu de poubelle »), null sinon. */
  rescueAt(x: number, z: number, radius: number): { label: string } | null;
  /** Droit : sommations prononcées (0..3), riposte permise au point. */
  sommations: number;
  riposteAt(x: number, z: number): boolean;
  /** Interpellé tenu par le joueur, null sinon. */
  detainee: DetaineeInfo | null;
  /** Binôme libre à qui confier l'interpellé (≤ 60 m), null sinon. */
  freePair: FreePair | null;
  /**
   * Services présents (une règle dont le service manque n'est pas proposée — jamais un appui qui ne fait rien) :
   * confier (police.arrests), remettre (remise au véhicule), faireVenir (police.command.arrive), transfert (transfer).
   */
  can: { confier: boolean; remettre: boolean; faireVenir: boolean; transfert: boolean };
}

/** Unité (ou groupe d'unités) qui recevra l'ordre. */
export interface Addressee {
  squadIds: number[];
  /** « MISTRAL 1 », « BRAV-M », « Toute la compagnie ». */
  label: string;
  /** Distance (m) de la première unité au point. */
  distance: number;
  /** Ce que l'unité quitte (« quitte la rue Saint-Gilles »), '' si elle est libre. */
  leaves: string;
  /** Choix manuel (U) plutôt qu'automatique. */
  manual: boolean;
}

/** Clé d'un choix « À qui » : 'auto', 'tous' (toute la compagnie / section) ou 'u<squadId>'. */
export type WhoKey = string;
