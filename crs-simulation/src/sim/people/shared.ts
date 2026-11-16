/* =====================================================================================
 * Personnes — état privé partagé entre les systèmes du module (locomotion, santé,
 * interactions, joueur). Rien ici n'est visible des autres modules : ils passent par le
 * contrat (Person, ctx.health, ctx.interactions, ctx.player) et par les services de api.ts.
 * ===================================================================================== */

import type { DamageKind, EntityId, GameContext, Person, Vec2 } from '@/core/contracts';

/** Façon dont une personne tenue l'est : lien posé par un autre module (escorte), sur l'épaule, traînée. */
export const HOLD_OTHER = 0;
export const HOLD_SHOULDER = 1;
export const HOLD_DRAG = 2;

/** Données privées attachées à une personne (créées à la première rencontre, retirées avec elle). */
export interface PersonExtra {
  /** Vient d'être créée : la réflexion lente doit passer au prochain pas. */
  fresh: boolean;
  // ── locomotion ──
  /** Temps restant en l'air (s) ; 0 = au sol. */
  jumpT: number;
  jumpDur: number;
  jumpH: number;
  jumpCd: number;
  /** 0 = saut simple, 1 = franchit un objet (mobilier ignoré), 2 = franchit un muret (décor ignoré). */
  vault: number;
  /** Temps restant pour se relever (assis, à genoux, à plat ventre). */
  getUp: number;
  /** Temps accumulé entre deux mises à jour complètes (fréquence réduite). */
  lodAcc: number;
  /** Pas consécutifs sans mouvement ni poussée. */
  calm: number;
  /** Masse de l'équipement (kg). */
  load: number;
  /** Adhérence du sol 0..1 et facteur de vitesse de la surface. */
  grip: number;
  surface: number;
  /** Densité locale lissée (personnes/m²). */
  crowd: number;
  /** Compression subie, lissée (m/s d'écrasement). */
  pressure: number;
  /** 0..1 : quelqu'un barre le passage au contact (on cesse de forcer). */
  block: number;
  winded: boolean;
  /** Dernière direction de déplacement convertie en cap (évite un atan2 par pas). */
  hmx: number;
  hmz: number;
  hTarget: number;
  // ── santé ──
  /** > 0 : se relèvera seule à l'échéance ; 0 : reste à terre tant qu'on ne la soigne pas. */
  downTimer: number;
  /** Blessure stabilisée par des soins : ne s'aggrave plus. */
  treated: boolean;
  lastKind: DamageKind | '';
  lastSource: EntityId;
  /** La blessure non soignée vient d'une cause pouvant être mortelle. */
  lastGrave: boolean;
  /** Instant du dernier coup reçu (temps de session). */
  hurtAt: number;
  cryAt: number;
  /** Durée d'exposition forte au gaz (s). */
  gasTime: number;
  coughT: number;
  rinseT: number;
  malaise: boolean;
  /** Brûlait au dernier passage (pour les événements fire:started / fire:out). */
  wasBurning: boolean;
  /** Dégât de brûlure accumulé depuis le dernier événement person:hurt. */
  burnAcc: number;
  // ── portage ──
  /** Comment CETTE personne est tenue (HOLD_*), quand heldBy ≠ 0. */
  holdMode: number;
  // ── gestes posés par le module ──
  pushReadyAt: number;
  /** Instant où l'animation du haut du corps posée par le module (poussée) prend fin. */
  upperUntil: number;
  // ── équipement de tête ──
  maskApplied: boolean;
  maskBase: number;
  /** Supplément de protection de tête apporté par la visière baissée (0 = visière non baissée par ce module). */
  visorDelta: number;
}

function createExtra(): PersonExtra {
  return {
    fresh: true,
    jumpT: 0, jumpDur: 0, jumpH: 0, jumpCd: 0, vault: 0, getUp: 0, lodAcc: 0, calm: 0,
    load: 0, grip: 1, surface: 1, crowd: 0, pressure: 0, block: 0, winded: false,
    hmx: 0, hmz: 0, hTarget: 0,
    downTimer: 0, treated: false, lastKind: '', lastSource: 0, lastGrave: false, hurtAt: -1e9, cryAt: -1e9,
    gasTime: 0, coughT: 0, rinseT: 0, malaise: false, wasBurning: false, burnAcc: 0,
    holdMode: HOLD_OTHER,
    pushReadyAt: 0, upperUntil: 0,
    maskApplied: false, maskBase: 0, visorDelta: 0,
  };
}

/** Identifiant au-delà duquel la résistance n'est plus mémorisée (valeur neutre 1). */
const RESIST_MAX_ID = 1 << 22;

export class PeopleShared {
  ctx!: GameContext;
  readonly extras = new Map<EntityId, PersonExtra>();
  /**
   * Résistance à la poussée par identifiant de personne (1 = normale). Tableau typé : lu pour chaque
   * voisin dans la boucle de séparation, sans recherche dans une table de hachage.
   */
  resist = new Float32Array(4096).fill(1);
  /** Centre d'intérêt (joueur, ou engin télépiloté) : les personnes lointaines sont mises à jour moins souvent. */
  focusOn = false;
  focusX = 0.5;
  focusZ = 0.5;
  /** Sol mouillé 0..1 (ctx.env.state.wetness), recopié par la locomotion au début de chaque pas. */
  wetness = 0.5;
  private bound = false;
  private readonly tmp: Vec2 = { x: 0, z: 0 };

  /** Appelé par chaque système du module dans provide() ; ne s'abonne qu'une fois. */
  bind(ctx: GameContext): void {
    if (this.bound) return;
    this.bound = true;
    this.ctx = ctx;
    this.focusX = 0;
    this.focusZ = 0;
    this.wetness = 0;
    ctx.events.on('person:removed', (ev) => this.forget(ev.id));
  }

  of(p: Person): PersonExtra {
    let e = this.extras.get(p.id);
    if (!e) {
      e = createExtra();
      this.extras.set(p.id, e);
    }
    return e;
  }

  peek(id: EntityId): PersonExtra | undefined {
    return this.extras.get(id);
  }

  setResist(id: EntityId, value: number): void {
    if (id >= this.resist.length) {
      if (id >= RESIST_MAX_ID) return;
      let cap = this.resist.length;
      while (cap <= id) cap *= 2;
      const next = new Float32Array(cap).fill(1);
      next.set(this.resist);
      this.resist = next;
    }
    this.resist[id] = value;
  }

  resistOf(id: EntityId): number {
    return id < this.resist.length ? this.resist[id]! : 1;
  }

  /** Remise à zéro entre deux sessions. */
  clear(): void {
    this.extras.clear();
    this.resist.fill(1);
    this.focusOn = false;
    this.focusX = 0;
    this.focusZ = 0;
  }

  private forget(id: EntityId): void {
    // la personne est encore lisible pendant l'événement : son porteur retrouve ses mains
    const p = this.ctx.people.get(id);
    if (p && p.heldBy !== 0) {
      const holder = this.ctx.people.get(p.heldBy);
      if (holder && (holder.upper === 'carry_person' || holder.upper === 'drag')) {
        holder.upper = 'none';
        holder.upperT = 0;
      }
    }
    // la personne qu'elle portait n'est plus tenue par ce module
    if (p && p.carrying !== 0) {
      const carried = this.extras.get(p.carrying);
      if (carried) carried.holdMode = HOLD_OTHER;
    }
    this.extras.delete(id);
    if (id < this.resist.length) this.resist[id] = 1;
  }

  // ───────────────────────────── portage ─────────────────────────────

  /** Lie un blessé à son porteur (mode HOLD_SHOULDER ou HOLD_DRAG). */
  attach(holder: Person, target: Person, mode: number): void {
    holder.carrying = target.id;
    target.heldBy = holder.id;
    this.of(target).holdMode = mode;
    holder.upper = mode === HOLD_SHOULDER ? 'carry_person' : 'drag';
    holder.upperT = 0;
    target.vx = 0;
    target.vz = 0;
    target.cmd.moveX = 0;
    target.cmd.moveZ = 0;
    this.ctx.events.emitAny('people:carried', { byId: holder.id, targetId: target.id, mode: mode === HOLD_SHOULDER ? 'porter' : 'trainer' });
  }

  /**
   * Défait le lien de portage posé par ce module (sans effet sur une escorte posée par un autre module).
   * `place` : la personne portée sur l'épaule est déposée devant le porteur. Retourne true si un lien a été défait.
   */
  release(holder: Person, place: boolean): boolean {
    if (holder.carrying === 0) return false;
    const ctx = this.ctx;
    const target = ctx.people.get(holder.carrying);
    if (!target) return false;
    const te = this.extras.get(target.id);
    if (!te || te.holdMode === HOLD_OTHER || target.heldBy !== holder.id) return false;
    const mode = te.holdMode;
    te.holdMode = HOLD_OTHER;
    holder.carrying = 0;
    target.heldBy = 0;
    if (holder.upper === 'carry_person' || holder.upper === 'drag') {
      holder.upper = 'none';
      holder.upperT = 0;
    }
    if (mode === HOLD_SHOULDER) {
      const pos = this.tmp;
      const ahead = place ? 0.75 : 0.3;
      pos.x = holder.x + Math.sin(holder.heading) * ahead;
      pos.z = holder.z + Math.cos(holder.heading) * ahead;
      ctx.world.resolveCircle(pos, target.radius);
      ctx.props.resolveCircle(pos, target.radius);
      // un mur entre les deux : on dépose à ses pieds
      if (!ctx.world.lineOfSight(holder.x, holder.z, pos.x, pos.z)) {
        pos.x = holder.x;
        pos.z = holder.z;
      }
      target.x = pos.x;
      target.z = pos.z;
    }
    target.y = ctx.world.heightAt(target.x, target.z);
    target.vx = 0;
    target.vz = 0;
    ctx.events.emitAny('people:dropped', { byId: holder.id, targetId: target.id });
    return true;
  }
}

/** La personne tient-elle un bouclier levé ? */
export function shieldRaised(p: Person): boolean {
  if (!p.alt || p.active < 0) return false;
  const s = p.inventory[p.active];
  return s !== undefined && s.id === 'bouclier';
}
