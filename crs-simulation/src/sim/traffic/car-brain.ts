/* =====================================================================================
 * CIRCULATION — fiche d'un automobiliste (posée dans Vehicle.brain tant qu'il conduit).
 * ===================================================================================== */

import type { EntityId, Vehicle } from '@/core/contracts';
import type { BlockCause, MotoristStatus } from './api';
import type { ClosureRec } from './closures';
import type { ControlPoint } from './route';
import { CarRoute } from './route';

/** Roule vers sa destination (ou vers le point de passage d'une déviation). */
export const MODE_GO = 0;
/** Tenu à une ligne d'arrêt (feu, carrefour). */
export const MODE_HOLD = 1;
/** Rangé sur le côté pour laisser passer un véhicule en intervention. */
export const MODE_PULL = 2;
/** En train de se garer. */
export const MODE_PARK = 3;
/** Arrivé (automobiliste créé par une mission) : ne fait plus rien. */
export const MODE_DONE = 4;

export class CarBrain {
  readonly route = new CarRoute();
  readonly status: MotoristStatus = { mode: 'route', cause: '', blockedFor: 0, fear: 0, incidentId: 0 };
  readonly halfL: number;
  readonly halfW: number;
  driverId: EntityId = 0;
  /** Créé par la vie civile automatique : disparaît hors champ. */
  ambient = true;
  mode = MODE_GO;
  destX = 0;
  destZ = 0;
  hasVia = false;
  viaX = 0;
  viaZ = 0;
  holdCp: ControlPoint | null = null;
  holdCause: BlockCause = '';
  thinkT = 0;
  tick = 0;
  // ── immobilisation ──
  /** Secondes passées à l'arrêt / en mouvement (entiers, comptés à 1 Hz). */
  stillT = 0;
  movingT = 0;
  blockedT = 0;
  cause: BlockCause = '';
  patience = 18;
  hornAt = 0;
  escapeAt = 0;
  replanAt = -1;
  failures = 0;
  /** Temps passé arrêté avant un carrefour pourtant réservé (s). */
  waitBox = 0;
  /** Passage imposé jusqu'à cet instant (sortie d'un blocage mutuel au carrefour). */
  forceUntil = -1;
  // ── peur ──
  fear = 0;
  fleeing = false;
  // ── fermetures ──
  closureStamp = -1;
  graphStamp = -1;
  blockS = -1;
  passS = -1;
  passRec: ClosureRec | null = null;
  passing = false;
  // ── sirène ──
  pullUntil = 0;
  pullFor: EntityId = 0;
  // ── stationnement ──
  parkUntil = 0;
  parkSlot = -1;
  /** Prochaine révision possible d'une déviation (s). */
  viaAt = 0;
  /** Âge (s) : pas de disparition dans les premières secondes. */
  bornAt = 0;

  constructor(readonly v: Vehicle) {
    this.halfL = v.def.length * 0.5;
    this.halfW = v.def.width * 0.5;
  }
}

/** Mode lisible (MotoristStatus.mode). */
export function modeName(b: CarBrain): 'route' | 'arret' | 'range' | 'stationne' | 'fuite' {
  switch (b.mode) {
    case MODE_HOLD:
    case MODE_DONE:
      return 'arret';
    case MODE_PULL:
      return 'range';
    case MODE_PARK:
      return 'stationne';
    default:
      return b.fleeing ? 'fuite' : 'route';
  }
}
