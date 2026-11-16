/* =====================================================================================
 * ARCHÉTYPES — composition des unités de police, de gendarmerie et de secours.
 *
 * Effectifs retenus par docs/research/00-bible-realisme.md §E.1 et §E.2 (la bible tranche entre les
 * dossiers : groupe de 6, section de 16, demi-compagnie de 32, compagnie de 70 à pied, escadron de 72,
 * unité de BRAV-M de 18 motos) et répartition des postes d'une section :
 *   groupe A, appui        : chef de groupe (superviseur), 3 boucliers, 1 lanceur de grenades, 1 extincteur ;
 *   groupe B, intervention : chef de groupe (superviseur), 2 boucliers, 1 LBD, 2 interpellateurs ;
 *   groupe C, commandement : chef de section, radio, secouriste-vidéo, lanceur de réserve.
 * La répartition réelle des postes n'est pas publiée : c'est une construction de jeu (estimé).
 * ===================================================================================== */

import type { PersonKind, PolicePoste, PoliceRank } from '@/core/contracts';
import type { UnitOptions, UnitSlot, UnitType, VariantId } from './api';

export const UNIT_TYPES: readonly UnitType[] = [
  'groupe_appui', 'groupe_intervention', 'groupe_commandement', 'section', 'demi_compagnie', 'compagnie',
  'peloton_gm', 'escadron', 'bravm_groupe', 'bravm_unite', 'equipage_centaure', 'equipage_canon_eau',
  'equipe_drone', 'equipe_liaison', 'autorite', 'pompiers', 'samu',
];

type Group = UnitSlot['group'];
type Leads = UnitSlot['leads'];

function add(
  out: UnitSlot[], kind: PersonKind, poste: PolicePoste | null, rank: PoliceRank | null, section: number, group: Group,
  label: string, leads: Leads = '', variant?: VariantId,
): void {
  const s: UnitSlot = { kind, poste, rank, section, group, label, leads };
  if (variant) s.variant = variant;
  out.push(s);
}

function repeat(
  out: UnitSlot[], n: number, kind: PersonKind, poste: PolicePoste, section: number, group: Group, label: string,
): void {
  for (let i = 0; i < n; i++) add(out, kind, poste, 'gardien', section, group, label);
}

function driver(out: UnitSlot[], kind: PersonKind, section: number, group: Group, label = 'Conducteur du fourgon'): void {
  add(out, kind, 'conducteur', 'gardien', section, group, label);
}

function groupeAppui(out: UnitSlot[], s: number, drivers: boolean): void {
  add(out, 'crs', 'chef_groupe', 'brigadier_chef', s, 'A', 'Chef de groupe (superviseur)', 'groupe');
  repeat(out, 3, 'crs', 'bouclier', s, 'A', 'Porteur de bouclier');
  repeat(out, 1, 'crs', 'lanceur', s, 'A', 'Lanceur de grenades');
  repeat(out, 1, 'crs', 'extincteur', s, 'A', 'Porte-extincteur');
  if (drivers) driver(out, 'crs', s, 'A');
}

function groupeIntervention(out: UnitSlot[], s: number, drivers: boolean): void {
  add(out, 'crs', 'chef_groupe', 'brigadier_chef', s, 'B', 'Chef de groupe (superviseur)', 'groupe');
  repeat(out, 2, 'crs', 'bouclier', s, 'B', 'Porteur de bouclier');
  repeat(out, 1, 'crs', 'lbd', s, 'B', 'Porteur de LBD');
  repeat(out, 2, 'crs', 'interpellation', s, 'B', 'Interpellateur');
  if (drivers) driver(out, 'crs', s, 'B');
}

function groupeCommandement(out: UnitSlot[], s: number, drivers: boolean, chief: PoliceRank, leads: Leads): void {
  add(out, 'crs', 'chef_section', chief, s, 'C', 'Chef de section', leads);
  add(out, 'crs', 'operateur', 'gardien', s, 'C', 'Radio de section', '', 'radio');
  add(out, 'crs', 'operateur', 'gardien', s, 'C', 'Secouriste-vidéo', '', 'secouriste');
  repeat(out, 1, 'crs', 'lanceur', s, 'C', 'Lanceur de grenades de réserve');
  if (drivers) driver(out, 'crs', s, 'C');
}

function section(out: UnitSlot[], s: number, drivers: boolean, chief: PoliceRank = 'major', leads: Leads = 'section'): void {
  groupeAppui(out, s, drivers);
  groupeIntervention(out, s, drivers);
  groupeCommandement(out, s, drivers, chief, leads);
}

/** Peloton de gendarmerie mobile : 16 militaires en deux groupes égaux. */
function peloton(out: UnitSlot[], s: number, drivers: boolean): void {
  add(out, 'gendarme', 'chef_section', 'major', s, 'A', 'Chef de peloton', 'section');
  add(out, 'gendarme', 'chef_groupe', 'brigadier_chef', s, 'A', 'Chef de groupe (superviseur)', 'groupe');
  repeat(out, 4, 'gendarme', 'bouclier', s, 'A', 'Porteur de bouclier');
  repeat(out, 1, 'gendarme', 'lanceur', s, 'A', 'Lanceur de grenades');
  repeat(out, 1, 'gendarme', 'extincteur', s, 'A', 'Porte-extincteur');
  add(out, 'gendarme', 'chef_groupe', 'brigadier_chef', s, 'B', 'Chef de groupe (superviseur)', 'groupe');
  repeat(out, 3, 'gendarme', 'bouclier', s, 'B', 'Porteur de bouclier');
  repeat(out, 1, 'gendarme', 'lanceur', s, 'B', 'Lanceur de grenades');
  repeat(out, 1, 'gendarme', 'lbd', s, 'B', 'Porteur de LBD');
  repeat(out, 2, 'gendarme', 'interpellation', s, 'B', 'Interpellateur');
  if (drivers) {
    driver(out, 'gendarme', s, 'A', 'Conducteur du véhicule de groupe');
    driver(out, 'gendarme', s, 'B', 'Conducteur du véhicule de groupe');
  }
}

/** Groupe de BRAV-M : 6 motos, soit 6 pilotes et 6 opérateurs (1 chef, 1 LBD, 4 équipiers). */
function bravGroup(out: UnitSlot[], s: number, leads: Leads): void {
  add(out, 'bravm', 'chef_groupe', 'brigadier_chef', s, '', 'Chef de groupe (opérateur)', leads);
  add(out, 'bravm', 'lbd', 'gardien', s, '', 'Opérateur porteur de LBD');
  repeat(out, 4, 'bravm', 'passager_moto', s, '', 'Opérateur');
  repeat(out, 6, 'bravm', 'pilote_moto', s, '', 'Pilote');
}

function clampSection(v: number | undefined): number {
  const s = Math.round(v ?? 1);
  return s >= 1 && s <= 4 ? s : 1;
}

/** Liste des postes d'une unité (tableau neuf à chaque appel). */
export function policeUnit(type: UnitType, opts: UnitOptions = {}): UnitSlot[] {
  const out: UnitSlot[] = [];
  const s = clampSection(opts.section);
  const drivers = opts.drivers === true;
  switch (type) {
    case 'groupe_appui':
      groupeAppui(out, s, drivers);
      break;
    case 'groupe_intervention':
      groupeIntervention(out, s, drivers);
      break;
    case 'groupe_commandement':
      groupeCommandement(out, s, drivers, 'major', 'groupe');
      break;
    case 'section':
      section(out, s, drivers);
      break;
    case 'demi_compagnie': {
      // deux sections (« Demi-Alpha » : 1 et 2 ; « Demi-Bravo » : 3 et 4), la première aux ordres d'un capitaine
      const first = s >= 3 ? 3 : 1;
      section(out, first, drivers, 'capitaine', 'unite');
      section(out, first + 1, drivers);
      break;
    }
    case 'compagnie': {
      // commandement de 6 : commandant, adjoint, 2 radios, opérateur vidéo, agent de liaison ; puis 4 sections de 16
      const authority = opts.authority !== false;
      add(out, 'crs', authority ? 'commandant_unite' : 'chef_section', 'commandant', 0, '', 'Commandant de compagnie', 'unite');
      add(out, 'crs', 'chef_section', 'capitaine', 0, '', 'Adjoint au commandant');
      add(out, 'crs', 'operateur', 'gardien', 0, '', 'Radio du commandant', '', 'radio');
      add(out, 'crs', 'operateur', 'gardien', 0, '', 'Radio du commandant', '', 'radio');
      add(out, 'crs', 'operateur', 'gardien', 0, '', 'Opérateur vidéo', '', 'video');
      add(out, 'crs', 'operateur', 'brigadier_chef', 0, '', 'Agent de liaison', '', 'liaison');
      if (drivers) driver(out, 'crs', 0, '', 'Conducteur du véhicule de commandement');
      for (let i = 1; i <= 4; i++) section(out, i, drivers);
      break;
    }
    case 'peloton_gm':
      peloton(out, s, drivers);
      break;
    case 'escadron': {
      // commandement de 8 (dont transmissions, rame de véhicules, cellule images, appui-feu), puis 4 pelotons de 16
      const authority = opts.authority === true;
      add(out, 'gendarme', authority ? 'commandant_unite' : 'chef_section', 'capitaine', 0, '', 'Commandant d’escadron', 'unite');
      add(out, 'gendarme', 'chef_section', 'major', 0, '', 'Adjoint au commandant');
      add(out, 'gendarme', 'operateur', 'gardien', 0, '', 'Transmissions', '', 'radio');
      add(out, 'gendarme', 'operateur', 'gardien', 0, '', 'Transmissions', '', 'radio');
      add(out, 'gendarme', 'conducteur', 'brigadier_chef', 0, '', 'Chef de la rame de véhicules');
      add(out, 'gendarme', 'operateur', 'gardien', 0, '', 'Cellule images', '', 'video');
      add(out, 'gendarme', 'chef_groupe', 'major', 0, '', 'Chef appui-feu');
      add(out, 'gendarme', 'operateur', 'gardien', 0, '', 'Secouriste', '', 'secouriste');
      for (let i = 1; i <= 4; i++) peloton(out, i, drivers);
      break;
    }
    case 'bravm_groupe':
      bravGroup(out, s, 'unite');
      break;
    case 'bravm_unite':
      for (let i = 1; i <= 3; i++) bravGroup(out, i, i === 1 ? 'unite' : 'groupe');
      break;
    case 'equipage_centaure':
      add(out, 'gendarme', 'operateur', 'major', 0, '', 'Chef d’engin', 'unite', 'chef_engin');
      add(out, 'gendarme', 'conducteur', 'gardien', 0, '', 'Pilote du Centaure');
      add(out, 'gendarme', 'operateur', 'gardien', 0, '', 'Opérateur du lance-grenades');
      break;
    case 'equipage_canon_eau':
      add(out, 'crs', 'operateur', 'brigadier_chef', 0, '', 'Chef d’engin', 'unite', 'chef_engin');
      add(out, 'crs', 'conducteur', 'gardien', 0, '', 'Conducteur de l’engin lanceur d’eau');
      add(out, 'crs', 'operateur', 'gardien', 0, '', 'Opérateur des canons');
      break;
    case 'equipe_drone':
      add(out, 'telepilote', 'telepilote', 'brigadier_chef', 0, '', 'Télépilote', 'unite');
      add(out, 'telepilote', 'operateur', 'gardien', 0, '', 'Opérateur image', '', 'video');
      break;
    case 'equipe_liaison':
      add(out, 'policier_civil', 'operateur', 'brigadier_chef', 0, '', 'Agent de liaison', 'unite', 'liaison');
      add(out, 'policier_civil', 'operateur', 'gardien', 0, '', 'Agent de liaison', '', 'liaison');
      break;
    case 'autorite':
      add(out, 'commissaire', 'autorite_civile', 'commissaire', 0, '', 'Autorité civile', 'unite');
      break;
    case 'pompiers':
      // engin-pompe : six sapeurs-pompiers
      add(out, 'pompier', null, null, 0, '', 'Chef d’agrès', 'unite', 'chef_agres');
      for (let i = 0; i < 3; i++) add(out, 'pompier', null, null, 0, '', 'Porte-lance', '', 'porte_lance');
      for (let i = 0; i < 2; i++) add(out, 'pompier', null, null, 0, '', 'Équipier de secours à victime', '', 'secours_victime');
      break;
    case 'samu':
      add(out, 'samu', null, null, 0, '', 'Médecin', 'unite', 'medecin');
      add(out, 'samu', null, null, 0, '', 'Infirmier', '', 'infirmier');
      add(out, 'samu', null, null, 0, '', 'Ambulancier', '', 'ambulancier');
      break;
    default:
      console.error(`[roles] type d'unité inconnu : « ${String(type)} »`);
      break;
  }
  return out;
}
