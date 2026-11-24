/* =====================================================================================
 * CIRCULATION — fiche d'un piéton civil (posée dans Person.brain).
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';

/** Marche sur le trottoir d'une rue. */
export const S_WALK = 0;
/** Rejoint l'angle de deux trottoirs (changement de rue sans traverser). */
export const S_CORNER = 1;
/** Attend au bord du trottoir de pouvoir traverser. */
export const S_WAIT = 2;
/** Traverse la chaussée. */
export const S_CROSS = 3;
/** Arrêt : vitrine, téléphone, photo. */
export const S_IDLE = 4;
/** Regarde (et parfois filme) le cortège. */
export const S_WATCH = 5;
/** Fuit un danger en courant. */
export const S_FLEE = 6;
/** Se dirige vers une chaise de terrasse, puis s'y assoit. */
export const S_SIT = 7;
/** S'éloigne de la manifestation en marchant vite. */
export const S_LEAVE = 8;
/** Commerçant devant sa boutique. */
export const S_SHOP = 9;

export class PedBrain {
  /** Créé par la vie civile automatique : disparaît hors champ. */
  ambient = true;
  state = S_WALK;
  // ── rue suivie ──
  edge = -1;
  /** Sens de marche le long de l'arête : +1 de a vers b. */
  dir = 1;
  /** Côté du trottoir par rapport au sens de MARCHE : +1 à droite. */
  side = 1;
  /** Position dans la largeur du trottoir, 0 (bord de chaussée) … 1 (façades). */
  jitter = 0.5;
  /**
   * Écart supplémentaire à l'axe (m) trouvé en tâtant le sol : la chaussée réelle est parfois plus large que la
   * largeur annoncée par le graphe (couloirs de bus, places, carrefours évasés).
   */
  extra = 0;
  /** Nombre de réflexions de suite passées sans trouver de trottoir de ce côté de la rue. */
  roadT = 0;
  /** Allure personnelle (part de la vitesse de marche). */
  pace = 0.85;
  // ── cible courante (angle, trottoir d'en face, chaise) ──
  tx = 0;
  tz = 0;
  /** Rue où l'on marchera une fois la cible atteinte. */
  nextEdge = -1;
  nextDir = 1;
  nextSide = 1;
  /** Traversée : nœud du passage et direction de la rue traversée. */
  crossNode = -1;
  crossDx = 0;
  crossDz = 1;
  /** Traversée hors passage (« traversée sauvage ») : créneau plus large exigé, renonce s'il ne vient pas. */
  jaywalk = false;
  // ── sirène ──
  /** Une sirène arrive : il reste en retrait du bord du trottoir jusqu'à cet instant (s). */
  sirenUntil = 0;
  /** Point de retrait (un pas en arrière du bord du trottoir) ; backing : il y va. */
  backing = false;
  backX = 0;
  backZ = 0;
  // ── temps ──
  thinkT = 0;
  tick = 0;
  timer = 0;
  waited = 0;
  /** Distance parcourue depuis la dernière envie de s'arrêter (m). */
  walked = 0;
  /** Prochain instant où il pourra de nouveau s'arrêter pour regarder (s). */
  calmUntil = 0;
  // ── regard ──
  faceX = 0;
  faceZ = 0;
  // ── peur ──
  fear = 0;
  dangerX = 0;
  dangerZ = 0;
  hasRefuge = false;
  refugeX = 0;
  refugeZ = 0;
  /** Distance à parcourir avant de se calmer ou de reprendre sa promenade (m). */
  fleeLeft = 0;
  /** Chaise occupée (0 si aucune). */
  chairId: EntityId = 0;
  seated = false;
  bornAt = 0;
  // ── piéton coincé ──
  lastX = 0;
  lastZ = 0;
  stuckN = 0;
  stuckTotal = 0;

  constructor(readonly p: Person) {}
}
