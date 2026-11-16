/* =====================================================================================
 * Droit — violences contre les forces de l'ordre (cadre de la riposte directe).
 *
 * Article L. 211-9, alinéa 6, du code de la sécurité intérieure : la force peut être employée
 * directement, sans sommation, « si des violences ou voies de fait sont exercées » contre les
 * représentants de la force publique. Le module mémorise chaque acte violent (lieu, instant) :
 *   - underAttack (global, RoeState) : un acte au moins a moins de cfg.attackMemory secondes ;
 *   - near(x, z, r) : la riposte n'est permise qu'aux abords des violences (une unité à l'autre
 *     bout du dispositif ne peut pas s'en prévaloir).
 * ===================================================================================== */

import { ATTACK_RING } from './config';
import type { Kernel } from './kernel';

export class AttackTracker {
  /** Instant du dernier acte violent contre les forces (−Infinity si aucun). */
  lastAt = -Infinity;
  lastX = 0;
  lastZ = 0;
  /** Nombre d'actes enregistrés depuis le début de la session. */
  total = 0;

  /** Anneau [t, x, z] des derniers actes. */
  private readonly ring = new Float64Array(ATTACK_RING * 3);
  private head = 0;
  private count = 0;
  private active = false;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.lastAt = -Infinity;
    this.lastX = 0;
    this.lastZ = 0;
    this.total = 0;
    this.head = 0;
    this.count = 0;
    this.active = false;
  }

  /** Enregistre un acte violent contre les forces de l'ordre en (x, z). */
  note(x: number, z: number): void {
    const now = this.k.ctx.clock.now;
    const i = this.head * 3;
    this.ring[i] = now;
    this.ring[i + 1] = x;
    this.ring[i + 2] = z;
    this.head = (this.head + 1) % ATTACK_RING;
    if (this.count < ATTACK_RING) this.count++;
    this.lastAt = now;
    this.lastX = x;
    this.lastZ = z;
    this.total++;
    // l'état des règles d'engagement suit sans attendre le prochain pas
    this.update();
    this.k.sommations.refreshRoe();
  }

  /** Des violences ont-elles eu lieu récemment, où que ce soit ? */
  any(): boolean {
    return this.k.ctx.clock.now - this.lastAt <= this.k.cfg.attackMemory;
  }

  /** Des violences ont-elles eu lieu récemment à moins de `r` mètres du point ? */
  near(x: number, z: number, r: number): boolean {
    const now = this.k.ctx.clock.now;
    const memory = this.k.cfg.attackMemory;
    if (now - this.lastAt > memory) return false;
    const r2 = r * r;
    const ring = this.ring;
    for (let s = 0; s < this.count; s++) {
      const i = s * 3;
      if (now - ring[i]! > memory) continue;
      const dx = ring[i + 1]! - x;
      const dz = ring[i + 2]! - z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  /** Temps restant avant la fin du cadre de riposte (s, 0 si clos). */
  remaining(): number {
    const left = this.k.cfg.attackMemory - (this.k.ctx.clock.now - this.lastAt);
    return left > 0 ? left : 0;
  }

  /** Met à jour RoeState.underAttack et signale les transitions (appelé à chaque pas). */
  update(): void {
    const k = this.k;
    const now = this.any();
    k.roe.underAttack = now;
    if (now === this.active) return;
    this.active = now;
    k.ctx.events.emitAny('law:under_attack', { active: now, x: this.lastX, z: this.lastZ });
    const player = k.ctx.player.person();
    if (player && player.faction === 'police') {
      if (now) {
        k.notify(player, 'Violences contre les forces : riposte immédiate et proportionnée permise, sans sommation.', 'alert', 6);
      } else {
        k.notify(player, 'Les violences ont cessé : retour au cadre des sommations.', 'info', 5);
      }
    }
  }
}
