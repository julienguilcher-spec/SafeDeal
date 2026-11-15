/* Horloge de simulation (Clock du contrat) — avancée uniquement par le moteur. */

import type { Clock } from './contracts';

export class GameClock implements Clock {
  /** Temps de session simulé (s). Pendant update(dt), c'est l'instant de FIN du pas en cours. */
  now = 0;
  /** Durée du pas de simulation courant (s) ; 0 avant le premier pas. */
  dt = 0;
  /** Numéro du pas de simulation (1 pendant le premier update d'une session). */
  tick = 0;
  /** Multiplicateur de vitesse (avance rapide). Modifiable par les modules. */
  timeScale = 1;

  /** Avance d'un pas de simulation. */
  advance(dt: number): void {
    this.dt = dt;
    this.now += dt;
    this.tick++;
  }

  /** Remise à zéro au début d'une session. */
  reset(): void {
    this.now = 0;
    this.dt = 0;
    this.tick = 0;
    this.timeScale = 1;
  }
}
