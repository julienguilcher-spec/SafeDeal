/* =====================================================================================
 * Interface — gestionnaire d'écrans : pile, écrans modaux, pause automatique, retour arrière.
 *
 * La logique ne dépend pas du DOM : l'hôte de chaque écran est fabriqué par `hostFactory`
 * (un <div> dans le navigateur, un objet quelconque dans les tests).
 *
 *   register(id, create, options)   déclare un écran
 *   open(id, data)                  l'ouvre au sommet de la pile (le recrée s'il était déjà ouvert)
 *   close(id?)                      ferme l'écran nommé, ou celui du sommet
 *   back()                          retour arrière : propose à l'écran du sommet (instance.back()),
 *                                   sinon le ferme
 *   modal / pauses / hidesHud       agrégats sur les écrans ouverts
 *
 * Pause : tant qu'un écran ouvert a `pauses: true` et que la session est en phase « playing », le
 * gestionnaire appelle session.pause(true) ; il ne relâche la pause que s'il l'a lui-même posée.
 * ===================================================================================== */

import type { InputState, ScreenId, SessionApi } from '@/core/contracts';
import type { ScreenInstance, ScreenOptions } from '@/core/extensions';

export type ScreenFactory = (host: HTMLElement, data: unknown) => ScreenInstance;

export interface OpenScreen {
  readonly id: ScreenId;
  readonly options: ScreenOptions;
  readonly host: HTMLElement;
  readonly instance: ScreenInstance;
  /** Donnée libre attachée par le système (groupe de focus, élément focalisé avant l'ouverture…). */
  meta: unknown;
}

export interface ScreenManagerOptions {
  session: Pick<SessionApi, 'phase' | 'pause'>;
  /** Fabrique l'hôte d'un écran et l'insère dans la page. */
  hostFactory(id: ScreenId, options: ScreenOptions): HTMLElement;
  /** Retire l'hôte de la page. */
  hostRemove(host: HTMLElement): void;
  /** Appelé après l'ouverture d'un écran (focus initial, groupe de focus). */
  onOpened?(screen: OpenScreen): void;
  /** Appelé juste avant la destruction d'un écran. */
  onClosing?(screen: OpenScreen): void;
  /** Appelé après tout changement de la pile. */
  onChange?(): void;
  warn?(message: string, err?: unknown): void;
}

interface Def {
  create: ScreenFactory;
  options: ScreenOptions;
}

export class ScreenManager {
  private readonly defs = new Map<ScreenId, Def>();
  private readonly stack_: OpenScreen[] = [];
  private pausedByUi = false;
  private syncing = false;

  constructor(private readonly options: ScreenManagerOptions) {}

  register(id: ScreenId, create: ScreenFactory, options: ScreenOptions): void {
    this.defs.set(id, { create, options: { ...options } });
  }

  has(id: ScreenId): boolean {
    return this.defs.has(id);
  }

  /** Écrans ouverts, du plus ancien au plus récent. */
  get stack(): readonly OpenScreen[] {
    return this.stack_;
  }

  get top(): OpenScreen | null {
    return this.stack_.length > 0 ? this.stack_[this.stack_.length - 1]! : null;
  }

  get current(): ScreenId | null {
    const top = this.top;
    return top ? top.id : null;
  }

  get modal(): boolean {
    for (let i = 0; i < this.stack_.length; i++) if (this.stack_[i]!.options.modal) return true;
    return false;
  }

  get pauses(): boolean {
    for (let i = 0; i < this.stack_.length; i++) if (this.stack_[i]!.options.pauses) return true;
    return false;
  }

  get hidesHud(): boolean {
    for (let i = 0; i < this.stack_.length; i++) if (this.stack_[i]!.options.hidesHud) return true;
    return false;
  }

  /** La pause en cours a-t-elle été posée par un écran ? */
  get holdsPause(): boolean {
    return this.pausedByUi;
  }

  isOpen(id: ScreenId): boolean {
    return this.indexOf(id) >= 0;
  }

  /** Ouvre un écran enregistré. false s'il est inconnu ou si sa création a échoué. */
  open(id: ScreenId, data?: unknown): boolean {
    const def = this.defs.get(id);
    if (!def) {
      this.options.warn?.(`écran « ${id} » non enregistré : ouverture ignorée`);
      return false;
    }
    const existing = this.indexOf(id);
    if (existing >= 0) this.destroy(existing);
    const host = this.options.hostFactory(id, def.options);
    let instance: ScreenInstance;
    try {
      instance = def.create(host, data);
    } catch (err) {
      this.options.hostRemove(host);
      this.options.warn?.(`création de l'écran « ${id} » impossible`, err);
      this.changed();
      return false;
    }
    const screen: OpenScreen = { id, options: def.options, host, instance, meta: null };
    this.stack_.push(screen);
    this.options.onOpened?.(screen);
    this.changed();
    return true;
  }

  /** Ferme l'écran nommé (ou celui du sommet). false si rien n'a été fermé. */
  close(id?: ScreenId): boolean {
    const index = id === undefined ? this.stack_.length - 1 : this.indexOf(id);
    if (index < 0) return false;
    this.destroy(index);
    this.changed();
    return true;
  }

  /** Ferme tous les écrans (ou ceux que le filtre retient). */
  closeAll(filter?: (screen: OpenScreen) => boolean): void {
    let closed = false;
    for (let i = this.stack_.length - 1; i >= 0; i--) {
      if (filter && !filter(this.stack_[i]!)) continue;
      this.destroy(i);
      closed = true;
    }
    if (closed) this.changed();
  }

  /** Retour arrière. true si un écran l'a traité ou a été fermé. */
  back(): boolean {
    const top = this.top;
    if (!top) return false;
    let handled = false;
    try {
      handled = top.instance.back ? top.instance.back() === true : false;
    } catch (err) {
      this.options.warn?.(`erreur dans back() de l'écran « ${top.id} »`, err);
    }
    if (handled) return true;
    return this.close(top.id);
  }

  /** update(dt) de chaque écran ouvert. */
  update(dt: number, input: InputState): void {
    // copie défensive de la longueur : un écran peut en fermer un autre pendant son update
    for (let i = 0; i < this.stack_.length; i++) {
      const s = this.stack_[i]!;
      if (!s.instance.update) continue;
      try {
        s.instance.update(dt, input);
      } catch (err) {
        this.options.warn?.(`erreur dans update() de l'écran « ${s.id} »`, err);
      }
    }
  }

  /**
   * Aligne la pause de la session sur les écrans ouverts. À appeler aussi quand la phase de la
   * session change (un écran qui met en pause peut être ouvert pendant le chargement).
   */
  syncPause(): void {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const session = this.options.session;
      const want = this.pauses;
      if (want) {
        if (session.phase === 'playing') {
          this.pausedByUi = true;
          session.pause(true);
        } else if (session.phase === 'paused') {
          // pause posée par un autre (perte de focus, autre module) : l'écran ouvert la reprend à son compte
          this.pausedByUi = true;
        }
      } else if (this.pausedByUi) {
        this.pausedByUi = false;
        if (session.phase === 'paused') session.pause(false);
      }
      // la session a quitté le jeu (menu, chargement) : il n'y a plus de pause à rendre
      if (session.phase !== 'paused' && session.phase !== 'playing') this.pausedByUi = false;
    } finally {
      this.syncing = false;
    }
  }

  /** La pause a été levée par un autre que l'interface : les écrans qui mettent en pause se ferment. */
  releasePausingScreens(): void {
    this.pausedByUi = false;
    this.closeAll((s) => s.options.pauses);
  }

  private indexOf(id: ScreenId): number {
    for (let i = this.stack_.length - 1; i >= 0; i--) if (this.stack_[i]!.id === id) return i;
    return -1;
  }

  private destroy(index: number): void {
    const screen = this.stack_[index]!;
    this.stack_.splice(index, 1);
    try {
      this.options.onClosing?.(screen);
    } catch (err) {
      this.options.warn?.(`erreur à la fermeture de l'écran « ${screen.id} »`, err);
    }
    try {
      screen.instance.dispose();
    } catch (err) {
      this.options.warn?.(`erreur dans dispose() de l'écran « ${screen.id} »`, err);
    }
    this.options.hostRemove(screen.host);
  }

  private changed(): void {
    this.syncPause();
    this.options.onChange?.();
  }
}
