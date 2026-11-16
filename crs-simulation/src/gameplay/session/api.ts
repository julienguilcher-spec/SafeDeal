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
 *   moyens      { sections, fourgons, centaure, canon_eau, bravm, drone } (rubrique « Moyens engagés » de la page
 *               d'accueil) : quand le service 'police.units' est branché et qu'une manifestation se tient (ou que
 *               le joueur est commandant), la mise en place crée la compagnie (1 à 8 sections, fourgons : un par
 *               groupe dans la limite demandée) et les moyens d'appui ; le joueur CRS, chef de groupe ou de section,
 *               ou commandant y tient son poste. Sans cette clé : une section. Sans manifestation (patrouille libre) :
 *               le seul groupe (ou la section) du joueur.
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
  /** Moyens réellement engagés au départ (ce qui a pu être créé et placé). */
  means: EngagedMeans;
  /** L'emplacement a été choisi à l'écart d'une manifestation (hors du rassemblement et du parcours). */
  offCrowd: boolean;
}

/** Moyens des forces de l'ordre présents au début de la session. */
export interface EngagedMeans {
  /** Agents à pied ou à bord (joueur compris). */
  agents: number;
  sections: number;
  fourgons: number;
  centaure: number;
  canon_eau: number;
  /** Groupes de BRAV-M (six motos). */
  bravm: number;
  drone: number;
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
    parentId?: number; callsign?: string;
  }): PoliceUnitHandleLike;
  createCompany?(options: {
    x: number; z: number; heading: number; sections?: number; layout?: 'colonne' | 'ligne' | 'embarque'; vehicles?: boolean; drivers?: boolean;
  }): PoliceUnitHandleLike;
  createBravm?(binomes: number, options: { x: number; z: number; heading: number; vehicles?: boolean; mounted?: boolean; callsign?: string }): PoliceUnitHandleLike;
  createEquipage?(kind: 'centaure' | 'canon_eau', options: { x: number; z: number; heading: number; parentId?: number }): PoliceUnitHandleLike;
}

/** Ce que ce module utilise du service 'police.command' (équipe du drone). */
export interface PoliceCommandLike {
  createDroneTeam?(options: { x: number; z: number; heading: number; parentId?: number }): PoliceUnitHandleLike;
}

export interface PoliceSquadLike { id: number; parentId: number; leaderId?: EntityId; vehicleId?: EntityId; name?: string }

export interface PoliceUnitHandleLike {
  squad: PoliceSquadLike;
  sections?: PoliceSquadLike[];
  groups?: PoliceSquadLike[];
  people: { id: EntityId; poste: string | null; isPlayer: boolean; squadId?: number }[];
  vehicles: { id: EntityId }[];
  leader: { id: EntityId } | null;
}
