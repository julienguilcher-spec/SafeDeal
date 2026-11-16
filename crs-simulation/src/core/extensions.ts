/* =====================================================================================
 * CRS SIMULATION FRANCE — SERVICES ÉTENDUS (complément de contracts.ts)
 * -------------------------------------------------------------------------------------
 * Interfaces des services publiés par ctx.provide(clé, service) et lus par
 * ctx.service<T>(clé). Types uniquement (aucune exécution hors la table des clés).
 * Un module qui FOURNIT un de ces services l'implémente tel quel ; un module qui le
 * CONSOMME doit fonctionner s'il est absent (ctx.service renvoie undefined).
 * Ce fichier n'est modifié que par l'intégrateur.
 * ===================================================================================== */

import type { EntityId, EntityKind, InputState, Button, ScreenId } from './contracts';

/** Clés des services étendus. */
export const EXT = {
  /** Incidents à traiter (IncidentsApi) — fourni par le module des missions. */
  incidents: 'incidents',
  /** Fermeture de rues à la circulation (TrafficControlApi) — fourni par le module du trafic. */
  traffic: 'traffic.control',
  /** Stations de métro, affluence, fermeture (MetroApi) — fourni par le module de foule. */
  metro: 'crowd.metro',
  /** Appel des secours (RescueApi) — fourni par le module des rôles (secours). */
  rescue: 'rescue.dispatch',
  /** Objectifs affichés (ObjectivesApi) — fourni par le module d'interface, alimenté par les missions. */
  objectives: 'ui.objectives',
  /** Boîte à outils d'interface (UiKit) — fourni par le module d'interface. */
  uiKit: 'ui.kit',
} as const;

// ─────────────────────────────────────────────────────────────────────────────────────
// Incidents : tâches concrètes à déléguer ou à traiter soi-même
// ─────────────────────────────────────────────────────────────────────────────────────

export type IncidentKind =
  | 'feu_poubelle' | 'feu_barricade' | 'feu_vehicule' | 'feu_boutique'
  | 'blesse' | 'agent_a_terre' | 'agent_isole'
  | 'pillage' | 'barricade' | 'automobiliste_bloque' | 'secours_bloques' | 'suspect';

export type IncidentState = 'ouvert' | 'assigne' | 'en_cours' | 'resolu' | 'echoue';

/** Moyen désigné pour traiter un incident. */
export type IncidentMeans = '' | 'unite' | 'joueur' | 'canon_eau' | 'centaure' | 'bravm' | 'pompiers' | 'samu';

export interface Incident {
  readonly id: number;
  kind: IncidentKind;
  /** Libellé court en français (« Feu de poubelles, rue de Rivoli »). */
  label: string;
  x: number;
  z: number;
  /** Entité concernée (personne blessée, objet en feu, vitrine…) ; 'place' et 0 si l'incident est un lieu. */
  targetKind: EntityKind;
  targetId: EntityId;
  /** 1 = à traiter, 2 = urgent, 3 = vital. */
  urgency: 1 | 2 | 3;
  /** Gravité courante 0..1 : monte tant que l'incident n'est pas traité (propagation du feu, état du blessé). */
  severity: number;
  state: IncidentState;
  /** Instant de création (temps de session, s). */
  createdAt: number;
  means: IncidentMeans;
  /** Unité chargée de l'incident (0 si aucune). */
  squadId: number;
  /** Avancement du traitement 0..1. */
  progress: number;
}

export interface IncidentsApi {
  readonly list: readonly Incident[];
  get(id: number): Incident | undefined;
  /** Crée un incident (directeur de mission, modules de simulation). */
  open(kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency?: 1 | 2 | 3): Incident;
  /** Délègue à une unité (squadId) ou à un moyen. Retourne false si impossible (unité inapte, moyen absent). */
  assign(id: number, means: IncidentMeans, squadId?: number): boolean;
  /** Retire l'affectation. */
  unassign(id: number): void;
  /** Clôt l'incident (réussi ou non). */
  close(id: number, resolved: boolean, byId: EntityId): void;
  /** Incident ouvert le plus proche (pour le joueur exécutant ou une IA). */
  nearest(x: number, z: number, radius: number, kind?: IncidentKind): Incident | null;
  /** Incident actuellement confié au joueur (0 si aucun). */
  readonly playerIncidentId: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Circulation : couper et rouvrir des rues
// ─────────────────────────────────────────────────────────────────────────────────────

export interface RoadClosure {
  readonly id: number;
  /** Arête du graphe routier fermée. */
  edgeId: number;
  /** Point de barrage (milieu de la fermeture) et cap de la rue. */
  x: number;
  z: number;
  heading: number;
  /** Unité qui tient le barrage (0 = barrières seules). */
  squadId: number;
  createdAt: number;
}

export interface TrafficControlApi {
  readonly closures: readonly RoadClosure[];
  isClosed(edgeId: number): boolean;
  /** Ferme une rue à la circulation (au point le plus proche de x, z). */
  closeRoad(x: number, z: number, byId: EntityId, squadId?: number): RoadClosure | null;
  /** Ferme toutes les rues entrant dans un périmètre. */
  closeArea(x: number, z: number, radius: number, byId: EntityId): RoadClosure[];
  open(closureId: number): void;
  openAll(): void;
  /** Nombre de véhicules civils en circulation et à l'arrêt dans un rayon (pour l'interface). */
  countNear(x: number, z: number, radius: number): { moving: number; stopped: number };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Métro : affluence et fermeture de stations
// ─────────────────────────────────────────────────────────────────────────────────────

export interface MetroStation {
  readonly id: number;
  name: string;
  /** Bouche principale. */
  x: number;
  z: number;
  /** Toutes les bouches [x0, z0, x1, z1, …]. */
  entrances: readonly number[];
  open: boolean;
  /** Sortie filtrée par une unité (contrôles : ralentit l'arrivée, fait monter la tension). */
  filtered: boolean;
  /** Arrivées courantes (personnes par minute). */
  inflow: number;
  /** Personnes sorties depuis le début de la session. */
  arrived: number;
}

export interface MetroApi {
  readonly stations: readonly MetroStation[];
  get(id: number): MetroStation | undefined;
  nearest(x: number, z: number, radius: number): MetroStation | null;
  /** Demande de fermeture ou de réouverture par le commandement. */
  setOpen(id: number, open: boolean, byId: EntityId): void;
  setFiltered(id: number, filtered: boolean, squadId: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Secours : appeler les pompiers ou le SAMU
// ─────────────────────────────────────────────────────────────────────────────────────

export type RescueKind = 'pompiers' | 'samu';
export type RescueState = 'demande' | 'en_route' | 'en_attente' | 'sur_place' | 'reparti' | 'annule';

export interface RescueCall {
  readonly id: number;
  kind: RescueKind;
  x: number;
  z: number;
  incidentId: number;
  state: RescueState;
  /** Temps restant estimé avant l'arrivée (s). */
  eta: number;
  vehicleId: EntityId;
  /** Motif d'attente en français (« zone non sécurisée », « rue bloquée par une barricade »). */
  waitingReason: string;
}

export interface RescueApi {
  readonly calls: readonly RescueCall[];
  /** Demande des secours en un point ; lie l'appel à un incident s'il est fourni. */
  request(kind: RescueKind, x: number, z: number, byId: EntityId, incidentId?: number): RescueCall;
  cancel(callId: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Objectifs affichés
// ─────────────────────────────────────────────────────────────────────────────────────

export type ObjectiveState = 'actif' | 'reussi' | 'echoue';

export interface Objective {
  id: string;
  text: string;
  state: ObjectiveState;
  secondary: boolean;
  /** Position de l'objectif s'il est localisé (marqueur, GPS). */
  x?: number;
  z?: number;
  /** Avancement 0..1 s'il y a lieu. */
  progress?: number;
}

export interface ObjectivesApi {
  readonly list: readonly Objective[];
  set(list: Objective[]): void;
  upsert(objective: Objective): void;
  remove(id: string): void;
  clear(): void;
  /** Objectif suivi par le GPS (id) ou ''. */
  tracked: string;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Boîte à outils d'interface
// ─────────────────────────────────────────────────────────────────────────────────────

export type HudSlot =
  | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'center';

export interface ScreenInstance {
  /** Appelé à chaque image tant que l'écran est ouvert. */
  update?(dt: number, input: InputState): void;
  /** Retour arrière (Échap, bouton B) : retourner true si l'écran a géré l'action lui-même. */
  back?(): boolean;
  dispose(): void;
}

export interface ScreenOptions {
  /** Écran bloquant : le personnage n'est plus commandé (ctx.ui.modal). */
  modal: boolean;
  /** Met la simulation en pause tant qu'il est ouvert. */
  pauses: boolean;
  /** Masque le HUD. */
  hidesHud?: boolean;
}

export interface HudWidget {
  update?(dt: number): void;
  dispose(): void;
}

export interface UiKit {
  /** Conteneur racine de l'interface (#ui). */
  readonly root: HTMLElement;
  /** Enregistre un écran ouvrable par ctx.ui.open(id, data). */
  registerScreen(id: ScreenId, create: (host: HTMLElement, data: unknown) => ScreenInstance, options: ScreenOptions): void;
  hasScreen(id: ScreenId): boolean;
  /** Ajoute un élément au HUD dans une zone donnée. */
  addHudWidget(id: string, slot: HudSlot, create: (host: HTMLElement) => HudWidget): void;
  removeHudWidget(id: string): void;
  /** Crée un élément avec classe et texte. */
  h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K];
  /** Bouton stylé, utilisable à la souris, au doigt et à la manette. */
  button(label: string, onClick: () => void, variant?: 'primary' | 'secondary' | 'danger' | 'ghost'): HTMLButtonElement;
  /** Active la navigation au clavier et à la manette entre les éléments focalisables d'un conteneur. */
  focusGroup(container: HTMLElement): { dispose(): void };
  /** Libellé de la touche ou du bouton courant pour une action (« E », « X », « Interagir »). */
  keyLabel(button: Button): string;
}
