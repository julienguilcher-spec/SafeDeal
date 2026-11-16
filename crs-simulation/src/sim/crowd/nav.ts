/* =====================================================================================
 * FOULE — navigation : itinéraires par les rues (ctx.world.findPath) calculés à la demande, quelques-uns
 * par pas, et partagés entre les membres d'un groupe ; issues de la dispersion (bouches de métro des
 * stations ouvertes, rues qui s'éloignent).
 * ===================================================================================== */

import type { Person, Vec2 } from '@/core/contracts';
import type { CrowdExit } from './api';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import * as T from './tuning';

export class Nav {
  readonly exits: CrowdExit[] = [];
  exitsDirty = true;
  private exitsAt = -1e9;
  private exitsX = 0;
  private exitsZ = 0;
  private queue: CrowdBrain[] = [];
  private head = 0;
  private readonly cache = new Map<number, number[] | null>();
  private readonly scratch: number[] = [];
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly rand = (): number => this.core.rngArrive.next();
  /** Itinéraires calculés depuis le début de la session (diagnostic). */
  computed = 0;

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.exits.length = 0;
    this.exitsDirty = true;
    this.exitsAt = -1e9;
    this.queue = [];
    this.head = 0;
    this.cache.clear();
    this.computed = 0;
  }

  /** Itinéraire de A à B, sans le point de départ ; null si la ligne droite suffit ou s'il n'y a pas de chemin. */
  compute(ax: number, az: number, bx: number, bz: number): number[] | null {
    const s = this.scratch;
    this.computed++;
    if (!this.core.ctx.world.findPath(ax, az, bx, bz, 'foot', s) || s.length < 6) return null;
    const out: number[] = [];
    for (let i = 2; i < s.length; i += 2) {
      const x = s[i]!;
      const z = s[i + 1]!;
      const n = out.length;
      // points d'accroche confondus avec le départ ou entre eux : inutiles
      if (n === 0 ? Math.hypot(x - ax, z - az) < 1.5 : Math.hypot(x - out[n - 2]!, z - out[n - 1]!) < 0.8) continue;
      out.push(x, z);
    }
    return out.length >= 2 ? out : null;
  }

  /** Itinéraire commun à tous ceux qui partent du même endroit vers le même bloc du cortège. */
  shared(key: number, ax: number, az: number, bx: number, bz: number): number[] | null {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    if (this.cache.size > 4096) this.cache.clear();
    const path = this.compute(ax, az, bx, bz);
    this.cache.set(key, path);
    return path;
  }

  /** Demande un itinéraire vers (b.tx, b.tz) ; il sera calculé dans les pas suivants. */
  request(b: CrowdBrain): void {
    if (b.pathPending) return;
    b.pathPending = true;
    b.path = null;
    this.queue.push(b);
  }

  /** Calcule quelques itinéraires en attente. */
  process(): void {
    const q = this.queue;
    let budget = T.PATH_BUDGET;
    while (this.head < q.length && budget > 0) {
      const b = q[this.head++]!;
      b.pathPending = false;
      if (b.index < 0) continue;
      const p = b.person;
      // le groupe partage l'itinéraire de celui qui l'a demandé en premier
      const g = b.group >= 0 ? this.core.groups[b.group] : undefined;
      if (g && g.path && g.exit === b.exit && b.exit >= 0) {
        b.path = g.path;
        b.pathI = this.entryIndex(g.path, p.x, p.z);
        continue;
      }
      b.path = this.compute(p.x, p.z, b.tx, b.tz);
      b.pathI = 0;
      if (g && b.exit >= 0) {
        g.path = b.path;
        g.exit = b.exit;
      }
      budget--;
    }
    if (this.head >= q.length) {
      q.length = 0;
      this.head = 0;
    } else if (this.head > 256) {
      q.splice(0, this.head);
      this.head = 0;
    }
  }

  /** Sommet d'un itinéraire partagé par lequel une personne déjà en chemin doit le reprendre. */
  private entryIndex(path: number[], x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i += 2) {
      const d = (path[i]! - x) * (path[i]! - x) + (path[i + 1]! - z) * (path[i + 1]! - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return Math.min(best >> 1, (path.length >> 1) - 1);
  }

  // ───────────────────────────── issues ─────────────────────────────

  /** Recalcule les issues autour d'un point (centre de la foule). */
  rebuildExits(cx: number, cz: number): void {
    const core = this.core;
    const ctx = core.ctx;
    this.exitsDirty = false;
    this.exitsAt = core.now;
    this.exitsX = cx;
    this.exitsZ = cz;
    const exits = this.exits;
    exits.length = 0;
    for (const s of core.metro.stations) {
      if (!s.open) continue;
      for (let e = 0; e + 1 < s.entrances.length; e += 2) {
        const x = s.entrances[e]!;
        const z = s.entrances[e + 1]!;
        if (Math.hypot(x - cx, z - cz) > T.LEAVE_METRO_RADIUS + 160) continue;
        exits.push({ index: exits.length, kind: 'metro', x, z, stationId: s.id, open: true });
      }
    }
    const b = ctx.world.bounds;
    const a0 = core.rngArrive.next() * Math.PI * 2;
    const path = this.scratch;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k / 8) * Math.PI * 2;
      const x = Math.min(b.maxX - 6, Math.max(b.minX + 6, cx + Math.sin(a) * T.LEAVE_STREET_DIST));
      const z = Math.min(b.maxZ - 6, Math.max(b.minZ + 6, cz + Math.cos(a) * T.LEAVE_STREET_DIST));
      if (!ctx.world.randomFreePoint(x, z, 30, 'sidewalk', this.rand, this.tmp)) continue;
      const px = this.tmp.x;
      const pz = this.tmp.z;
      const d = Math.hypot(px - cx, pz - cz);
      if (d < T.LEAVE_STREET_DIST * 0.5) continue;
      if (!ctx.world.findPath(cx, cz, px, pz, 'foot', path)) continue;
      let len = 0;
      for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      if (len > d * 2.6 + 60) continue;
      exits.push({ index: exits.length, kind: 'rue', x: px, z: pz, stationId: 0, open: true });
    }
    if (exits.length === 0) exits.push({ index: 0, kind: 'rue', x: cx + T.LEAVE_STREET_DIST, z: cz, stationId: 0, open: true });
    // les groupes repartiront avec des issues recalculées
    for (const g of core.groups) {
      g.exit = -1;
      g.path = null;
    }
  }

  /** Issue retenue par une personne : la moitié gagne une bouche de métro à moins de 300 m (bible F.2). */
  chooseExit(p: Person, b: CrowdBrain): number {
    const core = this.core;
    if (this.exitsDirty || core.now - this.exitsAt > 90 * core.timeScale || Math.hypot(p.x - this.exitsX, p.z - this.exitsZ) > 320) {
      const c = core.director;
      this.rebuildExits(c.present > 0 && Math.hypot(p.x - c.centerX, p.z - c.centerZ) < 250 ? c.centerX : p.x, c.present > 0 && Math.hypot(p.x - c.centerX, p.z - c.centerZ) < 250 ? c.centerZ : p.z);
    }
    const g = b.group >= 0 ? core.groups[b.group] : undefined;
    if (g && g.exit >= 0 && g.exit < this.exits.length && this.exits[g.exit]!.open) return g.exit;
    const exits = this.exits;
    const rng = core.rngThink;
    let best = -1;
    let bestScore = -Infinity;
    const wantMetro = rng.next() < T.LEAVE_METRO_SHARE;
    for (let i = 0; i < exits.length; i++) {
      const e = exits[i]!;
      if (!e.open) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      let score = -d * (0.6 + rng.next() * 0.8);
      if (e.kind === 'metro') score += wantMetro && d <= T.LEAVE_METRO_RADIUS ? 400 : -500;
      // on ne part pas vers les forces de l'ordre ni vers un danger connu
      if (b.threatUntil > core.now) {
        const ax = e.x - p.x;
        const az = e.z - p.z;
        const tx = b.threatX - p.x;
        const tz = b.threatZ - p.z;
        if (ax * tx + az * tz > 0.5 * d * Math.hypot(tx, tz)) score -= 260;
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (g && best >= 0) g.exit = best;
    return best;
  }

  /** Les issues d'une station que l'on vient de fermer ne sont plus valables. */
  closeStationExits(stationId: number): void {
    for (const e of this.exits) if (e.stationId === stationId) e.open = false;
  }
}
