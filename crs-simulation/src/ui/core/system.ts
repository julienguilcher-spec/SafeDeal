/* =====================================================================================
 * Interface — système (GameSystem d'ordre UI) : socle, HUD, écrans.
 *
 * provide()  crée le DOM dans #ui, publie ctx.ui (UiApi), EXT.uiKit, EXT.objectives et 'ui.debug',
 *            enregistre les écrans de ce module ;
 * init()     monte les éléments du HUD, s'abonne aux événements ;
 * frame(dt)  navigation au focus, touches d'interface, écrans, HUD, messages ;
 * reset()    nouvelle session : objectifs, messages et HUD remis à zéro.
 *
 * En mode headless (tests Node), seul EXT.objectives est publié : aucun DOM n'est touché et
 * ctx.ui reste l'interface neutre du cœur.
 * ===================================================================================== */

import type {
  Button, GameContext, GameSystem, InputDevice, NoticeKind, ScreenId, SessionConfig, SessionPhase, UiApi, Unsubscribe,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, ScreenOptions, TrafficControlApi, UiKit } from '@/core/extensions';
import type { LaunchParams } from '@/core/launch';
import { HOTKEY_SCREENS, SCENARIO_AREA_RADIUS, UI_DEBUG_SERVICE, UI_WIDGETS_SERVICE } from './api';
import type { ScenarioExtra, UiDebugApi } from './api';
import { Tooltip, Widgets } from './components';
import { CSS_BASE } from './css/base';
import { CSS_HUD } from './css/hud';
import { CSS_SCREENS } from './css/screens';
import { h } from './dom';
import { FocusNav } from './focus';
import { createKit, keyLabelOf } from './kit';
import type { UiEnv } from './kit';
import { Notices } from './notices';
import { createObjectives } from './objectives';
import type { ObjectivesStore } from './objectives';
import { ScreenManager } from './screens';
import type { OpenScreen } from './screens';
import { Hud } from '../hud/hud';
import { createDroneBand, createDroneFrame, createViewfinderBand, createViewfinderFrame } from '../hud/cameras';
import { createCenter } from '../hud/center';
import { createCompass } from '../hud/compass';
import { createItemBar, createPrompt, createTouchFeed } from '../hud/items';
import { createMarkers } from '../hud/markers';
import { createObjectivesPart } from '../hud/objectives';
import { createFps, createSituation } from '../hud/situation';
import { createStatus } from '../hud/status';
import type { HudEnv } from '../hud/types';
import { createVehicleHud } from '../hud/vehicle';
import { registerScreens } from '../screens/index';

export const STYLE_ID = 'crs-ui-style';

interface ScreenMeta {
  group: { dispose(): void };
  previousFocus: HTMLElement | null;
}

const HOTKEYS: readonly (keyof typeof HOTKEY_SCREENS)[] = ['map', 'tactical', 'orders', 'radio'];

export class UiSystem implements GameSystem {
  readonly id = 'ui';
  readonly order = SystemOrder.UI;

  private ctx!: GameContext;
  private objectives: ObjectivesStore = createObjectives();
  private dom = false;
  private root!: HTMLElement;
  private screens!: ScreenManager;
  private hud!: Hud;
  private notices!: Notices;
  private nav!: FocusNav;
  private tooltip!: Tooltip;
  private kit!: UiKit;
  private env!: UiEnv;
  private styleEl: HTMLStyleElement | null = null;
  private readonly offs: Unsubscribe[] = [];
  private pendingExtra: { extra: ScenarioExtra; x: number; z: number } | null = null;
  private noMenu = false;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide(EXT.objectives, this.objectives);
    if (ctx.headless || typeof document === 'undefined') return;
    this.dom = true;

    // ── DOM : racine, couches, feuille de style ──
    const host = document.getElementById('ui') ?? document.body;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS_BASE + CSS_HUD + CSS_SCREENS;
      document.head.appendChild(style);
      this.styleEl = style;
    }
    const root = h('div', 'crs-ui');
    root.setAttribute('lang', 'fr');
    const hudLayer = h('div', 'ui-layer ui-layer--hud');
    const screenLayer = h('div', 'ui-layer ui-layer--screens');
    const noticeLayer = h('div', 'ui-layer ui-layer--notices');
    root.append(hudLayer, screenLayer, noticeLayer);
    host.append(root);
    this.root = root;

    // ── socle ──
    const feedback = (kind: 'tick' | 'accept' | 'alert'): void => {
      ctx.audio.play(kind === 'alert' ? 'ui_alerte' : 'ui_clic', { volume: kind === 'tick' ? 0.35 : 0.6 });
    };
    this.notices = new Notices(noticeLayer, {
      subtitlesEnabled: () => ctx.settings.values.subtitles,
      onNotice: (kind: NoticeKind) => {
        if (kind === 'alert' || kind === 'warn') ctx.audio.play('ui_alerte', { volume: 0.5 });
        else if (kind === 'ok') ctx.audio.play('ui_valide', { volume: 0.5 });
      },
    });
    this.screens = new ScreenManager({
      session: ctx.session,
      hostFactory: (id: ScreenId, options: ScreenOptions) => {
        const el = h('div', 'ui-screen' + (options.modal ? ' ui-screen--modal' : ''));
        el.dataset.screen = id;
        if (options.modal) {
          el.setAttribute('role', 'dialog');
          el.setAttribute('aria-modal', 'true');
        }
        screenLayer.append(el);
        return el;
      },
      hostRemove: (el: HTMLElement) => el.remove(),
      onOpened: (screen: OpenScreen) => this.onScreenOpened(screen),
      onClosing: (screen: OpenScreen) => this.onScreenClosing(screen),
      onChange: () => this.onStackChanged(),
      warn: (message: string, err?: unknown) => {
        if (err !== undefined) console.error('[ui] ' + message, err);
        else console.warn('[ui] ' + message);
      },
    });
    this.nav = new FocusNav(root, {
      scope: () => this.screens.top?.host ?? null,
      onBack: () => {
        this.screens.back();
      },
    });
    const widgets = new Widgets(feedback, (container: HTMLElement) => this.nav.createGroup(container));
    const hudEnv: HudEnv = { ctx, objectives: this.objectives, keyLabel: (b: Button) => keyLabelOf(ctx, b) };
    this.hud = new Hud(hudLayer, hudEnv, root, {
      toastCount: () => this.notices.toastCount,
      subtitleCount: () => this.notices.subtitleCount,
    });
    this.kit = createKit({ ctx, root: host, screens: this.screens, hud: this.hud, nav: this.nav, widgets });
    this.tooltip = new Tooltip(root);
    this.env = {
      ctx, kit: this.kit, widgets, screens: this.screens, nav: this.nav, notices: this.notices, objectives: this.objectives,
      keyLabel: (b: Button, device?: InputDevice) => keyLabelOf(ctx, b, device),
    };

    // ── services ──
    const screens = this.screens;
    const notices = this.notices;
    const api: UiApi = {
      notify: (text: string, kind?: NoticeKind, seconds?: number) => notices.notify(text, kind, seconds),
      subtitle: (speaker: string, text: string, seconds?: number) => notices.subtitle(speaker, text, seconds),
      banner: (title: string, subtitle?: string, seconds?: number) => notices.banner(title, subtitle, seconds),
      open: (screen: ScreenId, data?: unknown) => {
        screens.open(screen, data);
      },
      close: (screen?: ScreenId) => {
        screens.close(screen);
      },
      get modal(): boolean {
        return screens.modal;
      },
      get current(): ScreenId | null {
        return screens.current;
      },
    };
    ctx.ui = api;
    ctx.provide(EXT.uiKit, this.kit);
    const hud = this.hud;
    const debug: UiDebugApi = {
      get stack(): readonly ScreenId[] {
        return screens.stack.map((s) => s.id);
      },
      get hudVisible(): boolean {
        return hud.isVisible;
      },
      hudWidgets: () => hud.widgetIds(),
      notices: () => notices.texts(),
      focused: () => {
        const a = document.activeElement;
        if (!(a instanceof HTMLElement) || !root.contains(a)) return '';
        return a.dataset.id || a.getAttribute('aria-label') || (a.textContent ?? '').trim().slice(0, 60);
      },
    };
    ctx.provide(UI_DEBUG_SERVICE, debug);
    ctx.provide(UI_WIDGETS_SERVICE, widgets);

    registerScreens(this.env);
  }

  init(ctx: GameContext): void {
    if (!this.dom) return;
    const launch = ctx.service<LaunchParams>('launch');
    this.noMenu = launch ? launch.nomenu : false;
    // sans module d'entrées, le clavier est lu directement pour la navigation
    this.nav.domKeys = ctx.service('input.labels') === undefined;

    // ── HUD : calques plein écran d'abord, puis éléments des zones ──
    const env: HudEnv = { ctx, objectives: this.objectives, keyLabel: (b: Button) => keyLabelOf(ctx, b) };
    this.hud.mount([
      createMarkers(env),
      createDroneFrame(env),
      createViewfinderFrame(env),
      createCenter(env, this.hud.root),
      createTouchFeed(env),
      createSituation(env),
      createFps(env),
      createCompass(env),
      createDroneBand(env),
      createObjectivesPart(env),
      createStatus(env),
      createVehicleHud(env),
      createPrompt(env),
      createViewfinderBand(env),
      createItemBar(env),
    ]);

    // ── événements ──
    this.offs.push(ctx.events.onAny('session:phase', (payload) => {
      const p = payload as { phase: SessionPhase; previous: SessionPhase };
      this.onPhase(p.phase, p.previous);
    }));
    this.offs.push(ctx.events.on('session:started', ({ config }) => this.onSessionStarted(config)));
    this.offs.push(ctx.events.on('radio:message', ({ msg }) => {
      if (msg.priority >= 1) this.notices.subtitle(msg.from, msg.text);
    }));
    this.offs.push(ctx.events.on('law:sommation', ({ text }) => {
      if (text) this.notices.subtitle('Sommation', text, 7);
    }));
    // phase déjà atteinte avant l'abonnement (boot terminé par un autre chemin)
    if (ctx.session.phase !== 'boot') this.onPhase(ctx.session.phase, 'boot');
  }

  frame(dt: number): void {
    if (!this.dom) return;
    const ctx = this.ctx;
    const input = ctx.input;
    const screens = this.screens;
    const phase = ctx.session.phase;

    // retour arrière : d'abord l'élément focalisé, puis l'écran du dessus
    let backUsed = false;
    if (input.pressed('ui_back') && screens.stack.length > 0) {
      this.nav.back();
      backUsed = true;
    }
    this.nav.update(dt, input, input.device === 'gamepad', screens.modal);

    // touches d'interface (en jeu seulement)
    if (phase === 'playing' || phase === 'paused') {
      if (input.pressed('pause') && !backUsed) this.togglePause();
      for (let i = 0; i < HOTKEYS.length; i++) {
        const key = HOTKEYS[i]!;
        if (input.pressed(key)) this.toggleHotkeyScreen(key);
      }
    }

    screens.update(dt, input);
    this.applyScenarioExtra();
    this.hud.update(dt);
    this.notices.update(dt);
  }

  reset(): void {
    this.objectives.clear();
    if (!this.dom) return;
    this.notices.clear();
    this.hud.reset();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (!this.dom) return;
    this.screens.closeAll();
    this.hud.dispose();
    this.tooltip.dispose();
    this.nav.dispose();
    this.root.remove();
    this.styleEl?.remove();
    this.dom = false;
  }

  // ───────────────────────────── écrans ─────────────────────────────

  private onScreenOpened(screen: OpenScreen): void {
    const previous = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement : null;
    const meta: ScreenMeta = { group: this.nav.createGroup(screen.host), previousFocus: previous };
    screen.meta = meta;
    // focus initial : celui choisi par l'écran, sinon son élément par défaut
    if (screen.options.modal && !screen.host.contains(document.activeElement)) this.nav.focusDefault(screen.host);
  }

  private onScreenClosing(screen: OpenScreen): void {
    const meta = screen.meta as ScreenMeta | null;
    if (!meta) return;
    meta.group.dispose();
    const back = meta.previousFocus;
    if (back && back.isConnected && !back.closest('[inert]')) {
      // rendu après la mise à jour de la pile (l'écran du dessous n'est plus inerte)
      queueMicrotask(() => {
        if (back.isConnected && this.screens.top && this.screens.top.host.contains(back)) back.focus({ preventScroll: true });
      });
    }
  }

  private onStackChanged(): void {
    // seul l'écran du dessus reçoit clavier, manette et pointeur quand il est modal
    const stack = this.screens.stack;
    let covered = false;
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i]!;
      s.host.inert = covered;
      if (s.options.modal) covered = true;
    }
    this.updateHudVisibility();
    // un écran vient de se fermer : le focus revient à l'écran du dessus s'il l'a perdu
    const top = this.screens.top;
    if (top && top.options.modal && !top.host.contains(document.activeElement)) {
      queueMicrotask(() => {
        if (this.screens.top === top && !top.host.contains(document.activeElement)) this.nav.focusDefault(top.host);
      });
    }
  }

  private updateHudVisibility(): void {
    const phase = this.ctx.session.phase;
    this.hud.setVisible((phase === 'playing' || phase === 'paused') && !this.screens.hidesHud);
  }

  private onPhase(phase: SessionPhase, previous: SessionPhase): void {
    const screens = this.screens;
    switch (phase) {
      case 'menu':
        screens.closeAll();
        if (!this.noMenu) screens.open('menu_principal');
        break;
      case 'loading':
        screens.closeAll();
        screens.open('chargement');
        break;
      case 'playing':
        if (previous === 'loading') screens.close('chargement');
        // pause levée par un autre que l'interface alors qu'un écran la tenait
        else if (previous === 'paused' && screens.pauses) screens.releasePausingScreens();
        break;
      case 'paused':
        // pause posée par un autre (perte de focus, manette débranchée) : on montre l'écran de pause
        if (!screens.pauses) screens.open('pause');
        break;
      case 'debrief':
        screens.closeAll();
        screens.open('debrief');
        break;
      default:
        break;
    }
    screens.syncPause();
    this.updateHudVisibility();
  }

  private togglePause(): void {
    const screens = this.screens;
    if (screens.isOpen('pause')) {
      if (screens.current === 'pause') screens.close('pause');
      return;
    }
    if (this.ctx.session.phase === 'playing' && !screens.modal) screens.open('pause');
  }

  /**
   * Carte et carte tactique : la touche ouvre l'écran s'il est enregistré et le referme s'il est ouvert ;
   * l'une remplace l'autre. Ordres et radio : la touche ne fait qu'OUVRIR, et seulement en vue de jeu
   * (aucun écran modal) — ces écrans gèrent eux-mêmes leur fermeture (touche relâchée, retour), et à
   * la manette leurs touches sont aussi celles de la croix, qui sert à naviguer dans les menus.
   */
  private toggleHotkeyScreen(key: keyof typeof HOTKEY_SCREENS): void {
    const screens = this.screens;
    let id: ScreenId | null = null;
    for (const candidate of HOTKEY_SCREENS[key]) {
      if (screens.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) return;
    if (key === 'orders' || key === 'radio') {
      if (!screens.modal && !screens.isOpen(id)) screens.open(id);
      return;
    }
    if (screens.isOpen(id)) {
      screens.close(id);
      return;
    }
    // on ne passe pas par-dessus un menu (pause, paramètres…) ; l'autre carte, si elle est ouverte, est remplacée
    const maps: ScreenId[] = [...HOTKEY_SCREENS.map, ...HOTKEY_SCREENS.tactical];
    for (const s of screens.stack) if (s.options.modal && maps.indexOf(s.id) < 0) return;
    screens.closeAll((s) => maps.indexOf(s.id) >= 0);
    screens.open(id);
  }

  // ───────────────────────────── scénario ─────────────────────────────

  private onSessionStarted(config: SessionConfig): void {
    const extra = config.extra as Partial<ScenarioExtra> | undefined;
    this.pendingExtra = extra && extra.scenario === 1
      ? { extra: extra as ScenarioExtra, x: config.x ?? 0, z: config.z ?? 0 }
      : null;
  }

  /**
   * Réglages de la page d'accueil qui passent par des services du contrat : vent, circulation coupée,
   * stations de métro fermées. Appliqués une fois, à la première image jouée (le monde est peuplé).
   */
  private applyScenarioExtra(): void {
    const pending = this.pendingExtra;
    if (!pending || this.ctx.session.phase !== 'playing') return;
    this.pendingExtra = null;
    const ctx = this.ctx;
    const { extra, x, z } = pending;
    const byId = ctx.player.state.personId;
    try {
      const vent = extra.vent;
      if (vent && typeof vent.direction === 'number' && typeof vent.vitesse === 'number') {
        // le vent VIENT de `direction` : il souffle vers l'azimut opposé (x = est, z = sud)
        const to = ((vent.direction + 180) * Math.PI) / 180;
        const speed = vent.vitesse / 3.6;
        ctx.env.setWind(Math.sin(to) * speed, -Math.cos(to) * speed);
      }
      const options = extra.options;
      if (options && options.circulation === 'coupee') {
        ctx.service<TrafficControlApi>(EXT.traffic)?.closeArea(x, z, SCENARIO_AREA_RADIUS, byId);
      }
      if (options && options.metro === 'ferme') {
        const metro = ctx.service<MetroApi>(EXT.metro);
        if (metro) {
          for (const station of metro.stations) {
            if (station.open && Math.hypot(station.x - x, station.z - z) <= SCENARIO_AREA_RADIUS) metro.setOpen(station.id, false, byId);
          }
        }
      }
    } catch (err) {
      console.error('[ui] application des réglages du scénario impossible', err);
    }
  }
}
