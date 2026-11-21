/* =====================================================================================
 * INCIDENTS — journal pour l'évaluation (service « incidents.records »).
 *
 * Une fiche par incident : apparition, première affectation, début du traitement, clôture, gravité
 * au départ, au pire et à la fin, aggravations, issue. Le module de carrière / le compte rendu de
 * fin de mission lisent stats() et summary().
 * ===================================================================================== */

import type { IncidentRecord, IncidentStats, IncidentsRecords, PlayerTaskRecord } from './api';
import { durationLabel } from './labels';

export class RecordsStore implements IncidentsRecords {
  readonly all: IncidentRecord[] = [];
  readonly playerTasks: PlayerTaskRecord[] = [];
  private readonly byId = new Map<number, IncidentRecord>();
  private readonly statsOut: IncidentStats = {
    total: 0, open: 0, treated: 0, lapsed: 0, failed: 0, aggravated: 0, neverAssigned: 0, meanAssignDelay: 0,
    meanTreatmentDelay: 0, meanResolution: 0, deaths: 0, score: 100,
  };

  add(record: IncidentRecord): void {
    this.all.push(record);
    this.byId.set(record.id, record);
  }

  of(id: number): IncidentRecord | undefined {
    return this.byId.get(id);
  }

  clear(): void {
    this.all.length = 0;
    this.playerTasks.length = 0;
    this.byId.clear();
  }

  stats(): Readonly<IncidentStats> {
    const s = this.statsOut;
    const all = this.all;
    s.total = all.length;
    s.open = s.treated = s.lapsed = s.failed = s.aggravated = s.neverAssigned = s.deaths = 0;
    let assignSum = 0;
    let assignN = 0;
    let startSum = 0;
    let startN = 0;
    let resSum = 0;
    let penalty = 0;
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      if (r.outcome === 'en_cours') s.open++;
      else if (r.outcome === 'traite') s.treated++;
      else if (r.outcome === 'cause_disparue') s.lapsed++;
      else s.failed++;
      if (r.aggravated) s.aggravated++;
      if (r.death) s.deaths++;
      if (r.assignedAt < 0) s.neverAssigned++;
      else {
        assignSum += r.assignedAt - r.createdAt;
        assignN++;
      }
      if (r.startedAt >= 0) {
        startSum += r.startedAt - r.createdAt;
        startN++;
      }
      if (r.outcome === 'traite' && r.closedAt >= 0) resSum += r.closedAt - r.createdAt;
      // barème : un incident pèse d'autant plus qu'il était urgent
      const w = r.urgency;
      if (r.death) penalty += 10 * w;
      else if (r.outcome === 'echec') penalty += 5 * w;
      else if (r.outcome === 'cause_disparue' && r.assignedAt < 0 && r.severityPeak >= 0.3) penalty += 2.5 * w;
      if (r.aggravated) penalty += 2 * w;
      if (r.assignedAt >= 0) {
        // délai de prise en charge : 30 s de tolérance, puis 1 point par tranche de 20 s (borné)
        const late = r.assignedAt - r.createdAt - 30;
        if (late > 0) penalty += Math.min(4, late / 20) * (w / 2);
      }
    }
    s.meanAssignDelay = assignN > 0 ? assignSum / assignN : 0;
    s.meanTreatmentDelay = startN > 0 ? startSum / startN : 0;
    s.meanResolution = s.treated > 0 ? resSum / s.treated : 0;
    const score = 100 - penalty;
    s.score = score < 0 ? 0 : score > 100 ? 100 : Math.round(score);
    return s;
  }

  summary(): string[] {
    const out: string[] = [];
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      const notable = r.death || r.aggravated || r.outcome === 'echec' || r.urgency >= 2 || r.byPlayer;
      if (!notable) continue;
      let line = `${clock(r.createdAt)} — ${r.label} : `;
      if (r.outcome === 'en_cours') line += 'non clos à la fin de la mission';
      else if (r.outcome === 'traite') line += `traité en ${durationLabel(r.closedAt - r.createdAt)}`;
      else if (r.outcome === 'cause_disparue') line += r.assignedAt < 0 ? 'laissé sans traitement, la cause a disparu d’elle-même' : 'clos avant l’arrivée du moyen désigné';
      else line += 'échec';
      if (r.assignedAt >= 0) line += ` (pris en charge après ${durationLabel(r.assignedAt - r.createdAt)})`;
      else if (r.outcome !== 'en_cours') line += ' (aucun moyen désigné)';
      if (r.death) line += ' — une victime est décédée';
      else if (r.aggravated) line += ' — s’est aggravé faute de traitement';
      out.push(line + '.');
    }
    const s = this.stats();
    out.push(
      `Incidents : ${s.total} signalés, ${s.treated} traités, ${s.lapsed} clos sans traitement, ${s.failed} échecs, `
      + `${s.aggravated} aggravés${s.open > 0 ? `, ${s.open} encore ouverts` : ''}.`,
    );
    if (s.treated + s.failed + s.lapsed > 0) {
      out.push(
        `Délai moyen de prise en charge : ${durationLabel(s.meanAssignDelay)} ; début du traitement : `
        + `${durationLabel(s.meanTreatmentDelay)} ; note de gestion des incidents : ${s.score}/100.`,
      );
    }
    return out;
  }
}

/** Temps de session en « mm:ss ». */
function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}
