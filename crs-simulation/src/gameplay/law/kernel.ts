/* =====================================================================================
 * Droit — noyau partagé par les composants du module (un seul par contexte de jeu).
 * ===================================================================================== */

import type { GameContext, NoticeKind, Person, Rng, RoeState } from '@/core/contracts';
import type { LawConfig } from './api';
import type { AttackTracker } from './attack';
import type { Attroupement } from './attroupement';
import type { Controls } from './controls';
import type { Custody } from './custody';
import type { DetaineeWays } from './detainee';
import type { ForceJudge } from './force';
import type { Handover } from './handover';
import type { Offenses } from './offenses';
import type { Perception } from './perception';
import type { Records } from './records';
import type { Sommations } from './sommations';
import type { Subduing } from './subdue';

export interface Kernel {
  readonly ctx: GameContext;
  readonly cfg: LawConfig;
  readonly roe: RoeState;
  /** Générateur dérivé de la graine de session (recréé à chaque reset). */
  rng: Rng;
  records: Records;
  attack: AttackTracker;
  eyes: Perception;
  sommations: Sommations;
  attroupement: Attroupement;
  offenses: Offenses;
  force: ForceJudge;
  custody: Custody;
  subdue: Subduing;
  handover: Handover;
  /** L'interpellé de chaque agent et sa meilleure issue (service 'law.custody'). */
  ways: DetaineeWays;
  controls: Controls;
  /** Message au joueur s'il incarne `p` (sans effet pour un PNJ). Les répétitions rapprochées sont filtrées. */
  notify(p: Person | null | undefined, text: string, kind?: NoticeKind, seconds?: number): void;
}

/** La personne appartient aux forces de l'ordre. */
export function isPolice(p: Person): boolean {
  return p.faction === 'police';
}

/** La personne participe à la manifestation (cortège, attroupement). */
export function isParticipant(p: Person): boolean {
  return p.faction === 'protest';
}
