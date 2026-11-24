/* =====================================================================================
 * Ordres directs — LES TOUCHES DU TERRAIN (Mac sans souris : clavier et pavé tactile), lues à chaque image :
 *
 *   Entrée          l'ordre prêt affiché (service 'command.direct' give()) ;
 *   Maj+Entrée      la ligne « autre » (Disperser la foule, Envoyer sans barrer) — Maj lue sur l'appui lui-même ;
 *   A (KeyQ)        « Avec moi » : tout le monde (ou l'unité choisie par U) revient et le suit ;
 *   U / Maj+U       à qui : unité suivante / précédente (même cycle que la carte) ;
 *   ⌫               annuler le dernier ordre (5 s) ;
 *   Page préc. /    (fn + ↑ / ↓ sur un Mac) : un candidat de la désignation plus loin / plus près à chaque appui.
 *   Page suiv.
 * Les touches viennent de la table des affectations (input/bindings.ts : order_go, with_me, order_who, order_undo),
 * donc réaffectables. Garde-fous (§1.1) : ignorées hors du jeu en cours, pendant qu'un écran est ouvert et 0,6 s après
 * sa fermeture (le moteur s'en charge : l'Entrée « Donner l'ordre » qui ferme la carte, le ⌫ qui ferme la roue ne
 * donnent rien sur le terrain), une répétition de touche n'est jamais un appui (input/kbm.ts), un champ de saisie
 * garde ses touches. U agit aussi roue ouverte (la roue suit le choix), jamais carte ouverte (la carte a son propre U).
 *
 * La désignation (designate.ts) est calculée ici à chaque image et donnée au moteur au plus 4 fois par seconde (tout
 * de suite quand ce qu'on désigne change de nature) : l'ordre prêt n'est jamais recalculé à l'appui. Au téléphone, un
 * toucher bref du monde désigne ce qui est sous le doigt pendant 4 s, à la place du regard (tapDesignate.ts) ; la
 * pastille « Ordre prêt » et « ⟳ À qui » arrivent ici comme Entrée et U (boutons order_go et order_who).
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { CommandCore } from '../core';
import type { DirectRuntime } from './runtime';
import { Designator, viewOfPlayer } from './designate';
import { TapDesignation } from './tapDesignate';
import type { Designation } from './types';

/** Écran de la roue d'ordres (orderWheel.ts WHEEL_SCREEN) : U y change l'unité des secteurs. */
const WHEEL_SCREEN_ID = 'roue_ordres';
/** Désignation transmise au moteur au plus toutes les (s). */
const DESIGNATION_PERIOD = 0.25;

/** Services d'entrée lus (src/input/api.ts), vus par leur méthode. */
interface BindingsLike { get(device: 'kbm', action: 'look_up' | 'look_down'): readonly string[] }

/** Clé de nature d'une désignation : un changement de nature passe tout de suite, un déplacement attend 0,25 s. */
function natureOf(d: Designation | null): string {
  if (!d) return '-';
  return `${d.kind}|${d.person ? d.person.id : 0}|${d.place}`;
}

export class FieldKeys {
  readonly designator: Designator;
  /** Toucher du monde (téléphone) : désigne sous le doigt pendant 4 s. */
  readonly tap: TapDesignation;
  private shift = false;
  private attached = false;
  private sentAt = -1e9;
  private sentNature = '';

  constructor(private readonly core: CommandCore, private readonly direct: DirectRuntime) {
    this.designator = new Designator(core);
    this.tap = new TapDesignation(core);
  }

  private get ctx(): GameContext {
    return this.core.ctx;
  }

  /** Écoute la touche Maj et les appuis de Page préc. / Page suiv. (navigateur seulement). */
  attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Nouvelle session. */
  reset(): void {
    this.designator.reset();
    this.tap.reset();
    this.shift = false;
    this.sentAt = -1e9;
    this.sentNature = '';
  }

  private lookDir(code: string): 1 | -1 | 0 {
    const b = this.ctx.service<BindingsLike>('input.bindings');
    if (!b || typeof b.get !== 'function') return code === 'PageUp' ? 1 : code === 'PageDown' ? -1 : 0;
    if (b.get('kbm', 'look_up').includes(code)) return 1;
    if (b.get('kbm', 'look_down').includes(code)) return -1;
    return 0;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.shift = e.shiftKey;
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.ctx.ui.current !== null) return;
    const dir = this.lookDir(e.code);
    if (dir !== 0) this.designator.keyStep(dir);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.shift = e.shiftKey;
    if (this.lookDir(e.code) !== 0) this.designator.keyRelease();
  };

  private readonly onBlur = (): void => {
    this.shift = false;
    this.designator.keyRelease();
  };

  /** La désignation de cette image (et le moteur en est averti au plus 4 fois par seconde). */
  designate(): Designation | null {
    const ctx = this.ctx;
    // téléphone : ce que le doigt a touché dans le monde, 4 s ; sinon le regard
    const d = this.tap.update() ?? this.designator.update(viewOfPlayer(ctx), ctx.clock.now);
    const nature = natureOf(d);
    const now = ctx.clock.now;
    if (d && (nature !== this.sentNature || now - this.sentAt >= DESIGNATION_PERIOD)) {
      this.direct.setDesignation(d);
      this.sentAt = now;
      this.sentNature = nature;
    }
    return d;
  }

  /** À chaque image : la désignation, puis les touches. */
  frame(): void {
    const ctx = this.ctx;
    if (ctx.session.phase !== 'playing' || !this.core.player()) return;
    // hors de la police (manifestant, journaliste, secours…) : ni unité à commander ni unité à rappeler, ces touches ne
    // font rien (pas même un message à chaque Entrée)
    if (this.core.scope().level === 'lecture' && !this.core.followUnit()) return;
    const screen = ctx.ui.current;
    if (screen === null) this.designate();
    const input = ctx.input;
    const shift = this.shift;
    // U : en jeu, ou roue ouverte (la roue relit le choix) ; jamais par-dessus la carte ou un menu
    if (input.pressed('order_who') && (screen === null || screen === WHEEL_SCREEN_ID)) this.direct.cycle(shift ? -1 : 1);
    if (input.pressed('order_go')) this.feedback(this.direct.give(shift ? 'autre' : 'go'));
    if (input.pressed('with_me')) this.feedback(this.direct.avecMoi());
    if (input.pressed('order_undo')) {
      const r = this.direct.undo();
      if (r.ok && r.text !== '') ctx.ui.notify(r.text, 'info', 3);
    }
  }

  /** Un ordre parti : le bip de la radio (le refus a déjà son message, l'appui ignoré ne fait rien). */
  private feedback(r: { ok: boolean; ignored: boolean }): void {
    if (r.ignored) return;
    this.ctx.audio.play(r.ok ? 'radio_bip' : 'ui_alerte');
  }
}
