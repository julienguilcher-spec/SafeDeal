/* =====================================================================================
 * ARCHÉTYPES — services publiés : ctx.archetypes / « roles.archetypes » (ArchetypeExtApi) et
 * « roles.spawn » (SpawnHelperApi). Les méthodes sont des fermetures : elles peuvent être
 * détachées de leur objet sans perdre leur contexte.
 * ===================================================================================== */

import type {
  ArchetypeApi, EntityId, ItemId, Person, PersonKind, PolicePoste, ProtestProfile, Rng,
} from '@/core/contracts';
import { CARRY, FAMILY_IDS, VARIANT } from './api';
import type {
  ArchetypeExtApi, ArchetypeOptions, ArchetypeSessionDefaults, ArchetypeTraits, CrowdComposition, CrowdScenario,
  CrowdSlot, SpawnHelperApi, UnitOptions, UnitSlot, UnitType, VisualFamily,
} from './api';
import { CAUSES } from './causes';
import { CIVIL_KITS, CIVIL_LABELS, isCivilKind } from './civil';
import type { ArchetypeCore } from './core';
import { exNum } from './core';
import { buildBystanders, buildCrowd } from './crowd';
import { equipPerson, redress } from './equip';
import { loadKg } from './load';
import { isPoliceKind, isPolicePoste, POLICE_OUTFITS, policeKit, posteDef, rankLabel } from './police';
import { FAMILY_DEFS, familyAt, familyIndex, isProtestProfile, PROFILE_LABELS, profileKit } from './protest';
import { spawnPerson } from './spawn';
import { isTiersKind, TIERS_KITS, TIERS_LABELS } from './tiers';
import { policeUnit, UNIT_TYPES } from './units';

const GROUP_LETTERS = ['', 'A', 'B', 'C'];

function spawnEx(core: ArchetypeCore, kind: PersonKind, x: number, z: number, opts: ArchetypeOptions = {}): Person {
  const {
    family, cause, variant, carry, child, bloc, unmarked, company, section, group, org, signText, ...base
  } = opts;
  const ex: Record<string, number> = base.look && base.look.extras ? { ...base.look.extras } : {};
  if (family !== undefined) ex.family = familyIndex(family);
  if (cause !== undefined) {
    const c = CAUSES.get(cause);
    if (c) ex.cause = c.index;
  }
  if (variant !== undefined) ex.variant = VARIANT[variant] ?? 0;
  if (carry !== undefined) ex.carry = CARRY[carry] ?? 0;
  if (child !== undefined) ex.child = child ? 1 : 0;
  if (bloc !== undefined) ex.bloc = bloc ? 1 : 0;
  if (unmarked !== undefined) ex.unmarked = unmarked ? 1 : 0;
  if (company !== undefined) ex.company = company;
  if (section !== undefined) ex.section = section;
  if (group !== undefined) ex.group = GROUP_LETTERS.indexOf(group);
  if (org !== undefined) ex.org = org;
  if (signText !== undefined) ex.signText = signText;
  return spawnPerson(core, kind, x, z, { ...base, look: { ...base.look, extras: ex } });
}

function traitsOf(core: ArchetypeCore, id: EntityId): ArchetypeTraits | null {
  const it = core.identities.get(id);
  if (!it) return null;
  return { seed: it.seed, sex: it.sex, age: it.age, fitness: it.fitness, family: familyAt(it.family), cause: it.cause };
}

function kitOf(kind: PersonKind, role: PolicePoste | ProtestProfile | null): readonly ItemId[] {
  if (isPoliceKind(kind)) return policeKit(kind, role !== null && isPolicePoste(role) ? role : null);
  if (kind === 'manifestant') return profileKit(role !== null && isProtestProfile(role) ? role : null);
  if (isTiersKind(kind)) return TIERS_KITS[kind];
  return CIVIL_KITS[isCivilKind(kind) ? kind : 'passant'];
}

/** Service publié sous ctx.archetypes et sous « roles.archetypes ». */
export function createApi(core: ArchetypeCore): ArchetypeExtApi {
  const base: ArchetypeApi = {
    spawn: (kind, x, z, opts) => spawnPerson(core, kind, x, z, opts),
    equip: (p, role) => equipPerson(core, p, role),
  };
  return {
    ...base,
    spawnEx: (kind, x, z, opts) => spawnEx(core, kind, x, z, opts),
    setBlocAttire(p: Person, on: boolean): boolean {
      if (p.kind !== 'manifestant' || p.look.height < 1.5) return false;
      const family = familyAt(exNum(p.look.extras, 'family', core.identityOf(p).family));
      redress(core, p, p.profile, family, on, false);
      return true;
    },
    inBlocAttire: (p) => exNum(p.look.extras, 'bloc', 0) === 1,
    setFamily(p: Person, family: VisualFamily): boolean {
      if (p.kind !== 'manifestant' || FAMILY_IDS.indexOf(family) < 0) return false;
      const old = p.look.extras;
      // nouvelle famille : l'organisation et la tenue du bloc ne suivent pas d'office
      if (old && old.org !== undefined) {
        const next: Record<string, number> = { ...old };
        delete next.org;
        p.look.extras = next;
        core.identityOf(p).org = -1;
      }
      redress(core, p, p.profile, family, family === 'black_bloc', true);
      return true;
    },
    traits: (id) => traitsOf(core, id),
    familyOf: (p) => familyAt(exNum(p.look.extras, 'family', 0)),
    causeOf: (p) => exNum(p.look.extras, 'cause', -1) | 0,
    groupCode(p: Person): string {
      const ex = p.look.extras;
      const section = exNum(ex, 'section', 0) | 0;
      const group = exNum(ex, 'group', 0) | 0;
      return section >= 1 && group >= 1 && group <= 3 ? String(section) + GROUP_LETTERS[group]! : '';
    },
    loadKg: (p) => loadKg(core.ctx, p),
    kindLabel(kind: PersonKind): string {
      if (isPoliceKind(kind)) return POLICE_OUTFITS[kind].label;
      if (kind === 'manifestant') return 'Manifestant';
      if (isTiersKind(kind)) return TIERS_LABELS[kind];
      return CIVIL_LABELS[isCivilKind(kind) ? kind : 'passant'];
    },
    posteLabel: (poste) => posteDef(poste).label,
    profileLabel: (profile) => (profile ? PROFILE_LABELS[profile] ?? '' : ''),
    rankLabel: (rank) => rankLabel(rank),
    familyLabel: (family) => FAMILY_DEFS[family]?.label ?? '',
    kitOf,
    get session(): Readonly<ArchetypeSessionDefaults> {
      return core.sessionDefaults;
    },
    setSession(defaults: Partial<ArchetypeSessionDefaults>): void {
      if (defaults.cause !== undefined && CAUSES.list[defaults.cause]) {
        core.sessionDefaults.cause = defaults.cause;
        core.loadCauseMix();
      }
      if (defaults.company !== undefined && Number.isInteger(defaults.company) && defaults.company > 0) {
        core.sessionDefaults.company = defaults.company;
      }
    },
  };
}

/** Service publié sous « roles.spawn ». */
export function createHelper(core: ArchetypeCore): SpawnHelperApi {
  return {
    unitTypes: UNIT_TYPES,
    crowd(
      cause: string | number, count: number,
      composition?: CrowdComposition | Readonly<Partial<Record<VisualFamily, number>>> | null, rng?: Rng,
    ): CrowdSlot[] {
      const info = CAUSES.get(cause) ?? CAUSES.list[core.sessionDefaults.cause]!;
      return buildCrowd(info, count, composition, rng ?? core.rng);
    },
    bystanders: (count: number, scenario: CrowdScenario = 'journee_tendue', rng?: Rng) =>
      buildBystanders(count, scenario, rng ?? core.rng),
    policeUnit: (type: UnitType, opts?: UnitOptions) => policeUnit(type, opts),
    spawnSlot(slot: CrowdSlot, x: number, z: number, opts: ArchetypeOptions = {}): Person {
      const o: ArchetypeOptions = { ...opts };
      if (slot.kind === 'manifestant') {
        o.profile = slot.profile;
        o.family = slot.family;
        if (slot.carry !== undefined) o.carry = slot.carry;
        if (slot.child) o.child = true;
        if (slot.org !== undefined && o.org === undefined) o.org = slot.org;
      }
      if (slot.variant !== undefined) o.variant = slot.variant;
      return spawnEx(core, slot.kind, x, z, o);
    },
    spawnUnitSlot(slot: UnitSlot, x: number, z: number, opts: ArchetypeOptions = {}): Person {
      const o: ArchetypeOptions = { ...opts };
      if (isPoliceKind(slot.kind)) {
        o.poste = slot.poste;
        if (slot.rank !== null) o.rank = slot.rank;
        o.section = slot.section;
        if (slot.group) o.group = slot.group;
      }
      if (slot.variant !== undefined) o.variant = slot.variant;
      return spawnEx(core, slot.kind, x, z, o);
    },
  };
}
