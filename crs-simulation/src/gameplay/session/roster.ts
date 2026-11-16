/* =====================================================================================
 * MISE EN PLACE DE SESSION — distribution : qui est créé autour du joueur selon son rôle.
 * Logique pure (aucune création ici) : rend la liste des postes, celui du joueur, les unités et les
 * véhicules stationnés. Les compositions viennent du service 'roles.spawn' (archétypes) quand il est
 * branché ; sinon une composition minimale équivalente est utilisée.
 * ===================================================================================== */

import type {
  Faction, PersonKind, PlayableRole, PolicePoste, PoliceRank, ProtestProfile, SessionConfig, SquadKind, VehicleKind,
} from '@/core/contracts';
import type { SpawnHelperApi, UnitSlot, UnitType } from '@/sim/roles/archetypes/api';

/** Un poste à pourvoir : case d'unité des archétypes, complétée pour les rôles hors unité. */
export interface CastSlot extends UnitSlot {
  profile?: ProtestProfile | null;
  /** Index (dans Cast.squads) de l'unité à laquelle la personne est rattachée ; −1 = aucune. */
  squad: number;
}

export interface CastSquad {
  kind: SquadKind;
  faction: Faction;
  name: string;
  /** Index de l'unité de rattachement dans Cast.squads ; −1 = unité de tête. */
  parent: number;
}

export interface Cast {
  role: PlayableRole;
  slots: CastSlot[];
  /** Index du joueur dans `slots`. */
  player: number;
  squads: CastSquad[];
  vehicles: VehicleKind[];
}

const POLICE_ROLES: readonly PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
];

export function isPoliceRole(role: PlayableRole): boolean {
  return POLICE_ROLES.indexOf(role) >= 0;
}

const POSTES: readonly string[] = [
  'bouclier', 'lanceur', 'lbd', 'extincteur', 'interpellation', 'conducteur', 'operateur', 'chef_groupe', 'chef_section',
  'commandant_unite', 'autorite_civile', 'pilote_moto', 'passager_moto', 'telepilote',
];

/** « Moyens engagés » demandés sur la page d'accueil (SessionConfig.extra.moyens), bornés. */
export interface RequestedMeans {
  sections: number;
  fourgons: number;
  centaure: number;
  canon_eau: number;
  bravm: number;
  drone: number;
}

/** Lit extra.moyens ; null quand la clé est absente (session lancée sans passer par la page d'accueil). */
export function meansOf(config: SessionConfig): RequestedMeans | null {
  const raw = config.extra ? config.extra['moyens'] : undefined;
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const n = (key: string, hi: number): number => {
    const v = Number(m[key]);
    return Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.round(v))) : 0;
  };
  return { sections: n('sections', 16), fourgons: n('fourgons', 48), centaure: n('centaure', 10), canon_eau: n('canon_eau', 10), bravm: n('bravm', 8), drone: n('drone', 4) };
}

function posteOf(config: SessionConfig): PolicePoste | null {
  const v = config.extra ? config.extra['poste'] : undefined;
  return typeof v === 'string' && POSTES.indexOf(v) >= 0 ? (v as PolicePoste) : null;
}

function varianteOf(config: SessionConfig): string {
  const v = config.extra ? config.extra['variante'] : undefined;
  return typeof v === 'string' ? v : '';
}

function slot(kind: PersonKind, poste: PolicePoste | null, rank: PoliceRank | null, label: string, leads: UnitSlot['leads'] = ''): UnitSlot {
  return { kind, poste, rank, section: 1, group: '', label, leads };
}

/** Composition de repli quand le module des archétypes n'est pas branché (mêmes effectifs, moins de détail). */
function fallbackUnit(type: UnitType, drivers: boolean): UnitSlot[] {
  const out: UnitSlot[] = [];
  const push = (n: number, kind: PersonKind, poste: PolicePoste | null, rank: PoliceRank | null, label: string, leads: UnitSlot['leads'] = ''): void => {
    for (let i = 0; i < n; i++) out.push(slot(kind, poste, rank, label, i === 0 ? leads : ''));
  };
  switch (type) {
    case 'groupe_intervention':
      push(1, 'crs', 'chef_groupe', 'brigadier_chef', 'Chef de groupe', 'groupe');
      push(2, 'crs', 'bouclier', 'gardien', 'Porteur de bouclier');
      push(1, 'crs', 'lbd', 'gardien', 'Porteur de LBD');
      push(2, 'crs', 'interpellation', 'gardien', 'Interpellateur');
      break;
    case 'section':
      out.push(...fallbackUnit('groupe_appui', drivers), ...fallbackUnit('groupe_intervention', drivers));
      push(1, 'crs', 'chef_section', 'major', 'Chef de section', 'section');
      push(2, 'crs', 'operateur', 'gardien', 'Radio de section');
      push(1, 'crs', 'lanceur', 'gardien', 'Lanceur de grenades de réserve');
      return out;
    case 'equipage_centaure':
      push(1, 'gendarme', 'operateur', 'major', 'Chef d’engin', 'unite');
      push(1, 'gendarme', 'conducteur', 'gardien', 'Pilote du Centaure');
      push(1, 'gendarme', 'operateur', 'gardien', 'Opérateur du lance-grenades');
      return out;
    case 'equipage_canon_eau':
      push(1, 'crs', 'operateur', 'brigadier_chef', 'Chef d’engin', 'unite');
      push(1, 'crs', 'conducteur', 'gardien', 'Conducteur de l’engin lanceur d’eau');
      push(1, 'crs', 'operateur', 'gardien', 'Opérateur des canons');
      return out;
    case 'equipe_drone':
      push(1, 'telepilote', 'telepilote', 'brigadier_chef', 'Télépilote', 'unite');
      push(1, 'telepilote', 'operateur', 'gardien', 'Opérateur image');
      return out;
    case 'pompiers':
      push(6, 'pompier', null, null, 'Sapeur-pompier', 'unite');
      return out;
    case 'samu':
      push(3, 'samu', null, null, 'Équipe médicale', 'unite');
      return out;
    case 'groupe_appui':
    default:
      push(1, 'crs', 'chef_groupe', 'brigadier_chef', 'Chef de groupe', 'groupe');
      push(3, 'crs', 'bouclier', 'gardien', 'Porteur de bouclier');
      push(1, 'crs', 'lanceur', 'gardien', 'Lanceur de grenades');
      push(1, 'crs', 'extincteur', 'gardien', 'Porte-extincteur');
      break;
  }
  if (drivers) push(1, 'crs', 'conducteur', 'gardien', 'Conducteur du fourgon');
  return out;
}

function unit(helper: SpawnHelperApi | undefined, type: UnitType, drivers = false): UnitSlot[] {
  if (helper) {
    try {
      const slots = helper.policeUnit(type, { section: 1, drivers });
      if (slots.length > 0) return slots;
    } catch (err) {
      console.error(`[session] composition de l'unité « ${type} » indisponible, repli sur la composition minimale`, err);
    }
  }
  return fallbackUnit(type, drivers);
}

function attach(slots: UnitSlot[], squad: number): CastSlot[] {
  return slots.map((s) => ({ ...s, squad }));
}

/** Premier poste correspondant (type de personne et poste), −1 sinon. */
function find(slots: readonly CastSlot[], poste: PolicePoste | null, leads?: UnitSlot['leads']): number {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (leads !== undefined ? s.leads === leads : s.poste === poste) return i;
  }
  return -1;
}

/**
 * Distribution d'une session : le joueur, ses collègues, leurs unités et leurs véhicules.
 * Aucun manifestant n'est créé ici (pas de fausse foule) : la foule viendra du module de foule.
 */
export function castFor(config: SessionConfig, helper: SpawnHelperApi | undefined): Cast {
  const role = config.role;
  const poste = posteOf(config);
  const variante = varianteOf(config);
  const cast: Cast = { role, slots: [], player: 0, squads: [], vehicles: [] };
  const group = (name: string, kind: SquadKind = 'groupe', faction: Faction = 'police', parent = -1): number =>
    cast.squads.push({ kind, faction, name, parent }) - 1;

  switch (role) {
    case 'crs': {
      const want: PolicePoste = poste ?? 'bouclier';
      const intervention = want === 'lbd' || want === 'interpellation';
      const g = group(intervention ? 'Groupe 1B' : 'Groupe 1A');
      cast.slots = attach(unit(helper, intervention ? 'groupe_intervention' : 'groupe_appui', want === 'conducteur'), g);
      cast.player = Math.max(0, find(cast.slots, want));
      cast.vehicles = ['fourgon_crs'];
      break;
    }
    case 'chef_groupe': {
      if (poste === 'chef_section') {
        // section de seize : le groupe de commandement forme l'unité de tête, les groupes A et B lui sont rattachés
        const all = unit(helper, 'section');
        const sec = group('Section 1', 'section');
        const ga = group('Groupe 1A', 'groupe', 'police', sec);
        const gb = group('Groupe 1B', 'groupe', 'police', sec);
        cast.slots = all.map((s) => ({ ...s, squad: s.group === 'A' ? ga : s.group === 'B' ? gb : sec }));
        // composition de repli : pas de lettre de groupe → les six premiers en A, les six suivants en B
        if (all.every((s) => s.group === '')) cast.slots.forEach((s, i) => { s.squad = i < 6 ? ga : i < 12 ? gb : sec; });
        cast.player = Math.max(0, find(cast.slots, 'chef_section'));
        cast.vehicles = ['fourgon_crs', 'fourgon_crs', 'fourgon_crs'];
      } else {
        const g = group('Groupe 1A');
        cast.slots = attach(unit(helper, 'groupe_appui'), g);
        cast.player = Math.max(0, find(cast.slots, 'chef_groupe'));
        cast.vehicles = ['fourgon_crs'];
      }
      break;
    }
    case 'commandant':
    case 'commissaire': {
      // commandant unique (BRIEF §1) : chef d'unité ET autorité habilitée, avec une section et son véhicule de commandement
      const cie = group('Compagnie', 'compagnie');
      const sec = group('Section 1', 'section', 'police', cie);
      const ga = group('Groupe 1A', 'groupe', 'police', sec);
      const gb = group('Groupe 1B', 'groupe', 'police', sec);
      const chef: CastSlot = { ...slot('crs', 'commandant_unite', 'commandant', 'Commandant de compagnie', 'unite'), section: 0, squad: cie };
      const radio: CastSlot = { ...slot('crs', 'operateur', 'gardien', 'Radio du commandant'), section: 0, variant: 'radio', squad: cie };
      const all = unit(helper, 'section');
      const section = all.map((s, i) => ({
        ...s, squad: s.group === 'A' ? ga : s.group === 'B' ? gb : s.group === 'C' ? sec : i < 6 ? ga : i < 12 ? gb : sec,
      }));
      cast.slots = [chef, radio, ...section];
      cast.player = 0;
      cast.vehicles = ['vl_commandement', 'fourgon_crs', 'fourgon_crs', 'fourgon_crs'];
      break;
    }
    case 'bravm': {
      // trois binômes à pied près de leurs machines
      const g = group('BRAV-M 1');
      const want: PolicePoste = poste === 'pilote_moto' ? 'pilote_moto' : 'passager_moto';
      const s: UnitSlot[] = [
        slot('bravm', 'chef_groupe', 'brigadier_chef', 'Chef de groupe (opérateur)', 'groupe'),
        slot('bravm', 'lbd', 'gardien', 'Opérateur porteur de LBD'),
        slot('bravm', 'passager_moto', 'gardien', 'Opérateur'),
        slot('bravm', 'pilote_moto', 'gardien', 'Pilote'),
        slot('bravm', 'pilote_moto', 'gardien', 'Pilote'),
        slot('bravm', 'pilote_moto', 'gardien', 'Pilote'),
      ];
      cast.slots = attach(s, g);
      cast.player = Math.max(0, find(cast.slots, want));
      cast.vehicles = ['moto_bravm', 'moto_bravm', 'moto_bravm'];
      break;
    }
    case 'gendarme_centaure': {
      const g = group('Centaure 1', 'equipage');
      cast.slots = attach(unit(helper, 'equipage_centaure'), g);
      // un seul poste jouable : le conducteur pilote et sert le lance-grenades (l'ancien poste « operateur » y mène)
      void poste;
      cast.player = Math.max(0, find(cast.slots, 'conducteur'));
      cast.vehicles = ['centaure'];
      break;
    }
    case 'operateur_canon_eau': {
      const g = group('Lanceur d’eau 1', 'equipage');
      cast.slots = attach(unit(helper, 'equipage_canon_eau'), g);
      // un seul poste jouable : le conducteur pilote et tient les deux canons
      cast.player = Math.max(0, find(cast.slots, 'conducteur'));
      cast.vehicles = ['canon_eau'];
      break;
    }
    case 'telepilote': {
      const g = group('Équipe drone', 'equipage');
      cast.slots = attach(unit(helper, 'equipe_drone'), g);
      cast.player = Math.max(0, find(cast.slots, 'telepilote'));
      cast.vehicles = ['voiture_police'];
      break;
    }
    case 'secouriste': {
      const samu = variante === 'samu';
      const g = group(samu ? 'SAMU' : 'Sapeurs-pompiers', 'secours', 'rescue');
      cast.slots = attach(unit(helper, samu ? 'samu' : 'pompiers'), g);
      // le joueur n'est pas le chef d'agrès : il tient la lance (ou soigne)
      cast.player = cast.slots.length > 1 ? 1 : 0;
      cast.vehicles = [samu ? 'ambulance' : 'camion_pompiers'];
      break;
    }
    case 'street_medic': {
      const g = group('Secouristes de rue', 'affinite', 'medic');
      const s = slot('street_medic', null, null, 'Secouriste de rue');
      cast.slots = attach([s, { ...s }, { ...s }], g);
      break;
    }
    case 'journaliste': {
      const s = slot('journaliste', null, null, 'Journaliste');
      cast.slots = [{ ...s, squad: -1 }, { ...s, variant: 'reporter_images', squad: -1 }];
      break;
    }
    case 'manifestant':
    default: {
      const profile: ProtestProfile = variante === 'radical' ? 'radical' : variante === 'service_ordre' ? 'service_ordre' : 'pacifique';
      cast.slots = [{ ...slot('manifestant', null, null, 'Manifestant'), profile, squad: -1 }];
      break;
    }
  }

  // le grade choisi sur la page d'accueil s'applique au joueur
  const mine = cast.slots[cast.player];
  if (mine && config.rank && isPoliceRole(role)) mine.rank = config.rank;
  return cast;
}

/** Rang occupé dans la mise en place : 0 = boucliers, 1 = appui et chefs de groupe, 2 = commandement. −1 = au véhicule. */
export function rankOf(s: UnitSlot): number {
  switch (s.poste) {
    case 'bouclier':
      return 0;
    case 'conducteur':
    case 'pilote_moto':
      return -1;
    case 'chef_section':
    case 'commandant_unite':
    case 'autorite_civile':
    case 'operateur':
    case 'telepilote':
      return 2;
    default:
      return 1;
  }
}
