/* =====================================================================================
 * CRS SIMULATION FRANCE — carrière et campagne « semaine de mobilisation »
 * -------------------------------------------------------------------------------------
 * Chapitre 0 : l'école (quatre ateliers de trois minutes). Chapitres 1 à 8 : la montée en grade
 * jusqu'au commandant, puis la semaine de mobilisation. Chapitres 9 à 12 : détachements facultatifs.
 * Chapitre 13 : « regards croisés », les rôles civils, ouverts quand la mission miroir est terminée.
 * Le rôle de commissaire n'existe plus : le commandant cumule commandement et autorité habilitée.
 * Notes : A = 4, B = 3, C = 2, D = 1, E = 0.
 * ===================================================================================== */

import type { CareerChapter } from '../../../core/missions-schema';
import type { MissionDef } from '../../../core/missions-schema';
import { BRAVM } from './bravm';
import { CANON_EAU } from './canon-eau';
import { CENTAURE } from './centaure';
import {
  CG_01, CG_02, CG_03, CG_04, CG_05, CG_06, CG_07, CG_08, CG_09, CG_10, CG_11, CG_12,
} from './chef-groupe';
import {
  CDT_01, CDT_02, CDT_03, CDT_04, CDT_05, CDT_06, CDT_07, CDT_08, CDT_09, CDT_10, CDT_11, CDT_12, CDT_13, CDT_14, CDT_15,
} from './commandant';
import {
  CRS_01, CRS_02, CRS_03, CRS_04, CRS_05, CRS_06, CRS_07, CRS_08, CRS_09, CRS_10, CRS_11, CRS_12,
} from './crs';
import { DRONE } from './drone';
import { ECOLE } from './ecole';
import { JOURNALISTE } from './journaliste';
import { MANIFESTANT } from './manifestant';
import { MEDECIN } from './medecin';
import { POMPIER } from './pompier';
import {
  SEMAINE_1, SEMAINE_2, SEMAINE_3, SEMAINE_4, SEMAINE_5, SEMAINE_6,
} from './semaine';

const ids = (...ms: readonly MissionDef[]): string[] => ms.map((m) => m.id);

export const CAREER_CHAPTERS: CareerChapter[] = [
  {
    index: 0,
    title: 'L\'école',
    rank: 'gardien_stagiaire',
    description: 'Quatre ateliers de trois minutes : tenir la ligne, porter le bouclier, écouter et prononcer les sommations, premiers secours. On apprend les gestes avant de les employer.',
    missions: ids(...ECOLE),
    requirement: 'Réussir les quatre ateliers.',
    requiredMissions: 4,
    requiredAverage: 2,
    unlocks: ['Chapitre 1 « Première ligne »', 'Bouclier et bâton de défense', 'Matériel de premiers secours'],
  },
  {
    index: 1,
    title: 'Première ligne',
    rank: 'gardien_stagiaire',
    description: 'Gardien stagiaire, vous tenez votre place dans la ligne : marche paisible, jets de projectiles, barrage de pont, secours à un riverain, garde de nuit.',
    missions: ids(CRS_01, CRS_02, CRS_04, CRS_09, CRS_10),
    requirement: 'Quatre missions notées C ou mieux, aucune sanction : titularisation.',
    requiredMissions: 4,
    requiredAverage: 2,
    unlocks: ['Grade de gardien de la paix', 'Gazeuse', 'Véhicule : fourgon CRS'],
  },
  {
    index: 2,
    title: 'Le métier',
    rank: 'gardien',
    description: 'Gardien de la paix, vous apprenez les postes de la section : lanceur, extincteur, interpellation, endurance de la ligne.',
    missions: ids(CRS_03, CRS_05, CRS_06, CRS_07, CRS_08, CRS_11, CRS_12),
    requirement: 'Cinq missions, moyenne B ; deux habilitations sur quatre (lanceur, LBD, extincteur, interpellation).',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Habilitations : lanceur de grenades de 56 mm, LBD 40, extincteur, interpellation', 'Grenade de désencerclement', 'Détachements : BRAV-M et engin lanceur d\'eau'],
  },
  {
    index: 3,
    title: 'Sept sous mes ordres',
    rank: 'brigadier_chef',
    description: 'Brigadier-chef, vous commandez un groupe de sept : bond offensif, pillage, escorte, évacuation, guet-apens, prévention, derby, angle de rue, sang-froid.',
    missions: ids(CG_01, CG_02, CG_03, CG_04, CG_05, CG_06, CG_07, CG_08, CG_09, CG_10),
    requirement: 'Six missions, moyenne B ; aucun agent laissé isolé.',
    requiredMissions: 6,
    requiredAverage: 3,
    unlocks: ['Grade de brigadier-chef', 'Ordres à son groupe depuis la carte tactique', 'Paramètres avancés de l\'éditeur de scénario', 'Détachements : télépilote et Centaure'],
  },
  {
    index: 4,
    title: 'La section',
    rank: 'major',
    description: 'Major, vous commandez une section de seize : réarticuler trois groupes sous pression et remettre des procédures justes.',
    missions: ids(CG_11, CG_12),
    requirement: 'Deux missions, moyenne B.',
    requiredMissions: 2,
    requiredAverage: 3,
    unlocks: ['Grade de major', 'Ordres à sa section depuis la carte tactique', 'Véhicule : car de transport'],
  },
  {
    index: 5,
    title: 'L\'adjoint',
    rank: 'capitaine',
    description: 'Capitaine, vous commandez une demi-compagnie ; vous portez déjà l\'écharpe et le mégaphone et décidez seul, mais le commandant fixe l\'intention.',
    missions: ids(CDT_01, CDT_04, CDT_08),
    requirement: 'Trois missions, moyenne A ; examen de dix questions sur le cadre légal.',
    requiredMissions: 3,
    requiredAverage: 4,
    unlocks: ['Grade de capitaine', 'Écharpe tricolore et mégaphone', 'Ordres à sa demi-compagnie depuis la carte tactique'],
  },
  {
    index: 6,
    title: 'La compagnie',
    rank: 'commandant',
    description: 'Commandant, vous cumulez le commandement et l\'autorité habilitée : sommations, emploi de la force et moyens spéciaux. Vos ordres sont immédiats ; vous en répondez seul.',
    missions: ids(CDT_02, CDT_03, CDT_05, CDT_06, CDT_07, CDT_09, CDT_10),
    requirement: 'Cinq missions, moyenne B ; image publique à 50 ou plus.',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Grade de commandant', 'Carte tactique complète', 'Drone d\'appui', 'Véhicule : véhicule de commandement'],
  },
  {
    index: 7,
    title: 'L\'écharpe',
    rank: 'commandant',
    description: 'Les missions de l\'ancien « commissaire », désormais celles du commandant : constater, annoncer, sommer, dialoguer, décider, tenir un périmètre.',
    missions: ids(CDT_11, CDT_12, CDT_13, CDT_14, CDT_15),
    requirement: 'Quatre missions, moyenne B.',
    requiredMissions: 4,
    requiredAverage: 3,
    unlocks: ['Médaille « Sans un coup »', 'Médaille « Sincère »', 'Chapitre 8 « La semaine de mobilisation »'],
  },
  {
    index: 8,
    title: 'La grande journée',
    rank: 'commandant',
    description: 'Une semaine de mobilisation en six actes : fatigue, blessés, image publique et colère de la rue se reportent d\'un jour au suivant. Fin de la carrière.',
    missions: ids(SEMAINE_1, SEMAINE_2, SEMAINE_3, SEMAINE_4, SEMAINE_5, SEMAINE_6),
    requirement: 'Mener les six actes jusqu\'au bout, moyenne B.',
    requiredMissions: 6,
    requiredAverage: 3,
    unlocks: ['Fin de la carrière', 'Médaille « Une semaine »'],
  },
  {
    index: 9,
    title: 'Détachement : BRAV-M',
    rank: 'gardien',
    description: 'Binôme à moto : colonne, flagrant délit, pillage, filature de nuit. Détachement facultatif ouvert après trois interpellations sans faute.',
    missions: ids(...BRAVM),
    requirement: 'Cinq missions, moyenne B.',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Moto BRAV-M', 'Rôle BRAV-M en mode libre'],
  },
  {
    index: 10,
    title: 'Détachement : engin lanceur d\'eau',
    rank: 'gardien',
    description: 'Opérateur du canon à eau : gradation, extinction des feux de rue, protection des tiers, économie de la cuve.',
    missions: ids(...CANON_EAU),
    requirement: 'Cinq missions, moyenne B.',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Engin lanceur d\'eau', 'Rôle opérateur du canon à eau en mode libre'],
  },
  {
    index: 11,
    title: 'Détachement : télépilote',
    rank: 'brigadier_chef',
    description: 'Télépilote de la préfecture : repérer, désigner, guider, compter, dans un périmètre de vol autorisé.',
    missions: ids(...DRONE),
    requirement: 'Cinq missions, moyenne B.',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Drone d\'appui', 'Rôle télépilote en mode libre'],
  },
  {
    index: 12,
    title: 'Détachement : Centaure',
    rank: 'brigadier_chef',
    description: 'Détachement auprès de la gendarmerie mobile (licence de jeu) : pilote, opérateur et chef d\'engin du Centaure.',
    missions: ids(...CENTAURE),
    requirement: 'Cinq missions, moyenne B.',
    requiredMissions: 5,
    requiredAverage: 3,
    unlocks: ['Centaure', 'Rôle équipage du Centaure en mode libre'],
  },
  {
    index: 13,
    title: 'Regards croisés',
    rank: 'gardien',
    description: 'Les rôles civils : médecin, sapeur-pompier de Paris, journaliste, manifestant pacifique ou radical. Chaque mission s\'ouvre quand sa mission miroir est terminée ; les autres, à la fin de chaque chapitre.',
    missions: ids(...MEDECIN, ...POMPIER, ...JOURNALISTE, ...MANIFESTANT),
    requirement: 'Dix missions civiles, moyenne B.',
    requiredMissions: 10,
    requiredAverage: 3,
    unlocks: ['Rôles civils en mode libre', 'Médaille « Neutre »'],
  },
];

/** Un acte de la campagne : jour, mission et ce qui se reporte à l'acte suivant. */
export interface CampaignAct {
  act: number;
  day: string;
  missionId: string;
  /** Ce qui est reporté du jour au suivant (fatigue, blessés, image publique, colère de la rue). */
  carryOver: string[];
  /** Décalage de la tension initiale de la mission, par rapport à son réglage de base. */
  tensionShift: number;
}

/** Campagne sur plusieurs jours (BRIEF, amélioration 9). */
export interface Campaign {
  id: string;
  title: string;
  description: string;
  acts: CampaignAct[];
}

export const CAMPAIGN_SEMAINE: Campaign = {
  id: 'semaine-de-mobilisation',
  title: 'Semaine de mobilisation',
  description: 'Six actes du commandant, de mardi à dimanche. La situation s\'aggrave d\'un jour à l\'autre : la fatigue des sections, les blessés, l\'image publique et la colère de la rue se reportent.',
  acts: [
    { act: 1, day: 'Mardi', missionId: SEMAINE_1.id, carryOver: ['fatigue', 'image_publique'], tensionShift: 0 },
    { act: 2, day: 'Mercredi', missionId: SEMAINE_2.id, carryOver: ['fatigue', 'blesses', 'image_publique', 'colere_de_la_rue'], tensionShift: 0.05 },
    { act: 3, day: 'Jeudi', missionId: SEMAINE_3.id, carryOver: ['fatigue', 'blesses', 'image_publique', 'colere_de_la_rue'], tensionShift: 0.1 },
    { act: 4, day: 'Vendredi', missionId: SEMAINE_4.id, carryOver: ['fatigue', 'blesses', 'image_publique', 'colere_de_la_rue'], tensionShift: 0.15 },
    { act: 5, day: 'Samedi', missionId: SEMAINE_5.id, carryOver: ['fatigue', 'blesses', 'image_publique', 'colere_de_la_rue'], tensionShift: 0.2 },
    { act: 6, day: 'Dimanche', missionId: SEMAINE_6.id, carryOver: ['bilan_de_la_semaine'], tensionShift: 0.25 },
  ],
};
