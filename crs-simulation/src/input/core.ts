/* =====================================================================================
 * Entrées — InputCore : l'objet publié dans ctx.input.
 *
 * Il ne connaît aucun périphérique : les sources (clavier/souris, manette, tactile, script) y
 * poussent leurs transitions de boutons (latch.set) et leurs rotations (addLook), le système
 * y recopie les axes fusionnés, puis verrouille une vue au début de chaque pas (beginStep) et
 * de chaque image (beginFrame). Voir edges.ts pour les garanties sur les fronts.
 * Aucun accès au DOM.
 * ===================================================================================== */

import type { Button, InputDevice, InputState } from '@/core/contracts';
import { BUTTON_COUNT, BUTTON_INDEX } from './buttons';
import { ButtonLatch, DeltaLatch, VIEW_FRAME, VIEW_SIM } from './edges';
import type { ViewId } from './edges';

const CH_LOOK_X = 0;
const CH_LOOK_Y = 1;
const CH_WHEEL = 2;

export class InputCore implements InputState {
  device: InputDevice = 'kbm';
  moveX = 0;
  moveY = 0;
  throttle = 0;
  brake = 0;
  pointerLocked = false;

  /** Boutons du contrat, toutes sources confondues. */
  readonly latch = new ButtonLatch(BUTTON_COUNT);
  private readonly deltas = new DeltaLatch(3);
  /** Vue lue par down/pressed/released/lookX/lookY/wheel : simulation pendant les pas, image sinon. */
  private view: ViewId = VIEW_FRAME;
  /** Branché par le système : vibration de la manette ou du téléphone. */
  rumbleSink: ((strength: number, seconds: number) => void) | null = null;

  get lookX(): number {
    return this.deltas.get(this.view, CH_LOOK_X);
  }

  get lookY(): number {
    return this.deltas.get(this.view, CH_LOOK_Y);
  }

  get wheel(): number {
    return this.deltas.get(this.view, CH_WHEEL);
  }

  down(b: Button): boolean {
    const i = BUTTON_INDEX[b];
    return i !== undefined && this.latch.down(this.view, i);
  }

  pressed(b: Button): boolean {
    const i = BUTTON_INDEX[b];
    return i !== undefined && this.latch.pressed(this.view, i);
  }

  released(b: Button): boolean {
    const i = BUTTON_INDEX[b];
    return i !== undefined && this.latch.released(this.view, i);
  }

  rumble(strength: number, seconds: number): void {
    if (!(strength > 0) || !(seconds > 0) || !this.rumbleSink) return;
    try {
      this.rumbleSink(strength > 1 ? 1 : strength, seconds > 5 ? 5 : seconds);
    } catch (err) {
      console.error('[input] vibration impossible', err);
    }
  }

  // ───────────────────────────── côté sources ─────────────────────────────

  /** Rotation du regard (radians ; x > 0 = droite, y > 0 = haut), créditée aux deux vues. */
  addLook(dx: number, dy: number): void {
    if (dx !== 0) this.deltas.add(CH_LOOK_X, dx);
    if (dy !== 0) this.deltas.add(CH_LOOK_Y, dy);
  }

  /** Crans de molette (> 0 = vers le bas). */
  addWheel(notches: number): void {
    if (notches !== 0) this.deltas.add(CH_WHEEL, notches);
  }

  // ───────────────────────────── côté système ─────────────────────────────

  /** Début d'un pas de simulation : les lectures qui suivent voient la vue « simulation ». */
  beginStep(): void {
    this.latch.latch(VIEW_SIM);
    this.deltas.latch(VIEW_SIM);
    this.view = VIEW_SIM;
  }

  /**
   * Début de la phase de présentation d'une image : les lectures qui suivent voient la vue « image ».
   * `simRunning = false` (pause, menus) : la vue « simulation » est recalée sans front et ses
   * rotations en attente sont oubliées, pour que rien de ce qui se passe hors jeu n'y fuie.
   */
  beginFrame(simRunning: boolean): void {
    this.latch.latch(VIEW_FRAME);
    this.deltas.latch(VIEW_FRAME);
    if (!simRunning) {
      this.latch.sync(VIEW_SIM);
      this.deltas.flush(VIEW_SIM);
    }
    this.view = VIEW_FRAME;
  }

  /** Vue en cours de lecture (pour les tests et le banc d'essai). */
  get activeView(): ViewId {
    return this.view;
  }

  /** Nouvelle session : plus aucun front ni rotation en attente (les touches tenues le restent). */
  resetEdges(): void {
    this.latch.sync(VIEW_SIM);
    this.latch.sync(VIEW_FRAME);
    this.deltas.clear();
  }
}
