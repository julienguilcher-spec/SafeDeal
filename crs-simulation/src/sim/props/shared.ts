/* =====================================================================================
 * DÉCOR DYNAMIQUE — données internes partagées par les fichiers du module.
 *
 *   PropObj / ShopObj : les objets remis aux autres modules (ils satisfont Prop / Shop du contrat)
 *     portent aussi l'état interne du module — aucun dictionnaire à consulter dans les boucles ;
 *   Kernel : contexte, réglages, générateur aléatoire, aides communes (infractions, tension, effets).
 * ===================================================================================== */

import type {
  EntityId, FxId, GameContext, OffenseType, Person, Prop, PropKind, PropState, Rng, Shop, ShopCategory, SoundId,
  WindowState,
} from '@/core/contracts';
import type { BarricadePart, PropDef, PropsStats, PropsTuning } from './api';
import type { GridItem } from './grid';
import type { ShopDef } from './shop-defs';

// ───────────────────────────── drapeaux d'activité ─────────────────────────────

/** L'objet glisse (poussé, projeté). */
export const ACT_MOVING = 1;
/** L'objet brûle. */
export const ACT_BURNING = 2;
/** L'objet est porté. */
export const ACT_CARRIED = 4;
/** Batterie qui couve : peut se rallumer. */
export const ACT_SMOLDER = 8;

/** Élément d'une barricade, avec ce qu'il faut pour le recréer quand on la démonte. */
export interface PartRec extends BarricadePart {
  kind: PropKind;
  lx: number;
  lz: number;
  heading: number;
  halfX: number;
  halfZ: number;
  height: number;
  hp: number;
  fuel: number;
  state: PropState;
  toppled: boolean;
  battery: boolean;
  bulk: number;
  movedBy: EntityId;
}

export class PropObj implements Prop, GridItem {
  // ── contrat ──
  readonly id: EntityId;
  kind: PropKind;
  x: number;
  y = 0;
  z: number;
  heading: number;
  halfX: number;
  halfZ: number;
  height: number;
  hp: number;
  state: PropState = 'intact';
  burning = 0;
  fuel: number;
  movable: boolean;
  toppled = false;
  blocksMove: boolean;
  blocksSight: boolean;
  tags = 0;
  carriedBy: EntityId = 0;
  vx = 0;
  vz = 0;
  dormant = false;

  // ── index spatial ──
  gx0 = 0;
  gx1 = 0;
  gz0 = 0;
  gz1 = 0;
  gIn = false;
  gStamp = 0;
  /** Position, cap et gabarit au moment de la dernière inscription dans l'index. */
  ix = 0;
  iz = 0;
  ih = 0;
  ihx = 0;
  ihz = 0;

  // ── état interne ──
  def: PropDef;
  maxHp: number;
  /** Position dans la liste du magasin (−1 = retiré). */
  slot = -1;
  /** Combinaison des drapeaux ACT_*. */
  act = 0;
  /** Tuile d'origine (clé) et numéro d'ordre dans cette tuile ; −1 = objet créé en cours de partie. */
  tile = -1;
  serial = -1;
  /** L'état a changé depuis la création (à mémoriser si la tuile est déchargée). */
  dirty = false;
  /** Gabarit debout (pour le renversement). */
  standHalfX: number;
  standHalfZ: number;
  standHeight: number;
  /** Géométrie « renversé » déjà appliquée. */
  toppledDone = false;
  /** Vitrage restant et panneaux intacts. */
  glass: number;
  panes: number;
  /** Feu : combustible initial, progression vers l'embrasement, auteur présumé. */
  fuelMax: number;
  heat = 0;
  heatBy: EntityId = 0;
  igniterId: EntityId = 0;
  /** État avant l'incendie (repris si le feu est éteint à temps). */
  preFire: PropState = 'intact';
  /** Agent extincteur accumulé et instant du dernier arrosage. */
  suppress = 0;
  dousedAt = -1e9;
  /** Mouillé : ne s'enflamme pas avant cet instant. */
  wetUntil = 0;
  /** Prochaine échéance périodique du feu et compteur de périodes. */
  fireNext = 0;
  fireTicks = 0;
  /** Couplage avec les nappes de feu de ctx.hazards (voir fire.ts). */
  coupled = false;
  missed = 0;
  /** Batterie présente ; instant d'une reprise de feu programmée (0 = aucune). */
  battery = false;
  reigniteAt = 0;
  /** Dernier passage du balayage lent. */
  sweptAt = 0;
  /** Déplacé par quelqu'un : dernier auteur, instant ; sert aux barricades et aux infractions. */
  movedBy: EntityId = 0;
  movedAt = -1e9;
  /** Dernière émission de prop:moved. */
  movedEventAt = -1e9;
  /** Ressource restante à ramasser. */
  yieldLeft: number;
  /** Barricade : éléments ; null pour tout autre objet. */
  parts: PartRec[] | null = null;
  /** Volume total (barricade). */
  bulk = 0;
  /** Contrôle de regroupement programmé à cet instant (0 = aucun) et marque de parcours. */
  clusterAt = 0;
  mark = 0;

  constructor(id: EntityId, kind: PropKind, def: PropDef, x: number, z: number, heading: number) {
    this.id = id;
    this.kind = kind;
    this.def = def;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.halfX = def.halfX;
    this.halfZ = def.halfZ;
    this.height = def.height;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.fuel = def.fuel;
    this.fuelMax = def.fuel;
    this.movable = def.movable;
    this.blocksMove = def.blocksMove;
    this.blocksSight = def.blocksSight;
    this.standHalfX = def.halfX;
    this.standHalfZ = def.halfZ;
    this.standHeight = def.height;
    this.glass = def.glassHp;
    this.panes = def.panes;
    this.yieldLeft = def.yieldStock;
  }
}

export class ShopObj implements Shop {
  // ── contrat ──
  readonly id: EntityId;
  name: string;
  category: ShopCategory;
  x: number;
  y = 0;
  z: number;
  heading: number;
  width: number;
  window: WindowState = 'intact';
  shutter = 0;
  stock = 1;
  appeal = 0.3;
  burning = 0;
  occupants = 0;
  dormant = false;

  // ── état interne ──
  def: ShopDef;
  slot = -1;
  gridSlot = -1;
  tile = -1;
  serial = -1;
  dirty = false;
  /** Vitrage : résistance restante et initiale. */
  glass: number;
  glassMax: number;
  /** Panneaux de bois : résistance restante (0 = aucun). */
  boards = 0;
  boardsMax = 0;
  tags = 0;
  /** Rideau : présent, résistance, forcé, position visée, vitesse de manœuvre (1/s). */
  hasShutter = true;
  shutterHp: number;
  forced = false;
  target = 0;
  speed = 0;
  /** Le rideau est dans la liste des rideaux en mouvement. */
  rolling = false;
  /** Le rideau a été signalé fermé (événement shop:shutter). */
  closedSent = false;
  /** Sang-froid du commerçant (tension qui le fait fermer) et instant où il a décidé de fermer. */
  nerve: number;
  decidedAt = -1;
  calmSince = -1;
  /** Vitrine brisée sous ses yeux : il ferme au plus vite, quelle que soit la tension. */
  urgent = false;
  /** Le commerçant a quitté les lieux (boutique pillée ou incendiée) : plus personne ne manœuvre le rideau. */
  abandoned = false;
  /** Charges de butin au départ. */
  loads: number;
  maxOccupants: number;
  /** Feu : combustible, chaleur reçue, auteur, extinction. */
  fuel: number;
  fuelMax: number;
  heat = 0;
  igniterId: EntityId = 0;
  suppress = 0;
  dousedAt = -1e9;
  inFire = false;
  burnt = false;
  fireNext = 0;
  fireTicks = 0;
  /** Dernière hausse de tension pour pillage (limite le cumul). */
  lootTensionAt = -1e9;
  sweptAt = 0;

  constructor(id: EntityId, category: ShopCategory, def: ShopDef, x: number, z: number, heading: number, width: number) {
    this.id = id;
    this.category = category;
    this.name = '';
    this.def = def;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.width = width;
    this.glass = def.glassHp;
    this.glassMax = def.glassHp;
    this.shutterHp = def.shutterHp;
    this.nerve = def.nerve;
    this.loads = def.loads;
    this.maxOccupants = 2;
    this.fuel = 0;
    this.fuelMax = 0;
  }
}

// ───────────────────────────── réglages ─────────────────────────────

export function defaultTuning(): PropsTuning {
  return {
    ambientDensity: 1,
    dormancy: true,
    wakeRadius: 260,
    shopkeepers: true,
    damageScale: 1,
    fireSpread: 1,
    blade: 'auto',
    populateBudget: 80,
    consequences: true,
  };
}

export function emptyStats(): PropsStats {
  return {
    props: 0, shops: 0, awake: 0, moving: 0, carried: 0, burning: 0, burningShops: 0, barricades: 0, tiles: 0,
    pendingTiles: 0, windowsBroken: 0, looted: 0, firesStarted: 0, barricadesBuilt: 0,
  };
}

// ───────────────────────────── noyau ─────────────────────────────

/** Hausses de tension (docs/research/00-bible-realisme.md, table F.4). */
export const TENSION = {
  tag: 0.01,
  degradation: 0.01,
  casse: 0.02,
  vitrine: 0.03,
  pillage: 0.06,
  feuObjet: 0.04,
  feuPropage: 0.02,
  feuBoutique: 0.1,
  barricade: 0.06,
  feuEteint: -0.04,
} as const;

export class Kernel {
  ctx!: GameContext;
  rng!: Rng;
  tuning: PropsTuning = defaultTuning();
  stats: PropsStats = emptyStats();

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng.fork('props');
  }

  /** Début de session : générateur re-dérivé de la graine de la session. */
  reset(): void {
    this.rng = this.ctx.rng.fork('props');
    const s = this.stats;
    s.windowsBroken = 0;
    s.looted = 0;
    s.firesStarted = 0;
    s.barricadesBuilt = 0;
  }

  person(id: EntityId): Person | null {
    if (id === 0) return null;
    return this.ctx.people.get(id) ?? null;
  }

  /** La personne répond-elle pénalement de ses dégradations (tout le monde sauf forces de l'ordre et secours) ? */
  isOffender(p: Person | null): p is Person {
    return p !== null && p.faction !== 'police' && p.faction !== 'rescue';
  }

  /**
   * Déclare une infraction commise par `byId` (ignorée pour les forces de l'ordre, les secours et les
   * causes inconnues) et ajoute la tension correspondante. Retourne true si une infraction a été déclarée.
   */
  offense(byId: EntityId, type: OffenseType, x: number, z: number, tension: number, reason: string): boolean {
    if (!this.tuning.consequences) return false;
    const p = this.person(byId);
    if (!this.isOffender(p)) return false;
    // le même geste déclaré deux fois de suite (plusieurs coups dans la seconde) ne fait qu'une infraction
    const list = p.offenses;
    const now = this.ctx.clock.now;
    let dup = false;
    for (let i = list.length - 1; i >= 0 && i >= list.length - 3; i--) {
      const o = list[i]!;
      if (o.type === type && now - o.t < 1) {
        dup = true;
        break;
      }
    }
    if (!dup) this.ctx.law.recordOffense(p, type, x, z);
    if (tension !== 0) this.ctx.director.addTension(tension, x, z, reason);
    return true;
  }

  tension(amount: number, x: number, z: number, reason: string): void {
    if (this.tuning.consequences && amount !== 0) this.ctx.director.addTension(amount, x, z, reason);
  }

  fx(id: FxId, x: number, y: number, z: number, size: number, color?: number): void {
    if (color === undefined) this.ctx.events.emit('fx', { id, x, y, z, size });
    else this.ctx.events.emit('fx', { id, x, y, z, size, color });
  }

  sfx(id: SoundId, x: number, y: number, z: number, volume = 1, pitch = 1): void {
    this.ctx.events.emit('sfx', { id, x, y, z, volume, pitch });
  }
}

/** Clé entière d'une tuile (tx, tz dans ±16 384). */
export function tileKey(tx: number, tz: number): number {
  return ((tx + 16384) << 15) | (tz + 16384);
}
