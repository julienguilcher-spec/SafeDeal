/* =====================================================================================
 * FORCES DE L'ORDRE — types publics du module src/sim/police (à importer en `import type`).
 *
 * Le module EXÉCUTE les ordres donnés par ctx.squads.issue() : unités, formations, emploi gradué
 * de la force, interpellations, logistique. Il ne décide pas de la manœuvre d'ensemble : c'est le
 * rôle du joueur gradé ou du commandement automatique (src/sim/police/command/).
 *
 * SERVICES PUBLIÉS (ctx.service<T>(clé))
 *   'police.units'      PoliceUnitsApi      construction des unités (compagnie, section, groupe, BRAV-M,
 *                                           peloton, équipages), encerclement à plusieurs, racine de formation
 *   'police.status'     PoliceStatusApi     état d'une unité pour l'interface et le commandement
 *   'police.slot'       PoliceSlotApi       emplacement réservé à une personne (le joueur équipier)
 *   'police.formation'  PoliceFormationApi  géométrie et erreur d'alignement mesurée des formations
 *   'police.tuning'     PoliceTuning        réglages modifiables (remis à leurs valeurs à chaque session)
 *
 * ── POINT D'EXTENSION : COMMANDER DES UNITÉS (commandement automatique, missions, interface) ──
 *   1. Créer :   const cie = ctx.require<PoliceUnitsApi>('police.units').createCompany({ x, z, heading });
 *      (ou construire soi-même des unités avec ctx.squads.create / addMember : toute unité de faction
 *      « police » est prise en charge, quelle que soit son origine).
 *   2. Ordonner : ctx.squads.issue(squadId, { type, x, z, heading, width, targetId, maxForce }).
 *      L'ordre donné à une unité vaut pour toute sa descendance (sections, groupes) : elle manœuvre
 *      d'un bloc. Un ordre donné ensuite à une unité subordonnée l'en détache, jusqu'au prochain ordre
 *      de formation donné à l'échelon supérieur. Les ordres de TÂCHE (interpeller, eteindre, secourir,
 *      ravitailler, degager_barricade, disperser_gaz) ne changent pas la formation : seuls les
 *      spécialistes sortent du rang, pris dans l'unité qui a reçu l'ordre.
 *   3. Lire :    ctx.service<PoliceStatusApi>('police.status').of(squadId) → effectifs, munitions,
 *      fatigue, moral, phase (« mise_en_place », « en_place », « mouvement », « termine »…).
 *      Événements libres : 'police:order_done', 'police:order_refused', 'police:in_place', 'police:relief_requested'…
 *   4. Équipage : createEquipage('centaure' | 'canon_eau' | …) assoit l'équipage à bord et renvoie
 *      l'unité (Squad.vehicleId). Les ordres avancer / colonne / repli / suivre / tenir / cesser
 *      conduisent l'engin par ctx.service('vehicles.autopilot') ; tourelles, jets et salves restent
 *      à piloter par ctx.service('vehicles.ext') (aimTurretAt, setSalvo, ctx.vehicles.fireTurret).
 *
 * ── CONVENTIONS DES CHAMPS DE SquadOrder, PAR TYPE D'ORDRE ──
 *   ligne               x, z = milieu ; heading = face ; width = front (0 : largeur réelle de la rue, ou effectif)
 *   tenir               tient la formation en place ; hors formation : ligne au point donné
 *   colonne             x, z = point à rejoindre par les rues ; width ≥ 1,6 : par trois, sinon par deux
 *   tortue              sur place (ou au point donné s'il est à plus de 12 m), face heading
 *   avancer             x, z = point à atteindre ; heading = cap à l'arrivée ; la formation en cours avance d'un bloc
 *   bond_offensif       x, z = limite (bornée à 15–25 m) ; arrêt net et réalignement
 *   charge              x, z = limite (bornée à 30–60 m) ; sifflet, arrêt, repli au pas sur la ligne de départ
 *   refoulement         x, z = limite ; vague au pas par tronçons de 50 m
 *   repli               x, z = position de repli ; heading = face conservée (vers la foule)
 *   encercler           x, z = centre ; width = DIAMÈTRE de la zone ; heading = direction de l'issue à laisser
 *                       ouverte ; targetId = ENCIRCLE_CLOSE_ALL (−1) pour fermer toutes les issues.
 *                       Plusieurs unités recevant le même ordre se partagent les issues.
 *   disperser_gaz       x, z = zone à traiter (lacrymogènes à main ≤ 30 m, au lanceur au-delà)
 *   interpeller         targetId = personne ; sinon l'auteur d'un fait constaté le plus proche de x, z
 *   proteger            targetId = personne ou véhicule (sinon le point x, z) ; heading = côté menacé
 *   escorter            targetId = personne ou véhicule à encadrer en marche
 *   suivre              targetId = personne ou véhicule (0 : celui qui a donné l'ordre, issuedBy)
 *   embarquer/debarquer véhicules de l'unité (Squad.vehicleId), à défaut véhicules de police proches
 *   degager_barricade   targetId = objet du décor (sinon la barricade la plus proche de x, z)
 *   eteindre            targetId = objet, véhicule ou personne en feu (sinon la nappe de feu en x, z)
 *   secourir            targetId = personne à terre (sinon le blessé le plus proche de x, z)
 *   releve              targetId = un membre de l'unité à relever, ou son numéro d'unité (sinon la ligne la plus proche de x, z)
 *   ravitailler         targetId = véhicule (sinon le fourgon de l'unité, puis le plus proche)
 *   couper_circulation  x, z = point de la voie à barrer ; filtrer : idem avec une porte de passage
 *                       Barrage de rue (couper_circulation, tenir, ligne, avancer sur une rue) : targetId =
 *                       BARRAGE_LET_PASSERSBY (−2) pour laisser passer les passants (manifestants et véhicules
 *                       restent bloqués) ; 0 : personne ne passe. Redonné à l'unité en place, l'ordre ne change que
 *                       cette option (l'unité ne bouge pas).
 *   cesser              arrête la manœuvre et les tâches en cours, sur place ; libre : initiative rendue
 * ===================================================================================== */

import type {
  EntityId, ForceLevel, OrderType, Person, PersonKind, Squad, Vehicle, VehicleKind,
} from '@/core/contracts';

export const POLICE_UNITS_SERVICE = 'police.units';
export const POLICE_STATUS_SERVICE = 'police.status';
export const POLICE_SLOT_SERVICE = 'police.slot';
export const POLICE_FORMATION_SERVICE = 'police.formation';
export const POLICE_TUNING_SERVICE = 'police.tuning';
/** Service PRIVÉ du module (noyau partagé avec src/sim/police/command) : les autres modules ne l'utilisent pas. */
export const POLICE_KERNEL_SERVICE = 'police.internal';
export const POLICE_SYSTEM_ID = 'police.ai';
/** Ravitaillement du joueur (PlayerSupplyApi) : indication à l'écran, demande de ravitaillement à la logistique. */
export const PLAYER_SUPPLY_SERVICE = 'session.supply';


/** Valeur de SquadOrder.targetId pour « encercler » : fermer toutes les issues (aucune laissée ouverte). */
export const ENCIRCLE_CLOSE_ALL: EntityId = -1;
/**
 * Valeur de SquadOrder.targetId pour un ordre qui finit en barrage de rue (couper_circulation, tenir, ligne, avancer sur
 * une rue) : « Passants : laissés passer ». Les passants à pied (badauds, piétons, riverains, journalistes, street
 * medics) franchissent la ligne dans les deux sens ; les manifestants (même dispersés) et tous les véhicules restent
 * bloqués. 0 (défaut) : « Passants : bloqués », personne ne passe.
 */
export const BARRAGE_LET_PASSERSBY: EntityId = -2;

// ── événements libres (ctx.events.onAny) ──
/** { squadId, type, ok, reason } : manœuvre ou tâche terminée (ok = false : abandonnée, motif en français). */
export const ORDER_DONE_EVENT = 'police:order_done';
/** { squadId, type, reason } : ordre refusé (moyen de force non licite ou non autorisé). */
export const ORDER_REFUSED_EVENT = 'police:order_refused';
/** { squadId, fatigue, valid, total } : l'unité demande à être relevée. */
export const RELIEF_REQUESTED_EVENT = 'police:relief_requested';
/** { squadId, x, z } : formation en place (alignée). */
export const IN_PLACE_EVENT = 'police:in_place';
/** { squadId, exits, held, open } : dispositif d'encerclement en place. */
export const ENCIRCLED_EVENT = 'police:encircled';
/** { squadId, targetId, byId, stage } : étape d'une interpellation menée par l'IA. */
export const ARREST_EVENT = 'police:arrest';
/** { squadId, personId, x, z } : un agent de l'unité est à terre. */
export const OFFICER_DOWN_EVENT = 'police:officer_down';
/** { squadId, means, x, z, byId } : l'unité vient d'employer un moyen de force (compte rendu). */
export const FORCE_USED_EVENT = 'police:force_used';

export interface PoliceOrderDone { squadId: number; type: OrderType; ok: boolean; reason: string }

// ───────────────────────────── construction des unités ─────────────────────────────

export interface UnitPlacement {
  /** Point de mise en place (centre du premier rang) et cap. Défaut : point de départ de la session, cap 0. */
  x?: number;
  z?: number;
  heading?: number;
}

export interface CompanyOptions extends UnitPlacement {
  /** Indicatif radio de la compagnie (défaut : « MISTRAL », puis TRAMONTANE, SIROCCO, ZÉPHYR). */
  callsign?: string;
  /** Nombre de sections (1 à 4, défaut 4). */
  sections?: number;
  /** Fourgons (un par groupe), véhicule de commandement et fourgon cellulaire. Défaut true. */
  vehicles?: boolean;
  /** Conducteurs restés aux véhicules (défaut : comme `vehicles`). */
  drivers?: boolean;
  /** Le commandant porte l'écharpe : commandant unique, autorité habilitée (défaut true). */
  authority?: boolean;
  /** Numéro de compagnie (fictif) inscrit sur les tenues. */
  company?: number;
  /** Disposition de départ : 'colonne' (par trois, défaut), 'ligne', ou 'embarque' (à bord des fourgons). */
  layout?: 'colonne' | 'ligne' | 'embarque';
  /** Graine d'apparence (défaut : tirée du générateur de la session). */
  seed?: number;
}

export interface SectionOptions extends UnitPlacement {
  callsign?: string;
  /** Numéro de section (1 à 4). */
  section?: number;
  vehicles?: boolean;
  drivers?: boolean;
  /** Unité de rattachement (compagnie). */
  parentId?: number;
  company?: number;
  layout?: 'colonne' | 'ligne' | 'embarque';
  seed?: number;
}

export type GroupType = 'appui' | 'intervention' | 'commandement';

export interface GroupOptions extends SectionOptions {
  type?: GroupType;
}

export interface BravmOptions extends UnitPlacement {
  callsign?: string;
  /** Motos (une par binôme). Défaut true. */
  vehicles?: boolean;
  /** true : en selle ; false (défaut) : à pied à côté des machines. */
  mounted?: boolean;
  seed?: number;
}

export interface PelotonOptions extends UnitPlacement {
  callsign?: string;
  /** Numéro de peloton (1 à 4). */
  peloton?: number;
  vehicles?: boolean;
  drivers?: boolean;
  parentId?: number;
  layout?: 'colonne' | 'ligne' | 'embarque';
  seed?: number;
}

export type CrewKind = 'centaure' | 'canon_eau' | 'fourgon_crs' | 'vl_commandement' | 'voiture_police' | 'fourgon_cellulaire';

export interface CrewOptions extends UnitPlacement {
  callsign?: string;
  parentId?: number;
  seed?: number;
}

/** Ce qu'une fonction de construction a créé. */
export interface UnitHandle {
  /** Unité de tête (compagnie, section, groupe, peloton, équipage…). */
  squad: Squad;
  /** Sections (ou pelotons) créées, dans l'ordre. */
  sections: Squad[];
  /** Groupes tactiques (ou binômes) créés, dans l'ordre. */
  groups: Squad[];
  people: Person[];
  vehicles: Vehicle[];
  /** Chef de l'unité de tête (le commandant unique pour une compagnie). */
  leader: Person | null;
}

export interface PoliceUnitsApi {
  /** Compagnie de CRS : commandement de 6 + 4 sections de 16 (groupes A, B, C), indicatifs, véhicules. */
  createCompany(options?: CompanyOptions): UnitHandle;
  /** Section de 16 : groupe A (appui), B (intervention), C (commandement). */
  createSection(options?: SectionOptions): UnitHandle;
  /** Groupe tactique isolé de 6 (ou 4 pour le commandement). */
  createGroup(options?: GroupOptions): UnitHandle;
  /** BRAV-M : `binomes` motos, un pilote et un opérateur chacune (groupes de 6 motos). */
  createBravm(binomes: number, options?: BravmOptions): UnitHandle;
  /** Peloton de gendarmes mobiles (16 militaires en deux groupes). */
  createPeloton(options?: PelotonOptions): UnitHandle;
  /** Équipage d'un engin, créé à bord. */
  createEquipage(kind: CrewKind, options?: CrewOptions): UnitHandle;
  /**
   * Encerclement d'une zone par plusieurs unités qui se partagent les issues. `openExitHeading` omis :
   * toutes les issues sont fermées ; fourni : l'issue située dans cette direction reste ouverte.
   */
  encircle(squadIds: readonly number[], x: number, z: number, radius: number, openExitHeading?: number, maxForce?: ForceLevel): void;
  /** Numéro de l'unité qui dirige actuellement la formation de cette unité (elle-même si elle manœuvre seule). */
  rootOf(squadId: number): number;
  /** Tous les agents de l'unité et de sa descendance ; retourne leur nombre (out tronqué). */
  members(squadId: number, out: Person[]): number;
  /** Réserve de munitions d'un véhicule (créée à la demande d'après son type). */
  reserveOf(vehicleId: EntityId): VehicleReserve | null;
  /** Réapprovisionne la réserve d'un véhicule à sa dotation complète. */
  refillReserve(vehicleId: EntityId): void;
}

// ───────────────────────────── état des unités ─────────────────────────────

/** Avancement de l'ordre en cours. */
export type UnitPhase =
  | 'repos' | 'mise_en_place' | 'en_place' | 'mouvement' | 'action' | 'termine' | 'refuse' | 'embarque';

export type FormationName = 'aucune' | 'ligne' | 'colonne' | 'tortue' | 'ecran' | 'encerclement' | 'escorte' | 'libre';

export interface AmmoCount {
  /** Grenades lacrymogènes à main. */
  lacrymoMain: number;
  /** Grenades lacrymogènes au lanceur de 56 mm. */
  lacrymoLanceur: number;
  /** Grenades assourdissantes-lacrymogènes. */
  gm2l: number;
  /** Munitions de LBD. */
  lbd: number;
  /** Grenades de désencerclement. */
  desencerclement: number;
  /** Secondes de jet d'extincteur. */
  extincteur: number;
  /** Jets d'aérosol. */
  gazeuse: number;
  /** Paires de menottes et liens. */
  menottes: number;
}

export interface VehicleReserve extends AmmoCount {
  vehicleId: EntityId;
}

export interface UnitStatus {
  squadId: number;
  name: string;
  /** Effectif total, valides (debout, libres, à pied ou à bord), blessés (légers compris), à terre ou hors de combat. */
  total: number;
  valid: number;
  injured: number;
  down: number;
  /** Agents détachés pour une tâche (interpellation, extinction, secours, ravitaillement). */
  detached: number;
  /** Agents à bord d'un véhicule. */
  embarked: number;
  ammo: AmmoCount;
  /** Réserve cumulée des véhicules de l'unité. */
  reserve: AmmoCount;
  /** 0 (fraîche) … 1 (épuisée). */
  fatigue: number;
  /** 0..1 (Squad.morale). */
  morale: number;
  /** Souffle moyen des agents valides 0..100. */
  stamina: number;
  order: OrderType;
  phase: UnitPhase;
  formation: FormationName;
  /** Écart maximal du premier rang à sa ligne idéale (m) ; 0 hors formation alignée. */
  alignError: number;
  /** L'unité a demandé sa relève (fatigue ≥ seuil ou moins de 60 % de valides). */
  needsRelief: boolean;
  /** Violences récentes contre l'unité. */
  underAttack: boolean;
  /** Niveau de force que l'unité s'autorise à cet instant (ordre, cadre légal, riposte). */
  forceCap: ForceLevel;
  /** Centre et cap de la formation (ou barycentre de l'unité). */
  x: number;
  z: number;
  heading: number;
  /** Personnes interpellées remises par l'unité depuis le début de la session. */
  arrests: number;
  /** Numéro de l'unité qui dirige sa formation. */
  rootId: number;
}

export interface PoliceStatusApi {
  /** État d'une unité (objet réutilisé par unité : le lire, ne pas le conserver). null si inconnue ou non policière. */
  of(squadId: number): UnitStatus | null;
}

// ───────────────────────────── emplacement réservé, formations ─────────────────────────────

export interface SlotInfo { x: number; z: number; heading: number }

export interface PoliceSlotApi {
  /** Emplacement de cette personne dans la formation de son unité (objet réutilisé), ou null. */
  slotOf(personId: EntityId): SlotInfo | null;
  /** Distance de la personne à son emplacement (m) ; −1 si elle n'en a pas. */
  distanceToSlot(personId: EntityId): number;
}

export interface FormationInfo {
  formation: FormationName;
  /** Repère de la formation : milieu du premier rang, cap, front. */
  x: number;
  z: number;
  heading: number;
  width: number;
  /** Intervalle entre deux agents du premier rang (m). */
  spacing: number;
  /** Identifiants des agents du premier rang, de la gauche vers la droite. */
  front: EntityId[];
  /** Écart maximal et quadratique moyen des agents du premier rang à leur emplacement (m). */
  slotErrorMax: number;
  slotErrorRms: number;
  /** Écart maximal de TOUS les agents du bloc à leur emplacement (m) : cohésion d'une colonne. */
  slotErrorAll: number;
  /** Écart maximal du premier rang à la droite ajustée sur ses agents (m) : rectitude réelle de la ligne. */
  lineError: number;
  /** La formation se déplace. */
  moving: boolean;
  /** Nombre de blocs (issues tenues pour un encerclement). */
  blocks: number;
}

export interface ExitInfo {
  x: number;
  z: number;
  /** Direction de l'issue vue du centre. */
  bearing: number;
  width: number;
  /** Tenue par une ligne, ou laissée ouverte. */
  held: boolean;
  /** Agents affectés. */
  agents: number;
  name: string;
  /** Voie du graphe routier franchie (−1 : passage piéton sans rue — trottoir, esplanade). */
  edgeId?: number;
}

// ───────────────────────────── barrages de rue et nasses (service 'police.barrages') ─────────────────────────────

export const POLICE_BARRAGES_SERVICE = 'police.barrages';
/** Événement libre : { squadId, state, x, z } — un barrage change d'état. */
export const BARRAGE_EVENT = 'police:barrage';
/** Événement libre : { id, closed, inside, x, z, radius } — une nasse se ferme ou se rouvre. */
export const KETTLE_EVENT = 'police:kettle';

export type BarrageState = 'en_route' | 'en_place' | 'incomplet' | 'rompu';

/** Une unité qui barre (ou va barrer) une rue de façade à façade. */
export interface BarrageView {
  squadId: number;
  x: number;
  z: number;
  heading: number;
  /** Largeur totale à barrer, de façade à façade (m). */
  width: number;
  /** Part réellement tenue, 0..1. */
  covered: number;
  state: BarrageState;
  street: string;
  edgeId: number;
  mode: 'ferme' | 'filtrant';
  /** Passants laissés passer (ordre donné avec BARRAGE_LET_PASSERSBY) ; false : personne ne passe. */
  passersby: boolean;
}

/** Une issue d'une zone : rue ou passage piéton. */
export interface ExitView {
  x: number;
  z: number;
  heading: number;
  width: number;
  street: string;
  /** −1 pour un passage piéton sans rue. */
  edgeId: number;
  held: boolean;
  /** Unité qui la tient (0 si personne). */
  squadId: number;
  mode: 'ouvert' | 'ferme' | 'filtrant';
}

/** Une foule dont toutes les issues sont tenues (ou qui est en passe de l'être). */
export interface KettleView {
  id: number;
  x: number;
  z: number;
  radius: number;
  exits: readonly ExitView[];
  closed: boolean;
  inside: number;
  place: string;
}

export interface BarragesApi {
  readonly list: readonly BarrageView[];
  readonly kettles: readonly KettleView[];
  exitsAround(x: number, z: number, r: number): readonly ExitView[];
}

export interface PoliceFormationApi {
  /**
   * Géométrie et alignement mesuré de la formation dirigée par cette unité (objet réutilisé), ou null.
   * `block` : numéro du bloc pour un dispositif à plusieurs blocs (encerclement : un par issue tenue).
   */
  of(squadId: number, block?: number): FormationInfo | null;
  /** Issues du dernier encerclement mené par cette unité (tableau réutilisé). */
  exits(squadId: number): readonly ExitInfo[];
}

// ───────────────────────────── réglages ─────────────────────────────

export interface PoliceTuning {
  /** Intervalle visé entre deux boucliers du premier rang (m). */
  shieldSpacing: number;
  /** Distance du second rang (m). */
  secondRank: number;
  /**
   * Allures (m/s) : pas cadencé (au contact), pas soutenu (routine hors contact), trot (colonne vers un point
   * éloigné, bond offensif), course (mouvement urgent), charge, tortue, repli face à la foule.
   */
  pace: number;
  march: number;
  trot: number;
  run: number;
  charge: number;
  tortue: number;
  repli: number;
  /** Interpellations d'initiative sur flagrant délit à portée. */
  autoArrest: boolean;
  /** Portée d'une interpellation d'initiative depuis la ligne (m). */
  autoArrestRange: number;
  /** Riposte d'initiative aux violences (gaz, puis LBD si l'ordre le permet). */
  autoRiposte: boolean;
  /** Secours d'initiative à un collègue à terre. */
  autoRescue: boolean;
  /** Durée de tenue sous pression qui épuise une unité (s). */
  fatigueTime: number;
  /** Seuil de fatigue de la demande de relève. */
  reliefAt: number;
  /** Délai de réaction d'un agent à un ordre (s) : minimum et maximum. */
  reactionMin: number;
  reactionMax: number;
}

/** Postes créés par défaut quand le module des archétypes n'est pas branché. */
export interface RosterSlot {
  kind: PersonKind;
  poste: import('@/core/contracts').PolicePoste | null;
  rank: import('@/core/contracts').PoliceRank | null;
  section: number;
  group: 'A' | 'B' | 'C' | '';
  label: string;
  leads: '' | 'groupe' | 'section' | 'unite';
}

export type { VehicleKind };

// ───────────────────────────── ravitaillement du joueur ─────────────────────────────

/** Indication de ravitaillement pour le joueur : quoi faire, et où (marqueur, GPS). */
export interface SupplyHint {
  text: string;
  x: number;
  z: number;
  /** 'bas' : sous le quart de la dotation ; 'vide' : un objet épuisé ; 'attente' : ravitaillement demandé, en route. */
  level: 'bas' | 'vide' | 'attente';
  /** Véhicule (fourgon, engin) ou 0 (bouche d'incendie, zone de stationnement). */
  vehicleId: EntityId;
}

export interface PlayerSupplyApi {
  /** Indication courante pour le joueur (null : rien à signaler). Recalculée deux fois par seconde. */
  hint(): SupplyHint | null;
  /**
   * Demande de ravitaillement par radio pour la compagnie de l'unité `squadId` (défaut : celle du joueur) : les réserves
   * des fourgons de la compagnie sont complétées après un délai (annonce radio « Ravitaillement arrivé »). false si une
   * demande est déjà en cours ou s'il n'y a pas de compagnie à ravitailler.
   */
  request(squadId?: number): boolean;
  /** Instant d'arrivée du ravitaillement demandé pour cette compagnie (unité racine), ou -1. */
  pendingUntil(squadId?: number): number;
  /** Délai d'acheminement du ravitaillement après la demande (s, réglable pour les essais). */
  restockDelay: number;
}

