/* =====================================================================================
 * FOULE — le métro, source et puits d'affluence (demande du commanditaire ; bible F.2).
 *
 * On ne joue pas dans le métro : chaque bouche de la carte est un point d'arrivée et de départ.
 *   - Rassemblement : les stations à moins de 400 m font sortir les manifestants par VAGUES de 20 à 60
 *     personnes toutes les 20 à 40 s (durée standard) ; d'autres arrivent à pied par les rues.
 *   - Ensuite : des RENFORTS sortent des stations proches de la queue du cortège et le rattrapent.
 *   - Station FERMÉE (setOpen) : sa bouche se tarit ; 70 % du flux en attente est reporté sur les deux
 *     stations voisines avec 60 à 120 s de retard, le reste finit le trajet à pied.
 *   - Sortie FILTRÉE (setFiltered) : le débit tombe, les contrôlés s'agacent, la tension locale monte.
 *   - Dispersion : les bouches des stations ouvertes sont des issues (voir nav.ts).
 * Publie le service EXT.metro (MetroApi de core/extensions.ts).
 * ===================================================================================== */

import type { EntityId, Vec2 } from '@/core/contracts';
import type { MetroApi, MetroStation } from '@/core/extensions';
import { METRO_EVENT } from './api';
import type { MetroEvent } from './api';
import type { CrowdCore } from './core';
import * as T from './tuning';

/** Forme consommée du service facultatif 'world.data' (bouches précises des tuiles chargées). */
interface TileLike { metroEntrances?: readonly { x: number; z: number; heading: number; name: string }[] }
interface WorldDataLike {
  loadedKeys(): readonly string[];
  tile(tx: number, tz: number): TileLike | null;
}

export interface StationRt extends MetroStation {
  name: string;
  x: number;
  z: number;
  entrances: number[];
  open: boolean;
  filtered: boolean;
  inflow: number;
  arrived: number;
  /** Cap de sortie de chaque bouche. */
  headings: number[];
  placeX: number;
  placeZ: number;
  /** Dessert le rassemblement de la session. */
  serving: boolean;
  /** Groupes en attente de sortie (index dans Metro.parties). */
  queue: number[];
  /** Vague en cours : entrées du plan à faire sortir. */
  wave: number[];
  waveSize: number;
  nextWaveAt: number;
  emitAcc: number;
  cursor: number;
  recent: number;
  filterSquad: number;
  /** Vagues prévues pendant le rassemblement et taille type. */
  planned: number;
  waveTarget: number;
  /** Personnes entrées dans la station à la dispersion, et crédit de débit. */
  departed: number;
  enterCredit: number;
}

interface Delayed { due: number; party: number; station: number }

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export class Metro implements MetroApi {
  readonly stations: StationRt[] = [];
  /** Groupes d'arrivée : listes d'entrées du plan qui voyagent ensemble. */
  parties: number[][] = [];
  /** Points d'entrée à pied autour du rassemblement [x0, z0, …]. */
  footEntries: number[] = [];
  private delayed: Delayed[] = [];
  private foot: Delayed[] = [];
  private dirty = true;
  private nextRefresh = 0;
  private nextRate = 0;
  private footCursor = 0;
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly rand = (): number => this.core.rngArrive.next();
  private readonly ev: MetroEvent = { type: 'vague', stationId: 0, name: '', count: 0, toStationId: 0 };
  /** Personnes encore attendues (pas encore sorties). */
  pending = 0;

  constructor(private readonly core: CrowdCore) {}

  get(id: number): MetroStation | undefined {
    return this.stations[id - 1];
  }

  nearest(x: number, z: number, radius: number): MetroStation | null {
    let best: StationRt | null = null;
    let bestD = radius * radius;
    for (const s of this.stations) {
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  reset(): void {
    this.stations.length = 0;
    this.parties = [];
    this.footEntries = [];
    this.delayed = [];
    this.foot = [];
    this.dirty = true;
    this.nextRefresh = 0;
    this.nextRate = 0;
    this.footCursor = 0;
    this.pending = 0;
  }

  /** Recense les stations de la carte (appelé au début de chaque session). */
  discover(): void {
    const places = this.core.ctx.world.places;
    this.stations.length = 0;
    for (let i = 0; i < places.length; i++) {
      const p = places[i]!;
      if (p.kind !== 'station') continue;
      this.stations.push({
        id: this.stations.length + 1, name: p.name, x: p.x, z: p.z, entrances: [], open: true, filtered: false, inflow: 0,
        arrived: 0, headings: [], placeX: p.x, placeZ: p.z, serving: false, queue: [], wave: [], waveSize: 0,
        nextWaveAt: Infinity, emitAcc: 0, cursor: 0, recent: 0, filterSquad: 0, planned: 0, waveTarget: T.WAVE_MIN,
        departed: 0, enterCredit: 0,
      });
    }
    this.dirty = true;
    this.refreshEntrances();
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Relit les bouches précises des tuiles chargées (service 'world.data') ; à défaut, une bouche au point de la station. */
  refreshEntrances(): void {
    this.dirty = false;
    const ctx = this.core.ctx;
    const data = ctx.service<WorldDataLike>('world.data');
    const byName = new Map<string, StationRt>();
    for (const s of this.stations) {
      byName.set(norm(s.name), s);
      s.entrances.length = 0;
      s.headings.length = 0;
    }
    if (data && typeof data.loadedKeys === 'function' && typeof data.tile === 'function') {
      const keys = data.loadedKeys();
      for (let k = 0; k < keys.length; k++) {
        const parts = keys[k]!.split('_');
        const tile = data.tile(Number(parts[0]), Number(parts[1]));
        const list = tile?.metroEntrances;
        if (!list) continue;
        for (const m of list) {
          let st = byName.get(norm(m.name));
          if (!st) {
            let bestD = 250 * 250;
            for (const s of this.stations) {
              const d = (s.placeX - m.x) * (s.placeX - m.x) + (s.placeZ - m.z) * (s.placeZ - m.z);
              if (d < bestD) {
                bestD = d;
                st = s;
              }
            }
          }
          if (!st) continue;
          st.entrances.push(m.x, m.z);
          st.headings.push(m.heading);
        }
      }
    }
    for (const s of this.stations) {
      if (s.entrances.length === 0) {
        // pas de bouche connue : un point libre près de la station
        let x = s.placeX;
        let z = s.placeZ;
        if (!ctx.world.isFree(x, z, 0.4) && ctx.world.randomFreePoint(x, z, 14, 'sidewalk', this.rand, this.tmp)) {
          x = this.tmp.x;
          z = this.tmp.z;
        }
        s.entrances.push(x, z);
        s.headings.push(0);
      }
      s.x = s.entrances[0]!;
      s.z = s.entrances[1]!;
    }
  }

  // ───────────────────────────── API ─────────────────────────────

  setOpen(id: number, open: boolean, byId: EntityId): void {
    const s = this.stations[id - 1];
    if (!s || s.open === open) return;
    s.open = open;
    const core = this.core;
    let moved = 0;
    if (!open) {
      // la vague en cours s'interrompt : ceux qui n'étaient pas sortis repartent avec les autres
      const waiting = s.queue.splice(0);
      if (s.wave.length > 0) {
        this.parties.push(s.wave.splice(0));
        waiting.push(this.parties.length - 1);
      }
      s.nextWaveAt = Infinity;
      const neighbours = this.neighbours(s);
      for (let i = 0; i < waiting.length; i++) {
        const party = waiting[i]!;
        const size = this.parties[party]!.length;
        const K = core.timeScale;
        if (neighbours.length > 0 && core.rngArrive.next() < T.CLOSURE_SHARE) {
          const to = neighbours[i % neighbours.length]!;
          this.delayed.push({ due: core.now + core.rngArrive.range(T.CLOSURE_DELAY_MIN, T.CLOSURE_DELAY_MAX) * K, party, station: to.id });
          moved += size;
        } else {
          this.foot.push({ due: core.now + core.rngArrive.range(T.CLOSURE_DELAY_MIN * 1.5, T.CLOSURE_DELAY_MAX * 1.5) * K, party, station: 0 });
        }
      }
      if (moved > 0 && neighbours.length > 0) this.emit('report', s, moved, neighbours[0]!.id);
    } else if (s.serving && s.queue.length > 0) {
      s.nextWaveAt = core.now + 5;
    }
    this.emit(open ? 'ouverture' : 'fermeture', s, 0, 0);
    core.nav.exitsDirty = true;
    if (core.active) {
      core.ctx.radio.say({
        channel: 'commandement', from: 'Salle', priority: 1,
        text: open ? 'Station ' + s.name + ' rouverte.' : 'Station ' + s.name + ' fermée, les rames ne marquent plus l’arrêt.',
        personId: byId || undefined,
      });
    }
  }

  setFiltered(id: number, filtered: boolean, squadId: number): void {
    const s = this.stations[id - 1];
    if (!s || (s.filtered === filtered && s.filterSquad === squadId)) return;
    s.filtered = filtered;
    s.filterSquad = filtered ? squadId : 0;
    this.emit('filtrage', s, filtered ? 1 : 0, 0);
  }

  private neighbours(s: StationRt): StationRt[] {
    const out: StationRt[] = [];
    const sorted = this.stations.filter((o) => o !== s && o.open && Math.hypot(o.x - s.x, o.z - s.z) <= T.CLOSURE_NEIGHBOUR);
    sorted.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
    for (let i = 0; i < sorted.length && i < 2; i++) out.push(sorted[i]!);
    return out;
  }

  private emit(type: MetroEvent['type'], s: StationRt, count: number, to: number): void {
    const ev = this.ev;
    ev.type = type;
    ev.stationId = s.id;
    ev.name = s.name;
    ev.count = count;
    ev.toStationId = to;
    this.core.ctx.events.emitAny(METRO_EVENT, ev);
  }

  // ───────────────────────────── plan d'arrivée ─────────────────────────────

  /**
   * Répartit les arrivées de la session. `gather` : groupes attendus pendant le rassemblement ;
   * `late` : renforts ; `last` : ceux qui ne viennent qu'à la dispersion.
   */
  schedule(gather: number[][], late: number[][], last: number[][]): void {
    const core = this.core;
    const rng = core.rngArrive;
    const K = core.timeScale;
    const sch = core.schedule;
    const rx = core.rallyX;
    const rz = core.rallyZ;
    this.parties = [];
    // stations qui desservent le rassemblement
    let serving = this.stations.filter((s) => Math.hypot(s.x - rx, s.z - rz) <= T.STATION_RADIUS);
    if (serving.length === 0) {
      const n = this.nearest(rx, rz, T.STATION_FALLBACK) as StationRt | null;
      if (n) serving = [n];
    }
    for (const s of serving) s.serving = true;
    this.buildFootEntries();
    const openServing = serving.filter((s) => s.open);
    const weights = openServing.map((s) => (s.entrances.length >> 1) / (1 + Math.hypot(s.x - rx, s.z - rz) / 200));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const window = sch.gather * 0.85;
    let footN = 0;
    for (const members of gather) {
      const party = this.parties.push(members) - 1;
      this.pending += members.length;
      if (openServing.length > 0 && rng.next() < T.METRO_SHARE) {
        let r = rng.next() * wsum;
        let k = 0;
        for (; k < weights.length - 1; k++) {
          r -= weights[k]!;
          if (r < 0) break;
        }
        openServing[k]!.queue.push(party);
      } else if (serving.length > 0 && openServing.length === 0 && rng.next() < T.METRO_SHARE) {
        // toutes les stations du secteur sont fermées : flux reporté sur les voisines, avec retard
        const far = this.neighbours(serving[0]!);
        if (far.length > 0 && rng.next() < T.CLOSURE_SHARE) {
          this.delayed.push({ due: rng.range(T.CLOSURE_DELAY_MIN, T.CLOSURE_DELAY_MAX) * K + rng.next() * window, party, station: far[footN % far.length]!.id });
        } else this.foot.push({ due: rng.range(T.CLOSURE_DELAY_MIN, T.CLOSURE_DELAY_MAX * 1.5) * K + rng.next() * window, party, station: 0 });
        footN++;
      } else {
        this.foot.push({ due: rng.next() * window, party, station: 0 });
      }
    }
    // vagues : de quoi faire sortir tout le monde pendant le rassemblement
    for (const s of openServing) {
      let people = 0;
      for (const p of s.queue) people += this.parties[p]!.length;
      const every = 0.5 * (T.WAVE_EVERY_MIN + T.WAVE_EVERY_MAX) * K;
      s.planned = Math.max(1, Math.floor(window / every));
      s.waveTarget = Math.max(4, Math.min(T.WAVE_MAX, Math.ceil(people / s.planned)));
      s.nextWaveAt = people > 0 ? rng.range(2, 8) * Math.min(1, K) : Infinity;
    }
    // renforts : après le départ, quand la mobilisation grossit
    const from = sch.gather + sch.depart * 0.5;
    const to = sch.gather + sch.depart + sch.march * 0.45;
    for (const members of late) {
      const party = this.parties.push(members) - 1;
      this.pending += members.length;
      this.delayed.push({ due: from + rng.next() * (to - from), party, station: -1 });
    }
    // opportunistes de fin de manifestation : ils entrent par le point d'arrivée
    const d0 = sch.gather + sch.depart + sch.march;
    for (const members of last) {
      const party = this.parties.push(members) - 1;
      this.pending += members.length;
      this.delayed.push({ due: d0 + rng.next() * sch.disperse * 0.3, party, station: -2 });
    }
    this.delayed.sort((a, b) => a.due - b.due);
    this.foot.sort((a, b) => a.due - b.due);
  }

  private buildFootEntries(): void {
    const core = this.core;
    const ctx = core.ctx;
    const rng = core.rngArrive;
    const out = this.footEntries;
    out.length = 0;
    const path: number[] = [];
    const b = ctx.world.bounds;
    const a0 = rng.next() * Math.PI * 2;
    for (let k = 0; k < 8 && out.length < 12; k++) {
      const a = a0 + (k / 8) * Math.PI * 2;
      const r = rng.range(T.FOOT_ENTRY_MIN, T.FOOT_ENTRY_MAX);
      const x = Math.min(b.maxX - 6, Math.max(b.minX + 6, core.rallyX + Math.sin(a) * r));
      const z = Math.min(b.maxZ - 6, Math.max(b.minZ + 6, core.rallyZ + Math.cos(a) * r));
      if (!ctx.world.randomFreePoint(x, z, 25, 'sidewalk', this.rand, this.tmp)) continue;
      const px = this.tmp.x;
      const pz = this.tmp.z;
      if (Math.hypot(px - core.rallyX, pz - core.rallyZ) < T.FOOT_ENTRY_MIN * 0.6) continue;
      if (!ctx.world.findPath(px, pz, core.rallyX, core.rallyZ, 'foot', path)) continue;
      let len = 0;
      for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      if (len > T.FOOT_ENTRY_MAX * 2.6) continue;
      out.push(px, pz);
    }
    if (out.length === 0) out.push(core.rallyX + 40, core.rallyZ);
  }

  // ───────────────────────────── vie ─────────────────────────────

  update(dt: number): void {
    const core = this.core;
    const now = core.now;
    if (this.dirty && now >= this.nextRefresh) {
      this.nextRefresh = now + 1;
      this.refreshEntrances();
      core.nav.exitsDirty = true;
    }
    if (!core.active) return;
    // flux différés arrivés à échéance
    const delayed = this.delayed;
    while (delayed.length > 0 && delayed[0]!.due <= now) {
      const d = delayed.shift()!;
      this.route(d);
    }
    const foot = this.foot;
    while (foot.length > 0 && foot[0]!.due <= now) {
      const f = foot.shift()!;
      this.walkIn(f.party, f.station);
    }
    // vagues
    const K = core.timeScale;
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i]!;
      if (s.enterCredit < 3) s.enterCredit += T.ENTER_RATE * dt;
      if (s.wave.length === 0) {
        if (!s.open || s.queue.length === 0 || now < s.nextWaveAt) continue;
        // nouvelle vague : des groupes entiers jusqu'à la taille visée
        const target = Math.max(4, Math.round(s.waveTarget * core.rngArrive.range(0.6, 1.4)));
        while (s.queue.length > 0 && s.wave.length < target) {
          const members = this.parties[s.queue.shift()!]!;
          for (let k = 0; k < members.length; k++) s.wave.push(members[k]!);
        }
        s.waveSize = s.wave.length;
        s.emitAcc = 1;
        this.emit('vague', s, s.waveSize, 0);
        if (s.filtered) {
          core.director.addTension(T.FILTER_TENSION, s.x, s.z, 'filtrage_metro');
        }
      }
      s.emitAcc += (s.filtered ? T.EXIT_RATE_FILTERED : T.EXIT_RATE * (s.entrances.length >> 1)) * dt;
      while (s.emitAcc >= 1 && s.wave.length > 0) {
        s.emitAcc -= 1;
        const entry = s.wave.shift()!;
        const e = (s.cursor++ % (s.entrances.length >> 1)) * 2;
        const h = s.headings[e >> 1] ?? 0;
        const p = core.spawnArrival(entry, s.entrances[e]! + Math.sin(h) * 0.7, s.entrances[e + 1]! + Math.cos(h) * 0.7, h, s.id);
        this.pending--;
        if (p) {
          s.arrived++;
          s.recent++;
          if (s.filtered) p.anger = Math.min(1, p.anger + T.FILTER_ANGER);
        }
      }
      if (s.wave.length === 0 && s.waveSize > 0) {
        s.waveSize = 0;
        const every = core.rngArrive.range(T.WAVE_EVERY_MIN, T.WAVE_EVERY_MAX) * K * (s.filtered ? 1.5 : 1);
        // beaucoup de monde en attente : les rames se suivent de plus près
        let people = 0;
        for (const q of s.queue) people += this.parties[q]!.length;
        s.nextWaveAt = now + every * Math.min(1, (T.WAVE_MAX * 2) / Math.max(1, people) + 0.35);
      }
    }
    if (now >= this.nextRate) {
      this.nextRate = now + 1;
      for (const s of this.stations) {
        s.inflow = s.inflow * 0.9 + s.recent * 6;
        if (s.inflow < 0.05) s.inflow = 0;
        s.recent = 0;
      }
    }
  }

  /** Achemine un flux différé : vers une station donnée, la plus proche de la queue (−1) ou de la tête (−2). */
  private route(d: Delayed): void {
    const core = this.core;
    let st: StationRt | null = d.station > 0 ? this.stations[d.station - 1] ?? null : null;
    if (d.station < 0) {
      const f = core.formation;
      core.corridor.at(d.station === -1 ? f.tailS : f.headS, core.rp);
      let bestD = T.STATION_RADIUS * 1.25;
      for (const s of this.stations) {
        if (!s.open) continue;
        const dist = Math.hypot(s.x - core.rp.x, s.z - core.rp.z);
        if (dist < bestD) {
          bestD = dist;
          st = s;
        }
      }
    }
    if (st && st.open) {
      st.queue.push(d.party);
      if (st.wave.length === 0 && !(st.nextWaveAt < Infinity && st.nextWaveAt > core.now)) st.nextWaveAt = core.now + core.rngArrive.range(1, 12);
      if (!st.serving) {
        st.serving = true;
        st.waveTarget = T.WAVE_MIN;
      }
    } else this.walkIn(d.party, d.station);
  }

  /** Un groupe arrive à pied : par un point d'entrée du rassemblement, ou derrière la queue du cortège une fois parti. */
  private walkIn(party: number, origin: number): void {
    const core = this.core;
    const ctx = core.ctx;
    const members = this.parties[party]!;
    let x: number;
    let z: number;
    if (origin < 0 || core.formation.marching) {
      const f = core.formation;
      core.corridor.at((origin === -2 ? f.headS + 110 : f.tailS - 110), core.rp);
      x = core.rp.x;
      z = core.rp.z;
    } else {
      const k = (this.footCursor++ % (this.footEntries.length >> 1)) * 2;
      x = this.footEntries[k]!;
      z = this.footEntries[k + 1]!;
    }
    for (let i = 0; i < members.length; i++) {
      let px = x;
      let pz = z;
      if (ctx.world.randomFreePoint(x, z, 5, 'any', this.rand, this.tmp)) {
        px = this.tmp.x;
        pz = this.tmp.z;
      }
      core.spawnArrival(members[i]!, px, pz, Math.atan2(core.rallyX - px, core.rallyZ - pz), 0);
      this.pending--;
    }
  }

  /** Une personne atteint une bouche à la dispersion : passe-t-elle maintenant (débit limité) ? */
  tryEnter(stationId: number): boolean {
    const s = this.stations[stationId - 1];
    if (!s || !s.open) return false;
    if (s.enterCredit < 1) return false;
    s.enterCredit -= 1;
    s.departed++;
    return true;
  }
}
