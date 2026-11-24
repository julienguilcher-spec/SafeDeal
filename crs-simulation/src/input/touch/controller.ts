/* =====================================================================================
 * Surcouche tactile — contrôleur : service « input.touch », choix de la disposition et de la
 * visibilité, libellé contextuel, barre d'objets, pastille « Ordre prêt ». Fonctionne aussi sans
 * DOM (tests Node) : l'état est conservé et appliqué à la surcouche dès qu'elle existe.
 *
 * La pastille « Ordre prêt » n'est alimentée par personne d'autre : quatre fois par seconde, le
 * contrôleur lit l'ordre prêt AFFICHÉ du service 'command.direct' (le même que la ligne « Entrée »
 * de l'ordinateur, celui que le toucher donnera) et en écrit la forme courte. « ⟳ À qui » n'est
 * montré qu'à ceux qui ont plusieurs unités au choix (pas au chef de groupe, ni en lecture seule).
 * L'exécutant (poste « lecture » : son chef donne les ordres) n'a pas d'ordre prêt, comme sur
 * l'ordinateur : sa pastille dit « Ordres » et le toucher ouvre la roue (« Avec moi », secours).
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
/** Période de relecture de l'ordre prêt (s) ; du poste (« ⟳ À qui » montré ou non), plus lente. */
export const ORDER_LABEL_PERIOD = 0.25;
const POSTE_PERIOD = 1;
/** Libellé de la pastille sans ordre prêt (pas encore calculé, rien à commander). */
export const ORDER_PILL_IDLE = { verb: 'Ordres', who: 'appui long\u00a0: la roue' } as const;
/** Poste sans ordre prêt (l'exécutant : son chef donne les ordres) : le toucher ouvre la roue, comme l'appui long. */
export const ORDER_PILL_WHEEL = { verb: 'Ordres', who: 'toucher\u00a0: la roue' } as const;
/** Rien n'est visé (règle i) : la pastille dit quoi faire, le toucher ne donne rien. */
export const ORDER_PILL_AIM = { verb: 'Visez', who: 'rue, personne, foule' } as const;
/** Postes sans choix d'unité (direct/who.ts whoCycle : une seule entrée) : « ⟳ À qui » masqué. */
export const NO_CYCLE_POSTES: readonly string[] = ['groupe', 'equipage', 'lecture'];

/** « ⟳ À qui » a-t-il un sens à ce poste (direct/types.ts DirectEnv.poste) ? */
export function whoChoiceFor(poste: string): boolean {
  return NO_CYCLE_POSTES.indexOf(poste) < 0;
}

/** Ce poste a-t-il un ordre prêt à donner d'un toucher ? (non : l'exécutant — sa pastille ouvre la roue). */
export function readyOrderFor(poste: string): boolean {
  return poste !== 'lecture';
}

/** Service 'command.direct' (src/ui/command/direct/runtime.ts) vu par les seules méthodes lues ici. */
interface DirectReadLike {
  ready(): { short: string; whoShort: string; enabled: boolean; rule: string } | null;
  flashing?(): boolean;
  env?(): { poste: string };
}

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
  /** Pastille d'ordre : libellé imposé par setOrderLabel (null : lu sur 'command.direct'), libellé affiché. */
  private explicitOrder: { verb: string; who: string; ready: boolean } | null = null;
  /** Libellé lu sur 'command.direct' (verbe, unité, prêt, surbrillance). */
  readonly order = { verb: ORDER_PILL_IDLE.verb as string, who: ORDER_PILL_IDLE.who as string, ready: false, flash: false };
  private orderTimer = ORDER_LABEL_PERIOD;
  private posteTimer = POSTE_PERIOD;
  /** « ⟳ À qui » : le poste permet-il de choisir une autre unité ? */
  whoChoice = true;
  /** Le poste a un ordre prêt (false : l'exécutant — la pastille dit « Ordres », le toucher ouvre la roue). */
  readyOrder = true;
  private whoShown: boolean | null = null;

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
    this.whoShown = null;
    this.orderTimer = ORDER_LABEL_PERIOD;
    this.posteTimer = POSTE_PERIOD;
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

  setOrderLabel(text: string | null, who = '', ready = true): void {
    this.explicitOrder = typeof text === 'string' && text.length > 0 ? { verb: text, who, ready } : null;
    this.orderTimer = ORDER_LABEL_PERIOD;
  }

  wheelFinger(): { x: number; y: number; down: boolean } | null {
    return this.overlay && this.visible ? this.overlay.wheelFinger() : null;
  }

  takeWorldTap(): { x: number; y: number } | null {
    return this.overlay ? this.overlay.takeWorldTap() : null;
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
    if (layout === 'pied' || layout === 'vehicule' || layout === 'drone') this.updateOrder(dt);
    o.sync();
  }

  /**
   * Pastille « Ordre prêt » : l'ordre prêt affiché par 'command.direct' (au plus quatre lectures par seconde), en forme
   * courte ; « ⟳ À qui » selon le poste. Sans le service (rôle hors police, tests) : « Ordres », la roue à l'appui long.
   */
  private updateOrder(dt: number): void {
    const o = this.overlay!;
    this.orderTimer += dt;
    this.posteTimer += dt;
    if (this.posteTimer >= POSTE_PERIOD) {
      this.posteTimer = 0;
      this.readPoste();
      o.setTapOpensWheel(!this.readyOrder);
      // le poste a changé : le libellé suit tout de suite
      this.orderTimer = ORDER_LABEL_PERIOD;
    }
    if (this.orderTimer >= ORDER_LABEL_PERIOD) {
      this.orderTimer = 0;
      this.readOrderLabel();
      const l = this.order;
      o.setOrderLabel(l.verb, l.who, l.ready, l.flash);
    }
    // « À qui » : masqué sans choix d'unité, et avec la pastille quand le commandement la masque (hors police)
    const show = this.whoChoice && this.hiddenButtons.indexOf('orders') < 0 && this.hiddenButtons.indexOf('order_who') < 0;
    if (show !== this.whoShown) {
      this.whoShown = show;
      o.setButtonVisible('order_who', show);
    }
  }

  /**
   * Lit le poste du joueur sur 'command.direct' : « ⟳ À qui » a-t-il un sens (`whoChoice`), y a-t-il un ordre prêt
   * (`readyOrder`) ? Sans le service : oui aux deux (sans DOM : les tests le lisent aussi).
   */
  readPoste(): void {
    const direct = this.env.ctx.service<DirectReadLike>('command.direct');
    let choice = true;
    let ready = true;
    if (direct && typeof direct.env === 'function') {
      try {
        const poste = direct.env().poste;
        choice = whoChoiceFor(poste);
        ready = readyOrderFor(poste);
      } catch (err) {
        console.error('[input] pastille d’ordre : poste illisible', err);
      }
    }
    this.whoChoice = choice;
    this.readyOrder = ready;
  }

  /** Lit l'ordre prêt affiché (ou le libellé imposé) dans `order` (sans DOM : les tests le lisent aussi). */
  readOrderLabel(): void {
    const direct = this.env.ctx.service<DirectReadLike>('command.direct');
    const l = this.order;
    const forced = this.explicitOrder;
    if (forced) {
      l.verb = forced.verb;
      l.who = forced.who;
      l.ready = forced.ready;
      l.flash = false;
      return;
    }
    if (!this.readyOrder) {
      // l'exécutant : pas d'ordre prêt (son chef commande) — la pastille ouvre la roue
      l.verb = ORDER_PILL_WHEEL.verb;
      l.who = ORDER_PILL_WHEEL.who;
      l.ready = true;
      l.flash = false;
      return;
    }
    let nat: ReturnType<DirectReadLike['ready']> = null;
    let flash = false;
    if (direct && typeof direct.ready === 'function') {
      try {
        nat = direct.ready();
        flash = typeof direct.flashing === 'function' ? direct.flashing() : false;
      } catch (err) {
        console.error('[input] pastille d’ordre : ordre prêt illisible', err);
        nat = null;
      }
    }
    if (!nat) {
      l.verb = ORDER_PILL_IDLE.verb;
      l.who = ORDER_PILL_IDLE.who;
      l.ready = false;
      l.flash = false;
    } else if (nat.rule === 'i' || nat.short === '') {
      l.verb = ORDER_PILL_AIM.verb;
      l.who = ORDER_PILL_AIM.who;
      l.ready = false;
      l.flash = false;
    } else {
      l.verb = nat.short;
      l.who = nat.whoShort;
      l.ready = nat.enabled;
      l.flash = flash;
    }
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
