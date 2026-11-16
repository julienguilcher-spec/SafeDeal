/* =====================================================================================
 * Écran « roue_ordres » : roue d'ordres rapide en vue de jeu, pour l'unité du joueur. Les ordres
 * visent le point regardé (PlayerState.aimX / aimZ) ou la personne visée, relevés à l'ouverture.
 *
 * Touche « Ordres » maintenue : la roue reste ouverte, on choisit une direction (souris, stick),
 * on relâche pour valider. Appui bref ou doigt : la roue reste affichée, on touche un secteur.
 * ===================================================================================== */

import type { InputState, Squad } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import { el } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import { formatDistance } from '../maps/transform';
import type { CommandCore } from './core';
import { verbOf } from './orders';
import type { OrderGeom } from './orders';
import { ensureCommandStyle } from './style';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';

export const WHEEL_SCREEN = 'roue_ordres';

/** Secteurs de la roue, dans le sens horaire à partir du haut. */
const WHEEL: readonly { type: string; label: string }[] = [
  { type: 'avancer', label: 'En avant' },
  { type: 'bond_offensif', label: 'Bond' },
  { type: 'charge', label: 'Charge' },
  { type: 'disperser_gaz', label: 'Gaz' },
  { type: 'interpeller', label: 'Interpeller' },
  { type: 'repli', label: 'Repli' },
  { type: 'cesser', label: 'Cesser' },
  { type: 'tenir', label: 'Tenir' },
  { type: 'ligne', label: 'En ligne' },
  { type: 'suivre', label: 'Suivez-moi' },
];

/** Durée en deçà de laquelle un appui est « bref » : la roue reste alors affichée (s). */
const TAP_SECONDS = 0.24;
/** Recul d'un repli ordonné depuis la roue (m). */
const REPLI_DISTANCE = 30;

export class OrderWheelScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  private readonly wheel: RadialMenu | null = null;
  private readonly squad: Squad | null = null;
  private held: boolean;
  private age = 0;
  private ticks = 0;
  private vx = 0;
  private vy = 0;
  private done = false;
  // visée relevée à l'ouverture
  private readonly aimX: number;
  private readonly aimZ: number;
  private readonly yaw: number;
  private readonly targetId: number;
  private readonly unitX: number;
  private readonly unitZ: number;
  private originX = NaN;
  private originY = NaN;
  private readonly onMove = (e: PointerEvent): void => this.relativeMove(e);

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    const ctx = core.ctx;
    this.root = el('div', 'cm-root cw-screen' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'order-wheel';
    host.appendChild(this.root);
    this.held = ctx.input.down('orders');

    const st = ctx.player.state;
    const p = core.player();
    const sc = core.scope();
    const squad = sc.level !== 'lecture' && sc.ownSquadId !== 0 ? ctx.squads.get(sc.ownSquadId) ?? null : null;
    this.squad = squad;
    this.yaw = st.camYaw;
    const px = p ? p.x : 0;
    const pz = p ? p.z : 0;
    const leader = squad && squad.leaderId !== 0 ? ctx.people.get(squad.leaderId) : undefined;
    this.unitX = leader ? leader.x : px;
    this.unitZ = leader ? leader.z : pz;
    // sans point visé exploitable, on prend 20 m devant le regard
    let ax = st.aimX, az = st.aimZ;
    if (!Number.isFinite(ax) || !Number.isFinite(az) || Math.hypot(ax - px, az - pz) < 2) {
      ax = px + Math.sin(st.camYaw) * 20;
      az = pz + Math.cos(st.camYaw) * 20;
    }
    this.aimX = ax;
    this.aimZ = az;
    const target = st.aimedPersonId !== 0 ? ctx.people.get(st.aimedPersonId) : undefined;
    this.targetId = target && target.faction !== 'police' ? target.id : 0;

    if (!squad) {
      const cap = el('div', 'cw-cap');
      cap.append(el('b', undefined, 'Roue d’ordres'), document.createTextNode('Aucune unité n’est sous vos ordres\u00a0: vous recevez les ordres, vous n’en donnez pas.'));
      this.root.appendChild(cap);
      return;
    }

    const roe = ctx.law.roe;
    const items: WheelItem[] = [];
    for (let i = 0; i < WHEEL.length; i++) {
      const w = WHEEL[i]!;
      const verb = verbOf(w.type)!;
      let disabled = verb.force > roe.authorizedForce && !roe.underAttack;
      let sub: string | undefined;
      if (w.type === 'interpeller' && this.targetId === 0) {
        disabled = true;
        sub = 'aucune cible';
      } else if (disabled) sub = `force ${verb.force}`;
      items.push({ id: w.type, label: w.label, sub, disabled, force: verb.coercive });
    }
    this.wheel = new RadialMenu(this.root, items, {
      onChoose: (_i, item) => this.issue(item.id),
      onCancel: () => this.close(),
    });
    this.wheel.hoverEnabled = false;
    const dist = Math.hypot(this.aimX - px, this.aimZ - pz);
    this.wheel.setCenter(squad.name, this.targetId !== 0 ? 'cible désignée' : `point visé · ${formatDistance(dist)}`);

    const cap = el('div', 'cw-cap');
    const key = core.kit ? core.kit.keyLabel('orders') : '';
    if (ctx.input.device === 'touch' || coarsePointer()) cap.textContent = 'Touchez un ordre — le centre annule';
    else if (ctx.input.device === 'gamepad') cap.textContent = 'Stick\u00a0: choisir · relâchez pour valider · B\u00a0: annuler';
    else cap.textContent = `Dirigez la souris vers un ordre, relâchez ${key !== '' ? '« ' + key + ' »' : 'la touche'} pour valider · Échap\u00a0: annuler`;
    this.root.appendChild(cap);
    window.addEventListener('pointermove', this.onMove);
  }

  /**
   * Souris : le premier événement ne fait que noter la position (le navigateur en fabrique un quand la
   * roue apparaît sous un pointeur immobile). Ensuite, le survol direct choisit le secteur ; hors de la
   * roue, c'est la direction du déplacement depuis ce point de départ qui choisit.
   */
  private relativeMove(e: PointerEvent): void {
    const wheel = this.wheel;
    if (!wheel || e.pointerType === 'touch') return;
    // pendant le premier dixième de seconde, on ne fait que suivre la position (événements de mise en place)
    if (this.originX !== this.originX || this.age < 0.12) {
      this.originX = e.clientX;
      this.originY = e.clientY;
      return;
    }
    if (!wheel.hoverEnabled) {
      if (Math.hypot(e.clientX - this.originX, e.clientY - this.originY) < 8) return;
      wheel.hoverEnabled = true;
      wheel.pointerAt(e.clientX, e.clientY);
    }
    if (wheel.indexAtClient(e.clientX, e.clientY) !== -1) return;
    wheel.pointAt(e.clientX - this.originX, e.clientY - this.originY, 34);
  }

  private close(): void {
    if (this.done) return;
    this.done = true;
    this.core.ctx.ui.close(WHEEL_SCREEN);
  }

  private issue(type: string): void {
    const core = this.core;
    const ctx = core.ctx;
    const squad = this.squad;
    const verb = verbOf(type);
    if (!squad || !verb || this.done) return;
    let geom: OrderGeom | null = null;
    let targetId = 0;
    let targetName = '';
    const toAim = Math.atan2(this.aimX - this.unitX, this.aimZ - this.unitZ);
    switch (type) {
      case 'avancer': case 'bond_offensif': case 'charge': case 'disperser_gaz':
        geom = { x: this.aimX, z: this.aimZ, heading: toAim, width: 0 };
        break;
      case 'ligne':
        geom = { x: this.aimX, z: this.aimZ, heading: this.yaw, width: 0 };
        break;
      case 'interpeller': {
        const t = ctx.people.get(this.targetId);
        if (!t) return;
        geom = { x: t.x, z: t.z, heading: toAim, width: 0 };
        targetId = t.id;
        targetName = 'l’objectif désigné';
        break;
      }
      case 'repli':
        geom = {
          x: this.unitX - Math.sin(this.yaw) * REPLI_DISTANCE, z: this.unitZ - Math.cos(this.yaw) * REPLI_DISTANCE,
          heading: this.yaw, width: 0,
        };
        break;
      case 'suivre':
        targetId = ctx.player.state.personId;
        targetName = 'mon mouvement';
        break;
      default:
        break;
    }
    const res = core.issue(verb.type, [squad], geom ? [geom] : null, targetId, targetName);
    if (!res.ok) {
      ctx.ui.notify(res.reason, 'warn', 5);
      ctx.audio.play('ui_alerte');
    } else ctx.ui.notify(`${squad.name}\u00a0: ${verb.label.toLowerCase()}`, 'ok', 2.5);
    this.close();
  }

  update(dt: number, input: InputState): void {
    if (this.done) return;
    this.age += dt;
    this.ticks++;
    const wheel = this.wheel;
    if (!wheel) {
      // simple message : il disparaît quand la touche est relâchée (ou après un court délai)
      if ((this.held && !input.down('orders')) || this.age > 2.2) this.close();
      return;
    }
    if (input.device === 'gamepad') {
      // stick droit : mouvement accumulé ; stick gauche : direction directe
      this.vx += input.lookX * 2.2;
      this.vy -= input.lookY * 2.2;
      const l = Math.hypot(this.vx, this.vy);
      if (l > 1) {
        this.vx /= l;
        this.vy /= l;
      }
      if (Math.hypot(input.moveX, input.moveY) > 0.5) wheel.pointAt(input.moveX, -input.moveY, 0.5);
      else wheel.pointAt(this.vx, this.vy, 0.4);
    }
    // roue restée affichée après un appui bref : un nouvel appui sur « Ordres » la referme
    if (!this.held && this.ticks > 1 && input.pressed('orders')) {
      this.close();
      return;
    }
    if (input.pressed('ui_accept') && wheel.highlighted >= 0) {
      if (!wheel.choose()) this.core.ctx.audio.play('ui_alerte');
      return;
    }
    if (this.held && !input.down('orders')) {
      this.held = false;
      // touche relâchée : un secteur surligné est validé ; un appui bref laisse la roue affichée
      // (bref = relâché dans les toutes premières images, ou en moins d'un quart de seconde : le compte
      // d'images protège des images lentes, où un appui bref paraîtrait long)
      if (wheel.highlighted >= 0) {
        if (!wheel.choose()) this.close();
      } else if (this.ticks > 4 && this.age > TAP_SECONDS) this.close();
    }
  }

  back(): boolean {
    return false;
  }

  dispose(): void {
    this.done = true;
    window.removeEventListener('pointermove', this.onMove);
    this.wheel?.dispose();
    this.root.remove();
  }
}
