/* =====================================================================================
 * COMMANDEMENT — aides de test (réservées aux tests : aucun autre module n'est importé ici, les
 * tests passent eux-mêmes les fabriques des modules qu'ils composent).
 *
 *   const t = await startCommand([world, people, items, hazards, law, props, vehicles], { mode: 'test' });
 *   const cie = t.units.createCompany({ x: 0, z: 240, heading: Math.PI });
 *   t.step(60);
 *   expect(t.api.stateOf(cie.squad.id)!.phase).toBe('conduite');
 *
 * Doublures des services étendus qui n'ont pas encore de module (incidents) ou dont le module n'est
 * pas composé dans l'essai (fermeture de rues) : conformes à src/core/extensions.ts, sans autre effet
 * que de tenir leur registre.
 * ===================================================================================== */

import type { CrowdPhase, DirectorApi, EntityId, EntityKind, GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Incident, IncidentKind, IncidentMeans, IncidentsApi, RoadClosure, TrafficControlApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import type { PoliceFormationApi, PoliceStatusApi, PoliceUnitsApi } from '../api';
import { POLICE_FORMATION_SERVICE, POLICE_STATUS_SERVICE, POLICE_UNITS_SERVICE } from '../api';
import { PoliceSystem } from '../system';
import { POLICE_COMMAND_SERVICE } from './api';
import type { CommandApi } from './api';
import { CommandSystem } from './system';

export interface CostStats { mean: number; p95: number; max: number; steps: number }

export interface CommandTest {
  t: TestContext;
  ctx: GameContext;
  police: PoliceSystem;
  command: CommandSystem;
  units: PoliceUnitsApi;
  status: PoliceStatusApi;
  formation: PoliceFormationApi;
  api: CommandApi;
  /** Avance la simulation (pas de 1/30 s par défaut). */
  step(seconds: number): void;
  /** Avance par tranches de `slice` secondes en appelant `each` après chacune ; s'arrête si `each` retourne true. */
  run(seconds: number, slice: number, each: (elapsed: number) => boolean | void): number;
  /** Coût du système de commandement par pas depuis le dernier appel (ms). */
  cost(): CostStats;
}

export interface CommandTestOptions {
  seed?: number;
  /** Pas de simulation (s). Défaut 1/30. */
  dt?: number;
  systems?: readonly GameSystem[];
}

/** Démarre une session d'essai avec les modules donnés, l'IA de police et le commandement. */
export async function startCommand(modules: readonly ModuleFactory[], config: Partial<SessionConfig> = {}, options: CommandTestOptions = {}): Promise<CommandTest> {
  const police = new PoliceSystem();
  const command = new CommandSystem();
  const samples: number[] = [];
  const probe: GameSystem = {
    id: 'test.command.probe',
    order: SystemOrder.CONTROL + 6,
    update: () => {
      if (samples.length < 400000) samples.push(command.lastStepMs);
    },
  };
  const t = createTestContext({ seed: options.seed ?? 7, modules, systems: [police, command, probe, ...(options.systems ?? [])] });
  await t.start(config);
  const ctx = t.ctx;
  const dt = options.dt ?? 1 / 30;
  return {
    t,
    ctx,
    police,
    command,
    units: ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE),
    status: ctx.require<PoliceStatusApi>(POLICE_STATUS_SERVICE),
    formation: ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE),
    api: ctx.require<CommandApi>(POLICE_COMMAND_SERVICE),
    step: (seconds) => t.step(seconds, dt),
    run: (seconds, slice, each) => {
      let elapsed = 0;
      while (elapsed < seconds - 1e-9) {
        t.step(slice, dt);
        elapsed += slice;
        if (each(elapsed) === true) break;
      }
      return elapsed;
    },
    cost: () => {
      const n = samples.length;
      if (n === 0) return { mean: 0, p95: 0, max: 0, steps: 0 };
      let sum = 0;
      let max = 0;
      for (let i = 0; i < n; i++) {
        sum += samples[i];
        if (samples[i] > max) max = samples[i];
      }
      const sorted = samples.slice().sort((a, b) => a - b);
      const out = { mean: sum / n, p95: sorted[Math.floor(n * 0.95)], max, steps: n };
      samples.length = 0;
      return out;
    },
  };
}

// ───────────────────────────── doublure : incidents ─────────────────────────────

/** Registre d'incidents minimal (IncidentsApi) : le cadre de mission n'existe pas encore. */
export class TestIncidents implements IncidentsApi {
  readonly list: Incident[] = [];
  playerIncidentId = 0;
  private nextId = 1;
  /** Journal des affectations : { id, means, squadId, t }. */
  readonly assignments: { id: number; means: IncidentMeans; squadId: number; t: number }[] = [];
  /** Journal des clôtures : { id, resolved, t }. */
  readonly closed: { id: number; resolved: boolean; t: number }[] = [];

  constructor(private readonly ctx: GameContext) {}

  get(id: number): Incident | undefined {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
    return undefined;
  }

  open(kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency: 1 | 2 | 3 = 1): Incident {
    const inc: Incident = {
      id: this.nextId++, kind, label: kind, x, z, targetKind, targetId, urgency, severity: 0.2 * urgency, state: 'ouvert',
      createdAt: this.ctx.clock.now, means: '', squadId: 0, progress: 0,
    };
    this.list.push(inc);
    return inc;
  }

  assign(id: number, means: IncidentMeans, squadId = 0): boolean {
    const inc = this.get(id);
    if (!inc || inc.state === 'resolu' || inc.state === 'echoue' || means === '') return false;
    if (squadId !== 0 && !this.ctx.squads.get(squadId)) return false;
    inc.means = means;
    inc.squadId = squadId;
    inc.state = 'assigne';
    this.assignments.push({ id, means, squadId, t: this.ctx.clock.now });
    return true;
  }

  unassign(id: number): void {
    const inc = this.get(id);
    if (!inc || inc.state === 'resolu' || inc.state === 'echoue') return;
    inc.means = '';
    inc.squadId = 0;
    inc.state = 'ouvert';
  }

  close(id: number, resolved: boolean, _byId: EntityId): void {
    const inc = this.get(id);
    if (!inc) return;
    inc.state = resolved ? 'resolu' : 'echoue';
    inc.progress = resolved ? 1 : inc.progress;
    this.closed.push({ id, resolved, t: this.ctx.clock.now });
  }

  nearest(x: number, z: number, radius: number, kind?: IncidentKind): Incident | null {
    let best: Incident | null = null;
    let bestD = radius;
    for (let i = 0; i < this.list.length; i++) {
      const inc = this.list[i];
      if (inc.state !== 'ouvert' || (kind && inc.kind !== kind)) continue;
      const d = Math.hypot(inc.x - x, inc.z - z);
      if (d <= bestD) {
        bestD = d;
        best = inc;
      }
    }
    return best;
  }
}

// ───────────────────────────── doublure : fermeture de rues ─────────────────────────────

/** Registre de fermetures de rues minimal (TrafficControlApi), sans circulation simulée. */
export class TestTraffic implements TrafficControlApi {
  readonly closures: RoadClosure[] = [];
  /** Toutes les fermetures demandées depuis le début (y compris rouvertes). */
  readonly asked: { id: number; x: number; z: number; byId: EntityId; squadId: number; t: number; edgeId: number }[] = [];
  readonly opened: number[] = [];
  private nextId = 1;
  private readonly road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };

  constructor(private readonly ctx: GameContext) {}

  isClosed(edgeId: number): boolean {
    for (let i = 0; i < this.closures.length; i++) if (this.closures[i].edgeId === edgeId) return true;
    return false;
  }

  closeRoad(x: number, z: number, byId: EntityId, squadId = 0): RoadClosure | null {
    const road = this.road;
    if (!this.ctx.world.nearestRoad(x, z, road, 40)) return null;
    for (let i = 0; i < this.closures.length; i++) if (this.closures[i].edgeId === road.edgeId) return this.closures[i];
    const c: RoadClosure = { id: this.nextId++, edgeId: road.edgeId, x: road.x, z: road.z, heading: road.heading, squadId, createdAt: this.ctx.clock.now };
    this.closures.push(c);
    this.asked.push({ id: c.id, x: c.x, z: c.z, byId, squadId, t: c.createdAt, edgeId: c.edgeId });
    return c;
  }

  closeArea(x: number, z: number, _radius: number, byId: EntityId): RoadClosure[] {
    const c = this.closeRoad(x, z, byId);
    return c ? [c] : [];
  }

  open(closureId: number): void {
    for (let i = 0; i < this.closures.length; i++) {
      if (this.closures[i].id !== closureId) continue;
      this.closures.splice(i, 1);
      this.opened.push(closureId);
      return;
    }
  }

  openAll(): void {
    for (let i = 0; i < this.closures.length; i++) this.opened.push(this.closures[i].id);
    this.closures.length = 0;
  }

  countNear(): { moving: number; stopped: number } {
    return { moving: 0, stopped: 0 };
  }
}

/** Système qui publie les doublures dans le contexte (à passer dans `options.systems`). */
export function createTestServices(what: { incidents?: boolean; traffic?: boolean }): { system: GameSystem; incidents: () => TestIncidents; traffic: () => TestTraffic } {
  let incidents: TestIncidents | null = null;
  let traffic: TestTraffic | null = null;
  const system: GameSystem = {
    id: 'test.command.services',
    order: SystemOrder.RULES + 1,
    provide: (ctx: GameContext) => {
      if (what.incidents) {
        incidents = new TestIncidents(ctx);
        ctx.provide(EXT.incidents, incidents);
      }
      if (what.traffic) {
        traffic = new TestTraffic(ctx);
        ctx.provide(EXT.traffic, traffic);
      }
    },
    reset: () => {
      if (incidents) {
        incidents.list.length = 0;
        incidents.assignments.length = 0;
        incidents.closed.length = 0;
      }
      if (traffic) {
        traffic.closures.length = 0;
        traffic.asked.length = 0;
        traffic.opened.length = 0;
      }
    },
  };
  return { system, incidents: () => incidents!, traffic: () => traffic! };
}

// ───────────────────────────── doublure : directeur de foule ─────────────────────────────

export interface TestDirector extends DirectorApi {
  phase: CrowdPhase;
  tension: number;
  route: number[];
  headProgress: number;
}

/**
 * Directeur de foule scripté (DirectorApi) pour essayer le commandement sans le module de foule : parcours,
 * phase, tension et progression de la tête sont posés par le test.
 */
export function createTestDirector(route: number[], phase: CrowdPhase = 'rassemblement'): { system: GameSystem; director: TestDirector } {
  const director: TestDirector = {
    phase,
    tension: 0.1,
    tensionAt: () => director.tension,
    addTension: (amount: number) => {
      director.tension = Math.max(0, Math.min(1, director.tension + amount));
    },
    stats: { total: 300, present: 300, dispersed: 0, radicals: 0, injured: 0, arrested: 0 },
    route,
    headProgress: 0,
  };
  const system: GameSystem = {
    id: 'test.command.director',
    order: SystemOrder.RULES + 2,
    provide: (ctx: GameContext) => {
      ctx.director = director;
    },
  };
  return { system, director };
}
