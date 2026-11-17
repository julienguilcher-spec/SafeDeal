/* =====================================================================================
 * Surcouche tactile — contrôleur : service « input.touch », choix de la disposition et de la
 * visibilité, libellé contextuel, barre d'objets. Fonctionne aussi sans DOM (tests Node) :
 * l'état est conservé et appliqué à la surcouche dès qu'elle existe.
 * ===================================================================================== */

import type { Button, GameContext, InputDevice } from '@/core/contracts';
import type { InputTouchApi, TouchItem, TouchLayout, TouchLayoutMode } from '../api';
import { BUTTON_COUNT, BUTTON_INDEX, buttonIndex } from '../buttons';
import type { InputCore } from '../core';
import { createSourceAxes } from '../merge';
import type { SourceAxes } from '../merge';
import { ITEM_BAR, touchSeatInfo } from './layouts';
import type { GameLayout, TouchSeatInfo } from './layouts';
import { TouchOverlay } from './overlay';

export interface TouchEnv {
  core: InputCore;
  ctx: GameContext;
  /** Un doigt s'est posé : le tactile devient le périphérique actif. */
  activity(): void;
  haptic(ms: number): void;
}

const NO_AXES: SourceAxes = createSourceAxes();
/** Coiffes à visière (même liste que hasVisor, src/sim/people/gear.ts). */
const VISOR_HEADGEAR: readonly string[] = ['casque_crs', 'casque_gendarme', 'casque_moto', 'casque_pompier'];

/** Équipement dont dépendent les pastilles « Masque », « Visière » et « Lampe » (disposition à pied). */
export interface TouchGear {
  mask: boolean;
  visor: boolean;
  flashlight: boolean;
}

/** Période de relecture de l'inventaire pour la barre d'objets automatique (s). */
const ITEMS_PERIOD = 0.2;

export class TouchController implements InputTouchApi {
  mode: TouchLayoutMode = 'auto';
  layout: TouchLayout = 'menu';
  visible = false;
  overlay: TouchOverlay | null = null;
  /** Incrémenté quand la disposition affichée change (libellés). */
  version = 0;
  /** Place à bord (disposition véhicule) : un passager n'a ni volant, ni pédales, ni avertisseurs. */
  readonly seat: TouchSeatInfo = { seat: 'conducteur', armed: true, siren: true, beacons: true };
  /**
   * Pastilles d'équipement utiles à la personne incarnée : un manifestant n'a pas de visière, un CRS pas de
   * lampe torche… Un bouton qui ne peut que répondre « vous n'en avez pas » n'a pas sa place à l'écran.
   */
  readonly gear: TouchGear = { mask: true, visor: true, flashlight: true };
  /** Véhicule et place dont `seat` est la lecture (évite de la refaire à chaque image). */
  private placeVehicle: object | null = null;
  private placeSeat = -1;

  private readonly env: TouchEnv;
  private forced: boolean | null = null;
  private explicitLabel: string | null = null;
  private shownLabel: string | null | undefined = undefined;
  private readonly toggles = new Uint8Array(BUTTON_COUNT);
  private readonly hiddenButtons: Button[] = [];
  private manualItems: TouchItem[] | null = null;
  private manualActive = -1;
  private itemsDirty = true;
  private itemsTimer = ITEMS_PERIOD;
  private readonly autoIds: string[] = [];
  private readonly autoCounts: number[] = [];

  constructor(env: TouchEnv) {
    this.env = env;
    this.toggles[BUTTON_INDEX.secondary] = 1;     // « Viser » : à bascule, le pouce droit doit rester libre pour regarder
  }

  get axes(): SourceAxes {
    return this.overlay ? this.overlay.axes : NO_AXES;
  }

  /** Crée la surcouche dans `parent` (#ui) et lui applique l'état déjà demandé. */
  attach(parent: HTMLElement): void {
    if (this.overlay) return;
    const env = this.env;
    this.overlay = new TouchOverlay(parent, {
      core: env.core,
      settings: () => env.ctx.settings.values,
      isToggle: (index) => this.toggles[index] === 1,
      activity: env.activity,
      haptic: env.haptic,
    });
    for (let i = 0; i < this.hiddenButtons.length; i++) this.overlay.setButtonVisible(this.hiddenButtons[i]!, false);
    this.shownLabel = undefined;
    this.itemsDirty = true;
  }

  dispose(): void {
    if (this.overlay) this.overlay.dispose();
    this.overlay = null;
  }

  // ───────────────────────────── service ─────────────────────────────

  setLayout(layout: TouchLayoutMode): void {
    if (layout !== 'auto' && layout !== 'pied' && layout !== 'vehicule' && layout !== 'drone' && layout !== 'menu' && layout !== 'cache') {
      console.error(`[input] disposition tactile inconnue : « ${String(layout)} »`);
      return;
    }
    this.mode = layout;
  }

  setInteractLabel(text: string | null): void {
    this.explicitLabel = typeof text === 'string' && text.length > 0 ? text : null;
  }

  setItemBar(items: readonly (string | TouchItem)[] | null, active = -1): void {
    if (items === null) {
      if (this.manualItems !== null) {
        this.manualItems = null;
        this.autoIds.length = 0;
        this.itemsDirty = true;
        this.itemsTimer = ITEMS_PERIOD;
      }
      return;
    }
    const n = items.length < ITEM_BAR.max ? items.length : ITEM_BAR.max;
    const prev = this.manualItems;
    let same = prev !== null && prev.length === n;
    if (same) {
      for (let i = 0; i < n; i++) {
        const it = items[i]!;
        const p = prev![i]!;
        if (typeof it === 'string') {
          if (p.icon !== it || p.label !== undefined || p.count !== undefined) same = false;
        } else if (p.icon !== it.icon || p.label !== it.label || p.count !== it.count) {
          same = false;
        }
        if (!same) break;
      }
    }
    if (!same) {
      const list: TouchItem[] = [];
      for (let i = 0; i < n; i++) {
        const it = items[i]!;
        list.push(typeof it === 'string' ? { icon: it } : { icon: String(it.icon), label: it.label, count: it.count });
      }
      this.manualItems = list;
      this.itemsDirty = true;
    }
    this.manualActive = active;
  }

  setButtonVisible(button: Button, visible: boolean): void {
    if (buttonIndex(button) < 0) return;
    const at = this.hiddenButtons.indexOf(button);
    if (visible && at >= 0) this.hiddenButtons.splice(at, 1);
    else if (!visible && at < 0) this.hiddenButtons.push(button);
    if (this.overlay) this.overlay.setButtonVisible(button, visible);
  }

  setToggle(button: Button, toggle: boolean): void {
    const i = buttonIndex(button);
    if (i < 0) return;
    this.toggles[i] = toggle ? 1 : 0;
    if (!toggle && this.overlay) this.overlay.clearToggle(i);
  }

  setForced(forced: boolean | null): void {
    this.forced = forced;
  }

  // ───────────────────────────── boucle ─────────────────────────────

  /** Scrutation (une fois par image) : axes du joystick et des pédales, rotation du regard. */
  sample(): void {
    if (this.overlay) this.overlay.sample();
  }

  /** Disposition des commandes de jeu pour les libellés (« pied » quand aucune n'est affichée). */
  labelLayout(): GameLayout {
    return this.layout === 'vehicule' || this.layout === 'drone' ? this.layout : 'pied';
  }

  /** Phase de présentation : disposition, visibilité, libellé, barre d'objets, puis écritures DOM. */
  update(dt: number, device: InputDevice): void {
    const layout = this.resolveLayout();
    if (layout !== this.layout) {
      this.layout = layout;
      this.version++;
    }
    const visible = layout !== 'cache' && (this.forced ?? device === 'touch');
    this.visible = visible;
    if (visible) this.readPlace(layout);
    const o = this.overlay;
    if (!o) return;
    o.setLayout(layout);
    o.setVisible(visible);
    if (!visible) return;
    o.setPlace(this.seat, this.gear);

    const ctx = this.env.ctx;
    const label = this.explicitLabel ?? ctx.player.state.prompt?.label ?? null;
    if (label !== this.shownLabel) {
      this.shownLabel = label;
      o.setInteract(label);
    }
    if (layout === 'pied') this.updateItems(dt);
    o.sync();
  }

  /** Place à bord et équipement de la personne incarnée (sans allocation : écrit dans seat et gear). */
  private readPlace(layout: TouchLayout): void {
    const ctx = this.env.ctx;
    const person = ctx.player.person();
    const seat = this.seat;
    const vehicle = layout === 'vehicule' && person ? ctx.player.vehicle() : null;
    if (vehicle && person) {
      const index = typeof person.seat === 'number' ? person.seat : 0;
      // relue seulement quand le véhicule ou la place change
      if (vehicle !== this.placeVehicle || index !== this.placeSeat) {
        this.placeVehicle = vehicle;
        this.placeSeat = index;
        const info = touchSeatInfo(vehicle, index);
        seat.seat = info.seat;
        seat.armed = info.armed;
        seat.siren = info.siren;
        seat.beacons = info.beacons;
      }
    } else {
      this.placeVehicle = null;
      this.placeSeat = -1;
      seat.seat = 'conducteur';
      seat.armed = true;
      seat.siren = true;
      seat.beacons = true;
    }
    const gear = this.gear;
    const look = person ? person.look : undefined;
    if (!person || !look) {
      gear.mask = true;
      gear.visor = true;
      gear.flashlight = true;
      return;
    }
    let mask = look.gasMask === true;
    let lamp = false;
    const inv = person.inventory;
    if (inv) {
      for (let i = 0; i < inv.length; i++) {
        const id = inv[i]!.id;
        if (id === 'masque_gaz') mask = true;
        else if (id === 'lampe') lamp = true;
      }
    }
    gear.mask = mask;
    gear.visor = VISOR_HEADGEAR.indexOf(look.headgear) >= 0;
    gear.flashlight = lamp;
  }

  private resolveLayout(): TouchLayout {
    const ctx = this.env.ctx;
    let layout: TouchLayout;
    if (this.mode === 'auto') {
      if (ctx.session.phase !== 'playing') {
        layout = 'menu';
      } else {
        const vehicle = ctx.player.vehicle();
        if (ctx.player.state.cameraMode === 'drone' || (vehicle !== null && vehicle.def.flying)) layout = 'drone';
        else layout = vehicle !== null ? 'vehicule' : 'pied';
      }
    } else {
      layout = this.mode;
    }
    // Un écran modal masque toujours les commandes de jeu : l'interface doit recevoir les doigts.
    if (layout !== 'cache' && layout !== 'menu' && ctx.ui.modal) layout = 'menu';
    return layout;
  }

  private updateItems(dt: number): void {
    const o = this.overlay!;
    if (this.manualItems !== null) {
      if (this.itemsDirty) {
        this.itemsDirty = false;
        o.setItems(this.manualItems, this.manualActive);
      } else {
        o.setActiveItem(this.manualActive);
      }
      return;
    }
    // Remplissage automatique d'après l'inventaire de la personne incarnée, relu quelques fois par seconde.
    this.itemsTimer += dt;
    if (this.itemsTimer < ITEMS_PERIOD && !this.itemsDirty) return;
    this.itemsTimer = 0;
    const ctx = this.env.ctx;
    const person = ctx.player.person();
    const inv = person ? person.inventory : null;
    const n = inv ? (inv.length < ITEM_BAR.max ? inv.length : ITEM_BAR.max) : 0;
    let changed = this.itemsDirty || n !== this.autoIds.length;
    if (!changed && inv) {
      for (let i = 0; i < n; i++) {
        if (inv[i]!.id !== this.autoIds[i] || inv[i]!.count !== this.autoCounts[i]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.itemsDirty = false;
      this.autoIds.length = 0;
      this.autoCounts.length = 0;
      const list: TouchItem[] = [];
      for (let i = 0; i < n; i++) {
        const stack = inv![i]!;
        const def = ctx.actions.def(stack.id);
        this.autoIds.push(stack.id);
        this.autoCounts.push(stack.count);
        list.push({
          icon: def && def.icon ? def.icon : String(stack.id),
          label: def ? def.name : String(stack.id),
          count: def && def.maxCount > 1 ? stack.count : undefined,
        });
      }
      o.setItems(list, person ? person.active : -1);
    } else {
      o.setActiveItem(person ? person.active : -1);
    }
  }
}
