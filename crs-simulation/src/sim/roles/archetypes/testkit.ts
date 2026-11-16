/* =====================================================================================
 * ARCHÉTYPES — aides de test (non utilisées par le jeu).
 * ===================================================================================== */

import type {
  GameContext, ItemId, ModuleFactory, Person, PersonKind, PolicePoste, ProtestProfile, SessionConfig,
} from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { ROLES_ARCHETYPES, ROLES_CAUSES, ROLES_SPAWN } from './api';
import type { ArchetypeExtApi, CausesApi, SpawnHelperApi } from './api';
import { ArchetypeSystem } from './system';

export const ALL_KINDS: readonly PersonKind[] = [
  'crs', 'commissaire', 'bravm', 'gendarme', 'policier_civil', 'telepilote', 'pompier', 'samu', 'manifestant',
  'street_medic', 'journaliste', 'observateur', 'passant', 'touriste', 'commercant', 'conducteur', 'vip',
];
export const ALL_POSTES: readonly PolicePoste[] = [
  'bouclier', 'lanceur', 'lbd', 'extincteur', 'interpellation', 'conducteur', 'operateur', 'chef_groupe',
  'chef_section', 'commandant_unite', 'autorite_civile', 'pilote_moto', 'passager_moto', 'telepilote',
];
export const ALL_PROFILES: readonly ProtestProfile[] = [
  'pacifique', 'famille', 'militant', 'service_ordre', 'meneur', 'opportuniste', 'radical', 'pilleur',
];
/** Tous les ItemId du contrat (src/core/contracts.ts §3) : une dotation ne doit contenir que ceux-là. */
export const CONTRACT_ITEMS: readonly ItemId[] = [
  'bouclier', 'baton', 'tonfa', 'gazeuse', 'grenade_lacrymo', 'grenade_gm2l', 'grenade_desencerclement',
  'lanceur_cougar', 'lbd40', 'pistolet', 'menottes', 'radio', 'megaphone', 'extincteur', 'lampe', 'masque_gaz',
  'fusee_sommation', 'telecommande_drone',
  'pave', 'bouteille', 'molotov', 'mortier', 'fumigene', 'pancarte', 'banderole', 'drapeau', 'parapluie',
  'bombe_peinture', 'marteau', 'barre', 'telephone', 'butin', 'raquette',
  'trousse_secours', 'serum_physiologique', 'brancard', 'lance_incendie',
  'appareil_photo', 'camera_tv', 'micro',
];

export interface RolesTest {
  t: TestContext;
  ctx: GameContext;
  ext: ArchetypeExtApi;
  causes: CausesApi;
  helper: SpawnHelperApi;
}

/** Contexte de test avec le module des archétypes (et d'autres modules au besoin), session démarrée. */
export async function startRoles(
  seed = 1, config: Partial<SessionConfig> = {}, modules: readonly ModuleFactory[] = [],
): Promise<RolesTest> {
  const t = createTestContext({ seed, modules: [...modules, () => [new ArchetypeSystem()]] });
  await t.start(config);
  const ctx = t.ctx;
  return {
    t,
    ctx,
    ext: ctx.require<ArchetypeExtApi>(ROLES_ARCHETYPES),
    causes: ctx.require<CausesApi>(ROLES_CAUSES),
    helper: ctx.require<SpawnHelperApi>(ROLES_SPAWN),
  };
}

/** Identifiants des objets de l'inventaire, dans l'ordre des emplacements. */
export function kitIds(p: Person): string[] {
  return p.inventory.map((s) => s.id);
}

export function countOf(p: Person, id: ItemId): number {
  let n = 0;
  for (const s of p.inventory) if (s.id === id) n += s.count;
  return n;
}

/** Objet en main ('' = mains libres). */
export function handOf(p: Person): string {
  return p.active >= 0 && p.inventory[p.active] ? p.inventory[p.active]!.id : '';
}

/**
 * Signature de l'apparence VISIBLE d'une personne, hors taille et carrure : deux personnes de même
 * signature sont indiscernables à l'œil (mêmes vêtements, même teint, même coiffure, mêmes accessoires).
 */
export function appearanceKey(p: Person): string {
  const l = p.look;
  const e = l.extras ?? {};
  return [
    l.skin, l.hair, l.hairStyle, l.top, l.bottom, l.shoes, l.outfit, l.headgear, l.vest, l.armband, l.faceCover,
    l.backpack, e.jacket ?? -1, e.sleeves ?? -1, e.beard ?? 0, e.scarf ?? 0, e.skirt ?? 0, e.shorts ?? 0, e.goggles ?? 0,
    e.sex ?? -1,
  ].join('|');
}

/** Copie comparable de tout ce que spawn() fixe sur une personne (hors identifiant et position). */
export function snapshot(p: Person): unknown {
  return {
    kind: p.kind, faction: p.faction, name: p.name, rio: p.rio, rank: p.rank, poste: p.poste, profile: p.profile,
    look: { ...p.look, extras: { ...p.look.extras } },
    inventory: p.inventory.map((s) => ({ id: s.id, count: s.count })),
    hand: handOf(p),
    speeds: [p.speedWalk, p.speedRun, p.speedSprint],
    armor: [p.armorHead, p.armorBody, p.gasProtection],
  };
}

/**
 * Noms d'organisations, de partis et de personnalités RÉELS qui ne doivent apparaître dans aucune
 * table (BRIEF §4). Mots entiers, sans tenir compte de la casse ni des accents.
 */
export const FORBIDDEN_WORDS: readonly string[] = [
  // syndicats et organisations professionnelles
  'cgt', 'cfdt', 'cftc', 'cgc', 'unsa', 'fsu', 'fnsea', 'unef', 'medef', 'solidaires', 'force ouvriere',
  'confederation paysanne', 'coordination rurale', 'jeunes agriculteurs', 'snes', 'snuipp', 'synavi',
  // partis et mouvements politiques
  'lfi', 'france insoumise', 'insoumis', 'rassemblement national', 'front national', 'parti socialiste', 'eelv',
  'pcf', 'npa', 'lutte ouvriere', 'renaissance', 'reconquete', 'en marche', 'modem', 'udi', 'les republicains',
  'nupes', 'nouveau front populaire',
  // associations et collectifs
  'attac', 'greenpeace', 'extinction rebellion', 'alternatiba', 'soulevements de la terre', 'droit au logement',
  'ligue des droits', 'amnesty', 'oxfam', 'youth for climate', 'derniere renovation', 'nuit debout',
  'parents vigilants', 'bonnets rouges',
  // personnalités
  'macron', 'le pen', 'melenchon', 'hollande', 'sarkozy', 'chirac', 'mitterrand', 'darmanin', 'castex', 'attal',
  'bardella', 'zemmour', 'hidalgo', 'lallement', 'nunez', 'retailleau', 'bayrou', 'barnier', 'lecornu', 'ruffin',
  'philippe martinez', 'laurent berger', 'sophie binet',
];
/** Sigles réels : interdits comme sigle d'une organisation fictive et comme mot isolé d'un texte. */
export const FORBIDDEN_ACRONYMS: readonly string[] = [
  'CGT', 'CFDT', 'CFTC', 'CGC', 'FO', 'UNSA', 'FSU', 'SUD', 'FNSEA', 'UNEF', 'MEDEF', 'LFI', 'RN', 'FN', 'PS', 'LR',
  'EELV', 'PCF', 'NPA', 'LO', 'UDI', 'UMP', 'DAL', 'LDH', 'JA', 'CIP', 'OCL', 'AD', 'CSC', 'UFF', 'NFP',
];

/** Minuscules sans accent, apostrophes et tirets ramenés à des espaces. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'\-]/g, ' ');
}

/** Premier mot interdit trouvé dans un texte ('' si aucun). */
export function forbiddenIn(text: string): string {
  const folded = ' ' + fold(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const w of FORBIDDEN_WORDS) if (folded.indexOf(' ' + w + ' ') >= 0) return w;
  const words = text.split(/[^A-Za-zÀ-ÿ0-9]+/);
  for (const w of words) if (FORBIDDEN_ACRONYMS.indexOf(w) >= 0) return w;
  return '';
}
