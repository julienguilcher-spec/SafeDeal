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
/** Fait dégager la voie (ordre d'un policier, deux-tons d'un véhicule arrêté derrière lui) : se serre sur le côté. */
export const MODE_CLEAR = 5;

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
  /** Arrêté à destination : au prochain réveil, il choisit une nouvelle destination devant lui. */
  tripDue = false;
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
  /** Carrefour par lequel l'itinéraire entre dans une rue fermée : on n'y entre pas, on attend à sa ligne. */
  entryCp: ControlPoint | null = null;
  passS = -1;
  passRec: ClosureRec | null = null;
  passing = false;
  // ── sirène ──
  pullUntil = 0;
  pullFor: EntityId = 0;
  /** Sirène entendue (0 si aucune) et instant où le conducteur y réagit (délai de réaction, distraction). */
  heardFor: EntityId = 0;
  reactAt = 0;
  /** Dernière fois qu'une sirène a été entendue (s) : passé quelques secondes sans elle, on l'oublie. */
  heardAt = 0;
  /** Rangé, la sirène passée : il repart à cet instant (il jette un œil dans le rétroviseur avant). */
  resumeAt = -1;
  // ── allure ──
  /** Allure de croisière imposée au pilote automatique (m/s ; 0 = limite de la voie). Cyclistes : 4 à 6 m/s. */
  cruise = 0;
  /** Distance tenue entre son flanc droit et la bordure (m ; 0 = voie ordinaire). Cyclistes : au bord droit. */
  kerb = 0;
  // ── stationnement ──
  parkUntil = 0;
  parkSlot = -1;
  /** Prochaine révision possible d'une déviation (s). */
  viaAt = 0;
  /** Âge (s) : pas de disparition dans les premières secondes. */
  bornAt = 0;
  // ── dégagement de la voie (car-clear.ts) ──
  /** Qui l'a fait dégager (véhicule de police ou policier à pied). */
  clearBy: EntityId = 0;
  /** Début de la manœuvre ; fin (rangé) ; −1 tant qu'il manœuvre (s). */
  clearAt = 0;
  clearDone = -1;
  /** Axe de la rue (point, direction dans son sens de marche) et écart visé à droite de l'axe (m). */
  clearAx = 0;
  clearAz = 0;
  clearDx = 0;
  clearDz = 1;
  clearOff = 0;
  /** Sens de la manœuvre : 1 en avant, −1 en marche arrière, 0 à l'arrêt (rien de libre). */
  clearSign = 0;
  /** Distance parcourue depuis la dernière reprise (m) : une reprise ne dépasse pas une dizaine de mètres. */
  clearRun = 0;
  /** Temps passé sans avancer malgré la commande (s) ; dernier coup d'avertisseur (s). */
  clearStall = 0;
  clearHorn = 0;

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
    case MODE_CLEAR:
      return 'range';
    case MODE_PARK:
      return 'stationne';
    default:
      return b.fleeing ? 'fuite' : 'route';
  }
}
