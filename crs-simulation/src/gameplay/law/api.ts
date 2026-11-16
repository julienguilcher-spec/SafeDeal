/* =====================================================================================
 * Droit — types publics du module (à importer en `import type` depuis les autres modules).
 *
 * Services étendus (ctx.service<T>(clé)) :
 *   'law.records'   LawRecords   dossier de la session : sommations, autorisations, emplois de la force
 *                                 (avec verdicts), interpellations, contrôles, plaintes potentielles,
 *                                 score de régularité et résumé en français ;
 *   'law.config'    LawConfig    réglages modifiables (délais des sommations, portées, durées) ;
 *   'law.handover'  LawHandover  points de regroupement où remettre les interpellés. Le module en
 *                                 publie un vide ; un module de mission peut y pousser des points
 *                                 ou le remplacer : ctx.provide('law.handover', { points }).
 *
 * Événements libres émis (ctx.events.onAny) :
 *   'law:sommation_refused'  { byId, code, reason }          sommation refusée (motif en français)
 *   'law:under_attack'       { active, x, z }                début / fin de la riposte directe
 *   'law:force_amended'      { report }                      verdict révisé après coup (impact à la tête…)
 *   'law:dispersion_ended'   { x, z, reason }                fin de la séquence de dispersion
 *   'law:arrest_failed'      { id, byId, outcome }           la personne s'est dégagée ('fuite' | 'rebellion')
 *   'law:search'             { id, byId, seized }            résultat d'une palpation
 *   'law:control'            { id, byId, justified, known }  contrôle d'identité terminé
 *   'law:escape'             { id, byId }                    interpellé non entravé qui s'échappe
 * ===================================================================================== */

import type {
  EntityId, ForceLevel, ForceMeans, ForceReport, ForceVerdictKind, ItemId, OffenseType, SommationStage,
} from '@/core/contracts';

export const LAW_RECORDS_SERVICE = 'law.records';
export const LAW_CONFIG_SERVICE = 'law.config';
export const LAW_HANDOVER_SERVICE = 'law.handover';

// ───────────────────────────── points de regroupement ─────────────────────────────

export interface HandoverPoint {
  x: number;
  z: number;
  /** Rayon dans lequel la remise est possible (m). Défaut : LawConfig.handoverPointRadius. */
  radius?: number;
  /** Nom affiché (« point de regroupement rue Royale »). */
  name?: string;
}

export interface LawHandover {
  points: HandoverPoint[];
}

// ───────────────────────────── réglages ─────────────────────────────

/** Réglages du droit. Les délais sont recalculés à chaque session d'après la durée choisie ; tout est modifiable. */
export interface LawConfig {
  // sommations (docs/research/00-bible-realisme.md, A.5 : valeurs de jeu)
  /** Délai minimal annonce → première sommation (s). */
  delayAnnonce: number;
  /** Délai minimal première → dernière sommation (s). */
  delaySommation: number;
  /** Délai laissé à la foule entre la dernière sommation et le premier acte de force (s). */
  delayForce: number;
  /** Délai entre la réitération de la dernière sommation et le premier usage des armes (s). */
  delayArmes: number;
  /** Portée intelligible d'un mégaphone, d'une sonorisation de véhicule, de la voix nue (m). */
  megaphoneRange: number;
  vehicleSpeakerRange: number;
  voiceRange: number;
  /** Rayon dans lequel une fusée rouge vaut sommation (m). */
  flareRange: number;
  /** Rayon du compartiment de terrain couvert par une série de sommations (m). */
  sequenceRadius: number;
  /** Temps passé sur place après le délai, sans s'éloigner, qui caractérise le maintien dans l'attroupement (s). */
  attroupementStay: number;
  /** Part de la foule encore présente en dessous de laquelle la dispersion est effective, et plancher absolu. */
  dispersedRatio: number;
  dispersedMin: number;
  /** Durée après la dispersion au-delà de laquelle la force « poursuivie » est fautive (s). */
  cessationGrace: number;
  /** Durée de dispersion effective qui clôt la séquence (s). */
  sequenceEndDelay: number;

  // riposte directe
  /** Mémoire des violences contre les forces (s). */
  attackMemory: number;
  /** Rayon autour d'un acte violent dans lequel la riposte est permise (m). */
  riposteRadius: number;
  /** Distance d'un projectile à un agent pour qu'il compte comme une violence contre les forces (m). */
  projectileNearRadius: number;

  // témoins et images
  witnessRange: number;
  minVisibility: number;
  pressRange: number;
  phoneRange: number;
  bodycamRange: number;
  droneRange: number;

  // appréciation de la force
  /** Durée pendant laquelle une violence reste « actuelle » pour apprécier la menace (s). */
  threatWindow: number;
  lbdMinRange: number;
  lbdMaxRange: number;
  /** Hauteur relative (0 pieds … 1 sommet du crâne) à partir de laquelle un impact est « au-dessus des épaules ». */
  headZone: number;
  /** Rayon d'effet pris en compte pour les moyens de zone (m). */
  areaRadius: number;

  // interpellation
  reach: number;
  cuffTime: number;
  searchTime: number;
  escortTime: number;
  handoverTime: number;
  releaseTime: number;
  controlTime: number;
  handoverPointRadius: number;
  handoverVehicleRange: number;
}

// ───────────────────────────── dossier ─────────────────────────────

/** Cadre juridique retenu pour un emploi de la force. */
export type LegalFrame =
  | 'aucun'              // aucun cadre : la faute est là
  | 'contact'            // niveau minimal, licite par nature
  | 'sommations'         // emploi de la force après les deux sommations
  | 'armes'              // usage des armes après réitération de la dernière sommation
  | 'riposte'            // violences ou voies de fait contre les forces (art. L. 211-9 al. 6)
  | 'legitime_defense';  // défense de soi ou d'autrui

/** Moyen par lequel une sommation a été portée à la connaissance de la foule. */
export type SommationMeans = 'megaphone' | 'vehicule' | 'voix';

export interface SommationRecord {
  t: number;
  stage: SommationStage;
  /** Réitération de la dernière sommation (préalable à l'usage des armes). */
  reiteration: boolean;
  byId: EntityId;
  byName: string;
  x: number;
  z: number;
  sector: string;
  means: SommationMeans;
  /** Une fusée rouge a doublé la sommation. */
  flare: boolean;
  /** Rayon dans lequel la sommation était intelligible (m). */
  heardRadius: number;
  /** Participants présents dans le compartiment de terrain, et part de ceux à portée intelligible (0..1). */
  crowd: number;
  coverage: number;
  /** false : annonce faite sans trouble caractérisé (cortège calme qualifié d'attroupement). */
  justified: boolean;
  /** Remarques de régularité (vide si rien à signaler). */
  note: string;
}

export interface AuthorizationRecord {
  t: number;
  level: ForceLevel;
  byId: EntityId;
  /** Autorisation déduite d'une sommation prononcée par l'autorité (et non d'un appel à authorize()). */
  implied: boolean;
  /** Niveau licite au moment de l'ordre : un ordre supérieur ne prend effet qu'une fois le cadre réuni. */
  lawfulAtTime: ForceLevel;
}

/** Sources d'images, en masque de bits (ForceRecord.cameras, OffenseEvidence). */
export const CAMERA_PRESS = 1;
export const CAMERA_PHONE = 2;
export const CAMERA_OBSERVER = 4;
export const CAMERA_DRONE = 8;
export const CAMERA_BODYCAM = 16;
/** Sources tierces (presse, téléphones, observateurs) : celles qui font l'image publique. */
export const CAMERA_THIRD_PARTY = CAMERA_PRESS | CAMERA_PHONE | CAMERA_OBSERVER;

/** Emploi de la force inscrit au journal : le ForceReport du contrat, complété. */
export interface ForceRecord extends ForceReport {
  frame: LegalFrame;
  /** Distance entre l'agent et la cible ou le point d'impact (m). */
  distance: number;
  targetName: string;
  /** Masque des caméras qui couvraient la scène (CAMERA_*). `filmed` ne retient que les tiers. */
  cameras: number;
  /** Niveau licite et niveau autorisé au moment de l'acte. */
  lawfulForce: ForceLevel;
  authorizedForce: ForceLevel;
  /** Étape des sommations au moment de l'acte. */
  sommation: SommationStage;
  /** Verdict révisé après coup (impact à la tête, tir tendu constaté). */
  amended: boolean;
  /** Rapport créé par le module à partir d'un événement (blessure, collision) faute de déclaration. */
  auto: boolean;
}

export interface SeizedItem {
  id: ItemId;
  count: number;
}

export type ArrestStatus = 'en_cours' | 'remis' | 'relache' | 'evade' | 'interrompu';
/** Solidité de la procédure pour le parquet. */
export type ProcedureStrength = 'solide' | 'fragile' | 'nulle';

export interface ArrestRecord {
  /** Numéro d'ordre dans la session (1, 2, 3…). */
  n: number;
  targetId: EntityId;
  targetName: string;
  byId: EntityId;
  byName: string;
  /** Heure d'interpellation (temps de session, s) : point de départ de la garde à vue. */
  t: number;
  x: number;
  z: number;
  /** Infraction retenue comme motif (null : aucun fait rattaché). */
  motif: OffenseType | null;
  motifLabel: string;
  severity: number;
  /** Flagrant délit établi au moment de l'interpellation. */
  founded: boolean;
  witnessed: boolean;
  filmed: boolean;
  /** Personne protégée interpellée sans fait : '' | 'journaliste' | 'secouriste' | 'observateur' | 'passant' | 'enfant'. */
  protectedTarget: string;
  /** Moyens de force employés contre la personne autour de l'interpellation, et pire verdict. */
  force: ForceMeans[];
  worstVerdict: ForceVerdictKind;
  worstSeverity: number;
  /** La personne a résisté ou tenté de fuir pendant la procédure. */
  resisted: boolean;
  cuffed: boolean;
  cuffJustified: boolean;
  searched: boolean;
  seized: SeizedItem[];
  status: ArrestStatus;
  closedAt: number;
  /** Destination de la remise : 'vehicule' | 'point' | ''. */
  to: string;
  strength: ProcedureStrength;
  /** Procédure régulière de bout en bout (fondée, force licite, menottage justifié). */
  regular: boolean;
  notes: string[];
}

export interface ControlRecord {
  t: number;
  byId: EntityId;
  targetId: EntityId;
  targetName: string;
  x: number;
  z: number;
  /** Motif légal du contrôle présent (fait constaté, visage dissimulé, objet dangereux, qualité de journaliste à vérifier…). */
  justified: boolean;
  /** Infraction déjà constatée à l'encontre de la personne, révélée par le contrôle. */
  known: OffenseType | null;
  result: string;
}

export type ComplaintKind = 'force' | 'blessure' | 'interpellation' | 'controle';

/** Plainte ou signalement probable à l'issue de la mission. */
export interface ComplaintRecord {
  t: number;
  kind: ComplaintKind;
  /** Plaignant probable. */
  personId: EntityId;
  personName: string;
  /** Agent mis en cause. */
  againstId: EntityId;
  text: string;
  severity: number;
  /** Étayée par des images de tiers. */
  filmed: boolean;
}

/** Suite disciplinaire encourue, d'après l'échelle de l'article L. 533-1 du code général de la fonction publique. */
export type SanctionLevel = 'aucune' | 'avertissement' | 'blame' | 'exclusion' | 'retrogradation' | 'revocation';

export interface LawStats {
  sommations: number;
  /** Actes de force (hors simple présence), fautes, fautes filmées par des tiers, pire gravité. */
  forces: number;
  faults: number;
  filmedFaults: number;
  worstSeverity: number;
  /** Nombre d'actes par type de verdict. */
  byVerdict: Record<ForceVerdictKind, number>;
  /** Nombre d'actes par moyen (compte rendu d'opération : munitions par type). */
  byMeans: Record<ForceMeans, number>;
  arrests: number;
  founded: number;
  unfounded: number;
  handedOver: number;
  released: number;
  escaped: number;
  controls: number;
  unjustifiedControls: number;
  complaints: number;
  /** Score de régularité 0..100. */
  score: number;
  sanction: SanctionLevel;
  /** Une enquête de l'inspection est probable (faute lourde filmée, tir d'arme de service…). */
  inquiry: boolean;
}

export interface LawRecords {
  readonly sommations: readonly SommationRecord[];
  readonly autorisations: readonly AuthorizationRecord[];
  /** Même tableau que ctx.law.forceLog, avec les champs complémentaires. */
  readonly forces: readonly ForceRecord[];
  readonly interpellations: readonly ArrestRecord[];
  readonly controles: readonly ControlRecord[];
  readonly plaintes: readonly ComplaintRecord[];
  /** Score de régularité 0..100 de toute la session (tous agents). */
  readonly score: number;
  /** Motif du dernier refus (sommation, autorisation), '' si aucun. */
  readonly lastRefusal: string;
  /** Statistiques ; `byId` restreint aux actes d'un agent (le joueur, par exemple). */
  stats(byId?: EntityId): LawStats;
  /** Résumé en français pour le compte rendu de fin de mission ; `byId` restreint à un agent. */
  summary(byId?: EntityId): string;
  /** Dossier en cours pour une personne retenue (null si elle n'est pas interpellée). */
  arrestOf(personId: EntityId): ArrestRecord | null;
}
