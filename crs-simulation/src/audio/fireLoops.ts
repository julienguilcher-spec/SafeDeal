/* =====================================================================================
 * Boucles attachées au feu et au gaz.
 *
 * Feux : une boucle « feu » par foyer signalé ('fire:started'), coupée par 'fire:out', par
 * l'extinction constatée (ctx.hazards.fireAt, état de l'objet ou du véhicule) ou, à défaut, au
 * bout d'une durée maximale. Les foyers trop lointains restent virtuels (réserve de voix).
 * Gaz : voir GasLoops en fin de fichier.
 * ===================================================================================== */

import type { EntityId, EntityKind, GameContext } from '@/core/contracts';
import type { AudioEngine } from './engine';

interface Fire {
  x: number;
  z: number;
  kind: EntityKind | 'ground';
  targetId: EntityId;
  handle: number;
  bornAt: number;
  /** Le feu a été vu allumé par un relevé : on peut donc croire un relevé qui le dit éteint. */
  seen: boolean;
}

const MAX_FIRES = 24;
const MAX_AGE = 240;

export class FireLoops {
  private readonly fires: Fire[] = [];
  private time = 0;
  private pollAt = 0;

  constructor(private readonly ctx: GameContext, private readonly engine: AudioEngine) {}

  /** Nombre de foyers suivis (débogage). */
  get count(): number {
    return this.fires.length;
  }

  add(x: number, z: number, kind: EntityKind | 'ground', targetId: EntityId): void {
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i]!;
      if (targetId !== 0 && f.targetId === targetId) return;
      const dx = f.x - x;
      const dz = f.z - z;
      if (dx * dx + dz * dz < 2.5 * 2.5) return; // même foyer : une seule boucle
    }
    if (this.engine.hasLoopNear('feu', x, z, 2.5)) return;
    if (this.fires.length >= MAX_FIRES) this.removeAt(0, 0.5);
    const y = this.ctx.world.heightAt(x, z) + 0.5;
    const handle = this.engine.play('feu', { x, y, z, loop: true, volume: kind === 'vehicle' ? 1 : 0.8 });
    if (handle) this.fires.push({ x, z, kind, targetId, handle, bornAt: this.time, seen: false });
  }

  remove(x: number, z: number, targetId: EntityId): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]!;
      const dx = f.x - x;
      const dz = f.z - z;
      if ((targetId !== 0 && f.targetId === targetId) || dx * dx + dz * dz < 3.5 * 3.5) this.removeAt(i, 1.2);
    }
  }

  private removeAt(i: number, fade: number): void {
    this.engine.stop(this.fires[i]!.handle, fade);
    this.fires.splice(i, 1);
  }

  frame(dt: number): void {
    this.time += dt;
    if (this.time < this.pollAt) return;
    this.pollAt = this.time + 1;
    const ctx = this.ctx;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]!;
      let burning = 0;
      if (f.kind === 'vehicle') {
        const v = ctx.vehicles.get(f.targetId);
        if (v) {
          burning = v.burning;
          f.x = v.x;
          f.z = v.z;
          this.engine.setVoicePosition(f.handle, v.x, v.y + 0.8, v.z);
        }
      } else if (f.kind === 'prop') {
        const p = ctx.props.get(f.targetId);
        if (p) burning = p.burning;
      } else if (f.kind === 'shop') {
        const s = ctx.props.shop(f.targetId);
        if (s) burning = s.burning;
      }
      burning = Math.max(burning, ctx.hazards.fireAt(f.x, f.z));
      if (burning > 0.02) f.seen = true;
      else if (f.seen || this.time - f.bornAt > MAX_AGE) this.removeAt(i, 1.5);
    }
  }

  reset(): void {
    for (let i = 0; i < this.fires.length; i++) this.engine.stop(this.fires[i]!.handle, 0.2);
    this.fires.length = 0;
    this.pollAt = 0;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Gaz : une boucle « gaz_sifflement » par grenade ou palet lacrymogène en train d'émettre
 * (Projectile.emitting) à portée d'oreille — les six plus proches —, qui suit le projectile
 * tant qu'il roule et se tait quand il cesse d'émettre ou disparaît.
 * ───────────────────────────────────────────────────────────────────────────────────── */

interface Hiss { projectileId: EntityId; handle: number }

const MAX_HISS = 6;
const HISS_RADIUS = 45;

export class GasLoops {
  private readonly list: Hiss[] = [];
  private readonly pickIds: number[] = [];
  private readonly pickDist: number[] = [];
  private time = 0;
  private scanAt = 0;

  constructor(private readonly ctx: GameContext, private readonly engine: AudioEngine) {}

  get count(): number {
    return this.list.length;
  }

  frame(dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const eng = this.engine;
    // suivi : position à chaque image, arrêt dès que l'émission cesse
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]!;
      const p = ctx.projectiles.get(h.projectileId);
      if (!p || !p.emitting) {
        eng.stop(h.handle, 0.6);
        this.list.splice(i, 1);
      } else {
        eng.setVoicePosition(h.handle, p.x, p.y + 0.1, p.z);
      }
    }
    if (this.time < this.scanAt) return;
    this.scanAt = this.time + 0.25;
    // les MAX_HISS projectiles émetteurs les plus proches de l'auditeur
    const all = ctx.projectiles.list;
    const ids = this.pickIds;
    const dist = this.pickDist;
    ids.length = 0;
    dist.length = 0;
    for (let i = 0; i < all.length; i++) {
      const p = all[i]!;
      if (!p.emitting) continue;
      const dx = p.x - eng.lx;
      const dz = p.z - eng.lz;
      const d2 = dx * dx + dz * dz;
      if (d2 > HISS_RADIUS * HISS_RADIUS) continue;
      let j = ids.length;
      while (j > 0 && dist[j - 1]! > d2) j--;
      if (j >= MAX_HISS) continue;
      ids.splice(j, 0, p.id);
      dist.splice(j, 0, d2);
      if (ids.length > MAX_HISS) {
        ids.pop();
        dist.pop();
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (ids.indexOf(this.list[i]!.projectileId) < 0) {
        eng.stop(this.list[i]!.handle, 0.4);
        this.list.splice(i, 1);
      }
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      let known = false;
      for (let k = 0; k < this.list.length; k++) if (this.list[k]!.projectileId === id) known = true;
      if (known) continue;
      const p = ctx.projectiles.get(id);
      if (!p || eng.hasLoopNear('gaz_sifflement', p.x, p.z, 1.5)) continue;
      const handle = eng.play('gaz_sifflement', { x: p.x, y: p.y + 0.1, z: p.z, loop: true, pitch: 0.9 + 0.025 * (id % 9) });
      if (handle) this.list.push({ projectileId: id, handle });
    }
  }

  reset(): void {
    for (let i = 0; i < this.list.length; i++) this.engine.stop(this.list[i]!.handle, 0.1);
    this.list.length = 0;
    this.scanAt = 0;
  }
}
