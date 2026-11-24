/* =====================================================================================
 * INCIDENTS — détection automatique à partir des événements et de l'état du monde.
 *
 * Événements : fire:started (objet, véhicule, boutique, nappe au sol), fire:out, person:down,
 * person:treated, shop:looted, barricade:built, et les événements libres des modules voisins
 * (arrosage, appel de la foule, automobiliste bloqué, barricade étendue, victime évacuée).
 * État du monde, par tranches (quelques dizaines d'entités par pas) : objets, véhicules et
 * boutiques qui brûlent sans avoir été signalés, personnes gravement blessées à terre, agents
 * isolés au milieu d'hostiles. Rien n'est créé deux fois : le noyau regroupe les doublons.
 *
 * Deux temporisations évitent le bruit : une nappe de feu au sol n'est signalée que si elle dure
 * (un engin incendiaire isolé s'éteint seul en une demi-minute), et une personne à terre sans
 * blessure grave n'est signalée que si elle ne se relève pas.
 * ===================================================================================== */

import type { EntityId, EntityKind, Person } from '@/core/contracts';
import type { Entry } from './entry';
import { injuryRank } from './entry';
import type { Kernel } from './kernel';
import { relabel } from './labels';
import type { Sense } from './sense';
import type { Thinker } from './think';
import { FAM_BARRICADE, FAM_FIRE, FAM_ISOLATED, FAM_MOTORIST, FAM_OFFICER, FAM_VICTIM } from './tuning';

interface GroundFire { x: number; z: number; t: number }
interface DownWatch { id: EntityId; t: number; confirm: number; called: boolean }

const PROPS_PER_STEP = 256;
const VEHICLES_PER_STEP = 24;
const SHOPS_PER_STEP = 64;
const PEOPLE_PER_STEP = 128;
const POLICE_PER_STEP = 4;
const PENDING_MAX = 48;
/** Agent à terre sans blessure grave : signalé plus vite qu'un civil (s). */
const OFFICER_CONFIRM = 4;
/**
 * Blessé sérieux : il reste sonné jusqu'à une dizaine de secondes puis se relève souvent seul ; il n'est signalé
 * que s'il est toujours à terre après ce délai (s). Une urgence absolue, elle, est signalée tout de suite.
 */
const SERIOUS_CONFIRM = 12;

export class Detector {
  private readonly ground: GroundFire[] = [];
  private readonly downs: DownWatch[] = [];
  private propCursor = 0;
  private vehicleCursor = 0;
  private shopCursor = 0;
  private peopleCursor = 0;
  private policeCursor = 0;
  private readonly police: Person[] = [];
  private policeAt = 0;
  /** Agents dont l'isolement est en cours de confirmation : identifiant → instant du premier constat. */
  private readonly isoSince = new Map<EntityId, number>();

  constructor(private readonly k: Kernel, private readonly sense: Sense, private readonly thinker: Thinker) {}

  reset(): void {
    this.ground.length = 0;
    this.downs.length = 0;
    this.propCursor = this.vehicleCursor = this.shopCursor = this.peopleCursor = this.policeCursor = 0;
    this.police.length = 0;
    this.policeAt = 0;
    this.isoSince.clear();
  }

  // ───────────────────────────── événements ─────────────────────────────

  init(): void {
    const k = this.k;
    const ctx = k.ctx;
    const ev = ctx.events;

    ev.on('fire:started', (e) => {
      if (!k.tuning.detection) return;
      switch (e.targetKind) {
        case 'prop': {
          const p = ctx.props.get(e.targetId);
          if (p) this.fireOn(p.kind === 'barricade' ? 'feu_barricade' : 'feu_poubelle', p.x, p.z, 'prop', p.id);
          break;
        }
        case 'vehicle': {
          const v = ctx.vehicles.get(e.targetId);
          if (v && !v.def.flying) this.fireOn('feu_vehicule', v.x, v.z, 'vehicle', v.id);
          break;
        }
        case 'shop': {
          const s = ctx.props.shop(e.targetId);
          if (s) this.fireOn('feu_boutique', s.x, s.z, 'shop', s.id);
          break;
        }
        case 'ground':
          if (this.ground.length < PENDING_MAX) this.ground.push({ x: e.x, z: e.z, t: k.now });
          break;
        default:
          break; // une personne en feu relève des blessés
      }
    });

    ev.on('fire:out', (e) => {
      if (e.byId === 0) return;
      // éteint par quelqu'un : le foyer est tenu pour traité
      if (e.targetId !== 0) {
        const inc = k.entryOf(FAM_FIRE, e.targetId);
        const m = inc ? inc.member(e.targetId) : null;
        if (inc && m) {
          m.handled = true;
          inc.touchedAt = k.now;
        }
        return;
      }
      this.touchFires(e.x, e.z, 3, true);
    });

    ev.onAny('hazards:douse', (payload) => {
      const d = payload as { x: number; z: number; radius: number } | null;
      if (d) this.touchFires(d.x, d.z, d.radius + 3, false);
    });

    ev.on('person:down', (e) => {
      if (!k.tuning.detection) return;
      const p = ctx.people.get(e.id);
      if (!p) return;
      this.watchDown(e.id, p.faction === 'police' ? OFFICER_CONFIRM : k.tuning.downConfirm);
    });

    ev.onAny('crowd:help', (payload) => {
      const d = payload as { personId: EntityId } | null;
      if (d && k.tuning.detection) this.watchDown(d.personId, 0, true);
    });

    ev.on('person:treated', (e) => {
      const inc = k.entryOf(FAM_VICTIM, e.id) ?? k.entryOf(FAM_OFFICER, e.id);
      const m = inc ? inc.member(e.id) : null;
      if (inc && m) {
        m.treatedAt = k.now;
        inc.touchedAt = k.now;
      }
    });

    ev.onAny('rescue:evacuated', (payload) => {
      const d = payload as { personId: EntityId } | null;
      if (!d) return;
      const inc = k.entryOf(FAM_VICTIM, d.personId) ?? k.entryOf(FAM_OFFICER, d.personId);
      const m = inc ? inc.member(d.personId) : null;
      if (inc && m) {
        m.evacuated = true;
        m.handled = true;
        inc.touchedAt = k.now;
      }
    });

    ev.on('person:arrested', (e) => {
      // une interpellation près d'un pillage : l'incident est en cours de traitement
      const p = ctx.people.get(e.id);
      if (!p) return;
      const entries = k.entries;
      for (let i = 0; i < entries.length; i++) {
        const inc = entries[i];
        if (!inc.active || inc.kind !== 'pillage') continue;
        const dx = inc.x - p.x;
        const dz = inc.z - p.z;
        if (dx * dx + dz * dz < 25 * 25) inc.touchedAt = k.now;
      }
    });

    ev.on('shop:looted', (e) => {
      if (!k.tuning.detection) return;
      const s = ctx.props.shop(e.id);
      if (!s) return;
      const inc = k.open('pillage', s.x, s.z, 'shop', s.id, 0, false);
      const m = inc.member(s.id);
      if (m) {
        m.aux++;
        m.auxAt = k.now;
      }
      inc.suspectId = e.byId;
    });

    ev.on('barricade:built', (e) => {
      if (k.tuning.detection) this.barricadeAt(e.id, e.x, e.z);
    });

    ev.onAny('props:barricade_extended', (payload) => {
      const d = payload as { id: EntityId; parts?: number } | null;
      if (!d) return;
      const inc = k.entryOf(FAM_BARRICADE, d.id);
      const m = inc ? inc.member(d.id) : null;
      if (!inc || !m) return;
      const parts = typeof d.parts === 'number' ? d.parts : m.aux + 1;
      // la barricade est renforcée : aggravation si personne ne s'en occupe (par paliers de trois éléments)
      if (parts >= m.auxPeak + 3 && inc.state !== 'en_cours') this.thinker.aggravate(inc);
      m.aux = parts;
    });

    ev.onAny('props:barricade_cleared', (payload) => {
      const d = payload as { id: EntityId; parts?: number } | null;
      if (!d) return;
      const inc = k.entryOf(FAM_BARRICADE, d.id);
      const m = inc ? inc.member(d.id) : null;
      if (inc && m) {
        if (typeof d.parts === 'number') m.aux = d.parts;
        inc.touchedAt = k.now;
      }
    });

    ev.onAny('traffic:motorist', (payload) => {
      const d = payload as { vehicleId: EntityId; state: string; x: number; z: number } | null;
      if (!d) return;
      if (d.state === 'bloque') {
        if (k.tuning.detection) k.open('automobiliste_bloque', d.x, d.z, 'vehicle', d.vehicleId, 0, false);
        return;
      }
      const inc = k.entryOf(FAM_MOTORIST, d.vehicleId);
      if (!inc) return;
      if (d.state === 'libere' || d.state === 'demi_tour' || d.state === 'gare') {
        k.close(inc, true, 0, inc.means !== '' ? 'traite' : 'cause_disparue');
      } else {
        k.close(inc, false, 0, 'cause_disparue'); // véhicule abandonné ou conducteur en fuite
      }
    });
  }

  private fireOn(kind: 'feu_poubelle' | 'feu_barricade' | 'feu_vehicule' | 'feu_boutique', x: number, z: number, targetKind: EntityKind, id: EntityId): Entry {
    const k = this.k;
    const known = k.entryOf(FAM_FIRE, id);
    const inc = k.open(kind, x, z, targetKind, id, 0, false);
    // un nouveau foyer rejoint un feu déjà signalé : il se propage
    if (!known && inc.members.length > 1 && k.now - inc.createdAt > 2 && inc.state !== 'en_cours') this.thinker.aggravate(inc);
    return inc;
  }

  private barricadeAt(id: EntityId, x: number, z: number): void {
    const k = this.k;
    const inc = k.open('barricade', x, z, 'prop', id, 0, false);
    const m = inc.member(id);
    if (m && m.aux === 0) {
      const ext = k.ctx.service<{ barricadeParts(id: EntityId): readonly unknown[] }>('props.ext');
      const parts = ext ? ext.barricadeParts(id).length : 0;
      m.aux = parts > 0 ? parts : 5;
      m.auxPeak = m.aux;
    }
  }

  /** Un arrosage ou une extinction à cet endroit : preuve de traitement pour les feux voisins. */
  private touchFires(x: number, z: number, radius: number, handled: boolean): void {
    const k = this.k;
    const entries = k.entries;
    const r2 = radius * radius;
    for (let i = 0; i < entries.length; i++) {
      const inc = entries[i];
      if (!inc.active || inc.family !== FAM_FIRE) continue;
      const members = inc.members;
      for (let j = 0; j < members.length; j++) {
        const m = members[j];
        const dx = m.x - x;
        const dz = m.z - z;
        if (dx * dx + dz * dz > r2) continue;
        inc.touchedAt = k.now;
        if (handled && m.kind === 'place') m.handled = true;
      }
    }
  }

  /** `called` : quelqu'un appelle les secours pour cette personne (pas de délai de confirmation). */
  private watchDown(id: EntityId, confirm: number, called = false): void {
    const downs = this.downs;
    for (let i = 0; i < downs.length; i++) {
      if (downs[i].id === id) {
        if (confirm < downs[i].confirm) downs[i].confirm = confirm;
        if (called) downs[i].called = true;
        return;
      }
    }
    if (downs.length < PENDING_MAX) downs.push({ id, t: this.k.now, confirm, called });
  }

  // ───────────────────────────── à chaque pas ─────────────────────────────

  update(): void {
    const k = this.k;
    if (!k.tuning.detection) {
      this.ground.length = 0;
      this.downs.length = 0;
      return;
    }
    this.pendingGround();
    this.pendingDowns();
    this.scanProps();
    this.scanVehicles();
    this.scanShops();
    this.scanPeople();
    this.scanPolice();
  }

  private pendingGround(): void {
    const k = this.k;
    const list = this.ground;
    const now = k.now;
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      if (now - g.t < k.tuning.groundFireConfirm) continue;
      list[i] = list[list.length - 1];
      list.pop();
      // la nappe dure, et ce n'est pas la chaleur d'un objet déjà signalé
      if (k.ctx.hazards.fireAt(g.x, g.z) > 0.25 && !k.fireCovered(g.x, g.z)) k.open('feu_poubelle', g.x, g.z, 'place', 0, 0, false);
    }
  }

  private pendingDowns(): void {
    const k = this.k;
    const ctx = k.ctx;
    const list = this.downs;
    const now = k.now;
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      const p = ctx.people.get(w.id);
      let drop = !p || p.posture !== 'down' || p.dormant || p.heldBy !== 0 || p.vehicleId !== 0 || p.custody !== 'free';
      if (!drop && p) {
        const officer = p.faction === 'police';
        if (k.entryOf(officer ? FAM_OFFICER : FAM_VICTIM, p.id)) {
          drop = true;
        } else {
          const rank = injuryRank(p.injury);
          const need = !w.called && !officer && rank === 2 && w.confirm < SERIOUS_CONFIRM ? SERIOUS_CONFIRM : w.confirm;
          if (rank >= 3 || (officer && rank >= 2) || now - w.t >= need) {
            const urgency: 1 | 2 | 3 = rank >= 3 ? 3 : officer ? (rank >= 2 ? 3 : 2) : rank === 2 ? 2 : 1;
            const inc = k.open(officer ? 'agent_a_terre' : 'blesse', p.x, p.z, 'person', p.id, urgency, false);
            const m = inc.member(p.id);
            if (m && m.injury !== rank) {
              m.injury = rank;
              relabel(ctx, inc);
            }
            drop = true;
          }
        }
      }
      if (drop) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private scanProps(): void {
    const k = this.k;
    const list = k.ctx.props.list;
    const n = list.length;
    if (n === 0) return;
    let c = this.propCursor;
    const count = n < PROPS_PER_STEP ? n : PROPS_PER_STEP;
    for (let i = 0; i < count; i++) {
      if (c >= n) c = 0;
      const p = list[c++];
      if (p.dormant) continue;
      if ((p.state === 'burning' || p.burning > 0.05) && !k.entryOf(FAM_FIRE, p.id)) {
        this.fireOn(p.kind === 'barricade' ? 'feu_barricade' : 'feu_poubelle', p.x, p.z, 'prop', p.id);
      }
      if (p.kind === 'barricade' && !k.entryOf(FAM_BARRICADE, p.id)) this.barricadeAt(p.id, p.x, p.z);
    }
    this.propCursor = c;
  }

  private scanVehicles(): void {
    const k = this.k;
    const list = k.ctx.vehicles.list;
    const n = list.length;
    if (n === 0) return;
    let c = this.vehicleCursor;
    const count = n < VEHICLES_PER_STEP ? n : VEHICLES_PER_STEP;
    for (let i = 0; i < count; i++) {
      if (c >= n) c = 0;
      const v = list[c++];
      if (v.dormant || v.def.flying) continue;
      if ((v.state === 'burning' || v.burning >= 0.25) && !k.entryOf(FAM_FIRE, v.id)) this.fireOn('feu_vehicule', v.x, v.z, 'vehicle', v.id);
    }
    this.vehicleCursor = c;
  }

  private scanShops(): void {
    const k = this.k;
    const list = k.ctx.props.shops;
    const n = list.length;
    if (n === 0) return;
    let c = this.shopCursor;
    const count = n < SHOPS_PER_STEP ? n : SHOPS_PER_STEP;
    for (let i = 0; i < count; i++) {
      if (c >= n) c = 0;
      const s = list[c++];
      if (s.dormant) continue;
      if (s.burning > 0.05 && !k.entryOf(FAM_FIRE, s.id)) this.fireOn('feu_boutique', s.x, s.z, 'shop', s.id);
    }
    this.shopCursor = c;
  }

  /** Personnes gravement blessées à terre qui n'ont fait l'objet d'aucun signalement (événement manqué, état antérieur). */
  private scanPeople(): void {
    const k = this.k;
    const list = k.ctx.people.list;
    const n = list.length;
    if (n === 0) return;
    let c = this.peopleCursor;
    const count = n < PEOPLE_PER_STEP ? n : PEOPLE_PER_STEP;
    for (let i = 0; i < count; i++) {
      if (c >= n) c = 0;
      const p = list[c++];
      if (p.posture !== 'down' || p.dormant || p.heldBy !== 0 || p.vehicleId !== 0) continue;
      if (p.injury !== 'serious' && p.injury !== 'critical' && p.injury !== 'dead') continue;
      if (k.entryOf(p.faction === 'police' ? FAM_OFFICER : FAM_VICTIM, p.id)) continue;
      this.watchDown(p.id, 2);
    }
    this.peopleCursor = c;
  }

  /** Agents isolés : quelques agents par pas, la liste étant relevée toutes les cinq secondes. */
  private scanPolice(): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const police = this.police;
    if (now >= this.policeAt) {
      this.policeAt = now + 5;
      const list = ctx.people.list;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.faction !== 'police' || p.dormant) continue;
        if (n < police.length) police[n] = p;
        else police.push(p);
        n++;
      }
      police.length = n;
      if (this.policeCursor >= n) this.policeCursor = 0;
    }
    const n = police.length;
    if (n === 0) return;
    let c = this.policeCursor;
    const count = n < POLICE_PER_STEP ? n : POLICE_PER_STEP;
    for (let i = 0; i < count; i++) {
      if (c >= n) c = 0;
      const p = police[c++];
      if (ctx.people.get(p.id) !== p) continue; // retiré depuis le dernier relevé
      if (k.entryOf(FAM_ISOLATED, p.id)) continue;
      // d'abord les hostiles au contact (rayon court, peu coûteux), puis seulement les collègues
      if (p.posture === 'down' || p.vehicleId !== 0 || this.sense.hostiles(p.x, p.z, k.tuning.isolatedHostileRange) < k.tuning.isolatedHostiles
        || this.sense.isolation(p) < 0) {
        if (this.isoSince.size > 0) this.isoSince.delete(p.id);
        continue;
      }
      const since = this.isoSince.get(p.id);
      if (since === undefined) {
        this.isoSince.set(p.id, now);
      } else if (now - since >= k.tuning.isolatedConfirm) {
        this.isoSince.delete(p.id);
        k.open('agent_isole', p.x, p.z, 'person', p.id, 0, false);
      }
    }
    this.policeCursor = c;
  }
}
