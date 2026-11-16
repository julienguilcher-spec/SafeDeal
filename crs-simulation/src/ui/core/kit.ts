/* =====================================================================================
 * Interface — boîte à outils publiée sous EXT.uiKit (interface UiKit de extensions.ts) et
 * environnement interne partagé par les écrans de ce module (UiEnv).
 * ===================================================================================== */

import type { Button, GameContext, InputDevice, ScreenId } from '@/core/contracts';
import type { HudSlot, HudWidget, ScreenInstance, ScreenOptions, UiKit } from '@/core/extensions';
import type { InputLabelsApi } from '@/input/api';
import type { Widgets } from './components';
import { h } from './dom';
import type { FocusNav } from './focus';
import type { Notices } from './notices';
import type { ObjectivesStore } from './objectives';
import type { ScreenManager } from './screens';
import type { Hud } from '../hud/hud';

/** Libellés de repli (clavier AZERTY par défaut) quand le module des entrées n'est pas branché. */
const FALLBACK_KEYS: Readonly<Partial<Record<Button, string>>> = {
  primary: 'Clic gauche', secondary: 'Clic droit', interact: 'E', reload: 'R', sprint: 'Maj', crouch: 'C', jump: 'Espace',
  item_next: 'Molette', item_prev: 'Molette', radio: 'T', orders: 'F', map: 'M', tactical: 'Tab', camera: 'V', pause: 'Échap',
  flashlight: 'L', mask: 'G', visor: 'H', siren: 'R', beacons: 'B', horn: 'N', handbrake: 'Espace', headlights: 'L', megaphone: 'X',
  fast_forward: '.', zoom_in: '+', zoom_out: '−', ui_accept: 'Entrée', ui_back: 'Échap', ui_up: '↑', ui_down: '↓', ui_left: '←', ui_right: '→',
};

/** Ce dont les écrans internes ont besoin. */
export interface UiEnv {
  readonly ctx: GameContext;
  readonly kit: UiKit;
  readonly widgets: Widgets;
  readonly screens: ScreenManager;
  readonly nav: FocusNav;
  readonly notices: Notices;
  readonly objectives: ObjectivesStore;
  /** Libellé d'une touche pour un périphérique donné (défaut : périphérique actif). */
  keyLabel(button: Button, device?: InputDevice): string;
}

export interface KitParts {
  ctx: GameContext;
  root: HTMLElement;
  screens: ScreenManager;
  hud: Hud;
  nav: FocusNav;
  widgets: Widgets;
}

export function keyLabelOf(ctx: GameContext, button: Button, device?: InputDevice): string {
  const labels = ctx.service<InputLabelsApi>('input.labels');
  if (labels) {
    try {
      const text = labels.labelFor(button, device);
      if (text) return text;
    } catch (err) {
      console.error('[ui] libellé de touche indisponible', err);
    }
  }
  return FALLBACK_KEYS[button] ?? '';
}

export function createKit(parts: KitParts): UiKit {
  const { ctx, root, screens, hud, nav, widgets } = parts;
  return {
    root,
    registerScreen(id: ScreenId, create: (host: HTMLElement, data: unknown) => ScreenInstance, options: ScreenOptions): void {
      screens.register(id, create, options);
    },
    hasScreen(id: ScreenId): boolean {
      return screens.has(id);
    },
    addHudWidget(id: string, slot: HudSlot, create: (host: HTMLElement) => HudWidget): void {
      hud.addWidget(id, slot, create);
    },
    removeHudWidget(id: string): void {
      hud.removeWidget(id);
    },
    h,
    button(label: string, onClick: () => void, variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary'): HTMLButtonElement {
      return widgets.button(label, onClick, variant);
    },
    focusGroup(container: HTMLElement): { dispose(): void } {
      return nav.createGroup(container);
    },
    keyLabel(button: Button): string {
      return keyLabelOf(ctx, button);
    },
  };
}
