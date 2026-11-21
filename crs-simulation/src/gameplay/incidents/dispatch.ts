/* =====================================================================================
 * INCIDENTS — le joueur exécutant : attribution des tâches par radio, suivi et notation.
 *
 * Quand le joueur commande (commandant, commissaire, chef de groupe), il délègue lui-même : rien
 * n'est attribué d'office. Quand son rôle est exécutant, la salle lui confie les incidents qui
 * relèvent de son moyen et que personne n'a pris :
 *   CRS porteur d'un extincteur     petits feux à portée de marche ;
 *   opérateur du canon à eau        tous les feux ;
 *   équipage du Centaure            barricades, secours bloqués ;
 *   BRAV-M                          pillages, suspects, agent isolé ;
 *   pompier / SAMU ('secouriste')   feux / blessés : l'appel passe par le service des secours, qui engage
 *                                   l'équipage du joueur (à défaut de ce service, la tâche lui est confiée directement) ;
 *   médecin de rue                  blessés (seulement si le module des médecins n'est pas branché : il a son propre triage).
 * Chaque tâche est notée à la fin : délai d'arrivée rapporté à la distance, durée du traitement,
 * aggravation subie, réussite.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi } from '@/core/extensions';
import type { PlayerTaskRecord } from './api';
import type { Assigner } from './assign';
import type { Entry } from './entry';
import type { Kernel } from './kernel';
import { durationLabel } from './labels';
import { FAM_BARRICADE, FAM_FIRE, FAM_OFFICER, FAM_VICTIM } from './tuning';

/** Allure prise pour le délai d'arrivée attendu : à pied (course soutenue) et en véhicule en ville (m/s). */
const PACE_FOOT = 3;
const PACE_VEHICLE = 8;
/** Temps de mise en route toléré (s). */
const START_SLACK = 12;

/** Durée de traitement attendue une fois sur place, par famille (s). */
function expectedWork(e: Entry): number {
  if (e.family === FAM_FIRE) return e.kind === 'feu_poubelle' ? 35 : e.kind === 'feu_barricade' ? 60 : 90;
  if (e.family === FAM_VICTIM || e.family === FAM_OFFICER) return 75;
  if (e.family === FAM_BARRICADE) return 45;
  return 60;
}

export class PlayerDesk {
  private nextAt = 0;

  constructor(private readonly k: Kernel, private readonly assigner: Assigner) {
    k.onPlayerTaskEnd = (e, resolved) => this.end(e, resolved, false);
  }

  reset(): void {
    this.nextAt = 0;
  }

  // ───────────────────────────── tâche du joueur ─────────────────────────────

  begin(e: Entry, p: Person, byRadio: boolean): void {
    const k = this.k;
    const ctx = k.ctx;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    const riding = p.vehicleId !== 0 || d > 150;
    const task: PlayerTaskRecord = {
      incidentId: e.id, kind: e.kind, label: e.label, assignedAt: k.now, arrivedAt: -1, endedAt: -1, distance: d,
      expectedArrival: START_SLACK + d / (riding ? PACE_VEHICLE : PACE_FOOT), success: null, severityAtStart: e.severity,
      severityAtEnd: e.severity, note: 0, comment: '',
    };
    e.task = task;
    k.records.playerTasks.push(task);
    if (byRadio) {
      const callsign = this.callsign(p);
      ctx.radio.say({
        channel: 'unite', from: 'CENTRAL', priority: e.urgency >= 2 ? 2 : 1,
        text: `${callsign} ICI CENTRAL. ${e.urgency >= 3 ? 'URGENT. ' : ''}${e.label}. Vous en êtes chargé, rendez compte. PARLEZ.`,
      });
      ctx.ui.notify(`Incident confié : ${e.label} (${Math.round(d)} m)`, e.urgency >= 3 ? 'alert' : 'warn', 6);
    } else {
      ctx.ui.notify(`Vous prenez l’incident : ${e.label}`, 'info', 4);
    }
  }

  private callsign(p: Person): string {
    const ctx = this.k.ctx;
    const book = ctx.service<{ callsign(who: Person): string }>('radio.callsigns');
    if (book) {
      const c = book.callsign(p);
      if (c) return c.toUpperCase();
    }
    const s = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    return (s ? s.name : p.name).toUpperCase();
  }

  /** Suivi : première arrivée sur place. */
  track(e: Entry, distance: number): void {
    const task = e.task;
    if (!task || task.endedAt >= 0) return;
    if (task.arrivedAt < 0 && distance <= 12) task.arrivedAt = this.k.now;
    task.severityAtEnd = e.severity;
  }

  /** Fin de la tâche : notation et message au joueur. `abandoned` : retirée avant la fin. */
  end(e: Entry, resolved: boolean, abandoned: boolean): void {
    const task = e.task;
    if (!task || task.endedAt >= 0) return;
    const k = this.k;
    const now = k.now;
    task.endedAt = now;
    task.success = resolved && !abandoned;
    task.severityAtEnd = e.severity;
    e.task = null;
    if (abandoned) {
      task.note = task.arrivedAt >= 0 ? 15 : 0;
      task.comment = 'Tâche abandonnée avant la fin.';
      return;
    }
    if (!resolved) {
      task.note = task.arrivedAt >= 0 ? 25 : 5;
      task.comment = e.record.death ? 'Échec : la victime n’a pas pu être sauvée.' : 'Échec : l’incident n’a pas été traité.';
      k.ctx.ui.notify(`${e.label} — ${task.comment}`, 'alert', 6);
      return;
    }
    let note = 100;
    const parts: string[] = [];
    const arrival = (task.arrivedAt >= 0 ? task.arrivedAt : now) - task.assignedAt;
    const late = arrival - task.expectedArrival;
    if (late > 0) {
      note -= Math.min(30, late * 0.5);
      parts.push(`arrivée en ${durationLabel(arrival)} (attendu ${durationLabel(task.expectedArrival)})`);
    } else {
      parts.push(`arrivée rapide (${durationLabel(arrival)})`);
    }
    const work = now - (task.arrivedAt >= 0 ? task.arrivedAt : task.assignedAt);
    const over = work - expectedWork(e);
    if (over > 0) note -= Math.min(25, over * 0.25);
    parts.push(`traitement en ${durationLabel(work)}`);
    if (e.record.severityPeak - task.severityAtStart >= 0.25) {
      note -= 15;
      parts.push('l’incident s’est aggravé entre-temps');
    }
    task.note = Math.round(note < 30 ? 30 : note);
    task.comment = `${e.labelBase} : traité — ${parts.join(', ')}.`;
    k.ctx.ui.notify(`${e.label} — tâche réussie, note ${task.note}/100`, 'ok', 6);
  }

  // ───────────────────────────── attribution d'office ─────────────────────────────

  /** L'incident relève-t-il du moyen que le joueur met en œuvre ? Retourne la portée (m), 0 sinon. */
  private suits(e: Entry, p: Person): number {
    const k = this.k;
    const ctx = k.ctx;
    const t = k.tuning;
    const role = ctx.player.state.role;
    const fire = e.family === FAM_FIRE;
    const victim = e.family === FAM_VICTIM || e.family === FAM_OFFICER;
    switch (role) {
      case 'crs': {
        if (!fire || e.kind === 'feu_vehicule' || e.kind === 'feu_boutique') return 0;
        const inv = p.inventory;
        for (let i = 0; i < inv.length; i++) if (inv[i].id === 'extincteur' && inv[i].count > 0) return t.dispatchRangeFoot;
        return 0;
      }
      case 'operateur_canon_eau': return fire ? t.dispatchRangeVehicle : 0;
      case 'gendarme_centaure': return e.kind === 'barricade' || e.kind === 'secours_bloques' ? t.dispatchRangeVehicle : 0;
      case 'bravm': return e.kind === 'pillage' || e.kind === 'suspect' || e.kind === 'agent_isole' ? t.dispatchRangeVehicle : 0;
      case 'secouriste':
        if (p.kind === 'samu') return victim ? t.dispatchRangeVehicle : 0;
        return fire ? t.dispatchRangeVehicle : 0;
      case 'street_medic':
        return victim && !ctx.service('medics.records') ? t.dispatchRangeFoot : 0;
      default:
        return 0;
    }
  }

  update(): void {
    const k = this.k;
    const now = k.now;
    if (now < this.nextAt) return;
    this.nextAt = now + 1;
    if (!k.tuning.autoDispatch || k.playerIncidentId !== 0) return;
    const ctx = k.ctx;
    const p = ctx.player.person();
    if (!p || ctx.health.isIncapacitated(p)) return;
    const entries = k.entries;
    let best: Entry | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.state !== 'ouvert') continue;
      const age = now - e.createdAt;
      if (age < (e.urgency >= 3 ? 2 : k.tuning.dispatchDelay)) continue;
      const range = this.suits(e, p);
      if (range <= 0) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d > range) continue;
      const score = e.urgency * 100 + e.severity * 50 - d * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return;
    if (ctx.player.state.role === 'secouriste') {
      // l'appel passe par les secours : c'est leur régulation qui engage l'équipage du joueur
      const rescue = ctx.service<RescueApi>(EXT.rescue);
      if (rescue) {
        this.assigner.assign(best.id, p.kind === 'samu' ? 'samu' : 'pompiers', 0);
        return;
      }
    }
    this.assigner.assignPlayer(best, true);
  }
}
