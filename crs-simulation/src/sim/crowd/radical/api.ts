/* =====================================================================================
 * GROUPES RADICAUX — types publics (à importer en `import type` depuis les autres modules).
 *
 * Le sous-module src/sim/crowd/radical pilote les manifestants de profil `radical`, `opportuniste` et
 * `pilleur` par les contrôleurs de comportement du cœur de la foule. Il est branché d'office par
 * `createSystems` de '@/sim/crowd' (système 'sim:crowd.radical', juste après le contrôle de la foule).
 *
 * Services publiés :
 *   ctx.service<SignalsApi>(CROWD_SIGNALS)   'crowd.signals'  signes avant-coureurs observables
 *   ctx.service<RadicalApi>(CROWD_RADICAL)   'crowd.radical'  groupes, bloc, chaleur, réglages d'essai
 *
 * Événements libres (ctx.events.onAny) :
 *   'crowd:signal'    SignalEvent      un signe avant-coureur apparaît ou disparaît
 *   'crowd:bloc'      BlocEvent        le bloc change de phase (formation, action, repli, fusion…)
 *   'crowd:radical'   RadicalEvent     fait marquant d'un groupe (salve, barricade, libération, pillage…)
 *
 * Clés lues dans SessionConfig.extra (toutes facultatives) :
 *   radical.none       boolean   aucun pilotage des radicaux (ils restent des militants agités)
 *   radical.actAt      number    instant (s de session) du premier passage à l'acte, au lieu du calcul
 *   radical.lead       number    multiplicateur de l'avance des signes avant-coureurs (défaut 1)
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';

export const CROWD_SIGNALS = 'crowd.signals';
export const CROWD_RADICAL = 'crowd.radical';
export const RADICAL_SYSTEM = 'sim:crowd.radical';

export const SIGNAL_EVENT = 'crowd:signal';
export const BLOC_EVENT = 'crowd:bloc';
export const RADICAL_EVENT = 'crowd:radical';

// ───────────────────────────── signes avant-coureurs ─────────────────────────────

/** Nature d'un signe avant-coureur (dossier 03 §3.2), du plus précoce au plus tardif. */
export type SignalType =
  /** Des groupes quittent leur place et se rassemblent en tête de cortège. */
  | 'regroupement'
  /** Capuches relevées, foulards et masques mis. */
  | 'visages_couverts'
  /** Signal de ralliement : fumigène noir, parapluie levé. */
  | 'signal_ralliement'
  /** Des personnes se changent en noir, à l'abri des parapluies. */
  | 'changement_tenue'
  /** Parapluies ouverts face aux caméras, banderole renforcée déployée en tête. */
  | 'parapluies'
  /** Chaussée dépavée, pavés pris sur un tas de chantier. */
  | 'depavage'
  /** Bouteilles et débris ramassés (terrasses, conteneurs à verre, grilles de chantier). */
  | 'collecte'
  /** Poubelles, barrières, vélos tirés en travers de la chaussée. */
  | 'mobilier_deplace';

export interface CrowdSignal {
  readonly id: number;
  type: SignalType;
  /** Libellé français affichable (« Des personnes se changent en noir »). */
  label: string;
  /** Lieu (barycentre des personnes concernées, tenu à jour). */
  x: number;
  z: number;
  /** Heure d'apparition (temps de session, s) et de disparition (Infinity tant que le signe dure). */
  t: number;
  until: number;
  /** Groupe d'affinité (RadicalGroupView.id), unité ctx.squads correspondante. */
  groupId: number;
  squadId: number;
  /** Personnes concernées à cet instant. */
  count: number;
  /** Le signe est encore observable. */
  active: boolean;
}

export interface SignalsApi {
  /** Tous les signes de la session, dans l'ordre d'apparition (les signes terminés restent listés). */
  readonly list: readonly CrowdSignal[];
  /** Signes encore observables. */
  readonly activeCount: number;
  /** Signes observables dans un rayon (pour le drone, la carte, un agent à pied). Écrit dans `out`. */
  near(x: number, z: number, radius: number, out: CrowdSignal[]): number;
}

export interface SignalEvent {
  signal: CrowdSignal;
  stage: 'debut' | 'fin';
}

// ───────────────────────────── bloc et groupes ─────────────────────────────

export type BlocPhase =
  /** Rien : les radicaux marchent dans le cortège de tête. */
  | 'dormant'
  /** Signes avant-coureurs en cours : regroupement, visages couverts. */
  | 'signes'
  /** Signal donné : changement de tenue, parapluies, banderole, munitions. */
  | 'formation'
  /** Actions coordonnées. */
  | 'action'
  /** Repli : recul groupé ou dispersion par les rues adjacentes. */
  | 'repli'
  /** Regroupement plus loin, manifestation sauvage. */
  | 'sauvage'
  /** Changés de nouveau et fondus dans la foule. */
  | 'fondu';

export type GroupPlan =
  | 'suivre' | 'rallier' | 'preparer' | 'salve' | 'assaut' | 'liberer' | 'barricade' | 'casse' | 'incendie'
  | 'renverser' | 'ravitailler' | 'recul' | 'dispersion' | 'regroupement' | 'fusion';

export interface RadicalGroupView {
  readonly id: number;
  /** Unité ctx.squads de type 'affinite'. */
  readonly squadId: number;
  readonly name: string;
  readonly leaderId: EntityId;
  /** Membres valides (ni à terre ni interpellés) / effectif d'origine. */
  readonly size: number;
  readonly strength: number;
  readonly followers: number;
  readonly morale: number;
  readonly cohesion: number;
  readonly plan: GroupPlan;
  /** Point du groupe et direction de l'axe d'action. */
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  /** Projectiles à lancer détenus par le groupe (pavés, bouteilles). */
  readonly ammo: number;
  /** Tous en noir. */
  readonly inBlack: boolean;
  /** Rapport de force estimé à la dernière réflexion (> 1 : favorable au groupe). */
  readonly ratio: number;
}

export interface BlocEvent {
  phase: BlocPhase;
  previous: BlocPhase;
  x: number;
  z: number;
  /** Radicaux valides. */
  strength: number;
}

export type RadicalFact =
  | 'salve' | 'mortier' | 'engin_incendiaire' | 'assaut' | 'liberation_tentee' | 'liberation_reussie' | 'grenade_renvoyee'
  | 'barricade_commencee' | 'barricade_incendiee' | 'vitrine_attaquee' | 'rideau_force' | 'tag' | 'vehicule_incendie'
  | 'vehicule_renverse' | 'pillage' | 'repli' | 'dispersion' | 'regroupement' | 'fusion' | 'ravitaillement';

export interface RadicalEvent {
  fact: RadicalFact;
  groupId: number;
  x: number;
  z: number;
  /** Personnes engagées, ou identifiant de la cible selon le fait. */
  count: number;
  targetId: EntityId;
}

/** Compteurs de session (rapport de fin, essais). */
export interface RadicalStats {
  volleys: number;
  thrown: number;
  mortars: number;
  molotovs: number;
  returned: number;
  windowsAttacked: number;
  looted: number;
  barricades: number;
  barricadesLit: number;
  vehiclesLit: number;
  vehiclesFlipped: number;
  rescuesTried: number;
  rescuesDone: number;
  retreats: number;
  scatters: number;
  melts: number;
  /** Projectiles pris dans la rue (pavés, bouteilles) depuis le début. */
  collected: number;
  /** Instant du premier signe et de la première violence (−1 : pas encore). */
  firstSignAt: number;
  firstViolenceAt: number;
}

export interface RadicalApi {
  /** Le sous-module pilote des radicaux dans cette session. */
  readonly active: boolean;
  /** Intensité 0..1 : produit de la tension et de la propension à dégénérer (0 à volatilité nulle). */
  readonly heat: number;
  readonly phase: BlocPhase;
  /** Instant prévu du passage à l'acte (Infinity si rien n'est prévu). */
  readonly actAt: number;
  readonly groups: readonly RadicalGroupView[];
  readonly stats: Readonly<RadicalStats>;
  /** Groupe d'affinité d'une personne (null si aucune). */
  groupOf(personId: EntityId): RadicalGroupView | null;
  /** Avance ou retarde le passage à l'acte (missions, essais) : les signes avant-coureurs le précèdent toujours. */
  scheduleAction(at: number): void;
  /** Ordonne le repli général maintenant (mission scriptée, essais). */
  orderRetreat(): void;
}
