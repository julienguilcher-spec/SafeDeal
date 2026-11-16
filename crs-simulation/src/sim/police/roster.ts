/* =====================================================================================
 * FORCES DE L'ORDRE — composition et dotation de repli des unités.
 *
 * Quand le module des archétypes est branché (service 'roles.spawn'), c'est lui qui fournit la
 * composition (policeUnit) et habille les agents (spawnUnitSlot). Sinon, ce fichier reprend la même
 * articulation (docs/research/00-bible-realisme.md §E.1 et §E.2) et la dotation par poste (§B) :
 *   compagnie = commandement de 6 + 4 sections de 16 ;
 *   section   = groupe A, appui (chef de groupe, 3 boucliers, 1 lanceur, 1 extincteur),
 *               groupe B, intervention (chef de groupe, 2 boucliers, 1 LBD, 2 interpellateurs),
 *               groupe C, commandement (chef de section, radio, secouriste-vidéo, lanceur de réserve) ;
 *   peloton de gendarmerie mobile = 16 en deux groupes ; BRAV-M = binômes pilote + opérateur.
 * ===================================================================================== */

import type { GameContext, ItemId, Person, PersonKind, PolicePoste, PoliceRank } from '@/core/contracts';
import type { CrewKind, GroupType, RosterSlot } from './api';

type Group = RosterSlot['group'];
type Leads = RosterSlot['leads'];

function add(out: RosterSlot[], kind: PersonKind, poste: PolicePoste | null, rank: PoliceRank | null, section: number, group: Group, label: string, leads: Leads = ''): void {
  out.push({ kind, poste, rank, section, group, label, leads });
}

function rep(out: RosterSlot[], n: number, kind: PersonKind, poste: PolicePoste, section: number, group: Group, label: string): void {
  for (let i = 0; i < n; i++) add(out, kind, poste, 'gardien', section, group, label);
}

export function groupRoster(out: RosterSlot[], type: GroupType, s: number, drivers: boolean, kind: PersonKind = 'crs', leads: Leads = 'groupe'): RosterSlot[] {
  if (type === 'appui') {
    add(out, kind, 'chef_groupe', 'brigadier_chef', s, 'A', 'Chef de groupe (superviseur)', leads);
    rep(out, 3, kind, 'bouclier', s, 'A', 'Porteur de bouclier');
    rep(out, 1, kind, 'lanceur', s, 'A', 'Lanceur de grenades');
    rep(out, 1, kind, 'extincteur', s, 'A', 'Porte-extincteur');
    if (drivers) add(out, kind, 'conducteur', 'gardien', s, 'A', 'Conducteur du fourgon');
  } else if (type === 'intervention') {
    add(out, kind, 'chef_groupe', 'brigadier_chef', s, 'B', 'Chef de groupe (superviseur)', leads);
    rep(out, 2, kind, 'bouclier', s, 'B', 'Porteur de bouclier');
    rep(out, 1, kind, 'lbd', s, 'B', 'Porteur de LBD');
    rep(out, 2, kind, 'interpellation', s, 'B', 'Interpellateur');
    if (drivers) add(out, kind, 'conducteur', 'gardien', s, 'B', 'Conducteur du fourgon');
  } else {
    add(out, kind, 'chef_section', 'major', s, 'C', 'Chef de section', leads === 'groupe' ? 'groupe' : 'section');
    add(out, kind, 'operateur', 'gardien', s, 'C', 'Radio de section');
    add(out, kind, 'operateur', 'gardien', s, 'C', 'Secouriste-vidéo');
    rep(out, 1, kind, 'lanceur', s, 'C', 'Lanceur de grenades de réserve');
    if (drivers) add(out, kind, 'conducteur', 'gardien', s, 'C', 'Conducteur du fourgon');
  }
  return out;
}

export function sectionRoster(out: RosterSlot[], s: number, drivers: boolean): RosterSlot[] {
  groupRoster(out, 'appui', s, drivers);
  groupRoster(out, 'intervention', s, drivers);
  groupRoster(out, 'commandement', s, drivers, 'crs', 'section');
  return out;
}

export function companyRoster(out: RosterSlot[], sections: number, drivers: boolean, authority: boolean): RosterSlot[] {
  add(out, 'crs', authority ? 'commandant_unite' : 'chef_section', 'commandant', 0, '', 'Commandant de compagnie', 'unite');
  add(out, 'crs', 'chef_section', 'capitaine', 0, '', 'Adjoint au commandant');
  add(out, 'crs', 'operateur', 'gardien', 0, '', 'Radio du commandant');
  add(out, 'crs', 'operateur', 'gardien', 0, '', 'Radio du commandant');
  add(out, 'crs', 'operateur', 'gardien', 0, '', 'Opérateur vidéo');
  add(out, 'crs', 'operateur', 'brigadier_chef', 0, '', 'Agent de liaison');
  if (drivers) add(out, 'crs', 'conducteur', 'gardien', 0, '', 'Conducteur du véhicule de commandement');
  for (let i = 1; i <= sections; i++) sectionRoster(out, i, drivers);
  return out;
}

/** Peloton de gendarmerie mobile : 16 militaires en deux groupes égaux. */
export function pelotonRoster(out: RosterSlot[], s: number, drivers: boolean): RosterSlot[] {
  add(out, 'gendarme', 'chef_section', 'major', s, 'A', 'Chef de peloton', 'section');
  add(out, 'gendarme', 'chef_groupe', 'brigadier_chef', s, 'A', 'Chef de groupe (superviseur)', 'groupe');
  rep(out, 4, 'gendarme', 'bouclier', s, 'A', 'Porteur de bouclier');
  rep(out, 1, 'gendarme', 'lanceur', s, 'A', 'Lanceur de grenades');
  rep(out, 1, 'gendarme', 'extincteur', s, 'A', 'Porte-extincteur');
  if (drivers) add(out, 'gendarme', 'conducteur', 'gardien', s, 'A', 'Conducteur du véhicule de groupe');
  add(out, 'gendarme', 'chef_groupe', 'brigadier_chef', s, 'B', 'Chef de groupe (superviseur)', 'groupe');
  rep(out, 3, 'gendarme', 'bouclier', s, 'B', 'Porteur de bouclier');
  rep(out, 1, 'gendarme', 'lanceur', s, 'B', 'Lanceur de grenades');
  rep(out, 1, 'gendarme', 'lbd', s, 'B', 'Porteur de LBD');
  rep(out, 2, 'gendarme', 'interpellation', s, 'B', 'Interpellateur');
  if (drivers) add(out, 'gendarme', 'conducteur', 'gardien', s, 'B', 'Conducteur du véhicule de groupe');
  return out;
}

/** Équipage d'un engin : chef d'engin, conducteur, opérateur de tourelle (engins armés). */
export function crewRoster(out: RosterSlot[], kind: CrewKind): RosterSlot[] {
  const person: PersonKind = kind === 'centaure' ? 'gendarme' : 'crs';
  if (kind === 'centaure' || kind === 'canon_eau') {
    add(out, person, 'operateur', kind === 'centaure' ? 'major' : 'brigadier_chef', 0, '', 'Chef d’engin', 'unite');
    add(out, person, 'conducteur', 'gardien', 0, '', kind === 'centaure' ? 'Pilote du Centaure' : 'Conducteur de l’engin lanceur d’eau');
    add(out, person, 'operateur', 'gardien', 0, '', kind === 'centaure' ? 'Opérateur du lance-grenades' : 'Opérateur des canons');
  } else {
    add(out, person, 'operateur', 'brigadier_chef', 0, '', 'Chef de bord', 'unite');
    add(out, person, 'conducteur', 'gardien', 0, '', 'Conducteur');
  }
  return out;
}

// ───────────────────────────── dotation de repli ─────────────────────────────

type Kit = readonly (readonly [ItemId, number])[];

/** Ceinturon de tout agent (bible §B) : bâton à poignée latérale, aérosol, menottes et liens, radio, masque. */
const BELT: Kit = [['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['radio', 1], ['masque_gaz', 1]];

const KITS: Readonly<Partial<Record<PolicePoste, Kit>>> = {
  bouclier: [['bouclier', 1], ...BELT],
  lanceur: [['lanceur_cougar', 8], ['grenade_lacrymo', 4], ['grenade_gm2l', 2], ...BELT],
  lbd: [['lbd40', 6], ...BELT],
  extincteur: [['extincteur', 15], ...BELT],
  interpellation: [['menottes', 6], ['tonfa', 1], ['gazeuse', 7], ['grenade_desencerclement', 1], ['radio', 1], ['masque_gaz', 1]],
  chef_groupe: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['grenade_lacrymo', 2], ['grenade_desencerclement', 1], ['menottes', 6], ['masque_gaz', 1]],
  commandant_unite: [['megaphone', 1], ['fusee_sommation', 4], ['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['masque_gaz', 1]],
  autorite_civile: [['megaphone', 1], ['fusee_sommation', 4], ['radio', 1], ['menottes', 6], ['masque_gaz', 1]],
};

/** Objet tenu en main à la prise de poste. */
const HAND: Readonly<Partial<Record<PolicePoste, ItemId>>> = {
  bouclier: 'bouclier', lanceur: 'lanceur_cougar', lbd: 'lbd40', extincteur: 'extincteur',
};

/** Dote une personne créée sans équipement (module des archétypes absent). */
export function applyFallbackKit(ctx: GameContext, p: Person): void {
  if (p.inventory.length > 0) return;
  const kit = (p.poste && KITS[p.poste]) || BELT;
  for (let i = 0; i < kit.length; i++) ctx.actions.give(p, kit[i][0], kit[i][1]);
  const hand = p.poste ? HAND[p.poste] : undefined;
  if (hand) ctx.actions.selectById(p, hand);
}

/** Dotation complète d'un poste, pour le réapprovisionnement : objet → quantité de référence. */
export function fullLoad(poste: PolicePoste | null, id: ItemId): number {
  const kit = (poste && KITS[poste]) || BELT;
  for (let i = 0; i < kit.length; i++) if (kit[i][0] === id) return kit[i][1];
  return 0;
}

export const RADIO_LETTERS: Readonly<Record<string, string>> = { A: 'ALFA', B: 'BRAVO', C: 'CHARLIE', D: 'DELTA' };
export const COMPANY_CALLSIGNS: readonly string[] = ['MISTRAL', 'TRAMONTANE', 'SIROCCO', 'ZÉPHYR'];
