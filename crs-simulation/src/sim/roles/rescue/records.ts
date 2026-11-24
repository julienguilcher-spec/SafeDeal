/* =====================================================================================
 * SECOURS — journal des interventions (service « rescue.records »).
 * ===================================================================================== */

import type { RescueRecord, RescueRecords } from './api';

function mmss(t: number): string {
  const s = Math.max(0, Math.round(t));
  const r = s % 60;
  return `${Math.floor(s / 60)} min ${r < 10 ? '0' : ''}${r}`;
}

export class RecordsStore implements RescueRecords {
  readonly all: RescueRecord[] = [];
  private readonly byId = new Map<number, RescueRecord>();

  add(r: RescueRecord): void {
    this.all.push(r);
    this.byId.set(r.callId, r);
  }

  clear(): void {
    this.all.length = 0;
    this.byId.clear();
  }

  of(callId: number): RescueRecord | undefined {
    return this.byId.get(callId);
  }

  meanArrival(): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < this.all.length; i++) {
      const r = this.all[i];
      if (r.arrivedAt < 0) continue;
      sum += r.arrivedAt - r.requestedAt;
      n++;
    }
    return n > 0 ? sum / n : 0;
  }

  playerPoints(): number {
    let sum = 0;
    for (let i = 0; i < this.all.length; i++) if (this.all[i].playerLed) sum += this.all[i].points;
    return sum;
  }

  summary(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.all.length; i++) {
      const r = this.all[i];
      const who = r.kind === 'pompiers' ? 'Sapeurs-pompiers' : 'SAMU';
      let line = `${who}${r.playerLed ? ' (votre équipage)' : ''} : `;
      if (r.cancelled) line += 'appel annulé';
      else if (r.arrivedAt < 0) line += 'pas encore sur place';
      else {
        line += `sur place ${mmss(r.arrivedAt - r.requestedAt)} après l’appel`;
        if (r.waited >= 5) line += `, dont ${mmss(r.waited)} d’attente (${r.waitReason})`;
        const done: string[] = [];
        if (r.firesOut > 0) done.push(`${r.firesOut} foyer${r.firesOut > 1 ? 's' : ''} éteint${r.firesOut > 1 ? 's' : ''}`);
        if (r.victimsTreated > 0) done.push(`${r.victimsTreated} victime${r.victimsTreated > 1 ? 's' : ''} soignée${r.victimsTreated > 1 ? 's' : ''}`);
        if (r.victimsEvacuated > 0) done.push(`${r.victimsEvacuated} évacuée${r.victimsEvacuated > 1 ? 's' : ''}`);
        if (done.length > 0) line += ` — ${done.join(', ')}`;
      }
      if (r.crewHurt > 0) line += ` — ${r.crewHurt} secouriste${r.crewHurt > 1 ? 's' : ''} blessé${r.crewHurt > 1 ? 's' : ''}`;
      if (r.retreats > 0) line += ' — repli sous les projectiles';
      out.push(line + '.');
    }
    return out;
  }
}
