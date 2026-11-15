/* =====================================================================================
 * Sons attachés aux véhicules : moteurs pilotés en continu, sirènes, klaxons, canon à eau.
 *
 *   - service 'audio.engine' : create(vehicleId) → { setRpm, setLoad, setPosition, dispose } ;
 *   - sonorisation automatique : à défaut de moteur créé par un autre module, les véhicules les
 *     plus proches de l'auditeur (moteur en marche) reçoivent un moteur piloté par Vehicle.rpm
 *     et Vehicle.cmd.throttle ;
 *   - sirènes : boucles suivant l'événement 'vehicle:siren' ET l'état Vehicle.siren (relu deux
 *     fois par seconde), positions et vitesses (effet Doppler) mises à jour à chaque image ;
 *   - klaxon : boucle tenue tant que Vehicle.cmd.horn est vrai ;
 *   - canon à eau : boucle tenue tant que la tourelle tire ('vehicle:turret_fired').
 * ===================================================================================== */

import type { EntityId, GameContext, GameEvents, SoundId, Vehicle } from '@/core/contracts';
import type { EngineSound, EngineSoundService } from './api';
import type { AudioEngine, PlayExtra } from './engine';
import { EngineGraph, engineProfileFor, resolveRpm, type EngineProfile } from './engineGraph';
import type { Kit } from './kit';
import { collisionSound, sirenSound, type SoundChoice } from './mapping';
import { PRIORITY_HIGH, PRIORITY_NORMAL } from './voicePool';

/** Nombre de moteurs sonorisés automatiquement, et rayon d'écoute (m). */
const AUTO_ENGINES = 5;
const AUTO_RADIUS = 80;

class EngineVoice implements EngineSound {
  handle = 0;
  disposed = false;
  private graph: EngineGraph | null = null;
  private rpm: number;
  private load = 0;
  private appliedRpm = -1;
  private appliedLoad = -1;
  private x = 0; private y = 0; private z = 0;
  private lastMoveAt = -1;
  private readonly extra: PlayExtra;

  constructor(
    private readonly engine: AudioEngine,
    readonly vehicleId: EntityId,
    private readonly profile: EngineProfile,
    /** Moteur créé par un autre module (et non par la sonorisation automatique). */
    readonly external: boolean,
    private readonly onDispose: (e: EngineVoice) => void,
    x: number, y: number, z: number, priority: number,
  ) {
    this.rpm = profile.idle;
    this.x = x; this.y = y; this.z = z;
    this.extra = {
      doppler: true,
      priority,
      build: (k: Kit): number => {
        const m = k.gain(0, k.out);
        m.gain.setValueAtTime(0, k.t);
        m.gain.linearRampToValueAtTime(1, k.t + 0.25);
        this.graph = new EngineGraph(k, m, this.profile);
        this.graph.set(this.rpm, this.load, k.t, true);
        this.appliedRpm = resolveRpm(this.rpm, this.profile);
        this.appliedLoad = this.load;
        return Infinity;
      },
      onVirtual: (): void => {
        this.graph = null;
      },
    };
    this.handle = engine.play('moteur', { x, y, z, loop: true }, this.extra);
  }

  setRpm(rpm: number): void {
    this.rpm = rpm;
    this.apply();
  }

  setLoad(load: number): void {
    this.load = load > 0 ? (load > 1 ? 1 : load) : 0; // NaN → 0
    this.apply();
  }

  private apply(): void {
    if (!this.graph || this.disposed) return;
    const r = resolveRpm(this.rpm, this.profile);
    if (Math.abs(r - this.appliedRpm) < 3 + 0.003 * this.appliedRpm && Math.abs(this.load - this.appliedLoad) < 0.015) return;
    this.graph.set(this.rpm, this.load, this.engine.now);
    this.appliedRpm = r;
    this.appliedLoad = this.load;
  }

  setPosition(x: number, y: number, z: number): void {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    // vitesse estimée d'après le déplacement (effet Doppler)
    const now = this.engine.now;
    const dt = now - this.lastMoveAt;
    if (this.lastMoveAt >= 0 && dt > 0.005 && dt < 0.5) {
      this.engine.setVoiceVelocity(this.handle, (x - this.x) / dt, (z - this.z) / dt);
    }
    this.lastMoveAt = now;
    this.x = x; this.y = y; this.z = z;
    this.engine.setVoicePosition(this.handle, x, y, z);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stop(this.handle, 0.2);
    this.graph = null;
    this.onDispose(this);
  }
}

interface Attached { vehicleId: EntityId; handle: number; id: SoundId; until: number }

export class VehicleAudio implements EngineSoundService {
  private readonly sirens: Attached[] = [];
  private readonly horns: Attached[] = [];
  private readonly water: Attached[] = [];
  private readonly engines: EngineVoice[] = [];
  private readonly choice: SoundChoice = { id: '', volume: 1, pitch: 1 };
  private readonly pickIds: number[] = [];
  private readonly pickDist: number[] = [];
  private scanAt = 0;
  private time = 0;
  private lastCollisionAt = -1;
  private lastCollisionVehicle = 0;
  private readonly removeEngine = (e: EngineVoice): void => {
    const i = this.engines.indexOf(e);
    if (i >= 0) this.engines.splice(i, 1);
  };

  constructor(private readonly ctx: GameContext, private readonly engine: AudioEngine) {}

  // ───────────────────────────── service 'audio.engine' ─────────────────────────────

  create(vehicleId: EntityId): EngineSound {
    // un moteur extérieur remplace la sonorisation automatique de ce véhicule
    const auto = this.findEngine(vehicleId);
    if (auto && !auto.external) auto.dispose();
    return this.spawnEngine(vehicleId, true);
  }

  private spawnEngine(vehicleId: EntityId, external: boolean): EngineVoice {
    const v = this.ctx.vehicles.get(vehicleId);
    const profile = engineProfileFor(v ? v.kind : 'voiture');
    const pv = this.ctx.player.vehicle();
    const priority = pv && pv.id === vehicleId ? PRIORITY_HIGH : PRIORITY_NORMAL;
    const e = new EngineVoice(
      this.engine, vehicleId, profile, external, this.removeEngine,
      v ? v.x : this.engine.lx, v ? v.y + 0.8 : this.engine.ly, v ? v.z : this.engine.lz, priority,
    );
    this.engines.push(e);
    return e;
  }

  private findEngine(vehicleId: EntityId): EngineVoice | null {
    for (let i = 0; i < this.engines.length; i++) if (this.engines[i]!.vehicleId === vehicleId) return this.engines[i]!;
    return null;
  }

  // ───────────────────────────── événements ─────────────────────────────

  onSiren(p: GameEvents['vehicle:siren']): void {
    const v = this.ctx.vehicles.get(p.id);
    this.syncSiren(p.id, v ? sirenSound(v.kind, v.faction, p.siren) : null, v);
  }

  onRemoved(id: EntityId): void {
    this.detach(this.sirens, id, 0.1);
    this.detach(this.horns, id, 0.05);
    this.detach(this.water, id, 0.2);
    const e = this.findEngine(id);
    if (e && !e.external) e.dispose();
  }

  onTurret(p: GameEvents['vehicle:turret_fired']): void {
    const v = this.ctx.vehicles.get(p.id);
    if (!v) return;
    const t = v.def && v.def.turrets ? v.def.turrets[p.turret] : undefined;
    const kind = t ? t.kind : v.kind === 'canon_eau' ? 'canon_eau' : 'lance_grenades';
    if (kind === 'canon_eau') {
      const a = this.find(this.water, p.id);
      if (a) {
        a.until = this.time + 0.7;
      } else if (!this.engine.hasLoopNear('canon_eau', v.x, v.z, 5)) {
        const handle = this.engine.play('canon_eau', { x: v.x, y: v.y + 2.5, z: v.z, loop: true });
        if (handle) this.water.push({ vehicleId: p.id, handle, id: 'canon_eau', until: this.time + 0.7 });
      }
    } else if (kind === 'lance_grenades') {
      this.engine.play('lanceur_tir', { x: v.x, y: v.y + 2.5, z: v.z });
    }
  }

  onCollision(p: GameEvents['vehicle:collision']): void {
    // un même accrochage émet souvent plusieurs événements d'affilée
    if (p.vehicleId === this.lastCollisionVehicle && this.time - this.lastCollisionAt < 0.3) return;
    const c = collisionSound(p.speed, p.otherKind, this.choice);
    if (!c) return;
    this.lastCollisionVehicle = p.vehicleId;
    this.lastCollisionAt = this.time;
    this.engine.play(c.id, { x: p.x, y: this.engine.ly, z: p.z, volume: c.volume, pitch: c.pitch });
  }

  // ───────────────────────────── boucles attachées ─────────────────────────────

  private find(list: Attached[], vehicleId: EntityId): Attached | null {
    for (let i = 0; i < list.length; i++) if (list[i]!.vehicleId === vehicleId) return list[i]!;
    return null;
  }

  private detach(list: Attached[], vehicleId: EntityId, fade: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.vehicleId === vehicleId) {
        this.engine.stop(list[i]!.handle, fade);
        list.splice(i, 1);
      }
    }
  }

  private syncSiren(vehicleId: EntityId, want: SoundId | null, v: Vehicle | undefined): void {
    const cur = this.find(this.sirens, vehicleId);
    if (cur && (cur.id !== want || !this.engine.alive(cur.handle))) {
      this.detach(this.sirens, vehicleId, 0.08);
    } else if (cur) {
      return;
    }
    if (!want || !v || v.dormant) return;
    if (this.engine.hasLoopNear(want, v.x, v.z, 4)) return; // un autre module la joue déjà
    const handle = this.engine.play(want, { x: v.x, y: v.y + 1.8, z: v.z, loop: true }, SIREN_EXTRA);
    if (handle) this.sirens.push({ vehicleId, handle, id: want, until: 0 });
  }

  // ───────────────────────────── par image ─────────────────────────────

  frame(dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const eng = this.engine;
    const list = ctx.vehicles.list;

    // klaxons : tenus tant que la commande l'est
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (!v.cmd || !v.cmd.horn || v.dormant) continue;
      if (this.find(this.horns, v.id)) continue;
      const dx = v.x - eng.lx;
      const dz = v.z - eng.lz;
      if (dx * dx + dz * dz > 220 * 220 || eng.hasLoopNear('klaxon', v.x, v.z, 3)) continue;
      const handle = eng.play('klaxon', { x: v.x, y: v.y + 0.8, z: v.z, loop: true, pitch: 0.92 + 0.02 * (v.id % 9) }, SIREN_EXTRA);
      if (handle) this.horns.push({ vehicleId: v.id, handle, id: 'klaxon', until: 0 });
    }
    for (let i = this.horns.length - 1; i >= 0; i--) {
      const a = this.horns[i]!;
      const v = ctx.vehicles.get(a.vehicleId);
      if (!v || !v.cmd || !v.cmd.horn || v.dormant) {
        eng.stop(a.handle, 0.05);
        this.horns.splice(i, 1);
      } else {
        this.follow(a.handle, v, 0.8);
      }
    }

    // sirènes
    for (let i = this.sirens.length - 1; i >= 0; i--) {
      const a = this.sirens[i]!;
      const v = ctx.vehicles.get(a.vehicleId);
      if (!v || v.siren === 0 || v.dormant) {
        eng.stop(a.handle, 0.1);
        this.sirens.splice(i, 1);
      } else {
        this.follow(a.handle, v, 1.8);
      }
    }

    // canon à eau : la boucle s'arrête quand la tourelle cesse de tirer
    for (let i = this.water.length - 1; i >= 0; i--) {
      const a = this.water[i]!;
      const v = ctx.vehicles.get(a.vehicleId);
      if (!v || this.time > a.until) {
        eng.stop(a.handle, 0.35);
        this.water.splice(i, 1);
      } else {
        this.follow(a.handle, v, 2.5);
      }
    }

    // moteurs automatiques : régime, charge, position
    for (let i = this.engines.length - 1; i >= 0; i--) {
      const e = this.engines[i]!;
      if (e.external) continue;
      const v = ctx.vehicles.get(e.vehicleId);
      if (!v || !v.engineOn || v.dormant) {
        e.dispose();
        continue;
      }
      const throttle = v.cmd ? Math.abs(v.cmd.throttle) : 0;
      let rpm = v.rpm;
      if (!(rpm > 0)) {
        // la physique ne renseigne pas le régime : estimation d'après la vitesse (valeur normalisée)
        const max = v.def && v.def.maxSpeed > 0 ? v.def.maxSpeed : 30;
        rpm = Math.min(1, 0.06 + 0.85 * (Math.abs(v.speed) / max) + 0.12 * throttle);
      }
      e.setRpm(rpm);
      e.setLoad(throttle);
      e.setPosition(v.x, v.y + 0.8, v.z);
    }

    if (this.time >= this.scanAt) {
      this.scanAt = this.time + 0.5;
      this.scan();
    }
  }

  private follow(handle: number, v: Vehicle, height: number): void {
    this.engine.setVoicePosition(handle, v.x, v.y + height, v.z);
    this.engine.setVoiceVelocity(handle, v.vx, v.vz);
  }

  /** Deux fois par seconde : état des sirènes et choix des véhicules dont on entend le moteur. */
  private scan(): void {
    const ctx = this.ctx;
    const eng = this.engine;
    const list = ctx.vehicles.list;
    const pv = ctx.player.vehicle();
    const ids = this.pickIds;
    const dist = this.pickDist;
    ids.length = 0;
    dist.length = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.dormant) continue;
      const dx = v.x - eng.lx;
      const dz = v.z - eng.lz;
      const d2 = dx * dx + dz * dz;
      if (v.siren !== 0 && d2 < 460 * 460) this.syncSiren(v.id, sirenSound(v.kind, v.faction, v.siren), v);
      if (!v.engineOn || v.state === 'wrecked' || v.state === 'burnt') continue;
      const mine = pv !== null && pv.id === v.id;
      if (!mine && d2 > AUTO_RADIUS * AUTO_RADIUS) continue;
      const score = mine ? -1 : d2;
      // insertion triée dans les AUTO_ENGINES plus proches
      let j = ids.length;
      while (j > 0 && dist[j - 1]! > score) j--;
      if (j < AUTO_ENGINES) {
        ids.splice(j, 0, v.id);
        dist.splice(j, 0, score);
        if (ids.length > AUTO_ENGINES) {
          ids.pop();
          dist.pop();
        }
      }
    }
    for (let i = this.engines.length - 1; i >= 0; i--) {
      const e = this.engines[i]!;
      if (!e.external && ids.indexOf(e.vehicleId) < 0) e.dispose();
    }
    for (let i = 0; i < ids.length; i++) {
      if (!this.findEngine(ids[i]!)) this.spawnEngine(ids[i]!, false);
    }
  }

  reset(): void {
    for (let i = this.engines.length - 1; i >= 0; i--) {
      const e = this.engines[i]!;
      if (!e.external) e.dispose();
    }
    for (const list of [this.sirens, this.horns, this.water]) {
      for (let i = 0; i < list.length; i++) this.engine.stop(list[i]!.handle, 0.1);
      list.length = 0;
    }
    this.scanAt = 0;
    this.lastCollisionAt = -1;
  }

  /** Nombre de moteurs, sirènes et klaxons actifs (débogage). */
  counts(): { engines: number; sirens: number; horns: number } {
    return { engines: this.engines.length, sirens: this.sirens.length, horns: this.horns.length };
  }
}

const SIREN_EXTRA: PlayExtra = { doppler: true };
