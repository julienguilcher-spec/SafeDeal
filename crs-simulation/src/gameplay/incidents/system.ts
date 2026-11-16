/* =====================================================================================
 * INCIDENTS — système (ordre RULES) : publie EXT.incidents (IncidentsApi), le journal
 * « incidents.records » et les réglages « incidents.tuning ».
 *
 * À chaque pas : détection (événements en attente, parcours par tranches du monde), réexamen des
 * incidents actifs (deux fois par seconde chacun), liaison avec les appels de secours, attribution
 * au joueur exécutant, annonces radio, retrait des incidents clos de la liste publiée.
 * ===================================================================================== */

import type { EntityId, EntityKind, GameContext, GameSystem } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Incident, IncidentKind, IncidentMeans, IncidentsApi } from '@/core/extensions';
import { INCIDENTS_RECORDS_SERVICE, INCIDENTS_SYSTEM_ID, INCIDENTS_TUNING_SERVICE } from './api';
import { Assigner } from './assign';
import { Detector } from './detect';
import { PlayerDesk } from './dispatch';
import { Kernel } from './kernel';
import { Sense } from './sense';
import { Thinker } from './think';

export class IncidentsSystem implements GameSystem {
  readonly id = INCIDENTS_SYSTEM_ID;
  readonly order = SystemOrder.RULES;

  readonly kernel = new Kernel();
  private readonly sense = new Sense(this.kernel);
  private readonly thinker = new Thinker(this.kernel, this.sense);
  private readonly assigner = new Assigner(this.kernel, this.sense);
  private readonly desk = new PlayerDesk(this.kernel, this.assigner);
  private readonly detector = new Detector(this.kernel, this.sense, this.thinker);
  readonly api: IncidentsApi;

  constructor() {
    const k = this.kernel;
    const assigner = this.assigner;
    this.thinker.assigner = assigner;
    assigner.desk = this.desk;
    this.api = {
      list: k.entries,
      get: (id: number): Incident | undefined => k.byId.get(id),
      open: (kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency?: 1 | 2 | 3): Incident =>
        k.open(kind, x, z, targetKind, targetId, urgency ?? 0, true),
      assign: (id: number, means: IncidentMeans, squadId?: number): boolean => assigner.assign(id, means, squadId ?? 0),
      unassign: (id: number): void => assigner.unassign(id),
      close: (id: number, resolved: boolean, byId: EntityId): void => {
        const e = k.byId.get(id);
        if (e) k.close(e, resolved, byId);
      },
      nearest: (x: number, z: number, radius: number, kind?: IncidentKind): Incident | null => {
        const entries = k.entries;
        let best: Incident | null = null;
        let bestD = radius * radius;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (e.state !== 'ouvert' || (kind !== undefined && e.kind !== kind)) continue;
          const dx = e.x - x;
          const dz = e.z - z;
          const d = dx * dx + dz * dz;
          if (d <= bestD) {
            bestD = d;
            best = e;
          }
        }
        return best;
      },
      get playerIncidentId(): number {
        return k.playerIncidentId;
      },
    };
  }

  provide(ctx: GameContext): void {
    const k = this.kernel;
    k.bind(ctx);
    ctx.provide(EXT.incidents, this.api);
    ctx.provide(INCIDENTS_RECORDS_SERVICE, k.records);
    ctx.provide(INCIDENTS_TUNING_SERVICE, k.tuning);
  }

  init(ctx: GameContext): void {
    this.detector.init();
    this.assigner.init();
    ctx.events.on('session:started', (e) => this.configure(e.config.extra));
  }

  /** Réglages de session (SessionConfig.extra). */
  private configure(extra: Record<string, unknown> | undefined): void {
    const t = this.kernel.tuning;
    if (!extra) return;
    if (extra['incidents.detection'] === false) t.detection = false;
    if (extra['incidents.dispatch'] === false) t.autoDispatch = false;
  }

  reset(): void {
    const k = this.kernel;
    k.reset();
    this.detector.reset();
    this.assigner.reset();
    this.desk.reset();
  }

  update(_dt: number): void {
    const k = this.kernel;
    k.radio.enabled = k.tuning.radio;
    this.detector.update();
    this.thinker.update();
    this.assigner.pollRescue();
    this.desk.update();
    k.radio.update(k.now);
    k.prune();
  }
}
