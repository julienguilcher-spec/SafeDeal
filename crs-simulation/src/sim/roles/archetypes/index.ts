/* =====================================================================================
 * ARCHÉTYPES — qui sont les gens, à quoi ils ressemblent, ce qu'ils portent, pourquoi ils manifestent.
 *
 *   ctx.archetypes                     spawn(kind, x, z, opts) pour chaque PersonKind ; equip(p, poste | profil)
 *   service « roles.archetypes »       options typées, tenue du bloc, traits, libellés, dotations types
 *   service « roles.causes »           12 causes, organisations fictives, pancartes, slogans, banderoles
 *   service « roles.spawn »            composition d'une foule, tiers du cortège, postes d'une unité
 *
 * Tables de données : police.ts (corps, postes, grades), tiers.ts (secours, presse, observateurs),
 * protest.ts (familles visuelles × profils), civil.ts, causes-data-*.ts, units.ts. Les clés de
 * Person.look.extras sont documentées dans api.ts.
 * ===================================================================================== */

export { ArchetypeSystem } from './system';
export {
  CARRY, FAMILY_IDS, PROFILE_IDS, RANK_STYLE, ROLES_ARCHETYPES, ROLES_CAUSES, ROLES_EQUIPPED_EVENT, ROLES_SPAWN, VARIANT,
} from './api';
export type {
  ArchetypeExtApi, ArchetypeOptions, ArchetypeSessionDefaults, ArchetypeTraits, CarryId, CauseDef, CauseInfo, CausesApi,
  ChantDef, CrowdComposition, CrowdMix, CrowdScenario, CrowdSlot, OrgDef, OrgKind, RolesEquippedEvent, SpawnHelperApi,
  UnitOptions, UnitSlot, UnitType, VariantId, VisualFamily,
} from './api';
