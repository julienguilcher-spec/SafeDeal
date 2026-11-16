/* =====================================================================================
 * INCIDENTS — noyau : registre des incidents, création avec regroupement des doublons, clôture.
 *
 * Deux déclarations se rapportent au même incident si elles visent la même entité, ou si elles sont
 * de la même famille (feux, victimes, barricades, pillages) et assez proches. Le regroupement garde
 * la nature la plus grave (un bac en feu contre une voiture en feu devient « véhicule en feu ») et
 * ajoute un membre : l'incident ne se clôt que lorsque tous ses membres ont disparu.
 * ===================================================================================== */

import type { EntityId, EntityKind, GameContext } from '@/core/contracts';
import type { IncidentKind } from '@/core/extensions';
import { INCIDENT_CLOSED_EVENT, INCIDENT_OPENED_EVENT, INCIDENT_UPDATED_EVENT } from './api';
import type { IncidentChange, IncidentEvent, IncidentOutcome, IncidentsTuning } from './api';
import { Entry, createMember } from './entry';
import type { Member } from './entry';
import { relabel } from './labels';
import { RadioDesk } from './radio';
import { RecordsStore } from './records';
import {
  BASE_URGENCY, DEFAULT_TUNING, FAMILY_OF, FAM_BARRICADE, FAM_FIRE, FAM_LOOTING, FAM_OFFICER, FAM_VICTIM, FIRE_RANK,
  REIGNITION_WINDOW,
} from './tuning';

/** Rayon dans lequel une nappe de feu au sol se confond avec l'objet qui brûle (m). */
const PLACE_COVER = 3.5;

/** Clé de regroupement d'une entité dans une famille (les identifiants d'entité sont uniques toutes catégories confondues). */
function targetKey(family: number, id: EntityId): number {
  return id * 16 + family;
}

export class Kernel {
  ctx!: GameContext;
  readonly tuning: IncidentsTuning = { ...DEFAULT_TUNING };
  /** Incidents actifs et récemment clos (c'est la liste publiée). */
  readonly entries: Entry[] = [];
  readonly byId = new Map<number, Entry>();
  /** Incident actif d'une entité, par famille. */
  private readonly byTarget = new Map<number, Entry>();
  readonly records = new RecordsStore();
  radio!: RadioDesk;
  playerIncidentId = 0;
  private nextId = 1;
  /** Dernière extinction constatée par cible (reprises de feu). */
  private readonly lastFireOut = new Map<EntityId, number>();
  private readonly event: IncidentEvent = { id: 0, kind: 'suspect', change: 'ouvert', resolved: false, byId: 0 };
  /** Appelé quand une affectation doit être défaite à la clôture (ordre en cours, appel de secours). */
  onRelease: ((e: Entry, resolved: boolean) => void) | null = null;
  /** Appelé à la fin d'une tâche confiée au joueur. */
  onPlayerTaskEnd: ((e: Entry, resolved: boolean) => void) | null = null;

  /** Temps de session courant (s). */
  get now(): number {
    return this.ctx.clock.now;
  }

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.radio = new RadioDesk(ctx);
  }

  reset(): void {
    this.entries.length = 0;
    this.byId.clear();
    this.byTarget.clear();
    this.lastFireOut.clear();
    this.records.clear();
    this.playerIncidentId = 0;
    this.nextId = 1;
    Object.assign(this.tuning, DEFAULT_TUNING);
    this.radio.reset();
  }

  emit(name: string, e: Entry, change: IncidentChange, resolved = false, byId: EntityId = 0): void {
    const ev = this.event;
    ev.id = e.id;
    ev.kind = e.kind;
    ev.change = change;
    ev.resolved = resolved;
    ev.byId = byId;
    this.ctx.events.emitAny(name, ev);
  }

  /** Incident actif qui porte déjà cette entité dans cette famille. */
  entryOf(family: number, id: EntityId): Entry | null {
    if (id === 0) return null;
    const e = this.byTarget.get(targetKey(family, id));
    return e && e.active ? e : null;
  }

  private mergeRadius(family: number, kind: IncidentKind, other: IncidentKind): number {
    const t = this.tuning;
    switch (family) {
      case FAM_FIRE: return kind === 'feu_poubelle' && other === 'feu_poubelle' ? t.mergeFire : t.mergeFireBig;
      case FAM_VICTIM:
      case FAM_OFFICER:
        return t.mergeVictims;
      case FAM_BARRICADE: return t.mergeBarricades;
      case FAM_LOOTING: return t.mergeLooting;
      default: return 0;
    }
  }

  /** Incident actif de la même famille dont un membre présent est assez proche du point. */
  private nearby(family: number, kind: IncidentKind, x: number, z: number): Entry | null {
    const entries = this.entries;
    let best: Entry | null = null;
    let bestD = Infinity;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.active || e.family !== family) continue;
      const r = this.mergeRadius(family, kind, e.kind);
      if (r <= 0) continue;
      const members = e.members;
      if (members.length === 0) {
        // incident « abstrait » (signalé sans entité mesurable) : son point fait foi
        const ax = e.x - x;
        const az = e.z - z;
        const ad = ax * ax + az * az;
        if (ad <= r * r && ad < bestD) {
          bestD = ad;
          best = e;
        }
        continue;
      }
      for (let j = 0; j < members.length; j++) {
        const m = members[j];
        if (m.gone) continue;
        const dx = m.x - x;
        const dz = m.z - z;
        const d = dx * dx + dz * dz;
        if (d <= r * r && d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    return best;
  }

  /**
   * Crée un incident, ou rattache la déclaration à un incident existant (même entité, ou doublon
   * proche de la même famille). `external` : déclaré par un autre module via IncidentsApi.open().
   */
  open(
    kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency: 1 | 2 | 3 | 0, external: boolean,
  ): Entry {
    const family = FAMILY_OF[kind] ?? FAM_FIRE;
    const now = this.now;
    // 1. même entité
    const same = this.entryOf(family, targetId);
    if (same) {
      if (urgency > same.baseUrgency) same.baseUrgency = urgency as 1 | 2 | 3;
      const m = same.member(targetId);
      if (m && m.gone) m.gone = false;
      this.upgradeKind(same, kind, targetKind, targetId, x, z);
      return same;
    }
    // 2. doublon proche de la même famille
    const near = this.nearby(family, kind, x, z);
    if (near) {
      // une déclaration sans entité mesurable ne fait que confirmer l'incident déjà connu
      const measurable = (targetKind !== 'place' && targetId !== 0) || (family === FAM_FIRE && (!external || this.ctx.hazards.fireAt(x, z) > 0.05));
      if (measurable) {
        if (targetKind !== 'place' && targetId !== 0) this.addMember(near, targetKind, targetId, x, z);
        else this.addMember(near, 'place', 0, x, z);
        near.tracked = true;
      }
      if (urgency > near.baseUrgency) near.baseUrgency = urgency as 1 | 2 | 3;
      this.upgradeKind(near, kind, targetKind, targetId, x, z);
      near.record.merged++;
      relabel(this.ctx, near);
      this.emit(INCIDENT_UPDATED_EVENT, near, 'fusion');
      return near;
    }
    // 3. nouvel incident
    const base = urgency !== 0 ? urgency : BASE_URGENCY[kind] ?? 1;
    const e = new Entry(this.nextId++, kind, family, x, z, targetKind, targetId, base, now);
    e.external = external;
    // un lieu n'est mesurable que pour un feu réellement présent (nappe au sol) : sinon l'incident est « abstrait »
    if (targetKind !== 'place' && targetId !== 0) this.addMember(e, targetKind, targetId, x, z);
    else if (family === FAM_FIRE && (!external || this.ctx.hazards.fireAt(x, z) > 0.05)) this.addMember(e, 'place', 0, x, z);
    e.tracked = e.members.length > 0;
    if (family === FAM_FIRE && targetId !== 0) {
      const out = this.lastFireOut.get(targetId);
      if (out !== undefined && now - out < REIGNITION_WINDOW) e.reignition = true;
    }
    relabel(this.ctx, e);
    this.entries.push(e);
    this.byId.set(e.id, e);
    this.records.add(e.record);
    this.emit(INCIDENT_OPENED_EVENT, e, 'ouvert');
    return e;
  }

  addMember(e: Entry, kind: EntityKind, id: EntityId, x: number, z: number): Member {
    const m = createMember(kind, id, x, z, this.now);
    if (e.family === FAM_FIRE && kind !== 'place') {
      // la nappe au sol d'un objet qui brûle n'est pas un foyer de plus : le lieu cède la place à l'entité
      const members = e.members;
      for (let i = members.length - 1; i >= 0; i--) {
        const o = members[i];
        if (o.kind !== 'place') continue;
        const dx = o.x - x;
        const dz = o.z - z;
        if (dx * dx + dz * dz <= PLACE_COVER * PLACE_COVER) {
          if (o.joinedAt < m.joinedAt) m.joinedAt = o.joinedAt;
          members.splice(i, 1);
        }
      }
    }
    e.members.push(m);
    if (id !== 0) this.byTarget.set(targetKey(e.family, id), e);
    return m;
  }

  /** Un foyer (objet, véhicule, boutique) déjà suivi couvre-t-il ce point ? */
  fireCovered(x: number, z: number): boolean {
    const entries = this.entries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.active || e.family !== FAM_FIRE) continue;
      const members = e.members;
      for (let j = 0; j < members.length; j++) {
        const m = members[j];
        if (m.gone) continue;
        const dx = m.x - x;
        const dz = m.z - z;
        if (dx * dx + dz * dz <= PLACE_COVER * PLACE_COVER) return true;
      }
    }
    return false;
  }

  /** Un foyer plus grave rejoint l'incident : il lui donne sa nature et devient sa cible. */
  private upgradeKind(e: Entry, kind: IncidentKind, targetKind: EntityKind, targetId: EntityId, x: number, z: number): void {
    if (e.family !== FAM_FIRE) return;
    const promote = (FIRE_RANK[kind] ?? 0) > (FIRE_RANK[e.kind] ?? 0) || (e.targetKind === 'place' && targetKind !== 'place' && kind === e.kind);
    if (!promote) return;
    e.kind = kind;
    e.targetKind = targetKind;
    e.targetId = targetId;
    e.x = x;
    e.z = z;
    const base = BASE_URGENCY[kind] ?? 1;
    if (base > e.baseUrgency) e.baseUrgency = base;
    relabel(this.ctx, e);
  }

  /** Clôt l'incident. `outcome` précise l'issue quand elle n'est pas un simple « traité » / « échec ». */
  close(e: Entry, resolved: boolean, byId: EntityId, outcome?: IncidentOutcome): void {
    if (!e.active) return;
    const now = this.now;
    const squadId = e.means !== '' && e.means !== 'joueur' && e.means !== 'pompiers' && e.means !== 'samu' ? e.squadId : 0;
    const wasPlayer = this.playerIncidentId === e.id;
    if (this.onRelease) this.onRelease(e, resolved);
    e.state = resolved ? 'resolu' : 'echoue';
    e.closedAt = now;
    if (resolved) e.progress = 1;
    const r = e.record;
    r.closedAt = now;
    r.severityEnd = e.severity;
    r.outcome = outcome ?? (resolved ? 'traite' : 'echec');
    if (wasPlayer) this.playerIncidentId = 0;
    if (e.task && this.onPlayerTaskEnd) this.onPlayerTaskEnd(e, resolved);
    // oubli des cibles ; mémoire des extinctions pour les reprises de feu
    const members = e.members;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.id === 0) continue;
      const key = targetKey(e.family, m.id);
      if (this.byTarget.get(key) === e) this.byTarget.delete(key);
      if (e.family === FAM_FIRE && resolved) this.lastFireOut.set(m.id, now);
    }
    // compte rendu radio : par l'unité qui a traité ; les secours rendent compte eux-mêmes ; un incident urgent
    // clos sans traitement est porté au compte rendu par la salle
    if (r.outcome === 'traite') {
      if (squadId !== 0 || e.means === '') {
        if (squadId !== 0 || r.urgency >= 2) this.radio.closed(e, squadId, true);
      }
    } else if (r.urgency >= 2) {
      this.radio.closed(e, 0, false);
    }
    this.emit(INCIDENT_CLOSED_EVENT, e, 'clos', resolved, byId);
  }

  /** Retire de la liste publiée les incidents clos depuis assez longtemps. */
  prune(): void {
    const entries = this.entries;
    const linger = this.tuning.closedLinger;
    const now = this.now;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.active || now - e.closedAt < linger) continue;
      entries.splice(i, 1);
      this.byId.delete(e.id);
    }
  }
}
