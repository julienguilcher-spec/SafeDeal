/* =====================================================================================
 * Joueur — objets : sélection (molette, touches 1 à 9, objet suivant / précédent), action
 * secondaire maintenue (ctx.actions.setAlt), action principale :
 *   - objet à lancer (catégorie « throwable ») : maintenir charge la puissance de 0 à 1 en 0,9 s
 *     (PlayerState.charge), relâcher lance ; le clic secondaire annule ;
 *   - gazeuse, extincteur, lance : usage continu tant que l'action est maintenue ;
 *   - tout le reste : un appui, un usage.
 * ===================================================================================== */

import type { Button, GameContext, Person, PlayerState, UseOptions } from '@/core/contracts';
import * as T from './tuning';

const SLOTS: readonly Button[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9'];

export class ItemControl {
  /** Un lancer est en cours de charge. */
  charging = false;
  /** Dernière demande transmise à ctx.actions.setAlt. */
  altSent = false;
  private chargeSlot = -1;
  private altSlot = -1;
  /** Le clic secondaire vient d'annuler un lancer : attendre qu'il soit relâché. */
  private altBlocked = false;
  /** Temps restant pendant lequel le corps reste tourné vers la visée après un usage. */
  private faceAimT = 0;
  private wheelAcc = 0;
  private wheelIdle = 0;
  private readonly useOpts: UseOptions = { power: 1 };

  constructor(private readonly ctx: GameContext, private readonly state: PlayerState) {}

  /** Le corps doit rester tourné vers la visée (on vise, on charge un lancer, on vient de se servir d'un objet). */
  get facingAim(): boolean {
    return this.altSent || this.charging || this.faceAimT > 0;
  }

  reset(): void {
    this.charging = false;
    this.chargeSlot = -1;
    this.altSent = false;
    this.altSlot = -1;
    this.altBlocked = false;
    this.faceAimT = 0;
    this.wheelAcc = 0;
    this.wheelIdle = 0;
    this.state.charge = 0;
  }

  /** Reprise d'un personnage : on part de son état courant. */
  adopt(p: Person): void {
    this.reset();
    this.altSent = p.alt;
    this.altSlot = p.active;
  }

  /** Relâche tout ce que le joueur tenait enfoncé (écran modal, montée en véhicule, mise à terre). */
  release(p: Person): void {
    this.cancelCharge();
    if (this.altSent) {
      this.ctx.actions.setAlt(p, false);
      this.altSent = false;
    }
  }

  cancelCharge(): void {
    this.charging = false;
    this.chargeSlot = -1;
    this.state.charge = 0;
  }

  /** @param busy mains prises (portage, menottes, action en cours, masque) : ni sélection ni usage. */
  update(p: Person, dt: number, busy: boolean): void {
    const ctx = this.ctx;
    const st = this.state;
    const input = ctx.input;
    const actions = ctx.actions;
    if (this.faceAimT > 0) this.faceAimT -= dt;

    // ── sélection ──
    let step = 0;
    if (input.pressed('item_next')) step = 1;
    else if (input.pressed('item_prev')) step = -1;
    const w = input.wheel;
    if (step !== 0) {
      this.wheelAcc = 0; // la molette est affectée à ces boutons : ne pas la compter deux fois
    } else if (w !== 0 && w === w) {
      this.wheelAcc += w;
      this.wheelIdle = 0;
      if (this.wheelAcc >= 1) {
        step = 1;
        this.wheelAcc = 0;
      } else if (this.wheelAcc <= -1) {
        step = -1;
        this.wheelAcc = 0;
      }
    } else if (this.wheelAcc !== 0) {
      this.wheelIdle += dt;
      if (this.wheelIdle > 0.3) this.wheelAcc = 0;
    }
    if (!this.charging && !busy) {
      if (step !== 0) this.cycle(p, step);
      for (let i = 0; i < SLOTS.length; i++) {
        if (!input.pressed(SLOTS[i]!)) continue;
        // rappuyer sur la touche de l'objet en main le range
        if (p.active === i) actions.select(p, -1);
        else if (i < p.inventory.length) actions.select(p, i);
        break;
      }
    }

    const item = actions.activeItem(p);
    const def = item ? actions.def(item.id) : undefined;

    // ── action secondaire maintenue (lever le bouclier, épauler) ──
    const secondary = input.down('secondary');
    if (this.altBlocked && !secondary) this.altBlocked = false;
    const wantAlt = secondary && !this.altBlocked && !busy && !this.charging;
    if (wantAlt !== this.altSent || (wantAlt && this.altSlot !== p.active)) {
      actions.setAlt(p, wantAlt);
      this.altSent = wantAlt;
      this.altSlot = p.active;
    }

    // ── action principale ──
    if (busy) {
      this.cancelCharge();
      return;
    }
    const throwable = def !== undefined && def.category === 'throwable';
    if (this.charging) {
      this.faceAimT = T.FACE_AIM_HOLD;
      if (!throwable || this.chargeSlot !== p.active) {
        this.cancelCharge();
      } else if (input.pressed('secondary')) {
        // le clic secondaire annule le lancer
        this.cancelCharge();
        this.altBlocked = true;
      } else if (!input.down('primary')) {
        const power = st.charge > T.CHARGE_MIN_POWER ? st.charge : T.CHARGE_MIN_POWER;
        this.cancelCharge();
        this.use(p, power, false);
      } else {
        const c = st.charge + dt / T.CHARGE_TIME;
        st.charge = c < 1 ? c : 1;
      }
    } else if (throwable) {
      if (input.pressed('primary')) {
        this.charging = true;
        this.chargeSlot = p.active;
        st.charge = 0;
        this.faceAimT = T.FACE_AIM_HOLD;
      }
    } else if (def !== undefined && (def.category === 'spray' || def.id === 'extincteur' || def.id === 'lance_incendie')) {
      // jet continu tant que l'action est maintenue (l'objet gère sa cadence et sa réserve)
      if (input.down('primary')) this.use(p, 1, true);
    } else if (input.pressed('primary')) {
      this.use(p, 1, false);
    }
  }

  private use(p: Person, power: number, quiet: boolean): void {
    const ctx = this.ctx;
    this.useOpts.power = power;
    this.faceAimT = T.FACE_AIM_HOLD;
    const r = ctx.actions.use(p, this.useOpts);
    if (!r.ok && !quiet) ctx.events.emitAny('player:use_failed', { reason: r.reason ?? 'blocked' });
  }

  /** Objet suivant ou précédent ; « mains nues » fait partie du tour. */
  private cycle(p: Person, step: number): void {
    const n = p.inventory.length;
    if (n === 0) return;
    const actions = this.ctx.actions;
    let slot = p.active;
    for (let tries = 0; tries <= n; tries++) {
      slot += step;
      if (slot >= n) slot = -1;
      else if (slot < -1) slot = n - 1;
      if (actions.select(p, slot)) return;
    }
  }
}
