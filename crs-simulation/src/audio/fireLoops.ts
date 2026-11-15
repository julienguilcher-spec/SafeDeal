/* =====================================================================================
 * Feux : une boucle « feu » par foyer signalé ('fire:started'), coupée par 'fire:out', par
 * l'extinction constatée (ctx.hazards.fireAt, état de l'objet ou du véhicule) ou, à défaut, au
 * bout d'une durée maximale. Les foyers trop lointains restent virtuels (réserve de voix).
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
