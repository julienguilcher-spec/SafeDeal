/* =====================================================================================
 * INCIDENTS — suivi d'un incident affecté, et liaison avec les appels de secours.
 *
 * Le suivi s'appuie sur ce qui se passe réellement : agents sur place, feu arrosé, victime portée ou
 * soignée, compte rendu de fin de tâche du module de police, état de l'appel de secours, joueur arrivé.
 * Une tâche dite terminée alors que la cause persiste, un moyen qui n'arrive jamais ou une unité sans
 * personne remettent l'incident à « ouvert ».
 * ===================================================================================== */

import type { Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentMeans, RescueApi, RescueCall } from '@/core/extensions';
import { INCIDENT_UPDATED_EVENT } from './api';
import type { Assigner } from './assign';
import type { Entry } from './entry';
import type { Kernel } from './kernel';
import type { Sense } from './sense';
import {
  FAM_BARRICADE, FAM_FIRE, FAM_OFFICER, FAM_RESCUE, FAM_VICTIM, ON_SITE_RANGE, PLAYER_ON_SITE, RESCUE_WAIT_BEFORE_INCIDENT,
} from './tuning';

/** L'unité a dit avoir fini mais la cause persiste depuis ce temps (s) : l'incident est rouvert. */
const DONE_GRACE = 8;
/** Incident abstrait confié au joueur : traité après ce temps passé sur place (s). */
const ABSTRACT_ON_SITE = 8;

function isUnitMeans(m: IncidentMeans): boolean {
  return m === 'unite' || m === 'canon_eau' || m === 'centaure' || m === 'bravm';
}

export class Tracker {
  private pollAt = 0;
  /** Appels de secours à l'arrêt : numéro → instant du début de l'attente. */
  private readonly waiting = new Map<number, number>();

  constructor(private readonly k: Kernel, private readonly sense: Sense, private readonly assigner: Assigner) {}

  reset(): void {
    this.pollAt = 0;
    this.waiting.clear();
  }

  callById(id: number): RescueCall | null {
    if (id === 0) return null;
    const rescue = this.k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return null;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) if (calls[i].id === id) return calls[i];
    return null;
  }

  /** L'unité (ou l'une de ses subordonnées : une section n'a de membres que dans ses groupes) a-t-elle encore du monde ? */
  private manned(squad: Squad, depth: number): boolean {
    if (squad.members.length > 0) return true;
    if (depth >= 3) return false;
    const list = this.k.ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      if (list[i].parentId === squad.id && this.manned(list[i], depth + 1)) return true;
    }
    return false;
  }

  /** Suivi d'un incident affecté : arrivée sur place, avancement, fin de tâche, moyen perdu. */
  track(e: Entry, dt: number, _treating: boolean): void {
    if (e.state === 'ouvert' || !e.active) return;
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    let onSite = false;
    if (e.means === 'joueur') {
      const p = ctx.player.person();
      if (!p) {
        this.assigner.reopen(e);
        return;
      }
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      onSite = d <= PLAYER_ON_SITE;
      this.assigner.desk.track(e, d);
      if (!e.tracked && onSite) {
        e.goneFor += dt;
        if (e.goneFor >= ABSTRACT_ON_SITE) {
          k.close(e, true, p.id, 'traite');
          return;
        }
      }
    } else if (e.means === 'pompiers' || e.means === 'samu') {
      const c = this.callById(e.callId);
      if (!c || c.state === 'annule') {
        this.assigner.reopen(e);
        return;
      }
      if (c.state === 'reparti') {
        // les secours sont repartis : traité si l'incident était abstrait, sinon la cause persiste
        if (!e.tracked && e.record.startedAt >= 0) k.close(e, true, 0, 'traite');
        else this.assigner.reopen(e);
        return;
      }
      onSite = c.state === 'sur_place';
      const sq = this.assigner.squadOfCall(c.id);
      if (sq !== 0 && sq !== e.squadId) {
        e.squadId = sq;
        e.record.squadId = sq;
      }
    } else {
      const s = ctx.squads.get(e.squadId);
      if (!s || !this.manned(s, 0)) {
        this.assigner.reopen(e);
        return;
      }
      onSite = this.sense.police(e.x, e.z, ON_SITE_RANGE) > 0;
      if (e.doneAt >= 0) {
        if (!e.tracked) {
          k.close(e, true, s.leaderId, 'traite');
          return;
        }
        if (now - e.doneAt > DONE_GRACE) {
          this.assigner.reopen(e); // tâche dite terminée, cause toujours là
          return;
        }
      }
    }
    if (e.state === 'assigne') {
      if (onSite) {
        e.state = 'en_cours';
        e.startedAt = now;
        if (e.record.startedAt < 0) e.record.startedAt = now;
        k.emit(INCIDENT_UPDATED_EVENT, e, 'en_cours');
      } else if (isUnitMeans(e.means) && now - e.assignedAt > k.tuning.assignTimeout) {
        this.assigner.reopen(e); // le moyen désigné n'est jamais arrivé
        return;
      }
    }
    if (e.state === 'en_cours') {
      if (onSite) e.touchedAt = now;
      let p = 0;
      const members = e.members;
      switch (e.family) {
        case FAM_FIRE:
          p = e.peakMeasure > 0 ? 1 - e.measure / e.peakMeasure : 0;
          break;
        case FAM_VICTIM:
        case FAM_OFFICER: {
          let done = 0;
          for (let i = 0; i < members.length; i++) {
            const m = members[i];
            if (m.gone) done += 1;
            else if (m.treatedAt >= 0) done += 0.5;
            else {
              const v = ctx.people.get(m.id);
              if (v && v.heldBy !== 0) done += 0.5;
            }
          }
          p = members.length > 0 ? done / members.length : 0;
          break;
        }
        case FAM_BARRICADE: {
          const m = members.length > 0 ? members[0] : null;
          p = m && m.auxPeak > 0 ? 1 - m.aux / m.auxPeak : 0;
          break;
        }
        default: {
          const t = (now - e.startedAt) / 30;
          p = t > 0.9 ? 0.9 : t;
          break;
        }
      }
      if (p > 0.98) p = 0.98; // 1 = clos
      if (p > e.progress) e.progress = p;
    }
  }

  // ───────────────────────────── secours : liaison et blocage ─────────────────────────────

  /**
   * Une fois par seconde : rattache aux incidents les appels de secours passés par d'autres (unité qui
   * demande le SAMU après une extraction, secouriste de rue), et ouvre un incident « secours bloqués »
   * pour tout équipage arrêté à distance.
   */
  pollRescue(): void {
    const k = this.k;
    const now = k.now;
    if (now < this.pollAt) return;
    this.pollAt = now + 1;
    const rescue = k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      const live = c.state !== 'reparti' && c.state !== 'annule';
      if (live && c.incidentId !== 0) {
        const e = k.byId.get(c.incidentId);
        if (e && e.active && e.callId !== c.id && e.means !== 'joueur' && e.family !== FAM_RESCUE) {
          // l'unité qui a extrait la victime garde le mérite ; la suite appartient aux secours
          e.callId = c.id;
          e.orderType = '';
          e.orderAt = -1;
          e.doneAt = -1;
          this.assigner.setAssigned(e, c.kind, this.assigner.squadOfCall(c.id));
        }
      }
      if (c.state !== 'en_attente') {
        this.waiting.delete(c.id);
        continue;
      }
      let since = this.waiting.get(c.id);
      if (since === undefined) {
        since = now;
        this.waiting.set(c.id, since);
      }
      if (now - since < RESCUE_WAIT_BEFORE_INCIDENT || !k.tuning.detection) continue;
      let known = false;
      const entries = k.entries;
      for (let j = 0; j < entries.length && !known; j++) {
        const e = entries[j];
        if (e.active && e.family === FAM_RESCUE && e.members.length > 0 && e.members[0].aux === c.id) known = true;
      }
      if (known) continue;
      const v = c.vehicleId !== 0 ? k.ctx.vehicles.get(c.vehicleId) : undefined;
      const x = v ? v.x : c.x;
      const z = v ? v.z : c.z;
      const e = k.open('secours_bloques', x, z, v ? 'vehicle' : 'place', v ? v.id : 0, 0, false);
      if (e.members.length === 0) {
        k.addMember(e, 'place', 0, x, z);
        e.tracked = true;
      }
      e.members[0].aux = c.id;
    }
  }
}
