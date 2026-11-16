/* =====================================================================================
 * SECOURS OFFICIELS — système (ordre CONTROL + 30) : publie EXT.rescue (RescueApi), « rescue.ext »,
 * « rescue.records » et, avec le module des médecins de rue, le service de soins « roles.care ».
 *
 * À chaque pas : les patients en cours de soin sont tenus immobiles, la régulation fait partir les
 * équipages et les conduit (dispatch.ts), l'équipage du joueur secouriste est suivi (player.ts).
 * Les secouristes ne se défendent jamais : frappés ou visés, ils se replient.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, SessionConfig } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi, RescueCall, RescueKind } from '@/core/extensions';
import { RESCUE_EXT_SERVICE, RESCUE_RECORDS_SERVICE, RESCUE_SYSTEM_ID } from './api';
import type { CrewView, RescueExtApi, SafetyReport } from './api';
import { obtainCare } from './care';
import { createCareHandlers } from './care-handlers';
import { RescueKernel } from './crew';
import { CrewClear } from './crew-clear';
import { CrewDriver } from './crew-drive';
import { FireWork } from './crew-fire';
import { MedicalWork } from './crew-medical';
import { CrewPhases } from './crew-phases';
import { CrewTasks } from './crew-tasks';
import { Dispatcher } from './dispatch';
import { PlayerCrew } from './player';
import { RescueRadio } from './radio';
import { RecordsStore } from './records';
import { SafetyDesk } from './safety';
import { Spawner } from './spawn';
import type { Origin } from './spawn';
import { DEFAULT_TUNING } from './tuning';

export class RescueSystem implements GameSystem {
  readonly id = RESCUE_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 30;

  readonly kernel = new RescueKernel();
  private readonly records = new RecordsStore();
  private readonly safety = new SafetyDesk(this.kernel.tuning);
  private readonly spawner = new Spawner(this.kernel);
  private readonly tasks = new CrewTasks(this.kernel, this.spawner);
  private radio!: RescueRadio;
  private fire!: FireWork;
  private medical!: MedicalWork;
  dispatcher!: Dispatcher;
  private player!: PlayerCrew;
  readonly api: RescueApi;
  readonly ext: RescueExtApi;
  private readonly stagingOut: Origin = { x: 0, z: 0, heading: 0, length: 0, road: false };

  constructor() {
    const k = this.kernel;
    const self = this;
    this.api = {
      calls: k.calls,
      request: (kind: RescueKind, x: number, z: number, byId: EntityId, incidentId?: number): RescueCall =>
        this.dispatcher.request(kind, x, z, byId, incidentId ?? 0),
      cancel: (callId: number): void => this.dispatcher.cancel(callId),
    };
    this.ext = {
      tuning: k.tuning,
      crews: k.crews as readonly CrewView[],
      squadOf: (callId: number): number => {
        const c = this.dispatcher.callById(callId);
        return c && c.crew ? c.crew.squadId : 0;
      },
      assess: (kind: RescueKind, x: number, z: number, fromX: number, fromZ: number): Readonly<SafetyReport> =>
        this.safety.assess(kind, x, z, fromX, fromZ),
      stage: (kind: RescueKind, x: number, z: number, heading: number): CrewView | null => this.dispatcher.stage(kind, x, z, heading),
      get playerCallId(): number {
        return self.player ? self.player.callId : 0;
      },
    };
  }

  provide(ctx: GameContext): void {
    const k = this.kernel;
    k.ctx = ctx;
    k.rng = ctx.rng.fork('rescue');
    k.safety = this.safety;
    this.safety.bind(ctx);
    this.radio = new RescueRadio(ctx);
    this.fire = new FireWork(k, this.tasks, this.radio);
    this.medical = new MedicalWork(k, this.tasks, this.radio);
    const driver = new CrewDriver(k, this.spawner);
    const phases = new CrewPhases(k, this.spawner, this.tasks, this.fire, this.medical, this.radio, driver, new CrewClear(k, this.tasks));
    this.dispatcher = new Dispatcher(k, this.spawner, this.tasks, this.radio, this.records, driver, phases);
    this.player = new PlayerCrew(k, this.spawner, this.tasks, this.fire, this.medical, this.radio);
    this.player.dispatcher = this.dispatcher;
    this.dispatcher.player = this.player;
    ctx.provide(EXT.rescue, this.api);
    ctx.provide(RESCUE_EXT_SERVICE, this.ext);
    ctx.provide(RESCUE_RECORDS_SERVICE, this.records);
  }

  init(ctx: GameContext): void {
    const k = this.kernel;
    const { care, created } = obtainCare(ctx);
    k.care = care;
    if (created) {
      const handlers = createCareHandlers(ctx, care);
      for (let i = 0; i < handlers.length; i++) ctx.interactions.register(handlers[i]);
    }
    // un secouriste frappé par un tiers : c'est une prise à partie (deux faits au même endroit déclenchent le repli)
    ctx.events.on('person:hurt', (e) => {
      const p = ctx.people.get(e.id);
      if (!p || p.faction !== 'rescue' || e.info.sourceId === 0 || e.info.kind === 'burn' || e.info.kind === 'gas') return;
      const src = ctx.people.get(e.info.sourceId);
      if (!src || src.faction === 'rescue') return;
      this.safety.note(p.x, p.z);
      this.safety.note(p.x, p.z);
    });
    ctx.events.on('person:removed', (e) => {
      const crews = k.crews;
      for (let i = 0; i < crews.length; i++) {
        const members = crews[i].members;
        for (let j = members.length - 1; j >= 0; j--) if (members[j].p.id === e.id) members.splice(j, 1);
        if (crews[i].patientId === e.id) crews[i].patientId = 0;
      }
    });
    ctx.events.on('vehicle:removed', (e) => {
      const crews = k.crews;
      for (let i = 0; i < crews.length; i++) {
        const c = crews[i];
        if (c.vehicle && c.vehicle.id === e.id) {
          c.vehicle = null;
          c.onFoot = true;
        }
      }
    });
    ctx.events.on('session:started', (e) => this.configure(e.config));
  }

  /** Réglages de session : moyens engagés, délais, secours pré-positionnés. */
  private configure(config: SessionConfig): void {
    const k = this.kernel;
    const t = k.tuning;
    const extra = config.extra;
    if (!extra) return;
    const scale = extra['rescue.delayScale'];
    if (typeof scale === 'number' && scale >= 0) t.delayScale = scale;
    const means = extra['moyens'];
    if (!means || typeof means !== 'object') return;
    const m = means as Record<string, unknown>;
    const pompiers = typeof m['pompiers'] === 'number' ? (m['pompiers'] as number) : -1;
    const samu = typeof m['samu'] === 'number' ? (m['samu'] as number) : -1;
    if (pompiers >= 0) {
      t.maxPompiers = Math.max(1, Math.min(4, Math.round(pompiers)));
      this.dispatcher.external.pompiers = pompiers < 1;
    }
    if (samu >= 0) {
      t.maxSamu = Math.max(1, Math.min(4, Math.round(samu)));
      this.dispatcher.external.samu = samu < 1;
    }
    if (m['secours_sur_appel'] !== false) return;
    // secours sur place : un engin et une ambulance stationnent derrière le dispositif (bible §G.3 : 100 à 200 m)
    const cx = config.x ?? 0;
    const cz = config.z ?? 0;
    const forced = extra['rescue.staging'] as { x?: number; z?: number } | undefined;
    const kinds: RescueKind[] = [];
    if (pompiers !== 0) kinds.push('pompiers');
    if (samu !== 0) kinds.push('samu');
    for (let i = 0; i < kinds.length; i++) {
      const o = this.stagingOut;
      if (forced && typeof forced.x === 'number' && typeof forced.z === 'number') {
        o.x = forced.x + i * 9;
        o.z = forced.z;
        o.heading = Math.atan2(cx - o.x, cz - o.z);
      } else if (!this.spawner.pickOrigin(cx, cz, o, 150 + i * 25)) {
        continue;
      }
      this.dispatcher.stage(kinds[i], o.x, o.z, o.heading);
    }
  }

  reset(): void {
    const k = this.kernel;
    k.rng = k.ctx.rng.fork('rescue');
    k.calls.length = 0;
    k.crews.length = 0;
    k.pendingSamu.length = 0;
    Object.assign(k.tuning, DEFAULT_TUNING);
    this.records.clear();
    this.safety.reset();
    this.spawner.reset();
    this.dispatcher.reset();
    this.player.reset();
    if (k.care) k.care.reset();
  }

  update(dt: number): void {
    this.kernel.care.holdPatients();
    this.dispatcher.update(dt);
    this.player.update(dt);
  }
}
