/* =====================================================================================
 * FOULE — densité et compression (bible F.2 ; docs/research/03 §5.5-5.6).
 *
 * Deux fois par seconde, toutes les personnes à pied sont comptées dans des cellules de 2,5 m. La densité
 * « équivalente » d'une cellule est sa densité géométrique, majorée par la compression mesurée par le
 * module des personnes quand il est branché : les disques de la locomotion (0,28 m de rayon) ne se
 * tassent pas au-delà de ≈ 3,7 personnes/m², alors qu'une vraie foule comprimée atteint 5 et plus.
 *   ≥ 3 : la peur monte ; ≥ 4 tenue 1,5 s : ALERTE (tension, radio, événement 'crowd:density') ;
 *   ≥ 5 : DANGER — blessures par écrasement (ctx.health.hurt, type 'crush'), incident « blessé ».
 * Les personnes prises dans une cellule en alerte cherchent l'issue : la direction la moins dense.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { DENSITY_EVENT } from './api';
import type { DensityEvent } from './api';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import { SparseGrid } from './grid';
import { Spots } from './sense';
import * as T from './tuning';

interface LocomotionLike { pressureOf(p: Person): number }

const AREA = T.DENSITY_CELL * T.DENSITY_CELL;

export class DensityWatch {
  /** Canaux : effectif, somme des compressions, densité équivalente. */
  private readonly grid = new SparseGrid(T.DENSITY_CELL, 3, 1024);
  /** Zones comprimées suivies : t = début, a = dernière alerte donnée, b = dernier instant au-dessus du seuil. */
  private readonly zones = new Spots(12);
  private next = 0;
  private readonly ev: DensityEvent = { level: 'alerte', density: 0, x: 0, z: 0, people: 0 };
  /** Densité équivalente maximale relevée au dernier passage, et depuis le début de la session. */
  max = 0;
  peak = 0;
  alerts = 0;
  crushed = 0;

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.grid.clear();
    this.zones.clear();
    this.next = 0;
    this.max = 0;
    this.peak = 0;
    this.alerts = 0;
    this.crushed = 0;
  }

  /** Densité équivalente en un point (personnes/m²), d'après le dernier relevé. */
  at(x: number, z: number): number {
    return this.grid.get(x, z, 2, 0);
  }

  update(): void {
    const core = this.core;
    const now = core.now;
    if (now < this.next) return;
    this.next = now + T.DENSITY_EVERY;
    const grid = this.grid;
    grid.clear();
    const list = core.ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.dormant || p.vehicleId !== 0) continue;
      grid.add(p.x, p.z, 0, 1);
    }
    const data = grid.data;
    const loco = core.ctx.service<LocomotionLike>('people.locomotion');
    const members = core.members;
    const brains = core.brains;
    const dense = 3 * AREA;
    // compression : seulement là où l'on est déjà serré
    if (loco && typeof loco.pressureOf === 'function') {
      for (let i = 0; i < members.length; i++) {
        const p = members[i]!;
        const s = grid.at(p.x, p.z);
        if (s >= 0 && data[s * 3]! >= dense) data[s * 3 + 1] = data[s * 3 + 1]! + loco.pressureOf(p);
      }
    }
    let max = 0;
    for (let i = 0; i < grid.count; i++) {
      const o = grid.slot(i) * 3;
      const n = data[o]!;
      let d = n / AREA;
      if (n >= dense) d *= 1 + T.DENSITY_PRESSURE_K * Math.min(1, data[o + 1]! / n);
      data[o + 2] = d;
      if (d > max) max = d;
      if (d >= T.DENSITY_ALERT) this.hot(grid.centerX(grid.slot(i)), grid.centerZ(grid.slot(i)), d, n, now);
    }
    this.max = max;
    if (max > this.peak) this.peak = max;
    // par personne : densité relevée, peur, écrasement
    const hs = T.DENSITY_EVERY;
    for (let i = 0; i < members.length; i++) {
      const p = members[i]!;
      const b = brains[i]!;
      const s = grid.at(p.x, p.z);
      const d = s >= 0 ? data[s * 3 + 2]! : 0;
      b.density = d;
      if (d < 3) continue;
      const tune = T.PROFILE[p.profile ?? 'pacifique'];
      p.fear = Math.min(1, p.fear + (d >= 4 ? 0.05 : 0.02) * hs * tune.fearK);
      if (b.nextThink > now + 0.3) b.nextThink = now + 0.3 * core.rngEmo.next();
      if (d >= T.DENSITY_DANGER && p.posture !== 'down' && core.rngEmo.next() < T.CRUSH_PER_PERSON * hs * 10) this.crush(p);
    }
    // zones retombées sous le seuil depuis 5 s : fin d'alerte
    const zones = this.zones.items;
    for (let i = 0; i < zones.length; i++) {
      const zne = zones[i]!;
      if (zne.id === 1 && now - zne.b > 5) {
        zne.id = 0;
        this.emit('fin', zne.x, zne.z, this.at(zne.x, zne.z), 0);
      }
    }
  }

  private hot(x: number, z: number, d: number, people: number, now: number): void {
    const core = this.core;
    let zone = this.zones.near(x, z, 9, -Infinity);
    if (zone !== null && zone.id === 0 && now - zone.b > 5) {
      // ancienne zone refroidie : nouvelle montée
      zone.t = now;
      zone.x = x;
      zone.z = z;
    }
    if (zone === null) zone = this.zones.add(x, z, now, 0, -1e9, now);
    zone.b = now;
    const danger = d >= T.DENSITY_DANGER;
    if (now - zone.t < T.DENSITY_HOLD) return;
    if (now - zone.a < T.DENSITY_REARM * (danger ? 0.5 : 1)) return;
    zone.a = now;
    zone.id = 1;
    this.alerts++;
    this.emit(danger ? 'danger' : 'alerte', x, z, d, people);
    core.director.addTension(T.DENSITY_TENSION * (danger ? 2 : 1), x, z, danger ? 'compression_danger' : 'compression');
    core.voices.call('Ne poussez pas !', x, z, 4);
    core.ctx.radio.say({
      channel: 'commandement', from: 'Salle', priority: 2,
      text: (danger ? 'Danger, mouvement de foule' : 'Alerte compression') + ', ' + core.ctx.world.sectorName(x, z) + ' : ' + d.toFixed(1).replace('.', ',') + ' personnes au mètre carré. Ouvrez les issues.',
    });
  }

  private emit(level: DensityEvent['level'], x: number, z: number, d: number, people: number): void {
    const ev = this.ev;
    ev.level = level;
    ev.x = x;
    ev.z = z;
    ev.density = d;
    ev.people = people;
    this.core.ctx.events.emitAny(DENSITY_EVENT, ev);
  }

  /** Blessure par écrasement. */
  private crush(p: Person): void {
    const core = this.core;
    this.crushed++;
    core.ctx.health.hurt(p, { amount: 14 + 22 * core.rngEmo.next(), kind: 'crush', sourceId: 0, x: p.x, z: p.z, zone: 0.6 });
    if (p.injury === 'serious' || p.injury === 'critical') {
      const incidents = core.ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents && typeof incidents.open === 'function') {
        try {
          incidents.open('blesse', p.x, p.z, 'person', p.id, p.injury === 'critical' ? 3 : 2);
        } catch (err) {
          console.error('[crowd] ouverture d’incident impossible', err);
        }
      }
    }
  }

  /** Cherche l'issue : vers la direction la moins dense et libre. false si l'on est bien où l'on est. */
  escape(p: Person, b: CrowdBrain): boolean {
    const core = this.core;
    const world = core.ctx.world;
    let best = b.density - 0.6;
    let found = false;
    for (let k = 0; k < 8; k++) {
      const a = k * 0.7854 + b.phase;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const x1 = p.x + dx * 4;
      const z1 = p.z + dz * 4;
      if (!world.isFree(x1, z1, 0.3)) continue;
      const x2 = p.x + dx * 9;
      const z2 = p.z + dz * 9;
      const free2 = world.isFree(x2, z2, 0.3);
      const d = Math.max(this.at(x1, z1), free2 ? this.at(x2, z2) : 6) + (free2 ? 0 : 0.5);
      if (d < best) {
        best = d;
        b.tx = free2 ? x2 : x1;
        b.tz = free2 ? z2 : z1;
        found = true;
      }
    }
    if (found) b.path = null;
    return found;
  }
}
