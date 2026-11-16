/* =====================================================================================
 * INCIDENTS — un incident et ses « membres » (les entités dont il rend compte).
 *
 * Un incident regroupe les doublons proches : trois bacs qui brûlent côte à côte sont UN feu de
 * poubelles à trois foyers, deux blessés tombés au même endroit sont UNE tâche « 2 blessés ». Chaque
 * membre porte la mesure de sa cause (intensité du foyer, état de la victime…) ; l'incident se clôt
 * de lui-même quand tous ses membres ont disparu.
 * ===================================================================================== */

import type { EntityId, EntityKind } from '@/core/contracts';
import type { Incident, IncidentKind, IncidentMeans, IncidentState } from '@/core/extensions';
import type { IncidentRecord, PlayerTaskRecord } from './api';

export interface Member {
  kind: EntityKind;
  /** 0 pour un lieu (feu au sol). */
  id: EntityId;
  x: number;
  z: number;
  /** Mesure courante de la cause 0..1 (intensité du foyer, état de la victime, activité du pillage…). */
  measure: number;
  peak: number;
  joinedAt: number;
  /** La cause a disparu pour ce membre (depuis goneAt). */
  gone: boolean;
  goneAt: number;
  /** Elle a disparu du fait d'une intervention (feu éteint, victime évacuée, barricade dégagée). */
  handled: boolean;
  /** Victime : rang de la blessure au dernier relevé, instant du dernier soin, évacuée, décédée. */
  injury: number;
  treatedAt: number;
  evacuated: boolean;
  dead: boolean;
  /** Usage propre à la famille : pillages constatés, numéro d'appel de secours, hostiles autour… */
  aux: number;
  /** Instant propre à la famille : dernier pillage, décès constaté… */
  auxAt: number;
  /** Plus grande valeur de `aux` relevée (éléments d'une barricade à son maximum). */
  auxPeak: number;
}

export function createMember(kind: EntityKind, id: EntityId, x: number, z: number, now: number): Member {
  return {
    kind, id, x, z, measure: 0, peak: 0, joinedAt: now, gone: false, goneAt: 0, handled: false,
    injury: 0, treatedAt: -1, evacuated: false, dead: false, aux: 0, auxAt: now, auxPeak: 0,
  };
}

export class Entry implements Incident {
  kind: IncidentKind;
  label = '';
  x: number;
  z: number;
  targetKind: EntityKind;
  targetId: EntityId;
  urgency: 1 | 2 | 3;
  severity = 0;
  state: IncidentState = 'ouvert';
  createdAt: number;
  means: IncidentMeans = '';
  squadId = 0;
  progress = 0;

  // ── internes (les autres modules ne voient que l'interface Incident) ──
  family: number;
  readonly members: Member[] = [];
  /** Libellé sans le lieu (« Feu de poubelles »), pour la radio. */
  labelBase = '';
  sector = '';
  /** Urgence plancher (nature de l'incident ou demande de celui qui l'a créé). */
  baseUrgency: 1 | 2 | 3;
  /** Créé par un autre module (open) et non par la détection. */
  external = false;
  /** Sans membre mesurable : pas de clôture automatique, la fin vient du moyen désigné ou de close(). */
  tracked = true;
  /** Aggravation dans le temps 0..1 (monte tant que rien n'est fait). */
  ramp = 0;
  measure = 0;
  peakMeasure = 0;
  /** Temps écoulé sans aucun traitement (s). */
  untreated = 0;
  /** Temps depuis lequel la cause a entièrement disparu (s). */
  goneFor = 0;
  /** Dernière preuve de traitement (arrosage, soin, portage, agents sur place). */
  touchedAt = -1;
  assignedAt = -1;
  startedAt = -1;
  closedAt = -1;
  /** Ordre donné à l'unité (type et horodatage) ; appel de secours lié. */
  orderType = '';
  orderAt = -1;
  callId = 0;
  /** L'unité a rendu compte de la fin de sa tâche à cet instant (−1 sinon). */
  doneAt = -1;
  /** Dernière urgence annoncée à la radio, instant de la dernière annonce. */
  announced = 0;
  announcedAt = -1;
  /** Gravité au dernier constat d'aggravation. */
  aggravatedFrom = 0;
  /** Reprise de feu sur une cible déjà éteinte. */
  reignition = false;
  /** Dernier pilleur ou suspect connu. */
  suspectId: EntityId = 0;
  thinkAt = 0;
  record: IncidentRecord;
  task: PlayerTaskRecord | null = null;

  constructor(
    readonly id: number, kind: IncidentKind, family: number, x: number, z: number, targetKind: EntityKind, targetId: EntityId,
    urgency: 1 | 2 | 3, now: number,
  ) {
    this.kind = kind;
    this.family = family;
    this.x = x;
    this.z = z;
    this.targetKind = targetKind;
    this.targetId = targetId;
    this.urgency = urgency;
    this.baseUrgency = urgency;
    this.createdAt = now;
    this.record = {
      id, kind, label: '', x, z, urgency, createdAt: now, assignedAt: -1, startedAt: -1, closedAt: -1, means: '', squadId: 0,
      severityStart: 0, severityPeak: 0, severityEnd: 0, aggravated: false, aggravations: 0, merged: 0, assignments: 0,
      outcome: 'en_cours', byPlayer: false, death: false,
    };
  }

  get active(): boolean {
    return this.state !== 'resolu' && this.state !== 'echoue';
  }

  /** Nombre de membres dont la cause est encore présente. */
  presentCount(): number {
    let n = 0;
    const members = this.members;
    for (let i = 0; i < members.length; i++) if (!members[i].gone) n++;
    return n;
  }

  member(id: EntityId): Member | null {
    const members = this.members;
    for (let i = 0; i < members.length; i++) if (members[i].id === id) return members[i];
    return null;
  }
}

/** Rang d'une blessure (0 aucune … 4 décès). */
export function injuryRank(injury: string): number {
  switch (injury) {
    case 'light': return 1;
    case 'serious': return 2;
    case 'critical': return 3;
    case 'dead': return 4;
    default: return 0;
  }
}
