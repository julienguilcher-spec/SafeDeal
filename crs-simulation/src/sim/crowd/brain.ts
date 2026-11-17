/* =====================================================================================
 * FOULE — mémoire privée d'une personne pilotée par le module (Person.brain) et états de sa machine.
 * Les champs sont plats et numériques : la boucle de pilotage les lit à chaque pas, sans allocation.
 * ===================================================================================== */

import type { EntityId, Person, ProtestProfile } from '@/core/contracts';
import type { BehaviorController } from './api';

/** États de la machine individuelle. */
export const S = {
  /** Arrive (bouche de métro, rue) et rejoint sa place. */
  ARRIVE: 0,
  /** Rassemblé : écoute, discute, scande à sa place. */
  GATHER: 1,
  /** Marche à son emplacement du cortège. */
  MARCH: 2,
  /** Sort d'un nuage de gaz ou d'une zone comprimée. */
  AVOID: 3,
  /** Fuit devant une charge, une détonation. */
  FLEE: 4,
  /** Reprend son souffle puis rejoint les siens. */
  REGROUP: 5,
  /** Tient ses distances face aux forces, à reculons. */
  HOLD: 6,
  /** Fait cercle autour d'un blessé, hue ou filme une interpellation. */
  WATCH: 7,
  /** Quitte la manifestation (bouche de métro ou rue). */
  LEAVE: 8,
  /** Assis sur la chaussée. */
  SIT: 9,
  /** Pris dans une nasse : cherche l'issue. */
  STRANDED: 10,
  /** Badaud en lisière. */
  BYSTAND: 11,
  /** Reste sur place après la fin (grappes de l'après-manif). */
  LINGER: 12,
  /** Piloté par un contrôleur de comportement enregistré (groupes radicaux…). */
  CUSTOM: 13,
} as const;

export const STATE_NAMES: readonly string[] = [
  'arrive', 'rassemble', 'marche', 'evite', 'fuit', 'se_regroupe', 'tient_distance', 'regarde', 'part', 'assis',
  'nasse', 'badaud', 'reste', 'controleur',
];

/** Gestes d'ambiance. */
export const A = { NONE: 0, CHANT: 1, CLAP: 2, FILM: 3, SIGN: 4, TALK: 5, BOO: 6, COUGH: 7, COVER: 8, CALL: 9, WAVE: 10 } as const;

/** Drapeaux. */
export const F = {
  BYSTANDER: 1,
  /** Créé par un autre module et adopté. */
  ADOPTED: 2,
  BANNER: 4,
  GUIDE: 8,
  CHILD: 16,
  /** Entré par la suite (renfort, aléa) : sans place attitrée dans le cortège d'origine. */
  LATE: 32,
  /** A décidé de partir : ne revient pas. */
  LEAVING: 64,
  /** Ne compte pas dans les statistiques de la manifestation (contre-cortège, badaud). */
  UNCOUNTED: 128,
  /** Retenu sur place par un aléa (sit-in). */
  PINNED: 256,
  /** S'est assis de lui-même pour souffler. */
  RESTING: 512,
  /** Membre d'un foyer secondaire (foyers.ts) : hors cortège, attaché à son point (anchorX, anchorZ). */
  FOYER: 1024,
} as const;

export interface CrowdBrain {
  readonly kind: 'crowd';
  readonly person: Person;
  /** Index dans core.members (tenu à jour au retrait). */
  index: number;
  state: number;
  stateSince: number;
  nextThink: number;
  lastThink: number;
  /** Emplacement dans la formation (−1 : aucun). */
  slot: number;
  /** Groupe d'affinité (index dans core.groups, −1 : seul). */
  group: number;
  flags: number;

  // ── déplacement voulu ──
  tx: number;
  tz: number;
  speed: number;
  run: boolean;
  /** Point regardé à l'arrêt (NaN : droit devant). */
  lookX: number;
  lookZ: number;
  /** Itinéraire suivi (partagé, jamais modifié) et prochain sommet. */
  path: number[] | null;
  pathI: number;
  pathPending: boolean;
  /** Décalage latéral personnel le long d'un itinéraire (m). */
  sway: number;
  /** Issue visée au départ (index dans nav.exits, −1 : aucune). */
  exit: number;

  // ── caractère (fixé à la création) ──
  /** 0..1 : plus c'est bas, plus on part tôt quand on le demande. */
  docility: number;
  courage: number;
  pace: number;
  /** Phase personnelle (rad) pour désynchroniser les gestes. */
  phase: number;

  // ── mémoire ──
  fatigue: number;
  /** Dernière étape de sommation entendue. */
  heard: number;
  /** Instant de départ décidé (Infinity : aucun). */
  leaveAt: number;
  /** Dernier danger connu : point, instant d'oubli, distance à prendre. */
  threatX: number;
  threatZ: number;
  threatUntil: number;
  threatDist: number;
  /** Fuite en cours : fin au plus tard. */
  fleeUntil: number;
  watchId: EntityId;
  watchX: number;
  watchZ: number;
  watchUntil: number;
  act: number;
  actUntil: number;
  /** Détection de blocage. */
  stuckX: number;
  stuckZ: number;
  stuckSince: number;
  /** Radicalisation : profil d'origine, prochain tirage, instant du dernier changement. */
  origin: ProtestProfile | null;
  nextRad: number;
  radAt: number;
  calmSince: number;
  /** Densité équivalente relevée à sa position (personnes/m²). */
  density: number;
  gasSince: number;
  /** Contrôleur de comportement qui a pris la main à la dernière réflexion. */
  controller: BehaviorController | null;
  /** Données libres du contrôleur. */
  data: unknown;
  /** Direction retenue pour sortir d'un nuage (rad), mémoire d'un tour à l'autre. */
  dir: number;
  /** Point d'attache quand on reste sur place (après-manif, badaud). */
  anchorX: number;
  anchorZ: number;
  /** Échecs de progression consécutifs. */
  stuck: number;
  /** Faits déjà traités (instants) : dernière charge, dernière interpellation regardée. */
  seenCharge: number;
  seenArrest: number;
  /** Dernier instant où la personne se trouvait dans une nasse (−1e9 : jamais) : la lisière de la nasse, jusqu'à la
   * ligne qui l'encercle, en fait encore partie pour elle. */
  kettledAt: number;
  /** Objet tenu en main avant un geste (filmer), pour le reprendre ensuite (−2 : rien à reprendre). */
  hand: number;
  /** Minuterie libre de l'état courant (prochain petit déplacement, fin d'un repos). */
  timer: number;
  /** Fin de la réaction à une interpellation (huer, filmer). */
  gawkUntil: number;
  /** Flanc choisi pour contourner le cortège en rejoignant sa place (±1, 0 : pas encore choisi). */
  side: number;
  /** Abscisse où l'on attend son rang au bord du parcours (NaN : on n'attend pas). */
  waitS: number;
  /** Mouvement de foule : jusqu'à cet instant, on suit ceux qui fuient autour de soi (−1 : non). */
  panic: number;
}

export function isCrowdBrain(v: unknown): v is CrowdBrain {
  return typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'crowd';
}

export function brainOf(p: Person): CrowdBrain | null {
  const b = p.brain;
  return isCrowdBrain(b) ? b : null;
}

export function createBrain(p: Person, index: number, now: number, r1: number, r2: number, r3: number, r4: number): CrowdBrain {
  return {
    kind: 'crowd', person: p, index, state: S.GATHER, stateSince: now, nextThink: now + r1 * 0.5, lastThink: now,
    slot: -1, group: -1, flags: 0,
    tx: p.x, tz: p.z, speed: 0, run: false, lookX: NaN, lookZ: NaN, path: null, pathI: 0, pathPending: false,
    sway: (r2 - 0.5) * 2.4, exit: -1,
    docility: r3, courage: r4, pace: 0.92 + r2 * 0.16, phase: r1 * 6.283,
    fatigue: 0, heard: 0, leaveAt: Infinity, threatX: 0, threatZ: 0, threatUntil: -1, threatDist: 0, fleeUntil: -1,
    watchId: 0, watchX: 0, watchZ: 0, watchUntil: -1, act: A.NONE, actUntil: 0,
    stuckX: p.x, stuckZ: p.z, stuckSince: now, origin: p.profile, nextRad: now + 4 + r3 * 10, radAt: -1e9,
    calmSince: now, density: 0, gasSince: -1, controller: null, data: null,
    dir: NaN, anchorX: p.x, anchorZ: p.z, stuck: 0, seenCharge: -1, seenArrest: -1, kettledAt: -1e9, hand: -2, timer: 0, gawkUntil: -1, side: 0, waitS: NaN, panic: -1,
  };
}
