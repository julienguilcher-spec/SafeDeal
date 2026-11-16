/* =====================================================================================
 * État partagé du module et petites aides communes (personnes, protections, droit, effets).
 * ===================================================================================== */

import type {
  EntityId, ForceMeans, FxId, GameContext, ItemId, ItemStack, OffenseType, Person, Prop, RayHit, Rng, Shop,
  SoundId, UseFailure, UseResult,
} from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { createRng, gaussian } from '@/core/rng';
import type { ItemsTuning, LauncherRange, ProjectileClass } from './api';
import { LAUNCHER_RANGE_EVENT } from './api';

// ───────────────────────────── résultats d'usage ─────────────────────────────

/** Résultats partagés (gelés) : aucun objet n'est créé pour un refus ou un succès sans projectile. */
export const USE_OK: UseResult = Object.freeze({ ok: true });
const FAILURES: Record<UseFailure, UseResult> = {
  no_item: Object.freeze({ ok: false, reason: 'no_item' as const }),
  cooldown: Object.freeze({ ok: false, reason: 'cooldown' as const }),
  empty: Object.freeze({ ok: false, reason: 'empty' as const }),
  posture: Object.freeze({ ok: false, reason: 'posture' as const }),
  blocked: Object.freeze({ ok: false, reason: 'blocked' as const }),
  forbidden: Object.freeze({ ok: false, reason: 'forbidden' as const }),
};

export function useFail(reason: UseFailure): UseResult {
  return FAILURES[reason];
}

// ───────────────────────────── personnes ─────────────────────────────

/** Étourdissement (s) au-delà duquel on ne peut plus se servir d'un objet. */
export const STUN_BLOCK = 0.25;
/** Niveau de feu sur soi au-delà duquel on ne peut plus se servir d'un objet. */
export const BURNING_BLOCK = 0.4;
/** Protection apportée par le masque à gaz. */
export const MASK_PROTECTION = 0.9;

export function isPolice(p: Person): boolean {
  return p.faction === 'police';
}

/** Hauteur du corps (m) selon la posture : sert aux collisions des projectiles et aux zones touchées. */
export function bodyHeight(p: Person): number {
  const h = p.look.height;
  switch (p.posture) {
    case 'crouch': return h * 0.68;
    case 'kneel': return h * 0.72;
    case 'sit':
    case 'seated': return h * 0.6;
    case 'prone':
    case 'down': return 0.35;
    default: return h;
  }
}

/** Gêne due au gaz, protection déduite (0..1). */
export function gasEffect(p: Person): number {
  const prot = p.gasProtection < 0 ? 0 : p.gasProtection > 1 ? 1 : p.gasProtection;
  return p.gas * (1 - prot);
}

/** Objet en main (ou null). */
export function activeStack(p: Person): ItemStack | null {
  return p.active >= 0 ? p.inventory[p.active] ?? null : null;
}

/** Identifiant de l'objet en main ('' si mains nues). */
export function activeId(p: Person): string {
  const s = p.active >= 0 ? p.inventory[p.active] : undefined;
  return s ? s.id : '';
}

// ───────────────────────────── protections tenues en main ─────────────────────────────

export const COVER_NONE = 0;
export const COVER_SHIELD = 1;
export const COVER_UMBRELLA = 2;
export const COVER_BANNER = 3;
export const COVER_PARRY = 4;

/** Ce qu'un coup peut être, du point de vue de la protection. */
export type ThreatClass = ProjectileClass | 'melee' | 'spray';

/**
 * Zones couvertes par un bouclier levé (hauteur relative, 0 pieds … 1 tête) : debout, du genou au
 * menton ; visée relevée au-delà de SHIELD_PARRY_PITCH (rad), de la cuisse au sommet de la tête.
 */
export const SHIELD_LOW = 0.12;
export const SHIELD_HIGH = 0.92;
export const SHIELD_PARRY_PITCH = 0.2;
export const SHIELD_PARRY_LOW = 0.3;

const COS_70 = Math.cos((70 * Math.PI) / 180);
const COS_60 = Math.cos((60 * Math.PI) / 180);
const COS_55 = Math.cos((55 * Math.PI) / 180);
const COS_50 = Math.cos((50 * Math.PI) / 180);
const COS_40 = Math.cos((40 * Math.PI) / 180);

/**
 * Protection qui arrête un coup arrivant sur `target` depuis la direction (fromX, fromZ) — vecteur
 * unitaire allant de la cible VERS l'origine du coup — à la hauteur relative `zone` (0 pieds … 1 tête).
 *   - bouclier levé : ce qui vient de face (± 70°) sur la zone couverte, sauf les balles ; simplement porté :
 *     les projectiles qui arrivent sur le buste (± 40°) ;
 *   - parapluie ouvert : petits projectiles sur le haut du corps (± 60°) ;
 *   - banderole : jets et balles de défense sur le buste de ses porteurs (± 55°) ;
 *   - bâton en parade : coups de face (± 50°), atténués.
 */
export function coverOf(target: Person, fromX: number, fromZ: number, zone: number, cls: ThreatClass): number {
  const s = target.active >= 0 ? target.inventory[target.active] : undefined;
  if (!s) return COVER_NONE;
  if (target.posture === 'down' || target.posture === 'prone') return COVER_NONE;
  const facing = Math.sin(target.heading) * fromX + Math.cos(target.heading) * fromZ;
  switch (s.id) {
    case 'bouclier':
      if (s.state <= 0 || cls === 'bullet') return COVER_NONE;
      if (target.alt) {
        if (facing < COS_70) return COVER_NONE;
        // accroupi ou à genoux, le bouclier d'un mètre couvre tout le corps
        if (target.posture === 'crouch' || target.posture === 'kneel') return COVER_SHIELD;
        // parade haute (visée relevée) : la tête est couverte, les jambes non
        if (target.aimPitch > SHIELD_PARRY_PITCH) return zone >= SHIELD_PARRY_LOW ? COVER_SHIELD : COVER_NONE;
        // debout : du genou au menton
        return zone >= SHIELD_LOW && zone <= SHIELD_HIGH ? COVER_SHIELD : COVER_NONE;
      }
      // simplement porté, il ne pare rien de lui-même : seuls les projectiles qui arrivent sur lui sont arrêtés
      if (cls === 'melee' || cls === 'spray') return COVER_NONE;
      return facing >= COS_40 && zone >= 0.25 && zone <= 0.72 ? COVER_SHIELD : COVER_NONE;
    case 'parapluie':
      if (!target.alt || s.state <= 0) return COVER_NONE;
      return (cls === 'small' || cls === 'spray') && facing >= COS_60 && zone >= 0.45 ? COVER_UMBRELLA : COVER_NONE;
    case 'banderole':
      if (s.state <= 0) return COVER_NONE;
      if (cls !== 'small' && cls !== 'heavy' && cls !== 'lbd' && cls !== 'grenade' && cls !== 'spray') return COVER_NONE;
      return facing >= COS_55 && zone >= 0.2 && zone <= (target.alt ? 0.95 : 0.8) ? COVER_BANNER : COVER_NONE;
    case 'tonfa':
    case 'baton':
      return cls === 'melee' && target.alt && facing >= COS_50 ? COVER_PARRY : COVER_NONE;
    default:
      return COVER_NONE;
  }
}

/**
 * Use la protection en main (rayures, fissures, toile déchirée) et fatigue le bras qui encaisse :
 * `energy` en joules.
 */
export function wearCover(target: Person, cover: number, energy: number): void {
  const s = target.active >= 0 ? target.inventory[target.active] : undefined;
  if (!s) return;
  if (cover === COVER_SHIELD) {
    const effort = energy / 40;
    target.stamina -= effort < 8 ? effort : 8;
    if (target.stamina < 0) target.stamina = 0;
  }
  const per = cover === COVER_SHIELD ? 6000 : cover === COVER_UMBRELLA ? 400 : cover === COVER_BANNER ? 4000 : 0;
  if (per <= 0) return;
  s.state -= energy / per;
  if (s.state < 0) s.state = 0;
}

// ───────────────────────────── tâches en cours ─────────────────────────────

/** Coup de mêlée lancé, en attente de l'instant d'impact. */
export interface Strike {
  personId: EntityId;
  item: ItemId;
  /** Temps restant avant l'impact (s). */
  left: number;
  targetId: EntityId;
}

/** Jet continu en cours (gazeuse, extincteur, lance, bombe de peinture). */
export interface Spray {
  personId: EntityId;
  item: ItemId;
  left: number;
  /** Temps accumulé depuis le dernier dépôt. */
  acc: number;
  /** Durée totale de l'acte (bombe de peinture). */
  total: number;
  /** Cible de l'inscription (bombe de peinture) : identifiant et nature. */
  targetId: EntityId;
  targetIsShop: boolean;
  /** L'emploi de la force a déjà été déclaré pour ce jet. */
  reported: boolean;
}

/** Animation d'usage en cours : le module tient Person.upperT à jour puis rend la pose de repos. */
export interface UseAnim {
  personId: EntityId;
  anim: string;
  elapsed: number;
  duration: number;
}

/** Mise en place d'un masque à gaz. */
export interface MaskJob {
  personId: EntityId;
  left: number;
}

// ───────────────────────────── état du module ─────────────────────────────

export const LAUNCHER_RANGES: readonly LauncherRange[] = Object.freeze([50, 100, 200] as LauncherRange[]);

export const DEFAULT_TUNING: Readonly<ItemsTuning> = Object.freeze({
  dispersion: 1,
  playerDispersion: 0.5,
  returnSuccess: 0.6,
  paletGasRate: 0.25,
  paletGasRadius: 2.5,
  damageScale: 1,
});

export class ItemsCore {
  ctx!: GameContext;
  /** Aléa du module, recréé à chaque session (dérivé « items »). */
  rng: Rng = createRng(1);
  readonly tuning: ItemsTuning = { ...DEFAULT_TUNING };

  /** Dispositif de propulsion choisi par personne (index dans LAUNCHER_RANGES ; absent = 100 m). */
  readonly launcherMode = new Map<EntityId, number>();
  /** Protection contre le gaz d'origine des personnes masquées. */
  readonly maskBase = new Map<EntityId, number>();
  /** Personnes dont la lampe est allumée. */
  readonly lamps: EntityId[] = [];
  /** Piles d'objets dont le délai court. */
  readonly cooling: ItemStack[] = [];
  readonly coolingSet = new Set<ItemStack>();

  readonly strikes: Strike[] = [];
  readonly sprays: Spray[] = [];
  readonly anims: UseAnim[] = [];
  readonly masks: MaskJob[] = [];

  // tableaux et objets de travail réutilisés
  readonly people: Person[] = [];
  readonly people2: Person[] = [];
  readonly props: Prop[] = [];
  readonly shops: Shop[] = [];
  readonly hit: RayHit = makeRayHit();

  attach(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.rng = this.ctx.rng.fork('items');
    this.launcherMode.clear();
    this.maskBase.clear();
    this.lamps.length = 0;
    this.cooling.length = 0;
    this.coolingSet.clear();
    this.strikes.length = 0;
    this.sprays.length = 0;
    this.anims.length = 0;
    this.masks.length = 0;
  }

  /** Tirage gaussien centré d'écart-type `sd` (0 si sd est nul : aucun tirage consommé). */
  gauss(sd: number): number {
    return sd > 0 ? gaussian(this.rng, 0, sd) : 0;
  }

  // ── délais ──

  /** Arme le délai d'une pile (au moins `seconds`). */
  setCooldown(stack: ItemStack, seconds: number): void {
    if (seconds > stack.cooldown) stack.cooldown = seconds;
    this.track(stack);
  }

  /** Inscrit une pile dont le délai court déjà (pile donnée par un autre module). */
  track(stack: ItemStack): void {
    if (stack.cooldown > 0 && !this.coolingSet.has(stack)) {
      this.coolingSet.add(stack);
      this.cooling.push(stack);
    }
  }

  tickCooldowns(dt: number): void {
    const list = this.cooling;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      s.cooldown -= dt;
      // tolérance : un délai de 3 s est bien écoulé après 90 pas de 1/30 s, malgré les arrondis
      if (s.cooldown <= 1e-6) {
        s.cooldown = 0;
        this.coolingSet.delete(s);
        list[i] = list[list.length - 1]!;
        list.pop();
      }
    }
  }

  // ── lanceur de 56 mm ──

  launcherIndex(p: Person): number {
    const m = this.launcherMode.get(p.id);
    return m === undefined ? 1 : m;
  }

  setLauncherIndex(p: Person, index: number): void {
    const i = index < 0 ? 0 : index > 2 ? 2 : index;
    if (this.launcherIndex(p) === i) return;
    this.launcherMode.set(p.id, i);
    this.ctx.events.emitAny(LAUNCHER_RANGE_EVENT, { personId: p.id, range: LAUNCHER_RANGES[i] });
  }

  // ── animations ──

  /** Lance l'animation d'usage : pose immédiate, puis retour à la pose de repos après `duration`. */
  playAnim(p: Person, anim: string, duration: number, startAt = 0): void {
    if (anim === 'none' || !(duration > 0)) return;
    p.upper = anim;
    p.upperT = startAt;
    const list = this.anims;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.personId === p.id) {
        a.anim = anim;
        a.elapsed = startAt;
        a.duration = startAt + duration;
        return;
      }
    }
    list.push({ personId: p.id, anim, elapsed: startAt, duration: startAt + duration });
  }

  /** Oublie l'animation en cours d'une personne (changement d'objet, mise à terre). */
  dropAnim(personId: EntityId): void {
    const list = this.anims;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.personId === personId) {
        list[i] = list[list.length - 1]!;
        list.pop();
      }
    }
  }

  // ── événements ──

  fx(id: FxId, x: number, y: number, z: number, size?: number, color?: number, seconds?: number): void {
    this.ctx.events.emit('fx', { id, x, y, z, size, color, seconds });
  }

  fxDir(id: FxId, x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number, size?: number, color?: number, seconds?: number): void {
    this.ctx.events.emit('fx', { id, x, y, z, size, dirX, dirY, dirZ, color, seconds });
  }

  sfx(id: SoundId, x: number, y: number, z: number, volume?: number, pitch?: number): void {
    this.ctx.events.emit('sfx', { id, x, y, z, volume, pitch });
  }

  used(p: Person, item: ItemId, targetId: EntityId, x = p.x, z = p.z): void {
    this.ctx.events.emit('item:used', { personId: p.id, item, x, z, targetId });
  }

  // ── droit ──

  /** Emploi d'un moyen de force par un policier ou un gendarme (sans effet pour les autres). */
  reportForce(by: Person, means: ForceMeans, target: Person | null, x: number, z: number): void {
    if (!isPolice(by)) return;
    try {
      this.ctx.law.reportForce(by, means, target, x, z);
    } catch (err) {
      console.error('[items] déclaration d\'emploi de la force impossible', err);
    }
  }

  /** Infraction commise par quelqu'un qui n'est ni policier ni gendarme. */
  recordOffense(by: Person, type: OffenseType, x: number, z: number): void {
    if (isPolice(by)) return;
    try {
      this.ctx.law.recordOffense(by, type, x, z);
    } catch (err) {
      console.error('[items] enregistrement d\'infraction impossible', err);
    }
  }
}
