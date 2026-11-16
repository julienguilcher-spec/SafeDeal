/* =====================================================================================
 * RÔLES — archétypes (tenues, dotations, causes) et, plus tard, IA des médecins, journalistes,
 * secours et télépilotes.
 *
 * Brancher : game.addModule(createSystems). Systèmes :
 *   roles.archetypes  (CONTROL − 50)  ctx.archetypes + services « roles.archetypes », « roles.causes »,
 *                                     « roles.spawn » (voir archetypes/api.ts)
 * Aucune dépendance sur un autre module : inventaire par ctx.actions, personnes par ctx.people.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { ArchetypeSystem } from './archetypes';

export const createSystems: ModuleFactory = () => [new ArchetypeSystem()];

export {
  CARRY, FAMILY_IDS, PROFILE_IDS, RANK_STYLE, ROLES_ARCHETYPES, ROLES_CAUSES, ROLES_EQUIPPED_EVENT, ROLES_SPAWN, VARIANT,
} from './archetypes';
export type {
  ArchetypeExtApi, ArchetypeOptions, ArchetypeSessionDefaults, ArchetypeTraits, CarryId, CauseDef, CauseInfo, CausesApi,
  ChantDef, CrowdComposition, CrowdMix, CrowdScenario, CrowdSlot, OrgDef, OrgKind, RolesEquippedEvent, SpawnHelperApi,
  UnitOptions, UnitSlot, UnitType, VariantId, VisualFamily,
} from './archetypes';
