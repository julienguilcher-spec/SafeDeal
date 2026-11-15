/* =====================================================================================
 * Magasin des personnes (PeopleStore) : tableau dense, accès par identifiant, index spatial.
 *
 *   - spawn() crée une personne « nue » : TOUS les champs de Person ont une valeur cohérente
 *     (apparence complète et déterministe, commande neutre, vitesses 1,4 / 3,2 / 5,5 m/s…),
 *     sans dotation : tenues détaillées et équipement relèvent d'ArchetypeApi ;
 *   - index spatial : la personne est indexée dès spawn() ; rebuildIndex() le remet à jour après
 *     les déplacements (le moteur l'appelle aussi au début de chaque pas de simulation).
 *     Les personnes `dormant` ne sont pas indexées : les requêtes spatiales les ignorent ;
 *   - événements : person:spawned après la création ; person:removed pendant le retrait — la
 *     personne n'est alors plus dans `list` ni dans l'index, mais get(id) la renvoie encore le
 *     temps de l'événement (pour que les abonnés puissent lire son état une dernière fois).
 *     clear() émet person:removed pour chaque personne.
 * ===================================================================================== */

import type {
  EntityId, Faction, GameContext, HeadgearId, OutfitId, PeopleStore, Person, PersonInit, PersonKind,
  PersonLook, PoliceRank, PolicePoste,
} from './contracts';
import { clamp } from './math';
import { createRng, gaussian, hash2 } from './rng';
import { SpatialHash } from './spatial';

/** Vitesses de référence d'un adulte (m/s) : marche, course, sprint. */
export const PERSON_SPEED_WALK = 1.4;
export const PERSON_SPEED_RUN = 3.2;
export const PERSON_SPEED_SPRINT = 5.5;
/** Rayon de collision d'une personne (m). */
export const PERSON_RADIUS = 0.28;
/** Taille des cellules de l'index spatial des personnes (m). */
export const PEOPLE_CELL_SIZE = 3;

interface KindDefaults {
  faction: Faction;
  /** Libellé français utilisé pour le nom par défaut (« CRS 12 »). */
  label: string;
  outfit: OutfitId;
  headgear: HeadgearId;
  backText: PersonLook['backText'];
  /** Couleurs imposées par la tenue (−1 = tirées dans la palette civile). */
  top: number;
  bottom: number;
  shoes: number;
  armorHead: number;
  armorBody: number;
  rank: PoliceRank | null;
  poste: PolicePoste | null;
  sash: boolean;
  armband: number;
  vest: number;
}

const NAVY = 0x161b2e;
const BLACK = 0x101114;

function kd(
  faction: Faction, label: string, outfit: OutfitId, headgear: HeadgearId, backText: PersonLook['backText'],
  top: number, bottom: number, shoes: number, armorHead: number, armorBody: number,
  rank: PoliceRank | null = null, poste: PolicePoste | null = null, sash = false, armband = 0, vest = 0,
): KindDefaults {
  return { faction, label, outfit, headgear, backText, top, bottom, shoes, armorHead, armorBody, rank, poste, sash, armband, vest };
}

const KIND_DEFAULTS: Record<PersonKind, KindDefaults> = {
  crs: kd('police', 'CRS', 'crs_mo', 'casque_crs', 'CRS', NAVY, NAVY, BLACK, 0.85, 0.7, 'gardien'),
  commissaire: kd('police', 'Commissaire', 'commissaire', 'casquette_police', 'POLICE', NAVY, NAVY, BLACK, 0.2, 0.3, 'commissaire', 'autorite_civile', true),
  bravm: kd('police', 'BRAV-M', 'bravm', 'casque_moto', 'POLICE', BLACK, NAVY, BLACK, 0.8, 0.5, 'gardien'),
  gendarme: kd('police', 'Gendarme', 'gendarme_mo', 'casque_gendarme', 'GENDARMERIE', 0x1b2233, 0x1b2233, BLACK, 0.85, 0.7, 'gardien'),
  policier_civil: kd('police', 'Policier', 'police_civil', 'none', 'POLICE', -1, -1, -1, 0, 0.2, 'gardien', null, false, 0xe8451e),
  telepilote: kd('police', 'Télépilote', 'crs_service', 'calot', 'POLICE', NAVY, NAVY, BLACK, 0, 0.2, 'brigadier', 'telepilote'),
  pompier: kd('rescue', 'Pompier', 'pompier', 'casque_pompier', 'SECOURS', 0x1c2238, 0x1c2238, BLACK, 0.8, 0.5),
  samu: kd('rescue', 'SAMU', 'samu', 'none', 'SAMU', 0xf2f2ee, 0xf2f2ee, 0xe6e6e6, 0, 0),
  manifestant: kd('protest', 'Manifestant', 'civil', 'none', '', -1, -1, -1, 0, 0),
  street_medic: kd('medic', 'Street medic', 'street_medic', 'casque_medic', '', -1, -1, -1, 0.5, 0),
  journaliste: kd('press', 'Journaliste', 'presse', 'casque_presse', 'PRESSE', -1, -1, -1, 0.5, 0),
  observateur: kd('civil', 'Observateur', 'observateur', 'none', 'OBSERVATEUR', -1, -1, -1, 0, 0, null, null, false, 0, 0x2f6fd0),
  passant: kd('civil', 'Passant', 'civil', 'none', '', -1, -1, -1, 0, 0),
  touriste: kd('civil', 'Touriste', 'civil', 'none', '', -1, -1, -1, 0, 0),
  commercant: kd('civil', 'Commerçant', 'civil', 'none', '', -1, -1, -1, 0, 0),
  conducteur: kd('civil', 'Conducteur', 'civil', 'none', '', -1, -1, -1, 0, 0),
  vip: kd('civil', 'Personnalité', 'costume', 'none', '', 0x1d2230, 0x1d2230, BLACK, 0, 0),
};

/** Nombre de galons affichés par défaut selon le grade (approximation ; affinée par les archétypes). */
const RANK_BARS: Record<PoliceRank, number> = {
  gardien_stagiaire: 0, gardien: 1, brigadier: 2, brigadier_chef: 3, major: 4,
  capitaine: 3, commandant: 4, commissaire: 5,
};

const SKIN_TONES = [0xf3d4bd, 0xe8c1a3, 0xd9a981, 0xc08a62, 0x9a6845, 0x70482f, 0x4f3323];
const HAIR_COLORS = [0x17120f, 0x2b1d14, 0x4a3021, 0x6e4a2b, 0x9a7446, 0xc9a55f, 0x8c3f1f, 0x8d8d8d, 0xd8d8d2];
const TOP_COLORS = [
  0x23272e, 0x34383f, 0x4a4f57, 0x6b6f76, 0x8c8f93, 0xcfcfc9, 0xe9e7df, 0x1f2a44, 0x2f4468, 0x4f6a8a,
  0x3d4a36, 0x55613f, 0x6b2f2f, 0x8c3b34, 0x7a5a3a, 0xa08257, 0x5a3f5c, 0xb9963d, 0x2f5a57,
];
const BOTTOM_COLORS = [0x1b1d22, 0x2a2d33, 0x23304a, 0x2f4263, 0x43597a, 0x4a4a48, 0x6a655c, 0x8c806a, 0x3a3328];
const SHOE_COLORS = [0x141414, 0x2a2a2c, 0x4a3524, 0x6b6b6b, 0xe8e8e4];
const CIVIL_HEADGEAR: readonly HeadgearId[] = ['capuche', 'casquette', 'bonnet'];

function isDormant(p: Person): boolean {
  return p.dormant;
}

class PeopleStoreImpl implements PeopleStore {
  readonly list: Person[] = [];
  private readonly byId = new Map<EntityId, Person>();
  /** Identifiant → index dans `list`. */
  private readonly indexOf = new Map<EntityId, number>();
  private readonly grid = new SpatialHash<Person>(PEOPLE_CELL_SIZE, 1024);

  constructor(private readonly ctx: GameContext) {}

  get(id: EntityId): Person | undefined {
    return this.byId.get(id);
  }

  spawn(init: PersonInit): Person {
    const ctx = this.ctx;
    const id = ctx.newId();
    const kind = init.kind;
    const d = KIND_DEFAULTS[kind] ?? KIND_DEFAULTS.passant;
    const faction = init.faction ?? d.faction;
    // Graine d'apparence : celle fournie, sinon dérivée de la graine de session et de l'identifiant.
    const seed = init.seed !== undefined ? init.seed : hash2(sessionSeed(ctx), id);
    const rng = createRng(seed);
    const heading = init.heading ?? 0;
    const rank = init.rank !== undefined ? init.rank : d.rank;
    const poste = init.poste !== undefined ? init.poste : d.poste;

    const civilHat = kind === 'manifestant' || kind === 'passant' || kind === 'touriste';
    const height = clamp(gaussian(rng, 1.72, 0.075), 1.5, 1.98);
    const build = clamp(gaussian(rng, 1.0, 0.08), 0.85, 1.25);
    const skin = rng.pick(SKIN_TONES);
    const hair = rng.pick(HAIR_COLORS);
    const hairStyle = rng.int(0, 6);
    const top = rng.pick(TOP_COLORS);
    const bottom = rng.pick(BOTTOM_COLORS);
    const shoes = rng.pick(SHOE_COLORS);
    const hatRoll = rng.next();
    const hat = rng.pick(CIVIL_HEADGEAR);
    const backpackRoll = rng.next();
    const rio = String(1000000 + rng.int(0, 9000000));

    const look: PersonLook = {
      height,
      build,
      skin,
      hair,
      hairStyle,
      top: d.top >= 0 ? d.top : top,
      bottom: d.bottom >= 0 ? d.bottom : bottom,
      shoes: d.shoes >= 0 ? d.shoes : shoes,
      outfit: d.outfit,
      headgear: civilHat && d.headgear === 'none' && hatRoll < 0.3 ? hat : d.headgear,
      visorDown: false,
      gasMask: false,
      faceCover: false,
      backText: d.backText,
      sash: d.sash,
      armband: d.armband,
      vest: d.vest,
      rankBars: rank ? RANK_BARS[rank] ?? 0 : 0,
      backpack: faction !== 'police' && faction !== 'rescue' && backpackRoll < 0.3,
    };
    if (init.look) Object.assign(look, init.look);

    const p: Person = {
      id,
      kind,
      faction,
      name: init.name ?? `${d.label} ${id}`,
      x: init.x,
      z: init.z,
      y: ctx.world.heightAt(init.x, init.z),
      vx: 0,
      vz: 0,
      heading,
      aimYaw: heading,
      aimPitch: 0,
      radius: PERSON_RADIUS,
      speedWalk: PERSON_SPEED_WALK,
      speedRun: PERSON_SPEED_RUN,
      speedSprint: PERSON_SPEED_SPRINT,
      health: 100,
      injury: 'none',
      stamina: 100,
      gas: 0,
      stun: 0,
      burning: 0,
      wet: 0,
      posture: 'stand',
      upper: 'none',
      upperT: 0,
      armorHead: d.armorHead,
      armorBody: d.armorBody,
      gasProtection: 0,
      fear: 0,
      anger: 0,
      profile: init.profile !== undefined ? init.profile : null,
      rank,
      poste,
      rio: faction === 'police' ? rio : '',
      inventory: init.inventory ? init.inventory.map(copyStack) : [],
      active: -1,
      alt: false,
      look,
      squadId: 0,
      vehicleId: 0,
      seat: -1,
      carrying: 0,
      heldBy: 0,
      offenses: [],
      custody: 'free',
      isPlayer: false,
      cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: heading, aimPitch: 0, faceMove: true, crouch: false, jump: false },
      brain: null,
      dormant: false,
    };

    this.indexOf.set(id, this.list.length);
    this.list.push(p);
    this.byId.set(id, p);
    this.grid.insert(p);
    // rattachement à l'unité demandée (sans effet si elle n'existe pas)
    if (init.squadId) ctx.squads.addMember(init.squadId, id);
    ctx.events.emit('person:spawned', { id });
    return p;
  }

  remove(id: EntityId): void {
    const p = this.byId.get(id);
    if (!p) return;
    const idx = this.indexOf.get(id);
    if (idx === undefined) return; // retrait déjà en cours (appel ré-entrant depuis person:removed)
    const last = this.list[this.list.length - 1]!;
    this.list[idx] = last;
    this.indexOf.set(last.id, idx);
    this.list.pop();
    this.indexOf.delete(id);
    this.grid.removeItem(p);
    this.unlink(p);
    this.ctx.events.emit('person:removed', { id });
    this.byId.delete(id);
  }

  clear(): void {
    const all = this.list.slice();
    this.list.length = 0;
    this.indexOf.clear();
    this.grid.clear();
    for (let i = 0; i < all.length; i++) this.ctx.events.emit('person:removed', { id: all[i]!.id });
    this.byId.clear();
  }

  queryRadius(x: number, z: number, r: number, out: Person[], filter?: (p: Person) => boolean): number {
    return this.grid.query(x, z, r, out, filter);
  }

  nearest(x: number, z: number, r: number, filter?: (p: Person) => boolean): Person | null {
    return this.grid.nearest(x, z, r, filter);
  }

  countIn(x: number, z: number, r: number, filter?: (p: Person) => boolean): number {
    return this.grid.count(x, z, r, filter);
  }

  rebuildIndex(): void {
    this.grid.rebuild(this.list, isDormant);
  }

  /** Défait les liens qui pointent vers la personne retirée (siège, portage). */
  private unlink(p: Person): void {
    const ctx = this.ctx;
    if (p.vehicleId !== 0) {
      const v = ctx.vehicles.get(p.vehicleId);
      if (v && p.seat >= 0 && v.seats[p.seat] === p.id) v.seats[p.seat] = 0;
    }
    if (p.heldBy !== 0) {
      const holder = this.byId.get(p.heldBy);
      if (holder && holder.carrying === p.id) holder.carrying = 0;
    }
    if (p.carrying !== 0) {
      const carried = this.byId.get(p.carrying);
      if (carried) {
        if (carried.heldBy === p.id) carried.heldBy = 0;
      } else {
        const prop = ctx.props.get(p.carrying);
        if (prop && prop.carriedBy === p.id) prop.carriedBy = 0;
      }
    }
  }
}

function copyStack(s: { id: string; count: number; state: number; cooldown: number }) {
  return { id: s.id, count: s.count, state: s.state, cooldown: s.cooldown };
}

/** Graine de session si le générateur du contexte l'expose, sinon 0. */
function sessionSeed(ctx: GameContext): number {
  const s = (ctx.rng as { seed?: unknown }).seed;
  return typeof s === 'number' ? s : 0;
}

/** Faction par défaut d'un type de personne. */
export function defaultFactionOf(kind: PersonKind): Faction {
  return (KIND_DEFAULTS[kind] ?? KIND_DEFAULTS.passant).faction;
}

export function createPeopleStore(ctx: GameContext): PeopleStore {
  return new PeopleStoreImpl(ctx);
}
