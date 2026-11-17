/* =====================================================================================
 * Écran « roue_ordres » : roue d'ordres rapide en vue de jeu, pour l'unité du joueur. Les ordres
 * visent le point regardé (PlayerState.aimX / aimZ) ou la personne visée, relevés à l'ouverture.
 *
 * Touche « Ordres » maintenue : la roue reste ouverte, on choisit une direction (souris, stick),
 * on relâche pour valider. Appui bref ou doigt : la roue reste affichée, on touche un secteur.
 * Au clavier seul (Mac portable sans souris) : 1…9 puis 0 choisissent directement un secteur, les flèches
 * déplacent le surlignage et Entrée valide ; Échap ou ⌫ referment la roue (wheelKeys.ts).
 * ===================================================================================== */

import type { InputState, Squad } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import { el } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import { formatDistance } from '../maps/transform';
import type { CommandCore } from './core';
import { FOLLOW_ORDERS } from './core';
import { verbOf } from './orders';
import type { OrderGeom } from './orders';
import { ensureCommandStyle } from './style';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';
import { WHEEL_KEYS_LEGEND, wheelKeyLabel } from './wheelKeys';
import type { InputLabelsApi } from '@/input/api';

export const WHEEL_SCREEN = 'roue_ordres';

/** Secteurs de la roue, dans le sens horaire à partir du haut. */
export const WHEEL: readonly { type: string; label: string; sub?: string }[] = [
  { type: 'avancer', label: 'En avant' },
  { type: 'bond_offensif', label: 'Bond' },
  { type: 'charge', label: 'Charge' },
  { type: 'disperser_gaz', label: 'Gaz' },
  { type: 'degager_obstacle', label: 'Obstacle' },
  { type: 'interpeller', label: 'Interpeller' },
  { type: 'repli', label: 'Repli' },
  { type: 'cesser', label: 'Cesser' },
  { type: 'tenir', label: 'Tenir' },
  { type: 'ligne', label: 'En ligne' },
  // les deux ordres « me suivre », côte à côte (à pied / en colonne de véhicules)
  { type: 'suivre_pied', label: 'Me suivre', sub: 'à pied' },
  { type: 'avec_moi', label: 'Me suivre', sub: 'en colonne (véh.)' },
];

/**
 * Roue réduite d'un policier sans autorité de commandement (CRS, BRAV-M, équipage d'engin, télépilote) : il ne donne
 * que les deux ordres « me suivre » à son unité (et, quand il prend le volant, toute la colonne le suit).
 */
export const FOLLOW_WHEEL: readonly { type: string; label: string; sub?: string }[] = WHEEL.filter((w) => FOLLOW_ORDERS.has(w.type));

/** Secteurs de la roue selon le niveau de commandement du joueur. */
export function wheelOrders(level: string): readonly { type: string; label: string; sub?: string }[] {
  return level === 'lecture' ? FOLLOW_WHEEL : WHEEL;
}

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
    // sans autorité : la roue réduite aux deux ordres « me suivre », adressés à son unité
    const squad = sc.level !== 'lecture' && sc.ownSquadId !== 0 ? ctx.squads.get(sc.ownSquadId) ?? null : core.followUnit();
    this.squad = squad;
    const orders = wheelOrders(sc.level);
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
      // Aucune roue à ce poste : on le DIT par une notification qui reste lisible quelques secondes (le message
      // ci-dessus disparaissait au relâchement de la touche — invisible pour un appui bref ou un bouton tactile),
      // sans bloquer les commandes du joueur. L'écran se referme à la première image.
      ctx.ui.notify('Vous recevez les ordres : pas de roue d’ordres à ce poste. La carte tactique reste consultable.', 'info', 5);
      return;
    }

    const roe = ctx.law.roe;
    const labels = ctx.service<InputLabelsApi>('input.labels');
    const codeLabel = labels && typeof labels.codeLabel === 'function' ? (code: string) => labels.codeLabel('kbm', code) : undefined;
    const items: WheelItem[] = [];
    for (let i = 0; i < orders.length; i++) {
      const w = orders[i]!;
      const verb = verbOf(w.type)!;
      let disabled = verb.force > roe.authorizedForce && !roe.underAttack;
      let sub: string | undefined = w.sub;
      if (w.type === 'interpeller' && this.targetId === 0) {
        disabled = true;
        sub = 'aucune cible';
      } else if (disabled) sub = `force ${verb.force}`;
      items.push({ id: w.type, label: w.label, sub, disabled, force: verb.coercive, key: wheelKeyLabel(i, codeLabel) });
    }
    this.wheel = new RadialMenu(this.root, items, {
      onChoose: (_i, item) => this.issue(item.id),
      onCancel: () => this.close(),
    });
    this.wheel.hoverEnabled = false;
    const dist = Math.hypot(this.aimX - px, this.aimZ - pz);
    this.wheel.setCenter(squad.name, orders !== WHEEL ? 'vous suivre' : this.targetId !== 0 ? 'cible désignée' : `point visé · ${formatDistance(dist)}`);

    const cap = el('div', 'cw-cap');
    const key = core.kit ? core.kit.keyLabel('orders') : '';
    if (ctx.input.device === 'touch' || coarsePointer()) cap.textContent = 'Touchez un ordre — le centre annule';
    else if (ctx.input.device === 'gamepad') cap.textContent = 'Stick\u00a0: choisir · relâchez pour valider · B\u00a0: annuler';
    else cap.textContent = `Souris\u00a0: dirigez-la vers un ordre, relâchez ${key !== '' ? '«\u00a0' + key + '\u00a0»' : 'la touche'} pour valider`;
    this.root.appendChild(cap);
    // clavier seul : la légende des touches, sous la roue
    if (ctx.input.device === 'kbm' && !coarsePointer()) {
      this.root.appendChild(el('div', 'cw-legend', `${WHEEL_KEYS_LEGEND} · Échap ou ⌫\u00a0: fermer`));
    }
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
      case 'avancer': case 'bond_offensif': case 'charge': case 'disperser_gaz': case 'degager_obstacle':
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
      // pas de roue à ce poste (notification déjà affichée) : rien à tenir ouvert
      this.close();
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
    // clavier : chiffre = ordre direct, flèches = surlignage (pas à la manette : la croix porte « Ordres »)
    // (un secteur surligné aux flèches est validé par Entrée, ou au relâchement de « Ordres » comme à la souris)
    wheel.applyKeys(input, input.device === 'kbm', () => this.core.ctx.audio.play('ui_alerte'));
    if (this.done) return;
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
