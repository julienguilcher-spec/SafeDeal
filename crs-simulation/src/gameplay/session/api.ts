/* =====================================================================================
 * MISE EN PLACE DE SESSION — types publics (à importer en `import type` depuis les autres modules).
 *
 * Service publié :
 *   ctx.service<SessionSetupApi>('session.setup')   ce que la mise en place a créé pour la session en cours
 *
 * Événements libres (ctx.events.emitAny) :
 *   'ui:loading'      { progress: 0..1, label }   avancement du chargement (écran « chargement » de l'interface)
 *   'session:setup'   SessionSetupSummary         la scène de départ est en place (joueur incarné)
 *
 * Clés de SessionConfig.extra lues (toutes facultatives) :
 *   poste       PolicePoste du joueur (page d'accueil) ; sinon poste par défaut du rôle
 *   variante    profil du manifestant ('pacifique' | 'service_ordre' | 'radical'), service du secouriste ('pompier' | 'samu')
 *   camera      'fps' | 'tps' : vue de départ (défaut : 'fps', à hauteur d'homme)
 *   passants    nombre de passants autour du lieu (défaut 10 ; 0 pour aucun)
 *   vent        { direction (degrés, d'où il vient ; 0 = nord), vitesse (km/h) }
 *   options     { circulation: 'coupee' | …, metro: 'ferme' | … } — appliqués par les services
 *               EXT.traffic et EXT.metro quand ils existent
 *
 * Ce module tient lieu de cadre de mission en attendant le vrai : il ne crée AUCUNE foule.
 * ===================================================================================== */

import type { EntityId, PlayableRole } from '@/core/contracts';

export const SESSION_SETUP_SERVICE = 'session.setup';
export const SESSION_SETUP_EVENT = 'session:setup';
/** Même nom que l'événement écouté par l'interface (src/ui/core/api.ts, UI_LOADING_EVENT). */
export const UI_LOADING_EVENT = 'ui:loading';
export const SESSION_SETUP_SYSTEM_ID = 'session.setup';

/** Rayon (m) autour du lieu pour « circulation coupée » et « stations fermées » au départ. */
export const SCENARIO_AREA_RADIUS = 350;

export interface LoadingProgress {
  /** Avancement 0..1. */
  progress: number;
  label: string;
}

export interface SessionSetupSummary {
  /** Personne incarnée (0 si la création a échoué). */
  playerId: EntityId;
  role: PlayableRole;
  /** Point et cap de la mise en place (là où se tient le joueur, face au lieu). */
  x: number;
  z: number;
  heading: number;
  /** Unité du joueur (0 si aucune) et unité de tête quand il y en a une au-dessus (compagnie). */
  squadId: number;
  rootSquadId: number;
  /** Collègues créés autour du joueur (lui non compris). */
  teammates: number;
  /** Véhicules stationnés de l'unité. */
  vehicleIds: EntityId[];
  /** Passants créés. */
  bystanders: number;
  /** Les unités ont été construites par le service 'police.units' (sinon : ctx.squads + archétypes, immobiles). */
  usedPoliceUnits: boolean;
}

export interface SessionSetupApi {
  /** Résumé de la mise en place de la session en cours (null hors session). */
  readonly summary: SessionSetupSummary | null;
  /** Identifiants de toutes les personnes créées par la mise en place (joueur compris). */
  readonly people: readonly EntityId[];
}

/**
 * Ce que ce module utilise du service 'police.units' (src/sim/police, encore en cours d'écriture au moment de
 * l'assemblage) : forme minimale, recopiée pour ne pas dépendre d'un fichier qui change.
 */
export interface PoliceUnitsLike {
  createGroup(options: {
    x: number; z: number; heading: number; type?: 'appui' | 'intervention' | 'commandement'; layout?: 'colonne' | 'ligne' | 'embarque';
    vehicles?: boolean; drivers?: boolean; section?: number;
  }): PoliceUnitHandleLike;
  createSection(options: {
    x: number; z: number; heading: number; layout?: 'colonne' | 'ligne' | 'embarque'; vehicles?: boolean; drivers?: boolean; section?: number;
  }): PoliceUnitHandleLike;
}

export interface PoliceUnitHandleLike {
  squad: { id: number; parentId: number };
  people: { id: EntityId; poste: string | null; isPlayer: boolean }[];
  vehicles: { id: EntityId }[];
  leader: { id: EntityId } | null;
}
