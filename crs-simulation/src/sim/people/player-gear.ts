/* =====================================================================================
 * Joueur — masque à gaz et visière (touches « mask » et « visor »).
 *
 * Le masque se met en 8 s et se retire en 3 s (docs/research/02 §2.3) : pendant ce temps les
 * mains sont prises (pas d'usage d'objet), et le geste est interrompu si l'on est frappé,
 * étourdi ou mis à terre, ou si l'on appuie de nouveau. La visière se manœuvre d'un geste.
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { hasMask, hasVisor, setGasMask, setVisor } from './gear';
import type { PeopleShared } from './shared';
import * as T from './tuning';

export class GearControl {
  /** Temps restant du geste en cours (s) ; 0 = aucun. */
  private timer = 0;
  private duration = 0;
  /** État visé par le geste en cours : masque mis (true) ou retiré (false). */
  private target = false;
  private personId = 0;

  constructor(private readonly ctx: GameContext, private readonly shared: PeopleShared) {}

  /** Un geste de masque est en cours : les mains sont prises. */
  get busy(): boolean {
    return this.timer > 0;
  }

  /** Progression 0..1 du geste en cours (0 si aucun). */
  get progress(): number {
    return this.timer > 0 && this.duration > 0 ? 1 - this.timer / this.duration : 0;
  }

  reset(): void {
    this.abort(null);
  }

  /** Interrompt le geste en cours (coup reçu, changement de personnage). */
  abort(p: Person | null): void {
    if (this.timer > 0 && p && p.id === this.personId && p.upper === 'cover_face') {
      p.upper = 'none';
      p.upperT = 0;
    }
    this.timer = 0;
    this.duration = 0;
    this.personId = 0;
  }

  /** @param canAct le personnage peut se servir de ses mains (ni à terre, ni menotté, ni occupé). */
  update(p: Person, dt: number, canAct: boolean): void {
    const ctx = this.ctx;
    const input = ctx.input;
    const e = this.shared.of(p);

    if (this.timer > 0) {
      if (p.id !== this.personId || !canAct || p.stun > 0.3) {
        this.abort(p);
      } else if (input.pressed('mask')) {
        this.abort(p); // nouvel appui : on renonce
      } else {
        this.timer -= dt;
        if (p.upper === 'cover_face') p.upperT += dt;
        else if (p.upper === 'none') {
          p.upper = 'cover_face';
          p.upperT = 0;
        }
        if (this.timer <= 0) {
          this.timer = 0;
          if (p.upper === 'cover_face') {
            p.upper = 'none';
            p.upperT = 0;
          }
          setGasMask(ctx, p, e, this.target);
          ctx.ui.notify(this.target ? 'Masque à gaz en place.' : 'Masque à gaz retiré.', 'ok', 2);
        }
      }
    } else if (input.pressed('mask') && canAct) {
      if (p.look.gasMask) {
        this.begin(p, false, T.MASK_DOFF_TIME);
      } else if (hasMask(ctx, p)) {
        this.begin(p, true, T.MASK_DON_TIME);
      } else {
        ctx.ui.notify("Vous n'avez pas de masque à gaz.", 'warn', 2);
      }
    }

    if (input.pressed('visor') && canAct) {
      if (!hasVisor(p)) ctx.ui.notify('Pas de visière sur cette coiffe.', 'warn', 2);
      else setVisor(p, e, !p.look.visorDown);
    }
  }

  private begin(p: Person, on: boolean, seconds: number): void {
    this.timer = seconds;
    this.duration = seconds;
    this.target = on;
    this.personId = p.id;
    if (p.upper === 'none') {
      p.upper = 'cover_face';
      p.upperT = 0;
    }
  }
}
